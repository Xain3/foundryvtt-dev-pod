#!/usr/bin/env node
/**
 * @file validate-config.js
 * @description Thin CLI wrapper for container configuration validation
 * @path scripts/validate-config.js
 */

// Import all functionality from the common module
import {
  validateConfig,
  validateConfigWithCache,
  calculateFileHash,
  ConfigValidator,
  runConfigValidation,
  logValidationErrors,
  logValidationSuccess,
  checkConfigWithCache,
  parseCommandLineArgs,
  showHelpMessage
} from './common/validate-config.mjs';

// Re-export all functions for backwards compatibility
export {
  validateConfig,
  validateConfigWithCache,
  calculateFileHash,
  ConfigValidator,
  runConfigValidation,
  logValidationErrors,
  logValidationSuccess,
  checkConfigWithCache,
  parseCommandLineArgs,
  showHelpMessage
};

// CLI interface - delegate to common module
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  runConfigValidation(args);
}