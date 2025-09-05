#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# wrapper-bin.sh / wrapper-lib.sh - Entrypoint wrapper library and launcher
#
# Purpose
#   These two scripts provide a small, conservative shell library (wrapper-lib.sh)
#   and a reusable wrapper entrypoint (wrapper-bin.sh) to delegate patch
#   orchestration to Node.js scripts in a consistent, testable way.
#
#   The design goals:
#     - Work reliably when sourced from other scripts (helpers echo/printf values).
#     - Provide a uniform CLI surface for running patches (one-shot or background
#       sync-loop) with overridable targets and extensions.
#     - Support a dry-run mode that prints commands instead of executing them.
#     - Keep logic shell-only (POSIX-ish bash) so the wrapper can be embedded in
#       container entrypoints or development scripts.
#
# Files / Roles
#   wrapper-lib.sh
#     - A set of small helper functions used by wrapper-bin.sh and other wrappers.
#     - Everything is careful to return values via echo/printf to support being
#       sourced by other scripts.
#
#   wrapper-bin.sh
#     - A generic wrapper "main" that:
#         * derives metadata from the wrapper filename (procedural number + name),
#         * resolves the Node script to run (default under ../common),
#         * collects argument-based overrides (--wrapper-target, --wrapper-ext),
#         * supports two run modes: "default" (one-shot) and "sync-loop" (background),
#         * honors environment dry-run flags and a CLI dry-run flag.
#       It delegates actual work to node by invoking the resolved .mjs/.cjs script(s).
#
# API / Publicly relevant functions (what they do and what they return)
#   get_script_dir
#     - Returns: absolute directory path of the calling script (echo).
#     - Usage: get script directory for locating sibling resources.
#
#   get_basename
#     - Returns: basename of the calling script (echo).
#
#   args_has_dry_run "$@"
#     - Scans given args for "--dry-run" or "-n".
#     - Returns: "1" (echo) if present, otherwise "0".
#
#   args_has_help "$@"
#     - Scans given args for "-h" or "--help".
#     - Returns: "1" if present, otherwise "0".
#
#   filter_out_dry_run "$@"
#     - Returns: all args except the dry-run flags (--dry-run or -n),
#       one per line (printf).
#     - Useful for producing a forwarded arg list without dry-run markers.
#
#   derive_patch_metadata "$self_name"
#     - Input: wrapper filename (e.g. "01-some-patch.sh" or "some-patch.sh").
#     - Parses:
#         * procedural_number (numeric prefix before dash) or empty string
#         * patch_name (basename without .sh and without numeric prefix)
#         * script: patch_name with a default extension (.mjs appended later)
#         * node_dir: resolved absolute path to "../common" relative to the
#           directory of wrapper-lib.sh (so shared Node scripts are under common/)
#     - Returns: a pipe-separated string: procedural_number|patch_name|script|node_dir
#       (printf '%s|%s|%s|%s\n').
#
#   detect_dry_run "$PATCH_DRY_RUN" "$DRY_RUN" "$@"
#     - Inputs:
#         * env_patch_dry_run (first arg) - typically PATCH_DRY_RUN env var
#         * env_dry_run (second arg) - typically DRY_RUN env var
#         * remaining args - to check for --dry-run / -n flags
#     - Precedence:
#         1) If env_patch_dry_run is set and not "0" -> dry-run
#         2) Else if env_dry_run is set and not "0" -> dry-run
#         3) Else if CLI includes --dry-run/-n -> dry-run
#     - Returns: "1" for dry-run, "0" otherwise.
#
#   execute_or_dry_run "$dry_run" command [args...]
#     - If dry_run != "0" prints a standardized "[patch][dry-run] Would run: ..."
#       line with the full command and returns success.
#     - Otherwise executes the command (executes "$@").
#
#   normalize_script_ref "$node_dir" "$ext" "$ref"
#     - Purpose: normalize a script reference relative to node_dir and ensure it
#       has the expected extension.
#     - Behavior:
#         * If ref is absolute (starts with /) it is used as-is.
#         * Otherwise ref is treated relative to node_dir (node_dir/ref).
#         * If the result does not end with .${ext}, that extension is appended.
#         * Collapses path components by using cd/dirname/pwd and basename to
#           produce an absolute path.
#     - Returns: absolute path to the resolved script (echo).
#
#   collect_wrapper_targets "$node_dir" "$ext" "$@"
#     - Collects override target(s) supplied via repeated flags:
#         * --wrapper-target value
#         * --wrapper-target=value
#       Each value may contain comma-separated multiple references (together).
#     - For each part:
#         * trims leading/trailing whitespace,
#         * uses normalize_script_ref to resolve against node_dir and ext,
#         * accumulates targets.
#     - Returns: one normalized absolute path per line for each collected target.
#     - Notes: This supports both explicit extension or none; normalize_script_ref
#       will append the extension if missing.
#
#   filter_out_wrapper_target_flags "$@"
#     - Returns the argument list with any --wrapper-target/--wrapper-target=*
#       and --wrapper-ext/--wrapper-ext=* flags and their values removed.
#     - Useful to produce forwarded_args that are safe to hand to the Node script.
#
#   collect_wrapper_ext "$@"
#     - Scans args for --wrapper-ext or --wrapper-ext=VALUE.
#     - Normalizes by stripping a leading dot and returns the extension (e.g. "mjs").
#     - Returns empty string if not specified.
#
# wrapper-bin.sh specific functions / behavior
#   wrapper_get_self_name
#     - Scans the BASH_SOURCE stack to find the first source element that is not
#       wrapper-bin.sh or wrapper-lib.sh and returns that basename. This supports
#       being sourced or executed from other wrapper files so metadata derivation
#       uses the original wrapper filename.
#     - Falls back to basename of $0 if no suitable element is found.
#
#   wrapper_main "$@"
#     - The main orchestrator with the following behavior:
#         1) Derives metadata from the wrapper filename (procedural number,
#            patch_name, default script name, node_dir).
#         2) Builds a usage string and supports early help printing (if -h/--help).
#         3) Resolves node executable via:
#              WRAPPER_NODE_BIN -> NODE_BIN -> "node"
#         4) Resolves script extension via:
#              WRAPPER_SCRIPT_EXT (env) or "mjs", with optional override via
#              --wrapper-ext on the command line.
#         5) Determines dry-run via detect_dry_run(PATCH_DRY_RUN, DRY_RUN, "$@").
#         6) Validates node exists in PATH unless dry-run is active.
#         7) Collects forwarded_args (original args minus dry-run flags).
#         8) Collects override_targets via collect_wrapper_targets(node_dir, ext).
#         9) Removes wrapper-target/--wrapper-ext flags from forwarded_args.
#        10) Chooses behavior based on WRAPPER_RUN_MODE env var:
#             - "default" (one-shot):
#                 * If override targets present: run each target once:
#                     node <target> --procedural-number <num> --patch-name <name> <forwarded_args...>
#                 * Else: run the default node script under node_dir/<patch_name>.<ext>
#                 * Uses execute_or_dry_run so dry-run prints commands and does not execute.
#                 * On non-dry-run failure, emits [patch][error] and returns the rc.
#                 * On success prints "[patch] <display_name>: Complete".
#
#             - "sync-loop":
#                 * Two-step behavior per target (or default script if none):
#                     a) Run with --initial-only to perform one-time sync.
#                     b) Start an ongoing background loop with --loop-only (backgrounded
#                        with & and disown).
#                 * Dry-run prints both the initial run and the background start commands.
#                 * Non-dry-run executes the initial run synchronously, then starts the
#                   background loop and disowns it. Prints a "[patch] <patch_name>: Background sync loop started".
#
# Environment variables of importance
#   WRAPPER_SELF_NAME
#     - Optional. When set, wrapper_main uses this string as the wrapper filename
#       to derive metadata instead of scanning BASH_SOURCE. Useful when wrapper
#       is invoked in non-standard ways.
#
#   WRAPPER_RUN_MODE
#     - 'default' (one-shot) or 'sync-loop' (start background loop). Default: 'default'.
#
#   WRAPPER_NODE_BIN
#     - Path/name of the Node.js executable to use. Falls back to NODE_BIN then "node".
#
#   NODE_BIN
#     - Secondary fallback for Node executable if WRAPPER_NODE_BIN not set.
#
#   WRAPPER_SCRIPT_EXT
#     - Default extension for scripts (e.g. mjs or cjs). Leading dot optional.
#     - Default: "mjs" if unset.
#
#   PATCH_DRY_RUN
#     - If set and not "0", forces dry-run mode for the patch wrapper.
#     - Takes precedence over DRY_RUN and CLI flags.
#
#   DRY_RUN
#     - If set and not "0", enables dry-run globally (lower precedence than PATCH_DRY_RUN).
#
# Command-line flags (public surface)
#   -h, --help
#       Print usage and return.
#
#   -n, --dry-run
#       Enable dry-run mode for this invocation (prints commands instead of running).
#       Also honored via PATCH_DRY_RUN/DRY_RUN env vars as described above.
#
#   --wrapper-target <t[,t]>  or  --wrapper-target=<t[,t]>
#       Override the target Node script(s) to run. Values are relative to common/
#       by default (or absolute if given) and may be comma-separated. Extension is
#       optional; the wrapper will append the configured extension if not present.
#       Multiple --wrapper-target flags may be used; each may contain multiple comma
#       separated items.
#
#   --wrapper-ext <ext>  or  --wrapper-ext=<ext>
#       Override the script extension for the default script and for targets that
#       do not explicitly include an extension. Leading dot is optional (e.g. ".mjs"
#       and "mjs" are equivalent).
#
# Additional flags passed through to Node scripts
#   - The wrapper always injects two flags to the actual Node script(s):
#       --procedural-number <procedural_number>
#       --patch-name <patch_name>
#     These reflect the parsed metadata from the wrapper filename and help the
#     Node script know which patch invocation it is serving.
#
#   - Any remaining forwarded_args (after removing wrapper-target/--wrapper-ext and
#     dry-run flags) are appended to the Node invocation unchanged.
#
# Output conventions & logging
#   - The wrapper prints standardized prefix tags to stderr/stdout:
#       [patch]          general informational messages (stdout)
#       [patch][dry-run] messages shown when dry-run would run something (stdout)
#       [patch][error]   error messages (stderr)
#
# Failures & exit codes
#   - In non-dry-run mode, if node is not found the wrapper exits with code 1.
#   - When invoking Node, a non-zero exit code from the Node process is propagated:
#       * In default mode, wrapper_main prints an error and returns/exit with that code.
#       * In sync-loop mode, the initial-only invocation failure will propagate similarly.
#   - Dry-run never executes commands and always returns success (0).
#
# Notes, caveats, and expectations
#   - All helper functions return scalar data via echo/printf to make them safe when
#     sourced by other scripts. Callers should capture output via command substitution
#     or mapfile/read loops as demonstrated in wrapper-bin.sh.
#   - normalize_script_ref ensures an absolute path is produced; this depends on
#     `cd` and `pwd` behavior. The node_dir argument should be an existing directory
#     (the default is derived relative to wrapper-lib.sh).
#   - collect_wrapper_targets trims whitespace around commas and values; empty
#     values are ignored.
#   - The wrapper is conservative with side-effects: it only backgrounds processes
#     in the explicit sync-loop mode and disowns them so they don't tie to the
#     invoking shell's lifecycle.
# -----------------------------------------------------------------------------

# Source local wrapper-lib
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1090
source "${LIB_DIR}/wrapper-lib.sh"

# Defaults and debug utilities
readonly DEFAULT_SCRIPT_EXT="mjs"

patch_debug() {
  if [ "${WRAPPER_DEBUG:-0}" = "1" ]; then
    echo "[patch][debug] $*" >&2
  fi
}

# Determine the calling wrapper filename for metadata derivation.
wrapper_get_self_name() {
  local i name cur
  cur="${BASH_SOURCE[0]}"
  for (( i=1; i<${#BASH_SOURCE[@]}; i++ )); do
    name="${BASH_SOURCE[$i]}"
    case "$name" in
      *wrapper-bin.sh|*wrapper-lib.sh)
        continue
        ;;
      *)
        echo "$(basename "$name")"
        return 0
        ;;
    esac
  done
  echo "$(basename "${0}")"
}

# Print usage and exit if -h/--help is present in args
handle_help() {
  local self_name
  local usage
  self_name="$(wrapper_get_self_name)"

  usage="Usage: ${self_name} [options] [-- ...]

  Options:
    -h, --help                 Show this help and exit
    -n, --dry-run              Print commands that would run
    --wrapper-target <t[,t]>   Override target script(s). Relative values resolve under common/. Extension optional
    --wrapper-ext <ext>        Override script extension for default/targets (e.g. mjs, cjs). Leading dot optional

  Environment:
    WRAPPER_RUN_MODE           'default' (one-shot) or 'sync-loop'
    WRAPPER_NODE_BIN           Node executable (default: node)
    WRAPPER_SCRIPT_EXT         Default script extension (default: mjs)
    PATCH_DRY_RUN, DRY_RUN     If set and not '0', enable dry-run
  "

  if [ "$(args_has_help "$@")" != "0" ]; then
    printf '%s\n' "$usage"
    return 0
  fi
}

# Standardized error helpers
patch_error() {
  echo "[patch][error] $*" >&2
}

patch_fatal() {
  local msg="$1"; local code="${2:-1}"
  patch_error "$msg"
  # In test mode, don't exit the shell; return non-zero instead
  if [ "${WRAPPER_TEST_MODE:-0}" != "0" ]; then
    return "$code"
  fi
  exit "$code"
}

# Determine script extension from env or default
get_script_ext() {
  local script_ext
  script_ext="${WRAPPER_SCRIPT_EXT:-$DEFAULT_SCRIPT_EXT}"
  script_ext="${script_ext#.}"
  echo "$script_ext"
}

# Check for --wrapper-ext override in args
check_ext_override() {
  local arg_ext
  local script_ext
  script_ext="$(get_script_ext)"
  arg_ext="$(collect_wrapper_ext "$@")"
  if [ -n "$arg_ext" ]; then
    script_ext="$arg_ext"
  fi
  echo "$script_ext"
}

# Verify that the node binary exists in PATH, unless dry-run is active
check_node_binary_exists() {
    local node_bin="$1"
    local dry_run="$2"
    if ! command -v "$node_bin" >/dev/null 2>&1; then
      if [ "$dry_run" = "0" ]; then
        patch_fatal "node not found in PATH" 1 || return 1
      fi
    fi
}

# Alias with consistent naming
wrapper_check_node_binary_exists() {
  check_node_binary_exists "$@"
}

# Validate node_dir exists (skip in dry-run)
check_node_dir_exists() {
  local node_dir="$1"; local dry_run="$2"
  if [ ! -d "$node_dir" ]; then
    if [ "$dry_run" = "0" ]; then
      patch_fatal "Node scripts directory not found: $node_dir" 1 || return 1
    else
      patch_debug "Node scripts directory missing (dry-run): $node_dir"
    fi
  fi
}

# Consistent naming alias
wrapper_detect_dry_run() {
  detect_dry_run "$@"
}

# Construct a display name for logging (e.g. "01-patch-name" or "patch-name")
get_display_name() {
    local procedural_number="$1"
    local patch_name="$2"
    local display_name
    if [ -n "$procedural_number" ]; then
      display_name="${procedural_number}-${patch_name}"
    else
      display_name="$patch_name"
    fi
    echo "$display_name"
  }

# Reusable arg parser to split targets and forwarded args on a delimiter
parse_delimited_args() {
  local delim="$1"; shift
  # name refs for output arrays
  local -n _targets_ref="$1"; shift
  local -n _fwd_ref="$1"; shift

  while [ "$#" -gt 0 ]; do
    if [ "$1" = "$delim" ]; then
      shift
      break
    fi
    _targets_ref+=("$1")
    shift
  done
  while [ "$#" -gt 0 ]; do
    _fwd_ref+=("$1")
    shift
  done
}

# Dry-run and sync-loop specific functions
sync_loop_dry_run() {
  local node_bin="$1"; local node_dir="$2"; local script="$3"; local procedural_number="$4"; local patch_name="$5"; shift 5
  local -a targets=()
  local -a fwd=()
  parse_delimited_args "--" targets fwd "$@"

  if [ "${#targets[@]}" -gt 0 ]; then
    for t in "${targets[@]}"; do
      echo "[patch][dry-run] Would run initial sync: ${node_bin} ${t} --initial-only --procedural-number ${procedural_number} --patch-name ${patch_name} ${fwd[*]}"
      echo "[patch][dry-run] Would start loop in background: ${node_bin} ${t} --loop-only --procedural-number ${procedural_number} --patch-name ${patch_name} ${fwd[*]} &"
    done
  else
    echo "[patch][dry-run] Would run initial sync: ${node_bin} ${node_dir}/${script} --initial-only --procedural-number ${procedural_number} --patch-name ${patch_name} ${fwd[*]}"
    echo "[patch][dry-run] Would start loop in background: ${node_bin} ${node_dir}/${script} --loop-only --procedural-number ${procedural_number} --patch-name ${patch_name} ${fwd[*]} &"
  fi
}

# Run the sync loop
sync_loop_run() {
  local node_bin="$1"; local node_dir="$2"; local script="$3"; local procedural_number="$4"; local patch_name="$5"; shift 5
  local -a targets=()
  local -a fwd=()
  parse_delimited_args "--" targets fwd "$@"

  if [ "${#targets[@]}" -gt 0 ]; then
    for t in "${targets[@]}"; do
      "${node_bin}" "${t}" --initial-only --procedural-number "${procedural_number}" --patch-name "${patch_name}" "${fwd[@]}"
      "${node_bin}" "${t}" --loop-only --procedural-number "${procedural_number}" --patch-name "${patch_name}" "${fwd[@]}" &
      disown || true
    done
  else
    "${node_bin}" "${node_dir}/${script}" --initial-only --procedural-number "${procedural_number}" --patch-name "${patch_name}" "${fwd[@]}"
    "${node_bin}" "${node_dir}/${script}" --loop-only --procedural-number "${procedural_number}" --patch-name "${patch_name}" "${fwd[@]}" &
    disown || true
  fi
  echo "[patch] ${patch_name}: Background sync loop started"
}

# Run each override target once
default_run_overrides() {
  local node_bin="$1"; local procedural_number="$2"; local patch_name="$3"; local dry_run="$4"; local display_name="$5"; shift 5
  local -a targets=()
  local -a fwd=()
  parse_delimited_args "--" targets fwd "$@"

  local t
  for t in "${targets[@]}"; do
    local -a cmd
    cmd=("${node_bin}" "${t}" "--procedural-number" "${procedural_number}" "--patch-name" "${patch_name}")
    if [ "${#fwd[@]}" -gt 0 ]; then
      cmd+=("${fwd[@]}")
    fi
    if ! execute_or_dry_run "$dry_run" "${cmd[@]}"; then
      local rc=$?
      patch_error "${display_name}: Failed with exit code $rc"
      return $rc
    fi
  done
  echo "[patch] ${display_name}: Complete"
  return 0
}

# Run the single default script
default_run_single() {
  local node_bin="$1"; local node_dir="$2"; local script="$3"; local procedural_number="$4"; local patch_name="$5"; local dry_run="$6"; local display_name="$7"; shift 7
  local -a fwd=()
  if [ "$#" -gt 0 ]; then
    # Expect a '--' delimiter then forwarded args
    if [ "$1" = "--" ]; then
      shift
    fi
    while [ "$#" -gt 0 ]; do
      fwd+=("$1")
      shift
    done
  fi

  local -a cmd
  cmd=("${node_bin}" "${node_dir}/${script}" "--procedural-number" "${procedural_number}" "--patch-name" "${patch_name}")
  if [ "${#fwd[@]}" -gt 0 ]; then
    cmd+=("${fwd[@]}")
  fi
  if execute_or_dry_run "$dry_run" "${cmd[@]}"; then
    echo "[patch] ${display_name}: Complete"
    return 0
  else
    local rc=$?
    patch_error "${display_name}: Failed with exit code $rc"
    return $rc
  fi
}

# Helper: resolve metadata into variables
wrapper_resolve_metadata() {
  local self_name procedural_number patch_name script node_dir
  self_name="${WRAPPER_SELF_NAME:-$(wrapper_get_self_name)}"
  IFS='|' read -r procedural_number patch_name script node_dir < <(derive_patch_metadata "$self_name")
  printf '%s|%s|%s|%s\n' "$procedural_number" "$patch_name" "$script" "$node_dir"
}

# Helper: resolve node bin from env
wrapper_resolve_node_bin() {
  local candidate="${WRAPPER_NODE_BIN:-${NODE_BIN:-node}}"
  local resolved
  if resolved="$(command -v "$candidate" 2>/dev/null)"; then
    echo "$resolved"
  else
    echo "$candidate"
  fi
}

# Helper: resolve dry-run flag (env + args)
wrapper_resolve_dry_run() {
  wrapper_detect_dry_run "${PATCH_DRY_RUN:-}" "${DRY_RUN:-}" "$@"
}

# Helper: resolve script extension (env + optional CLI override)
wrapper_resolve_script_ext() {
  check_ext_override "$@"
}

# Helper: collect forwarded args (strip dry-run and wrapper flags)
wrapper_collect_forwarded_args() {
  local -a args=()
  mapfile -t args < <(filter_out_dry_run "$@")
  mapfile -t args < <(filter_out_wrapper_target_flags "${args[@]}")
  if [ "${#args[@]}" -gt 0 ]; then printf '%s\n' "${args[@]}"; fi
}

# Helper: collect override targets
wrapper_collect_override_targets() {
  local node_dir="$1"; local script_ext="$2"; shift 2
  collect_wrapper_targets "$node_dir" "$script_ext" "$@"
}

# Execute chosen mode based on presence of override targets
wrapper_execute_mode() {
  local mode="$1"; shift
  case "$mode" in
    sync-loop)
      sync_loop_run "$@"
      ;;
    default|*)
      default_run_single "$@"
      ;;
  esac
}

# The main entrypoint function for the wrapper
wrapper_main() {
  # Launch the help handler early (prints usage if requested)
  handle_help "$@"

  # Resolve metadata
  local procedural_number patch_name script node_dir
  IFS='|' read -r procedural_number patch_name script node_dir < <(wrapper_resolve_metadata)

  # Resolve node
  local node_bin
  node_bin="$(wrapper_resolve_node_bin)"

  # Determine dry-run
  local dry_run
  dry_run="$(wrapper_resolve_dry_run "$@")"

  # Validate node binary (unless dry-run); respect test mode
  if ! wrapper_check_node_binary_exists "$node_bin" "$dry_run"; then
    return 1
  fi

  # Validate node_dir existence (unless dry-run)
  if ! check_node_dir_exists "$node_dir" "$dry_run"; then
    return 1
  fi

  # Determine extension from env/arg (with CLI override)
  local script_ext
  script_ext="$(wrapper_resolve_script_ext "$@")"

  # Ensure the default script uses the chosen extension
  script="${patch_name}.${script_ext}"

  # Collect overrides and forwarded args
  local -a override_targets=()
  mapfile -t override_targets < <(wrapper_collect_override_targets "$node_dir" "$script_ext" "$@")
  local -a forwarded_args=()
  mapfile -t forwarded_args < <(wrapper_collect_forwarded_args "$@")

  local display_name
  display_name="$(get_display_name "$procedural_number" "$patch_name")"

  local mode
  mode="${WRAPPER_RUN_MODE:-default}"
  echo "[patch] ${display_name}: Delegating to Node.js script"
  patch_debug "node_bin=$node_bin"
  patch_debug "node_dir=$node_dir"
  patch_debug "script_ext=$script_ext"
  patch_debug "script=$script"
  patch_debug "mode=$mode"

  # Perform the main logic based on mode and presence of override targets
  case "$mode" in
    sync-loop)
      if [ "$dry_run" != "0" ]; then
        sync_loop_dry_run "$node_bin" "$node_dir" "$script" "$procedural_number" "$patch_name" ${override_targets[@]:+"${override_targets[@]}"} -- ${forwarded_args[@]:+"${forwarded_args[@]}"}
      else
        sync_loop_run "$node_bin" "$node_dir" "$script" "$procedural_number" "$patch_name" ${override_targets[@]:+"${override_targets[@]}"} -- ${forwarded_args[@]:+"${forwarded_args[@]}"}
      fi
      ;;
    default|*)
      if [ "${#override_targets[@]}" -gt 0 ]; then
        default_run_overrides "$node_bin" "$procedural_number" "$patch_name" "$dry_run" "$display_name" ${override_targets[@]:+"${override_targets[@]}"} -- ${forwarded_args[@]:+"${forwarded_args[@]}"}
      else
        default_run_single "$node_bin" "$node_dir" "$script" "$procedural_number" "$patch_name" "$dry_run" "$display_name" -- ${forwarded_args[@]:+"${forwarded_args[@]}"}
      fi
      ;;
  esac
}