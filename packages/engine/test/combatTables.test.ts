/**
 * addnd1e THAC0 + saving-throw tables (M2.S3b).
 *
 * 1) Canonical 1e checks (Fighter L1 THAC0 20 / saves 14-15-16-17-17, etc.) + clamping.
 * 2) Golden cross-validation against Champions of Krynn's OWN data: the CoK NPC-class monster
 *    records store each NPC's THAC0, and they must equal the ruleset table at the NPC's hit-dice
 *    level (the independent oracle that proves the transcribed table transfers to CoK).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addnd1e, thac0, savingThrows, decodeMonsterArchive } from '../src/index.js';

describe('addnd1e.thac0 — canonical 1e + clamping', () => {
  it('matches the published fighter / cleric / magic-user / thief progressions', () => {
    expect(thac0('fighter', 1)).toBe(20);
    expect(thac0('fighter', 3)).toBe(18);
    expect(thac0('fighter', 7)).toBe(14);
    expect(thac0('cleric', 1)).toBe(20);
    expect(thac0('cleric', 4)).toBe(18);
    expect(thac0('magicUser', 1)).toBe(21);
    expect(thac0('magicUser', 3)).toBe(21);
    expect(thac0('thief', 5)).toBe(19);
  });

  it('clamps out-of-range levels to the table bounds', () => {
    expect(thac0('fighter', 0)).toBe(20); // level-0 placeholder → level 1
    expect(thac0('fighter', 12)).toBe(9);
    expect(thac0('fighter', 25)).toBe(9); // beyond the table caps at column 12
  });

  it('is exposed on the assembled plugin', () => {
    expect(addnd1e.thac0).toBeTypeOf('function');
    expect(addnd1e.thac0!('fighter', 3)).toBe(18);
  });
});

describe('addnd1e.savingThrows — canonical 1e', () => {
  it('returns the five 1e categories in order', () => {
    expect(savingThrows('fighter', 1)).toEqual({
      paralyzePoisonDeath: 14,
      petrifyPolymorph: 15,
      rodStaffWand: 16,
      breath: 17,
      spell: 17,
    });
    expect(savingThrows('cleric', 1)).toEqual({
      paralyzePoisonDeath: 10,
      petrifyPolymorph: 13,
      rodStaffWand: 14,
      breath: 16,
      spell: 15,
    });
    // Magic-user is best vs rod/staff/wand and spell, worst vs breath.
    const mu = savingThrows('magicUser', 1);
    expect(mu.rodStaffWand).toBe(11);
    expect(mu.breath).toBe(15);
  });

  it('improves (lowers) with level and is exposed on the plugin', () => {
    expect(savingThrows('fighter', 11).paralyzePoisonDeath).toBe(7);
    expect(addnd1e.savingThrows!('cleric', 1).paralyzePoisonDeath).toBe(10);
  });
});

// --- Golden: the table must match CoK's own NPC THAC0 values --------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const monPath = resolve(here, '..', '..', '..', 'Champions of Krynn', 'MON1CHA.DAX');

describe('addnd1e.thac0 — golden vs CoK NPC-class monsters', () => {
  it.skipIf(!existsSync(monPath))('equals the NPC-record THAC0 at the NPC hit-dice level', async () => {
    const mons = decodeMonsterArchive(new Uint8Array(await readFile(monPath)));
    const by = (n: string) => mons.find((m) => m.name === n)!;

    // WARRIOR / SOLDIER are fighter-type; BLACK ROBE MAGE is magic-user-type. Their stored THAC0
    // (60 − byte[89]) must equal the ruleset table at their hit-dice count.
    const warrior = by('WARRIOR');
    expect(thac0('fighter', warrior.hitDice)).toBe(warrior.thac0); // HD 3 → 18

    const soldier = by('SOLDIER');
    expect(thac0('fighter', soldier.hitDice)).toBe(soldier.thac0); // HD 7 → 14

    const mage = by('BLACK ROBE MAGE');
    expect(thac0('magicUser', mage.hitDice)).toBe(mage.thac0); // HD 3 → 21
  });
});
