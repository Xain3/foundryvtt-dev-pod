const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateConfig, validateConfigWithCache } = require('../../../scripts/validate-config.js');

describe('scripts/validate-config.js', () => {
  let tempDir;
  let validConfigPath;
  let invalidConfigPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-config-test-'));
    
    // Create a valid config
    const validConfig = {
      systems: {
        "test-system": {
          name: "Test System",
          path: "/path/to/system"
        }
      },
      modules: {
        "test-module": {
          name: "Test Module",
          manifest: "https://example.com/module.json"
        }
      },
      versions: {
        "13": {
          install: {
            systems: { "test-system": {} },
            modules: { "test-module": {} }
          }
        }
      }
    };
    
    validConfigPath = path.join(tempDir, 'valid-config.json');
    fs.writeFileSync(validConfigPath, JSON.stringify(validConfig, null, 2));
    
    // Create an invalid config
    const invalidConfig = {
      systems: {
        "bad-system": {
          name: "Bad System"
          // Missing manifest or path
        }
      },
      modules: {},
      versions: {
        "13": {
          // Missing install property
        }
      }
    };
    
    invalidConfigPath = path.join(tempDir, 'invalid-config.json');
    fs.writeFileSync(invalidConfigPath, JSON.stringify(invalidConfig, null, 2));
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('validates valid configuration successfully', () => {
    const result = validateConfig(validConfigPath);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  test('detects invalid configuration with proper error messages', () => {
    const result = validateConfig(invalidConfigPath);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('/systems/bad-system: must have either "manifest" or "path" property');
    expect(result.errors).toContain('/versions/13: must have required property "install"');
  });

  test('returns error for non-existent config file', () => {
    const result = validateConfig('/non/existent/file.json');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Config file not found');
  });

  test('caching works correctly', () => {
    const cacheDir = path.join(tempDir, 'cache');
    
    // First call should not be cached
    const result1 = validateConfigWithCache(validConfigPath, null, cacheDir);
    expect(result1.valid).toBe(true);
    expect(result1.cached).toBe(false);
    
    // Second call should be cached
    const result2 = validateConfigWithCache(validConfigPath, null, cacheDir);
    expect(result2.valid).toBe(true);
    expect(result2.cached).toBe(true);
  });

  test('detects missing required top-level properties', () => {
    const incompleteConfig = { systems: {} };
    const incompletePath = path.join(tempDir, 'incomplete-config.json');
    fs.writeFileSync(incompletePath, JSON.stringify(incompleteConfig, null, 2));
    
    const result = validateConfig(incompletePath);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('root: must have required property "modules"');
    expect(result.errors).toContain('root: must have required property "versions"');
  });
});