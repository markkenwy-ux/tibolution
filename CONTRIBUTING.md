# Contributing

Compatibility fixes, tests, documentation, and carefully scoped visual
improvements are welcome.

欢迎提交兼容性修复、测试、文档和范围明确的视觉改进。

## Workflow

1. Fork 仓库并创建功能分支。
2. 在目标平台执行 `npm ci && npm test`。
3. 不要提交 `dist/`、`node_modules/`、任何官方 `app.asar` 或用户数据。
4. PR 请说明测试过的 Codex Desktop 版本、操作系统、安装渠道、签名状态和回滚结果。

```bash
git switch -c fix/short-description
npm ci
npm test
npm pack --dry-run --json
git add --all
git commit -m "Fix short description"
```

Pull requests should describe the exact behavior change, tests run, relevant
Codex Desktop version, operating system, package channel, signature status, and
rollback result. Keep real-device evidence separate from CI or simulated
platform results.

## Compatibility policy

兼容性修复应继续使用独立注入方式，避免直接修改压缩后的官方 React bundle。
不要把模拟测试描述为 Windows/macOS 实机验证，也不要通过关闭系统安全机制来
修改签名安装包。

The final native reasoning effort must remain the only model-independent state
source. A contribution must not add model allowlists, infer effort from labels
or chat text, or create effort levels that the native model capability does not
expose.

Changes to archive installation or restore behavior must keep exact SHA-256
backups, source rechecks, running-client refusal, narrow temporary paths, atomic
replacement, and failure rollback.

## Prohibited content

Never commit or attach:

- official, patched, backup, or extracted ASAR content;
- `dist/`, `node_modules/`, or a complete official frontend;
- credentials, tokens, cookies, private keys, account identifiers, conversations,
  or private logs;
- files copied from a managed WindowsApps/MSIX package or a signed macOS bundle.

Use the issue and pull-request templates. Security or private-data exposure
should be handled according to [SECURITY.md](SECURITY.md), not pasted into a
public issue.
