(() => {
  "use strict";

  window.__TIBO_BACKGROUND__?.destroy?.();
  const config = window.__TIBO_CONFIG__ ?? {};
  let destroyed = false;
  let started = false;
  let observer = null;
  let previewEffort = null;
  const frames = new Set();
  const imageStates = new Map();
  const previousAttributes = new Map(["data-tibo-background", "data-tibo-effort"].map(
    (name) => [name, document.documentElement.getAttribute(name)],
  ));
  function frame(callback) {
    let completed = false;
    let id;
    id = requestAnimationFrame(() => {
      completed = true;
      frames.delete(id);
      if (!destroyed) callback();
    });
    if (!completed) frames.add(id);
    return id;
  }

  const EFFORTS = Object.freeze(["low", "medium", "high", "xhigh", "max", "ultra"]);
  const STATE_SELECTOR =
    "[data-codex-intelligence-trigger][data-selected-reasoning-effort]";
  const loaderScript = document.currentScript;
  const assetRoot = () => new URL(
    loaderScript?.dataset.assetRoot ?? "./tibo-assets/",
    loaderScript?.src ?? location.href,
  );
  const imageUrls = Object.freeze(Object.fromEntries(
    EFFORTS.map((effort) => [effort, config.images?.[effort] ?? new URL(`${effort}.png`, assetRoot()).href]),
  ));

  let currentEffort = null;
  let activeLayer = 0;
  let scheduled = false;
  let pendingEffort = null;
  let requestSequence = 0;
  let root = null;
  const loaded = new Map();

  function validEffort(value) {
    if (typeof value !== "string") return null;
    const normalized = value.toLowerCase();
    return EFFORTS.includes(normalized) ? normalized : null;
  }

  function ensureRoot() {
    if (root?.isConnected) return root;
    root = document.createElement("div");
    root.id = "tibo-reasoning-background";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = [
      '<div class="tibo-layer" data-layer="0" data-active="false"></div>',
      '<div class="tibo-layer" data-layer="1" data-active="false"></div>',
      '<div class="tibo-shade"></div>',
    ].join("");
    document.body.prepend(root);
    document.documentElement.dataset.tiboBackground = "on";
    return root;
  }

  function preload(url) {
    if (!loaded.has(url)) {
      loaded.set(url, new Promise((resolve) => {
        const image = new Image();
        image.onload = () => { imageStates.set(url, "loaded"); resolve(true); };
        image.onerror = () => { imageStates.set(url, "failed"); resolve(false); };
        image.src = url;
      }));
    }
    return loaded.get(url);
  }

  async function setBackground(effort, { immediate = false } = {}) {
    const normalized = validEffort(effort);
    const sequence = ++requestSequence;
    if (destroyed || !normalized || normalized === currentEffort) return false;

    const url = imageUrls[normalized];
    if (!(await preload(url)) || destroyed || sequence !== requestSequence) return false;

    const host = ensureRoot();
    const layers = host.querySelectorAll(".tibo-layer");
    const nextLayer = currentEffort == null ? activeLayer : 1 - activeLayer;
    const next = layers[nextLayer];
    const previous = layers[activeLayer];
    next.style.backgroundImage = `url("${url}")`;
    next.dataset.effort = normalized;
    if (immediate) next.style.transition = "none";

    frame(() => {
      next.dataset.active = "true";
      if (previous !== next) previous.dataset.active = "false";
      if (immediate) {
        frame(() => next.style.removeProperty("transition"));
      }
    });
    activeLayer = nextLayer;
    currentEffort = normalized;
    document.documentElement.dataset.tiboEffort = normalized;
    return true;
  }

  function readEffort() {
    const triggers = document.querySelectorAll(STATE_SELECTOR);
    for (let index = triggers.length - 1; index >= 0; index -= 1) {
      const effort = validEffort(
        triggers[index].getAttribute("data-selected-reasoning-effort"),
      );
      if (effort) return effort;
    }
    return null;
  }

  function sync() {
    scheduled = false;
    if (previewEffort !== null) return;
    const effort = pendingEffort ?? readEffort();
    pendingEffort = null;
    if (effort) void setBackground(effort);
  }

  function scheduleSync(effort = null) {
    if (destroyed) return;
    pendingEffort = validEffort(effort) ?? pendingEffort;
    if (scheduled) return;
    scheduled = true;
    frame(() => {
      try {
        sync();
      } catch (error) {
        console.warn("[Tibolution] state sync failed", error);
      }
    });
  }

  function handleMutations(mutations) {
    let changedEffort = null;
    for (const mutation of mutations) {
      if (mutation.type !== "attributes") continue;
      changedEffort = validEffort(
        mutation.target.getAttribute("data-selected-reasoning-effort"),
      ) ?? changedEffort;
    }
    scheduleSync(changedEffort);
  }

  function start() {
    if (started || destroyed) return;
    started = true;
    ensureRoot();
    scheduleSync();
    observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-selected-reasoning-effort"],
    });
  }

  function destroy() {
    destroyed = true;
    ++requestSequence;
    observer?.disconnect();
    document.removeEventListener("DOMContentLoaded", start);
    for (const id of frames) cancelAnimationFrame(id);
    frames.clear();
    root?.remove();
    for (const [name, value] of previousAttributes) {
      if (value === null) document.documentElement.removeAttribute(name);
      else document.documentElement.setAttribute(name, value);
    }
    if (window.__TIBO_BACKGROUND__ === api) delete window.__TIBO_BACKGROUND__;
  }
  const api = Object.freeze({
      version: "2.2.0-cdp.2",
      efforts: EFFORTS,
      stateSelector: STATE_SELECTOR,
      get currentEffort() { return currentEffort; },
      sync: () => { previewEffort = null; pendingEffort = null; scheduleSync(); },
      setForPreview: (effort) => {
        const valid = validEffort(effort);
        if (!valid) return Promise.resolve(false);
        previewEffort = valid;
        return setBackground(valid);
      },
      destroy,
      status: () => ({
        version: "2.2.0-cdp.2", destroyed, started, previewEffort,
        nativeStateFound: Boolean(document.querySelector(STATE_SELECTOR)),
        nativeEffort: readEffort(), currentEffort,
        rootCount: document.querySelectorAll("#tibo-reasoning-background").length,
        imageLoaded: currentEffort !== null && imageStates.get(imageUrls[currentEffort]) === "loaded",
        failedImages: [...imageStates.values()].filter((value) => value === "failed").length,
      }),
    });
  window.__TIBO_BACKGROUND__ = api;

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  } catch (error) {
    console.warn("[Tibolution] disabled after initialization error", error);
  }
})();
