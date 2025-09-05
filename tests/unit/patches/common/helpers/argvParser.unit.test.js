import { parsePatchArgs } from '../../../../../patches/common/helpers/argvParser.mjs';

describe('parsePatchArgs', () => {
  const originalArgv = process.argv;
  afterEach(() => { process.argv = originalArgv; });

  it('returns defaults when no args present', () => {
    process.argv = [originalArgv[0], originalArgv[1]];
    const result = parsePatchArgs('42', 'foo');
    expect(result.procNum).toBe('42');
    expect(result.patchName).toBe('foo');
    expect(result.args).toEqual([]);
  });

  it('parses --procedural-number and --patch-name', () => {
    process.argv = [originalArgv[0], originalArgv[1], '--procedural-number', '99', '--patch-name', 'bar'];
    const result = parsePatchArgs('42', 'foo');
    expect(result.procNum).toBe('99');
    expect(result.patchName).toBe('bar');
    expect(result.args).toEqual(['--procedural-number', '99', '--patch-name', 'bar']);
  });

  it('falls back to default if only one arg is present', () => {
    process.argv = [originalArgv[0], originalArgv[1], '--patch-name', 'baz'];
    const result = parsePatchArgs('42', 'foo');
    expect(result.procNum).toBe('42');
    expect(result.patchName).toBe('baz');
    expect(result.args).toEqual(['--patch-name', 'baz']);
  });

  it('ignores unrelated args', () => {
    process.argv = [originalArgv[0], originalArgv[1], '--other', 'x', '--procedural-number', '7'];
    const result = parsePatchArgs('1', 'a');
    expect(result.procNum).toBe('7');
    expect(result.patchName).toBe('a');
    expect(result.args).toEqual(['--other', 'x', '--procedural-number', '7']);
  });

  it('handles missing value after flag', () => {
    process.argv = [originalArgv[0], originalArgv[1], '--procedural-number'];
    const result = parsePatchArgs('1', 'a');
    expect(result.procNum).toBe('1');
    expect(result.patchName).toBe('a');
    expect(result.args).toEqual(['--procedural-number']);
  });
});
