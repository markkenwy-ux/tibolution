#!/usr/bin/env bash
set -euo pipefail

DATA_HOME="${XDG_DATA_HOME:-${HOME:?HOME is required}/.local/share}"
APPLICATIONS_DIR="$DATA_HOME/applications"
STATE_DIR="$DATA_HOME/tibolution"
DESKTOP_FILE="$APPLICATIONS_DIR/chatgpt.desktop"
INSTALLED_LAUNCHER="$STATE_DIR/launch-linux.sh"
CONFIG_FILE="$STATE_DIR/launcher.conf"
PREVIOUS_FILE="$STATE_DIR/chatgpt.desktop.previous"
PREVIOUS_SHA_FILE="$STATE_DIR/chatgpt.desktop.previous.sha256"
PREVIOUS_ABSENT_FILE="$STATE_DIR/chatgpt.desktop.previous.absent"
INSTALLED_SHA_FILE="$STATE_DIR/chatgpt.desktop.installed.sha256"
STATE_LOCK="$STATE_DIR/launcher-state.lock"

regular_file() {
  [[ -f "$1" && ! -L "$1" ]]
}

sha256_file() {
  sha256sum -- "$1" | cut -d ' ' -f 1
}

valid_hash_file() {
  regular_file "$1" && [[ "$(sed -n '1p' "$1")" =~ ^[0-9a-f]{64}$ ]]
}

[[ -d "$STATE_DIR" && ! -L "$STATE_DIR" ]] || { printf '%s\n' 'The Tibolution Linux launcher is not installed.'; exit 0; }
exec 8>"$STATE_LOCK"
flock -x 8
valid_hash_file "$INSTALLED_SHA_FILE" || { printf '%s\n' 'Installed launcher hash record is missing or invalid.' >&2; exit 1; }
installed_sha="$(sed -n '1p' "$INSTALLED_SHA_FILE")"

previous_kind=""
previous_sha=""
if [[ -e "$PREVIOUS_ABSENT_FILE" ]]; then
  regular_file "$PREVIOUS_ABSENT_FILE" || { printf '%s\n' 'Launcher state is unsafe.' >&2; exit 1; }
  [[ ! -e "$PREVIOUS_FILE" && ! -e "$PREVIOUS_SHA_FILE" ]] || { printf '%s\n' 'Launcher state is inconsistent.' >&2; exit 1; }
  previous_kind="absent"
else
  regular_file "$PREVIOUS_FILE" && valid_hash_file "$PREVIOUS_SHA_FILE" \
    || { printf '%s\n' 'The previous desktop entry backup is incomplete.' >&2; exit 1; }
  previous_sha="$(sed -n '1p' "$PREVIOUS_SHA_FILE")"
  [[ "$(sha256_file "$PREVIOUS_FILE")" == "$previous_sha" ]] \
    || { printf '%s\n' 'The previous desktop entry backup hash does not match.' >&2; exit 1; }
  previous_kind="file"
fi

active_kind="absent"
active_sha=""
if [[ -e "$DESKTOP_FILE" ]]; then
  regular_file "$DESKTOP_FILE" || { printf '%s\n' 'The active user desktop entry is unsafe.' >&2; exit 1; }
  active_kind="file"
  active_sha="$(sha256_file "$DESKTOP_FILE")"
fi

if [[ "$active_kind" == "file" && "$active_sha" == "$installed_sha" ]]; then
  if [[ "$previous_kind" == "file" ]]; then
    temporary="$(mktemp --tmpdir="$APPLICATIONS_DIR" '.chatgpt.desktop.restore.XXXXXX')"
    trap 'rm -f -- "$temporary"' EXIT
    install -m 0644 -- "$PREVIOUS_FILE" "$temporary"
    [[ "$(sha256_file "$temporary")" == "$previous_sha" ]] \
      || { printf '%s\n' 'Temporary desktop entry restore hash mismatch.' >&2; exit 1; }
    mv -f -- "$temporary" "$DESKTOP_FILE"
    trap - EXIT
  else
    rm -f -- "$DESKTOP_FILE"
  fi
elif [[ "$previous_kind" == "file" && "$active_kind" == "file" && "$active_sha" == "$previous_sha" ]]; then
  :
elif [[ "$previous_kind" == "absent" && "$active_kind" == "absent" ]]; then
  :
else
  printf '%s\n' 'The user desktop entry changed after Tibolution installed it; refusing to overwrite or remove it.' >&2
  exit 1
fi

rm -f -- "$INSTALLED_LAUNCHER" "$CONFIG_FILE" "$PREVIOUS_FILE" "$PREVIOUS_SHA_FILE" \
  "$PREVIOUS_ABSENT_FILE" "$INSTALLED_SHA_FILE"
exec 8>&-
rm -f -- "$STATE_LOCK"
rmdir -- "$STATE_DIR" 2>/dev/null || true

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi
printf '%s\n' 'Removed the Tibolution Linux startup self-check and restored the previous user desktop entry state.'
