/**
 * @file fvtt-status.unit.test.js
 * @description Unit tests for fvtt-status common module
 * @path tests/unit/scripts/common/fvtt-status.unit.test.js
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
// Mock child_process BEFORE importing the module under test (ESM)
// Use unstable_mockModule for ESM-compatible mocking so that the import of the
// module under test sees the mocked execSync.
const execSyncMock = jest.fn(() => { throw new Error('Command not found'); });
jest.unstable_mockModule('child_process', () => {
  // Only provide the bits we need; tests do not rely on other child_process exports.
  return {
    execSync: (...args) => execSyncMock(...args)
  };
});

// Will hold dynamically imported symbols from module under test
let checkStatus;

describe('fvtt-status common module', () => {
  let tempDir;
  let originalCwd;

  beforeAll(async () => {
    // Dynamically import after mocking child_process
    const mod = await import('../../../../scripts/common/fvtt-status.mjs');
    checkStatus = mod.checkStatus;
  });

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fvtt-status-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Create test files
    // composeFile and configFile are not used in tests

    // Mock console.log to prevent test output pollution
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Clear mocks
    jest.clearAllMocks();
    execSyncMock.mockClear();
  });

  afterEach(() => {
    // Restore original working directory
    process.chdir(originalCwd);

    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    console.log.mockRestore();
    console.warn.mockRestore();
  });

  describe('checkStatus', () => {
    it('should detect compose file and config when present', async () => {
      // Create test files in working directory (not full path)
      fs.writeFileSync('compose.dev.yml', 'version: "3.8"\nservices:\n  test:\n    image: alpine');

      const validConfig = {
        systems: { test: { name: "Test", manifest: "https://example.com/test.json" } },
        modules: {},
        versions: { "13": { install: { systems: { test: {} }, modules: {} } } }
      };
      fs.writeFileSync('container-config.json', JSON.stringify(validConfig, null, 2));

      // Mock docker availability
      // Simulate docker and docker-compose new style available
      execSyncMock
        .mockImplementationOnce(() => 'Docker version') // docker --version
        .mockImplementationOnce(() => 'docker compose version'); // docker compose version

      const options = { json: true, dryRun: false };
      const result = await checkStatus(options);

      expect(result.pod.detected).toBe(true);
      expect(result.pod.composeFile.found).toBe(true);
      expect(result.pod.composeFile.file).toBe('compose.dev.yml');
      expect(result.pod.config.found).toBe(true);
      expect(result.pod.config.valid).toBe(true);
      expect(result.dockerAvailable).toBe(true);
    });

    it('should handle missing compose file', async () => {
      // Don't create compose file, only config
      const validConfig = {
        systems: {},
        modules: {},
        versions: { "13": { install: { systems: {}, modules: {} } } }
      };
      fs.writeFileSync('container-config.json', JSON.stringify(validConfig, null, 2));

      const options = { json: true, dryRun: false };
      const result = await checkStatus(options);

      expect(result.pod.detected).toBe(true); // Config file exists
      expect(result.pod.composeFile.found).toBe(false);
      expect(result.pod.composeFile.error).toBe('No compose file found');
      expect(result.healthy).toBe(false);
    });

    it('should handle missing docker', async () => {
      // Create test files
      fs.writeFileSync('compose.dev.yml', 'version: "3.8"\nservices:\n  test:\n    image: alpine');

      const validConfig = {
        systems: {},
        modules: {},
        versions: { "13": { install: { systems: {}, modules: {} } } }
      };
      fs.writeFileSync('container-config.json', JSON.stringify(validConfig, null, 2));
      // Ensure mock is in failure mode (default implementation throws)
  execSyncMock.mockImplementation(() => { throw new Error('Command not found'); });
      const options = { json: true, dryRun: false };
      const result = await checkStatus(options);
      expect(result.dockerAvailable).toBe(false);
      expect(result.healthChecks.issues).toContain('Docker not available');
      expect(result.healthy).toBe(false);
    });

    it('should handle dry-run mode', async () => {
      // Create test files
      fs.writeFileSync('compose.dev.yml', 'version: "3.8"\nservices:\n  test:\n    image: alpine');

      const validConfig = {
        systems: {},
        modules: {},
        versions: { "13": { install: { systems: {}, modules: {} } } }
      };
      fs.writeFileSync('container-config.json', JSON.stringify(validConfig, null, 2));

      // Mock docker availability
      execSyncMock
        .mockImplementationOnce(() => 'Docker version')
        .mockImplementationOnce(() => 'docker compose version');

      const options = { json: true, dryRun: true };
      const result = await checkStatus(options);

      expect(result.services).toEqual([]); // No services checked in dry-run
      expect(result.pod.detected).toBe(true);
    });

    it('should use specified compose file', async () => {
      // Create custom compose file
      fs.writeFileSync('custom-compose.yml', 'version: "3.8"\nservices:\n  test:\n    image: alpine');

      const validConfig = {
        systems: {},
        modules: {},
        versions: { "13": { install: { systems: {}, modules: {} } } }
      };
      fs.writeFileSync('container-config.json', JSON.stringify(validConfig, null, 2));

      const options = {
        composeFile: 'custom-compose.yml',
        json: true,
        dryRun: false
      };
      const result = await checkStatus(options);

      expect(result.pod.composeFile.file).toBe('custom-compose.yml');
      expect(result.pod.composeFile.source).toBe('specified');
    });

    it('should handle missing specified compose file', async () => {
      // Create config but not the specified compose file
      const validConfig = {
        systems: {},
        modules: {},
        versions: { "13": { install: { systems: {}, modules: {} } } }
      };
      fs.writeFileSync('container-config.json', JSON.stringify(validConfig, null, 2));

      const options = {
        composeFile: 'missing-compose.yml',
        json: true,
        dryRun: false
      };
      const result = await checkStatus(options);

      expect(result.pod.composeFile.found).toBe(false);
      expect(result.pod.composeFile.error).toBe('File not found');
      expect(result.healthy).toBe(false);
    });

    it('should handle config validation errors', async () => {
      // Create compose file
      fs.writeFileSync('compose.dev.yml', 'version: "3.8"\nservices:\n  test:\n    image: alpine');

      // Create invalid config
      const invalidConfig = {
        systems: { test: { name: "Test" } }, // Missing manifest/path
        modules: {},
        versions: { "13": {} } // Missing install
      };
      fs.writeFileSync('container-config.json', JSON.stringify(invalidConfig, null, 2));

      const options = { json: true, dryRun: false };
      const result = await checkStatus(options);

      expect(result.pod.config.valid).toBe(false);
      expect(result.pod.config.error).toContain('must have either "manifest" or "path"');
      expect(result.pod.valid).toBe(false);
    });

    it('should handle missing config file', async () => {
      // Create compose file but not config
      fs.writeFileSync('compose.dev.yml', 'version: "3.8"\nservices:\n  test:\n    image: alpine');

      const options = { json: true, dryRun: false };
      const result = await checkStatus(options);

      expect(result.pod.detected).toBe(true); // Compose file exists
      expect(result.pod.config.found).toBe(false);
      expect(result.pod.config.error).toBe('Configuration file not found');
      expect(result.pod.valid).toBe(false); // Config is required for valid pod
    });
  });
});