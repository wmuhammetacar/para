#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PORT="${E2E_BACKEND_PORT:-4011}"
FRONTEND_PORT="${E2E_FRONTEND_PORT:-5201}"

echo "[1/4] Backend lint + syntax checks"
(
  cd "$ROOT_DIR/backend"
  npm run lint
  npm run check:syntax
)

echo "[2/4] Backend coverage tests"
(
  cd "$ROOT_DIR/backend"
  npm run test:coverage
)

echo "[3/4] Frontend lint + unit tests + build"
(
  cd "$ROOT_DIR/frontend"
  npm run lint
  npm run test:run
  npm run build
)

echo "[4/4] Frontend e2e smoke + workflow + quality tests"
(
  cd "$ROOT_DIR/frontend"
  E2E_BACKEND_PORT="$BACKEND_PORT" E2E_FRONTEND_PORT="$FRONTEND_PORT" npm run e2e
)

if [[ "${RUN_DR_DRILL:-0}" == "1" ]]; then
  echo "[Optional] Disaster recovery drill"
  (
    cd "$ROOT_DIR/backend"
    npm run dr:drill
  )
fi

if [[ "${RUN_API_SMOKE:-0}" == "1" ]]; then
  echo "[Optional] API smoke"
  "$ROOT_DIR/scripts/api-smoke.sh"
fi

echo "Quality gate completed successfully."
