/**
 * @file manifest.js
 * @description Imports `package.json`, validates required attributes (configured in `constants.requiredManifestAttributes`) via `ManifestParser`, freezes, and exports the manifest object.
 * @path config/manifest.js
 *
 * Validation steps performed by `ManifestParser`:
 * - Ensures required attribute configuration is defined (throws if explicitly set to null)
 * - Ensures manifest is a non-null object
 * - Confirms each required attribute exists (array or object form)
 * - Freezes the manifest and shallow-nested objects for immutability
 *
 * Usage note: This evaluation happens once at module import; subsequent imports reuse the cached frozen object.
 */
import fs from 'node:fs';
import path from 'node:path';
const manifestPath = path.join(process.cwd(), 'package.json');
const importedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
import ManifestParser from "./helpers/manifestParser.js";

/**
 * Validated & frozen manifest exported at module load.
 *
 * Throws if:
 * - Required attributes configuration is missing (explicit null)
 * - Manifest is null / not an object
 * - Any required attribute is absent
 *
 * @example
 * import manifest from './config/manifest.js';
 * console.log(manifest.name, manifest.version);
 *
 * @type {Object}
 * @throws {Error} On validation failure
 */
const parser = new ManifestParser(importedManifest);

/** @type {Object} */
const manifest = parser.getValidatedManifest();

export default manifest;
