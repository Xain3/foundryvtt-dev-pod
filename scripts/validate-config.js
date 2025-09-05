#!/usr/bin/env node
/**
 * Container configuration schema validation utility.
 */

const fs = require('fs');
const path = require('path');

/**
 * Validate a container configuration file against basic structural requirements.
 */
function validateConfig(configPath, schemaPath) {
  // Check if config file exists
  if (!fs.existsSync(configPath)) {
    return {
      valid: false,
      errors: [`Config file not found: ${configPath}`]
    };
  }
  
  try {
    // Load and parse config
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    // Perform basic structural validation
    const errors = [];
    
    // Check required top-level properties
    if (!config.systems || typeof config.systems !== 'object') {
      errors.push('root: must have required property "systems"');
    }
    if (!config.modules || typeof config.modules !== 'object') {
      errors.push('root: must have required property "modules"');
    }
    if (!config.versions || typeof config.versions !== 'object') {
      errors.push('root: must have required property "versions"');
    }
    
    // Check that each system/module has required properties
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
    
    // Check version configurations
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
    
    if (errors.length > 0) {
      return {
        valid: false,
        errors
      };
    }
    
    return { valid: true };
    
  } catch (error) {
    return {
      valid: false,
      errors: [`Validation error: ${error.message}`]
    };
  }
}

/**
 * Calculate simple hash of a file for caching purposes.
 */
function calculateFileHash(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Simple hash using content length and first/last chars
  let hash = content.length.toString(36);
  if (content.length > 0) {
    hash += content.charCodeAt(0).toString(36);
    hash += content.charCodeAt(content.length - 1).toString(36);
  }
  // Add modification time for uniqueness
  const stat = fs.statSync(filePath);
  hash += stat.mtime.getTime().toString(36);
  return hash;
}

/**
 * Validate with caching support.
 */
function validateConfigWithCache(configPath, schemaPath, cacheDir) {
  const defaultCacheDir = process.env.TMPDIR || process.env.TMP || '/tmp';
  const actualCacheDir = cacheDir || defaultCacheDir;
  
  // Ensure cache directory exists
  if (!fs.existsSync(actualCacheDir)) {
    fs.mkdirSync(actualCacheDir, { recursive: true });
  }
  
  const configHash = calculateFileHash(configPath);
  const cacheFile = path.join(actualCacheDir, `fvtt-config-validation-${configHash}.json`);
  
  // Check if cached result exists
  if (fs.existsSync(cacheFile)) {
    try {
      const cachedResult = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      return { ...cachedResult, cached: true };
    } catch (error) {
      fs.unlinkSync(cacheFile);
    }
  }
  
  // Perform fresh validation
  const result = validateConfig(configPath, schemaPath);
  
  // Cache the result
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf8');
  } catch (error) {
    // Continue without caching if it fails
  }
  
  return { ...result, cached: false };
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
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
  
  const configPath = args.filter(arg => !arg.startsWith('--'))[0];
  const cacheDir = args.filter(arg => !arg.startsWith('--'))[1];
  const useCache = !args.includes('--no-cache');
  
  if (!configPath) {
    console.error('Error: config-path is required');
    process.exit(1);
  }
  
  const result = useCache
    ? validateConfigWithCache(configPath, null, cacheDir)
    : validateConfig(configPath);
  
  if (result.valid) {
    console.log('✓ Configuration is valid');
    if (result.cached) {
      console.log('  (result from cache)');
    }
    process.exit(0);
  } else {
    console.error('✗ Configuration is invalid:');
    result.errors.forEach(error => {
      console.error(`  ${error}`);
    });
    process.exit(1);
  }
}

module.exports = {
  validateConfig,
  validateConfigWithCache,
  calculateFileHash
};