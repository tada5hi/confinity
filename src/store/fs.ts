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
import { NamingScheme } from '../naming';
import type { INamingScheme } from '../naming';
import type { Element } from '../types';
import { Store } from './module';
import type { FSStoreOptions, Reader } from './types';

function normalizeExtensions(input?: string[]) : string[] {
    if (
        input &&
        input.length > 0
    ) {
        return input.map((extension) => {
            if (extension.startsWith('.')) {
                return extension.substring(1);
            }

            return extension;
        });
    }

    return ['conf', 'js', 'mjs', 'cjs', 'ts', 'mts', 'yml', 'yaml'];
}

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

    protected loaded : boolean;

    protected loading : Promise<void> | undefined;

    constructor(options: FSStoreOptions = {}) {
        super({ mergeFn: options.mergeFn });
        this.cwd = options.cwd || process.cwd();
        this.naming = options.naming ?? new NamingScheme({
            prefix: options.prefix,
            suffix: options.suffix,
            extensions: normalizeExtensions(options.extensions),
        });
        this.reader = options.read ?? readFile;
        this.loaded = false;
        this.loading = undefined;
    }

    /**
     * Resolve a key, lazily loading from the filesystem on the first call.
     *
     * The default load (`load()`) runs at most once and is shared across
     * concurrent callers; if config was already loaded (eagerly, or via a
     * previous call) it is not re-loaded.
     *
     * @param key
     */
    override async get<T = any>(key: string | string[]) : Promise<T | undefined> {
        if (!this.loaded) {
            this.loading = this.loading ?? this.load();
            await this.loading;
        }

        return this.getSync<T>(key);
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

        this.loaded = true;
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

        this.loaded = true;
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
