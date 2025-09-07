# Common

This folder contains shared shell helpers and Node.js patch scripts used by the patching system.

## Files

- `wrapper-bin.sh`: Generic executable logic for wrappers.
- `wrapper-lib.sh`: Pure helper functions, safe to source.
- `install-components.mjs`: Node script for installing components.
- `sync-host-content.mjs`: Node script for syncing host content.
- `use-cache-or-stagger.mjs`: Node script for cache and stagger logic.
- `XX-patch-entrypoint.sh.template`: Template for creating new wrappers.
- `helpers/`: Subfolder with additional helper modules.
