/*
 * Copyright (c) 2023.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FSStore } from '../../src';
import type { INamingScheme, Reader, ReaderSync } from '../../src';

describe('src/store FSStore', () => {
    describe('reader port (no filesystem)', () => {
        it('should derive the element name via the naming scheme', async () => {
            const read : Reader = async () => ({ a: 1 });
            const store = new FSStore({
                prefix: 'project',
                cwd: '/base',
                read,
            });
            await store.loadFile('project.server.conf');

            expect(store.getSync('server')).toEqual({ a: 1 });
        });

        it('should unwrap a module default export', async () => {
            const read : Reader = async () => ({ default: { host: '1.1.1.1' }, other: 2 });
            const store = new FSStore({
                prefix: 'project',
                cwd: '/base',
                read,
            });
            await store.loadFile('project.server.conf');

            expect(store.getSync('server')).toEqual({ host: '1.1.1.1' });
        });

        it('should skip a non-object parse result', async () => {
            const read : Reader = async () => 42;
            const store = new FSStore({
                prefix: 'project',
                cwd: '/base',
                read,
            });
            await store.loadFile('project.server.conf');

            expect(store.getSync('server')).toBeUndefined();
        });

        it('should skip a non-object default export', async () => {
            const read : Reader = async () => ({ default: 5 });
            const store = new FSStore({
                prefix: 'project',
                cwd: '/base',
                read,
            });
            await store.loadFile('project.server.conf');

            expect(store.getSync('server')).toBeUndefined();
        });

        it('should skip a falsy default export (unwrap by presence, not truthiness)', async () => {
            // `export default false` must unwrap to `false` and be skipped, not
            // stored as the wrapper object `{ default: false }`.
            const read : Reader = async () => ({ default: false });
            const store = new FSStore({
                prefix: 'project',
                cwd: '/base',
                read,
            });
            await store.loadFile('project.server.conf');

            expect(store.getSync('server')).toBeUndefined();
        });

        it('should honor absolute paths and load arrays in parallel', async () => {
            const read : Reader = async (filePath) => ({ from: filePath });
            const store = new FSStore({
                prefix: 'project',
                cwd: '/base',
                read,
            });
            await store.loadFile([
                path.resolve('/abs/project.client.conf'),
                'project.server.conf',
            ]);

            // Absolute input is passed through unchanged (not re-resolved against cwd).
            expect(store.getSync('client')).toEqual({ from: path.resolve('/abs/project.client.conf') });
            expect(store.getSync('server')).toEqual({ from: path.resolve('/base/project.server.conf') });
        });
    });

    describe('friendly options + discovery against fixtures', () => {
        it('should discover prefixed files across a relative directory', async () => {
            const store = new FSStore({ prefix: 'project' });
            await store.load('test/data');

            expect(store.getSync('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
            expect(store.getSync('client.web')).toEqual({ host: '1.1.1.2', port: 4000 });
        });

        it('should default discovery to the configured cwd and skip non-object files', async () => {
            const store = new FSStore({ cwd: path.resolve('test/data') });
            // Every file is matched (no prefix/suffix); scalar.yml (42) is skipped.
            await store.load();

            expect(store.getSync<string>('project.db.host')).toEqual('127.0.0.1');
        });

        it('should normalize custom extensions (strip a leading dot)', async () => {
            const store = new FSStore({
                prefix: 'project',
                extensions: ['.yml', 'yaml'],
                cwd: 'test/data',
            });
            await store.load();

            expect(store.getSync('client.web').port).toEqual(4000);
        });

        it('should require a middle segment for a prefix+suffix pattern', async () => {
            const store = new FSStore({
                prefix: 'project',
                suffix: 'server',
                cwd: 'test/data',
            });
            await store.load();

            // project.server.conf has no middle segment → not matched.
            expect(store.getSync('project')).toBeUndefined();
        });

        it('should derive names from a suffix-only pattern', async () => {
            const store = new FSStore({ suffix: 'server', cwd: 'test/data' });
            await store.load();

            expect(store.getSync('project.core').port).toEqual(4010);
        });

        it('should use a custom merge function', async () => {
            let called = false;
            const store = new FSStore({
                prefix: 'project',
                cwd: 'test/data',
                mergeFn: (target, source) => {
                    called = true;
                    return { ...source, ...target };
                },
            });
            await store.loadFile([
                'project.conf',
                'project.server.conf',
            ]);

            expect(store.getSync(['db', 'server.db'])).toBeDefined();
            expect(called).toBe(true);
        });

        it('should accept a custom naming implementation', async () => {
            const naming : INamingScheme = {
                toPatterns: () => ['project.server.conf'],
                toName: () => 'custom',
            };
            const store = new FSStore({ naming, cwd: 'test/data' });
            await store.load();

            expect(store.getSync('custom.core.port')).toEqual(4010);
        });
    });

    describe('async / lazy loading', () => {
        it('should lazily load on the first async get() (no explicit load)', async () => {
            const store = new FSStore({ prefix: 'project', cwd: 'test/data' });

            // Sync getSync() sees nothing until something is loaded.
            expect(store.getSync('server.core')).toBeUndefined();

            expect(await store.get('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });

            // Now it is in memory, so the sync path works too.
            expect(store.getSync('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
        });

        it('should load once across concurrent async get() calls', async () => {
            let reads = 0;
            const read : Reader = async () => {
                reads += 1;
                return { ok: true };
            };
            const store = new FSStore({
                prefix: 'project',
                cwd: 'test/data',
                read,
            });

            await Promise.all([
                store.get('a'),
                store.get('b'),
            ]);

            // The 4 `project.*` fixtures are read once each — the load is not repeated.
            expect(reads).toEqual(4);
        });

        it('should not re-load when config was already loaded eagerly', async () => {
            let reads = 0;
            const read : Reader = async () => {
                reads += 1;
                return { ok: true };
            };
            const store = new FSStore({
                prefix: 'project',
                cwd: 'test/data',
                read,
            });

            await store.load();
            const afterEager = reads;

            await store.get('a');

            expect(reads).toEqual(afterEager);
        });
    });

    describe('sync loading', () => {
        it('should loadSync from a directory to parity with async load', async () => {
            const sync = new FSStore({ prefix: 'project', cwd: 'test/data' });
            sync.loadSync();

            const async = new FSStore({ prefix: 'project', cwd: 'test/data' });
            await async.load();

            // The sync and async loaders must agree on the merged result.
            expect(sync.getSync('server.core')).toEqual(async.getSync('server.core'));
            expect(sync.getSync('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
            expect(sync.getSync('client.web')).toEqual({ host: '1.1.1.2', port: 4000 });
        });

        it('should loadFileSync explicit file(s), deriving names via the scheme', () => {
            const store = new FSStore({ prefix: 'project', cwd: 'test/data' });
            store.loadFileSync([
                'project.conf',
                'project.server.conf',
            ]);

            expect(store.getSync('server.core').port).toEqual(4010);
            expect(store.getSync<string>('db.host')).toEqual('127.0.0.1');
        });

        describe('readSync port (no filesystem)', () => {
            it('should derive the element name via the naming scheme', () => {
                const readSync : ReaderSync = () => ({ a: 1 });
                const store = new FSStore({
                    prefix: 'project',
                    cwd: '/base',
                    readSync,
                });
                store.loadFileSync('project.server.conf');

                expect(store.getSync('server')).toEqual({ a: 1 });
            });

            it('should unwrap a module default export', () => {
                const readSync : ReaderSync = () => ({ default: { host: '1.1.1.1' }, other: 2 });
                const store = new FSStore({
                    prefix: 'project',
                    cwd: '/base',
                    readSync,
                });
                store.loadFileSync('project.server.conf');

                expect(store.getSync('server')).toEqual({ host: '1.1.1.1' });
            });

            it('should skip a non-object parse result', () => {
                const readSync : ReaderSync = () => 42;
                const store = new FSStore({
                    prefix: 'project',
                    cwd: '/base',
                    readSync,
                });
                store.loadFileSync('project.server.conf');

                expect(store.getSync('server')).toBeUndefined();
            });

            it('should honor absolute paths and derive names per file', () => {
                const readSync : ReaderSync = (filePath) => ({ from: filePath });
                const store = new FSStore({
                    prefix: 'project',
                    cwd: '/base',
                    readSync,
                });
                store.loadFileSync([
                    path.resolve('/abs/project.client.conf'),
                    'project.server.conf',
                ]);

                expect(store.getSync('client')).toEqual({ from: path.resolve('/abs/project.client.conf') });
                expect(store.getSync('server')).toEqual({ from: path.resolve('/base/project.server.conf') });
            });
        });

        it('should keep getSync a snapshot — no lazy sync-load before loadSync', () => {
            const store = new FSStore({ prefix: 'project', cwd: 'test/data' });

            // getSync never triggers a load itself; it reads only what is loaded.
            expect(store.getSync('server.core')).toBeUndefined();

            store.loadSync();

            expect(store.getSync('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
        });

        it('should let a later async get() honor an eager loadSync (no re-load)', async () => {
            let reads = 0;
            let asyncReads = 0;
            // An erroneous re-load from get() would go through the async `read`,
            // not `readSync` — so spy on both to actually observe no re-load.
            const read : Reader = async () => {
                asyncReads += 1;
                return { ok: true };
            };
            const readSync : ReaderSync = () => {
                reads += 1;
                return { ok: true };
            };
            const store = new FSStore({
                prefix: 'project',
                cwd: 'test/data',
                read,
                readSync,
            });

            store.loadSync();
            const afterEager = reads;

            // loaded is already set, so get() does not re-load asynchronously.
            await store.get('a');
            expect(reads).toEqual(afterEager);
            expect(asyncReads).toEqual(0);
        });
    });
});
