# FoundryVTT Dev Pod CLI

Minimal CLI for working with local multi-version Foundry containers during module development.

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

## Configuration Validation

Both `fvtt-compose-gen` and `fvtt-pod` automatically validate your `container-config.json` file against structural requirements before processing. The validation ensures your configuration has all required properties and proper structure.

### What gets validated

- **Required top-level properties**: `systems`, `modules`, `versions`
- **Component validation**: Each system/module must have a `name` and either `manifest` or `path`
- **Version structure**: Version configs must include required `install` sections with `systems` and `modules` objects

### Validation in action

**Valid configuration passes silently**:

```zsh
npx fvtt-compose-gen -c container-config.json --dry-run
# [dry-run] Would generate compose YAML from config: /path/to/container-config.json
```

**Invalid configuration is caught early**:

```zsh
npx fvtt-compose-gen -c bad-config.json --dry-run
# Configuration validation failed:
#   /systems/my-system: must have either "manifest" or "path" property
#   /versions/13: must have required property "install"
```

### Standalone validation tool

You can also validate configurations directly:

```zsh
# Validate a config file
npx scripts/validate-config.js container-config.json

# Skip caching for fresh validation
npx scripts/validate-config.js container-config.json --no-cache
```

### Caching

The `fvtt-pod` command caches validation results to avoid repeated checks until your configuration changes. You'll see a "Validating container configuration..." message only when validation is actually performed.

## Secrets modes

Control how credentials are passed into containers during generation.

NOTE: Cloud provider modes (gcp, azure, aws) are currently experimental and untested. Interfaces and behavior may change; use with caution and validate outputs before relying on them in production.

- `file` (default):
  - `--secrets-file ./secrets.json` and mounted in containers as `/run/secrets/config.json`.
- `external`:
  - `--secrets-external foundry_secrets` references an external secret managed by Docker/Swarm.
- `gcp` (experimental):
  - `--secrets-gcp-project my-project --secrets-gcp-secret foundry-config` retrieves secrets from Google Cloud Secret Manager.
- `azure` (experimental):
  - `--secrets-azure-vault my-vault --secrets-azure-secret foundry-config` retrieves secrets from Azure Key Vault.
- `aws` (experimental):
  - `--secrets-aws-region us-east-1 --secrets-aws-secret foundry-config` retrieves secrets from AWS Secrets Manager.
- `none`:
  - Omits secrets; use `env_file`/`environment` in compose instead.

### Google Cloud Platform (GCP) integration

The `gcp` mode retrieves secrets directly from Google Cloud Secret Manager:

```zsh
# Using explicit GCP mode
npx fvtt-compose-gen -c container-config.json -o compose.yml \
  --secrets-mode gcp \
  --secrets-gcp-project my-foundry-project \
  --secrets-gcp-secret foundry-credentials

# Auto-detection (if project and secret are provided, GCP mode is used automatically)
npx fvtt-compose-gen -c container-config.json -o compose.yml \
  --secrets-gcp-project my-foundry-project \
  --secrets-gcp-secret foundry-credentials
```

**Prerequisites for GCP mode:**

- `gcloud` CLI installed and authenticated (`gcloud auth login`)
- Appropriate permissions to access the specified secret in Secret Manager
- Secret should contain JSON with Foundry VTT credentials

### Microsoft Azure integration

The `azure` mode retrieves secrets directly from Azure Key Vault:

```zsh
# Using explicit Azure mode
npx fvtt-compose-gen -c container-config.json -o compose.yml \
  --secrets-mode azure \
  --secrets-azure-vault my-foundry-vault \
  --secrets-azure-secret foundry-credentials

# Auto-detection (if vault and secret are provided, Azure mode is used automatically)
npx fvtt-compose-gen -c container-config.json -o compose.yml \
  --secrets-azure-vault my-foundry-vault \
  --secrets-azure-secret foundry-credentials
```

**Prerequisites for Azure mode:**

- `az` CLI installed and authenticated (`az login`)
- Appropriate permissions to access the specified Key Vault and secret
- Secret should contain JSON with Foundry VTT credentials

### Amazon Web Services (AWS) integration

The `aws` mode retrieves secrets directly from AWS Secrets Manager:

```zsh
# Using explicit AWS mode
npx fvtt-compose-gen -c container-config.json -o compose.yml \
  --secrets-mode aws \
  --secrets-aws-region us-east-1 \
  --secrets-aws-secret foundry-credentials

# Auto-detection (if region and secret are provided, AWS mode is used automatically)
npx fvtt-compose-gen -c container-config.json -o compose.yml \
  --secrets-aws-region us-east-1 \
  --secrets-aws-secret foundry-credentials
```

**Prerequisites for AWS mode:**

- `aws` CLI installed and configured (`aws configure` or IAM roles)
- Appropriate permissions to access the specified secret in Secrets Manager
- Secret should contain JSON with Foundry VTT credentials

**Example secret content for all cloud providers:**

```json
{
  "foundry_username": "your-foundry-username",
  "foundry_password": "your-foundry-password",
  "foundry_license_key": "your-license-key"
}
```

Flags or env vars:

- Flags: `--secrets-mode`, `--secrets-file`, `--secrets-external`, `--secrets-target`, `--secrets-gcp-project`, `--secrets-gcp-secret`, `--secrets-azure-vault`, `--secrets-azure-secret`, `--secrets-aws-region`, `--secrets-aws-secret`
- Env: `COMPOSE_SECRETS_MODE`, `COMPOSE_SECRETS_FILE`, `COMPOSE_SECRETS_EXTERNAL_NAME`, `COMPOSE_SECRETS_TARGET`, `COMPOSE_SECRETS_GCP_PROJECT`, `COMPOSE_SECRETS_GCP_SECRET`, `COMPOSE_SECRETS_AZURE_VAULT`, `COMPOSE_SECRETS_AZURE_SECRET`, `COMPOSE_SECRETS_AWS_REGION`, `COMPOSE_SECRETS_AWS_SECRET`

## Pod helper

- Default compose file path: `compose.dev.yml` (from repo root)
- Custom compose file:

```zsh
npx fvtt-pod -f ./compose.dev.nonroot.yml up -d
```

## Safety

- This package is marked `private: true` in `package.json`. Remove that, set a unique name, add a license, then `npm publish --access public` if you choose to publish.
- Review `patches/README.md` for patch details.

## Acknowledgments

This tooling wraps and orchestrates development workflows around the excellent `felddy/foundryvtt-docker` image:

- [felddy/foundryvtt-docker](https://github.com/felddy/foundryvtt-docker)

Please refer to that project for base image details, environment variables, and licensing.

## CI & Coverage

- Pull requests into `master`/`main` run tests via GitHub Actions (Node 18).
- Coverage is generated by Jest. A per-folder gate enforces minimums using `.github/constants/thresholds.json`.
- Workflow file: `.github/workflows/pr-test-coverage.yml`.

Local run:

```zsh
npm install
npm run test:ci
npm run check-coverage
```

Configure thresholds:

- Edit `.github/constants/thresholds.json` to add/update rules.
- Each rule supports:
  - `name`: label for reporting
  - `match_mode`: `prefix` (default) or `regex`
  - `match`: path prefix or regex
  - `min`: required `{ branches, functions, lines, statements }`

Environment overrides:

- `THRESHOLDS_FILE`: alternate thresholds JSON path
- `COVERAGE_SUMMARY`: path to `coverage-summary.json` if non-standard
