# DoK saving throws: there is no second level field — the rows were typed by hand

**Verdict: NEGATIVE, and a strong one.** The Death Knights of Krynn monster saving-throw
residue is not hiding a second, level-ish record field. Every byte of the 216-byte record was
tested as an alternative key, with and without the AD&D tables, against three nulls. Nothing
but the hit-dice byte `@48` and its own mirror `@71` rises above the noise floor. The residue is
explained instead by the rows being **authored per record** — transcribed out of the 1st-edition
tables by a person, at whatever level that person chose, with occasional column-level edits.

Tool: `tools/dok_save_key_sweep.py` · pinned by `tools/test_dok_save_key_sweep.py` (26 tests).
Data: retail `Death Knights of Krynn\MON1CHA.DAX` (64 records × 216 bytes),
`Champions of Krynn\MON{1,2,3}CHA.DAX` (26/32/30 × 409 bytes) and — from the external GOG
Galaxy installs — Secret of the Silver Blades (70 × 439) and Curse of the Azure Bonds
(18 × 422). All read through this project's own DAX TOC + signed-byte-RLE reader
(`tools/dax_decode.py`), never the TS loader.

```
python tools/dok_save_key_sweep.py sweep       # rank all 216 offsets as keys
python tools/dok_save_key_sweep.py null        # the floors that ranking must beat
python tools/dok_save_key_sweep.py residue     # what @48 misses, and what would explain it
python tools/dok_save_key_sweep.py oracle      # the same question with the tables dropped
python tools/dok_save_key_sweep.py canon --corpus all
python tools/dok_save_key_sweep.py crosscheck  # same monster, two games
```

---

## 0. The baseline, re-derived rather than cited

Both halves of the established finding reproduce exactly from the bytes:

| measurement | result |
| --- | --- |
| saves `42..46` keyed off hd `@48`, 1e **fighter** table | **43/64** |
| same, allowing any of fighter / cleric / magic-user / thief | **50/64** |
| slide the 5-byte window instead, key fixed at `@48` | 43 at window 42, **0 at all 211 others** |

The tables used are the 1e DMG monster/character tables extended past the level-12 column at
which `packages/engine/src/ruleset/addnd1e/combatTables.ts` stops (DoK monsters reach hd 20, so
fighter 13-14 `[5,6,7,5,8]`, 15-16 `[4,5,6,4,7]`, 17+ `[3,4,5,4,6]` and the cleric/magic-user/
thief high bands are all required). Those extended bands are transcribed in the tool and pinned
by `test_save_tables_reproduce_known_1e_rows`.

## 1. The 216-offset sweep

Full ranking (`sweep`), top of the list:

| offset | fighter-table matches | what it is |
| --- | --- | --- |
| **@48** | **43/64** | hit dice — the incumbent |
| @71 | 37/64 | the known hd **mirror** (equals `@48` on 47/64 records) |
| @22, @23 | 14/64 | ability-score bytes |
| @43, @44, @45 | 13/64 | inside the save block itself |
| @18..@21, @24..@27 | 12/64 | more ability-score bytes |

`superset_offsets` returns **NONE**: no offset explains a strict superset of what `@48`
explains, under the fighter table or under all four class tables.

## 2. The null — and it is not close

A maximum taken over 216 offsets is a maximum over 216 chances, so the floor has to be the same
maximum computed on data with the association destroyed.

| statistic | value |
| --- | --- |
| real: hd `@48` | **43/64** |
| real: best non-hd offset (`@71`, the mirror) | 37/64 |
| real: best offset that is neither `@48` nor `@71` | **14/64** |
| **best-constant floor** — a key that ignores the record entirely (value 9) | **13/64** |
| **column-permutation null**, max over 216 offsets, 200 trials | mean 13.85, p95 16, **max 18** |
| **empirical-draw null** (keys drawn from the observed hd distribution), same statistic | mean 16.65, p95 19, **max 20** |

The third-best real offset, 14, is **below both nulls' maxima** and one point above a key that
ignores the record. `@48` at 43 is more than twice the null's ceiling. There is exactly one real
signal in this file, and `@71` is a copy of it.

## 3. The ten wrong-band records, attacked directly

`residue` splits the 21 non-matches 7 / 10 / 4, exactly as previously reported, and prints for
each of the ten the key values that *would* have produced its observed row:

| record | hd @48 | observed row | key values that would explain it |
| --- | --- | --- | --- |
| ZOMBIE MASTODON | 12 | `[10,11,12,12,13]` | fighter 7, 8 |
| SKELETAL GIANT | 10 | `[10,11,12,12,13]` | fighter 7, 8 |
| WIGHT | 4 | `[11,12,13,13,14]` | fighter 5, 6 |
| SPECTRE | 7 | `[11,12,13,13,14]` | fighter 5, 6 |
| GHAST | 4 | `[14,15,16,17,17]` | fighter 1, 2 |
| CRAZED DWARF | 8 | `[ 7, 8, 9, 8,10]` | fighter 11, 12 |
| SIR DRYDEN | 14 | `[ 7,10,11,13,12]` | cleric 7, 8, 9 |
| FLAVIUS | 11 | `[ 8, 9,10, 9,11]` | fighter 9, 10 |
| DURFEY | 12 | `[ 5, 6, 7, 5, 8]` | fighter 13, 14 |
| UNDEAD DURFEY | 12 | `[ 5, 6, 7, 5, 8]` | fighter 13, 14 |

- **Offsets carrying a satisfying value for all ten: NONE.**
- Best single offset: **3/10**. Its null — permute each column, take the max over all 216
  offsets — has **mean 3.69, p95 5, max 6**. The best real offset does not even reach the
  null's mean.
- Widening the hypothesis space to **1 525 transforms** (raw byte, low nibble, high nibble,
  `& 0x7F`, `>> 1`, u16LE, u16BE at every offset, plus `hd + k` for k in −6..+6) lifts the best
  to **5/10** (best candidate `@111 >> 1`).

  That number needs a null computed at *its own* candidate count, not the 216-candidate one —
  comparing a max-over-4320 to a null taken over 216 is precisely the mistake this project keeps
  retracting findings for. Measured independently at 4 320 candidates (raw / low nibble / high
  nibble / `& 0x7F` / `>> 1` / u16LE / u16BE at all 216 offsets, plus `hd + k` for k in −6..+6),
  histogram-preserving column permutation, 60 trials: **mean 4.12, p95 5, max 5.** The best real
  candidate therefore sits exactly **at** the null's maximum, i.e. it is what searching 4 320
  hypotheses against 10 records buys you for free.

The required key values are not in the file. The deltas also have no shared direction: five of
the ten want a *lower* level than their hd (mastodon −4, skeletal giant −2, spectre −1, ghast −2,
flavius −1), four want a *higher* one (wight +1, crazed dwarf +3, both Durfeys +1), and Sir
Dryden wants a different class entirely.

## 4. Dropping the tables: the field could use a lookup we do not know

Everything above assumes a hidden key would index the 1e tables. A hidden field need not. So
`oracle` asks the table-free question: **what is the ceiling of *any* value→row lookup on this
byte?** — the sum of the modal row count within each of the byte's value groups. That statistic
inflates purely with a byte's distinct-value count, so it is reported against a **per-offset**
permutation null.

| offset | distinct values | fitted ceiling | its own null (mean/max) | excess |
| --- | --- | --- | --- | --- |
| @45, @46 | 12, 13 | 57/64 | 22.8 / 27 | +34.2, +33.4 |
| @42, @43, @44 | 11 | 54–55/64 | ~22 / ~29 | +31.7 … +32.9 |
| **@48** | 15 | **45/64** | 24.9 / 31 | **+20.1** |
| @71 | 16 | 41/64 | 25.7 / 31 | +15.3 |
| @31 (THAC0) | 13 | 36/64 | 23.6 / 28 | +12.4 |
| @111 | 15 | 32/64 | 25.1 / 30 | +6.9 |
| … | | | | down to −2.3 |

The save bytes predict themselves, `@48` and its mirror carry the signal, `@31` is THAC0 (which
tracks HD by construction), and then it falls off a cliff into a band of ±7 that is what the
nulls themselves produce. **No byte other than the save bytes, hd, its mirror and THAC0 clears
its own permutation null by more than +6.9** (`@111`: 32/64 fitted against a null of 25.1 whose
own maximum is 30). Raw fitted coverage is not the statistic to read here: `@60` reaches 54/64
purely because it has 53 distinct values across 64 records, and its permutation null reaches
54.9 — an excess of −0.9. That is precisely the inflation the per-offset null exists to strip,
and after stripping it there is nothing left but hd.

### A statistic that was tried and rejected

A joint key `(hd, X)` looks like the obvious literal form of "second field". It is not usable
here: at 64 records, pairing hd with almost any high-entropy byte makes nearly every `(hd, X)`
cell a singleton, so the fitted coverage saturates at 64/64 for permuted columns as readily as
for real ones. Measured: a **synthetic corpus carrying a genuine planted second field scored
z = +1.2**, while the real corpus's best byte scored z = +4.3 — the probe ranks a real field
*below* noise. It cannot fail in the informative direction, so it is not evidence and the
`--joint` mode was removed rather than shipped. §3's residue test is the same question asked in
a form that does not saturate.

## 5. The rival hypothesis: SSI typed these rows by hand. The data supports it.

Three independent measurements, each with its null:

**(a) The rows are transcribed table rows.** `canon`: **60/64** DoK save rows are an exact
canonical 1e row for *some* class at *some* level. Null (shuffle each of the five save columns
across records, preserving every column's marginal): **mean 0.08/64, max 2 over 500 trials**.
A uniform draw over the observed value range `[3,17]` gives **0.00/64, max 1 over 2 000 trials**.

**(b) The four that are not table rows are table rows a person edited.** Their L1 distance to
the nearest canonical row is 2–5, against a shuffle-null mean distance of **7.8** and a
uniform-null mean of **13.2**:

| record | row | nearest table row | edit |
| --- | --- | --- | --- |
| LORD SOTH | `[3,4,5,3,5]` | fighter 17+ `[3,4,5,4,6]` | breath and spell 1 better (L1 = 2) |
| UNDEAD BEAST | `[5,6,7,5,4]` | fighter 13-14 `[5,6,7,5,8]` | spell column alone, 8 → 4 (L1 = 4) |
| BLACK MAGE | `[12,10,9,12,9]` | magic-user 6-10 `[13,11,9,13,10]` | four columns 1 better (L1 = 4) |
| EVIL WARRIOR | `[6,7,8,6,9]` | fighter 13-14 `[5,6,7,5,8]` | every column 1 worse (L1 = 5) |

Every one is a table row with a small, deliberate, column-wise nudge — the signature of a
designer in an editor, not of a lookup.

**(c) The row is not a function of hd at all.** 8 of the 15 distinct hd values in DoK carry more
than one save row. hd 12 alone carries five different rows. A per-hd lookup **fitted to the data
itself** — the most generous form any hd-keyed hypothesis can take — tops out at **45/64**, only
two above what the unfitted fighter table already achieves.

**The same monster in two games — decisive against an *hd-derived* row, not against a second
field.** (Rescoped after review: as first written this section was headed "the decisive one" and
claimed more than it proves. Neither GHOUL nor SIVAK is in the ten-record residue — both DoK rows
are exactly explained by `hd@48`, so they sit in the already-explained 43. A second field could
legitimately hold different values in two different games' records, so this argument does not by
itself close the second-field question; what carries that is the residue attack in §3 and the
CoK2 escort NPCs below. What this *does* close is the hypothesis that the row is a function of
hit dice.) Three monsters appear in both CoK
`MON1CHA` and DoK `MON1CHA`. Two of them carry the **same hd byte in both games and a different
save row**:

| monster | CoK hd / row | DoK hd / row |
| --- | --- | --- |
| GHOUL | 2 · `[14,15,16,16,17]` | 2 · `[14,15,16,17,17]` |
| SIVAK | 6 · `[ 9,10,11,11,12]` | 6 · `[11,12,13,13,14]` |
| RED DRAGON | 11 · `[7,8,9,7,10]` | 10 · `[8,9,10,9,11]` |

The row is therefore not a function of hd: the same hd yields two different rows.
The row is data someone entered, and DoK's entry differs from CoK's — note that DoK's GHOUL is
the *exact* fighter 1-2 row while CoK's is one point off in the breath column, i.e. DoK corrected
CoK's transcription.

**Verdict: hand-authoring. Not "cannot distinguish".** The mechanical-key hypothesis makes a
prediction that fails on the bytes (no offset carries the needed values, and the best candidate
is inside its own null), and the hand-authoring hypothesis makes three predictions that all hold
(rows are exact book rows far beyond any null; deviations are single-column edits; the same
monster differs between two games at the same hd).

## 6. Cross-title check — the picture generalises

Run against Champions of Krynn's three 409-byte archives (saves 208..212, hd 214):

| archive | records | exact canonical rows | shuffle null (500 trials) | fighter row at hd | superset offsets |
| --- | --- | --- | --- | --- | --- |
| DoK MON1CHA | 64 | 60 | 0.08 (max 2) | 43 | NONE |
| CoK MON1CHA | 26 | 20 | 0.03 (max 1) | 14 | NONE |
| CoK MON2CHA | 32 | 21 | 0.07 (max 2) | 15 | NONE |
| CoK MON3CHA | 30 | 22 | 0.03 (max 1) | 17 | NONE |

123 of 152 Gen1 monster save rows across those four archives are exact 1e table rows, against a
null of essentially zero. CoK deviates from the tables more often than DoK does, and CoK's
non-table rows are the same kind of small column edits (BOZAK L1 = 1, GHOUL L1 = 1, RED DRAGON
L1 = 1, HILL GIANT L1 = 2, SIVAK L1 = 4, GIANT CENTIPEDE L1 = 4).

CoK's own sweep behaves identically: hd `@214` scores 14/26, tied by `@251` (the documented hd
mirror), against a permutation-null max of 7. `@306` scores 11/26 but is the per-HP XP byte,
which tracks hd monotonically (it equals hd on 8/26 and exceeds it on the rest); it explains no
superset and scores *below* hd.

Two more Gen1 titles, read from the external GOG Galaxy installs (skipped when absent):

| archive | records | exact canonical rows | shuffle null (200 trials) | fighter @hd | any class @hd | superset |
| --- | --- | --- | --- | --- | --- | --- |
| Secret of the Silver Blades `MON1CHA` (439 B, saves 232, hd 238) | 70 | 62 | 0.04 (max 1) | 50 | 59 | NONE |
| Curse of the Azure Bonds `MON1CHA` (422 B, saves 0xdf, hd 0xe5) | 18 | 14 | 0.04 (max 2) | 10 | 12 | NONE |

Across six Gen1 monster archives — 240 records from four titles — **199 save rows are exact 1e
table rows** against a shuffle null of essentially zero, and **not one archive has an offset that
explains a superset of what its hit-dice byte explains.**

### One lead this pass opened and deliberately did not chase

CoK stores an *effective* hit-dice byte at `@306` and CoAB one at `@318` — hd plus its "+n"
bonus (CoAB: LIZARD MAN 2→3, RED PLUME 5→6, BLACK DRAGON 12→16, DRACOLICH 17→25; equal to hd on
2/18, greater on 13/18, and 0 on the three plot NPCs). In CoAB that byte ties hd at 10/18 and is
the only other offset to reach 10 — it explains LIZARD MAN and WORG, which raw hd misses, and it
is *not* a byte mirror. That is the AD&D rule "a monster with HD n+x saves as a fighter of level
n+1" showing up in the data. It still explains no superset of hd, and 18 records is far too small
a corpus to call, so it is recorded as a lead for a CoAB-focused pass, not a finding.

**It does not transfer to DoK, and that is measured, not assumed.** DoK's compact 216-byte record
has no effective-HD byte: every offset that is ≥ hd on all 64 records is *greater* than hd on all
64 (they are name characters, hp, and the inverted THAC0/AC bytes), so none of them is hd plus a
small bonus, and each scores 4/64. This closes the one motivated second-field candidate the
cross-title work turned up.

**CoK2's escort NPCs settle it.** SIR RINGWALD, LYN SWIFTFOOT, VARIANNA and MAYA all carry
`[1,1,1,1,1]` — "always saves", at L1 = 17 from the nearest table row, which appears on no
table at any level for any class. That is a value a human typed to make plot-critical escorts
un-killable. No key field produces it.

## 7. Stretch (DoK experience points) — premise failed, not attempted

The stretch was conditional on a level-ish field falling out of §1–4. None did, so there is no
new quantity to test an XP formula against, and forcing one would be fabricating a predictor.
DoK's XP award remains genuinely UNLOCATED; commit `fa07892` already ran the exhaustive
byte/u16LE/u16BE exact-match search against the CoK cross-title anchors at all 216 offsets and
got zero hits, and nothing here changes that. Recorded as a clean negative.

## 8. What this means for the engine

`DOK_LAYOUT.saves = 42` is correct and stays. No new field is added to `MonsterRecord`. The
practical consequence is the opposite of a new decode: **the save block must be read from the
record and never recomputed from hit dice.** A DQK-engine port of CoK/DoK that derived saves
from HD would get 21 of DoK's 64 monsters wrong — including Lord Soth, whose spell save is
deliberately better than the table, and Undead Beast, whose spell save is deliberately four
points better. The five bytes are content, not derived state.

## 9. Method note

Two things in this pass are worth carrying forward:

1. **The best-constant floor.** Before asking whether an offset is a key, ask what a column that
   ignores the record entirely would score. DoK's save rows are heavily repeated, so a constant
   key already gets 13/64 — most of the sweep's tail is that floor, not evidence.
2. **A saturating statistic reads as a null result.** The joint `(hd, X)` fitted coverage did not
   merely fail to find a field; it ranked a *planted* field below noise (z = +1.2 vs the real
   corpus's +4.3). Had it been shipped as the second-field test, it would have produced a
   confident negative that its own construction guaranteed. Planting the field the hypothesis
   predicts — into the real records, not into synthetic noise — is what caught it, and that
   check is now `test_planting_the_needed_levels_in_a_real_record_byte_makes_the_sweep_find_it`.
