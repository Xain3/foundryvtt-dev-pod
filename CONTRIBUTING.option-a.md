<!--
@file CONTRIBUTING.option-a.md
@description Contribution guide (Option A: concise & action-oriented)
@path CONTRIBUTING.option-a.md
-->

# Contributing

Thank you for considering a contribution! This Option A variant focuses on brevity and actionability.

## 1. License & Contributor Consent

All contributions are made under the existing project license. By opening a Pull Request you confirm you have the right to license your work under the terms in `LICENSE`.

## 2. Getting Started

```bash
npm install
npm test        # Lint + unit tests
npm run test:ci # CI-style (coverage output)
```
Minimum Node version: see `package.json` (>=18). Prefer creating a focused feature or fix branch.

## 3. Workflow Summary

1. Open/claim an issue or create a small one describing scope.
2. Branch: `git switch -c feat/<short-topic>` or `fix/<short-topic>`.
3. Implement change (follow style rules below).
4. Add/adjust tests + docs.
5. Open a DRAFT PR early for feedback.
6. Finalize checklist → mark PR ready.

## 4. Code Style & Quality

Authoritative rules live in `docs/code-style.md`. Non‑negotiables:

* File header block for all source files.
* JSDoc on every exported symbol (`@export`).
* 2‑space indentation; no tabs.
* Keep functions small (target ≤ 20 lines, ≤ 3 nesting levels).
* Maintain / improve coverage thresholds.

## 5. Directory README Requirement

Any non-trivial directory with exported logic, public scripts, or patch orchestration MUST contain `README.md` describing: purpose, key modules, special environment vars, and maintenance notes. Exempt: `tests/`, trivial `utils/` folders, pure data fixtures.

Minimal template:

```markdown
# <Directory Name>
Purpose: <one sentence>

Key Modules:
- `x.js`: role
- `y.js`: role

Usage Notes:
- <env vars / invocation>

Maintenance:
- <gotchas or update steps>
```

## 6. Tests & Coverage

* Unit tests: mirror source structure under `tests/unit/` (`*.unit.test.js`).
* Integration: broader flows in `tests/integration/` (`*.int.test.js`).
* Run locally: `npm test`; CI enforces thresholds via `.github/constants/thresholds.json`.
* Add edge cases for new branches / failure paths.

## 7. Documentation Updates

Update `README.md`, `docs/`, examples, or directory READMEs when you:

* Add/remove CLI flags or change defaults.
* Alter config schema validation logic.
* Introduce secrets mode behavior changes.
* Change patch ordering or add a new patch script.
* Expose new environment variables or container paths.
* Add new user-facing output artifacts (generated files / cache locations).

## 8. Dependency Policy

Be frugal. New dependency? Justify in PR description (size, maintenance, alternatives considered). Avoid large libs for trivial helpers.

## 9. Commit Messages (Recommended Format)

```text
area: imperative summary

Optional rationale / context / links.
```
Examples: `helpers: add config hash salt`; `patches: add retry around sync`.

## 10. PR Checklist

Copy into your PR description:

```text
- [ ] File headers added/updated
- [ ] JSDoc for all exports
- [ ] Tests added/updated; coverage ok
- [ ] Directory README added/updated (if needed)
- [ ] Docs / examples updated (if behavior changed)
- [ ] No noisy logging left
- [ ] New dependencies justified (if any)
- [ ] Ran npm test locally
```

## 11. Patch / Shell Script Notes

Keep shell patches minimal; move complex logic into JS helpers. Preserve shebang + executable bit.

## 12. Asking for Help

Open a draft PR or issue with specific questions. Incremental improvement > large unreviewed rewrites.

Happy hacking!
