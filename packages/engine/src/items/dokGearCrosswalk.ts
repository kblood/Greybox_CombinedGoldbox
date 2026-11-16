/**
 * DoK `.JNK` gear crosswalk (M34.S1) — the last hop that lets a DoK saved character's real worn
 * armour/shield (`dokSavedCharacter.ts`'s `DokJnkItem.item`, decoded via the shared
 * `monsterSideTables.ts` `MonsterItem` VOCAB-coded item-instance layout) reach
 * `apps/web/src/ui/importDokParty.ts`'s `CharacterRequest.baseAc` via `wornArmorAc`
 * (`items/inventory.ts`) — instead of the always-`10` unarmoured baseline `.GAM` stores (see
 * `dokSavedCharacter.ts`'s file doc).
 *
 * Scoped to the **armour/shield subset independently verified against real bytes** this round
 * (`docs/engine/research/m34-audit.md`, with a correction — see that doc's addendum — to which
 * VOCAB type each real pregen actually wears): every one of the 6 real `CHRDATA{1..6}.JNK` pregens
 * carries a `type`@0x2e of 36 (Plate Mail) and/or 37 (Shield); 32 (Ring Mail) is included too since
 * it's the same VOCAB-composition scheme and costs nothing extra to map. Deliberately does NOT
 * cover weapons (`MonsterItem.plus`, the magic bonus, would need `computeThac0`'s `magicBonus` —
 * the confirmed-blocked item-instance subsystem, 7+ prior rounds) or Chain/Banded/Leather Mail
 * (ids 34/35/31 — unobserved in any real save sampled this round; add them if a save exhibiting
 * one ever turns up, same VOCAB-composition scheme). "Solamnic Plate Mail" (`type`=68, Dryden's own
 * armour) uses a separate, uncracked named-artifact encoding, not plain VOCAB composition — not
 * covered here (flagged as an open question in the audit doc).
 *
 * **Export (2026-07-16, BUILD-QUEUE P2.4 "original save import/export" — DoK half).**
 * {@link exportDokJnkFile} writes a synthetic `.JNK` file from Greybox inventory entries — the
 * write-direction counterpart of {@link inventoryFromDokJnk}, scoped to the EXACT SAME
 * armour/shield subset {@link DOK_GEAR_CROSSWALK} already covers (Ring/Plate Mail, Shield). It writes
 * every field this file's own decoder (`dokSavedCharacter.ts`'s `decodeDokJnkRecord`) treats as real:
 * the name length/ASCII framing (including the VERIFIED `" Yes "`/`" No  "` readied-flag text prefix,
 * `dok-chrdata-save-format.md` §3.1), the stack count@57, and the VOCAB `baseTypeId`@0x2e +
 * `readied`@0x34 fields {@link MonsterItem} exposes. It deliberately does NOT synthesize
 * `nameCodes`@0x2f-0x31 (the exact VOCAB word-composition codes the real engine's own text renderer
 * would need) — this project's own decode chain never reads them (only `baseTypeId` feeds
 * {@link inventoryFromDokJnk}), and inventing a plausible-looking VOCAB code would be exactly the kind
 * of unverified encoding this project's culture avoids. An entry whose `baseTypeId` has no
 * {@link DOK_GEAR_CROSSWALK} reverse entry (weapons, ammo, named artifacts like Solamnic Plate) throws,
 * rather than silently omitting gear a caller might not notice is missing from the exported save.
 */
import { ITEM_FIELD, MON_ITEM_SIZE } from '../loaders/monsterSideTables.js';
import type { DokJnkItem } from '../loaders/dokSavedCharacter.js';
import type { Inventory, InventoryEntry } from './inventory.js';
import { BASE_ITEMS } from './baseItems.js';

/** VOCAB `type`@0x2e -> `BASE_ITEMS` id, for the armour/shield subset verified against real
 * `.JNK` bytes this round. */
export const DOK_GEAR_CROSSWALK: Readonly<Record<number, number>> = {
  32: 80, // Ring (Mail) -> Ring Mail
  36: 83, // Plate (Mail) -> Plate Mail
  37: 14, // Shield -> Shield
};

/** Build a minimal `Inventory` (armour/shield only) from a decoded `.JNK` file, for feeding
 * `wornArmorAc`. A carried item with no crosswalk entry (weapons, ammo, special-named gear like
 * "Solamnic Plate Mail") is silently dropped — this function's only consumer needs AC, not a full
 * pack (same "decode dumb, let the consumer filter" convention this project already uses for spell
 * crosswalks). */
export function inventoryFromDokJnk(items: readonly DokJnkItem[]): Inventory {
  const entries: InventoryEntry[] = [];
  for (const it of items) {
    const baseTypeId = DOK_GEAR_CROSSWALK[it.item.baseTypeId];
    if (baseTypeId === undefined) continue;
    entries.push({
      name: BASE_ITEMS[baseTypeId]?.name ?? it.name.trim(),
      baseTypeId,
      count: 1,
      equipped: it.item.readied,
    });
  }
  return { entries };
}

/** `BASE_ITEMS` id -> VOCAB `type`@0x2e, the write-direction inverse of {@link DOK_GEAR_CROSSWALK}. */
const DOK_GEAR_CROSSWALK_REVERSE: Readonly<Record<number, number>> = Object.fromEntries(
  Object.entries(DOK_GEAR_CROSSWALK).map(([vocabType, baseTypeId]) => [baseTypeId, Number(vocabType)]),
);

/** True when {@link exportDokJnkFile} can encode this `BASE_ITEMS` id (has a real VOCAB `type`@0x2e). */
export function dokJnkSupportsBaseTypeId(baseTypeId: number): boolean {
  return baseTypeId in DOK_GEAR_CROSSWALK_REVERSE;
}

/** Mirrors `dokSavedCharacter.ts`'s private `JNK_NAME_MAX` (stays clear of `count`@57). */
const JNK_NAME_MAX = 56;

/** One Greybox inventory item to encode into a `.JNK` record — the armour/shield subset
 * {@link DOK_GEAR_CROSSWALK} covers. */
export interface ExportDokJnkEntry {
  /** `BASE_ITEMS` id; must satisfy {@link dokJnkSupportsBaseTypeId}. */
  baseTypeId: number;
  /** Worn/readied — drives both the VOCAB `readied`@0x34 bit this project's own decode chain reads
   * (`inventoryFromDokJnk`) AND the real format's `" Yes "`/`" No  "` name-text prefix. */
  readied: boolean;
}

/**
 * Encode one 63-byte `.JNK` record for a single armour/shield entry — see this file's header doc
 * comment ("Export") for exactly which fields are written. Throws if `entry.baseTypeId` has no
 * {@link DOK_GEAR_CROSSWALK} reverse entry.
 */
function encodeDokJnkRecord(entry: ExportDokJnkEntry): Uint8Array {
  const vocabType = DOK_GEAR_CROSSWALK_REVERSE[entry.baseTypeId];
  if (vocabType === undefined) {
    throw new Error(
      `exportDokJnkFile: baseTypeId ${entry.baseTypeId} has no DOK_GEAR_CROSSWALK reverse entry (not one of the verified Ring/Plate Mail/Shield subset)`,
    );
  }
  const out = new Uint8Array(MON_ITEM_SIZE);
  const itemName = BASE_ITEMS[entry.baseTypeId]?.name ?? `Item ${entry.baseTypeId}`;
  const flagWord = (entry.readied ? 'Yes' : 'No').padEnd(4);
  const name = ` ${flagWord} ${itemName}`.slice(0, JNK_NAME_MAX);
  out[0] = name.length;
  for (let i = 0; i < JNK_NAME_MAX; i++) out[1 + i] = i < name.length ? name.charCodeAt(i) & 0x7f : 0;

  out[ITEM_FIELD.type] = vocabType & 0xff;
  out[ITEM_FIELD.readied] = entry.readied ? 1 : 0;
  out[ITEM_FIELD.count] = 1; // stack/quantity count (offset 57/0x39) — a single worn instance, not stackable
  // scratch42 (a stale heap-pointer artifact, not a field — dok-chrdata-save-format.md §3.2) is left 0:
  // this is a synthesized record with no real heap address to leak, so 0 is the honest non-value.
  return out;
}

/**
 * Encode a synthetic `.JNK` file — one 63-byte record per entry, in array order. See this file's
 * header doc comment ("Export") for scope. `decodeDokJnkFile` → `inventoryFromDokJnk` on the result
 * reproduces each entry's `baseTypeId`/`readied` (and therefore `wornArmorAc`).
 */
export function exportDokJnkFile(entries: readonly ExportDokJnkEntry[]): Uint8Array {
  const out = new Uint8Array(entries.length * MON_ITEM_SIZE);
  entries.forEach((entry, i) => out.set(encodeDokJnkRecord(entry), i * MON_ITEM_SIZE));
  return out;
}
