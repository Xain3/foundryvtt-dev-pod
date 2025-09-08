#!/usr/bin/env pwsh
#
# PowerShell wrapper for 20-install-components
# This script provides Windows compatibility for the install-components patch.
# It mirrors the functionality of the corresponding .sh wrapper but uses PowerShell.
#
param(
  [alias('h')]
  [switch]$Help,
  [alias('n')]
  [switch]$DryRun,
  [string]$WrapperTarget,
  [string]$WrapperExt,
  [Parameter(ValueFromRemainingArguments = $true)]
  $RemainingArgs
)

# --- Helper Functions ---

function Get-WrapperMetadata {
  param([string]$WrapperName)
  
  # Parse filename like "20-install-components.ps1" -> procedural: "20", patch: "install-components"
  if ($WrapperName -match '^(\d+)-(.+)\.ps1$') {
    return @{
      ProceduralNumber = $Matches[1]
      PatchName = $Matches[2]
      ScriptName = "$($Matches[2]).mjs"
    }
  }
  throw "[patch][error] Could not parse wrapper filename: $WrapperName"
}

function Test-DryRun {
  param($Args)
  
  # Check environment variables first (PATCH_DRY_RUN takes precedence over DRY_RUN)
  if ($env:PATCH_DRY_RUN -and $env:PATCH_DRY_RUN -ne "0") { return $true }
  if ($env:DRY_RUN -and $env:DRY_RUN -ne "0") { return $true }
  
  # Check CLI flags
  if ($DryRun) { return $true }
  if ($Args -contains "--dry-run" -or $Args -contains "-n") { return $true }
  
  # Check if dry-run flags got consumed by other parameters
  if ($WrapperTarget -eq "--dry-run" -or $WrapperTarget -eq "-n") { return $true }
  if ($WrapperExt -eq "--dry-run" -or $WrapperExt -eq "-n") { return $true }
  
  return $false
}

function Show-Help {
  $scriptName = Split-Path -Leaf $PSCommandPath
  Write-Host @"
Usage: $scriptName [options] [script-args...]

PowerShell wrapper for patch entrypoints. Provides equivalent functionality
to the shell wrapper system for Windows environments.

Options:
  -h, --help             Show this help message
  -n, --dry-run          Print commands instead of executing them
  --wrapper-target NAME  Override target script name (without extension)
  --wrapper-ext EXT      Override script extension (default: mjs)

Environment Variables:
  PATCH_DRY_RUN          If set and not "0", force dry-run mode
  DRY_RUN                If set and not "0", force dry-run mode (lower precedence)
  WRAPPER_NODE_BIN       Node executable path (default: node)
  WRAPPER_SCRIPT_EXT     Default script extension (default: mjs)
  WRAPPER_RUN_MODE       Run mode: 'default' or 'sync-loop' (default: default)

Examples:
  .\20-install-components.ps1
  .\20-install-components.ps1 --dry-run
  .\20-install-components.ps1 --wrapper-target custom-script
"@
}

function Get-NodeExecutable {
  $nodeBin = $env:WRAPPER_NODE_BIN
  if (-not $nodeBin) { $nodeBin = $env:NODE_BIN }
  if (-not $nodeBin) { $nodeBin = "node" }
  
  $nodeCmd = Get-Command $nodeBin -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    Write-Error "[patch][error] Node runtime not found; please install node (https://nodejs.org/)"
    exit 2
  }
  return $nodeCmd.Source
}

function Get-ScriptPath {
  param([hashtable]$Metadata, [string]$OverrideTarget, [string]$OverrideExt)
  
  # If OverrideTarget is a help or dry-run flag, treat it as no override
  if ($OverrideTarget -eq "--help" -or $OverrideTarget -eq "-h" -or $OverrideTarget -eq "--dry-run" -or $OverrideTarget -eq "-n") {
    $OverrideTarget = $null
  }
  
  $scriptDir = $PSScriptRoot
  $commonDir = Resolve-Path (Join-Path $scriptDir '..\common') -ErrorAction SilentlyContinue
  if (-not $commonDir) {
    Write-Error "[patch][error] Could not locate common directory"
    exit 3
  }
  
  $scriptName = if ($OverrideTarget) {
    $ext = if ($OverrideExt) { $OverrideExt.TrimStart('.') } else { 
      if ($env:WRAPPER_SCRIPT_EXT) { $env:WRAPPER_SCRIPT_EXT -replace '^\.', '' } else { 'mjs' }
    }
    "$OverrideTarget.$ext"
  } else {
    $Metadata.ScriptName
  }
  
  $target = Join-Path $commonDir $scriptName
  if (-not (Test-Path $target)) {
    Write-Error "[patch][error] Target script not found: $target"
    exit 3
  }
  
  return $target
}

function Invoke-NodeScript {
  param([string]$NodePath, [string]$ScriptPath, [array]$Arguments, [hashtable]$Metadata, [bool]$IsDryRun)
  
  # Build arguments with metadata injection
  $nodeArgs = @($ScriptPath, "--procedural-number", $Metadata.ProceduralNumber, "--patch-name", $Metadata.PatchName) + $Arguments
  
  if ($IsDryRun) {
    Write-Host "[patch][dry-run] Would run: $NodePath $($nodeArgs -join ' ')"
    return 0
  } else {
    & $NodePath @nodeArgs
    return $LASTEXITCODE
  }
}

# --- Main Logic ---

# Handle help first (before any other processing)
if ($Help -or $RemainingArgs -contains "--help" -or $RemainingArgs -contains "-h" -or $WrapperTarget -eq "--help" -or $WrapperTarget -eq "-h" -or $WrapperExt -eq "--help" -or $WrapperExt -eq "-h") {
  Show-Help
  exit 0
}

# Get metadata from wrapper filename
$wrapperName = Split-Path -Leaf $PSCommandPath
$metadata = Get-WrapperMetadata $wrapperName

# Check dry-run mode
$isDryRun = Test-DryRun $RemainingArgs

# Get Node executable
$nodeExe = Get-NodeExecutable

# Get target script path
$scriptPath = Get-ScriptPath $metadata $WrapperTarget $WrapperExt

# Filter out wrapper-specific arguments from remaining args
$filteredArgs = $RemainingArgs | Where-Object { 
  $_ -notin @("--dry-run", "-n", "--help", "-h") -and
  $_ -notlike "--wrapper-target*" -and
  $_ -notlike "--wrapper-ext*"
}

# Set run mode and execute
$runMode = if ($env:WRAPPER_RUN_MODE) { $env:WRAPPER_RUN_MODE } else { "default" }
$modeDescription = if ($isDryRun) { "$runMode, dry-run" } else { $runMode }
Write-Host "[patch] $($metadata.ProceduralNumber)-$($metadata.PatchName): Delegating to Node.js script (mode: $modeDescription)"

$exitCode = Invoke-NodeScript $nodeExe $scriptPath $filteredArgs $metadata $isDryRun
exit $exitCode