import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { CdpClient, localUrl, isMainTarget } from "../scripts/cdp/client.mjs";
import { buildPayload, removeExpression, statusExpression } from "../scripts/cdp/payload.mjs";
import { waitForNativeStatus } from "../scripts/cdp/verification.mjs";
const source = await readFile(new URL("../src/tibo-background.js", import.meta.url), "utf8");
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const dependencyRequire = createRequire(import.meta.resolve("jsdom"));
const { WebSocketServer } = dependencyRequire("ws");

test("verification tolerates temporarily unmounted native controls without accepting absent state", async () => {
  const states = [{pass:false,nativeStateFound:false}, {pass:true}, {pass:false,nativeStateFound:false}, {pass:true}, {pass:true}, {pass:true}];
  let reads = 0;
  const result = await waitForNativeStatus(async () => { reads++; return states.shift(); }, {intervalMs:1,timeoutMs:100});
  assert.equal(result.pass,true);
  assert.equal(reads,6);
  await assert.rejects(waitForNativeStatus(async () => ({pass:false,nativeStateFound:false}), {intervalMs:1,timeoutMs:10}), /temporarily absent/);
});

test("preview survives native DOM mutations and explicit sync resumes the native effort", async () => {
  const {dom,run}=fixture();
  try {
    run(source); await tick(); await tick();
    const api=dom.window.__TIBO_BACKGROUND__;
    await api.setForPreview('ultra');
    dom.window.document.body.append(dom.window.document.createElement('span'));
    await tick(); await tick();
    assert.equal(api.currentEffort,'ultra');
    api.sync(); await tick(); await tick();
    assert.equal(api.currentEffort,'medium');
  } finally { dom.window.close(); }
});

test("CDP correlates responses, reports renderer errors, and bounds silent requests", async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise(resolve => server.once('listening', resolve));
  server.on('connection', socket => socket.on('message', data => {
    const message = JSON.parse(String(data));
    if (message.method === 'silent') return;
    const result = message.params.expression === 'bad'
      ? { exceptionDetails: { text: 'renderer rejected test' } }
      : { result: { value: message.params.expression } };
    socket.send(JSON.stringify({ id: message.id, result }));
  }));
  const client = await new CdpClient(`ws://127.0.0.1:${server.address().port}`, 500).open();
  try {
    assert.deepEqual(await Promise.all([client.evaluate('one'), client.evaluate('two')]), ['one', 'two']);
    await assert.rejects(client.evaluate('bad'), /renderer rejected/);
    await assert.rejects(client.send('silent'), /timeout/);
    assert.equal(client.pending.size, 0);
  } finally { client.close(); await new Promise(resolve => server.close(resolve)); }
});
function fixture(delayed = false) {
  const dom = new JSDOM('<html><head></head><body><div id="root"><button data-codex-intelligence-trigger data-selected-reasoning-effort="medium"></button></div></body></html>', {
    url: "https://fixture.invalid", runScripts: "outside-only", pretendToBeVisual: true,
  });
  const images = [];
  dom.window.Image = class { set src(url) { this.url = url; images.push(this); if (!delayed) queueMicrotask(() => this.onload?.()); } };
  return { dom, images, run: value => vm.runInContext(value, dom.getInternalVMContext()) };
}
test("endpoint validation rejects network hosts and credentials", () => {
  for (const url of ['http://example.com:9335', 'http://127.0.0.1.evil:9335', 'http://user@127.0.0.1:9335', 'file:///x']) assert.throws(() => localUrl(url));
  assert.equal(localUrl('http://[::1]:9335').hostname, '[::1]');
  assert.throws(() => localUrl('wss://127.0.0.1:9335', ['ws:']));
});
test("target selection excludes embedded browsers and auxiliary windows", () => {
  const target = url => ({ type: 'page', url });
  assert.equal(isMainTarget(target('app://-/index.html')), true);
  for (const url of ['https://chatgpt.com', 'app://other/index.html', 'app://-/index.html?initialRoute=settings', 'app://-/other.html']) assert.equal(isMainTarget(target(url)), false);
  assert.equal(isMainTarget({ type: 'worker', url: 'app://-/index.html' }), false);
});
test("repeated injection leaves exactly one runtime and destroy survives further mutations", async () => {
  const { dom, run } = fixture();
  try {
    run(source); await tick(); await tick();
    const first = dom.window.__TIBO_BACKGROUND__;
    run(source); await tick(); await tick();
    assert.equal(first.status().destroyed, true);
    assert.equal(dom.window.document.querySelectorAll('#tibo-reasoning-background').length, 1);
    dom.window.__TIBO_BACKGROUND__.destroy();
    dom.window.document.querySelector('button').setAttribute('data-selected-reasoning-effort', 'ultra');
    await tick(); await tick();
    assert.equal(dom.window.document.querySelector('#tibo-reasoning-background'), null);
    assert.equal(dom.window.document.documentElement.hasAttribute('data-tibo-background'), false);
  } finally { dom.window.close(); }
});
test("late image completion cannot resurrect a destroyed runtime", async () => {
  const { dom, run, images } = fixture(true);
  try {
    run(source); await tick(); await tick();
    assert.ok(images.length);
    dom.window.__TIBO_BACKGROUND__.destroy();
    images.forEach(image => image.onload());
    await tick();
    assert.equal(dom.window.document.querySelector('#tibo-reasoning-background'), null);
    assert.equal(dom.window.document.documentElement.hasAttribute('data-tibo-effort'), false);
  } finally { dom.window.close(); }
});
test("CDP payload supplies images without a script element and fully restores owned elements", async () => {
  const { dom, run, images } = fixture();
  try {
    const payload = await buildPayload();
    run(payload); await tick(); await tick(); await tick();
    assert.ok(images.some(image => image.url.startsWith('data:image/png;base64,')));
    assert.equal(run(statusExpression).nativeEffort, 'medium');
    run(payload); await tick(); await tick();
    assert.equal(dom.window.document.querySelectorAll('#tibo-cdp-style').length, 1);
    assert.equal(run(removeExpression).removed, true);
    assert.ok(dom.window.document.querySelector('#root'));
  } finally { dom.window.close(); }
});
