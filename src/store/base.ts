/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Element } from '../types';
import type { IStore } from './types';

/**
 * Base for every {@see IStore}. Both read variants throw "unsupported" by
 * default; a concrete store overrides only the one(s) it can actually serve.
 * This makes a sync-only or async-only store trivial — implement one variant,
 * and the other throws automatically.
 */
export abstract class AbstractStore implements IStore {
    abstract add(element: Element) : void;

    async get<T = any>(key: string | string[]) : Promise<T | undefined> {
        throw new Error(`This store has no asynchronous get() for "${String(key)}" — use getSync().`);
    }

    getSync<T = any>(key: string | string[]) : T | undefined {
        throw new Error(`This store has no synchronous getSync() for "${String(key)}" — use get().`);
    }
}
