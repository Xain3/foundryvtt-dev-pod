/* eslint-disable no-unused-vars */
/**
 * @file constantsBuilder.unit.test.js
 * @description Tests for flexible ConstantsBuilder options and behaviors.
 * @path config/helpers/constantsBuilder.unit.test.js
 */

import { jest, beforeAll, beforeEach, describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Mock dependencies that may load large graphs
jest.unstable_mockModule('./constantsGetter.js', () => ({
  __esModule: true,
  default: { getConstantsYaml: jest.fn(() => 'foo: bar\nnumber: 2') }
}));

jest.unstable_mockModule('./constantsParser.js', () => ({
  __esModule: true,
  default: { parseConstants: jest.fn((yamlStr) => ({ __parsed: true, _raw: yamlStr })) }
}));

let ConstantsBuilder;
let ConstantsGetterMock;
let ConstantsParserMock;

beforeAll(async () => {
  const getterMod = await import('./constantsGetter.js');
  const parserMod = await import('./constantsParser.js');
  ConstantsGetterMock = getterMod.default;
  ConstantsParserMock = parserMod.default;
  const builderMod = await import('./constantsBuilder.js');
  ConstantsBuilder = builderMod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ConstantsBuilder flexible options', () => {
  it('uses default getter + parser when no options provided', () => {
    const builder = new ConstantsBuilder();
    expect(typeof builder.asString).toBe('string');
  });

  it('accepts explicit yamlString overriding getter and path', () => {
    const builder = new ConstantsBuilder({ yamlString: 'a: 1\nb: two' });
    expect(builder.asString).toBe('a: 1\nb: two');
  });

  it('invokes custom getter when provided (no yamlString)', () => {
    const customGetter = jest.fn(() => 'x: custom');
    const builder = new ConstantsBuilder({ getter: customGetter });
    expect(customGetter).toHaveBeenCalledTimes(1);
    expect(builder.asString).toBe('x: custom');
  });

  it('reads YAML from yamlPath when provided', () => {
    const tempFile = path.join(process.cwd(), 'tmp-test-constants.yaml');
    fs.writeFileSync(tempFile, 'fileValue: 42');
    try {
      const builder = new ConstantsBuilder({ yamlPath: tempFile });
      expect(builder.asString).toContain('fileValue: 42');
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  it('throws for missing yamlPath file', () => {
    expect(() => new ConstantsBuilder({ yamlPath: 'does-not-exist.yaml' })).toThrow(/YAML path not found/);
  });

  it('respects custom parser function', () => {
    const spyParser = jest.fn(() => ({ parsed: true }));
    const builder = new ConstantsBuilder({ yamlString: 'k: v', parser: spyParser, parseContextRootMap: false });
    expect(spyParser).toHaveBeenCalledWith('k: v', globalThis, false, null);
    expect(builder.asObject).toEqual({ parsed: true });
  });

  it('exposes frozen copy of options', () => {
    const builder = new ConstantsBuilder({ yamlString: 'q: r', parseContextRootMap: false });
    const opts = builder.options;
    expect(opts.yamlString).toBe('q: r');
    expect(Object.isFrozen(opts)).toBe(true);
    expect(() => { opts.yamlString = 'mutate'; }).toThrow();
    expect(builder.options.yamlString).toBe('q: r');
  });
});
