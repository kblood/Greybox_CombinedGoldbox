# DQK Combat Entrypoint CFG Scan

Date: 2026-07-13.

Purpose: separate real shipped DQK combat subroutines from combat branches that are actually reachable
through the live `vmRun1` / `SearchLocation` entrypoints.

## Method

The scan used current Greybox ECL decoding after the Gen2 `PARLAY` framing fix:

- `ECL_GEN2` header/base (`vbase = 0x8000`).
- `decodeInstructionAt(..., ECL_GEN2)` so `PARLAY 0x2c` uses the Gen2 short frame.
- A conservative local CFG walker:
  - follows `GOTO`;
  - follows `GOSUB` target and fallthrough;
  - follows every `ON_GOTO` / `ON_GOSUB` target;
  - follows both sides of `IF_*` by enqueueing the guarded instruction and the skip target.
- Dynamic confirmation used `EclVm.step()` with auto-answering prompts and fixed seed `0x1234`.

The temporary diagnostic file was removed after the findings below were copied here.

Per the combat-source-recovery goal, this note should be updated whenever the DQK combat-entry
understanding changes. If a later pass recovers a separate host selector, wandering-table source,
or Gen2-only encounter subsystem, add a focused research file for that subsystem and link it from
this note and `combat-system-source-recovery-goal.md`.

## Area 66 Result

Area 66 header:

- `vmRun1 = 0x8592`
- `SearchLocation = 0x8629`
- `eclInitialEntry = 0x8014`

The real SearchLocation opening decodes as:

```text
8629h  GOSUB 0x9f6f
862dh  SAVE #0, 0x0097
8633h  COMPARE 0x00a0, #255
8639h  IF_LT
863ah  ADD #1, 0x00a0, 0x00a0
8643h  COMPARE 0x00a9, #1
8649h  IF_LT
864ah  GOTO 0x8669
864eh  IF_EQ
864fh  GOTO 0x8e63
8653h  RANDOM #5, 0x00bf
8659h  COMPARE 0x00bf, #0
865fh  IF_EQ
8660h  SUBTRACT #1, 0x00a9, 0x00a9
8669h  AND #127, 0x002d, 0x009b
8672h  ON_GOTO 0x009b, #15,
       0x86ce, 0x88e7, 0x890d, 0x8933, 0x895c,
       0x89b5, 0x8cc6, 0x8dcb, 0x90e0, 0x90fd,
       0x8879, 0x88e2, 0x911a, 0x914c, 0x9d18
```

CFG result:

- SearchLocation reachable instruction count: 237.
- vmRun1 reachable instruction count: 35.
- Neither entrypoint reaches subroutine `0x8398`.
- A direct xref scan for `GOTO` / `GOSUB` / `ON_GOTO` / `ON_GOSUB` operands equal to `0x8398`
  found no reference.
- A raw word scan found no little-endian `98 83` target word in the area-66 block, so the missing
  edge is not just CFG pruning around an otherwise present branch target.

Implication: area 66 subroutine `0x8398` is a real shipped combat subroutine and remains useful as a
direct shipped-script combat proof, but it is not currently proven to be a normal live
`SearchLocation` cell branch. Prior notes that described `SearchLocation` dispatching directly to
`0x8398` were based on bad framing / over-broad scanning and are superseded.

## Shipped Area 66 Direct Combat Subroutine

The direct subroutine proof is still valid:

```text
8398h  LOAD_MONSTER #24, #4, #3
839fh  LOAD_MONSTER #36, #1, #3
83a6h  LOAD_MONSTER #24, #3, #3
83adh  LOAD_MONSTER #61, #2, #2
83b4h  LOAD_MONSTER #63, #4, #10
83bbh  SAVE #1, 0x001e
83c1h  PARLAY #35, c29:9, #0, 0x0022
83cbh  COMBAT
```

`packages/engine/test/dqkEvents.test.ts` verifies that real subroutine with `EclVm`: `run()` pauses
on PARLAY, `resume(0)` reaches `COMBAT`, and the queued roster is
`24x4, 36x1, 24x3, 61x2, 63x4`.

## Corrected Top-Level COMBAT Candidates

A follow-up read-only scan used the corrected Gen2 framing (`0x1d` zero-operand, `0x2c` four operands)
and ignored raw `0x24` byte hits that do not fall on decoded instruction boundaries. Best candidates:

| Area | COMBAT | Nearby setup | Current classification | Next trace |
|---:|---:|---|---|---|
| 5 | `0x91cf` (`member 5`, block `+0x11cf`, current `ECL.GLB` file `+0x006a2f`) | `LOAD_MONSTER #46,[0x00c2],#46`; later `LOAD_MONSTER #37,[0x00c2],#37`; native proof resolves actual group `0x2e x2` with logical `[0x00c2]=2` | Best natural live-route candidate; native CCECL/GBBOOT proof now pins combat-yield `GBRS pc=11D0` and post-combat resume `pc=11DC` | Re-run `native\gbdqk-combat-flow-test.ps1 -Headless` and `native\ccecl-dqk-combat-test.ps1 -Headless`; treat `[0x0023]`, `[0x0111]`, `[0x0112]`, `[0x00ca]`, `[0x00cb]`, `[0x00cc]`, and `[0x00c2]` as CCECL sparse keys, not original DGROUP watch offsets; original-runtime traces should watch stream PC/state around `0x91cf` plus confirmed DGROUP globals such as `[b1c7]`, `[b7f9]`, `[ae5c:ae5e]`, `[bedb:bedd]`, and `[ca03]` |
| 66 | `0x83cb` (`member 46`, block `+0x03cb`, current `ECL.GLB` file `+0x06c19f`) | Five immediate `LOAD_MONSTER` groups, then Gen2 `PARLAY` | Direct shipped subroutine / decoder regression; not live-entry reachable yet | Keep as `dqkEvents.test.ts` and `testDqkArea66ScriptedFight()` proof |
| 10 | `0x8633` | `SETUP_MONSTER #0,#255,#0`; `LOAD_MONSTER [0x00c0],[0x00c1],[0x00c0]`; attack text | Static/direct candidate; entry route unresolved | Trace around `0x85cb`; watch `[0x00c0]`, `[0x00c1]`, `[0x0019]`, `[0x009c]`, `[0x002e]` |
| 59 | `0x8a3c` (`member 39`, block `+0x0a3c`, current `ECL.GLB` file `+0x058e96`) | `PARTYSTRENGTH`; `SAVE #22,0x00bf`; table setup via `GOSUB 0xa92d`; `SURPRISE`; no nearby `LOAD_MONSTER` | Header-CFG reachable from `vmRun1=0x8201`, but local `GEO.GLB` has no map id 59 | Trace only after a natural route/source for map 59 is recovered, or use it as static top-level `0x24` handler candidate |
| 60 | `0x9b71` (`member 40`, block `+0x1b71`, current `ECL.GLB` file `+0x05cc09`) | `SAVE #35,0x00bf`; table setup via `GOSUB 0xa7f4`; `SURPRISE`; no nearby `LOAD_MONSTER` | Header-CFG reachable from `SearchLocation=0x8c01`, but local `GEO.GLB` has no map id 60 | Candidate route appears to involve descriptor `0x63`, `[0104] != 0`, and check/table index `35`; validate natural entry before runtime investment |
| 60 | `0xa267` | `SETUP_MONSTER ...,#35`; six immediate `LOAD_MONSTER` groups | Static/direct candidate; entry route unresolved | Validate live entry before runtime investment |
| 58 | `0x9967` (`member 38`, block `+0x1967`, current `ECL.GLB` file `+0x057137`) | `PICTURE #138`; `PARTY_SURPRISE`; `CLEARMONSTERS`; `SAVE #1,0x0014`; `COMBAT` | GEO-backed natural descriptor-162 temple/service gate; empty roster by design | Useful as original opcode/handler proof only after a real route reaches area 58; not a non-empty encounter proof |
| 58 | `0x9518` | `ENCOUNTER_MENU`; `LOAD_MONSTER #91,#1,#91` | Static/direct candidate, separate from natural descriptor-162 temple/service gate | Trace menu result path and action/destination values before `0x9511` |

`tools/dqk_ecl_combat_scan.py --show-context` now makes this boundary-vs-byte distinction
reproducible. On the current local retail archive it reports `3252` raw `0x24` bytes but only `35`
decoded entry-reachable `COMBAT` boundaries. The increase from the older `18` rows is intentional:
the scanner now mirrors CCECL's dynamic/nonlocal `GOTO` behavior. DQK uses operand forms such as
`GOTO cc0:0` after `SETUP_MONSTER`; CCECL falls through to the decoded operand-end offset for those
forms, so the static walker now follows that fallthrough instead of treating it as a hard terminal
branch. That correction brings area 5's dragon `0x91cf` path into the entry-reachable CFG without
changing the Palace/inline-string negative.

The scanner is still conservative in a different way: it starts at the five ECL header entries and
follows `GOTO`, `GOSUB`, `IF_*`, `ON_GOTO`, and `ON_GOSUB`; it therefore does not replace
direct-subroutine proofs such as area 66 `0x8398 -> 0x83cb`, but it is the right guard against
Palace-style inline-string false positives. It also has focused inspection mode:

```powershell
python tools\dqk_ecl_combat_scan.py --inspect-area 5 --inspect-vaddr 0x91cf --inspect-context 18
python tools\dqk_ecl_combat_scan.py --inspect-area 58 --inspect-vaddr 0x9967 --inspect-context 14
```

The scanner output now includes absolute HLIB member file offsets, which makes future binary trace
cross-checks less ambiguous:

```text
area=005 member=005 combat=91cfh offset=0x11cf file=0x006a2f
area=058 member=038 combat=9967h offset=0x1967 file=0x057137
area=059 member=039 combat=8a3ch offset=0x0a3c file=0x058e96
area=060 member=040 combat=9b71h offset=0x1b71 file=0x05cc09
```

Area 59/60 are important but not browser-walk candidates with the current local data. The local stock
`GEO.GLB` decoded ids remain
`2, 4, 10, 14, 18, 22, 24, 26, 30, 34, 38, 42, 46, 47, 50, 54, 58, 62, 63, 66`; ids 59 and 60 are
absent even though `ECL.GLB` contains those script areas. Therefore the 59/60 rows are top-level
`0x24`/handler candidates and static CFG evidence, not natural web walking proof until another map
source or transition explains those ids.

Area 59's likely selector split is `[00cb] = [002d] & 0x0f` and
`[00ca] = ([002d] & 0x70) / 16`; the promising path compares group/index `0x42` plus facing `1`
before saving index `22` to `[00bf]`. Area 60 uses the same split shape and a promising descriptor
`0x63` route through `[0104] != 0` and check/table index `35`. The older area-60 `0xa236..0xa267`
setup with six immediate `LOAD_MONSTER` calls remains direct/static; it was not header-CFG reachable
in the current scan.

Area 18 descriptor 157 and area 58 descriptor 162 remain natural GEO-backed `COMBAT` gates, but they
explicitly clear monsters and are temple/service dispatches. A 2026-07-13 original-runtime save-resume
probe patched generated `SAVGAMA.QSV` fixtures to area 18 and cell `(11,5)`, including both the
header mirror and documented flat-QSV resume block (`@1024..@1026`), solved the journal prompt, and
still produced zero top-level `0x24`, zero setup/render hits, and zero accepted combat-map rows; the
live stream stayed around loaded-save city/menu state `b7f9=0x82d0`.

> CORRECTION (R4, round 29): `(11,5)` is the pre-`dc12cd1` `(width, height)` reading of area 18's
> descriptor-157 cell (GEO.GLB member 5, corrected shape h=16 w=11). The unique raw-byte-157 cell is
> `(3,8)` under the corrected `(height, width)` decoder, not `(11,5)`. The QSV fixture's party
> position (`@36=11, @37=5`) therefore did not land on the descriptor-157 cell it was built to test
> -- so this probe's "zero ... combat-map rows" result does not (as stated) rule out area 18's
> natural descriptor-157 gate; it rules out an untested, different cell. See
> `docs/engine/research/dqk-geo-shape-audit.md`.

A follow-up area-58 descriptor-162 staged save-resume probe did the same with `@18=58`, header
position `@36/@37 = 17/15`, and flat pose bytes `@1024..@1026 = 17,15,3`. The QSV copy was verified in
original runtime (`rec+13=0x3a`, `rec+25=0x11`, `rec+26=0x0f`, `c9f0=0x11`, `c9f1=0x0f`,
`c9f2=0x03`), but the run still logged zero `ECL-OPCODE opcode=0x24`, zero setup/render hits, and
zero accepted combat-map rows; the only `[ca03]` row remained the Palanthas/menu context at
`b7f9=0x82d0`. Area 18/58 should therefore stay classified as special/non-monster dispatch evidence
until the real save-load map/pose transfer or a natural in-game route is recovered. Area 23 descriptor
90 remains useful for a `LOAD_MONSTER`-then-`EXIT` retention guard, but area 23 descriptor 18 is no
longer a combat consumer.

## Cross-Area CFG Candidates

Original conservative CFG scan over DQK `vmRun1` / `SearchLocation` entrypoints found these combat
candidates. Treat the table as a historical candidate list: the 2026-07-13 DQK `0x1d` correction below
reclassifies area 23 descriptor 18 from a combat handoff to a negative framing guard.

| Area | Slot | Reachable `LOAD_MONSTER` | Reachable `COMBAT` | Notes |
|---|---|---:|---:|---|
| 1 | vm/search | 0 | 2 | combat opcodes reachable, no decoded roster in CFG |
| 2 | vm | 1 | 1 | debug/setup arena candidate |
| 2 | search | 1 | 0 | load only from search CFG |
| 5 | vm/search | 0 | 2 | likely host/wandering table or empty roster without more state |
| 10 | search | 0 | 2 | combat opcodes reachable, no decoded roster in CFG |
| 18 | search | 0 | 2 | strength-gated combat candidates, no decoded roster in CFG |
| 23 | search | 1 | 1 | best current live-entry candidate; needs deeper host-state recovery |
| 40 | search | 0 | 1 | combat opcode reachable, no decoded roster in CFG |
| 58 | search | 0 | 1 | combat opcode reachable, no decoded roster in CFG |
| 60 | search | 0 | 1 | combat opcode reachable, no decoded roster in CFG |

Area 23 was dynamically swept through all descriptor bytes `0..255`, facings `0..3`, and cooldown
states `[0x0097]=0/1`; no non-empty roster was reached. Its CFG still includes `LOAD_MONSTER` at
`0xa981`, but the old `COMBAT` at `0x9cd2` was produced by stale Gen1-style `0x1d` framing and is not
a valid top-level DQK Gen2 combat boundary.

### Area 23 Correction After DQK `0x1d` Framing Fix

Descriptor `18` reaches `0x9c40` through the primary SearchLocation dispatch:

```text
8323h  AND 0x002d, #127, 0x009b
835fh  SUBTRACT #1, 0x009b, 0x00bf
8368h  ON_GOTO 0x00bf, #18, ..., 0x949e, 0x9c40
9c40h  PRINTCLEAR str[28]
9cceh  PARTYSTRENGTH
```

The earlier `PARTYSTRENGTH c18:128 ; IF_GE ; COMBAT` listing was a bad decode. DQK Gen2 runtime traces
prove opcode `0x1d` advances zero operands in the Palanthas/Palace route, and the same dialect rule makes
area 23 descriptor 18 end normally. `packages/engine/test/dqkEvents.test.ts` now guards this with two
checks: descriptor 18 returns `end`, and a descriptor-90 pending roster remains queued instead of being
consumed by false combat. Do not use area 23 descriptor 18 as either an empty-roster combat proof or a
cross-invocation handoff proof.

- Direct `0xa981` is a real `LOAD_MONSTER` subroutine:

```text
a981h  LOAD_MONSTER 0x0034, c35:3, 0x009b
a98ah  GOTO c154:0
a98dh  IF_EQ
a98eh  EXIT
a98fh  COMPARE 0x009b, #112
a995h  IF_GE
a996h  GOTO 0xac8f
a99ah  SUBTRACT #96, 0x009b, 0x00bf
a9a3h  ON_GOTO 0x00bf, #16, ...
```

When run directly with `[0x0034]=24`, `[0x009b]=96..111`, it queues a monster group before entering
one of the text branches. Current SearchLocation descriptor sweeps do not reach `0xa981`; the missing
piece is the branch/host-state path that sets up that selector.

Static predecessor-path scan from area 23 `SearchLocation` shows the `0xa981` loader is reachable only
through the high-bit selector branch, not through descriptor 18's primary `COMBAT` branch:

```text
8323h  AND 0x002d, #127, 0x009b
8337h  AND #64, 0x009b, 0x00bf
8346h  IF_NE
8347h  GOTO 0x9f27
9f27h  AND #32, 0x009b, 0x00bf
9f36h  IF_NE
9f3bh  AND #16, 0x009b, 0x00bf
9f4ah  IF_NE
9f4bh  GOTO 0xa894
a894h  AND 0x013a, #128, 0x00bf
a8a3h  IF_EQ
a8a5h  SUBTRACT #80, 0x009b, 0x00bf
a8aeh  ON_GOTO 0x00bf, #12, ..., 0xa952, 0xa979
a952h  SAVE #24, 0x0035
a958h  SAVE #14, 0x0034
a964h  IF_GE
a96eh  IF_LT
a978h  SURPRISE f:0, c22:1, c53:0, f:0
a981h  LOAD_MONSTER 0x0034, c35:3, 0x009b
```

The same CFG also has a separate path to text dispatches at `0xa9a3` / `0xac98` after comparing
`[0x009b]` against `[0x009a]` and `#112`.

Dynamic seed sweep still adds a useful host-contract clue: with `[0x013a] & 0x80` set, descriptors 89
and 90 execute `LOAD_MONSTER` and then `EXIT` without a local `COMBAT`:

```text
desc 89, [0x013a]=128 -> LOAD_MONSTER id=6,  count=3, pic=89  -> EXIT
desc 90, [0x013a]=128 -> LOAD_MONSTER id=14, count=3, pic=90  -> EXIT
```

Exact loader predicates:

```text
[0x009b] = [0x002d] & 0x7f
[0x009b] != 0
([0x009b] & 0x40) != 0    -> 0x9f27
([0x009b] & 0x20) == 0
([0x009b] & 0x10) != 0    -> 0xa894
([0x013a] & 0x80) != 0    -> otherwise 0xa8a4 EXIT
selector = [0x009b] - 0x50
selector 9  ([0x002d]&0x7f == 0x59) -> branch 0xa93f -> monster 6 x3, pic 0x59
selector 10 ([0x002d]&0x7f == 0x5a) -> branch 0xa952 -> monster 14 x3, pic 0x5a
```

High-bit descriptor aliases `0xd9` and `0xda` should behave the same after the initial `& 0x7f`
mask, assuming the host can supply them from the real cell descriptor source.

Because descriptor 18 no longer reaches `COMBAT`, area 23 is not a single-invocation
`LOAD_MONSTER ... COMBAT` path and is also not a proven cross-invocation combat handoff. Greybox still
models optional shared `encounterRoster` for scripts that do preserve monster groups across ECL
invocations, and the area-23 golden proves descriptor 90 can queue
`{ monsterId: 14, count: 3, picBlockId: 90 }` without immediately consuming it. The missing proof is a
real later DQK path that reaches top-level `COMBAT` and consumes that preserved roster.

The meaning and initializer for `[0x013a]` remain unresolved. A parallel address audit found only
`[0x0097]` is currently recovered as stable host state; `[0x009a]`, `[0x013a]`, `[0x0034]`, and
`[0x0035]` are observed script/runtime addresses without confirmed host semantics.

The local stock DQK `GEO.GLB` does not include logical map id 23. Its decoded GEO ids are
`2, 4, 10, 14, 18, 22, 24, 26, 30, 34, 38, 42, 46, 47, 50, 54, 58, 62, 63, 66`. That means the area
23 proof is currently an ECL-level forced-descriptor proof, not a live web walking proof. Current web
walking pairs the loaded GEO map id with the same ECL block id, so it cannot naturally seed area 23
cell descriptors unless another archive/disk source for map 23 is recovered.

Rechecked on 2026-07-13: `ECL.GLB` still contains area 23, the local `GEO.GLB` id table still does
not, `pnpm --filter @goldbox/engine test -- test/dqkEvents.test.ts` passes the forced
cross-invocation roster proof, and focused `$env:GB_E2E_ONLY='explore-dqk'; pnpm --filter @goldbox/web
e2e` passes the current browser DQK handoff tests without producing a browser natural non-empty
`vmRun1`/`SearchLocation` walk fixture.

Follow-up native evidence on 2026-07-13 changes the broader DQK status but not this browser/GEO boundary:
`docs/engine/research/dark-queen-of-krynn-dos-combat-flow.md` records
`native/gbdqk-combat-flow-test.ps1 -Headless`, where `GBBOOT /E /T 1 /A 5` performs a natural north step
from `(0,1)` to `(0,0)`, queues the area-5 dragon encounter (`0x002E x2`), writes combat sidecars, and
resumes native script state. Therefore DQK now has a native natural-step non-empty combat/resume proof;
the open issue here is specifically browser/live-GEO parity and the area-23 cross-invocation path.

A natural scan over the descriptors actually present in those loaded GEO maps found only two
SearchLocation combat gates under the currently recovered host state:

```text
area 18 descriptor 157 at cell 11,5 -> COMBAT with []
area 58 descriptor 162 at cell 17,15 -> COMBAT with []
```

No loaded-GEO descriptor produced a retained `LOAD_MONSTER` roster under the scanned host states
(`{}`, `[0x013a]=0x80`, `[0x0097]=0/1`, and `[0x013a]=0x80,[0x0097]=0`). A follow-up trace shows
these two natural gates are temple/service cells, not ordinary monster encounters:

```text
area 18 descriptor 157:
  "WELCOME TO THE TEMPLE OF MISLAXA."
  SAVE #14, [0x0039]
  PRINTCLEAR str[26]
  CLEARMONSTERS
  SAVE #1, [0x0014]
  COMBAT

area 58 descriptor 162:
  "WELCOME TO THE TEMPLE OF REORX. ARE YOU IN NEED OF HELP?"
  PARTY_SURPRISE c23:1, 0xac1c
  CLEARMONSTERS
  SAVE #1, [0x0014]
  COMBAT
```

This is the current local-data boundary: area 18/58 are natural walk-reachable `COMBAT` gates, but
they intentionally clear any pending monster roster immediately before the handoff. They are now
better evidence for a special host/temple/non-monster `COMBAT` dispatch (`[0x0014]`, `[0x0039]`,
picture 138, and related host state) than for a missing wandering-monster roster. Area 23 remains the
only current proof of the cross-invocation monster-roster contract, and that proof is still forced by
descriptor rather than live web walking.

## Current Browser/Open Target

The next promising browser/live-GEO path remains area 23 SearchLocation:

- first dispatch: `AND [0x002d], #383?` has already been corrected in the live decoder to the current
  operand framing; the decoded CFG includes several nested `ON_GOTO` tables;
- `LOAD_MONSTER 0x0034, c35:3, 0x009b` at `0xa981` on descriptors 89/90 when `[0x013a] & 0x80`;
- `PARTYSTRENGTH c18:128` then `COMBAT` at `0x9cd2` on descriptor 18;
- shared pending encounter roster across per-cell invocations is required for area 23 to become a
  non-empty combat.
- a natural walking fixture still requires finding the missing map/source that corresponds to ECL area
  23, finding the same cross-invocation monster pattern in one of the locally loaded GEO ids, or
  recovering the special host dispatch behind the natural temple/service `COMBAT` calls in areas 18/58.

Recovering the live-cell fixture requires identifying which host values feed addresses such as
`0x0034`, `0x009a`, `0x009b`, `0x00bf`, `0x013a`, encounter tickers, and any item/party predicates
along that path.
