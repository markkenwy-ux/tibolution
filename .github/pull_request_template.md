## Summary

Describe the behavior changed and why it is needed.

## Verification

- [ ] `npm ci`
- [ ] `npm test`
- [ ] Relevant platform or real-client checks are described accurately.
- [ ] Simulated Windows/macOS results are not presented as real-device verification.

## Safety

- [ ] No official, patched, backup, or extracted ASAR content is included.
- [ ] No account data, tokens, conversations, private logs, or unrelated user files are included.
- [ ] Official React bundles are unchanged unless the pull request explicitly explains and justifies a policy change.
- [ ] The change does not bypass managed WindowsApps/MSIX packages or valid macOS signatures.
- [ ] Install and restore behavior remains exact, guarded, and reversible.
