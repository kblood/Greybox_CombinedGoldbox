# M39 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section in full for M24–M38 (plus skimmed
> M1–M23 headers), `docs/engine/ROADMAP.md`'s current-state sections, and `docs/engine/research/
> m38-audit.md` in full (its Rejected-alternatives and Open-questions sections in particular). Applied
> lens (a) first, per this round's brief: a full field-by-field sweep of `itemCategory()` and
> `spellCategory()` in `apps/web/src/ui/referenceDb.ts` against their underlying record types
> (`packages/engine/src/loaders/item.ts`'s `ItemRecord`/`DokItemRecord`, `packages/engine/src/ruleset/
> addnd1e-dragonlance/spellList.ts`'s `SpellDef` + `spellEffects.ts`'s `SpellEffect`). That sweep found a
> genuine hit (`ItemRecord.count`, below). While tracing consumers to size up that pick, a **second,
> larger** gap surfaced one file over in `monsterCategory()` (out of this round's primary lens-(a) scope,
> but the same file/function M37+M38 already mined twice) — investigated in full as due diligence and
> written up under Rejected alternatives, since shipping it this round would have meant either blowing
> the row budget or building brand-new e2e scaffolding this round's brief didn't ask for. Every real-bytes
> claim below was independently re-derived this round via **throwaway vitest scripts** run against the
> project's own current decoder/loader code and the real `Champions of Krynn/`, `Death Knights of Krynn/`
> folders (not trusted from any prior audit doc). All scratch files were deleted after use (listed at the
> end); `git status --porcelain` is clean except this doc.
>
> **Headline pick: `ItemRecord.count` (`packages/engine/src/loaders/item.ts:40`) — CoK's real per-catalogue
> stack/bundle size (e.g. "20 Arrow" really stores `count: 20`), decoded and golden-tested since the
> loader's inception — is read by *zero* consumers anywhere in the repo.** Both call sites of
> `decodeItemArchive` (`referenceDb.ts`'s own `loadCategories()` and `explore.ts`'s live `itemDb` builder)
> map the decoded records down to `{name, baseTypeId}` and drop `.count` on the floor before it ever
> reaches `itemCategory()`'s row builder. This is the same shape of gap M37/M38 found in `monsterCategory()`
> (a decoded, golden-tested field never read by its own nearest UI projection function) — just in
> `itemCategory()`, per this round's brief.

## Headline finding

`ItemRecord` (`packages/engine/src/loaders/item.ts:33-43`) is CoK's `ITEM{n}.DAX` catalogue-record type.
Byte offset 57 holds a stack/bundle count — "0 for non-stackables… ammo carries its quantity" (the
loader's own doc comment, line 13). `decodeItemRecord`/`decodeItemArchive` (lines 57-93) populate
`.count` unconditionally for every record, and it is golden-tested against the real
`Champions of Krynn/ITEM1.DAX` (`packages/engine/test/item.test.ts:75-78`: real `20 Arrow`.count === 20,
real `4 Dart`.count === 4, real `Long Sword`.count === 0).

Grepping every call site of `decodeItemArchive`/consumer of `ItemRecord` in the whole repo
(`grep -rn "ItemRecord|decodeItemArchive" packages/engine/src apps/web/src`) turns up exactly **two**
places that ever touch a `decodeItemArchive()` result, and **both** discard `.count`:

1. `apps/web/src/ui/referenceDb.ts:234` (`loadCategories()`, the standalone `?refdb=1` page's own data
   load): `decodeItemArchive(itemBytes).map((it) => ({ name: it.name, baseTypeId: it.baseTypeId }))`.
2. `apps/web/src/ui/explore.ts:1622-1626` (the live in-play `itemDb`, CoK branch):
   `decodeItemArchive(itemBytes).map((it) => ({ name: it.name, baseTypeId: it.baseTypeId, value: 0 }))`.

`itemCategory()` itself (`referenceDb.ts:119-135`) is typed to accept only
`{ name: string; baseTypeId: number }[]` — its own signature has no room for `count` even if a caller
wanted to pass it. The result: a real, decoded, self-consistent, non-degenerate fact about the game's own
item catalogue (which catalogue slots are bundles, and how big) is fully computed and then thrown away
twice before the UI ever sees it — the exact "decoded but never displayed" shape this loop has shipped a
version of in M35 (ADD_NPC), M36 (print effects), M37 (npcClass/npcLevel) and M38 (savingThrows.spell).

### Why this wasn't caught by M37/M38

Both of the last two rounds scoped their sweep to `monsterCategory()` specifically (M37 found
`npcClass`/`npcLevel`, M38 found `savingThrows.spell`), and M38's own "Implications" section explicitly
flagged `itemCategory()`/`spellCategory()` as unswept. This round did that sweep. `spellCategory()` (see
Rejected alternatives) turned out to have **no** equivalent gap — its backing type (`SpellDef`) is a
small, fully-synthetic ruleset table with exactly 4 fields (`id`, `name`, `class`, `level`), all already
read by the row builder. `itemCategory()`'s backing type is different in kind: it's a decoded byte-level
record (`ItemRecord`), not a static ruleset constant, and — unlike `spellCategory()` — its row builder
doesn't even receive the field its own caller's decode step produces; the field is stripped at the two
call sites before `itemCategory()` is ever invoked.

## Real-bytes verification

### Probe 1 — every real CoK `ITEM1.DAX` record's `.count`, reproduced fresh via `decodeItemArchive`

```ts
const items = decodeItemArchive(new Uint8Array(await readFile('Champions of Krynn/ITEM1.DAX')));
items.map(i => ({ name: i.name, baseTypeId: i.baseTypeId, count: i.count }));
```

| name | baseTypeId | count |
|---|---|---|
| 1 Vial | 5 | **1** |
| Staff Sling | 6 | 0 |
| Sling | 7 | 0 |
| **20 Arrow** | 8 | **20** |
| Short Bow | 9 | 0 |
| Long Sword | 10 | 0 |
| Quarter Staff | 11 | 0 |
| Mace | 12 | 0 |
| **4 Dart** | 13 | **4** |
| Shield | 14 | 0 |
| Leather Armor | 15 | 0 |
| … (13 more special/unique entries, all count 0) | 0 | 0 |
| **4 Dart** (2nd copy) | 14 | **4** |
| **20 Arrow** (2nd copy) | 15 | **20** |
| Potion of Healing / Wand of Magic Missiles / Red Scroll / White Scroll / … | 0/9/7/etc | 0 |
| **10 Arrow** | 0 | **10** |
| … remaining potions/scrolls/wands/rings/shield | various | 0 |

39 total records (matches the existing golden test's own count); **6 of 39** carry a real nonzero
`.count` (1 Vial=1, 20 Arrow×2=20, 4 Dart×2=4, 10 Arrow=10) — and in every one of those 6 cases the
catalogue **name itself already spells out the same number** ("20 Arrow" really is `count:20`). This is
an internally self-validating, non-degenerate real-bytes finding (not a M31-style red flag like DoK's
`.value` being suspiciously always a multiple of 256, or `.cursed` being true 96% of the time) —
independently re-derived this round, not copied from any prior doc (no prior audit had looked at this
field at all).

### Probe 2 — confirm zero consumers repo-wide (not just the two files quoted above)

```
$ grep -rn "ItemRecord\b" packages/engine/src apps/web/src
```
Hits: the type's own definition/decoder in `item.ts`, its two re-exports in `index.ts`, one doc-comment
cross-reference in `dqkItem.ts` (about the unrelated `DokItemRecord`/DQK port, not this type), and the
two call sites quoted above. **Zero** other files reference `ItemRecord` or read `.count` — confirmed via
direct grep this round, not inferred.

### Probe 3 — row-budget headroom for the new row (CURRENT `itemCategory()` row-building logic reproduced
by hand against every real base-item shape that could combine with a nonzero count)

`REFERENCE_DB_DETAIL_ROWS = 12` (`packages/engine/src/render/referenceDb.ts:72`, unchanged since M38).
`itemCategory()`'s current row list (`referenceDb.ts:126-131`): `Type`, `Base id`, then conditionally
`Damage`, `Armor AC`, `Shield`, `Ranged`, `Hands` (each only if the joined `BaseItem` has that field).
Checked against every real base-type id that ever attaches to a nonzero-count catalogue entry
(`Vial`=5→misc, `Arrow`=8→ammo, `Dart`=13/14→weapon+damage+ranged):

| Real entry | Today's row count | +1 "Qty" row | Cap |
|---|---|---|---|
| 1 Vial (misc, no optional fields) | 2 (Type, Base id) | **3** | 12 |
| 20 Arrow / 10 Arrow (ammo, no optional fields) | 2 | **3** | 12 |
| 4 Dart (weapon: Type, Base id, Damage, Ranged — no Hands, darts aren't two-handed) | 4 | **5** | 12 |

The theoretical worst case anywhere in the catalogue (a two-handed ranged weapon, e.g. `Staff Sling`/
`Short Bow`: Type, Base id, Damage, Ranged, Hands = 5 rows) still leaves 6 rows of headroom even before
adding Qty (5→6) — no real entry combines a nonzero `.count` with every optional field simultaneously, and
even the theoretical max case is nowhere near the cap. This is a much safer row-budget picture than M38's
`monsterCategory()` pick (which had only 1-2 rows of headroom for NPCs) — confirmed by hand-reproducing the
actual row logic against the real per-item field combinations, not just estimating.

### Probe 4 — DoK path stays honest (negative control, no fabrication risk)

DoK's `ITEM0.DAX` 17-byte record (`DokItemRecord`, `item.ts:124-146`) has **no** decoded stack-count
field at all — only a documented-but-never-extracted "byte 13: bundle count" comment (`item.ts:112`);
`decodeDokItemRecord` (lines 164-182) never reads byte 13 into the returned object. Since the wiring plan
below only threads `.count` through the **CoK** `decodeItemArchive` branch, DoK-sourced item entries will
correctly never carry a `count` field at all (`undefined`, not fabricated `0`), so the new "Qty" row is
naturally omitted for every DoK entry — the same "conditional push, honestly absent for the game/format
that doesn't have the data" convention M27/M38 established for `savingThrows`.

### Probe 5 — `spellCategory()` full field sweep (this round's other lens-(a) target — clean, no gap)

`SpellDef` (`ruleset/addnd1e-dragonlance/spellList.ts:13-20`): `id`, `name`, `class`, `level` — all 4
already read by `spellCategory()` (`referenceDb.ts:140-149`, via `sp.class`/`sp.level`/`sp.name` plus the
`tag`). `SpellEffect` (`spellEffects.ts`): `kind`, `target`, `dice`, `campCastable`, `note` — all 5
already read too (`fx.kind`/`fx.target`/`fx.dice`/`fx.campCastable`/`fx.note`, lines 144-152). **No
unconsumed field found** — re-confirmed this round by reading both files in full and cross-checking every
struct field against the row-builder line by line, not just skimming.

## Wiring plan

1. **`packages/engine/src/loaders/item.ts`** — no changes. `ItemRecord.count` is already decoded,
   already golden-tested (`item.test.ts:75-78`). Zero engine schema change, zero new test file needed
   there.

2. **`apps/web/src/ui/referenceDb.ts`**:
   - Widen `itemCategory()`'s parameter type (line 119) from
     `{ name: string; baseTypeId: number }[]` to
     `{ name: string; baseTypeId: number; count?: number }[]` (optional so DoK-sourced entries, which
     never carry it, still type-check).
   - Insert one conditional row right after the existing `Base id` row (after line 126):
     ```ts
     const rows: RefDbDetailRow[] = [{ label: 'Type', value: kind }, { label: 'Base id', value: `${it.baseTypeId}` }];
     if (it.count) rows.push({ label: 'Qty', value: `${it.count}` });
     ```
     A doc comment above `itemCategory()` should cite this audit + `item.test.ts`'s golden real values,
     and note explicitly that this is CoK-only (DoK's `ITEM0.DAX` byte-13 "bundle count" is a documented
     but never-decoded field in the same 17-byte record the item-instance subsystem blocker already
     flags as suspect — deliberately not touched this round, see Rejected alternatives).
   - `loadCategories()` (line 234): thread `count` through the existing map —
     `decodeItemArchive(itemBytes).map((it) => ({ name: it.name, baseTypeId: it.baseTypeId, count: it.count }))`.

3. **`apps/web/src/ui/explore.ts`**:
   - Widen the `itemDb` field's type (state interface, line 252, and the local `let itemDb` declaration,
     line 1529) from `{ name: string; baseTypeId: number; value: number }[]` to
     `{ name: string; baseTypeId: number; value: number; count?: number }[]`.
   - In the CoK branch of the item-catalogue load (lines 1621-1627), add `count: it.count` to the mapped
     object. The DoK branch (lines 1615-1620, `decodeDokItemArchive`) is **not** touched — it has no
     analogous decoded field, and extending that specific 17-byte record is explicitly out of scope this
     round (see Rejected alternatives / item-instance subsystem).

4. **`apps/web/src/ui/companionPanel.ts`** (optional, type-honesty only): widen
   `CompanionLiveSource.items`'s type (line 69) to add the same optional `count?: number`. Not strictly
   required for correctness — `itemCategory(opts.source.items)` already type-checks today because `count`
   is optional on the new parameter type and `state.itemDb` is passed through as a typed variable (not a
   fresh object literal), so TypeScript's excess-property check doesn't block it either way — but widening
   the interface keeps the type honest about what's really flowing at runtime, matching this project's
   convention of keeping field-carrying interfaces truthful (e.g. M29's `CarriedLoot`, M30's
   `TreasureItem.value`).

5. **Tests** (extend existing, no new test files, per this project's established discipline):
   - No new engine unit test needed — `.count` is already golden-tested end-to-end at the decoder level
     (`item.test.ts:75-78`).
   - `apps/web/test/e2e.mjs`'s existing `runReferenceDb` case (~line 3906-3958): after the existing
     `setCategory(1)` items-category block (line 3937), add a loop over `entryCount()`/`move(1)`/`current()`
     (mirroring the `goblinDetail`/`bakaiDetail` scan pattern from M37/M38) to find the real `20 Arrow`
     entry and assert its detail contains `{label:'Qty', value:'20'}`, plus a negative-control assertion
     that `Long Sword`'s detail contains **no** `Qty` row at all (proving the omission is real, not just
     untested). Fold into the existing `itemOk` boolean rather than adding a new e2e case.
   - Optional, not required: extending `explore-1`'s live companion-panel block
     (`apps/web/test/e2e.mjs:668-716`) with a `refCycleCategory(1)` call + an Items-category scan
     (mirroring the existing Monsters-category `goblinDetail` walk) would prove the **live in-session**
     path too, using the already-exported `__companion.refCycleCategory` seam — small, but not
     load-bearing for shipping since the standalone `?refdb=1` e2e (already covered) exercises the exact
     same `itemCategory()` function against the exact same real `ITEM1.DAX` file.

Rough size: ~4-6 LOC engine-adjacent type widening + 2 LOC row-push logic in `referenceDb.ts`, ~2 LOC in
`explore.ts`'s CoK branch, ~10-15 LOC of e2e loop/assertions extending the existing `runReferenceDb`
case — smaller than M38's slice (no new crosswalk table, no combat-side change, wider row-budget margin).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`monsterCategory()`'s remaining live-mechanic fields** — `regenPerRound` (M23.S2), `halfDamage` (M24.S1), `conSaveBonus` (M28.S1), `itemPluses`/`carriedItems` (M26/M29.S1), `preparedSpellIds` (M31.S1) — **investigated in real depth as due diligence, not this round's primary lens, but the single strongest runner-up** | All six are decoded, golden-tested, and *already mechanically live in real combat* (the exact "field with a live consumer" pattern M38 itself identified as the strongest predictor) — yet **none** appear in `monsterCategory()`'s row builder, confirmed by re-reading the current function in full. Re-derived this round via a fresh join-pipeline probe against real CoK areas 1-3 + DoK area 1 (`decodeMonsterArchive` → `applyRegenAffect`/`applyHalfDamageAffect`/`applyConSavingBonus`/`applyItemPluses`/`applyCarriedItems`): `regenPerRound` is **always exactly 3** for every real carrier (SKELETON/ZOMBIE/SKELETAL KNIGHT/SKELETAL DRAGON/LICH, 6 monsters across 4 areas); `conSaveBonus` is **always exactly 2** (GHOUL/SKELETON/ZOMBIE/GHAST/SKELETAL KNIGHT/SKELETAL DRAGON/DREAD WOLF, 8+ monsters) — both effectively boolean flags dressed as numbers, not the rich per-monster variety `savingThrows.spell` had. `halfDamage` is a genuine, rarer, thematically clean boolean (true only for VAMPIRE/VAMPIRE MAGE/VAMPIRE CLERIC, DoK area 1 — real vampiric damage resistance) and would be the best of the six on its own merits, BUT: (1) it is **DoK-only** real data (0 of 3 CoK areas have any carrier) so the standalone `?refdb=1` page (hardcoded to CoK's `MON1CHA.DAX`) could never show it; (2) `runExploreDok` (`e2e.mjs:1231-1329`) — confirmed by direct reading this round — has **zero** Companion-Panel/`openCompanion()` interaction of any kind today (unlike `explore-1`/`explore-dqk`, which M37/M38 already extended), so proving this field's display reachability live would require building a whole new e2e block from scratch, which M38's own audit explicitly flagged as "a separate, larger follow-on… out of scope" when it hit the same gap for a different reason. `itemPluses`/`carriedItems` are arrays (need base-item-name lookup + list-formatting logic to show cleanly, more like the rejected `abilities` case); `preparedSpellIds` is DoK-only raw unmapped spell numbers (needs a display crosswalk, only 13 of ~126 ids are even named today). **Recommended for a future round**, once/if a DoK Companion-Panel e2e scaffold exists — `halfDamage` specifically is the cleanest next pick in this group (single boolean, zero row-budget risk: DoK vampires have no `Save`/`Level` row to stack against, landing at 9→10 rows worst case). |
| `spellCategory()` full field sweep | **No gap found** — see Probe 5. `SpellDef` (4 fields) and `SpellEffect` (5 fields) are both fully read by the existing row builder already. This round's other lens-(a) target came up clean, which is itself useful information (rules out re-checking this specific function again without a schema change). |
| `referenceDb.ts`'s `Class` label collision (`monsterCategory()`'s category row vs `spellCategory()`'s D&D-class row) — flagged by M37, re-flagged unpicked by M38, listed as this round's fallback lens (b) | Lens (a) turned up a strong, real, verified pick (`ItemRecord.count`) with a live grounded-in-real-bytes story, so per the brief's own stated preference order the cosmetic rename was not needed as this round's headline. Still valid, still small, still unpicked — deliberately left for a future round to avoid bundling two unrelated concerns into one diff (same reasoning M38 gave). |
| Item-instance subsystem, `DokItemRecord.value`/`.magicBonus`/`.charges`/`.cursed` (DoK's suspect 17-byte `ITEM0.DAX` map) | Per this round's explicit instructions, **not re-investigated** — 10 consecutive rounds already confirmed blocked with mounting evidence (M31's `.value`-always-×256, M38's `.cursed`-true-96%-of-records). This round's only new contact with this table was confirming (Probe 4) that its documented-but-undecoded "byte 13 bundle count" field should **not** be added to extend the same suspect struct — consistent with, not contradicting, the standing block. |
| `MonsterRecord.abilities` (6-field row-budget-blocked candidate from M38) | Not re-investigated — M38's own row-budget rejection (6 fields, 1-2 rows headroom) is unchanged; no new condensed-layout idea found this round. |
| DoK `.WIZ` "known spell" 100-byte sub-table, named-artifact item encoding (VOCAB type 68), ECL `DAMAGE`/`PICTURE`/`CLEAR_BOX`/`SPRITE_OFF` opcodes, DoK default `eclInitBlock` reconciliation | Not re-investigated this round — no new angle found, all correctly still bigger/riskier than a single-round slice per M35-M38's own standing notes. |

## Open questions / unknowns

- **Whether DoK's `ITEM0.DAX` byte-13 "bundle count" field is real or another symptom of that table's
  suspected offset-map problem** is **UNKNOWN** — deliberately not investigated this round (would extend,
  not settle, the already-serious-doubt flagged by M31/M38's `.value`/`.cursed` findings). A future
  disassembly-level re-derivation of the whole 17-byte DoK record (already recommended by M38) would
  resolve this as a side effect.
- **Whether a future round should build the missing DoK Companion-Panel e2e scaffold** (`runExploreDok`
  has zero `openCompanion()` coverage today) to unlock `halfDamage` and the other live-but-undisplayed
  `monsterCategory()` fields identified above is **not resolved** — flagged as a real, valuable, but
  correctly-out-of-scope-this-round follow-on, distinct from and larger than this round's `itemCategory()`
  pick.
- **Whether `itemPluses`/`carriedItems` are worth a condensed display layout** (e.g. "Carries: Vial x9")
  is not resolved — a real, valid future candidate once someone designs the name-lookup + list-formatting
  helper (parallel to `NPC_CLASS_LABEL`'s crosswalk-table precedent), not attempted this round since it's
  bigger than a single conditional row.

## Implications for our engine

- **The lens-(a) sweep the brief asked for (itemCategory/spellCategory) genuinely paid off**, but not
  symmetrically: `spellCategory()`'s backing type is a small, fully-synthetic, already-exhaustively-read
  ruleset table (no gap possible), while `itemCategory()`'s backing type is a real decoded byte-level
  record whose consumers actively strip a field before the row builder ever sees it — a **different**
  failure mode from M37/M38's "the row builder itself forgot to read an already-available field" (here,
  the *callers* never even pass the field through). Future field-sweeps of UI projection functions should
  check both failure modes: does the row builder read every field it's given, AND does every caller
  actually give it every field the underlying decoder produces?
- **`monsterCategory()` has now yielded candidates for three consecutive rounds' worth of investigation**
  (M37, M38, and this round's due-diligence pass) — but the *remaining* candidates there are qualitatively
  harder (array-shaped fields needing display logic, or DoK-only data needing new e2e scaffolding) rather
  than the clean single-conditional-row shape M37/M38 enjoyed. This is a useful signal that the "easy"
  layer of this particular chokepoint is now exhausted; future rounds should expect the *next*
  `monsterCategory()` pick to cost more (new e2e block or a formatting helper), not assume it's still a
  quick single-line win.
- **Row-budget arithmetic, reproduced by hand against real per-entry field combinations (not estimated),
  continues to be the deciding factor** between "ship this round" and "defer" — this round's pick had
  6 rows of headroom in the worst real case (vs. M38's 1-2), which is part of why it was preferred over
  the `halfDamage` runner-up (which had good headroom too, but failed on missing test scaffolding instead).
- **A field can be a strong, low-risk pick even without a live combat consumer**, when its unavailability
  isn't about the *mechanic* being missing (like the 4 un-mechanized `SavingThrows` columns) but simply
  about **catalogue metadata never being threaded through a projection pipeline** — this round's `.count`
  is "decoded, self-consistent, useful, but mechanically inert" (nothing in the game *uses* a catalogue
  entry's bundle size at runtime; it's purely descriptive), which is a different, still-valid shape of
  wiring gap from M27/M38's "already-live-elsewhere" thesis. Worth keeping both patterns in mind for
  future sweeps, not just the "already has a mechanic" one.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m39_itemcount.test.ts` (real CoK `ITEM1.DAX` `.count` full dump) — deleted.
- `packages/engine/test/_scratch_m39_monfields.test.ts` (full `monRecords` join-pipeline dump for real CoK
  area 1: `regenPerRound`/`halfDamage`/`conSaveBonus`/`itemPluses`/`carriedItems`/`savingThrows.spell`,
  plus a row-overlap check) — deleted.
- `packages/engine/test/_scratch_m39_monfields2.test.ts` (variety check for `regenPerRound`/`halfDamage`/
  `conSaveBonus` across CoK areas 1-3 + DoK area 1) — deleted.
- Confirmed via `git status --porcelain` (clean except this doc) after deletion.
