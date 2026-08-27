# Verification: Tibolution 2.0.0

Date: 2026-08-27

## Scope

Version 2.0 replaces the Linux-only archive builder with a shared Node.js core
and adds guarded Bash and PowerShell entry points. This audit distinguishes
automated cross-platform coverage from real-device verification.

## Automated tests

```text
Tests: 38
Passed: 38
Failed: 0
```

Coverage includes all six effort mappings, arbitrary model independence, both
native control paths, chat-text isolation, unsupported-level non-creation,
CSP rejection, image failure, official entry preservation, missing
`app.asar.unpacked` rejection, running-client refusal, exact backup and restore,
Windows/macOS transaction simulation, platform path discovery, signature
safety policy, and CLI/Desktop process distinction.

GitHub Actions is configured to run the same suite on `ubuntu-latest`,
`macos-latest`, and `windows-latest`. Local success does not claim those hosted
runs have completed before the repository is pushed.

## Real Linux archive build

The final cross-platform stream builder was run against the exact original
backup for the installed Linux client:

```text
Electron package: openai-codex-electron 26.810.41047
Original SHA-256: 75b341a8e19dcf420090a51389bb90688036ca29cfa65847a65932f0aa898278
Smoke-build SHA-256: 4d387abb10f88a17926d177151f7722d778210a86580b9cdbbd3d5ead0400750
Official webview JavaScript files: 6576, unchanged
Original unpacked entries: 466, preserved
Injected files: JS, CSS, and six PNGs
```

The smoke archive was generated only under ignored `dist/`, inspected, and
removed. It was not installed or added to the repository.

## Installed client safety

Codex Desktop was running during the final installer guard check. Installation
stopped before privilege escalation with exit code 10. The system files
remained:

```text
Active app.asar SHA-256: f02578793fcdfc4e8e3f790f1e56c7aaf1551e67ddb4b70ba5c5453a6237c268
Exact original backup SHA-256: 75b341a8e19dcf420090a51389bb90688036ca29cfa65847a65932f0aa898278
Active and backup ownership/mode: root:root 0644
```

The previously installed runtime patch has already been visually and
interactively verified as described in
[`verification-26.810.41047.md`](verification-26.810.41047.md). Version 2.0
changes build/install tooling, not the injected runtime CSS or JavaScript.

## Platform result

| Platform | Result |
|---|---|
| Linux | Real archive build, guarded install/restore history, and Desktop UI verification |
| Windows unpackaged Electron | Shared builder plus PowerShell install/restore; automated simulation only |
| Windows Store/MSIX | Deliberately refused because the package is signed and managed |
| macOS unsigned/ad-hoc bundle | Shared builder plus transaction core; automated simulation only |
| macOS valid signed bundle | Deliberately refused because replacement invalidates the code signature |

No Windows or macOS real-device result is claimed.
