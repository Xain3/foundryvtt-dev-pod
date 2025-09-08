# Common <!-- omit in toc -->

This folder contains common modules used by scripts in the `scripts/` directory. These modules provide script-specific orchestration logic that is not suitable for the `helpers/` directory.

## Design Principles

- **Do NOT duplicate `helpers/`** - `helpers/` remains the single source of project-level domain logic (validation, path utils, etc.)
- **Script-specific orchestration only** - Only contain glue code, CLI option normalization, and small utilities that wrap `helpers/` functions
- **Pure functions** - Export pure functions that can be easily tested
- **ESM modules** - Use ES module syntax (`.mjs` extension)

## Files

### `validate-config.mjs`

Common module containing the core validation logic extracted from `scripts/validate-config.js`. This module provides:

- Configuration validation functions that wrap `helpers/config-validator.js`
- CLI argument parsing utilities
- Logging functions for validation results
- Main orchestration logic for the validation workflow

**Usage:**

```javascript
import { runConfigValidation, validateConfig } from '#scripts/common/validate-config.mjs';

// Run complete validation workflow
runConfigValidation(['config.json', '--no-cache']);

// Or use individual functions
const result = validateConfig('config.json');
if (!result.valid) {
  console.error('Validation failed:', result.errors);
}
```

## When to Use This Directory

Use `scripts/common/` for:

- ✅ Script-specific CLI argument parsing and normalization
- ✅ Orchestration logic that combines multiple `helpers/` functions
- ✅ Small utilities that are specific to script workflows
- ✅ Functions that need to be easily testable separately from CLI interfaces

Do NOT use `scripts/common/` for:

- ❌ Domain logic that should be in `helpers/` (config validation, path resolution, etc.)
- ❌ General utility functions that could be used across the project
- ❌ Business logic that doesn't relate to CLI script orchestration

## Testing

Unit tests for these modules should be placed in `tests/unit/scripts/common/` and follow the same testing patterns as other unit tests in the project.