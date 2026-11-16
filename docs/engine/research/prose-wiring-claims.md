# Prose that outlived the tree

Round 35, R6. Base commit `1bf33a2` (branch `greybox`, 2026-09-05). Everything below was
measured; where a plan prediction and a measurement disagree, the measurement is reported and
the prediction is scored against it.

The question: **"`<symbol>` is not yet wired into `<path>`" is a sentence this repo writes a lot,
and the tree moves underneath it. Can that be resolved mechanically, or only by hand?**

The short answer: **mechanically for 2 of 6 (33%) of the family, at precision 1.000 on the two it
resolves; by hand for the rest.** A guard is the difference between a usable gate and a detector
that fires on phrases. And the plan's own control — a CoK audio claim that is STILL TRUE —
disqualified the reading that looked best on paper.

**Corrected 2026-09-05 (adversarial verification of this round's own R6 task): this said "40% of
the family" / "Recall: 2 of 5" below.** The denominator omitted one of this same memo's own
findings — §4's `ecl-census-reachability.md:194` is a LIVE stale claim the strict reading misses,
exactly like the other three §5 already listed, and it was left out of §5's population by
oversight rather than by any reasoned exclusion. Six live stale claims were hand-adjudicated
across the corpus, not five; recall is 2/6 (0.333), not 2/5 (0.40). The corrected count is worse,
not better — a resolver covering a third of a family is a smaller claim than one covering two
fifths, and reporting the larger of the two is exactly the kind of overstatement this repo keeps
having to retract (see `goldbox-the-null-decides-the-finding` in project memory).

---

## 1. The two readings, and the null

`tools/prose_wiring_claims.py` extracts a candidate wherever a sentence contains the anchor

```
(is|are|was|were|remains|stays|still)? (still)? not (yet)? (been)? (wired|called|consumed|imported|referenced) (into|from|by|in)
```

then looks **backwards** up to 240 characters for a backticked code identifier (the SUBJECT) and
**forwards** up to 200 characters for a path-shaped token (the TARGET).

Two readings decide the verdict:

| reading | rule | role |
|---|---|---|
| **STRICT** | open the target file, strip its comments, and check whether it names the symbol | the shipped gate |
| **LOOSE** (the NULL) | fire whenever the symbol merely exists somewhere in the repo; never open the target | the plan-supplied null |

The null is not a strawman: it is what a grep-driven reviewer actually does. It is also what a
"detector that fires on phrases" looks like, which is exactly the failure mode this task was
told to watch for.

### The historical-context guard

Both readings run through `_classify_context`, which demotes a candidate to `HISTORICAL` when it
sits under a dated heading, inside a `~~struck~~` span, in a plan/queue/handoff/audit file, or —
new this round — within 400 characters of a **retraction marker** (`CORRECTED 20xx-xx-xx`, "used
to say", "the sentence this replaces", …). That last rule is borrowed from
`docs_numeric_claims.ContradictionPair.guard`, and it is load-bearing for a reason worth
recording: **this round's own ledger corrections quote the stale sentence verbatim**, so without
the guard the gate could never be satisfied — correcting a claim would re-trigger it. The guard
is pinned two-sided in `tools/test_prose_wiring_claims.py`: with the marker the same text is
`HISTORICAL`, without it, `LIVE`.

---

## 2. Measured at HEAD (`1bf33a2`), before any correction

431 corpus files scanned (`docs/**`, `CLAUDE.md`, `tools/goldbox_capabilities.json`,
`apps/web/src/ui/supportClaims.json`). **40 candidates**: 2 FALSIFIED, 5 HOLDS, 33 UNRESOLVED.

| reading | guard | fires | ground-truth true positives | **precision** | fires on the control? |
|---|---|---|---|---|---|
| LOOSE (null) | off | **15** | 4 | **0.267** | **yes** |
| LOOSE (null) | on | 5 | 4 | 0.800 | **yes** |
| STRICT | off | 2 | 2 | 1.000 | no |
| **STRICT** | **on** | **2** | **2** | **1.000** | **no** |

The plan's bar was **precision ≥ 0.8 on live artifacts after the guard, without firing on the
control**. The guarded null reaches 0.800 numerically and still **fails the bar**, because one of
its false positives *is* the control. The guarded strict reading clears it.

Two honest qualifications:

* **1.000 on two fires is a small-N number.** It says the reading did not misfire, not that it
  cannot. The number that carries more information is the null's 0.267.
* "Precision" as printed by `prose_wiring_claims.precision()` is **live-share**, not
  ground-truth precision — the fraction of fires that are LIVE. Ground truth came from hand
  adjudication of all 15 null fires (§3). The function's docstring says this, and it returns
  `None` (printed `n/a`) rather than `0.0` when there are no fires, because a tautological 1.0
  or a misleading 0.0 is how a metric stops meaning anything.

### The control, verified independently

`tools/goldbox_capabilities.json:40` says CoK's `dosSong` decoder is **not** wired into
`apps/web/src/audio/gameAudio.ts`. Verified by grep on 2026-09-05: that file contains neither
`dosSong` nor `decodeCokSoundBank`. **The claim is still true.** The strict reading resolves it
and returns `HOLDS`; the loose reading returns `FALSIFIED`.

`test_control_true_negative_is_resolved_and_holds` asserts this **two-sided** — that the sentence
is still extracted as exactly one candidate *and* that its verdict is `HOLDS`. A one-sided "does
not fire" would pass if the resolver quietly stopped seeing the sentence at all, which is how a
true-negative check becomes vacuous.

---

## 3. Ground truth: all 15 null fires, adjudicated by hand

`L` = live stale claim (the tree contradicts a current-state sentence). `H` = historical or
guarded. `T` = the claim is still TRUE, so a fire is a false positive.

| # | site | symbol | verdict | why |
|---|---|---|---|---|
| 1 | `tools/goldbox_capabilities.json:40` | `dosSong` | **T** | the control. Still unwired. |
| 2 | `tools/goldbox_capabilities.json:1177` | `buckSavedCharacter` | **L** | wired by `e156eec`, a day before the round |
| 3 | `tools/goldbox_capabilities.json:1217` | `buckSavedCharacter` | **L** | same symbol, second row |
| 4 | `docs/engine/BUILD-QUEUE.md:4757` | `decodeDqkItemRecord` | H | queue file, dated section |
| 5 | `docs/engine/HANDOFF.md:6521` | `mainMenu` | H | handoff, dated section |
| 6 | `docs/engine/HANDOFF.md:7736` | `calcTreasuresBattleExp` | H | handoff, dated section |
| 7 | `docs/engine/PLAN-ROUND-35.md:81` | `hlib` | H | the plan quoting a claim to be checked |
| 8–10 | `docs/engine/PLAN-ROUND-35.md:143` | `buckSavedCharacter`, `loadGame`, `dosSong` | H | this task's own section, quoting all three |
| 11 | `docs/engine/research/ecl-census-reachability.md:194` | `walkEclReachable` | **L** | **NEW — see §4** |
| 12 | `docs/engine/research/gateway-vga-picture-format.md:1214` | `daxVgaPicture` | **L** | **NEW — see §4** |
| 13 | `docs/engine/research/hlib-glib-composites.md:185` | `hlib` | **T** | `packages/engine/src/loaders/hlib.ts:221` deliberately keeps composites out of `decodeHlib`, and the memo line restating that docblock is an intentional, still-true design statement |
| 14–15 | `m35-audit.md:250`, `m47-audit.md:327`, `m92-audit.md:308` | `database`, `AuthoredRace`, `AuthoredClass` | H | milestone audits, dated |

**4 live positives out of 15 fires → precision 0.267 for the null.** Guarded, the null drops to
5 fires (1, 2, 3, 11, 12 — plus 13) and still fires on the control.

### The prediction the measurement did not support

The plan predicted the guarded reading would yield **exactly the 4 live positives, 4/4**. It does
not. The **strict** resolver machine-resolves only **2 of the 4** — rows 2 and 3. Rows 11 and 12
are UNRESOLVED by the strict reading and were found only by hand-auditing the null's extra fires.

**P13's "guarded yields exactly 4" is PARTIAL.** The guard is real and the strict reading is
right to ship, but the claimed completeness is not there.

---

## 4. Two live stale claims found in files this round does not own

Both are reported, not fixed — file ownership was exclusive this phase.

**`docs/engine/research/ecl-census-reachability.md:194`** says `walkEclReachable`
(`packages/engine/src/ecl/reachability.ts`) is *"not yet wired into any UI route this round"*.
It is: `apps/web/src/ui/eclInspector.ts` imports it at line 37 and calls it at line 277
(`state.reach = walkEclReachable(state.raw, dialect);`), with an explanatory comment at 275.

**`docs/engine/research/gateway-vga-picture-format.md:1214`** says `daxVgaPicture.ts` *"is purely
additive and is not wired into `decodeDax`'s dispatch"*. It is:
`packages/engine/src/loaders/dax.ts` imports `parseVgaExtendedPicture` at line 17, calls it at
line 582, and sets `blk.kind = 'vga-ext-frame'` at 584; the kind is declared at line 109 and
documented at line 64.

Note what these two have in common: **neither is reachable by the strict resolver.** #11's target
is a parenthetical, not a path token; #12 names a *function* (`decodeDax`'s dispatch) rather than
a file. The measured recall limit is not an implementation detail — it is the shape of the
sentences people actually write.

---

## 5. Recall: 2 of 6

**Corrected 2026-09-05 (adversarial verification): this section's population used to be "Five
live stale claims" / "The three it misses", omitting `ecl-census-reachability.md:194` (row 11 of
§3's own table, and discussed in §4 above as a LIVE miss) from the count. Restated below with the
correct population of six and the fourth missed claim added.**

Six live stale claims were adjudicated by hand across the corpus. The strict resolver catches
two. The four it misses, and why:

| missed claim | reason |
|---|---|
| `apps/web/src/ui/supportClaims.json:98` — "The new decoder is not yet wired into the engine's index.ts" | **anaphoric subject.** "The new decoder" is not a code identifier, so no symbol resolves. |
| `docs/engine/research/ecl-census-reachability.md:194` — "`walkEclReachable` ... not yet wired into any UI route this round" | **target is a parenthetical, not a path token** (see §4). |
| `gateway-vga-picture-format.md:1214` | **target is a function, not a path.** |
| `docs/engine/research/amiga-glib-manifests.md:133` — "`firstGlibPalette()` (exported, unwired)" | **adjectival "unwired"**, outside the verb+preposition family the anchor matches. |

### The resolver fired on this memo

Worth recording because it is the cleanest available demonstration of the failure mode the task
was warned about. Writing §3's adjudication table — a table whose whole job is to **quote**
claims and label them true or false — produced a LIVE FALSIFIED fire on row 13. The resolver
cannot tell "X is not called by Y" *asserted* from "X is not called by Y" *quoted while being
adjudicated*; the correction guard covers the retraction phrasings this round's ledger edits
use, not the quotation phrasings a research memo uses.

That row was rephrased rather than guarded. Adding a marker that silences the gate would have
been a one-line change and a permanent escape hatch, and the value of the gate is that it is
hard to satisfy dishonestly. **A detector that fires on prose about prose is a known cost of
this design, not a bug that was fixed.**

**Recall 0.333 (2 of 6).** `tools/test_prose_wiring_claims.py`'s module docstring states this,
because reporting a gate as covering a family it covers a third of is the sort of claim this
repo keeps having to retract. `test_anaphoric_subject_is_unresolved_not_a_verdict` pins the limit
so it cannot be quietly forgotten: the anaphoric case must return `UNRESOLVED`, not a verdict in
either direction.

---

## 6. What was corrected, and the scope that had to survive the correction

Five sentences. Every one carries the **scope** of the wiring, because "wired" without scope
would be a second false claim replacing the first.

| file | what it said | what it says now |
|---|---|---|
| `tools/goldbox_capabilities.json:1177` | `buckSavedCharacter` "not yet wired" | wired at `index.ts:1134-1138`, `importBuckParty.ts:33/99`, `main.ts:2070` by `e156eec` — **into a display-only panel that deliberately never calls `createCharacter`** |
| `tools/goldbox_capabilities.json:1217` | "not yet called from" | same, same scope |
| `apps/web/src/ui/supportClaims.json:98` | "not yet wired into the engine's `index.ts` or any import UI" | same, same scope |
| `apps/web/src/ui/supportClaims.json:106` | "Matrix's manifest did not yet list the `.XMI` files" | it does — `apps/web/games/buck-rogers-matrix-cubed.json`, BUCKA/B/C.XMI, round 34 Phase B; the dashboard reads 21 songs / 5702 events / 95 channels |
| `docs/engine/research/amiga-glib-manifests.md:133` | "`firstGlibPalette()` (exported, unwired)" | unwired **when the memo was written**, wired since: `loadGame.ts:431` hands it to `decodeGlib` as the external `fallbackPalette`, `explore.ts:3702` calls it for the Amiga explore route |

The plan's must-decline-if was explicit that rewriting "not yet wired" to "wired" **without**
carrying the display-only / no-`createCharacter` scope would be a worse error than leaving the
stale sentence. It was not done.

---

## 7. The gate, and the proof it can fail

`tools/test_prose_wiring_claims.py::test_no_live_falsified_wiring_claims` — no LIVE current-state
sentence may say a symbol is unwired into a file that demonstrably names it. **Mutation-tested:**

```
$ git checkout HEAD -- tools/goldbox_capabilities.json && python -m pytest tools/test_prose_wiring_claims.py -q
FAILED ...::test_no_live_falsified_wiring_claims
  + ['tools/goldbox_capabilities.json:1177 buckSavedCharacter -> packages/engine/src/index.ts',
     'tools/goldbox_capabilities.json:1217 buckSavedCharacter -> packages/engine/src/index.ts']
1 failed, 6 passed in 3.67s
$ # restored
7 passed in 6.64s
```

The failure message says *"Do NOT silence this by deleting the sentence"*, because deleting is
the cheapest way to make it green and the one that destroys the information.

---

## 8. `evidence_date`: three ledgers behind their own contents

The plan asked whether three JSONs declare an `evidence_date` older than their last
value-bearing commit, and warned that **if those commits turned out to be whitespace-only the
finding evaporates**. Measured with `git show -w --numstat` (ignore-whitespace, so a reformat
does not count):

| file | declared | newest value-bearing commit | diff | what changed |
|---|---|---|---|---|
| `tools/goldbox_capabilities.json` | 2026-08-01 | `6cac69b` 2026-09-04 | +27/−23 | ledger rows |
| `tools/goldbox_corpus_routes.json` | 2026-08-01 | `93b7055` 2026-08-03 | +2/−2 | FRUA `browser_marker` / `electron_marker` |
| `tools/goldbox_campaign_matrix.json` | 2026-08-05 | `dc12cd1` 2026-08-07 | +2/−2 | DQK ending status `blocked` → `proven` |

**All 3/3 are behind, all three diffs are value-bearing, and one of them flips a campaign leg
from `blocked` to `proven`.** The null did not save the artifacts. **P13's third clause HOLDS.**

**The semantics, decided because nothing had decided them:** `evidence_date` is a **measurement
date** — the day that file's contents were last checked against the tree — not a charter
baseline. Dates were updated **by hand** (2026-09-05 / 2026-08-03 / 2026-08-07), never
auto-stamped from `git log`; auto-stamping would make the field mean "the last time anything was
committed", which is what it already accidentally meant. `tools/test_ledger_evidence_dates.py`
pins both halves: a git-free exact pin, and a git-derived "not behind your own contents" gate.

### An unplanned finding: the support page dates its prose by a file that did not write it

`tools/goldbox_corpus.py:1772` copies `route_payload["evidence_date"]` — the **routes** file —
into `apps/web/src/generated/support-evidence.json`. The deployed support page renders that as
*"Greybox support evidence as of X"* (`apps/web/src/ui/support.ts:203`). But every sentence of
prose on that page comes from `supportClaims.json` and `goldbox_capabilities.json`, whose dates
the page never shows. So the live site was showing "as of 2026-08-01" above ledger text last
measured 2026-09-04 — a date that was wrong about a file it was not even describing.

`support.ts:203` uses measurement framing ("as of"), which is correct under the chosen
semantics. **`support.ts:209` says "Generated evidence baseline {date}"**, which is baseline
framing and is now wrong. `support.ts` was not this round's to edit — see the handoff.

---

## 9. Export audits: the count was not the finding

`tools/engine_export_consumers.py` stripped comments before tokenizing but **not string
literals**, so a name mentioned in quoted UI copy or an error message read as a consumer. Fixed
(`_strip_string_literals`, applied *after* `_strip_comments` — order documented in the module,
because an apostrophe in prose would otherwise open a string that swallows real code).

**Predicted:** `KNOWN_UNCONSUMED` 751 → 754 by exactly `{renderWallView, TILE, C64}`, nothing
removed, with `DOS_EGA` and `SCREEN_WIDTH` as the control that must not move.
**Measured: exactly that. P13's tokenizer clause HOLDS.**

The plan also said, in its must-decline-if, that *"the count is 754 not 751"* is not the finding.
It isn't. The finding is what each of the three names turned out to be:

* **`renderWallView`** (`packages/engine/src/world/renderWallView.ts:83`) has no product caller,
  and neither does the already-pinned `renderWallViewIndexed`. The shipped `?explore=` viewport
  goes through `packages/engine/src/render/sky.ts:229 renderFirstPersonViewWithSky`, which calls
  `composeWallView` directly at `sky.ts:250`. The only callers of either are
  `renderWallView.test.ts`, `dungeonWallGraphicSet.test.ts`, `dungeonWallsAmiga.test.ts` and
  `dungeonWallsAmigaDok.test.ts`. **Decision: PIN.** Wiring it would be a visual regression;
  deleting it would delete the subject of the resolve-seam equivalence tests.
* **`TILE`** (`render/screen.ts:28`, the constant 8): its apparent consumers were quoted UI copy
  in `docs.ts:205/493` and `dqkExplore.ts`. **PIN.**
* **`C64`** (`render/displayScale.ts:49`): its apparent consumer was the string `platform: 'C64'`
  at `catalog.ts:140`. It is referenced only by `DISPLAY_PROFILES` (`displayScale.ts:58`), itself
  unconsumed, exactly like its sibling `AMIGA_PAL`. **PIN.**

The stale module-docstring bullet claiming comments and string literals "count as consumption"
was replaced with the corrected, measured statement.

### Two defects in `tools/sweep_engine_reach.py` (not this round's file — reported, pinned, not fixed)

**Defect 1 — `exported_names()` reads `index.ts` raw.** `strip_comments` exists in that same
module and is not applied. The comment at `index.ts:1122`

```
// offset 0xEB91 (Tribble, Elf, Half-Elf, Dwarf, Gnome, Halfling, Human, Monster).
```

sits inside an `export { … } from './loaders/secretSavedCharacter.js'` block. Splitting the block
on commas yields five parts that pass the identifier fullmatch — **`Elf`, `Dwarf`, `Gnome`,
`Halfling`, `Human`** — and the sweep reports all five as engine exports and buckets them
`unreferenced`. It invents five findings. In the other direction, a name on the line *after* a
comment is glued to that comment and vanishes: **`TIME_SCALES` (:270), `AFFECT_CHUNK_MINUTES`
(:287), `REST_TICKS_PER_HEAL` (:290), `SECRET_RACE_LABEL` (:1123)**. Two of those four are names
`engine_export_consumers` reports UNCONSUMED, so the sweep is **blind to real findings**, not
merely noisy.

The arithmetic closes exactly, which is how the diagnosis was confirmed rather than guessed:

```
1655 (engine_export_consumers)
  − 4  swallowed by comments
  − 2  declared inline in index.ts (decodeAsset, DecodedAsset) — a LEGITIMATE difference
  + 5  phantoms from comment prose
= 1654 (sweep_engine_reach)
```

**Defect 2 — `classify()` reads a build bundle as app source.** Its app globs exclude only paths
containing `/dist` or `node_modules`. The git-ignored Electron output lives at
`apps/electron/release/win-unpacked/resources/web-dist-app/assets/index-*.js`; the substring
there is `/web-dist-app`, not `/dist`. Measured: **`allowanceTenths` has no reference anywhere
under `apps/` except that minified bundle** (and `apps/web/dist-app/`, correctly excluded), yet
the sweep buckets it `app`. Moving `apps/electron/release/` out of the tree flips it to
`test-only`, which is what `engine_export_consumers` says. **Two audits, one truth, and the
tiebreak is whether someone happened to run a packaging build.**

### Full-audit disagreement

`KNOWN_UNCONSUMED − sweep(test-only ∪ unreferenced)` = 3: `AFFECT_CHUNK_MINUTES`,
`SECRET_RACE_LABEL` (both invisible to the sweep, defect 1) and `allowanceTenths` (defect 2).
`sweep − KNOWN_UNCONSUMED` = 14: the 5 phantoms plus 9 names consumed by `index.ts`'s own
`decodeAsset` body (`DaxArchive`, `IlbmImage`, `PoolAmigaArchive`, `decodeIlbm`,
`decodePoolAmiga`, `sniffDaa`, `sniffDax`, `sniffIlbm`, `sniffPoolAmiga`), which
`engine_export_consumers` counts and the sweep deliberately excludes. That last group is an
**intended** disagreement and is pinned as such.

### Why the standing gate is bounded

| operation | measured |
|---|---|
| `sweep_engine_reach.classify()` (full, 1654 names) | **92.6 s** |
| `classify(only={100 names})` | 6.7 s |
| `classify(only={the 27 controls})` | **2.0 s** |
| `classify(only={3 names})` | 1.0 s |
| `engine_export_consumers.unconsumed()` | 0.7 s |

`pnpm test:corpus` runs all of `tools/`, so `tools/test_export_audits_agree.py` uses a bounded
`only=` control set (2.0 s) plus a cheap barrel-surface reconciliation (~0.2 s). The full
754-name agreement is reported here, by hand, once — not re-derived on every run.

**Mutation-tested:** temporarily applying `strip_comments` inside `exported_names()` (i.e.
*fixing* defect 1) turned 3 of the 6 tests RED; restored, 6 pass. Hiding the Electron bundle
turned the defect-2 pin RED; moving `apps/electron/release/` entirely out of `apps/` flipped
`allowanceTenths` to `test-only` and the else-branch passed. Both restored, verified with
`git diff --stat` returning empty.

---

## 10. CLAUDE.md roadmap steps 4-5, restated

Two sentences in `CLAUDE.md` had outlived the tree by the same mechanism as the ledger rows.

**Step 4** ended `(Reading HLIB is the next concrete step.)` while `decodeHlib` already had
**13 consumers**, three of them app UI (`artmap.ts`, `dqkDemo.ts`, `dqkExplore.ts`). It is now
split, because its halves are in genuinely different states:

* **Reading: done and wired** — reachability, not just a passing decoder test.
* **Writing: implemented, round-trip tested, reached by no product route.**
  `hlibEncode.ts` emits header, pointer table, `TILE` colour table and Chain-4 chunks;
  `hlibEncode.test.ts` proves `decodeHlib(encode(x)) === x` against real-file goldens. But
  `encodeHlibTile`/`encodeHlibMaster` are used only by other engine modules, and the outermost
  of those — `amigaImageToHlibTile`, `amigaFramesToHlibTiles`, `buildAmigaArtOverride` — are in
  `KNOWN_UNCONSUMED` with **zero EXTERNAL consumers** (no other file imports them). **CORRECTED
  2026-09-05 (adversarial verification): this line, and step 5's line below, originally said
  `buildAmigaArtOverride` "is called by nothing" -- false, and false in a specific, instructive
  way.** `KNOWN_UNCONSUMED` is a cross-file import audit; it does not see a same-file caller.
  `buildAmigaArtOverride` (`packages/engine/src/loaders/dqkArtMap.ts:211`) IS called, by
  `buildPortableArtOverrides` in the same file, which `tools/build-dqk-dir.mts:367` calls, and
  that chain has actually run: commit `a3da70b` produced `build/cok-on-dqk-art/`,
  DOSBox-verified booting to CHAMPIONS OF KRYNN with lifted Amiga `BIGPIC.TLB`/`COMSPR.TLB`. So
  `KNOWN_UNCONSUMED`'s membership is a true statement about import edges, not a reachability
  fact -- **a token-matching consumer audit cannot see one level of indirection, so its output
  is not a reachability fact.** (Already corrected in `CLAUDE.md` itself by the integrator; this
  memo's own copy of the claim was the one still stale.)

The plan's must-decline-if said step 4 must **not** be struck as done on `hlibEncode.ts`
existing alone. It was not, and the restatement says so in as many words.

**Step 5** (Amiga art → HLIB `TILE`) is in the same shape: `amigaToHlib.ts` is written and
round-trip tested on real `BIGPIC1.DAA` art, and `buildAmigaArtOverride` — the function that
would actually produce an override — **is called**, via `buildPortableArtOverrides`
(`dqkArtMap.ts:211`), invoked from `tools/build-dqk-dir.mts:367`; commit `a3da70b` ran that
chain and produced `build/cok-on-dqk-art/`, DOSBox-verified. Amiga artwork has reached a rebuilt
game through this path. What remains a gap is coverage, not wiring: of ~15 DQK art containers
only `BIGPIC` and `COMSPR` auto-lift.

**"Planning only for now"** described the browser engine, which is live at
https://dionysus.dk/greybox/ with a standing e2e harness and 13 shipped game profiles. That
sentence contradicted `CLAUDE.md`'s own 2026-06-21 opening note *and* its own "Website build and
deployment" section, two screens apart, for months. Flipped, with the evidence inline.

### An ownership conflict, reported rather than resolved

The plan asked for a `ContradictionPair` in `tools/docs_numeric_claims.py` that fails if the
"next concrete step" sentence returns. **`docs_numeric_claims.py` was not in R6's
exclusive-write list**, and six agents shared this tree, so the equivalent guard was placed in
`tools/test_prose_wiring_claims.py::ClaudeMdRoadmapRestatement` instead. It asserts the same two
things, and its own marker window was narrowed from 300 to 120 characters **because a mutation
test caught the wide version accepting a re-assertion planted two lines under the correction**
(the real quotations sit 56 and 2 characters from their markers). Moving it to the plan's
preferred home is a Phase B decision.

Round 35's restatement also had to drop four raw test counts (`14 tests`, `20 tests`,
`40 tests`, `97 tests`) from `CLAUDE.md`: `docs_numeric_claims.generic_gap_scan` correctly
flagged them as live numeric claims with no curated pattern, and teaching it new patterns would
have meant editing that same unowned file. The citations survive; only the numbers went.

---

## 11. Files

| file | role |
|---|---|
| `tools/prose_wiring_claims.py` | the resolver, strict + loose readings, historical guard |
| `tools/test_prose_wiring_claims.py` | the gate (7 tests) + the control + the recall limit |
| `tools/test_ledger_evidence_dates.py` | evidence-date semantics, pinned two ways (4 tests) |
| `tools/engine_export_consumers.py` | `_strip_string_literals` added |
| `tools/test_engine_export_consumers.py` | `KNOWN_UNCONSUMED` 751 → 754, with the wire/delete/PIN reasoning recorded inline (13 tests) |
| `tools/test_export_audits_agree.py` | cross-audit reconciliation + the two sweep defects, pinned (6 tests) |

Sibling memo: `docs/engine/research/vitest-probe-audit.md`.
