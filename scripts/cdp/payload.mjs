import { readFile } from "node:fs/promises";
const root = new URL("../../", import.meta.url);
const efforts = ["low", "medium", "high", "xhigh", "max", "ultra"];
export async function buildPayload() {
  const [runtime, css, images] = await Promise.all([
    readFile(new URL("src/tibo-background.js", root), "utf8"),
    readFile(new URL("src/tibo-background.css", root), "utf8"),
    Promise.all(efforts.map(async (effort) => {
      const data = await readFile(new URL(`assets/${effort}.png`, root));
      if (data.length > 8 * 1024 * 1024 || data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
        throw new Error(`Invalid or oversized PNG: ${effort}`);
      }
      return [effort, `data:image/png;base64,${data.toString("base64")}`];
    })),
  ]);
  return `(() => {
    if (!document.querySelector("[data-codex-intelligence-trigger][data-selected-reasoning-effort]")) {
      throw new Error("Native reasoning state is not available in this page; no background was installed.");
    }
    if (window.__TIBO_BACKGROUND__ && typeof window.__TIBO_BACKGROUND__.destroy !== "function") {
      throw new Error("An older ASAR background runtime is active. Restore that patch before enabling CDP.");
    }
    window.__TIBO_BACKGROUND__?.destroy?.();
    document.getElementById("tibo-cdp-style")?.remove();
    const style = document.createElement("style");
    style.id = "tibo-cdp-style";
    style.textContent = ${JSON.stringify(css)};
    document.head.append(style);
    window.__TIBO_CONFIG__ = ${JSON.stringify({ images: Object.fromEntries(images) })};
    try { ${runtime}\n } finally { delete window.__TIBO_CONFIG__; }
    return window.__TIBO_BACKGROUND__?.status();
  })()`;
}
export const statusExpression = `(() => {
  const status = window.__TIBO_BACKGROUND__?.status();
  const root = document.getElementById("tibo-reasoning-background");
  return { ...(status ?? { started: false }),
    stylePresent: Boolean(document.getElementById("tibo-cdp-style")),
    clickThrough: root ? getComputedStyle(root).pointerEvents === "none" : false,
    visibleLayerCount: root ? [...root.querySelectorAll(".tibo-layer")].filter(n => Number(getComputedStyle(n).opacity) > 0).length : 0,
    pass: Boolean(document.getElementById("tibo-cdp-style") && status?.nativeStateFound && status.imageLoaded && status.rootCount === 1
      && status.currentEffort === status.nativeEffort && root && getComputedStyle(root).pointerEvents === "none")
  };
})()`;
export const removeExpression = `(() => {
  window.__TIBO_BACKGROUND__?.destroy?.();
  document.getElementById("tibo-cdp-style")?.remove();
  delete window.__TIBO_CONFIG__;
  return { removed: !window.__TIBO_BACKGROUND__ && !document.getElementById("tibo-reasoning-background")
    && !document.getElementById("tibo-cdp-style") };
})()`;
