import { pathToFileURL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

export const MARKER = "TIBO_REASONING_BACKGROUND_V1";

const injection = [
  `    <!-- ${MARKER} -->`,
  '    <link rel="stylesheet" href="./tibo-slider/tibo-background.css" />',
  '    <script defer src="./tibo-slider/tibo-background.js"></script>',
  "",
].join("\n");

function parseDirectives(policy) {
  const directives = new Map();
  for (const rawDirective of policy.split(";")) {
    const tokens = rawDirective.trim().split(/\s+/u).filter(Boolean);
    if (tokens.length > 0) directives.set(tokens[0].toLowerCase(), tokens.slice(1));
  }
  return directives;
}

function effectiveSources(directives, names) {
  for (const name of names) {
    if (directives.has(name)) return directives.get(name);
  }
  return [];
}

export function validateCsp(html) {
  const dom = new JSDOM(html);
  const meta = dom.window.document.querySelector(
    'meta[http-equiv="Content-Security-Policy" i]',
  );
  if (!meta) throw new Error("Unsupported Codex CSP: policy meta tag is missing.");

  const directives = parseDirectives(meta.getAttribute("content") ?? "");
  const checks = [
    ["scripts", ["script-src-elem", "script-src", "default-src"]],
    ["styles", ["style-src-elem", "style-src", "default-src"]],
    ["images", ["img-src", "default-src"]],
  ];
  for (const [label, names] of checks) {
    if (!effectiveSources(directives, names).includes("'self'")) {
      throw new Error(`Unsupported Codex CSP: local ${label} are not allowed by 'self'.`);
    }
  }
}

export function patchIndexHtml(original) {
  validateCsp(original);
  if (original.includes(MARKER)) return { html: original, changed: false };
  if (!/<\/head\s*>/iu.test(original)) {
    throw new Error("Could not find </head> in Codex webview/index.html");
  }
  return {
    html: original.replace(/<\/head\s*>/iu, `${injection}</head>`),
    changed: true,
  };
}

export async function patchIndexFile(file) {
  const original = await readFile(file, "utf8");
  const result = patchIndexHtml(original);
  if (result.changed) await writeFile(file, result.html);
  return result.changed;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: node patch-index.mjs <webview/index.html>");
  const changed = await patchIndexFile(file);
  console.log(changed
    ? "Injected the Tibolution background loader into webview/index.html."
    : "Tibolution injection already present; index left unchanged.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
