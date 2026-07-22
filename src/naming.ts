/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type NamingSchemeOptions = {
    prefix?: string,
    suffix?: string,
    extensions: string[]
};

/**
 * Owns both directions of the prefix/suffix/extension file-naming convention:
 * building the glob patterns that discover matching files, and deriving an
 * element name from a discovered file path.
 */
export class NamingScheme {
    protected readonly prefix?: string;

    protected readonly suffix?: string;

    protected readonly extensions: string[];

    constructor(options: NamingSchemeOptions) {
        this.prefix = options.prefix;
        this.suffix = options.suffix;
        this.extensions = options.extensions;
    }

    /**
     * Glob patterns that match files following this convention (non-recursive).
     */
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

    /**
     * Derive the element name from a file path (base name, prefix/suffix stripped).
     */
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
