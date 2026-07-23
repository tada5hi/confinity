/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * Contract for the prefix/suffix/extensions convention. An implementation owns
 * both directions: building the glob patterns that discover files
 * (convention → patterns) and deriving an element name from a file path
 * (path → name). Supply a custom implementation via {@see Options.naming}.
 */
export interface INamingScheme {
    /**
     * Glob patterns that match files following this convention (non-recursive).
     */
    toPatterns() : string[];

    /**
     * Derive the element name from a file path (base name, prefix/suffix stripped).
     */
    toName(filePath: string) : string;
}

export type NamingOptions = {
    prefix?: string,
    suffix?: string,
    /**
     * Already normalized extensions (no leading dot).
     */
    extensions: string[]
};
