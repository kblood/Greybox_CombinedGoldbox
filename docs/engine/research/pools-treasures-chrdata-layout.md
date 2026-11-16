# Pools of Darkness / Treasures of the Savage Frontier — the 510-byte record is CoAB's, shifted

**Verdict (R3, round 30): round 29's "0 discriminating offset pairs each" was a threshold
artefact, not a wrong count.** The literal number — full n-of-n agreement, every record in the
party — is still 0 for both titles, and stays 0 in this round's own re-measurement. What round 29
never reported next to that 0 is the (n-1)-of-n tier: at the SAME two-field oracle CoAB's own
loader rests on, class byte `0xae` + `ClassLevel[8]` window `0x151` scores **5/6 on Pools** and
**7/8 on Treasures** — a single miss per title — and that score clears a shuffled null built for
the honest alternative ("how high can ANY pair score by chance", not just "how many pairs reach
full agreement by chance", which stays 0 in the null too and so proves nothing about a near-miss).
A dozen more CoAB fields read plausibly at the same or a related shift. The two misses — Pools'
`ABAGAIL` and Treasures' `OUGO` — are reported as misses with their byte-level facts, not resolved
by a predicate, because each is the only example of its own anomaly (n=1) and no predicate built
from a single case can be checked against a null without circularity.

Tool: `tools/secret_chrdata_sweep.py` (`--pair`, `--top-pairs`, `--ability-sweep`, `--field-map`,
all added this round) · pinned by `tools/test_secret_chrdata_sweep.py` (new tests, see below).
Data: the external, never-vendored GOG Galaxy installs — `Pools of Darkness\SAVE\CHRDATA{1..6}.SAV`
(510 B), `Treasures of the Savage Frontier\SAVE\CHRDATA{1..8}.SAV` (510 B).

```
python tools/secret_chrdata_sweep.py --title pools --pair 0xae 0x151
python tools/secret_chrdata_sweep.py --title treasures --pair 0xae 0x151
python tools/secret_chrdata_sweep.py --title pools --shuffle 200 --top-pairs 2
python tools/secret_chrdata_sweep.py --title treasures --shuffle 200 --top-pairs 1
python tools/secret_chrdata_sweep.py --title pools --ability-sweep --shuffle 200
python tools/secret_chrdata_sweep.py --title treasures --ability-sweep --shuffle 200
python tools/secret_chrdata_sweep.py --title pools --field-map 0x39   # thac0/race/class group
python tools/secret_chrdata_sweep.py --title pools --field-map 0x3a   # age/hpMax (past the extra byte)
python tools/secret_chrdata_sweep.py --title pools --field-map 0x48   # classLevel window
```

---

## 1. The two thresholds, side by side

| statistic | Pools (n=6) | Treasures (n=8) |
| --- | --- | --- |
| full n-of-n agreement (round 29's number) | **0** | **0** |
| score at `(0xae, 0x151)` — the (n-1)-of-n tier | **5** | **7** |
| shuffled null (200 trials, seed 12345), max FULL-agreement count | 0 | 0 |
| shuffled null (200 trials, seed 12345), max score at ANY pair | **4** | **5** |
| real score clears the null's max-at-any-pair ceiling by | 5 > 4 | 7 > 5 |

Round 29's "0" is not a wrong count — it is still 0 today, at the same full-agreement threshold —
but reporting only that number, with no neighbouring value, made a near-miss that clears a
proper null read as "nothing here." The corrected null (`max_score_any_discriminating_pair`,
added to `shuffled_null()` this round) is the one that actually tests the alternative a
(n-1)-of-n score has to beat: pure byte-shuffle noise never exceeds 4/6 on Pools or 5/8 on
Treasures over 200 trials, so the real 5/6 and 7/8 are not chance artefacts of the search's own
size.

## 2. Is `(0xae, 0x151)` unique? Only after a tie-break — reported honestly

Neither title's `(0xae, 0x151)` is the *sole* pair at its own top discriminating score:

- **Pools**: 26 pairs tie at score 5/6 (`--top-pairs 2` output, reproducible).
- **Treasures**: 2 pairs tie at score 7/8 — `(0xad, 0x1e9)` and `(0xae, 0x151)`.

What separates the real pair from its ties is `class_diversity(records, c)` — the count of
DISTINCT raw class-byte values across the party at candidate offset `c` (new helper in
`secret_chrdata_sweep.py`). Every other tied pair in both titles reads at most 2 distinct class
codes across the whole party (near-constant — usually "5 of 6/8 records are `magic_user`, 1 is
something else", the same "degenerate leakage" pattern documented for CoAB/Secret in
`secret-chrdata-layout.md` section 0). `(0xae, 0x151)` reads **5 distinct classes on Pools** (of
6 records) and **6 distinct classes on Treasures** (of 8) — a strict, unambiguous argmax:

| title | winner diversity at `(0xae, 0x151)` | max diversity among the other tied pairs |
| --- | --- | --- |
| Pools | 5 | 2 |
| Treasures | 6 | 2 |

This is the sense in which the pair is "unique": not the only pair at its raw score, but the only
one whose class byte is genuinely discriminating rather than riding along on party imbalance. Both
`test_pools_0xae_0x151_is_the_unique_high_diversity_pair_at_its_score_tier` and its Treasures
counterpart pin this exactly, including the tie counts (26 and 2) so the tie itself is not hidden.

## 3. Mutations run this round

Per `PLAN-ROUND-30.md`'s R3 brief:

- **(i) Pin Treasures at `(0xad, 0x151)`.** The brief predicted this scores **0/8**. Measured:
  **3/8**. The brief's specific number is wrong — `0xad` is the near-constant "7/8 magic_user"
  byte, and pairing it with the CORRECT level window (`0x151`) still drags the score down from
  7/8 to 3/8, which is the mutation's real point (the class-byte choice matters, not just the
  level window) even though the predicted floor was too low. Not pinned as a permanent test
  (the plan's own number was wrong); reported here per "measure before you predict."
- **(ii) Insert 17 zero bytes at `0x40` into every Pools record.** Predicted: the top pair moves
  to `(0xbf, 0x162) = (0xae+17, 0x151+17)` at the same 5/6. **Confirmed exactly** — `(0xbf,
  0x162)` appears in the mutated sweep's tied set at score 5/6, and `class_diversity` still
  singles it out (5 vs. 2 for every other tied pair). This is the same insertion-tracking
  behaviour `test_sweep_tracks_a_synthetic_insertion` already proved for Curse→Secret.
- **(iii) Shuffle the class-byte column across records** (permute which record owns which
  `0xae` value; level windows untouched). Predicted: score collapses toward the null's ceiling.
  **Confirmed** — Pools drops from 5/6 to 0/6, Treasures from 7/8 to 1/8 (seed 42), both at or
  below their titles' null ceilings (4 and 5). Pinned as
  `test_shuffling_the_class_byte_column_collapses_the_score`.

## 4. The field table (CoAB-shifted)

Produced with `--field-map`, not by hand. Each field is checked at whichever delta from its CoAB
offset lands on real values (the deltas are NOT one uniform shift across the whole record — see
section 5).

| field | CoAB offset | Pools/Treasures offset | delta | check | verdict |
| --- | --- | --- | --- | --- | --- |
| ability block (7x cur/max, Str/Int/Wis/Dex/Con/Cha/Str00) | `0x10` | `0x10` | 0 | `--ability-sweep`: unique offset satisfying "6 pairs, cur==max, 3..18, party-varying" | **verified, 6/6 and 8/8**, null ceiling 0/200 trials |
| thac0-shaped | `0x73` | `0xac` | `+0x39` | plausible thac0 range | Pools `[46,50,52,48,46,48]` — plausible, unverified semantics |
| race-shaped | `0x74` | `0xad` | `+0x39` | matches `class_diversity` companion byte | Pools `[1,5,5,5,5,5]` = druid/mu×5 — plausible, unverified |
| class byte | `0x75` | `0xae` | `+0x39` | the oracle itself | **the load-bearing field, section 1-2** |
| extra byte (no CoAB analogue) | — | `0xaf` | — | present, all-zero on 13/14 records | same shape as Secret's `0x6d` extra byte (`secret-chrdata-layout.md` §2); unmodelled |
| age-shaped (SWord) | `0x76` | `0xb0-0xb1` | `+0x3a` (one past the extra byte) | plausible age range | Pools `[34,41,34,31,32,35]` — plausible, unverified |
| hpMax-shaped | `0x78` | `0xb2` | `+0x3a` | plausible hp range | Pools `[89,116,120,98,92,96]` — plausible, unverified |
| classLevel[8] window | `0x109` | `0x151` | `+0x48` | the oracle itself | **section 1-2** |
| saving-throw-shaped (5 bytes) | `0xdf-0xe3` (CoAB) | `0x132-0x136` | — | plausible AD&D-1e save range | Pools `BINKY` `[10,9,8,12,9]`, all 14 records in `5..15` — plausible, unverified |
| `0x32` constant | `0x124` (`baseAc`, CoAB's own `createPlayer` constant `50 = 0x32`) | `0x170` | — | constant across party | **`0x32` on all 14 records** (6 Pools + 8 Treasures) — matches CoAB's documented `baseAc` constant exactly |
| party slot byte | `0x143` (CoAB) | `0x19c` | — | `0,1,2,...` per party order | **confirmed**: Pools `0..5`, Treasures `0..7`, exactly party order |
| XP candidate (LE dword) | `0x127` | `0x172` | — | large positive integer | Pools `750000/1500001/1500001/1500001/825000/1275000`; Treasures mostly `22600`, two outliers `7533`/`151810`/`298321` — plausible magnitude, **not independently verified as XP** (no known "should equal N" check was available this round) |

Every row marked "plausible, unverified" is exactly that: the byte pattern is consistent with the
named quantity (right range, right shape) but has no second, independent field to cross-check it
against the way the class/level pair does. Per the project's "ship it raw and unlabelled, don't
guess" standard, none of these is wired into an importer or decoder this round — this document is
measurement only, same as `secret-chrdata-layout.md` was for Secret.

## 5. The record was NOT extended by one uniform delta

The delta between CoAB's field offsets and Pools/Treasures' shifts partway through the record:
`+0x39` for thac0/race/class, `+0x3a` for age/hpMax (one more, because of the extra byte at
`0xaf`), and `+0x48` for the classLevel window — a THIRD, larger delta. This is the same pattern
`secret-chrdata-layout.md` section 2 found for Secret (class byte and level array move by
different, not-equal deltas): the record was restructured across multiple point insertions or
removals, not extended once at a single point. `--field-map` takes one delta per invocation for
exactly this reason — a single "the record grew by K bytes here" guess would silently misalign
every field past the point where a second insertion happened.

## 6. The two outliers — reported as misses, not resolved

The plan explicitly warned against resolving these by picking whichever hypothesis makes the
count n/n. Both are reported as MISSES with their measured facts; no predicate is claimed as a
finding.

**Pools — `ABAGAIL`** (record index 4, class byte `0xae = 5` = `magic_user`). Expected mask
`00100000` (slot 5 only); actual window `[0,0,0,0,0,12,0,11]` — slot 5 (12, matches expectation)
**and** slot 7 (`monk`, 11) both nonzero. `ABAGAIL` is the ONLY one of all 14 Pools+Treasures
records with any nonzero byte at window slot 7 (`0x158`) — pinned by
`test_pools_outlier_is_abagail_with_an_extra_set_bit`, which asserts all 13 other records read 0
there.

**Treasures — `OUGO`** (record index 6, class byte `0xae = 2` = `fighter`). Expected mask
`00000100` (slot 2); actual window `[8,0,0,0,0,0,0,0]` — slot 0 (`cleric`) is set instead of slot
2, a full mismatch rather than an extra bit. `OUGO` is also the ONLY one of all 14 records with a
nonzero byte at `0x15a` (two bytes past the 8-byte window) — value `8`, the same magnitude as the
misplaced level. Pinned by `test_treasures_outlier_is_ougo_with_a_level_in_the_wrong_slot`.

**Why neither is claimed as explained.** CoAB has a `ClassLevelsOld[8]` array immediately after
`ClassLevel[8]` (`Player.cs:447`, offset `0x111`), used by `SkillLevel()` for dual-classed
characters (`Player.cs:494`: `ClassLevel[skill] + ClassLevelsOld[skill] * DualClassExceedsPreviousLevel()`).
It is tempting to read `OUGO`'s `0x15a` byte (two bytes past the window, i.e. inside a
`0x159`-based array analogous to `ClassLevelsOld`) as "the character was originally a cleric
(level 8, stuck in the wrong ClassLevel slot) and has since dual-classed to fighter" — but this
is built from exactly ONE example. `ABAGAIL`'s anomaly does not fit the same story at all (her
extra bit is INSIDE the 8-byte window, at slot 7/monk, not in a separate array past it, and
magic_user→monk is not a legal AD&D dual-class path in this game). Two different single-example
anomalies do not make a testable pattern: a predicate written to admit either one, built with
foreknowledge of that one case, cannot be checked against a shuffled null without circularity
(the null itself would need to be told what "should" trigger the predicate). Per
`goldbox-the-null-decides-the-finding`, both are recorded as **UNKNOWN** — the hypothesis
(dual-classing / an old-class-level scratch field) is worth investigating with more samples or
the community `Player.cs`-equivalent for these titles, if one exists, but is not claimed here.

## 7. What is (and is not) claimed

- **Claimed, byte-grounded, null-checked:** `(0xae, 0x151)` is Pools' and Treasures' class-byte /
  `ClassLevel[8]`-window pair under the same oracle CoAB's own loader rests on — 5/6 and 7/8,
  each the unique high-`class_diversity` pair among its score-tier ties, both clearing a
  max-score-at-any-pair null (4 and 5) that specifically tests the alternative. The ability
  block is confirmed at `0x10` on all four titles (Curse, Secret, Pools, Treasures), 6/6 and
  8/8, null ceiling 0/200.
- **Claimed, byte-grounded, NOT null-checked (no second field to cross-check against):** the
  thac0/race/age/hpMax/saving-throw/XP-shaped bytes in the field table — plausible ranges and
  shapes, unverified semantics. The `0x32` constant at `0x170` and the party-slot byte at
  `0x19c` are exact-match confirmations against CoAB's own documented constant and ordering.
- **Retracted from round 29:** the sentence "0 discriminating offset pairs each" as the WHOLE
  finding. The literal count is unchanged (still 0 at full n-of-n), but reporting it alone, with
  no near-miss or its null, was misleading — see `secret-chrdata-layout.md`'s dated correction.
- **Not claimed:** a full field-by-field Pools/Treasures record layout, an importer, or anything
  about `ABAGAIL`'s or `OUGO`'s anomaly beyond the measured bytes. `packages/engine/**` is
  untouched this round, per the R3 must-not-touch list — R2 owns `Gen1SavedCharacterLayout` and
  any future importer wiring.
