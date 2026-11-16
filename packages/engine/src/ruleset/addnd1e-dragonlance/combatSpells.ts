/**
 * Combat-spell descriptors (CT.4b) — turns a memorized Champions/Death Knights of Krynn spell into the
 * pure {@link TacticalSpell} data the tactical combat engine applies. This is the bridge that lets a
 * real party member's *memorized* spell list drive the in-combat **Cast** command (CT.4 built the
 * data-driven cast mechanism; this supplies the data from the ruleset instead of a demo spellbook).
 *
 * The dice come straight from the verified ruleset table ({@link spellEffect}); this module only adds
 * the combat **geometry** each spell needs — range (Chebyshev cells), area footprint, and saving-throw
 * mode. Those geometry numbers are the canonical AD&D-1e / Gold Box values (range/area-of-effect/which
 * save), labelled **inferred**: the Krynn games' own in-binary spell-resolution constants are
 * cross-overlay / UNLOCATED (see `docs/engine/research/disasm-spells-krynn.md`), and DQK is confirmed
 * dice-based, so the 1e model is the faithful baseline shared with camp casting — we do NOT invent a
 * formula the binary doesn't show. Status spells with no damage/heal dice (Sleep / Hold Person /
 * Stinking Cloud / Fear / Slow / Haste) are modelled too (CT.5a): they carry an {@link INFLICT} entry
 * and resolve to a {@link TacticalSpell} whose `inflict` drives the turn-loop condition. Cloudkill is
 * modelled as a zone-only spell: the spell is castable, while the recovered CoAB map layer owns the
 * persistent cloud shape/effects.
 */
import type {
  TacticalSpell, SpellAmount, SpellAreaShape, SpellSaveMode, InflictableStatus,
} from '../../combat/tactical.js';
import { spellEffect, type SpellDice } from './spellEffects.js';

/** Combat geometry for a spell: how far it reaches, what it covers, and how a save mitigates it. */
interface SpellGeometry {
  /** Max Chebyshev range from caster to aim point, in cells. 0 = touch/self. */
  range: number;
  area: SpellAreaShape;
  /** Burst/cone radius in cells (omit for single-cell). */
  radius?: number;
  save: SpellSaveMode;
}

/**
 * Combat geometry keyed by {@link COK_SPELLS} id — **only** the spells with a concrete, faithfully
 * modelled damage/heal effect. Values are AD&D-1e / Gold Box standard (inferred, not byte-verified):
 * touch spells = range 1; the bolt/ball/storm reaches are the classic table; saves are the standard
 * half-on-save for area blasts, none for auto-hit (magic missile) and touch cure/cause. Anything not
 * listed has no tactical geometry yet and is skipped (status/utility — CT.5).
 */
const GEOMETRY: Record<string, SpellGeometry> = {
  // ── Cleric heals (touch) ──
  'c1-cure-light-wounds': { range: 1, area: 'single', save: 'none' },
  'c4-cure-serious-wounds': { range: 1, area: 'single', save: 'none' },
  'c5-cure-critical-wounds': { range: 1, area: 'single', save: 'none' },
  // ── Cleric attack ──
  'c1-cause-light-wounds': { range: 1, area: 'single', save: 'none' }, // touch, no save (1e cause wounds)
  'c5-cause-critical-wounds': { range: 1, area: 'single', save: 'none' },
  'c5-flame-strike': { range: 6, area: 'burst', radius: 1, save: 'half' },
  // ── Mage attack ──
  'm1-magic-missile': { range: 12, area: 'single', save: 'none' }, // auto-hit, never saved
  'm1-burning-hands': { range: 1, area: 'cone', radius: 1, save: 'half' },
  'm1-shocking-grasp': { range: 1, area: 'single', save: 'none' }, // touch
  'm3-fireball': { range: 10, area: 'burst', radius: 2, save: 'half' },
  'm3-lightning-bolt': { range: 10, area: 'line', save: 'half' },
  'm4-ice-storm': { range: 8, area: 'burst', radius: 2, save: 'none' }, // 1e ice storm allows no save
  'm5-cloudkill': { range: 2, area: 'burst', radius: 0, save: 'none' }, // CoAB SpellEntry 0x5b range/priority; shape comes from map layer.
  'm5-cone-of-cold': { range: 1, area: 'cone', radius: 3, save: 'half' },
  // ── Status spells (CT.5a) — no damage dice; they inflict a condition (see INFLICT). ──
  'm1-sleep': { range: 12, area: 'burst', radius: 2, save: 'none' }, // 1e: no save, ≤4 HD each
  'm2-stinking-cloud': { range: 6, area: 'burst', radius: 1, save: 'negate' },
  'c2-hold-person': { range: 6, area: 'single', save: 'negate' },
  'm3-hold-person': { range: 6, area: 'single', save: 'negate' },
  'm4-fear': { range: 1, area: 'cone', radius: 3, save: 'negate' },
  'm3-slow': { range: 8, area: 'burst', radius: 2, save: 'negate' },
  'm3-haste': { range: 8, area: 'burst', radius: 2, save: 'none' }, // ally buff
};

/**
 * Status a spell inflicts on each affected target (CT.5a). Durations/HD-caps are AD&D-1e-standard
 * (Sleep: no save, only ≤4 HD; Hold/Slow/Fear/Stinking Cloud: save negates) — INFERRED, like the
 * geometry above (the games' own in-binary status data is cross-overlay/UNLOCATED — see
 * `disasm-spells-krynn.md` §12). Sleep's `rounds: 99` ≈ "until woken" (a struck sleeper wakes anyway).
 */
const INFLICT: Record<string, { status: InflictableStatus; rounds: number; hdCap?: number }> = {
  'm1-sleep': { status: 'asleep', rounds: 99, hdCap: 4 },
  'm2-stinking-cloud': { status: 'held', rounds: 3 },
  'c2-hold-person': { status: 'held', rounds: 6 },
  'm3-hold-person': { status: 'held', rounds: 6 },
  'm4-fear': { status: 'feared', rounds: 4 },
  'm3-slow': { status: 'slowed', rounds: 3 },
  'm3-haste': { status: 'hasted', rounds: 3 },
};

const ZONE: Record<string, { kind: 'stinking' | 'cloudkill'; rounds: number }> = {
  'm5-cloudkill': { kind: 'cloudkill', rounds: 5 },
};

/**
 * AI casting priority (0-7, 7 highest) — {@link TacticalSpell.priority}, ovr010 `sub_3560B`'s
 * descending-priority spell draw. Transcribed by spell NAME identity from the COAB decompile
 * (`coab_extracted/Classes/Gbl.cs`'s `SpellEntry` table, the 15th constructor argument, `priority`
 * per `Spells.cs:200`) — the same cross-generation Gold Box source already used as ground truth for
 * `con_saving_bonus` (M28) and the `Int > 5` surrender threshold (M81). Omitted ids default to `0`
 * via `chooseOffensiveCast`'s own `?? 0` fallback (harmless — every id this engine models is listed).
 */
const PRIORITY: Record<string, number> = {
  'c1-cure-light-wounds': 1,
  'c1-cause-light-wounds': 2,
  'c4-cure-serious-wounds': 1,
  'c5-cure-critical-wounds': 2,
  'c5-cause-critical-wounds': 6,
  'c5-flame-strike': 6,
  'c2-hold-person': 6,
  'm1-magic-missile': 4,
  'm1-burning-hands': 2,
  'm1-shocking-grasp': 2,
  'm1-sleep': 2,
  'm2-stinking-cloud': 5,
  'm3-fireball': 7,
  'm3-hold-person': 6,
  'm3-lightning-bolt': 6,
  'm3-slow': 4,
  'm3-haste': 3,
  'm4-fear': 6,
  'm4-ice-storm': 7,
  'm5-cloudkill': 5,
  'm5-cone-of-cold': 6,
};

function diceToAmount(d: SpellDice): SpellAmount {
  return { count: d.count, sides: d.sides, bonus: d.bonus, perLevel: d.perLevel };
}

/**
 * Build the {@link TacticalSpell} for a memorized spell, or `null` when the spell has no faithfully
 * modelled combat effect (status/utility/buff — those wait for CT.5). `casterLevel` scales `perLevel`
 * dice (Fireball 1d6/level); `usesLeft` is how many copies the caster has memorized (the slot count).
 * `healDieBonus` (M18.S1) adds extra healing dice from a deity grant (Mishakal = +1 die on every heal
 * spell, `docs/engine/research/cok-dragonlance-rules.md` §9b) — ignored for non-heal spells.
 */
export function tacticalSpellFor(
  spellId: string,
  name: string,
  casterLevel: number,
  usesLeft: number,
  healDieBonus = 0,
): TacticalSpell | null {
  const geo = GEOMETRY[spellId];
  if (!geo) return null;
  const effect = spellEffect(spellId);
  const dice = effect.dice;
  const isHeal = effect.kind === 'heal' && !!dice;
  // A damage spell needs a real amount (dice with sides, or a flat bonus); the 0/0/0 placeholder
  // entries (slay-living etc.) are special-effect spells we don't model as raw damage yet.
  const isDamage = effect.kind === 'damage' && !!dice && (dice.sides > 0 || dice.bonus > 0);
  const inflict = INFLICT[spellId];
  const zone = ZONE[spellId];
  // Castable in combat if it heals, deals damage, inflicts a status (CT.5a), or creates a persistent zone.
  if (!isHeal && !isDamage && !inflict && !zone) return null;
  const target: 'enemy' | 'ally' | 'self' =
    isHeal ? 'ally'
      : inflict ? (inflict.status === 'hasted' ? 'ally' : 'enemy')
        : effect.target === 'self' ? 'self' : 'enemy';
  return {
    id: spellId,
    name,
    target,
    range: geo.range,
    area: geo.area,
    radius: geo.radius,
    save: geo.save,
    damage: isDamage ? diceToAmount(dice!) : undefined,
    heal: isHeal ? { ...diceToAmount(dice!), count: diceToAmount(dice!).count + Math.max(0, Math.floor(healDieBonus)) } : undefined,
    zone: zone ? { ...zone } : undefined,
    inflict: inflict ? { ...inflict } : undefined,
    casterLevel: Math.max(1, Math.floor(casterLevel)),
    usesLeft: Math.max(0, Math.floor(usesLeft)),
    priority: PRIORITY[spellId],
  };
}

/** True if a memorized spell id has a tactical-combat effect (so the Cast command can use it). */
export function isTacticalCastable(spellId: string): boolean {
  return spellId in GEOMETRY;
}
