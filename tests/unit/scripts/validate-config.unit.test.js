const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const { validateConfig, validateConfigWithCache, calculateFileHash } = require('../../../scripts/validate-config.js');

function runNode(args, opts = {}) {
  try {
    return childProcess.execSync(`node ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  } catch (error) {
    throw error;
  }
}

describe('scripts/validate-config.js', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const scriptPath = path.join(repoRoot, 'scripts/validate-config.js');
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

  describe('validateConfig function', () => {
    test('validates valid configuration successfully', () => {
      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(validConfigPath, schemaPath);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    test('detects invalid configuration with proper error messages', () => {
      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(invalidConfigPath, schemaPath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('/systems/bad-system: must have either "manifest" or "path" property');
      expect(result.errors).toContain('/versions/13: must have required property "install"');
    });

    test('returns error for non-existent config file', () => {
      const result = validateConfig('/non/existent/file.json');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Config file not found');
    });

    test('detects missing required top-level properties', () => {
      const incompleteConfig = { systems: {} };
      const incompletePath = path.join(tempDir, 'incomplete-config.json');
      fs.writeFileSync(incompletePath, JSON.stringify(incompleteConfig, null, 2));

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(incompletePath, schemaPath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('root: must have required property "modules"');
      expect(result.errors).toContain('root: must have required property "versions"');
    });

    test('handles malformed JSON gracefully', () => {
      const malformedPath = path.join(tempDir, 'malformed.json');
      fs.writeFileSync(malformedPath, '{ invalid json }');

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(malformedPath, schemaPath);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Validation error:');
    });

    test('validates systems with missing name', () => {
      const configWithoutName = {
        systems: { "test": { manifest: "https://example.com" } },
        modules: { "test": { name: "Test", manifest: "https://example.com" } },
        versions: { "13": { install: { systems: {}, modules: {} } } }
      };
      const configPath = path.join(tempDir, 'no-name.json');
      fs.writeFileSync(configPath, JSON.stringify(configWithoutName, null, 2));

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(configPath, schemaPath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('/systems/test: must have required property "name"');
    });

    test('validates modules with missing name', () => {
      const configWithoutName = {
        systems: { "test": { name: "Test", manifest: "https://example.com" } },
        modules: { "test": { manifest: "https://example.com" } },
        versions: { "13": { install: { systems: {}, modules: {} } } }
      };
      const configPath = path.join(tempDir, 'no-name.json');
      fs.writeFileSync(configPath, JSON.stringify(configWithoutName, null, 2));

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(configPath, schemaPath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('/modules/test: must have required property "name"');
    });

    test('validates version install configuration', () => {
      const configMissingInstall = {
        systems: { "test": { name: "Test", manifest: "https://example.com" } },
        modules: { "test": { name: "Test", manifest: "https://example.com" } },
        versions: {
          "13": {
            install: {
              // Missing systems
              modules: { "test": {} }
            }
          }
        }
      };
      const configPath = path.join(tempDir, 'missing-systems.json');
      fs.writeFileSync(configPath, JSON.stringify(configMissingInstall, null, 2));

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(configPath, schemaPath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('/versions/13/install: must have required property "systems"');
    });
  });

  describe('calculateFileHash function', () => {
    test('generates different hashes for different files', () => {
      const hash1 = calculateFileHash(validConfigPath);
      const hash2 = calculateFileHash(invalidConfigPath);
      expect(hash1).not.toBe(hash2);
    });

    test('includes file modification time in hash', (done) => {
      const hash1 = calculateFileHash(validConfigPath);

      // Wait and touch the file to change mtime
      const content = fs.readFileSync(validConfigPath, 'utf8');
      setTimeout(() => {
        fs.writeFileSync(validConfigPath, content);
        const hash2 = calculateFileHash(validConfigPath);
        expect(hash1).not.toBe(hash2);
        done();
      }, 10);
    });
  });

  describe('validateConfigWithCache function', () => {
    test('caching works correctly', () => {
      const cacheDir = path.join(tempDir, 'cache');

  const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
  // First call should not be cached
  const result1 = validateConfigWithCache(validConfigPath, schemaPath, cacheDir);
      expect(result1.valid).toBe(true);
      expect(result1.cached).toBe(false);

      // Second call should be cached
      const result2 = validateConfigWithCache(validConfigPath, schemaPath, cacheDir);
      expect(result2.valid).toBe(true);
      expect(result2.cached).toBe(true);
    });

    test('creates cache directory if it does not exist', () => {
      const cacheDir = path.join(tempDir, 'new-cache-dir');
      expect(fs.existsSync(cacheDir)).toBe(false);

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      validateConfigWithCache(validConfigPath, schemaPath, cacheDir);
      expect(fs.existsSync(cacheDir)).toBe(true);
    });

    test('handles corrupted cache files gracefully', () => {
      const cacheDir = path.join(tempDir, 'cache');
      fs.mkdirSync(cacheDir, { recursive: true });

      // Create corrupted cache file
      const hash = calculateFileHash(validConfigPath);
      const cacheFile = path.join(cacheDir, `fvtt-config-validation-${hash}.json`);
      fs.writeFileSync(cacheFile, 'corrupted json');

      const result = validateConfigWithCache(validConfigPath, null, cacheDir);
      expect(result.valid).toBe(true);
      expect(result.cached).toBe(false);
    });

    test('uses default cache directory when none provided', () => {
      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfigWithCache(validConfigPath, schemaPath);
      expect(result.valid).toBe(true);
      expect(result.cached).toBe(false);
    });

    test('schema validation triggers schema errors', () => {
      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      // Craft a config that passes structural checks but violates schema pattern for versions keys
      const schemaBad = {
        systems: {
          "test-system": { name: "Test System", path: "/x" }
        },
        modules: {
          "test-module": { name: "Test Module", manifest: "https://example.com/m.json" }
        },
        // version key '130' is invalid per schema (only 1-2 digits allowed)
        versions: {
          "130": {
            install: { systems: { "test-system": {} }, modules: { "test-module": {} } }
          }
        }
      };
      const schemaBadPath = path.join(tempDir, 'schema-bad.json');
      fs.writeFileSync(schemaBadPath, JSON.stringify(schemaBad, null, 2));
      const result = validateConfig(schemaBadPath, schemaPath);
      expect(result.valid).toBe(false);
      // Should include at least one schema-derived error
      expect(result.errors.length).toBeGreaterThan(0);
      const hasSchemaError = result.errors.some(e => e.startsWith('schema'));
      expect(hasSchemaError).toBe(true);
    });
  });

  describe('CLI interface', () => {
    test('shows help with --help flag', () => {
      const output = runNode(`${scriptPath} --help`);
      expect(output).toContain('Usage:');
      expect(output).toContain('config-path');
      expect(output).toContain('--no-cache');
    });

    test('shows help with -h flag', () => {
      const output = runNode(`${scriptPath} -h`);
      expect(output).toContain('Usage:');
    });

    test('shows help when no arguments provided', () => {
      const output = runNode(`${scriptPath}`);
      expect(output).toContain('Usage:');
    });

    test('validates valid config successfully via CLI', () => {
      const output = runNode(`${scriptPath} ${validConfigPath}`);
      expect(output).toContain('✓ Configuration is valid');
    });

    test('shows cached result indicator', () => {
      const cacheDir = path.join(tempDir, 'cli-cache');

      // First run - not cached
      const output1 = runNode(`${scriptPath} ${validConfigPath} ${cacheDir}`);
      expect(output1).toContain('✓ Configuration is valid');
      expect(output1).not.toContain('(result from cache)');

      // Second run - cached
      const output2 = runNode(`${scriptPath} ${validConfigPath} ${cacheDir}`);
      expect(output2).toContain('✓ Configuration is valid');
      expect(output2).toContain('(result from cache)');
    });

    test('bypasses cache with --no-cache flag', () => {
      const cacheDir = path.join(tempDir, 'no-cache-test');

      // First run to populate cache
      runNode(`${scriptPath} ${validConfigPath} ${cacheDir}`);

      // Second run with --no-cache should not use cache
      const output = runNode(`${scriptPath} ${validConfigPath} ${cacheDir} --no-cache`);
      expect(output).toContain('✓ Configuration is valid');
      expect(output).not.toContain('(result from cache)');
    });

    test('exits with error for invalid config via CLI', () => {
      expect(() => {
        runNode(`${scriptPath} ${invalidConfigPath}`);
      }).toThrow();
    });

    test('exits with error for missing config file via CLI', () => {
      expect(() => {
        runNode(`${scriptPath} /non/existent/config.json`);
      }).toThrow();
    });

    test('exits with error when config-path not provided', () => {
      expect(() => {
        runNode(`${scriptPath} --no-cache`);
      }).toThrow();
    });

    test('handles multiple non-flag arguments correctly', () => {
      const cacheDir = path.join(tempDir, 'multi-args');
      const output = runNode(`${scriptPath} ${validConfigPath} ${cacheDir} --no-cache`);
      expect(output).toContain('✓ Configuration is valid');
    });
  });
});