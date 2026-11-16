/** Validate a path relative to the user-selected restyle/ folder. */
export function normalizeLocalPackPath(candidate) {
  let path = String(candidate).replace(/\\/g, '/').replace(/^\.\//, '');
  if (path.startsWith('restyle/')) path = path.slice('restyle/'.length);
  if (!path || /[\x00-\x1f:]/.test(path)) return null;
  const segments = path.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part))) return null;
  return path;
}

export async function matchesLocalAssetSha256(bytes, expectedSha256) {
  if (!/^[0-9a-f]{64}$/i.test(expectedSha256)) return false;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return actual === expectedSha256.toLowerCase();
}

/** Read an exact local pack path and reject present files whose bytes differ from their pin. */
export async function readPinnedLocalAsset(readPath, path, expectedSha256) {
  const normalized = normalizeLocalPackPath(path);
  if (!normalized || !/^[0-9a-f]{64}$/i.test(expectedSha256)) return null;
  const bytes = await readPath(normalized);
  if (!bytes) return null;
  if (!await matchesLocalAssetSha256(bytes, expectedSha256)) {
    throw new Error(`Local image SHA-256 mismatch: ${normalized}`);
  }
  return bytes;
}

/** Prefer an exact hash-pinned local file, otherwise use the packaged URL with a strict size cap. */
export async function readPinnedLocalOrFetch(readPath, localPath, expectedSha256, url, maxBytes, signal,
  label = 'Runtime image', allowDevelopmentFallback = true, isCurrent = () => true, hostedReader) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 33) throw new Error('Invalid runtime image size limit');
  const local = readPath ? await readPinnedLocalAsset(readPath, localPath, expectedSha256) : null;
  if (!isCurrent()) throw new Error(`${label} canceled because the selected image folder changed`);
  if (local) {
    if (local.byteLength > maxBytes) throw new Error(`${label} exceeds size limit: ${localPath}`);
    return local;
  }
  const hosted = hostedReader ? await hostedReader.read(localPath, expectedSha256, signal, isCurrent) : null;
  if (!isCurrent() || signal?.aborted) throw new Error(`${label} canceled`);
  if (hosted) {
    if (hosted.byteLength > maxBytes) throw new Error(`${label} exceeds size limit`);
    return hosted;
  }
  if (!allowDevelopmentFallback) {
    throw new Error(`${label} unavailable: select the local Restyle image folder (missing ${localPath})`);
  }
  if (!isCurrent()) throw new Error(`${label} canceled because the selected image folder changed`);
  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`${label} unavailable (HTTP ${response.status})`);
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error(`${label} exceeds size limit`);
  }
  if (!response.body) throw new Error(`${label} response body unavailable`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxBytes - size) {
        await reader.cancel();
        throw new Error(`${label} exceeds size limit`);
      }
      size += value.byteLength;
      chunks.push(new Uint8Array(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (!await matchesLocalAssetSha256(bytes, expectedSha256)) throw new Error(`${label} SHA-256 mismatch: ${localPath}`);
  return bytes;
}

export async function findHashMatchedCandidate(candidates, expectedSha256, readCandidate) {
  if (!/^[0-9a-f]{64}$/i.test(expectedSha256)) return null;
  for (const candidate of candidates) {
    const bytes = await readCandidate(candidate, expectedSha256.toLowerCase());
    if (bytes) return bytes;
  }
  return null;
}

/** A user pack is a lease: every selection, clear, and same-folder retry advances its revision. */
export function createLocalAssetPackEpoch(initialPack = null) {
  let pack = initialPack;
  let revision = 0;
  return Object.freeze({
    snapshot: () => Object.freeze({ pack, revision }),
    replace: (nextPack) => { pack = nextPack; revision++; return revision; },
    isCurrent: (snapshot) => snapshot?.revision === revision && snapshot?.pack === pack,
  });
}

/** Resolve cached object URLs only for the pack revision that supplied their bytes. */
export function createLocalImageUrlCache({ createUrl, revokeUrl, matchesHash }) {
  if (typeof createUrl !== 'function' || typeof revokeUrl !== 'function' || typeof matchesHash !== 'function') {
    throw new TypeError('Local image URL cache requires URL and hash adapters');
  }
  let revision = 0;
  const urls = new Map();
  const pending = new Map();
  const release = () => {
    for (const url of urls.values()) revokeUrl(url);
    urls.clear();
    pending.clear();
  };
  return Object.freeze({
    replace: (nextRevision) => { release(); revision = nextRevision; },
    async get(snapshot, isCurrent, candidates, expectedSha256, readPath, resolveExpected, provenance = 'local') {
      if (!snapshot || snapshot.revision !== revision || !isCurrent(snapshot)) return null;
      for (const path of candidates) {
        let expected = expectedSha256?.toLowerCase()
          ?? path.match(/(?:^|\/)([0-9a-f]{64})\.png$/i)?.[1]?.toLowerCase();
        const key = `${provenance}\0${snapshot.revision}\0${path.toLowerCase()}\0${expected ?? ''}`;
        const cached = urls.get(key);
        if (cached) return isCurrent(snapshot) && snapshot.revision === revision ? cached : null;
        let request = pending.get(key);
        if (!request) {
          request = (async () => {
            const bytes = await readPath(snapshot, path);
            if (!bytes || !isCurrent(snapshot) || snapshot.revision !== revision) return null;
            if (!expected && resolveExpected) expected = await resolveExpected(path) ?? undefined;
            if (expected && !await matchesHash(bytes, expected)) throw new Error(`Local image SHA-256 mismatch: ${path}`);
            if (!isCurrent(snapshot) || snapshot.revision !== revision) return null;
            const url = createUrl(bytes);
            if (!isCurrent(snapshot) || snapshot.revision !== revision) { revokeUrl(url); return null; }
            const existing = urls.get(key);
            if (existing) { revokeUrl(url); return existing; }
            urls.set(key, url);
            return url;
          })().finally(() => { if (pending.get(key) === request) pending.delete(key); });
          pending.set(key, request);
        }
        const url = await request;
        if (url) return isCurrent(snapshot) && snapshot.revision === revision ? url : null;
        if (!isCurrent(snapshot) || snapshot.revision !== revision) return null;
      }
      return null;
    },
  });
}

export async function readLocalThenHostedImageUrl(cache, snapshot, isCurrent, paths, expected, readLocal, readHosted, resolveExpected) {
  const local = await cache.get(snapshot, isCurrent, paths, expected, readLocal, resolveExpected);
  return local || !isCurrent(snapshot) ? local : cache.get(snapshot, isCurrent, paths, expected, readHosted, undefined, 'hosted');
}

/** Read through a captured pack and discard the result if selection changed while I/O was pending. */
export async function readPackSnapshot(snapshot, isCurrent, path) {
  if (!snapshot?.pack || !isCurrent(snapshot)) return null;
  const bytes = await snapshot.pack.readPath(path);
  return isCurrent(snapshot) ? bytes : null;
}

const hostedDescriptors = new Map();
export function createImageDemandLoader(Observer) {
  const pending = new WeakMap();
  const observer = Observer ? new Observer((entries) => {
    for (const entry of entries) if (!entry.target.isConnected || entry.isIntersecting) {
      observer.unobserve(entry.target); const load = pending.get(entry.target); pending.delete(entry.target);
      if (entry.target.isConnected) load?.();
    }
  }, { rootMargin: '150px' }) : null;
  return (image, load) => { pending.set(image, load);
    if (observer) observer.observe(image);
    else { image.title = 'Click to load verified artwork'; image.addEventListener('click', load, { once: true }); }
  };
}
export function createHostedRestyleReader(pin, baseUrl, fetcher = globalThis.fetch) {
  const enabled = typeof pin === 'string' && /^[a-f0-9]{64}$/.test(pin);
  const base = typeof baseUrl === 'string' && /^(?:\/(?!\/)|\.\/)/.test(baseUrl)
    && baseUrl.endsWith('/') && !/[\\:\x00-\x20]/.test(baseUrl) ? baseUrl : null;
  async function bounded(url, limit, signal) {
    const response = await fetcher(url, signal ? { signal } : undefined);
    if (!response.ok || !response.body) throw new Error('Hosted response unavailable');
    if (Number(response.headers.get('content-length')) > limit) { await response.body.cancel(); throw new Error('Hosted response exceeds limit'); }
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break;
      if (value.byteLength > limit - size) throw new Error('Hosted response exceeds limit');
      size += value.byteLength; chunks.push(value);
    } } catch (error) { await reader.cancel().catch(() => undefined); throw error; } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } return bytes;
  }
  async function descriptor() {
    const bytes = await bounded(`${base}hosted-restyle-pack.json`, 2 * 1024 * 1024);
    const wrapper = JSON.parse(new TextDecoder().decode(bytes)), d = wrapper?.descriptor;
    if (wrapper?.inventorySha256 !== pin || d?.schema !== 'greybox-hosted-restyle-pack-v1' || !Array.isArray(d.files)
        || !Number.isSafeInteger(d.fileCount) || !Number.isSafeInteger(d.totalBytes) || d.fileCount < 1) throw new Error('Invalid hosted descriptor');
    const files = [], rows = new Map(), names = new Map(); let totalBytes = 0, previous = '';
    for (const row of d.files) {
      const path = row?.path, parts = typeof path === 'string' ? path.split('/') : [];
      if (!parts.length || parts[0] !== 'restyle' || parts.length < 2 || path <= previous
          || parts.some(p => !/^[A-Za-z0-9_-](?:[A-Za-z0-9_.-]*[A-Za-z0-9_-])?$/.test(p)
            || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p) || /^(SAVE|SAVGAM.*|CHRDAT.*)$/i.test(p))
          || !(/\.(png|json)$/i.test(path) || path === 'restyle/animations.html')
          || !Number.isSafeInteger(row.byteLength) || row.byteLength < 0 || !/^[a-f0-9]{64}$/.test(row.sha256)) throw new Error('Invalid hosted path/row');
      for (let i = 1; i <= parts.length; i++) { const prefix = parts.slice(0, i).join('/'), folded = prefix.toLowerCase();
        if (names.has(folded) && names.get(folded) !== prefix) throw new Error('Hosted case collision'); names.set(folded, prefix); }
      const entry = Object.freeze({ path, byteLength: row.byteLength, sha256: row.sha256 });
      rows.set(path, entry); files.push(entry); totalBytes += row.byteLength; previous = path;
    }
    for (const path of rows.keys()) { const parts = path.split('/'); for (let i = 1; i < parts.length; i++)
      if (rows.has(parts.slice(0, i).join('/'))) throw new Error('Hosted file/directory collision'); }
    const canonical = { schema: d.schema, fileCount: files.length, totalBytes, files };
    if (!Number.isSafeInteger(totalBytes) || totalBytes !== d.totalBytes || files.length !== d.fileCount
        || !await matchesLocalAssetSha256(new TextEncoder().encode(JSON.stringify(canonical)), pin)) throw new Error('Hosted descriptor digest/count mismatch');
    return rows;
  }
  async function lookup(path, signal, isCurrent, animationIndex = false) {
    if (!enabled || !base) return null;
    const current = () => { if (signal?.aborted || !isCurrent()) throw new Error('Hosted image canceled'); };
    current(); const normalized = normalizeLocalPackPath(path);
    if (!normalized || (animationIndex ? normalized !== 'anim/index.json' : !/\.png$/i.test(normalized))) return null;
    const key = `${pin}\0${base}`;
    if (!hostedDescriptors.has(key)) {
      const pending = descriptor();
      hostedDescriptors.set(key, pending);
      // A failed descriptor must not poison later reads: drop it so the next lookup retries.
      pending.catch(() => { if (hostedDescriptors.get(key) === pending) hostedDescriptors.delete(key); });
    }
    const rows = await hostedDescriptors.get(key); current();
    return rows.get(`restyle/${normalized}`) ?? null;
  }
  async function readVerified(path, expectedSha256, signal, isCurrent, animationIndex = false) {
    const row = await lookup(path, signal, isCurrent, animationIndex); if (!row) return null;
    const current = () => { if (signal?.aborted || !isCurrent()) throw new Error('Hosted image canceled'); };
    if (expectedSha256 != null && (typeof expectedSha256 !== 'string' || expectedSha256.toLowerCase() !== row.sha256)) throw new Error('Hosted image pin/path mismatch');
    const limit = (animationIndex ? 2 : 8) * 1024 * 1024;
    if (row.byteLength > limit) throw new Error('Hosted image exceeds limit');
    current(); const bytes = await bounded(`${base}${row.path}`, limit, signal); current();
    if (bytes.byteLength !== row.byteLength || !await matchesLocalAssetSha256(bytes, row.sha256)) throw new Error('Hosted image bytes mismatch');
    if (animationIndex) JSON.parse(new TextDecoder().decode(bytes));
    current(); return bytes;
  }
  return Object.freeze({
    async pin(path, signal, isCurrent = () => true) { return (await lookup(path, signal, isCurrent))?.sha256 ?? null; },
    read: (path, expectedSha256, signal, isCurrent = () => true) => readVerified(path, expectedSha256, signal, isCurrent),
    readAnimationIndex: (signal, isCurrent = () => true) => readVerified('anim/index.json', null, signal, isCurrent, true),
  });
}
