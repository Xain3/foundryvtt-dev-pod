<!-- Copilot instructions for contributors and coding agents -->
# FoundryVTT Dev Pod — AI Coding Agent Guide

This repository contains small CLI tools and patch scripts used to generate Docker Compose configurations and run multi-version Foundry VTT developer pods.

Big picture
- What: Two primary CLI tools (`fvtt-compose-gen`, `fvtt-pod`) plus helper modules and shell patches under `patches/`. The CLIs validate `container-config.json`, generate compose YAML, and orchestrate containers/patches.
- Key entry points: `scripts/generate-compose.js`, `scripts/pod-handler.sh`, `scripts/validate-config.js` (validation wrapper). Core logic lives in `helpers/` and `patches/`.

Project layout (important files)
- `scripts/`: CLI entrypoints (thin wrappers). Inspect these for user-facing flags and behavior.
- `helpers/`: JavaScript modules with core logic. Example: `helpers/config-validator.js` implements validation + caching used by `scripts/validate-config.js`.
- `patches/`: Shell scripts and patch logic applied to containers. See `patches/README.md` for strategy and `entrypoint/` for ordering.
- `tests/unit/`: Jest unit tests that mirror `helpers/` and some script behaviors.
- `.github/`: CI helpers and coverage checks. See `.github/scripts/check-coverage.cjs` and `.github/constants/thresholds.json`.
- `README.md` and `package.json`: canonical usage and required Node version (>=18).

Development workflows (commands)
- Install deps: `npm install` (Node 18+).
- Lint + tests: `npm test` (runs `eslint` then `jest`).
- CI-style with coverage: `npm run test:ci` then `npm run check-coverage`.
- Generate compose: `npx fvtt-compose-gen -c container-config.json -o compose.dev.yml`.
- Start pod / tail logs: `npx fvtt-pod -f ./compose.dev.yml up -d` and `npx fvtt-pod logs -f foundry-v13`.
- Validate config directly: `npx scripts/validate-config.js <config-path> [cache-dir]` (use `--no-cache` to force fresh validation).

Project-specific conventions and guidance
- Keep CLI wrappers thin: move complex logic into `helpers/` to make unit-testing straightforward.
- Use CommonJS modules (project `type` is `commonjs`). Import/require patterns in `helpers/` are canonical.
- Validation & caching: `helpers/config-validator.js` exposes `ConfigValidator`, `validateConfigWithCache`, and `calculateFileHash`. CLI `scripts/validate-config.js` demonstrates parsing of `--no-cache` and positional args.
- Shell patches: Files in `patches/` and `entrypoint/` are executed in container contexts; preserve shebangs and executable bits. Tests may invoke patches in dry-run mode.
- Tests reflect usage: New features should add focused unit tests under `tests/unit/` and update coverage thresholds if new source paths are introduced.

Integration points & external dependencies
- Targets `felddy/foundryvtt-docker` image and Docker runtime; changes affecting environment variables or container paths should be validated against that project.
- Secrets modes (`file`, `external`, `gcp`, `azure`, `aws`, `none`) are implemented in generate/compose flows — see `README.md` for CLI examples and required external CLIs (`gcloud`, `az`, `aws`).

Examples (copyable)
- Validate config (no-cache):
	- `npx scripts/validate-config.js ./container-config.json --no-cache`
- Run tests with coverage locally:
	- `npm install && npm run test:ci && npm run check-coverage`
- Generate and start dev pod (dev):
	- `npx fvtt-compose-gen -c container-config.json -o compose.dev.yml && npx fvtt-pod -f ./compose.dev.yml up -d`

What to avoid / common pitfalls
- Don't duplicate validation logic between `scripts/` and `helpers/` — update `helpers/config-validator.js` and keep wrappers thin.
- When editing shell patches, ensure files remain executable and keep shebang lines intact. Avoid platform-specific assumptions unless necessary.

Where to look for more context
- `README.md` — usage, secrets modes, and quickstart examples.
- `helpers/config-validator.js` — canonical validation and caching behavior.
- `patches/README.md` and `entrypoint/` — patch strategy and execution order.
- `tests/unit/` — examples of expected behaviors and how to test helpers.

Code style:
## Style Appendix (enforced)
- Indentation: 2 spaces (no tabs).
- File header: Every source file MUST start, before any imports (but after the shebang if needed), with the exact JSDoc block:
  /**
  * @file the file name
  * @description Short description of purpose
  * @path relative/path/from/project/root
  */
- Variables: prefer fully descriptive names; avoid abbreviations unless very common (e.g., cfg for config) or needed for disambiguation (e.g., ctx for context).
- JSDoc: All exported classes/functions must have JSDoc with @param/@returns (when applicable) and @export. Include public API in class JSDoc. Prefer documenting private helpers as well.
- Naming: camelCase for variables/functions, PascalCase for classes, UPPER_SNAKE_CASE for constants.
- Private vs public: place private helpers (non-exported) above exported/public APIs. Define helper functions before callers.
- Function size & complexity: Aim for <= 20 lines and <= 3 nesting levels; refactor into small helpers when needed.
- Conditionals & control flow: Use single-line only for trivial checks. Prefer early returns and brace blocks for complex conditions.
- Forbidden patterns: Do not use eval or with.
- Error handling: Use try...catch where needed, throw recoverable errors, and log via console or project logger.
- Tests: Unit tests colocated with .unit.test.js; integration tests under tests/integration with .int.test.js. Use beforeEach/afterEach and beforeAll/afterAll as appropriate.


If any part is unclear or you want more code examples and test links, tell me which areas to expand and I will iterate.
