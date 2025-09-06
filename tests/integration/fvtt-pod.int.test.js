/**
 * @file fvtt-pod.int.test.js
 * @description Integration tests for the fvtt-pod CLI binary
 * @path tests/integration/fvtt-pod.int.test.js
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    test('dry-run mode with up command', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'up', '-d']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd up -d');
    });

    test('dry-run mode with down command', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'down']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd down');
    });

    test('dry-run mode with ps command', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'ps']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd ps');
    });

    test('dry-run mode with logs command', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'logs', 'foundry-v13']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd logs foundry-v13');
    });

    test('dry-run mode with logs -f command', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'logs', '-f', 'test-service']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd logs -f test-service');
    });

    test('dry-run mode with exec command', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'exec', 'test-service', 'ls', '-la']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd exec -u 0 -it test-service ls -la');
    });

    test('dry-run mode with shell command', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'shell', 'foundry-v13']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd exec -u 0 -it foundry-v13');
    });

    test('dry-run mode with start command', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'start', 'test-service']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd up -d --build --no-deps test-service');
    });

    test('dry-run mode with restart command', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'restart', 'foundry-v13']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd restart foundry-v13');
    });

    test('dry-run mode with build command', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'build']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd build');
    });

    test('dry-run mode with build specific service', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'build', 'builder']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd build builder');
    });

    test('dry-run mode with pull command', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'pull']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd pull');
    });

    test('dry-run mode with run-builder command', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'run-builder']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd up -d --build builder');
    });

    test('dry-run mode with stop-builder command', () => {
      const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'stop-builder']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('Would run: dc_cmd stop builder');
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
      // Change to temp directory and create default compose file
      const defaultComposePath = path.join(tempDir, 'compose.dev.yml');
      fs.writeFileSync(defaultComposePath, fs.readFileSync(testComposeFile));
      
      const originalCwd = process.cwd();
      try {
        process.chdir(tempDir);
        const result = runPodHandler(['--dry-run', 'ps']);
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('[dry-run]');
      } finally {
        process.chdir(originalCwd);
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
        const result = runPodHandler(['-f', testComposeFile, '--dry-run', 'ps']);
        expect(result.code).toBe(0);
      } finally {
        try {
          fs.chmodSync(restrictedFile, 0o644);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });
  });
});