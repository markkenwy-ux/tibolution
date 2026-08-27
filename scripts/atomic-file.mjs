import { spawnSync } from "node:child_process";
import { lstat, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export async function atomicReplace(source, destination) {
  const destinationExists = await lstat(destination).then(() => true, () => false);
  if (process.platform !== "win32" || !destinationExists) {
    await rename(source, destination);
    return;
  }

  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(scriptDirectory, "replace-file.ps1"),
    "-Source",
    source,
    "-Destination",
    destination,
  ], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || result.error?.message || "unknown error";
    throw new Error(`Windows atomic replacement failed: ${detail}`);
  }
}
