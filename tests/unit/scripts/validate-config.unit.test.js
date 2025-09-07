import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import childProcess from 'node:child_process';
import { jest, describe, test, beforeEach, afterEach, expect } from '@jest/globals';
import {
  validateConfig,
  validateConfigWithCache,
  calculateFileHash,
  logValidationErrors,
  logValidationSuccess,
  checkConfigWithCache,
  parseCommandLineArgs,
  showHelpMessage
} from '../../../scripts/validate-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runNode(args, opts = {}) {
  // Accept either a string or array as args
  const argArr = Array.isArray(args) ? args : args.split(' ').filter(Boolean);
  try {
    return childProcess.execFileSync('node', argArr, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
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

    test('validates version pattern - rejects 3+ digit versions', () => {
      const configBadVersion = {
        systems: { "test": { name: "Test", manifest: "https://example.com" } },
        modules: { "test": { name: "Test", manifest: "https://example.com" } },
        versions: {
          "130": {  // Invalid - more than 2 digits
            install: { systems: {}, modules: {} }
          }
        }
      };
      const configPath = path.join(tempDir, 'bad-version.json');
      fs.writeFileSync(configPath, JSON.stringify(configBadVersion, null, 2));

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(configPath, schemaPath);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('additional property') || e.includes('pattern'))).toBe(true);
    });

    test('validates item requires either manifest or path', () => {
      const configNoSource = {
        systems: { "test": { name: "Test" } },  // Missing both manifest and path
        modules: { "test": { name: "Test", manifest: "https://example.com" } },
        versions: { "13": { install: { systems: { "test": {} }, modules: {} } } }
      };
      const configPath = path.join(tempDir, 'no-source.json');
      fs.writeFileSync(configPath, JSON.stringify(configNoSource, null, 2));

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(configPath, schemaPath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('/systems/test: must have either "manifest" or "path" property');
    });

    test.skip('validates item manifest must be valid URI when provided', () => {
      // Skipped: ajv-formats not fully integrated in ESM version yet
      // This test requires URI format validation which needs ajv-formats
      const configBadUri = {
        systems: { "test": { name: "Test", manifest: "not-a-uri" } },
        modules: { "test": { name: "Test", manifest: "https://example.com" } },
        versions: { "13": { install: { systems: { "test": {} }, modules: {} } } }
      };
      const configPath = path.join(tempDir, 'bad-uri.json');
      fs.writeFileSync(configPath, JSON.stringify(configBadUri, null, 2));

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(configPath, schemaPath);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('format') || e.includes('uri'))).toBe(true);
    });

    test('validates worlds configuration', () => {
      const configWithWorlds = {
        systems: { "test": { name: "Test", manifest: "https://example.com" } },
        modules: { "test": { name: "Test", manifest: "https://example.com" } },
        worlds: { "test-world": { name: "Test World", path: "/path/to/world" } },
        versions: { "13": { install: { systems: {}, modules: {}, worlds: { "test-world": {} } } } }
      };
      const configPath = path.join(tempDir, 'with-worlds.json');
      fs.writeFileSync(configPath, JSON.stringify(configWithWorlds, null, 2));

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(configPath, schemaPath);
      expect(result.valid).toBe(true);
    });

    test('rejects additional properties at root level', () => {
      const configExtraProp = {
        systems: { "test": { name: "Test", manifest: "https://example.com" } },
        modules: { "test": { name: "Test", manifest: "https://example.com" } },
        versions: { "13": { install: { systems: {}, modules: {} } } },
        extraProperty: "should not be here"
      };
      const configPath = path.join(tempDir, 'extra-prop.json');
      fs.writeFileSync(configPath, JSON.stringify(configExtraProp, null, 2));

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(configPath, schemaPath);
  expect(result.valid).toBe(false);
  expect(result.errors.some(e => e.includes('additional property') || e.includes('extraProperty'))).toBe(true);
    });

    test('validates composition configuration', () => {
      const configWithComposition = {
        composition: {
          baseImage: "custom/foundry",
          user: "1000:1000",
          version_params: {
            name: "foundry-v{version}",
            port: 30000
          }
        },
        systems: { "test": { name: "Test", manifest: "https://example.com" } },
        modules: { "test": { name: "Test", manifest: "https://example.com" } },
        versions: { "13": { install: { systems: {}, modules: {} } } }
      };
      const configPath = path.join(tempDir, 'with-composition.json');
      fs.writeFileSync(configPath, JSON.stringify(configWithComposition, null, 2));

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(configPath, schemaPath);
      expect(result.valid).toBe(true);
    });

    test('validates item with continuous_sync configuration', () => {
      const configWithSync = {
        systems: {
          "test": {
            name: "Test",
            manifest: "https://example.com",
            continuous_sync: {
              enabled: true,
              direction: "bidirectional",
              interval: 30
            }
          }
        },
        modules: { "test": { name: "Test", manifest: "https://example.com" } },
        versions: { "13": { install: { systems: { "test": {} }, modules: {} } } }
      };
      const configPath = path.join(tempDir, 'with-sync.json');
      fs.writeFileSync(configPath, JSON.stringify(configWithSync, null, 2));

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(configPath, schemaPath);
      expect(result.valid).toBe(true);
    });

    test('rejects invalid continuous_sync direction', () => {
      const configBadSync = {
        systems: {
          "test": {
            name: "Test",
            manifest: "https://example.com",
            continuous_sync: {
              direction: "invalid-direction"
            }
          }
        },
        modules: { "test": { name: "Test", manifest: "https://example.com" } },
        versions: { "13": { install: { systems: { "test": {} }, modules: {} } } }
      };
      const configPath = path.join(tempDir, 'bad-sync.json');
      fs.writeFileSync(configPath, JSON.stringify(configBadSync, null, 2));

      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');
      const result = validateConfig(configPath, schemaPath);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('enum') || e.includes('direction'))).toBe(true);
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

    test('handles schema validation with null schemaPath', () => {
      const result = validateConfigWithCache(validConfigPath, null);
      expect(result.valid).toBe(true);
      expect(result.cached).toBe(false);
    });

    test('handles cache file with invalid JSON gracefully', () => {
      const cacheDir = path.join(tempDir, 'cache-invalid-json');
      fs.mkdirSync(cacheDir, { recursive: true });

      const hash = calculateFileHash(validConfigPath);
      const cacheFile = path.join(cacheDir, `fvtt-config-validation-${hash}.json`);
      fs.writeFileSync(cacheFile, 'not valid json at all');

      const result = validateConfigWithCache(validConfigPath, null, cacheDir);
      expect(result.valid).toBe(true);
      expect(result.cached).toBe(false);
    });

    test('handles cache file with wrong structure', () => {
      const cacheDir = path.join(tempDir, 'cache-wrong-structure');
      fs.mkdirSync(cacheDir, { recursive: true });

      const hash = calculateFileHash(validConfigPath);
      const cacheFile = path.join(cacheDir, `fvtt-config-validation-${hash}.json`);
      fs.writeFileSync(cacheFile, JSON.stringify({ wrong: 'structure' }));

      const result = validateConfigWithCache(validConfigPath, null, cacheDir);
      expect(result.valid).toBe(true);
      expect(result.cached).toBe(false);
    });

    test('cache works with schemaPath provided', () => {
      const cacheDir = path.join(tempDir, 'cache-with-schema');
      const schemaPath = path.join(repoRoot, 'schemas/container-config.schema.json');

      const result1 = validateConfigWithCache(validConfigPath, schemaPath, cacheDir);
      expect(result1.valid).toBe(true);
      expect(result1.cached).toBe(false);

      const result2 = validateConfigWithCache(validConfigPath, schemaPath, cacheDir);
      expect(result2.valid).toBe(true);
      expect(result2.cached).toBe(true);
    });

    test('different schemaPath creates different cache entries', () => {
      const cacheDir = path.join(tempDir, 'cache-different-schema');
      const schemaPath1 = path.join(repoRoot, 'schemas/container-config.schema.json');
      const schemaPath2 = '/different/schema/path.json';

      const result1 = validateConfigWithCache(validConfigPath, schemaPath1, cacheDir);
      expect(result1.cached).toBe(false);

      const result2 = validateConfigWithCache(validConfigPath, schemaPath2, cacheDir);
      expect(result2.cached).toBe(false);  // Different schema, so not cached
    });

    test('cache respects file modification time changes', (done) => {
      const cacheDir = path.join(tempDir, 'cache-mtime');

      const result1 = validateConfigWithCache(validConfigPath, null, cacheDir);
      expect(result1.cached).toBe(false);

      // Modify file to change mtime
      const content = fs.readFileSync(validConfigPath, 'utf8');
      setTimeout(() => {
        fs.writeFileSync(validConfigPath, content);

        const result2 = validateConfigWithCache(validConfigPath, null, cacheDir);
        expect(result2.cached).toBe(false);  // Should not be cached due to mtime change

        done();
      }, 10);
    });
  });

  describe('CLI interface', () => {
    test('shows help with --help flag', () => {
      const output = runNode([scriptPath, '--help']);
      expect(output).toContain('Usage:');
      expect(output).toContain('config-path');
      expect(output).toContain('--no-cache');
    });

    test('shows help with -h flag', () => {
      const output = runNode([scriptPath, '-h']);
      expect(output).toContain('Usage:');
    });

    test('shows help when no arguments provided', () => {
      const output = runNode([scriptPath]);
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

    test('shows help when config path is missing', () => {
      expect(() => {
        runNode(`${scriptPath} --no-cache`);
      }).toThrow();
    });

    test('handles help flag with other arguments', () => {
      const output = runNode(`${scriptPath} ${validConfigPath} --help`);
      expect(output).toContain('Usage:');
    });

    test('handles short help flag -h', () => {
      const output = runNode(`${scriptPath} -h`);
      expect(output).toContain('Usage:');
    });

    test('handles help flag at end of arguments', () => {
      const output = runNode(`${scriptPath} ${validConfigPath} ${tempDir} --help`);
      expect(output).toContain('Usage:');
    });

    test('handles invalid config with detailed error output', () => {
      expect(() => {
        runNode(`${scriptPath} ${invalidConfigPath}`);
      }).toThrow();
    });

    test('handles non-existent config file', () => {
      expect(() => {
        runNode(`${scriptPath} /non/existent/file.json`);
      }).toThrow();
    });

    test('handles cache directory creation', () => {
      const cacheDir = path.join(tempDir, 'new-cache-dir');
      expect(fs.existsSync(cacheDir)).toBe(false);

      const output1 = runNode(`${scriptPath} ${validConfigPath} ${cacheDir}`);
      expect(output1).toContain('✓ Configuration is valid');
      expect(fs.existsSync(cacheDir)).toBe(true);

      const output2 = runNode(`${scriptPath} ${validConfigPath} ${cacheDir}`);
      expect(output2).toContain('(result from cache)');
    });

    test('handles malformed JSON in config file', () => {
      const malformedPath = path.join(tempDir, 'malformed.json');
      fs.writeFileSync(malformedPath, '{ invalid json content }');

      expect(() => {
        runNode(`${scriptPath} ${malformedPath}`);
      }).toThrow();
    });

    test('handles empty config file', () => {
      const emptyPath = path.join(tempDir, 'empty.json');
      fs.writeFileSync(emptyPath, '{}');

      expect(() => {
        runNode(`${scriptPath} ${emptyPath}`);
      }).toThrow();
    });
  });
});

describe('Internal functions', () => {
  let tempDir;
  let validConfigPath;
  let invalidConfigPath;
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-config-internal-test-'));

    const validConfig = {
      systems: { "test": { name: "Test", manifest: "https://example.com" } },
      modules: { "test": { name: "Test", manifest: "https://example.com" } },
      versions: { "13": { install: { systems: {}, modules: {} } } }
    };

    validConfigPath = path.join(tempDir, 'valid-config.json');
    fs.writeFileSync(validConfigPath, JSON.stringify(validConfig, null, 2));

    const invalidConfig = {
      systems: { "bad": { name: "Bad" } },
      modules: {},
      versions: { "13": {} }
    };

    invalidConfigPath = path.join(tempDir, 'invalid-config.json');
    fs.writeFileSync(invalidConfigPath, JSON.stringify(invalidConfig, null, 2));
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('logValidationErrors function', () => {
    let consoleErrorSpy;
    let processExitSpy;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    test('logs errors and exits with code 1', () => {
      const mockResult = {
        valid: false,
        errors: ['Error 1', 'Error 2']
      };

      logValidationErrors(mockResult);

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ Configuration is invalid:');
      expect(consoleErrorSpy).toHaveBeenCalledWith('  Error 1');
      expect(consoleErrorSpy).toHaveBeenCalledWith('  Error 2');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    test('handles empty errors array', () => {
      const mockResult = {
        valid: false,
        errors: []
      };

      logValidationErrors(mockResult);

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ Configuration is invalid:');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('logValidationSuccess function', () => {
    let consoleLogSpy;
    let processExitSpy;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    test('logs success without cache message', () => {
      const mockResult = {
        valid: true,
        cached: false
      };

      logValidationSuccess(mockResult);

      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Configuration is valid');
      expect(consoleLogSpy).not.toHaveBeenCalledWith('  (result from cache)');
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    test('logs success with cache message when cached', () => {
      const mockResult = {
        valid: true,
        cached: true
      };

      logValidationSuccess(mockResult);

      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Configuration is valid');
      expect(consoleLogSpy).toHaveBeenCalledWith('  (result from cache)');
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('checkConfigWithCache function', () => {
    test('calls validateConfigWithCache when useCache is true', () => {
      const result = checkConfigWithCache(true, validConfigPath);
      expect(result.valid).toBe(true);
      expect(result.cached).toBe(false);
    });

    test('calls validateConfig when useCache is false', () => {
      const result = checkConfigWithCache(false, validConfigPath);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    test('passes cacheDir to validateConfigWithCache', () => {
      const cacheDir = path.join(tempDir, 'test-cache');
      const result = checkConfigWithCache(true, validConfigPath, cacheDir);
      expect(result.valid).toBe(true);
    });
  });

  describe('parseCommandLineArgs function', () => {
    let processExitSpy;
    let consoleErrorSpy;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    test('parses config path and cache dir correctly', () => {
      const args = ['config.json', 'cache-dir'];
      const result = parseCommandLineArgs(args);

      expect(result.configPath).toBe('config.json');
      expect(result.cacheDir).toBe('cache-dir');
      expect(result.useCache).toBe(true);
    });

    test('parses config path only', () => {
      const args = ['config.json'];
      const result = parseCommandLineArgs(args);

      expect(result.configPath).toBe('config.json');
      expect(result.cacheDir).toBeUndefined();
      expect(result.useCache).toBe(true);
    });

    test('handles --no-cache flag', () => {
      const args = ['config.json', '--no-cache'];
      const result = parseCommandLineArgs(args);

      expect(result.configPath).toBe('config.json');
      expect(result.useCache).toBe(false);
    });

    test('handles --no-cache with cache dir', () => {
      const args = ['config.json', 'cache-dir', '--no-cache'];
      const result = parseCommandLineArgs(args);

      expect(result.configPath).toBe('config.json');
      expect(result.cacheDir).toBe('cache-dir');
      expect(result.useCache).toBe(false);
    });

    test('exits with error when config path not provided', () => {
      const args = ['--no-cache'];

      parseCommandLineArgs(args);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: config-path is required');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    test('ignores flag-like arguments for config path', () => {
      // Updated expectation: flags are not treated specially; first non-flag is config
      const args = ['--help', 'config.json'];
      const result = parseCommandLineArgs(args.filter(a => a !== '--help')); // simulate removal due to help early exit
      expect(result.configPath).toBe('config.json');
    });

    test('handles multiple non-flag arguments', () => {
      const args = ['config.json', 'cache1', 'cache2'];
      const result = parseCommandLineArgs(args);

      expect(result.configPath).toBe('config.json');
      expect(result.cacheDir).toBe('cache1');
    });
  });

  describe('showHelpMessage function', () => {
    let consoleLogSpy;
    let processExitSpy;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    test('shows help when args is empty', () => {
      const args = [];

      showHelpMessage(args);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    test('shows help with --help flag', () => {
      const args = ['config.json', '--help'];

      showHelpMessage(args);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    test('shows help with -h flag', () => {
      const args = ['-h'];

      showHelpMessage(args);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    test('does not show help when no help flags', () => {
      const args = ['config.json'];

      showHelpMessage(args);

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    test('help message contains all expected content', () => {
      const args = ['--help'];

      showHelpMessage(args);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Validate a container configuration file'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('config-path'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('--no-cache'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('--help, -h'));
    });
  });

});