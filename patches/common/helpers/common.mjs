/**
 * @file common.mjs
 * @description Small collection of helper utilities used by container patch scripts
 * @path patches/common/helpers/common.mjs
 */

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
 * Read and parse a JSON file.
 * @param {string} filePath - Path to the JSON file
 * @param {string} encoding - File encoding (default: "utf8")
 * @returns {object} Parsed JSON object
 * @export
 */
export function readJSON(filePath, encoding = "utf8") {
	const raw = fs.readFileSync(filePath, encoding);
	return JSON.parse(raw);
}

/**
 * Check if a string is a valid URL.
 * @param {string} candidate - String to test
 * @returns {boolean} True if the string is a valid URL
 * @export
 */
export function isUrl(candidate) {
	return /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i.test(candidate);
}

/**
 * Check if a file path appears to be an archive.
 * @param {string} filePath - File path to test
 * @returns {boolean} True if the path has an archive extension
 * @export
 */
export function isArchive(filePath) {
	return /\.(zip|tar\.gz|tgz|tar|tar\.bz2|tbz2|tar\.xz|txz)$/i.test(filePath);
}

/**
 * Check if a path is a directory.
 * @param {string} p - Path to check
 * @returns {boolean} True if the path is a directory
 * @export
 */
export function isDirectory(p) {
	return fs.statSync(p).isDirectory();
}

/**
 * Parse an environment variable as a boolean.
 * @param {string|undefined} val - Environment variable value
 * @param {boolean} def - Default value if undefined (default: false)
 * @returns {boolean} Parsed boolean value
 * @export
 */
export function parseBoolEnv(val, def = false) {
	if (val == null) return def;
	const s = String(val).toLowerCase();
	return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 * @param {string} dir - Directory path to ensure
 * @export
 */
export function ensureDirSync(dir) {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Find the path to a command using the which utility.
 * @param {string} cmd - Command name to find
 * @returns {string|null} Path to command or null if not found
 * @export
 */
export function which(cmd) {
	const res = spawnSync("which", [cmd], { stdio: "pipe" });
	return res.status === 0 ? String(res.stdout).trim() : null;
}

/**
 * Re-exported SHA256 file hashing function from cache module.
 * @export
 */
export const sha256File = cacheSha256File;

/**
 * Sleep for a specified number of milliseconds.
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Promise that resolves after the delay
 * @export
 */
export const sleep = (ms) => new Promise((r) => {setTimeout(r, ms)});

/**
 * Re-exported fetch with retry function from cache module.
 * @export
 */
export const fetchWithRetry = cacheFetchWithRetry;

/**
 * Re-exported fetch to file with cache function from cache module.
 * @export
 */
export const fetchToFileWithCache = cacheFetchToFileWithCache;

/**
 * Re-exported read metadata function from cache module.
 * @export
 */
export const readMetaForUrl = cacheReadMetaForUrl;

/**
 * Atomically copy a directory using rsync or cp.
 * @param {string} srcDir - Source directory path
 * @param {string} destDir - Destination directory path
 * @param {object} options - Copy options
 * @param {boolean} options.dryRun - Enable dry-run mode (default: false)
 * @returns {object} Result object with success/error status
 * @export
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
