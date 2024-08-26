/*
 * Copyright (c) 2023.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Container } from '../../src';

describe('src/read', () => {
    it('should load explicit file', async () => {
        const container = new Container({
            prefix: 'project',
        });
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
        const container = new Container({
            prefix: 'project',
        });
        await container.load('test/data');

        const core = container.get('server.core');

        expect(core).toBeDefined();
        expect(core.host).toEqual('1.1.1.1');
        expect(core.port).toEqual(4010);
    });

    it('should read config for client web app', async () => {
        const container = new Container({
            prefix: 'project',
        });
        await container.load('test/data');

        const core = container.get('client.web');

        expect(core).toBeDefined();
        expect(core.host).toEqual('1.1.1.2');
        expect(core.port).toEqual(4000);
    });
});
