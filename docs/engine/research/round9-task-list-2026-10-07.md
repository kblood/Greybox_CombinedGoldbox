# Round 9 native task list (2026-10-07)

This list comes from a read-only task-finding pass on `greybox` at HEAD `1b6de4d4`, with a clean working tree. The newest `native/src` commit is `967c5fdd`.
- Every figure below was re-derived from the tree on 2026-10-07.
- No DOSBox session was run and nothing tracked was edited.
- Four parallel read-only surveys supplied the per-candidate facts, and the key claims were spot-checked against source.
- Cite code by symbol name, because line numbers drift.

## Starting state (measured)

### Capacity

`native/build/native-capacity.json` is **fresh**: its `native_source_sha256` `9759e343…` equals `tools/test_native_capacity_claims.py::_native_source_hash()`.

| Tool | Emitted | Resident | Free | Floor | Usable |
|---|---|---|---|---|---|
| GBBOOT | 64,562 | 64,818 | 462 | 128 | **334** |
| CCCOMBAT | 64,592 | 64,848 | 432 | 128 | **304** |
| CCECL | 23,574 | 65,131 | 149 | 64 | **85** |
| CCFLOW | 5,412 | 56,687 | 8,593 | 0 | 8,593 |
| CCHOST | 25,862 | 45,644 | 19,636 | 0 | 19,636 |
| CCPARTY | 24,130 | 24,386 | 40,894 | 0 | 40,894 |

**GBBOOT has no BSS tail.** It has no `.bss` section, and resident = emitted + 256 (the PSP). Every `times N db 0` buffer is therefore emitted. Turning one into `resb` would shrink the file but not the resident image, so the only real reclaim is to move buffers out of the image (see T3).

### Sweeps

- `native/flow-status.json` records 38/0/0 of 38.
- `native/scripts-status.json` records 43/0 of 43.
- Both carry `native_src_commit 967c5fdd` = the newest `native/src` commit, with `native_src_dirty false`, so they are **fresh**.
- Both report `skip: 0`.
- `native/test-ownership.json` holds **114** entries (92 required, 22 advisory), and `tools/test_native_test_ownership.py` pins 114.

### What round 8 / 8b landed (verified by commit)

| Round-8 task | Landed | Commit(s) |
|---|---|---|
| T1: DQK through CCFLOW; `/A 7` reaches GEO 14 and resumes at 62 | yes | `e41acd98`, `2f34e894` |
| T2: CCHOST `/D` DQK-safe; reason-10 contract; CCEFX label | yes | `ee801b64`, `79081b59` |
| T3: `gbdqk-npc-join-test` repaired and enrolled | yes (pins gate 20) | `8ec51bb6`, `585acb82` |
| T4: Matrix `0x4C` = 2 operands, so block 19 reaches GEO 17 / set 5 | yes (only `0x4C`) | `01d5f0db` |
| T5a: CCCOMBAT table-driven dispatch (+936 bytes) | yes | `78ff872c` |
| T5b: DoK per-round initiative | yes, **exact for round 1 only** | `6142fce2` |
| T6: CCPARTY opt-in `_GBDICE.BIN` | yes (CCPARTY-direct test only) | `0a889399` |
| T7: DQK NPC AI body read | doc only (`dqk-npc-ai-body.md`) | `36550b58` |
| 8b: DQK uniformly random in-reach target | yes | `967c5fdd` |

### Candidates evaluated and how each was resolved

| Candidate | Verdict |
|---|---|
| DQK NPC AI beyond the target pick | **Drop as an engine task.** `dqk-npc-ai-body.md` §6 lists the spell ladder's 30 per-spell evaluators (`0x2902C`), `canReachTarget`/`AttackTarget`/`TrySweepAttack` and damage as UNREAD. The spell-disable flag, `+0x5A==5` and the cast probabilities are only INFERRED. The hold-back and flee formulas read globals (`C2DE`, `C6B8`) whose meaning is unsourced. The doc also says "nothing here has been compared against a retail DOSBox trace". No further rule meets the bar, so the remaining work is pinning (T7). |
| GBPR 8 rows | **Still blocked on GBBOOT and CCECL bytes.** The retail cap of 8 is confirmed (`dqk-add-npc-full-party.md`, Unicorn plus mutants). T3 is the extraction that frees GBBOOT; the 8-row change itself is deferred. |
| CCHOST `/N` reason 10 and the 116-byte read | **Open, and wider than stated** → T5. |
| DoK initiative rounds ≥2 and the surprise source | **The round-2 gap is in the oracle**, not proven in the engine → T4. The surprise producer is untraced (`dok-initiative.md`: "not traced"), so it stays deferred. |
| Matrix wall-set verification and a Matrix flow test | **Open** → T2, test-only. The `0x4B` mis-frame is real but needs `ccecl.asm`, which T1 owns. |
| DQK `/R` through `gbdqk-create-test` with `_GBDICE.BIN` | **Open, test-only** → T6. |
| DQK area-27 terminal route | **Blocked.** It needs a natural route that no doc establishes, and the `0x86DE` decode is disputed. The decode question goes into T7. |
| Treasures / Pools of Darkness / FRUA breadth | **Pools and Treasures are actionable** → T1. FRUA is blocked on item 24 (`SCRIPT.GLB` event pages, start-module selection). |
| "Stale DoK/CoK flows skipped in agent envs" | **Drop: the premise is false.** Both sweeps record `skip: 0`, and every `SKIP:` guard tests only for missing DOSBox or retail data, never for an environment variable or desktop session. The unexercised DoK/CoK scripts are the 22 *advisory* entries (not on any roster), plus the nine `cok*-test.ps1` scripts, which run through `tools/test_cok_native_*.py` rather than the sweep. |

## Partition

### `native/src` ownership (no file shared)

| Task | `native/src` files |
|---|---|
| T1 | `ccecl.asm` |
| T3 | `gbboot.asm` |
| T4 | `cccombat.asm` |
| T5 | `cchost_npc.inc` (`cchost.asm` only if a shared helper is unavoidable) |
| T2, T6, T7 | none |

### Shared test files, split by region

`native/gbboot-test.ps1`:
- T2 owns the Matrix real-start block (`$matrixRealSrc` … `RESULT: … Matrix Cubed real start route`).
- T3 does not edit this file; it only runs `-EngineSmoke` as its behavioural proof.

### Merge hotspots (append-only; the integrator reconciles)

- the `native/test.ps1` rosters (`$flowScripts` 38, `$scripts` 43);
- `native/test-ownership.json` and its pin of 114;
- `native/README.md`;
- the `<!-- native-capacity:… -->` pins in `GOAL.md` and `docs/engine/NATIVE-TASKS-2026-09-12.md`.

### Order

All seven can start at once.
- T3 must merge before anyone starts GBPR 8 rows or a GBBOOT default-entry change for Treasures or Pools.
- After merging, re-run `native/run-flow-suite.ps1` and the `$scripts` sweep once. Quote the new denominators, because T1 and T2 add flow scripts.

---

## T1: CCECL short-frame dialect for Pools of Darkness and Treasures, plus a first real-data map-entry flow for each (rank 1)

**Goal.** Two titles that today only have synthetic fixtures run their own retail ECL1/GEO1 pair through CCECL into a GBBOOT wall bridge. This is the first real-data map route for either title.

**Owner:**
- `native/src/ccecl.asm`;
- new `native/ccecl-pod-treasures-frames-test.ps1`;
- new `native/gbpod-flow-test.ps1` and `native/gbtreasures-flow-test.ps1`;
- a Pools init-block sweep under `tools/`, reusing `tools/map_gen1_demo_entry.py --profile pools-of-darkness`.

**Verified facts:**
- **Pools frames are wrong in CCECL.** `op_loadfiles` reads three operands for every non-Gen2 block, and `POOL4.CFG` sets only `short_opframes` and `short_menu_opframes` (`select_operand_dialect` `.try_pool4`). Pools' own `GAME.OVR` handlers fix three frames: `0x1F`=1, `0x21` LOAD_FILES=2, `0x37`=2 (party-name lookup). Sources: `tools/gen1_ecl_encounter_scan.py` `GEN1_SHORT_POOLS_WORD_SETS`, and `packages/engine/src/ecl/disassemble.ts` `ECL_GEN1_SHORT_POOLS`.
- **Treasures has no dialect branch.** No `TREASURE.CFG` probe exists in `select_operand_dialect`, so Treasures decodes with long Gen1 frames, which desync at `0x1D`/`0x22`/`0x2C`/`0x21`.
- **Both titles share one word set.** `GEN1_SHORT_TREASURES_WORD_SETS` is identical to Pools': `{0x0C:4, 0x1D:0, 0x1F:1, 0x21:2, 0x22:0, 0x23:0, 0x2C:1, 0x37:2}`. One new flag can serve both markers.
- **The data is present.** GOG installs `Pools of Darkness/` (ECL1 56 blocks, GEO1 32 blocks) and `Treasures of the Savage Frontier/` (ECL1 30 blocks, GEO1 41 blocks).
- **Entry blocks.** Treasures' bootable init block is **20** (`treasures-pools-darkness-scoping.md`). Pools' init block is **unknown**; that doc calls it a "Real gap".
- **Today's coverage.** The only retail-data native test for either title is `ccecl-pod-short-menu-test.ps1` (block 51 menu). `gbbroader-flow-test.ps1` uses synthetic fixtures with `/B 34`.

**The change:**
1. **Reclaim first.** The five copy-then-open marker probes in `select_operand_dialect` (`.try_pool4`/`.try_buck`/`.try_matrix`/`.try_pool`/`.try_cok`) are near-identical. Fold them into one table-driven helper (estimated 50–80 bytes; measure it).
   - Proof that behaviour is unchanged: every `ccecl-*` script and `gbbuck*`/`gbdok*` flow stays green, with byte-identical GBEF dumps on the existing goldens.
2. Add a `short2_frames` byte, set by `POOL4.CFG` and by a new `TREASURE.CFG` probe. `TREASURE.CFG` also sets `short_opframes`.
3. Gate the three frames under `short2_frames`:
   - `op_loadfiles` skips its third operand;
   - `0x1F` reads 1 operand;
   - `0x37` takes the existing two-operand path.
4. **Pools init block (tools only).** Run the sweep that found Treasures' block 20, and pin its result in a `tools/` test.

**Bytes.** About 45–70 for the flag, marker string, probe-table row and three gates, against 85 usable. **Do not land step 2 without step 1's measured reclaim.** Re-pin `native-capacity:ccecl` in `GOAL.md`.

**RED→GREEN:**
- **Standalone CCECL** on retail Pools `ECL1.DAX` + `POOL4.CFG`, init block, `/T`: the trace must pass the first LOAD_FILES with a two-operand frame and emit `GBLF` naming a GEO id that exists in `GEO1.DAX`.
  - The expected PC sequence comes from the TS `ECL_GEN1_SHORT_POOLS` disassembly of the same block, never from the asm.
  - It is RED today: the third-operand read desyncs the stream, as the Python scanner documents for the shared-dict case.
- **Same for Treasures** block 20 with `TREASURE.CFG`.
- **Controls:**
  - without the marker, today's long-frame trace is unchanged (so the gate is the cause);
  - a DoK `DKK.CFG` block keeps three operands (DoK retains the long LOAD_FILES).
- **Flow scripts** (shaped like `gbgateway-glib-flow-test.ps1`):
  - GBBOOT boots the staged retail copy with `/B <init>`, and `_GBWALL.BIN` must equal the GEO record CCGEO decodes.
  - Payload-provenance control: zero the selected GEO member in the staged copy and require `_GBWALL.BIN` to change.
  - Early `SKIP:` when DOSBox or the GOG install is absent. Enroll both in `$flowScripts`, so the sweep grows from 38 to 40.

**Risks:**
- Pools' MONCHA field offsets are unverified (decoded through `TREASURES_LAYOUT` by size match), so claim map entry only, not combat.
- If GBBOOT's `/B n` does not carry the entry for these profiles, the flow scripts need a `gbboot.asm` change. That waits for T3; land the standalone CCECL test first.
- Treasures `8X8D1` is a third tile format with only a TS decoder, so CCFP walls fall back to outline. The WGRD bridge is unaffected.
- `0x31` in Treasures stays recorded-only (zero reachable sites, per `treasures-short-menu-0x31-2026-10-07.md`).

---

## T2: Matrix Cubed real-data flow script, and GBBOOT pins for the retail set-5 route (rank 2, test-only)

**Goal.** Matrix Cubed enters the standing flow roster for the first time. The round-8 `0x4C` fix becomes an end-to-end GBBOOT claim instead of a CCECL-only one.

**Owner:**
- new `native/gbmatrix-flow-test.ps1`;
- the Matrix real-start block of `native/gbboot-test.ps1`;
- `native/ccecl-matrix-op4c-test.ps1` (tighten only);
- a new `tools/test_matrix_wallset_null.py`.

**Verified facts:**
- **Data:** present at `matrixcubed_extracted\BuckRogers2\c\Matrix`: ECL1, GEO1, WALLDEF1, 8X8D1, MON0CHA (no MON1CHA), MATRIX.CFG, SAVE.
- **GBBOOT gaps:**
  - GBBOOT presets `mapid 17` / `eclid 16`.
  - The real-start block asserts area `0x13` and that the wall equals GEO 17, but never checks GBLP=5 or whether `use_selected_geo_fallback` was taken.
  - The op4c test's `GBLP raw=[^\r\n]*0005` regex is loose.
- **No Matrix flow script exists:** no `gbmatrix` in `$flowScripts`.
- **Set 5 has no independent oracle:**
  - `tools/matrix_start_route.py` decodes LOAD_PIECES 5 using the same `uncertain` `0x4C`=2 frame CCECL now uses.
  - `matrix-cubed-start-route.md` "What is NOT established" #3/#4 lists no DOSBox or visual confirmation.

**The change:**
1. **`gbboot-test.ps1` Matrix block.** Add `Assert-GbEffectDump` for `GBLF operands=0011` and an exact GBLP set-5 field match (not a substring). Add an assertion that the GBBOOT transcript shows the effect-GEO path, not the fallback.
2. **`gbmatrix-flow-test.ps1`:**
   - stage a retail mirror through `New-RetailStage`;
   - boot, and require the effect-derived GEO 17 wall bridge;
   - payload control: zero the GEO-17 member in the staged GEO1 and require `_GBWALL.BIN` to change;
   - ECL control: zero block 19's `0x4C` operand bytes and require GBLF/GBLP to change or vanish;
   - early `SKIP:` when the extraction or DOSBox is absent;
   - enroll in `$flowScripts`.
3. **`test_matrix_wallset_null.py`.** Decode GEO 17's wall-index usage and each WALLDEF1 set's defined slot count. Require set 5 to cover every index GEO 17 uses, and report how many of the other sets also do. That count is the null: if every set covers them, the test proves nothing, and the doc must say so instead of claiming verification.

**Bytes:** none.

**RED→GREEN:**
- The new GBLP/fallback assertions are seen RED by running them against a CCECL built at `01d5f0db^`, where `0x4C`=0 and the route halts at `050B OP=00`.
- The flow's payload controls are seen RED with the comparison inverted, matching the precondition-6 practice.

**Risks:**
- Walking and events need the unresolved GEO-cell → `[0x4BF2]` dispatch, so claim "retail start reaches its map and wall set", not "playable".
- Retail Matrix combat is unproven: no COMBAT route is located, and MON0CHA is only a fallback.
- **Not in scope**, because they need `ccecl.asm`, which T1 owns:
  - `0x4B` is still zero-operand in CCECL, while the TS table and both binaries' handlers say 1;
  - `0x44`/`0x47`/`0x48`/`0x49`/`0x4A` halt;
  - none of the Matrix core-range overrides are applied.

  Queue them for the next CCECL owner, once T1's reclaim has landed.

---

## T3: GBBOOT, move the 11,113-byte GBCP checkpoint image out of the `.COM` (rank 3, capacity enabler)

**Goal.** Free roughly 10.8 KB of GBBOOT resident space, so GBPR 8 rows, more fallback/terminal arms, and the Treasures/Pools default entries stop being capacity-blocked. CLAUDE.md: "find the bytes first".

**Owner:**
- `native/src/gbboot.asm`;
- the `native-capacity:gbboot` pins;
- a new `tools/test_gbboot_checkpoint_segment.py` source contract.

**Verified facts:**
- The GBCP image, `checkpoint_header` through the sentinel, is one contiguous **11,113** bytes: 32 + 16 + `rest_fx` 5,750 + `rest_party` 2,476 + 258 + `checkpoint_timers` 2,572 + 8 + 1.
- It is read and written in one call (`checkpoint_read`/`checkpoint_write`) and checksummed as a whole.
- GBBOOT uses only AH=4Ah, in `shrink_mem`, which shrinks to `prog_end+STACKPAD`. AH=48h appears nowhere in `native/src`.
- `cpu 386` is already set.

**The change:**
- Remove the image from the emitted data. Raise `shrink_mem`'s paragraph count by 695 and place the image directly above the stack pad, so it stays owned by GBBOOT and is not freed to children.
- Address it through one segment register (FS): about 170 references get an `fs:` prefix (`rest_party` ~60, `checkpoint_header` ~55, `rest_fx` ~45, the `checkpoint_timers`/pose/owned/learn group ~30).
- Give `checkpoint_read`/`checkpoint_write` and the checksum a segment argument.
- Swap DS around the effect reads that land in `rest_fx`.
- Fix the stale `.matrix` comment in `use_selected_geo_fallback` while here (comment-only).

**Bytes.** Net **+10.8 KB** (about 170–300 bytes of new code). Measure with `pwsh -NoProfile -File native/build.ps1 -Target engine` and re-pin.

**RED→GREEN:**
- The new source-contract test requires that `rest_party`, `rest_fx` and `checkpoint_timers` are not emitted `times` buffers, and that GBBOOT `headroom_bytes` ≥ 8,000 in the regenerated manifest. It is RED today (462).
- **Behaviour proof:**
  - `native/gbboot-test.ps1 -EngineSmoke` must report the same PASS count as today (346, rc 0), with byte-identical `_GBCP*` files on every checkpoint/rest case;
  - every rest/camp/resume flow stays green (`gbdok-camp-rest-flow-test`, the CoK `cok*` gates through `tools/test_cok_native_*.py`).
- **Mutation control:** in a scratch copy, drop one `fs:` prefix on a `rest_party` write. A checkpoint case must go RED.

**Risks (medium):**
- Children get 11 KB less conventional memory. CCCOMBAT/CCECL resident ≈ 65 KB each, so this is well inside 640 KB, but check the VHD guest too.
- Moving only part of the image breaks its contiguity and checksum. Move all of it or none.
- Any missed reference silently reads DS garbage; that is what the mutation control and the byte-identical GBCP files are for.
- This does **not** decide the GBPR v3 schema. GBCP still embeds a 2,476-byte, 6-row image.

---

## T4: CCCOMBAT, DoK initiative exact for every round (rank 4)

**Goal.** DoK turn order matches retail for a whole combat, not only round 1.

**Owner:**
- `native/src/cccombat.asm` (only if a divergence is found);
- `native/cccombat-dokinit-test.ps1`;
- `tools/dok_initiative.py` (extend), plus its test.

**Verified facts:**
- `dok_init_round` re-rolls every round (from `begin_round`, when `party_dok==1`). The test builds expectations for round 1 only, and merely counts later order blocks. Its header says "later rounds interleave attack RNG draws the model does not simulate".
- So the round-2+ gap is in the **oracle**. Two engine assumptions are untested:
  1. `begin_round` collects only `is_active_si` rows. Retail gives not-in-combat rows `delay=0` with no draw, but keeps them in the sort, where zero ties cost coin flips. Whether dead or fled rows stay in retail's `+0xC8` team list is unverified.
  2. Retail rolls in team-list order (`DS:A2C6`, link `+0xB9`); CCCOMBAT uses array order.
- `/U` (`scan_surprise_arg`) is a test hook only. It has no live producer.

**The change:**
1. Extend `tools/dok_initiative.py` with a full RNG-stream replay across rounds: every attack, damage and coin draw, in the order CCCOMBAT consumes them. Mirror the LCG replay `cccombat-dqkai-test.ps1` / `dqk-combat-oracle.ps1` already use.
2. Add a no-death fixture, which does not exercise assumption 1, and assert every round's `N order …` lines.
3. Engine work only if (2) finds a divergence that a doc supports. Otherwise add only a disclosed **no-death** scope note.
   - Do not change dead/fled-row handling without a source read of the `+0xC8` list maintenance.

**Bytes:** 0 expected. At most about 40 if zero-delay inactive rows must stay in the sort, against 304 usable.

**RED→GREEN.** The round-2+ assertions are new and must first be seen RED:
- against a mutant that skips the `dok_surprise` clear (the round-2 delays shift by 6 for the surprised side);
- against a mutant that rolls enemies before party (ordering).

They then pass on the unmodified source, or on the fixed source if a divergence was found. The CoK/DQK traces stay byte-identical over `/T 0..60`.

**Risks:**
- Requiring "exact" across rounds depends on CCCOMBAT's own `rng_die` stream. Like 8b, this claims agreement with the retail *rule* under the native generator, not a byte-exact retail RNG.
- The surprise source remains untraced. Say so in the README.

---

## T5: CCHOST `/N`, validate like `/D`, and make a repeated join idempotent (rank 5)

**Goal.** The live NPC-join path cannot apply joins from a malformed, forged or non-final effect, and cannot kill a boot by replaying a join.

**Owner:**
- `native/src/cchost_npc.inc`;
- `native/cchost-npc-test.ps1`;
- a GBBOOT-level case added to `native/gbdqk-npc-join-test.ps1`.

**Verified facts:**
- `npc_apply` reads exactly `NPC_FX_LEN` = 116 bytes and checks only `GBEF`, version 2..15, and join count ≤ 8.
- It does not check status, GBHD reason, `FX_HAVE_NPC` (+6 bit 0x10), `FX_HAVE_SIDECAR` or the file length.
- The join offsets (+82/+84) are stable across v2..v15, so there is **no** offset bug.
- `/D`'s `validate_damage_v15_capacity` requires `GBEF_V15_LEN`, status 4, zeroed menu/text, and sidecar ⇔ reason 10.
- GBBOOT calls `/N` after the sidecar damage path whenever `FX_HAVE_NPC` is set, so loop records reach it.
- **Likely bug (unconfirmed).** `restore_fx_prefix` (`ccecl.asm`) restores the join table on menu/ack resumes (`resume_kind` 2/4/5). A join made before a MENU yield then reappears in the next effect. `/N` exits 3 (duplicate), and `apply_npc_joins` treats every exit other than 2 as fatal. A loop record whose period contains an ADD_NPC lists the id repeatedly, with the same exit 3.

**The change:**
1. Validate the full header the way `/D` does:
   - `FX_HAVE_NPC` must be set when the count is > 0;
   - the file length must match its version (a 116-byte "v15" is rejected);
   - sidecar ⇔ reason 10.
   - For reason 10, accept only a DQK roster (already required) and apply each distinct id once.
2. Treat a join whose NPC id is already on the roster as **already applied**: exit 0, roster unchanged.
   - This fixes the replay in CCHOST, which T5 owns, without touching `ccecl.asm` or `gbboot.asm`.
   - Retail evidence: `dqk-add-npc-full-party.md` shows a skipped join is silent in retail.

**Bytes:** CCHOST has 19,636 free. No pinned tool is affected.

**RED→GREEN in `cchost-npc-test.ps1`.** `New-Effect` builds only 5,750-byte v9 effects today; add v15 builders. Each of these exits 0 and appends a row today, and must become exit 1 with the roster byte-identical:
- (a) reason 10 without the sidecar flag;
- (b) the sidecar flag with reason 7;
- (c) `FX_HAVE_NPC` clear with count 1;
- (d) a 116-byte file stamped v15.

Further cases:
- (e) **Control:** a genuine status-4/sidecar/reason-10 record with one join stays exit 0.
- (f) **Duplicate join:** today exit 3; it must become exit 0 with the roster byte-identical.
- **GBBOOT case:** a join followed by a MENU yield and resume must not end at the exit-3 failure. Measure this first; if the duplicate does not reproduce, drop the case and record the null.

**Risks:**
- Making a duplicate idempotent could mask a genuine double-recruit bug in CCECL. Log the skip on stdout so a transcript shows it.
- Docs drift: `NATIVE-TASKS-2026-09-12.md` item 35 and the README `/N` bullet both still say GBBOOT never calls `/N`; correct both when this lands.

---

## T6: DQK `/R` creation through GBBOOT, byte-exact against the rules model (rank 6, test-only)

**Goal.** The GBBOOT `/R` front door gets the same byte-exact character-creation golden that CCPARTY-direct already has.

**Owner:** `native/gbdqk-create-test.ps1`.

**Verified facts:**
- The script never mentions `_GBDICE.BIN`. It still requires only HP > 0 and self-consistent, and its comment "/R cannot supply" dice has been stale since `0a889399`.
- `dq_dice_init` (`dqkcreate.inc`) opens `_GBDICE.BIN` from the current directory.
- The test's conf runs `D:` then `C:\GBBOOT … /R …`. GBBOOT changes directory only when `GAME\DQK.EXE` exists, so CCPARTY's current directory is `$run` (D:).
- `.create_arg` passes `/G /ID 3 /C NAME CLASS roster`, defaulting to race 6 and CON 15, which match the model flags.
- Each of the four execs reopens the dice file, so every member draws the same prefix.

**The change:**
- Write `$run\_GBDICE.BIN` (20 bytes).
- Per member, run `tools/dqk_character_rules.py --create NAME --class C --race 6 --con 15 --dice <hex> --out`.
- Require the 414-byte QCH to be byte-identical to the model output, and GBD1 meta+6 and +26 to equal the model `max_hp`.
- Second dice set: the model HP must differ (premise check), and the run must match it.
- Keep a no-file control in which HP is only required to be > 0.

**Bytes:** none.

**RED→GREEN.** RED against a CCPARTY built at `0a889399^` (timer dice cannot match both dice sets), or with the dice file renamed, as in the `-Mutate` trick in `ccparty-dqkdice-test.ps1`. GREEN on HEAD.

**Risk (low):**
- The dice are not the retail RNG (the `dqkcreate.inc` header says so). This makes the front-door golden reproducible; it does not make the dice retail-faithful.

---

## T7: Research (tools + docs only): pin the DQK AI-body facts and settle the `0x86DE` decode (rank 7)

**Goal.** Turn `dqk-npc-ai-body.md`'s READ claims into mutation-pinned facts, so a later CCCOMBAT round can implement one more rule (the stored-target drop is already in). Also resolve the disputed area-27 decode that blocks any natural Hulderfolk route.

**Owner:**
- `tools/dqk_npc_turn.py`, `tools/test_dqk_npc_turn.py`;
- `docs/engine/research/dqk-npc-ai-body.md`;
- `docs/engine/research/dqk-add-npc-route.md`.

**Verified facts:**
- `PINS` has 20 entries. None covers the AI-body addresses doc §7 step 5 proposes: `0x2EB87`, `0x22FA3`, `0x2907B`, `0x2E105`.
- The `0x86DE` instruction is read as `LOAD_PIECES` by `dqk-add-npc-route.md` §1, and as `CHECKPARTY` (`0x1E`, with `0x37` as operand data) by `HANDOFF-DOK-HP-2026-09-24.md`. Item 35 sides with the former, and nobody has re-checked it against the retail disassembly.

**The change:**
- Add pins (flip-one-byte mutation tests) for the four addresses.
- For the hold-back (`d100+[C2DE] >= [C6B8]`) and flee formulas, locate the writers of `C2DE`/`C6B8` and move them from READ-with-unsourced-inputs to DERIVED, or name the blocker.
- Decode `0x86DE` from DQK's own dispatch table (`2033:0d34` / file `0x032a54`, closed 2026-07-18) and fix whichever doc is wrong.

**Bytes:** none.

**RED→GREEN.** Each new pin goes RED under its byte mutation. "Done" means each named rule ends as DERIVED or names its exact blocker, and the `0x86DE` verdict is pinned by a test that decodes the bytes under DQK's table.

**Risk.** Medium for research yield, zero for the engine. Update the stale "236 free" capacity note in `dqk-npc-ai-body.md`; it is 432 now.

---

## Ranked summary

| Rank | Task | New capability | `native/src` owned | Byte effect |
|---|---|---|---|---|
| 1 | T1 | Pools and Treasures retail ECL → map entry (first real-data route for either) | `ccecl.asm` | CCECL +50..80 reclaim, then −45..70 (of 85 usable) |
| 2 | T2 | Matrix in the flow roster; retail set-5 route pinned end to end | none | none |
| 3 | T3 | GBBOOT +10.8 KB; unblocks GBPR 8 rows and new GBBOOT arms | `gbboot.asm` | GBBOOT **+~10,800** |
| 4 | T4 | DoK turn order exact beyond round 1 | `cccombat.asm` (if needed) | 0..−40 of 304 |
| 5 | T5 | `/N` hardened; join replay non-fatal | `cchost_npc.inc` | negligible |
| 6 | T6 | byte-exact DQK `/R` through the GBBOOT front door | none | none |
| 7 | T7 | DQK AI facts pinned; `0x86DE` settled | none | none |

## Deferred, and what has to come first

- **GBPR 8 rows (retail DQK cap 8).** After T3:
  - keep CCECL's CoK-only `cok_spell_rows` at 6 (growth about +34 instead of +150);
  - decide the GBPR v3 schema for the embedded 2,476-byte images (GBCP, GBMR/GBLR, GBDJ/GBTX, GBCR) and the Python readers pinned to 6.
  
  One owner per round.
- **DQK area-27 natural route.** After T7 settles `0x86DE`. The preconditions in `HANDOFF-DOK-HP-2026-09-24.md` (`[0x002D]&127`=1, `[0x009F]`=`[0x00BB]`=0, `[0x00A2]`=255) are not shown realizable from a retail save. A DQK arm in `accept_terminal_ecl_exit` keyed to `/@ 34526` would be a test acceptance, not a route. Do not add it as progress.
- **Matrix CCECL frames.** `0x4B`=1, `0x44`/`0x47`/`0x48`/`0x49`/`0x4A`, and the core-range overrides go to the next CCECL owner, after T1's reclaim.
- **DQK NPC AI rules in CCCOMBAT.** After T7. The 304 usable bytes are enough for one rule.
- **FRUA.** Item 24: no native `SCRIPT.GLB` event-page decoder and no start-module selection. The most that can be done now is a GBBOOT `/E` `.DSN` `GEOxxx.DAT` map preview with a marker mutation; no ECL, no play.
- **DoK surprise producer.** Untraced (`dok-initiative.md`).
- **DQK combat terrain** (`combat_hlib_groups` resolved, not consumed; item 9). Too large for CCCOMBAT's 304 bytes; it needs a separate renderer owner.

## Docs drift for the integrator (fix after merge)

- `CLAUDE.md` calls Treasures/Pools/Matrix/FRUA "boot-profile recognition only". That has been partly stale since synthetic combat flows and the retail Pools `SHORT_MENU` test landed; update it again after T1 and T2.
- `NATIVE-TASKS-2026-09-12.md`:
  - item 35 says no GBBOOT path calls `CCHOST /N` (stale since round 7);
  - item 113 is still ACTIVE, though `cok-monster-move.md` records it implemented (`a5823f0e`);
  - item 11 does not mention `fa959416`/`521bdd8c`/`7561d4a4` (CCSND `/P`, CCFP walk sound).
- `native/README.md`'s CCHOST `/N` bullet says "GBBOOT does not call it".
- The comment at `gbdqk-create-test.ps1` (":198-200") about `/R` not supplying dice (T6 fixes it).
- `gbboot.asm` `use_selected_geo_fallback` `.matrix` comment (T3 fixes it).
- `dqk-npc-ai-body.md` "236 free" (T7 fixes it).
