import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function quoteExecArgument(value) {
  if (!path.isAbsolute(value) || /[\0\r\n]/u.test(value)) {
    throw new Error("The launcher must be an absolute path without line breaks.");
  }
  return `"${value.replaceAll("%", "%%").replace(/([\\`"$])/gu, "\\$1")}"`;
}

export function renderDesktopEntry(source, launcher) {
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  let inDesktopEntry = false;
  let replaced = 0;
  const output = [];
  for (const line of lines) {
    const group = line.match(/^\s*\[([^\]]+)\]\s*$/u);
    if (group) inDesktopEntry = group[1] === "Desktop Entry";
    if (inDesktopEntry && /^Exec=/u.test(line)) {
      output.push(`Exec=${quoteExecArgument(launcher)} %U`);
      output.push("X-Tibolution-Launcher=true");
      replaced += 1;
      continue;
    }
    if (/^X-Tibolution-Launcher=/u.test(line)) continue;
    output.push(line);
  }
  if (replaced !== 1) {
    throw new Error("Expected exactly one Exec entry in the source [Desktop Entry].");
  }
  return `${output.join("\n").replace(/\n*$/u, "")}\n`;
}

async function main() {
  const source = option("--source");
  const launcher = option("--launcher");
  const output = option("--output");
  if (!source || !launcher || !output) {
    throw new Error("--source, --launcher, and --output are required.");
  }
  const details = await lstat(source).catch(() => null);
  if (!details?.isFile() || details.isSymbolicLink()) {
    throw new Error(`Desktop entry source is missing or unsafe: ${source}`);
  }
  await writeFile(output, renderDesktopEntry(await readFile(source, "utf8"), launcher), {
    flag: "wx",
    mode: 0o644,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
