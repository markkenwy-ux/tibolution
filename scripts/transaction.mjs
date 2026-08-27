import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import {
  chmod,
  chown,
  copyFile,
  lstat,
  link,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDesktopRunning, protectedPlatformReason } from "./platform.mjs";
import { atomicReplace } from "./atomic-file.mjs";
import { unpackedManifest } from "./unpacked.mjs";

const hashPattern = /^[0-9a-f]{64}$/u;

function manifestDigest(rows) {
  return createHash("sha256").update(`${rows.join("\n")}${rows.length ? "\n" : ""}`).digest("hex");
}

async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function regularNonLink(file, label) {
  const details = await lstat(file).catch(() => null);
  if (!details?.isFile() || details.isSymbolicLink()) {
    throw new Error(`${label} is missing or unsafe: ${file}`);
  }
  return details;
}

function testBoundary(target, dist) {
  if (process.env.TIBO_TEST_MODE !== "1") return;
  const root = path.resolve(process.env.TIBO_TEST_ROOT ?? "");
  if (!root || root === path.parse(root).root) throw new Error("TIBO_TEST_ROOT must be a narrow test directory.");
  const inside = (file) => {
    const relative = path.relative(root, path.resolve(file));
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  };
  if (!inside(target) || !inside(dist)) throw new Error("Test-mode paths must stay under TIBO_TEST_ROOT.");
}

async function readHashRecord(file, label) {
  const value = (await readFile(file, "utf8")).split(/\r?\n/u)[0];
  if (!hashPattern.test(value)) throw new Error(`${label} contains an invalid SHA-256.`);
  return value;
}

async function applyInstalledMetadata(file, originalDetails, platform) {
  if (platform === "linux" && process.env.TIBO_TEST_MODE !== "1") {
    await chown(file, 0, 0);
    await chmod(file, 0o644);
    return;
  }
  if (platform !== "win32") {
    if (typeof process.getuid === "function" && process.getuid() === 0) {
      await chown(file, originalDetails.uid, originalDetails.gid);
    }
    await chmod(file, originalDetails.mode & 0o777);
  }
}

async function publishTemporary(source, temporary, details, platform) {
  await copyFile(source, temporary, constants.COPYFILE_EXCL);
  await applyInstalledMetadata(temporary, details, platform);
}

async function writeInstallRecord(file, record, details, platform) {
  const temporary = `${file}.new.${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o644 });
    await applyInstalledMetadata(temporary, details, platform);
    await atomicReplace(temporary, file);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function assertStopped(platform) {
  if (process.env.TIBO_TEST_MODE === "1" && process.env.TIBO_TEST_ALLOW_RUNNING === "1") return;
  if (isDesktopRunning(platform)) {
    const error = new Error("Codex Desktop is running. Close it completely before installing or restoring.");
    error.exitCode = 10;
    throw error;
  }
}

export async function install({ target, patched, dist, platform = process.platform }) {
  testBoundary(target, dist);
  await assertStopped(platform);
  const protectedReason = process.env.TIBO_TEST_MODE === "1" ? null : protectedPlatformReason(target, platform);
  if (protectedReason) throw new Error(protectedReason);
  const details = await regularNonLink(target, "Target app.asar");
  if (platform === "linux" && process.env.TIBO_TEST_MODE !== "1"
    && (details.uid !== 0 || details.gid !== 0 || (details.mode & 0o777) !== 0o644)) {
    throw new Error("Linux target app.asar must be root:root with mode 0644.");
  }
  await regularNonLink(patched, "Patched app.asar");
  const sourceSha = await readHashRecord(path.join(dist, "source.sha256"), "source.sha256");
  const patchedSha = await readHashRecord(path.join(dist, "patched.sha256"), "patched.sha256");
  if (await sha256File(patched) !== patchedSha) throw new Error("Patched archive hash does not match build metadata.");
  const currentSha = await sha256File(target);
  if (currentSha === patchedSha) return { alreadyInstalled: true, sourceSha, patchedSha };
  if (currentSha !== sourceSha) throw new Error("Codex changed after the build; refusing to install.");
  const recordedUnpacked = await readFile(path.join(dist, "unpacked-before.sha256"), "utf8")
    .then((value) => value.split(/\r?\n/u).filter(Boolean));
  if (JSON.stringify(await unpackedManifest(target)) !== JSON.stringify(recordedUnpacked)) {
    throw new Error("Codex app.asar.unpacked changed after the build; refusing to install.");
  }

  const backup = `${target}.tibo-backup.${sourceSha}.asar`;
  const installRecord = `${backup}.json`;
  const backupTemporary = `${backup}.new.${randomUUID()}`;
  const targetTemporary = `${target}.tibo-new.${patchedSha}.${randomUUID()}`;
  let replaced = false;
  try {
    const backupDetails = await lstat(backup).catch(() => null);
    if (backupDetails) {
      await regularNonLink(backup, "Exact backup");
      if (await sha256File(backup) !== sourceSha) throw new Error(`Existing exact backup has the wrong hash: ${backup}`);
    } else {
      await publishTemporary(target, backupTemporary, details, platform);
      if (await sha256File(backupTemporary) !== sourceSha) throw new Error("Temporary backup hash mismatch.");
      try {
        await link(backupTemporary, backup);
      } catch (error) {
        if (error?.code !== "EEXIST" || await sha256File(backup).catch(() => null) !== sourceSha) {
          throw error;
        }
      }
      await rm(backupTemporary, { force: true });
    }
    await publishTemporary(patched, targetTemporary, details, platform);
    if (await sha256File(targetTemporary) !== patchedSha) throw new Error("Temporary installed archive hash mismatch.");
    if (await sha256File(target) !== sourceSha) throw new Error("Codex changed before atomic replacement; refusing to install.");
    await atomicReplace(targetTemporary, target);
    replaced = true;
    if (await sha256File(target) !== patchedSha) throw new Error("Installed archive failed its final hash check.");
    const finalDetails = await lstat(target);
    if (platform === "linux" && process.env.TIBO_TEST_MODE !== "1"
      && (finalDetails.uid !== 0 || finalDetails.gid !== 0 || (finalDetails.mode & 0o777) !== 0o644)) {
      throw new Error("Installed archive ownership or permissions are incorrect.");
    }
    await writeInstallRecord(installRecord, {
      targetPath: path.resolve(target),
      backupPath: path.resolve(backup),
      sourceSha256: sourceSha,
      patchedSha256: patchedSha,
      unpackedManifestSha256: manifestDigest(recordedUnpacked),
      installedAt: new Date().toISOString(),
    }, details, platform);
    return { alreadyInstalled: false, backup, sourceSha, patchedSha };
  } catch (error) {
    if (replaced && await sha256File(backup).catch(() => null) === sourceSha) {
      const rollback = `${target}.tibo-rollback.${sourceSha}.${randomUUID()}`;
      try {
        await publishTemporary(backup, rollback, details, platform);
        await atomicReplace(rollback, target);
      } finally {
        await rm(rollback, { force: true }).catch(() => {});
      }
    }
    throw error;
  } finally {
    await rm(backupTemporary, { force: true }).catch(() => {});
    await rm(targetTemporary, { force: true }).catch(() => {});
  }
}

export async function restore({ target, originalSha, dist, platform = process.platform }) {
  testBoundary(target, dist);
  await assertStopped(platform);
  const protectedReason = process.env.TIBO_TEST_MODE === "1" ? null : protectedPlatformReason(target, platform);
  if (protectedReason) throw new Error(protectedReason);
  if (!hashPattern.test(originalSha)) throw new Error("Pass the exact original SHA-256.");
  const details = await regularNonLink(target, "Target app.asar");
  if (platform === "linux" && process.env.TIBO_TEST_MODE !== "1"
    && (details.uid !== 0 || details.gid !== 0 || (details.mode & 0o777) !== 0o644)) {
    throw new Error("Linux target app.asar must be root:root with mode 0644.");
  }
  const backup = `${target}.tibo-backup.${originalSha}.asar`;
  const installRecord = `${backup}.json`;
  await regularNonLink(backup, "Exact backup");
  if (await sha256File(backup) !== originalSha) throw new Error("Exact backup hash mismatch; refusing to restore.");
  const currentSha = await sha256File(target);
  if (currentSha === originalSha) return { alreadyRestored: true, originalSha };
  let recordedSource;
  let recordedPatched;
  const recordDetails = await lstat(installRecord).catch(() => null);
  if (recordDetails) {
    await regularNonLink(installRecord, "Exact install record");
    const record = JSON.parse(await readFile(installRecord, "utf8"));
    recordedSource = record.sourceSha256;
    recordedPatched = record.patchedSha256;
    if (record.targetPath !== path.resolve(target)
      || record.backupPath !== path.resolve(backup)
      || !hashPattern.test(recordedSource)
      || !hashPattern.test(recordedPatched)
      || !hashPattern.test(record.unpackedManifestSha256)) {
      throw new Error("Exact install record is invalid; refusing to restore.");
    }
    if (manifestDigest(await unpackedManifest(target)) !== record.unpackedManifestSha256) {
      throw new Error("Codex app.asar.unpacked no longer matches this exact backup.");
    }
  } else {
    recordedSource = await readHashRecord(path.join(dist, "source.sha256"), "source.sha256");
    recordedPatched = await readHashRecord(path.join(dist, "patched.sha256"), "patched.sha256");
    const legacyUnpacked = await readFile(path.join(dist, "unpacked-before.sha256"), "utf8")
      .then((value) => value.split(/\r?\n/u).filter(Boolean), () => null);
    if (legacyUnpacked
      && JSON.stringify(await unpackedManifest(target)) !== JSON.stringify(legacyUnpacked)) {
      throw new Error("Codex app.asar.unpacked no longer matches the legacy build record.");
    }
  }
  if (recordedSource !== originalSha || recordedPatched !== currentSha) {
    throw new Error("Current archive does not match the patch built from this exact backup.");
  }

  const temporary = `${target}.tibo-restore.${originalSha}.${randomUUID()}`;
  try {
    await publishTemporary(backup, temporary, details, platform);
    if (await sha256File(temporary) !== originalSha) throw new Error("Temporary restore archive hash mismatch.");
    if (await sha256File(target) !== currentSha) throw new Error("Codex changed before atomic restore; refusing to continue.");
    await atomicReplace(temporary, target);
    if (await sha256File(target) !== originalSha) throw new Error("Restored archive failed its final hash check.");
    return { alreadyRestored: false, originalSha };
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  const target = option("--target");
  const dist = option("--dist");
  const platform = process.env.TIBO_TEST_MODE === "1" && process.env.TIBO_TEST_PLATFORM
    ? process.env.TIBO_TEST_PLATFORM
    : process.platform;
  if (!target || !dist) throw new Error("--target and --dist are required.");
  if (command === "install") {
    const patched = option("--patched");
    if (!patched) throw new Error("--patched is required for installation.");
    const result = await install({ target, patched, dist, platform });
    console.log(result.alreadyInstalled ? `Tibolution is already installed: ${result.patchedSha}` : "Installed Tibolution.");
    if (result.backup) console.log(`Backup: ${result.backup}`);
    console.log(`Original SHA-256: ${result.sourceSha}`);
    console.log(`Patched SHA-256: ${result.patchedSha}`);
    return;
  }
  if (command === "restore") {
    const originalSha = option("--original-sha");
    const result = await restore({ target, originalSha, dist, platform });
    console.log(result.alreadyRestored ? `Original Codex app.asar is already present: ${result.originalSha}` : "Original Codex app.asar restored.");
    console.log(`Restored SHA-256: ${result.originalSha}`);
    return;
  }
  throw new Error("Usage: node scripts/transaction.mjs <install|restore> --target <app.asar> --dist <dir> [...]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}
