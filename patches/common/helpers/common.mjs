/**
 * Small collection of helper utilities used by container patch scripts.
 * These helpers intentionally use the Node.js built-in `node:` specifiers
 * so they work in restricted or modern runtimes.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { sha256File as cacheSha256File, fetchWithRetry as cacheFetchWithRetry, fetchToFileWithCache as cacheFetchToFileWithCache, readMetaForUrl as cacheReadMetaForUrl } from "./cache.mjs";

export function readJSON(filePath, encoding = "utf8") {
	const raw = fs.readFileSync(filePath, encoding);
	return JSON.parse(raw);
}

export function isUrl(candidate) {
	return /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i.test(candidate);
}

export function isArchive(filePath) {
	return /\.(zip|tar\.gz|tgz|tar|tar\.bz2|tbz2|tar\.xz|txz)$/i.test(filePath);
}

export function isDirectory(p) {
	return fs.statSync(p).isDirectory();
}

export function parseBoolEnv(val, def = false) {
	if (val == null) return def;
	const s = String(val).toLowerCase();
	return s === "1" || s === "true" || s === "yes" || s === "on";
}

export function ensureDirSync(dir) {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function which(cmd) {
	const res = spawnSync("which", [cmd], { stdio: "pipe" });
	return res.status === 0 ? String(res.stdout).trim() : null;
}

export const sha256File = cacheSha256File;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const fetchWithRetry = cacheFetchWithRetry;

export const fetchToFileWithCache = cacheFetchToFileWithCache;

export const readMetaForUrl = cacheReadMetaForUrl;

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
