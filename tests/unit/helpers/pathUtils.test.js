import PathUtils from '#helpers/pathUtils.js';
import path from 'node:path';

/**
 * @file pathUtils.test.js
 * @description Unit tests for PathUtils helpers
 * @path helpers/pathUtils.test.js
 */


describe('PathUtils', () => {
  describe('resolvePath', () => {
    test('returns non-string values unchanged', () => {
      expect(PathUtils.resolvePath({}, null)).toBeNull();
      expect(PathUtils.resolvePath({}, 42)).toBe(42);
      expect(PathUtils.resolvePath({}, {})).toEqual({});
    });

    test('returns absolute unix paths as-is', () => {
      expect(PathUtils.resolvePath({}, '/tmp/test')).toBe('/tmp/test');
    });

    test('returns absolute windows paths as-is', () => {
      expect(PathUtils.resolvePath({}, 'C:\\Users\\Test')).toBe('C:\\Users\\Test');
    });

    test('resolves relative path using globalNamespace.__basedir', () => {
      const ns = { __basedir: '/base/dir' };
      expect(PathUtils.resolvePath(ns, 'foo/bar')).toBe(path.resolve('/base/dir', 'foo/bar'));
    });

    test('resolves relative path using globalNamespace.basePath', () => {
      const ns = { basePath: '/another/base' };
      expect(PathUtils.resolvePath(ns, 'baz')).toBe(path.resolve('/another/base', 'baz'));
    });

    test('resolves relative path using process.cwd() if no base provided', () => {
      const rel = 'some/rel/path';
      expect(PathUtils.resolvePath({}, rel)).toBe(path.resolve(process.cwd(), rel));
    });
  });
});