import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractFile, listPackage } from "@electron/asar";
import { sha256File } from "./build-patched-asar.mjs";
import { validateCsp } from "./patch-index.mjs";
import { locateInstalledAsar } from "./platform.mjs";

export async function inspectAsar(target) {
  const members = listPackage(target).map((member) => member.replace(/^[/\\]/u, "").replaceAll("\\", "/"));
  const packageJson = JSON.parse(extractFile(target, "package.json").toString("utf8"));
  const hasIndex = members.includes("webview/index.html");
  const index = hasIndex ? extractFile(target, "webview/index.html").toString("utf8") : "";
  let cspAllowsInjection = false;
  let cspError = null;
  try {
    validateCsp(index);
    cspAllowsInjection = true;
  } catch (error) {
    cspError = error instanceof Error ? error.message : String(error);
  }
  let nativeStateFound = false;
  for (const member of members.filter((name) => name.startsWith("webview/assets/") && name.endsWith(".js"))) {
    if (extractFile(target, member).includes(Buffer.from("data-selected-reasoning-effort"))) {
      nativeStateFound = true;
      break;
    }
  }
  return {
    path: path.resolve(target),
    sha256: await sha256File(target),
    packageName: packageJson.name ?? null,
    version: packageJson.version ?? null,
    webviewIndexExists: hasIndex,
    nativeStateFound,
    cspAllowsInjection,
    cspError,
    alreadyPatched: index.includes("TIBO_REASONING_BACKGROUND_V1"),
  };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const explicitPath = option("--target");
  const target = await locateInstalledAsar({ explicitPath });
  const result = await inspectAsar(target);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Path: ${result.path}`);
  console.log(`SHA-256: ${result.sha256}`);
  console.log(`Package: ${result.packageName ?? "missing"}`);
  console.log(`Version: ${result.version ?? "missing"}`);
  console.log(`webview/index.html: ${result.webviewIndexExists ? "found" : "missing"}`);
  console.log(`Native reasoning state: ${result.nativeStateFound ? "found" : "missing"}`);
  console.log(`Local-file CSP: ${result.cspAllowsInjection ? "compatible" : result.cspError}`);
  console.log(`Tibolution marker: ${result.alreadyPatched ? "present" : "absent"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
