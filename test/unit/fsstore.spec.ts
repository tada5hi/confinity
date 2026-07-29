/*
 * Copyright (c) 2023.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    DATA_EXTENSIONS, 
    FSStore, 
    LoadError, 
    OptionsError,
} from '../../src';
import type { INamingScheme, Reader, ReaderSync } from '../../src';

const MODULE_DATA = path.resolve('test/data/module');

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

        it('should skip a non-object parse result', async () => {
            const read : Reader = async () => 42;
            const store = new FSStore({
                prefix: 'project',
                cwd: '/base',
                read,
            });

            expect(await store.loadFile('project.server.conf')).toEqual([]);
            expect(store.getSync('server')).toBeUndefined();
        });

        it('should not treat a plain `default` key as a module wrapper', async () => {
            // Only a record branded by locter's reader is a module; a data file
            // is entitled to a top-level `default` key of its own.
            const read : Reader = async () => ({ default: { host: '1.1.1.1' }, other: 2 });
            const store = new FSStore({
                prefix: 'project',
                cwd: '/base',
                read,
            });
            await store.loadFile('project.server.conf');

            expect(store.getSync('server')).toEqual({ default: { host: '1.1.1.1' }, other: 2 });
        });

        it('should give an off-convention explicit file the root namespace', async () => {
            const read : Reader = async () => ({ server: { core: { port: 4010 } } });
            const store = new FSStore({
                prefix: 'project',
                cwd: '/base',
                read,
            });
            await store.loadFile('production.conf');

            expect(store.getSync('server.core')).toEqual({ port: 4010 });
        });

        it('should strip prototype-reaching keys at the load boundary', async () => {
            const read : Reader = async () => JSON.parse(
                '{"__proto__":{"polluted":true},"nested":{"constructor":1,"keep":2}}',
            );
            const store = new FSStore({ cwd: '/base', read });
            await store.loadFile('app.conf');

            const value = store.getSync<Record<string, any>>('app');

            expect(value).toEqual({ nested: { keep: 2 } });
            expect(({ ...value }).polluted).toBeUndefined();
            expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        });

        it('should survive a cyclic value from a module config', async () => {
            const read : Reader = async () => {
                const cyclic : Record<string, any> = { name: 'root', list: [1] };
                cyclic.self = cyclic;
                cyclic.list.push(cyclic.list);

                return cyclic;
            };
            const store = new FSStore({ cwd: '/base', read });
            await store.loadFile('app.conf');

            expect(store.getSync<Record<string, unknown>>('app')?.name).toEqual('root');
        });

        it('should carry a class instance through untouched', async () => {
            class Custom {
                readonly value = 1;

                get derived() {
                    return this.value + 1;
                }
            }
            const instance = new Custom();
            const read : Reader = async () => ({ custom: instance });
            const store = new FSStore({ cwd: '/base', read });
            await store.loadFile('app.conf');

            expect(store.getSync<Record<string, unknown>>('app')?.custom).toBe(instance);

            // A `.ts`/`.mjs` config may export a class instance, and an accessor
            // on its prototype is data as far as a caller is concerned.
            expect(store.getSync('app.custom.value')).toEqual(1);
            expect(store.getSync('app.custom.derived')).toEqual(2);
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

    describe('module fixtures', () => {
        it('should unwrap a module default export', async () => {
            const store = new FSStore({ prefix: 'project', cwd: MODULE_DATA });
            await store.load();

            expect(store.getSync('esm')).toEqual({ server: { core: { host: 'from-module' } } });
        });

        it('should keep a data file`s literal `default` key and its siblings', async () => {
            const store = new FSStore({ prefix: 'project', cwd: MODULE_DATA });
            await store.load();

            expect(store.getSync('defaults')).toEqual({
                default: { type: 'postgres' },
                host: '1.2.3.4',
                password: 'secret',
            });
        });

        it('should skip a module whose default export is not an object', async () => {
            const store = new FSStore({ prefix: 'project', cwd: MODULE_DATA });
            const loaded = await store.load();

            // project.scalar.mjs (5) and project.falsy.mjs (false) are skipped.
            expect(loaded.map((filePath) => path.basename(filePath))).toEqual([
                'project.defaults.yml',
                'project.esm.mjs',
            ]);
            expect(store.getSync('scalar')).toBeUndefined();
            expect(store.getSync('falsy')).toBeUndefined();
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

            expect(store.getSync<Record<string, unknown>>('client.web')?.port).toEqual(4000);
        });

        it('should discover with a single extension', async () => {
            const store = new FSStore({
                prefix: 'project',
                extensions: ['conf'],
                cwd: 'test/data',
            });
            const loaded = await store.load();

            // A one-element list must not be emitted as a literal `{conf}` brace.
            expect(loaded.length).toBeGreaterThan(0);
            expect(store.getSync('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
        });

        it('should discover data formats only when asked', async () => {
            const store = new FSStore({
                prefix: 'project',
                extensions: [...DATA_EXTENSIONS],
                cwd: MODULE_DATA,
            });
            const loaded = await store.load();

            expect(loaded.map((filePath) => path.basename(filePath)))
                .toEqual(['project.defaults.yml']);
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

            expect(store.getSync<Record<string, unknown>>('project.core')?.port).toEqual(4010);
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

            // `server.core` exists in both files (host in one, port in the
            // other), so two objects actually reach the merge function.
            expect(store.getSync('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
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

    describe('option validation', () => {
        it('should reject an explicitly empty extension list', () => {
            expect(() => new FSStore({ prefix: 'project', extensions: [] }))
                .toThrow(OptionsError);
        });

        it('should reject a glob-unsafe prefix', () => {
            expect(() => new FSStore({ prefix: '../secrets/app' })).toThrow(OptionsError);
        });
    });

    describe('load reporting', () => {
        it('should report the files it loaded', async () => {
            const store = new FSStore({ prefix: 'project', cwd: 'test/data' });
            const loaded = await store.load();

            expect(loaded.map((filePath) => path.basename(filePath))).toEqual([
                'project.client.yml',
                'project.conf',
                'project.invalid.conf',
                'project.server.conf',
            ]);
            expect(loaded.every((filePath) => path.isAbsolute(filePath))).toBe(true);
        });

        it('should report an empty list for a directory that does not exist', async () => {
            const store = new FSStore({ prefix: 'project', cwd: 'test/data' });

            expect(await store.load('no-such-directory')).toEqual([]);
        });

        it('should report an empty list for a directory holding no config', async () => {
            const store = new FSStore({ prefix: 'no-such-prefix', cwd: 'test/data' });

            expect(await store.load()).toEqual([]);
        });

        it('should record the source of each element', async () => {
            const store = new FSStore({ prefix: 'project', cwd: 'test/data' });
            await store.load();

            for (const element of store.elements()) {
                expect(element.source).toBeDefined();
                expect(path.isAbsolute(element.source as string)).toBe(true);
            }

            const server = store.elements().find((element) => element.name === 'server');
            expect(path.basename(server?.source as string)).toEqual('project.server.conf');
        });

        it('should report the same files from the sync twin', async () => {
            const sync = new FSStore({ prefix: 'project', cwd: 'test/data' });
            const async = new FSStore({ prefix: 'project', cwd: 'test/data' });

            expect(sync.loadSync()).toEqual(await async.load());
        });
    });

    describe('idempotency', () => {
        it('should not duplicate elements across repeated loads', async () => {
            const store = new FSStore({ prefix: 'project', cwd: 'test/data' });

            await store.load();
            const first = store.elements().length;
            await store.load();

            expect(store.elements()).toHaveLength(first);
            expect(store.getSync('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
        });

        it('should not duplicate a directory named twice', async () => {
            const store = new FSStore({ prefix: 'project', cwd: 'test/data' });

            const loaded = await store.load([path.resolve('test/data'), '.']);

            expect(new Set(loaded).size).toEqual(loaded.length);
        });

        it('should not duplicate a file loaded twice', async () => {
            const store = new FSStore({ prefix: 'project', cwd: 'test/data' });

            await store.loadFile('project.conf');
            await store.loadFile('project.conf');

            expect(store.elements()).toHaveLength(1);
        });

        it('should refresh an element re-loaded from the same file', async () => {
            let value = 1;
            const read : Reader = async () => ({ value });
            const store = new FSStore({
                prefix: 'project', 
                cwd: '/base', 
                read, 
            });

            await store.loadFile('project.server.conf');
            value = 2;
            await store.loadFile('project.server.conf');

            expect(store.elements()).toHaveLength(1);
            expect(store.getSync('server')).toEqual({ value: 2 });
        });

        it('should treat an explicitly empty directory list as no directories', async () => {
            const store = new FSStore({ prefix: 'project', cwd: 'test/data' });

            expect(await store.load([])).toEqual([]);
            expect(store.loadSync([])).toEqual([]);
            expect(store.elements()).toHaveLength(0);
        });
    });

    describe('error handling', () => {
        it('should wrap a read failure in a LoadError naming the file', async () => {
            const read : Reader = async () => {
                throw new Error('boom');
            };
            const store = new FSStore({
                prefix: 'project', 
                cwd: '/base', 
                read, 
            });

            await expect(store.loadFile('project.server.conf')).rejects.toThrow(LoadError);
            await expect(store.loadFile('project.server.conf')).rejects.toThrow(
                /project\.server\.conf/,
            );
        });

        it('should keep the cause of a wrapped read failure', async () => {
            const cause = new Error('boom');
            const read : Reader = async () => {
                throw cause;
            };
            const store = new FSStore({
                prefix: 'project', 
                cwd: '/base', 
                read, 
            });

            await expect(store.loadFile('project.server.conf')).rejects.toMatchObject({ cause });
        });

        it('should keep the good files when onError is skip', async () => {
            const read : Reader = async (filePath) => {
                if (filePath.endsWith('broken.conf')) {
                    throw new Error('boom');
                }

                return { ok: true };
            };
            const store = new FSStore({
                prefix: 'project',
                cwd: '/base',
                read,
                onError: 'skip',
            });

            const loaded = await store.loadFile([
                'project.broken.conf',
                'project.server.conf',
            ]);

            expect(loaded.map((filePath) => path.basename(filePath)))
                .toEqual(['project.server.conf']);
            expect(store.getSync('server')).toEqual({ ok: true });
        });

        it('should skip a failing file on the sync path too', () => {
            const readSync : ReaderSync = (filePath) => {
                if (filePath.endsWith('broken.conf')) {
                    throw new Error('boom');
                }

                return { ok: true };
            };
            const store = new FSStore({
                prefix: 'project',
                cwd: '/base',
                readSync,
                onError: 'skip',
            });

            store.loadFileSync(['project.broken.conf', 'project.server.conf']);

            expect(store.getSync('server')).toEqual({ ok: true });
        });

        it('should throw a LoadError from the sync path by default', () => {
            const readSync : ReaderSync = () => {
                throw new Error('boom');
            };
            const store = new FSStore({
                prefix: 'project', 
                cwd: '/base', 
                readSync, 
            });

            expect(() => store.loadFileSync('project.server.conf')).toThrow(LoadError);
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

        it('should not double-add when an explicit load races a lazy get', async () => {
            const store = new FSStore({ prefix: 'project', cwd: 'test/data' });

            await Promise.all([
                store.get('server.core'),
                store.load(),
            ]);

            expect(store.elements()).toHaveLength(4);
            expect(store.getSync('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
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

        it('should retry a lazy load that failed instead of memoizing the error', async () => {
            let attempts = 0;
            const read : Reader = async () => {
                attempts += 1;
                if (attempts === 1) {
                    throw new Error('boom');
                }

                return { ok: true };
            };
            const store = new FSStore({
                prefix: 'project',
                cwd: 'test/data',
                read,
            });

            await expect(store.get('a')).rejects.toThrow(LoadError);

            // The second call must reach the filesystem again, not replay the error.
            await expect(store.get('server')).resolves.toEqual({ ok: true });
        });
    });

    describe('reset', () => {
        it('should let a store load again after a reset', async () => {
            const store = new FSStore({ prefix: 'project', cwd: 'test/data' });

            await store.load();
            expect(store.elements().length).toBeGreaterThan(0);

            store.reset();
            expect(store.elements()).toHaveLength(0);
            expect(store.getSync('server.core')).toBeUndefined();

            // `loaded` was cleared too, so the lazy path runs again.
            expect(await store.get('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
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

            expect(store.getSync<Record<string, unknown>>('server.core')?.port).toEqual(4010);
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

            it('should skip a non-object parse result', () => {
                const readSync : ReaderSync = () => 42;
                const store = new FSStore({
                    prefix: 'project',
                    cwd: '/base',
                    readSync,
                });

                expect(store.loadFileSync('project.server.conf')).toEqual([]);
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
