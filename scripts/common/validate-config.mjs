/**
 * @file validate-config.mjs
 * @description Common module for container configuration validation logic
 * @path scripts/common/validate-config.mjs
 */

import path from 'node:path';
import { ConfigValidator, validateConfigWithCache as classValidateWithCache } from '#helpers/config-validator.js';

/**
 * Validate a container configuration file against basic structural requirements.
 * @param {string} configPath - Path to config file
 * @param {string} [schemaPath] - Path to schema file
 * @returns {Object} Validation result with valid boolean and errors array
 */
export function validateConfig(configPath, schemaPath) {
  const validator = new ConfigValidator({ schemaPath });
  return validator.validate(configPath);
}

/**
 * Validate with caching support.
 * @param {string} configPath - Path to config file
 * @param {string} [schemaPath] - Path to schema file
 * @param {string} [cacheDir] - Cache directory
 * @returns {Object} Validation result with valid boolean, errors array, and cached boolean
 */
export function validateConfigWithCache(configPath, schemaPath, cacheDir) {
  return classValidateWithCache(configPath, schemaPath, cacheDir, new ConfigValidator({ schemaPath }));
}

/**
 * Check configuration with optional caching.
 * @param {boolean} useCache - Whether to use cache
 * @param {string} configPath - Path to config file
 * @param {string} [cacheDir] - Cache directory
 * @returns {Object} Validation result
 */
export function checkConfigWithCache(useCache, configPath, cacheDir) {
  return useCache
    ? validateConfigWithCache(configPath, null, cacheDir)
    : validateConfig(configPath);
}

/**
 * Parse command line arguments for validation script.
 * @param {string[]} args - Command line arguments
 * @returns {Object|null} Parsed arguments or null if parsing failed
 */
export function parseCommandLineArgs(args) {
  const positional = args.filter(arg => !arg.startsWith('--'));
  const configPath = positional[0];
  const cacheDir = positional[1];
  const useCache = !args.includes('--no-cache');

  if (!configPath) {
    console.error('Error: config-path is required');
    process.exit(1);
    return null;
  }
  return { useCache, configPath, cacheDir };
}

/**
 * Show help message for validation script.
 * @param {string[]} args - Command line arguments
 * @returns {boolean} True if help was shown
 */
export function showHelpMessage(args) {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: ${path.basename(process.argv[1])} <config-path> [cache-dir]`);
    console.log('');
    console.log('Validate a container configuration file.');
    console.log('');
    console.log('Arguments:');
    console.log('  config-path   Path to the container-config.json file (required)');
    console.log('  cache-dir     Directory for caching validation results (optional)');
    console.log('');
    console.log('Options:');
    console.log('  --no-cache    Skip caching and always perform fresh validation');
    console.log('  --help, -h    Show this help message');
    process.exit(0);
    return true;
  }
  return false;
}

/**
 * Log validation errors and exit with error code.
 * @param {Object} result - Validation result with errors array
 */
export function logValidationErrors(result) {
  console.error('✗ Configuration is invalid:');
  result.errors.forEach(error => {
    console.error(`  ${error}`);
  });
  process.exit(1);
}

/**
 * Log validation success and exit with success code.
 * @param {Object} result - Validation result with cached boolean
 */
export function logValidationSuccess(result) {
  console.log('✓ Configuration is valid');
  if (result.cached) {
    console.log('  (result from cache)');
  }
  process.exit(0);
}

/**
 * Main validation orchestration logic.
 * @param {string[]} args - Command line arguments
 */
export function runConfigValidation(args) {
  // Use dynamically looked-up exported functions so tests can monkey-patch them.
  const api = {
    showHelpMessage,
    parseCommandLineArgs,
    checkConfigWithCache,
    logValidationSuccess,
    logValidationErrors
  };
  
  if (api.showHelpMessage(args)) {
    return; // help displayed & process.exit called (mocked in tests)
  }
  
  const parsed = api.parseCommandLineArgs(args);
  if (!parsed) {
    return; // parse already handled error + exit
  }
  
  const { useCache, configPath, cacheDir } = parsed;
  const result = api.checkConfigWithCache(useCache, configPath, cacheDir);
  result.valid ? api.logValidationSuccess(result) : api.logValidationErrors(result);
}

// Re-export from helpers for backwards compatibility
export { calculateFileHash, ConfigValidator } from '#helpers/config-validator.js';