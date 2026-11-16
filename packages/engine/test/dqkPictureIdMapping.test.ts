/**
 * DQK Gen2 `PICTURE` id → real `PICA`/`PICB`/`PICC.TLB` slot — the mapping `apps/web/src/ui/dqkDemo.ts`
 * uses to render the attract demo's (`ECL.GLB` id 7) 9 unique portrait ids. Resolved via the
 * container's own documented set-id table (docs/hlib-format.md §1c: a MASTER HLIB's `ptr[0]` is
 * `WORD count` then `count × {WORD id, WORD ptrIndex}`) — no dynamic tracing needed, the format spec
 * already recorded this table, no decoder had used it for a reverse (id → slot) lookup before.
 *
 * Renders each resolved image to `renders/dqk-demo-pictures/` for visual verification (this
 * project's "verify visually" convention for decoded art) — 8 real, narratively-appropriate
 * portraits (two dragons, human knights, a bearded half-elf, a golden-haired elf woman, a kender,
 * two armoured allies) plus id 239's solid-black "fade to black" transition frame (always the
 * first PICTURE of each beat pair in the script — real content, not missing data).
 *
 * See `docs/engine/research/dqk-picture-id-mapping.md` for the full trace/verification writeup.
 * Skipped when the DQK GOG install isn't present.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { decodeHlib, indexedToRGBA, dqkPictureSlot, parseHlibSetIdTable, sniffHlib } from '../src/index.js';

const repoRoot = resolve(__dirname, '..', '..', '..');
const dqkDir = resolve(repoRoot, 'The Dark Queen of Krynn');
const OUT_DIR = resolve(repoRoot, 'renders', 'dqk-demo-pictures');
const have = existsSync(resolve(dqkDir, 'DISK2', 'PICC.TLB'));

// The 9 unique PICTURE ids ECL.GLB#7 (the demo script) fires, and which library each resolves
// into — locked in as a real regression, not just "found somewhere".
const EXPECTED: Record<number, 'PICA' | 'PICB' | 'PICC'> = {
  239: 'PICC', // always fires first in each beat pair — a solid-black transition frame
  90: 'PICA',
  91: 'PICA',
  115: 'PICA',
  149: 'PICB',
  170: 'PICC',
  171: 'PICC',
  172: 'PICC',
  173: 'PICC',
};

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
  const body = new Uint8Array(t.length + data.length);
  body.set(t, 0);
  body.set(data, t.length);
  const out = new Uint8Array(4 + body.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(body, 4);
  dv.setUint32(4 + body.length, crc32(body));
  return out;
}
function encodePNG(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = y * (1 + w * 3) + 1 + x * 3;
      raw[d] = rgba[s]!;
      raw[d + 1] = rgba[s + 1]!;
      raw[d + 2] = rgba[s + 2]!;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe.skipIf(!have)('DQK PICTURE id -> PICA/PICB/PICC slot mapping', () => {
  it('parseHlibSetIdTable resolves every demo PICTURE id to the expected library + a real 88x88 image', () => {
    const libs = {
      PICA: new Uint8Array(readFileSync(resolve(dqkDir, 'DISK2', 'PICA.TLB'))),
      PICB: new Uint8Array(readFileSync(resolve(dqkDir, 'DISK2', 'PICB.TLB'))),
      PICC: new Uint8Array(readFileSync(resolve(dqkDir, 'DISK2', 'PICC.TLB'))),
    };
    for (const bytes of Object.values(libs)) expect(sniffHlib(bytes)).toBe(true);

    mkdirSync(OUT_DIR, { recursive: true });
    for (const [idStr, expectedLib] of Object.entries(EXPECTED)) {
      const id = Number(idStr);
      let hit: { lib: keyof typeof libs; setPtrIndex: number } | null = null;
      for (const name of Object.keys(libs) as (keyof typeof libs)[]) {
        const table = parseHlibSetIdTable(libs[name]);
        if (table.has(id)) { hit = { lib: name, setPtrIndex: table.get(id)! }; break; }
      }
      expect(hit, `picture id ${id} not found in any of PICA/PICB/PICC`).not.toBeNull();
      expect(hit!.lib).toBe(expectedLib);

      const slot = dqkPictureSlot(libs[hit!.lib], hit!.setPtrIndex);
      expect(slot, `id ${id} (${hit!.lib} set ${hit!.setPtrIndex}) did not decode an image`).not.toBeNull();
      expect(slot!.image.width).toBe(88);
      expect(slot!.image.height).toBe(88);
      expect(slot!.image.palette).toBeTruthy();

      // Render for visual verification (this project's convention for decoded-art proofs).
      const rgba = indexedToRGBA(slot!.image, slot!.image.palette!);
      const png = encodePNG(rgba, slot!.image.width, slot!.image.height);
      writeFileSync(resolve(OUT_DIR, `id${id}_${hit!.lib}_set${hit!.setPtrIndex}.png`), png);
    }
  });
});
