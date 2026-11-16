# M31 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/research/m30-audit.md` in full, skimmed `docs/engine/BUILD-QUEUE.md`'s
> M20–M30 phase entries and the top of "Done", per the task brief. The brief offered five fresh angles:
> (1) any still-unconsumed `MonsterRecord` field near `conSaveBonus`/`itemPluses`/`carriedItems`; (2) the
> DoK compact monster record's own unlocated fields; (3) the shop's buy side
> (`buyPrice`/`buyForLeader`/`buyPriceFromValue`); (4) party-side item affects / `computeThac0`'s
> `magicBonus`; (5) a fresh scan of `packages/engine/src` for CANDIDATE/TODO/UNLOCATED markers not
> already mined by M23–M30. All five were investigated against the live source, with every "real bytes"
> claim independently re-derived (fresh Python DAX/RLE decoders, not trusted from a prior audit or from
> this project's own golden tests), per this project's "trust but verify" discipline.
>
> **This round's headline finding is new ground, not on the brief's list of five**: a real, decoded,
> COAB-cross-referenced monster memorized-spellbook table (`MON{n}WIZ.DAX`, DoK-only) has **zero
> consumers anywhere** — not even a fetch in `apps/web` — while the tactical combat engine already has a
> **fully-built, tested, generic enemy-spellcasting AI** (`TacticalCombatant.preparedSpells` /
> `chooseOffensiveCast` / `applyCast`) that is hard-coded to `undefined` for every enemy in the one real
> assembly point (`apps/web/src/ui/combat.ts`'s `makeTC()`, line 310). This is the same "real byte,
> already decoded, one hop from an already-built, already-live consumer" shape M23–M30 shipped nine times
> running, except the "already-live consumer" here has never once been fed by ANY enemy in this project's
> history — every enemy in every fight to date has been mechanically mute. **Recommended pick.**
>
> Lead (3) (shop buy-side) was investigated in real depth per the brief's specific steer (does
> `buyPriceFromValue` really need a tier argument?) and confirmed **buildable in principle but starved of
> real data** — a new, independently-verified finding (the one candidate real-value source, DoK's
> `ITEM0.DAX` 17-byte catalogue `.value` field, fails a broad real-bytes probe this round ran for the
> first time: every one of its 91 decoded values is an exact multiple of 256, which is not credible for a
> real steel-piece price column). Leads (1), (2), (4), and (5) are documented as re-confirmed
> rejections/dead ends in Parts 3–5.
>
> Nothing in this document has been implemented — this is read-only research, per the task brief.

## Headline finding

`packages/engine/src/loaders/monsterSideTables.ts` decodes `MON{n}WIZ.DAX` — DoK's monster
spell-memorization side-table — via `decodeMonsterWizArchive`/`decodeMonsterWizRecord` (lines 428–453),
verified against real bytes in both directions (a spot-check test pins monster id 97's exact memorized
list, and the same 220-byte layout is cross-checked against real player `.WIZ` saves). It has an
`export` in `packages/engine/src/index.ts` and a full test suite
(`packages/engine/test/monsterSideTables.test.ts:466-510`) — but **zero call sites in `apps/web` or
`apps/electron`** (confirmed by grep across both app trees; the only other hits are pre-built `dist`
bundle artifacts, not source). `apps/web/src/ui/explore.ts`'s dungeon loader — which already fetches
`MON{n}CHA`/`MON{n}SPC`/`MON{n}ITM` for the exact same area — never fetches `MON{n}WIZ` at all.

Meanwhile `packages/engine/src/combat/tactical.ts` already has a complete, generic, already-tested
enemy-spellcasting mechanism:
- `TacticalCombatant.preparedSpells?: TacticalSpell[]` (tactical.ts:190-197) — "Spells this figure has
  memorized and can cast in combat," explicitly data-driven and side-agnostic.
- `chooseOffensiveCast()` (tactical.ts:1675-1694) — the built-in AI's cast-decision routine (ovr010
  `sub_3560B`-grounded): scans `preparedSpells` in descending priority and picks the first
  in-range/clear-line/worth-casting spell, skipping a save-or-negate spell if every target would save.
- `applyCast()` (tactical.ts:1291 ff.) resolves the cast mechanically (range, area, save, damage/heal/
  status) regardless of which side the caster is on.
- **Proven generic today**: `packages/engine/test/tactical.test.ts:837` builds an `'enemy'`-side
  `TacticalCombatant` with a real `preparedSpells` entry and asserts the AI actually casts it
  ("a caster hangs back — casts at range instead of meleeing an adjacent foe").

But at the one real assembly point, `apps/web/src/ui/combat.ts`'s `makeTC()`:
```ts
// combat.ts:309-312
function makeTC(c: Combatant, pos: GridPos, side: 'party' | 'enemy', i: number, demo: boolean, day: number): TacticalCombatant {
  const prepared = side !== 'party' ? undefined
    : demo ? DEMO_SPELLBOOKS[c.id]
    : combatSpellsForMember(c.id);
```
every enemy — real or demo — gets `preparedSpells: undefined`, unconditionally. The function's own doc
comment (combat.ts:300-302) says the quiet part out loud: *"The REAL encounter path passes plain
`Combatant`s with no spellbook — wiring a character's memorized spells into combat is the follow-up
(CT.4b)."* That follow-up shipped for the **party** side only (`combatSpellsForMember`,
`apps/web/src/ui/party.ts:654-673`); the enemy side was never revisited by any of the eleven M-phases
since.

---

## Part 1 — RECOMMENDED: real DoK monster memorized spells actually cast in combat (`MON{n}WIZ.DAX` → `preparedSpells`)

### (a) Real-bytes probe (this round, independent decoder — fresh RLE/DAX transcription, not the TS loader)

Decoded `Death Knights of Krynn/MON1WIZ.DAX` from scratch (own Python DAX-container + signed-byte-RLE
reader, not `tools/dax_decode.py` or the TS loader) and cross-checked every nonzero byte against
`hackdocs_extracted/SPELBOOK.TXT`'s numbered 1–126 spell table:

| Monster id | Memorized spell ids (raw) | Names |
|---|---|---|
| 14 | 113,111,111,94×5,23×5 | Stone to Flesh, Disintegrate×2, Hold Monsters×5, C:Hold Person×5 |
| 20 | 84×2,34×3,15×4 | Fear×2, Stinking Cloud×3, Magic Missile×4 |
| 21 | 23×2,25,44×2,41,38,68×2 | C:Hold Person×2, C:Silence 15', C:Bestow Curse×2, C:Dispel Magic, C:Cause Blindness, C:Poison×2 |
| 40 | 23×2,28,44×2,42,68×2 | C:Hold Person×2, C:Spiritual Hammer, C:Bestow Curse×2, C:Prayer, C:Poison×2 |
| 49 | 23×3,74×3 | C:Hold Person×3, C:Flame Strike×3 |
| 50 | 47,87,113,110,111,114,72,112,32,34,51,92,108,94×2,98 | Fireball, Ice Storm, Stone to Flesh, Death, Disintegrate, Flesh to Stone, C:Cause Crit, Globe of Invuln, Mirror Image, Stinking Cloud, Lightning Bolt, Cone of Cold, D:Hold Animal, Hold Monsters×2, D:Cure Light |
| 66 | 49×3,81×2,94×2,10,15×2 | Hold Person(mage)×3, Charm Monsters×2, Hold Monsters×2, Charm Person, Magic Missile×2 |
| 67 | 49×3,81×4,94×2,15×2,109 | Hold Person×3, Charm Monsters×4, Hold Monsters×2, Magic Missile×2, D:Pro Fire |
| 68 | (67's list) + 49,93×2,111,113 | + Hold Person, Feeblemind×2, Disintegrate, Stone to Flesh |
| 69 | 110,72×2,92×4,85,88,51×3,47×2 | Death, C:Cause Crit×2, Cone of Cold×4, Fire Shield, Min Globe Invuln, Lightning Bolt×3, Fireball×2 |
| 70/71 (identical) | 40×2,76×2,68,70×3,44×5,38,23×3,24×2,25 | C:Cause Disease×2, C:Slay Living×2, C:Poison, C:Sticks to Snakes×3, C:Bestow Curse×5, C:Cause Blindness, C:Hold Person×3, C:Resist Fire×2, C:Silence 15' |
| 74 | 58 | C:Cure Serious Wounds |
| 97 | 47,32,33,34,10,15,21 | Fireball, Mirror Image, Ray of Enfeeblement, Stinking Cloud, Charm Person, Magic Missile, Sleep |

Monster 97's list **exactly matches** the pinned golden test (`monsterSideTables.test.ts:501-509`),
independently re-derived. 14 monster casters, 40 distinct spell ids used across ~85 memorized-spell
instances, id range 10–114 (well past CoK's own 5th-level player cap of ~53 in this numbering).

### (b) Coverage check against this engine's already-modelled spell geometry — no new content needed

`packages/engine/src/ruleset/addnd1e-dragonlance/combatSpells.ts`'s `GEOMETRY` table (lines 40-65) is the
existing, already-tested set of spells with real tactical-combat mechanics (range/area/save/dice) wired
through `tacticalSpellFor()` (lines 94-130) — the exact function `combatSpellsForMember` already calls
per party member. Cross-referencing the 40 distinct DoK ids above by **name** against `COK_SPELLS`
(`spellList.ts`) + `GEOMETRY`:

| DoK id | Name | In `COK_SPELLS`? | In `GEOMETRY`? |
|---|---|---|---|
| 15 | Magic Missile | yes (`m1-magic-missile`) | **yes** |
| 21 | Sleep | yes (`m1-sleep`) | **yes** |
| 23 | C:Hold Person | yes (`c2-hold-person`) | **yes** |
| 34 | Stinking Cloud | yes (`m2-stinking-cloud`) | **yes** |
| 47 | Fireball | yes (`m3-fireball`) | **yes** |
| 49 | Hold Person (mage) | yes (`m3-hold-person`) | **yes** |
| 51 | Lightning Bolt | yes (`m3-lightning-bolt`) | **yes** |
| 58 | C:Cure Serious Wounds | yes (`c4-cure-serious-wounds`) | **yes** |
| 72 | C:Cause Crit Wounds | yes (`c5-cause-critical-wounds`) | **yes** |
| 74 | C:Flame Strike | yes (`c5-flame-strike`) | **yes** |
| 84 | Fear | yes (`m4-fear`) | **yes** |
| 87 | Ice Storm | yes (`m4-ice-storm`) | **yes** |
| 92 | Cone of Cold | yes (`m5-cone-of-cold`) | **yes** |
| 10, 32, 33, 81, 93, 94, 25, 28, 38, 40, 41, 42, 44, 68, 70, 76, 85, 88 | Charm Person, Mirror Image, Ray of Enfeeblement, Charm Monster(s), Feeblemind, Hold Monster, etc. | mostly yes | no (buff/utility/status not yet modelled) |
| 98, 108, 109 | Druid spells | **no** (CoK/Dragonlance has no player druid track) | no |
| 110–114 | Death, Disintegrate, Globe of Invuln, Stone↔Flesh | **no** (6th-level+, past CoK's 5-level player cap) | no |

**13 of the 40 real ids used already have complete, tested tactical geometry with zero new authoring.**
Critically, `tacticalSpellFor()` already returns `null` for any id without a `GEOMETRY` entry
(combatSpells.ts:101-102, "the spell has no faithfully modelled combat effect") — so a crosswalk that
only covers the 13 (or all 40, harmlessly) never fabricates a mechanic; unmapped spells are silently
dropped from that monster's usable list, the same honest "decode dumb, let the consumer filter"
convention `applyItemPluses`/`applyCarriedItems` already use. Checked **every one of the 14 real
casters retains at least one castable spell** after this filter (id 74 keeps exactly one — Cure Serious
Wounds; id 20/49/69 keep nearly all of theirs — Fear+Stinking Cloud+Magic Missile, Hold Person+Flame
Strike, and Cause Crit+Cone of Cold+Lightning Bolt+Fireball respectively) — the slice is not a no-op for
a single real monster in the corpus.

### (c) Exact wiring plan

1. **`apps/web/src/ui/gameData.ts`** — add `wizPath?: string` to `GameData` (mirrors `spcPath`/`itmPath`,
   lines 40-47), set only for `dok` (line ~100): `wizPath: 'Death Knights of Krynn/MON1WIZ.DAX'`. CoK has
   no such file — omitted, exactly like `spcPath`'s own graceful-absence contract.
2. **`apps/web/src/ui/explore.ts`** — fetch it with the same `.catch(() => new Uint8Array(0))` pattern
   already used for `spcPath`/`itmPath` (lines 1508-1511), decode with `decodeMonsterWizArchive`, and add
   a new join call alongside the existing `applyItemPluses(...)`/`applyCarriedItems(...)` chain
   (lines 1540-1545).
3. **New join function**, `packages/engine/src/loaders/monsterSideTables.ts` (sibling to
   `applyItemPluses`/`applyCarriedItems`, lines 343-375): `applyPreparedSpellIds(records, wiz: Map<number,
   MonsterWizEntry>)` sets `MonsterRecord.preparedSpellIds = entry.spells.map(s => s.spellId)` —
   unfiltered raw DoK spell numbers (1-126), "decode dumb" exactly like `itemPluses`/`carriedItems`.
4. **New crosswalk table**, e.g. `packages/engine/src/ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts`:
   a `Record<number, string>` mapping DoK's `SPELBOOK.TXT` numeric id → the matching `COK_SPELLS` slug,
   built once by name identity (not invented balance data) — scope to at least the 13 ids in the table
   above (or all 40 observed ids harmlessly, since unmapped/ungeometried ids are dropped downstream
   regardless).
5. **`packages/engine/src/combat/combat.ts`** — `monsterCombatant()`'s `mon` parameter type (lines
   294-310) and `Combatant` interface gain `preparedSpellIds?: number[]` (mirrors `itemPluses`/
   `carriedItems` exactly, lines 100-109), passed straight through (line ~330).
6. **`apps/web/src/ui/combat.ts`** — `makeTC()` (line 309-312): for `side !== 'party'`, if
   `c.preparedSpellIds` is present, map each id through the crosswalk (drop unmapped) and call
   `tacticalSpellFor(slug, name, casterLevel, usesCount, 0)` per distinct id (grouping duplicate
   memorized copies into a `usesLeft` count, exactly as `combatSpellsForMember` already does for the
   party at lines 662-663) to build `TacticalSpell[]`; else `undefined` (the pre-existing default,
   preserved for the ~50 non-caster monsters with no WIZ entry).

### (d) One open, labelled design decision (not a blocker)

`tacticalSpellFor`'s `casterLevel` parameter scales `perLevel` dice (e.g. Fireball 1d6/level,
`spellEffects.ts:70`). Monsters have no decoded "caster level" field in either Gen1 record format (CoK
409-byte or DoK 216-byte — see Part 2). A fixed nominal level (this doc suggests defaulting to something
in the 5–10 range, or reusing `hitDice` as a rough proxy) is a reasonable, honestly-labelled **inferred**
choice, not a blocker — it only affects the *magnitude* of `perLevel` spells (Fireball/Cone of Cold),
never whether the mechanism fires at all. Flagged for whoever picks this phase up, not resolved here.

### (e) Why this is buildable now, not a re-run of the item-instance blocker

The recurring item-instance blocker (M19/M24/M26/M27/M29/M30) is specifically about a *player's own
equipped item* needing a `magicBonus`/`charges`/`cursed` schema before it can reach `computeThac0` — a
schema addition with no natural home. This slice needs no such thing: it's monster-side data (like every
M23-M30 pick), the consumer (`preparedSpells`/`chooseOffensiveCast`) already exists and is already
proven generic in the engine's own test suite, and the real-bytes probe above shows the "already-modelled
subset" is non-empty for every real caster in the corpus — so this is scoped, bounded, and shippable in
one phase, sized similarly to M23.S2 (which also had to add brand-new fetch plumbing for a
never-before-fetched side-table file).

### (f) Proof plan sketch

- Unit: `applyPreparedSpellIds` join test (mirrors `monsterSideTables.test.ts`'s existing
  `applyItemPluses`/`applyCarriedItems` tests) against real `MON1WIZ.DAX` id 97 → `[47,32,33,34,10,15,21]`.
- Unit: the crosswalk + `tacticalSpellFor` composition for id 97 → exactly 4 non-null `TacticalSpell`s
  (Fireball/Stinking Cloud/Magic Missile/Sleep), Mirror Image/Ray of Enfeeblement/Charm Person dropped.
- e2e: `testFightMonster(97, seed)` (DoK area 1) → assert a `'cast'` event appears in the combat log with
  `spellId` one of the four mapped ids — proves an enemy casts a REAL memorized spell for the first time
  in this project's history. Negative control: a non-caster id (e.g. a plain DoK monster with no WIZ
  entry) still fights with `preparedSpells: undefined`, unchanged.

---

## Part 2 — Investigated (brief's lead 1): no further unmined `MonsterRecord` field

Re-grepped every field on `MonsterRecord`/`MonsterLayout` (`loaders/monster.ts:74-281`) against its
consumers:

| Field | Consumed? | Note |
|---|---|---|
| `hitPoints`, `armorClass`, `thac0`, `hitDice`, `damage`, `xp` | yes | core combat since M2 |
| `combatSize`, `morale` | yes | CT.7f/CT.6 (pre-M23) |
| `savingThrows.spell` | yes | M27 |
| `savingThrows.{paralyzePoisonDeath,petrifyPolymorph,rodStaffWand,breath}` | **no** | Part 4 (re-confirmed) |
| `regenPerRound`, `halfDamage`, `conSaveBonus` | yes | M23.S2/M24/M28 |
| `itemPluses`, `carriedItems` (incl. `.value`) | yes | M26/M29/M30 |
| `npcClass`, `npcLevel` | **no** | see below — DQK-only, display-only opportunity |
| `abilities.{str,int,wis,dex,cha}` | **no** (only `.con` is read, for `conSaveBonus`) | see below — checked, genuinely not a gap |

**`abilities.{str,dex,int,wis,cha}` beyond `.con`**: checked whether a monster's own Str should modify its
stored melee damage the way a PC's Str does (`ADND1E_ABILITIES.strength`, M25's sibling mechanic).
Cross-checked the COAB decompile: `strengthHitBonus`/`strengthDamBonus` (`coab_extracted/engine/ovr025.cs:
628-708`) both take a `Player` object and gate on `player.field_125`/`player.stats2.Str` — there is no
monster-side equivalent anywhere in COAB. This confirms (not merely assumes) the Gold Box convention that
a monster's stored damage-dice bytes (offsets 269-271 CoK / 89-91 DoK) are **already the final, complete
value** — applying an extra Str-derived bonus on top would double-count a modifier the original engine
never separately applies to monsters. **Rejected — not a gap, a correct absence.** `int`/`wis`/`dex`/`cha`
have no cited consumer in COAB's monster-combat path either (Int is read for **party characters'**
`hasPrimeRequisiteBonus`/spell slots, an entirely different code path) — nothing more to mine here.

**`npcClass`/`npcLevel`** (`moncha.ts:622-623`, DQK-only `MONCHA.GLB` NPC framing): real, decoded (THAC0/
HP/AC/level all independently verified via `decodeNpcRecord`'s own bounds checks), flowing into
`state.moncha.monsters` (`dqkExplore.ts`) → `openCompanion()`'s `source.monsters: MonsterRecord[]`
(`companionPanel.ts:68`) → `monsterCategory()` (`apps/web/src/ui/referenceDb.ts:78-96`) — the exact same
already-live Reference-DB/Companion-Databases "Monsters" detail-sheet builder both CoK/DoK's `?refdb=1`
and DQK's in-session Companion panel share. `monsterCategory`'s `details.push([...])` (lines 83-93) never
reads `npcClass`/`npcLevel` even though both are present on every `m: MonsterRecord` it iterates. **This
is a second, genuinely valid, even-smaller BUILDABLE-NOW candidate** — literally 1-2 more
`RefDbDetailRow`s inside an existing loop, zero new fetch, zero new join, gated on
`m.category === 'npc'`. Its class-code→name mapping is explicitly "best-effort" per `MonsterRecord`'s own
doc comment (`monster.ts:222-224`: "2 = fighter/warrior, 5 = magic-user, 8 = cleric, 6 = thief/special
(best-effort)"), so the honest version shows the raw class code number alongside a best-effort label
rather than asserting false confidence. **Not selected as this round's pick** — it's real and trivially
safe, but it's a cosmetic database-panel line, not a mechanic; Part 1's monster-spellcasting finding is
larger in payoff for comparable/only-somewhat-more risk, and better matches this loop's established
preference for mechanic/economy wins over pure display polish. Flagged here so a future minimal-effort
round can pick it up directly.

---

## Part 3 — Investigated (brief's lead 2): DoK compact monster record — no new lead

`loaders/monster.ts`'s DoK 216-byte layout doc comment (lines 31-57) already documents `hitPoints`/
`hitDice`/`savingThrows`/`xp` and `rearAc` as **not located** (gap B5) — this is "not yet decoded," a
different class of problem from "computed but unwired." Re-checked for any newly-plausible offset
correlation this round (repeating the B2/CT.7k-3 cross-game-shared-monster method used to find
`iconSize`/`morale`): no new candidate byte presented itself; the three shared monsters
(RED DRAGON/GHOUL/SIVAK) are already fully consumed for the fields they did locate. `rearAc`
(`combat.ts:55-60`'s doc comment) is explicitly UNLOCATED in **both** formats — COAB's `ac_behind` @0x19B
falls past even the CoK 409-byte record, in cross-overlay territory this project has already flagged as
needing a disassembler pass, not a data-reading one. **No new finding; re-confirmed as a decode gap, not
a wiring gap** — out of scope for this audit's mandate.

---

## Part 4 — Investigated in depth (brief's lead 3): the shop's buy side

### (a) Does `buyPriceFromValue` really need a shop-tier concept?

Checked the exact signature: `buyPriceFromValue(value: number, tierMask: number): number`
(`town/pricing.ts:32`). The `tierMask` parameter is **not optional**, but `SHOP_TIER.par = 0x00` is
explicitly the "×1, default" case (`pricing.ts:21`) and the `default:` branch of the `switch` returns `v`
unchanged for it — so a caller CAN legitimately call `buyPriceFromValue(value, SHOP_TIER.par)` everywhere,
today, with **no new area/shop-tier concept required**. This confirms the brief's hunch: the missing
piece is not the tier machinery, it's a real `value` to feed it.

### (b) Is there a real, already-decoded per-catalogue value anywhere? — investigated, and REJECTED (new finding)

The one candidate: DoK's `ITEM0.DAX` 17-byte item-catalogue table (`loaders/item.ts:95-201`,
`decodeDokItemArchive`), which already decodes a per-record `.value` (u16 @6) and is already fetched live
by `apps/web/src/ui/explore.ts:1563-1567` into `itemDb` for the read-only Companion Databases "Items" tab
— structurally the same shape as M30's `.value` pick (a real, decoded, per-item field with an existing
display consumer). Investigated whether this same field could ALSO seed `buyPriceFromValue` for the
shop's synthetic `SHOP_STOCK` (`apps/web/src/ui/town.ts:64`, ids `[10,12,14,15,81,64,8]`).

**Independent real-bytes probe (this round, from-scratch Python decoder, not the TS loader or the
existing golden test)** — decoded all 91 real records of `Death Knights of Krynn/ITEM0.DAX`:

| Observation | Result |
|---|---|
| Distinct `.value` byte-pairs observed across 91 records | Only 6: `0, 1024, 1280, 1536, 5120, 9216` |
| `.value % 256` for every one of the 91 records | **exactly 0, always** (low byte is always `0x00`) |
| `.magicBonus` (byte 8) across all 91 records | **always `0`** (never nonzero, despite the field existing) |
| `.cursed` (byte 12 ≠ 0) | true for **80 of 91** records (88%) |

A real steel-piece price column being an exact multiple of 256 for *every single one* of 91 independently
authored records is not credible for genuine per-item economy data — compare M30's own real
`MonsterItem.value` probe (`MON{n}ITM.DAX`, a *different* 63-byte record, COAB-cited `Item.value` @0x3a),
whose real values (900/1000/1800) were **not** round multiples of any power of two. Combined with
`.magicBonus` reading `0` on literally every record (including the block the existing golden test itself
labels "the magic weapons block," `item.test.ts:140-142`) and `.cursed` firing on 88% of all records (an
implausible rate for a real cursed-item flag), this strongly suggests the 17-byte DoK record's field
offsets — while structurally real (the 96×17=1632-byte framing and `baseTypeId`/`ready` bytes are sound
and match named armour templates sensibly) — are **not reliably decoded as an economic `value` column**
for this offset. Unlike `MON{n}ITM.DAX`'s fields, this record's layout doc comment
(`loaders/item.ts:97-121`) cites **no COAB struct** at all — it's explicitly "the classic SSI item record"
by analogy to FRUA's `item.dat`, not verified against a Gen1 decompile the way `MON{n}ITM.DAX`'s fields
are (`monsterSideTables.ts:31-42` cites `coab_extracted/engine/ovr017.cs`/`Classes/Item.cs` directly).

**Rejected as a buy-price source.** Wiring the shop's buy side to this field would silently launder
statistically-implausible data into player-facing prices — worse than the status quo's honestly-labelled
`CANDIDATE` table. The buy side genuinely needs (a) either a resolved, COAB-grounded reading of this
field (a research task, not a join) or (b) hand-authored intrinsic values on `BASE_ITEMS` (an authoring
task with no real bytes behind it, which this project's own template avoids). **Confirms M30's conclusion
by a stronger, freshly-verified route**: not merely "no data exists" but "the one candidate data source
looks structurally wrong on a broad probe," which is new information this round adds. Buy-side pricing
remains a real, scoped, but NOT byte-backed future follow-on — unchanged in priority from M30.

---

## Part 5 — Investigated (brief's lead 4): party-side item affects / `computeThac0`

Re-checked `items/inventory.ts`'s `computeThac0(baseThac0: number, magicBonus = 0)` (line 164) for any
live caller passing a nonzero second argument. **One call site exists in the entire codebase**
(`apps/web/src/ui/inventory.ts:70`): `computeThac0(sheet.thac0)` — no second argument, every time.
Re-confirmed unchanged from M19/M24/M26/M27/M29/M30: no live path anywhere constructs a real per-instance
`magicBonus`/`charges`/`cursed` item. Also checked `monsterSideTables.ts`'s sibling per-item
`ITEM_FIELD.affects[1..3]` (@0x3c-0x3e, an item's OWN nested affect codes) for a "worn item grants an
affect" dispatch — none exists (same finding as M30 Part 3(c), re-confirmed, not re-litigated in depth).
**No new angle found; this is the same standing item-instance-subsystem blocker**, now a **7th**
consecutive independent audit confirming it (M19, M24, M26, M27, M29, M30, this round).

---

## Part 6 — Fresh scan (brief's lead 5): CANDIDATE/TODO/UNLOCATED markers

Grepped `packages/engine/src` for `CANDIDATE|TODO|UNLOCATED|not yet|unconsumed` and cross-checked every
hit against the M23-M30 audit docs' own citations. Every marker found (`shop.ts`'s CANDIDATE price table,
`combat.ts`'s SavingThrows doc comment, `moncha.ts`'s rear-AC/HP-B5 notes, `spellEffects.ts`'s
0-dice-placeholder spells, `combatSpells.ts`'s "special-effect spells still resolve to null") was already
identified and assessed by a prior round or by Parts 2-5 above. The one marker NOT previously
cross-referenced by any audit — `monsterSideTables.ts:49-86`'s `MON{n}WIZ.DAX` doc comment (added when the
decoder shipped, per `decompile-mon1wiz.md`, but never picked up by an M-phase audit since) — is exactly
Part 1's finding. No further unmined markers found.

---

## Open questions / unknowns

- **Monster "caster level" for `perLevel` spell scaling** (Part 1(d)) is genuinely undecided — no Gen1
  record format stores one. A nominal default (fixed, or `hitDice`-derived) is needed before shipping;
  flagged, not resolved, since it doesn't block the mechanism firing at all, only the magnitude of two of
  the 13 already-geometried spells (Fireball, Cone of Cold).
- **The DoK 17-byte `ITEM0.DAX` record's `.value`/`.magicBonus`/`.cursed` fields' true semantics are now
  actively in doubt**, not merely "CANDIDATE" — this round's broad probe (all-multiples-of-256 `.value`,
  always-zero `.magicBonus`, 88%-`.cursed`) is new evidence the offsets after `baseTypeId`/`ready` may be
  mis-mapped for this specific record. Worth a dedicated re-reversing pass before this table is trusted
  for ANYTHING price-related (its current sole consumer, the read-only Companion Items tab, only ever
  displays the number — cosmetic exposure, not a wiring risk, but still worth flagging honestly).
- **`npcClass`/`npcLevel` display wiring** (Part 2) remains a valid, tiny, unpicked candidate for a future
  minimal-effort round — real bytes, live consumer, zero new fetch, ~2 lines.
- **The general item-instance subsystem** (`magicBonus`/`charges`/`cursed` reaching `computeThac0`)
  remains the standing structural blocker, now independently re-confirmed a 7th time (M19, M24, M26, M27,
  M29, M30, this round) — still the strongest candidate for its own dedicated multi-slice phase.
- **The shop's buy side** remains unwired, and this round adds a harder blocker than M30 knew about: the
  one real per-item data source found so far doesn't hold up to scrutiny. A future attempt should either
  find a different real data source or explicitly accept "hand-authored, not byte-backed" and say so.
- **DoK player character import's own spellbook fidelity** (`dokSavedCharacter.ts`'s doc comment: "Out of
  scope here (documented gap, not attempted): `.WIZ`") is a related but DISTINCT gap from this round's
  pick — imported DoK party members' memorized spells are not reconstructed from their real `.WIZ` saves
  at all today. Noted for awareness; not this round's finding (that's about monsters, which need no
  import/character-reconstruction machinery at all — a much more self-contained slice).

## Implications for our engine

- **A fully-generic, already-tested consumer can sit unfed by an entire side of the game for the engine's
  whole history.** `chooseOffensiveCast`/`preparedSpells` have been correct and exercised (via the engine
  test suite and the party-side `combatSpellsForMember`) since well before this M-phase series began, yet
  no enemy in any CoK/DoK fight to date has ever been given a spellbook — the gap was hiding in plain
  sight inside `makeTC()`'s own doc comment ("wiring... is the follow-up"), never picked up because prior
  audits' keyword sweeps (CANDIDATE/TODO/UNLOCATED) don't surface "a doc comment describing a follow-up
  that only half-shipped." Worth a standing lesson: when a doc comment names a "the follow-up" and only
  ONE of two sides (party/enemy, buy/sell, etc.) was ever completed, check the other side explicitly.
- **Not every real, decoded, unconsumed byte survives a broad probe.** This round's `ITEM0.DAX` `.value`
  investigation is the first time in this series a candidate's OWN data failed a real-bytes sanity check
  (not just "no consumer exists," but "the numbers themselves don't look real") — a stronger, more useful
  rejection than "unconfirmed," and a reminder that the "trust but verify" discipline sometimes means
  distrusting a field this project itself decoded and shipped a passing golden test for, not just a prior
  audit's arithmetic.
- **Monster-side data keeps being the productive vein.** Six of seven investigated leads this round that
  found something new were monster-side (`MON{n}WIZ.DAX`, `npcClass`/`npcLevel`, the Str-bonus
  non-finding); the party/character/economy side (leads 3-4) both terminated in re-confirmations or a
  deeper-but-still-negative result. Future audits should keep prioritizing monster/bestiary-adjacent side
  tables first.
