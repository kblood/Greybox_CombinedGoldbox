# Round 7 native task list (2026-10-07)

Read-only task finding against `greybox` HEAD `68c37e10`, with `native/src` clean. Every number
below was re-derived on 2026-10-07 from the tree, not copied from the docs. Line numbers are as of
`68c37e10` and will drift, so the symbol names are the stable reference.

## State this list starts from (measured)

- **Capacity.** From `native/build/native-capacity.json`, source hash `db2ffe87…`:

  | Tool | Emitted | Resident | Free | Floor |
  |---|---|---|---|---|
  | GBBOOT | 64,894 | 65,150 | **130** | 128 |
  | CCCOMBAT | 64,828 | 65,084 | **196** | 128 |
  | CCECL | 23,543 | 65,098 | **182** | 64 |
  | CCFP | – | – | 6,402 | – |
  | CCFLOW | – | – | 8,725 | – |
  | CCHOST | – | – | 19,930 | – |
  | CCPARTY | – | – | 40,989 | – |

  So GBBOOT has 2 usable bytes, CCCOMBAT 68 and CCECL 118.
- **Sweeps.**
  - `native/flow-status.json`: 37 PASS / 0 FAIL / 0 SKIP of 37, at `repo_head 480f437b`.
  - `native/scripts-status.json`: 38 / 0 / 38.
  - Both were taken on the newest `native/src` commit (`480f437b`), so they are fresh.
- **Gates.** `python -m pytest tools/test_native_gate_coverage.py tools/test_native_flow_status.py tools/test_native_capacity_claims.py tools/test_native_test_ownership.py` gives 83 passed (run 2026-10-07).
- **Outside both sweeps.** `native/gbboot-test.ps1` is in neither roster. `native/test.ps1` invokes it directly. Its `-EngineSmoke` carries the DQK `/A 7` and `/A 26` pins and the DoK case that hangs.

## Shared-file rules for parallel execution

- **`native/src` ownership.** Each task owns the `native/src` files it lists. No two tasks share one. **Only T1 touches `gbboot.asm`.**
- **Merge hotspots.** These files are touched by many tasks. Each task appends only its own entry; the integrator reconciles counts and capacity pins after merging:
  - `native/test-ownership.json`, plus the pinned entry count in `tools/test_native_test_ownership.py` (currently **108**);
  - the `native/test.ps1` rosters;
  - `native/README.md`;
  - the `<!-- native-capacity:… -->` pins in `GOAL.md` and `docs/engine/NATIVE-TASKS-2026-09-12.md`.
- **One test file shared on purpose.** `native/gbboot-test.ps1` is touched by T1 and T5, in different regions:
  - T1: the DQK/Matrix region (about lines 4905-4930), plus a new Matrix case;
  - T5: the DoK region (about lines 4544-4576).
- **Re-sweep after merge.** Run `native/run-flow-suite.ps1` once on the merged source. Each task's own acceptance run is not a substitute.

---

## T1 — GBBOOT: reclaim bytes, then route HLIB through CCFLOW, wire NPC joins and the Matrix start (the only GBBOOT task)

**Owner files:**
- `native/src/gbboot.asm`;
- the DQK and Matrix regions of `native/gbboot-test.ps1`;
- a new or extended DQK NPC-join flow script;
- the GBBOOT capacity pin in `docs/engine/NATIVE-TASKS-2026-09-12.md`.

It does not touch `ccflow.asm`, `cchost*.asm/.inc` or `ccecl.asm`.

Land it as four separate commits, in order. Each sub-step has its own acceptance test.

### T1a — Byte reclaim (enabler)

GBBOOT spends about 500 bytes on repeated title-membership chains.

**The waste.** `grep -c "cmp     word \[gamep\], game_"` finds 154 compares, including seven long runs:
- four identical 13-compare chains ("any party title, cok…dqk") at `run_cok_party` (≈4698), `sync_cok_roster_count` (≈4813), `apply_effect_damage_roster.local` (≈5103) and the `.eligible` gate (≈9816);
- a 13-compare chain at ≈4926 that splits gen1-like from dok/dqk;
- a 10-compare "non-Krynn Gen1" chain at ≈5700 (`.mode_non_cok`);
- one shorter run of 4 at ≈1555.

`apply_effect_damage_roster` also re-tests `game_dok` at the end of its chain, after an early `game_dok` branch has already returned. That compare is dead.

**Why it can shrink.** The `game_*` labels are consecutive strings at `gbboot.asm:11746-11760`, in this order: cok, dok, pool, curse, secret, gateway, nwn, treasures, pod, buck, matrix, dqk, gen1, frua, hlib_data. So the party set is exactly the address range `game_cok <= gamep < game_frua`.

**The change.**
- Replace each chain with a call to one range-check helper (CF or ZF result).
- Add an assemble-time ordering assertion after the label block, e.g. a negative `times` count if `game_frua <= game_gen1` or `game_dok <= game_cok`. Then reordering the strings fails the build instead of silently changing which titles a check includes.

**Estimate (not measured).**
- A chain costs about 104 bytes (6-byte `cmp word [m],imm16` plus 2-byte `jcc`, times 13).
- A call plus branch costs about 5 bytes; the helper costs about 16.
- That is roughly 380 bytes from the four identical chains and 400-500 in total. Measure it with `pwsh -NoProfile -File native/build.ps1 -Target engine`.

**RED→GREEN.**
- Add a `tools/` source-contract test that counts `cmp word [gamep], game_` runs of length ≥10 in `gbboot.asm` and requires 0. It is RED today with 6 runs.
- Re-pin the GBBOOT `native-capacity` value; `tools/test_native_capacity_claims.py` goes RED until you do.
- Mutation control: swap two `game_*` strings in a scratch copy and require the build to fail.

**Behaviour must not change.**
- The full flow and scripts sweeps stay 37/37 and 38/38.
- `gbboot-test.ps1 -EngineSmoke` gives the same verdicts as today. Exclude the DoK case that T5 owns.

**Evidence it is real:** the chain listing above, which was read from source rather than inferred.

**Risk:**
- Low on logic. The `.record_cok` / `.record_dok` split (≈4926) and the 5700 chain are not pure ranges: dqk sits between matrix and gen1. Hand-check those two, or leave them alone and still recover about 380 bytes.
- `gamep` may be 0 on some paths, so the helper must reject `< game_cok`.

### T1b — Gen2 capacity continuation: send HLIB through CCFLOW

This depends on T2.

**Why it is possible.** The research found no Gen1 gate inside CCFLOW:
- `copy_original_tail` (ccflow.asm ≈227-244) forwards the tail unchanged;
- `read_effect` / `validate_v15_capacity` / `is_script_full` already accept v15 status 4.

`native/ccflow-test.ps1` (≈133-194) already runs `CCFLOW C:\DQKECL.GLB 26` on retail DQK and measures 112 events. The only thing keeping DQK on direct CCECL is the pair of `cmp word [enginep], eng_dax_gen1` / `jne .direct_ecl` gates in GBBOOT:
- ECL launch at ≈3781;
- resume at ≈3866, via `.resume_child_ecl`.

**The change.** Delete both gates, which frees about 16 bytes. The alternative is retargeting `child_ecl`'s composition at ≈4322 from `s_ccecl` to `s_ccflow` (0 bytes), but `child_ecl` has no other user, so deletion is cleaner. Update the comment at ≈3778-3780.

**RED→GREEN in `native/gbboot-test.ps1`.**
- `/A 7` (≈4920): restore the route that was pinned before `37feee1d`:
  - initial needles `status=0003 geo=000E` and `GBLF operands=000E 0001 D001`;
  - wall 28x28;
  - `-ExpectedResumeGeo 62` with `status=0000 geo=003E` and `GBLF operands=003E 0006 D006`;
  - drop `GBSX count=0040` and `-GbsxSaturated`.

  It is RED on today's binary, which stops at status 4, GEO 26, 22x22.
- `/A 26` (≈4926): move from `status=0004`/saturated to a terminal record that agrees with the CCFLOW-measured 112-event count.
- **Must stay green:**
  - `/A 2` and `/A 3` (≈4905-4907);
  - `native/ccflow-dqk-area2-test.ps1`, `native/ccflow-test.ps1`;
  - `gbdqk-area2-menu-flow-test.ps1` and every `gbdqk-*` flow in the sweep.

**Evidence it is real.**
- The bisect in `NATIVE-TASKS-2026-09-12.md:56-63`: the route worked until `37feee1d` made SCRIPTCAP saturation a halt.
- The old pins in the `480f437b` diff.

**Risk (medium).**
1. **Not proven:** whether resuming past event 64 on the `/A 7` tail (`GBLF 001A 0001 D001`) reaches combat at GEO 14. Standalone `CCFLOW … 26` ends at status 0, not 3, but its load record (`001A 00FF 0000`) differs. Measure this first, with CCFLOW on GBBOOT's real `/A 7` tail, before restoring any pin.
2. **CCHOST `/D` on a DQK stream.** Once HLIB effects carry `FX_HAVE_SIDECAR`, GBBOOT will call `apply_sidecar_damage_roster` → `CCHOST /D`, and CCHOST's `direct_damage` forces `gamep = game_cok` (cchost.asm ≈114-115).
   - Prove with a DQK fixture that this is either correct or a no-op for DQK GBPR.
   - If it is neither, stop and hand a CCHOST change to the integrator. CCHOST is not in T1's owner list.
3. **Area 2 depends on T2.** Without T2, area 2 under CCFLOW exits 1 via `fail_loop` and GBBOOT fails gate 8.

### T1c — Apply DQK `ADD_NPC` joins in live play

**What exists.**
- CCECL sets `FX_HAVE_NPC` (0x0010; `ccecl.asm:180`, `:6325`).
- `loadpieces_gen2` (`0707533b`) now returns 255 when the NPC is absent.
- `CCHOST /N <GBEF> <MONCHA.GLB> <GBPR>` (`f0f6d06e`, `cchost_npc.inc`) applies the joins.

**What is missing.** Nothing calls it. GBBOOT never tests 0x0010, and FX_HAVE_NPC is only ever set (CCECL) or dumped (CCEFX).

**The change.** After `read_effect_header` in the ECL-return path (≈3813-3815): if `fxflags & 0010h`, build ` /N <effectreadp> <monp> <rosterpath>` and exec `child_host`. `monp`/`f_moncha_glb` and the tail helpers already exist. Estimated 40-60 bytes, which only fits after T1a.

**RED→GREEN.** Add a GBBOOT DQK flow that:
1. creates a 4-member party with `/R`;
2. enters the area-27 / member-15 Hulderfolk route (`ADD_NPC #115,#100` at `0x86F0`);
3. requires `_GBPARTY.GBP` to gain a 5th row named `TASSLEHOFF`, with body `+300` = `0xB2` and `+301` = 115;
4. revisits the event and requires no duplicate (the `0x37` guard sees the `+300` mark and returns non-255);
5. cold-reloads and requires the row to persist.

It is RED today because the roster stays at 4.

**Evidence it is real.**
- `docs/engine/research/dqk-add-npc-route.md` §§1-5;
- `dqk-add-npc-full-party.md`;
- `native/cchost-npc-test.ps1`;
- `native/ccecl-dqk-npc-route-test.ps1`.

**Risk (medium-high).**
- **Party size.** The six-hero QSV party is already at GBPR's 6-row cap, so `CCHOST /N` exits 2 and `do_exec_checked` would fail the whole boot. Retail would add the NPC, because its limit is 8.
  - Do **not** add that "skip" semantic at 6. Run the acceptance with a ≤5-member party.
  - Disclose the 6-member case as blocked on the deferred GBPR-8 item below.
  - The cheapest honest handling is to leave exit 2 fatal and document it.
- **Reachability.** Whether a plain `GBBOOT /A 27`-style tail reaches member 15 is not established. Confirm it first, as `ccecl-dqk-npc-route-test.ps1` does for CCECL.

### T1d — Matrix Cubed real start route (item 56, Phase B)

**What exists.** `docs/engine/research/matrix-cubed-start-route.md` derived the new-game route: `ECL1.DAX` block 16 → `NEWECL 19` → `GEO1` block 17, wall set 5. It is pinned by `tools/test_matrix_start_route.py` (27 tests).

**What is missing.** `maybe_broad_gen1_ecl_preview` (≈1818-1845) still sends Matrix to the shared entry-34 smoke start.

**The change.** For `game_matrix`, use the same pattern as Pool's `.entry2`: if `dax_has_block(ECL1, 16)`, set `eclid = 16` and the map per the route doc. Otherwise fall back to entry 34, so that the synthetic `matrixNestedDir` fixture (`gbboot-test.ps1:1358-1361`, `ENMATRIX` at ≈1734, `nested_matrix` at ≈4542) stays green. Estimated 25-35 bytes.

**RED→GREEN.** Add a real-data `gbboot-test.ps1` case that:
- reads `matrixcubed_extracted\BuckRogers2\c\Matrix\` (git-ignored) and **SKIP**s when it is absent;
- runs `GBBOOT /E /X` with no `/B`;
- requires a GBEF/GBLF naming GEO 17 and wall set 5.

It is RED today, which yields entry 34.

**Evidence it is real:** the route doc's mutation controls (16→15 rejects, 16→17 reorders) and its single byte-exact boot selector at `GAME.OVR+0x3D70`.

**Risk (low-medium).**
- No DOSBox run of the route exists yet.
- Blocks 18-20 still truncate in decode.
- Keep the claim to "starts on the retail chain", not "playable".

### T1 byte budget

| Step | Bytes |
|---|---|
| Start | 130 free (floor 128) |
| T1a reclaim | +≈400 (measure) |
| T1b gate deletion | +≈16 |
| T1c NPC call | −40-60 |
| T1d Matrix entry | −25-35 |
| **Target** | **≥ 400 free at the end of T1** |

- If T1a measures below +150, stop after T1b and T1d and record the shortfall rather than spending into the floor.
- Re-pin `native-capacity:gbboot` after each commit.

---

## T2 — CCFLOW: publish the saturated record when the loop guard fires (prerequisite for T1b)

**Owner files:**
- `native/src/ccflow.asm`;
- `native/ccflow-dqk-area2-test.ps1`;
- the ccflow assertions in `native/ccflow-test.ps1`;
- `docs/engine/research/ccflow-dqk-area2-loop.md`.

**What exists.** `816a6188` added `check_state_repeat`, an FNV hash ring at ≈1013-1045 with `LOOP_RING`. On a repeated CCECL state it exits 1 via `fail_loop` (≈218).

**The change.** That is correct as a guard, but a terminal exit 1 is what forces GBBOOT to keep HLIB on direct CCECL (the comment at `gbboot.asm` ≈3778-3780). Instead, on a detected repeat, publish:
- the last validated v15/status-4 record;
- a GBSL holding the events actually seen;
- an explicit marker distinguishing "loop-detected" from "capacity". The GBHD reason or a flag bit are candidates. Pick one that `read_effect_header` already passes; it accepts status 4 since `480f437b`.

Then the caller sees what direct CCECL shows today: a saturated, non-terminal view.

**Size:** CCFLOW has 8,725 bytes free.

**RED→GREEN in `native/ccflow-dqk-area2-test.ps1`.**
- It currently asserts that CCFLOW on DQK area 2 aborts. Flip it to require:
  - exit 0;
  - a v15/status-4 GBEF;
  - a validated GBSL whose first 64 records equal direct CCECL's;
  - the loop marker set.
- Keep a control proving that a genuinely terminating stream (area 26, 112 events, in `ccflow-test.ps1`) does **not** carry the loop marker.
- Keep the `/!` menu control (≈101-133) and the failure-cleanup assertions for `GBR.EFX` and sidecars.

**Evidence it is real.**
- `docs/engine/research/ccflow-dqk-area2-loop.md`;
- `NATIVE-TASKS-2026-09-12.md:25`: "DQK area 2 remained live after six saturated chunks (384 records) and 180 seconds".

**Risk (low-medium).**
- The published record must not be replayable as a completed state. CCHOST and CCEFX must reject the loop marker anywhere a terminal state is required. Add one rejection control.
- The marker must not break `ccflow-test.ps1`'s Gen1 terminal `flags=0120` pins.

---

## T3 — CCPARTY: headless DQK `/R` creation uses the retail DQK rules

**Owner files:**
- `native/src/ccparty.asm`, `native/src/dqkcreate.inc`;
- `native/ccparty-test.ps1`, `native/gbdqk-create-test.ps1`;
- `tools/test_native_gbpr_identity.py`;
- `tools/dqk_character_rules.py` (read-only oracle).

**The problem.** `c4fa122d` and `2a51d3d7` made `CCPARTY /Q /C` and `/Q /M` byte-identical to the Python DQK rules model. But GBBOOT's headless `/R` for DQK builds `/G /ID 3 /C <name> <class>` (`gbboot.asm` ≈4775-4783). Without `/Q`, CCPARTY takes the generic `create_argument` path (`ccparty.asm` ≈144-147), not `dqk_create`. So every `/R`-created DQK hero, including the four in `gbdqk-create-test.ps1:101`, is built by non-DQK rules.

**The change.** In CCPARTY only (0 GBBOOT bytes, 40,989 free): when the declared title id is 3 and `qsvmode == 0`, route `/C` through a no-QSV entry to `dqk_create` that starts from an empty or prior native roster instead of a QSV load.

**RED→GREEN.**
- Add a `ccparty-test.ps1` case: `CCPARTY /G /ID 3 /C DQK_FIGHTER F` with a fixed seed must produce a row byte-identical to `tools/dqk_character_rules.py` for the same inputs. It is RED today because the generic row differs.
- Re-derive `gbdqk-create-test.ps1`'s row checks (≈179-226) from the model, not by capturing the new output, and update the `tools/test_native_gbpr_identity.py` pin.
- **Must stay green:** the `/Q /C` and `/Q /M` byte-identity cases and `gbdqk-create-test.ps1`'s area-5 tactical relaunch.

**Evidence it is real:** the GBBOOT tail is visible at `gbboot.asm:4775-4783`, and the dispatch at `ccparty.asm:110-147` only reaches `dqk_create` under `qsvmode`.

**Risk (low-medium).**
- Class-letter mapping (C/F/M/T → DQK class ids) and the RNG seed source for headless creation must match the model. If the model needs inputs that `/R` cannot supply, stop and record exactly which.
- Changed rows alter GBCR goldens in `gbdqk-create-test.ps1`'s combat leg. Re-derive them arithmetically, as Task 215 did.

---

## T4 — CCCOMBAT: recruited DQK NPCs are computer-controlled (retail control byte)

**Owner files:**
- `native/src/cccombat.asm`, `native/cccombat-test.ps1`;
- `tools/dqk_npc_turn.py`, `tools/test_dqk_npc_turn.py`;
- `docs/engine/research/dqk-npc-combat-route.md`.

**What retail does** (located statically in `dafc5157`):
- `0x29B32` sets roster `+0x18C` = `+0x9B & 0x80` for side `+0x66 == 0`;
- `0x22B8B` sends any actor with `+0x18C != 0` to the AI turn (overlay 2, file `0x2DE10`) instead of the human menu (`0x22CCF`).

So an `ADD_NPC` recruit (`+0x9B = (morale/2)|0x80`) fights under AI control.

**What native does.** CCCOMBAT treats joined GBPR rows as ordinary player combatants. It never reads body `+300`, which is where `CCHOST /N` persists the retail flag.

**Part 1, research (`tools/` only).**
- Read the `0x22FA3` loop that zeroes `+0x18C` for `+0x9B < 0x80`, and confirm recruits keep AI control.
- Read enough of `0x2DE10` to name its target-selection rule. Even a partial reading is useful if it states exactly what is unread.
- Extend `tools/dqk_npc_turn.py` with static pins and mutation controls seen RED.

**Part 2, native (68 usable bytes above the 128 floor).** For DQK GBPR rows whose body `+300` has bit 7 set, take the existing AI turn path instead of the scripted player tape. Change target selection only if Part 1 proves the retail rule and it fits the bytes. Otherwise keep the generic weakest-foe AI and say so in the banner.

**RED→GREEN.** Add a `cccombat-test.ps1` case: a DQK GBPR with one row carrying `+300 = 0xB2` / `+301 = 115`, and a player tape that would otherwise give that row an End.
- The trace must show an AI action for that row.
- A control row without the flag must still obey the tape.

It is RED today.

**Evidence it is real:** the chain and control byte in `dqk-npc-combat-route.md`, and the `+300`/`+301` convention in `dqk-add-npc-route.md` §5.

**Risk.**
- Bytes: about 15-30 estimated against 68 available. Re-pin `native-capacity:cccombat`.
- If `0x22FA3` turns out to hand recruits to the human, Part 2 inverts to "no change". That is still a pinned, valid outcome.
- In live play this needs T1c to produce real recruits. The CCCOMBAT test authors its own GBPR, so T4 is independently testable.

---

## T5 — Fix the DoK `-EngineSmoke` hang (test-side)

**Owner files:** the DoK region of `native/gbboot-test.ps1` (≈4544-4576, plus `Invoke-EclMapEngineSmoke` usage for `dok_area2`/`dok_area3`).

**Cause** (read from source, not measured with DOSBox here):
- The default DoK case stages retail DoK (`New-RetailStage`) and runs `C:\GBBOOT /E /X` under plain DQK-bundled `DOSBox.exe`, with a **60 s** `WaitForExit` (≈4564) and no key injection.
- With the real party staged, DoK yields the PARTYSTRENGTH welcome ACK (v15/status 2, area 34, PC 151).
- GBBOOT's `.menu` dispatch (≈3958-3974) swaps CCMENU for CCFP when `FX_HAVE_SIDECAR` is set, and it never checks `snapflag`, so `/X` does not suppress the ACK.
- CCFP's `.ack_wait` (ccfp.asm ≈192-224) then blocks on `INT 16h AH=00` forever.
- Task 213 fixed the four DoK flows with `Invoke-DokGameLinkAckFlow` (`native/dosbox-smoke.ps1:129`), but never this case.

**The change.** Run the default DoK case through `Invoke-DokGameLinkAckFlow`, which uses focusless GameLink and identity-checked Enter. Keep the existing assertions: `_GBWALL.BIN`, `Assert-ViewRaw`, `Assert-GbEffect … 34`.

**Also fixed here.** `dok_area2`/`dok_area3` mount the **unstaged** retail `$dokDir` (`Invoke-EclMapEngineSmoke` writes `mount D "$Dir"`). That breaks the read-only retail-folder rule. Stage them with `New-RetailStage`, and measure whether they also hit the ACK.

**RED→GREEN.** `pwsh native/gbboot-test.ps1 -EngineSmoke` reaches `RESULT: GBBOOT /E /X DoK engine smoke PASS`. Today it times out and throws "DOSBox did not exit".
- Retail-write control: a size+mtime listing of `Death Knights of Krynn\` (files **and** directories) before and after shows no change.

**Evidence it is real:**
- the hang is reported on clean HEAD;
- the code path traced above;
- Task 213's identical diagnosis for the other DoK flows (`NATIVE-TASKS-2026-09-12.md:4146-4201`).

**Risk.**
- Low. A GBBOOT-side `/X` skip was rejected: about 7 bytes, under the floor today, and it would read a v15 effect as the final map effect.
- A CCFP-side auto-accept of the ` /S n` GBBOOT already appends would cost 0 GBBOOT bytes. But `/C n` also seeds CCECL's menu choice, so it could change the ECL path. Not chosen.
- Merge note: T1 edits other regions of the same file.

---

## T6 — DoK combat initiative: locate the retail turn-order builder (research, `tools/` + docs only)

**Owner files:**
- a new `tools/dok_initiative_probe.py` with its test;
- `docs/engine/research/disasm-combat-dok.md` §3.1.

No `native/src` (CCCOMBAT belongs to T4 this round).

**What is known.**
- `disasm-combat-dok.md` §3.1 verifies only haste ×2 / slow ÷2 (`0x1D826`, `0x1DB55`).
- It marks the turn-order sort, and any per-round roll, **UNLOCATED** behind cross-segment overlay stubs.
- CCCOMBAT seeds a d10 once (`combat_seed_init`, ≈2958-2972) and sorts by stored initiative (≈4337). Its banner disclaims original initiative for CoK (`cccombat.asm:18`). `disasm-combat-cok.md` retracts "`+0x198` = initiative"; CoK re-rolls each round with a DEX modifier and an unproven die.

**Since then.**
- The CoK effect-7 work (Tasks 229-232) produced a descriptor-derived GAME.OVR overlay mapping and a cache-correct Unicorn replay that reaches natural combat.
- The DoK RNG is proven to be the same `0x08088405` recurrence (`a8c617c7`).
- DQK's builder was located statically (`0x24D64`: `rand(1,6)+mod`, floored at 1; insertion sort at `0x22847`), which gives a shape to search for.

**The task.**
- Locate DoK's per-combatant initiative writer and its sort in `GAME.OVR` using overlay-descriptor mapping (static first; Unicorn only if static fails).
- Pin the die, the modifier source and the per-round vs once-per-combat cadence.
- Use mutation controls, e.g. a nopped store or a changed die bound, each seen RED.

**RED→GREEN.** The new test asserts the derived facts; mutating each one turns it RED. Done means the §3.1 verdict moves from UNLOCATED to DERIVED. The alternative outcome is a precisely named blocker.

**Evidence it is real:** the UNLOCATED verdict at `disasm-combat-dok.md:105-125` and `:236`, plus the DQK shape at `dqk-npc-combat-route.md` §"Turn scheduler located".

**Risk.** Medium for research yield, zero for the engine. The CCCOMBAT implementation is next round's task and must budget against the 128-byte floor.

---

## T7 — Documentation reconciliation (bookkeeping; lowest rank)

**Owner files:**
- `native/README.md`;
- `docs/engine/NATIVE-TASKS-2026-09-12.md` (Task 35, Task 11 and the task index only);
- `docs/engine/BUILD-QUEUE.md` (top pointer only).

**Gaps measured with `grep -c` on `native/README.md`.**
- **No mention at all (count 0):**
  - `CCHOST /N` / `cchost-npc`;
  - CoK monster movement (`+0xD5`);
  - DoK Borland RNG (`use_cokrng` / `ccecl-dok-rng`);
  - the DQK walk sound (`ccfp-dqk-sound`);
  - the CCFLOW repeated-state abort (`ccflow-dqk-area2`);
  - the DQK `0x37` party lookup (`ccecl-dqk-npc-route`).
- **Thin coverage:** DQK `/Q /C` / `/Q /M` creation (count 2) and the Gen2 status-4 acceptance (count 2).
- **Task list errors:**
  - Task 35 (`NATIVE-TASKS-2026-09-12.md:1374-1377`) still says "six-operand `CHECKPARTY` at `0x86D4`" and "no live host, roster, or combat consumer". `dqk-add-npc-route.md` §1 proves the guard is two-operand `0x37 LOAD_PIECES` at `0x86DE`, and the `0x86D4` byte is inside a packed PRINTCLEAR string. `0707533b` and `f0f6d06e` then supplied the lookup and the consumer.
  - Task 11 (DIG4 sound in live play) has been partly delivered by `7561d4a4` and is not marked.
  - Tasks 234-237 are cited by commits but the numbered list ends at 233.
- `grep -n CHECKPARTY CLAUDE.md` finds nothing, so the stale note lives only in the task list. CLAUDE.md needs no edit for this item.

**RED→GREEN.**
- `tools/test_native_readme_subject.py` and `tools/test_native_flow_status.py` stay green after the edits.
- Optionally add a `tools/` pin requiring Task 35 to name `LOAD_PIECES`/`0x37` and not `six-operand CHECKPARTY`, with the stale string as the RED fixture.

**Evidence:** the grep counts above (measured 2026-10-07).

**Risk.** Low, but every README sentence must name the right script; the flow-status README agreement gate checks this. Run it after the merge of T1-T5, so the README describes the merged state instead of five partial ones.

---

## Ranked summary

| Rank | Task | Capability delivered | Owns `native/src` | Size |
|---|---|---|---|---|
| 1 | T1 GBBOOT | about 400 bytes of headroom; DQK runs past SCRIPTCAP (area-7 combat route back); live NPC recruitment; Matrix starts on its retail chain | `gbboot.asm` | L |
| 2 | T2 CCFLOW | DQK infinite-loop areas become a bounded, non-fatal saturated view (unblocks T1b) | `ccflow.asm` | S |
| 3 | T3 CCPARTY | headless DQK heroes follow DQK rules | `ccparty.asm`, `dqkcreate.inc` | S-M |
| 4 | T4 CCCOMBAT | recruited DQK companions fight under retail-style AI control | `cccombat.asm` | M |
| 5 | T5 DoK smoke | restores the DoK `/E /X` engine smoke, and its area-2/3 cases stop mounting the unstaged retail folder | – (test only) | S |
| 6 | T6 DoK initiative | derives the retail turn-order rule (implementation next round) | – (`tools/`) | M |
| 7 | T7 Docs | disclosures for eight shipped features; Task 35 correction | – | S |

**Dependencies:** T1b needs T2. T1c's live value depends on T4 for combat behaviour, but each tests independently.

## Deliberately deferred (and why)

- **GBPR 8 rows (retail DQK party limit 8).** The 6-row cap appears in all seven tools:
  - CCHOST: `NPC_ROSTER_MAX` in `cchost_npc.inc:35`; `cchost.asm` ≈378, ≈966, ≈2351; `cchost_damage.inc` ≈372; `GBDJ_SOURCE_COUNT`;
  - CCPARTY: `ENTRY_SIZE*6` at `ccparty.asm` ≈2423, plus its count gates;
  - CCCOMBAT: `cccombat.asm` ≈7248;
  - GBBOOT: `PARTY_CREATE_MAX`;
  - CCECL: `party_ext`/`party_names` at `ccecl.asm` ≈9470, WHO ≤ 6;
  - CCFLOW: `ccflow.asm` ≈758.

  It cannot be partitioned against T1-T4 this round. Next round it should be its own single task with a GBPR v3 schema decision. Until then T1c must run with a ≤5-member party and disclose that the six-hero case fails.
- **The DQK NPC AI body as a full model** (`0x2DE10` onward). T4 reads only what control routing needs.
- **The CoK effect-7 provenance chain** (Tasks 233-237; last `cok-task237-list-owner-2026-10-07.md`). This is a long-tail bounded research thread with no engine capability movement in the last five slices. Resume it after T1-T4.
- **DoK initiative in CCCOMBAT.** It waits on T6's result and on CCCOMBAT bytes after T4.
