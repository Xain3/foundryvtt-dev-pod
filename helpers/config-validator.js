/**
 * @file config-validator.js
 * @description Container configuration validation with caching support
 * @path helpers/config-validator.js
 */

import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

class ConfigValidator {
  constructor(options = {}) {
    this.schemaPath = options.schemaPath || null; // Placeholder if schema-based validation added later
  }

  loadConfig(configPath) {
    if (!fs.existsSync(configPath)) {
      return { error: `Config file not found: ${configPath}` };
    }
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      return { config: JSON.parse(content) };
    } catch (err) {
      return { error: `Validation error: ${err.message}` };
    }
  }

  validateStructure(config) {
    const errors = [];

    if (!config.systems || typeof config.systems !== 'object') {
      errors.push('root: must have required property "systems"');
    }
    if (!config.modules || typeof config.modules !== 'object') {
      errors.push('root: must have required property "modules"');
    }
    if (!config.versions || typeof config.versions !== 'object') {
      errors.push('root: must have required property "versions"');
    }

    if (config.systems) {
      for (const [id, item] of Object.entries(config.systems)) {
        if (!item.name) {
          errors.push(`/systems/${id}: must have required property "name"`);
        }
        if (!item.manifest && !item.path) {
          errors.push(`/systems/${id}: must have either "manifest" or "path" property`);
        }
      }
    }

    if (config.modules) {
      for (const [id, item] of Object.entries(config.modules)) {
        if (!item.name) {
          errors.push(`/modules/${id}: must have required property "name"`);
        }
        if (!item.manifest && !item.path) {
          errors.push(`/modules/${id}: must have either "manifest" or "path" property`);
        }
      }
    }

    if (config.versions) {
      for (const [version, versionConfig] of Object.entries(config.versions)) {
        if (!versionConfig.install) {
          errors.push(`/versions/${version}: must have required property "install"`);
        }
        if (versionConfig.install) {
          if (!versionConfig.install.systems || typeof versionConfig.install.systems !== 'object') {
            errors.push(`/versions/${version}/install: must have required property "systems"`);
          }
          if (!versionConfig.install.modules || typeof versionConfig.install.modules !== 'object') {
            errors.push(`/versions/${version}/install: must have required property "modules"`);
          }
        }
      }
    }

    return errors;
  }

  validate(configPath) {
    const { config, error } = this.loadConfig(configPath);
    if (error) {
      return { valid: false, errors: [error] };
    }

    const errors = this.validateStructure(config);
    // If structural errors found, return them first
    if (errors.length) {
      return { valid: false, errors };
    }

    // Perform optional JSON Schema validation if a schema path is configured
    const schemaPath = this.schemaPath;
    if (schemaPath) {
      if (!fs.existsSync(schemaPath)) {
        return { valid: false, errors: [`Schema file not found: ${schemaPath}`] };
      }
      try {
        const schemaContent = fs.readFileSync(schemaPath, 'utf8');
        const schema = JSON.parse(schemaContent);
        const ajv = new Ajv({ allErrors: true, strict: false });
        
        // For now, skip ajv-formats loading in ESM until we can properly handle async imports
        // This maintains basic schema validation functionality
        
        const validate = ajv.compile(schema);
        const valid = validate(config);
        if (!valid && validate.errors && validate.errors.length) {
          const schemaErrors = validate.errors.map(e => {
            const instancePath = e.instancePath || e.dataPath || '';
            const prop = instancePath || '/';
            if (e.keyword === 'additionalProperties' && e.params && e.params.additionalProperty) {
              return `schema${prop}: must NOT have additional property ${e.params.additionalProperty}`;
            }
            return `schema${prop}: ${e.message}`;
          });
          return { valid: false, errors: schemaErrors };
        }
      } catch {
        return { valid: false, errors: [`Schema validation error`] };
      }
    }

    return { valid: true };
  }
}

/**
 * Calculate a simple hash of a file for caching purposes.
 * @param {string} filePath - Path to the file to hash
 * @returns {string} Simple hash combining file length, first/last chars, and mtime
 */
function calculateFileHash(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let hash = content.length.toString(36);
  if (content.length > 0) {
    hash += content.charCodeAt(0).toString(36);
    hash += content.charCodeAt(content.length - 1).toString(36);
  }
  const stat = fs.statSync(filePath);
  hash += stat.mtime.getTime().toString(36);
  return hash;
}

/**
 * Validate with caching support using file hashes to avoid re-validation.
 * @param {string} configPath - Path to the configuration file
 * @param {string} schemaPath - Path to the schema file
 * @param {string} cacheDir - Cache directory path
 * @param {ConfigValidator} validator - Validator instance to use
 * @returns {object} Validation result with valid/invalid status and errors
 */
function validateConfigWithCache(configPath, schemaPath, cacheDir, validator = new ConfigValidator({ schemaPath })) {
  const defaultCacheDir = process.env.TMPDIR || process.env.TMP || '/tmp';
  const actualCacheDir = cacheDir || defaultCacheDir;

  if (!fs.existsSync(actualCacheDir)) {
    fs.mkdirSync(actualCacheDir, { recursive: true });
  }

  let schemaHashPart = '';
  if (schemaPath && fs.existsSync(schemaPath)) {
    try {
      schemaHashPart = calculateFileHash(schemaPath).slice(0, 6);
    } catch { /* ignore */ }
  } else if (schemaPath) {
    schemaHashPart = 'missing';
  }
  const configHash = calculateFileHash(configPath) + '-' + schemaHashPart;
  const cacheFile = path.join(actualCacheDir, `fvtt-config-validation-${configHash}.json`);

  if (fs.existsSync(cacheFile)) {
    try {
      const cachedResult = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cachedResult && typeof cachedResult.valid === 'boolean') {
        return { ...cachedResult, cached: true };
      }
      // Corrupt structure => treat as miss
    } catch {
      try { fs.unlinkSync(cacheFile); } catch {}
    }
  }

  const result = validator.validate(configPath);
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf8');
  } catch {}
  return { ...result, cached: false };
}

/**
 * @export ConfigValidator - Main configuration validator class
 * @export validateConfigWithCache - Validation with caching support
 * @export calculateFileHash - File hash calculation utility
 */
export { ConfigValidator, validateConfigWithCache, calculateFileHash };
