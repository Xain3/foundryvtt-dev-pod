# Schemas

This directory contains JSON Schema files used for validating configuration files in the FoundryVTT Dev Pod project.

## Files

- `container-config.schema.json`: JSON Schema for validating `container-config.json` files, which define Docker container configurations for Foundry VTT development environments.
- `package.schema.json`: JSON Schema for validating `package.json` files, ensuring compliance with project-specific requirements and metadata.

These schemas help ensure that configuration files are correctly formatted and contain all necessary fields before generating Docker Compose files or running the development pod.
