# FoundryVTT Dev Pod CLI

Minimal CLI for working with local multi-version Foundry containers during module development.

## Quickstart

- Generate compose from `container-config.json`:

```zsh
npx fvtt-compose-gen -c docker/container-config.json -o docker/compose.dev.yml
```

- Start services and tail logs:

```zsh
npx fvtt-pod up -d
npx fvtt-pod logs -f foundry-v13
```

## Secrets modes

Control how credentials are passed into containers during generation:

- `file` (default):
  - `--secrets-file ./secrets.json` and mounted in containers as `/run/secrets/config.json`.
- `external`:
  - `--secrets-external foundry_secrets` references an external secret managed by Docker/Swarm.
- `none`:
  - Omits secrets; use `env_file`/`environment` in compose instead.

Flags or env vars:

- Flags: `--secrets-mode`, `--secrets-file`, `--secrets-external`, `--secrets-target`
- Env: `COMPOSE_SECRETS_MODE`, `COMPOSE_SECRETS_FILE`, `COMPOSE_SECRETS_EXTERNAL_NAME`, `COMPOSE_SECRETS_TARGET`

## Pod helper

- Default compose file path: `docker/compose.dev.yml` (from repo root)
- Custom compose file:

```zsh
npx fvtt-pod -f ./docker/compose.dev.nonroot.yml up -d
```

## Safety

- This package is marked `private: true` in `package.json`. Remove that, set a unique name, add a license, then `npm publish --access public` if you choose to publish.
- Review `docker/README.md` for full details.

## Acknowledgments

This tooling wraps and orchestrates development workflows around the excellent `felddy/foundryvtt-docker` image:

- [felddy/foundryvtt-docker](https://github.com/felddy/foundryvtt-docker)

Please refer to that project for base image details, environment variables, and licensing.
