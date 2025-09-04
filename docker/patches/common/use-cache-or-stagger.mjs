#!/usr/bin/env node
/**
 * @file use-cache-or-stagger.mjs
 * @description Checks for a cached FoundryVTT archive and points installation to it; otherwise applies a configurable stagger with jitter to avoid rate limits.
 * @path docker/patches/common/use-cache-or-stagger.mjs
 */
import fs from "node:fs";
import path from "node:path";
import * as f from "./helpers/common.mjs";
import { parsePatchArgs } from "./helpers/argvParser.mjs";

// use-cache-or-stagger.mjs
// - If a cached Foundry zip exists under CONTAINER_CACHE, point the entrypoint
//   at it via FOUNDRY_RELEASE_URL to avoid network fetch and rate-limits.
// - If no cache is present, optionally sleep a short, configurable delay to
//   stagger concurrent presigned URL requests across multiple containers.

const FALLBACK_PROC_NUM = "unknown";
const FALLBACK_PATCH_NAME = "use-cache-or-stagger";

const ENV = process.env;
const { procNum: PROC_NUM, patchName: PATCH_NAME } = parsePatchArgs(FALLBACK_PROC_NUM, FALLBACK_PATCH_NAME);
const PREFIX = `${PROC_NUM}-${PATCH_NAME}`;
const CACHE_DIR = ENV.CONTAINER_CACHE || "/data/container_cache";
const STAGGER = ENV.FETCH_STAGGER_SECONDS || "0";
const PATCH_DRY_RUN = f.parseBoolEnv(ENV.PATCH_DRY_RUN, false);
const PATCH_DEBUG = f.parseBoolEnv(ENV.PATCH_DEBUG, false);

/**
 * Validate a filename looks like a FoundryVTT zip.
 * @param {string} name
 * @returns {boolean}
 */
function looksLikeZipName(name) {
  return /^foundryvtt-.*\.zip$/i.test(name);
}

/**
 * Extract numeric version components from a cache filename for sorting.
 * @param {string} p - Absolute path to candidate zip.
 * @returns {number[]} Array of version parts for lexical compare.
 */
function numericVersionKey(p) {
  // Extract version-ish parts from filename to sort lexically by version
  // E.g., foundryvtt-13.307.zip -> [13, 307]
  const m = path.basename(p).match(/foundryvtt-([0-9]+(?:\.[0-9]+)*)\.zip/i);
  if (!m) return [];
  return m[1].split(".").map((n) => parseInt(n, 10));
}

/**
 * Compare two cache filenames by extracted version tuple.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareVersionKeys(a, b) {
  const av = numericVersionKey(a);
  const bv = numericVersionKey(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const ai = av[i] ?? 0;
    const bi = bv[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

/**
 * Pick the highest-version Foundry zip in the cache directory.
 * @param {string} dir
 * @returns {string} Absolute path to latest zip or empty string when none.
 */
function pickLatestZip(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return "";
  const files = fs.readdirSync(dir)
    .filter((f) => looksLikeZipName(f))
    .map((f) => path.join(dir, f))
    .filter((p) => {
      try { return fs.statSync(p).isFile(); } catch { return false; }
    });
  if (!files.length) return "";
  files.sort(compareVersionKeys);
  return files[files.length - 1] || "";
}

/**
 * Return true if the provided string is a decimal integer >= 0.
 * @param {string|number} s
 * @returns {boolean}
 */
function isPositiveIntegerString(s) {
  return /^[0-9]+$/.test(String(s));
}

/**
 * Generate a random jitter in seconds up to `max`.
 * @param {number} [max=2]
 * @returns {number}
 */
function randomJitterSeconds(max = 2) {
  // Small jitter up to 2s default
  return Math.random() * max;
}

/**
 * Async sleep helper in seconds.
 * @param {number|string} sec
 * @returns {Promise<void>}
 */
async function sleepSeconds(sec) {
  const ms = Math.max(0, Number(sec)) * 1000;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Entrypoint. Sets `FOUNDRY_RELEASE_URL` to the cached zip when present,
 * otherwise applies a stagger with jitter before returning.
 * Env: `CONTAINER_CACHE`, `FETCH_STAGGER_SECONDS`, `PATCH_DRY_RUN`, `PATCH_DEBUG`.
 * @returns {Promise<void>}
 */
async function main() {
  const latestZip = pickLatestZip(CACHE_DIR);

  if (latestZip) {
  console.log(`[patch] ${PREFIX}: Using cached release: ${latestZip}${PATCH_DRY_RUN ? " (dry-run)" : ""}`);
  if (PATCH_DEBUG) console.log(`[patch][debug] ${PREFIX}: would set FOUNDRY_RELEASE_URL=file://${latestZip}`);
    if (!PATCH_DRY_RUN) process.env.FOUNDRY_RELEASE_URL = `file://${latestZip}`;
    return;
  }

  if (isPositiveIntegerString(STAGGER) && Number(STAGGER) > 0) {
    const jitter = randomJitterSeconds(2);
  console.log(`[patch] ${PREFIX}: No cache found. Sleeping ${STAGGER}s + ${jitter.toFixed(2)}s jitter before fetch.${PATCH_DRY_RUN ? " (dry-run)" : ""}`);
    if (!PATCH_DRY_RUN) {
      await sleepSeconds(Number(STAGGER));
      await sleepSeconds(jitter);
    } else if (PATCH_DEBUG) {
      console.log(`[patch][debug] ${PREFIX}: dry-run: skipping sleep`);
    }
  } else {
    console.log(`[patch] ${PREFIX}: No cache found and no stagger configured. Proceeding immediately.`);
  }
}

main().catch((e) => {
  console.error(`[patch][error] ${PREFIX}: ${e?.message || e}`);
  process.exit(1);
});
