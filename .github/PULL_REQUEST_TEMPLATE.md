# Summary

Merge `dev` into `master` to sync recent development changes.

## Changes

- Scripts and pod utilities updates under `patches/`, `entrypoint/`, `scripts/`
- Test suite and coverage improvements under `tests/`
- Docs: CI & coverage configuration and usage

## CI & Coverage

- This PR will run the "PR Test & Coverage" workflow on push/PR.
- Jest produces coverage and the per-folder gate is enforced by `.github/scripts/check-coverage.js`.
- Thresholds are defined in `.github/constants/thresholds.json` and can be tuned per directory (prefix or regex).

## How to verify locally

```zsh
npm install
npm run test:ci
npm run check-coverage
```

If coverage is below thresholds for any group, the check fails with a table of failing metrics.
