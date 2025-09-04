/**
 * Small collection of helper utilities used by container patch scripts.
 * These helpers intentionally use the Node.js built-in `node:` specifiers
 * so they work in restricted or modern runtimes.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { sha256File as cacheSha256File, fetchWithRetry as cacheFetchWithRetry, fetchToFileWithCache as cacheFetchToFileWithCache, readMetaForUrl as cacheReadMetaForUrl } from "./cache.mjs";

/**
 * Read and parse a JSON file synchronously.
 * @param {string} filePath - Path to the JSON file.
 * @param {string} [encoding=utf8]
 * @returns {any} Parsed JSON value.
 */
export function readJSON(filePath, encoding = "utf8") {
  const raw = fs.readFileSync(filePath, encoding);
  return JSON.parse(raw);
}

/**
 * Return true if the provided string looks like an http(s) URL.
 * @param {string} candidate
 * @returns {boolean}
 */
export function isUrl(candidate) {
  return /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i.test(candidate);
}

/**
 * Return true when the filename looks like a supported archive format.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isArchive(filePath) {
  return /\.(zip|tar\.gz|tgz|tar|tar\.bz2|tbz2|tar\.xz|txz)$/i.test(filePath);
}

/**
 * Synchronously test whether a path is a directory. Throws if path does not exist.
 * @param {string} p
 * @returns {boolean}
 */
export function isDirectory(p) {
  return fs.statSync(p).isDirectory();
}

/**
 * Parse a boolean-like environment value. Returns `def` when `val` is null/undefined.
 * Accepts: 1/true/yes/on (case-insensitive) as truthy.
 * @param {any} val
 * @param {boolean} [def=false]
 * @returns {boolean}
 */
export function parseBoolEnv(val, def = false) {
  if (val == null) return def;
  const s = String(val).toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * Ensure a directory exists, creating ancestors if needed.
 * Synchronous for simplicity inside container entrypoint scripts.
 * @param {string} dir
 */
export function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Locate an executable on PATH using a synchronous call to `which`.
 * Returns the absolute path or null when not found.
 * @param {string} cmd
 * @returns {string|null}
 */
export function which(cmd) {
  const res = spawnSync("which", [cmd], { stdio: "pipe" });
  return res.status === 0 ? String(res.stdout).trim() : null;
}

/** Re-export sha256File from cache helpers to avoid duplication. */
export const sha256File = cacheSha256File;

/**
 * Async sleep helper used for retry backoff.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a URL with retries and exponential backoff. Returns the raw Node http(s) response.
 * Minimal wrapper used by `fetchToFileWithCache`.
 * @param {string} url
 * @param {object} opts
 * @param {{retries?:number, baseDelayMs?:number, debug?:boolean}} options
 */
export const fetchWithRetry = cacheFetchWithRetry;

/**
 * Download a URL into a cache directory, respecting ETag/Last-Modified and
 * returning metadata about the cached file. Uses `fetchWithRetry` for transient errors.
 * @param {string} url
 * @param {string} cacheDir
 * @param {{dryRun?:boolean, debug?:boolean}} options
 * @param {{etag?:string, lastModified?:string}} etagMeta
 */
/**
 * Download a URL into a cache directory with optional revalidation or busting.
 * Cache modes:
 * - 'revalidate' (default): send If-None-Match/If-Modified-Since when available
 * - 'bust': ignore validators and force a network fetch
 * @param {string} url
 * @param {string} cacheDir
 * @param {{dryRun?:boolean, debug?:boolean, cacheMode?:'revalidate'|'bust'}} options
 * @param {{etag?:string, lastModified?:string}} etagMeta
 */
export const fetchToFileWithCache = cacheFetchToFileWithCache;

/**
 * Read cached metadata for a previously-downloaded URL (if present).
 * @param {string} cacheDir
 * @param {string} url
 */
export const readMetaForUrl = cacheReadMetaForUrl;

/**
 * Copy a directory into place atomically by syncing to a staging directory
 * and renaming into the final destination. Returns an object with success/error.
 * @param {string} srcDir
 * @param {string} destDir
 * @param {{dryRun?:boolean}} options
 */
export function copyDirAtomic(srcDir, destDir, { dryRun = false } = {}) {
  const parent = path.dirname(destDir);
  ensureDirSync(parent);
  const staging = path.join(parent, `.staging-${path.basename(destDir)}-${Date.now()}`);
  if (dryRun) {
    console.log(`[patch] (dry-run) Copy dir ${srcDir} -> ${staging} then atomic rename to ${destDir}`);
    return { success: true };
  }
  ensureDirSync(staging);
  const rsync = which("rsync");
  if (rsync) {
    const r = spawnSync(rsync, ["-a", "--delete", `${srcDir}/`, `${staging}/`], { stdio: "inherit" });
    if (r.status !== 0) return { success: false, error: `rsync failed with code ${r.status}` };
  } else {
    const cp = which("cp");
    if (!cp) return { success: false, error: "Neither rsync nor cp is available" };
    const r = spawnSync(cp, ["-a", `${srcDir}/.`, `${staging}/`], { stdio: "inherit" });
    if (r.status !== 0) return { success: false, error: `cp failed with code ${r.status}` };
  }
  if (fs.existsSync(destDir)) {
    try { fs.rmSync(destDir, { recursive: true, force: true }); } catch {}
  }
  fs.renameSync(staging, destDir);
  return { success: true };
}

/**
 * Single export for easier imports in patch scripts.
 * @type {Record<string, Function>}
 * Functions:
 * - readJSON
 * - isUrl
 * - isArchive
 * - isDirectory
 * - parseBoolEnv
 * - ensureDirSync
 * - which
 * - sha256File
 * - sleep
 * - fetchWithRetry
 * - fetchToFileWithCache
 * - readMetaForUrl
 * - copyDirAtomic
 */
const functions = {
  readJSON,
  isUrl,
  isArchive,
  isDirectory,
  parseBoolEnv,
  ensureDirSync,
  which,
  sha256File: cacheSha256File,
  sleep,
  fetchWithRetry: cacheFetchWithRetry,
  fetchToFileWithCache: cacheFetchToFileWithCache,
  readMetaForUrl: cacheReadMetaForUrl,
  copyDirAtomic
};

export default functions;