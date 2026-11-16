import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { encodeTestPng } from '../scripts/restyle-png.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const put = (root, path, bytes) => {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
  return destination;
};
const putJson = (root, path, value) => put(root, path, `${JSON.stringify(value)}\n`);

function snapshot(root, prefix = '') {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = prefix + entry.name;
      assert.equal(entry.isSymbolicLink(), false, `Unexpected fixture link: ${path}`);
      return entry.isDirectory()
        ? [[`${path}/`, 'directory'], ...snapshot(join(root, entry.name), `${path}/`)]
        : [[path, sha(readFileSync(join(root, entry.name)))]];
    });
}

function roots(t) {
  const root = mkdtempSync(join(tmpdir(), 'greybox-metadata-regression-'));
  // This exact directory is owned by this test; no source holdings or build outputs are used.
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = Object.fromEntries(['source', 'archives', 'output'].map((name) => {
    const path = join(root, name); mkdirSync(path); return [name, path];
  }));
  put(paths.output, 'keep/sentinel.txt', 'unrelated output must survive');
  return paths;
}

function item(stem, nativeWidth = 2, nativeHeight = 2, scale = 2) {
  return { id: stem.slice(4), stem, kind: 'face', src: 'fixture.png', game: 'cok',
    native_w: nativeWidth, native_h: nativeHeight, k: scale };
}
function fidelityRow(entry) {
  return { id: entry.id, stem: entry.stem, size: [entry.native_w * entry.k, entry.native_h * entry.k],
    k: entry.k, verdict: 'ok', edge_corr: 0.5, hist_dist: 0.2, aspect_dev: 0 };
}
function gallery(output, items, batch = 'batch01+batch02+batch03') {
  const manifest = { batch, items };
  const fidelity = { results: items.map(fidelityRow) };
  putJson(output, 'restyle/manifest.json', manifest);
  putJson(output, 'restyle/fidelity.json', fidelity);
  return { manifest, fidelity };
}

let importId = 0;
async function loadPackager(script, manifestName, manifest, environment = {}) {
  // Substitute only this importer's pinned JSON input. Production JavaScript, validators,
  // crypto and filesystem operations execute unchanged. A unique module URL isolates roots.
  const moduleUrl = new URL(`../scripts/${script}?metadata-fixture=${++importId}`, import.meta.url).href;
  const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === moduleUrl && specifier === `../src/ui/${manifestName}`) {
        return { url: `data:application/json,${encodeURIComponent(JSON.stringify(manifest))}`, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
  try {
    Object.assign(process.env, environment);
    return await import(moduleUrl);
  } finally {
    hook.deregister();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

async function dialogueFixture(t) {
  const f = roots(t);
  const original = encodeTestPng(2, 2), approved = encodeTestPng(4, 4);
  const prompt = Buffer.from('complete synthetic prompt');
  const input = encodeTestPng(3, 3), raw = encodeTestPng(5, 5);
  const archive = Buffer.from('synthetic pinned Amiga archive');
  const stem = '043_cok_amiga_daa_cok_pic1_pic1_057_f0';
  const manifest = {
    archive: 'amiga/pic1.daa', archiveByteLength: archive.length, archiveSha256: sha(archive),
    source: { file: 'source.png', sha256: sha(original), prompt: 'prompt.txt', promptSha256: sha(prompt),
      input: 'input.png', inputSha256: sha(input), rawOutput: 'raw.png', rawOutputSha256: sha(raw) },
    restyle: { reviewedImport: 'approved.png', byteLength: approved.length, sha256: sha(approved),
      nativeWidth: 2, nativeHeight: 2, pixelScale: 2, destination: 'dialogue/AMIGA_PIC1_057_f0_restyle.png' },
    comparison: { stem, originalSha256: sha(original), restyleSha256: sha(approved),
      fidelity: { verdict: 'ok', edge_corr: 0.5, hist_dist: 0.2, aspect_dev: 0 } },
  };
  for (const [path, bytes] of [['source.png', original], ['prompt.txt', prompt], ['input.png', input],
    ['raw.png', raw], ['approved.png', approved]]) put(f.source, path, bytes);
  put(f.archives, `assets/${manifest.archive}`, archive);
  const items = Array.from({ length: 75 }, (_, index) => item(`000_fixture_${index}`));
  items[0] = item(stem);
  gallery(f.output, items);
  const { bundleCokAmigaDialogue57 } = await loadPackager('bundle-cok-amiga-dialogue57.mjs',
    'cokAmigaDialogue57RestyleManifest.json', manifest,
    { GB_COK_AMIGA57_SOURCE_ROOT: f.source, GB_COK_AMIGA57_ARCHIVE_ROOT: f.archives });
  return { ...f, manifest, run: () => bundleCokAmigaDialogue57(f.output, { includeImages: false }) };
}

async function demoFixture(t) {
  const f = roots(t);
  const original = encodeTestPng(2, 2), approved = encodeTestPng(4, 4, [90, 100, 110, 255]);
  const dos = Buffer.from('synthetic pinned DOS archive'), amiga = Buffer.from('synthetic pinned Amiga archive');
  const manifest = {
    nativeWidth: 2, nativeHeight: 2,
    source: { file: 'source.png', bytes: original.length, sha256: sha(original), width: 2, height: 2, colorType: 6 },
    restyle: { file: 'approved.png', bytes: approved.length, sha256: sha(approved), width: 4, height: 4,
      colorType: 6, pixelScale: 2, destination: 'demo/BIGPIC2_116_restyle.png' },
    dos: { archive: 'dos/BIGPIC2.DAX', archiveSha256: sha(dos) },
    amiga: { archive: 'amiga/BIGPIC1.DAA', archiveSha256: sha(amiga) },
  };
  put(f.source, 'orig/source.png', original); put(f.source, 'out/approved.png', approved);
  put(f.archives, manifest.dos.archive, dos); put(f.archives, manifest.amiga.archive, amiga);
  const before = gallery(f.output, [item('000_existing_card')]);
  const { bundleCokDemoRestyle } = await loadPackager('bundle-cok-demo-restyle.mjs', 'cokDemoArtManifest.json', manifest);
  return { ...f, manifest, before,
    run: () => bundleCokDemoRestyle(f.source, f.archives, f.output, { includeImages: false }) };
}

function rejectsUnchanged(f, expected) {
  const before = snapshot(f.output);
  assert.throws(f.run, expected);
  assert.deepEqual(snapshot(f.output), before, 'Rejected input must leave every output path and byte unchanged');
}

// Serial execution is intentional: dialogue57 captures environment roots at module evaluation.
test('dialogue57 metadata-only packaging with synthetic provenance', async (t) => {
  await t.test('validates without requiring image directories or changing any output', async (t) => {
    const f = await dialogueFixture(t);
    const before = snapshot(f.output), sourceBefore = snapshot(f.source), archivesBefore = snapshot(f.archives);
    assert.equal(f.run(), null);
    assert.deepEqual(snapshot(f.output), before);
    assert.deepEqual(snapshot(f.source), sourceBefore);
    assert.deepEqual(snapshot(f.archives), archivesBefore);
  });
  for (const path of ['prompt.txt', 'input.png', 'raw.png', 'approved.png']) {
    await t.test(`rejects changed ${path} before writing`, async (t) => {
      const f = await dialogueFixture(t);
      put(f.source, path, 'changed synthetic provenance');
      rejectsUnchanged(f, /source, full prompt\/input\/raw lineage, archive or approved import differs/);
    });
  }
  await t.test('rejects changed archive before writing', async (t) => {
    const f = await dialogueFixture(t);
    put(f.archives, `assets/${f.manifest.archive}`, 'wrong archive');
    rejectsUnchanged(f, /source, full prompt\/input\/raw lineage, archive or approved import differs/);
  });
  await t.test('rejects wrong comparison identity before writing', async (t) => {
    const f = await dialogueFixture(t), data = json(join(f.output, 'restyle/manifest.json'));
    data.items[0].id = 'wrong_identity'; putJson(f.output, 'restyle/manifest.json', data);
    rejectsUnchanged(f, /curated card identity differs/);
  });
  await t.test('rejects changed fidelity measurement before writing', async (t) => {
    const f = await dialogueFixture(t), data = json(join(f.output, 'restyle/fidelity.json'));
    data.results[0].edge_corr = 0.75; putJson(f.output, 'restyle/fidelity.json', data);
    rejectsUnchanged(f, /fidelity review differs/);
  });
});

test('demo metadata-only packaging with synthetic pinned assets', async (t) => {
  await t.test('adds exactly one gallery/fidelity pair, writes no art, and rejects a duplicate unchanged', async (t) => {
    const f = await demoFixture(t), before = snapshot(f.output);
    const sourceBefore = snapshot(f.source), archivesBefore = snapshot(f.archives);
    assert.equal(f.run(), null);
    const pair = { id: 'cok_demo_bigpic2_116', kind: 'demo scene', stem: 'cok-demo-bigpic2-116',
      src: 'dos/BIGPIC2.DAX', label: 'CoK demo · BIGPIC2#116',
      description: 'Frame 0 of the Champions of Krynn attract demo scene. DOS-EGA and Amiga share the native composition; the Restyle is admitted only for the pinned DOS BIGPIC2.DAX block 116.',
      game: 'cok', native_w: 2, native_h: 2, k: 2 };
    assert.deepEqual(json(join(f.output, 'restyle/manifest.json')),
      { ...f.before.manifest, items: [...f.before.manifest.items, pair] });
    assert.deepEqual(json(join(f.output, 'restyle/fidelity.json')), { ...f.before.fidelity,
      results: [...f.before.fidelity.results, { id: pair.id, stem: pair.stem, size: [4, 4], k: 2,
        verdict: 'ok', edge_corr: 0.3613, hist_dist: 0.1242, aspect_dev: 0 }] });
    const metadata = new Set(['restyle/manifest.json', 'restyle/fidelity.json']);
    assert.deepEqual(snapshot(f.output).map(([path]) => path), before.map(([path]) => path));
    assert.deepEqual(snapshot(f.output).filter(([path]) => !metadata.has(path)),
      before.filter(([path]) => !metadata.has(path)));
    assert.deepEqual(snapshot(f.source), sourceBefore);
    assert.deepEqual(snapshot(f.archives), archivesBefore);
    rejectsUnchanged(f, /unexpected batch or duplicate Runtime scene/);
  });
  for (const system of ['dos', 'amiga']) {
    await t.test(`rejects changed ${system} archive before metadata writes`, async (t) => {
      const f = await demoFixture(t);
      put(f.archives, f.manifest[system].archive, 'wrong archive');
      rejectsUnchanged(f, /Game asset source hash mismatch/);
    });
  }
  await t.test('rejects changed approved Restyle before metadata writes', async (t) => {
    const f = await demoFixture(t), path = join(f.source, 'out/approved.png');
    const changed = readFileSync(path); changed[changed.length - 1] ^= 1; writeFileSync(path, changed);
    rejectsUnchanged(f, /CoK Restyle differs from its reviewed size\/hash/);
  });
  await t.test('rejects wrong gallery batch before metadata writes', async (t) => {
    const f = await demoFixture(t), data = json(join(f.output, 'restyle/manifest.json'));
    data.batch = 'wrong-batch'; putJson(f.output, 'restyle/manifest.json', data);
    rejectsUnchanged(f, /unexpected batch or duplicate Runtime scene/);
  });
  await t.test('rejects invalid fidelity before metadata writes', async (t) => {
    const f = await demoFixture(t), data = json(join(f.output, 'restyle/fidelity.json'));
    data.results[0].size = [3, 4]; putJson(f.output, 'restyle/fidelity.json', data);
    rejectsUnchanged(f, /Invalid restyle fidelity/);
  });
});
