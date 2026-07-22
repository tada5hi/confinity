/*
 * Copyright (c) 2023.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Loader, NamingScheme } from '../../src';
import type { Reader } from '../../src';

const EXTENSIONS = ['conf', 'yml', 'yaml'];

function namesOf(elements: { name: string }[]) : string[] {
    return elements.map((element) => element.name).sort();
}

describe('src/loader', () => {
    describe('reader port (no filesystem)', () => {
        const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });

        it('should derive the element name via the naming scheme', async () => {
            const reader : Reader = async () => ({ a: 1 });
            const loader = new Loader({
                cwd: '/base',
                naming,
                read: reader,
            });

            const elements = await loader.fromFiles('project.server.conf');

            expect(elements).toEqual([{ name: 'server', data: { a: 1 } }]);
        });

        it('should unwrap a module default export', async () => {
            const reader : Reader = async () => ({ default: { host: '1.1.1.1' }, other: 2 });
            const loader = new Loader({
                cwd: '/base',
                naming,
                read: reader,
            });

            const elements = await loader.fromFiles('project.server.conf');

            expect(elements).toEqual([{ name: 'server', data: { host: '1.1.1.1' } }]);
        });

        it('should skip a non-object parse result', async () => {
            const reader : Reader = async () => 42;
            const loader = new Loader({
                cwd: '/base',
                naming,
                read: reader,
            });

            const elements = await loader.fromFiles('project.server.conf');

            expect(elements).toEqual([]);
        });

        it('should skip a non-object default export', async () => {
            const reader : Reader = async () => ({ default: 5 });
            const loader = new Loader({
                cwd: '/base',
                naming,
                read: reader,
            });

            const elements = await loader.fromFiles('project.server.conf');

            expect(elements).toEqual([]);
        });

        it('should honor absolute paths and load arrays in parallel', async () => {
            const reader : Reader = async (filePath) => ({ from: filePath });
            const loader = new Loader({
                cwd: '/base',
                naming,
                read: reader,
            });

            const elements = await loader.fromFiles([
                path.resolve('/abs/project.client.conf'),
                'project.server.conf',
            ]);

            expect(namesOf(elements)).toEqual(['client', 'server']);
            const client = elements.find((element) => element.name === 'client');
            // Absolute input is passed through unchanged (not re-resolved against cwd).
            expect(client?.data).toEqual({ from: path.resolve('/abs/project.client.conf') });
        });
    });

    describe('discovery against fixtures', () => {
        it('should discover prefixed files across a relative directory', async () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });
            const loader = new Loader({ cwd: process.cwd(), naming });

            const elements = await loader.fromDirectories('test/data');

            // scalar.yml carries no prefix, so it is not discovered.
            expect(namesOf(elements)).toEqual(['', 'client', 'invalid', 'server']);
        });

        it('should discover files across an absolute directory', async () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });
            const loader = new Loader({ cwd: process.cwd(), naming });

            const elements = await loader.fromDirectories(path.resolve('test/data'));

            expect(namesOf(elements)).toEqual(['', 'client', 'invalid', 'server']);
        });

        it('should discover files across an array of directories', async () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });
            const loader = new Loader({ cwd: process.cwd(), naming });

            const elements = await loader.fromDirectories(['test/data']);

            expect(namesOf(elements)).toEqual(['', 'client', 'invalid', 'server']);
        });

        it('should default to the configured cwd and skip non-object files', async () => {
            const naming = new NamingScheme({ extensions: EXTENSIONS });
            const loader = new Loader({ cwd: path.resolve('test/data'), naming });

            const elements = await loader.fromDirectories();

            // Every file is matched (no prefix/suffix); scalar.yml (42) is skipped.
            expect(namesOf(elements)).toEqual([
                'project',
                'project.client',
                'project.invalid',
                'project.server',
            ]);
        });

        it('should derive names from a suffix-only pattern', async () => {
            const naming = new NamingScheme({ suffix: 'server', extensions: EXTENSIONS });
            const loader = new Loader({ cwd: process.cwd(), naming });

            const elements = await loader.fromDirectories('test/data');

            expect(namesOf(elements)).toEqual(['project']);
        });

        it('should require a middle segment for a prefix+suffix pattern', async () => {
            const naming = new NamingScheme({
                prefix: 'project',
                suffix: 'server',
                extensions: EXTENSIONS,
            });
            const loader = new Loader({ cwd: process.cwd(), naming });

            const elements = await loader.fromDirectories('test/data');

            // project.server.conf has no middle segment → not matched.
            expect(elements).toEqual([]);
        });

        it('should load a single fixture file directly', async () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });
            const loader = new Loader({ cwd: path.resolve('test/data'), naming });

            const elements = await loader.fromFiles('project.server.conf');

            expect(elements).toHaveLength(1);
            expect(elements[0]?.name).toEqual('server');
            expect(elements[0]?.data).toMatchObject({ core: { port: 4010 } });
        });
    });
});
