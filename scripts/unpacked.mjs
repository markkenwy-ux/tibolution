import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readlink, stat } from "node:fs/promises";
import path from "node:path";
import { listPackage, statFile } from "@electron/asar";

function logicalMember(line) {
  return line.replace(/^[/\\]+/u, "").replaceAll("\\", "/");
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function unpackedManifest(archive) {
  const unpacked = listPackage(archive, { isPack: true })
    .filter((line) => line.startsWith("unpack : "))
    .map((line) => logicalMember(line.slice("unpack : ".length)))
    .sort((left, right) => left.localeCompare(right, "en"));
  if (unpacked.length === 0) return [];

  const companion = `${archive}.unpacked`;
  const rootDetails = await stat(companion).catch(() => null);
  if (!rootDetails?.isDirectory()) {
    throw new Error(`Codex archive requires its matching unpacked directory: ${companion}`);
  }
  const rows = [];
  for (const member of unpacked) {
    const archiveEntry = statFile(archive, member, false);
    const diskPath = path.join(companion, ...member.split("/"));
    const diskEntry = await lstat(diskPath).catch(() => null);
    if ("files" in archiveEntry) {
      if (!diskEntry?.isDirectory()) throw new Error(`Codex unpacked directory is missing or unsafe: ${member}`);
      continue;
    }
    if ("link" in archiveEntry) {
      if (!diskEntry?.isSymbolicLink()) throw new Error(`Codex unpacked link is missing or unsafe: ${member}`);
      rows.push(`LINK ${await readlink(diskPath)}  ${member}`);
      continue;
    }
    if (!diskEntry?.isFile() || diskEntry.isSymbolicLink()) {
      throw new Error(`Codex unpacked file is missing or unsafe: ${member}`);
    }
    rows.push(`${await sha256(diskPath)}  ${member}`);
  }
  return rows;
}
