/**
 * DoK spell crosswalk — the shared last hop that lets a real DoK `.WIZ` memorized-spell record (the
 * 220-byte format `loaders/monsterSideTables.ts`'s `decodeMonsterWizRecord` decodes, byte-identical for
 * both `MON{n}WIZ.DAX` monster templates AND `CHRDATA{n}.WIZ` player-character saves) reach an engine
 * consumer. Two consumers share {@link DOK_SPELL_CROSSWALK}:
 *   - {@link preparedSpellsFromDokIds} (M31.S1) — a caster **monster**'s `MonsterRecord.preparedSpellIds`
 *     into the tactical combat engine's enemy-spellcasting AI (`combat/tactical.ts`'s
 *     `TacticalCombatant.preparedSpells` / `chooseOffensiveCast`).
 *   - {@link memorizationFromDokIds} (M32.S1) — a DoK→DQK **imported player character**'s real saved
 *     memorized spells (`apps/web/src/ui/importDokParty.ts`) into a `Memorization` the existing
 *     Memorize UI / `combatSpellsForMember` already reads, with no new engine plumbing.
 *
 * {@link DOK_SPELL_CROSSWALK} maps a raw DoK global spell number (`hackdocs_extracted/SPELBOOK.TXT`,
 * 1-126) to this engine's own `COK_SPELLS` slug, by NAME identity only (not invented balance data) —
 * scoped to the real ids independently confirmed (`docs/engine/research/m31-audit.md` Part 1(b)) to
 * both exist in `COK_SPELLS` under the same name AND already have complete, tested tactical-combat
 * geometry (`combatSpells.ts`'s `GEOMETRY`). An id with no entry here (6th-level-and-up spells past
 * CoK's player cap, Dragonlance-unavailable druid spells, or a modelled-in-name-only status/utility
 * spell) is silently dropped downstream — the same "decode dumb, let the consumer filter" convention
 * {@link tacticalSpellFor} itself already uses for any spell with no `GEOMETRY` entry.
 *
 * Export (2026-07-16, BUILD-QUEUE P2.4 "original save import/export" - DoK half).
 * {@link exportDokWizFromMemorizedSlugs} is the write-direction counterpart of
 * {@link memorizationFromDokIds}: given a Greybox character's memorized-spell slugs, it crosswalks each
 * back to a raw DoK id through {@link DOK_SPELL_CROSSWALK}'s reverse (well-defined - the 14 crosswalk
 * entries map to 14 DISTINCT slugs, no collisions) and writes them via `loaders/monsterSideTables.ts`'s
 * `exportMonsterWizSpellList` into the CONFIRMED region of a 220-byte `.WIZ` record. A slug with no
 * reverse entry (anything outside the 14-id crosswalk) is silently dropped - matching this file's own
 * "decode dumb, let the consumer filter" convention, now applied symmetrically to encode. This is what
 * lets an exported caster's class survive a reimport: `.GAM`'s `classCode` only proves caster-vs-not
 * (`dokSavedCharacter.ts`'s `classCodeForDokCaster`), so recovering cleric-vs-magicUser on reimport
 * needs a `.WIZ` whose real spell ids vote decisively one way via {@link classVoteFromDokIds} - exactly
 * what a caller passing an all-cleric or all-magicUser slug list produces.
 */
import { spellById, type SpellClass } from './spellList.js';
import { tacticalSpellFor } from './combatSpells.js';
import { emptyMemorization, type Memorization } from './memorize.js';
import type { TacticalSpell } from '../../combat/tactical.js';
import { exportMonsterWizSpellList } from '../../loaders/monsterSideTables.js';

export const DOK_SPELL_CROSSWALK: Readonly<Record<number, string>> = {
  15: 'm1-magic-missile',
  21: 'm1-sleep',
  23: 'c2-hold-person',
  34: 'm2-stinking-cloud',
  47: 'm3-fireball',
  49: 'm3-hold-person',
  51: 'm3-lightning-bolt',
  58: 'c4-cure-serious-wounds',
  72: 'c5-cause-critical-wounds',
  74: 'c5-flame-strike',
  84: 'm4-fear',
  87: 'm4-ice-storm',
  91: 'm5-cloudkill',
  92: 'm5-cone-of-cold',
};

/**
 * Build a caster monster's in-combat spell list from its decoded `MonsterRecord.preparedSpellIds`
 * (M31.S1). Groups duplicate memorized copies of the same id into one {@link TacticalSpell} with
 * `usesLeft` = the copy count (mirrors `combatSpellsForMember`'s own per-level grouping for the party
 * side), crosswalks each distinct id through {@link DOK_SPELL_CROSSWALK}, and drops any id with no
 * crosswalk entry or no tactical geometry (`tacticalSpellFor` returns `null`).
 *
 * `casterLevel` scales `perLevel` dice (Fireball, Cone of Cold) — no Gen1 monster record format stores
 * an actual caster level (`m31-audit.md` Part 1(d)), so the caller passes an honestly-labelled nominal
 * default, not a decoded value; it only affects magnitude, never whether a spell is castable at all.
 *
 * Returns `undefined` (not `[]`) for no ids, or when every id is unmapped/ungeometried — matching
 * `TacticalCombatant.preparedSpells`'s own "no spellbook" convention (non-casters, and every monster
 * with no `MON{n}WIZ.DAX` entry, must behave exactly as before this slice).
 */
export function preparedSpellsFromDokIds(ids: number[] | undefined, casterLevel: number): TacticalSpell[] | undefined {
  if (!ids?.length) return undefined;
  const counts = new Map<string, number>();
  for (const id of ids) {
    const slug = DOK_SPELL_CROSSWALK[id];
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  const out: TacticalSpell[] = [];
  for (const [slug, uses] of counts) {
    const def = spellById(slug);
    if (!def) continue;
    const spell = tacticalSpellFor(slug, def.name, casterLevel, uses);
    if (spell) out.push(spell);
  }
  return out.length ? out : undefined;
}

/**
 * Build a DoK **player-import** character's memorized-spell state from their real saved `.WIZ`
 * memorized-spell ids (M32.S1, `CHRDATA{n}.WIZ` — the same 220-byte format M31.S1 decoded for
 * *monsters*, cross-validated against these very save files, so no new decode is needed here).
 *
 * Crosswalks each raw DoK id through {@link DOK_SPELL_CROSSWALK} same as the monster side, but ALSO
 * filters to only the class (`cls`, the importer's own already-inferred `inferDokClass` verdict) the
 * surviving spell actually belongs to — a class-consistency check the monster side has no equivalent
 * of (a monster combatant has no stored class, only a spell list). Duplicate memorized copies are kept
 * as separate entries in the same `Memorization.byLevel` bucket (multiple simultaneously-prepared
 * copies of one spell), not merged/counted, matching how `memorize()` itself accumulates state.
 *
 * Deliberately does NOT second-guess `cls` — a real save's spells that mismatch the inferred class
 * (e.g. a save whose real list is majority-cleric but was inferred as magicUser by the ability-score
 * tie-break) are silently dropped rather than overriding the class inference (`m32-audit.md` §(c)): an
 * honest, if partial, result rather than a bigger, riskier change to already-shipped import behavior.
 *
 * Returns `undefined` for no ids, or when nothing survives the crosswalk+class filter — matching this
 * module's own "no spellbook" convention so an importer can skip the `setMemorization` call entirely.
 */
export function memorizationFromDokIds(ids: number[] | undefined, cls: SpellClass): Memorization | undefined {
  if (!ids?.length) return undefined;
  const mem = emptyMemorization();
  let any = false;
  for (const id of ids) {
    const slug = DOK_SPELL_CROSSWALK[id];
    if (!slug) continue;
    const def = spellById(slug);
    if (!def || def.class !== cls) continue;
    mem.byLevel[def.level - 1] = [...mem.byLevel[def.level - 1], slug];
    any = true;
  }
  return any ? mem : undefined;
}

/** `DOK_SPELL_CROSSWALK` slug -> raw DoK id, the write-direction inverse. Well-defined: the 14 forward
 * entries map to 14 distinct slugs, so no slug has more than one candidate id. */
const DOK_SPELL_CROSSWALK_REVERSE: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(DOK_SPELL_CROSSWALK).map(([id, slug]) => [slug, Number(id)]),
);

/**
 * Crosswalk a list of engine spell slugs (e.g. a Greybox character's `Memorization.byLevel.flat()`,
 * duplicates preserved for multiple simultaneously-memorized copies) back to raw DoK ids through
 * {@link DOK_SPELL_CROSSWALK_REVERSE}. A slug with no reverse entry is silently dropped (see this
 * file's header doc comment). Exposed separately from {@link exportDokWizFromMemorizedSlugs} so a
 * caller can check which slugs actually survived the crosswalk before deciding whether the resulting
 * `.WIZ` will vote for the intended class.
 */
export function dokIdsFromMemorizedSlugs(slugs: readonly string[]): number[] {
  const ids: number[] = [];
  for (const slug of slugs) {
    const id = DOK_SPELL_CROSSWALK_REVERSE[slug];
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

/**
 * Synthesize a 220-byte `.WIZ` record's CONFIRMED memorized-spell-list region from a Greybox
 * character's memorized spell slugs — the export-side composition of {@link dokIdsFromMemorizedSlugs}
 * and `loaders/monsterSideTables.ts`'s `exportMonsterWizSpellList`. See this file's header doc comment
 * ("Export") for what this can and cannot prove about a reimported character's class.
 */
export function exportDokWizFromMemorizedSlugs(slugs: readonly string[]): Uint8Array {
  return exportMonsterWizSpellList(dokIdsFromMemorizedSlugs(slugs));
}
