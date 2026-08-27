import test from "node:test";
import assert from "node:assert/strict";
import { MARKER, patchIndexHtml, validateCsp } from "../scripts/patch-index.mjs";

const validHtml = `<!doctype html>
<html><head>
<script type="module" src="./assets/official.js"></script>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:">
</head><body><div id="root"></div></body></html>`;

test("injects local CSS and JS exactly once without touching official entry tags", () => {
  const first = patchIndexHtml(validHtml);
  assert.equal(first.changed, true);
  assert.equal(first.html.match(new RegExp(MARKER, "gu")).length, 1);
  assert.match(first.html, /\.\/tibo-slider\/tibo-background\.css/u);
  assert.match(first.html, /\.\/tibo-slider\/tibo-background\.js/u);
  assert.match(first.html, /\.\/assets\/official\.js/u);

  const second = patchIndexHtml(first.html);
  assert.equal(second.changed, false);
  assert.equal(second.html, first.html);
});

for (const [kind, policy] of [
  ["scripts", "default-src 'none'; script-src https:; style-src 'self'; img-src 'self'"],
  ["styles", "default-src 'none'; script-src 'self'; style-src https:; img-src 'self'"],
  ["images", "default-src 'none'; script-src 'self'; style-src 'self'; img-src data:"],
]) {
  test(`rejects a CSP that blocks local ${kind}`, () => {
    const html = validHtml.replace(
      /default-src[^"]+/u,
      policy,
    );
    assert.throws(() => validateCsp(html), new RegExp(kind, "u"));
  });
}

test("rejects a missing CSP meta tag", () => {
  assert.throws(
    () => validateCsp("<html><head></head><body></body></html>"),
    /policy meta tag is missing/u,
  );
});
