/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IStore } from './store';

/**
 * A read-only view over a single {@see IStore}.
 *
 * Wrap a store (e.g. an {@see FSStore} you have already loaded) to hand
 * consumers dotted-path lookups without exposing the loading or mutation
 * surface — `load`/`loadFile`/`add` stay on the store itself.
 */
export class Container {
    protected readonly store : IStore;

    constructor(store: IStore) {
        this.store = store;
    }

    get<T = any>(key: string | string[]) : T | undefined {
        return this.store.get<T>(key);
    }

    getAsync<T = any>(key: string | string[]) : Promise<T | undefined> {
        return this.store.getAsync<T>(key);
    }
}
