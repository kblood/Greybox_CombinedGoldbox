/**
 * CoK item → DQK item.dat port + item-name VOCAB recode (E5.M5.2 / Gap G3).
 *
 * **The gap.** Death Knights of Krynn ports loss-free because its 17-byte item record is the DQK
 * 17-byte `item.dat` record ({@link ./dqkItem.js portDokItemToDqk}), and
 * its VOCAB-coded name indexes the SAME vocabulary the DQK engine uses. Champions of Krynn is the
 * problem child: its `ITEM{n}.DAX` records are the engine's full 63-byte COAB item-instance struct
 * (`coab_extracted/Classes/Item.cs`) — they carry a base-type byte and three "namenum" codes
 * (`namenum1/2/3`) that build the displayed name, BUT those codes index **CoK's own item-name table**
 * (`Champions of Krynn/START.EXE`), which is **reordered relative to DQK's** (`The Dark Queen of
 * Krynn/DQK.EXE`). Carrying CoK's namenum codes verbatim onto the DQK engine would therefore show the
 * WRONG names (e.g. CoK namenum 12 = "Quarrel" but DQK 12 = "Bolt"). So the port must **recode** each
 * CoK namenum into the DQK index that names the same item.
 *
 * **The recode (byte-grounded).** Both games store an ordered item-name vocabulary in their executable
 * (CoK: length-prefixed strings interleaved with stat records, index-1 "Battle Axe" at file offset
 * 51326; DQK: a run of NUL-terminated strings, index-1 "Battle Axe" at 429197; index 0 = "" in both).
 * The two ordered lists below were extracted from those bytes and pinned against real `ITEM1.DAX`
 * namenum values (CoK 18="Long Sword", 8="Mace", 28="Sling", 37="Shield" — all confirmed). The recode
 * is the index map `cok → dqk` computed by **exact string match** (plus a tiny alias table for the two
 * spelling/grammar variants), so it is derived from the data, not hand-assigned. Only the first ~23
 * weapon entries align; everything past that is shifted and a cluster is relocated to DQK's tail, which
 * is exactly why a verbatim copy is wrong and the lookup is required.
 *
 * **CoK-only names.** A handful of CoK vocab words have no DQK string (Long Bow, Short Bow, Staff, Holy
 * Water, Dust, Disappearance, Jewelry, the "of"/"Opening"/"Missiles" composition fragments). For those
 * the recode returns {@link NO_DQK_VOCAB} (0 = the empty-string slot) for that name component and lists
 * the missing word in {@link COK_NAMES_WITHOUT_DQK_VOCAB}; an item that uses only such words decodes to
 * a blanked component (the base type still names it). Appending those words to a custom DQK vocab table
 * is a follow-up (it requires patching DQK.EXE's string table, out of scope here).
 */
import { DQK_ITEM_SIZE } from './dqkItem.js';
import { ITEM_FIELD } from './monsterSideTables.js';

/**
 * CoK item-name vocabulary (`Champions of Krynn/START.EXE`), index 0..120, index 0 = "". Extracted from
 * the interleaved name/stat block at file offsets 51324..53184 (the `0xb0 <len> <name>` entries plus the
 * marker-less "bare" variant slots), and cross-verified: all 36 distinct namenum codes in 68..120 that
 * real `ITEM{1,2,3}.DAX` records actually reference compose into the observed item names (e.g. 78="Ogre
 * Power" → "Gauntlets of Ogre Power", 98="Magic Missiles" → "Wand of Magic Missiles"). Index 87 is
 * "Diamond" (the gem-name path): the four special single-use items that *display* "Vial"/"Spike"/
 * "Chime"/"Flask of Oil" store that noun in their own record name field, not via this table.
 */
export const COK_VOCAB: readonly string[] = [
  '', 'Battle Axe', 'Hand Axe', 'Club', 'Dagger', 'Dart', 'Hammer', 'Javelin', 'Mace', 'Morning Star',
  'Military Pick', 'Awl Pike', 'Quarrel', 'Scimitar', 'Spear', 'Quarter Staff', 'Bastard Sword',
  'Broad Sword', 'Long Sword', 'Short Sword', 'Two-Handed Sword', 'Trident', 'Composite Long Bow',
  'Composite Short Bow', 'Long Bow', 'Short Bow', 'Fine', 'Light Crossbow', 'Sling', 'Staff', 'Arrow',
  'Leather', 'Ring', 'Scale', 'Chain', 'Banded', 'Plate', 'Shield', 'Cler', 'Scroll', 'MU Scroll',
  'Helm', 'Belt', 'Robe', 'Cloak', 'Boots', 'Ring', 'Mail', 'Armor', 'Of Prot', 'Bracers', 'Wand',
  'Amulet', 'Potion', 'Holy Water', 'Ruby', 'Boulder', 'Dragon Breath', 'Displacement', 'Bag', 'Drow',
  'Elven Chain', 'Ice Storm', 'Saphire', 'Emerald', 'Wizardry', "Hornet's Nest", 'Hoopak',
  'Solamnic Plate', 'Dragonlance', 'Flail', 'Halberd', 'Gauntlets', 'Periapt', 'Proof vs Poison', 'Dust',
  'Disappearance', 'Disruption', 'Ogre Power', 'Girdle', 'Giant Strength', 'Mirror', 'Necklace', 'Dragon',
  'vs Reptiles', 'Frost Brand', 'Berserker', 'Diamond', 'Lightning', 'Fireballs', 'of', 'Vulnerability',
  'Speed', 'Silver', 'Extra', 'Healing', 'Opening', 'Fear', 'Magic Missiles', 'Missiles', '1 Spell',
  '2 Spells', '3 Spell', 'Paralyzation', 'Invisibility', "Footman's", 'AC 10', 'AC 6', 'AC 4', 'AC 3',
  'AC 2', '+1', '+2', '+3', '+4', '+5', '-1', '-2', '-3', 'White', 'Red',
];

/**
 * DQK item-name vocabulary (`The Dark Queen of Krynn/DQK.EXE`), index 0..142, index 0 = "". Extracted
 * from the NUL-terminated string run at file offset 429197.
 */
export const DQK_VOCAB: readonly string[] = [
  '', 'Battle Axe', 'Hand Axe', 'Club', 'Dagger', 'Dart', 'Hammer', 'Javelin', 'Mace', 'Morning Star',
  'Military Pick', 'Awl Pike', 'Bolt', 'Scimitar', 'Spear', 'Quarter Staff', 'Bastard Sword',
  'Broad Sword', 'Long Sword', 'Short Sword', 'Two-Handed Sword', 'Trident', 'Composite Long Bow',
  'Composite Short Bow', 'Fine', 'Light Crossbow', 'Sling', 'Arrow', 'Leather', 'Ring', 'Scale', 'Chain',
  'Banded', 'Plate', 'Shield', 'Scroll', 'Helm', 'Belt', 'Robe', 'Cloak', 'Boots', 'Mail', 'Armor',
  'Of Prot', 'Bracers', 'Wand', 'Elixir', 'Potion', 'Youth', 'Ruby', 'Boulder', 'Dragon Breath',
  'Displacement', 'Eyes', 'Drow', 'Elfin Chain', 'Ice Storm', 'Saphire', 'Emerald', 'Wizardry',
  "Hornet's Nest", 'Fire Resistance', 'Stone', 'Good Luck', 'Flail', 'Halberd', 'Gauntlets', 'Periapt',
  'Health', 'Cursed', 'Blessed', 'Bundle of', 'Ogre Power', 'Girdle', 'Giant Strength', 'Mirror',
  'Necklace', 'Dragon', 'vs Giants', 'vorpal', 'cold resistance', 'Diamond', 'Lightning', 'Fireballs',
  'Vulnerability', 'Speed', 'Silver', 'Extra', 'Healing', 'Charming', 'Fear', 'Magic Missiles', '1 Spell',
  '2 Spells', '3 Spells', 'Paralyzation', 'Invisibility', 'Cute Yellow Canary', 'AC 10', 'AC 6', 'AC 4',
  'AC 3', 'AC 2', '+1', '+2', '+3', '+4', '+5', '-1', '-2', '-3', 'Electrical Immunity', 'Gaze Resistance',
  'Spiritual', 'Gem', 'blinking', 'from evil', 'Hoopak', 'Dragonlance', 'Striking', 'Disruption',
  'Dragon Slayer', 'Foethumper', 'Solamnic', 'Petrification', 'Free Action', "Footman's", 'Red Mage',
  'White Mage', 'Quarrel', 'Cler', 'MU Scroll', 'Amulet', 'Bag', 'Solamnic Plate', 'Proof vs Poison',
  'Elixir Of Youth', 'Eyes Of Charming', 'vs Reptiles', 'Frost Brand', 'Berserker', "Olin's", 'Blank',
];

/** A CoK namenum with no DQK vocab equivalent recodes to this (= the empty-string slot 0). */
export const NO_DQK_VOCAB = 0;

/**
 * Spelling / grammar variants where the CoK and DQK strings differ but mean the same word. These are
 * applied after the exact-string match so the recode covers them too (verified against the two lists):
 *  - "Elven Chain" (CoK) = "Elfin Chain" (DQK)  — armour adjective spelling.
 *  - "3 Spell" (CoK)     = "3 Spells" (DQK)      — CoK's singular-typo scroll qualifier.
 */
const NAME_ALIASES: Readonly<Record<string, string>> = {
  'Elven Chain': 'Elfin Chain',
  '3 Spell': '3 Spells',
};

/** Build `cokIndex → dqkIndex` by exact string match (then alias), at module load. */
function buildRecodeMap(): Int16Array {
  const dqkByName = new Map<string, number>();
  // First occurrence wins so a duplicated DQK string (e.g. none here) keeps its lowest index.
  for (let i = 0; i < DQK_VOCAB.length; i++) if (!dqkByName.has(DQK_VOCAB[i])) dqkByName.set(DQK_VOCAB[i], i);
  const map = new Int16Array(COK_VOCAB.length).fill(-1);
  map[0] = 0; // empty → empty
  for (let i = 1; i < COK_VOCAB.length; i++) {
    const name = COK_VOCAB[i];
    const direct = dqkByName.get(name);
    if (direct !== undefined) {
      map[i] = direct;
      continue;
    }
    const alias = NAME_ALIASES[name];
    const aliased = alias !== undefined ? dqkByName.get(alias) : undefined;
    map[i] = aliased ?? -1; // -1 marks "no DQK vocab"; recodeNamenum maps it to NO_DQK_VOCAB
  }
  return map;
}

const RECODE = buildRecodeMap();

/** CoK vocab names with no DQK equivalent (the recode blanks these components). Computed from the map. */
export const COK_NAMES_WITHOUT_DQK_VOCAB: readonly string[] = COK_VOCAB.filter((_, i) => i > 0 && RECODE[i] < 0);

/**
 * Recode one CoK namenum (an index into {@link COK_VOCAB}) into the DQK namenum (an index into
 * {@link DQK_VOCAB}) that names the same word. A code of 0 stays 0 (no name component). A code with no
 * DQK equivalent returns {@link NO_DQK_VOCAB} (the name component is dropped). An out-of-range code
 * (beyond the extracted CoK table) is left unchanged — it is a code this table doesn't cover, not a
 * known mismatch — so the port never throws.
 */
export function recodeCokNamenum(cokNamenum: number): number {
  if (cokNamenum <= 0) return 0;
  if (cokNamenum >= RECODE.length) return cokNamenum; // outside the extracted table — pass through
  const dqk = RECODE[cokNamenum];
  return dqk < 0 ? NO_DQK_VOCAB : dqk;
}

/**
 * Port a CoK 63-byte COAB item record (a decompressed `ITEM{n}.DAX` block slice) onto the DQK engine's
 * 17-byte `item.dat` record, recoding the three namenum codes into DQK's vocabulary so the name reads
 * correctly on the DQK engine. Field correspondence (CoK 63-byte COAB `Item` → DQK 17-byte `item.dat`):
 *
 *   DQK 17-byte                 ← CoK 63-byte (COAB Item.cs offset)
 *   0  base-type id             ← 0x2e type
 *   1  namenum1 (qualifier)     ← recode(0x2f namenum1)
 *   2  namenum2 (adjective)     ← recode(0x30 namenum2)
 *   3  namenum3 (primary noun)  ← recode(0x31 namenum3)
 *   4..5  encumbrance           ← 0x37..38 weight
 *   6..7  value                 ← 0x3a..3b value
 *   8  magic bonus              ← 0x32 plus
 *   9  secondary code           ← 0x33 plus_save
 *   10 readied                  ← 0x34 readied
 *   11 identify/hidden mask     ← 0x35 hidden_names_flag
 *   12 cursed                   ← 0x36 cursed
 *   13 bundle count             ← 0  (CoK has no bundle field; DQK joins are inert at 0)
 *   14 charges                  ← 0  (CoK stores charges in its unmapped magic block; left 0)
 *   15 effect / spell code      ← 0x3c affect_1
 *   16 special code             ← 0x3d affect_2
 *
 * The DQK per-instance record carries only one effect byte + one special byte, whereas CoK's COAB
 * record has three affect slots (0x3c/0x3d/0x3e); affect_1→effect and affect_2→special are the faithful
 * mapping (the DQK item model is a single-effect record), and affect_3 has no DQK home (documented loss,
 * rare in practice). Returns the 17-byte record (decode with {@link ./dqkItem.js decodeDqkItemRecord}).
 *
 * @param raw a slice ≥ 63 bytes at the start of a CoK item record.
 */
export function portCokItemToDqk(raw: Uint8Array): Uint8Array {
  if (raw.length < 63) throw new Error(`cok item: record too small (${raw.length} bytes, need 63)`);
  const out = new Uint8Array(DQK_ITEM_SIZE);
  out[0] = raw[ITEM_FIELD.type] ?? 0;
  out[1] = recodeCokNamenum(raw[ITEM_FIELD.namenum1] ?? 0) & 0xff;
  out[2] = recodeCokNamenum(raw[ITEM_FIELD.namenum2] ?? 0) & 0xff;
  out[3] = recodeCokNamenum(raw[ITEM_FIELD.namenum3] ?? 0) & 0xff;
  out[4] = raw[ITEM_FIELD.weight] ?? 0;
  out[5] = raw[ITEM_FIELD.weight + 1] ?? 0;
  out[6] = raw[ITEM_FIELD.value] ?? 0;
  out[7] = raw[ITEM_FIELD.value + 1] ?? 0;
  out[8] = raw[ITEM_FIELD.plus] ?? 0;
  out[9] = raw[ITEM_FIELD.plusSave] ?? 0;
  out[10] = (raw[ITEM_FIELD.readied] ?? 0) !== 0 ? 1 : 0;
  out[11] = raw[ITEM_FIELD.hiddenNamesFlag] ?? 0;
  out[12] = (raw[ITEM_FIELD.cursed] ?? 0) !== 0 ? 1 : 0;
  out[13] = 0; // bundle count — no CoK field
  out[14] = 0; // charges — CoK keeps these in an unmapped block
  out[15] = raw[ITEM_FIELD.affect1] ?? 0;
  out[16] = raw[ITEM_FIELD.affect2] ?? 0;
  return out;
}

/**
 * Render an item's display name from a base-type/namenum triple using a vocabulary, in the COAB
 * `GenerateName` order (namenum3, then namenum2, then namenum1 — primary noun last in storage, first
 * in display), joined by spaces. Used by the tests to prove a CoK item's name round-trips through the
 * recode (CoK name via {@link COK_VOCAB} === ported name via {@link DQK_VOCAB}). A 0 code contributes
 * nothing; a {@link NO_DQK_VOCAB} code likewise contributes nothing.
 */
export function nameFromCodes(namenum: readonly [number, number, number], vocab: readonly string[]): string {
  // namenum = [namenum1, namenum2, namenum3]; display order is 3,2,1.
  const parts: string[] = [];
  for (const idx of [namenum[2], namenum[1], namenum[0]]) {
    if (idx > 0 && idx < vocab.length && vocab[idx]) parts.push(vocab[idx]);
  }
  return parts.join(' ');
}
