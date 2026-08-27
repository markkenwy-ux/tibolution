import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("..", import.meta.url));
const expectedAssets = {
  "high.png": "ab11ce61050a465994a4178cc7bea2b6a6b1ef8dc366464b6a778ce33a4396d5",
  "low.png": "83ecb294d3bb0c2d96719e08e22514be7daf52bda806bc82c4f4f878f0fbc605",
  "max.png": "a4c0b7617fb8b8f6debbeb7d5594ca4eb7d1a840f28dbd1d636b0f35f071a29b",
  "medium.png": "2faf8bb4aee536c01bda564467f5d53f30631e381b01d64d7e4e2c2733e6b668",
  "ultra.png": "98bccac70119c55758cf780d620706ec8872a3f4713ad03da0686ebaa9f20231",
  "xhigh.png": "0c8699b86b29851e29cbf693f2179bd645e5428f3486a2150f7f4d29e7380684",
};

test("the six supplied assets remain byte-identical 1586x992 PNG files", async () => {
  assert.deepEqual((await readdir(path.join(project, "assets"))).sort(), Object.keys(expectedAssets).sort());
  for (const [name, expectedHash] of Object.entries(expectedAssets)) {
    const data = await readFile(path.join(project, "assets", name));
    assert.equal(createHash("sha256").update(data).digest("hex"), expectedHash);
    assert.equal(data.readUInt32BE(16), 1586);
    assert.equal(data.readUInt32BE(20), 992);
  }
});

test("repository payload excludes official and patched archives", async () => {
  const found = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      if (entry.isFile() && /\.asar(?:\.|$)/u.test(entry.name)) found.push(fullPath);
    }
  }
  await walk(project);
  assert.deepEqual(found, []);
  await assert.rejects(stat(path.join(project, "webview", "assets")));
});

test("runtime source contains no model names or model capability table", async () => {
  const source = await readFile(path.join(project, "src", "tibo-background.js"), "utf8");
  assert.doesNotMatch(source, /\b(?:sol|terra|luna|gpt-?5)\b/iu);
  assert.doesNotMatch(source, /model(?:s|whitelist|allowlist|capabilit)/iu);
});

test("Desktop package is isolated from the command-line adapter", async () => {
  const packageJson = JSON.parse(await readFile(path.join(project, "package.json"), "utf8"));
  assert.equal(packageJson.name, "tibolution");
  assert.equal(packageJson.scripts.test, "node --test tests/*.test.mjs");
  assert.doesNotMatch(JSON.stringify(packageJson), /cli\/tests|codex-tibo|konsole/iu);
  await assert.rejects(access(path.join(project, "cli")));
  await assert.rejects(access(path.join(project, "index.html")));
  await assert.rejects(access(path.join(project, "preview")));
});
