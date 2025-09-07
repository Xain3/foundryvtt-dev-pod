/**
 * @file manifest.unit.test.js
 * @description Tests for manifest module export behavior.
 * @path config/manifest.unit.test.js
 */

import { jest, describe, beforeEach, it, expect } from '@jest/globals';

// Helper to mock package.json fresh for each test
const mockPkg = () => jest.unstable_mockModule('../package.json', () => ({ __esModule: true, default: { name: 'pkg', version: '1.2.3' } }));

// Success path mock for ManifestParser
const getSuccessParser = () => ({
  default: class MockManifestParser {
    constructor(m) { this.m = m; }
    getValidatedManifest() { return Object.freeze({ ...this.m, validated: true }); }
  }
});

describe('manifest.js module', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('exports validated frozen manifest on success', async () => {
    mockPkg();
    jest.unstable_mockModule('./helpers/manifestParser.js', () => getSuccessParser());
    const mod = await import('./manifest.js');
    expect(mod.default.validated).toBe(true);
    expect(Object.isFrozen(mod.default)).toBe(true);
  });

  it('propagates errors from ManifestParser', async () => {
    mockPkg();
    jest.unstable_mockModule('./helpers/manifestParser.js', () => ({
      __esModule: true,
      default: class BadParser { constructor() {} getValidatedManifest() { throw new Error('boom'); } }
    }));
    await expect(import('./manifest.js')).rejects.toThrow('boom');
  });
});
