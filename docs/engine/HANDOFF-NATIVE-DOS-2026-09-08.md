# Native DOS Greybox handoff — 2026-09-08

## Current continuation — 2026-09-26

The active queue is owned DESTROY_ITEMS callback coverage, currently blocked on
effect 7's trusted output producer. Source-only tracing resolves the production
mode-4 attack route (`0167AF -> 0162E3 -> 014F24 -> DB:34 -> GAME.OVR:0x34527`)
and its effect-7 callback at `GAME.OVR:0x10DF0`. The synthetic lifecycle oracle
now attributes the callback's direct body `+0x18C` stores by instruction
address; `tools/test_cok_effect7_context.py` exits 0 with 339 cases, including
the four applied/unapplied write-provenance controls. Its log also contains
repeated Windows `fatal exception: access violation` diagnostics from Unicorn's
`mem_map` call; this pass is not a clean Unicorn runtime report. The four
write-provenance cases separately pass in 0.94s. Final documentation gate
results: `python -m pytest tools/test_native_readme_subject.py
tools/test_docs_claims.py -q` passed 57 tests in 69.48s after the continuation
edits (`build/effect7-doc-gates-final.log`).

The current GBMR v3 GBOC path has no trusted producer: `CCINV B` copies the
record from an external GBMB v3 manifest, `M` routes it by its declared owner,
and `C` checks request/candidate byte identity. Native output validation folds
the record's supplied draw count and applies its supplied damage, so the pinned
65,535-draw/255-damage forged record is accepted at that exposed interface.
The ordinary GBBOOT `inventory_run` call sites do not invoke B/M/C and do not
currently produce effect-7 outputs. Next implement output derivation at the
original callback execution boundary and carry that trusted result through the
staged transaction; do not widen normal activation first. No DOSBox/UI was
launched; the setup probe added below was headless Unicorn.

The setup-provenance probe's first `DS:6DA2` boundary is now closed for fresh
startup state: raw START load offset `0x013B` calls the `0x61:0x25` initializer,
which clears `[0x6DA2,0x6DE4)` through the resident `REP STOSB` helper. The
probe models this source-proven write before entering at `0xAEC9`. It then
stops at `0x3BC45` reading `SS:[DI+0x1E]` with the fixture's synthetic
`SS=0x6000`; reconcile this segment-sensitive access against the retail
startup state before treating it as a production input. Details and exact
anchors are in `research/cok-item-removal-native-plan.md`.

The Unicorn software-interrupt hook had independently reversed the `INT` frame
(`FLAGS,CS,IP` instead of `IP,CS,FLAGS`), sending execution into prompt bytes.
`tools/unicorn_cok_midi.py` now writes the IRET frame correctly, clears IF/TF
during handler execution, and has a real Unicorn `INT 3F`/`IRET` regression.
A 60-million-instruction composed EXEPACK startup pass with all 621 relocations
reads all four TITLE.DAX compressed blocks, reaches BIGPIC2 VGA rendering, then
opens DUNGCOM/RANDCOM and loads more GAME.OVR chunks into segments `3255`,
`3640`, and `37F7`. The `INT 3F` return at `10E6:0045` is the composed START
stub at image offset `0xEA3`, carrying procedure offset `0x0D20`. The ensuing
descriptor-24 read begins at GAME.OVR `0x365A6`, and execution at `37F7:0D20`
maps to source offset `0x372C6` (a disassembled procedure prologue). The
descriptor's stub-array scan is ambiguous and no runtime relocation snapshot
was captured. The cap `127F:29B8` maps to resident START image offset `0x51A8`,
inside a byte-merge loop whose optional-copy flag comes from argument bit
`0x04`; the cap log lacks the live register/argument values. Only the first
synthetic key (`AX=0x0002`) was consumed, with no later INT 16h read in the log.
This trace reaches neither `GAME.OVR:0xAEC9` nor its production state. It closes
the harness frame defect and the bounded overlay-provenance subtask, not the
trusted-producer item. Next capture cap state and the title renderer's actual
destination before continuing toward the production inputs. No DOSBox or GUI
was launched for these composed runs. Full details and limits are in
`research/cok-item-removal-native-plan.md`.

**Gate status from the same continuation.** `pnpm test:corpus` completed with
5,688 passed, 1 skipped, and 6 failed (589.46s). Failures were
`test_cok_native_host::test_gbboot_mutation_and_cold_checkpoint` (missing
`QUERY1.EFX` fixture), `test_cok_native_yield::test_checked_inventory_yield_under_dosbox`
(yield record mismatch), `test_engine_export_consumers::test_unconsumed_exports_pinned_exactly`
(three new saved-character exports), `test_export_audits_agree::BarrelSurface.test_barrel_surfaces_reconcile_exactly`
(1655 vs 1662 export consumers), `test_native_ccecl_effects::test_ccecl_effects_smoke_under_dosbox`
(missing `OP=09 MEM[0310]=00C1` trace), and
`test_native_flow_status::LiveGateTests.test_artifact_is_fresh_against_native_src`
(native source hash changed since the measured flow artifact). This aggregate
gate invoked DOSBox-backed tests despite the focus concern; do not repeat those
runtime tests without an isolated, verified focusless route. These failures are
not explained by the IRET patch. The focused IRET test and the documentation
gates passed; the full corpus remains red.

## Start here

The deliverable is one new, clean-room **DOS Greybox engine** supporting the
Gold Box titles from the user's assets, with per-platform art selection.
CoK is the current implementation lead. Browser work is secondary. Retargeting
CoK onto SSI's DQK executable is parked and is not the deliverable.

Read [CLAUDE.md](../../CLAUDE.md), [GOAL.md](../../GOAL.md), and the native section
of [BUILD-QUEUE.md](BUILD-QUEUE.md). This dated handoff summarizes the release
at **`f24c9e8ad4a351f2c8632a89ab5b862f542e47a2`**, pushed and verified on
`origin/greybox`. Check current Git state before resuming; this is a dated
snapshot, not a claim that the branch will remain at that revision.

## What is implemented

CoK's bounded DOS camp/rest path includes PreCampCheck, healing and encounter
interruption, cold checkpoints, effect ownership/timers, memorization and its
menu, lunar advancement, scroll scribing, complete owned inventories, and
FIND_ITEM. See [the queue](BUILD-QUEUE.md) for individual commits and
[native/README.md](../../native/README.md) for runtime contracts.

The owned-item mutation path now runs through the actual GBBOOT host:
construct packet, stage mutation, validate continuation, activate, resume.
`84e5156` includes consecutive removals, post-combat continuation, cold saves,
and publication-failure controls. Unsupported applied callbacks still reject;
general DESTROY_ITEMS coverage is unfinished.

The latest release fixes CoK RNG continuity across combat:

| Commit | Change |
| --- | --- |
| `a42459b` | CCCOMBAT `/J` reads the full paused CoK RNG, returns GBCR v2, and GBBOOT publishes it before CCECL resume; fixes checkpoint selection of the older VM during GEO fallback. |
| `85fea48` | Updates exact equipped-attack trace expectations for the corrected RNG; the separate party test retains successful weapon-damage checks. |
| `a202bb1` | Pads allocation probes to the actual DOS image ceiling instead of adding a fixed 512 bytes. |
| `f24c9e8` | Records the final verification and runtime contracts. |

GBCR v2 retains the 16-byte header and six-byte party rows; bytes 12..15 carry
the final RNG. CoK's host requires the exact length, version, matching roster
count, valid outcome, ordered ordinals and valid conditions. Legacy standalone
combat retains GBCR v1 and its previous RNG. The child validates the 130-byte
GBEF prefix it consumes, not the complete VM envelope. Roster and RNG writes
are not a combined crash-atomic transaction.

The cold-save fix matters independently: an older effect file may provide map
identity, but the saved checkpoint must retain the resumed script's memory,
PC and RNG. The fixture compares the complete 5750-byte VM after legitimate
camp-hook and position-register changes.

## Verified release baseline

| Check | Result / evidence |
| --- | --- |
| Full native engine build | Passed; resident GBBOOT 64803, CCCOMBAT 63880, CCECL 64167 bytes. |
| Final clean-source flow sweep | 19 PASS /8 known FAIL /0 SKIP /27; finished 2026-09-08T17:11:03Z. All `(name,status,needle)` tuples match the preceding `84e5156` artifact. |
| Combat RNG plus existing mutation-host tests | 2 passed in 12.72s; five full-width seeds, nine child rejections, nine host rejections, legacy control, combat/script/camp/cold resume. |
| Focused gameplay | Playable CoK, full creation/camp, persistent dialogue/combat, CCPARTY equipment and legacy combat smoke passed. |
| Allocation probes | 4 passed in 1.96s, including old-arithmetic overflow control. |
| Final armed corpus | 5178 passed /2 inherited failed /1 skipped of 5181 in 510.36s. |
| Final release documentation checks | 56 passed in 72.07s. |

[native/flow-status.json](../../native/flow-status.json) is the tracked flow
evidence. Local ignored logs are `build/native-combat-rng-build.log`,
`build/native-combat-rng-flow-final.log`, `build/native-combat-rng-corpus-final.log`,
and `build/native-combat-rng-docs.log`. These logs may be absent in a fresh clone.
The sweep observed no retail file changes. Only the known retail DOSBox
directory mtime moved; that is distinct from a game-data write.

The eight failing flows remain `gbdqk-intro-flow`, `ccecl-dqk-vmrun`,
`ccecl-dqk-combat`, `ccecl-dok-combat-gap`, `ccecl-dok-thief-matrix`,
`gbdqk-combat-flow`, `gbcoab-flow`, and `gbdqk-flow` (each a native test script).
Use the artifact's exact messages when investigating. In particular, the DQK
combat route does not establish party victory; do not force its outcome to
satisfy an old assertion.

The corpus failures are the inherited browser audits
`test_engine_export_consumers::test_unconsumed_exports_pinned_exactly`
(757 vs 754) and
`test_export_audits_agree::BarrelSurface::test_barrel_surfaces_reconcile_exactly`
(1655 vs 1662). The first corpus run also found two oversized allocation
fixtures; those were fixed and are absent from the final failure list.

## Recommended next tasks, in order

1. **DONE 2026-09-08 (continuation) — resolve effect-7 target context and
   output ownership, including the caller/consumer address.**
   `tools/test_cok_effect7_target_provenance.py` (21 tests, passes in 0.75s)
   executes original `14F24h` directly and answers both halves of the
   acceptance criterion with dynamic, mutation-tested evidence, not a
   synthetic clear-map result alone. **Supplier:** `14F24h`'s own second
   far-pointer stack argument (`[bp+0xc]`, forwarded unchanged through
   `db:34` file `034527h` -> `0342FDh` -> `E6:A2` file `0389EDh`) is the sole
   determinant of whether effect 7's replacement RNG draw fires, confirmed by
   sweeping the synthetic combat context's target field and the `DS:609A`
   "active character" global across every combination that disagrees with it
   (14 cases; outcome never changed) and by confirming the effect record's own
   applied byte does not gate this path either (only its id byte does, unlike
   the item-removal callback). **Consumer, previously open, now located and
   dynamically confirmed:** `14F24h` writes the scaled damage to `DS:56B30`
   but never writes the HP field itself; its caller/consumer chain is
   `0167AFh` -> `0162E3h` (calls `14F24h` at `0165F7h`) -> `0150A8h` (a shared
   "compose combat message" dispatcher, called at `016621h` with `DS:56B30`
   pushed twice) -> `E6:0xA7` = file `038A7Dh` (overlay `0xE6`, procedure
   index 27), which reads `es:[di+0x197]`, computes `clamp(hp-damage, 0)`,
   sets a death-transition status byte at `es:[di+0x188]` and clears the
   active flag at `es:[di+0x189]` on lethal damage, then writes the clamped
   byte back to `es:[di+0x197]`. `tools/test_cok_effect7_damage_consumer.py`
   (9 tests, new this continuation) confirms every link dynamically: direct
   boundary sweeps of `E6:0xA7` (partial/exact-lethal/overkill-boundary/
   zero-damage, including the 9-vs-10 overkill status threshold as a
   deliberate null), the `0150A8` -> `E6:0xA7` forwarding path, the full
   `14F24h` -> `E6:0xA7` supplier-to-consumer loop for both firing states and
   both physical slot orientations, and a mutation control (corrupting the
   HP-write instruction's displacement byte) proving the pin can and does
   fail, then reverting to green. See the dated continuation section in
   [cok-item-removal-native-plan.md](research/cok-item-removal-native-plan.md)
   for full disassembly citations, both mutation-test rounds (the original
   pointer-order/wrong-field-HP mutations from the first pass, plus this
   continuation's write-displacement mutation), and two disclosed-but-
   unidentified side-paths (target-struct offset 396, and overlay `0xDB`'s
   unrelated hard-coded HP-zero write at file `0340F2h`). Full `tools/` suite
   with `GB_NATIVE_FLOW_GATE=1`: 5231 passed / 2 known pre-existing inherited
   browser-audit failures / 1 skipped of 5234 (same two failures as the
   release baseline above, unchanged counts: 757 vs 754 unconsumed exports,
   1655 vs 1662 barrel surface). No native (`.asm`) source changed; this
   remains oracle-level standing evidence. **This closes task 1's own open
   item.** Turning it into owned DESTROY_ITEMS support remains task 2's work
   below. Deriving a DAMAGE-queue-append contract — which task 1 left open,
   having found none on this dynamic slice alone — was independently
   resolved 2026-09-09 by a dedicated static+dynamic sweep of the caller glue
   between `14F24h` and `0150A8h`: confirmed no queue exists; `E6:0xA7`
   writes HP directly. See task 2's entry below for the evidence.
2. **DESIGN LANDED 2026-09-08; NARROW NATIVE AUTHORIZATION LANDED (SCOPED)
   2026-09-09 — staged callback output ownership.** As of 2026-09-09,
   "no native (.asm) source changed" below is no longer true in full — see
   the dated block further down for exactly what changed and what is still
   deferred; do not read the paragraphs immediately following this one as
   still describing the current state without that update.
   `docs/engine/research/cok-mutation-output-ownership.md` defines a versioned
   40-byte `GBOC` output record (RNG draws/before/after, target ordinal, damage,
   a DAMAGE-queue slot descriptor, self-CRC) plus its enforcement rules, and
   `tools/cok_mutation_output.py` implements pack/validate/apply as a Python
   reference model. `tools/test_cok_mutation_output_ownership.py` (23 tests)
   proves: malformed records (bad magic/version/length/checksum, nonzero
   reserved bytes, stale RNG-before, wrong RNG-fold arithmetic, out-of-range
   target, output fields set without the write flag) are rejected before any
   state changes; a well-formed record for effect 7 (id 7) with *arithmetically
   correct* RNG values is still rejected, against the real unpatched module, not
   a mock; `apply()` only ever replaces the paused RNG field, at the same GBEF
   offset (126) every other GBEF fixture in this repo already uses, and a
   serialize/reload round trip preserves it (modeling cold-checkpoint survival,
   since a checkpoint already stores the whole GBEF blob byte-for-byte per
   `a42459b`). Two of these checks were mutation-tested in-session (the
   authorization check and the RNG-fold check were each independently removed,
   confirmed to flip exactly one targeted test red, then reverted and
   reconfirmed green at 23/23).
   **What is NOT done:** no native (.asm) source changed; GBBOOT, CCINV and
   CCECL behave exactly as before; `AUTHORIZED_OUTPUT_CALLBACKS` is empty, so
   no callback (including effect 7) can produce RNG/damage output through any
   real pipeline; damage is deliberately never written to a GBPR HP byte by
   this design. **Updated 2026-09-08 (continuation):** task 1's caller/consumer
   gap that originally justified this is now closed (item 1 above) — the HP
   write's arithmetic is known exactly (`clamp(hp-damage, 0)` plus a
   status/active transition, at `E6:0xA7`, file `038A7Dh`) — but GBOC still
   does not write HP, because that routine has no DAMAGE-queue interaction
   this project has located to reuse or extend; inventing a queue-append rule
   without disassembly evidence for one would still be a fabricated claim, so
   GBOC continues to carry damage provenance only, not an application rule.
   The design doc's "What remains before this is native" section lists the
   remaining ordered prerequisites (extend `cokyield.inc`/`cokrequest.inc` for
   a GBMR v3 branch after re-measuring the resident-byte budget, add native
   RNG-fold/CRC assembly and a DOS driver, then authorize a first callback only
   after independent dynamic verification of its consumer). The effect-7
   rejection is unchanged and unweakened by this work.

   **QUEUE-VS-DIRECT QUESTION RESOLVED 2026-09-09.** The exact open item quoted
   above — "GBOC still does not write HP, because that routine has no
   DAMAGE-queue interaction this project has located to reuse or extend" —
   has now been checked deliberately, both statically and dynamically, rather
   than left as an absence of evidence. **Answer: confirmed no queue on the
   original-binary side; `E6:0xA7`'s direct `clamp(hp-damage,0)` write is the
   only mechanism.** The complete 42-byte instruction span between `14F24h`
   returning and the `0150A8h` call being reached (file `0165FAh`-`016624h`)
   is pinned and exhaustively accounted for by instruction length: one `les`,
   one flag compare/skip, eight pushes — two of which are `mov al,[0x6b30]`
   (the exact `DS:56B30` scalar `14F24h` just wrote) immediately followed by
   `push ax` — and zero write instructions, zero extra calls, zero loops.
   Dynamically, running the real `0150A8h -> E6:0xA7` chain three times in a
   row touches the byte-for-byte identical set of ~4967 addresses every time
   while HP keeps decreasing cumulatively (no advancing/growing state, though
   a real repeated effect), and restricting that trace to each participant's
   own struct shows the only byte ever written is the documented HP field. A
   falsifiability control (1-digit vs. 2-digit damage value) shows the write-set
   equality check is not vacuous. New standing evidence:
   `tools/test_cok_effect7_damage_queue.py` (6 tests, `python -m pytest
   tools/test_cok_effect7_damage_queue.py -q` -> `6 passed`; combined with the
   two existing effect-7 files, `36 passed`, no regression). Full disassembly
   citations and the dated write-up: `cok-item-removal-native-plan.md`'s
   "Queue-vs-direct" 2026-09-09 continuation section.

   **Also disclosed, to close the ambiguity the retracted design-doc text
   left open:** a genuinely append-based DAMAGE queue does exist in this
   codebase (`native/src/ccecl.asm`'s `op_damage`, ECL opcode `0x2E`,
   appending to `fx_script_events`, drained by `native/src/gbboot.asm`'s
   `apply_effect_damage_roster`/`apply_damage_value_to_roster`) — but it is
   native-only, populated solely by the ECL VM's own script dispatch and
   drained entirely by GBBOOT's DOS file I/O, with **no code path connecting
   it to `14F24h`/`0150A8h`/`E6:0xA7`**. It is not a viable "reuse the queue"
   target for effect-7 output specifically, and its own consumer does not
   even reproduce `E6:0xA7`'s status/active-flag death-transition semantics
   (bare HP clamp only). `cok-mutation-output-ownership.md`'s "Why damage is
   not written here" section is updated accordingly and now recommends two
   concrete GBMR v3 hook-point options (native call-site interposition
   matching `E6:0xA7` exactly, or widening `apply_damage_value_to_roster`
   with the missing status/death-transition writes) as the next round's open
   design choice — neither implemented this round. No native (`.asm`) source
   changed; `AUTHORIZED_OUTPUT_CALLBACKS` remains the empty `frozenset()`.

   **GBMR V3 HOOK-POINT CHOSEN AND NATIVE-IMPLEMENTED, SCOPED, 2026-09-09.**
   The two hook-point options the paragraph above left open are resolved:
   **Option 1 (native call-site interposition), not Option 2** — implemented
   inside CCINV's `native/src/cokremove.inc` at the `cm_remove_effect`
   boundary, not by widening `apply_damage_value_to_roster`. Decision
   grounds, from re-reading the actual code: GBBOOT's 477-byte budget (still
   unchanged) cannot fit a new record parser/RNG-fold/CRC routine, while
   CCINV had ~12,484 bytes free before this round (25-27x GBBOOT's margin);
   `apply_damage_value_to_roster` is a disk-driven ECL `DAMAGE`-opcode queue
   with zero call-graph relationship to `14F24h`/`0150A8h`/`E6:0xA7`, so
   widening it would authorize nothing real; and `cm_body`'s struct layout is
   confirmed identical to the retail character-body struct cm_destroy's own
   `.finish` clears already assume, so `E6:0xA7`'s offsets (`+407`/`+392`/
   `+393`) transfer at zero translation cost only at this boundary.
   **Explicit scope-down:** this is authorization at the standalone
   `cm_remove_effect`/`cokremove-driver.asm` boundary (single-owner,
   `target_ordinal == 1`), proven via 25 new cases in the pre-existing
   369-case DOS suite (now 394), **not** the full GBMR v3 request/response
   envelope through `CCINV.COM`'s 13,224-byte `MR_LEN`-fixed pipeline that
   `tools/cok_native_mutation.py` drives — that remains open (see the design
   doc's revised numbered list). `AUTHORIZED_OUTPUT_CALLBACKS` in
   `tools/cok_mutation_output.py` is **unchanged** (still empty); it models
   the different, still-unbuilt full contract.

   New native code: `cm_gboc`/`cm_gbef_rng` caller inputs (both default
   zero, so every existing caller is byte-for-byte unaffected); one new
   `.damage:` arm in `cm_remove_effect`'s dispatch (kind 7 now checks
   `cm_gboc != 0` and calls the new `cm_authorize_output`, rejecting on CF
   exactly like every other kind); `cm_authorize_output` (full GBOC v1
   validation plus, only on a validated write-flag-present record, the
   `clamp(hp-damage,0)` HP write and E6:0xA7's status/active-flag transition
   at `+392`/`+393`); `cm_output_crc` (CRC32, reusing `cokyield.inc`'s
   `iy_crc` pattern). CCINV grew from 52,796 to 53,150 resident bytes
   (+354); GBBOOT/CCECL/CCCOMBAT rebuilt byte-identical.

   **A real bug, caught and fixed, not merely reported clean.** The first
   pass of the overkill branch set the status byte but never cleared the
   active flag, unlike the exact-lethal branch — contradicting the
   documented E6:0xA7 semantics. The new overkill<=9 DOS case (damage 36
   against the real `CHRDATA1.SAV` fixture's hp=27) failed with a body
   mismatch under real DOSBox before the one-instruction fix
   (`mov byte [bx+393],0` in `.overkill:`); the 394-case suite went green
   after, unchanged elsewhere.

   **Dynamic proof:** `pwsh -NoProfile -File native/build.ps1 -Target
   engine` then `pwsh -NoProfile -File native/cokremove-test.ps1` ->
   `PASS: 394 DOS removal cases; I/O rejection and recovery; input
   unchanged` (real headless DOSBox, real `Champions of Krynn/SAVE/
   CHRDATA1.SAV` fixture body, not synthetic). The 25 new cases: 5 accepted
   write-flag-present cases at every HP-write boundary (non-lethal,
   exact-lethal, overkill<=9, overkill>9, zero-damage); 1 accepted
   write-flag-clear no-op; a chained pair whose case-B `rng_before` equals
   case-A's accepted `rng_after`, approximating "preserved through resume"
   at the level this round actually wired (each `REMOVE.COM` case
   independently reloads `cm_gboc`/`cm_gbef_rng` from disk, **not** a claim
   about the CCECL/GBEF checkpoint file format, which stays unbuilt); 15
   rejection cases each isolating one malformed/unauthorized field, with
   `cm_gbef_rng` output confirmed unchanged on every reject; 2 controls
   proving the pre-existing baseline (kind 7 with no `cm_gboc` still
   rejects; unapplied kind 7 still accepts) is undisturbed.

   **Mutation-tested:** temporarily disabling the CRC self-check
   (`cmp eax,[si+36]` -> `cmp eax,eax`) flipped exactly the "bad CRC" reject
   case; reverting (SHA-256-verified byte-identical to the pre-mutation
   file) reproduced the same 53,150-byte CCINV and the full 394/394 pass.

   Python-side: `tools.cok_item_removal.authorize_effect7` (new function)
   mirrors `cm_authorize_output` field-for-field as a distinct, narrower
   reference from `tools.cok_mutation_output`'s full-contract model;
   `tools.cok_item_removal.destroy()` gained optional, all-default-preserving
   `gboc`/`gbef_rng`/`rng_out` parameters so every existing caller is
   unaffected. Full write-up, exact reasoning and the revised prerequisite
   list: `cok-mutation-output-ownership.md`'s "GBMR v3 hook-point decision
   and native implementation — 2026-09-09" section.

   **Independently re-verified and extended the same session.** The 23 tests
   and both mutation-test rounds above were reproduced from a clean re-run
   (`python -m pytest tools/test_cok_mutation_output_ownership.py -q` -> `23
   passed`; separately removing the authorization check, then the RNG-fold
   check, each flipped exactly one targeted test red, reverted to 23/23).
   Complementary native-level evidence for the same boundary was then added:
   `tools/cok_native_mutation.py` gained two real-`CCINV.COM` cases (via
   `native/cokmutation-test.ps1`, headless DOSBox) -- an applied kind-7/id-7
   removal request (`ident=7`, matching effect record `id=7, applied=1`)
   rejects, and the same id with `applied=0` is accepted and unlinked without
   complaint, matching `cm_remove_effect`'s applied-byte gate in
   `native/src/cokremove.inc`. `native/cokmutation-test.ps1` passes 130 DOS
   combined mutation cases (up from 128). This was itself mutation-tested:
   temporarily adding `cmp al,7 / je .unlink` to `cm_remove_effect` (accepting
   kind 7), rebuilding, and re-running turned the new applied-kind-7 case red
   (`AssertionError: ('C0057', 'reject', 'PASS')`); the change was then
   reverted and the rebuild reconfirmed byte-identical to HEAD
   (`git diff --stat -- native/src/cokremove.inc` empty) with 130/130 passing
   again. No native source is changed in the committed release; this was a
   build/test/revert cycle only.

   **CONTINUATION, 2026-09-09 (this session) — GBBOOT real-caller wiring
   investigated and found architecturally blocked; the real-pipeline test
   surface widened instead.** Tasked with making GBBOOT's live pipeline (not
   the standalone driver) populate `cm_gboc`/`cm_gbef_rng` with real values
   and reach `cm_authorize_output`, re-reading the call graph found two
   things. First, a correction: GBBOOT's own 477-byte ceiling is not the
   constraint for this feature at all — `cokhost.inc` (GBBOOT's real
   mutation orchestration: builds the `GBMB` manifest, shells `CCINV.COM B`
   then `M`, then `CCECL.COM ... CHECK`/`MUTATE`) never touches
   `cm_gboc`/`cm_gbef_rng`/`cm_destroy`; those live only inside
   `cokmutation.inc`/`cokremove.inc`, `%include`d solely by `ccinv.asm`, a
   separate child `.COM` with 12,130 free bytes. Second, the actual blocker,
   mapped exactly rather than asserted: `cokmutation.inc`'s `mr_request`
   hard-rejects any request file whose length isn't exactly the fixed
   13,224-byte `MR_LEN` before reading a single header byte, and the
   alternative of reusing already-reserved bytes *inside* that fixed
   structure (which would need no length/CRC change) does not have room
   either — direct enumeration against `mr_request.validate` found only 6
   scattered reserved bytes total (none contiguous), against the 40 a GBOC
   record needs. A real fix needs a genuine GBMR v3 touching
   `cokmutation.inc`, `cokrequest.inc`, `cokcommit.inc` and CCECL's own
   `cokyield.inc` together — four coordinated sites across two `.COM`
   executables, correctly assessed by the prior round as too large to land
   safely in one pass, and this continuation's exact byte map confirms
   rather than overturns that call. Full derivation:
   `cok-mutation-output-ownership.md`'s "GBBOOT pipeline vs GBMR wire
   format" section.

   Per this task's own fallback for a genuinely infeasible full wire-up, the
   real-`CCINV.COM`-pipeline test surface was widened instead, entirely
   without touching any `.asm`/`.inc` source: `tools/cok_native_mutation.py`
   gained 11 new cases (130 -> 141) exercising multi-owner/multi-effect
   shapes the prior round's single-owner pair could not — a 6-case per-owner
   sweep for kind 7 (mirroring the existing kind-35 sweep), a 3-case
   cross-owner mix (kind 7 rejecting on one owner while an authorized kind 12
   independently succeeds on another, in the same real candidate), and a
   2-case same-owner ordering pair (kind 12 then kind 7, and the reverse, on
   one owner's two items) proving the whole candidate is discarded even after
   a real partial `cm_write`/`cm_unlink` already happened for the earlier,
   authorized item. Dynamic proof: `pwsh -NoProfile -File
   native/cokmutation-test.ps1` -> `PASS: 141 DOS combined mutation cases`
   (real headless DOSBox). Mutation-tested: temporarily duplicating the
   kind-7 dispatch arm as `cmp al,7 / je .unlink` in `cokremove.inc` (CCINV
   53,150 -> 53,154 bytes) flipped exactly 12 of 141 cases from FAIL to PASS
   — the pre-existing `C0057` plus all 11 new cases (`C0065`..`C0075`),
   checked by comparing every one of the 141 tuples against `expected.json`
   rather than trusting `verify()`'s first-mismatch abort, so none of the new
   cases is vacuous. Reverting reproduced an empty `git diff` and CCINV back
   to exactly 53,150 bytes, with 141/141 green again; the independent
   394-case `native/cokremove-test.ps1` suite was reconfirmed unaffected.
   `tools/test_cok_native_mutation.py`'s standing count pin was updated
   130 -> 141. Full `tools/` gate with `GB_NATIVE_FLOW_GATE=1`: `5237 passed`,
   the same two pre-existing inherited browser-audit failures as every prior
   round (757 vs 754 unconsumed exports, 1655 vs 1662 barrel surface),
   `1 skipped`. No `native/*.asm`/`*.inc` source changed in the committed
   result (the mutation test's edit was reverted and verified
   byte-identical), so no native flow sweep was required or run this
   continuation. **What remains exactly as before:** `cm_gboc` still never
   becomes nonzero anywhere reachable from real GBBOOT-triggered gameplay;
   `cm_authorize_output` is still reachable only from the standalone
   `cokremove-driver.asm` harness. `AUTHORIZED_OUTPUT_CALLBACKS` is unchanged
   (still empty).

   **GBMR v3 DESIGN, 2026-09-09 (design-only round; no `.asm`/`.inc` byte
   changed, no build, no DOSBox run this round).** Tasked with designing
   GBMR v3 (room for a 40-byte GBOC record) without writing assembly, this
   round re-read all four of `cokmutation.inc`/`cokrequest.inc`/
   `cokcommit.inc`/`cokyield.inc` plus `cokremove.inc` in full and added, in
   `cok-mutation-output-ownership.md`'s new "GBMR v3 design — 2026-09-09"
   section: the exact current `MR_LEN` layout re-derived from source (every
   offset cited to the actual comparison/move instruction it comes from); a
   corrected reserved-byte count (**8, not 6** — offsets 18, 26, and offsets
   44-47 as a genuinely contiguous 4-byte span present in both v1 and v2,
   correcting the prior continuation's "6 scattered, none contiguous" claim,
   which also miscounted the phase field at offset 8 as spare capacity); a
   concrete v3 layout (append one unchanged 40-byte GBOC v1 record at offset
   13224, `MR_LEN_V3 = 13264`, single-owner scope matching the already-landed
   native authorization); a 14-item file/function/line implementation
   checklist; and, the round's actual finding, that `cokcommit.inc`'s
   existing byte-identity check over `core+32..5797`
   (`cokcommit.inc:131-145`) already forbids the one field a GBOC-authorized
   candidate must be allowed to change (the embedded GBEF's RNG dword at
   `core+174`), independent of where the 40 bytes are carried; a design-only
   carve-out is proposed (re-derive the expected RNG fold rather than skip
   the check) but not implemented. **Verdict: bigger and riskier than the
   prior continuation's assessment, not smaller** — that assessment counted
   files needing length/offset updates; this round found one of those files
   needs a security-relevant re-verification added, not just a length
   update, plus two files (`cokresume.inc`/`cokhost.inc`) this round
   explicitly did not read and flagged as unscoped. Reconfirms deferring full
   implementation to its own round rather than shrinking the estimate. Doc
   gates: `GB_NATIVE_FLOW_GATE=1 python -m pytest
   tools/test_native_readme_subject.py tools/test_docs_claims.py -q` ->
   `56 passed`. No native flow sweep run (no native source changed).
   `AUTHORIZED_OUTPUT_CALLBACKS` unchanged (still empty). **Next round:**
   either implement GBMR v3 per this design (starting with §3's immutability
   carve-out as its own checkpoint, then §5's checklist, then reading
   `cokresume.inc`/`cokhost.inc` before touching them), or pivot to task 3/4/5
   below if a different track is judged higher-value; this design does not
   itself unblock anything runnable.

   **GBMR v3 IMPLEMENTED AND DYNAMICALLY PROVEN END TO END, 2026-09-09
   (continuation).** The design above is now real: `cokmutation.inc`/
   `cokrequest.inc`/`cokcommit.inc`/`ccinv.asm` all understand a v3 GBMR
   header (version word 3, `MR_LEN_V3 = 13264`, one 40-byte GBOC v1 record
   appended at offset 13224); v1/v2 requests are unaffected and v3 requests
   are rejected by any code not yet updated for them. `cokcommit.inc`'s
   `.v3_middle_split:` branch narrowly carves out `core+174` (the paused
   GBEF RNG dword), re-deriving its expected value from the GBOC record's
   own draws/rng_before rather than trusting the candidate, with every other
   byte in `[32,5798)` still forbidden from changing exactly as before,
   plus a 4th check requiring the candidate's own appended GBOC block to be
   byte-identical to the request's. `cokresume.inc` (new this round; not
   named in the design's own file list, which flagged it "unscoped") is the
   real `/R` candidate validator behind CCECL's `CHECK`/`MUTATE` modes —
   `ir_read`/`ir_apply`/`ir_active` — and is v3-aware (`IR_LEN_V3`, a
   dynamic `[ir_len]` used throughout its CRC/length checks).

   Proof: `tools/cok_native_commit_v3.py` + `native/cokcommit-test.ps1`
   drives the full six real-DOS steps (`CCECL /D` -> `CCINV B` -> `CCINV M`
   -> `CCECL CHECK` -> `CCINV C` -> `CCECL MUTATE`) for one genuine
   kind-7-damage GBOC-authorized removal, and reuses that request/candidate
   pair for four C-stage rejection variants (`CRNGBAD`, `CGBOCBAD`,
   `CSMUGGLE`, `CREQBAD` — bad RNG, tampered GBOC block, a smuggled non-RNG
   byte change, and a hand-forged request, respectively), each proven to
   leave the published activation files byte-for-byte untouched
   (`mc_fail`'s rollback contract). Both new `cokcommit.inc` checks were
   mutation-tested (temporarily weakened, confirmed the matching rejection
   test goes red, reverted to byte-identical source, reconfirmed green).
   Byte budgets re-measured: GBBOOT and CCCOMBAT unchanged (64,803 /
   63,880 bytes, byte-identical); CCECL 64,167 -> 64,253 (+86, `cokresume.inc`'s
   v3-aware `ir_read`); CCINV 53,150 -> 53,809 (+659, `cokcommit.inc`'s v3
   carve-out). Full derivation, the four bugs found building the harness
   (a DOS 8.3 filename-truncation misdiagnosed in the previous session as a
   native-code hang, two missing per-variant fixture files, and a genuine
   `SEED.BIN`-construction bug), and the mutation-test transcripts:
   `docs/engine/research/cok-mutation-output-ownership.md`'s "C-stage
   stage->validate->commit->resume, real DOS, end to end — 2026-09-09
   (continuation)" section.

   **Still open:** `AUTHORIZED_OUTPUT_CALLBACKS` remains the empty
   `frozenset()` on purpose — this proves the wire format and the C-stage
   carve-out, not that effect 7 (or any callback) is authorized to reach a
   real player through ordinary play.

   **Flow sweep re-run, closing the disclosure above.** `native/run-flow-suite.ps1
   -KeepLogs` was run twice after this: once against the still-uncommitted
   v3 source, once again after committing it (`6e93796`), so the final
   `native/flow-status.json` records a clean tree. Both runs, and the
   pre-existing committed baseline (`c3342f28`), agree to the byte: **19
   PASS / 8 FAIL / 0 SKIP of 27**, all 27 `(name, status, needle)` tuples
   identical across all three artifacts. The 8 reds are the same
   pre-existing set this file's roadmap step 7 already documents
   (`gbdqk-intro-flow-test`, `ccecl-dqk-vmrun-test`, `ccecl-dqk-combat-test`,
   `ccecl-dok-combat-gap-test`, `ccecl-dok-thief-matrix-test`,
   `gbdqk-combat-flow-test` [quarantined], `gbcoab-flow-test`,
   `gbdqk-flow-test`) — zero regressions from the GBMR v3 work.
3. **Verify original combat rules incrementally.** Shared RNG continuity does
   not prove original initiative, AI, attack draw order or byte-wrapped dice
   sums. Start with the observed base/replacement damage sequence and zero/one
   dice boundaries. Acceptance: compare results and final RNG after complete
   original/native sequences, not final damage alone.
4. **Replace provisional CoK creation fields.** Derive native race/class,
   level, eligibility and starting grimoire from original routines. Test created
   bodies, menu choices, rest/spell behavior and cold persistence. Existing
   browser import edits are separate unfinished work, not an approved baseline.
5. **Broaden native campaign coverage.** Investigate one of the eight failing
   flows from its exact trigger and original behavior. Then extend verified
   rest/timer/learning rules to DoK and other titles. Acceptance: preserve the
   CoK baseline and show a real route/state improvement, not just a weaker pin.

Before adding resident code, check the size budget: GBBOOT has only **477 bytes**
below the current 65280-byte build ceiling. Prefer measured scratch reuse or
existing helper boundaries when suitable; retain allocation/stack checks.
Full campaign completion and graphics parity remain broader goals, not claims
of this bounded release.

## Research entry points

- [CoK RNG](research/cok-rng-native.md): original recurrence, dice behavior,
  native continuation format and current limits.
- [Item removal](research/cok-item-removal-native-plan.md) and
  [mutation packet](research/cok-mutation-packet.md): callback subset, activation
  checks and unresolved outputs.
- [Mutation output ownership](research/cok-mutation-output-ownership.md)
  (2026-09-08, task 2; updated 2026-09-09 three times — queue-vs-direct
  resolution, the GBMR v3 hook-point decision and its scoped native
  implementation, then a continuation confirming GBBOOT-real-caller wiring
  is architecturally blocked and widening the real-pipeline test surface
  instead): versioned `GBOC` RNG/damage output record design and its
  Python-level enforcement (`tools/cok_mutation_output.py`,
  `tools/test_cok_mutation_output_ownership.py`) remain unchanged;
  `AUTHORIZED_OUTPUT_CALLBACKS` is still empty and the full GBMR v3
  request/response envelope through `CCINV.COM` is still unbuilt. What is
  new 2026-09-09: a real, narrower, dynamically-proven native authorization
  at the `cm_remove_effect` boundary in `native/src/cokremove.inc`
  (`cm_authorize_output`/`cm_output_crc`, single-owner scope), proven by 25
  new cases in the 394-case `native/cokremove-test.ps1` DOS suite — see the
  dated section in the design doc and the matching block under task 2 above.
  Also new 2026-09-09 (continuation): the exact reserved-byte map showing no
  40-byte span exists in the fixed 13,224-byte GBMR structure for a GBOC
  carrier without a real v3 format revision, and 11 new real-`CCINV.COM`-
  pipeline test cases (130 -> 141) covering multi-owner/multi-effect shapes
  the prior pair could not — see the "GBBOOT pipeline vs GBMR wire format"
  section in the design doc and the matching block under task 2 above
  for exactly what this does and does not authorize.
  **Also new 2026-09-09 (design round, no native change):** a full GBMR v3
  design ("GBMR v3 design — 2026-09-09" section) — exact current `MR_LEN`
  layout re-derived from source, a corrected reserved-byte count (8, not 6),
  a concrete v3 layout appending one 40-byte GBOC v1 record at offset 13224,
  a 14-item implementation checklist, and a newly-found blocker in
  `cokcommit.inc`'s existing byte-identity check that would reject any
  legitimate GBOC-authorized candidate independent of the wire-format-growth
  question — see the matching block under task 2 above.
- `tools/cok_effect7_oracle.py`, `tools/test_cok_effect7_context.py`,
  `tools/test_cok_context_lifecycle.py`,
  `tools/test_cok_effect7_target_provenance.py`,
  `tools/test_cok_effect7_damage_consumer.py`, and
  `tools/test_cok_effect7_damage_queue.py`: standing original-code evidence.
  The provenance module executes `14F24h` directly and establishes target
  provenance and non-consumption; the damage-consumer module locates and
  dynamically confirms `14F24h`'s actual caller/consumer chain (`0150A8h` ->
  `E6:0xA7`, file `038A7Dh`) including a mutation control; the damage-queue
  module (new 2026-09-09) statically and dynamically confirms no
  DAMAGE-staging queue exists on that path (see the dated sections in
  `research/cok-item-removal-native-plan.md`).
- `tools/cok_combat_rng_native.py` and `native/cokcombat-rng-test.ps1`: DOS
  end-to-end handoff and rejection fixture.
- Local exploratory files: `build/probe-cok-target-substitution.py` and
  `build/cok-attack-damage-probe.json`. The JSON's `accepted` byte is not a
  meaningful success result for the void damage routine; use successful return
  and observed state. These ignored probes are not standing regression coverage.

## Resume and release discipline

Keep native builds, focused tests, flow sweeps and the full corpus sequential.
They share `native/build`; do not edit/rebuild native source while a native test
process is live. Stage fixtures under that directory and keep retail assets
read-only. Use headless DOSBox; DOSBox-X automation must use GameLink.

Run focused checks, commit the exact owned source/test paths, then build with
`pwsh -NoProfile -File native/build.ps1 -Target engine`. Run
`pwsh -NoProfile -File native/run-flow-suite.ps1 -KeepLogs` against committed
native source and compare every verdict/message tuple with the prior artifact.
Exit 0 from the runner alone does not mean every flow passed.

For tools/ledger changes, run `$env:GB_NATIVE_FLOW_GATE='1'` followed by
`python -m pytest tools/ -q`. After the last relevant documentation edits, run
`python -m pytest tools/test_native_readme_subject.py tools/test_docs_claims.py -q`
with that environment still set. Record actual final results, commit only
owned docs/artifacts, push `origin greybox`, and compare HEAD with
`git ls-remote origin refs/heads/greybox`. Native/docs-only work requires no
website deployment; user-visible web changes require CLAUDE.md's atomic deploy.

Preserve inherited WIP: browser/Electron UI and e2e files, engine saved-character
loaders/exports/tests, `tools/test_cok_start_tables.py`, and research documents
`cok-character-record-race.md` / `dok-chrdata-save-format.md`. The root transcript
`2026-09-07-231039-this-session-is-being-continued-from-a-previous-c.txt` is also
untracked inherited context. Do not stage these through `git add .` or reset
them. Check live status and the persisted goal before resuming autonomous work;
a repository goal document alone does not describe the runtime goal's status.
