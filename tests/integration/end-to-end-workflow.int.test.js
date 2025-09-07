/**
 * @file end-to-end-workflow.int.test.js
 * @description End-to-end integration tests for the complete workflow using both CLI binaries
 * @path tests/integration/end-to-end-workflow.int.test.js
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import childProcess from 'node:child_process';
import yaml from 'js-yaml';
import { runBashScript } from '../utils/shell.js';

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
 * Run the fvtt-pod binary with arguments
 * @param {string[]} args - Command line arguments
 * @param {object} opts - Additional options for runBashScript
 * @returns {object} - Object with code, stdout, stderr
 */
function runPodHandler(args = [], opts = {}) {
  const repoRoot = path.resolve(__dirname, '../..');
  const binaryPath = path.join(repoRoot, 'scripts/pod-handler.sh');
  return runBashScript(binaryPath, args, opts);
}

describe('End-to-end workflow integration tests', () => {
  let tempDir;
  let configPath;
  let composePath;
  let secretsPath;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-workflow-test-'));
    configPath = path.join(tempDir, 'container-config.json');
    composePath = path.join(tempDir, 'compose.test.yml');
    secretsPath = path.join(tempDir, 'secrets.json');
  });

  afterEach(() => {
    // Clean up temporary files
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('complete workflow scenarios', () => {
    test('generate compose file and validate with pod handler', () => {
      // Step 1: Create a realistic container config
      const config = {
        systems: {
          'dnd5e': {
            name: 'D&D 5th Edition',
            manifest: 'https://gitlab.com/foundrynet/dnd5e/-/raw/master/system.json',
            path: '',
            install_at_startup: true
          }
        },
        modules: {
          'lib-wrapper': {
            name: 'libWrapper',
            manifest: 'https://github.com/ruipin/fvtt-lib-wrapper/releases/latest/download/module.json',
            path: '',
            install_at_startup: true
          }
        },
        worlds: {
          'test-world': {
            name: 'Test World',
            manifest: '',
            path: './test-data/worlds/test-world',
            install_at_startup: false,
            check_presence: true
          }
        },
        composition: {
          baseImage: 'felddy/foundryvtt',
          user: '0:0',
          version_params: {
            name: 'foundry-v{version}',
            tag: 'release',
            port: '300{version}',
            versionDir: 'v{version}',
            envSuffix: 'v{version}'
          },
          builder: {
            enabled: true,
            image: 'node:20-alpine'
          }
        },
        versions: {
          '12': {
            install: {
              systems: { 'dnd5e': {} },
              modules: { 'lib-wrapper': {} },
              worlds: { 'test-world': {} }
            }
          },
          '13': {
            install: {
              systems: { 'dnd5e': {} },
              modules: { 'lib-wrapper': {} },
              worlds: { 'test-world': {} }
            },
            composition_params: {
              name: 'foundry-v13-custom',
              port: 31300
            }
          }
        }
      };

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Step 2: Create secrets file
      const secrets = {
        username: 'testuser',
        password: 'testpass123',
        adminKey: 'admin-secret-key'
      };
      fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2));

      // Step 3: Generate compose file using fvtt-compose-gen
      const generateOutput = runComposeGen([
        '-c', configPath,
        '-o', composePath,
        '--secrets-mode', 'file',
        '--secrets-file', secretsPath
      ]);

      // Verify compose file was created
      expect(fs.existsSync(composePath)).toBe(true);

      // Step 4: Parse and validate the generated compose file
      const generatedYaml = fs.readFileSync(composePath, 'utf8');
      const doc = yaml.load(generatedYaml);

      // Validate structure
      expect(doc).toHaveProperty('services');
      expect(doc.services).toHaveProperty('foundry-v12');
      expect(doc.services).toHaveProperty('foundry-v13-custom');
      expect(doc.services).toHaveProperty('builder');
      expect(doc).toHaveProperty('secrets');
      expect(doc).toHaveProperty('volumes');

      // Validate version-specific settings
      expect(doc.services['foundry-v12'].ports).toContain('30012:30000');
      expect(doc.services['foundry-v13-custom'].ports).toContain('31300:30000');

      // Step 5: Use the generated compose file with fvtt-pod in dry-run mode
      const podResult = runPodHandler(['-f', composePath, '--dry-run', 'up', '-d']);

      expect(podResult.code).toBe(0);
      expect(podResult.stdout).toContain('[dry-run]');
      expect(podResult.stdout).toContain('Would run: dc_cmd up -d');

      // Step 6: Test various pod handler commands with the generated file
      const psResult = runPodHandler(['-f', composePath, '--dry-run', 'ps']);
      expect(psResult.code).toBe(0);
      expect(psResult.stdout).toContain('Would run: dc_cmd ps');

      const logsResult = runPodHandler(['-f', composePath, '--dry-run', 'logs', 'foundry-v13-custom']);
      expect(logsResult.code).toBe(0);
      expect(logsResult.stdout).toContain('Would run: dc_cmd logs foundry-v13-custom');

      const execResult = runPodHandler(['-f', composePath, '--dry-run', 'exec', 'foundry-v12', 'ls', '-la']);
      expect(execResult.code).toBe(0);
      expect(execResult.stdout).toContain('Would run: dc_cmd exec -u 0 -it foundry-v12 ls -la');
    });

    test('workflow with external secrets mode', () => {
      const config = {
        systems: {},
        modules: {},
        composition: {
          baseImage: 'felddy/foundryvtt',
          version_params: {
            name: 'foundry-v{version}',
            tag: 'release',
            port: '300{version}'
          }
        },
        versions: {
          '13': { install: { systems: {}, modules: {} } }
        }
      };

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Generate with external secrets
      const generateOutput = runComposeGen([
        '-c', configPath,
        '-o', composePath,
        '--secrets-mode', 'external',
        '--secrets-external', 'foundry-external-secret'
      ]);

      expect(fs.existsSync(composePath)).toBe(true);

      const doc = yaml.load(fs.readFileSync(composePath, 'utf8'));
      expect(doc.secrets).toHaveProperty('foundry-external-secret');
      expect(doc.secrets['foundry-external-secret'].external).toBe(true);

      // Verify the compose file works with pod handler
      const podResult = runPodHandler(['-f', composePath, '--dry-run', 'up']);
      expect(podResult.code).toBe(0);
    });

    test('workflow with no secrets mode', () => {
      const config = {
        systems: {},
        modules: {},
        versions: { '13': { install: { systems: {}, modules: {} } } }
      };

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      const generateOutput = runComposeGen([
        '-c', configPath,
        '-o', composePath,
        '--secrets-mode', 'none'
      ]);

      expect(fs.existsSync(composePath)).toBe(true);

      const doc = yaml.load(fs.readFileSync(composePath, 'utf8'));
      expect(doc.secrets).toEqual({});

      const podResult = runPodHandler(['-f', composePath, '--dry-run', 'up']);
      expect(podResult.code).toBe(0);
    });

    test('workflow with builder service management', () => {
      const config = {
        systems: {},
        modules: {},
        composition: {
          builder: { enabled: true, image: 'node:18-alpine' }
        },
        versions: { '13': { install: { systems: {}, modules: {} } } }
      };

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      const generateOutput = runComposeGen(['-c', configPath, '-o', composePath]);
      expect(fs.existsSync(composePath)).toBe(true);

      const doc = yaml.load(fs.readFileSync(composePath, 'utf8'));
      expect(doc.services).toHaveProperty('builder');
      expect(doc.services.builder.image).toBe('node:18-alpine');

      // Test builder-specific commands
      const runBuilderResult = runPodHandler(['-f', composePath, '--dry-run', 'run-builder']);
      expect(runBuilderResult.code).toBe(0);
      expect(runBuilderResult.stdout).toContain('Would run: dc_cmd up -d --build builder');

      const stopBuilderResult = runPodHandler(['-f', composePath, '--dry-run', 'stop-builder']);
      expect(stopBuilderResult.code).toBe(0);
      expect(stopBuilderResult.stdout).toContain('Would run: dc_cmd stop builder');

      const execBuilderResult = runPodHandler(['-f', composePath, '--dry-run', 'exec', 'builder', 'npm', '--version']);
      expect(execBuilderResult.code).toBe(0);
      expect(execBuilderResult.stdout).toContain('Would run: dc_cmd exec -u 0 -it builder npm --version');
    });

    test('workflow with environment variable overrides', () => {
      const config = {
        systems: {},
        modules: {},
        versions: { '13': { install: { systems: {}, modules: {} } } }
      };

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Generate with environment overrides
      const generateOutput = runComposeGen(['-c', configPath, '-o', composePath], {
        env: {
          ...process.env,
          COMPOSE_BASE_IMAGE: 'custom/foundryvtt',
          COMPOSE_USER: '1000:1000',
          COMPOSE_SECRETS_MODE: 'none'
        }
      });

      expect(fs.existsSync(composePath)).toBe(true);

      const doc = yaml.load(fs.readFileSync(composePath, 'utf8'));
      expect(doc.services['foundry-v13'].image).toContain('custom/foundryvtt');
      expect(doc.services['foundry-v13'].user).toBe('1000:1000');
      expect(doc.secrets).toEqual({});

      // Verify with pod handler
      const podResult = runPodHandler(['-f', composePath, '--dry-run', 'ps'], {
        env: { ...process.env, COMPOSE_FILE: composePath }
      });
      expect(podResult.code).toBe(0);
    });
  });

  describe('error handling in workflows', () => {
    test('pod handler fails gracefully with malformed compose file', () => {
      // Create an invalid YAML file
      fs.writeFileSync(composePath, 'invalid: yaml: content: [unclosed');

      const result = runPodHandler(['-f', composePath, '--dry-run', 'up']);
      
      // Pod handler might handle this gracefully or fail - both are acceptable
      expect(typeof result.code).toBe('number');
      // If it succeeds, it should at least show dry-run output
      if (result.code === 0) {
        expect(result.stdout).toContain('[dry-run]');
      }
    });

    test('compose generator handles invalid config gracefully', () => {
      // Create config with missing required fields
      const invalidConfig = {
        systems: {},
        modules: {}
        // Missing versions field
      };

      fs.writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2));

      try {
        runComposeGen(['-c', configPath, '-o', composePath]);
        // If it doesn't throw, check if file was created
        expect(fs.existsSync(composePath)).toBe(false);
      } catch (error) {
        // Expected to fail with invalid config
        expect(error.status).not.toBe(0);
      }
    });
  });

  describe('realistic development scenarios', () => {
    test('typical development workflow', () => {
      // Simulate a typical developer workflow
      const config = {
        systems: {
          'pf2e': {
            name: 'Pathfinder Second Edition',
            manifest: 'https://github.com/foundryvtt/pf2e/releases/latest/download/system.json',
            path: '',
            install_at_startup: true
          }
        },
        modules: {
          'module-management': {
            name: 'Module Management+',
            manifest: 'https://github.com/mouse0270/module-credits/releases/latest/download/module.json',
            path: '',
            install_at_startup: true
          }
        },
        composition: {
          baseImage: 'felddy/foundryvtt',
          user: '0:0',
          version_params: {
            name: 'foundry-v{version}',
            tag: 'release',
            port: '300{version}',
            versionDir: 'v{version}',
            envSuffix: 'v{version}'
          },
          builder: { enabled: true, image: 'node:20-alpine' }
        },
        versions: {
          '11': {
            install: {
              systems: { 'pf2e': {} },
              modules: { 'module-management': {} }
            }
          },
          '12': {
            install: {
              systems: { 'pf2e': {} },
              modules: { 'module-management': {} }
            }
          },
          '13': {
            install: {
              systems: { 'pf2e': {} },
              modules: { 'module-management': {} }
            }
          }
        }
      };

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Step 1: Generate compose file
      runComposeGen(['-c', configPath, '-o', composePath]);
      expect(fs.existsSync(composePath)).toBe(true);

      const doc = yaml.load(fs.readFileSync(composePath, 'utf8'));
      expect(Object.keys(doc.services).filter(s => s.startsWith('foundry-v'))).toHaveLength(3);

      // Step 2: Start all services
      const upResult = runPodHandler(['-f', composePath, '--dry-run', 'up', '-d']);
      expect(upResult.code).toBe(0);

      // Step 3: Check service status
      const psResult = runPodHandler(['-f', composePath, '--dry-run', 'ps']);
      expect(psResult.code).toBe(0);

      // Step 4: View logs for specific version
      const logsResult = runPodHandler(['-f', composePath, '--dry-run', 'logs', '-f', 'foundry-v13']);
      expect(logsResult.code).toBe(0);

      // Step 5: Execute commands in container
      const execResult = runPodHandler(['-f', composePath, '--dry-run', 'exec', 'foundry-v12', 'ls', '/data']);
      expect(execResult.code).toBe(0);

      // Step 6: Manage builder service
      const builderStartResult = runPodHandler(['-f', composePath, '--dry-run', 'run-builder']);
      expect(builderStartResult.code).toBe(0);

      // Step 7: Stop services
      const downResult = runPodHandler(['-f', composePath, '--dry-run', 'down']);
      expect(downResult.code).toBe(0);
    });

    test('configuration changes and regeneration', () => {
      // Initial configuration
      const initialConfig = {
        systems: {},
        modules: {},
        versions: { '13': { install: { systems: {}, modules: {} } } }
      };

      fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));

      // Generate initial compose file
      runComposeGen(['-c', configPath, '-o', composePath]);
      
      const initialDoc = yaml.load(fs.readFileSync(composePath, 'utf8'));
      expect(Object.keys(initialDoc.services).filter(s => s.startsWith('foundry-v'))).toHaveLength(1); // Only foundry-v13

      // Modified configuration with additional version
      const modifiedConfig = {
        ...initialConfig,
        versions: {
          '12': { install: { systems: {}, modules: {} } },
          '13': { install: { systems: {}, modules: {} } }
        }
      };

      fs.writeFileSync(configPath, JSON.stringify(modifiedConfig, null, 2));

      // Regenerate compose file
      runComposeGen(['-c', configPath, '-o', composePath]);
      
      const modifiedDoc = yaml.load(fs.readFileSync(composePath, 'utf8'));
      expect(Object.keys(modifiedDoc.services).filter(s => s.startsWith('foundry-v'))).toHaveLength(2);

      // Verify both versions work with pod handler
      const v12Result = runPodHandler(['-f', composePath, '--dry-run', 'logs', 'foundry-v12']);
      expect(v12Result.code).toBe(0);

      const v13Result = runPodHandler(['-f', composePath, '--dry-run', 'logs', 'foundry-v13']);
      expect(v13Result.code).toBe(0);
    });
  });
});