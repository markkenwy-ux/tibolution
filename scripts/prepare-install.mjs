import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildPatchedAsar, sha256File } from "./build-patched-asar.mjs";
import { isDesktopRunning, protectedPlatformReason } from "./platform.mjs";

export async function prepareInstall({ target, patched, dist, platform = process.platform }) {
  if (process.env.TIBO_TEST_ALLOW_RUNNING !== "1" && isDesktopRunning(platform)) {
    const error = new Error("Codex Desktop is running. Close it completely before installation.");
    error.exitCode = 10;
    throw error;
  }
  const protectedReason = process.env.TIBO_TEST_MODE === "1" ? null : protectedPlatformReason(target, platform);
  if (protectedReason) throw new Error(protectedReason);
  const currentSha = await sha256File(target);
  const recordedPatched = await readFile(path.join(dist, "patched.sha256"), "utf8")
    .then((value) => value.split(/\r?\n/u)[0])
    .catch(() => null);
  const existingPatchedSha = await sha256File(patched).catch(() => null);
  if (currentSha === recordedPatched && existingPatchedSha === recordedPatched) {
    return { alreadyBuilt: true, patchedSha256: recordedPatched };
  }
  return buildPatchedAsar(target, patched);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const target = option("--target");
  const patched = option("--patched");
  const dist = option("--dist");
  if (!target || !patched || !dist) throw new Error("--target, --patched, and --dist are required.");
  const platform = process.env.TIBO_TEST_MODE === "1" && process.env.TIBO_TEST_PLATFORM
    ? process.env.TIBO_TEST_PLATFORM
    : process.platform;
  const result = await prepareInstall({ target, patched, dist, platform });
  if (result.alreadyBuilt) {
    console.log(`Tibolution is already built and installed: ${result.patchedSha256}`);
    return;
  }
  console.log(`Built: ${result.outputPath}`);
  console.log(`Codex version: ${result.version}`);
  console.log(`Source SHA-256: ${result.sourceSha256}`);
  console.log(`Patched SHA-256: ${result.patchedSha256}`);
  console.log(`Official webview JavaScript: unchanged (${result.officialJavaScriptFiles} files)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}
