# Tibolution GitHub 发布教程

这份教程假设你第一次发布开源项目，目标仓库名为 `tibolution`。命令均在项目根
目录执行。GitHub 上传的是源码仓库，不是本机已经构建的 `dist/` 或系统 ASAR。

## 先理解四个概念

- **Repository（仓库）**：GitHub 上保存源码、提交历史、issue 和 Release 的项目。
- **Commit（提交）**：本地某一批文件的确定快照。
- **Push（推送）**：把本地提交上传到 GitHub 仓库。
- **Release（发行版）**：给某个 Git 标签添加标题、说明和可下载附件。

正常顺序是：检查文件 -> 本地提交 -> 创建远端仓库 -> push -> 创建标签和 Release。

## 1. 注册并保护 GitHub 账号

1. 打开 <https://github.com/signup> 注册账号并验证邮箱。
2. 在 GitHub `Settings -> Password and authentication` 开启双重验证。
3. 在 `Settings -> Emails` 选择是否隐藏邮箱。如果要隐藏，复制 GitHub 给出的
   `...@users.noreply.github.com` 地址，后面把它配置成 Git 提交邮箱。
4. 不要把密码、Personal Access Token、SSH 私钥粘贴到仓库文件或聊天中。

本机已经安装 GitHub CLI `gh`。推荐使用浏览器授权，不需要手工复制 token：

```bash
gh auth login
```

依次选择：

```text
GitHub.com
HTTPS
Login with a web browser
```

终端会显示一次性代码并打开浏览器。只在 GitHub 官方页面输入该代码并确认授权。
授权后检查：

```bash
gh auth status
```

## 2. 配置本仓库的提交身份

先查看当前值：

```bash
git config --get user.name
git config --get user.email
```

如果没有输出，只给 Tibolution 这个仓库配置，不影响其他项目：

```bash
git config user.name "YOUR_GITHUB_NAME"
git config user.email "YOUR_GITHUB_NOREPLY_EMAIL"
```

`YOUR_GITHUB_NOREPLY_EMAIL` 应替换成 GitHub `Settings -> Emails` 页面显示的真实
noreply 地址，不能原样照抄占位符。

## 3. 发布前安全审计

确认位于项目根目录：

```bash
git rev-parse --show-toplevel
```

安装确定版本的依赖并跑完整测试：

```bash
npm ci
npm test
bash -n scripts/*.sh
npm pack --dry-run --json
```

检查被忽略的本机构建目录：

```bash
git status --short --ignored
```

你应该看到 `dist/` 和 `node_modules/` 前面是 `!!`，表示它们不会进入提交。

检查准备提交的文件中没有 ASAR：

```bash
git ls-files --cached --others --exclude-standard | rg '\.asar(?:\.|$)'
```

这个命令应当没有输出，并以状态码 1 结束。`rg` 的状态码 1 在这里表示“没有找到”，
不是故障。

还要人工确认不存在：

- 官方、patched 或备份 ASAR；
- 完整解包的官方前端；
- `.env`、token、私钥和浏览器 Cookie；
- 用户配置、对话、账户信息和隐私日志。

## 4. 创建第一次本地提交

查看将要加入的内容：

```bash
git status --short
```

`.gitignore` 已经排除危险构建产物，因此可以加入全部公开源码：

```bash
git add --all
git diff --cached --stat
git diff --cached --name-only
```

再次确认列表中没有 `dist/`、`node_modules/` 或任何 `*.asar*`，然后提交：

```bash
git commit -m "Release Tibolution 2.1.2"
```

确认提交：

```bash
git log --oneline --decorate -1
git status --short
```

状态应为空，表示所有公开文件都已提交。

## 5A. 用 GitHub CLI 创建并推送仓库（推荐）

下面会创建一个公开仓库、设置 `origin` 并推送 `main`：

```bash
gh repo create tibolution \
  --public \
  --source=. \
  --remote=origin \
  --description "Reasoning-effort backgrounds for Codex Desktop, with guarded cross-platform ASAR patching." \
  --push
```

如果你想先保持私有，把 `--public` 改为 `--private`。后续可在 GitHub 仓库
`Settings -> General -> Danger Zone -> Change repository visibility` 修改公开状态。

检查远端和网页：

```bash
git remote -v
gh repo view --web
```

## 5B. 用 GitHub 网页创建仓库（备选）

如果不用 `gh`：

1. 打开 <https://github.com/new>。
2. Repository name 填 `tibolution`。
3. Description 填上面命令中的英文描述。
4. 选择 Public 或 Private。
5. **不要**勾选 Add a README、`.gitignore` 或 License，因为本地已经存在。
6. 点击 Create repository。

GitHub 会显示仓库地址。使用 HTTPS 地址执行：

```bash
git remote add origin https://github.com/YOUR_GITHUB_NAME/tibolution.git
git branch -M main
git push -u origin main
```

如果提示 `remote origin already exists`，先运行 `git remote -v` 检查。只有确认地址
错误时才修改：

```bash
git remote set-url origin https://github.com/YOUR_GITHUB_NAME/tibolution.git
```

不要把 token 写进 URL。

## 6. 检查 GitHub Actions

推送后打开仓库的 `Actions` 标签。`test` 工作流会分别在 Ubuntu、macOS、Windows
运行 `npm ci` 和 `npm test`。

绿色勾表示 CI 测试通过，但不能把 CI 模拟写成 Windows/macOS 真实客户端验证。
如果第一次出现启用 Actions 的提示，确认启用仓库自带工作流即可。

## 7. 创建 v2.1.2 标签和 GitHub Release

先确保 Actions 通过且本地没有未提交文件：

```bash
git status --short
```

创建带说明的标签并推送：

```bash
git tag -a v2.1.2 -m "Tibolution 2.1.2"
git push origin v2.1.2
```

标签推送会再次触发 Actions。此时不要立即创建 Release；先打开 Actions 页面，
确认 `v2.1.2` 的 Ubuntu、macOS、Windows 任务全部通过。也可以先检查：

```bash
gh run list --workflow test.yml --branch v2.1.2 --limit 1
```

只有标签工作流显示 `completed success` 后，才创建 Release。

使用仓库已经准备好的 Release 文案：

```bash
gh release create v2.1.2 \
  --title "Tibolution 2.1.2" \
  --notes-file docs/releases/v2.1.2.md
```

GitHub 会自动生成 `Source code (zip)` 和 `Source code (tar.gz)`，一般不需要上传本机
源码压缩包，更不能上传 `dist/app.tibo-patched.asar`。

打开 Release 页面检查：

```bash
gh release view v2.1.2 --web
```

## 8. 设置仓库首页信息

在仓库首页右侧 About 区域点击齿轮，建议填写：

- Description：`Reasoning-effort backgrounds for Codex Desktop.`
- Website：可以暂时留空。
- Topics：`codex-desktop`、`electron`、`asar`、`reasoning-effort`、`linux`、
  `windows`、`macos`、`tibolution`。

建议启用 Issues。`SECURITY.md`、Issue 表单和 PR 模板会被 GitHub 自动识别。

## 9. 以后怎么更新

每次修改使用一个分支：

```bash
git switch -c fix/short-description
# 修改文件
npm test
git add --all
git commit -m "Fix short description"
git push -u origin fix/short-description
```

然后执行 `gh pr create --web`，在浏览器填写 Pull Request。自己维护的小项目也可以
直接提交到 `main`，但分支和 PR 更容易检查差异并让 Actions 先验证。

发布新版本时还要同步更新：

- `package.json`、`package-lock.json`、`manifest.json` 中的版本；
- `CHANGELOG.md`；
- `docs/releases/vX.Y.Z.md`；
- README 中的 Current release；
- 对应验证记录和真实/模拟验证表述。

## 10. 常见 GitHub 问题

### `Author identity unknown`

执行本文第 2 步，用真实 GitHub 名称和公开邮箱或 noreply 邮箱配置当前仓库。

### `Authentication failed`

重新执行 `gh auth login`。GitHub 已不支持用账号密码直接进行 HTTPS Git push。

### `Repository not found`

用 `git remote -v` 检查用户名、仓库名和大小写，并确认当前登录账号有权限。

### 不小心暂存了不该公开的文件

在第一次 commit 前可用下面命令只取消暂存，不删除工作区文件：

```bash
git restore --staged PATH_TO_FILE
```

然后把规则加入 `.gitignore`。如果秘密已经 push，不要只删除后再提交；应立即撤销
或轮换凭据，并按 GitHub 的敏感数据清理流程处理提交历史。

### 不要使用的操作

- 不要用 `sudo git` 或 `sudo gh`；
- 不要上传任何 ASAR 或私密日志；
- 不要在不理解影响时使用 `git push --force`；
- 不要为了安装 Tibolution 关闭 Windows/macOS 的签名或包保护。
