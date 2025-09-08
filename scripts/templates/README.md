# Scripts Templates Directory

This directory contains reusable templates for creating new CLI scripts following the scripts entrypoint + common pattern in the FoundryVTT Dev Pod project. Templates are provided for multiple platforms to ensure cross-platform compatibility.

## Files

### JavaScript/Node.js Templates

- `script-wrapper.js.template`: Template for creating thin CLI wrapper scripts that delegate to common modules
- `script-common.mjs.template`: Template for creating common modules containing script orchestration logic

### Shell Script Templates

- `script-wrapper.sh.template`: Template for creating thin bash CLI wrapper scripts
- `script-common.sh.template`: Template for creating common bash modules with orchestration logic

### Windows Batch Templates

- `script-wrapper.bat.template`: Template for creating thin Windows batch CLI wrapper scripts
- `script-common.bat.template`: Template for creating common batch modules with orchestration logic

### PowerShell Templates

- `script-wrapper.ps1.template`: Template for creating thin PowerShell CLI wrapper scripts
- `script-common.ps1.template`: Template for creating common PowerShell modules with orchestration logic

## Design Pattern

The scripts directory follows a modular architecture inspired by the `patches/entrypoint` + `patches/common` pattern:

- **CLI Wrappers** (`scripts/`): Thin entry points that handle CLI interface and delegate to common modules
- **Common Modules** (`scripts/common/`): Pure orchestration functions that coordinate workflows but don't contain domain logic
- **Domain Logic** (`helpers/`): Core business logic that remains separate from CLI concerns

## Usage

To create a new script following this pattern, choose the appropriate template based on your target platform:

### JavaScript/Node.js Scripts

#### 1. Create the Common Module (JS)

```bash
cp scripts/templates/script-common.mjs.template scripts/common/new-script.mjs
```

Edit the file to:

- Replace `XX-script-name` with your script name
- Replace `[SCRIPT_DESCRIPTION]` with a description of what the script does
- Implement the `runMainWorkflow` function with your script's logic
- Import domain logic from `helpers/` as needed
- Add any additional exported functions required

#### 2. Create the CLI Wrapper (JS)

```bash
cp scripts/templates/script-wrapper.js.template scripts/new-script.js
```

Edit the file to:

- Replace `XX-script-name` with your script name
- Replace `[SCRIPT_DESCRIPTION]` with the same description
- Import and re-export the functions from your common module
- Ensure the file is executable: `chmod +x scripts/new-script.js`

### Shell Scripts (Linux/macOS)

#### 1. Create the Common Module (Shell)

```bash
cp scripts/templates/script-common.sh.template scripts/common/new-script.sh
```

#### 2. Create the CLI Wrapper (Shell)

```bash
cp scripts/templates/script-wrapper.sh.template scripts/new-script.sh
chmod +x scripts/new-script.sh
```

### Windows Batch Scripts

#### 1. Create the Common Module (Batch)

```cmd
copy scripts\templates\script-common.bat.template scripts\common\new-script.bat
```

#### 2. Create the CLI Wrapper (Batch)

```cmd
copy scripts\templates\script-wrapper.bat.template scripts\new-script.bat
```

### PowerShell Scripts

#### 1. Create the Common Module (PowerShell)

```powershell
Copy-Item scripts/templates/script-common.ps1.template scripts/common/new-script.ps1
```

#### 2. Create the CLI Wrapper (PowerShell)

```powershell
Copy-Item scripts/templates/script-wrapper.ps1.template scripts/new-script.ps1
```

### 3. Update Path Aliases (if needed)

If you need new path aliases for imports, add them to `jsconfig.json` and `package.json`:

```json
// jsconfig.json - compilerOptions.paths
"#scripts/common/*": ["./scripts/common/*"]

// package.json - imports
"#scripts/common/*": "./scripts/common/*"
```

## Platform-Specific Considerations

### JavaScript/Node.js

- Uses ES modules (`import`/`export`)
- Supports path aliases (`#helpers/*`, `#scripts/*`)
- Requires Node.js runtime
- Best for complex logic and cross-platform compatibility

### Shell Scripts (.sh)

- Native bash/zsh support on Unix-like systems
- No external dependencies required
- Good for system-level operations
- Use `set -euo pipefail` for robust error handling

### Windows Batch (.bat)

- Native Windows command interpreter
- Limited functionality compared to PowerShell
- Good for simple automation on Windows
- Use `setlocal enabledelayedexpansion` for variable handling

### PowerShell (.ps1)

- Modern Windows scripting with .NET integration
- Rich object-oriented capabilities
- Cross-platform support (PowerShell Core)
- Good for complex Windows automation

## Design Principles

1. **Separation of Concerns**: CLI logic in wrappers, orchestration in common modules, domain logic in helpers
2. **Testability**: Pure functions in common modules enable easy unit testing
3. **Backwards Compatibility**: CLI wrappers re-export all functions for external consumption
4. **Path Aliases**: Use clean imports with `#helpers/*`, `#scripts/*`, etc. (JavaScript only)
5. **Documentation**: All functions should have proper documentation headers
6. **Cross-Platform**: Choose appropriate template based on target platform requirements

## Example: validate-config.js

See the existing `validate-config.js` and `common/validate-config.mjs` for a complete implementation example following this pattern.

## Testing

When creating new scripts:

1. Add unit tests for the common module in `tests/unit/scripts/common/`
2. Add integration tests if the script affects CLI behavior in `tests/integration/`
3. Ensure all tests pass: `npm test`
4. Check coverage: `npm run check-coverage`

For detailed development guidelines, see the main project documentation and [CONTRIBUTING.md](../../CONTRIBUTING.md).
