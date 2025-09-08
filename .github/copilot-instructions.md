<!-- AI Coding Agent Guide (concise, project-specific) -->
# FoundryVTT Dev Pod — AI Agent Instructions

## 1. Purpose & Core Components
Two small CLIs plus a patch framework:
- `fvtt-compose-gen` (generate multi-version Foundry compose YAML from `container-config.json`).
- `fvtt-pod` (orchestrate docker compose lifecycle + helpers).
- Patch system under `patches/` (bash wrappers in `entrypoint/` delegating to Node `.mjs` scripts in `common/`).
- Validation + caching logic in `helpers/config-validator.js` (single source: do not re‑implement elsewhere).

## 2. Architectural Notes
- CLI entry scripts in `scripts/` are thin: heavy logic belongs in `helpers/` or patch `.mjs` files.
- Service naming & version conventions (e.g. `foundry-v13`, ports `30000+<NN>`) are generated; keep defaults unless feature explicitly requires change.
- Secrets + builder service parameters flow: flags/environment -> `generate-compose` -> emitted compose YAML consumed by `fvtt-pod`.
- Patch wrappers: filename encodes order (`00-`, `10-`, etc.) and patch name; wrapper sources `wrapper-bin.sh` which resolves and executes the Node script.

## 3. Key Workflows (copy/paste)
- Install deps / lint+test: `npm install && npm test`
- Full CI locally: `npm run test:ci && npm run check-coverage`
- Generate compose: `npx fvtt-compose-gen -c container-config.json -o compose.dev.yml`
- Up + logs (default file auto-detected): `npx fvtt-pod up -d && npx fvtt-pod logs -f foundry-v13`
- Direct validation (skip cache): `npx scripts/validate-config.js ./container-config.json --no-cache`
- Package validation pipeline: `npm run validate:package`

## 4. Adding / Modifying Logic
- Extend validation: modify `helpers/config-validator.js`; update or add focused unit tests under `tests/unit/` mirroring file path.
- New compose feature: implement helper module, call from `scripts/generate-compose.js`; ensure tests (unit) plus at least one integration in `tests/integration/` if it affects CLI surface.
- New patch: copy `patches/templates/XX-patch-entrypoint.sh.template` -> `patches/entrypoint/NN-new-thing.sh`, add Node implementation `patches/common/new-thing.mjs`; keep executable bit.

## 5. Conventions & Style (enforced)
- Style: see `docs/code-style.md` (ESLint + JSDoc).
- Node >=18, ESM modules (`type: module`).
- Every source file (JS/MJS/SH needing docs) starts with JSDoc header block (see existing examples).
- Descriptive names; constants UPPER_SNAKE_CASE; no `eval` / `with`.
- Keep functions small (≈20 lines) & prefer early returns.
- Private helpers defined above exports; exported symbols documented with JSDoc `@export` where used.
- **Use path aliases** for imports: `#helpers/*`, `#scripts/*`, `#config/*`, etc. instead of relative paths.

### Path Aliases
Project supports clean import aliases via jsconfig.json:
- `#/*` - Project root
- `#scripts/*` - CLI scripts  
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

External packages can access modules via package exports:
```javascript
const validator = require('foundryvtt-dev-pod/helpers/config-validator');
const config = require('foundryvtt-dev-pod/babel.config.cjs');
```

## 6. Testing & Coverage
- Jest invoked with `--experimental-vm-modules` (already scripted).
- Coverage thresholds enforced by `.github/constants/thresholds.json` via `.github/scripts/check-coverage.cjs` — adjust only when justified by new surface area.
- When adding a new path, ensure it is captured by existing or new tests to avoid threshold regressions.

## 7. Patches Framework Essentials
- Dry-run: set `PATCH_DRY_RUN=1` or pass `-n/--dry-run` to wrapper.
- Modes: `WRAPPER_RUN_MODE=default` (one-shot) or `sync-loop` for background sync tasks.
- Override target script(s): `--wrapper-target install-components` (can repeat / comma-separate) and optionally `--wrapper-ext cjs`.
- Logging prefixes: `[patch]`, `[patch][dry-run]`, `[patch][error]` — replicate format if emitting new logs.

## 8. Secrets / Builder
- Secrets mode auto-detection uses provided flags/env; accepted: `file|external|gcp|azure|aws|none|auto`.
- Experimental cloud modes write a temp file then mount as compose secret.
- Disable builder: `COMPOSE_BUILDER_ENABLED=0` or config param; builder image defaults to `node:20-alpine`.

## 9. Common Pitfalls
- Do NOT duplicate validation logic in `scripts/`; import from `helpers/config-validator.js`.
- Preserve shebang + executable bit on any edited wrapper or new `entrypoint/*.sh` file.
- Keep CLI flags documented in README sections; update there when adding.
- If cache-related change: ensure hash logic (`calculateFileHash`) still produces distinct values for meaningful config/schema edits.

## 10. Where to Look First
`README.md` (usage + secrets), `helpers/config-validator.js` (validation core), `patches/README.md` (patch lifecycle), `scripts/generate-compose.js` (compose assembly), integration tests (`tests/integration/*.int.test.js`) for end-to-end expectations.

---
Questions or unclear area? Provide file path(s) you examined and uncertainty; respond with a proposed diff before large refactors.
