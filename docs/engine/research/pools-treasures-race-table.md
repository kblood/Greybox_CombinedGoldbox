# Pools of Darkness and Treasures of the Savage Frontier decide their own race bytes

Round 35, task R4. Tooling: `tools/pools_treasures_race_table.py` (+ `tools/test_pools_treasures_race_table.py`,
22 tests). Engine side: `packages/engine/src/loaders/poolsTreasuresSavedCharacter.ts`,
`packages/engine/test/poolsTreasuresSavedCharacter.test.ts` (28 tests). Import side:
`apps/web/src/ui/importPoolsTreasuresParty.ts`.

Sources are **referenced, never vendored**: `C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness\GAME.EXE`
and `...\Treasures of the Savage Frontier\GAME.EXE`, unpacked (Microsoft EXEPACK v1, both are
variant-1 images) into the git-ignored `build/r35-r4/`. Every test skips rather than fails when the
GOG installs are absent.

## 1. What was wrong before

Round 31's `importPoolsTreasuresParty.ts` translated the `race` byte at record offset `0xad`
through **`COAB_RACE_TO_DL`** — Curse of the Azure Bonds' enum, borrowed because these two titles'
own tables had not been read. It was disclosed as a guess. It was also wrong, and round 34 had
already shown how that mistake is made: Secret of the Silver Blades' own table has **eight**
entries with a leading `Tribble`, so its byte 5 is `Halfling` where these two titles' byte 5 is
`Human`. **The Gen1 race enum is not family-stable.** Copying one title's numbering to another is
the specific error this round removes, so neither table below was copied from the other — both were
derived independently from their own binary, and `test_the_two_titles_tables_are_derived_independently_not_copied`
pins that.

## 2. The tables, from each title's own binary

Both titles compile a Borland Pascal `string[N]` array into DGROUP: fixed stride, length-prefixed
entries, in declaration order. The class table is the landmark (its first entry `Cleric` is
unambiguous, and its 18 entries match this repo's own CoAB `ClassId` order), the race table starts
immediately after the class table's last entry, and each table's stride is **measured from its own
second entry and cross-checked against its third** — never inherited, never assumed to be Secret's 9.

| Title | unpacked `GAME.EXE` | class table | race table | stride | entries |
| --- | --- | --- | --- | --- | --- |
| Pools of Darkness | 72,784 bytes | `0xACC7`, stride 27, 18 entries | **`0xAEAD`** | 9 | 7 |
| Treasures of the Savage Frontier | 78,976 bytes | `0xD26E`, stride 27, 18 entries | **`0xD454`** | 9 | 7 |

Both read out the same seven strings, in this order:

```
0 Elf   1 Half-Elf   2 Dwarf   3 Gnome   4 Halfling   5 Human   6 Monster
```

Same content, **different offsets** — which is the whole point of doing it twice.

## 3. The fencepost null (and it did discriminate here)

Shift the assumed base by ±1..±8 and count how many of the 7 slots still read as a plausible short
PString (length byte 1..15, payload fully present and printable ASCII).

| Title | at the real base | max over the 16 shifted bases |
| --- | --- | --- |
| Pools | **7 / 7** | **0** |
| Treasures | **7 / 7** | **0** |

The tool also reports `window_can_alias_stride`, which is `False` for both (stride 9 > 8), so the
±8 window genuinely cannot land on a neighbouring entry. That flag exists because the same null
**fails** on Buck Rogers' stride-5 and stride-7 tables — see `buck-string-tables.md`. A null that
works is a null that was checked for the condition under which it works.

**Boundary anchor** (the slot one stride before the base, and one stride past the last entry):

- Pools: `0xAEA4` is not a plausible PString; `0xAEEC` is `'Lawful Good'` — the alignment table
  that follows, i.e. the race table ends at exactly seven entries.
- Treasures: `0xD44B` is not plausible; `0xD493` is not plausible (pad).

## 4. The indexing: argued by consequence, NOT located

**The instruction that indexes this table was not found, and the search is reported rather than
hidden.** `imul r16, imm8` (the obvious `index * stride` shape) returns **zero** hits for stride 9
or 27 in either image: these are 8086-targeted builds and `imul imm8` is 80186+. A delta-pair probe
over `mov reg, imm16` values differing by `0x1E6` (the class-table extent) produced **16
paragraph-aligned candidate bases across four files with no tie-breaker** — non-discriminating.
Round 34 did not locate Secret's indexing instruction either. The budget was spent and stopped;
this is stated, not smoothed.

What IS measured is the consequence, three independent ways, all pointing at **0-based**:

1. **Class-byte corroboration, in the same table block.** The class byte at `0xae` indexes the
   *class* table that sits directly below the race table, at the same stride convention. Over the
   14 real records, a 0-based read agrees with the decoded `classLabel` on **12 of 14**
   (Pools 5/6, Treasures 7/8); a 1-based read agrees on **0 of 14**. The two disagreements are
   ABAGAIL and OUGO, and they are the *pre-existing* `classLevel`-array disagreement this round
   deliberately does not touch — not race evidence either way.
2. **The paladin argument.** Both class-byte-3 (`Paladin`) heroes — Guy de Valois and MAXWELL —
   carry race byte 5. Under 0-based that is `Human`; a 1e paladin is human-only. Under 1-based it
   is `Halfling`, and under the old CoAB enum it is `halfling`. **Exactly one of the three readings
   is legal**, and it is the one shipped.
3. **The multi-class split.** Race byte usage across the 14 records is exactly the multi/single
   class split: the two multi-class records (BINKY `mc_f_t`, CHERROD `mc_f_mu_t`) carry byte 1, and
   all twelve single-class records carry byte 5. Under 0-based, byte 5 is `Human` — the one entry of
   the seven that AD&D 1e (and this engine's own `isMultiClassAllowed`) forbids from multi-classing,
   and byte 1 is `Half-Elf`, which may multi-class in all three of BINKY's and CHERROD's classes.
   Under a uniform assignment of seven labels this correspondence arises 1 time in 7.

**Independent corroboration outside the Krynn tree:** FRUA's `hackdocs_extracted/CCHFORM.TXT` gives
the `.CCH` offset-88 race enum as exactly these seven values in this order, and `LEVLIM.TXT` names
"race 5 (Human)". FRUA is a different SSI product with its own documentation lineage, so it is a
second oracle, not a restatement of ours. `test_the_frua_hackdoc_enum_equals_this_table` pins it.

The shipped constant carries the label **"argued by consequence, indexing instruction not located"**
in its own doc comment, and so does the importer's.

## 5. The plan-supplied null that did NOT discriminate

The plan expected the **import outcome** to select the reading: run all 14 heroes through
`clampToRace` + `createCharacter` under each of the three readings and see which produces a legal
party. Measured, over all 14 real pregens (`poolsTreasuresSavedCharacter.test.ts`, three-reading
table):

| reading | accepted | rejected | `clampToRace` delta |
| --- | --- | --- | --- |
| CoAB enum (round 31 status quo) | **12 / 14** | BINKY, CHERROD | — |
| own table, **0-based** (shipped) | **14 / 14** | none | **none** |
| own table, **1-based** | **14 / 14** | none | CHERROD (STR percentile only) |

**The outcome test falsifies the CoAB enum and nothing else.** It cannot separate 0-based from
1-based, because under 1-based byte 5 reads `Halfling`, which has no Dragonlance analog and
therefore falls back to `human` **anyway** — producing the identical twelve sheets — while byte 1
reads `Elf`, which may also multi-class. The only visible difference is a single clamp on CHERROD's
exceptional-strength percentile (qualinestiElf caps it at 75, halfElf at 90): one field on one hero,
not a legality signal. This is pinned as a named `MEASURED NON-DISCRIMINATOR` test rather than
quietly dropped, and it is why §4's argument rests on the **label** each reading assigns, not on
whether the party comes out legal.

The `clampToRace` delta the plan asked for, by name: **zero heroes** change any ability score under
the shipped reading.

## 6. What shipped, and what it changed

`POOLS_TREASURES_RACE_LABEL` (7 entries) is exported from `poolsTreasuresSavedCharacter.ts` and
**wired** into `POOLS_TREASURES_SAVED_CHARACTER_LAYOUT.raceLabelTable`, so every decoded record now
carries a `raceLabel`. It is not a stated-not-wired constant: the layout is the consumer, and
`decodeGen1SavedCharacter` puts the label on all 14 real records.

`importPoolsTreasuresParty.ts` replaces `COAB_RACE_TO_DL` with `POOLS_TREASURES_RACE_TO_DL`:

```
0 Elf      -> qualinestiElf   (disclosed pick among elf sub-races)
1 Half-Elf -> halfElf
2 Dwarf    -> mountainDwarf   (disclosed pick)
3 Gnome    -> null            (no analog)
4 Halfling -> null            (no analog; kender are culturally unrelated)
5 Human    -> human
6 Monster  -> null            (sentinel)
```

The measured effect on the two browser import routes (run scoped with `GB_E2E_ONLY`):

- **`?import=pools`**: **6 of 6 join**, rejection list **empty** (was 5 of 6 with BINKY rejected —
  her thief 13 exceeded the mountainDwarf DQK cap of 8, a pure translation artifact). Five of the
  six agree with the classLevel oracle; ABAGAIL is still the one named disagreement.
- **`?import=treasures`**: **6 join, 0 rule-rejections, exactly 2 party-cap rejections** (OUGO and
  SMOKE, pushed out by the shared 6-hero cap). CHERROD, previously rejected outright because
  mountainDwarf may not be a magic-user, now joins as a half-elf F3/MU3/T4.

**A disclosure regression this creates, and does not fix:** OUGO is the Treasures record whose class
byte disagrees with her own `classLevel` array, and she is now a *party-cap* rejection, so she no
longer appears in the panel's summary table at all — the disagreement disclosure that round 33 put
there is now unreachable on that route. The panel still names her under "Could not join the party",
but without the reason. Fixing that means surfacing cap-rejected heroes' disclosures, which is a UI
change outside this task's scope; it is recorded here and in the round's handoff rather than
silently accepted.

## 7. What this round refuses to claim

- **Not located code.** The 0-based reading is argued by consequence. No instruction, no
  disassembly line, no `imul`. Anyone who later locates it should expect to confirm rather than
  discover.
- **No merge of the ABAGAIL/OUGO `classLevel` disagreement into this change.** Those two records
  disagree for a reason unrelated to race, and the class-byte figure is reported as 12/14 with both
  disagreements named, not rounded to "the class table indexes 0-based, full stop".
- **No shared constant.** Two titles, two derivations, two cited offsets, one shared transcription
  only because the bytes agreed — never because the strings looked the same.
