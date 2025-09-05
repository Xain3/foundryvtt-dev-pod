#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# wrapper-bin.sh / wrapper-lib.sh - Entrypoint wrapper library and launcher
# ...existing docs from docker version omitted for brevity...

# Source local wrapper-lib
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1090
source "${LIB_DIR}/wrapper-lib.sh"

readonly DEFAULT_SCRIPT_EXT="mjs"

patch_debug() {
	if [ "${WRAPPER_DEBUG:-0}" = "1" ]; then
		echo "[patch][debug] $*" >&2
	fi
}

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

patch_error() { echo "[patch][error] $*" >&2; }

patch_fatal() {
	local msg="$1"; local code="${2:-1}"
	patch_error "$msg"
	if [ "${WRAPPER_TEST_MODE:-0}" != "0" ]; then
		return "$code"
	fi
	exit "$code"
}

get_script_ext() {
	local script_ext
	script_ext="${WRAPPER_SCRIPT_EXT:-$DEFAULT_SCRIPT_EXT}"
	script_ext="${script_ext#.}"
	echo "$script_ext"
}

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

check_node_binary_exists() {
	local node_bin="$1"
	local dry_run="$2"
	if ! command -v "$node_bin" >/dev/null 2>&1; then
		if [ "$dry_run" = "0" ]; then
			patch_fatal "node not found in PATH" 1 || return 1
		fi
	fi
}

wrapper_check_node_binary_exists() { check_node_binary_exists "$@"; }

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

wrapper_detect_dry_run() { detect_dry_run "$@"; }

get_display_name() {
	local procedural_number="$1"; local patch_name="$2"; local display_name
	if [ -n "$procedural_number" ]; then display_name="${procedural_number}-${patch_name}"; else display_name="$patch_name"; fi
	echo "$display_name"
}

parse_delimited_args() {
	local delim="$1"; shift
	local -n _targets_ref="$1"; shift
	local -n _fwd_ref="$1"; shift
	while [ "$#" -gt 0 ]; do
		if [ "$1" = "$delim" ]; then shift; break; fi
		_targets_ref+=("$1"); shift
	done
	while [ "$#" -gt 0 ]; do _fwd_ref+=("$1"); shift; done
}

sync_loop_dry_run() {
	local node_bin="$1"; local node_dir="$2"; local script="$3"; local procedural_number="$4"; local patch_name="$5"; shift 5
	local -a targets=(); local -a fwd=(); parse_delimited_args "--" targets fwd "$@"
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

sync_loop_run() {
	local node_bin="$1"; local node_dir="$2"; local script="$3"; local procedural_number="$4"; local patch_name="$5"; shift 5
	local -a targets=(); local -a fwd=(); parse_delimited_args "--" targets fwd "$@"
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

default_run_overrides() {
	local node_bin="$1"; local procedural_number="$2"; local patch_name="$3"; local dry_run="$4"; local display_name="$5"; shift 5
	local -a targets=(); local -a fwd=(); parse_delimited_args "--" targets fwd "$@"
	local t
	for t in "${targets[@]}"; do
		local -a cmd
		cmd=("${node_bin}" "${t}" "--procedural-number" "${procedural_number}" "--patch-name" "${patch_name}")
		if [ "${#fwd[@]}" -gt 0 ]; then cmd+=("${fwd[@]}"); fi
		if ! execute_or_dry_run "$dry_run" "${cmd[@]}"; then
			local rc=$?
			patch_error "${display_name}: Failed with exit code $rc"
			return $rc
		fi
	done
	echo "[patch] ${display_name}: Complete"
	return 0
}

default_run_single() {
	local node_bin="$1"; local node_dir="$2"; local script="$3"; local procedural_number="$4"; local patch_name="$5"; local dry_run="$6"; local display_name="$7"; shift 7
	local -a fwd=()
	if [ "$#" -gt 0 ]; then
		if [ "$1" = "--" ]; then shift; fi
		while [ "$#" -gt 0 ]; do fwd+=("$1"); shift; done
	fi
	local -a cmd
	cmd=("${node_bin}" "${node_dir}/${script}" "--procedural-number" "${procedural_number}" "--patch-name" "${patch_name}")
	if [ "${#fwd[@]}" -gt 0 ]; then cmd+=("${fwd[@]}"); fi
	if execute_or_dry_run "$dry_run" "${cmd[@]}"; then
		echo "[patch] ${display_name}: Complete"
		return 0
	else
		local rc=$?
		patch_error "${display_name}: Failed with exit code $rc"
		return $rc
	fi
}

wrapper_resolve_metadata() {
	local self_name procedural_number patch_name script node_dir
	self_name="${WRAPPER_SELF_NAME:-$(wrapper_get_self_name)}"
	IFS='|' read -r procedural_number patch_name script node_dir < <(derive_patch_metadata "$self_name")
	printf '%s|%s|%s|%s\n' "$procedural_number" "$patch_name" "$script" "$node_dir"
}

wrapper_resolve_node_bin() {
	local candidate="${WRAPPER_NODE_BIN:-${NODE_BIN:-node}}"
	local resolved
	if resolved="$(command -v "$candidate" 2>/dev/null)"; then echo "$resolved"; else echo "$candidate"; fi
}

wrapper_resolve_dry_run() { wrapper_detect_dry_run "${PATCH_DRY_RUN:-}" "${DRY_RUN:-}" "$@"; }

wrapper_resolve_script_ext() { check_ext_override "$@"; }

wrapper_collect_forwarded_args() {
	local -a args=()
	mapfile -t args < <(filter_out_dry_run "$@")
	mapfile -t args < <(filter_out_wrapper_target_flags "${args[@]}")
	if [ "${#args[@]}" -gt 0 ]; then printf '%s\n' "${args[@]}"; fi
}

wrapper_collect_override_targets() {
	local node_dir="$1"; local script_ext="$2"; shift 2
	collect_wrapper_targets "$node_dir" "$script_ext" "$@"
}

wrapper_execute_mode() {
	local mode="$1"; shift
	case "$mode" in
		sync-loop) sync_loop_run "$@" ;;
		default|*) default_run_single "$@" ;;
	esac
}

wrapper_main() {
	handle_help "$@"
	local procedural_number patch_name script node_dir
	IFS='|' read -r procedural_number patch_name script node_dir < <(wrapper_resolve_metadata)
	local node_bin; node_bin="$(wrapper_resolve_node_bin)"
	local dry_run; dry_run="$(wrapper_resolve_dry_run "$@")"
	if ! wrapper_check_node_binary_exists "$node_bin" "$dry_run"; then return 1; fi
	if ! check_node_dir_exists "$node_dir" "$dry_run"; then return 1; fi
	local script_ext; script_ext="$(wrapper_resolve_script_ext "$@")"
	script="${patch_name}.${script_ext}"
	local -a override_targets=(); mapfile -t override_targets < <(wrapper_collect_override_targets "$node_dir" "$script_ext" "$@")
	local -a forwarded_args=(); mapfile -t forwarded_args < <(wrapper_collect_forwarded_args "$@")
	local display_name; display_name="$(get_display_name "$procedural_number" "$patch_name")"
	local mode; mode="${WRAPPER_RUN_MODE:-default}"
	echo "[patch] ${display_name}: Delegating to Node.js script"
	patch_debug "node_bin=$node_bin"; patch_debug "node_dir=$node_dir"; patch_debug "script_ext=$script_ext"; patch_debug "script=$script"; patch_debug "mode=$mode"
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
