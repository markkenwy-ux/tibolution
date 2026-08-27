import { spawnSync } from "node:child_process";
import { lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function candidateAsarPaths(platform = process.platform, environment = process.env, home = os.homedir()) {
  if (platform === "linux") {
    return [
      "/usr/lib/chatgpt/resources/app.asar",
      "/opt/Codex/resources/app.asar",
      "/opt/ChatGPT/resources/app.asar",
    ];
  }
  if (platform === "darwin") {
    return [
      "/Applications/Codex.app/Contents/Resources/app.asar",
      "/Applications/ChatGPT.app/Contents/Resources/app.asar",
      path.posix.join(home, "Applications", "Codex.app", "Contents", "Resources", "app.asar"),
      path.posix.join(home, "Applications", "ChatGPT.app", "Contents", "Resources", "app.asar"),
    ];
  }
  if (platform === "win32") {
    const roots = [
      environment.LOCALAPPDATA && path.win32.join(environment.LOCALAPPDATA, "Programs"),
      environment.ProgramFiles,
      environment["ProgramFiles(x86)"],
    ].filter(Boolean);
    return roots.flatMap((root) => ["Codex", "ChatGPT"].map((name) => path.win32.join(root, name, "resources", "app.asar")));
  }
  return [];
}

async function isRegularNonLink(file) {
  const details = await lstat(file).catch(() => null);
  return Boolean(details?.isFile() && !details.isSymbolicLink());
}

export async function locateInstalledAsar({
  platform = process.platform,
  environment = process.env,
  home = os.homedir(),
  explicitPath,
} = {}) {
  if (explicitPath) {
    const target = path.resolve(explicitPath);
    if (!await isRegularNonLink(target)) throw new Error(`Target app.asar is missing or unsafe: ${target}`);
    return target;
  }
  const matches = [];
  for (const candidate of candidateAsarPaths(platform, environment, home)) {
    if (await isRegularNonLink(candidate)) matches.push(candidate);
  }
  if (matches.length === 0) {
    throw new Error("Codex Desktop app.asar was not found in a supported location. Pass its exact path with --target.");
  }
  if (matches.length > 1) {
    throw new Error(`Multiple Codex Desktop archives were found; pass one exact --target:\n${matches.join("\n")}`);
  }
  return matches[0];
}

export function protectedPlatformReason(target, platform = process.platform, options = {}) {
  const normalized = target.replaceAll("\\", "/").toLowerCase();
  if (platform === "win32" && normalized.includes("/program files/windowsapps/")) {
    return "Microsoft Store WindowsApps packages are signed and access-controlled; Tibolution will not modify them.";
  }
  if (platform === "darwin" && normalized.includes(".app/contents/resources/app.asar")) {
    const marker = ".app/contents/resources/app.asar";
    const bundle = target.slice(0, normalized.indexOf(marker) + 4);
    const result = options.codesignResult ?? spawnSync(
      "codesign",
      ["--verify", "--deep", "--strict", bundle],
      { encoding: "utf8" },
    );
    if (result.status === 0) {
      return "The macOS app bundle has a valid code signature. Replacing app.asar would invalidate it, so Tibolution refused to modify the app.";
    }
    if (result.error?.code === "ENOENT") {
      return "The macOS app signature could not be checked because codesign is unavailable; Tibolution refused to modify the app.";
    }
  }
  return null;
}

export function desktopProcessNames(platform = process.platform) {
  if (platform === "win32") return ["chatgpt.exe", "codex.exe"];
  return ["ChatGPT", "Codex"];
}

export function desktopProcessFound(platform, processList) {
  if (platform === "win32") {
    try {
      const parsed = JSON.parse(processList);
      const records = Array.isArray(parsed) ? parsed : [parsed];
      return records.some((record) => {
        const name = String(record.ProcessName ?? record.Name ?? "").toLowerCase().replace(/\.exe$/u, "");
        const executable = String(record.Path ?? record.ExecutablePath ?? "").replaceAll("/", "\\").toLowerCase();
        if (name === "chatgpt") return true;
        if (name !== "codex") return false;
        if (!executable) return true;
        return executable.includes("\\programs\\codex\\")
          || executable.includes("\\windowsapps\\")
          || executable.endsWith("\\codex.exe") && executable.includes("\\codex desktop\\");
      });
    } catch {
      // Fall through to tasklist CSV parsing on older PowerShell installations.
    }
    const names = new Set(desktopProcessNames(platform));
    return processList.split(/\r?\n/u).some((line) => {
      const match = line.match(/^"([^"]+)"/u);
      return match && names.has(match[1].toLowerCase());
    });
  }
  return processList.split("\n").some((line) => {
    const trimmed = line.trim();
    if (/^(?:ChatGPT|Codex)(?:\s|$)/u.test(trimmed)) return true;
    return platform === "darwin" && /\.app\/Contents\/MacOS\/(?:ChatGPT|Codex)(?:\s|$)/u.test(trimmed);
  });
}

export function isDesktopRunning(platform = process.platform) {
  if (process.env.TIBO_TEST_ALLOW_RUNNING === "1") return false;
  if (process.env.TIBO_TEST_MODE === "1" && process.env.TIBO_TEST_PROCESS_LIST !== undefined) {
    return desktopProcessFound(platform, process.env.TIBO_TEST_PROCESS_LIST);
  }
  if (platform === "win32") {
    const powershell = spawnSync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue | Select-Object ProcessName,Path | ConvertTo-Json -Compress",
    ], { encoding: "utf8", windowsHide: true });
    if (powershell.status === 0 && powershell.stdout.trim()) {
      return desktopProcessFound(platform, powershell.stdout);
    }
    const tasklist = spawnSync("tasklist", ["/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
    if (tasklist.status !== 0) throw new Error("Could not inspect running Windows processes.");
    return desktopProcessFound(platform, tasklist.stdout);
  }
  const result = spawnSync("ps", ["-axo", "comm=,args="], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("Could not inspect running Desktop processes.");
  return desktopProcessFound(platform, result.stdout);
}

async function main() {
  const command = process.argv[2];
  const targetIndex = process.argv.indexOf("--target");
  const explicitPath = targetIndex >= 0 ? process.argv[targetIndex + 1] : undefined;
  if (targetIndex >= 0 && !explicitPath) throw new Error("--target requires an exact app.asar path.");
  if (command === "locate") {
    console.log(await locateInstalledAsar({ explicitPath }));
    return;
  }
  if (command === "running") {
    process.exitCode = isDesktopRunning() ? 10 : 0;
    return;
  }
  throw new Error("Usage: node scripts/platform.mjs <locate|running> [--target <app.asar>]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
