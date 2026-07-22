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
import { createMerger, isObject } from 'smob';
import { expandPath, getPathInfo } from 'pathtrace';
import { NamingScheme } from './naming';
import type {
    Element,
    MergeFn,
    NormalizedOptions,
    Options,
} from './types';

export class Container {
    protected items : Element[];

    protected itemsSorted : boolean;

    protected readonly options : NormalizedOptions;

    protected readonly naming : NamingScheme;

    constructor(options: Options = {}) {
        this.options = this.normalizeOptions(options);
        this.items = [];
        this.itemsSorted = true;
        this.naming = new NamingScheme({
            prefix: this.options.prefix,
            suffix: this.options.suffix,
            extensions: this.options.extensions,
        });
    }

    get<T = any>(key: string | string[]) : T | undefined {
        if (!this.itemsSorted) {
            this.items.sort((a, b) => a.name.localeCompare(b.name));
            this.itemsSorted = true;
        }

        let output : unknown;

        if (Array.isArray(key)) {
            for (const keyItem of key) {
                const value = this.get(keyItem);
                if (typeof output !== 'undefined') {
                    output = this.merge(value, output);
                } else {
                    output = value;
                }
            }

            return output as T;
        }

        for (const item of this.items) {
            let temp: string;
            if (item.name) {
                if (key.length > 0) {
                    if (key === item.name) {
                        temp = '';
                    } else if (key.startsWith(item.name)) {
                        let startIndex = item.name.length;
                        if (key.charAt(startIndex) === '.') {
                            startIndex++;
                        }
                        temp = key.substring(startIndex);
                    } else {
                        continue;
                    }
                } else {
                    temp = key;
                }
            } else {
                temp = key;
            }

            if (temp.length === 0) {
                output = this.merge(item.data, output);
            } else {
                const paths = expandPath(item.data, temp);
                for (const expandedPath of paths) {
                    const info = getPathInfo(item.data, expandedPath);
                    if (info.exists) {
                        output = this.merge(info.value, output);
                    }
                }
            }
        }

        return output as T;
    }

    /**
     * Load config file(s) from one or many directories.
     *
     * @param input
     */
    async load(input?: string | string[]) : Promise<void> {
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
                    path.resolve(this.options.cwd, directory)
            ));
        } else {
            directories = [this.options.cwd];
        }

        const filePaths = await this.findFiles(directories);

        await this.loadFile(filePaths);
    }

    /**
     * Load file from a specific file location.
     *
     * @param input
     */
    async loadFile(input: string | string[]) : Promise<void> {
        if (Array.isArray(input)) {
            const promises = input.map((el) => this.loadFile(el));
            await Promise.all(promises);
            return;
        }

        if (!path.isAbsolute(input)) {
            input = path.resolve(this.options.cwd, input);
        }

        const file = await read(input);
        const data = file.default ? file.default : file;

        if (!isObject(data)) {
            return;
        }

        const name = this.naming.toName(input);

        this.items.push({
            data,
            name,
        });

        this.itemsSorted = false;
    }

    protected async findFiles(cwd?: string[] | string) : Promise<string[]> {
        const locations = await locateMany(this.naming.toPatterns(), { cwd, onlyFiles: true });

        return locations.map(
            (location) => buildFilePath(location),
        );
    }

    protected normalizeOptions(input: Options) : NormalizedOptions {
        let extensions : string[];

        if (
            input.extensions &&
            input.extensions.length > 0
        ) {
            extensions = input.extensions.map((extension) => {
                if (extension.startsWith('.')) {
                    return extension.substring(1);
                }

                return extension;
            });
        } else {
            extensions = ['conf', 'js', 'mjs', 'cjs', 'ts', 'mts', 'yml', 'yaml'];
        }

        let mergeFn : MergeFn;
        if (input.mergeFn) {
            mergeFn = input.mergeFn;
        } else {
            mergeFn = createMerger({
                array: false,
                inPlace: false,
            });
        }

        return {
            ...input,
            cwd: input.cwd || process.cwd(),
            mergeFn,
            extensions,
        };
    }

    protected merge(primary: unknown | undefined, secondary: unknown) {
        if (typeof primary === 'undefined') {
            return secondary;
        }

        if (
            isObject(primary) &&
            isObject(secondary)
        ) {
            return this.options.mergeFn(primary, secondary);
        }

        return primary;
    }
}
