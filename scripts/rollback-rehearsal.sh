#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH=""
CURRENT_LINK="current"
EXECUTE_MODE=0
RELOAD_CMD=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/rollback-rehearsal.sh --deploy-path <path> [--current-link current] [--execute] [--reload-cmd "<cmd>"]

Description:
  - Dry-run by default. Prints rollback rehearsal plan without changing symlink.
  - With --execute, switches current symlink to previous release and then restores original target.

Examples:
  scripts/rollback-rehearsal.sh --deploy-path /var/www/teklifim-staging
  scripts/rollback-rehearsal.sh --deploy-path /var/www/teklifim-staging --execute --reload-cmd "pm2 reload teklifim-backend"
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deploy-path)
      DEPLOY_PATH="${2:-}"
      shift 2
      ;;
    --current-link)
      CURRENT_LINK="${2:-current}"
      shift 2
      ;;
    --execute)
      EXECUTE_MODE=1
      shift
      ;;
    --reload-cmd)
      RELOAD_CMD="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$DEPLOY_PATH" ]]; then
  echo "Error: --deploy-path is required." >&2
  usage
  exit 1
fi

DEPLOY_PATH="$(cd "$DEPLOY_PATH" && pwd)"
RELEASES_DIR="$DEPLOY_PATH/releases"
CURRENT_PATH="$DEPLOY_PATH/$CURRENT_LINK"

if [[ ! -d "$RELEASES_DIR" ]]; then
  echo "Error: releases directory not found: $RELEASES_DIR" >&2
  exit 1
fi

if [[ ! -L "$CURRENT_PATH" ]]; then
  echo "Error: current symlink not found: $CURRENT_PATH" >&2
  exit 1
fi

mapfile -t RELEASES < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)

if [[ "${#RELEASES[@]}" -lt 2 ]]; then
  echo "Error: at least 2 releases are required for rehearsal." >&2
  exit 1
fi

ORIGINAL_TARGET="$(readlink "$CURRENT_PATH")"
ORIGINAL_ABS="$(readlink -f "$CURRENT_PATH")"
CURRENT_RELEASE="$(basename "$ORIGINAL_ABS")"

CURRENT_INDEX=-1
for i in "${!RELEASES[@]}"; do
  if [[ "${RELEASES[$i]}" == "$CURRENT_RELEASE" ]]; then
    CURRENT_INDEX="$i"
    break
  fi
done

if [[ "$CURRENT_INDEX" -lt 0 ]]; then
  echo "Error: current release ($CURRENT_RELEASE) not found under $RELEASES_DIR" >&2
  exit 1
fi

if [[ "$CURRENT_INDEX" -eq 0 ]]; then
  echo "Error: no previous release found before $CURRENT_RELEASE" >&2
  exit 1
fi

PREVIOUS_RELEASE="${RELEASES[$((CURRENT_INDEX - 1))]}"
PREVIOUS_TARGET="releases/${PREVIOUS_RELEASE}"

echo "Rollback rehearsal plan:"
echo "  Deploy path     : $DEPLOY_PATH"
echo "  Current symlink : $CURRENT_LINK -> $ORIGINAL_TARGET"
echo "  Previous target : $PREVIOUS_TARGET"

if [[ "$EXECUTE_MODE" -eq 0 ]]; then
  echo "Mode: dry-run (no changes applied)"
  exit 0
fi

echo "Mode: execute"

ln -sfn "$PREVIOUS_TARGET" "$CURRENT_PATH"
if [[ -n "$RELOAD_CMD" ]]; then
  bash -lc "$RELOAD_CMD"
fi

AFTER_ROLLBACK="$(readlink "$CURRENT_PATH")"
if [[ "$AFTER_ROLLBACK" != "$PREVIOUS_TARGET" ]]; then
  echo "Error: rollback switch verification failed (expected $PREVIOUS_TARGET, got $AFTER_ROLLBACK)" >&2
  exit 1
fi

echo "Rollback switch successful: $CURRENT_LINK -> $AFTER_ROLLBACK"

ln -sfn "$ORIGINAL_TARGET" "$CURRENT_PATH"
if [[ -n "$RELOAD_CMD" ]]; then
  bash -lc "$RELOAD_CMD"
fi

AFTER_RESTORE="$(readlink "$CURRENT_PATH")"
if [[ "$AFTER_RESTORE" != "$ORIGINAL_TARGET" ]]; then
  echo "Error: restore verification failed (expected $ORIGINAL_TARGET, got $AFTER_RESTORE)" >&2
  exit 1
fi

echo "Rollback rehearsal completed and original target restored."
