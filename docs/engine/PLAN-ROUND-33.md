# Round 33 plan — base commit `9c191ec` ("Correct the synthesis doc that missed two container formats, and pin the count to the union")

Written 2026-09-03 by the round-33 planner. Planning only: nothing in this document has been
implemented, and no file other than this one was touched. Base state: `9c191ec` on `greybox`,
committed, pushed, deployed and verified live; gates at that commit were **241 files / 2767**
engine tests, `test:corpus` **1432 passed + 1 skipped**, full e2e **185/185**, `pnpm e2e:intros`
green, `tsc --noEmit` clean, `pnpm build:app` at the two tolerated warnings with **23 manifests**.

Round 32's corrections table is the rule this plan is built around, and it is a harder rule than
round 31's. Round 31 said "name the alternative"; round 32 then wrote a bare ">= 60% of 1250 cells
agree" bar that its own agent cleared at 100% while a shuffled-wall null also scored 100%, and
supplied three nulls (~0/100 random-window matches; <= 15% shuffled-id agreement; 0/140 on packed
bytes) that the bytes rejected. So in this plan:

- **every numeric bar names the alternative hypothesis in the same sentence and states what that
  alternative would score.** Where I cannot say what would have agreed anyway, there is no bar.
  Bars are written as separations ("real X vs null Y") wherever possible.
- **every supplied null is a hypothesis the agent must measure**, not a constant to inherit. When
  the measured null is not what the plan says, the agent replaces the control and says so.
- **a negative through an un-inverted transform is not a negative about the data.** Every item
  that searches binary bytes states the transform between the bytes searched and the bytes that
  execute (EXEPACK unpack for `START.EXE`; RLE decompression for DAX blocks; VROOMM carve for
  `GAME.OVR`; nothing for `DQK.EXE`, which is unpacked on disk).
- **no bar rests on the first-EXIT ECL census alone.** `disassembleEclBlock` walks from header
  entry 4 to the first `EXIT` and follows nothing; every "N of M blocks reach a clean EXIT" number
  in the repo is a lower bound. R1 replaces the walker; R2 uses the VM as its oracle.

---

## What the carried-forward list looked like against the bytes

Every claim this round's brief and the round-32 handoff carried forward was re-tested against the
files before an item was built on it. Three are wrong, two are stale, and one negative was measured
through an un-inverted transform (again).

| # | Carried-forward claim (source) | Tested how | Verdict |
|---|---|---|---|
| 1 | "Amiga art -> DQK HLIB `TILE` (roadmap step 5) and the HLIB writer/repacker are the primary deliverable's critical path and largely untouched" (round-33 brief) | Read `packages/engine/src/loaders/hlibEncode.ts` (`encodeHlibTile`, `encodeHlibMaster`, `rebuildHlibMasterWithSlotReplacements`, `appendHlibMasterSets`), `amigaToHlib.ts` (`amigaArchiveToHlibMaster`, leaf + master forms, measured transparent keys), `test/hlibEncode.test.ts` (real `SPRIT.TLB` method-23/21 bodies re-encode **byte-identically**, `BACK.TLB` round-trips, master repack), `packages/engine/data/cok-amiga-art-mappings.json` (curated 2026-07-18: **1 target, `PICA.TLB`, 7 slots**), `tools/build-dqk-dir.mts --amiga` | **WRONG as a mechanics claim.** The writer exists and is byte-verified; the lift is wired into the build. What is untouched is the evidence-gated slot mapping (7 PICA slots; no SPRIT/BIGPIC/CPIC mapping because the candidates fail the evidence gate, not the mechanics) — and memory `goldbox-content-port.md` records the user's 2026-06-25 decision that the DQK.EXE-retarget deliverable is **PARKED** in favour of the new engine. Widening the mapping is taste work under a parked track. **Not taken; flagged as a user decision** (see Rejected). |
| 2 | "GEO/WALLDEF/monster/item container layouts for Buck have not been reverse-engineered or wired" (ledger Buck `map_container`) | `tools/dax_inspect.py` + `dax_decode.decompress_block` on `geo1.dax`, `walldef1.dax`; extracted C64 Side 1 with `tools/c64_disk.py --extract` to the scratchpad and compared payloads from offset 2 by hex-suffix id | **STALE in the part that matters.** `geo1.dax#16` decompresses to **1026 bytes = `GEO_BLOCK_SIZE`** (Gen1 layout), and the C64 `GEO10` PRG is **1024/1024 byte-identical from offset 2** (C64 header `00 40` = load address; DOS header `01 11`). `walldef1.dax#7` is **2340 bytes** — Treasures' walldef shape (`walldef.ts:81`) — but C64 `WALLDEF07` (2341 b) agrees on only **12/2338**, so the C64 disk is NOT a walldef oracle. C64 `ECL10/11/12` vs `ecl1.dax#16/17/18`: 325/7812, 234/5674, 120/917 — a different compile, not an oracle. Monster/item sizes unmeasured. That is R4. |
| 3 | "DQK's wilderness combat routine `0x02cb2b` is unrecovered; area 5 stays flat" (round-32 R1, ledger DQK ruleset gap) | `python tools/disasm_dqk.py --disasm 0x2cb2b/0x2c550/0x2c6d7/0x2c869` | **STALE the same way round 32's row 2 was.** It disassembles as plain Borland C in CoAB `SetupWildernessFloor` shape: fill `0x45` for `0x4e2` (CoAB fills `0x17`); pass 1 (`0x02c550`) is floor01 — `col = 0x22 - roll(5d4)`, `while ((col+2)%7)>0 col--` — but gated on `es:[bx+0x33] != 0` instead of CoAB's `d100 > threshold`; pass 2 (`0x02c6d7`) is floor02 with **different constants** (`5`, `-3` masked by `[0x5d0a]`, where CoAB has `10`, `-5`, `-2`, `+5`, `+10`); pass 3 (`0x02c869`) is floor03 with the same `50 / +10 / +30 / +20` score. Flags are read through `0x02c473` from `[0xa960]` = `[0xb20f]+0x1a2`. That is R3. |
| 4 | "The static scan found nothing outside `MIDI.DAX`" (round-32 R6, `midi-dax-format.md` §1.7) | §1.7's own text: `START.EXE` was scanned **packed**; `build/exepack/cok.bin` exists now (R5 landed after R6 ran); `build/r6-dosbox-out/ram1.bin` (1 MB) is kept | **The `START.EXE` half of that negative was measured through an un-inverted transform.** EXEPACK compresses runs, so a note stream inside the resident image is invisible to a scan of the packed file. The `GAME.OVR` and DAX halves stand (carved / decompressed). That is R6. |
| 5 | "`0x27 TREASURE`'s dynamic tail cannot be represented by a flat `wordSet` override" (`disassemble.ts` note, round-32 R4) | `decodeInstructionAt` lines 993-1001: `opcodeOverrides[op].countAt` reads `args[countAt].word` and reads that many more operands — the shape Gen2 DQK already ships for `0x27` (`wordSet 4, countAt 3`, line 768) and every dialect ships for `0x31 SHORT_MENU` | **TRUE of `wordSetOverrides`, FALSE of the dialect mechanism.** The measured Pools handler (`0x1626`: four fixed reads, then a loop count taken from the 4th operand) is exactly `{wordSet: 4, countAt: 3}`. What is genuinely unrepresentable is a site whose 4th operand is a **memory** reference (`.word` would then be an address, not a count). Separately, `vm.ts:1314` reads `operands[7]` unconditionally, so any 4-operand frame already feeds it `undefined`. That is R2. |
| 6 | "Buck/Matrix `MUSIC.DAX`: still no decoder, note-event…" (ledger Buck + Matrix audio; `midi-dax-format.md` §1.5a) | Decompressed blocks 2-9 of both files; ran `sniffGlbr` + `decodeGlbrSong` through `readDaxDataBlocks` | **WRONG.** Both files hold **8 `GLBR` song blocks** (2082/1044/862/626/720/624/720/1078 bytes, magic `GLBR 00 00 01 bc`), **byte-identical between the two titles (8/8 sha256)**, and the shipped decoder reads all 8 cleanly in each (1959 events; 4/4/4/3/4/4/4/4 channels). DoK reads 7/7 (4988 events) with the same code. **Solved but unwired**, the failure class this repo has already named. That is R5. |
| 7 | "`disassembleEclBlock` only walks each block's first `EXIT`" (HANDOFF 32) | `disassemble.ts:1025-1055` | **Confirmed and narrower than stated.** `disassembleSubroutine` starts at `dialect.headerLen` (header entry 4 only), never visits entries 0-3 (`vmRun1`, `searchLocation`, `preCampCheck`, `campInterrupted`), and follows no `GOTO`/`GOSUB`/`ON_GOTO`/`ON_GOSUB` target. `EclVm.step()` (`vm.ts:926`) returns the executed instruction, so an executed-offset trace is available as the walker's oracle. That is R1. |
| 8 | seg051 RNG and the DQK ECL opcode table need a dynamic trace the harness cannot drive (CLAUDE.md) | — | **Not planned.** |
| 9 | Buck 2 desyncs / Matrix 3 unattributed; 5 stride-5 stub segments unresolved; Amiga DQK 305 stubs | round 32 | **Not planned as slices.** R1's deep walk re-counts Buck/Matrix (a lower bound becomes a walk of reachable bytes) and may add or move sites — reported, not fixed. |

---

## Ground rules for every item (the eight hard requirements)

1. **Alternative named, score stated.** Every acceptance bar on an agreement / match / similarity /
   accept-count / clean-count names the alternative hypothesis in the same sentence AND states what
   that alternative would score. A bar the alternative would also clear is not a bar; if the agent
   finds its item's bar is like that, it says so and replaces it with a separation.
2. **Every number next to its null; every supplied null is measured.** If the measured null is
   not what this plan says, replace the control, keep the conclusion only if it survives, report both.
3. **Transform stated.** Any item searching binary bytes states the transform between the bytes it
   searched and the bytes the machine executes.
4. **No bar rests on the first-EXIT census alone.** Quote it only with the words "lower bound".
5. **Consumer named.** Nothing is shipped until something outside its own test consumes it: a
   `GAME_IDS` row, a `decodeAsset` branch, a route, a `docs.ts` entry, a ledger sentence, an e2e
   pin. A `?game=` URL is not a menu entry.
6. **Mutation-tested.** Every new assertion is broken on purpose, watched RED with the real error
   text quoted, restored, and the restoration confirmed byte-identical (`git diff --stat` on the
   file must be exactly the intended change).
7. **Game data is read-only.** Never patch an original EXE; run DOSBox-X from a scratch copy.
   External sources (`D:/`, GOG Galaxy) are referenced by path, never vendored. **R6 is the round's
   only DOSBox-X owner**, and all DOSBox-X automation goes through the focusless GameLink protocol
   (`tools/dosbox_gamelink.py`, or `-GameLink` on `tools/dosbox_x_debugbox_probe.ps1`) — never
   host-level SendKeys / SetForegroundWindow / SendInput.
8. **File ownership is disjoint.** The Phase B single-writer set is reserved for the lead:
   `packages/engine/src/index.ts`, `apps/web/src/ui/main.ts`, `apps/web/src/ui/docs.ts`,
   `apps/web/src/ui/gameview.ts`, `apps/web/src/ui/eclInspector.ts`, `apps/web/test/e2e.mjs`,
   `apps/web/games/*.json`, `tools/goldbox_capabilities.json`, `apps/web/src/ui/supportClaims.json`,
   `apps/web/src/ui/support-evidence.json`, `tools/test_goldbox_corpus.py`, `tools/goldbox_corpus.py`,
   `tools/test_web_routes_documented.py`, `tools/test_capability_ledger_coverage.py`,
   `tools/engine_export_consumers.py`, `tools/test_decoded_asset_dispatch_sites.py`, `CLAUDE.md`,
   `docs/engine/HANDOFF.md`, `docs/findings.md`. Agents write the intended patches for those files
   into their reports, verbatim. Two agents never own the same file; the ownership table at the
   end of this document is the contract, and an agent that needs a file it does not own writes
   the patch into its report instead.

Gates every agent runs before reporting: `pnpm --filter @goldbox/engine test`, `pnpm test:corpus`,
`pnpm -r exec tsc --noEmit`. Agents touching `apps/web` also run `pnpm build:app`. No agent
commits, pushes or deploys.

---

## R1 — ECL reachability census: walk every entry point and every jump, and re-ground the numbers (engine)

**Why now.** Row 7. Round 32 R4 falsified a plausible Treasures `0x37` by running the VM, and the
crash showed that the census three rounds have leaned on never sees subroutine bytes. Every
"clean EXIT" number in the repo — Buck 23/25, Matrix 30/33, Pools 4/29 (Pools-dialect control),
Treasures "0x37 unreached in all 30" — is a lower bound of unknown looseness. A walker that starts
from all five header entry points and follows jumps turns that lower bound into a reachable-byte
set, and the VM's own executed-offset trace is the oracle that decides whether the walker is right.

**Read first.** `packages/engine/src/ecl/disassemble.ts` (`EclHeader` at :872 — five far pointers:
`vmRun1`, `searchLocation`, `preCampCheck`, `campInterrupted`, `eclInitialEntry`;
`decodeInstructionAt` :943; `disassembleSubroutine` :1025; the `0x37` retraction note :324-345);
`packages/engine/src/ecl/opcodes.ts` (`0x00 EXIT`, `0x01 GOTO`, `0x02 GOSUB`, `0x13 RETURN`,
`0x16-0x1b IF_*` guard the **next** instruction, `0x20 NEWECL`, `0x25 ON_GOTO` / `0x26 ON_GOSUB`
with `countAt: 1`); `packages/engine/src/ecl/vm.ts` (`step()` :926 returns `EclStepResult` with
the executed instruction; entry offset option :436); `packages/engine/test/buckEclDialect.test.ts`
`census()` :144 (the shallow census shape, and its pinned `{desync: 2, cleanExit: 23}`);
`packages/engine/test/treasuresQuestFlag.test.ts` and `treasuresEndingRoute.test.ts` (the VM runs
that reached `0x37`); `docs/engine/research/matrix-ecl-dialect.md` §7-8 (the partition table).

**Scope.**
1. `packages/engine/src/ecl/reachability.ts`: `walkEclReachable(raw, dialect, opts)` — a worklist
   walk seeded from all five header entry points (vaddr -> offset via `dialect.vbase`), decoding
   with `decodeInstructionAt`. Rules, each with a test: an `IF_*` makes the next instruction
   conditional, so a guarded `GOTO`/`EXIT`/`RETURN`/`NEWECL` keeps its fall-through live; an
   unguarded `GOTO` ends the path and enqueues its target; `GOSUB`/`ON_GOSUB` enqueue targets and
   continue; `ON_GOTO` enqueues every target and ends the path; `EXIT`/`RETURN` end the path;
   a bad opcode records a desync site with the path (entry point + jump chain) that reached it;
   targets outside the block or inside an already-decoded instruction's body are recorded as
   `misaligned` rather than followed. Output: reachable offset set, instruction list, desync
   sites, unreached-but-nonzero byte spans, per-entry-point coverage.
2. Oracle — `executed ⊆ reachable`: on the Pools and Treasures route fixtures (reuse the harness
   those test files build; do not modify them), record every offset `EclVm.step()` executes and
   count executed offsets **outside** the deep reachable set, **against the alternative that the
   shallow first-EXIT walk already covers execution** — report the same count for the shallow
   set. Prediction: deep 0, shallow > 0 (the `0x37` blocks alone guarantee > 0).
3. Positive control — the round-32 falsification, reproduced statically: under
   `ECL_GEN1_SHORT_TREASURES` plus a **test-local** override `0x37 -> {wordSet: 2}`, the deep
   census must flag a desync in at least one of Treasures `ECL1.DAX` blocks {19, 33, 38, 40, 51},
   while the shallow census flags 0 of 30 under the identical override (that is the alternative:
   "the shallow census already sees everything", which predicts deep == shallow == 0). Under the
   shipped base value 3, report the deep desync count on the same five blocks.
4. Re-census every dialect corpus the repo pins, shallow vs deep, as a table: CoK, DoK, CoAB,
   Pool of Radiance, Pools, Gateway, Treasures, Secret, NWN, Buck, Matrix — per corpus: blocks,
   shallow desyncs, deep desyncs (new sites named with block@offset), reachable bytes shallow /
   deep / total non-zero. Do NOT edit the shallow pins in `buckEclDialect.test.ts`,
   `matrixEclDialect.test.ts` or `eclGen1DispatchRound32.test.ts` — they remain true of the shallow
   walker; pin the deep numbers in R1's own test file.
5. Write, into the report, the intended Phase B patches: the `disassemble.ts` docblock sentences
   that quote a census (R2 owns that file this round), the ledger `ecl` gap sentences for Buck /
   Matrix / Pools / Treasures, and a `docs.ts` sentence for the `?ecl=` routes.

**Owned files.** `packages/engine/src/ecl/reachability.ts` (new),
`packages/engine/test/eclReachability.test.ts` (new), `docs/engine/research/ecl-census-reachability.md` (new).

**Must NOT touch.** The Phase B set; `disassemble.ts`, `vm.ts`, `opcodes.ts` (R2); the three
existing census test files; `packages/engine/src/render/eclInspector.ts`; any route test file.

**Acceptance.**
- Scope item 2's two counts (deep, shallow) on both fixtures, with the number of executed
  offsets, **against the alternative "shallow already covers execution"** (predicts shallow 0).
- Scope item 3: deep >= 1 desync on the named five blocks under the test-local `0x37` override
  vs shallow 0 under the same override; both numbers quoted.
- The corpus table of scope item 4, every deep desync site named. Where a deep desync appears in
  a corpus whose shallow count is pinned at 0 or at a smaller number, that is the finding; it is
  reported, not smoothed.
- Null for the walker's own rules: with the IF-guard fall-through rule disabled, the
  `executed ⊆ reachable` count on the Treasures fixture must rise above 0 (report the number) —
  this is the mutation test for the rule and the evidence that the rule is load-bearing.
- Consumer named: the ledger `ecl` gap sentences and the `disassemble.ts` docblocks (Phase B), and
  the `?ecl=` docs entry.
- Mutation: break the `ON_GOTO` target enumeration; watch the positive control or the executed-
  subset test go RED; quote the RED line; restore; confirm byte-identical restoration.

**Prediction.** Deep reachable bytes are >= 2x shallow on Pools and Treasures. Deep desyncs:
Buck rises from 2 (>= 3 sites), Matrix from 3 (>= 4), Pools' own dialect from 4/29 to a larger
count — the direction is "more", not "fewer". `executed ⊆ reachable` holds at 0 for deep on both
fixtures. Under the shipped base value 3, the five Treasures blocks show 0 deep desyncs.

**Hard constraints.** Read-only data. No DOSBox-X. Do not commit.

---

## R2 — `0x27 TREASURE`'s count-driven frame for Pools and Treasures, decided by the VM, and the Treasures `0x37` dispatch entry re-read (engine)

**Why now.** Row 5. Round 32 measured `0x27` at four fixed operands plus a count-driven tail in
both Pools' (`0x1626`) and Treasures' (`0x1afd`) own handlers and withheld the edit because a flat
`wordSet` cannot carry a tail. The dialect mechanism already can (`opcodeOverrides` + `countAt`,
the shape DQK's own `0x27` ships with), so the withheld edit is a one-line dialect change whose
correctness the VM route tests decide — the same oracle that falsified `0x37`. The `0x37` question
itself is a bytes question: is `0x2577` the `0x37` dispatch target or a fall-through merge?

**Read first.** `packages/engine/src/ecl/disassemble.ts` :370-402 (the `0x27` note), :277-345
(`ECL_GEN1_SHORT_TREASURES` and the `0x37` retraction), :405-412 (`ECL_GEN1_SHORT_POOLS`), :746-776
(Gen2's `0x27: {wordSet: 4, countAt: 3}`), :993-1001 (`countAt` decode);
`packages/engine/src/ecl/vm.ts` :1314-1327 (`case 0x27` reads `operands[7]`), `treasureCoins` :612;
`docs/engine/research/pools-ecl-dispatch-map.md` and `treasures-ecl-dispatch-map.md` (the `0x27`
rows: handler-read 4, dialect 8, alternative 8, "free (DESYNC)"; and the `0x37` row);
`tools/map_gen1_ecl_dispatch.py` (how a handler is located and its prefetch counted);
`packages/engine/test/eclGen1DispatchRound32.test.ts` (the Pools 56-block census: base 8 -> desync 3,
flat 4 -> desync 1); the 19 Pools/Treasures route test files (`pools*.test.ts`, `treasures*.test.ts`,
`dungeon-treasures.test.ts`, `dungeonEvents.test.ts`) — these are the oracle.

**Scope.**
1. Transcribe both `0x27` handlers instruction-quoted: the four fixed operand reads, what each
   accumulates into (coins? experience? item ids?), which operand index the loop count is taken
   from, and what each tail item is. Decide whether the count operand's **value** or its **word**
   is the loop bound (an immediate vs a memory operand). Then, for every `0x27` site the shallow
   walker reaches in Pools' 56 blocks and Treasures' 30 (state that this is the shallow walker and
   under-walks; R1's deep walker lands in parallel and Phase B re-runs the count), classify the
   count operand: immediate / memory. This decides whether a static `countAt` frame can exist.
2. If all corpus sites carry immediate counts: add `0x27: {wordSet: 4, countAt: 3, mnemonic:
   'TREASURE'}` to `ECL_GEN1_SHORT_POOLS` and `ECL_GEN1_SHORT_TREASURES` as `opcodeOverrides`
   (not `wordSetOverrides`), each justified on its own binary. If any site carries a memory
   count: do not ship the frame; report the site and the alternatives.
3. `vm.ts` `case 0x27`: make the effect frame-aware — the Gen1 8-operand coins+item reading vs the
   4+tail reading — using what scope item 1 established, and fix the existing `operands[7]` read
   for Gen2 (which already receives a 4+tail frame). Add a golden that runs a synthetic block with
   a 2-item tail through the VM under each of the three dialects and checks the effect.
4. Corpus effect: shallow desync counts under base 8 / flat 4 / `{4, countAt 3}` for Pools and
   Treasures, plus the count of blocks whose disassembly changes and how many land on better
   instruction boundaries (fewer bad opcodes, fewer nonlocal `GOTO`s) versus worse.
5. Treasures `0x37`: quote the dispatch-table entry for opcode `0x37` (table base and stride from
   the map JSON), resolve it, and state whether `0x2577` is that entry's target or a merge the
   round-32 mapper reached by fall-through. Verdict only unless the VM tests stay green under an
   edit; the round-32 falsifier (`treasuresQuestFlag`, `treasuresEndingRoute`) is the gate.

**Owned files.** `packages/engine/src/ecl/disassemble.ts`, `packages/engine/src/ecl/vm.ts`,
`packages/engine/src/ecl/opcodes.ts` (only if a table row needs a comment), `packages/engine/test/eclGen1DispatchRound32.test.ts`,
`packages/engine/test/eclTreasureShortFrame.test.ts` (new), `docs/engine/research/pools-ecl-dispatch-map.md`,
`docs/engine/research/treasures-ecl-dispatch-map.md`, `tools/map_gen1_ecl_dispatch.py` (listing
modes only), `tools/test_map_gen1_ecl_dispatch.py`.

**Must NOT touch.** The Phase B set; `reachability.ts` (R1); `buckEclDialect.test.ts`,
`matrixEclDialect.test.ts`; any Pools/Treasures route test file (they are the oracle — if one goes
red under the edit, the edit is wrong, not the test); the Buck/Matrix/Gateway dialect literals.

**Acceptance.**
- The two handler transcriptions with the count operand's role quoted from bytes.
- The site table: N sites, immediate vs memory counts. **Against the alternative that the tail is
  never non-empty in the shipped corpus** (which predicts the flat-4 and countAt-3 censuses are
  identical): report the number of sites with a non-zero count. If that number is 0, the corpus
  cannot discriminate and the item says the frame rests on the handler read alone.
- Census triple (base 8 / flat 4 / countAt 3) per title. Bar: countAt-3 separates from flat 4 on
  at least one named block **if** any site has a non-zero tail; otherwise no census bar.
- All 19 route test files green under the edit (the VM oracle), plus the new tail golden.
- `0x37` verdict with quoted table bytes; if `0x2577` is not the `0x37` entry, name what is.
- Mutation: change `countAt` 3 -> 2 and show the tail golden RED; quote; restore.

**Prediction.** All corpus `0x27` count operands are immediates; >= 1 Pools site has a non-zero
tail, so countAt-3 takes Pools' shallow census from `{desync: 1}` (flat 4) to `{desync: 0}`;
Treasures moves in the same direction. All 19 route files stay green. `0x2577` is NOT the `0x37`
dispatch entry (it is a merge reached by fall-through), and the real entry reads 3 operands —
which is why base 3 runs the VM cleanly.

**Hard constraints.** Read-only `GAME.OVR`s (GOG Galaxy paths). No DOSBox-X. Do not commit.

---

## R3 — DQK's wilderness combat surface, transcribed from `DQK.EXE` (engine behaviour)

**Why now.** Row 3. Round 32 named area 5 as the one DQK area still fighting on the flat 13x9
field and called `0x02cb2b` unrecovered. It is readable, it is CoAB-shaped, and its three passes
differ from CoAB in ways the plan can name from the first 0x60 bytes of each — which means the
alternative hypothesis for this item is concrete before the work starts, unlike round 32's R1.

**Read first.** `docs/engine/research/dqk-overlay12-combat-setup-cluster.md` (the `0x02cb2b` /
`0x02c550` / `0x02c6d7` / `0x02c869` paragraph; "Remaining Work"); `python tools/disasm_dqk.py
--disasm 0x2cb2b --len 0x40`, `--disasm 0x2c473 --len 0x20`, `--disasm 0x2c550 --len 0x190`,
`--disasm 0x2c6d7 --len 0x190`, `--disasm 0x2c869 --len 0x200`; `packages/engine/src/combat/coabCombatMap.ts`
:400-520 (`setupWildernessFloor01/02/03`, `setGroupMapStepped`, `setGroundTile40`,
`buildGen1WildernessCombatMap`, `buildCoabWildernessCombatMap`, `CoabWildernessCombatMapInput`);
`packages/engine/src/combat/dqkCombatMap.ts` (`buildDqkDungeonCombatMap` at :298 — the sibling
shipped last round, with its file-offset-per-branch convention; `DqkDungeonCombatMapInput` :79);
`apps/web/src/ui/dqkExplore.ts` :1373-1425 (`dqkDungeonTerrainForArea`, `launchDqkCombat`, the
area-5 fall-through comment) and the `DqkArea5OverlandSession` sites (:256, :336, :381);
`packages/engine/src/combat/terrain.ts` (`DQK_BACKGROUND_TILES`, the `tileIndex 0x25` tree row).

**Scope.**
1. Transcribe, instruction-quoted in the doc, `0x02cb2b`, `0x02c473`, `0x02c550`, `0x02c6d7`,
   `0x02c869` and every helper they call (the `setGroupMapStepped` analogue; the two-row tree
   writer; the `[0x5d0a]` mask; the `lcall 0x48f,0x1968` dice call and its argument order). Every
   branch in the TS carries the `DQK.EXE` file offset it transcribes.
2. Identify what feeds the two inputs: `[0xb20f]+0x1a2` (the flags byte `0x02c473` returns) and
   `[0xb20f]+0x33` (pass 1's gate). Search the area-5 overland code and DQK's ECL host for writers
   of those offsets; if found, wire them from `DqkArea5OverlandSession`'s state; if not, expose them
   as `DqkWildernessCombatMapInput` fields with the default stated and the reason.
3. `buildDqkWildernessCombatMap(input)` in `dqkCombatMap.ts`, producing the 50x25 `backgroundIds`
   that `buildDqkNativeCombatMap` accepts, with an injected dice roller (same shape as
   `CoabDiceRoller`) and a recorded call count.
4. Wire `launchDqkCombat` so an area-5 fight builds and passes the wilderness terrain (the
   `[0xb20f]+0x22 == 0` branch); report `window.__combat.mapSize()` on an area-5 fight locally.
5. Intended Phase B patches: the `explore-dqk` e2e area-5 assertion (the case already walks area 5
   at `e2e.mjs:12407-12412`; add a fight-size probe there — inside an existing case, so no
   three-place registration), the ledger DQK ruleset gap sentence, the `combat-source-matrix` row.

**Owned files.** `packages/engine/src/combat/dqkCombatMap.ts`, `packages/engine/src/combat/terrain.ts`
(only if a tile id is missing), `packages/engine/test/dqkCombatMap.test.ts`,
`apps/web/src/ui/dqkExplore.ts`, `docs/engine/research/dqk-overlay12-combat-setup-cluster.md` (new
section), `tools/disasm_dqk.py` (only to add a `--dqk-wilderness` listing).

**Must NOT touch.** The Phase B set; `coabCombatMap.ts`; `combat.ts`; `explore.ts`.

**Acceptance.**
- The transcription, instruction-quoted, all five routines plus helpers.
- The comparison test: feed `buildDqkWildernessCombatMap` and `buildCoabWildernessCombatMap` the
  **same** recorded dice stream and a flags value that runs all three passes, and report the
  1250-cell agreement **against the alternative that DQK's routine is CoAB's `SetupWildernessFloor`
  verbatim under a tile-id relabel** — which predicts 1250/1250 after relabel and an identical dice
  call count. The plan's reading of the bytes predicts that alternative fails at (a) the pass-1
  gate (DQK consumes one d100 fewer per fight because it tests `+0x33` instead of rolling) and
  (b) pass 2's constants; the test must name the differing cells and attribute each to (a) or (b)
  or a third cause the transcription found. The null: the same comparison with the dice stream
  re-seeded between the two builders — predicted agreement = the cells neither pass touches (the
  fill), reported as a number. **The trap to design out:** a flags value that skips every pass
  makes both sides all-fill and both real and null read 1250/1250; the test must assert that at
  least two passes wrote cells, and must print the null next to the real number.
- Dice consumption per pass for DQK, next to CoAB's on the same flags.
- `window.__combat.mapSize()` on an area-5 `?dqk=1` fight reads `{w:50,h:25}` locally.
- Consumer named: `launchDqkCombat` for area 5; the Phase B e2e assertion.
- Mutation: break the fill value `0x45` -> `0x16`; watch the comparison test go RED; quote; restore.

**Prediction.** Transcription under 350 new TS lines. Agreement with CoAB after relabel is high
but strictly below 1250 on a flags value that runs pass 2 (the constants differ), and the DQK
dice count is exactly one d100 short of CoAB's when pass 1 runs. Neither `+0x1a2` nor `+0x33`
has a writer in the area-5 overland code we model, so both ship as explicit inputs with defaults.

**Hard constraints.** Read-only `DQK.EXE`. No DOSBox-X. Do not commit.

---

## R4 — Buck Rogers containers census, with the C64 disk as the block-identity oracle (research + tests)

**Why now.** Row 2. Buck's GEO is Gen1-shaped and the C64 GEO is byte-identical from offset 2 —
measured, not inferred — which makes the C64 disk an oracle for Buck's map layer the way it was
for CoK/DoK. The ledger says Buck's containers are un-reverse-engineered; the truth is that nobody
ran the Gen1 loaders over them. This is the first byte-grounded step toward a Buck exploration
route, and it is mechanical enough for a Sonnet agent with a clear null for every table.

**Read first.** Memory notes `goldbox-sibling-platform-as-oracle.md` (C64 hex suffix = DOS block id;
compare from offset 2) and `goldbox-cross-platform-compare-bytes-not-conventions.md`;
`docs/engine/research/c64-disk-format.md`; `tools/c64_disk.py` (`--extract DIR --strict`; glob
`*.d64` non-recursively, case-insensitively — Buck's are lowercase); `packages/engine/src/loaders/geo.ts`
(`GEO_BLOCK_SIZE = 1026`, `decodeGeoBlock`, `sniffGeo`), `walldef.ts` (`decodeWalldefBlock`,
the 2340-byte Treasures shape at :81), `monster.ts` (`MonsterLayoutProfile`, `layoutFor` :445 and
its NWN two-profile plausibility argument), `item.ts` (`ITEM_RECORD_SIZE 63`,
`DOK_ITEM_RECORD_SIZE 17`), `gen1AreaIndex.ts` (`listGen1GeoAreas`, `listPairedGen1Areas`);
`apps/web/games/buck-rogers-countdown-to-doomsday.json` (the 31 files); the ledger's Buck
`map_container` and `graphics` gap sentences.

**Scope.**
1. `tools/buck_container_census.py`: for every `geoN.dax`, `walldefN.dax`, `mon0cha/itm/spc.dax`,
   `item0.dax` and `eclN.dax` in the Buck DOS install: block ids, decompressed sizes, and the
   Gen1 loader each size matches. For Matrix Cubed (`matrixcubed_extracted/BuckRogers2/c/Matrix`)
   the same numbers, no oracle claim.
2. C64 oracle: extract all six Buck sides to a git-ignored `build/` directory; for every C64
   `GEOxx` / `MONxx` / `WALLDEFxx` / `ECLxx` / `ITEMFILExx` PRG, find the DOS block with id `0xxx`
   across the corresponding DOS files and report identical bytes from offset 2 over the shorter
   length. Pin a per-pair table (sha256 of each side's payload from offset 2, identity count).
3. Gen1 GEO decode of every Buck block: wall-nibble ranges, event/descriptor byte ranges, and the
   count of `listPairedGen1Areas(geo, ecl)` pairs per disk.
4. Monster layout: record size of `mon0cha.dax` members; run every `MonsterLayoutProfile` whose
   size fits and report the fraction of records with D&D-plausible AC (-10..10) and THAC0
   (0..20) under each — the same discriminator `monster.ts` uses for NWN. Item records: 63 vs 17
   byte sniff counts.
5. `packages/engine/test/buckContainers.test.ts`: pins the GEO decode (block count, per-block
   sha256 of the decoded planes) and the C64 identity table; skips when `D:/` is absent.
6. Intended Phase B patches: ledger Buck `map_container` sentence; a `gen1AreaIndex` note if Buck
   needs a profile; the manifest `notes` for `geo1.dax`/`walldef1.dax`.

**Owned files.** `tools/buck_container_census.py` (new), `tools/test_buck_container_census.py` (new),
`packages/engine/test/buckContainers.test.ts` (new), `docs/engine/research/buck-containers.md` (new),
`build/buck-c64/` (git-ignored extraction target).

**Must NOT touch.** The Phase B set; any loader under `packages/engine/src/loaders/` (if a Buck
branch is needed, write the patch into the report); `tools/c64_disk.py`; the Buck/Matrix dialect
literals or ECL tools (R2 owns `disassemble.ts`; ECL bytes are compared, not decoded, here).

**Acceptance.**
- GEO identity: N shared C64/DOS GEO ids, K byte-identical from offset 2, **against the
  alternative that the C64 GEO layout differs from DOS** (predicts K/N < 1) and next to the
  shuffled-pairing null (each C64 GEO compared to a DOS GEO of a different id; predicted 0/N
  identical — but if two maps are near-empty the shuffle can score > 0, so report the per-pair
  identity fraction distribution under the shuffle, not just "0").
- WALLDEF and ECL: the measured non-identity (the plan's numbers: 12/2338, 325/7812) reported as
  what it is — the C64 is not an oracle for those families — with the per-family fraction table.
- Monster layout plausibility fraction per candidate profile; the winner must beat the runner-up
  by more than the NWN precedent's margin **or** the item says the size alone does not decide.
- `listPairedGen1Areas` counts per Buck disk (the alternative "Buck's ECL/GEO ids are not paired
  the CoK way" predicts 0 pairs).
- Mutation: corrupt one pinned C64 sha256; watch the identity test RED; quote; restore.
- Consumer named: the ledger sentence and the doc; the test pins the decode on the `D:/` source.

**Prediction.** GEO: >= 30 shared ids across six sides, 100% identical from offset 2, shuffled
null 0. WALLDEF: 0 of the shared ids identical. Monster: `mon0cha.dax` records are the CoK
409-byte layout or the Gateway 422-byte layout, and exactly one profile clears the plausibility
test. Items: 63-byte records. Paired areas: >= 15 across the six disks.

**Hard constraints.** `D:/` sources referenced, never vendored; extraction under `build/`. No
DOSBox-X. Do not commit.

---

## R5 — Buck / Matrix `MUSIC.DAX` are eight GLBR songs each: pin them, verify them, wire them (audio, "solved but unwired")

**Why now.** Row 6. The ledger says "still no decoder" for both titles; the shipped GLBR decoder
reads all 16 song blocks cleanly, and the eight Buck songs are byte-identical to the eight Matrix
songs. This is the exact failure class `goldbox-solved-but-unwired.md` records — a decoder called
by nothing but its own tests — found by running the decoder rather than reading the ledger.

**Read first.** `docs/glbr-format.md` (§1-§4 the format and the cross-title check; §5a the OPL2
bank; §5b what is not solved; §6 where the decode is used); `docs/midi-dax-format.md` §1.5a (the
Buck/Matrix driver census: no `0x388`, no `0x220` port literal — PIT/speaker/Tandy only) and §2.6;
`packages/engine/src/audio/glbr.ts` (`sniffGlbr`, `decodeGlbrSong`, `decodeGlbrInstrumentBank`,
`renderGlbrChannel`); `packages/engine/test/glbr.test.ts` (the cross-title table at :90 and the
bank test at :189); `apps/web/src/audio/gameAudio.ts` :52 (`AudioGameId`), :104-118
(`GLBR_MUSIC_GAMES`), :121-160 (`loadGlbrMusicClip`); `packages/engine/src/game/loadGame.ts`
(what a loaded game summarises today); memory `goldbox-solved-but-unwired.md`.

**Scope.**
1. Extend the cross-title test table with Buck (`{external-game-holdings}/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/music.dax`)
   and Matrix (`matrixcubed_extracted/BuckRogers2/c/Matrix/MUSIC.DAX`, repo-relative, git-ignored,
   skip when absent): 8/8 songs decode, clean termination, plausible note range, pitch histogram —
   the same metrics §4 uses — plus the 8/8 sha256 identity between the two titles.
2. Instrument bank: run `decodeGlbrInstrumentBank` on all 16 songs and report whether the "sane
   OPL2 patch" test passes. The driver census says these two titles never write the AdLib port,
   so the bank slot may not be an OPL2 bank at all. **Do not force it**: if the test fails, render
   with the labelled placeholder voice and record the failure next to DoK's pass.
3. Null for the plausibility metrics: shuffle each song's event bytes (histogram-preserving) and
   report clean-termination / plausible-range rates on the shuffled streams next to the real 8/8.
4. Wire: `AudioGameId` gains `'buck' | 'matrix'`; `GLBR_MUSIC_GAMES` gains both rows. Then give
   the loaded-game summary a `music` census (`songs`, `events`, `channels`) computed in
   `loadGame.ts` from `sniffGlbr`/`decodeGlbrSong` for any manifest file that carries GLBR blocks,
   so the dashboard has something to show — the row itself is a `gameview.ts` patch for Phase B,
   and the `buck-rogers-view` / `matrix-cubed-view` e2e pins for it are intended patches.
5. `docs/glbr-format.md`: §4 gains the two rows and the identity finding; §6 gains the consumer.

**Owned files.** `packages/engine/test/glbr.test.ts`, `packages/engine/test/glbrBuckMatrix.test.ts`
(new, if the table is better split), `packages/engine/src/audio/glbr.ts` (only if a Buck-specific
branch is genuinely needed — predicted not), `apps/web/src/audio/gameAudio.ts`,
`packages/engine/src/game/loadGame.ts`, `packages/engine/test/loadGame*.test.ts`, `docs/glbr-format.md`.

**Must NOT touch.** The Phase B set; `docs/midi-dax-format.md` and `tools/mididax_*` (R6);
`apps/web/src/ui/audio.ts`; any manifest.

**Acceptance.**
- 8/8 + 8/8 songs decode; 8/8 sha256 identical Buck vs Matrix, **against the alternative that
  Matrix ships its own score** (predicts < 8/8 identical).
- Plausibility metrics real vs shuffled null, both titles.
- Bank verdict per title, with DoK's result beside it, and the driver-census sentence that
  explains a failure if there is one.
- `loadGame()` on both manifests reports the music census; a `loadGame` test pins it.
- Consumer named: `GLBR_MUSIC_GAMES` rows; the Phase B dashboard row + e2e pins.
- Mutation: corrupt one pinned song hash; watch RED; quote; restore.

**Prediction.** 16/16 decode; 8/8 identical; shuffled null clean-termination <= 1/8. The OPL2
bank test FAILS for both titles (no AdLib port in the driver), and the item ships the placeholder
voice with that stated — a predicted negative, scored as such.

**Hard constraints.** `D:/` referenced only. No DOSBox-X. Do not commit.

---

## R6 — CoK song location: the unpacked resident image and the kept dump first, then two differential GameLink dumps (the round's only DOSBox-X owner)

**Why now.** Row 4. Round 32's negative was honest — "the songs are not in a carved segment and
were not found" — but half of it (the `START.EXE` scan) was measured on EXEPACK-packed bytes, and
the plan's own random-window null was worthless (55/100). The kept 1 MB dump and the now-existing
unpacker make two static passes possible with no emulator at all, and the driver's own install
code (block 3's `mov [0x0012], cx`, quoted in §1.7) says what a second dump should look for.

**Read first.** `docs/midi-dax-format.md` §1.1-1.6 (event grammar; the CX/ES handshake; block 1's
slot-1 code and the "24 bytes at ES:[0x2B..0x42]" table copy), §1.7 in full (block 3's slot-1
disassembly: `mov [0x0012], cx; mov es, cx; mov ax, es:[0]`; the two driver copies at physical
`0x5af1b` / `0x5b78b`; the `[0x5abc0+0x12] == 0` read; the two code false positives at `GAME.OVR`
file offsets 67144 and 58010; the measured 55/100 and 17/36 random-window match rates); `tools/mididax_song_scan.py`
(`census`, `scan`, `grammar_score`, `READEVENT_PATTERN`); `tools/exepack_unpack.py` (`<exe> --out
<image.bin> --json <meta.json>`; the `dest_len*16` check); `docs/engine/research/dosbox-x-gamelink-automation.md`;
`tools/dosbox_gamelink.py` (`status`, `screenshot`, `dump-memory --length 0x100000`, `press`);
`tools/dosbox_x_debugbox_probe.ps1 -RunDirect -GameLink`; `tools/dosbox_ollama_agent.py` (to
classify "splash" vs "intro running" frames without host input); `build/r6-dosbox-out/ram1.bin`.

**Scope.**
1. **Transform, stated first.** Regenerate `build/exepack/cok.bin` from `Champions of Krynn/START.EXE`
   with `tools/exepack_unpack.py`, confirm `dest_len*16`, and write into the doc: bytes searched =
   the unpacked load image; bytes executed = that image with relocation words patched at load, which
   the grammar scan does not depend on (state which relocation offsets fall inside any candidate).
2. **Static scan of the unpacked image** with `mididax_song_scan.py scan`: top-5 windows with the
   shuffled-window null (mean/max over >= 1000 windows) **and** the code-false-positive control —
   the grammar scores of the two `GAME.OVR` windows §1.7 hand-disassembled as `mov byte ptr [..],0`
   / `cmp byte ptr [..],imm8` chains. A candidate must beat both, and must survive an
   instruction-boundary disqualifier the agent adds to the tool (a window that decodes as a run of
   valid x86 whose immediates alias MIDI status bytes is code; **that is the alternative
   hypothesis for any static hit and it must be named next to every candidate**).
3. **The kept dump, re-read without an emulator.** (a) The install code reads `es:[0]` and a
   per-backend table at `es:[0x22..0x2A]` (AdLib) or `es:[0x2B..0x42]` (C/MS); §1.6's 2026-07-21
   refinement reads the `es:[0]` word as self-referential. Enumerate every paragraph-aligned
   physical offset `p` in `ram1.bin` where `word[p] == p >> 4`, and report the count next to the
   chance count under a uniform-byte null (~1 in 65536 paragraphs, i.e. about 1 expected in a
   1 MB image — measure it on a byte-shuffled copy of the dump rather than asserting it). Each
   surviving candidate is then scored past offset 0x43 with the grammar and the code-control from
   step 2. (b) Read the `[0x12]` word in **both** driver copies (the one at `0x5abc0` and the
   second copy's base, `0x5b78b - 0x1b`) and at CoK's DGROUP (find it from the unpacked image's
   `mov ax, DGROUP; mov ds, ax` prologue) — report all three values, since §1.7 only read one.
4. **Dynamic, GameLink only, one session.** Boot the scratch copy (`build/r6-cok-scratch/`,
   `-RunDirect -GameLink`), take dump A at the splash (the state §1.7 reached), then let the
   intro run until a frame the Ollama classifier labels as past the splash (no host input; if a
   keypress is needed use `dosbox_gamelink.py press`), and take dump B. Diff the two driver copies'
   data areas: report every word that changed and every word that is nonzero, stable, and — read
   as a segment — points at a paragraph passing step 3(a). The alternative: "the driver keeps ES
   only in registers / the interrupt frame and stores no segment word", which predicts no such
   word; a cursor word that advances between A and B is the discriminating observation.
5. **If a buffer is located**: match its bytes against every on-disk source **after** inverting
   each transform (decompressed DAX blocks, the unpacked `START.EXE` image, carved `GAME.OVR`
   segments). The null is the measured 47% non-degenerate random-window match rate, so a match is
   only a claim when the span is >= 256 bytes, unique across all decoded sources, in a region the
   x86 disqualifier does not call code, and decodes under §1.4 to >= N events with 0 malformed —
   report N and the code-control score beside it. Then `docs/midi-dax-format.md` §1.8 with the
   location and `tools/mididax_song_extract.py`. **If not**: the negative, stating which of steps
   2-5 it rests on and what each measured, with dumps kept under `build/`.

**Owned files.** `tools/mididax_song_scan.py`, `tools/mididax_song_locate.py` (new),
`tools/mididax_song_extract.py` (new, conditional), `tools/test_mididax_song_scan.py`,
`tools/test_mididax_song_locate.py` (new), `docs/midi-dax-format.md`, `tools/dosbot/` (new script
files only), `packages/engine/src/audio/dosSong.ts` + `packages/engine/test/dosSong.test.ts`
(only if a located buffer decodes under §1.4; predicted not this round), `build/r6-*`.

**Must NOT touch.** The Phase B set; `tools/exepack_unpack.py` (use it, do not edit it);
`apps/web/src/audio/gameAudio.ts` (R5); `docs/glbr-format.md` (R5); the repo game folders; any
original executable.

**Acceptance.**
- The transform statement and the `dest_len*16` confirmation.
- Static top-5 on the unpacked image with the shuffled null AND the code-control score; every
  candidate carries the x86-alias verdict.
- Step 3(a): candidate count vs the measured shuffled-dump count; 3(b): three `[0x12]` values.
- Step 4: the diff table; the stable-segment-word verdict with the alternative named.
- Either the location with all nulls, or the negative with the step it rests on.
- Mutation: break the self-reference predicate in `mididax_song_locate.py` (`==` -> `!=`); its
  test — a synthetic image with one planted self-referential paragraph — goes RED; quote; restore.

**Prediction.** Step 3(a) yields <= 3 candidates on the real dump against ~1 on the shuffled
dump, and **none** passes the grammar past 0x43 because at splash time the song has not been
loaded (the `[0x12]` word is 0 in both copies and at DGROUP). Dump B finds a stable nonzero
segment word in the driver copy that install ran in, and the buffer it names resolves into the
**unpacked `START.EXE` resident image**, not a DAX and not `GAME.OVR`. No TS decoder ships.

**Hard constraints.** DOSBox-X automation uses the focusless GameLink protocol only
(`tools/dosbox_gamelink.py`, or `-GameLink` on `tools/dosbox_x_debugbox_probe.ps1`); never
host-level SendKeys / SetForegroundWindow / SendInput. One DOSBox-X session at a time; R6 is the
only agent allowed to start one this round; check `Get-CimInstance Win32_Process` before launch
and stop by exact PID afterward. Run from the scratch copy; never modify the repo's game folders or
any original executable. Do not commit.

---

## Rejected candidates (with reasons)

- **Amiga art -> DQK HLIB `TILE` conversion / the HLIB writer.** Row 1: the writer and the lift
  exist and are byte-verified; what remains is evidence-gated slot mapping under a track the user
  parked on 2026-06-25. Widening the mapping is a taste call under a parked deliverable.
  **User decision needed:** is the DQK.EXE-retarget track still parked? If un-parked, the next
  slice is a slot-evidence census (DQK set-id table vs Amiga block ids vs C64 block ids) for
  `SPRIT.TLB` / `CPIC.TLB`, not more writer code.
- **Buck's 2 / Matrix's 3 remaining ECL desyncs and the 5 stride-5 stub segments.** Unattributed
  after three rounds; R1's deep walk will re-count them and may show they are more numerous than
  pinned — that is the honest next step, not another attribution attempt.
- **Amiga DQK 305 `8X8DB`/`8X8DC` stubs.** No byte-decidable hypothesis proposed.
- **DoK driver backends 4-5 base ports (`glbr-format.md` §5b).** Static and small, but playback
  does not depend on it (the engine synthesises through OPL2 regardless); low value per slot.
- **`main.ts`'s `pool-amiga` `extractFrames` behavioural test.** Needs `main.ts` (Phase B) and a
  fixture only the never-vendored `D:/` source can supply; a synthetic Pool-Amiga container needs
  an encoder that does not exist. Deferred, not rejected.
- **DQK copy-protection bypass.** Still benched: compare site located at file `0x039112`; the
  deliverable shape (save-flag vs build-copy patch) is a user decision, and the DOSBox-X slot is R6's.
- **`KNOWN_UNCONSUMED` (734) reduction.** Maintenance list, not a capability.
- **seg051 RNG / DQK ECL opcode table.** Blocked on a dynamic trace; per CLAUDE.md, no loop effort.

---

## Dispatch order and ownership contract

| Slot | Item | Model | Resource it owns (exclusive) | Starts |
|---|---|---|---|---|
| 1 | R1 ECL reachability census | Sonnet | `ecl/reachability.ts`, `test/eclReachability.test.ts`, `research/ecl-census-reachability.md` | t0 |
| 2 | R2 `0x27` count frame + `0x37` entry | Sonnet | `ecl/disassemble.ts`, `ecl/vm.ts`, `ecl/opcodes.ts`, `test/eclGen1DispatchRound32.test.ts`, `test/eclTreasureShortFrame.test.ts`, `pools-`/`treasures-ecl-dispatch-map.md`, `map_gen1_ecl_dispatch.py` (+test) | t0 |
| 3 | R3 DQK wilderness surface | Sonnet | `combat/dqkCombatMap.ts`, `combat/terrain.ts`, `test/dqkCombatMap.test.ts`, `ui/dqkExplore.ts`, `dqk-overlay12-combat-setup-cluster.md`, `disasm_dqk.py` | t0 |
| 4 | R4 Buck containers census | Sonnet | `tools/buck_container_census.py` (+test), `test/buckContainers.test.ts`, `research/buck-containers.md`, `build/buck-c64/` | t0 |
| 5 | R5 Buck/Matrix GLBR music | Sonnet | `audio/glbr.ts`, `test/glbr.test.ts`, `test/glbrBuckMatrix.test.ts`, `apps/web/src/audio/gameAudio.ts`, `game/loadGame.ts`, `test/loadGame*.test.ts`, `docs/glbr-format.md` | t0 |
| 6 | R6 CoK song location | Sonnet | **DOSBox-X (sole owner)**, `mididax_song_scan.py`, `mididax_song_locate.py`, `mididax_song_extract.py`, `test_mididax_*.py`, `docs/midi-dax-format.md`, `tools/dosbot/` new files, `audio/dosSong.ts` (+test), `build/r6-*` | t0 |

All six launch in one message. Ownership is disjoint by construction: R1 creates a new module
rather than editing `disassemble.ts` (R2's); R2 owns the VM and dialect files, R1 owns nothing
they import from; R3 is the only owner of `dqkExplore.ts` and `dqkCombatMap.ts`; R4 touches no
loader; R5 and R6 split the two audio docs and the two audio tool families; `index.ts` is Phase B.
Round 32's collision (two agents writing `packages/engine/src/index.ts`) cannot recur because no
agent owns it this round — R1's export and R5's `loadGame` summary type reach `index.ts` only
through Phase B step 1.

### Phase B (lead, serialized, after all six reports are in)

1. **`index.ts`.** Export `walkEclReachable` (R1) and any new `loadGame` summary type (R5);
   re-run `tools/engine_export_consumers.py`; re-pin `KNOWN_UNCONSUMED` from the measurement (734
   + the new exports that nothing consumes yet; state the number rather than carrying 734).
2. **`disassemble.ts` docblocks.** Apply R1's intended census-caveat sentences after R2's edits are
   in (R2 owns the file in Phase A; Phase B applies R1's prose on top); engine tests re-run.
3. **e2e.** In `explore-dqk`, add the area-5 fight-size probe (R3) — inside the existing case, so
   no new registration; in `buck-rogers-view` / `matrix-cubed-view`, add the music-row pins (R5)
   after step 4 lands the row. Run the full pass (expect 185/185, no new cases) and
   `e2e-case-coverage` green.
4. **`gameview.ts` / `docs.ts`.** The dashboard music row (R5's intended patch); `docs.ts`
   sentences for `?ecl=` (R1's census caveat), `?dqk=1` (area 5 now 50x25), and the two Buck
   titles' music.
5. **Ledger + support claims.** Rewrite: Buck/Matrix `audio` (R5: "8 GLBR songs each, byte-
   identical, decoded and wired"); Buck `map_container` (R4); DQK `ruleset` area-5 sentence (R3);
   Pools/Treasures `ecl` `0x27`/`0x37` sentences (R2); every `ecl` sentence that quotes a clean-
   EXIT count gains the deep number (R1); CoK `audio` (R6's location or its stepped negative).
   `supportClaims.json` / `support-evidence.json` where an evidence path moved.
6. **`findings.md`.** One sentence under §2: GLBR is shared by six DOS titles (DoK, Gateway,
   Treasures, Pools, Buck, Matrix), not four.
7. **Memory.** No memory edit is planned; if R1 shows the deep desync counts are materially larger
   than the pinned shallow ones, add a line to `goldbox-the-null-decides-the-finding.md`.
8. Gates: engine, corpus, tsc, build, full e2e, intros. `CLAUDE.md`'s two live counts re-measured.
   HANDOFF thirty-third entry with a corrections table scoring every prediction below. Commit,
   push, deploy, verify the live bundle name.

---

## Predictions to score this round against

| # | Item | Prediction | Scored how |
|---|---|---|---|
| P1 | R1 | `executed ⊆ reachable`: deep walker 0 executed-but-unreached offsets on both the Pools and Treasures route fixtures; shallow walker > 0 on Treasures (the `0x37` blocks alone guarantee it) | R1 scope-2 counts |
| P2 | R1 | Under a test-local Treasures `0x37 -> wordSet 2`, deep census flags >= 1 desync in blocks {19,33,38,40,51}; shallow flags 0 of 30 under the same override | R1 positive control |
| P3 | R1 | Deep desync counts rise: Buck 2 -> >= 3, Matrix 3 -> >= 4; deep reachable bytes >= 2x shallow on Pools and Treasures; under base value 3 the five Treasures blocks show 0 deep desyncs | R1 corpus table |
| P4 | R2 | Every corpus `0x27` count operand is an immediate; >= 1 Pools site has a non-zero tail; countAt-3 takes Pools' shallow census `{desync: 1}` (flat 4) -> `{desync: 0}` | R2 site table + census triple |
| P5 | R2 | All 19 Pools/Treasures route test files stay green under the `0x27` edit and the VM `case 0x27` change | R2 gate run |
| P6 | R2 | `0x2577` is NOT Treasures' `0x37` dispatch entry; the real entry reads 3 operands | R2 quoted table bytes |
| P7 | R3 | DQK wilderness vs CoAB after relabel: < 1250/1250 on a flags value that runs pass 2, and DQK consumes exactly one d100 fewer than CoAB when pass 1 runs; re-seeded null = fill-only cells | R3 comparison test |
| P8 | R3 | Neither `[b20f]+0x1a2` nor `+0x33` has a writer in the modelled area-5 overland code; both ship as explicit inputs; area-5 `?dqk=1` fights report `{w:50,h:25}` locally | R3 report + local e2e |
| P9 | R4 | >= 30 shared C64/DOS GEO ids, 100% identical from offset 2, shuffled-pairing null 0; WALLDEF 0 identical | R4 identity table |
| P10 | R4 | `mon0cha.dax` records match exactly one existing `MonsterLayoutProfile` on the plausibility test; items are 63-byte; >= 15 paired GEO/ECL areas across six disks | R4 tables |
| P11 | R5 | 16/16 songs decode; Buck == Matrix 8/8 sha256; shuffled-stream clean-termination <= 1/8 | R5 tests |
| P12 | R5 | The OPL2 instrument-bank sanity test FAILS for Buck and Matrix (driver has no AdLib port); DoK passes beside it | R5 bank verdict |
| P13 | R6 | Self-reference paragraphs in `ram1.bin` <= 3 vs ~1 on the byte-shuffled dump; none passes the grammar past 0x43; `[0x12]` reads 0 in both driver copies and at DGROUP (song not yet loaded at splash) | R6 step 3 |
| P14 | R6 | Dump B yields a stable nonzero segment word in the installed driver copy whose buffer resolves into the unpacked `START.EXE` resident image — not a DAX, not `GAME.OVR`; no TS decoder ships | R6 step 4-5 |
| P15 | Phase B | Full e2e stays 185/185 (no new cases; three existing cases gain assertions); manifests 23; `KNOWN_UNCONSUMED` lands at 734 + (new unconsumed exports), stated from the measurement | Phase B gates |

---

## Dispatch — the six prompts, ready to paste

Common preamble for every prompt (paste above each one):

> You are one of six agents in round 33 of the Gold Box Greybox build in `{repo-root}`
> (branch `greybox`, base `9c191ec`). Read `CLAUDE.md`, then `docs/engine/PLAN-ROUND-33.md`
> (your item, the "Ground rules" section, and the ownership table), then your item's "Read
> first" list. Own ONLY the files your item names; do not edit any file in the Phase B
> single-writer set (ground rule 8) or any file another item owns — write the exact patch you
> want applied there into your report instead. Game data and every original executable are
> read-only; external sources on `D:/` and under GOG Galaxy are referenced by path, never
> copied into the repo. Every agreement / match / similarity / count you report names the
> alternative hypothesis it was measured against in the same sentence and states what that
> alternative would score; every number is reported next to its null, and if a null this plan
> supplied measures differently from what the plan says, replace the control, keep the
> conclusion only if it survives, and report both numbers. If you search binary bytes, state
> the transform between the bytes you searched and the bytes that execute. Never rest a claim
> on the first-EXIT ECL census alone. Every new assertion is mutation-tested: break it, watch
> it go RED with the real error text, quote that text, restore it, and confirm with
> `git diff --stat` that the file's diff is exactly your intended change. Anything you build
> names its consumer outside its own test. If your measurement disagrees with a number this
> plan states, report the disagreement with both numbers — do not silently adopt either.
> Before reporting, run `pnpm --filter @goldbox/engine test`, `pnpm test:corpus`,
> `pnpm -r exec tsc --noEmit` (and `pnpm build:app` if you touched `apps/web`). Do not
> commit. Do not push. Do not deploy. Report in under 400 words plus your tables and patches:
> what you measured, the numbers with their nulls, what you changed, the intended Phase B
> patches verbatim, and what you could not decide and why.

### Prompt R1 — ECL reachability census (Sonnet)

> Your item is R1. Build `packages/engine/src/ecl/reachability.ts` — `walkEclReachable(raw,
> dialect, opts)` — seeded from all five `EclHeader` entry points, following `GOTO`/`GOSUB`/
> `ON_GOTO`/`ON_GOSUB` immediate targets, honouring the rule that an `IF_*` (0x16-0x1b) makes the
> NEXT instruction conditional (so a guarded `GOTO`/`EXIT`/`RETURN`/`NEWECL` keeps its fall-through
> live), ending paths at `EXIT`/`RETURN`/unguarded `GOTO`, recording desync sites with the path that
> reached them and misaligned targets without following them. Use `decodeInstructionAt` from
> `disassemble.ts`; do not edit that file (R2 owns it). Oracle: on the Pools and Treasures route
> fixtures, record every offset `EclVm.step()` executes and count executed-but-unreached offsets
> for the deep walk and for the shallow first-EXIT walk — the alternative "shallow already covers
> execution" predicts 0 for shallow. Positive control: under `ECL_GEN1_SHORT_TREASURES` with a
> TEST-LOCAL `0x37 -> {wordSet: 2}` override, deep must flag a desync in >= 1 of ECL1.DAX blocks
> {19,33,38,40,51} while shallow flags 0/30 under the same override. Re-census every pinned
> dialect corpus shallow vs deep (CoK, DoK, CoAB, PoR, Pools, Gateway, Treasures, Secret, NWN,
> Buck, Matrix), naming every new desync site, and pin the deep numbers in
> `packages/engine/test/eclReachability.test.ts` — leave the shallow pins in the three existing
> census test files untouched. Mutation: disable the IF-guard fall-through rule and report how the
> executed-subset count rises; break `ON_GOTO` enumeration and watch the control go RED. Write
> `docs/engine/research/ecl-census-reachability.md` and, in the report, the intended
> `disassemble.ts` docblock sentences, ledger `ecl` gap sentences and `docs.ts` `?ecl=` sentence.
> No DOSBox-X.

### Prompt R2 — `0x27 TREASURE` count frame and the Treasures `0x37` entry (Sonnet)

> Your item is R2. First transcribe, instruction-quoted, Pools' `0x27` handler at `GAME.OVR`
> `0x1626` and Treasures' at `0x1afd`: the four fixed operand reads, what each accumulates, which
> operand feeds the loop count, and whether the count is the operand's VALUE (immediate) or could
> be a memory word. Then classify every `0x27` site the shallow walker reaches in Pools' 56 and
> Treasures' 30 blocks (say it is the shallow walker and under-walks) as immediate/memory count
> and zero/non-zero tail. If all are immediates, add `0x27: {wordSet: 4, countAt: 3, mnemonic:
> 'TREASURE'}` as an `opcodeOverrides` entry to `ECL_GEN1_SHORT_POOLS` and
> `ECL_GEN1_SHORT_TREASURES`, each justified on its own binary; if any is a memory count, do not
> ship it and report the site. Make `vm.ts` `case 0x27` frame-aware (it reads `operands[7]`
> unconditionally today, which Gen2's 4+tail frame already breaks) and add a tail golden under all
> three dialects in `packages/engine/test/eclTreasureShortFrame.test.ts`. Report the shallow
> census triple base 8 / flat 4 / countAt 3 per title; the bar is separation from flat 4 on a
> named block IF any tail is non-zero — if no tail is non-zero say the corpus cannot discriminate.
> The 19 Pools/Treasures route test files are the oracle: all must stay green, and if one goes
> red the edit is wrong, not the test. Separately, quote Treasures' dispatch-table entry for
> opcode `0x37` and decide whether `0x2577` is its target or a fall-through merge; verdict only
> unless the VM tests stay green under an edit. Update both `*-ecl-dispatch-map.md` docs.
> Mutation: `countAt` 3 -> 2, tail golden RED, quote, restore. No DOSBox-X.

### Prompt R3 — DQK wilderness combat surface (Sonnet)

> Your item is R3. Transcribe, instruction-quoted in a new section of
> `docs/engine/research/dqk-overlay12-combat-setup-cluster.md`, `DQK.EXE` `0x02cb2b`, `0x02c473`,
> `0x02c550`, `0x02c6d7`, `0x02c869` and every helper they call (use `tools/disasm_dqk.py
> --disasm`). Add `buildDqkWildernessCombatMap(input)` to `packages/engine/src/combat/dqkCombatMap.ts`
> in the same file-offset-per-branch style as `buildDqkDungeonCombatMap`, with an injected dice
> roller and a recorded call count. Find the writers of `[0xb20f]+0x1a2` and `[0xb20f]+0x33`; if
> none is in the modelled area-5 code, expose them as inputs with stated defaults. Wire
> `launchDqkCombat` in `apps/web/src/ui/dqkExplore.ts` so area-5 fights pass the wilderness
> terrain, and report `window.__combat.mapSize()` locally. The comparison test feeds the SAME
> recorded dice stream to your builder and to `buildCoabWildernessCombatMap` on a flags value that
> runs all three passes, and reports 1250-cell agreement AGAINST the alternative that DQK is CoAB's
> `SetupWildernessFloor` verbatim under a tile-id relabel (predicts 1250/1250 and identical dice
> count); attribute every differing cell to the pass-1 gate, pass-2's constants, or a third cause
> you found. Null: the same comparison with the dice re-seeded between builders (predicted = the
> untouched-fill cells). The test MUST assert at least two passes wrote cells — a flags value that
> skips every pass makes real and null both 1250/1250, which is the round-32 trap. Report dice
> consumption per pass beside CoAB's. Write the intended Phase B patches: the `explore-dqk` area-5
> fight-size assertion, the ledger DQK ruleset sentence, the combat-source-matrix row. Mutation:
> fill `0x45` -> `0x16`, comparison RED, quote, restore. Do not touch `coabCombatMap.ts`,
> `combat.ts`, `explore.ts` or `e2e.mjs`. No DOSBox-X.

### Prompt R4 — Buck Rogers containers census with the C64 oracle (Sonnet)

> Your item is R4. Write `tools/buck_container_census.py` (+ `tools/test_buck_container_census.py`,
> skipping when `D:/` is absent) that, for the Buck DOS install at
> `{external-game-holdings}/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/` and for Matrix at
> `matrixcubed_extracted/BuckRogers2/c/Matrix/`, lists every `geo*/walldef*/mon0*/item0/ecl*` block
> id, decompressed size and the Gen1 loader that size matches. Extract all six Buck C64 sides
> (`{external-game-holdings}/Emulator/C64/Goldbox/Buck Rogers - Countdown to Doomsday/*.d64`, lowercase, glob
> case-insensitively, non-recursively) with `tools/c64_disk.py --extract build/buck-c64/<side>
> --strict`, and for every C64 `GEOxx/MONxx/WALLDEFxx/ECLxx/ITEMFILExx` PRG find the DOS block with
> id `0xxx` and report identical bytes from offset 2 (the 2-byte prefix is platform-specific; never
> compare it). Pin per-pair sha256s and identity counts. Report GEO identity AGAINST the
> alternative that the C64 GEO layout differs from DOS (predicts < 100%) and next to a
> shuffled-pairing null — report the per-pair distribution under the shuffle, not just "0", since
> near-empty maps can match by chance. Report WALLDEF and ECL non-identity as what it is (the plan
> measured 12/2338 and 325/7812 on one pair each). Decode every Buck GEO with `decodeGeoBlock`
> and pin plane hashes and `listPairedGen1Areas` counts per disk in
> `packages/engine/test/buckContainers.test.ts`. For `mon0cha.dax`, report record size and the
> D&D-plausibility fraction (AC -10..10, THAC0 0..20) under every `MonsterLayoutProfile` whose size
> fits — the discriminator `monster.ts` uses for NWN — and say whether one profile wins by more
> than that precedent's margin. Item record size: 63 vs 17 sniff counts. Do not edit any loader;
> write needed patches into the report with the ledger `map_container` sentence. Mutation:
> corrupt one pinned C64 sha256, identity test RED, quote, restore. Write
> `docs/engine/research/buck-containers.md`. No DOSBox-X.

### Prompt R5 — Buck / Matrix `MUSIC.DAX` are GLBR: pin, verify, wire (Sonnet)

> Your item is R5. The plan measured that Buck's and Matrix's `MUSIC.DAX` blocks 2-9 are eight
> `GLBR` songs each, byte-identical across the two titles, and that `decodeGlbrSong` reads all 16
> cleanly — re-measure that first and report if it disagrees. Extend the cross-title table in
> `packages/engine/test/glbr.test.ts` (or a new `glbrBuckMatrix.test.ts`) with Buck
> (`{external-game-holdings}/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/music.dax`) and Matrix
> (`matrixcubed_extracted/BuckRogers2/c/Matrix/MUSIC.DAX`, repo-relative, skip when absent): 8/8
> decode, clean termination, plausible range, pitch histogram, and 8/8 sha256 identity Buck vs
> Matrix AGAINST the alternative that Matrix ships its own score (predicts < 8/8). Null: a
> histogram-preserving shuffle of each song's event bytes — report clean-termination and range
> rates on the shuffled streams beside the real 8/8. Run `decodeGlbrInstrumentBank`'s sanity test
> on all 16 songs: the driver census (`midi-dax-format.md` §1.5a) says these drivers never write
> the AdLib port, so the plan PREDICTS the OPL2 bank test fails — do not force it; render with the
> labelled placeholder voice and report the verdict beside DoK's. Wire: `AudioGameId` gains
> `'buck' | 'matrix'` and `GLBR_MUSIC_GAMES` gains both rows in `apps/web/src/audio/gameAudio.ts`;
> add a `music` census (`songs`, `events`, `channels`) to the loaded-game summary in
> `packages/engine/src/game/loadGame.ts` for any manifest file carrying GLBR blocks, pinned by a
> `loadGame` test on both manifests. The dashboard row (`gameview.ts`) and the
> `buck-rogers-view` / `matrix-cubed-view` e2e pins are Phase B — write them verbatim into the
> report. Update `docs/glbr-format.md` §4 and §6. Do not touch `docs/midi-dax-format.md` or any
> `tools/mididax_*` file (R6). Mutation: corrupt one pinned song hash, RED, quote, restore.
> No DOSBox-X.

### Prompt R6 — CoK song location (Sonnet; the round's only DOSBox-X owner)

> Your item is R6. Step 1, transform: regenerate `build/exepack/cok.bin` with
> `python tools/exepack_unpack.py "Champions of Krynn/START.EXE" --out build/exepack/cok.bin --json
> build/exepack/cok.json`, confirm the image is `dest_len*16` bytes, and write into
> `docs/midi-dax-format.md` that the bytes you scan are the unpacked load image and how they differ
> from the executing bytes (relocation words only). Step 2: run `tools/mididax_song_scan.py scan`
> over that image; report the top-5 with the shuffled-window null (mean/max, >= 1000 windows) AND
> the grammar scores of the two `GAME.OVR` code false positives at file offsets 67144 and 58010 as
> a control; add an x86 instruction-boundary disqualifier to the tool and give every candidate its
> "is this x86 code aliasing MIDI status bytes" verdict — that alias is the alternative hypothesis
> for every static hit. Step 3, on the kept dump `build/r6-dosbox-out/ram1.bin` without an
> emulator: (a) in a new `tools/mididax_song_locate.py`, enumerate paragraph-aligned offsets `p`
> with `word[p] == p >> 4` (the install code's `mov ax, es:[0]` self-reference reading) and report
> the count beside the count on a byte-shuffled copy of the dump; score survivors past 0x43 with
> the grammar and the code control; (b) read the `[0x12]` word in BOTH driver copies (`0x5abc0` and
> the second copy's base) and at CoK's DGROUP found from the unpacked image's prologue — three
> values. Step 4, dynamic: boot `build/r6-cok-scratch/` with `tools/dosbox_x_debugbox_probe.ps1
> -RunDirect -GameLink`, take dump A at the splash, let the intro run until a frame
> `tools/dosbox_ollama_agent.py` classifies as past the splash (use `dosbox_gamelink.py press` if
> a key is needed; never host input), take dump B, and diff the driver copies' data areas: report
> every changed word and every stable nonzero word that, read as a segment, points at a paragraph
> passing 3(a). The alternative — "ES lives only in registers / the interrupt frame" — predicts
> no such word; an advancing cursor word is the discriminating observation. Step 5, only if a
> buffer is found: match it against decompressed DAX blocks, the unpacked `START.EXE` image and
> carved `GAME.OVR` segments; the plan's null is the measured 47% non-degenerate random-window
> match rate, so claim a location only for a >= 256-byte span, unique across decoded sources,
> not called code by your disqualifier, decoding under §1.4 to >= N events with 0 malformed —
> report N and the control score; then write §1.8 and `tools/mididax_song_extract.py`. If not
> found, write the negative stating which step it rests on and what each measured. Mutation:
> flip the self-reference predicate, its planted-paragraph test goes RED, quote, restore.
> DOSBox-X rules: focusless GameLink only (`tools/dosbox_gamelink.py` or `-GameLink` on the
> probe script); NEVER host-level SendKeys / SetForegroundWindow / SendInput; one session at a
> time — check `Get-CimInstance Win32_Process` for a running DOSBox-X before launch and stop
> yours by exact PID afterward; run from the scratch copy; never touch the repo game folders or
> any original executable. Do not edit `tools/exepack_unpack.py`, `gameAudio.ts` or
> `docs/glbr-format.md`.

---

## How this plan could be wrong

Round 32's premise for R1 (a `0x16` window-fill discriminator) did not exist. The three
assumptions here most likely to be falsified, in order of how much rests on them:

1. **R6 assumes the song buffer has a self-referential first word and that the driver stores its
   segment in a data word.** Both come from reading two blocks' slot-1 code; the "self-referential"
   reading of `mov ax, es:[0]` is §1.6's 2026-07-21 inference, not a measured property of any
   buffer, and `mov [0x0012], cx` may address the game's DGROUP rather than the driver's own
   segment. If step 3(a) finds many self-referential paragraphs (the plan predicts <= 3) or step 4
   finds no stable segment word, the location strategy collapses to the static scan alone — and
   P14 (resident image, not DAX) is the riskiest prediction in the table. The item is shaped so
   that outcome is a numbered negative with all three controls, not a shrug.
2. **R2 assumes every `0x27` count operand in the corpus is an immediate.** The Gen2 `countAt`
   frame reads `args[3].word`; if a Pools or Treasures site passes the count through a memory
   reference, the static frame is undecidable there and the shallow census could prefer flat-4
   for the wrong reason. The item is told to stop and report rather than ship if that happens.
3. **R3 assumes DQK's three wilderness passes map one-to-one onto CoAB's floor01..03 and that
   their inputs (`[b20f]+0x1a2`, `+0x33`) are the only state they read.** The first 0x60 bytes of
   each pass support the mapping; the helpers may read further state (the `[0x5d0a]` mask in
   pass 2 is already one such word) that area 5's overland session does not model, in which case
   the wired surface is only as truthful as the defaults fed to it — which the item must say in
   the ledger sentence rather than in a code comment.

Two smaller ones: R1's `executed ⊆ reachable` bar assumes the route fixtures can be driven through
`EclVm.step()` without modifying them (if not, the bar degrades to the Treasures positive control
alone and P1 is unscorable — the report must say so); and R4's oracle claim is measured for GEO on
one pair only — P9's "100% across >= 30 ids" extrapolates from 1024/1024 on `GEO10`, and the C64
port could carry its own map edits on other sides.

---

## Corrections to this plan

Scored after the round, against what was actually measured. Seven of the fifteen predictions were
wrong, and three of those seven were wrong in a way that produced a better result than the plan
asked for. A plan-supplied null is a hypothesis, not a constant.

| # | Verdict | What was measured |
|---|---|---|
| P1 | **PASS, then superseded** | `executed ⊆ reachable` held on Treasures. On **Pools it did not**: 12 offsets the VM executes were unreached by the deep walk — which turned out to be the `0x27` bug, not a walker defect, and became one of the five lines that got the frame shipped. The prediction was right about the property and wrong about which side would violate it. Under the shipped frame the count is 0. |
| P2 | **FAIL** | The control could not fire. Under a test-local Treasures `0x37 → wordSet 2` the deep census flags **0** desyncs in all 30 blocks, not `>= 1` in `{19,33,38,40,51}` — because round 32's crash was an artifact of the interfering `0x27` frame. A positive control that cannot fail is not a control; it was rebuilt on stripping the shipped `0x27` back to base (15 deep vs 0 shallow) and the falsified `0x37` was shipped instead. |
| P3 | **MIXED** | Deep counts do rise, far past the floor: Buck 2 → **195** sites, Matrix 3 → **452** (the prediction's `>= 3` / `>= 4` was not wrong so much as uncalibrated by two orders of magnitude). "Under base value 3 the five Treasures blocks show 0 deep desyncs" holds. |
| P4 | **HALF FAIL** | Immediates: 8 of 8, as predicted. Non-zero tail: 7 of 8, well past `>= 1`. But `countAt: 3` does **not** take Pools' shallow census to `{desync: 0}` — it stays at 1, identical to flat-4, because the remaining stop (`ECL1.DAX#49@0x698`) is an unrelated `0x29` problem. The plan expected the shallow census to adjudicate; it never could. |
| P5 | **FAIL, and the failure was the finding** | Four route assertions across `poolsMiddleRoute`, `poolsWildernessRoute`, `treasuresEndingRoute` and `treasuresQuestFlag` turned red. The plan read that as a stop condition. It was the defect announcing itself: those goldens were generated by the VM under test, and one of them pinned a bad-opcode halt its own comment named. Regenerated, not obeyed. |
| P6 | **FAIL** | `0x2577` **is** Treasures' `0x37` dispatch entry — a straight-line `cmp al,0x37` / `call 0x2577` pair at `0x33c1` with no shared target with either neighbour (`0x36 → 0x2506`, `0x38 → 0x2837`), and `map_gen1_ecl_dispatch.py`'s own row tags it `'linear'`, not `'fallthrough-merge'`. It reads 2 operands, not 3. |
| P7 | **PASS on the mechanism, FAIL as evidence** | The comparison ran as designed and the DQK/CoAB agreement is 527/1250 — but the **re-seeded null scores the same 527**, so the number discriminates nothing. Reported in the ledger as "read that as CoAB's routine differing in one helper branch", not as an independent reconstruction. |
| P8 | **PASS** | Neither `[b20f]+0x1a2` nor `+0x33` has a writer in the modelled code; both ship as explicit inputs; area-5 fights report `{w:50,h:25}`, pinned inside the existing `explore-dqk` e2e case and the flat-13x9 disclosure paragraph retired in the same commit. |
| P9 | **FAIL on both numbers, PASS on the conclusion** | There are only **17** GEO ids in total across all six Buck disks, not `>= 30`, and **15 of 17** are identical (88.2%), not 100%. The shuffled-pairing null is not 0 either: 200 derangements gave min/mean/max 0 / 0.63 / 4 (up to 23.5%). The real 88.2% clears the null's maximum by ~3.7×, so the alternative is still rejected — but every specific number in the prediction was wrong. WALLDEF 0-identical: correct. |
| P10 | **FAIL** | `mon0cha.dax` records are **263 bytes** (Matrix: 259) and match **none** of the six existing `MonsterLayoutProfile` sizes, contradicting the predicted CoK-409 or Gateway/CoAB-422. Items are **not** 63-byte: `item0.dax` is 1456 bytes, which divides evenly by neither supported size. Paired areas: **16**, clearing `>= 15`. No profile was invented to close the gap. |
| P11 | **REVISED** | 8 songs per title, not 16 — the two titles' `MUSIC.DAX` files are byte-identical (8/8 sha256, as predicted), so "16 songs" double-counted one file. The census is 8 songs / 1959 events / 31 channels, and both titles reporting the same three numbers is file identity, not two confirmations. |
| P12 | **PASS, and its own null matters** | The OPL2 bank sanity check fails for Buck and Matrix and passes for DoK beside it. The reason is measured rather than inferred: no `mov dx,0x388` (AdLib) or `mov dx,0x220` (C/MS) immediate exists anywhere in the shared 11,358-byte driver blob. |
| P13 | **MIXED** | Self-reference paragraphs: 1 in each of 3 dumps, 0 in the fourth, against a byte-shuffled null of **0** (not ~1) — so the predicted null was itself wrong. None passes the grammar past `+0x43`: correct. `[0x12]` reads **nonzero** in copy 2 (0x5f39, later 0x6173), not 0 — which is what resolved the handshake question. DGROUP was never obtained; reported as a partial miss on that sub-item. |
| P14 | **FAIL** | The buffer does resolve, but into `SOUND.DAX` block 1 — the SFX bank — not the unpacked `START.EXE` resident image. Both captures caught an SFX install through the same generic slot-1 mechanism. The MIDI.DAX music-timeline buffer stays unfound, now as a measured negative. No TS decoder ships, as predicted. Also corrected: the plan's own driver-copy base formula (`stub - 0x1b`) matches block 3's on-disk bytes at 52/2151 = 2.4%, chance level; the corrected formula matches 97.4%. |
| P15 | **MOSTLY PASS** | e2e stays at 185 cases with no new registrations; three existing cases gained assertions. Manifests: 23. `KNOWN_UNCONSUMED` landed at **739**, not "734 + new" — two entries were *removed* (`COAB_CITY_INFO`, `DQK_BACKGROUND_TILES`, both now consumed) alongside seven added, so the arithmetic in the prediction was the wrong shape. `walkEclReachable` and `EclReachabilityResult` were **wired** rather than pinned. |
