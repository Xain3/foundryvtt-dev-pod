# Patch Templates Directory

This directory contains reusable templates for creating new patch wrappers in the FoundryVTT Dev Pod project.

## Files

- `XX-patch-entrypoint.sh.template`: A comprehensive template for creating new entrypoint wrappers. This file includes extensive inline documentation, API references, and best practices for consistent wrapper creation.

## Usage

To create a new patch wrapper:

1. Copy the template to the `patches/entrypoint/` directory:

   ```bash
   cp patches/templates/XX-patch-entrypoint.sh.template patches/entrypoint/NN-new-patch.sh
   ```

2. Customize the copied file by setting appropriate defaults (e.g., `WRAPPER_RUN_MODE`, `WRAPPER_NODE_BIN`).

3. Implement the corresponding Node.js script in `patches/common/new-patch.mjs`.

For detailed instructions, see the main [patches/README.md](../README.md).
