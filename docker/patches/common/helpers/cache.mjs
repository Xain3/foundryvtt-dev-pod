/**
 * Cache and change-detection utilities for patch scripts.
 * Provides HTTP revalidation (ETag/Last-Modified), cache busting, and
 * local file/directory change detection using size/mtime and optional checksums.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

export async function fetchWithRetry(url, opts = {}, { retries = 3, baseDelayMs = 500, debug = false, maxRedirects = 5, timeoutMs = 15000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let currentUrl = url;
      let redirects = 0;
      while (redirects <= maxRedirects) {
        const lib = currentUrl.startsWith("https:") ? https : http;
        const res = await new Promise((resolve, reject) => {
          const req = lib.request(currentUrl, opts, (resp) => {
            try {
              // Guard against slow/stalled responses
              resp.setTimeout(timeoutMs, () => {
                resp.destroy(new Error(`response timeout after ${timeoutMs}ms for ${currentUrl}`));
              });
            } catch {}
            resolve(resp);
          });
          try {
            // Guard against slow connects
            req.setTimeout(timeoutMs, () => {
              req.destroy(new Error(`request timeout after ${timeoutMs}ms for ${currentUrl}`));
            });
          } catch {}
          req.on("error", reject);
          if (opts.body) req.write(opts.body);
          req.end();
        });
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const loc = res.headers && (res.headers.location || res.headers.Location);
          if (!loc) return res;
          const nextUrl = new URL(loc, currentUrl).toString();
          if (debug) console.log(`[patch][debug] redirect ${status} → ${nextUrl}`);
          currentUrl = nextUrl;
          redirects++;
          continue;
        }
        return res;
      }
      throw new Error(`Too many redirects for ${url}`);
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
        if (debug) console.log(`[patch][debug] fetch retry ${attempt + 1}/${retries} in ${delay}ms for ${url}: ${e.message}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

function keyHash(key) {
  return crypto.createHash("sha1").update(key).digest("hex");
}

export function readMetaForUrl(cacheDir, url) {
  const metaPath = path.join(cacheDir, `${keyHash(url)}.meta.json`);
  if (fs.existsSync(metaPath)) {
    try { return JSON.parse(fs.readFileSync(metaPath, "utf8")); } catch { return null; }
  }
  return null;
}

function readMetaForKey(cacheDir, key) {
  const metaPath = path.join(cacheDir, `${keyHash(key)}.meta.json`);
  if (fs.existsSync(metaPath)) {
    try { return JSON.parse(fs.readFileSync(metaPath, "utf8")); } catch { return null; }
  }
  return null;
}

function writeMetaForKey(cacheDir, key, meta) {
  ensureDirSync(cacheDir);
  const metaPath = path.join(cacheDir, `${keyHash(key)}.meta.json`);
  const tmp = `${metaPath}.part`;
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2));
  fs.renameSync(tmp, metaPath);
}

export async function fetchToFileWithCache(url, cacheDir, { dryRun = false, debug = false, cacheMode = 'revalidate' } = {}, etagMeta) {
  ensureDirSync(cacheDir);
  const base = keyHash(url);
  const filePath = path.join(cacheDir, `${base}.bin`);
  const headers = {};
  if (cacheMode !== 'bust') {
    if (etagMeta?.etag) headers["If-None-Match"] = etagMeta.etag;
    if (etagMeta?.lastModified) headers["If-Modified-Since"] = etagMeta.lastModified;
  } else if (debug) {
    console.log(`[patch][debug] cacheMode=bust: ignoring validators for ${url}`);
  }

  if (dryRun && fs.existsSync(filePath)) {
    if (debug) console.log(`[patch][debug] dry-run: would check ETag/Last-Modified for ${url}, using cached file`);
    return { success: true, path: filePath, fromCache: true, status: 200, etag: etagMeta?.etag, lastModified: etagMeta?.lastModified };
  }

  const resp = await fetchWithRetry(url, { method: "GET", headers }, { retries: 3, baseDelayMs: 800, debug, timeoutMs: 20000 });
  if (resp.statusCode === 304) {
    if (debug) console.log(`[patch][debug] 304 Not Modified for ${url}; using cache ${filePath}`);
    return { success: true, path: filePath, fromCache: true, status: 304, etag: etagMeta?.etag, lastModified: etagMeta?.lastModified };
  }
  if (resp.statusCode && resp.statusCode >= 400) {
    return { success: false, error: `HTTP ${resp.statusCode} for ${url}` };
  }
  if (dryRun) {
    if (debug) console.log(`[patch][debug] dry-run: would download ${url} to ${filePath}`);
    return { success: true, path: filePath, fromCache: false, status: 200 };
  }

  const tmpPath = `${filePath}.part`;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmpPath);
    let finished = false;
    const dlTimeout = setTimeout(() => {
      if (!finished) {
        try { out.destroy(new Error(`download timeout for ${url}`)); } catch {}
        try { resp.destroy(new Error(`download timeout for ${url}`)); } catch {}
      }
    }, 30000);
    resp.on("error", reject);
    out.on("finish", () => { finished = true; clearTimeout(dlTimeout); resolve(); });
    out.on("error", (e) => { finished = true; clearTimeout(dlTimeout); reject(e); });
    resp.pipe(out);
  });
  fs.renameSync(tmpPath, filePath);

  const etag = resp.headers?.etag;
  const lastModified = resp.headers?.["last-modified"];
  const meta = { url, etag, lastModified, sha256: sha256File(filePath), size: fs.statSync(filePath).size };
  writeMetaForKey(cacheDir, url, meta);

  return { success: true, path: filePath, fromCache: false, status: 200, etag, lastModified };
}

export class CacheManager {
  constructor(cacheDir, {
    dryRun = false,
    debug = false,
    cacheMode = 'revalidate',
    checksumMode = 'auto',
    checksumThresholdBytes = 209715200,
    dirMaxFiles = 10000
  } = {}) {
    this.cacheDir = cacheDir;
    this.dryRun = dryRun;
    this.debug = debug;
    this.cacheMode = cacheMode;
    this.checksumMode = checksumMode;
    this.checksumThresholdBytes = checksumThresholdBytes;
    this.dirMaxFiles = dirMaxFiles;
    ensureDirSync(cacheDir);
  }

  readMetaForKey(key) { return readMetaForKey(this.cacheDir, key); }
  writeMetaForKey(key, meta) { return writeMetaForKey(this.cacheDir, key, meta); }
  readMetaForUrl(url) { return readMetaForKey(this.cacheDir, url); }

  async fetchToFileWithCache(url) {
    const meta = this.readMetaForUrl(url);
    return fetchToFileWithCache(url, this.cacheDir, { dryRun: this.dryRun, debug: this.debug, cacheMode: this.cacheMode }, meta);
  }

  hasher() { return crypto.createHash('sha256'); }

  async hasLocalFileChanged(filePath) {
    if (!fs.existsSync(filePath)) return { changed: true, reason: 'missing' };
    const stat = fs.statSync(filePath);
    const key = `file://${filePath}`;
    const meta = this.readMetaForKey(key);
    const basicChanged = !meta || meta.size !== stat.size || meta.mtimeMs !== stat.mtimeMs;
    const shouldChecksum = this.checksumMode === 'force' || (this.checksumMode === 'auto' && stat.size <= this.checksumThresholdBytes && basicChanged);

    if (!basicChanged && this.checksumMode !== 'force') return { changed: false, meta };
    if (!shouldChecksum) {
      const newMeta = { size: stat.size, mtimeMs: stat.mtimeMs };
      this.writeMetaForKey(key, newMeta);
      return { changed: basicChanged, meta: newMeta };
    }

    const sha = sha256File(filePath);
    const changed = !meta || meta.sha256 !== sha;
    const newMeta = { size: stat.size, mtimeMs: stat.mtimeMs, sha256: sha };
    this.writeMetaForKey(key, newMeta);
    return { changed, meta: newMeta };
  }

  _listFiles(dir, base, acc, maxFiles) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(base, full);
      if (e.isDirectory()) {
        this._listFiles(full, base, acc, maxFiles);
      } else if (e.isFile()) {
        const st = fs.statSync(full);
        acc.push({ rel, size: st.size, mtimeMs: st.mtimeMs });
        if (acc.length > maxFiles) return;
      }
      if (acc.length > maxFiles) return;
    }
  }

  async hasLocalDirectoryChanged(dirPath) {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return { changed: true, reason: 'missing' };
    const key = `dir://${dirPath}`;
    const meta = this.readMetaForKey(key) || {};
    const files = [];
    this._listFiles(dirPath, dirPath, files, this.dirMaxFiles);
    if (files.length > this.dirMaxFiles) {
      return { changed: true, reason: 'too-many-files' };
    }
    files.sort((a, b) => a.rel.localeCompare(b.rel));
    const h = this.hasher();
    for (const f of files) h.update(`${f.rel}|${f.size}|${f.mtimeMs}\n`);
    const signature = h.digest('hex');
    const changed = meta.dirSignature !== signature || meta.fileCount !== files.length;
    const newMeta = { dirSignature: signature, fileCount: files.length };
    this.writeMetaForKey(key, newMeta);
    return { changed, meta: newMeta };
  }
}

export default {
  CacheManager,
  sha256File,
  fetchWithRetry,
  fetchToFileWithCache,
  readMetaForUrl
};
