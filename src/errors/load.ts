/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ConfinityError } from './base';

/**
 * A config file could not be read or parsed. Unlike the raw dependency error,
 * this always names the file.
 */
export class LoadError extends ConfinityError {
    readonly path : string;

    constructor(path: string, options?: ErrorOptions) {
        super(`The file "${path}" could not be loaded.`, options);

        this.path = path;
    }
}
