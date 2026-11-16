import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { createHostedRestyleReader } from '../src/ui/localAssetPackCore.mjs';

const html = readFileSync(new URL('../public/restyle/animations.html', import.meta.url), 'utf8');
const marker = 'const HOSTED_RESTYLE = null; /* hosted-restyle-config */';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = text => new TextEncoder().encode(text);
let fixtureId = 0;
// Real timer turns, not setImmediate: local frame reads now take a real SHA-256 (threadpool) before they settle.
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setTimeout(r, 5)); };
function fixture({ hosted = true, malformed = false } = {}) {
  const images = new Map(['o0','r0','o1','r1'].map(n => [`anim/hub/${n}.png`, encode(n)]));
  const index = { items: [{ id: 'hub', frames: 2, staged: [0, 1], texts: [{ frame: 0, what: 'hub', source: 'manual' }] }],
    imageSha256: Object.fromEntries([...images].map(([p,b]) => [p.slice(5), hash(b)])) };
  const data = new Map([['anim/index.json', encode(malformed ? '{' : JSON.stringify(index))], ...images]);
  const files = [...data].map(([p,b]) => ({ path: `restyle/${p}`, byteLength: b.length, sha256: hash(b) })).sort((a,b) => a.path.localeCompare(b.path));
  const descriptor = { schema: 'greybox-hosted-restyle-pack-v1', fileCount: files.length, totalBytes: files.reduce((n,r) => n+r.byteLength,0), files };
  const pin = hash(JSON.stringify(descriptor)), base = `/viewer-${++fixtureId}/`, calls = [], imports = [], revoked = [], requests = [], urls = new Map(), intervals = new Map(), observers = [], elements = [];
  const delays = new Map(), events = new Map(); let nextUrl = 0, nextTimer = 0;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = new Map(); this.isConnected = false; elements.push(this); }
    connect(value) { this.isConnected = value; this.children.forEach(c => c.connect(value)); }
    appendChild(child) { this.children.push(child); child.connect(this.isConnected); return child; }
    replaceChildren() { this.children.forEach(c => c.connect(false)); this.children = []; }
    addEventListener(name, fn) { this.events.set(name, fn); }
    removeAttribute(name) { delete this[name]; }
    fire(name) { return this.events.get(name)?.(); }
  }
  const ids = Object.fromEntries(['root','pack-status','pack-input','choose-pack','clear-pack'].map(id => { const e = new Element(id); e.connect(true); return [id,e]; }));
  const fetcher = async (url, options = {}) => { calls.push(url); const key = url.slice(base.length + 'restyle/'.length);
    if (url === `${base}hosted-restyle-pack.json`) return new Response(JSON.stringify({ descriptor, inventorySha256: pin }));
    if (key.endsWith('.png')) requests.push({ key, signal: options.signal });
    if (delays.has(key)) await delays.get(key);
    return data.has(key) ? new Response(data.get(key)) : new Response('', { status: 404 }); };
  const context = { document: { getElementById: id => ids[id], createElement: tag => new Element(tag) },
    window: { location: { href: `https://example.test${base}restyle/animations.html` }, addEventListener: (name,fn) => events.set(name,fn) },
    IntersectionObserver: class { constructor(cb) { this.cb = cb; observers.push(this); } observe(target) { this.target = target; } disconnect() { this.disconnected = true; } },
    URL: class extends URL { static createObjectURL(blob) { const id = `blob:${++nextUrl}`; urls.set(id, blob); return id; }
      static revokeObjectURL(id) { revoked.push(id); urls.delete(id); } },
    setTimeout: (fn,ms) => { assert.equal(ms, 700); const id = ++nextTimer; intervals.set(id, fn); return id; }, clearTimeout: id => intervals.delete(id),
    crypto: webcrypto, TextDecoder, Uint8Array, AbortController, Blob,
    __import: async module => { imports.push(module); return { createHostedRestyleReader: (digest, root) => {
      assert.equal(digest, pin); assert.equal(root, base); return createHostedRestyleReader(digest, root, fetcher); } }; },
    fetch: async url => { assert.equal(hosted, false); assert.equal(url, './anim/index.json'); calls.push(url); return new Response(data.get('anim/index.json')); } };
  let script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('import(HOSTED_RESTYLE.module)', '__import(HOSTED_RESTYLE.module)');
  if (hosted) script = script.replace(marker, `const HOSTED_RESTYLE = ${JSON.stringify({ pin, module: `../assets/hosted-restyle-core-${'a'.repeat(64)}.js` })};`);
  runInNewContext(script, context);
  const f = { data, index, images, ids, calls, imports, requests, urls, revoked, intervals, observers, delays, elements,
    visible(value = true) { observers.filter(o => !o.disconnected).forEach(o => o.cb([{ target: o.target, isIntersecting: value }])); },
    tick() { const due = [...intervals.values()]; intervals.clear(); due.forEach(fn => fn()); }, exit() { events.get('pagehide')(); },
    select(map = data) { ids['pack-input'].files = [...map].map(([path,bytes]) => ({ webkitRelativePath: `restyle/${path}`, name: path,
      arrayBuffer: async () => { const value = await bytes; return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength); } })); ids['pack-input'].fire('change'); },
    frameCalls() { return calls.filter(u => u.endsWith('.png')); }, frames() { return elements.filter(e => e.tag === 'img' && e.isConnected); } };
  return f;
}

test('default null marker loads only bounded same-origin metadata; valid local frames remain usable', async () => {
  assert.equal(html.split(marker).length, 2); const f = fixture({ hosted: false }); await settle();
  assert.equal(f.imports.length, 0); assert.deepEqual(f.calls, ['./anim/index.json']); assert.equal(f.observers.length, 1);
  f.visible(); await settle(); assert.equal(f.frameCalls().length, 0); assert.equal(f.urls.size, 0);
  f.select(); await settle(); assert.equal(f.urls.size, 0); f.visible(); await settle();
  assert.equal(f.urls.size, 2); assert.equal(f.calls.length, 1); assert.equal(f.imports.length, 0); assert.match(f.ids['pack-status'].textContent, /^Lokalt/); f.exit();
  const oversized = fixture({ hosted: false }); oversized.data.set('anim/index.json', new Uint8Array(2 * 1024 * 1024 + 1));
  await settle(); assert.equal(oversized.observers.length, 0); assert.equal(oversized.frameCalls().length, 0); assert.equal(oversized.imports.length, 0); oversized.exit();
});

test('hosted frames wait for visibility, preserve 700ms order, pause offscreen and revoke replaced/exit URLs', async () => {
  const f = fixture(); await settle(); assert.equal(f.imports.length, 1); assert.equal(f.frameCalls().length, 0);
  f.visible(); await settle(); assert.deepEqual(f.frames().map(i => i.alt), ['anim/hub/o0.png','anim/hub/r0.png']);
  assert.match(f.ids['pack-status'].textContent, /^Hosted/);
  assert.equal(f.urls.size, 2); f.tick(); await settle();
  assert.deepEqual(f.frames().map(i => i.alt), ['anim/hub/o1.png','anim/hub/r1.png']); assert.equal(f.urls.size, 2); assert.equal(f.revoked.length, 2);
  f.visible(false); assert.equal(f.intervals.size, 0); const before = f.calls.length; f.tick(); await settle(); assert.equal(f.calls.length, before);
  f.visible(); await settle(); f.tick(); await settle(); assert.deepEqual(f.frames().map(i => i.alt), ['anim/hub/o0.png','anim/hub/r0.png']);
  f.exit(); assert.equal(f.urls.size, 0); assert.equal(f.intervals.size, 0); const count = f.calls.length; f.tick(); await settle(); assert.equal(f.calls.length, count);
});

test('animation advances only after both frame requests settle, then dwells 700ms without aborting on visibility updates', async () => {
  const f = fixture(); let finishOriginal, finishRestyle;
  f.delays.set('anim/hub/o0.png', new Promise(r => { finishOriginal = r; }));
  f.delays.set('anim/hub/r0.png', new Promise(r => { finishRestyle = r; }));
  await settle(); f.visible(); await settle();
  assert.deepEqual(f.requests.map(r => r.key), ['anim/hub/o0.png', 'anim/hub/r0.png']);
  for (let i = 0; i < 5; i++) { f.visible(); f.tick(); }
  assert.equal(f.intervals.size, 0); assert.deepEqual(f.requests.map(r => r.signal.aborted), [false, false]);
  finishOriginal(); await settle(); f.visible(); f.tick();
  assert.equal(f.intervals.size, 0); assert.equal(f.requests.length, 2);
  finishRestyle(); await settle();
  assert.equal(f.urls.size, 2); assert.equal(f.intervals.size, 1);
  f.visible(); f.tick(); await settle();
  assert.deepEqual(f.frames().map(image => image.alt), ['anim/hub/o1.png', 'anim/hub/r1.png']);
  assert.deepEqual(f.requests.slice(2).map(r => r.key), ['anim/hub/o1.png', 'anim/hub/r1.png']);
  assert.deepEqual(f.requests.slice(2).map(r => r.signal.aborted), [false, false]);
  f.exit(); assert.equal(f.intervals.size, 0);
});

test('Pause stays paused across visibility changes until resume; a bad next frame clears/revokes previous pixels', async () => {
  const f = fixture(); await settle(); f.visible(); await settle();
  const button = f.elements.find(e => e.tag === 'button' && e.isConnected); button.fire('click'); const before = f.frameCalls().length;
  f.visible(false); f.visible(); await settle(); assert.equal(f.frameCalls().length, before); assert.equal(f.intervals.size, 0);
  button.fire('click'); await settle(); assert.equal(f.frameCalls().length, before + 2); assert.equal(f.intervals.size, 1); f.exit();
  const local = fixture({ hosted: false }), bad = new Map(local.data);
  bad.set('anim/hub/o1.png', encode('bad')); bad.set('anim/hub/r1.png', encode('bad'));
  local.select(bad); await settle(); local.visible(); await settle(); assert.equal(local.urls.size, 2);
  local.tick(); await settle(); assert.equal(local.urls.size, 0); assert.equal(local.revoked.length, 2);
  local.frames().forEach(image => { assert.equal(image.src, undefined); assert.match(image.alt, /SHA-256/); });
  assert.equal(local.frameCalls().length, 0); local.exit();
});

test('play demands frames without visibility, local mismatch is terminal and missing locals use matched hosted pins', async () => {
  const f = fixture(); await settle(); f.select(); await settle();
  f.elements.find(e => e.tag === 'button' && e.isConnected).fire('click'); // First click pauses the default playing state.
  f.elements.find(e => e.tag === 'button' && e.isConnected).fire('click'); await settle();
  assert.equal(f.frameCalls().length, 0); assert.equal(f.urls.size, 2);
  const corrupt = new Map(f.data); corrupt.set('anim/hub/o0.png', encode('corrupt'));
  f.select(corrupt); await settle(); f.visible(); await settle(); assert.match(f.ids['pack-status'].textContent, /SHA-256|verificeret/);
  assert.equal(f.frameCalls().length, 0); assert.match(f.frames()[0].alt, /SHA-256/); assert.equal(f.frames()[0].src, undefined, 'bad present local never hosts');
  const missing = new Map(f.data); missing.delete('anim/hub/o0.png'); f.select(missing); await settle(); f.visible(); await settle();
  assert.equal(f.frameCalls().length, 1); assert.equal(f.urls.size, 2);
  const conflict = new Map(missing), changed = structuredClone(f.index); changed.imageSha256['hub/o0.png'] = '0'.repeat(64);
  conflict.set('anim/index.json', encode(JSON.stringify(changed))); f.select(conflict); await settle(); f.visible(); await settle();
  assert.equal(f.frameCalls().length, 1, 'index/descriptor pin conflict requests no frame'); f.exit();
});

test('index hash/length/size/malformed and unsafe metadata reject before frames', async () => {
  for (const mode of ['hash','length','size','malformed','unsafe']) {
    const f = fixture({ hosted: false, malformed: mode === 'malformed' });
    if (mode === 'unsafe') { const index = structuredClone(f.index); index.items[0].id = '../escape'; f.data.set('anim/index.json', encode(JSON.stringify(index))); }
    if (mode === 'size') f.data.set('anim/index.json', new Uint8Array(2 * 1024 * 1024 + 1));
    if (mode === 'hash' || mode === 'length') { // Re-run hosted transport with the original descriptor pin.
      const h = fixture(); h.data.set('anim/index.json', encode(mode === 'hash' ? '[]' : '{} ')); await settle(); h.visible(); await settle();
      assert.equal(h.frameCalls().length, 0); assert.equal(h.urls.size, 0); h.exit();
    } else { f.select(); await settle(); f.visible(); await settle(); assert.equal(f.urls.size, 0); assert.equal(f.frameCalls().length, 0); }
    f.exit();
  }
});

test('stale local index and hosted frame cannot repaint after replacement, clear, offscreen or exit', async () => {
  const f = fixture({ hosted: false }); let finishIndex; const delayed = new Map(f.data);
  delayed.set('anim/index.json', new Promise(r => { finishIndex = r; })); f.select(delayed); f.select(); await settle();
  finishIndex(encode('{')); await settle(); f.visible(); await settle(); assert.equal(f.urls.size, 2); f.exit();
  const indexHost = fixture(); let releaseIndex; indexHost.delays.set('anim/index.json', new Promise(r => { releaseIndex = r; }));
  await settle(); indexHost.select(); await settle(); indexHost.visible(); await settle();
  const current = [...indexHost.urls.keys()]; releaseIndex(); await settle(); assert.deepEqual([...indexHost.urls.keys()], current); indexHost.exit();
  for (const action of ['replace','clear','pause','offscreen','exit']) {
    const h = fixture(); let finish; h.delays.set('anim/hub/o0.png', new Promise(r => { finish = r; })); await settle(); h.visible(); await settle();
    if (action === 'replace') { h.select(); await settle(); h.visible(); await settle(); }
    else if (action === 'clear') h.ids['clear-pack'].fire('click');
    else if (action === 'pause') h.elements.find(e => e.tag === 'button' && e.isConnected).fire('click');
    else if (action === 'offscreen') h.visible(false); else h.exit();
    const urls = [...h.urls.keys()]; finish(); await settle(); assert.deepEqual([...h.urls.keys()], urls, action + ' discards stale frame');
    if (action === 'exit') { assert.equal(h.urls.size, 0); h.observers.at(-1).cb([{ isIntersecting: true }]);
      await settle(); assert.equal(h.urls.size, 0); assert.equal(h.intervals.size, 0); } h.exit();
  }
});
