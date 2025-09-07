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
	 * @param {*} constants Incoming constants YAML string
	 * @param {*} parseContextRootMap Flag indicating rootMap parsing
	 * @throws {TypeError} On invalid argument types
	 * @private
	 * @static
	 */
	static #validateParseConstantsArgs(constants, parseContextRootMap) {
		if (typeof constants !== 'string') throw new TypeError('constants must be a string');
		if (typeof parseContextRootMap !== 'boolean') throw new TypeError('parseContextRootMap must be a boolean');
	}

	/**
	 * Internal utility: plain object guard.
	 * @param {any} v Value to test
	 * @returns {boolean} Is plain object
	 * @private
	 * @static
	 */
	static #isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

	/**
	 * Parses a YAML string of constants and optionally converts context.remote.rootMap into a factory function.
	 * Uses a minimal YAML schema to reduce attack surface.
	 * @param {string} constants YAML string
	 * @param {Object} [globalNamespace=globalThis] Provided for backwards compatibility (currently not pre-bound)
	 * @param {boolean} [parseContextRootMap=true] Whether to transform remote.rootMap
	 * @param {Object} [module=null] Module object placeholder (not bound until factory invocation)
	 * @returns {Object} Parsed constants object (mutated with context.rootMap function if enabled)
	 * @throws {TypeError|Error}
	 * @static
	 */
	static parseConstants(constants, globalNamespace = globalThis, parseContextRootMap = true, module = null) { // eslint-disable-line no-unused-vars
		this.#validateParseConstantsArgs(constants, parseContextRootMap);
		try {
			// Use CORE_SCHEMA to allow standard scalars (ints, bools, null) without custom unsafe tags
			const parsedConstants = yaml.load(constants, { schema: yaml.CORE_SCHEMA });
			if (parseContextRootMap && parsedConstants?.context?.remote?.rootMap && this.#isPlainObject(parsedConstants.context.remote.rootMap)) {
				// Replace with factory (deferred resolution). We DO NOT pre-bind globalNamespace/module to preserve runtime flexibility.
				const cfg = parsedConstants.context.remote.rootMap;
				parsedConstants.context.rootMap = this.createRootMapFromYaml(cfg);
			}
			return parsedConstants;
		} catch (error) {
			console.error('Error parsing constants:', error);
			throw new Error('Failed to parse constants');
		}
	}

	/**
	 * Creates a root map factory from rootMap configuration.
	 * Accepts either the direct map or an object with a rootMap property.
	 * @param {Object} rootMapConfig Root map configuration or wrapper { rootMap: {...} }
	 * @returns {Function} Factory (runtimeGlobalNamespace, runtimeModule) => resolved rootMap object
	 * @static
	 */
	static createRootMapFromYaml(rootMapConfig) {
		const effectiveConfig = (this.#isPlainObject(rootMapConfig) && this.#isPlainObject(rootMapConfig.rootMap))
			? rootMapConfig.rootMap
			: rootMapConfig;
		if (!this.#isPlainObject(effectiveConfig)) {
			throw new TypeError('rootMapConfig must be a plain object or contain a plain object rootMap property');
		}
		return (runtimeGlobalNamespace, runtimeModule) => {
			const rootMap = {};
			for (const [key, value] of Object.entries(effectiveConfig)) {
				if (value === null) {
					rootMap[key] = null;
				} else if (value === 'module') {
					rootMap[key] = runtimeModule;
				} else if (typeof value === 'string') {
					rootMap[key] = PathUtils.resolvePath(runtimeGlobalNamespace, value);
				} else {
					// Preserve unexpected types (defensive, avoids throwing in existing tests)
					rootMap[key] = value;
				}
			}
			return rootMap;
		};
	}
}

export default ConstantsParser;
