/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    buildFilePath,
    locateMany,
    read as readFile,
} from 'locter';
import path from 'node:path';
import { isObject } from 'smob';
import type { INamingScheme } from '../naming';
import type { Element } from '../types';
import { Store } from './module';
import type { FSStoreOptions, Reader } from './types';

/**
 * A {@see Store} that can populate itself from the filesystem. Adds `load` and
 * `loadFile` on top of the in-memory store, owning directory resolution, glob
 * discovery (via the {@see INamingScheme}), parsing (incl. the `.default`
 * unwrap and the non-object skip), and parallel loads. The parsing dependency
 * is a {@see Reader} port, defaulting to locter's `read`.
 */
export class FSStore extends Store {
    protected readonly cwd : string;

    protected readonly naming : INamingScheme;

    protected readonly reader : Reader;

    constructor(options: FSStoreOptions) {
        super({ mergeFn: options.mergeFn });
        this.cwd = options.cwd;
        this.naming = options.naming;
        this.reader = options.read ?? readFile;
    }

    /**
     * Discover, parse and store config files from one or many directories
     * (defaults to the configured cwd).
     *
     * @param input
     */
    async load(input?: string | string[]) : Promise<void> {
        const elements = await this.fromDirectories(input);
        for (const element of elements) {
            this.add(element);
        }
    }

    /**
     * Parse and store specific file(s), deriving each name via the NamingScheme.
     *
     * @param input
     */
    async loadFile(input: string | string[]) : Promise<void> {
        const elements = await this.fromFiles(input);
        for (const element of elements) {
            this.add(element);
        }
    }

    protected async fromDirectories(input?: string | string[]) : Promise<Element[]> {
        let directories : string[] = [];
        if (input) {
            if (Array.isArray(input)) {
                directories = input;
            } else {
                directories = [input];
            }
        }

        if (directories.length > 0) {
            directories = directories.map((directory) => (
                path.isAbsolute(directory) ?
                    directory :
                    path.resolve(this.cwd, directory)
            ));
        } else {
            directories = [this.cwd];
        }

        const filePaths = await this.findFiles(directories);

        return this.fromFiles(filePaths);
    }

    protected async fromFiles(input: string | string[]) : Promise<Element[]> {
        if (Array.isArray(input)) {
            const promises = input.map((el) => this.fromFiles(el));
            const results = await Promise.all(promises);
            return results.flat();
        }

        let filePath = input;
        if (!path.isAbsolute(filePath)) {
            filePath = path.resolve(this.cwd, filePath);
        }

        const file = await this.reader(filePath);
        const data = isObject(file) && file.default ? file.default : file;

        if (!isObject(data)) {
            return [];
        }

        return [{
            data,
            name: this.naming.toName(filePath),
        }];
    }

    protected async findFiles(cwd?: string[] | string) : Promise<string[]> {
        const locations = await locateMany(this.naming.toPatterns(), {
            cwd,
            onlyFiles: true,
        });

        return locations.map(
            (location) => buildFilePath(location),
        );
    }
}
