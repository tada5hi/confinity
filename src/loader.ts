/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    buildFilePath,
    locateMany,
    read,
} from 'locter';
import path from 'node:path';
import { isObject } from 'smob';
import type { NamingScheme } from './naming';
import type { Element } from './types';

/**
 * Minimal reader port. Parses a file at the given path into its raw value.
 * Defaults to locter's `read`; can be substituted to unit-test the loader's
 * naming/skip logic without touching the filesystem.
 */
export type Reader = (filePath: string) => Promise<unknown>;

export interface LoaderOptions {
    cwd: string,
    naming: NamingScheme,
    read?: Reader
}

/**
 * Filesystem-facing producer of config elements. Owns directory resolution,
 * glob discovery, parsing (incl. the `.default` unwrap and the non-object skip),
 * parallel loads, and name derivation via the {@see NamingScheme}.
 */
export class Loader {
    protected readonly cwd : string;

    protected readonly naming : NamingScheme;

    protected readonly read : Reader;

    constructor(options: LoaderOptions) {
        this.cwd = options.cwd;
        this.naming = options.naming;
        this.read = options.read ?? read;
    }

    /**
     * Discover + parse config files across one or many directories
     * (defaults to the configured cwd).
     *
     * @param input
     */
    async fromDirectories(input?: string | string[]) : Promise<Element[]> {
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

    /**
     * Parse specific file(s), deriving each element name via the NamingScheme.
     *
     * @param input
     */
    async fromFiles(input: string | string[]) : Promise<Element[]> {
        if (Array.isArray(input)) {
            const promises = input.map((el) => this.fromFiles(el));
            const results = await Promise.all(promises);
            return results.flat();
        }

        let filePath = input;
        if (!path.isAbsolute(filePath)) {
            filePath = path.resolve(this.cwd, filePath);
        }

        const file = await this.read(filePath);
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
