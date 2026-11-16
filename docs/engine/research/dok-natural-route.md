# Death Knights of Krynn Natural Encounter Route — PROVEN (2026-07-18)

> **Current status: 2026-07-24 — DoK is Greybox's second Verified profile.** The clean selected-folder
> route now starts at retail ECL1#16, presents all opening pictures and the 12-enemy battle, walks
> ECL1#36 through Commander Bertil and Ayn Rampike's patrol handoff, exits through the real
> `vm_run_1`, walks ECL1#17's native 38×15 BIGPIC1#112 overland layer to Cekos, then reaches the
> block-34 SIVAK ×15 encounter and proves silver-key outcome, save/load, and consumed persistence in
> both browser and Electron. Update 15 is authoritative on revisit semantics: short-dialect
> `SURPRISE` is a zero-operand terminal exit, so `[0x4C5F]&8` consumes the encounter and a revisit is
> silent. The executable checkpoint/capability contracts keep incomplete retail-save,
> Amiga-wall, campaign-breadth, audio, rules, and pixel-parity gaps public. See Update 16 below.
>
> **Block 16 decode correction — 2026-09-24:** the historical scan and claim boundary below used
> the CoK-calibrated operand count for DoK opcode `0x0C`, desynchronizing at offset 1541. Re-decoding
> the held `ECL1.DAX` with DoK's four-operand `SETUP_MONSTER` gives the frame `[1541,1550)`, then
> short narration `[1550,1569)`, three `LOAD_MONSTER` instructions, `COMBAT` at 1592, post-combat
> narration `[1593,1740)`, `SAVE` at 1741, and `NEWECL 36` at 1747. Offset 1548 is an operand,
> not `EXIT`; the block does not end at `SETUP_MONSTER` and is not a native-host post-combat
> continuation. The 2026-09-24 decode used block 16 (1,809 bytes, SHA-256
> `35c39ef71e02771e2ff37475b93bc4c74019004488826a151cc53c88311945ea`) from `ECL1.DAX`
> (SHA-256 `d2fe2c3937dfc71d692aa60e3e54d251a9a52dd708a457b04859090e2664dd44`). Opcode `0x1D`
> was decoded as a zero-operand instruction for boundary accuracy; its in-game presentation
> semantics remain unproven. The corrected route is a source decode, not evidence that Greybox
> currently renders the full retail intro.
> Earlier status text preserved unedited for history:
>
> (Historical) Status: 2026-07-18. DoK's P2 natural-route slice remains **open** — this GOTO still does not reach
> `COMBAT` in Greybox, and none of save v2 / corpus promotion / browser wiring has been added. What
> changed on 2026-07-17: DoK's *own* retail operand parser and `CMD_Goto` handler were located inside
> its real `GAME.OVR` (not assumed from the CoAB oracle) and traced **twice, live, in DOSBox-X**,
> resolving the previously-open question of whether operand code `0x79` reflects a DoK-specific
> addressing convention Greybox is missing. It does not. See "2026-07-17 Update" below for the full
> finding and why `EclVm` was deliberately left unchanged. The 2026-07-16 investigation below (Block
> 33/17 byte traces, "The Blocker" section) is unmodified and still the authoritative decode of the
> GEO/ECL content itself. A same-day follow-up ("2026-07-17 Update 2") attempted the interactive
> walk-to-cell trace this update calls for: it found a real character-creation-skip shortcut (DoK's
> own shipped `SAVE\SAVGAMA.PTY` + `CHRDATA1..6` fresh pregen save) but could not proceed past it —
> DoK's save position fields, DoK's live position telemetry, and the block-34-to-33 adjacency are all
> independently unresolved, so no interactive keypress trace was actually run this round.
>
> **2026-07-17 Update 3:** attempted gap #2 of Update 2's three prerequisites — DoK's own live
> position/facing telemetry, replicating Pool's DGROUP-offset method. The static side succeeded
> cleanly: `[0xc073]`/`[0xc074]`/`[0xc075]`/`[0xc076]`/`[0xc077]`/`[0xdb75]` (X/Y/facing/wallType/
> cellDescriptor/dirty-flag) were located by directly disassembling DoK's own `GAME.OVR`, with an
> independent cross-check against the already-proven ECL1.DAX block 33 script. A full menu-navigation
> automation was also built and twice-reproduced, reliably reaching the shipped `SAVGAMA.PTY` pregen
> save's exact spawn/eulogy screen from a cold boot. But the *dynamic* half — a live memory read at
> that screen — is now a **separately evidenced blocker**: five independent capture-technique attempts
> (four different anchor points for the proven `CMD_Goto` breakpoint, including a 100-second wait with
> periodic pokes, plus a from-scratch INT8-timer-tick fallback anchor, 8 samples) all failed to produce
> a hit or a registered breakpoint in this specific post-load/narrative code window. See "2026-07-17
> Update 3" below for the full account, the two real automation bugs found and fixed along the way
> (reusable for any future interactive DOSBox-X trace in this project), and why the round stops here.
>
> **2026-07-18 Update 7 (static only, no DOSBox-X):** answered Update 6's own two-item next-steps
> list. DoK's own `sub_29758` analog (the native boot-path function) was located by structural
> match against the CoAB oracle at `GAME.OVR` file offset `0x3623`, and its disassembly proves
> `[0xdb6c]` is `gbl.EclBlockId` (cross-checked independently against `CMD_NewECL`'s own
> disassembly) and that a fresh, non-demo boot writes the literal constant **16**, not the `34`
> `gameData.ts` currently assumes — an open, unreconciled discrepancy, not resolved either way
> this round. The `+0xFC..+0xFE` triple Update 6 left undecoded is now decoded as three *distinct*
> struct fields (a marching-order/roster byte, and two wall-lookup-table selector indices), none of
> them a block id. See "2026-07-18 Update 7" below for the full disassembly, the two new reusable
> tools (`tools/map_dok_boot_path.py`, `tools/scan_dok_area_struct_fields.py`), and the precisely-
> specified live-verification step (breakpoint offsets `<destSeg>:2E50`/`2E75`/`2E92` in the same
> descriptor `CMD_Goto`'s own trace already resolves) left for a future round with the DOSBox-X slot.
>
> **2026-07-18 Update 8 (static only, no DOSBox-X):** Update 7's `16`-vs-`34` discrepancy is
> **RECONCILED** — resolution (b), different observation layers. The raw `GAME.OVR` bytes re-confirm
> the literal `16` (`c6 06 6c db 10` at `0x3692`); DoK's `ECL1.DAX` block 16 decodes as the real
> opening cinematic (Gargath celebration → Sir Karl death-dragon attack → opening combat), block 2 as
> the attract demo — both boot literals land on exactly-matching content. Block 16 has **no GEO map**
> and **no NEWECL** (nothing anywhere chains to 34); `eclInitBlock: 34` is Greybox's own documented
> "first *walkable* dungeon" choice (commit `52c0809`), not a native-boot fact — so no code change.
> The 2026-07-17 claim "DoK's real game-start block is 34" (item 3 below) is hereby corrected: it was
> circular (cited `gameData.ts`'s own annotation). Side-finding: DoK's ECL dialect gives opcodes
> `0x1d`/`0x2c` different operand counts (0 and 1) than `GEN1_WORD_SETS` assumes — prior DoK scan
> results crossing those opcodes (e.g. "block 34 has zero combat candidates") need re-audit. See
> "2026-07-18 Update 8" below.
>
> **2026-07-18 Update 9 (static only, no DOSBox-X):** Update 8's operand-count side-finding is
> **CONFIRMED, per-game-audited across all nine Gen1 titles, FIXED in engine + tools, and the
> re-audit lands the payoff**: DoK's "block 34 has zero combat candidates" was a desync artifact —
> the corrected scan finds **3 combat candidates in block 34** (Cekos, the Greybox `eclInitBlock`),
> including a fully-decoded SIVAK×15 ambush at a single byte-grounded GEO cell `(11,1)`, and DoK
> overall goes 14→24 candidates / 4→10 rostered. The dialect split is clean and data-proven:
> pre-1991 titles (Pool/CoAB/Secret/CoK/NWN) keep the long frames (`0x1D`=1, `0x2C`=6); 1991+
> titles (**DoK, Gateway, Treasures, PoD**) use short frames (`0x1D`=0, `0x2C`=1); `0x21`=3
> everywhere. Block 33's famous "invalid GOTO operand `0x79` right after SETUP_MONSTER #70 in the
> PRIESTS branch" is re-attributed: the corrected PRIESTS branch has NO SETUP_MONSTER — it jumps to
> a shared table-driven encounter builder (row 8 = ROGUE×4 + BLACK WIZARD×1 + PATRIARCH×3), and the
> `01 79 7f` bytes are real retail data inside that shared builder at 0x9b28, one instruction before
> its roster loads. The "monster ids 66/67/70/72 out of range" claim is also corrected (MON1CHA is a
> sparse 64-record set with ids up to 97; all those ids are real records). See "2026-07-18 Update 9"
> below for the audit method, per-game verdicts, the code changes (`ECL_GEN1_SHORT`,
> `PROFILE_WORD_SETS`), and the candidate-route spec a browser-route implementation can consume.
>
> This doc records a thorough, byte-grounded investigation of both of DoK's CFG-scanned "rostered"
> candidates and the precise, independently-corroborated reasons neither closes into a proven
> `retail GEO cell/search -> ECL monster setup -> COMBAT -> outcome -> resume -> persist` chain, per
> `docs/engine/BUILD-QUEUE.md`'s "Blocked prerequisite for CoK/DoK" leaf and the "UNLOCATED beats
> invention" convention (`docs/engine/HANDOFF.md` §5). Companion to
> `docs/engine/research/cok-natural-route.md` (CoK's proven slice, promoted the same day) and
> `docs/engine/research/persistent-natural-routes.md` (the established route-proof contract).

## What Was Attempted

Same methodology as CoK's slice: decode a Gen1 DoK ECL encounter from its own DAX corpus (reusing
the already-known CoK->DoK Gen1 format deltas — GEO header shape, the `0x7F` sentinel, the `8X8D`
tile bank, 216-byte character/monster records, coded items — documented in this project's session
memory and in the neighbouring `docs/engine/research/dok-chrdata-save-format.md` and
`docs/engine/research/dok-8x8d-amiga-format.md`), prove a byte-grounded GEO selector cell, run it
through the real engine to COMBAT, resume, and a save v2 round-trip.

`build/gen1-ecl-encounters.json`'s `death-knights-of-krynn` entry (built by
`tools/gen1_ecl_encounter_scan.py`, already covering all three of DoK's `ECL1..3.DAX` /
`GEO1..3.DAX` archives — there is no fourth area) lists **14 total decoded COMBAT paths, 4 with a
local `LOAD_MONSTER` roster**. Those 4 rostered entries collapse to exactly **2 distinct combat
sites** (each reached via two header entries — `camp_interrupted` and `search_location` — landing on
the same `combat_offset`):

| Site | Combat vaddr | Roster (as scanned) | Confidence |
| --- | --- | --- | --- |
| `ECL1.DAX#17` | `0x8e2c` | `[mem 0x4C04], [mem 0x4C05], [mem 0x4C04]` (fully dynamic id+count+picId) | `decoded-static-path-with-roster` |
| `ECL1.DAX#33` | `0x9b86` | `#28 (imm), [mem 0x7F7A], #28 (imm)` (immediate id, dynamic count) | `decoded-static-path-with-roster` |

The other 10 candidates (`ECL1.DAX#32` ×2, `ECL1.DAX#35` ×5, `ECL3.DAX#80/96/98` ×1 each) are all
flagged `external-or-host-state-unresolved` (empty roster) — every one shares the same
`combat_vaddr` across all five header entries of its own block, the same shape CoK's own research
(`gen1-retail-searchlocation-combat-proof.md`) already identified as the generic "wandering monster"
RNG-gated check every dungeon block carries, not a per-cell scripted encounter. This project's own
RNG algorithm (seg051) is already a documented, separately-tracked genuine blocker (needs a
DOSBox-X dynamic trace; see `docs/engine/research/decompile-worklist.md`) — these 10 were not
re-investigated here for that reason.

## Block 33, Selector 33 — the Stronger Candidate

`GEO1.DAX#33` has **five** cells whose descriptor low six bits equal 33: `(15,5)`, `(11,9)`,
`(15,10)`, `(8,11)`, `(14,13)`, all raw byte `0xA1`. (Unlike CoK block 34's unique selector-28 cell,
DoK reuses this selector across five physically separate cells — plausible for a "random priest
camp" theme that can appear in multiple rooms.) Reachability from any specific Greybox default DoK
spawn was not separately re-derived here (browser wiring is out of scope for this task, per the
Claim Boundary below); the GEO byte-grounding itself is the load-bearing fact.

### Full decoded chain (byte-verified, `tools/gen1_ecl_encounter_scan.py`'s address model:
`file_offset = ((vaddr + 0x8000) & 0xFFFF) + 2`, same as CoK)

```text
83fc  GOSUB 0x9cfc                     turn-count side effect subroutine (harmless; both compare
9cfc  COMPARE #14, [4bc9]              outcomes independently write [4bfd] then RETURN — does not
9d02  IF_LE  -> SAVE #8,[4bfd]         gate reachability)
9d09  IF_GT  -> SAVE #11,[4bfd]
9d10  RETURN

8400  SAVE #0, [4c00]
8406  SAVE #90, [7ec6]
840c  AND #63, [c04f] -> [7f79]        mask the cell descriptor (0xc04f, same address CoK's own
                                       AND uses) down to the low 6 bits — this IS the GEO selector
8415  COMPARE [7f79], #12
841b  IF_LT  -> PRINTCLEAR "A SIGN SHOWS A "   (road-sign flavour; skipped for selector 33 >= 12)
842b  ON_GOTO [7f79], #43, [43 targets]        DIRECT INDEX jump table on the descriptor value;
                                                target[33] = 0x8ae6

8ae6  ADD #1, [4c10] -> [4c10]         per-cell VISIT COUNTER (this block's nearest analogue to a
8aef  COMPARE [4c10], #2               "consumed bit" — see Claim Boundary)
8af5  IF_EQ  -> GOTO 0x8ba4            (2nd visit: RANDOM re-roll branch, no combat via this path)
8afa  IF_GT  -> GOTO 0x85bc            (3rd+ visit: flavour-text-only EXIT)
8aff  SAVE [4c57] -> [7f79]            SECOND selector, read from [0x4c57] — NOT derived from the
                                       cell descriptor; a scratch cell this same block reuses for
                                       several unrelated purposes elsewhere (writes seen at 0x876d,
                                       0x9177, all under different, story-gated conditions that do
                                       not naturally fire for a fresh game) — requires an EXPLICIT
                                       seed, `[0x4c57] = 3`, to reach the branch below deterministically
8b06  ON_GOTO [7f79], #6, [0x8b1e, 0x9c09, 0x8b60, 0x8b76, 0x8b1e, 0x85bc]
                                       index 0/4 -> PARTYSTRENGTH-gated stall loop (no combat unless
                                         party strength >= 128, and that TRUE branch's own next
                                         instruction decodes to opcode 0x56 — UNDEFINED, i.e. also
                                         dead/broken)
                                       index 1 -> PRINTCLEAR + EXIT (flavour only)
                                       index 2 -> PRINTCLEAR + GOTO (loops into index 0's stall)
                                       index 5 -> PRINTCLEAR + EXIT (flavour only)
                                       index 3 (seed=3) -> the only index that reaches a real setup:

8b76  PRINTCLEAR "PRIESTS HOLD AN EVIL RITE."
8b8d  DELAY
8b8e  PRINT " 'HEATHENS!'"
8b9a  SAVE #8, [4c58]                  UNCONDITIONAL, fixed table row index = 8
8ba0  GOTO 0x9ad5

9ad5  SAVE #0, [7f79]
9adb..9b17  seven GETTABLE calls, base tables 0x9d14/0x9d1e/0x9d28/0x9d32/0x9d3c/0x9d46/0x9d50,
            index [4c58]=8, destinations [7ec6],[7f7a..7f7f] — reads REAL FILE-EMBEDDED BYTES
            (verified against `EclVm`'s own `case 0x2a` GETTABLE implementation, which falls back to
            `this.raw[...]` when the address is not yet in the live memory map): row 8 =
            {7ec6:75, 7f7a:0, 7f7b:4, 7f7c:0, 7f7d:0, 7f7e:1, 7f7f:3} — fully deterministic, static
            game data, NOT a runtime seed despite the scanner's conservative
            `requires_runtime_seed: true` flag (which only reflects "this operand's code is dynamic",
            not "this operand's resolved value is unknown")

9b21  SETUP_MONSTER #70, #1, #255      <-- BLOCKER: see "The Blocker" below
9b28  GOTO <malformed operand>
9b2b  CLEARMONSTERS
9b2c..9b7d  six COMPARE/IF_NE/LOAD_MONSTER groups gated on [7f7a..7f7f] != 0:
            slot1 id=28 (HELLHOUND, valid) count=[7f7a]=0 -> skipped
            slot2 id=45 (ROGUE, valid)     count=[7f7b]=4 -> LOAD_MONSTER #45, 4, #45
            slot3 id=72 (OUT OF RANGE)     count=[7f7c]=0 -> skipped
            slot4 id=66 (OUT OF RANGE)     count=[7f7d]=0 -> skipped
            slot5 id=67 (OUT OF RANGE)     count=[7f7e]=1 -> LOAD_MONSTER #67, 1, #66 (would load)
            slot6 id=70 (OUT OF RANGE)     count=[7f7f]=3 -> LOAD_MONSTER #70, 3, #70 (would load)
9b86  COMBAT
```

DoK's `MON1CHA.DAX` decodes to exactly **64** monster records (ids 0-63:
`decodeMonsterArchive(bytes, 'dok')`, verified directly). Ids 66/67/70/72 — three of this table
row's six slots, including the two slots this specific row would actually load a nonzero count for
— are **out of range**. Id 70 is also the exact id `SETUP_MONSTER` uses immediately before the
broken `GOTO`. This is independent, corroborating evidence (unrelated to the VM operand issue below)
that this exact script region is not reliable, currently-decodable retail content: either it is dead
code the retail game never legitimately reaches, or DoK's real monster-id space for this mechanic is
larger/different than the 64-entry `MON1CHA.DAX` bestiary in a way not yet understood.

## The Blocker

Live execution (`primeSearchLocation` + `EclVm.run()`, real `ECL1.DAX` bytes, seed `[0x4c57]=3`)
reaches the "PRIESTS HOLD AN EVIL RITE. 'HEATHENS!'" text exactly as decoded above, then **halts**
before `COMBAT`. Root cause, precisely diagnosed:

- At vaddr `0x9b28`, immediately after `SETUP_MONSTER #70, #1, #255`, the next instruction is
  `GOTO` (opcode `0x01`) whose target operand has **code `0x79`** — not one of the address-operand
  codes (`1`, `2`, `3`, or `0x81`).
- `packages/engine/src/ecl/vm.ts`'s `targetOffset(a)` (`return a.word`) and `addrOf`/`.word`
  resolution do **not** validate operand code before using it as a jump target; `inCode(127)` (word
  `0x7f` = 127) is `true` (127 falls inside `[headerLen, raw.length)`), so the VM jumps to file
  offset 127 — the middle of an unrelated earlier instruction — and decodes garbage from there,
  eventually producing an unresolvable print (`stringRef` far outside any real string table) and
  `status: 'halted'`.
- This is corroborated, not guessed: the shared Gen1 "Rosetta Stone" oracle this whole project treats
  as authoritative for Gen1 VM semantics, `coab_extracted/Classes/Opperation.cs`, only sets
  `highSet = true` for operand codes `1`/`2`/`3` (and `0x81`, via the string-pointer branch in
  `coab_extracted/engine/ovr008.cs`'s `vm_LoadCmdSets`); its `Word` property getter **throws**
  (`InvalidOperationException`) if read while `highSet` is false. `coab_extracted/engine/ovr003.cs`'s
  `CMD_Goto` reads `.Word` unconditionally. In other words: in the original engine's own operand
  model, a `GOTO` with operand code `0x79` is not a valid instruction at all — it would fault, not
  silently resolve to some sensible address. `tools/gen1_ecl_encounter_scan.py`'s own static model
  independently treats non-{0,1,2,3}-coded GOTO operands as **not a resolvable target** (falls
  through to the next instruction instead), which is why the earlier *static* CFG scan reported this
  path as reaching `COMBAT` at all — that fallthrough is the scanner's simplifying convenience for
  graph traversal, not a claim about real interpreter behaviour, and it disagrees with both
  Greybox's own live `EclVm` and the retail oracle's operand model here.
- Net effect: **every** index of the second-tier six-way dispatch that reaches the shared
  `GETTABLE`/`SETUP_MONSTER` tail at `0x9ad5` hits this exact same instruction unconditionally (it is
  straight-line code, no branch skips it), so no choice of `[0x4c57]` seed avoids it. This is not
  specific to the "PRIESTS" branch or to table row 8 — it blocks the entire table-driven combat
  mechanism at this GEO location.

This reads as either (a) genuinely dead/unreachable retail content in `Death Knights of Krynn`
itself (the original DOS binary may never legitimately execute this exact byte range either), or (b)
an as-yet-undiscovered address-encoding convention for GOTO operand code `0x79` that neither
Greybox's `EclVm` nor the `coab_extracted` decompile currently models. Resolving which would need a
DOSBox-X dynamic trace of real DoK, the same category of "genuinely blocked, needs a live trace"
item this project already tracks for the seg051 RNG algorithm and the DQK ECL opcode table
(`docs/engine/research/decompile-worklist.md`) — not attempted here, out of this task's budget.
Speculatively patching `EclVm`'s GOTO handling to paper over one unexplained operand code, without
that trace, risks exactly the kind of invented behaviour "UNLOCATED beats invention" forbids, and
could silently change already-proven CoK/Pool/CoAB/Secret routes that share the same `EclVm` code
path.

## 2026-07-17 Update — DoK's Own Operand Parser and CMD_Goto Located and Traced

This section directly answers the "as-yet-undiscovered address-encoding convention" open question
left by "The Blocker" above, via the exact DOSBox-X dynamic trace that section flagged as the
needed next step. It does **not** change the verdict that this GOTO does not currently resolve to
`COMBAT` in Greybox — it explains, with retail evidence, *what real DoK does instead* and why that
behaviour was not ported into `EclVm`.

### Static: DoK's operand parser and CMD_Goto match the CoAB oracle exactly

`tools/map_dok_ecl_dispatch.py` (new; mirrors `tools/map_pool_ecl_dispatch.py`'s same-subsystem
structural-matching technique verbatim, run against DoK's own real `GAME.OVR` instead of Pool's)
locates DoK's opcode dispatcher, operand parser (`vm_LoadCmdSets`), and `CMD_Goto` handler by
disassembling the CoAB oracle's own known-good functions (`coab_extracted/Classes/Opperation.cs`'s
model, `coab_extracted/engine/ovr008.cs`'s `vm_LoadCmdSets`, `build/coab-oracle-map.json`'s
`commandTable` / `@parse_command_sub$q4Byte` entries) and finding DoK's nearest-shape function by
instruction-mnemonic/operand-type token sequence (`SequenceMatcher` ratio + trigram Jaccard).

Result (`python tools/map_dok_ecl_dispatch.py --strict`, generates
`docs/engine/research/dok-ecl-dispatch-map.md` + `build/dok-ecl-dispatch-map.json`):

- DoK dispatcher: `GAME.OVR:0x3271` (302 instructions) vs. CoAB oracle `GAME.OVR:0x3cab` (288
  instructions) — sequence similarity `0.9763`, trigram Jaccard `0.7778`.
- DoK operand parser (`vm_LoadCmdSets`): `GAME.OVR:0x6ba8` vs. CoAB oracle `0x810a` — sequence
  similarity `1.0000`, trigram Jaccard `1.0000` (byte-identical control-flow shape on first run).
- DoK's dispatch table lists 54 opcodes (`0x00`-`0x41`, contiguous, none missing); opcode `0x01`
  (GOTO) handler resolves to `GAME.OVR` flat file offset `0x8b8`.

A `1.0000`/`1.0000` match on the operand parser is a strong result: it means DoK's compiled
`vm_LoadCmdSets` has the exact same instruction sequence and operand-type shape as CoAB's, differing
only in absolute data-segment address literals — the expected signature of a different link of the
same source, not a different algorithm or a DoK-specific extension.

Manually disassembling DoK's own `CMD_Goto` at file offset `0x8b8` confirms the CoAB source
(`coab_extracted/engine/ovr003.cs`'s `CMD_Goto`) translates literally: it calls `vm_LoadCmdSets(1)`,
then reads two **fixed, hard-coded global memory addresses** — a "low" byte and a "high" byte — and
combines them as `word = low | (high << 8)`, with **no check of the operand's `code` field at all**.
This matters because `coab_extracted/Classes/Opperation.cs`'s C# decompile models operand access
through a `.Word` property getter that **throws** `InvalidOperationException` if the internal
`highSet` guard boolean was never set true — which reads, on a first pass, like "an invalid operand
code should fault." That guard is a **decompiler abstraction**, not real x86 behaviour: the actual
assembly has no such check. `vm_LoadCmdSets`'s parse loop only *writes* the high-byte global when the
operand's code is one of `{1, 2, 3, 0x81}` (matching `packages/engine/src/ecl/disassemble.ts`'s
`readOpp()` exactly — confirmed already in the 2026-07-16 pass above, and unchanged here). For any
other code (including the blocking `0x79`), the low-byte global is still written (it's a fixed
2-byte read regardless of code), but the high-byte global is simply **never touched** — it silently
retains whatever value the *previous* successful high-byte write, anywhere earlier in the game's
execution, left there. `CMD_Goto` then blindly combines fresh-low + stale-high into a jump target,
with no validation and no fault.

### Dynamic: confirmed live, twice, in DOSBox-X

`tools/trace_dok_goto_operand.ps1` (new) stages an isolated, hash-verified DoK runtime
(`tools/stage_dok_runtime.py`, new — mirrors `tools/stage_coab_runtime.py`'s convention; DoK is the
only Gen1 title in this project with **two** save directories, `SAVE/` and `SAVE_CH/`, both staged),
then drives DOSBox-X's DEBUGBOX debugger (same `BPINT 21 42` VROOMM-overlay-seek-capture pattern as
`tools/trace_coab_symbol_bytematch.ps1` / `trace_pool_symbol_bytematch.ps1`, including that script's
two-phase "the seek breakpoint fires before the overlay read completes, so a post-read breakpoint
must be armed and waited on before trusting the destination segment's bytes" methodology) to:

1. Catch DoK's own overlay load, confirm the resident bytes at the resolved segment's `+0xb8` byte
   match the disassembled `CMD_Goto` entry exactly (`cmd_goto_entry_byte_match: true`).
2. Arm a breakpoint at the post-combine instruction inside `CMD_Goto` (`<destSeg>:00B6`) and let the
   game run through its silent boot/attract sequence, capturing every hit's `AX` register and the raw
   low/high/`ecl_offset` global memory bytes.

Run twice for determinism (`build/dok-goto-trace-20260717c/`, `build/dok-goto-trace-20260717d/` —
`build/` trace/stage output directories, not committed): both runs independently produced **6 valid
hits**, all identical:

```json
{"cs_ip": "3854:00B6", "ax_register": "0x8469",
 "low_byte_0xc714": "0x69", "high_byte_0xc6d4": "0x84",
 "ecl_offset_word_0x8c48": "0x8469", "combine_matches_low_or_high8": true}
```

This directly confirms, on real retail DoK: `CMD_Goto` genuinely executes during normal play (it is
not dead code the loader skips), its resident code is byte-identical to the disassembly used above,
and the combine formula is exactly `word = low | (high << 8)` with no operand-code gate — matching
the CoAB-source-derived prediction precisely. (An earlier trace attempt reported `entry_byte_match:
false` and `valid_hits: 0`; both were tooling bugs, not findings — a missing post-read breakpoint
step reading stale overlay content, and a PowerShell `-shl` operating on a byte-typed value and
silently truncating to `0` — both fixed in the committed script; see the fixed script's inline
comments.)

### What this does and does not resolve

**Resolved:** the open question of whether DoK implements some undiscovered DoK-specific addressing
convention for non-`{1,2,3,0x81}` operand codes. It does not. DoK's operand parser and `CMD_Goto`
are structurally and behaviourally identical to the shared Gen1/CoAB oracle model in every respect
this investigation could exercise. Operand code `0x79` at vaddr `0x9b28` does **not** crash real DoK
and does **not** indicate malformed/dead script bytes — it is an ordinary (if unusual) way of
writing "jump using whatever the last address-coded operand's high byte happened to leave behind,"
which real hardware handles silently by definition (there is no code-validity check to fail).

**Not resolved:** the *exact* jump target real retail DoK computes for this specific GOTO at block
33/selector 33. That requires knowing the actual value of the "high" global (`0xc6d4` in the runtime
segment, `0x8c48`-relative `ecl_offset` in ECL address space) at the precise moment execution reaches
vaddr `0x9b28` in a real game — which depends on the full history of every earlier address-coded
operand parsed since boot, not a property this static+silent-boot trace observed or could reasonably
hand-derive. Reaching that exact point live (walking a real DoK save to the block 33 GEO cell,
triggering the search, and single-stepping through this exact instruction) was not attempted — it is
a materially larger trace (interactive gameplay navigation, unknown DOS movement-key sequence to the
five candidate cells) than this task's budget covered, and remains the honest next substep.

### Why `EclVm` was not modified

A tempting "minimal" fix exists: treat any GOTO operand code outside `{1, 2, 3, 0x81}` as
non-resolvable and fall through to the next instruction — matching `EclVm`'s existing
`GOTO(nonlocal)` fallback path, and matching what `tools/gen1_ecl_encounter_scan.py`'s static CFG
scanner already assumes (which is why the *static* scan reported this path reaching `COMBAT` even
though live execution halts). This was considered and **deliberately rejected**:

- The dynamic trace proves real DoK does **not** fall through — it computes a real, deterministic
  (if history-dependent) jump target from stale global state. "Fall through" would be a plausible-
  looking but **unverified guess** about what that target's *effect* resolves to, not a traced fact.
  `EclVm` is currently per-instruction stateless for this kind of cross-instruction persistent
  scratch memory in the way this mechanism needs; modelling it faithfully (a persistent "last high
  byte written" global, seeded by the game's actual execution history from boot) is an
  architecture-level change to operand semantics, not a scoped point-fix for one instruction.
- `EclVm`'s GOTO/operand code is shared by every proven Gen1 route (CoK, Pool, CoAB, Secret). A
  speculative behaviour change here — even one that looks locally reasonable — risks silently
  altering already-proven routes' semantics for any operand code outside the four validated ones,
  which none of those routes are known to currently exercise, but none were re-audited for that
  possibility either.
- Per `docs/engine/HANDOFF.md` §5, "UNLOCATED beats invention": this round's job was to determine
  ground truth, not to make the test pass. Ground truth says the *mechanism* differs from Greybox's
  current fixed-garbage-address behaviour, but the *specific resolved value* for this exact site
  remains undetermined — implementing a guess would violate the same convention this doc's 2026-07-16
  section already invoked to justify not patching in the first place, just with better-sounding
  cover.

`packages/engine/src/ecl/vm.ts` is therefore **unchanged**. The existing regression tripwire test in
`packages/engine/test/dungeonEvents.test.ts` (`status === 'halted'`) still passes and still correctly
reflects Greybox's current behaviour.

### New tooling (this round)

- `tools/stage_dok_runtime.py` + `tools/test_stage_dok_runtime.py` — isolated, hash-locked DoK DOS
  runtime stage (mirrors `stage_coab_runtime.py`; stages both `SAVE/` and `SAVE_CH/`).
- `tools/map_dok_ecl_dispatch.py` + `tools/test_map_dok_ecl_dispatch.py` — same-subsystem structural
  CoAB-oracle matching for DoK's dispatcher/operand-parser/CMD_Goto (mirrors
  `tools/map_pool_ecl_dispatch.py`); generates `docs/engine/research/dok-ecl-dispatch-map.md` +
  `build/dok-ecl-dispatch-map.json`.
- `tools/trace_dok_goto_operand.ps1` — the DOSBox-X DEBUGBOX dynamic trace described above (mirrors
  `tools/trace_coab_symbol_bytematch.ps1`'s seek-capture / post-read-breakpoint / byte-match /
  execution-loop pattern).

## Block 17 — Also Investigated, Also Blocked

`ECL1.DAX#17`'s single rostered candidate (combat at `0x8e2c`) has a **fully dynamic** roster — id,
count, *and* pic-block id are all read from memory (`[0x4C04]`, `[0x4C05]`, `[0x4C04]`), not a mix
of immediate id + dynamic count like block 33. Its `branch_decisions` list carries several early,
fixed-address `condition-false`/`selector-target` entries (`0x8228`, `0x96b9`, `0x8b3e`, `0x96de`,
…) that are not obviously backdrop-driven.

Empirically: sweeping every possible cell backdrop value (`0..63`) through `primeSearchLocation`
against this block's real bytes, from blank memory, produced **zero** non-trivial effects for every
single value (`status: 'exited'`, no prints, no combat) — meaning reaching this candidate's decoded
path requires additional prerequisite memory state beyond the cell descriptor that was not
identified within this task's time budget (most likely a `camp_interrupted`-specific host flag, given
that entry point is one of the two the scanner found leading here). Given block 33 already provided a
stronger, more fully characterized (if ultimately blocked) candidate, block 17 was not pursued
further.

## What Was NOT Done (and why)

- **No save v2 round-trip row was added.** `packages/engine/test/saveGame.test.ts`'s natural-route
  table rows all represent a real, persisted post-combat state (`areaMemory[...]` surviving a
  serialize/deserialize round trip after a genuine victory). DoK has no such state to persist yet —
  adding a row here would fabricate a proof that does not exist. This mirrors the "town enter/exit
  transition" leaf's honestly-blocked sub-bullet
  (`docs/engine/BUILD-QUEUE.md`, the leaf around the "Rejected/honestly-blocked attempt" text): no
  test claims success it did not earn.
- **No `tools/goldbox_corpus_routes.json` promotion.** The `death-knights-of-krynn` entry already
  exists there (`surface: "exploration"`, `ecl_block: 34`, matching `GameData`'s `dok` profile's
  `eclInitBlock`). Promoting it to `"natural-combat"` would require exactly the proven chain this doc
  shows is currently blocked; the entry is left untouched.
- **No browser wiring.** Explicitly out of scope for this task regardless of route status (per the
  task's own instructions) — `apps/web/src/ui/{gameData,explore,main,docs,support}.ts` and
  `apps/web/test/e2e.mjs` were not read or touched.

## Automated Evidence

- Engine investigation test (documents the exact blocked state, not a route proof):
  `packages/engine/test/dungeonEvents.test.ts`, "primeSearchLocation — DoK ECL1 block 33
  natural-encounter investigation (descriptor 33, genuinely blocked)". Asserts the real GEO cell
  count/descriptor, the real retail flavour text, the visit-counter side effect, and
  `status === 'halted'` — a regression tripwire: if a future engine change resolves the GOTO operand
  differently, this assertion fails loudly, which is the intended signal to finish this proof.
- Static CFG scan: `build/gen1-ecl-encounters.json`'s `death-knights-of-krynn` entry (unchanged,
  already present from an earlier scan pass); `tools/gen1_ecl_encounter_scan.py`.
- Reachability tooling: `tools/find_geo_path.py`'s `decode_descriptors` (used ad hoc for the
  five-cell selector-33 census above; not invoked as a route proof since there is no combat route to
  route-find to).

## Claim Boundary

**What is proven:** DoK's Gen1 CFG scan is exhaustive over its real corpus (`ECL1..3.DAX` /
`GEO1..3.DAX`, no additional areas); exactly two combat sites carry any local roster evidence; block
33 selector 33 is a real, byte-grounded, five-cell GEO selector whose SearchLocation dispatch, visit
counter, second-tier dispatch, and file-embedded monster table all decode against real bytes and
execute through the live engine up to real retail flavour text; the precise instruction and operand
where live execution then halts, corroborated independently by both the retail oracle's own operand
model (`coab_extracted`) and an out-of-range monster-id inconsistency in the same table row.

**What is NOT proven, honestly:** a complete `search -> COMBAT -> resume -> persist` chain for either
DoK candidate. No GEO cell reachability-from-spawn walk was computed (moot without a combat
endpoint). No save v2 persistence exists to round-trip. The corpus's `death-knights-of-krynn` entry
remains at `exploration` tier, unchanged. This does not prove DoK's block 33/17 mechanisms are
unfixable — only that this task did not find a byte-grounded way to complete them without either
inventing behaviour or exceeding its budget with a DOSBox-X trace.

**2026-07-17 addendum:** the DOSBox-X trace called for above has now been run (twice, reproducibly).
It resolved the "undiscovered addressing convention" question (there is none — DoK matches the CoAB
oracle model exactly, structurally and dynamically) but did not resolve the *specific* jump target
for this exact instruction at this exact point in a real game, because that depends on the full
execution-history state of a persistent global this investigation's silent-boot trace did not carry
gameplay far enough to determine. See "2026-07-17 Update" above for the full account. `EclVm` remains
unmodified; the claim boundary above is otherwise unchanged.

## 2026-07-17 Update 2 — Interactive Walk-to-Cell Attempted: Real Chargen-Skip Shortcut Found, Navigation Itself Blocked

This section directly follows up on the previous update's own "Next Substeps" item 2 (an interactive
DOSBox-X trace that walks a real DoK save to a selector-33 GEO cell). Per this task's process
requirement, the first step was checking for existing save/character-creation-skip infrastructure
before attempting to script character creation from scratch — `tools/capture_gen1_save.ps1` (captures
a manually-created save + its `CHRDAT*` sidecars into `build/manual-save-captures/`),
`tools/patch_pool_save_pose.py` (byte-patches Pool's own save's confirmed x/y/facing offsets),
`tools/clone_pool_save_sidecars.py`, and `tools/stage_dok_runtime.py` (already stages both `SAVE/` and
`SAVE_CH/`) were all read.

### A real shortcut exists, previously unflagged as route-relevant

The read-only GOG install's own `Death Knights of Krynn\SAVE\` directory (not something Greybox
created — shipped by the retail installer) already contains a complete, near-fresh Slot A save:
`SAVGAMA.PTY` plus `CHRDATA1.{GAM,JNK,WIZ}` through `CHRDATA6.{GAM,JNK,WIZ}` — the six canonical DoK
retail pregens (Dryden, Lillith, Tanar, Flavius, Neacail, Celeste, per
`docs/engine/research/dok-chrdata-save-format.md`), with **zero `.EFF` files** (no active
effects/buffs — consistent with "never played"). Loading this save from the DOS front end's own
Load-Game menu is functionally equivalent to "new game with pregenerated characters" and genuinely
bypasses manual character creation — no keypress scripting for the character-generation wizard is
needed. This is a real, useful finding for any future DoK interactive-trace round, independent of
whether the rest of this round's walk attempt succeeded.

### Why the walk itself was not attempted further: three independent, unresolved gaps

Having a save is necessary but not sufficient — actually reaching one of the five `GEO1.DAX#33`
selector-33 cells `(15,5)`, `(11,9)`, `(15,10)`, `(8,11)`, `(14,13)` and confirming arrival requires
knowing where the party is, which this round found is blocked on three separate, genuinely unresolved
prerequisites, none of which this round's budget covered closing:

1. **DoK's own save position/pose fields are not reverse-engineered.**
   `docs/engine/research/dok-chrdata-save-format.md` section 6 already flagged `SAVGAMA.PTY`'s real
   party/quest state as an unresolved "hot zone" at offsets ~196-513 — dense, mixed-purpose bytes, not
   an isolated x/y/facing field the way Pool's save is (`tools/patch_pool_save_pose.py`'s byte-proven
   offsets 12801/12802/12803). This round re-confirmed that emptily: a byte-level diff of the fresh
   `SAVE\SAVGAMA.PTY` against three independently-played `cloud_saves\SAVE\SAVGAM{A,B,C}.PTY` copies
   (2913 bytes each, distinct SHA-256 hashes) shows the hot zone going from 7 nonzero bytes (fresh) to
   124-131 nonzero bytes (played), with values like `98`, `255`, `63` that are not a clean 0-15
   coordinate pair — there is no candidate byte offset that looks like an isolated x/y/facing triplet
   the way Pool's did. Without this, a save cannot be pose-patched to start the party near a target
   cell the way Pool's route save was (`patch_pool_save_pose.py`'s whole approach).

2. **No live position telemetry exists for DoK's own runtime.** Pool's own interactive walk script
   (`tools/trace_pool_ecl18_route.ps1`) depends on hand-derived DGROUP offsets —
   `AreaPointerDgroupOffset=0x49D2`, `EclCursorDgroupOffset=0x49ED`, `EclHeaderDgroupOffset=0x49E3`,
   `MapCellVirtualAddress=0xC04F`, `ArchiveSetDgroupOffset=0x5376` — that took a dedicated prior
   investigation specific to Pool's own binary to locate (`docs/engine/research/
   pool-runtime-ecl-host-selector.md` and the surrounding Pool ECL-cursor research). No equivalent
   investigation has been done for DoK's `GAME.OVR`. Without it, scripted keypresses have no way to
   confirm mid-walk which GEO cell the party actually occupies, or to detect the moment the
   `search_location` dispatch for block 33 specifically (as opposed to any other block/selector) fires
   — only the eventual on-screen retail text ("PRIESTS HOLD AN EVIL RITE...") would be observable, and
   only after the fact, with no way to arm the `CMD_Goto` breakpoint (`tools/trace_dok_goto_operand.ps1`
   already locates `<destSeg>:00B6`) at precisely the right moment without that telemetry.

3. **DoK's real game-start block is 34, not 33 — established this round as retail-grounded fact, not a
   guess.** `apps/web/src/ui/gameData.ts`'s `dok` profile sets `eclInitBlock: 34`, annotated "a
   verified two-set dungeon init" — Greybox's own prior reverse-engineering already pinned this as the
   block a fresh DoK game actually boots into. Cross-checked against `build/gen1-ecl-encounters.json`:
   block 34's own scanned entry has **zero** decoded combat candidates (`"candidates": []`), a
   different, unrelated block from block 33's fully-characterized-but-blocked chain. This means
   reaching block 33's five selector-33 cells requires an **inter-block transition** — crossing from
   block 34's own 16x16 GEO sub-map into block 33's, or via some other area-change mechanism — whose
   concrete form (a geometric edge-exit the party walks off the map through, vs. a scripted
   stairs/teleport dispatch) is not established for this specific block pair.
   `tools/find_geo_path.py` only pathfinds *within* a single GEO block (`decode_edges`/`find_path`
   operate on one block's 16x16 cell array); it has no cross-block adjacency model. This project does
   have a general mechanism for exactly this category of problem (`Explorer.edgeExits`/
   `markMapEdgeExits`, built for CoK's own town-exit wiring per this project's session memory), but
   nothing has proven it, or any other transition, actually connects block 34 to block 33.

### Why this round stops here rather than force a result

All three gaps above are independently unresolved, and each is its own nontrivial RE sub-investigation
— comparable in scope to what it took to locate DoK's own `CMD_Goto` handler in the *previous*
2026-07-17 round (structural CoAB-oracle matching plus a twice-reproduced live DOSBox-X trace). With
all three open, scripting blind interactive keypresses this round would not have produced a result
verifiable to this project's standard: no way to confirm which cell was actually reached, no way to
confirm a captured `AX` value corresponds to the intended selector-33 search rather than some other
GOTO entirely, and — critically — no reliable way to reproduce an unverified blind-navigation sequence
identically twice (DOSBox-X keypress timing against an un-instrumented walk is exactly the kind of
nondeterminism this project's `BPINT`/`BP` register-dump pattern exists to avoid). Per this task's own
explicit guidance and the project's "UNLOCATED beats invention" convention
(`docs/engine/HANDOFF.md` section 5), this round documents the gap precisely rather than attempting a
walk that could not be trusted even if it happened to "work" once.

**No code was touched this round.** `packages/engine/src/ecl/vm.ts` remains exactly as the previous
round left it; `packages/engine/test/dungeonEvents.test.ts`'s existing regression tripwire ("DoK ECL1
block 33 natural-encounter investigation... `status === 'halted'`") is unchanged and still passes,
still correctly reflecting current behaviour. No new test was added — nothing new was proven at the
engine level this round, so adding one would misrepresent status. No `tsc`/`vitest`/`e2e`/Python
`unittest` gates apply (no source files, engine tests, or Python tooling were modified).

### Next Substeps (revised, prioritized)

1. **Highest leverage:** replicate Pool's own `pool-runtime-ecl-host-selector.md`-style live telemetry
   investigation for DoK specifically — locate DoK's own DGROUP offsets for the area/GEO-block
   pointer, player x/y, and current ECL cursor, using the same structural CoAB-oracle-matching
   technique already proven twice for DoK this session (`tools/map_dok_ecl_dispatch.py`'s approach).
   This would make any future interactive walk self-verifying step-by-step regardless of path length,
   independent of gap 3 below.
2. Establish the block 34-to-block-33 relationship: disassemble `ECL1.DAX` block 34's own
   `initial_entry`/edge-cell dispatch for any explicit block-33 reference, or check `GEO1.DAX` block
   34's boundary cells for edge-exit wall codes, mirroring the `Explorer.edgeExits`/`markMapEdgeExits`
   mechanism already built for CoK's own town-exit wiring.
3. Only once both of the above land would a scripted interactive walk (using the real `SAVE\SAVGAMA.PTY`
   pregen shortcut confirmed this round, no character-creation scripting needed) be attemptable with a
   realistic chance of a twice-reproduced capture of the real `CMD_Goto` jump target at block 33's
   search-location dispatch.
4. If either sub-investigation turns out itself to be a large undertaking, block 17 (this doc's other
   investigated-and-blocked candidate, with its own different prerequisite-memory-state gap) remains
   the alternative lead noted in the previous update.

## Next Substeps (original list, 2026-07-17 — superseded by the "2026-07-17 Update 2" section's revised, prioritized list above)

1. ~~A DOSBox-X dynamic trace of real DoK...~~ **Done, 2026-07-17** — see the "2026-07-17 Update"
   section above (`tools/trace_dok_goto_operand.ps1`, twice-reproduced). Operand code `0x79` is
   confirmed to be the CoAB-oracle-standard "stale high byte, no validation" mechanism, not a
   DoK-specific convention and not dead/malformed script data.
2. ~~The remaining gap is narrower...an interactive DOSBox-X trace...~~ **Attempted, 2026-07-17
   (Update 2)** — genuinely blocked on three separate prerequisites (save pose fields, live position
   telemetry, block 34->33 adjacency), none closed this round; see "2026-07-17 Update 2" above for the
   full account and the revised next-steps list. The text below is retained for historical context
   only; superseded by that section.
2-orig. The remaining gap is narrower and more concrete than before: determine the *actual* value of the
   high-byte global (`0xc6d4` in the traced runtime segment) at the moment live play reaches vaddr
   `0x9b28` in block 33. This needs an **interactive** DOSBox-X trace — a real save/movement sequence
   that walks a party to one of the five selector-33 GEO cells and triggers the search — rather than
   the silent-boot trace run so far, since the global's value depends on every address-coded operand
   parsed since boot, not just this block's own code. Concretely: stage a DoK save near a selector-33
   cell (or determine the DOS movement-key sequence from a fresh game to one), arm the same
   `<destSeg>:00B6` breakpoint, and continue capturing hits until reaching that GEO cell's search.
3. Once that concrete value is known, decide whether to encode it as a documented, evidence-backed
   constant/heuristic in `EclVm` (only if the resulting jump target is itself sensible retail content
   — e.g. lands inside a real instruction boundary and produces a coherent effect) or to conclude this
   is genuinely dead retail content the original game never legitimately reaches this way (in which
   case the correct fix is arguably "none" — this GEO cell's table-driven combat path may simply not
   exist in real DoK, and block 17 becomes the more promising lead instead).
4. Alternatively, characterize block 17's additional prerequisite memory state (its
   `camp_interrupted`-only branch decisions look like the more promising lead, per its
   `branch_decisions` list) if the block-33 trace is not pursued further.

## 2026-07-17 Update 3 — DoK Live Position Telemetry: Static Addresses Solid, Dynamic Capture Genuinely Blocked

Directly follows up on Update 2's gap #2 ("no live position telemetry exists for DoK's own
runtime"), attempting the same DGROUP-offset method already proven for Pool
(`docs/engine/research/pool-runtime-ecl-host-selector.md`). New tool: `tools/trace_dok_position_telemetry.ps1`.

### What was solidly established (static, reproducible)

Directly disassembling DoK's real `GAME.OVR` (not a CoAB-oracle structural guess) locates DoK's
ECL "host map register" read/write dispatch for vaddr block `0xC04B..0xC04F` at flat file offsets
~0x7A2C (read side) and ~0x7883-0x78FE (write side):

- `[0xc073]` = mapPosX, `[0xc074]` = mapPosY, `[0xc075]` = facing (write side remaps ECL 0/1/2/3 to
  0/2/4/6 N/E/S/W — exactly CoAB's own `gbl.mapDirection` convention), `[0xc076]` = wall type,
  `[0xc077]` = current GEO cell descriptor, `[0xdb75]` = a shared position-dirty flag set by both
  the X and Y writers.
- Independent, non-circular cross-check: `[0xc077]` (ECL vaddr `0xC04F`) is the *same* address
  DoK's own already-proven ECL1.DAX block 33 script reads at vaddr `0x840c`
  (`AND #63, [c04f] -> [7f79]`, this doc's "Block 33, Selector 33" section) — established
  independently, before this round touched `GAME.OVR` at all.
- The `CMD_Goto` post-combine DS-resolution anchor from `tools/trace_dok_goto_operand.ps1`
  (`<destSeg>:00B6`) continues to resolve reliably: runtime destination segment `3854`, entry
  byte-match `true`, identical across roughly 20 consecutive launches this round (seek sequence 0-33
  always ends at file offset `0x81D`, matching every prior run).

### What was newly automated and twice-reproduced: full menu navigation to the spawn screen

Building the interactive trace surfaced and fixed two real, previously-undocumented automation
bugs, both now load-bearing findings for *any* future interactive DOSBox-X trace in this project,
not just DoK:

1. **A halted/paused DOSBox-X guest does not service the emulated 8042 keyboard controller at
   all.** Any keypress sent via `Send-DosKeys` while the debugger has the CPU paused at a
   breakpoint is silently dropped, not queued. `Get-PositionSnapshot`'s original form read memory
   while paused-at-hit and returned without resuming, so *every* keypress issued after the first
   captured checkpoint raced a paused CPU, producing nondeterministic step failures. Fix: always
   issue `RUN` before sending a key, and resume immediately after reading memory, never leaving the
   CPU paused across a `return`.
2. **DoK's own boot sequence needs exactly three dismiss keypresses, not one**, before the real
   main menu is interactive: title/logo screen, "CREATED BY: SSI SPECIAL PROJECTS TEAM" dev-credits
   screen, then a "DEATH KNIGHTS OF KRYNN 1.10 ... DEMO" version banner. A single `ENTER` only
   dismisses one page; sending navigation keys (`{DOWN}{DOWN}`) before all three were dismissed
   caused those keys to be consumed advancing the remaining credit/banner pages instead of moving
   the main-menu cursor. Root-caused with a dedicated one-ENTER-per-iteration diagnostic
   (screenshot each time) that definitively counted three pages. This was misdiagnosed at first as
   an extended-scancode delivery problem for the `DOWN` key; ruled out via independent evidence that
   `tools/run_secret_load_regression.ps1` uses the identical `{DOWN}{DOWN}{ENTER}` pattern
   successfully for Secret of the Silver Blades via the same harness.

With both fixes in place, the full deterministic keypress sequence from cold boot to the shipped
`SAVGAMA.PTY` pregen save's spawn/eulogy screen was reliably reproduced **twice** (confirmed via
screenshot each time, showing the six canonical pregens SIR DRYDEN/LILLITH/TANAR/FLAVIUS/NEACAIL/
CELESTE and the on-screen HUD "7,13 N 00:00"): 3x `ENTER` (dismiss title/credits/banner) ->
`{DOWN}{DOWN}` (nav to LOAD SAVED GAME) -> `ENTER` (select) -> `ENTER` (DEATH KNIGHTS, pre-
highlighted) -> `ENTER` (slot A, pre-highlighted) -> `{DOWN}x5` (nav to BEGIN ADVENTURING) ->
`ENTER` (select-begin-adventuring, triggers the roster/eulogy narrative).

### The genuine blocker: no technique tried this round captures a live memory read at that screen

Five independent attempts, all evidenced in `build/dok-position-telemetry-20260717{a,b}/`
(git-ignored run output; the reusable tool itself is committed):

1. `CMD_Goto` breakpoint armed after an extra dismiss `ENTER` at the eulogy screen — no hit.
2. `CMD_Goto` breakpoint armed with periodic `ENTER` pokes every 4s during the wait — no hit.
3. `CMD_Goto` breakpoint armed immediately before the specific keypress that visibly transitions
   between narrative paragraphs — no hit (screenshot proved the on-screen text still advanced).
4. `CMD_Goto` breakpoint armed *before* `select-begin-adventuring` itself (the real save-load/
   world-init dispatch, and — unlike pure text-paragraph advances — exactly the kind of real
   ECL-driven dispatch this project has already proven fires `CMD_Goto` reliably at every earlier
   menu selection in this same investigation), with a generous 100-second wait — still no hit.
5. A from-scratch fallback anchor added this round, `Get-PositionSnapshotViaTimerTick`: since DGROUP
   is a single, fixed data segment shared by every overlay in this Borland Large-model runtime
   (already established for this game family via Pool's own investigation), DS should equal the
   live DGROUP segment at *any* point while DoK's own real-mode code is running, not only at a
   `CMD_Goto` hit. INT 8 (the 18.2 Hz timer tick) fires constantly regardless of what code is
   executing, so `BPINT 8` was armed and sampled 8 times (5s each, 40s total) at the settled spawn
   screen. Result: the debugger accepted the command (`Success: true`) but never printed a
   `DEBUG: Set interrupt breakpoint at INT 08`-style confirmation the way `BPINT 21 42` reliably
   does, and zero of the 8 samples produced a hit — strong evidence that DOSBox-X's `BPINT` hooks
   software `INT xx` instruction execution specifically, not hardware-vectored IRQ delivery, so this
   particular fallback technique does not apply to a timer IRQ the way it does to a software `int`.

Taken together (four `CMD_Goto` anchor points including a 100s wait, plus a structurally different
INT8 fallback that did not even register), the working conclusion is that DoK's post-load
world-init/narrative front end (the character/party-roster menu system and the eulogy/camp
narrative text) does not route through the same `CMD_Goto` handler in-dungeon ECL scripts use, at
least not in any way observable within this round's probing — an open, narrower question distinct
from (and now blocking further progress on) the original telemetry-address goal.

### Claim boundary

- **Solid and reusable:** the six telemetry addresses, cross-validated two independent ways. Any
  future trace that *can* get a live memory read at any point after DoK's own resident code is
  running (in-dungeon play, for instance, where `CMD_Goto` is already proven to fire constantly)
  can use `[0xc073]`/`[0xc074]`/`[0xc075]` immediately, with high confidence, without repeating this
  investigation.
- **Solid and reusable:** the full cold-boot-to-spawn-screen keypress sequence, twice-reproduced,
  plus the two general DOSBox-X automation bugs and their fixes (documented in
  `tools/trace_dok_position_telemetry.ps1`'s own comments).
- **Not achieved:** an actual byte-verified live read at the spawn screen confirming
  `[0xc073]=7, [0xc074]=13, [0xc075]=0` against the visible "7,13 N 00:00" HUD. This remains
  unconfirmed dynamically, despite being visually confirmed on-screen.
- **No code touched.** `packages/engine`/`apps/web` TypeScript untouched this round, per this
  round's own scope. No gates apply.

### Revised next substep for gap #2

A future round should either (a) find a *different* anchor instruction inside DoK's own
`GAME.OVR` that is provably hit during the post-load/narrative flow specifically (would need its
own dedicated disassembly pass, analogous to how `CMD_Goto` itself was found), or (b) abandon the
spawn-screen checkpoint and instead capture telemetry at an earlier point already proven to hit
`CMD_Goto` reliably — e.g. the `select-slot-a` menu step, which an earlier (superseded)
multi-checkpoint version of this round's script did capture successfully mid-session (`DS=13F2`,
`pos_x=14, pos_y=14, facing=East` — a plausible pre-load default, not yet the target spawn state,
but proof the address mapping itself produces sane, non-garbage live values) — then establish
*separately* whether/when the save's real position gets written into `[0xc073..0xc075]` relative to
that point.

## 2026-07-17 Update 4 — select-slot-a Checkpoint Reconstructed: NOT a Meaningful Position Reading, Corrected

Follow-up task, scoped narrowly to the previous update's suggestion (b): reconstruct whatever
technique produced the "superseded" `DS=13F2, pos_x=14, pos_y=14, facing=East` reading at the
`select-slot-a` step, reproduce it twice, and determine honestly whether it is real usable
position telemetry or a coincidentally-plausible-looking non-position value.

### The superseded technique was never committed, and its own code was left broken

`git log --follow --oneline -- tools/trace_dok_position_telemetry.ps1` shows exactly one commit
(`96c3452`), which already contains the *final* free-run-then-INT8-fallback form described in
Update 3 — the multi-checkpoint intermediate that produced the `DS=13F2` reading was never itself
committed. Its skeleton is still visible in the committed file, though: `Get-PositionSnapshot`
(the `CMD_Goto` post-combine-breakpoint-anchored capture function, structurally identical to
`tools/trace_dok_goto_operand.ps1`'s proven technique) is defined but never called anywhere in the
committed script's control flow, and references an `$execBp` variable that is **never assigned**
in that file. That is the concrete bug that stranded this function as dead code when the script
was rewritten toward the spawn-screen goal — not a deliberate abandonment of a working technique,
but an incomplete rewrite that left a half-wired function behind.

### Reconstruction: `tools/trace_dok_position_telemetry_slota.ps1`

New tool, built on the exact same hash-locked staged-runtime pattern (`build\runtime-dok-postel-20260717`,
same SHA-256-verified `START.EXE`/`GAME.OVR`, same Phase-1 `BPINT 21 42` seek-and-byte-match
`CMD_Goto` destSeg resolution already proven ~20+ times). It properly wires the same technique:
arms `BP <destSeg>:00B6` **once**, leaves it armed for the whole menu-navigation run, and — unlike
the committed script's dead code — always issues an explicit `RUN` immediately before every
`Send-DosKeys` call (not just after a checkpoint read), so a spontaneous `CMD_Goto` hit firing
while the script was merely sleeping between keypresses (proven in `trace_dok_goto_operand.ps1` to
happen constantly during ordinary play) can never silently drop the *next* keypress the way the
committed script's own header comment documents as a general DOSBox-X automation hazard.

Checkpoints were captured at **every** menu step from `dismiss-title` through `nav-begin-adventuring`
(not just `select-slot-a`) specifically so that "no hit within the timeout" could be distinguished
from "no hit because the technique doesn't apply here at all" — checkpointing only the target step,
as an early iteration of this round's own script did, gives no way to tell those two apart.

### Result (five runs total, all internally consistent, all foreground/blocking)

| Run | dismiss-title | dismiss-credits | skip-credits | nav-load-saved-game | select-load-saved-game | select-death-knights | **select-slot-a** | nav-begin-adventuring |
|---|---|---|---|---|---|---|---|---|
| run1 (3 checkpoints only) | — | — | — | — | — | no hit | **no hit** | no hit |
| run2 (3 checkpoints only) | — | — | — | — | — | no hit | **no hit** | no hit |
| diag1 (8 checkpoints) | no hit | no hit | DS=13F2 x=5 y=15 N cell=32 | DS=13F2 x=5 y=12 N cell=10 | DS=13F2 x=15 y=13 N cell=16 | no hit | **no hit** | no hit |
| diag2 (8 checkpoints) | no hit | no hit | DS=13F2 x=5 y=15 N cell=32 | DS=13F2 x=5 y=12 N cell=10 | DS=13F2 x=14 y=14 **E** cell=16 | no hit | **no hit** | no hit |
| final1 (8 checkpoints, committed script) | no hit | DS=13F2 x=5 y=15 N cell=32 | DS=13F2 x=5 y=12 N cell=10 | DS=13F2 x=14 y=14 **E** cell=16 | no hit | no hit | **no hit** | no hit |

Two findings, both solid and reproduced:

1. **`select-slot-a` itself never produces a `CMD_Goto` hit — 0 out of 5 runs, with a per-step
   timeout of 8-12 seconds each.** Neither does `select-death-knights` or `nav-begin-adventuring`
   (also 0/5 and 0/3 respectively, where checkpointed), nor `select-load-saved-game` in 2 of the 3
   runs that checkpointed it. The party-roster / save-slot-selection menu subsystem (everything
   from "LOAD SAVED GAME" being selected onward, up to but not including the DOWN-key cursor moves
   on the roster screen) genuinely does not route through `CMD_Goto` — extending Update 3's finding
   about the *post-load narrative* one layer earlier, to the save-load menu chain itself.
2. **The exact `DS=13F2, x=14, y=14, facing=East` reading from the superseded round reappears
   twice (diag2, final1) — but at a *different* labeled step each time** (`select-load-saved-game`
   in diag2, `nav-load-saved-game` in final1), alongside two *other* distinct values (`x=5,y=15,N`
   and `x=5,y=12,N`) that also recur at shifting labels across runs. This is decisive: the value
   is not tied to any specific menu action. It is one of a small, apparently fixed *sequence* of
   values (`(5,15,N)` → `(5,12,N)` → `(14 or 15, 13 or 14, E)`) written by whatever runs during the
   title-dismiss → main-menu → "LOAD SAVED GAME" window, and picked up by this breakpoint-based
   capture at whichever step happens to be executing when that sequence's *n*-th write fires next —
   which step that lands on shifts by one between runs, exactly as seen in the table above.

### Claim boundary — corrective, not additive

The superseded round's own framing ("a plausible pre-load default, not yet the target spawn
state, but proof the address mapping itself produces sane, non-garbage live values") is **only
half right, and the useful half turns out to be the wrong half for this task's purpose**:

- **Still true:** the read produces real, structured, reproducible live memory content (not a
  decode-tool artifact) — `D <seg>:<addr>` dumps parse cleanly and the same small set of values
  recurs deterministically across independent runs.
- **Corrected:** it is **not a `select-slot-a` checkpoint at all**. `select-slot-a` itself was
  checkpointed 5 separate times this round (run1, run2, diag1, diag2, final1) and produced **zero**
  hits every single time. The `x=14,y=14,East` value the superseded round reported under that label
  was, at best, whatever ambient value this fixed pre-menu sequence happened to be on when the
  earlier script's own (much longer, 45-second-default `HitTimeoutSeconds`) wait loop next caught a
  breakpoint hit — almost certainly one to three keypresses *earlier* in the sequence, not causally
  tied to the slot-A selection the label implied.
- **Also corrected:** even restricted to its real window (title-dismiss through "LOAD SAVED GAME"),
  the values are not stable across runs at a fixed step — `(14,14,East)` shows up at two *different*
  labeled positions in two different runs — so even a relabeled, honestly-scoped version of this
  checkpoint ("telemetry at the main-menu-navigation window") would not be a reliable, step-pinned
  reading. It is much more consistent with a short, fixed sequence of unrelated writes (menu cursor
  blink state, a title-screen animation, or some other reused scratch use of the same host-register
  block) than with the party's actual map position, which has no reason to change three times in a
  handful of seconds while sitting on static text menus with no movement possible.

**Bottom line for gap #2:** this is a genuine, twice-(in fact five-times-)reproduced **negative**
result, per this project's "UNLOCATED beats invention" convention. The `select-slot-a` checkpoint
lead is closed as *not usable* — it does not deliver a real position reading, early or otherwise.
The six telemetry addresses (`0xc073`-`0xc077`, `0xdb75`) themselves remain solid as a *static*
disassembly finding (unchanged from Update 3 — the read/write dispatch code is real and matches the
ECL1.DAX block 33 cross-check), but no dynamic capture anywhere in the game's menu-to-spawn flow
has yet confirmed those addresses hold the party's actual position at any point this project has
been able to observe. Gap #2 from Update 2's three-item blocker list remains open.

### What was and wasn't touched

No `packages/engine`/`apps/web` TypeScript touched. New tool: `tools/trace_dok_position_telemetry_slota.ps1`
(committed). The committed `tools/trace_dok_position_telemetry.ps1` from Update 3 is unchanged —
its own dead `Get-PositionSnapshot`/`$execBp` bug is left as-is (fixing it in place risked
conflating "the spawn-screen goal" with "the select-slot-a reconstruction goal"; the new script is
the reconstruction, kept separate). Run artifacts (`build/dok-position-telemetry-slota-*/`) are
git-ignored, matching this project's existing convention for DOSBox-X trace output.

### Next substep for gap #2 (updated again)

Both prior candidate anchors are now exhausted for the menu/pre-game window: the spawn-screen
`CMD_Goto` anchor (Update 3) and the `select-slot-a`-adjacent `CMD_Goto` anchor (this update) both
fail to deliver a trustworthy reading, for two different reasons (respectively: the post-load
front end never calls `CMD_Goto` at all; the save-load menu chain does call it, but for something
unrelated to position, at unpredictable timing). A future round should look for an entirely
different anchor — ideally one INSIDE actual dungeon/town ECL execution after a save has fully
loaded and the party is genuinely standing in the game world (e.g. arm the breakpoint only after
detecting the on-screen HUD via vision/OCR, or find a second resident routine, distinct from
`CMD_Goto`, that specifically reads/writes `0xc073..0xc077` as part of the world-state redraw —
the write-side dispatcher already statically located in Update 3's header comment (`GAME.OVR` flat
`~0x7883-0x78fe`) is the natural next candidate to try as an execution-breakpoint anchor instead of
`CMD_Goto`).

## 2026-07-17 Update 5: Lead 1 (write-side dispatcher epilogue anchor) fires — first genuine live
## position-write capture, with an honest eviction-timing caveat; GameLink multi-agent collision
## hazard hit and fixed along the way; block 34->33 transition still not reached

Directly followed up on Update 4's closing next-substep: try the write-side `0xc073..0xc077`
dispatcher itself (not `CMD_Goto`) as an execution-breakpoint anchor. New tool
`tools/trace_dok_position_setter.ps1`.

### Static re-confirmation

Fresh Capstone disassembly of the real `Death Knights of Krynn/GAME.OVR` this round confirmed and
extended Update 3's header-comment claim: a single function at flat `0x7769-0x7927` (`push bp` /
`mov bp,sp` / `sub sp,4` entry) recomputes an address class from the caller's ECL virtual-address
argument and branches to one of 5 case handlers. Case 4 (`al==4`, entered at flat `0x7883`)
subtracts `0xbf68` from the raw virtual address and switches on the result: `0xe3` (ECL vaddr
`0xC04B`, mapPosX) writes `[0xc073]`; `0xe4` (`0xC04C`, mapPosY) writes `[0xc074]`; `0xe5`
(`0xC04D`, facing) remaps ECL `0/1/2/3` to `0/2/4/6` (N/E/S/W, matching CoAB's own
`gbl.mapDirection` convention) and writes `[0xc075]`; `0xf1`/`0xf7` write an unrelated register
pair (`[0xc5f6]`/`[0xc5f7]`, not position, not used here). **All five case branches (al=0..4, not
just case 4) converge on one shared epilogue at flat `0x7927`** (`mov sp,bp` / `pop bp` / `retf 6`)
— this is deliberately the broadest available net: a breakpoint there fires for *any* SAVE-driven
host-register dispatch this function handles, not just position writes specifically. Per
`tools/disasm_dok.py`'s own `DESCS` table this function lives in VROOMM descriptor index 8
(`fileofs=0x6ba8, codesz=0x1e63`) — the same descriptor as the already-proven operand parser
`vm_LoadCmdSets`, but a **different** descriptor from `CMD_Goto`'s own (index 2, `fileofs=0x81d`),
so this anchor needed its own Phase-1 seek capture (target key `0x6BA8`).

### GameLink multi-agent collision hazard — hit, diagnosed, and mitigated before trusting any result

This round ran concurrently with several other agents' own DOSBox-X GameLink trace sessions (per
this project's routine multi-agent posture). A sibling Gateway session independently discovered
and documented that DOSBox-X 2026.07.02's GameLink shared-memory transport
(`DWD_GAMELINK_MMAP_R4`/`DWD_GAMELINK_MUTEX_R4`) is a **hardcoded, non-process-scoped Windows named
object** — two concurrent GameLink-master DOSBox-X processes silently collide, with `status`/
`screenshot`/`press` calls potentially serving a *different* agent's session with no error at all
(full writeup: `docs/engine/research/dosbox-x-gamelink-automation.md`'s "2026-07-17: KNOWN
HAZARD"). Two early runs of this round's own script (before the safeguard existed) produced
suspiciously blank-white `post-narrative-screen.png`/`spawn-final-screen.png` captures while a
foreign `dosbox-x.exe` PID was independently confirmed running alongside the script's own launched
PID — consistent with, though not conclusively proven to be, this exact hazard. Both runs were
discarded as unverified rather than reported.

`tools/trace_dok_position_setter.ps1` was then updated with three safeguards, all now permanent
parts of the script: `Wait-DosboxExclusive` (bounded pre-launch poll refusing to start a second
concurrent GameLink session while any other `dosbox-x.exe` process exists — an honest blocked
result on timeout, not a silent launch), `Assert-OwnDosboxProcess` (re-checked at every checkpoint;
aborts if a foreign PID appears mid-session), and `Assert-GameLinkIdentity` (cross-checks
GameLink's own `program`/frame-dimension fields — DoK's own session is consistently `program:
'START'`, `frame: 640x400` — at every checkpoint, aborting on mismatch). The eventual successful
run below passed all of these checks at every one of its 14 checkpoints plus the final spawn wait,
and is the first run of this line of investigation done under proper collision-avoidance.
(Separately: two follow-up runs, intended to add still-finer per-checkpoint byte-match evidence —
see "What's still open" below — were blocked for the full 8-minute bounded wait by a *different*
agent's own long-running dosbox-x session each time; this is reported honestly as machine
contention, not folded into or hidden from the result.)

### Result: the epilogue anchor fires — real position/pose data captured for the first time

Run `build/dok-position-setter-20260717f` (git-ignored, evidence retained locally): Phase 1 seek
capture found descriptor 8 at seek index 27 (`0x6BA8`), resolved runtime destination segment
`3397`, and confirmed an exact entry byte-match before Phase 2 began (`setter_entry_byte_match_phase1:
true`). The epilogue breakpoint (`3397:0D7F`) was then armed once and left armed through the full
14-step cold-boot -> load-save -> slot-A -> begin-adventuring -> 5x-narrative-dismiss sequence, all
driven via GameLink (no host input, no focus-stealing window). Result: **13 of 14 checkpoints hit**
(only `dismiss-title`, the very first screen, produced no hit within its 12s window) — a
qualitative upgrade from Updates 3/4's clean zero-hits-anywhere result on the `CMD_Goto` anchor:

| Checkpoint | x (0xc073) | y (0xc074) | facing (0xc075) | wallType (0xc076) | cellDescriptor (0xc077) | dirty (0xdb75) |
|---|---|---|---|---|---|---|
| dismiss-title | — no hit — | | | | | |
| dismiss-credits | 7 | 13 | N | 0 | 0 | 0 |
| skip-credits | 7 | 13 | N | 0 | 0 | 0 |
| nav-load-saved-game | 5 | 15 | N | 0 | 0 | 1 |
| select-load-saved-game | 5 | 15 | N | 0 | 0 | 1 |
| select-death-knights | 5 | 15 | N | 0 | 32 | 0 |
| select-slot-a | 5 | 11 | W | 6 | 0 | 1 |
| nav-begin-adventuring | 4 | 11 | W | 0 | 0 | 0 |
| select-begin-adventuring | 14 | 14 | E | 0 | 0 | 1 |
| narrative-1 | 15 | 14 | N | 1 | 16 | 1 |
| narrative-2 | 15 | 12 | W | 1 | 16 | 1 |
| narrative-3 | 14 | 12 | N | 0 | 32 | 1 |
| narrative-4 | 14 | 11 | N | 2 | 156 | 0 |
| narrative-5 | 6 | 6 | N | 2 | 156 | 1 |
| spawn-final (extended wait) | 6 | 6 | N | 0 | 12 | — |

The single strongest data point is **`dismiss-credits`**: `x=7, y=13, facing=N` is an **exact
match** to `expected_on_screen_hud: '7,13 N 00:00'`, the previously-hypothesized static starting
position baked into the shipped `SAVGAMA.PTY` pregen save (this was carried forward, unverified,
from earlier updates as a target to check against — this is the first run to actually confirm it
live). This checkpoint fires very early (second real screen, before the player has navigated any
menu), at a point still close to the verified-true Phase-1 byte-match, and is the most credible
single reading this project has captured for DoK to date.

### Honest caveat: post-navigation byte-match failed — later hits are not all equally trustworthy

`setter_entry_byte_match_post_navigation: false`. Re-checking the destination segment's bytes
against the setter's own expected entry code, done once right after all 14 checkpoints and right
before the final extended spawn wait, found a **mismatch** — VROOMM almost certainly evicted
descriptor 8's runtime buffer for a different overlay at some point during the 14-step sequence.
Per this script's own documented claim boundary, a breakpoint hit *after* that point is
**inconclusive, not confirmatory** — the exact `segment:offset` the breakpoint is armed at may, by
that point, belong to a *different* function VROOMM swapped in, and a "hit" there is a coincidental
address match, not proof this specific setter routine executed. Because the byte-match was only
checked at two points (before Phase 2, and once after all 14 steps), this round cannot pin down
*which* checkpoint is the first untrustworthy one — plausibly still several/most of them, since
eviction requires descriptor 8's own 0x1e63-byte buffer to be needed elsewhere, which is not a
foregone conclusion for a menu-only sequence, but is not ruled out either. This is reported as a
genuine open uncertainty, not resolved by assumption in either direction. In particular, the
**`spawn-final` checkpoint (x=6, y=6, N) is the single point this caveat most affects** — it is the
temporally-last hit, furthest from the last verified-true byte-match, and does not match the
`7,13 N` expectation, which is equally consistent with "the narrative genuinely relocates the party
before settling" and with "this specific hit is a coincidental match on evicted/replaced code."

A fix for this ambiguity was written this round but **not yet run**: `Test-EntryByteMatch` is now
called at *every* checkpoint (not just twice), recorded as `entry_byte_match_at_hit` per checkpoint
in the trace JSON, so a future run can identify the exact first-evicted step directly instead of
inferring a range. Two attempts to run this refined version were each blocked for the full 8-minute
`Wait-DosboxExclusive` window by a different concurrent agent's own dosbox-x session — an honest
"blocked by machine contention" result, not a script or technique failure. **Running this refined
script once the machine is less contended is the concrete, mechanical next step** — no new
reverse-engineering is needed, just a clean exclusive window.

### Separately noted, unresolved, out of scope for this round: blank screenshot captures

Both `post-narrative-screen.png` and `spawn-final-screen.png` from the successful,
collision-safeguarded run are pure white, despite `Assert-GameLinkIdentity` confirming
`program='START', frame=640x400` (i.e. not the collision hazard — this is a *different*, still
unexplained issue, possibly a frame-capture timing race against the paused/breakpointed CPU state).
The debugger-console memory reads (which is where every X/Y/facing/etc. value above actually comes
from) are unaffected by this — they use the separate, PID-scoped `.NET` helper channel, not
GameLink's frame buffer. Not investigated further this round; flagged for whoever next needs a
working screenshot from a breakpoint-paused GameLink session.

### Block 34 -> 33 transition: still not reached

This round's telemetry is cell-level (`x`/`y`/`facing`/`wallType`/`cellDescriptor` within whatever
GEO block is currently active) — it does not itself identify *which* GEO block number is loaded at
each checkpoint, so it does not directly establish the block-34-(start)-to-33-(selector-33 combat)
transition Update 2 identified as the remaining structural gap. The `cellDescriptor` values seen
(`0, 32, 0, 16, 16, 32, 156, 156, 12`) are plausible per-cell backdrop/geometry indices but were not
cross-referenced against `GEO1.DAX` block 33/34 layouts this round (out of budget once the
collision hazard and its mitigation consumed the majority of this round's DOSBox-X time). **Concrete
next step, now well-scoped:** correlate a GEO-block-load VROOMM/seek capture (same `BPINT 21 42`
seek-capture technique already proven repeatedly in this project) with these position checkpoints,
to identify which GEO block each `(x,y)` pair belongs to, and specifically whether the narrative
sequence's movement (`14,14` -> `15,14` -> `15,12` -> `14,12` -> `14,11` -> `6,6`) ever crosses into
block 33's territory.

### What was and wasn't touched

No `packages/engine`/`apps/web` TypeScript touched — this round is pure RE/telemetry, no route
closed yet. `tools/trace_dok_position_setter.ps1` (new, committed) includes the collision-avoidance
safeguards described above plus the not-yet-run per-checkpoint byte-match refinement. Run artifacts
(`build/dok-position-setter-*/`) are git-ignored, matching this project's existing convention.
`docs/engine/research/dosbox-x-gamelink-automation.md`'s hazard section was updated by a sibling
agent during this round (not this task's own edit — left as-is, cross-referenced above).

## 2026-07-17 Update 6: `CMD_NewECL` located and structurally matched to the CoAB oracle, but
## direct execution testing proves it never fires in the boot-to-spawn window — the live GEO-block-id
## register stays genuinely UNLOCATED

Directly followed up on Update 5's own concrete next step ("correlate a GEO-block-load
VROOMM/seek capture ... with these position checkpoints, to identify which GEO block each `(x,y)`
pair belongs to"). Took a different, more direct route than a seek capture: locate DoK's own
`CMD_NewECL` handler (the only known mechanism, per the CoAB oracle, that ever writes a new
block/area id at runtime) and test empirically whether it executes at all during the already-
instrumented 14-checkpoint boot-to-spawn sequence.

### Static disassembly: `CMD_NewECL` found and matched 1:1 to the CoAB oracle

`build/dok-ecl-dispatch-map.json` (DoK's own 54-entry ECL opcode dispatch table, built by
`tools/map_dok_ecl_dispatch.py` in an earlier round) gives opcode `0x20` (NEWECL) a
`handler_file_offset` of `5487` (`0x156F`). Cross-referencing `tools/disasm_dok.py`'s `DESCS`
table shows file offset `0x156F` falls inside VROOMM descriptor index 2 (`fileofs=0x81d,
codesz=0x315b`) — the **same descriptor that already carries `CMD_Goto`** (flat `0x8b8`), not a
new one. Disassembling at `0x156f` (`python tools/disasm_dok.py dis 0x156f 350`) shows a short,
clean routine that structurally matches CoAB's own `CMD_NewECL()`
(`coab_extracted/engine/ovr003.cs` lines 480-498: `vm_LoadCmdSets(1)` -> `block_id =
vm_GetCmdValue(1)` -> store into the area struct) step for step:

1. `vm_LoadCmdSets(1)` call (operand fetch, same call DoK's own `CMD_Goto` already uses).
2. Decoded operand byte lands in `[0xdb6c]`.
3. `LES DI, [DS:0x8C2D]` — loads a far pointer from a fixed DGROUP offset (`0x8C2D`) into
   `ES:DI`. This is the candidate "area pointer," analogous to CoAB's `gbl.area_ptr`.
4. `MOV ES:[DI+0xF2], AL` — writes the decoded operand into the struct the far pointer refers
   to, at struct offset `+0xF2`.

This is a genuine, disassembly-grounded find, not an inference: the operand-decode-then-struct-
write shape is unambiguous machine code, independently confirmed against the CoAB oracle's own
`CMD_NewECL` source before any dynamic testing began.

### `tools/trace_dok_geo_block_id.ps1` (new): the struct pointer is real and stable, but the
### write target reads constant 0

Extended the proven position-setter anchor (target key `0x6BA8`, descriptor 8, the same shared
epilogue Update 5 already validated) to *also* dereference the `0x8C2D` far pointer and dump
struct windows around it at every checkpoint, without needing `CMD_NewECL` itself to fire (DGROUP
is shared across every overlay in this Borland large-model runtime, so any resident breakpoint's
resolved `DS` is valid for dereferencing a fixed DGROUP-relative address like `0x8C2D` — the same
precedent already established for Pool's own investigation).

- **Run 1** (`build/dok-geo-block-id-20260717a`) hit a real bug: the far-pointer segment
  decoded as `00D1` instead of a plausible segment value. Root cause, self-diagnosed by comparing
  the script's parsed output against the raw console dump bytes: PowerShell's `-shl` operator
  silently truncates to 8 bits when the left operand is `[byte]`-typed (the exact bug class this
  project's own `trace_dok_goto_operand.ps1` header comment already warns about) — `$ptrBytes[3]
  -shl 8` on a `[byte]` evaluated to 0 instead of the correct value. Fixed by casting both shift
  operands to `[int]` first (`[int]$ptrBytes[1] -shl 8`, `[int]$ptrBytes[3] -shl 8`) before the
  `-bor`, and the fix is annotated in the script's own comment for future readers.
- **Run 2** (`build/dok-geo-block-id-20260717b`, post-fix) and **Run 3**
  (`build/dok-geo-block-id-20260717c`, independent full re-run) both reproduced identically: the
  far pointer resolves to a stable, plausible value — **segment `4FD1`, offset `0000`** — at every
  one of the 13/14 checkpoints that hit (matching Update 5's own hit rate exactly, since this
  script shares the same anchor). `entry_byte_match` came back **true** at both Phase 1 and
  post-navigation this time (an improvement over Update 5's post-navigation `false` — this
  descriptor stayed resident throughout). Struct offset `+0xF2` (`CMD_NewECL`'s own write target,
  per the disassembly above) read **constant `0`** at every single checkpoint across both runs.
  Two additional CoAB-analog candidate offsets were also dumped and cross-checked — `+0x18A` and
  `+0x1E4` (CoAB's own `Area1.current_3DMap_block_id` and `Area1.LastEclBlockId` struct offsets,
  from `coab_extracted/Classes/Area1.cs`) — both also read constant `0` throughout, in both runs.
- **An unexplained but reproducible lead, flagged and not chased further this round:** struct
  offsets `+0xFC`/`+0xFD`/`+0xFE` show a real, save-load-correlated 3-byte pattern, identical
  across Run 2 and Run 3: `(00,00,00)` before any save is touched, then `(04,0B,0A)` starting at
  the `select-death-knights` checkpoint, then `(04,08,0A)` starting at `select-begin-adventuring`
  and holding through the rest of the sequence. This is structured, twice-reproduced dynamic data
  clearly tied to save loading — but it does not match any documented DoK GEO/ECL block id (the
  known set is in the 16-99 range) and was not semantically decoded this round. Left as an open
  lead for a future round, not over-claimed as a block-id field.

### `tools/trace_dok_newecl_execution.ps1` (new): direct execution test — `CMD_NewECL` never
### fires in this window (definitive, not inferred)

Rather than rely only on the struct read being 0 (which is also consistent with `CMD_NewECL`
firing and legitimately writing 0), a second, independent script set a breakpoint directly on
`CMD_NewECL`'s own code — descriptor `0x81D` (the same descriptor as `CMD_Goto`, confirmed
earlier rounds' Phase-1 destination-segment resolution reused cleanly since it's the identical
descriptor), entry offset `0xD52` (`0x156F - 0x81D`, the function's first instruction) and a
post-write offset `0xD6C` (`0x1589 - 0x81D`, the instruction immediately after the `MOV
ES:[DI+0xF2],AL` struct write) — and ran it across the exact same 14-checkpoint boot-to-spawn
sequence used by every prior round's script.

**Result** (`build/dok-newecl-exec-20260717a`): `entry_byte_match_phase1 = True`,
`entry_byte_match_post_navigation = True` (the descriptor's code is confirmed resident and
byte-identical both before and after the full 14-step sequence, ruling out VROOMM eviction as an
explanation), and **`any_hit_anywhere = False`** — zero breakpoint hits, at either offset, at any
of the 14 checkpoints. This is a definitive result, not an absence-of-evidence inference: the code
is proven present and unmodified in memory throughout, and the breakpoint on its own entry point
never fired once.

This directly corroborates, empirically, the theoretical explanation already visible in the CoAB
oracle's own boot-path source (`coab_extracted/engine/ovr003.cs`, ~line 2230+): on a
fresh/never-played save, native C boot code sets `gbl.EclBlockId` **directly** —
`if (gbl.area_ptr.LastEclBlockId == 0) { gbl.EclBlockId = 1; ... } else { gbl.EclBlockId =
(byte)gbl.area_ptr.LastEclBlockId; }` — bypassing the ECL-VM `CMD_NewECL` command layer entirely.
This round extends that theory (previously only confirmed for `CMD_Goto`, Updates 3/4) to a
second, independently-disassembled ECL command, strengthening the case that DoK's post-load
narrative front end genuinely does not route new-block transitions through the VM command layer
in this window — it is a native-code path this project's ECL-command breakpoints structurally
cannot observe.

### Honest conclusion: block 34 -> 33 transition still not observed; the true live GEO-block-id
### field stays genuinely UNLOCATED

This round ruled out one strong, disassembly-grounded candidate mechanism (`CMD_NewECL`'s struct
write at area-pointer `+0xF2`) via direct execution testing, not mere inference — a real
narrowing of the search space, not a dead end restated. But it did **not** find the actual live
GEO-block-id register: the write target it disassembled reads constant 0 throughout (fully
explained now, not just observed), the CoAB-analog offsets also read 0, and the boot path that
*does* set the block id (per the CoAB oracle) runs in native code this project has no current
breakpoint technique for isolating from the rest of the C runtime. The unexplained `+0xFC..+0xFE`
triple is a real lead but was not decoded. **No in-dungeon movement trace was attempted this
round** (out of scope for the 14-checkpoint boot-to-spawn window the existing telemetry
infrastructure covers) — so this round cannot report whether/when a 34->33 transition occurs, only
that it does not occur, or is not observable via any technique tried so far, within the
already-instrumented menu/narrative window. Per this project's own "UNLOCATED beats invention"
ethic, this is reported as a genuine open gap, not smoothed over.

**Concrete next steps for a future round**, in priority order:
1. Semantically decode the `+0xFC..+0xFE` triple (candidate: static analysis of the C boot-path
   routine at CoAB's `sub_29758` analog in DoK's own binary, to identify what struct field(s)
   those offsets actually represent).
2. Find and disassemble DoK's own analog of CoAB's native boot-path block-id-set code (the
   `if (gbl.area_ptr.LastEclBlockId == 0) { gbl.EclBlockId = 1; ... }` logic) directly, and set a
   breakpoint on *that* write instead of on `CMD_NewECL`.
3. Only if 1-2 both stall: fall back to Update 5's original suggestion of a GEO-block-load
   VROOMM/seek capture correlated against position checkpoints — now lower priority since this
   round proved the ECL-VM layer isn't the mechanism to chase.

### What was and wasn't touched

No `packages/engine`/`apps/web` TypeScript touched — this round is pure RE/telemetry. Two new
scripts committed: `tools/trace_dok_geo_block_id.ps1` and
`tools/trace_dok_newecl_execution.ps1`. Run artifacts (`build/dok-geo-block-id-*/`,
`build/dok-newecl-exec-*/`) are git-ignored, matching this project's existing convention. Ran as
the sole DOSBox-X-driving agent this round per the coordinator's explicit instruction; confirmed
`Get-Process dosbox-x` empty before every launch; no collision hazard hit.


## 2026-07-18 Update 7: `sub_29758` Analog Located — `gbl.EclBlockId` Global Pinned at `[0xdb6c]`,
## Fresh-Game Boot Writes Constant `16` (Not `34`); the `+0xFC..+0xFE` Triple Decoded as Three
## Distinct Non-Block-Id Struct Fields (STATIC ONLY — no DOSBox-X this round)

Directly answers Update 6's two-item, priority-ordered next-steps list. Per this round's own scope
(a sibling agent held the project's sole DOSBox-X slot for unrelated RNG work), **no DOSBox-X trace
was run** — everything below is static disassembly, cross-checked two independent ways where
possible, with a precisely-specified live-verification step left for a future round.

### Item 2 (tackled first, since it subsumes item 1's mechanism): DoK's own `sub_29758` analog

New tool `tools/map_dok_boot_path.py` (mirrors `tools/map_dok_ecl_dispatch.py`'s technique exactly,
reusing `tools/map_pool_ecl_dispatch.py`'s `disassemble_shape`/`nearest_function` verbatim): the CoAB
oracle's own `sub_29758` (`build/coab-oracle-map.json`, `retail_file_offset=0x4061` in CoAB's own real
`GAME.OVR` — the exact boot-path function `docs/engine/research/cok-demo-decompile.md` §2.2 already
used as CoK's own analogous target, i.e. the same oracle symbol, applied here to DoK instead) is
disassembled into a 206-instruction/685-byte reference shape, then matched against every Borland
prologue in DoK's own real `GAME.OVR` (813 candidates).

**Result:** one candidate wins by a decisive margin — `GAME.OVR` file offset `0x3623` (252
instructions, 848 bytes), sequence similarity `0.7467`, next-best candidate `0.3467` (more than 2x
lower). This is a much larger, more control-flow-heavy function than the dispatcher/operand-parser
matches (which scored ~1.0), so the similarity score alone is treated as a strong lead, not proof —
but the function's own internal structure removes any real doubt: it disassembles to a coherent,
CoAB-source-matching sequence (initializing `LastSelectedPlayer`/`can_draw_bigpic`/`filesLoaded`/
`vmFlag01`-equivalent globals, then `LES DI,[0x8C2D]` — the exact `area_ptr` far pointer Update 6
already proved resolves to a stable live segment:offset, `4FD1:0000` — then `CMP BYTE PTR
ES:[DI+0xF2], 0`, i.e. `if (LastEclBlockId == 0)`, using struct offset `0xF2` which `CMD_NewECL`'s
own disassembly independently proved is `area_ptr->LastEclBlockId`), and later in the same function
calls out to what read as `load_ecl_dax`/`vm_init_ecl`/`RunEclVm` analogs (`lcall 0x41,0x34`;
`lcall 0x41,0x2f`; `push [0x8c46]` (a plausible `ecl_initial_entryPoint` DGROUP global); `push cs;
call 0x34f2`, a near call landing inside the same descriptor) in exactly the order CoAB's own
`sub_29758` source calls them. This is descriptor index `2` (`fileofs=0x81d`, `codesz=0x315b`) — the
**same overlay descriptor** that already houses `CMD_Goto` (`0x8b8`), `CMD_NewECL` (`0x156f`), and
the opcode dispatcher (`0x3271`), which is exactly what you'd expect for "the VM + main game loop"
subsystem to be packed together by the Borland overlay linker.

`tools/map_dok_boot_path.py`'s own Capstone-based structural walk (not hand-copied offsets — the
tool programmatically locates each item below and is unit-tested against a synthetic byte fragment
in `tools/test_map_dok_boot_path.py`, independent of the real `GAME.OVR` file) extracts:

| Item | File offset | Descriptor-relative | Detail |
| --- | --- | --- | --- |
| Function entry | `0x3623` | `0x2e06` | `push bp; mov bp,sp; sub sp,6` |
| `LastEclBlockId == 0` test | `0x366d` | `0x2e50` | `cmp byte ptr es:[di+0xf2], 0` |
| `jne` (skip fresh-game branch) | `0x3673` | `0x2e56` | target `0x36a6` |
| Fresh-game write (demo) | `0x3681` | `0x2e64` | `mov byte ptr [0xdb6c], 2` |
| Fresh-game write (non-demo) | `0x3692` | `0x2e75` | `mov byte ptr [0xdb6c], 0x10` (**16 decimal**) |
| Continuing-game read | `0x36aa` | `0x2e8d` | `mov al, byte ptr es:[di+0xf2]` |
| Continuing-game propagate write | `0x36af` | `0x2e92` | `mov byte ptr [0xdb6c], al` |
| Post-run propagate-back #1 | `0x3733` | `0x2f16` | `mov byte ptr es:[di+0xf2], al` (gated `cmp [0x84b5],0`, i.e. `vmFlag01==false`) |
| Post-run propagate-back #2 | `0x37a0` | `0x2f83` | same, second occurrence (main do-while loop pass) |

**The load-bearing new fact: `[0xdb6c]` is `gbl.EclBlockId`, DoK's own live "current ECL/GEO block
id" global — proven two independent ways, not assumed:**

1. Inside this `sub_29758` analog itself: the continuing-game branch reads `area_ptr->LastEclBlockId`
   (struct `+0xF2`, already proven) and stores it straight into `[0xdb6c]` — matching CoAB source
   `gbl.EclBlockId = (byte)(gbl.area_ptr.LastEclBlockId);` exactly.
2. Independently, re-disassembling `CMD_NewECL` itself (file offset `0x156f`, previously only
   summarized in Update 6) shows the *exact* CoAB-source sequence, corrected from Update 6's
   slightly-imprecise description ("decoded operand byte lands in `[0xdb6c]`, then gets written to
   the struct" — actually it is the **old** `[0xdb6c]` value that gets written to the struct, not the
   newly-decoded operand):
   ```text
   001575  mov al, 1
   001578  lcall 0x41, 0x2a          ; vm_LoadCmdSets(1)
   00157d  mov al, byte ptr [0xdb6c] ; AL = OLD gbl.EclBlockId  (read BEFORE overwrite)
   001580  les di, ptr [0x8c2d]
   001584  mov byte ptr es:[di+0xf2], al   ; area_ptr->LastEclBlockId = OLD EclBlockId
   00158c  lcall 0x41, 0x25          ; vm_GetCmdValue(1) -> new block_id in AL
   001597  mov byte ptr [0xdb6c], al ; gbl.EclBlockId = NEW block_id
   00159e  lcall 0x41, 0x34          ; load_ecl_dax(block_id)
   0015a3  lcall 0x41, 0x2f          ; vm_init_ecl()
   0015a8  mov byte ptr [0x84b4], 1  ; gbl.stopVM = true
   0015ad  mov byte ptr [0x84b5], 1  ; gbl.vmFlag01 = true
   ```
   This is a byte-for-byte structural match to `coab_extracted/engine/ovr003.cs`'s `CMD_NewECL`
   (lines 480-498: `LastEclBlockId = EclBlockId; EclBlockId = block_id; load_ecl_dax(block_id);
   vm_init_ecl(); stopVM = true; vmFlag01 = true;`), and it independently agrees with `sub_29758`
   on both `[0xdb6c]`'s role and struct `+0xF2`'s role. Two unrelated functions computed from two
   unrelated disassembly passes landing on the same interpretation is strong corroboration, not a
   single fragile read.

### The surprising part: DoK's own literal fresh-game constant is `16`, not `34`

`apps/web/src/ui/gameData.ts`'s `dok` profile sets `eclInitBlock: 34` (comment: "a verified two-set
dungeon init"), and `packages/engine/test/dungeon-dok.test.ts`/`m36-audit.md`/`m37-audit.md` all
independently confirm block 34 decodes to real, coherent retail content (a village-guard greeting,
"WELCOME TO CEKOS", plus real `DAMAGE`/`PARTYSTRENGTH` ECL effects) — so block 34 is definitely *a*
real, legitimately-scripted DoK area. But this round's disassembly shows the **native boot-path
code**, on a completely fresh (never-played) game with `LastEclBlockId == 0`, writes the literal
constant `16` (or `2` for the demo branch) into `gbl.EclBlockId` — not `34`, and not CoAB's own
literal `1`.

This is reported as an **open, unreconciled discrepancy**, not resolved either direction, per
"UNLOCATED beats invention":

- It is plausible both facts are true simultaneously and non-contradictory: block 16 could be a
  short entry/camp scene that itself `NEWECL`s into block 34 as part of its own scripted opening
  (mirroring exactly the CoK block-36-into-16 chaining `cok-demo-decompile.md` §2.4 already
  documented for CoK's own demo/intro path) — in which case both `16` and `34` are correct, just at
  different points in the boot sequence, and `eclInitBlock: 34`'s own comment ("verified loadable
  from real bytes") never claimed to be the literal native-boot constant in the first place.
- It is equally plausible the shipped `SAVE\SAVGAMA.PTY` pregen save (the save every live-telemetry
  round since Update 3 has used) does **not** actually have a raw-zero `LastEclBlockId` the way this
  round assumed from Update 6's read of `+0xF2` staying `0` throughout — e.g. if some earlier,
  not-yet-located initialization step pre-loads a non-zero default (such as `34`) into that struct
  slot from a shipped resource file *before* `sub_29758` ever runs, the "continuing game" branch
  (reading struct `+0xF2` into `[0xdb6c]`) would fire instead of the "fresh, write literal 16" branch
  — and everything observed so far (struct `+0xF2` always reading `0` across every checkpoint in
  Updates 5/6) would need re-examining for exactly *when* in the boot sequence that struct slot gets
  populated relative to when it's read.
- Neither of the above is resolved by anything static this round did. Both are plausible, evidence-
  consistent stories; distinguishing them needs the live trace below.

### `+0xFC..+0xFE` triple decoded: three distinct fields, none a block id (item 1)

New tool `tools/scan_dok_area_struct_fields.py` (generic: scans every `LES DI,[0x8C2D]` occurrence —
148 in the retail binary — and classifies every subsequent DI-relative memory access as a struct
read or write) locates and disambiguates all three offsets Update 6 flagged as an undecoded,
save-load-correlated pattern (`(00,00,00)` -> `(04,0B,0A)` -> `(04,08,0A)`):

| Offset | Reads | Writes | Owning function | Role (disassembly-grounded) |
| --- | --- | --- | --- | --- |
| `+0xFC` | 5 | 1 | file offset `0x1398d`-ish, a large (~1750-byte) menu-driven function that structurally matches DoK's own **`startGameMenu` analog** (party roster / marching-order pre-adventure screen — string tables, "select slot A/B/C" `cmp al,0/1/2` branches, per-character-name print calls) | Read into a plain global `[0x8c3d]` at file offset `0x13e50`, written back unchanged (or as edited by the UI) at file offset `0x144ae`. Consistent with a **marching-order or roster-composition byte**, not a block id — never once passed as an argument to `load_ecl_dax`/`vm_init_ecl`/`RunEclVm` anywhere in this scan. |
| `+0xFD` | 3 | 0 | file offset `0x38f44`-`0x39106` (its own small, 450-byte descriptor, index 28: `fileofs=0x38f44`, `codesz=0x1c2`) | Read at file offset `0x3903c`, used as a **lookup-table INDEX** (`mov al,es:[di+0xfd]; xor ah,ah; mov di,ax; mov al,[di+0x696]`) into a small table at DGROUP-relative `+0x696`, selected only when the *live* cell descriptor (`[0xc077]`, computed fresh via a `GetCellDescriptor(x,y)`-shaped call at `0x39029` from the already-proven `[0xc073]`/`[0xc074]` position registers) is `<= 0x7F`. |
| `+0xFE` | 4 | 0 | same function as `+0xFD` | Read at file offset `0x39052`, the *alternate* branch of the same lookup — used instead of `+0xFD` when the live cell descriptor is `> 0x7F`. Both feed four wall-type byte slots (`[0xc06e]`..`[0xc071]`) that get pushed and passed to `lcall 0xf7,0x25` — reads as "compute the current cell's wall configuration for 3D-view rendering," i.e. a **wall/tile-set selector pair**, not a block id. |
| `+0xFF` | 7 | 2 | same `startGameMenu`-analog function as `+0xFC` | A packed bitfield: high 7 bits (`shr ax,1`) land in `[0x8c52]`, low 1 bit (`and al,1`) in `[0x8c54]`, both read at file offset `0x13e32`/`0x13e42`; recombined (`(high<<1)\|low`) and written back at file offset `0x144c7`, in the same UI pass as the `+0xFC` writeback. Likely party-count/flag-adjacent, given the read/write pairing with `+0xFC`. |

**No write instruction to `+0xFD` or `+0xFE` was found anywhere in this scan's coverage** (148 `LES
DI,[0x8C2D]` sites, ~220-byte windows each — `tools/scan_dok_area_struct_fields.py`'s own claim
boundary notes this is real negative evidence within that coverage, not an absolute proof no write
exists anywhere in the 252KB binary). Given they nonetheless become nonzero exactly at the
`select-death-knights` checkpoint (Update 6) — the same moment the save file itself gets loaded from
disk — the best-supported explanation **(inferred, not directly traced)** is that `+0xFC`/`+0xFD`/
`+0xFE`/`+0xFF` (and their struct neighbours `+0xF0`/`+0xF1`, also independently found read/written by
`sub_29758` itself for a position-change sanity check, and `+0x133`/`+0x134`, touched by the same
`startGameMenu`-analog function) are populated by a **bulk struct/save deserialize** (a single
`fread`-style block copy from the `.PTY`/`.GAM` file into the whole `area_ptr` struct) rather than by
any individually-traceable ECL-VM or native-C single-field write — exactly the same category of
"native file I/O, not an ECL-VM command" explanation Update 6 already established for how
`LastEclBlockId` itself first becomes non-zero on a continuing save. This is a coherent, well-
evidenced answer to "what is the `+0xFC..+0xFE` triple" (three distinct non-block-id fields, one
roster/marching-order byte, two wall-table selector indices, one packed flag byte) even though the
*exact* deserialize call site was not located this round.

### Exact next live-verification step (specified, not attempted — no DOSBox-X this round)

A future round with the DOSBox-X slot available should:

1. Reuse `tools/trace_dok_goto_operand.ps1`'s already-proven Phase-1 seek-capture to resolve
   descriptor `2`'s live destination segment (`<destSeg>`) for the current run — this is the *same*
   descriptor `CMD_Goto`'s own trace already resolves, so no new seek-capture technique is needed.
2. Arm breakpoints at `<destSeg>:2E50` (the `LastEclBlockId==0` test itself — confirms which branch
   fires) and `<destSeg>:2E75` (`gbl.EclBlockId := 16`, non-demo fresh) and `<destSeg>:2E92`
   (`gbl.EclBlockId := <struct value>`, continuing-game propagate) during the same 14-step
   cold-boot -> load-save -> slot-A -> begin-adventuring -> narrative sequence Update 5/6's own
   scripts already drive.
3. At each hit, read `DS:0xdb6c` directly (same debugger-console memory-read convention already used
   for `[0xc073]`-`[0xc077]` throughout Updates 3-6) to observe the actual live value of
   `gbl.EclBlockId` as the boot sequence proceeds — this would settle, for the first time with live
   evidence, both open questions above: (a) which branch a real boot takes on the shipped pregen
   save, and (b) whether `16` and `34` are sequential (16 then NEWECL-into-34) or contradictory
   (meaning this round's branch-taken assumption needs revisiting).
4. Independently and more cheaply: since `[0x8c2d]`'s far pointer is already proven stable at
   `4FD1:0000` (Update 6), a live read of `4FD1:00F2` (`LastEclBlockId`) and `4FD1:0000+0xdb6c`... 
   — no, `[0xdb6c]` is DS-relative, not far-pointer-relative, so it needs the live DS segment at any
   point after DoK's resident code is running (any of the already-proven `[0xc073]`-range checkpoints
   would do) rather than the `4FD1` far segment, which only applies to struct-relative reads. This
   distinction is noted explicitly since conflating the two would produce a wrong-segment read.

### What was and wasn't touched

No `packages/engine`/`apps/web` TypeScript touched — pure static RE/tooling this round, per this
round's own scope (no DOSBox-X available). Three new tools, all committed with unit tests where
practical: `tools/map_dok_boot_path.py` + `tools/test_map_dok_boot_path.py` (5 tests, all pass,
independent of the real `GAME.OVR` file), and `tools/scan_dok_area_struct_fields.py` (no dedicated
test — it is a thin, generically-reusable disassembly scan already exercised end-to-end against the
real binary in this section; adding a synthetic-bytes test would duplicate `test_map_dok_boot_path`'s
own `LES`-detection coverage without adding new risk surface). Generated evidence docs:
`docs/engine/research/dok-boot-path-map.md` + `build/dok-boot-path-map.json`,
`docs/engine/research/dok-area-struct-field-scan.md` + `build/dok-area-struct-field-scan.json` (the
`build/` JSON outputs are git-ignored per this project's convention; the `docs/` markdown renders are
committed as durable evidence, matching `dok-ecl-dispatch-map.md`'s own precedent).

### Claim boundary

**Proven (static, disassembly-grounded, cross-checked two independent ways):** `[0xdb6c]` is DoK's
own live `gbl.EclBlockId` global; struct `+0xF2` remains `area_ptr->LastEclBlockId`; the native
`sub_29758` analog at file offset `0x3623` writes the literal constant `16` (non-demo) or `2` (demo)
into that global on a fresh game, and propagates `area_ptr->LastEclBlockId` into it on a continuing
game, entirely bypassing `CMD_NewECL` — confirming, with a second independent function, Update 6's
conclusion that this project's ECL-VM-command breakpoint techniques are structurally the wrong tool
for this boot-path field. `+0xFC`/`+0xFD`/`+0xFE`/`+0xFF` are four distinct struct fields, none a
block id, with disassembly-identified owning functions and (for `+0xFC`/`+0xFF`) exact read/write
instruction offsets.

**Not proven:** which branch (`16`-literal vs. struct-propagate) a real boot on the shipped pregen
save actually takes, what the true first-loaded block id is on a truly fresh game, whether `16` and
the already-verified `34` are sequential or conflicting, and the exact deserialize call site that
populates `+0xFC..+0xFF` from the save file. All four require the live trace specified above, out of
this round's scope. DoK's P2 natural-route slice remains **open** — no `EclVm`/`gameData.ts` change
was made, and none should be made from this round's static evidence alone.


## 2026-07-18 Update 8: The `16` vs `34` Discrepancy RECONCILED (STATIC ONLY — no DOSBox-X):
## Block 16 IS the Native Fresh-Boot Block (DoK's Opening Cinematic, No GEO Map); `34` Was Never
## a Native-Boot Claim — `eclInitBlock: 34` Stays, One 2026-07-17 Doc Claim Corrected

Directly resolves Update 7's "open, unreconciled discrepancy" (native boot-path writes literal
`16` into `gbl.EclBlockId`, vs. `apps/web/src/ui/gameData.ts`'s `eclInitBlock: 34`). Static-only
round (a sibling agent held the project's DOSBox-X slot). **Verdict: both values are correct at
different observation layers — no code change is warranted; one prior *doc* claim was wrong and
is corrected below.**

### Step 1 — rule out a misread of the disassembly (hypothesis c): REJECTED with raw bytes

Re-read directly from `Death Knights of Krynn/GAME.OVR` at Update 7's exact file offsets:

```text
0x3623: 55 89 e5 83 ec 06 c6 06   ; push bp; mov bp,sp; sub sp,6  (function entry)
0x366d: 26 80 bd f2 00 00 75 31   ; cmp byte es:[di+0xF2],0 ; jne +0x31  (LastEclBlockId==0 test)
0x3681: c6 06 6c db 02            ; mov byte [0xdb6c], 2    (fresh-game DEMO branch)
0x3692: c6 06 6c db 10            ; mov byte [0xdb6c], 0x10 (fresh-game non-demo: 16 decimal)
0x36aa: 26 8a 85 f2 00 a2 6c db   ; mov al,es:[di+0xF2]; mov [0xdb6c],al (continuing-game)
```

The `0x10` immediate is real. Update 7's read stands byte-for-byte.

### Step 2 — decode ECL1.DAX block 16 (hypothesis a): block 16 is DoK's opening cinematic

DoK's `ECL1.DAX` TOC holds blocks `{2, 16, 17, 32, 33, 34, 35, 36}` (note: **block 2 and block
16 both exist** — matching the boot function's two literals, demo=2 / fresh=16, exactly).
Decoded with the same method as `cok-demo-decompile.md` §7.1 (this project's own
`gen1_ecl_encounter_scan.decode_one`/`header_entries`/`successors` + the verified 6-bit string
codec from `dqk_ca03_stream_decode.decode_ecl_string`, byte source
`goldbox_corpus.read_dax_blocks` — identical primitives, scratchpad driver only). Block 16
`initial_entry` (complete, offsets 22→1548, every instruction-boundary exact):

```text
   22  SAVE   #0  -> 0x4be6            ; inDungeon = 0
   28  SAVE   #33 -> 0x4bc3            ; world-map X = 33   (coordinate pair per
   34  SAVE   #13 -> 0x4bc4            ; world-map Y = 13    persistent-natural-routes.md arm table)
   40  SAVE   #16 -> 0x4bf2            ; LastEclBlockId = 16 (same convention as CoK block 16)
   46  PICTURE #112
   49  COMPARE 0x4c04,#1 ; IF_EQ ; GOTO 395   ; replay guard
   60  PRINTCLEAR "A YEAR HAS PASSED SINCE MYRTANI WAS DEFEATED IN THE RUINS OF KERNEN. THE
       SURVIVORS OF THAT CAMPAIGN HAVE BEEN CALLED TOGETHER TO CELEBRATE AND TO REMEMBER FALLEN
       COMRADES. YOU MEET OUTSIDE OF THE GARGATH OUTPOST."
  223  PRINTCLEAR "DURING THE YEAR, THE KNIGHTS HAVE USED THE EQUIPMENT YOU DONATED..."
  328  PRINTCLEAR "YOU ARRIVE THE NIGHT BEFORE THE CELEBRATION. DO YOU WISH TO REST?"
  386  SAVE   #1 -> 0x4c04 ; PROGRAM #9
  395  ... PICTURE #96
  420  PRINTCLEAR "THE BEAUTIFUL LADY MAYA STANDS AND GIVES A EULOGY FOR SIR KARL..."
  583  PRINTCLEAR "A FAT KNIGHT WHISPERS TO YOU, 'SHE IS AMAZINGLY BEAUTIFUL FOR A SILVER DRAGON...'"
  731  PRINTCLEAR "THE FESTIVAL CONTINUES INTO THE EARLY EVENING, WHILE THUNDERHEADS GATHER..."
  873  PICTURE #113
  879  PRINTCLEAR "A HUGE DEATH DRAGON, FLANKED BY NIGHTMARES, SWEEPS TOWARD THE SUDDENLY SILENT
       CELEBRATION..."
 1004  PRINTCLEAR "MAYA SCREAMS IN DESPAIR AS SHE RECOGNIZES THE GRUESOME REMAINS OF HER
       EX-LOVER. SIR KARL BRANDISHES HIS SWORD..."
 1148  PRINTCLEAR "AS HE COMES CLOSE, THE CORPSE OF SIR KARL SHOUTS, 'YOU PATHETIC WORMS...'"
 1284  PRINTCLEAR "'CATCH THESE TROPHIES FROM THE FIRST KNIGHTS I HAVE MET.'..."
 1428  PRINTCLEAR "MAYA STREAKS AFTER HIM. BEFORE YOU CAN FOLLOW, THE NIGHTMARES HAVE DEPOSITED
       THEIR RIDERS BEFORE YOU. OTHER KNIGHTS RUSH TO YOUR AID."
 1532  PICTURE #112
 1535  SAVE   #100 -> 0x7ec6
 1541  SETUP_MONSTER #255, #0, #1      ; the opening scripted battle vs the death knights
 1548  EXIT
```

This is unmistakably **DoK's real game opening** (the Gargath Outpost celebration → Sir Karl
returns as a death knight → opening combat). Corroboration: **block 2 decodes as the
attract-mode demo reel** ("...THE THREAT OF THE DREADED LORD SOTH AND HIS GROWING UNDEAD
ARMY...", "EXPLORE CITIES...", "FIND RARE AND MAGICAL TREASURES.", scripted `ADD_NPC` /
`SETUP_MONSTER #255,#0,#24` showcase) — so *both* boot-path literals land on exactly-matching
content. The native fresh boot genuinely starts at ECL block 16.

### Step 3 — block 16 does NOT chain to 34; block 16 has no GEO map at all

- A NEWECL census across all three DoK ECL files (every header entry, full control-flow walk):
  **no block anywhere targets 34.** Immediate NEWECL targets found: 17 (from nearly every
  block's `vm_run_1` — the common hub/return target, (inferred) DoK's overland/travel layer),
  65, 36, 48/49, 81 — never 34. Block 16 itself contains **zero NEWECL**; its `initial_entry`
  ends at `SETUP_MONSTER`/`EXIT` (the post-combat continuation is native host flow, not script).
- `GEO1.DAX` holds blocks `{32, 33, 34, 36}` only — **there is no GEO block 16 (or 2, or 17)**.
  Block 16 is a pure narrative+combat script with no walkable map. Block 34 *is* a walkable
  16×16 town (Cekos: "A VILLAGE GUARD BOWS AND SAYS, 'WELCOME TO CEKOS!'"), and block 33 is
  Vingaard ("YOU STAND ON VINGAARD'S MAIN STREET.") — both use the standard
  `COMPARE #<self>,0x4bf2 / IF_EQ / EXIT` re-entry guard + `LOAD_FILES #<self>,#127,#255`.

### Step 4 — provenance of "34" (hypothesis b): a deliberate engine-boot choice, never a boot-RE fact

`git log -S "eclInitBlock: 34"` → the value entered in commit `52c0809` (2026-06-22, "B1 — DoK:
detection + boot on the shared Gen1 DAX path"), annotated then and now as "**a verified two-set
dungeon init** (GEO 34, 16×16)". The field's own documented contract in `gameData.ts` (line 82)
is "ECL1 block id that opens the **first walkable dungeon** (verified loadable from real bytes)"
— i.e. a *Greybox browser-boot* choice of a real, loadable, walkable retail block, **not** a
claim about the native boot constant. CoK's profile is the exact same shape: CoK also natively
boots into narrative block 16 (`cok-demo-decompile.md` §2.4/§7.3) while its `eclInitBlock` is
likewise 34.

**The one actually-wrong prior claim** is this file's own 2026-07-17 round (item 3, "DoK's real
game-start block is 34, not 33 — established this round as retail-grounded fact"): its sole
cited evidence was `gameData.ts`'s own annotation — circular, and now disproven as a
native-boot statement. Corrected reading: the native fresh-game start block is **16**; 34 is a
town (Cekos) reachable only through normal play, and nothing scripted ever jumps 16→34. That
also moots that round's "crossing from block 34's sub-map into block 33's" framing: retail flow
after the opening combat proceeds via native host flow with world-map coordinates `(33,13)`
(`0x4bc3`/`0x4bc4`, the coordinate pair already identified in `persistent-natural-routes.md`),
not from inside block 34.

### Resolution and action

- **(c) rejected** — the immediate is really `0x10`.
- **(a) confirmed in spirit, corrected in mechanism** — 16 is indeed the narrative/intro block,
  but it does *not* NEWECL into 34 (or anything); the handoff to walkable gameplay is native.
- **(b) confirmed as the actual explanation of the discrepancy** — the two numbers live at
  different layers: `16` = native boot constant (cinematic script, no GEO), `34` = Greybox's
  documented "first walkable dungeon" engine entry point.
- **No code change**: `eclInitBlock: 34` satisfies its own contract and could not be replaced by
  16 (no GEO 16 exists; the browser boot pipeline loads a walkable map). Gates not run (docs
  only). A future feature wanting the *faithful* boot cinematic should play block 16 (and block
  2 for attract mode) as a scripted intro before the block-34 dungeon load — that is new
  scope, not a bug fix.

### Side-finding (flagged for follow-up, tool NOT changed this round): DoK ECL word-set drift

Decoding block 16 required two operand-count corrections vs. `gen1_ecl_encounter_scan.py`'s
`GEN1_WORD_SETS` (calibrated on the CoK/CoAB family): in DoK, opcode `0x1d`
(PARTYSTRENGTH-slot; (inferred) used here as a "wait/beat" between narration paragraphs) takes
**0** operands (the base-table value; the Gen1 override of 1 desyncs), and `0x2c` (PARLAY-slot)
takes **1** operand (not 6/4). Byte-level proof: with these counts, block 16 parses to
instruction-boundary-exact streams ending precisely at block length (e.g. offset 1799
`1d | 01 01 89 81 | 01 01 89 81 | 00` = beat, GOTO 0x8189, GOTO 0x8189, EXIT at exactly the
1809-byte block end), and every string decodes as coherent retail English. Consequence worth
auditing later: `build/gen1-ecl-encounters.json`'s DoK entries were scanned with the
CoK-calibrated overrides, so any DoK scan path crossing a `0x1d`/`0x2c` instruction desynced
from that point — e.g. block 34's "zero combat candidates" result predates this correction. Not
changed this round: `GEN1_WORD_SETS` feeds live corpus gates and in-flight sibling-agent work;
making it per-profile is its own tested change.

### What was and wasn't touched

Docs only: this section, plus a dated `docs/engine/HANDOFF.md` entry. No engine/web/tool code
changed; no gates run (nothing to gate). Scratchpad decode driver not committed (mirrors
`cok-demo-decompile.md` §7.1's precedent — it is a thin composition of already-committed,
already-tested primitives).

### Claim boundary

**Proven (bytes/decodes quoted above):** the boot-path literals 2/16 are real; blocks 2/16
exist and decode to the demo reel and the opening cinematic respectively; block 16 sets
`LastEclBlockId=16` and world coords (33,13), ends in `SETUP_MONSTER`+`EXIT`, contains no
NEWECL; no DoK ECL block NEWECLs to 34; GEO1 has no block 16; `eclInitBlock: 34`'s provenance
is commit `52c0809`'s walkable-dungeon choice. **Inferred, not proven:** block 17 as the
overland/travel hub; `0x1d`'s in-game semantics ("beat/wait"); the exact native mechanism that
places the party on the world map after the opening combat (needs the live trace Update 7
already specified — its step list remains the right next move for the *dynamic* half).

## 2026-07-18 Update 9: Per-Game Operand-Table Audit — DoK/Gateway/Treasures/PoD Use Short
## Frames; Fix Shipped (Engine + Tools); DoK Block 34 Goes 0 → 3 Combat Candidates

Closes Update 8's side-finding. Static-only round (no DOSBox-X). Everything below is
byte-grounded against the retail DAX archives in this repo; all decodes use the shared,
already-tested primitives (`gen1_ecl_encounter_scan.decode_one`/`header_entries`,
`goldbox_corpus.read_dax_blocks`, the 6-bit string codec).

### 1. Independent verification — two methods, nine Gen1 titles

**Method A — whole-block boundary-exact parses.** Every ECL block of every detected Gen1 title
was linearly parsed from the 22-byte header to the end of the block under the cross-product of
candidate operand counts (`0x1D` in {0,1} × `0x21` in {2,3} × `0x2C` in {1,4,6}); a combo "wins"
only if the parse hits no undefined opcode, no truncated operand, and the final instruction
boundary lands **exactly** on the block length. Key results:

- **DoK `ECL1.DAX#16`** (1809 B, the opening cinematic): wins ONLY under `0x1D`=0 and `0x2C`=1.
- **DoK `ECL1.DAX#2`** (1146 B, the attract demo): wins ONLY under `0x2C`=1 and `0x21`=3.
- **CoK/CoAB/Secret/Gateway/NWN/Pool**: every exactly-parsing block that decodes a `0x21`
  requires `0x21`=3 (`0x21`=2 never wins for any title — the Gen2 short LOAD_FILES is Gen2-only).
- **CoAB `ECL3.DAX#16`**: excludes `0x2C`=1 (wins only under 4/6 — long-frame family).

**Method B — anchor re-landing.** A control-flow BFS decodes each block while tracking a taint
bit that is set once a path decodes *through* a contested opcode; offsets reached by untainted
paths are table-independent instruction boundaries ("anchors" — every candidate table decodes
those paths identically; IF-skip successors whose guarded instruction is itself contested are
excluded as table-dependent). For each contested-opcode occurrence that is itself an anchor,
each candidate count's linear continuation either re-lands exactly on the next anchor (pass),
decodes past it / hits an undefined opcode / produces a word-coded jump target outside the block
(fail), or exits before reaching it (non-decisive). Decisive verdicts:

| Title | `0x1D` decisive sites | `0x2C` decisive/sole-pass sites |
| --- | --- | --- |
| Death Knights of Krynn | **65:0 for 0 operands** | 0 decisive (whole-block proofs above carry it; anchored sites: `4`/`6` fail where `1` survives) |
| Treasures of the Savage Frontier | **75:0 for 0** | 18 sites exclude `6`; `1` vs `4` tie (streams re-merge — see below) |
| Pools of Darkness | **154:0 for 0** | 5 decisive for `1`, 2 resync coincidences for `4` with implausible operand codes (`0x3a`/`0x2d`) |
| Pool of Radiance | non-decisive (idiom supports 1 — see below) | **34 sole-pass for 6** |
| Curse of the Azure Bonds | non-decisive (same idiom) | **14 sole-pass for 6** |
| Secret of the Silver Blades | zero occurrences | 1 sole-pass for 6 |
| Champions of Krynn | **zero reachable occurrences** | 6 sole-pass for 6 |
| Gateway to the Savage Frontier | zero occurrences | zero occurrences |
| Neverwinter Nights (DOS) | zero occurrences | zero occurrences |

Corroboration for the long-frame family: the EclDump ground-truth dumps
(`daxdump_extracted/ECL1_033.txt`) show CoK's PARLAY spanning `0x85C7..0x85D5` = 14 bytes =
1 opcode + one 3-byte word destination + five 2-byte immediates = **6 operands**, and
Pool/CoAB's `0x1D` sites all follow the idiom `PARTYSTRENGTH <result-var> ; DIVIDE var,#16,var`
(`1d 01 7a 7f 06 01 7a 7f 00 10 ...`) — a 1-operand frame; under a 0-operand reading the same
bytes would be a GOTO to a data address below the code base. Treasures' `1`-vs-`4` tie is broken
toward `1` by operand-code plausibility (the `4` reading consumes operand code `0x2d`, seen
nowhere else in any title) and by engine-family consistency with PoD/DoK, and is
**output-invariant on current data** (both counts re-merge at the same next boundary on all 18
sites). Gateway's grouping with Treasures is family-inference only and cannot affect output
(zero occurrences).

**Verdict:** two dialect camps. Long frames (`0x1D`:1, `0x2C`:6) — Pool, CoAB, Secret, CoK,
NWN. Short frames (`0x1D`:0, `0x2C`:1) — DoK, Gateway, Treasures, PoD. `0x21`:3 for all nine
(the Gen2 2-operand LOAD_FILES stays Gen2-only). The short frames are the mid-point toward
DQK's Gen2 frame (`0x1D`:0, `0x2C`:4, `0x21`:2), which was already runtime-proven separately.

### 2. Fix shipped (engine + tools, per-game)

- `tools/gen1_ecl_encounter_scan.py`: `GEN1_WORD_SETS` (long, unchanged default) +
  `GEN1_SHORT_WORD_SETS` + `PROFILE_WORD_SETS` + `word_sets_for_profile()`; `decode_one`/
  `successors`/`scan_block` take an optional `word_sets`; `build_report` selects per profile.
  The emitted JSON now carries `word_set_dialect` per game.
- `packages/engine/src/ecl/disassemble.ts`: `EclDialect` gains `wordSetOverrides`; the Gen2
  hardcoded `hasMagic===false` ternaries moved onto `ECL_GEN2`; new exported dialect
  **`ECL_GEN1_SHORT`** (`{headerLen:22, vbase:0x7ffe, hasMagic:true, wordSetOverrides:{0x1d:0, 0x2c:1}}`).
- `apps/web/src/ui/gameData.ts` / `explore.ts`: `eclDialect: 'gen1-short'` wired for the `dok`
  and `gateway` profiles via a shared `eclDialectFor()` helper (`pool` unchanged).
- `tools/map_savage_frontier_targets.py`: decodes candidate paths with the per-profile table.
- Tests: `packages/engine/test/ecl.test.ts` pins the short-frame decode against DoK block 16's
  real tail bytes (`1d | 01 01 89 81 | ... | 00`) and the desync of the same bytes under the long
  frame; the DoK block-33 investigation test in `dungeonEvents.test.ts` now drives the VM with
  `ECL_GEN1_SHORT` and pins the corrected (further-reaching, still halted) behavior.

### 3. Re-audit of the invalidated artifacts (`build/gen1-ecl-encounters.json`)

Long-frame titles: **byte-identical results** (Pool 335, CoAB 292, Secret 273, CoK 221, NWN 442
candidates — no regression). Gateway: unchanged (583). Short-frame titles:

- **DoK: 14 → 24 candidates, 4 → 10 rostered.** Newly visible blocks: **34 (0→3)**, 50 (0→2),
  67 (0→1), 81 (0→1), 99 (0→1); block 33 2→3, 17 2→4; two prior phantom candidates (32, 98)
  produced by desynced streams disappeared.
- Treasures: 20 → 23 candidates, 1 → 6 rostered. PoD: 53 → 68 candidates, 25 → 36 rostered.
- Downstream: `build/savage-frontier-targets.json` regenerated — byte-identical (selected
  routes unchanged). `tools/goldbox_corpus.py --strict` regenerated — **byte-identical game
  entries, zero tier drift** (the corpus gate reads the hand-curated campaign matrix and route
  declarations, not the encounters JSON).

### 4. The payoff — DoK block 34 (Cekos, the Greybox `eclInitBlock`) natural encounter, statically verified end-to-end

**Why it was invisible:** block 34's dispatch chains all pass through `PARTYSTRENGTH` sites.
At vaddr `0x9310` the bytes are `1d 1c 0b 00 21 ...`; the long frame consumed `1c 0b` as the
PARTYSTRENGTH operand and landed on `00` = EXIT — every scan died right there, one instruction
before the roster load. Under the short frame the same bytes are
`PARTYSTRENGTH ; CLEARMONSTERS ; LOAD_MONSTER #33,#15,#33 ; ...`.

**Trigger cell:** `GEO1.DAX#34` plane-2 (backdrop) cell **(x=11, y=1)**, byte `0x8c` —
event-active bit `0x80` set, descriptor `0x8c & 0x3f = 12`. It is the *only* descriptor-12 cell
in the block.

**Dispatch:** `search_location` entry (header far-pointer 1, vaddr `0x82bd`):

```text
82bd: SAVE #80 -> [0x7ec6]
82c3: GOSUB 0x9b2b                       ; time-of-day prologue ([0x4bc9] vs 14 -> [0x4bfd]=11/8)
82c7: AND #128, [0xc04f], [0x7f79]      ; event-active bit test
82d0: IF_NE ; SAVE #1 -> [0x4c0c]
82d7: IF_EQ ; SAVE #0 -> [0x4c0c]
82de: AND #63, [0xc04f], [0x7f79]       ; descriptor = cell byte & 0x3f
82e7: COMPARE #1, [0x4c5c] ; IF_EQ ; GOTO 0x8346
82f2: ON_GOTO [0x7f79], #26, 0x9b2a, 0x839a, 0x8557, 0x879c, 0x8919, 0x8a2a, 0x8bef, 0x8cb1,
      0x8e55, 0x8ff4, 0x90de, 0x9205, 0x92b7, 0x93cf, 0x93f9, 0x9b2a, 0x945d, 0x94b5, 0x9623,
      0x9680, 0x9b2a, 0x97aa, 0x9810, 0x9911, 0x9a8b, 0x9b2a
      ; 0-based index 12 -> 0x92b7
```

**The SIVAK chain at `0x92b7`** (bytes quoted from the decompressed block; every boundary
verified by the corrected decoder):

```text
92b7: AND #8, [0x4c5f], [0x7f79]        ; 2f 00 08 01 5f 4c 01 79 7f   consumed-bit (bit 3)
92c0: IF_NE ; SURPRISE ...              ; revisit guard
92cb: PRINTCLEAR "SIVAKS ARE GATHERED AROUND A TABLE. "
92e9: GOSUB 0x9b5c                      ; party scan sub (LOAD_CHARACTER loop over [0x7d00])
92ed: IF_NE ; GOTO 0x9304               ; -> fight
92f2: RANDOM #99 -> [0x7f79]
92f8: COMPARE [0x7f79], [0x7ca8]
92ff: IF_LT ; GOTO 0x9369               ; "THEY ARE EXAMINING SOMETHING..." sneak-away branch
9304: PRINT "THEY ATTACK!"              ; 11 80 09 50 81 59 80 15 14 04 32 e1
9310: PARTYSTRENGTH                     ; 1d               <- the opcode that hid everything
9311: CLEARMONSTERS                     ; 1c
9312: LOAD_MONSTER #33, #15, #33        ; 0b 00 21 00 0f 00 21   SIVAK x15 (MON1CHA id 33)
9319: COMPARE #1, [0x4c5e]
931f: IF_EQ
9320: LOAD_MONSTER #97, #1, #97         ; 0b 00 61 00 01 00 61   + IGORF (id 97) conditionally
9327: COMBAT                            ; 24
9328: OR #8, [0x4c5f], [0x4c5f]         ; 30 00 08 01 5f 4c 01 5f 4c   set consumed bit
```

Monster names decoded from `MON1CHA.DAX` record names: id 33 = `SIVAK` (matches the flavour
text), id 97 = `IGORF`. The block's other two new candidates are equally coherent: descriptor
22 -> `0x9810` (town-guard/BLUE DRAGON x4 chain into `COMBAT 0x99c2`, "IGORF ATTACKS ONE OF THE
DRAGONS...") and descriptor 5 -> `0x8a2a` (tavern chain into `COMBAT 0x8a34`, no local roster).

**Runtime preconditions for the SIVAK combat branch (all statically identified, none proven
live):** bit 3 of `[0x4c5f]` clear (fresh visit); the `0x9b5c` sub's compare outcome or the
`RANDOM #99` vs `[0x7ca8]` roll routing to `0x9304`; `[0x4c5e]` controls the optional IGORF
add. `requires_runtime_seed: true` in the JSON is accurate.

### 5. Block 33 re-audit — the "invalid GOTO / bad monster table" claims re-attributed

The corrected decode of block 33's descriptor-33 branch (`0x8ae6`) shows the PRIESTS arm is
pure narration + a code store: `PRINTCLEAR "PRIESTS HOLD AN EVIL RITE." ; DELAY ;
PRINT " 'HEATHENS!'" ; SAVE #8 -> [0x4c58] ; GOTO 0x9ad5`. The shared builder at `0x9ad5` does
seven `GETTABLE` reads indexed by `[0x4c58]` from in-block tables at `0x9d14..0x9d50` (10
entries each; row 8 = picture 75, counts 0/4/0/0/1/3), then `SETUP_MONSTER #70,#1,#255`
(vaddr `0x9b21`), then the `01 79 7f` bytes at `0x9b28` (the code-`0x79` GOTO operand — real
retail data, now precisely placed INSIDE the shared builder, not in the PRIESTS arm), then
`CLEARMONSTERS` + count-guarded `LOAD_MONSTER`s (ids 28/45/72/66/67/70 = HELLHOUND, ROGUE,
EVIL WARRIOR, BLACK MAGE, BLACK WIZARD, PATRIARCH — **all real MON1CHA records**; the archive
is a sparse 64-record set whose ids reach 97, so 2026-07-16's "ids 0-63, out of range" reasoning
is retired) into `COMBAT` at `0x9b86`. For encounter code 8 the roster is ROGUE x4 +
BLACK WIZARD x1 + PATRIARCH x3 — a perfectly sensible "evil rite" encounter. The engine test now
observes `SETUP_MONSTER #70` actually firing (`encounterSetup` effect) before the VM halts on
the `0x79` operand — the halt itself is the one remaining VM-fidelity question (retail
dynamic-GOTO fallthrough would continue at `0x9b2b` and reach `COMBAT`; the static scanner
models exactly that, which is where the block-33 candidate's HELLHOUND-slot roster comes from).

### Claim boundary

**Proven (bytes above / regenerated artifacts):** the per-game operand tables of section 1; the
DoK block-34 SIVAK chain's full instruction stream, its unique trigger cell, and its roster ids;
block 33's corrected PRIESTS/shared-builder split and table row 8; zero regression on
long-frame titles; zero corpus tier drift. **Not proven (needs live/VM work):** the retail
semantic of the code-`0x79` GOTO operand at `0x9b28`; any live traversal to cell (11,1); the
`[0x4c5e]`/`[0x7ca8]`/`[0x4c57]` seeds' natural values on a fresh game. **Deliberately not
done (scope):** wiring a browser `?explore=dok-natural` route onto the block-34 candidate —
this section is written to be directly consumable by that implementation.

## 2026-07-18 Update 10: Route WIRED and PROVEN — `?explore=dok-natural` Live, DoK Promoted to Persistent (STATIC ONLY — no DOSBox-X)

Update 9's candidate-route spec was consumed exactly as written. DoK's first natural route is now
proven at all three levels of the `persistent-natural-routes.md` contract (engine golden, save v2
round trip, live browser walk + persistence), and the corpus promotes DoK **route → persistent**.

### What shipped

- **Route profile** `dok-natural` (`apps/web/src/ui/gameData.ts`): DoK's own archives
  (`ECL1/GEO1/WALLDEF1/8X8D1/MON1CHA/MON1SPC/MON1ITM/MON1WIZ/ITEM0.DAX`), `eclInitBlock: 34`,
  `eclDialect: 'gen1-short'` (the Update 9 dialect fix is a hard requirement — long frames
  desync this exact chain). Registered in `main.ts` (`?explore=dok-natural`), `docs.ts`,
  `support.ts`.
- **Engine golden** (`packages/engine/test/dungeonEvents.test.ts`, describe "golden DoK ECL1
  block 34"): (11,1) is the **unique** descriptor-12 cell in `GEO1.DAX#34` (`[[11, 1, 0x8c]]`);
  fresh memory + any seed → `primeSearchLocation` → a direct `combat` turn (no menu) with text
  "SIVAKS ARE GATHERED AROUND A TABLE." + "THEY ATTACK!", roster exactly
  `[{ monsterId: 33, count: 15, picBlockId: 33 }]`, no SURPRISE; `afterCombat('victory')` prints
  the silver-key beat and writes `[0x4c5f] |= 0x08`. Second test proves the conditional IGORF
  arm (`[0x4c5e]=1` → second group `{97,1,97}`) and the revisit semantic (below). Seed-swept.
- **Save v2 row** (`packages/engine/test/saveGame.test.ts`): `['DoK ECL1#34', 11, 1, 'north',
  0x4c5f, 0x08]` — areaMemory round-trips through save version 2 under map key
  `"Death Knights of Krynn ECL1#34"`.
- **Browser e2e** (`apps/web/test/e2e.mjs::runExploreDokNaturalCombat`, id
  `explore-dok-natural-combat`): spawn pose asserted (2,1,north — `chooseStart` on the real GEO
  bytes), 17-step legal walk (25 turn/step actions) derived from the GEO wall data via
  `tools/find_geo_path.py --avoid-event-index 22` (the desc-22 BLUE-DRAGON town-guard chain at
  (8,1) must be avoided; the forced desc-11 crossing at (10,4) was VM-proven a silent no-op —
  writes only scratch cells, no collision with `0x4c5f`/`0x4c5e`), arrival pose (11,1,north),
  natural dispatch text, enemy names 6× SIVAK (display cap 6-of-15, same precedent as CoK's
  route), fresh `encounterSurprise() === null`, `[0x4c5f]` 0 → 0x08 across victory, then the
  shared `verifyNaturalPersistence` (reload → memory persisted → walk back → **re-fires**).
  Focused run: PASS (1/1). Full-suite gate result recorded in HANDOFF.
- **Corpus/evidence**: `tools/goldbox_corpus_routes.json` DoK entry upgraded to the full
  `natural_encounter` + `persistence` byte contract (vaddrs 0x9312/0x9320 LOAD_MONSTER, 0x9327
  COMBAT, 0x9328 resume, `[0x4c5f]|=8`); `tools/goldbox_campaign_matrix.json` gains DoK (early
  `proven`, five legs honestly `not-tracked`); `goldbox_corpus.py --strict` passes, DoK
  `level: "persistent"`, gap `campaign-matrix-incomplete:middle,ending,town,wilderness,quest`.

### Historical Update-10 reading — SUPERSEDED by Update 15

This round decoded SURPRISE with the long four-operand frame and therefore concluded the persisted
bit armed a refiring ambush. Update 15 later proved from DoK's own `GAME.OVR` handler that short
SURPRISE is zero-operand and terminal. The correct reading is the standard consumed guard: the
victory write `OR #8,[0x4C5F]` makes a revisit exit silently. Goldens and e2e were corrected and the
temporary `revisitRefires` helper mode was deleted.

### The `0x79` question (Update 9's open item): NOT on this route

The wired route never executes the `01 79 7f` bytes at `0x9b28` — that operand sits in **block
33's** shared table-driven encounter builder, and this route lives entirely in block 34's
descriptor-12 chain (`0x92b7–0x9331`, disassembly-verified to contain no code-`0x79` operand).
Its retail semantic therefore remains an open block-33 question, unchanged by this round;
block 33's honest halt/tripwire test in `dungeonEvents.test.ts` stays as-is.

### Still open after this round

- The five DoK campaign-matrix legs (middle/ending/town/wilderness/quest) — startable now.
- The `0x79` operand semantic at `0x9b28` (block 33) and block 33's route generally.
- The optional literal-16 boot-block live reconciliation (Update 7's breakpoint spec) — a
  DOSBox-X nicety, no longer a P2 gate.
- Original-DOS save write-back parity (separate format gate, all games).

## 2026-07-18 Update 11: DoK's Second Route (wilderness leg) proven; combat-leg sweep stays negative

Static-only follow-up (no DOSBox-X). Full route detail lives in
`persistent-natural-routes.md`'s new "DoK's Second Route (Wilderness — Unconditional Area-Mode
Entry)" section; this update records the P4 investigation trail that found it.

**Combat-leg attempt (negative, honest).** First tried to repeat block 34's own method — a second
COMBAT candidate reachable by backdrop-selector alone. `tools/gen1_ecl_encounter_scan.py` rosters
4 other candidates (ECL1#17, ECL1#33, ECL2#67, ECL3#99); swept each across the full backdrop
range 0-255 with a real `EclVm` and default (fresh-game) memory — zero reached a `combat` effect.
ECL2#67 looked most promising (the CFG scanner's own recorded witness path reaches a COMBAT), but
concrete VM execution at the scanner's own selector value diverges from that witness path at a
`COMPARE #1,[0xC00D]`/`IF_EQ` gate a fresh game never satisfies — a cross-block precondition, the
same shape `persistent-natural-routes.md`'s CoK-middle-route section documents rejecting rather
than forcing. Genuinely blocked; not pursued further this round. **[2026-07-22, Update 14:
WRONG — "`[0xC00D]`" was a transcription slip for `[0xC04D]`, the facing register. The gate is
deterministic (face east) and the leg is now proven; see Update 14.]**

**Wilderness leg (positive).** Pivoted to the non-combat `inDungeon`/`WildernessMap` engine-mode
classifier CoK's own wilderness leg and Secret's structurally-absent classification both use
(`tools/map_gen1_area_mode_writes.py`). It had reported "0 hits" for DoK — but that scanner had
two real bugs specific to DoK, both fixed this round: `death-knights-of-krynn` was missing from
its `GEN1_PROFILE_IDS` tuple entirely (silently filtering every DoK scan to zero games before any
block was touched), and its `decode_one()` call never passed DoK's `GEN1_SHORT_WORD_SETS`
dialect (the same decode-desync bug class Update 9 root-caused for the combat scanner). Fixing
both surfaces 25 real `SAVE`-to-`0x4BE6` hits. The simplest, `ECL1.DAX#17`'s `initial_entry`,
writes `inDungeon=0` completely unconditionally (the second instruction executed, no
`COMPARE`/`IF` before it) — locked in as a new engine golden test
(`dungeonEvents.test.ts` "EclVm cold run — golden DoK ECL1 block 17 wilderness-mode entry").
This meets the campaign matrix's own stated "proven" bar (engine-golden/CFG-trace proof against
real retail bytes; live wiring not required, same precedent as CoK's/Secret's quest legs).
`tools/goldbox_campaign_matrix.json`'s DoK `wilderness` leg: `not-tracked` → `proven`.

**Net effect on the campaign matrix.** DoK now has 2 of 6 legs proven (`early`, `wilderness`);
`middle`/`ending`/`town`/`quest` remain `not-tracked` — still one gate short of `campaign` tier
(`goldbox_corpus.py --strict`'s gap list should now read `campaign-matrix-incomplete:
middle,ending,town,quest`, one entry shorter than before this round).

**Still open after this round (revised):**
- `middle`/`ending`/`town`/`quest` legs — still `not-tracked`, never investigated.
- A second *combat*-shaped natural encounter — the 4 rostered candidates all failed the
  backdrop-only sweep; needs the same kind of selector/descriptor CFG survey CoK's own
  middle-route leaf required, not another backdrop sweep of the same candidates.
- Whether the area-mode scanner's other 24 DoK hits (ECL1#16/#36, ECL2#50/#64, ECL3#81/#98/#99)
  split cleanly into town vs. literal dungeon the same binary way CoAB's source does — unexamined
  this round, `docs/engine/research/gen1-area-mode-writes.md` now lists them all for a follow-up.
- Live in-browser wiring of the wilderness leg (which GEO area(s) actually render on WILDCOM) —
  deferred, matching CoK's own Sixth Route deferral precedent.
- The `0x79` operand semantic at `0x9b28` (block 33) — unchanged, still open.

## 2026-07-18 Update 12: Town leg PROVEN (real VM bug fix); middle/ending/quest stay blocked with concrete root causes (STATIC ONLY — no DOSBox-X)

Static-only follow-up on Update 11's leftover leg list, using
`docs/engine/research/gen1-area-mode-writes.md`'s remaining 23 DoK `SAVE`-to-`0x4BE6` hits
(`ECL1#16/#36`, `ECL2#50/#64`, `ECL3#81/#98/#99`) as the discovery seed.

**Town leg — PROVEN.** `ECL1.DAX#36` ("Cekos Main Gate") was the first candidate walked: it's a
real, walkable GEO-backed town area that auto-triggers a `PARLAY` (attitude-select menu) greeting
scene right after `SAVE #1, 0x4BE6` (the `inDungeon=1` local/town-area-mode write — the mirror
image of the wilderness leg's `inDungeon=0`). Resuming that `PARLAY` with each of the 5 attitude
choices produced *byte-identical* effects and memory state regardless of choice — clearly a bug,
not game behaviour. Root cause, found by inspecting `vm.ts`'s `case 0x2c`: DoK's Gen1-SHORT
dialect encodes `PARLAY` with a single operand (just `destAddr`; no value-remap table, unlike the
long dialect's up-to-6-operand form). With one operand, `destIndex = a.length - 1 = 0`, so
`values = a.slice(0, 0) = []` — an **empty but truthy** array. The resume path
(`pending.valueMap[index] ?? pending.valueMap[0] ?? 0`) then resolves every choice to `undefined
?? undefined ?? 0 = 0`, so all 5 attitudes wrote the same value. This is a genuine, general VM
fidelity gap (not DoK-specific data), fixed in `src/ecl/vm.ts`: `valueMap: values.length > 0 ?
values : undefined`, so a table-less `PARLAY` now falls through to the existing MENU/ASK
passthrough convention (raw chosen index written directly) instead of a bogus all-zero map.

Block 36 itself didn't fully resolve after the fix (it chains into a *second*, nested `PARLAY` via
a `movePositionForward` call and stays `awaiting-input` — a real but more complex sub-chain, not
pursued further this round). But the fix's effect was checked against DoK's other 2 remaining
`0x4BE6`-writing `PARLAY` blocks and **both resolve cleanly**:

- `ECL3.DAX#81`: falls through its `initial_entry`'s self-identity `COMPARE [0x4BF2],81` /
  `IF_EQ` guard on cold (all-zero) memory — the guard jumps away only on a *match*, so a fresh
  game's zeroed memory takes the normal fall-through path, no seeding needed — into `SAVE #1,
  0x4BE6`, `LOAD_FILES(80,...)`, `LOAD_PIECES(5,...)`, `PARLAY`, then prints a real, atmospheric
  arrival text: *"THIS MAIN STREET LEADS INTO DULCIMER. FROM THE WEST YOU SMELL ROTTEN
  VEGETABLES. ZOMBIES FILL A MARKET TO THE EAST. A DOG LURCHES PAST, PURSUED BY AN UNDEAD
  CHILD."* — then a clean `exited` status, identical for all 5 attitude choices.
- `ECL2.DAX#64`: same shape, a different named town — Cerberus — with a longer NPC-dialogue
  arrival text about a mayor's funeral (*"PEOPLE FROM CERBERUS FILL THE AREA, PREPARING FOR THEIR
  MAYOR'S FUNERAL... FUNERAL IS IN THE MAUSOLEUM..."*), also `inDungeon=1`, also choice-independent
  after the fix.

Two independent named towns (Dulcimer, Cerberus), in two independent ECL archives (ECL3, ECL2),
both reaching a clean exit with real retail arrival text and the same `inDungeon=1` area-mode
marker the project already treats as load-bearing (per the wilderness leg's `inDungeon=0`
precedent) — this clears the campaign matrix's "proven" bar (VM golden against real retail bytes;
live in-browser wiring explicitly not required, same precedent as CoK's/Secret's quest legs).
Locked in as two new engine goldens in `dungeonEvents.test.ts`: "golden DoK ECL3 block 81 town
entry" (all 5 choices asserted) and "golden DoK ECL2 block 64 town entry" (second archive,
confirms generalization). `tools/goldbox_campaign_matrix.json`'s DoK `town` leg: `not-tracked` →
`proven`.

**Middle leg — investigated, stays blocked (root cause now concrete).** Re-swept the encounter
scanner's rostered middle-area candidates (`ECL1#17`/`#33`, `ECL2#67`, `ECL3#99` — Update 11 had
already found these negative under a plain backdrop sweep). Step-traced `ECL3#99` specifically
(the strongest-looking one, with a decoded static path reaching a rostered combat with a monster
roster) to find *why*: the real chain hits `RANDOM(99)` → `COMPARE(29)` → `IF_GT` → `EXIT` before
ever reaching the visit-counter-gated combat body — a genuine, classic wandering-monster RNG gate,
the same category this project already excludes project-wide as non-deterministic/non-groundable.
Not a new negative in kind, just a concrete root cause for the one candidate that looked most
promising on paper.

**Ending leg — investigated, stays blocked (one hypothesis tried and decisively falsified).**
`ECL3.DAX#98` ("Dargaard Keep", top floor) is a real, walkable dungeon area that reaches a "GO
DOWN THE STAIRS?" prompt before halting on a bad-opcode decode desync at raw offset 652, right
after decoding opcode `0x22` (`PARTY_SURPRISE`) under the default (`wordSet=2`) table. Brute-forced
every wordSet value 0–6 at that offset; `wordSet=1` produced the most superficially coherent
decode chain (`PARTY_SURPRISE(0) → NEWECL(97) → COMPARE → IF_NE → EXIT → PRINTCLEAR → PRINT →
PRINT`), suggesting an auto-descend into block 97 after a surprise check. This hypothesis was
**decisively falsified** two independent ways before any fix was applied to shared code:
1. Applying the override and running the VM for real (not just decoding) crashes
   (`EclVm.addrOf`, "Cannot read properties of undefined (reading 'word')") — `vm.ts`'s own
   `case 0x22` handler needs exactly 2 operands, grounded in the CoAB oracle (`CMD_PartySurprise
   sub_2767E`, `vm.ts:1384-1389`). The handler's own arity is the ground truth here, not a
   plausible-looking decode chain; `wordSet=2` (2 operands) is correct as shipped.
2. A corpus-wide "count bad-opcode decode failures per wordSet" audit (the same evidentiary shape
   used to originally prove the `0x1D`/`0x2C` short-dialect wordSets) across all 3 DoK ECL
   archives came back **mixed, not decisive**: `wordSet=1` wins on `ECL1.DAX` (396 vs. 424 bad
   opcodes) but *loses* on `ECL2.DAX` (425 vs. 412) and `ECL3.DAX` (594 vs. 572). A real dialect
   fix should win everywhere, the way the original `0x1D=0`/`0x2C=1` fixes did; this doesn't.

So the actual cause of block 98's halt is still genuinely unresolved — no fix was applied to
`opcodes.ts`/`ECL_GEN1_SHORT` for opcode `0x22` (the shipped `wordSet=2` stays as-is, now with an
explicit citation to why it's correct). Separately, and worth recording for a future round:
`ECL3.DAX#97` (the block 98's broken chain would have jumped to) decodes and *runs cleanly on its
own*, standalone, under the plain unmodified dialect — a coherent, real dungeon body ("THE ROOM AT
THE TOP OF THE STAIRS IS FOGGY AND DARK." → `PARTYSTRENGTH` → `SURPRISE` encounter check) that
reads like a genuine late-game area. It just isn't reachable via any proven path yet — a concrete,
narrower next-steps lead rather than a dead end.

**Quest leg — investigated, stays blocked (no evidence found).** Extended
`tools/map_gen1_cross_area_flag_reads.py`'s `FLAG_REGISTRY` with DoK's own consumed bits from its
now-3 proven legs: `0x4C5F` (early leg's SIVAK-ambush consumed bit), `0x4C5E` (early leg's IGORF
second-group gate, setter still unlocated), and `0x4CF7` (wilderness leg's `initial_entry`'s own
first write, one instruction before the proven `inDungeon=0` write). While doing this, found and
fixed a real bug in the tool itself — `scan_block_for_targets` never threaded its `word_sets`
parameter through to `decode_one`/`successors`, so DoK's short-dialect operand framing was silently
never applied to DoK scans (the same decode-desync bug class Update 9 and Update 11 already fixed
in the encounter scanner and the area-mode-writes scanner respectively). Fixed and verified
(`python -m pytest tools/test_map_gen1_cross_area_flag_reads.py -q` → 4 passed) before trusting its
DoK output. Rerunning against real retail bytes found every hit for all 3 addresses stays within
the same block, or is a same-address-different-purpose write — no genuine cross-block *gating
read* of any of DoK's own currently-proven-leg flags. Honest negative: no quest-flag dependency
evidence exists yet from the legs proven so far. (Once the middle/ending legs are proven, their own
consumed state should get the same check — the flag registry is additive.)

**Net effect on the campaign matrix.** DoK now has 3 of 6 legs proven (`early`, `wilderness`,
`town`); `middle`/`ending`/`quest` are `blocked` (investigated, concrete root causes, not merely
`not-tracked`). `tools/goldbox_campaign_matrix.json` updated; `goldbox_corpus.py --strict` recomputed:
`campaign_matrix.satisfied = false`, `failing_legs = ["middle", "ending", "quest"]` — DoK stays at
`persistent` tier, one gate closer to `campaign` (was 4 failing legs, now 3, and all 3 have
concrete documented root causes rather than being unexamined).

**Engine changes this round:**
- `packages/engine/src/ecl/vm.ts` `case 0x2c` (PARLAY): general VM bug fix, empty `valueMap`
  no longer forces every choice to resolve to 0. Verified against the full engine suite (149
  files / 1761 tests, zero regressions) before and after cleanup of scratch investigation files.
- `packages/engine/test/dungeonEvents.test.ts`: two new goldens, "golden DoK ECL3 block 81 town
  entry" and "golden DoK ECL2 block 64 town entry".
- `tools/map_gen1_cross_area_flag_reads.py`: threaded `word_sets` through
  `scan_block_for_targets`/`decode_one`/`successors` (was ignoring per-profile dialect entirely);
  added DoK's `FLAG_REGISTRY` entries.

**Still open after this round:**
- `middle`/`ending`/`quest` legs — all now `blocked` with concrete, documented root causes (RNG
  gate; unresolved bad-opcode desync with one hypothesis falsified; no cross-block flag evidence
  yet).
- `ECL1.DAX#36`'s own nested second `PARLAY` (reached via `movePositionForward`) — not resolved,
  a real sub-chain left for a follow-up rather than needed for the town leg (already proven via
  `#81`/`#64`).
- `ECL3.DAX#98`'s real halt cause at opcode `0x22` — still genuinely unknown; the wordSet=1
  hypothesis is now closed off, not just untried. `ECL3.DAX#97` is a promising, cleanly-decoding
  standalone candidate for whatever eventually reaches it.
- Live in-browser wiring of the town leg (`?explore=dok-natural-N`-style route) — deferred,
  matching CoK's/Secret's own engine-proven-only precedent for this class of leg.
- The `0x79` operand semantic at `0x9b28` (block 33) — unchanged, still open.
- `ECL2.DAX#50`, `ECL1.DAX#16` — 2 of the original 23 area-mode-write hits never examined this
  round; lower priority now that the town leg is proven via 2 independent blocks already.

## Update 13 (2026-07-18): ECL3.DAX#98's real halt cause — PARTY_SURPRISE (0x22) is a THIRD
## short-dialect zero-operand opcode. Decode desync fixed and verified. Ending leg still not
## fully provable (a separate, genuine reachability gap for the trigger cell).

Follow-up to Update 12's honest "still genuinely unknown" on ECL3.DAX#98's opcode-0x22 halt.
Re-disassembled block 98 with the real `disassembleSubroutine`/`decodeInstructionAt` machinery and
found the earlier "wordSet=1 crashes the VM" result was an artefact of an *incomplete* fix, not
evidence against the hypothesis itself: `EclVm.addrOf(a)` is just `return a.word` — it never
validates the operand's code, so it only throws when the operand *array slot itself* is
`undefined` (i.e. when a dialect wordSet override drops the arg count below what `vm.ts`'s own
`case 0x22` handler still unconditionally reads at `a[1]`). That's a missing-handler-update bug,
not proof the operand count is wrong.

**Corpus-wide re-audit, done properly this time.** Update 12's own "mixed" cross-title tally used a
naive linear scan; `disassembleSubroutine` (and any similar straight-line walker) unconditionally
stops at the first `EXIT` byte it decodes even when that `EXIT` is only *conditionally* reached
(preceded by an `IF_GT`/`IF_LT`-style skip pattern) — undercounting real reachable code and
corrupting exactly this kind of tally. Redid the audit with the project's real CFG-following
`successors()` walker (`tools/gen1_ecl_encounter_scan.py`, the same tool that originally found the
0x1D/0x2C split) across every *reachable* instance of opcode 0x22 in DoK, Gateway, Treasures, and
Pools of Darkness (short-dialect titles) plus Pool of Radiance (long-dialect control):

| title | reachable 0x22 sites | both-operands address-coded (clean under wordSet=2) |
| --- | --- | --- |
| Pool of Radiance (long dialect, control) | 14 | 14 / 14 (100%) |
| Death Knights of Krynn | 120 | 1 / 120 |
| Treasures of the Savage Frontier | 115 | 0 / 115 |
| Pools of Darkness | 254 | 0 / 254 |

The long-dialect control title is unanimously clean; every short-dialect title is unanimously
dirty. Re-decoding the same DoK ECL3#98 site as a 0-operand instruction runs 60+ further
instructions with zero bad opcodes, landing on coherent retail content: `PRINTCLEAR`/`PRINT`
flavour text, a `PARTYSTRENGTH` check, a real `SETUP_MONSTER`/`LOAD_MONSTER`/`COMBAT` encounter,
and — critically — a `NEWECL #97`, exactly matching Update 12's own flagged "clean standalone
candidate" `ECL3.DAX#97`. Confirmed end-to-end via the real `EclVm` interpreter
(`primeSearchLocation` on the block's "GO DOWN THE STAIRS?" cell floor byte `0x81`, seeded
`[0xc04d]=1`): `vm.run()` now returns `status: 'chain', chainBlockId: 97` instead of halting.

**Verdict: PARTY_SURPRISE (0x22) takes ZERO operands in the Gen1-SHORT dialect**, the same class of
finding as 0x1D/0x2C — a real, generalizable third dialect delta, not block-98-specific corruption
or a miscalculated block length.

**Fix applied**, mirroring the existing PARTYSTRENGTH precedent (compare-flags side-channel
instead of address writes):
- `packages/engine/src/ecl/disassemble.ts`: `ECL_GEN1_SHORT.wordSetOverrides` gains `0x22: 0`.
- `packages/engine/src/ecl/vm.ts` `case 0x22`: branches on `a.length` — long dialect (`a.length >=
  2`) keeps writing `out_has_ranger`/`out_zero` to addresses exactly as before (CoAB oracle,
  `CMD_PartySurprise sub_2767E`, unchanged); short dialect (0 operands) now calls
  `this.setCompareFlags(this.partyHasRanger ? 1 : 0, 0)` instead of touching `a[1]` at all. The
  comparison polarity (`partyHasRanger` vs `0`) is the natural reading carried over from the long
  dialect's own output semantics but is **not independently confirmed by a dynamic trace** — flagged
  with the same honesty caveat this project already uses for `GEN2_EXT_41`'s `uncertain` opcode.
- `tools/gen1_ecl_encounter_scan.py`: `GEN1_SHORT_WORD_SETS` gains `0x22: 0` too, so the Python
  static-analysis tooling and the TS engine agree (the tool's own reachable-0x22 audit would
  otherwise desync on any block containing opcode 0x22 before reaching further instructions,
  silently hiding downstream `NEWECL` targets in any future scan).
- `packages/engine/test/ecl.test.ts`: updated the one test with a hardcoded literal
  `ECL_GEN1_SHORT.wordSetOverrides` object to include the new entry.

**Verified no regressions**: full `packages/engine` suite, 150 files / 1762 tests, 0 failures
(1 pre-existing test updated to match the new dialect table, not a behavioral regression — every
other test, including both town-leg goldens and the block-33 investigation tripwire, passed
unchanged). `pnpm -r exec tsc --noEmit` clean.

**Ending leg: decode desync is fixed and the VM chain is confirmed, but the leg is still not fully
provable — a separate, genuine reachability gap.** Proving the leg to the same rigor as the town
leg (or the early leg's real GEO-cell walk) needs a legitimate path from *some* real entry point to
block 98's "GO DOWN THE STAIRS?" cell. Two negative results, both static-only (no DOSBox-X per this
round's constraint):
1. **Wall-graph walk**: `tools/find_geo_path.py --geo "GEO3.DAX" --block 98` finds the trigger cell
   (8,14) and the `chooseStart` heuristic's default spawn (8,0) sit in *different connected
   components* of the block's own wall graph (a 159-cell main body containing (8,14) vs. a
   15-cell isolated pocket containing (8,0)) — no legal wall-respecting walk connects them.
2. **Scripted-entry search**: a CFG-following corpus-wide search (the same `successors()` walker,
   corrected `GEN1_SHORT_WORD_SETS`) across every reachable `NEWECL` (opcode 0x20) instruction in
   all of DoK's `ECL1.DAX`/`ECL2.DAX`/`ECL3.DAX` found **zero** hits targeting block 98 — nothing in
   the game's own ECL corpus scripts a chain *into* block 98 from elsewhere.

Together these rule out both obvious static-only reachability proofs (in-block walking, and
scripted ECL chaining). The remaining possibility — an ordinary GEO-to-GEO map-edge crossing from
a *neighbouring* GEO block's own map into GEO3#98 at a specific arrival cell, the mechanism
`Explorer.edgeExits`/`markMapEdgeExits` already generalizes for CoK's town exits — was not
investigated this round (would need each neighbouring block's own edge/descriptor layout mapped
and cross-referenced, a distinct and nontrivial static task, or a live DOSBox-X walk-through to
observe the real arrival cell directly). **Per this project's "UNLOCATED beats invention"
convention, the `ending` leg status stays `blocked` in `tools/goldbox_campaign_matrix.json`** — the
desync root cause is now genuinely solved (a real, generalizable dialect finding, verified and
tested) but the leg's own reachability proof is a distinct, still-open gap. `ECL3.DAX#97` itself
(the `NEWECL` target) was spot-checked standalone under `primeSearchLocation` at its own default
floor byte and halts immediately with no effects — its own `initial_entry`/correct entry backdrop
was not investigated this round and is a further open item before its content can be called
"proven" even once #98's approach path is solved.

**Net effect on the campaign matrix**: unchanged this round — DoK stays at 3/6 legs proven
(`early`, `wilderness`, `town`); `middle`/`ending`/`quest` stay `blocked`. `ending`'s citation in
`tools/goldbox_campaign_matrix.json` is updated to reflect the new, narrower blocker (reachability,
not decode desync). `campaign_matrix.satisfied = false`, `failing_legs = ["middle", "ending",
"quest"]` (unchanged from Update 12 — this round closed the desync sub-problem but did not close
the leg itself).

**Still open after this round:**
- `ECL3.DAX#98`'s trigger-cell reachability — genuinely unresolved; the two obvious static routes
  (wall walk, scripted `NEWECL`) are now both ruled out, narrowing the remaining possibility to a
  GEO-to-GEO edge crossing from a neighbouring block (unmapped) or a live DOSBox-X trace (out of
  this round's scope).
- `ECL3.DAX#97`'s own correct entry point/backdrop byte — not established; standalone run at
  floor byte `0x00` halts with zero effects (almost certainly the wrong entry condition, not
  evidence the block is inert).
- The 0x22 short-dialect compare polarity (`partyHasRanger` vs `0`) — plausible, oracle-derived by
  analogy, but not dynamically confirmed; same caveat class as `GEN2_EXT_41`.
- `middle`/`quest` legs — unchanged from Update 12, still `blocked`.

## Update 14 (2026-07-22): the middle leg's "cross-block flag [0xC00D]" was a transcription slip — ECL2#67 gate is the FACING register; middle leg PROVEN

**Verdict: DoK's campaign-matrix `middle` leg is promoted `blocked` → `proven`.** Full route
write-up (contract format): `persistent-natural-routes.md` § "DoK's Fourth Route (Middle)". This
update records the investigation itself and corrects Update 11.

### The slip

Update 11's combat-leg sweep recorded ECL2.DAX#67's static CFG witness path as gated on an
"unproven cross-block flag `[0xC00D]==1`", and Update 12 / the matrix citation carried that
verdict forward. Re-examining it this round:

1. A targeted scan of **all** DoK ECL archives (ECL1/2/3.DAX, every block, short dialect,
   CFG-reachable instructions only) for any reader OR writer of `0xC00D` returned **zero hits**
   — the "flag" address appears nowhere in DoK's own content, which is impossible for a genuine
   cross-block precondition.
2. Re-decoding the actual witness path in #67 byte-by-byte shows the gate instruction is
   `COMPARE #1, [0xC04D]` — `0xC04D`, not `0xC00D`. One hex digit, transcribed wrong once,
   blocked the leg for four days.

`[0xC04D]` is `MAP_DIRECTION_ADDR` — the host **facing register** the engine itself already seeds
in `primeSearchLocation`. Deterministic, player-controllable, no seeding required: face east.

### The retail facing encoding — and a real engine fidelity bug it exposed

First engine replays with the production `facing: 'east'` option still refused to fire combat:
`gen1MapDirectionValue` seeded the *stored* DGROUP codes (N/E/S/W = 0/2/4/6). Retail ground truth
says otherwise — `gen1-dosbox-runtime-trace.md` (the ECL-visible read is the half-direction
ordinal) and `tools/trace_dok_position_setter.ps1` (DoK's write-side remap between the two
encodings). A 5-title content census settles it independently: across every Gen1 DAX title,
every `SAVE`-immediate and `COMPARE`-immediate against `[0xC04D]` is in **0..3**, and Pool/CoAB
both execute `ON_GOTO [0xC04D], #4` — a 4-way dispatch that cannot work on 0/2/4/6. Fix:
`gen1MapDirectionValue` now returns 0=N, 1=E, 2=S, 3=W (`dungeonEvents.ts`, pinned test
updated). Latent until now because no previously proven route's gate read facing. Full engine
suite green post-fix, zero regressions.

### The proven encounter (summary — full details in persistent-natural-routes.md)

- `ECL2.DAX#67` / `GEO2.DAX#67`, `ECL_GEN1_SHORT`. 2×2 masked-3 square `(8,7)/(9,7)/(8,8)/(9,8)`
  (raw `0x03`) → `search_location` ON_GOTO arm 3 (`0x8735`).
- Arm 3: guarded `SURPRISE` on `[0x4C65]` bit 4 (revisit arming), then the facing gate. East →
  "YOU HAVE GOTTEN BEHIND THE AMBUSH." → `LOAD_MONSTER` 70×6 / 43×10 / 66×6 (PATRIARCH, CRAZED
  DWARF, BLACK MAGE) → `COMBAT 0x87E7` → victory `OR #0x10,[0x4C65]` + "THE REST RUN AWAY."
  Non-east → warning arm `0x8754`, clean exit, nothing consumed.
- Byte-grounded spawn: `initial_entry` `SAVE`s x=10/y=0/facing=south (`0x805E–0x8076`). 13 legal
  directed steps reach the square. Update 15 corrected the two masked-9 crossings: the first is a
  real consumable PATRIARCH/BLACK MAGE encounter and the second is silent after its consumed bit.
- Wall sets are numbered globally across disks (`WALLDEF1.DAX`=[1], `WALLDEF2.DAX`=[3,4],
  `WALLDEF3.DAX`=[5,6]); #67's `LOAD_PIECES` set 1 mounts disk 1's WALLDEF/tile pair.
- Wired end-to-end: `?explore=dok-natural-2` profile, engine goldens
  (`dungeonEvents.test.ts`), save matrix row (`saveGame.test.ts`), browser e2e
  (`explore-dok-natural-2-combat`) with standard consumed persistence.

### Still open after this round

- `ending`/`quest` legs — unchanged from Update 13; `failing_legs = ["ending", "quest"]`.
- Live original-DOS confirmation of the facing gate (DOSBox-X out of this round's lane).
- ECL3#99's RNG gate (Update 12) stands as documented — this route supersedes it as the middle
  candidate; it does not resolve it.

## Update 15 (2026-07-23): TWO more short-dialect operand deltas (0x23=0, 0x0C=4) proven from DoK's own GAME.OVR handlers; ending + quest legs PROVEN; DoK completes the campaign matrix

This round set out to prove the two remaining matrix legs (ending, quest) and ended up
re-proving the short dialect itself from the binary — DoK's `GAME.OVR` opcode handlers,
disassembled at the exact file offsets `build/dok-ecl-dispatch-map.json` already pins —
which corrected two long-standing operand frames, closed the famous "code-0x79 GOTO"
blocker as a decode artifact, inverted the revisit-refires reading, and then let both legs
fall out of clean re-derivation. All static + engine work; the DOSBox-X lane was never
touched.

### 15.1 The two new operand-frame deltas (byte-proven, corpus-corroborated)

- **`SURPRISE` (0x23) takes ZERO operands and is script-TERMINAL** under `ECL_GEN1_SHORT`.
  DoK's handler at `GAME.OVR` file offset `0x3076` fetches no ECL operands: it pushes the
  four compiled-in constants `1,0x11,0x26,0x16` (the classic message-window rectangle) to
  the RedrawView-analog far stub (`0x41:0x8e`) and then **TAIL-CALLS the opcode-0x00
  `CMD_Exit` handler**. No surprise roll, no `[0x02CB]` write — "redraw window, then EXIT".
  Corpus audit (reachable-site clean-decode counts under the long 4-operand frame):
  Pool 22/22 clean (long dialect, control) vs DoK 0/205, Treasures 6/209, PoD 9/369.
- **`SETUP_MONSTER` (0x0C) takes FOUR operands** under `ECL_GEN1_SHORT`. DoK's handler at
  `0xBAC` is `vm_LoadCmdSets(4)`: params 1-3 land in the same sprite/maxDistance/pic globals
  as CoAB's 3-operand form; param 4 lands in an extra global (`[0xC4CC]`, consumer not yet
  located). Corpus: DoK 157/157 clean under 4-op, Treasures 229/230, PoD 390/400, vs the
  long camp (Pool 18/187, CoAB 18/197, Secret 37/235, CoK 16/205 — all long-3-op).
- **Gateway is a genuine dialect SPLIT, not a member of the 4-op camp**: 237/238 reachable
  Gateway 0x0C sites are only clean under the LONG 3-operand frame, and Gateway has zero
  reachable 0x23 sites. New `ECL_GEN1_SHORT_GATEWAY` dialect (keeps long 0x0C, no 0x23
  override) wired end-to-end: `disassemble.ts`, `index.ts`, `explore.ts`/`gameData.ts`/
  `gen1Disks.ts`/`gen1Profiles.ts` (`eclDialect: 'gen1-short-gateway'`), and
  `tools/gen1_ecl_encounter_scan.py` (`GEN1_SHORT_GATEWAY_WORD_SETS`; its `successors()`
  also now treats a 0-operand 0x23 as terminal).

### 15.2 Short PARTY_SURPRISE (0x22) semantics: a YES/NO prompt — partyHasRanger guess REFUTED

Update 13 flagged the 0-operand 0x22's runtime semantics as "not dynamically confirmed".
Now proven from the handler at `0x23BB`: it zeroes the six engine condition-flag bytes
(`[0xC606..0xC60B]` — proven to be exactly the `IF_EQ/IF_NE/IF_LT/IF_GT` flag bytes by the
IF dispatcher at `0x14F9`, which tests `[0xC606+n]` per IF opcode), runs a fixed MENU
prompt (`lcall 0xE9:0x43`, menu record `ds:0x2FAD`), compares the returned choice against
the first-choice key (`[0x57C0]`), and sets **ONLY the EQ flag on the first choice, ONLY
the NE flag otherwise**. I.e. a retail YES/NO prompt whose answer lands in the compare
flags — exactly how retail scripts use it ("GO DOWN THE STAIRS?", "OKAY?", "WANT ONE?",
each immediately followed by `IF_EQ`/`IF_NE`). `vm.ts` now pauses (`pending: yesNo`, menu
effect `style: 'yesno'`, items `['YES','NO']`; `resume(0)`=YES sets EQ).

**Both semantics carry to Gen2, proven from DQK.EXE's own dispatch handlers** (addresses
from `decompile-dqk-ecl-dispatch.md`'s table): the 0x22 handler at file `0x0330E4` memsets
the 4 condition-flag bytes at `ds:0xB2F5`, runs a prompt returning AL, sets only
`[0xB2F5]` (EQ) or `[0xB2F6]` (NE) — structurally identical to DoK's; the 0x23 handler at
`0x033122` pushes the identical `1,0x11,0x26,0x16` window rect and near-CALLS the EXIT
handler (`0x031ECE`). Three stale DQK goldens in `dqkEvents.test.ts` were re-derived under
the proven semantics (area 23's descriptor-18 arm is really a "DO YOU TRY TO MOVE THE
LEVER?" teleporter prompt; descriptor 90's arm really ends at the terminal SURPRISE flash
with its trailing LOAD_MONSTER as dead code — the old `[{14,3,90}]` roster pin was the
fall-through artifact; Reorx's temple gate asks "ARE YOU IN NEED OF HELP?" before its
empty-roster COMBAT).

### 15.3 The "code-0x79 GOTO" blocker is CLOSED — it was never an opcode

`ECL1.DAX#33`'s bytes `01 79 7F` at `0x9B28` — the multi-round DOSBox-X hunt's "invalid
GOTO operand 0x79" — are **`SETUP_MONSTER`'s 4th operand** (`[0x7F79]`) under the proven
4-operand frame, not an instruction at all. The arm now decodes cleanly to a real COMBAT
whose roster comes from the block's own count tables at `0x9D14..0x9D50` (row index 8 via
`[0x4C58]`): 45x4 + 67x1 + 70x3. The block-33 engine golden pins this
(`dungeonEvents.test.ts`, describe renamed "…ex-'code-0x79' blocker CLOSED").

### 15.4 Revisit semantics INVERTED for blocks 34 and 67 (and the middle-route intermediates corrected)

With 0x23 terminal, `AND #bit,[word] ; IF_NE ; SURPRISE` is the **standard Gen1
consumed-bit suppressor** — a revisit exits silently. The prior "persisted bit ARMS the
SURPRISE and the ambush refires" reading (early + middle legs) was an artifact of the
4-operand SURPRISE frame. Corrected in the block-34/67 goldens, in
`verifyNaturalPersistence` (the `revisitRefires` inverse branch is deleted — both users
flipped to the standard consumed check), and in both e2e routes' labels/comments.

Also corrected: the middle route's two masked-9 intermediate cells `(11,5)/(9,6)` are NOT
silent no-ops (same frame artifact — the arm-9 stream desynced right after
`SETUP_MONSTER #70,#1,#255`). The first crossing is a real consumable encounter — "YOU
SURPRISE MAGES AND CLERICS PRACTICING THEIR SPELLS." -> PATRIARCH 70x4 + BLACK MAGE 66x4 ->
victory `OR #4,[0x4C03]` — and the second crossing is then silent via the consumed bit;
`[0x4C65]` is untouched throughout (no collision with the ambush leg). The
`?explore=dok-natural-2` e2e now fights it honestly at the 8th forward and asserts the
second crossing stays silent. The committed 13-step route is KEPT: the avoid-9 alternative
crosses worse unaudited descriptors (20/1) plus a south square entry.

### 15.5 Ending leg PROVEN — ECL3#98, Dargaard Keep top floor

Update 13's "different connected component / no legal walk" verdict was computed from the
WRONG spawn `(8,0)`. Block 98's own `initial_entry` byte-grounds the real spawn:
`SAVE #8,[0xC04B]; SAVE #14,[0xC04C]; SAVE #3,[0xC04D]` = **(8,14) facing west, ON the
GEO3#98 descriptor-1 spiral-staircase cell** — in the same wall-graph component as the
whole gauntlet. Cold entry prints the Dargaard arrival text and GOTOs (`0x80FD -> 0x8246`)
straight into the stair prompt "GO DOWN THE STAIRS?" (the 0x22 yes/no): NO exits, YES
chains `NEWECL(#97)` (stair pair 98<->97). The dispatch prologue ANDs the cell byte with
63, resets the flash-door latch `[0x4C07]` on every non-4 descriptor, EXITs for
descriptors >18, then ON_GOTOs 19 arms.

Dijkstra over GEO3#98's own wall/door edges (minimize descriptor crossings, then steps)
from (8,14) to the Soth door (12,6): **60 steps, exactly 13 descriptor crossings, in
exactly the script's designed order** — d2(5,13) d4(3,14) d5(1,12) d4(2,10) d6(2,6)
d7(1,4) d4(1,3) d8(1,2) d20(6,6) d22(6,7) d9(10,11) d10(11,11) d13(12,6):

- Voice gauntlet chained by `[0x4CCF]`: d2 (requires 0 -> 1), d5 (1 -> 2), d6 (2 -> 3),
  d7 (3 -> 4): the Lady Lenore join beat (`PICTURE(79)`, `[0x4CD1]`-branched confession,
  "LENORE FALLS IN PLACE BEHIND THE PARTY.", terminal SURPRISE).
- d4 flash-door arm accepts entering facing 0/3 (west/north — all three crossings comply);
  d8 needs north; d20/d22 are the >18 silent EXITs.
- d9 statue door: HORIZONTAL_MENU `IGNORE THEM`/`TALK`/`ATTACK`; IGNORE/TALK ->
  `[0x4C02]=1` (statues stay animate), ATTACK -> IRON STATUE 30x2 fight -> `[0x4C02]=2`.
- d10 Durfey: SIR DURFEY 75x1 + SPECTRE 18x4, and with `[0x4C02]==1` the statues "LUMBER
  THROUGH THE DOORWAY!" joining as 30x2 (`[0x4C02]->3`). Victory (engine combat-result
  register `[0x7EC7]` <= 128) -> `PARLAY(#134)` -> release beat -> `SAVE #1,[0x4C03]`.
- d13 Soth: **first instruction `SAVE #1,[0x4CD0]`** (see 15.6), then `PARLAY(#133)`,
  LORD SOTH 78x1 + 26x4 + 30x5 `COMBAT`; victory -> "DO YOU STRIKE HIM WITH THE ROD OF
  OMNISCIENCE?" (0x22 yes/no; NO regenerates Soth and loops) -> whirlpool `PICTURE(115)` +
  `PARLAY(#135)` -> "DO YOU TRY TO STOP HER?" (Lenore = Kitiara reveal; both answers
  converge on the rod exploding) -> `SAVE #0,[0x4CFF]; SAVE #0,[0x4BFB]; SAVE #3,[0x7F12]`
  -> `NEWECL(#48)` epilogue chain.

Engine goldens (`dungeonEvents.test.ts` "golden DoK ECL3 block 98 Dargaard Keep top
floor"): the cold-entry stair yes/no golden (incl. GEO descriptor ground truth for the
spawn cell and all 13 crossings) and the full shared-memory gauntlet walk to the chain-48
epilogue, replaying representative descriptor-0 cells so the `[0x4C07]` latch resets are
modeled. Live browser wiring explicitly deferred (statuses.proven does not require it —
same precedent as the town leg and CoK/Secret quest legs).

### 15.6 Quest leg PROVEN — [0x4CD0], the campaign-completion flag

Corpus-wide scan (all three DoK ECL archives, CFG-reachable decode under the corrected
dialect): `[0x4CD0]` has **exactly ONE write site** — `ECL3.DAX#98` `search_location`
vaddr `0x8CAB`, `SAVE #1,[0x4CD0]`, the first instruction of the Soth-door arm — and **25
read sites across EIGHT blocks in all three archives**: ECL1#17 (camp-interrupt x7 +
vm_run_1 + search_location), ECL1#36, ECL2#48 (the epilogue), ECL2#50, ECL2#64,
ECL3#80/#81/#82. A genuine cross-archive world-state dependency, exactly mirroring CoK's
`[0x4C37]` and Secret's `[0x4C4D]` Sixth-Route precedent.

Headline reader (byte-decoded + engine-golden): `ECL2.DAX#64` — the Cerberus graveyard,
the same block whose cold funeral branch the town leg already pins — `initial_entry`
`0x807C`: `COMPARE [0x4CD0],#1 ; IF_EQ SAVE #5,[0x4C89] ; IF_EQ GOTO 0x8236` -> "THE
GRAVEYARD LIES BEFORE YOU, RESTORED TO ITS PRIOR SERENITY." and a clean exit **without**
the funeral parlay pause; flag clear -> the same cold entry pauses at the funeral PARLAY
with the haunted content (`0x81D2` shows the same serenity convergence for a mid-quest
`[0x4C89]==5` path). Golden: `dungeonEvents.test.ts` "golden DoK ECL2 block 64 quest gate".

### 15.7 Matrix + gates

- `tools/goldbox_campaign_matrix.json`: DoK `ending`+`quest` -> `proven` (same commit);
  early/middle citations corrected for the revisit-semantics inversion and the
  descriptor-9 intermediates. Computed result (`python tools/goldbox_corpus.py --strict`):
  **DoK promotes `persistent` -> `campaign`**, `satisfied: true`, `gaps: []` — the third
  campaign-tier title after CoK and Secret.
- Gates: corpus `--strict` clean (11 detected / 8 routes verified);
  `pytest tools/test_goldbox_corpus.py` 66/66 (satisfied-set pin updated to include DoK);
  `tsc --noEmit` clean for all files in this round's lane (one unrelated TS6133 in
  another agent's in-progress `eclEncode.ts` edit, out of lane); engine suite 162/163
  files, 1874/1876 tests (the 2 failures are that same in-flight `buildDqkGameMulti`
  transcode work, pre-existing in the shared tree, untouched); focused e2e 2/2
  (`explore-dok-natural-combat`, `explore-dok-natural-2-combat`).

### Still open after Update 15

- `[0xC4CC]` (short 0x0C's 4th-operand destination): consumer unlocated.
- `ECL3.DAX#97` (the stairs-down NEWECL target): content not yet proven — the ending leg
  is proven on #98's own floor; #97 is the natural next candidate for a walkable second
  floor if anyone wants a `?explore=dok-natural-3` page.
- Live original-DOS confirmation of the 0x22 menu labels (the YES-first labeling rests on
  the retail prompt texts; the flag mechanics do not).

## Update 16 (2026-07-24): retail opening → Gargath patrol → native overland → Cekos combat is live; DoK promoted to Verified

This update joins the previously independent opening, campaign-matrix, and natural-combat evidence
into one clean-input release route. No debug profile, direct area picker, pose injection, preloaded
roster, or encounter-memory seed is used by the route.

### Retail chain and byte-grounded host state

- `startDokRetailCampaign` now executes ECL1#16's complete opening: picture ids 112, 96, 113, and
  77, the celebration/Sir Karl narrative, and the exact 12-enemy attack. Victory resumes the same
  VM and reaches ECL1#36's Gargath arrival at `(0,1,east)`.
- The legal GEO route crosses the spiral stairs, reaches Commander Bertil at `(11,8)`, selects the
  real `PATROL` duty, and carries `[4C0A]=1`, `[4C2D]=1`, `[4CEC]=1`. Returning to street level and
  entering the upper-wall half four times is the retail ticker; the fourth pass meets Ayn Rampike at
  `(12,12,east)`, advances `[4C2D]` to 2, and sets `[4CEE]=1`.
- Every DoK cell dispatch seeds the recovered retail host registers `[C04B..C04F]` with X, Y,
  facing ordinal, front-wall slot, and descriptor. The selector-15 stair engine golden also pins the
  native host CALL sequence `redrawDungeonView → movePositionForward → redrawDungeonView`. Update 17
  supersedes the historical implementation boundary here. After Ayn, the visible Leave / Travel
  command invokes block 36's real `vm_run_1` with the host's tried-to-exit-map word and presents the
  exact `LEAVE THE OUTPOST?` YES/NO branch; it is not a stair-pose workaround.

### Native overland layer and joined natural encounter

- ECL1#17's fifteen embedded 38-byte GETTABLE rows key directly from `[4BC3]/[4BC4]`; retail
  BIGPIC1.DAX block 112 is exactly 304×120, or 38×15 cells at 8×8. The browser/Electron layer paints
  that image, tracks the real world coordinates, advances time, and invokes block 17's actual
  `search_location` on every step.
- The clean route starts at Gargath `(33,13)`, walks west through the live landmark/random-event
  dispatcher, declines unrelated offers, and accepts the real Cekos prompt at `(7,13)`. Its
  `NEWECL 34` lands at `(12,12,north)` with patrol and world memory intact.
- A 16-step legal Cekos path avoids descriptor 22, crosses the descriptor-7/11 arms, and enters the
  unique descriptor-12 cell `(11,1)`. The retail script queues SIVAK ×15 (six rendered by the
  longstanding tactical display cap), resumes on victory with `[4C5F]|=8`, and surfaces “A SILVER
  KEY LIES ON THE TABLE.” Quick save, two moved cells/time ticks, live load, and a south/north revisit
  restore area/pose/time/memory exactly and cannot reopen combat.

### Browser, Electron, graphics, Companion, and claim boundary

- `apps/web/test/e2e.mjs` case `dok-campaign-opening` proves the full joined browser chain.
- `apps/electron/test/e2e.mjs` case `electron-dok-verified-route` repeats it through the native
  filesystem `addFromElectronFolder` path. A disposable copy preserves the clean DOS install and
  adds the separately owned `8x8d1.daa` only for graphics-switch verification. The session proves
  DOS-EGA ↔ Amiga mode changes, mixed provenance (real Amiga frame categories plus honest DOS wall
  fallback), and live Journal, Reference DB, Automap, HUD, and Character Companion tabs without
  mutating the pose.
- `tools/goldbox_corpus_routes.json` now carries all thirteen source-backed Verified checkpoints;
  `tools/goldbox_capabilities.json` separately declares every gameplay area and the original-save
  boundary. DoK retail-save import remains partial (`.GAM/.JNK/.WIZ` character conversion; no `.EFF`
  or `SAVGAMA.PTY`), and export remains narrow engine codecs rather than a Greybox-session or
  retail-executable-accepted save-set writer.
- Strict corpus regeneration reports DoK `level: verified` with exactly two generated gaps:
  `retail-save-import-partial` and `retail-save-export-partial`. Verified therefore means the clean
  Greybox route and its executable evidence contract pass; it does not mean exhaustive campaign or
  retail binary-save parity.

## Update 17 (2026-07-31): selector-15 native host step is live

The final Gargath host-pose boundary from Update 16 is now implemented. During ECL1#36 selector 15,
the VM's retail `movePositionForward` CALL is delivered synchronously to the web host. Greybox adopts
the script-written east facing from `[C04D]`, advances the live Explorer exactly once from
`(8,7,E)` to `(9,7,E)`, and refreshes `[C04B..C04F]` before the script issues its second
`redrawDungeonView`; `[C04F]` therefore exposes the destination's raw floor byte `0x82`.

The script-local coordinates `[4C17]/[4C18]` are snapshotted at call time. When the dialogue closes,
unchanged locals are recognized as stale and cannot pull the host back to `(8,7)`, while a genuine
later ECL coordinate write remains authoritative. A new cell event clears any abandoned snapshot,
and the native move marks its destination as already dispatched. The host calls `Explorer.forward()`
directly, so the script-owned stair transition does not invent a player step, clock tick, or movement
sound.

Two complementary tests bound the claim. The real-byte `dokNewGameRoute.test.ts` golden loads
retail GEO1/ECL1 block 36, records exactly one climb CALL, proves `(8,7,E) → (9,7,E)`, verifies the
second redraw's refreshed registers and upper-story text with `[4C1B]=1`, and proves the descent
emits zero move calls. The `dok-campaign-opening` browser route enters the stair through the ordinary
movement API, observes the live pose and register transition, removes the old compensating east
step, then completes the existing Bertil/Ayn, overland, Cekos, Sivak, and save/load chain. This closes
only the native selector-15 movement gap; the original-save, Amiga-wall, wider-campaign,
audio/rules, and pixel-fidelity boundaries remain unchanged.

## 2026-09-24 correction: DoK ECL opcode `1Dh` is a continue prompt

This replaces the earlier inference that `1Dh` is a generic "wait/beat" or a DoK
`PARTYSTRENGTH` comparison. The evidence is static and source-bound:

- DoK's retail dispatch maps opcode `1Dh` to `GAME.OVR:0x237C`. Its handler increments the ECL
  instruction pointer at `DS:8C48` once, so it consumes no operand. It copies the empty Pascal
  string at `CS:1B5E` (`GAME.OVR:0x237B = 00`) to a local buffer, then calls the owned public-stub
  target `GAME.OVR:0x81D9` through `41:005C`.
- `START.EXE` is EXEPACK-compressed. After `tools/exepack_unpack.py` expands its MZ load image,
  initialization at image `0xA070` sets `DS=0x0BCE`; `DS:088A` is image `0xC56A`, a length-prefixed
  string (`22h` bytes) reading `~Press button or enter to continue`. This is the prompt passed to
  the UI helper, not an inference from an adjacent ECL literal.
- The loader's VROOMM fixup tables resolve `0x41:005C` to descriptor 8, stub 12, procedure
  `0x1631` (`GAME.OVR:0x81D9`). That routine copies both Pascal strings and calls its resolved
  input helper `0xE9:0034` (`GAME.OVR:0x37C18`) in a retry loop. It returns a key result to the
  opcode handler. The handler then calls `0xE9:0039`, resolved to descriptor 27, stub 5, procedure
  `0x145D` (`GAME.OVR:0x3815A`), which calls `4E4:0320` with bounds `0,18h,0,28h` for screen
  cleanup.
- The opcode handler does not compute party strength or write ECL compare flags. Its returned key
  byte is stored only in a local before cleanup. `GAME.OVR:0x80D5` parses the single tilde-marked
  menu item and records `P` as its highlighted key. `37B71` maps that key (case-normalized) to item
  index zero. Enter takes the current-highlight path and also yields index zero. Escape sets
  `DS:C0F8`; `37B71` then preserves raw `1Bh`, and the wrapper at `81D9:8298..82A3` permits Escape
  because this opcode's caller passed `1` at `23A3` (the wrapper sees it at `[BP+8]`). `82AC`
  normalizes Escape to item index zero on that path. An earlier conditional branch at
  `81D9:824C..8289` can invoke a context callback and overwrite the result with `FFh`, causing a
  retry. Static block-16 analysis shows its first `SAVE` at byte 22 sets or preserves
  `DS:8C4E=3`; decoded later `SAVE` destinations, PICTURE, PRINTCLEAR and their direct-call closures
  do not write that global. State 3 bypasses the callback before it reads `[ES:DI+1F7]`. This makes
  Escape acceptance strongly expected on the natural block-16 route, but several indirect backend
  and runtime callees remain unclassified, so it is not an absolute source proof. Unrecognized
  ordinary keys fail the one-item range check and retry. The separate mouse/controller branch and
  timeout globals remain unresolved; this is not a complete input-device contract.

### Helper trace continuation

Further static disassembly resolves the cursor helpers and narrows the input path without
establishing a pixel-perfect replica:

- **Source pin:** `Death Knights of Krynn/START.EXE` SHA-256
  `91b672327e7a950bcf8f044990156bbe254103c79820a4b07433aee86d3dde40`; the repository's
  `tools/exepack_unpack.py` produces the 82,336-byte load image (1,162 chunks, 631 recorded
  relocations), SHA-256 `5a43d05dee776c20db6151cf02e05f72d0631a139e792301153a88beea50a3f7`.
  `Death Knights of Krynn/GAME.OVR` SHA-256 is
  `fdbe7265ac9b04c67f8648331d9845bf33c6a1438e676389eae3f4526796c817`.
  `tools/test_dok_1d_prompt_cleanup.py` pins these inputs and the call/dispatch bytes below
  without launching an emulator.
- `GAME.OVR:0x3815A` pushes byte values `00h,18h,00h,28h` into word-sized Pascal slots and calls
  `4E4:0320`. Its far procedure at START image `0x5160` interprets these as count 40, color 0,
  row 24, column 0 at `[BP+6]`, `[BP+8]`, `[BP+0A]`, `[BP+0C]`. It checks the starting row and
  column against `0..24` and `0..39`, then calls local START routine `0x5035` with that range,
  glyph `20h` (space), and `DS:43E9`. The draw loop increments the column after each draw, so
  this call covers row 24, columns 0 through 39 inclusive; it is not a four-edge rectangle.
- `DS:43E9` participates in glyph remapping, not graphics-mode selection: `0x5035` passes it
  through START image helper `0xA07:1C56`, reduces that result modulo `40h`, and uses the result
  in the cell draw. The backend selector is `DS:8C7A`; values 0, 1, and 2 dispatch to START image
  routines `0x5BAD`, `0x5C4C`, and `0x5CAC`. All three compute the 320-pixel row base and cover
  eight scanlines for each character cell. Backend 0 writes packed pixels across `B800`/`BA00`;
  backend 1 writes VGA planar bytes at `A000` with a 40-byte stride; backend 2 writes packed bytes
  across `B800`/`BA00`/`BC00`/`BE00`. The generic fill validates only its starting row and column,
  not every later cell; this particular 40-cell call fits. Backend 1 resets graphics-controller
  defaults instead of restoring the prior register values, and the paths leave `ES` changed; a
  native model must not omit these source-visible side effects if it is expected to continue
  drawing. These writes locate the source pixels, but exact retail-mode mapping and screenshot
  pixels are not established here. `0x5160` also calls `882:0058` before its bounds checks and
  `882:0034` after the draw. The pre-draw helper is narrowed below; preserve both calls in any
  native cleanup model.
- The `E9:0034` helper at `GAME.OVR:0x37C18` polls via `6AB:0316` and dispatches the returned key
  through `6AB:01D4`. The one-item menu/key mapper proves `P`/`p` returns index zero; keyboard Enter
  selects the current highlighted item (zero). Escape is permitted by the caller flag at `[BP+8]`
  and normalized to zero if it reaches `82AC`. On the natural block-16 route, the first `SAVE` at
  byte 22 sets or preserves state 3, which bypasses the earlier `824C..8289` callback; decoded
  intervening handlers do not directly change that state. Indirect backend/runtime callees remain
  unclassified, so route-level Escape acceptance is strongly expected but not fully proved.
  Unrecognized ordinary keys retry. The routine writes UI globals including `DS:C0F7` and
  `DS:C0F8`, and calls additional input, display, and UI helpers that have not all been classified.
  The separate mouse/controller path and timeout globals (`C0FA/C0FC/C0FE`) remain untraced. The
  opcode handler retains the returned AL only in a local and then always invokes cleanup; ECL
  memory/RNG/party mutation is not demonstrated by this call path.
- **Mouse helpers `882:0020`, `882:0034`, and `882:0058`:** START initialization loads
  `DS=0BCE`; its pinned data table at `DS:838C` is `33 00 01 02`, i.e. INT 33h with reset/probe,
  show-cursor, and hide-cursor function numbers. The probe calls function 0 and sets `DS:DBAA`
  only when returned AX is `FFFFh`; it also saves the returned button count. The post-draw helper
  `882:0034` maps to image `0x8854`, and when `DBAA` is set calls function 1 to show the cursor.
  The pre-draw helper `882:0058` maps to `0x8878` and calls function 2 to hide it. Both pass
  through the IVT dispatcher at `0985:000B` / image `0x985B`. The mapping is independently
  confirmed by the [FreeDOS INT 33h reference](https://github.com/FDOS/mouse/blob/master/int33.lst),
  which names functions 0, 1, and 2 as reset/status, show, and hide. The START image and table
  pin in `tools/test_dok_1d_prompt_cleanup.py` guard the local call path; the reference confirms
  standard function names, not runtime driver behavior.

| Layer | Directly observed effect | Current native implication |
|---|---|---|
| Retail `1Dh` handler | Advances `DS:8C48` by one; saves helper AL in a stack local; calls cleanup. No direct write to ECL comparison, RNG, or party state appears in this handler. | Resume PC is byte 223; do not synthesize a comparison result. |
| `E9:0034` input/UI helper | One marked choice (`P`) maps to index 0; Enter returns the current highlight (0). Escape is permitted by caller flag 1 and normalized to 0 if it reaches `82AC`. Natural block 16 sets/preserves `DS:8C4E=3` at byte 22, bypassing the earlier context callback; decoded intervening handlers do not directly change the state, though indirect callees remain unclassified. Other ordinary keys retry. | P/p and Enter are established acknowledgements; Escape is strongly expected to acknowledge on the natural block-16 route, pending indirect-callee proof and fixture confirmation. Keep UI globals out of ECL resume state; mouse/controller and timeout behavior remain open. |
| `E9:0039` cleanup path | Fills row 24, columns 0..39 inclusive with space glyph cells and color index 0 through the backend selected by `DS:8C7A`; hides the mouse cursor with INT 33h function 2 before bounds/draw and shows it with function 1 afterward when function 0 detected a driver. `DS:43E9` participates in glyph remapping. | Clear exactly the bottom 40-cell text row after acknowledgement; preserve the conditional mouse hide/show pair and source-visible backend side effects. Exact appearance and real-driver behavior remain backend-dependent. |

The implementation contract can therefore state: preserve ECL PC at byte 223 while waiting for a
keyboard acknowledgement; accept `P`/`p` and Enter, and verify Escape against the natural block-16
context; retry on unrecognized ordinary keys; do not set comparison flags; after acknowledgement,
apply the source-backed space-fill/refresh before resuming the next `PRINTCLEAR`. Acceptance should
prove both long literals decode in source order, the prompt runs exactly once between them, and
paging does not replay earlier text or mutate comparison state, RNG, or party data. Mouse/controller
and timeout behavior must be separately resolved before claiming full input equivalence. This
contract is a design target, not implemented native behavior or runtime proof.

### Native continuation design consequence

The existing CCECL v14 menu resume is not equivalent to this prompt: `resume_kind=2` restores the
saved `MS` comparison operands, calls `set_cmp_flags`, validates a selected menu result, and writes
that value to `MN_DEST_OFF`. A DoK `1Dh` acknowledgement must leave comparison flags and ECL memory
unchanged. It therefore needs a distinct acknowledgement continuation kind (or an equally explicit
validated subkind) that resumes at byte 223 without applying menu comparison state or writing a
choice destination.

CCFLOW also makes an ordinary v14 menu terminal incompatible with the verified long-text route:
without an active sidecar it calls `restore_v14_inline_text` for tagged long records, which restores
only the 32-character inline prefix; with an active sidecar it rejects a v14 terminal if a prior or
current chunk has a long-text reference. CCHOST independently rejects a sidecar flag on v14, while
CCFP treats the sidecar as authoritative whenever the flag is present. Therefore a v14/GBMO prompt
is not a transport candidate by itself. The native design must carry both the complete GBSL v2
narration and a pending acknowledgement through an envelope/consumer path that accepts that exact
combination, or keep narration and pending acknowledgement in separate retained channels without
losing ordering or replay identity. Source admission must retain a DoK-specific `DKK.CFG` bit;
`short_opframes` also admits Pools of Darkness and cannot identify this opcode's title semantics.

Minimum discriminating verification for that transport: an unsaturated stream and a stream that
crosses the 64-record CCFLOW chunk boundary must both retain the full 212-character literal before
one acknowledgement, reject stale/missing/mismatched answers before VM mutation, preserve comparison
flags/RNG/party data, and resume at byte 223 without replaying prior text. Check both CCFP's ordered
sidecar consumption and the CCHOST consumer contract; runtime capture remains subject to the
separate-desktop requirement.

Consequently the retail block-16 stream advances from opcode byte 222 directly to the next
`PRINTCLEAR` at byte 223. The disposable native fixture still substitutes `EXIT` at byte 222; it
does not test this prompt or claim the full opening. Historical M36/M37 DoK traces decoded with
the one-operand default frame, so their post-`1D` opcode and compare conclusions are withdrawn; see
their correction banners and the matching M82 correction.

The newly opened implementation work is title-specific: model DoK `1Dh` as a prompt/wait yield,
retain CoAB's one-operand `PARTYSTRENGTH` output-to-memory behavior, and keep DQK's Gen2 comparison
path distinct. The shared native `op_partystrength` compare implementation does not faithfully
cover all three source contracts. CCECL's short-frame flag is shared by DoK and Pools of Darkness;
static GBBOOT/CCFLOW tracing confirms production DoK paths retain `ECL1.DAX` as the CCECL input and
probe sibling `DKK.CFG` before both fresh and resumed execution. A separate title-admission bit can
gate DoK behavior without waiting on broader roster identity task 32. Direct `D:ECL1.DAX` remains a
path edge case because its drive-relative form does not preserve the sibling directory in CCECL's
marker builder. Do not widen a global page-break rule from this one site.

## 2026-09-24 source implementation update — runtime still open

The design-target paragraphs above record the pre-implementation state and are superseded here.
CCECL now uses the successful `DKK.CFG` admission bit to emit a v15 status-2 acknowledgement at
post-op PC 223 for DoK `1Dh`; the other title contracts remain distinct. The 5,932-byte v15
continuation appends `GBRF` raw flags to the v14-shaped prefix and is used for both acknowledgements
and status-4 capacity replay. CCECL validates and consumes one identity-bound GBMO v2 token without
writing ECL memory, then restores the six raw flags. CCFLOW retains the full replay extent and
publishes accumulated GBSL v2 only after its final record matches the acknowledged local event.
GBBOOT routes acknowledgement presentation through CCFP and the cold continuation back through
CCFLOW. CCFP validates the v15 and sidecar pair, implements P/p, Enter, and Escape, writes the
18-byte token, and performs the row-24 cleanup with the source-matched INT 33h probe/hide/show
sequence when a mouse driver is reported. CCHOST's live and journal consumers validate the
published acknowledgement; CCEFX recognizes v15.

The cleanup-hook purpose is now established by source bytes. START loads the `DS:838C..838F`
table as INT 33h/functions 0, 1, and 2. `882:0020` probes the mouse driver and stores its button
count on the successful `AX=FFFFh` result; `882:0058` hides its cursor before the fill and
`882:0034` shows it afterward. The retail-byte test pins DS initialization, the table, probe,
both helpers, and their dispatcher calls without emulating the mouse driver. The function naming
is cross-checked against the FreeDOS INT 33h list linked above.

`tools/test_dok_1d_prompt_cleanup.py` now passes 5/5, and
`tools/test_native_fx_v15_source_contract.py` passes 5/5. The engine build and source-bound
capacity gate pass. None of these is runtime execution. The retail-byte-222 fixture still ends by
substituting `EXIT`; runtime acceptance must keep the real prompt, reach the second `PRINTCLEAR`,
test the >64-record replay and state-preservation cases, and confirm key and cleanup behavior in a
focus-isolated DOS session. No DOSBox session was launched on the active desktop.
