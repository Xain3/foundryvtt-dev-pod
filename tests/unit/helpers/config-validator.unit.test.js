import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigValidator, validateConfigWithCache, calculateFileHash } from '../../../helpers/config-validator.js';

describe('scripts/config-validator.js', () => {
  let tempDir;
  let validConfigPath;
  let invalidConfigPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-validator-test-'));
    const validConfig = {
      systems: { "sys": { name: "System", path: "/x" } },
      modules: { "mod": { name: "Module", manifest: "https://example.com/mod.json" } },
      versions: { "13": { install: { systems: { sys: {} }, modules: { mod: {} } } } }
    };
    validConfigPath = path.join(tempDir, 'valid.json');
    fs.writeFileSync(validConfigPath, JSON.stringify(validConfig, null, 2));

    const invalidConfig = { systems: { sys: { name: "System" } }, modules: {}, versions: { "13": {} } };
    invalidConfigPath = path.join(tempDir, 'invalid.json');
    fs.writeFileSync(invalidConfigPath, JSON.stringify(invalidConfig, null, 2));
  });

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('ConfigValidator.validate', () => {
    test('returns valid true for valid config', () => {
      const validator = new ConfigValidator();
      const result = validator.validate(validConfigPath);
      expect(result.valid).toBe(true);
    });

    test('returns expected errors for invalid config', () => {
      const validator = new ConfigValidator();
      const result = validator.validate(invalidConfigPath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('/systems/sys: must have either "manifest" or "path" property');
      expect(result.errors).toContain('/versions/13: must have required property "install"');
    });

    test('handles missing file', () => {
      const validator = new ConfigValidator();
      const result = validator.validate(path.join(tempDir, 'missing.json'));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Config file not found');
    });

    test('handles malformed JSON', () => {
      const malformedPath = path.join(tempDir, 'malformed.json');
      fs.writeFileSync(malformedPath, '{ invalid');
      const validator = new ConfigValidator();
      const result = validator.validate(malformedPath);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Validation error:');
    });
  });

  describe('validateConfigWithCache wrapper', () => {
    test('caches results', () => {
      const cacheDir = path.join(tempDir, 'cache');
      const first = validateConfigWithCache(validConfigPath, null, cacheDir);
      const second = validateConfigWithCache(validConfigPath, null, cacheDir);
      expect(first.cached).toBe(false);
      expect(second.cached).toBe(true);
    });
  });

  describe('calculateFileHash', () => {
    test('different mtimes produce different hash', (done) => {
      const hash1 = calculateFileHash(validConfigPath);
      const content = fs.readFileSync(validConfigPath, 'utf8');
      setTimeout(() => {
        fs.writeFileSync(validConfigPath, content);
        const hash2 = calculateFileHash(validConfigPath);
        expect(hash1).not.toBe(hash2);
        done();
      }, 10);
    });
  });
});
