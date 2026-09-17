# Tibolution / 滑动变祖器

**Windows CDP pilot:** see [Windows runtime setup and restore](docs/windows-cdp.md).
This backend targets the official MSIX client without modifying application
files. Signed-package refusals below apply to the original ASAR backend.

> Turn up the reasoning. Evolve the Tibo.

[English](README.md) | [简体中文](README.zh-CN.md) |
[GitHub publishing guide (中文)](docs/GITHUB-PUBLISHING.zh-CN.md) |
[v2.2.0-cdp.2 release notes](docs/releases/v2.2.0-cdp.2.md)

Preview version: **2.2.0-cdp.2**. Windows CDP injection and dark-theme
transparency have been verified on client 26.911.7940.0. Native effort
interactions and light-theme Desktop acceptance remain unverified. See the
release notes for the exact scope; the original ASAR backend remains available.

**Tibolution** is an unofficial, model-agnostic background patch for Codex
Desktop. It observes the final native reasoning effort and crossfades between
six local images. It does not edit the official React bundle, add effort
levels, parse chat text, or add any controls or explanatory copy to the app.

Tibolution 是非官方 Codex Desktop 背景补丁。它只观察 Codex 最终选中的原生
reasoning effort，不依赖模型名称，也不会解锁模型不支持的档位。

## Highlights

- Uses the six supplied PNGs for native `low`, `medium`, `high`, `xhigh`,
  `max`, and `ultra` states.
- Works by final reasoning effort, not by model name. There is no Sol, Terra,
  Luna, GPT-5.x, or other model allowlist.
- Never adds an effort level or control that Codex does not already expose.
- Responds to both the main reasoning slider and the Advanced menu through one
  native state attribute.
- Injects independent CSS, JavaScript, and images without editing the minified
  official React bundles.
- Builds in the user directory, checks source immutability, installs atomically,
  and restores only an exact SHA-256 backup.
- Optionally repairs Linux package-update overwrites before an application-menu
  launch, with visible Polkit authorization and official-client fallback.

## Background set

| `low` | `medium` |
|---|---|
| <img src="assets/low.png" alt="Tibolution low reasoning background" width="420" /> | <img src="assets/medium.png" alt="Tibolution medium reasoning background" width="420" /> |
| `high` | `xhigh` |
| <img src="assets/high.png" alt="Tibolution high reasoning background" width="420" /> | <img src="assets/xhigh.png" alt="Tibolution xhigh reasoning background" width="420" /> |
| `max` | `ultra` |
| <img src="assets/max.png" alt="Tibolution max reasoning background" width="420" /> | <img src="assets/ultra.png" alt="Tibolution ultra reasoning background" width="420" /> |

## Mapping

| Native effort | Image |
|---|---|
| `low` | `assets/low.png` |
| `medium` | `assets/medium.png` |
| `high` | `assets/high.png` |
| `xhigh` | `assets/xhigh.png` |
| `max` | `assets/max.png` |
| `ultra` | `assets/ultra.png` |

The mapping applies to every current and future model. Codex remains the sole
authority for which effort levels a model supports; this patch only reacts to
levels already exposed and selected by the native UI.

## How it works

The builder adds two local entries before `</head>` in `webview/index.html`:

```html
<!-- TIBO_REASONING_BACKGROUND_V1 -->
<link rel="stylesheet" href="./tibo-slider/tibo-background.css" />
<script defer src="./tibo-slider/tibo-background.js"></script>
```

The runtime's only state source is:

```css
[data-codex-intelligence-trigger][data-selected-reasoning-effort]
```

A `MutationObserver` reads that element's
`data-selected-reasoning-effort`. Both the main slider and Advanced menu reach
the same native final state. UI language, model names, hashed CSS classes, and
chat content are ignored.

Two fixed, click-through layers use `cover`, centered positioning, and a 560ms
crossfade. Light and dark themes get separate readability treatment, while
`prefers-reduced-motion` disables the transition. A failed image or injection
leaves the original app usable with a solid fallback.

## Platform support

The patch builder, archive inspector, compatibility checks, and transactional
backup/restore core run on Windows, macOS, and Linux. Actual installability
depends on how that platform's Codex Desktop package is signed:

| Platform/package | Status |
|---|---|
| Linux package at `/usr/lib/chatgpt/resources/app.asar` | Built, installed, restored, and visually verified on a real client |
| Windows unpackaged Electron install | Legacy ASAR installer removed; the CDP launcher requires the official MSIX client |
| Microsoft Store/MSIX under `WindowsApps` | CDP preview: runtime injection verified on 26.911.7940.0; ASAR replacement is refused |
| macOS confirmed unsigned app bundle | Experimental: builder and transaction core available; real-client installation and recovery remain unverified |
| macOS signed app bundle, including ad-hoc | Refused: no signature removal, bypass, or re-signing |
| macOS damaged signature or unknown signature state | Refused; failed verification does not prove an unsigned bundle |

The project will not bypass OS package signatures, take ownership of
`WindowsApps`, or re-sign an official application. A refused signed package is
a safety boundary, not an installation error to work around.

## Requirements

- Node.js 22.12 or newer
- npm
- A locally installed Codex Desktop containing an unpacked Electron
  `resources/app.asar`
- Linux/macOS: Bash; Linux system installs additionally use `sudo`
- Windows: PowerShell 5.1 or newer

No official `app.asar`, patched archive, extracted official frontend, account
data, tokens, logs, or conversations are distributed. `dist/`,
`node_modules/`, and every `*.asar*` file are ignored.

## Quick start

Windows users: follow the [CDP setup](docs/windows-cdp.md). The ASAR steps below are for Linux/macOS.

Clone the repository and verify it before installing anything:

Copy the HTTPS URL from this repository's **Code** menu, then run:

```bash
git clone <REPOSITORY_HTTPS_URL>
cd tibolution
npm ci
npm test
npm run inspect
```

Replace `<REPOSITORY_HTTPS_URL>` with that copied URL. Review the inspector
output, completely exit Codex Desktop, then use the platform command:

```bash
# Linux, or an eligible confirmed unsigned macOS bundle
bash scripts/install.sh
```

Linux users can then enable update-time self-repair for application-menu
launches:

```bash
bash scripts/install-linux-launcher.sh
```

Do not try to work around a WindowsApps/MSIX refusal or a valid macOS code
signature refusal. Those package types are intentionally unsupported because
in-place modification would violate operating-system package integrity.

## Inspect, test, and build

First close Codex Desktop completely, then install dependencies and inspect the
actual local archive:

```bash
npm ci
npm test
npm run inspect
```

When auto-discovery is ambiguous or the client is installed elsewhere, pass an
exact path:

```bash
node scripts/inspect-asar.mjs --target /exact/path/to/app.asar
```

PowerShell uses the same command with a Windows path:

```powershell
node .\scripts\inspect-asar.mjs --target 'C:\exact\path\resources\app.asar'
```

`npm run build` auto-discovers a supported installation. You can also build
from one exact archive without modifying it:

```bash
node scripts/build-patched-asar.mjs /exact/path/to/app.asar
```

The patched archive is generated only in the local `dist/` directory. The
builder verifies package identity, `webview/index.html`, the native effort
attribute, local-file CSP, all six PNGs, source immutability, required patched
members, every official `webview/assets/*.js` hash, every original ASAR entry's
type and metadata, and the complete `app.asar.unpacked` companion manifest. A
failed check publishes nothing and never replaces the installed client.

The builder also refuses a source archive that already contains Tibolution.
After an app update, always build from the newly installed official archive,
never from an old patched copy.

## Install (Linux/macOS ASAR backend)

Codex Desktop must be fully closed. The installer checks this before building
and again immediately before replacement.

Linux or an eligible macOS bundle:

```bash
bash scripts/install.sh
```

Windows: use the [CDP launcher](docs/windows-cdp.md). The legacy ASAR install entry has been removed.

Use an exact non-default archive when needed:

```bash
bash scripts/install.sh --target /exact/path/to/app.asar
```

The installer builds in the user's project directory, verifies that the source
hash is unchanged, creates an exact backup, writes a unique same-directory
temporary file, and atomically renames it. Backups are named:

```text
app.asar.tibo-backup.<original-sha256>.asar
```

Linux system archives must remain `root:root` with mode `0644`; only the final
transaction invokes `sudo`.

### Linux startup self-check

Linux package updates can replace the active `app.asar`. Tibolution can install
a per-user `chatgpt.desktop` override that checks the archive before every
application-menu launch:

```bash
bash scripts/install-linux-launcher.sh
```

This command does not modify `app.asar` and may be run while Desktop is open.
It stores a launcher and its generated absolute-path configuration under
`~/.local/share/tibolution/`, while the repository remains the source for the
builder and transaction code.

At launch, the wrapper takes a non-blocking per-user lock and checks the real
Desktop process first. If Desktop is already running, it forwards the launch
directly to `/usr/lib/chatgpt/ChatGPT`. Otherwise it reads only the ASAR package
identity, `webview/index.html` marker, and required Tibolution member paths.

When an update has cleanly removed both the marker and payload, the wrapper:

1. builds a new patched archive in the repository's ignored `dist/` directory;
2. runs all normal package, CSP, effort-attribute, bundle-hash, unpacked-file,
   and source-immutability checks;
3. asks Polkit to authorize only the existing transactional install command;
4. confirms the marker after installation, then starts Desktop.

The first menu launch after a compatible update can therefore show one Polkit
password dialog. Authorization is never silent. A cancelled authorization,
failed compatibility check, malformed/partial prior patch, or build error does
not replace the installed archive and does not prevent the official client
from starting.

The installer preserves any existing user `chatgpt.desktop` byte-for-byte with
an exact SHA-256 record. Remove the startup self-check and restore that prior
state with:

```bash
bash scripts/uninstall-linux-launcher.sh
```

The uninstaller refuses to overwrite a desktop entry that the user changed
after Tibolution installed its override. This startup integration is Linux
only; it is separate from the cross-platform archive builder. It does not
inspect or invoke the isolated command-line project.

The launch decision is intentionally fail-open for the application and
fail-closed for file modification:

```text
Application-menu launch
  -> Desktop already running? -> forward to the official executable
  -> complete Tibolution marker present? -> start the official executable
  -> clean official archive after update? -> build and run compatibility checks
  -> checks pass? -> request Polkit authorization -> transactional install
  -> any failure or cancelled authorization -> change nothing -> start official client
```

## Restore

Close Codex Desktop and use the exact original SHA-256 printed by the installer:

```bash
bash scripts/restore.sh <original-sha256>
```

```powershell
& .\scripts\restore.ps1 -OriginalSha256 '<original-sha256>'
```

For a custom path, append `--target /exact/path/to/app.asar` on Bash or use
`-Target` in PowerShell. Restore accepts only the exact hash-named backup and
requires the current archive to equal the recorded patched SHA-256. An app
update or unknown current archive is never overwritten.

Restoring the ASAR and removing the Linux startup self-check are separate
operations. To return fully to the original Linux setup, close Desktop, restore
the exact original SHA, then remove the user-level launcher:

```bash
bash scripts/restore.sh <original-sha256>
bash scripts/uninstall-linux-launcher.sh
```

## Test coverage

The current suite contains 50 tests. It covers:

- all six effort-to-image mappings;
- arbitrary unknown models sharing the same effort background;
- main-slider and Advanced-menu state changes;
- chat-text and localized-label isolation;
- unsupported effort levels never being created;
- image-load failure and reduced-motion behavior;
- CSP and native-state compatibility rejection;
- official React JavaScript hashes remaining unchanged;
- official ASAR entry metadata and `app.asar.unpacked` preservation;
- running-client refusal, exact backup, atomic install, and exact restore;
- Windows and macOS path/transaction simulations and signed-package refusals;
- Linux startup self-check success, failure, cancellation, concurrency, and
  desktop-entry restoration;
- release payload exclusion of ASAR files and command-line adapter code.

Run the same checks as GitHub Actions with:

```bash
npm ci
npm test
bash -n scripts/*.sh
npm pack --dry-run --json
```

GitHub Actions runs `npm test` on Ubuntu, macOS, and Windows. A simulated or CI
result is not described as real-device verification.

## Repository contents

```text
assets/       six original background PNGs
src/          injected runtime CSS and JavaScript
scripts/      inspector, builder, installers, transaction core, and restore tools
tests/        runtime, archive, platform, policy, and Linux launcher tests
docs/         versioned verification, release notes, and publishing guide
.github/      CI workflow and contribution templates
```

Generated `dist/` output and installed-client files are local artifacts. They
must never be committed or attached to an issue.

## Verified Linux client

Real-client verification completed on 2026-08-26:

```text
Debian package: chatgpt 26.810.41047 (amd64)
Electron package: openai-codex-electron 26.810.41047
Path: /usr/lib/chatgpt/resources/app.asar
Original SHA-256: 75b341a8e19dcf420090a51389bb90688036ca29cfa65847a65932f0aa898278
Installed patched SHA-256: f02578793fcdfc4e8e3f790f1e56c7aaf1551e67ddb4b70ba5c5453a6237c268
```

See [docs/verification-26.810.41047.md](docs/verification-26.810.41047.md)
for the compatibility evidence and desktop interaction checks. Ordinary app
restarts preserve an installed patch because its payload is inside the active
`app.asar`; app updates may replace it. The optional Linux startup self-check
performs the fresh compatibility check and repair before the next menu launch.
The cross-platform 2.0 audit and real-archive build evidence are recorded in
[docs/verification-2.0.0.md](docs/verification-2.0.0.md).
The Linux startup self-check tests and installed launcher evidence are in
[docs/verification-2.1.0.md](docs/verification-2.1.0.md).

The earlier command-line experiment is isolated in the sibling `cli-project/`
and is not part of Tibolution Desktop builds, tests, installation, or releases.

## Troubleshooting

### `Codex Desktop is running`

Quit every Desktop window and confirm the process has exited. The installer
checks once before building and again immediately before replacement to close
the update race window.

### `native reasoning state attribute was not found`

The installed frontend changed and is not currently compatible. Do not bypass
the check or reuse an older patched ASAR. Open an issue with the Codex Desktop
version, operating system, package channel, and the exact non-sensitive error.

### `Unsupported Codex CSP`

The current Content Security Policy no longer permits one or more local
injected files. Tibolution intentionally stops instead of weakening the policy.

### Background missing after an update on Linux

Start Codex from its application-menu entry. If the optional launcher is
installed, it will rebuild against the new archive and request Polkit approval.
Cancelling the dialog starts unmodified Codex and retries on a later menu launch.

### Linux launcher stopped working after moving the repository

Run `bash scripts/install-linux-launcher.sh` from the new repository location.
The generated config records absolute project and Node.js paths.

### Report an issue safely

Never attach `app.asar`, `dist/`, extracted official frontend files, account
data, tokens, conversations, or private logs. See [SECURITY.md](SECURITY.md) and
use the repository's bug-report template.

## Known limitations

- A real-client screenshot shows horizontal dark bands over the wallpaper.
  The exact DOM source has not been confirmed; this candidate does not fix them.

- Codex Desktop updates commonly replace `app.asar`; rebuild from the updated
  original rather than installing an old patched archive. On Linux, the
  optional startup self-check automates that rebuild only for launches through
  the user-level `chatgpt.desktop` entry.
- Launching `/usr/lib/chatgpt/ChatGPT` directly bypasses the Linux wrapper.
  Desktop-driven immediate restarts after an update can also bypass it until
  the next application-menu launch.
- The Linux startup entry stores the repository's absolute path. Moving or
  deleting the repository disables automatic rebuilding until the launcher is
  installed again; the official executable remains the fallback.
- Frontend layout, the native effort attribute, or CSP may change. Compatibility
  checks intentionally stop instead of guessing.
- Signed MSIX and signed macOS bundles cannot be safely patched in place by this
  approach.
- Windows and macOS code paths have automated coverage but still need published
  real-device verification against a compatible unsigned/unpackaged release.
- The images are 1586x992 (16:10) and are center-cropped on other aspect ratios.

## License

Code and supplied images are released under the [MIT License](LICENSE). Codex,
OpenAI, and related marks belong to their respective owners. This project is
not affiliated with or endorsed by OpenAI.
