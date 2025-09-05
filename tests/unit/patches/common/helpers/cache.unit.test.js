import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

// Load the module using require after babel-jest transforms .mjs to CJS
// eslint-disable-next-line import/no-commonjs
const mod = require('../../../../../patches/common/helpers/cache.mjs');
const {
  sha256File,
  fetchWithRetry,
  fetchToFileWithCache,
  readMetaForUrl,
  CacheManager
} = mod;

describe('patches/common/helpers/cache.mjs', () => {
  const tmpRoot = path.join(process.cwd(), '.jest-tmp-cache');
  const cacheDir = path.join(tmpRoot, 'cache');
  let server;
  let port;

  beforeAll((done) => {
    if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(cacheDir, { recursive: true });

  server = http.createServer((req, res) => {
      // Simple routes:
      // - /ok -> 200 with body and ETag/Last-Modified
      // - /not-modified -> 304
      // - /redirect -> 302 to /ok
      // - /error -> 500
      // - /bytes/:n -> 200 n-bytes body
      const url = req.url || '/';
      if (url === '/ok') {
        const etag = 'W/"abc123"';
        const lastMod = new Date('2024-01-01T00:00:00Z').toUTCString();
        const inm = (req.headers['if-none-match'] || '').toString();
        const ims = (req.headers['if-modified-since'] || '').toString();
        if (inm === etag || ims === lastMod) {
          res.statusCode = 304;
          return res.end();
        }
        res.statusCode = 200;
        res.setHeader('ETag', etag);
        res.setHeader('Last-Modified', lastMod);
        res.end('hello-world');
      } else if (url === '/not-modified') {
        res.statusCode = 304;
        res.end();
      } else if (url === '/redirect') {
        res.statusCode = 302;
        res.setHeader('Location', '/ok');
        res.end();
      } else if (url === '/error') {
        res.statusCode = 500;
        res.end('error');
      } else if (url.startsWith('/bytes/')) {
        const n = Number(url.split('/').pop());
        res.statusCode = 200;
        res.end('x'.repeat(Number.isFinite(n) ? n : 0));
      } else {
        res.statusCode = 404;
        res.end('not found');
      }
    });
    server.listen(0, () => {
      // @ts-ignore
      port = server.address().port;
      done();
    });
  });

  afterAll(() => {
    if (server) server.close();
    if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  const urlFor = (p) => `http://127.0.0.1:${port}${p}`;

  test('sha256File hashes deterministically', () => {
    const file = path.join(tmpRoot, 'hash.txt');
    fs.writeFileSync(file, 'hello');
    const h1 = sha256File(file);
    const h2 = sha256File(file);
    expect(h1).toEqual(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  test('fetchWithRetry follows redirects and returns response', async () => {
    const res = await fetchWithRetry(urlFor('/redirect'), {}, { retries: 1, baseDelayMs: 10, debug: false });
    expect(res.statusCode).toBe(200);
  });

  test('fetchToFileWithCache downloads and writes meta (200)', async () => {
    const u = urlFor('/ok');
    const r = await fetchToFileWithCache(u, cacheDir, { debug: false });
    expect(r.success).toBe(true);
    expect(r.fromCache).toBe(false);
    expect(r.status).toBe(200);
    const meta = readMetaForUrl(cacheDir, u);
    expect(meta).toBeTruthy();
    expect(meta.url).toBe(u);
    expect(meta.etag).toBe('W/"abc123"');
    expect(meta.lastModified).toBe(new Date('2024-01-01T00:00:00Z').toUTCString());
    expect(fs.existsSync(r.path)).toBe(true);
  });

  test('fetchToFileWithCache uses 304 with validators', async () => {
    const u = urlFor('/ok');
    const first = await fetchToFileWithCache(u, cacheDir, { debug: false });
    const r = await fetchToFileWithCache(u, cacheDir, { debug: false }, { etag: 'W/"abc123"', lastModified: new Date('2024-01-01T00:00:00Z').toUTCString() });
    expect(first.success).toBe(true);
    expect(r.success).toBe(true);
    expect(r.fromCache).toBe(true);
    expect(r.status).toBe(304);
  });

  test('fetchToFileWithCache honors cache bust', async () => {
    const u = urlFor('/ok');
    const r = await fetchToFileWithCache(u, cacheDir, { debug: false, cacheMode: 'bust' });
    expect(r.success).toBe(true);
    expect(r.fromCache).toBe(false);
    expect(r.status).toBe(200);
  });

  test('CacheManager.hasLocalFileChanged detects changes', async () => {
    const cm = new CacheManager(path.join(tmpRoot, 'cmcache'), { checksumMode: 'force' });
    const f = path.join(tmpRoot, 'cm.txt');
    fs.writeFileSync(f, 'a');
    // First run: no meta yet => changed
    const r1 = await cm.hasLocalFileChanged(f);
    expect(r1.changed).toBe(true);
    // Second run: unchanged
    const r2 = await cm.hasLocalFileChanged(f);
    expect(r2.changed).toBe(false);
    // Modify file
    fs.writeFileSync(f, 'b');
    const r3 = await cm.hasLocalFileChanged(f);
    expect(r3.changed).toBe(true);
  });

  test('CacheManager.hasLocalDirectoryChanged detects changes', async () => {
    const cm = new CacheManager(path.join(tmpRoot, 'cmcache2'));
    const d = path.join(tmpRoot, 'dir');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'a.txt'), '1');
    const r1 = await cm.hasLocalDirectoryChanged(d);
    expect(r1.changed).toBe(true);
    const r2 = await cm.hasLocalDirectoryChanged(d);
    expect(r2.changed).toBe(false);
    fs.writeFileSync(path.join(d, 'a.txt'), '22');
    const r3 = await cm.hasLocalDirectoryChanged(d);
    expect(r3.changed).toBe(true);
  });

  test('fetchWithRetry surfaces HTTP error after retries', async () => {
    await expect(fetchWithRetry(urlFor('/error'), {}, { retries: 0, baseDelayMs: 5 })).resolves.toHaveProperty('statusCode', 500);
  });
});
