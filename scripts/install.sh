#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node)"
DIST_DIR="${TIBO_TEST_DIST_DIR:-$PROJECT_DIR/dist}"
PATCHED_ASAR="$DIST_DIR/app.tibo-patched.asar"

if [[ "${TIBO_TEST_MODE:-0}" == "1" ]]; then
  TARGET_ASAR="${TIBO_TEST_TARGET_ASAR:?TIBO_TEST_TARGET_ASAR is required in test mode}"
elif [[ "${1:-}" == "--target" ]]; then
  [[ -n "${2:-}" ]] || { printf '%s\n' '--target requires an exact app.asar path.' >&2; exit 2; }
  TARGET_ASAR="$2"
else
  TARGET_ASAR="$($NODE_BIN "$PROJECT_DIR/scripts/platform.mjs" locate)"
fi

"$NODE_BIN" "$PROJECT_DIR/scripts/prepare-install.mjs" \
  --target "$TARGET_ASAR" --patched "$PATCHED_ASAR" --dist "$DIST_DIR"

TRANSACTION=("$NODE_BIN" "$PROJECT_DIR/scripts/transaction.mjs" install
  --target "$TARGET_ASAR" --patched "$PATCHED_ASAR" --dist "$DIST_DIR")
if [[ "${TIBO_TEST_MODE:-0}" == "1" || "$(id -u)" == "0" || -w "$(dirname -- "$TARGET_ASAR")" ]]; then
  exec "${TRANSACTION[@]}"
fi
exec sudo -- "${TRANSACTION[@]}"
