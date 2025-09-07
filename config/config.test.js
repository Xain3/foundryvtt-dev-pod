import { jest, describe, it, expect } from '@jest/globals';

/**
 * @file config.test.js
 * @description Tests for Config module export behavior.
 * @path config/config.test.js
 */


const mockConstants = Object.freeze({
  errors: { pattern: 'err', separator: '|' },
  context: { sync: { defaults: {} } }
});
const mockManifest = Object.freeze({
  id: 'test.module',
  title: 'Test Module',
  version: '1.2.3'
});
const mockDefaults = Object.freeze({
  featureEnabled: true,
  timeout: 30
});

jest.unstable_mockModule('./constants.js', () => ({
  __esModule: true,
  default: mockConstants
}));

jest.unstable_mockModule('./manifest.js', () => ({
  __esModule: true,
  default: mockManifest
}));

jest.unstable_mockModule('./defaults.js', () => ({
  __esModule: true,
  default: mockDefaults
}));

describe('config.js module', () => {
  it('exports a singleton config instance with expected properties', async () => {
    const mod = await import('./config.js');
    const config = mod.default;
    expect(config).toBeDefined();
    expect(config.constants).toBe(mockConstants);
    expect(config.manifest).toBe(mockManifest);
    expect(config.defaults).toBe(mockDefaults);
  });

  it('exposes frozen configuration objects (mocks are frozen)', async () => {
    const { default: config } = await import('./config.js');
    expect(Object.isFrozen(config.constants)).toBe(true);
    expect(Object.isFrozen(config.manifest)).toBe(true);
    expect(Object.isFrozen(config.defaults)).toBe(true);
  });

  it('returns the same instance across repeated imports (module cache)', async () => {
    const first = (await import('./config.js')).default;
    const second = (await import('./config.js')).default;
    expect(second).toBe(first);
  });
});