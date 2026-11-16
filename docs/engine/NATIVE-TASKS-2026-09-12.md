# Native DOS task list — 2026-09-12

This list supersedes the stale "Recommended next tasks" ordering in
`HANDOFF-NATIVE-DOS-2026-09-11.md`. It was re-derived from the live tree after
the 2026-09-12 native release, the passing 35-script flow artifact, and
read-only Astra and Opus audits. The complete Opus memo is retained at
`docs/engine/research/opus-native-task-audit-2026-09-12.md`; its current-tree
corrections are reflected below.

The 35-flow roster is a release regression gate, not proof that campaigns are
playable. Keep it green while pursuing the items below.

**2026-09-13 audit reconciliation.** A fresh Astra review and an independent
project audit agree that the VHD title selector and profile-resolving launcher
are closed by `81f8bcc7` and `fd24616e`, respectively, so neither is reissued
below. Their remaining findings refine existing items: item 3 needs complete
narration semantics, item 4 needs multi-action turns and one real spell, item
1/5 needs recoverable publication, item 9 needs HLIB live-art switching, and
items 20 and 21 have since been closed by the live VHD builder and guest
verifier; the remaining findings refine items 3, 4, 5, 9, 17, and 23. The one
newly specific menu slice is incorporated in item 2.

**2026-09-14 Astra/Opus reconciliation.** Both read-only audits were checked
against the live tree before being added to the queue. They confirm that the
item 25 has a production route for terminal Gen1 DAX flows: `GBBOOT` launches `CCFLOW` there, `CCFP` presents its stream, and `CCHOST /D` applies its supported DAMAGE mutations. HLIB was on direct `CCECL` when this was written: DQK area 2 remained live after six saturated chunks (384 records) and 180 seconds. **Corrected 2026-10-13:** `e41acd98` (2026-10-07) routes DQK ECL through `CCFLOW` too (`.run_ecl` in `gbboot.asm` composes `CCFLOW.COM`); whether its host-interaction continuation is a complete route is the open part. The remaining findings are already owned rather
than duplicated: source-bound cold continuations (52), Pool/Treasures
`SHORT_MENU` contracts (53), real DQK NPC mechanics (28), DQK secondary attack
cadence (29), title-specific fled regrouping (42), combat UI profiles (40),
and the complete test ownership registry (22). Keep their acceptance evidence
on those items: equal-length source substitution must reject without mutation;
real two-round multi-attack traces and a genuine selected-NPC record must be
used; and every native test needs a required, advisory-with-reason, or retired
classification. The successful `DOS-TOOLS` rebuild also contains manifest-pinned
`CCFLOW.COM`; raw/VHD guest verification passed, while the playable verifier's
retained run reached all 13 selector markers.

**2026-09-14 audit refinements.** The VHD builder's `-Build` path had regressed
because it invoked `native/build.ps1` under Windows PowerShell 5.1, which cannot
write its PowerShell-7 capacity manifest. `BuildReleasesVHD.ps1` now invokes
`pwsh -NoProfile`; the runtime-manifest external-script pin was renewed and a
full `-Build -StageOnly -KeepStage` rebuild staged 422 files. Three remaining
audited slices are now explicit below: transactional `CCHOST /D`, a true
GBBOOT-to-CCFLOW saturated-DAX contract, and recovery of an interrupted initial
player-session copy.

**2026-09-14 DQK route correction.** The former `d4a9477` area-7 closure is
not currently reproducible. `native/gbboot-test.ps1 -EngineSmoke` expects the
combat-at-GEO-14 then resume-at-GEO-62 route to leave a 28x28 WGRD, but its DQK
`/A 7` case produces a 22x22 wall. Reassembling the committed pre-capacity
GBBOOT and running the same DOSBox configuration produces the same 22x22 wall,
so this is a pre-existing route failure rather than a launcher-refactor
regression. Reopen the route and retain area 26 as its independent 22x22
control; do not describe the DQK engine matrix as fully passing until the
area-7 initial and resumed effects plus final wall are re-established.

**2026-10-07 cause isolated (one-variable bisect, headless DOSBox).** The 28x28 route
(combat at GEO 14, resume at GEO 62) last reproduced at `37feee1d^` and ended at
`37feee1d` ("halt before script effect capacity loss"): area 26's script has 64 events =
`SCRIPTCAP`, which the VM used to truncate silently and now halts on. `7d26b230` then
made Gen2 saturation a v15/status-4 GBEF record, which GBBOOT's `read_effect_header`
rejected (no wall at all); it now accepts status 4 (GBBOOT 130 bytes free). `/A 7`
is pinned to its honest state (v000F status=0004 at GEO 26, 22x22, no resume); the
route needs a Gen2 capacity continuation, which does not exist.

Pool's distinct ECL far-pointer mapping is closed by `3130e442` (2026-09-13).
`POOL.CFG` now selects its retail `0x6700` loader addend (`vaddr - 0x98FE` as
the file offset) in CCECL. The broader native flow gate contains a synthetic
header-pointer control whose default byte is invalid, so it proves the mapped
vmRun1 target executes rather than merely falling through at the usual Gen1
entry.

1. **Create executable headroom and a versioned host-state bridge.**
   The initial extraction is complete: `CCHOST.COM` owns combat-result
   validation, roster writeback, and CoK combat-RNG synchronization. `GBBOOT`
   publishes an exact 346-byte `GBHR` v1 request containing a version, profile
   mode, and three canonical DOS paths; its child tail names only that request
   file. The current generated capacity manifest measures GBBOOT at 64,888 emitted /
   65,144 resident bytes of the 65,280-byte `.COM` ceiling, leaving 136 bytes of
   headroom. CCCOMBAT now has 276 bytes of headroom after integrating the
   preserved combat-capacity worktree on 2026-10-02: factoring repeated fallback
   stats and register-restore tails recovered 144 bytes on the current source.
   The prior direct-VGA RAW framebuffer optimization and 100-byte
   route-predecessor buffer are retained. CCHOST's
   standalone DOSBox contract accepts a real CoK update and rejects truncated,
   trailing-byte, and noncanonical-padded requests. Its CoK preflight now validates
   the complete GBCR body before it publishes combat RNG into paused GBEF, so a
   valid-header truncated result leaves both continuation and roster unchanged.
   It also verifies the complete target GBPR body before that publication: a
   header-only roster, partially truncated member, trailing byte, or compact
   metadata without every claimed GBD1 marker rejects without changing the
   continuation or roster.
   CoK and DQK playable flows, the 35-script flow sweep, and the VHD `START.BAT`
   route cover the live integration. GBCR length, outcome, row order, and condition validation now
   apply equally to CoK, Gen1, and Gen2; malformed and missing Gen1 results
   reject before roster mutation. Every populated GBPR also requires an exact
   GBCR party-count match for every owned profile; an empty bridge-only
   fallback roster remains the only exception. The CCHOST smoke proves that
   one-row and three-row Gen1 results cannot partially update a two-member
   roster, while an equal-count handoff updates both members. The remaining hardening is to make
   roster/effect writeback one recoverable transaction. CCHOST's populated v1
   handoffs now have a bounded transaction: before mutation it appends the
   exact GBPR preimage, exact source-field preimages for each source slot that
   exists, and, for a Cast, the fixed WIZ preimage to the `GBTX` sibling bound
   to the fresh GBCR. A `FINALIZING` retry completes only the consumed-bit
   write; a `PREPARED` retry restores the GBPR, those exact source fields, and
   the WIZ record before applying once. `cchost-test.ps1` fault-builds
   both boundaries under DOSBox and byte-compares the recovery-stop preimages
   before the normal retry proves one DoK XP award and one Magic Missile
   consumption. CoK v2 RNG/effect publication and the wider checkpoint and
   inventory generations still need their own recoverable write sets.
   CCECL no longer blocks this work: `f7bf040` replaces its static final-effect
   record with serialization into the decode buffer after the last ECL block;
   its compact-bridge resident image was 64,895 bytes (385 bytes of
   headroom). `CCECL /!` now emits a resumable v14 `GBMN`/`GBMS`/`GBMT` record
   with complete bounded raw labels and validates a `GBMO` answer in a cold
   process; `CCMENU.COM` is its sibling validator, renderer, and outcome writer. GBBOOT invokes that helper only on its explicit `/!` route,
   then cold-resumes CCECL through the validated outcome. Gen1 WHO keeps its
   destination result; DQK's Gen2 WHO now carries the inline packed prompt and
   bounded GBPR names, with its answer restored as selected-party context
   rather than written through the prompt length. CCECL, CCFLOW, and CCMENU
   validate the destination-free v15 shape. Its focused cold-resume fixture is
   added but awaits runtime execution in a focus-safe session. Move one coherent existing host-owned subsystem
   out of GBBOOT and exchange a validated, versioned state file. The bounded
   child command tail may name that state file, but it must not encode state.
   Prove malformed and truncated state rejection,
   byte-equivalent current routes, and measured capacity before relying on that
   space for gameplay features.
   GBBOOT's headroom moved 224 -> 180 bytes on 2026-09-23, when the
   GBDJ boot recovery and DoK journaled DAMAGE were wired in (+44 bytes;
   `docs/engine/PLAN-DIRECT-DAMAGE-JOURNAL-2026-09-22.md` §27.3(c)). It moved
   180 -> 172 bytes on 2026-09-23, when `97e09d8e` restored
   `apply_effect_damage_roster`'s two `damage_ack` writes (plan §34.2).
<!-- native-capacity:gbboot emitted=64669 resident=64925 headroom=355 -->
<!-- native-capacity:cccombat emitted=40332 resident=40588 headroom=24692 -->

   **Capacity-floor refinement.** The required noncritical CCCOMBAT reduction is
   complete: direct RAW-frame output recovered 268 bytes (4 -> 272 bytes of
   headroom) while `cccombat-test.ps1` and `gbcombat-icon-flow-test.ps1` retained
   the tactical and icon-handoff contracts. Make the capacity gate reject any
   constrained executable below its documented floor before another combat
   primitive is added. The documented operating reserves are GBBOOT >= 128,
   CCCOMBAT >= 128, and CCECL >= 64 bytes; these are intentionally below the
   current measurements so they protect recovery margin without freezing all
   future feature work. `build.ps1` enforces them for individual, engine, and
   all-target builds.

2. **Make ECL menus resumable and player-selected.** `native/src/ccecl.asm`
   records vertical/horizontal menus and normally commits a deterministic `/C`
   answer. Its explicit `/!` route now yields its instruction position and
   sparse VM state, then resumes a validated selection through GBBOOT and
   CCMENU. Preserve `/C` for deterministic automation. Yield prompt,
   options, instruction position, and sparse VM state to the host; resume
   exactly once with a selected answer. The bridge cannot rely on the
   current `GBSX` event alone: it retains only eight operands and the first
   32 characters of one inline string. The v14 continuation preserves complete
   bounded prompt/option strings as raw packed ECL alongside comparison flags,
   selected-character context, and queued encounter state as
   well as PC, RNG, call stack, sparse memory, and clock; it is proved with a
   `COMPARE`/`LOAD_CHARACTER`/`LOAD_MONSTER` pre-menu smoke.
   Both CCECL and CCMENU reject an otherwise-valid v14 record with a trailing
   byte; both validate GBMT segment count, bounds, and zero padding, and CCECL
   bounds `GBSX` count before locating its declared menu event. The implemented
   128-byte store rejects a non-inline label or overflow rather than truncating
   a choice. Remaining proof is retail capacity evidence, a long/many-option
   menu, repeated title-owned choices, and a deliberate external-text bridge
   if the fixed payload does not cover those menus. The first real-title slice
   is now covered for CoK horizontal menus: `ccecl-menu-resume-test.ps1` starts
   retail `ECL1.DAX#34` at verified direct probe `0x931B`, cold-resumes its
   one-choice continuation into `ATTACK / WAIT / LEAVE`, and proves ATTACK's
   exact `13x8 / 35x5 / 38x2` combat handoff differs from LEAVE's source
   narration and selector value. The companion DQK proof now covers the Gen2
   vertical form: retail `DISK3/ECL.GLB#58` at direct probe `0xA34F` renders
   `WHAT DO YOU DO?` and all three choices; PULL and LEAVE cold-resume to
   distinct source transcripts. The direct probes remain source-owned branch
   evidence. CoK now also has a player-visible no-direct-PC acceptance route:
   `gbcok-playable-flow-test.ps1` stages retail data, starts at `(4,15)` facing
   west, moves once through CCFP to `(3,15)`, and proves all three CCMENU
   yields, ATTACK's combat/resume, and consumed flag `4C55=0020`; it invokes
   neither `/@` nor `/B`. Still choose different answers on genuine revisits
   where the source permits them, and obtain retail capacity evidence for a
   long/many-option menu. Keep the pending and outcome
   `tools/gen1_ecl_menu_capacity_scan.py` now supplies the missing Gen1 corpus
   census: 782 structurally valid, CFG-reachable inline menus across the installed
   archives, with a 108-byte maximum **stored** payload: Pool `ECL1.DAX#18`
   has 104 packed bytes plus four GBMT length prefixes, tied by a five-segment
   Pools of Darkness menu (103 packed + 5 prefixes). The parallel
   `tools/dqk_ecl_menu_capacity_scan.py` census finds 226 DQK ECL.GLB candidates,
   with a 103-byte stored maximum (99 packed + 4 prefixes). The largest Pool
   candidate now has a direct DOSBox contract: `ccecl-pool-menu-capacity-test.ps1`
   enters `ECL1.DAX#18` at `0x9A36`, proves its four GBMT segments occupy exactly
   108 bytes followed by zero padding, renders the complete prompt and three
   choices, and cold-resumes selection 2. The same DOSBox contract has a synthetic
   cumulative boundary control: two 83-character packed labels occupy 63 bytes
   each plus their prefixes, fill all 128 GBMT bytes, render, and cold-resume;
   extending only the second label by one character (129 stored bytes) emits the
   controlled `GBHD reason=2` halt instead of a truncated menu. This does not cover FRUA's separate Gen2 corpus,
   non-inline strings, or prove a player route to every candidate. Keep the pending and outcome
   Gen2, DoK, and Pools of Darkness Gen1 `SHORT_MENU` (`0x31`) under explicit `/!` now take the same bounded pending/outcome
   protocol as `HORIZONTAL_MENU`: CCECL dispatches the measured Gen2 frame and the
   DoK `DKK.CFG` compact frame to the shared
   handler, its cold-resume reader and CCMENU accept opcode `0x31`, and the
   existing version and shape checks remain exact. `ccecl-menu-resume-test.ps1`
   proves retail `DISK3/ECL.GLB#61` at `0x9FF5`: `SLAM THE LID DOWN` reaches
   its source combat handoff, while `LOOK INSIDE COFFER` cold-resumes a nested
   `HELP THE MAN / PUSH HIM OFF YOU` short menu and then a distinct source
   combat transcript. `ccecl-dok-short-menu-test.ps1` separately proves the DoK
   compact frame and cold resume. `ccecl-pod-short-menu-test.ps1` copies retail
   `ECL1.DAX` and `POOL4.CFG` into its private DOS mount, starts `#51` at
   `0x8385`, renders `ATTACK / FLEE / TALK / WAIT`, and cold-resumes ATTACK at
   `[0x0098]`. Buck's `BUCK.CFG` marker enables only its independently verified
   `0x31` frame, leaving the unrelated DoK/PoD compact frames disabled. Its
   `ccecl-buck-short-menu-test.ps1` starts retail `ECL1.DAX#16` at `0x92FE`,
   renders `SHOOT / CHARGE / TAKE COVER`, and proves distinct source-defined
   CHARGE and TAKE COVER cold-resume branches. Matrix Cubed's `MATRIX.CFG` marker
   now enables only its independently measured `0x31` frame: its own `GAME.OVR`
   shares the `0x2B`/`0x31` handler, and
   `ccecl-matrix-short-menu-test.ps1` stages the extracted retail files into a
   private DOS mount. It starts `ECL1.DAX#18` at `0x91AF`, renders
   `LAUNCH / REPAIR / FUEL / AMMO / MED SUP / EXIT`, then proves REPAIR's
   source mutation set differs from EXIT's one-word cold continuation.
   CCECL is currently 65,212 of its 65,280-byte resident `.COM` ceiling, with
   68 bytes of headroom. Pool of Radiance and Treasures remain recorded-only;
   they need their own profile identity
   and title-grounded tests establish their frame contracts. Keep the pending
   and outcome schemas exact: reject older and future `GBEF`/`GBMN` and `GBMO` versions until
   a compatible decoder exists, with no outcome or state-file mutation.


3. **Present ECL narration during real play.** `CCFP /W` now defaults to the
   first source-ordered GBSX `PRINT` or `PRINTCLEAR` record and lets Enter
   advance only through later records of those two types. It therefore cannot
   surface PICTURE, menu, or host-call operand text as narration; `/Z` remains
   an explicit scene-replay slot selector. `ccfp-effects-test.ps1` proves that
   a non-narrative PICTURE slot is skipped in favour of the following PRINT
   slot. This is still bounded presentation: each record is at most 32
   characters, and it does not preserve PRINT accumulation, PRINT_RETURN, or
   CLEAR_BOX semantics. Preserve complete, ordered text beyond that slot and
   give the player source-faithful advancement and clears. Validate a retail block's full
   narration against the decoded source, mutate one staged source string to
   change the rendered band, and prove a different block's string does not
   affect it.

   **2026-09-13 partial implementation:** normal CCFP `/E` presentation now
   assembles source-ordered, bounded 117-character pages from its retained
   GBSX records. `PRINT` appends, `PRINTCLEAR` and `CLEAR_BOX` reset, and
   `PRINT_RETURN` ends the current `/W` page; `/Z n` remains the deliberately
   single-record diagnostic selector. `ccfp-effects-test.ps1 -Headless` uses
   framebuffer controls for accumulation, both clears, and the first return
   boundary. This does not close the item: each CCECL text record is still
   capped at 32 characters, no long retail passage has been compared to decoded
   source, and the Enter advance has not yet been captured through GameLink.

   **Terminal-clear correction.** A terminal `PRINTCLEAR` or `CLEAR_BOX` that
   Enter consumes now returns an intentionally empty successful page, so the
   walker redraws the message band instead of leaving the preceding text visible.
   The fixed GBSX and GBSL sidecar page builders share this behavior. This is a
   repaint correction only; it does not recover bytes beyond the 32-character
   per-record transport limit or replace the remaining GameLink capture.

   **2026-09-24 bounded long-text slice.** The Gen1 DAX `PRINT` and
   `PRINTCLEAR` transport now tags an inline operand longer than 32 decoded
   characters in the existing CCECL slot, resolves its source bytes into a
   versioned GBSL v2 packed payload, and lets CCFP `/W` continue by event
   ordinal and decoded offset. The disposable DoK `ECL1.DAX` block-16 fixture
   isolates the first literal at `[60,222)`: 159 packed bytes decode to 212
   characters and appear over 117+95-character pages. A separate GameLink
   control proves a long `PRINT` after 116 short-text columns starts at its
   first character on the next page. CCFLOW marks its CCECL child via EXEC
   FCB1 for long references; direct CCECL retains inline32. CCECL now occupies
   64,581 resident bytes, below the 65,213-byte task ceiling. Its DAX and HLIB
   loader-only directory tables now overlay `blk`, removing 1,536 bytes of
   separate table reservation without reducing the 128-entry DAX TOC,
   256-pointer HLIB table, or 512-byte ID-table capacities. The new DoK-only
   discriminator is also retained separately from the shared short-frame bit.
   CCHOST's live DAMAGE and embedded GBDJ readers validate v2 structure and
   a production recovery of a 65,502-byte sidecar restores roster and source
   preimages. Short inline strings and untagged v1 sidecars retain their old
   paths; `/Z` skips long tagged rows, interactive v14 yields retain the old
   32-character prefix, and saturated tagged v14 yields reject.
   **2026-09-24 source-ownership follow-up.** A disposable block-16 variant
   changes decoded character 126 (`T` to `X`) in its packed PRINTCLEAR without
   changing the 159-byte operand or the `EXIT` fixture boundary at byte 222.
   Its first-page RAW and GameLink pixels match the source control; page 2
   changes exactly that RAM character and 116 pixels in its mapped glyph cell
   (x160..173, y338..351 in the 640x400 capture), with every other screenshot
   pixel unchanged. A real, separately mutated ECL1 block 17 is present in a
   two-entry private DAX but never selected: both pages, GBSL, and the GBEF
   match the block-16 control exactly. All four GBEF files, including pose,
   picture, VM and RNG, are byte-identical; party/journal state remains absent
   across paging. This closes the staged-source mutation and unrelated-block
   isolation oracles for the first literal. The rest of the retail opening
   remains open. A 2026-09-24 static retail-source trace proves that DoK
   opcode `1Dh` at offset 222 consumes no operand and shows a "Press button or
   enter to continue" prompt through its own input loop, then calls screen
   cleanup. The DoK-only `1Dh` prompt yield and v15 continuation path are now
   implemented in source; the runtime fixture and state-preservation assertions
   remain open. `is_dok` retains successful
`DKK.CFG` admission separately from `short_opframes`, which is shared by DoK
and Pools of Darkness. Static path tracing confirms
   both GBBOOT DoK detection branches require `DKK.CFG`, fresh and cold tails
   pass the same ECL archive basename, CCFLOW preserves it across continuation,
   and CCECL probes the sibling marker before loading resume state. Retaining
   successful `DKK.CFG` admission separately from the shared frame bit is
sufficient for these production routes; broad task 32 title identity is not
a prerequisite. CCECL clears `is_dok` before profile selection and sets it
only after opening `DKK.CFG`; `POOL4.CFG` still enables shared short frames
without setting this DoK-specific identity. Cover direct `D:ECL1.DAX` as a
marker-path edge case (GBBOOT
   does not emit this drive-relative form). CoAB's one-operand
   `PARTYSTRENGTH` writes a computed value to its operand destination; DQK's
   Gen2 compare behavior is a separate contract. Do not infer a global page
   break or full-intro coverage.

   **2026-09-24 cleanup-call correction.** Retail `GAME.OVR:0x3815A` passes
   byte values `00h,18h,00h,28h` in word slots to START image `0x5160`. The
   far-frame arguments are count 40, color 0, row 24, column 0; the callee's
   draw loop fills columns 0..39 of row 24 with the space glyph. `DS:8C7A`
   selects one of three drawing backends; `DS:43E9` participates in glyph
   remapping, not graphics-mode selection. `0x5160` also calls `882:0058`
   before the fill and `882:0034` afterward. The `DS:838C..838F` table and
   callers now prove INT 33h functions 0/1/2 probe, show, and hide the mouse
   cursor; exact retail-mode mapping remains open. Preserve the conditional
   cursor hide/show calls and do not model the fill as a rectangle.
   `tools/test_dok_1d_prompt_cleanup.py` (5/5) pins the retail binaries, unpack
   metadata, wrapper bounds/helpers, mouse function table, backend dispatch,
   and per-cell column increment without launching DOSBox. The existing v14
   menu resume path is not a drop-in: `resume_kind=2` restores menu comparison
   operands/flags and writes an answer to a destination. The coordinated v15
   source path is now implemented: a 5,932-byte record appends `GBRF`, six raw
   flag bytes, and a reserved zero word to the v14-shaped prefix. Status-2
   acknowledgement and status-4 capacity replay both preserve raw flags.
   CCECL validates a one-shot acknowledgement without an ECL memory write;
   CCFLOW replays the complete v15 length and checks the final GBSL record;
   GBBOOT routes presentation through CCFP and cold resume through CCFLOW;
   CCFP validates the identity-bound sidecar, writes GBMO v2, and applies the
   row-24 cleanup with the source-matched INT 33h cursor hide/show pair when a
   driver reports present; CCHOST and CCEFX admit the intended v15 forms. v9 and v14
   layouts remain unchanged. The prior-invocation sidecar flag is cleared on
   cold prefix restore before the new invocation publishes its own GBSL.

   This is source/build progress, not closure. Runtime acceptance still must
   cover unsaturated and >64-event text, comparison and direct-set flags before
   the boundary, mutation-free malformed/stale-sidecar rejection, exactly-once
   answer use, unchanged ECL/RNG/party state, key retry and acceptance behavior,
   cleanup, and the second paragraph. It awaits an isolated desktop/session;
   do not launch DOSBox on the user's active desktop. The new
   `tools/test_native_fx_v15_source_contract.py` checks the cross-tool schema,
   replay, sidecar, GBMO, and dispatch source wiring (5/5); it is a static
   regression guard and does not count as that runtime acceptance.

4. **Finish playable combat turns before broadening combat coverage.**
   `native/src/cccombat.asm` now preserves one movement/attack ledger through
   repeated Move commands. A taped unsupported command writes a named `reject`
   trace record and otherwise ends exactly as explicit End, so it cannot silently
   take an AI action or mutate the turn ledger; the focused combat smoke proves
   both properties. Aim, Cast, Use, Turn, Bandage, View, and Speed still have no
   owned engine primitive. Add one title-owned spell path with a
   verified target, resource consumption, result, and save/writeback. Validate
   move-act-move, End, exhaustion, unsupported-command rejection, invalid
   target, and reload after a real encounter.

   **Ledger correction 2026-09-20.** A surviving bump target can consume every
   remaining primary attack within one Move command. The outer player-command
   dispatcher now ends the turn at that exhausted ledger instead of presenting
   Guard, Delay, or Cast. The deterministic fixture sends `M6G`: it proves
   there is no round-one Guard after the two attacks, while the queued Guard is
   retained for that actor's later turn. The existing killed-target control
   still permits its remaining movement.

   **In progress 2026-09-14 — DoK Magic Missile path.** `C` reads the acting
   imported member's raw `SAVE\CHRDATA#.WIZ`, accepts only prepared raw id 15,
   applies the shared-ruleset 1d4+1 baseline to the deterministic weakest foe
   (the retail DoK dice dispatch remains unlocated), emits
`cast`, and writes the party ordinal/id receipt at GBCR v1 +12. The v1 bridge
holds one receipt, so a later Cast explicitly rejects before changing combat
until a bounded multi-receipt version exists. CCHOST
   preflights the compact GBD1 source slot and exact 220-byte WIZ file, then
   consumes one right-justified id-15 instance only after GBPR and source `.GAM`
   handoff. Focused DOSBox tests cover consumption and a missing-sidecar
   no-mutation control; the real Cekos/Sivak route runs `GBBOOT /C C` against a
   disposable retail-save copy, proves the bridge and cold reload, and checks
   only the receipt's source slot loses one instance. Keep this item open:
   exact Cast selection UI, move-Cast-move and exhaustion traces, target
   selection, and other title spell primitives are still unproven.

5. **Make noncombat effects source-faithful and transactional.** `DAMAGE` is
   currently reduced to a deterministic `count * sides + bonus` amount by
   GBBOOT; its dice do not consume RNG. `TREASURE` and `ROB` can carry
   count-driven tails which the generic event record does not retain in full.
   Derive the original damage, saving-throw, random-target, reward, robbery,
   ownership, and currency semantics from one title-owned route at a time.
   Preserve full typed payloads and publish inventory changes as transactions,
   so an interruption or a revisit cannot duplicate a reward or leave a partial
   robbery. Validate original-engine differential damage cases across seeds,
   subsequent RANDOM continuity, selected and party targets, a natural multi-item
   reward, verified removal, and cold reload without duplication.

   **Priority refinement — direct DAMAGE writeback.** `CCHOST /D` must preflight
   every low-numbered authoritative source slot before touching compact `GBPR`
   state, then journal or otherwise recover exact preimages for `GBPR`, `GBD1`,
   and both raw `CHRDATA#.GAM` HP fields. A missing, read-only, or malformed
   low-slot source must reject without any sink mutation; forced failure at each
   sink must recover byte-identically and a retry must apply one damage event
   exactly once. The high-bit source-less native slot remains the only successful
   no-source case.
   **First safety phase — 2026-09-14.** Before its first compact HP or flag
   write, `CCHOST /D` now opens and size-checks every selected low-numbered DoK
   `CHRDATA#.GAM` source. The DOSBox contract deletes a later source slot and
   proves both GBPR and an earlier source remain byte-identical; a high-bit
   native-only slot still applies successfully without `SAVE`. This closes the
   missing/truncated-source ordering defect, but it is not a transaction yet:
   fault-after-write recovery and exact preimage retry semantics remain required.
   **Roster-body safety phase — 2026-09-20.** Before that source preflight,
   `/D` now reuses the complete GBPR validator: it requires the exact declared
   length and each compact DoK member's `GBD1` marker before any member can be
   changed. The DOSBox contract rejects a short body, a trailing byte, and a
   malformed second marker while preserving the whole GBPR and both raw `.GAM`
   files byte-for-byte. This narrows the pre-mutation boundary only; journaled
   recovery for a write failure remains open.
   **Whole-stream preflight phase — 2026-09-20.** `/D` now decodes every
   supported nonzero DAMAGE record once through read-only GBPR and source
   validation before it begins the write pass. Fixed `GBSX` and `GBSL` fixtures
   put a valid selected member before a second member whose source is absent;
   both reject with the first member's GBPR and `.GAM` unchanged. This protects
   validation failures across event order, but it still is not crash recovery
   for a failure after mutation begins.
   **Writable-source phase — 2026-09-20.** Selected low-numbered DoK sources
   now pass a read/write-open preflight, not merely a readable-open check; only
   high-bit native-only slots can omit a retail source. The later writer also
   propagates invalid slots and open failure rather than reporting a false
   successful DAMAGE. Mutation fixtures prove fixed and sidecar streams fail
   before writes when this preflight is active, while a writer-only late-open
   fault reports rejection. A source disappearing after preflight can still
   require transactional recovery, which remains open.
   **Direct-transaction design checkpoint — 2026-09-20.** A direct DAMAGE
   journal cannot bind only effect bytes: a later identical effect is a new
   occurrence and must apply again. The required protocol therefore has a
   caller-issued monotonically increasing occurrence token, minted only when a
   new effect is published, not by a `/D` retry. `CCBIND` is the common issuer
   because GBBOOT already invokes it before both CCFLOW and direct-CCECL
   returns. A distinct roster-sibling journal must bind that token, canonical
   paths, the exact fixed effect and optional GBSL bytes, the whole GBPR
   preimage, and independent raw `.GAM` bytes 40/214. Recovery must occur
   before CCFLOW can delete a GBSL sibling or GBBOOT can overwrite the effect.
   PREPARED restores and reapplies once; FINALIZING completes the token receipt
   without reapplying. Do not reuse the combat GBTX source table: it snapshots
   XP/readiness rather than DAMAGE's raw HP fields. The first implementation
   phase must retain legacy two-argument `/D` only as explicit compatibility;
   token-bearing calls fail closed on a missing or malformed token.
   **Journal-format boundary — 2026-09-20.** The direct journal must stream
   32-bit file extents and offsets: a supported 1,213-row GBSL alone is 65,510
   bytes, and its fixed GBEF plus a six-member GBPR exceeds a 16-bit record.
   Its source table is damage-specific: each present low DoK source preserves
   its slot, complete 216-byte identity/size contract, and independent bytes
   40 and 214, which may differ before DAMAGE. The existing combat `GBTX`
   table preserves XP/readiness instead and is not a compatible shortcut.
   **Recovery-path prerequisite — 2026-09-20.** Do not freeze or publish a
   thin `{slot,hp40,hp214}` direct-source table: it cannot bind the required
   216-byte raw source identity. Nor does the existing `copy_canonical_path`
   canonicalize a DOS pathname; it only checks a zero-padded field. Direct
   recovery must bind an explicit absolute source directory before constructing
   `CHRDATA#.GAM` targets, because today's `SAVE\...` paths are relative to the
   process CWD and could otherwise redirect a later rollback. The first safe
   executable recovery entry is therefore a retained-PREPARED, recovery-only
   operation: it validates complete paths, token, journal and all writable
   destinations, restores exact preimages, leaves its journal intact, and
   never reapplies DAMAGE or advances a receipt.
   **Operation-token foundation — 2026-09-20.** `CCBIND /N source effect`
   now retains the normal exact `.IDN` source binding and writes a same-stem
   `GBDO` v1 occurrence sibling. Its u64 generation advances for equal-byte
   publications; zero, invalid-kind, truncated, future, and wrapping records are
   rejected without rewrite. This helper is intentionally not yet selected by
   GBBOOT's production `/W` path: CCHOST must first consume the token and
   recover any outstanding journal before a new publication can replace it.
   **Token-format consumer — 2026-09-20.** `CCHOST /D effect roster /T token`
   now accepts the opt-in token form only when `token` is an exact 16-byte
   `GBDO` v1 header with kind 1 and a nonzero u64 generation. It validates and
   closes that file before opening any DAMAGE sink; malformed supplied tokens
   fail closed, while the legacy two-path `/D` form remains explicit
   compatibility. This is format validation only: GBDO does not bind an effect
   or roster, reuse still reapplies DAMAGE, GBBOOT still publishes `/W`, and
   direct-DAMAGE recovery/journaling remains the next required phase.

6. **Prove campaign continuity per title.** Detection and map previews do not
   prove playable campaigns. Maintain a 13-title acceptance matrix beginning
   with the Krynn games: natural boot, travel, event, combat, reward, cold save,
   and reload, without injected VM-memory seeds or direct-PC shortcuts. Confirm
   that consumed events and rewards do not replay after reload. Make all source
   party and checkpoint writes recoverable as one generation: forced interruption
   after each write must restore either the complete prior state or the complete
   new state, never mixed HP, effects, and inventory records.

7. **Complete title-owned character creation, progression, and persistence.**
   Current native creation/progression and rest support are incomplete outside
   CoK/DoK. Establish each title's character-record provenance for level, XP,
   HP, inventory, and spells; then support a natural creation or retail-import
   path through a verified level-up/training threshold, combat, rest, and cold
   reload. Keep the existing `DESTROY_ITEMS` rejection where original callback
   context is not proven; implement each owned callback only after the source
   context and mutation target are known. Validate intentionally distinct
   per-title fixtures, applied versus unapplied removal, ownership mismatch, and
   no mutation when context is absent.

   **Roster preservation update — 2026-10-02.** Before enabling DQK's native
   creator, CCPARTY now reconciles prior native rows after either QSV or QCH
   import. A combined party above six rejects before output truncation, and
   CoK/DoK creation finds the first unused native ID instead of using the
   current row count. Source-contract checks and the existing full CCPARTY
   headless harness pass. An isolated 95-check comparison fails 13 assertions
   against the old binary and passes all 95 against the repair. These checks
   are now included in `ccparty-test.ps1`; the integrated headless rerun passes
   all 95 and the existing party test.
   The first refreshed sweep exposed the CoK SFX probe restoring six source
   rows after a native checkpoint without resetting its fixture. Its full
   flow passes after resetting the source-only roster and requiring the
   partial SFX record to fail specifically at gate 6. The fresh sweep at
   `d3019be5` returns to 14 PASS / 20 FAIL / 2 SKIP, with zero retail file
   changes and unchanged native source. The full corpus at `7cd3f5c6` passes
   with 5,719 passed, 14 skipped, 24 warnings, and exit 0.
   DQK `/Q /C` creation and GBBOOT's `/G` routing defect remain unfinished.
   Existing retail-save evidence does not establish DQK creation defaults;
   do not present CoK/DoK starter values as retail DQK behavior.
   The held DQK Journal (PDF page 6) requires 1,000,001 starting XP,
   split across classes; its class tables and racial caps preclude a single
   level-one or level-twelve baseline. Some printed XP ranges are ambiguous
   even in the page images, so ground exact levels in the original code.
   The shipped QSV has XP at physical record `+0x44`, equal to the native
   importer's shifted view `+0x3c`. Do not mix these bases. The original
   readiness routine at file `0xbbc5` calls the next-level helper through
   `1d99:0f6d`, checks class slots `+0xa5..0xab`, and applies racial caps.
   HP generation, starting equipment/spells, and durable title-owned records
   remain part of this task; a routing/header-only repair would not finish it.

   **Original-rule grounding — 2026-10-02.** The read-only
   `tools/dqk_character_rules.py` now extracts original XP thresholds and
   models training readiness, including signed XP and the Rose-knight cap
   exception. An isolated Unicorn pass executes the original helpers and
   agrees with the model. Two original CS-relative jump tables and a live
   GameLink memory capture correct overlay 5's code base to `0x3a4c0` in
   all three mapping tools, locating creation callback `25a4:220a` at
   file `0x3c6ca`. It writes the actual starting-XP constant. Details and
   evidence limits are in [DQK character creation](research/dqk-character-creation.md).
   This task remains open pending native creation and durable state.

   **DQK imported HP repair — 2026-10-02.** CCPARTY now preserves current HP
   from physical `+0x198` separately from maximum `+0x89`. The original healing
   writer establishes those roles. The complete party harness passes 161
   preservation/source/HP checks, including zero, injured and unsigned HP,
   cold reload, prior combat overrides, and short QCH rejection before output
   truncation. Native creation, class-aware progression, and complete durable
   character state remain unfinished.

   **Natural menu/input repair — 2026-10-02.** CoK/DoK Begin and Create now
   reserve Enter in DOS input buffers and accept the advertised 15-character
   names. Redirected input drains overlong lines, rejects malformed names and
   multi-character choices, and propagates EOF without replacing the roster.
   The complete party harness passes 205 preservation checks plus natural
   console/redirected menu, creation, and cold-reload controls. DQK imported
   parties can Begin; empty DQK menus and unsupported `/Q /C` or menu Create
   reject explicitly. These guards do not implement DQK creation: this larger
   task remains open. The user requested finalizing current work and stopping,
   so no additional creation/progression feature is started in this checkpoint.

   **CLOSED 2026-09-14 — DoK combat-result XP persistence.** `CCCOMBAT`'s
   source-derived `C_XP` total is now applied by `CCHOST` mode 3 to each valid
   compact DoK member using the retail positive-class-slot split, u32 addition,
   and cached readiness threshold. The original `SAVE\CHRDATA#.GAM` source
   receives raw `+0x62/+0x64` XP and `+0xc6` readiness as well as GBPR, so the
   next CCPARTY load retains the award. The real Cekos/Sivak flow starts from
   the shipped six-member party, measures a 570-XP victory, proves both sinks
   and a cold reload, and confirms the consumed v1 result cannot replay. The
   focused CCHOST contract also proves defeat/flee award nothing and a missing
   cache leaves XP untouched while preserving the valid combat handoff. This is
   normal replay protection; recoverable multi-file publication under forced
   interruption remains task 6's transaction requirement.

8. **Replace decoded-record placeholders with title-specific mechanics.**
    Buck records now source and validate mirrored HP at offsets 69/227, but retain
    deterministic placeholders for AC, THAC0, damage, XP, and movement. Monster movement
   is currently a fixed default across profiles. The GLIB path must be retained
   as a source-decoded control rather than treated as a placeholder. Derive one
   selected Buck record's HP, AC, damage, attacks, and movement from source bytes.
   Mutation-test each claimed field against staged data and require the matching
   tactical behavior to change while unrelated fields do not.

9. **Complete platform graphics for live game states.** The native client has
   bounded DOS paths and selected imported art, not broadly interchangeable
   live art across all title/resource families. Start with HLIB/Gen2 scene and
   combat resources under `/G`, then cover title-owned Amiga/C64 walls, icons,
   portraits, and sprites. For each supported platform, render the same live
   state, compare to decoded source assets, and prove art switching leaves VM,
   pose, RNG, and party data unchanged. A concrete DQK lead is area-2 member 2:
   its six-choice wall menu reaches `LOAD_FILES #2, choice+1`; retail
   `DQK.EXE:0x0420AC` stores that second operand as combat context `DS:0xCA03`,
   which selects `DungCom1`/`WildCom1` HLIB groups. Native CCECL preserves the
   raw operand at GBEF `+14` and tagged CA03 at `+16`; CCCOMBAT resolves a
   packed DUNGCOM/WILDCOM group pair on the combat path without changing
   exploration `hlibsetcur`. Connecting those ordinals to a combat tilebank
   consumer and rendering the selected members remain open. CCHLIB now exposes
   `S <master> <id> <dir>` to export one exact ID-addressed nested leaf, guarded
   by a source contract; running this extraction in DOS remains unverified. The
   focused engine test pins exact end-exclusive TLB leaf ranges for all master
   keys. See the 2026-09-25 handoff trace.

   **Context persistence update — 2026-10-02.** CCECL now preserves the
   tagged CA03 word when LOAD_FILES operand 2 is FF. Its complete effects
   harness passes a 24-case HLIB/GLIB and Gen1/DoK matrix; eight cold-menu
   cases also preserve reset and D000-D006 with matching consumed GBMO v2
   tokens and unchanged source/pending files. Old binaries lose each prior
   tag in the external comparison. Flow diagnostic expectations now reflect
   D0xx state while retaining fresh FF/reset zero. The broader menu test
   still rejects numeric input in CCMENU, and direct DQK combat still fails
   its seed-4660 LCG oracle. The fresh sweep at `13c4e0ab` records
   18 PASS / 16 FAIL / 2 SKIP with zero retail file changes: DQK intro,
   dispatch, main flow and Amiga GLIB flow are newly passing. After correcting
   this ledger's stale capacity marker, the full corpus at `7d6332e4` passes:
   5,719 passed, 14 skipped, 24 warnings, exit 0.
   The combat renderer still does not consume the resolved context groups.

10. **CLOSED 2026-09-12: make the VHD a tested product artifact.**
   `native/release-manifest.json` is the versioned declaration of all 23
   `native/build.ps1 -Target all` programs. `C:\LLM\DOS\BuildReleasesVHD.ps1`
   preflights every declared, nonempty helper before staging it at both the image
   root and `C:\GOLDBOX`; `VerifyReleaseVHD.ps1` has the guest copy and hash-check
   every same declared program. The manifest pins exact SHA-256 values for all three
   external VHD scripts, and either script fails before its work on drift. A
   synthetic new `FUTURE.COM` declaration failed both packaging preflight and
   guest verification, while the regenerated raw image and VHD passed all 23
   real programs under DOSBox Staging. The runtime helpers live at the image
   root so GBBOOT's child-command tails remain below DOS's 127-byte limit;
   `C:\GOLDBOX\START.BAT` remains the documented user entry.

11. **Play one source-grounded DQK DIG4 sound effect in live native play.**
   **Updated 2026-10-07 (from source and git, no run):** `CCSND.COM` now also has `/P`
   (`fa959416`, `521bdd8c`: DIG4 is a 6-byte header plus 4-bit nibbles; GBSN status sidecar
   v2), and live first-person play already plays one DQK sound: `step_sound` in
   `native/src/gbboot.asm` (commit `7561d4a4`, "CCFP: play the DQK walk sound on allowed
   first-person steps") EXECs `CCSND /P 8 7418 DISK1\SOUNDS.GLB`, member 8 being
   `PlaySound(0x0B)` from `DQK.EXE 0x43B26`, silent when the GLB or `CCSND.COM` is absent or
   while scene/GBIM art is resident. That is a walk-step trigger, not an ECL/CALL one, so
   what remains is the verified ECL/CALL-to-sound path. Derive one retail event's member index and
   rate, play its exact unsigned PCM at that rate, and retain byte/rate evidence
   against `SOUNDS.GLB`. An audio-unavailable path must publish its status
   without changing VM, RNG, party, or event-consumption state. Validate the
   chosen retail trigger, a staged member mutation, and an unrelated-member
   control.

12. **Turn recorded ECL CALLs into source-grounded native effects.** The
   coverage report still records 5,749 of 27,821 reachable CoK/DoK ECL
   instructions without a matching native state effect. Select one retail CALL
   route at a time; trace original reads and writes, mutate only the staged
   source input claimed by the route, and require only the corresponding native
   result to change. Publish the applied-versus-recorded coverage delta. Never
   count a recorder transcript as application.

13. **CLOSED 2026-09-13: record every enrolled flow in the release artifact.**
   The five formerly optional Pool, Gateway, Secret, and DQK-Amiga routes now
   have the same prerequisite guards as the established flows and are enrolled
   in the provenance-bearing artifact. `native/run-flow-suite.ps1` recorded
   35 PASS, 0 FAIL, 0 SKIP against the current committed scripts; the status
   checker and prerequisite mutation tests pin both the denominator and its
   missing-data behavior.

14. **Restore one full corpus execution on the local Windows runtime.** Focused
   native gates are useful but do not replace the full corpus. The two previously
   suspected isolated Unicorn tests now pass together, so bisect the aggregate
   emulator-state failure instead of attributing it to those files, establish a
   stable supported runtime, then run `pnpm test:corpus` once and record the
   complete result.

15. **CLOSED 2026-09-12: required DOSBox availability fails closed.**
   `native/test.ps1` preflights the configured `GOLDBOX_DOSBOX_EXE` and throws
   before normal work when it is absent. `native/run-flow-suite.ps1` emits a
   measured artifact whose every roster entry is `FAIL` with classification
   `required-dosbox-unavailable`; it does not turn the unavailable emulator
   into a green run or a SKIP. Direct flow scripts retain their early SKIP lane
   for optional data/emulator diagnostics, but that lane cannot satisfy either
   runner. `tools/test_native_runner_semantics.py` mutation-tests both runners,
   and `tools/test_native_flow_preconditions.py` separately proves each direct
   flow stops before NASM when its prerequisites are absent. On 2026-09-13 the
   normal installed-DOSBox full sweep recorded 35 PASS, 0 FAIL, and zero SKIP.

16. **Run the packaged client through the image's real front door.** The guest
   verifier calls `C:\GOLDBOX\START.BAT` with staged CoK assets, reaches combat,
   saves, restarts, and cold-reloads; it hashes both the nested helper and the
   root `C:\GBBOOT.COM` that START actually launches against the same manifest
   entry. The packaged artwork selector routes `START DOS`, `START AMIGA`, and
   `START C64` to exact `/G 1`, `/G 2`, and `/G 3` child tails, with the original
   option-only invocation preserved. It also selects canonical `GAME\COK`,
   `GAME\DOK`, or `GAME\DQK` folders before artwork dispatch. The guest verifier
   now stages all three layouts privately: nested CoK boots a persisted party,
   DoK creates a compact player and bridges its 16x16 map, and DQK loads its
   six-member QSV party and area-18 16x11 map. It fingerprints the complete
   mounted library before and after those real routes. A recorder-only pass also
   proves the exact DOS/Amiga/C64 selector tails for all three titles, while a
   separate CoK-only library proves that a supported-but-absent DoK fails before
   GBBOOT dispatch. Hash/mount verification remains a separate packaging check.
   The published `C:\LLM\DOS\DOS-TOOLS.img` and `.vhd` were atomically rebuilt
   from this verified package on 2026-09-13; both pass the release mount check
   and the complete guest verifier.

17. **CLOSED 2026-09-13: give every supported title profile a private interactive session.**
   `native/run-goldbox.ps1` resolves all 13 supported profiles before copying
   user data, preserves each source layout (including nested `GAME\<shortname>`
   wrappers), and creates a session-owned `GREYBOX` runtime for C:. It refreshes
   only built `.COM`/`.GBM` assets on relaunch, leaving the session game data and
   `_GB*` sidecars alone; test runners continue to use `native\build`. Resume,
   party-menu, and seeded-party launches all pass `/!`.
   `native/run-goldbox-session-test.ps1` covers all direct and wrapper layouts,
   source hashes/timestamps, rejected unknown profiles before staging, and
   private-session preservation without opening an interactive window. The
   remaining player-flow acceptance is separate: alter an imported record in a
   visible session, exit and relaunch, then choose two natural menu branches.

18. **Partially complete: player ECL input now includes numeric and string input.**
   Gen1 `PARLAY` now yields the validated menu bridge under `/!`: CCMENU offers
   HAUGHTY, SLY, NICE, MEEK, and ABUSIVE; cold resume maps the selected index
   through the source-owned five response values retained in GBSX. `/Y` remains
   the deterministic headless route. WHO now yields one imported GBPR member
   name per option under `/!`; its exact one-operand event and bounded ASCII
   labels are validated before CCECL writes the selected zero-based member on
   cold continuation. `ccecl-menu-resume-test.ps1` proves a three-member roster
   renders TIKA, TANIS, and RAISTLIN, then carries the RAISTLIN selection into
   the following ECL operation; `ccmenu-test.ps1` rejects a malformed WHO
   event. `/W` remains the deterministic headless route. DQK's original
   `0x0f` handler at file offset `0x04313c` reads operand 2 from parser slots
   `[AE6C]/[B187]` and passes it as the answer-write address to `0x040992`;
   operand 1 is not read by that handler. CCECL now writes `/L` through operand
   2, and `/!` uses v14 option count zero as a free unsigned 16-bit answer
   marker. CCMENU accepts and cold-resumes 750 without creating 751 menu
   options. `ccmenu-test.ps1` and `ccecl-menu-resume-test.ps1` now carry 750
   through the outcome and continuation fixtures; the CCECL effects fixture
   also seeds 750. DQK area 2 compares `[0x00C1]` with 750 at `0x84D6` and
   returns on the threshold branch; otherwise its `SAVE_TABLE` arm loops to
   `0x8485`. Native records 13 instructions on the complete editing arm,
   including its PRINT/PRINTCLEAR/PRINT_RETURN instructions, so the six
   reported 64-record chunks do not establish a loop count. Native DQK
   PARTY_SURPRISE now yields its Yes/No prompt under `/!` and cold-resumes the
   answer while preserving retail `LE`/`GE`; headless `/C` remains deterministic.
   The synthetic continuation fixture covers both answers, but its DOSBox run is
   deferred. The former native operand order
   wrote both numeric answers through `#3`, leaving `[0x00C1]` and `[0x00C3]`
   unchanged and preventing a reliable `>=750` exit. This is a verified source
   mismatch but not a proven cause of the old saturation. Those runtime checks
   still require the
   native DOSBox pass. The real-block browser VM oracle test now also resumes
   area 2 at `0x84D0` with 750, observes status `exited`, and retains the word
   at `[0x00C1]`; this verifies the source route, not the native implementation.
   `INPUT_STRING` reads its
   source-owned `maxLength,destination` operand order. Under `/!`, CCMENU
   accepts bounded keyboard text (or `/T` only for the DOS smoke), uppercases
   it, preflights sparse-map capacity, writes character words plus a NUL to the
   pending checkpoint, and publishes the identity-bound v2 outcome. Cold CCECL
   validates the two-operand shape and resumes without overwriting the string.
   The focused smoke enters `hands`, verifies `HANDS\0`, and takes the following
   runtime-memory-string versus inline-string `IF_EQ` branch.
   GBBOOT now supplies the same compact GBPR `/B` roster argument to every
   CoK and DoK cold ECL continuation, including menu and combat resumes.
   `gbboot-test.ps1 -EngineSmoke` drives a DoK menu into WHO after that cold
   boundary and requires both `DOKALPHA` and `DOKBETA` names to reach CCMENU.

19. **Ground non-CoK RNG and combat-to-ECL continuity in title evidence.**
   CCECL's retail-grounded RNG path is CoK-specific, while other profiles use
   the generic LCG and legacy combat handoff has a 16-bit seed path. Derive one
   DoK or DQK original sequence spanning ECL RANDOM, combat, a later RANDOM,
   and cold reload. Require exact values and state width at every boundary
   before generalizing any title's implementation.

20. **CLOSED 2026-09-13: package optional title music under the VHD contract.**
   The three external VHD scripts are hash-pinned. `BuildReleasesVHD.ps1`
   validates and copies each available `COKTITLE.GBM`, `DOKTITLE.GBM`, or
   `DQKTITLE.GBM` to both runtime roots, and `Write-GoldBoxManifest` includes
   `.GBM` rows. The guest verifier copies the packaged and root CoK stream,
   checks both against the guest manifest, and proves its `GBM1` bytes are
   present through the real `START.BAT` path. Unavailable optional inputs are
   skipped without adding user game data to Git.

21. **CLOSED 2026-09-13: exercise real VHD profile layouts and full cold state.**
   The guest verifier runs selected nested CoK, DoK, and DQK layouts through
   `START.BAT`, fingerprints every mounted input before and after, and checks
   detected profile plus the applicable native bridge. Its cold reload compares
   whole `GBPR` party records, whole `GBPS` continuation state, and the complete
   checkpoint backup byte-for-byte, covering HP, conditions, XP, inventory,
   RNG, timers, ownership, and consumed events. It also hashes the root helpers
   that `START.BAT` executes and rejects missing profile data before dispatch.

22. **Create one ownership registry for the entire native test surface.**
   The flow-status artifact deliberately covers only a subset of native scripts,
   and `native/test.ps1` plus the playable suite have separate partial rosters.
   Add a machine-readable registry that classifies every `native/*.ps1` test as
   required runner/artifact, advisory with a reason, or retired. Fail when a new
   test is unclassified, and mutation-test removal of required membership or its
   artifact declaration. This complements item 13's `*flow-test.ps1` coverage
   rather than narrowing the roster to it.

   **Source-only registry/validator implemented — 2026-09-25.**
   `native/test-ownership.json` classifies 99 source candidates discovered by
   `*test.ps1`, `*-scan.ps1`, and `*-probe.ps1` (excluding generated
   `native/build` files and the central dispatcher itself): 64 required, 35
   advisory, zero retired. `tools/native_test_ownership.py` derives memberships
   from `$scripts`, `$flowScripts`, the direct GBBOOT and one-off smoke calls,
   plus the playable suite's core/optional arrays. It permits overlapping owners
   and requires reasons for advisory/retired entries. The 36 flow-script rows
   declare `native/flow-status.json` as their durable artifact; the registry
   stores no measured statuses or verdicts. Mutation coverage rejects removed
   source membership, omitted registry rows/new candidate files, missing
   artifact references, ownerless required entries, and reasonless dispositions.
   `python -m pytest tools/test_native_test_ownership.py -q`: 10 passed. No
   native scripts, build, DOSBox, or corpus flow was run. Next source candidate:
   Task 29, the DQK attack-rate counter trace.

   **Registry update — 2026-10-02.** The DoK ACK regression is now a required
   `$scripts` member and also runs through its Python corpus wrapper. The
   source registry now contains 100 candidates: 65 required and 35 advisory.
   Its owner derivation describes the PowerShell runners; Python corpus
   coverage is checked separately by `tools/test_native_gate_coverage.py`.

   **Registry update -- 2026-10-07.** Five round-8 focused scripts moved from advisory to
   required: `gbdqk-npc-join-test.ps1` (`$flowScripts`, flow-status artifact) and
   `ccecl-matrix-op4c-test.ps1`, `ccparty-dqkdice-test.ps1`, `cccombat-dokinit-test.ps1`,
   `cchost-dqk-damage-test.ps1` (`$scripts`). The registry now holds 113 entries: 91 required,
   22 advisory. Enrolled, not yet swept: `native/flow-status.json` (37 recorded) and
   `native/scripts-status.json` (38 recorded) must be regenerated against the 38 and 42 entry rosters.

23. **CLOSED 2026-09-13: reconcile native-gate instructions with the armed checker.**
   The active README and CLAUDE instructions describe the flow-status checker
   as standing. `tools/test_native_flow_status.py` runs its live artifact and
   instruction assertions unconditionally, and its structural mutation test
   rejects a present-tense claim that the gate is opt-in or absent. Historical
   arming notes remain dated evidence rather than active instructions.

24. **Decode the installed FRUA event and map formats before exposing native FRUA play.**
   The retail installer is now recognized through `CKIT.EXE` plus
   `DISK3\GEO.GLB`, but a read-only actual run proves its three map members are
   `FORM`/`AMOD` data rather than CCGEO's DQK `width,height,planes` shape; its
   `DISK3\SCRIPT.GLB` is likewise an event-page library rather than DQK ECL.
   CCGEO now validates and normalizes the documented direct `.DSN\GEOxxx.DAT`
   `FORM`/`AMOD` record into WGRD, with a synthetic marker mutation control and
   a read-only HEIRS `GEO005.DAT` byte-equivalence check. Keep GBBOOT `/E`
   fail-closed until it can select a user-chosen design and start module, then
   derive its event-page route. Prove an actual mounted FRUA install reaches a
   rendered map and title-owned event without treating either archive as DQK
   data.

25. **Never silently discard a saturated ECL host effect.** **Partially closed
   2026-09-13:** CCECL retains a fixed 64-record `GBSX` tail, but now stops
   *before* a recordable 65th opcode, writes `GBHD reason=7` with the exact PC,
   opcode, area and ordinary VM state, and names the condition in both CCECL
   and CCEFX. `ccecl-effects-test.ps1` proves 65th `PRINT`, `DAMAGE`,
   stateful `AWARD_XP`, and Gen2 `LOAD_PIECES` instructions leave the first 64
   records intact without consuming the next one; the `AWARD_XP` control also
   requires its GBPR source roster to remain byte-identical. The timer fixture
   covers the same boundary through `ECL_CLOCK`. The change
   reduces each of CCECL's two decode buffers from 16,384 to 16,000 bytes after
   corpus bounds of 13,713 compressed / 13,353 raw Gen1 bytes and 12,000 Gen2
   bytes, leaving 81 bytes of `.COM` headroom in the 2026-09-14 validated build while preserving the v9 layout.
   The installed CoAB `/A 4 /B 34` route still reaches the boundary, and 64
   retained records is not evidence that its source route is complete. Remaining
   work is a lossless, versioned continuation/sidecar that can transport effects
   beyond the fixed tail, plus a retail measurement that does not equate the cap
   to the source effect count.
   **Transport update 2026-09-14:** `CCFLOW` now owns a versioned `GBSL` v1
   sibling stream (`GBSL`, version, count, then `{GBSX event[20], text[34]}`)
   and drives CCECL's exact `GBHD reason=7` state through private no-outcome
   resumes. It publishes the completed terminal effect only after every chunk
   is appended, setting `FX_HAVE_SIDECAR=0x0100`; a normal later invocation
   removes any stale sibling. `ccflow-test.ps1` forces 129 ordered `PICTURE`
   events across two capacity resumes and proves the final native bridge prefix
   and ordinary next invocation remain correct. `CCEFX` streams and size-checks
   every GBSL record, with a 129-record and missing-sibling rejection control.
   **Host-consumer update 2026-09-14:** CCHOST now owns `/D <effect> <roster>`
   for the already-supported automatic party and selected-member/no-save DAMAGE
   policies. The extracted fixed-GBSX scanner preserves GBBOOT's effect/roster
   semantics without using its 196-byte COM margin; its DOSBox fixture proves an
   automatic `1d2+1` DAMAGE applies once, while CCHOST's complete GBHR contract
   remains green. **Sidecar-consumer update 2026-09-14:** CCHOST now validates
   the exact same-stem GBSL v1 extent before it opens GBPR, streams its event
   records through that policy, and rejects a missing, truncated, or trailing
   sibling without roster mutation. Its DOSBox contract covers each case.
   **DoK direct-persistence update 2026-09-14:** fixed and saturated fresh DoK
   DAX streams both use `CCHOST /D`. For a valid compact `GBD1` low source slot,
   it writes current HP to raw `CHRDATA#.GAM` byte 214 while preserving maximum
   HP at byte 40; malformed compact metadata rejects. Distinct-value native tests
   and the 2026-09-24 journal flow confirm current-only persistence and recovery.
   The original combat code reads byte 40 as maximum and byte 214 as current HP;
   the original save/load passes all 216 bytes directly to DOS file I/O. The six
   shipped undamaged saves remain nondiscriminating because those bytes are equal.
   **Resolver update 2026-09-14:** CCFLOW derives its own executable directory
   from the PSP environment and opens the absolute sibling `CCECL.COM`, so a
   tools-directory invocation with the mounted game as the current drive cannot
   resolve the child against game assets. Its DOSBox regression executes CCFLOW
   from a separate mounted `D:` drive and proves the full 129-record replay.
   **Renderer update 2026-09-14:** CCFP now opens only the same-stem sibling,
   validates its exact `8 + count * 54` extent before presentation, streams its
   source-ordered text and PICTURE records, and supports `/Z` over the complete
   count. Its DOSBox regression compares a 129-record stream with a normal
   source-order control and rejects missing, truncated, and trailing siblings
   without rendering partial narration. **Production-route update 2026-09-14:**
   GBBOOT launches CCFLOW for fresh `eng_dax_gen1` ECL runs, and keeps direct
   CCECL for identity-bound cold resumes and fresh HLIB (`DQK`/FRUA) execution.
   DQK area 2 remained live after six saturated chunks (384 records) and 180
   seconds, so a source/host interaction continuation remains required before HLIB
   can use CCFLOW. The DAX route accepts the sidecar flag, invokes CCHOST `/D` for
   its supported DAMAGE policy, and lets CCFP consume the full narration/picture
   stream. GBBOOT tail-record fixtures replace both CCFLOW and CCECL, preserving
   the exact forwarded CCECL tail on either title route.
   **DAX production-contract refinement — closed 2026-09-24.** A real GBBOOT
   fixture without child recorder replacements runs a synthetic DAX ECL1 block
   with 63 `CLEAR_BOX` events, `BEFORE`, supported automatic-party `DAMAGE`,
   and later `AFTER`. The compact control and saturated production route produce
   the same rendered frame; GBSL v1 contains all 66 events in source order,
   including `DAMAGE` then `AFTER` after the fixed 64-event GBSX tail. All six
   source-backed `.GAM` and GBPR records receive exactly one current-HP change
   (60 to 57), preserve max HP 60, and keep every other source byte unchanged.
   A cold ordinary run removes the prior sibling and renders only its own
   `AFTER` event. `native/gbboot-create-test.ps1 -GbslContractOnly` and the full
   standing GBBOOT script pass; the complete 36-flow sweep is **36 PASS / 0
   FAIL / 0 SKIP** on the same source hash. Evidence and limits are in
   `HANDOFF-DOK-HP-2026-09-24.md`. HLIB/DQK saturation remains open: its direct
   CCECL path still needs source/host interaction continuation and a retail
   measurement independent of the event cap. The 2026-09-24 offline route trace
   confirms CCFLOW privately replays capacity chunks without returning to GBBOOT,
   CCHOST, or CCFP between chunks, while GBBOOT applies host effects after its
   selected child returns. The real area-2 ECL.GLB block maps to member 2; its
   1,434 bytes contain 205 statically reachable instruction boundaries, including
   13 INPUT_NUMBERs, 29 PRINTs, 29 PRINTCLEARs, one LOAD_FILES, and one COMBAT.
   Those are distinct boundaries, not dynamic counts or a derivation of the 384
   runtime records. The source trace has not identified the exact cause of the
   384-record measurement. The DQK editor's GETTABLE/SAVE_TABLE audit found
   distinct source rules: GETTABLE narrows the offset to one byte, while
   SAVE_TABLE retains a full word offset and chooses byte/word storage from the
   base operand's type. The real editor uses a code-1 base, so its 16-bit input
   is truncated to a byte when stored. Native Gen2 now mirrors this writer
   width; DAX retains word storage. A focused fixture covers code-1 and code-3
   bases but awaits its DOSBox run. The retail address calculations for editor
   base 1 are GETTABLE offsets 0/255/256/749 => 1/256/1/238 and SAVE_TABLE
   offsets 0/255/256/749 => 1/256/257/750; offset 750 is behind the exit branch.
   The 384-record measurement remains unexplained. Evidence and
   limits are in
   `HANDOFF-DOK-HP-2026-09-24.md`; runtime continuation remains unproven.

   **Static continuation scan — 2026-09-25:** `tools/dqk_ecl_invocation_scan.py
   --follow-capacity` models one full 64-event private replay and stops at the
   next capacity boundary or terminal yield. The full 47-root run visited
   8,538,659 abstract states without truncation and reported 891
   area-root/member/instruction combinations where a party-seed reader follows
   capacity on a unioned route that had encountered DAMAGE. These are
   overapproximated reachability pairs, not concrete path proofs; conditions and
   selectors remain unknown, five header entries are unioned, and no
   map/resource readers are classified. No DOSBox or fixture ran. The next
   source task is to trace a small number of reported roots and establish
   whether DAMAGE and a reader coexist on a realizable route before changing
   host ordering. Details and complete opcode counts are in
   `HANDOFF-DOK-HP-2026-09-24.md`.

   **Trace result — 2026-09-25:** root area 23's unseeded union reports
   post-capacity party readers only for header slot 1 (913,638 states, 142
   sites); slots 0, 2, 3, and 4 report none. Slot 1's pit branch derives
   selector 7 from cell descriptor `0x002d` = 8, reaches DAMAGE at `0x9682`,
   then chains to area 22 slot 1. Since CCECL preserves sparse memory across
   NEWECL, area 22 selects ON_GOTO target 7, `0x9894 EXIT`; its `0x8b6e` and
   `0x9911` readers are not reached on this route. The seeded diagnostic
   confirms no capacity boundary or post-capacity reader for descriptor values
   8 or 12, which reach the `0x9682` DAMAGE site. Descriptor 41 takes the
   invalid-selector fallthrough at `0x83a4` and widens back to the original
   1,211 capacity sites and 142 reader pairs through the untracked `0x013d`
   step loop. This retires only the descriptor-8/12 pairing. Next, trace
   descriptor 41's counter seed and loop exit conditions, then continue through
   other DAMAGE branches. The seeded tracker is limited to its cell descriptor
   and selector temporaries; it does not solve arbitrary VM-memory conditions.
   See the handoff for opcode-level evidence and limits.

   **Next source/host boundary:** keep HLIB on direct CCECL until the
   capacity-to-input transition and host-effect ordering are source-proven.
   GBBOOT launches CCFLOW only for Gen1 DAX. The source/build implementation
   now carries Gen2 raw flags through capacity checkpoints, accepts direct v15
   menus, and lets CCFLOW bind a
   terminal v15 `PARTY_SURPRISE` or `INPUT_NUMBER` event to the final GBSL row.
   CCFP presents those sidecar-backed terminals and emits identity-bound GBMO;
   other accumulated-menu opcodes fail closed. The proposed ownership is
   implemented across CCECL, CCFLOW, GBBOOT's existing host-effect ordering,
   and CCFP, but the HLIB production route is not connected. CCFP preserves
   the pending prompt across the graphics-to-text switch and validates the
   INPUT_NUMBER destination using GBSX operand 2. Static source contracts now
   pin these details. The engine build and focused source checks are the
   offline gate; no DOSBox run has verified display, input, cold resume, or
   exactly-once host mutations.

   The next work is to connect one source-backed HLIB continuation path only
   after the host-effect and accumulated-text ownership boundary is proven at
   capacity immediately before and after both menu opcodes. Acceptance still
   requires source-order text, exactly-once host state, all six flags, pending
   identity, and one-shot answer consumption. The historical 384-record DQK
   measurement remains unexplained. A static walk of area 2's `0x8485` editor
   loop finds `PARTY_SURPRISE`, two `INPUT_NUMBER` prompts, a `SAVE_TABLE` VM
   state write, and a back edge, with no host-effect opcode inside the loop;
   this does not explain the historical run or prove other HLIB paths safe.
   **2026-09-25 static inventory update.** `tools/dqk_ecl_invocation_scan.py`
   now follows literal `NEWECL` chains, carries GOSUB/RETURN state within each
   block, resets it at chain transitions, unions all five header entries, and
   models CCECL's exact 64-record capacity mask. Over all 47 area roots it
   records candidate sites before the first capacity or terminal yield,
   including DAMAGE, ADD_NPC, LOAD_FILES, and GBSX-recorded opcodes. These are
   conservative site combinations, not execution counts or host-application
   proof. The walker does not yet simulate CCFLOW resuming successive capacity
   chunks or interactive answers, overapproximates state-dependent branches,
   and cannot follow dynamic NEWECL IDs. The historical 384-record run remains
   unexplained. **Consumer-map update:** `DAMAGE` is applied by GBBOOT after
   CCECL returns (CCHOST owns the DoK /D path); `LOAD_FILES` prefix state is
   consumed by GBBOOT's map selection; `ADD_NPC`, Gen2 GBSX `LOAD_PIECES`, and
   record-only `TREASURE`/`PROGRAM`/most `CALL` events have no gameplay consumer
   found. CCEFX's output is diagnostic, not application; CCFP handles text and
   picture presentation, with GBBOOT scheduling pre-combat pictures.
   `SAVE_TABLE` and `SPELL` write VM sparse state. **Next:** continue a
   chain-aware walk from each capacity boundary to the next terminal yield,
   marking party/map-state readers after deferred DAMAGE or LOAD_FILES state.
   This will test whether script behavior can observe deferred host state
   across private replay. Keep interactive
   acceptance deferred until DOSBox can run without taking focus. Evidence
   and exact scanner limits are in `HANDOFF-DOK-HP-2026-09-24.md`.

   **HP mapping correction 2026-09-24:** native `/G` imports byte 214 as current
   HP and byte 40 as maximum HP. Direct DAMAGE changes only byte 214. The focused
   CCHOST and CCPARTY contracts use unequal values; the full DoK journal flow
   observed max HP 102 preserved while current HP fell from 102 to 95, and proved
   crash recovery returns the byte-identical committed state. The retail UI trace
   attempt used disposable game copies but did not reach a screen exposing the
   edited character's HP, so it is inconclusive. See
   `HANDOFF-DOK-HP-2026-09-24.md` and `research/dok-chrdata-save-format.md`.

   **2026-09-25 constrained route follow-up.** The seeded tracker now models
   fresh sparse counters `0x013d/0x013e` as zero and preserves them across known
   direct `CALL #1/#2`, per CCECL reset, sparse-read, and handler source. An
   exhaustive 128-descriptor by five-slot area-23 sweep totals 18,476 states
   and reports no capacity boundary or post-capacity DAMAGE-reader site; this
   supersedes the earlier descriptor-41 recommendation within the tracker's
   known-operator model. Area 22 slot 1 with descriptor 6 follows
   `0x829e -> ON_GOTO 0x82e3 -> 0x9059 -> NEWECL #5`. The area-5 slot-1 walk
   still reports eight post-capacity reader sites because position words
   `0x0111/0x0112`, cooldown `0x0097`, and other VM/table conditions remain
   unknown. This is not a concrete DAMAGE-plus-reader witness. Continue by constraining those inputs
   and the relevant table state before changing host ordering or connecting
   HLIB to CCFLOW. No DOSBox or runtime fixture was launched. Details are in
   `HANDOFF-DOK-HP-2026-09-24.md` under “Task 25 constrained route follow-up.”

   **Selector arithmetic refinement — 2026-09-25.** The seeded walker now
   carries fresh `0x0097/0x009d`, optional host position `0x0111/0x0112`, and
   selector cells `0x00ca/0x00cb/0x00cc`; its arithmetic transfer follows the
   CCECL ADD/SUBTRACT/DIVIDE/MULTIPLY handlers plus logical ops and SAVE. A
   source-pinned start at area 22 `0x9059` preserves the selected slot through
   `NEWECL #5`. With diagnostic position `(5,4)`, this still reports 570
   capacity sites and eight reader sites across 259,574 abstract states. Area
   5 slot 1 from `0x8847` reports 609 capacity sites and the same eight reader
   sites across 266,964 states. The position is not established as the retail
   coordinate for this chain, and table values/other memory branches remain
   unknown, so no concrete route has been proven. Focused checks pass 16/16.
   The default unseeded 47-root replay reproduces 8,538,659 states, 10,087
   capacity sites, 891 post-capacity reader sites, eight unresolved chains,
   and zero capped roots; seeded fresh-memory assumptions are limited to the
   optional diagnostic mode.
   Next derive the incoming position and selector/table state from source data,
   then constrain this path before considering host-order changes. See the
   dated handoff for exact commands, sites, and limits.

   **Scanner semantics correction — 2026-09-25.** Native `logic_store` sets
   compare flags from the AND/OR result versus zero, and Gen2 `SURPRISE` is a
   terminal CCECL yield; the tracker now models both. Fresh seeded sparse cells
   `0x0020`, `0x00be`, and `0x00fb` are also modeled as zero until written,
   which bounds area 28's earlier party-enumeration branch. Synthetic checks
   cover the stale-compare regression, terminal SURPRISE, and fresh-zero/write
   behavior; focused scanner/menu checks pass 25/25. The area 28 slot-1,
   descriptor-8 header trace now completes in 360 states with no capacity
   boundary or post-capacity reader, but stops at the interactive yield before
   the later DAMAGE route. The interior `0x9878` slice reports five abstract
   capacity boundaries and one DAMAGE-then-LOAD_CHARACTER pair over 1,243
   states; it lacks incoming event-count, RNG, and continuation state, so it is
   not a complete route proof. Area 22 descriptor 6 at `(4,1)` remains one
   capacity boundary and zero readers; area 23 descriptors 8/12/41 report no
   capacity boundaries or readers. The corrected unseeded 47-root replay is
   8,530,039 states / 9,953 capacity sites / 863 post-capacity reader sites /
   eight unresolved chains / zero capped roots, superseding the previous
   8,500,497 / 9,935 / 863 scan (which superseded 8,538,659 / 10,087 / 891).
   See the dated handoff. Next prove the
   input/continuation boundary that reaches the area-28 interior route, then
   continue the area-22 cross-area selector/table constraints; these reports
   still do not justify broadening fresh HLIB execution through CCFLOW or
   changing host ordering.

   **GBBOOT cold-resume route correction — 2026-09-25.** The live source is
   narrower than the earlier “HLIB stays direct” wording: fresh HLIB execution
   invokes CCECL directly, but `.resume_combat_effect` sends every v15 resume
   through CCFLOW, including Gen2 menu answers. CCECL emits v15 for Gen2 menus;
   CCFLOW explicitly accepts Gen2 status-2 terminal menus and v15 capacity
   checkpoints. A source contract pins both routes. This is existing partial
   production wiring, not runtime-accepted HLIB ownership: no retail DOSBox run
   proves display, cold resume, host-effect timing, or exactly-once answers,
   and private capacity replay bypasses GBBOOT between chunks. Next isolate the
   first fresh HLIB capacity-yield path and determine whether it can reach a
   prompt before the 65th event; keep the 384-record behavior and host-effect
   ordering open until evidence covers those paths. Build passes with GBBOOT
   at 65,150 resident / 130 headroom and CCECL at 63,806 / 1,474. See the dated
   handoff.

   **Area-2 direct-menu boundary — 2026-09-25.** The retail HLIB scan reaches
   its first `/!` prompt before capacity on all five header entries: event 3
   for slots 0/2/3/4 (`0x855E HORIZONTAL_MENU`), event 7 for slot 1
   (`0x808A INPUT_NUMBER`). On the wall-selector route, the answer resumes
   through CCFLOW, then `LOAD_FILES` runs before the editor's
   `PARTY_SURPRISE`; exactly two new recorded events reach that prompt, and
   the editor has no later map/resource or party-effect consumer before its
   next yield. GBBOOT carries the fixed GBEF prefix through the menu and only
   enters its map-preparation path after the script leaves the menu. The
   source also exposed a lost wall caption: direct CCMENU menus omitted prior
   GBSX narration when there was no GBSL sidecar. CCMENU now presents bounded
   fixed PRINTCLEAR/PRINT/PRINT_RETURN/CLEAR_BOX text before horizontal/short
   choices; v14/v15 fixture cases and malformed text rejection are added.
   Engine build and static checks pass, but the DOSBox fixture has not run, so
   visible behavior remains unverified. The 384-event route remains
   unexplained. See `HANDOFF-DOK-HP-2026-09-24.md`, “Task 25 area-2 prompt and
    caption boundary.”

   **Gen2 scanner descriptor fix — 2026-09-25.** Astra found the walker was
   combining corrected operand counts with Gen1 `mnemonic`/`count_at` fields.
   The complete DQK descriptors now define `0x31 SHORT_MENU` as two fixed
   operands plus its counted label tail, and `0x27 TREASURE` as four fixed
   operands plus its counted tail. The retail area-61/member-41 bytes at
   `0x9FF5` decode to a 37-byte menu, with `ON_GOTO` correctly beginning at
   `0xA01A`; its first arm reaches `0xA026` and `COMBAT` at `0xA230`, while its
   other arm reaches the captive-release text at `0xA0A4`. The same encounter
   path has `0xA21F TREASURE #0,#10,#3,#1,#216`, confirming a nonzero counted
   tail in retail data. The full static replay changes its totals to 8,530,039
   states and 9,953 capacity sites; its 863 post-capacity DAMAGE-reader sites,
   eight unresolved chains and zero capped roots are unchanged. The corrected
   combat walk finds 272 header-reachable COMBAT opcodes across 47 areas.
   These are static reachability results. The 612 post-capacity prompt
   candidates remain an overapproximation (event counts 1–64), not 612 proven
   runtime prompts. See the dated handoff for the byte evidence and limits.

   **PARTYSTRENGTH acknowledgement correction — 2026-09-25.** The invocation
   walker now treats DQK `0x1D PARTYSTRENGTH` as a terminal-yield opcode,
   distinct from its `PARTY_SEED_READERS` role. CCECL records an acknowledgement
   token rather than a player answer; CCECL/CCFLOW source checks confirm its
   v15 admission and final-event validation, and a cold resume starts with a
   fresh GBSX count. The scanner requires explicit `--acknowledge VADDR` to
   continue at the following instruction with event count zero while keeping
   DAMAGE-pending reader tracking intact. Retail area 22 member 12 pins
   `0x9091 PARTYSTRENGTH` / `0x9092 NEWECL #5`; default-stop and explicit
   continuation are covered. The `(4,1)` position remains diagnostic only and
   does not establish incoming area-22 host position or cooldown. Corrected
   scanner semantics supersede the prior area-22 capacity claim: the slot-1
   diagnostic trace reaches `0x9091` at event count 3 and has no capacity
   boundary; explicit acknowledgement resets the count and produces later
   `0x9091` events at counts 3/4, still without a capacity boundary or
   post-capacity reader. Focused scanner contracts pass 39/39. Task 22's
   read-only ownership registry is now implemented below; no runtime was
   launched.

26. **Give every native checkpoint a distinct title identity.** `GBCP` currently
   recognizes CoK and DoK identities, while the local session launcher supports
   all thirteen profiles. Version the checkpoint identity contract with stable
   profile IDs and an explicit legacy migration rule. Verify each supported
   profile saves and restores only its own checkpoint; cross-title imports,
   ambiguous legacy records, and malformed IDs must reject before party or
   effect mutation, with pre/post fingerprints identical.

   **Scope constraint confirmed 2026-09-13:** only CoK and DoK currently own
   the shared camp checkpoint lifecycle. Do not stamp the other eleven profile
   IDs into a `GBCP` header by itself: that would promise save/restore behavior
   that does not exist. Each new ID needs its title's natural lifecycle first;
   until then its launcher path must remain explicitly checkpoint-unsupported.
   Existing v1-v4 CoK/DoK records need a documented, unambiguous migration rule,
   never profile-name inference or a permissive fallback.

27. **Partially closed 2026-09-13: extend the packaged VHD selector to every
   verified native profile.** `BuildReleasesVHD.ps1` now derives all thirteen
   `START.BAT` selectors from one `{ selector, GAME folder, marker }` table:
   CoK, DoK, Pool, Curse, Secret, Gateway, Treasures, PoD, NWN, Buck, Matrix,
   DQK, and FRUA. The packaged guest verifier records each selector through
   `GBMARK`, requires the exact `/G 1` tail from its own `GAME\<shortname>` folder,
   and fingerprints every staged directory unchanged. Option-only launch and
   missing-marker rejection remain intact. The held VHD fixtures contain complete
   CoK, DoK, and DQK assets only, so a real DAX non-Krynn game route remains
   open; FRUA remains fail-closed until its event route is decoded.

28. **Ground DQK NPC combat mechanics or reject the route.** The DQK NPC
   loader imports HP, THAC0, and AC but still substitutes `1d2` damage and zero
   XP. The current `DQKNPC` fixture exercises BAKALI SHAMAN (explicitly not an
   NPC) and SHARKMAN, so it is not evidence for `try_dqk_selected_npc`.
   Select a naturally encountered NPC record through that branch, trace its
   damage and award provenance, then decode the demonstrated inputs or emit a
   named source-missing diagnostic. Mutating each claimed input must alter only
   the matching tactical result; cold resume must retain the exact result.
   **2026-09-25 source-route update:** the HLIB ID table maps logical ID 68 to
   member 68 GNOME WARRIOR (`isMonster=0`). Area 64 loads 15 at `0x91F4` before
   `COMBAT 0x91FF`, with a second 9-member wave at `0x9386`/`0x9391`. A
   conditional area-66 descriptor-3 arm can `NEWECL #64`, but that return enters
   the spiders scene through `[0x01A2]` and bypasses the gnome opening. Area 65
   has a direct windship chain that writes `[0x019B]=99` and immediately chains
   to area 64. The additional area-64 gate is resolved for the documented
   area62→64→66→67→65 chain: a reachable-operand census found only area64's
   `COMPARE`, area62's `SAVE #1`, and area64's `SAVE #0` references to
   `[0x019F]`, so the area65 windship return follows the reset. `[0x00C4]==1`
   is not a combat prerequisite: both narration
   branches converge before the player ATTACK menu and ID-68 wave. Retail
   `+0x66` target validation supports the gnomes being same-side under ordinary
   targeting. The interactive action path confirms friendly fire, then reaches
   the normal attack resolver for a selected GNOME WARRIOR; this proves ally
   targetability but not NPC outgoing behavior. Turn dispatch at `0x5ED25`
   uses a `+0x28` type gate, and otherwise requires `+0x37 > 0` plus
   `+0x38 < 0x80` before queue insertion; the PC action path also consults
   `+0xA5`. The combat audit identifies `+0x37/+0x38` as a timed-effect
   duration/type slot, not generic AI/speed fields. It does not test side flag
   `+0x66`, so that flag alone does not establish whether the gnomes get turns.
   Raw MONCHA member 68 has zero `+0x28/+0x37/+0x38`, and the roster builder
   copies its `0x19E` bytes before clearing only the links. Area 64 executes
   `SETUP_MONSTER #255,#1,#44,#0` at `0x918E`; retail handler `0x43071` writes
   the current combatant's `+0x38/+0x37` effect slot through `[0xB20F]`. Resolve
   that pointer, slot lifetime, and any later per-node writes before drawing a
   turn-eligibility conclusion. Member 68 carries five item instances; its
   first ready base-9 item maps to a melee profile of 2d4 vs Large / 1d6 vs
   Small-Medium in retail `ITEMS.DAT`. This does not prove the gnome acts or
   that the fight's attack resolver uses that weapon. See
   `research/dqk-npc-combat-route.md`.
   The loaded gnomes' actor turns and their damage/award path remain open. The
   earlier `#93` candidate was an ID/member mix-up: logical
   93 is DISIR, while SELIAS is logical 114; the area-66 `#93` combat tail is
   also conditionally skipped. The next bounded trace is the area-64
   post-load turn scheduling and whether the loaded gnomes receive actor turns. See
   `research/dqk-npc-combat-route.md`.

29. **CLOSED 2026-09-27: verify DQK secondary-attack cadence.** The
   retail consumer and ordinary two-round behavior are now disassembled, and the
   native source/build plus runtime fixture are prepared. Disassemble one
   original combat-loop route containing a multi-attack creature, establish
   how both bytes schedule attacks across two rounds, and implement only that
   demonstrated behavior. Pin per-round traces, source-byte mutation, and a
   counterexample record; reject unresolved variants rather than approximating.
   **Static trace follow-up 2026-09-25:** The retail `LOAD_MONSTER` path now
   proves the record transfer: handler `0x042C63` stages operands, builder
   `0x043042` calls `0x042CBC`, and that routine resolves a `0x19E`-byte member
   through `0x040415` before copying it into the linked combat roster node.
   Offsets `+0xB3/+0xB4` are inside the copy span and are not among the cleared
   link fields. The generic attack consumer is overlay-0 function `0x26177`,
   reached from `0x26636` at `0x2682C`. It starts with attack kind from
   `(combatant+0x40)+5`, decrements `combatant[0x18F+kind]` before each attack,
   resolves that same kind, retries while its allowance remains, then moves
   from kind 2 to kind 1. Thus kind 1 consumes `+0x190` and kind 2 consumes
   `+0x191`. Per-round setup at `0x24E41` selects kind 2, so the ordinary
   route tries secondary before primary. Encounter initialization sets
   `AE4C=0`; the phase increments after actors, making the first two rounds
   even then odd. The AI route reaches this consumer through `0x26636`.
   Overlay 10's queue function at `0x5B73C` is unrelated. See
   `research/disasm-combat-dqk.md` §10.3. Follow-up candidates now show
   `+0xB3 -> +0x190` and `+0xB4 -> 0x21E4:0x0FFC -> +0x191`; overlay 9
   `0x537B9` is selector 3 in a far-pointer table, but its second argument is
   a 9-byte snake-effect node and its `+3` is that effect's remaining counter,
   not an attack allowance. The shared conversion returns
   `(input + (AE4C & 1)) / 2`; the round path increments `AE4C` after actor
   processing. Static ordinary-route allowances are now pinned: UMBER HULK
   `4/2` gives kind2/kind1 `1/2` on both rounds; PRINCE TALHOOK `3/6` gives
   `3/1` then `3/2`. Full runtime attack traces, target-death and special
   reaction/effect branches remain separate evidence; implementation is limited
   to the ordinary DQK HLIB monster route and other profiles stay unchanged.
   Retail UMBER HULK `4/2` normalizes to `2/1` each round;
   PRINCE TALHOOK `3/6` normalizes to `1/3` then `2/3`. DQK ECL area 23 queues
   the UMBER HULK before COMBAT; area 15 also queues PRINCE TALHOOK before
   COMBAT. Six other records remain structurally unexplained: three have a
   positive second damage profile with zero rate; three have a positive second
   rate without a valid second damage profile. The native decoder allows the
   former and rejects the latter only for a trusted D0xx HLIB handoff. The
   implementation stores primary rate in `C_HALFATT`, secondary rate in the
   low byte of tagged `C_ATTACKS`, and secondary damage in existing `sec_d*`
   arrays. It spends kind 2 before kind 1, preserves zero allowances, and leaves
   NPC, GLIB, DoK, CoK, CoAB and other non-DQK profiles on their old paths.
   `native/build.ps1 -Target cccombat` passes at 64,892 emitted / 65,148
   resident / 132-byte headroom (128-byte floor); the static contract passes
   5/5, and `cccombat-test.ps1` parses. Its prepared cases pin 4/2, 3/6, 1/0,
   0/2, 0/0, independent +59/+60 mutations, and first-two-round profile order.
   Focused docs and capacity claims pass. On 2026-09-27 Luna ran the native
   headless harness: builds, TS parity, DoK fixture checks, all seven DQK
   first-two-round cadence cases, both independent source-byte mutations, zero
   allowances, and `/K` equivalence passed. The observed sequences matched the
   retail-derived kind order and phase exactly. The raw `.BIN` reconstruction
   golden now also records both route cells crossed in round two. The full
   harness then stopped at the separate raw `.BIN` DQK short-tail golden, whose
   round-one combat trace diverges; that decoder/golden issue is outside Task 29
   and remains open. The static
   contract passed 5/5. `pnpm test:corpus` was attempted earlier but stopped
   after repeated Windows fatal access violations in unrelated Unicorn-backed
   CoK oracle tests; no full-suite result is claimed. See §10.3 for evidence and
   limits.

30. **Guest-verify every packaged optional music stream.** Packaging hashes each
   available CoK, DoK, and DQK `GBM`, but guest verification currently exercises
   the CoK stream only. Table-drive root and packaged guest checks for every
   available `GBM1` resource, including framing and manifest hash, and prove an
   unavailable resource remains optional without adding retail assets to Git.

31. **CLOSED 2026-09-13: reject partially decoded combat encounters.** A
   supplied MON archive is authoritative: `CCCOMBAT` now propagates a failed
   member decode out of encounter construction, instead of silently removing a
   later unknown group and publishing a smaller battle's trace, outcome, or
   `GBCR`. `cccombat-test.ps1` stages a valid DoK group followed by absent id
   `0x7fff`, proves all three output files are absent, and checks the named
   rejected-handoff diagnostic. The ordinary combat and real Secret/Gateway
   GLIB MONCHA smokes remain green.

32. **Carry stable title identity through the CCECL roster contract (source/build complete 2026-09-25).**
   **Narrow DQK WHO bridge closed 2026-09-14:** GBBOOT now passes DQK's
   normalized saved-party GBPR through both fresh and cold CCECL tails, so an
   interactive WHO has the actual bounded QSV names rather than silently using
   the `/W` default. The GBBOOT tail recorder verifies all six DQK QSV/cloud
   layouts emit ` /B C:\_GBPARTY.GBP`; the focused DQK playable route remains
   green with the added tail. This does not identify the body as DQK inside
   CCECL, so the broader task remains open. CCECL distinguishes compact GBPR
   layout from CoK using header flag bit 0, but CCPARTY sets that bit for both
   DoK and DQK. This identifies a shared body layout, not the title. GBBOOT
   supplies `/B` for CoK, DoK, and DQK, while direct CCECL `/B` input has no
   expected-title check. Carry a validated title identity through GBPR and
   every fresh/cold CCECL continuation; also prevent CCPARTY from merging
   compact prior records across DoK/DQK. GBPR v2 retains the 16-byte header
   and 410-byte rows, adding a stable title ID and schema revision alongside
   the existing layout flag. CCPARTY merges v2 native slots only for an exact
   title/layout match; ambiguous v1 high-bit members and nonempty DQK QSV state
   fail before output creation. CCECL requires matching `/ID` for v2 before
   imports, keeps v1 CoK behavior, exposes v1 compact names and validated
   shared GBD1 movement only, and never infers DoK XP from that legacy bit.
   Fresh and cold GBBOOT CCECL tails pass `/ID`; CCCOMBAT, CCINV, CCHOST,
   damage recovery, and Python CoK readers validate their supported identities.
   V2 CCCOMBAT imports the producer-verified shared GBD1 combat fields for DoK
   and DQK while keeping DoK raw-record fallback and attack progression gated
   to ID 2. Its count-bounded reader probes EOF after the final declared row.
   Exact extents and original journal/preimage bytes are retained. CCPARTY
   stamps version 2 on identified output; legacy version 1 is limited to the
   untagged migration path. CCINV learning and GBMR construction accept only
   CoK v1/v2 identities, while compact modes remain restricted to import/store/
   load. GBTX recovery validates all v2 identities/layouts and skips DQK
   GAM/WIZ restoration; DoK XP writes require ID 2.
   **Source/build closeout complete 2026-09-25:**
   `python -m pytest tools/test_native_gbpr_identity.py tools/test_cok_inventory.py tools/test_cok_learning.py -q`
   passes 67 tests. `pwsh -NoProfile -File native/build.ps1 -Target engine`
   passes with 130 bytes GBBOOT headroom and 136 bytes CCCOMBAT headroom. No
   DOSBox/UI runtime was launched under the current focus constraint.

   **Gen2 WHO semantic correction — source/build complete 2026-09-25; runtime pending.**
   Retail DQK area 61/member 41 at `0x9FB5` encodes WHO with a 20-byte inline
   prompt, not a destination. The DQK handler at file offset `0x0432A0` copies
   that prompt to its UI and stores the chosen party pointer in engine context.
   CCECL now preserves the mixed prompt/name GBMT payload, uses destination
   `0xffff` for Gen2 WHO, sets the one-based selected-party state after cold
   resume, and leaves sparse VM memory untouched. The existing Gen1 destination
   contract remains. The revised engine source builds within the 64 KiB limit
   with 1,205 bytes of CCECL headroom; the fixture and static source guard cover
   the prompt, `MEM[0014]`, selection, and saved comparison flags. Runtime
   DOSBox verification has deliberately not been run because the available
   desktop session takes focus.

33. **CLOSED 2026-09-13: do not publish a silently truncated encounter.**
   CCECL now halts at the ninth `LOAD_MONSTER` with named halt reason 8,
   discards all earlier queued groups, and clears the encounter flag before a
   COMBAT handoff can be written. CCCOMBAT rejects a declared ninth group and
   validates the complete enemy total against the already-loaded party before
   creating any tactical output. Focused DOSBox fixtures prove no trace, frame,
   outcome, or GBCR is published for a ninth group, for 31 enemies plus the
   two-member fixture party, or for 27 enemies plus a six-member GBPR party.

34. **Apply supported DAMAGE before a combat handoff exactly once.** **Partially
   closed 2026-09-13:** GBBOOT now applies its already-owned fixed automatic
   party and selected-member/no-save DAMAGE policies before it imports a combat
   roster. `gbboot-create-test.ps1` runs a fixed baseline and an otherwise
   identical `1d2+1` DAMAGE-to-COMBAT route from the same normalized GBPR; both
   complete the tactical handoff and every persisted party HP is exactly three
   lower, proving combat-entry ordering and no second cold-resume application.
   Saving throws, random targets, and
   source-RNG damage remain unowned and stay recorded until title evidence
   establishes their semantics.

35. **Apply one source-grounded ADD_NPC recruitment route.** CCECL records NPC
   id and morale in `fx_npc_joins`. **Corrected 2026-10-07:** the earlier text of this
   task said no live host, roster, or combat consumer applied that list, and described
   the Tas route as entering a six-operand `CHECKPARTY` at `0x86D4`. Both are superseded.
   `docs/engine/research/dqk-add-npc-route.md` section 1 shows the `0x86D4` byte lies
   inside a packed PRINTCLEAR string, and that the area-27 guard is the two-operand
   opcode `0x37 LOAD_PIECES` at `0x86DE` (operands `memstr[0x01CA]` and cell `[0x00C0]`),
   which in DQK is a party-by-name lookup (`DQK.EXE` file `0x0434A8`) that matches the
   record name plus the NPC flag bit 7 of record byte `+0x9B` and stores the party index
   or 255 in `[0x00C0]`. Commit `0707533b` gave CCECL that lookup (`loadpieces_gen2`),
   and `f0f6d06e` added the standalone consumer `CCHOST /N` (exit codes 2 full, 4 missing member; **corrected 2026-10-13:** this said "3 duplicate" -- a duplicate exits 0 since `5bd60d15`, 3 is retired). **Also superseded (verified in source 2026-10-07):** GBBOOT
   now calls it: `apply_npc_joins` in `native/src/gbboot.asm` (added by `941b1318`) runs
   `CCHOST /N <GBEF> <MONCHA.GLB> <GBPR>` for DQK whenever `FX_HAVE_NPC` (0010h) is set in
   the effect flags, treats exit 2 (party full) as a reported, deferred join and any other
   nonzero status as fatal; `cacffd79` raised the DQK GBPR cap to 8 rows, so the 7th and 8th
   joins land and the 9th is deferred. What remains: the retail duplicate skip is a script-level branch that CCHOST now models as a logged skip (exit 0, `5bd60d15`; corrected 2026-10-13, this said "rejection"); ADD_NPC's insertion and capacity behaviour in retail was not resolved; and
   no combat, persistence-across-reload, or revisit behaviour is demonstrated end to end.
   Select one retail event and prove the named companion persists, participates in
   combat, and does not duplicate after a cold reload or event revisit. The constrained
   area-61 coffer rescue is not a recruitment route.
   The broad static walk identifies 13 reachable area-root combinations in
   roots 4, 10, 27, 28, 50, and 51; area 27/member 15 reaches
   `ADD_NPC #115,#100` at `0x86F0` and `ADD_NPC #113,#100` at `0x8737` in the
   Hulderfolk encounter, and the Tas join runs only when the `0x37` result in
   `0x00C0` is `255`. The Grunschka route loads `0x01B9` into `0x00C1`, then passes
   a flag and value check before joining. A third Tas join at `0x8A2D` follows Elea.
   See the 2026-09-25 area-27 handoff trace (which carries the superseded
   `CHECKPARTY` reading) and the research note above.

36. **Model CoK's separate dying countdown where source evidence supports it.**
   Current combat preserves a pre-existing dying condition but does not carry
   the retail timer through combat, camp, save, and reload. Pin one CoK route's
   storage and tick semantics, including unconscious/dead boundaries, before
   adding a versioned bridge field and a reload regression.

37. **CLOSED 2026-09-13: isolate packaged VHD state by private session.**
   `START.BAT` requires the 8.3 `GBSESS.OK` marker at the root of a writable
   private session mounted as `D:`. It stages the packaged native `.COM` tools
   and optional title streams at that same private root, then invokes
   `D:\GBBOOT.COM /7`; the short root preserves the DOS 127-byte child-tail
   limit. `GREYBOX.{GBS,TMP,BAK}` and every `_GB*` sidecar therefore belong to
   the mounted player session rather than the shared VHD. The guest verifier
   saves CoK in two separate private sessions through one C: image, cold-reloads
   the first after saving the second, and fingerprints the source snapshot and
   each nested title tree to prove title assets remain unchanged.

   **Reopen the launcher-copy recovery slice.** `New-PlayerSession` currently
   accepts an existing `.source` marker without proving that its first copy
   completed. Publish the marker only after an atomic initial snapshot, or mark
   and recover incomplete snapshots before reuse. The session path must also keep
   an established title runtime stable when source-library membership changes.
   Inject a mid-copy failure, retry, and add/remove a second title while retaining
   an existing CoK save sentinel; require a complete snapshot or an explicit
   pre-launch rejection. Provide the same public preparation path with the
   `GBSESS.OK` marker packaged `START.BAT` requires, not only through the guest
   verifier.

   **Initial-copy recovery — 2026-09-14.** Player sessions now have a separate
   sibling `.complete` marker, written only after `New-RetailStage` returns.
   Reopening requires both source ownership and a matching completion marker;
   a missing or mismatched completion marker rejects before DOSBox can mount the
   tree. `run-goldbox-session-test.ps1` removes the completion marker and an
   asset from an otherwise valid CoK snapshot, then proves `-PrepareOnly` rejects
   it without recreating the marker or asset. Existing complete snapshots retain
   their no-sync preservation semantics. Stable runtime identity under changing
   library membership and the public VHD `GBSESS.OK` preparation path remain
   open.

38. **CLOSED 2026-09-13: preserve a successful party flee through the
   combat-to-ECL handoff.** `CCCOMBAT` now emits `flee` in its terminal trace
   and text sidecar whenever its `GBCR` outcome is 3. CCECL consumes a complete
   case-insensitive documented token only (`party`/`victory`, `flee`, or
   `enemy`/`draw`/`defeat`), with an optional DOS CR/LF for a sidecar file.
   Missing, malformed, oversized, and non-whitespace-trailing values fail
   before the paused continuation is applied or a new effect is written.
   Focused CCCOMBAT, CCECL, and GBBOOT tests pin distinct victory, defeat, and
   flee continuations plus rejection of malformed, trailing, and missing
   sidecars.

39. **CLOSED 2026-09-13: make `run-goldbox -Resume` profile-capable or reject
   it before DOSBox.** The launcher retains its validated CoK and DoK `/5 /!`
   paths and rejects every other resolved profile before the DOSBox check or
   private-session staging, naming the profile and the missing validated
   checkpoint contract. The session test proves that a Pool request fails with
   the named reason and leaves its existing private session byte-identical.

40. **Carry combat UI profile through the pre-combat bridge.** `CCCOMBAT`
   currently uses one generic command bar even though source title vocabularies
   and order differ. `GBHR` cannot carry this descriptor: GBBOOT creates it
   only after CCCOMBAT returns, for CCHOST writeback. Establish an append-only,
   versioned `GBEF` extension (or another pre-combat sidecar) for one measured
   CoK/DQK pair; its parser must reject malformed or future descriptors before
   combat, and the same recorded commands must retain byte-identical tactical
   output.

41. **CLOSED 2026-09-13: finish one normal native CoK start path.** Both
   `run-cok.ps1` and the profile-resolving launcher now start `/E /!` without
   injecting a synthetic `GREY_*` roster. A fresh session therefore reaches
   CCPARTY's existing `[B]egin/[C]reate` gate, while imported and native GBPR
   rosters reload through the same path. `ccparty-test.ps1` now truly reloads
   the exact native-created `NATIVE_F.GBP` that it fingerprints, fixing its
   former unrelated-output persistence check; it passes. Any opened prior roster
   must now be an exact `16 + member_count * 410` GBPR with no trailing byte;
   malformed inputs fail before CCPARTY creates an output, preserving the original
   bytes. The focused smoke covers short and trailing CoK native rosters and an
   intact DoK native cold reload. The two launcher session tests assert the no-injection tail and retain their private-session
   and source-fingerprint checks. CoK's established text selector routes `D`
   to the pinned, non-campaign-mutating `ECL2.DAX#57` / `GEO2#64` boundary,
   exercised by `gbcok-demo-probe.ps1`; `P` continues into the party path.

42. **Partially complete 2026-09-25: establish title-specific fled-status lifetime.** DoK/DQK preserve the
   compact fled condition through a later encounter, where combat correctly
   excludes that member. Trace one source flee-to-exploration-to-new-encounter
   route before changing it, then prove escaped survivors regroup at the
   established point while dead and unconscious members stay inactive. The
   native active-session path is now traced: GBCR condition 3 becomes GBD1 bit
   8, the current GBPR retains it through exploration resume, and the next
   CCCOMBAT imports it as inactive. Cold reconstruction differs: DoK rebuilds
   without copying the condition; DQK overlays it from the previous GBPR row.
   The original DoK `0xB4D2` morale-failure context is a separate field and
   does not establish the retail regroup boundary. A separate status-8 write
   at `GAME.OVR:0x20060` is now recorded as a lead, but its actor side and
   relationship to whole-party escape remain unresolved. No code changed;
   retail teardown/reset evidence and a flee-to-second-encounter acceptance
   fixture remain open. See `research/dok-fled-status-lifetime.md`.

43. **CLOSED 2026-09-13: honor DQK's natural party gate.** Ordinary DQK
   launch requests `/Q /M`; CCPARTY now sends the QSV/QCH-or-native roster
   through the same `[B]egin/[C]reate` gate as every other source rather than
   finalizing it immediately. `gbdqk-create-test.ps1` starts a fresh source
   with no QSV/QCH data, captures the live gate, requires the guest to remain
   awaiting its choice, and proves no empty GBPR is published. Its established
   native-created roster route then covers creation, play, tactical entry, and
   cold reload through the same character-construction and persistence code.

44. **CLOSED 2026-09-13: reject a failed required combat-outcome write.**
   `write_outcome` now propagates create, short-write, write, and close failures;
   both normal and `/F` callers stop before `write_result`, so no GBCR can imply
   a successful handoff. The focused DOSBox gate directs each required outcome
   to a directory while its GBCR path remains writable, requires nonzero exit,
   and proves neither binary result is published. The ordinary GBBOOT combat
   flow remains covered by the full native sweep.

45. **CLOSED 2026-09-14: make ordinary packaged VHD play interactive.** Every normal `START` and artwork/title selector route now
   appends `GBBOOT /!`, matching the local player launchers. `START AUTO ...`
   is the explicit deterministic route for automated probes and preserves the
   former noninteractive tail. The guest verifier captures all normal and
   `AUTO` child tails, and its existing bounded combat/DQK probes use `AUTO`
   so they cannot hang at a player menu. Two independent cold package sessions
   enter CoK's retail `(3,15)` menu through the normal selected front door,
   choose `ATTACK` and `LEAVE` using inherited DOS standard input, and retain
   all source labels plus the descriptor-156 marker before dispatch. Their
   final CCECL records differ (`flags=0020`, advanced RNG for ATTACK;
   `flags=0060` for LEAVE). The verifier fingerprints every immutable title
   file; writable `SAVE\CHRDATA*` remains private-session state. **Follow-on
   correction 2026-09-13:** the un-scripted, non-snapshot `/!` combat handoff
   now selects `CCCOMBAT /K`; snapshots, bounded steps, camp probes, and `/C`
   command tapes retain deterministic `/E`. This makes the existing keyboard
   combat path reachable from ordinary player launches, but does not replace
   the remaining packaged-menu acceptance proof.

46. **CLOSED 2026-09-13: keep the VHD C64 success route out of the failure
   diagnostic.** The generated C64 `START` branch now reaches `:DONE` after a
   successful `D:\GBBOOT` launch. `START` also checks for staged
   `D:\GBBOOT.COM` after `COPY`, so a DOS copy implementation that reports a
   false success still reaches `:RUNTIMEFAIL`. The guest verifier captures a
   successful C64 invocation and rejects the false diagnostic, then exports
   the packaged batch and pins that post-copy guard. DOSBox directory mounts
   ignore host read-only flags and exclusive locks, so they cannot truthfully
   inject a guest-side copy fault; the generated guard is tested directly.

47. **CLOSED 2026-09-14: keep titles separate inside one packaged VHD
   library.** Selected `START` branches pass a validated `/8 1..13` profile
   id to `D:\GBBOOT.COM`. The fixed-width title prefix replaces `_GB` only in
   writable sidecars, so child tails do not grow: CoK uses `COKPARTY.GBP`,
   `COKSESS.GBS`, and `COKSAVE.GBS`; DoK uses the corresponding `DOK*` files.
   CCEFX derives its transcript pair from `<prefix>HOST.BIN`, and CCFP writes
   camp movement traces beside the namespaced wall sidecar rather than into a
   `GAME\<title>` asset directory.

   The manifest-pinned guest verifier stages one held `GAME\COK` + `GAME\DOK`
   library, performs CoK save → DoK save → cold reload of each after deleting
   its runtime sidecars, requires byte-identical per-title continuation and
   checkpoint restoration, requires the two checkpoint bytes to differ, and
   fingerprints every title tree before and after. It also proves the
   namespaced CCEFX transcripts and CCFP camp traces exist. The full DOSBox
   guest run reaches all selector checks with no failed guest call.

48. **CLOSED 2026-09-14: keep a combat turn's action budget through Quick and
   Delay.** `CCCOMBAT` now carries each player's movement and primary-attack
   ledgers by combatant for the current round, clears them with the one-delay
   state at round start, and reloads them when Delay rotates the actor back to
   its order slot. Quick supplies that same remaining state to its AI movement
   and primary swings instead of re-reading `C_MOVE` or `C_ATTACKS`. The
   DOSBox regression proves Move→Delay→Move spends four total squares, a
   partially moved Quick ends at its carried two-square destination, a
   Q-only control retains its original full-budget destination, and a bump
   kill followed by Quick spends exactly the one remaining primary attack.
   Secondary-weapon scheduling remains the existing AI-only behavior.

49. **CLOSED 2026-09-14: execute AI and flee movement one square at a time.**
   `CCCOMBAT` now records Dijkstra predecessors and replays the selected route
   through one shared executor: leaving reactions, destination commit and
   trace, hazards, then Guard reactions. It stops before committing a later
   step when the mover dies. The DOSBox harness proves a fleeing actor is hit
   before its first step, a stay-adjacent control does not invent a reaction,
   and a test-only three-actor fixture proves an AI actor leaving a non-target
   is killed at the departure square with no final move committed.

50. **CLOSED 2026-09-14: retain a player's movement ledger when fleeing.**
   Direct command-bar `F` and `F` selected inside Move mode now pass the
   current turn's remaining movement ledger into `try_flee_step`, matching
   Quick instead of reloading `C_MOVE`. The DOSBox regression starts with a
   four-square player, spends two squares, and proves both entry paths end the
   flee route at the remaining two-square destination. An untouched `F`
   control still reaches the full legal edge destination.

51. **CLOSED 2026-09-14: stop movement on an entered Hold/Sleep hazard.**
   `CCCOMBAT` now checks disabled status after each route step's hazard and
   before post-route AI attacks, and its manual Move path uses the same stop
   rule. The DOSBox fixtures prove a no-save Hold at the first entered cell
   halts AI movement, scripted player movement, and routed Flee before any
   later step or attack; the bounded held control reaches draw without a
   resumed flee route.

52. **CLOSED 2026-09-14: bind every cold ECL continuation to exact source
   content.** `CCBIND.COM` writes a bounded `GBID` v1 sibling containing the
   exact source bytes, source length and reserved-zero header. GBBOOT writes it
   with every published ECL effect and validates it before every cold resume;
   missing legacy siblings reject. `ccbind-test.ps1` proves unchanged sources,
   equal-length byte changes, missing, truncated, trailing and future identities,
   plus `/W` failures for a missing source and an uncreatable sibling, all follow
   the contract. The menu cold-resume smoke proves GBBOOT's sibling
   remains byte-identical to the mounted `ECL1.DAX` across two resumes.

53. **Establish Pool of Radiance and Treasures `SHORT_MENU` contracts before
   enabling them.** Their Gen1 `0x31` occurrences remain recorded-only. Do not
   inherit the DoK/Pools of Darkness compact framing, or the Buck/Matrix
   one-opcode profile, from the shared opcode number. For each title, identify
   its installed title marker and one retail menu route, derive the full operand
   frame and option-text boundary, then prove two distinct answers make only
   their source-defined continuation changes. A wrong marker, truncated frame,
   malformed/future outcome, or cross-title profile must reject before VM or
   roster mutation. Leave either title recorded-only if that evidence is not
   established.

**2026-09-14 follow-up Astra/Opus reconciliation.** Two fresh read-only reviews
of the then-current tree confirmed that item 25 was the highest-leverage production
blocker. The DAX production route above resolves its terminal-flow portion; HLIB continuation remains open. Their source-identity finding is already item 52, so it is
not duplicated. The four distinct findings below were added after checking the live
sources and README claims.

54. **CLOSED 2026-09-14: fail closed when an ECL GOSUB stack is full.**
    `CCECL` now emits `GBHD` reason 9 at the offending opcode when `callsp`
    reaches `CALLCAP=32`; it does not take the former fall-through branch.
    `ccecl-effects-test.ps1` generates 32- and 33-deep local and `ON_GOSUB`
    programs. Both 32-deep controls return and retain their deepest distinct
    mutation. Both 33-deep cases retain depth 32, report their exact PC/opcode,
    and publish no fallback mutation. `ON_GOTO` and `ON_GOSUB` now share their
    identical target decoder, leaving the constrained `.COM` at 65,199 resident
    bytes (81 bytes headroom) in the validated build.

55. **Provide actual C64 first-person walls for `/G 3`.** `/G 3` can select C64
    scene data, but first-person exploration still falls back to DOS wall art;
    this does not satisfy player-selectable platform graphics. Decode one held
    C64 title's wall resource into a source-bound, palette-validated bridge and
    render the same live map pose using DOS and C64 wall selections. The test must
    prove the C64 pixels came from the C64 source while pose, VM, RNG, and party
    state remain identical; missing, malformed, and cross-title C64 wall data
    must reject rather than silently claim C64 output.

56. **Derive Matrix Cubed's real retail map and event start route.** Matrix is
    detected, but its current native map selection treats generic matching
    `GEO*.DAX` data as a fallback rather than proving the title's installed
    startup archive. Inspect the held Matrix assets to establish the actual
    ECL/GEO route and make a natural boot reach its map and title-owned event
    without a direct seed. A marker/archive mutation must reject the named route
    instead of selecting arbitrary matching data, and a cold continuation must
    retain the chosen title and map identity.

57. **CLOSED 2026-09-14: make native executable capacity claims generated and
    testable.** `build.ps1` now emits `native/build/native-capacity.json` after
    every target, with each built tool's emitted, resident, and headroom bytes
    plus a SHA-256 over every path-and-content pair under `native/src`. The
    `test_native_capacity_claims.py` gate rebuilds the full engine, independently
    verifies that source binding and every `resident + headroom = 65,280`
    invariant, then rejects stale current CCECL claims in GOAL, the native README,
    and this registry. Historical measurements remain dated records.
<!-- native-capacity:ccecl emitted=24854 resident=65215 headroom=65 -->

**2026-09-14 local-client audit reconciliation.** A focused Astra review of the
live launcher and `C:\LLM\DOS` image contract found the two distinct tasks below.
They are local-launcher work: item 47 already isolates VHD-selected titles, and
item 17 covers a single resolved profile's private session. Neither covers two
titles selected from the same host library.

58. **CLOSED 2026-09-14: isolate local launcher runtime state by selected title
    in a shared library.** `run-goldbox.ps1` now retains `GREYBOX` for a source
    with one resolved profile and uses `GREYBOX\\<profile>` when the source holds
    multiple title identities. The resolver counts identities before explicit
    selection, so CoK and Pool retain a shared D: session snapshot but never
    share writable C: sidecars. `run-goldbox-session-test.ps1` prepares a
    combined CoK/Pool library, proves distinct runtime mounts and sentinels over
    re-preparation, then proves distinct CoK/DoK cold resumes from one library.

59. **CLOSED 2026-09-14: align local launcher layouts with the advertised and
    packaged title contract.** `goldbox-profile-layout.ps1` is now the shared
    13-title definition used by `run-goldbox.ps1` and its regression. It accepts
    each direct install, root `<folder>`, `GAME\\<folder>`, and retained legacy
    direct-`GAME` form, including `GAME\\DOK`, `GAME\\DQK`, and `GAME\\FRUA`.
    The regression builds every form from that table, checks the corresponding
    DOS `CD`, fingerprints every source, and rejects an ambiguous CoK/Pool
    library before session staging.

60. **Make DOSBox-X GameLink runs non-activating before resuming interactive
    verification. **Implementation added, runtime gates open.** The old long-text
    paging route launched `dosbox_x_debugbox_probe.ps1 -GameLink` with
    `WindowStyle='Minimized'`, then required a visible window. Held DOSBox-X
    source shows GameLink still called `GFX_SetSDLWindowMode` with
    `SDL_WINDOW_SHOWN`. The probe now defaults to hidden launch with child-scoped
    SDL dummy video/audio drivers, enforces the machine-wide GameLink process
    singleton, waits for a valid v4 frame, captures through GameLink, and rejects
    visible-window fallback during readiness polling. `-ShowGameLinkWindow`
    preserves an explicit opt-in to the former mode. Prove keyboard, frame, RAM,
    debugger-console where used, and cleanup behavior in a separate Windows
    desktop/session; no first runtime attempt on the user's active desktop. Luna
    confirmed this session has no separate interactive desktop, so runtime
    verification has not run. Neither parser checks nor static source prove this
    DOSBox-X build's dummy-driver compatibility or non-activation.
    Evidence and caveats: `docs/engine/research/dosbox-x-gamelink-automation.md`.

61. **CLOSED 2026-09-25: decode ECL operand code `0x02` as a 16-bit immediate.** Retail
    DQK.EXE's operand accessor at file offset `0x031E32` selects the word-return routine at
    `0x031E96`; CoAB's `Opperation.GetCmdValue()` independently returns `word` for `0x02`.
    The TypeScript and native readers now return that literal, and TypeScript disassembly marks it
    immediate. Threshold and memory-preservation tests pass. The corrected Pools area-38 reward
    is 50,000 XP. Engine suite: 2,975 passed; native build and DQK source-contract checks pass.
    DOSBox runtime evidence remains open due active-desktop focus concerns; see the 2026-09-25
    entry in `HANDOFF-DOK-HP-2026-09-24.md`.

62. **CLOSED 2026-09-27: explicitly non-launching native verification command.**
    Run `python tools/run_native_static_checks.py` for the reviewed nine-module
    suite; `--check-only` validates the manifest without running pytest. The
    manifest covers native source contracts, documentation/release metadata,
    capacity/build checks, GBPR loader identity, ownership, and the runner's
    own mutation guards. Preflight requires all six categories and every
    module, rejects unreviewed modules, blocks GUI/Unicorn imports and process
    APIs, and permits only Git reads or `native/build.ps1` assembler builds in
    test subprocesses. Mutation tests reject missing categories/modules, a
    DOSBox command, a native runtime test, and GUI imports. The focused command
    passed **89 tests** in 13.42 seconds; it ran no DOSBox, GUI, or Unicorn.
    This is declared source-check coverage only; release runtime gates remain
    separate. Implementation: `tools/native_static_checks.json`,
    `tools/run_native_static_checks.py`, and
    `tools/test_native_static_checks_runner.py`.

63. **ACTIVE 2026-09-27: source-map one real map/position input to the CoK
    effect-7 callback path.** Progress: retail `ECL1.DAX#33` conditionally
    writes `(mapPosX,mapPosY)=(9,0)` through host addresses `0xC04B/0xC04C`
    to `DS:6D85/6D86`; static consumers in `EA67` and the `8EEA -> F991`
    placement path are mapped. New source bytes show `ECL1.DAX#34` stores
    `LastEclBlockId=34`, then its `SearchLocation` can conditionally chain to
    `ECL1.DAX#33` on map selector 34; block 33 checks `LastEclBlockId==34`
    before those position saves, but its `0x8014` initial entrypoint also
    exits when the value equals 33. CoK's own dispatcher candidate at
    `GAME.OVR:0x41D9` maps opcode
    `0x20` to handler `0x1606` (shape similarity 0.9914; trigram Jaccard
    1.0000); it writes the departing global `EclBlockId` into
    `area_ptr+0x1E4` before replacing the global with the requested target.
    Therefore a departing ID of 34 is preserved for block 33's later check.
    CoK's outer interpreter loop receives the handler chain flag, enters the
    restart routine, and calls the ECL interpreter with the fifth parsed
    header pointer. For ECL1#33 that pointer is `0x8014`; this resolves Task
    68's static resume address, but not execution of the script conditions.
    The matching FDF2 call, runtime segment identity, and callback
    input/result are still unproven.
    Task 69 has now mapped the conditional source writers for
    `tried_to_exit_map` and `mapWallRoof`; runtime values remain unknown. Task
    66 maps `Files(GEO 34)` to the `DS:6D7C` loader/consumer contract, Task 71
    resolved the helper's target/ABI, and Task 72 closed the bounded
    path-builder/open source contract. Task 73 mapped the static disk-prompt
    record; Task 74 closed at a conditional same-memory copy-to-query fixture
    with the helper result substituted at its asserted entry. Tasks 76 and 133
    later joined the actual helper, original `Load3DMap`, and EA67 query through
    a bounded thunk bridge; Task 134 follows the map mutation/callback join.
    Continue
    Task 77 bounded the local range helper: it has no direct terrain-cell
    indexing and returns from a separate `DS:6A31` table byte, but passes the
    map pointer to `0x111:0x3E`. Task 78 resolved this original
    descriptor-segment stub, and Task 79 traced its terrain-dependent shared
    table result. Task 80 closed one source-derived cell-to-consumer comparison;
    Task 81 resolved ECL1#33's map-refresh CALL to routine `0xAE11`, which
    refreshes `DS:6D89` but does not directly call `FDF2`. Task 82 follows the
    ECL return toward the separate setup path. Keep unsourced
    inputs open and fixture values separate; do not relax the staged-mutation
    trust boundary. Use static analysis first and only a bounded focusless
    Unicorn probe if it closes a specific producer edge. No DOSBox or GUI. Ranked by Astra after
    Tasks B/C closed at bounded-audit level and Task 62 gained a no-launch
    verification gate. Latest conditional source edge and byte limits:
    `research/cok-composed-startup-capture-2026-09-27.md`.

64. **CLOSED 2026-09-27 at bounded source gap: CoK map data to the
    `EA67 -> E522` candidate consumer.** The selector `0x10B:0x2A/0x2F`
    resolves to descriptor 29, `GAME.OVR:0x3D938/0x3D809`. Both call
    `0x3D7D8` to check `0..15` local coordinates, then index the far pointer
    `DS:6D7C` as `y*16+x`; selector `0x2A` reads a wall-slot nibble at
    `ES:DI`, and `0x2F` reads two-bit door flags from `ES:DI+0x300`. The pointer is
    allocated as `0x400` bytes at `GAME.OVR:0x10247..0x10254`. The map loader
    at `0x3E5A3` formats `GEO%d.DAX` using `DS:5782`, calls unresolved
    `0x69C:0x88E` with its map-id argument and output pointers, then copies
    four `0x100`-byte planes from the returned block (starting at `+2`) into
    `DS:6D7C`. The observed new-game initializer sets `DS:5782=1` at
    `0x10627`, so the archive family is `GEO1.DAX`; its retail blocks are
    `#32` and `#34`, each 1,026 decompressed bytes (first 16 bytes respectively
    `00 04 37 41 30 41 47 34 37 34 30 25 40 35 35 40` and
    `00 04 30 30 20 30 20 20 30 30 22 20 30 20 30 20`). The existing bounded
    VM decode of retail `ECL1.DAX#34` emits `loadFiles(GEO 34)`; CoK's Files
    operand supplies the block ID and `game_area` supplies the archive suffix.
    This is a concrete GEO1#34 candidate on an area-1 path, not a composed
    runtime trace. The ID-to-block resolver at `0x69C:0x88E` and the loaded
    block's join to the later `EA67` call are not proven. This is a
    bounded loader-to-consumer gap, not a producer-to-consumer proof; do not
    identify GEO1 block 34 as the map queried in a composed runtime, infer ECL
    execution, or infer callback output. Static/focusless work only; no DOSBox
    or GUI. See
    `research/cok-map-resource-consumer-2026-09-27.md`.

65. **CLOSED 2026-09-27 at bounded source chain: CoK `Files(GEO 34)` to the
    queried map-buffer contract.** A bounded VM decode of retail
    `ECL1.DAX#34` emits `loadFiles(GEO 34)` (`m36-audit.md`). The CoK `Files` operand
    is the GEO block ID, and `game_area` supplies the archive suffix
    (`firstperson-wall-walk-cok.md` §3.4). Separately, an observed CoK
    initializer stores `DS:5782=1` at `GAME.OVR:0x10627`; when that value
    holds, `Load3DMap` at `0x3E5A3` constructs `GEO1.DAX` and copies the loaded
    block's four 0x100-byte planes from raw offset +2 into the 0x400-byte
    buffer at `DS:6D7C`. The ECL VM effect is not joined to that initializer
    execution.
    `EA67 -> E522 -> E4A0` reaches selectors `0x10B:0x2A/0x2F`, whose resolved
    routines read wall nibbles and door flags from that same `DS:6D7C` field.
    `GEO1.DAX#34` is exactly 1,026 bytes, begins `00 04 30 30 20 30 20 20
    30 30 22 20 30 20 30 20`, and its four planes are independently decoded
    in `geo.ts`. This joins the script-selected candidate and resource layout
    to the consumer contract. It does not prove the ECL effect invoked
    `Load3DMap` in a composed retail execution, that `0x69C:0x88E` selected
    block 34 in that execution, or that both routines used the same runtime
    `DS`/allocation. Do not claim runtime ECL execution, a specific candidate
    result, or effect-7 output. Static/focusless only; no DOSBox or GUI. See
    `research/cok-map-resource-consumer-2026-09-27.md`.

66. **CLOSED 2026-09-27 at bounded source boundary: CoK `Files(GEO 34)` to
    `EA67` buffer contract.** ECL1#34 raw bytes at member offset `0x2A` encode
    opcode `0x21` with GEO block ID 34. CoK's dispatcher at `0x4300..0x4309`
    routes opcode `0x21` to handler `0x1660`; that handler fetches three
    operands, takes operand 1 as the GEO ID, and calls `0x10B:0x43` at
    `0x16CD`. The resolver maps `0x10B:0x43` to `Load3DMap` at
    `GAME.OVR:0x3E5A3`. The loader calls `0x69C:0x88E`, then copies four
    0x100-byte GEO planes into `DS:6D7C`; `EA67`'s selector routines and
    `10B:0x34` read that same symbolic buffer field. This establishes a
    source-level opcode/loader/buffer-consumer contract. Task 71 then mapped
    the helper's ID-indexed record scan and its size/data outputs. The opened
    filename, selected record instance, whether the observed ECL effect
    executed, runtime DS/allocation identity, and whether `EA67` queried this
    same allocation remain open. The VROOMM inventory still leaves the other
    `0x69C` offsets unresolved. Task 70 rejected the packed-file match; Task 72
    tracks the remaining resource/buffer lineage.
    No DOSBox or GUI. Task 63 remains the top-level priority: trusted effect-7
    producer inputs/results.

67. **CLOSED 2026-09-27 at bounded handler/state-update result: CoK native
    `NEWECL`.** The CoAB `commandTable` shape matches CoK `GAME.OVR:0x41D9`
    (token similarity 0.9914, trigram Jaccard 1.0000); its opcode `0x20` row
    points to handler `0x1606`. Handler bytes fetch one target operand, copy
    current `EclBlockId` from `[0x8846]` into `area_ptr+0x1E4`, then replace
    `[0x8846]` with the requested ID and call `4E:34` / `4E:2F` to load/update
    ECL state. CoK's new-game map independently confirms `[0x8846]` is its
    `EclBlockId` and `area_ptr+0x1E4` is the same LastEclBlockId field.
    This establishes preservation of 34 on the conditional `#34 -> #33`
    route. The handler itself sets the interpreter chain/stop flags; Task 68
    traces the outer loop's response. Script condition values and effect-7
    output remain open. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

68. **CLOSED 2026-09-27 at static interpreter-resume boundary: CoK `NEWECL`.**
    Handler `GAME.OVR:0x1606` sets `[0x43B8]` and `[0x43B9]` after loading the
    target block through `4E:34` / `4E:2F`. The interpreter at `0x4449` returns
    on the stop flag; caller `0x4594` observes the chain flag and calls restart
    routine `0x44B3` at `0x469E`. That routine clears the chain flag and calls
    `0x4449` again with `[0x4B41]` at `0x44F8`. The ECL reset routine at
    `GAME.OVR:0x8C29` parses five entry pointers into `[0x4B39]` through
    `[0x4B41]`; `[0x4B41]` is the fifth (initial-entry) pointer in the ECL
    header schema. Retail `ECL1#33` header bytes give that pointer as
    `0x8014`. This proves the static target entry passed to the VM, not the
    script's runtime conditions or its eventual path to the `0x804E` branch.
    Keep full execution, DS identity, FDF2 linkage, and callback input/result
    open. Static only; no DOSBox or GUI. Evidence:
    `research/cok-composed-startup-capture-2026-09-27.md`.

69. **CLOSED 2026-09-27 at bounded source chain: establish the `ECL1#34 -> #33`
    condition inputs.** Retail `ECL1#34` declares `vm_run_1=0x8094`,
    `SearchLocation=0x81DE`, and `ecl_initial_entry=0x8014`. At virtual
    `0x8094..0x80B5`, raw member offset `0x96` computes
    `AND #63,[0xC04F] -> [0x7F79]`, `0x9F` compares `[0x7ED5]` with 1,
    `0xB0` compares `[0x7F79]` with 34, and `0xB7` is `NEWECL #33`.
    CoK's ECL read/write helpers map `[0x7ED5]` to `area2_ptr+0x5AA`;
    routine `GAME.OVR:0x19A2A` clears this word and sets it when its
    `0x10B:0x2F` nonzero branch computes X/Y outside `0..15`, before its
    caller invokes `0xE6:0xDE`. The ECL
    reader maps `[0xC04F]` to `DS:6D89`; routine `0x19AD8` fills that byte
    through `0x10B:0x34`, whose resolved routine `0x3DA3B` reads GEO plane 2
    from `DS:6D7C+0x200`. This establishes source-level producers and
    condition order, not the values or execution on the composed route.
    Runtime GEO block and DS/allocation identity remain open under Task 66.
    Keep block 33's `(9,0,2)` saves and FDF2/effect-7 callback result open.
    Static analysis only; no DOSBox or GUI. Evidence:
    `research/cok-composed-startup-capture-2026-09-27.md`.

70. **CLOSED BOUNDED 2026-09-27: reject the packed-file `0x69C` address
    match.** The apparent `START.EXE` target at packed-file offset `0x744E`
    was compressed data, not the loaded resident routine. Preserve this as a
    correction to the first-pass mapping; the EXEPACK-aware target and ABI are
    closed under Task 71. Evidence: `research/cok-map-resource-consumer-2026-09-27.md`.

71. **CLOSED BOUNDED 2026-09-27: resolve CoK `0x69C:0x88E` target and call
    ABI.** `unpack_complete_load_image` plus the 60M memory snapshot maps the
    complete `0x1AE`-byte routine at image offset `0x724E` to runtime physical
    `0x1724E`; all bytes match after applying 13 local relocation words.
    `Load3DMap`'s two earlier `A46:0x0AC4` calls each leave their destination
    far pointer on the stack because that helper uses `RETF 4` after two
    pointers were pushed. Together with the explicit block-ID word and output
    pointers, this supplies the callee's full 18-byte frame: strings at
    `BP+0x14/+0x10`, ID at `BP+0x0E`, extent output at `BP+0x0A`, and data
    pointer output at `BP+6`. The callee scans a candidate block record by ID,
    zeros outputs on failure, and allocates/reads the selected block on
    success. This does not capture an actual helper invocation or prove the
    later `EA67` buffer identity. See the map-resource research note. No
    DOSBox or GUI.

72. **CLOSED BOUNDED 2026-09-27: map CoK area-path builder and open
    contract.** EXEPACK-aware unpacked START disassembly maps `0x69C:0x2A7`
    to image `0x6C67` and `0x69C:0x780` to `0x7140`. The latter indexes
    `DS:(0x1E4A+0x1E*DS:5782)`, passes selector `DS:5884` to the path builder,
    and tries two candidate outputs. `GAME.OVR:0x1086A` independently uses
    that area slot with selector zero, opens the builder output through
    `A46:0x13C9` (`INT 21h/AH=3Dh`), seeks to byte 2, and reads `0x810` bytes.
    New-game setup writes area 1 and selector zero. Task 73 maps the area-1
    record under observed `DS=0x1BC6` to static disk-prompt bytes; the actual
    call-specific path, selected filename/member, and `EA67` allocation
    identity remain open. This closes only the source-level builder/open
    contract. Static analysis only; no DOSBox or GUI. See
    `research/cok-map-resource-consumer-2026-09-27.md`.

73. **CLOSED BOUNDED 2026-09-27: resolve static CoK area-prompt records.**
    The MZ header reserves `0x105D` paragraphs beyond the load image; under
    observed early `DS=0x1BC6`, `DS:5782` lies in that allocated tail and
    `DS:1E4A` maps to START image offset `0xDAAA`. The 30-byte area-1 slot at
    image offset `0xDAC8` begins `0x17` + `Insert disk 2 in drive ` + NUL
    padding; slots 2/3 carry the analogous disk 3/4 prompts. Both saved
    memory snapshots match the source bytes at physical `0x1DAC8`. The
    `0x69C:0x780` resolver copies the indexed record into its prompt/fallback
    path; it is not the GEO filename. No direct writer to this static table
    was found. The call-specific DS/path and selected GEO member remain
    unresolved. This closes only static record provenance, not Task 63's
    callback input/result. See
    `research/cok-map-resource-consumer-2026-09-27.md`.

74. **CLOSED BOUNDED 2026-09-27: conditional original-code copy-to-query
    fixture.** In one Unicorn memory image, original `Load3DMap` name
    construction and four plane-copy calls wrote retail `GEO1.DAX#34[2:1026]`
    to fixture `DS:6D7C=9200:0000`; original `EA67/E522` then queried that same
    allocation. At helper entry `169C:088E`, the fixture asserted `GEO1`,
    `.dax`, and ID 34, then substituted the separately verified helper outputs
    (extent `0x402`, source `8F00:0000`, retail member bytes); the helper was
    patched to `RETF 0x12` in this joined run. Fixture area 1, selector zero,
    and pose `(7,3)` produced query results `1,0,0,1` for selectors `6,0,2,4`
    at `(1,1)`. The destination SHA-256 was
    `41c4da84def6b42d18e8d91f21226204492c65a1bac7e7afcee7b183f32b4e5f`.
    This establishes a conditional same-memory copy-to-query contract, not
    uninterrupted helper execution, composed ECL/startup, natural runtime or
    pose, DOS behavior, or effect-7 output. The helper result was substituted
    at an asserted boundary; other values were fixture inputs. The overlapping
    descriptor layout and separate invalid-instruction attempt are discarded.
    No DOSBox or GUI. Full evidence and limits:
    `research/cok-map-resource-consumer-2026-09-27.md`.

    **Initial source progress:** `GAME.OVR:0x3E5A3` sends `DS:5782` through
    resident `A46:0x131F` and appends the result to the literal `GEO` at overlay
    offset `0x12E3`; a second local holds `.dax` from `0x12E7`. With area 1,
    the two filename components are `GEO1` and `.dax`. The reconciled 18-byte
    frame passes these as `[BP+0x14]` and `[BP+0x10]`, followed by block ID at
    `[BP+0x0E]`, extent output at `[BP+0x0A]`, and data-pointer output at
    `[BP+6]`. Retail ECL1#34 supplies candidate ID 34, which `0x69C:0x88E`
    compares against DAX record IDs. The corrected disposable Unicorn entry
    supplied a synthetic allocator and DOS fixture; under those conditions the
    helper selected `GEO1.dax`, returned extent `0x0402` and pointer `8F00:0000`,
    and its 1,026 returned bytes matched decompressed retail `GEO1.DAX#34`.
    A second run executed original `Load3DMap` from descriptor `0x10B` with 57
    relocations; it built the strings, called the helper, and copied the four
    planes into fixture `DS:6D7C=9200:0000`. The destination's `0x400` bytes
    matched the retail member bytes `[2:1026]` exactly. Both runs used
    synthetic DOS/allocator state; the callback pointer was supplied from
    START's source-defined initializer contract at image offset `0xA497`.
    Area, selector, and block ID remain separate fixture inputs; no ECL or
    composed startup ran. The joined fixture adds the original `EA67` query
    against the actual copy destination, with the helper result substituted at
    its asserted boundary. Composed path selection and runtime inputs remain
    open. See
    `research/cok-map-resource-consumer-2026-09-27.md`.

75. **ACTIVE (subtask of Task 42): classify retail DoK combatant status 8.**
    Resolve the original callers of `GAME.OVR:0x1FEAA`, trace the combatant
    pointer in `[BP-0x0A]` to its record/list and actor side, classify the
    `0x1F0FC` consumer of `+0xC7 == 8`, and identify the first teardown or
    reconstruction edge that changes that same field. An address-backed note
    must establish either that status 8 is a party-escape state and identify
    its exact downstream reset/writeback edge, or rule that out and name the
    next specific unresolved call/record boundary. Do not change native fled
    behavior until the classification is proved; do not substitute the
    separate morale-context flag. Static retail DoK analysis only; no DOSBox,
    GUI, or emulator. See `research/dok-fled-status-lifetime.md`.

76. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): join the original CoK
    resource helper, `Load3DMap`, and EA67 query.** After executing the original
    START resident initializer at `1A46:0000`, the helper's dispatch pointer at
    `DS:439A` was source-backed and original `Load3DMap` at `H:130D` called the
    original helper at `169C:088E`. Its four original copy calls populated
    fixture `DS:6D7C=9200:0000`; all 0x400 bytes matched retail
    `GEO1.DAX#34[2:1026]` with SHA-256
    `41c4da84def6b42d18e8d91f21226204492c65a1bac7e7afcee7b183f32b4e5f`.
    Original EA67 at `Q:08CD` then queried that same allocation through a
    source-backed bridge from START's selector-`0x10B` thunk to original
    descriptor-29 procedures. At fixture pose `(7,3)`, selectors `6,0,2,4`
    at `(1,1)` returned `1,0,0,1`, reaching `Q:094F`. Area 1, selector 0, ID
    34, destination, workspace, and DOS environment remain explicit fixtures;
    the bridge does not execute the normal VROOMM manager or composed ECL/
    startup, nor establish natural pose or effect-7 output. Focusless Unicorn
    only; no DOSBox or GUI. See
    `research/cok-task76-helper-loader-join-2026-09-28.md` and
    `research/cok-map-resource-consumer-2026-09-27.md`.

77. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): follow one generated
    terrain cell into the CoK effect-7 callback range result.** `EA67` stores
    selector 6's query result at `DS:45E7` and selector 0's result at
    `DS:45E6`; `E63B` branches on the latter and calls `E1E0`
    four times, which writes values 6, 6, 11, and 11 (or `0x17` on the false
    branch) at derived cells in the `DS:6A2E` 50x25 map. `0x38E2E` has no
    direct cell-byte indexing: it toggles header byte +6, passes the map
    pointer to `0x111:0x3E`, and returns from a separate `DS:6A31` table byte.
    This closes at the callee boundary; it does not rule out an indirect cell
    read or side effect through that call. See the research note.

78. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): resolve the
    `0x111:0x3E` map-pointer callee.** In unpacked START, segment `0x111`
    contains an overlay descriptor; offset `0x3E` selects stub 6 with
    procedure offset `0x08D8`. Descriptor base `GAME.OVR:0x3E759` resolves
    the target to `GAME.OVR:0x3F031`. The current runtime-geometry resolver
    does not model this original descriptor-segment route. This corrects its
    earlier unresolved classification. See the research note.

79. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace terrain-aware
    range result through the callback branch.** `0x3F031` calls `0x3EB4A`
    with the combat-map pointer and path candidate coordinates. `0x3EB4A`
    reads map cells through `ES:[DI+7]` at `0x3EBA2`, `0x3EBE3`, and
    `0x3EC1F`, and indexes `DS:1EE5/1EE6` by the terrain byte for path
    candidate scoring/acceptance. Accepted candidates update
    `DS:6A31+3*index`; `0x38E2E` reads this field, shifts it right once, and
    returns the range byte compared against 2 at `0x10E7D`. The `0x3F031`
    callee's own AL is ignored. This is a source-backed terrain-aware range
    path; it does not join one specific EA67-produced cell to a known natural
    position pair or callback. See the research note.

80. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): join one generated
    terrain cell to the callback range result.** The EA67 loop visits
    `DS:45E4=-3, DS:45E5=0`; under explicit `DS:45E6=1`, E1E0's formula
    writes value 6 to cell `(6,10)`. In a separate fresh focusless Unicorn
    consumer fixture with positions `(6,10)->(9,10)`, the range code read that
    cell at `0x3EBA2/0x3EBE3`. Changing only it from default `0x17` to 6 left
    the selected `DS:6A37` byte at 6 and range return at 3, so the mapped
    callback comparison remains not-equal to 2 in either case. The source
    writer byte was supplied from the formula rather than produced by E63B in
    the consumer image; this is not a composed or natural retail invocation.
    No DOSBox or GUI. See the research note.

81. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): resolve ECL1#33's
    map-refresh CALL.** The `0x806B` bytes `2D 01 10 2E` pass through the
    interpreter's `0x3C07` CALL handler and operand cache at `0x8A73`; `0x910D`
    reconstructs `AX=0x2E10`, which normalizes to routine `0xAE11`. That arm
    reads `DS:6D85/6D86`, refreshes `DS:6D89` via `0x10B:0x34`, and may call
    `0xE6:0xDE` (`0x3931B`) for pending state. The block then exits. This
    resolves the script CALL but does not connect its return to AEC9/FDF2 or
    F1C3. No direct `0x5E:0x25` call occurs in the bounded `0x3931B` procedure.
    See `research/cok-composed-startup-capture-2026-09-27.md`.

82. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace the ECL1#33
    post-return caller.** `0x806F` EXIT returns through `0x4449` to restart
    caller `0x4594`, which calls `0x44B3` for the `NEWECL` chain. `0x44B3`
    resumes `[4B41]=0x8014` and, absent another chain, executes secondary
    entries `[4B39]=0x8147` (`vm_run_1`) and `[4B3B]=0x81DC`
    (`SearchLocation`). Conditional cases in `0x81DC` reach encounter setup
    followed by `GOTO 0x8223`, an ECL `0x24 COMBAT` opcode; the values
    selecting those branches remain unknown. Audited fixed caller/helper bodies have no direct AEC9/FDF2
    far call. This closes at the COMBAT opcode dispatcher boundary and does
    not establish its callee or any setup/callback result. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

83. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace COMBAT to FDF2.**
    CoK dispatcher `0x41D9` maps opcode `0x24` to handler `0x2288`;
    `DS:8851 != 0` or `DS:883E != 0` takes its `0x2460` branch through
    `0x24CA` (`0x58:0x25`/AEC9), which calls `0x5E:0x25`/FDF2 at `0xAEE1`.
    The ECL1#33 `SearchLocation` code has conditional cases that set up an
    encounter and jump to COMBAT at `0x8223`. The selected case and both gate
    values remain unknown, so this is a conditional source route, not a
    composed retail invocation. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

84. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): resolve COMBAT gate
    writers.** ECL `LOAD MONSTER` opcode `0x0B` dispatches to `0x0DD1`, which
    writes `DS:8851=1` at `0x122C` on a completed load path. ECL1#33
    SearchLocation has conditional monster-load/setup cases followed by
    `GOTO 0x8223 COMBAT`; that route can set the gate used by handler `0x2288`
    to call AEC9/FDF2. The selected branch and handler completion remain
    unproven. Direct-address stores found for `DS:883E` are zero clears only;
    alias/computed writers are not excluded and are unnecessary for the
    conditional route. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

85. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): evaluate the ECL1#33
    SearchLocation selector for `(9,0)`.** Conditional initial entry loads
    GEO block 32, saves `(9,0)`, and refreshes the descriptor. If its map
    buffer is retail `GEO1.DAX#32`, plane-2 cell `(9,0)` is `0x88`, yielding
    selector 8. **Correction:** original COMPARE/IF handler execution shows
    `word_274==0` skips the following GOTO and uses the descriptor table to
    select `0x8E52` (stairs text, refresh, no COMBAT); `word_274!=0` executes
    `GOTO 0x8242`. A prior note had these arms reversed. This is a
    source-composed data result, not a runtime DS/map-allocation capture. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

86. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace
    SearchLocation's `word_274` gate.** The ECL1#33 operand maps to
    `area1_ptr+0x274`; a corpus scan finds 18 aligned ECL uses, all COMPAREs,
    and no script writer. The field producer/value remains unresolved pending
    a native area-state lifecycle trace. **Correction:** IF_NE at `0x81E8`
    executes `GOTO 0x8242` only when `word_274!=0`; zero skips that GOTO and
    enters map-descriptor dispatch (selector 8 selects stairs for the mapped
    `(9,0)` case). Original native handlers confirmed both cursor outcomes in
    a focusless Unicorn fixture. The nonzero encounter arm requires
    `word_21C==0`, `word_212!=255`, and `word_2C2==0`; opcode 08's bound 99 is
    incremented to 100 by the native handler. `IF >` compares the random
    result (left operand at area2+0x6F2) against `word_208` (right operand at
    area1+0x208). Rolls above the threshold refresh; rolls at or below it
    continue to encounter setup, LOAD MONSTER, and COMBAT, whose completed
    monster-load gate can route through AEC9/FDF2. RNG output/state, runtime
    map/DS/allocations, roster selection, and callback values are not captured.
    Static only; no DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

87. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace CoK area-state
    lifecycle for `area1+0x274`.** The allocated `0x800`-byte area1 workspace
    is cleared by startup and reset through `A46:0x1661`, making `+0x274=0`
    after either clear unless later written/restored. ECL scan found no script
    writer, and five native raw `0x0274` matches decode as unrelated
    branch/immediate constants, not direct member accesses. Aliased/computed
    writes, whole-block restore, and runtime pointer identity remain outside
    this bounded census, so the value at SearchLocation stays unassigned.
    Static only; no DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

88. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace CoK opcode-08
    random result source.** Handler `GAME.OVR:0x0BA9` increments ECL maximum
    99 to bound 100 and calls resident `B5D9`, which calls state updater
    `B628`, then returns `(updated_state >> 16) % 100`, interval 0..99.
    `B628` updates `DS:43AE/43B0` by `state*0x08088405+1 mod 2^32`. A bounded
    focusless Unicorn fixture reached both resident routines with explicit
    `DS`, `SS`, and seed and produced result 7/state `0x3B032B05`; this is not
    a campaign capture. No DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

89. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace CoK
    SearchLocation's encounter threshold source.** ECL1#33 writes
    `word_208=10` on ordinary entry unless `LastEclBlockId==33`; the mapped
    ECL1#34 handoff sets LastEclBlockId=34, so that route executes the write.
    Descriptor-7's `LET HIM GO` branch later writes 20. With random result
    0..99 and the unsigned `IF >`, those thresholds refresh on rolls 11..99
    and 21..99 respectively; rolls 0..10 and 0..20 continue toward encounters.
    No probability distribution is asserted. Other ECL
    blocks reuse the numeric slot in unrelated contexts. No live value is
    claimed. Static only; no DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

90. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace ECL1#33's
    pre-roll state gates.** `word_21C` decrements and exits while nonzero;
    ECL1#32/#33/#34 have post-combat paths setting it to 7. `word_212==255`
    exits before RANDOM, and those same blocks set 255 after mapped combat
    branches. `word_2C2` must be zero; the decoded ECL corpus has one writer,
    ECL1#33 `SAVE #128`, and no ECL reset-to-zero writer. A prior workspace
    clear initializes these fields to zero only if the same area1 allocation
    reaches this route without later restore/write. No invocation is claimed.
    Static only; no DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

91. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace area1
    bulk-copy/restore paths for `+0x274`.** The known `DS:4B28/4B2A` area1
    allocation is 0x800 bytes and startup/reset clear it. The bounded native
    pointer/member audit and aligned ECL census find no direct `+0x274` write
    or later bulk copy/restore in the traced accessor family. The clear is the
    only located producer of zero. Computed far-pointer restores and
    untraced file paths remain outside the proof, so the live SearchLocation
    value stays conditional. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

92. **CLOSED BOUNDED (subtask of Task 63): compose SearchLocation's first
    encounter roll.** Original COMPARE/IF/GOTO handlers confirmed
    `word_274=0` skips GOTO `0x8242` and nonzero takes it. For the roll,
    operand order is random result (`area2+0x6F2`) greater than threshold
    (`area1+0x208`): seed 1 produced 56 and refreshed to `0x8236`; seed
    `0x1234` produced 7 and skipped refresh to `0x8279` at threshold 10. This
    fixture does not compose the entire interpreter through pre-roll gates or
    monster setup/COMBAT. No production campaign capture, DOSBox, or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

93. **CLOSED BOUNDED (subtask of Task 63): compose SearchLocation through
    pre-roll and encounter-setup entry.** With retail ECL bytes and original
    handlers, cursors positioned at opcode addresses passed all three gates
    for `word_274=1`, `word_21C=0`, `word_212=0`, and `word_2C2=0`. Seed 1,
    threshold 10, produced 56 and reached refresh `0x8236`; seed `0x1234`
    produced 7 and reached setup entry `0x828A`. Control cases stopped at
    `0x81ED` (`word_274=0`), `0x825E` (`word_212=255`), and `0x8266`
    (`word_2C2!=0`). Synthetic inputs only; no monster roster or COMBAT is
    claimed. Focusless Unicorn only; no DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

94. **CLOSED BOUNDED (subtask of Task 63): compose encounter tables through
    SETUP MONSTER operand consumption.** Native handler `0x185F` read all ten
    inline tables for indices 0..5; outputs matched ECL payload
    `EclDump_offset+2+index`. Fresh #34-to-#33 entry writes `word_214=0`;
    the ordinary SearchLocation GOTO bypasses the alternate RANDOM writer, and
    its increment occurs after COMBAT. In a joined index-0 fixture, seed
    `0x1234` produced roll 7, table values `0C 1A FF 08 03 00 0C 1A 00 0C`,
    and GOTO `0x8313`. Dispatcher `0x41D9` maps opcode `0x0C` to `0x0D35`
    (the `0x0C55` routine belongs to opcode `0x0A`); original `0x0D35`
    consumed the three operands through cursor `0x831C`. Fixture-only; no
    natural roster/COMBAT or campaign claim. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

95. **CLOSED BOUNDED (subtask of Task 63): trace encounter setup through the
    first LOAD MONSTER invocation boundary.** Retail handlers and bytecode map
    DELAY/APPROACH/GOSUB/CLEARMONSTERS to the first LOAD MONSTER at `0x8325`.
    The preceding one-choice HORIZONTAL MENU at `0x9174` asks to press a button
    or RETURN; no user selection or display/input execution was supplied. The
    index-0 table fixture gives first-load operands `0x0C`, `0x08`, `0x0C`, and
    its second-ID sentinel skips later loads. This does not execute the
    resource-backed LOAD MONSTER handler or assert a natural roster/COMBAT.
    Focusless Unicorn only; no DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

96. **CLOSED BOUNDED (subtask of Task 63): trace encounter menu input and
    first LOAD MONSTER context boundary.** Dispatcher `0x41D9` maps HORIZONTAL
    MENU to `0x1AD9`; `0x4E:0x61` resolves to `0xA2C6` and its event loop
    reaches START's `INT 16h` keyboard poll/read. The Return branch supplies
    zero-based result 0, which handler `0x1AD9` writes to the ECL destination
    `area2.word_6F2` through `0x4E:0x52`. After that conditional result,
    `0x0DD1` first captures encounter/area pointer `DS:6096/6098` at `0x0DD8`;
    its invocation value is absent. No physical key, completed monster load,
    natural roster, or COMBAT result is claimed. Static/focusless only; no
    DOSBox or GUI. See `research/cok-composed-startup-capture-2026-09-27.md`.

97. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace first
    monster-record producer.** Conditional `MON1CHA.DAX#12` is a 409-byte
    HOBGOBLIN record returned through `0x9E:0x3E -> 0x1ECF6`; the service
    constructs `MON<DS:5782>CHA.DAX`, allocates/uses its output record, and
    checks the matching item/special side tables. `MON1ITM#12` exists;
    missing `MON1SPC#12` takes the zero-size branch to shared cleanup. The
    caller's conditional HP/effective-movement scaling and setting producer
    are derived through `0x0EC2`. Runtime suffix, allocation pointers, and
    resource execution remain unobserved. No complete roster, COMBAT, or
    natural encounter is claimed. Static only; no DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

98. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): classify E63B's
    generated terrain bytes at the effect-7 range consumer.** The callback
    wrapper sets map header `+6=1` during range search, which bypasses the
    third-cell `DS:1EE6` lookup. E63B's true/false writes (6, 11, 23) all map
    to 1 through `DS:1EE5`; a focusless original `ContextMachine.range()`
    sweep over 1,249 position pairs with its source cell changed 6<->23
    produced no return difference. This closes only the E63B writer/consumer
    pair, not other map writers or a natural invocation. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

99. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace EA67's sibling
    terrain writers.** `E596`, `E6B8`, and `E890` all call `E1E0`; across
    the four EA67 builders, every source-selected E1E0 input is in `0..24`,
    so written bytes are `1..25`. Every one of these values maps to 1 through
    callback-mode `DS:1EE5`. A direct-call scan found 22 E1E0 callsites, all
    in these four builders. This closes the E1E0 writer family only; other
    direct/indirect map-cell stores remain outside scope. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

100. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace callback-map
    writer E26D.** Direct stores at `0xE3D8/0xE47C` write 26/27 through
    `DS:6A2E`; their `DS:1EE5` values are 2/1. A focusless direct execution
    with declared synthetic selector/flag inputs and RNG seed 2 wrote two
    cells of byte 26 and seven neighboring byte-27 cells. Replacing byte 23
    with 26 at either endpoint in two 1,249-position `ContextMachine.range()`
    sweeps changed no returned range; six source-output position pairs also
    showed no difference. This does not establish a natural EA67 invocation.
    The exact `DS:45ED` source remains open. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

101. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace E26D's GEO
    flag input.** EA67 masks `0x10B:0x34` return bit `0x40` into `DS:45ED`;
    resolved `GAME.OVR:0x3DA3B` reads `DS:6D7C + 0x200 + 16*y + x`, clamping
    coordinates to `0..15`. The complete held GEO1..3 inventory has no such
    bits except ten `0xC0` cells in `GEO2.DAX#64`; candidate `GEO1#32/#34`
    have none. Runtime map-family, selected block, and buffer identity remain
    unjoined. No natural E26D write is claimed. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

102. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): identify the retail
    GEO2#64 script request.** CoK's pinned demo route is `ECL2.DAX#57`; its
    initial entry at `0x8014` reaches `LOAD FILES GEO 64` at `0x8020` before
    later movement and map refresh calls. Task 41 independently pins this
    route to `GEO2#64` and verifies its non-campaign-mutating demo boundary.
    GEO2#64 contains the ten plane-2 `0x40` cells listed in Task 101. This
    establishes a script-selected family-2 resource on that demo route, not
    an ECL1#33 invocation or a shared `DS:6D7C` buffer at the effect-7
    callback. The coordinate query and buffer lifetime across routes remain
    unresolved; no natural callback is claimed. Static/focusless only; no
    DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

103. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): trace the ECL1#34 to
    #33 map replacement.** The `NEWECL` handler preserves departing block 34
    as `LastEclBlockId`; ECL1#33's `0x8014` entry therefore passes its early
    exit check. Its initial path reaches `LOAD FILES GEO 32` at `0x802E`
    before the `LastEclBlockId==34` branch at `0x804E`. The shared loader
    copies all four planes to `DS:6D7C`; conditional on one runtime DS and a
    successful load, GEO1#32 replaces any earlier map contents before later
    #33 processing. ECL2#57's complete listing has no `NEWECL` token and ends
    through its separate demo flow, so its GEO2#64 request does not source a
    transition into this ECL1 route. The composed segment, allocation, load
    result, and later EA67/FDF2 invocation remain unknown. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

104. **CLOSED BOUNDED 2026-09-27 (subtask of Task 63): join the GEO32 source
    request to the map-consumer contract.** ECL1#33's `LOAD FILES GEO 32` uses
    the same opcode `0x21` handler and `Load3DMap` destination contract mapped
    for ECL1#34. That loader copies four planes to `DS:6D7C`; `EA67 -> E522`
    and `0x10B:0x34` read that symbolic pointer. Task 74's same-memory fixture
    executes original loader copies and original `EA67` queries against one
    `DS:6D7C` allocation, but uses GEO1#34 and substitutes the helper result.
    Combined with Task 103, this bounds the GEO32 request-to-consumer source
    chain. It does not establish the ECL opcode's execution, GEO32's runtime
    load result, physical segment/allocation identity, or a composed
    effect-7 callback. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

105. **ACTIVE (subtask of Task 63): capture the conditional ECL transition's
    runtime map identity.** ECL1#33's complete listing has a single GEO
    request: `LOAD FILES GEO 32` at `0x802E`; it has no later GEO reload.
    Conditional on the #34 -> #33 guards and a successful load, this makes
    GEO1#32 the map input for the rest of that ECL block. Task 101 found no
    plane-2 `0x40` flag in GEO1#32. Existing composed-startup evidence includes
    successful FindFirst searches and retail DAX/overlay loads, then stops
    before responding to a later malformed synthetic FindFirst name; it does
    not provide the required runtime join. The saved-image disassembly traces
    that stop through START resolver `0x7140` to path builder `0x6C67` and
    path check `0x6E81`. The saved SS frame now recovers `0x7140`'s inputs:
    basename `2491:3C37` already contains an embedded NUL, while `2491:3BE6`
    is the separate valid `.dax` suffix. START image `0x724E` copies that
    caller input into its local before calling `0x7140`. A later same-invocation
    segment capture maps the copy-writer frame to descriptor 2 at
    `GAME.OVR+0x130B`, after its far call through VROOMM descriptor 28; this
    does not resolve the distinct `4705:01FD` return. Task 109 later proved
    that this invocation's live ECL buffer uniquely matches ECL2.DAX#57, with
    `PICTURE 0` at virtual `0x8355`; it is the demo route rather than the
    conditional ECL1#34->#33 route. The search still has no justified DOS
    response. Continue seeking focusless
    evidence for the map load and later
    `EA67`/effect-7 consumers in one invocation; record runtime DS, `DS:6D7C`,
    loader result, and consumer read addresses. No DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

106. **CLOSED BOUNDED (supporting subtask of Task 105): recover the guarded
    search argument strings.** START image `0x724E` copies `[BP+0x14]` from
    `2491:3CA5` to local `SS:3C37`, and `[BP+0x10]` from `2491:3CA0` to local
    `SS:3BE6`. The saved SS bytes show a Pascal `.dax` at `3CA0` immediately
    followed by the malformed nine-byte basename at `3CA5`; the local copy
    matches, including its embedded NUL. The bad basename therefore predates
    `0x724E` and resolver `0x7140`. Task 107 records its immediate construction;
    the upstream source writer and whether it is retail or synthetic state
    remain unknown. Task 107 later maps the copy-writer frame in the same
    invocation to descriptor 2 at `GAME.OVR+0x130B`; the separate-snapshot
    candidate `GAME.OVR+0x4023D` for `4705:01FD` remains unverified. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

107. **CLOSED BOUNDED (supporting subtask of Task 105): trace the guarded
    search argument-buffer writer and map its source.** A guarded replay's CPU
    write watch shows `1A46:0AFB` copying `76 FC FF 76 FA B0 00 50` from
    `DS:SI=4950:03D8` to caller local `SS:3DC0`; later code copies that prefix
    to `SS:3CA5`, appends `'2'` at `3CAE`, and separately copies `.dax` from
    `4705:00D2` to `3CA0`. The run stops before answering malformed `AH=4Eh`.
    Same-invocation segment matching maps return CS `3DE4` to descriptor 2
    (`GAME.OVR+0x130B`, zero mismatches after 492 relocations) and source DS
    `4950` to descriptor 23's code suffix (zero mismatches after 91
    relocations). Thus `4950:03D8` is `GAME.OVR+0x34EB3`, within instruction
    bytes. The caller's far call at `OVR+0x1306` routes through VROOMM
    descriptor 28, stub 2, proc offset `0x00E4`; START image `0x724E` runs
    during path resolution, rather than directly calling START. This closes the
    immediate writer and mapping
    boundary, but not why descriptor 2's caller reads descriptor 23 code, who
    set the source pointer, or whether the path is retail or guarded-synthetic.
    No DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

108. **CLOSED BOUNDED (supporting subtask of Task 105): explain the descriptor
    2 / 23 source-pointer mismatch.** The Task 107 guarded source-write
    capture records bytes read from `4950:03D8`; a separate early instruction
    trace shows descriptor 28's `LES DI,[BP+0x0E]` reads far pointer
    `4950:03D7` from caller `SS:3DD6`.
    Descriptor-2's call at `GAME.OVR+0x1306` pushes two words and `DS:6DA2`,
    but not this fourth far pointer; the callee slot aliases its caller's
    `BP-6..BP-3` locals. Immediately before the call, the caller copies Pascal
    literal `03 50 49 43` (`PIC`) from `GAME.OVR+0x127C` to `SS:BP-5`, writing
    `03 50 49` over three bytes of that pointer. Captured `BP-6` is stale
    `0xD7`, producing offset `03D7` and segment `4950` (ASCII `PI`). Descriptor
    23 mapping puts `4950:03D7` on opcode `0x57` (`push di`); the bounded-copy
    helper treats it as Pascal length 87, clamps to 8, and copies the following
    eight instruction bytes from `4950:03D8`. This explains the malformed
    basename in this guarded invocation, not why the mismatched argument slot
    is reached or whether normal retail input reaches that route. Tasks 108–109
    explain pointer construction and identify this replay as ECL2#57's demo
    PICTURE 0 path; neither establishes normal retail reachability of the
    intended ECL1 transition. Task 105 remains active independently for the
    conditional GEO1#32 load and later
    `EA67`/effect-7 consumer identity join. The supporting instruction slice
    came from the stock Unicorn runner without the guard; its slice ends before
    malformed FindFirst, and its later synthetic zero-match response and
    instruction-cap loop are excluded. No DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

109. **CLOSED BOUNDED (supporting subtask of Task 105): identify the script
    route behind the guarded malformed search.** The active selector caller
    maps to `GAME.OVR+0x4638`, with script entry `0x8014` and PC `0x8357`.
    Runtime ECL pointer `51D1:0000` matches decompressed retail ECL2.DAX#57
    across all 1,094 bytes with zero mismatches; its bytes at virtual `0x8355`
    are `0E 00 17` (`PICTURE 0`, `IF_NE`). This is the demo script path, not
    conditional ECL1#34->#33, and ECL2#57 has no NEWECL transition. The bounded
    replay stops before malformed FindFirst; a guarded rerun through an adapted
    MZ/DOS Unicorn harness also matched ECL2#57 and delivered zero queued keys
    before the stop, so no keyboard poll preceded that error. This is supporting
    harness evidence, not a native DOS or player-navigation capture. Ordinary
    reachability remains unknown. Task 105 stays active. No DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

110. **ACTIVE (supporting subtask of Task 105): capture the intended
    ECL1#34->#33 transition in a bounded runtime replay.** Identify ECL1#34 in
    runtime memory and capture its `SearchLocation` conditions at `0x80AE`:
    `[0x7ED5]==1` and `([0xC04F]&0x3F)==34`, followed by `NEWECL #33` at
    `0x80B5`. Identify the resulting ECL1#33 buffer by exact runtime bytes and
    capture its entry/PC. Do not synthesize handler results. Use focusless
    bounded Unicorn evidence and stop before malformed FindFirst. The earlier
    CoK-specific replay accepted one key each for raw `0x0002`, BIOS Up
    (`0x4800`), and Enter (`0x1C0D`), but reached demo ECL2#57. With
    `key_rearm_after=1`, 40 Enters, Up+39 Enters, and Escape+39 Enters were all
    consumed in the same startup polling burst and still reached ECL2#57. A
    single uppercase P (`0x1950`) at the default rearm setting also reached
    ECL2#57. The common BIOS key-read return is `1962:031F`, mapping to
    decompressed START image `0x993F` after `INT 16h` at `0x993D`; that P was
    consumed at instruction 770,012, before the trace opened TITLE.DAX at
    instruction 4,173,597. Task 112 now maps this early input against the
    actual Play/Demo selection point. These synthetic startup keys are not
    campaign-selection evidence. Find a validated saved-state or correctly
    timed input route to ECL1#34; keep source-composed fixtures and the ECL2#57
    demo trace separate.
    Task 111 continues the map-loader-to-consumer join. Task 63 remains the
    top-level native priority. No DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

111. **ACTIVE (supporting subtask of Task 105, dependent on Task 110): join
    ECL1#33's GEO1#32 request to an effect-7 consumer.** Within the identified
    ECL1#33 runtime buffer, capture `LOAD FILES GEO 32` at `0x802E`, the native
    helper's resolved resource identity/result, writes to `DS:6D7C`, and a
    later `EA67`/effect-7 read from that same allocation. Record runtime DS,
    source member identity, loader result, destination allocation, and consumer
    addresses in one focusless bounded Unicorn invocation. Do not substitute
    the helper result or use the ECL2#57 demo trace as route evidence. Stop
    before malformed FindFirst. Task 63 remains the top-level native priority.
    No DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

112. **CLOSED BOUNDED (supporting subtask of Task 110): locate CoK's Play/Demo BIOS
    input boundary.** The CoK `CokMidiTracer` consumes even a single uppercase
    P (`0x1950`) at `CS:IP=1962:031F`, decompressed START image `0x993F`, before
    it opens TITLE.DAX; P, Enter, Up, and Escape variants all converge on
    ECL2#57. The first key's live stack returns through GAME.OVR descriptor 34
    at `0x418B6`, where the caller overwrites AL before further processing, so
    that early key is not the menu selection result. A timed replay then armed
    P immediately before START's runtime `displayInput` call at `0x0194`:
    BIOS returned `0x1950`, START returned `AL='P'` at `0x0199`, and the D-only
    demo-flag assignment was bypassed at `0x01B5` with `DS:4B4B=0`. The guarded
    replay reached its 80,000,000-instruction cap while still polling keyboard
    status, before the OVR ECL-assignment hook; it supplied no malformed
    FindFirst result. This closes only the Play/Demo input-boundary question,
    not ordinary-play navigation or ECL36 assignment. Task 114 continues from
    that verified non-demo branch; Task 110 still requires the ECL1#34
    predicates and exact ECL1#33 runtime buffer. No DOSBox or GUI. See
    `research/cok-composed-startup-capture-2026-09-27.md`.

113. **IMPLEMENTED 2026-10-07 (supporting subtask of Task 8): source CoK monster movement
     into the native combatant record.** The native CoK monster decoder leaves
     `C_MOVE` at its fixed 4-cell default, while retail `CalcMoves` consumes
     runtime combatant field `+0x198`; the retail effect-12 callback at
     `GAME.OVR:0x14F0B` may modify that value. A census of all 88 409-byte
     records across MON1CHA/MON2CHA/MON3CHA shows raw `+0x197` mirrors HP at
     `+0x62`, while raw `+0x198` is zero in every record. Retail OVR sites
     `0x3681B` and `0x3755D` copy a record's `+0xD5` byte to combatant `+0x198`;
     the raw MON `+0xD5` values are 6, 9, 12, 15, 24, or 30, but the source
     record identity and raw-to-runtime path are unproved. Trace the original
     load/transform path from selected CoK MON record to combatant `+0x198`,
     including the effect-12 callback boundary. Inventory
     CoK MON records for a movement value other than 4 and define the supported
     1..96 bound and half-square conversion. Acceptance is an implementation-
     ready CoK-only source mapping and focused fixture specification; preserve
     the fixed fallback until the producer and callback inputs are understood.
     Do not change DoK/DQK decoding or claim runtime acceptance. No DOSBox or
     GUI. See `research/disasm-combat-cok.md` and Task 97's record evidence in
     `research/cok-composed-startup-capture-2026-09-27.md`.
     **Status, from source and git (2026-10-07):** the mapping this task asked for is now
     in `native/src/cccombat.asm`. Commit `a5823f0e` reads MON record `+0xD5` (`monraw+213`)
     through `clamp_move_al` (CalcMoves `0x14EB7`: outside 1..96 clamps to 1) into `C_MOVE`,
     citing retail `0x3755D`; `7c3a1a81` does the same for CoK party members from record
     `+0x198` (`partybuf+1+408`). DoK/DQK decoding is unchanged and the 4-cell default
     remains the fallback. The effect-12 callback boundary and DOSBox runtime acceptance
     were not part of those commits and remain unclaimed.

114. **CLOSED BOUNDED (supporting subtask of Task 110): identify the ordinary-play
     post-P input dependency.** A guarded timed-P Unicorn replay from Task 112's
     observed START `0x0199` return (`AL='P'`) and `0x01B5` non-demo branch
     reaches the first BIOS status helper at `1962:0308` (START helper image
     `0x9928`) with no queued key. The saved far-call frame returns to
     `1614:03CD`, from caller `1614:03C8` (`lcall 1962:02FD`). With
     `DS:0x89CE`, `DS:0x8986`, and `DS:0x8A55` all zero, the source-matched
     helper returns AL=0. A no-key continuation reaches `417E:05B5` (linear
     `0x41D95`): its 128-byte live window matches GAME.OVR descriptor `0xFD`
     code offset `0x05A5` / file offset `0x3B3E4` exactly after the three
     caller-segment relocations use START load base `0x1000`. This code is the
     `K`/`M` function-list selector. Its caller is descriptor `0xFD` procedure
     `0x1368`; the active stack contains `Choose a FUNCTION`. The no-key branch
     is captured, but no item, party pointer, ECL assignment, or campaign state
     is selected. The exact boundary is a player key choice in that function
     menu. No party, helper result, or malformed FindFirst response was
     synthesized; no DOSBox or GUI. Task 115 continues from this source-mapped
     menu dependency. See `research/cok-composed-startup-capture-2026-09-27.md`.

115. **CLOSED BOUNDED (supporting subtask of Task 110): resolve the post-P
     function selector and its first source-backed result.** The active list head
     is `5B3F:0000`; following each node's next far pointer at `+0x2A/+0x2C`
     reaches exactly five entries and a null tail: Create New Character at
     `5B3F:0000`, Add Character to Party at `5B48:0000`, Load Saved Game at
     `5B4B:0000`, Initialize Mouse/Joystick at `5B4E:0000`, and Exit to DOS at
     `5C71:0000`. Their eligibility bytes at `+0x29` are all zero. With the
     live default row `DS:6E0F=1`, a timed Enter selects Create New Character;
     descriptor `0xA4` receives `AL='C'` at `GAME.OVR` runtime `4A14:03A9`.
     `DS:08A1=1` selects the original call path to `GAME.OVR` descriptor `0xA4`
     offset `0x06DD`. Task 115 closes at this player-specific character-creation
     dependency, before that routine allocates or initializes a character.
     No character or party was fabricated. See
     `research/cok-composed-startup-capture-2026-09-27.md`.

116. **CLOSED BOUNDED (supporting subtask of Task 110): trace Create New Character to
     its first player-data dependency.** Continue the timed-P, source-backed
     Enter route from Task 115 at `GAME.OVR` descriptor `0xA4:0x06DD`. Static
     source shows this handler requests a `0x199`-byte record allocation through
     `1A46:0x23F` and clears it through `1A46:0x1661`. The latest bounded replay
     reaches `4A14:06DD` and then an `INT 16h/AH=1` availability poll at
     `1962:0308`. The original allocator returned `6109:0000` for 409 bytes,
     and the original clear helper returned with all 409 bytes zero. Static
     source builds the first character-creation menu with the literal `Pick
     Race` and enters the original `FD:0x34` selector; the replay stops at its
     first post-callback keyboard-status poll, before a race or other character
     field is selected. This closes the first-input boundary only; it does not
     create a character or party. No character, party, helper result, or
     malformed FindFirst response was fabricated. Continue toward Task 110's
     ECL1#34->#33 predicates and Task 63's effect-7 producer; Task 111's GEO1#32
     loader/consumer join remains dependent on that route. Use focusless bounded
     Unicorn only; no DOSBox or GUI. See
     `research/cok-composed-startup-capture-2026-09-27.md`.

117. **CLOSED BOUNDED (supporting Task 63): trace the original Load Saved Game loader
     from the verified CoK function menu to held party/campaign state.** The
     same captured list has `Load Saved Game` at node 3. Its `L` branch calls
     selector `0x9E:0x48` at `GAME.OVR:0x20697`; validated resolution maps this
     to descriptor 17, procedure `0x1B34`, `GAME.OVR:0x1F20F`. The repository
     contains `Champions of Krynn/SAVE/SAVGAMA.DAT` and `CHRDATA1.SAV` through
     `CHRDATA6.SAV`. Static tracing confirmed the A-J slot scan, `Load Which
     Game:` prompt, and filename template `savgam` + slot letter + `.dat`.
     The bounded focusless replay selected held slot A, read all 5,469 bytes of
     `SAVGAMA.DAT`, then read all six 409-byte character records from their
     source files. It stopped at the first post-read `INT 16h/AH=1` status poll
     (`1962:0308`, instruction 25,380,783), before any subsequent selection.
     At that boundary `DS:4B28/4B2C/4B30` point to `5091:0000`, `5111:0000`, and
     `5191:0000`; `DS:8846=0`. At the captured reads, the first 2048-byte and
     final 1024-byte SAVGAMA regions still match their source, while the middle
     2048-byte region differs. The character buffers are transformed by the
     original loader before party insertion. This closes the held-file read
     route only, not restored party identity or campaign destination. No save was edited or
     substituted. Do not claim this reaches Task 110's ECL1#34->#33 transition.
     No DOSBox or GUI. See
     `research/cok-composed-startup-capture-2026-09-27.md`.

118. **CLOSED BOUNDED (supporting Task 63): trace held CoK save data into the
     original party list.** The first post-read poll was an empty-queue START
     keyboard-drain helper, not a prompt. Continuing the focusless replay with
     no new key reached `Choose a FUNCTION` at instruction 27,540,945. Runtime
     `DS:609A/609C` and `DS:6096/6098` both point to `6109:0000`; following the
     original `+0x17F/+0x181` links produced six nodes at `6109`, `6123`, `6141`,
     `616F`, `62A8`, and `62D2`, with names matching `CHRDATA1.SAV` through
     `CHRDATA6.SAV` in order and a null tail. `DS:8846` remained zero. This
     closes held-record-to-party-list provenance, not campaign ECL selection
     or Task 110's ECL1#34->#33 transition. No save data changed. Use bounded
     focusless Unicorn only; no DOSBox or GUI. See
     `research/cok-composed-startup-capture-2026-09-27.md`.

119. **CLOSED BOUNDED (supporting Tasks 63 and 110): continue the restored
     party to its next original input boundary.** Task 118 captured
     `Choose a FUNCTION`; live caller bytes identify `GAME.OVR:0x3C411`, whose
     H/P paths call the viewport helper at `0x3C0D2` (argument 0/1). Do not
     interpret these as selected-row movement. The focusless replay sent P, H,
     then Enter, reaching the `Pick Character` / `Select` boundary. Although
     the live memory window contains the literal `Begin Adventuring`, it does
     not capture the selected row. Task 121's extended frame chain shows the
     enclosing dispatcher took AL=`M` at `GAME.OVR:0x205CB`, called the
     `Modify Character` procedure at `0x22B03`, and returned to `0x205DA`.
     Retract the earlier claim that Task 119 selected `Begin Adventuring`.
     The six held characters are present; validated `DS=1BC6` has
     `DS:8846=0`. No save was modified. Focusless bounded Unicorn only; no
     DOSBox or GUI. See
     `research/cok-composed-startup-capture-2026-09-27.md`.

120. **CLOSED BOUNDED (supporting Tasks 63 and 110): statically resolve the
     `Pick Character` selector contract before another key.** The caller at
     `GAME.OVR:0x2A47A` invokes `0xFD:0x2A`; the validated overlay resolver maps
     that public entry to descriptor 26, procedure `0x3E2` at file offset
     `0x3B221`. This is the shared linked-list selector. The caller passes
     `SS:BP-3` as its output byte; the helper initializes it to zero, sets it
     on accepted selection paths, handles Escape as a distinct exit path, and
     returns the selected command in AL. The caller redisplays while that
     output byte is nonzero; otherwise it checks AL against the accepted
     command table at `CS:0x36AC`, passes `DS:6096/6098` to the character
     consumer, and returns Boolean true only when the accepted command is `S`.
     At the captured boundary `DS=1BC6` and `DS:6096/6098` still points to
     the first held party node `6109:0000`;
     the six-node chain remains intact and `DS:8846=0`. The exact character
     row mapping and first ECL assignment are still open. The retained JSON
     does not include `DS:6E0F`, so it does not prove a numeric current row.
     No key was consumed for this static audit, and no save was modified. Focusless bounded
     Unicorn and retail static bytes only; no DOSBox or GUI. See
     `research/cok-composed-startup-capture-2026-09-27.md`.

121. **CLOSED BOUNDED (supporting Tasks 63 and 110): enter the default held
     character from `Pick Character`.** Before the key, the live current-party
     pointer was `6109:0000`, the head of the six-record held chain (Sir
     StrongSword). One source-backed Enter was
     consumed. The next no-key boundary contains the distinct `Modify
     Character` prompt/options, and the caller return maps to `GAME.OVR` file
     offset `0x22D09`, immediately after another call to the same selector.
     In validated `DS=1BC6`, current-party still points at `6109:0000` and
     `DS:8846=0`; no ECL assignment occurred. This closes the default-character
     input transition, not campaign entry. The capture is
     `build/cok-task117-load-save/menu-after-key-10.json`. No save data was
     changed; focusless bounded Unicorn only, no DOSBox or GUI. See
     `research/cok-composed-startup-capture-2026-09-27.md`.

122. **CLOSED BOUNDED (supporting Tasks 63 and 110): map the Modify Character
     exit and its return menu.** The live screen has `Add Subtract Keep Exit`;
     its procedure starts at `GAME.OVR:0x22B04`, with `[BP-0x37]=1` before the
     selector. Five P inputs advance to index 6, where AL=`E` restores the
     saved character fields, updates derived HP state, calls `E6:43`, and
     returns to the outer `Choose a FUNCTION` selector. The mapped main
     dispatcher uses AL=`M` to enter this Modify Character procedure. After
     the source-backed P*5/E/A sequence, the no-key boundary is again
     `Choose a FUNCTION`; `DS=1BC6`, current-party remains `6109:0000`, and
     `DS:8846=0`. This closes the editor exit, not the adventure route. No save
     data changed. Focusless bounded Unicorn and static bytes only; no DOSBox
     or GUI. See
     `research/cok-composed-startup-capture-2026-09-27.md`.

123. **CLOSED BOUNDED (supporting Tasks 63 and 110): inventory the live held-
     party function menu and stop at its unresolved navigation contract.** The
     live 13-slot table contains Create, Drop, Modify, Train, Knight Change,
     View, Add, Remove, Load, Save, Begin Adventuring, Initialize
     Mouse/Joystick, and Exit; enabled slots are 0, 1, 2, 5, 6, 7, 9, 10, and
     12. `GAME.OVR:0x203E2` builds the linked selector, and its captured
     one-based row value `DS:6E0F=1` corresponds to the first enabled entry.
     The earlier H/P-as-selection claim is withdrawn: those branches call
     viewport helper `0x3C0D2`. A bounded P*7/Enter replay entered the
     character picker, not adventuring; a separate single-M replay returned to
     the same function-menu boundary with row value 1. Do not infer that M
     moved this menu. No ECL was assigned and saves remain unchanged. This
     closes the menu inventory, not Task 63/110 or campaign entry. Task 124
     owns the exact per-key selected-row contract. No DOSBox or GUI. See
     `research/cok-composed-startup-capture-2026-09-27.md`.

124. **CLOSED BOUNDED (supporting Tasks 63, 110, and 123): resolve the live function
     selector's per-key row contract.** Reproduce the held-party
     `Choose a FUNCTION` boundary and capture selected-row state immediately
     before and after one source-backed candidate key, then join the result to
     the actual selected-list entry and dispatcher byte. One M probe and one K
    probe each returned to the no-key selector boundary with `DS:6E0F=1` and
    `DS:8846=0`; neither proves row movement for this caller. Keep viewport
    movement, row navigation, and direct command dispatch distinct. Do not
     enter Create/Modify or Begin Adventuring until the row transition is
     proven. One Down-arrow (`AX=0x5000`) also returned to the same boundary
     with `DS:6E0F=1`; source-identified `N` (`AX=0x314E`) likewise returned
     with row 1. Do not treat either candidate as row movement. No save edits,
     DOSBox, or GUI. Selector disassembly shows `I`/`Q` route to the
     page-offset helper only when previous/next-page flags allow it. One `I`
     probe was consumed with `DS:6E0D` word 0 before and after,
     `DS:6E0F=1`, and `DS:8846=0`; it did not establish row movement or a
     dispatcher result. The call passes zero at selector `[BP+0x12]`, which
     disables its conditional I/Q page-scroll branch; I/Q no-op captures are
     therefore not row-navigation evidence. A shortened replay then
     captured one BIOS K word `0x254B` at `1962:031F`, instruction 28,554,752.
     The inner selector frame returns to `417E:15D2` and has `[BP-0x92]=1`;
     `DS:6E0F` remains 1 at the following no-key boundary. The row-update
     branch at source `GAME.OVR:0x3B41B` / runtime `417E:05DC` was not reached.
     Static source maps this byte to the helper's filtered candidate count:
     `0x3C1A7` copies two 40-byte arguments for `0x3B221`, which calls the
     `0x3AF19` filter; the K/M row-update branch is gated by that count being
     greater than one. The captured count of 1 is a filtered candidate-position
     count from the helper's control string, not the visible function-row
     count, and is not reconciled with Task 123's nine enabled menu slots. The
     first `0x614:0x25B` return value was not captured dynamically. Static
     mapping resolves that call to START image `0x639B`, whose ordinary-key
     path returns the BIOS key byte in AL; Enter/Escape take separate
     branches. The K capture's no-key stop is in START image `0x993F` polling
     again after K was consumed, with `DS:6E0F=1`; it did not return a
     selected function command. In this invocation `3B993..3BA4F` checks
     printable-key membership, then searches the copied Select 1! string;
     K and M are absent, so the helper loops for another key. The Select 1!
     filter count of 1 is not the visible function-row count. A Down-arrow (`AX=0x5000`)
     followed by M (`AX=0x324D`) was consumed in one replay; at the next
     no-key boundary `DS:6E0F` remained 1. Static caller `0x20578` reads the
     selected list node's byte at `[DI+1]`. A source join maps captured row 1
     through `0x3AE4E` to table slot 0, whose copied record's byte +1 is `C`
     (Create); Begin Adventuring is enabled slot 10, row 8, byte +1 `B`.
     These bytes are present in the held capture's raw option table, but no
     runtime selected-node pointer or returned dispatcher was captured. The
     candidate-count gate explains why K/M cannot move this row in this
     invocation. Task 132 traced the distinct display-heading and
     key-specification arguments. The current row/list/dispatcher source join
     and captured no-op candidates are bounded; a runtime selected-node pointer
     and returned dispatcher remain uncaptured. No safe source-backed key moves
     the row without dispatch in this call, so Task 125 remains gated. No route
     input was sent.
     Capture: `build/cok-task117-load-save/selector-k-input-boundary.json`.
     See
     `research/cok-composed-startup-capture-2026-09-27.md`.

125. **ACTIVE (supports Tasks 63 and 110): trace Begin Adventuring to the
     first campaign ECL entry.** Tasks 124 and 132 establish the current
     row/list/dispatcher mapping, but the held call has no safe source-backed
     transition to row 8; no route command may be sent until that gap is closed.
     Source-only work located the Begin Adventuring dispatcher branch at
     `GAME.OVR:0x206BB..0x20760`: enabled `B` sets `DS:8985=1`, checks party
     state, stores the selected command at `DS:4B49`, calls initialization
     helpers and `FD:2F`, then returns from the menu function. The subsequent
     START caller tests `DS:4B49==3`, dispatches `128:344` or `128:242`, and
     passes the current party pointer to `E6:2A`. Separately, the known CoK
     new-game ECL switch at `GAME.OVR:0x45D5..0x4611` chooses block 36 when
     `DS:4B4B==0`, installs it at `DS:8846`, and loads the current party
     context; block 36 is in ECL1.DAX and its initial entry is `0x8014`.
     The captured selector caller returns to `START.EXE` image offset
     `0x01FD`; the source-backed continuation reaches image offset `0x02CE`, which calls
     `0x3E:0x25`, resolved to the ECL switch at `GAME.OVR:0x4594`. That proves
     the static route edge. The held-party boundary has `DS:4B4B=0`; Task 126
     captured `area_ptr+0x1E4=0` at `5091:0000`, so the ordinary block-36
     switch predicates hold in this state. The actual ECL assignment and entry
     remain unobserved. Tasks 124 and 132 still gate every route command and
     replay. If
     required held-save state is absent, identify it and stop.
     After a safe row-8 transition is source-backed, at most one bounded
     focusless Unicorn replay may confirm the ECL buffer identity/entry. Do not synthesize script
     results or infer the later #34->#33 transition; no DOSBox or GUI. See
     `research/cok-demo-entry-located.md` and
     `research/cok-composed-startup-capture-2026-09-27.md`.

126. **CLOSED BOUNDED (supports Tasks 110 and 125): resolve the held-party
     `area_ptr+0x1E4` ECL-switch condition.** A focusless Unicorn replay of the
     original held-save load stopped after Q at the no-key function-menu
     boundary. At instruction 28,630,647, `DS:4B28` resolved to `5091:0000`
     and `area_ptr+0x1E4` was `0000`. Together with the captured `DS:4B4B=0`,
     both predicates for the `GAME.OVR:0x45D5..0x4611` block-36 branch hold in
     this state. This does not observe block 36 installed at `DS:8846`, prove
     ECL buffer identity, reach entry `0x8014`, or identify the field writer.
     No route action, save change, DOSBox, or GUI. Capture:
     `build/cok-task117-load-save/menu-after-key-22.json`. See
     `research/cok-composed-startup-capture-2026-09-27.md`.

127. **QUEUED (supports Tasks 63 and 110, after Tasks 124 and 125): trace the
     original new-game ECL1#36 opening to its first authored campaign handoff.**
     Retail `ECL1.DAX#36` has `ecl_initial_entry=0x8014`; the disassembly begins
     with `LOAD FILES GEO 127`, picture block `0x70`, the Inn of the Last Home
     opening text, and a `PRESS BUTTON OR RETURN TO CONTINUE` menu. It then
     saves `LastEclBlockId=36` and the game-area fields before `NEWECL #16` at
     `0x8155`. After Task 124 permits the Begin Adventuring route and Task 125
     confirms the ECL1#36 runtime identity/entry, capture this authored handoff
     in one bounded focusless replay. Record the exact ECL buffer bytes/entry,
     GEO 127 resource identity and load result, menu return/selection, state
     writes, and installed ECL1#16 identity/entry. Resolve each opcode to its
     native handler and record the first unresolved production input if the
     full handoff cannot be captured. Stop before any unsupported resource or
     keyboard result; do not infer a path to ECL1#34/#33 or an effect-7 result.
     No DOSBox or GUI. Static source: `daxdump_extracted/ECL1_036.txt` and
     `research/cok-demo-entry-located.md`.

128. **CLOSED BOUNDED (supports Task 63): map the source writer for the
     graphics-resource table later freed by FDF2.** `GAME.OVR:0x3CA69`, reached
     through `0x0105:0x002A`, frees the previous `0x42`-byte destination table,
     loads `<stem><DS:5782>.dax` through `0x69C:0x088E`, then writes the resource
     count and successful entries through its `[BP+6]` far pointer. It writes
     the header count at base+0, cursor at base+1, four metadata bytes at
     base+8*n-6, and the allocated far pointer at base+8*n-2; the final
     accepted-entry count is stored at base+0. Resident `0x027F:0x1C2F` maps
     to unpacked START `0x441F` and allocates/initializes the pointed graphics
     buffer; `0x027F:0x1CF6` maps to `0x44E6` and frees it. Caller
     `GAME.OVR:0x1D479..0x1D48A` conditionally supplies stem `DS:6DF7`, resource
     ID `DS:6E01`, mode 0, and destination `DS:6DA2`. This corrects the prior
     callback-list classification: these are graphics resources, and FDF2's
     `0x3CEBC` edge performs resource cleanup. The byte-backed writer and one
     caller are mapped; the last successful load reaching a valid FDF2 call
     under the same runtime DS/allocation identity is not. That invocation
     join remains under Task 63. Static bytes only; no DOSBox or GUI. See
     `research/cok-composed-startup-capture-2026-09-27.md` and
     `research/cok-item-removal-native-plan.md`.

129. **CLOSED BOUNDED (supports Task 63): map ECL1#33's direction save into
     F991's selector-dependent placement input.** The ECL save's raw value 2
     targets host address `0xC04D`; the retail setter at `GAME.OVR:0x995A`
     maps value 2 to selector `DS:6D87=4`. F991 indexes the signed-byte tables
     `DS:1ED6/1EDF` with that selector, producing `(0,+1)` as one candidate
     offset before its formation/extent/occupancy checks and F3C6 placement
     writes. The parallel `0x19B9A` updater would clamp `(9,0)` to `(9,1)` if
     those inputs coexist in one memory instance, but this is not a final
     F991 coordinate. The ECL branch, runtime DS identity, FDF2 call, and
     exact placement coordinate remain unjoined under Task 63. No fixture
     coordinate is justified. Static source bytes only; no DOSBox or GUI.
     See `research/cok-composed-startup-capture-2026-09-27.md`.

130. **CLOSED BOUNDED (supports Task 63): census direct absolute writers to
     `DS:6D87`.** The held `GAME.OVR` has 69 immediate references to this
     address, including 17 direct stores: four ECL setter cases (0/2/4/6),
     two initializers (0 and 2), eight H/I/M/Q/P/O/K/G key cases (0..7), and
     three P/K/M map-choice updates (+4/+6/+2 modulo 8). One additional
     reference is a compare; the others are reads/passed inputs. This census
     does not count indirect buffer writes, which Task 131 maps separately,
     and does not identify the production FDF2 writer. No DOSBox or GUI. See
     `research/cok-composed-startup-capture-2026-09-27.md`.

131. **CLOSED BOUNDED (supports Task 63): trace the serialized selector-buffer
     read/write pair.** `GAME.OVR:0x1F20F`'s Load Saved Game path passes
     `DS:6D85`, length 5, to resident `A46:14B4` (START image `0xB914`, DOS
     read); the save path passes the same buffer to `A46:14BB` (START image
     `0xB91B`, DOS write). Task 117's existing focusless trace captured
     `SAVGAMA.DAT` position 5121, length 5, into `1BC6:6D85`; those held bytes
     are `07 0D 00 00 00`, so the loaded selector `DS:6D87` is 0. This is
     saved-file state, distinct from the conditional ECL setter's selector
     4. It does not prove the ECL-to-FDF2 production join. No new DOSBox or
     GUI session. See `research/cok-composed-startup-capture-2026-09-27.md`.

132. **CLOSED BOUNDED (supports Tasks 124 and 125): reconcile the held function
     selector's one-character prompt with its nine enabled rows.** The captured
     `0x3B221` invocation copies `Choose a FUNCTION` and `Select 1!`; its
     parser reports one candidate, which disables K/M row movement while Task
     123's separate linked list contains nine enabled entries. The two
     CS-relative strings are separate caller arguments:
     `CS:0x12A` is `Choose a FUNCTION` (display heading) and `CS:0x13D` is
     `Select 1!` (parser input). `0x3C1A7` forwards the latter to the
     `0x3AF19` candidate parser and the former to the display path, so the
     one-candidate count is not derived from the nine linked-list rows. K/M
     are absent from the input string, and their row-update branch requires
     more than one candidate. No safe source-backed non-dispatching row-change
     key exists in this held invocation; preserve the route gate. Static
     evidence only; no key, DOSBox, or GUI. See
     `research/cok-composed-startup-capture-2026-09-27.md`.

133. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): resolve the selector
     `0x10B` bridge needed by EA67.** The normal VROOMM route from the bounded
     image terminated with `AL=0xD0` before `Q:094F`. START's thunk bytes at
     `110B:002C/0031` contain procedure offsets `0x6A2/0x573`, and the overlay
     descriptor map resolves selector `0x10B` to descriptor 29. A bounded
     bridge at resident handler entry `1A46:00D7` used only that saved INT
     frame and source-mapped thunk target to dispatch the original procedures,
     preserving the caller's far-return frame. EA67 reached `Q:094F` and read
     the original `DS:6D7C` map allocation. This does not establish normal
     VROOMM startup/manager state or natural runtime. See
     `research/cok-task76-helper-loader-join-2026-09-28.md` and
     `research/cok-map-resource-consumer-2026-09-27.md`.

134. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): continue the same-image
     actual-map query through E63B's conditional writes.** After Tasks 76/133
     joined the original resource helper, `Load3DMap`, and EA67's first queries,
     EA67 continued to its return sentinel through a thunk-to-descriptor bridge.
     It called `Q:04A1` (E63B) 65 times and wrote into fixture map pointer
     `DS:6A2E=9400:0000`, a 1,257-byte allocation (7-byte header plus 1,250
     cells) prefilled with `0x17`. The original loop made 1,428 writes across
     all 1,250 cell addresses; 538 bytes differed from the fill at return
     (full allocation SHA-256
     `3278107c32bf130c49cfd29b4da8f9fe2e2b171a5d88b75e9a5bac87dd77660f`).
     The normal VROOMM manager/ECL caller, production map workspace, natural
     pose, and downstream effect-7 callback remain unproven. See
     `research/cok-task76-helper-loader-join-2026-09-28.md` and
     `research/cok-map-resource-consumer-2026-09-27.md`.

135. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): pass EA67's actual
     mutated map allocation through the original range wrapper.** Without
     clearing or copying fixture `DS:6A2E=9400:0000`, the same Unicorn image
     called original descriptor-24 procedure `0x38E2E`. A thunk bridge routed
     its calls to descriptor 31 procedures `0xBCB/0xBF3/0xC1B` and descriptor
     30 procedure `0x8D8`. With explicit combat records and positions
     `(6,10,1)` and `(9,10,1)`, the wrapper read that same map and returned
     range 3. Cell `(6,10)` was still `0x17` in this pose/loop fixture, so the
     result matches Task 80's default-map control and does not show a terrain-
     driven change. This closes only the same-buffer range call; the caller
     comparison at `0x10E7D`, FDF2, and production context remain open. See
     `research/cok-task76-helper-loader-join-2026-09-28.md` and
     `research/cok-map-resource-consumer-2026-09-27.md`.

136. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): carry range result 3
     through the original `0x10E7D` caller comparison.** The same memory image
     executed descriptor-12 procedure `0x0208` with the actual Task 135 range
     wrapper and explicit two-record fixture. The compare at relative `0x0295`
     observed 3 and took `JAE 0x02F8`. That arm called descriptor-23 procedure
     `0x1261` through `0xDB:0x52`; its common tail called descriptor-24
     procedure `0x12F8` through `0xE6:0x57`. The procedure returned to the
     sentinel with `AL=0xFC`; this invocation did not enter FDF2. It does not
     establish the upstream production caller or natural effect-7 result. See
     `research/cok-task76-helper-loader-join-2026-09-28.md` and
     `research/cok-map-resource-consumer-2026-09-27.md`.

137. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): audit fixed far-call
     entries into descriptor-12 procedure `0x0208`.** The runtime-geometry
     resolver maps this procedure to public stub `0x65:0x43` (descriptor 12,
     stub index 7). The validated fixup/call-route inventory contains no fixed
     far call to that stub or procedure. It does contain two fixed calls from
     descriptor 11 into descriptor 12, targeting stub 2 / procedure `0x0082`
     and stub 1 / procedure `0x38EA`; neither is the `0x0208` entry. Thus
     Task 136's direct invocation is not joined to a statically encoded caller,
     and a dynamic callback/table dispatch remains the missing edge. This
     bounded negative inventory does not establish that the runtime route is
     unreachable, nor does it connect the callback to FDF2. See
     `research/cok-task137-callsite-audit-2026-09-28.md`.

138. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): join the selector-65
     callback table to its indirect dispatcher.** Descriptor-12 procedure
     `0x38EA`, called from descriptor 11 at `GAME.OVR:0x108D2`, stores the far
     pointer `0x65:0x43` at `DS:6BB0`. The public stub resolver maps
     `0x65:0x43` to descriptor-12 procedure `0x0208`. Descriptor-23 procedure
     `0x01A8` at `GAME.OVR:0x34153` calls through `[DI+0x6B94]` when
     `DS:0x713C==0`, with `DI=4*[BP+0x10]`; index 7 therefore selects
     `DS:6BB0` and calls `0x65:0x43`. Static callers to procedure `0x01A8`
     exist, but the selected index, runtime DS identity, and FDF2 relationship
     are not established. This corrects the initial Task 138 interpretation:
     the generated words are stub offsets, and the table does contain `0x43`.
     Task 142 follows the caller-supplied index through original execution.
     See `research/cok-task137-callsite-audit-2026-09-28.md`.

139. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): classify descriptor 12's
     absolute indirect far-call candidate.** Procedure `0x26A5` calls through
     `DS:6EDE` at `GAME.OVR:0x1329F` when its `0xDB:0x4D` check returns 1.
     The only direct writer reference found for that absolute slot is
     `GAME.OVR:0x3372D`, which stores far pointer `0xBA:0x0101`; runtime
     geometry resolves that to descriptor 22 stub 45 / procedure `0x320F`.
     This is not the source pointer `0x65:0x43` required for Task 136. The
     writer and call use the same DS-relative address, but their runtime DS
     identity and call-time contents were not captured, so this rejects only
     the static source candidate. Task 140 searches the remaining indirect
     dispatch sites and pointer producers. See
     `research/cok-task137-callsite-audit-2026-09-28.md`.

140. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): enumerate the indirect
     far-call tables relevant to the callback entry.** Prologue-bounded
     disassembly found the descriptor-12 `[0x6EDE]` call, descriptor-22
     `[0x6E3A]`/`[DI+0x6E3A]` calls, and descriptor-23 `[0x6D74]` /
     `[DI+0x6B94]` calls. The direct writers identify `[0x6EDE]` as
     `0xBA:0x0101`, `[0x6E3A]` as `0xBA:0x0034` or `0x88:0x0066`, and
     `[0x6D74]` as `0x65:0x0228`. The indexed table beginning at `0x6B94`
     contains the `0x65:0x43` entry at slot 7. This bounds the static route;
     runtime selection and DS identity remain open. Task 142 traces the
     selected index and FDF2 relationship. See
     `research/cok-task137-callsite-audit-2026-09-28.md`.

141. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): census fixed callers'
     callback indices.** The validated call-route inventory finds twelve fixed
     calls to descriptor-23 procedure `0x01A8`. Their first-pushed index words
     are descriptor 12: `0x2B`, `0x2C`, `0x4D`; descriptor 19: `0` or `1`;
     descriptor 22: `0x0B`, `0x17`, `1`, `0x40`, `3`, `0x0B`, `0x1B`,
     `0x2A`. The descriptor-19 caller sets `DS:0x713C=1`, selecting the fixed
     `0x65:0x228` branch rather than the indexed table. None of these fixed
     callsites selects slot 7 / `0x65:0x43`. The runtime DS identity and any
     indirect far callers remain unknown. Task 142 audits the bounded far
     call census and discovers a separate same-descriptor near-call route.
     See
     `research/cok-task137-callsite-audit-2026-09-28.md`.

142. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): audit fixed and indirect
     far-call paths into the callback dispatcher.** Twelve validated fixed
     calls reach descriptor-23 procedure `0x01A8`; none selects indexed slot 7
     with `DS:0x713C==0`. A prologue-bounded scan found eleven indirect far-call
     sites across descriptors 12, 22, and 23. Their static pointer/table
     producers resolve to selector 0xBA, 0x88, or selector-0x65 callbacks;
     none is another indirect callsite to procedure `0x01A8`. Separately, the
     mode-4 dispatcher at `0x34527` passes effect ID 7 to helper `0x342FD`,
     whose near call at `0x3420F` reaches wrapper `0x34153`. The helper passes
     its target segment at `0x3420F`, but a second near call at `0x34495`
     passes helper `[BP+6]`—the effect ID—as wrapper `[BP+0x10]`, the table
     index. The mode-4 path can therefore select slot 7 if the helper's local
     guard at `0x34479` is set. The production guard, `DS:0x713C`, and table
     DS identity are unresolved. Task 143 traces this guarded route and the
     other bounded near callers, then checks the callback and FDF2
     relationship. See
     `research/cok-task137-callsite-audit-2026-09-28.md`.

143. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): identify the mode-4
     effect-7 callback route and its first unproven natural input.** Static
     bytes show `0x34527 -> 0x342FD`; the guarded call at `0x3420F` may clear a
     nonzero `DS:0x713C` through `0x65:0x228` / procedure `0x3888`, and later
     call `0x34495` can pass effect ID 7 as the callback index when local
     `[BP-0xE1]` is set. Existing focused Unicorn coverage executes
     `0x14F24 -> 0x34527 -> 0x342FD -> 0x10DF0` and observes the allocated
     owner context, but its overlay, allocator, and DS state are fixture
     inputs. No natural attack invocation has yet joined the call guards,
     gate lifetime, runtime DS identity, and table contents. The other bounded
     near callers pass indices `0x1E` and `0x1F`. Task 144 sources the natural
     attack entry and instruments both wrapper calls; do not infer the gate
     value from a reset alone or claim FDF2 reachability from the fixture.
     Headless static bytes/Unicorn only; no DOSBox or GUI. See
     `research/cok-task137-callsite-audit-2026-09-28.md`.

144. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): map candidate attack
     caller gates before the natural effect-7 callback join.** The relocated
     call map finds two callers of `0x88:0x5C -> descriptor 13 procedure
     0x1A45` at `0x167AF`: descriptor 8 at `0x0BF1C` and descriptor 9 at
     `0x0D67D`. Descriptor 8 passes a target far pointer and zero candidate-
     pair words. Descriptor 9's caller is procedure `0xD270`; it computes a
     candidate pair, checks E6:`0xED`, and may clear the pair through E6:`0xC0`
     before the fixed call. Its containing descriptor-9 routine reaches
     `0xD270` from `0xC572` at `0xC755` only after `0x88:0x84` returns nonzero
     and target-body fields `+3 > 0` and `+0x189 != 0`. This makes descriptor
     9 the stronger static route candidate, without proving those predicates
     or inputs occur on a natural attack. A one-off Unicorn hook on the
     existing direct-`0x14F24` fixture observed `0x34495` with `[BP-0xE1]=1`,
     `DS=0x5000`, gate zero, wrapper mode zero, index low byte 7, and selected
     far pointer `0x65:0x43`; it did not observe `0x3420F`. That remains
     fixture evidence. Task 145 joins the candidate caller to original
     initialized combat/member state and then traces both `0x34153` entries
     from `0x342FD`, recording guards, DS/table identity, gate writes and reset
     callback. Stop at the first fixture-installed producer, and do not infer
     startup state from the direct-call fixture. Establish whether the
     source-backed path reaches `0x65:0x43` / procedure `0x0208`; FDF2 remains
     separate unless the trace supplies it. Static bytes and Unicorn only; no
     DOSBox or GUI. See `research/cok-task137-callsite-audit-2026-09-28.md`.

145. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): map the natural attack
     caller chain and fixture boundary.** Descriptor 2 calls descriptor 8
     public procedure `0xAEC9` at `0x24CA`. Its `0xAFF7` list builder clears
     `DS:0x71AE..0x72CD` and seeds the list from active pointer `DS:0x609A`;
     `0xAEC9` calls iterator `0xB162` for list entries. `0xB162` calls
     descriptor 9 procedure `0xC572` directly when the target's context byte
     `(body+0x183)+3 > 0` and body `+0x18B != 0`, otherwise it calls menu
     routine `0xB2CA`. The menu action
     `'D'` calls `0xBF73`, whose action-`A` branch also calls `0xC572`. The
     available `0xAEC9` Unicorn probe enters directly with a synthetic held
     member and stops at START support instruction `0xAF43` on the
     uninitialized source-pointer word at `SS:0xEEAA` (`DS=SS=0x5000`), before
     list iteration at `0xAFA6`; no attack helper or wrapper entry occurs. The
     enclosing descriptor-2 dispatcher routes event byte `0x24` through
     `0x2288`, then calls `0xAEC9` at `0x24CA`, but that event frame and its
     setup globals are absent from the probe. This closes the static
     caller-chain audit at the fixture boundary only; natural reachability,
     member pointers, runtime DS, and wrapper calls remain unproven. Task 146
     leaves the runtime event-frame/setup join to Task 148. No DOSBox or GUI. See
     `research/cok-task137-callsite-audit-2026-09-28.md`.

146. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): source the static
     CoK event-buffer loader path.** Routine `0x4449` reads an event byte from
     `DS:0x4B34` at index `DS:0x4B43`, stores it in `DS:0x72E7`, and dispatches
     byte `0x24` through `0x41D9 -> 0x2288 -> 0xAEC9`. Descriptor-2 procedure
     `0x4594` selects ECL block ID 36 on its new-game branch and calls
     descriptor-4E procedure `0x34` at `0x4629`. That procedure clears the
     allocated `0x1E00`-byte event buffer, prepares the length-prefixed `ECL`
     and `.dax` names from its data offsets `0x358/0x35C`, and calls resident
     START helper `0x069C:0x088E` at unpacked image offset `0x724E` using its
     18-byte ABI. With new-game area selector `DS:0x5782=1` and loader path
     selector `DS:0x5884=0`, the source-derived resource candidate is
     ECL1.DAX block 36; the actual filename lookup remains unverified. The
     returned buffer is consumed by `0x4449`. Static setter analysis also
     identifies descriptor-4E procedure `0x52` / helper `0x9847` and its
     `0x8000..0x9DFF` event-buffer classifier. This closes only the source
     caller/resource contract: the helper read, returned-byte identity,
     cursor values, `DS:0x73B1/0x73F1` producer, and natural reachability were
     not executed or proven. The direct-entry probe still stops at START
     support instruction `0xAF43` on `SS:0xEEAA` before list iteration. Task
     148 owns the helper-output/cursor/dispatcher runtime join; Task 147 owns
     the separate combat-context byte lifecycle. No DOSBox or GUI. See
     `research/cok-task137-callsite-audit-2026-09-28.md`.

147. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): source the CoK combat
     context byte used for turn ordering and attack eligibility.** Setup
     `0xF273` allocates `0x16` bytes per member, installs the pointer at body
     `+0x183`, and clears the requested 22-byte payload. List builder `0xAFF7`
     compares `(member body+0x183)+3` across combatants while ordering the
     list; iterator `0xB162` gates on the same context byte at `0xB19C` and
     `0xB251`, and the attack branch at `0xC737` checks it again before body
     `+0x189` and `0xD270`. Routine `0x14D6A` is a context writer: with body
     `+0x189 != 0`, it writes context `+3` at `0x14E40` using `0xDB:0x4D` and
     `0xE6:0x57` results, initially floors at 1, then conditionally adjusts
     by 6 using `DS:4B2C+0x596` and clamps to `0..20`; otherwise it clears
     the byte at `0x14E96`. It is descriptor-13 procedure 0, reached from
     descriptor-8 routine `0xAEC9` at `0xAF5C` through public stub `0x88:0x25`.
     That routine walks the far-linked member list rooted at `DS:0x609A`,
     passes each member pointer in `[BP+6]/[BP+8]`, follows member `+0x17F`,
     then calls `0xAFF7` at `0xAF82`; therefore this writer path precedes
     turn-order construction. The four sites previously assigned to this
     writer (`0x1134A`, `0x12510`, `0x127FE`, `0x1443B`) actually resolve
     through `DB:25` to descriptor-23 procedure `0x34096` and are unrelated.
     Task 118 already captured the original held-save chain at `DS=0x1BC6`,
     head/tail `0x6109:0x0000`, with six source-matched linked records. The
     separate `probe_cok_combat_setup.py` fixture installs one synthetic member
     at `DS=0x5000` and stops at START.EXE `0xAF43` on a null source pointer at
     `SS:0xEEAA`; that is not the OVR head load at `0xAF41` and does not show
     an unset `DS:0x609A`. Runtime continuity from the captured held-party
     state into FDF2/F273, the writer, and `0xAFF7` remains unproven. Do not
     seed party/context inputs; stop at the first fixture-installed producer.
     Task 148 owns the event/ECL dispatch frame. Natural attack reachability
     remains open.
     No DOSBox or GUI. See
     `research/cok-task137-callsite-audit-2026-09-28.md` and
     `research/cok-item-removal-native-plan.md`.

148. **ACTIVE 2026-09-28 (subtask of Task 63): join original CoK ECL1#36
     helper output to its event dispatcher.** Reach the source-backed
     descriptor-2 new-game branch (`0x4594`) through the original caller where
     bounded evidence permits, preserving the descriptor-4E `0x34` frame,
     resident START helper ABI, and ECL1.DAX ID-36 request. Capture the helper
     extent/pointer, returned bytes and destination, then continue through
     `0x4E:0x2F`, `0x4449`, and the observed return chain. Do not inject an
     event byte or call `0xAEC9` directly. If startup cannot reach the helper,
     use a source-shaped helper fixture with each input attributed to its
     source caller and keep helper and dispatcher claims separate. Stop at the
     first unsupported runtime input; static/Unicorn only, no DOSBox or GUI.
     **Helper result:** the corrected complete-image fixture reads ECL1.DAX's
     seven-entry TOC (63 table bytes, data base 65), reads block 36 (raw 415,
     compressed 425), and copies all 413 decompressed body bytes exactly to
     `7000:0000`; the remainder of the `0x1E00` destination is zero. This
     matches retail ECL1#36 after its leading two-byte field. The callback at
     START `0xA817` enters descriptor-0 procedure `0x0042` through relocated
     stub pointer `1038:0025` with argument zero and returns `AX=0x0064`, which
     that caller discards. The fixture reaches its far-return sentinel. It has
     not yet entered the ECL dispatcher or established the `0x4E:0x2F` cursor
     and `0x4449` return chain. See
     `research/cok-task148-ecl-runtime-2026-09-28.md`.
149. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63): trace CoK
     encounter-menu operand bytes into the setter.** Descriptor-2 opcode-29
     dispatch at `0x4355` reaches handler `0x2D51`, which requests 14 operands
     through parser `0x8A73`. Its indexed stores write operand type to
     `DS:0x736D+i`, second byte to `DS:0x73ED+i`, and third byte to
     `DS:0x73AD+i` for types 1/2/3 or `0x81`. Retail `ECL1.DAX#33 @ 0x851E`
     is byte-matched to decompressed offset `0x520`; all 14 encodings are
     recorded. One-based operand 4 is type 1 / word `0x7F79`, populating both
     cache lanes. The handler builds and saves this address, then its menu
     result branches pass it to setter `0x9847`; `0x9159` classifies it as
     class 1. The class-1 store resolves with 16-bit wraparound to area word
     `+0x6F2`, and the immediately following ECL instruction at `0x8581` is
     its first reader, `ON GOTO area2.word_6F2`. The five table values and three
     inline strings are captured in
     `research/cok-task149-encounter-menu-operand-2026-09-28.md`. This closes
     the static retail operand-to-first-reader contract only; it does not prove
     which result branch executes or natural combat reachability. No DOSBox or
     GUI. Task 148 owns helper payload/cursor/dispatcher runtime evidence;
     Task 147 owns combat-context `+3`.

150. **ACTIVE 2026-09-28 (subtask of Task 63): join the original held party
     to combat context setup and the pre-order writer.** Task 118 captured the
     held-save party at `DS=0x1BC6`: head/tail `0x6109:0x0000` and six linked
     records matching `CHRDATA1.SAV` through `CHRDATA6.SAV`. Static source maps
     descriptor-8 `0xAEC9` to the writer at `0xAF5C` for each member, then
     `0xAFF7` at `0xAF82`. Preserve the captured party identity while tracing
     the source-backed menu/event path through combat entry, `FDF2`, and
     `F273`; `F991` calls `0x38C30`, which clears `DS:0x6B2C/2D` and rebuilds
     the signed-indexed value from active body `+0x18A` (`CBW`); only category
     values 0/1 increment `6B2C/2D`, and the routine clears only those bytes.
     AEC9 always traverses the chain
     with `DB:0x34` operation `0x18`, then bypasses the writer if either
     precheck byte `6B2C/2D` is zero. If both are nonzero, it recounts through
     `0x38C30` and calls the writer per node before `0xAFF7`; that second
     recount is not re-tested. Task 151 traces op `0x18`'s effect-`0x52`
     processing and pointer/context mutations. Task 150 must capture both
     count snapshots, helper effects, each context allocation, and source
     member bytes; reach the writer and first order-list build only if the
     existing headless replay supports that route. The separate
     `probe_cok_combat_setup.py` fixture installs a synthetic `DS=0x5000`
     member and stops in a START bounded-copy helper at `START.EXE:0xAF43` on
     null source `SS:0xEEAA`; this is neither an unset party head nor the OVR
     instruction at `0xAF43` (the OVR load starts at `0xAF41`). Capture the
     actual CS:IP and source mapping at any stop. Do not splice Task 118's
     snapshot into a direct call and label it natural, or seed party/context
     bytes. Task 148 owns the ECL helper/output/cursor/dispatcher join; Task
     150 owns held-party continuity through setup and writer-to-`0xAFF7`.
     Stop at the first fixture-installed or unsourced state. No DOSBox or GUI.
     See `research/cok-task137-callsite-audit-2026-09-28.md`,
     `research/cok-composed-startup-capture-2026-09-27.md`, and
     `research/cok-item-removal-native-plan.md`.

151. **DONE 2026-09-28 (bounded subtask of Task 150): trace AEC9's
     operation-`0x18` helper mutations.** AEC9 passes `SS:[BP-5]`, its live
     member-pointer cell, to `DB:0x34` before testing the saved `6B2C/2D`
     precheck; after return it dereferences the cell again to follow the next
     node. `DB:0x34` maps to `GAME.OVR:0x34527`; its op-`0x18` arm passes effect
     ID `0x52` and the same pointer cell to `0x342FD`. With wrapper gate
     `DS:0x713C==0`, callback slot `0x52` selects `0x65:0x183` /
     `GAME.OVR:0x13C24`; a nonzero gate uses alternate `DS:0x6D74`. Its direct body writes
     include candidate `+0x18B`, `+0xE7`, and context payload `+0x183+0x0A`,
     `+0x0C`, `+0x10`. The visible DB:7F/op-9 route allocates and links effect
     records through target `+0xE3/+0xE5`; it does not directly store the
     AEC9 pointer cell, member links `+0x17F/+0x181`, active/kind bytes
     `+0x189/+0x18A`, or context pointer `+0x183`. The audit stops at the
     indexed mode-1 effect-`0x6F`/`0x77` callback dispatch and DB:0x48's op-`0x0C`
     helper edge, whose transitive writes remain unclassified. This closes
     only the bounded direct-store audit, not the full mutation contract or
     held-party combat continuity. No DOSBox or GUI. See
     `research/cok-task151-op18-effect52-audit-2026-09-28.md` and
     `research/cok-task137-callsite-audit-2026-09-28.md`.

152. **DONE 2026-09-28 (bounded subtask of Task 150): classify gate-zero
     AEC9 operation-`0x18` callback continuations.** Task 151's mode-1 paths
     map effect `0x6F` to `0x1427A` (conditional clears of member
     `+0xE7/+0x18B` and context payload `+0x10`) and `0x77` to `0x1445E`
     (global `DS:0x6B3B` decrement). The DB:48/op-0x0C fan-out callbacks map
     through effect `0x36`; `0x11/0x21` also write member `+0x18D/+0x18E`,
     while `0x24` reads context payload `+0x03`. Effect `0x31` reads
     `+0x18A` and conditionally calls `0x10CFD`, which only increments global
     `DS:0x6B2E/0x6B3B`; effects `0x3D/0x63` call `0x10C83`, which only clears
     global `DS:0x6B30/0x6B2F` under its condition. These gate-zero callbacks
     and traced helpers do not write the AEC9 pointer cell, links, `+0x189/
     +0x18A`, or context pointer/payload. The nonzero-gate target and effect-
     list callbacks remain open in Task 153. No held-party values or runtime
     gates are captured. No DOSBox or GUI. See
     `research/cok-task152-effect-callback-audit-2026-09-28.md`.

153. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150): bound the alternate
     AEC9 callback path.** `0x14470` clears `DS:0x713C`; mode 0 routes through
     `0x35230` to add a member effect record, while nonzero mode routes through
     `0x34194` to remove one. Mode-0 insertion copies the member's `+0x3D` into
     the record ID and passes callback byte `+4=1`. These helpers change the
     effect list at member `+0xE3/+0xE5` and record `+5/+7`, not AEC9's pointer
     cell, member links, active/kind bytes, or context pointer/payload. A
     selected callback-enabled record can dispatch mode 1 using `+0x3D` as
     index. The initializer starts at slot 1 (`DS:0x6B98`); slot 0's runtime
     contents are unproved. Task 163 follows the member-field producers and
     slot-0 initialization. No runtime gate values, DOSBox, or GUI. See
     `research/cok-task153-nonzero-gate-callback-audit-2026-09-28.md`.

154. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150): resolve the producer
     identity of the effect-index byte.** `0x1143E..0x11447` allocates a
     `0x3F`-byte temporary through `A46:0x23F`; `0x11481` writes `0x17` to its
     `+0x3D`. `E6:0x75` resolves through descriptor `0xE6` slot 17 to
     `GAME.OVR:0x37D31`, which allocates another `0x3F`-byte block, copies the
     temporary through `A46:0x163E`, and links the copy under the owner
     member's `+0x143/+0x145` list using record links `+0x2A/+0x2C`. This is a
     subrecord producer, not a write to the member body's `+0x3D` consumed by
     `0x14470`. The combat-time member byte, any other producer, callback byte
     `+4`, and slot-0 runtime contents remain open under Task 153. Static only;
     no DOSBox or GUI. See
     `research/cok-task154-effect-index-producer-identity-2026-09-28.md`.

155. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150): inspect the direct
     caller of the AEC9 setup-helper boundary.** The call at `GAME.OVR:0x3BC5E`
     (return `0x3BC63`) pushes a literal zero, a byte from `SS:[DI+0x22]`,
     local/record bytes, and a selected `ES:DI` pointer. The synthetic helper
     frame observes limit `0x28`, destination `5000:EEAF`, and source
     `0000:0000`, which does not reconcile with this sequence as an ordinary
     far-call ABI. The previous claimed path through `0x3CEBC -> 0x27F:0x1CF6`
     is retracted: Task 128 maps that target to resident `START:0x44E6`, and
     the call at `0x3CEF7` returns to `0x3CEFC`. FDF2 has a separate helper
     call at `0xFE59` returning to `0xFE5E`; the probe's saved BP chain reports
     `0x3BC63` and `0xFE07`, so caller/frame attribution is the first
     unresolved edge. No retail null provenance, natural AEC9 entry, or
     effect-7 result is established. Static/focusless only; no DOSBox or GUI.
     See `research/cok-task155-af43-source-pointer-2026-09-28.md`.

156. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150): attribute the
     captured START:0xAF43 call frame.** The `0x3BC5E` and FDF2 `0xFE59`
     callsites both encode `0x521:0x353`. An earlier live trace maps this pair
     to runtime `0D45:0353`, a text formatter, but VROOMM dynamically reassigns
     selectors and that trace is from a separate runtime point. The static
     resolver leaves `0x521` outside validated stub geometry. Therefore the
     synthetic `START:0xAF43` bytes and BP-chain returns `0x3BC63`/`0xFE07`
     do not identify the natural target or prove the parent call path. Task
     128 separately maps `0x3CEBC`'s `0x27F:0x1CF6` to resident `START:0x44E6`,
     returning to `0x3CEFC`; that edge does not explain the frame. The exact
     missing fact is the route-local `0x521:0x353` binding. Static/focusless
     only; no DOSBox or GUI. See
     `research/cok-task155-af43-source-pointer-2026-09-28.md`.

157. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150): inspect static
     selector fixups for the setup-helper calls.** `GAME.OVR:0x3BC5E` is in
     descriptor range `0x3AE3F..0x3C737`; its segment word at relative fixup
     offset `0x0E22` is listed in that descriptor's relocation table. FDF2's
     `0xFE59` call is in descriptor range `0xE19A..0x10004`; its segment word
     at relative offset `0x1CC2` is also a listed fixup. Both stored `0x521`
     words are relocatable inputs; neither gives a static runtime selector
     target. The validated VROOMM report leaves `0x521` outside stub geometry
     as `unresolved_relocated_segment`. Exact inventory finds 207
     `LCALL 0x521:0x353` fixup sites across 20 descriptors; all 207 remain
     unresolved. Task 158 traces the runtime manager's route-local assignment.
     Static/focusless only; no DOSBox or GUI. See
     `research/cok-task155-af43-source-pointer-2026-09-28.md` and
     `research/vroomm-fixup-layout.md`.

158. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150): trace the probe's
     selector-relocation boundary.** `tools/probe_cok_combat_setup.py` rewrites
     only self-segment fixups and preserves external VROOMM selectors. The
     `0x521` segment words at `0x3BC5E` and FDF2 `0xFE59` are external fixups,
     so the probe supplies no route-local target for either. Its `START:0xAF43`
     stop is therefore not evidence for the retail callee or source-pointer
     ABI. The manager's runtime assignment is unavailable in the current
     focusless fixture. Task 159 makes the unresolved external call boundary
     explicit in the probe before interpreting its execution. Static only; no
     DOSBox or GUI. See
     `research/cok-task155-af43-source-pointer-2026-09-28.md`.

159. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150): guard the headless
     probe against the unresolved setup helper.** The direct `0xAEC9` probe
     now identifies relocation-backed `0x521:0x353` calls from descriptor
     fixup entries and stops before executing the first reached site,
     `GAME.OVR:0x3BC5E`. Its report records selector/offset, source address,
     CS:IP, SS:SP, and stack words; the previous false `START:0xAF43`
     uninitialized-read result is absent. The synthetic held-party input
     remains explicit. Focused gates pass: 54 tests across the probe,
     overlay, and EXEPACK tests; native no-launch manifest passes 89 tests.
     No DOSBox or GUI. See
     `research/cok-task155-af43-source-pointer-2026-09-28.md`.

160. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150): generalize unresolved
     relocated-call guards.** The probe now allows only self references,
     exact public-stub offsets for overlays actually loaded and patched, and
     explicitly mapped resident selector/offset routes. Other relocation-backed
     far calls stop before execution with source-site and stack evidence. The
     regression verifies a patched `0x105:0x4D` stub passes, `0x128:0x7E6` and
     `0x521:0x353` remain unresolved, and the mapped `0x27F:0x1CF6` resident
     route is retained. The direct probe still first reaches
     `GAME.OVR:0x3BC5E -> 0x521:0x353`; static classification of
     `0x3BB9A -> 0x128:0x7E6` is not a claim that execution reaches it. Focused
     gates pass 55 tests; the reviewed native no-launch manifest passes 89.
     Synthetic input only; no DOSBox or GUI. See
     `research/cok-task155-af43-source-pointer-2026-09-28.md`.

161. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150): bound static evidence
     for the route-local `0x521:0x353` binding.** The unpacked START image has
     four direct `0x0521` far calls, targeting `0x00B7` twice, `0x0071`, and
     `0x00A0`; none identifies `0x0353` or the AEC9 route. The probe cannot
     supply the missing runtime manager state: `run()` bypasses startup and
     manually places descriptors at `0x8200` and sequential segments beginning
     at `0x8400`, then patches their stubs. Thus current static/headless
     evidence does not bind the real selector. No DOSBox or GUI. See
     `research/cok-task155-af43-source-pointer-2026-09-28.md` and
     `research/vroomm-fixup-layout.md`.

162. **DEFERRED / FOLDED INTO TASK 148 (subtask of Task 150): capture the
     route-local `0x521:0x353` binding.** Do not build a separate synthetic
     manager harness. Task 148 owns selector capture if its original
     loader/dispatcher run reaches `GAME.OVR:0x3BC5E`; keep the unresolved-call
     guard until source-faithful state provides the actual mapping. Earlier
     static evidence and fixture limits remain in
     `research/cok-task155-af43-source-pointer-2026-09-28.md`.

163. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150): source the alternate
     callback index and record gate at the held-save boundary.** All six held
     `CHRDATA*.SAV` members have byte `+0x3D=0`; Task 118's original post-load
     party records preserve zero at the menu boundary. Mode-0 `0x14470` passes
     that field as record ID and `1` for record byte `+4`, which `0x35230`
     stores at `0x352D3`; a later matching removal can dispatch mode 1 through
     `0x34153`. The 827-prologue census finds only the unrelated
     `0x11481` subrecord store, but does not cover indirect/non-prologued
     writes or bulk copies. The `0x144D2` initializer begins at table slot 1;
     the bounded direct-reference scan finds slot zero only at indexed read
     `0x3418E`. A title-renderer snapshot at `DS=0x1BC6` shows slot 0 null and
     slot 1=`0x1065:0x0034`; combat-time member, record, and slot-zero values
     remain unknown. This closes only at the held-save/menu and checkpoint
     boundary. No DOSBox or GUI. See
     `research/cok-task163-alternate-callback-index-source-2026-09-28.md`.

164. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150): trace the AEC9
     alternate callback mode and effect-record lifetime.** `0x342FD` invokes
     `0x34153` in mode 0 for effect `0x52`; if `DS:0x713C` is nonzero, the
     wrapper redirects to `0x14470`, whose mode-0 branch inserts a record with
     ID member `+0x3D`, duration `+1=0`, lifetime `+3=0xFF`, and callback
     `+4=1`. The all-party duration and active-member lifetime routines skip
     those sentinels. Two table-driven cleanup paths read removal IDs from
     `DS:0x01C5+ordinal` and `DS:0x038F+ordinal`; all entries used by their
     loops are nonzero in the title-renderer snapshot. Other direct removal
     callsites pass fixed nonzero IDs in the bounded disassembly. Combat-time
     member, gate, cleanup-table values, selected record, and slot-zero target
     remain unproved. No DOSBox or GUI. See
     `research/cok-task164-alternate-callback-mode-2026-09-28.md`.

165. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150): source the runtime
     alternate callback gate on AEC9 operation `0x18`.** Trace the
     `DS:0x713C` producers
     and resets that can precede AEC9's `0x342FD -> 0x34153` mode-0 call.
     Determine whether source-backed order and inputs allow the alternate
     target `0x14470` to run, without using title-renderer or menu-boundary
     snapshots as combat evidence. Begin from the known flag setters at
     `0x28B2B` and `0x31282` and resets at `0x106D6`, `0x10B0E`, and
     `0x14476`; map caller order and stop at the first unresolved selector or
     runtime input. Static/Unicorn only; no DOSBox or GUI. See
     `research/cok-task164-alternate-callback-mode-2026-09-28.md` and
     Tasks 142–143 for related dispatcher evidence. **Initial result:**
     `xrefoff 0x713C` finds six direct reference sites: resets at `0x106D6`,
     `0x10B0E`, and `0x14476`, setters at `0x28B2B` and `0x31282`, and the
     wrapper read at `0x34156`. Each setter is followed in its own routine by
     `DB:0x2A`, resolved to that wrapper; if it reaches `0x14470`, the target
     clears the flag. Their order relative to held-party AEC9 and DS identity
     remain unresolved. Task 125 maps a conditional Begin Adventuring route
     through `0x61:0x2A -> 0x108DB` before the ECL switch, where `0x713C` is
     reset; the captured held-party boundary has `DS:0x4B49=0`, so the
     caller's required value 3 is not satisfied there. Begin Adventuring also
     remains gated at the selector. Combat-time gate and DS identity are not
     captured; Task 150 resumes through FDF2/AEC9 and Task 148 owns the ECL
     helper/dispatcher join. See
     `research/cok-task165-alternate-gate-provenance-2026-09-28.md`.

166. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): map the CoK
     resident allocator callback setup and argument flow.** In the complete
     `START.EXE` load image, direct references to `DS:0x439A` are the
     initializer at `0xA497` and far calls at `0xA817` and `0xA823`. The calls
     pass one word each, consistent with the default target's `RETF 2`: zero
     at the first site and `[0x8CAA]` at the second. The latter caller branches
     on `AL<1`, `AL=1`, and `AL>1`; semantic status meanings remain unknown.
     Startup calls descriptor 0 procedure `0x00B2` (`GAME.OVR:0x00BA`), which
     writes raw pointer words `0038:0025` to `DS:0x439A/0x439C`. The segment
     word at descriptor-0 code offset `0xB9` is a relocation fixup, so the live
     callback segment remains unresolved. Task 166 closes at this caller ABI
     and raw-pointer boundary. Static analysis only; no DOSBox or GUI. Details
     in `research/cok-task148-ecl-runtime-2026-09-28.md`.

167. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): map the CoK callback
     stub rewrite.** INT 3Fh manager routine `0xA335` rewrites each five-byte
     public stub to `EA <procedure-offset> <ES:0x10 segment>`. Thus the
     procedure word supplies a far-jump offset and the selected segment comes
     from the descriptor's `+0x10` field. **Correction 2026-09-28:** the
     procedure word is `0x0042`, read from the complete EXEPACK load image;
     `0x0842` came from a packed-file coordinate and was a false runtime
     value. The rewritten target form is `ES:0x10:0x0042`. Task 169 shows that
     `0x0042` lies within descriptor 0's loaded code extent. The callback's
     live segment and runtime argument effects remain open for Task 173. No
     DOSBox or GUI. See `research/cok-task148-ecl-runtime-2026-09-28.md`.

168. **CLOSED BOUNDED 2026-09-28 (subtask of Task 167): map the CoK INT
     3Fh handler.** Retained focusless Unicorn logs record vector `19F0:02E6`
     installed and later dispatched. Under the retained image load geometry,
     this maps to START image `0xA1E6`; installer `0x9FD2` sets `DX=0x02E6`,
     `DS=CS`, then calls INT 21h/AH=25h for vector `0x3F`. The handler reads
     the procedure word after the saved INT 3Fh return IP and enters manager
     `0xA238`; loader entry `CS:0x0268` maps to `0xA168` and performs DOS
     seek/read operations for `GAME.OVR`. This handler and loader mapping
     remains valid after the procedure-word correction. It does not capture
     the callback's relocated segment or runtime values. No DOSBox or GUI.
     Details in `research/cok-task148-ecl-runtime-2026-09-28.md`.

169. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): bound the CoK
     callback target within its loaded descriptor payload.** Descriptor 0
     sources OVR offset `0x0008`, has code size `0x00C4`, and fixup size
     `0x000E`. The loader rounds code size `0x00C4` up to paragraph boundary
     `0x00D0` before reading fixup bytes, which end at `0x00DE`. Stub 1's
     corrected procedure target `0x0042` is inside descriptor 0 code, at
     absolute OVR file offset `0x004A`; bytes there begin with a valid
     `55 89 E5` prologue. This corrects the earlier false claim that the target
     lies beyond descriptor 0 or in descriptor 1. The selected runtime segment
     and callback behavior remain unknown. No DOSBox or GUI. Details in
     `research/cok-task148-ecl-runtime-2026-09-28.md`.

170. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): map resident
     allocator callback arguments to source-visible list operations.** The
     zero call at `0xA817` follows updates to the allocator boundary at
     `DS:0x438A/0x438C` and a new free-list node; its returned `AL` is ignored.
     The call at `0xA823` passes stored size `[0x8CAA]` on the upper-bound
     overflow path. Results `<1`, `=1`, and `>1` select the observed return or
     retry branches; their semantic meanings and runtime values are unknown.
     This closes the source argument-flow pass, not the live heap/list join.
     Task 173 owns that remaining runtime-state question. No DOSBox or GUI.

171. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): correct VROOMM
     procedure-word provenance against complete EXEPACK load images.** Keep
     packed loader offsets as discovery coordinates, match descriptors into
     `unpack_complete_load_image()` by OVR file offset and descriptor geometry,
     and read runtime stub words from that image. Audit every CoK descriptor
     and report raw/runtime differences without merging the two address spaces.
     Extend `tools/vroomm_layout.py` and add regression coverage; update the
     generated report only if corpus output changes. No DOSBox or GUI.
     **Result:** all 35 CoK descriptors match. Descriptor 0's load-image header
     and stub array are at `0x380` and `0x3A0`; its words are `0x00B2` and
     `0x0042`. The corrected routes remain within descriptor code. Other
     descriptors with packed/runtime differences are included in the regenerated
     report. See `research/cok-task148-ecl-runtime-2026-09-28.md`.

172. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): trace CoK callback
     procedure `GAME.OVR:0x004A`.** The procedure uses a far-call frame, reads
     its word argument at `[BP+6]`, and takes the zero branch directly to the
     epilogue. For nonzero input, it copies the length-prefixed strings at
     `CS:0` and `CS:0x1D` into local buffers. Those bytes resolve to OVR file
     offsets `0x08` (`WARNING: Insufficient Memory`) and `0x25`
     (`Insufficient Memory. Exiting Program`). The copy helper at
     `0xA46:0x0AC4` maps to complete START image `0xAF24` and uses
     `RETF 4`; the following resident formatter `0x521:0x096C` maps
     provisionally to image `0x5B7C` and consumes the remaining stack args with
     `RETF 8`. The procedure checks `DS:0x4B27` and conditionally calls
     `0x9E:0x004D`, storing returned `AL` as a local loop state. It repeats
     while that byte is zero; once nonzero, it calls `0x614:0` and returns
     `[BP-2]` with `RETF 2`. `0x9E:0x004D` maps to descriptor 17 stub 9 and
     OVR file offset `0x1F9B9`. Callback result semantics remain unresolved.
     Static analysis only; no DOSBox or GUI. Details in
     `research/cok-task148-ecl-runtime-2026-09-28.md`.

173. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): map resident
     callback callees in the complete START image.** The three resident
     segment:offset pairs from Task 172 have image-linear candidates under
     `segment*16+offset`: `0xA46:0x0AC4 -> 0x0AF24` is a length-prefixed copy
     helper (`LODSB`, `STOSB`, `REP MOVSB`, `RETF 4`); `0x521:0x096C ->
     0x05B7C` begins with a frame prologue and ends `RETF 8`; and
     `0x614:0 -> 0x06140` begins with a frame prologue and reaches its `RETF`
     at image `0x061AC`. The formatter also calls `0x614:0x025B`, whose
     candidate image address `0x0639B` begins another frame prologue. These
     byte matches support a common image-relative basis, but the live relocated
     segment values were not captured in that static pass; Task 175 later
     observes the first callback through fixture pointer `1038:0025`. Keep
     these candidates distinct from that observed fixture address. No DOSBox
     or GUI. Details in
     `research/cok-task148-ecl-runtime-2026-09-28.md`.

174. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): inspect retained
     CoK callback trace evidence.** The retained `goldbox-task148-4e34-original.log`
     contains only the initializer's first ten instructions, vector setup,
     unhandled DOS function 06h bytes, and termination with `AL=0xC8` at
     instruction 8,816. It contains no `ALLOC_CB` snapshot, callback argument,
     `DS:0x439C`, or `[BP-2]` return value. The paired source-shaped fixture
     builds descriptors from `unpack()`'s decompressed-only buffer and finds 34
     records, so it cannot serve as runtime evidence for descriptor 0's
     corrected `0x0042` target. Task 174 closes at this evidence gap; it does
     not explain the fixture's earlier exit. No DOSBox or GUI.

175. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): repair and run
     the source-shaped ECL helper fixture.** It now maps all 35 descriptors
     from the complete load image, rewrites their runtime stub tables at their
     loaded addresses, and relocates OVR fixups into the synthetic overlay
     segments. Descriptor 0 stub 1 resolves to procedure `0x0042`; descriptor
     `0x4E` stub `0x34` resolves to code-relative `0x0361` / OVR file offset
     `0x08DA2`. The target callback path reaches START `0xA817`, then
     descriptor-0 `0042` through `1038:0025`. Its entry frame is
     `DS=1BC6, SS:SP=6000:ED04`, argument zero; it returns `AX=0x0064` to
     `1A46:03BB`, where the resident caller discards it. ECL1.DAX block 36's
     decompressed body after its leading two-byte field matches all 413 bytes
     at `7000:0000`, and the rest of
     the `0x1E00` buffer is zero. The fixture returns to its sentinel. It has
     not joined the ECL dispatcher. No DOSBox or GUI; see the research note.

176. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): run the callback
     installer from original START bytes.** After the resident initializer
     sets `DS=1BC6`, execute START image `0x012F`'s far call to VROOMM entry
     `0x38:0x20`, with the corrected runtime stub array and descriptor-0
     procedure mapping. Procedure `0x00B2` writes `offset=0x0025` and the
     relocated selector `segment=0x1038` to `DS:0x439A/0x439C` (bytes
     `25 00 38 10`). The following ECL1#36 helper fixture enters callback
     procedure `0x0042` through that pointer. This establishes the fixture's
     callback-install precondition and exact first-call ABI; it does not prove
     the live retail allocator's segment or the later dispatcher path. No
     DOSBox or GUI. Details in
     `research/cok-task148-ecl-runtime-2026-09-28.md`.

177. **ACTIVE 2026-09-28 (subtask of Task 148): continue exact ECL1#36
     helper output into the first event.** Preserve the matched payload and
     fixture callback pointer `DS:0x439A/0x439C`. Tasks 181 and 186 own the
     remaining guard-path and allocator prerequisites; resume the parser only
     after
     `DS:0x4B2C` and `DS:0x4B28` have source-backed provenance. If supported,
     continue the original caller sequence
     `0x4629 -> 0x462E -> 0x4633 -> 0x4638`, capture derived
     `DS:0x4B41=0x8014`, cursor changes, and the first fetched event byte
     (`0x21`, the opening GEO 127 command). Do not seed the cursor/opcode,
     inject event data, or call `0xAEC9` directly. Noninteractive Unicorn only;
     no DOSBox or GUI. Stop at the first unsupported workspace, caller frame,
     resource, or input dependency.

178. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): trace the original
     workspace-initializer call to its first unsupported guard.** The relocated
     START image's preinit call prefix at `0x0110..0x0134` and original entry
     at `0x0134` were executed after the resident initializer in a source-shaped
     Unicorn fixture. `START:0x013B` calls descriptor-`0x61` stub `0x25`, which
     maps to `GAME.OVR:0x100F3`. That procedure reaches its first branch on
     `DS:0x8986` at `0x1011D`; the fixture observed `DS=0x1BC6`, synthetic
     `SS:SP=0x6000:EDE2`, and zero bytes at `DS:0x8986/0x89CE`. A write watch
     saw no source writes to either guard before this read. The zeros came from
     the fixture's zero-filled memory and are not retail provenance, so the
     trace stops before taking the branch or claiming allocations. Static
     code at `0x101E7..0x10203` still identifies two later `0x800` allocator
     requests storing to `DS:0x4B28/0x4B2C`, but those returns are not accepted
     as route evidence. Task 181 continues writer ordering; Task 186 owns
     source-backed allocator provenance before Task 177 resumes. No DOSBox or
     GUI.

179. **QUEUED 2026-09-28 (subtask of Task 148): preserve the corrected ECL
     helper fixture as reproducible tooling.** Replace the disposable
     `C:\temp\goldbox_task175_corrected.py` runner with a maintained headless
     diagnostic under `tools/`. Record complete-image descriptor provenance,
     all 35 mappings, every synthetic pointer/stack/overlay bridge, startup
     callback installation, the first-call frame, and exact 413-byte payload
     comparison plus zeroed destination tail. The tool must identify fixture
     state explicitly and stop at the existing far-return sentinel on
     unsupported dispatch or input. Reproduce the bounded Task 175 evidence;
     extending interpretation stays with Task 177. No DOSBox or GUI.

180. **QUEUED 2026-09-28 (subtask of Task 63): continue the candidate CoK
     attack path through the effect-7 callback boundary.** Starting from the
     source-backed descriptor-9 caller at `0x0D67D`, determine whether the
     initialized combat/member path reaches `0x167AF`'s guarded block at
     `0x16945..0x1697B` with live attacker and target pointers. If supported,
     capture the arguments at `0x162E3`'s call to `0x14F24` (`0x165F7`),
     runtime `DS:0x713C`, and both wrapper entries from `0x342FD`; keep the
     direct-`0x14F24` fixture and its installed state separate from retail
     provenance. Stop at the first synthetic producer or unavailable member,
     selector, gate, or table input. Static bytes and noninteractive Unicorn
     only; no DOSBox or GUI. See `research/cok-task137-callsite-audit-2026-09-28.md`.

181. **ACTIVE 2026-09-28 (subtask of Task 148): order every guard writer
     against the first startup read.** An expanded complete-image scan found
     START image writers missed by the earlier audit: `0x228C/0x22D6` clear/set
     `DS:0x89CE`, in the long routine beginning at `0x1F8A`; the EXEPACK entry
     call table reaches that routine at image `0x0076`, before
     `START:0x013B -> 0x61:0x25 -> GAME.OVR:0x100F3`. The J/M/N sites at
     `0x271F..0x2744` are in that same routine. Other START stores are
     `DS:0x8986` at `0x7452/0x7459`, called by `GAME.OVR:0x10131` only after
     its first guard branch, and `DS:0x89CE` at `0x7DBF` (caller order open).
     The OVR writers in `0x25ED0..0x269CB` remain downstream through the
     `START:0x01F8 -> 0xA4:0x25 -> GAME.OVR:0x203BD` menu call. A full-entry
     bounded Unicorn pass from `1000:003F` initially stopped after 2,000,000
     instructions while polling port `DX=0x0006` at
     `1962:05F3`, mapped to START image `0x9C13`. START code at `0x9BD8`
     sets `DS=0040`, `0x9BED` reads the BIOS-data video base at `0040:0063`,
     and `0x9BF1` adds six before the `0x9C0C/0x9C12` input-status polling
     loop. A zero fixture word therefore yields port `0006`; this is consistent
     with a missing video-base fixture value, not evidence of a key request.
     After initializing BDA `0040:0063=03D4` and mode 3 as in the committed
     headless MIDI fixture, a bounded replay reached the first guard after
     84,668 instructions. The START M branch wrote `DS:0x8986=1` and
     `DS:0x89CE=0` at image `0x272F/0x2734` before OVR `0x1011D`; no key was
     injected. Task 184 traces this fixture's M result to `KRYNN.CFG` byte 6.
     Alternate configuration paths, `0x228C/0x22D6`, and the `0x7DBF` caller
     remain unresolved; keep this path labeled as fixture evidence. Static
     bytes and bounded noninteractive Unicorn only; no DOSBox or GUI.

182. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): determine whether
     initial DS contents gate the configured startup path.** The complete-entry
     fixture reads the checked-in `KRYNN.CFG`, whose M option is returned from
     byte 6 through the original START buffered reader; the M branch writes
     `DS:0x8986=1` and `DS:0x89CE=0` before OVR's first guard read. Therefore
     initial values are not a prerequisite on this evidenced option path.
     Other configuration/device paths and retail initial memory remain
     unsupported; do not treat the fixture's zero-filled map as their
     provenance. Task 184 records the option reader; Task 185 records the
     subsequent bounded path. No DOSBox or GUI.

183. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): source and model the
     preinit video-poll dependency.** At runtime `1962:05F3` (START image
     `0x9C13`), code sets `DS=0040`, reads video base `0040:0063`, adds six,
     and polls input bit 0. The zero BDA word in the disposable fixture caused
     polling at `0006`; committed `tools/unicorn_cok_midi.py` instead sets
     `0040:0063=03D4` and models status ports `03DA/03BA`. With that modeled
     BDA/video setup, a bounded replay reached OVR `0x1011D` after 84,668
     instructions and captured pre-read M-branch writes
     `DS:0x8986=1/DS:0x89CE=0` at image `0x272F/0x2734`. No key was injected.
     This explains the fixture divergence and records the modeled path, not
     retail BIOS state. No DOSBox or GUI.

184. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): trace the preinit `M` result
     to its source.** The corrected full-entry fixture read 64 bytes from
     `KRYNN.CFG`; its buffer at `DS:0x48C4` begins `E\r\nA\r\nM`, with M at
     offset 6. At START `0x270B`, `BX=6`; relocated resident call
     `1A46:0x898` enters START reader `0xACF8`, which reads `ES:DI=1BC6:48C4`
     at `BX=6`. It returns `AL=0x4D` and advances `BX` to 7. START stores the
     result at `DS:0x4842` at `0x2710`, then compares it with M at `0x272B`.
     No key or M value was injected. This closes bounded for the configured
     fixture path; it does not prove retail startup device state or other
     configuration paths. No DOSBox or GUI.

185. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148, after Task 184): trace
     the configured guard through device setup and workspace allocation.**
     With the sourced M option, the bounded fixture continued through
     `GAME.OVR:0x10131 -> START:0x7430` and the resident `INT 33h` wrapper at
     `0x9C4:0x0B`. The modeled response left the `DS:0x4B5A` register block
     zero and START cleared `DS:0x8986` at `0x7459`. The original OVR allocator
     calls at `0x101EB/0x101FB/0x1021B` stored synthetic returns
     `486D:0000`, `48ED:0000`, and `49AD:0000` at
     `DS:0x4B28/0x4B2C/0x4B34`. These are fixture outputs under modeled INT
     `33h` and heap/callback state; they do not establish retail device or heap
     state. The trace stopped at OVR `0x10227` before later allocations. No
     DOSBox or GUI.

186. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148, after Task 185): CoK
     workspace allocator under the declared fixture.** Resident
     `A46:0x023F` relocates to START image `0xA69F`; its wrapper passes byte
     requests to allocator `0xA768`, which rounds to paragraphs and walks the
     list rooted at `DS:0x4392`. Complete-image source plus the headless
     complete-entry trace establish the configured 160 KiB reservation and
     the fit branch in Task 187. Under that fixture, `DS:0x4394` advances
     `486D -> 48ED -> 496D -> 49AD -> 4B8D`; the original OVR stores returned
     zero-offset pointers `486D:0000`, `48ED:0000`, `496D:0000`, and `49AD:0000`
     for requests `0x800/0x800/0x400/0x1E00` at
     `DS:0x4B28/0x4B2C/0x4B30/0x4B34`. The installed fixture callback pointer
     is `1038:0025`; its rewritten stub reaches synthetic overlay body
     `8000:0042`. Four zero-argument calls through `0xA817` return `AX=0` at
     START `0xA81B`, where `POP AX` discards the value. The `0xA823` nonzero
     callback path was not reached. The recorded callback entries follow the
     START installer on this modeled route; no default-refusal-stub invocation
     appears in the trace.

     These are fixture outputs, not retail pointers or proof of MCB/paragraph
     ownership. The callback body segment, modeled PSP/heap bounds, and
     allocator backing state remain conditional. The fit routine's
     `A46:0x029C` result is `DX:AX=000C:8DC0`, but its meaning and producer
     inputs remain unresolved; Task 188 owns that query contract. Stop this
     bounded trace at that unsupported memory-list state. No DOSBox or GUI.

187. **CLOSED BOUNDED 2026-09-28 (subtask of Task 186): source the CoK
     overlay-reservation fit decision.** Complete-image START disassembly and
     the declared headless fixture trace cover `0x25FC..0x2631`. `A46:0x029C`
     returns `DX:AX=000C:8DC0` at `0x2601`; `09F0:0x01F2` returns existing
     reservation size `AX=6B70` at `0x2608`, matching
     `(DS:0x437E-DS:0x437A)<<4`. The caller computes
     `0002:8000 - 0000:6B70 = 0002:1490`; its signed high-word compare at
     `0x2618` takes `JL` to the reservation at `0x2622`. The first query's
     return contract remains opaque; this closes only the observed fixture
     decision. At entry to `0xA0A3`, fixture values are
     `DS:0x437A=206D`, `0x4374=06B7`, `0x437E=2724`, `0x4390=F000`,
     `0x4380=0000`, and `0x4382=0005`; the guards and endpoint checks pass,
     producing `DS:0x4394=486D` and leaving `DS:0x4362=0000`. The call returns
     with `AX=0`. Task 186 separately records the allocator outputs as
     conditional fixture pointers. No DOSBox or GUI.

188. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): source the CoK
     available-memory query contract.** A complete-entry headless replay
     captured `A46:0x029C` (`START` image `0xA6FC`) with
     `DS:438A/438C/438E/4390/4392 = 0000/2724/0000/F000/0000` and list head
     `2724:0000`. The `A711` helper returned immediately because its head
     segment equaled `DI=2724`, so it visited no node. The query subtracts the
     lower bound `2724:0000` from `F000:0000`; normalization returns that
     `0x000C8DC0` byte span as `DX:AX=000C:8DC0`. `DS:4390` is copied from
     `ES:[2]` at START image `0xA48E`. This explains the declared fixture
     result without calling it conventional-memory availability; the lower
     bound, empty sentinel, and PSP/MCB ownership remain fixture-dependent.
     No DOSBox or GUI. Details in
     `research/cok-task148-ecl-runtime-2026-09-28.md`.

189. **CLOSED BOUNDED 2026-09-28 (subtask of Task 148): identify the
     configured no-key route at the original ECL caller.** In the headless
     Unicorn replay, START's `0x0194` call to `FD:2A` returned `AL='D'` at
     `0x0199`; the branch selects demo mode and block 57. At original
     `GAME.OVR:0x4629`, the ECL helper receives `0x39`; the header parser
     returns `DS:4B34=49AD:0000`, and the interpreter fetches first event byte
     `0x09` (`AX=0x8009`). These observations are in
     `C:\temp\goldbox_task177_event_output.txt` (SHA256
     `311CA9891F86FB3848C50B5A7F543BCEBD30E5B6CCBD8904BD43DD4399C86BAC`),
     not `goldbox_task189_output.txt`, which is an earlier startup-boundary
     log. Its `NATURAL_ECL36_ENTRY` label is misleading: the captured caller
     argument is `0x39` (ECL2 block 57), not ECL1 block 36. The runner
     preloads overlays at synthetic segments and patches public stubs, so
     this establishes original START/caller/parser/interpreter execution only
     within that declared fixture; it does not capture the original VROOMM
     overlay loader, fresh-campaign ECL1#36, or retail allocator ownership.
     The observed first byte agrees with byte zero of retail ECL2.DAX block
     57; this capture does not establish full-buffer equality. The earlier
     direct helper probe remains excluded as route evidence because it seeds
     `DS:0x4B34`, `DS:0x4B41/0x4B43`, and destination memory. No key was
     injected. Noninteractive Unicorn only; no DOSBox or GUI. See
     `research/cok-task148-ecl-runtime-2026-09-28.md` and the event output
     named above. The output and current runner do not have immutable paired
     provenance.

190. **CLOSED BOUNDED 2026-09-28 (supports Tasks 63, 110, and 125): source
     the outer function-list selected-node producer and safe row transition.**
     `GAME.OVR:0x203E2` constructs enabled linked-list rows from the 13-slot
     function table in table order; `0x3AE4E` resolves the one-based
     `DS:0x6E0F` selection to a linked node; and `0x20578` reads that node's
     command byte at `[ES:DI+1]` before the caller dispatches it. The held
     capture maps row 1 to `C`; Begin Adventuring is row 8 / `B`. The current
     one-candidate selector invocation cannot move rows with K/M or 4/6
     navigation; its `Select 1!` typed-key parser is separate from the nine
     function-list rows. The source's coordinate/hit path can write the row,
     but returns through the same command-dispatch caller, so it is not a safe
     capture-only route. No source-backed key-only, non-dispatching row-8
     transition was found. Task 125 remains gated; no route key or mouse input
     was sent. Static retail bytes only; no DOSBox or GUI. See
     `research/cok-task190-function-list-selected-node-2026-09-28.md`.

191. **CLOSED BOUNDED 2026-09-28 (supports Tasks 110 and 125): trace the
     selector coordinate-input flag to its source and return behavior.** The
     hit path at `GAME.OVR:0x3B5BC..0x3B8C7` checks `DS:0x8858`, mouse-mode
     flags, and coordinate bounds; an accepted hit reaches the common result
     path at `0x3BA58..0x3BAB7`, which returns AL to the outer caller before
     it reads and dispatches the selected linked-node command at `0x20578`.
     A direct-reference sweep found no independent persistent OVR producer:
     START clears `DS:0x8858` at images `0x106FE` and `0x10B28`; OVR routine
     `0x2288` saves the entry byte at `0x2293`, clears it at `0x2299`, then
     restores it at `0x25CE`; wrappers at `0x3A22` and `0x3DDF` likewise save,
     clear, and restore it. The `0x96:0x25` call at `0x25C6` occurs before
     that restore, so any value it writes is overwritten. The true upstream
     producer and event timing remain outside this source edge. Do not use
     mouse input: an accepted coordinate hit returns through immediate
     command dispatch. Task 125 remains gated. No input or DOSBox was used.
     See `research/cok-task191-selector-coordinate-input-2026-09-28.md`.

192. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150): bind the relocated
     `0x521:0x353` setup helper and compare its caller ABI.** START image
     `0xA168..0xA1D8` reads each overlay's code and fixup table, then adds the
     resident START load segment (`DI=DS:0x43A8`) to every listed fixup word.
     Both setup calls (`GAME.OVR:0x3BC5E` and `0xFE59`) list their segment
     words as fixups, so they resolve to `load_segment+0x521:0x353`, which
     maps to complete START image offset `0x5563`. That routine has a frame
     prologue, reads the far pointer at `[BP+6]`, checks byte arguments at
     `[BP+0xE]` and `[BP+0x10]`, uses the intervening arguments, and returns
     with `RETF 0x0C`. The `0x3BC5E` pushes form that six-word frame directly;
     FDF2's `0xFE59` receives the same shape after the preceding
     `A46:0x0AC4` copy helper consumes its source-pointer words with `RETF 4`.
     START image `0x5563` itself calls `A46:0x0ADE`, mapping to bounded-copy
     helper `0xAF3E`; therefore the old `0xAF43` observation is a nested
     helper location, not the unresolved `0x521:0x353` entry. This is static
     source binding only: it does not prove natural reachability, live segment
     registers, held-party continuity, or retail argument values. Keep the
     probe guard until Task 193 captures the original loader/dispatcher route.
     No DOSBox or GUI. See
     `research/cok-task192-relocated-setup-helper-2026-09-28.md`.

193. **CLOSED BOUNDED 2026-09-28 (subtask of Task 150; depends on Task 192):
     capture the relocated setup helper on the original START/VROOMM load
     path.** A focusless Unicorn run started at the original packed START
     entry and used the DOS service model to open and read `GAME.OVR`; it did
     not preload overlays or patch public stubs. Descriptor 11's caller at
     file offset `0x1075D` (`IP=0x06C5`) called `0x521:0x353`, relocated to
     `1521:0353`. At helper entry the caller frame was
     `30A9:06CA`, `DS=1BC6`, `ES=SS=2491`, `SP=3DD2`, with far pointer
     `2491:3DE2` and scalar words `000F/0F0A/0F18/0F00`. The helper passed
     source `2491:3DE2` and destination `2491:3CD0` to `1A46:0ADE`; after
     return at `1521:036E`, the first 22 bytes matched. The source is a
     length-prefixed `Loading...Please Wait` string, and `DS:609A` was zero,
     so this does not demonstrate held-party continuity. The previously
     identified `0x3BC5E` and FDF2 `0xFE59` sites were not hit before this
     bounded stop; their watchers recorded zero. Task 150 remains active for
     the held-party route and source identity. Do not treat the synthetic DOS
     allocation segments as retail allocator provenance. No DOSBox or GUI.
     Reproducer and paired trace: `tools/probe_cok_task193_loader.py` and
     `C:\temp\goldbox_task193_loader_run.txt`; details and hashes are in
     `research/cok-task193-loader-backed-call-capture-2026-09-28.md`.

194. **QUEUED 2026-09-28 (subtask of Task 148; fixture-only demo continuation):
     continue configured ECL2#57 from its first event to the scripted combat
     command.** Build a maintained headless runner with a paired, hashed output
     that declares its synthetic overlay placement, fixups, stub patches, and
     all host-service models. Starting from the observed first event byte,
     continue only as supported by that fixture and stop immediately before
     ECL2#57's `COMBAT` command at VM address `0x8354`, or at the first
     unsupported host operation/input. Record script cursor, event bytes, and
     callback inputs/results at each boundary. Do not claim original VROOMM
     loader, ECL1#36 campaign, retail allocator ownership, or effect-7
     production provenance. Keep queued below active Task 63 work; no DOSBox
     or GUI.

195. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63; follows Task 193):
     capture the first party-member producer on the original loader route.**
     One headless START/VROOMM run opened `GAME.OVR` and retail data through
     modeled DOS services, with no overlays preloaded, stubs patched, fake keys,
     or seeded party. It reached ECL2 block 57 at the live `DS=1BC6` event
     cursor `0x809E`; the descriptor-17 routine at `GAME.OVR` file offset
     `0x1F082` received node pointer `6109:0000`. `MON2CHA.DAX` block 60 is
     the source record: its 409-byte decompressed record begins
     `0C "SIR RINGWALD"`; the captured first 400 node bytes match it at 397
     positions, with differences only at `0x115`, `0x145`, and `0x146`.
     The node's next-link words at `+0x17F/+0x181` were zero at helper entry.
     The helper then wrote offset `0000` and segment `6109` to
     `DS:609A/609C`, making the global head equal the passed node pointer.
     This closes the first source-backed insertion and its initial linkage;
     it does not establish held-save continuity or retail DOS allocator
     ownership. Stop was immediately after setting the head, before combat.
     Paired runner/output hashes, source hashes, and full runtime details are
     in `research/cok-task195-party-producer-2026-09-28.md`. No DOSBox or GUI.

196. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63; follows Task 195):
     capture the next source-backed party-list append on the same original
     demo route.** A second no-key START/VROOMM invocation reached the
     descriptor-17 list helper with ECL2 block 57 active at interpreter index
     `0x80A3`. The new pointer `6298:0000` matched retail `MON2CHA.DAX` block
     62 / VARIANNA across 396 of 400 captured bytes; four differing offsets
     are listed in the research note without inferred mutation semantics.
     Before insertion, the existing chain was `6109:0000` with a null next
     link. The helper wrote `6298:0000` to that tail's `+0x17F/+0x181` link;
     the global head remained `6109:0000`. This closes the second
     source-backed append only. It does not establish held-save continuity or
     retail DOS allocator ownership. Paired runner/output hashes and source
     provenance: `research/cok-task196-party-list-append-2026-09-28.md`. No
     DOSBox or GUI.

197. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63; follows Task 196):
     capture the third source-backed party-list member.** The original no-key
     START/VROOMM route reached descriptor 17's list helper a third time with
     ECL2 block 57 active at interpreter index `0x80A8`. Pointer `62FD:0000`
     matched `MON2CHA.DAX` block 61 / LYN SWIFTFOOT by its length-prefixed
     name and record bytes; seven differences in the first 400 bytes are
     retained in the paired output without inferred causes. Before the append,
     the chain was `6109:0000 -> 6298:0000 -> null`; the helper wrote
     `62FD:0000` to the `6298:0000` tail link and preserved head `6109:0000`.
     This closes the third source-backed member only. It does not prove held
     save continuity or retail DOS allocator ownership. Paired runner/output
     hashes and source provenance: `research/cok-task197-third-party-member-2026-09-28.md`.
     No DOSBox or GUI.

198. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63; follows Task 197):
     continue the original-loader demo route through combat setup.** A
     no-key, no-seeded-party START/VROOMM run reached ECL2#57 interpreter index
     `0x8354` after fetching `LOAD_MONSTER #10,#2,#10`, `#4,#4,#4`, and
     `#31,#6,#31` in order. Each callback interval opened `MON2CHA.DAX`,
     `MON2SPC.DAX`, `MON2ITM.DAX`, and `CPIC2.DAX`; the route also opened
     `HEAD2.DAX`, `BODY2.DAX`, `BIGPIC2.DAX`, `PIC2.DAX`, and `SPRIT2.DAX`.
     The code hook stopped at `0x8354` before executing `COMBAT`. This closes
     only the script-to-combat boundary, not combat execution, attack behavior,
     held-save continuity, or retail DOS allocator ownership. Paired
     runner/output and source hashes: `research/cok-task198-original-demo-combat-boundary-2026-09-28.md`.
     No DOSBox or GUI.

199. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63; follows Task 198):
     capture the first original-loader combat dispatcher.** The no-key,
     no-seeded-party START/VROOMM route reached ECL2#57 index `0x8354` and
     entered descriptor 2 at module IP `0x386D` (`GAME.OVR:0x41D9`). The live
     `DS:72E7` selector was `0x24`. Retail bytes at module IP `0x39B9` branch
     selector `0x24` to `CS:IP=3EE3:191C` (`GAME.OVR:0x2288`); the run also
     opened `DUNGCOM.DAX` and `RANDCOM.DAX`. It hit an 80M instruction cap
     without a BIOS key wait or combat outcome, so it does not close the
     selector target's direct runtime entry, a turn, or effect-7 production.
     Paired trace and hashes: `research/cok-task199-combat-dispatch-2026-09-28.md`.
     No DOSBox or GUI.

200. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63; follows Task 199):
     confirm the selector-24 combat target at runtime.** The original no-key,
     no-seeded-party START/VROOMM route reached ECL2#57 `COMBAT` at index
     `0x8354`, then entered descriptor 2 module IP `0x191C` with live selector
     `DS:72E7=0x24`. The same invocation opened `DUNGCOM.DAX` and
     `RANDCOM.DAX`; it stopped after the second open at ECL index `0x8355`.
     This confirms handler entry and resources only, not their data-section
     reads, an input boundary, or a turn/effect-7 result. Paired runner/output
     and source hashes: `research/cok-task200-combat-handler-entry-2026-09-28.md`.
     No DOSBox or GUI.

201. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63; follows Task 200):
     capture the first combat archive data reads on the original route.** The
     original loader-backed no-key run entered the selector-24 handler and
     read the first compressed-data byte from DAX block 1 of both
     `DUNGCOM.DAX` and `RANDCOM.DAX` at file position 11 / ECL index `0x8355`.
     The DAX data sections begin at offset 11; captured destinations were
     `2491:3965`. `DUNGCOM.DAX` then read bytes at position 12 into `6917:0000`.
     The complete trace and paired hashes are in
     `research/cok-task201-combat-archive-data-reads-2026-09-28.md`. This
     proves initial compressed-data consumption, not full block decoding,
     combat outcome, or effect-7 production. No DOSBox or GUI.

202. **CLOSED BOUNDED 2026-09-28 (subtask of Task 63; follows Task 201): trace
     the original combat route to its first input boundary or instruction cap.**
     The original no-key, no-seeded-party START/VROOMM run reached ECL2#57
     `COMBAT` at index `0x8354`, opened both combat archives, and continued
     without a blocking BIOS keyboard read. At instruction 77,588,222, the
     modeled FindFirst service first received path bytes `43 3A 5C 76 FC FF
     76 FA B0 00` (`C:\` plus basename `76 FC FF 76 FA B0`); the DOS logger
     uppercased the basename to `VÜŸVÚ°`. 4,925 of 5,094 searches used the
     same malformed basename. The run stopped
     at 100M instructions while repeatedly visiting the resident START helper
     cluster around image offset `0xAFC1`; that address's routine role is
     unresolved (Task 193 locates a bounded-copy helper at `0xAF3E`). The
     malformed-search caller and its buffer provenance are unresolved, so this
     does not attribute the loop to retail code or the model. It proves no
     combat turn, attack, or effect-7 producer. Paired
     provenance: `research/cok-task202-combat-input-boundary-2026-09-28.md`.
     No DOSBox or GUI.

203. **CLOSED BOUNDED 2026-09-29 (subtask of Task 63; follows Task 202): capture
     the first malformed FindFirst caller on the original combat route.** The
     no-key START/VROOMM replay stopped at the first post-COMBAT FindFirst
     service at instruction 77,588,222. Raw path bytes were `C:\` plus
     basename `76 FC FF 76 FA B0` (the DOS log uppercases it to `VÜŸVÚ°`).
     The exact live INT 21h opcode at resident START image `0x9D81` matches
     retail bytes. Its helper copies the far pathname argument at `[BP+0x0C]`
     to local stack storage `[BP-0x50]`; the captured pointer matches that
     local buffer. The helper's argument source and producer remain open for
     Task 204. The DOS model had only GAME.OVR open at this stop. This does not
     attribute the malformed input to retail code or the model and proves no
     combat turn or effect-7 producer. Paired provenance:
     `research/cok-task203-first-malformed-findfirst-2026-09-29.md`. No DOSBox
     or GUI.

204. **CLOSED BOUNDED 2026-10-04 (subtask of Task 63; follows Task 203): trace
     the malformed pathname to the helper's argument source.** Task 218
     reproduced the original no-key route and captured the far argument
     `2491:34D2`, full length-prefixed bytes, and all six last guest writers
     before the resident START helper copied them to its local stack buffer.
     The bytes are faithfully copied by retail START `REP MOVSB` at unpacked
     image offset `0xAF5B`, with source `2491:3632`; no argument bytes were
     injected. This closes provenance only as far as the immediate guest copy
     in the modeled replay. The origin of the source temporary and the model's
     role remain unresolved for Task 219. See
     `research/cok-task218-findfirst-source-writer-2026-10-04.md`; no DOSBox,
     combat-turn, or effect-7 claim.

205. **CLOSED 2026-10-02: restore numeric-menu admission in CCMENU.**
     CCECL emits INPUT_NUMBER as metadata,destination with menu count zero
     for a free unsigned 16-bit answer. CCMENU previously compared the first
     operand to the destination and then repeated that comparison in its
     common menu path. The standing menu-resume harness now reaches and
     exposes this rejection. Integrate the bounded second-operand/count-zero
     validator while retaining exact event, text, and version checks.
     Align CCFP's count admission with CCECL's existing zero-count rule.
     External numeric preview evidence is under
     `C:\temp\GoldBox-number-menu-20261002`: 0, 750 and 65535 cold-resume
     correctly while the old helper rejects all three; mismatched destination,
     count one, nonzero text padding, truncated/trailing records and answer
     65536 reject without changing input bytes. Add these boundaries to the
     standing harness, run its complete gates, and refresh flow/corpus evidence.
     The source repair is now integrated. The complete CCMENU and CCECL
     menu-resume component gates pass, including numeric boundaries and
     the existing retail branches. The fresh source-bound sweep at
     `5e53112c` remains 18 PASS / 16 FAIL / 2 SKIP, with no status or needle
     changes. The full CCFP effects gate now passes its genuine sidecar
     numeric producer, exact answer-750 token and count-one/input-zero
     rejection with unchanged inputs. The full corpus at `0c5dd681` passes
     5,728 tests with 14 skips. The 65535 admission control uses `/S`;
     Task 209 separately owns the typed five-digit input repair.
     Keep Task 206 separate.

206. **CLOSED 2026-10-02: bind menu identity to the saved resume state.**
     CCMENU copied MN_ID into its answer without comparing it with GBRS and
     GBMN. CCECL's ordinary menu reader compared the answer with MN_ID, then
     resumed using GBRS; a changed MN_ID_PC plus a matching answer therefore
     passed despite disagreeing with the actual resume PC. Bind PC, area,
     destination and opcode in both helpers before publication or mutation.
     CCFP already checks these pairs; preserve the separate ACK validator.
     The external preview at
     `C:\temp\GoldBox-menu-identity-20261002\supported-context` passes a
     40-case old/new comparison on Gen1 numeric v14 and Gen2 context-4 v15
     records. Baselines accept the four individual identity mismatches;
     previews reject them through both helpers, preserve source/pending bytes,
     and retain the matching token on CCECL rejection. Valid controls still
     resume and consume their tokens. Matrix SHA-256:
     `3a759fcc1e482d9ee408236628bec7934693b330be1e18741be1f6fa8e02d370`.
     Integrate standing positive/negative tests, make synthetic valid fixtures
     internally consistent, measure capacity, and rerun the required gates.
     The source changes and standing regressions are now integrated.
     Both complete menu harnesses pass: CCMENU rejects all four mismatches
     on v14/v15, and CCECL rejects eight mutations carrying matching GBMO
     identities while retaining tokens and input bytes. CCECL measures
     23,383 emitted / 64,932 resident / 348 headroom bytes. ACK regression
     and the full engine build pass. The fresh 36-flow sweep retains every
     previous status and needle. The full corpus at `0c5dd681` passes
     5,728 tests with 14 skips.

207. **CLOSED 2026-10-02: model both DQK monster attack profiles in the
     integrated combat oracle.** `ccecl-dqk-combat-test.ps1` previously applied
     primary damage to every monster attack. Retail MONCHA member 52 GHAST
     has rates 4/2 and primary 1d4 / secondary 1d8; member 37 ZOMBIE has
     rates 2/0 and primary 1d8. The documented native scheduler spends
     secondary attacks first, then primary, with each rate halved and its
     odd extra granted on even-numbered rounds. Reconstruct each actor's
     per-round schedule independently of observed damage; use the selected
     profile's dice and signed bonus, preserving miss and RNG checks.
     A read-only offline check of the archived seed-4660 `DQKCMB.TRC` under
     `C:\temp\GoldBox-dqk-context-20261002\dqk-combat-lcg-failure-artifacts`
     reproduces the d20 rolls and monster damage across 17 attack rows
     with 39 RNG draws using both profiles; the primary-only model
     mismatches e0's round-one damage (1 versus 5).
     Reproducer: `C:\temp\GoldBox-menu-integration-20261002\check-dqk-profiles.py`,
     SHA-256 `e8c9ea7c0219a9f7cfd9186b99e79c0674e30724bab38442682c08228dfe4bbc`.
     This is archived-trace analysis, not a new runtime pass. Add independent
     controls using UMBER HULK (4/2, 3d4 and 2d10) and PRINCE TALHOOK
     (3/6, 1d6+3 and 1d4+2), including odd-rate phase, zero rates, misses and
     dice with no RNG draw. Require the revised oracle before changing the
     observed trace pin, then run the complete combat harness and flow gates.
     The integrated oracle now reads both profiles, spends one scheduled
     attack even on misses, resets its schedule cursor for each RNG-offset
     candidate, and preserves all prior battle/GBCR checks. Offline controls
     cover the retail profiles, alternating rates, misses, excess attempts,
     zero/one-sided dice and the damage floor. It accepts the fresh 48-row
     runtime trace before its observed pin is updated. The complete hidden
     harness then passes both encounters and resumes (2 groups, 10 enemies,
     LCG offset 12). The clean `514d32e6` sweep records 19 PASS / 15 FAIL /
     2 SKIP; this oracle is its only changed verdict. The full corpus at
     `4a3d83be` passes 5,730 tests with 14 skips. The bounded oracle repair
     is complete; it does not establish original retail two-round cadence.

208. **CLOSED 2026-10-02: make inventory resume rejection fixtures deterministic.**
     The corpus at `4ff2ba3d` has one failure among 5,720 passing tests:
     R0015 changes saved call depth from zero to one, leaving an unused
     return word at 30, inside its 22..35 valid range. CHECK accepts that
     structurally valid frame. Replace this assumption with depth 33 and
     explicit depth-one return addresses 21/36; preserve CRC validity and
     input hashes. Seven offline controls vary the unused saved word.
     The native gate must pass all 32 continuation rejections plus its
     existing yields, constructors, continuations and activation controls.
     Preserve the failed corpus and exact reproduction externally, then
     rerun the full corpus before closing Tasks 205/206 or pushing.
     The complete focused inventory gate now passes all 21 tests, including
     seven fixture-construction controls, 32 native rejections and all 35
     successful continuations. The full corpus at `0c5dd681` passes
     5,728 tests with 14 skips; log hash and path are in `HANDOFF.md`.

209. **CLOSED 2026-10-02: allow five-digit numeric input followed by Enter.**
     CCMENU and CCFP set their DOS AH=0Ah numeric input limit to five.
     The bundled DOSBox handler checks capacity before recognizing CR, so
     typing five digits leaves it waiting. Both allocated buffers already
     have room for five digits plus CR. An external sixteen-case comparison
     keeps zero/1234 working and changes both five-digit timeouts into exact
     65535 acceptance or 65536 rejection followed by zero acceptance when
     the limit is six. Pending effects and sidecars stay unchanged.
     Evidence: `C:\temp\GoldBox-numeric-boundary-20261002\max6-preview`,
     `MAX6-RESULTS.json` SHA-256
     `9b93dac2f088ff09141bd74bf18893f63d48f156707cd3fc8aa4f11bafcc8d82`.
     Integrate the input limit and standing typed-input controls in the
     complete CCMENU/CCFP harnesses, retaining existing command-line and
     malformed-count controls; rebuild and refresh flow/corpus evidence.
     The limit-six repair and typed-input controls are now integrated. The
     full engine build and 78 focused source/capacity/ownership checks pass;
     both complete component runtime gates pass typed 0/1234/65535,
     overflow-then-zero and the existing rejection controls with unchanged
     inputs. Complete log paths and hashes are in `HANDOFF.md`.
     The fresh `514d32e6` sweep has 19 PASS / 15 FAIL / 2 SKIP, with
     no new failures. The full corpus at `4a3d83be` passes 5,730 tests
     with 14 skips, closing this typed-input repair.

210. **CLOSED 2026-10-03: refresh DoK/NWN GBPR v2 flow contracts.** The
     DoK camp/rest and NWN harnesses still required GBPR version 1 after
     CCPARTY moved to v2. DoK now requires version 2, six 410-byte entries,
     compact flag 1, title ID 2, schema 1 and exact 2,476-byte extent while
     retaining its real `.GAM` body and HP/maxHP parity checks. NWN now
     requires version 2, its three-member 410-byte CoK-shaped bridge, flags 0,
     title ID 1, schema 1, and exact extent. Luna's isolated headless run
     passed the full DoK camp/rest flow, including mutation controls and real
     retail parity. The NWN run produced the exact valid header
     (`47 42 50 52 02 00 03 00 9A 01 00 00 01 00 01 00`, 1,246 bytes), but
     failed earlier at GBBOOT gate 5 before seed creation. Task 211 resolved
     that validator mismatch; the refreshed full flow sweep now records 23
     PASS / 11 FAIL / 2 SKIP with NWN passing. The full corpus at source
     commit `4d26c7c3` passes 5,780 tests with 14 skips.

211. **CLOSED 2026-10-03: admit CCPARTY's canonical v2 roster for generic
     Gen1 profiles.** The NWN route reaches `sync_cok_roster_count` after
     `CCPARTY: loaded 3 member(s)`, with a 1,246-byte GBPR v2 header carrying
     count 3, stride 410, flags 0, title ID 1, schema 1. The fresh flow then
     reports `GBBOOT: native preview failed; gate 5` and creates no GBPS.
     `validate_gbpr_header` rejects because `current_party_title_id` returns
     carry for NWN even though the producer emits the canonical generic v2
     shape. Fix the validator's generic-profile path without changing
     `current_party_title_id`: it also gates CCECL `/B /ID` arguments, and
     treating NWN as CoK there would enable CoK-only ECL reads. Prefer a
     bounded generic Gen1 allowlist matching the existing producer/consumer
     roster profiles; retain title-mismatch, compact-flag, schema, count,
     extent, truncation and trailing-byte rejection controls. Confirm NWN
     creates GBPS and advances to the next flow stage, and confirm DQK/DoK/CoK
     identity boundaries plus direct generic-profile CCECL roster rejection.
     `validate_gbpr_header` now allows that canonical noncompact v2 shape only
     when the profile has no title identity and the selected engine is Gen1
     DAX. `current_party_title_id` remains unchanged, preserving the CCECL
     `/B /ID` restriction. The staged NWN headless flow passes all title,
     creation, ECL7 combat, persisted roster, natural movement and combat/resume
     routes. The fresh full sweep at the matching source records 23 PASS / 11
     FAIL / 2 SKIP; the NWN route moved to PASS. GBBOOT measures 65,142 bytes
     resident with 138 bytes headroom, above its 128-byte floor. The full corpus
     at source commit `4d26c7c3` passes 5,780 tests with 14 skips. Luna's logs are under
     `%TEMP%\GoldBox-Luna-flow-stage`.

212. **CLOSED 2026-10-03: align CoAB/Buck/Pool bridge checks with GBPR v2.**
     Updated `native/gbcoab-flow-test.ps1`, `native/gbbuck-flow-test.ps1`, and
     `native/gbpool-flow-test.ps1` to require version 2, count 3, stride 410,
     flags 0, title ID 1, schema 1, and exact 1,246-byte extent while retaining
     each member identity and downstream combat/continuation/preview checks.
     Luna's isolated headless runs passed all three complete flows: CoAB direct
     combat/noncombat and natural movement continuation; Buck party/preview,
     combat/resume, and post-combat preview; Pool raw GEO preview, ECL map
     bridge, movement/combat/resume, and terminal branch. All exited 0. The
     clean-source sweep at `73873372` records **26 PASS / 8 FAIL / 2 SKIP**,
     36 classified, zero unclassified, zero retail file writes, and only the
     known DQK DOSBox directory mtime touch. CoAB, Buck, and Pool are PASS.
     `pnpm test:corpus` initially found stale README verdicts for those three;
     after correcting the prose, `tools/test_native_flow_status.py` passes 55/55.
     The complete `pnpm test:corpus` rerun passes 5,780 tests, 14 skipped,
     24 warnings (exit 0).

213. **CLOSED 2026-10-04: diagnose and repair DoK boot/create flow
     timeouts.** The
     fresh 36-script sweep still records timeouts in
     `gbdok-intro-flow-test.ps1` (`/J`), `gbdok-playable-flow-test.ps1`,
     `gbdok-create-test.ps1` (`/R`), and `gbdok-flow-test.ps1` (`/E /X`).
     Sol 6.1 identifies a plausible ACK boundary: GBBOOT launches CCFP when a
     sidecar exists, and CCFP ACK mode waits for BIOS INT16 input, while these
     headless harnesses do not inject a key. Luna captured `/R` at CCFP's DoK
     welcome ACK: pending GBEF v15/status 2, area 34/PC 151, final event
     `PARTYSTRENGTH`; the four-member GBPR and GBPS are already written. CCFP
     waits in `INT 16h/AH=00h`. Luna's synchronized GameLink probe observed
     `program=CCFP` and the exact v15/status-2 effect before sending one `P`;
     this is reliable because CGB drains stale queued BIOS keys during startup.
     The probe also confirmed the intro, playable, create, and compact flows all
     reach this ACK boundary. Prequeued BIOS P helpers, both before GBBOOT and
     immediately before its command, failed and were discarded.

     Sol recommended and Luna completed a controlled playable-flow A/B using
     otherwise identical staged fixtures, binaries, DAX/config/DAA inputs, and
     initial session. With GBBOOT assembled from HEAD (`gbboot.com` SHA-256
     `34BE053C...AF39F4`), one synchronized GameLink P reproduced
     `CCECL: bad or unsupported resume state`, `CCFLOW` failure, and gate 8;
     the file log showed the movement child opening stale `_GBECL.BIN` v15/
     status 2 while completed `_GBRES.BIN` was v9/status 0. With the correction
     (`gbboot.com` SHA-256 `5BF48ABC...C81BA1`), the same P completed gameplay:
     `_GBSTEP.BIN` v1 selected descriptor 142 at (1,0), `_GBSESS.GBS` advanced
     to (1,0), and `_GBECL.TXT` contained `GET OUT!` with no GBHD error. Both
     captured runs, frames, logs, and sidecars are preserved in the Luna temp
     artifact directories reported in the handoff. The unchanged
     `native/ccecl-ack-resume-test.ps1` also passes its ACK PCs 151/223, cold
     resume, token, and rejection assertions.

     GBBOOT now retains the v9 `resumepath` selected by `.ecl_return` instead
     of reopening the pending v15 ACK as `/P`, always routes Gen1 resumes
     through CCFLOW, restores the checked header after picture rendering, and
     reads combat graphics from the selected resume effect. The DoK GameLink
     driver synchronizes to CCFP's actual opened effect, checks exact ACK
     identity, captures per-ACK evidence, and injects BIOS Enter without host
     focus. The four standing DoK controls (intro, create, compact flow, and
     extended playable flow) pass on current source; the playable route covers
     empty and natural combat, tactical ACKs, retail XP writeback, and replay
     rejection. Focused Python contract/precondition/capacity tests pass 41/41;
     PowerShell parse and `git diff --check` pass. Build reports GBBOOT 138
     bytes headroom, above the 128-byte floor. CoAB and Buck completed-result
     assertions now pin the CCFLOW terminal `flags=0120` + validated GBSL
     representation; isolated current-source CoAB and Buck routes pass.
     The post-commit clean-source sweep and README reconcile are recorded in
     `native/flow-status.json`; the flow-status gate passes 55/55. The full
     `pnpm test:corpus` run passed 5,780 tests with 14 skips (564.24s). Python
     3.13 emitted repository-documented Unicorn `mem_map` Windows access
     violation tracebacks during native-backed tests, but pytest completed
     successfully. The sweep measured 29 PASS, 5 FAIL, 2 SKIP: one singleton
     contention guard, two independent DQK combat traces, and the two Task 214
     block-51 contracts. Isolated current-source DoK playable, intro, create,
     and compact-flow routes pass; CoAB and Buck pass. Commit `62cb66cf`
     contains the source changes. Task 214 was completed below.

214. **CLOSED 2026-10-04: restore source-faithful DoK block-51 trap/thief
     flows across the v15 ACK boundary.** Replaced the obsolete immediate
     status-3 combat assertions with the measured v15/status-2 ACK at area 51,
     PC `0235`, retaining the high-skill GBPS matrix and zero-skill negative
     branch. The typed CCFLOW producer now carries the GBSL metadata through
     the exact CCFP GameLink ACK; cold continuation reaches the retail
     `DISARM/LEAVE` SHORT_MENU at `026B`, AWARD_XP `(0,7500)`, and a second
     typed ACK at `02CE`. DISARM records XP `(0,10000)`, then terminates at
     `02D7` with `4CE9=1` and `4CE8=0010`; LEAVE terminates at `0279` with
     `7EC9=00FF` and `4CE9=1`. Neither menu choice claims or queues combat.
     The separate queued-combat fixture remains pinned. Corrected GameLink
     trace collection to copy `D:\CCECL.TRC`, and assert the retail cold
     continuation PCs for the menu, XP, DISARM and LEAVE paths. Luna's
     identical-session clean/stale `_GBPARTY.GBP` A/B produced byte-identical
     eight-Sivak combat, effect, resume and generated-party artifacts; the
     prior roster by itself does not reproduce the former suite failure.
     Focused combat-gap and thief-matrix scripts pass; the clean sequential
     36-flow sweep measures 31 PASS, 3 FAIL, 2 SKIP, with both Task 214 flows
     green. Flow/README agreement and subject gates pass (86 tests), and
     `pnpm test:corpus` passes 5,780 tests with 14 skips (560.48s); the
     repository-documented Unicorn `mem_map` access-violation tracebacks were
     emitted during pytest, which completed successfully. Task 215 records the
     two DQK trace failures; the remaining singleton failures are grouped in
     Task 216.

215. **CLOSED 2026-10-04: diagnose the two DQK natural-combat flow failures.**
     Both failures shared a stale party-victory expectation. Sol independently
     replayed all 158 attack rows and 393 LCG draws: one legitimate leaving
     reaction uses the primary profile and rear AC adjustment without consuming
     the scheduled attack cursor, and the four-black-dragon battle correctly
     ends with all six heroes unconscious. Added a shared MONCHA/LCG oracle with
     that fixture-scoped reaction model; it validates outcome, exact GBCR and
     the independent retail QSV max-HP row. Both GBBOOT routes retain four
     dragon/six-party checks, tactical RAW, resume, GBPR and post-combat
     exploration/snapshot assertions. Luna ran both flows headless and they
     pass; the standalone CCECL queued/natural oracle flow passes too. The fresh
     36-script sweep records 34 PASS, 0 FAIL, 2 SKIP; Task 216 resolved the
     remaining DoK GameLink teardown overlap. Focused gates pass 91 tests.

216. **CLOSED 2026-10-04: eliminate intermittent DoK GameLink teardown overlap.**
     The machine-wide `Get-Process dosbox-x` check could see the prior ACK
     stage's DOSBox-X process during Windows teardown and reject the next stage.
     Added a bounded 10-second, 100 ms poll before that guard; a process still
     alive at the deadline remains a hard failure. Luna ran DoK playable, create
     and compact/base flows serially; all passed. The full 36-script sweep also
     passed every non-skipped flow: 34 PASS, 0 FAIL, 2 SKIP, with only the known
     DQK DOSBOX directory-mtime touch and no retail file writes. Focusless
     GameLink input and identity-checked ACK evidence remain intact.

217. **CLOSED 2026-10-04: run the two skipped native graphics-flow gates from
     held Amiga sources.** The latest sweep's only skips are
     `gbcombat-icon-flow-test.ps1` and `gbscene-dos-flow-test.ps1`, both blocked
     by obsolete `amiga_extracted` paths. Sol verified that the required
     `8X8D1.DAA`, `CPIC1.DAA`, and `BIGPIC1.DAA` archives for CoK and DoK exist
     in the held WHDLoad `data` folders; keep extraction-first precedence and
     copy fallback inputs into each scratch run. First make source resolution
     complete without changing the runtime protocol, then have Luna run each
     newly active flow and capture exact ACK boundaries. Add identity-checked
     GameLink handling only for boundaries observed in those captures. Retain
     icon ID/platform differentiation, CCCOMBAT wiring and overflow controls,
     plus the scene's collected-versus-presented trace, exact 112/96/113/77/112
     replay, provenance, deprivation and C64 checks. Both flows pass; the
     combat-icon arms retain 4/4 nonblank outputs, 3/3 cross-platform diffs,
     same-run per-ID differentiation, both overflow controls, and all plain
     icons. The scene retains the source/presented and C64 checks and captures
     all nine stepped snapshots. A fresh Luna sweep passes 36/36, 0 skips; no
     retail files changed, `native/src` remained clean and unchanged, and only
     the known DQK DOSBOX directory mtime moved. Focused combat-icon rerun also
     passes with process exit 0. The corpus gate remains to run at this
     checkpoint.

218. **CLOSED BOUNDED 2026-10-04: establish the last writer of Task 204's malformed
     FindFirst pathname.** Reproduce against current read-only START/OVR inputs
     and watch the source pointer previously observed at `2491:34D2`, a runtime
     stack segment rather than application DS. Capture its initial bytes after
     model construction and the last guest writer for each malformed basename
     byte before the helper copies the Pascal path; record CS:IP, value/extent,
     registers, and instruction count. Compare every captured value with the
     actual source bytes, preserve the full length-prefixed source string, and
     map executed writes to retail START/OVR offsets. All six last writes
     matched the source bytes and resolve to retail START `REP MOVSB` at
     unpacked image `0xAF5B`; first malformed service remains instruction
     77,588,222. The saved archive and input/probe hashes are recorded in
     `research/cok-task218-findfirst-source-writer-2026-10-04.md`. This proves
     the immediate copy in the model, not the source temporary's origin or
     model correctness. Sol recommends the next bounded task:

219. **CLOSED BOUNDED 2026-10-04: trace the immediate writer of the malformed
     FindFirst basename.** A 24-byte watch beginning at `2491:362E` established
     the candidate Pascal length byte `0F` and source payload. All six bad
     bytes at `3632..3637` had guest latest writers at instructions
     77,588,094..99, `CS:IP=1A46:0B76`; each copied its exact value from
     `2491:3734..3739`. Runtime bytes map to unpacked START `0xAFD6`, where
     `f3a48edaca0400fc` matches. The first positive-CX copy body then carries
     the Pascal payload from `2491:362F` to the argument at `2491:34D3` before
     the helper-local copy; the first malformed FindFirst boundary is unchanged.
     This is immediate guest-writer provenance in the modeled replay, not proof
     of intended retail caller state or complete absence of model influence.
     The initial automatic audit chose a final `CX=0` REP callback; the saved
     write history was independently audited and the probe's next-run capture
     now freezes the first positive-CX matching iteration. Evidence:
     `research/cok-task219-findfirst-append-source-2026-10-04.md`.

220. **CLOSED BOUNDED 2026-10-04: trace the malformed Pascal append and its
     producer.** On the same no-key replay, helper `1A46:0B51` at instruction
     77,588,081 received source `2491:3733` and destination `2491:362E`, with
     return `169C:0328`. The object length was eight and its payload was
     `76 FC FF 76 FA B0 00 50`. The first positive-CX `0B76` copy at
     77,588,094 read `2491:3734` and wrote `2491:3632`, `CX=8`. All eight
     bytes were last written by `REP MOVSB` at `19C4:02B5`, from
     `2491:3823..382A` to `2491:3734..373B`; this instruction maps to unpacked
     START `0x9EF5` and matches retail bytes. The copy is in START's path
     splitter entered at `19C4:0256`. The first malformed FindFirst service
     remains instruction 77,588,222. This traces the immediate source but not
     the input path's origin or correctness. Evidence and hashes:
     `research/cok-task220-findfirst-append-source-2026-10-04.md`.

221. **CLOSED BOUNDED 2026-10-04: trace the path-splitter input and caller.**
     At `169C:02A7` entry SP `3876`, the incoming far argument at `+0E/+10`
     is `2491:3989`. Its Pascal length is `0D`, and the 13-byte payload
     matches the source object passed to `1A46:0ADE` (capacity `0050`, return
     `169C:02C1`) for destination `2491:3822`. The first positive-CX body at
     `1A46:0AFB` reads `398A` to `3823`, CX `0D`. All six malformed basename
     bytes at `3823..3828` have guest last writers in that copy at instructions
     77,587,756..761. START path splitter `19C4:0256` receives the expected
     four pointers and the length-13 object. First malformed FindFirst remains
     instruction 77,588,222. The caller argument's producer is still unknown.
     Evidence: `research/cok-task221-findfirst-path-input-2026-10-04.md`.

222. **CLOSED BOUNDED 2026-10-04: trace both operands into the caller path.**
     At `169C:0780`, left `2491:3C37` is Pascal length 9 with payload
     `76 FC FF 76 FA B0 00 50 32`; right `2491:3BE6` is length 4, `.dax`.
     Capacity-`14h` `0ADE` calls copy them to `3AA2` and `3A8D` respectively.
     `0AC4` assigns the left operand to `3989`, and `0B51` appends the right
     at `3993`. The composed Pascal value has length `0D` and payload
     `76 FC FF 76 FA B0 00 50 32 2E 64 61 78`, exactly Task221's splitter
     input. The argument payloads are guest-read from `3CA6..3CAE` and
     `3CA1..3CA4`; their Pascal headers are `3CA5` and `3CA0`. The malformed
     FindFirst boundary remains instruction 77,588,222. Evidence:
     `research/cok-task222-findfirst-path-operands-2026-10-04.md`.

223. **CLOSED BOUNDED 2026-10-04: trace the two Pascal source operands upstream.**
     Watch Pascal objects at `2491:3CA0` (right) and `2491:3CA5` (left) from
     initialization. Capture their actual length bytes, payloads, guest
     writers, and the caller frame feeding them into `169C:0780`. Trace their
     runtime objects at `2491:3CA5` and `2491:3CA0` are the nine-byte malformed
     prefix and `.dax`. Sol's static/runtime cross-check traced the eight-byte
     prefix to object `3DBF`, final digit `2` to `3DB0` (added into the length
     by `0B64`), and `.dax` to the retail descriptor-28 literal at GAME.OVR
     `0x3CA56`. The replay boundary remains instruction 77,588,222. Evidence:
     `research/cok-task223-findfirst-operand-sources-2026-10-04.md`.

224. **CLOSED BOUNDED 2026-10-04: capture the malformed prefix argument.**
     Descriptor-28 entry `4705:00E4`, instruction 77,574,317, receives its
     Pascal-string argument at stack `+0C/+0E` as `4950:03D7`. Captured source
     starts `FF 76 FC FF 76 FA B0 00 50`; `FF` is interpreted as Pascal
     length 255 and clamped to capacity 8. The `0ADE` return at `00FE` copies
     payload `76 FC FF 76 FA B0 00 50` to `2491:3DBF`. `4950:03D7` aliases
     executable bytes `489D:0F07` (physical `498D7`), matching GAME.OVR
     descriptor 23 file offset `34EB2`. The supplied pointer is still
     unexplained. Replay boundary remains instruction 77,588,222. Evidence:
     `research/cok-task224-findfirst-prefix-source-2026-10-04.md`.

225. **CLOSED BOUNDED 2026-10-04: trace the bad far-pointer handoff.** Caller `3DE4:097F..099A`
     constructs local Pascal `PIC` from literal `CS:0910` with `0AC4` returning
     to `098E`, then passes a retained destination far pointer through public
     stub `1105:002A` to `4705:00E4`. The copy to local `SS:BP-5 = 2491:3DD7`
     writes `PIC` over the retained destination far pointer at `SS:3DD6`: the
     pointer changes from `D7 3D 91 24` (off `3DD7`, seg `2491`) to
     `D7 03 50 49` (off `03D7`, seg `4950`). This self-overwrite is complete
     by helper return `098E`; the bad pointer is passed unchanged at `099A`
     through public stub `1105` to `4705:00E4`. Replay boundary remains
     instruction 77,588,222. Evidence:
     `research/cok-task225-findfirst-pointer-handoff-2026-10-04.md`.

226. **CLOSED BOUNDED 2026-10-04: attribute stack drift to the first call.** At
     `3DE4:0917`, caller BP `3DDC` reserves six bytes, so SP should be `3DD6`
     before `097F`; observed SP is `3DDA`, four bytes higher. Capture `0914`,
     `0915`, `0917`, `091A`, before `091D` and return `0922`, before `0925` and
     return `092A`, then `097F`. Compare actual call targets, return frames, and
     SP transitions for public stubs `104E:002A` and `104E:0025`, which lead to
     descriptor-7 procedures `0032` and `0168` with retail `RETF 2` epilogues
     at `0165` and `01E5`. The six-byte allocation is correct at `091A`
     (`SP=3DD6`); the first return at `0922` has `SP=3DDA`, four bytes too high.
     The second call reaches `RETF 2` at `01E5` and returns to `092A` at
     `SP=3DDA`, serving as a clean control. The targeted filter did not observe
     the first call's static candidate epilogue at `0165`, so it does not
     identify the responsible instruction. Evidence:
     `research/cok-task226-findfirst-stack-drift-2026-10-04.md`.

227. **CLOSED BOUNDED 2026-10-04: compare first-call execution with live code.**
     In the same replay, all instructions from `3DE4:091D` to `0922` were
     captured with linear hook addresses and matching segment bytes. The
     observed sequence contradicts those bytes: `2891:00C5` contains
     `E9 8B 00` (jump `0153`), but the next callbacks are `00C7`, `00C9`,
     `00CD`; the return state resembles `RETF 6` although memory has different
     instructions. First-call return SP remains `3DDA` versus expected
     `3DD6`. Stale translated code is the leading, unconfirmed explanation.
     Evidence: `research/cok-task227-findfirst-call-window-2026-10-04.md`.

228. **CLOSED BOUNDED 2026-10-04: cache-refresh A/B confirms stale translation.**
     At `3DE4:091D`, the probe hashed physical code range `28910..2AB0A`, ran
     Unicorn `ctl_remove_cache` once, rewrote IP to `091D`, and confirmed the
     full memory hash and sampled code bytes were unchanged. Execution then
     followed current bytes `00C5 -> 0153`, reached `RETF 2` at `0165`, and
     returned with `SP=3DD6`; descriptor-28 entry received intact `PIC` at
     `2491:3DD7`. This confirms a modeled translation-cache problem, but the
     cache invalidation and PC rewrite were combined, and the earlier write or
     reload causing staleness is unknown. The path diverged and reached the
     80,000,000-instruction cap before the malformed FindFirst boundary.
     Evidence: `research/cok-task228-findfirst-cache-ab-2026-10-04.md`.

229. **CLOSED 2026-10-04: identify stale translations after overlay replacement.**
     The no-intervention replay captured 18 host `GAME.OVR` reads into physical
     `28910..2AB0A` and 15,752 separate guest word writes. At instruction
     52,309,892, descriptor 10 was loaded at `28910`; its `03 F8` at module
     `00C5` executed with hook size 2 at instruction 54,284,579. At
     76,889,694 descriptor 7 replaced the range; retail `GAME.OVR:0x8B06`
     contains `E9 8B 00` (jump to `0153`). At instruction 77,574,238, Unicorn
     still reports size 2 at `00C5` and continues to `00C7`. No cache purge or
     PC rewrite ran. The replay reaches the original malformed FindFirst
     boundary at 77,588,222. Guest-write classification remains partial;
     they were not all proven relocations. Evidence:
     `research/cok-task229-overlay-cache-staleness-2026-10-04.md`.

230. **CLOSED 2026-10-04: refresh Unicorn code after DOS overlay reads.** The
     modeled AH=3F handler now invalidates translations overlapping a successful
     nonempty host write, after writing the bytes. The fresh no-call-site-control
     replay passed through a relocated public handoff at `1105:002A` to
     `365C:00E4`, with local Pascal `PIC`, and successfully found/opened
     `PIC2.DAX` twice. It reached the 80,000,000-instruction cap at `127F:06E1`
     without a BIOS block; this is not labeled a hang. A separate private
     pre-fix tracer control invalidated `28910..2AB0A` once at `3DE4:091D`,
     without any IP or register writes. Memory and registers remained unchanged;
     live bytes at `00C5` encoded a jump to `0153`, the next observed callback was `0153`, and the trace reached `RETF 2` at `0165`,
     returned at `0922` and reached `097F` with `SP=3DD6`, then passed
     `2491:3DD7` / `03 50 49 43` to `4705:00E4`. Evidence:
     `research/cok-task230-overlay-cache-invalidation-2026-10-04.md`.

231. **CLOSED BOUNDED 2026-10-04: establish natural combat reachability to
     the effect-7 callback.** The cache-corrected ordinary START replay used
     descriptor-derived OVR file offsets and checked live instruction bytes.
     Descriptor 9 passed context `+3` and body `+0x189`, reached `0x167AF`, and
     entered `0x14F24`; the joined mode-4 sequence at `69,565,821..69,566,081`
     reached descriptor-12 callback `0x10DF0`. The first callback hit at
     `69,550,629` followed mode `0x0A` and is not conflated with that attack.
     The cap was 80M at `127F:06E1`, blocked=0, no BIOS block. Owner/target
     pointer semantics, latest per-byte writers, and callback-table initialization
     remain unresolved. Evidence: `research/cok-task231-effect7-runtime-boundary-2026-10-04.md`.

232. **CLOSED BOUNDED 2026-10-04: snapshot the attack-specific effect-7
     callback inputs and immediate writers.** The natural replay stopped before
     descriptor-12 `10DF0` at instruction 69,566,081, selected by the
     attack-specific `14F24` → mode-4 dispatcher → index-7 wrapper chain. It
     captured `14F24` pointers `6C01:0000` and `62FD:0000`; the owner handle at
     `2491:3D2C` resolves to `62FD:0000`; the wrapper index is 7 and auxiliary
     pointer is `60AA:0008`. The selected body's `+0x183` points to
     `618B:0008`, `+0x189=01`, and the 22 context bytes each have a latest
     guest writer after a dynamically observed clear. The body context pointer
     stores map to descriptor-10 allocator offsets `F2AF/F2B4`; the context
     target pointer stores map to descriptor-13 `168BB/168BF`. Complete source
     lineage for the target and argument/auxiliary inputs remains open. No
     callback result or consumer meaning is inferred. Evidence:
     `research/cok-task232-effect7-input-provenance-2026-10-04.md`.

233. **CLOSED BOUNDED 2026-10-07: join allocation and target-pointer operands to Task232 stores.**
     Result: static retail bytes and the Task232 trace join both operands (13 static + 10
     trace checks, 12 pytest cases incl. 9 mutation controls seen RED); the target pointer's
     pre-existing equal value (before==after) leaves its earlier writer open. Evidence:
     `research/cok-task233-effect7-operand-joins-2026-10-07.md`. Original scope:
     For the selected body pointer, source-map `F273`'s current-member local
     `[BP-4]/[BP-2]`, the `F2A7` call to resident allocator `A46:023F` with size
     `16h`, the allocator entry/return (`DX:AX` at `F2AC`), and the stores at
     `F2AF/F2B4`. Verify returned `AX=0008, DX=618B`, destination body
     `62FD:0000`, and stored bytes; retain the following 22-byte clear evidence.
     For the target pointer, join the selected `167AF` call's source frame
     `[BP+10h]/[BP+12h]` to stores `168BB/168BF` and its destination body
     `[BP+14h]/[BP+16h]` through `body+183` to context `618B:0008`. At entry
     before prologue, these operands are `SP+0E/+10` (source) and `SP+12/+14`
     (destination); the relevant invocation entered at 68,648,477. Verify the
     source pointer `6C01:0000`, destination `62FD:0000`, and no intervening
     replacement before callback instruction 69,566,081. Prove both operand to
     store joins or name the first unresolved upstream operand. Stop before
     executing the selected attack-specific callback; the replay has already
     passed the earlier mode-0A callback. Do not interpret outputs, infer trusted
     damage/RNG, or modify consumers. Have Sol reassess the queue after this bounded slice.

234. **CLOSED 2026-10-09: validate complete DOS HLIB MONCHA members before
     record admission.** The `275331c4` DAX bounds/GLIB prerequisite checkpoint
     is verified by the 44/44 flow sweep, 45/45 component sweep and full
     corpus (6,559 passed / 14 skipped, exit 0). The current HLIB decoder
     accepts declared-length underflow and dangling literal/repeat controls
     after a complete record. The independent census confirms all 225 held
     DOS HLIB members have complete runs, consume their full member spans,
     and match their BE declarations. Implement a separate strict HLIB
     decoder: declaration 1..2048, whole-run input/output validation, codec
     no-op 0x80, full member consumption and exact output length. Preserve
     the legacy GLIB branch: legitimate headerless RLE and raw422 generations
     make blanket prefixed validation incorrect. Propagate HLIB carry before
     the consumer marks the monster record loaded; malformed data must not
     become a roster placeholder. Prove actual assembled behavior, individual
     guards, all 225 DOS retail records, consumer rejection controls and
     unchanged GLIB smoke behavior. Rebuild and refresh both native rosters
     after source changes, then run the corpus and commit/push. Census,
     archived-before/proposal comparison and 29 passing offline draft tests
     are outside source at `C:\temp\GoldBox-resume-20261009`; the draft is
     not shipped engine behavior. See `HANDOFF.md` for recovery details.

     The live implementation passes 127 focused tests, including 34 extracted
     assembler tests and exact counts/bytes for all 225 DOS records. Luna's
     archived binary admitted seven malformed records and mishandled the
     no-op; the repair passes all twelve consumer cases. Retail DQK outputs
     remain byte-identical and the five-case GLIB smoke passes. The new
     consumer harness is required by the component roster and ownership
     registry (123 candidates). All 16 targets build; CCCOMBAT has 32,816
     bytes free. The full flow sweep passes 44/44; the refreshed component
     sweep passes 46/46; corpus passes 6,605 tests / 14 skipped, exit 0.
     All source-bound artifacts use clean, unchanged native source at
     `a6c52623`. The first component run's sole failure exposed an inherited
     fixture encoder using 129-byte literals (the codec's no-op token).
     Correcting it to 128-byte chunks preserves every existing numeric trace
     assertion; four old-helper boundary cases were RED before all seven
     corrected-encoder cases passed. The final HLIB module passes 41 tests.
     Failed and repaired fixture evidence remains outside source.

235. **CLOSED BOUNDED 2026-10-10: establish source-owned Secret Amiga basic-melee
     stats and explicit profile transport.** The real area-16 combat island
     in `gbsecret-glib-combat-flow-test.ps1` loads logical monster 72, member
     59, FIRE KNIFE. Its 440-byte headerless RLE record currently enters the
     generic GLIB/DQK decoder and can use placeholder stats. Flat GLIB data
     detection selects `game_hlib_data`; `build_combat_tail` carries no title
     profile. GBPR's CoK/DoK/DQK identities and GBEF's generic Gen2 D0xx tag
     must not be repurposed as proof of Secret identity.

     Independent byte comparison proves all 70 Amiga records equal their
     DOS 439-byte counterpart followed by one zero byte; there is no internal
     offset shift in this corpus. Secret's own DOS GAME.OVR copies paired
     attack fields 291/292, 293/294 and 295/296 at `0x3A475..0x3A4DC`, uses
     primary 291*293 and signed bonus 295 at `0xE52A`, and selects kind 2
     when primary rate 289 is zero at `0x15B24`. FIRE KNIFE and DRIDER have
     zero primary rate/count and a populated secondary tuple. Do not read
     byte 292 as a primary damage bonus or replace inactive primary damage
     with a generic default. Prove the active two-kind scheduler/damage
     consumer and any later equipment recalculation before claiming melee
     fidelity; FIRE KNIFE's inventory alone does not prove the attack source.

     Then transport an explicit Secret/Amiga source profile through ordinary
     GBBOOT and standalone CCCOMBAT without weakening party identity or the
     bounded DOS command tail. Require a complete headerless 440-byte member
     under that explicit profile, reject wrong profiles/malformed records,
     and prevent this verified path from falling into DQK placeholders.
     Acceptance includes exact bytes for all 70 records, source-owned numeric
     HP/THAC0/AC and verified active damage on the real route, plus independent
     stat-field mutation controls. Keep unverified XP, morale, saves and
     special mechanics outside the basic-melee claim. If consumer proof is
     incomplete, record the exact remaining link rather than shipping another
     placeholder or presenting profile plumbing as gameplay fidelity.
     Read-only evidence is outside source at
     `C:\temp\GoldBox-task234-20261009`: `secret-platform-stat-probe.py`,
     `secret-platform-stat-probe.json`, `secret-layout-followup.py`,
     `secret-layout-followup.json`, and `next-glib-identity-review.md`.

     Source checkpoint: `tools/secret_melee_oracle.py`,
     `tools/secret_melee_stats.py` and `tools/test_secret_melee_stats.py`
     pass 751 focused tests. Complete original recalculation, all 70 actors,
     poison controls, paired fields, source HP roles and auxiliary/catalog
     data correspondence are verified. The effective FIRE KNIFE normal
     baseline is HP52/THAC0 14/AC6, secondary rate2/1d8+0; armor is readied
     and the weapon pointer is null. Actual damage uses437; healing caps at112.
     At source checkpoint `977589e2`, normal coefficient import was not yet
     implemented in the DOS client.
     The original positional/backstab and global-affect paths have explicit
     preconditions; no whole-encounter or Amiga-executable parity follows.
     Continue with source-profile transport and normal-frontal import using
     this independent model, preserving the original gameplay acceptance.

     Native implementation now has explicit `/9 1` transport, strict full
     MONCHA/auxiliary metadata and payload checks, catalogue/path ownership,
     normal equipment reconstruction, both attack kinds, Secret parity/RNG
     and byte-wrapping damage. All 16 targets build; 163 live assembly checks
     pass, including all 70 records and native coefficient imports. Luna's
     20-case real-route numeric/mutation/rejection pass is green. Both
     clean-source sweeps/corpus are pending;
     the task remains open and previous native status artifacts are stale.
     Phase audit on 2026-10-10 found first source counter0 before allocation,
     incremented only after turns. Native round1 now maps to parity0. Five
     odd-rate retail monsters discriminate this; an independent rate3 route
     is RED on old code and GREEN (one then two attacks) on the correction.
     The source-provenance test brings original/model checks to 752; native
     checks remain 163. Pre-fix 44/44 and 46/46 sweeps are stale for this fix.

     Closure: implementation `023a2df8`, phase correction `7e7a4073`.
     Final source/model/native focused checks pass 915; Luna's full 20-case
     real-route profile/legacy matrix passes with old-binary RED controls.
     Fresh full sweeps pass 44/44 flows and 46/46 components, binding clean,
     unchanged canonical source8ed5200e…952b81. Full corpus passes 7520 /14
     skipped, exit 0. Capacity pins were refreshed from the measured 16-target
     manifest; the first corpus's only two failures were stale doc pins.
     No retail file changes were measured; DOSBOX directory mtime touches
     are recorded separately. Source/current data loading and normal-frontal
     coefficients are supported; full encounter, transient/positional,
     spell/backstab/XP/morale/save behavior remains outside this claim.
     Evidence and exact limits are in the top handoff.

236. **CLOSED 2026-10-10: source-owned Secret party import and native-owned
     combat HP persistence.** Task235's real route still uses a fixture party
     and explicitly rejects Secret GBPR. Import the six held 439-byte
     CHRDATA1..6.SAV pregens through explicit selection, preserving complete
     records and actual companion ownership, then use them through ordinary
     GBBOOT combat. Introduce explicit Secret roster identity/schema and
     update the necessary producer/consumer/result/persistence boundaries
     without weakening existing CoK/DoK/DQK roster or flow validation.

     First prove the relevant original player-loader chain: `255D8` clears
     archived pointers, independently probes `.STF`67 and `.SFX`9, runs
     `3A292`, then `3C1B1` class/attack setup. Preserve type73 nested STF
     ownership rather than treating its extra bytes as padding. The held
     pregens have no STF companions; SFX files exist for 1,2,4. Actual
     no-inventory behavior requires correct-path absence proof. Source
     dialect1 is assigned by Add Secret; BLADES.CFG supplies C:\SAVE\ and
     its menu enumerates WHO files, which are absent here. Explicit loose
     SAV import must not be presented as original menu/active-save restoration.

     Acceptance: all-six current/max HP and equipped normal coefficients
     against original player setup and relevant pre-combat recalculation;
     independent HP/equipment mutations; valid/malformed/foreign roster and
     companion controls; actual ordinary GBBOOT area16 combat with imported
     heroes; supported HP changes persisted to native-owned state and
     retained after cold reload; original assets unchanged; unsupported
     XP/status/special transitions explicit. Required build, Luna runtime,
     both clean-source sweeps, corpus and commit/push remain. Do not spend
     CCECL's 132-byte reserve by indiscriminately extending every consumer.
     Source prerequisites are external at
     `C:\temp\GoldBox-task236-20261009\player-loader-advisory.md` and
     `player-path-dialect-advisory.md`; player emulation and native integration
     were not implemented at task selection.

     Source prerequisite update: `tools/secret_player_oracle.py` now executes
     original439-byte loading with actual companions, real allocator and
     class/equipment/pre-combat setup. `tools/secret_player_stats.py` is an
     independent normal projection; 195 new tests and 1110 combined focused
     tests pass. Class setup unreadies forbidden armor and historical class
     equipment eligibility differs from historical THAC/rate eligibility.
     STF73 children remain owned without becoming equipped main items. Full
     native roster/persistence integration and real-route task acceptance
     remain pending; this source checkpoint does not close the task.
     Full corpus now passes 7715 /14 skipped, exit 0; native source/artifacts
     are unchanged. The original loader probe and portable calculation are
     tooling prerequisites, not native party gameplay closure.

     Native integration update: GBPR3/title4 preserves full SAV439 bodies,
     owned STF67/SFX9 and catalogue; CCPARTY/S loads owned cold state instead
     of reimporting sources. CCCOMBAT reconstructs player normals through
     source-verified class/equipment setup, applies phase0/player byte damage
     and retains primary turn budgets. GBBOOT selects and transports this
     party; CCECL gates unsupported WHO with ID4. GBHR2/mode4 and GBCR3 exact
     preimage binding feed a dedicated full-image HP-only CCHOST transaction,
     with GSJ/GSB recovery before missing-roster import. Retail assets remain
     read-only. Compiled tests cover persistent-operation interruption/error
     retry, malformed authority and over-32KiB results. Luna has verified
     all-six standalone stats, actual area16 import and HP persistence, and
     cold boot without source files. Final entry/recovery/WHO controls pass,
     with rejected answer tokens preserved and standing menu-resume coverage.
     Both required clean-source sweeps/corpus/commit/push remain pending.
     CCECL currently has101 free bytes, above its 64-byte floor. Exact scope
     and retained external evidence are in the current handoff.

     Closure: implementation `557e5d26`, 1,242 focused source/model/native
     checks and final Luna controls pass. Required clean-source sweeps pass
     44/44 flows and46/46 components, source dirty/changed false; corpus
     passes7,847 /14 skipped /84 warnings, exit 0. No retail files changed;
     DOSBOX directory mtime touches are recorded separately. Source hash,
     durations and external evidence are in the current handoff. Scope is
     explicit loose-pregen import, normal coefficients and native-owned
     HP-only host publication/recovery; no original WHO saved-party restore
     or full status/spell/encounter fidelity is claimed.

237. **CLOSED 2026-10-10: settle completed Secret combat before fresh
     startup can overwrite its result.** Task236 covers HP-only publication
     and post-GSJ recovery, but source inspection finds an earlier loss window:
     CCCOMBAT closes complete GBCR3 before GBBOOT writes the current request
     and CCHOST publishes GSJ. Cold boot checks J/B only, reloads unchanged P
     and can run another combat whose CREATE overwrites the unconsumed result.

     First establish a discriminating runtime RED: stop after child result
     close and before host application, prove P=P0, result preimage=P0 and
     no J/B, then cold boot. Inspect the next combat's complete preimage;
     final HP alone may match a deterministic rerun and hide the lost update.
     Establish durable request/target binding before combat, then recognize
     and settle valid completed results before fresh ECL/combat. Keep `/S`
     journal recovery strict; do not infer permission from leftover magic or
     an unrelated effect/request.

     Acceptance: next combat starts from P1 after one HP-only completion;
     interruption at result-close/request/staging/pre-GSJ boundaries converges
     on relaunch; consumed completion does not reapply; malformed/incomplete
     result, mismatched preimage/target/binding and foreign profile preserve
     authoritative state and evidence under an explicit safe policy. Existing
     post-GSJ recovery, source-less cold loading, legacy profiles and retail
     read-only preservation remain green. Full encounter/save restoration and
     power-loss or arbitrary stale-copy authentication are outside this slice.
     Complete Luna runtime, build, both clean-source sweeps, corpus and
     commit/push. Source-only advisory is external at
     `C:\temp\GoldBox-task236-20261010\next-task-completed-secret-handoff.md`;
     verify its exact code links and runtime before implementing.

     Implementation update: runtime RED proves the next combat used P0 while
     deterministic final HP masked the loss. GSC1 now binds exact GBHR2 and
     complete preimage before child launch, published through closed GSD.
     CCHOST `/P` prepares; `/C` requires the same target/request and binds
     GSC to result/journal before mutation. Completed results settle before
     fresh startup; absent result restarts only with unchanged preimage;
     partial/unbound/mismatched completion fails closed without replacing P/R.
     Consumed completion cleanup compares the entire postimage. Existing `/S`
     stays journal-only, and legacy `/H` retains its contract. Standalone
     import refuses pending GSC. Real cold boot now gives the next combat
     exact P1, with no source files. Standing GLIB combat harness includes the
     stop-after-result/next-preimage regression, without adding roster entries.
     Compiled full-program tests cover each preparation/completion persistent
     operation interruption/error retry, mismatched authority and full-bank
     companions. Source/model/native focused coverage is 1,257 checks;
     all 16 targets build. Final required sweeps/corpus/commit/push remain.

     Closure: implementation `608fb96c` passes runtime RED/GREEN with exact
     next-combat preimage, all interruption/malformed/retry controls, standing
     owned route and 1,257 focused checks. Final gates pass 44/44 flows and
     46/46 components, source dirty/changed false; full corpus passes7,862
     /14 skipped /84 warnings, exit 0. No retail files changed. Actual flow
     runner exit 0 comes from the complete recheck after the first monitor
     lost its exit capture; corpus diagnostic truncation is recorded. Exact
     hashes, timings and evidence limitations are in the current handoff.

238. **CLOSED 2026-10-10: CCECL current-roster names/NPC ownership.**
     Implementation `2c301ae4` clears the contiguous 136-byte region before
     optional `/B` and bounds NPC lookup to eight rows. Scalar counts remain
     unchanged. Old sequential roster/no-roster pairs prove stale WHO names
     and marked NPC index lookup; the corrected image rejects that ownership
     while valid imported WHO/NPC and supported cold resume still work.
     Standing menu/NPC harnesses include immediate pairs. Fourteen compiled
     poison/bounds/index checks pass, as do all 16 builds, 44/44 flows,
     46/46 components and corpus 7,876 passed /14 skipped, actual exit 0.
     Both sweep artifacts bind clean unchanged source; no retail files changed.
     CCECL remains above its 64-byte floor with 84 free bytes. Exact hashes,
     timing, priority transitions and the corrected old-NPC manifest provenance
     are recorded in the current handoff and external task238 evidence.

239. **CLOSED 2026-10-10: prove and recover bound Secret post-combat ECL
     continuation.** Current cold completion settles owned HP before fresh
     ECL startup; uninterrupted combat resumes the paused effect instead.
     This is a bounded next task, not a defect in task237's HP-only claim.
     First preserve real paused GBEF/outcome/source identity, prove the supported
     cold `/R` route and compare exact post-combat PC/VM state against uninterrupted
     execution. Pair a synthetic before/after-combat marker fixture with real
     area16 evidence; legitimate subsequent combat must not be called replay.
     If confirmed, persist exactly bound continuation authority until its output
     is closed and validated. Prove interruption/retry and malformed/foreign-input
     handling without replay or overwriting pending inputs. Preserve task237
     exact-preimage HP recovery/missing-result restart and task238 ownership.
     Do not infer a schema from filenames or claim general saved-game restoration.
     Complete source/runtime proof, implementation, Luna verification, builds,
     both clean-source sweeps, corpus, commit/push, then select the next task.

     Prerequisite progress: real cold boot replays PC0492, while direct `/R`
     and independent uninterrupted execution match exact terminal PC04A5/VM
     bytes. Synthetic before/after markers corroborate the same boundary.
     Draft prepared/completed/active ownership and producer-receipt model
     passes 88 checks, with 149 combined host/party/model checks. Real and
     marker bundles round-trip, including u32 extents above one native bank.
     Prerequisite `dd2c8481` passes corpus 7,964 /14 skipped, actual exit 0.
     Native code is unchanged and replay remains unfixed. Complete v15/GBSL
     admission, native durable publication/activation and dispatch acknowledgements
     before claiming implementation or task closure. See the current handoff
     and `research/secret-continuation-authority.md` for exact evidence/limits.

     Closure: implementation `ff34c8f0` supplies CCNEXT and GBBOOT durable
     combat/menu/empty integration; `d35f970f` includes the runtime in the release
     manifest. Genuine cold and uninterrupted terminal PC04A5/VM/P1 match exactly,
     with unchanged combat artifacts and stable repeat boot. Marker, numeric,
     string (including cold closed-answer acknowledgement and direct reference),
     empty-kind2, constructed phase/backup and malformed/foreign controls pass.
     Real DOS directory-path and empty-victory-token defects were fixed and
     covered by compiled regressions. Standing Secret harness passes35.19s;
     643 focused checks and all17 builds pass. Final clean unchanged source
     sweeps pass 44/44 flows and46/46 components; corpus rerun passes8,458
     /14 skipped /84 warnings, exit 0. The initial corpus caught the release
     entry omission and is superseded. No retail files changed. Initial partial
     ownership acquisition fails closed; full save/title/power-loss claims remain
     outside the bounded contract. Exact evidence is in the current handoff.

240. **CLOSED 2026-10-10: preserve full-width automated numeric menu answers.**
     Task239 actual INPUT_NUMBER route `/! /C1234` stores D2 (210), explained by
     GBBOOT `.setmenu` masking BX with00FFh before `build_menu_tail` forwards
     word-sized seed_menu to CCMENU. CCMENU and CCECL cold GBMO resume already
     accept the full unsigned16 answer. This is a supported-route transport bug.

     First demonstrate old-binary values255/256/1234/65535 and compare terminal
     sparse memory with direct CCMENU/CCFLOW. Preserve both option orders and
     verify cold completed-answer/repeated-terminal recovery. Capture a separate
     full-word CCMENU automation answer before the mask; retain existing masked
     seed_menu for ordinary CCECL `/C`. GBPS has no menu-choice field, and GSK
     already freezes exact GBMO: no schema or constrained CCECL change needed.
     Preserve `/L` headless input, ordinary bounded menus and overloaded `/C`
     command tapes. Complete Luna actual RED/GREEN, focused tests/build, both
     clean-source sweeps, corpus, commits/push and next-task selection.
     Read-only advisory: `C:\temp\GoldBox-task239-20261010\next-task240-review.md`;
     verify its claims against source/runtime before implementing. No task240
     production code is changed at selection.

     Closure: `271e8a9c` stores separate full-word menu_answer, retains byte
     seed_menu and checks numeric /C domain before startup writes. All39
     compiled parser/consumer controls pass. Luna's24-case old/new matrix and
     mutually exclusive1234 branch prove the repaired value; invalid inputs
     preserve owned files. Closed1234 cold/C0/repeat and seven-width standing
     coverage pass; affected GBBOOT engine smoke passes248 results, exit 0.
     All 17 targets build, GBBOOT has4,016 free bytes. Final clean unchanged
     source sweeps pass 44/44 flows and46/46 components; corpus8,497 passed
     /14 skipped /84 warnings, actual exit 0. No retail files changed. The
     separate preexisting post-combat CLI context omission is selected next.

241. **VERIFIED 2026-10-10: preserve full continuation invocation context.**
     Historical selection and acceptance contract:
     Both archived pre240 and current Secret physical-combat→INPUT_NUMBER
     `/L1234 /C0` routes reach PC0048 with0/wrong marker0103=3333. Direct ECL
     entry uses1234/correct0102=2222; its no-map/scripted-terminal host gate20
     is separately recorded and is not a successful whole boot. Source confirms
     CCNEXT omits /Z,/L,/C,/Y,/O,/W, which are absent from GBPS and not restored
     by v9 GBRS. Full-word host menu_answer is a distinct seventh value.

     Define a versioned typed context with presence and normalized effective
     values, capture before PREPARED, preserve through every combat/menu/empty/
     next-encounter phase, bind exact bytes in receipts and parent comparisons,
     rebuild isolated producer arguments and return host context in READY.
     Declare changed-cold-context and old-GSK compatibility policies honestly;
     old authority cannot authenticate omitted historical values. Preserve
     malformed/foreign/legacy evidence before any HP or successor mutation.

     Acceptance must cover each supported scalar, zero versus absence, all
     maxima/combined options, source/CLI identity, branch and complete VM/P1
     equality against independent direct/uninterrupted reference, cold startup
     without repeating options, repeat/interruption recovery and unchanged
     combat artifacts. Prove the CCFLOW capacity-replay command-tail limit with
     all fields; use admitted short workspace source copies/aliases if needed,
     without losing exact authoritative source binding. Do not spend CCECL's
     84-byte reserve casually. Keep byte /C, /! input semantics and explicit
     Secret WHO/strength fidelity limits; rejecting nonzero fields or asking
     callers to repeat lost arguments does not repair the defect. Finish Luna
     tests, build, clean-source sweeps, corpus, commits/push and next selection.
     Evidence/advisory: `C:\temp\GoldBox-task240-20261010\legacy-L-old-routes`
     and `continuation-cli-context-review.md`; revalidate before implementation.


     Closure: implementation `8172581b` freezes the supported values and
     presence in GSK2/GBCX1, binds context in receipts and READY, restores
     absent fields and saved mode despite conflicting cold CLI, and uses an
     exact admitted SRC.GLB alias within the 113-byte producer budget. The
     835 focused checks, all 17 builds and standing context/cold/conflict/repeat
     and headless capacity proofs pass. Final 44/44 flows, 46/46 components and corpus 8,650 passed / 14 skipped / 84 warnings, actual exit 0 pass. Both serial suites bind
     clean unchanged canonical source `ef26e1d0b984c6946b4fdc09b732bee0a7341c9cfa2321acb51c6fe3a948aba1`; no retail files changed,
     only DOSBOX directory timestamps. Legacy/future schemas and complete
     broken receipts retain evidence; no inferred migration, new Secret WHO,
     original strength fidelity, world-save or power-loss claim.

242. **VERIFIED 2026-10-10: CCFP sidecar automated answers without keys.**
     Historical selection and pre-gate progress follow; closure is below.
     Repair the demonstrated mode-specific /S mismatch: GBBOOT sends a frozen
     full-word answer but CCFP treats it as a snapshot filename and still waits
     through narration and prompt input. Actual bounded no-key RED remained
     live after 10 seconds at Normal priority with valid pending EFX/GBSL and
     no GBMO/guest return; the owned observation was stopped. This is distinct
     from successful task241 headless 72-event capacity transport.

     Admit complete EFX/GBSL and final identity before using checked u16
     automation. Preserve ordered narration/rendering, skip only accepted
     automated waits, and use the existing bound outcome writer. Cover numeric
     0/1234/65535, yes/no 0/1 with rejection of 2, and ACK selected=1/count=1;
     preserve malformed/mismatched existing outputs, manual interaction and
     ordinary snapshot names including numeric-looking names. Prove actual
     no-key direct/GBBOOT and cold saved-context behavior against an independent
     bound-response reference, then build/gate/commit/push and select next work.
     Advisory/evidence: `C:\temp\GoldBox-task241-20261010\next-task242-review.md`
     and `task242-no-key-red`; verify current source before implementing.

     Progress: CCFP mode-aware /S, no-key ordered narration, complete terminal
     stream binding and sticky I/O rejection are implemented. V1 text paging
     now preserves video ES and uses DS. All 17 builds and 61 compiled checks
     pass; direct numeric 0/1234/65535 tokens match independent bound-response
     references and terminal resumes. Nine standing no-key/rejection cases are
     added with AST parse passing. Final Luna standing, boot/cold/conflict,
     party/ACK and complete all-context reference checks pass. Implementation
     `b17225de` is local; serial gates and closure/push remain. CCFP retains
     5,749 free bytes after final rebuild; prior task 241 sweeps do not verify this changed source.


Task 242 is verified at `b17225de` (runtime record `d4c52eab`). CCFP's
two-path pending mode interprets /S as checked unsigned 16-bit automation, renders
ordered narration without keys, and publishes the bound response only after
full stream/terminal admission. Sticky read faults reject before output. V1
text paging preserves video ES and uses DS; write/close failures remain failures.
Ordinary snapshot filenames and manual input retain their behavior. Automated
/S plus diagnostic /Z rejects cyclic slot navigation; ordinary /Z remains.

All 17 engine builds, 61 compiled checks, both standing harnesses and real DAX
ACK regression pass. Actual numeric 0/1234/65535, PARTY Yes/No branch markers,
canonical ACK 1/1, manual GameLink and numeric snapshot controls pass. Cold runs without /C and with conflicting /C1, plus repeats, preserve the
saved 65535 and match the complete all-context independent reference. Roster, result, seed and combat trace/frame stay unchanged.
Final gates pass: 44/44 flows, 46/46 components and 8,711 corpus tests with
14 skips and exit 0. The corpus reports 84 warnings in 588.23 seconds.
Both native suites bind clean unchanged source to canonical SHA256
`f2001e4d71d74184c73c37b744f1ad93db689fd07fa2963818a50af05118b154`; no retail files changed, only DOSBOX directory timestamps.
CCFP emits 22,877 bytes, uses 59,531 resident bytes and has 5,749 free.
CCECL is unchanged at 84 free.
No crash-atomic response publication, saved-game restoration, new WHO or
original party-strength fidelity is claimed. Evidence remains external at
`C:\temp\GoldBox-task242-20261010`.

243. **SELECTED 2026-10-10: source-owned Secret opcode 1Dh contract.**

     Source prerequisite: original DOS oracle and independent arithmetic/cache
     model pass114 focused checks, including six loaded heroes, HP mutation,
     complete parser/store and view flags. Archived native code gives a permanent
     missing-store/flag-clobber RED. Actual Amiga area16/3 also expose LOAD_FILES3
     parsed as2 with premature EXIT. Resolve explicit title/storage dialect and
     old GSK2/GBRS revision before native integration. Prerequisite `a6dc8d49`
     passes full corpus8,825/14 skips, actual exit 0 (collection8,839). Native source
     and its source-bound44/46 sweeps are unchanged. No native fix or task243 closure is
     claimed. See the authored source contract and current handoff.

Task 243 is selected: prove and implement Secret's title-specific opcode 1Dh
contract from original instructions and held DOS/Amiga framing. Original Secret
dispatch at GAME.OVR:0x458B maps 1Dh to handler 0x1F87 in descriptor 3. It
fetches one
operand, walks the party chain at DS:7D3C, calls the helper at 0x3CBB6 and resolves
and writes through the operand helpers 0x9727/0x9F3A. The current native CLI
comparison is not proof of that contract. The exact original source hash and
resolved fixup targets are in external `next-task243-source-lead.md` and its
disassembly JSON; this is a source lead, not a runtime or formula verdict.

First execute the complete original handler with declared parser, actor-list
and memory state; prove operand/PC, destination, script flags and dependency
effects. Inspect actual Amiga 1Dh sites before transferring DOS one-operand
behavior to the existing Gen2-style route. Vary source-proven inputs only;
do not infer HP or participation semantics from the opcode name. Then port the
proven title contract, with an explicit policy separating live party-derived
state from frozen /Z diagnostic intent. Preserve other titles, source ownership
and CCECL's reserve. Verify original/native differentials, real route and cold
continuation, then complete required gates/commits/push and select the next task.
The continuous native DOS objective remains active.

Task 243 native implementation/runtime checkpoint — 2026-10-10: explicit
Secret-long GLIB frames, original1Dh destination/flags, read-only current-P1
queries and GSK3/GBNR3/GBRS semantic compatibility are implemented. Integrated
standing flow exits0 in69s, with actual74→62 metrics matching the original
oracle, cold/reference equality and repeat no replay. All 17 builds retain
required reserves; CCECL75 free, GBBOOT2,918 free. Final clean44/46 gates, corpus
and push remain pending. See current HANDOFF; task243 remains active.

Task 243 final closure — 2026-10-10: implementation3cc0782c and audit/gate record
a585ba15 pass all17 builds, actual74→62 live metric/original-oracle and cold/repeat
controls, final clean44/44 flows,46/46 components and9,039 corpus tests /14 skips
/84 warnings, exit 0 in 710.44s. Source canonical SHA256
0869798ddcb1a4dccdc8ad54eb9a5f5e8b9b16f39ccb15f57541d5617a0a8b45.
No retail file writes; only DOSBOX directory timestamps. CCECL75 free remains
above64 floor. Task 244 selects original Secret WHO prompt/actor selection, still
unsupported natively;15 parsed GLIB sites and original dispatcher3DEC caller
are leads, not semantic proof. See current HANDOFF; continuous goal active.

Task244 integration checkpoint — 2026-10-10: complete original DOS WHO caller,
selector, parser and renderer prove Enter/current/null preservation, Up/8 and
Down/2 wrap navigation and Escape waiting. All15 held prompt operands execute
original and compiled-native paths. Typed CPPARTY `/W` names and GBEF16 nullable
identity are implemented; CCECL retains550 free bytes with unchanged14500-byte
DAX acceptance. Luna's foundation real-asset leaf pass verifies ordered names,
unchanged P1, malformed preservation and long-frame areas16/3. Frontend/host
integration, full actual/manual/cold/repeat validation and clean final gates
remain pending. Baseline203c6e95 is pushed; current work remains uncommitted.
Task244 and the continuous native objective remain active. See current HANDOFF
and `docs/engine/research/secret-who-contract.md`.


Task244 implementation checkpoint — 2026-10-11: all17 builds pass at raw source
SHA00864a330c6ce81194f54849fa0155fcd2fb9023c25f085867bff4d8c2cd7e1e;
CCECL550 free, GBBOOT711 free above required floors. WHO/combat cold/reference
and repeat match13 artifacts. Genuine INITIAL no-answer/null and first-current
cold prompts render after a bounded frame wait without creating an answer.
The confirmed Secret capacity dispatch failure is repaired by strict read-only
CCNEXT `/D`, preserving generic CCHOST rejection and unsupported mutation guards.
66 new focused checks and510 integrated checks pass; corpus collects9,667.
Implementation is frozen for commit. Actual repaired maximum-context runtime
and final clean44/46/corpus gates remain pending; task244 is not closed.


The initial final-flow run exposed a CoK icon regression from AX clobber in the
same-drive path predicate. AX is now preserved without weakening the drive
check or tail limit. Twelve compiled boundary controls plus existing transport
and cold-bind checks pass77 tests; all17 tools build at source
`d5ae030ce2d7dba82c9c24ca782a8f9446442a37940f148fbf938dc20c4e2c97`.
GBBOOT64,315 emitted/64,571 resident/709 free remains above128. Capacity guards
pass13; collection is9,679. The interrupted failed sweep is preserved; clean
44/46/corpus gates remain pending against the repair commit.


Task244 WHO profile release repair — 2026-10-11: clean44-flow sweep at5160f641
passed, but components recorded45/46 with a genuine title/container boundary
failure. Explicit `/ID4` on HLIB entered generic WHO and accepted a foreign v15
pending record. CCECL now rejects that resume before opening the answer token;
fresh execution preserves unsupported-opcode status4 diagnostic behavior.
Real Secret GLIB v16 WHO and genuine non-WHO legacy compatibility pass. Seven
new public-parser/profile controls and existing/captured checks pass150 tests.
All17 tools rebuild at raw source0fb2a7d99cebdeb7d706512260436978537ae9acf34f3ee0de1bd6780214a6d1;
CCECL24,393 emitted/64,750 resident/530 free remains above64. Collection9,686.
The failed component result is retained; final44/46/corpus gates must be measured
against this repair commit. Task244 remains open.


Task244 final closure — 2026-10-11: native implementation6f37cc08 and repairs
5160f641/5010ffb4 pass all17 builds, actual WHO/combat cold/reference/repeat,
INITIAL valid/foreign answer controls, verified maximum-context and70-PRINT
streams. Final clean44/44 flows and46/46 components bind unchanged5010ffb4
source to canonicalSHA256a617748872f6d9d0727064324743a05c7b28c68f49bc6ee8c1839b2d10d3b599.
Corpus9,672 passed /14 skipped /84 warnings, exit0 in964.79s (9,686 collected).
No retail files changed; only DOSBOX directory timestamps. CCECL530 free and
GBBOOT709 free remain above their64/128 floors. Task244 is closed.

Task245 is selected: source-owned selected-actor field reads after WHO.
Original public getterA0F1 (descriptor9/procedure107E), called at1B61, dispatches
bank1 to9830. Static7C15/18/19 reads actor bytes19/25/27;7C72/73 sign-extend107/108;
7C76 reads112. Native `mem_get` currently returns sparse defaults for these
selectors. Execute complete original caller/null behavior and actor provenance,
correlate a held instruction site and capture a native branch RED before porting.
Then bind a bounded read-only current-P1 capability to physical actor identity,
refresh after settlement, preserve frozen context/cold compatibility and other
titles, and complete required builds/gates/commits/push. This remains a source
lead, not proven labels, arbitrary saved-party support or Amiga execution.
The continuous native DOS objective remains active.

Task247 verified release — 2026-10-12: the selected getter work above is
closed by tasks245/246; see current HANDOFF and the WHO/trap-read contracts.
Implementation `8c875742` now matches complete original Secret RANDOM callers
on the explicit GLIB route, with closed GBRS12/13 semantics and early answer
rejection. Original/model401 and the broader2,872 focused checks pass. Luna's
old/new RNG, owned cold/reference/repeat,70-PRINT replay and compatibility
controls pass; root's strict aggregate passes62/62. Correction `780304cf`
updates the stale standing RNG golden while retaining an exact three-field
reconstruction of its historical full hash and every no-replay/P1 assertion.
Clean source-bound gates pass44/44 flows and46/46 components at canonical
SHA256 `aca359e7e23704650a1a546de203ced39151bce165e038c36206e1512067d176`;
full boot engine-smoke passes. CCECL68/GBBOOT489 free preserve64/128 floors
and14500/16000 input limits. Corpus passes11,182 /1 skip /84 warnings in700.19s,
exit0 (11,183 collected); final all26 COM hashes match Luna's frozen set.
Astra's task248 proposal is the explicit dual-source SecretAmiga
launcher and owned-session Resume, requiring actual ordinary fresh entry and
strict `/5` recovery proof before implementation. It starts after247 push.

Task248 release gates verified — 2026-10-12: explicit dual-source SecretAmiga
and existing-only Resume pass actual public fresh/live/cold/strict/reopen and
all six preserved negative cases. RUNGB.BAT repairs DOS8.3 public launch.
INITIAL kind3 foreign-P1 OLD RED is repaired by existing exact roster/no-tx
matching before answer access/READY, with746 compiled checks and actual14/14
artifact preservation. Only CCNEXT changes7 bytes, retaining34156 free; other25
COMs match. CCECL68/GBBOOT489 retain64/128 floors and14500/16000 caps.
Implementation `a17fa3f5`, measured at `dacef80a`, passes clean44/44 flows,
46/46 components and complete boot248 RESULT controls. Canonical source SHA256
`73e0076a8702f5abb0093dd86dfccb5aefd7f9fdbd65987ebb089b545ff6dbfd` is unchanged across both
sweeps. Zero retail files changed; known DOSBOX directory timestamps are recorded.
Corpus11,362 /1 skip /84 warnings passes in717.95s, exit0 (11,363 collected).
Final26 hashes, all app gates, Rust89 and fresh EGA539 pass. Task249 selects full
Secret opening narration: original PRINT/parser/renderer execution and public
OLD RED precede native edits; preserve Secret-only DREF/GBSLv2 and old-session
compatibility, all caps and the64-byte CCECL floor. See current HANDOFF and
`C:\temp\GoldBox-task249-plan-secret-full-narration-20261012.md`.

Task249 release verified — 2026-10-12:
original37 proof, final focus2074 plus patch-context5, root independent357 and
all26 builds pass. Raw native SHA256 is
`8ee8652e83b34cb51dcafba8324877dbfd27e976c17618c3bad5c88fccdc3ab9`;
CCECL24855/65216/64 and GBBOOT64575/64831/449 preserve floors64/128 and all caps.
Secret-only GBPX codec2 retains exact append/skip-zero/clamp255 while old
extension1/DAX/no-referencev1 policies and owned-session formats remain unchanged.

Actual ordinary public narration155/119/52, authored255/70, cold5/repeat and
old INITIAL/ACTIVE compatibility pass. Live/cold/repeat POST is69/72 exact,
with only config/batch and named GBRES.DOP generation3 to4 at u64 offset8 varying.
Real old INITIAL answer creates a full119 codec2 successor and exact semantic
reopen. Four actual native public negatives preserve67 session/43runtime files,
adding only LAUNCH.BAD with no exclusions. Pinned GameLink mode-release and
native caption ES repairs are verified; installed/default emulator unchanged.
Clean unchanged implementation `c1d6a7f9` passes44/44 flows,46/46 scripts and
full boot248 markers/0 failures. Canonical native SHA256 is
`f44eb44e35c0fca81627099da600958a157d06b657f0ec8659e33087addf5b62`.
Corpus11,711 /1 skip /84 warnings passes in738.51s, exit0;11,712 are collected.
Retail file writes are zero, with only recorded DQK/DoK DOSBOX directory touches.
Engine3061 /3 skips, four typecheck/build commands, web189/intros10/author8/
Electron9 and fresh Rust/C96 units/14 commands pass, including8851/31 legacy,
all49/main fresh comparisons, EGA539 and OPL60. Source/artifact/retail pins remain
unchanged. Evidence is `C:/temp/GoldBox-task249-20261012/release-gates`.
Release `3e1158cdf3bfee73e3bcd925322d7f10874a6d66` is verified against local and
SSH remote HEAD with a clean release tree; final all26 freshness checks pass.
The receipt is `release-gates/release-head-verification.json`. See HANDOFF and
`research/secret-print-contract.md`; no completed-campaign or physical IRQ/PCM
claim follows from these bounded gates. Continuous discovery remains active;
Astra is planning task250, which is not yet selected.
