<!--
@file pull_request_template.md
@description Default PR template embedding the project's checklist and key guidance
@path .github/pull_request_template.md
-->

# Title: concise imperative summary

## Summary

- Brief description of the change and motivation.

## Related issue

- Fixes / relates to: # (issue number)

## Implementation notes

- What changed, high level
- Key files / modules

## Key Changes

### Change 1

- High-level areas changed (e.g. `patches/`, `entrypoint/`, `scripts/`, `tests/`, `docs/`)
- Rationale for approach, tradeoffs, alternatives considered

### Change 2

- See above


## Testing

- How to run and what to expect

- **CI & Coverage**: This repository runs a PR Test & Coverage workflow. Jest produces coverage and per-folder gates are enforced by `.github/scripts/check-coverage.cjs`. Thresholds live in `.github/constants/thresholds.json`.

## How to verify locally

```zsh
npm install
npm run test:ci
npm run check-coverage
```

## Docs

- What docs were updated (README, docs/, examples/, directory README)

## File modified (optional)

## PR Checklist

- [ ] **File headers**: All new/changed source files include the required JSDoc header block
- [ ] **JSDoc**: All exported symbols have JSDoc (`@export` where applicable)
- [ ] **Lint & Tests**: Lint passes and tests added/updated (`npm test`)
- [ ] **Coverage**: Coverage maintained or improved (see `.github/constants/thresholds.json`)
- [ ] **Directory README**: New or changed directories include `README.md` if they expose logic or configs
- [ ] **Docs**: `README.md`, `docs/`, and `examples/` updated if user-facing behavior changed
- [ ] **No debug logs**: No unnecessary console/debugging output
- [ ] **Dependencies**: New dependencies justified in PR description (if any)

## Notes for reviewers

- Any special attention requested

---

If you need help running tests or adding documentation, mention it here and assign reviewers as needed.
