/**
 * @file constants.js
 * @description Exports parsed, frozen constant definitions sourced from `config/constants.yaml` using `ConstantsBuilder` with default resolution precedence.
 * @path config/constants.js
 *
 * Resolution precedence (first available wins):
 * 1. options.yamlString (not provided here)
 * 2. options.getter() (not provided here)
 * 3. options.yamlPath (not provided here)
 * 4. Fallback: internal `ConstantsGetter` loads `config/constants.yaml`
 *
 * Root map / context processing remains enabled by default; if the YAML supplies
 * `context.remote.rootMap`, a dynamic factory is attached at `context.rootMap`.
 *
 * Immutability: the returned object is frozen here and its nested structures are
 * assumed to be plain configuration values (no mutation expected). For additional
 * customization create a local builder:
 *
 * @example
 * import ConstantsBuilder from './config/helpers/constantsBuilder.js';
 * const builder = new ConstantsBuilder({ yamlPath: './other.yaml', parseContextRootMap: false });
 * const otherConstants = Object.freeze(builder.asObject);
 */

import ConstantsBuilder from "./helpers/constantsBuilder.js";

/**
 * Parsed & frozen constants object from `constants.yaml`.
 *
 * Uses `new ConstantsBuilder().asObject` (no options) which defaults to:
 * - Source: `config/constants.yaml`
 * - `parseContextRootMap`: true (if applicable in file)
 * - `globalNamespace`: `globalThis`
 * - `moduleRef`: null
 *
 * @example
 * import constants from 'config/constants.js';
 * console.log(constants.testConstant);
 *
 * @type {Object}
 * @readonly
 */
const constants = Object.freeze(new ConstantsBuilder({ yamlPath: "./config/constants.yaml" }).asObject);

export default constants;