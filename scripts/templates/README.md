# Scripts Templates Directory

This directory contains reusable templates for creating new CLI scripts following the scripts entrypoint + common pattern in the FoundryVTT Dev Pod project.

## Files

- `XX-script-wrapper.js.template`: Template for creating thin CLI wrapper scripts that delegate to common modules
- `XX-script-common.mjs.template`: Template for creating common modules containing script orchestration logic

## Design Pattern

The scripts directory follows a modular architecture inspired by the `patches/entrypoint` + `patches/common` pattern:

- **CLI Wrappers** (`scripts/`): Thin entry points that handle CLI interface and delegate to common modules
- **Common Modules** (`scripts/common/`): Pure orchestration functions that coordinate workflows but don't contain domain logic
- **Domain Logic** (`helpers/`): Core business logic that remains separate from CLI concerns

## Usage

To create a new script following this pattern:

### 1. Create the Common Module

Copy the common module template to implement your script's orchestration logic:

```bash
cp scripts/templates/XX-script-common.mjs.template scripts/common/new-script.mjs
```

Edit the file to:
- Replace `XX-script-name` with your script name
- Replace `[SCRIPT_DESCRIPTION]` with a description of what the script does
- Implement the `runMainWorkflow` function with your script's logic
- Import domain logic from `helpers/` as needed
- Add any additional exported functions required

### 2. Create the CLI Wrapper

Copy the wrapper template to create the CLI entry point:

```bash
cp scripts/templates/XX-script-wrapper.js.template scripts/new-script.js
```

Edit the file to:
- Replace `XX-script-name` with your script name
- Replace `[SCRIPT_DESCRIPTION]` with the same description
- Import and re-export the functions from your common module
- Ensure the file is executable: `chmod +x scripts/new-script.js`

### 3. Update Path Aliases (if needed)

If you need new path aliases for imports, add them to `jsconfig.json` and `package.json`:

```json
// jsconfig.json - compilerOptions.paths
"#scripts/common/*": ["./scripts/common/*"]

// package.json - imports
"#scripts/common/*": "./scripts/common/*"
```

## Design Principles

1. **Separation of Concerns**: CLI logic in wrappers, orchestration in common modules, domain logic in helpers
2. **Testability**: Pure functions in common modules enable easy unit testing
3. **Backwards Compatibility**: CLI wrappers re-export all functions for external consumption
4. **Path Aliases**: Use clean imports with `#helpers/*`, `#scripts/*`, etc.
5. **JSDoc Documentation**: All functions should have proper JSDoc headers

## Example: validate-config.js

See the existing `validate-config.js` and `common/validate-config.mjs` for a complete implementation example following this pattern.

## Testing

When creating new scripts:

1. Add unit tests for the common module in `tests/unit/scripts/common/`
2. Add integration tests if the script affects CLI behavior in `tests/integration/`
3. Ensure all tests pass: `npm test`
4. Check coverage: `npm run check-coverage`

For detailed development guidelines, see the main project documentation and [CONTRIBUTING.md](../../CONTRIBUTING.md).