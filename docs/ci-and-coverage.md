# CI and Coverage

This project enforces unit test coverage on pull requests using GitHub Actions and Jest.

- Workflow: `.github/workflows/pr-test-coverage.yml`
- Node version: 18
- Test runner: Jest
- Coverage: Jest `--coverage` + per-folder gating via `.github/scripts/check-coverage.cjs`

## Threshold configuration

Thresholds are defined in `.github/constants/thresholds.json` and are loaded dynamically at runtime.

Example (current):

```json
[
  {
    "name": "scripts",
    "match_mode": "prefix",
    "match": "scripts/",
    "min": { "branches": 60, "functions": 75, "lines": 75, "statements": 75 }
  },
  {
    "name": "patches",
    "match_mode": "prefix",
    "match": "patches/",
    "min": { "branches": 60, "functions": 75, "lines": 75, "statements": 72 }
  }
]
```

- `match_mode` can be `prefix` or `regex`.
- `match` is either a path prefix or a regex pattern string.
- `min` sets required percentages for branches, functions, lines, and statements.

Override via environment variables:

- `THRESHOLDS_FILE`: path to a custom thresholds JSON file.
- `COVERAGE_SUMMARY`: path to the Jest `coverage-summary.json` file.

Notes about CI coverage generation

- The CI job should produce a single consolidated coverage report. Use the repository `test:ci` script which delegates to `test:combined` and runs Jest once across both `tests/unit` and `tests/integration` with `--coverage`.

- The `check-coverage.cjs` script was made more robust and will:
  - Respect `COVERAGE_SUMMARY` if set to an absolute path.
  - First look at `./coverage/coverage-summary.json` relative to the current working directory.
  - Also try a repo-root relative path derived from the script location (helps with worktrees or CI checkout differences).
  - As a final fallback it performs a bounded scan (depth-limited, skips `node_modules` and `.git`) for any `coverage-summary.json` under a coverage path and prints all attempted paths when it fails. This helps diagnose unexpected CI layouts.

## Local usage

```zsh
npm install
npm run test:ci
npm run check-coverage
```

If the per-folder check fails, the script prints a table per group and exits with non-zero status.
