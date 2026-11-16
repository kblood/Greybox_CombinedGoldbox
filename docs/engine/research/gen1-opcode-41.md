# Gen1 ECL opcode `0x41`: does CoK/DoK/Secret's own dispatch table name it?

**Question.** Round 34 R1 added `0x41` to the shared base table
(`packages/engine/src/ecl/opcodes.ts`, `KRYNN_GEN1_OPCODES[0x41] = { wordSet: 2, mnemonic:
'UNKNOWN_0x41', uncertain: true }`) from byte-shape/statistics evidence alone (`41 00 [01] 0[23]
<word>`, word always claimed a multiple of 500), explicitly declining to claim semantics because
`EclDump`'s own oracle table stops at `0x40`. Separately, `disassemble.ts` already carries
`TREASURES_AWARD_XP` and `POOLS_AWARD_XP` for the *same opcode byte* in Treasures'/Pools' own
dialects, sourced from those two titles' own `GAME.OVR` handlers (2-operand, operand-2 × 100 →
experience). R1 noted the numeric coincidence (500 × 100 = 50,000 XP) but never checked whether
CoK/DoK/Secret — the titles the BASE table actually serves — have a `0x41` dispatch entry in
their OWN binaries at all.

**Answer, short form:** yes. All three titles' own `GAME.OVR` dispatch tables carry a genuine
`0x41` entry (high-confidence structural match against the shared CoAB oracle, same method as
`tools/map_pool_ecl_dispatch.py`/`map_dok_ecl_dispatch.py`/`map_buck_ecl_dispatch.py`), each
handler reads exactly 2 operands (confirming `wordSet: 2` independently of the byte-shape
argument), and all three handlers implement the **same idiom**: divide the operand-2 amount by
the count of active party members and add the share into a 32-bit accumulator field per
character — CoK's version reuses the *exact* CCH "next combatant" pointer field
(`+0x17F/+0x181`) that the already-verified, byte-proven `calc_battle_exp` (post-combat XP)
routine uses to walk the same party linked list. That is strong, if not oracle-certified,
corroboration that `0x41` is an experience-point award, structurally analogous to but mechanically
different from Pools'/Treasures' ×100 idiom. The "always a multiple of 500" operand claim,
however, is **not literally true**: an exhaustive (not sampled) scan of every reached `0x41` site
in all three titles' own `ECL1-3.DAX` finds 2 of 123 sites (both in CoK) with a non-multiple-of-500
operand.

## Method

1. Read `opcodes.ts`'s `0x41` entry and comment, the Treasures/Pools handler docblocks in
   `disassemble.ts` (`~406`/`~413`, `~545`/`~559`), and R1's memo
   (`docs/engine/research/ecl-deep-desync-triage.md`).
2. Located each title's `0x41` dispatch entry the same way `tools/map_dok_ecl_dispatch.py`
   already locates DoK's `commandTable`/`vm_LoadCmdSets`: structurally match the CoAB oracle
   (`build/coab-oracle-map.json`) against every Borland-prologue-shaped function start in the
   title's own `GAME.OVR`, using `map_pool_ecl_dispatch.py`'s `disassemble_shape`/
   `nearest_function`/`dispatch_table` (imported read-only). Operand counts came from
   `map_buck_ecl_dispatch.py`'s `derive_operand_parser_call_target`/`operand_word_sets` (also
   imported read-only) — the same generic tooling Buck's own `0x41` mapping used.
3. Manually disassembled each title's `0x41` handler in full (capstone, 16-bit real mode) to read
   the actual logic, not just the operand count.
4. Independently re-derived the reached-`0x41`-site census with a from-scratch Python port of
   `walkEclReachable`'s worklist algorithm (scoped to exactly what this task needs — every reached
   instruction's word-kind operands), run against the titles' own `ECL1.DAX`/`ECL2.DAX`/`ECL3.DAX`,
   to get an exhaustive (not sampled) operand-value distribution and a null population.

All scratch scripts live under the session scratchpad
(`walk_ecl_41.py`, `walk_ecl_41_detail.py`, `map_cok_secret_41.py`, `full_disasm_41.py`); no
project file besides this doc was modified.

## Result 1 — all three titles' own dispatch tables carry `0x41`

| Title | GAME.OVR path | Magic | Dispatcher offset | Dispatcher sim/jaccard | Parser offset | Parser sim/jaccard | `0x41` handler offset | Measured word set |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CoK | `Champions of Krynn\GAME.OVR` | `FBOV` | `0x41d9` | 0.9914 / 1.0 | `0x8a73` | 1.0 / 1.0 | **`0x4048`** | **2** |
| DoK | `Death Knights of Krynn\GAME.OVR` | `FBOV` | `0x3271` | 0.9763 / 0.778 | `0x6ba8` | 1.0 / 1.0 | **`0x2e0e`** | **2** |
| Secret | `...GOG Galaxy\Games\Secret of the Silver Blades\GAME.OVR` | `TPOV` | `0x458b` | 0.9897 / 0.706 | `0x9073` | 0.9746 / 0.878 | **`0x43ff`** | **2** |

Dispatcher/parser similarity is `SequenceMatcher` ratio against the CoAB oracle's own
`commandTable`/`@parse_command_sub$q4Byte` shapes — all three clear the 0.95 threshold
`map_dok_ecl_dispatch.py --strict` uses. DoK's `0x2e0e` handler offset (11790 decimal) matches
the pre-existing `build/dok-ecl-dispatch-map.json`'s own `0x41` row exactly (that file already had
DoK's dispatch table cached from an earlier round; this session's independent re-derivation
reproduced it byte-for-byte, a useful cross-check on the tooling itself). CoK's and Secret's `0x41`
dispatch rows had never been generated before this session.

The measured word set (2) came from each handler's own `mov al,2; push ax; lcall <parser>`
prologue — the operand-parser call target derived independently per title
(`0x4e,0x2a` for CoK at 38/53 handlers, `0x41,0x2a` for DoK at 36/54 — that `0x41` is DoK's own
FBOV *overlay segment* number, an unrelated coincidence with the opcode byte under study — and
`0x7d,0x2a` for Secret at 38/53). This confirms `wordSet: 2` from a completely independent
evidence class than R1's byte-shape sampling: three separate titles' own compiled handler code,
located by structural match, not statistics over the operand stream.

## Result 2 — the handler logic: divide-and-accumulate, not the Pools/Treasures multiply

All three handlers are the same shape, differing only in host-global addresses and CCH field
offsets (title-local record layouts):

```
op1 = readOperand(1)   ; byte, code 0x00, value observed 0 or 1
op2 = readOperand(2)   ; word, code 0x02/0x03, the "round-number" amount
if (op1 != 0):
    ptr = <party-head far pointer>          ; e.g. CoK [0x609a]
    loop:                                    ; count ACTIVE members (status field nonzero),
        for i in 0..6/7: if ptr[i + <status_off>] > 0: activeCount++
        share = op2 / activeCount            ; 16-bit unsigned divide
        while ptr != null:
            if ptr[<eligible_off>] != 0:
                ptr[<xp_off>] += share        ; 32-bit ADD/ADC
            ptr = ptr[<next_off>]             ; far-pointer linked-list walk
else:
    ptr = <single-target far pointer>        ; e.g. CoK [0x6096]
    (same count-active / divide / add, but applied once, to `ptr` only)
```

Concretely, for CoK (handler `0x4048`, full disassembly in the scratch log):

- `activeCount` loop checks `es:[di + 0xf9]` (status byte) across indices `0..6`.
- `share = op2 / activeCount` (`div cx`).
- If `es:[di + 0x189]` is set, `add word ptr es:[di+0x116], ax` / `adc word ptr es:[di+0x118], dx`
  — a 32-bit accumulator per character.
- Party-wide branch (`op1 != 0`) then walks the **next** combatant via
  `les di, ptr es:[di + 0x17f]` / `mov dx, word ptr es:[di+0x181]`, looping back until the far
  pointer is null.

DoK's handler (`0x2e0e`) is byte-identical in structure at offsets `0x62/0x64` (the persisted
u32 XP field in the compact PC record, not CoK's `0x116/0x118`) and additionally makes one more
far call right after the accumulate (`lcall 0xcf, 0x11a`, passing the character far pointer),
storing the returned `AL` into `es:[di + 0xc6]`. It gates each member on `+0xc8 != 0`, counts
positive bytes `+0x45..+0x4c` before dividing, and walks the party through `+0xb9/+0xbb`.
The follow-up's exact semantics remain unlocated, so this is not yet an admission contract.
Secret's handler (`0x43ff`) matches CoK's shape closely, using accumulator offset
`0x12c/0x12e` and a 6-slot active-member loop (CoK/DoK use 7) — consistent with Secret's smaller
maximum party size.

### Cross-subsystem corroboration (not just "it looks like XP")

CoK's `+0x17F/+0x181` "next combatant" far-pointer field is not a guess: it is the **same field**
`docs/engine/research/decompile-ovr006-xp-treasure.md` already lists, independently and with a
BAAZ-monster static-value proof, as CCH's `+0x17F/+0x181` "next CCH combatant" pointer — the field
CoK's own, already-verified, byte-proven **post-combat** `calc_battle_exp` routine uses to walk the
party during combat XP distribution. Opcode `0x41`'s handler walks the *same* linked list through
the *same* field offset in the *same* record type. This is a genuine cross-subsystem match (two
independently reverse-engineered pieces of code agreeing on a structural detail neither
investigation borrowed from the other), not just plausibility from operand shape.

The later retained-memory snapshot cross-check identifies the accumulator operationally as
canonical CoK character XP: the six raw CCH records matched the retail `CHRDATA#.SAV` records at
all three captured points, and their `+0x116` values changed after the victory-XP sequence
(for example, `2500, 2251, 5000, 2001, 5000, 5000` before it and
`2608, 2369, 5054, 2055, 5054, 5036` at victory). This is runtime value evidence, not a recovered
symbol name, but it independently connects the exact field to player XP.

That makes the divide-and-accumulate shape concrete: CoK's retail `0x41` is a script-supplied XP
award split among active members, or assigned to a selected member according to its first operand.
It still does not establish an oracle source-level field name, nor does it make the distinct DoK or
Secret layouts interchangeable with CoK.

## Native implementation — CoK only, 2026-09-12

`native/src/ccecl.asm` now dispatches `0x41` to `op_award_xp`. When GBBOOT supplied a structurally
valid non-DoK GBPR sidecar, the handler counts positive CoK CCH `+0xF9` bytes, divides the 16-bit
amount exactly once, checks CCH `+0x189` eligibility, and adds the zero-extended quotient to the
u32 at `+0x116/+0x118`. Party mode walks every entry; selected mode uses CCECL's current
`LOAD_CHARACTER` selection. The standard headless DOSBox test uses three entries to prove the
party split, selected split, truncation, low-word carry, and ineligible no-write.

DoK stays unadmitted: its compact record's `+0x62/+0x64` persisted XP accumulator is now
verified, but the mandatory follow-up recalculation and its `+0xc6` result still need
title-specific recovery before its existing bad-opcode boundary moves. The selected-member mapping is verified against
CCECL's native selection contract, not separately against every retail selected-pointer transition.

## Result 3 — operand-value distribution, exhaustive, with its null

Independent from-scratch reachability walk (own Python port, not `walkEclReachable` itself) over
each title's own `ECL1-3.DAX`. Cross-check: CoK found **33** reached `0x41` sites and Secret found
**40** — both numbers match R1's `eclDesyncTriage.test.ts` census EXACTLY (33/33 CoK, 40/40 Secret
closed by the `0x41` override), which validates this independent walker against the project's own
pinned numbers before trusting its output for anything new. DoK found **50** reached `0x41` sites
with 37 residual desyncs from other causes — R1 reported 29 residual (72 → 29 after the fix); the
gap is a real discrepancy between this walker's simplified control-flow rules and
`walkEclReachable`'s exact ones (most likely GOSUB/GOTO targets computed through non-literal
operand codes, which this scratch walker does not special-case). Flagged as a methodological
caveat — it does not affect the CoK/Secret numbers, which match exactly, or change the qualitative
finding below.

| Title | Reached `0x41` sites | op1=0 count | op1=1 count | op2 mult-of-500 |
| --- | ---: | ---: | ---: | ---: |
| CoK | 33 | 3 | 30 | 93.9% (31/33) |
| DoK | 50 | 15 | 35 | 100% (50/50) |
| Secret | 40 | 10 | 30 | 100% (40/40) |
| **Combined** | **123** | **28** | **95** | **98.4% (121/123)** |

Split by the `op1` flag (party-wide vs. single-target branch): **op1=1 (party-wide): 95/95 (100%)
multiples of 500. op1=0 (single-target): 26/28 (92.9%)** — both non-multiple-of-500 outliers are
in the single-target branch.

**The two outliers** (raw bytes confirmed genuine `41 00 00 0[23] ...` instructions, not a decode
artifact):

| Title | File | Block | Offset | Raw bytes | op2 value |
| --- | --- | ---: | --- | --- | ---: |
| CoK | `ECL1.DAX` | 32 | `0x1cec` | `41 00 00 02 2c 01 02 01` | **300** |
| CoK | `ECL2.DAX` | 67 | `0x1bff` | `41 00 00 03 79 7f 04 00` | **32633** |

**Fuller distinct-value range than R1 sampled:** combining all three titles' 123 sites, the
distinct op2 values observed are `300, 500, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7000, 7500,
8000, 10000, 15000, 20000, 25000, 30000, 32633, 35000, 40000, 50000, 55000, 60000, 65000` — R1's
memo (sampled across CoK's 33 and "DoK's 47 matching" sites, not Secret's) listed only `500, 1000,
1500, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 10000, 30000`. The wider exhaustive scan finds
values up to 65000 and the two non-500-multiple exceptions above.

**The null** (every OTHER reached instruction's word-kind operand — code 1/2/3 — decoded in the
same walk, same blocks, same titles — a stand-in for "how often does an arbitrary ECL operand word
happen to be a round multiple of 500"):

| Population | n | mult-of-100 | mult-of-250 | mult-of-500 | mult-of-1000 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `0x41` op2 (combined) | 123 | 99.19% | 98.37% | **98.37%** | 91.06% |
| Null: all other reached word operands | 29,954 | 0.98% | 0.56% | **0.53%** | 0.41% |

The null is roughly 0.5% multiples-of-500 by chance; the `0x41` operand-2 population is 98.4% —
a ~185× enrichment. This is not something an arbitrary ECL word operand does; it is specific to
this opcode's second argument, and it holds independently across all three titles. The null
strongly supports "this argument is a hand-authored round number," but does not by itself prove
"experience" specifically — the handler disassembly (Result 2) is what supplies that.

## Contradictions with R1's memo

- **"the trailing word is always a multiple of 500"** does not hold exactly: 2 of 123 exhaustively
  measured sites (both CoK, both in the `op1=0` single-target branch) are not multiples of 500
  (300 and 32633). It holds at 98.4% combined, and at a clean 100% for the party-wide (`op1=1`)
  branch specifically — a real, previously unreported split R1's byte-shape sample did not surface
  (R1 sampled 33+47 sites across two titles, not the full corpus, and did not stratify by the flag
  operand).
- R1's memo reports the observed range as topping out at 30000; the exhaustive scan (adding
  Secret, which R1 did not byte-shape-sample) finds values up to 65000.
- R1 correctly declined to name semantics because `EclDump`'s oracle silence at `0x41` is void
  evidence (its own table stops at `0x40`, the range it was reverse-engineered from). This session
  does not use `EclDump` either — the corroboration here is CoK's own retail dispatch table plus a
  structural field match against the already-verified `calc_battle_exp` routine, an independent
  evidence class R1's memo did not have available (R1's scope was the reachability walker and the
  byte-shape statistics, not a dispatch-table location pass on CoK/DoK/Secret's own binaries).

## Verdict

**Rename, with a caveat, not "still unknown."** The evidence for "this is an experience-point
award, divided among living party members or granted to a single target depending on a flag" is
strong and comes from three independent angles that all agree: (1) all three base-table titles'
own dispatch tables carry a real `0x41` entry reading exactly 2 operands, matching `wordSet: 2`
from binary ground truth rather than byte-shape inference; (2) the handler logic in all three
titles independently implements "divide amount by living-party-count, add to a per-character
accumulator" — the identical division-by-survivor-count rule `calc_battle_exp` documents for
CoK's real, verified combat-XP path; (3) CoK's handler reuses the exact CCH "next combatant"
pointer field (`+0x17F/+0x181`) that routine already uses, an unforced cross-subsystem agreement.
This is short of an oracle-certified name (no source-level symbol names this opcode anywhere in
this project's holdings), but it clears the bar this project has used elsewhere for a semantic,
still-`uncertain`-flagged mnemonic (e.g. Pools'/Treasures' own `POOLS_AWARD_XP`/
`TREASURES_AWARD_XP`, which rest on comparable same-title-handler evidence without an oracle
either).

**Recommendation:** rename the base table's `0x41` mnemonic from `UNKNOWN_0x41` to something in
the same family — e.g. `GEN1_AWARD_XP` — while **keeping `uncertain: true`**, since the specific
target field (`+0x116/+0x118` in CoK) is not independently named as `player.exp` anywhere in this
repo's holdings and the mechanism (divide-and-accumulate) differs from Pools'/Treasures' own
×100 idiom, so calling it byte-identical to those two would overstate the match. The operand-2
"always a multiple of 500" framing in the existing comment should be corrected to "98.4% (121/123)
of reached sites; 100% in the party-wide branch, with two single-target-branch exceptions (300,
32633)" — the flat "always" claim is measurably false and this project has been burned before by
uninverted or oversold "always" claims that a null check would have caught.

## Files

- Scratch scripts (session scratchpad, not committed): `walk_ecl_41.py` (independent reachability
  walker + null stats), `walk_ecl_41_detail.py` (per-site operand dump), `map_cok_secret_41.py`
  (structural dispatch-table location for CoK/DoK/Secret), `full_disasm_41.py` (full handler
  disassembly for all three titles).
- Read (not modified): `packages/engine/src/ecl/opcodes.ts`, `packages/engine/src/ecl/
  disassemble.ts`, `packages/engine/src/ecl/reachability.ts`, `docs/engine/research/
  ecl-deep-desync-triage.md`, `tools/map_gen1_ecl_dispatch.py`, `tools/map_dok_ecl_dispatch.py`,
  `tools/map_buck_ecl_dispatch.py`, `tools/map_pool_ecl_dispatch.py`, `build/dok-ecl-dispatch-
  map.json`, `docs/engine/research/decompile-ovr006-xp-treasure.md`.
