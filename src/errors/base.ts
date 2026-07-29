/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * Base class for every error thrown by confinity itself. An error surfacing
 * from a dependency (a parse failure from locter, for example) is wrapped in a
 * {@see LoadError} so the offending file path is always available, but keeps
 * the original as `cause`.
 */
export class ConfinityError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);

        this.name = new.target.name;
    }
}
