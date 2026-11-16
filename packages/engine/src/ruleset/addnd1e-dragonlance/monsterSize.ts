/**
 * Monster combat-icon **footprint** classification (CT.7f). Gold Box combat icons come in two sizes —
 * **Small** (1×1) and **Large** (2×2) — and that distinction is real in the originals: the `Small`/`Large`
 * strings are byte-located in the icon editor of both gen1 Krynn games (CoK `GAME.OVR` @0x2423a/0x24240,
 * DoK `START.EXE` @0xebaa/0xebb0, beside `Is this icon ok?`; see `disasm-spells-krynn.md` §20).
 *
 * **CT.7k-2 update:** the per-monster size byte is in fact **byte-located** in the CoK monster record at
 * **offset 207** (CCHFORM "1=small…5=huge, +128, >1 = large"; GOBLIN=1, OGRE/GIANT=130, DRAGON=131) — so
 * the real spawn path now reads {@link MonsterRecord.combatSize} from the record. This name heuristic is the
 * **fallback** used only when no record byte is available: the standalone `?combat=1` demo enemies, the DoK
 * compact record (size byte not yet located there), and unresolved monster ids. The 2×2 geometry of a Large
 * icon remains the Gold-Box-standard inference.
 */

/** Name fragments that mark a monster as a **Large** (2×2) combat icon (lower-cased substring match). */
const LARGE_KEYWORDS: readonly string[] = [
  'dragon', 'dracolich', 'wyvern', 'giant', 'ogre', 'troll', 'minotaur', 'hydra',
  'wyrm', 'behir', 'chimera', 'griffon', 'gryphon', 'mammoth', 'elephant', 'roc',
  'golem', 'treant', 'ettin', 'beholder', 'purple worm', 'umber hulk',
];

/**
 * The combat-icon footprint (cells per side) for a monster name: **2** for a Large creature, **1**
 * otherwise. A baby/half-size variant is kept Small ("dragon"-bearing names like "half-dragon" are rare
 * in the Krynn set, so the plain substring match is accepted as the labelled heuristic).
 */
export function monsterFootprint(name: string): number {
  const n = name.toLowerCase();
  return LARGE_KEYWORDS.some((k) => n.includes(k)) ? 2 : 1;
}
