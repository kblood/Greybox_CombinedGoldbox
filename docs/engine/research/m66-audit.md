# M66 audit — the next "computed but unwired" candidate

> Audit method per the brief: read `docs/engine/BUILD-QUEUE.md`'s Done-section entries for
> M62.S1-M65.S1 in full, and `docs/engine/research/m65-audit.md` in full (its "Rejected alternatives
> investigated this round", "Open questions / unknowns", and "Implications" sections in particular),
> internalizing M65's own process lesson: a field can be found "fresh" via one round's bundle/list
> framing yet still have been separately, individually rejected by a *different* round under a
> *different* framing — every candidate below was grepped against **every** `docs/engine/research/
> m*-audit.md` file for its exact field/function name before being accepted or dropped.
>
> **Method 1 (sibling-function doc-comment mining on not-yet-exhausted file families)** was tried on
> the brief's suggested list: `deities.ts`, `races.ts`, `classes.ts` (all read in full) — every field
> (`isDeityAllowed`, `deitiesForRace`, `deityThac0Bonus`, `deityTurnUndeadBonus`, `deityHealDieBonus`,
> `abilityRange`, `exceptionalStrengthCap`, `clampToRace`, `allowsClass`, `classesForRace`, `maxLevel`,
> `isMultiClassAllowed`, `petitionableOrder`) traced to an existing consumer already on-screen. Monster-
> side helpers (`monsterSideTables.ts`, ~470 lines, re-read in full) and `loaders/monster.ts` (re-read
> in full) are both exhaustively wired already (confirmed against M65's own "11/12 rows for a maximal
> GHOUL" headroom note). `loaders/item.ts`'s `DokItemRecord.value`/`.magicBonus` looked promising via
> `explore.ts`'s `itemDb` builder (drops DoK's real `.value` before `referenceDb.ts`'s `itemCategory()`)
> but grepping every prior audit doc found **both `m31-audit.md`** (this field's real decoded values are
> all exact multiples of 256 — an offset-map red flag) **and `m39-audit.md`** (explicitly, individually
> re-confirms it as part of the still-blocked "item-instance subsystem", 10+ consecutive rounds blocked)
> had already killed this exact field under a framing this round's list didn't repeat verbatim. Also
> checked and rejected: `TreasureItem.value` reaching the treasure-claim screen (already fully wired to
> the shop-sell price by `m30-audit.md`, confirmed live in current `town.ts:120,405`); `DexterityMods
> .reaction` (zero consumer anywhere, and no NPC-reaction mechanic exists to attach it to - a "missing
> mechanic" rejection, not a "missing wire" one); `DokEffect`/`.EFF` active-effect type codes (only a
> bare count is shown in `charEditor.ts`; decoding real `.EFF` bytes found type codes that don't match
> any of the 3 already-named affect constants - would need a full COAB `Affects` enum crosswalk, a
> bigger RE task, not a wiring fix).
>
> **Headline pick: `importDokParty.ts`'s own crosswalked `.JNK` worn-gear `Inventory` (M34.S1's `inv`) is
> computed for exactly one purpose — feeding `wornArmorAc()` to derive `baseAc` — and then discarded,
> instead of also being persisted via the already-existing `setInventory()` setter the very same file's
> very same loop already calls for the analogous `Memorization` value (`mem` -> `setMemorization`,
> M58.S1)**. The result: every DoK-imported hero's Character Sheet AC/THAC0 line is real and byte-
> derived (M34/M51/M61), but the *first time any UI reads that character's pack* — the Inventory screen,
> or the Character Sheet's own MV row (M63.S1, which calls `getInventory` for encumbrance) — `party.ts`'s
> `getInventory()` silently fabricates a class-generic **`CLASS_STARTER_KIT`** pack instead, which is
> real, different armour (e.g. Chain Mail, id 81) than the save's real gear (Plate Mail, id 83) already
> used to compute the AC shown one screen earlier.
>
> Confirmed via one throwaway `vitest` script (`packages/engine/test/_scratch_m66_verify.test.ts` — 3
> tests, all green, then deleted). `git status --porcelain` clean except this doc (the pre-existing
> untracked `m39-audit.md` / `_scratch_m39_verify.test.ts` noted at session start are gone from the
> working tree by the time this round ran — already committed/cleaned up upstream, not touched by this
> round).

## Headline finding

### The gap: a DoK-imported hero's real, already-decoded starting gear is computed once for AC math, then thrown away — leaving their Inventory screen (and their Character Sheet's own MV/encumbrance row) to show fabricated, wrong armour instead

`apps/web/src/ui/importDokParty.ts`, `importDokParty()`:

```ts
// current code, lines 273-291
let baseAc = sc.baseArmorClass;
const jnkBytes = await fetchSave(DOK_CHRDATA_JNK_PATHS[i]);
if (jnkBytes) {
  const inv = inventoryFromDokJnk(decodeDokJnkFile(jnkBytes));
  if (inv.entries.length) baseAc = wornArmorAc(inv);
}

const candidate = sheetFromDokSaved(sc, spellIds, baseAc);
...
candidates.push(candidate);
```

`inv` — a real `Inventory` built from the save's own `.JNK` readied armour/shield, crosswalked via
`dokGearCrosswalk.ts`'s `DOK_GEAR_CROSSWALK` (M34.S1) — is a fully-formed, byte-derived `Inventory`
object (with correct `equipped` flags, per M34's own test suite). It is used **exactly once**, to
compute a scalar (`baseAc`), and then falls out of scope. It is never attached to the `candidate`
object the way the sibling `mem: Memorization` value is (`sheetFromDokSaved`'s caller sets
`candidate.mem = memorizationFromDokIds(...)` a few lines below), and it is never passed to
`setInventory()` — the exact store-setter the file's own second loop already calls for `mem`:

```ts
// current code, lines 300-316 (party-add loop)
for (const { sheet, cls, level, hp, mem } of candidates) {
  if (!addToParty(sheet)) { ... continue; }
  result.imported.push(sheet.name);
  result.summary.push({ name: sheet.name, cls, level, hp, ac: sheet.ac, thac0: sheet.thac0, mem: ... });
  if (mem) setMemorization(sheet.name, mem);   // <-- persists the real crosswalked value
  // no equivalent call for `inv` exists anywhere in this file
}
```

Consequence, per `apps/web/src/ui/party.ts`'s `getInventory()` (lines 826-834):

```ts
export function getInventory(sheet: CharacterSheet): Inventory {
  const stored = inventoryStore[sheet.name];
  if (stored) return { entries: stored.map((e) => ({ ...e })) };
  const seeded = starterKit(sheet.classes);          // <-- fabricated, class-generic gear
  inventoryStore[sheet.name] = seeded.entries.map((e) => ({ ...e }));
  persistInventories();
  return seeded;
}
```

Because `importDokParty()` never calls `setInventory()`, `inventoryStore[sheet.name]` is empty for
every freshly-imported DoK hero, so the *first* thing that calls `getInventory(sheet)` for them (the
Inventory screen's `loadMemberInv()`, or the Character Sheet's `moveRateForMember()`/`toView()` MV row,
M63.S1) seeds and persists `CLASS_STARTER_KIT`'s fixed gear list instead — permanently overwriting the
chance to seed the real gear later, since `stored` will now be truthy on every subsequent call.

`CLASS_STARTER_KIT` (`party.ts`, lines 787-794):

```ts
const CLASS_STARTER_KIT: Record<DragonlanceClassId, number[]> = {
  fighter: [10, 14, 81], // long sword, shield, chain mail
  knight: [10, 14, 81],  // long sword, shield, chain mail
  ranger: [10, 14, 15],  // long sword, shield, leather
  thief: [64, 15],       // dagger, leather
  cleric: [12, 14, 15],  // mace, shield, leather
  magicUser: [64, 5],    // dagger, vial
};
```

This is not a harmless "no gear yet" placeholder — it is a **materially wrong substitution**. A real
decoded DoK save's gear (all 6 pregens, this round's own real-bytes dump, see verification section)
never matches its class's starter kit:

| Pregen | classCode | Real `.JNK` gear (`inventoryFromDokJnk`) | Fabricated starter kit it would get instead |
|---|---|---|---|
| SIR DRYDEN | 6 (non-caster) | Shield only (his named "Solamnic Plate Mail" isn't crosswalked, M34) | fighter: Long Sword + Shield + **Chain Mail** |
| LILLITH | 6 (non-caster) | Shield + **Plate Mail** | fighter: Long Sword + Shield + **Chain Mail** |
| TANAR | 2 (cleric, per M33.S1 vote) | Shield + **Plate Mail** | cleric: Mace + Shield + **Leather** |
| FLAVIUS | 1 (cleric) | Shield + **Plate Mail** | cleric: Mace + Shield + **Leather** |
| CELESTE | 0 (magicUser, ability tie-break) | Shield + **Plate Mail** | magicUser: **Dagger + Vial** (no armour at all) |
| NEACAIL | 5 | Plate Mail + unreadied Shield | moot — rejected from the roster regardless (M33.S1, out-of-range DEX) |

Every caster shows the starkest version: CELESTE's real save has her wearing Plate Mail and a Shield
(an AD&D-1e-unusual loadout for a mage, but it's what the byte-faithful `.JNK` decode shows — matching
this project's own convention of trusting the decode over genre expectations, per `dokGearCrosswalk.ts`'s
doc comment), while the fabricated starter kit would hand her a bare Dagger and Vial with zero armour —
a total mismatch with the AC already shown on the same import screen one click earlier.

## Verification evidence — which prior audit docs were checked, and what they did/didn't cover

Grepped every `docs/engine/research/m*-audit.md` for `setInventory`, `DokImportCandidate`,
`candidate\.mem`, `candidate\.inv`, `inventoryFromDokJnk`, `starter kit`/`starterKit`, `real inventory`,
`real gear`, `worn gear`:

- **`m34-audit.md`** (the round that built `inventoryFromDokJnk`/`wornArmorAc`/`DOK_GEAR_CROSSWALK`
  itself) — the only prior hit for `setInventory` anywhere in the corpus, but under a **different**
  framing: its own "Rejected alternatives" section (Part 2, lines ~280-374) flags *"the general
  'Inventory screen changes don't reach combat AC' gap"* — that `sheet.ac` is static and never
  *recomputed* from later Inventory-screen edits (ready/drop/use), calling that "far riskier... setInventory
  /trainMember call graphs, moveRate/weapon interactions... explicitly out of scope, noted for a future,
  dedicated phase." That is a **different bug in the opposite direction**: M34 flagged that changing the
  *pack* doesn't update the *sheet*; this round's finding is that the *pack itself* is never given the
  real, already-decoded starting contents in the first place — a one-hop wiring gap requiring zero AC-
  recompute machinery, not the bigger call-graph problem M34 correctly deferred.
- **`m51-audit.md`** — its headline is `sheet.ac`/`sheet.thac0` reaching the on-screen import table
  (`acOk`/`acShownOk`). Grepped for `inventoryFromDokJnk|wornArmorAc|setInventory` — no mention of
  giving the character their real pack; untouched by this candidate.
- **`m52-audit.md`** — explicitly re-opened `importDokParty.ts`'s `DokImportCandidate.mem` as a
  "dropped-field candidate" and *set it aside* (not headlined) with the reasoning: unlike a fact with
  **zero** player-visible surface, `mem` already reached a real screen (Camp -> Magic -> Memorize showed
  the real used/slots count even before the import-table fix). **This round's `inv` finding fails that
  same test in the other direction** — `inv`'s real value reaches *no* player-visible surface at all
  today (Inventory screen and MV row both show `CLASS_STARTER_KIT`, not `inv`), which is the stronger
  bar M52 used to justify picking its own (different) headline over `mem` at the time.
- **`m58-audit.md`** (the round that shipped `mem` -> import-table "Spells" column) — grepped for
  `setInventory|inventoryFromDokJnk|starter kit|real inventory|real gear` — no hits; confirms M58 only
  ever touched the `mem`/`Memorization` half of this file's parallel `mem`/`inv` pair, never `inv`.
- **`m61-audit.md`** (THAC0 column) — grepped, no hits beyond a docstring quote of the function
  signature; untouched.
- **`m62-audit.md`** — its declined "DoK import table Saves column" idea is unrelated (rejected for lack
  of real-byte grounding, a different topic entirely).
- **`m65-audit.md`** — no mention of this file at all; its own headline (`conSaveBonus`) is a monster-
  bestiary row, unrelated subsystem.
- **`m30-audit.md`** — the round that wired `TreasureItem.value` into the shop-sell price via
  `Inventory`/`InventoryEntry.value` and `giveItemsToMember`. Different mechanism entirely (post-combat
  loot, not import-time starting gear) and confirmed still fully wired today (`town.ts:120,405`) — no
  overlap.

No prior round proposed or rejected "persist the DoK importer's already-computed `inv` via
`setInventory`" under any framing. This is a fresh candidate.

### Real-data verification (this round)

Scratch script `packages/engine/test/_scratch_m66_verify.test.ts` (created, run, all 3 tests green,
then deleted; only engine-level, real-bytes functions used — `decodeDokSavedCharacter`,
`decodeDokJnkFile`, `inventoryFromDokJnk`, `wornArmorAc`, all already-exported engine functions):

```
CHRDATA1: name="SIR DRYDEN" classCode=6 baseAc=9  entries=[Shield(14, equipped=true)]
CHRDATA2: name="LILLITH"    classCode=6 baseAc=2  entries=[Shield(14,true), Plate Mail(83,true)]
CHRDATA3: name="TANAR"      classCode=2 baseAc=2  entries=[Shield(14,true), Plate Mail(83,true)]
CHRDATA4: name="FLAVIUS"    classCode=1 baseAc=2  entries=[Shield(14,true), Plate Mail(83,true)]
CHRDATA5: name="NEACAIL"    classCode=5 baseAc=3  entries=[Plate Mail(83,true), Shield(14,false)]
CHRDATA6: name="CELESTE"    classCode=0 baseAc=2  entries=[Shield(14,true), Plate Mail(83,true)]
```

- Test 2 asserts LILLITH's real crosswalked gear is `[Shield(14), Plate Mail(83)]`, both equipped, and
  explicitly is **not** `[10, 14, 81]` (the fighter starter kit) and does **not** include id `81` (Chain
  Mail) — the concrete real-vs-fabricated mismatch.
- Test 3 is a documentation-only assertion re-confirming the apps/web-side half of the claim (that
  `importDokParty.ts` never calls `setInventory`) is a static-source-reading fact, not something an
  engine-level vitest test can execute (apps/web has no vitest harness of its own; verified only via
  `packages/engine` — confirmed clean, no `apps/web` config exists for `pnpm test`, consistent with
  every prior round's same constraint).

Confirmed via `git status --porcelain` after deleting the scratch file: only this doc is untracked
(working tree was already clean of the session-start `m39-audit.md`/`_scratch_m39_verify.test.ts`
entries by the time this round started — those were resolved upstream between sessions, not by this
round).

## Wiring plan

Small, four-part change, entirely inside `apps/web/src/ui/importDokParty.ts` plus one import line and
one destructure in the same file (mirrors the file's own existing `mem`/`setMemorization` pattern
exactly — no new UI panel, no new route, no new persistence mechanism):

1. **Import `setInventory`** (already exists in `party.ts`, unused by this file today) and the
   `Inventory` type:

   ```ts
   import { clearParty, addToParty, getParty, setMemorization, getMemorization, setInventory } from './party.js';
   ```
   and add `type Inventory` to the existing `@goldbox/engine` import list (already imports several
   other `type X` entries from the same package — `inventoryFromDokJnk`'s own return type).

2. **Add an `inv?: Inventory` field** to `DokImportCandidate` (mirrors the existing `mem?: Memorization`
   field one line above it):

   ```ts
   interface DokImportCandidate {
     sheet: CharacterSheet;
     cls: CoreClassId;
     level: number;
     hp: number;
     mem?: Memorization;
     /** M66.S1 — the real crosswalked `.JNK` worn-gear Inventory (M34.S1's `inv`), already computed to
      * derive `baseAc` above; carried here so the party-add loop can also persist it via
      * `setInventory`, instead of letting it fall out of scope unused. */
     inv?: Inventory;
   }
   ```

3. **Hoist `inv` out of the `if (jnkBytes)` block** and attach it to the candidate, mirroring how `mem`
   is attached after `sheetFromDokSaved` returns:

   ```ts
   let baseAc = sc.baseArmorClass;
   let inv: Inventory | undefined;
   const jnkBytes = await fetchSave(DOK_CHRDATA_JNK_PATHS[i]);
   if (jnkBytes) {
     const decoded = inventoryFromDokJnk(decodeDokJnkFile(jnkBytes));
     if (decoded.entries.length) {
       baseAc = wornArmorAc(decoded);
       inv = decoded;
     }
   }

   const candidate = sheetFromDokSaved(sc, spellIds, baseAc);
   if (!candidate) { result.rejectedInvalid.push(sc.name.trim()); continue; }
   if (inv) candidate.inv = inv;
   if (spellIds && (candidate.cls === 'cleric' || candidate.cls === 'magicUser')) {
     candidate.mem = memorizationFromDokIds(spellIds, candidate.cls);
   }
   candidates.push(candidate);
   ```

4. **Persist it in the party-add loop**, one line beside the existing `setMemorization` call:

   ```ts
   for (const { sheet, cls, level, hp, mem, inv } of candidates) {
     if (!addToParty(sheet)) { result.rejectedPartyFull.push(sheet.name); continue; }
     result.imported.push(sheet.name);
     result.summary.push({ name: sheet.name, cls, level, hp, ac: sheet.ac, thac0: sheet.thac0, mem: ... });
     if (mem) setMemorization(sheet.name, mem);
     if (inv) setInventory(sheet.name, inv);   // <-- new: persists the real gear before any UI can seed a starter kit
   }
   ```

Because `setInventory` writes `inventoryStore[name]` directly (`party.ts:837-840`), calling it during
import — before any UI ever calls `getInventory(sheet)` for that character — means `getInventory`'s
`stored` branch will always be truthy afterward, and the `starterKit()` fallback path never triggers for
that character at all. This is a complete fix, not a partial one, for every character whose real gear
was crosswalked (DRYDEN's Shield, LILLITH/TANAR/FLAVIUS/CELESTE's Plate Mail + Shield); DRYDEN's
uncrosswalked "Solamnic Plate Mail" simply isn't in `inv.entries` at all (same honest-partial shape as
his AC 6, already accepted since M34/M51 — his Inventory screen will show only a Shield, matching his
already-shown AC, not a full outfit that would silently contradict it).

**Optional, small e2e extension** (not required to ship the fix, but cheap): `installImportDokSeam()`'s
existing `party()` getter (`importDokParty.ts`, near the bottom) already exposes `ac`/`thac0`/
`abilities` per roster member without opening any overlay:

```ts
party: () => getParty().map((s) => ({ name: s.name, classes: s.classes, hp: s.hp, ac: s.ac, thac0: s.thac0, abilities: s.abilities })),
```

Extending this one line to also include `inv: getInventory(s).entries.map((e) => e.baseTypeId)` (using
the already-imported `getInventory` from `party.js`) would let `runImportDok()` in `apps/web/test/
e2e.mjs` add one assertion (e.g. `lillith.inv` includes `83` (Plate Mail) and not `81` (Chain Mail)) with
no new overlay-driving code and no new e2e test case file — the same "extend an existing seam" shape
every recent round in this loop has preferred.

## Layout / feasibility check

No new UI surface at all — this is a data-persistence fix, not a display fix. The Inventory screen
(`inventory.ts`) and the Character Sheet's MV row (`charSheet.ts`, M63.S1) already render whatever
`getInventory()` returns; once `inventoryStore[name]` holds the real gear instead of nothing, both
existing render paths pick it up automatically, exactly the way M63's own MV-row fix noted
"companionPanel.ts's char tab picks it up for free" for an unrelated field. No row-count/column-width
concern applies (unlike the bestiary/import-table candidates in M60-M65) since nothing new is being
drawn — only which `Inventory` object a pre-existing screen happens to read is changing.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| `DokItemRecord.value`/`.magicBonus` (DoK's `ITEM0.DAX` catalogue fields, dropped in `explore.ts`'s `itemDb` builder and `referenceDb.ts`'s `itemCategory()`) | Grepped every prior audit doc: `m31-audit.md` found the real decoded `.value` bytes are always exact multiples of 256 (offset-map red flag); `m39-audit.md` explicitly, individually re-confirms this is part of the still-blocked "item-instance subsystem" (10+ consecutive rounds blocked). Not fresh — already dead under a framing this round's list didn't repeat. |
| `TreasureItem.value` not shown on the treasure-claim screen (`render/treasure.ts`'s `TreasureRowView`) | `m30-audit.md` already wired this exact value into the town shop's `sellStack`/`sellOffer` price via `Inventory`/`InventoryEntry.value` and `giveItemsToMember`; re-confirmed still live today in `apps/web/src/ui/town.ts:120,405`. Already shipped, not a gap. |
| `DexterityMods.reaction` (`abilities.ts`) | Computed transiently in `character.ts:164`, never stored, zero consumers anywhere (confirmed by grep). No NPC-reaction/negotiation mechanic exists anywhere in the engine to attach it to — a "missing mechanic" rejection (same class as the four un-mechanized `SavingThrows` columns), not a "missing wire." |
| `DokEffect`/`.EFF` active-effect type codes (only a bare count shown in `charEditor.ts`) | Decoded real bundled `.EFF` files with a throwaway script; the real type codes present (0x12, 0x69, 0x5c, 0x5e, 0x07, 0x3a, 0x74, 0x09, 0x01) don't match any of the 3 already-named/crosswalked affect constants in the codebase. Would need a full COAB `Affects` enum name-crosswalk (a bigger RE/data-entry task), failing this loop's "small wiring plan" bar. |
| `deities.ts`/`races.ts`/`classes.ts` (re-read in full per the brief's suggested file list) | Every exported function traced to an existing, already-shipped consumer (`deityThac0Bonus` in `character.ts`, `deityTurnUndeadBonus`/`deityHealDieBonus` in the already-exhausted `party.ts` `*ForMember` family, `petitionableOrder` already shown on `charSheet.ts`/`create.ts`). No gap found. |
| `moons.ts`'s `MoonPhaseMods` fields | Re-confirmed all three (`saveMod`, `additionalSpells`, `effectiveLevelMod`) already consumed (`party.ts`'s `spellSaveForMember`, `magic.ts:80-98`). No gap. |
| `combat/combatStepper.ts` (`createCombat`/`runCombatViaStepper`) | Confirmed via grep zero web UI consumers anywhere in `apps/web/src` — an internal-only abstract combat resolver; no UI could display its fields even if a gap existed here. Out of scope for this loop's "reaches a UI panel" bar. |
| The general "Inventory screen changes don't reach combat AC" gap (`m34-audit.md`'s own flagged, deferred candidate) | Re-confirmed this is a **different** bug from this round's headline (recompute-on-edit vs. never-seeded-at-all) and remains correctly out of scope — this round's fix requires zero AC-recompute machinery, unlike that one. |

## Open questions / unknowns

- **DRYDEN's real "Solamnic Plate Mail" (item type 68) is still not crosswalked** (`DOK_GEAR_CROSSWALK`
  only maps types 32/36/37 per M34.S1) — so even after this fix, his Inventory screen will show only a
  Shield, not a full outfit. This is an honest partial fix, consistent with his AC 6 (Shield-only) being
  accepted as partial since M34/M51 — not a new gap introduced by this round, but worth flagging that a
  future round could extend `DOK_GEAR_CROSSWALK` to cover named/special armour types if that catalogue
  ever gets built out. **UNKNOWN** whether "Solamnic Plate Mail" maps to an existing `BASE_ITEMS` id or
  needs a new catalogue entry — not investigated this round (out of scope; this round's fix works
  correctly either way, since it only threads through whatever `inv.entries` already contains).
- Whether **CoK's own import (`importParty.ts`, B3)** should eventually get an equivalent feature is
  **UNKNOWN/out of scope** — confirmed via grep that CoK's importer never even attempts a per-character
  item-file decode/crosswalk (`.STF`/`.SFX` sidecars are independently decoded elsewhere per M34's audit
  but have zero consumers anywhere in the codebase today) — that would be new decode/crosswalk work, not
  a one-hop wiring fix, and is explicitly a bigger, separate task, not a same-day follow-on to this
  round's fix.
- Whether the optional e2e seam extension (`inv` on `installImportDokSeam()`'s `party()` getter) is
  worth adding alongside the fix, or left for a later round to add if/when it's needed — **not decided
  by this research round** (a lead-session call, per the brief's "wiring plan should be small" bar; the
  engine-level scratch test already grounds the real-bytes half of the claim without it).

## Implications for our engine

- This is the second time in this loop (after M58's `mem`/`setMemorization`) that a value computed
  transiently in `importDokParty.ts`'s first loop, and used for exactly one narrow purpose, turned out
  to have an existing, already-built persistence setter sitting one function away, unused for that
  value. The pattern — "decode once, use for scalar A, forget you also have object B which has its own
  setter" — is a real, repeatable failure mode specific to importer/bridge files that compute several
  derived values from the same decoded source in a single pass; worth a mental checklist item ("does
  every derived value in this loop have a persistence path, not just the one this round's task needed?")
  for any future importer work (e.g. if a CoK-side equivalent item-crosswalk is ever built).
- Reinforces the project's now well-established "decode dumb, let the consumer filter" idiom
  (`monsterSideTables.ts`'s `apply*` family) extends naturally to import flows too: `inventoryFromDokJnk`
  already does the honest partial-crosswalk (dropping unmapped types silently, matching
  `dokSpellCrosswalk.ts`'s same design choice) — the gap here was never in the decode/crosswalk logic
  itself (which is correct and already tested), only in the last-mile "thread it to a store" step.
- Confirms (again) the value of this round's mandated cross-audit-doc grep discipline: two strong-
  looking candidates (`DokItemRecord.value`, `TreasureItem.value`) were found and correctly discarded
  only because their exact field names were checked against the *entire* audit corpus, not just the
  most recent round or the current round's suggested-topics list — both would have been visible re-
  proposals of already-settled findings had this round skipped that step.
