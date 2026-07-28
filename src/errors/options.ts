/*
 * Copyright (c) 2024.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ConfinityError } from './base';

/**
 * An option passed to a constructor is not usable. Thrown eagerly at
 * construction time rather than surfacing as an empty result at read time.
 */
export class OptionsError extends ConfinityError {

}
