# helpers <!-- omit in toc -->

This folder contains small utility modules used by the CLI scripts and test-suite.

**Contents:**

- [Files](#files)
- [Usage](#usage)
- [APIs](#apis)
- [Testing](#testing)
- [Notes](#notes)

## Files

- `config-validator.js`: Container configuration validation with optional JSON Schema support and simple caching.

- `pathUtils.js`: Small path helper for resolving relative filesystem-like paths against a runtime base.

## Usage

All helpers are authored as ES modules. The rest of the project uses CommonJS wrapper scripts which import these modules via `import` or `require` when executed with Node 18+.

### Examples (CommonJS style using dynamic `import()`) <!-- omit in toc -->

**Resolve a path via `pathUtils`:**

```js
const { default: PathUtils } = await import('./helpers/pathUtils.js');

const resolved = PathUtils.resolvePath(global, './data');
console.log(resolved);
```

**Validate a config file (with caching):**

```js
const { ConfigValidator, validateConfigWithCache } = await import('./helpers/config-validator.js');

const validator = new ConfigValidator({ schemaPath: './schemas/container-config.schema.json' });
const result = validateConfigWithCache('./container-config.json', './schemas/container-config.schema.json', './.cache', validator);
if (!result.valid) {
  console.error('Validation failed:', result.errors);
} else {
  console.log('Validation succeeded', result.cached ? '(cached)' : '');
}
```

## APIs

- `ConfigValidator` (class)
  - `new ConfigValidator(options)` — options may include `schemaPath` for JSON Schema validation.
  - `validate(configPath)` — validates structure (and schema if configured). Returns `{ valid: true }` or `{ valid: false, errors: [...] }`.

- `validateConfigWithCache(configPath, schemaPath, cacheDir, validator)`
  - Performs file-hash based caching to avoid repeated validation. Returns the validation result with an additional `cached` boolean.

- `calculateFileHash(filePath)`
  - Small helper used internally to create a reproducible short hash for cache keys. Exported for tests.

- `PathUtils` (default export)
  - `resolvePath(globalNamespace, value)` — resolves `value` relative to `globalNamespace.__basedir` or `globalNamespace.basePath` if present, otherwise `process.cwd()`. Accepts absolute paths unchanged and returns non-strings as-is.

## Testing

- Unit tests for these helpers live under `tests/unit/helpers/`.
- Run the full test-suite with:

```bash
npm test
```

## Notes

- The `config-validator` provides a lightweight structural validation even without a JSON Schema; enabling `schemaPath` adds AJV-based validation (Ajv is used in non-strict mode).
- The caching mechanism stores results in the provided `cacheDir` or system temporary directory. Cache keys combine config and schema file hashes.

If you want me to expand this README with more examples, TypeScript types, or a short design rationale, tell me which you'd prefer.
