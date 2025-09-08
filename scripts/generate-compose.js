#!/usr/bin/env node
/**
 * @file generate-compose.js
 * @description Generate docker compose YAML from a JSON config
 * @path scripts/generate-compose.js
 */

/**
 * Generate docker compose YAML from a JSON config.
 *
 * Supports two input shapes:
 * 1) Container config (recommended): `container-config.json` - the single source of truth used by runtime patches
 * 2) Advanced compose config: `compose.config.json` - direct control over services with explicit fields
 *
 * CLI usage (zsh):
 *   node scripts/generate-compose.js -c container-config.json -o compose.dev.yml
 *   node scripts/generate-compose.js --print
 *   node scripts/generate-compose.js --dry-run
 *
 * Options:
 *  -c, --config <file>     Path to config file (default: container-config.json)
 *  -o, --out <file>        Output file path (omit for stdout)
 *  --print                 Print to stdout (same as omitting -o)
 *  --dry-run, -n           Show what would be done without writing files
 *  --secrets-mode <mode>   Secrets mode: file|external|gcp|azure|aws|none (default: auto)
 *  --secrets-file <file>   File mode: path to secrets file (default: ./secrets.json)
 *  --secrets-external <name> External mode: external secret name
 *  --secrets-target <path> Target path in container (default: config.json)
 *  --secrets-gcp-project <project> GCP mode: Google Cloud project ID
 *  --secrets-gcp-secret <secret>   GCP mode: Secret Manager secret name
 *  --secrets-azure-vault <vault>   Azure mode: Key Vault name
 *  --secrets-azure-secret <secret> Azure mode: Secret name in Key Vault
 *  --secrets-aws-region <region>   AWS mode: AWS region
 *  --secrets-aws-secret <secret>   AWS mode: Secrets Manager secret name
 *  --secrets-cli-timeout <ms>      Timeout (ms) for cloud secrets CLI calls (default: 8000)
 *
 * Environment overrides (container-config mode):
 *  - COMPOSE_BASE_IMAGE: Base image for Foundry services (default: felddy/foundryvtt)
 *  - COMPOSE_USER: User string for services (default: 0:0)
 *  - COMPOSE_BUILDER_ENABLED: When not '0', include builder service (default: enabled)
 *  - COMPOSE_BUILDER_IMAGE: Builder image (default: node:20-alpine)
 *  - COMPOSE_SECRETS_MODE: Secrets mode (file|external|gcp|azure|aws|none, default: auto)
 *  - COMPOSE_SECRETS_FILE: Path to secrets file (default: ./secrets.json)
 *  - COMPOSE_SECRETS_EXTERNAL_NAME: External secret name
 *  - COMPOSE_SECRETS_TARGET: Target path in container (default: config.json)
 *  - COMPOSE_SECRETS_GCP_PROJECT: Google Cloud project ID for GCP mode
 *  - COMPOSE_SECRETS_GCP_SECRET: Secret Manager secret name for GCP mode
 *  - COMPOSE_SECRETS_AZURE_VAULT: Key Vault name for Azure mode
 *  - COMPOSE_SECRETS_AZURE_SECRET: Secret name in Key Vault for Azure mode
 *  - COMPOSE_SECRETS_AWS_REGION: AWS region for AWS mode
 *  - COMPOSE_SECRETS_AWS_SECRET: Secrets Manager secret name for AWS mode
 *
 * Defaults (container-config mode):
 *  - Service name: foundry-v<NN>, dir: v<NN>, port: 30000+<NN>
 *  - Image tag: numeric version unless tag template provided
 *  - FETCH_STAGGER_SECONDS: v13=4, v12=2, else 0
 *  - Binds mirror static compose: config file, dist, patches, shared, resources, and cache
 *
 * @module scripts/generate-compose
 */

/**
 * @typedef {Object} ComposeVersionEntry
 * @property {string} name Service name (e.g., "foundry-v13")
 * @property {string} tag Docker image tag (e.g., "release")
 * @property {number} port Host port to map to container 30000
 * @property {string} versionDir Directory suffix like "v13"
 * @property {string} [envSuffix] Suffix for env file selection (default: `versionDir`)
 * @property {number} [fetchStaggerSeconds] Delay before network fetch to avoid 429s
 */

/**
 * @typedef {Object} ComposeBuilder
 * @property {string} [image] Builder image (default: node:20-alpine)
 * @property {boolean} [enabled] Whether builder service is included (default: true)
 */

/**
 * @typedef {Object} ComposeConfig
 * @property {string} [baseImage] Base image repo (default: felddy/foundryvtt)
 * @property {string} [user] Service user (default: 0:0)
 * @property {Array<ComposeVersionEntry>} versions List of services to generate
 * @property {ComposeBuilder} [builder] Optional builder service configuration
 */

/**
 * @typedef {Object} Item
 * @property {string} name Display name
 * @property {string} [manifest] Manifest URL (non-empty) or empty string
 * @property {string} [path] Local path or URL (non-empty) or empty string
 * @property {boolean} [install_at_startup]
 * @property {boolean|Object} [continuous_sync]
 * @property {boolean} [check_presence]
 */

/**
 * @typedef {Object.<string, Item>} ItemMap
 */

/**
 * @typedef {Object} VersionInstall
 * @property {Object.<string, Partial<Item>>} [systems]
 * @property {Object.<string, Partial<Item>>} [modules]
 * @property {Object.<string, Partial<Item>>} [worlds]
 */

/**
 * @typedef {Object} VersionConfig
 * @property {boolean} [supported] Whether this Foundry version should run (default: true)
 * @property {VersionInstall} install What to install for this version
 */

/**
 * @typedef {Object} ContainerConfig
 * @property {ItemMap} systems
 * @property {ItemMap} modules
 * @property {ItemMap} [worlds]
 * @property {Object.<string, VersionConfig>} versions
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { validateConfig } from './validate-config.js';

import {
  FALLBACK_IMAGE,
  BASE_PORT,
  DEFAULT_USER,
  FETCH_STAGGER_ENV,
  VERSION_PLACEHOLDER,
  DEFAULT_SECRET_TARGET,
  SECRET_BASE_NAME,
  SECRET_PROVIDER_SUFFIX,
  SECRET_MODES,
  FETCH_STAGGER_DEFAULTS,
  DEFAULT_BUILDER,
  SECRET_CLI_TIMEOUT_MS,
  PATHS,
  argsFallbacks
} from './generate-compose.constants.js'; // Kept for backwards compatibility; prefer config/config.js overrides
// eslint-disable-next-line no-unused-vars
import moduleConfig from '../config/config.js'; // Preferred source for overrides and tunables

// Effective timeout for cloud CLI secret retrieval (env override wins, fallback constant 8000ms)
let _secretRetrieveTimeoutMs = (() => {
  const raw = Number(process.env.COMPOSE_SECRETS_CLI_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : SECRET_CLI_TIMEOUT_MS;
})();
function getSecretsCliTimeoutMs() { return _secretRetrieveTimeoutMs; }
function setSecretsCliTimeoutMs(v) {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) _secretRetrieveTimeoutMs = n;
}


/**
 * Parse CLI process arguments into an options object.
 * Supports short and long flags plus environment variable fallbacks.
 * @param {string[]} argv Full `process.argv` array
 * @returns {Object} Parsed argument map
 * @export
 */
function parseArgs(argv) {
  const args = {
    config: argsFallbacks.config,
    out: argsFallbacks.out,
    dryRun: argsFallbacks.dryRun,
    secretsMode: process.env.COMPOSE_SECRETS_MODE || argsFallbacks.secretsMode,
    secretsFile: process.env.COMPOSE_SECRETS_FILE || argsFallbacks.secretsFile,
    secretsExternalName: process.env.COMPOSE_SECRETS_EXTERNAL_NAME || argsFallbacks.secretsExternalName,
    secretsTarget: process.env.COMPOSE_SECRETS_TARGET || argsFallbacks.secretsTarget,
    secretsGcpProject: process.env.COMPOSE_SECRETS_GCP_PROJECT || argsFallbacks.secretsGcpProject,
    secretsGcpSecret: process.env.COMPOSE_SECRETS_GCP_SECRET || argsFallbacks.secretsGcpSecret,
    secretsAzureVault: process.env.COMPOSE_SECRETS_AZURE_VAULT || argsFallbacks.secretsAzureVault,
    secretsAzureSecret: process.env.COMPOSE_SECRETS_AZURE_SECRET || argsFallbacks.secretsAzureSecret,
    secretsAwsRegion: process.env.COMPOSE_SECRETS_AWS_REGION || argsFallbacks.secretsAwsRegion,
    secretsAwsSecret: process.env.COMPOSE_SECRETS_AWS_SECRET || argsFallbacks.secretsAwsSecret,
    secretsCliTimeout: process.env.COMPOSE_SECRETS_CLI_TIMEOUT_MS || argsFallbacks.secretsCliTimeout
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '-c' || a === '--config') && argv[i + 1]) args.config = argv[++i];
    else if ((a === '-o' || a === '--out') && argv[i + 1]) args.out = argv[++i];
    else if (a === '--print') args.out = '';
    else if (a === '--dry-run' || a === '-n') args.dryRun = true;
    else if (a === '--secrets-mode' && argv[i + 1]) args.secretsMode = argv[++i];
    else if (a === '--secrets-file' && argv[i + 1]) args.secretsFile = argv[++i];
    else if (a === '--secrets-external' && argv[i + 1]) args.secretsExternalName = argv[++i];
    else if (a === '--secrets-target' && argv[i + 1]) args.secretsTarget = argv[++i];
    else if (a === '--secrets-gcp-project' && argv[i + 1]) args.secretsGcpProject = argv[++i];
    else if (a === '--secrets-gcp-secret' && argv[i + 1]) args.secretsGcpSecret = argv[++i];
    else if (a === '--secrets-azure-vault' && argv[i + 1]) args.secretsAzureVault = argv[++i];
    else if (a === '--secrets-azure-secret' && argv[i + 1]) args.secretsAzureSecret = argv[++i];
    else if (a === '--secrets-aws-region' && argv[i + 1]) args.secretsAwsRegion = argv[++i];
    else if (a === '--secrets-aws-secret' && argv[i + 1]) args.secretsAwsSecret = argv[++i];
    else if (a === '--secrets-cli-timeout' && argv[i + 1]) args.secretsCliTimeout = argv[++i];
  }
  return args;
}

let secretTempCounter = 0;
/**
 * Generate a monotonic (time + counter) numeric string id used for temp secret file names.
 * Bounded counter ensures predictable length in tests.
 * @returns {string} Unique-ish numeric id
 */
function nextTempId() {
  const now = Date.now();
  const upperBoundHex = 0xffff; // prevent unbounded growth
  secretTempCounter = (secretTempCounter + 1) & upperBoundHex; // bounded
  return `${now}${secretTempCounter}`; // digits only for tests
}

/**
 * Build full image reference from repository and tag.
 * @param {string} repo Repository (e.g. felddy/foundryvtt)
 * @param {string} tag Image tag
 * @returns {string} Repo:tag reference
 * @export
 */
function composeImage(repo, tag) { return `${repo}:${tag}`; }
/**
 * Derive default image tag from numeric version.
 * @param {number|string} version Foundry version number
 * @returns {string} Tag string
 * @export
 */
function defaultTag(version) { return String(version); }
/**
 * Determine default fetch stagger seconds for a version.
 * @param {number} version Numeric version
 * @returns {number} Stagger seconds
 * @export
 */
function defaultFetchStagger(version) { if (version >= 13) return FETCH_STAGGER_DEFAULTS.high; if (version === 12) return FETCH_STAGGER_DEFAULTS.mid; return FETCH_STAGGER_DEFAULTS.none; }
/**
 * Apply version templating using VERSION placeholder.
 * @param {string|undefined} template Template containing {{VERSION}} tokens
 * @param {number} version Version number
 * @returns {string|undefined} Resolved string or undefined if template invalid
 * @export
 */
function applyVersionTemplate(template, version) { if (typeof template !== 'string') return undefined; return template.replaceAll(VERSION_PLACEHOLDER, String(version)); }
/**
 * Build base volume mount array used by generated services.
 * @param {string} name Service/container name (used for named data volume)
 * @param {string} dir Version directory (e.g. v13)
 * @returns {Array<string|Object>} Docker compose volume spec entries
 * @export
 */
function buildBaseVolumeMounts(name, dir) {
	return [
		`${name}-data:/data`,
		{ type: 'bind', source: PATHS.configFileSource, target: PATHS.configFileTarget, read_only: true },
		{ type: 'bind', source: PATHS.distSource, target: PATHS.distTarget, read_only: true },
		{ type: 'bind', source: PATHS.patchesSource, target: PATHS.patchesTarget },
		{ type: 'bind', source: `${PATHS.sharedBase}/${dir}`, target: PATHS.sharedTarget, read_only: false },
		{ type: 'bind', source: `${PATHS.resourcesBase}/${dir}`, target: PATHS.resourcesTarget, read_only: true },
		{ type: 'bind', source: `${PATHS.cacheBase}/${dir}`, target: PATHS.cacheTarget }
	];
}
/**
 * Generate ordered env file list for a service.
 * @param {string} envSuffix Version/env specific suffix (e.g. v13)
 * @param {string[]} [extra] Additional env file paths
 * @returns {string[]} Env file list
 * @export
 */
function envFiles(envSuffix, extra = []) { return [ './env/.env', `./env/.${envSuffix}.env`, ...extra ]; }
/**
 * Create a Foundry service compose spec object.
 * Adds volumes, ports, env files, and secrets reference.
 * @param {Object} opts Options
 * @param {string} opts.name Container/service name
 * @param {string} opts.dir Version directory
 * @param {string} opts.image Fully qualified image reference
 * @param {string|number} opts.user User (uid:gid) string
 * @param {number} opts.port Host port mapping for Foundry (maps from BASE_PORT)
 * @param {number} opts.fetchStagger Delay seconds to avoid rate limits
 * @param {Array<Object>} [opts.secretsRef] Secrets mount definitions
 * @param {string} opts.envSuffix Environment file suffix
 * @param {Array<string>} [opts.extraEnv] Additional env key=value pairs
 * @param {Array<string>} [opts.extraEnvFiles] Additional env file paths
 * @param {Array<string|Object>} [opts.extraVolumes] Extra volume specs
 * @returns {Object} Compose service spec
 * @export
 */
function createFoundryService(opts) {
	const { name, dir, image, user, port, fetchStagger, secretsRef = [], envSuffix, extraEnv = [], extraEnvFiles = [], extraVolumes = [] } = opts;
  return {
    image,
    container_name: name,
    hostname: name,
    user: `${user}`,
    ports: [ `${port}:${BASE_PORT}` ],
    volumes: [ ...buildBaseVolumeMounts(name, dir), ...extraVolumes ],
    secrets: secretsRef,
    env_file: envFiles(envSuffix, extraEnvFiles),
    environment: [ `${FETCH_STAGGER_ENV}=${fetchStagger}`, ...extraEnv ]
  };
}
/**
 * Build experimental provider warning prefix.
 * @param {string} provider Provider id (gcp|azure|aws)
 * @returns {string} Warning string
 * @export
 */
function experimentalWarning(provider) {
  const map = { gcp: 'GCP', azure: 'Azure', aws: 'AWS' };
  const proper = map[provider.toLowerCase()] || provider;
  return `[experimental] ${proper} secrets mode is experimental and untested; behavior and interface may change.`;
}
/**
 * Build temporary secret file path.
 * @param {string} provider Provider suffix
 * @param {string} id Unique id
 * @returns {string} Absolute-ish /tmp path
 * @export
 */
function tempSecretPath(provider, id) { return `/tmp/secrets-${provider}-${id}.json`; }

/**
 * Resolve secrets configuration based on CLI/environment options.
 * Supports file, external, gcp, azure, aws and none modes (auto-detect when possible).
 * Returns top-level compose secrets map plus per-service reference array.
 * @param {Object} opts Parsed args/environment settings
 * @param {Function} retrieveGcpSecretFn Injection for testing (GCP secret getter)
 * @param {Function} retrieveAzureSecretFn Injection for testing (Azure secret getter)
 * @param {Function} retrieveAwsSecretFn Injection for testing (AWS secret getter)
 * @returns {{topLevel:Object, serviceRef:Array<Object>}} Secrets configuration result
 * @export
 */
function resolveSecrets(opts, retrieveGcpSecretFn = retrieveGcpSecret, retrieveAzureSecretFn = retrieveAzureSecret, retrieveAwsSecretFn = retrieveAwsSecret) {
  const mode = (opts.secretsMode || 'auto').toLowerCase();
  if (!SECRET_MODES.includes(mode)) throw new Error(`Unknown secrets mode: ${mode}`);
  if (mode === 'none') return { topLevel: {}, serviceRef: [] };
  const target = opts.secretsTarget || DEFAULT_SECRET_TARGET;

  // Explicit file mode or auto with an existing file on disk
  if (mode === 'file' || (mode === 'auto' && opts.secretsFile)) {
    const filePath = opts.secretsFile || './secrets.json';
    return {
      topLevel: { [SECRET_BASE_NAME]: { file: filePath } },
      serviceRef: [ { source: SECRET_BASE_NAME, target } ]
    };
  }

  if (mode === 'external' || (mode === 'auto' && opts.secretsExternalName)) {
    const name = opts.secretsExternalName || 'config_json';
    return {
      topLevel: { [name]: { external: true } },
      serviceRef: [ { source: name, target: opts.secretsTarget || 'config.json' } ],
    };
  }

  if (mode === 'gcp' || (mode === 'auto' && opts.secretsGcpProject && opts.secretsGcpSecret)) {
    console.warn('[experimental] GCP secrets mode is experimental and untested; behavior and interface may change.');
    const secretName = 'config_json_gcp';
    const gcpSecretFile = `/tmp/secrets-gcp-${nextTempId()}.json`;

    // Create a temporary file with the GCP secret content
    try {
      const secretContent = retrieveGcpSecretFn(opts.secretsGcpProject, opts.secretsGcpSecret);
      fs.writeFileSync(gcpSecretFile, secretContent, 'utf8');
    } catch (error) {
      throw new Error(`Failed to retrieve GCP secret: ${error.message}`);
    }

    return {
      topLevel: { [secretName]: { file: gcpSecretFile } },
      serviceRef: [ { source: secretName, target: opts.secretsTarget || 'config.json' } ],
    };
  }

  if (mode === 'azure' || (mode === 'auto' && opts.secretsAzureVault && opts.secretsAzureSecret)) {
    console.warn('[experimental] Azure secrets mode is experimental and untested; behavior and interface may change.');
    const secretName = 'config_json_azure';
    const azureSecretFile = `/tmp/secrets-azure-${nextTempId()}.json`;

    // Create a temporary file with the Azure secret content
    try {
      const secretContent = retrieveAzureSecretFn(opts.secretsAzureVault, opts.secretsAzureSecret);
      fs.writeFileSync(azureSecretFile, secretContent, 'utf8');
    } catch (error) {
      throw new Error(`Failed to retrieve Azure secret: ${error.message}`);
    }

    return {
      topLevel: { [secretName]: { file: azureSecretFile } },
      serviceRef: [ { source: secretName, target: opts.secretsTarget || 'config.json' } ],
    };
  }

  if (mode === 'aws' || (mode === 'auto' && opts.secretsAwsRegion && opts.secretsAwsSecret)) {
    console.warn('[experimental] AWS secrets mode is experimental and untested; behavior and interface may change.');
    const secretName = 'config_json_aws';
    const awsSecretFile = `/tmp/secrets-aws-${nextTempId()}.json`;

    // Create a temporary file with the AWS secret content
    try {
      const secretContent = retrieveAwsSecretFn(opts.secretsAwsRegion, opts.secretsAwsSecret);
      fs.writeFileSync(awsSecretFile, secretContent, 'utf8');
    } catch (error) {
      throw new Error(`Failed to retrieve AWS secret: ${error.message}`);
    }

    return {
      topLevel: { [secretName]: { file: awsSecretFile } },
      serviceRef: [ { source: secretName, target: opts.secretsTarget || 'config.json' } ],
    };
  }
  // fallthrough to unified secrets logic below
  // No other modes matched; default to file mode fallback using provided secretsFile
  if (opts.secretsFile) {
    return {
      topLevel: { [SECRET_BASE_NAME]: { file: opts.secretsFile } },
      serviceRef: [ { source: SECRET_BASE_NAME, target } ]
    };
  }
  return { topLevel: {}, serviceRef: [] };
}

/**
 * Retrieve a secret's latest version from GCP Secret Manager (safer variant).
 * Backwards compatible with prior 2-arg signature (project, secretName).
 * @param {string} project GCP project ID
 * @param {string} secretName Secret name in Secret Manager
 * @param {Function} [execFn=execFileSync] Injectable exec function for tests
 * @returns {string} Secret value (utf8, trimmed)
 * @export
 */
function retrieveGcpSecret(project, secretName, execFn = execFileSync) {
  if (typeof project !== 'string' || !project.trim()) throw new Error('GCP project must be a non-empty string');
  if (typeof secretName !== 'string' || !secretName.trim()) throw new Error('GCP secret name must be a non-empty string');
  const trimmedProject = project.trim();
  const trimmedSecret = secretName.trim();
  const args = [ 'secrets', 'versions', 'access', 'latest', `--secret=${trimmedSecret}`, `--project=${trimmedProject}` ];
  try {
  const out = execFn('gcloud', args, { encoding: 'utf8', timeout: getSecretsCliTimeoutMs(), env: { ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: '1' } });
    return typeof out === 'string' ? out.trimEnd() : out;
  } catch (err) {
    throw new Error(`GCP secret retrieval failed (project=${trimmedProject}, secret=${trimmedSecret}): ${err.message}`);
  }
}

/**
 * Fetch secret value from Azure Key Vault.
 * @param {string} vaultName Key Vault name
 * @param {string} secretName Secret identifier
 * @returns {string} Secret value
 * @export
 */
function retrieveAzureSecret(vaultName, secretName, execFn = execFileSync) {
  if (typeof vaultName !== 'string' || !vaultName.trim()) throw new Error('Azure vault name must be a non-empty string');
  if (typeof secretName !== 'string' || !secretName.trim()) throw new Error('Azure secret name must be a non-empty string');
  const v = vaultName.trim();
  const s = secretName.trim();
  const args = ['keyvault', 'secret', 'show', '--vault-name', v, '--name', s, '--query', 'value', '--output', 'tsv'];
  try {
  const out = execFn('az', args, { encoding: 'utf8', timeout: getSecretsCliTimeoutMs(), env: { ...process.env, AZURE_CORE_ONLY_SHOW_ERRORS: '1' } });
    return typeof out === 'string' ? out.trimEnd() : out;
  } catch (err) {
    throw new Error(`Azure secret retrieval failed (vault=${v}, secret=${s}): ${err.message}`);
  }
}

/**
 * Fetch secret value from AWS Secrets Manager.
 * @param {string} region AWS region
 * @param {string} secretName Secret id/name
 * @returns {string} Secret JSON/string value
 * @export
 */
function retrieveAwsSecret(region, secretName, execFn = execFileSync) {
  if (typeof region !== 'string' || !region.trim()) throw new Error('AWS region must be a non-empty string');
  if (typeof secretName !== 'string' || !secretName.trim()) throw new Error('AWS secret name must be a non-empty string');
  const r = region.trim();
  const s = secretName.trim();
  const args = ['secretsmanager', 'get-secret-value', '--region', r, '--secret-id', s, '--query', 'SecretString', '--output', 'text'];
  try {
  const out = execFn('aws', args, { encoding: 'utf8', timeout: getSecretsCliTimeoutMs(), env: { ...process.env, AWS_PAGER: '' } });
    return typeof out === 'string' ? out.trimEnd() : out;
  } catch (err) {
    throw new Error(`AWS secret retrieval failed (region=${r}, secret=${s}): ${err.message}`);
  }
}

/**
 * Convert an object of key/value pairs into an array of key=value strings for compose.
 * @param {Object|number|undefined} envObjOrNumber Possibly environment object
 * @returns {string[]} Environment entries list
 * @export
 */
function toEnvList(envObjOrNumber) {
  if (envObjOrNumber && typeof envObjOrNumber === 'object' && !Array.isArray(envObjOrNumber)) {
    return Object.entries(envObjOrNumber).map(([k, v]) => `${k}=${v}`);
  }
  return [];
}
/**
 * Resolve a templated string by replacing VERSION placeholder.
 * @param {string|undefined} template Raw template
 * @param {number} version Version number
 * @returns {string|undefined} Resolved result
 * @export
 */
function resolveTemplatedString(template, version) { return applyVersionTemplate(template, version); }
/**
 * Resolve a templated number given a raw value or templated string.
 * @param {string|number|undefined} value Raw number or template containing VERSION
 * @param {number} version Version number
 * @returns {number|undefined} Resolved numeric value if valid
 * @export
 */
function resolveTemplatedNumber(value, version) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const s = value.replaceAll(VERSION_PLACEHOLDER, String(version));
    const n = Number(s);
    if (!Number.isNaN(n)) {
      return n;
    }
  }
  return undefined;
}

/**
 * Build docker compose structure from explicit compose-style configuration (advanced mode).
 * @param {ComposeConfig} config Compose config object
 * @param {{topLevel:Object, serviceRef:Array<Object>}} secretsConf Secrets resolution result
 * @returns {{secrets:Object, volumes:Object, services:Object}} Compose root object
 * @export
 */
function buildComposeFromComposeConfig(config, secretsConf) {
  const secrets = secretsConf.topLevel || {};
  const volumes = {};
  const services = {};
  for (const v of config.versions || []) {
    const name = v.name;
    const dir = v.versionDir;
    if (!name || !dir) throw new Error(`Version entries must include name and versionDir: ${JSON.stringify(v)}`);
    let imageTag;
    // Use explicit tag if provided and non-empty
    if (typeof v.tag === 'string' && v.tag !== '') {
      imageTag = v.tag;
    }
    // If versionDir matches "vNN", use NN as tag
    else if (typeof v.versionDir === 'string' && /^v\d+$/.test(v.versionDir)) {
      imageTag = v.versionDir.replace(/^v/, '');
    }
    // Fallback: use dir with "v" stripped
    else {
      imageTag = dir.replace(/^v/, '');
    }
    const repo = config.baseImage || FALLBACK_IMAGE;
    const image = composeImage(repo, imageTag);
    const user = v.user || config.user || DEFAULT_USER;
    const port = v.port || BASE_PORT;
    const envSuffix = v.envSuffix || dir;
    const fetchStagger = v.fetchStaggerSeconds ?? FETCH_STAGGER_DEFAULTS.none;
    volumes[`${name}-data`] = null;
    services[name] = createFoundryService({ name, dir, image, user, port, fetchStagger, secretsRef: secretsConf.serviceRef || [], envSuffix });
  }
  if (config.builder?.enabled !== false) {
    services.builder = { ...DEFAULT_BUILDER, image: (config.builder && config.builder.image) || DEFAULT_BUILDER.image };
  }
  return { secrets, volumes, services };
}

/**
 * Derive default + overridden values for a single version entry from container-config.
 * @param {Object} versionParams Global version params template (comp.version_params)
 * @param {number} intVer Parsed integer version
 * @param {Object} compParams Per-version composition_params
 * @returns {Object} Derived values (name, dir, tag, port, envSuffix, fetchStagger)
 * @export
 */
function deriveVersionDefaults(versionParams, intVer, compParams) {
  const defName = resolveTemplatedString(versionParams.name, intVer) || `foundry-v${intVer}`;
  const defDir = resolveTemplatedString(versionParams.versionDir, intVer) || `v${intVer}`;
  const resolvedTag = resolveTemplatedString(versionParams.tag, intVer);
  const defTag = (typeof resolvedTag === 'string' && resolvedTag !== '') ? resolvedTag : defaultTag(intVer);
  const defPort = resolveTemplatedNumber(versionParams.port, intVer) ?? (BASE_PORT + intVer);
  const name = typeof compParams.name === 'string' && compParams.name ? compParams.name : defName;
  const dir = typeof compParams.versionDir === 'string' && compParams.versionDir ? compParams.versionDir : defDir;
  const tag = typeof compParams.tag === 'string' && compParams.tag ? compParams.tag : defTag;
  const port = typeof compParams.port === 'number' ? compParams.port : defPort;
  const envSuffix = typeof compParams.envSuffix === 'string' && compParams.envSuffix ? compParams.envSuffix : dir;
  const fetchStagger = typeof compParams.fetchStaggerSeconds === 'number' ? compParams.fetchStaggerSeconds : defaultFetchStagger(intVer);
  return { name, dir, tag, port, envSuffix, fetchStagger };
}

/**
 * Build compose service entry (including extra env, volumes) for a version.
 * @param {Object} derived Derived version defaults
 * @param {Object} compParams composition_params object
 * @param {string} baseImageRepo Base image repository
 * @param {string|number} user User id:group id
 * @param {Array<Object>} secretsRef Secrets reference array
 * @returns {Object} Compose service spec
 * @export
 */
function buildServiceEntry(derived, compParams, baseImageRepo, user, secretsRef) {
  const { name, dir, tag, port, envSuffix, fetchStagger } = derived;
  let extraEnv = [];
  if (compParams.environment) {
    if (Array.isArray(compParams.environment)) extraEnv = compParams.environment;
    else if (typeof compParams.environment === 'object') extraEnv = toEnvList(compParams.environment);
  }
  const extraEnvFiles = Array.isArray(compParams.env_files) ? compParams.env_files : [];
  const extraVolumes = Array.isArray(compParams.volumes_extra) ? compParams.volumes_extra : [];
  return createFoundryService({ name, dir, image: composeImage(baseImageRepo, tag), user, port, fetchStagger, secretsRef, envSuffix, extraEnv, extraEnvFiles, extraVolumes });
}

/**
 * Build docker compose structure from container-config (primary recommended mode).
 * @param {ContainerConfig} containerCfg Container-config JSON object
 * @param {Object} opts Override options (env driven)
 * @param {{baseImage?:string,user?:string,builderEnabled?:boolean,builderImage?:string}} opts Options overrides
 * @param {{topLevel:Object, serviceRef:Array<Object>}} secretsConf Secrets resolution result
 * @returns {{secrets:Object, volumes:Object, services:Object}} Compose root object
 * @export
 */
function buildComposeFromContainerConfig(containerCfg, opts = {}, secretsConf) {
  const secrets = secretsConf.topLevel || {};
  const volumes = {};
  const services = {};
  const comp = containerCfg.composition || {};
  const baseImageRepo = opts.baseImage || comp.baseImage || FALLBACK_IMAGE;
  const user = opts.user || comp.user || DEFAULT_USER;
  const versionParams = comp.version_params || {};
  const versions = containerCfg.versions || {};
  for (const [ver, conf] of Object.entries(versions)) {
    if (conf?.supported === false) continue;
    const intVer = parseInt(ver, 10);
    if (Number.isNaN(intVer)) continue;
    const compParams = conf.composition_params || {};
    const derived = deriveVersionDefaults(versionParams, intVer, compParams);
    volumes[`${derived.name}-data`] = null;
    services[derived.name] = buildServiceEntry(derived, compParams, baseImageRepo, user, secretsConf.serviceRef || []);
  }
  const builderEnabledDefault = comp.builder?.enabled !== false;
  const builderImageDefault = comp.builder?.image || DEFAULT_BUILDER.image;
  if (opts.builderEnabled !== false && builderEnabledDefault !== false) {
    services.builder = { ...DEFAULT_BUILDER, image: opts.builderImage || builderImageDefault };
  }
  return { secrets, volumes, services };
}

/**
 * CLI entrypoint for generating docker compose YAML.
 * Handles config detection, validation, secrets resolution, output writing, and dry-run.
 * Exits process with code 1 on validation or runtime errors.
 * @export
 */
function main() {
  const args = parseArgs(process.argv);
  if (args.secretsCliTimeout) setSecretsCliTimeoutMs(args.secretsCliTimeout);
  const { config: confPath, out, dryRun } = args;
  const absConf = path.resolve(confPath);
  if (!fs.existsSync(absConf)) {
    console.error(`Config file not found: ${absConf}`);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(absConf, 'utf8'));
  const looksLikeContainerConfig = cfg && typeof cfg === 'object' && cfg.systems && cfg.modules && cfg.versions && !Array.isArray(cfg.versions);
  if (looksLikeContainerConfig) {
    const validationResult = validateConfig(absConf);
    if (!validationResult.valid) {
      console.error('Configuration validation failed:');
      validationResult.errors.forEach(error => console.error(`  ${error}`));
      process.exit(1);
    }
  }
  const secretsConf = resolveSecrets(args);
  const compose = looksLikeContainerConfig
    ? buildComposeFromContainerConfig(cfg, {
        baseImage: process.env.COMPOSE_BASE_IMAGE,
        user: process.env.COMPOSE_USER,
        builderEnabled: process.env.COMPOSE_BUILDER_ENABLED !== '0',
        builderImage: process.env.COMPOSE_BUILDER_IMAGE
      }, secretsConf)
    : buildComposeFromComposeConfig(cfg, secretsConf);
  const yml = yaml.dump(compose, { noRefs: true, lineWidth: 120 });
  if (dryRun) {
    console.log('[dry-run] Would generate compose YAML from config:', absConf);
    if (out) {
      const absOut = path.resolve(out);
      console.log(`[dry-run] Would write to: ${absOut}`);
    } else {
			console.log('[dry-run] Would write to: stdout');
		}
    console.log(`[dry-run] Generated YAML size: ${yml.length} characters`);
    return;
  }
  if (out) { const absOut = path.resolve(out); fs.writeFileSync(absOut, yml, 'utf8'); console.log(`Wrote ${absOut}`); }
  else {
    process.stdout.write(yml);
  }
}

// Export functions for testing (single definitive export object)
export {
	// Constants
	FALLBACK_IMAGE,
	BASE_PORT,
	DEFAULT_USER,
	FETCH_STAGGER_ENV,
	VERSION_PLACEHOLDER,
	DEFAULT_SECRET_TARGET,
	SECRET_BASE_NAME,
	SECRET_PROVIDER_SUFFIX,
	SECRET_MODES,
	FETCH_STAGGER_DEFAULTS,
	DEFAULT_BUILDER,
  SECRET_CLI_TIMEOUT_MS,
  getSecretsCliTimeoutMs,
  setSecretsCliTimeoutMs,
	PATHS,
	// Helpers
	composeImage,
	defaultTag,
	defaultFetchStagger,
	applyVersionTemplate,
	buildBaseVolumeMounts,
	envFiles,
	createFoundryService,
	experimentalWarning,
	tempSecretPath,
  deriveVersionDefaults,
  buildServiceEntry,
	// Existing API
	parseArgs,
	resolveSecrets,
	retrieveGcpSecret,
	retrieveAzureSecret,
	retrieveAwsSecret,
	toEnvList,
	resolveTemplatedString,
	resolveTemplatedNumber,
	buildComposeFromComposeConfig,
	buildComposeFromContainerConfig,
	main
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (e) {
    function isProduction() {
      return process.env.NODE_ENV === 'production';
    }

    function redactSensitive(str) {
      if (!str) return str;
      const SENSITIVE_KEYS = [
      'TOKEN', 'PASSWORD', 'SECRET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
      'AZURE_CLIENT_SECRET', 'GOOGLE_APPLICATION_CREDENTIALS'
      ];
      let out = String(str);
      for (const [k, v] of Object.entries(process.env)) {
      if (!v || typeof v !== 'string') continue;
      if (!SENSITIVE_KEYS.some(sk => k.toUpperCase().includes(sk))) continue;
      const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(esc, 'g'), '***');
      }
      return out;
    }

    function formatError(e) {
      if (isProduction()) {
      const msg = (e && e.message) ? redactSensitive(e.message) : 'Unexpected error';
      return `Error: ${msg}`;
      }
      return redactSensitive(e && e.stack ? e.stack : String(e));
    }

    console.error(formatError(e));
    process.exit(1);
  }
}
