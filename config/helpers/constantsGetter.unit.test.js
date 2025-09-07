/**
 * @file constantsGetter.unit.test.js
 * @description Unit tests for ConstantsGetter utility.
 * @path config/helpers/constantsGetter.unit.test.js
 */

import { jest, describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';

const DEFAULT_YAML = `
app:
  name: TestApp
  version: 0.0.1
`;

afterEach(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('ConstantsGetter', () => {
  it('returns YAML content when file exists', async () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue(DEFAULT_YAML);
    const mod = await import('./constantsGetter.js');
    const ConstantsGetter = mod.default;
    const result = ConstantsGetter.getConstantsYaml();
    expect(result).toBe(DEFAULT_YAML);
  });

  it('logs a warning when a custom file name is requested but still returns default content', async () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue(DEFAULT_YAML);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('./constantsGetter.js');
    const ConstantsGetter = mod.default;
    const result = ConstantsGetter.getConstantsYaml('custom-constants.yaml');
    expect(result).toBe(DEFAULT_YAML);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('throws and logs an error when YAML file unreadable', async () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue('');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mod = await import('./constantsGetter.js');
    const ConstantsGetter = mod.default;
    expect(() => ConstantsGetter.getConstantsYaml()).toThrow('Constants YAML content is not available');
    expect(errorSpy).toHaveBeenCalled();
  });
});