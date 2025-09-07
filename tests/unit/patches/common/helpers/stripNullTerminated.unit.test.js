import { stripNullTerminated } from '../../../../../patches/common/helpers/stripNullTerminated.js';

describe('stripNullTerminated', () => {

  test('returns string unchanged when no NUL', () => {
    expect(stripNullTerminated('hello')).toBe('hello');
  });

  test('removes content after NUL and trims', () => {
    expect(stripNullTerminated('abc\u0000def')).toBe('abc');
    expect(stripNullTerminated('  padded  \u0000more')).toBe('padded');
  });

  test('returns empty for leading NUL', () => {
    expect(stripNullTerminated('\u0000starts')).toBe('');
  });

  test('handles empty string', () => {
    expect(stripNullTerminated('')).toBe('');
  });
});
