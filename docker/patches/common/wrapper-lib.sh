#!/usr/bin/env bash
# Library of helpers for entrypoint wrapper scripts.
# Functions are intentionally conservative and only use echo/printf for
# returning values so they work when sourced.

get_script_dir() {
  local dir
  dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  echo "$dir"
}

get_basename() {
  basename "${BASH_SOURCE[0]}"
}

args_has_dry_run() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --dry-run|-n)
        echo 1
        return 0
        ;;
    esac
  done
  echo 0
}

# Detect help flags (-h | --help)
args_has_help() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      -h|--help)
        echo 1
        return 0
        ;;
    esac
  done
  echo 0
}

filter_out_dry_run() {
  local out=()
  local arg
  for arg in "$@"; do
    case "$arg" in
      --dry-run|-n)
        ;;
      *)
        out+=("$arg")
        ;;
    esac
  done
  if [ "${#out[@]}" -gt 0 ]; then
    printf '%s\n' "${out[@]}"
  fi
}

derive_patch_metadata() {
  local self_name="$1"
  local procedural_number="" patch_name script node_dir
  if [[ "$self_name" =~ ^([0-9]+)-(.*)\.sh$ ]]; then
    procedural_number="${BASH_REMATCH[1]}"
    patch_name="${BASH_REMATCH[2]}"
  else
    patch_name="${self_name%.sh}"
  fi
  script="${patch_name}.mjs"
  node_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/common"
  printf '%s|%s|%s|%s\n' "$procedural_number" "$patch_name" "$script" "$node_dir"
}

detect_dry_run() {
  local env_patch_dry_run="$1"
  local env_dry_run="$2"
  shift 2
  local flag
  flag="$(args_has_dry_run "$@")"
  if [ -n "$env_patch_dry_run" ] && [ "$env_patch_dry_run" != "0" ]; then
    echo 1
    return 0
  fi
  if [ -n "$env_dry_run" ] && [ "$env_dry_run" != "0" ]; then
    echo 1
    return 0
  fi
  echo "$flag"
}

execute_or_dry_run() {
  local dry_run="$1"; shift
  if [ "$dry_run" != "0" ]; then
    echo "[patch][dry-run] Would run: $*"
    return 0
  fi
  "$@"
}

# Normalize a script reference against node_dir, appending .mjs if missing.
normalize_script_ref() {
  local node_dir="$1"; shift
  local ext="$1"; shift
  local ref="$1"
  local out dir base
  case "$ref" in
    /*)
      out="$ref"
      ;;
    *)
      out="${node_dir}/${ref}"
      ;;
  esac
  if [[ "$out" != *.${ext} ]]; then
    out="${out}.${ext}"
  fi
  dir="$(dirname "$out")"
  base="$(basename "$out")"
  if ! cd "$dir" >/dev/null 2>&1; then
    echo "" # signal failure to caller with empty string
    return 1
  fi
  printf '%s/%s\n' "$(pwd)" "$base"
}

# Collect override targets from args. Supports:
#   --wrapper-target value
#   --wrapper-target=value
#   Comma-separated multiple values per flag
# Prints one normalized absolute path per line using node_dir as base and ext.
collect_wrapper_targets() {
  local node_dir="$1"; shift
  local ext="$1"; shift
  local -a targets=()
  local resolved
  local arg val part
  while [ "$#" -gt 0 ]; do
    arg="$1"; shift || true
    case "$arg" in
      --wrapper-target=*)
        val="${arg#*=}"
        IFS=',' read -r -a parts <<< "$val"
        for part in "${parts[@]}"; do
          # trim leading/trailing spaces
          part="${part#${part%%[![:space:]]*}}"
          part="${part%${part##*[![:space:]]}}"
          if [ -n "$part" ]; then
            resolved="$(normalize_script_ref "$node_dir" "$ext" "$part")" || resolved=""
            if [ -n "$resolved" ]; then
              targets+=("$resolved")
            fi
          fi
        done
        ;;
      --wrapper-target)
        if [ "$#" -gt 0 ]; then
          val="$1"; shift || true
          IFS=',' read -r -a parts <<< "$val"
          for part in "${parts[@]}"; do
            part="${part#${part%%[![:space:]]*}}"
            part="${part%${part##*[![:space:]]}}"
            if [ -n "$part" ]; then
              resolved="$(normalize_script_ref "$node_dir" "$ext" "$part")" || resolved=""
              if [ -n "$resolved" ]; then
                targets+=("$resolved")
              fi
            fi
          done
        fi
        ;;
    esac
  done
  if [ "${#targets[@]}" -gt 0 ]; then
    printf '%s\n' "${targets[@]}"
  fi
}

# Remove override target and ext flags and their values from args
filter_out_wrapper_target_flags() {
  local out=()
  local arg next
  while [ "$#" -gt 0 ]; do
    arg="$1"; shift || true
    case "$arg" in
      --wrapper-target)
        # skip its value if present
        if [ "$#" -gt 0 ]; then shift || true; fi
        ;;
      --wrapper-target=*)
        ;;
      --wrapper-ext)
        if [ "$#" -gt 0 ]; then shift || true; fi
        ;;
      --wrapper-ext=*)
        ;;
      *)
        out+=("$arg")
        ;;
    esac
  done
  if [ "${#out[@]}" -gt 0 ]; then
    printf '%s\n' "${out[@]}"
  fi
}

# Parse wrapper extension override from args; returns extension without leading dot
collect_wrapper_ext() {
  local arg val ext=""
  while [ "$#" -gt 0 ]; do
    arg="$1"; shift || true
    case "$arg" in
      --wrapper-ext=*)
        val="${arg#*=}"
        ;;
      --wrapper-ext)
        if [ "$#" -gt 0 ]; then val="$1"; shift || true; else val=""; fi
        ;;
      *)
        continue
        ;;
    esac
    # normalize: drop leading dot if present
    val="${val#.}"
    if [ -n "$val" ]; then ext="$val"; fi
  done
  echo "$ext"
}
