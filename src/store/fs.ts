/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    buildFilePath,
    isModuleRecord,
    locateMany,
    locateManySync,
    read as readFile,
    readSync as readFileSync,
} from 'locter';
import type { LocatorInfo } from 'locter';
import path from 'node:path';
import { isObject } from 'smob';
import { LoadError } from '../errors';
import { NamingScheme } from '../naming';
import type { INamingScheme } from '../naming';
import type { Element } from '../types';
import { DEFAULT_EXTENSIONS } from './constants';
import { Store } from './module';
import type {
    FSStoreOptions, 
    LoadErrorMode, 
    Reader, 
    ReaderSync,
} from './types';

/**
 * Own keys that would let parsed config reach an object's prototype once the
 * value is spread or assigned downstream.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function normalizeExtensions(input?: string[]) : string[] {
    // Only an omitted option falls back to the defaults. An explicitly empty
    // array is a mistake worth reporting (the naming scheme rejects it), never a
    // silent request for "everything, including the executable formats".
    if (typeof input === 'undefined') {
        return [...DEFAULT_EXTENSIONS];
    }

    return input.map((extension) => (
        extension.startsWith('.') ?
            extension.substring(1) :
            extension
    ));
}

/**
 * Strip prototype-reaching keys and detach the result from whatever the reader
 * returned. Descends into plain objects and arrays only, so functions, `Date`s
 * and class instances exported by a `.ts`/`.mjs` config survive intact.
 */
function sanitize(input: unknown, seen: Map<object, unknown> = new Map()) : unknown {
    if (Array.isArray(input)) {
        if (seen.has(input)) {
            return seen.get(input);
        }

        const output : unknown[] = [];
        seen.set(input, output);
        for (const item of input) {
            output.push(sanitize(item, seen));
        }

        return output;
    }

    if (!isObject(input)) {
        return input;
    }

    if (seen.has(input)) {
        return seen.get(input);
    }

    const prototype = Object.getPrototypeOf(input);
    if (
        prototype !== null &&
        prototype !== Object.prototype
    ) {
        return input;
    }

    const output : Record<string, unknown> = {};
    seen.set(input, output);

    for (const [key, value] of Object.entries(input)) {
        if (UNSAFE_KEYS.has(key)) {
            continue;
        }

        output[key] = sanitize(value, seen);
    }

    return output;
}

function compareFilePaths(a: string, b: string) : number {
    if (a < b) {
        return -1;
    }

    if (a > b) {
        return 1;
    }

    return 0;
}

/**
 * A {@see Store} that can populate itself from the filesystem. Adds `load` and
 * `loadFile` (plus their synchronous twins `loadSync`/`loadFileSync`) on top of
 * the in-memory store, owning directory resolution, glob discovery (via the
 * {@see INamingScheme}), parsing (incl. the module `.default` unwrap and the
 * non-object skip), and parallel loads. Parsing is a swappable port — a
 * {@see Reader} for the async path (default locter `read`) and a
 * {@see ReaderSync} for the sync path (default locter `readSync`).
 *
 * Every loader **returns the file paths it actually loaded**, so "found
 * nothing" is distinguishable from "loaded successfully" — the failure mode a
 * mistyped config directory otherwise hides.
 *
 * Loading is **idempotent**: an element is keyed by its source path, so loading
 * the same file twice (or the same directory by two names, or racing a lazy
 * `get` against an explicit `load`) refreshes that element rather than adding a
 * duplicate. Call {@see reset} to start over.
 *
 * The async and sync load paths share every pure step — directory/path
 * resolution ({@see resolveDirectories}/{@see resolveFilePath}) and element
 * derivation ({@see toElement}) — and differ only at the two I/O calls
 * (`locateMany`/`read` vs `locateManySync`/`readSync`).
 */
export class FSStore extends Store {
    protected readonly cwd : string;

    protected readonly naming : INamingScheme;

    protected readonly reader : Reader;

    protected readonly readerSync : ReaderSync;

    protected readonly onError : LoadErrorMode;

    protected loaded : boolean;

    protected loading : Promise<void> | undefined;

    constructor(options: FSStoreOptions = {}) {
        super({ mergeFn: options.mergeFn });

        this.cwd = options.cwd || process.cwd();
        this.naming = options.naming ?? new NamingScheme({
            prefix: options.prefix,
            suffix: options.suffix,
            extensions: normalizeExtensions(options.extensions),
        });
        this.reader = options.read ?? readFile;
        this.readerSync = options.readSync ?? readFileSync;
        this.onError = options.onError ?? 'throw';
        this.loaded = false;
        this.loading = undefined;
    }

    /**
     * Resolve a key, lazily loading from the filesystem on the first call.
     *
     * The default load runs at most once and is shared across concurrent
     * callers; if config was already loaded (eagerly, or by a previous call) it
     * is not re-loaded. A load that *fails* is not memoized — the next call
     * retries rather than replaying the stale error forever.
     *
     * @param key
     */
    override async get<T = unknown>(key: string) : Promise<T | undefined> {
        if (!this.loaded) {
            if (!this.loading) {
                this.loading = this.load().then(
                    () => {
                        this.loading = undefined;
                    },
                    (error) => {
                        this.loading = undefined;
                        throw error;
                    },
                );
            }

            await this.loading;
        }

        return this.getSync<T>(key);
    }

    /**
     * Discover, parse and store config files from one or many directories
     * (defaults to the configured cwd; an explicitly empty array means no
     * directories at all).
     *
     * @param input
     * @returns the absolute paths of the files that were loaded — empty when
     *          nothing matched, which is the only signal that a directory was
     *          mistyped or holds no config.
     */
    async load(input?: string | string[]) : Promise<string[]> {
        return this.addAll(await this.fromDirectories(input));
    }

    /**
     * Synchronous twin of {@see load}. Unlike `get`, `getSync` does not trigger
     * this lazily — call it explicitly before a synchronous read.
     *
     * @param input
     */
    loadSync(input?: string | string[]) : string[] {
        return this.addAll(this.fromDirectoriesSync(input));
    }

    /**
     * Parse and store specific file(s), deriving each name via the NamingScheme.
     *
     * @param input
     */
    async loadFile(input: string | string[]) : Promise<string[]> {
        return this.addAll(await this.fromFiles(input));
    }

    /**
     * Synchronous twin of {@see loadFile}.
     *
     * @param input
     */
    loadFileSync(input: string | string[]) : string[] {
        return this.addAll(this.fromFilesSync(input));
    }

    /**
     * Drop every element and forget that anything was loaded, so the next
     * `load` (or a lazy `get`) reads the filesystem again.
     */
    override reset() : void {
        super.reset();

        this.loaded = false;
        this.loading = undefined;
    }

    /**
     * Add each element — replacing any element already loaded from the same
     * file — and mark the store loaded.
     */
    protected addAll(elements: Element[]) : string[] {
        const sources : string[] = [];

        for (const element of elements) {
            const index = element.source ?
                this.items.findIndex((item) => item.source === element.source) :
                -1;

            if (index === -1) {
                this.add(element);
            } else {
                this.items.splice(index, 1, element);
                this.itemsSorted = false;
            }

            if (element.source) {
                sources.push(element.source);
            }
        }

        this.loaded = true;

        return sources;
    }

    protected async fromDirectories(input?: string | string[]) : Promise<Element[]> {
        const directories = this.resolveDirectories(input);
        if (directories.length === 0) {
            return [];
        }

        return this.fromFiles(await this.findFiles(directories));
    }

    protected fromDirectoriesSync(input?: string | string[]) : Element[] {
        const directories = this.resolveDirectories(input);
        if (directories.length === 0) {
            return [];
        }

        return this.fromFilesSync(this.findFilesSync(directories));
    }

    protected async fromFiles(input: string | string[]) : Promise<Element[]> {
        const filePaths = this.resolveFilePaths(input);

        // Every file is read before the first failure is raised, so which error
        // surfaces depends on input order rather than on which read lost a race.
        const outcomes = await Promise.all(
            filePaths.map(async (filePath) => {
                try {
                    return {
                        filePath, 
                        value: await this.reader(filePath), 
                        error: undefined, 
                    };
                } catch (error) {
                    return {
                        filePath, 
                        value: undefined, 
                        error, 
                    };
                }
            }),
        );

        const elements : Element[] = [];
        for (const outcome of outcomes) {
            if (typeof outcome.error !== 'undefined') {
                if (this.onError === 'skip') {
                    continue;
                }

                throw new LoadError(outcome.filePath, { cause: outcome.error });
            }

            const element = this.toElement(outcome.filePath, outcome.value);
            if (element) {
                elements.push(element);
            }
        }

        return elements;
    }

    protected fromFilesSync(input: string | string[]) : Element[] {
        const elements : Element[] = [];

        for (const filePath of this.resolveFilePaths(input)) {
            let raw : unknown;

            try {
                raw = this.readerSync(filePath);
            } catch (error) {
                if (this.onError === 'skip') {
                    continue;
                }

                throw new LoadError(filePath, { cause: error });
            }

            const element = this.toElement(filePath, raw);
            if (element) {
                elements.push(element);
            }
        }

        return elements;
    }

    protected async findFiles(directories: string[]) : Promise<string[]> {
        const patterns = this.naming.toPatterns();

        return this.toFilePaths(await Promise.all(
            directories.map((directory) => locateMany(patterns, {
                cwd: directory,
                onlyFiles: true,
            })),
        ));
    }

    protected findFilesSync(directories: string[]) : string[] {
        const patterns = this.naming.toPatterns();

        return this.toFilePaths(
            directories.map((directory) => locateManySync(patterns, {
                cwd: directory,
                onlyFiles: true,
            })),
        );
    }

    /**
     * Flatten per-directory discovery results into a deterministic, duplicate-free
     * path list: directories keep the order they were given, files within one
     * directory are ordered by path, and a file reachable from two directories is
     * loaded once, at its first occurrence. Pure.
     */
    protected toFilePaths(results: LocatorInfo[][]) : string[] {
        const output : string[] = [];
        const seen = new Set<string>();

        for (const locations of results) {
            const filePaths = locations
                .map((location) => buildFilePath(location))
                .sort(compareFilePaths);

            for (const filePath of filePaths) {
                if (!seen.has(filePath)) {
                    seen.add(filePath);
                    output.push(filePath);
                }
            }
        }

        return output;
    }

    /**
     * Resolve the load input to a concrete list of directories: each relative
     * entry against `cwd`, absolutes untouched, duplicates removed. An omitted
     * input falls back to `cwd`; an explicitly empty array means no directories.
     * Pure — shared by the async and sync discovery paths.
     */
    protected resolveDirectories(input?: string | string[]) : string[] {
        if (typeof input === 'undefined') {
            return [this.cwd];
        }

        const directories = Array.isArray(input) ? input : [input];

        return [...new Set(
            directories.map((directory) => (
                path.isAbsolute(directory) ?
                    directory :
                    path.resolve(this.cwd, directory)
            )),
        )];
    }

    /**
     * Resolve a single file path against `cwd` (absolutes untouched). Pure —
     * shared by both file paths.
     */
    protected resolveFilePath(input: string) : string {
        return path.isAbsolute(input) ?
            input :
            path.resolve(this.cwd, input);
    }

    /**
     * Resolve the file input to a deduplicated, order-preserving path list. Pure.
     */
    protected resolveFilePaths(input: string | string[]) : string[] {
        const inputs = Array.isArray(input) ? input : [input];

        return [...new Set(inputs.map((item) => this.resolveFilePath(item)))];
    }

    /**
     * Turn a parsed file value into an {@see Element}: unwrap a module export,
     * skip anything that is not an object, strip prototype-reaching keys, and
     * derive the name via the NamingScheme. Pure — shared by both file paths.
     */
    protected toElement(filePath: string, raw: unknown) : Element | undefined {
        // Ask locter whether this came from a module rather than guessing from
        // the presence of a `default` key — a `.yml`/`.conf`/`.json` config is
        // entitled to a top-level `default:` of its own.
        const data = isModuleRecord(raw) ?
            (raw as Record<string, unknown>).default :
            raw;

        if (!isObject(data)) {
            return undefined;
        }

        return {
            data: sanitize(data) as Record<string, unknown>,
            name: this.naming.toName(filePath),
            source: filePath,
        };
    }
}
