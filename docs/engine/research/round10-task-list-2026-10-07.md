# Round 10 native task list (2026-10-07)

Read-only task-finding pass on `greybox` at HEAD `f19a3174`. The newest `native/src` commit is
`cacffd79` (the DQK 8-row party). The working tree carries uncommitted web changes and two
uncommitted sweep artifacts (`native/flow-status.json`, `native/scripts-status.json`).
- Every figure below was re-derived from the tree, the manifest or `git log` on 2026-10-07.
- No DOSBox session was run. The only things executed were NASM-free Python reads and three
  read-only pytest files (results below).
- Code is cited by symbol name; line numbers are given only where a doc line is called stale.

## Starting state (measured)

### Capacity

`native/build/native-capacity.json` is **fresh**: its `native_source_sha256` `5364c124…` equals
`tools/test_native_capacity_claims.py::_native_source_hash()` on this tree.

| Tool | Emitted | Resident | Free | Floor | Usable |
|---|---|---|---|---|---|
| GBBOOT | 56,395 | 56,651 | 8,629 | 128 | **8,501** |
| CCCOMBAT | 64,608 | 64,864 | 416 | 128 | **288** |
| CCECL | 23,557 | 65,148 | 132 | 64 | **68** |
| CCFP | 22,224 | 58,878 | 6,402 | 0 | 6,402 |
| CCFLOW | 5,412 | 56,687 | 8,593 | 0 | 8,593 |
| CCHOST | 26,940 | 47,546 | 17,734 | 0 | 17,734 |
| CCPARTY | 25,803 | 26,059 | 39,221 | 0 | 39,221 |

Two capacity facts the earlier lists did not have:
- **CCCOMBAT carries 39,704 trailing zero bytes in its image** (measured on
  `native/build/cccombat.com`: the zero run starts at file offset 24,904). The largest single
  piece is `daxbuf times DAX_FILEMAX db 0` with `DAX_FILEMAX equ 32768`. Its 30 references all
  sit in the MON/HLIB/GLIB/DAX loader cluster (`load_mon_archive` and its neighbours). Turning it
  into `resb` would shrink the file but not the resident image, so the reclaim is a separate DOS
  block, as GBBOOT did for the checkpoint image (`d1330506`).
- **CCECL's resident image is mostly two buffers**: `blk resb BLKCAP` (16,000) and
  `compbuf resb DAXCOMP_CAP` (14,500). `compbuf` is overloaded (`seedbuf`, `rosterbuf`, `rbuf`,
  `fxhdr`, the serialized GBEF image and the inventory-continuation scratch all alias it), so it
  is the wrong one to move. `blk` has 42 references in `ccecl.asm`, plus 3 in `cokyield.inc` and
  2 in `cokresume.inc`, and its overlays `daxtoc`, `gptrs` and `idtab`. Neither `.inc` is
  included by any other tool. CCECL has no `AH=4Ah`/`48h` call today.

### Sweeps and gates

- **Committed artifacts are stale against `native/src`.** `git show HEAD:native/flow-status.json`
  records 41/0/0 and `HEAD:native/scripts-status.json` 43/0, both with
  `native_src_commit c9c74c85`. `cacffd79` touched `native/src` after that, so by the freshness
  rule in `tools/test_native_flow_status.py` the committed copy is stale. That was not run
  against the committed copy; it follows from the rule.
- **The uncommitted re-sweep on `cacffd79` is not green.** The working-tree artifacts record:
  - flow **40 PASS / 1 FAIL of 41** (run 15:33–15:54Z);
  - scripts **43 PASS / 1 FAIL of 44** (run 15:54–16:04Z; the 44th is `cccombat-party8-test`).
  - Both FAILs carry the same needle, `Item query helper mismatch`, raised from
    `native/item-query-fixtures.py` `verify` as `AssertionError: VM3`. The scripts are
    `ccinv-item-query-test.ps1` and `gbboot-create-test.ps1`; the second runs the first.
- **Cause, read from source** (it is a regression from `cacffd79`, not flake). VM3 is a v6 GBPS
  seed with `PS_COUNT_OFF` set to 7, and the fixture requires CCECL to reject it with
  `bad or unsupported party seed`. `cacffd79` changed both count checks in `read_seed_file`
  (the `.version6` and `.timers` branches) from `6` to `PARTY_ROWS_MAX` (8). A count-7 v6 seed is
  now accepted.
  - v6 seeds are CoK-only: GBBOOT's seed writer sets version 5 for `game_cok` "CCINV publishes v6
    after writing the prefix".
  - `docs/engine/research/gbpr-8-row-design.md` names the exposure under "Caveats" ("CCHOST and
    CCECL accept 7..8 rows for any title if handed such a file directly") but did not see that it
    breaks an existing negative case.
- **Gate status with the working-tree artifacts.** Running `pytest tools/test_native_flow_status.py
  tools/test_native_gate_coverage.py tools/test_native_test_ownership.py` gives **73 passed, 1
  failed**. The failure is `LiveGateTests::test_readme_agrees_with_artifact_both_ways`, with
  `(i-a)`/`(i-b)`: `native/README.md` narrates `gbboot-create-test.ps1` in eight passages and
  discloses the FAIL in none of them. The gate is working as designed.
- `find_gated_native_scripts()` returns **12** (11 DOSBox flow gates plus `build.ps1`).
  `native/test-ownership.json` holds **118** entries, and the ownership test pins 118.

### What rounds 9/10 landed (verified by commit)

| Item | Landed | Commit(s) |
|---|---|---|
| CCHOST `/N` validation and idempotent duplicate | yes | `5bd60d15` |
| CCECL short2 dialect, Pools #18 / Treasures #20 (standalone CCECL flows only) | yes | `c9c74c85` |
| GBBOOT checkpoint image in an FS block (`rest_party` stays resident) | yes | `d1330506`, `8a0dfc82` |
| Matrix flow, `/R` byte-exact dice | yes | `044a271d` |
| T7 AI-body pins; `0x86DE` = `LOAD_PIECES` | yes (tools + docs) | `f62ef29d`, `a60af412` |
| DQK 8 GBPR rows | yes, **with the VM3 regression above** | `cacffd79`, `f19a3174` |
| DoK initiative rounds ≥2 (round-9 T4) | **no** | the test header still reads "Round-1 only is compared exactly" |
| `use_selected_geo_fallback` `.matrix` comment fix (round-9 T3) | **no** | the stale comment is still in `gbboot.asm` |

### Known open items, and how each was resolved

| Item | Verdict |
|---|---|
| DoK initiative rounds ≥2 | **T5**, unchanged in substance from round 9. |
| Move `rest_party` (2,476) out of resident GBBOOT | **Defer.** GBBOOT has 8,501 usable bytes and no queued GBBOOT task needs more than about 400 of them. `rest_party` has 71 references and is addressed with raw pointers by the rest/memorize code (README round 9). Do it only when a GBBOOT change needs more than about 8 KB. |
| Matrix `0x4B` operand count | **T7.** Both binaries' handlers read **1** operand set for `0x4B` and **2** for `0x4C`, Countdown as well as Matrix (`matrix-ecl-dialect.md` §5). CCECL frames `0x4B` as zero for both, and frames `0x4C` as two only under `MATRIX.CFG`. Reachability must be measured first. |
| DQK area-27 terminal route | **Still blocked**, but the blocker can be attacked statically → **T9** (tools only). `dqk-area27-86de-decode.md` settles the opcode and leaves the entry state open. The only retail DQK save held is `SAVE\SAVGAMA.QSV` (the root also has `SAVGAMA.QSV`). |
| First-person encounter-art placeholder | **T6.** CCFP's `draw_effect_setup` draws the GBIM frame only when `graphics_alt_enabled` is set, and GBBOOT's `prepare_alt_graphics` builds the setup-picture GBIM only inside the `/G 2` Amiga branch (`find_amiga_cpic`). A DOS (`/G 1`) player always sees the distance marker, although `find_dos_cpic` and the CGB DOS tail already exist for combat icons (`prepare_combat_graphics`). |
| Per-category graphics parity | T6 closes first-person encounter art. DQK combat terrain (`combat_hlib_groups` resolved, never consumed) is **T8**, after the CCCOMBAT reclaim in T3. |
| Weakest title depth (capability, not effort) | **Pools, Treasures, Gateway (DOS) and FRUA have no GBBOOT boot-to-map route on retail data.** Pools and Treasures retail installs fall into GBBOOT's `.entry34` default (mapid/eclid 34), not their init blocks 18/20. Their round-9 flows run CCECL standalone and never call GBBOOT. Gateway DOS ships `ECL2..6`/`GEO2..6` and no `ECL1`/`GEO1`, so GBBOOT's ECL1+GEO1 check sends it to preview. Its proven new-game entry is `ECL2.DAX#1` (`gateway-newgame-route.md`). FRUA `/E` is fail-closed by design (ledger item 24), but CCGEO already normalizes `.DSN\GEOxxx.DAT`. → **T4**, **T11**. |

---

## Partition

### `native/src` ownership per batch (no file shared inside a batch)

| Batch | Task → `native/src` files |
|---|---|
| **1** | T1 → `ccecl.asm` (`read_seed_file` only) · T3 → `cccombat.asm` · T4 → `gbboot.asm` · T5a, T7a, T9, T12 → none |
| **2** | T2 → `ccecl.asm`, `cokyield.inc`, `cokresume.inc` · T6 → `gbboot.asm`, `ccfp.asm` · T5b → `cccombat.asm` (only if T5a finds a divergence) · T10a → none |
| **3** | T7b → `ccecl.asm` · T8 → `cccombat.asm` · T11 → `gbboot.asm` (and `ccfp.asm` only if needed) |
| **4** | T10b → `ccecl.asm` (only if T10a reproduces an overflow with retail names) |

`cokrng.inc` is included by both CCECL and GBBOOT, so no task here may edit it.

### DOSBox vs web-only

- **No DOSBox; can run beside a web-only workflow:** T5a's model work (developed against traces
  that already exist), T7a, T9, T12. The source-contract and capacity halves of T2 and T3 also
  need no DOSBox: NASM plus `native/build.ps1 -Target engine` (3 s).
- **Needs DOSBox:** T1, T2, T3, T4, T5 (verification), T6, T7b, T8, T10, T11. Only one DOSBox
  owner at a time. Suggested queue: **T1 → T4 → T3 → T5 → T6 → T2 → T7b → T10a → T8 → T11**,
  with one flow and one scripts sweep after each batch merges.

### Merge hotspots (append-only; the integrator reconciles)

- the `native/test.ps1` rosters (`$flowScripts` 41, `$scripts` 44);
- `native/test-ownership.json` and its pin of 118;
- `native/README.md`;
- the `<!-- native-capacity:… -->` pins in `GOAL.md`, `native/README.md` and
  `docs/engine/NATIVE-TASKS-2026-09-12.md`.

---

## T1: Fix the 8-row regression in CCECL's v6 seed check, then re-sweep (rank 1)

**Why.** Two standing-roster scripts are red on the newest engine source, so the 8-row round is
not green. The status artifacts that would prove it are uncommitted, and the README-agreement gate
fails on them.

**Owns:**
- `native/src/ccecl.asm`, the `read_seed_file` `.version6` branch only;
- `native/item-query-fixtures.py` (positive control only);
- the two status artifacts;
- the `gbboot-create-test` disclosure in `native/README.md`.

**Change.**
- Restore `cmp word [seedbuf+PS_COUNT_OFF], 6` in the `.version6` branch. v6 is the CoK
  owned-inventory seed; GBBOOT writes v5 for `game_cok` and CCINV publishes v6.
- Leave `.timers` (v5) at `PARTY_ROWS_MAX` **unless** the agent shows from GBBOOT's seed writer
  that v5 is never produced for DQK. `timer_state==1 && timer_count>0` is not title-gated in that
  writer, so a DQK v5 with 7–8 members has to be treated as possible until proven otherwise.
- Add a DQK-style 8-member v5 positive control if v5 stays at 8.

**RED→GREEN.**
- `ccinv-item-query-test.ps1` is RED today (`AssertionError: VM3`) and must go GREEN.
- `gbboot-create-test.ps1` turns GREEN with it.
- Controls:
  - `cccombat-party8-test`, `gbdqk-npc-join-test` and `cchost-npc-test` stay GREEN, since DQK
    rosters never use v6 seeds;
  - one-variable check: the same fixture against a CCECL built at `cacffd79^` is GREEN, which
    proves the fixture is unchanged and the engine moved.
- Then run `native/run-flow-suite.ps1` and the `$scripts` sweep. Commit both artifacts with a
  README disclosure, so the gate is green on a committed artifact again.

**Bytes.** 0 (an immediate operand only). CCECL stays at 132 free. **DOSBox: yes.**
**Depends on:** nothing.

**Risk:** low. If v5 also needs the 6 cap, it must be gated by title, and CCECL has 68 usable
bytes. Measure before adding a title gate.

---

## T2: CCECL capacity reclaim: move `blk` (16,000 bytes) into its own DOS block addressed through FS (rank 2, enabler)

**Why.** CCECL has **68 usable bytes**, and every queued ECL behaviour is byte-blocked behind them:
`0x4B`/`0x4C` frames, further Matrix and Buck opcodes, ledger item 12's CALL effects, and the
item-25 continuation. "Find the bytes first" applies most sharply here.

**Owns:**
- `native/src/ccecl.asm`, `native/src/cokyield.inc`, `native/src/cokresume.inc`;
- a new `tools/test_ccecl_blk_segment.py` source contract;
- the `native-capacity:ccecl` pins.

**Change.**
1. At startup, shrink CCECL's own block to 64 KB with `AH=4Ah`. The stack is anchored at
   `0FFFEh`, so the shrink must not cut it.
2. Allocate 1,000 paragraphs with `AH=48h` into FS. Fail with a clear exit code if it is refused.
3. Re-point `blk` and its overlays (`daxtoc`, `gptrs`, `idtab`) to `FS:0`.
4. Convert the 47 references to `fs:` (VM fetch `[blk+si]`, `read_opp`, the header vaddr reads,
   the fixed-offset CoK probes such as `[blk+19d3h]`, and the `.inc` sites).
5. Swap DS around the DOS reads into `blk` in `load_block`, `load_dax_block` (the RLE target
   `di`) and `load_gen2_block`.
6. Keep `compbuf` where it is.

**RED→GREEN.**
- The new contract test requires `blk` not to be a `resb` in the image and requires CCECL
  `headroom_bytes` ≥ 8,000 in the regenerated manifest. It is RED today (132).
- **Behaviour proof:** every `ccecl-*` script, the CCECL-driven flows and the 11 gated `cok*`/CCECL
  corpus gates stay GREEN, with byte-identical GBEF/GBSX dumps on their goldens.
- **Mutation control:** in a scratch copy, drop one `fs:` prefix on the VM fetch. A trace must go
  RED.

**Bytes.** Net about +15,700 (about 150–300 bytes of new code). **DOSBox: yes** for the behaviour
proof; the contract and build steps need none.

**Depends on:** T1 merged (same file).

**Risk: medium.**
- A missed reference silently reads DS garbage. The mutation control and byte-identical dumps are
  the guard.
- Children of CCFLOW and GBBOOT get 16 KB less conventional memory. That is well inside 640 KB,
  but check the VHD guest path (`native/release-manifest.json`).

---

## T3: CCCOMBAT capacity reclaim: move `daxbuf` (32,768 bytes) out of the image (rank 3, enabler)

**Why.**
- CCCOMBAT has 288 usable bytes, yet it ships 39,704 zero bytes.
- With 32 KB back, DQK combat terrain (T8), further retail AI rules and DoK initiative fixes stop
  competing for the last few hundred bytes.

**Owns:**
- `native/src/cccombat.asm`;
- a new `tools/test_cccombat_daxbuf_segment.py`;
- the `native-capacity:cccombat` pins.

**Change.**
- Shrink with `AH=4Ah`, then allocate 2,048 paragraphs with `AH=48h`.
- Address `daxbuf` through FS (or a DS swap inside the loader cluster). All 30 references are in
  the MON/HLIB/GLIB/DAX loaders.
- Optionally convert the trailing `times … db 0` tables after `daxbuf` to `resb`. That shrinks the
  file only, and the README must say so.

**RED→GREEN.**
- The contract test requires `daxbuf` not to be an emitted buffer and CCCOMBAT headroom ≥ 16,000.
  It is RED today (416).
- **Behaviour proof:** byte-identical `_GBCOMB.TRC` over `/T 0..60` plus the `/E` configs.
  `cccombat-test`, `cccombat-glib-moncha-test` (the GLIB/HLIB MONCHA paths are the `daxbuf` users),
  `cccombat-party8-test`, `cccombat-dokinit-test`, `cccombat-dqkai-test`,
  `gbdqk-combat-flow-test` and the CoK `cokcombat-rng` gate all stay GREEN.
- **Mutation:** drop one segment override in the HLIB walk. The GLIB MONCHA test must go RED.

**Bytes.** About +32,000. **DOSBox: yes.**

**Depends on:** none (batch 1). T5b and T8 wait for it.

**Risk: medium.** The same missed-reference class as T2. CCCOMBAT writes the VGA frame from
`DS=A000` (`dump_view_raw`), so any helper that assumes DS=CS must be checked.

---

## T4: GBBOOT retail starts for Pools (ECL1#18), Treasures (ECL1#20) and Gateway DOS (ECL2#1), each with a boot-to-wall flow (rank 4, title depth)

**Why.** This is the largest capability gain per byte. Three titles go from "CCECL standalone or
preview" to "GBBOOT boots the retail install into its real first map".
- Today, retail Pools and Treasures boot GBBOOT's `.entry34` smoke start.
- Gateway DOS cannot pass the ECL1+GEO1 check at all.

**Owns:**
- `native/src/gbboot.asm` (the entry selector after `.not_matrix`, plus a Gateway `ECL2`/`GEO2`
  branch);
- the stale `.matrix` comment in `use_selected_geo_fallback` (comment only; round-9 T3 left it);
- new flow scripts `native/gbpools-flow-test.ps1`, `native/gbtreasures-flow-test.ps1` and
  `native/gbgateway-dos-flow-test.ps1`.

**Change.**
- Mirror the Matrix pattern: if `gamep` is `game_pod`/`game_treasures` and `dax_has_block 18`/`20`
  succeeds, set `eclid` to the init block and take the GEO from CCECL's `GBLF`.
- Synthetic fixtures without those blocks keep entry 34, so `gbbroader-flow-test` is unchanged.
- For `game_gateway`: when `ECL2.DAX` and `GEO2.DAX` exist and `ECL1.DAX` does not, start ECL2
  block 1. Gateway has no marker in `select_operand_dialect`, so CCECL uses base frames.
  Gateway's binary-measured deltas (`0x32`, `0x40` = 4 operand sets) are unreached in its corpus
  (`disassemble.ts` `ECL_GEN1_SHORT_GATEWAY` notes).
  - **Measure first** with a standalone CCECL trace on `ECL2.DAX#1`.
  - If it desyncs, stop and hand the frame to the next CCECL owner instead of patching
    `ccecl.asm`.

**RED→GREEN, per title, on a `New-RetailStage` copy:**
- the GBBOOT transcript names the init block (18/20/ECL2#1), not 34. It is RED today;
- `_GBWALL.BIN` equals the CCGEO decode of the GEO named by the effect's `GBLF`;
- payload control: zero that GEO member in the stage and require `_GBWALL.BIN` to change;
- marker control: remove `POOL4.CFG`/`TREASURE.CFG` and require the trace to change;
- early `SKIP:` without DOSBox or the GOG install;
- enroll all three in `$flowScripts` (41 → 44).

**Bytes.** About 80–150 of 8,501 usable. **DOSBox: yes.** **Depends on:** none.

**Risk:**
- Claim map entry only. Pools' MONCHA offsets are unverified, and Treasures `8X8D1` is a third tile
  format with a TS decoder only, so CCFP walls may fall back to outline. The WGRD bridge is
  unaffected.
- If Gateway's `ECL2#1` needs Hop-1 dynamic guards (`[0x7ED5]`), the route may legitimately stop at
  the selector. Pin what it reaches and claim no more.

---

## T5: DoK initiative exact beyond round 1, through an RNG-stream replay oracle (rank 5)

**Why.** DoK turn order is retail-exact for round 1 only. `cccombat-dokinit-test.ps1` header:
"Round-1 only is compared exactly (later rounds interleave attack RNG draws the model does not…".

**Owns:**
- T5a: `tools/dok_initiative.py` and its test, `native/cccombat-dokinit-test.ps1`.
- T5b: `native/src/cccombat.asm`, only if a divergence is found.

**Change.**
- **T5a.** Extend the oracle with a full replay of CCCOMBAT's own LCG (`rng_die` /
  `rng_state`). Every attack, damage and coin draw is consumed in CCCOMBAT's order, mirroring
  `native/dqk-combat-oracle.ps1`, which already aligns the LCG offset uniquely.
- Add a no-death fixture and assert every round's `order` lines.
- **T5b.** Change the engine only if T5a finds a divergence that a doc supports. Candidates:
  `begin_round` collecting only active rows versus retail's zero-delay inactive rows; array order
  versus team-list order (`DS:A2C6`, link `+0xB9`).

**RED→GREEN.** The new round-≥2 assertions must be seen RED first:
- against a mutant that skips the `dok_surprise` clear;
- against a mutant that rolls enemies before the party.

They then pass on the unmodified source (or on the fixed one). The CoK/DQK traces stay
byte-identical.

**Bytes.** 0 expected. At most about 40 of 288 (T5b).

**DOSBox:** T5a's model work runs on existing traces with no DOSBox; its verification needs
DOSBox.

**Depends on:** T5b waits for T3 (same file).

**Risk.** This claims agreement with the retail *rule* under the native generator, not
retail-RNG byte identity (the same disclosure as 8b). The surprise producer stays untraced.

---

## T6: DOS first-person encounter art: replace the approach-marker placeholder under `/G 1` (rank 6, graphics parity)

**Why.** The placeholder is documented as "until native CPIC/sprite encounter art exists"
(README, CCFP `/E` paragraph). Amiga players get the GBIM frame; DOS players get a box. The DOS
CPIC decode path already exists (`find_dos_cpic` plus CGB `/B id /I out FILE.DAX`), built for
combat icons.

**Owns:**
- `native/src/gbboot.asm` (`prepare_alt_graphics` `.image`: add a DOS branch after the Amiga one
  when `enginep==eng_dax_gen1` and `texflag`; also append `/I` to the CCFP tail when only the DOS
  image is ready);
- `native/src/ccfp.asm` (`draw_effect_setup`: stop requiring `graphics_alt_enabled` when a valid
  `gbim` matches `effect_setup_pic`);
- a new `native/gbfp-encounter-dos-test.ps1`.

**RED→GREEN.**
- A CoK (or DoK) route with a v7 `GBES` setup tail under `/G 1` and `/S _GBVIEW.RAW`: the centre
  region must equal the CGB-decoded CPIC GBIM composited with colour 0 transparent (2x when near).
  It is RED today: the marker is drawn.
- Controls:
  - zero the staged CPIC block and require the frame to change (payload provenance);
  - `/G 2` frames byte-identical to the previous build;
  - a route with no `GBES` tail byte-identical;
  - the VM/pose/RNG/party bytes unchanged across `G` toggles.

**Bytes.** GBBOOT about 60–120 of 8,501. CCFP about 10–30 of 6,402. **DOSBox: yes.**

**Depends on:** T4 merged (same `gbboot.asm`).

**Risk.**
- `find_dos_cpic` uses `fxbuf` as scratch, so keep it ahead of the effect read, as
  `prepare_combat_graphics` does.
- CCFP's `step_sound` is skipped while `gbim_valid` is set. DQK is unaffected (no DAX CPIC), but
  the README must say so.

---

## T7: `0x4B` (and Buck `0x4C`) operand frames in CCECL (rank 7)

**Why.** Both binaries' handlers read one operand set for `0x4B` and two for `0x4C`, in Countdown
as well as Matrix (`matrix-ecl-dialect.md` §5, rows `0x4b`/`0x4c`, "agree"). CCECL frames `0x4B`
as zero everywhere and `0x4C` as two only under `MATRIX.CFG`. Its own header comment still says
the three are "observed only as zero-operand".

**Owns:**
- T7a (tools only): a new `tools/buck_matrix_ext_frames.py` plus its test;
- T7b: `native/src/ccecl.asm` (the two dispatch sites: the `op_*` dispatcher and the skip-frame
  path near `.sk_not_4c`), plus a new `native/ccecl-matrix-op4b-test.ps1`.

**Change.**
- **T7a.** Count reachable `0x4B`/`0x4C` sites in Buck and Matrix `ECL1.DAX` under the TS
  `ECL_GEN1_BUCK`/`ECL_GEN1_MATRIX` tables, with zero versus measured frames. Report the desync
  delta (that is the null).
- **T7b.** Gate `0x4B`=1 (and Buck `0x4C`=2) only where T7a shows reachable sites that decode
  cleanly under the measured frame.

**RED→GREEN.** For the first reachable site, a standalone CCECL trace's next PC must match the TS
disassembly. It is RED with zero frames.
- Controls: the Matrix `0x4C` route (`gbmatrix-flow-test`, `ccecl-matrix-op4c-test`) and the Buck
  flows (`gbbuck-flow-test`, `ccecl-buck-short-menu-test`) stay GREEN or change only where
  predicted.
- If T7a finds **zero** reachable sites, do not change the engine. Record the null instead: a
  synthetic-only fix would be effort, not capability.

**Bytes.** About 12–25 of 68 usable. If Buck changes too, reuse the existing `op_buck_ext_one`/two
labels (about 0–10).

**DOSBox:** T7a no; T7b yes. **Depends on:** T7b after T2 (same file). T7a can start now.

**Risk.** Buck goldens may move. Each moved golden needs a decoder-derived justification, not a
recapture.

---

## T8: DQK combat terrain: consume the resolved DUNGCOM/WILDCOM groups (rank 8, graphics parity)

**Why.** Ledger item 9 and `disclosure-artifacts-must-carry-the-gap`: DQK fights on a blank field.
CCCOMBAT resolves `combat_hlib_groups` (packed low nibble DUNGCOM, high nibble WILDCOM) and never
reads it again.

**Owns:**
- `native/src/cccombat.asm`;
- a new `native/cccombat-dqk-terrain-test.ps1`.
- CCHLIB `S <master> <id> <dir>` already exports one exact leaf, so the art source exists.

**RED→GREEN.**
- A DQK area-2 member-2 route (`LOAD_FILES #2, choice+1`, combat context CA03) under CCCOMBAT `/V`
  raw dump: the field cells must carry pixels from the selected DUNGCOM group. It is RED today (a
  blank field).
- Controls:
  - mutate the staged group member and require the frame to change;
  - CoK/DoK frames byte-identical;
  - group 0 ("none") frame byte-identical to today.

**Bytes.** Estimated 500–1,500 of CCCOMBAT. **Not affordable until T3 lands.** **DOSBox: yes.**

**Depends on:** T3.

**Risk: medium-high.** The DQK combat cell→tile mapping is not documented in this repo. Scope it to
"selected group pixels appear" and state that the cell layout is not verified against retail.

---

## T9: DQK area-27 entry state: can a natural route reach it from the retail save? (rank 9, tools only)

**Why.** The area-27 Hulderfolk `ADD_NPC` route is blocked only on its entry state:
`[0x002D]&127`=1, `[0x009F]`=`[0x00BB]`=0, `[0x00A2]`=255 (`HANDOFF-DOK-HP-2026-09-24.md` and
`dqk-area27-86de-decode.md`, "Consequence"). That is decidable statically.

**Owns:** a new `tools/dqk_area27_entry_state.py`, its test, and a new research note.

**Change.**
- Decode `SAVGAMA.QSV`'s ECL memory cells.
- Census every writer of `0x002D`, `0x009F`, `0x00BB` and `0x00A2` across DQK `ECL.GLB` under the
  Gen2 dialect.
- Classify each writer as reachable or unreachable from the save's area by decoded `NEWECL`
  chains, or name the dynamic guard that stops the chain.

**Done** means a pinned verdict:
- (a) a decoded chain from the save reaches area 27 in the required state → the route unblocks for
  a later GBBOOT owner; or
- (b) the exact unresolved guard is named.

Either way, mutation-pin the decoded writer bytes.

**Bytes:** none. **DOSBox: no.** **Depends on:** none.

**Risk.** Research yield only. Do **not** add a GBBOOT terminal arm keyed to `/@ 34526`: that would
be a test acceptance, not a route.

---

## T10: Eight-member WHO menus: does the 128-byte GBMT text cap overflow? (rank 10)

**Why.** An unverified caveat of the 8-row design: "GBMT's 128-byte text cap could overflow with
eight long names in a WHO menu". The source shows the bound.
- `MENU_TEXT_CAP equ 128`, and each name costs `1 + len` (len ≤ 15). Eight 15-letter names fill
  exactly 128.
- A Gen2 inline prompt in `menu_textbuf` before the names would push the total past 128.
- The overflow path sets `menu_text_overflow` rather than corrupting memory, but what the player
  then sees is unmeasured.

**Owns:**
- T10a: a new `native/ccecl-dqk-who8-test.ps1` (tests only).
- T10b: `native/src/ccecl.asm`, only if needed.

**RED→GREEN.**
- **T10a** first measures an 8-row DQK roster with the real NPC names CCHOST `/N` produces and a
  Gen2 WHO with its prompt. Either it fits (record the null and close the caveat), or it overflows.
- If it overflows, T10b must produce a defined, disclosed behaviour (for example truncation with a
  marker) that is seen RED first.

**Bytes.** 0 for T10a. T10b about 10–40, only after T2. **DOSBox: yes.**

**Depends on:** T10b after T2 and not in T7b's batch.

**Risk:** low.

---

## T11: FRUA design-selected map preview through GBBOOT (rank 11, weakest title)

**Why.** FRUA is the least-supported title: boot recognition, with `/E` fail-closed (ledger item 24).
CCGEO already validates and normalizes `.DSN\GEOxxx.DAT` (`FORM`/`AMOD`) into WGRD, with a HEIRS
`GEO005.DAT` byte check. What is missing is a user-chosen design and start module.

**Owns:**
- `native/src/gbboot.asm` (a design argument; it stays fail-closed for events and `SCRIPT.GLB`);
- `ccfp.asm` only if the preview path needs it;
- a new `native/gbfrua-dsn-flow-test.ps1`;
- a tools step that derives the start module from `GAME001.DAT` (`hackdocs_extracted/GAMEDAT.TXT`
  first).

**RED→GREEN.**
- `GBBOOT /E` with a design argument on a staged HEIRS copy reaches CCFP with `_GBWALL.BIN` equal to
  the CCGEO normalization of the start module's `GEOxxx.DAT`. It is RED today (fail-closed).
- Controls:
  - a marker mutation of that `GEOxxx.DAT` changes the wall;
  - without a design argument, GBBOOT stays fail-closed with today's message;
  - `DISK3\GEO.GLB` is never treated as DQK data.

**Bytes.** About 200–400 of 8,501. **DOSBox: yes.**

**Depends on:** T4 and T6 merged (same `gbboot.asm`). The start-module derivation can start now.

**Risk.** If `GAME001.DAT` does not name the start module unambiguously, ship the preview with an
explicit module number and say that start-module selection remains open. Claim map only: no
events, no ECL.

---

## T12: Ledger and docs reconciliation (rank 12, docs only)

**Owns:** the doc lines listed under "Stale docs" below. It does not touch `gbboot.asm` (T4 owns
that comment) or the `gbboot-create-test` README disclosure (T1 owns that).

**Done:** every listed line is corrected or carries a dated retraction. `pytest
tools/test_docs_claims.py tools/test_prose_wiring_claims.py tools/test_native_readme_subject.py
tools/test_native_flow_status.py` stays GREEN.

**Bytes:** none. **DOSBox: no.** **Depends on:** run it after T1's sweep, so the status prose
quotes a committed artifact.

---

## Ranked summary

| Rank | Task | New capability | `native/src` owned | Byte effect (usable) | DOSBox | Batch |
|---|---|---|---|---|---|---|
| 1 | T1 | 8-row round actually green; committed sweep fresh again | `ccecl.asm` (`read_seed_file`) | CCECL 0 (68) | yes | 1 |
| 2 | T2 | CCECL +~15.7 KB, unblocks every ECL feature | `ccecl.asm`, `cokyield.inc`, `cokresume.inc` | CCECL **+~15,700** | yes | 2 |
| 3 | T3 | CCCOMBAT +~32 KB, unblocks terrain and AI | `cccombat.asm` | CCCOMBAT **+~32,000** | yes | 1 |
| 4 | T4 | Pools, Treasures and Gateway DOS boot into their real first map | `gbboot.asm` | GBBOOT −80..150 (8,501) | yes | 1 |
| 5 | T5 | DoK turn order exact after round 1 | `cccombat.asm` only if needed | 0..−40 (288) | model no / verify yes | 1 (5a), 2 (5b) |
| 6 | T6 | DOS players see encounter art in first person | `gbboot.asm`, `ccfp.asm` | GBBOOT −60..120, CCFP −10..30 | yes | 2 |
| 7 | T7 | `0x4B`/`0x4C` frames per both binaries, or a recorded null | `ccecl.asm` (T7b) | CCECL −12..25 | 7a no / 7b yes | 1 (7a), 3 (7b) |
| 8 | T8 | DQK combat terrain drawn from DUNGCOM/WILDCOM | `cccombat.asm` | −500..1,500 (after T3) | yes | 3 |
| 9 | T9 | Area-27 route unblocked, or its exact blocker named | none | none | no | 1 |
| 10 | T10 | 8-member WHO menu behaviour measured (and fixed if needed) | `ccecl.asm` (T10b only) | 0 / −10..40 | yes | 2 (10a), 4 (10b) |
| 11 | T11 | FRUA renders a user-chosen design's start map | `gbboot.asm` | −200..400 | yes | 3 |
| 12 | T12 | Ledger matches the tree | none | none | no | after T1 |

## Deferred, and why

- **Move `rest_party` out of resident GBBOOT.** Not needed while 8,501 bytes are usable. It costs a
  rewrite of the rest/memorize code's raw-pointer addressing.
- **DQK NPC AI beyond the target pick.** The spell ladder evaluators, `canReachTarget` and the rest
  are still unread (`dqk-npc-ai-body.md` §6). After T3 there are bytes, but no verified rule.
- **DoK surprise producer.** Untraced (`dok-initiative.md`).
- **CoK dying countdown (ledger item 36), ECL CALL effects (item 12), the item-25 lossless
  continuation.** All need CCECL bytes first (T2). Each is a source-trace-first task.
- **Matrix `0x44`/`0x47`/`0x4A`.** Both binaries classify them `no_far_call`, so they are
  unmeasured, not merely unimplemented.

## Stale docs noticed (file:line)

- `CLAUDE.md:662-665` lists Treasures, Pools, Matrix and FRUA under "Boot-profile recognition only,
  nothing else established". Pools and Treasures have retail standalone-CCECL flows
  (`c9c74c85`), and Matrix has `gbmatrix-flow-test` (`044a271d`).
- `CLAUDE.md:676-686` quotes the 36/36 and 28/28 sweep as the latest. The committed artifacts are
  41/41 and 43/43 at `c9c74c85`, and the uncommitted ones on `cacffd79` are 40/1 and 43/1.
- `CLAUDE.md:1248-1249` says the ownership registry "pins 103 entries". It pins 118.
- `native/README.md:3715-3729` (CCHOST `/N` bullet) has three stale statements:
  - "appends it to a DQK v2 compact roster of at most 6 rows" (the cap is 8 since `cacffd79`);
  - "3 duplicate NPC" (a duplicate exits 0 since `5bd60d15`);
  - "It is a standalone mode: GBBOOT does not call it" (`:3726`; GBBOOT calls it since round 7).
- `native/README.md:4905` says "The sweep's docstring that the init block is the lowest clean id is
  wrong for Pools". `tools/gen1_init_block_sweep.py:8-12` already says the opposite, so the README
  sentence is now stale.
- `native/README.md:4915` says "the flow and scripts sweeps on this source are recorded in their
  status artifacts". The committed artifacts predate this source, and the uncommitted ones record
  one FAIL each (T1).
- `docs/engine/NATIVE-TASKS-2026-09-12.md:25` says "HLIB stays on direct `CCECL`". GBBOOT routes
  DQK through CCFLOW since `e41acd98`.
- `docs/engine/NATIVE-TASKS-2026-09-12.md:1372-1390` (item 35) has two stale statements:
  - "no GBBOOT or live-play path calls `CCHOST /N`";
  - "exit codes 2 full, 3 duplicate".

  Both are superseded by rounds 7, 9 and 10. The round-9 list flagged this, and it is still
  uncorrected.
- `docs/engine/NATIVE-TASKS-2026-09-12.md:2477` (item 113) is still **ACTIVE**, though CoK monster
  movement from `+0xD5` is implemented (README "CoK movement from record bytes").
- `docs/engine/NATIVE-TASKS-2026-09-12.md:633` (item 11) does not mention CCFP `step_sound` (CCSND
  `/P 8 7418`), which is a live DQK DIG4 path.
- `native/src/gbboot.asm:11410-11413` (`use_selected_geo_fallback` `.matrix`) says CCECL frames
  `0x4C` as Buck's zero-operand op. This has been false since `01d5f0db`, and the round-9 T3 fix did
  not land (T4 fixes it).
- `native/src/ccecl.asm:93` says Countdown `0x42`/`0x4B`/`0x4C` are "observed only as
  zero-operand". `0x4C` is two under `MATRIX.CFG`, and both binaries read 1/2 for `0x4B`/`0x4C`
  (T7 fixes it).
- `docs/engine/research/gbpr-8-row-design.md` "Caveats" presents "CCECL accept[s] 7..8 rows for any
  title" as harmless, and its "Tests" section claims no regression. It broke the v6-seed negative
  case (T1).
- `docs/engine/research/dqk-npc-ai-body.md:306` says "CCCOMBAT has **432** free bytes (304 usable)".
  The figure is 416 free (288 usable).
- `docs/engine/HANDOFF-DOK-HP-2026-09-24.md:1345` still narrates `CHECKPARTY` at `0x86D4` in its
  body. `a60af412` appended a correction rather than amending the line, which is acceptable as
  history, but a reader of that paragraph alone gets the retracted reading.
