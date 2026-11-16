# Ledger self-contradiction audit — round 34 R5

Owner: `tools/docs_numeric_claims.py` (extended to JSON sources) and the new
`tools/ledger_stale_claims.py`. No game bytes were touched; this item never writes the ledger,
`supportClaims.json`, `docs.ts` or any manifest — every fix below is a **Phase B patch**, given
here as verbatim replacement text.

## Question

Can a standing test detect a capability entry whose `detail` says a thing is decoded while its
`gaps` says there is no decoder (or a sibling capability contradicts it) — and are there such
entries at base commit `4fc4533`?

**Answer: yes, and yes.** `tools/ledger_stale_claims.py` finds exactly 4 live self-contradictions
in `tools/goldbox_capabilities.json`, all in the Buck Rogers Countdown/Matrix Cubed profiles. All
4 were adjudicated by hand (not accepted on the detector's say-so) and are real. Two of the plan's
own four named "Why now" candidates (the audio "Still no decoder..." gap and the
`supportClaims.json` "un-reverse-engineered" mention) were **already fixed** before this round's
base commit was cut — see "Candidates that turned out not to be live" below.

## The four adjudicated-real contradictions

### 1. `buck-rogers-countdown-to-doomsday` / `map_container` — family-list narrowing

`detail` (CORRECTED 2026-09-04): "every GEO, WALLDEF and ECL block decodes with the SAME Gen1
loaders already proven on CoK/DoK ... 17 GEO blocks all exactly 1026 bytes (100%
decodeGeoBlock), 9 WALLDEF blocks each a multiple of 780 (100% decodeWalldefBlock), 25 ECL
blocks all carrying the Gen1 0x1388 magic."

`gaps[3]`: "GEO/WALLDEF/monster/item container layouts for Buck have not been
reverse-engineered or wired to any exploration or combat surface."

**Adjudication**: real, but only half-wrong. GEO and WALLDEF *are* reverse-engineered per the
entry's own `detail` — that clause is stale. Monster and item layouts genuinely are not (see
`gaps[0]`, "MONSTER AND ITEM RECORDS ARE GENUINELY UNMAPPED"). The *second* clause ("or wired to
any exploration or combat surface") is still true for all four families — `gaps[1]` independently
confirms "Still NO ROUTE mounts a legal Buck dungeon or overland walk". **This is a narrowing, not
a deletion**, exactly as the dispatch prompt anticipated.

### 2. `buck-rogers-matrix-cubed` / `map_container` — status is stale, not just the prose

`detail` (UPDATED 2026-09-04): "Matrix's 25 GEO blocks are all exactly 1026 bytes and decode 100%
under decodeGeoBlock, its 11 WALLDEF blocks are each a multiple of 780 and decode 100% under
decodeWalldefBlock, and all 33 ECL blocks carry the Gen1 0x1388 magic." `status`: `"unsupported"`.

**The required measurement** (dispatch prompt: "does `listPairedGen1Areas` pair Matrix's DOS
GEO/ECL the way it pairs Countdown's 16 areas? ... let the measurement decide"). Countdown pairs
16 areas total across its 6 disks (`packages/engine/test/buckContainers.test.ts`,
`EXPECTED_PAIRED_COUNTS` summing to 16). Matrix ships a single `GEO1.DAX`/`ECL1.DAX` pair (no
per-disk split — it is one DOS install, not six floppy sides). Running the identical function
against Matrix's own files (`build/r5-scratch/matrixPairing.scratch.test.ts`, esbuild-bundled and
run directly against `matrixcubed_extracted/BuckRogers2/c/Matrix/{GEO1,ECL1}.DAX` since Matrix
isn't covered by any existing engine test):

```
GEO areas (sniffGeoBlock passes):        25  [1,17,18,21,33,34,35,38,49,50,51,52,64,65,66,80,81,82,84,96,97,112,113,114,115]
ECL blocks (sniffGen1EclBlock passes):   33  [1,2,16,17,18,19,20,21,24,32,33,34,35,36,37,38,48,49,50,64,65,66,80,81,82,84,95,96,97,98,112,113,114]
Paired (listPairedGen1Areas):            22  [1,17,18,21,33,34,35,38,49,50,64,65,66,80,81,82,84,96,97,112,113,114]
```

**22 paired areas from one disk exceeds Countdown's 16 across six.** The alternative ("Matrix's
ids are not paired the CoK way", predicting 0) is rejected outright. A follow-up spot check
(`build/r5-scratch/measure_matrix_decode.mts`) independently reproduces the ledger's own decode
claim rather than just trusting it: all 25 sniffed GEO blocks decode without throwing under
`decodeGeoBlock`, and all 11 `WALLDEF1.DAX` blocks (each 2340 = 3×780 bytes) decode without
throwing under `decodeWalldefBlock`.

**Adjudication**: the measurement decides in favor of the **status** being wrong, not just the
prose. Matrix's evidence is at least as strong as Countdown's own `partial` bar (in fact
stronger by paired-area count), so `unsupported` understates it. `gaps[0]`'s "have not been
reverse-engineered" clause is wrong for GEO/WALLDEF for the same reason as instance 1 — a
narrowing, applied on top of the status fix.

### 3. `buck-rogers-matrix-cubed` / `quests` — cross-capability, not within-entry

`detail`: "No cross-block quest-flag relationship has been identified in Matrix Cubed's ECL
corpus; it has not even been disassembled **(see ecl above)**."

The profile's own `ecl` capability entry (same profile, sibling key) describes exactly the
disassembly this sentence denies exists: round 31 shipped `ECL_GEN1_MATRIX` from Matrix's own
`GAME.OVR` dispatch map, and round 32's follow-up walks "30 of the 33 retail ECL blocks now reach
a clean terminating EXIT". The `quests` entry even points at it ("see ecl above") while denying
its content.

**Adjudication**: real, and the plainest of the four — the entry cites the very capability that
refutes it. Note `map_container`'s own `gaps[1]` already carries the identical false claim, but
**already self-corrected in place** ("CORRECTED 2026-09-04: this gap said ECL1.DAX's 33 blocks
'have not even been disassembled', which was already false when written"). The `quests` entry is
the uncorrected copy of the same round-31-vs-round-32 mistake, missed because the correction
landed in a different capability than the stale claim.

## Candidates that turned out not to be live

The plan's "Why now" section named two more candidates. Re-measured against the base commit,
both were already fixed:

- **Buck/Matrix `audio`**: the plan quotes "Still no decoder, note-event mapping, or playback
  path" beside "the round-33 sentence that decodes 8 songs." At `4fc4533`, `status` for both
  profiles' `audio` is already `"partial"` (upgraded from `unsupported`), and `detail` explicitly
  separates the two claims: "THE DECODER WAS ALREADY CORRECT AND CALLED BY NOTHING; wiring the
  census is what ma[de it reachable]." The still-present "Still no decoder..." gap bullet is
  about a **different decoder** — a hardware playback decoder that turns note events into
  AdLib/CMS port writes, which genuinely does not exist (the immediately preceding sentence in
  the same bullet is about "the hardware backends" being "a measured gap, not an unknown one").
  `gaps[0]` of the same entry makes the identical point unambiguously ("no sequencer, no timing
  model and no instrument mapping ... nothing here shows it reaching sound hardware"), so the
  ambiguous "decoder" bullet is redundant prose, not a live contradiction. **Not shipped as a
  detector pattern** — a bare "no decoder" regex was tried in an early draft and produces exactly
  this false positive (see the module docstring in `tools/ledger_stale_claims.py`), and the
  concept genuinely is ambiguous (data decode vs. hardware playback decode) rather than
  narrowly wrong.
- **`supportClaims.json`** "still says 'un-reverse-engineered' for containers round 33 mapped":
  the one live occurrence, in the Countdown entry's `missing` field, reads "...which corrects a
  ledger entry that had called them un-reverse-engineered" — the phrase is quoted in the course
  of retracting it, the same shape `docs/engine/PLAN-ROUND-34.md`'s R5 section calls out as a
  guard requirement. Confirmed FRESH by `tools/docs_numeric_claims.py`'s new
  `support_claims_buck_containers_reverse_engineered` pair (see below) — `evaluate_contradiction`
  returns `False` for it, and `tools/test_docs_claims.py::test_support_claims_json_reverse_engineered_pair_is_fresh_at_head`
  pins that.

Both were true when the plan was written and false by the time this item measured them — the
same "measure yourself first" lesson round 34's framing already calls out.

## The detector: `tools/ledger_stale_claims.py`

Three curated, subject-anchored patterns (full rationale in the module docstring):

- **`P_FAMILY_LIST`** — a `gaps[]` bullet of the shape "`<A>/<B>/... container layouts for
  <title> have not been reverse-engineered`" where one or more of the slash-separated family
  names (`GEO`, `WALLDEF`, `ECL`) is independently proven decoded by the same capability's own
  `detail`. Flags exactly the contradicted families, naming the still-true ones too — the fix
  is a narrowing by construction.
- **`P_STATUS_STALE`** — `status == "unsupported"` while `detail` carries a dated `CORRECTED
  <date>` / `UPDATED <date>` marker together with decode-success language.
- **`P_CROSS_CAPABILITY_DISASSEMBLY`** — a non-`ecl` capability's `detail`/`gaps` denies the
  ECL corpus was disassembled while the profile's own `ecl` entry independently proves it.

Two guards, both load-bearing (an early draft without them false-flagged the CoK audio entry's
own self-correcting "RESOLVED: ... previously 'UNLOCATED' ..." bullet, and would have
false-flagged Countdown's own gaps[0] "monster/item ... GENUINELY UNMAPPED" against its GEO/
WALLDEF decode claim — a real co-occurrence about a **different sub-subject**, not a
contradiction):

- **CORRECTED-quote guard** (`_is_guarded_by_correction`): a match inside a quoted span in a
  bullet whose own text contains `CORRECTED` earlier is exempted — it is quoting an old,
  already-retracted claim in the course of correcting it, not asserting it live.
- **Negation-before-proof guard** (`_is_negated_immediately_before`): a proof-phrase regex
  (e.g. "dispatch map") must not treat a NEGATED mention of itself ("no dispatch map exists")
  as proof. Not exercised by any live ledger sentence today, but cheap insurance and directly
  tested.

Precision is scoped subject-by-subject deliberately: a first draft tried generic
`decoded`/`no-decoder`/`mapped`/`unmapped` polarity pairs, which fired on Countdown's own
consistent (non-contradictory) entry because "decoded" (about GEO/WALLDEF) and "unmapped" (about
monster/item) co-occur legitimately — see the module docstring's point 1 for the exact false
positive.

## Bars, predictions, and their nulls

**Bar A** (planted fixture): recall 6/6, false positives 0/6 (bar allowed ≤ 1/6) —
`tools/test_ledger_stale_claims.py`'s `PLANTED_CONTRADICTION_TESTS` (2× P_FAMILY_LIST variants
beyond the minimum, one per family regex; 2× P_STATUS_STALE marker variants; 1×
P_CROSS_CAPABILITY_DISASSEMBLY) and `PLANTED_NEAR_MISS_TESTS` (CORRECTED-quote guard, no-overlap
family list, `status != unsupported` gate, unproven `ecl` sibling, negated-proof guard, and a
documented decode-vs-wired scope boundary). **PASS**, exceeding the bar (0 FP, not ≤1).

Both directions were watched RED via deliberate mutation, not merely written and trusted:
disabling `_is_guarded_by_correction` (return `False` unconditionally) turned
`test_near_miss_corrected_quote_is_not_flagged` red with the exact planted contradiction
surfacing in the assertion diff; replacing `_FAMILY_LIST_GAP`'s pattern with a
never-matching regex turned all three `P_FAMILY_LIST` planted tests AND
`test_live_ledger_stale_claims_pinned_exactly` red (the live pin lost exactly the two
`P_FAMILY_LIST` ids and kept the other two, confirming the test is sensitive to that one
pattern specifically). Both mutations were reverted before finishing.

**Bar B**: ≥ 4 adjudicated-real pairs on the live artifacts with precision ≥ 0.8. **Measured: 4
candidates flagged, 4 adjudicated real** (by hand, per instance above) → **precision 4/4 = 1.0**.
PASS, but honestly scoped: per the plan's own stated risk ("R5's detector may find the four known
pairs and nothing else; that is still a pass, but the test's value then rests on the planted
fixture, not on live recall"), that is exactly what happened here — the shipped detector's *recall*
evidence is the 6/6 synthetic fixture (Bar A), not a larger live positive set. An extensive manual
search across all 109 `partial`/`unsupported` capability rows (every `CORRECTED`/`UPDATED`-dated
`detail` ledger-wide; every "not (even) been disassembled"/"not reverse-engineered"/"not been
mapped" occurrence; every capability with `status == "unsupported"`, read in full) found no
additional real instance beyond these 4 — reported as a negative with its own null: "no live
contradiction exists beyond these 4" is not rejected by anything found.

**Bar C**: `KNOWN_STALE_LEDGER_CLAIMS` pins the 4 ids exactly, mirroring `KNOWN_STALE_CLAIMS` in
`tools/test_docs_claims.py`; `FORMER_STALE_LEDGER_CLAIMS` is the (currently empty) set Phase B
grows as it lands each fix, so a regression on a fixed id names itself instead of reappearing as
an anonymous new hit.

## Predictions

- **P12** (≥ 4 live self-contradictions, all in Buck/Matrix profiles or `supportClaims.json`):
  **MET, exactly 4**, all in the Buck/Matrix `map_container`/`quests` capabilities (none in
  `supportClaims.json` — that file's one candidate mention is the guarded, non-live shape).
- **P13** (detector precision on live artifacts ≥ 0.8): **MET, 1.0 (4/4)** — reported with its
  denominator per the ground rules, and with the Bar B caveat above about what that number can
  and cannot support (a 4-for-4 detector on a 4-candidate live pool is not the same claim as a
  4-for-40 detector on a 40-candidate pool).

## `tools/docs_numeric_claims.py` extension to JSON sources

`ContradictionPair` gained an optional `guard: re.Pattern[str] | None` field (default `None`,
fully backward compatible with the existing CLAUDE.md `claude_md_disk3_status` pair) and
`evaluate_contradiction` now suppresses a match when `guard` fires in the `guard_window`
characters immediately before the assertion match — the JSON-specific shape where a prose field
quotes its own stale claim, unquoted, in the same sentence that retracts it (unlike CLAUDE.md's
disk3 case, where the stale and corrective sentences are genuinely separate). One new pair,
`support_claims_buck_containers_reverse_engineered`, targets `apps/web/src/ui/supportClaims.json`
directly (`ContradictionPair.doc` is read as raw text regardless of extension, so no other
plumbing was needed) and is pinned FRESH at head — see "Candidates that turned out not to be
live" above. `KNOWN_STALE_CLAIMS`/`FORMER_STALE_CLAIMS` semantics in `tools/test_docs_claims.py`
are unchanged; the CLAUDE.md test-count assertion's tolerance was not touched.

New tests: `SyntheticGuardedContradictionDetectorTests` (3 cases — a live unguarded
co-occurrence still flags STALE, proving the guard doesn't blanket-suppress the pair; the exact
self-correcting shape is suppressed; the guard window is scoped, not whole-document) and
`test_support_claims_json_reverse_engineered_pair_is_fresh_at_head` (pins the real file's current
FRESH verdict). All 25 tests in `tools/test_docs_claims.py` pass (was 21 before this item; +4 new).

## Phase B patches

Verbatim replacement text for every adjudicated-real contradiction. None of these files were
edited by this item.

### `tools/goldbox_capabilities.json` — `buck-rogers-countdown-to-doomsday` → `map_container`

Replace `gaps[3]` (currently: "GEO/WALLDEF/monster/item container layouts for Buck have not been
reverse-engineered or wired to any exploration or combat surface.") with:

```
"Monster and item container layouts for Buck remain unmapped (see the first gap above); GEO and WALLDEF ARE reverse-engineered (see detail above), correcting this bullet's earlier blanket denial. None of the four families -- GEO, WALLDEF, monster, or item -- is wired to any exploration or combat surface (round 34 R5, docs/engine/research/ledger-stale-claims.md)."
```

### `tools/goldbox_capabilities.json` — `buck-rogers-matrix-cubed` → `map_container`

Change `"status": "unsupported"` to `"status": "partial"`.

Append to `detail` (after the existing UPDATED 2026-09-04 sentence, before the closing
`docs/engine/research/buck-containers.md.`):

```
 PROMOTED unsupported -> partial (round 34 R5, docs/engine/research/ledger-stale-claims.md): listPairedGen1Areas pairs 22 of Matrix's own GEO1.DAX/ECL1.DAX area ids (1,17,18,21,33,34,35,38,49,50,64,65,66,80,81,82,84,96,97,112,113,114) under the exact criterion gen1AreaIndex.ts uses -- MORE paired areas than Countdown's 16 across its six disks, on the same criterion that earns Countdown's own partial status. All 25 sniffed GEO blocks and all 11 WALLDEF1.DAX blocks (each 2340 = 3x780 bytes) independently decode without throwing under decodeGeoBlock/decodeWalldefBlock. The alternative ("Matrix's ids are not paired the CoK way", predicting 0) is rejected.
```

Replace `gaps[0]` (currently: "GEO/WALLDEF/monster/item container layouts for Matrix Cubed have
not been reverse-engineered or wired to any exploration or combat surface.") with:

```
"Monster and item container layouts for Matrix Cubed remain unmapped (259-byte monster records and a 1456-byte item table match no existing layout profile; see Countdown's own map_container entry for the measurement); GEO and WALLDEF ARE reverse-engineered (see detail above). None of the four families is wired to any exploration or combat surface (round 34 R5, docs/engine/research/ledger-stale-claims.md)."
```

### `tools/goldbox_capabilities.json` — `buck-rogers-matrix-cubed` → `quests`

Replace `detail` (currently: "No cross-block quest-flag relationship has been identified in
Matrix Cubed's ECL corpus; it has not even been disassembled (see ecl above).") with:

```
"No cross-block quest-flag relationship has been identified in Matrix Cubed's ECL corpus. CORRECTED 2026-09-04 (round 34 R5, docs/engine/research/ledger-stale-claims.md): this entry previously said the corpus 'has not even been disassembled', which was already false when written -- this profile's own ecl entry describes an extensive dispatch-map-derived disassembly (ECL_GEN1_MATRIX, round 31; 30 of 33 retail blocks reach a clean terminating EXIT, round 32). The corpus IS disassembled; what remains true is that it has not been searched for cross-block quest-flag writer/reader pairs the way Gateway, Pools, Treasures, and NWN were."
```

No changes are proposed to `supportClaims.json`, `docs.ts`, or any manifest — none carries a live
contradiction at base.
