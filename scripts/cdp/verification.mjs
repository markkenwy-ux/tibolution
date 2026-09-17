// A missing composer during navigation is not evidence of a broken injection.
// Keep native synchronization strict, but wait for several consecutive samples.
export async function waitForNativeStatus(read, { timeoutMs = 20000, intervalMs = 200, stableSamples = 3 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let consecutive = 0;
  let last;
  do {
    last = await read();
    if (last.failedImages > 0 || last.destroyed || last.rootCount > 1) {
      throw new Error(`Background runtime unhealthy: ${JSON.stringify(last)}`);
    }
    consecutive = last.pass ? consecutive + 1 : 0;
    if (consecutive >= stableSamples) return last;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  } while (Date.now() < deadline);
  const reason = last?.nativeStateFound ? "native state/background did not synchronize" : "native effort control is temporarily absent; open a conversation composer and retry";
  throw new Error(`Verification timed out: ${reason}. Last status: ${JSON.stringify(last)}`);
}

export async function waitForNativeControl(client, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await client.evaluate('Boolean(document.querySelector("[data-codex-intelligence-trigger][data-selected-reasoning-effort]"))')) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  } while (Date.now() < deadline);
  throw new Error("Native effort control is absent. Open a conversation composer and retry; no background was installed.");
}
