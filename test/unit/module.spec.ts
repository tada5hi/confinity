/*
 * Copyright (c) 2023.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Container, FSStore, Store } from '../../src';

describe('src/module Container', () => {
    it('should expose a read-only sync getSync over a wrapped store', () => {
        const store = new Store();
        store.add({ name: 'server', data: { core: { port: 4010 } } });

        const container = new Container(store);

        expect(container.getSync('server.core')).toEqual({ port: 4010 });
        expect(container.getSync('server.core.port')).toEqual(4010);
    });

    it('should reflect a wrapped fs store after it is loaded', async () => {
        const store = new FSStore({ prefix: 'project', cwd: 'test/data' });
        await store.load();

        const container = new Container(store);

        expect(container.getSync('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
        expect(container.getSync('client.web')).toEqual({ host: '1.1.1.2', port: 4000 });
    });

    it('should delegate the async get to the wrapped store (lazy)', async () => {
        const store = new FSStore({ prefix: 'project', cwd: 'test/data' });
        const container = new Container(store);

        // No explicit load — the async get triggers it.
        expect(await container.get('server.core')).toEqual({ host: '1.1.1.1', port: 4010 });
    });

    it('should propagate the throw when the wrapped store has no async variant', async () => {
        const container = new Container(new Store());

        await expect(container.get('server')).rejects.toThrow(/asynchronous/);
    });
});
