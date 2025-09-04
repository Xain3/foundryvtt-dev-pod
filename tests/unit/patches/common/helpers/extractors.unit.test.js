import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// eslint-disable-next-line import/no-commonjs
const extractors = require('../../../../../docker/patches/common/helpers/extractors.mjs');
const {
  extractTarBuffer,
  extractTar,
  extractTarGz,
  extractArchiveNode
} = extractors;

function padToBlockSize(len, block = 512) {
  const pad = (block - (len % block)) % block;
  return pad;
}

// Build a minimal tar buffer containing directories and files.
function buildTar(entries) {
  const BLOCK = 512;
  const chunks = [];

  function headerFor({ name, size = 0, type = '0', prefix = '' }) {
    const buf = Buffer.alloc(BLOCK, 0);
    // name (100)
    Buffer.from(name).copy(buf, 0, 0, Math.min(name.length, 100));
    // mode (8), uid (8), gid (8) -> leave zeros
    // size (12) - ASCII octal, right-aligned, NUL terminated
    const sizeOct = size.toString(8).padStart(11, '0');
    Buffer.from(sizeOct).copy(buf, 124);
    buf[124 + 11] = 0; // NUL
    // mtime (12) -> zero
    // chksum (8) -> will compute later
    // typeflag (1)
    buf[156] = type.charCodeAt(0);
    // linkname (100) -> empty
    // magic (6) + version (2)
  Buffer.from('ustar\0').copy(buf, 257); // magic
  Buffer.from('00').copy(buf, 263); // version
    // uname (32), gname (32) -> empty
    // devmajor/devminor (8 each) -> zero
    if (prefix) Buffer.from(prefix).copy(buf, 345, 0, Math.min(prefix.length, 155));

  // checksum: set spaces then compute
    for (let i = 0; i < 8; i++) buf[148 + i] = 32; // ' '
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += buf[i];
  const chk = sum.toString(8).padStart(6, '0');
  Buffer.from(chk).copy(buf, 148);
  buf[148 + 6] = 0; // NUL
  buf[148 + 7] = 32; // space

    return buf;
  }

  for (const e of entries) {
    const isDir = e.type === '5';
    const data = isDir ? Buffer.alloc(0) : Buffer.from(e.data || '', 'utf8');
    const header = headerFor({ name: e.name, size: data.length, type: e.type || '0', prefix: e.prefix || '' });
    chunks.push(header);
    if (!isDir) {
      chunks.push(data);
      const pad = padToBlockSize(data.length);
      if (pad) chunks.push(Buffer.alloc(pad, 0));
    }
  }

  // Two zero blocks at end
  chunks.push(Buffer.alloc(BLOCK, 0));
  chunks.push(Buffer.alloc(BLOCK, 0));

  return Buffer.concat(chunks);
}

describe('docker/patches/common/helpers/extractors.mjs', () => {
  const tmpRoot = path.join(process.cwd(), '.jest-tmp-extractors');

  beforeEach(() => {
    if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('extractTarBuffer writes directories and files', async () => {
    const tar = buildTar([
      { name: 'dir', type: '5' },
      { name: 'dir/a.txt', data: 'A', type: '0' },
      { name: 'b.txt', data: 'BB', type: '0' }
    ]);
    const out = path.join(tmpRoot, 'out1');
    await extractTarBuffer(tar, out);
    expect(fs.existsSync(path.join(out, 'dir'))).toBe(true);
    expect(fs.readFileSync(path.join(out, 'dir/a.txt'), 'utf8')).toBe('A');
    expect(fs.readFileSync(path.join(out, 'b.txt'), 'utf8')).toBe('BB');
  });

  test('extractTar extracts tar file', async () => {
    const tar = buildTar([{ name: 'x.txt', data: 'xyz', type: '0' }]);
    const tarPath = path.join(tmpRoot, 'archive.tar');
    fs.writeFileSync(tarPath, tar);
    const out = path.join(tmpRoot, 'out2');
    const r = await extractTar(tarPath, out);
    expect(r.success).toBe(true);
    expect(fs.readFileSync(path.join(out, 'x.txt'), 'utf8')).toBe('xyz');
  });

  test('extractTarGz extracts tar.gz file', async () => {
    const tar = buildTar([{ name: 'y.txt', data: 'hello', type: '0' }]);
    const gzPath = path.join(tmpRoot, 'archive.tgz');
    fs.writeFileSync(gzPath, zlib.gzipSync(tar));
    const out = path.join(tmpRoot, 'out3');
    const r = await extractTarGz(gzPath, out);
    expect(r.success).toBe(true);
    expect(fs.readFileSync(path.join(out, 'y.txt'), 'utf8')).toBe('hello');
  });

  test('extractArchiveNode dispatches by extension and reports unsupported formats', async () => {
    // Prepare tar/tgz files
    const tar = buildTar([{ name: 'z.txt', data: 'zz', type: '0' }]);
    const tarPath = path.join(tmpRoot, 'archive.tar');
    const tgzPath = path.join(tmpRoot, 'archive.tgz');
    fs.writeFileSync(tarPath, tar);
    fs.writeFileSync(tgzPath, zlib.gzipSync(tar));

    const outTar = path.join(tmpRoot, 'out-tar');
    const outTgz = path.join(tmpRoot, 'out-tgz');

    const r1 = await extractArchiveNode(tarPath, outTar, 'archive.tar', { debug: true });
    const r2 = await extractArchiveNode(tgzPath, outTgz, 'archive.tgz', { debug: true });
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(fs.readFileSync(path.join(outTar, 'z.txt'), 'utf8')).toBe('zz');
    expect(fs.readFileSync(path.join(outTgz, 'z.txt'), 'utf8')).toBe('zz');

    // Unsupported formats
    const r3 = await extractArchiveNode(path.join(tmpRoot, 'file.zip'), path.join(tmpRoot, 'out-zip'), 'file.zip');
    const r4 = await extractArchiveNode(path.join(tmpRoot, 'file.txz'), path.join(tmpRoot, 'out-txz'), 'file.txz');
    const r5 = await extractArchiveNode(path.join(tmpRoot, 'file.unknown'), path.join(tmpRoot, 'out-unknown'), 'file.unknown');
    expect(r3.success).toBe(false);
    expect(r4.success).toBe(false);
    expect(r5.success).toBe(false);
  });
});
