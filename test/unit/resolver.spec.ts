/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Resolver } from '../../src';
import type { Element } from '../../src';

describe('src/resolver', () => {
    describe('key <-> name matching', () => {
        it('should return the whole data on an exact name match', () => {
            const resolver = new Resolver();
            resolver.add({ name: 'server', data: { host: '1.1.1.1', port: 4000 } });

            expect(resolver.get('server')).toEqual({ host: '1.1.1.1', port: 4000 });
        });

        it('should resolve the remainder on a prefix match', () => {
            const resolver = new Resolver();
            resolver.add({ name: 'server', data: { core: { port: 4010 } } });

            expect(resolver.get('server.core')).toEqual({ port: 4010 });
        });

        it('should resolve the full key against an empty-name element', () => {
            const resolver = new Resolver();
            resolver.add({ name: '', data: { db: { host: '127.0.0.1' } } });

            expect(resolver.get('db.host')).toEqual('127.0.0.1');
            expect(resolver.get('db')).toEqual({ host: '127.0.0.1' });
        });

        it('should match a prefix even without a dot boundary', () => {
            const resolver = new Resolver();
            resolver.add({ name: 'ser', data: { ver: { x: 1 } } });

            // 'server' starts with 'ser'; the remainder 'ver' is looked up in data.
            expect(resolver.get('server')).toEqual({ x: 1 });
        });

        it('should return the whole data of named elements for an empty key', () => {
            const resolver = new Resolver();
            resolver.add({ name: 'server', data: { a: 1 } });

            expect(resolver.get('')).toEqual({ a: 1 });
        });

        it('should skip elements whose name does not match', () => {
            const resolver = new Resolver();
            resolver.add({ name: 'server', data: { core: { port: 1 } } });

            expect(resolver.get('client')).toBeUndefined();
        });

        it('should return undefined when a path does not exist', () => {
            const resolver = new Resolver();
            resolver.add({ name: 'server', data: { core: { port: 1 } } });

            expect(resolver.get('server.missing')).toBeUndefined();
        });
    });

    describe('path resolution', () => {
        it('should merge objects resolved via a wildcard segment', () => {
            const resolver = new Resolver();
            resolver.add({
                name: '',
                data: { db: { primary: { host: 'a' }, replica: { user: 'b' } } },
            });

            expect(resolver.get('db.*')).toEqual({ host: 'a', user: 'b' });
        });

        it('should keep the last match for scalars resolved via a wildcard', () => {
            const resolver = new Resolver();
            resolver.add({
                name: '',
                data: { services: { a: { port: 1 }, b: { port: 2 } } },
            });

            expect(resolver.get('services.*.port')).toEqual(2);
        });
    });

    describe('multi-key get', () => {
        it('should merge the results of every key', () => {
            const resolver = new Resolver();
            resolver.add({
                name: '',
                data: {
                    a: { host: '1.1.1.1', shared: 'first' },
                    b: { user: 'admin', shared: 'second' },
                },
            });

            expect(resolver.get(['a', 'b'])).toEqual({
                host: '1.1.1.1',
                user: 'admin',
                shared: 'second',
            });
        });

        it('should let later keys win for scalars', () => {
            const resolver = new Resolver();
            resolver.add({ name: '', data: { a: 'first', b: 'second' } });

            expect(resolver.get(['a', 'b'])).toEqual('second');
            expect(resolver.get(['b', 'a'])).toEqual('first');
        });

        it('should keep the accumulator when a later key resolves nothing', () => {
            const resolver = new Resolver();
            resolver.add({ name: '', data: { a: 1 } });

            expect(resolver.get(['a', 'missing'])).toEqual(1);
        });
    });

    describe('merge precedence', () => {
        it('should deep-merge two objects with the injected mergeFn', () => {
            let calls = 0;
            const resolver = new Resolver({
                mergeFn: (target, source) => {
                    calls++;
                    return { ...source, ...target };
                },
            });
            resolver.add({ name: '', data: { a: { x: 1 } } });
            resolver.add({ name: '', data: { a: { y: 2 } } });

            expect(resolver.get('a')).toEqual({ x: 1, y: 2 });
            expect(calls).toEqual(1);
        });

        it('should let the most-recently-resolved scalar win over an object', () => {
            const resolver = new Resolver();
            resolver.add({ name: '', data: { val: { deep: 1 } } });
            resolver.add({ name: '', data: { val: 'scalar' } });

            expect(resolver.get('val')).toEqual('scalar');
        });

        it('should let a most-recently-resolved object win over a scalar', () => {
            const resolver = new Resolver();
            resolver.add({ name: '', data: { val: 'scalar' } });
            resolver.add({ name: '', data: { val: { deep: 1 } } });

            expect(resolver.get('val')).toEqual({ deep: 1 });
        });
    });

    describe('lazy sort', () => {
        it('should produce results independent of add order', () => {
            const elements : Element[] = [
                { name: 'server', data: { core: { port: 1 } } },
                { name: 'server.core', data: { port: 2 } },
            ];

            const resolve = (order: Element[]) => {
                const resolver = new Resolver();
                order.forEach((element) => resolver.add(element));
                return resolver.get('server.core');
            };

            // Sorted iteration ('server' before 'server.core') is deterministic,
            // so both add orders yield the same merged result.
            expect(resolve(elements)).toEqual(resolve([...elements].reverse()));
            expect(resolve(elements)).toEqual({ port: 2 });
        });

        it('should re-sort after an add between two get calls', () => {
            const resolver = new Resolver();
            resolver.add({ name: 'a', data: { v: 1 } });

            expect(resolver.get('a')).toEqual({ v: 1 });

            resolver.add({ name: 'b', data: { v: 2 } });

            expect(resolver.get('b')).toEqual({ v: 2 });
        });
    });
});
