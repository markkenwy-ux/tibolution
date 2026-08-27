# Changelog

## 2.1.0

- Added an optional Linux application-menu launcher that checks the active
  archive before every Desktop start and repairs a clean update-time patch loss.
- Reused the guarded builder and transaction core; automatic repair never
  installs an old patched archive or runs while Desktop is open.
- Added visible Polkit authorization, non-blocking launch locking, official-app
  fallback, and strict handling for missing, malformed, or partial patch state.
- Added exact backup and restore for an existing per-user `chatgpt.desktop`,
  including refusal to overwrite later user edits.
- Added automated coverage for installed, missing, running, failed-build,
  cancelled-authorization, inconsistent-state, concurrent-launch, and launcher
  install/uninstall paths.
- Added bilingual public documentation, detailed release and GitHub publishing
  guides, issue forms, a pull-request checklist, and CI package-content checks.

## 2.0.0

- Replaced the GNU/Linux-specific builder with one Node.js implementation for
  Windows, macOS, and Linux.
- Added cross-platform inspection, installation transactions, exact restore,
  conservative platform discovery, and PowerShell entry points.
- Refuse signed macOS app bundles and managed WindowsApps/MSIX packages instead
  of invalidating OS package signatures.
- Added Windows/macOS path, process, safety-policy, backup, and restore tests.
- Documented the difference between cross-platform code coverage and real-device
  verification.
- Removed the standalone web preview and synthetic-control screenshot from the
  release payload; the project now presents only the native Desktop patch.

## 1.4.0

- Adopted **Tibolution** as the public project and GitHub repository name.
- Added the tagline: "Turn up the reasoning. Evolve the Tibo."
- Kept the existing `TIBO_*` injection marker, `tibo-slider/` payload path, and
  backup names as compatibility identifiers for already installed patches.

## 1.3.0

- Split the command-line adapter into an independent sibling package and moved
  the Desktop package into its own project directory.
- Removed command-line assets, tests, installation logic, and runtime dependencies from
  the Desktop package.
- Renamed the npm package for the isolated Desktop baseline and made its test
  command Desktop-only.

## 1.1.1

- Reduced the light-theme global white veil so the background keeps its
  contrast instead of looking washed out.
- Kept stronger translucent surfaces only where UI readability needs them.

## 1.1.0

- Removed label and localization fallback parsing; only the native final
  reasoning-effort attribute is observed.
- Added CSP validation, per-file official bundle hash verification, atomic
  user-directory builds, and build metadata.
- Hardened exact backup, install, and restore checks.
- Added compatible/incompatible asar integration tests and running-client
  refusal tests.

## 1.0.0

- Added model-agnostic `low` through `ultra` background mapping.
- Added native slider and advanced-menu state observation.
- Added crossfade transitions, local preview, tests, guarded installer and exact restore flow.
- Added runtime compatibility detection without redistributing the official application archive.
