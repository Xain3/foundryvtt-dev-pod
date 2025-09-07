#!/usr/bin/env node
/**
 * @file use-cache-or-stagger.mjs
 * @description Uses cached Foundry release or implements staggered download with jitter
 * @path patches/common/use-cache-or-stagger.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as f from "./helpers/common.mjs";
import { parsePatchArgs } from "./helpers/argvParser.mjs";

const FALLBACK_PROC_NUM = "unknown";
const FALLBACK_PATCH_NAME = "use-cache-or-stagger";

const ENV = process.env;
const { procNum: PROC_NUM, patchName: PATCH_NAME } = parsePatchArgs(FALLBACK_PROC_NUM, FALLBACK_PATCH_NAME);
const PREFIX = `${PROC_NUM}-${PATCH_NAME}`;
const CACHE_DIR = ENV.CONTAINER_CACHE || "/data/container_cache";
const STAGGER = ENV.FETCH_STAGGER_SECONDS || "0";
const PATCH_DRY_RUN = f.parseBoolEnv(ENV.PATCH_DRY_RUN, false);
const PATCH_DEBUG = f.parseBoolEnv(ENV.PATCH_DEBUG, false);

function looksLikeZipName(name) { return /^foundryvtt-.*\.zip$/i.test(name); }
function numericVersionKey(p) { const m = path.basename(p).match(/foundryvtt-([0-9]+(?:\.[0-9]+)*)\.zip/i); if (!m) return []; return m[1].split(".").map((n) => parseInt(n, 10)); }
function compareVersionKeys(a, b) { const av = numericVersionKey(a); const bv = numericVersionKey(b); const len = Math.max(av.length, bv.length); for (let i = 0; i < len; i++) { const ai = av[i] ?? 0; const bi = bv[i] ?? 0; if (ai !== bi) return ai - bi; } return 0; }
function pickLatestZip(dir) { if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return ""; const files = fs.readdirSync(dir).filter((f) => looksLikeZipName(f)).map((f) => path.join(dir, f)).filter((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }); if (!files.length) return ""; files.sort(compareVersionKeys); return files[files.length - 1] || ""; }
function isPositiveIntegerString(s) { return /^[0-9]+$/.test(String(s)); }
function randomJitterSeconds(max = 2) { return Math.random() * max; }
async function sleepSeconds(sec) { const ms = Math.max(0, Number(sec)) * 1000; return new Promise((resolve) => setTimeout(resolve, ms)); }

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
		if (!PATCH_DRY_RUN) { await sleepSeconds(Number(STAGGER)); await sleepSeconds(jitter); }
		else if (PATCH_DEBUG) { console.log(`[patch][debug] ${PREFIX}: dry-run: skipping sleep`); }
	} else {
		console.log(`[patch] ${PREFIX}: No cache found and no stagger configured. Proceeding immediately.`);
	}
}

main().catch((e) => { console.error(`[patch][error] ${PREFIX}: ${e?.message || e}`); process.exit(1); });
