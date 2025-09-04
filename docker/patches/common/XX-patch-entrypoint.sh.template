#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# Entrypoint wrapper docs
#
# This file delegates work to the shared wrapper implementation located in:
#   - #file:wrapper-bin.sh  (the generic wrapper "main")
#   - #file:wrapper-lib.sh  (small, conservative helper library)
#
# Purpose
#   Provide a single place (this thin wrapper) that sets minimal environment or
#   invocation-time defaults and then calls wrapper-bin.sh::wrapper_main to run
#   Node-based patch scripts. The detailed behavior and CLI surface are defined
#   by wrapper-bin.sh and wrapper-lib.sh; this file should only set the desired
#   mode/overrides then delegate.
#
# What wrapper-lib.sh provides (helpers / contracts)
#   - get_script_dir
#       Echoes the absolute directory of the calling script.
#   - get_basename
#       Echoes the calling script basename.
#   - args_has_dry_run "$@"
#       Echoes "1" if --dry-run or -n present, else "0".
#   - args_has_help "$@"
#       Echoes "1" if -h or --help present, else "0".
#   - filter_out_dry_run "$@"
#       Prints each arg except --dry-run/-n one per line (useful to rebuild
#       forwarded arg arrays).
#   - derive_patch_metadata "$self_name"
#       Parses wrapper filename into procedural_number, patch_name, default
#       script name and node_dir; prints them as a pipe-delimited string.
#   - detect_dry_run "$PATCH_DRY_RUN" "$DRY_RUN" "$@"
#       Applies precedence (PATCH_DRY_RUN, DRY_RUN, CLI flags) and echoes 1/0.
#   - execute_or_dry_run "$dry_run" cmd [args...]
#       Either prints a standardized dry-run message or execs the command.
#   - normalize_script_ref / collect_wrapper_targets / collect_wrapper_ext
#       Helpers for resolving target script paths and collecting override flags.
#
# What wrapper-bin.sh provides (runtime & CLI behavior)
#   - wrapper_get_self_name
#       Determines which wrapper filename should be used for metadata parsing
#       (supports being sourced).
#   - wrapper_main "$@"
#       Orchestrates:
#         * Metadata derivation (from wrapper filename)
#         * Node executable resolution:
#             WRAPPER_NODE_BIN -> NODE_BIN -> "node"
#         * Script extension resolution:
#             WRAPPER_SCRIPT_EXT (env) or override via --wrapper-ext
#         * Dry-run determination via detect_dry_run
#         * Collection of forwarded args (dry-run flags removed)
#         * Collection of override targets via --wrapper-target
#         * Two run modes controlled by WRAPPER_RUN_MODE:
#             - default: run the resolved script(s) once
#             - sync-loop: run initial sync (--initial-only) then background
#               loop (--loop-only) disowned
#         * Injects:
#             --procedural-number <num>
#             --patch-name <name>
#         * Uses execute_or_dry_run so dry-run never executes external commands.
#
# Public surface (flags & env used by thin wrappers)
#   CLI flags (passed through to wrapper_main -> Node scripts)
#     -h, --help             Show help
#     -n, --dry-run          Print commands instead of executing
#     --wrapper-target t     Override target(s), comma-separated supported
#     --wrapper-ext ext      Override script extension (mjs/cjs), leading dot ok
#
#   Important environment variables (used by wrapper-bin.sh / wrapper-lib.sh)
#     WRAPPER_SELF_NAME      Optional override for the wrapper filename used
#     WRAPPER_RUN_MODE       'default' or 'sync-loop' (default: default)
#     WRAPPER_NODE_BIN       Node executable path/name (fallback: NODE_BIN/node)
#     WRAPPER_SCRIPT_EXT     Default script extension (default: mjs)
#     PATCH_DRY_RUN, DRY_RUN If set and not "0", force dry-run behavior
#
# Usage expectation for thin wrappers (this file)
#   - Set any per-wrapper defaults (WRAPPER_RUN_MODE, WRAPPER_NODE_BIN, etc.)
#   - Source wrapper-bin.sh and call wrapper_main "$@"
#   - Let wrapper-* helpers handle arg parsing, dry-run semantics, and node
#     invocation details. Keep thin wrapper side-effects minimal.
# -----------------------------------------------------------------------------

# Thin wrapper: set mode if needed and delegate to wrapper-bin
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/common"
# shellcheck disable=SC1090
source "${LIB_DIR}/wrapper-bin.sh"

export WRAPPER_RUN_MODE="default"
export WRAPPER_NODE_BIN="${NODE_BIN:-node}"
wrapper_main "$@"
