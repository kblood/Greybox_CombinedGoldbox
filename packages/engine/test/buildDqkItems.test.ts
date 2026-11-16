/**
 * Gen1 (CoK/DoK) item files → DQK `ITEM.DAT`/`ITEMS.DAT` build overrides (DoK M4 build-audit gap 1,
 * `cok-content-port-plan.md` §9) — proven on REAL game bytes:
 *
 *  1) On-disk shape: the real `DISK1/ITEM.DAT` is 254 × 17-byte slots (byte 17 of the canonical
 *     18-byte record dropped); the emitted overrides are byte-length-identical to stock.
 *  2) Catalogue carry: both Gen1 `ITEMS` files are 2-byte-prefix + the same 128×16 record layout as
 *     `ITEMS.DAT`; known AD&D stats resolve through real item instances' base-type pointers, and the
 *     Gen1 catalogue genuinely differs from DQK's own (which is why the override matters).
 *  3) Index preservation: DoK slot *i* is DoK item *i* byte-for-byte; CoK records port in
 *     disk → block → record order with their names VOCAB-recoded.
 *  4) The overrides actually reach a `planDqkBuild` plan as emitted DISK1 files (the wiring the
 *     audit found missing — previously both files fell through to copy-verbatim-from-DQK).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDokItemDat,
  buildCokItemDat,
  buildGen1ItemOverrides,
  packDqkItemDat,
  portGen1ItemsCatalogueToDqk,
  DQK_ITEM_DAT_STRIDE,
  DQK_ITEM_DAT_SLOTS,
  DQK_ITEMS_DAT_SIZE,
  decodeDokItemArchive,
  decodeItemArchive,
  decodeDqkItemsCatalogue,
  decodeDqkItemRecord,
  nameFromCodes,
  DQK_VOCAB,
  buildDqkGameData,
  planDqkBuild,
  DQK_TITLE,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const cokDir = resolve(repoRoot, 'Champions of Krynn');
const dokDir = resolve(repoRoot, 'Death Knights of Krynn');
const dqkDir = resolve(repoRoot, 'The Dark Queen of Krynn');

const bytes = async (p: string) => new Uint8Array(await readFile(p));

/** Decode ITEM.DAT slot `i` (17-byte stride) through the canonical 18-byte record decoder. */
function decodeSlot(itemDat: Uint8Array, i: number) {
  const rec = new Uint8Array(18);
  rec.set(itemDat.subarray(i * DQK_ITEM_DAT_STRIDE, (i + 1) * DQK_ITEM_DAT_STRIDE));
  return decodeDqkItemRecord(rec, i);
}

const dqkNameOf = (itemDat: Uint8Array, i: number): string => {
  const r = decodeSlot(itemDat, i);
  return nameFromCodes([r.nameCodes[2], r.nameCodes[1], r.nameCodes[0]], DQK_VOCAB);
};

describe('packDqkItemDat — on-disk shape', () => {
  it('emits 254 × 17-byte slots (stock ITEM.DAT byte length) and drops the always-zero byte 17', () => {
    const rec = new Uint8Array(18).fill(7);
    rec[17] = 0;
    const out = packDqkItemDat([rec]);
    expect(out.length).toBe(DQK_ITEM_DAT_SLOTS * DQK_ITEM_DAT_STRIDE); // 4318 = the stock file size
    expect(Array.from(out.subarray(0, 17))).toEqual(Array.from(rec.subarray(0, 17)));
    expect(out.subarray(17).every((b) => b === 0)).toBe(true); // zero-filled tail slots
  });

  it('refuses too many records or a too-short record (nothing silently dropped)', () => {
    const rec = new Uint8Array(18);
    expect(() => packDqkItemDat(Array.from({ length: DQK_ITEM_DAT_SLOTS + 1 }, () => rec))).toThrow(/exceed/);
    expect(() => packDqkItemDat([new Uint8Array(10)])).toThrow(/too small/);
  });

  it.skipIf(!existsSync(resolve(dqkDir, 'DISK1', 'ITEM.DAT')))(
    'the real DISK1/ITEM.DAT has exactly this shape (254 × 17)',
    async () => {
      const real = await bytes(resolve(dqkDir, 'DISK1', 'ITEM.DAT'));
      expect(real.length).toBe(DQK_ITEM_DAT_SLOTS * DQK_ITEM_DAT_STRIDE);
      // Stride-17 slots decode as plausible catalogue-pointing records ("Battle Axe" at slot 1).
      expect(dqkNameOf(real, 1)).toBe('Battle Axe');
      expect(dqkNameOf(real, 2)).toBe('Hand Axe');
    },
  );
});

describe('portGen1ItemsCatalogueToDqk — the Gen1 ITEMS catalogue carry', () => {
  const cokItems = resolve(cokDir, 'ITEMS');
  const dokItems = resolve(dokDir, 'ITEMS');
  const dqkItems = resolve(dqkDir, 'DISK1', 'ITEMS.DAT');

  it('throws on a file too small to hold prefix + full catalogue', () => {
    expect(() => portGen1ItemsCatalogueToDqk(new Uint8Array(100))).toThrow(/too small/);
  });

  it.skipIf(!existsSync(cokItems) || !existsSync(dokItems))(
    'CoK and DoK ship near-identical catalogues; the carry is the 2048-byte ITEMS.DAT shape',
    async () => {
      const cok = portGen1ItemsCatalogueToDqk(await bytes(cokItems));
      const dok = portGen1ItemsCatalogueToDqk(await bytes(dokItems));
      expect(cok.length).toBe(DQK_ITEMS_DAT_SIZE);
      // The two Gen1 games share one catalogue: measured 2 differing bytes of 2048 (a tiny DoK
      // touch-up, not a different table).
      let diff = 0;
      for (let i = 0; i < cok.length; i++) if (cok[i] !== dok[i]) diff++;
      expect(diff).toBeLessThanOrEqual(4);
      expect(decodeDqkItemsCatalogue(cok).length).toBe(128);
    },
  );

  it.skipIf(!existsSync(dokItems) || !existsSync(resolve(dokDir, 'ITEM0.DAX')))(
    'known AD&D stats resolve through real DoK instances\' base-type pointers',
    async () => {
      const cat = decodeDqkItemsCatalogue(portGen1ItemsCatalogueToDqk(await bytes(dokItems)));
      const items = decodeDokItemArchive(await bytes(resolve(dokDir, 'ITEM0.DAX')));
      const nameOf = (it: (typeof items)[number]) =>
        nameFromCodes([it.nameCodes[2], it.nameCodes[1], it.nameCodes[0]], DQK_VOCAB);
      const byName = (n: string) => items.find((i) => nameOf(i) === n)!;
      // Long Sword (base 18) → 1d8; Mace (8) → 1d6+1 (AD&D canon); Dart (5) → 1d3 — the same checks
      // that verified the layout in the audit-fix probe, now pinned as a regression test.
      expect(cat[byName('Long Sword').baseTypeId].damageVsSmall).toEqual({ count: 1, sides: 8, bonus: 0 });
      expect(cat[byName('Mace').baseTypeId].damageVsSmall).toEqual({ count: 1, sides: 6, bonus: 1 });
      expect(cat[byName('Dart').baseTypeId].damageVsSmall).toEqual({ count: 1, sides: 3, bonus: 0 });
    },
  );

  it.skipIf(!existsSync(dokItems) || !existsSync(dqkItems))(
    'the Gen1 catalogue genuinely differs from DQK\'s own (the override is not a no-op)',
    async () => {
      const gen1 = portGen1ItemsCatalogueToDqk(await bytes(dokItems));
      const dqk = await bytes(dqkItems);
      expect(gen1.length).toBe(dqk.length);
      expect(Buffer.from(gen1).equals(Buffer.from(dqk))).toBe(false);
    },
  );
});

describe('buildDokItemDat — DoK ITEM0.DAX → ITEM.DAT (loss-free, index-preserving)', () => {
  const item0 = resolve(dokDir, 'ITEM0.DAX');
  it.skipIf(!existsSync(item0))('slot i is DoK item i byte-for-byte; tail slots zero', async () => {
    const src = await bytes(item0);
    const out = buildDokItemDat(src);
    expect(out.length).toBe(DQK_ITEM_DAT_SLOTS * DQK_ITEM_DAT_STRIDE);
    const items = decodeDokItemArchive(src);
    expect(items.length).toBeGreaterThan(80); // the ~91 valid leading records
    for (const it of items) {
      const slot = out.subarray(it.index * DQK_ITEM_DAT_STRIDE, (it.index + 1) * DQK_ITEM_DAT_STRIDE);
      expect(Array.from(slot), `slot ${it.index}`).toEqual(Array.from(it.raw.subarray(0, 17)));
    }
    // Unused tail (after the valid run) is zero slots, not garbage.
    expect(out.subarray(items.length * DQK_ITEM_DAT_STRIDE).every((b) => b === 0)).toBe(true);
    // Spot: a real DoK item names correctly through the DQK decoder at its preserved index.
    const ls = items.find((i) => dqkNameOf(out, i.index) === 'Long Sword');
    expect(ls, 'a Long Sword instance survives at its own slot').toBeDefined();
  });
});

describe('buildCokItemDat — CoK ITEM1..3.DAX → ITEM.DAT (VOCAB-recoded)', () => {
  const paths = [1, 2, 3].map((n) => resolve(cokDir, `ITEM${n}.DAX`));
  it.skipIf(!paths.every((p) => existsSync(p)))('ports every record in disk→block→record order', async () => {
    const daxes = await Promise.all(paths.map(bytes));
    const out = buildCokItemDat(daxes);
    expect(out.length).toBe(DQK_ITEM_DAT_SLOTS * DQK_ITEM_DAT_STRIDE);
    const srcCount = daxes.reduce((n, a) => n + decodeItemArchive(a).length, 0);
    expect(srcCount).toBeGreaterThan(100); // 112 records across the three archives
    // Every source record occupies its flat-order slot; names render in DQK vocabulary.
    const names = Array.from({ length: srcCount }, (_, i) => dqkNameOf(out, i));
    expect(names).toContain('Long Sword');
    expect(names).toContain('Sling');
    // ITEM1.DAX record 5 is CoK's plain "Long Sword" (see cokItem.test.ts) — flat order keeps disk-1
    // records first, so it must appear in the first archive's span.
    const disk1Count = decodeItemArchive(daxes[0]).length;
    expect(names.slice(0, disk1Count)).toContain('Long Sword');
    // Base-type pointers stay catalogue-consistent: the ported Long Sword still points at a 1d8 entry
    // of the Gen1 catalogue (COAB type byte 0x2e — verified in the audit-fix probe).
    const cokItemsFile = resolve(cokDir, 'ITEMS');
    if (existsSync(cokItemsFile)) {
      const cat = decodeDqkItemsCatalogue(portGen1ItemsCatalogueToDqk(await bytes(cokItemsFile)));
      const lsIdx = names.indexOf('Long Sword');
      const ls = decodeSlot(out, lsIdx);
      expect(cat[ls.baseTypeId].damageVsSmall).toEqual({ count: 1, sides: 8, bonus: 0 });
    }
  });
});

describe('buildGen1ItemOverrides → planDqkBuild — the wiring the audit found missing (gap 1)', () => {
  const fakeExe = () => new TextEncoder().encode(`HDR..${DQK_TITLE}\0..tail`);
  const emptyGame = () =>
    buildDqkGameData({ geo: new Uint8Array(4), mon: new Uint8Array(4), ecl: new Uint8Array(4) });
  const dokFiles = [resolve(dokDir, 'ITEM0.DAX'), resolve(dokDir, 'ITEMS')];

  it('a dqk target gets no overrides (ships its own item files)', () => {
    expect(buildGen1ItemOverrides('dqk', { itemDaxes: [new Uint8Array(4)] })).toEqual({});
  });

  it.skipIf(!dokFiles.every((p) => existsSync(p)))(
    'DoK overrides are emitted as DISK1 port files instead of copied from DQK',
    async () => {
      const [item0, items] = await Promise.all(dokFiles.map(bytes));
      const overrides = buildGen1ItemOverrides('dok', { itemDaxes: [item0], itemsFile: items });
      expect(Object.keys(overrides).sort()).toEqual(['ITEM.DAT', 'ITEMS.DAT']);

      const plan = planDqkBuild({ gameData: emptyGame(), exe: fakeExe(), target: 'dok', overrides });
      const itemDat = plan.emit.find((f) => f.path === 'DISK1/ITEM.DAT');
      const itemsDat = plan.emit.find((f) => f.path === 'DISK1/ITEMS.DAT');
      expect(itemDat, 'ITEM.DAT emitted').toBeDefined();
      expect(itemsDat, 'ITEMS.DAT emitted').toBeDefined();
      expect(itemDat!.origin).toBe('port');
      expect(itemsDat!.origin).toBe('port');
      expect(Buffer.from(itemDat!.bytes).equals(Buffer.from(overrides['ITEM.DAT']))).toBe(true);
      expect(Buffer.from(itemsDat!.bytes).equals(Buffer.from(overrides['ITEMS.DAT']))).toBe(true);
      // And they are gone from the copy-verbatim list (the audit's exact finding).
      expect(plan.copy.some((f) => f.fromName === 'ITEM.DAT' || f.fromName === 'ITEMS.DAT')).toBe(false);
    },
  );
});
