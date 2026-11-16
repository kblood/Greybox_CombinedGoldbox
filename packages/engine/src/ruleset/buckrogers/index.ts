/**
 * `buckrogers` — an overlay for Buck Rogers: Countdown to Doomsday (M5.S6 "broader roster"),
 * deliberately chosen to validate `RulesetPlugin`'s interface against the series' most
 * mechanically divergent title: a sci-fi setting with 5 skill-based CAREERS (not 11 D&D classes)
 * and technology/psionics in place of Vancian spellcasting.
 *
 * Verified facts: combat genuinely runs on "THAC0/AC, same math as AD&D" — SSI reskinned the Gold
 * Box engine rather than building new combat math from scratch (Gold Box Wiki + GameFAQs), and
 * there is no Psionicist career (an earlier ARCHITECTURE.md planning assumption, corrected here).
 *
 * **CORRECTED round 35 R4, from the game's own binary.** Two claims that stood here were written
 * when this overlay believed "no Buck Rogers binary or decoded data file exists in this repo".
 * The DOS release IS held (externally, never vendored:
 * `D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/`), and its EXEPACK-unpacked
 * `START.EXE` carries a **7-entry career table at file offset `0xECDC`** (12-byte
 * Pascal-`string[11]` stride): `Rocket Jock, Medic, Warrior, Engineer, Rogue, Scout, Monster`.
 * So the game's own table has **six** non-monster careers, not five — the five below plus
 * `Scout`. `tools/buck_string_tables.py` re-derives it (7/7 plausible PStrings at the real base,
 * 0/7 at all 16 neighbouring shifts); the table is transcribed in
 * `loaders/buckSavedCharacter.ts` as `BUCK_CAREER_LABEL`.
 *
 * `Scout` is deliberately NOT added as a selectable {@link BuckRogersCareer} here. Appearing in
 * the label table does not establish that the creation screen offers it — the table's last entry
 * is the sentinel `Monster`, which the creation screen certainly does not offer, so membership
 * alone cannot separate a player career from an NPC-only one. Settling that needs the creation
 * screen itself (a DOSBox-X character-sheet read), which round 35 deliberately did not run.
 * See `docs/engine/research/buck-string-tables.md`.
 *
 * No verified per-career XP/THAC0 numbers exist publicly (unlike 2e's well-documented PHB
 * tables), so — honestly, rather than fabricating precision that isn't sourced — this overlay
 * `extends: addnd1e.id` and maps each career onto the closest analogous 1e class purely as a
 * NAMING/approximation layer (`BUCK_ROGERS_CAREERS`), reusing that class's real combat-math curve
 * instead of inventing Buck-Rogers-specific numbers. This is the literal shape
 * `docs/engine/ARCHITECTURE.md` already planned for ("`buckrogers` swaps classes→careers and
 * spells→psionics") — the swap is a naming/mapping concern here, not a new mechanics
 * implementation, given no source data exists to model new mechanics faithfully.
 */
import type { ClassId, RulesetPlugin } from '../types.js';
import { addnd1e } from '../addnd1e/index.js';

export const BUCKROGERS_ID = 'buckrogers';

/** The five careers this overlay models. The game's own table lists a sixth non-monster career,
 * `Scout`, which is deliberately absent here — see {@link classForCareer} and the file header. */
export type BuckRogersCareer = 'rocketJock' | 'warrior' | 'engineer' | 'rogue' | 'medic';

/**
 * Career → nearest analogous 1e class (that class's combat-math curve is reused; no
 * career-specific data exists publicly to model instead). Warrior = best melee combatant
 * (fighter); Rocket Jock = mobile technical specialist, the closest semi-warrior (ranger); Rogue
 * = stealth/skills, matches by role (thief); Engineer = tech specialist replacing spellcasting
 * (magicUser); Medic = support/healing replacing divine magic (cleric).
 */
export const BUCK_ROGERS_CAREERS: Record<BuckRogersCareer, ClassId> = {
  rocketJock: 'ranger',
  warrior: 'fighter',
  engineer: 'magicUser',
  rogue: 'thief',
  medic: 'cleric',
};

/** Resolve a career id to its underlying `ClassId` analog; anything else throws.
 *
 * NOT "the only ones the real game has" — that absolute was falsified in round 35 R4 by the game's
 * own 7-entry career table at `START.EXE` `0xECDC` (see the file header). The measured statement
 * is: **the game's own table has six non-monster careers; whether the creation screen offers
 * `Scout` is unmeasured.** The five modelled here are the five with a documented 1e class analog;
 * a `Scout` id is not added until the creation screen is read. */
export function classForCareer(career: BuckRogersCareer): ClassId {
  const cls = BUCK_ROGERS_CAREERS[career];
  if (!cls) throw new Error(`buckrogers: unknown career ${JSON.stringify(career)}`);
  return cls;
}

export const buckrogers: RulesetPlugin = {
  ...addnd1e,
  id: BUCKROGERS_ID,
  name: 'Buck Rogers XXVc: Countdown to Doomsday',
  extends: addnd1e.id,
};
