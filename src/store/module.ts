/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expandPath, getPathInfo } from 'pathtrace';
import { createMerger, isObject } from 'smob';
import type { Element, MergeFn } from '../types';
import { AbstractStore } from './base';
import type { StoreOptions } from './types';

/**
 * Default in-memory {@see IStore} implementation. Owns the element array, its
 * lazy sort, key↔name matching, path resolution (via pathtrace), and merge
 * precedence. Synchronous only — `getAsync` throws (inherited from
 * {@see AbstractStore}); an in-memory lookup has no reason to be async.
 */
export class Store extends AbstractStore {
    protected items : Element[];

    protected itemsSorted : boolean;

    protected readonly mergeFn : MergeFn;

    constructor(options: StoreOptions = {}) {
        super();
        this.items = [];
        this.itemsSorted = true;
        this.mergeFn = options.mergeFn ?? createMerger({
            array: false,
            inPlace: false,
        });
    }

    add(element: Element) : void {
        this.items.push(element);
        this.itemsSorted = false;
    }

    override get<T = any>(key: string | string[]) : T | undefined {
        if (!this.itemsSorted) {
            this.items.sort((a, b) => a.name.localeCompare(b.name));
            this.itemsSorted = true;
        }

        let output : unknown;

        if (Array.isArray(key)) {
            for (const keyItem of key) {
                const value = this.get(keyItem);
                if (typeof output !== 'undefined') {
                    output = this.merge(value, output);
                } else {
                    output = value;
                }
            }

            return output as T;
        }

        for (const item of this.items) {
            let temp: string;
            if (item.name) {
                if (key.length > 0) {
                    if (key === item.name) {
                        temp = '';
                    } else if (key.startsWith(item.name)) {
                        let startIndex = item.name.length;
                        if (key.charAt(startIndex) === '.') {
                            startIndex++;
                        }
                        temp = key.substring(startIndex);
                    } else {
                        continue;
                    }
                } else {
                    temp = key;
                }
            } else {
                temp = key;
            }

            if (temp.length === 0) {
                output = this.merge(item.data, output);
            } else {
                const paths = expandPath(item.data, temp);
                for (const expandedPath of paths) {
                    const info = getPathInfo(item.data, expandedPath);
                    if (info.exists) {
                        output = this.merge(info.value, output);
                    }
                }
            }
        }

        return output as T;
    }

    protected merge(primary: unknown | undefined, secondary: unknown) {
        if (typeof primary === 'undefined') {
            return secondary;
        }

        if (
            isObject(primary) &&
            isObject(secondary)
        ) {
            return this.mergeFn(primary, secondary);
        }

        return primary;
    }
}
