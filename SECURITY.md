# Security Policy

请勿在公开 issue 中提交凭据、会话令牌、账户标识、完整客户端包或包含私密内容的日志。

## Reporting a vulnerability

请优先使用 GitHub 仓库 `Security -> Report a vulnerability` 发起私密安全报告。
如果仓库尚未启用私密报告，请不要创建包含漏洞细节或个人数据的公开 issue；只在
公开 issue 中请求维护者提供私密联系方式。

报告应包含 Tibolution 版本、Codex Desktop 版本、操作系统、安装渠道、最小复现
步骤和已脱敏的错误。不要上传官方或 patched ASAR、完整解包前端、令牌、Cookie、
对话、账户数据或无关日志。

Security reports should use GitHub private vulnerability reporting whenever it
is enabled. Do not publish exploit details, credentials, private user data, or
official application archives in a public issue.

## Installation invariants

安装脚本必须满足以下原则：

- 修改前验证精确目标；
- 为原始文件创建 SHA-256 命名备份；
- 不使用宽泛通配符恢复；
- 客户端运行时拒绝安装或还原；
- 兼容性检查失败时保持原文件不变。
- 不接管或修改 WindowsApps/MSIX 管理目录；
- 不破坏 macOS 官方应用的有效代码签名；
- Windows/macOS/Linux 共用同一套归档兼容性与哈希校验核心。
- Linux 启动自检只在 Desktop 尚未运行、补丁标记与目录都干净消失时重建；
- 自动重装必须通过可见的 Polkit 授权，不保存或代填密码；
- 自检、构建、授权或安装后确认失败时，必须保留原文件并继续启动官方客户端；
- 用户已有的 `chatgpt.desktop` 必须以精确 SHA-256 记录备份和恢复，用户修改后拒绝覆盖。

Linux 自检器不以常驻 root 服务运行，也不将整个项目复制到系统目录。它从用户
目录执行既有事务脚本，因此用户只应在确认项目来源和当前工作树内容后接受
Polkit 提权。移动项目目录后应重新安装启动器；不再需要时运行
`bash scripts/uninstall-linux-launcher.sh`。

## Supported release

安全修复以最新发布版本为准。当前文档对应 `2.1.0`；旧版本可能不会单独回移修复。
