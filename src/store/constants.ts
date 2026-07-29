/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * Extensions whose contents are parsed as data.
 */
export const DATA_EXTENSIONS = [
    'conf',
    'json',
    'yml',
    'yaml',
] as const;

/**
 * Extensions whose contents are **executed** to produce config. Discovering one
 * of these imports the file, so a directory that is not fully trusted should be
 * scanned with `extensions: [...DATA_EXTENSIONS]` instead.
 */
export const MODULE_EXTENSIONS = [
    'js',
    'mjs',
    'cjs',
    'ts',
    'mts',
] as const;

/**
 * The default discovery set: data formats plus executable modules.
 */
export const DEFAULT_EXTENSIONS = [
    ...DATA_EXTENSIONS,
    ...MODULE_EXTENSIONS,
] as const;
