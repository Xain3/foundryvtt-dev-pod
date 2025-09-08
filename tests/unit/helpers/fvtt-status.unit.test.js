/**
 * @file fvtt-status.unit.test.js
 * @description Unit tests for fvtt-status helper module
 * @path tests/unit/helpers/fvtt-status.unit.test.js
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { checkStatus } from '../../../helpers/fvtt-status.mjs';

// Mock child_process at module level
const mockExecSync = jest.fn();
jest.mock('child_process', () => ({
  execSync: mockExecSync
}));

describe('fvtt-status helper', () => {
  let tempDir;
  let originalCwd;
  let composeFile;
  let configFile;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fvtt-status-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Create test files
    composeFile = path.join(tempDir, 'compose.dev.yml');
    configFile = path.join(tempDir, 'container-config.json');

    // Mock console.log to prevent test output pollution
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Clear mocks
    jest.clearAllMocks();
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
      mockExecSync
        .mockReturnValueOnce('Docker version')
        .mockReturnValueOnce('docker-compose version');

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

      // Mock docker not available - both commands should fail
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

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
      mockExecSync
        .mockReturnValueOnce('Docker version')
        .mockReturnValueOnce('docker-compose version');

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