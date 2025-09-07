/**
 * @file defaults.js
 * @description Exports parsed baseline defaults from `config/defaults.yaml` using a configured `ConstantsBuilder` instance.
 * @path config/defaults.js
 *
 * Differences vs `constants.js`:
 * - Uses explicit `yamlPath: ./defaults.yaml` rather than internal getter
 * - Disables root map parsing (`parseContextRootMap: false`) to treat values as static
 * - Intended for user‑tunable or seed defaults rather than authoritative constants
 *
 * Immutability: Frozen at export time. Modify by creating a new builder with overrides.
 */

import ConstantsBuilder from "./helpers/constantsBuilder.js";

const builder = new ConstantsBuilder({
  yamlPath: "./config/defaults.yaml",
  parseContextRootMap: false,
  globalNamespace: globalThis,
  moduleRef: null
});

/**
 * Parsed and frozen defaults object.
 *
 * @example
 * import defaults from './config/defaults.js';
 * console.log(defaults.testDefault);
 *
 * @type {Object}
 * @readonly
 */
const defaults = Object.freeze(builder.asObject);

export default defaults;