/**
 * CoK/DoK → DQK game-data assembly (E4.1) — the pipeline that emits the DQK Gen2 container set from a
 * Gen1 game's content. Verified end-to-end on real CoK bytes:
 *
 *  - `buildDqkGameData` consumes real `GEO1.DAX` + `MON1CHA.DAX` + `ECL1.DAX` and emits GEO.GLB /
 *    MONCHA.GLB / ECL.GLB, all in the shared area-id namespace.
 *  - Every emitted library re-decodes through the DQK loaders into a coherent game: the maps come back
 *    by id, the bestiary decodes with stats, the scripts resolve by area id, and the manifest's
 *    `pairedAreas` (map + script) are all actually resolvable in BOTH the GEO and ECL libraries.
 *
 * A synthetic case (no game data) covers the manifest pairing logic deterministically.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDqkGameData,
  decodeHlib,
  decodeGen2GeoArchive,
  decodeMonchaGlb,
  decodeEclGlb,
  disassembleEclBlock,
  ECL_GEN2,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const cok = (f: string) => resolve(repoRoot, 'Champions of Krynn', f);
const geoPath = cok('GEO1.DAX');
const monPath = cok('MON1CHA.DAX');
const eclPath = cok('ECL1.DAX');
const haveCok = existsSync(geoPath) && existsSync(monPath) && existsSync(eclPath);

describe('buildDqkGameData — manifest pairing (synthetic)', () => {
  it('reports only areas with both a map and a script as paired', () => {
    // Empty inputs: each loader yields nothing, so the libraries are just id tables and the manifest is empty.
    const g = buildDqkGameData({ geo: new Uint8Array(4), mon: new Uint8Array(4), ecl: new Uint8Array(4) });
    expect(g.manifest.geoAreas).toEqual([]);
    expect(g.manifest.eclAreas).toEqual([]);
    expect(g.manifest.pairedAreas).toEqual([]);
    expect(g.manifest.monsters).toBe(0);
    // No ECL scripts → nothing to forward to → no new-game entry stub injected.
    expect(g.manifest.newGameEntry).toBeNull();
    // The emitted GLBs are still valid (empty) HLIB DATA libraries.
    expect(decodeHlib(g.geoGlb, 'GEO.GLB').nonImage).toBe(true);
    expect(decodeHlib(g.eclGlb, 'ECL.GLB').nonImage).toBe(true);
  });
});

describe('buildDqkGameData — real CoK content → DQK container set', () => {
  it.skipIf(!haveCok)('emits a coherent, id-paired GEO/MONCHA/ECL set the DQK loaders read back', async () => {
    const [geo, mon, ecl] = await Promise.all([readFile(geoPath), readFile(monPath), readFile(eclPath)]);
    const game = buildDqkGameData({
      geo: new Uint8Array(geo),
      mon: new Uint8Array(mon),
      ecl: new Uint8Array(ecl),
    });

    expect(game.manifest.geoAreas.length, 'some GEO maps').toBeGreaterThan(0);
    expect(game.manifest.eclAreas.length, 'some ECL scripts').toBeGreaterThan(0);
    expect(game.manifest.monsters, 'some monsters').toBeGreaterThan(0);
    expect(game.manifest.pairedAreas.length, 'some playable (map+script) areas').toBeGreaterThan(0);

    // GEO.GLB → every manifest GEO area comes back as a map of the right id.
    const maps = decodeGen2GeoArchive(decodeHlib(game.geoGlb, 'GEO.GLB').rawMembers, 'GEO');
    expect(maps.map((m) => m.id).sort((a, b) => a - b)).toEqual([...game.manifest.geoAreas].sort((a, b) => a - b));
    for (const m of maps) {
      expect(m.map.width).toBe(16); // CoK maps are 16×16
      expect(m.map.height).toBe(16);
    }

    // MONCHA.GLB → the bestiary decodes; a real subset carries full stats.
    const bestiary = decodeMonchaGlb(game.monchaGlb, 'MONCHA.GLB');
    expect(bestiary.total).toBe(game.manifest.monsters);
    expect(bestiary.decoded, 'some monsters decode with stats').toBeGreaterThan(0);

    // ECL.GLB → every script resolves by area id and disassembles on the Gen2 path.
    const scripts = decodeEclGlb(game.eclGlb, 'ECL.GLB');
    for (const id of game.manifest.eclAreas) {
      const block = scripts.blockSourceById(id);
      expect(block, `ECL area ${id}`).toBeDefined();
      expect(() => disassembleEclBlock(block!, ECL_GEN2)).not.toThrow();
    }

    // The headline: every PLAYABLE area has both a resolvable map and a resolvable script in the rebuilt set.
    const mapsById = new Set(maps.map((m) => m.id));
    for (const id of game.manifest.pairedAreas) {
      expect(mapsById.has(id), `paired area ${id} has a GEO map`).toBe(true);
      expect(scripts.blockSourceById(id), `paired area ${id} has an ECL script`).toBeDefined();
    }

    // E6.1 — DQK.EXE loads ECL area 1 on a fresh "Begin Adventuring", but CoK's lowest ECL id is 16.
    // The build injects a synthetic area-1 stub that NEWECLs to 16 so the fresh-start load resolves.
    expect(game.manifest.newGameEntry, 'a new-game entry stub was injected').toEqual({
      areaId: 1,
      forwardsTo: 16,
    });
    const entry = scripts.blockSourceById(1);
    expect(entry, 'ECL.GLB now has an area-1 member DQK.EXE can load').toBeDefined();
    const dis = disassembleEclBlock(entry!, ECL_GEN2);
    expect(dis.header.eclInitialEntry).toBe(0x8014); // standard DQK entry vaddr
    expect(dis.instructions[0].mnemonic).toBe('NEWECL');
    expect(dis.instructions[0].args[0].word).toBe(16); // forwards to the CoK overland
    expect(dis.instructions[1].mnemonic).toBe('EXIT');
  });
});
