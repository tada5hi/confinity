/*
 * Copyright (c) 2023.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createMerger } from 'smob';
import { describe, expect, it } from 'vitest';
import { ElementError, Store } from '../../src';

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

    it('should require a segment boundary to match an element name', () => {
        const store = new Store();
        store.add({ name: 'ba', data: { r: { x: 1 } } });
        store.add({ name: 'server', data: { less: { port: 1 } } });

        // 'ba' is a string prefix of 'bar', but not a path-segment prefix.
        expect(store.getSync('bar')).toBeUndefined();
        expect(store.getSync('serverless.port')).toBeUndefined();
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

    it('should merge every element for an empty key', () => {
        const store = new Store();
        store.add({ name: 'named', data: { a: 1 } });

        // key.length === 0 → the whole element data is taken, namespace ignored.
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

    it('should resolve the async get without loading', async () => {
        const store = new Store();
        store.add({ name: 'server', data: { core: { port: 4010 } } });

        await expect(store.get('server.core')).resolves.toEqual({ port: 4010 });
    });

    describe('nested elements', () => {
        it('should aggregate a child-named element under a parent key', () => {
            const store = new Store();
            store.add({ name: 'server.core', data: { host: '1.1.1.1' } });

            expect(store.getSync('server')).toEqual({ core: { host: '1.1.1.1' } });
            expect(store.getSync('server.core.host')).toEqual('1.1.1.1');
        });

        it('should nest through several name segments', () => {
            const store = new Store();
            store.add({ name: 'a.b.c', data: { v: 1 } });

            expect(store.getSync('a')).toEqual({ b: { c: { v: 1 } } });
        });

        it('should let the more specific element win over the broader one', () => {
            const store = new Store();
            store.add({ name: 'server', data: { core: { host: 'from-broad', port: 4010 } } });
            store.add({ name: 'server.core', data: { host: 'from-specific' } });

            expect(store.getSync('server')).toEqual({ core: { host: 'from-specific', port: 4010 } });
        });

        it('should require a segment boundary to aggregate', () => {
            const store = new Store();
            store.add({ name: 'serverless', data: { v: 1 } });

            expect(store.getSync('server')).toBeUndefined();
        });
    });

    describe('isolation', () => {
        it('should not write into stored data while merging', () => {
            const first = { name: 'server', data: { core: { db: { host: 'a' } } } };
            const second = { name: 'server', data: { core: { db: { port: 1 } } } };

            const store = new Store();
            store.add(first);
            store.add(second);

            expect(store.getSync('server')).toEqual({ core: { db: { port: 1, host: 'a' } } });
            expect(second.data).toEqual({ core: { db: { port: 1 } } });
            expect(first.data).toEqual({ core: { db: { host: 'a' } } });
        });

        it('should not hand out a reference into a single matching element', () => {
            const element = { name: 'x', data: { a: { b: 1 } } };

            const store = new Store();
            store.add(element);

            const value = store.getSync<Record<string, any>>('x');
            expect(value).toBeDefined();
            value!.injected = true;
            value!.a.b = 99;

            expect(element.data).toEqual({ a: { b: 1 } });
        });

        it('should stay stable across repeated reads with an accumulating merger', () => {
            const store = new Store({ mergeFn: createMerger({ array: true, inPlace: false }) as any });
            store.add({ name: 'n', data: { hosts: ['a'] } });
            store.add({ name: 'n', data: { hosts: ['b'] } });

            const first = store.getSync('n');

            expect(store.getSync('n')).toEqual(first);
            expect(store.getSync('n')).toEqual(first);
        });

        it('should carry exotic values through by reference', () => {
            const date = new Date(0);
            const fn = () => 1;

            const store = new Store();
            store.add({ name: 'x', data: { date, fn } });

            const value = store.getSync<Record<string, unknown>>('x');

            expect(value?.date).toBe(date);
            expect(value?.fn).toBe(fn);
        });

        it('should detach the elements() view from the store', () => {
            const store = new Store();
            store.add({
                name: 'x', 
                data: { a: 1 }, 
                source: '/tmp/x.conf', 
            });

            const [element] = store.elements();
            expect(element).toBeDefined();
            (element!.data as Record<string, unknown>).a = 99;

            expect(store.getSync('x')).toEqual({ a: 1 });
            expect(element!.source).toEqual('/tmp/x.conf');
        });
    });

    describe('has', () => {
        it('should distinguish a falsy configured value from an absent one', () => {
            const store = new Store();
            store.add({ name: 'server', data: { redis: false, smtp: null } });

            expect(store.has('server.redis')).toBe(true);
            expect(store.has('server.smtp')).toBe(true);
            expect(store.has('server.absent')).toBe(false);

            expect(store.getSync('server.redis')).toBe(false);
        });

        it('should report false on an empty store', () => {
            expect(new Store().has('anything')).toBe(false);
        });
    });

    // These hold because path resolution rejects unsafe segments and resolves
    // own entries only. That is pathtrace >= 2.2.1 behaviour, which is why the
    // dependency floor is a correctness requirement rather than a formality.
    describe('key resolution safety', () => {
        it('should not answer an unsafe key with the whole config', () => {
            const store = new Store();
            store.add({ name: '', data: { db: { password: 'hunter2' } } });

            expect(store.getSync('__proto__')).toBeUndefined();
            expect(store.has('__proto__')).toBe(false);
            expect(store.getSync('constructor')).toBeUndefined();
            expect(store.getSync('prototype')).toBeUndefined();
        });

        it('should not resolve a neighbouring key when a segment is unsafe', () => {
            const store = new Store();
            store.add({ name: '', data: { a: { b: 'safe' } } });

            expect(store.getSync('a.__proto__.b')).toBeUndefined();
            expect(store.getSync('a.b')).toEqual('safe');
        });

        it.each([
            ['toString'],
            ['valueOf'],
            ['hasOwnProperty'],
        ])('should not resolve the inherited member %s as config', (key) => {
            const store = new Store();
            store.add({ name: '', data: { db: { password: 'hunter2' } } });

            expect(store.getSync(`db.${key}`)).toBeUndefined();
            expect(store.has(`db.${key}`)).toBe(false);
        });

        it('should resolve an accessor declared on a prototype', () => {
            // Config exported from a `.ts`/`.mjs` module may carry class
            // instances; an accessor on the prototype must read like a field.
            const prototype = {};
            Object.defineProperty(prototype, 'derived', {
                get: () => 'computed',
                configurable: true,
            });

            const store = new Store();
            store.add({ name: '', data: { db: Object.create(prototype) } });

            expect(store.getSync('db.derived')).toEqual('computed');
            expect(store.has('db.derived')).toBe(true);
        });

        it('should still resolve ordinary keys and array entries', () => {
            const store = new Store();
            store.add({ name: '', data: { db: { password: 'hunter2' }, hosts: ['a', 'b'] } });

            expect(store.getSync('db.password')).toEqual('hunter2');
            expect(store.has('db.password')).toBe(true);
            expect(store.getSync('hosts.0')).toEqual('a');
            expect(store.has('hosts.0')).toBe(true);
            expect(store.has('hosts.5')).toBe(false);
        });
    });

    describe('add validation', () => {
        it('should reject a non-string name', () => {
            const store = new Store();

            expect(() => store.add({ name: 42 as any, data: {} })).toThrow(ElementError);
        });

        it('should reject non-object data', () => {
            const store = new Store();

            expect(() => store.add({ name: 'x', data: 'nope' as any })).toThrow(ElementError);
        });

        it('should reject a non-object element', () => {
            const store = new Store();

            expect(() => store.add(null as any)).toThrow(ElementError);
        });
    });

    describe('reset', () => {
        it('should drop every element', () => {
            const store = new Store();
            store.add({ name: 'server', data: { core: { port: 4010 } } });

            store.reset();

            expect(store.getSync('server')).toBeUndefined();
            expect(store.elements()).toHaveLength(0);
        });
    });
});
