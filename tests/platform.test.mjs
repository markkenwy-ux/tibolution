import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  candidateAsarPaths,
  desktopProcessFound,
  protectedPlatformReason,
} from "../scripts/platform.mjs";

test("Linux discovery includes the verified system package location", () => {
  assert.ok(candidateAsarPaths("linux").includes("/usr/lib/chatgpt/resources/app.asar"));
});

test("macOS discovery covers system and per-user Codex app bundles", () => {
  const candidates = candidateAsarPaths("darwin", {}, "/Users/example");
  assert.ok(candidates.includes("/Applications/Codex.app/Contents/Resources/app.asar"));
  assert.ok(candidates.includes("/Users/example/Applications/Codex.app/Contents/Resources/app.asar"));
});

test("Windows discovery uses explicit unpackaged install roots without scanning WindowsApps", () => {
  const candidates = candidateAsarPaths("win32", {
    LOCALAPPDATA: "C:\\Users\\example\\AppData\\Local",
    ProgramFiles: "C:\\Program Files",
    "ProgramFiles(x86)": "C:\\Program Files (x86)",
  });
  assert.ok(candidates.includes(path.win32.join(
    "C:\\Users\\example\\AppData\\Local",
    "Programs",
    "Codex",
    "resources",
    "app.asar",
  )));
  assert.equal(candidates.some((candidate) => /WindowsApps/iu.test(candidate)), false);
});

test("signed and managed platform packages are rejected before modification", () => {
  assert.match(
    protectedPlatformReason(
      "/Applications/Codex.app/Contents/Resources/app.asar",
      "darwin",
      { codesignResult: { status: 0 } },
    ),
    /code signature/iu,
  );
  assert.match(
    protectedPlatformReason(
      "C:\\Program Files\\WindowsApps\\OpenAI.Codex_1.0\\resources\\app.asar",
      "win32",
    ),
    /WindowsApps/iu,
  );
  assert.equal(
    protectedPlatformReason(
      "C:\\Users\\example\\AppData\\Local\\Programs\\Codex\\resources\\app.asar",
      "win32",
    ),
    null,
  );
});

test("Desktop process detection does not confuse the command-line codex process", () => {
  assert.equal(desktopProcessFound("linux", "codex /home/example/.local/bin/codex\n"), false);
  assert.equal(desktopProcessFound("linux", "ChatGPT /usr/lib/chatgpt/ChatGPT\n"), true);
  assert.equal(desktopProcessFound("darwin", "/Applications/Codex.app/Contents/MacOS/Codex"), true);
  assert.equal(desktopProcessFound("win32", '"Codex.exe","812","Console"'), true);
  assert.equal(desktopProcessFound("win32", '"codex-cli.exe","812","Console"'), false);
  assert.equal(desktopProcessFound("win32", JSON.stringify({
    ProcessName: "Codex",
    Path: "C:\\Users\\example\\AppData\\Local\\Programs\\Codex\\Codex.exe",
  })), true);
  assert.equal(desktopProcessFound("win32", JSON.stringify({
    ProcessName: "Codex",
    Path: "C:\\Users\\example\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\codex.exe",
  })), false);
});

test("Windows blocks running Desktop in system, custom, and unknown locations", () => {
  for (const executable of ["C:\\Program Files\\Codex\\Codex.exe", "D:\\Apps\\Codex\\Codex.exe", "", "C:\\Users\\测试 用户\\Codex\\Codex.exe"]) {
    assert.equal(desktopProcessFound("win32", JSON.stringify({ ProcessName: "Codex", Path: executable })), true, executable);
  }
});

test("macOS only permits positively identified unsigned bundles", () => {
  const target = "/Applications/Codex.app/Contents/Resources/app.asar";
  const unsigned = { status: 1, stderr: `${target}: code object is not signed at all\n` };
  assert.equal(protectedPlatformReason(target, "darwin", {
    codesignResult: unsigned, codesignDisplayResult: unsigned,
  }), null);
  for (const [verify, display] of [
    [{ status: 0 }, { status: 0, stderr: "Signature=adhoc" }],
    [{ status: 1, stderr: "invalid signature" }, { status: 0, stderr: "Authority=Developer ID" }],
    [{ status: 1, stderr: "invalid signature" }, unsigned],
    [unsigned, { status: 1, stderr: "permission denied" }],
    [{ status: null, error: { code: "EACCES" } }, unsigned],
    [unsigned, { status: null, error: { code: "ENOENT" } }],
  ]) {
    assert.ok(protectedPlatformReason(target, "darwin", { codesignResult: verify, codesignDisplayResult: display }));
  }
});
