import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import test from 'node:test';
import { bundleCokAmigaDialogue18 } from '../scripts/bundle-cok-amiga-dialogue18.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(width, height, color) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const line = Buffer.alloc(width * 3 + 1);
  for (let x = 0; x < width; x++) Buffer.from(color).copy(line, 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => line)))),
    chunk('IEND', Buffer.alloc(0))]);
}
function put(root, path, bytes) {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
  return bytes;
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'cok-amiga18-packager-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, 'output'); const source = join(root, 'source'); const archiveRoot = join(root, 'package');
  mkdirSync(join(output, 'restyle', 'orig'), { recursive: true });
  mkdirSync(join(output, 'restyle', 'out'), { recursive: true });
  const stem = '036_cok_amiga_daa_cok_pic1_pic1_018_f0';
  const orig = png(2, 2, [20, 30, 40]); const old = png(4, 4, [60, 70, 80]); const approved = png(4, 4, [90, 100, 110]);
  const sourceBytes = Buffer.from('native source'); const prompt = Buffer.from('complete prompt text');
  const input = Buffer.from('prompt reference image'); const raw = Buffer.from('raw generated image'); const archive = Buffer.from('pinned DAA bytes');
  const inputManifest = {
    game: 'cok', system: 'Amiga', archive: 'amiga/disk2/pic1.daa', archiveByteLength: archive.length,
    archiveSha256: sha(archive), source: { file: 'batch02/native/source.png', sha256: sha(sourceBytes), width: 2, height: 2,
      prompt: 'batch02/asset_prompt.txt', promptSha256: sha(prompt), input: 'batch02/asset_input.png', inputSha256: sha(input) },
    restyle: { file: 'AMIGA_PIC1_018_f0_restyle.png', reviewedImport: 'review/import.png', byteLength: approved.length,
      sha256: sha(approved), rawOutput: 'batch02/done/raw.png', rawOutputSha256: sha(raw), nativeWidth: 2, nativeHeight: 2,
      pixelScale: 2, width: 4, height: 4, bitDepth: 8, colorType: 2, destination: 'dialogue/AMIGA_PIC1_018_f0_restyle.png' },
    comparison: { stem, originalSha256: sha(orig), previousOutputSha256: sha(old),
      fidelity: { verdict: 'ok', edge_corr: 0.8539, hist_dist: 0.1931, aspect_dev: 0 } },
  };
  put(source, inputManifest.source.file, sourceBytes); put(source, inputManifest.source.prompt, prompt);
  put(source, inputManifest.source.input, input); put(source, inputManifest.restyle.rawOutput, raw);
  put(source, inputManifest.restyle.reviewedImport, approved); put(archiveRoot, `assets/${inputManifest.archive}`, archive);
  put(output, `restyle/orig/${stem}.png`, orig); put(output, `restyle/out/${stem}.png`, old);
  const items = Array.from({ length: 73 }, (_, i) => ({ id: `fixture-${String(i).padStart(3, '0')}`,
    stem: `fixture-${String(i).padStart(3, '0')}`, kind: 'face', src: 'fixture.png', native_div: 1,
    native_w: 1, native_h: 1, k: 1, game: 'cok' }));
  const idx = 0;
  items[idx] = { id: stem.slice(4), stem, kind: 'face', src: 'original.png', native_div: 1,
    native_w: 2, native_h: 2, k: 2, game: 'cok' };
  const gallery = { batch: 'fixture', items };
  const fidelity = { results: items.map((item) => ({ id: item.id, stem: item.stem, size: [item.native_w * item.k, item.native_h * item.k],
    k: item.k, verdict: 'ok', reasons: [], edge_corr: item.stem === stem ? 0.3072 : 1,
    hist_dist: item.stem === stem ? 0.2446 : 0, aspect_dev: 0 })) };
  put(output, 'restyle/manifest.json', Buffer.from(JSON.stringify(gallery)));
  put(output, 'restyle/fidelity.json', Buffer.from(JSON.stringify(fidelity)));
  return { root, output, source, archiveRoot, inputManifest, stem, approved, old, orig, fidelity };
}

test('stages approved Amiga #18 bytes into runtime and replaces its existing gallery card in place', (t) => {
  const f = fixture(t);
  bundleCokAmigaDialogue18(f.output, f.inputManifest, f.source, f.archiveRoot);
  assert.deepEqual(readFileSync(join(f.output, 'restyle/cok/dialogue/AMIGA_PIC1_018_f0_restyle.png')), f.approved);
  assert.deepEqual(readFileSync(join(f.output, `restyle/out/${f.stem}.png`)), f.approved);
  assert.deepEqual(readFileSync(join(f.output, `restyle/orig/${f.stem}.png`)), f.orig);
  const gallery = JSON.parse(readFileSync(join(f.output, 'restyle/manifest.json'), 'utf8'));
  assert.equal(gallery.items.length, 73);
  assert.equal(gallery.items.filter((item) => item.stem === f.stem).length, 1);
  const fidelity = JSON.parse(readFileSync(join(f.output, 'restyle/fidelity.json'), 'utf8'));
  assert.equal(fidelity.results.length, 73);
  assert.deepEqual(fidelity.results.find((item) => item.stem === f.stem), {
    id: f.stem.slice(4), stem: f.stem, size: [4, 4], k: 2, verdict: 'ok', reasons: [],
    edge_corr: 0.8539, hist_dist: 0.1931, aspect_dev: 0,
  });
});

test('rejects a mismatched Amiga archive before changing the package', (t) => {
  const f = fixture(t);
  const beforeRuntime = readFileSync(join(f.output, `restyle/out/${f.stem}.png`));
  const archivePath = join(f.archiveRoot, `assets/${f.inputManifest.archive}`);
  writeFileSync(archivePath, Buffer.from('wrong archive'));
  assert.throws(() => bundleCokAmigaDialogue18(f.output, f.inputManifest, f.source, f.archiveRoot), /pinned archive differs/);
  assert.deepEqual(readFileSync(join(f.output, `restyle/out/${f.stem}.png`)), beforeRuntime);
  assert.equal(existsSync(join(f.output, 'restyle/cok/dialogue/AMIGA_PIC1_018_f0_restyle.png')), false);
});

test('metadata-only mode validates Amiga #18 lineage and updates fidelity without output images', (t) => {
  const f = fixture(t);
  const restyle = join(f.output, 'restyle');
  const galleryManifestPath = join(restyle, 'manifest.json');
  const fidelityPath = join(restyle, 'fidelity.json');
  const manifestBefore = readFileSync(galleryManifestPath);
  const fidelityBefore = readFileSync(fidelityPath);
  rmSync(join(restyle, 'orig'), { recursive: true });
  rmSync(join(restyle, 'out'), { recursive: true });

  const result = bundleCokAmigaDialogue18(f.output, f.inputManifest, f.source, f.archiveRoot, { includeImages: false });

  assert.deepEqual(result, { runtimePath: null, galleryOutPath: null, fidelityPath });
  assert.deepEqual(readFileSync(galleryManifestPath), manifestBefore);
  assert.notDeepEqual(readFileSync(fidelityPath), fidelityBefore);
  const fidelity = JSON.parse(readFileSync(fidelityPath, 'utf8'));
  assert.deepEqual(fidelity.results.find((row) => row.stem === f.stem), {
    id: f.stem.slice(4), stem: f.stem, size: [4, 4], k: 2, verdict: 'ok', reasons: [],
    edge_corr: 0.8539, hist_dist: 0.1931, aspect_dev: 0,
  });
  assert.equal(existsSync(join(restyle, 'orig')), false);
  assert.equal(existsSync(join(restyle, 'out')), false);
  assert.equal(existsSync(join(restyle, 'cok', 'dialogue', 'AMIGA_PIC1_018_f0_restyle.png')), false);
});
