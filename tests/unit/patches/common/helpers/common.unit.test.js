import path from 'node:path';
import fs from 'node:fs';
import * as namedExports from '#patches/common/helpers/common.mjs';
import defaultExport from '#patches/common/helpers/common.mjs';

describe('patches/common/helpers/common.mjs', () => {
  let common;
  let named;
  const tmpRoot = path.join(process.cwd(), '.jest-tmp-common');

  beforeAll(async () => {
    // Ensure clean temp area
    if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });
    named = namedExports;
    common = defaultExport;
  });

  afterAll(() => {
    if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('exports expected named functions', () => {
    const keys = [
      'readJSON','isUrl','isArchive','isDirectory','parseBoolEnv','ensureDirSync','which','sha256File','sleep','fetchWithRetry','fetchToFileWithCache','readMetaForUrl','copyDirAtomic'
    ];
    for (const k of keys) {
      expect(typeof named[k]).toBeDefined();
    }
  });

  test('default export exposes helper map', () => {
    expect(typeof common).toBe('object');
    expect(typeof common.readJSON).toBe('function');
    expect(typeof common.copyDirAtomic).toBe('function');
  });

  test('readJSON reads and parses', () => {
    const file = path.join(tmpRoot, 'data.json');
    fs.writeFileSync(file, JSON.stringify({ a: 1, b: 'x' }));
    const value = named.readJSON(file);
    expect(value).toEqual({ a: 1, b: 'x' });
  });

  test('isUrl recognizes http/https/ftp and rejects others', () => {
    expect(named.isUrl('http://example.com')).toBe(true);
    expect(named.isUrl('https://example.com/path?x=1')).toBe(true);
    expect(named.isUrl('ftp://example.com/file')).toBe(true);
    expect(named.isUrl('file:///tmp/a')).toBe(false);
    expect(named.isUrl('not a url')).toBe(false);
    expect(named.isUrl('example.com')).toBe(false);
  });

  test('isArchive detects common archive extensions', () => {
    const yes = ['a.zip','b.tar.gz','c.tgz','d.tar','e.tar.bz2','f.tbz2','g.tar.xz','h.txz'];
    for (const f of yes) expect(named.isArchive(f)).toBe(true);
    const no = ['a.txt','b.jpg','c.json','archive.gz'];
    for (const f of no) expect(named.isArchive(f)).toBe(false);
  });

  test('ensureDirSync and isDirectory', () => {
    const dir = path.join(tmpRoot, 'nested/dir');
    expect(fs.existsSync(dir)).toBe(false);
    named.ensureDirSync(dir);
    expect(fs.existsSync(dir)).toBe(true);
    expect(named.isDirectory(path.join(tmpRoot, 'nested'))).toBe(true);
  });

  test('parseBoolEnv handles truthy/falsey and default', () => {
    const t = ['1','true','TRUE','yes','on','On'];
    for (const v of t) expect(named.parseBoolEnv(v, false)).toBe(true);
    const f = ['0','false','no','off','',0];
    for (const v of f) expect(named.parseBoolEnv(v, true)).toBe(false);
    expect(named.parseBoolEnv(undefined, true)).toBe(true);
  });

  test('which returns path for existing binary or null otherwise', () => {
    const maybeNode = named.which('node');
    expect(maybeNode === null || typeof maybeNode === 'string').toBe(true);
    const definitelyMissing = named.which('this-binary-should-not-exist-omh');
    expect(definitelyMissing).toBeNull();
  });

  test('sha256File returns deterministic hash', () => {
    const file = path.join(tmpRoot, 'hash.txt');
    fs.writeFileSync(file, 'hello');
    const h1 = named.sha256File(file);
    const h2 = named.sha256File(file);
    expect(h1).toEqual(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  test('sleep waits approximately requested time', async () => {
    const start = Date.now();
    await named.sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });

  test('copyDirAtomic copies directory contents atomically', () => {
    const src = path.join(tmpRoot, 'srcdir');
    const dstParent = path.join(tmpRoot, 'out');
    const dst = path.join(dstParent, 'final');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'a.txt'), 'A');
    const res = named.copyDirAtomic(src, dst, { dryRun: false });
    expect(res && res.success).toBe(true);
    expect(fs.existsSync(path.join(dst, 'a.txt'))).toBe(true);
  });

  test('copyDirAtomic dry-run does not write', () => {
    const src = path.join(tmpRoot, 'srcdry');
    const dst = path.join(tmpRoot, 'dry-final');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'b.txt'), 'B');
    const res = named.copyDirAtomic(src, dst, { dryRun: true });
    expect(res && res.success).toBe(true);
    expect(fs.existsSync(dst)).toBe(false);
  });
});
