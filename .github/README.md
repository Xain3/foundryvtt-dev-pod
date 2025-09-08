# .github directory <!-- omit in toc -->

This directory contains repository automation, CI workflows, and helper scripts
used by GitHub Actions and repository maintenance tasks. The files and
subdirectories are organized to make automation discoverable and easy to
maintain.

## Table of Contents <!-- omit in toc -->

- [Overview](#overview)
- [Details](#details)
- [Usage](#usage)
- [Contributing](#contributing)
- [Contact](#contact)

## Overview

- `workflows/`: GitHub Actions workflow YAML files. These define CI jobs,
  checks run on pull requests, and scheduled tasks.

- `scripts/`: Small scripts executed by CI or local helpers (e.g. coverage
  checks, schema syncing helpers).

- `constants/`: Supporting JSON used by CI scripts (e.g. coverage
  thresholds).

- `pull_request_template.md`: PR template that appears when opening a pull
  request; helps contributors provide required information.

- `copilot-instructions.md`: Contributor-facing instructions and guidance for
  the Copilot coding agent and human reviewers.

## Details

- `workflows/`

  - `pr-test-coverage.yml`: Runs tests, coverage collection and any coverage
    checks on pull requests. Useful for ensuring new changes meet quality and
    coverage expectations.

  - `validate-package.yml`: Validates `package.json` against the project
    schema and runs lightweight checks to prevent malformed packages.

  - `sync-package-schema.yml`: Automates syncing the `package.schema.json`
    into the repository (or runs checks that ensure the schema stays current).

  - `copilot-setup-steps.yml`: Bootstraps environment or prepares runners
    specifically for Copilot coding agent workflows (if used).

- `scripts/`

  - `check-coverage.cjs`: Node script that enforces coverage thresholds using
    the values located in `.github/constants/thresholds.json`.

  - `sync-package-schema.sh`: Shell helper to copy or update the package
    schema into the repository (used by workflows or maintainers).

- `constants/`

  - `thresholds.json`: JSON file storing coverage threshold values and other
    CI-related constants referenced by `check-coverage.cjs`.

## Usage

- For maintainers: edit workflows under `workflows/` to change CI behavior.

- To update coverage thresholds: change `.github/constants/thresholds.json`
  and adjust `check-coverage.cjs` if needed.

- The `pull_request_template.md` is used automatically by GitHub when opening
  new PRs; update it to change the information requested from contributors.

## Contributing

If you add or change automation, please:

- Update relevant documentation in this file.

- Add or update unit/integration tests that rely on changed automation.

- Ensure workflows remain readable and small; reuse scripts from
  `.github/scripts` when possible.

## Contact

If anything in these automation scripts is unclear, open an issue or tag a
maintainer in the pull request for clarification.
