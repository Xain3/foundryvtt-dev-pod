<!--
@file CONTRIBUTING.option-c.md
@description Contribution guide Option C (Minimalist + Inline Checklists)
@path CONTRIBUTING.option-c.md
-->

# Contributing (Option C – Minimalist)

Focused quick-reference. For full style rules see `docs/code-style.md`.

## License

Contributing = agreeing your work is licensed under the repo `LICENSE`.

## Prerequisites

```bash
npm install
npm test        # lint + unit
npm run test:ci # coverage mode
```
Node >= 18.

## Code Style (Top 5 Musts)

1. File header JSDoc block at top of every source file.
2. JSDoc (`@export`) on each exported function/class.
3. Small functions (≤ 20 lines; early returns).
4. 2-space indentation, descriptive names, consistent casing.
5. Tests + coverage thresholds maintained.
Full details: `docs/code-style.md`.

## Directory README Rule

If a folder contains exported logic, scripts, patch orchestration, or non-trivial config: add `README.md` (purpose, key files, env vars, maintenance). Skip for `tests/`, trivial `utils/`, data fixtures.

## When to Update Docs

Update `README.md`, `docs/`, examples, and relevant folder README when you:

* Change/add CLI flags
* Alter config schema / validation
* Change secrets mode behavior
* Add/modify patch scripts / ordering
* Introduce env vars / container paths
* Add user-visible artifacts

## Tests

* Unit: `tests/unit/` (`*.unit.test.js`)
* Integration: `tests/integration/` (`*.int.test.js`)
* Keep deterministic; no network flakiness.

## Commits (Recommended)

```text
area: imperative summary
```
Examples: `docs: clarify secrets modes`; `helpers: add hash cache bust`.

## Dependencies

Add only with justification; prefer local helpers.

## PR Checklist

Paste & fill:

```text
- [ ] Headers + JSDoc
- [ ] Tests/coverage ok
- [ ] Directory README (if needed)
- [ ] Docs/examples updated (if needed)
- [ ] No noisy logs
- [ ] Dependency justification (if any)
```

## Need Help?

Open a draft PR or small issue early.

Ship small. Iterate fast. ✅
