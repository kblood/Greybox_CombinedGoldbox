/**
 * `blockId` is sparse AND non-unique, and the loaders must keep every entry.
 *
 * `docs/dax-format.md` §1 has always said the id is sparse. It is also not unique: three
 * Champions of Krynn containers ship the same id twice, and `SPRIT2.DAX` id 14 is **two
 * different sprites** — 3-frame arrays of 56×80/32×65/24×57 and 48×80/40×65/24×57, each
 * consuming its block exactly.
 *
 * That matters here because resolving a block by id is ambiguous, and this codebase resolves it
 * two different ways: `.find()` (first wins) in `cokFont.ts` and `dqkArtMap.ts`, and
 * `new Map(blocks.map((b) => [b.blockId, b.raw]))` (last wins) in four `apps/web/src/ui`
 * modules. No shipped route hits it today — the Map sites read ECL/GEO/WALLDEF/MON/TILES, none
 * of which is one of the three affected files — but a decode step that "helpfully" deduped by id
 * would destroy the evidence and make the disagreement unobservable.
 *
 * So this pins the one thing that is certain: **both entries survive decoding.** Which one the
 * retail engine picks is UNLOCATED; `tools/test_dax_block_ids.py` records the corpus counts and
 * the three oracles that were tried and did not settle it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { decodeDax, readDaxDataBlocks } from '../src/loaders/dax.js';

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const cok = (name: string) => resolve(REPO, 'Champions of Krynn', name);

const CASES: { file: string; dup: number; entries: number; identical: boolean }[] = [
  { file: 'PIC1.DAX', dup: 34, entries: 18, identical: true },
  { file: 'SPRIT2.DAX', dup: 14, entries: 18, identical: false },
  { file: 'SPRIT3.DAX', dup: 35, entries: 13, identical: true },
];

describe('DAX duplicate block ids survive decoding', () => {
  for (const c of CASES) {
    const path = cok(c.file);
    it.skipIf(!existsSync(path))(`${c.file}: both id ${c.dup} entries are kept`, () => {
      const bytes = new Uint8Array(readFileSync(path));

      const raw = readDaxDataBlocks(bytes);
      expect(raw.length).toBe(c.entries);
      const rawHits = raw.filter((b) => b.blockId === c.dup);
      expect(rawHits.length, 'readDaxDataBlocks must not dedupe by id').toBe(2);
      const same = Buffer.from(rawHits[0]!.raw).equals(Buffer.from(rawHits[1]!.raw));
      expect(same).toBe(c.identical);

      const arc = decodeDax(bytes, c.file);
      expect(arc.blocks.length).toBe(c.entries);
      expect(
        arc.blocks.filter((b) => b.blockId === c.dup).length,
        'decodeDax must not dedupe by id either',
      ).toBe(2);
    });
  }

  const sprit2 = cok('SPRIT2.DAX');
  it.skipIf(!existsSync(sprit2))('SPRIT2 id 14 decodes to two different sprites', () => {
    const arc = decodeDax(new Uint8Array(readFileSync(sprit2)), 'SPRIT2.DAX');
    const hits = arc.blocks.filter((b) => b.blockId === 14);
    const geo = hits.map((h) => (h.frames ?? []).map((f) => `${f.width}x${f.height}`).join(','));
    expect(geo).toEqual(['56x80,32x65,24x57', '48x80,40x65,24x57']);
    // The null for the two rows above: the OTHER two duplicate pairs are byte-identical, so a
    // decoder that simply produced different output for any two entries would not pass both.
    const pic1 = cok('PIC1.DAX');
    if (existsSync(pic1)) {
      const p = decodeDax(new Uint8Array(readFileSync(pic1)), 'PIC1.DAX')
        .blocks.filter((b) => b.blockId === 34)
        .map((b) => (b.frames ?? []).map((f) => `${f.width}x${f.height}`).join(','));
      expect(p).toEqual(['88x88', '88x88']);
    }
  });
});
