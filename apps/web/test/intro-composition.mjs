// Focused production-build smoke for title archive composition. This exercises the real Library
// scanner and local AssetSource path; original game archives stay outside the candidate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const REPO = resolve(dirname(dirname(fileURLToPath(import.meta.url))));
const distRoot = resolve(process.env.GB_INTRO_DIST_DIR ?? resolve(REPO, 'dist-app'));
const MANIFEST_SCHEMA = 'goldbox-intro-fixture-manifest-v1';
const ARCHIVE_PINS = Object.freeze({
  '1': { byteLength: 57528, sha256: '5276ba718f3c31018c25852f0b6858a292aed5a94f8bd938803961bb1ade0a00' },
  dok: { byteLength: 68110, sha256: '53157905e76886a6601767600622daa01000efe2cdeaec87c2279264777fdd83' },
});
const TITLES = [
  { route: '1', profileId: 'champions-of-krynn', frames: 3, archiveBasename: 'TITLE.DAX', markers: ['BIGPIC1.DAX', 'GEO1.DAX', 'ECL1.DAX', '8X8D1.DAX', 'KRYNN.CFG'] },
  { route: 'dok', profileId: 'death-knights-of-krynn', frames: 3, archiveBasename: 'TITLE.DAX', markers: ['BIGPIC1.DAX', 'GEO1.DAX', 'ECL1.DAX', '8X8D1.DAX', 'DKK.CFG'] },
  { route: 'coab', profileId: 'curse-of-the-azure-bonds', frames: 3, archiveBasename: 'TITLE.DAX', markers: ['BIGPIC1.DAX', 'ECL1.DAX', '8X8D1.DAX', 'CURSE.CFG'] },
  { route: 'secret', profileId: 'secret-of-the-silver-blades', frames: 3, archiveBasename: 'TITLE.DAX', markers: ['BLADES.CFG'] },
  { route: 'gateway', profileId: 'gateway-to-the-savage-frontier', frames: 5, archiveBasename: 'TITLE.DAX', markers: ['GAME.CFG', 'ZOUNDS.DAX'] },
  { route: 'pool', profileId: 'pool-of-radiance', frames: 2, archiveBasename: 'TITLE.DAX', archiveSuffix: 'POOLRAD/TITLE.DAX', markers: ['POOL.CFG'] },
  { route: 'dqk', profileId: 'dark-queen-of-krynn', frames: 7, archiveBasename: 'TITLE.TLB', archiveSuffix: 'DISK1/TITLE.TLB', markers: ['TITLE.TLB'] },
  { route: 'treasures', profileId: 'treasures-of-the-savage-frontier', frames: 6, archiveBasename: 'TITLE.DAX', markers: ['TREASURE.CFG', 'ZOUNDS.DAX'] },
  { route: 'pools', profileId: 'pools-of-darkness', frames: 3, archiveBasename: 'TITLE.DAX', markers: ['POOL4.CFG'] },
  { route: 'nwn', profileId: 'neverwinter-nights-dos', frames: 3, archiveBasename: 'TITLE.DAX', markers: ['GAME.CFG', 'GAME.OVR', 'ECL0.DAX', 'GEO0.DAX'] },
];

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isInside(root, child) {
  const rel = relative(normalize(root), normalize(child));
  return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

const pinManifestBytes = new Map();
const pinArchiveBytes = new Map();

function readPinnedFile(path, expectedSha256, cache, label) {
  const absolute = resolve(path);
  let bytes = cache.get(absolute);
  if (!bytes) {
    bytes = readFileSync(absolute);
    cache.set(absolute, bytes);
  }
  assert.equal(digest(bytes), expectedSha256.toLowerCase(), `${label} SHA-256`);
  return bytes;
}

function verifyIndependentArchivePin(row, title) {
  for (const key of ['pinManifestPath', 'pinManifestSha256', 'pinArchivePath', 'pinArchiveSha256', 'pinArchiveEntry']) {
    assert.equal(typeof row[key], 'string', `${title.route}: missing independent pin field ${key}`);
  }
  assert.ok(isAbsolute(row.pinManifestPath), `${title.route}: pinManifestPath must be absolute`);
  assert.ok(isAbsolute(row.pinArchivePath), `${title.route}: pinArchivePath must be absolute`);
  for (const path of [row.pinManifestPath, row.pinArchivePath]) {
    if (isInside(distRoot, resolve(path))) throw new Error(`${title.route}: independent pin must remain outside the production candidate`);
  }
  const pinBytes = readPinnedFile(row.pinManifestPath, row.pinManifestSha256, pinManifestBytes,
    `${title.route}: independent reference manifest`);
  const reference = JSON.parse(pinBytes.toString('utf8'));
  const archiveSha256 = reference.archive?.sha256 ?? reference.archive_sha256;
  assert.equal(archiveSha256, row.pinArchiveSha256.toLowerCase(), `${title.route}: source ZIP pin differs from reference manifest`);
  readPinnedFile(row.pinArchivePath, row.pinArchiveSha256, pinArchiveBytes, `${title.route}: independent source archive`);
  const entries = Array.isArray(reference.files) ? reference.files : reference.entries;
  assert.ok(Array.isArray(entries), `${title.route}: independent pin manifest has no file entries`);
  const matches = entries.filter((entry) => entry.archive_path === row.pinArchiveEntry);
  assert.equal(matches.length, 1, `${title.route}: independent pin entry must be unique`);
  const [entry] = matches;
  const entryBytes = entry.size_bytes ?? entry.bytes;
  assert.equal(entryBytes, row.byteLength, `${title.route}: independently pinned title byte length mismatch`);
  assert.equal(entry.sha256?.toLowerCase(), row.sha256.toLowerCase(), `${title.route}: independent title SHA-256 mismatch`);
}

function loadPinnedFixtures() {
  const manifestPath = process.env.GB_INTRO_FIXTURE_MANIFEST;
  const expectedManifestSha256 = process.env.GB_INTRO_FIXTURE_MANIFEST_SHA256?.toLowerCase();
  if (!manifestPath || !/^[a-f0-9]{64}$/.test(expectedManifestSha256 ?? '')) {
    throw new Error('Set GB_INTRO_FIXTURE_MANIFEST and its independently pinned GB_INTRO_FIXTURE_MANIFEST_SHA256; the manifest and title archives must remain outside the production candidate.');
  }
  const absoluteManifestPath = resolve(manifestPath);
  if (isInside(distRoot, absoluteManifestPath)) throw new Error('Intro fixture manifest must live outside the production candidate');
  const manifestBytes = readFileSync(absoluteManifestPath);
  assert.equal(digest(manifestBytes), expectedManifestSha256, 'intro fixture manifest must match its independent SHA-256 pin');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.schema, MANIFEST_SCHEMA);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.reviewReference && typeof manifest.reviewReference, 'string', 'fixture manifest needs a review reference');
  assert.ok(manifest.fixtures && typeof manifest.fixtures === 'object' && !Array.isArray(manifest.fixtures));
  assert.deepEqual(Object.keys(manifest.fixtures).sort(), TITLES.map(({ route }) => route).sort(), 'fixture manifest must cover all ten title routes exactly');

  return TITLES.map((title) => {
    const row = manifest.fixtures[title.route];
    assert.equal(row.profileId, title.profileId, `${title.route}: fixture profile mismatch`);
    assert.equal(row.platform, 'DOS', `${title.route}: fixture platform must be DOS`);
    assert.equal(typeof row.pinReference, 'string');
    assert.ok(row.pinReference.trim(), `${title.route}: fixture needs an independent pin reference`);
    verifyIndependentArchivePin(row, title);
    assert.equal(typeof row.archivePath, 'string');
    assert.ok(isAbsolute(row.archivePath), `${title.route}: archivePath must be absolute`);
    const archivePath = resolve(row.archivePath);
    if (isInside(distRoot, archivePath)) throw new Error(`${title.route}: title archive must remain outside the production candidate`);
    assert.equal(typeof row.archiveRelativePath, 'string');
    assert.ok(row.archiveRelativePath && !row.archiveRelativePath.startsWith('/')
      && !row.archiveRelativePath.split(/[\\/]/).some((part) => part === '..'), `${title.route}: invalid install-relative archive path`);
    assert.equal(basename(row.archiveRelativePath.replace(/\\/g, '/')).toLowerCase(), title.archiveBasename.toLowerCase(),
      `${title.route}: archive basename does not match the configured title source`);
    if (title.archiveSuffix) assert.ok(row.archiveRelativePath.replace(/\\/g, '/').toLowerCase().endsWith(title.archiveSuffix.toLowerCase()),
      `${title.route}: archive must retain its configured disk-relative path`);
    assert.match(row.sha256 ?? '', /^[a-f0-9]{64}$/i, `${title.route}: missing archive SHA-256`);
    assert.ok(Number.isSafeInteger(row.byteLength) && row.byteLength > 0, `${title.route}: invalid archive byte length`);
    const knownPin = ARCHIVE_PINS[title.route];
    if (knownPin) assert.deepEqual({ byteLength: row.byteLength, sha256: row.sha256.toLowerCase() }, knownPin,
      `${title.route}: fixture must match its independently reviewed archive pin`);
    const bytes = readFileSync(archivePath);
    assert.equal(bytes.byteLength, row.byteLength, `${title.route}: title archive byte length mismatch`);
    assert.equal(digest(bytes), row.sha256.toLowerCase(), `${title.route}: title archive SHA-256 mismatch`);
    return { ...title, archiveRelativePath: row.archiveRelativePath.replace(/\\/g, '/'), archiveBytes: bytes };
  });
}

function distPath(url) {
  const rel = decodeURIComponent(url.split('?')[0] ?? '/').replace(/^\/+/, '') || 'index.html';
  const path = normalize(resolve(distRoot, rel));
  if (path !== normalize(distRoot) && !path.startsWith(`${normalize(distRoot)}${sep}`)) return null;
  if (existsSync(path) && statSync(path).isFile()) return path;
  return extname(rel) ? null : resolve(distRoot, 'index.html');
}

function libraryFiles(title) {
  const root = `intro-${title.route}`;
  const archiveName = basename(title.archiveRelativePath);
  const files = [{ name: archiveName, relativePath: `${root}/${title.archiveRelativePath}`, type: 'application/octet-stream', base64: title.archiveBytes.toString('base64') }];
  const names = new Set([archiveName.toLowerCase()]);
  for (const name of title.markers) {
    const key = name.toLowerCase();
    if (names.has(key)) continue;
    names.add(key);
    files.push({ name, relativePath: `${root}/${name}`, type: 'application/octet-stream', base64: '' });
  }
  return files;
}

async function selectLocalInstall(page, title) {
  await page.evaluate(() => {
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: undefined });
  });
  await page.click('#add-folder-btn');
  await page.waitForFunction('typeof document.querySelector("#folder-input")?.onchange === "function"');
  await page.evaluate((entries) => {
    const input = document.querySelector('#folder-input');
    if (!(input instanceof HTMLInputElement)) throw new Error('Library folder input is missing');
    const transfer = new DataTransfer();
    for (const entry of entries) {
      const binary = atob(entry.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], entry.name, { type: entry.type });
      Object.defineProperty(file, 'webkitRelativePath', { value: entry.relativePath });
      transfer.items.add(file);
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, libraryFiles(title));
  await page.waitForFunction((profileId) => window.__greybox?.getLibrary?.()
    .some((entry) => entry.kind === 'game' && entry.profileId === profileId && entry.platform === 'DOS'),
  { timeout: 45_000 }, title.profileId);
  const index = await page.evaluate((profileId) => window.__greybox.getLibrary().findIndex((entry) =>
    entry.kind === 'game' && entry.profileId === profileId && entry.platform === 'DOS'), title.profileId);
  assert.ok(index >= 0, `${title.route}: Library did not identify ${title.profileId} as DOS`);
  await page.click(`.lib-entry[data-lib-index="${index}"]`);
}

const server = createServer((req, res) => {
  const path = distPath(req.url ?? '/');
  if (!path) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  const mime = extname(path) === '.js' ? 'text/javascript' : extname(path) === '.css' ? 'text/css' : 'application/octet-stream';
  res.setHeader('Content-Type', path.endsWith('index.html') ? 'text/html; charset=utf-8' : mime);
  createReadStream(path).pipe(res);
});

const externalBase = process.env.GB_INTRO_BASE_URL?.replace(/\/?$/, '/');
const titles = loadPinnedFixtures();
if (process.argv.includes('--preflight-only')) {
  console.log(`PASS intro-fixture preflight: ${titles.length} routes, ${titles.reduce((total, title) => total + title.archiveBytes.length, 0)} title-archive bytes; all independent reference manifests, ZIPs, and title hashes verified.`);
  process.exit(0);
}
if (!externalBase) await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const address = externalBase ? null : server.address();
if (!externalBase && (!address || typeof address === 'string')) throw new Error('intro smoke server did not bind a TCP port');
const base = externalBase ?? `http://127.0.0.1:${address.port}/`;
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
try {
  for (const title of titles) {
    const route = `?intro=${title.route}`;
    const page = await browser.newPage();
    const errors = [];
    const gameRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (/\.(?:dax|daa|tlb|glb|lbm)$/i.test(new URL(request.url()).pathname)) gameRequests.push(request.url());
    });
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle2', timeout: 45_000 });
    await selectLocalInstall(page, title);
    // A failed archive load republishes __rendered but never __intro; wait for either, then give
    // a direct per-route assertion instead of timing out without the missing-input context.
    await page.waitForFunction('window.__intro || window.__rendered !== undefined', { timeout: 45_000 });
    if (!(await page.evaluate('!!window.__intro'))) {
      const status = await page.$eval('#status', (node) => node.textContent);
      throw new Error(`${route}: intro did not mount (${status})`);
    }
    const result = await page.evaluate(() => {
      const intro = window.__intro;
      const canvas = document.querySelector('#output canvas');
      const frames = [];
      for (let i = 0; i < intro.frameCount; i++) {
        const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = new Set();
        let nonBlack = 0;
        for (let p = 0; p < rgba.length; p += 4) {
          colors.add(`${rgba[p]},${rgba[p + 1]},${rgba[p + 2]}`);
          if (rgba[p] || rgba[p + 1] || rgba[p + 2]) nonBlack++;
        }
        frames.push({ colors: colors.size, nonBlack });
        if (i + 1 < intro.frameCount) intro.advance();
      }
      return { count: intro.frameCount, frames };
    });
    if (result.count !== title.frames || errors.length > 0 || gameRequests.length > 0
        || result.frames.some((frame) => frame.colors < 2 || frame.nonBlack === 0)) {
      throw new Error(`${route}: ${JSON.stringify({ expectedFrames: title.frames, result, errors, gameRequests })}`);
    }
    console.log(`${route}: ${result.count} nonblank frames from the selected local install (${result.frames.map((frame) => frame.colors).join(', ')} colors)`);
    await page.close();
  }
} finally {
  await browser.close();
  if (!externalBase) await new Promise((closed) => server.close(closed));
}
