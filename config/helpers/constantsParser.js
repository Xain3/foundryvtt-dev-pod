/**
 * @file constantsParser.js
 * @description This file contains a utility class for parsing and processing constants from YAML input, including root map creation.
 * @path config/helpers/constantsParser.js
 */

import yaml from 'js-yaml';
import PathUtils from '../../helpers/pathUtils.js';

/**
 * A utility class for parsing and processing constants from YAML input.
 * Provides advanced YAML parsing with support for context root map creation and dynamic path resolution.
 *
 * @class
 * @classdesc Advanced YAML parsing with support for context root map creation and dynamic path resolution.
 * @export
 *
 * Public API:
 * - static parseConstants(constants, globalNamespace, parseContextRootMap, module) - Parses YAML string and processes context configuration
 * - static createRootMapFromYaml(config, globalNamespace, module) - Creates dynamic root map function from configuration
 *
 * Features:
 * - YAML string parsing with validation
 * - Context root map processing
 * - Dynamic path resolution using PathUtils
 * - Special value handling ("module", null)
 * - Error logging and re-throwing
 * - Input validation with clear error messages
 */
class ConstantsParser {
  /**
   * Validates input arguments for parseConstants method.
   * Ensures constants is a string and parseContextRootMap is a boolean.
   *
   * @param {*} constants - The constants value to validate.
   * @param {*} parseContextRootMap - The parseContextRootMap value to validate.
   * @throws {TypeError} If constants is not a string or parseContextRootMap is not a boolean.
   * @private
   * @static
   */
  static #validateParseConstantsArgs(constants, parseContextRootMap) {
    if (typeof constants !== 'string') {
      throw new TypeError('constants must be a string');
    }
    if (typeof parseContextRootMap !== 'boolean') {
      throw new TypeError('parseContextRootMap must be a boolean');
    }
  }

  /**
   * Parses a YAML string of constants, performs a deep copy, and processes the context configuration.
   *
   * Loads the YAML string, deeply clones the resulting object, and optionally parses the `context.rootMap`
   * property to create a root map function.
   *
   * @param {string} constants - The YAML string containing the constants to parse.
   * @param {Object} [globalNamespace=globalThis] - The global namespace to use for path resolution.
   * @param {boolean} [parseContextRootMap=true] - Whether to parse the `context.rootMap` property. Defaults to true.
   * @param {Object} [module=null] - The module object to use for root map creation.
   * @returns {Object} The parsed constants object.
   * @throws {TypeError} If constants is not a string or parseContextRootMap is not a boolean.
   * @throws {Error} If YAML parsing fails.
   * @static
   */
  static parseConstants(constants, globalNamespace = globalThis, parseContextRootMap = true, module = null) {
    this.#validateParseConstantsArgs(constants, parseContextRootMap);

    try {
      const parsedConstants = yaml.load(constants);
      globalNamespace = globalNamespace || globalThis;

      if (parseContextRootMap && parsedConstants.context?.remote?.rootMap) {
        parsedConstants.context.rootMap = this.createRootMapFromYaml(
          parsedConstants.context.remote.rootMap,
          globalNamespace,
          module
        );
      }

      return parsedConstants;
    } catch (error) {
      console.error('Error parsing constants:', error);
      throw new Error('Failed to parse constants');
    }
  }

  /**
   * Creates a root map function from a rootMap object.
   * The returned function can be called with globalNamespace and module parameters
   * to generate a root map with resolved paths.
   *
   * @param {Object} rootMapConfig - The rootMap object definition.
   * @param {Object} [globalNamespace=undefined] - The global namespace for path resolution (used as default).
   * @param {Object} [module=undefined] - The module object for root map creation (used as default).
   * @returns {Function} A function that creates the root map when called with (globalNamespace, module).
   * @static
   */
  static createRootMapFromYaml(rootMapConfig) {
    return (runtimeGlobalNamespace, runtimeModule) => {
      const rootMap = {};

      for (const [key, value] of Object.entries(rootMapConfig)) {
        if (value === null) {
          rootMap[key] = null;
        } else if (value === "module") {
          rootMap[key] = runtimeModule;
        } else {
          // Dynamically resolve the path
          rootMap[key] = PathUtils.resolvePath(runtimeGlobalNamespace, value);
        }
      }

      return rootMap;
    };
  }
}

export default ConstantsParser;