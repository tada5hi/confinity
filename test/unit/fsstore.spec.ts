/*
 * Copyright (c) 2023.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FSStore, NamingScheme } from '../../src';
import type { Reader } from '../../src';

const EXTENSIONS = ['conf', 'yml', 'yaml'];

describe('src/store FSStore', () => {
    describe('reader port (no filesystem)', () => {
        const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });

        it('should derive the element name via the naming scheme', async () => {
            const read : Reader = async () => ({ a: 1 });
            const store = new FSStore({
                cwd: '/base',
                naming,
                read,
            });
            await store.loadFile('project.server.conf');

            expect(store.get('server')).toEqual({ a: 1 });
        });

        it('should unwrap a module default export', async () => {
            const read : Reader = async () => ({ default: { host: '1.1.1.1' }, other: 2 });
            const store = new FSStore({
                cwd: '/base',
                naming,
                read,
            });
            await store.loadFile('project.server.conf');

            expect(store.get('server')).toEqual({ host: '1.1.1.1' });
        });

        it('should skip a non-object parse result', async () => {
            const read : Reader = async () => 42;
            const store = new FSStore({
                cwd: '/base',
                naming,
                read,
            });
            await store.loadFile('project.server.conf');

            expect(store.get('server')).toBeUndefined();
        });

        it('should skip a non-object default export', async () => {
            const read : Reader = async () => ({ default: 5 });
            const store = new FSStore({
                cwd: '/base',
                naming,
                read,
            });
            await store.loadFile('project.server.conf');

            expect(store.get('server')).toBeUndefined();
        });

        it('should honor absolute paths and load arrays in parallel', async () => {
            const read : Reader = async (filePath) => ({ from: filePath });
            const store = new FSStore({
                cwd: '/base',
                naming,
                read,
            });
            await store.loadFile([
                path.resolve('/abs/project.client.conf'),
                'project.server.conf',
            ]);

            // Absolute input is passed through unchanged (not re-resolved against cwd).
            expect(store.get('client')).toEqual({ from: path.resolve('/abs/project.client.conf') });
            expect(store.get('server')).toEqual({ from: path.resolve('/base/project.server.conf') });
        });
    });

    describe('discovery against fixtures', () => {
        it('should discover prefixed files across a relative directory', async () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });
            const store = new FSStore({ cwd: process.cwd(), naming });
            await store.load('test/data');

            expect(store.get('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
            expect(store.get('client.web')).toEqual({ host: '1.1.1.2', port: 4000 });
        });

        it('should discover across an absolute directory', async () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });
            const store = new FSStore({ cwd: process.cwd(), naming });
            await store.load(path.resolve('test/data'));

            expect(store.get('server.core').port).toEqual(4010);
        });

        it('should default to the configured cwd and skip non-object files', async () => {
            const naming = new NamingScheme({ extensions: EXTENSIONS });
            const store = new FSStore({ cwd: path.resolve('test/data'), naming });
            // Every file is matched (no prefix/suffix); scalar.yml (42) is skipped.
            await store.load();

            expect(store.get<string>('project.db.host')).toEqual('127.0.0.1');
        });

        it('should require a middle segment for a prefix+suffix pattern', async () => {
            const naming = new NamingScheme({
                prefix: 'project',
                suffix: 'server',
                extensions: EXTENSIONS,
            });
            const store = new FSStore({ cwd: process.cwd(), naming });
            await store.load('test/data');

            // project.server.conf has no middle segment → not matched.
            expect(store.get('project')).toBeUndefined();
        });

        it('should derive names from a suffix-only pattern', async () => {
            const naming = new NamingScheme({ suffix: 'server', extensions: EXTENSIONS });
            const store = new FSStore({ cwd: process.cwd(), naming });
            await store.load('test/data');

            expect(store.get('project.core').port).toEqual(4010);
        });

        it('should load a single fixture file directly', async () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });
            const store = new FSStore({ cwd: path.resolve('test/data'), naming });
            await store.loadFile('project.server.conf');

            expect(store.get('server.core')).toMatchObject({ port: 4010 });
        });
    });
});
