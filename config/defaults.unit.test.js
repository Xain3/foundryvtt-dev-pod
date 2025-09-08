/**
 * @file defaults.unit.test.js
 * @description Tests for defaults module export behavior.
 * @path config/defaults.unit.test.js
 */

import { jest, describe, it, expect } from '@jest/globals';

// Mock ConstantsBuilder to observe constructor options
jest.unstable_mockModule('./helpers/constantsBuilder.js', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((opts = {}) => ({
    opts,
    asObject: { from: 'builder', file: opts.yamlPath, testDefault: 'testValue' }
  }))
}));

describe('defaults.js module', () => {
  it('builds defaults from defaults.yaml and freezes export', async () => {
    const mod = await import('./defaults.js');
    const defaults = mod.default;
    expect(defaults.file).toContain('defaults.yaml');
    expect(defaults.testDefault).toBe('testValue');
    expect(Object.isFrozen(defaults)).toBe(true);
  });
});
