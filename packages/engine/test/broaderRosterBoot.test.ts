/**
 * "Boots to exploration" acceptance for the supported Gold Box logical profile roster.
 *
 * No real asset data exists in this repo for most non-Krynn profiles (see
 * docs/engine/research/broader-roster-detection.md), so this proves the honest
 * engine-level claim: a hand-built, minimal `ModulePackage` tagged with each
 * built-in profile's ruleset id loads through the real `loadModule` →
 * `Explorer` path and walks a cell. Native GBBOOT covers the DOS executable/data
 * launch layer; this test keeps the TypeScript engine acceptance in sync with
 * that logical game roster instead of only sampling a few early broader entries.
 */
import { describe, it, expect } from 'vitest';
import {
  BUILTIN_PROFILES,
  Explorer,
  loadModule,
  resolveEntryPoint,
  type ModulePackage,
  type MapCell,
} from '../src/index.js';

function openCell(over: Partial<MapCell> = {}): MapCell {
  return { walls: { north: 0, east: 0, south: 0, west: 0 }, ...over };
}

function fixtureModule(id: string, title: string, ruleset: string): ModulePackage {
  return {
    schema: 1,
    id,
    title,
    ruleset,
    maps: [
      {
        name: 'entry-corridor',
        width: 2,
        height: 1,
        cells: [openCell(), openCell()],
        entries: [{ id: 0, x: 0, y: 0, facing: 'east' }],
        events: [],
      },
    ],
    entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
  };
}

const EXPECTED_BOOT_PROFILE_IDS = [
  'champions-of-krynn',
  'death-knights-of-krynn',
  'dark-queen-of-krynn',
  'pool-of-radiance',
  'curse-of-the-azure-bonds',
  'secret-of-the-silver-blades',
  'treasures-of-the-savage-frontier',
  'gateway-to-the-savage-frontier',
  'pools-of-darkness',
  'neverwinter-nights-dos',
  'buck-rogers-countdown-to-doomsday',
  'buck-rogers-matrix-cubed',
  'forgotten-realms-unlimited-adventures',
];

const PROFILE_BY_ID = new Map(BUILTIN_PROFILES.map((profile) => [profile.id, profile]));

describe('supported Gold Box profiles load from their ruleset id and boot to exploration', () => {
  it('covers every expected built-in logical game profile', () => {
    expect(BUILTIN_PROFILES.map((profile) => profile.id).sort()).toEqual([...EXPECTED_BOOT_PROFILE_IDS].sort());
  });

  for (const profileId of EXPECTED_BOOT_PROFILE_IDS) {
    const profile = PROFILE_BY_ID.get(profileId);
    if (!profile) throw new Error(`missing built-in profile ${profileId}`);

    it(`${profile.title} (ruleset=${profile.ruleset}) walks a cell via Explorer`, () => {
      const loaded = loadModule(fixtureModule(profile.id, profile.title, profile.ruleset));
      expect(loaded.ruleset.id).toBe(profile.ruleset);

      const { map, entryId } = resolveEntryPoint(loaded, 0);
      const explorer = Explorer.atEntry(map, entryId);
      expect(explorer.getPose()).toEqual({ x: 0, y: 0, facing: 'east' });

      const step = explorer.forward();
      expect(step.moved).toBe(true);
    });
  }
});
