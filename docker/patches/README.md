# Docker patches

This folder contains the patching system used by the container entrypoint.

- `entrypoint/`: very thin shims invoked by the entrypoint. Keep this folder tidy.
- `common/`: shared shell helpers and Node patch scripts.

## Wrapper design

Wrappers live in `entrypoint/` and are named using:

- Optional numeric prefix: ordering hint for entrypoint (e.g. `10-...`).
- Patch name: maps to the Node script of the same name in `common/`.
- Suffix: `.sh`.

Example: `10-sync-host-content.sh` delegates to `common/sync-host-content.mjs`.

Wrappers source `common/wrapper-bin.sh` and call `wrapper_main`. The generic
bin resolves metadata from the wrapper filename and handles dry-run, logging,
argument forwarding, and Node binary selection.

### Modes

- `default` (WRAPPER_RUN_MODE=default): one-shot invocation of the Node script with
  `--procedural-number` and `--patch-name`.
- `sync-loop` (WRAPPER_RUN_MODE=sync-loop): run an initial foreground pass, then
  start a background loop.

### Environment

- `NODE_BIN` or `WRAPPER_NODE_BIN`: Node executable to use (default: `node`).
- `PATCH_DRY_RUN` / `DRY_RUN`: non-empty and not "0" enables dry-run.
- CLI flags: `--dry-run` / `-n` also enable dry-run.

On dry-run, the wrapper prints the command(s) that would have run and does not
require `node` to be present.

### Overriding target script(s)

Wrappers normally infer the target script from their filename. You can override
this by passing one or more `--wrapper-target` flags:

- Single value: `--wrapper-target install-components`
- With extension: `--wrapper-target install-components.mjs`
- Relative path: `--wrapper-target other/utility`
- Absolute path: `--wrapper-target /abs/path/to/script.mjs`
- Multiple values: `--wrapper-target a,b --wrapper-target c`

Notes:

- Values without an explicit extension get the current wrapper extension appended (default `.mjs`).
- Relative values resolve against `docker/patches/common` (same dir as `.mjs`).
- When multiple override targets are provided, each one is invoked with the same
  arguments and flags.

### Script extension

By default, scripts use the `mjs` extension. You can override this using either
an environment variable or a CLI flag:

- Env: set `WRAPPER_SCRIPT_EXT=cjs` (or `.cjs`)
- Flag: pass `--wrapper-ext cjs` (or `--wrapper-ext .cjs`)

Examples:

- `--wrapper-ext cjs --wrapper-target install-components` runs `install-components.cjs`
- `--wrapper-ext .mjs --wrapper-target tools/setup` runs `tools/setup.mjs`
- `WRAPPER_SCRIPT_EXT=cjs ./entrypoint/20-install-components.sh --wrapper-target helpers/prepare`

### Adding a new wrapper

1. **Start with the template**: Copy `common/XX-patch-entrypoint.sh.template` to `entrypoint/[NN-]my-patch.sh`:
   ```bash
   cp docker/patches/common/XX-patch-entrypoint.sh.template docker/patches/entrypoint/30-my-patch.sh
   ```

2. **Customize the wrapper**: Edit the copied file to set appropriate defaults:
   - Set `WRAPPER_RUN_MODE` ("default" for one-shot, "sync-loop" for background)
   - Optionally override `WRAPPER_NODE_BIN` if needed
   - Review the extensive template documentation for advanced options

3. **Implement the Node.js script**: Create `common/my-patch.mjs` to receive:
   - `--procedural-number` and `--patch-name` (automatically injected)
   - Any additional arguments passed through the wrapper

**Minimal wrapper example** (if not using template):
```bash
#!/usr/bin/env bash
set -euo pipefail
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/common"
# shellcheck disable=SC1090
source "${LIB_DIR}/wrapper-bin.sh"

export WRAPPER_RUN_MODE="default" # or "sync-loop"
export WRAPPER_NODE_BIN="${NODE_BIN:-node}"
wrapper_main "$@"
```

## Common files

- `common/wrapper-lib.sh`: pure helper functions, safe to source.
- `common/wrapper-bin.sh`: generic executable logic used by wrappers.
- `common/*.mjs`: Node-based patch implementations.

## Testing Infrastructure

The patch system includes comprehensive unit tests ensuring reliability and preventing regressions:

- **Wrapper functionality tests**: `docker/tests/unit/patches/common/wrapper-lib.unit.test.js` and `wrapper-bin.unit.test.js`
- **Individual patch tests**: Tests for each Node.js patch script (e.g., `sync-host-content.unit.test.js`, `install-components.unit.test.js`)
- **Dry-run testing framework**: Validates command generation without actual execution
- **Environment variable testing**: Ensures proper handling of configuration flags like `PATCH_DRY_RUN`, `WRAPPER_RUN_MODE`
- **Integration testing**: End-to-end wrapper functionality and script delegation

Run tests with:
```bash
npm test  # All tests including patch system
npm run test:unit -- docker/tests/unit/patches/  # Patch tests only
```

## Template Usage

For consistent wrapper creation, use the comprehensive template at `common/XX-patch-entrypoint.sh.template`. This template includes:

- **Extensive inline documentation** covering the wrapper architecture and contracts
- **Complete API reference** for wrapper-lib.sh and wrapper-bin.sh functions
- **Environment variable documentation** with precedence rules
- **Example usage patterns** and best practices

Copy and customize the template for new wrappers:
```bash
cp docker/patches/common/XX-patch-entrypoint.sh.template docker/patches/entrypoint/30-my-patch.sh
# Edit the copied file to set WRAPPER_RUN_MODE and other specifics
```

## Help System

The wrapper framework provides comprehensive built-in help accessible via `--help` or `-h` flags:

```bash
# Get detailed usage information for any wrapper
./docker/patches/entrypoint/10-sync-host-content.sh --help
./docker/patches/entrypoint/00-use-cache-or-stagger.sh -h
```

Help output includes:
- **CLI flag documentation** with examples
- **Environment variable reference** 
- **Override capabilities** (target scripts, extensions)
- **Execution mode explanations**

## Error Handling & Logging

The wrapper system uses standardized logging patterns for consistent output:

- **Standard messages**: `[patch] <wrapper-name>: <message>` for normal operations
- **Dry-run messages**: `[patch][dry-run] Would run: <command>` for dry-run mode
- **Error messages**: `[patch][error] <error-description>` for failures (sent to stderr)

Examples:
```
[patch] sync-host-content: Delegating to Node.js script
[patch][dry-run] Would run: node sync-host-content.mjs --procedural-number 10
[patch][error] Node executable '/nonexistent/node' not found
```

## Dry-run examples

```bash
bash docker/patches/entrypoint/00-use-cache-or-stagger.sh -n --foo bar
bash docker/patches/entrypoint/10-sync-host-content.sh -n
```
