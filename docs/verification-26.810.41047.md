# Verification: Codex Desktop 26.810.41047

Date: 2026-08-26

## Installed client

~~~text
Debian package: chatgpt 26.810.41047 amd64
Executable: /usr/lib/chatgpt/ChatGPT
Archive: /usr/lib/chatgpt/resources/app.asar
Archive owner/mode: root:root 0644
Original archive size: 280620042 bytes
Original SHA-256: 75b341a8e19dcf420090a51389bb90688036ca29cfa65847a65932f0aa898278
Electron package name: openai-codex-electron
Electron package version: 26.810.41047
~~~

## Compatibility evidence

- webview/index.html exists.
- CSP allows local self scripts, styles, and images.
- data-selected-reasoning-effort exists in
  webview/assets/app-initial-iMhn6nFd.js.
- The current bundle contains two native data-codex-intelligence-trigger
  render sites with the selected effort attribute.
- State bundle SHA-256 before and after patch construction:
  bd163ea0067d27510468f7629fa709e2d42ef69b6bf99b73f5d350661cc7fdef.

## Automated tests

~~~text
Tests: 29
Passed: 29
Failed: 0
~~~

Covered behavior includes all six mappings, two unknown models, main and
advanced trigger mutation, chat-text isolation, unsupported-level
non-creation, image failure, CSP rejection, compatible and incompatible asar
builds, running-client install refusal, exact backup creation, and exact
restore.

## Real archive build

~~~text
Patched output: dist/app.tibo-patched.asar
Patched size: 305372357 bytes
Patched SHA-256: f02578793fcdfc4e8e3f790f1e56c7aaf1551e67ddb4b70ba5c5453a6237c268
Official webview JS files compared: 6576
Bundle manifest comparison: identical
Injected payload: tibo-background.js, tibo-background.css, six PNG files
System app.asar after build: unchanged
~~~

## Installed archive

The guarded installer was first run while Codex Desktop was open and correctly
refused with exit code 10 before requesting privilege. After the client was
fully terminated, the production archive was installed and independently
checked:

~~~text
Installed at: 2026-08-26T22:10:58+08:00
Installed SHA-256: f02578793fcdfc4e8e3f790f1e56c7aaf1551e67ddb4b70ba5c5453a6237c268
Exact backup: /usr/lib/chatgpt/resources/app.asar.tibo-backup.75b341a8e19dcf420090a51389bb90688036ca29cfa65847a65932f0aa898278.asar
Backup SHA-256: 75b341a8e19dcf420090a51389bb90688036ca29cfa65847a65932f0aa898278
Installed owner/mode: root:root 0644
Backup owner/mode: root:root 0644
~~~

The replacement was performed through same-directory temporary files and an
atomic rename. The exact backup was verified before replacement.

## Desktop verification

The installed client was launched with a loopback-only Chromium debugging port
for inspection. The real main page at `app://-/index.html` reached
`readyState=complete`; the app rendered normally and did not white-screen.

- `#tibo-reasoning-background` existed with exactly two image layers and one
  shade layer.
- The native trigger reported `xhigh`; the active layer loaded
  `app://-/tibo-slider/tibo-assets/xhigh.png`.
- Computed styles showed `pointer-events: none`, `background-size: cover`,
  centered positioning, and a 0.56 second opacity transition.
- In the native Advanced menu, selecting High changed the native attribute to
  `high` and activated `high.png`.
- In the native main slider, moving back to the final existing stop changed the
  native attribute to `xhigh` and activated `xhigh.png`.
- The native slider remained `aria-valuemin=0`, `aria-valuemax=4`; the patch
  inserted no additional stops or menu items.
- The light-theme app was visually checked at 1706x987: the full-window image,
  sidebar, composer, and controls rendered and remained usable.
- With `prefers-reduced-motion: reduce` emulated in the real webview, computed
  transition duration for both background layers was `0s`.
- Dark-theme selectors and computed surface overrides were checked in the real
  webview. The installed client was configured for light theme, so a persisted
  native dark-theme visual pass was not performed.

After inspection, the debugging instance was stopped and Codex Desktop was
restarted normally without a remote debugging port.

## Post-verification visual tuning

Version 1.1.1 reduces the light-theme full-window white veil and global white
surface opacity after the installed light-theme screenshot appeared washed
out. All 29 automated tests pass with the new CSS. This visual-only revision
has not yet replaced the installed 1.1.0 archive; perform a fresh real desktop
visual pass after the next guarded rebuild and installation.
