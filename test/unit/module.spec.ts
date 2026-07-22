/*
 * Copyright (c) 2023.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Container } from '../../src';

describe('src/read', () => {
    it('should load explicit file', async () => {
        const container = new Container({ prefix: 'project' });
        await container.loadFile('test/data/project.server.conf');

        const core = container.get('server.core');

        expect(core.port).toEqual(4010);
        expect(core.host).toBeUndefined();
    });

    it('should load explicit files', async () => {
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

    it('should get multiple elements', async () => {
        expect.assertions(4);

        const container = new Container({
            prefix: 'project',
            cwd: 'test/data',
        });

        await container.loadFile([
            'project.conf',
            'project.server.conf',
        ]);

        const db = container.get([
            'db',
            'server.db',
            'server.core.db',
        ]);
        expect(db.host).toEqual('127.0.0.1');
        expect(db.user).toEqual('admin');
        expect(db.password).toEqual('start123');
        expect(db.database).toEqual('app');
    });

    it('should read config for server core app', async () => {
        const container = new Container({ prefix: 'project' });
        await container.load('test/data');

        const core = container.get('server.core');

        expect(core).toBeDefined();
        expect(core.host).toEqual('1.1.1.1');
        expect(core.port).toEqual(4010);
    });

    it('should read config for client web app', async () => {
        const container = new Container({ prefix: 'project' });
        await container.load('test/data');

        const core = container.get('client.web');

        expect(core).toBeDefined();
        expect(core.host).toEqual('1.1.1.2');
        expect(core.port).toEqual(4000);
    });

    it('should load without a prefix or suffix', async () => {
        const container = new Container({ cwd: 'test/data' });
        // scalar.yml is discovered but skipped, as it does not resolve to an object.
        await container.load();

        const project = container.get('project');

        expect(project).toBeDefined();
        expect(project.db.host).toEqual('127.0.0.1');
        expect(project.server.core.host).toEqual('1.1.1.1');
    });

    it('should load with a suffix only', async () => {
        const container = new Container({
            suffix: 'server',
            cwd: 'test/data',
        });
        await container.load();

        const core = container.get('project.core');

        expect(core).toBeDefined();
        expect(core.port).toEqual(4010);
    });

    it('should require a middle segment for a prefix and suffix pattern', async () => {
        const container = new Container({
            prefix: 'project',
            suffix: 'server',
            cwd: 'test/data',
        });
        await container.load();

        // project.server.conf has no middle segment, so it is not matched.
        expect(container.get('project')).toBeUndefined();
    });

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
