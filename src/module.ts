/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createMerger } from 'smob';
import { NamingScheme } from './naming';
import { FSStore } from './store';
import type { INamingScheme } from './naming';
import type { Options } from './types';

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
 * Build a filesystem-backed config store from a set of friendly options.
 *
 * Normalizes the extensions, resolves the working directory, and wires a
 * {@see NamingScheme} (unless a custom {@see INamingScheme} is provided via
 * `naming`) into an {@see FSStore}. The returned store discovers, loads and
 * merges config files and answers dotted-path lookups.
 *
 * @param options
 */
export function createStore(options: Options = {}) : FSStore {
    const extensions = normalizeExtensions(options.extensions);

    const naming : INamingScheme = options.naming ?? new NamingScheme({
        prefix: options.prefix,
        suffix: options.suffix,
        extensions,
    });

    return new FSStore({
        cwd: options.cwd || process.cwd(),
        naming,
        mergeFn: options.mergeFn ?? createMerger({
            array: false,
            inPlace: false,
        }),
        read: options.read,
    });
}
