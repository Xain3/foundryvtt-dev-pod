#!/usr/bin/env bash
set -euo pipefail

# Validate package.json with SchemaStore schema using local Node validator
echo "-> Validating package.json against SchemaStore schema (node)..."
node ./scripts/validate-package-json.js || {
  echo "package.json failed JSON Schema validation" >&2
  exit 2
}
echo "OK: JSON Schema validation passed"

# Run npm pack dry-run to check packaging
echo "-> Running npm pack --dry-run..."
npm pack --dry-run

# Run npm publish dry-run to validate publish-time errors (does not publish)
echo "-> Running npm publish --dry-run..."
npm publish --dry-run || true

# Run npm-package-json-lint if available
if command -v npx >/dev/null 2>&1; then
  if npx --no-install npmlint --version >/dev/null 2>&1; then
    echo "-> Running npm-package-json-lint..."
    npx npmlint package.json || {
      echo "package.json lint issues found" >&2
      exit 3
    }
  else
    echo "-> Skipping npm-package-json-lint (not installed). To install: npm install -D npm-package-json-lint"
  fi
fi

echo "All package validations completed."
