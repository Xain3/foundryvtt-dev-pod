/**
 * @file constantsParser.unit.test.js
 * @description Unit tests for ConstantsParser utility matching current repo layout.
 * @path config/helpers/constantsParser.unit.test.js
 */

import { jest, describe, test, expect, afterEach } from '@jest/globals';
import ConstantsParser from './constantsParser.js';
import PathUtils from '../../helpers/pathUtils.js';

afterEach(() => {
  if (PathUtils.resolvePath && PathUtils.resolvePath.mockRestore) {
    try { PathUtils.resolvePath.mockRestore(); } catch {}
  }
});

describe('ConstantsParser', () => {
  test('parseConstants throws TypeError when constants is not a string', () => {
    expect(() => {
      ConstantsParser.parseConstants(123);
    }).toThrow(TypeError);
  });

  test('parseConstants throws TypeError when parseContextRootMap is not a boolean', () => {
    expect(() => {
      ConstantsParser.parseConstants('a: b', undefined, 'not-a-boolean');
    }).toThrow(TypeError);
  });

  test('parseConstants throws Error with message on invalid YAML', () => {
    // invalid YAML (unclosed sequence)
    expect(() => {
      ConstantsParser.parseConstants('foo: [bar');
    }).toThrow('Failed to parse constants');
  });

  test('createRootMapFromYaml returns a factory that resolves paths, module and null values', () => {
    const config = {
      rootMap: {
        one: '/some/path',
        two: 'module',
        three: null
      }
    };

    // Spy/mocking PathUtils.resolvePath to assert calls and control output
    const resolveSpy = jest
      .spyOn(PathUtils, 'resolvePath')
      .mockImplementation((globalNs, value) => `resolved:${value}`);

    const factory = ConstantsParser.createRootMapFromYaml(config);
    expect(typeof factory).toBe('function');

    const runtimeGlobal = { foo: 'bar' };
    const runtimeModule = { mod: true };

    const rootMap = factory(runtimeGlobal, runtimeModule);

    expect(rootMap).toEqual({
      one: 'resolved:/some/path',
      two: runtimeModule,
      three: null
    });

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(resolveSpy).toHaveBeenCalledWith(runtimeGlobal, '/some/path');
  });

  test('parseConstants sets context.rootMap to a function when remote.rootMap exists and parseContextRootMap is true', () => {
    const yaml = [
      'context:',
      '  remote:',
      '    rootMap:',
      '      a: /a',
      '      b: module',
      '      c: null'
    ].join('\n');

    const parsed = ConstantsParser.parseConstants(yaml, { G: 'N' }, true, { mod: 1 });
    // According to current implementation, parseConstants assigns a function to context.rootMap
    expect(parsed.context).toBeDefined();
    expect(parsed.context.rootMap).toBeDefined();
    expect(typeof parsed.context.rootMap).toBe('function');
  });

  test('parseConstants does not transform remote.rootMap when parseContextRootMap is false', () => {
    const yaml = [
      'context:',
      '  remote:',
      '    rootMap:',
      '      a: /a',
      '      b: module',
      '      c: null'
    ].join('\n');

    const parsed = ConstantsParser.parseConstants(yaml, { G: 'N' }, false, { mod: 1 });
    // When parseContextRootMap is false, remote.rootMap should remain a plain object on parsed.context.remote
    expect(parsed.context).toBeDefined();
    expect(parsed.context.remote).toBeDefined();
    expect(parsed.context.remote.rootMap).toEqual({
      a: '/a',
      b: 'module',
      c: null
    });
    // And there should be no parsed.context.rootMap created
    expect(parsed.context.rootMap).toBeUndefined();
  });
});