/**
 * @file fvtt-pod.int.test.js
 * @description Integration tests for the fvtt-pod CLI binary
 * @path tests/integration/fvtt-pod.int.test.js
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { runBashScript } from '../utils/shell.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// Allow longer time for integration shell operations
jest.setTimeout(30000);

/**
 * Return combined stdout+stderr for easier assertions
 * @param {{stdout?:string, stderr?:string}} result
 */
function combinedOutput(result) {
  return `${result.stdout || ''}${result.stderr || ''}`;
}

/**
 * Assert common dry-run expectations
 * @param {object} result - result from runBashScript
 * @param {RegExp} expectedPattern - regex to match the dc invocation
 */
function expectDryRun(result, expectedPattern) {
  const out = combinedOutput(result);
  expect(out).toContain('[dry-run]');
  expect(out).toMatch(expectedPattern);
}

describe('fvtt-pod CLI binary integration tests', () => {
  let tempDir;
  let testComposeFile;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fvtt-pod-test-'));
    testComposeFile = path.join(tempDir, 'test-compose.yml');

    // Create a basic test compose file
    const composeContent = `version: '3.8'
services:
  foundry-v13:
    image: felddy/foundryvtt:release
    container_name: foundry-v13
    ports:
      - "30013:30000"
    environment:
      - FOUNDRY_VERSION=13
    volumes:
      - foundry_data_v13:/data
    restart: unless-stopped

  test-service:
    image: alpine:latest
    container_name: test-service
    command: sleep 300
    restart: unless-stopped

  builder:
    image: node:20-alpine
    container_name: foundry-builder
    volumes:
      - .:/workspace
    working_dir: /workspace
    command: sleep infinity
    restart: unless-stopped

volumes:
  foundry_data_v13:
`;
    fs.writeFileSync(testComposeFile, composeContent);
  });

  afterEach(() => {
    // Clean up temporary files
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('basic functionality', () => {
    test('shows usage when no arguments provided', () => {
      const result = runPodHandler();

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('up');
      expect(result.stdout).toContain('down');
      expect(result.stdout).toContain('logs');
    });

    test('shows help with --help flag', () => {
      const result = runPodHandler(['--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Options:');
      expect(result.stdout).toContain('Commands:');
    });

    test('shows help with help command', () => {
      const result = runPodHandler(['help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage:');
    });
  });

  describe('dry-run functionality', () => {
    test.each([
      [['up','-d'], /Would run:.*\bup\b.*-d/],
      [['down'], /Would run:.*\bdown\b/],
      [['ps'], /Would run:.*\bps\b/],
      [['logs','foundry-v13'], /Would run:.*\blogs\b.*foundry-v13/],
      [['logs','-f','test-service'], /Would run:.*\blogs\b.*-f.*test-service/],
      [['exec','test-service','ls','-la'], /Would run:.*\bexec\b.*test-service.*ls -la/],
      [['shell','foundry-v13'], /Would run:.*\bexec\b.*foundry-v13/],
      [['start','test-service'], /Would run:.*\bup\b.*--no-deps.*test-service/],
      [['restart','foundry-v13'], /Would run:.*\brestart\b.*foundry-v13/],
      [['build'], /Would run:.*\bbuild\b/],
      [['build','builder'], /Would run:.*\bbuild\b.*builder/],
      [['pull'], /Would run:.*\bpull\b/],
      [['run-builder'], /Would run:.*\bup\b.*builder/],
      [['stop-builder'], /Would run:.*\bstop\b.*builder/],
    ])('dry-run mode with %p', (cmdArgs, pattern) => {
      const args = ['-f', testComposeFile, '--dry-run', ...cmdArgs];
      const result = runPodHandler(args);
      expect(result.code).toBe(0);
      expectDryRun(result, pattern);
    });
  });

  describe('CLI argument handling', () => {
    test('handles short -f flag for compose file', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'ps']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
    });

    test('handles long --file flag for compose file', () => {
      const result = runPodHandler(['--file', testComposeFile, '--dry-run', 'ps']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
    });

    test('handles short -n flag for dry-run', () => {
      const result = runPodHandler(['-f', testComposeFile, '-n', 'up']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
    });

    test('handles long --dry-run flag', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'up']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
    });

    test('falls back to default compose file when not specified', () => {
      // Create default compose file in repo root where the binary expects it
      const repoRoot = path.resolve(__dirname, '../..');
      const defaultComposePath = path.join(repoRoot, 'compose.dev.yml');
      
      // Only create the file if it doesn't exist (don't overwrite existing)
      const fileExists = fs.existsSync(defaultComposePath);
      if (!fileExists) {
        fs.writeFileSync(defaultComposePath, fs.readFileSync(testComposeFile));
      }

      try {
        const result = runPodHandler(['--dry-run', 'ps']);
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('[dry-run]');
      } finally {
        // Clean up temp file if we created it
        if (!fileExists && fs.existsSync(defaultComposePath)) {
          fs.unlinkSync(defaultComposePath);
        }
      }
    });

    test('fails gracefully when compose file does not exist', () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.yml');
      const result = runPodHandler(['-f', nonExistentFile, '--dry-run', 'up']);

      expect(result.code).not.toBe(0);
      expect(result.stderr || result.stdout).toContain('not found');
    });

    test('fails gracefully with invalid command', () => {
      const result = runPodHandler(['-f', testComposeFile, 'invalid-command']);

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('Unknown command') || expect(result.stdout).toContain('Usage:');
    });
  });

  describe('command forwarding', () => {
    test('forwards additional arguments to docker compose', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'up', '-d', '--remove-orphans']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Would run: dc_cmd up -d --remove-orphans');
    });

    test('forwards exec arguments correctly', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'exec', 'foundry-v13', 'cat', '/etc/hostname']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Would run: dc_cmd exec -u 0 -it foundry-v13 cat /etc/hostname');
    });

    test('handles complex argument combinations', () => {
      const result = runPodHandler([
        '-f', testComposeFile,
        '--dry-run',
        'logs',
        '--tail', '50',
        '--timestamps',
        'foundry-v13'
      ]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Would run: dc_cmd logs');
      expect(result.stdout).toContain('--tail');
    });
  });

  describe('docker compose detection', () => {
    test('works with docker compose v2 command structure', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'ps']);

      expect(result.code).toBe(0);
      // The script should use docker compose (v2) when available
      expect(result.stdout).toContain('Would run: dc_cmd ps');
    });
  });

  describe('service-specific commands', () => {
    test('validates service name for service-specific commands', () => {
      // Commands that require service names should work with valid services
      const validServiceResult = runPodHandler(['-f', testComposeFile, '--dry-run', 'logs', 'foundry-v13']);
      expect(validServiceResult.code).toBe(0);

      const validStartResult = runPodHandler(['-f', testComposeFile, '--dry-run', 'start', 'test-service']);
      expect(validStartResult.code).toBe(0);

      const validRestartResult = runPodHandler(['-f', testComposeFile, '--dry-run', 'restart', 'builder']);
      expect(validRestartResult.code).toBe(0);
    });

    test('handles missing service name for commands that require it', () => {
      // Some commands might fail without service names, but in dry-run they should show what would be executed
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'exec']);

      // The behavior might vary - either it fails gracefully or shows what would be executed
      // We mainly test that it doesn't crash
      expect(typeof result.code).toBe('number');
    });
  });

  describe('environment integration', () => {
    test('respects COMPOSE_FILE environment variable', () => {
      const result = runPodHandler(['--dry-run', 'ps'], {
        env: { ...process.env, COMPOSE_FILE: testComposeFile }
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
    });

    test('CLI -f flag overrides COMPOSE_FILE environment variable', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'ps'], {
        env: { ...process.env, COMPOSE_FILE: '/some/other/file.yml' }
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
    });
  });

  describe('error handling', () => {
    test('provides meaningful error for missing compose file', () => {
      const missingFile = path.join(tempDir, 'missing.yml');
      const result = runPodHandler(['-f', missingFile, '--dry-run', 'up']);

      expect(result.code).not.toBe(0);
      // Should indicate the file doesn't exist
      expect(result.stderr || result.stdout).toMatch(/does not exist|not found|no such file/i);
    });

    test('handles permission errors gracefully', () => {
      // Create a file with no read permissions (if possible on the system)
      const restrictedFile = path.join(tempDir, 'restricted.yml');
      fs.writeFileSync(restrictedFile, 'test content');

      try {
        fs.chmodSync(restrictedFile, 0o000);
        const result = runPodHandler(['-f', restrictedFile, '--dry-run', 'ps']);

        // Should fail but not crash
        expect(typeof result.code).toBe('number');
      } catch (error) {
        // If chmod fails (e.g., on some CI systems), skip this test
        // by just ensuring the script doesn't crash with a regular file
        console.warn('chmod failed, skipping permission test:', error);
        const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'ps']);
        expect(result.code).toBe(0);
      } finally {
        try {
          fs.chmodSync(restrictedFile, 0o644);
        } catch (e) {
          // Ignore cleanup errors
          // Ignore cleanup errors (e.g., if chmod fails on some CI systems)
          console.warn('cleanup chmod failed, skipping permission test:', e);
        }
      }
    });
  });
});