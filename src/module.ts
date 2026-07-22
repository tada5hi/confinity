/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createMerger } from 'smob';
import { Loader } from './loader';
import { NamingScheme } from './naming';
import { Store } from './store';
import type {
    MergeFn,
    NormalizedOptions,
    Options,
} from './types';

/**
 * Thin façade that wires a {@see NamingScheme}, a {@see Loader} (filesystem I/O)
 * and a {@see Store} (pure query/merge), delegating each public method to them.
 */
export class Container {
    protected readonly options : NormalizedOptions;

    protected readonly store : Store;

    protected readonly loader : Loader;

    constructor(options: Options = {}) {
        this.options = this.normalizeOptions(options);

        const naming = new NamingScheme({
            prefix: this.options.prefix,
            suffix: this.options.suffix,
            extensions: this.options.extensions,
        });

        this.store = new Store({ mergeFn: this.options.mergeFn });
        this.loader = new Loader({
            cwd: this.options.cwd,
            naming,
        });
    }

    get<T = any>(key: string | string[]) : T | undefined {
        return this.store.get<T>(key);
    }

    /**
     * Load config file(s) from one or many directories.
     *
     * @param input
     */
    async load(input?: string | string[]) : Promise<void> {
        const elements = await this.loader.fromDirectories(input);
        for (const element of elements) {
            this.store.add(element);
        }
    }

    /**
     * Load file from a specific file location.
     *
     * @param input
     */
    async loadFile(input: string | string[]) : Promise<void> {
        const elements = await this.loader.fromFiles(input);
        for (const element of elements) {
            this.store.add(element);
        }
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
}
