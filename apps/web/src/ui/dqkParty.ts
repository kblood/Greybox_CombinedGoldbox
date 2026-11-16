/**
 * DQK pre-made party (Phase C, C4.3) — the Heroes of the Lance as a ready-to-play roster so the
 * shared Phase-A systems (character sheet / spell memorization / inventory / town) run **driven by a
 * DQK party**, not a CoK one. Those overlays are entirely party- + ruleset-driven (they read
 * `getParty()` and the engine's `addnd1e-dragonlance` ruleset), so "DQK support" is a roster + wiring
 * slice: install a DQK-appropriate party and open the same overlays from the DQK explore view.
 *
 * The heroes are authored (engine `createCharacter`), not lifted from the game's save data — original
 * content under the clean-room rule. Each request is validated by the ruleset; any that fail to
 * validate are skipped (kept honest rather than installing a malformed sheet).
 */
import { createCharacter, type CharacterSheet, type CharacterRequest } from '@goldbox/engine';
import { addToParty, clearParty, getParty } from './party.js';

/** The Heroes of the Lance, DQK-era (modest levels — the saga continues from DoK). */
const DQK_HEROES: CharacterRequest[] = [
  {
    name: 'STURM', race: 'human', sex: 'male', classes: { knight: 6 },
    abilities: { str: 17, int: 11, wis: 12, dex: 13, con: 15, cha: 14 }, hp: 52, maxHp: 52, baseAc: 3,
  },
  {
    name: 'CARAMON', race: 'human', sex: 'male', classes: { fighter: 7 },
    abilities: { str: 17, int: 10, wis: 11, dex: 15, con: 17, cha: 13 }, hp: 62, maxHp: 62, baseAc: 4,
  },
  {
    name: 'TANIS', race: 'halfElf', sex: 'male', classes: { fighter: 6 },
    abilities: { str: 16, int: 12, wis: 11, dex: 16, con: 14, cha: 15 }, hp: 50, maxHp: 50, baseAc: 4,
  },
  {
    name: 'GOLDMOON', race: 'human', sex: 'female', classes: { cleric: 6 }, deity: 'mishakal',
    abilities: { str: 12, int: 11, wis: 17, dex: 13, con: 14, cha: 16 }, hp: 40, maxHp: 40, baseAc: 5,
  },
  {
    name: 'RAISTLIN', race: 'human', sex: 'male', classes: { magicUser: 6 },
    abilities: { str: 10, int: 18, wis: 13, dex: 16, con: 10, cha: 12 }, hp: 26, maxHp: 26, baseAc: 10,
  },
  {
    name: 'TASSLEHOFF', race: 'kender', sex: 'male', classes: { thief: 7 },
    abilities: { str: 13, int: 12, wis: 10, dex: 17, con: 14, cha: 12 }, hp: 30, maxHp: 30, baseAc: 7,
  },
];

function buildSheet(req: CharacterRequest): CharacterSheet | null {
  // M95.S1 — every hero here is DQK-destined, so validate against DQK's own, materially more
  // permissive level table (dqkMaxLevel()), not CoK/DoK's flat cap createCharacter() defaults to.
  // All 6 heroes above happen to sit under both caps today, so this has no effect yet, but closes
  // the same silent-drop risk M95 found already firing for the DoK->DQK import path, preemptively.
  const res = createCharacter({ ...req, levelCapRuleset: 'dqk' });
  return res.ok ? res.sheet : null;
}

/**
 * Install the DQK pre-made party. With `force`, it replaces whatever party is loaded; otherwise it
 * only seeds when the party is empty, so a real saved party is never clobbered.
 *
 * **R2 note (import-vs-tech-demo roster ordering).** `dqkExplore.ts`'s own mount path calls this with
 * NO argument (`force` defaults to `false`), so navigating to `?dqk=1` after `?import=dqk` (R2's own
 * `SAVGAMA.QSV` importer, `importDqkParty.ts`) or after `?import=dok` (M14) leaves the imported roster
 * in place — this function only seeds "Heroes of the Lance" when the party is genuinely empty.
 * `force=true` is reached ONLY through `dqkExplore.ts`'s own `window.__dqk.installParty(force)` e2e
 * seam, for that test's own deterministic-roster scenario — it is never called on the normal
 * `?dqk=1` navigation path, so an import can never be silently clobbered by it. Returns the installed
 * roster.
 */
export function installDqkParty(force = false): CharacterSheet[] {
  if (!force && getParty().length > 0) return getParty();
  if (force) clearParty();
  if (getParty().length === 0) {
    for (const req of DQK_HEROES) {
      const sheet = buildSheet(req);
      if (sheet) addToParty(sheet);
    }
  }
  return getParty();
}
