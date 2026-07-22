/*
 * Copyright (c) 2023.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Container } from '../../src';

describe('src/module', () => {
    // End-to-end façade smoke tests: prove Container wires Loader + Store.
    // Exhaustive discovery/name coverage lives in loader.spec.ts and the
    // query/merge coverage in store.spec.ts.
    describe('façade', () => {
        it('should load explicit files and merge them via get', async () => {
            const container = new Container({
                prefix: 'project',
                cwd: 'test/data',
            });
            await container.loadFile([
                'project.conf',
                'project.server.conf',
            ]);

            const core = container.get('server.core');

            expect(core.port).toEqual(4010);
            expect(core.host).toEqual('1.1.1.1');
        });

        it('should discover and read config from a directory', async () => {
            const container = new Container({ prefix: 'project' });
            await container.load('test/data');

            const core = container.get('server.core');

            expect(core).toBeDefined();
            expect(core.host).toEqual('1.1.1.1');
            expect(core.port).toEqual(4010);
        });

        it('should default to cwd and skip non-object files', async () => {
            const container = new Container({ cwd: 'test/data' });
            // scalar.yml is discovered but skipped, as it does not resolve to an object.
            await container.load();

            const project = container.get('project');

            expect(project).toBeDefined();
            expect(project.db.host).toEqual('127.0.0.1');
            expect(project.server.core.host).toEqual('1.1.1.1');
        });
    });

    // Option normalization is Container's own responsibility (not delegated).
    describe('options', () => {
        it('should normalize custom extensions', async () => {
            const container = new Container({
                prefix: 'project',
                extensions: ['.yml', 'yaml'],
                cwd: 'test/data',
            });
            await container.load();

            const web = container.get('client.web');

            expect(web).toBeDefined();
            expect(web.port).toEqual(4000);
        });

        it('should use a custom merge function', async () => {
            let called = false;
            const container = new Container({
                prefix: 'project',
                cwd: 'test/data',
                mergeFn: (target, source) => {
                    called = true;
                    return { ...source, ...target };
                },
            });
            await container.loadFile([
                'project.conf',
                'project.server.conf',
            ]);

            const db = container.get(['db', 'server.db']);

            expect(db).toBeDefined();
            expect(called).toBe(true);
        });
    });
});
