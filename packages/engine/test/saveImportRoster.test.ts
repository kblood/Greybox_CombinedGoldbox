/**
 * Cross-game import + party-roster gate tests (ovr017 / ovr018).
 *
 * Import (ConvertPoolRadPlayer / TransferHillsFarCharacter):
 *   - 300-platinum stipend overrides source coins.
 *   - animate_dead force-cleared in the spell book.
 *   - EnforceRaceSexLimits re-caps abilities to the race/sex ranges.
 *   - source record is never mutated.
 *   - Hillsfar partial transfer raises only (never lowers).
 *
 * Roster (AddPlayer): party-size cap (≤6 PCs), total cap (≤8), paladin↔evil both ways,
 *   ranger cap (reject 4th), duplicate name+mod_id, and a happy-path add.
 */
import { describe, it, expect } from 'vitest';
import {
  blankCharacter,
  convertImportedCharacter,
  transferHillsfarCharacter,
  importCharacter,
  ANIMATE_DEAD_SPELL_ID,
  IMPORT_PLATINUM_STIPEND,
  NPC_BASE,
  addPlayer,
  type PlayerCharacter,
  type Roster,
  type RosterMember,
} from '../src/index.js';

// --- import fixtures -------------------------------------------------------

function poolSource(over: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return blankCharacter({
    name: 'AVERN',
    race: 'human',
    sex: 'male',
    hitDice: 5,
    platinum: 17, // some leftover source coins, should be overridden
    ...over,
  });
}

describe('convertImportedCharacter (Pool/Curse/Silver full convert)', () => {
  it('grants the fixed 300-platinum stipend, overriding source coins', () => {
    const out = convertImportedCharacter(poolSource({ platinum: 9999 }));
    expect(out.platinum).toBe(IMPORT_PLATINUM_STIPEND);
    expect(out.platinum).toBe(300);
  });

  it('force-clears animate_dead in the spell book', () => {
    const src = poolSource();
    src.spellBook[ANIMATE_DEAD_SPELL_ID - 1] = 1; // had it memorised
    src.spellBook[0] = 1; // an unrelated spell stays
    const out = convertImportedCharacter(src);
    expect(out.spellBook[ANIMATE_DEAD_SPELL_ID - 1]).toBe(0);
    expect(out.spellBook[0]).toBe(1);
  });

  it('EnforceRaceSexLimits clamps abilities to the race/sex ranges', () => {
    // Kender CON max is 18; an out-of-range 19 must be clamped down on import.
    const src = poolSource({
      race: 'kender',
      sex: 'male',
      abilities: { str: 20, int: 10, wis: 10, dex: 10, con: 19, cha: 10 },
    });
    const out = convertImportedCharacter(src);
    expect(out.abilities.con).toBeLessThanOrEqual(18);
    // Kender male STR max is 16 — a 20 is capped.
    expect(out.abilities.str).toBeLessThanOrEqual(16);
  });

  it('sets multiclassLevel to HitDice and never mutates the source', () => {
    const src = poolSource({ hitDice: 7, multiclassLevel: 1, platinum: 5 });
    const out = convertImportedCharacter(src);
    expect(out.multiclassLevel).toBe(7);
    // source untouched
    expect(src.platinum).toBe(5);
    expect(src.multiclassLevel).toBe(1);
  });

  it('importCharacter dispatches pool/curse/silver to the full convert', () => {
    for (const source of ['pool', 'curse', 'silver'] as const) {
      const out = importCharacter(source, poolSource());
      expect(out.platinum).toBe(300);
    }
  });
});

describe('transferHillsfarCharacter (partial raise-only)', () => {
  it('raises a stat only when Hillsfar trained it higher, never lowering', () => {
    const target = blankCharacter({
      abilities: { str: 12, int: 9, wis: 10, dex: 14, con: 10, cha: 10 },
      exp: 5000,
      age: 25,
    });
    const out = transferHillsfarCharacter(target, {
      abilities: { str: 16, int: 8, wis: 10, dex: 11, con: 10, cha: 10 },
      exp: 4000, // lower → ignored
      age: 30, // higher → taken
    });
    expect(out.abilities.str).toBe(16); // raised
    expect(out.abilities.int).toBe(9); // NOT lowered to 8
    expect(out.abilities.dex).toBe(14); // NOT lowered to 11
    expect(out.exp).toBe(5000); // not lowered
    expect(out.age).toBe(30); // raised
    expect(target.abilities.str).toBe(12); // source untouched
  });

  it('importCharacter Hillsfar requires an existing target', () => {
    expect(() => importCharacter('hillsfar', poolSource())).toThrow();
    const target = blankCharacter({ abilities: { str: 10, int: 10, wis: 10, dex: 10, con: 10, cha: 10 } });
    const out = importCharacter('hillsfar', poolSource(), {
      target,
      hillsfar: { abilities: { str: 15, int: 10, wis: 10, dex: 10, con: 10, cha: 10 }, exp: 0, age: 0 },
    });
    expect(out.abilities.str).toBe(15);
  });
});

// --- roster fixtures -------------------------------------------------------

let modSeq = 1;
function member(over: Partial<RosterMember> = {}): RosterMember {
  return {
    name: 'PC',
    modId: modSeq++,
    controlMorale: 0, // PC
    alignment: 0, // LG (good)
    paladinLevel: 0,
    rangerLevel: 0,
    ...over,
  };
}
const EVIL = 2; // (2+1)%3===0 → evil (Lawful Evil)
const npc = (over: Partial<RosterMember> = {}) => member({ controlMorale: NPC_BASE, ...over });
function rosterOf(...members: RosterMember[]): Roster {
  return { members };
}

describe('addPlayer roster gates (ovr018)', () => {
  it('happy path: adds a valid PC to a small party', () => {
    const r = rosterOf(member({ name: 'A' }), member({ name: 'B' }));
    const res = addPlayer(r, member({ name: 'C' }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.roster.members).toHaveLength(3);
    expect(r.members).toHaveLength(2); // input not mutated
  });

  it('party-full: rejects a 7th player character', () => {
    const six = [0, 1, 2, 3, 4, 5].map((i) => member({ name: `P${i}` }));
    const res = addPlayer(rosterOf(...six), member({ name: 'SEVENTH' }));
    expect(res).toEqual({ ok: false, reason: 'party-full' });
  });

  it('roster-full: rejects a 9th total member (NPC over the total cap)', () => {
    // 6 PCs + 2 NPCs = 8 total; a 9th (NPC) is refused.
    const members = [
      ...[0, 1, 2, 3, 4, 5].map((i) => member({ name: `P${i}` })),
      npc({ name: 'N0' }),
      npc({ name: 'N1' }),
    ];
    const res = addPlayer(rosterOf(...members), npc({ name: 'N2' }));
    expect(res).toEqual({ ok: false, reason: 'roster-full' });
  });

  it('paladin-rejects-evil: a paladin will not join an evil-tainted party', () => {
    const r = rosterOf(member({ name: 'E', alignment: EVIL }));
    const res = addPlayer(r, member({ name: 'PAL', paladinLevel: 1 }));
    expect(res).toEqual({ ok: false, reason: 'paladin-rejects-evil' });
  });

  it('evil-rejects-paladin: an evil character will not join while a paladin is present', () => {
    const r = rosterOf(member({ name: 'PAL', paladinLevel: 1 }));
    const res = addPlayer(r, member({ name: 'BADGUY', alignment: EVIL }));
    expect(res).toEqual({ ok: false, reason: 'evil-rejects-paladin' });
  });

  it('too-many-rangers: rejects a ranger when 3 are already present', () => {
    const three = [0, 1, 2].map((i) => member({ name: `R${i}`, rangerLevel: 1 }));
    const res = addPlayer(rosterOf(...three), member({ name: 'R4', rangerLevel: 1 }));
    expect(res).toEqual({ ok: false, reason: 'too-many-rangers' });
    // but a 3rd ranger (2 present) is allowed
    const two = [0, 1].map((i) => member({ name: `R${i}`, rangerLevel: 1 }));
    const ok = addPlayer(rosterOf(...two), member({ name: 'R2', rangerLevel: 1 }));
    expect(ok.ok).toBe(true);
  });

  it('duplicate: rejects an identical name + mod_id', () => {
    const dup = member({ name: 'TWIN', modId: 77 });
    const r = rosterOf(dup);
    const res = addPlayer(r, member({ name: 'TWIN', modId: 77 }));
    expect(res).toEqual({ ok: false, reason: 'duplicate' });
    // same name, DIFFERENT mod_id is allowed
    const ok = addPlayer(r, member({ name: 'TWIN', modId: 78 }));
    expect(ok.ok).toBe(true);
  });

  it('first member is always accepted (empty party)', () => {
    const res = addPlayer(rosterOf(), member({ name: 'EVIL-PAL?', alignment: EVIL, paladinLevel: 0 }));
    expect(res.ok).toBe(true);
  });
});
