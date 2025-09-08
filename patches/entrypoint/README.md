# Entrypoint

This folder contains thin shell wrappers that are invoked by the container entrypoint, plus corresponding PowerShell wrappers for Windows development.

## Files

### Shell Wrappers (Unix/Linux/Container)
- `00-use-cache-or-stagger.sh`: Wrapper for cache and stagger logic.
- `10-sync-host-content.sh`: Wrapper for syncing host content.
- `20-install-components.sh`: Wrapper for installing components.

### PowerShell Wrappers (Windows)
- `00-use-cache-or-stagger.ps1`: Windows wrapper for cache and stagger logic.
- `10-sync-host-content.ps1`: Windows wrapper for syncing host content.
- `20-install-components.ps1`: Windows wrapper for installing components.

## Usage

**Linux/macOS/Containers:**
```bash
./patches/entrypoint/10-sync-host-content.sh --flag
```

**Windows PowerShell:**
```powershell
.\patches\entrypoint\10-sync-host-content.ps1 --flag
```

All wrappers delegate to the corresponding Node scripts in `../common/`.
