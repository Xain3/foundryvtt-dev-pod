/**
 * @file fvtt-status.int.test.js
 * @description Integration tests for fvtt-status CLI
 * @path tests/integration/fvtt-status.int.test.js
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Helper function to run fvtt-status CLI
 * @param {Array} args - CLI arguments
 * @param {Object} options - Execution options
 * @returns {Object} Result with stdout, stderr, and code
 */
function runFvttStatus(args = [], options = {}) {
  // Get the script path relative to the project root, not the test temp dir
  const projectRoot = path.resolve(__dirname, '../..');
  const scriptPath = path.join(projectRoot, 'scripts/fvtt-status.mjs');
  const command = `node ${scriptPath} ${args.join(' ')}`;
  
  try {
    const stdout = execSync(command, {
      cwd: options.cwd || process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, ...options.env },
      stdio: 'pipe'
    });
    return { stdout, stderr: '', code: 0 };
  } catch (error) {
    return {
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || error.message,
      code: error.status || 1
    };
  }
}

describe('fvtt-status CLI integration', () => {
  let tempDir;
  let originalCwd;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fvtt-status-int-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    // Restore original working directory
    process.chdir(originalCwd);
    
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('help functionality', () => {
    test('shows help with --help flag', () => {
      const result = runFvttStatus(['--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: fvtt-status');
      expect(result.stdout).toContain('FoundryVTT development pod status checker');
      expect(result.stdout).toContain('Options:');
      expect(result.stdout).toContain('--json');
      expect(result.stdout).toContain('--dry-run');
      expect(result.stdout).toContain('Exit Codes:');
    });

    test('shows help with -h flag', () => {
      const result = runFvttStatus(['-h']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: fvtt-status');
    });
  });

  describe('pod detection', () => {
    test('detects no pod when no files present', () => {
      const result = runFvttStatus([]);

      expect(result.code).toBe(2); // Pod not detected
      expect(result.stdout).toContain('FoundryVTT Development Pod Status');
      expect(result.stdout).toContain('✗ Compose file: No compose file found');
      expect(result.stdout).toContain('⚠ Container config: Configuration file not found');
    });

    test('detects pod with compose file and config', () => {
      // Create test compose file
      fs.writeFileSync('compose.dev.yml', `
version: '3.8'
services:
  foundry-v13:
    image: felddy/foundryvtt:release
    ports:
      - "30013:30000"
`);

      // Create test config file
      const config = {
        systems: {},
        modules: {},
        versions: { "13": { install: { systems: {}, modules: {} } } }
      };
      fs.writeFileSync('container-config.json', JSON.stringify(config, null, 2));

      const result = runFvttStatus([]);

      expect(result.code).toBe(0); // Success
      expect(result.stdout).toContain('✓ Compose file found: compose.dev.yml');
      expect(result.stdout).toContain('✓ Container config found: container-config.json');
      expect(result.stdout).toContain('✓ Configuration is valid');
    });

    test('handles missing compose file with config present', () => {
      // Create only config file
      const config = {
        systems: {},
        modules: {},
        versions: { "13": { install: { systems: {}, modules: {} } } }
      };
      fs.writeFileSync('container-config.json', JSON.stringify(config, null, 2));

      const result = runFvttStatus([]);

      expect(result.code).toBe(2); // Pod invalid
      expect(result.stdout).toContain('✗ Compose file: No compose file found');
      expect(result.stdout).toContain('✓ Container config found: container-config.json');
    });

    test('handles invalid config file', () => {
      // Create compose file
      fs.writeFileSync('compose.dev.yml', 'version: "3.8"\nservices:\n  test:\n    image: alpine');

      // Create invalid config file
      const invalidConfig = {
        systems: { test: { name: "Test" } }, // Missing manifest/path
        modules: {},
        versions: { "13": {} } // Missing install
      };
      fs.writeFileSync('container-config.json', JSON.stringify(invalidConfig, null, 2));

      const result = runFvttStatus([]);

      expect(result.code).toBe(2); // Pod invalid
      expect(result.stdout).toContain('✓ Compose file found: compose.dev.yml');
      expect(result.stdout).toContain('✓ Container config found: container-config.json');
      expect(result.stdout).toContain('✗ Configuration is invalid');
    });
  });

  describe('JSON output', () => {
    test('produces valid JSON with --json flag', () => {
      const result = runFvttStatus(['--json']);

      expect(result.code).toBe(2); // No pod detected
      
      // Should be valid JSON
      let jsonResult;
      expect(() => {
        jsonResult = JSON.parse(result.stdout);
      }).not.toThrow();

      expect(jsonResult).toHaveProperty('status');
      expect(jsonResult).toHaveProperty('timestamp');
      expect(jsonResult).toHaveProperty('healthy');
      expect(jsonResult).toHaveProperty('pod');
      expect(jsonResult).toHaveProperty('services');
      expect(jsonResult).toHaveProperty('healthChecks');
      
      expect(jsonResult.status).toBe('unhealthy');
      expect(jsonResult.healthy).toBe(false);
      expect(jsonResult.pod.detected).toBe(false);
    });

    test('JSON output includes all required fields when pod detected', () => {
      // Create test files
      fs.writeFileSync('compose.dev.yml', 'version: "3.8"\nservices:\n  test:\n    image: alpine');
      
      const config = {
        systems: {},
        modules: {},
        versions: { "13": { install: { systems: {}, modules: {} } } }
      };
      fs.writeFileSync('container-config.json', JSON.stringify(config, null, 2));

      const result = runFvttStatus(['--json']);

      expect(result.code).toBe(0); // Success
      
      const jsonResult = JSON.parse(result.stdout);
      expect(jsonResult.status).toBe('healthy');
      expect(jsonResult.healthy).toBe(true);
      expect(jsonResult.pod.detected).toBe(true);
      expect(jsonResult.pod.composeFile.found).toBe(true);
      expect(jsonResult.pod.config.found).toBe(true);
      expect(jsonResult.pod.config.valid).toBe(true);
    });
  });

  describe('dry-run mode', () => {
    test('shows dry-run messages with --dry-run flag', () => {
      const result = runFvttStatus(['--dry-run']);

      expect(result.stdout).toContain('[dry-run] fvtt-status: Performing status check dry-run');
      expect(result.stdout).toContain('[dry-run] Would check compose file: auto-detect');
      expect(result.stdout).toContain('[dry-run] Would check config file: container-config.json');
      expect(result.stdout).toContain('[dry-run] Would check docker availability');
      expect(result.stdout).toContain('[dry-run] Would check service status');
    });

    test('works with -n flag', () => {
      const result = runFvttStatus(['-n']);

      expect(result.stdout).toContain('[dry-run]');
    });
  });

  describe('file specification', () => {
    test('uses specified compose file with -f flag', () => {
      fs.writeFileSync('custom.yml', 'version: "3.8"\nservices:\n  test:\n    image: alpine');
      
      const config = {
        systems: {},
        modules: {},
        versions: { "13": { install: { systems: {}, modules: {} } } }
      };
      fs.writeFileSync('container-config.json', JSON.stringify(config, null, 2));

      const result = runFvttStatus(['-f', 'custom.yml', '--json']);

      expect(result.code).toBe(0);
      const jsonResult = JSON.parse(result.stdout);
      expect(jsonResult.pod.composeFile.file).toBe('custom.yml');
      expect(jsonResult.pod.composeFile.source).toBe('specified');
    });

    test('uses specified config file with -c flag', () => {
      fs.writeFileSync('compose.dev.yml', 'version: "3.8"\nservices:\n  test:\n    image: alpine');
      
      const config = {
        systems: {},
        modules: {},
        versions: { "13": { install: { systems: {}, modules: {} } } }
      };
      fs.writeFileSync('custom-config.json', JSON.stringify(config, null, 2));

      const result = runFvttStatus(['-c', 'custom-config.json', '--json']);

      expect(result.code).toBe(0);
      const jsonResult = JSON.parse(result.stdout);
      expect(jsonResult.pod.config.file).toBe('custom-config.json');
    });

    test('handles missing specified files gracefully', () => {
      const result = runFvttStatus(['-f', 'missing.yml']);

      expect(result.code).toBe(2); // Pod invalid
      expect(result.stdout).toContain('✗ Compose file: File not found');
    });
  });

  describe('error handling', () => {
    test('handles unknown options', () => {
      const result = runFvttStatus(['--unknown-option']);

      expect(result.code).toBe(1); // General error
      expect(result.stderr || result.stdout).toContain('Unknown option');
    });

    test('handles invalid option values', () => {
      const result = runFvttStatus(['-f']);

      expect(result.code).toBe(1); // General error
      expect(result.stderr || result.stdout).toContain('requires a value');
    });
  });
});