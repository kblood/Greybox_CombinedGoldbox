/**
 * DoK spell class-vote table (M33.S1) — classifies a raw DoK global spell number
 * (`hackdocs_extracted/SPELBOOK.TXT`, spell numbers 1-126, transcribed in full below) as belonging to
 * the **cleric** or **magicUser** track, for the sole purpose of {@link classVoteFromDokIds}: a better
 * signal than an ability-score tie-break for which of those two classes a DoK save's `classCode`
 * (validated caster-vs-not, but NOT resolved to a specific class) actually is.
 *
 * This is a **cleric-vs-magicUser vote**, not a general divine/arcane taxonomy — `apps/web/src/ui/
 * importDokParty.ts`'s `CoreClassId` only ever infers one of exactly those two classes for a caster
 * (`inferDokClass`), so a druid-track spell (`D:` prefix in SPELBOOK.TXT) is neither — it's excluded
 * from the vote (maps to `undefined`) rather than folded into either side. Verified against real
 * bytes (`docs/engine/research/m33-audit.md` Part 1(c)): including druid ids in a combined
 * "divine" bucket would make CELESTE's real vote 9-8 cleric (her one real druid id, 106, plus her 8
 * real cleric ids, vs. her 8 real mage ids) — but her CURRENT, tested import result is `magicUser`
 * (from the ability-score tie-break), which this fix must not silently flip. Excluding druid ids
 * correctly reproduces the audited tie (8 cleric – 8 mage, druid id excluded) that leaves her
 * unchanged, while still flipping TANAR (11 cleric – 0 mage, decisive) from the incorrectly-inferred
 * `magicUser` to the correct `cleric`. The 11 parenthesized catalogue rows (potions/wands/scrolls —
 * ids 57, 59-65, 95, 97, 99) are not spells at all and are likewise excluded.
 */

/** Every DoK spell number 1-126, classified for the cleric-vs-magicUser vote only. `undefined` = not
 * a vote signal (druid-track spell, or a parenthesized potion/wand/scroll catalogue row). */
export const DOK_SPELL_CLASS: Readonly<Record<number, 'cleric' | 'magicUser' | undefined>> = {
  1: 'cleric', // C: Bless
  2: 'cleric', // C: Curse
  3: 'cleric', // C: Cure Light Wounds
  4: 'cleric', // C: Cause Light Wounds
  5: 'cleric', // C: Detect Magic
  6: 'cleric', // C: Protection from Evil
  7: 'cleric', // C: Protection from Good
  8: 'cleric', // C: Resist Cold
  9: 'magicUser', // Burning Hands
  10: 'magicUser', // Charm Person
  11: 'magicUser', // Detect Magic
  12: 'magicUser', // Enlarge
  13: 'magicUser', // Reduce
  14: 'magicUser', // Friends
  15: 'magicUser', // Magic Missile
  16: 'magicUser', // Prot. from Evil
  17: 'magicUser', // Prot. from Good
  18: 'magicUser', // Read Magic
  19: 'magicUser', // Shield
  20: 'magicUser', // Shocking Grasp
  21: 'magicUser', // Sleep
  22: 'cleric', // C: Find Traps
  23: 'cleric', // C: Hold Person
  24: 'cleric', // C: Resist Fire
  25: 'cleric', // C: Silence 15' Radius
  26: 'cleric', // C: Slow Poison
  27: 'cleric', // C: Snake Charm
  28: 'cleric', // C: Spiritual Hammer
  29: 'magicUser', // Detect Invisibility
  30: 'magicUser', // Invisibility
  31: 'magicUser', // Knock
  32: 'magicUser', // Mirror Image
  33: 'magicUser', // Ray of Enfeeblement
  34: 'magicUser', // Stinking Cloud
  35: 'magicUser', // Strength
  36: 'cleric', // C: Heal
  37: 'cleric', // C: Cure Blindness
  38: 'cleric', // C: Cause Blindness
  39: 'cleric', // C: Cure Disease
  40: 'cleric', // C: Cause Disease
  41: 'cleric', // C: Dispel Magic
  42: 'cleric', // C: Prayer
  43: 'cleric', // C: Remove Curse
  44: 'cleric', // C: Bestow Curse
  45: 'magicUser', // Blink
  46: 'magicUser', // Dispel Magic
  47: 'magicUser', // Fireball
  48: 'magicUser', // Haste
  49: 'magicUser', // Hold Person
  50: 'magicUser', // Invisibility 10' Radius
  51: 'magicUser', // Lightning Bolt
  52: 'magicUser', // Prot. from Evil
  53: 'magicUser', // Prot. from Good
  54: 'magicUser', // Prot. from Norm Miss
  55: 'magicUser', // Slow
  56: 'cleric', // C: Harm
  57: undefined, // (Potion of Speed)
  58: 'cleric', // C: Cure Serious Wounds
  59: undefined, // (Potion of Gt Strength)
  60: undefined, // (Javelin of Lightning)
  61: undefined, // (Wand of Paralyzation)
  62: undefined, // (Potion of Healing)
  63: undefined, // (Elixir of Youth)
  64: undefined, // (Necklace of Missiles)
  65: undefined, // (Wand of Magic Miss)
  66: 'cleric', // C: Cause Serious Wounds
  67: 'cleric', // C: Neutralize Poison
  68: 'cleric', // C: Poison
  69: 'cleric', // C: Pro Evil 10' Rad
  70: 'cleric', // C: Sticks to Snakes
  71: 'cleric', // C: Cure Crit Wounds
  72: 'cleric', // C: Cause Crit Wounds
  73: 'cleric', // C: Dispel Evil
  74: 'cleric', // C: Flame Strike
  75: 'cleric', // C: Raise Dead
  76: 'cleric', // C: Slay Living
  77: undefined, // D: Detect Magic
  78: undefined, // D: Entangle
  79: undefined, // D: Faerie Fire
  80: undefined, // D: Invis to Animals
  81: 'magicUser', // Charm Monsters
  82: 'magicUser', // Confusion
  83: 'magicUser', // Dimension Door
  84: 'magicUser', // Fear
  85: 'magicUser', // Fire Shield
  86: 'magicUser', // Fumble
  87: 'magicUser', // Ice Storm
  88: 'magicUser', // Min Globe of Invuln
  89: 'magicUser', // Remove Curse
  90: undefined, // D: Barkskin
  91: 'magicUser', // Cloudkill
  92: 'magicUser', // Cone of Cold
  93: 'magicUser', // Feeblemind
  94: 'magicUser', // Hold Monsters
  95: undefined, // (Scroll Pro from Drag)
  96: undefined, // D: Charm Person or Mam
  97: undefined, // (Potion of Invis)
  98: undefined, // D: Cure Light Wounds
  99: undefined, // (Potion Extra Healing)
  100: 'magicUser', // Bestow Curse
  101: 'cleric', // C: Blade Barrier
  102: 'cleric', // C: Restoration
  103: 'cleric', // C: Energy Drain
  104: 'cleric', // C: Destruction
  105: 'cleric', // C: Resurrection
  106: undefined, // D: Cure Disease
  107: undefined, // D: Neutralize Poison
  108: undefined, // D: Hold Animal
  109: undefined, // D: Pro from Fire
  110: 'magicUser', // Death
  111: 'magicUser', // Disintegrate
  112: 'magicUser', // Globe of Invuln
  113: 'magicUser', // Stone to Flesh
  114: 'magicUser', // Flesh to Stone
  115: 'magicUser', // Delayed Blast Fireball
  116: 'magicUser', // Mass Invisibility
  117: 'magicUser', // Power Word Stun
  118: 'magicUser', // Fire Touch
  119: 'magicUser', // Iron Skin
  120: 'magicUser', // Mass Charm
  121: 'magicUser', // Otto's Irr Dance
  122: 'magicUser', // Mind Blank
  123: 'magicUser', // Power Word Blind
  124: 'magicUser', // Meteor Swarm
  125: 'magicUser', // Power Word Kill
  126: 'magicUser', // Monster Summoning
};

/**
 * Vote a DoK caster's real memorized-spell ids (`CHRDATA{n}.WIZ`, or the monster-side
 * `MON{n}WIZ.DAX`) between `cleric` and `magicUser`, over DISTINCT ids only (a spell memorized as
 * multiple simultaneous copies counts once, matching the tally method verified in
 * `docs/engine/research/m33-audit.md` Part 1(a)/(c)). Returns the class with a **strict** majority;
 * a tie (including 0-0, when every id is unmapped/druid/non-spell, or there are no ids at all)
 * returns `undefined` so the caller falls back to its own tie-break — this function never fabricates
 * a verdict from ambiguous or absent data.
 */
export function classVoteFromDokIds(ids: number[] | undefined): 'cleric' | 'magicUser' | undefined {
  if (!ids?.length) return undefined;
  let cleric = 0;
  let magicUser = 0;
  for (const id of new Set(ids)) {
    const cls = DOK_SPELL_CLASS[id];
    if (cls === 'cleric') cleric++;
    else if (cls === 'magicUser') magicUser++;
  }
  if (cleric === magicUser) return undefined;
  return cleric > magicUser ? 'cleric' : 'magicUser';
}
