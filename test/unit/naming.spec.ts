/*
 * Copyright (c) 2023.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { NamingScheme } from '../../src';

const EXTENSIONS = ['conf', 'yml', 'yaml'];

/**
 * Minimal glob→RegExp for the subset of syntax the scheme emits: `*`
 * (one path segment) and `{a,b}` brace alternation.
 */
function globToRegExp(pattern: string) : RegExp {
    let out = '';
    for (const ch of pattern) {
        if (ch === '*') {
            out += '[^/]*';
        } else if (ch === '{') {
            out += '(';
        } else if (ch === '}') {
            out += ')';
        } else if (ch === ',') {
            out += '|';
        } else if ('.+^$()[]\\|?'.includes(ch)) {
            out += `\\${ch}`;
        } else {
            out += ch;
        }
    }

    return new RegExp(`^${out}$`);
}

function matchesAny(patterns: string[], name: string) : boolean {
    return patterns.some((pattern) => globToRegExp(pattern).test(name));
}

describe('src/naming', () => {
    describe('toPatterns', () => {
        it('should build a single pattern for prefix + suffix', () => {
            const naming = new NamingScheme({
                prefix: 'project',
                suffix: 'server',
                extensions: EXTENSIONS,
            });

            expect(naming.toPatterns()).toEqual(['project.*.server.{conf,yml,yaml}']);
        });

        it('should build two patterns for a prefix only', () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });

            expect(naming.toPatterns()).toEqual([
                'project.{conf,yml,yaml}',
                'project.*.{conf,yml,yaml}',
            ]);
        });

        it('should build two patterns for a suffix only', () => {
            const naming = new NamingScheme({ suffix: 'server', extensions: EXTENSIONS });

            expect(naming.toPatterns()).toEqual([
                'server.{conf,yml,yaml}',
                '*.server.{conf,yml,yaml}',
            ]);
        });

        it('should build a wildcard pattern for neither', () => {
            const naming = new NamingScheme({ extensions: EXTENSIONS });

            expect(naming.toPatterns()).toEqual(['*.{conf,yml,yaml}']);
        });
    });

    describe('toName', () => {
        it('should strip a prefix and the adjoining dot', () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });

            expect(naming.toName('project.server.conf')).toEqual('server');
        });

        it('should yield an empty name for the bare prefix', () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });

            expect(naming.toName('project.conf')).toEqual('');
        });

        it('should preserve dotted middle segments', () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });

            expect(naming.toName('project.a.b.conf')).toEqual('a.b');
        });

        it('should strip a suffix and the adjoining dot', () => {
            const naming = new NamingScheme({ suffix: 'server', extensions: EXTENSIONS });

            expect(naming.toName('project.server.conf')).toEqual('project');
        });

        it('should strip a suffix with no adjoining dot', () => {
            const naming = new NamingScheme({ suffix: 'server', extensions: EXTENSIONS });

            expect(naming.toName('appserver.conf')).toEqual('app');
        });

        it('should strip both prefix and suffix', () => {
            const naming = new NamingScheme({
                prefix: 'project',
                suffix: 'server',
                extensions: EXTENSIONS,
            });

            expect(naming.toName('project.app.server.conf')).toEqual('app');
        });

        it('should keep the base name when neither prefix nor suffix applies', () => {
            const naming = new NamingScheme({ extensions: EXTENSIONS });

            expect(naming.toName('scalar.yml')).toEqual('scalar');
        });

        it('should extract the base name from a nested path', () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });

            expect(naming.toName('/a/b/project.server.conf')).toEqual('server');
        });

        it('should handle windows-style separators', () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });

            expect(naming.toName('C:\\a\\project.server.conf')).toEqual('server');
        });
    });

    describe('round-trip', () => {
        it('should match a name it would derive (prefix + suffix)', () => {
            const naming = new NamingScheme({
                prefix: 'project',
                suffix: 'server',
                extensions: EXTENSIONS,
            });
            const fileName = 'project.core.server.conf';

            expect(naming.toName(fileName)).toEqual('core');
            expect(matchesAny(naming.toPatterns(), fileName)).toBe(true);
        });

        it('should match a name it would derive (prefix only)', () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });

            expect(matchesAny(naming.toPatterns(), 'project.conf')).toBe(true);
            expect(matchesAny(naming.toPatterns(), 'project.server.conf')).toBe(true);
        });

        it('should match a name it would derive (suffix only)', () => {
            const naming = new NamingScheme({ suffix: 'server', extensions: EXTENSIONS });

            expect(matchesAny(naming.toPatterns(), 'project.server.yml')).toBe(true);
        });
    });
});
