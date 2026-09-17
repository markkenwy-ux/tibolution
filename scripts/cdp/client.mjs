// CDP transport. No app files or authentication data are read or modified.
export function localUrl(value, protocols = ["http:"]) {
  const url = new URL(value);
  if (!protocols.includes(url.protocol) || !["127.0.0.1", "[::1]"].includes(url.hostname)
      || url.username || url.password) throw new Error("CDP endpoint must be a loopback URL.");
  return url;
}

export function isMainTarget(target) {
  try {
    const url = new URL(target.url);
    return target.type === "page" && url.protocol === "app:" && url.hostname === "-"
      && url.pathname === "/index.html" && !url.searchParams.has("initialRoute");
  } catch { return false; }
}

export async function targets(port) {
  let failure;
  for (const host of ["127.0.0.1", "[::1]"]) {
    try {
      const response = await fetch(`http://${host}:${port}/json/list`, {
        signal: AbortSignal.timeout(3000), redirect: "error",
      });
      if (!response.ok) throw new Error(`CDP HTTP ${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("Invalid CDP target list.");
      return rows.filter(isMainTarget).map((row) => {
        const ws = localUrl(row.webSocketDebuggerUrl, ["ws:"]);
        if (Number(ws.port) !== port) throw new Error("CDP WebSocket port mismatch.");
        return row;
      });
    } catch (error) { failure = error; }
  }
  throw failure;
}

export class CdpClient {
  constructor(url, timeout = 15000) {
    this.url = localUrl(url, ["ws:"]).href;
    this.timeout = timeout;
    this.pending = new Map();
    this.sequence = 0;
  }
  async open() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.socket.close(); reject(new Error("CDP connection timeout")); }, this.timeout);
      this.socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP connection failed")); }, { once: true });
    });
    this.socket.addEventListener("message", ({ data }) => {
      try {
        const message = JSON.parse(String(data));
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        clearTimeout(waiter.timer);
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result);
      } catch (error) { this.fail(error); }
    });
    this.socket.addEventListener("close", () => this.fail(new Error("CDP disconnected")));
    this.socket.addEventListener("error", () => this.fail(new Error("CDP socket error")));
    return this;
  }
  fail(error) {
    for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
    this.pending.clear();
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (this.socket?.readyState !== WebSocket.OPEN) return reject(new Error("CDP is not connected"));
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ id, method, params })); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result?.value;
  }
  close() { this.fail(new Error("CDP client closed")); this.socket?.close(); }
}
