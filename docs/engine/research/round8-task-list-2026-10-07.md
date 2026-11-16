# Round 8 native task list (2026-10-07)

This was read-only task finding against `greybox` HEAD `01ca5e0b`, with `native/src` clean. The
newest `native/src` commit is `941b1318`. Every figure below was re-derived on 2026-10-07. Two
headless DOSBox probes were run for this list; their outputs went to git-ignored or scratch
directories, and nothing tracked was edited. Line numbers will drift, so cite by symbol name.

## Starting state (measured)

### Capacity

- `native/build/native-capacity.json` is **fresh**. Its `native_source_sha256` `27254e16…` equals
  the hash recomputed with `tools/test_native_capacity_claims.py::_native_source_hash`, so no
  rebuild was needed. (The NPC-join probe's own `build.ps1` call re-emitted the same hash.)

| Tool | Emitted | Resident | Free | Floor | Usable |
|---|---|---|---|---|---|
| GBBOOT | 64,596 | 64,852 | 428 | 128 | **300** |
| CCCOMBAT | 64,872 | 65,128 | 152 | 128 | **24** |
| CCECL | 23,543 | 65,098 | 182 | 64 | **118** |
| CCFLOW | 5,412 | 56,687 | 8,593 | 0 | 8,593 |
| CCHOST | 25,568 | 45,350 | 19,930 | 0 | 19,930 |
| CCPARTY | 24,088 | 24,344 | 40,936 | 0 | 40,936 |
| CCEFX | 6,337 | 16,287 | 48,993 | 0 | 48,993 |

### Sweeps

- `native/flow-status.json`: 37/0/0 of 37.
- `native/scripts-status.json`: 38/0 of 38.
- Both are at `repo_head 16defb6e`, `native_src_commit 941b1318`, with `native_src_dirty false`, so they are fresh.
- The ownership registry pin is 109 (`tools/test_native_test_ownership.py:37`).

### What round 7 landed

| Round-7 task | Landed? | Commits |
|---|---|---|
| T1a | yes | `941b1318` (+528 bytes) |
| T1b (HLIB through CCFLOW) | **no** | – |
| T1c | yes | `941b1318` |
| T1d | yes | `941b1318` |
| T2 | yes | `b414d902` |
| T3 | yes | `65290183` |
| T4 | yes | `89781ade` |
| T5 | yes | `7212ff35` |
| T6 | yes | `22423d64` |
| T7 | partial | `9ff27964`, `21d554d3` |

### Three new facts found while preparing this list

1. **`gbdqk-npc-join-test.ps1` is RED at HEAD (measured)** and is in no runner.
   - Run headless, it exits 1 with `GBBOOT DQK NPC join: expected 5 GBPR rows, got 1`.
   - `N1.TXT` ends `DQK character creation was rejected.` / `GBBOOT: native preview failed; gate 4`. Its `/R DQK_CLERIC …` names have 10 characters including `_`. Since `65290183`, `dq_check_name` (`dqkcreate.inc`) accepts only 3–8 letters.
   - `N2.TXT` shows `CCHOST: npc joins applied` and **then** `GBBOOT: native preview failed; gate 20`. The join run itself is a failed boot: it is a `/@` mid-block entry with no LOAD_FILES, and `accept_terminal_ecl_exit` rejects it. The test never checks this.
   - It "passed" in round 7 only because it was measured before the CCPARTY merge.
2. **The Matrix start route stops at a mis-framed opcode, not an undecoded one (measured).**
   - Standalone `CCECL C:\ECL1.DAX 19 /T` (retail ECL1, `MATRIX.CFG` present) traces `PC=0016 OP=03`, `001C OP=16`, `001D OP=01` (GOTO 0x8508), `050A OP=4C`, `050B OP=00`. The run then ends at status 0, area `0013`, `GBSX #00 OP=4C ARGC=00`, with no GBLF.
   - The bytes at block-19 offset `0x50A` are `4c 00 00 00 65 09 00 0a 01 63 4c 09 00 13 01 f2 4b`.
     - With CCECL's Buck framing of `0x4C` as 0 operands (`ccecl.asm` dispatch `cmp al,0x4c / je op_buck_ext_zero`), the next byte decodes as EXIT.
     - With `ECL_GEN1_MATRIX`'s framing as 2 operands (`packages/engine/src/ecl/disassemble.ts`, `0x4c: wordSet 2`), the next instructions are `SAVE 10 -> [0x4C63]` and `SAVE 19 -> [0x4BF2]`. That is the route doc's `[0x4C30]==0 → GOTO 0x8508` second LOAD_FILES site.
   - The `use_selected_geo_fallback .matrix` comment in `gbboot.asm` ("halts on an undecoded 0x4x op") is therefore wrong. Wall set 5 is never loaded because LOAD_PIECES is never reached.
3. **`CCHOST /D` on a DQK compact GBPR writes DoK's retail save path (read from source).**
   - `direct_damage` forces `gamep = game_cok`.
   - `apply_damage_value_to_roster` (in `cchost_damage.inc`) takes `.dok_patch` for **any** compact roster (`test word [rosterhdr+10],1`). It writes the GBD1 HP first, then, because `CCHOST_DIRECT_DAMAGE` is always defined (`cchost.asm:4`), calls `write_dok_save_damage`. That opens `SAVE\CHRDATA<slot>.GAM` for slots 1–6.
   - DQK rows imported from QSV get slots `party_count+1` = 1..6 (`ccparty.asm`, `build_dqk_qsv_member`). So a DQK sidecar DAMAGE either fails after a partial GBPR write (no `.GAM`, so a fatal boot) or writes byte 214 of a stray DoK file.
   - Today this is latent: GBBOOT applies DQK fixed damage in-process (`apply_effect_damage_roster .local`). T1 makes it live.
   - Separately, `validate_damage_v15_capacity` rejects `FX_HAVE_SIDECAR`. So CCFLOW's reason-10 record (status 4 with sidecar) makes `CCHOST /D` fail, which GBBOOT turns into a gate-11 boot failure.

## Partition rules

### `native/src` ownership

No two tasks share a file:

| Task | Files |
|---|---|
| T1 | `gbboot.asm` |
| T2 | `cchost.asm`, `cchost_*.inc`, `ccefx.asm` |
| T4 | `ccecl.asm` |
| T5 | `cccombat.asm` |
| T6 | `ccparty.asm`, `dqkcreate.inc` |

T3 and T7 own no `native/src` file. `ccflow.asm` is untouched this round.

### Shared test file

`native/gbboot-test.ps1` is shared on purpose, by region:
- T1: the DQK `Invoke-DqkEngineSmoke` block and the `EDQKA7`/`EDQKA26` plan rows;
- T4: the Matrix real-start block (`$matrixRealSrc`… `RESULT: … Matrix Cubed real start route`).

### Merge hotspots (append-only, integrator reconciles)

- `native/test-ownership.json` plus the pin of 109;
- the `native/test.ps1` rosters;
- `native/README.md`;
- the `<!-- native-capacity:… -->` pins in `GOAL.md` and `docs/engine/NATIVE-TASKS-2026-09-12.md`.

### Order

- **T2 before T1.** T1's acceptance needs T2's CCHOST contract.
- **T3's final GBBOOT-line pins after T1.** T1 changes area 27 from direct CCECL to CCFLOW.
- Re-run `native/run-flow-suite.ps1` once on the merged source.

---

## T1 — GBBOOT: send HLIB through CCFLOW and restore the DQK `/A 7` combat route (rank 1)

**Owner:**
- `native/src/gbboot.asm`;
- the DQK region of `native/gbboot-test.ps1`;
- the GBBOOT capacity pin.

**What is still there (verified).** Two gates keep HLIB on direct CCECL:
- `.run_ecl` → `cmp word [enginep], eng_dax_gen1 / jne .direct_ecl`;
- `.resume_combat_effect` → the same compare / `jne .resume_child_ecl`.

The comment above the first gate ("HLIB's DQK area 2 can remain live beyond six saturated chunks") is stale. Since `b414d902`, CCFLOW publishes a reason-10, status-4 record and exits 0 (`loop_publish` in `ccflow.asm`). `eng_hlib` is the only other engine family (`gbboot.asm` string table), so the change affects DQK DOS and DQK-Amiga only.

**The change.**
- Delete both gates.
- `child_ecl` then has no user: it is a 112-byte `times db 0` buffer, plus `s_ccecl` and its `compose_tool_path` call in the path setup block.
  - Compose `s_ccflow` once into that buffer and drop the two per-site `titlepath` compositions. (CCFLOW resolves `CCECL.COM` beside itself.)
- Also reclaim:
  - `gbcrbuf` (`times GBCR_BUF_LEN db 0`, 53 bytes): `grep` finds only its definition;
  - the `jmp .path_create` that sits immediately before `.path_create:` in the `/R` create loop.
- Fix the `.matrix` comment in `use_selected_geo_fallback` (comment-only; see fact 2).

**Bytes.** This task frees bytes; it spends none. The estimate is +150 to +230 (gates ≈16, `child_ecl`/`s_ccecl`/compose ≈131, `gbcrbuf` 53, dead jmp 2, per-site compose ≈20). Measure with `pwsh -NoProfile -File native/build.ps1 -Target engine` and re-pin `native-capacity:gbboot`.

**Measure first (do not restore any pin before this).**
- Run CCFLOW on GBBOOT's real `/A 7` tail (`GBLF 001A 0001 D001`, which is not area 26's `001A 00FF 0000`).
- Record whether the continuation reaches status 3 at GEO 14.
- Why it probably will: the route worked before `37feee1d` precisely because the VM kept executing past event 64. CCFLOW's continuation keeps executing too, without dropping events.
- If it does not, stop and report what it does reach.

**RED→GREEN, in `gbboot-test.ps1` `Invoke-DqkEngineSmoke "area7"`.**

Replace today's honest-failure pin (`GBEF v000F flags=0021 status=0004 geo=001A`, `GBSX count=0040`, `-GbsxSaturated`, 22x22) with the pre-`37feee1d` route:
- initial `status=0003 geo=000E` and `GBLF operands=000E 0001 D001`;
- `-ExpectedResumeGeo 62` with `status=0000 geo=003E` and `GBLF operands=003E 0006 D006`;
- a 28x28 wall.

This is RED on today's binary. Move `area26` from saturated status 4 to the terminal record that matches CCFLOW's measured 112 events (`native/ccflow-test.ps1`).

**Must stay green:**
- `area2`/`area3` and every `gbdqk-*` and DQK-Amiga flow in `$flowScripts`;
- `native/ccflow-dqk-area2-test.ps1`;
- `native/gbdqk-area2-menu-flow-test.ps1`. This now receives a reason-10 record, so it depends on T2.

**Evidence:**
- the gates and buffers above (read at HEAD);
- `NATIVE-TASKS-2026-09-12.md:56-63` (the bisect to `37feee1d`);
- the `/A 7` comment block in `gbboot-test.ps1` ("Restore the 14 -> 62 pins when that continuation lands").

**Risk (medium).**
- The route reachability above is unproven.
- CCFLOW's extra resident image: GBBOOT, CCFLOW and CCECL are about 186 KB together. Gen1 already runs that chain.
- Any DQK effect that now carries `FX_HAVE_SIDECAR` goes to `apply_sidecar_damage_roster` → `CCHOST /D`, which is why T2 must land first.

---

## T2 — CCHOST (+CCEFX): make `/D` safe for DQK rosters and give GBHD reason 10 an explicit contract (rank 2, prerequisite for T1)

**Owner:**
- `native/src/cchost.asm`, `cchost_damage.inc` (and `cchost_damage_journal.inc` only if the journal path needs the same title gate), `native/src/ccefx.asm`;
- `native/cchost-test.ps1`;
- a new CCHOST leg in `native/ccflow-dqk-area2-test.ps1`.

**The change.**
1. **No DoK save writes for DQK.**
   - In the `/D` write loop, call `write_dok_save_damage` only when `[rosterhdr+12] == GBPR_ID_DOK`.
   - Do the same in the journal source-preimage path if it is reachable for title 3.
   - DQK's retail store is QSV/QCH. The native engine does not write it back today, so the GBD1 cache is the only store to update.
2. **Reason-10 contract.** Pick the value at `GBHD reason` (the word CCFLOW's `loop_publish` rewrites) and write the rule down. Recommended:
   - `/D` **accepts** a v15/status-4 record with `FX_HAVE_SIDECAR` **only if** its reason is 10 and its GBSL validates. It applies the GBSL DAMAGE events once, as a non-terminal source.
   - A status-4 record with the sidecar flag and any other reason is **rejected** with the roster byte-identical.
   - The combat-result path (`/H`, GBHR) and the GBDJ/GBTX recovery paths **reject** any effect whose reason is 10, because a loop record is never a completed or resumable state.
3. **CCEFX.** `dump_halt_diag` labels reason 10 (for example ` loop-detected`), the same way it labels reason 7 with `s_halt_script_full`.

**Bytes:** CCHOST 19,930 free; CCEFX 48,993 free. No pinned tool is affected.

**RED→GREEN in `cchost-test.ps1`.**
- **(a) DQK compact `/D`.** Fixture: a title-3, flag-1, revision-1 GBPR with a QSV-style row at slot 1; a v9 GBEF with `FX_HAVE_SIDECAR` and a GBSL holding one party DAMAGE; and a **sentinel** `SAVE\CHRDATA1.GAM` (216 bytes).
  - Require exit 0, the GBD1 HP word reduced, and the sentinel **byte-identical**.
  - This is RED today: the code reaches `write_dok_save_damage` and rewrites sentinel byte 214.
  - Second case: no `SAVE` directory. It must exit 0, where today it fails after a partial GBPR write.
- **(b) Reason 10.** Run CCHOST on CCFLOW's real area-2 output, produced in `ccflow-dqk-area2-test.ps1`.
  - `/D` must exit 0 and apply exactly the GBSL's DAMAGE records. Today it fails via `validate_damage_v15_capacity`.
  - Rejection control: the same file with its reason word patched to 7 must exit nonzero with the roster byte-identical.
  - A GBHR request naming the reason-10 effect must be rejected before any mutation.
- **(c) CCEFX.** The dump of the reason-10 file contains the new label; the area-26 control (reason 7 or terminal) does not.

**Must stay green:** every existing `cchost-test.ps1` DoK `/D` case, including the low-slot `.GAM` writes at 40/214 and the preflight negative control.

**Evidence:** facts 3 and 2 above (code paths named); `native/README.md` "Consumers must treat reason 10 as non-terminal; no CCEFX/CCHOST rejection control exists yet".

**Risk (low).**
- Applying a loop stream's damage once is a modelling choice: the GBSL holds one loop period, not an infinite one. State it in the README.
- Do not touch CCFLOW.

---

## T3 — Repair, extend and enroll `gbdqk-npc-join-test.ps1` (rank 3, test-only)

**Owner:**
- `native/gbdqk-npc-join-test.ps1`;
- its `$flowScripts` entry in `native/test.ps1`;
- its `native/test-ownership.json` entry (currently `"disposition": "advisory"`, `"owners": []`).

**The change.**
1. **Fix the setup.**
   - Use `/R` names that `dq_check_name` accepts (3–8 letters, e.g. `CLERA C`, `FIGHTA F`, `MAGEA M`, `THIEFA T`).
   - Create `data\SAVE`, which the QCH writer needs; `gbdqk-create-test.ps1` does this.
   - Assert `N1.TXT` has no `rejected` and no `failed; gate` line.
2. **Pin the GBBOOT outcome of the join run explicitly.**
   - Today `N2.TXT` ends `failed; gate 20` after `npc joins applied`. Either pin that as disclosed current behaviour (a `/@` mid-block entry has no LOAD_FILES, so `accept_terminal_ecl_exit` rejects it), or move the entry so GBBOOT succeeds.
   - Do not let a failed boot pass silently.
   - Re-derive this pin after T1 merges, because area 27 then runs through CCFLOW.
3. **Add the six-hero case the header promises but never asserts.**
   - Stage the retail `SAVGAMA.QSV` party (6 rows) and run the same join.
   - Require GBBOOT's `s_npc_full` notice (the `apply_npc_joins .full` path, CCHOST `/N` exit 2) and `_GBPARTY.GBP` byte-identical before and after.
4. Enroll the script in `$flowScripts` with disposition `required`.

**Bytes:** none.

**RED→GREEN.**
- RED today (measured above: exit 1, "got 1").
- GREEN: 4 → 5 rows, row 5 `TASSLEHOFF` with `+300=0xB2` and `+301=115`, the revisit stays at 5, and the six-hero roster is unchanged.
- Mutation control: in a scratch copy, change `apply_npc_joins`' `cmp al, 2` to `cmp al, 3`. The six-hero case must go RED, because exit 2 then becomes fatal.

**Evidence:**
- the measured run;
- `test.ps1` arrays: the name is in neither `$scripts` nor `$flowScripts`;
- `16defb6e` registered only an advisory ownership entry.

**Risk (low).** The flow sweep goes from 37 to 38 scripts. Say so whenever the count is quoted.

---

## T4 — CCECL: Matrix Cubed's own extended-opcode frames, so the real start reaches LOAD_FILES 17 / LOAD_PIECES 5 (rank 4)

**Owner:**
- `native/src/ccecl.asm`;
- a new `native/ccecl-matrix-route-test.ps1`;
- the Matrix real-start block of `native/gbboot-test.ps1`.

**The change.**
- In `select_operand_dialect`, `.try_matrix` sets `short_menu_opframes` only. Add an `is_matrix` byte.
- Under it, frame the ops present in `ECL_GEN1_MATRIX`:
  - `0x4C` as 2 operands (needed by the route);
  - `0x4B` as 1 operand;
  - `0x44`, `0x47`, `0x48`, `0x49` (6), `0x4A` per that table, preserved as host script effects like the Buck extensions.
- Buck's framing (`0x4B`/`0x4C` zero-operand, observed) must not change.

**Bytes.** About 25-40 against 118 usable (CCECL floor 64). If it does not fit, a reclaim is available: the five copy-then-open blocks in `select_operand_dialect` (`.try_pool4`/`.try_buck`/`.try_matrix`/`.try_pool`/`.try_cok`) are near-identical and could become one helper. That saves an estimated 50-80 bytes (not measured). Re-pin `native-capacity:ccecl` in `GOAL.md`.

**RED→GREEN.**
- **New standalone test** on retail `ECL1.DAX` + `MATRIX.CFG`; SKIP when `matrixcubed_extracted` is absent (it is present on this machine).
  - `CCECL … 19 /T` must trace past `PC=050A` without `OP=00` at `050B`, and emit `GBLF` naming GEO `0011` and a `GBLP` naming set `0005`.
  - Control: the same bytes **without** `MATRIX.CFG` keep today's trace, ending at `050B OP=00`.
- **`gbboot-test.ps1` Matrix block.** Add `Assert-GbEffectDump` for `GBLF operands=0011` and the GBLP set 5. Keep the existing `area=0013` and wall-equality checks.
  - `use_selected_geo_fallback .matrix` then becomes unnecessary for the real route. Leave it for T1 or a later round.
- **Must stay green:**
  - `tools/test_matrix_start_route.py` (27 tests);
  - every Buck CCECL pin, including the `ccecl-buck-*` scans and `gbbuck*` flows;
  - `ccecl-matrix-short-menu-test.ps1`.

**Evidence:**
- fact 2 (measured trace plus raw bytes);
- `docs/engine/research/matrix-cubed-start-route.md` block-19 row;
- the CCECL dispatch tail (`cmp al,0x4b/0x4c → op_buck_ext_zero`).

**Risk (medium).**
- `ECL_GEN1_MATRIX` marks `0x43..0x4C` as `uncertain`.
- Only `0x4C` is directly supported by the route bytes. Frame the others only if a Matrix block on the route needs them, and say which are inferred.
- Later blocks 18/20 still truncate in the TS decoder.
- Claim "reaches its retail LOAD_FILES/LOAD_PIECES", not "playable".

---

## T5 — CCCOMBAT: reclaim bytes, then implement the derived DoK initiative rule (rank 5; part b is capacity-blocked until part a lands)

**Owner:**
- `native/src/cccombat.asm`, `native/cccombat-test.ps1`;
- a new `tools/` golden generator that reuses `tools/dok_initiative.py`.

### T5a — Reclaim (enabler; behaviour-identical)

- **Dead DQK scratch words.** 19 `dw 0` words, `dqk_scan_k` … `dqk_name_count_i`, beside `mon_id_count`. Each has **exactly one** occurrence in all of `native/src` (its own definition), checked with `grep -c`. That is **38 bytes**, certain.
- **Table-driven fixture dispatch in `build_encounter`.** There are 47 `cmp byte [encid+1], …` sites. Each plain entry is about 23 bytes (`cmp/jne/cmp/jne/mov si/mov cx/jmp`). A `{id0,id1,id2, fixture ptr, count ptr}` table with one compare loop could replace it, keeping the terrain/hazard special cases (`fixture20_terrain`, `fixture23_hazard`, …) as explicit branches. Estimated 500-700 bytes, **not measured**.
- **RED→GREEN.**
  - A new `tools/` source-contract test requires zero `dqk_scan_*`/`dqk_ida_*`/`dqk_name_*` labels and at most N `cmp byte [encid+1]` sites (N = the special cases kept). It is RED today.
  - Every `cccombat-test.ps1` golden must stay byte-identical, which is the behaviour proof.
  - Re-pin `native-capacity:cccombat`.

### T5b — DoK initiative (`docs/engine/research/dok-initiative.md`)

**The rule:**
- each round, `delay = max(1, 1d6 + DexReactionAdj(DEX))`;
- surprise −6 in round 1;
- a result outside 0..20 becomes 0;
- insertion sort, highest delay first, with a `dice(1,2)` coin per tie;
- delay ≤ 0 skips the turn, and 20 is treated as 19.

The rule was oracle-verified under Unicorn: 2304/2304 delays and 300/300 orders, with 6 patch mutations caught.

**The change.** CCCOMBAT today does a once-per-combat d10 (`combat_seed_init`) and a deterministic selection sort (`begin_round`/`cmp_order`) for **every** title. It has no `C_DEX` field, and DEX is read only for CoK. Gate the new rule on `party_dok == 1`.

**Bytes:** about 160-190 for the full rule, or about 90-110 without surprise and coin-flip ties. **It does not fit in 24 usable bytes until T5a lands.**

**RED→GREEN.**
- Extend `trace_init`, which prints dashes today, to print each delay.
- Add a DoK `cccombat-test.ps1` case with fixed DEX values and an RNG state run under `/J`, where `rng_die` → `cok_combat_die` uses the shared recurrence.
- Require the per-round delays and order to equal `tools/dok_initiative.py` for the same state.
- It is RED today (d10, once per combat).
- Control: a CoK fixture's order is unchanged.

**Risk (medium).**
- Whether CCCOMBAT's DoK path actually runs under `/J` in live play is not established. If it does not, the golden must come from the native stream, and the doc must say so.
- Who sets the surprise and in-combat bytes is untraced (`dok-initiative.md:88-102`).

---

## T6 — CCPARTY: reproducible DQK `/R` hit points (rank 6)

**Owner:**
- `native/src/ccparty.asm`, `native/src/dqkcreate.inc`;
- `native/ccparty-test.ps1`, `native/gbdqk-create-test.ps1`.

**The problem (verified).**
- GBBOOT's DQK `/R` tail is `/G /ID 3 /C <name> <class> <roster>`, with no `/D`.
- `dq_dice_init` (`dqkcreate.inc`) therefore seeds the LCG from `int 1Ah`.
- `gbdqk-create-test.ps1` can only require HP > 0 (`:194-200`: "HP is only required to be positive"). `ccparty-test.ps1` gets byte identity only by calling CCPARTY directly with `/D DICE.BIN`.

**The change (0 GBBOOT bytes).**
- When the DQK headless path has no `/D`, look for an opt-in `_GBDICE.BIN` in the roster file's directory, and use it as if it were passed with `/D`.
- With no such file, keep the timer default, so real players still get random rolls.

**Bytes:** about 40-60 of 40,936.

**RED→GREEN in `gbdqk-create-test.ps1`.**
- Write a `_GBDICE.BIN`, run `GBBOOT /R`, and require each row's HP to equal `tools/dqk_character_rules.py --dice` for the same bytes.
- Repeat with a **second** dice file whose model HP differs. A timer-seeded run cannot match both, so this is RED today.
- Control: with no file, HP is still only required to be > 0, and two runs may differ.

**Evidence:** `gbboot.asm` `.create_next`/`.create_arg`; `dqkcreate.inc` `dq_dice_init`; README "timer dice" (`native/README.md`, round-7 bullet).

**Risk (low).** The dice are still not the retail RNG, as the `dqkcreate.inc` header already says. This only makes headless goldens reproducible.

---

## T7 — Research: read the DQK NPC AI body (overlay 2 from file `0x2DE10`) and the `0x22FA3` control loop (rank 7, `tools/` + docs only)

**Owner:**
- `tools/dqk_npc_turn.py`, `tools/test_dqk_npc_turn.py`;
- `docs/engine/research/dqk-npc-combat-route.md`.

**What is known.**
- `dqk-npc-combat-route.md` "Turn scheduler located" names the scheduler, the control byte `+0x18C` and the AI entry.
- It leaves the AI body's target and move selection "unread" and the `0x22FA3` loop unread (`:276-282`).
- CCCOMBAT gives recruits (`+300` bit 7) the generic weakest-foe `ai_take_turn` (`89781ade`).

**The task.**
- Statically disassemble from `0x2DE10`, using the overlay mapping already used for the scheduler.
- Name the target-selection rule, the movement rule and any spell/flee branches.
- Read `0x22FA3` and settle whether recruits keep AI control.
- Pin each derived fact with a mutation control seen RED.

**RED→GREEN:** new tests in `test_dqk_npc_turn.py` that fail when each pinned byte or branch is perturbed. Done means the doc's verdict moves from UNRESOLVED (narrowed) to DERIVED for named rules, or names the exact blocker.

**Bytes:** none. Implementing it in CCCOMBAT is next round's work and competes with T5b for the same bytes.

**Risk:** medium for research yield, zero for the engine.

---

## Ranked summary

| Rank | Task | Capability | `native/src` owned | Byte effect |
|---|---|---|---|---|
| 1 | T1 | DQK runs past SCRIPTCAP; area-7 combat at GEO 14 → resume 62 restored | `gbboot.asm` | GBBOOT **+150..230** (measure) |
| 2 | T2 | DQK-safe `CCHOST /D`; reason 10 accepted non-terminally / rejected where a terminal state is required | `cchost*`, `ccefx.asm` | negligible (large headroom) |
| 3 | T3 | the live NPC-join route measured instead of assumed; six-hero exit-2 pinned; enrolled | – | none |
| 4 | T4 | Matrix starts on its retail chain through LOAD_FILES 17 / set 5 | `ccecl.asm` | CCECL −25..40 of 118 |
| 5 | T5 | CCCOMBAT headroom; native DoK turn order | `cccombat.asm` | +38 certain, +500..700 est.; then −90..190 |
| 6 | T6 | reproducible DQK `/R` goldens | `ccparty.asm`, `dqkcreate.inc` | negligible |
| 7 | T7 | DQK NPC AI rules derived | – | none |

## Capacity-blocked or deferred (and what has to come first)

### GBPR 8 rows (retail DQK party limit 8)

Blocked on capacity in two pinned tools. Every cap is a literal, and there is no shared constant. The census at HEAD:

| Tool | Sites | Buffer growth at 8 rows | Fits? |
|---|---|---|---|
| ccparty | 10 | +1,640 | yes |
| cchost | 8 | about +2,100 | yes |
| cccombat | 2 | +2 | yes |
| ccecl | 8 | +150 (`party_ext`, `party_names`, `cok_spell_rows`) | **no** (118 usable) |
| gbboot | 7 | +866 (`rest_party times 2476` alone needs +820) | **no** (300 usable) |
| ccflow | 1 | – | – |
| ccinv (CoK-only) | 7 | – | – |

Prerequisites:
- (1) move GBBOOT's `rest_party` and checkpoint image out of the `.COM`, either into a DOS-allocated block or by streaming;
- (2) keep CCECL's `cok_spell_rows` at 6, since it is CoK-only, which cuts its growth to about +34;
- (3) a GBPR v3 schema decision covering the embedded 2476-byte images in GBCP, GBMR/GBLR, GBDJ/GBTX and GBCR. These also pin 6: `tools/test_native_gbpr_identity.py` and the Python readers `cok_inventory`, `cok_learning`, `cok_party_removal` and `cok_mutation_packet`.

This should be one owner per round, once those prerequisites exist.

### Other deferred items

- **The DQK NPC AI in CCCOMBAT.** It waits on T7 and on T5a's bytes.
- **The live natural route to the area-27 Hulderfolk join.** It is not just `/@ 34526`, and it waits on T1 and T3.
- **Docs drift for the integrator.** Fix after merge, so the docs describe the merged state:
  - `native/README.md`'s CCHOST `/N` bullet still says "GBBOOT does not call it";
  - `NATIVE-TASKS-2026-09-12.md` item 35 (`:1376-1377`) still says "no GBBOOT or live-play path calls `CCHOST /N`";
  - the README's reason-10 bullet must be updated by T2;
  - the README's "GBBOOT does not route DQK through CCFLOW" must be updated by T1.
