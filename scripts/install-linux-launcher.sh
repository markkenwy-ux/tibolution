#!/usr/bin/env bash
set -euo pipefail

[[ "$(uname -s)" == "Linux" ]] || { printf '%s\n' 'The automatic Desktop launcher is Linux-only.' >&2; exit 2; }

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
NODE_CANDIDATE="${TIBO_LAUNCHER_NODE_BIN:-$(command -v node)}"
NODE_BIN="$(readlink -f -- "$NODE_CANDIDATE")"
CHATGPT_BIN="${TIBO_LAUNCHER_CHATGPT_BIN:-/usr/lib/chatgpt/ChatGPT}"
TARGET_ASAR="${TIBO_LAUNCHER_TARGET_ASAR:-/usr/lib/chatgpt/resources/app.asar}"
SYSTEM_DESKTOP="${TIBO_LAUNCHER_SYSTEM_DESKTOP:-/usr/share/applications/chatgpt.desktop}"
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

atomic_copy() {
  local source="$1"
  local destination="$2"
  local mode="$3"
  local temporary
  temporary="$(mktemp --tmpdir="$(dirname -- "$destination")" ".$(basename -- "$destination").new.XXXXXX")"
  trap 'rm -f -- "$temporary"' RETURN
  install -m "$mode" -- "$source" "$temporary"
  mv -f -- "$temporary" "$destination"
  trap - RETURN
}

atomic_text() {
  local destination="$1"
  local mode="$2"
  local text="$3"
  local temporary
  temporary="$(mktemp --tmpdir="$(dirname -- "$destination")" ".$(basename -- "$destination").new.XXXXXX")"
  trap 'rm -f -- "$temporary"' RETURN
  printf '%s' "$text" >"$temporary"
  chmod "$mode" -- "$temporary"
  mv -f -- "$temporary" "$destination"
  trap - RETURN
}

for file in "$PROJECT_DIR/scripts/launch-linux.sh" "$PROJECT_DIR/scripts/render-linux-desktop.mjs" \
  "$PROJECT_DIR/scripts/platform.mjs" "$PROJECT_DIR/scripts/check-installed.mjs" \
  "$PROJECT_DIR/scripts/prepare-install.mjs" "$PROJECT_DIR/scripts/transaction.mjs"; do
  regular_file "$file" || { printf 'Required project file is missing or unsafe: %s\n' "$file" >&2; exit 1; }
done
[[ "$NODE_BIN" == /* && -x "$NODE_BIN" ]] || { printf '%s\n' 'A usable absolute Node.js path was not found.' >&2; exit 1; }
"$NODE_BIN" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || major === 22 && minor >= 12 ? 0 : 1)' \
  || { printf '%s\n' 'Node.js 22.12 or newer is required.' >&2; exit 1; }
[[ "$CHATGPT_BIN" == /* && -x "$CHATGPT_BIN" ]] || { printf 'ChatGPT executable is unavailable: %s\n' "$CHATGPT_BIN" >&2; exit 1; }
regular_file "$TARGET_ASAR" || { printf 'Codex app.asar is missing or unsafe: %s\n' "$TARGET_ASAR" >&2; exit 1; }
regular_file "$SYSTEM_DESKTOP" || { printf 'System desktop entry is missing or unsafe: %s\n' "$SYSTEM_DESKTOP" >&2; exit 1; }
command -v flock >/dev/null || { printf '%s\n' 'flock is required.' >&2; exit 1; }
command -v pkexec >/dev/null || { printf '%s\n' 'pkexec is required for update-time repair.' >&2; exit 1; }

mkdir -p -- "$APPLICATIONS_DIR" "$STATE_DIR"
chmod 700 -- "$STATE_DIR"
exec 8>"$STATE_LOCK"
chmod 0600 -- "$STATE_LOCK"
flock -x 8

state_exists=0
if [[ -e "$PREVIOUS_FILE" || -e "$PREVIOUS_SHA_FILE" || -e "$PREVIOUS_ABSENT_FILE" || -e "$INSTALLED_SHA_FILE" ]]; then
  state_exists=1
fi

if [[ $state_exists -eq 0 ]]; then
  if [[ -e "$DESKTOP_FILE" ]]; then
    regular_file "$DESKTOP_FILE" || { printf 'Existing user desktop entry is unsafe: %s\n' "$DESKTOP_FILE" >&2; exit 1; }
    atomic_copy "$DESKTOP_FILE" "$PREVIOUS_FILE" 0600
    atomic_text "$PREVIOUS_SHA_FILE" 0600 "$(sha256_file "$PREVIOUS_FILE")"$'\n'
  else
    atomic_text "$PREVIOUS_ABSENT_FILE" 0600 $'absent\n'
  fi
else
  if [[ -e "$PREVIOUS_ABSENT_FILE" ]]; then
    regular_file "$PREVIOUS_ABSENT_FILE" || { printf '%s\n' 'Launcher state is unsafe.' >&2; exit 1; }
    [[ ! -e "$PREVIOUS_FILE" && ! -e "$PREVIOUS_SHA_FILE" ]] || { printf '%s\n' 'Launcher state is inconsistent.' >&2; exit 1; }
  else
    regular_file "$PREVIOUS_FILE" && valid_hash_file "$PREVIOUS_SHA_FILE" \
      || { printf '%s\n' 'The previous desktop entry backup is incomplete.' >&2; exit 1; }
    [[ "$(sha256_file "$PREVIOUS_FILE")" == "$(sed -n '1p' "$PREVIOUS_SHA_FILE")" ]] \
      || { printf '%s\n' 'The previous desktop entry backup hash does not match.' >&2; exit 1; }
  fi

  if [[ -e "$DESKTOP_FILE" ]]; then
    regular_file "$DESKTOP_FILE" || { printf '%s\n' 'The active user desktop entry is unsafe.' >&2; exit 1; }
    current_sha="$(sha256_file "$DESKTOP_FILE")"
    current_allowed=0
    if valid_hash_file "$INSTALLED_SHA_FILE" && [[ "$current_sha" == "$(sed -n '1p' "$INSTALLED_SHA_FILE")" ]]; then
      current_allowed=1
    elif [[ -e "$PREVIOUS_FILE" && "$current_sha" == "$(sed -n '1p' "$PREVIOUS_SHA_FILE")" ]]; then
      current_allowed=1
    fi
    [[ $current_allowed -eq 1 ]] || { printf '%s\n' 'The user desktop entry changed since Tibolution recorded it; refusing to overwrite.' >&2; exit 1; }
  elif [[ ! -e "$PREVIOUS_ABSENT_FILE" ]]; then
    printf '%s\n' 'The user desktop entry disappeared after its backup was recorded; refusing to overwrite.' >&2
    exit 1
  fi
fi

FLOCK_BIN="$(readlink -f -- "$(command -v flock)")"
PKEXEC_BIN="$(readlink -f -- "$(command -v pkexec)")"
NOTIFY_CANDIDATE="$(command -v notify-send || true)"
NOTIFY_BIN=""
if [[ -n "$NOTIFY_CANDIDATE" ]]; then NOTIFY_BIN="$(readlink -f -- "$NOTIFY_CANDIDATE")"; fi

atomic_copy "$PROJECT_DIR/scripts/launch-linux.sh" "$INSTALLED_LAUNCHER" 0755
config_text="$(printf 'TIBO_PROJECT_DIR=%q\nTIBO_NODE_BIN=%q\nTIBO_CHATGPT_BIN=%q\nTIBO_TARGET_ASAR=%q\nTIBO_DIST_DIR=%q\nTIBO_PKEXEC_BIN=%q\nTIBO_FLOCK_BIN=%q\nTIBO_NOTIFY_BIN=%q\n' \
  "$PROJECT_DIR" "$NODE_BIN" "$CHATGPT_BIN" "$TARGET_ASAR" "$PROJECT_DIR/dist" "$PKEXEC_BIN" "$FLOCK_BIN" "$NOTIFY_BIN")"$'\n'
atomic_text "$CONFIG_FILE" 0600 "$config_text"

desktop_temporary="$(mktemp --tmpdir="$APPLICATIONS_DIR" '.chatgpt.desktop.new.XXXXXX')"
trap 'rm -f -- "$desktop_temporary"' EXIT
rm -f -- "$desktop_temporary"
"$NODE_BIN" "$PROJECT_DIR/scripts/render-linux-desktop.mjs" \
  --source "$SYSTEM_DESKTOP" --launcher "$INSTALLED_LAUNCHER" --output "$desktop_temporary"
installed_sha="$(sha256_file "$desktop_temporary")"
atomic_text "$INSTALLED_SHA_FILE" 0600 "$installed_sha"$'\n'
mv -f -- "$desktop_temporary" "$DESKTOP_FILE"
trap - EXIT
chmod 0644 -- "$DESKTOP_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi

printf '%s\n' 'Installed the Tibolution Linux startup self-check.'
printf 'Desktop entry: %s\n' "$DESKTOP_FILE"
printf '%s\n' 'After a Codex update, the first menu launch may request Polkit authorization once.'
