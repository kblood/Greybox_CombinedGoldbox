# ECL opcode `0x27` TREASURE: the Gen2 operand frame, and why fixing the table alone is a regression

**Date:** 2026-09-10. **Status:** finding VERIFIED; engine change **APPLIED and
RUNTIME-CONFIRMED** in commit `0634e15`. See "Runtime confirmation" below.
**Scope of the change:** Gen2 (DQK) only, all areas. Gen1 CoK must not change.

## Summary

`native/src/ccecl.asm`'s shared `optab` carries `db 8,0xff ; 27 TREASURE` (line 6780
at the time of writing). For the **Gen2** dialect that frame is wrong: the correct
frame is **`wordSet = 4`, `countAt = 3`** — four fixed operands followed by a
variable-length tail whose length is given by operand index 3.

Two independent evidence classes agree. Neither is the TypeScript engine, for the
reason in "Why the sibling implementation is not a witness" below.

## Why this is not a "two implementations agree" finding

`native/src/ccecl.asm:6739` states in its own comment that the table
*"mirrors `packages/engine/src/ecl/opcodes.ts`"*. The TypeScript side has carried
`0x27: { wordSet: 4, countAt: 3 }` in `ECL_GEN2.opcodeOverrides`
(`packages/engine/src/ecl/disassemble.ts`) all along. So the native table copied the
Gen1 **base** entry and never copied the Gen2 **override**.

That makes the TS table worth **zero as corroboration of the value** — it is the
native table's ancestor, not an independent observer — but it precisely explains the
defect's shape, and it is a live instance of this repo's standing hazard: *format
specs port between the two tracks; code does not, and neither do override tables.*

The hackdocs are also not an oracle here, contrary to a premise in the task brief
that produced this work. `hackdocs_extracted/OPCODES.TXT` opens *"Op Codes used in
CKIT.EXE ... derived from the A86 assembler package"* — it lists **8086 machine
opcodes** for the FRUA construction kit, where `27` is `DAA` (decimal-adjust-AL).
`SCRIPT.TXT`'s "Give Treasure" / "Combat Treasure" are **GEO event types**, a
different numbering space. Neither documents ECL opcodes. This is the same
"check which title and subsystem the hackdoc describes" trap already recorded in
project memory.

## Evidence class 1: the retail handler's own operand prefetches

From `The Dark Queen of Krynn\DQK.EXE` (449,664 bytes). Verified **not** EXEPACK'd
before reading — `e_crlc = 2291` is nonzero and the word at `CS:0x10` is `ed 00`, not
`"RB"` — so these are unpacked bytes and no transform had to be inverted first.

- Dispatcher at file `0x032A3E`: `cmp ax,0x41 / jbe / mov bx,ax / shl bx,1 /
  jmp word ptr cs:[bx+0xd34]`, i.e. a direct-indexed table at file `0x032A54`.
  Structural self-check: `0x42` entries x 2 = `0x84` bytes, ending exactly at
  `2033:0DB8`, which is slot 0's own target. The `0x42` entry count is forced by the
  bytes rather than assumed.
- Slot `0x27` -> `0x0E8D` -> `lcall 1d99:12d3` -> `ljmp 25a4:2127` = file `0x0423E7`,
  which carries the Borland `55 8b ec` prologue.
- **wordSet:** file `0x0423ED` is `b0 04` (`mov al,4`), pushed to the operand
  accessor `2033:0013`. -> **4**.
- **variable tail:** file `0x04243B` is `ff 0e f9 b7` (`dec [0xb7f9]`, the ECL PC)
  then `ff 76 a9` (`push [bp-0x57]` — a *variable* argument, not an immediate).
  -> a count-driven tail exists.
- **which operand holds the count:** `[bp-0x57]` is written at exactly one site,
  file `0x04242F`: `mov al,4 / push ax / lcall 2033:0112 / mov [bp-0x57],al`, i.e.
  accessor index **4**. The index base was measured, not assumed: `2033:0013`
  initialises `mov si,1` and fills `[si-0x4deb]` for `si = 1..N`, so the arrays are
  **1-based**. Accessor index 4 = the 4th of 4 operands = 0-based **`countAt = 3`**.

### Calibration controls (the reason this is evidence and not a story)

Six opcodes whose frames both tables already agree on were derived by the same
method:

| opcode | agreed frame | derived from bytes | |
|---|---|---|---|
| `0x04` ADD | 3 | `b0 03` -> 3 | PASS |
| `0x14` COMPARE_AND | 4 | `b0 04` -> 4 | PASS |
| `0x2e` DAMAGE | 5 | `b0 05` -> 5 | PASS |
| `0x25` ON_GOTO | 2, countAt 1 | accessor index 2 -> countAt 1 | PASS |
| `0x15` VERTICAL_MENU | 3, countAt 2 | accessor index 3 -> countAt 2 | PASS |
| `0x2b` HORIZONTAL_MENU | 2, countAt 1 | accessor index 2 -> countAt 1 | PASS |

`0x25` ON_GOTO is the decisive calibrator: it fixes `countAt = accessorIndex - 1`
empirically and lands on the agreed **1**, not 2. The same rule gives `0x27` -> **3**.

**Null on the detector.** Across all `0x42` handler spans there are **47**
`call 2033:0013` sites preceded by an *immediate* push and **exactly 6** preceded by
a non-immediate push: `0x15, 0x25, 0x26, 0x27, 0x2b, 0x31`. No extras, no misses —
the variable-tail idiom is 6 of 53 call sites, so the detector is not something that
fires everywhere.

**RE-MEASURED 2026-09-10 BY A SECOND, INDEPENDENT WALKER -- read the counts below as a
FLOOR.** A separate walk of the same 47 members, enqueueing successors more
aggressively (both arms of every `IF_*`, all resolvable `ON_GOTO`/`ON_GOSUB` targets
plus fall-through, and `GOSUB` body *and* return continuation), finds **116** `0x27`
sites over **30** areas with **363** tail words, against this document's 43 / 17 / 317.

**Every checkable overlap says the larger set CONTAINS this one**, so the two agree in
direction and differ in reach: the 17 areas are a strict subset of the 30; the six
descending-run lengths are exactly the same six; config D's "5 fewer sites than B"
reproduces exactly (116 vs 111); the config-D `EXIT` check reproduces at the larger
denominator (**59/59** nonzero-count sites, vs 30/30 here); and four buckets of the
following-opcode histogram match to the unit while every other bucket is >=. Four
reduced-successor variants were tried and none reproduces 43/17 (they undershoot to 8,
12, 30 and 1 sites), so this document's exact successor rule could not be reconstructed.
**Quote 116 / 30 / 363 under the rule stated above, or 43 / 17 / 317 as a conservative
floor -- but never one as a correction of the other, and never either without its rule.**

**One factual error in this document, found by that walk and corrected here.** The
"six descending item-list runs" were described below as being "in **areas 1 and 48**".
They are **all six in area 1**, at block offsets `0x15e6, 0x165a, 0x16a8, 0x16f8, 0x1748,
0x179a`. Area 48's only tail with count >= 3 is 64 words at `0x15a7` and is **not**
descending (`0x0c, 0x26, 0x03, 0x0c, 0x20, ...`). The point that sentence was making --
*not area 5*, therefore do not area-gate -- is unaffected.

**Independent agreement on that set of six:** `disassemble.ts:231` documents exactly
the same six opcodes as the count-driven ones, derived on the TypeScript side by a
different route. That is a genuine cross-check of the *detector*, even though the TS
table is not a witness to the *value*.

## Evidence class 2: corpus decode, both framings

A from-scratch control-flow walker over **all 47 `ECL.GLB` members**, BFS from all 5
header entries, varying **only** `0x27` and holding every other Gen2 override fixed:

| framing | instructions reached | halts | `0x27` sites |
|---|---|---|---|
| A `(8, 0xFF)` — native today | 20,335 | **13** | 38 |
| **B `(4, 3)`** — the claim | **20,620** | **0** | **43** |
| C `(8, 3)` | 20,296 | 11 | 38 |
| D `(4, none)` | 20,328 | **0** | 38 |
| E `(3, 2)` | 20,298 | 8 | 36 |
| F `(5, 3)` | 20,321 | 12 | 38 |
| G `(2, 1)` | 20,257 | 7 | 34 |

**Halt attribution.** All 13 halts under A fall in 10 members, every one of which
contains a `0x27` site, and all 13 vanish under B.

**The alternative that nearly fooled the experiment, recorded because it is the
useful part.** Config D `(4, none)` also scores **0 halts** — so "0 halts" alone does
not discriminate. D scores 0 by *silently stopping*: **30 of 30** `0x27` sites with a
nonzero count have an `EXIT`/`RETURN`/`NEWECL` byte at D's next-offset, because the
first byte of an operand-encoded word is `00` = EXIT. D reaches 285 fewer
instructions and 5 fewer `0x27` sites than B. This is the "a probe that passes by not
running" shape, and it is the only competitor that survives the halt metric.

**What separates B from everything else: the tail is self-describing.** Under
`(4,3)`, `args[3]` predicts the tail length, and the tails are item lists.

- 317 of 317 tail words are `< 0x100` (item-id shaped). Null at random offsets: 86.6%.
- Of the 10 tails with count >= 3, **6 are fully strictly-descending runs**, of
  lengths 49, 30, 31, 31, 32, 47 — e.g. `count=0x31` followed by exactly
  `0x31, 0x30, 0x2F ... 0x02, 0x01`.
- **Null:** at random offsets with count >= 20 in the same corpus, **8 of 46,115**
  samples (0.017%) produce a fully-descending tail. The real data is 6 of 6. A
  49-long descending run terminating exactly where `args[3]` says it ends is not
  something a wrong frame manufactures.

**Opcode histogram of the instruction following the `(4,3)` frame**, over all 43
sites: `0x02 GOSUB x8, 0x03 COMPARE x6, 0x09 SAVE x1, 0x13 RETURN x2, 0x16 IF_EQ x1,
0x19 IF_GT x2, 0x24 COMBAT x13, 0x2C PARLAY x10`. All valid, and TREASURE->COMBAT /
TREASURE->PARLAY adjacency is semantically apt.

**A test that did NOT discriminate, reported as such.** A confluence test (is the
computed next-offset independently reachable by a walk that never decodes through the
`0x27` site?) returned 0/43 for B and 2/43 for A. These sites are reached almost
exclusively by linear fall-through, so no independent path exists to confirm either
framing. The test is uninformative here; it is **not** evidence for A.

## Scope: Gen2-wide, not area-5

The 43 Gen2 `0x27` sites span **17 areas**: 1, 5, 14, 15, 16, 22, 28, 35, 36, 42, 43,
48, 49, 51, 52, 61, 64. `(4,3)` gives 0 halts across all of them, and the six
descending item-list runs are in **areas 1 and 48**, *not* area 5. Placing an
area-specific gate around this arm would therefore be wrong.

**Gen1 CoK keeps `(8, 0xFF)` — measured, not assumed.** Over CoK `ECL1-3.DAX`
(22 ECL blocks):

| CoK framing | instructions | halts | `0x27` sites |
|---|---|---|---|
| `(8, 0xFF)` | 7,744 | **0** | 22 |
| `(4, 3)` | 7,605 | **1** | 20 |

The shape agrees: **21 of 22** CoK sites have `args[3] == 0`, so `(4,3)` would give an
empty tail and discard four real fields, and the 8th word takes values
`{16, 32, 33, 35, 37, 38, 39, 51, 52, 53, 67, 68, 80, 97, 130, 255}` — item ids with
`255` = none, the classic Gen1 coins-then-item frame.

**Gen1 DoK is INCONCLUSIVE and no change is proposed there.** DoK scores 15 halts
under `(8,0xFF)` and 11 under `(4,3)` over 25 blocks. Neither is clean, which reads as
a limitation of the Gen1 walker rather than a finding about DoK. Do not cite these DoK
numbers as an argument for anything.

## The change is TWO parts. The table alone is a regression.

### Part 1 — `get_operand_meta`, and `DH` is load-bearing

Add the arm to the **`is_gen2` branch beside the existing `0x21` arm**, before the
Gen1-only `.maybe_dok` branch:

```nasm
        cmp     byte [is_gen2], 0
        je      .maybe_dok
        cmp     al, 21h
        je      .two
        cmp     al, 27h                 ; <-- new
        je      .gen2_treasure          ; <-- new
.gen2_treasure:                         ; <-- new
        mov     dl, 4                   ; four fixed operands
        mov     dh, 3                   ; count at operand index 3
        jmp     .done
```

**Every existing override arm (`.zero`, `.one`, `.two`, `.four`) sets only `DL`** and
inherits `DH` from the base table. The base has `0x27 -> DH = 0xFF`, the no-tail
sentinel, so a `DL`-only arm would produce `(4, 0xFF)` — exactly config **D** above,
which lands on a spurious `EXIT` at 30 of 30 nonzero-count sites. `mov dh, 3` is not
optional and the existing arms are not a usable template.

### Part 2 — `op_script_effect` must consume the tail

`0x27` dispatches to `op_script_effect`. That routine calls `get_operand_meta` and
takes **`DL` only** (`movzx ax, dl ; dialect-adjusted fixed operand count`), reads
that many operands, then does `mov ax,[opp] / mov [pc],ax`. **It never consumes the
count-driven tail.** `count_extra` exists only inside `skip_operands_generic`, i.e.
the *skip* path.

So a table-only change fixes skipping and breaks execution: corpus-wide, **317
operand words** (tails up to 49 items) would be executed as instructions, starting
with an immediate `EXIT` at 30 of 30 nonzero-count sites. Note also that
`op_script_effect`'s own `.skip` arm (taken when `SCRIPTCAP` is full) calls
`skip_operands_of_cur` and *would* consume the tail — so the two arms would silently
diverge, which is worse than either being uniformly wrong.

`packages/engine`'s `vm.ts` `case 0x27` already models both readings and is the
behavioural reference.

## `GBEC groups=0001` is NOT a general signature of this bug

A prior report argued that a dropped monster group makes `GBEC groups=0001` the
bug's signature. **The mechanism is real but the framing is wrong, and it is
path-dependent.**

The mechanism: `op_if` on a false flag calls `skip_one_instruction` ->
`skip_operands_generic` -> `get_operand_meta`, so a wrong `wordSet` moves the skip
target. At block offset `0x11A4` in ECL.GLB member 5 (area 5), `(8,0xFF)` makes the
instruction 18 bytes and the next PC `0x11B6` instead of `0x11AD`, swallowing
`IF_GT; LOAD_MONSTER 0034, mem[0x00C1], 0034`. The swallowed bytes are the structural
twin of the pair immediately after them — same `IF_GT; LOAD_MONSTER <id>,
mem[0xC1/0xC2], <id>` shape, differing only in monster id and memory slot. The wrong
frame eats exactly one of a matched pair.

**But on the path the repo's own pinned needle describes, both framings converge.**
There, `IF_EQ` at `0x11A3` is true (TREASURE executes) and `IF_GT` is false at both
`0x11AD` and `0x11B6`, so correct and buggy framings both arrive at `0x11BF` and both
emit `groups=0001` — which is the genuinely correct answer on that path. `groups=0001`
is diagnostic **only** when the guard flag selects the GT arm. Do not use it as an
acceptance bar without pinning which comparison arm the run took.

**An independent way to tell a real 1-group encounter from a truncated 2-group one:**
compare the `GBEC`/`MONSTER` record against the memory dump. On the GT path both
`mem[0xC1]` and `mem[0xC2]` hold nonzero counts and the encounter should carry two
records; a genuine single-group encounter has only the one memory slot its taken
branch wrote. That asymmetry is present in `native/build/DQK5E5S.TXT` today (`C1=6`,
`C2=4`, one group emitted).

## Expected fallout, and how NOT to fix it

`native/ccecl-dqk-vmrun-test.ps1` pins
`#04 OP=27 TREASURE ARGC=08 ARGS= 0064 0001 0000 0000 000B 0034 0003 0034`.

**PREDICTION WITHDRAWN 2026-09-10, by the measurement it was written to anticipate.**
This paragraph continued: "`ARGC` is printed from `DL`, so after the fix this becomes
`ARGC=04 ARGS= 0064 0001 0000 0000`." That is **wrong**, and it is wrong in the way this
document had already warned about two sentences later. There is **no `OP=27` record in
that dump at all** -- not before the fix and not after it. TREASURE is *skipped* on this
route, not executed, so the needle never described a stale `ARGC`; it described an
instruction the path does not reach. Substituting the predicted line would have produced
a needle that can never match, and it would have looked like a careful frame-aware repair.

The needle was replaced with the four script records the route actually produces
(`PRINTCLEAR`, `PRINT`, `PARTYSTRENGTH`, `PARLAY`) plus the monster/memory-slot
correspondence. **The instruction to re-derive from a fresh run was the load-bearing part
of this section, and the prediction beside it was the trap** -- keep them in that order.

**That needle is already stale for a second, independent reason**, and this is worth
carrying: the on-disk artifact `native/build/DQK5E5S.TXT` contains **no
`#04 OP=27 TREASURE` record at all**. It records `GBEC groups=0001`,
`@00 MONSTER id=0025 count=0004`, `GBSX count=0004` and a four-record trace ending in
PARLAY — i.e. a run in which `IF_EQ` at `0x11A3` was false and TREASURE was skipped
rather than executed. The script is one of the currently-red flow scripts, and its
needles describe a path the artifact did not take.

So the needle must be **re-derived from a fresh run after the engine change**, not
hand-edited to match a prediction. Per round 37's C3 precedent, assert the frame
against the payload that justifies it rather than swapping a literal.

## The count operand is an immediate, so raw vs resolved cannot diverge

`read_opp` stores the operand *address* in `[o_word]` for a memory reference while
`opp_rvalue` dereferences it, so "which one drives the tail length" was a real fork:
`skip_operands_generic` uses raw `[o_word]`, and a mismatched choice in
`op_script_effect` would recreate the very skip/execute divergence this fix exists to
remove. **Measured, not argued: operand index 3 is code `0x00` (immediate) at 116 of 116
reachable Gen2 `0x27` sites.** Raw equals resolved, and the raw-`[o_word]` implementation
is correct on every site in the corpus. All **363** tail operands are code `0x00` as well.

**The null is what makes this a finding rather than a frequency artifact.** Code `0x00`
is *not* the common case: over all 53,597 operands decoded in the reachable corpus the
plurality is code `0x01` (a deref) at **50.41%**, with `0x00` at **31.86%** and `0x80` at
15.82%. Under an iid null, 116/116 immediates is p ~ 2.4e-58. An exhaustive linear scan of
every `0x27` byte anywhere in the 47 members -- 467 positions, mostly not instructions --
finds code `0x00` at index 3 only **28.9%** of the time and a deref code **11.3%** of the
time. A deref at index 3 appears **only** in that linear null, i.e. only where the walk
says there is no instruction.

**Unobserved is not impossible.** If a deref ever did appear at index 3, raw `[o_word]`
would be a full 16-bit address used as a tail length (up to 65535) and `read_opp` would
run off the block. The data does not currently require a clamp on
`fx_count_extra`/`count_extra`, and adding one to only the execute path would reintroduce
the asymmetry -- so if it is ever added, add it to both paths.

## Historical Gen2 framing gap — now closed

At the time `0x27` was corrected, the same walker, holding `0x27` at `(4,3)`,
reported the following pre-propagation snapshot:

| dialect | halts | instructions reached | `0x27` sites | areas |
|---|---|---|---|---|
| `get_operand_meta`'s Gen2 arm as written | **529** | 22,097 | 31 | 12 |
| complete Gen2 (TS `ECL_GEN2`) | **0** | 44,894 | 116 | 30 |

The later propagation made `0x0c -> 4`, `0x1d -> 0`, `0x22 -> 0`,
`0x23 -> 0`, and `0x2c -> 1` Gen2-wide, joining the already aligned
`0x1f -> 1`, `0x21 -> 2`, `0x27 -> (4,3)`, `0x29 -> 0`, `0x31 -> (2,1)`,
`0x37 -> 2`, and `0x41 -> 2` frames. No Gen2 frame is now area-gated.
`0x37` and `0x41` remain host effects pending evidence for their title-specific state effects;
their proven framing is nevertheless consumed.

This is the standing cross-track hazard in its usual shape: **format specs port between
the two tracks, code does not, and neither do override tables.** `0x27` was one entry of
a table native copied only the Gen1 half of. Treat the figures above as that walker's
static measurement -- no build and no DOSBox session stands behind them.

**This section is no longer only prose (2026-09-10).** `tools/test_ecl_gen2_dialect_drift.py`
derives both sides from source on every `pnpm test:corpus` run -- native's by symbolically
executing `get_operand_meta` over the parsed `optab`, TS's by modelling the engine's real
resolution order (`opcodeOverrides[op] ?? KRYNN_GEN1_OPCODES[op]`, then `wordSetOverrides`
for `wordSet` only) -- and fails on any divergence not in a dated exception list. Every
divergence named in this section was an entry in that list, carrying both native frames, the
TS frame, a reason, and what would resolve it. The list is **two-sided**: an entry also goes
red when the two tracks CONVERGE, so a fix cannot leave a stale exemption behind. The
current denominator is 66 opcodes (`0x00..0x41`, the union of both tables): all 66 agree
and the exception list is empty.

## Runtime confirmation (2026-09-10, after the change landed)

This section previously read: "No DOSBox session was run, no native rebuild was
performed, and there is **no runtime confirmation** that the corrected frame yields
`groups=0002`. That claim is inference from a static decode plus an existing artifact."
**That limitation is now discharged**, and the inference held.

Applied as `0634e15`, rebuilt, and run through `native/ccecl-dqk-vmrun-test.ps1`.
`native/build/DQK5E5S.TXT` moved from

```
GBEC groups=0001
@00 MONSTER id=0025 count=0004 pic=0025
```

to

```
GBEC groups=0002
@00 MONSTER id=0034 count=0006 pic=0034
@01 MONSTER id=0025 count=0004 pic=0025
```

**Control, one variable.** `ccecl.asm` was restored from a byte-exact backup (SHA-256
verified in both directions), rebuilt, and re-run: `groups=0001` reproduces. Across all
three dumps the run produces, the record list above is the **only** difference --
`DQK5N2.TXT` and `DQK5E5.TXT` are byte-identical before and after. So this is the frame
change's effect and not a broad behavioural shift, and the change is Gen2-scoped in
practice as well as in design.

**Why this is the correct reading and not merely the new one.** The two emitted records
match the two memory slots that were *already* populated in the buggy build: `C1=6` ->
`id=0034 count=0006`, `C2=4` -> `id=0025 count=0004`. The old build populated both slots
and emitted one record -- exactly the asymmetry named as this defect's detector in the
`GBEC groups=0001` section above. The detector was written before the fix and fired
correctly on it.

**Gen1 unaffected, checked rather than assumed:** `ccecl-dok-combat-gap-test`,
`ccecl-dok-thief-matrix-test`, `cokyield-test` and `cokhost-test` all exit 0.

## What is still NOT established
- DoK Gen1 remains genuinely inconclusive (see above).
- The 7th operand in the old dump (`0003`) is the *resolved* value of `mem[0xC1]`,
  not a literal — the native dumper prints r-values, which is why the same test pins
  `@07 MEM key=00C1 value=0003`. Anyone re-deriving the needle should expect resolved
  values, not raw operand encodings.
