import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHostedRestyleReader, createImageDemandLoader, createLocalAssetPackEpoch, createLocalImageUrlCache, findHashMatchedCandidate, matchesLocalAssetSha256,
  normalizeLocalPackPath, readLocalThenHostedImageUrl, readPackSnapshot, readPinnedLocalAsset, readPinnedLocalOrFetch } from '../src/ui/localAssetPackCore.mjs';

test('normalizes paths relative to a selected Restyle folder without accepting traversal', () => {
  const hash = 'a'.repeat(64);
  assert.equal(normalizeLocalPackPath(`./restyle/cok-generated/images/${hash}.png`), `cok-generated/images/${hash}.png`);
  assert.equal(normalizeLocalPackPath('orig/CoK_01.png'), 'orig/CoK_01.png');
  for (const bad of ['', '../secret.png', 'orig/../../secret.png', 'C:/game.png', '/absolute.png', 'https://host/a.png', 'orig/name.']) {
    assert.equal(normalizeLocalPackPath(bad), null, bad);
  }
});

let hostNumber = 0;
const hostHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function hostedFixture(change = () => {}, body = new TextEncoder().encode('synthetic hosted image')) {
  const row = { path: 'restyle/cok/test.png', byteLength: body.length, sha256: hostHash(body) };
  const descriptor = { schema: 'greybox-hosted-restyle-pack-v1', fileCount: 1, totalBytes: body.length, files: [row] };
  change(descriptor);
  const pin = hostHash(JSON.stringify(descriptor)), wrapper = { descriptor, inventorySha256: pin };
  const base = `/host-${++hostNumber}/`, calls = [];
  const fixture = { pin, base, row, descriptor, wrapper, body, calls, response: null };
  fixture.reader = createHostedRestyleReader(pin, base, async (url) => {
    calls.push(url); return fixture.response ? fixture.response(url) : new Response(url.endsWith('hosted-restyle-pack.json') ? JSON.stringify(wrapper) : body);
  });
  return fixture;
}

test('a failed hosted descriptor is not cached; the next read retries and can succeed', async () => {
  const f = hostedFixture();
  let failNext = true;
  f.response = (url) => {
    if (url.endsWith('hosted-restyle-pack.json') && failNext) { failNext = false; return new Response('unavailable', { status: 503 }); }
    return new Response(url.endsWith('hosted-restyle-pack.json') ? JSON.stringify(f.wrapper) : f.body);
  };
  await assert.rejects(f.reader.read('restyle/cok/test.png', f.row.sha256));
  assert.deepEqual(await f.reader.read('restyle/cok/test.png', f.row.sha256), f.body);
  assert.equal(f.calls.filter(u => u.endsWith('hosted-restyle-pack.json')).length, 2, 'descriptor is refetched after a failure');
});

test('hosted descriptor is deployment-root-relative, canonical, cached once and never requested without a valid digest', async () => {
  for (const pin of [undefined, null, '', 'A'.repeat(64), 123]) {
    const reader = createHostedRestyleReader(pin, '/disabled/', () => { throw new Error('unexpected fetch'); });
    assert.equal(await reader.read('cok/test.png'), null);
  }
  const f = hostedFixture();
  const result = await Promise.all([f.reader.read('cok/test.png'), f.reader.read('restyle/cok/test.png', f.row.sha256)]);
  assert.deepEqual(result[0], f.body); assert.deepEqual(result[1], f.body);
  assert.equal(f.calls.filter(u => u.endsWith('hosted-restyle-pack.json')).length, 1);
  assert.equal(f.calls[0], `${f.base}hosted-restyle-pack.json`);
  assert.equal(f.calls[1], `${f.base}restyle/cok/test.png`);
});

test('invalid hosted digest/path/count/case/file collisions prevent every image request', async () => {
  const changes = [d => { d.schema = 'wrong'; }, d => { d.fileCount++; }, d => { d.totalBytes++; },
    d => { d.files[0].path = 'restyle/../test.png'; }, d => { d.files[0].path = 'restyle/SAVE/test.png'; },
    d => { d.files = [d.files[0], { ...d.files[0], path: 'restyle/cok/TEST.png' }].sort((a,b) => a.path < b.path ? -1 : 1); },
    d => { d.files = [{ ...d.files[0], path: 'restyle/a.json' }, { ...d.files[0], path: 'restyle/a.json/x.png' }]; }];
  for (const change of changes) { const f = hostedFixture(change);
    await assert.rejects(f.reader.read('cok/test.png')); assert.equal(f.calls.length, 1); }
  const f = hostedFixture(); f.wrapper.descriptor.totalBytes++;
  await assert.rejects(f.reader.read('cok/test.png'), /digest/); assert.equal(f.calls.length, 1);
  for (const field of ['row', 'wrapper']) { const g = hostedFixture();
    if (field === 'row') g.wrapper.descriptor.files[0].sha256 = '0'.repeat(64);
    else g.wrapper.inventorySha256 = '0'.repeat(64);
    await assert.rejects(g.reader.read('cok/test.png'), field === 'row' ? /digest/ : /Invalid hosted descriptor/); assert.equal(g.calls.length, 1);
  }
});

test('hosted descriptor cap and per-image streamed cap fail before decode', async () => {
  const f = hostedFixture(); f.response = () => new Response(new Uint8Array(2 * 1024 * 1024 + 1));
  await assert.rejects(f.reader.read('cok/test.png'), /limit/); assert.equal(f.calls.length, 1);
  const g = hostedFixture(d => { d.files[0].byteLength = 8 * 1024 * 1024 + 1; d.totalBytes = d.files[0].byteLength; });
  await assert.rejects(g.reader.read('cok/test.png'), /limit/); assert.equal(g.calls.length, 1);
  const h = hostedFixture(); h.response = url => url.endsWith('.json') ? new Response(JSON.stringify(h.wrapper)) : new Response(new ReadableStream({
    start(c) { for (let i=0;i<9;i++) c.enqueue(new Uint8Array(1024 * 1024)); c.close(); } }));
  await assert.rejects(h.reader.read('cok/test.png'), /limit/);
});

test('hosted caller-pin conflict requests no image; byte hash and length mismatches reject', async () => {
  const f = hostedFixture(); await assert.rejects(f.reader.read('cok/test.png', '0'.repeat(64)), /pin/); assert.equal(f.calls.length, 1);
  for (const mismatch of [new Uint8Array(f.body.length), new Uint8Array(f.body.length + 1)]) {
    const g = hostedFixture(); g.response = url => new Response(url.endsWith('.json') ? JSON.stringify(g.wrapper) : mismatch);
    await assert.rejects(g.reader.read('cok/test.png'), /bytes mismatch/);
  }
});

test('animation index has one exact JSON path with its own hash/length/size and syntax gate', async () => {
  for (const mode of ['valid', 'hash', 'length', 'large', 'malformed']) {
    const body = new TextEncoder().encode(mode === 'malformed' ? '{' : '{}');
    const f = hostedFixture(d => { d.files[0].path = 'restyle/anim/index.json';
      if (mode === 'large') { d.files[0].byteLength = 2 * 1024 * 1024 + 1; d.totalBytes = d.files[0].byteLength; } }, body);
    assert.equal(await f.reader.read('anim/index.json'), null); assert.equal(await f.reader.read('other.json'), null);
    assert.equal(f.calls.length, 0, 'ordinary read remains PNG-only');
    if (mode === 'hash' || mode === 'length') f.response = url => new Response(url.endsWith('hosted-restyle-pack.json')
      ? JSON.stringify(f.wrapper) : mode === 'hash' ? '[]' : '{} ');
    if (mode === 'valid') assert.deepEqual(await f.reader.readAnimationIndex(), body);
    else await assert.rejects(f.reader.readAnimationIndex());
    assert.ok(f.calls.every(url => url.endsWith('hosted-restyle-pack.json') || url.endsWith('restyle/anim/index.json')));
    if (mode === 'large') assert.equal(f.calls.length, 1);
  }
});

test('valid local wins with no hosted fetch, bad local is terminal, only missing local falls back', async () => {
  const f = hostedFixture(), read = local => readPinnedLocalOrFetch(local, 'cok/test.png', f.row.sha256, '/unused', 1024,
    undefined, 'test', false, () => true, f.reader);
  assert.deepEqual(await read(async () => f.body), f.body); assert.equal(f.calls.length, 0);
  await assert.rejects(read(async () => new Uint8Array(f.body.length)), /Local image SHA/); assert.equal(f.calls.length, 0);
  assert.deepEqual(await read(async () => null), f.body); assert.equal(f.calls.length, 2);
});

test('hosted descriptor/image pending results honor revision and abort before URL creation', async () => {
  for (const phase of ['descriptor','image']) {
    const f = hostedFixture(), epoch = createLocalAssetPackEpoch(null), snapshot = epoch.snapshot(); let finish;
    f.response = url => ((phase === 'descriptor') === url.endsWith('.json')) ? new Promise(r => { finish = r; }) : new Response(JSON.stringify(f.wrapper));
    const reading = f.reader.read('cok/test.png', undefined, undefined, () => epoch.isCurrent(snapshot));
    while (!finish) await new Promise(r => setImmediate(r)); epoch.replace(phase === 'descriptor' ? null : { readPath: async () => null });
    finish(new Response(phase === 'descriptor' ? JSON.stringify(f.wrapper) : f.body));
    await assert.rejects(reading, /canceled/); if (phase === 'descriptor') assert.equal(f.calls.length, 1);
  }
  const f = hostedFixture(), signal = AbortSignal.abort(); await assert.rejects(f.reader.read('cok/test.png', undefined, signal), /canceled/); assert.equal(f.calls.length, 0);
});

test('gallery demand adapter starts verified network work only on intersection', async () => {
  const f = hostedFixture(); let callback, observed, unobserved, finish;
  const queue = createImageDemandLoader(class { constructor(cb) { callback = cb; } observe(i) { observed = i; } unobserve(i) { unobserved = i; } });
  const image = { isConnected: true }, loaded = new Promise(r => { finish = r; });
  queue(image, () => { void f.reader.read('cok/test.png').then(finish); });
  assert.equal(observed, image); assert.equal(f.calls.length, 0);
  callback([{ target: image, isIntersecting: false }]); assert.equal(f.calls.length, 0);
  callback([{ target: image, isIntersecting: true }]); assert.deepEqual(await loaded, f.body);
  assert.equal(unobserved, image); assert.equal(f.calls.length, 2);
});

test('hosted URLs without a local folder are epoch-owned and revoked on clear/replace', async () => {
  const f = hostedFixture(), epoch = createLocalAssetPackEpoch(null), revoked = [];
  const cache = createLocalImageUrlCache({ createUrl: () => 'blob:hosted', revokeUrl: u => revoked.push(u), matchesHash: matchesLocalAssetSha256 });
  const snapshot = epoch.snapshot(); cache.replace(snapshot.revision);
  assert.equal(await cache.get(snapshot, epoch.isCurrent, ['cok/test.png'], f.row.sha256, () => f.reader.read('cok/test.png')), 'blob:hosted');
  epoch.replace(null); cache.replace(epoch.snapshot().revision); assert.deepEqual(revoked, ['blob:hosted']);
  let finish; const next = epoch.snapshot(); const pending = cache.get(next, epoch.isCurrent, ['next.png'], null, () => new Promise(r => { finish = r; }));
  epoch.replace({ readPath: async () => null }); cache.replace(epoch.snapshot().revision); finish(f.body);
  assert.equal(await pending, null); assert.deepEqual(revoked, ['blob:hosted']);
});

test('all local candidates precede hosted fallback and unknown host paths stay missing', async () => {
  const f = hostedFixture(), epoch = createLocalAssetPackEpoch(null);
  const cache = createLocalImageUrlCache({ createUrl: () => 'blob:verified', revokeUrl: () => {}, matchesHash: matchesLocalAssetSha256 });
  const paths = ['missing.png', 'cok/test.png'], readHost = (_s, path) => f.reader.read(path, f.row.sha256);
  assert.equal(await readLocalThenHostedImageUrl(cache, epoch.snapshot(), epoch.isCurrent, paths, f.row.sha256,
    async (_s, path) => path === 'cok/test.png' ? f.body : null, readHost), 'blob:verified');
  assert.equal(f.calls.length, 0, 'valid second local candidate prevents descriptor and image requests');
  epoch.replace(null); cache.replace(epoch.snapshot().revision);
  assert.equal(await readLocalThenHostedImageUrl(cache, epoch.snapshot(), epoch.isCurrent, paths, f.row.sha256,
    async () => null, readHost), 'blob:verified'); assert.equal(f.calls.length, 2);
});

test('otherwise unpinned local images use listed descriptor pins without fetching images', async () => {
  for (const mode of ['valid', 'corrupt', 'unlisted']) {
    const f = hostedFixture(), epoch = createLocalAssetPackEpoch(null), path = mode === 'unlisted' ? 'private.png' : 'cok/test.png';
    const cache = createLocalImageUrlCache({ createUrl: () => 'blob:local', revokeUrl: () => {}, matchesHash: matchesLocalAssetSha256 });
    const reading = readLocalThenHostedImageUrl(cache, epoch.snapshot(), epoch.isCurrent, [path], undefined,
      async () => mode === 'corrupt' ? new Uint8Array(f.body.length) : f.body, (_s,p) => f.reader.read(p), p => f.reader.pin(p));
    if (mode === 'corrupt') await assert.rejects(reading, /Local image SHA/); else assert.equal(await reading, 'blob:local');
    assert.equal(f.calls.length, 1); assert.ok(f.calls[0].endsWith('hosted-restyle-pack.json'), 'descriptor only, never image fallback');
  }
});

test('cached hosted A cannot shadow a later local B; both URL namespaces revoke safely', async () => {
  const f = hostedFixture(), epoch = createLocalAssetPackEpoch(null), revoked = [], reads = []; let next = 0;
  const cache = createLocalImageUrlCache({ createUrl: () => `blob:${++next}`, revokeUrl: u => revoked.push(u), matchesHash: matchesLocalAssetSha256 });
  const readLocal = async (_s, path) => { reads.push(path); return path === 'B.png' ? f.body : null; };
  const load = paths => readLocalThenHostedImageUrl(cache, epoch.snapshot(), epoch.isCurrent, paths, f.row.sha256,
    readLocal, (_s, path) => f.reader.read(path, f.row.sha256));
  assert.equal(await load(['cok/test.png']), 'blob:1'); assert.equal(f.calls.length, 2);
  reads.length = 0;
  assert.equal(await load(['cok/test.png', 'B.png']), 'blob:2');
  assert.deepEqual(reads, ['cok/test.png', 'B.png']); assert.equal(f.calls.length, 2, 'local B causes no hosted image request');
  assert.equal(await load(['cok/test.png']), 'blob:1'); assert.equal(f.calls.length, 2, 'hosted cache remains reusable after local misses');
  epoch.replace(null); cache.replace(epoch.snapshot().revision); assert.deepEqual(revoked, ['blob:1', 'blob:2']);
});

test('accepts a local image only when its bytes match the expected SHA-256', async () => {
  const bytes = new TextEncoder().encode('verified local image bytes');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(await matchesLocalAssetSha256(bytes, sha256), true);
  assert.equal(await matchesLocalAssetSha256(bytes, '0'.repeat(64)), false);
  assert.equal(await matchesLocalAssetSha256(bytes, 'not-a-hash'), false);
});

test('reads the exact pinned local player asset and rejects a present hash mismatch', async () => {
  const bytes = new TextEncoder().encode('local player PNG fixture');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const reads = [];
  const reader = async (path) => { reads.push(path); return path === 'cok/player/id/restyle/HEAD.png' ? bytes : null; };
  assert.deepEqual([...await readPinnedLocalAsset(reader, './restyle/cok/player/id/restyle/HEAD.png', sha256)], [...bytes]);
  assert.equal(await readPinnedLocalAsset(reader, 'cok/player/id/original/missing.png', sha256), null);
  await assert.rejects(readPinnedLocalAsset(reader, 'cok/player/id/restyle/HEAD.png', '0'.repeat(64)), /SHA-256 mismatch/);
  assert.deepEqual(reads, ['cok/player/id/restyle/HEAD.png', 'cok/player/id/original/missing.png', 'cok/player/id/restyle/HEAD.png']);
});

test('prefers verified local runtime art, falls back only when absent and rejects bad local bytes', async () => {
  const localBytes = new TextEncoder().encode('user-owned runtime image');
  const fallbackBytes = new TextEncoder().encode('packaged fallback image');
  const hash = createHash('sha256').update(localBytes).digest('hex');
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response(fallbackBytes, { status: 200, headers: { 'content-length': String(fallbackBytes.length) } });
  };
  try {
    const local = await readPinnedLocalOrFetch(async () => localBytes, 'cok/pic.png', hash, '/restyle/cok/pic.png', 1024);
    assert.deepEqual([...local], [...localBytes]);
    assert.equal(requests, 0, 'verified local bytes take precedence');
    const fallbackHash = createHash('sha256').update(fallbackBytes).digest('hex');
    const fallback = await readPinnedLocalOrFetch(async () => null, 'cok/pic.png', fallbackHash, '/restyle/cok/pic.png', 1024);
    assert.deepEqual([...fallback], [...fallbackBytes]);
    assert.equal(requests, 1, 'packaged fetch is used only when the local file is absent');
    await assert.rejects(readPinnedLocalOrFetch(async () => null, 'cok/pic.png', hash, '/restyle/cok/pic.png', 1024), /SHA-256 mismatch/,
      'development fallback bytes must match the pinned digest');
    assert.equal(requests, 2, 'the unverified packaged bytes are fetched but rejected');
    await assert.rejects(readPinnedLocalOrFetch(async () => fallbackBytes, 'cok/pic.png', hash, '/restyle/cok/pic.png', 1024), /SHA-256 mismatch/);
    assert.equal(requests, 2, 'bad local bytes fail closed without network fallback');
    await assert.rejects(readPinnedLocalOrFetch(async () => null, 'cok/pic.png', hash, '/restyle/cok/pic.png', 1), /size limit/);
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(7)); controller.enqueue(new Uint8Array(7)); controller.close(); },
    }), { status: 200 });
    await assert.rejects(readPinnedLocalOrFetch(async () => null, 'cok/pic.png', hash, '/restyle/cok/pic.png', 10), /size limit/,
      'actual streamed size is bounded when Content-Length is absent');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('production policy rejects missing local runtime art without requesting the packaged URL', async () => {
  const bytes = new TextEncoder().encode('user-owned runtime image');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('packaged image fetch is forbidden'); };
  try {
    await assert.rejects(
      readPinnedLocalOrFetch(null, 'cok/combat/picture.png', hash, '/restyle/cok/combat/picture.png',
        1024, undefined, 'CoK combat Restyle', false),
      /select the local Restyle image folder/,
    );
    assert.equal(requests, 0);

    const local = await readPinnedLocalOrFetch(async () => bytes, 'cok/combat/picture.png', hash,
      '/restyle/cok/combat/picture.png', 1024, undefined, 'CoK combat Restyle', false);
    assert.deepEqual([...local], [...bytes]);
    assert.equal(requests, 0, 'exact local images load without a network request');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a replaced pack cannot start the development fetch after a pending local miss', async () => {
  const bytes = new TextEncoder().encode('pinned runtime image');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const originalFetch = globalThis.fetch;
  let requests = 0, finishLocal, current = true;
  globalThis.fetch = async () => { requests++; throw new Error('stale pack started a fallback fetch'); };
  try {
    const loading = readPinnedLocalOrFetch(() => new Promise((resolve) => { finishLocal = resolve; }),
      'cok/pic.png', hash, '/restyle/cok/pic.png', 1024, undefined, 'CoK combat Restyle', true, () => current);
    current = false;
    finishLocal(null);
    await assert.rejects(loading, /folder changed/);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('tries duplicate archive basenames until the exact edition hash matches', async () => {
  const wrong = new TextEncoder().encode('disk one archive');
  const right = new TextEncoder().encode('disk two archive');
  const expected = createHash('sha256').update(right).digest('hex');
  const files = [{ name: '8X8D1.DAX', bytes: wrong }, { name: '8x8d1.dax', bytes: right }];
  const result = await findHashMatchedCandidate(files, expected, async (file, hash) =>
    await matchesLocalAssetSha256(file.bytes, hash) ? file.bytes : null);
  assert.deepEqual([...result], [...right]);
});

test('pack snapshots discard bytes from a replaced or cleared selection and same-pack reselection advances the epoch', async () => {
  let finish;
  const oldPack = { label: 'old', readPath: () => new Promise((resolve) => { finish = resolve; }) };
  const epoch = createLocalAssetPackEpoch(null);
  const firstRevision = epoch.replace(oldPack);
  const snapshot = epoch.snapshot();
  const read = readPackSnapshot(snapshot, epoch.isCurrent, 'image.png');
  epoch.replace({ label: 'new', readPath: async () => new Uint8Array([2]) });
  finish(new Uint8Array([1]));
  assert.equal(await read, null, 'an old pack read cannot escape after replacement');
  const retryRevision = epoch.replace(epoch.snapshot().pack);
  assert.ok(retryRevision > firstRevision, 'reselecting the same folder is an explicit retry');
  const clearSnapshot = epoch.snapshot();
  let resolveCleared;
  const pendingPack = { label: 'pending', readPath: () => new Promise((resolve) => { resolveCleared = resolve; }) };
  epoch.replace(pendingPack);
  const clearedRead = readPackSnapshot(epoch.snapshot(), epoch.isCurrent, 'image.png');
  epoch.replace(null);
  resolveCleared(new Uint8Array([3]));
  assert.equal(await clearedRead, null, 'clear invalidates reads already in flight');
  assert.equal(await readPackSnapshot(clearSnapshot, epoch.isCurrent, 'image.png'), null);
});

test('image URL cache coalesces concurrent reads, drops A→B and A→clear completions, and revokes owned URLs', async () => {
  const epoch = createLocalAssetPackEpoch(null);
  const created = [], revoked = [];
  let nextUrl = 0;
  const cache = createLocalImageUrlCache({
    createUrl: (bytes) => { const url = `blob:${++nextUrl}:${bytes[0]}`; created.push(url); return url; },
    revokeUrl: (url) => revoked.push(url), matchesHash: async () => true,
  });
  cache.replace(epoch.snapshot().revision);
  let finishA, readsA = 0;
  const packA = { label: 'A', readPath: () => { readsA++; return new Promise((resolve) => { finishA = resolve; }); } };
  epoch.replace(packA); cache.replace(epoch.snapshot().revision);
  const snapshotA = epoch.snapshot();
  const readA = (snapshot, path) => readPackSnapshot(snapshot, epoch.isCurrent, path);
  const oldA = cache.get(snapshotA, epoch.isCurrent, ['art.png'], null, readA);
  const duplicateA = cache.get(snapshotA, epoch.isCurrent, ['art.png'], null, readA);
  await Promise.resolve();
  assert.equal(readsA, 1, 'concurrent identical requests share one in-flight read');
  epoch.replace({ label: 'B', readPath: async () => new Uint8Array([2]) }); cache.replace(epoch.snapshot().revision);
  const snapshotB = epoch.snapshot();
  const imageB = await cache.get(snapshotB, epoch.isCurrent, ['art.png'], null, readA);
  finishA(new Uint8Array([1]));
  assert.deepEqual(await Promise.all([oldA, duplicateA]), [null, null]);
  assert.equal(imageB, 'blob:1:2');
  assert.deepEqual(created, ['blob:1:2'], 'stale pack A never creates a usable URL');
  epoch.replace(null); cache.replace(epoch.snapshot().revision);
  assert.deepEqual(revoked, ['blob:1:2']);
  assert.equal(await cache.get(snapshotB, epoch.isCurrent, ['art.png'], null, readA), null,
    'a cleared pack revision cannot return a cached URL');
});

test('image URL cache checks pack revision after asynchronous hash verification', async () => {
  const epoch = createLocalAssetPackEpoch(null), created = [], revoked = [];
  let verify;
  const cache = createLocalImageUrlCache({
    createUrl: (bytes) => { const url = `blob:${bytes[0]}`; created.push(url); return url; },
    revokeUrl: (url) => revoked.push(url), matchesHash: () => new Promise((resolve) => { verify = resolve; }),
  });
  epoch.replace({ label: 'A', readPath: async () => new Uint8Array([1]) }); cache.replace(epoch.snapshot().revision);
  const snapshotA = epoch.snapshot();
  const pending = cache.get(snapshotA, epoch.isCurrent, ['art.png'], 'a'.repeat(64),
    (snapshot, path) => readPackSnapshot(snapshot, epoch.isCurrent, path));
  await Promise.resolve(); await Promise.resolve();
  epoch.replace({ label: 'B', readPath: async () => new Uint8Array([2]) }); cache.replace(epoch.snapshot().revision);
  verify(true);
  assert.equal(await pending, null);
  assert.deepEqual(created, []);
  assert.deepEqual(revoked, []);
});
