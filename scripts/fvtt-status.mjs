#!/usr/bin/env node
/**
 * @file fvtt-status.mjs
 * @description FoundryVTT development pod status checker CLI
 * @path scripts/fvtt-status.mjs
 */

/**
 * FoundryVTT development pod status checker.
 * 
 * Provides comprehensive status overview including pod detection, compose validation,
 * service status, and health checks.
 *
 * CLI usage:
 *   node scripts/fvtt-status.mjs
 *   node scripts/fvtt-status.mjs --json
 *   node scripts/fvtt-status.mjs --verbose
 *   node scripts/fvtt-status.mjs --dry-run
 *
 * Options:
 *  -f, --file <compose.yml>     Path to docker compose file (auto-detected if not specified)
 *  -c, --config <config.json>   Path to container config file (default: container-config.json)
 *  --json                       Output status in JSON format
 *  --verbose, -v                Show detailed information
 *  --dry-run, -n                Show what checks would be performed without executing them
 *  -h, --help                   Show help information
 *
 * Exit codes:
 *  0: Status check successful
 *  1: General error (invalid arguments, etc.)
 *  2: Pod not detected or configuration invalid
 *  3: Docker/compose not available
 *  4: Services unhealthy or not accessible
 */

import { checkStatus } from '../helpers/fvtt-status.mjs';

/**
 * Print usage information
 */
function printUsage() {
  console.log(`Usage: fvtt-status [options]

FoundryVTT development pod status checker

Options:
  -f, --file <compose.yml>     Path to docker compose file (auto-detected if not specified)
  -c, --config <config.json>   Path to container config file (default: container-config.json)
  --json                       Output status in JSON format
  --verbose, -v                Show detailed information
  --dry-run, -n                Show what checks would be performed without executing them
  -h, --help                   Show help information

Examples:
  fvtt-status                           # Check status with auto-detected files
  fvtt-status -f compose.dev.yml        # Check status with specific compose file
  fvtt-status --json                    # Get status in JSON format
  fvtt-status --verbose                 # Show detailed status information
  fvtt-status --dry-run                 # Show what would be checked

Exit Codes:
  0: Status check successful
  1: General error (invalid arguments, etc.)
  2: Pod not detected or configuration invalid
  3: Docker/compose not available
  4: Services unhealthy or not accessible`);
}

/**
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {object} Parsed options and remaining args
 */
function parseArgs(args, opts = {}) {
  // Set default values for options if not provided
  const options = {
    composeFile: null,
    configFile: 'container-config.json',
    json: false,
    verbose: false,
    dryRun: false,
    help: false,
    ...opts
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-f':
      case '--file':
        if (i + 1 >= args.length) {
          throw new Error(`Option ${arg} requires a value`);
        }
        options.composeFile = args[++i];
        break;
      case '-c':
      case '--config':
        if (i + 1 >= args.length) {
          throw new Error(`Option ${arg} requires a value`);
        }
        options.configFile = args[++i];
        break;
      case '--json':
        options.json = true;
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-n':
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

/**
 * Main CLI function
 */
async function main() {
  try {
    const args = process.argv.slice(2);
    
    // Handle help first
    if (args.includes('-h') || args.includes('--help')) {
      printUsage();
      process.exit(0);
    }

    // If no args, proceed with default status check
    const options = args.length === 0 ? 
      { composeFile: null, configFile: 'container-config.json', json: false, verbose: false, dryRun: false, help: false } : 
      parseArgs(args);

    if (options.help) {
      printUsage();
      process.exit(0);
    }

    // Check status using helper module
    const result = await checkStatus(options);
    
    // Output results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Default text output will be handled by the helper
      // Helper should have already printed to console
    }

    // Exit with appropriate code based on result
    const exitCode = result.healthy ? 0 : 
                    (!result.pod.detected || !result.pod.valid) ? 2 :
                    !result.dockerAvailable ? 3 :
                    result.healthChecks.issues.length > 0 ? 4 : 0;
    
    process.exit(exitCode);

  } catch (error) {
    if (error.message.includes('Unknown option') || error.message.includes('requires a value')) {
      console.error(`Error: ${error.message}`);
      console.error('');
      printUsage();
      process.exit(1);
    }
    
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error(`Unexpected error: ${error.message}`);
  process.exit(1);
});