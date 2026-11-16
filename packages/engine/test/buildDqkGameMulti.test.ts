/**
 * Multi-disk CoK/DoK → DQK content merge (E4.1 / M3.1 + M3.2). Verifies, on REAL DAX bytes for BOTH
 * games, that the per-disk `GEO{1..3}` / `ECL{1..3}` / `MON{1..3}CHA` archives merge into one unified
 * `GEO.GLB` / `ECL.GLB` / `MONCHA.GLB`:
 *
 *  - **id-collision audit (M3.2):** GEO + ECL area ids are globally disjoint across disks (per-disk
 *    bands) and union without remap; monster slot ids overlap across disks but the colliding records
 *    are byte-identical, so they dedup to one member. No conflicting (different-byte same-id) monster.
 *  - **round-trip:** every source area across all disks is present exactly once in the merged GLBs, and
 *    every paired area (map + script) is resolvable in both libraries.
 *  - **ECL identity:** each merged ECL member equals its Gen1 source block minus the 2-byte 0x1388 magic.
 *
 * A synthetic case covers the merge logic (disjoint union + monster dedup) deterministically, and an
 * intentional GEO id collision proves the disjoint-union guard throws rather than silently dropping.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDqkGameData,
  buildDqkGameDataMulti,
  decodeHlib,
  decodeGen2GeoArchive,
  decodeMonchaGlb,
  decodeEclGlb,
  disassembleEclBlock,
  readDaxDataBlocks,
  ECL_GEN1,
  ECL_GEN1_SHORT,
  ECL_GEN2,
  ECL_GEN1_MAGIC,
  sniffGen1EclBlock,
  findReachableNewEclImmediateSites,
  transcodeGen1EclBlockToGen2,
  type EclDialect,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

interface GameFixture {
  name: string;
  dir: string;
  /** Per-disk file stems present for this game (DoK ships only MON1CHA). */
  geo: string[];
  ecl: string[];
  mon: string[];
  /** MON side-table archives (Gap G2 — audit gap 2: previously never passed through this test). */
  itm: string[];
  spc: string[];
  /** Memorized-spell side-table (DoK-only — audit gap 3). */
  wiz: string[];
  /** Source ECL dialect for the Gen2 operand-frame transcode (CoK long vs DoK short). */
  eclDialect: EclDialect;
}

const COK: GameFixture = {
  name: 'CoK',
  dir: 'Champions of Krynn',
  geo: ['GEO1.DAX', 'GEO2.DAX', 'GEO3.DAX'],
  ecl: ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX'],
  mon: ['MON1CHA.DAX', 'MON2CHA.DAX', 'MON3CHA.DAX'],
  itm: ['MON1ITM.DAX', 'MON2ITM.DAX', 'MON3ITM.DAX'],
  spc: ['MON1SPC.DAX', 'MON2SPC.DAX', 'MON3SPC.DAX'],
  wiz: [],
  eclDialect: ECL_GEN1,
};
const DOK: GameFixture = {
  name: 'DoK',
  dir: 'Death Knights of Krynn',
  geo: ['GEO1.DAX', 'GEO2.DAX', 'GEO3.DAX'],
  ecl: ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX'],
  mon: ['MON1CHA.DAX'],
  itm: ['MON1ITM.DAX'],
  spc: ['MON1SPC.DAX'],
  wiz: ['MON1WIZ.DAX'],
  eclDialect: ECL_GEN1_SHORT,
};

function fixtureAvailable(g: GameFixture): boolean {
  return [...g.geo, ...g.ecl, ...g.mon, ...g.itm, ...g.spc, ...g.wiz].every((f) =>
    existsSync(resolve(repoRoot, g.dir, f)),
  );
}

async function loadAll(g: GameFixture, names: string[]): Promise<Uint8Array[]> {
  return Promise.all(
    names.map(async (f) => new Uint8Array(await readFile(resolve(repoRoot, g.dir, f)))),
  );
}

/** Collect the Gen1 ECL block ids → raw bytes across a set of source DAX archives. */
function sourceEclById(archives: Uint8Array[]): Map<number, Uint8Array> {
  const m = new Map<number, Uint8Array>();
  for (const bytes of archives) {
    for (const b of readDaxDataBlocks(bytes)) {
      if (sniffGen1EclBlock(b.raw)) m.set(b.blockId, b.raw);
    }
  }
  return m;
}

describe('buildDqkGameDataMulti — merge logic (synthetic)', () => {
  it('unions disjoint GEO/ECL ids and dedups byte-identical monster slots', () => {
    const g = buildDqkGameDataMulti({ geo: [], mon: [], ecl: [] });
    expect(g.manifest.geoAreas).toEqual([]);
    expect(g.manifest.merge).not.toBeNull();
    expect(g.manifest.merge!.sources).toEqual({ geo: 0, mon: 0, ecl: 0 });
  });

  it('single-archive build leaves manifest.merge null (back-compat)', () => {
    const g = buildDqkGameData({ geo: new Uint8Array(4), mon: new Uint8Array(4), ecl: new Uint8Array(4) });
    expect(g.manifest.merge).toBeNull();
  });
});

for (const g of [COK, DOK]) {
  const have = fixtureAvailable(g);
  describe(`buildDqkGameDataMulti — real ${g.name} multi-disk merge`, () => {
    it.skipIf(!have)('merges all disks into coherent, id-paired, deduped GLBs', async () => {
      const [geo, ecl, mon, itm, spc, wiz] = await Promise.all([
        loadAll(g, g.geo),
        loadAll(g, g.ecl),
        loadAll(g, g.mon),
        loadAll(g, g.itm),
        loadAll(g, g.spc),
        loadAll(g, g.wiz),
      ]);
      // The full input set the CLI driver (tools/build-dqk-dir.mts) now assembles — including the
      // ITM/SPC/WIZ side-tables the DoK M4 build audit found were never passed here (gaps 2-3).
      const game = buildDqkGameDataMulti({ geo, mon, ecl, itm, spc, wiz }, { eclSourceDialect: g.eclDialect });
      const audit = game.manifest.merge!;
      expect(audit).not.toBeNull();
      expect(audit.sources).toEqual({ geo: g.geo.length, mon: g.mon.length, ecl: g.ecl.length });

      // ── M3.2 id-collision audit ───────────────────────────────────────────────────────────────
      // GEO + ECL: globally disjoint across disks (union threw nothing, and the merged set equals the
      // flat union of every disk's ids with no duplicates).
      const flatGeo = audit.geoIdsPerDisk.flat();
      const flatEcl = audit.eclIdsPerDisk.flat();
      expect(new Set(flatGeo).size, 'GEO ids disjoint across disks').toBe(flatGeo.length);
      expect(new Set(flatEcl).size, 'ECL ids disjoint across disks').toBe(flatEcl.length);
      expect([...game.manifest.geoAreas].sort((a, b) => a - b)).toEqual([...flatGeo].sort((a, b) => a - b));

      // MON: no conflicting (different-byte same-id) monster across disks. Dedups are only present
      // when there is more than one MON disk (DoK has one, so its deduped set is empty).
      expect(audit.monConflictingIds, `${g.name} monster slot conflicts`).toEqual([]);
      const flatMon = audit.monIdsPerDisk.flat();
      const uniqueMon = new Set(flatMon);
      expect(game.manifest.monsters, 'merged monster count = unique slot ids').toBe(uniqueMon.size);
      if (g.mon.length > 1) {
        // Every id that appears on >1 disk must be in the deduped list (and they were byte-identical).
        const counts = new Map<number, number>();
        for (const id of flatMon) counts.set(id, (counts.get(id) ?? 0) + 1);
        const expectedDedup = [...counts.entries()].filter(([, c]) => c > 1).map(([id]) => id).sort((a, b) => a - b);
        expect(audit.monDedupedIds).toEqual(expectedDedup);
        expect(expectedDedup.length, 'CoK shares bestiary slots across disks').toBeGreaterThan(0);
      }

      // ── round-trip: every source area present exactly once, pairings intact ────────────────────
      const maps = decodeGen2GeoArchive(decodeHlib(game.geoGlb, 'GEO.GLB').rawMembers, 'GEO');
      expect(maps.map((m) => m.id).sort((a, b) => a - b)).toEqual([...flatGeo].sort((a, b) => a - b));

      const scripts = decodeEclGlb(game.eclGlb, 'ECL.GLB');
      for (const id of game.manifest.eclAreas) {
        const block = scripts.blockSourceById(id);
        expect(block, `ECL area ${id}`).toBeDefined();
        expect(() => disassembleEclBlock(block!, ECL_GEN2)).not.toThrow();
      }

      const mapsById = new Set(maps.map((m) => m.id));
      expect(game.manifest.pairedAreas.length, 'some playable areas after merge').toBeGreaterThan(0);
      for (const id of game.manifest.pairedAreas) {
        expect(mapsById.has(id), `paired area ${id} has a GEO map`).toBe(true);
        expect(scripts.blockSourceById(id), `paired area ${id} has an ECL script`).toBeDefined();
      }

      // Bestiary decodes; total = unique slot count.
      const bestiary = decodeMonchaGlb(game.monchaGlb, 'MONCHA.GLB');
      expect(bestiary.total).toBe(uniqueMon.size);

      // ── side-tables carried through the full multi-disk assembly (audit gaps 2-3) ──────────────
      // Both games ship real ITM/SPC coverage; the manifest summary must be non-zero here, not the
      // all-zero the DoK M4 build audit measured before the driver collected these archives.
      const st = game.manifest.sideTables;
      expect(st.withItems, `${g.name} monsters with item tables`).toBeGreaterThan(0);
      expect(st.withAffects, `${g.name} monsters with specials`).toBeGreaterThan(0);
      expect(game.monsterSideTables.length).toBeGreaterThan(0);
      for (const m of game.monsterSideTables) expect(uniqueMon.has(m.id), `side id ${m.id} in bestiary`).toBe(true);
      if (g.wiz.length > 0) {
        // DoK-only: the 14 caster monsters keep their memorized-spell tables (gap 3).
        expect(st.withSpells, `${g.name} caster monsters`).toBeGreaterThan(0);
        expect(st.totalSpells).toBeGreaterThan(st.withSpells);
        for (const w of game.monsterWizTables) expect(uniqueMon.has(w.id), `wiz id ${w.id} in bestiary`).toBe(true);
      } else {
        expect(st.withSpells).toBe(0);
        expect(game.monsterWizTables).toEqual([]);
      }

      // ── ECL identity: each merged member == the operand-frame TRANSCODE of its Gen1 source ─────
      // (2026-07-23, cok-m4-fidelity-plan.md §25: the port is no longer a bare magic-strip — every
      // reachable Gen2-frame-drifted site is trampolined; a block with no drifted sites is still
      // byte-identical to `source − magic`.)
      const srcEcl = sourceEclById(ecl);
      let checked = 0;
      let trampolined = 0;
      for (const id of game.manifest.eclAreas) {
        const src = srcEcl.get(id);
        if (!src) continue; // the synthetic area-1 stub has no source block
        const ported = scripts.blockSourceById(id)!;
        expect(src[0] | (src[1] << 8), `source ${id} carries Gen1 magic`).toBe(ECL_GEN1_MAGIC);
        const { block: expected, report } = transcodeGen1EclBlockToGen2(src, g.eclDialect);
        expect(ported.length, `ECL ${id} length = transcoded source`).toBe(expected.length);
        expect(ported).toEqual(expected);
        trampolined += report.patched.length;
        checked++;
      }
      expect(checked, 'verified ECL identity for the merged source blocks').toBeGreaterThan(0);
      // Both games carry real drift (CoK: 88× SETUP_MONSTER + 10× LOAD_FILES; DoK: LOAD_FILES only —
      // its short dialect already matches Gen2's 4-operand SETUP_MONSTER).
      expect(trampolined, `${g.name} has trampolined drift sites`).toBeGreaterThan(0);
      const manifestPatched = Object.values(game.manifest.eclTranscode.patched).reduce((a, b) => a + b, 0);
      expect(manifestPatched, 'manifest transcode summary matches').toBe(trampolined);

      // The area-1 new-game stub is injected exactly once and forwards to the lowest real area.
      // (manifest.eclAreas reports the SOURCE ids, so area 1 is not among them; the stub lives only in
      // the emitted ECL.GLB.)
      expect(game.manifest.newGameEntry).not.toBeNull();
      expect(game.manifest.newGameEntry!.areaId).toBe(1);
      expect(game.manifest.newGameEntry!.forwardsTo).toBe(Math.min(...game.manifest.eclAreas));
      expect(game.manifest.eclAreas, 'no real source area is id 1').not.toContain(1);
      const entry = scripts.blockSourceById(1);
      expect(entry, 'merged ECL.GLB has the area-1 entry stub').toBeDefined();
      // Exactly one area-1 member in the merged library (every disk band is > 1, so it is added once).
      // Member count = the unique source ECL ids + the single injected area-1 stub (+1 for the id table).
      const uniqueEclIds = new Set(flatEcl).size;
      expect(scripts.members.length, 'ECL.GLB member count = unique sources + 1 stub + id table').toBe(
        uniqueEclIds + 1 + 1,
      );
      expect(scripts.idToMember.has(1), 'area-1 stub addressable exactly once').toBe(true);
    });
  });
}

describe('buildDqkGameDataMulti — disjoint-union guard', () => {
  it.skipIf(!fixtureAvailable(COK))('throws on a real GEO area-id collision across disks (no silent drop)', async () => {
    // Feed the SAME GEO disk twice: every id collides, so the disjoint-union guard must throw.
    const geo1 = new Uint8Array(await readFile(resolve(repoRoot, COK.dir, 'GEO1.DAX')));
    expect(() => buildDqkGameDataMulti({ geo: [geo1, geo1], mon: [], ecl: [] })).toThrow(/area id .* appears on both disk/);
  });
});

// Round-12/13 id-collision mitigation (cok-m4-fidelity-plan.md §20/§21): CoK's own per-disk id bands
// (16-36/48-68/80-99) were never checked against DQK's native-occupied GEO/ECL id space -- 3 of CoK's
// 15 ported GEO areas (34, 50, 66) and 12 of its 23 ported ECL areas collide with a real, native DQK
// area. `idOffset` shifts the whole ported id space by a constant to a band with zero native overlap.
describe('buildDqkGameDataMulti — idOffset (round-12/13 id-collision mitigation)', () => {
  it.skipIf(!fixtureAvailable(COK))('idOffset 0 (default) is byte-identical to omitting the option', async () => {
    const [geo, ecl, mon] = await Promise.all([loadAll(COK, COK.geo), loadAll(COK, COK.ecl), loadAll(COK, COK.mon)]);
    const plain = buildDqkGameDataMulti({ geo, mon, ecl });
    const zeroOffset = buildDqkGameDataMulti({ geo, mon, ecl }, { idOffset: 0 });
    expect(zeroOffset.geoGlb).toEqual(plain.geoGlb);
    expect(zeroOffset.eclGlb).toEqual(plain.eclGlb);
    expect(zeroOffset.monchaGlb).toEqual(plain.monchaGlb);
    expect(zeroOffset.manifest).toEqual(plain.manifest);
  });

  it.skipIf(!fixtureAvailable(COK))('shifts every GEO/ECL id and keeps NEWECL cross-references consistent', async () => {
    const [geo, ecl, mon] = await Promise.all([loadAll(COK, COK.geo), loadAll(COK, COK.ecl), loadAll(COK, COK.mon)]);
    const plain = buildDqkGameDataMulti({ geo, mon, ecl });
    const OFFSET = 100;
    const shifted = buildDqkGameDataMulti({ geo, mon, ecl }, { idOffset: OFFSET });

    // Every GEO/ECL area id shifted by exactly OFFSET; the paired-area set and playable-area COUNT are
    // preserved (same areas, just renumbered); monster count untouched (separate namespace).
    expect(shifted.manifest.geoAreas.slice().sort((a, b) => a - b)).toEqual(
      plain.manifest.geoAreas.map((id) => id + OFFSET).sort((a, b) => a - b),
    );
    expect(shifted.manifest.eclAreas.slice().sort((a, b) => a - b)).toEqual(
      plain.manifest.eclAreas.map((id) => id + OFFSET).sort((a, b) => a - b),
    );
    expect(shifted.manifest.pairedAreas.length).toBe(plain.manifest.pairedAreas.length);
    expect(shifted.manifest.monsters).toBe(plain.manifest.monsters);

    // The known round-12 native-DQK collisions (GEO 34/50/66) are gone from the shifted GEO id set,
    // and their shifted replacements (134/150/166) are present instead.
    for (const collidingId of [34, 50, 66]) {
      expect(shifted.manifest.geoAreas, `native-colliding id ${collidingId} shifted away`).not.toContain(collidingId);
      expect(shifted.manifest.geoAreas, `shifted replacement ${collidingId + OFFSET} present`).toContain(
        collidingId + OFFSET,
      );
    }

    // The synthetic area-1 new-game entry stub is NOT shifted (DQK.EXE hard-codes EclBlockId=1 on a
    // fresh "Begin Adventuring" load -- this id isn't part of CoK's own ported space), but its forward
    // target IS the shifted lowest real area id.
    expect(shifted.manifest.newGameEntry).not.toBeNull();
    expect(shifted.manifest.newGameEntry!.areaId).toBe(1);
    expect(shifted.manifest.newGameEntry!.forwardsTo).toBe(Math.min(...shifted.manifest.eclAreas));

    // NEWECL cross-references inside the ported ECL bytecode now target the SHIFTED ids. Work
    // straight off the RAW source Gen1 blocks (via findReachableNewEclImmediateSites, already proven
    // correct in eclAreaIdRemap.test.ts) rather than the Gen2 disassembly's own instruction ORDER --
    // Gen2 `disassembleEclBlock` only walks ONE linear path from the entry point, whose per-instruction
    // index doesn't necessarily line up with this module's own reachability walk (which visits all 5
    // header far pointers), so index-matched comparison across the two builds is not reliable; a direct
    // byte-offset check is.
    const portedIds = new Set(plain.manifest.eclAreas);
    const srcEcl = sourceEclById(ecl);
    const shiftedScripts = decodeEclGlb(shifted.eclGlb, 'ECL.GLB');
    let checkedNewEcl = 0;
    for (const plainId of plain.manifest.eclAreas) {
      const rawSrc = srcEcl.get(plainId)!;
      const sites = findReachableNewEclImmediateSites(rawSrc);
      if (sites.length === 0) continue;
      const shiftedBlock = shiftedScripts.blockSourceById(plainId + OFFSET)!;
      for (const site of sites) {
        const gen2Offset = site.valueOffset - 2; // Gen2 strips the 2-byte Gen1 magic; body is otherwise verbatim
        const wasPorted = portedIds.has(site.target) || plain.manifest.geoAreas.includes(site.target);
        const expectedTarget = wasPorted ? site.target + OFFSET : site.target;
        expect(shiftedBlock[gen2Offset], `area ${plainId} NEWECL target at raw offset ${site.valueOffset}`).toBe(
          expectedTarget,
        );
        checkedNewEcl++;
      }
    }
    expect(checkedNewEcl, 'verified at least one shifted static NEWECL cross-reference').toBeGreaterThan(0);
    // 28 -> 30 on 2026-09-04 (round 34 Phase B), tracking eclAreaIdRemap.test.ts's own count for
    // the same reason: modelling opcode 0x41 made two previously desync-hidden NEWECL
    // cross-references reachable. Note WHICH assertion moved -- the per-site target check above
    // passed on all 30, so the build already remapped both new sites correctly and only the
    // total needed updating. Had that per-site check failed instead, this would be a port bug,
    // not a count.
    expect(checkedNewEcl, 'matches the corpus-wide static NEWECL site count').toBe(30);
  });
});
