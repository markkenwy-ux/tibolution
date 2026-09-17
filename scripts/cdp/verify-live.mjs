// Explicit opt-in local acceptance test. Previews do not change native reasoning settings.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CdpClient, targets } from "./client.mjs";
import { verifyWindowsEndpoint } from "./windows.mjs";
import { buildPayload, statusExpression, removeExpression } from "./payload.mjs";
import { waitForNativeStatus, waitForNativeControl } from "./verification.mjs";
const port = Number(process.argv[2] ?? 9335);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port");
const directory = path.resolve(process.argv[3] ?? "work/live-verification");
await mkdir(directory, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], syntheticPreviews: true };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let client;
try {
  report.identity = await verifyWindowsEndpoint(port);
  const pages = await targets(port);
  if (pages.length !== 1) throw new Error(`Expected one main window; found ${pages.length}`);
  client = await new CdpClient(pages[0].webSocketDebuggerUrl).open();
  const payload = await buildPayload();
  await waitForNativeControl(client);
  await client.evaluate(payload);
  report.initial = await waitForNativeStatus(() => client.evaluate(statusExpression));
  for (const effort of ["low", "medium", "high", "xhigh", "max", "ultra"]) {
    await client.evaluate(`window.__TIBO_BACKGROUND__.setForPreview(${JSON.stringify(effort)})`);
    await pause(900);
    const state = await client.evaluate(statusExpression);
    const ok = state.currentEffort === effort && state.imageLoaded && state.rootCount === 1 && state.clickThrough && state.visibleLayerCount > 0;
    report.checks.push({ name: `synthetic image preview: ${effort}`, pass: ok });
    if (!ok) throw new Error(`Preview failed: ${effort}`);
  }
  report.removal = await client.evaluate(removeExpression);
  if (!report.removal.removed) throw new Error("Removal failed");
  await waitForNativeControl(client);
  await client.evaluate(payload);
  await waitForNativeControl(client);
  await client.evaluate(payload);
  report.final = await waitForNativeStatus(() => client.evaluate(statusExpression));
  report.pass = report.final.pass && report.final.rootCount === 1;
  if (!report.pass) throw new Error("Reinstall/native synchronization failed");
  const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path.join(directory, "native-background.png"), Buffer.from(screenshot.data, "base64"));
} catch (error) {
  report.pass = false;
  report.error = error.message;
  if (client) {
    try { report.cleanup = await client.evaluate(removeExpression); } catch {}
  }
  process.exitCode = 1;
} finally {
  client?.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(directory, "live-result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
