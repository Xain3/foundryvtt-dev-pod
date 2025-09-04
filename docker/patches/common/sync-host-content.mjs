#!/usr/bin/env node
/**
 * @file sync-host-content.mjs
 * @description Mirrors host build output into the container and bidirectionally syncs a development world using rsync (preferred) or cp fallback with safe pruning.
 * @path docker/patches/common/sync-host-content.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as f from "./helpers/common.mjs";
import { parsePatchArgs } from "./helpers/argvParser.mjs";

// sync-host-content.mjs
// - Mirrors module build (host -> container) with delete policy
// - Syncs world bidirectionally (host <-> container)
// - Prefers rsync with safe flags; falls back to cp when needed

const FALLBACK_PROC_NUM = "unknown";
const FALLBACK_PATCH_NAME = "sync-host-content";

const ENV = process.env;
const { procNum: PROC_NUM, patchName: PATCH_ID, args: ARGS } = parsePatchArgs(FALLBACK_PROC_NUM, FALLBACK_PATCH_NAME);
const PREFIX = `${PROC_NUM}-${PATCH_ID}`;
const FLAG_INITIAL_ONLY = ARGS.includes("--initial-only");
const FLAG_LOOP_ONLY = ARGS.includes("--loop-only");

const MODULE_SRC = ENV.MODULE_SRC || "/host/dist";
const MODULE_DST = ENV.MODULE_DST || "/data/Data/modules/foundryvtt-over-my-head";
const WORLD_SRC  = ENV.WORLD_SRC  || "/host/shared/worlds/test-world";
const WORLD_DST  = ENV.WORLD_DST  || "/data/Data/worlds/test-world";

let SYNC_INTERVAL = Number(ENV.SYNC_INTERVAL || 1);
if (!Number.isFinite(SYNC_INTERVAL) || SYNC_INTERVAL < 1) SYNC_INTERVAL = 1;

const RSYNC_COMMON = ENV.RSYNC_COMMON || "-a --delay-updates --partial-dir=.rsync-partial";
const HOST_UID = ENV.HOST_UID;
const HOST_GID = ENV.HOST_GID;
const PATCH_DRY_RUN = f.parseBoolEnv(ENV.PATCH_DRY_RUN, false);
const PATCH_DEBUG = f.parseBoolEnv(ENV.PATCH_DEBUG, false);
const WORLD_SYNC_ENABLED = f.parseBoolEnv(ENV.WORLD_SYNC_ENABLED, true);
const WORLD_INITIAL_SYNC = f.parseBoolEnv(ENV.WORLD_INITIAL_SYNC, true);
const SYNC_USE_CONFIG = f.parseBoolEnv(ENV.SYNC_USE_CONFIG, true);
const MODULE_MIRROR_ENABLED = f.parseBoolEnv(ENV.MODULE_MIRROR_ENABLED, true);
const CONTAINER_CONFIG_PATH = ENV.CONTAINER_CONFIG_PATH || "/config/container-config.json";
const DATA_DIR = (ENV.FOUNDRY_DATA_DIR || "/data/Data/").replace(/\/+$/, "");
const VERSION = String(ENV.FOUNDRY_VERSION || ENV.FOUNDRY_FALLBACK_MAJOR_VERSION || "13");

function log(...args) { console.log(`[patch] ${PREFIX}:`, ...args); }
function dlog(...args) { if (PATCH_DEBUG) console.log(`[patch][debug] ${PREFIX}:`, ...args); }

/**
 * Remove a legacy symlink if present so Foundry can write to real directories.
 * @param {string} p
 */
function removeLegacySymlink(p) {
  try {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) {
      log(`Removing legacy symlink at ${p}${PATCH_DRY_RUN ? " (dry-run)" : ""}`);
      if (!PATCH_DRY_RUN) { try { fs.unlinkSync(p); } catch {} }
    }
  } catch {}
}

/**
 * Ensure destination directory exists.
 * @param {string} p
 */
function ensureDir(p) {
  if (PATCH_DRY_RUN) { dlog(`Would ensure directory: ${p}`); return; }
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

/**
 * Run a command synchronously with inherited stdio.
 * Honors PATCH_DRY_RUN and PATCH_DEBUG for no-op and logging.
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} [opts]
 * @returns {{status:number}}
 */
function run(cmd, args, opts = {}) {
  dlog(`run: ${cmd} ${args.join(" ")}`);
  if (PATCH_DRY_RUN) return { status: 0 };
  return spawnSync(cmd, args, { stdio: "inherit", ...opts });
}

function rsyncAvailable() {
  return !!f.which("rsync");
}

function cpAvailable() {
  return !!f.which("cp");
}

function isWritableDir(p) {
  try {
    fs.accessSync(p, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Build continuous sync tasks from a provided config object and options (pure). */
export function buildConfigSyncTasksFrom(cfg, { version = VERSION, dataDir = DATA_DIR } = {}) {
  const versionCfg = cfg?.versions?.[version]?.install;
  if (!versionCfg) return [];
  const tasks = [];
  const handleKind = (kind) => {
    const entries = versionCfg[kind] || {};
    for (const [id, overrides] of Object.entries(entries)) {
      const top = cfg[kind]?.[id] || {};
      const merged = { ...top, ...overrides };
      const cs = merged.continuous_sync;
      let enabled = false;
      let direction;
      let source;
      let del;
      let interval;
      if (typeof cs === "boolean") {
        enabled = cs;
      } else if (cs && typeof cs === "object") {
        enabled = cs.enabled !== undefined ? !!cs.enabled : true;
        direction = cs.direction;
        source = cs.source;
        del = cs.delete;
        interval = cs.interval;
      }
      if (!enabled) continue;
      if (!direction) direction = (kind === "worlds") ? "host-to-container" : "bidirectional";
      if (!source) {
        if (kind === "worlds") source = `/host/shared/worlds/${id}`;
        else if (kind === "modules") source = `/host/resources/modules/${id}`;
        else source = `/host/resources/systems/${id}`;
      }
      if (del == null) del = (kind === "worlds") ? false : true;
      const dest = path.join(dataDir, kind, id);
      tasks.push({ kind, id, direction, source, dest, deletePolicy: del ? "delete" : "keep", interval: Number(interval) || 0 });
    }
  };
  handleKind("worlds");
  handleKind("modules");
  handleKind("systems");
  return tasks;
}

/** Read config from disk and build tasks when enabled. */
function buildConfigSyncTasks() {
  if (!SYNC_USE_CONFIG) { dlog("Config-driven sync disabled (SYNC_USE_CONFIG=0)"); return []; }
  let cfg;
  try { cfg = f.readJSON(CONTAINER_CONFIG_PATH); }
  catch { dlog(`No config at ${CONTAINER_CONFIG_PATH}`); return []; }
  const tasks = buildConfigSyncTasksFrom(cfg, { version: VERSION, dataDir: DATA_DIR });
  if (tasks.length) {
    log(`Config-driven sync tasks loaded: ${tasks.length}`);
    for (const t of tasks) dlog(`task: ${t.kind}:${t.id} ${t.direction} ${t.source} -> ${t.dest} (${t.deletePolicy})`);
  }
  return tasks;
}

/**
 * Perform a sync using rsync (preferred) or cp fallback.
 * @param {string} src
 * @param {string} dst
 * @param {"delete"|"keep"} deletePolicy
 * @returns {boolean}
 */
function rsyncWithPolicy(src, dst, deletePolicy) {
  if (rsyncAvailable()) {
    const args = RSYNC_COMMON.split(/\s+/).filter(Boolean);
    if (deletePolicy === "delete") args.push("--delete");
    args.push(`${src}/`, `${dst}/`);
    const r = run("rsync", args);
    if (r.status !== 0) return false;
    return true;
  }
  // Fallback: cp -a then optionally prune (for delete policy only)
  if (cpAvailable()) {
    const r = run("cp", ["-a", `${src}/.`, `${dst}/`]);
    if (r.status !== 0) return false;
    if (deletePolicy === "delete") {
      // prune files not present in src
      if (!PATCH_DRY_RUN) {
        try {
          const walk = (dir) => {
            for (const entry of fs.readdirSync(dir)) {
              const p = path.join(dir, entry);
              const rel = path.relative(dst, p);
              const srcPath = path.join(src, rel);
              try {
                const st = fs.lstatSync(p);
                if (st.isDirectory()) {
                  walk(p);
                  try { if (fs.readdirSync(p).length === 0) fs.rmdirSync(p); } catch {}
                } else if (st.isFile()) {
                  if (!fs.existsSync(srcPath)) {
                    try { fs.unlinkSync(p); } catch {}
                  }
                }
              } catch {}
            }
          };
          walk(dst);
        } catch {}
      } else {
        dlog(`Would prune files not present in ${src} from ${dst}`);
      }
    }
    return true;
  }
  return false;
}

/**
 * Execute one sync cycle: module mirror and world bidirectional sync.
 */
const CONFIG_TASKS = buildConfigSyncTasks();
const LAST_RUN_AT = new Map();

function shouldRunTask(task, now, initial) {
  // For initial cycle, respect WORLD_INITIAL_SYNC for worlds only
  if (initial && task.kind === "worlds" && !WORLD_INITIAL_SYNC) return false;
  const base = task.interval > 0 ? task.interval : SYNC_INTERVAL;
  const last = LAST_RUN_AT.get(task) || 0;
  return (now - last) >= base * 1000;
}

function syncOnce(opts = {}) {
  const initial = !!opts.initial;
  // Module: host -> container (mirror)
  if (MODULE_MIRROR_ENABLED && fs.existsSync(MODULE_SRC) && fs.statSync(MODULE_SRC).isDirectory()) {
    if (MODULE_DST === "/" || MODULE_SRC === "/") {
      console.error("[patch][error] Aborting module mirror: src or dst is root (/).");
    } else {
      rsyncWithPolicy(MODULE_SRC, MODULE_DST, "delete");
    }
  }

  // World: host -> container
  if (WORLD_SYNC_ENABLED) {
    if (!(initial && !WORLD_INITIAL_SYNC)) {
      if (fs.existsSync(WORLD_SRC) && fs.statSync(WORLD_SRC).isDirectory()) {
        rsyncWithPolicy(WORLD_SRC, WORLD_DST, "keep");

        // Container -> host with optional chown
        if (rsyncAvailable() && HOST_UID && HOST_GID) {
          const args = RSYNC_COMMON.split(/\s+/).filter(Boolean);
          args.push("--no-owner", "--no-group", `--chown=${HOST_UID}:${HOST_GID}`);
          args.push(`${WORLD_DST}/`, `${WORLD_SRC}/`);
          run("rsync", args);
        } else {
          rsyncWithPolicy(WORLD_DST, WORLD_SRC, "keep");
          if (HOST_UID && HOST_GID) {
            try { run("chown", ["-R", `${HOST_UID}:${HOST_GID}`, WORLD_SRC]); } catch {}
          }
        }
      }
    } else {
      dlog("Skipping initial world sync due to WORLD_INITIAL_SYNC=0");
    }
  }

  // Config-driven tasks
  const now = Date.now();
  for (const task of CONFIG_TASKS) {
    if (!shouldRunTask(task, now, initial)) continue;
    f.ensureDirSync(task.dest);
    if (task.direction === "host-to-container") {
      rsyncWithPolicy(task.source, task.dest, task.deletePolicy);
    } else {
      // bidirectional: try container->host, but verify host path is writable
      rsyncWithPolicy(task.source, task.dest, "keep");
      if (isWritableDir(task.source)) {
        if (rsyncAvailable() && HOST_UID && HOST_GID) {
          const args = RSYNC_COMMON.split(/\s+/).filter(Boolean);
          args.push("--no-owner", "--no-group", `--chown=${HOST_UID}:${HOST_GID}`);
          args.push(`${task.dest}/`, `${task.source}/`);
          run("rsync", args);
        } else {
          rsyncWithPolicy(task.dest, task.source, "keep");
          if (HOST_UID && HOST_GID) {
            try { run("chown", ["-R", `${HOST_UID}:${HOST_GID}`, task.source]); } catch {}
          }
        }
      } else {
        log(`[patch] ${task.kind}:${task.id} source not writable; falling back to host-to-container only (${task.source})`);
      }
    }
    LAST_RUN_AT.set(task, now);
  }
}

/**
 * Entrypoint. Logs config, ensures dirs, runs initial sync, then enters
 * a jittered loop to keep content in sync during development.
 * @returns {Promise<void>}
 */
async function main() {
  log(`MODULE_SRC=${MODULE_SRC} -> MODULE_DST=${MODULE_DST}`);
  if (WORLD_SYNC_ENABLED) {
    log(`WORLD_SRC=${WORLD_SRC} <-> WORLD_DST=${WORLD_DST} (bidirectional)`);
  } else {
    log("World sync disabled (WORLD_SYNC_ENABLED=0)");
  }
  if (CONFIG_TASKS.length) {
    log(`Config-driven sync enabled for ${CONFIG_TASKS.length} item(s)`);
    for (const t of CONFIG_TASKS) {
      if (t.direction === "bidirectional" && !isWritableDir(t.source)) {
        console.warn(`[patch] upfront: ${t.kind}:${t.id} source not writable for bidirectional sync (${t.source}); will fallback to host-to-container.`);
      }
    }
  }

  // Cleanup: remove legacy symlinks
  removeLegacySymlink(MODULE_DST);
  if (WORLD_SYNC_ENABLED) removeLegacySymlink(WORLD_DST);

  // Ensure destination directories exist
  ensureDir(MODULE_DST);
  if (WORLD_SYNC_ENABLED) ensureDir(WORLD_DST);

  // Initial sync step
  log(`Initial sync${PATCH_DRY_RUN ? " (dry-run)" : ""}`);
  syncOnce({ initial: true });
  if (FLAG_INITIAL_ONLY) return; // Exit after initial sync when requested

  // Continuous loop step (can be invoked directly via --loop-only)
  log(`Starting background sync loop (interval=${SYNC_INTERVAL}s)`);
  while (true) {
    await f.sleep(SYNC_INTERVAL * 1000);
    const jitter = Math.random() * 0.5; // up to 500ms
    await f.sleep(jitter * 1000);
    try { syncOnce(); } catch {}
  }
}

// Only run main when executed as the entry script, not when imported for tests
const isEntry = (() => {
  try { return import.meta.url === `file://${process.argv[1]}`; } catch { return false; }
})();

if (isEntry) {
  if (FLAG_LOOP_ONLY) {
    // Skip initial sync and jump straight to the loop
    (async () => {
      try {
        log(`Starting background sync loop (interval=${SYNC_INTERVAL}s)`);
        while (true) {
          await f.sleep(SYNC_INTERVAL * 1000);
          const jitter = Math.random() * 0.5;
          await f.sleep(jitter * 1000);
          try { syncOnce(); } catch {}
        }
      } catch (e) {
        console.error(`[patch][error] ${PREFIX}(loop-only): ${e?.message || e}`);
        process.exit(1);
      }
    })();
  } else {
    main().catch((e) => {
      console.error(`[patch][error] ${PREFIX}: ${e?.message || e}`);
      process.exit(1);
    });
  }
}
