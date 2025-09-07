# Entrypoint

This folder contains thin shell wrappers that are invoked by the container entrypoint.

## Files

- `00-use-cache-or-stagger.sh`: Wrapper for cache and stagger logic.
- `10-sync-host-content.sh`: Wrapper for syncing host content.
- `20-install-components.sh`: Wrapper for installing components.

These wrappers delegate to the corresponding Node scripts in `../common/`.
