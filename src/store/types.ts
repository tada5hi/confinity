/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { INamingScheme } from '../naming';
import type { Element, MergeFn } from '../types';

/**
 * Contract for the store of named config elements. An implementation owns the
 * element collection, key↔name matching, path resolution and merge precedence.
 * Wrap one in a {@see Container} to hand out a read-only view.
 *
 * Both read variants are always available: `getSync` reads what is currently
 * loaded, `get` is its asynchronous form and is the variant a store that must
 * load first can make lazy.
 */
export interface IStore {
    /**
     * Add a named config element to the store.
     */
    add(element: Element) : void;

    /**
     * Resolve a dotted key, deep-merged across all elements.
     *
     * Asynchronous read — a filesystem store lazily loads on the first call.
     */
    get<T = unknown>(key: string) : Promise<T | undefined>;

    /**
     * Resolve a dotted key, deep-merged across all elements.
     *
     * Synchronous read of whatever is currently in memory; it never loads.
     */
    getSync<T = unknown>(key: string) : T | undefined;

    /**
     * Whether any element contributes a value for the key. Synchronous, like
     * {@see getSync}.
     */
    has(key: string) : boolean;

    /**
     * Every stored element, sorted by name — provenance and diagnostics.
     */
    elements() : readonly Element[];

    /**
     * Drop every element and return the store to its unloaded state.
     */
    reset() : void;
}

/**
 * The read-only slice of {@see IStore} — what a {@see Container} needs and all
 * it is given.
 */
export type ReadableStore = Pick<IStore, 'get' | 'getSync' | 'has'>;

/**
 * The outcome of resolving one key: whether any element contributed, and the
 * merged value. Distinguishing the two is what lets `has` report a key that is
 * explicitly configured as `null` or `false`.
 */
export type Resolution = {
    exists: boolean,
    value: unknown
};

export type StoreOptions = {
    /**
     * Deep-merge strategy for two matching objects. Must be pure — see
     * {@see MergeFn}.
     */
    mergeFn?: MergeFn
};

/**
 * Minimal asynchronous reader port. Parses a file at the given path into its
 * raw value. Defaults to locter's `read`; can be substituted to unit-test the
 * fs store's naming/skip logic without touching the filesystem.
 */
export type Reader = (filePath: string) => Promise<unknown>;

/**
 * Synchronous twin of {@see Reader}, used by the store's `loadSync`/
 * `loadFileSync`. Defaults to locter's `readSync`; substitute it (like `Reader`)
 * to unit-test the sync load path without the filesystem.
 */
export type ReaderSync = (filePath: string) => unknown;

/**
 * What to do when a file cannot be read or parsed.
 *
 * - `throw` (default) — abort the load, wrapped in a `LoadError` naming the file.
 * - `skip` — leave that file out and keep the ones that did parse.
 */
export type LoadErrorMode = 'throw' | 'skip';

export type FSStoreOptions = StoreOptions & {
    cwd?: string,
    prefix?: string,
    suffix?: string,
    /**
     * File extensions to discover, without the leading dot. Omit for the
     * defaults; an empty array is rejected rather than silently restoring them.
     */
    extensions?: string[],
    /**
     * Custom naming implementation. Overrides `prefix`/`suffix`/`extensions`
     * for file discovery and name derivation.
     */
    naming?: INamingScheme,
    /**
     * Custom asynchronous reader/parser. Overrides the default (locter's `read`).
     */
    read?: Reader,
    /**
     * Custom synchronous reader/parser, used by `loadSync`/`loadFileSync`.
     * Overrides the default (locter's `readSync`).
     */
    readSync?: ReaderSync,
    /**
     * How to handle a file that cannot be read or parsed. Default: `throw`.
     */
    onError?: LoadErrorMode
};
