import { lstat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractFile, listPackage } from "@electron/asar";
import { MARKER } from "./patch-index.mjs";

const requiredPayload = [
  "webview/tibo-slider/tibo-background.css",
  "webview/tibo-slider/tibo-background.js",
  ...["low", "medium", "high", "xhigh", "max", "ultra"]
    .map((effort) => `webview/tibo-slider/tibo-assets/${effort}.png`),
];

function logicalPath(value) {
  return value.replace(/^[/\\]+/u, "").replaceAll("\\", "/");
}

function archiveFile(archive, members, wanted) {
  const member = members.find(({ logical }) => logical === wanted);
  if (!member) throw new Error(`Codex archive is missing ${wanted}.`);
  return extractFile(archive, member.archive, false);
}

export async function installedState(target) {
  const archive = path.resolve(target);
  const details = await lstat(archive).catch(() => null);
  if (!details?.isFile() || details.isSymbolicLink()) {
    throw new Error(`Codex app.asar is missing or unsafe: ${archive}`);
  }

  const members = listPackage(archive).map((archivePath) => ({
    archive: archivePath.replace(/^[/\\]+/u, ""),
    logical: logicalPath(archivePath),
  }));
  const packageJson = JSON.parse(archiveFile(archive, members, "package.json").toString("utf8"));
  if (packageJson.name !== "openai-codex-electron") {
    throw new Error("The installed archive is not openai-codex-electron.");
  }

  const index = archiveFile(archive, members, "webview/index.html").toString("utf8");
  const hasMarker = index.includes(MARKER);
  const payloadPaths = new Set(
    members
      .map(({ logical }) => logical)
      .filter((member) => member === "webview/tibo-slider" || member.startsWith("webview/tibo-slider/")),
  );

  if (!hasMarker && payloadPaths.size === 0) {
    return { installed: false, version: packageJson.version };
  }
  if (!hasMarker) {
    throw new Error("Tibolution payload exists without its HTML marker; refusing automatic repair.");
  }
  if (!index.includes("./tibo-slider/tibo-background.css")
    || !index.includes("./tibo-slider/tibo-background.js")) {
    throw new Error("Tibolution marker exists but its loader references are incomplete.");
  }
  for (const required of requiredPayload) {
    if (!payloadPaths.has(required)) {
      throw new Error(`Tibolution marker exists but the payload is incomplete: ${required}`);
    }
  }
  return { installed: true, version: packageJson.version };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const target = option("--target");
  if (!target) throw new Error("--target is required.");
  const result = await installedState(target);
  console.log(result.installed
    ? `Tibolution is installed for Codex ${result.version}.`
    : `Tibolution is not installed for Codex ${result.version}.`);
  if (!result.installed) process.exitCode = 20;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
