/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { OptionsError } from '../errors';
import type { INamingScheme, NamingOptions } from './types';

/**
 * Characters that would give a prefix/suffix meaning beyond "literal file name
 * segment" once interpolated into a glob pattern — `*`/`?` widen the match,
 * `{},[]!()` change its grammar, and a path separator escapes the search
 * directory entirely.
 */
const UNSAFE_PATTERN_CHARS = /[\\/*?{}[\],!()]/;

function assertPatternLiteral(value: string, option: string) : void {
    if (value.length === 0) {
        throw new OptionsError(`The option "${option}" must not be empty — omit it instead.`);
    }

    if (UNSAFE_PATTERN_CHARS.test(value) || value.includes('..')) {
        throw new OptionsError(
            `The option "${option}" must be a literal file name segment, but received "${value}".`,
        );
    }
}

/**
 * Default {@see INamingScheme} implementation. Owns both directions of the
 * prefix/suffix/extensions convention: building the glob patterns that discover
 * files (convention → patterns) and deriving an element name from a file path
 * (path → name).
 *
 * Both directions agree on what "follows the convention" means: a file whose
 * name does not match the configured prefix/suffix derives the **root** name
 * (`''`) rather than a truncated one, so an explicitly loaded off-convention
 * file lands where a caller naming a file directly expects it — at the root.
 */
export class NamingScheme implements INamingScheme {
    protected readonly prefix : string | undefined;

    protected readonly suffix : string | undefined;

    protected readonly extensions : string[];

    constructor(options: NamingOptions) {
        if (typeof options.prefix !== 'undefined') {
            assertPatternLiteral(options.prefix, 'prefix');
        }

        if (typeof options.suffix !== 'undefined') {
            assertPatternLiteral(options.suffix, 'suffix');
        }

        if (options.extensions.length === 0) {
            throw new OptionsError('The option "extensions" must not be empty.');
        }

        for (const extension of options.extensions) {
            assertPatternLiteral(extension, 'extensions');
        }

        this.prefix = options.prefix;
        this.suffix = options.suffix;
        this.extensions = options.extensions;
    }

    toPatterns() : string[] {
        const patterns : string[] = [];

        // A single-alternative brace group (`{conf}`) is matched literally by the
        // glob engine, so a one-element list must not be braced at all.
        const extension = this.extensions.length === 1 ?
            this.extensions[0] as string :
            `{${this.extensions.join(',')}}`;

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
        let name = this.toStem(filePath);

        if (this.prefix) {
            if (name === this.prefix) {
                name = '';
            } else if (name.startsWith(`${this.prefix}.`)) {
                name = name.substring(this.prefix.length + 1);
            } else {
                // Off-convention: the caller named this file explicitly, so its
                // keys belong at the root rather than under a namespace derived
                // from an unrelated file name.
                return '';
            }
        }

        if (this.suffix) {
            if (name === this.suffix) {
                name = '';
            } else if (name.endsWith(`.${this.suffix}`)) {
                name = name.substring(0, name.length - (this.suffix.length + 1));
            } else {
                return '';
            }
        }

        return name;
    }

    /**
     * Base name with the extension removed. A leading dot is never treated as an
     * extension separator, so a dotfile (`.projectrc`) and an extensionless file
     * (`Makefile`) keep their whole name instead of collapsing to `''`.
     */
    protected toStem(filePath: string) : string {
        let value = filePath.replace(/\\/g, '/');
        if (value.includes('/')) {
            value = value.substring(value.lastIndexOf('/') + 1);
        }

        const index = value.lastIndexOf('.');

        return index > 0 ? value.substring(0, index) : value;
    }
}
