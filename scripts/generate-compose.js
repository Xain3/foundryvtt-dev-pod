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
 * 1) Container config (recommended): `container-config.json` — the single source of truth used by runtime patches
 * 2) Advanced compose config: `compose.config.json` — direct control over services with explicit fields
 *
 * CLI usage (zsh):
 *  node scripts/generate-compose.js -c container-config.json -o compose.dev.yml
 *  node scripts/generate-compose.js --print               # print to stdout
 *  node scripts/generate-compose.js --dry-run             # show what would be done
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
 *  - Image tag: >= v13 -> :release; v12 -> :12; v11 -> :11 (subject to image availability)
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
import { execSync, execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { validateConfig } from './validate-config.js';

function parseArgs(argv) {
	const args = {
		config: 'container-config.json',
		out: '',
		dryRun: false,
		secretsMode: process.env.COMPOSE_SECRETS_MODE || 'auto',
		secretsFile: process.env.COMPOSE_SECRETS_FILE || './secrets.json',
		secretsExternalName: process.env.COMPOSE_SECRETS_EXTERNAL_NAME || '',
		secretsTarget: process.env.COMPOSE_SECRETS_TARGET || 'config.json',
		secretsGcpProject: process.env.COMPOSE_SECRETS_GCP_PROJECT || '',
		secretsGcpSecret: process.env.COMPOSE_SECRETS_GCP_SECRET || '',
		secretsAzureVault: process.env.COMPOSE_SECRETS_AZURE_VAULT || '',
		secretsAzureSecret: process.env.COMPOSE_SECRETS_AZURE_SECRET || '',
		secretsAwsRegion: process.env.COMPOSE_SECRETS_AWS_REGION || '',
		secretsAwsSecret: process.env.COMPOSE_SECRETS_AWS_SECRET || '',
	};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if ((a === '-c' || a === '--config') && argv[i + 1]) {
			args.config = argv[++i];
		} else if ((a === '-o' || a === '--out') && argv[i + 1]) {
			args.out = argv[++i];
		} else if (a === '--print') {
			args.out = '';
		} else if (a === '--dry-run' || a === '-n') {
			args.dryRun = true;
		} else if (a === '--secrets-mode' && argv[i + 1]) {
			args.secretsMode = argv[++i];
		} else if (a === '--secrets-file' && argv[i + 1]) {
			args.secretsFile = argv[++i];
		} else if (a === '--secrets-external' && argv[i + 1]) {
			args.secretsExternalName = argv[++i];
		} else if (a === '--secrets-target' && argv[i + 1]) {
			args.secretsTarget = argv[++i];
		} else if (a === '--secrets-gcp-project' && argv[i + 1]) {
			args.secretsGcpProject = argv[++i];
		} else if (a === '--secrets-gcp-secret' && argv[i + 1]) {
			args.secretsGcpSecret = argv[++i];
		} else if (a === '--secrets-azure-vault' && argv[i + 1]) {
			args.secretsAzureVault = argv[++i];
		} else if (a === '--secrets-azure-secret' && argv[i + 1]) {
			args.secretsAzureSecret = argv[++i];
		} else if (a === '--secrets-aws-region' && argv[i + 1]) {
			args.secretsAwsRegion = argv[++i];
		} else if (a === '--secrets-aws-secret' && argv[i + 1]) {
			args.secretsAwsSecret = argv[++i];
		}
	}
	return args;
}

let __secretTempCounter = 0;
function nextTempId() {
	const now = Date.now();
	// Increment counter to avoid collisions when called multiple times within the same ms
	__secretTempCounter = (__secretTempCounter + 1) & 0xffff; // keep it bounded
	// Only digits to satisfy existing test regex expectations
	return `${now}${__secretTempCounter}`;
}

function resolveSecrets(opts, retrieveGcpSecretFn = retrieveGcpSecret, retrieveAzureSecretFn = retrieveAzureSecret, retrieveAwsSecretFn = retrieveAwsSecret) {
	const mode = (opts.secretsMode || 'auto').toLowerCase();

	if (mode === 'none') {
		return { topLevel: {}, serviceRef: [] };
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

	return {
		topLevel: { config_json: { file: opts.secretsFile || './secrets.json' } },
		serviceRef: [ { source: 'config_json', target: opts.secretsTarget || 'config.json' } ],
	};
}

function retrieveGcpSecret(project, secretName) {
	return execFileSync(
		"gcloud",
		["secrets", "versions", "access", "latest", "--secret=" + secretName, "--project=" + project],
		{ encoding: 'utf8' }
	);
}

function retrieveAzureSecret(vaultName, secretName) {
	const azureCommand = `az keyvault secret show --vault-name "${vaultName}" --name "${secretName}" --query value --output tsv`;
	return execSync(azureCommand, { encoding: 'utf8' });
}

function retrieveAwsSecret(region, secretName) {
	const awsCommand = `aws secretsmanager get-secret-value --region "${region}" --secret-id "${secretName}" --query SecretString --output text`;
	return execSync(awsCommand, { encoding: 'utf8' });
}

function toEnvList(envObjOrNumber) {
	if (envObjOrNumber && typeof envObjOrNumber === 'object' && !Array.isArray(envObjOrNumber)) {
		return Object.entries(envObjOrNumber).map(([k, v]) => `${k}=${v}`);
	}
	return [];
}

function resolveTemplatedString(template, version) {
	if (typeof template !== 'string') return undefined;
	return template.replaceAll('{version}', String(version));
}

function resolveTemplatedNumber(value, version) {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const s = value.replaceAll('{version}', String(version));
		const n = Number(s);
		if (!Number.isNaN(n)) return n;
	}
	return undefined;
}

function buildComposeFromComposeConfig(config, secretsConf) {
	const secrets = secretsConf.topLevel || {};

	const volumes = {};
	const services = {};

	for (const v of config.versions || []) {
		const name = v.name;
		const dir = v.versionDir;
		if (!name || !dir) throw new Error(`Version entries must include name and versionDir: ${JSON.stringify(v)}`);

		// Prefer an explicit tag if provided; if tag is missing or empty,
		// fall back to the numeric version directory when available.
		let imageTag;
		if (typeof v.tag === 'string' && v.tag !== '') {
			imageTag = v.tag;
		} else if (typeof v.versionDir === 'string' && /^v\d+$/.test(v.versionDir)) {
			imageTag = v.versionDir.replace(/^v/, '');
		} else {
			throw new Error(`Invalid versionDir format for service "${name}": "${v.versionDir}". Expected format "vNN".`);
		}
		const image = `${config.baseImage || 'felddy/foundryvtt'}:${imageTag}`;
		const user = v.user || config.user || '0:0';
		const port = v.port || 30000;
		const envSuffix = v.envSuffix || dir;
		const fetchStagger = v.fetchStaggerSeconds ?? 0;

		volumes[`${name}-data`] = null;

		services[name] = {
			image,
			container_name: name,
			hostname: name,
			user: `${user}`,
			ports: [ `${port}:30000` ],
			volumes: [
				`${name}-data:/data`,
				{ type: 'bind', source: './container-config.json', target: '/config/container-config.json', read_only: true },
				{ type: 'bind', source: './dist', target: '/host/dist', read_only: true },
				{ type: 'bind', source: './patches', target: '/container_patches' },
				{ type: 'bind', source: `./shared/${dir}`, target: '/host/shared', read_only: false },
				{ type: 'bind', source: `./resources/${dir}`, target: '/host/resources', read_only: true },
				{ type: 'bind', source: `./foundry-cache/${dir}`, target: '/data/container_cache' },
			],
			secrets: secretsConf.serviceRef || [],
			env_file: [ './env/.env', `./env/.${envSuffix}.env` ],
			environment: [ `FETCH_STAGGER_SECONDS=${fetchStagger}` ],
		};
	}

	if (config.builder?.enabled !== false) {
		services['builder'] = {
			image: (config.builder && config.builder.image) || 'node:20-alpine',
			container_name: 'module-builder',
			working_dir: '/work',
			command: 'sh -c "npm ci && npx vite build --watch"',
			volumes: [ '../:/work' ],
			restart: 'unless-stopped',
		};
	}

	return { secrets, volumes, services };
}

function buildComposeFromContainerConfig(containerCfg, opts = {}, secretsConf) {
	const secrets = secretsConf.topLevel || {};
	const volumes = {};
	const services = {};

	const comp = containerCfg.composition || {};
	const baseImage = opts.baseImage || comp.baseImage || 'felddy/foundryvtt';
	const user = opts.user || comp.user || '0:0';
	const vp = comp.version_params || {};

	const versions = containerCfg.versions || {};
	for (const [ver, conf] of Object.entries(versions)) {
		const supported = conf?.supported !== false;
		if (!supported) continue;
		const intVer = parseInt(ver, 10);
		if (Number.isNaN(intVer)) continue;
		const cp = conf.composition_params || {};

		const defName = resolveTemplatedString(vp.name, intVer) || `foundry-v${intVer}`;
		const defDir = resolveTemplatedString(vp.versionDir, intVer) || `v${intVer}`;
		// If a tag template is provided, use it. If it's an empty string or missing,
		// fall back to the numeric version string (e.g. '13'). Previously this
		// defaulted to 'release' for >=13 which could be surprising when an
		// explicit tag was omitted — prefer explicitness by using the version.
		const resolvedTag = resolveTemplatedString(vp.tag, intVer);
		const defTag = (typeof resolvedTag === 'string' && resolvedTag !== '') ? resolvedTag : `${intVer}`;
		const defPort = resolveTemplatedNumber(vp.port, intVer) ?? (30000 + intVer);

		const name = typeof cp.name === 'string' && cp.name ? cp.name : defName;
		const dir = typeof cp.versionDir === 'string' && cp.versionDir ? cp.versionDir : defDir;
		const tag = typeof cp.tag === 'string' && cp.tag ? cp.tag : defTag;
		const port = typeof cp.port === 'number' ? cp.port : defPort;
		const envSuffix = typeof cp.envSuffix === 'string' && cp.envSuffix ? cp.envSuffix : dir;
		const stagger = typeof cp.fetchStaggerSeconds === 'number' ? cp.fetchStaggerSeconds : (intVer >= 13 ? 4 : intVer === 12 ? 2 : 0);

		volumes[`${name}-data`] = null;
		const baseService = {
			image: `${baseImage}:${tag}`,
			container_name: name,
			hostname: name,
			user: `${user}`,
			ports: [ `${port}:30000` ],
			volumes: [
				`${name}-data:/data`,
				{ type: 'bind', source: './container-config.json', target: '/config/container-config.json', read_only: true },
				{ type: 'bind', source: './dist', target: '/host/dist', read_only: true },
				{ type: 'bind', source: './patches', target: '/container_patches' },
				{ type: 'bind', source: `./shared/${dir}`, target: '/host/shared', read_only: false },
				{ type: 'bind', source: `./resources/${dir}`, target: '/host/resources', read_only: true },
				{ type: 'bind', source: `./foundry-cache/${dir}`, target: '/data/container_cache' }
			],
			secrets: secretsConf.serviceRef || [],
			env_file: [ './env/.env', `./env/.${envSuffix}.env` ],
			environment: [ `FETCH_STAGGER_SECONDS=${stagger}` ],
		};

		if (Array.isArray(cp.env_files) && cp.env_files.length) {
			baseService.env_file = [...baseService.env_file, ...cp.env_files];
		}
		if (cp.environment) {
			if (Array.isArray(cp.environment)) {
				baseService.environment = [...baseService.environment, ...cp.environment];
			} else if (typeof cp.environment === 'object') {
				baseService.environment = [...baseService.environment, ...toEnvList(cp.environment)];
			}
		}
		if (Array.isArray(cp.volumes_extra) && cp.volumes_extra.length) {
			baseService.volumes = [...baseService.volumes, ...cp.volumes_extra];
		}

		services[name] = baseService;
	}

	const builderEnabledDefault = comp.builder?.enabled !== false;
	const builderImageDefault = comp.builder?.image || 'node:20-alpine';
	if (opts.builderEnabled !== false && builderEnabledDefault !== false) {
		services['builder'] = {
			image: opts.builderImage || builderImageDefault,
			container_name: 'module-builder',
			working_dir: '/work',
			command: 'sh -c "npm ci && npx vite build --watch"',
			volumes: [ '../:/work' ],
			restart: 'unless-stopped',
		};
	}

	return { secrets, volumes, services };
}

function main() {
	const args = parseArgs(process.argv);
	const { config: confPath, out, dryRun } = args;
	const absConf = path.resolve(confPath);
	if (!fs.existsSync(absConf)) {
		console.error(`Config file not found: ${absConf}`);
		process.exit(1);
	}
	const cfg = JSON.parse(fs.readFileSync(absConf, 'utf8'));

	// Validate configuration if it looks like a container config
	const looksLikeContainerConfig = cfg && typeof cfg === 'object' && cfg.systems && cfg.modules && cfg.versions && !Array.isArray(cfg.versions);
	if (looksLikeContainerConfig) {
		const validationResult = validateConfig(absConf);
		if (!validationResult.valid) {
			console.error('Configuration validation failed:');
			validationResult.errors.forEach(error => {
				console.error(`  ${error}`);
			});
			process.exit(1);
		}
	}
	const secretsConf = resolveSecrets(args);
	let compose;
	if (looksLikeContainerConfig) {
		compose = buildComposeFromContainerConfig(cfg, {
			baseImage: process.env.COMPOSE_BASE_IMAGE,
			user: process.env.COMPOSE_USER,
			builderEnabled: process.env.COMPOSE_BUILDER_ENABLED !== '0',
			builderImage: process.env.COMPOSE_BUILDER_IMAGE,
		}, secretsConf);
	} else {
		compose = buildComposeFromComposeConfig(cfg, secretsConf);
	}
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
	if (out) {
		const absOut = path.resolve(out);
		fs.writeFileSync(absOut, yml, 'utf8');
		console.log(`Wrote ${absOut}`);
	} else {
		process.stdout.write(yml);
	}
}

// Export functions for testing (single definitive export object)
export {
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
  try { main(); } catch (e) { console.error(e?.stack || String(e)); process.exit(1); }
}
