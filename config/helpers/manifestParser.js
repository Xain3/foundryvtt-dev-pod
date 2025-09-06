/**
 * @file manifestParser.js
 * @description This file contains the ManifestParser class for validating and processing manifest objects with comprehensive validation rules.
 * @path config/helpers/manifestParser.js
 */

import constants from "../constants.js";

const REQUIRED_MANIFEST_ATTRIBUTES = constants.requiredManifestAttributes;

/**
 * The ManifestParser class provides comprehensive validation and processing for manifest objects.
 * It validates manifest structure, required attributes, and ensures immutability by freezing
 * the manifest and its nested objects. The class supports both array-based and object-based
 * required attribute definitions and provides detailed error messages for validation failures.
 *
 * @class
 * @classdesc Validates and processes manifest objects with support for multiple validation strategies and immutability enforcement.
 * @export
 *
 * Public API:
 * - constructor(manifest) - Creates a new ManifestParser instance with the provided manifest
 * - validateRequiredManifestAttributes() - Validates that required attributes are properly defined
 * - validateImportedManifest() - Validates the manifest structure and type
 * - validateManifestAttributesArray() - Validates array-based required attributes
 * - validateManifestAttributesObject() - Validates object-based required attributes
 * - validateManifestHasRequiredAttributes() - Orchestrates validation based on attribute type
 * - freezeManifest() - Makes the manifest immutable by freezing it and nested objects
 * - getValidatedManifest() - Performs complete validation and returns frozen manifest
 *
 * @property {Object} manifest - The manifest object to validate and process.
 * @property {Array|Object} requiredAttributes - The required attributes configuration from constants.
 */
class ManifestParser {
  /**
   * Creates a new ManifestParser instance with the provided manifest object.
   * Initializes the parser with the manifest and required attributes from constants.
   *
   * @constructor
   * @param {Object} manifest - The manifest object to validate and process.
   */
  constructor(manifest) {
    this.manifest = manifest;
    // If constants did not define required attributes, treat as empty list (no requirements)
    // Explicit null (set later by consumer) will still trigger validation error.
    this.requiredAttributes = (REQUIRED_MANIFEST_ATTRIBUTES === undefined)
      ? []
      : REQUIRED_MANIFEST_ATTRIBUTES;
  }

  /**
   * Validates that the required manifest attributes are properly defined in constants.
   * If required attributes are null/undefined, throws an error. An empty array/object is allowed.
   *
   * @throws {Error} If required manifest attributes are not defined.
   * @returns {void}
   */
  validateRequiredManifestAttributes() {
    if (this.requiredAttributes === null || this.requiredAttributes === undefined) {
      throw new Error("Required manifest attributes are not defined in constants.");
    }
  }

  /**
   * Validates the imported manifest object structure and type.
   * Ensures the manifest exists and is a proper object (not array or primitive).
   *
   * @throws {Error} If manifest data is not available.
   * @throws {Error} If manifest data is not an object.
   */
  validateImportedManifest() {
    if (!this.manifest) {
      throw new Error("Manifest data is not available.");
    }
    if (typeof this.manifest !== 'object' || Array.isArray(this.manifest)) {
      throw new Error("Manifest data is not an object.");
    }
  }

  /**
   * Validates array-based required attributes configuration.
   * Ensures all elements in the required attributes array are strings.
   *
   * @throws {Error} If a required manifest attribute is not a string.
   */
  validateManifestAttributesArray() {
    for (const key of this.requiredAttributes) {
      if (typeof key !== 'string') {
        throw new Error(`Required manifest attribute "${key}" is not a string.`);
      }
    }
  }

  /**
   * Validates object-based required attributes configuration.
   * Ensures the manifest contains all required attributes defined as object keys.
   *
   * @throws {Error} If manifest is missing a required attribute.
   */
  validateManifestAttributesObject() {
    for (const key of Object.keys(this.requiredAttributes)) {
      if (!Object.prototype.hasOwnProperty.call(this.manifest, key)) {
        throw new Error(`Manifest is missing required attribute: ${key}`);
      }
    }
  }

  /**
   * Orchestrates validation of required attributes based on their configuration type.
   * Supports both array-based and object-based required attribute definitions.
   * For arrays, validates both string types and manifest attribute presence.
   * If no required attributes are defined, this validation is skipped.
   *
   * @throws {Error} If required attributes configuration is invalid.
   * @throws {Error} If manifest is missing required attributes.
   */
  validateManifestHasRequiredAttributes() {
    // At this point validateRequiredManifestAttributes has ensured requiredAttributes is defined (can be empty)
    if ((Array.isArray(this.requiredAttributes) && this.requiredAttributes.length === 0) || (typeof this.requiredAttributes === 'object' && !Array.isArray(this.requiredAttributes) && Object.keys(this.requiredAttributes).length === 0)) {
      // Nothing required, skip
      return;
    }

    if (Array.isArray(this.requiredAttributes)) {
      this.validateManifestAttributesArray();
      // Check if manifest has all required attributes from array
      for (const key of this.requiredAttributes) {
        if (!Object.prototype.hasOwnProperty.call(this.manifest, key)) {
          throw new Error(`Manifest is missing required attribute: ${key}`);
        }
      }
    } else if (typeof this.requiredAttributes === 'object') {
      this.validateManifestAttributesObject();
    } else {
      throw new Error("Required manifest attributes must be an array or an object.");
    }
  }

  /**
   * Makes the manifest immutable by freezing it and all nested objects.
   * Applies Object.freeze() to the manifest and recursively to nested objects,
   * while safely handling null values and primitive types.
   */
  freezeManifest() {
    Object.freeze(this.manifest);
    for (const key of Object.keys(this.manifest)) {
      if (typeof this.manifest[key] === 'object' && this.manifest[key] !== null) {
        Object.freeze(this.manifest[key]);
      }
    }
  }

  /**
   * Performs complete validation of the manifest and returns the frozen result.
   * Executes all validation steps in sequence and ensures immutability.
   * This is the main entry point for manifest processing.
   *
   * @returns {Object} The validated and frozen manifest object.
   * @throws {Error} If any validation step fails.
   */
  getValidatedManifest() {
    this.validateRequiredManifestAttributes();
    this.validateImportedManifest();
    this.validateManifestHasRequiredAttributes();
    this.freezeManifest();
    return this.manifest;
  }
}

export default ManifestParser;
