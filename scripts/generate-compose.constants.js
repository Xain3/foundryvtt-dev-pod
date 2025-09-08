/**
 * @file generate-compose.constants.js
 * @description Exports constants and defaults specific to `generate-compose.js`, sourced from the central configuration module.
 * @deprecated Use `config/config.js` overrides directly in `generate-compose.js` instead. Kept for backwards compatibility.
 * @path scripts/generate-compose.constants.js
 */

import config from '../config/config.js';

// ---------------------------------------------------------------------------
// Core constants & defaults
// (kept from backwards compatibility; prefer config/config.js overrides)
// ---------------------------------------------------------------------------
const gcConst = config.constants.generateCompose || {};
const gcDefaults = config.defaults.generateCompose || {};

const FALLBACK_IMAGE = gcDefaults.foundryBaseImage || 'felddy/foundryvtt';
const BASE_PORT = gcConst.basePort || 30000;
const DEFAULT_USER = gcConst.defaultUser || '0:0';
const FETCH_STAGGER_ENV = gcConst.fetchStaggerEnv || 'FETCH_STAGGER_SECONDS';
const VERSION_PLACEHOLDER = gcConst.versionPlaceholder || '{version}';
const DEFAULT_SECRET_TARGET = gcConst.defaultSecretTarget || 'config.json';
const SECRET_BASE_NAME = gcConst.secretBaseName || 'config_json';
const SECRET_PROVIDER_SUFFIX = Object.freeze(gcConst.secretProviderSuffix || { gcp: 'gcp', azure: 'azure', aws: 'aws' });
const SECRET_MODES = Object.freeze(gcConst.secretModes || [ 'file', 'external', 'gcp', 'azure', 'aws', 'none', 'auto' ]);
const FETCH_STAGGER_DEFAULTS = Object.freeze(gcDefaults.fetchStaggerDefaults || { high: 4, mid: 2, none: 0 });
const DEFAULT_BUILDER = Object.freeze(gcDefaults.defaultBuilder || { image: 'node:20-alpine', enabled: true });

// Timeout (ms) for cloud CLI secret retrieval commands (gcloud/az/aws)
// Environment override: COMPOSE_SECRETS_CLI_TIMEOUT_MS
// Default fallback remains 8000ms for backwards compatibility
const SECRET_CLI_TIMEOUT_MS = gcConst.secretCliTimeoutMs || 8000;

// Common bind path targets (sources vary per version dir)
const PATHS = Object.freeze(gcConst.paths || {
  configFileSource: './container-config.json',
  configFileTarget: '/config/container-config.json',
  distSource: './dist',
  distTarget: '/host/dist',
  patchesSource: './patches',
  patchesTarget: '/container_patches',
  sharedBase: './shared',
  sharedTarget: '/host/shared',
  resourcesBase: './resources',
  resourcesTarget: '/host/resources',
  cacheBase: './foundry-cache',
  cacheTarget: '/data/container_cache'
});

const argsFallbacks = gcDefaults.argsFallbacks || {
  config: 'container-config.json',
  out: '',
  dryRun: false,
  secretsMode: 'auto',
  secretsFile: './secrets.json',
  secretsExternalName: '',
  secretsTarget: DEFAULT_SECRET_TARGET,
  secretsGcpProject: '',
  secretsGcpSecret: '',
  secretsAzureVault: '',
  secretsAzureSecret: '',
  secretsAwsRegion: '',
  secretsAwsSecret: '',
  secretsCliTimeout: ''
};

export {
  gcConst,
  gcDefaults,
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
};
