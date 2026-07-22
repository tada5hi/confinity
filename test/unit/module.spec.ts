/*
 * Copyright (c) 2023.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { createStore } from '../../src';
import type { INamingScheme, Reader } from '../../src';

describe('src/module', () => {
    it('should load explicit files and merge them', async () => {
        const store = createStore({
            prefix: 'project',
            cwd: 'test/data',
        });
        await store.loadFile([
            'project.conf',
            'project.server.conf',
        ]);

        const core = store.get('server.core');

        expect(core.port).toEqual(4010);
        expect(core.host).toEqual('1.1.1.1');
    });

    it('should discover and read config from a directory', async () => {
        const store = createStore({ prefix: 'project' });
        await store.load('test/data');

        expect(store.get('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
        expect(store.get('client.web')).toEqual({ host: '1.1.1.2', port: 4000 });
    });

    it('should default discovery to the configured cwd', async () => {
        const store = createStore({ cwd: 'test/data' });
        // scalar.yml is discovered but skipped (not an object).
        await store.load();

        const project = store.get('project');

        expect(project.db.host).toEqual('127.0.0.1');
        expect(project.server.core.host).toEqual('1.1.1.1');
    });

    it('should normalize custom extensions', async () => {
        const store = createStore({
            prefix: 'project',
            extensions: ['.yml', 'yaml'],
            cwd: 'test/data',
        });
        await store.load();

        expect(store.get('client.web').port).toEqual(4000);
    });

    it('should use a custom merge function', async () => {
        let called = false;
        const store = createStore({
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

        expect(store.get(['db', 'server.db'])).toBeDefined();
        expect(called).toBe(true);
    });

    it('should accept a custom naming implementation', async () => {
        const naming : INamingScheme = {
            toPatterns: () => ['project.server.conf'],
            toName: () => 'custom',
        };
        const store = createStore({ naming, cwd: 'test/data' });
        await store.load();

        expect(store.get('custom.core.port')).toEqual(4010);
    });

    it('should accept a custom reader implementation', async () => {
        const reader : Reader = async () => ({ a: 1 });
        const store = createStore({
            prefix: 'project',
            cwd: '/base',
            read: reader,
        });
        await store.loadFile('project.server.conf');

        expect(store.get('server')).toEqual({ a: 1 });
    });
});
