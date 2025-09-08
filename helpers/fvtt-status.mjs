/**
 * @file fvtt-status.mjs
 * @description FoundryVTT development pod status checker helper functions
 * @path helpers/fvtt-status.mjs
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

import { ConfigValidator } from '../helpers/config-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Default compose file names to check (in order of preference)
 */
const DEFAULT_COMPOSE_FILES = [
  'compose.dev.yml',
  'compose.yml', 
  'docker-compose.yml'
];

/**
 * Detect compose files in the current directory
 * @param {string|null} specifiedFile - Explicitly specified compose file
 * @returns {object} Detection result with file path and status
 */
function detectComposeFile(specifiedFile = null) {
  if (specifiedFile) {
    if (fs.existsSync(specifiedFile)) {
      return { found: true, file: specifiedFile, source: 'specified' };
    }
    return { found: false, file: specifiedFile, source: 'specified', error: 'File not found' };
  }

  // Auto-detect compose files
  for (const file of DEFAULT_COMPOSE_FILES) {
    if (fs.existsSync(file)) {
      return { found: true, file, source: 'auto-detected' };
    }
  }

  return { found: false, file: null, source: 'auto-detect', error: 'No compose file found' };
}

/**
 * Detect and validate container configuration
 * @param {string} configFile - Path to container config file
 * @returns {object} Validation result
 */
async function detectAndValidateConfig(configFile) {
  if (!fs.existsSync(configFile)) {
    return {
      found: false,
      file: configFile,
      valid: false,
      error: 'Configuration file not found'
    };
  }

  try {
    // Use existing config validator
    const validator = new ConfigValidator();
    const validation = validator.validate(configFile);
    return {
      found: true,
      file: configFile,
      valid: validation.valid,
      error: validation.valid ? null : validation.errors?.join('; ')
    };
  } catch (error) {
    return {
      found: true,
      file: configFile,
      valid: false,
      error: `Validation failed: ${error.message}`
    };
  }
}

/**
 * Check if docker and docker-compose are available
 * @returns {object} Docker availability status
 */
function checkDockerAvailability() {
  const result = {
    available: false,
    docker: false,
    compose: false,
    composeCommand: null,
    error: null
  };

  try {
    // Check if docker is available
    execSync('docker --version', { stdio: 'ignore' });
    result.docker = true;
  } catch (error) {
    result.error = 'Docker not available';
    return result;
  }

  try {
    // Check for docker compose (new format)
    execSync('docker compose version', { stdio: 'ignore' });
    result.compose = true;
    result.composeCommand = 'docker compose';
    result.available = true;
  } catch (error) {
    try {
      // Check for docker-compose (legacy format)
      execSync('docker-compose --version', { stdio: 'ignore' });
      result.compose = true;
      result.composeCommand = 'docker-compose';
      result.available = true;
    } catch (legacyError) {
      result.error = 'Neither "docker compose" nor "docker-compose" available';
    }
  }

  return result;
}

/**
 * Get service status from docker compose
 * @param {string} composeFile - Path to compose file
 * @param {string} composeCommand - Docker compose command to use
 * @param {boolean} dryRun - Whether to perform a dry run
 * @returns {Array} Array of service status objects
 */
function getServiceStatus(composeFile, composeCommand, dryRun = false) {
  if (dryRun) {
    console.log(`[dry-run] Would run: ${composeCommand} -f ${composeFile} ps --format json`);
    return [];
  }

  try {
    const psOutput = execSync(`${composeCommand} -f "${composeFile}" ps --format json`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    if (!psOutput.trim()) {
      return [];
    }

    // Parse JSON output - each line is a separate JSON object
    const services = psOutput.trim().split('\n').map(line => {
      try {
        const service = JSON.parse(line);
        return {
          name: service.Service || service.Name,
          status: service.State || 'unknown',
          ports: service.Publishers || [],
          health: service.Health || 'unknown'
        };
      } catch (parseError) {
        console.warn(`Warning: Failed to parse service info: ${line}`);
        return null;
      }
    }).filter(Boolean);

    return services;
  } catch (error) {
    console.warn(`Warning: Failed to get service status: ${error.message}`);
    return [];
  }
}

/**
 * Format services for display with URLs
 * @param {Array} services - Service status array
 * @returns {Array} Formatted services with URLs
 */
function formatServicesWithUrls(services) {
  return services.map(service => {
    const formatted = { ...service };
    
    // Generate URL if service has ports
    if (service.ports && service.ports.length > 0) {
      const portInfo = service.ports[0];
      if (typeof portInfo === 'object' && portInfo.PublishedPort) {
        formatted.url = `http://localhost:${portInfo.PublishedPort}`;
      } else if (typeof portInfo === 'string') {
        // Handle string format like "30012:30000/tcp"
        const match = portInfo.match(/^(\d+):/);
        if (match) {
          formatted.url = `http://localhost:${match[1]}`;
        }
      }
    }

    return formatted;
  });
}

/**
 * Print default text status output
 * @param {object} statusResult - Complete status result object
 */
function printDefaultStatus(statusResult) {
  console.log('FoundryVTT Development Pod Status');
  console.log('==================================\n');

  // Pod Configuration
  console.log('📁 Pod Configuration:');
  if (statusResult.pod.composeFile.found) {
    console.log(`   ✓ Compose file found: ${statusResult.pod.composeFile.file}`);
  } else {
    console.log(`   ✗ Compose file: ${statusResult.pod.composeFile.error}`);
  }

  if (statusResult.pod.config.found) {
    if (statusResult.pod.config.valid) {
      console.log(`   ✓ Container config found: ${statusResult.pod.config.file}`);
      console.log(`   ✓ Configuration is valid`);
    } else {
      console.log(`   ✓ Container config found: ${statusResult.pod.config.file}`);
      console.log(`   ✗ Configuration is invalid: ${statusResult.pod.config.error}`);
    }
  } else {
    console.log(`   ⚠ Container config: ${statusResult.pod.config.error}`);
  }

  console.log('');

  // Services Status
  console.log('🐳 Services Status:');
  if (statusResult.services.length === 0) {
    console.log('   No services found or docker not available');
  } else {
    statusResult.services.forEach(service => {
      const statusIcon = service.status === 'running' ? '✓' : 
                        service.status === 'exited' ? '✗' : '⚠';
      const url = service.url ? ` (${service.url})` : '';
      console.log(`   ${statusIcon} ${service.name.padEnd(15)} ${service.status}${url}`);
    });
  }

  console.log('');

  // Health Checks
  console.log('🏥 Health Checks:');
  if (statusResult.healthChecks.issues.length === 0) {
    console.log('   ✓ No issues detected');
  } else {
    statusResult.healthChecks.issues.forEach(issue => {
      console.log(`   ✗ ${issue}`);
    });
  }

  if (!statusResult.dockerAvailable) {
    console.log('   ⚠ Docker/compose not available - cannot check service status');
  }
}

/**
 * Main status checking function
 * @export
 * @param {object} options - Options from CLI
 * @returns {object} Complete status result
 */
export async function checkStatus(options) {
  const result = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    healthy: true,
    dockerAvailable: false,
    pod: {
      detected: false,
      composeFile: {},
      config: {},
      valid: false,
      errors: []
    },
    services: [],
    healthChecks: {
      allServicesHealthy: true,
      allPortsAccessible: true,
      issues: []
    }
  };

  if (options.dryRun) {
    console.log('[dry-run] fvtt-status: Performing status check dry-run');
    console.log(`[dry-run] Would check compose file: ${options.composeFile || 'auto-detect'}`);
    console.log(`[dry-run] Would check config file: ${options.configFile}`);
    console.log('[dry-run] Would check docker availability');
    console.log('[dry-run] Would check service status');
  }

  // Pod Detection
  result.pod.composeFile = detectComposeFile(options.composeFile);
  result.pod.config = await detectAndValidateConfig(options.configFile);
  
  result.pod.detected = result.pod.composeFile.found || result.pod.config.found;
  result.pod.valid = result.pod.composeFile.found && result.pod.config.valid;

  if (!result.pod.composeFile.found) {
    result.pod.errors.push(result.pod.composeFile.error);
  }
  if (!result.pod.config.valid && result.pod.config.found) {
    result.pod.errors.push(result.pod.config.error);
  }

  // Docker availability
  const dockerCheck = checkDockerAvailability();
  result.dockerAvailable = dockerCheck.available;

  if (!dockerCheck.available) {
    result.healthChecks.issues.push(dockerCheck.error);
    result.healthy = false;
  }

  // Service status (only if docker is available and compose file exists)
  if (dockerCheck.available && result.pod.composeFile.found && !options.dryRun) {
    try {
      const services = getServiceStatus(
        result.pod.composeFile.file, 
        dockerCheck.composeCommand,
        options.dryRun
      );
      result.services = formatServicesWithUrls(services);

      // Check for unhealthy services
      const unhealthyServices = result.services.filter(
        service => service.status !== 'running'
      );
      
      if (unhealthyServices.length > 0) {
        result.healthChecks.allServicesHealthy = false;
        result.healthChecks.issues.push(
          `${unhealthyServices.length} service(s) not running: ${
            unhealthyServices.map(s => s.name).join(', ')
          }`
        );
      }
    } catch (error) {
      result.healthChecks.issues.push(`Failed to check services: ${error.message}`);
    }
  }

  // Overall health status
  result.healthy = result.pod.detected && 
                  result.pod.valid && 
                  result.dockerAvailable && 
                  result.healthChecks.issues.length === 0;

  result.status = result.healthy ? 'healthy' : 'unhealthy';

  // Print default output (unless JSON mode)
  if (!options.json) {
    printDefaultStatus(result);
  }

  return result;
}