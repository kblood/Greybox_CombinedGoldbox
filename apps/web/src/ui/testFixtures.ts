/**
 * Hand-built, schema-valid `ModulePackage` fixtures used ONLY by the `window.__greybox` e2e
 * seams (`buildTestModuleGbmod` — M11.S3, `buildTestModuleWithArtGbmod` — M11.S4) — proving the
 * Library's real Import path (`deserializeModulePackage` → a `kind:'module'` entry →
 * `startModuleExplore`) round-trips a genuine serialized module without depending on
 * `apps/author`'s own UI to author one first. Not used by any real app feature.
 */
import { serializeModulePackage, ADND1E_ID, type ModulePackage, type FrameSet } from '@goldbox/engine';

export function buildTestModuleGbmod(): string {
  const pkg: ModulePackage = {
    schema: 1,
    id: 'e2e-test-module',
    title: 'E2E Test Module',
    ruleset: ADND1E_ID,
    maps: [
      {
        name: 'E2E Test Map',
        width: 2,
        height: 1,
        cells: [
          { walls: { north: 1, east: 0, south: 1, west: 1 } },
          { walls: { north: 1, east: 1, south: 1, west: 0 }, event: 1 },
        ],
        entries: [{ id: 0, x: 0, y: 0, facing: 'east' }],
        events: [{ id: 1, type: 'message', body: { text: 'YOU FOUND THE E2E TEST EVENT' } }],
      },
    ],
    entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
    databases: { monsters: [], items: [], spells: [], classes: [], races: [] },
  };
  return serializeModulePackage(pkg);
}

/** Source-less authored Combat fixture. Its deliberately weak monster lets host e2e inspect the
 * real tactical handoff without borrowing FRUA provenance or original-game assets. */
export function buildTestModuleCombatGbmod(): string {
  const pkg: ModulePackage = {
    schema: 1,
    id: 'e2e-authored-combat',
    title: 'E2E Authored Combat',
    ruleset: ADND1E_ID,
    maps: [
      {
        name: 'E2E Combat Map',
        width: 2,
        height: 1,
        cells: [
          { walls: { north: 1, east: 0, south: 1, west: 1 } },
          { walls: { north: 1, east: 1, south: 1, west: 0 }, event: 1 },
        ],
        entries: [{ id: 0, x: 0, y: 0, facing: 'east' }],
        events: [{
          id: 1,
          type: 'pickOneCombat',
          onceOnly: true,
          body: {
            intro: 'AN AUTHORED FOE ATTACKS.',
            monsters: [{ monsterId: 1, count: 1, picBlockId: 0 }],
          },
        }],
      },
    ],
    entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
    databases: {
      monsters: [{
        id: 1,
        name: 'E2E ASH MOTH',
        hitPoints: 1,
        armorClass: 20,
        thac0: 20,
        damage: { count: 1, sides: 2, bonus: 0 },
        xp: 1,
      }],
      items: [],
      spells: [],
      classes: [],
      races: [],
    },
  };
  return serializeModulePackage(pkg);
}

/** A 2×2 synthetic art fixture — small enough to hand-check, real enough (base64-embedded pixel
 * indices + a palette) to prove the M11.S4 art panel actually decodes and paints it, not just
 * that the field survived JSON. */
export function buildTestModuleWithArtGbmod(): string {
  const frameSet: FrameSet = {
    name: 'E2E_ART',
    kind: 'bigpic',
    frames: new Map([
      [
        0,
        {
          width: 2,
          height: 2,
          indices: Uint8Array.from([0, 1, 2, 3]),
          xOffset: 0,
          yOffset: 0,
          transparentIndex: null,
          palette: {
            colors: [
              { r: 255, g: 0, b: 0 },
              { r: 0, g: 255, b: 0 },
              { r: 0, g: 0, b: 255 },
              { r: 255, g: 255, b: 0 },
            ],
            source: 'hlib-range',
          },
        },
      ],
    ]),
  };
  const pkg: ModulePackage = {
    schema: 1,
    id: 'e2e-test-module-art',
    title: 'E2E Test Module With Art',
    ruleset: ADND1E_ID,
    maps: [
      {
        name: 'E2E Art Map',
        width: 1,
        height: 1,
        cells: [{ walls: { north: 1, east: 1, south: 1, west: 1 } }],
        entries: [{ id: 0, x: 0, y: 0, facing: 'east' }],
        events: [],
      },
    ],
    entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
    databases: { monsters: [], items: [], spells: [], classes: [], races: [] },
    graphicSets: [frameSet],
  };
  return serializeModulePackage(pkg);
}
