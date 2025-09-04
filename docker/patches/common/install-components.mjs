/**
 * @file install-components.mjs
 * @description Installs systems, modules, and worlds based on container-config, supporting manifest URLs and local paths with caching, retries, and atomic directory installs.
 * @path docker/patches/common/install-components.mjs
 */
import process from "process";
import { ComponentInstaller } from "./helpers/componentInstaller.mjs";
import { parsePatchArgs } from "./helpers/argvParser.mjs";

const FALLBACK_PROC_NUM = "unknown";
const FALLBACK_PATCH_NAME = "install-components";

const { procNum: PROC_NUM, patchName: PATCH_ID } = parsePatchArgs(FALLBACK_PROC_NUM, FALLBACK_PATCH_NAME);
const PREFIX = `${PROC_NUM}-${PATCH_ID}`;

console.log(`[patch] ${PREFIX}: JS patch running; FOUNDRY_DATA_DIR=`, process.env.FOUNDRY_DATA_DIR || "(unset)");

// Get the environment
const ENV = process.env;

/**
 * Fallbacks for missing environment variables.
 * @type {Record<string, string>}
 */
const FALLBACKS = {
  VERSION: "13",
  DATA_DIR: "/data/Data",
  CONTAINER_CONFIG_PATH: "/config/container-config.json"
};

/**
 * Directory names within Foundry data dir
 * @type {Record<string, string>}
 */
const DIRS = {
  SYSTEMS: "systems",
  MODULES: "modules",
  WORLDS: "worlds"
};

// The implementation of ComponentInstaller has been moved to helpers/componentInstaller.mjs
// to allow reuse and keep this top-level patch small. Import the class and use it below.

// Instantiate and run the installer
const installer = new ComponentInstaller(
  ENV,
  FALLBACKS,
  DIRS
);

/**
 * Install components as per configuration.
 */
console.log(`[patch] ${PREFIX}: Installing components...`);
await installer.install();
console.log(`[patch] ${PREFIX}: Installation complete.`);

// Non-blocking presence check for worlds after install
try {
  const cfg = await installer.getConfig?.();
  const version = installer.getVersion?.() || FALLBACKS.VERSION;
  const dataDir = installer.getDataDir?.() || FALLBACKS.DATA_DIR;
  if (cfg && cfg.versions && cfg.versions[version] && cfg.versions[version].install && cfg.versions[version].install.worlds) {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const worldEntries = cfg.versions[version].install.worlds;
    for (const [worldId, overrides] of Object.entries(worldEntries)) {
      const top = cfg.worlds?.[worldId] || {};
      const merged = { ...top, ...overrides };
      if (!merged.check_presence) continue;
      const shouldInstall = merged.install_at_startup !== false; // default true unless explicitly false
      const worldPath = path.join(dataDir, DIRS.WORLDS, worldId);
      const exists = fs.existsSync(worldPath) && fs.statSync(worldPath).isDirectory();
      if (!shouldInstall && !exists) {
        console.warn(`[patch] world presence warning: '${worldId}' not found at ${worldPath} (install_at_startup=false)`);
      }
      if (shouldInstall) {
        const existsAfter = fs.existsSync(worldPath) && fs.statSync(worldPath).isDirectory();
        if (!existsAfter) {
          console.warn(`[patch] world presence warning: '${worldId}' not found after install at ${worldPath}`);
        }
      }
    }
  }
} catch (e) {
  console.warn(`[patch] ${PREFIX}: world presence check skipped:`, e?.message || e);
}