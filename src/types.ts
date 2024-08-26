/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

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
    mergeFn?: MergeFn
};

export type NormalizedOptions = {
    cwd: string,
    prefix?: string,
    suffix?: string,
    extensions: string[],
    mergeFn: MergeFn
};
