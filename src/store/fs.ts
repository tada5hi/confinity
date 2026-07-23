/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    buildFilePath,
    locateMany,
    locateManySync,
    read as readFile,
    readSync as readFileSync,
} from 'locter';
import path from 'node:path';
import { isObject } from 'smob';
import { NamingScheme } from '../naming';
import type { INamingScheme } from '../naming';
import type { Element } from '../types';
import { Store } from './module';
import type { FSStoreOptions, Reader, ReaderSync } from './types';

function normalizeExtensions(input?: string[]) : string[] {
    if (
        input &&
        input.length > 0
    ) {
        return input.map((extension) => {
            if (extension.startsWith('.')) {
                return extension.substring(1);
            }

            return extension;
        });
    }

    return ['conf', 'js', 'mjs', 'cjs', 'ts', 'mts', 'yml', 'yaml'];
}

/**
 * A {@see Store} that can populate itself from the filesystem. Adds `load` and
 * `loadFile` (plus their synchronous twins `loadSync`/`loadFileSync`) on top of
 * the in-memory store, owning directory resolution, glob discovery (via the
 * {@see INamingScheme}), parsing (incl. the `.default` unwrap and the non-object
 * skip), and parallel loads. Parsing is a swappable port — {@see Reader} for the
 * async path (default locter `read`) and {@see ReaderSync} for the sync path
 * (default locter `readSync`).
 *
 * The async and sync load paths share every pure step — directory/path
 * resolution ({@see resolveDirectories}/{@see resolveFilePath}) and element
 * derivation ({@see toElement}) — and differ only at the two I/O calls
 * (`locateMany`/`read` vs `locateManySync`/`readSync`).
 */
export class FSStore extends Store {
    protected readonly cwd : string;

    protected readonly naming : INamingScheme;

    protected readonly reader : Reader;

    protected readonly readerSync : ReaderSync;

    protected loaded : boolean;

    protected loading : Promise<void> | undefined;

    constructor(options: FSStoreOptions = {}) {
        super({ mergeFn: options.mergeFn });
        this.cwd = options.cwd || process.cwd();
        this.naming = options.naming ?? new NamingScheme({
            prefix: options.prefix,
            suffix: options.suffix,
            extensions: normalizeExtensions(options.extensions),
        });
        this.reader = options.read ?? readFile;
        this.readerSync = options.readSync ?? readFileSync;
        this.loaded = false;
        this.loading = undefined;
    }

    /**
     * Resolve a key, lazily loading from the filesystem on the first call.
     *
     * The default load (`load()`) runs at most once and is shared across
     * concurrent callers; if config was already loaded (eagerly, or via a
     * previous call) it is not re-loaded.
     *
     * @param key
     */
    override async get<T = any>(key: string | string[]) : Promise<T | undefined> {
        if (!this.loaded) {
            this.loading = this.loading ?? this.load();
            await this.loading;
        }

        return this.getSync<T>(key);
    }

    /**
     * Discover, parse and store config files from one or many directories
     * (defaults to the configured cwd).
     *
     * @param input
     */
    async load(input?: string | string[]) : Promise<void> {
        this.addAll(await this.fromDirectories(input));
    }

    /**
     * Synchronous twin of {@see load}: discover, parse and store config files
     * from one or many directories (defaults to the configured cwd) without a
     * promise. Unlike `get`, `getSync` does not trigger this lazily — call it
     * explicitly before a synchronous read.
     *
     * @param input
     */
    loadSync(input?: string | string[]) : void {
        this.addAll(this.fromDirectoriesSync(input));
    }

    /**
     * Parse and store specific file(s), deriving each name via the NamingScheme.
     *
     * @param input
     */
    async loadFile(input: string | string[]) : Promise<void> {
        this.addAll(await this.fromFiles(input));
    }

    /**
     * Synchronous twin of {@see loadFile}: parse and store specific file(s)
     * without a promise, deriving each name via the NamingScheme.
     *
     * @param input
     */
    loadFileSync(input: string | string[]) : void {
        this.addAll(this.fromFilesSync(input));
    }

    protected addAll(elements: Element[]) : void {
        for (const element of elements) {
            this.add(element);
        }

        this.loaded = true;
    }

    protected async fromDirectories(input?: string | string[]) : Promise<Element[]> {
        const filePaths = await this.findFiles(this.resolveDirectories(input));

        return this.fromFiles(filePaths);
    }

    protected fromDirectoriesSync(input?: string | string[]) : Element[] {
        const filePaths = this.findFilesSync(this.resolveDirectories(input));

        return this.fromFilesSync(filePaths);
    }

    protected async fromFiles(input: string | string[]) : Promise<Element[]> {
        if (Array.isArray(input)) {
            const promises = input.map((el) => this.fromFiles(el));
            const results = await Promise.all(promises);
            return results.flat();
        }

        const filePath = this.resolveFilePath(input);
        const element = this.toElement(filePath, await this.reader(filePath));

        return element ? [element] : [];
    }

    protected fromFilesSync(input: string | string[]) : Element[] {
        if (Array.isArray(input)) {
            return input.flatMap((el) => this.fromFilesSync(el));
        }

        const filePath = this.resolveFilePath(input);
        const element = this.toElement(filePath, this.readerSync(filePath));

        return element ? [element] : [];
    }

    protected async findFiles(cwd?: string[] | string) : Promise<string[]> {
        const locations = await locateMany(this.naming.toPatterns(), {
            cwd,
            onlyFiles: true,
        });

        return locations.map(
            (location) => buildFilePath(location),
        );
    }

    protected findFilesSync(cwd?: string[] | string) : string[] {
        const locations = locateManySync(this.naming.toPatterns(), {
            cwd,
            onlyFiles: true,
        });

        return locations.map(
            (location) => buildFilePath(location),
        );
    }

    /**
     * Resolve the load input to a concrete list of directories: each relative
     * entry against `cwd`, absolutes untouched; an empty/omitted input falls
     * back to `cwd`. Pure — shared by the async and sync discovery paths.
     */
    protected resolveDirectories(input?: string | string[]) : string[] {
        let directories : string[] = [];
        if (input) {
            if (Array.isArray(input)) {
                directories = input;
            } else {
                directories = [input];
            }
        }

        if (directories.length > 0) {
            return directories.map((directory) => (
                path.isAbsolute(directory) ?
                    directory :
                    path.resolve(this.cwd, directory)
            ));
        }

        return [this.cwd];
    }

    /**
     * Resolve a single file path against `cwd` (absolutes untouched). Pure —
     * shared by the async and sync file paths.
     */
    protected resolveFilePath(input: string) : string {
        return path.isAbsolute(input) ?
            input :
            path.resolve(this.cwd, input);
    }

    /**
     * Turn a parsed file value into an {@see Element}: unwrap a module
     * `.default`, skip anything that is not a plain object, and derive the name
     * via the NamingScheme. Pure — shared by the async and sync file paths.
     */
    protected toElement(filePath: string, raw: unknown) : Element | undefined {
        // Unwrap a module `.default` by presence, not truthiness — a falsy
        // default export (`export default false`/`0`/`''`) must unwrap to that
        // value and then be skipped by the isObject guard, not stored as `{ default }`.
        const data = isObject(raw) && Object.hasOwn(raw, 'default') ? raw.default : raw;
        if (!isObject(data)) {
            return undefined;
        }

        return {
            data,
            name: this.naming.toName(filePath),
        };
    }
}
