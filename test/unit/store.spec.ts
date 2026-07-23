/*
 * Copyright (c) 2023.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { AbstractStore, Store } from '../../src';

describe('src/store', () => {
    it('should return whole data on exact-name match', () => {
        const store = new Store();
        store.add({ name: 'server', data: { core: { host: '1.1.1.1', port: 4010 } } });

        expect(store.getSync('server')).toEqual({ core: { host: '1.1.1.1', port: 4010 } });
    });

    it('should resolve a prefix match with dot-aware remainder', () => {
        const store = new Store();
        store.add({ name: 'server', data: { core: { host: '1.1.1.1', port: 4010 } } });

        expect(store.getSync('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
        expect(store.getSync<string>('server.core.host')).toEqual('1.1.1.1');
    });

    it('should resolve a prefix match without a dot boundary', () => {
        const store = new Store();
        store.add({ name: 'ba', data: { r: { x: 1 } } });

        // 'bar' starts with 'ba', remainder ('r') has no leading dot.
        expect(store.getSync('bar')).toEqual({ x: 1 });
    });

    it('should skip non-matching elements', () => {
        const store = new Store();
        store.add({ name: 'server', data: { core: { port: 4010 } } });
        store.add({ name: 'client', data: { web: { port: 4000 } } });

        expect(store.getSync('client.web')).toEqual({ port: 4000 });
    });

    it('should return undefined for a missing key', () => {
        const store = new Store();
        store.add({ name: 'server', data: { core: { port: 4010 } } });

        expect(store.getSync('server.nonexistent')).toBeUndefined();
    });

    it('should let an empty-name element answer a full key path', () => {
        const store = new Store();
        store.add({ name: '', data: { app: { key: 'value' } } });

        expect(store.getSync('app')).toEqual({ key: 'value' });
        expect(store.getSync<string>('app.key')).toEqual('value');
    });

    it('should merge every empty-name element for an empty key', () => {
        const store = new Store();
        store.add({ name: 'named', data: { a: 1 } });

        // key.length === 0 → the whole element data is taken.
        expect(store.getSync('')).toEqual({ a: 1 });
    });

    it('should resolve wildcard segments and merge the matches', () => {
        const store = new Store();
        store.add({
            name: 'w',
            data: { services: { a: { port: 1 }, b: { host: 'h' } } },
        });

        expect(store.getSync('w.services.*')).toEqual({ port: 1, host: 'h' });
    });

    it('should deep-merge object matches across elements', () => {
        const store = new Store();
        store.add({ name: '', data: { db: { host: '127.0.0.1', user: 'admin' } } });
        store.add({ name: '', data: { db: { database: 'app' } } });

        expect(store.getSync('db')).toEqual({
            host: '127.0.0.1',
            user: 'admin',
            database: 'app',
        });
    });

    it('should let later keys win for scalars in a multi-key get', () => {
        const store = new Store();
        store.add({ name: 'x', data: { val: 1 } });
        store.add({ name: 'y', data: { val: 2 } });

        expect(store.getSync(['x.val', 'y.val'])).toBe(2);
    });

    it('should keep the accumulator when a later key is undefined', () => {
        const store = new Store();
        store.add({ name: 'x', data: { val: 1 } });

        expect(store.getSync(['x.val', 'nonexistent'])).toBe(1);
    });

    it('should use the injected merge function for object matches', () => {
        let called = false;
        const store = new Store({
            mergeFn: (target, source) => {
                called = true;
                return { ...source, ...target };
            },
        });
        store.add({ name: '', data: { db: { host: 'a' } } });
        store.add({ name: '', data: { db: { host: 'b', extra: 1 } } });

        const db = store.getSync<Record<string, unknown>>('db');

        expect(called).toBe(true);
        expect(db).toBeDefined();
        expect(db).toHaveProperty('extra', 1);
    });

    it('should sort lazily and resolve order-independently', () => {
        const first = new Store();
        first.add({ name: 'client', data: { v: 'c' } });
        first.add({ name: 'server', data: { v: 's' } });

        const second = new Store();
        second.add({ name: 'server', data: { v: 's' } });
        second.add({ name: 'client', data: { v: 'c' } });

        // Two getSync() calls exercise the "already sorted" fast path on the second.
        expect(first.getSync('server')).toEqual(second.getSync('server'));
        expect(first.getSync('client')).toEqual(second.getSync('client'));
    });

    it('should throw from the async get() — an in-memory store is synchronous', async () => {
        const store = new Store();

        await expect(store.get('server')).rejects.toThrow(/asynchronous/);
    });
});

class AsyncOnlyStore extends AbstractStore {
    add() : void {
        // no-op: this fixture only serves the async variant
    }

    override async get<T = any>() : Promise<T | undefined> {
        return 'async-value' as T;
    }
}

describe('src/store AbstractStore', () => {
    it('should throw from an unimplemented synchronous getSync()', () => {
        const store = new AsyncOnlyStore();

        expect(() => store.getSync('server')).toThrow(/synchronous/);
    });

    it('should serve the variant a store does implement', async () => {
        const store = new AsyncOnlyStore();

        await expect(store.get('server')).resolves.toEqual('async-value');
    });
});
