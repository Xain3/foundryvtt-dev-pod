<!--
@file CONTRIBUTING.md
@description Primary contribution guide (hybrid of journey + comprehensive details)
@path CONTRIBUTING.md
-->

# Contributing

Welcome! This guide blends a friendly step-by-step journey with concise reference details so you can move quickly while staying consistent.

If you prefer a minimal checklist, skim the headers and jump to the PR Checklist.

---

## 0. Core Principles (Quick Feel)

Clarity over cleverness. Small, testable helpers. Predictable validation. Incremental improvements. Empathy for the next maintainer.

---

## Step 1: License & Consent

By contributing you agree your work is provided under the repository's `LICENSE` and you have the right to submit it.

---

## Step 2: Pick / Propose Work

* Grab an existing issue OR open one describing: problem, proposed change, impact, validation approach.
* Prefer a narrow slice over a sprawling “mega” PR.
* Draft PRs early are encouraged.

---

## Step 3: Environment Setup

**Node >= 18 required.**
Check that you have the right version installed.

```bash
node -v
```

Then install dependencies and verify tests pass:

```bash
npm install
npm test        # lint + unit
npm run test:ci # coverage locally
```

Compose flow (example):

```bash
npx fvtt-compose-gen -c container-config.json -o compose.dev.yml
npx fvtt-pod -f compose.dev.yml up -d
```

---

## Step 4: Repository Structure (Orient Yourself)

| Path | Purpose |
|------|---------|
| `scripts/` | Thin CLI entrypoints (`fvtt-compose-gen`, `fvtt-pod`, validators). |
| `helpers/` | Core JS logic (validation, path utilities). |
| `config/` | Config + constants assembly from YAML/JS. |
| `patches/` | Shell / JS patch logic for containers. |
| `patches/entrypoint/` | Ordered patch execution sequence. |
| `tests/unit/` | Unit tests mirroring logic paths. |
| `tests/integration/` | End-to-end and CLI workflows. |
| `docs/` | Style, CI, and supplemental docs. |
| `examples/` | Example compose + config files. |

---

## Step 5: Implement with Style

Authoritative detail: `docs/code-style.md`. Snapshot reminders:

* File header JSDoc block at top of every source file.
* JSDoc with `@export` for all exported symbols.
* Functions: small (≈ ≤20 lines), early returns, minimal nesting.
* Naming: `camelCase`, `PascalCase`, `UPPER_SNAKE_CASE` for constants.
* Avoid duplication of validation logic—reuse `helpers/config-validator.js`.
* Shell patches: minimal; complex logic belongs in JS helpers.

### Using Path Aliases

The project provides path aliases for cleaner imports:

**In your IDE** (jsconfig.json support):
```javascript
import validator from '#helpers/config-validator';
import config from '#config/constants';
import patch from '#patches/common/helper';
```

**For external packages** (package exports):
```javascript
const validator = require('foundryvtt-dev-pod/helpers/config-validator');
const jsConfig = require('foundryvtt-dev-pod/jsconfig.json');
```

Use these aliases instead of relative paths (`../../helpers/...`) for better maintainability.

---

## Step 6: Test & Validate

Add/update tests while coding—not after:

* Unit tests under `tests/unit/` (structure mirrors source; `*.unit.test.js`).
* Integration tests for CLI flows, multi-service behavior, or patch sequencing.
* Keep tests deterministic (no flaky timing or real network calls).
* Ensure coverage thresholds (see `.github/constants/thresholds.json`) stay green.

---

## Step 7: Update Documentation

Update docs if ANY of these changed:

* CLI flags / arguments / exit codes
* Config schema fields or validation semantics
* Secrets mode behavior or supported modes
* Patch scripts added / ordering changed
* Environment variables or container paths introduced/removed
* Generated artifacts (compose filenames, cache paths)

Targets to review/update:

* Root `README.md`
* `docs/` (style, CI, feature docs)
* `examples/` (regenerate if flags/fields change)
* Relevant directory `README.md`

---

## Step 8: Directory README Policy

Any directory introducing exported behavior, CLI orchestration, patch strategy, or schema shaping MUST have a `README.md` explaining:

* Purpose & scope
* Key modules / entrypoints
* Environment variables or inputs
* Maintenance notes (ordering, regeneration, caching)

Template:

```markdown
# <Directory>
Purpose: <one line>

Key Modules:
- `fileA.js`: role
- `fileB.js`: role

Environment / Inputs:
- VAR_NAME: meaning

Maintenance:
- ordering / gotchas / regeneration steps
```

Exempt: `tests/`, trivial `utils/`, pure data fixtures.

---

## Step 9: Dependency Governance

Before adding a dependency ask:

1. Can this be a tiny local helper instead?
2. Is it actively maintained & lightweight?
3. Any security / transitive concerns?

Document justification in the PR description.

---

## Step 10: Commit Messages

Follow the style guide pattern (`docs/code-style.md`). Use a type + area prefix + imperative summary:

```text
type(area): concise imperative summary

Optional body explaining rationale, tradeoffs, links.
```

Examples of `type`: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
Examples of `area`: `helpers`, `scripts`, `patches`, `config`, `docs`, `tests` (use `infra` only if infrastructure-specific patterns emerge).

Examples:

```text
feat(helpers): add config hash salt for validator cache
fix(patches): add retry/backoff to sync-host-content
docs: clarify secrets mode behavior table
test: cover non-root compose generation path
```

---

## Step 11: Open a Draft PR

Include: summary, why, test evidence (snippet or description), doc impact, any follow-ups deferred.

---

## Step 12: Finalize & Checklist

Before marking Ready for Review ensure:

```text
- [ ] File headers + JSDoc present
- [ ] Tests added/updated; coverage maintained
- [ ] Directory READMEs added/updated where required
- [ ] Docs/examples updated if behavior changed
- [ ] No unnecessary logs / debug noise
- [ ] Dependency additions justified (if any)
- [ ] Ran npm test + (optionally) coverage locally
```

### Automated Header Enforcement

All changed `*.js`, `*.mjs`, `*.cjs` files in a pull request are validated by the "Header Check" GitHub Action to ensure they begin with the required JSDoc file header block containing at minimum: `@file`, `@description`, `@path`.

Run locally before pushing:

```bash
npm run check:headers
```

To customize (rare), create a JSON config and invoke the script directly:

```bash
node scripts/check-file-headers.mjs --config header-check.config.json path/to/file.js
```

Current required fields can be extended by editing the optional config JSON with:

```json
{
  "requiredFields": ["@file", "@description", "@path", "@author"],
  "ignoreGlobs": ["tests/*"]
}
```

Files missing headers or tags will cause the CI job to fail.

Rebase onto `master` if needed to avoid noisy merge commits.

---

## Step 13: Review & Iterate

Address feedback with incremental commits. Summarize non-obvious changes in comments. Avoid force-push until conversation stabilizes (unless rewriting history for final clean merge).

---

## Step 14: Merge Hygiene

Squash (preferred) or rebase merge with a clean, informative final message.

---

## Step 15: Post-Merge Stewardship

Confirm docs & examples accurately reflect merged behavior. Open follow-up issues for deferred improvements rather than bloating the closed PR.

---

## Performance & Security Notes

* Measure before optimizing; keep clarity first.
* Validate all external inputs via existing validator patterns.
* Avoid executing unsanitized shell fragments / user inputs.

---

## Getting Help

Unsure or exploring? Open a draft PR early or a small issue outlining context + goals. We value early visibility over late rework.

---

## Amendments

Found friction? Propose an improvement via PR referencing the scenario. This guide evolves with the project.

---

Thanks for contributing — ship confidently and iterate responsibly. 🚀
