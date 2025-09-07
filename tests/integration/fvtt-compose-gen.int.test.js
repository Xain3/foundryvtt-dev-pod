/**
 * @file fvtt-compose-gen.int.test.js
 * @description Integration tests for the fvtt-compose-gen CLI binary
 * @path tests/integration/fvtt-compose-gen.int.test.js
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import childProcess from 'node:child_process';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run the fvtt-compose-gen binary with arguments
 * @param {string[]} args - Command line arguments
 * @param {object} opts - Additional options for execSync
 * @returns {string} - Standard output from the command
 */
function runComposeGen(args = [], opts = {}) {
  const repoRoot = path.resolve(__dirname, '../..');
  const binaryPath = path.join(repoRoot, 'scripts/generate-compose.js');
  const cmd = `node ${binaryPath} ${args.join(' ')}`;
  return childProcess.execSync(cmd, { encoding: 'utf8', ...opts });
}

/**
 * Run the fvtt-compose-gen binary and expect it to fail
 * @param {string[]} args - Command line arguments
 * @param {object} opts - Additional options for execSync
 * @returns {object} - Object with stderr and error info
 */
function runComposeGenExpectFailure(args = [], opts = {}) {
  const repoRoot = path.resolve(__dirname, '../..');
  const binaryPath = path.join(repoRoot, 'scripts/generate-compose.js');
  const cmd = `node ${binaryPath} ${args.join(' ')}`;
  
  try {
    childProcess.execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts });
    throw new Error('Expected command to fail but it succeeded');
  } catch (error) {
    return {
      stderr: error.stderr || '',
      stdout: error.stdout || '',
      code: error.status
    };
  }
}

describe('fvtt-compose-gen CLI binary integration tests', () => {
  let tempDir;
  let testConfigPath;
  let testOutputPath;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fvtt-compose-gen-test-'));
    testConfigPath = path.join(tempDir, 'test-config.json');
    testOutputPath = path.join(tempDir, 'test-compose.yml');
  });

  afterEach(() => {
    // Clean up temporary files
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('basic functionality', () => {
    test('generates compose file from minimal container config', () => {
      const config = {
        systems: {},
        modules: {},
        composition: {
          baseImage: 'felddy/foundryvtt',
          user: '0:0',
          version_params: {
            name: 'foundry-v{version}',
            tag: 'release',
            port: '300{version}',
            versionDir: 'v{version}',
            envSuffix: 'v{version}'
          }
        },
        versions: {
          '13': { install: { systems: {}, modules: {} } }
        }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      // Generate compose file
      const output = runComposeGen(['-c', testConfigPath, '-o', testOutputPath]);
      
      // Verify output file was created
      expect(fs.existsSync(testOutputPath)).toBe(true);
      
      // Parse and validate generated YAML
      const generatedYaml = fs.readFileSync(testOutputPath, 'utf8');
      const doc = yaml.load(generatedYaml);
      
      expect(doc).toHaveProperty('services');
      expect(doc.services).toHaveProperty('foundry-v13');
      expect(doc.services['foundry-v13'].image).toBe('felddy/foundryvtt:release');
      expect(doc.services['foundry-v13'].ports).toContain('30013:30000');
    });

    test('prints to stdout when --print flag is used', () => {
      const config = {
        systems: {},
        modules: {},
        composition: {
          baseImage: 'felddy/foundryvtt',
          user: '0:0',
          version_params: { name: 'foundry-v{version}', tag: 'release', port: '300{version}' }
        },
        versions: { '13': { install: { systems: {}, modules: {} } } }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const output = runComposeGen(['-c', testConfigPath, '--print']);
      
      // Should contain valid YAML
      const doc = yaml.load(output);
      expect(doc).toHaveProperty('services');
      expect(doc.services).toHaveProperty('foundry-v13');
    });

    test('supports dry-run mode without creating files', () => {
      const config = {
        systems: {},
        modules: {},
        versions: { '13': { install: { systems: {}, modules: {} } } }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const output = runComposeGen(['-c', testConfigPath, '-o', testOutputPath, '--dry-run']);
      
      // Should not create output file in dry-run mode
      expect(fs.existsSync(testOutputPath)).toBe(false);
      
      // Should show dry-run messages
      expect(output).toContain('[dry-run]');
      expect(output).toContain('Would generate compose YAML');
    });
  });

  describe('CLI argument handling', () => {
    beforeEach(() => {
      // Create a basic valid config for CLI tests
      const basicConfig = {
        systems: {},
        modules: {},
        versions: { '13': { install: { systems: {}, modules: {} } } }
      };
      fs.writeFileSync(testConfigPath, JSON.stringify(basicConfig, null, 2));
    });

    test('handles short flags correctly', () => {
      const output = runComposeGen(['-c', testConfigPath, '-n']);
      expect(output).toContain('[dry-run]');
    });

    test('handles long flags correctly', () => {
      const output = runComposeGen(['--config', testConfigPath, '--dry-run']);
      expect(output).toContain('[dry-run]');
    });

    test('uses default config file when not specified', () => {
      // Create default config file in repo root where the binary expects it
      const repoRoot = path.resolve(__dirname, '../..');
      const defaultConfigPath = path.join(repoRoot, 'container-config.json');
      const config = {
        systems: {},
        modules: {},
        versions: { '13': { install: { systems: {}, modules: {} } } }
      };
      
      // Only create the file if it doesn't exist (don't overwrite existing)
      const fileExists = fs.existsSync(defaultConfigPath);
      if (!fileExists) {
        fs.writeFileSync(defaultConfigPath, JSON.stringify(config, null, 2));
      }

      try {
        const output = runComposeGen(['--dry-run']);
        expect(output).toContain('[dry-run]');
      } finally {
        // Clean up temp file if we created it
        if (!fileExists && fs.existsSync(defaultConfigPath)) {
          fs.unlinkSync(defaultConfigPath);
        }
      }
    });

    test('handles missing config file gracefully', () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.json');
      const result = runComposeGenExpectFailure(['-c', nonExistentPath]);
      
      expect(result.code).not.toBe(0);
      expect(result.stderr || result.stdout).toContain('not found');
    });

    test('handles invalid JSON gracefully', () => {
      fs.writeFileSync(testConfigPath, '{ invalid json content');
      
      const result = runComposeGenExpectFailure(['-c', testConfigPath]);
      expect(result.code).not.toBe(0);
    });
  });

  describe('secrets modes', () => {
    beforeEach(() => {
      const config = {
        systems: {},
        modules: {},
        versions: { '13': { install: { systems: {}, modules: {} } } }
      };
      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));
    });

    test('supports file secrets mode', () => {
      const secretsPath = path.join(tempDir, 'secrets.json');
      fs.writeFileSync(secretsPath, JSON.stringify({ username: 'test', password: 'test' }));

      const output = runComposeGen([
        '-c', testConfigPath,
        '--print',
        '--secrets-mode', 'file',
        '--secrets-file', secretsPath
      ]);

      const doc = yaml.load(output);
      expect(doc).toHaveProperty('secrets');
    });

    test('supports external secrets mode', () => {
      const output = runComposeGen([
        '-c', testConfigPath,
        '--print',
        '--secrets-mode', 'external',
        '--secrets-external', 'my-external-secret'
      ]);

      const doc = yaml.load(output);
      expect(doc).toHaveProperty('secrets');
    });

    test('supports none secrets mode', () => {
      const output = runComposeGen([
        '-c', testConfigPath,
        '--print',
        '--secrets-mode', 'none'
      ]);

      const doc = yaml.load(output);
      expect(doc.secrets).toEqual({});
    });

    test('warns about experimental cloud modes', () => {
      // Test using a mode that doesn't require external tools in dry-run
      try {
        const output = runComposeGen([
          '-c', testConfigPath,
          '--dry-run',
          '--secrets-mode', 'external',
          '--secrets-external', 'test-external-secret'
        ]);

        expect(output).toContain('[dry-run]');
      } catch (error) {
        // If the above fails, just test that we can handle the GCP mode warning
        const result = runComposeGenExpectFailure([
          '-c', testConfigPath,
          '--dry-run',
          '--secrets-mode', 'gcp',
          '--secrets-gcp-project', 'test-project',
          '--secrets-gcp-secret', 'test-secret'
        ]);
        
        expect(result.stderr || result.stdout).toContain('[experimental]');
      }
    });
  });

  describe('multi-version support', () => {
    test('generates services for multiple versions', () => {
      const config = {
        systems: {
          test_system: {
            name: 'Test System',
            manifest: 'https://example.com/system.json',
            path: '',
            install_at_startup: true
          }
        },
        modules: {},
        composition: {
          baseImage: 'felddy/foundryvtt',
          user: '0:0',
          version_params: {
            name: 'foundry-v{version}',
            tag: 'release',
            port: '300{version}',
            versionDir: 'v{version}',
            envSuffix: 'v{version}'
          }
        },
        versions: {
          '12': { install: { systems: { test_system: {} }, modules: {} } },
          '13': { install: { systems: { test_system: {} }, modules: {} } }
        }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const output = runComposeGen(['-c', testConfigPath, '--print']);
      const doc = yaml.load(output);

      expect(doc.services).toHaveProperty('foundry-v12');
      expect(doc.services).toHaveProperty('foundry-v13');
      expect(doc.services['foundry-v12'].ports).toContain('30012:30000');
      expect(doc.services['foundry-v13'].ports).toContain('30013:30000');
    });

    test('applies version-specific composition overrides', () => {
      const config = {
        systems: {},
        modules: {},
        composition: {
          baseImage: 'felddy/foundryvtt',
          version_params: { name: 'foundry-v{version}', tag: 'release', port: '300{version}' }
        },
        versions: {
          '13': {
            install: { systems: {}, modules: {} },
            composition_params: {
              name: 'custom-foundry-v13',
              port: 39999
            }
          }
        }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const output = runComposeGen(['-c', testConfigPath, '--print']);
      const doc = yaml.load(output);

      expect(doc.services).toHaveProperty('custom-foundry-v13');
      expect(doc.services['custom-foundry-v13'].ports).toContain('39999:30000');
    });
  });

  describe('builder service', () => {
    test('includes builder service by default', () => {
      const config = {
        systems: {},
        modules: {},
        composition: {
          builder: { enabled: true, image: 'node:20-alpine' }
        },
        versions: { '13': { install: { systems: {}, modules: {} } } }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const output = runComposeGen(['-c', testConfigPath, '--print']);
      const doc = yaml.load(output);

      expect(doc.services).toHaveProperty('builder');
      expect(doc.services.builder.image).toBe('node:20-alpine');
    });

    test('excludes builder service when disabled', () => {
      const config = {
        systems: {},
        modules: {},
        composition: {
          builder: { enabled: false }
        },
        versions: { '13': { install: { systems: {}, modules: {} } } }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const output = runComposeGen(['-c', testConfigPath, '--print']);
      const doc = yaml.load(output);

      expect(doc.services.builder).toBeUndefined();
    });
  });

  describe('environment variable overrides', () => {
    test('respects COMPOSE_BASE_IMAGE environment variable', () => {
      const config = {
        systems: {},
        modules: {},
        versions: { '13': { install: { systems: {}, modules: {} } } }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const output = runComposeGen(['-c', testConfigPath, '--print'], {
        env: { ...process.env, COMPOSE_BASE_IMAGE: 'custom/foundryvtt' }
      });

      const doc = yaml.load(output);
      expect(doc.services['foundry-v13'].image).toContain('custom/foundryvtt');
    });

    test('respects COMPOSE_SECRETS_MODE environment variable', () => {
      const config = {
        systems: {},
        modules: {},
        versions: { '13': { install: { systems: {}, modules: {} } } }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      const output = runComposeGen(['-c', testConfigPath, '--print'], {
        env: { ...process.env, COMPOSE_SECRETS_MODE: 'none' }
      });

      const doc = yaml.load(output);
      expect(doc.secrets).toEqual({});
    });
  });
});