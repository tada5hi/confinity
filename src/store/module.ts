/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expandPath, getPathInfo } from 'pathtrace';
import { createMerger, isObject } from 'smob';
import { ElementError } from '../errors';
import type { Element, MergeFn } from '../types';
import type { IStore, Resolution, StoreOptions } from './types';

/**
 * `isObject` is also true for `Date`s, class instances and other exotics, which
 * must be carried through a copy by reference rather than rebuilt as a bag of
 * own properties.
 */
function isPlainObject(input: unknown) : input is Record<string, unknown> {
    if (!isObject(input)) {
        return false;
    }

    const prototype = Object.getPrototypeOf(input);

    return prototype === null || prototype === Object.prototype;
}

/**
 * Default in-memory {@see IStore} implementation. Owns the element array, its
 * lazy sort, key↔name matching, path resolution (via pathtrace), and merge
 * precedence.
 *
 * **No reference into a stored element ever escapes.** Every value leaving the
 * store is copied on its way out, so neither a caller mutating a result nor a
 * custom `mergeFn` writing into its arguments can corrupt loaded config or make
 * a repeated read return a different answer.
 */
export class Store implements IStore {
    protected items : Element[];

    protected itemsSorted : boolean;

    protected readonly mergeFn : MergeFn;

    constructor(options: StoreOptions = {}) {
        this.items = [];
        this.itemsSorted = true;
        this.mergeFn = options.mergeFn ?? createMerger({
            array: false,
            inPlace: false,
        });
    }

    add(element: Element) : void {
        if (!isObject(element)) {
            throw new ElementError('An element must be an object.');
        }

        if (typeof element.name !== 'string') {
            throw new ElementError('The property "name" of an element must be a string.');
        }

        if (!isObject(element.data)) {
            throw new ElementError(
                `The property "data" of the element "${element.name}" must be an object.`,
            );
        }

        this.items.push(element);
        this.itemsSorted = false;
    }

    /**
     * Drop every element. On a filesystem store this also clears the loaded
     * marker, so a subsequent load starts from scratch.
     */
    reset() : void {
        this.items = [];
        this.itemsSorted = true;
    }

    /**
     * Every stored element, sorted by name — provenance and diagnostics.
     * Detached from the store: mutating the result changes nothing.
     */
    elements() : readonly Element[] {
        this.sort();

        return this.items.map((item) => ({
            ...item,
            data: this.copy(item.data) as Record<string, unknown>,
        }));
    }

    /**
     * Whether any element contributes a value for the key.
     *
     * Distinguishes "explicitly configured as `false`/`null`" from "not
     * configured at all", which a `getSync` result alone cannot express. Reads
     * what is currently loaded — like {@see getSync}, it never loads.
     */
    has(key: string) : boolean {
        return this.resolve(key).exists;
    }

    getSync<T = unknown>(key: string) : T | undefined {
        return this.resolve(key).value as T | undefined;
    }

    /**
     * Asynchronous read. An in-memory store has nothing to await, so this is
     * simply the resolved {@see getSync}; a store that must load first (see
     * `FSStore`) overrides it.
     */
    async get<T = unknown>(key: string) : Promise<T | undefined> {
        return this.getSync<T>(key);
    }

    /**
     * Collect every element's contribution for a key and merge them into one
     * value. Shared by {@see getSync} and {@see has} so the two can never
     * disagree about whether a key exists.
     */
    protected resolve(key: string) : Resolution {
        this.sort();

        let exists = false;
        let value : unknown;

        const contribute = (input: unknown) => {
            value = this.merge(input, value);
            exists = true;
        };

        for (const item of this.items) {
            if (key.length === 0) {
                // Whole-store read: namespaces are ignored, every element
                // contributes its data as-is.
                contribute(item.data);
                continue;
            }

            if (item.name.length === 0) {
                // Root element — the whole key is resolved inside it.
                this.resolveIn(item.data, key, contribute);
                continue;
            }

            if (key === item.name) {
                contribute(item.data);
                continue;
            }

            // The dot is part of the comparison, so element `server` answers
            // `server.port` but never `serverless.port`.
            if (key.startsWith(`${item.name}.`)) {
                this.resolveIn(item.data, key.substring(item.name.length + 1), contribute);
                continue;
            }

            // The element sits *below* the requested key (element `server.core`
            // for `get('server')`), so it contributes nested under the segments
            // of its name that the key did not consume.
            if (item.name.startsWith(`${key}.`)) {
                const segments = item.name.substring(key.length + 1).split('.');
                contribute(this.nest(segments, item.data));
            }
        }

        return { exists, value };
    }

    /**
     * Resolve a (possibly wildcarded) path within one element's data.
     */
    protected resolveIn(
        data: Record<string, unknown>,
        path: string,
        contribute: (value: unknown) => void,
    ) : void {
        const paths = expandPath(data, path);
        for (const expandedPath of paths) {
            const info = getPathInfo(data, expandedPath);
            if (info.exists) {
                contribute(info.value);
            }
        }
    }

    /**
     * Wrap a value in the given path segments, outermost first.
     */
    protected nest(segments: string[], value: unknown) : unknown {
        let output = value;

        for (const segment of [...segments].reverse()) {
            output = { [segment]: output };
        }

        return output;
    }

    protected sort() : void {
        if (this.itemsSorted) {
            return;
        }

        // Code-unit order, not localeCompare — merge precedence must not depend
        // on the ambient ICU locale. The sort is stable, so elements with the
        // same name keep insertion order and the later one wins.
        this.items.sort((a, b) => {
            if (a.name < b.name) {
                return -1;
            }

            if (a.name > b.name) {
                return 1;
            }

            return 0;
        });

        this.itemsSorted = true;
    }

    protected merge(primary: unknown | undefined, secondary: unknown) : unknown {
        if (typeof primary === 'undefined') {
            return secondary;
        }

        // `primary` is the only argument that can still alias stored data —
        // `secondary` is an accumulator this call chain already owns.
        const value = this.copy(primary);

        if (
            isObject(value) &&
            isObject(secondary)
        ) {
            return this.mergeFn(
                value as Record<string, unknown>,
                secondary as Record<string, unknown>,
            );
        }

        return value;
    }

    /**
     * Structural copy of plain objects and arrays. Everything else — including
     * `Date`s, class instances and the functions a `.ts`/`.mjs` config may
     * legitimately export — is carried through by reference.
     *
     * `seen` maps each original to its copy, so a self-referencing config (which
     * a module config may well be) is copied with its cycles intact instead of
     * recursing until the stack runs out.
     */
    protected copy(value: unknown, seen: Map<object, unknown> = new Map()) : unknown {
        if (Array.isArray(value)) {
            if (seen.has(value)) {
                return seen.get(value);
            }

            const output : unknown[] = [];
            seen.set(value, output);
            for (const item of value) {
                output.push(this.copy(item, seen));
            }

            return output;
        }

        if (isPlainObject(value)) {
            if (seen.has(value)) {
                return seen.get(value);
            }

            const output : Record<string, unknown> = {};
            seen.set(value, output);
            for (const [key, item] of Object.entries(value)) {
                output[key] = this.copy(item, seen);
            }

            return output;
        }

        return value;
    }
}
