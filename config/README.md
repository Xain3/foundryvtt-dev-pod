# Config directory

This directory contains project configuration used by helper modules and CLIs.

Purpose and file roles

- `constants.yaml` — Authoritative, code-level constants and capability definitions.
  - Intended for values that define program behavior, validation, and protocol
    or namespace-level names which should not be changed casually.
  - Examples: provider suffixes, supported secret modes, canonical paths, and
    environment variable names used by code.

- `defaults.yaml` — Baseline, tunable defaults intended for runtime or
  deployment use.
  - These values are safe and expected to be overridden by environment-specific
    configuration, CLI flags, or user-provided files.
  - Examples: service images, CLI fallback values, and runtime timing knobs.

Guidance

- Keep constants and defaults separate to make intent explicit.
- Use constants for validation lists and protocol-level names; use defaults for
  values that operators will override.
- If you must move values between files, update tests in the `config` folder
  and any code that reads those values.

Notes about current layout

- `fetchStaggerDefaults` has been moved to `defaults.yaml` because it represents
  runtime tuning values (timing) that deployments may want to change.
- `DEFAULT_SECRET_TARGET` (and related secret naming conventions) remain in
  `constants.yaml` and are referenced from `defaults.yaml` where appropriate.

Tests and updates

- Update or add unit tests under `config/*.unit.test.js` if you change file
  layouts or keys.

If you want, I can also update code that documents or reads these files to
  explicitly reflect the new location of `fetchStaggerDefaults`, and then run the
  unit tests. Would you like me to run the test suite now?

## How the configuration system works

This project centralizes configuration into three conceptual layers that are
exposed to consumers via `config/config.js`:

- `constants` — loaded from `config/constants.yaml` and exported by
  `config/constants.js`. These are authoritative, code-level constants: lists,
  canonical names, filesystem/container paths, and capability definitions. Code
  relies on these to validate inputs and implement protocol-level logic.

- `defaults` — loaded from `config/defaults.yaml` and exported by
  `config/defaults.js`. These are tunable baseline defaults (service images,
  CLI fallback values, timing knobs) intended to be overridden by operators
  or environment-specific configuration.

- `manifest` — loaded and validated from the project's `package.json` by
  `config/manifest.js`. The `ManifestParser` validates required attributes and
  freezes the resulting object so other modules can safely read package
  metadata (e.g., `name`, `version`).

At runtime consumers should import the central facade:

```js
import config from './config/config.js';

console.log(config.constants.generateCompose.basePort);
console.log(config.defaults.generateCompose.fallbackImage);
console.log(config.manifest.name, config.manifest.version);
```

## Files and helpers

- `config/config.js` — central facade that exposes `constants`, `defaults`,
  and `manifest` as frozen objects. Import this to get all configuration
  surfaces in one place.

- `config/manifest.js` — reads `package.json` from the project root, runs
  `helpers/manifestParser.js` to validate required fields, and exports a
  frozen manifest object. This ensures consumers always see a validated
  manifest and helps fail-fast on missing metadata.

- `config/helpers/` — contains small, testable utilities used to parse and
  validate YAML/JSON configuration. Key helpers:
  - `constantsBuilder.js` — builds the final constants object from YAML and
    resolves references where applicable.
  - `constantsGetter.js` / `constantsParser.js` — helpers for locating and
    parsing YAML files.
  - `manifestParser.js` — validates `package.json` attributes according to the
    configured required attributes.

## Practical notes

- Keep `constants.yaml` for code-level values and `defaults.yaml` for things
  operators will change.
- Defaults may reference constants (see `defaults.yaml` use of
  `${DEFAULT_SECRET_TARGET}`) — this pattern allows defaults to be defined in
  terms of authoritative constants.
- If you relocate keys between files, update the helpers/tests that read them
  or add a compatibility shim in `config/constants.js` or `config/defaults.js`.

If you'd like, I can now run the unit tests and fix any failures caused by the
`fetchStaggerDefaults` move, or add a small compatibility shim so both old and
new locations are supported. Which would you prefer?
