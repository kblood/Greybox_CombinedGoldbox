/**
 * Undead classification for turn-undead (CT.5b). The Krynn games store an undead/turn-immune flag in
 * the monster record, but that field is **UNLOCATED** in the binaries (a DGROUP property the flat disasm
 * tools can't read — see `docs/engine/research/disasm-spells-krynn.md` §, which notes undead-immunity is
 * UNLOCATED). So we classify by the monster's **name** — a transparent, honest heuristic over the known
 * Krynn undead roster, not a byte-derived flag. Death Knights (Lord Soth and his ilk) **cannot be turned**
 * (Champions of Krynn manual — see `cok-dragonlance-rules.md`); they classify as undead *and* turn-immune.
 */

/** Name fragments that mark a monster as undead (lower-cased substring match). */
const UNDEAD_KEYWORDS: readonly string[] = [
  'skelet', 'zombie', 'ghoul', 'ghast', 'wight', 'wraith', 'spectre', 'specter',
  'mummy', 'vampire', 'lich', 'ghost', 'shadow', 'banshee', 'revenant', 'spirit',
  'haunt', 'undead', 'death knight', 'dracolich',
];

/** Undead that are **immune** to turning (Death Knights; the dragon-lich is treated likewise). */
const TURN_IMMUNE_KEYWORDS: readonly string[] = ['death knight', 'soth', 'dracolich'];

/**
 * Classify a monster name as undead / turn-immune. Living dragons (e.g. "Shadow Dragon") are explicitly
 * excluded so the `shadow` keyword doesn't mis-tag them — only the dracolich (a true undead dragon) stays.
 */
export function classifyUndead(name: string): { undead: boolean; turnImmune: boolean } {
  const n = name.toLowerCase();
  const turnImmune = TURN_IMMUNE_KEYWORDS.some((k) => n.includes(k));
  let undead = turnImmune || UNDEAD_KEYWORDS.some((k) => n.includes(k));
  if (undead && n.includes('dragon') && !n.includes('dracolich')) undead = false; // living dragon, not undead
  return { undead, turnImmune: turnImmune && undead };
}
