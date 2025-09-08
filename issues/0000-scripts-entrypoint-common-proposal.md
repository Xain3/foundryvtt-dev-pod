Title: Proposal — Introduce `scripts/entrypoint` + `scripts/common` pattern (optional)

Summary

This proposal suggests introducing a thin entrypoint + common module pattern for the repository `scripts/` directory, modeled after the existing `patches/entrypoint` + `patches/common` pattern. The goal is to future-proof the repo by improving testability, reusability, and consistency across CLI scripts while avoiding duplication with existing `helpers/`.

Motivation

- `patches/` already uses a two-layer approach: shell entrypoints for wrapper features and Node `.mjs` common modules for logic. This pattern has proven useful for patch orchestration.
- `scripts/` currently contains CLI scripts (Node and shell). Over time, these scripts may duplicate domain logic already in `helpers/` (e.g., config validation, path utils) or duplicate small orchestration code across scripts.
- A consistent pattern for `scripts/` would improve testability and make it easier to add features like `--dry-run`, consistent logging, and caching.

Design Principles / Rules

- Do NOT duplicate `helpers/`. `helpers/` remains the single source of project-level domain logic (validation, path utils, etc.).
- `scripts/common/` should only contain script-specific orchestration helpers that are not suitable for `helpers/` (i.e. glue code, CLI option normalization, small write/read utilities that wrap `helpers` functions).
- `scripts/entrypoint/` (or `scripts/bin/`) holds thin CLI wrappers (or small POSIX shell wrappers) that parse argv and call `scripts/common/*`.
- Preserve ESM style for Node modules and keep shebang + executable bits for shell entrypoints.

Proposed File Layout

- `scripts/`
  - `entrypoint/` — (optional) shell or Node thin wrappers, e.g. `generate-compose` (executable)
  - `common/` — Node `.mjs` modules exporting pure functions for script logic
  - `bin/` or top-level `scripts/*.js` — thin Node CLIs that call into `scripts/common` (if not using shell entrypoints)

Example Migration Steps (one safe script at a time)

1. Pick a script to migrate (suggestion: `scripts/generate-compose.js` or `scripts/validate-config.js`).
2. Create `scripts/common/<script>.mjs` and move the pure logic there.
3. Replace the original CLI with a thin wrapper that imports `scripts/common/<script>.mjs` and handles argv mapping and exit codes.
4. Add unit tests for `scripts/common/<script>.mjs` under `tests/unit/`.
5. Repeat for other scripts where the pattern is beneficial.
6. (Optional) Add `scripts/entrypoint/*.sh` wrappers modeled after `patches/entrypoint` if POSIX shell wrappers or extra wrapper features are required.

Acceptance Criteria

- No duplication of `helpers/` logic should be introduced.
- At least one script is migrated with unit tests for the new `scripts/common` module.
- CLI behavior remains unchanged for migrated scripts.
- Documentation updated (README / `scripts/README.md`) describing the pattern and when to use each folder.

Risks and Mitigations

- Indirection: Keep modules well-named and small to avoid confusion.
- Incomplete migration: Migrate one script at a time and run tests.
- Path/import breakage: Use relative imports or existing path aliases in `jsconfig.json` and run `npm test`.

Implementation Estimate

- Prototype migration of `generate-compose` or `validate-config`: 1–2 hours (including tests).
- Full migration of all Node scripts: depends on the number of scripts; estimate 2–6 hours.

Notes

- If the team prefers minimal change, we can instead add a `scripts/README.md` describing the recommended pattern and only apply the pattern when duplication becomes visible.