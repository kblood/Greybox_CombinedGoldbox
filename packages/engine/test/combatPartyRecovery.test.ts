import { describe, expect, it } from 'vitest';
import {
  applyCombatRosterCarryOver,
  cleanupCombatRosterAfterCombat,
  healRosterMember,
  raiseRosterMember,
  raiseRosterMemberWithRules,
  type CombatCleanupRosterMember,
  type RaiseDeadRosterMember,
  type RecoverableRosterMember,
} from '../src/index.js';

describe('combat roster recovery handoff (CT.7h)', () => {
  it('carries combat HP back by p{n} id and marks only source-dead members permadead', () => {
    const roster: RecoverableRosterMember[] = [
      { hp: 12, maxHp: 20 },
      { hp: 8, maxHp: 18 },
      { hp: 30, maxHp: 30 },
    ];
    const next = applyCombatRosterCarryOver(
      roster,
      [
        { id: 'p1', side: 'party', hp: -4 },
        { id: 'p2', side: 'party', hp: -20 },
        { id: 'e1', side: 'enemy', hp: 0 },
        { id: 'x9', side: 'party', hp: 1 },
      ],
      (id) => (id === 'p2' ? 'dead' : id === 'p1' ? 'unconscious' : 'ok'),
    );

    expect(next.map((m) => m.hp)).toEqual([0, 0, 30]);
    expect(next[0].dead).toBeUndefined();
    expect(next[1].dead).toBe(true);
    expect(next[2].dead).toBeUndefined();
  });

  it('lets cure/rest-style healing recover unconscious members but skips permadead members', () => {
    const roster: RecoverableRosterMember[] = [
      { hp: 0, maxHp: 20 },
      { hp: 0, maxHp: 18, dead: true },
    ];

    const healed = healRosterMember(roster, 0, 7);
    expect(healed.healed).toBe(7);
    expect(healed.roster[0].hp).toBe(7);

    const skipped = healRosterMember(roster, 1, 7);
    expect(skipped.healed).toBe(0);
    expect(skipped.roster[1].hp).toBe(0);
    expect(skipped.roster[1].dead).toBe(true);
  });

  it('raises only permadead members, clearing the dead flag and restoring 1 HP', () => {
    const roster: RecoverableRosterMember[] = [
      { hp: 0, maxHp: 20 },
      { hp: 0, maxHp: 18, dead: true },
    ];

    const notDead = raiseRosterMember(roster, 0);
    expect(notDead.raised).toBe(false);
    expect(notDead.roster[0].hp).toBe(0);

    const raised = raiseRosterMember(roster, 1);
    expect(raised.raised).toBe(true);
    expect(raised.roster[1].hp).toBe(1);
    expect(raised.roster[1].dead).toBe(false);
  });

  it('demotes post-combat dying members to unconscious in normal combat cleanup', () => {
    const roster: CombatCleanupRosterMember[] = [
      { hp: 0, maxHp: 20, condition: 'dying' },
      { hp: 0, maxHp: 18, condition: 'dead', dead: true },
    ];

    const next = cleanupCombatRosterAfterCombat(roster);

    expect(next[0]).toMatchObject({ hp: 0, condition: 'unconscious', dead: false });
    expect(next[1]).toMatchObject({ hp: 0, condition: 'dead', dead: true });
  });

  it('restores dying and unconscious members to 1 HP after duel cleanup', () => {
    const roster: CombatCleanupRosterMember[] = [
      { hp: 0, maxHp: 20, condition: 'dying' },
      { hp: 0, maxHp: 18, condition: 'unconscious' },
    ];

    const next = cleanupCombatRosterAfterCombat(roster, { duel: true });

    expect(next[0]).toMatchObject({ hp: 1, condition: 'ok', dead: false });
    expect(next[1]).toMatchObject({ hp: 1, condition: 'ok', dead: false });
  });

  it('party-fled cleanup keeps running members and removes the rest before non-team members', () => {
    const roster: CombatCleanupRosterMember[] = [
      { hp: 4, maxHp: 20, condition: 'running' },
      { hp: 0, maxHp: 18, condition: 'unconscious' },
      { hp: 7, maxHp: 7, condition: 'ok', nonTeamMember: true },
    ];

    const next = cleanupCombatRosterAfterCombat(roster, { partyFled: true });

    expect(next[0]).toMatchObject({ condition: 'ok', removed: false });
    expect(next[1]).toMatchObject({ condition: 'unconscious', removed: true });
    expect(next[2].removed).toBeUndefined();
  });

  it('party-killed cleanup removes party members but stops before non-team members', () => {
    const roster: CombatCleanupRosterMember[] = [
      { hp: 0, maxHp: 20, condition: 'dead', dead: true },
      { hp: 7, maxHp: 7, condition: 'ok', nonTeamMember: true },
    ];

    const next = cleanupCombatRosterAfterCombat(roster, { partyKilled: true });

    expect(next[0].removed).toBe(true);
    expect(next[1].removed).toBeUndefined();
  });

  it('spell Raise Dead raises dead non-elves, clears poison/animate state, and decrements CON', () => {
    const roster: RaiseDeadRosterMember[] = [
      { hp: 0, maxHp: 18, condition: 'dead', dead: true, race: 'human', con: 12, poisoned: true },
    ];

    const result = raiseRosterMemberWithRules(roster, 0);

    expect(result.raised).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.roster[0]).toMatchObject({
      hp: 1,
      condition: 'ok',
      dead: false,
      poisoned: false,
      animated: false,
      con: 11,
    });
  });

  it('spell Raise Dead can target animated members even without a dead flag', () => {
    const roster: RaiseDeadRosterMember[] = [
      { hp: 0, maxHp: 14, condition: 'animated', animated: true, race: 'dwarf', con: 10 },
    ];

    const result = raiseRosterMemberWithRules(roster, 0);

    expect(result.raised).toBe(true);
    expect(result.roster[0]).toMatchObject({ hp: 1, condition: 'ok', dead: false, animated: false, con: 9 });
  });

  it('spell Raise Dead rejects merely unconscious, elf, and zero-CON members', () => {
    const roster: RaiseDeadRosterMember[] = [
      { hp: 0, maxHp: 18, condition: 'unconscious', race: 'human', con: 12 },
      { hp: 0, maxHp: 18, condition: 'dead', dead: true, race: 'elf', con: 12 },
      { hp: 0, maxHp: 18, condition: 'dead', dead: true, race: 'human', con: 0 },
      { hp: 0, maxHp: 18, condition: 'dead', dead: true, race: 'silvanestiElf', con: 12 },
    ];

    expect(raiseRosterMemberWithRules(roster, 0)).toMatchObject({ raised: false, reason: 'not-dead' });
    expect(raiseRosterMemberWithRules(roster, 1)).toMatchObject({ raised: false, reason: 'elf' });
    expect(raiseRosterMemberWithRules(roster, 2)).toMatchObject({ raised: false, reason: 'no-con' });
    expect(raiseRosterMemberWithRules(roster, 3)).toMatchObject({ raised: false, reason: 'elf' });
  });

  it('temple Raise Dead has no elf or zero-CON rejection but decrements positive CON', () => {
    const roster: RaiseDeadRosterMember[] = [
      { hp: 0, maxHp: 18, condition: 'dead', dead: true, race: 'elf', con: 12 },
      { hp: 0, maxHp: 18, condition: 'dead', dead: true, race: 'human', con: 0 },
    ];

    const elf = raiseRosterMemberWithRules(roster, 0, { source: 'temple' });
    const noCon = raiseRosterMemberWithRules(roster, 1, { source: 'temple' });

    expect(elf.raised).toBe(true);
    expect(elf.roster[0]).toMatchObject({ hp: 1, condition: 'ok', dead: false, con: 11 });
    expect(noCon.raised).toBe(true);
    expect(noCon.roster[1]).toMatchObject({ hp: 1, condition: 'ok', dead: false, con: 0 });
  });
});
