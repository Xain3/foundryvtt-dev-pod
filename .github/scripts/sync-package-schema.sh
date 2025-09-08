#!/usr/bin/env bash
set -euo pipefail

# Sync local schemas/package.schema.json with SchemaStore online copy
REMOTE_URL="${REMOTE_URL:-https://json.schemastore.org/package.json}"
LOCAL_PATH="schemas/package.schema.json"

echo "-> Fetching remote schema..."
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
# Follow redirects and prefer JSON content
curl -sSL -H "Accept: application/schema+json,application/json,text/json" "$REMOTE_URL" -o "$TMP"

if [ $? -ne 0 ] || [ ! -s "$TMP" ]; then
  echo "Failed to fetch remote schema." >&2
  exit 2
fi

# Quick check: if the fetched file looks like HTML, abort to avoid writing HTML as schema
firstchar=$(head -c 1 "$TMP" 2>/dev/null || echo '')
if [ "${firstchar}" = "<" ]; then
  echo "Fetched content looks like HTML (starts with '<'). Aborting to avoid saving HTML as schema." >&2
  echo "You can retry with REMOTE_URL or check network/redirects." >&2
  exit 3
fi

if [ ! -f "$LOCAL_PATH" ]; then
  echo "Local schema missing; creating $LOCAL_PATH"
  mkdir -p "$(dirname "$LOCAL_PATH")"
  mv "$TMP" "$LOCAL_PATH"
  if [ "${NO_PUSH:-0}" = "1" ]; then
    echo "NO_PUSH=1: updated local schema file but skipping commit/push (CI mode)"
    exit 0
  fi
  git add "$LOCAL_PATH"
  git commit -m "chore(schemas): add package.schema.json (mirror from SchemaStore)" || true
  echo "Created local schema and committed."
  exit 0
fi

LOCAL_HASH=$(sha256sum "$LOCAL_PATH" | awk '{print $1}')
REMOTE_HASH=$(sha256sum "$TMP" | awk '{print $1}')

if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
  echo "Local schema is up-to-date."
  exit 0
fi

echo "Schema changed. Preparing update..."
if [ "${NO_PUSH:-0}" = "1" ]; then
  echo "NO_PUSH=1: updating local file and exiting (CI mode). The workflow should create the PR."
  cp "$TMP" "$LOCAL_PATH"
  exit 0
fi

BRANCH="sync/package-schema-$(date +%Y%m%d%H%M%S)"
git checkout -b "$BRANCH"
cp "$TMP" "$LOCAL_PATH"
git add "$LOCAL_PATH"
git commit -m "chore(schemas): update package.schema.json from SchemaStore"

if command -v gh >/dev/null 2>&1; then
  git push --set-upstream origin "$BRANCH"
  gh pr create --fill --title "chore(schemas): update package.schema.json" --body "This PR updates the local package.json schema mirror from SchemaStore." --base master || gh pr create --fill --title "chore(schemas): update package.schema.json" --body "This PR updates the local package.json schema mirror from SchemaStore." --base main || true
  echo "Opened PR for schema update."
else
  git push --set-upstream origin "$BRANCH" || true
  echo "No 'gh' CLI found. Pushed branch but cannot open PR automatically."
  echo "Run: git push --set-upstream origin $BRANCH && gh pr create --fill --title 'chore(schemas): update package.schema.json'"
fi
