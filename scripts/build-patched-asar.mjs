import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createPackageFromStreams,
  extractFile,
  getRawHeader,
  listPackage,
  statFile,
} from "@electron/asar";
import { atomicReplace } from "./atomic-file.mjs";
import { MARKER, patchIndexHtml } from "./patch-index.mjs";
import { unpackedManifest } from "./unpacked.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectDirectory = path.resolve(scriptDirectory, "..");
export const effortNames = ["low", "medium", "high", "xhigh", "max", "ultra"];
const nativeStateAttribute = "data-selected-reasoning-effort";

export async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function assertRegularFile(file, label) {
  const details = await lstat(file).catch(() => null);
  if (!details?.isFile() || details.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file and not a symbolic link: ${file}`);
  }
}

function logicalMember(member) {
  return member.replace(/^[/\\]+/u, "").replaceAll("\\", "/");
}

function archiveMembers(archive) {
  return listPackage(archive).map((archivePath) => ({
    archivePath: archivePath.replace(/^[/\\]+/u, ""),
    logicalPath: logicalMember(archivePath),
  }));
}

function archiveBuffer(archive, member) {
  return extractFile(archive, member.archivePath, false);
}

function officialEntryManifest(archive, members) {
  return members.map((member) => {
    const entry = statFile(archive, member.archivePath, false);
    const unpacked = entry.unpacked ? "unpacked" : "packed";
    if ("files" in entry) return `${member.logicalPath}\tD\t${unpacked}`;
    if ("link" in entry) return `${member.logicalPath}\tL\t${unpacked}\t${entry.link}`;
    const executable = entry.executable ? "executable" : "regular";
    if (member.logicalPath === "webview/index.html") {
      return `${member.logicalPath}\tF\t${unpacked}\t${executable}\t<injected>`;
    }
    const integrity = entry.integrity?.hash ?? createHash("sha256")
      .update(archiveBuffer(archive, member)).digest("hex");
    return `${member.logicalPath}\tF\t${unpacked}\t${executable}\t${entry.size}\t${integrity}`;
  });
}

async function javascriptManifest(archive, members) {
  const rows = [];
  const files = members
    .filter(({ logicalPath }) => logicalPath.startsWith("webview/assets/") && logicalPath.endsWith(".js"))
    .sort((left, right) => left.logicalPath.localeCompare(right.logicalPath, "en"));
  for (const member of files) {
    const hash = createHash("sha256").update(archiveBuffer(archive, member)).digest("hex");
    rows.push(`${hash}  ${member.logicalPath.slice("webview/assets/".length)}`);
  }
  return rows;
}

async function validateAssets() {
  const buffers = new Map();
  for (const effort of effortNames) {
    const file = path.join(projectDirectory, "assets", `${effort}.png`);
    const data = await readFile(file);
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!data.subarray(0, 8).equals(signature)
      || data.readUInt32BE(16) !== 1586
      || data.readUInt32BE(20) !== 992) {
      throw new Error(`Expected an unchanged 1586x992 PNG: ${file}`);
    }
    buffers.set(`${effort}.png`, data);
  }
  return buffers;
}

async function atomicWrite(file, data) {
  const temporary = `${file}.tmp.${randomUUID()}`;
  try {
    await writeFile(temporary, data, { mode: 0o644, flag: "wx" });
    await atomicReplace(temporary, file);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function atomicCopy(source, destination) {
  const temporary = `${destination}.tmp.${randomUUID()}`;
  try {
    await copyFile(source, temporary, constants.COPYFILE_EXCL);
    await chmod(temporary, 0o644);
    await atomicReplace(temporary, destination);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

function bufferStream(pathName, data, mode = 0o100644) {
  return {
    type: "file",
    path: pathName,
    unpacked: false,
    stat: { mode, size: data.length },
    streamGenerator: () => Readable.from(data),
  };
}

function originalStreams(archive, members, patchedIndex) {
  const dataStart = 8 + getRawHeader(archive).headerSize;
  const companion = `${archive}.unpacked`;
  return members.map((member) => {
    const entry = statFile(archive, member.archivePath, false);
    if ("files" in entry) {
      return { type: "directory", path: member.archivePath, unpacked: Boolean(entry.unpacked) };
    }
    if ("link" in entry) {
      return {
        type: "link",
        path: member.archivePath,
        unpacked: Boolean(entry.unpacked),
        symlink: entry.link,
        stat: { mode: 0o120777, size: 0 },
        streamGenerator: () => Readable.from(Buffer.alloc(0)),
      };
    }
    if (member.logicalPath === "webview/index.html") {
      return bufferStream(member.archivePath, Buffer.from(patchedIndex), entry.executable ? 0o100755 : 0o100644);
    }
    const streamGenerator = entry.unpacked
      ? () => createReadStream(path.join(companion, ...member.logicalPath.split("/")))
      : entry.size === 0
        ? () => Readable.from(Buffer.alloc(0))
        : () => {
          const start = dataStart + Number(entry.offset);
          return createReadStream(archive, { start, end: start + entry.size - 1 });
        };
    return {
      type: "file",
      path: member.archivePath,
      unpacked: Boolean(entry.unpacked),
      stat: { mode: entry.executable ? 0o100755 : 0o100644, size: entry.size },
      streamGenerator,
    };
  });
}

async function injectedStreams(assetBuffers) {
  const css = await readFile(path.join(projectDirectory, "src", "tibo-background.css"));
  const javascript = await readFile(path.join(projectDirectory, "src", "tibo-background.js"));
  const tibo = path.join("webview", "tibo-slider");
  const assets = path.join(tibo, "tibo-assets");
  return [
    { type: "directory", path: tibo, unpacked: false },
    { type: "directory", path: assets, unpacked: false },
    bufferStream(path.join(tibo, "tibo-background.css"), css),
    bufferStream(path.join(tibo, "tibo-background.js"), javascript),
    ...effortNames.map((effort) => bufferStream(
      path.join(assets, `${effort}.png`),
      assetBuffers.get(`${effort}.png`),
    )),
  ];
}

export async function buildPatchedAsar(sourceAsar, outputAsar) {
  const source = path.resolve(sourceAsar);
  const output = path.resolve(outputAsar);
  await assertRegularFile(source, "Codex app.asar");
  const unpackedBefore = await unpackedManifest(source);
  const assetBuffers = await validateAssets();
  await mkdir(path.dirname(output), { recursive: true });
  const sourceReal = await realpath(source);
  const outputParentReal = await realpath(path.dirname(output));
  const outputReal = path.join(outputParentReal, path.basename(output));
  if (sourceReal === outputReal) throw new Error("Output archive must not overwrite the source archive.");

  const sourceShaBefore = await sha256File(source);
  const members = archiveMembers(source);
  const packageMember = members.find(({ logicalPath }) => logicalPath === "package.json");
  const indexMember = members.find(({ logicalPath }) => logicalPath === "webview/index.html");
  const hasAssetDirectory = members.some(({ logicalPath }) => logicalPath === "webview/assets");
  if (!packageMember) throw new Error("Unsupported Codex layout: package.json is missing.");
  if (!indexMember || !hasAssetDirectory) {
    throw new Error("Unsupported Codex layout: webview/index.html or webview/assets is missing.");
  }

  const packageJson = JSON.parse(archiveBuffer(source, packageMember).toString("utf8"));
  if (packageJson.name !== "openai-codex-electron") {
    throw new Error("The source archive is not openai-codex-electron.");
  }
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("Unsupported Codex package: version is missing.");
  }

  const originalIndex = archiveBuffer(source, indexMember).toString("utf8");
  if (originalIndex.includes(MARKER)) {
    throw new Error("The source archive is already patched; refusing to use it as a new original.");
  }
  const patchedIndex = patchIndexHtml(originalIndex).html;
  if (members.some(({ logicalPath }) => logicalPath === "webview/tibo-slider"
    || logicalPath.startsWith("webview/tibo-slider/"))) {
    throw new Error("Unsupported source: the Tibolution payload path already exists without its marker.");
  }
  const stateFiles = members.filter((member) =>
    member.logicalPath.startsWith("webview/assets/")
    && member.logicalPath.endsWith(".js")
    && archiveBuffer(source, member).includes(Buffer.from(nativeStateAttribute)));
  if (stateFiles.length === 0) {
    throw new Error("Unsupported Codex UI: native reasoning state attribute was not found.");
  }
  const beforeManifest = await javascriptManifest(source, members);
  const officialEntriesBefore = officialEntryManifest(source, members);

  const buildDirectory = await mkdtemp(path.join(outputParentReal, ".tibo-build-"));
  const packedAsar = path.join(buildDirectory, "app.tibo-patched.asar");
  const previousWorkingDirectory = process.cwd();
  try {
    process.chdir(buildDirectory);
    await createPackageFromStreams(packedAsar, [
      ...originalStreams(source, members, patchedIndex),
      ...await injectedStreams(assetBuffers),
    ]);
    process.chdir(previousWorkingDirectory);

    const unpackedPacked = await unpackedManifest(packedAsar);
    const unpackedSourceAfter = await unpackedManifest(source);
    if (JSON.stringify(unpackedSourceAfter) !== JSON.stringify(unpackedBefore)) {
      throw new Error("Source app.asar.unpacked changed during the build; output was not published.");
    }
    if (JSON.stringify(unpackedPacked) !== JSON.stringify(unpackedBefore)) {
      throw new Error("Patched archive did not preserve app.asar.unpacked metadata and bytes.");
    }

    const verifiedMembers = archiveMembers(packedAsar);
    const verifiedPaths = new Set(verifiedMembers.map(({ logicalPath }) => logicalPath));
    const verifiedByPath = new Map(verifiedMembers.map((member) => [member.logicalPath, member]));
    const officialVerifiedMembers = members.map(({ logicalPath }) => verifiedByPath.get(logicalPath));
    if (officialVerifiedMembers.some((member) => !member)
      || JSON.stringify(officialEntryManifest(packedAsar, officialVerifiedMembers))
        !== JSON.stringify(officialEntriesBefore)) {
      throw new Error("Official archive entries or metadata changed during patch construction.");
    }
    const required = [
      "webview/tibo-slider/tibo-background.js",
      "webview/tibo-slider/tibo-background.css",
      ...effortNames.map((effort) => `webview/tibo-slider/tibo-assets/${effort}.png`),
    ];
    for (const requiredPath of required) {
      if (!verifiedPaths.has(requiredPath)) throw new Error(`Patched archive is missing: ${requiredPath}`);
    }
    const verifiedIndexMember = verifiedMembers.find(({ logicalPath }) => logicalPath === "webview/index.html");
    if (!archiveBuffer(packedAsar, verifiedIndexMember).includes(Buffer.from(MARKER))) {
      throw new Error("Patched archive does not contain the HTML injection marker.");
    }
    const verifiedPackageMember = verifiedMembers.find(({ logicalPath }) => logicalPath === "package.json");
    const verifiedPackage = JSON.parse(archiveBuffer(packedAsar, verifiedPackageMember).toString("utf8"));
    if (verifiedPackage.name !== packageJson.name || verifiedPackage.version !== packageJson.version) {
      throw new Error("Package identity changed while rebuilding the archive.");
    }
    const afterManifest = await javascriptManifest(packedAsar, verifiedMembers);
    if (JSON.stringify(afterManifest) !== JSON.stringify(beforeManifest)) {
      throw new Error("Official webview JavaScript changed during patch construction.");
    }
    for (const effort of effortNames) {
      const relative = `webview/tibo-slider/tibo-assets/${effort}.png`;
      const member = verifiedMembers.find(({ logicalPath }) => logicalPath === relative);
      const actual = createHash("sha256").update(archiveBuffer(packedAsar, member)).digest("hex");
      const expected = createHash("sha256").update(assetBuffers.get(`${effort}.png`)).digest("hex");
      if (actual !== expected) throw new Error(`Patched archive asset hash mismatch: ${relative}`);
    }

    const sourceShaAfter = await sha256File(source);
    if (sourceShaAfter !== sourceShaBefore) {
      throw new Error("Source app.asar changed during the build; output was not published.");
    }
    const patchedSha = await sha256File(packedAsar);
    await atomicCopy(packedAsar, output);
    if (await sha256File(output) !== patchedSha) throw new Error("Published output hash mismatch.");

    const metadata = {
      packageName: packageJson.name,
      version: packageJson.version,
      sourcePath: sourceReal,
      sourceSha256: sourceShaBefore,
      patchedSha256: patchedSha,
      stateSource: "[data-codex-intelligence-trigger][data-selected-reasoning-effort]",
      builtAt: new Date().toISOString(),
    };
    const outputDirectory = path.dirname(output);
    await atomicWrite(path.join(outputDirectory, "source.sha256"), `${sourceShaBefore}\n`);
    await atomicWrite(path.join(outputDirectory, "patched.sha256"), `${patchedSha}\n`);
    await atomicWrite(path.join(outputDirectory, "codex-version.txt"), `${packageJson.version}\n`);
    await atomicWrite(path.join(outputDirectory, "bundle-before.sha256"), `${beforeManifest.join("\n")}\n`);
    await atomicWrite(path.join(outputDirectory, "bundle-after.sha256"), `${afterManifest.join("\n")}\n`);
    await atomicWrite(path.join(outputDirectory, "unpacked-before.sha256"), `${unpackedBefore.join("\n")}${unpackedBefore.length ? "\n" : ""}`);
    await atomicWrite(
      path.join(outputDirectory, "reasoning-state-bundles.txt"),
      `${stateFiles.map(({ logicalPath }) => logicalPath).sort().join("\n")}\n`,
    );
    await atomicWrite(path.join(outputDirectory, "build-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    return { ...metadata, outputPath: output, officialJavaScriptFiles: beforeManifest.length };
  } finally {
    process.chdir(previousWorkingDirectory);
    const expectedPrefix = `${outputParentReal}${path.sep}.tibo-build-`;
    if (buildDirectory.startsWith(expectedPrefix)) {
      await rm(buildDirectory, { recursive: true, force: true });
    }
  }
}

async function main() {
  const source = process.argv[2] ?? await import("./platform.mjs")
    .then(({ locateInstalledAsar }) => locateInstalledAsar());
  const output = process.argv[3] ?? path.join(projectDirectory, "dist", "app.tibo-patched.asar");
  const result = await buildPatchedAsar(source, output);
  console.log(`Built: ${result.outputPath}`);
  console.log(`Codex version: ${result.version}`);
  console.log(`Source SHA-256: ${result.sourceSha256}`);
  console.log(`Patched SHA-256: ${result.patchedSha256}`);
  console.log(`Official webview JavaScript: unchanged (${result.officialJavaScriptFiles} files)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
