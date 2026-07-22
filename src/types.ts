/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { INamingScheme } from './naming';
import type { Reader } from './store';

export type Element = {
    name: string,
    data: Record<string, any>
};

export type MergeFn = (target: Record<string, any>, source: Record<string, any>) => Record<string, any>;

export type Options = {
    cwd?: string,
    prefix?: string,
    suffix?: string,
    extensions?: string[],
    mergeFn?: MergeFn,
    /**
     * Custom naming implementation. Overrides `prefix`/`suffix`/`extensions`
     * for file discovery and name derivation.
     */
    naming?: INamingScheme,
    /**
     * Custom reader/parser. Overrides the default (locter's `read`).
     */
    read?: Reader
};
