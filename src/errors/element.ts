/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ConfinityError } from './base';

/**
 * An element handed to `add` is malformed. Thrown at `add` time rather than as
 * a `localeCompare is not a function` from a later, unrelated read.
 */
export class ElementError extends ConfinityError {

}
