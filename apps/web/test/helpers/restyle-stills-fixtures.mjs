// Synthetic IHDR-only fixtures for the packager's header/geometry contract.
// These are not decodable PNGs: image decoding belongs to the browser E2E case.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function pngHeader(width, height) {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8; // RGBA, 8-bit, non-interlaced.
  bytes[25] = 6;
  let crc = 0xffffffff;
  for (const byte of bytes.subarray(12, 29)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
  return bytes;
}

export function sandbox(t) {
  const root = mkdtempSync(join(tmpdir(), 'greybox-restyle-stills-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

export function fidelityFor(manifest) {
  return { missing: [], results: manifest.items.map((item, i) => ({
    id: item.id, stem: item.stem, size: [item.native_w * item.k, item.native_h * item.k],
    k: item.k, verdict: i ? 'FLAG' : 'ok', edge_corr: 0.5, hist_dist: 0.1, aspect_dev: 0,
  })) };
}

export function stillsFixture(t) {
  const root = sandbox(t);
  const source = join(root, 'source');
  const output = join(root, 'destination');
  const manifest = { batch: 'batch02', items: [
    { id: 'wide', stem: '001_bigpic2_119', kind: 'scene', src: 'provenance/BIGPIC2/119', native_w: 304, native_h: 120, k: 6 },
    { id: 'portrait', stem: '002_pic2_025', kind: 'face', src: 'provenance/PIC2/025', native_w: 88, native_h: 88, k: 16 },
  ] };
  for (const dir of ['orig', 'out']) mkdirSync(join(source, dir), { recursive: true });
  writeFileSync(join(source, 'manifest.json'), JSON.stringify(manifest));
  for (const item of manifest.items) {
    // Originals may already be upscaled, but must preserve native aspect exactly.
    writeFileSync(join(source, 'orig', `${item.stem}.png`), pngHeader(item.native_w * 2, item.native_h * 2));
    writeFileSync(join(source, 'out', `${item.stem}.png`), pngHeader(item.native_w * item.k, item.native_h * item.k));
  }
  writeFileSync(join(source, 'fidelity.json'), JSON.stringify(fidelityFor(manifest)));
  return { source, output, manifest };
}

// Include directory entries and bytes: detects new staging dirs as well as partial rewrites.
export function snapshotTree(root) {
  const entries = [];
  const visit = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        entries.push([`${rel}/`, null]);
        visit(join(dir, entry.name), `${rel}/`);
      } else {
        entries.push([rel, readFileSync(join(dir, entry.name)).toString('hex')]);
      }
    }
  };
  visit(root, '');
  return entries;
}
