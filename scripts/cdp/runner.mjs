import { mkdir, readFile, writeFile, unlink, open } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CdpClient, targets } from "./client.mjs";
import { buildPayload, statusExpression, removeExpression } from "./payload.mjs";
import { verifyWindowsEndpoint } from "./windows.mjs";
import { waitForNativeStatus, waitForNativeControl } from "./verification.mjs";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const args = process.argv.slice(2);
const mode = args.shift();
if (!["apply", "watch", "status", "remove", "screenshot"].includes(mode)) throw new Error("Usage: runner.mjs apply|watch|status|remove|screenshot [--port 9335] [--target ID] [--output PATH]");
const options = { port: 9335 };
while (args.length) {
  const key = args.shift();
  if (!["--port", "--target", "--output"].includes(key) || !args.length) throw new Error(`Invalid option: ${key}`);
  options[key.slice(2)] = args.shift();
}
options.port = Number(options.port);
if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error("Invalid CDP port");
const stateRoot = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "Tibolution", "cdp");
await mkdir(stateRoot, { recursive: true });
const lockFile = path.join(stateRoot, `${options.port}.lock`);
const stopFile = path.join(stateRoot, `${options.port}.stop`);
const exists = file => readFile(file).then(() => true, e => { if (e.code === "ENOENT") return false; throw e; });

async function connect() {
  const identity = await verifyWindowsEndpoint(options.port);
  const candidates = (await targets(options.port)).filter(t => !options.target || t.id === options.target);
  if (candidates.length !== 1) throw new Error(`Expected one Codex main renderer, found ${candidates.length}. Use --target with one of these exact IDs: ${candidates.map(t => t.id).join(", ")}`);
  const client = await new CdpClient(candidates[0].webSocketDebuggerUrl).open();
  try {
    const valid = await client.evaluate(`location.protocol === 'app:' && location.hostname === '-' && location.pathname === '/index.html' && Boolean(document.getElementById('root'))`);
    if (!valid) throw new Error("Renderer identity check failed.");
    return { client, identity, targetId: candidates[0].id };
  } catch (error) { client.close(); throw error; }
}

async function perform(payload, onlyIfMissing = false) {
  const { client, identity, targetId } = await connect();
  try {
    if (mode === "remove") return { identity, targetId, ...await client.evaluate(removeExpression) };
    if (mode === "screenshot") {
      if (!options.output) throw new Error("--output is required for screenshot");
      const result = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
      await writeFile(options.output, Buffer.from(result.data, "base64"));
    }
    let status = await client.evaluate(statusExpression);
    if (payload && (!onlyIfMissing || !status.started)) {
      await waitForNativeControl(client);
      await client.evaluate(payload);
      try {
        status = await waitForNativeStatus(() => client.evaluate(statusExpression));
      } catch (error) {
        await client.evaluate(removeExpression);
        throw new Error(`${error.message} Injected background removed.`);
      }
    }
    return { identity, targetId, ...status };
  } finally { client.close(); }
}

try {
  if (mode === "watch") {
    // Exclusive lock: stale files are reported, never used to kill an arbitrary PID.
    const lock = await open(lockFile, "wx");
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    await lock.close();
    let stopping = false;
    process.on("SIGINT", () => { stopping = true; });
    process.on("SIGTERM", () => { stopping = true; });
    try {
      const payload = await buildPayload();
      let failures = 0;
      let previous = "";
      while (!stopping && !await exists(stopFile)) {
        try {
          const result = await perform(payload, true);
          failures = 0;
          const summary = JSON.stringify(result);
          if (summary !== previous) { console.log(summary); previous = summary; }
        } catch (error) {
          console.error(error.message);
          if (++failures >= 5) throw new Error("CDP watcher stopped after five failures; restart it after fixing the endpoint.");
        }
        await sleep(1500);
      }
    } finally {
      await unlink(lockFile);
      await unlink(stopFile).catch(() => {});
    }
  } else {
    if (mode === "remove" && await exists(lockFile)) {
      await writeFile(stopFile, "stop\n");
      for (let i = 0; i < 60 && await exists(lockFile); i++) await sleep(500);
      if (await exists(lockFile)) throw new Error("Watcher has not stopped. Check the recorded watcher process before removing a stale lock.");
    }
    const result = await perform(mode === "apply" ? await buildPayload() : null);
    console.log(JSON.stringify(result, null, 2));
    if (mode === "remove" ? !result.removed : !result.pass) process.exitCode = 2;
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
