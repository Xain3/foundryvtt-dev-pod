import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import childProcess from 'node:child_process';
import { validateConfig, validateConfigWithCache, calculateFileHash } from '../../../scripts/validate-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runNode(args, opts = {}) {
  try {
    return childProcess.execSync(`node ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  } catch (error) {
    throw error;
  }
}

describe('scripts/validate-config.js', () => {
  let tempDir;
  let validConfigPath;
  let invalidConfigPath;
  const scriptPath = path.resolve(__dirname, '..', '..', '..', 'scripts', 'validate-config.js');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-config-test-'));

    const validConfig = {
      systems: {
        "test-system": { name: "Test System", path: "/tmp/system" }
      },
      modules: {
        "test-module": { name: "Test Module", manifest: "https://example.com/module.json" }
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
    fs.writeFileSync(validConfigPath, JSON.stringify(validConfig, null, 2), 'utf8');

    const invalidConfig = {
      systems: {
        "bad-system": { name: "Bad System" } // missing manifest/path
      },
      modules: {},
      versions: {
        "13": {
          // missing install
        }
      }
    };

    invalidConfigPath = path.join(tempDir, 'invalid-config.json');
    fs.writeFileSync(invalidConfigPath, JSON.stringify(invalidConfig, null, 2), 'utf8');
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('validateConfig', () => {
    test('valid configuration passes', () => {
      const result = validateConfig(validConfigPath);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    test('invalid configuration returns errors', () => {
      const result = validateConfig(invalidConfigPath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('/systems/bad-system: must have either "manifest" or "path" property');
      expect(result.errors).toContain('/versions/13: must have required property "install"');
    });

    test('missing file returns not found error', () => {
      const result = validateConfig('/non/existent/config.json');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/Config file not found/);
    });

    test('malformed JSON handled gracefully', () => {
      const malformed = path.join(tempDir, 'malformed.json');
      fs.writeFileSync(malformed, '{ invalid json }', 'utf8');
      const result = validateConfig(malformed);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/Validation error:/);
    });
  });

  describe('calculateFileHash', () => {
    test('different files produce different hashes', () => {
      const h1 = calculateFileHash(validConfigPath);
      const h2 = calculateFileHash(invalidConfigPath);
      expect(h1).not.toBe(h2);
    });

    test('modifying file changes hash', (done) => {
      const before = calculateFileHash(validConfigPath);
      const content = fs.readFileSync(validConfigPath, 'utf8');
      setTimeout(() => {
        fs.writeFileSync(validConfigPath, content, 'utf8');
        const after = calculateFileHash(validConfigPath);
        expect(after).not.toBe(before);
        done();
      }, 10);
    });
  });

  describe('validateConfigWithCache', () => {
    test('caches results and reports cached flag', () => {
      const cacheDir = path.join(tempDir, 'cache');
      const r1 = validateConfigWithCache(validConfigPath, null, cacheDir);
      expect(r1.valid).toBe(true);
      expect(r1.cached).toBe(false);

      const r2 = validateConfigWithCache(validConfigPath, null, cacheDir);
      expect(r2.valid).toBe(true);
      expect(r2.cached).toBe(true);
    });

    test('creates cache directory when missing', () => {
      const cacheDir = path.join(tempDir, 'new-cache');
      expect(fs.existsSync(cacheDir)).toBe(false);
      validateConfigWithCache(validConfigPath, null, cacheDir);
      expect(fs.existsSync(cacheDir)).toBe(true);
    });

    test('handles corrupted cache file gracefully', () => {
      const cacheDir = path.join(tempDir, 'cache-corrupt');
      fs.mkdirSync(cacheDir, { recursive: true });
      const hash = calculateFileHash(validConfigPath);
      const cacheFile = path.join(cacheDir, `fvtt-config-validation-${hash}.json`);
      fs.writeFileSync(cacheFile, 'not json', 'utf8');

      const res = validateConfigWithCache(validConfigPath, null, cacheDir);
      expect(res.valid).toBe(true);
      expect(res.cached).toBe(false);
    });

    test('uses default cache dir when none provided', () => {
      const res = validateConfigWithCache(validConfigPath);
      expect(res.valid).toBe(true);
      expect(res.cached).toBe(false);
    });
  });

  describe('CLI interface', () => {
    test('shows help with --help', () => {
      const output = runNode(`${scriptPath} --help`);
      expect(output).toContain('Usage:');
      expect(output).toContain('config-path');
    });

    test('valid config via CLI returns success', () => {
      const output = runNode(`${scriptPath} ${validConfigPath}`);
      expect(output).toContain('✓ Configuration is valid');
    });

    test('invalid config via CLI exits with error', () => {
      expect(() => {
        runNode(`${scriptPath} ${invalidConfigPath}`);
      }).toThrow();
    });

    test('cache indicator shown when cached', () => {
      const cacheDir = path.join(tempDir, 'cli-cache');
      // First run to populate cache
      runNode(`${scriptPath} ${validConfigPath} ${cacheDir}`);
      const out = runNode(`${scriptPath} ${validConfigPath} ${cacheDir}`);
      expect(out).toContain('(result from cache)');
    });

    test('bypasses cache with --no-cache flag', () => {
      const cacheDir = path.join(tempDir, 'cli-nocache');
      runNode(`${scriptPath} ${validConfigPath} ${cacheDir}`);
      const out = runNode(`${scriptPath} ${validConfigPath} ${cacheDir} --no-cache`);
      expect(out).toContain('✓ Configuration is valid');
      expect(out).not.toContain('(result from cache)');
    });

    test('exits with error when config-path not provided', () => {
      expect(() => {
        runNode(`${scriptPath} --no-cache`);
      }).toThrow();
    });

    test('handles multiple non-flag arguments (config + cache + flags)', () => {
      const cacheDir = path.join(tempDir, 'multi-args');
      const out = runNode(`${scriptPath} ${validConfigPath} ${cacheDir} --no-cache`);
      expect(out).toContain('✓ Configuration is valid');
    });
  });
});