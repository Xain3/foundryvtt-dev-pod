<!--
@file code-style.md
@description Canonical code style and contribution rules for source files
@path docs/code-style.md
-->

# Code Style & Conventions

This document defines the authoritative style rules for this repository. All new and modified source files must comply. The CI will eventually enforce these (ESLint + tests + coverage). When in doubt, prefer clarity and consistency with existing code.

## 1. File Preamble

Every JavaScript (and shell helper where applicable after shebang) source file must start with the exact JSDoc header block (update the file name & path):

```js
/**
 * @file filename.js
 * @description Short description of purpose
 * @path relative/path/from/project/root
 */
```

Place it immediately after the shebang (`#!/usr/bin/env node`) if one exists.

## 2. Modules & Imports

* Project uses **ESM modules** (`type: module`). Use `import` / `export`.
* Group imports: Node core, third-party, local modules.
* Avoid side-effect imports except polyfills or environment setup.
* **Use path aliases** when available for cleaner imports:
  ```javascript
  // Preferred - using aliases
  import validator from '#helpers/config-validator';
  import config from '#config/constants';
  
  // Avoid - relative paths
  import validator from '../../helpers/config-validator';
  ```

### Path Aliases Available

* `#/*` - Project root
* `#scripts/*` - CLI scripts
* `#helpers/*` - Helper modules  
* `#config/*` - Configuration
* `#patches/*` - Patch system
* `#tests/unit/*` - Unit tests
* `#tests/integration/*` - Integration tests
* `#docs/*` - Documentation
* `#examples/*` - Examples
* `#schemas/*` - JSON schemas

## 3. Naming

* `PascalCase` for classes.
* `camelCase` for variables, functions, and object properties.
* `UPPER_SNAKE_CASE` for constants (values that never change at runtime).
* Be descriptive; avoid cryptic abbreviations. Acceptable short forms: `cfg` (config), `ctx` (context).

## 4. Functions & Complexity

* Target ≤ 20 lines and ≤ 3 nesting levels. Refactor helpers early.
* Prefer early returns; avoid deep `if`/`else` pyramids.
* Do not use `eval` or `with`.
* Keep functions doing one logical thing; split if handling multiple responsibilities.

## 5. JSDoc Requirements

All exported symbols (functions, classes, utilities) must include JSDoc:

```js
/**
 * Brief summary in one line.
 * Additional context (optional) in a short paragraph.
 * @param {Type} paramName Description
 * @returns {ReturnType} Description
 * @throws {ErrorType} When condition (if applicable)
 * @export
 */
```

For classes, document public API methods. Private helpers (non-exported) should also have concise JSDoc when non-trivial.

## 6. Error Handling

* Throw `Error` (or subclass) with actionable messages; include context (file/operation) when useful.
* Use `try/catch` only around code that can realistically fail.
* Prefer propagating errors over swallowing. If intentionally ignored, comment why.

## 7. Logging

* Use `console` sparingly in library/helper code; callers decide verbosity.
* Debug-only logs should be behind environment flags in future enhancements.

## 8. Data & Immutability

* Avoid mutating input objects unless clearly documented.
* Clone shallow structures before modification when ambiguity exists.

## 9. Tests

* Unit tests colocated under `tests/unit/` mirroring path structure of source.
* File naming: `*.unit.test.js` for unit, `*.int.test.js` for integration.
* Add focused tests for each new feature branch path and edge case.
* Keep tests deterministic; avoid timing assumptions or network unless mocked.

## 10. Coverage Expectations

* Maintain or improve coverage ratios enforced by `.github/constants/thresholds.json`.
* New modules should launch with near-complete (≈90%+) statement/branch coverage.

## 11. Shell Scripts & Patches

* Preserve shebangs and executable bits.
* Shell patch wrappers kept minimal; heavy logic belongs in JS helpers.
* Prefer POSIX-compliant constructs; avoid bashisms unless required by container base images.

## 12. Formatting & Lint

* Run `npm test` before pushing (runs ESLint + Jest).
* Indentation: 2 spaces (no tabs) in all languages.
* Line length: Aim ≤ 100 chars; wrap earlier for readability.
* Trailing spaces: none. End files with a newline.

## 13. Commit Messages (Recommended)

Format (present tense):

```text
type(area): concise imperative summary

Optional body explaining rationale, tradeoffs, links.
```

Examples of `type`: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
Examples of `area`: `helpers`, `scripts`, `patches`, `docs`, `tests`, `config`.

Examples:
`feat(helpers): add config hash salt`
`fix(patches): add retry around sync`

## 14. Directory README Requirement

Any non-trivial directory (containing exported modules, scripts, or patch strategy) must have a `README.md` describing purpose and key entry points. Tests and trivial util-only folders are exempt.

## 15. Adding New Dependencies

* Justify in PR description; prefer zero-dependency implementations for simple tasks.
* Avoid large libraries for trivial utilities.
* Keep `package.json` scripts focused and documented in the main `README.md` if user-facing.

## 16. Configuration & Constants

* Centralize constants; avoid scattering duplicated literal values.
* Use helper builders/getters as existing patterns show (`config/helpers/*`).

## 17. Performance

* Avoid premature optimization; measure first if complexity increases.
* Prefer clarity unless performance-critical path is proven.

## 18. Security & Validation

* Validate external inputs (files, environment vars) via existing validator patterns.
* Never execute untrusted shell input without sanitization.

## 19. PR Checklist (Copyable)

Before requesting review:

* [ ] File headers present
* [ ] JSDoc for all exports
* [ ] Lint passes (`npm test`)
* [ ] Tests added/updated & coverage maintained
* [ ] Directory READMEs added/updated
* [ ] Docs (`README.md` / `docs/`) updated if behavior or flags changed
* [ ] No unnecessary console noise
* [ ] Justification for any new dependency

## 20. Style Drift

If you find existing code violating these rules, prefer incremental improvement. Do not reformat large swaths unrelated to your change unless pre-approved.

---
Questions or ambiguities? Open a draft PR or issue describing the case; we can amend this guide as the project evolves.
