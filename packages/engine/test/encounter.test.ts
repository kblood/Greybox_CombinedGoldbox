/**
 * Encounter resolution (M2.S6) — the ECL-combat glue.
 *
 * 1) resolveEncounter spawns the roster, reports unknown ids, runs deterministic combat.
 * 2) Full pipeline: an ECL block (LOAD_MONSTER + COMBAT) → the VM's combat roster →
 *    resolveEncounter against the real MON1CHA archive → a deterministic outcome.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EclVm,
  ECL_HEADER_LEN,
  addnd1e,
  partyCombatant,
  resolveEncounter,
  spawnEnemies,
  runCombatViaStepper,
  monsterLookupFromArchive,
  decodeMonsterArchive,
  type PartyMemberSpec,
  type Combatant,
  type EncounterMonster,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const monPath = resolve(here, '..', '..', '..', 'Champions of Krynn', 'MON1CHA.DAX');

const HERO: PartyMemberSpec = {
  id: 'hero',
  name: 'Hero',
  classes: { fighter: 8 },
  abilities: { str: 18, strPct: 100, int: 10, wis: 10, dex: 16, con: 16, cha: 10 },
  hp: 70,
  maxHp: 70,
  baseAc: 2,
  weaponDamage: { count: 1, sides: 8, bonus: 0 },
};

function block(...body: number[]): Uint8Array {
  const raw = new Uint8Array(ECL_HEADER_LEN + body.length);
  raw[0] = 0x88; raw[1] = 0x13; raw[2] = 0x01; raw[3] = 0x01;
  raw.set(body, ECL_HEADER_LEN);
  return raw;
}
const imm = (v: number) => [0x00, v & 0xff];

describe('resolveEncounter', () => {
  it.skipIf(!existsSync(monPath))('spawns real CoK monsters from a roster and fights deterministically', async () => {
    const archive = decodeMonsterArchive(new Uint8Array(await readFile(monPath)));
    const lookup = monsterLookupFromArchive(archive);
    // MON1CHA: block 9 = GOBLIN, block 19 = OGRE.
    const roster: EncounterMonster[] = [
      { monsterId: 9, count: 3, picBlockId: 0 },
      { monsterId: 19, count: 1, picBlockId: 0 },
    ];
    const party: Combatant[] = [partyCombatant(HERO, addnd1e)];

    const a = resolveEncounter(roster, lookup, [partyCombatant(HERO, addnd1e)], { seed: 0x55 });
    const b = resolveEncounter(roster, lookup, party, { seed: 0x55 });
    expect(a.log).toEqual(b.log); // determinism
    expect(a.unresolved).toEqual([]);
    // 3 goblins + 1 ogre were spawned → 4 enemy combatants existed at the start.
    const enemyIdsSeen = new Set(
      a.log.filter((e) => e.type === 'attack').flatMap((e) => [e.attacker!, e.target!]),
    );
    expect([...enemyIdsSeen].filter((id) => id.startsWith('e')).length).toBeGreaterThan(0);
    expect(['party', 'enemy']).toContain(a.outcome);
  });

  it('spawnEnemies builds the same line-up the interactive screen fights (and matches resolveEncounter)', () => {
    // Two known + one unknown group; ids must be e0,e1,e2 (per-instance) skipping the unknown.
    const lookup = monsterLookupFromArchive([
      { blockId: 9, name: 'GOBLIN', hitPoints: 5, thac0: 21, armorClass: 6, damage: { count: 1, sides: 6, bonus: 0 }, xp: 20 } as never,
      { blockId: 19, name: 'OGRE', hitPoints: 18, thac0: 16, armorClass: 5, damage: { count: 1, sides: 10, bonus: 0 }, xp: 90 } as never,
    ]);
    const roster: EncounterMonster[] = [
      { monsterId: 9, count: 2, picBlockId: 0 },
      { monsterId: 77, count: 5, picBlockId: 0 }, // unknown → skipped
      { monsterId: 19, count: 1, picBlockId: 0 },
    ];
    const { enemies, unresolved } = spawnEnemies(roster, lookup);
    expect(unresolved).toEqual([77]);
    expect(enemies.map((e) => e.id)).toEqual(['e0', 'e1', 'e2']);
    expect(enemies.map((e) => e.name)).toEqual(['GOBLIN', 'GOBLIN', 'OGRE']);

    // The interactive path (spawnEnemies + stepper) reproduces the auto-resolve path byte-for-byte.
    const party: Combatant[] = [partyCombatant(HERO, addnd1e)];
    const auto = resolveEncounter(roster, lookup, [partyCombatant(HERO, addnd1e)], { seed: 0x321 });
    const viaStepper = runCombatViaStepper([...party, ...spawnEnemies(roster, lookup).enemies], { seed: 0x321 });
    expect(viaStepper.log).toEqual(auto.log);
    expect(viaStepper.outcome).toBe(auto.outcome);
  });

  it('reports unknown monster ids in `unresolved` instead of throwing', () => {
    const lookup = monsterLookupFromArchive([]); // empty → everything unknown
    const res = resolveEncounter(
      [{ monsterId: 9, count: 2, picBlockId: 0 }],
      lookup,
      [partyCombatant(HERO, addnd1e)],
      { seed: 1 },
    );
    expect(res.unresolved).toEqual([9]);
    expect(res.outcome).toBe('party'); // no enemies spawned → party stands unopposed
  });
});

describe('ECL → combat full pipeline', () => {
  it.skipIf(!existsSync(monPath))('runs a script-triggered encounter end to end', async () => {
    const archive = decodeMonsterArchive(new Uint8Array(await readFile(monPath)));
    const lookup = monsterLookupFromArchive(archive);

    // LOAD_MONSTER id=9(GOBLIN) copies=3 pic=0 ; COMBAT ; EXIT
    const vm = new EclVm(block(0x0b, ...imm(9), ...imm(3), ...imm(0), 0x24, 0x00));
    const r = vm.run();
    expect(r.status).toBe('combat');
    const combat = r.effects.find((e) => e.type === 'combat');
    const roster = combat!.type === 'combat' ? combat!.monsters : [];
    expect(roster).toEqual([{ monsterId: 9, count: 3, picBlockId: 0 }]);

    const result = resolveEncounter(roster, lookup, [partyCombatant(HERO, addnd1e)], { seed: 0x99 });
    expect(result.unresolved).toEqual([]);
    expect(['party', 'enemy']).toContain(result.outcome);

    // The host would now resume the script after the fight.
    expect(vm.resume().status).toBe('exited');
  });
});
