#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

SMOKE_HOST="${SMOKE_HOST:-127.0.0.1}"
SMOKE_BACKEND_PORT="${SMOKE_BACKEND_PORT:-4061}"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://${SMOKE_HOST}:${SMOKE_BACKEND_PORT}}"
SMOKE_WAIT_SECONDS="${SMOKE_WAIT_SECONDS:-2}"
SMOKE_LOG_FILE="${SMOKE_LOG_FILE:-/tmp/teklifim-api-smoke-${SMOKE_BACKEND_PORT}.log}"

echo "Starting temporary backend for API smoke on ${SMOKE_BASE_URL}"
(
  cd "$BACKEND_DIR"
  HOST="$SMOKE_HOST" PORT="$SMOKE_BACKEND_PORT" node src/server.js >"$SMOKE_LOG_FILE" 2>&1 &
  SERVER_PID=$!

  cleanup() {
    if kill -0 "$SERVER_PID" 2>/dev/null; then
      kill "$SERVER_PID" 2>/dev/null || true
      wait "$SERVER_PID" 2>/dev/null || true
    fi
  }

  trap cleanup EXIT

  sleep "$SMOKE_WAIT_SECONDS"

  SMOKE_BASE_URL="$SMOKE_BASE_URL" npm run smoke:api
)

echo "API smoke completed successfully."
