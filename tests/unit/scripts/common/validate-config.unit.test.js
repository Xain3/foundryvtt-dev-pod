import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest, describe, test, beforeEach, afterEach, expect } from '@jest/globals';
import {
  validateConfig,
  validateConfigWithCache,
  checkConfigWithCache,
  parseCommandLineArgs,
  showHelpMessage,
  logValidationErrors,
  logValidationSuccess,
  runConfigValidation
} from '#scripts/common/validate-config.mjs';

// Helper for asserting validation error messages
function expectValidationError(result, expected) {
  const expectedArr = Array.isArray(expected) ? expected : [expected];
  expect(result.errors).toBeDefined();
  const found = expectedArr.some(sub => result.errors.some(e => e.includes(sub)));
  expect(found).toBe(true);
}

describe('scripts/common/validate-config.mjs', () => {
  let tempDir;
  let validConfigPath;
  let invalidConfigPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-config-common-test-'));

    // Create a valid config
    const validConfig = {
      systems: {
        dnd5e: {
          name: "D&D 5e System",
          manifest: "https://example.com/dnd5e/manifest.json"
        }
      },
      modules: {
        dice_so_nice: {
          name: "Dice So Nice",
          manifest: "https://example.com/dice-so-nice/manifest.json"
        }
      },
      versions: {
        "12": {
          supported: true,
          install: {
            systems: { dnd5e: {} },
            modules: { dice_so_nice: {} }
          }
        }
      }
    };

    // Create an invalid config (missing required fields)
    const invalidConfig = {
      versions: {
        "12": { supported: true }
      }
    };

    validConfigPath = path.join(tempDir, 'valid-config.json');
    invalidConfigPath = path.join(tempDir, 'invalid-config.json');

    fs.writeFileSync(validConfigPath, JSON.stringify(validConfig, null, 2));
    fs.writeFileSync(invalidConfigPath, JSON.stringify(invalidConfig, null, 2));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('validateConfig', () => {
    test('validates a correct configuration', () => {
      const result = validateConfig(validConfigPath);
      expect(result.valid).toBe(true);
    });

    test('rejects an invalid configuration', () => {
      const result = validateConfig(invalidConfigPath);
      expect(result.valid).toBe(false);
      expectValidationError(result, 'must have required property "systems"');
    });

    test('handles non-existent files', () => {
      const result = validateConfig(path.join(tempDir, 'nonexistent.json'));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/Config file not found/);
    });
  });

  describe('validateConfigWithCache', () => {
    test('validates with caching enabled', () => {
      const cacheDir = path.join(tempDir, '.cache');
      const result = validateConfigWithCache(validConfigPath, null, cacheDir);
      expect(result.valid).toBe(true);
      expect(result.cached).toBe(false); // First time, not cached
    });

    test('uses cached result on subsequent calls', () => {
      const cacheDir = path.join(tempDir, '.cache');
      
      // First call - creates cache
      const result1 = validateConfigWithCache(validConfigPath, null, cacheDir);
      expect(result1.valid).toBe(true);
      expect(result1.cached).toBe(false);
      
      // Second call - uses cache
      const result2 = validateConfigWithCache(validConfigPath, null, cacheDir);
      expect(result2.valid).toBe(true);
      expect(result2.cached).toBe(true);
    });
  });

  describe('checkConfigWithCache', () => {
    test('uses cache when enabled', () => {
      const cacheDir = path.join(tempDir, '.cache');
      const result = checkConfigWithCache(true, validConfigPath, cacheDir);
      expect(result.valid).toBe(true);
    });

    test('skips cache when disabled', () => {
      const result = checkConfigWithCache(false, validConfigPath);
      expect(result.valid).toBe(true);
      expect(result.cached).toBeUndefined();
    });
  });

  describe('parseCommandLineArgs', () => {
    // Mock process.exit for testing
    const originalExit = process.exit;
    let exitCode = null;
    
    beforeEach(() => {
      exitCode = null;
      process.exit = jest.fn((code) => {
        exitCode = code;
        throw new Error(`process.exit(${code})`);
      });
    });

    afterEach(() => {
      process.exit = originalExit;
    });

    test('parses valid arguments', () => {
      const args = ['config.json', 'cache-dir'];
      const result = parseCommandLineArgs(args);
      expect(result).toEqual({
        useCache: true,
        configPath: 'config.json',
        cacheDir: 'cache-dir'
      });
    });

    test('handles --no-cache flag', () => {
      const args = ['config.json', '--no-cache'];
      const result = parseCommandLineArgs(args);
      expect(result.useCache).toBe(false);
      expect(result.configPath).toBe('config.json');
    });

    test('throws error when config path is missing', () => {
      const args = [];
      expect(() => parseCommandLineArgs(args)).toThrow('process.exit(1)');
      expect(exitCode).toBe(1);
    });
  });

  describe('showHelpMessage', () => {
    const originalExit = process.exit;
    const originalLog = console.log;
    let exitCode = null;
    let logOutput = [];

    beforeEach(() => {
      exitCode = null;
      logOutput = [];
      process.exit = jest.fn((code) => {
        exitCode = code;
        throw new Error(`process.exit(${code})`);
      });
      console.log = jest.fn((msg) => logOutput.push(msg));
    });

    afterEach(() => {
      process.exit = originalExit;
      console.log = originalLog;
    });

    test('shows help for empty args', () => {
      expect(() => showHelpMessage([])).toThrow('process.exit(0)');
      expect(exitCode).toBe(0);
      expect(logOutput.some(line => line.includes('Usage:'))).toBe(true);
    });

    test('shows help for --help flag', () => {
      expect(() => showHelpMessage(['--help'])).toThrow('process.exit(0)');
      expect(exitCode).toBe(0);
      expect(logOutput.some(line => line.includes('Usage:'))).toBe(true);
    });

    test('returns false for non-help args', () => {
      const result = showHelpMessage(['config.json']);
      expect(result).toBe(false);
      expect(logOutput).toHaveLength(0);
    });
  });

  describe('runConfigValidation', () => {
    const originalExit = process.exit;
    const originalLog = console.log;
    const originalError = console.error;
    let exitCode = null;
    let logOutput = [];
    let errorOutput = [];

    beforeEach(() => {
      exitCode = null;
      logOutput = [];
      errorOutput = [];
      process.exit = jest.fn((code) => {
        exitCode = code;
        throw new Error(`process.exit(${code})`);
      });
      console.log = jest.fn((msg) => logOutput.push(msg));
      console.error = jest.fn((msg) => errorOutput.push(msg));
    });

    afterEach(() => {
      process.exit = originalExit;
      console.log = originalLog;
      console.error = originalError;
    });

    test('shows help and exits for empty args', () => {
      expect(() => runConfigValidation([])).toThrow('process.exit(0)');
      expect(exitCode).toBe(0);
    });

    test('exits with success for valid config', () => {
      expect(() => runConfigValidation([validConfigPath, '--no-cache'])).toThrow('process.exit(0)');
      expect(exitCode).toBe(0);
      expect(logOutput.some(line => line.includes('✓ Configuration is valid'))).toBe(true);
    });

    test('exits with error for invalid config', () => {
      expect(() => runConfigValidation([invalidConfigPath, '--no-cache'])).toThrow('process.exit(1)');
      expect(exitCode).toBe(1);
      expect(errorOutput.some(line => line.includes('✗ Configuration is invalid'))).toBe(true);
    });
  });
});