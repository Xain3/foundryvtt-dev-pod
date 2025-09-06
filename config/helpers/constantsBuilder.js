/**
 * @file constantsBuilder.js
 * @description Flexible ConstantsBuilder for retrieving and parsing constant values from YAML sources with injectable behavior.
 * @path config/helpers/constantsBuilder.js
 */

import ConstantsParser from "./constantsParser.js";
import ConstantsGetter from "./constantsGetter.js";
import fs from 'fs';
import path from 'path';

/**
 * The ConstantsBuilder class is responsible for retrieving and parsing constant values
 * from a YAML source. It provides access to both the raw YAML string and its parsed
 * object representation. The class uses helper utilities to fetch and parse the constants,
 * and caches the results for efficient repeated access.
 *
 * @class
 * @classdesc Retrieves and parses constants from a YAML source, providing both string and object representations.
 * @export
 *
 * Public API:
 * - constructor() - Creates a new ConstantsBuilder instance and loads constants
 * - get asString() - Returns the YAML string representation of constants
 * - get asObject() - Returns the parsed object representation of constants
 *
 * @property {string} asString - The YAML string representation of the constants.
 * @property {Object} asObject - The parsed object representation of the constants.
 */
class ConstantsBuilder {
  #string; // Cached YAML string
  #parsedObject; // Cached parsed object
  #options; // Original options for reference

  /**
   * Creates a new ConstantsBuilder instance with flexible options.
   *
   * @param {Object} [options={}] - Configuration options.
   * @param {string} [options.yamlString] - Provide raw YAML directly (bypasses file / getter).
   * @param {string} [options.yamlPath] - Absolute or relative path to a YAML file to read.
   * @param {Function} [options.getter] - Custom function returning YAML string (overrides default getter).
   * @param {Function} [options.parser] - Custom parser function (signature: (yamlString, globalNamespace, parseContextRootMap, moduleRef) => object).
   * @param {boolean} [options.parseContextRootMap=true] - Whether to parse context root map.
   * @param {Object} [options.globalNamespace=globalThis] - Global namespace passed to parser.
   * @param {Object} [options.moduleRef=null] - Module reference passed to parser for root map resolution.
   */
  constructor(options = {}) {
    this.#options = { parseContextRootMap: true, globalNamespace: globalThis, moduleRef: null, ...options };
    this.#initialize();
  }

  /**
   * Resolve a YAML string using precedence: explicit yamlString > getter > yamlPath > default getter.
   * @returns {string}
   * @private
   */
  #resolveYamlString() {
    const { yamlString, getter, yamlPath } = this.#options;
    if (yamlString) return yamlString;
    if (typeof getter === 'function') {
      const value = getter();
      if (typeof value !== 'string') throw new Error('Custom getter must return a YAML string.');
      return value;
    }
    if (yamlPath) {
      const resolved = path.isAbsolute(yamlPath) ? yamlPath : path.join(process.cwd(), yamlPath);
      if (!fs.existsSync(resolved)) throw new Error(`YAML path not found: ${resolved}`);
      return fs.readFileSync(resolved, 'utf8');
    }
    return ConstantsGetter.getConstantsYaml();
  }

  /**
   * Initialize internal caches by loading and parsing YAML.
   * @private
   */
  #initialize() {
    this.#string = this.#resolveYamlString();
    const parser = this.#options.parser || ConstantsParser.parseConstants.bind(ConstantsParser);
    this.#parsedObject = parser(
      this.#string,
      this.#options.globalNamespace,
      this.#options.parseContextRootMap,
      this.#options.moduleRef
    );
  }

  /**
   * Returns the YAML string representation of the constants.
   * @returns {string}
   */
  get asString() { return this.#string; }

  /**
   * Returns the parsed constants object.
   * @returns {Object}
   */
  get asObject() { return this.#parsedObject; }

  /**
   * Returns the options used to create this instance (immutable copy).
   * @returns {Object}
   */
  get options() { return Object.freeze({ ...this.#options }); }
}

export default ConstantsBuilder;