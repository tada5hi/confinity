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
 */
export interface IStore {
    /**
     * Add a named config element to the store.
     */
    add(element: Element) : void;

    /**
     * Resolve a dotted key (or array of keys), deep-merged across all elements.
     *
     * Asynchronous read (the default); a filesystem store lazily loads on the
     * first call. Throws if the store has no asynchronous variant (see
     * {@see AbstractStore}).
     */
    get<T = any>(key: string | string[]) : Promise<T | undefined>;

    /**
     * Resolve a dotted key (or array of keys), deep-merged across all elements.
     *
     * Synchronous read of whatever is currently in memory. Throws if the store
     * has no synchronous variant (see {@see AbstractStore}).
     */
    getSync<T = any>(key: string | string[]) : T | undefined;
}

export type StoreOptions = {
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

export type FSStoreOptions = StoreOptions & {
    cwd?: string,
    prefix?: string,
    suffix?: string,
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
    readSync?: ReaderSync
};
