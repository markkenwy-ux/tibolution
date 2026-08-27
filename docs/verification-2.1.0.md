# Verification: Tibolution 2.1.0 Linux startup self-check

Date: 2026-08-27

## Scope

Version 2.1 adds a Linux user-level application-menu launcher. It detects when
a package update cleanly replaces the patched `app.asar`, rebuilds against that
new original with the existing compatibility checks, requests Polkit approval
for the existing transactional installer, and then starts Codex Desktop.

It does not add a root service, edit the system desktop entry, cache a password,
or run any command-line adapter code. Windows and macOS retain the 2.0 archive
builder and safety policy; this startup integration does not claim support on
those platforms.

## Automated checks

```text
Tests: 47
Passed: 47
Failed: 0
```

The launcher-specific tests cover:

- an installed marker starts Desktop without building or invoking Polkit;
- a cleanly absent marker and payload builds, invokes Polkit once, verifies,
  and starts Desktop;
- an already-running Desktop skips the marker and repair path;
- compatibility/build failure never invokes Polkit and still starts Desktop;
- cancelled authorization leaves the target byte-identical and still starts;
- an inconsistent partial patch never builds or escalates;
- concurrent starts admit only one repair and one official launch;
- URL and spaced arguments reach the official executable unchanged;
- installation and removal restore a pre-existing user desktop entry exactly;
- removal refuses to overwrite a desktop entry edited after installation.

The package integration test also runs the read-only marker checker against an
original fixture (not installed, exit 20) and its fully patched output
(installed, exit 0).

## Real-client read-only result

The new marker checker was run against the active client while Desktop was
open. It reported:

```text
Tibolution is installed for Codex 26.810.41047.
```

No build, privilege escalation, or archive replacement occurred. The verified
files remained:

```text
Active app.asar SHA-256: f02578793fcdfc4e8e3f790f1e56c7aaf1551e67ddb4b70ba5c5453a6237c268
Exact original backup: 75b341a8e19dcf420090a51389bb90688036ca29cfa65847a65932f0aa898278
Ownership and mode: root:root 0644
```

Because Desktop was running, real update-time replacement was deliberately not
forced. The user-level launcher was installed at:

```text
$HOME/.local/share/tibolution/launch-linux.sh
$HOME/.local/share/applications/chatgpt.desktop
```

Its recorded desktop-entry SHA-256 matched the installed override. Invoking the
installed launcher exercised the running-client path and returned:

```text
Opening in existing browser session.
```

No Polkit prompt appeared, the build output timestamps were unchanged, and the
active system ASAR retained its patched SHA-256. A future real Codex package
update will provide the first production repair event; any failed compatibility
check will leave that updated official archive untouched.
