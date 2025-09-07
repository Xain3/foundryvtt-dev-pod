/**
 * @file config.js
 * @description This file provides the central configuration access point for the entire module.
 * @path config/config.js
 */

import constants from "./constants.js";
import manifest from "./manifest.js";
import defaults from "./defaults.js";

/**
 * Central configuration facade exposing three frozen objects:
 * - `constants`: Authoritative static configuration (from constants.yaml)
 * - `defaults`: Baseline tunable defaults (from defaults.yaml)
 * - `manifest`: Validated project metadata (from package.json)
 *
 * This class performs no transformation—each dependency module encapsulates its
 * own validation and immutability. Importing `config` centralizes access and
 * reduces repeated import boilerplate elsewhere.
 *
 * @class Config
 * @since 1.0.0
 */
class Config {
  /**
   * @constructor
   */
  constructor() {
    /** @type {Object} */
    this.constants = constants;

    /** @type {Object} */
    this.manifest = manifest;

    /** @type {Object} */
    this.defaults = defaults
  }
}

/**
 * Singleton configuration instance.
 * @type {Config}
 */
const config = new Config();

export default config;
