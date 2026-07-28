/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type Element = {
    name: string,
    data: Record<string, unknown>,
    /**
     * Absolute path of the file this element was parsed from, when it came from
     * one. Provenance only — never used for matching.
     */
    source?: string
};

/**
 * Deep-merge two records into a new one.
 *
 * **Must be pure.** The store hands a defensive copy in as `target`, but a
 * merger that writes into `source` (or that returns either argument by
 * reference) reintroduces the aliasing that copy exists to prevent.
 */
export type MergeFn = (
    target: Record<string, unknown>,
    source: Record<string, unknown>,
) => Record<string, unknown>;
