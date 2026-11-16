# Standing audits — round 31, R5

Three standing audits, run against the real repo tree, each pinned as an exact set in a
test file so a future regression (or fix) goes red instead of being silently absorbed:

| # | Tool | Test | What it pins |
|---|------|------|---------------|
| 1 | `tools/engine_export_consumers.py` | `tools/test_engine_export_consumers.py` | `KNOWN_UNCONSUMED` — every `index.ts` export nothing outside its own module references |
| 2 | (same tool) | (same test) | `FORMAT_REACHABILITY` / `KNOWN_UNREACHABLE` — every `DecodedAsset.format`/catalog `kind` needs a producer + an e2e case |
| 3 | `tools/docs_numeric_claims.py` | additions (d)/(e) to `tools/test_docs_claims.py` | `KNOWN_STALE_CLAIMS` — numeric/status claims in the four `AUTHORITATIVE_DOCS` that no longer match the live repo |

**Measurement instant.** All numbers below were measured against commit `46ea719e`
("Give Buck Rogers a browser manifest, and list the four that were already there") plus an
actively dirty working tree: `git status --porcelain` showed 29 changed/new paths at
measurement time, including `packages/engine/src/index.ts`, several loader/test files, and
several new `docs/engine/research/*.md` notes — round 31's R1–R6 agents share this ONE
working copy (not separate worktrees), confirmed by watching `git diff` on `index.ts`
change between two of my own script runs. Per this task's "measure late" instruction, this
document was written *after* both tool files and both test files were finished and
green, as close to hand-off as practical. Anyone reading this later than a few hours after
2026-09-03 should re-run `python tools/engine_export_consumers.py` and
`python tools/docs_numeric_claims.py` before trusting the exact counts below — the *shape*
of the findings (a large unwired surface, full format reachability, three live stale
claims) is expected to be far more durable than the exact numbers.

---

## 1. `KNOWN_UNCONSUMED` — 692 names (plan predicted 16)

**The plan's estimate was off by more than 40x, and this was checked, not assumed.**
`docs/engine/PLAN-ROUND-31.md`'s R5 section predicted `KNOWN_UNCONSUMED = 16`: fourteen
`C64_PICTURE_*` constants, `addnd2eThac0`, `COK_WALL_PALETTE_BASE`. All 16 are present in
the measured set (`test_planned_prediction_examples_are_present` pins this explicitly) —
the plan was not *wrong* about those 16, it simply never generalized past its own
spot-check. Validation before trusting the much larger number:

- Definitely-wired exports (`decodeC64Picture`, `decodeAsset`, `loadGame`, `EclVm`,
  `Explorer`, `DialogueRunner`) all correctly report as consumed — rules out a blanket
  regex failure.
- The pre-existing, independently-built `tools/sweep_engine_reach.py` (a different
  bucketing scheme entirely) reports 338 test-only + 98 never-referenced VALUE exports on
  its own — a different metric, but the same order of magnitude via a completely
  different code path.
- 291 of the 692 are TYPE exports — a real, named blind spot (see §1.3): a TS type can be
  consumed via structural inference without its name ever appearing as literal text
  elsewhere, which a token-regex audit cannot see.

Per this task's explicit "yours wins if it differs, say why": the measured **692** stands
as this audit's answer, not the plan's 16.

### 1.1 Regex and its blind spots (as-implemented)

`tools/engine_export_consumers.py` parses `index.ts`'s `export {...} from '...'` /
`export type {...} from '...'` blocks (stripping full-line `//` comments before the
comma-split — an interior TS type literal uses `;`, not `,`, so this was safe from the
start; the actual bug during development was stripping comments *after* a comma-split
instead of before it) plus its two inline declarations (`DecodedAsset`, `decodeAsset`).
Consumer search is a whole-identifier token scan (`[A-Za-z_$][A-Za-z0-9_$]*`) over every
`.ts`/`.tsx` file under `apps/**`/`packages/**`, excluding `node_modules`, `dist*`,
`*.test.ts`/`*.test.tsx`, any path with a `test` path segment, `.d.ts`, the export's own
defining file, and (for every export except `decodeAsset`/`DecodedAsset`) `index.ts`'s own
barrel export/import lines specifically — `index.ts`'s *body* (where `decodeAsset` and
`DecodedAsset` live) is included, exactly as scoped.

Named blind spots (from the tool's own docstring, none currently known to hit anything in
`KNOWN_UNCONSUMED` — a future false-clean reading should be checked against this list by
hand before being trusted):

1. **String-keyed / dynamic access** (`obj['sniffHlib']`) — invisible to a bare identifier
   scan unless the string literal is spelled identically.
2. **Re-export under an alias elsewhere** — a second barrel re-exporting under a different
   name, or an aliased dynamic `import()` binding, is invisible unless the alias equals
   the original name.
3. **Comments/string literals** containing the bare identifier text count as "consumption"
   — a false-negative risk in the *other* direction (looks consumed, isn't really).
4. **TS structural typing** — a type consumed only via inference, never spelled as literal
   text, reads as unconsumed even though it is load-bearing. This inflates the TYPE half
   of the count specifically (see §1.3).

### 1.2 Tested-but-unshipped vs. truly dead

Of the 692: **326 are referenced by some `*.test.ts` file** (excluded from the main scan
by design, but checked separately here) — i.e. correct, exercised code with zero
application consumer. The remaining **366 appear nowhere at all**, including tests — dead
even by the most permissive reading.

### 1.3 By kind and by defining module

291 type exports / 401 value exports. The value exports cluster heavily by module — the
top 15 defining files account for 213 of the 401 unconsumed values:

| Defining module | Unconsumed values |
|---|---|
| `packages/engine/src/world/gatewayEcl6Controller.ts` | 24 |
| `packages/engine/src/combat/coabCombatMap.ts` | 23 |
| `packages/engine/src/loaders/c64Picture.ts` | 21 |
| `packages/engine/src/loaders/buildDqkDisk.ts` | 21 |
| `packages/engine/src/world/gameClock.ts` | 19 |
| `packages/engine/src/loaders/monsterSideTables.ts` | 16 |
| `packages/engine/src/loaders/area1.ts` | 16 |
| `packages/engine/src/module/frua/items.ts` | 15 |
| `packages/engine/src/module/frua/monsters.ts` | 14 |
| `packages/engine/src/loaders/dqkSave.ts` | 13 |
| `packages/engine/src/loaders/daxVgaPicture.ts` | 13 |
| `packages/engine/src/combat/tactical.ts` | 13 |
| `packages/engine/src/audio/glbr.ts` | 12 |
| `packages/engine/src/loaders/tiles8x8.ts` | 11 |
| `packages/engine/src/combat/terrain.ts` | 10 |

### 1.4 Recommendation

692 individually-justified verdicts is not a usable deliverable — the honest per-name
review that scale deserves is a Phase B triage pass, not a one-shot guess made without
running the actual call sites. What this audit *can* respsonsibly commit to is a
per-category disposition, plus explicit named exceptions:

- **The plan's 16 named examples** (`C64_PICTURE_*` ×14, `addnd2eThac0`,
  `COK_WALL_PALETTE_BASE`): **pin as public API / internal-but-load-bearing constants.**
  These describe fixed byte-layout offsets for the C64 picture format and a combat
  to-hit table; they read like the kind of constant a decoder module wants to expose even
  before a consumer needs it (contrast with a truly orphaned helper function). Recommend
  *leave exported*, do not delete.
- **The 326 tested-but-unshipped names**: recommend **wire, one module at a time**,
  starting with the heaviest clusters in §1.3 (`gatewayEcl6Controller.ts`,
  `coabCombatMap.ts`, `c64Picture.ts`, `buildDqkDisk.ts`) — a passing unit test plus zero
  application call sites is exactly the "solved but unwired" pattern memory
  `goldbox-solved-but-unwired` warns about, and a concentrated cluster under one module
  usually means one missing UI/pipeline wiring point, not 20 unrelated defects.
- **The 366 truly-dead names**: recommend **delete**, module by module, *after* confirming
  each is not a structural-typing false-unconsumed (§1.1 blind spot 4) — grep each name's
  usages inside its own defining file's neighbors first; a type used only as another
  exported type's structural shape is real, load-bearing API even with zero literal
  mentions elsewhere.
- **291 type exports**: recommend a **separate, lower-urgency pass** specifically for the
  structural-typing blind spot before deleting any of them — a type-checker-aware tool
  (e.g. TypeScript's own `--noUnusedLocals`/a project-wide reference count via the
  language service) would resolve this blind spot properly; a regex audit should not be
  the final word on a type's liveness.

Full 692-name set, with the tested-vs-dead split preserved in the audit's own token
search: `tools/test_engine_export_consumers.py`'s `KNOWN_UNCONSUMED` frozenset (exact,
machine-checked) is the source of truth; this document summarizes it rather than
duplicating it.

---

## 2. `FORMAT_REACHABILITY` — all 7 targets covered, `KNOWN_UNREACHABLE` is empty

The plan's prediction was two-sided: "`KNOWN_UNREACHABLE` is empty or one entry" (flagging
`glib`'s e2e assertion as possibly "a frame count only," i.e. weak). Measured result:
**empty**, and `glib`'s assertion is not weak — `gateway-amiga-walls` asserts
`minFrames=2384` against the real decoded GLIB archive frame count, a concrete decoded
value, not a placeholder.

| Target | Producer | Method | e2e case |
|---|---|---|---|
| `hlib` | `dqk-title` | byte-sniff | `dqk-title` |
| `glib` | `gateway-amiga-walls` | byte-sniff | `gateway-amiga-walls` (`minFrames=2384`) |
| `ilbm` | `cok-amiga-scrn1b` | byte-sniff | `cok-amiga-scrn1b` |
| `daa` | `cok-amiga-bigpic1` | byte-sniff | `cok-amiga-bigpic1` |
| `dax` | `cok-bigpic1` | byte-sniff | `cok-bigpic1` |
| `c64-picture` | `c64-cok-pic70` | explicit `kind:` | `c64-cok-pic70` |
| `dqk-save` | `dqk-savgama` | explicit `kind:` | `dqk-savgama` (`minFrames=6`) |

**Recommendation: no action needed.** Every `DecodedAsset` format the engine's own union
type declares, and every `catalog.ts` asset `kind`, has a real producer file whose bytes
sniff to it AND an e2e case asserting a concrete decoded value derived from it. This
closes the "solved but unwired" risk for the format-decoder layer specifically — the risk
memory `goldbox-solved-but-unwired` flags is fully mitigated for this surface today.

A caveat worth carrying forward, not a gap in this audit: `format_reachability()` has a
second-line fallback (a manifest whose `container` string names the format, used when no
local file byte-sniffs to it) — none of the 7 real targets needed it today, but it exists
and is exercised by `test_removing_ilbm_sniff_support_flips_only_that_row`'s planted
mutation, which also demonstrates that under `KNOWN_UNREACHABLE`'s own rule (`producer is
None or e2e_case is None`), losing byte-level ILBM detection would flip `ilbm` to
unreachable even though the manifest fallback still finds *a* producer — the fallback
finding something is not by itself proof of reachability if that something has no e2e
case.

---

## 3. Numeric/status claims in `AUTHORITATIVE_DOCS`

**Re-measured, not trusted from the task brief.** The task's own framing note said the
e2e suite is "now 175" and the tools suite "1299 passed / 1 skipped" — both already stale
by the time I measured: **e2e is 175** (confirmed, formula: 138 `runners` entries + 36
`CASES` rows + 1 `e2e-case-coverage` case — this held throughout the session even as other
numbers moved), but **the `tools/` pytest suite collects 1378** as of the final
measurement (it moved from ~1300 to 1353 to 1378 across the session purely from sibling
R1–R6 agents landing new test files on the shared tree — see the measurement-instant note
at the top of this document). Report this range, not a single frozen number, to whoever
reads this later.

| Claim key | Doc | Claimed | Resolved (this measurement) | Tolerance | Verdict |
|---|---|---|---|---|---|
| `claude_md_e2e_cases` | CLAUDE.md:291 | 164 | 175 | 5% | **STALE** |
| `claude_md_test_corpus` | CLAUDE.md:307 | 1193 | 1378 | 15% | FRESH (13.4% under — aging toward stale, re-measure soon) |
| `claude_md_amiga_extracted_cok` | CLAUDE.md:202 | 109 | 109 | exact | FRESH |
| `claude_md_amiga_extracted_dok` | CLAUDE.md:203 | 137 | 137 | exact | FRESH |
| `claude_md_c64_sides` | CLAUDE.md | 49 | 49 | exact | FRESH |
| `claude_md_c64_prg` | CLAUDE.md | 4426 | 4426 | exact | FRESH |
| `findings_md_amiga_extracted_cok` | docs/findings.md:113 | 109 | 109 | exact | FRESH |
| `findings_md_amiga_extracted_dok` | docs/findings.md:116 | 137 | 137 | exact | FRESH |
| `findings_md_test_corpus` | docs/findings.md:144 | 1101 | 1378 | 15% | **STALE** |
| `findings_md_c64_sides` | docs/findings.md | 49 | 49 | exact | FRESH |
| `findings_md_c64_prg` | docs/findings.md | 4426 | 4426 | exact | FRESH |
| `claude_md_disk3_status` | CLAUDE.md:203 vs :265 | — | — | — | **STALE (self-contradiction)** |

`KNOWN_STALE_CLAIMS = {claude_md_e2e_cases, findings_md_test_corpus,
claude_md_disk3_status}` — **3 stale claims**, not the plan's estimated 2. The plan's own
two examples (CLAUDE.md's e2e count and the Disk-3 contradiction, both flagged as "already
known stale, both moved before round 30 landed") are confirmed still live; the third,
`findings_md_test_corpus`, is a **new finding this audit made** that the plan explicitly
did not predict ("0 estimate" for findings.md/ROADMAP.md) — found by curating
`findings.md`'s *own* "~1,101 pinned tests" sentence rather than assuming only CLAUDE.md
carries stale counts.

`docs/engine/HANDOFF.md` and `docs/engine/ROADMAP.md` contributed **zero** stale/uncheckable
numeric claims: HANDOFF.md is effectively 100% dated-heading historical narration (64
known-noun hits, all HISTORICAL); ROADMAP.md's pre-`historical-log` content has 22
known-noun hits, all HISTORICAL once heading-hierarchy inheritance is applied (see the
worked bug in §3.2). The generic gap scanner (`generic_gap_scan()`) reports **zero**
UNCHECKABLE hits across all four docs as of this measurement — every registered-noun
numeric mention is accounted for by either a curated claim or a historical marker.

### 3.1 Corrected sentences for Phase B

This agent does not own `CLAUDE.md`/`docs/findings.md` and made no edits to them. The
exact corrected text, for whoever applies Phase B:

- **`CLAUDE.md:291`**, replace:
  > `` `pnpm --filter @goldbox/web e2e` runs the full browser harness (`apps/web/test/e2e.mjs`, 164 cases). ``

  with (re-measure the exact number at merge time — the formula is 138 `runners` Map
  entries + 36 `CASES` rows + 1 `e2e-case-coverage` case):
  > `` `pnpm --filter @goldbox/web e2e` runs the full browser harness (`apps/web/test/e2e.mjs`, 175 cases as of 2026-09-03 — re-measure via the `runners` Map entry count + `CASES` row count + 1). ``

- **`docs/findings.md:144`**, replace:
  > `` Format status (`docs/engine/research/c64-*.md`, decoders + ~1,101 pinned tests in `tools/`): ``

  with:
  > `` Format status (`docs/engine/research/c64-*.md`, decoders + tools/ pytest suite -- re-measure with `python -m pytest tools/ --collect-only -q`, ~1,378 as of 2026-09-03 and rising with round 31's concurrent Phase-A work):``

  (Recommend dropping the frozen number entirely in favor of the re-measure instruction —
  this exact sentence has now gone stale twice in the same project.)

- **`CLAUDE.md:203`** self-contradicts `CLAUDE.md:265`. Replace:
  > `` - `docs/amiga-inventory.md` — what was extracted from the Amiga ADFs (CoK 109 files, DoK 137; DQK-Amiga partial, Disk 3 unrecoverable — low priority). ``

  with:
  > `` - `docs/amiga-inventory.md` — what was extracted from the Amiga ADFs (CoK 109 files, DoK 137; DQK-Amiga now complete via the WHDLoad `DarkQueenOfKrynn` pack's Disk 3, see below — our own ADF extraction of Disk 3 remains unrecoverable, but that gap is closed). ``

### 3.2 Worked bug: heading-hierarchy inheritance for the HISTORICAL detector

Found while building `tools/docs_numeric_claims.py`, not part of the final defect list
above (fixed before this document was written; recorded because a future audit reusing
`DocIndex` will hit the same trap otherwise): a first version matched a numeric claim's
position against only the single *nearest* Markdown heading regardless of level, and
checked that one heading's text for a date/`historical` marker. `docs/engine/ROADMAP.md`
nests `### Wave-by-wave dispatch plan` (no date of its own) under `## Critical path to the
two end goals (2026-07-18)` (dated) three bullet-levels above three `(NNNN tests)`
mentions — the flat lookup found only the undated `###` subheading and reported all three
as live `UNCHECKABLE` claims. Fixed by walking the heading stack (pop ancestors at or above
the current level, inherit `historical` from whatever remains) so a dated ancestor
heading's status propagates to every undated descendant until a sibling-or-shallower
heading without its own marker resets it — verified by
`SyntheticHistoricalMarkerTests.test_a_subheading_inherits_its_dated_ancestor` (must stay
HISTORICAL) paired with
`SyntheticHistoricalMarkerTests.test_a_sibling_heading_without_a_date_does_not_inherit`
(must NOT over-inherit past the dated section's end) in
`tools/test_docs_claims.py`.

---

## 4. Mutations demonstrated

All four mutations named in the round-31 R5 brief are implemented as automated,
repeatable tests (not one-off manual demonstrations), and all currently pass:

| Mutation | Test |
|---|---|
| Scratch `export const zzzUnused` → set mismatch | `SyntheticUnconsumedDetectorTests.test_planted_unused_export_is_detected` |
| Remove `sniffIlbm` from a scratch `decodeAsset` → ILBM producer row flips | `SyntheticFormatReachabilityDetectorTests.test_removing_ilbm_sniff_support_flips_only_that_row` |
| Change "164" to the real count → claim flips STALE → FRESH (detect a fix, not only a break) | `SyntheticClaimDetectorTests.test_detects_a_fix_not_only_a_break` (and, for the unconsumed audit, `SyntheticUnconsumedDetectorTests.test_detects_a_fix_not_only_a_break`) |
| Fake HISTORICAL marker around a stale sentence → excluded and reported | `SyntheticHistoricalMarkerTests` (dated heading, strikethrough span, and the ancestor-inheritance/no-over-inheritance pair) |

---

## 5. Gates run

- `python -m pytest tools/test_docs_claims.py tools/test_engine_export_consumers.py -q` —
  **31 passed** (both new/extended files together, isolated from the rest of the suite).
- `python -m pytest tools/ --collect-only -q` — **1378 tests collected** (final
  measurement, this document's own new tests included; see the measurement-instant note
  at the top for why this number is a snapshot, not a constant).
- `pnpm test:corpus` and `pnpm -r exec tsc --noEmit` (full-repo gates): not run to
  completion inside this pass because they cover the whole shared tree that five other
  concurrent agents are actively editing (R3 on `index.ts`, R4/R6 on GLIB frame/manifest
  work per the background-task notices received during this session) — running them here
  would report on other agents' in-flight, uncommitted work rather than on the two files
  this task owns. This task's own two test files were validated directly (above) and pass
  in isolation; whoever integrates Phase B should run the full corpus gate once after all
  of round 31's agents land.
