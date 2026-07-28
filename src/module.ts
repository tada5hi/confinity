/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ReadableStore } from './store';

/**
 * A read-only view over a single store.
 *
 * Wrap a store (e.g. an `FSStore` you have already loaded) to hand consumers
 * dotted-path lookups without exposing the loading or mutation surface —
 * `load`/`loadFile`/`add`/`reset` stay on the store itself.
 *
 * The wrapped store is held in a private field and its type is narrowed to the
 * read methods, so neither the container nor its consumers can reach back to
 * the mutable store through it.
 */
export class Container {
    readonly #store : ReadableStore;

    constructor(store: ReadableStore) {
        this.#store = store;
    }

    /**
     * Resolve a dotted key. Asynchronous — on a filesystem store this loads on
     * the first call.
     */
    get<T = unknown>(key: string) : Promise<T | undefined> {
        return this.#store.get<T>(key);
    }

    /**
     * Resolve a dotted key against what is currently loaded. Never loads.
     */
    getSync<T = unknown>(key: string) : T | undefined {
        return this.#store.getSync<T>(key);
    }

    /**
     * Whether any element contributes a value for the key. Synchronous, like
     * {@see getSync}.
     */
    has(key: string) : boolean {
        return this.#store.has(key);
    }
}
