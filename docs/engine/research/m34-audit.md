# M34 audit — DoK import's armour-class baseline is a self-contradiction the codebase already half-documents

**Headline finding:** `apps/web/src/ui/importDokParty.ts` imports all 6 real DoK pregens with
`CharacterRequest.baseAc = sc.baseArmorClass` — which is **always `10`** (the unarmoured-human
baseline every `.GAM` record stores; see `dokSavedCharacter.ts`'s own file doc, lines 12-14).
`importDokParty.ts`'s *own* file doc (lines 39-41) claims this is fine — "byte-faithful AND
exactly what `CharacterRequest.baseAc` wants... no fabrication needed" — but that claim is wrong:
it conflates "byte-faithful" with "correct," missing that `dokSavedCharacter.ts`'s adjacent
sentence already says the opposite ("even when `.JNK` shows them wearing plate mail and wielding
magic swords"). The result is a live, provable bug: **every DoK hero imported into DQK today
fights at AC 10-minus-Dex, when the save's own `.JNK` inventory shows them wearing real plate
mail and carrying a shield.** Dryden should be AC 6, not 7; Lillith/Tanar/Celeste should be
AC -1/-2, not 6/7; Flavius should be AC 0, not 8.

The fix reuses two things this project already shipped and never had to touch: `monsterSideTables.ts`'s
`decodeMonsterItem`/`ITEM_FIELD` (the 63-byte VOCAB-coded item-instance decoder built for
`MON{n}ITM.DAX`, M19-ish) and `items/inventory.ts`'s `wornArmorAc` (built for the Items screen).
Nothing new needs decoding — `.JNK` already uses that exact same 63-byte layout, at the offset
DoK's own loader just never tried.

This document also flags a smaller, adjacent finding: `dokSavedCharacter.ts`'s existing doc
comment (line 30) is *correct* that `.JNK` byte **@42** is a "stale heap pointer, not
`baseTypeId`" — I independently re-verified that specific claim (see §2). The bug is that nobody
tried **@0x2e (46)** instead, which is a different, genuinely-usable field using the exact
convention `MonsterItem` already decodes.

---

## Part 1 — Recommended pick: DoK `.JNK` real armour/shield → `CharacterRequest.baseAc`

### (a) The self-contradiction, cited exactly

`packages/engine/src/loaders/dokSavedCharacter.ts` lines 11-14 (file doc, unchanged since M13):

> Two things do NOT carry over from the monster reading, both confirmed against the 6 real pregen
> saves (`SAVE/CHRDATA1..6.GAM`):
> - **AC/damage are the unarmoured-human BASELINE, not the character's effective fighting
>   stats.** Every sampled character decodes to `AC 10, 1d2+0` even when `.JNK` shows them
>   wearing plate mail and wielding magic swords — the compact record stores the PC's base
>   stats and the engine applies equipped gear at runtime.

`apps/web/src/ui/importDokParty.ts` lines 39-41 (file doc, written at M14, never revisited):

> - **baseAc**: `.GAM`'s `baseArmorClass` (10 for every sampled character) IS byte-faithful AND is
>   exactly what `CharacterRequest.baseAc` wants ("worn-armour AC before Dexterity") — no
>   fabrication needed, this one field genuinely carries straight through.

Both statements are about the same byte (`.GAM`'s AC field, `raw[95]`, inverted `60 − byte`) and
both are internally honest about what it *is* (always 10) — but M14's conclusion ("exactly what
`baseAc` wants") contradicts M13's own warning one file over ("NOT the character's effective
fighting stats"). `CharacterRequest.baseAc`'s doc in `character.ts` says "Worn-armour AC before
Dexterity (10 = unarmoured; lower = better)" — i.e. it explicitly wants the *equipped* AC, which
is precisely the number `.GAM` does not carry. This was a reasoning gap at M14, not a new
regression — it has been live, unnoticed, since the DoK importer shipped.

### (b) Re-deriving the real bytes from scratch this round (not trusting the above)

Every one of the 6 real DoK pregens' `.JNK` files (`Death Knights of Krynn/SAVE/CHRDATA{1..6}.JNK`,
252 bytes = 4 × 63-byte records) was re-decoded directly from bytes this round using the **same
0x2e-offset item-instance layout** `monsterSideTables.ts`'s `ITEM_FIELD`/`decodeMonsterItem`
already defines for `MON{n}ITM.DAX` (a format DoK's own loader was never tried against, because
`dokSavedCharacter.ts` was modeled on CoK's *different* plain-ASCII `item.ts` convention, whose
`baseTypeId` sits at offset 42 — the wrong sibling to compare against). Every record decodes
cleanly and consistently:

| Save (pregen) | `.JNK` record | `type`@0x2e | VOCAB name (`hackdocs_extracted/VOCAB.TXT`) | `readied`@0x34 | `weight`@0x37 (u16) |
|---|---|---|---|---|---|
| CHRDATA1 (DRYDEN)   | rec0 | 68 | "Solamnic Plate Mail" (special-named, not a plain VOCAB compound — see §2c) | 1 | 450 |
| CHRDATA1 (DRYDEN)   | rec1 | 37 | Shield | 1 | 100 |
| CHRDATA2 (LILLITH)  | rec0 | 32 | Ring Mail | 1 | 250 |
| CHRDATA2 (LILLITH)  | rec1 | 37 | Shield | 1 | 100 |
| CHRDATA3 (TANAR)    | rec0 | 32 | Ring Mail | 1 | 250 |
| CHRDATA3 (TANAR)    | rec1 | 37 | Shield | 1 | 100 |
| CHRDATA4 (FLAVIUS)  | rec1 | 32 | Ring Mail | 1 | 250 |
| CHRDATA4 (FLAVIUS)  | rec2 | 37 | Shield | 0 (not worn) | 100 |
| CHRDATA5 (NEACAIL)  | rec0 | 32 | Ring Mail | 1 | 250 |
| CHRDATA5 (NEACAIL)  | rec1 | 37 | Shield | 1 | 100 |
| CHRDATA6 (CELESTE)  | rec0 | 32 | Ring Mail | 1 | 250 |
| CHRDATA6 (CELESTE)  | rec1 | 37 | Shield | 0 (not worn) | 100 |

(Dryden's rec0 is a special-cased "Solamnic Plate Mail," decoded separately in §2c; every other
row above is a plain VOCAB-composed record.)

**Cross-validation against `BASE_ITEMS`** (`packages/engine/src/items/baseItems.ts`) — an
independent check I ran precisely because this project's discipline is "verify, don't trust the
prior claim":

| VOCAB type | `BASE_ITEMS` id | `armorAc`/`shieldBonus` | `weightTenths` | Real `.JNK`/`.STF` weight (this round) | Match? |
|---|---|---|---|---|---|
| 32 "Ring" (+47 "Mail") | 80 (Ring Mail) | armorAc 7 | 250 | 250 (5 files) | **exact** |
| 36 "Plate" (+47 "Mail") | 83 (Plate Mail) | armorAc 3 | 450 | 450 (CoK `.STF` CHRDATA1, see §2b) | **exact** |
| 37 "Shield" | 14 (Shield) | shieldBonus 1 | 100 | 100 (10 of 12 files); 60 in one CoK file (unexplained, see Open Questions) | **10/12 exact** |

The weight-field exact matches (250 and 450, to the tenth-of-a-pound) are strong independent
confirmation that offset 0x2e is the correct field and that `BASE_ITEMS`' existing weight data —
flagged in its own doc comment as "canonical-AD&D-ish and CANDIDATE pending a per-record weight
field" — was already correct.

### (c) The already-shipped decoder this reuses verbatim

`packages/engine/src/loaders/monsterSideTables.ts` (unchanged, no edits needed):

```
export const MON_ITEM_SIZE = 63;
export const ITEM_FIELD = {
  type: 0x2e, namenum1: 0x2f, namenum2: 0x30, namenum3: 0x31,
  plus: 0x32, plusSave: 0x33, readied: 0x34, hiddenNamesFlag: 0x35,
  cursed: 0x36, weight: 0x37, count: 0x39, value: 0x3a,
  affect1: 0x3c, affect2: 0x3d, affect3: 0x3e,
} as const;

export function decodeMonsterItem(raw: Uint8Array): MonsterItem { ... } // lines 175-187
```

`DOK_JNK_RECORD_SIZE` in `dokSavedCharacter.ts` is already exactly `63` — identical to
`MON_ITEM_SIZE` — so `decodeMonsterItem` can be called on a `.JNK` record's raw bytes with zero
adaptation.

`packages/engine/src/items/inventory.ts`'s `wornArmorAc(inv)` (lines 142-149, unchanged) is
already exactly "worn-armour AC before Dexterity, improved by an equipped shield" — the precise
semantics `CharacterRequest.baseAc`'s doc comment asks for. `computeArmorClass(inv, dex)` (which
adds Dex) is the wrong function for this — `sheetFromDokSaved` doesn't need it, since
`createCharacter` already adds `dex.defensiveAc` on top of `req.baseAc` itself
(`character.ts` line 207: `sheet.ac = req.baseAc + dex.defensiveAc`).

### (d) Exact wiring plan (files/functions named, in order)

**1. `packages/engine/src/loaders/dokSavedCharacter.ts`** — extend `DokJnkItem`/`decodeDokJnkRecord`
   additively (do not remove `scratch42`; the existing test at
   `packages/engine/test/dokSavedCharacter.test.ts` lines 66-78 asserts `scratch42 === 141` and
   must keep passing unchanged):
   - Add `decodeMonsterItem, type MonsterItem` to the existing import from `./monsterSideTables.js`
     (line 47 already imports `decodeMonsterAffect, MON_AFFECT_SIZE, type MonsterAffect` from the
     same file — just extend that one import list).
   - Add one field to the `DokJnkItem` interface (after `scratch42`, line 94):
     `item: MonsterItem; // the real, usable identity/stat fields (M34.S1) — offset 0x2e, NOT
     scratch42's offset 42; see docs/engine/research/m34-audit.md §2.`
   - In `decodeDokJnkRecord` (currently lines 141-152), add `item: decodeMonsterItem(raw.slice(0, DOK_JNK_RECORD_SIZE))`
     alongside the existing `raw: raw.slice(0, DOK_JNK_RECORD_SIZE)` (reuse one sliced value for both).
   - Append a short correction to the file-level doc comment (do not delete the existing
     `scratch42` paragraph — it's still correct about *that offset*): note that `0x2e` is the
     format's real item-identity anchor and is already decoded via `item`.

**2. New file `packages/engine/src/items/dokGearCrosswalk.ts`** (sibling to `baseItems.ts`/
   `inventory.ts`, mirroring the `dokSpellCrosswalk.ts` pattern of "small crosswalk table + one
   consumer function"):
   ```ts
   import { decodeMonsterItem, type MonsterItem } from '../loaders/monsterSideTables.js';
   import type { DokJnkItem } from '../loaders/dokSavedCharacter.js';
   import type { Inventory, InventoryEntry } from './inventory.js';
   import { BASE_ITEMS } from './baseItems.js';

   /** VOCAB `type`@0x2e -> BASE_ITEMS id, for the armour/shield subset verified against real
    * `.JNK`/`.STF` bytes this round (docs/engine/research/m34-audit.md §2). Deliberately does NOT
    * cover weapons (would reopen the blocked item-instance/magicBonus subsystem — see Rejected
    * alternatives) or Chain/Banded/Leather (not observed in any real save this round). */
   export const DOK_GEAR_CROSSWALK: Readonly<Record<number, number>> = {
     32: 80, // Ring (Mail) -> Ring Mail
     36: 83, // Plate (Mail) -> Plate Mail
     37: 14, // Shield -> Shield
   };

   /** Build a minimal Inventory (armour/shield only) from a decoded `.JNK` file, for feeding
    * `wornArmorAc`. Non-crosswalked items (weapons, ammo, special-named gear) are silently
    * dropped — this function's only consumer needs AC, not a full pack. */
   export function inventoryFromDokJnk(items: DokJnkItem[]): Inventory {
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
   ```

**3. `packages/engine/src/index.ts`** — add one export block near the existing `items/inventory.js`
   block (around line 837):
   ```ts
   export { DOK_GEAR_CROSSWALK, inventoryFromDokJnk } from './items/dokGearCrosswalk.js';
   ```
   (`decodeMonsterItem`, `type MonsterItem`, `wornArmorAc`, `BASE_ITEMS` are already exported —
   confirmed at lines 1010/1032, 829, 812 respectively; no changes needed to those.)

**4. `apps/web/src/ui/importDokParty.ts`** — the only call-site change:
   - Add a `DOK_CHRDATA_JNK_PATHS` literal array (mirrors `DOK_CHRDATA_PATHS`/`DOK_CHRDATA_WIZ_PATHS`,
     lines 99-118) so `scripts/bundle-assets.mjs` ships the `.JNK` files (it already does, via
     `charEditor.ts`'s own `.JNK` literals — this array is for `importDokParty.ts`'s *own*
     directory-wide scan, matching the established per-file-literal convention M32 used for `.WIZ`).
   - Import `decodeDokJnkFile, inventoryFromDokJnk, wornArmorAc` from `@goldbox/engine`.
   - In `importDokParty()`'s per-candidate loop (currently lines 209-236), fetch `.JNK`
     unconditionally (unlike `.WIZ`, gear isn't caster-gated) and derive `baseAc`:
     ```ts
     let baseAc = sc.baseArmorClass; // unchanged fallback: unarmoured baseline
     const jnkBytes = await fetchSave(DOK_CHRDATA_JNK_PATHS[i]);
     if (jnkBytes) {
       const inv = inventoryFromDokJnk(decodeDokJnkFile(jnkBytes));
       if (inv.entries.length) baseAc = wornArmorAc(inv);
     }
     ```
   - Thread `baseAc` into `sheetFromDokSaved(sc, spellIds, baseAc)` (add a 3rd optional parameter,
     default `sc.baseArmorClass` so the function stays usable standalone), replacing line 173's
     `baseAc: sc.baseArmorClass` with `baseAc`.
   - Correct the file-doc's own §"baseAc" paragraph (lines 39-41) — the exact self-contradiction
     identified in §1a — to describe the new derivation instead of the wrong "carries straight
     through" claim.

No engine-side validation bound exists on `baseAc` (`character.ts`'s `createCharacter` has no
range check on it — confirmed by reading the full function this round), so negative post-Dex AC
values are not rejected; combat's own `Combatant.ac` usage (`packages/engine/src/combat/tactical.ts`
line 1117, `effAc = ... target.ac`) does plain signed-integer THAC0 arithmetic with no clamp, and
this engine already supports negative AC (that is standard 1e, not a new edge case).

### (e) Expected before/after `sheet.ac` per real pregen (DEX defensiveAc from
    `packages/engine/src/ruleset/addnd1e/abilities.ts`'s `DEX` table, re-verified this round:
    DEX16→-2, DEX17→-3, DEX18→-4)

| Pregen | DEX | Old `baseAc` (bug) | Old final `sheet.ac` | New `baseAc` (from `.JNK`) | New final `sheet.ac` |
|---|---|---|---|---|---|
| DRYDEN (fighter)   | 17 | 10 | 7  | 9 (Shield only — "Solamnic Plate Mail" isn't in the crosswalk, §2c) | 6 |
| LILLITH (?)        | 18 | 10 | 6  | 2 (Ring Mail armorAc7 − Shield 1) | -2 |
| TANAR (cleric)     | 17 | 10 | 7  | 2 | -1 |
| FLAVIUS (cleric)   | 16 | 10 | 8  | 2 | 0 |
| CELESTE (?)        | 17 | 10 | 7  | 2 | -1 |
| NEACAIL            | 19 | — (rejected from roster regardless, M33 finding) | — | — | — |

These are the exact numbers a builder needs for new test assertions (§(f)).

### (f) Test-impact audit

**`packages/engine/test/dokSavedCharacter.test.ts`** (existing, 141 lines, re-read in full this
round):
- Line 77's `expect(item.scratch42).toBe(141)` — **unaffected**, purely additive change.
- New test to add (synthetic): build a 63-byte record with a real item embedded at 0x2e (e.g.
  `type=37` Shield, `readied=1`) and assert `decodeDokJnkRecord(...).item.baseTypeId === 37` /
  `.readied === true`.
- New test to add (golden, gated by the same `existsSync(dryden)` pattern already used at line
  96/116/125): decode `CHRDATA2.JNK` (Lillith) and assert `item.baseTypeId === 32` (Ring Mail) for
  the first record and `=== 37` (Shield) for the second, matching §1(b)'s table.

**New file `packages/engine/test/dokGearCrosswalk.test.ts`** (or folded into an existing
items-test file): decode all 6 real `CHRDATA{1..6}.JNK`, run `inventoryFromDokJnk` +
`wornArmorAc`, and assert the exact `baseAc` column from §1(e)'s table (9, 2, 2, 2, [Neacail
excluded], 2).

**`apps/web/test/e2e.mjs`'s `runImportDok`** (read lines 2071-2140 in full this round): the
`window.__importDok.party()` seam (`importDokParty.ts` line 264) **already** returns `ac: s.ac`
for every character — no seam change needed. The current test body asserts `faithful`
(`dryden.abilities.str===18`), `drydenIsFighter`, `flaviusIsCleric`, `tanarIsCleric` (M33's own
fix), `hpDerived`, `neacailRejected`, and `memOk` — **none of these currently assert any `ac`
value** (independently confirmed via grep: the only `.ac`-related literal in the whole file is an
unrelated `nightmare.ac === -4` in a different test at line 1255). This is therefore a **pure
additive** test change — the lowest-risk category in this whole M-series so far (M33's own fix
had to *correct* an existing wrong assertion; this one only *adds* new ones). Recommended new
assertions, using §1(e)'s table:
```js
const ac = (name) => party.find((p) => p.name.trim() === name)?.ac;
const acFaithful = ac('SIR DRYDEN') === 6 && ac('LILLITH') === -2 && ac('TANAR') === -1
  && ac('FLAVIUS') === 0 && ac('CELESTE') === -1;
```
(Exact character-name capitalization/whitespace should be re-checked against the live
`party()` output at implementation time — the table above uses the trimmed names as decoded from
`.GAM`.)

**`apps/web/scripts/bundle-assets.mjs`**: no change needed — its literal-path scan is
directory-wide over `src/ui`/`src/audio` (confirmed by reading lines 1-80 this round), and
`.JNK` paths are already swept in via `charEditor.ts`'s existing literals. Adding
`DOK_CHRDATA_JNK_PATHS` in `importDokParty.ts` is redundant with the bundler but matches this
project's own established convention (`DOK_CHRDATA_WIZ_PATHS` is equally "redundant" with the
bundler and was added anyway, M32.S1).

### (g) Verdict

**BUILDABLE NOW.** Every byte has been independently re-derived this round (not trusted from a
prior doc); the decoder is a zero-risk reuse of an already-shipped, already-tested function; the
call-site change is additive and scoped to one file; the test changes are additive-only in both
the engine unit tests and the e2e harness. This is a genuine, provable combat-fidelity bug (AC 6-8
instead of the correct -2 to 6) affecting **100% of DoK→DQK party imports today**, not a
speculative enhancement.

---

## Part 2 — Rejected alternatives (and why)

**CoK's own `.STF`/`.SFX` sidecars as a parallel fix.** CoK's `CHRDATA{n}.SAV` is a *dedicated*
409-byte record that already stores the character's true effective AC byte-faithfully (confirmed
by re-reading `savedCharacter.ts` and `importParty.ts` this round: `ac: sc.armorClass` is read
directly from `.SAV`, not derived) — CoK import has no equivalent bug. `.STF`/`.SFX` were
independently decoded this round (12 real files: 6 `.STF` + 6 `.SFX`) using the *same* 0x2e/9-byte
layouts, and confirmed to have **zero consumers anywhere in the codebase** (grepped; only
`charEditor.ts`... actually not even that — CoK's editor path doesn't reference them either).
They're a good **future** second-consumer candidate (e.g. giving the read-only character editor a
real inventory panel for CoK saves, matching what it already half-does for DoK's `.JNK`/`.EFF`),
but there is no live bug they'd fix today — rejected for this round on "no consumer exists yet,"
the same rejection reason M32 used for its own Part 2 candidate.

**Extending `DOK_GEAR_CROSSWALK` to weapons (Long Sword, Mace, etc.).** Rejected outright: this
would require reading `MonsterItem.plus` (the magic bonus) and feeding it into
`computeThac0(baseThac0, magicBonus)` — the **confirmed-blocked item-instance subsystem** (7+
prior rounds; no live caller passes nonzero `magicBonus` anywhere in the codebase). Deliberately
scoping the crosswalk to armour/shield only (which don't need a "magic bonus feeds into combat
math" join — `wornArmorAc` only needs `armorAc`/`shieldBonus`, which are already static per
`BASE_ITEMS` id) sidesteps that trap entirely. This is the same discipline M31-M33 used to avoid
reopening this blocker.

**Extending the crosswalk to Chain/Banded/Leather Mail (ids 34/35/31).** Rejected for this round:
none of the 12 real `.STF`/`.JNK` files sampled (6 CoK pregens + 6 DoK pregens + 3 "played"
`cloud_saves` files, 21 total records with a type/n2 combination inspected) contain these ids.
Adding unobserved entries would violate this round's explicit "verify against real bytes, don't
guess" discipline. They are cheap, safe, low-risk future additions if/when a save exhibiting them
turns up (structurally identical to the verified Ring/Plate entries) — noted as an Open Question.

**npcClass/npcLevel display wiring.** Re-confirmed still valid and still the safest available
fallback (per the standing note, this is now confirmed accurate/available a 4th+ time), but a
strictly better, more consequential, equally well-verified candidate was found this round — not
picked.

**The general "Inventory screen changes don't reach combat AC" gap.** While auditing `sheet.ac`'s
consumers I confirmed (`apps/web/src/ui/party.ts`'s `sheetToCombatant`, lines 345-361, and
`inventory.ts`'s own live AC display at line 69) that `sheet.ac` is a **static field**, set once at
character creation/import and never recomputed when a player changes gear via the Items screen
post-creation. This is a real, pre-existing, much bigger gap — but it's orthogonal to the import
bug (both a freshly-created character and a freshly-imported one already suffer it identically)
and far riskier to fix in one slice (`setInventory`/`trainMember` call graphs, moveRate/weapon
interactions). Explicitly out of scope for M34; noted for a future, dedicated phase.

---

## Open questions / unknowns

- **"Solamnic Plate Mail" (`type=68`) and other special/unique-named items** (`type=67`/"Fire
  Resistance" on Neacail's Hoopak, both `CHRDATA1.STF`) do not decode via the plain
  VOCAB-composition scheme (`namenum2/3` produce implausible words like "Stone Mail" for type 68
  or "Eyes"/"of" for a Ring of Protection +3 in the `cloud_saves` corpus — see the richer
  played-save sample below). **UNKNOWN**: whether these use a wholly separate lookup (a small
  "unique item" table keyed by `type` alone, bypassing name-composition) or whether there's a
  correct decode I haven't found. This means Dryden's own "Solamnic Plate Mail" — the single most
  narratively important piece of DoK armour — is **not** currently covered by
  `DOK_GEAR_CROSSWALK` and Dryden's `baseAc` fix (10→9) reflects only his Shield, not his
  Plate Mail. Confirmed via three independent real files (`Death Knights of Krynn/SAVE/CHRDATA1.JNK`,
  `cloud_saves/SAVE/CHRDATA1.JNK`, `cloud_saves/SAVE/ARAMNOR.JNK`, `cloud_saves/SAVE/CALDOR.JNK`)
  all showing `type=68` consistently for this one named item — it's a real, stable encoding, just
  not yet cracked.
- **The richer "played" `cloud_saves/SAVE/` corpus** (`CHRDATA1.JNK` 14 items, `ARAMNOR.JNK` 10
  items, `CALDOR.JNK` 4 items — decoded this round, not previously examined this way) shows that
  named/unique magic items ("Girdle of Giant Strength," "Ring Of Prot +3," "Periapt of Proof vs
  Poison," "Boots of Speed") also fail to decode cleanly via 0x2e — but ordinary items **with** a
  magic bonus (e.g. "Shield +4," "Long Sword +4," "Plate Mail" at `plus=4`) decode perfectly
  consistently, confirming the crosswalk's approach (ignore `plus`, key only on `baseTypeId`) is
  robust to magic bonuses on ordinary gear — it's specifically the *named-artifact* category that
  resists this scheme. Good target for a future, separate investigation.
- **`Shield`'s weight discrepancy**: 10 of 12 real records show `weight=100` (matching
  `BASE_ITEMS[14].weightTenths`), but Dryden's own `CHRDATA1.STF` rec1 shows `weight=60`.
  **UNKNOWN** why (possibly a different, unmodeled "small shield" sub-type sharing `type=37`, or
  noise in one specific save file). Does not affect the `baseAc` fix (weight isn't used for AC),
  flagged for completeness only.
- **Newly-observed `.EFF` affect type codes** (45, 18, 105, 95, 92, 94, 7 — decoded this round from
  `Death Knights of Krynn/SAVE/CHRDATA{2,3,4,5,6}.EFF`) don't match any of the three
  already-catalogued affect types this engine currently wires (0x51 half_damage, 0x61
  con_saving_bonus, 0x62 regen_3_hp = 81/97/98 decimal — none of the newly observed decimal codes
  match). **Out of scope for M34** (no live consumer/status-effect system exists to feed a new
  affect type into) — flagged as a good, separate future investigation, mirroring the reasoning
  in Part 2's CoK `.STF`/`.SFX` rejection ("no consumer exists yet").
- Should `DOK_GEAR_CROSSWALK` be broadened to Chain/Banded/Leather Mail preemptively? Recommend
  **not yet** — wait for a real save exhibiting them (see Part 2).
- CoK's own `.STF`/`.SFX` remain a good, low-risk **future** candidate for a character-editor
  inventory panel (mirrors the DoK `.JNK`/`.EFF` display `charEditor.ts` already has) — no urgency,
  no live bug.

## Correction addendum (added at implementation time, M34.S1)

Before wiring, the builder independently re-derived every real `.JNK` byte via the actual project
decode path (`decodeDokJnkFile` → `decodeMonsterItem` → `wornArmorAc`, run through a throwaway
vitest script, not hand arithmetic) rather than trusting this document's own §1(b)/§1(e) tables —
per this project's standing "verify against real bytes, don't trust prior docs literally"
discipline. That re-derivation found two real errors in this document's narrative:

1. **§1(b)'s "type@0x2e" column is wrong for every pregen except Dryden.** LILLITH, TANAR, FLAVIUS,
   and CELESTE all actually carry `type=36` ("Plate Mail") in their armour slot, not `type=32`
   ("Ring Mail") as the table states. (Ring Mail, type 32, was not observed in any of the 6 real
   `.JNK` files sampled.)
2. **FLAVIUS's and CELESTE's shields are readied, not unworn.** §1(b) states both their shield
   records have `readied@0x34 = 0`; the real byte is `1` for both. Every pregen except NEACAIL
   (whose shield genuinely is unreadied) wears their shield.

Despite these two narrative errors, **§1(e)'s final `baseAc`/`sheet.ac` numbers are correct** —
they match the independent re-derivation exactly (Dryden 9/6, Lillith 2/-2, Tanar 2/-1, Flavius
2/0, Celeste 2/-1, Neacail 3/-1-but-moot). The most likely explanation: the final numbers were
computed correctly from the real bytes at some point during the audit, but the accompanying
*narrative* (which armour type, which items are worn) was written from a different, incorrect
pass and never reconciled against the numbers it was supposed to explain — the same class of
drift this document's own final "Implications" bullet warns about for `importDokParty.ts`'s M14
doc comment. The takeaway is unchanged: **the fix is correct and well-verified**, but a doc's own
worked numbers matching real bytes doesn't guarantee its worked *narrative* does — both need
independent re-derivation, not just the bottom-line answer. All shipped code/tests/docs (this
file's own §1(b) is left as historical record; the shipped code comments and test names describe
Plate Mail correctly) reflect the corrected narrative.

## Implications for our engine

- This confirms, a second time (after M13's original finding), that DoK's compact-monster-shared
  record format genuinely separates "baseline stats" from "effective fighting stats," and that
  **any future DoK-sourced import or NPC-instantiation path must independently re-derive equipped
  gear from `.JNK`/`MON{n}ITM.DAX`-shaped data rather than trusting the `.GAM`/monster record's own
  AC/damage fields.** This is a reusable lesson, not a one-off fix — the same trap could recur if a
  future phase reads DoK monster records for anything AC-related without checking their carried
  items.
- The 63-byte VOCAB-coded item-instance format (`ITEM_FIELD`/`decodeMonsterItem`) is now confirmed
  to be shared across **four** real file families: `MON{n}ITM.DAX` (monsters, original use case),
  CoK `CHRDATA{n}.STF`, DoK `CHRDATA{n}.JNK`, and (by extension, not yet independently checked)
  presumably DQK's own equivalent monster-item records. This is strong evidence the format is a
  genuine, stable **engine-family-wide convention** (all three Krynn games share one Gold Box
  "COAB" lineage), reinforcing this project's standing decision to decode once and reuse
  everywhere rather than writing per-game decoders.
- The self-contradiction between `dokSavedCharacter.ts` and `importDokParty.ts`'s own doc comments
  (§1a) is worth a general process note: **a file's own doc comment claiming "verified against
  real bytes" is not a substitute for re-deriving the claim when a *different* file's decoder
  becomes available later** — M14 wrote its `baseAc` paragraph before `.JNK` had ever been
  MonsterItem-decoded (M19+), and nobody revisited the claim once the tool to disprove it existed.
  This is exactly the kind of drift the "verify against real bytes, don't trust prior docs
  literally" project discipline exists to catch.
