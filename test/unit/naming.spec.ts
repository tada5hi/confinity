/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { NamingScheme } from '../../src';

/**
 * Convert one of the glob patterns emitted by {@link NamingScheme.toPatterns}
 * into an anchored RegExp, so tests can assert a pattern actually matches a
 * synthetic file name. Only the glob features the scheme uses are supported:
 * `*` (any run of non-separator chars), `{a,b,c}` brace alternation, and
 * literal dots.
 */
function globToRegExp(pattern: string): RegExp {
    let source = '';
    for (const char of pattern) {
        if (char === '*') {
            source += '[^/]*';
        } else if (char === '{') {
            source += '(';
        } else if (char === '}') {
            source += ')';
        } else if (char === ',') {
            source += '|';
        } else {
            source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
    }

    return new RegExp(`^${source}$`);
}

function matchesAnyPattern(scheme: NamingScheme, fileName: string): boolean {
    return scheme.toPatterns().some((pattern) => globToRegExp(pattern).test(fileName));
}

describe('src/naming', () => {
    describe('toPatterns', () => {
        it('should build a middle-segment pattern for prefix and suffix', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                suffix: 'server',
                extensions: ['conf'],
            });

            expect(scheme.toPatterns()).toEqual([
                'project.*.server.{conf}',
            ]);
        });

        it('should build patterns for a prefix only', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                extensions: ['conf'],
            });

            expect(scheme.toPatterns()).toEqual([
                'project.{conf}',
                'project.*.{conf}',
            ]);
        });

        it('should build patterns for a suffix only', () => {
            const scheme = new NamingScheme({
                suffix: 'server',
                extensions: ['conf'],
            });

            expect(scheme.toPatterns()).toEqual([
                'server.{conf}',
                '*.server.{conf}',
            ]);
        });

        it('should build a wildcard pattern for neither prefix nor suffix', () => {
            const scheme = new NamingScheme({ extensions: ['conf'] });

            expect(scheme.toPatterns()).toEqual([
                '*.{conf}',
            ]);
        });

        it('should brace-expand multiple extensions', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                extensions: ['yml', 'yaml'],
            });

            expect(scheme.toPatterns()).toEqual([
                'project.{yml,yaml}',
                'project.*.{yml,yaml}',
            ]);
        });
    });

    describe('toName', () => {
        it('should strip a prefix', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                extensions: ['conf'],
            });

            expect(scheme.toName('project.server.conf')).toEqual('server');
        });

        it('should strip a suffix', () => {
            const scheme = new NamingScheme({
                suffix: 'server',
                extensions: ['conf'],
            });

            expect(scheme.toName('project.server.conf')).toEqual('project');
        });

        it('should strip both a prefix and a suffix', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                suffix: 'server',
                extensions: ['conf'],
            });

            expect(scheme.toName('project.core.server.conf')).toEqual('core');
        });

        it('should strip neither a prefix nor a suffix', () => {
            const scheme = new NamingScheme({ extensions: ['conf'] });

            expect(scheme.toName('project.conf')).toEqual('project');
        });

        it('should keep dotted middle segments intact', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                extensions: ['conf'],
            });

            expect(scheme.toName('project.server.core.conf')).toEqual('server.core');
        });

        it('should reduce a base file to an empty name when it is only the prefix', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                extensions: ['conf'],
            });

            expect(scheme.toName('project.conf')).toEqual('');
        });

        it('should only strip a prefix at a dot boundary', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                extensions: ['conf'],
            });

            expect(scheme.toName('projectfoo.conf')).toEqual('foo');
        });

        it('should only strip a suffix at a dot boundary', () => {
            const scheme = new NamingScheme({
                suffix: 'server',
                extensions: ['conf'],
            });

            expect(scheme.toName('fooserver.conf')).toEqual('foo');
        });

        it('should leave the name untouched when the prefix does not match', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                extensions: ['conf'],
            });

            expect(scheme.toName('other.conf')).toEqual('other');
        });

        it('should extract the base name from a nested posix path', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                extensions: ['conf'],
            });

            expect(scheme.toName('/abs/path/test/data/project.server.conf')).toEqual('server');
        });

        it('should extract the base name from a windows-style path', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                extensions: ['conf'],
            });

            expect(scheme.toName('C:\\configs\\project.server.conf')).toEqual('server');
        });
    });

    describe('round-trip', () => {
        it('should match a prefix+suffix file name against its own patterns', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                suffix: 'server',
                extensions: ['conf'],
            });

            const fileName = 'project.core.server.conf';

            expect(matchesAnyPattern(scheme, fileName)).toBe(true);
            expect(scheme.toName(fileName)).toEqual('core');
        });

        it('should match a prefix-only file name against its own patterns', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                extensions: ['conf'],
            });

            const fileName = 'project.server.conf';

            expect(matchesAnyPattern(scheme, fileName)).toBe(true);
            expect(scheme.toName(fileName)).toEqual('server');
        });

        it('should match a suffix-only file name against its own patterns', () => {
            const scheme = new NamingScheme({
                suffix: 'server',
                extensions: ['conf'],
            });

            const fileName = 'project.server.conf';

            expect(matchesAnyPattern(scheme, fileName)).toBe(true);
            expect(scheme.toName(fileName)).toEqual('project');
        });

        it('should match an unprefixed file name against its own pattern', () => {
            const scheme = new NamingScheme({ extensions: ['conf'] });

            const fileName = 'project.conf';

            expect(matchesAnyPattern(scheme, fileName)).toBe(true);
            expect(scheme.toName(fileName)).toEqual('project');
        });

        it('should match across every extension in a multi-extension scheme', () => {
            const scheme = new NamingScheme({
                prefix: 'project',
                extensions: ['yml', 'yaml'],
            });

            for (const extension of ['yml', 'yaml']) {
                expect(matchesAnyPattern(scheme, `project.web.${extension}`)).toBe(true);
            }
        });
    });
});
