/**
 * @file pathUtils.js
 * @description Utility helpers for resolving filesystem-like paths relative to runtime context.
 * @path helpers/pathUtils.js
 */

import path from 'node:path';

/**
 * A small collection of path utility helpers.
 * @export
 */
const PathUtils = {
  /**
   * Resolve a path value relative to a provided global namespace (if it exposes a base path) otherwise process cwd.
   * Accepts absolute paths and returns as-is.
   * @param {object} globalNamespace - A global namespace or object that may expose `__basedir` or similar.
   * @param {string} value - The path value to resolve. If not a string it is returned unchanged.
   * @returns {string} Resolved absolute path or original value if non-string.
   */
  resolvePath(globalNamespace, value) {
    if (typeof value !== 'string') return value;
    if (value.startsWith('/') || value.match(/^[A-Za-z]:\\/)) {
      return value;
    }
    const base = (globalNamespace && (globalNamespace.__basedir || globalNamespace.basePath)) || process.cwd();
    return path.resolve(base, value);
  }
};

export default PathUtils;
