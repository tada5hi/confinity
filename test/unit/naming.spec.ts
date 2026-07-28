/*
 * Copyright (c) 2023.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { NamingScheme, OptionsError } from '../../src';

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

        it('should not brace a single extension', () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: ['conf'] });

            // `{conf}` is matched literally by the glob engine, so a
            // one-element list must be emitted bare.
            expect(naming.toPatterns()).toEqual([
                'project.conf',
                'project.*.conf',
            ]);
        });
    });

    describe('validation', () => {
        it('should reject an empty extension list', () => {
            expect(() => new NamingScheme({ extensions: [] })).toThrow(OptionsError);
        });

        it('should reject an empty extension entry', () => {
            expect(() => new NamingScheme({ extensions: [''] })).toThrow(OptionsError);
        });

        it.each([
            ['a/b'],
            ['..'],
            ['../secrets/app'],
            ['**'],
            ['a*'],
            ['a{b,c}'],
            ['a,b'],
            ['a[b]'],
            ['!a'],
        ])('should reject the glob-unsafe prefix %s', (prefix) => {
            expect(() => new NamingScheme({ prefix, extensions: EXTENSIONS }))
                .toThrow(OptionsError);
        });

        it('should reject a glob-unsafe suffix', () => {
            expect(() => new NamingScheme({ suffix: '../x', extensions: EXTENSIONS }))
                .toThrow(OptionsError);
        });

        it('should reject an empty prefix', () => {
            expect(() => new NamingScheme({ prefix: '', extensions: EXTENSIONS }))
                .toThrow(OptionsError);
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

        it('should require a segment boundary before a suffix', () => {
            const naming = new NamingScheme({ suffix: 'server', extensions: EXTENSIONS });

            // 'appserver' ends with 'server' as a substring, not as a segment.
            expect(naming.toName('appserver.conf')).toEqual('');
        });

        it('should require a segment boundary after a prefix', () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });

            expect(naming.toName('projectile.conf')).toEqual('');
        });

        it('should give an off-convention file the root name', () => {
            const naming = new NamingScheme({ prefix: 'project', extensions: EXTENSIONS });

            // Explicitly loaded files need not follow the discovery convention;
            // their keys belong at the root, not under a foreign namespace.
            expect(naming.toName('production.conf')).toEqual('');
        });

        it('should keep the whole name of an extensionless or dot file', () => {
            const naming = new NamingScheme({ extensions: EXTENSIONS });

            expect(naming.toName('Makefile')).toEqual('Makefile');
            expect(naming.toName('.projectrc')).toEqual('.projectrc');
            expect(naming.toName('/etc/hosts')).toEqual('hosts');
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
