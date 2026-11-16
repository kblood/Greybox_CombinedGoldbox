import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseFruaGame001,
  FRUA_GAME001_OFFSETS as G,
  importFruaDesign,
  importFruaTlb,
  classifyFruaTlbKind,
  encodeEclString,
  loadModule,
  runModuleEvent,
  resolveEntryPoint,
  Explorer,
  decodeHlib,
  FRUA_GEO_OFFSETS as O,
  FRUA_ITEM_DAT_SIZE,
  FRUA_ITEMS_DAT_SIZE,
  validateModulePackage,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const dqk = (disk: string, f: string) => resolve(repoRoot, 'The Dark Queen of Krynn', disk, f);
const heirsRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures/HEIRS.DSN';
const heirs = (file: string) => resolve(heirsRoot, file);
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Hand-builds a `GAME001.DAT` buffer byte-for-byte per `hackdocs_extracted/GAMEDAT.TXT`'s field
 * table (see `module/frua/game001.ts`'s header comment). The helper accepts the engine-normalized
 * zero-based entry id and writes GAME001's retail one-based byte.
 */
function buildFixtureGame001Bytes(opts: { startingModule: number; entryPointInModule: number }): Uint8Array {
  const buf = new Uint8Array(G.password + 15);
  buf.set(Array.from('TEST ADVENTURE').map((c) => c.charCodeAt(0)), G.adventureName);
  const dv = new DataView(buf.buffer);
  dv.setUint32(G.startingXp, 100, true);
  dv.setUint32(G.startingPp, 50, true);
  dv.setUint32(G.startingGems, 3, true);
  dv.setUint32(G.startingJewelry, 1, true);
  buf[G.startingModule] = opts.startingModule;
  buf[G.entryPointInModule] = opts.entryPointInModule + 1;
  buf[G.equipmentCode] = 3; // "average"
  buf.set(Array.from('IRON KEY').map((c) => c.charCodeAt(0)), G.keys); // key slot 0
  buf.set(Array.from('HOLY SYMBOL').map((c) => c.charCodeAt(0)), G.items); // item slot 0
  buf.set(Array.from('OPENSESAME').map((c) => c.charCodeAt(0)), G.password);
  return buf;
}

/**
 * Hand-builds a minimal 2x1 `GEOxxx.DAT` per the M5.S2a-verified byte spec (see
 * `frua-geo.test.ts`'s `buildFixtureGeoBytes` for the fuller version this trims): entry point 0 at
 * (0,0) facing east, an open east wall, and a Text Statement event on cell (1,0) so a design built
 * from two of these (different `eventText`) proves per-map event ids don't collide once aggregated.
 */
function buildFixtureGeoBytes(eventText: string): Uint8Array {
  const width = 2;
  const height = 1;
  const packed = encodeEclString(eventText);
  const buf = new Uint8Array(O.stringData + packed.length);
  const dv = new DataView(buf.buffer);

  buf[O.height] = height;
  buf[O.width] = width;
  buf[O.wallSlots + 2] = 3; // dungeon, not the overland sentinel

  buf[O.entryPoints] = 0; // x
  buf[O.entryPoints + 1] = 0; // y
  buf[O.entryPoints + 2] = 2; // facing: east (GEOENTRY.TXT 0=N,2=E,4=S,6=W)

  buf.set([0x6d, 0x61, 0x70], 314); // "map" marker (fixture fidelity, unchecked by the parser)

  const gridAt = (x: number, y: number) => O.grid + (y * width + x) * 6;
  // Cell (0,0): east open, no event.
  {
    const o = gridAt(0, 0);
    buf[o] = buf[o + 1] = buf[o + 2] = buf[o + 3] = buf[o + 4] = buf[o + 5] = 0;
  }
  // Cell (1,0): all blank, event slot 1 (LOCAL to this file -- every fixture reuses slot 1,
  // proving `importFruaDesign` must renumber ids per-map, not just concatenate them).
  {
    const o = gridAt(1, 0);
    buf[o] = buf[o + 1] = buf[o + 2] = buf[o + 3] = 0;
    buf[o + 4] = 1;
    buf[o + 5] = 0;
  }

  buf.set([0x65, 0x6e, 0x63, 0x72], O.gridEnd); // "encr" marker

  const eventAt = (slot1based: number) => O.events + (slot1based - 1) * 20;
  {
    const o = eventAt(1);
    buf[o] = 2; // Text Statement
    dv.setUint16(o + 4 + (9 - 5), 1, true); // statement1 ref 1 -> zero-based string-table slot 0
  }

  buf.set([0x73, 0x74, 0x72, 0x67], O.stringMarker); // "strg" marker

  dv.setUint16(O.stringCount, 1, true);
  buf[O.stringLengths] = packed.length;
  buf.set(packed, O.stringData);

  return buf;
}

describe('parseFruaGame001 (M5.S2b)', () => {
  const g = parseFruaGame001(buildFixtureGame001Bytes({ startingModule: 1, entryPointInModule: 0 }));

  it('decodes the header fields', () => {
    expect(g.adventureName).toBe('TEST ADVENTURE');
    expect(g.startingXp).toBe(100);
    expect(g.startingGems).toBe(3);
    expect(g.startingModule).toBe(1);
    expect(g.entryPointInModule).toBe(0);
    expect(g.equipmentCode).toBe('average');
  });

  it('decodes the named key/item slots and password', () => {
    expect(g.keys[0]).toBe('IRON KEY');
    expect(g.items[0]).toBe('HOLY SYMBOL');
    expect(g.password).toBe('OPENSESAME');
  });
});

describe('importFruaDesign aggregates GAME001.DAT + multiple GEOxxx.DAT (M5.S2b acceptance)', () => {
  const files = {
    game001: buildFixtureGame001Bytes({ startingModule: 1, entryPointInModule: 0 }),
    geos: new Map([
      [1, buildFixtureGeoBytes('MODULE ONE')],
      [2, buildFixtureGeoBytes('MODULE TWO')],
    ]),
  };
  const result = importFruaDesign('TESTDSN', files);

  it('produces one map per GEOxxx.DAT, in module-number order', () => {
    expect(result.package.maps).toHaveLength(2);
    expect(result.moduleNumberToMapIndex).toEqual(
      new Map([
        [1, 0],
        [2, 1],
      ]),
    );
  });

  it('rejects a GAME001 start whose GEO module is absent instead of silently using map zero', () => {
    expect(() => importFruaDesign('MISSING-START', {
      game001: buildFixtureGame001Bytes({ startingModule: 7, entryPointInModule: 0 }),
      geos: new Map([[2, buildFixtureGeoBytes('ONLY MODULE TWO')]]),
    })).toThrow(/starting module 7 has no matching GEOxxx\.DAT/);
  });

  it('renumbers each map\'s events to a globally-unique id (both files use local slot 1)', () => {
    expect(result.package.maps[0].events.map((e) => e.id)).toEqual([1]);
    expect(result.package.maps[1].events.map((e) => e.id)).toEqual([1001]);
  });

  it('derives entrypoint 0 from GAME001.DAT and one further entrypoint per other map', () => {
    expect(result.package.entrypoints).toEqual([
      { id: 0, mapIndex: 0, entryId: 0 },
      { id: 1, mapIndex: 1, entryId: 0 },
    ]);
  });

  it('omits stale source entries and chooses the first in-bounds entry for a synthetic preview', () => {
    const second = buildFixtureGeoBytes('MODULE TWO');
    second[O.entryPoints] = 9; // entry 0 x is outside this 2x1 map; entries 1-7 remain (0,0)
    const imported = importFruaDesign('STALE-PREVIEW-ENTRY', {
      game001: buildFixtureGame001Bytes({ startingModule: 1, entryPointInModule: 0 }),
      geos: new Map([[1, buildFixtureGeoBytes('MODULE ONE')], [2, second]]),
    });

    expect(imported.package.maps[1].entries.map((entry) => entry.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(imported.package.entrypoints).toEqual([
      { id: 0, mapIndex: 0, entryId: 0 },
      { id: 1, mapIndex: 1, entryId: 1 },
    ]);
    expect(imported.package.sourceWarnings).toContainEqual(expect.objectContaining({
      code: 'frua.out_of_bounds_entry',
      sourceFormat: 'FRUA',
      mapIndex: 1,
      sourceMap: 'STALE-PREVIEW-ENTRY/GEO002',
      message: expect.stringContaining('entry 0 at (9,0)'),
    }));
    expect(() => loadModule(imported.package)).not.toThrow();
  });

  it('omits a synthetic preview entrypoint and warns when a source map has no in-bounds entry', () => {
    const second = buildFixtureGeoBytes('NO ENTRY');
    for (let entryId = 0; entryId < 8; entryId++) {
      const offset = O.entryPoints + entryId * 4;
      second[offset] = 9;
      second[offset + 1] = 9;
    }
    const imported = importFruaDesign('NO-PREVIEW-ENTRY', {
      game001: buildFixtureGame001Bytes({ startingModule: 1, entryPointInModule: 0 }),
      geos: new Map([[1, buildFixtureGeoBytes('MODULE ONE')], [2, second]]),
    });

    expect(imported.package.maps[1].entries).toEqual([]);
    expect(imported.package.entrypoints).toEqual([{ id: 0, mapIndex: 0, entryId: 0 }]);
    expect(imported.package.sourceWarnings).toContainEqual(expect.objectContaining({
      code: 'frua.preview_entry_unavailable',
      mapIndex: 1,
      sourceMap: 'NO-PREVIEW-ENTRY/GEO002',
    }));
  });

  it('rejects an out-of-bounds GAME001 start even when another source entry is usable', () => {
    const first = buildFixtureGeoBytes('BAD START');
    first[O.entryPoints] = 9; // GAME001 explicitly selects source entry id 0
    expect(() => importFruaDesign('BAD-START-ENTRY', {
      game001: buildFixtureGame001Bytes({ startingModule: 1, entryPointInModule: 0 }),
      geos: new Map([[1, first]]),
    })).toThrow(/GAME001 start entry 0 on module 1 does not resolve to an in-bounds retained entry/);
  });

  it('retains every unmapped cell but deduplicates its portable unsupported-event warning', () => {
    const geo = buildFixtureGeoBytes('IGNORED TEXT');
    // Both cells point at the same unsupported Shop event in source slot 2.
    geo[O.grid + 4] = 2;
    geo[O.grid + 6 + 4] = 2;
    geo[O.events + 20] = 8;
    const imported = importFruaDesign('UNSUPPORTED', {
      game001: buildFixtureGame001Bytes({ startingModule: 1, entryPointInModule: 0 }),
      geos: new Map([[1, geo]]),
    });

    expect(imported.unmapped).toHaveLength(2);
    expect(imported.unmapped.map((entry) => entry.cellIndex)).toEqual([0, 1]);
    expect(imported.package.sourceWarnings?.filter((warning) =>
      warning.code === 'frua.unsupported_event' && warning.sourceEventId === 2)).toEqual([{
      code: 'frua.unsupported_event',
      sourceFormat: 'FRUA',
      mapIndex: 0,
      sourceMap: 'UNSUPPORTED/GEO001',
      sourceEventId: 2,
      message: 'FRUA module 1 event 2 (type 8: Shop) is unsupported and was not made executable.',
    }]);
  });

  it('has no graphicSets when no .TLB files were supplied', () => {
    expect(result.package.graphicSets).toBeUndefined();
  });

  it('decodes and returns an item catalogue only when both exact source tables are supplied', () => {
    const itemDat = new Uint8Array(FRUA_ITEM_DAT_SIZE);
    const itemsDat = new Uint8Array(FRUA_ITEMS_DAT_SIZE);
    expect(importFruaDesign('ITEM-DAT-ONLY', { ...files, itemDat }).itemCatalogue).toBeUndefined();
    expect(importFruaDesign('ITEMS-DAT-ONLY', { ...files, itemsDat }).itemCatalogue).toBeUndefined();

    const withCatalogue = importFruaDesign('BOTH-ITEM-TABLES', { ...files, itemDat, itemsDat });
    expect(withCatalogue.itemCatalogue?.byId.size).toBe(254);
    expect(withCatalogue.itemCatalogue?.baseById.size).toBe(128);
  });

  it('cross-map entrypoints both load and play their own real ECL text (G3)', () => {
    const loaded = loadModule(result.package);

    for (const [entryPointId, expectedText] of [
      [0, 'MODULE ONE'],
      [1, 'MODULE TWO'],
    ] as const) {
      const { map, entryId } = resolveEntryPoint(loaded, entryPointId);
      const explorer = Explorer.atEntry(map, entryId);
      const step = explorer.forward(); // east wall of (0,0) is open -> steps to (1,0)
      expect(step.moved).toBe(true);
      const run = runModuleEvent(loaded, step.event!);
      expect(run.effects).toEqual([expect.objectContaining({ type: 'print', text: expectedText })]);
    }
  });
});

describe('FRUA retail HEIRS.DSN playable route', () => {
  it.skipIf(!existsSync(heirs('GAME001.DAT')) || !existsSync(heirs('GEO005.DAT')) || !existsSync(heirs('GEO017.DAT')))(
    'normalizes GAME001 entry 1 to slot 0 and plays module 17\'s one-step den-description event',
    () => {
      const game001 = new Uint8Array(readFileSync(heirs('GAME001.DAT')));
      const geo017 = new Uint8Array(readFileSync(heirs('GEO017.DAT')));
      expect(sha256(game001)).toBe('a9ce8098a3db84055c9b834d9d1c6586644117ef35328c9d971c96e06f18cd28');
      expect(sha256(geo017)).toBe('42cc7fd6038a14e52b7f140186078e81027290676e1a19355e7d3e6c92d4ab80');

      const geos = new Map<number, Uint8Array>();
      for (const file of readdirSync(heirsRoot)) {
        const match = /^GEO(\d{3})\.DAT$/i.exec(file);
        if (match) geos.set(Number(match[1]), new Uint8Array(readFileSync(heirs(file))));
      }

      const result = importFruaDesign('HEIRS', {
        game001,
        geos,
      });
      expect(result.package.maps).toHaveLength(26);
      expect(result.game001).toMatchObject({ startingModule: 5, entryPointInModule: 0 });
      expect(result.package.entrypoints[0]).toEqual({ id: 0, mapIndex: 4, entryId: 0 });
      expect(result.unmapped).toHaveLength(272);
      expect(result.package.maps.every((map) => map.entries.every((entry) =>
        entry.x >= 0 && entry.y >= 0 && entry.x < map.width && entry.y < map.height))).toBe(true);
      expect(result.package.entrypoints.every((entrypoint) =>
        result.package.maps[entrypoint.mapIndex].entries.some((entry) => entry.id === entrypoint.entryId))).toBe(true);
      expect(result.package.sourceWarnings).toHaveLength(298);
      expect(result.package.sourceWarnings?.filter((warning) =>
        warning.code === 'frua.out_of_bounds_entry')).toHaveLength(13);
      expect(result.package.sourceWarnings?.filter((warning) =>
        warning.code === 'frua.unsupported_event')).toHaveLength(285);
      const validation = validateModulePackage(result.package);
      expect(validation).toMatchObject({ ok: true, errors: [] });
      expect(validation.warnings.filter((warning) =>
        warning.code === 'frua.out_of_bounds_entry')).toHaveLength(13);
      expect(validation.warnings.filter((warning) =>
        warning.code === 'frua.unsupported_event')).toHaveLength(285);

      const map17Index = result.moduleNumberToMapIndex.get(17);
      expect(map17Index).toBe(14);
      const loaded = loadModule(result.package);
      const explorer = Explorer.atEntry(loaded.maps[map17Index!], 0);
      expect(explorer.pose).toEqual({ x: 1, y: 0, facing: 'east' });
      const step = explorer.stepRight();
      expect(step).toMatchObject({ moved: true, event: 14041 });
      expect(explorer.pose).toEqual({ x: 1, y: 1, facing: 'east' });
      const run = runModuleEvent(loaded, step.event!);
      expect(run.effects).toContainEqual(expect.objectContaining({
        type: 'print',
        text: 'THE ODOR AND PHYSICAL EVIDENCE SUGGEST THAT THIS CAVE IS THE DEN OF SOME ILL-BRED FLYING CREATURES. ',
      }));
    },
  );
});

describe('FRUA .TLB art import reuses the existing HLIB decoder (M5.S2b)', () => {
  const bytes = readFileSync(dqk('DISK2', 'BIGPIC.TLB'));

  it('classifies known FRUA/DQK-shared filenames (UATFILES.TXT)', () => {
    expect(classifyFruaTlbKind('BIGPIC')).toBe('bigpic');
    expect(classifyFruaTlbKind('8X8DB')).toBe('tile8x8');
    expect(classifyFruaTlbKind('CPIC')).toBe('cpic');
    expect(classifyFruaTlbKind('SOMETHING_ELSE')).toBe('unknown');
  });

  it('decodes a REAL .TLB (DQK BIGPIC.TLB, shared HLIB format) into a labelled FrameSet', () => {
    const frameSet = importFruaTlb(bytes, 'BIGPIC');
    const direct = decodeHlib(bytes, 'BIGPIC');
    expect(frameSet.kind).toBe('bigpic');
    expect(frameSet.frames.size).toBe(direct.frameSet.frames.size);
    expect(frameSet.frames.size).toBeGreaterThan(0);
  });

  it('importFruaDesign attaches supplied .TLB art to graphicSets', () => {
    const files = {
      game001: buildFixtureGame001Bytes({ startingModule: 1, entryPointInModule: 0 }),
      geos: new Map([[1, buildFixtureGeoBytes('MODULE ONE')]]),
      tlbs: new Map([['BIGPIC', bytes]]),
    };
    const result = importFruaDesign('TESTDSN', files);
    expect(result.package.graphicSets).toHaveLength(1);
    expect(result.package.graphicSets![0].name).toBe('BIGPIC');
    expect(result.package.graphicSets![0].kind).toBe('bigpic');
    expect(result.package.graphicSets![0].frames.size).toBeGreaterThan(0);
  });
});
