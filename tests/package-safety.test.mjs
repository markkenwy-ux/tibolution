import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPackage, createPackageWithOptions, extractAll } from "@electron/asar";

const project = fileURLToPath(new URL("..", import.meta.url));
const buildScript = path.join(project, "scripts", "build-patched-asar.mjs");
const checkInstalledScript = path.join(project, "scripts", "check-installed.mjs");
const prepareInstallScript = path.join(project, "scripts", "prepare-install.mjs");
const transactionScript = path.join(project, "scripts", "transaction.mjs");
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const fixtureCsp =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: project,
    encoding: "utf8",
    ...options,
  });
}

async function createFixture(root, { packageName = "openai-codex-electron" } = {}) {
  const app = path.join(root, "fixture-app");
  await mkdir(path.join(app, "webview", "assets"), { recursive: true });
  await writeFile(
    path.join(app, "package.json"),
    JSON.stringify({ name: packageName, version: "99.1.2", main: "main.js" }),
  );
  await writeFile(path.join(app, "main.js"), "console.log('fixture');\n");
  await writeFile(
    path.join(app, "webview", "index.html"),
    `<!doctype html><html><head><script src="./assets/app.js"></script><meta http-equiv="Content-Security-Policy" content="${fixtureCsp}"></head><body><div id="root"></div></body></html>`,
  );
  await writeFile(
    path.join(app, "webview", "assets", "app.js"),
    'const state = "data-selected-reasoning-effort";\n',
  );
  await writeFile(
    path.join(app, "webview", "assets", "other.js"),
    "export const untouched = true;\n",
  );
  const archive = path.join(root, `${packageName}.asar`);
  await createPackage(app, archive);
  return archive;
}

test("builder patches a compatible asar and preserves every official webview JS hash", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tibo-build-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await createFixture(root);
  const sourceBefore = sha256(await readFile(source));
  const output = path.join(root, "dist", "patched.asar");
  const result = run(process.execPath, [buildScript, source, output]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(sha256(await readFile(source)), sourceBefore);
  const originalState = run(process.execPath, [checkInstalledScript, "--target", source]);
  assert.equal(originalState.status, 20, originalState.stderr);
  const patchedState = run(process.execPath, [checkInstalledScript, "--target", output]);
  assert.equal(patchedState.status, 0, patchedState.stderr);

  const extracted = path.join(root, "patched");
  extractAll(output, extracted);
  const injected = await readFile(path.join(extracted, "webview", "index.html"), "utf8");
  assert.match(injected, /TIBO_REASONING_BACKGROUND_V1/u);
  for (const name of ["low", "medium", "high", "xhigh", "max", "ultra"]) {
    assert.equal(
      sha256(await readFile(path.join(extracted, "webview", "tibo-slider", "tibo-assets", `${name}.png`))),
      sha256(await readFile(path.join(project, "assets", `${name}.png`))),
    );
  }
  assert.equal(
    await readFile(path.join(root, "dist", "bundle-before.sha256"), "utf8"),
    await readFile(path.join(root, "dist", "bundle-after.sha256"), "utf8"),
  );
});

test("compatibility failure does not change or replace the source archive", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tibo-incompatible-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await createFixture(root, { packageName: "not-codex" });
  const sourceBefore = sha256(await readFile(source));
  const output = path.join(root, "dist", "patched.asar");
  const result = run(process.execPath, [buildScript, source, output]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not openai-codex-electron/u);
  assert.equal(sha256(await readFile(source)), sourceBefore);
  await assert.rejects(readFile(output));
});

test("builder refuses an archive whose required app.asar.unpacked directory is missing", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tibo-unpacked-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await createFixture(root);
  const app = path.join(root, "fixture-app");
  await writeFile(path.join(app, "native.node"), "native fixture\n");
  await rm(source);
  await createPackageWithOptions(app, source, { unpack: "*.node" });
  await rm(`${source}.unpacked`, { recursive: true, force: true });
  const before = sha256(await readFile(source));
  const output = path.join(root, "dist", "patched.asar");
  const result = run(process.execPath, [buildScript, source, output]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /matching unpacked directory/u);
  assert.equal(sha256(await readFile(source)), before);
  await assert.rejects(readFile(output));
});

test("installer refuses running Desktop processes without changing target bytes", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tibo-running-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, "app.asar");
  const patched = path.join(root, "dist", "patched.asar");
  await writeFile(target, "fixture");
  for (const [platform, processes] of [
    ["linux", "ChatGPT /usr/lib/chatgpt/ChatGPT\n"],
    ["win32", JSON.stringify({ ProcessName: "Codex", Path: "C:\\Program Files\\Codex\\Codex.exe" })],
    ["win32", JSON.stringify({ ProcessName: "Codex", Path: "D:\\Apps\\Codex\\Codex.exe" })],
  ]) {
  const result = run(process.execPath, [
    prepareInstallScript,
    "--target", target,
    "--patched", patched,
    "--dist", path.dirname(patched),
  ], { env: {
    ...process.env,
    TIBO_TEST_MODE: "1",
    TIBO_TEST_ALLOW_RUNNING: "0",
    TIBO_TEST_PLATFORM: platform,
    TIBO_TEST_PROCESS_LIST: processes,
  } });
  assert.equal(result.status, 10);
  assert.match(result.stderr, /is running/u);
  assert.equal(await readFile(target, "utf8"), "fixture");
  }
});

test("test-mode installer creates an exact backup and restore returns exact bytes", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tibo-restore-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await createFixture(root);
  const systemDir = path.join(root, "system");
  const dist = path.join(root, "dist");
  const target = path.join(systemDir, "app.asar");
  await mkdir(systemDir);
  await cp(source, target);
  const originalBytes = await readFile(target);
  const originalSha = sha256(originalBytes);
  const env = {
    ...process.env,
    TIBO_TEST_MODE: "1",
    TIBO_TEST_ALLOW_RUNNING: "1",
    TIBO_TEST_ROOT: root,
    TIBO_TEST_TARGET_ASAR: target,
    TIBO_TEST_DIST_DIR: dist,
  };

  const patched = path.join(dist, "app.tibo-patched.asar");
  const prepared = run(process.execPath, [
    prepareInstallScript,
    "--target", target,
    "--patched", patched,
    "--dist", dist,
  ], { env });
  assert.equal(prepared.status, 0, prepared.stderr);
  const installed = run(process.execPath, [
    transactionScript,
    "install",
    "--target", target,
    "--patched", patched,
    "--dist", dist,
  ], { env });
  assert.equal(installed.status, 0, installed.stderr);
  const backup = `${target}.tibo-backup.${originalSha}.asar`;
  assert.equal(sha256(await readFile(backup)), originalSha);
  const installRecord = JSON.parse(await readFile(`${backup}.json`, "utf8"));
  assert.equal(installRecord.sourceSha256, originalSha);
  assert.equal(installRecord.patchedSha256, sha256(await readFile(target)));
  assert.match(installRecord.unpackedManifestSha256, /^[0-9a-f]{64}$/u);
  assert.notEqual(sha256(await readFile(target)), originalSha);

  await writeFile(path.join(dist, "patched.sha256"), `${"0".repeat(64)}\n`);

  const restored = run(process.execPath, [
    transactionScript,
    "restore",
    "--target", target,
    "--original-sha", originalSha,
    "--dist", dist,
  ], { env });
  assert.equal(restored.status, 0, restored.stderr);
  assert.deepEqual(await readFile(target), originalBytes);
});

test("test-mode installer leaves an incompatible target byte-identical", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tibo-no-overwrite-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await createFixture(root, { packageName: "not-codex" });
  const systemDir = path.join(root, "system");
  const dist = path.join(root, "dist");
  const target = path.join(systemDir, "app.asar");
  await mkdir(systemDir);
  await cp(source, target);
  const originalSha = sha256(await readFile(target));
  const result = run(process.execPath, [
    prepareInstallScript,
    "--target", target,
    "--patched", path.join(dist, "app.tibo-patched.asar"),
    "--dist", dist,
  ], {
    env: {
      ...process.env,
      TIBO_TEST_MODE: "1",
      TIBO_TEST_ALLOW_RUNNING: "1",
      TIBO_TEST_ROOT: root,
      TIBO_TEST_TARGET_ASAR: target,
      TIBO_TEST_DIST_DIR: dist,
    },
  });
  assert.notEqual(result.status, 0);
  assert.equal(sha256(await readFile(target)), originalSha);
});

for (const simulatedPlatform of ["win32", "darwin"]) {
  test(`${simulatedPlatform} transaction creates an exact backup and restores exact bytes`, async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), `tibo-${simulatedPlatform}-transaction-`));
    t.after(() => rm(root, { recursive: true, force: true }));
    const original = path.join(root, "original.asar");
    const patched = path.join(root, "patched.asar");
    const target = path.join(root, "system", "app.asar");
    const dist = path.join(root, "dist");
    await mkdir(path.dirname(target), { recursive: true });
    await mkdir(dist, { recursive: true });
    const originalDirectory = path.join(root, "original-archive");
    const patchedDirectory = path.join(root, "patched-archive");
    await mkdir(originalDirectory);
    await mkdir(patchedDirectory);
    await writeFile(path.join(originalDirectory, "value.txt"), "original fixture bytes\n");
    await writeFile(path.join(patchedDirectory, "value.txt"), "patched fixture bytes\n");
    await createPackage(originalDirectory, original);
    await createPackage(patchedDirectory, patched);
    await copyFile(original, target);
    const originalSha = sha256(await readFile(original));
    const patchedSha = sha256(await readFile(patched));
    await writeFile(path.join(dist, "source.sha256"), `${originalSha}\n`);
    await writeFile(path.join(dist, "patched.sha256"), `${patchedSha}\n`);
    await writeFile(path.join(dist, "unpacked-before.sha256"), "");
    const env = {
      ...process.env,
      TIBO_TEST_MODE: "1",
      TIBO_TEST_ALLOW_RUNNING: "1",
      TIBO_TEST_ROOT: root,
    };

    const installed = run(process.execPath, [
      transactionScript,
      "install",
      "--target", target,
      "--patched", patched,
      "--dist", dist,
    ], { env: { ...env, TIBO_TEST_PLATFORM: simulatedPlatform } });
    assert.equal(installed.status, 0, installed.stderr);
    assert.equal(sha256(await readFile(`${target}.tibo-backup.${originalSha}.asar`)), originalSha);
    assert.equal(
      JSON.parse(await readFile(`${target}.tibo-backup.${originalSha}.asar.json`, "utf8")).patchedSha256,
      patchedSha,
    );
    assert.equal(sha256(await readFile(target)), patchedSha);

    const restored = run(process.execPath, [
      transactionScript,
      "restore",
      "--target", target,
      "--original-sha", originalSha,
      "--dist", dist,
    ], { env: { ...env, TIBO_TEST_PLATFORM: simulatedPlatform } });
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(sha256(await readFile(target)), originalSha);
  });
}
