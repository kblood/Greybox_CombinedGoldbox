/**
 * M34.S1 — `inventoryFromDokJnk`/`DOK_GEAR_CROSSWALK`: turns a decoded `.JNK` file's real worn
 * armour/shield into an `Inventory` for `wornArmorAc`, fixing `importDokParty.ts`'s bug of passing
 * `.GAM`'s always-`10` unarmoured baseline straight through as `CharacterRequest.baseAc`.
 *
 * Golden values re-derived directly from real bytes this round via the actual decode path
 * (`decodeDokJnkFile` → `inventoryFromDokJnk` → `wornArmorAc`), not transcribed from
 * `docs/engine/research/m34-audit.md`'s own table (which mislabeled the armour type as Ring Mail —
 * every real pregen but Dryden actually wears Plate Mail; see that doc's correction addendum).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeDokJnkFile,
  decodeDokJnkRecord,
  DOK_GEAR_CROSSWALK,
  inventoryFromDokJnk,
  wornArmorAc,
  exportDokJnkFile,
  dokJnkSupportsBaseTypeId,
  DOK_JNK_RECORD_SIZE,
  type DokJnkItem,
} from '../src/index.js';
import { decodeMonsterItem } from '../src/loaders/monsterSideTables.js';

function fakeJnkItem(baseTypeId: number, readied: boolean, name = 'X'): DokJnkItem {
  const raw = new Uint8Array(63);
  raw[0x2e] = baseTypeId;
  raw[0x34] = readied ? 1 : 0;
  const item = decodeMonsterItem(raw);
  return { index: 0, name, count: 0, scratch42: 0, item, raw };
}

describe('DOK_GEAR_CROSSWALK / inventoryFromDokJnk (M34.S1)', () => {
  it('crosswalks Ring Mail (32), Plate Mail (36), and Shield (37) to their BASE_ITEMS ids', () => {
    expect(DOK_GEAR_CROSSWALK[32]).toBe(80);
    expect(DOK_GEAR_CROSSWALK[36]).toBe(83);
    expect(DOK_GEAR_CROSSWALK[37]).toBe(14);
  });

  it('drops non-crosswalked items (weapons, unmapped/special-named gear) silently', () => {
    const inv = inventoryFromDokJnk([fakeJnkItem(9, true, 'Long Sword'), fakeJnkItem(68, true, 'Solamnic Plate Mail')]);
    expect(inv.entries).toEqual([]);
  });

  it('carries the readied flag through as equipped', () => {
    const inv = inventoryFromDokJnk([fakeJnkItem(37, false), fakeJnkItem(36, true)]);
    expect(inv.entries.find((e) => e.baseTypeId === 14)?.equipped).toBe(false);
    expect(inv.entries.find((e) => e.baseTypeId === 83)?.equipped).toBe(true);
  });

  it('wornArmorAc: Plate Mail (armorAc 3) + readied Shield (shieldBonus 1) = AC 2', () => {
    const inv = inventoryFromDokJnk([fakeJnkItem(36, true), fakeJnkItem(37, true)]);
    expect(wornArmorAc(inv)).toBe(2);
  });

  it('wornArmorAc: an unreadied shield does not apply its bonus', () => {
    const inv = inventoryFromDokJnk([fakeJnkItem(36, true), fakeJnkItem(37, false)]);
    expect(wornArmorAc(inv)).toBe(3);
  });

  it('wornArmorAc: no crosswalked/readied gear at all -> unarmoured baseline (10)', () => {
    expect(wornArmorAc(inventoryFromDokJnk([]))).toBe(10);
  });

  // --- Golden: real DoK SAVE .JNK files, all 6 pregens -----------------------------------------

  const here = fileURLToPath(new URL('.', import.meta.url));
  const saveDir = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'SAVE');

  async function jnkBaseAc(file: string): Promise<number> {
    const items = decodeDokJnkFile(new Uint8Array(await readFile(resolve(saveDir, file))));
    return wornArmorAc(inventoryFromDokJnk(items));
  }

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA1.JNK')))(
    'real SIR DRYDEN (CHRDATA1.JNK): only his Shield is crosswalked (Solamnic Plate Mail, type 68, is not) -> baseAc 9',
    async () => {
      expect(await jnkBaseAc('CHRDATA1.JNK')).toBe(9);
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA2.JNK')))(
    'real LILLITH (CHRDATA2.JNK): Plate Mail + Shield -> baseAc 2',
    async () => {
      expect(await jnkBaseAc('CHRDATA2.JNK')).toBe(2);
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA3.JNK')))(
    'real TANAR (CHRDATA3.JNK): Plate Mail + Shield -> baseAc 2',
    async () => {
      expect(await jnkBaseAc('CHRDATA3.JNK')).toBe(2);
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA4.JNK')))(
    'real FLAVIUS (CHRDATA4.JNK): Plate Mail + Shield (both readied) -> baseAc 2',
    async () => {
      expect(await jnkBaseAc('CHRDATA4.JNK')).toBe(2);
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA5.JNK')))(
    'real NEACAIL (CHRDATA5.JNK): Plate Mail only (her Shield is not readied) -> baseAc 3 (moot — rejected from the roster regardless, M33.S1)',
    async () => {
      expect(await jnkBaseAc('CHRDATA5.JNK')).toBe(3);
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA6.JNK')))(
    'real CELESTE (CHRDATA6.JNK): Plate Mail + Shield (both readied) -> baseAc 2',
    async () => {
      expect(await jnkBaseAc('CHRDATA6.JNK')).toBe(2);
    },
  );
});

// --- exportDokJnkFile: synthesize a .JNK file from Greybox inventory entries (2026-07-16, BUILD-QUEUE
// P2.4 "original save import/export" — DoK half). Scoped to the SAME armour/shield subset
// DOK_GEAR_CROSSWALK already covers — see dokGearCrosswalk.ts's "Export" header section.

describe('dokJnkSupportsBaseTypeId / exportDokJnkFile (synthetic)', () => {
  it('supports exactly the DOK_GEAR_CROSSWALK targets: Ring Mail (80), Plate Mail (83), Shield (14)', () => {
    expect(dokJnkSupportsBaseTypeId(80)).toBe(true);
    expect(dokJnkSupportsBaseTypeId(83)).toBe(true);
    expect(dokJnkSupportsBaseTypeId(14)).toBe(true);
    expect(dokJnkSupportsBaseTypeId(9)).toBe(false); // e.g. Long Sword — not in the crosswalk
  });

  it('throws for an unsupported baseTypeId rather than silently omitting gear', () => {
    expect(() => exportDokJnkFile([{ baseTypeId: 9, readied: true }])).toThrow(/DOK_GEAR_CROSSWALK/);
  });

  it('round-trips through decodeDokJnkFile -> inventoryFromDokJnk: baseTypeId + readied survive', () => {
    const raw = exportDokJnkFile([
      { baseTypeId: 83, readied: true }, // Plate Mail
      { baseTypeId: 14, readied: true }, // Shield
    ]);
    expect(raw).toHaveLength(2 * DOK_JNK_RECORD_SIZE);
    const items = decodeDokJnkFile(raw);
    expect(items).toHaveLength(2);
    const inv = inventoryFromDokJnk(items);
    expect(inv.entries.map((e) => e.baseTypeId).sort()).toEqual([14, 83]);
    expect(wornArmorAc(inv)).toBe(2); // Plate Mail (armorAc 3) - Shield (bonus 1) = 2, same as the real pregens
  });

  it('an unreadied item round-trips with equipped: false and does not contribute its AC', () => {
    const raw = exportDokJnkFile([{ baseTypeId: 83, readied: false }]);
    const inv = inventoryFromDokJnk(decodeDokJnkFile(raw));
    expect(inv.entries[0].equipped).toBe(false);
    expect(wornArmorAc(inv)).toBe(10); // unreadied armour never applies — same rule as the real decoder
  });

  it('writes the VERIFIED " Yes "/" No  " readied-flag text prefix (dok-chrdata-save-format.md §3.1)', () => {
    const readiedRec = decodeDokJnkRecord(exportDokJnkFile([{ baseTypeId: 14, readied: true }]));
    const unreadiedRec = decodeDokJnkRecord(exportDokJnkFile([{ baseTypeId: 14, readied: false }]));
    expect(readiedRec.name.startsWith(' Yes ')).toBe(true);
    expect(unreadiedRec.name.startsWith(' No  ')).toBe(true);
  });

  it('produces an empty buffer for an empty entry list', () => {
    expect(exportDokJnkFile([])).toHaveLength(0);
  });
});
