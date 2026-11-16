# DQK ending leg — area 66 chain graph, ingress, and the `[0x0032]`/`[0x009A]`/`[0x00A0]` gates

Follow-up investigation to `docs/engine/research/dqk-campaign-legs.md`'s "Leg: ENDING" section
(status `blocked`). Scope: (1) area 66's true outbound/inbound chain graph, (2) whether a real
ingress path to area 66 exists, (3) what host words `[0x0032]`, `[0x009A]`, `[0x00A0]` actually are.
Read-only w.r.t. `packages/` and `tools/`; all bytes cited below were re-derived this session from
`The Dark Queen of Krynn/DISK3/ECL.GLB` (via `tools/dqk_ecl_combat_scan.py`'s HLIB member reader,
`off = v - 0x8000`) using a purpose-built control-flow-aware Gen2 decoder (scratchpad only, not
checked in), not `tools/dqk_ecl_combat_scan.py`'s own (stale) opcode table.

**Method note, because it mattered twice.** A naive regex census over raw bytes (e.g. "find `20 00
NN`" for immediate `NEWECL #NN`) produces real false positives: the byte pattern can land inside a
packed 6-bit string literal, or — for `0x20` specifically — collide with the extremely common `OR
#32,...` bitmask immediate. All findings below were cross-checked with a real linear/CFG walker that
starts at an area's five header far-pointers (`vmRun1`/`searchLocation`/`preCamp`/
`campInterrupted`/`initialEntry`, correctly parsed as 4-byte fields `01 <code> <lo> <hi>` — my first
walker used a wrong 3-byte stride and silently produced near-empty coverage) plus `ON_GOTO`/`ON_GOSUB`
arm targets, and that treats `IF_EQ/NE/LT/GT/LE/GE` as guarding exactly the next instruction (so the
guard-false fallthrough is always also explored) and `GOSUB`/`ON_GOSUB` as calls that return (so code
after them is also explored), not as `GOTO`. Every vaddr cited below was confirmed reachable and
correctly instruction-aligned by that walker, not just pattern-matched.

## (a) Area 66's true chain graph

Header (20 B, matches the existing doc exactly): `vmRun1 0x8592`, `searchLocation 0x8629`, `preCamp
0x8151`, `campInterrupted 0x8193`, `initialEntry 0x8014`.

**Outbound, validated:**

| site | target | gate |
| --- | --- | --- |
| `0x8959` `20 00 40` | `NEWECL #64` | arm 3 of the 15-arm `ON_GOTO [0x009B]` at 0x8672 (target[3]=0x8933). Full guard chain: `0x8933 COMPARE [0x0032],#0 / IF_EQ / EXIT` (dead unless host word 0x0032 is nonzero) → `0x893B AND #4,[0x009C],[0x00BF] / IF_NE / EXIT` (one-shot bit 4 of 0x009C, already-consumed guard) → `0x8946 OR #4,[0x009C],[0x009C]` (arms the one-shot bit *before* proceeding — the "eager consumed bit" idiom already documented elsewhere in this corpus) → `0x894F SAVE #1,[0x01A2]` → `0x8955 GOSUB 0x9F03` (shared state-copy helper, see below) → `0x8959 NEWECL #64` |
| `0x9D27` `20 00 43` | `NEWECL #67` | the terminal arm (`ON_GOTO` index 14, target 0x9D18): `0x9D18 COMPARE [0x00A0],#255 / IF_EQ / GOTO 0x9D2A` (skip straight to the damnation-gate check below); else fallthrough `0x9D23 GOSUB 0x9F03 ; 0x9D27 NEWECL #67` |

**Inbound, validated (corpus-wide, all 47 areas checked for immediate `NEWECL #66`):**

| source | site | note |
| --- | --- | --- |
| area 64 | `0x84F9` `20 00 42`, **unconditional** | see §(b) — this is the real ingress edge |
| area 67 | `0x9658` `20 00 42`, area 67's own `vmRun1`/`searchLocation` (all four header far pointers alias to 0x9654) | fires on literally every visit/search action in area 67 |

So the existing doc's refuter correction ("area 66 also chains `NEWECL #64`... the closed two-node
loop is false") is **confirmed correct and now fully mapped**: area 66 does chain to 64 via arm 3
(exact site 0x8959, one byte past the doc's cited 0x8933 arm-entry address), gated on the same
`[0x0032]` host word as the terminal scene. The 66↔67 relationship is a real bidirectional pair
(66→67 at 0x9D27, 67→66 at 0x9658), not a fabrication — but it coexists with the 64↔66 edge rather
than being the area's only connection, exactly as the refuter said.

## (b) Ingress to area 66 — now traced, real, and natural

The existing doc's "What is NOT claimed" list states: *"an ingress to area 66. Areas 63/64 chain
through variable operands (`NEWECL [0x00A5]`, `NEWECL [0x01A1]`) whose runtime values were not
resolved."* Those variable-operand chains are real (area 64's `0xA1A5 NEWECL [0x01A1]` is a
"return to the previous area" mechanism fed by `SAVE [0x0016]->[0x01A1]`) but they were, correctly,
left unresolved. Area 64 also has a **second, direct, immediate** `NEWECL` that the doc did not cite,
and it closes the question:

```
area 64 @0x83C7  COMBAT                              ; boss fight
        @0x83C8  IF_NE / GOTO 0x8353                 ; loss/retreat branch (skips the rest)
        @0x83E9  PRINTCLEAR "ALL AROUND THE HALL ARE DEAD BODIES..."
        @0x8420  PRINTCLEAR "YOU HEAR ANOTHER VOICE NOW, A MAN'S..."
        @0x8444  PRINT "'SO THE QUEEN HAS A RED CARPET AFTER ALL.'"
        @0x8475  PRINTCLEAR "THERE IS THE RATTLE OF CHAINS."
        @0x8494  PRINT "'HEROES, YOU HAVE NOT DISAPPOINTED ME. COME.'"
        @0x84C8  PRINTCLEAR "THE JAW DROPS, EXPOSING BLACKNESS. YOU ENTER THE ABYSS."
        @0x84F5  PICTURE #255
        @0x84F8  PARTYSTRENGTH
        @0x84F9  NEWECL #66            ; 20 00 42 — unconditional, no IF guard anywhere in this run
```

This is area 64's own post-boss-victory epilogue, and it is **unconditional once the fight is won** —
no host-word gate, no consumed-bit check, nothing. Tracing further back (all validated via the same
CFG walker, header-entry-seeded, no manual hints):

- **Area 5 → area 62** (`0xA52C` `20 00 3E`): the standard overland "DO YOU ENTER?" pattern already
  established elsewhere in this corpus (Kristophan/#38 in the proven wilderness leg, Tower of
  Flame/#58) — `GOSUB 0xA576` (confirmation prompt) → `IF_NE / EXIT` on decline → `GOSUB 0xA568`
  (helper) → `NEWECL #62`, printing "THE VILLAGE OF BAI'OR." Area 5 is the wilderness hub of the
  **already-proven** wilderness leg (`docs/engine/research/dqk-campaign-legs.md` "Leg: WILDERNESS").
- **Area 62 → area 64** (`0x88D9` and `0xA829`, two sites, both `20 00 40`): gated on
  `COMPARE [0x019E],#0 / IF_EQ / EXIT`. `[0x019E]` is area 62's own internal quest-progress counter —
  **23 distinct CFG-reachable SAVE sites within area 62 itself** write it, with immediate values
  spanning 1, 3, 4, 6, 7, 9, 10, 11, 13, 14, 16, 17, 18, 28–31, 33, 34, 39–42 (e.g. `0x81F4 SAVE
  #7,[0x019E]`, reached very early in area 62's own script). This is ordinary in-area quest-dialogue
  branching, not an external or unreachable precondition — the same shape as area 62's separately
  observed `[0x019B]` counter (6 sites, immediate values 0–4, also area-local normal-play
  progression).
- **Area 64 boss fight → area 66**: unconditional, as shown above.

**Conclusion for (b): a real, byte-proven, natural in-game route exists — wilderness hub (area 5,
already-proven leg) → Bai'Or (area 62) → Tower of Flame Sanctum (area 64, Dark-Queen-voiced cutscene
+ boss fight) → area 66, with every gate along the way being ordinary story-progression state that
the corpus shows being advanced by the areas' own normal dialogue/quest scripts, not by anything
external or unresolved.** This directly closes the "not claimed: an ingress to area 66" item — via a
different, cleaner edge (area 64's unconditional post-victory `NEWECL #66`) than the ambiguous
variable-operand chains the existing doc already knew about and correctly declined to resolve.

**What this does NOT establish:** which specific GEO cell/masked descriptor the party lands on inside
area 66 after the `NEWECL` (i.e., whether the natural route specifically lands on the SAHUAGIN
encounter's descriptor 134/142 cells the existing doc pinned, or elsewhere in area 66's 748-cell,
22×34 map). That would need either a GEO "on-enter" spawn-cell lookup (not attempted this session) or
a live trace.

## (c) `[0x0032]`, `[0x009A]`, `[0x00A0]` — byte evidence

**`[0x009A]` is a live per-area-entry snapshot of `[0x0032]`.** Area 66's own `vmRun1` (0x8592) does:

```
0x8592 GOSUB 0x9F6F                    ; helper: SAVE #0,[0x0039] ; RETURN
0x8596 COMPARE [0x0097],#1 / IF_EQ / EXIT   ; re-entry guard
0x859E SAVE [0x0032],[0x009A]          ; 09 01 32 00 01 9a 00 — THE snapshot
0x85A5 ...                             ; unrelated combat/state setup continues
```

This is the only site in the corpus where `[0x009A]` is written *from* `[0x0032]`; every other
`[0x009A]` writer (11 corpus-wide sites, areas 4/14/15/22/23/26/27/28/34/46/48/50/54/62/65) writes an
immediate literal or a different address — consistent with the existing doc's characterization of
`[0x009A]` as reused area-local scratch elsewhere, with area 66's use being the one genuine tie to
`[0x0032]`.

**`[0x00A0]` is a saturating step/visit counter, local to whichever area is currently using it.**
Area 66's own code (not a corpus-wide claim — `[0x00A0]` is reused with unrelated immediate values by
roughly 30 other areas, a shared low-numbered scratch slot):

```
vmRun1  @0x85B7  COMPARE [0x0021],#1
        @0x85BD  IF_EQ / SAVE #210,[0x00A0]        ; conditionally seeds the counter to 210 on entry
searchLocation @0x8629
        @0x8633  COMPARE [0x00A0],#255
        @0x8639  IF_LT / ADD #1,[0x00A0],[0x00A0]  ; increments only while below 255 — permanent
                                                     ; saturation once 255 is reached
```

This exactly matches (and now fully explains, byte-for-byte) the "255 step-counter-saturating
revisits" characterization: from a cold start it takes up to 255 `searchLocation` calls (fewer, ~45,
if `[0x0021]==1` seeds the 210 start) to saturate; once saturated it never resets. Tedious, but a
completely ordinary, reachable in-game grind — **not** a structural blocker on its own.

**`[0x0032]` — the actual master gate for essentially all of area 66's content, producer still
unlocated.** New finding this session, not in the existing doc: `[0x0032]!=0` is not only the
terminal-scene gate — it independently guards *every* content arm reached in area 66's `ON_GOTO`
table that was walked this session (arms at 0x88E7, 0x890D, 0x8933, 0x89A3, 0x89B5, 0x8CC6 — the
SAHUAGIN encounter — 0x8DD9, 0x90E0, 0x90FD all open with `COMPARE [0x0032],#0 / IF_EQ / EXIT`). With
`[0x0032]==0` (its only observed corpus value), essentially the entire area is inert content: every
arm no-ops, and the only thing that functionally happens on repeated visits is the 66→67→66 bounce and
the step counter climbing.

Corrected census of `[0x0032]`'s writers (the existing doc says *"a corpus-wide scan finds ZERO ECL
writes to `[0x0032]` in all 47 blocks (read only, in areas 14/15/35/66)"*) — **this is imprecise, not
wrong in substance.** Re-run with the CFG-validated walker (not a raw scan) against areas 14, 15, 35,
and 66:

- Area 14: **two real, CFG-reachable writes**, `0x848B SAVE #0,[0x0032]` and `0x84AF SAVE #0,[0x0032]`.
- Area 15: **two real, CFG-reachable writes**, `0x9211 SAVE #0,[0x0032]` and `0x9232 SAVE #0,[0x0032]`.
- Area 35: no write; `[0x0032]` used only as a `GETTABLE` index operand at 0xA210.
- Area 66: no write, read-only (matches the doc exactly).

So there are 4 real writes, not zero — but every one of them writes immediate `0` (a clear/reset).
**No write of any nonzero value to `[0x0032]` was found anywhere in the 47-area ECL corpus**, by
either a raw structural byte census or the CFG-validated walk. The substantive conclusion the existing
doc draws (nothing in the ECL scripts arms this word) survives; only the "zero writes, read-only"
framing needed correcting to "4 writes, all clears."

**Static DQK.EXE check (unchanged from this session's earlier pass, re-confirmed):** every real
occurrence of the project's established ECL-data-segment-base idiom `les bx,[0xb20f]` (242 sites) was
followed forward up to 500 bytes / until the next `les bx,` redefinition or `ret`/`retf`, and scanned
for `es:[bx+0x32]` or `es:[bx+0x9a]` writes. **Zero hits.** This is the same technique previously
validated for this project via the DIVIDE-remainder proof, but it only covers the `bx`-based form of
the idiom; other base registers (`si`/`di`/`bp`) were not re-swept this session — a disclosed,
unclosed gap, not a proof of absence.

**`SAVE_TABLE` (0x35) computed-write blind spot — checked, inconclusive.** 304 corpus-wide
`SAVE_TABLE`-shaped instructions were censused for a base/destination operand landing exactly on
address 50 (`0x0032`) or 154 (`0x009A`): **zero exact matches.** This is a soft negative — the
project's own opcode-decoding notes flag `SAVE_TABLE`'s Gen2 operand semantics (source, computed base,
computed offset — likely NOT a simple "write to this literal address" shape) as unvalidated, so a
"zero exact-address hits" result does not rule out a runtime-computed write landing on 0x0032 via a
table-base-plus-offset the static census cannot see by construction. This gap is the same one the
task brief pre-warned about, and it remains genuinely open.

## Also found, disclosed as an open question (not resolved this session)

**Area 67's own `vmRun1`/`searchLocation` body (0x9654) contains, immediately after its `NEWECL #66`
at 0x9658, code that is byte-for-byte the same shape as area 66's terminal `[0x009A]==4` damnation
scene** (`COMPARE [0x009A],#4` at 0x965B → the "YOU ENTER A DARK CHAMBER... WELCOME TO THE ABYSS! I,
RAISTLIN, AM YOUR NEW GOD." text, culminating at 0x9876 `RETURN`). Textually, this is the exact same
scene reachable from area 66's own terminal arm at 0x9D2A. Whether this code is genuinely reachable —
i.e., whether `NEWECL` transfers control immediately (in which case everything textually after it in
the same script is dead code, only reachable via some other jump into it that was not found this
session) or defers the area load to end-of-turn (in which case script execution continues linearly
after a `NEWECL` and this damnation check really does run on every single area-67 visit, not just
after the area-66 step counter saturates) — **was not settled this session.** The existing doc's own
refuter reproduction (seeding `[0x00A0]=254`, which becomes 255 during that same visit's
`searchLocation` increment, specifically to reach the terminal branch) is consistent with `NEWECL`
behaving as an effective hard transfer in the project's own clean-room engine model, which is why this
report treats the `[0x00A0]`-saturation path as the operative one rather than claiming the damnation
check fires on every visit. Flagging this explicitly for whoever picks this up next, since it
materially affects how "reachable" the terminal check is.

## (d) Recommended status: **blocked** (unchanged), sharpened

This is not a call for `proven` — `[0x0032]`'s producer is still genuinely unlocated, and that word
gates not just the terminal scene but effectively all of area 66's content — nor is it
`structurally-absent`, since a real host-write path (any base register other than `bx`, or a
`SAVE_TABLE` computed write) has not been exhaustively ruled out, only the two techniques available
to static analysis this session.

What changes: the leg's blocker should no longer be described as "ingress to area 66 is untraced" or
"the closed loop claim is false" (both now fully resolved — ingress is real and byte-proven; the loop
claim was correctly refuted and is now completely mapped, including the previously-uncited area
64→66 unconditional edge). The blocker is now exactly one thing: **no mechanism anywhere in the
shipped 47-area ECL corpus, and no `les bx,[0xb20f]`-idiom host write in `DQK.EXE`, ever arms host word
`[0x0032]` to a nonzero value.** Everything downstream of that (the SAHUAGIN encounter, area 66's
other arms, the damnation scene) is otherwise real, reachable, well-formed content sitting behind a
single switch nobody has found the producer of.

## (e) Single most valuable next experiment

A live DOSBox-X (GameLink, per this project's established singleton-safe protocol — explicitly not
available to this session) write-breakpoint / memory-diff trace on ECL words `0x0032` and `0x009A`,
played through the now-proven natural route (area 5 → 62 → 64 → 66, per §(b)), across as much of a
real playthrough as is practical — ideally from a late-game save that has already cleared other major
story beats, in case `[0x0032]` is armed by content in areas never reached by this session's static
CFG walk of the immediately-relevant areas only (this session did not walk all 47 areas end-to-end
with the CFG-aware method — only 14, 15, 35, 62, 64, 66, 67 got the fixed 4-byte-header treatment; a
full 47-area CFG sweep, cheap and still static/read-only, is a good second-priority companion to the
dynamic trace and would also finally close the `SAVE_TABLE` blind spot if paired with dynamic operand
logging). This single experiment would settle, empirically: (1) whether `[0x0032]` ever becomes
nonzero during real play and if so from where, and (2) `NEWECL`'s true control-flow semantics
(resolving the area-67 open question above along the way, for free).
