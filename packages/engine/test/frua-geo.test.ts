import { describe, it, expect } from 'vitest';
import {
  parseFruaGeo,
  importFruaGeo,
  encodeEclString,
  loadModule,
  runModuleEvent,
  resolveEntryPoint,
  Explorer,
  FRUA_GEO_OFFSETS as O,
  type ModulePackage,
} from '../src/index.js';

/**
 * Hand-builds a `GEOxxx.DAT` buffer byte-for-byte per the documented FRUA format
 * (`hackdocs_extracted/GEODATA.TXT`/`GEOGRIDS.TXT`/`GEOENTRY.TXT`/`GEOEVENT.TXT` — see
 * `module/frua/decode.ts`'s header comment). No real FRUA `.DSN` sample exists anywhere in
 * this repo or was found publicly (confirmed 2026-07-02 — see BUILD-QUEUE.md M5.S2), so this
 * fixture — built independently from the cited byte offsets, not from `parseFruaGeo`'s
 * internals — is the golden proof: a 2×2 dungeon with a real wall/door mix, a Text Statement
 * event (imports as a playable `'message'` ModuleEvent) and a Chain event (imports as
 * `unmapped`, proving nothing is silently dropped), decoded and played through the real
 * Explorer + EclVm.
 */
function buildFixtureGeoBytes(): Uint8Array {
  const width = 2;
  const height = 2;
  const stringHello = encodeEclString('HELLO FRUA'); // 10 chars + terminator, 6-bit packed
  const stringSecond = encodeEclString('SECOND STRING');
  const buf = new Uint8Array(O.stringData + stringHello.length + stringSecond.length);
  const dv = new DataView(buf.buffer);

  buf[O.height] = height;
  buf[O.width] = width;
  buf[O.wallSlots] = 1;
  buf[O.wallSlots + 1] = 2;
  buf[O.wallSlots + 2] = 3; // dungeon (not the 255,255,255 overland sentinel)

  // Entry point 1: (0,0) facing east (GEOENTRY.TXT: 0=N,2=E,4=S,6=W).
  buf[O.entryPoints] = 0;
  buf[O.entryPoints + 1] = 0;
  buf[O.entryPoints + 2] = 2;
  // Entry points 2-8 stay all-zero (x=0,y=0,facing=north) — importFruaGeo imports all 8 slots.

  const nameBytes = Array.from('TESTDSN').map((c) => c.charCodeAt(0));
  buf.set(nameBytes, O.moduleName);
  const zone0 = Array.from('ZONE1').map((c) => c.charCodeAt(0));
  buf.set(zone0, O.zoneNames);

  // "map" marker (GEODATA.TXT offset 314) — documentation flourish, not parsed, just fixture fidelity.
  buf.set([0x6d, 0x61, 0x70], 314);

  // Grid (GEOGRIDS.TXT): 6 bytes/cell, row-major, index = y*width+x. Only width*height=4 cells used.
  const gridAt = (x: number, y: number) => O.grid + (y * width + x) * 6;
  // Cell (0,0): N=blocked (slot 5, high 0xE0), E=open passage (slot 0), S=locked-key#2 (slot 1,
  // high 0x60+2*16=0x80), W=blank wall (slot 0). No event. backdrop=1, zone=2 -> byte = 1 | (2<<2).
  {
    const o = gridAt(0, 0);
    buf[o] = 0xe0 | 5; // north: blocked, slot 5
    buf[o + 1] = 0x00; // east: open, slot 0 (passable — party walks this way)
    buf[o + 2] = 0x80 | 1; // south: locked, key #2, slot 1
    buf[o + 3] = 0x00; // west: blank wall (no wall)
    buf[o + 4] = 0; // event slot: none
    buf[o + 5] = 1 | (2 << 2); // backdrop 1, zone 2
  }
  // Cell (1,0): all open, event slot 1 (Text Statement -> playable message).
  {
    const o = gridAt(1, 0);
    buf[o] = 0x00;
    buf[o + 1] = 0x00;
    buf[o + 2] = 0x00;
    buf[o + 3] = 0x00;
    buf[o + 4] = 1;
    buf[o + 5] = 0;
  }
  // Cell (0,1): all blank, no event.
  {
    const o = gridAt(0, 1);
    buf[o] = buf[o + 1] = buf[o + 2] = buf[o + 3] = buf[o + 4] = buf[o + 5] = 0;
  }
  // Cell (1,1): all blank, event slot 2 (Chain -> not representable yet, reported as unmapped).
  {
    const o = gridAt(1, 1);
    buf[o] = buf[o + 1] = buf[o + 2] = buf[o + 3] = 0;
    buf[o + 4] = 2;
    buf[o + 5] = 0;
  }

  // "encr" marker (GEODATA.TXT offset 3778 = grid start 322 + 576*6, the grid's own fixed budget).
  buf.set([0x65, 0x6e, 0x63, 0x72], O.gridEnd);

  // Event table (GEOEVENT.TXT): 100 * 20-byte records at O.events. Only slots 1 and 2 are non-None.
  const eventAt = (slot1based: number) => O.events + (slot1based - 1) * 20;
  {
    // Slot 1: Text Statement (type 2). Common bytes all zero (always/no-once/chain-to-0).
    const o = eventAt(1);
    buf[o] = 2; // type
    // record[4..19] = bytes 5-20: picture#@7 -> record[6]=0; statement1 string ref @9-10 -> record[8..9].
    dv.setUint16(o + 4 + (9 - 5), 1, true); // statement1 string ref 1 = zero-based string-table slot 0
    dv.setUint16(o + 4 + (11 - 5), 2, true); // statement2 string ref 2 = zero-based string-table slot 1
  }
  {
    // Slot 2: Chain (type 23). Type-specific "Chain to Event#" @ byte 9 -> record[8].
    const o = eventAt(2);
    buf[o] = 23;
    buf[o + 4 + (9 - 5)] = 5; // chains to event slot 5 (arbitrary, unresolved in this fixture)
  }

  // "strg" marker (GEODATA.TXT offset 5786 = event table start 3786 + 100*20).
  buf.set([0x73, 0x74, 0x72, 0x67], O.stringMarker);

  dv.setUint16(O.stringCount, 2, true); // two text boxes in use

  // String lengths (400 bytes @ stringLengths): refs 1 and 2 resolve to zero-based slots 0 and 1.
  buf[O.stringLengths] = stringHello.length;
  buf[O.stringLengths + 1] = stringSecond.length;
  buf.set(stringHello, O.stringData);
  buf.set(stringSecond, O.stringData + stringHello.length);

  return buf;
}

describe('FRUA GEOxxx.DAT byte parser (M5.S2)', () => {
  const geo = parseFruaGeo(buildFixtureGeoBytes());

  it('decodes the header', () => {
    expect(geo.width).toBe(2);
    expect(geo.height).toBe(2);
    expect(geo.isOverland).toBe(false);
    expect(geo.moduleName).toBe('TESTDSN');
    expect(geo.zoneNames[0]).toBe('ZONE1');
    expect(geo.entryPoints[0]).toEqual({ x: 0, y: 0, facing: 'east' });
  });

  it('decodes wall bytes into slot + kind (GEOGRIDS.TXT)', () => {
    const c00 = geo.cells[0]; // (0,0)
    expect(c00.north).toEqual({ slot: 5, kind: 'blocked' });
    expect(c00.east).toEqual({ slot: 0, kind: 'open' });
    expect(c00.south).toEqual({ slot: 1, kind: 'lockedKey', keyIndex: 2 });
    expect(c00.west).toEqual({ slot: 0, kind: 'open' });
    expect(c00.backdropSlot).toBe(1);
    expect(c00.zone).toBe(2);
  });

  it('decodes the string table via the shared ECL 6-bit codec', () => {
    expect(geo.strings[0]).toBe('HELLO FRUA');
    expect(geo.strings[1]).toBe('SECOND STRING');
    expect(geo.stringCount).toBe(2);
  });

  it('decodes event slot 1 as a fully-resolved Text Statement', () => {
    const e = geo.events[0];
    expect(e.type).toBe(2);
    expect(e.typeName).toBe('Text Statement');
    expect(e.strings.statement1).toBe('HELLO FRUA');
    expect(e.strings.statement2).toBe('SECOND STRING');
  });

  it('treats event string reference zero as no text', () => {
    expect(geo.events[0].strings.statement3).toBe('');
  });

  it('decodes event slot 2 as a Chain with its type-specific chain field', () => {
    const e = geo.events[1];
    expect(e.type).toBe(23);
    expect(e.typeName).toBe('Chain');
    expect(e.chains.chainTo).toBe(5);
  });

  it('preserves unmapped-field bytes losslessly in raw16', () => {
    const e = geo.events[1];
    expect(e.raw16).toHaveLength(16);
    expect(e.raw16[9 - 5]).toBe(5); // same byte the `chains.chainTo` convenience field reads
  });
});

describe('importFruaGeo (M5.S2)', () => {
  const geo = parseFruaGeo(buildFixtureGeoBytes());
  const { map, unmapped } = importFruaGeo(geo, 'TESTDSN/area1');

  it('imports the grid into a GameMap-shaped ModuleMap', () => {
    expect(map.width).toBe(2);
    expect(map.height).toBe(2);
    expect(map.cells).toHaveLength(4);
    expect(map.cells[0].walls).toEqual({ north: 5, east: 0, south: 1, west: 0 });
    // blocked -> plain wall(0); lockedKey -> door(1) (see importer.ts's doorFlagFor doc comment).
    expect(map.cells[0].doors).toEqual({ north: 0, east: 0, south: 1, west: 0 });
  });

  it('imports the Text Statement event as a playable message ModuleEvent', () => {
    expect(map.events).toEqual([{
      id: 1,
      type: 'message',
      body: { text: 'HELLO FRUA', additionalTexts: ['SECOND STRING'] },
    }]);
    expect(map.cells[1].event).toBe(1); // cell (1,0)
  });

  it('reports the Chain event as unmapped instead of inventing behavior for it', () => {
    expect(unmapped).toEqual([
      { cellIndex: 3, x: 1, y: 1, fruaSlot: 2, fruaType: 23, fruaTypeName: 'Chain' },
    ]);
    expect(map.cells[3].event).toBeUndefined();
  });

  it('imports all 8 entry point slots', () => {
    expect(map.entries).toHaveLength(8);
    expect(map.entries[0]).toEqual({ id: 0, x: 0, y: 0, facing: 'east' });
  });
});

describe('a FRUA-imported map loads and plays headlessly (M5.S2 acceptance)', () => {
  it('walks from the entry point into the Text Statement cell and runs its real ECL', () => {
    const geo = parseFruaGeo(buildFixtureGeoBytes());
    const { map } = importFruaGeo(geo, 'TESTDSN/area1');

    const pkg: ModulePackage = {
      schema: 1,
      id: 'frua-fixture',
      title: 'TESTDSN',
      ruleset: 'addnd1e',
      maps: [map],
      entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
    };

    const loaded = loadModule(pkg);
    const { map: startMap, entryId } = resolveEntryPoint(loaded, 0);
    const explorer = Explorer.atEntry(startMap, entryId);
    expect(explorer.getPose()).toEqual({ x: 0, y: 0, facing: 'east' });

    const step = explorer.forward(); // east wall of (0,0) is open -> steps to (1,0)
    expect(step.moved).toBe(true);
    expect(step.event).toBe(1);

    const result = runModuleEvent(loaded, step.event);
    expect(result.status).toBe('exited');
    expect(result.effects).toEqual([
      expect.objectContaining({ type: 'print', text: 'HELLO FRUA' }),
      expect.objectContaining({ type: 'print', text: 'SECOND STRING' }),
    ]);
  });
});
