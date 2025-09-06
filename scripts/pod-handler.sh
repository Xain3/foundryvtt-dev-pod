#!/usr/bin/env bash
# Small access point wrapper around compose.dev.yml.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_COMPOSE_FILE="$SCRIPT_DIR/../compose.dev.yml"
#!/usr/bin/env bash
# Small access point wrapper around compose.dev.yml.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_COMPOSE_FILE="$SCRIPT_DIR/../compose.dev.yml"

# Initialize COMPOSE_FILE but don't validate yet
COMPOSE_FILE="${COMPOSE_FILE:-}"

# Dry-run support
DRY_RUN=false

usage() {
	cat <<'USAGE'
Usage: pod-handler.sh [options] <command> [service] [args...]

Options:
	-f, --file <compose.yml>  Path to docker compose file (default: compose.dev.yml or scripts/../compose.dev.yml)
	--dry-run, -n             Show what docker compose commands would be executed without executing them

Commands:
	up [-d]            Start all services (or detached with -d)
	start SERVICE      Start a single service (detached)
	down               Stop and remove containers
	restart SERVICE    Restart a service
	build [SERVICE]    Build all or a single service
	pull               Pull images
	ps                 Show containers for this compose project
	logs [-f] [SERVICE]  Show logs (use -f to follow)
	exec SERVICE [CMD] Exec a command in a running service (defaults to sh)
	shell SERVICE      Open an interactive shell in a service (sh/ash/bash)
	run-builder        Start the builder service (detached)
	stop-builder       Stop the builder service
	help               Print this help
USAGE
}

if [ $# -lt 1 ]; then
	usage
	exit 0
fi

while [ "$#" -gt 0 ]; do
	case "$1" in
		-f|--file)
			shift
			COMPOSE_FILE="${1:-}"
			if [ -z "$COMPOSE_FILE" ]; then
				echo "ERROR: --file requires a path" >&2
				exit 1
			fi
			shift
			;;
		--dry-run|-n)
			DRY_RUN=true
			shift
			;;
		help|-h|--help|up|start|down|restart|build|pull|ps|logs|exec|shell|run-builder|stop-builder)
			cmd="$1"; shift; break;;
		*)
			cmd="$1"; shift; break;;
		esac
done

# Now resolve and validate the compose file
if [ -z "$COMPOSE_FILE" ]; then
	if [ -f "compose.dev.yml" ]; then
		COMPOSE_FILE="compose.dev.yml"
	else
		COMPOSE_FILE="$DEFAULT_COMPOSE_FILE"
	fi
fi

# Skip compose file validation for help command
if [ "${cmd:-}" != "help" ] && [ "${cmd:-}" != "-h" ] && [ "${cmd:-}" != "--help" ]; then
	if [ ! -f "$COMPOSE_FILE" ]; then
		echo "ERROR: compose file not found: $COMPOSE_FILE" >&2
		exit 2
	fi
	
	# Validate container-config.json if it exists
	CONFIG_FILE="container-config.json"
	if [ -f "$CONFIG_FILE" ]; then
		echo "Validating container configuration..."
		if ! node "$SCRIPT_DIR/validate-config.js" "$CONFIG_FILE" /tmp >/dev/null 2>&1; then
			echo "ERROR: Container configuration validation failed" >&2
			exit 2
		fi
	fi
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
	dc_cmd() { docker compose -f "$COMPOSE_FILE" "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
	dc_cmd() { docker-compose -f "$COMPOSE_FILE" "$@"; }
else
	echo "ERROR: neither 'docker compose' nor 'docker-compose' available in PATH" >&2
	exit 3
fi

execute_or_dry_run() {
	if [ "$DRY_RUN" = "true" ]; then
		echo "[dry-run] Would run: $*"
		return 0
	fi
	"$@"
}
case "$cmd" in
	help|-h|--help)
		usage
		;;
	up)
		DETACH=false
		if [ "${1:-}" = "-d" ]; then
			DETACH=true
			shift
		fi
		if $DETACH; then
			execute_or_dry_run dc_cmd up -d --remove-orphans
		else
			execute_or_dry_run dc_cmd up --remove-orphans
		fi
		;;
	start)
		if [ $# -lt 1 ]; then
			echo "Usage: $0 start SERVICE" >&2
			exit 1
		fi
		svc="$1"; shift
		execute_or_dry_run dc_cmd up -d --build --no-deps "$svc"
		;;
	down)
		execute_or_dry_run dc_cmd down
		;;
	restart)
		if [ $# -lt 1 ]; then
			echo "Usage: $0 restart SERVICE" >&2
			exit 1
		fi
		execute_or_dry_run dc_cmd restart "$1"
		;;
	build)
		if [ $# -ge 1 ]; then
			execute_or_dry_run dc_cmd build "$1"
		else
			execute_or_dry_run dc_cmd build
		fi
		;;
	pull)
		execute_or_dry_run dc_cmd pull
		;;
	ps)
		execute_or_dry_run dc_cmd ps
		;;
	logs)
		FOLLOW=false
		if [ "${1:-}" = "-f" ]; then
			FOLLOW=true
			shift
		fi
		if [ $# -ge 1 ]; then
			if $FOLLOW; then execute_or_dry_run dc_cmd logs -f "$1"; else execute_or_dry_run dc_cmd logs "$1"; fi
		else
			if $FOLLOW; then execute_or_dry_run dc_cmd logs -f; else execute_or_dry_run dc_cmd logs; fi
		fi
		;;
	exec)
		if [ $# -lt 1 ]; then
			echo "Usage: $0 exec SERVICE [CMD...]" >&2
			exit 1
		fi
		svc="$1"; shift
		if [ $# -eq 0 ]; then
			execute_or_dry_run dc_cmd exec -u 0 -it "$svc" sh
		else
			execute_or_dry_run dc_cmd exec -u 0 -it "$svc" "$@"
		fi
		;;
	shell)
		if [ $# -lt 1 ]; then
			echo "Usage: $0 shell SERVICE" >&2
			exit 1
		fi
		svc="$1"; shift
		execute_or_dry_run dc_cmd exec -u 0 -it "$svc" sh -c 'if command -v bash >/dev/null 2>&1; then exec bash; elif command -v ash >/dev/null 2>&1; then exec ash; else exec sh; fi'
		;;
	run-builder)
		execute_or_dry_run dc_cmd up -d --build builder
		;;
	stop-builder)
		execute_or_dry_run dc_cmd stop builder || true
		;;
	*)
		echo "Unknown command: $cmd" >&2
		usage
		exit 1
		;;
esac
