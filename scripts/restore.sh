#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node)"
DIST_DIR="${TIBO_TEST_DIST_DIR:-$PROJECT_DIR/dist}"
ORIGINAL_SHA="${1:-}"
[[ "$ORIGINAL_SHA" =~ ^[0-9a-f]{64}$ ]] || {
  printf '%s\n' 'Pass the exact original SHA-256 as the first argument.' >&2
  exit 2
}

if [[ "${TIBO_TEST_MODE:-0}" == "1" ]]; then
  TARGET_ASAR="${TIBO_TEST_TARGET_ASAR:?TIBO_TEST_TARGET_ASAR is required in test mode}"
elif [[ "${2:-}" == "--target" ]]; then
  [[ -n "${3:-}" ]] || { printf '%s\n' '--target requires an exact app.asar path.' >&2; exit 2; }
  TARGET_ASAR="$3"
else
  TARGET_ASAR="$($NODE_BIN "$PROJECT_DIR/scripts/platform.mjs" locate)"
fi

TRANSACTION=("$NODE_BIN" "$PROJECT_DIR/scripts/transaction.mjs" restore
  --target "$TARGET_ASAR" --original-sha "$ORIGINAL_SHA" --dist "$DIST_DIR")
if [[ "${TIBO_TEST_MODE:-0}" == "1" || "$(id -u)" == "0" || -w "$(dirname -- "$TARGET_ASAR")" ]]; then
  exec "${TRANSACTION[@]}"
fi
exec sudo -- "${TRANSACTION[@]}"
