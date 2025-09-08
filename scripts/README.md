# Scripts Directory <!-- omit in toc -->

This directory contains the CLI entrypoints and thin wrappers for the FoundryVTT Dev Pod project. These scripts are designed to be user-facing tools for generating Docker Compose configurations, managing pods, and validating configurations.

## Directory Structure

The scripts directory follows a modular pattern inspired by the `patches/` system:

### `scripts/` (CLI entrypoints)

- **Purpose**: User-facing CLI scripts with minimal logic
- **Pattern**: Thin wrappers that delegate to `common/` modules or `helpers/`
- **Example**: `validate-config.js` - thin CLI wrapper

### `scripts/common/` (Script orchestration modules)

- **Purpose**: Script-specific orchestration logic and CLI utilities
- **Pattern**: Pure functions that can be easily tested, combining `helpers/` logic
- **Example**: `validate-config.mjs` - contains validation workflow orchestration
- **Rule**: Do NOT duplicate `helpers/` - only script-specific glue code and CLI utilities

### `scripts/entrypoint/` (Optional shell wrappers)

- **Purpose**: POSIX shell wrappers for scripts (when needed)
- **Pattern**: Similar to `patches/entrypoint/` - thin shell scripts that delegate to common modules
- **Usage**: Currently unused, reserved for future shell wrapper needs

## Design Principles

1. **No duplication of `helpers/`**: The `helpers/` directory remains the single source of project-level domain logic (validation, path utils, etc.).

2. **`scripts/common/`**: Contains script-specific orchestration helpers that are not suitable for `helpers/` (CLI option normalization, orchestration logic, script-specific utilities that wrap `helpers/` functions).

3. **`scripts/entrypoint/`**: Optional thin shell wrappers that provide a consistent interface and could be extended with shell-level features.

4. **Main CLI scripts**: The `*.mjs` files in the scripts root are the primary CLI entry points that parse arguments and call into `scripts/common/` modules.

## Overview <!-- omit in toc -->

The scripts in this directory serve as the primary interfaces for interacting with the project's core functionality. They are kept thin to delegate complex logic to the `helpers/` modules (for domain logic) or `common/` modules (for script orchestration), ensuring maintainability and testability.
The scripts in this directory serve as the primary interfaces for interacting with the project's core functionality. They are kept thin to delegate complex logic to the `helpers/` modules (for domain logic) or `common/` modules (for script orchestration), ensuring maintainability and testability.

**Contents:**

- [Directory Structure](#directory-structure)
  - [`scripts/` (CLI entrypoints)](#scripts-cli-entrypoints)
  - [`scripts/common/` (Script orchestration modules)](#scriptscommon-script-orchestration-modules)
  - [`scripts/entrypoint/` (Optional shell wrappers)](#scriptsentrypoint-optional-shell-wrappers)
- [Design Principles](#design-principles)
- [Scripts](#scripts)
  - [`fvtt-status.mjs`](#fvtt-statusmjs)
  - [`generate-compose.js`](#generate-composejs)
  - [`pod-handler.sh`](#pod-handlersh)
  - [`validate-config.js`](#validate-configjs)
  - [`validate-package-json.js`](#validate-package-jsonjs)
  - [`validate-package.sh`](#validate-packagesh)
  - [`generate-compose.constants.js`](#generate-composeconstantsjs)
- [Common Modules](#common-modules)
  - [`common/validate-config.mjs`](#commonvalidate-configmjs)
- [Common Modules](#common-modules-1)
  - [`common/validate-config.mjs`](#commonvalidate-configmjs-1)
- [API](#api)
  - [`fvtt-status.mjs` Options](#fvtt-statusmjs-options)
  - [`generate-compose.js` Options](#generate-composejs-options)
  - [`pod-handler.sh` Options](#pod-handlersh-options)
  - [`validate-config.js` Options](#validate-configjs-options)
  - [`validate-package-json.js` Options](#validate-package-jsonjs-options)
  - [`validate-package.sh` Options](#validate-packagesh-options)
- [Development Notes](#development-notes)
- [Development Notes](#development-notes-1)
  - [Creating New CLI Tools](#creating-new-cli-tools)
  - [Architecture Guidelines](#architecture-guidelines)
- [Examples](#examples)

## Scripts

### `fvtt-status.mjs`

- **Purpose**: FoundryVTT development pod status checker.
- **Usage**: `npx fvtt-status --json` or `fvtt-status --dry-run`
- **Details**: Provides comprehensive status overview including pod detection, compose validation, service status, and health checks. Uses orchestration logic from `scripts/common/fvtt-status.mjs` and domain logic from `helpers/config-validator.js`.

### `generate-compose.js`

- **Purpose**: Generates Docker Compose YAML files from a container configuration.
- **Usage**: `npx fvtt-compose-gen -c container-config.json -o compose.dev.yml`
- **Details**: This script uses the logic from `helpers/` to create compose files for different Foundry VTT versions and configurations.

### `pod-handler.sh`

- **Purpose**: Orchestrates Docker containers and applies patches for the Foundry VTT development environment.
- **Usage**: `npx fvtt-pod -f ./compose.dev.yml up -d` or `npx fvtt-pod logs -f foundry-v13`
- **Details**: Handles container lifecycle, logging, and integration with shell patches from `patches/`.

### `validate-config.js`

- **Purpose**: Thin CLI wrapper for container configuration validation.
- **Purpose**: Thin CLI wrapper for container configuration validation.
- **Usage**: `npx scripts/validate-config.js <config-path> [cache-dir]` or with `--no-cache` to force fresh validation.
- **Details**: Delegates to `common/validate-config.mjs` for orchestration logic and `helpers/config-validator.js` for core validation functionality.
- **Details**: Delegates to `common/validate-config.mjs` for orchestration logic and `helpers/config-validator.js` for core validation functionality.

### `validate-package-json.js`

- **Purpose**: Validates the project's `package.json` against a schema.
- **Usage**: Run via npm scripts or directly.
- **Details**: Ensures the package manifest conforms to project standards.

### `validate-package.sh`

- **Purpose**: Shell script wrapper for package validation.
- **Usage**: Executed in CI or manually.
- **Details**: Integrates with other validation tools.

### `generate-compose.constants.js`

- **Purpose**: Contains constants used by `generate-compose.js`.
- **Usage**: Internal module, not directly invoked.
- **Details**: Defines shared constants for compose generation.

## Common Modules

### `common/validate-config.mjs`

- **Purpose**: Script-specific orchestration logic for configuration validation.
- **Usage**: Imported by `validate-config.js` and tested independently.
- **Details**: Contains CLI argument parsing, validation workflow orchestration, and logging functions. Wraps `helpers/config-validator.js` for actual validation logic.

## Common Modules

### `common/validate-config.mjs`

- **Purpose**: Script-specific orchestration logic for configuration validation.
- **Usage**: Imported by `validate-config.js` and tested independently.
- **Details**: Contains CLI argument parsing, validation workflow orchestration, and logging functions. Wraps `helpers/config-validator.js` for actual validation logic.

## API

This section details the command-line interfaces for the executable scripts in this directory.

### `fvtt-status.mjs` Options

- `-f, --file <compose.yml>`: Path to docker compose file (auto-detected if not specified)
- `-c, --config <config.json>`: Path to container config file (default: container-config.json)
- `--json`: Output status in JSON format
- `--verbose, -v`: Show detailed information
- `--dry-run, -n`: Show what checks would be performed without executing them
- `-h, --help`: Show help information

Exit codes:

- `0`: Status check successful
- `1`: General error (invalid arguments, etc.)
- `2`: Pod not detected or configuration invalid
- `3`: Docker/compose not available
- `4`: Services unhealthy or not accessible

### `generate-compose.js` Options

- `-c, --config <file>`: Path to config file (default: container-config.json)
- `-o, --out <file>`: Output file path (omit for stdout)
- `--print`: Print to stdout (same as omitting -o)
- `--dry-run, -n`: Show what would be done without writing files
- `--secrets-mode <mode>`: Secrets mode: file|external|gcp|azure|aws|none (default: auto)
- `--secrets-file <file>`: File mode: path to secrets file (default: ./secrets.json)
- `--secrets-external <name>`: External mode: external secret name
- `--secrets-target <path>`: Target path in container (default: config.json)
- `--secrets-gcp-project <project>`: GCP mode: Google Cloud project ID
- `--secrets-gcp-secret <secret>`: GCP mode: Secret Manager secret name
- `--secrets-azure-vault <vault>`: Azure mode: Key Vault name
- `--secrets-azure-secret <secret>`: Azure mode: Secret name in Key Vault
- `--secrets-aws-region <region>`: AWS mode: AWS region
- `--secrets-aws-secret <secret>`: AWS mode: Secrets Manager secret name

Environment overrides:

- `COMPOSE_BASE_IMAGE`: Base image for Foundry services
- `COMPOSE_USER`: User string for services
- `COMPOSE_BUILDER_ENABLED`: When not '0', include builder service
- `COMPOSE_BUILDER_IMAGE`: Builder image
- `COMPOSE_SECRETS_MODE`: Secrets mode
- `COMPOSE_SECRETS_FILE`: Path to secrets file
- `COMPOSE_SECRETS_EXTERNAL_NAME`: External secret name
- `COMPOSE_SECRETS_TARGET`: Target path in container
- `COMPOSE_SECRETS_GCP_PROJECT`: GCP project ID
- `COMPOSE_SECRETS_GCP_SECRET`: GCP secret name
- `COMPOSE_SECRETS_AZURE_VAULT`: Azure vault name
- `COMPOSE_SECRETS_AZURE_SECRET`: Azure secret name
- `COMPOSE_SECRETS_AWS_REGION`: AWS region
- `COMPOSE_SECRETS_AWS_SECRET`: AWS secret name

### `pod-handler.sh` Options

- `-f, --file <compose.yml>`: Path to docker compose file (default: compose.dev.yml)
- `--dry-run, -n`: Show what docker compose commands would be executed without executing them

Commands:

- `up [-d]`: Start all services (detached with -d)
- `start SERVICE`: Start a single service
- `down`: Stop and remove containers
- `restart SERVICE`: Restart a service
- `build [SERVICE]`: Build all or a single service
- `pull`: Pull images
- `ps`: Show containers
- `logs [-f] [SERVICE]`: Show logs (follow with -f)
- `exec SERVICE [CMD]`: Exec command in service (defaults to sh)
- `shell SERVICE`: Open interactive shell in service
- `run-builder`: Start builder service
- `stop-builder`: Stop builder service
- `help`: Print help

### `validate-config.js` Options

- `--no-cache`: Skip caching and always perform fresh validation
- `--help, -h`: Show help message

Arguments:

- `config-path`: Path to container-config.json (required)
- `cache-dir`: Directory for caching (optional)

### `validate-package-json.js` Options

No CLI options. Validates package.json against SchemaStore schema. Uses `USE_LOCAL_SCHEMA=1` to use local schema.

### `validate-package.sh` Options

No CLI options. Runs multiple validations on package.json.

## Development Notes

## Development Notes

### Creating New CLI Tools

To create a new CLI tool following the entrypoint+common pattern:

1. **Copy the template**: Use `scripts/entrypoint/XX-script-entrypoint.template` as a starting point

   ```bash
   cp scripts/entrypoint/XX-script-entrypoint.template scripts/entrypoint/my-tool
   chmod +x scripts/entrypoint/my-tool
   ```

2. **Customize the template**: Replace placeholders in the copied file:
   - `{SCRIPT_NAME}` → your tool name (e.g., "my-tool")
   - `{TOOL_DESCRIPTION}` → brief description of your tool

3. **Create the Node.js files**:
   - `scripts/my-tool.mjs` - Main CLI entry point with argument parsing
   - `scripts/common/my-tool.mjs` - Script-specific orchestration logic

4. **Add to package.json**: Include your tool in the `bin` section for npm installation

5. **Write tests**: Add integration tests in `tests/integration/` for end-to-end CLI behavior

### Architecture Guidelines

- These scripts follow a modular pattern: CLI scripts (thin wrappers) delegate to `common/` modules (script orchestration) or `helpers/` (domain logic).
- **Domain logic belongs in `helpers/`** - use for config validation, path resolution, and other reusable functionality.
- **Script orchestration belongs in `common/`** - use for CLI parsing, workflow coordination, and script-specific utilities.
- All scripts follow the project's ESM module conventions (`type: module`).
- When adding new scripts, consider extracting logic to `common/` modules for better testability.
- For more details on usage, refer to the main `README.md` in the project root.
- When modifying scripts, ensure they remain executable and preserve shebang lines if applicable.

## Examples

- Check pod status: `npx fvtt-status`
- Check status in JSON format: `npx fvtt-status --json`
- Dry-run status check: `npx fvtt-status --dry-run`
- Status with custom files: `npx fvtt-status -f custom-compose.yml -c custom-config.json`
- Via shell entrypoint: `scripts/entrypoint/fvtt-status --help`
- Validate config (no-cache): `npx scripts/validate-config.js ./container-config.json --no-cache`
- Validate config with cache: `npx scripts/validate-config.js ./container-config.json /tmp/cache`
- Generate and start dev pod: `npx fvtt-compose-gen -c container-config.json -o compose.dev.yml && npx fvtt-pod -f ./compose.dev.yml up -d`
- Tail logs for a specific container: `npx fvtt-pod logs -f foundry-v13`
- Validate package.json: `npx scripts/validate-package-json.js`
- Run package validation script: `./scripts/validate-package.sh`
- Generate compose with custom output: `npx fvtt-compose-gen -c container-config.json -o custom-compose.yml`
