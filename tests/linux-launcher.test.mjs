import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("..", import.meta.url));
const launcher = path.join(project, "scripts", "launch-linux.sh");
const installer = path.join(project, "scripts", "install-linux-launcher.sh");
const uninstaller = path.join(project, "scripts", "uninstall-linux-launcher.sh");

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function executable(file, source) {
  await writeFile(file, source, { mode: 0o755 });
  await chmod(file, 0o755);
}

async function launcherFixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tibolution-launcher-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  const dist = path.join(root, "dist");
  const cache = path.join(root, "cache");
  await mkdir(bin);
  await mkdir(dist);
  const log = path.join(root, "calls.log");
  const installedFlag = path.join(root, "installed.flag");
  const target = path.join(root, "app.asar");
  const config = path.join(root, "launcher.conf");
  await writeFile(target, "unchanged target\n");
  if (options.installed) await writeFile(installedFlag, "yes\n");

  const fakeNode = path.join(bin, "node");
  const fakeChat = path.join(bin, "ChatGPT");
  const fakePkexec = path.join(bin, "pkexec");
  const fakeNotify = path.join(bin, "notify-send");
  await executable(fakeNode, `#!/usr/bin/env bash
printf 'node:%s\\n' "$(basename -- "$1")" >>"$TIBO_FAKE_LOG"
case "$(basename -- "$1")" in
  platform.mjs) exit "\${TIBO_FAKE_RUNNING_STATUS:-0}" ;;
  check-installed.mjs) [[ -e "$TIBO_FAKE_INSTALLED_FLAG" ]] && exit 0 || exit "\${TIBO_FAKE_CHECK_STATUS:-20}" ;;
  prepare-install.mjs) sleep "\${TIBO_FAKE_PREPARE_DELAY:-0}"; exit "\${TIBO_FAKE_PREPARE_STATUS:-0}" ;;
  *) exit 0 ;;
esac
`);
  await executable(fakeChat, `#!/usr/bin/env bash
{
  printf 'chat\\n'
  for value in "$@"; do printf 'arg:%s\\n' "$value"; done
} >>"$TIBO_FAKE_LOG"
`);
  await executable(fakePkexec, `#!/usr/bin/env bash
printf 'pkexec\\n' >>"$TIBO_FAKE_LOG"
if [[ "\${TIBO_FAKE_PKEXEC_STATUS:-0}" -eq 0 ]]; then touch "$TIBO_FAKE_INSTALLED_FLAG"; fi
exit "\${TIBO_FAKE_PKEXEC_STATUS:-0}"
`);
  await executable(fakeNotify, `#!/usr/bin/env bash
printf 'notify\\n' >>"$TIBO_FAKE_LOG"
`);

  const rows = {
    TIBO_PROJECT_DIR: project,
    TIBO_NODE_BIN: fakeNode,
    TIBO_CHATGPT_BIN: fakeChat,
    TIBO_TARGET_ASAR: target,
    TIBO_DIST_DIR: dist,
    TIBO_PKEXEC_BIN: fakePkexec,
    TIBO_FLOCK_BIN: "/usr/bin/flock",
    TIBO_NOTIFY_BIN: fakeNotify,
  };
  await writeFile(config, `${Object.entries(rows).map(([key, value]) => `${key}=${shellQuote(value)}`).join("\n")}\n`);
  const env = {
    ...process.env,
    XDG_CACHE_HOME: cache,
    TIBO_LAUNCHER_CONFIG: config,
    TIBO_FAKE_LOG: log,
    TIBO_FAKE_INSTALLED_FLAG: installedFlag,
    TIBO_FAKE_RUNNING_STATUS: String(options.runningStatus ?? 0),
    TIBO_FAKE_CHECK_STATUS: String(options.checkStatus ?? 20),
    TIBO_FAKE_PREPARE_STATUS: String(options.prepareStatus ?? 0),
    TIBO_FAKE_PREPARE_DELAY: String(options.prepareDelay ?? 0),
    TIBO_FAKE_PKEXEC_STATUS: String(options.pkexecStatus ?? 0),
  };
  return { root, log, target, env };
}

function runLauncher(fixture, args = []) {
  return spawnSync("bash", [launcher, ...args], {
    cwd: project,
    env: fixture.env,
    encoding: "utf8",
  });
}

async function callLog(file) {
  return readFile(file, "utf8").catch(() => "");
}

test("Linux launcher starts immediately when Tibolution is still installed", async (t) => {
  const fixture = await launcherFixture(t, { installed: true });
  const result = runLauncher(fixture, ["codex://example", "argument with spaces"]);
  assert.equal(result.status, 0, result.stderr);
  const log = await callLog(fixture.log);
  assert.match(log, /node:platform\.mjs\nnode:check-installed\.mjs\nchat\n/u);
  assert.match(log, /arg:codex:\/\/example\narg:argument with spaces\n/u);
  assert.doesNotMatch(log, /prepare-install|pkexec|notify/u);
});

test("Linux launcher rebuilds and requests Polkit only after a clean patch loss", async (t) => {
  const fixture = await launcherFixture(t);
  const before = await readFile(fixture.target, "utf8");
  const result = runLauncher(fixture);
  assert.equal(result.status, 0, result.stderr);
  const log = await callLog(fixture.log);
  assert.match(log, /node:check-installed\.mjs\nnode:prepare-install\.mjs\npkexec\nnode:check-installed\.mjs\nchat/u);
  assert.equal(await readFile(fixture.target, "utf8"), before);
});

test("Linux launcher skips repair while Desktop is already running", async (t) => {
  const fixture = await launcherFixture(t, { runningStatus: 10 });
  const result = runLauncher(fixture);
  assert.equal(result.status, 0, result.stderr);
  const log = await callLog(fixture.log);
  assert.equal(log, "node:platform.mjs\nchat\n");
});

test("build failure never calls pkexec and still starts the official client", async (t) => {
  const fixture = await launcherFixture(t, { prepareStatus: 1 });
  const before = await readFile(fixture.target, "utf8");
  const result = runLauncher(fixture);
  assert.equal(result.status, 0, result.stderr);
  const log = await callLog(fixture.log);
  assert.match(log, /node:prepare-install\.mjs\nnotify\nchat/u);
  assert.doesNotMatch(log, /pkexec/u);
  assert.equal(await readFile(fixture.target, "utf8"), before);
});

test("cancelled Polkit authorization leaves the target unchanged and starts Codex", async (t) => {
  const fixture = await launcherFixture(t, { pkexecStatus: 126 });
  const before = await readFile(fixture.target, "utf8");
  const result = runLauncher(fixture);
  assert.equal(result.status, 0, result.stderr);
  const log = await callLog(fixture.log);
  assert.match(log, /pkexec\nnotify\nchat/u);
  assert.equal(await readFile(fixture.target, "utf8"), before);
});

test("inconsistent patch state never builds or escalates", async (t) => {
  const fixture = await launcherFixture(t, { checkStatus: 1 });
  const result = runLauncher(fixture);
  assert.equal(result.status, 0, result.stderr);
  const log = await callLog(fixture.log);
  assert.match(log, /node:check-installed\.mjs\nnotify\nchat/u);
  assert.doesNotMatch(log, /prepare-install|pkexec/u);
});

test("concurrent launches allow only the lock owner to repair and start Desktop", async (t) => {
  const fixture = await launcherFixture(t, { prepareDelay: 0.35 });
  const start = () => new Promise((resolve) => {
    const child = spawn("bash", [launcher], { cwd: project, env: fixture.env, stdio: "ignore" });
    child.on("exit", (status) => resolve(status));
  });
  const first = start();
  await new Promise((resolve) => setTimeout(resolve, 40));
  const second = start();
  assert.deepEqual(await Promise.all([first, second]), [0, 0]);
  const log = await callLog(fixture.log);
  assert.equal((log.match(/^pkexec$/gmu) ?? []).length, 1);
  assert.equal((log.match(/^chat$/gmu) ?? []).length, 1);
});

test("launcher installer and uninstaller restore an existing desktop entry byte-for-byte", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tibolution-launcher-install-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataHome = path.join(root, "data");
  const applications = path.join(dataHome, "applications");
  const fakeBin = path.join(root, "ChatGPT");
  const target = path.join(root, "app.asar");
  const systemDesktop = path.join(root, "system-chatgpt.desktop");
  const userDesktop = path.join(applications, "chatgpt.desktop");
  const original = "[Desktop Entry]\nName=Personal ChatGPT\nExec=/custom/chatgpt %U\nType=Application\n";
  await mkdir(applications, { recursive: true });
  await executable(fakeBin, "#!/usr/bin/env bash\nexit 0\n");
  await writeFile(target, "fixture archive\n");
  await writeFile(systemDesktop, "[Desktop Entry]\nName=ChatGPT\nExec=chatgpt %U\nIcon=chatgpt\nType=Application\n");
  await writeFile(userDesktop, original);
  const env = {
    ...process.env,
    HOME: root,
    XDG_DATA_HOME: dataHome,
    TIBO_LAUNCHER_NODE_BIN: process.execPath,
    TIBO_LAUNCHER_CHATGPT_BIN: fakeBin,
    TIBO_LAUNCHER_TARGET_ASAR: target,
    TIBO_LAUNCHER_SYSTEM_DESKTOP: systemDesktop,
  };
  const installed = spawnSync("bash", [installer], { cwd: project, env, encoding: "utf8" });
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(await readFile(userDesktop, "utf8"), /X-Tibolution-Launcher=true/u);
  const repeated = spawnSync("bash", [installer], { cwd: project, env, encoding: "utf8" });
  assert.equal(repeated.status, 0, repeated.stderr);
  const removed = spawnSync("bash", [uninstaller], { cwd: project, env, encoding: "utf8" });
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(await readFile(userDesktop, "utf8"), original);
});

test("launcher uninstaller refuses to overwrite a user-edited desktop entry", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tibolution-launcher-edit-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataHome = path.join(root, "data");
  const applications = path.join(dataHome, "applications");
  const fakeBin = path.join(root, "ChatGPT");
  const target = path.join(root, "app.asar");
  const systemDesktop = path.join(root, "system-chatgpt.desktop");
  const userDesktop = path.join(applications, "chatgpt.desktop");
  await mkdir(applications, { recursive: true });
  await executable(fakeBin, "#!/usr/bin/env bash\nexit 0\n");
  await writeFile(target, "fixture archive\n");
  await writeFile(systemDesktop, "[Desktop Entry]\nName=ChatGPT\nExec=chatgpt %U\nType=Application\n");
  const env = {
    ...process.env,
    HOME: root,
    XDG_DATA_HOME: dataHome,
    TIBO_LAUNCHER_NODE_BIN: process.execPath,
    TIBO_LAUNCHER_CHATGPT_BIN: fakeBin,
    TIBO_LAUNCHER_TARGET_ASAR: target,
    TIBO_LAUNCHER_SYSTEM_DESKTOP: systemDesktop,
  };
  assert.equal(spawnSync("bash", [installer], { cwd: project, env }).status, 0);
  const edited = "[Desktop Entry]\nName=User edit\nExec=/do/not/overwrite\nType=Application\n";
  await writeFile(userDesktop, edited);
  const removed = spawnSync("bash", [uninstaller], { cwd: project, env, encoding: "utf8" });
  assert.notEqual(removed.status, 0);
  assert.equal(await readFile(userDesktop, "utf8"), edited);
});
