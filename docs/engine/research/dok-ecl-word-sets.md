# Death Knights of Krynn's ECL word sets, read from DoK's own binary

Round 35, R1 · 2026-09-05 · `tools/map_gen1_ecl_dispatch.py --game dok`,
`packages/engine/src/ecl/disassemble.ts` (`ECL_GEN1_SHORT_DOK`)

## The gap this closes

DoK has had an ECL dispatch map since 2026-07-17 (`build/dok-ecl-dispatch-map.json`, produced by
`tools/map_dok_ecl_dispatch.py`). That map stops at *"opcode → handler file offset"*: it never
derived an operand-parser call target and never read a single handler prologue. So DoK was the only
Gen1 title whose ECL **operand counts** came from nothing but inheriting the shared `ECL_GEN1_SHORT`
literal — a literal three other titles (Pools, Gateway, Treasures) also inherit, and which was never
measured on DoK's bytes.

Round 34 Phase B left DoK with **29 deep desync sites** that opcode `0x41` did not explain, recorded
as "a scattered, separate gap", with block 33 offset `0x51b` (first byte `0x80`) named as
VM-reachable from cold. This round reads DoK's own handlers and closes all 29.

## Method and its controls

DoK's `GAME.OVR` (`FBOV`, 252,469 bytes) routed through the same structural pipeline
Pools/Gateway/Treasures use, matched against the CoAB oracle map:

| | offset | similarity | runner-up null | same-length null |
| --- | --- | --- | --- | --- |
| dispatcher | `0x3271` | **0.9763** | 0.2641 | 0.1388 |
| operand parser | `0x6ba8` | **1.0000** | 0.4796 | 0.4304 |

Operand-parser call target, named by DoK's own handlers: `lcall 0x41, 0x2a`, the first far call in
**45 of 66** dispatched handlers.

**Tooling control (the important one).** This pipeline reproduces **all 54** of the v1 map's
`handler_file_offset` values byte-for-byte, **0 disagreements** — an independent 2026-07-17 tool and
this round's structural match agree on where every handler lives. It also finds **12 more** opcodes
v1's linear-only reader missed (`0x04`–`0x06`, `0x11`, `0x16`–`0x1a`, `0x21`, `0x25`, `0x2f`,
recovered by the fallthrough-merge resolver), so DoK dispatches `0x00..0x41` with **no gap**, not 54
entries with 12 holes. The 54 offsets are inlined in
`tools/test_map_gen1_ecl_dispatch.py::DOK_V1_HANDLER_OFFSETS` rather than read from `build/`
(git-ignored), because a skip-if-absent control is a control that can pass without running.

**Prologue coverage:** 54/54 on the v1 set and **66/66** across every handler located, including all
12 new ones. (Plan predicted ≥ 40 of 54.) The resolver is not manufacturing mid-function offsets.

## The second operand reader, and its null

47 handlers declare their operand count through the familiar `mov al,N; push ax; lcall <parser>`
prefetch. The other 19 make no such call, and the prefetch reader leaves them `None`. This round adds
a second reader for them:

> A handler that never calls the operand parser still has to step the ECL program counter past its
> own opcode byte, and the compiler emits that as a bare `inc word ptr [PC]` at the top of the body.
> **No prefetch call AND `inc [PC]` ⇒ zero operands consumed.**

`[0x8c48]` is DoK's ECL PC and it is **derived, not assumed**: it is the plurality `inc word ptr
[imm]` target among no-prefetch handlers, **18 of 18, unanimous — no competing address at all**. Two
independent cross-checks:

* The same cell is `dec`'d by exactly the six count-driven opcodes `0x15`, `0x25`, `0x26`, `0x27`,
  `0x2b`, `0x31`, immediately before their second, register-argument prefetch — the same `dec [PC]`
  idiom `ECL_GEN2`'s docblock records at DQK's own `[0xb7f9]`.
* **The null: 0 of the 47 prefetch-measured handlers with N ≥ 1 also carries `inc [0x8c48]`.** Those
  two facts would be contradictory, so a single false positive would discard the whole result. Zero
  out of 47 possible ones. `zero_operand_by_pc_advance` computes this itself and `build_report`
  discards its output entirely if the list is non-empty; a synthetic mutation test constructs
  exactly such a contradictory handler and confirms the null fires.

**Coverage: 65 of 66.** 47 by prefetch + 18 by the PC idiom. The one remaining handler is `0x23`,
read by hand: it pushes four compiled-in message-window constants (1, 0x11, 0x26, 0x16), calls
`0x4e4:0xb6b`, then **tail-calls opcode `0x00`'s handler at `0x81d`** (which does the `inc [PC]`) —
the identical shape `ECL_GEN2`'s docblock records for DQK's `0x23`, fetching no operands.

## Three disagreements with the shared literal, each from a handler byte

| opcode | shared `ECL_GEN1_SHORT` | DoK's binary | handler | evidence |
| --- | --- | --- | --- | --- |
| `0x1f` | 2 | **1** | `0x2fbc` | `b0 01 50 9a 2a 00 41 00` at `0x2fc3` = `mov al,1; push ax; lcall 0x41,0x2a` |
| `0x27` TREASURE | 8 | **4, `countAt: 3`** | `0x2150` | `mov al,4` at `0x2156`; then a second prefetch after `dec word ptr [0x8c48]` whose count is operand 4's value |
| `0x29` | 14 | **0** | `0x30e6` | the whole body is `55 89 e5 ff 06 48 8c 5d cb` = `push bp; mov bp,sp; inc word ptr [0x8c48]; pop bp; retf` |

`0x27`'s `countAt: 3` is read from control flow, not chosen because the census liked it: the handler
reads operands 1/2/3 into three 32-bit accumulators at `[0xbe58]`/`[0xbe5c]`/`[0xbe60]` (the coin
piles), reads operand **4** into `[bp-1]`, `dec`s the PC, re-prefetches with `mov al,[bp-1]`, and
loops `1..[bp-0x47]` reading one more operand per iteration into a `0x11`-stride item table at
`ds:0xa2b9`.

`0x29`'s five-instruction body is **calibrated, not asserted**: it is the same shape as `0x24 COMBAT`
(`0x1f09`), `0x33` (`0x284a`), `0x3d CLEAR_BOX` (`0x2873`) and `0x3e` (`0x2ca4`) — four opcodes the
shared base table already reads as zero-operand.

## Three confirmations that were never actually verified on DoK's bytes

`0x0c` = 4 (`0xbac`, `mov al,4`), `0x2c` = 1 (`0x3095`, `mov al,1`), and the zero-operand trio `0x1d`
(`0x237c`) / `0x22` (`0x23bb`) / `0x23` (`0x3076`). All three land on the value the shared literal
already had. They are corroboration and worth nothing to the alternative, which is exactly why they
are listed separately from the three that moved.

`0x41` = 2 (`0x2e0e`, `mov al,2` at `0x2e15`) is **deliberately not overridden**: round 34 put
`0x41: {wordSet: 2}` into the shared base table, so DoK inherits the right value and an override
would be a free-agreement claim. DoK is nevertheless an eighth independent binary agreeing with it.

## Partition, and why `discriminating` is 0

`{discriminating: 0, free: 65, vacuous: 15, desync: 3}`. DoK's `CURRENT_DIALECTS` entry **is** the
plain shared literal, so `current` and `plain_short` are identical by construction and nothing can
land in `discriminating`. All three real findings land in `free` with `desync` set — precisely the
hidden-desync shape `partition_opcodes`'s broadened flag was widened to catch in round 32 R4.

## Corpus effect

| | `ECL_GEN1_SHORT` | `ECL_GEN1_SHORT_DOK` |
| --- | --- | --- |
| blocks | 25 | 25 |
| shallow desyncs | 1 | **0** |
| deep desync sites | 29 | **0** |
| misaligned targets | 202 | **2** |
| reachable bytes | 132,423 | **140,730** |

Residual desync sites: `[]`. Round 34's open finding — block 33 offset `0x51b`, first byte `0x80`,
VM-reachable from cold — is closed: from `searchLocation` with one `resume(0)`, `ECL_GEN1_SHORT`
halts with `bad opcode at 1307` (= `0x51b`) and `ECL_GEN1_SHORT_DOK` **exits**. Both sides pinned in
`dokEclDispatchRound35.test.ts`.

## Two honest nulls: the corpus did not decide two of the three corrections

1. **`0x1f` = 0 vs `0x1f` = 1.** Identical block, shallow-desync, deep-desync and misaligned-target
   counts — every quantity `CENSUS_PINS` records. They differ only in reachable bytes (136,538 vs
   140,730, +3.1%), and "maximise reachable bytes" is a weak tiebreak this repo has been wrong with
   before. **The handler byte decided it.** (The inherited 2 *is* separable: deep 20, misaligned 166.)
2. **`0x27` `countAt: 3` vs a flat `wordSet: 4`.** Identical deep-desync (0) and misaligned (2)
   counts; only reachable bytes differ, 140,730 vs 139,562 (0.8%). **The handler byte decided it.**
   (The inherited 8 *is* separable.)

`0x29` 14 → 0 is the one correction the corpus can also see on its own.

**The plan's own DoK null DID discriminate, and it discriminated against itself.** Sweeping the
`0x3c` / `0x28` alternatives over the DoK corpus, the best non-implicated improvement was 29 → 28 —
one site, far under the ≥ 10 threshold the plan set for treating it as a rival explanation.

## Findings that belong to titles this task does not own

The new PC-advance reader, run against the other Gen1 short titles, measures **`0x29` = 0 in Pools
(`0x275c`) and Treasures (`0x2fb6`) too**, against an inherited base value of 14. Pools' handler is
five instructions with no call of any kind; Treasures' has one far call to `0xa77:0x4df`, which is
**not** its operand parser (`0x58, 0x2a`) and carries no `mov al,N`, then `inc word ptr [0x7e22]`.
Both PC cells are unanimous (18/18) with clean nulls (0 false positives out of 47 / 50).

These are **reported, not fixed**: `ECL_GEN1_SHORT` is shared, three titles inherit it, and R1 owns
neither their dialect splits nor their tests. The pytest assertion that tracks the per-title desync
totals moved from `{pools: 1, gateway: 6, treasures: 6}` to `{pools: 2, gateway: 5, treasures: 6}`
and was adjudicated from the handlers, with the desync opcode **sets** now pinned alongside the
totals so a shuffle cannot hide inside an unchanged count (Treasures' 6 → 6 does exactly that:
it loses `0x41` and gains `0x29`).

## A round-34 claim this falsifies

`eclDesyncTriage.test.ts` recorded "DoK: 47 of 72 sites are first-byte `0x41`; the residual 25 are a
**separate, unclosed gap** (`0x80` and others)". Re-measured under DoK's own dialect, the pre-`0x41`
reconstruction gives **58 sites, 58 of them first-byte `0x41` — 100%, with no residue at all**.
There was never a second opcode gap: the residual 25 were DoK's own word-set drift walking the
decoder onto mid-instruction bytes. Consequently:

* The single test-local `0x41` override closes DoK outright (58 → 0), as it already did for CoK and
  Secret — so round 34's headline gains a third clean title while losing its one counterexample.
* Bar C's "CoK+DoK combined: exactly 2 of 105 desync sites are executed" becomes **1 of 91**. P3
  ("0 executed") is still falsified, but by CoK alone; DoK's hit at `0x51b` was an alignment
  artefact. Both measurements are kept side by side in the test file rather than overwritten.

## What is NOT claimed

* No opcode **semantics**. Every number here is an operand count and its decode-coverage
  consequence.
* DoK is **not** "closed" beyond what is measured: 1 handler of 66 (`0x23`) reaches neither
  automated reader and was read by hand; the residual deep-desync count is 0, but the two misaligned
  jump targets remain.
* `ECL_GEN1_SHORT` is **not** edited. `ECL_GEN1_SHORT_DOK` is a split, and until Phase B wires it,
  every DoK route in the app still decodes under the shared literal.
