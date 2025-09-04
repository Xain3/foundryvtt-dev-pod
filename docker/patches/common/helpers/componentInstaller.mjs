#!/usr/bin/env node
/**
 * @file componentInstaller.mjs
 * @module ComponentInstaller
 * @description
 * ComponentInstaller encapsulates the logic to install Foundry VTT components
 * (systems, modules, worlds) into the container's data directory. It reads the
 * container configuration (`container-config.json`) and honors per-major-version
 * install instructions. Sources may be manifest URLs or local paths/archives.
 *
 * This helper is intended to be imported by patch scripts (for example
 * `install-components.mjs`) so that the installation logic is reusable and
 * testable outside of a single top-level script.
 *
 * Behavioural notes:
 * - Supports `PATCH_DRY_RUN` and `PATCH_DEBUG` environment variables to control
 *   dry-run and verbose logging modes.
 * - Supports `PATCH_DISABLE_PURGE` to disable purging of unlisted components.
 * - Supports `PATCH_DISABLE_TEST_WORLD_EXCEPTION` to override test-world preservation.
 * - Uses a component cache directory (defaults to
 *   `/data/container_cache/components`) for downloaded manifests/archives.
 * - Installation operations are idempotent where possible and use atomic
 *   directory-copy helpers from `common.mjs` to avoid partially-written
 *   components.
 *
 * Environment variables used:
 * - `FOUNDRY_VERSION` or `FOUNDRY_FALLBACK_MAJOR_VERSION`: resolved to select
 *   the active major version. If set to `latest` or `stable` the configured
 *   fallback is used.
 * - `FOUNDRY_DATA_DIR`: path to the Foundry `Data` directory (defaults to
 *   `/data/Data`).
 * - `CONTAINER_CONFIG_PATH`: path to `container-config.json` (defaults to
 *   `/config/container-config.json`).
 * - `COMPONENT_CACHE` or `CONTAINER_CACHE`: cache directory for remote
 *   downloads.
 * - `PATCH_DRY_RUN`: when truthy, file-system mutations are skipped and logged
 *   as dry-run actions.
 * - `PATCH_DEBUG`: when truthy, additional debug logs are emitted.
 * - `PATCH_DISABLE_PURGE`: when truthy, skips purging unlisted components
 *   entirely.
 * - `PATCH_DISABLE_TEST_WORLD_EXCEPTION`: when truthy, disables the special
 *   exception that preserves "test-world" during purging.
 *
 * Usage:
 * import { ComponentInstaller } from './helpers/componentInstaller.mjs';
 * const installer = new ComponentInstaller(process.env, FALLBACKS, DIRS);
 * installer.install();
 *
 * Notes for maintainers:
 * - The class purposefully leaves manifest parsing and archive extraction as
 *   TODOs — the current surface area focuses on fetching, caching, and local
 *   path installs with atomic moves.
 * - Keep this module free of side-effects; top-level scripts should be the
 *   drivers (they instantiate and run the installer).
 *
 * @path docker/patches/common/helpers/componentInstaller.mjs
 */
import process from "process";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as f from "./common.mjs";
import { CacheManager } from "./cache.mjs";
import { extractArchiveNode } from "./extractors.mjs";

/**
 * @class ComponentInstaller
 * @description Installs Foundry VTT components (systems, modules, worlds) based on container configuration.
 *
 * Behavioral notes:
 * - Supports `PATCH_DRY_RUN` and `PATCH_DEBUG` environment variables to control
 * dry-run and verbose logging modes.
 */
export class ComponentInstaller {
  /**
   * Create a new ComponentInstaller.
   * @param {NodeJS.ProcessEnv} env - Process environment variables.
   * @param {{VERSION:string, DATA_DIR:string, CONTAINER_CONFIG_PATH:string}} fallbacks - Fallback configuration values.
   * @param {{SYSTEMS:string, MODULES:string, WORLDS:string}} dirs - Directory names for systems/modules/worlds inside the data dir.
   */
  constructor(env, fallbacks, dirs) {
    this.env = env;
    this.fallbacks = fallbacks;
    this.dirs = dirs;
    this.foundryVersion = this.#getFoundryVersion();
    this.majorVersion = this.#getMajorVersion(this.foundryVersion, this.fallbacks.VERSION);
    this.foundryDataDir = this.#getDataDir();
    this.configPath = this.#getContainerConfigPath();
    this.systemsDir = path.join(this.foundryDataDir, this.dirs.SYSTEMS);
    this.modulesDir = path.join(this.foundryDataDir, this.dirs.MODULES);
    this.worldsDir  = path.join(this.foundryDataDir, this.dirs.WORLDS);
    this.containerConfig = this.#loadContainerConfig();
    this.systems = this.containerConfig.systems || {};
    this.modules = this.containerConfig.modules || {};
    this.worlds = this.containerConfig.worlds || {};
    this.versionConfig = this.#getVersionConfig();

    this.dryRun = f.parseBoolEnv(this.env.PATCH_DRY_RUN, false);
    this.debug = f.parseBoolEnv(this.env.PATCH_DEBUG, false);
    this.disablePurge = f.parseBoolEnv(this.env.PATCH_DISABLE_PURGE, false);
    this.disableTestWorldException = f.parseBoolEnv(this.env.PATCH_DISABLE_TEST_WORLD_EXCEPTION, false);
    this.componentCache = this.env.COMPONENT_CACHE || this.env.CONTAINER_CACHE || "/data/container_cache/components";
    this.cacheMode = (this.env.PATCH_CACHE_MODE || (f.parseBoolEnv(this.env.PATCH_CACHE_BUST, false) ? 'bust' : 'revalidate'));
  this.forceNodeExtract = f.parseBoolEnv(this.env.PATCH_FORCE_NODE_EXTRACT, false);

    const checksumMode = this.env.PATCH_CHECKSUM_MODE || 'auto';
    const checksumThresholdBytes = Number(this.env.PATCH_CHECKSUM_THRESHOLD_BYTES || 209715200);
    const dirMaxFiles = Number(this.env.PATCH_DIR_MAX_FILES || 10000);
    this.cache = new CacheManager(this.componentCache, {
      dryRun: this.dryRun,
      debug: this.debug,
      cacheMode: this.cacheMode,
      checksumMode,
      checksumThresholdBytes,
      dirMaxFiles
    });
  }

  /**
   * Attempt to resolve a package download URL from a Foundry manifest.
   * Handles common shapes for systems/modules and many world manifests.
   * @private
   * @param {any} manifest
   * @returns {string|undefined}
   */
  #resolveDownloadUrlFromManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') return undefined;
    const candidates = [];
    // Common fields
    candidates.push(manifest.download);
    candidates.push(manifest.url);
    // Nested known shapes
    if (manifest.manifest && typeof manifest.manifest === 'object') {
      candidates.push(manifest.manifest.download);
      candidates.push(manifest.manifest.url);
    }
    if (Array.isArray(manifest.releases)) {
      for (const r of manifest.releases) {
        if (!r) continue;
        candidates.push(r.download);
        candidates.push(r.url);
        if (r.archive) candidates.push(r.archive);
      }
    }
    if (Array.isArray(manifest.packages)) {
      for (const p of manifest.packages) {
        if (!p) continue;
        candidates.push(p.download);
        candidates.push(p.url);
        if (p.archive) candidates.push(p.archive);
      }
    }
    if (manifest.compatibility && typeof manifest.compatibility === 'object') {
      const c = manifest.compatibility;
      candidates.push(c.download);
      candidates.push(c.url);
    }
    // Some manifests contain a nested 'file' object
    if (manifest.file && typeof manifest.file === 'object') {
      candidates.push(manifest.file.download);
      candidates.push(manifest.file.url);
      if (manifest.file.href) candidates.push(manifest.file.href);
    }
    // Flatten, filter strings, prefer likely archives
    const urls = candidates.filter((u) => typeof u === 'string' && u.length > 0);
    const archiveUrl = urls.find((u) => /\.(zip|tgz|tar(\.(gz|bz2|xz))?)$/i.test(u));
    return archiveUrl || urls[0];
  }

  /**
   * Extract an archive to a target directory using system tools.
   * Supports .zip, .tar, .tar.gz/.tgz, .tar.bz2/.tbz2, .tar.xz/.txz.
   * @private
   * @param {string} archivePath
   * @param {string} destDir
   * @returns {{success:boolean,error?:string}}
   */
  async #extractArchive(archivePath, destDir, sourceName) {
    try { if (!this.dryRun) fs.mkdirSync(destDir, { recursive: true }); } catch {}
    const lower = (sourceName || archivePath).toLowerCase();
  const unzip = this.forceNodeExtract ? null : f.which("unzip");
  const tar = this.forceNodeExtract ? null : f.which("tar");
    let res = { status: 0 };
    if (lower.endsWith('.zip')) {
      if (!unzip) return { success: false, error: "'unzip' not available in container" };
      if (this.dryRun) {
        console.log(`[patch] (dry-run) unzip -q ${archivePath} -d ${destDir}`);
        return { success: true };
      }
      res = spawnSync(unzip, ["-q", archivePath, "-d", destDir], { stdio: "inherit" });
      if (res.status !== 0) return { success: false, error: `unzip failed with code ${res.status}` };
      return { success: true };
    }
    if (!tar) {
      // Try pure-Node fallback for tar/tgz formats
  const res = await extractArchiveNode(archivePath, destDir, lower, { debug: this.debug });
  return res;
    }
    const args = ["-xf", archivePath, "-C", destDir];
    if (this.dryRun) {
      console.log(`[patch] (dry-run) tar ${args.join(' ')}`);
      return { success: true };
    }
    res = spawnSync(tar, args, { stdio: "inherit" });
    if (res.status !== 0) return { success: false, error: `tar failed with code ${res.status}` };
    return { success: true };
  }

  /**
   * Install from an archive file by extracting to a staging dir and copying atomically to dest.
   * @private
   * @param {string} id
   * @param {string} archivePath
   * @param {string} targetDir
   * @returns {{success:boolean,error?:string}}
   */
  async #installArchiveFileToDest(id, archivePath, targetDir, sourceName) {
    const parent = path.dirname(targetDir);
    try { if (!this.dryRun) fs.mkdirSync(parent, { recursive: true }); } catch {}
    const staging = path.join(this.componentCache, `.staging-extract-${id}-${Date.now()}`);
  const extract = await this.#extractArchive(archivePath, staging, sourceName);
  if (!extract.success) {
      try { if (!this.dryRun) fs.rmSync(staging, { recursive: true, force: true }); } catch {}
      return { success: false, error: extract.error };
    }
    let srcDir = staging;
    try {
      const entries = fs.readdirSync(staging, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory());
      const files = entries.filter(e => e.isFile());
      if (dirs.length === 1 && files.length === 0) {
        srcDir = path.join(staging, dirs[0].name);
      }
    } catch {}
    const dest = path.join(targetDir, id);
    const res = f.copyDirAtomic(srcDir, dest, { dryRun: this.dryRun });
    try { if (!this.dryRun) fs.rmSync(staging, { recursive: true, force: true }); } catch {}
    return res;
  }

  /**
   * Extract the major Foundry version from a version string.
   * Falls back to provided fallback when the provided version is 'latest',
   * 'stable', or fails validation.
   * @private
   * @param {string} version - Raw version string (eg. '13.307').
   * @param {string} [fallback] - Fallback major version to use when parsing fails.
   * @returns {string} Major version (eg. '13').
   */
  #getMajorVersion(version, fallback=this.fallbacks.VERSION) {
    if (version === "latest" || version === "stable") {
      console.warn(`[patch][warn] FOUNDRY_VERSION is set to '${this.foundryVersion}'; falling back to version ${fallback}`);
      return fallback;
    }
    if (!/^\d+(\.\d+){0,2}$/.test(version)) {
      console.warn(`[patch][warn] Unrecognized FOUNDRY_VERSION format: '${version}'; falling back to version ${fallback}`);
      return fallback;
    }
    return version.split(".")[0];
  }

  /**
   * Resolve the configured Foundry version from environment.
   * @private
   * @returns {string} Raw Foundry version string or 'latest'.
   */
  #getFoundryVersion() {
    return this.env.FOUNDRY_VERSION || this.env.FOUNDRY_FALLBACK_MAJOR_VERSION || "latest";
  }

  /**
   * Resolve the Foundry data directory path.
   * @private
   * @returns {string} Path to Foundry data directory.
   */
  #getDataDir() {
    return this.env.FOUNDRY_DATA_DIR || this.fallbacks.DATA_DIR;
  }

  /**
   * Resolve the container configuration JSON path.
   * @private
   * @returns {string} Path to `container-config.json`.
   */
  #getContainerConfigPath() {
    return this.env.CONTAINER_CONFIG_PATH || this.fallbacks.CONTAINER_CONFIG_PATH;
  }

  /**
   * Load and validate the per-major-version configuration section.
   * Exits the process with a non-zero code when configuration is missing
   * or the version is explicitly unsupported.
   * @private
   * @returns {object} Version configuration object for the active major version.
   */
  #getVersionConfig() {
    if (this.containerConfig && this.containerConfig.versions) {
      const versionConfig = this.containerConfig.versions[this.majorVersion] || null;
      // Check if the version config exists
      if (!versionConfig) {
        console.error(`[patch][error] No configuration found for Foundry major version ${this.majorVersion}.`);
        process.exit(3);
      }
      // Check if the version is explicitly unsupported
      if (versionConfig.supported === false) {
        console.error(`[patch][error] Foundry major version ${this.majorVersion} is not supported by this container configuration.`);
        process.exit(4);
      }
      return versionConfig;
    }
    console.error("[patch][error] No versions field found in container config.");
    process.exit(3);
  }

  /**
   * Load and parse the container configuration JSON from disk.
   * Exits the process if the file cannot be read or parsed.
   * @private
   * @returns {any} Parsed JSON object from the container config file.
   */
  #loadContainerConfig() {
    try {
      return f.readJSON(this.configPath);
    } catch (e) {
      console.error(`[patch][error] Failed to read or parse container config at ${this.configPath}:`, e.message);
      process.exit(2);
    }
  }

  /**
   * Normalize a component definition to a canonical source record.
   * Accepts objects with `manifest` or `path` and prefers `manifest` when
   * both are present.
   * @private
   * @param {{manifest?:string, path?:string}} compInfo - Component config entry.
   * @returns {{manifest?:string, path?:string}|null} Normalized source descriptor or null when none present.
   */
  #getSource(compInfo) {
    if (compInfo.manifest && compInfo.path) {
      //This case should be handled by the validator, but just in case
      console.warn(`[patch][warn] Component has both manifest and path; using manifest: ${compInfo.manifest}`);
      return { manifest: compInfo.manifest };
    }
    if (compInfo.manifest) {
      return { manifest: compInfo.manifest };
    }
    if (compInfo.path) {
      return { path: compInfo.path };
    }
    return null;
  }

  /**
   * Install a component using its manifest URL. This function fetches the
   * manifest (with caching) and is expected to later download and install
   * the package — currently a stub that fetches the manifest only.
   * @private
   * @param {string} id - Component id.
   * @param {{manifest:string}} source - Source containing a `manifest` URL.
   * @param {string} targetDir - Destination directory for installation.
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async #installFromManifest(id, source, targetDir) {
    const manifestUrl = source.manifest;
    if (!manifestUrl) {
      const error = `[patch][warn] No manifest URL provided for component '${id}'; skipping installation.`;
      console.warn(error);
      return { success: false, error };
    }
    if (this.debug) console.log(`[patch][debug] fetching manifest for '${id}' from ${manifestUrl}`);
    try {
      const res = await this.cache.fetchToFileWithCache(manifestUrl);
      if (!res.success) {
        console.warn(`[patch][warn] Failed to fetch manifest for '${id}': ${res.error}`);
        return { success: false, error: res.error };
      }
  const manifestPath = res.path;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const downloadUrl = this.#resolveDownloadUrlFromManifest(manifest);
      if (!downloadUrl || typeof downloadUrl !== 'string') {
        console.warn(`[patch][warn] No usable download URL found in manifest for '${id}'.`);
        return { success: false, error: 'manifest-missing-download' };
      }
      if (this.debug) console.log(`[patch][debug] downloading package for '${id}' from ${downloadUrl}`);
      const pkg = await this.cache.fetchToFileWithCache(downloadUrl);
      if (!pkg.success) {
        console.warn(`[patch][warn] Failed to fetch package for '${id}': ${pkg.error}`);
        return { success: false, error: pkg.error };
      }
      if (!f.isArchive(downloadUrl) && !f.isArchive(pkg.path)) {
        console.log(`[patch][warn] Package for '${id}' does not look like an archive; leaving at ${pkg.path}`);
        return { success: true };
      }
  const installRes = await this.#installArchiveFileToDest(id, pkg.path, targetDir, downloadUrl);
      if (!installRes.success) return installRes;
      console.log(`[patch] Installed '${id}' from manifest.`);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Install a component from a local directory using an atomic copy.
   * @private
   * @param {string} id - Component id.
   * @param {{path:string}} source - Source descriptor with a local path.
   * @param {string} targetDir - Destination directory for installation.
  * @returns {Promise<{success:boolean, error?:string|null}>}
   */
  async #installFromDirectory(id, source, targetDir) {
    let output = { success: false, error: null };
    const sourceDir = source.path || source.directory;
    if (!sourceDir) {
      output.error = `[patch][warn] No source directory provided for component '${id}'; skipping installation.`;
      console.warn(output.error);
      return output;
    }
    const dest = path.join(targetDir, id);
    try {
      const { changed } = await this.cache.hasLocalDirectoryChanged(sourceDir);
      if (!changed && fs.existsSync(dest)) {
        console.log(`[patch] Skipping '${id}': directory unchanged and already installed.`);
        return { success: true };
      }
    } catch {}
    const res = f.copyDirAtomic(sourceDir, dest, { dryRun: this.dryRun });
    if (!res.success) {
      console.warn(`[patch][warn] Failed to install directory '${id}': ${res.error || "unknown error"}`);
      return { success: false, error: res.error };
    }
    return { success: true };
  }

  /**
   * Install a component from a local archive. Currently a stub for
   * extraction logic.
   * @private
   * @param {string} id - Component id.
   * @param {{path:string}} source - Source descriptor with an archive path.
   * @param {string} targetDir - Destination directory for installation.
  * @returns {Promise<{success:boolean, error?:string|null}>}
   */
  async #installFromArchive(id, source, targetDir) {
    let output = { success: false, error: null };
    const archivePath = source.path || source.directory;
    if (!archivePath) {
      output.error = `[patch][warn] No archive path provided for component '${id}'; skipping installation.`;
      console.warn(output.error);
      return output;
    }
    try {
      const { changed } = await this.cache.hasLocalFileChanged(archivePath);
      const dest = path.join(targetDir, id);
      if (!changed && fs.existsSync(dest)) {
        console.log(`[patch] Skipping '${id}': archive unchanged and already installed.`);
        return { success: true };
      }
    } catch {}
    console.log(`[patch] Installing from archive: ${archivePath} to ${targetDir}${this.dryRun ? " (dry-run)" : ""}`);
  const res = await this.#installArchiveFileToDest(id, archivePath, targetDir);
    if (!res.success) {
      console.warn(`[patch][warn] Failed to install archive '${id}': ${res.error || 'unknown error'}`);
      return { success: false, error: res.error };
    }
    return { success: true };
  }

  /**
   * Download and stage a component from a remote URL (cached). The caller
   * is responsible for extracting/placing files where appropriate.
   * @private
   * @param {string} id - Component id.
   * @param {{path:string}} source - Source descriptor containing the URL.
   * @param {string} targetDir - Destination directory for installation.
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async #installFromUrl(id, source, targetDir) {
    let output = { success: false, error: null };
    const url = source.path || source.directory;
    if (!url) {
      output.error = `[patch][warn] No URL provided for component '${id}'; skipping installation.`;
      console.warn(output.error);
      return output;
    }
    try {
      const res = await this.cache.fetchToFileWithCache(url);
      if (!res.success) {
        console.warn(`[patch][warn] Failed to fetch URL for '${id}': ${res.error}`);
        return { success: false, error: res.error };
      }
      if (f.isArchive(url) || f.isArchive(res.path)) {
  const installRes = await this.#installArchiveFileToDest(id, res.path, targetDir, url);
        if (!installRes.success) return installRes;
        console.log(`[patch] Installed '${id}' from URL archive.`);
        return { success: true };
      }
      console.log(`[patch] Downloaded${res.fromCache ? " from cache" : ""}: ${url}. Not an archive; left at ${res.path}`);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Dispatch installation based on whether the provided path is a URL,
   * directory, or archive.
   * @private
   * @param {string} id - Component id.
   * @param {{path?:string, directory?:string}} source - Source descriptor.
   * @param {string} targetDir - Destination directory.
  * @returns {Promise<{success:boolean, error?:string}>}
   */
  async #installFromPath(id, source, targetDir) {
    let output = { success: false, error: null };
    const sourcePath = source.path || source.directory;

    // Determine if sourcePath is an URL
    if (f.isUrl(sourcePath))  return await this.#installFromUrl(id, { path: sourcePath }, targetDir);

    // Otherwise, treat as local path
    if (!fs.existsSync(sourcePath)) {
      output.error = `[patch][warn] Source path does not exist: ${sourcePath}; skipping installation of '${id}'.`;
      console.warn(output.error);
      return output;
    }
  if (f.isDirectory(sourcePath)) return await this.#installFromDirectory(id, { path: sourcePath }, targetDir);
  if (f.isArchive(sourcePath)) return await this.#installFromArchive(id, { path: sourcePath }, targetDir);

    // If it's neither a directory nor an archive nor a URL, warn and skip
    const msg = `[patch][warn] Source path is not a directory, archive, or URL: ${sourcePath}; skipping installation of '${id}'.`;
    console.warn(msg);
    return { success: false, error: msg };
  }

  /**
   * Merge top-level and per-version component configuration then invoke the
   * appropriate installer for the resolved source.
   * @private
   * @param {string} id - Component id.
   * @param {object} cfg - Per-version partial configuration for this id.
   * @param {string} targetDir - Destination directory for installation.
   * @param {Record<string, any>} topLevelMap - Top-level components map from container-config.
   * @param {"system"|"module"|"world"} type - Component type used for logging.
   * @returns {{success:boolean, error?:string}|Promise<{success:boolean, error?:string}>}
   */
  async #installComponent(id, cfg, targetDir, topLevelMap, type) {
    let output = { success: false, error: null };
    if (typeof cfg !== 'object') {
      output.error = `[patch][warn] Invalid configuration for ${type} '${id}'; skipping.`;
      console.warn(output.error);
      return output;
    }
    const compCfg = topLevelMap[id];
    if (!compCfg) console.warn(`[patch][warn] ${type} '${id}' is not defined at top-level; using per-version overrides only.`);

    const mergedCfg = {
      ...(compCfg ?? {}),
      ...(cfg ?? {})
    };

    if (!mergedCfg) {
      output.error = `[patch][warn] ${type} '${id}' not defined in top-level ${type}s; skipping.`;
      console.warn(output.error);
      return output;
    }

    const source = this.#getSource(mergedCfg);
    if (!source) {
      output.error = `[patch][warn] ${type} '${id}' has no valid source (manifest or path); skipping.`;
      console.warn(output.error);
      return output;
    }
    const critical = !!mergedCfg.critical;
    if (source.manifest) {
      console.log(`[patch] Installing ${type} '${id}' from manifest: ${source.manifest}`);
      const res = await this.#installFromManifest(id, source, targetDir);
      if (!res?.success) {
        const msg = `[patch] ${type} '${id}' installation failed${critical ? ' (critical)' : ''}: ${res?.error || 'unknown error'}`;
        if (critical) {
          console.error(msg);
          process.exit(5);
        } else {
          console.warn(msg);
        }
      }
      return res;
    } else if (source.path) {
      console.log(`[patch] Installing ${type} '${id}' from path: ${source.path}`);
      const res = await this.#installFromPath(id, source, targetDir);
      if (!res?.success) {
        const msg = `[patch] ${type} '${id}' installation failed${critical ? ' (critical)' : ''}: ${res?.error || 'unknown error'}`;
        if (critical) {
          console.error(msg);
          process.exit(5);
        } else {
          console.warn(msg);
        }
      }
      return res;
    } else {
      output.error = `[patch][warn] ${type} '${id}' has no valid source (manifest or path); skipping.`;
      console.warn(output.error);
      return output;
    }
  }

  /**
   * Iterate over a set of components and install each one.
   * @private
   * @param {Record<string, object>} components - Map of id -> per-version config.
   * @param {string} targetDir - Target directory for the component type.
   * @param {Record<string, any>} topLevelMap - Top-level components map.
   * @param {"system"|"module"|"world"} type - Component type string used for logging.
   * @param {string} label - Label used in summary logs.
  * @returns {Promise<string[]>} Installed component ids.
   */
  async #installLoop(components, targetDir, topLevelMap, type, label) {
    const installed = [];
    for (const [id, cfg] of Object.entries(components || {})) {
      const result = await this.#installComponent(id, cfg, targetDir, topLevelMap, type);
      if (result?.success) installed.push(id);
    }
    if (installed.length) console.log(`[patch] Installed ${label}: ${installed.join(", ")}`);
    return installed;
  }

  /**
   * Install systems, modules and worlds as specified by `installCfg`.
   * @private
   * @param {{systems?:Record<string,object>, modules?:Record<string,object>, worlds?:Record<string,object>}} installCfg
   *   Configuration object describing components to install.
   */
  async #installComponents(installCfg) {
    if (installCfg.systems) {
      await this.#installLoop(installCfg.systems, this.systemsDir, this.systems, "system", "systems");
    }
    if (installCfg.modules) {
      await this.#installLoop(installCfg.modules, this.modulesDir, this.modules, "module", "modules");
    }
    if (installCfg.worlds) {
      await this.#installLoop(installCfg.worlds, this.worldsDir, this.worlds, "world", "worlds");
    }
  }

  /**
   * Ensure component directories exist (idempotent and race-safe).
   * @private
   * @param {string[]} directories - List of directory paths to ensure.
  * @returns {Promise<void>}
   */
  #ensureDirectoriesExist(directories) {
    for (const dir of directories) {
      try {
        if (!this.dryRun) fs.mkdirSync(dir, { recursive: true });
        console.log(`[patch] Ensured directory exists: ${dir}${this.dryRun ? " (dry-run)" : ""}`);
      } catch (err) {
        // Handle rare race conditions or other transient errors idempotently
        if (err && err.code === "EEXIST") {
          console.log(`[patch] Directory already exists (race): ${dir}`);
          continue;
        }
        // Double-check whether the directory now exists and is a directory
        try {
          if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
            console.log(`[patch] Directory exists after race/error: ${dir}`);
            continue;
          } else {
            console.error(`[patch][error] Failed to create directory: ${dir}; error: ${err?.message || err}`);
          }
        } catch (innerErr) {
          console.error(
            `[patch][error] Failed to create or validate directory: ${dir}; mkdir error: ${err?.message || err}; stat error: ${innerErr?.message || innerErr}`
          );
        }
      }
    }
  }

  /**
   * Purge components not listed in the install configuration.
   * @private
   * @param {{systems?:Record<string,object>, modules?:Record<string,object>, worlds?:Record<string,object>}} installCfg
   *   Configuration object describing components that should remain installed.
   */
  async #purgeUnlistedComponents(installCfg) {
    if (installCfg.systems) {
      await this.#purgeUnlistedFromDirectory(this.systemsDir, installCfg.systems, "system");
    }
    if (installCfg.modules) {
      await this.#purgeUnlistedFromDirectory(this.modulesDir, installCfg.modules, "module");
    }
    if (installCfg.worlds) {
      await this.#purgeUnlistedFromDirectory(this.worldsDir, installCfg.worlds, "world");
    }
  }

  /**
   * Purge unlisted components from a specific directory.
   * @private
   * @param {string} targetDir - Directory containing components.
   * @param {Record<string,object>} allowedComponents - Map of component ids that should be kept.
   * @param {"system"|"module"|"world"} type - Component type for logging.
   */
  async #purgeUnlistedFromDirectory(targetDir, allowedComponents, type) {
    if (!fs.existsSync(targetDir)) {
      console.log(`[patch] ${type} directory does not exist: ${targetDir}; skipping purge.`);
      return;
    }

    const allowedIds = Object.keys(allowedComponents || {});
    const purged = [];

    try {
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue; // Skip files, only process directories
        }
        
        const componentId = entry.name;
        
        // Special case: preserve "test-world" even if not in config
        if (type === "world" && componentId === "test-world" && !this.disableTestWorldException) {
          console.log(`[patch] Preserving test-world (exception for testing)`);
          continue;
        }
        
        // Check if this component is in the allowed list
        if (!allowedIds.includes(componentId)) {
          const componentPath = path.join(targetDir, componentId);
          
          if (this.dryRun) {
            console.log(`[patch] (dry-run) Would purge unlisted ${type}: ${componentId}`);
            purged.push(componentId);
          } else {
            try {
              fs.rmSync(componentPath, { recursive: true, force: true });
              console.log(`[patch] Purged unlisted ${type}: ${componentId}`);
              purged.push(componentId);
            } catch (error) {
              console.warn(`[patch][warn] Failed to purge ${type} '${componentId}': ${error.message}`);
            }
          }
        }
      }
      
      if (purged.length > 0) {
        console.log(`[patch] Purged ${type}s: ${purged.join(", ")}`);
      } else {
        console.log(`[patch] No unlisted ${type}s to purge.`);
      }
    } catch (error) {
      console.warn(`[patch][warn] Failed to read ${type} directory ${targetDir}: ${error.message}`);
    }
  }

  /**
   * Public entrypoint to perform version-specific installation.
   * Ensures required directories exist and then installs configured components.
   * After installation, purges any components not in the install list.
   * @returns {void}
   */
  async install() {
    if (!this.versionConfig.install) {
      console.log(`[patch] No install configuration for version ${this.majorVersion}; nothing to install.`);
      return;
    }
    const installCfg = this.versionConfig.install;

    // Ensure directories exist
    const directories = [this.systemsDir, this.modulesDir, this.worldsDir];
    this.#ensureDirectoriesExist(directories);

    // Install components
    await this.#installComponents(installCfg);

    // Purge unlisted components (unless disabled)
    if (!this.disablePurge) {
      await this.#purgeUnlistedComponents(installCfg);
    } else {
      console.log(`[patch] Purging disabled by PATCH_DISABLE_PURGE environment variable.`);
    }
  }

  // Getter helpers for follow-up checks
  getConfig() { return this.containerConfig; }
  getVersion() { return this.majorVersion; }
  getDataDir() { return this.foundryDataDir; }
}
