# Pools of Darkness / Treasures of the Savage Frontier `CHRDATA{n}.SAV` — per-field oracle table (R3)

Round 30 (`pools-treasures-chrdata-layout.md`) located the load-bearing pair — class byte`@0xae` /
`ClassLevel[8]`@0x151 — and left a dozen further fields "plausible, unverified". This round (R3)
builds `packages/engine/src/loaders/poolsTreasuresSavedCharacter.ts` /
`apps/web/src/ui/importPoolsTreasuresParty.ts` on top of the SAME layout-parameterised decoder
`secretSavedCharacter.ts` established for Secret of the Silver Blades, and — for every field the
importer surfaces — either reproduces an independent oracle against the retail bytes or ships the
field RAW and unnamed. This doc is the field-by-field ledger that claim rests on, run over **all 14
real records** (6 Pools + 8 Treasures) through the ONE shared
`POOLS_TREASURES_SAVED_CHARACTER_LAYOUT` constant (proven, not assumed, to fit both titles —
`poolsTreasuresSavedCharacter.test.ts`'s golden test loops both titles' files through it).

Data: `C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness\SAVE\CHRDATA{1..6}.SAV` and
`...\Treasures of the Savage Frontier\SAVE\CHRDATA{1..8}.SAV` (510 bytes each, install `SAVE\`
subfolder — unlike Secret, both titles' saves live there). Read-only, never vendored.

The fourteen real pregens, in file order:

- **Pools**: BINKY (mc_f_t, fighter 8 / thief 13), Guy de Valois (paladin 12), CLARISSA (ranger 13),
  DOMINIC (cleric 14), **ABAGAIL** (magic_user 12 — MISS, see §2), PAINE (magic_user 13).
- **Treasures**: MAXWELL (paladin 4), TRISTLE (ranger 5), MELLIA (cleric 5), CHERROD (mc_f_mu_t,
  fighter 3 / magic_user 3 / thief 4), SPARKLE (magic_user 5), FRAZZLE (magic_user 5), **OUGO**
  (fighter 8 expected — MISS, see §2), SMOKE (magic_user 10).

---

## 1. The field table

| field | offset | oracle | accept/reject | confidence shipped |
| --- | --- | --- | --- | --- |
| `name` | `0x00` (PString, max 15) | printable, sane length | 14/14 | decoded |
| `abilities` (str,int,wis,dex,con,cha) | `0x10`, 2-byte stride | uniqueness sweep over `0..498` on the COMBINED 14-record party: `cur==full`, `3..18`, party-varying | **1 accept / 498 reject** — the ONLY offset in the whole search space, same as Secret and CoAB | decoded |
| `str00` | `0x1c` (7th pair) | `cur==full` on 14/14, plausible 1e "18/00"-style values | corroborating, not independently unique (same caveat as Secret's) | decoded, weaker claim |
| `thac0` | `0xac` | `0x3C - raw` vs this engine's own `bestThac0()` for the record's OWN nonzero `classLevel` slots | **4/12** oracle-accepted records (TRISTLE, MELLIA, CHERROD, SMOKE) — see §3 | RAW, "plausible, not independently verified" |
| `race` | `0xad` | none independent (see §4) | n/a | **RAW, unlabelled** |
| `class` | `0xae` | `coabExpectedClassLevelSlots(class)` agrees with nonzero `classLevel[8]` slots | **Pools 5/6** (miss ABAGAIL), **Treasures 7/8** (miss OUGO) — see §2 | decoded |
| extra byte | `0xaf` (`class + 1`) | none survived contact with either party | n/a | **RAW, unnamed** (`extraByte`) |
| `age` | `0xb0-0xb1` (u16 LE) | range only; one cross-field correlation attempted (see §5) | plausible range `25..46` | RAW, "not verified" |
| `hpMax` | `0xb2` | weak bound: `level <= hp <= level * (best active-class hit die + CON hp bonus)`, using the record's OWN nonzero slots | **13/14** (miss: PAINE) | decoded, "bounded, not proven" |
| `savingThrows[5]` | `0x132-0x136` | every byte in `[5, 20]`, the GLOBAL min/max of `combatTables.ts`'s own `SAVES` table | **14/14** records (70/70 bytes); null: only 10 of the other 506 possible 5-byte offsets also pass | RAW, "in 1e range, not independently discriminated" |
| `classLevel[8]` window | `0x151-0x158` | the oracle itself | see §2 | decoded |
| `exp` (LE u32) | `0x172` | `xpForLevel(class,level) <= exp < xpForLevel(class,level+1)` for EVERY active class | **8/12** oracle-accepted records — see §3 | RAW, "plausible, not independently verified" |
| `0x32` constant | `0x170` | constant across all 14 | **`0x32` on 14/14**, matching CoAB's own `createPlayer` constant | decoded, convention-matched |
| party slot | `0x19c` | `0,1,2,...` per record's own file index | **confirmed exactly**: Pools `0..5`, Treasures `0..7` | decoded |

---

## 2. The load-bearing pair, reproduced this round

`(0xae, 0x151)` scores, using `coabExpectedClassLevelSlots` (the SAME oracle
`coabSavedCharacter.ts` and `secretSavedCharacter.ts` both rest on):

| title | accept | miss |
| --- | --- | --- |
| Pools (n=6) | **5** | ABAGAIL |
| Treasures (n=8) | **7** | OUGO |

Shifted-offset check (class byte moved to the adjacent bytes on either side, `classLevel` window
left at `0x151`):

| offset | Pools | Treasures |
| --- | --- | --- |
| `0xad` (= `race`) | 1/6 | 3/8 |
| **`0xae` (real)** | **5/6** | **7/8** |
| `0xaf` (= extra byte) | 1/6 | 2/8 |

Every shift scores well below the real offset — the same "partial coincidence, not full agreement"
shape `secretSavedCharacter.test.ts`'s own `0x6d` shift shows for Secret (1/6, not 0/6).

**The two outliers, byte-level facts (reported, not resolved — see the round-30 doc's §6 for why a
single-example predicate cannot be checked against a null):**

- **ABAGAIL** (Pools index 4, class byte `5 = magic_user`): expected mask `00100000` (slot 5 only);
  actual window `[0,0,0,0,0,12,0,11]` — slot 5 (12, matches) **and** slot 7 (`monk`, 11) both
  nonzero. The ONLY one of all 14 records with any nonzero byte at that window slot (`0x158`).
- **OUGO** (Treasures index 6, class byte `2 = fighter`): expected mask `00000100` (slot 2); actual
  window `[8,0,0,0,0,0,0,0]` — slot 0 (`cleric`) set instead of slot 2, a full mismatch. The ONLY
  one of all 14 records with a nonzero byte at `0x15a` (two bytes past the window), value `8`,
  matching the misplaced level exactly.

`poolsTreasuresClassLevelAgrees()` returns `false` for exactly these two records and `true` for the
other 12 — pinned in `poolsTreasuresSavedCharacter.test.ts`. The importer panel displays both,
labelled as disagreeing, and never translates them.

## 3. `thac0` and `exp`: measured against the engine's own tables, BELOW the plan's `>= 10/12` estimate

The plan predicted both oracles would pass `>= 10 of 12`. Measured against this engine's own
`ruleset/addnd1e` tables (`combatTables.ts`'s `bestThac0`-driving `thac0()`, `progression.ts`'s
`xpForLevel`):

| record | active class/level | raw thac0 | display (`0x3C-raw`) | engine `bestThac0` | thac0 match | exp | exp oracle |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BINKY | fighter 8, thief 13 | 46 | 14 | 13 | no | 750000 | no |
| Guy de Valois | paladin 12 | 50 | 10 | 9 | no | 1500001 | no |
| CLARISSA | ranger 13 | 52 | 8 | 9 | no | 1500001 | no |
| DOMINIC | cleric 14 | 48 | 12 | 14 | no | 1500001 | **yes** |
| PAINE | magic_user 13 | 48 | 12 | 17 | no | 1275000 | **yes** |
| MAXWELL | paladin 4 | 42 | 18 | 17 | no | 22600 | no |
| TRISTLE | ranger 5 | 44 | 16 | 16 | **yes** | 22600 | **yes** |
| MELLIA | cleric 5 | 42 | 18 | 18 | **yes** | 22600 | **yes** |
| CHERROD | fighter 3 / mu 3 / thief 4 | 42 | 18 | 18 | **yes** | 7533 | **yes** |
| SPARKLE | magic_user 5 | 40 | 20 | 21 | no | 22600 | **yes** |
| FRAZZLE | magic_user 5 | 40 | 20 | 21 | no | 22600 | **yes** |
| SMOKE | magic_user 10 | 41 | 19 | 19 | **yes** | 298321 | **yes** |

**THAC0: 4/12.** All 5 Pools records fail, and they are all level ≥ 12 — past `combatTables.ts`'s
own documented `MAX_COL = 12` clamp ("the engine caps here"). The engine's table therefore cannot
represent a level-13/14 character's TRUE (still-improving, per 1e) THAC0.

**But the clamp does not explain all five, and this table is the evidence against itself.** A clamp
has a DIRECTION: capping the lookup at level 12 can only make the engine's THAC0 equal to or WORSE
than a higher-level record's, never better. Two rows fit that prediction — DOMINIC (engine 14 vs
record 12, worse by 2) and PAINE (engine 17 vs record 12, worse by 5). Two rows CONTRADICT it: BINKY
(engine 13 vs record 14) and CLARISSA (engine 9 vs record 8) have the engine returning a BETTER
THAC0 than the record, which no clamp can produce. Guy de Valois (engine 9 vs record 10) is also
engine-better. So the ceiling accounts for at most 2 of the 5 Pools misses; the other 3 have an
unidentified cause and are recorded as unexplained rather than folded into the clamp.

This does not change what ships — `thac0` is carried RAW and unverified either way — it changes the
stated reason, which was one cause offered for five rows when it covers two. Treasures' low-level
records (4-10) mostly match; the 3 Treasures misses (MAXWELL, SPARKLE, FRAZZLE) are all off by
exactly 1, and are likewise not explained by the clamp (all are level ≤ 5, nowhere near it).

**EXP: 8/12.** Multiple records share an identical value — Pools' `1500001` on 3 of 6 records (Guy
de Valois, CLARISSA, DOMINIC), Treasures' `22600` on 5 of 8 (MAXWELL, TRISTLE, MELLIA, SPARKLE,
FRAZZLE) — consistent with a shared default/reset value on at least some records rather than
individually-earned XP, which is itself a candidate explanation for several of the misses (a
default value coincidentally inside one class's XP range and not another's).

**Verdict: both fields ship RAW with a "plausible, not independently verified" label** — a
materially WEAKER claim than Secret's clean 6/6 on both oracles. The plan's `>= 10/12` estimate is
wrong; this is reported per "measure before predict," not smoothed to match it.

## 4. `race`: explicitly NOT translated

Raw values: Pools `[1,5,5,5,5,5]`, Treasures `[5,5,5,1,5,5,5,5]` — a dominant `5` with one `1`
outlier per title, the same "near-constant companion byte" shape round 30's layout doc (§2) flags
for degenerate tied pairs generally, not evidence of a real enum on its own.

Per the plan's explicit instruction, this byte ships RAW unless this title's OWN race enum is
sourced from ITS OWN binary with a cited offset. No disassembly was performed this round (out of
scope — the same discipline `secretSavedCharacter.ts` applied to Secret's `race`, which also ships
raw). Unlike Secret (whose two raw values, 3 and 6, are BOTH `null` in CoAB's own `Race` enum), one
of this title's two raw values (`1`) DOES land on a non-null `COAB_RACE_TO_DL` entry
(`mountainDwarf`) while the other (`5`) does not (`halfling` has no Dragonlance analog in that
table) — but this is a coincidence of CoAB's enum shape, not evidence this title's OWN byte uses
that enum (the same "near-constant, one-outlier" pattern would produce a partial hit against nearly
any 8-entry lookup table with the right density of nulls). The importer
(`importPoolsTreasuresParty.ts`) still TRIES `COAB_RACE_TO_DL` for disclosure, the same way
`importSecretParty.ts` does — that is a reported translation ATTEMPT, not a claim about this
title's own byte, and the raw value is always shown alongside it.

## 5. `age`: range only, a correlation that holds in ONE title and not the other

All 14 values sit in `25..46`; no independent table exists (same honest gap as Secret). The SAME
cross-field correlation Secret's doc reports (the one record whose `race` byte differs from its
party also has the largest age) was checked here too:

- **Treasures**: CHERROD (`race=1`, the outlier) has age 46 — the PARTY MAXIMUM. Holds.
- **Pools**: BINKY (`race=1`, the outlier) has age 34 — NOT the party maximum (Guy de Valois, age
  41, `race=5` like the rest of the party, is). Does NOT hold.

Both outcomes are reported. A correlation that holds in one title's 6-8-record sample and not the
other's is not claimed as a rule — it is exactly the kind of single/few-example pattern
`goldbox-the-null-decides-the-finding` warns against over-claiming. `age` ships RAW, "not verified".

## 6. What is (and is not) claimed

**Claimed, byte-grounded, oracled this round:**
- `name`, `abilities` (uniqueness sweep, 14-record combined party), `class`/`classLevel[8]` (5/6 and
  7/8, both outliers named with their exact byte-level facts), `baseAc` (constant match), `partySlot`
  (exact).
- The cross-title null: Curse's 422-byte records and Secret's 439-byte records both reject this
  layout's class/classLevel oracle at 0/6, both by length AND (with the length guard bypassed via a
  synthetic size variant) by the oracle itself.

**Carried at reduced confidence, explicitly below the plan's own estimate:**
- `thac0` (4/12, not `>=10/12`). The engine's own `MAX_COL = 12` THAC0 ceiling accounts for at most
  2 of the 5 Pools misses; 3 more (BINKY, CLARISSA, Guy de Valois) have the engine returning a
  BETTER THAC0 than the record, which a ceiling cannot cause, and are unexplained — see §3.
- `exp` (8/12, not `>=10/12` — several records share a suspiciously identical value).
- `hpMax` (13/14 weak bound; PAINE is the one miss).
- `savingThrows` (in-range on 14/14, but only weakly discriminating — 10/506 other offsets also
  pass the same check).

**Not claimed at all — carried raw, never named or translated:**
- `race`@0xad — no title-own enum sourced from a disassembly; the importer's CoAB-enum TRY is a
  disclosed attempt, not a claim about this byte.
- the extra byte@0xaf (`class + 1`) — no hypothesis survived contact with either party.
- `ABAGAIL`'s and `OUGO`'s disagreements — shown, not translated, not resolved by a predicate (see
  §2 and round 30's §6 for why).
- `age`'s cross-field correlation — reported for both titles, not promoted to a rule since it only
  holds in one of the two.

**Not modelled at all:** spellbook/equipment/thief-skills bytes, alignment, sex — same honest gap
every importer in this project leaves for fields outside its own round's scope.
