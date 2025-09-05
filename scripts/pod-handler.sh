#!/usr/bin/env bash
# Small access point wrapper around compose.dev.yml.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_COMPOSE_FILE="$SCRIPT_DIR/../compose.dev.yml"

COMPOSE_FILE="${COMPOSE_FILE:-}"
if [ -z "$COMPOSE_FILE" ]; then
	if [ -f "compose.dev.yml" ]; then
		COMPOSE_FILE="compose.dev.yml"
	else
		COMPOSE_FILE="$DEFAULT_COMPOSE_FILE"
	fi
fi

if [ ! -f "$COMPOSE_FILE" ]; then
	echo "ERROR: compose file not found: $COMPOSE_FILE" >&2
	exit 2
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
	dc_cmd() { docker compose -f "$COMPOSE_FILE" "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
	dc_cmd() { docker-compose -f "$COMPOSE_FILE" "$@"; }
else
	echo "ERROR: neither 'docker compose' nor 'docker-compose' available in PATH" >&2
	exit 3
fi

usage() {
	cat <<'USAGE'
Usage: pod-handler.sh [options] <command> [service] [args...]

Options:
	-f, --file <compose.yml>  Path to docker compose file (default: compose.dev.yml or scripts/../compose.dev.yml)

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
		help|-h|--help|up|start|down|restart|build|pull|ps|logs|exec|shell|run-builder|stop-builder)
			cmd="$1"; shift; break;;
		*)
			cmd="$1"; shift; break;;
	esac
done

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
			dc_cmd up -d --remove-orphans
		else
			dc_cmd up --remove-orphans
		fi
		;;
	start)
		if [ $# -lt 1 ]; then
			echo "Usage: $0 start SERVICE" >&2
			exit 1
		fi
		svc="$1"; shift
		dc_cmd up -d --build --no-deps "$svc"
		;;
	down)
		dc_cmd down
		;;
	restart)
		if [ $# -lt 1 ]; then
			echo "Usage: $0 restart SERVICE" >&2
			exit 1
		fi
		dc_cmd restart "$1"
		;;
	build)
		if [ $# -ge 1 ]; then
			dc_cmd build "$1"
		else
			dc_cmd build
		fi
		;;
	pull)
		dc_cmd pull
		;;
	ps)
		dc_cmd ps
		;;
	logs)
		FOLLOW=false
		if [ "${1:-}" = "-f" ]; then
			FOLLOW=true
			shift
		fi
		if [ $# -ge 1 ]; then
			if $FOLLOW; then dc_cmd logs -f "$1"; else dc_cmd logs "$1"; fi
		else
			if $FOLLOW; then dc_cmd logs -f; else dc_cmd logs; fi
		fi
		;;
	exec)
		if [ $# -lt 1 ]; then
			echo "Usage: $0 exec SERVICE [CMD...]" >&2
			exit 1
		fi
		svc="$1"; shift
		if [ $# -eq 0 ]; then
			dc_cmd exec -u 0 -it "$svc" sh
		else
			dc_cmd exec -u 0 -it "$svc" "$@"
		fi
		;;
	shell)
		if [ $# -lt 1 ]; then
			echo "Usage: $0 shell SERVICE" >&2
			exit 1
		fi
		svc="$1"; shift
		dc_cmd exec -u 0 -it "$svc" sh -c 'if command -v bash >/dev/null 2>&1; then exec bash; elif command -v ash >/dev/null 2>&1; then exec ash; else exec sh; fi'
		;;
	run-builder)
		dc_cmd up -d --build builder
		;;
	stop-builder)
		dc_cmd stop builder || true
		;;
	*)
		echo "Unknown command: $cmd" >&2
		usage
		exit 1
		;;
esac
