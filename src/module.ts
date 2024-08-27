/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    buildFilePath,
    load,
    locateMany,
} from 'locter';
import path from 'node:path';
import { createMerger, isObject } from 'smob';
import type {
    Element, MergeFn, NormalizedOptions, Options,
} from './types';
import { getPropertyPathValue } from './object-path';

export class Container {
    protected items : Element[];

    protected itemsSorted : boolean;

    protected readonly options : NormalizedOptions;

    constructor(options: Options = {}) {
        this.options = this.normalizeOptions(options);
        this.items = [];
        this.itemsSorted = true;
    }

    get<T = any>(key: string | string[]) : T | undefined {
        if (!this.itemsSorted) {
            this.items.sort((a, b) => a.name.localeCompare(b.name));
            this.itemsSorted = true;
        }

        let output : unknown | undefined;

        if (Array.isArray(key)) {
            for (let i = 0; i < key.length; i++) {
                const value = this.get(key[i]);
                if (typeof output !== 'undefined') {
                    output = this.merge(value, output);
                } else {
                    output = value;
                }
            }

            return output as T;
        }

        for (let i = 0; i < this.items.length; i++) {
            let temp: string;
            if (this.items[i].name) {
                if (key.length > 0) {
                    if (key === this.items[i].name) {
                        temp = '';
                    } else if (key.startsWith(this.items[i].name)) {
                        let startIndex = this.items[i].name.length;
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

            let value: unknown;
            if (temp.length === 0) {
                value = this.items[i].data;
            } else {
                value = getPropertyPathValue(this.items[i].data, temp);
            }

            if (typeof output !== 'undefined') {
                output = this.merge(value, output);
            } else {
                output = value;
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
            for (let i = 0; i < directories.length; i++) {
                if (!path.isAbsolute(directories[i])) {
                    directories[i] = path.resolve(this.options.cwd, directories[i]);
                }
            }
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

        const file = await load(input);
        const data = file.default ? file.default : file;

        if (!isObject(data)) {
            return;
        }

        let inputNormalized = input.replace(/\\/g, '/');
        if (inputNormalized.includes('/')) {
            inputNormalized = inputNormalized.substring(inputNormalized.lastIndexOf('/') + 1);
        }

        let name = inputNormalized.substring(0, inputNormalized.lastIndexOf('.'));

        if (
            this.options.prefix &&
            name.startsWith(this.options.prefix)
        ) {
            let startIndex = this.options.prefix.length;
            if (name.charAt(startIndex) === '.') {
                startIndex++;
            }

            name = name.substring(startIndex);
        }

        if (
            this.options.suffix &&
            name.endsWith(this.options.suffix)
        ) {
            let startIndex = name.length - this.options.suffix.length;
            if (name.charAt(startIndex - 1) === '.') {
                startIndex--;
            }

            name = name.substring(0, startIndex);
        }

        this.items.push({
            data,
            name,
        });

        this.itemsSorted = false;
    }

    protected async findFiles(path?: string[] | string) : Promise<string[]> {
        const patterns : string[] = [];
        const extension = `{${this.options.extensions.join(',')}}`;

        if (
            this.options.prefix &&
            this.options.suffix
        ) {
            patterns.push(`${this.options.prefix}.**.${this.options.suffix}.${extension}`);
        } else if (this.options.prefix) {
            patterns.push(
                `${this.options.prefix}.${extension}`,
                `${this.options.prefix}.**.${extension}`,
            );
        } else if (this.options.suffix) {
            patterns.push(
                `${this.options.suffix}.${extension}`,
                `**.${this.options.suffix}.${extension}`,
            );
        } else {
            patterns.push(`**.${extension}`);
        }

        const locations = await locateMany(patterns, { path, onlyFiles: true });

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
