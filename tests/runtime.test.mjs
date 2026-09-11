import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../src/tibo-background.js", import.meta.url), "utf8");
const css = await readFile(new URL("../src/tibo-background.css", import.meta.url), "utf8");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function boot({
  effort = "low",
  model = "arbitrary-future-model",
  includeTrigger = true,
  imageResult = true,
} = {}) {
  const trigger = includeTrigger
    ? `<button data-model="${model}" data-codex-intelligence-trigger data-selected-reasoning-effort="${effort}"></button>`
    : "";
  const dom = new JSDOM(
    `<!doctype html><html class="electron-dark"><body><div id="root">${trigger}</div></body></html>`,
    { runScripts: "outside-only", url: "file:///webview/index.html" },
  );
  dom.window.Image = class {
    set src(_) {
      queueMicrotask(() => imageResult ? this.onload?.() : this.onerror?.());
    }
  };
  dom.window.requestAnimationFrame = (callback) => callback();
  vm.runInContext(source, dom.getInternalVMContext());
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  return dom;
}

for (const effort of ["low", "medium", "high", "xhigh", "max", "ultra"]) {
  test(`maps native ${effort} state to ${effort}.png`, async () => {
    const dom = boot({ effort });
    await tick();
    assert.equal(dom.window.document.documentElement.dataset.tiboEffort, effort);
    assert.match(
      dom.window.document.querySelector('.tibo-layer[data-active="true"]').style.backgroundImage,
      new RegExp(`${effort}\\.png`),
    );
  });
}

test("two unknown models use the same image for the same effort", async () => {
  const first = boot({ effort: "max", model: "unknown-model-alpha" });
  const second = boot({ effort: "max", model: "unknown-model-beta" });
  await tick();
  const activeImage = (dom) =>
    dom.window.document.querySelector('.tibo-layer[data-active="true"]').style.backgroundImage;
  assert.equal(activeImage(first), activeImage(second));
  assert.match(activeImage(first), /max\.png/u);
});

test("main slider attribute changes update the background", async () => {
  const dom = boot({ effort: "low" });
  await tick();
  const trigger = dom.window.document.querySelector("[data-codex-intelligence-trigger]");
  trigger.setAttribute("data-selected-reasoning-effort", "high");
  await tick();
  assert.equal(dom.window.document.documentElement.dataset.tiboEffort, "high");
});

test("advanced menu trigger attribute changes update the background", async () => {
  const dom = boot({ effort: "medium" });
  await tick();
  const advancedTrigger = dom.window.document.createElement("button");
  advancedTrigger.setAttribute("data-codex-intelligence-trigger", "");
  advancedTrigger.setAttribute("data-selected-reasoning-effort", "xhigh");
  dom.window.document.body.append(advancedTrigger);
  await tick();
  advancedTrigger.setAttribute("data-selected-reasoning-effort", "ultra");
  await tick();
  assert.equal(dom.window.document.documentElement.dataset.tiboEffort, "ultra");
});

test("chat text containing effort words cannot trigger a background", async () => {
  const dom = boot({ effort: "high" });
  await tick();
  dom.window.document.body.append("low medium high xhigh max ultra");
  await tick();
  assert.equal(dom.window.document.documentElement.dataset.tiboEffort, "high");
});

test("localized labels are ignored when the native state attribute is absent", async () => {
  const dom = boot({ includeTrigger: false });
  dom.window.document.body.append("最高 极高 中等 high max ultra");
  await tick();
  assert.equal(dom.window.document.documentElement.dataset.tiboEffort, undefined);
  assert.equal(dom.window.__TIBO_BACKGROUND__.currentEffort, null);
});

test("unsupported levels and controls are never added", async () => {
  const dom = boot({ effort: "xhigh" });
  const nativeControls = ["low", "medium", "high", "xhigh"].map((effort) => {
    const button = dom.window.document.createElement("button");
    button.dataset.nativeEffort = effort;
    return button;
  });
  dom.window.document.querySelector("#root").append(...nativeControls);
  await tick();
  assert.equal(dom.window.document.querySelectorAll("[data-native-effort]").length, 4);
  assert.equal(dom.window.document.querySelector("[data-native-effort=max]"), null);
  assert.equal(dom.window.document.querySelector("[data-native-effort=ultra]"), null);
});

test("unknown native values preserve the last valid background", async () => {
  const dom = boot({ effort: "medium" });
  await tick();
  const trigger = dom.window.document.querySelector("[data-codex-intelligence-trigger]");
  trigger.setAttribute("data-selected-reasoning-effort", "future-level");
  await tick();
  assert.equal(dom.window.document.documentElement.dataset.tiboEffort, "medium");
});

test("image load failure leaves Codex usable with a solid fallback", async () => {
  const dom = boot({ effort: "max", imageResult: false });
  await tick();
  assert.ok(dom.window.document.querySelector("#root"));
  assert.ok(dom.window.document.querySelector("#tibo-reasoning-background"));
  assert.equal(dom.window.document.documentElement.dataset.tiboEffort, undefined);
});

test("runtime code has no model whitelist or label parsing fallback", () => {
  assert.doesNotMatch(source, /\b(?:sol|terra|luna|gpt-?5)\b/iu);
  assert.doesNotMatch(source, /textContent|innerText|effortFromLabel/u);
  assert.match(
    source,
    /\[data-codex-intelligence-trigger\]\[data-selected-reasoning-effort\]/u,
  );
});

test("CSS provides cover crossfade, click-through, themes, and reduced motion", () => {
  assert.match(css, /background-size:\s*cover/u);
  assert.match(css, /background-position:\s*center/u);
  assert.match(css, /pointer-events:\s*none/u);
  assert.match(css, /opacity 560ms/u);
  assert.match(css, /electron-dark/u);
  assert.match(css, /electron-light/u);
  assert.match(css, /prefers-reduced-motion:\s*reduce/u);
});

test("light theme uses a reading surface without a full-screen white shade", () => {
  assert.match(css, /html\.electron-light[^{}]*\.tibo-shade\s*\{\s*background: none;/u);
  assert.match(css, /html\.electron-light[^{}]*\[data-thread-user-message-navigation-content\]\s*\{\s*background: rgb\(255 255 255 \/ 0\.94\)/u);
});
