# Tibolution / 滑动变祖器

**Windows CDP 实验后端：**参见 [启动、验证与恢复](docs/windows-cdp.md)。
通过运行时注入适配官方 MSIX 客户端，不修改应用文件。下文的签名包拒绝规则
继续适用于原有 ASAR 补丁路线。实机兼容性以验证报告为准。

> Turn up the reasoning. Evolve the Tibo.

[English](README.md) | [简体中文](README.zh-CN.md) |
[GitHub 发布教程](docs/GITHUB-PUBLISHING.zh-CN.md) |
[v2.2.0-cdp.2 发布说明](docs/releases/v2.2.0-cdp.2.md)

Tibolution 是一个非官方、与模型无关的 Codex Desktop 背景补丁。它读取 Codex
最终选中的原生 reasoning effort，在六张本地图片之间交叉淡入，不修改官方压缩
React bundle，不添加任何档位、控件、标题或说明文字。

预览版本：**2.2.0-cdp.2**。Windows CDP 注入与深色主题透明度已在
26.911.7940.0 客户端验证。原生档位交互、浅色主题仍待实机验收；
具体验证范围见发布说明。原有 ASAR 后端继续保留。

## 它做什么

- 原生 `low`、`medium`、`high`、`xhigh`、`max`、`ultra` 分别对应六张 PNG。
- 所有模型使用同一套映射，不维护 Sol、Terra、Luna、GPT-5.x 等模型白名单。
- Codex 原生不支持的档位不会被创建、伪造或解锁。
- 主 reasoning 滑块与“高级”菜单最终都会更新同一个原生状态，因此都能换背景。
- 使用双全屏背景层，以约 560ms 交叉淡入；图片 `cover`、居中且不拦截点击。
- 支持明暗主题和 `prefers-reduced-motion`，图片失败时保留可用的纯色界面。
- 在用户目录构建 patched ASAR，只在检查全部通过后执行精确备份和原子替换。
- Linux 可选安装启动自检，在软件更新覆盖背景后自动重建并请求 Polkit 授权。

## 背景映射

| 原生档位 | 图片 |
|---|---|
| `low` | `assets/low.png` |
| `medium` | `assets/medium.png` |
| `high` | `assets/high.png` |
| `xhigh` | `assets/xhigh.png` |
| `max` | `assets/max.png` |
| `ultra` | `assets/ultra.png` |

| `low` | `medium` |
|---|---|
| <img src="assets/low.png" alt="low 背景" width="420" /> | <img src="assets/medium.png" alt="medium 背景" width="420" /> |
| `high` | `xhigh` |
| <img src="assets/high.png" alt="high 背景" width="420" /> | <img src="assets/xhigh.png" alt="xhigh 背景" width="420" /> |
| `max` | `ultra` |
| <img src="assets/max.png" alt="max 背景" width="420" /> | <img src="assets/ultra.png" alt="ultra 背景" width="420" /> |

## 实现原理

构建器只在 `webview/index.html` 的 `</head>` 前增加两个本地资源入口：

```html
<!-- TIBO_REASONING_BACKGROUND_V1 -->
<link rel="stylesheet" href="./tibo-slider/tibo-background.css" />
<script defer src="./tibo-slider/tibo-background.js"></script>
```

运行时唯一状态源是：

```css
[data-codex-intelligence-trigger][data-selected-reasoning-effort]
```

`MutationObserver` 只读取这个元素的 `data-selected-reasoning-effort`。它不读取
界面语言、模型名、哈希 CSS 类名或聊天正文，所以对话中出现 `high`、`max`、
`ultra` 不会误触发背景。

补丁文件放在 ASAR 内的 `webview/tibo-slider/`，官方 React JavaScript 保持逐文件
哈希不变。构建器还会校验包名、版本、CSP、原生状态属性、六张图片、ASAR 条目
类型与权限、所有 unpacked 文件，以及构建前后的源文件哈希。

## 平台支持

| 平台/安装方式 | 状态 |
|---|---|
| Linux `/usr/lib/chatgpt/resources/app.asar` | 已在真实客户端完成安装、还原、UI 和启动器验证 |
| Windows 非商店 Electron 安装 | 已移除旧 ASAR 安装入口；CDP 启动器要求官方 MSIX 客户端 |
| Microsoft Store/MSIX `WindowsApps` | CDP 预览：已在 26.911.7940.0 验证运行时注入；仍拒绝替换 ASAR |
| macOS 确认未签名的应用 | 实验性支持：构建与事务核心可用，真实客户端安装与恢复尚未验证 |
| macOS 已签名应用（包括 ad-hoc） | 明确拒绝，不移除、绕过或重新签名 |
| macOS 签名损坏或状态不明 | 明确拒绝；验证失败不等于未签名 |

项目不会接管 `WindowsApps` 权限、关闭系统安全机制、绕过签名或替官方应用重签名。

## 环境要求

- Node.js 22.12 或更新版本；
- npm；
- 本机安装的 Codex Desktop，内部存在 Electron `resources/app.asar`；
- Linux/macOS 使用 Bash，Windows 使用 PowerShell 5.1 或更新版本；
- Linux 系统安装最终替换需要 `sudo`，自动启动修复使用可见的 Polkit 授权。

## 下载与首次检查

Windows 用户请直接按 [CDP 启动说明](docs/windows-cdp.md)操作。以下 ASAR 检查与安装步骤适用于 Linux/macOS。

在仓库页面点击 **Code -> HTTPS** 复制地址，然后执行：

```bash
git clone <REPOSITORY_HTTPS_URL>
cd tibolution
npm ci
npm test
npm run inspect
```

把 `<REPOSITORY_HTTPS_URL>` 换成刚复制的地址。

`npm run inspect` 必须基于当前本机安装结果判断，README 记录的旧版本信息不能代替
实际检查。检查失败时不要安装旧 patched ASAR，也不要删除保护逻辑。

## 安装（Linux/macOS ASAR 后端）

安装补丁前必须完全退出 Codex Desktop。Linux 或符合条件的未签名 macOS 包：

```bash
bash scripts/install.sh
```

Windows 请使用 [CDP 启动方式](docs/windows-cdp.md)，旧 ASAR 安装入口已移除。

非默认安装路径可以显式传入：

```bash
bash scripts/install.sh --target /exact/path/to/app.asar
```

安装器先在项目的 `dist/` 中构建，再核对源 ASAR 没有变化。备份名称为：

```text
app.asar.tibo-backup.<原始 SHA-256>.asar
```

Linux 目标文件必须保持 `root:root 0644`。最终事务使用同目录临时文件和原子替换，
安装后的哈希、所有者和权限会再次验证；中途失败会尝试从精确备份回滚。

## Linux 更新后自动自检

Linux 软件包更新通常会替换 `app.asar`。安装用户级应用菜单入口：

```bash
bash scripts/install-linux-launcher.sh
```

这个命令只安装 `~/.local/share/applications/chatgpt.desktop` 和
`~/.local/share/tibolution/` 下的用户文件，不修改系统 ASAR，因此 Desktop 正在
运行时也可以执行。

之后从应用菜单启动时，流程如下：

```text
Desktop 已运行 -> 直接交给官方程序
补丁标记完整 -> 直接启动
更新后标记和 payload 都干净消失 -> 在用户目录重建并执行全部兼容性检查
检查通过 -> 弹出 Polkit 密码授权 -> 原子安装 -> 再次确认 -> 启动
任何检查失败或用户取消授权 -> 不修改系统文件 -> 仍启动官方客户端
```

它不会静默保存密码，也不是常驻 root 服务。更新后的第一次应用菜单启动可能弹出
一次授权窗口。直接运行 `/usr/lib/chatgpt/ChatGPT` 会绕过自检；移动项目目录后要
在新目录重新运行启动器安装脚本。

移除启动自检：

```bash
bash scripts/uninstall-linux-launcher.sh
```

安装器会精确备份原有的用户 `chatgpt.desktop`。卸载时只有当前文件仍等于记录的
Tibolution 入口才会还原；如果用户后来手动编辑过，脚本会拒绝覆盖。

## 还原原版 ASAR

完全退出 Desktop，使用安装时输出的精确原始 SHA-256：

```bash
bash scripts/restore.sh <original-sha256>
```

```powershell
& .\scripts\restore.ps1 -OriginalSha256 '<original-sha256>'
```

还原只接受同一个 SHA 命名的备份，并要求当前文件等于该备份所对应的 patched
SHA。客户端已更新或当前文件来源未知时会拒绝覆盖。

Linux 要完全回到原始状态，需要分别还原 ASAR 和移除用户启动器：

```bash
bash scripts/restore.sh <original-sha256>
bash scripts/uninstall-linux-launcher.sh
```

## 测试与验证

当前自动测试共 **50 项**，覆盖六档映射、未知模型一致性、主滑块和高级菜单、聊天
文字隔离、不增加 unsupported 档位、图片失败、明暗主题、reduced motion、CSP、
官方 bundle 哈希、ASAR/unpacked 完整性、运行中拒绝、精确备份还原、Windows/macOS
模拟事务、Linux 启动修复、授权取消、并发锁和用户 desktop entry 还原。

```bash
npm ci
npm test
bash -n scripts/*.sh
npm pack --dry-run --json
```

GitHub Actions 会在 Ubuntu、macOS、Windows 上运行测试，但 CI 模拟通过不等于对应
系统已经完成真实客户端验证。详细证据见：

- [真实 Linux 客户端验证](docs/verification-26.810.41047.md)
- [2.0 跨平台构建与事务验证](docs/verification-2.0.0.md)
- [2.1 Linux 启动自检验证](docs/verification-2.1.0.md)

## 常见问题

### 提示 Desktop 正在运行

关闭全部 Desktop 窗口并等待进程完全退出。安装器会在构建前和原子替换前各检查
一次，避免运行中覆盖。

### 提示找不到原生 reasoning state attribute

说明当前前端结构已经改变。不要绕过检查或使用旧 patched ASAR。提交 issue 时只
提供 Desktop 版本、操作系统、安装渠道和不敏感的原始错误信息。

### 提示 CSP 不兼容

当前内容安全策略不允许某类本地资源。Tibolution 不会削弱 CSP，因此会停止安装。

### Linux 更新后没有背景

确认已安装启动自检，然后从系统应用菜单启动。取消 Polkit 对话框不会破坏客户端，
下次应用菜单启动还会再次检查。

### 项目目录移动后启动器失效

在新项目路径重新运行 `bash scripts/install-linux-launcher.sh`。配置使用绝对路径。

## 公开仓库安全规则

GitHub 仓库和 issue 中绝对不能包含：

- 官方、patched 或备份 `app.asar`；
- 完整解包的官方前端；
- `dist/`、`node_modules/`；
- 用户账户数据、令牌、会话、对话或包含隐私的日志。

仓库只发布补丁源码、六张背景图、测试、文档和本机构建脚本。详细发布步骤见
[GitHub 发布教程](docs/GITHUB-PUBLISHING.zh-CN.md)，安全政策见
[SECURITY.md](SECURITY.md)。

## 已知限制

- 实机截图显示背景上存在明显的水平暗色条带；具体 DOM 来源尚未定位，
  当前候选未修复这一问题，不代表完整视觉验收通过。

- Linux 自动修复只覆盖通过用户级 `chatgpt.desktop` 发起的应用菜单启动。
- 客户端更新后由应用自身立即重启时，可能要等下一次菜单启动才会执行自检。
- Windows/macOS 尚缺相应安装渠道的公开实机验证。
- MSIX 和有效签名 macOS 应用不能使用这种原地补丁方式。
- 原生属性、CSP 或 Electron 包结构变化时需要更新兼容性代码。
- 图片为 1586x992（16:10），其他宽高比会以居中 `cover` 方式裁切。

## CLI 隔离

早期命令行实验已经隔离在本项目之外的兄弟目录 `cli-project/`。Tibolution Desktop
的构建、测试、安装、发布和 Linux 启动自检都不会读取或调用它。

## 许可证与声明

代码和六张背景图以 [MIT License](LICENSE) 发布。Codex、OpenAI 及相关商标属于
各自权利人。本项目是非官方社区项目，与 OpenAI 不存在隶属或背书关系。
