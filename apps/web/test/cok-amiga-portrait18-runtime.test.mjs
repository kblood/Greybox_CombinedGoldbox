import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server;
let runtime;
let catalog;
let source;
before(async () => {
  server = await createServer({
    configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), base: '/greybox/',
    server: { middlewareMode: true, hmr: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, ssr: { noExternal: ['@goldbox/engine'] },
  });
  runtime = await server.ssrLoadModule('/src/ui/cokAmigaPortrait18Runtime.ts');
  catalog = await server.ssrLoadModule('/src/ui/catalog.ts');
  source = (await server.ssrLoadModule('/src/ui/cokAmigaPortrait18Art.ts')).COK_AMIGA_PORTRAIT_18_SOURCE;
});
after(async () => { await server?.close(); });

function globals(t, replacements) {
  for (const [key, value] of Object.entries(replacements)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  }
}

function responseOf(chunks, headers = {}, status = 200) {
  let cancelled = 0;
  let next = 0;
  const response = new Response(new ReadableStream({
    pull(controller) {
      if (next < chunks.length) controller.enqueue(chunks[next++]);
      else controller.close();
    },
    cancel() { cancelled++; },
  }), { headers, status });
  return { response, cancelled: () => cancelled };
}

function noNetwork(t) {
  let count = 0;
  globals(t, { fetch: async () => { count++; throw new Error('Unexpected bundled fetch'); } });
  return () => count;
}

test('descriptor construction is lazy and has the exact source-qualified geometry', (t) => {
  let reads = 0;
  noNetwork(t);
  const scene = runtime.cokAmigaPortrait18SceneArt(async () => { reads++; return { ok: false, reason: 'missing' }; });
  assert.equal(reads, 0);
  assert.deepEqual(scene.ref, { game: 'cok', logicalId: 'amiga.pic1.18', frame: 0 });
  assert.equal(scene.source, source);
  assert.equal(scene.pictureId, 18);
  assert.equal(scene.comparisonId, 'amiga_pic1_018_f0');
  assert.deepEqual([scene.pixelScale, scene.x, scene.y], [16, 24, 24]);
  assert.deepEqual(scene.amigaOrigin, { x: 24, y: 24 });
  assert.equal(scene.loadRestyle, runtime.loadCokAmigaPortrait18Restyle);
  assert.equal(scene.amigaOriginal, undefined);
});

test('Amiga #18 binds only to the exact reviewed DOS PIC1.DAX #18 base identity', (t) => {
  noNetwork(t);
  const expected = { game: 'cok', system: 'DOS-EGA', archive: 'PIC1.DAX',
    archiveSha256: '2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97',
    blockId: 18, frameIndex: 0 };
  assert.equal(runtime.matchesCokAmigaPortrait18BaseSource(expected), true);
  for (const patch of [{ game: 'dok' }, { system: 'Amiga' }, { archive: 'BIGPIC1.DAX' },
    { archiveSha256: '0'.repeat(64) }, { blockId: 17 }, { frameIndex: 1 }]) {
    assert.equal(runtime.matchesCokAmigaPortrait18BaseSource({ ...expected, ...patch }), false, JSON.stringify(patch));
  }
  assert.equal(runtime.matchesCokAmigaPortrait18BaseSource(null), false);
});

test('lazy original loader surfaces failed admission and rejects wrong-source success', async (t) => {
  noNetwork(t);
  const failed = runtime.cokAmigaPortrait18SceneArt(async () => ({ ok: false, reason: 'selected source absent' }));
  await assert.rejects(failed.loadAmigaOriginal(), /selected source absent/);
  const foreign = runtime.cokAmigaPortrait18SceneArt(async () => ({ ok: true,
    source: { ...source, system: 'DOS-EGA' }, original: { width: 88, height: 88 } }));
  await assert.rejects(foreign.loadAmigaOriginal(), /identity\/geometry/);
});

test('selected install reads only PIC1.DAA and never falls back for missing, foreign or failed reads', async (t) => {
  const networkCalls = noNetwork(t);
  for (const read of [async () => null, async () => new Uint8Array(165455),
    async () => { throw new Error('selected read failed'); }]) {
    const calls = [];
    const result = await runtime.loadCokAmigaPortrait18Source({ async readAsset(name) { calls.push(name); return read(); } });
    assert.deepEqual(calls, ['PIC1.DAA']);
    assert.equal(result.ok, false);
    assert.match(result.reason, /no PIC1.DAA|archive SHA-256|selected read failed/);
  }
  assert.equal(networkCalls(), 0);
});

test('no install resolves the known bundled archive through catalog, with no guessed alternate', async (t) => {
  const urls = [];
  globals(t, { fetch: async (url) => { urls.push(url); return new Response(null, { status: 404 }); } });
  const result = await runtime.loadCokAmigaPortrait18Source();
  assert.equal(result.ok, false);
  assert.match(result.reason, /HTTP 404/);
  const asset = catalog.CATALOG.find((game) => game.id === 'cok-amiga').assets.find((item) => item.id === 'cok-amiga-pic1');
  assert.deepEqual(urls, [catalog.assetUrl(asset.path)]);
});

for (const headers of [{}, { 'content-length': '1' }, { 'content-length': 'invalid' }]) {
  test(`Restyle stops actual body above 8MiB despite headers ${JSON.stringify(headers)}`, async (t) => {
    // Leave unread data beyond the first oversized chunk so cancellation is observable.
    const body = responseOf(Array.from({ length: 10 }, () => new Uint8Array(1024 * 1024)), headers);
    let decodes = 0;
    const urls = [];
    globals(t, { fetch: async (url) => { urls.push(url); return body.response; },
      createImageBitmap: async () => { decodes++; throw new Error('must not decode oversized body'); } });
    await assert.rejects(runtime.loadCokAmigaPortrait18Restyle(), /exceeds size limit/);
    assert.deepEqual(urls, ['/greybox/restyle/cok/dialogue/AMIGA_PIC1_018_f0_restyle.png']);
    assert.equal(body.cancelled(), 1);
    assert.equal(decodes, 0);
  });
}

test('Restyle rejects oversized Content-Length, missing body, HTTP errors and stream failure', async (t) => {
  let response;
  globals(t, { fetch: async () => response });
  const huge = responseOf([new Uint8Array(4)], { 'content-length': String(8 * 1024 * 1024 + 1) });
  response = huge.response;
  await assert.rejects(runtime.loadCokAmigaPortrait18Restyle(), /size limit/);
  assert.equal(huge.cancelled(), 1);
  response = new Response(null);
  await assert.rejects(runtime.loadCokAmigaPortrait18Restyle(), /body unavailable/);
  response = new Response(null, { status: 503 });
  await assert.rejects(runtime.loadCokAmigaPortrait18Restyle(), /HTTP 503/);
  response = new Response(new ReadableStream({ start(controller) { controller.error(new Error('stream failed')); } }));
  await assert.rejects(runtime.loadCokAmigaPortrait18Restyle(), /stream failed/);
});

test('unreviewed PNG bytes fail validation before bitmap decoding', async (t) => {
  let decodes = 0;
  globals(t, { fetch: async () => new Response(new Uint8Array(2726186)),
    createImageBitmap: async () => { decodes++; throw new Error('unreviewed pixels decoded'); } });
  await assert.rejects(runtime.loadCokAmigaPortrait18Restyle(), /SHA-256 mismatch/);
  assert.equal(decodes, 0);
});

const archivePath = process.env.GB_COK_AMIGA_18_ARCHIVE
  ?? 'C:/GoldBoxImg/batch03_work/dist-app-b3-cpic-runtime-20261027/assets/amiga_extracted/ChampionsOfKrynn/disk2/pic1.daa';
const importPath = process.env.GB_COK_AMIGA_18_IMPORT
  ?? 'C:/GoldBoxImg/batch02_review/pic1_018_v3_import/036_cok_amiga_daa_cok_pic1_pic1_018_f0.png';

test('pinned archive fixture: lazy selected original stays captured and verifies source',
  { skip: !existsSync(archivePath) && 'GB_COK_AMIGA_18_ARCHIVE fixture missing' }, async (t) => {
    const networkCalls = noNetwork(t);
    let finish;
    const pendingRead = new Promise((done) => { finish = done; });
    let calls = 0;
    const selected = { async readAsset(name) { assert.equal(name, 'PIC1.DAA'); calls++; return pendingRead; } };
    const scene = runtime.cokAmigaPortrait18SceneArt(() => runtime.loadCokAmigaPortrait18Source(selected));
    assert.equal(calls, 0);
    const pending = scene.loadAmigaOriginal();
    assert.equal(calls, 1);
    finish(new Uint8Array(readFileSync(archivePath)));
    const admitted = await pending;
    assert.deepEqual(admitted.source, source);
    assert.deepEqual([admitted.image.width, admitted.image.height], [88, 88]);
    assert.equal(networkCalls(), 0);
  });

test('pinned archive fixture: bundled source uses only the catalog URL and admits its bytes',
  { skip: !existsSync(archivePath) && 'GB_COK_AMIGA_18_ARCHIVE fixture missing' }, async (t) => {
    const urls = [];
    globals(t, { fetch: async (url) => { urls.push(url); return new Response(readFileSync(archivePath)); } });
    assert.equal((await runtime.loadCokAmigaPortrait18Source()).ok, true);
    assert.equal(urls.length, 1);
    assert.equal(urls[0], catalog.assetUrl('amiga_extracted/ChampionsOfKrynn/disk2/pic1.daa'));
  });

function bitmapHarness(t, { width = 1408, height = 1408, canvasFailure = false } = {}) {
  let closes = 0;
  let draws = 0;
  let decodedBlob;
  const pixels = new Uint8ClampedArray(1408 * 1408 * 4);
  pixels[0] = 91;
  const context = { drawImage() { draws++; }, getImageData() { return { data: pixels }; } };
  globals(t, {
    fetch: async () => new Response(readFileSync(importPath)),
    createImageBitmap: async (blob) => { decodedBlob = blob; return { width, height, close() { closes++; } }; },
    document: { createElement(name) { assert.equal(name, 'canvas');
      return { getContext() { return canvasFailure ? null : context; } }; } },
  });
  return { closes: () => closes, draws: () => draws, blob: () => decodedBlob, pixels };
}

test('approved PNG fixture: validated bytes reach bitmap unchanged, return owned pixels, close success',
  { skip: !existsSync(importPath) && 'GB_COK_AMIGA_18_IMPORT fixture missing' }, async (t) => {
    const harness = bitmapHarness(t);
    const art = await runtime.loadCokAmigaPortrait18Restyle();
    assert.deepEqual(new Uint8Array(await harness.blob().arrayBuffer()), new Uint8Array(readFileSync(importPath)));
    assert.deepEqual([art.width, art.height], [1408, 1408]);
    assert.equal(art.pixels[0], 91);
    harness.pixels[0] = 0;
    assert.equal(art.pixels[0], 91);
    assert.equal(harness.draws(), 1);
    assert.equal(harness.closes(), 1);
  });

for (const scenario of [{ width: 1407 }, { height: 1407 }, { canvasFailure: true }]) {
  test(`approved PNG fixture: bitmap closes on decoded failure ${JSON.stringify(scenario)}`,
    { skip: !existsSync(importPath) && 'GB_COK_AMIGA_18_IMPORT fixture missing' }, async (t) => {
      const harness = bitmapHarness(t, scenario);
      await assert.rejects(runtime.loadCokAmigaPortrait18Restyle(), /geometry differs|canvas unavailable/);
      assert.equal(harness.closes(), 1);
    });
}
