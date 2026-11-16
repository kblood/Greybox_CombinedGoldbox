# ECL reachability census (R1, round 33)

`packages/engine/src/ecl/reachability.ts` (`walkEclReachable`) replaces the shallow,
first-`EXIT`-only linear scan (`disassembleSubroutine`/`disassembleEclBlock` in
`disassemble.ts`) with a worklist walk seeded from all five `EclHeader` far-pointer entry
points (`vmRun1`, `searchLocation`, `preCampCheck`, `campInterrupted`, `eclInitialEntry`),
following `GOTO`/`GOSUB`/`ON_GOTO`/`ON_GOSUB` and honouring the `IF_*` (0x16-0x1b) guard
rule from `EclVm.execIf` (vm.ts): the guarded instruction's own start is pushed as the
"taken" branch, and — unless a mutation-test option disables it — the offset right after
the guarded instruction is pushed too, as the "not-taken" branch, regardless of what
opcode the guarded instruction turns out to be. A jump target outside
`[headerLen, raw.length)`, or landing strictly inside an already-decoded instruction, is
recorded as **misaligned** and not followed. A bad opcode or truncated read is recorded as
a **desync site** with the jump-chain path that reached it. All five entries share one
worklist, decode cache and desync/misalignment registry, processed in ascending
byte-offset order — this is load-bearing, not an optimisation: a target from one entry
landing inside an instruction only a *different* entry's traversal decoded must still be
caught, and a single shared cache is what makes that comparison global (see
`eclReachability.test.ts`'s cross-entry unit test).

## Shared-file hazard (disclosed)

This item ran in the same working tree as R2's concurrent edits to `disassemble.ts`
(0x27/0x37 dispatch work). The Pools and Treasures numbers below **moved twice, upward,**
between successive test runs during this item purely because R2's file changed under me —
not because of any change to `reachability.ts` itself (confirmed: the file was
byte-identical across those runs; `disassemble.ts`'s own `git diff --stat` grew). The
numbers pinned in `eclReachability.test.ts` and quoted below are the values measured after
three consecutive identical runs (stability check), as of this session's `disassemble.ts`.
If a future change to that file moves them again, that is real information, not test
flakiness — re-measure and update the pin in the same commit.

## Oracle: `executed ⊆ reachable`

**Substitution disclosed** (the plan's own null must be measured, not inherited): the plan
says to reuse "the route fixtures" (`treasuresQuestFlag.test.ts` / `treasuresEndingRoute.test.ts`
and their Pools siblings), but those files build one hand-scripted route each and export
nothing reusable — importing their internals would mean editing files this item does not
own. The oracle instead drives a bare `EclVm` to completion (step budget 3000) from **all
five** header entry points, no scripted memory, across **every** block of each title's real
`ECL1.DAX`. This cannot reach memory-gated content deep inside a script, but it exercises
`search_location`'s own per-descriptor dispatch and `vmRun1`'s guard chains — code the
shallow walker never sees.

| Fixture | Blocks | Total executed | Executed-but-not-deep | Executed-but-not-shallow |
|---|---|---|---|---|
| Treasures ECL1.DAX | 30 | 2185 | **0** | 1966 |
| Pools ECL1.DAX | 56 | 3919 | **12** | 3131 |

Alternative named in the plan ("shallow already covers execution") predicts both
"executed-but-not-shallow" columns at 0. Measured: 1966 and 3131 — decisively refuted,
independent of the Pools finding below.

**P1 ("0 executed-but-unreached offsets on Pools/Treasures") is CONFIRMED for Treasures,
REFUTED for Pools — but not by a bug in the reachability walker.** All 12 Pools misses are
in ECL1.DAX blocks `#33` (6 offsets), `#51` (3) and `#80` (3), and every one immediately
follows a `0x27 TREASURE` site decoded under `ECL_GEN1_SHORT_POOLS`'s **un-overridden**
base frame (`wordSet: 8`, inherited from `KRYNN_GEN1_OPCODES`) — Pools carries no `0x27`
entry in its own `opcodeOverrides`, unlike Treasures' own `{wordSet: 4, countAt: 3}`. The
wide base frame decodes past the real instruction boundary and swallows the start of the
next real instruction (e.g. block 51's real `SAVE` at offset `0x61f`), so the walker
correctly refuses to follow that VM-executed offset, calling it "mid-instruction". This is
the exact `0x27`-frame-width problem `disassemble.ts`'s own docblock already discusses for
Pools and chose not to fix, because that analysis compared candidate frames only by
**shallow** desync count — which cannot see this: blocks `#33`/`#51`/`#80`'s own `0x27`
sites sit well past each block's first `EXIT`, invisible to the shallow walk entirely.

**Root-cause confirmation** (`eclReachability.test.ts`, TEST-LOCAL only, not shipped):
narrowing Pools' `0x27` to Treasures' own already-shipped `{wordSet: 4, countAt: 3}` frame
in a local dialect clone drops the Pools miss count from 12 to **0**. This is handed to R2
as an actionable, disclosed finding — not applied here (ownership boundary:
`disassemble.ts` is R2's file).

**Mutation control:** disabling the IF-guard fall-through rule
(`walkEclReachable(raw, dialect, { disableIfGuardFallthrough: true })`) on the Treasures
fixture raises the executed-but-unreached count from 0 to **898** — the rule is load-bearing,
not decorative.

## Positive control: the round-32 Treasures `0x37` falsification, reproduced

A TEST-LOCAL clone of `ECL_GEN1_SHORT_TREASURES` with `0x37 -> {wordSet: 2}` (the exact
override round 32 proposed and retracted — never shipped) is applied to all 30 Treasures
`ECL1.DAX` blocks:

| | Shallow (`disassembleEclBlock`) | Deep (`walkEclReachable`) |
|---|---|---|
| Desyncs across all 30 blocks (shallow) / desyncs among blocks `{19,33,38,40,51}` (deep) | 0/30 | **>=1** (blocks `#38`@`0x21b8`, `#40`@`0xcf5`, `#40`@`0xdaf`) |

Matches P2 exactly: deep flags a desync among the five named blocks the real VM actually
crashed on (`EclVm.rvalue`, "Cannot read properties of undefined (reading 'code')"); shallow
flags nothing, because none of those five blocks' `0x37` sites are reachable within a
first-EXIT scan. The alternative named in the plan ("shallow already sees this") predicts
0 either way — refuted for deep, confirmed for shallow.

**New finding, disclosed but not diagnosed:** even under the **shipped, unmodified**
`ECL_GEN1_SHORT_TREASURES` (0x37 left at its inherited base value 3, no override), the deep
walker finds two static desync sites — in block `#40` only, at `0xcf5` and `0xdaf`, both
reached via `searchLocation`'s `ON_GOTO` chain and both immediately following a decoded
`0x27 TREASURE` instruction's `:fallthrough` edge. This is **not** the `0x37` bug (0x37 is
never reached at either site; blocks 19/33/38/51 show 0). It resembles the same family of
`0x27`-frame problem found in Pools, but Treasures' `0x27` is *already* narrowed to
`{wordSet: 4, countAt: 3}` — so if this is the same root cause, it means at least one real
corpus site's count operand is memory-coded (`code` 1/2/3), contradicting the "0 of 8 sites
are memory-coded" claim the shallow census supported. Handed to R2 as-is; not root-caused
further this round (out of scope — `disassemble.ts` is not this item's file).

## Corpus census: shallow vs deep, every pinned dialect

Measured this session (see the shared-file hazard note above for Pools/Treasures):

| Title | Blocks | Shallow desync | Deep desync | Shallow reachable bytes | Deep reachable bytes |
|---|---|---|---|---|---|
| CoK | 22 | 0 | 33 | 9,568 | 122,344 |
| DoK | 25 | 1 | 72 | 6,171 | 129,868 |
| CoAB | 25 | 0 | 0 | 2,672 | 133,626 |
| PoR | 29 | 1 | 1 | 5,922 | 163,902 |
| Pools | 56 | 3 | 18 | 41,689 | 305,037 |
| Gateway | 26 | 0 | 0 | 8,439 | 143,465 |
| Treasures | 30 | 0 | 14 | 1,949 | 217,670 |
| Secret | 22 | 0 | 40 | 2,439 | 130,515 |
| NWN | 33 | 4 | 1 | 18,472 | 156,663 |
| Buck | 25 | 2 | 195 | 10,896 | 158,421 |
| Matrix | 33 | 3 | 452 | 10,710 | 217,569 |
| DQK (Gen2) | 47 | 2 | 0 | 98,586 | 428,278 |

P3 predictions: Buck desync 2 -> deep >=3 — **measured 195, far above the floor**. Matrix
desync 3 -> deep >=4 — **measured 452**. Deep reachable bytes >= 2x shallow on
Pools/Treasures — Pools 305,037 vs 41,689 (7.3x), Treasures 217,670 vs 1,949 (112x); both
comfortably clear the bar (Treasures' shallow walk barely leaves its header — the shallow
`eclInitialEntry` scan hits an early `EXIT` in nearly every block).

Alternative named per the plan ("shallow already covers execution") predicts
`deepDesync === shallowDesync` for every title. Measured instead: deep exceeds shallow in
8 of 12 titles (CoK 33 vs 0, DoK 72 vs 1, Secret 40 vs 0, Buck 195 vs 2, Matrix 452 vs 3,
Treasures 14 vs 0, Pools 18 vs 3, and — in the OTHER direction — NWN 1 vs 4, the one title
where the deep walker finds *fewer* desyncs, because its IF-guard/GOTO-chain routing steps
around a region the shallow first-EXIT scan desyncs into directly). DQK Gen2 is the other
direction too: deep 0 vs shallow 2 — the deep walker's cross-entry routing resolves both
sites the shallow walk calls bad opcodes.

New deep-only desync sites this census surfaces beyond the two already discussed above
(Pools' `0x27`-width gap, Treasures block 40): CoK (33), DoK (72), Secret (40), Buck (195)
and Matrix (452) desyncs are each large numbers relative to their shallow counts (0-3) —
these are not enumerated site-by-site here (out of this item's scope to root-cause each
one; the census's job is to make their existence and count visible, which the shallow
walker's near-zero counts hid entirely). They are candidate targets for a future item, not
claims this item resolves.

## Mutation tests (ground rule 6)

1. **IF-guard fall-through disabled**: `disableIfGuardFallthrough: true` on a synthetic
   fixture drops the not-taken offset from the reachable set (unit test), and on the
   Treasures corpus fixture raises executed-but-unreached from 0 to 898 (oracle test).
2. **ON_GOTO enumeration broken**: temporarily forced `count = 0` in the `ON_GOTO`/`ON_GOSUB`
   case (reverted before commit; `diff` against a pre-mutation backup confirmed byte-identical
   restoration). RED output on the synthetic ON_GOTO unit test:
   ```
   AssertionError: expected [ 22 ] to deeply equal [ 22, 40, 45 ]
   - Expected: [ 22, 40, 45 ]
   + Received: [ 22 ]
   ```
   Confirms the enumeration loop is load-bearing for that test.

## Intended Phase B patches (not applied — outside this item's ownership)

**`disassemble.ts` docblock additions** (for R2 or a future item to place near the
existing `0x27`/`0x37` notes):

> The shallow, first-EXIT-only census this file's own docblocks reason from is a proven
> LOWER BOUND, not a complete corpus view — round 33's deep walker
> (`packages/engine/src/ecl/reachability.ts`) finds 18 desync sites in Pools' ECL1.DAX
> (vs. this file's 3 shallow) and 14 in Treasures' (vs. 0 shallow), all invisible to a scan
> that stops at the first EXIT. Pools' un-overridden `0x27` base frame (`wordSet: 8`)
> produces 12 VM-executed-but-undecoded offsets across blocks #33/#51/#80 under the deep
> walker's oracle; narrowing it to this file's own Treasures frame
> (`{wordSet: 4, countAt: 3}`) resolves all 12 (test-local confirmation in
> `eclReachability.test.ts`, not shipped here). Separately, Treasures' OWN already-narrowed
> `0x27` frame still desyncs twice in block #40 (`0xcf5`, `0xdaf`), unrelated to `0x37`,
> reached only via `searchLocation`'s `ON_GOTO` chain — see
> `docs/engine/research/ecl-census-reachability.md`.

**Ledger `ecl` gap sentences** (for whichever capability ledger records ECL decode
coverage): "The Gen1 ECL disassembler's own first-EXIT census undercounts real code by a
factor of ~2x-112x depending on title (see ecl-census-reachability.md); a deep,
all-entry-point reachability walker (`packages/engine/src/ecl/reachability.ts`) is
available for future work needing a closer-to-complete view, and its VM oracle has
identified one confirmed opcode-width bug (Pools' un-overridden `0x27`) and one
undiagnosed one (Treasures block #40's `0x27` sites) beyond what the shallow census could
see."

**`docs.ts` `?ecl=` sentence** (wherever the engine's in-app docs describe ECL inspection
routes): "`walkEclReachable` (packages/engine/src/ecl/reachability.ts) offers a deeper,
all-entry-point reachability view than the block inspector's default first-EXIT
disassembly; not yet wired into any UI route this round — see
docs/engine/research/ecl-census-reachability.md for what it currently finds that the
inspector's own view does not."

## What could not be decided, and why

- The Treasures block #40 `0x27` desync (unlike Pools') is **not** conclusively
  root-caused: Treasures' own `0x27` frame is already the narrow one, so the same fix that
  cured Pools does not apply verbatim. A memory-coded count operand at this one site is the
  leading hypothesis but was not verified against the site's actual operand bytes/handler
  disassembly — that is `disassemble.ts` analysis work outside this item's ownership and
  file scope.
- CoK/DoK/Secret/Buck/Matrix's large deep-desync counts (33/72/40/195/452) are reported as
  totals with paths recorded per site in `walkEclReachable`'s own result, but were not
  individually triaged or root-caused this round — that would be its own item(s).
- Whether the design choice to NOT replicate the real VM's nonlocal-GOTO fallback (`inCode`
  fallthrough in `vm.ts`) ever causes a genuine `executed ⊄ reachable` violation was
  directly tested by the oracle (which exercises real nonlocal targets across two full
  corpora) and found **not** to bite on Pools/Treasures — the design choice stands as
  implemented, undisturbed by this finding.
