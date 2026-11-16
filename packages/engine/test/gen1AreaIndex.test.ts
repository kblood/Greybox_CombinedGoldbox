/**
 * `listPairedGen1Areas` (the "walk any area" picker's enumeration helper) — proves it finds real,
 * already-known-playable areas against real CoK/DoK bytes, and degrades gracefully on an absent
 * archive rather than throwing.
 */
import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listGen1GeoAreas, listPairedGen1Areas, readDaxDataBlocks } from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const cokEcl1 = resolve(here, '..', '..', '..', 'Champions of Krynn', 'ECL1.DAX');
const cokGeo1 = resolve(here, '..', '..', '..', 'Champions of Krynn', 'GEO1.DAX');
const dokEcl1 = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'ECL1.DAX');
const dokGeo1 = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'GEO1.DAX');

describe('listPairedGen1Areas', () => {
  it.runIf(existsSync(cokEcl1) && existsSync(cokGeo1))(
    'finds CoK area 34 (the profile\'s own eclInitBlock) among the paired areas',
    async () => {
      const [ecl, geo] = await Promise.all([readFile(cokEcl1), readFile(cokGeo1)]);
      const areas = listPairedGen1Areas(new Uint8Array(geo), new Uint8Array(ecl));
      expect(areas.length).toBeGreaterThan(0);
      const a34 = areas.find((a) => a.id === 34);
      expect(a34).toBeDefined();
      expect(a34!.width).toBeGreaterThan(0);
      expect(a34!.height).toBeGreaterThan(0);
      // sorted ascending by id
      for (let i = 1; i < areas.length; i++) expect(areas[i].id).toBeGreaterThan(areas[i - 1].id);
    },
  );

  it.runIf(existsSync(dokEcl1) && existsSync(dokGeo1))(
    'finds DoK area 34 (the profile\'s own eclInitBlock) among the paired areas',
    async () => {
      const [ecl, geo] = await Promise.all([readFile(dokEcl1), readFile(dokGeo1)]);
      const areas = listPairedGen1Areas(new Uint8Array(geo), new Uint8Array(ecl));
      expect(areas.find((a) => a.id === 34)).toBeDefined();
    },
  );

  it('degrades gracefully (returns empty, never throws) on empty/absent archives', () => {
    expect(listGen1GeoAreas(new Uint8Array(0))).toEqual([]);
    expect(listGen1GeoAreas(new Uint8Array([1, 2, 3]))).toEqual([]);
    expect(listPairedGen1Areas(new Uint8Array(0), new Uint8Array(0))).toEqual([]);
    expect(listPairedGen1Areas(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]))).toEqual([]);
  });

  it.runIf(existsSync(cokGeo1))('catalogues every structurally valid CoK GEO block, including maps without ECL pairing', async () => {
    const geo = await readFile(cokGeo1);
    const maps = listGen1GeoAreas(new Uint8Array(geo));
    expect(maps.length).toBeGreaterThan(0);
    expect(maps.every((map) => map.width === 16 && map.height === 16)).toBe(true);
    for (let i = 1; i < maps.length; i++) expect(maps[i].id).toBeGreaterThan(maps[i - 1].id);
  });

  // This is deliberately a format-level inventory, not an ECL-pairing test.  A map may be
  // event-only and still belongs in the browser's read-only atlas; filtering it out here would
  // make the area picker silently lose real maps again.  The registry's supported DOS titles
  // all use the fixed Gen1 GEO layout, while DQK's variable-size GEO.GLB is covered elsewhere.
  it('keeps the complete fixed-size GEO catalogue for every registered Gen1 title', async () => {
    const titles = [
      { name: 'Champions of Krynn', root: resolve(repoRoot, 'Champions of Krynn'), count: 15 },
      { name: 'Death Knights of Krynn', root: resolve(repoRoot, 'Death Knights of Krynn'), count: 19 },
      { name: 'Pool of Radiance', root: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD', count: 29 },
      { name: 'Curse of the Azure Bonds', root: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds', count: 16 },
      { name: 'Secret of the Silver Blades', root: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades', count: 17 },
      { name: 'Gateway to the Savage Frontier', root: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier', count: 30 },
      { name: 'Treasures of the Savage Frontier', root: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier', count: 41 },
      { name: 'Pools of Darkness', root: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness', count: 32 },
      { name: 'Neverwinter Nights (DOS/AOL)', root: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint', count: 29 },
    ];

    for (const title of titles) {
      if (!existsSync(title.root)) continue;
      const geoFiles = (await readdir(title.root)).filter((name) => /^GEO\d+\.DAX$/i.test(name));
      const members = await Promise.all(geoFiles.map(async (file) =>
        listGen1GeoAreas(new Uint8Array(await readFile(resolve(title.root, file)))),
      ));
      const maps = members.flat();
      expect(maps, `${title.name} GEO count`).toHaveLength(title.count);
      expect(maps.every((map) => map.width === 16 && map.height === 16), `${title.name} GEO dimensions`).toBe(true);
      // Keep the archive decoder in the assertion path: a coincidentally 1,026-byte non-member
      // must not be counted just because it has the right length.
      for (const file of geoFiles) {
        const bytes = new Uint8Array(await readFile(resolve(title.root, file)));
        expect(readDaxDataBlocks(bytes).length, `${title.name}/${file} readable DAX`).toBeGreaterThan(0);
      }
    }
  });
});
