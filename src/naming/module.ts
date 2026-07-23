/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { INamingScheme, NamingOptions } from './types';

/**
 * Default {@see Naming} implementation. Owns both directions of the
 * prefix/suffix/extensions convention: building the glob patterns that discover
 * files (convention → patterns) and deriving an element name from a file path
 * (path → name).
 */
export class NamingScheme implements INamingScheme {
    protected readonly prefix : string | undefined;

    protected readonly suffix : string | undefined;

    protected readonly extensions : string[];

    constructor(options: NamingOptions) {
        this.prefix = options.prefix;
        this.suffix = options.suffix;
        this.extensions = options.extensions;
    }

    toPatterns() : string[] {
        const patterns : string[] = [];
        const extension = `{${this.extensions.join(',')}}`;

        if (
            this.prefix &&
            this.suffix
        ) {
            patterns.push(`${this.prefix}.*.${this.suffix}.${extension}`);
        } else if (this.prefix) {
            patterns.push(
                `${this.prefix}.${extension}`,
                `${this.prefix}.*.${extension}`,
            );
        } else if (this.suffix) {
            patterns.push(
                `${this.suffix}.${extension}`,
                `*.${this.suffix}.${extension}`,
            );
        } else {
            patterns.push(`*.${extension}`);
        }

        return patterns;
    }

    toName(filePath: string) : string {
        let inputNormalized = filePath.replace(/\\/g, '/');
        if (inputNormalized.includes('/')) {
            inputNormalized = inputNormalized.substring(inputNormalized.lastIndexOf('/') + 1);
        }

        let name = inputNormalized.substring(0, inputNormalized.lastIndexOf('.'));

        if (
            this.prefix &&
            name.startsWith(this.prefix)
        ) {
            let startIndex = this.prefix.length;
            if (name.charAt(startIndex) === '.') {
                startIndex++;
            }

            name = name.substring(startIndex);
        }

        if (
            this.suffix &&
            name.endsWith(this.suffix)
        ) {
            let startIndex = name.length - this.suffix.length;
            if (name.charAt(startIndex - 1) === '.') {
                startIndex--;
            }

            name = name.substring(0, startIndex);
        }

        return name;
    }
}
