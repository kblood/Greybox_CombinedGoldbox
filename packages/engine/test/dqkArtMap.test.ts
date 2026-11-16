/**
 * DQK art-library map (E5.2) — the grounded catalogue + portability verdicts for the 19 DQK art `.TLB`
 * libraries. Verified against the real GOG release:
 *
 *  - Every `DQK_ART_LAYOUT` entry's recorded shape (container master/leaf, draw method, palette base,
 *    first-image geometry, image count) matches the real decoded `.TLB` exactly — the table is measured,
 *    not invented.
 *  - The only `portable-master` entry (BIGPIC) actually converts from the real Amiga `BIGPIC1.DAA`, and
 *    every other verdict throws a descriptive block when asked to convert.
 *  - The `shape-mismatch` verdicts on SPRIT/PICA/PICB/PICC line up with reality: `SPRIT1.DAA` and
 *    `pic1.daa` now decode real frames (the 6-byte sub-frame index is solved — see `daa.ts`), but
 *    neither has enough distinct base sprites/portraits to fill its DQK target(s) 1:1.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DQK_ART_LAYOUT,
  dqkArtEntry,
  dqkArtByVerdict,
  buildAmigaArtOverride,
  buildPortableArtOverrides,
  buildMappedArtOverride,
  decodeHlib,
  decodeDaa,
  amigaImageToVga,
  mapHlibMasterSlots,
  createEmptySlotMapping,
  assignSlot,
  validateSlotMapping,
  deserializeSlotMapping,
  type AmigaSlotMapping,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const dqk = (disk: string, f: string) => resolve(repoRoot, 'The Dark Queen of Krynn', disk, f);
const amiga = (disk: string, f: string) => resolve(repoRoot, 'amiga_extracted', 'ChampionsOfKrynn', disk, f);
const rd = (p: string) => new Uint8Array(readFileSync(p));

describe('DQK_ART_LAYOUT — table integrity', () => {
  it('has unique names and a verdict for every entry', () => {
    const names = DQK_ART_LAYOUT.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    expect(DQK_ART_LAYOUT.every((e) => e.verdict.length > 0)).toBe(true);
    // Exactly one portable-master today: BIGPIC.
    const portable = dqkArtByVerdict('portable-master').map((e) => e.name);
    expect(portable).toEqual(['BIGPIC.TLB']);
    // Exactly one portable-leaf today: COMSPR — a leaf TILE with a known transparent source index.
    const leaf = dqkArtByVerdict('portable-leaf');
    expect(leaf.map((e) => e.name)).toEqual(['COMSPR.TLB']);
    for (const e of leaf) {
      expect(e.container, `${e.name} portable-leaf is a leaf`).toBe('leaf');
      expect(e.amigaSource, `${e.name} names a source`).toBeTruthy();
      // transparent index is auto-detected per source (game-specific), so the entry leaves it undefined.
      expect(e.transparentSourceIndex, `${e.name} leaves transparent index to auto-detect`).toBeUndefined();
    }
    // Blocked-on-unsolved-source entries name an Amiga source (none today — SPRIT/PICA/PICB/PICC
    // moved to shape-mismatch once the 6-byte sub-frame index was solved; kept as a real assertion
    // in case a future format gap lands here).
    for (const e of dqkArtByVerdict('blocked-unsolved-source')) expect(e.amigaSource).toBeTruthy();
    // no-amiga-source entries have no source.
    for (const e of dqkArtByVerdict('no-amiga-source')) expect(e.amigaSource).toBeNull();
  });

  it('dqkArtEntry resolves case-insensitively', () => {
    expect(dqkArtEntry('bigpic.tlb')!.container).toBe('master');
    expect(dqkArtEntry('NOPE.TLB')).toBeUndefined();
  });
});

describe('DQK_ART_LAYOUT — matches the real GOG .TLB shapes', () => {
  for (const e of DQK_ART_LAYOUT) {
    const path = dqk(e.disk, e.name);
    it.skipIf(!existsSync(path))(`${e.name} shape is measured, not invented`, () => {
      const arc = decodeHlib(rd(path), e.name);
      const container = arc.tag === 'HLIB' ? 'master' : 'leaf';
      expect(container, `${e.name} container`).toBe(e.container);
      expect(arc.images.length, `${e.name} imageCount`).toBe(e.imageCount);
      const first = arc.images[0];
      expect(first, `${e.name} has a first image`).toBeDefined();
      expect(first.image.width, `${e.name} width`).toBe(e.width);
      expect(first.image.height, `${e.name} height`).toBe(e.height);
      expect(first.drawMethod, `${e.name} drawMethod`).toBe(e.drawMethod);
      const base = first.image.palette?.firstColor ?? null;
      expect(base, `${e.name} paletteBase`).toBe(e.paletteBase);
    });
  }
});

describe('buildAmigaArtOverride — portability gate', () => {
  it.skipIf(!existsSync(amiga('disk2', 'BIGPIC1.DAA')))('converts the portable BIGPIC master', () => {
    const src = decodeDaa(rd(amiga('disk2', 'BIGPIC1.DAA')), 'BIGPIC1.DAA');
    const override = buildAmigaArtOverride('BIGPIC.TLB', src);
    const re = decodeHlib(override, 'BIGPIC.TLB');
    expect(re.tag).toBe('HLIB');
    expect(re.images.length).toBe(src.frameSet.frames.size);
    expect(re.images[0].drawMethod).toBe(18);
    expect(re.images[0].image.palette!.firstColor).toBe(32);
  });

  it.skipIf(!existsSync(amiga('disk2', 'comspr.daa')))('converts the portable COMSPR leaf (real comspr.daa)', () => {
    const src = decodeDaa(rd(amiga('disk2', 'comspr.daa')), 'comspr.daa');
    const nFrames = src.frameSet.frames.size;
    expect(nFrames, 'comspr.daa has solved frames').toBeGreaterThan(0);
    const override = buildAmigaArtOverride('COMSPR.TLB', src);
    const re = decodeHlib(override, 'COMSPR.TLB');
    // Leaf TILE, one image per source frame, all method 21 (transparent), shared palette at base 64.
    expect(re.tag).toBe('TILE');
    expect(re.images.length).toBe(nFrames);
    expect(re.images.every((m) => m.drawMethod === 21)).toBe(true);
    expect(re.images.every((m) => m.image.transparentIndex === 255)).toBe(true);
    expect(re.images[0].image.palette!.firstColor).toBe(64);
    expect(re.images[0].image.width).toBe(24);
    expect(re.images[0].image.height).toBe(24);
    // Indices are lossless: each decoded pixel is either the +64 relocation of the source index,
    // or 255 where the source was the transparent background (index 8).
    const srcFrames = [...src.frameSet.frames.values()];
    for (let i = 0; i < srcFrames.length; i++) {
      const s = srcFrames[i].indices, d = re.images[i].image.indices;
      for (let p = 0; p < s.length; p++) {
        expect(d[p]).toBe(s[p] === 8 ? 255 : s[p] + 64);
      }
    }
  });

  const bothSources = existsSync(amiga('disk2', 'BIGPIC1.DAA')) && existsSync(amiga('disk2', 'comspr.daa'));
  it.skipIf(!bothSources)('buildPortableArtOverrides lifts BIGPIC + COMSPR from real Amiga sources', () => {
    const sources = {
      'BIGPIC1.DAA': decodeDaa(rd(amiga('disk2', 'BIGPIC1.DAA')), 'BIGPIC1.DAA'),
      'comspr.daa': decodeDaa(rd(amiga('disk2', 'comspr.daa')), 'comspr.daa'),
    };
    const res = buildPortableArtOverrides(sources);
    expect(res.lifted.map((l) => l.target).sort()).toEqual(['BIGPIC.TLB', 'COMSPR.TLB']);
    expect(Object.keys(res.overrides).sort()).toEqual(['BIGPIC.TLB', 'COMSPR.TLB']);
    // Each override is a valid HLIB that re-decodes to art (master for BIGPIC, leaf for COMSPR).
    expect(decodeHlib(res.overrides['BIGPIC.TLB'], 'B').tag).toBe('HLIB');
    const comspr = decodeHlib(res.overrides['COMSPR.TLB'], 'C');
    expect(comspr.tag).toBe('TILE');
    expect(comspr.images.every((m) => m.drawMethod === 21)).toBe(true);
  });

  it('buildPortableArtOverrides reports portable targets with no supplied source as unavailable', () => {
    const res = buildPortableArtOverrides({});
    expect(res.lifted).toHaveLength(0);
    expect(Object.keys(res.overrides)).toHaveLength(0);
    expect(res.unavailable.map((u) => u.target).sort()).toEqual(['BIGPIC.TLB', 'COMSPR.TLB']);
  });

  it.skipIf(!existsSync(amiga('disk2', 'BIGPIC1.DAA')))('refuses a non-portable target with the verdict', () => {
    const src = decodeDaa(rd(amiga('disk2', 'BIGPIC1.DAA')), 'BIGPIC1.DAA');
    // SPRIT.TLB's Amiga source (SPRIT1.DAA) now DECODES (the 6-byte sub-frame index is solved), but
    // its frame geometry/count doesn't match SPRIT.TLB's — so the verdict is shape-mismatch, not
    // blocked-unsolved-source (see dqkArtMap.ts's module doc for the taxonomy + the reclassification).
    expect(() => buildAmigaArtOverride('SPRIT.TLB', src)).toThrow(/shape-mismatch/);
    expect(() => buildAmigaArtOverride('DUNGCOM.TLB', src)).toThrow(/shape-mismatch/);
    expect(() => buildAmigaArtOverride('FINAL.TLB', src)).toThrow(/no-amiga-source/);
    expect(() => buildAmigaArtOverride('NOPE.TLB', src)).toThrow(/unknown DQK art TLB/);
  });
});

describe('shape-mismatch verdicts reflect reality (SPRIT1.DAA / pic1.daa now decode real frames)', () => {
  it.skipIf(!existsSync(amiga('disk2', 'SPRIT1.DAA')))(
    'SPRIT1.DAA / pic1.daa decode real frames now that the 6-byte sub-frame index is solved',
    () => {
      // 6-byte sub-frame index (SPRIT/PIC/HEAD) — SOLVED 2026-06-25 (see daa.ts's module doc).
      // Both files decode real art now, but neither has enough distinct sprites/portraits to match
      // its DQK target 1:1 (SPRIT.TLB wants 96 72×25 icons; pic1.daa's 27 base ids can't fill
      // PICA+PICB+PICC's combined 120 88×88 slots) — hence 'shape-mismatch', not 'blocked-unsolved-source'.
      for (const f of ['SPRIT1.DAA', 'pic1.daa']) {
        const arc = decodeDaa(rd(amiga('disk2', f)), f);
        expect(arc.kind, `${f} is the 6-byte sub-frame index form`).toBe('index');
        expect(arc.frameSet.frames.size, `${f} decodes real frames`).toBeGreaterThan(0);
      }
    },
  );
});

describe('buildMappedArtOverride — M8.S4 mechanical repack of a human-authored mapping', () => {
  it.skipIf(!existsSync(amiga('disk2', 'SPRIT1.DAA')))(
    'a sprite-slot mapping onto SPRIT.TLB (master, drawMethod 23) repacks a real SPRIT1.DAA frame',
    () => {
      // SPRIT.TLB is drawMethod 23 ("compressed transparent"). This used to be a surfaced limitation —
      // encodeHlibImage only implemented 16/18/21, so ANY buildMappedArtOverride('SPRIT.TLB', ...)
      // threw. The method-23 encoder now exists (hlibEncode.ts's encodeMethod23, byte-exact against
      // the real SPRIT.TLB streams — see hlibEncode.test.ts), so the same mapping that used to throw
      // now yields a real, decodeHlib-readable master with a compressed-transparent sprite frame.
      const src = decodeDaa(rd(amiga('disk2', 'SPRIT1.DAA')), 'SPRIT1.DAA');
      expect(src.kind).toBe('index');
      if (src.kind !== 'index') return;
      const b12 = src.subFrames.find((s) => s.blockId === 12)!;
      expect(b12).toBeTruthy();
      expect(b12.frames[0]).toBeTruthy();
      let mapping: AmigaSlotMapping = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
      mapping = assignSlot(mapping, 2, 12, 0);

      const bytes = buildMappedArtOverride('SPRIT.TLB', { 'SPRIT1.DAA': src }, mapping);
      const re = decodeHlib(bytes, 'SPRIT.TLB');
      expect(re.tag, 'SPRIT.TLB is a master HLIB').toBe('HLIB');
      expect(re.images.length).toBe(1);
      expect(re.images[0].drawMethod).toBe(23);
      expect(re.images[0].image.transparentIndex).toBe(255);

      const entry = dqkArtEntry('SPRIT.TLB')!;
      const img = re.images[0].image;
      expect(img.width, 'cropped to the target width').toBe(entry.width); // 72
      expect(img.height, 'cropped to the target height').toBe(entry.height); // 25
      // Pixel-exact: relocate to SPRIT's palette base (176) then crop the 88×88 source's top-left
      // 72×25 window — the same mechanical transform every other mapped target gets; the method-23
      // compression in between is lossless.
      const vga = amigaImageToVga(b12.frames[0], entry.paletteBase!);
      const expected = new Uint8Array(entry.width * entry.height);
      for (let y = 0; y < entry.height; y++) {
        for (let x = 0; x < entry.width; x++) expected[y * entry.width + x] = vga.indices[y * vga.width + x];
      }
      expect([...img.indices]).toEqual([...expected]);
    },
  );

  it.skipIf(!existsSync(amiga('disk2', '8X8D1.DAA')))(
    'a hand-authored 3-slot mapping onto 8X8DC.TLB (master) crop-fits real 8X8D1.DAA frames',
    () => {
      const src = decodeDaa(rd(amiga('disk2', '8X8D1.DAA')), '8X8D1.DAA');
      expect(src.kind).toBe('blocks');
      if (src.kind !== 'blocks') return;
      // Real blocks confirmed present: 202/203/11, each one 8x8 frame (a smoke check, not invented);
      // 8X8DC.TLB's target geometry is 8x1, so this exercises a real HEIGHT-only crop.
      const b202 = src.blocks.find((b) => b.blockId === 202 && b.image)!;
      const b203 = src.blocks.find((b) => b.blockId === 203 && b.image)!;
      const b11 = src.blocks.find((b) => b.blockId === 11 && b.image)!;
      expect(b202 && b203 && b11, 'blocks 202/203/11 exist in 8X8D1.DAA').toBeTruthy();

      let mapping: AmigaSlotMapping = createEmptySlotMapping('8X8DC.TLB', '8X8D1.DAA');
      mapping = assignSlot(mapping, 2, 202, 0);
      mapping = assignSlot(mapping, 40, 203, 0);
      mapping = assignSlot(mapping, 200, 11, 0);

      const bytes = buildMappedArtOverride('8X8DC.TLB', { '8X8D1.DAA': src }, mapping);
      const re = decodeHlib(bytes, '8X8DC.TLB');
      expect(re.tag, '8X8DC.TLB is a master HLIB').toBe('HLIB');
      // Only the 3 ASSIGNED slots are packed (no invented data for the other 373) — in ascending slot order.
      expect(re.images.length).toBe(3);

      const entry = dqkArtEntry('8X8DC.TLB')!;
      for (const img of re.images.map((m) => m.image)) {
        expect(img.width, 'cropped to the target width').toBe(entry.width);
        expect(img.height, 'cropped to the target height').toBe(entry.height);
      }

      // Pixel-exact: relocate (real amigaImageToVga, the same relocation buildAmigaArtOverride uses) THEN
      // crop the top-left 8x1 window. No invented pixels, only real source data + a mechanical crop.
      const cropTopLeft = (vga: { width: number; indices: Uint8Array }, w: number, h: number): Uint8Array => {
        const out = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = vga.indices[y * vga.width + x];
        return out;
      };
      const expectedPixels = [
        cropTopLeft(amigaImageToVga(b202.image!, entry.paletteBase!), entry.width, entry.height),
        cropTopLeft(amigaImageToVga(b203.image!, entry.paletteBase!), entry.width, entry.height),
        cropTopLeft(amigaImageToVga(b11.image!, entry.paletteBase!), entry.width, entry.height),
      ];
      for (let i = 0; i < 3; i++) {
        expect([...re.images[i].image.indices]).toEqual([...expectedPixels[i]]);
      }
    },
  );

  it.skipIf(!existsSync(amiga('disk2', 'BODY1.DAA')))(
    'a 1-slot mapping onto CBODY.TLB (leaf) crop-fits the real BODY1.DAA frame',
    () => {
      const src = decodeDaa(rd(amiga('disk2', 'BODY1.DAA')), 'BODY1.DAA');
      expect(src.kind).toBe('blocks');
      if (src.kind !== 'blocks') return;
      const block = src.blocks.find((b) => b.blockId === 68 && b.image);
      expect(block, 'block 68 has a decoded image').toBeTruthy();
      if (!block?.image) return;

      let mapping: AmigaSlotMapping = createEmptySlotMapping('CBODY.TLB', 'BODY1.DAA');
      mapping = assignSlot(mapping, 3, 68, 0);

      const bytes = buildMappedArtOverride('CBODY.TLB', { 'BODY1.DAA': src }, mapping);
      const re = decodeHlib(bytes, 'CBODY.TLB');
      expect(re.tag, 'CBODY.TLB is a leaf TILE').toBe('TILE');
      expect(re.images.length).toBe(1);

      const entry = dqkArtEntry('CBODY.TLB')!;
      expect(re.images[0].image.width).toBe(entry.width);
      expect(re.images[0].image.height).toBe(entry.height);
      const vga = amigaImageToVga(block.image, entry.paletteBase!);
      const expected = new Uint8Array(entry.width * entry.height);
      for (let y = 0; y < entry.height; y++) {
        for (let x = 0; x < entry.width; x++) expected[y * entry.width + x] = vga.indices[y * vga.width + x];
      }
      expect([...re.images[0].image.indices]).toEqual([...expected]);
    },
  );

  it.skipIf(!existsSync(amiga('disk2', 'CPIC1.DAA')))(
    'a 1-slot mapping onto CPIC.TLB (leaf, target LARGER than source) pads the real CPIC1.DAA frame',
    () => {
      const src = decodeDaa(rd(amiga('disk2', 'CPIC1.DAA')), 'CPIC1.DAA');
      expect(src.kind).toBe('blocks');
      if (src.kind !== 'blocks') return;
      // Real: block 129 is 24x24 vs CPIC.TLB's 48x48 target — a genuine pad case (both dims grow),
      // unlike the SPRIT/CBODY tests above which crop (both dims shrink).
      const block = src.blocks.find((b) => b.blockId === 129 && b.image);
      expect(block, 'block 129 has a decoded image').toBeTruthy();
      if (!block?.image) return;
      expect(block.image.width, 'source is smaller than the target (pad case)').toBeLessThan(48);
      expect(block.image.height).toBeLessThan(48);

      let mapping: AmigaSlotMapping = createEmptySlotMapping('CPIC.TLB', 'CPIC1.DAA');
      mapping = assignSlot(mapping, 5, 129, 0);

      const bytes = buildMappedArtOverride('CPIC.TLB', { 'CPIC1.DAA': src }, mapping);
      const re = decodeHlib(bytes, 'CPIC.TLB');
      expect(re.tag, 'CPIC.TLB is a leaf TILE').toBe('TILE');
      expect(re.images.length).toBe(1);

      const entry = dqkArtEntry('CPIC.TLB')!;
      expect(re.images[0].image.width).toBe(entry.width);
      expect(re.images[0].image.height).toBe(entry.height);
      // The real source pixels land unshifted at the top-left; the padded border is filled with the
      // HLIB transparent key (255, since CPIC.TLB's draw method 21 is see-through) — not invented art.
      const vga = amigaImageToVga(block.image, entry.paletteBase!);
      const out = re.images[0].image.indices;
      for (let y = 0; y < entry.height; y++) {
        for (let x = 0; x < entry.width; x++) {
          const expected = x < vga.width && y < vga.height ? vga.indices[y * vga.width + x] : 255;
          expect(out[y * entry.width + x], `pixel (${x},${y})`).toBe(expected);
        }
      }
    },
  );

  it('validates strictly: unknown target, non-shape-mismatch target, missing source, missing frame, empty mapping', () => {
    const empty = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
    expect(() => buildMappedArtOverride('NOPE.TLB', {}, empty)).toThrow(/unknown DQK art TLB/);

    const bigpicMapping = createEmptySlotMapping('BIGPIC.TLB', 'BIGPIC1.DAA');
    expect(() => buildMappedArtOverride('BIGPIC.TLB', {}, bigpicMapping)).toThrow(/shape-mismatch targets/);

    let m = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
    m = assignSlot(m, 0, 1, 0);
    expect(() => buildMappedArtOverride('SPRIT.TLB', {}, m)).toThrow(/not supplied/);

    expect(() => buildMappedArtOverride('SPRIT.TLB', { 'SPRIT1.DAA': {} as never }, empty)).toThrow(/no assignments/);

    // Out-of-range slot -> fails validateSlotMapping before ever touching the source.
    let bad = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
    bad = assignSlot(bad, 999, 1, 0);
    expect(() => buildMappedArtOverride('SPRIT.TLB', {}, bad)).toThrow(/invalid mapping/);
  });

  it.skipIf(!existsSync(amiga('disk2', '8X8D1.DAA')))(
    'buildPortableArtOverrides upgrades a shape-mismatch target from untouched to lifted when a mapping is supplied (synthetic)',
    () => {
      const src = decodeDaa(rd(amiga('disk2', '8X8D1.DAA')), '8X8D1.DAA');
      expect(src.kind).toBe('blocks');
      if (src.kind !== 'blocks') return;

      // With no mappings at all, shape-mismatch targets are untouched (neither lifted nor unavailable).
      const noMappings = buildPortableArtOverrides({ '8X8D1.DAA': src });
      expect(noMappings.lifted.some((l) => l.target === '8X8DC.TLB')).toBe(false);
      expect(noMappings.unavailable.some((u) => u.target === '8X8DC.TLB')).toBe(false);
      expect(noMappings.overrides['8X8DC.TLB']).toBeUndefined();

      let mapping: AmigaSlotMapping = createEmptySlotMapping('8X8DC.TLB', '8X8D1.DAA');
      mapping = assignSlot(mapping, 0, 202, 0);
      const withMapping = buildPortableArtOverrides({ '8X8D1.DAA': src }, [mapping]);
      expect(withMapping.lifted).toContainEqual({ target: '8X8DC.TLB', from: '8X8D1.DAA' });
      expect(decodeHlib(withMapping.overrides['8X8DC.TLB'], '8X8DC.TLB').images.length).toBe(1);

      // An invalid mapping (bad target) reports unavailable, not a thrown error.
      const badMapping: AmigaSlotMapping = { target: '8X8DC.TLB', source: '8X8D1.DAA', assignments: [{ slot: 999, sourceBlockId: 202, frameIndex: 0 }] };
      const withBadMapping = buildPortableArtOverrides({ '8X8D1.DAA': src }, [badMapping]);
      expect(withBadMapping.unavailable).toContainEqual({ target: '8X8DC.TLB', from: '8X8D1.DAA' });
      expect(withBadMapping.overrides['8X8DC.TLB']).toBeUndefined();
    },
  );
});

describe('committed CoK Amiga→DQK art-slot mapping (packages/engine/data/cok-amiga-art-mappings.json)', () => {
  // The curated wave-1 mapping: every assignment is evidence-based (set-id/block-id parity +
  // exact 88×88 dimension parity — see the JSON's `provenance`/`unmapped` for the full audit).
  const mappingDoc = JSON.parse(
    readFileSync(resolve(here, '..', 'data', 'cok-amiga-art-mappings.json'), 'utf8'),
  ) as {
    game: string;
    mappings: AmigaSlotMapping[];
    provenance: { target: string; slot: number }[];
    unmapped: { target: string; slot: number; reason: string }[];
  };

  it('every committed mapping is schema-valid and validates against DQK_ART_LAYOUT', () => {
    expect(mappingDoc.game).toBe('cok');
    expect(Array.isArray(mappingDoc.mappings)).toBe(true);
    expect(mappingDoc.mappings.length).toBeGreaterThan(0);
    for (const m of mappingDoc.mappings) {
      // Round-trip through the strict deserializer (the same gate the editor's JSON import uses).
      const parsed = deserializeSlotMapping(JSON.stringify(m));
      const v = validateSlotMapping(parsed, DQK_ART_LAYOUT);
      expect(v.valid, `${m.target}: ${v.errors.join('; ')}`).toBe(true);
      expect(parsed.assignments.length, `${m.target} is not an empty mapping`).toBeGreaterThan(0);
      // Every assignment has a provenance record — no unexplained slot.
      for (const a of parsed.assignments) {
        expect(
          mappingDoc.provenance.some((p) => p.target === m.target && p.slot === a.slot),
          `${m.target} slot ${a.slot} has provenance`,
        ).toBe(true);
      }
    }
  });

  it('families with no evidence-based assignment are documented gaps, not silently missing', () => {
    const mapped = new Set(mappingDoc.mappings.map((m) => m.target));
    const gapTargets = new Set(mappingDoc.unmapped.map((u) => u.target));
    // PICB/PICC: CoK picture ids (0..73) never reach their 128+ set-id ranges; SPRIT: blocked on
    // mechanical repack gaps (crop anchoring + transparent keying). All three must be explained.
    for (const t of ['PICB.TLB', 'PICC.TLB', 'SPRIT.TLB']) {
      expect(mapped.has(t), `${t} deliberately carries no mapping`).toBe(false);
      expect(gapTargets.has(t), `${t} is documented in unmapped`).toBe(true);
    }
    for (const u of mappingDoc.unmapped) {
      expect(u.reason.length, `${u.target} gap has a real reason`).toBeGreaterThan(20);
    }
  });

  const picaPath = dqk('DISK2', 'PICA.TLB');
  const pic1Path = amiga('disk2', 'pic1.daa');
  const pic2Path = amiga('disk3', 'pic2.daa');
  const allPicBytes = existsSync(picaPath) && existsSync(pic1Path) && existsSync(pic2Path);
  it.skipIf(!allPicBytes)(
    'PICA mapping: exact dimension parity against the real .TLB + pixel-exact repack from real pic1/pic2.daa',
    () => {
      const m = mappingDoc.mappings.find((x) => x.target === 'PICA.TLB')!;
      expect(m).toBeTruthy();
      const target = decodeHlib(rd(picaPath), 'PICA.TLB');
      const sources = {
        'pic1.daa': decodeDaa(rd(pic1Path), 'pic1.daa'),
        'pic2.daa': decodeDaa(rd(pic2Path), 'pic2.daa'),
      };
      const frameFor = (a: { sourceBlockId: number; frameIndex: number; source?: string }) => {
        const src = sources[(a.source ?? m.source) as keyof typeof sources];
        expect(src.kind).toBe('index');
        if (src.kind !== 'index') return null;
        return src.subFrames.find((s) => s.blockId === a.sourceBlockId)?.frames[a.frameIndex] ?? null;
      };

      // Dimension-parity gate: each assigned slot is a real 88×88 method-18 base picture, and the
      // assigned Amiga frame matches it EXACTLY (no crop, no pad — the curation rule). Slot 17 is
      // the pic1-only id 30 assignment (per-assignment `source` override).
      expect(m.assignments.some((a) => a.slot === 17 && a.source === 'pic1.daa')).toBe(true);
      for (const a of m.assignments) {
        const slotMember = target.images[a.slot];
        expect(slotMember, `slot ${a.slot} exists in the real PICA.TLB`).toBeTruthy();
        const frame = frameFor(a);
        expect(frame, `${a.source ?? m.source} block ${a.sourceBlockId}.${a.frameIndex} decodes`).toBeTruthy();
        expect(frame!.width, `slot ${a.slot} width parity`).toBe(slotMember.image.width);
        expect(frame!.height, `slot ${a.slot} height parity`).toBe(slotMember.image.height);
        expect(slotMember.drawMethod, `slot ${a.slot} is a base picture (m18)`).toBe(18);
      }

      // End-to-end (legacy assigned-slots-only mode): the committed mapping repacks into a decodable
      // master whose pixels are the relocated Amiga source exactly (dims equal → crop/pad no-op).
      const bytes = buildMappedArtOverride('PICA.TLB', sources, m);
      const re = decodeHlib(bytes, 'PICA.TLB');
      expect(re.tag).toBe('HLIB');
      expect(re.images.length).toBe(m.assignments.length);
      const entry = dqkArtEntry('PICA.TLB')!;
      const sorted = [...m.assignments].sort((x, y) => x.slot - y.slot);
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i];
        const vga = amigaImageToVga(frameFor(a)!, entry.paletteBase!);
        const img = re.images[i].image;
        expect(img.width).toBe(entry.width);
        expect(img.height).toBe(entry.height);
        expect(re.images[i].drawMethod).toBe(entry.drawMethod);
        expect(img.palette!.firstColor).toBe(entry.paletteBase);
        expect([...img.indices], `slot ${a.slot} pixels are the relocated Amiga source`).toEqual([...vga.indices]);
      }

      // And the assembly front-door lifts it (the path tools/build-dqk-dir.mts drives).
      const res = buildPortableArtOverrides(sources, mappingDoc.mappings);
      expect(res.lifted).toContainEqual({ target: 'PICA.TLB', from: 'pic2.daa' });
      expect(res.overrides['PICA.TLB']).toBeInstanceOf(Uint8Array);
    },
  );
});

/** Parse a container's pointer list (LE) — for slicing raw members in byte-preservation checks. */
function containerPtrs(bytes: Uint8Array): number[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = dv.getUint16(8, true) + 1;
  const ptrs: number[] = [];
  for (let i = 0; i < count; i++) ptrs.push(dv.getUint32(16 + 4 * i, true));
  return ptrs;
}

describe('drop-in override rebuild — real set-id table + verbatim carry-over + transparent keying (gaps a/b)', () => {
  const picaPath = dqk('DISK2', 'PICA.TLB');
  const spritPath = dqk('DISK2', 'SPRIT.TLB');
  const pic1Path = amiga('disk2', 'pic1.daa');
  const pic2Path = amiga('disk3', 'pic2.daa');
  const sprit1Path = amiga('disk2', 'SPRIT1.DAA');

  const mappingDoc = JSON.parse(
    readFileSync(resolve(here, '..', 'data', 'cok-amiga-art-mappings.json'), 'utf8'),
  ) as { mappings: AmigaSlotMapping[] };

  it.skipIf(!existsSync(picaPath) || !existsSync(pic1Path) || !existsSync(pic2Path))(
    'PICA drop-in: full id coverage, set-id table byte-preserved, unmapped sets verbatim, mapped slots replaced',
    () => {
      const m = mappingDoc.mappings.find((x) => x.target === 'PICA.TLB')!;
      const original = rd(picaPath);
      const sources = {
        'pic1.daa': decodeDaa(rd(pic1Path), 'pic1.daa'),
        'pic2.daa': decodeDaa(rd(pic2Path), 'pic2.daa'),
      };
      const bytes = buildMappedArtOverride('PICA.TLB', sources, m, original);
      const origDecoded = decodeHlib(original, 'PICA.TLB');
      const re = decodeHlib(bytes, 'PICA.TLB');

      // Drop-in: SAME flattened image coverage as the original (37 images, not just the 7 mapped).
      expect(re.tag).toBe('HLIB');
      expect(re.images.length).toBe(origDecoded.images.length);

      // Set-id table (member[0]) preserved byte-for-byte — the engine's picture-id lookup works.
      const op = containerPtrs(original);
      const np = containerPtrs(bytes);
      expect(np.length, 'same member count').toBe(op.length);
      expect([...bytes.subarray(np[0], np[1])]).toEqual([...original.subarray(op[0], op[1])]);

      // Every set that holds NO mapped slot is carried over verbatim (byte-identical slice).
      const refs = mapHlibMasterSlots(original);
      const mappedSets = new Set(m.assignments.map((a) => refs[a.slot].setPtrIndex));
      let verbatimSets = 0;
      for (let si = 1; si < op.length - 1; si++) {
        if (mappedSets.has(si)) continue;
        expect(
          Buffer.from(bytes.subarray(np[si], np[si + 1])).equals(Buffer.from(original.subarray(op[si], op[si + 1]))),
          `set ptr ${si} carried over verbatim`,
        ).toBe(true);
        verbatimSets++;
      }
      expect(verbatimSets).toBeGreaterThan(0);

      // Mapped slots: pixels are the relocated Amiga source, at the slot's own dims and method.
      const entry = dqkArtEntry('PICA.TLB')!;
      for (const a of m.assignments) {
        const src = sources[(a.source ?? m.source) as keyof typeof sources];
        if (src.kind !== 'index') throw new Error('unexpected');
        const frame = src.subFrames.find((s) => s.blockId === a.sourceBlockId)!.frames[a.frameIndex]!;
        const vga = amigaImageToVga(frame, entry.paletteBase!);
        const slot = re.images[a.slot];
        expect(slot.drawMethod, `slot ${a.slot} keeps its original method`).toBe(origDecoded.images[a.slot].drawMethod);
        expect(slot.image.width).toBe(origDecoded.images[a.slot].image.width);
        expect(slot.image.height).toBe(origDecoded.images[a.slot].image.height);
        expect([...slot.image.indices], `slot ${a.slot} pixels`).toEqual([...vga.indices]);
        // The Amiga palette slice was patched into the set's colour table.
        for (let c = 0; c < 32; c++) {
          expect(slot.image.palette!.colors[32 + c], `slot ${a.slot} colour ${32 + c}`).toEqual(vga.palette.colors[32 + c]);
        }
      }

      // Unmapped slots still decode pixel-identical to the original (not just byte-identical sets).
      const mappedSlots = new Set(m.assignments.map((a) => a.slot));
      for (let i = 0; i < re.images.length; i++) {
        if (mappedSlots.has(i)) continue;
        expect(
          Buffer.from(re.images[i].image.indices).equals(Buffer.from(origDecoded.images[i].image.indices)),
          `unmapped slot ${i} pixels unchanged`,
        ).toBe(true);
      }

      // The assembly front-door emits the drop-in form when originals are supplied.
      const res = buildPortableArtOverrides(sources, mappingDoc.mappings, { 'PICA.TLB': original });
      expect(res.lifted).toContainEqual({ target: 'PICA.TLB', from: 'pic2.daa' });
      expect(decodeHlib(res.overrides['PICA.TLB'], 'PICA.TLB').images.length).toBe(origDecoded.images.length);
    },
  );

  it.skipIf(!existsSync(spritPath) || !existsSync(sprit1Path))(
    'SPRIT ad-hoc drop-in: per-slot crop dims (not table-wide) + method-23 transparency mask round-trip',
    () => {
      // No SPRIT mapping is COMMITTED (the 11 candidates fail the evidence gate — see the JSON's
      // unmapped audit); this ad-hoc mapping validates the MECHANICS the gate closure delivered:
      // per-slot crop geometry and measured-background transparent keying on a method-23 master.
      const original = rd(spritPath);
      const src = decodeDaa(rd(sprit1Path), 'SPRIT1.DAA');
      expect(src.kind).toBe('index');
      if (src.kind !== 'index') return;
      const b25 = src.subFrames.find((s) => s.blockId === 25)!;
      const frame = b25.frames[1]; // combat-view frame: art on a plain index-0 background
      expect(frame).toBeTruthy();

      let mapping: AmigaSlotMapping = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
      mapping = assignSlot(mapping, 0, 25, 1); // original slot 0 is 72×25 (the table-wide crop of old)
      mapping = assignSlot(mapping, 3, 25, 1); // original slot 3 is 72×45 — must differ from slot 0
      mapping = assignSlot(mapping, 39, 25, 1); // original slot 39 is 88×88 — a no-crop slot

      const bytes = buildMappedArtOverride('SPRIT.TLB', { 'SPRIT1.DAA': src }, mapping, original);
      const origDecoded = decodeHlib(original, 'SPRIT.TLB');
      const re = decodeHlib(bytes, 'SPRIT.TLB');
      expect(re.images.length).toBe(origDecoded.images.length); // full 96-image coverage

      // Set-id table byte-preservation for SPRIT too.
      const op = containerPtrs(original);
      const np = containerPtrs(bytes);
      expect([...bytes.subarray(np[0], np[1])]).toEqual([...original.subarray(op[0], op[1])]);

      // Per-slot crop: each mapped slot keeps ITS OWN original geometry (72×25 vs 72×45 vs 88×88 —
      // the old builder cropped everything to the table's 72×25).
      const dims = [
        { slot: 0, w: 72, h: 25 },
        { slot: 3, w: 72, h: 45 },
        { slot: 39, w: 88, h: 88 },
      ];
      const base = dqkArtEntry('SPRIT.TLB')!.paletteBase!; // 176
      for (const { slot, w, h } of dims) {
        const img = re.images[slot].image;
        expect(img.width, `slot ${slot} width`).toBe(w);
        expect(img.height, `slot ${slot} height`).toBe(h);
        expect(re.images[slot].drawMethod, `slot ${slot} stays method 23`).toBe(23);
        // Transparency round-trip: the frame's measured background (index 0 here) decodes as the 255
        // key — the same transparent-pixel MASK as the Amiga source — and art pixels relocate by +176.
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const s = frame.indices[y * frame.width + x];
            const d = img.indices[y * w + x];
            if (s === 0) expect(d, `slot ${slot} (${x},${y}) transparent`).toBe(255);
            else expect(d, `slot ${slot} (${x},${y}) art`).toBe(s + base);
          }
        }
      }

      // Unmapped sets carried over verbatim (slots 0/3 live in sets p1/p2, 39 in p14).
      const refs = mapHlibMasterSlots(original);
      const mappedSets = new Set([0, 3, 39].map((s) => refs[s].setPtrIndex));
      for (let si = 1; si < op.length - 1; si++) {
        if (mappedSets.has(si)) continue;
        expect(
          Buffer.from(bytes.subarray(np[si], np[si + 1])).equals(Buffer.from(original.subarray(op[si], op[si + 1]))),
          `SPRIT set ptr ${si} verbatim`,
        ).toBe(true);
      }
    },
  );

  it('per-assignment source: schema round-trips and a missing override archive throws "not supplied"', () => {
    const json = JSON.stringify({
      target: 'PICA.TLB',
      source: 'pic2.daa',
      assignments: [{ slot: 17, sourceBlockId: 30, frameIndex: 0, source: 'pic1.daa' }],
    });
    const parsed = deserializeSlotMapping(json);
    expect(parsed.assignments[0].source).toBe('pic1.daa');
    expect(validateSlotMapping(parsed, DQK_ART_LAYOUT).valid).toBe(true);
    // Only pic2 supplied -> the pic1-sourced assignment must fail loudly, naming the archive.
    expect(() =>
      buildMappedArtOverride('PICA.TLB', { 'pic2.daa': { kind: 'index', subFrames: [], blocks: [], frameSet: { name: '', frames: new Map(), kind: 'unknown' }, name: 'pic2.daa', dataBase: 0 } as never }, parsed),
    ).toThrow(/"pic1\.daa" not supplied/);
  });

  it('drop-in mode refuses a leaf target (only master rebuild is implemented)', () => {
    const mapping: AmigaSlotMapping = {
      target: 'CBODY.TLB',
      source: 'BODY1.DAA',
      assignments: [{ slot: 0, sourceBlockId: 68, frameIndex: 0 }],
    };
    expect(() =>
      buildMappedArtOverride('CBODY.TLB', {}, mapping, new Uint8Array(64)),
    ).toThrow(/only implemented for master targets/);
  });
});
