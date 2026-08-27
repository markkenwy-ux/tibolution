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
