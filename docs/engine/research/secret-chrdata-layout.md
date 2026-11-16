# Where Secret of the Silver Blades' extra 17 bytes went — an offset sweep, not an inference

**Verdict: a unique, discriminating (class-offset, level-offset) pair exists for both Curse of the
Azure Bonds (calibration) and Secret of the Silver Blades — but the plan's specific prediction that
Secret's difference is one contiguous 17-byte insertion (`l - 0x109 == c - 0x75` for a single `k`)
is FALSE.** The measured pair moves the class byte 9 bytes *earlier* (`0x75 -> 0x6c`) while moving
the `ClassLevel[8]` window 8 bytes *later* (`0x109 -> 0x111`) — two different deltas, not one, that
happen to net to the same +17 total gap growth as the file's own size difference. Pools of Darkness
and Treasures of the Savage Frontier's 510-byte records give **zero** discriminating full-agreement
pairs each — a genuine negative, reported here with its own null and its own nearest miss.

Tool: `tools/secret_chrdata_sweep.py` · pinned by `tools/test_secret_chrdata_sweep.py`. Originally
14 tests, Curse + Secret only (Pools/Treasures report-only) — round 30's R3 added Pools/Treasures
pins too, at the (n-1)-of-n tier; see the dated correction under §3 and
`docs/engine/research/pools-treasures-chrdata-layout.md` for the full writeup. Standing cross-title null:
`packages/engine/test/coabSavedCharacter.test.ts`'s new `describe('cross-title null ...')` block.
Data: the external, never-vendored GOG Galaxy installs — `Curse of the Azure Bonds\SAVE\CHRDATA{1..6}.SAV`
(422 B), `Secret of the Silver Blades\CHRDATA{1..6}.SAV` (439 B, **install root** — its `SAVE\` is
empty, verified on-disk), `Pools of Darkness\SAVE\CHRDATA{1..6}.SAV` (510 B),
`Treasures of the Savage Frontier\SAVE\CHRDATA{1..8}.SAV` (510 B).

```
python tools/secret_chrdata_sweep.py --title curse --shuffle 200
python tools/secret_chrdata_sweep.py --title secret --shuffle 200
python tools/secret_chrdata_sweep.py --title pools --shuffle 200
python tools/secret_chrdata_sweep.py --title treasures --shuffle 200
```

---

## 0. The oracle, and why the raw sweep needed a second filter

The oracle re-applies CoAB's own consistency check — the class byte's `ClassId` enum
(`coabExpectedClassLevelSlots`, `coabSavedCharacter.ts:144`) must agree with which of the
independently-stored `ClassLevel[8]` slots are nonzero — at every candidate `(c, l)` offset pair,
not just CoAB's own `(0x75, 0x109)`. "Full agreement" means every record in the title's small
sample (6, or 8 for Treasures) accepts.

**The raw, unfiltered sweep is dominated by a degenerate case the oracle itself does not
exclude.** Byte value `0` is `ClassId.cleric` — a VALID, non-null class code, not a sentinel — so
any offset `c` that happens to be `0` on every record in the party (extremely common: these are
compact records with large unused/reserved regions, and 6-8 records is a small sample) reads as "the
whole party is clerics" and will full-agree against any level window `l` that is ALSO constant across
the party. On Curse this produced **598** raw full-agreement pairs; on Secret, **270**. Both numbers
are real, reproducible measurements — not a tool bug — and both are useless as a layout signal,
because they carry no information about *which* class each character actually is.

The fix is a second, principled filter — **discriminating**: keep only `c` where the expected class
bitmask actually **varies across the party**. This is exactly the property that makes CoAB's own
oracle claim non-trivial in the first place (its 6 pregens really are 4 different classes: paladin,
paladin, mc_f_t, mc_f_mu, cleric, magic_user — `coabSavedCharacter.test.ts`'s `GOLDEN` table). A
`c` that reads the same class on the whole party can never demonstrate discrimination, no matter
how many `l` it full-agrees with.

## 1. Curse — calibration

| statistic | value |
| --- | --- |
| raw full-agreement pairs | **598** |
| **discriminating full-agreement pairs** | **1: `(0x75, 0x109)`** — Player.cs's own offsets, found with no prior knowledge of where they are |
| runner-up (discriminating), score | 5/6, **145 pairs** |
| shuffled null (200 trials, seed 12345), max RAW full-agreement | **0** |
| shuffled null (200 trials, seed 12345), max DISCRIMINATING full-agreement | **0** |

The null byte-shuffles each record's own bytes independently (a permutation of that record — same
byte multiset, no field structure) and reruns the whole sweep; the maximum, over 200 trials, of how
many pairs reach full agreement in the shuffled copy. It never once reaches even 1, on either the raw
or discriminating count — real Curse gives 598 raw / 1 discriminating, both far above the ceiling
"the byte values just happen to repeat a lot" can reach on its own. The real, uniquely-discriminating
signal recovers the exact known offsets and nothing else — the sweep is trustworthy.

## 2. Secret — the answer

| statistic | value |
| --- | --- |
| raw full-agreement pairs | **270** |
| **discriminating full-agreement pairs** | **1: `(0x6c, 0x111)`** |
| runner-up (discriminating), score | 5/6, **148 pairs** |
| shuffled null (200 trials), max RAW / DISCRIMINATING | **0 / 0** |

At `(0x6c, 0x111)` the sanity checks the plan asked for both hold: every nonzero level byte across
the 6 records is in `1..25` (`[8], [8], [8], [7,8], [8], [9]`), and the `PString`@0 name decodes to
printable ASCII for all 6 (`Guy de Valois `, `PAINE`, `EPONA`, `MALACHITE`, `DOMINIC`, `MORGAINE`).
This is a layout, not a coincidence.

**Is it a contiguous insertion relative to CoAB? No — the plan's specific prediction is false.**

```
c (class byte):    0x6c = 108        CoAB: 0x75 = 117        delta = c - 0x75 = -9
l (level window):  0x111 = 273       CoAB: 0x109 = 265        delta = l - 0x109 = +8
```

The plan predicted a single `k ∈ [0, 17]` with `l - 0x109 == c - 0x75` — i.e. one 17-byte block
inserted somewhere before the class byte, pushing both fields forward by the same amount. That is
not what the bytes show: the class byte moved **9 bytes earlier**, not later, while the level array
moved **8 bytes later**. The two deltas are of opposite sign and unequal magnitude — `-9 != +8` — so
this is not a single contiguous insertion at one point in the record. What IS true: the *gap* between
the two fields grew by exactly the file's own size delta —
`(0x111 - 0x6c) - (0x109 - 0x75) = 0xa5 - 0x94 = 17 = 439 - 422` — so the 17 extra bytes are real and
accounted for, but they are not simply prepended as one block; the record layout was restructured
(fields moved independently, e.g. something removed before the class byte and more added between it
and the level array) rather than merely extended. The mutation test in section 4 confirms the tool
correctly reports a TRUE single insertion when one is injected, so this non-alignment is a property of
Secret's real bytes, not a defect in the sweep.

**The one CoAB-fixed-offset match, named.** Applying CoAB's own `(0x75, 0x109)` directly to Secret's
6 records (as the original one-time measurement in
`docs/engine/research/original-save-import-export-status.md:340-360` did) accepts exactly 1 of 6:
**MALACHITE**. This is the coincidence the sweep resolves: at `0x75`, 5 of 6 Secret records read `0`
(cleric) simply because that offset is not the real class byte for this title; MALACHITE's `0x75`
happens to also read `0`, AND its `0x109..0x110` window happens to have only slot 0 set — a double
coincidence, not a partial layout overlap. The real class byte for MALACHITE (a fighter/thief,
`mc_f_t` = code 14) sits at the genuine offset `0x6c`, not `0x75`.

## 3. Pools and Treasures — report-only

| title | n | size | raw full | discriminating full | runner-up (disc.) | null max (disc., 200 trials) |
| --- | --- | --- | --- | --- | --- | --- |
| Pools of Darkness | 6 | 510 | 4 | **0** | 5/6, 26 pairs | 0 |
| Treasures of the Savage Frontier | 8 | 510 | 0 | **0** | 7/8, 2 pairs | 0 |

Both are genuine negatives: no `(c, l)` pair reaches full agreement on the whole party once the
degenerate-constant-class matches are filtered out, and the shuffled null still caps at 0 — so the
zero is not simply "the search space was too small to find anything," it is "nothing in this space
beats even a shuffled record." The plan predicted 1 pair each (with a larger `k`, and possibly two
independent deltas) — the real count is 0 for both.

**The nearest miss, since a negative needs its neighbours reported too.** Treasures' best
discriminating score is 7/8 (not merely "the runner-up" — it is one record away from a hit), at two
pairs:

- `(0xad, 0x1e9)`: mostly degenerate leakage — 7 of the 8 Treasures pregens are `magic_user`, so a
  byte that reads `5` on 7/8 records and a window with only its own magic-user slot set on 7/8
  clears the discriminating filter on the strength of party imbalance, not a real class/level
  correspondence. The one non-magic-user record (a `druid`) breaks it.
- `(0xae, 0x151)`: more interesting — 7 of 8 records show a level byte in the class's own expected
  slot (paladin@4, ranger@5, cleric@5, mc_f_mu_t@3/3/4, magic_user@5/5/10); the eighth (a `fighter`)
  shows a level byte in the cleric slot instead. This is the closest thing to a real signal found for
  either 510-byte title, but it explains 7 of 8 records, not all 8, so it does not qualify as full
  agreement and is reported here only as the neighbouring value the "negative needs a null too"
  standard asks for. No importer or further offset work is planned for Pools or Treasures this round.

> **CORRECTION (R3, round 30).** The `0` discriminating-pairs verdict above (section 3) was a
> threshold artefact, not a wrong count: it is the FULL n-of-n agreement number and is still 0
> today for both titles. What this section never reported next to that 0 is the (n-1)-of-n tier —
> at the same two-field oracle, `(0xae, 0x151)` scores **5/6 on Pools** and **7/8 on Treasures**,
> clearing a shuffled null built for the honest alternative (max score at ANY pair, not just max
> count of full-agreement pairs, which stays 0 in the null too and so proves nothing about a
> near-miss). The pair is the unique high-`class_diversity` pair among its score-tier's ties (26
> pairs tie at 5/6 on Pools, 2 at 7/8 on Treasures — see the new tool's `class_diversity` metric).
> A dozen more CoAB-shaped fields read plausibly at the same or a related shift. Pools' `ABAGAIL`
> and Treasures' `OUGO` are the one miss per title, reported as misses with their byte-level facts
> — not resolved by a predicate, since each anomaly is a single (n=1) example that cannot be
> checked against a null. Full writeup, field table and mutation results:
> `docs/engine/research/pools-treasures-chrdata-layout.md`. The "0 discriminating pairs" SENTENCE
> in `tools/goldbox_capabilities.json` and `original-save-import-export-status.md` was a live
> false claim as the sole reported statistic and needs Phase B correction; the underlying `0`
> number, cited alone with its null, remains true.

## 4. The insertion-tracking mutation test

To rule out the sweep simply reporting CoAB's own offsets no matter what it is fed, 17 zero bytes
were inserted at `0x40` into every real Curse record (turning it into a synthetic 439-byte record —
Secret's exact size) and the sweep rerun. The discriminating full-agreement pair moved to exactly
`(0x75 + 17, 0x109 + 17) = (0x86, 0x11a)`, confirmed by `tools/test_secret_chrdata_sweep.py::test_sweep_tracks_a_synthetic_insertion`.
This is the control case the section-2 finding is contrasted against: a TRUE single insertion
produces one consistent `k` on both axes; Secret's real bytes do not.

## 5. What is (and is not) claimed

- **Claimed, byte-grounded:** Secret's `_class` byte lives at `0x6c` and its `ClassLevel[8]` array at
  `0x111` under the same two-field oracle CoAB's own loader rests on — verified 6/6, against a
  shuffled null of 0/200, with plausible level values and printable names at that offset.
- **Retracted from the plan's prediction:** Secret's 17-byte difference is NOT a single contiguous
  insertion before the class byte. The class byte moved backward, the level array moved forward, by
  different amounts.
- **Not claimed:** a full field-by-field Secret record layout, or an importer. This round is the
  offset measurement only — `coabSavedCharacter.ts`, `packages/engine/src/index.ts` and
  `apps/web/src/ui/importCoabParty.ts` are untouched, per the R3 must-not-touch list. A Secret
  importer, if built later, would need the rest of the record (name/abilities/etc.) re-verified at
  their own possibly-shifted offsets — nothing here assumes they moved by the same deltas as class or
  level.
- **Not claimed:** anything about Pools' or Treasures' true layout — the report-only numbers above
  only say the *same two-field oracle* finds nothing there; a from-scratch investigation (its own
  `Player.cs`-equivalent, if the community decompile has one for those titles) was out of scope.

## 6. Dated addendum — 2026-09-02 (R3)

This document (and the standing cross-title-null test now in `coabSavedCharacter.test.ts`)
supersede the sentence at `original-save-import-export-status.md:350` that called the cross-title
null "report-only ... a one-time measurement". The null is now pinned in the engine suite: see
`coabSavedCharacter.test.ts`'s `describe('cross-title null — CoAB's own fixed offsets ...')`
(4 cases, one per title, each `it.skipIf` on that title's GOG install). The counts pinned there —
Curse 6/6, Secret 1/6 (MALACHITE), Pools 0/6, Treasures 0/8 — are the SAME fixed-offset measurement
the original doc reported; the discriminating-offset sweep in this document is new, additional
information about *where the real Secret layout is*, not a replacement for that standing test.
