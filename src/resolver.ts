/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expandPath, getPathInfo } from 'pathtrace';
import { createMerger, isObject } from 'smob';
import type { Element, MergeFn } from './types';

export class Resolver {
    protected items : Element[];

    protected itemsSorted : boolean;

    protected readonly mergeFn : MergeFn;

    constructor(options: { mergeFn?: MergeFn } = {}) {
        this.items = [];
        this.itemsSorted = true;
        this.mergeFn = options.mergeFn || createMerger({
            array: false,
            inPlace: false,
        });
    }

    /**
     * Add a named config element to the store.
     *
     * @param element
     */
    add(element: Element) : void {
        this.items.push(element);
        this.itemsSorted = false;
    }

    /**
     * Resolve a dotted key (or array of keys), deep-merged across all elements.
     *
     * @param key
     */
    get<T = any>(key: string | string[]) : T | undefined {
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
