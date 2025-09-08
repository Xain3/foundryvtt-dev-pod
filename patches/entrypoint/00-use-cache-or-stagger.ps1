#!/usr/bin/env pwsh
#
# PowerShell wrapper for 00-use-cache-or-stagger
# This script provides Windows failsafe logic for the use-cache-or-stagger patch.
# It mirrors the functionality of the corresponding .sh wrapper but uses PowerShell.
#
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  $Args
)

# Check for Node.js availability
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Error "[patch][error] Node runtime not found; please install node (https://nodejs.org/)"
  exit 2
}

# Compute the path to the corresponding .mjs script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$commonDir = Resolve-Path (Join-Path $scriptDir '..\common') -ErrorAction SilentlyContinue
if (-not $commonDir) {
  Write-Error "[patch][error] Could not locate common directory"
  exit 3
}

$target = Join-Path $commonDir 'use-cache-or-stagger.mjs'
if (-not (Test-Path $target)) {
  Write-Error "[patch][error] Target script not found: $target"
  exit 3
}

# Execute the Node.js script with arguments passed through
$nodeArgs = @($target) + $Args
& $nodeCmd.Source @nodeArgs
exit $LASTEXITCODE