/**
 * Proof-sheet renderer for the committed Amiga→DQK art-slot mapping
 * (`packages/engine/data/cok-amiga-art-mappings.json`). For every curated assignment it writes,
 * into git-ignored `renders/artmap/`:
 *
 *   {TARGET}_slot{N}_dqk.bmp    — the ORIGINAL DQK slot art (what the build ships unmapped)
 *   {TARGET}_slot{N}_amiga.bmp  — the mapped Amiga frame decoded BACK OUT of the real
 *                                 `buildMappedArtOverride` bytes (i.e. the actual override art,
 *                                 relocated palette and all — not a shortcut render of the source)
 *
 * so a human can eyeball each pair side by side. Read-only w.r.t. game data; plain 24-bit BMPs to
 * keep this dependency-free. Run: `npx tsx tools/render_artmap_proof.mts`
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeDaa,
  decodeHlib,
  buildMappedArtOverride,
  deserializeSlotMapping,
  dqkArtEntry,
  type DaaArchive,
  type IndexedImage,
} from '../packages/engine/src/index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p: string) => new Uint8Array(readFileSync(p));

/** Minimal 24-bit bottom-up BMP from an indexed image + its (partial) palette. */
function toBmp(img: IndexedImage): Uint8Array {
  const { width: w, height: h } = img;
  const rowBytes = (w * 3 + 3) & ~3;
  const out = new Uint8Array(54 + rowBytes * h);
  const dv = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d; // 'BM'
  dv.setUint32(2, out.length, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  for (let y = 0; y < h; y++) {
    const dst = 54 + (h - 1 - y) * rowBytes;
    for (let x = 0; x < w; x++) {
      const idx = img.indices[y * w + x];
      const rgb = idx === img.transparentIndex ? { r: 255, g: 0, b: 255 } : (img.palette?.colors[idx] ?? { r: 0, g: 0, b: 0 });
      out[dst + x * 3] = rgb.b; out[dst + x * 3 + 1] = rgb.g; out[dst + x * 3 + 2] = rgb.r;
    }
  }
  return out;
}

const doc = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages', 'engine', 'data', 'cok-amiga-art-mappings.json'), 'utf8'),
) as { mappings: unknown[] };
const mappings = doc.mappings.map((m) => deserializeSlotMapping(JSON.stringify(m)));

const outDir = resolve(repoRoot, 'renders', 'artmap');
mkdirSync(outDir, { recursive: true });

const findAmiga = (name: string): string | null => {
  for (const disk of ['disk1', 'disk2', 'disk3']) {
    const p = resolve(repoRoot, 'amiga_extracted', 'ChampionsOfKrynn', disk, name);
    if (existsSync(p)) return p;
  }
  return null;
};

for (const m of mappings) {
  const entry = dqkArtEntry(m.target);
  if (!entry) { console.log(`skip ${m.target}: unknown entry`); continue; }
  const tlbPath = resolve(repoRoot, 'The Dark Queen of Krynn', entry.disk, entry.name);
  if (!existsSync(tlbPath)) { console.log(`skip ${m.target}: missing original TLB`); continue; }
  // Gather every source archive the mapping names (mapping-level + per-assignment overrides).
  const srcNames = new Set<string>([m.source]);
  for (const a of m.assignments) if (a.source) srcNames.add(a.source);
  const sources: Record<string, DaaArchive> = {};
  let missing = false;
  for (const name of srcNames) {
    const p = findAmiga(name);
    if (!p) { console.log(`skip ${m.target}: missing source ${name}`); missing = true; break; }
    sources[name] = decodeDaa(rd(p), name);
  }
  if (missing) continue;

  const originalBytes = rd(tlbPath);
  const target = decodeHlib(originalBytes, entry.name);
  // DROP-IN mode: the override carries the real set-id table + every unmapped set verbatim, so
  // mapped slot N decodes at the SAME flattened index N as in the original.
  const overrideBytes = buildMappedArtOverride(m.target, sources, m, originalBytes);
  const override = decodeHlib(overrideBytes, m.target);
  const base = m.target.replace(/\.TLB$/i, '');
  for (const a of [...m.assignments].sort((x, y) => x.slot - y.slot)) {
    writeFileSync(resolve(outDir, `${base}_slot${a.slot}_dqk.bmp`), toBmp(target.images[a.slot].image));
    writeFileSync(resolve(outDir, `${base}_slot${a.slot}_amiga.bmp`), toBmp(override.images[a.slot].image));
    console.log(`${base} slot ${a.slot}: dqk + amiga (${a.source ?? m.source} block ${a.sourceBlockId}.${a.frameIndex}) written`);
  }
}
console.log(`proof sheets in ${outDir}`);
