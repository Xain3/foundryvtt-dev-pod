/**
 * @file stripNullTerminated.js
 * @description Utility to strip null-terminated strings and trim whitespace
 * @path patches/common/helpers/stripNullTerminated.js
 */

const NULL_CHARACTER_DELIMITER = '\u0000'

/**
 * Removes the null-terminated portion from a string, if present.
 * Trims any leading or trailing whitespace from the resulting string.
 *
 * @param {string} s - The input string to process.
 * @returns {string} The string up to (but not including) the first null character, trimmed of whitespace.
 */
export function stripNullTerminated(s) {
  const i = s.indexOf(NULL_CHARACTER_DELIMITER);
  return (i === -1 ? s : s.slice(0, i)).trim();
}