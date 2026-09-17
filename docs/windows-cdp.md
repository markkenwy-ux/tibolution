# Windows CDP 实验后端

2026-09-17：修订 2.2.0-cdp.2 已在 Windows 官方客户端 26.911.7940.0 完成
CDP 注入、六图合成预览、移除、重复注入和恢复原生 medium 档位验证。
验证会等待原生控件连续稳定出现，避免页面切换时控件短暂卸载导致误报。

定位已安装的官方 OpenAI.Codex MSIX，带本机调试参数启动应用，再注入
Tibolution CSS、六张图片和背景脚本。不修改 MSIX、ASAR、可执行文件、配置、
登录信息或原生推理设置。无需迁移安装目录。原有 ASAR 路线独立保留。

## 启动

要求：Windows、初始化并登录过的官方 Codex、Node >=22.12。
CDP 路线使用 Node 内置 fetch/WebSocket，无新增运行依赖。
首次先保存工作、完全退出 Codex，再从单独的 PowerShell 运行：

```powershell
& .\scripts\start-windows-cdp.ps1 -Watch
# 显式要求正常关闭已有客户端后重启（可能中断当前代理任务）：
& .\scripts\start-windows-cdp.ps1 -RestartExisting -Watch
# 也可用 -NodePath 指定 node.exe 的完整路径。
```

启动器不强制杀进程。正常关闭失败时请从客户端菜单退出后重试。
每次 CDP 连接校验监听地址及其进程是否属于已注册客户端，并解析目录 Junction。
只接受本机回环监听及主界面 app://-/index.html。多个主窗口时，使用 runner
的 --target 明确指定目标 ID。默认端口 9335，可用 --port/-Port 修改。

```powershell
node scripts/cdp/runner.mjs apply --port 9335
node scripts/cdp/runner.mjs status --port 9335
node scripts/cdp/runner.mjs watch --port 9335
node scripts/cdp/runner.mjs remove --port 9335
```

watch 周期检查页面运行时，仅在运行时缺失时重新注入；推理档位变化由页面内
MutationObserver 处理。连续五次连接失败后停止，不反复重启应用。
应用退出或更新后请重新通过启动器启动；此版本不安装开机启动任务。

## 恢复

运行 scripts/stop-windows-cdp.ps1。先通知 watch 停止，再断开观察器、取消
动画帧、废弃未完成的图片请求结果、移除自有 DOM/CSS、恢复原有自有属性。
关闭注入器不会关闭客户端的调试端口；彻底停用需退出 Codex 后正常启动。

锁和日志位于 %LOCALAPPDATA%\Tibolution\cdp。异常崩溃留下 .lock 时，
确认记录的进程确实退出后再手动删除该锁。不会根据陈旧 PID 杀进程。

## 验证

npm test 包含运行时清理和端点/目标筛选测试。在实机上显式执行：

```powershell
node scripts/cdp/verify-live.mjs 9335 work/live-verification
```

此测试预览六张图，不改变原生推理设置；验证移除、重复注入，最终恢复跟随
原生档位。结果写入 JSON 和截图。合成预览不等同于原生滑块点击验证。
截图可能包含当前对话，请在分享前检查。明暗主题、原生档位操作、刷新恢复
需要分别进行实机验收。

CDP 是具有页面控制能力的未认证本机接口；回环绑定不阻止其他本机软件访问。
不开放网络监听、不关闭 CSP、不改 Electron fuse、不接管或重新签名安装包。
缺少原生档位属性、图片被阻止、调试不可用时明确报告不兼容。
使用 CDP 前，应先恢复已有 ASAR 补丁，避免两种注入方式冲突。

## 参考

代码为本次独立实现，参考这些项目的公开 CDP 架构，未复制主题图片或运行时：

- https://github.com/Finderchangchang/codex-autoskin/blob/master/scripts/start-dream-skin.ps1
- https://github.com/Finderchangchang/codex-autoskin/blob/master/scripts/injector.mjs
- https://github.com/than0112/codex-theme-engine/blob/main/src/engine/injector.ts
