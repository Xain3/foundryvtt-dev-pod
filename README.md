# FoundryVTT Dev Pod CLI <!-- omit in toc -->

Minimal CLI for working with local multi-version Foundry containers during module development.

## Overview <!-- omit in toc -->

This repo provides a set of scripts to generate Docker Compose configurations, manage Foundry VTT development pods, and validate configuration files.
It leverages Docker for containerization and supports multiple Foundry versions thanks to the excellent [felddy/foundryvtt-docker](https://github.com/felddy/foundryvtt-docker) project.

**Contents:**

- [Quickstart](#quickstart)
- [Concepts](#concepts)
- [Generated Defaults (container-config mode)](#generated-defaults-container-config-mode)
- [CLI Reference](#cli-reference)
  - [`fvtt-compose-gen` (`scripts/generate-compose.js`)](#fvtt-compose-gen-scriptsgenerate-composejs)
  - [`fvtt-pod` (`scripts/pod-handler.sh`)](#fvtt-pod-scriptspod-handlersh)
  - [`scripts/validate-config.js`](#scriptsvalidate-configjs)
  - [`scripts/validate-package-json.js`](#scriptsvalidate-package-jsonjs)
  - [`scripts/validate-package.sh`](#scriptsvalidate-packagesh)
- [Configuration Validation \& Caching](#configuration-validation--caching)
- [Secrets Modes](#secrets-modes)
- [Builder Service](#builder-service)
- [Development Workflow](#development-workflow)
  - [Using Path Aliases](#using-path-aliases)
- [Testing \& Coverage](#testing--coverage)
  - [Editor (VSCode) Jest Setup](#editor-vscode-jest-setup)
- [Publishing Note](#publishing-note)
- [Acknowledgments](#acknowledgments)

## Quickstart

- Generate compose from `container-config.json`:

  ```zsh
  npx fvtt-compose-gen -c container-config.json -o compose.dev.yml
  ```

- Start services and tail logs:

  ```zsh
  npx fvtt-pod up -d
  npx fvtt-pod logs -f foundry-v13
  ```

## Concepts

Two config input shapes are supported by `fvtt-compose-gen`:

1. Container config (recommended) – single source of truth (`container-config.json`) that drives install lists (systems/modules/worlds) and version-specific composition parameters.
2. Advanced compose config – explicit compose-like JSON (`compose.config.json`) giving direct control over service entries (rare / power users).

## Generated Defaults (container-config mode)

- Service name pattern: `foundry-v<NN>`
- Version directory: `v<NN>`
- Port mapping: host `30000+<NN>` -> container `30000`
- Image tag: numeric version unless template overrides
- Fetch stagger seconds: v13=4, v12=2, others=0
- Volumes: data volume + binds for config, dist, patches, shared, resources, cache
- Builder service: included unless disabled (image defaults to `node:20-alpine`)

## CLI Reference

### `fvtt-compose-gen` (`scripts/generate-compose.js`)

Flags:

```text
-c, --config <file>          Config file path (default: container-config.json)
-o, --out <file>             Write output to file (omit => stdout)
--print                      Force stdout output
--dry-run, -n                Show actions without writing
--secrets-mode <mode>        file|external|gcp|azure|aws|none|auto (default: auto)
--secrets-file <file>        Path for file secrets mode (./secrets.json)
--secrets-external <name>    External secret name (docker/Swarm)
--secrets-target <path>      In-container target (default: config.json)
--secrets-gcp-project <id>   GCP project id
--secrets-gcp-secret <name>  GCP Secret Manager name
--secrets-azure-vault <v>    Azure Key Vault name
--secrets-azure-secret <n>   Azure secret name
--secrets-aws-region <r>     AWS region
--secrets-aws-secret <n>     AWS Secrets Manager name
```

Environment overrides (same semantics as flags):

```text
COMPOSE_BASE_IMAGE
COMPOSE_USER
COMPOSE_BUILDER_ENABLED
COMPOSE_BUILDER_IMAGE
COMPOSE_SECRETS_MODE
COMPOSE_SECRETS_FILE
COMPOSE_SECRETS_EXTERNAL_NAME
COMPOSE_SECRETS_TARGET
COMPOSE_SECRETS_GCP_PROJECT
COMPOSE_SECRETS_GCP_SECRET
COMPOSE_SECRETS_AZURE_VAULT
COMPOSE_SECRETS_AZURE_SECRET
COMPOSE_SECRETS_AWS_REGION
COMPOSE_SECRETS_AWS_SECRET
```

### `fvtt-pod` (`scripts/pod-handler.sh`)

```text
-f, --file <compose.yml>     Compose file (default resolution: ./compose.dev.yml)
--dry-run, -n                Show docker compose commands only
```

Commands:

```text
up [-d]
start <SERVICE>
down
restart <SERVICE>
build [SERVICE]
pull
ps
logs [-f] [SERVICE]
exec <SERVICE> [CMD]
shell <SERVICE>
run-builder
stop-builder
help
```

### `scripts/validate-config.js`

```text
Usage: validate-config.js <config-path> [cache-dir] [--no-cache]
```

- `--no-cache`: force fresh validation

### `scripts/validate-package-json.js`

No flags. Validates `package.json` against SchemaStore. Use `USE_LOCAL_SCHEMA=1` to force local schema fallback (`schemas/package.schema.json`).

### `scripts/validate-package.sh`

Runs: schema validation -> `npm pack --dry-run` -> `npm publish --dry-run` -> optional `npm-package-json-lint`.

## Configuration Validation & Caching

Validation occurs automatically when a container-config shaped file is supplied. Cached results (hash-based) skip repeated work until the file changes. To bypass cache: `--no-cache` in direct script usage.

Failure output example:

```text
Configuration validation failed:
  /systems/my-system: must have either "manifest" or "path" property
```

## Secrets Modes

Modes: `file`, `external`, `gcp` (experimental), `azure` (experimental), `aws` (experimental), `none`, or `auto` (auto-detects based on provided flags/env). Experimental cloud modes write a temp file in `/tmp` containing the retrieved secret content, then mount it as a compose secret.

Example (AWS auto-detect):

```zsh
npx fvtt-compose-gen -c container-config.json -o compose.yml \
  --secrets-aws-region us-east-1 \
  --secrets-aws-secret foundry-credentials
```

## Builder Service

A lightweight Node image (`node:20-alpine` by default) included as `builder` for tasks like installing dependencies or compiling assets. Disable with `COMPOSE_BUILDER_ENABLED=0` or by setting `builder.enabled: false` in composition params.

## Development Workflow

```zsh
npm install
npm run test            # lint + unit tests
npm run test:ci         # lint + tests + coverage
npm run check-coverage  # enforce per-path thresholds
npm run lint            # eslint only
npm run validate:package
```

### Using Path Aliases

This project supports path aliases for cleaner imports and better IDE support:

**IntelliSense Support (jsconfig.json):**

- `#/*` - Project root
- `#scripts/*` - Scripts directory
- `#helpers/*` - Helper modules
- `#config/*` - Configuration files
- `#patches/*` - Patch system
- `#patches/entrypoint/*` - Patch entry points
- `#patches/common/*` - Common patch utilities
- `#tests/unit/*` - Unit tests
- `#tests/integration/*` - Integration tests
- `#docs/*` - Documentation
- `#examples/*` - Example configurations
- `#schemas/*` - JSON schemas

**Package Exports:**
External projects can import modules using the package name:

```javascript
// Access config files
const babelConfig = require('foundryvtt-dev-pod/babel.config.cjs');
const jsConfig = require('foundryvtt-dev-pod/jsconfig.json');

// Access any file in the project
const validator = require('foundryvtt-dev-pod/helpers/config-validator');
const example = require('foundryvtt-dev-pod/examples/container-config.json');
```

## Testing & Coverage

Jest runs with ESM support (`--experimental-vm-modules`). Coverage thresholds enforced by `.github/constants/thresholds.json` using a custom checker script.

### Editor (VSCode) Jest Setup

The repo uses a multi-project Jest configuration (`jest.config.js`) that defines:

- `unit` project: matches `tests/unit/**/*.unit.test.js` and `tests/unit/**/*.test.js`
- `integration` project: matches `tests/integration/**/*.int.test.js` and `tests/integration/**/*.test.js` with `maxWorkers: 1` to avoid race conditions against shared temp resources.

VSCode Jest extension is configured via `.vscode/settings.json` to:

- Run tests on save (current file only) instead of watch mode
- Use the Node VM Modules flag transparently through `jest.jestCommandLine`

If you want to focus only on unit tests in the UI, use the test file naming conventions above; the extension will scope to the saved file.

Manual CLI equivalents:

```zsh
# Run only unit project
npx jest --selectProjects unit

# Run only integration (serialized)
npx jest --selectProjects integration

# Run a single integration test file explicitly
npx jest --selectProjects integration tests/integration/fvtt-compose-gen.int.test.js
```

## Publishing Note

Package currently marked private? (Remove `private` if you intend to publish; ensure unique name & license compliance.)

## Acknowledgments

This tooling wraps the excellent `felddy/foundryvtt-docker` image. See that project for underlying image behavior and licensing.

---

For deeper examples (multi-version installs, secrets, non-root compose variants) see `examples/` and script-level README under `scripts/`.
