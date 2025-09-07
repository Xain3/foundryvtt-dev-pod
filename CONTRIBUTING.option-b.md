<!--
@file CONTRIBUTING.option-b.md
@description Contribution guide (Option B: comprehensive & explanatory)
@path CONTRIBUTING.option-b.md
-->

# Contributing (Comprehensive Guide)

This expanded version explains rationale, structure, and expectations. Prefer this if you want deeper onboarding context.

## 1. Project Philosophy
Clarity, testability, and incremental evolution. Avoid over-engineering; small composable helpers + explicit validation.

## 2. License & IP Notice
All contributions are licensed under the repository's `LICENSE`. By contributing you affirm you have the right to submit the code/content.

## 3. Environment & Tooling
* Node >= 18 (see `package.json` engines field if present).
* Install deps: `npm install`.
* Primary commands:
  * `npm test` – ESLint + Jest (unit + some integration) in one pass.
  * `npm run test:ci` – Coverage run (used locally to approximate CI).
  * `npm run check-coverage` – Enforces thresholds from `.github/constants/thresholds.json`.

## 4. Repository Structure Overview
| Path | Purpose |
|------|---------|
| `scripts/` | Thin CLI entrypoints (`fvtt-compose-gen`, `fvtt-pod`, validators). |
| `helpers/` | Core JS logic (validation, path utilities). |
| `config/` | Config composition & constants building from YAML + JS. |
| `patches/` | Shell / JS patch logic executed inside containers. |
| `patches/entrypoint/` | Ordered patch execution sequence. |
| `tests/unit/` | Unit tests mirroring helpers & config modules. |
| `tests/integration/` | Cross-cutting flows & CLI behavior. |
| `docs/` | Supplemental documentation (style, CI coverage). |
| `examples/` | Example compose files & config JSON. |

## 5. Style & Documentation Baseline
Full authoritative rules: `docs/code-style.md`.
Critical highlights:
* Mandatory file header block for every source file.
* JSDoc on all exported symbols (`@export`).
* Keep functions focused (≤ 20 lines typical, ≤ 3 nested levels).
* Consistent naming: `camelCase`, `PascalCase`, `UPPER_SNAKE_CASE`.
* Avoid hidden side effects; validation centralized.

## 6. Directory README Policy
Any directory introducing functionality (exported logic, patch orchestration, scripts) must have `README.md` documenting:
* Purpose & scope
* Key files / entrypoints
* Environment variables or required external tools
* Maintenance notes (ordering, caching, side effects)

Template:
```markdown
# <Directory Name>
Purpose: <one sentence>

Key Modules:
- `fileA.js`: <role>
- `fileB.js`: <role>

Environment / Inputs:
- VAR_NAME: meaning (if any)

Maintenance:
- <patch ordering / update steps>
```
Exempt: `tests/`, minor `utils/`, pure data containers.

## 7. Validation & Schema Changes
When updating config schemas or validation logic:
1. Adjust schema files under `schemas/` (if structure changes).
2. Update validators in `helpers/config-validator.js` or related helpers.
3. Add / modify unit tests covering success + failure modes.
4. Document new or removed fields in `README.md` + examples.

## 8. Patch & Shell Script Conventions
* Preserve shebangs and executable bits.
* Heavy logic -> JS helpers; shell acts as orchestrator.
* Keep ordering explicit (see `patches/entrypoint/`).
* Avoid interactive prompts; operate via env vars or config only.

## 9. Tests Strategy
Unit tests aim for tight, deterministic coverage of logic branches. Integration tests validate real flows:
* Config validation caching behavior.
* Compose generation variations (secrets modes, root vs non-root, caching).
* Pod orchestration commands.
Add tests for:
* New CLI flags / options.
* Additional secrets modes or environment flows.
* New patch scripts (dry-run & failure modes where feasible).

## 10. Coverage Targets
Thresholds defined in `.github/constants/thresholds.json`. Maintain or raise them; do not lower without justified consensus.

## 11. Documentation Update Triggers
You must update docs (`README.md`, `docs/`, examples, directory READMEs) when any of these occur:
* New or changed CLI flags / arguments / exit behaviors.
* Added or removed config schema fields.
* Secrets mode semantics changed.
* Patch ordering modified or new patch introduced.
* New environment variables or container paths exposed.
* New generated artifacts or cache directories.

## 12. Dependency Governance
Before adding a dependency ask:
* Is it necessary vs a small local helper?
* Is it actively maintained and lightweight?
* Security / transitive risk acceptable?
Document justification in the PR description. Prefer zero-dependency utilities for simple tasks.

## 13. Commit Message Guidelines
Format:
```text
scope: imperative summary

(optional body clarifying rationale / alternatives / perf / security)
```
Scopes: `helpers`, `scripts`, `patches`, `config`, `docs`, `tests`, `infra`.

## 14. PR Review Expectations
Reviewer will check:
* Style compliance (`docs/code-style.md`).
* Adequate test coverage (branches + edge cases).
* Documentation updated where required.
* No silent behavioral changes.
* Dependency justification (if applicable).
* Patch scripts remain minimal and composable.

## 15. Suggested Local Flow
```bash
# 1. Sync & branch
git pull origin master
git switch -c feat/add-new-feature

# 2. Implement + write tests
npm test

# 3. Run coverage locally
npm run test:ci && npm run check-coverage

# 4. Open draft PR early
# 5. Address feedback, finalize checklist
```

## 16. PR Checklist
Copy into PR description:
```text
- [ ] File headers + JSDoc present
- [ ] Tests added/updated; coverage maintained
- [ ] Directory READMEs added/updated
- [ ] Docs/examples updated if behavior changed
- [ ] No unnecessary logs
- [ ] Dependency additions justified (if any)
- [ ] Ran npm test + coverage locally
```

## 17. Performance & Security Notes
Do not prematurely optimize; measure if performance critical. Validate all external input paths. Avoid executing unsanitized shell fragments or user-provided arguments directly.

## 18. Asking Questions / Proposals
Open an issue or draft PR describing intent, motivation, and alternatives. Use concise examples. We iterate fast; small proposals > large speculative rewrites.

## 19. Amendments
This guide evolves. Propose changes via PR referencing concrete friction or ambiguity you observed.

Thanks for contributing thoughtfully!
