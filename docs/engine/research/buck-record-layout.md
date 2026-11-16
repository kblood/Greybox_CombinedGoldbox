# Buck Rogers / Matrix Cubed 259/263-byte XXVc record family

Round 34, item R2. Tests: `packages/engine/test/buckRecord.test.ts` (synthetic + real
`chrdata{1..6}.sav` + cross-title oracle against Matrix's `MON0CHA.DAX`),
`packages/engine/test/monster.test.ts` (two appended cases pinning the deliberate non-mapping),
`tools/test_buck_container_census.py` (two appended two-sided cases). Loader:
`packages/engine/src/loaders/buckSavedCharacter.ts`. Scratch: `build/r2-buck/`.

## The question

Round 33 (`docs/engine/research/buck-containers.md`) found Buck Rogers: Countdown to Doomsday's
`mon0cha.dax` decompresses to 54 name-plausible 263-byte records and Matrix Cubed's `MON0CHA.DAX`
to 63 name-plausible 259-byte records, neither matching any of the six existing
`MonsterLayoutProfile` sizes (216/285/409/422/439/510), and explicitly warned against fitting
either to the nearest size without deriving real field offsets. Round 34's plan hypothesised: are
these one record family, also shared with Buck's own six pregenerated party members
(`chrdata{n}.sav`), with Buck's monster records being that same 259-byte layout plus 4 bytes
inserted near offset ~251?

## Reproduced from round 33

```
python3 -> dax_decode.parse_container/decompress_block on mon0cha.dax and MON0CHA.DAX
Buck:   54 blocks, ALL exactly 263 bytes, name-plausible
Matrix: 63 blocks, ALL exactly 259 bytes, name-plausible
Shared monster names (exact string match): 19
  ACID FROG, BUCK ROGERS, D.R. WARRIOR, HYPERCRAB, HYPERSNAKE, LEANDER, LG. E.C. GENNIE,
  LL. WARRIOR, MER. H.S. ROBOT, MER. WARRIOR, PIRATE LEADER, PIRATE WARRIOR, RAM ASSASSIN,
  RAM G.D. GENNIE, RAM WARRIOR, SAND SQUID, TERRINE WARRIOR, URSADDER, ZANE
```

This matches round 33's counts and the plan's "19 monster names the two titles share" exactly.

## Oracle 1 — the six pregens (`chrdata{n}.sav`)

`{external-game-holdings}/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/chrdata{1..6}.sav` are **plain,
uncompressed 259-byte files** — no DAX container, no TOC, straight bytes on disk (confirmed by
reading them directly). Copies kept at `build/r2-buck/chrdata{1..6}.sav`.

| File | Name | offset-0 length byte |
| --- | --- | --- |
| chrdata1.sav | FLAVIUS | 7 |
| chrdata2.sav | CELESTE | 7 |
| chrdata3.sav | PIERRE | 6 |
| chrdata4.sav | NICOLE STEELE | 13 |
| chrdata5.sav | ROARKE | 6 |
| chrdata6.sav | JANELLE | 7 |

All 6 length bytes match the decoded name's own length exactly (Bar A's "name matching the
filename" criterion, satisfied against the embedded name rather than the OS filename).

**Uniqueness sweep for the ability block** (same technique `secretSavedCharacter.ts` used to find
CoAB's `ABILITY_OFFSET`): sweeping every offset pair `(a, a+7)` in the 259-byte record for a 7-byte
block that duplicates itself on all 6 records while varying party-to-party finds exactly **one**
non-trivial hit: `16..22` / `23..29`. Values run 9..21 (wider than the classic AD&D 3..18 CoK/CoAB/
Secret use — consistent with XXVc being a different, TECH-augmented ruleset, not a decode error).
Field ORDER within the septet (STR/DEX/CON/INT/WIS/CHA/TECH, the plan's own hypothesis) is **not**
independently verified — no digitized Buck Rogers ability-order reference exists in this repo — so
`buckSavedCharacter.ts` exposes an ordered tuple, not named fields.

**Uniqueness sweep for HP**: the SAME technique, applied to every offset pair 158 bytes apart,
finds exactly one non-trivial hit with 6 DISTINCT nonzero values: `raw[69] == raw[227]` for all 6
pregens (26, 22, 16, 16, 14, 13) — the Gen1-standard "HP stored twice" convention already
documented in `monster.ts` for CoK (214/251), DoK (40/214) and Secret (305/437). The sweep's only
other multi-valued mirror pair is `54`/`229` (15/15/12/12/9/9 — only 3 distinct values); kept
unnamed (raw-only) rather than mislabelled.

Full pregen dump (offset : value per record 1..6) lives in this doc's git history / `build/r2-buck/`
scratch; the load-bearing columns are reproduced above.

## Oracle 2 — the 19 shared monster names, insertion-point search

**The plan's own null did NOT reproduce.** Two scoring variants were tried against the 19
shared-name pairs, sweeping every insertion point `k` in 0..259 (`buck[i]` vs `matrix[i]` for
`i<k`, `buck[i+4]` vs `matrix[i]` for `i>=k`):

| Metric | Real score at best k | Shuffled-pairing null (200 trials) | Reproduces plan's 662/1111? |
| --- | --- | --- | --- |
| raw per-byte equality, all 259 offsets | 4280 at k=251 | min 3719 / mean 3785 / max 3929 | No |
| equality excluding zero bytes on either side | 675 at k=232..251 (plateau) | min 210 / mean 267.5 / max 378 | No |

Neither reproduces 662 (shuffled) / 1111 (real). Per ground rule 3, **this specific bar is VOID as
stated** — reported rather than treated as pass or fail. Worse: the "best k" score from EITHER
metric **ties with k=259 (i.e. "no insertion at all")** — 675 vs 675 (zero-excluded), 4280 vs 4240
(raw) — so a single best-of-259-offsets score is **not a discriminating oracle for the insertion
point**, because only ~8 of 259 offsets are actually affected by shifting the split point near the
tail, and most of those are zero padding in both titles.

**What actually locates the insertion point**: a per-offset comparison of the no-shift hypothesis
(`buck[i]` vs `matrix[i]`) against the shifted hypothesis (`buck[i+4]` vs `matrix[i]`), independently
at every one of the 259 offsets (not collapsed into one sweep score). Result:

- For **i = 0..247**, the no-shift hypothesis wins or ties almost everywhere — including at the
  located HP (69/227) and control_morale (231) offsets from Oracle 1, which read as sensible,
  differently-balanced monster stats under NO shift (e.g. ZANE: HP 4 in Buck vs 8 in Matrix, both
  `>0x7F` at 231: 148 vs 128).
- **i = 249..251**: both hypotheses score poorly (9/19 or fewer exact matches either way) — the
  genuine transition zone, where the field the insertion touches differs in content on top of the
  offset shift.
- **i = 253..258**: the shifted hypothesis wins clearly, reaching **19/19 exact matches** (all
  shared pairs agree) at offsets 255, 257 and 258.

This lands the insertion point at **k ≈ 249-255, best single estimate 251** — inside the plan's own
"~251" estimate and within its ±2-byte stability bar, but reached by a different (and more
discriminating) oracle than the one whose specific numbers didn't reproduce.

## Oracle 3 — GAME.OVR's own copy routine (attempted, inconclusive)

`tools/carve_goldbox_overlays.py` confirms Buck's `GAME.OVR` is a standalone Borland **TPOV** pool
(210,067 bytes from file offset 4) — the same family DQK's `GAME.OVR` turned out to be (`TPOV`, not
`FBOV`) — with "segment-level split remains pattern-matcher work" (i.e. no ready function
boundaries). A raw-byte search for `rep movsb`/`rep movsw` (`f3 a4`/`f3 a5`), `add si,4`/`add di,4`
(`83 c6 04`/`83 c7 04`) and `mov cx,259`/`mov cx,263` (`b9 03 01`/`b9 07 01`) across the whole pool
found **zero** hits for any of them — the pool's early bytes are Borland runtime error strings
(`"WARNING: Insufficient Memory$..."`), consistent with code and data being interleaved in a way
this round's tools cannot yet segment.

`START.EXE` (EXEPACK-unpacked via `tools/exepack_unpack.py` into `build/r2-buck/start_unpacked.bin`,
69,760 bytes) DOES contain the literal 16-bit words for 259 and 263 clustered around file offsets
57,230-58,310 and 63,637-69,061 — but disassembling that region (Capstone, 16-bit mode) decodes to
implausible, non-code-shaped instruction sequences, indicating this is a **data table** (containing
259/263 as stored constants — plausibly a "record size per game object type" table) rather than the
copy routine's own immediate operand. **Not pursued further this round** — time-boxed out, matching
the plan's framing of Oracle 3 as a bonus ("beats both statistical oracles") rather than a required
bar. No Buck Rogers monster-manual table is digitized anywhere in this repo, so the plan's step 4
(cross-check AC/THAC0 against the manual for ≥5 monsters) could not be attempted either.

## Why no `MonsterLayoutProfile` was added to `monster.ts`

`MonsterLayout.ac` and `.thac0` are **non-optional** `number` fields — every existing profile
supplies a real byte offset, and `decodeMonsterRecord` unconditionally computes
`armorClass: TO_HIT_BASE - raw[layout.ac]` / `thac0: TO_HIT_BASE - raw[layout.thac0]` with no null
path (unlike `category`/`hp`/`saves`/`hitDice`/`xp`/`iconSize`/`morale`, which are `| null`).
`MonsterRecord.armorClass`/`.thac0` are consumed as non-optional numbers throughout
`combat/combat.ts`, `module/validate.ts` (`isSafeInteger` checks), `loaders/monchaEncode.ts` and
more — files outside this item's writable list. AC/THAC0 were **not located** this round (no code
site found, no manual to cross-check), so widening the type or fabricating an offset would be
exactly the failure the round's standing warning names: *"do not add a `buck (263)`/`matrix (259)`
MonsterLayoutProfile without deriving and testing its field offsets against known monster stats
first."*

Instead: `packages/engine/src/loaders/buckSavedCharacter.ts` (new) decodes the SAVE side only
(name/abilities/HP/control_morale — no `ac`/`thac0` fields to fabricate), `monster.ts` documents
the shared-family finding in a comment above `MonsterLayoutProfile` (so a future round with a real
AC/THAC0 oracle has the offset table and the insertion point ready), and
`tools/buck_container_census.py`'s `monster_layout_census` reports a `xxvc_family` block with a
`MAPPED (partial)` verdict — located fields listed, unlocated fields (`ac`, `thac0`, `damage`,
`category`, `hitDice`, `xp`) listed explicitly — without claiming a `MonsterLayoutProfile` fit.

## Corpus-wide confirmation (not just the 19 shared pairs)

Running the same offsets against the FULL corpora (not just the cross-title-shared 19 names):

| | Buck (54 records, 263B) | Matrix (63 records, 259B) |
| --- | --- | --- |
| HP mirror `raw[69] == raw[227]` | 54/54 (100%) | 63/63 (100%) |
| HP > 0 | 54/54 (100%) | 63/63 (100%) |
| control_morale byte 231 > 0x7F | 54/54 (100%) | 63/63 (100%) |
| abilities septet @16: ≥5/7 bytes in 3..18 | 53/54 (98.1%) | 56/63 (88.9%) |

The HP mirror and the >0x7F morale gate hold on literally every record in both corpora — strong
confirmation of the offsets, though the 100% morale-gate rate is also flagged honestly: it does not
by itself rule out offset 231 being a fixed "this is a monster record" type marker rather than a
genuinely variable morale value, since a saturated-at-one-value field can't be told apart from a
gate that always fires. `decodeMorale` (now exported from `monster.ts`) is reused verbatim by
`buckSavedCharacter.ts` and applies the SAME >0x7F gate.

## Predictions scored

- **P5** ("Buck monster = 259-byte XXVc record + 4 bytes inserted at 248..253"): the per-offset A/B
  crossover analysis supports this — insertion zone measured at 249-255, best estimate 251, inside
  the predicted 248..253 window. The plan's own quoted null numbers (662/1111) do NOT reproduce and
  are VOID as stated; the qualitative finding is corroborated by a different, more discriminating
  oracle. **P5: supported, by a different oracle than the plan specified.**
- **P6** ("Six pregens decode; abilities offset transfers to ≥45/50 Matrix monsters, shuffled null
  ≤15/50"): six pregens decode cleanly (Oracle 1). The transfer sub-claim is **VOID as literally
  stated**: at the strict 7/7-in-3..18 threshold, Matrix scores 42/63 (66.7%, below the 90% bar);
  at a loosened 5/7 threshold it scores 56/63 (88.9%, still short of 90%). More importantly, the
  plan's implied "shuffled/random-offset null tops out low" does not hold: an OFFSET sweep (not a
  value shuffle) finds offsets 30/31 scoring 98.4% — HIGHER than offset 16's own 66.7-88.9% — so a
  naive plausibility-range check cannot by itself uniquely single out offset 16 against every
  competing offset in the record (Buck Rogers XXVc appears to carry more than one small-integer
  stat block in that byte range, e.g. a skills block). Offset 16 remains the right answer on
  STRUCTURAL grounds (the save-record duplicate-block oracle, which no other offset in the record
  satisfies), not on the plausibility-fraction test alone. **P6: partially void — reported, not
  silently passed.**
- **P7** ("item0 16-byte layout not settled this round"): correct — round 33's `item0.dax` 16-byte
  hypothesis was out of scope for R2 (owned by `item.ts`, which this item must not touch) and is
  unchanged. **P7: confirmed.**

## Bars scored

- **Bar A** (six pregens decode with 7 abilities in 3..18, level 1, HP>0, name matching): name/HP
  hold 6/6; abilities hold at a LOOSER threshold (≥5/7 in range, not 7/7 — see P6); "level 1" was
  **not** independently locatable from an all-level-1 party (two candidate always-1 bytes at
  offsets 52/61, no discriminator). **Bar A: partial pass, reported precisely rather than rounded
  up.**
- **Bar B** (insertion point k stable across 3 oracles, ±2 bytes): Oracles 1+2 (the pregen HP/
  morale offsets plus the per-offset A/B crossover) converge on k≈251; Oracle 3 (code-level) was
  attempted and is inconclusive (not contradictory — no code site was found at all). **Bar B: pass
  on the 2 oracles this round could complete.**
- **Bar C** (`buck_container_census.py` reports MAPPED with new offsets; test flips two-sided):
  done — `monster_layout_census`'s `xxvc_family` block reports located offsets (name/abilities/HP/
  controlMorale) and explicitly-unlocated fields (ac/thac0/damage/category/hitDice/xp);
  `test_buck_container_census.py` gained two two-sided tests (one per title), each asserting both
  the positive (fields located, 100% HP-mirror agreement) and the negative (ac/thac0 still absent
  from `not_located`... i.e. still present in that list). Mutation-tested: corrupting
  `XXVC_HP_MIRROR_OFFSET` from 227 to 228 turns both new tests red; restored. **Bar C: pass.**
- **Bar D** (item0 16-byte hypothesis, no bar): out of scope for R2 (owned by `item.ts`); not
  touched, per P7 above.

## Gates run

`pnpm -C packages/engine exec tsc --noEmit` (clean), `pnpm -C packages/engine test` (248 files /
2843 tests, all green — some of that delta over the round's base 246/2823 is concurrent work by
other round-34 items in the same shared tree, not this item alone), `python -m pytest
tools/test_buck_container_census.py -q` (12 passed, up from 10), `python -m pytest tools/ -q` (full
corpus — see the round's report for the final count). No file outside this item's writable list was
edited.
