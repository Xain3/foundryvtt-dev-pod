#!/usr/bin/env node
/**
 * Container configuration schema validation utility.
 */

const fs = require('fs');
const path = require('path');
const { ConfigValidator, validateConfigWithCache: classValidateWithCache, calculateFileHash } = require('../helpers/config-validator');

/**
 * Validate a container configuration file against basic structural requirements.
 */
function validateConfig(configPath, schemaPath) {
  const validator = new ConfigValidator({ schemaPath });
  return validator.validate(configPath);
}

/**
 * Calculate simple hash of a file for caching purposes.
 */
// Re-export calculateFileHash from class module for backwards compatibility

/**
 * Validate with caching support.
 */
function validateConfigWithCache(configPath, schemaPath, cacheDir) {
  return classValidateWithCache(configPath, schemaPath, cacheDir, new ConfigValidator({ schemaPath }));
}

function runConfigValidation(args) {
  showHelpMessage(args);

  const { useCache, configPath, cacheDir } = parseCommandLineArgs(args);

  const result = checkConfigWithCache(useCache, configPath, cacheDir);

  result.valid ? logValidationSuccess(result) : logValidationErrors(result);
}

function logValidationErrors(result) {
  console.error('✗ Configuration is invalid:');
  result.errors.forEach(error => {
    console.error(`  ${error}`);
  });
  process.exit(1);
}

function logValidationSuccess(result) {
  console.log('✓ Configuration is valid');
  if (result.cached) {
    console.log('  (result from cache)');
  }
  process.exit(0);
}

function checkConfigWithCache(useCache, configPath, cacheDir) {
  return useCache
    ? validateConfigWithCache(configPath, null, cacheDir)
    : validateConfig(configPath);
}

function parseCommandLineArgs(args) {
  const configPath = args.filter(arg => !arg.startsWith('--'))[0];
  const cacheDir = args.filter(arg => !arg.startsWith('--'))[1];
  const useCache = !args.includes('--no-cache');

  if (!configPath) {
    console.error('Error: config-path is required');
    process.exit(1);
  }
  return { useCache, configPath, cacheDir };
}

function showHelpMessage(args) {
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
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  runConfigValidation(args);
}

module.exports = {
  validateConfig,
  validateConfigWithCache,
  calculateFileHash,
  ConfigValidator
};