# Champions of Krynn: complete playable Rust reconstruction plan

Date: 2026-10-15. Planner: Astra. Status: approved implementation direction;
gameplay milestones below are not yet accepted. The user's current request
resumes the complete Rust CoK reconstruction, superseding the earlier pause for
this track. It does not replace the separate native Greybox `GOAL.md`.

Latest implementation status (2026-10-15): M0 is accepted as the bounded
running baseline; M1–M7 remain open. The current cold/WORLD code union retains
35,740 instructions/91,590 bytes, with224 passing release tests (one ignored)
and an optimized build; see
[native acceptance](cok-world-volume-native-acceptance-2026-10-15.md).
One complete observed KRA creation/save route produced KRA.WHO409B and
KRA.SFX9B and returned to the main menu; its headless replay saved identical
files with16 matching consumed keys. Strict long-run state parity remains
unresolved; see [headless acceptance](cok-headless-runtime-acceptance-2026-10-15.md).
A fresh headless process now reopens KRA and returns to a one-member party
menu, corroborated by final RAM and fault-free close; see
[bounded cold Add state](cok-cold-add-state-acceptance-2026-10-15.md).
The isolated optional DOS audit now passes240 native tests (one ignored),
release build, exact headless OFF/window-ON cold Add routes and a separately
pinned DOS verifier. Actual WHO409-byte and SFX9-byte transfers match accepted
source hashes; SFX EOF is observed and both runs preserve identical RAM,
registers, BIOS input and saves. Coverage begins explicitly at work16000000;
earlier callbacks remain unobserved. See
[audit validation](cok-dos-audit-native-validation-2026-10-15.md).
Production audit integration, original View, broader party handling and WORLD
gameplay remain open. Both missing fixed View callbacks have original-source
local CFG recovery and actual mapped REA analyses, but host/guard dependencies
still prevent native admission. After the earlier deadline failure, the fresh
DWF2 headless case now completes original Mountain Dwarf Fighter creation/save
and returns to the main menu: guest/helper exits0,30 matching submitted/consumed
BIOS words and offline publication validation. DWF2.WHO is409 bytes and
DWF2.SFX27 bytes; see
[second-save acceptance](cok-second-character-save-acceptance-2026-10-15.md).
The user explicitly authorized coordinator execution because Luna dispatch was
unavailable. Luna subsequently completed a fresh DWF2 cold Add: singleton
AC7/HP19, two source-explained WHO rewrites, three rebuilt SFX nodes and actual
9/9/9/0 sidecar reads, with orderly exit and both validators passing. See
[DWF2 cold acceptance](cok-dwf2-cold-reload-acceptance-2026-10-15.md).
Broader creation/party semantics remain open; these bounded cases do not complete M1.
A prior root GUI showed Pick
Gender/MALE but exceeded the raw BIOS
evidence cap and did not complete a character. Durable DOS transport passed
cold-process controls; original character/world save compatibility remains
unproven. Follow `rust/cok-recomp/GOAL.md` and the dated acceptance reports for
the chronological evidence; baseline and first-task sections below describe
the state at initial planning.

## Objective and completion contract

Deliver a modern desktop Champions of Krynn game, hosted in Rust and executing
faithfully lifted C derived from the user's original DOS executable and overlays.
The player must be able to create and manage a legal party, enter the campaign,
explore, trigger events, fight, cast spells, buy/sell/equip items, rest/train as
supported by CoK, save, exit, reload and finish the original campaign. Original
game decisions and rules remain in recovered code. Modern presentation, input,
audio delivery, filesystem services and packaging belong in the host.

Completion requires a recorded campaign from newly created characters to the
original ending, with cold process save/reload continuity at intermediate and
late checkpoints, plus the subsystem tests below. A pre-seeded final encounter,
an intro/menu, a collection of unit tests, a lifted-byte count, or an executable
that can open a save does not satisfy that contract. Keep a campaign route and
checkpoint manifest so the completion claim can be reproduced. No elapsed-time
estimate or completion percentage is supported by current evidence.

## Review of the two actual REA experiments

Source: [executed REA report](cok-rea-ghidra-analysis-2026-10-11.md), section
“Two missing-system experiments — executed 2026-10-15”, and local evidence
`build/rea/rea-two-20261015-a/summary.json`, SHA256
`bc8d8f4a6220a3143d5fbb274016da78604d0526770e98682031b2fd59bff4f4`.
That report's statement that reconstruction remained paused describes the time
of the experiments; it is superseded by the current user request.

Both experiments really ran REA 6.4.0 with Ghidra 12.1.4. Eight CLI operations
returned zero in 111 seconds of recorded command time. Both imports reported
564/564 checks. The original resident prefix, raw overlay bytes and all 461/393
overlay fixups were independently checked unchanged. Overlay bodies were placed
at analysis linear 30000h through a 64 KiB aligned module-relative placement;
this is an analysis address, not a measured gameplay load address.

| Experiment | Observed function extent | Useful result | Unproven part |
| --- | --- | --- | --- |
| A4 character creation | 06DDh..257Bh; 7,839 bytes, 350 blocks, 27 reported callees | A coherent creation function joins race, gender and class selection; race field 5Ah, gender field 109h and class-table stride 15 are supported by original instructions | Full dependency closure, correct stack/local reconstruction, runtime creation |
| 9E save/load | Save 22DEh..2816h, 1,337 bytes/21 callees; load 1B34h..2107h, 1,492 bytes/23 callees | Paired world-state block operations, filename construction, character-list persistence and error paths | Block helper ABI, complete format, executable faithful C, runtime round trip |

The 5,469-byte main-save sum is conditional on helper byte-count semantics; it
is not an accepted save specification. Zero referenced strings were returned;
Pascal-string identities came from separate original-byte decoding. Character
and save pseudocode misrepresent some SS:BP locals as globals. The earlier
resident RNG CS binding error also remains relevant. Therefore REA is a useful
function/dependency analysis guide, not a source-to-C correctness oracle. Do
not compile its pseudocode unchanged or spend this project trying to repair
Ghidra's general decompiler before implementing gameplay.

## Current baseline and immediate scaling issue

The tracked module-46 bootstrap describes 18,564 instructions / 46,624 bytes,
with Create at A4:06DD still an explicit stop. A separately staged CreateRace
candidate has 18,728 instructions / 47,047 bytes and coordinator-reported 125
passing tests; the tracked baseline had 122. These are different lineages.
The latest finite GUI observation reached a real seven-label Pick Race frame
but ended at a 20-million-work cap (exit 1); it did not establish complete race
acceptance, creation, or sustained play. Preserve that distinction when landing
the candidate. Existing Rust code includes loaders, overlay management, EGA
frames, a Windows frontend and OPL/WAV support. Live speaker output and full
gameplay remain unfinished.

The current generated protection predicate grows to 11,236 comparisons and
MSVC /O2 encountered C1002. An /Od candidate compiled, but the observed finite
GUI route took roughly 163 seconds. A staged exact-union emitter reduces those
intervals to 96 without changing the protected byte set. Its source was reviewed;
its actual generated /O2 build and runtime acceptance remain outstanding. This
is the first bounded implementation task, not a reason for another long series
of micro-admission infrastructure tasks.

## Execution architecture

1. Preserve original instruction semantics in generated C: segmented addresses,
   flags, far calls, stack cleanup, overlay ownership/relocation, yields and
   device/IRQ boundaries. Retain the original-byte provenance manifest. Use
   REA's candidate functions to organize coherent recovery units and cross-check
   direct disassembly; do not equate its reported callees with complete closure.
2. Recover a whole function or subsystem dependency closure per gameplay task.
   Follow direct branches/calls and original overlay stubs; resolve computed
   targets with tables and runtime evidence. Classify every outgoing edge as
   admitted code, explicit host service, or unresolved. Never make an unresolved
   edge a successful no-op. A fault gives the next concrete implementation task.
3. Use Rust for ownership and modern services: window/input, frame presentation,
   streaming audio, time, safe file handles, save directories, diagnostics and
   lifecycle. Keep DOS API compatibility limited to services actually required
   by the recovered game. Do not replace gameplay with the separate web/native
   clean-room engine or silently substitute a general emulator.
4. Generate functions/overlay units with a stable shared ABI as coverage grows.
   If compiler graphs require partitioning, partition at verified function or
   dispatch boundaries; preserve preparation/work debit, interrupt points,
   atomic fault behavior and nonrecursive guest control flow. A giant unchanged
   function moved to another file does not solve a per-function optimizer limit.
5. Keep a subsystem inventory containing roots, original extents, dependency
   edges, admitted bytes, unresolved edges and runtime route. Count unique
   instruction bytes separately from constants/data; don't inflate coverage by
   counting an overlay's file size as executed code. The total executable-code
   denominator is not known yet and must be discovered, not invented.

Architecture escalation is explicit: if optimized generated C still cannot
support sustained interactive play after the exact-union fix and evidence-led
partitioning, Astra produces a measured comparison of remaining generated-C
options and verified function-level C recovery. Continue unaffected subsystem
work. Report the blocker and proposed architecture change to the user before
changing the requested original-code reconstruction into an emulator or rewrite.

## Milestones and discriminating acceptance

Milestones are dependency order, not a requirement to delay all useful work
until the previous subsystem is perfect. Start save ABI recovery alongside
creation, and host audio work alongside gameplay once file ownership is split.

| Milestone | Implementation scope | Acceptance owned by Luna |
| --- | --- | --- |
| M0: scalable running baseline | Exact protection union, reproducible staged CreateRace integration, optimized build; only then needed generator partitioning | Equivalent protection including gaps/invalid ranges; existing guest tests; actual /O2 build; real menu/race input route with binary/source hashes and timings |
| M1: complete creation and party | Whole A4:06DD creation closure, shared menu/stack contracts, race/gender/class/alignment and other original creation stages, rolling/accepting attributes, names, appearance where offered, cancellation/backtracking; party add/remove/reorder and disk character operations | Create multiple legal class/race combinations, reject illegal combinations through original rules, cancel at distinct stages without leaks/corruption, retain accepted character fields and form a playable party; compare original checkpoints |
| M2: world and character persistence | 9E save/load closures, resident 0A46:14B4/14BB contracts, local 0A80/0BED character helpers and overlay 0555; DOS open/create/write/close/seek/error semantics | New save, cold reload and subsequent action; world flags/location/party order/stats/equipment/spell state preserved; original reads reconstructed saves and reconstruction reads staged original saves where formats match; full/short/error writes cannot masquerade as success |
| M3: exploration and events | Original campaign entry, GEO/wall/picture/text paths, movement/turns/doors, area transitions, ECL interpreter and all campaign-used opcodes, dialogue/choices, flags/quests/encounter scheduling | Walk and turn against collision; doors and transitions; choice-dependent event state and one-shot behavior; save/reload before and after events; visible 3D/map/text frames supported by state traces |
| M4: tactical combat | Encounter formation, initiative, movement/pathing, attacks/ranged, monster AI, targeting, damage/resistance/status/death, victory/defeat/flee, loot/XP and return to campaign | Controlled original-versus-lifted state checkpoints with fixed RNG/time where possible; player and monster turns, blocked movement, legal/illegal attacks, death and recovery, victory rewards, defeat and reload; an actual campaign fight |
| M5: rules and services | Every campaign-used spell/effect, memorization/rest, equipment/inventory/trade, shops/prices, temples/healing, training/level advancement and race/class special behavior | Representative damaging, healing, status, duration and area spells plus coverage of all original dispatch handlers used by the campaign; resources consumed correctly; buy/sell/equip/drop, rest interruption and training gates; persistence of each |
| M6: modern desktop delivery | Live OPL and applicable speaker/PSG audio, stable timing, responsive input, window scaling/fullscreen, mute/volume, pause/focus lifecycle, asset-directory selection, useful failure messages and writable user save directory | Real audio device output without drift/dropouts on intro and gameplay; keyboard make/release and text entry; resize/focus/pause/resume/quit; gameplay remains responsive at measured frame/input latency; no writes to source assets |
| M7: campaign and release | Campaign route completion, uncommon required branches/late encounters, ending/credits, cold continuity, reproducible release package | Fresh party reaches original ending via recorded campaign, no unresolved runtime edge, intermediate and late saves resume after restart; repeat selected checkpoints from packaged build on a fresh output directory |

M2 is deliberately early: persistent checkpoints turn a long campaign into
repeatable gameplay tests. Compatibility differences must be explained by
original behavior or an explicit host path adaptation, not discarded because
both implementations happen to complete. Deterministic comparisons compare
defined state/flags and controlled clock/RNG; uncontrolled animation or timing
differences are recorded rather than forced into false byte equality.

## First two bounded Sol implementation tasks

### Task 1: unblock optimized creation baseline

Own `rust/cok-recomp/lift.py`, the necessary CreateRace bootstrap integration,
and focused own-source tests/docs. Start from the staged protection-union source
and Astra plan under `build/cok-recomp/staging/intro-compare/`; review their exact
identity before applying. Preserve all protected tuple provenance and the
existing validity guard; merge overlap/adjacency only, never bridge a gap. Keep
module-protection logic and all guest semantics unchanged. If the source-only
candidate differs from production because of CreateRace admission, integrate
that admission as a separately identifiable change with its actual fixtures.

Byte budget: **zero new gameplay bytes for the union transformation**. The
separately identified CreateRace integration is **164 instructions / 423 bytes**
above the tracked baseline, yielding 18,728 / 47,047 only if independently
reproduced. Do not silently reuse those totals for a different source inventory.

Luna controls: exhaustive 1 MiB single-byte coverage equivalence, interval
boundary/crossing/gap cases, invalid and overflow requests, a removed-byte and
filled-gap mutation, existing relocation/ownership tests, actual candidate
suite, /O2 compiler/link logs, and finite GUI menu to race selection and its
actual continuation. Record expected boundary separately from unexpected
failure; finite work-cap exit is never a gameplay pass by itself. Required
outputs: generation/diff receipt, source/binary hashes, compile logs, test
results, frame/input/state trace and before/after timing of the same route.

### Task 2: whole creation function and gameplay dependency closure

Recover the A4:06DD..257B function as one coherent unit, using the actual REA
dossier plus original bytes. Solve shared menu return, SS:BP locals, far-call
cleanup and table-driven legal class selections before relying on decompiled
types. Add reachable helper closures in batches with actual instruction-set
support, not one prompt or one instruction per work cycle. Finish a character
and return it through the original party workflow; explicitly list any party
manager root that requires the next bounded continuation.

Root scope: **7,839 original bytes**, with overlap against accepted admission
subtracted. Initial task envelope: **32 KiB of new unique guest instruction
bytes**, including required helper closures; this is a scope cap, not an estimate
of the actual closure. Inventory actual bytes before admission. If the closure
exceeds it, Astra partitions at complete helper/function boundaries and gives
the next dependency batch immediately; do not truncate the creation behavior
and call the milestone done. Runtime budget is evidence-led and finite per
test; increasing a cap does not resolve a stalled guest.

Luna controls: original and lifted legal selection/cancellation sequences;
race 5Ah and gender 109h writes, class filtering table behavior, accepted
character output, stack/far-return balance and repeated-create cleanup. Include
different races/classes and backtracking, not only default Enter. Produce a real
completed-character screen/state and party insertion trace. Preserve original
source read-only. A screenshot of a prompt is insufficient for this task.

Next bounded task after that is the M2 save/load helper closure: seed extents
are 1,337 + 1,492 = **2,829 bytes**, plus measured dependencies. Determine the
helper ABI first; use a **32 KiB new-code task envelope** with the same complete-
function partition rule. Save data bytes are a separate accounting category.

### Parallel implementation lane: DOS file service backend

Approved alongside Task 1: Sol may implement NEW `src/dos_files.rs` and a NEW
isolated test module, with no edits to `main.rs`, `startup_platform.rs`, build
files, the lifter or manifests. The existing platform has asset-read handle
operations but lacks the create/write services needed for persistence. Implement
a deterministic handle/store API with distinct immutable asset and mutable save
namespaces: open access modes 0/1/2, create/truncate, read, write, zero-length
write truncation at the cursor, close and signed-origin seek. Return typed
results/errors for later DOS CF/AX adaptation. Preserve original assets; paths
must not escape the designated namespace. Define handle lifetime, access denial,
missing file, invalid handle, disk-full/short-write injection and cursor behavior.

This is actual reusable service code with **zero guest-code admission** and no
guessed SAVGAM structure. Begin with a deterministic store so original-format
ABI discovery does not block implementation. The adapter and real save-directory
persistence are subsequent integration work after original 14B4/14BB contracts
are verified. Do not claim M2 complete from backend tests. Luna can compile/test
the isolated module without wiring it into the runtime; serialize any shared
Cargo/generated build with the foundation lease. Controls cover access modes,
independent cursors, invalid/closed handles, overwrite/extend/truncate, negative
and beyond-end seeks, failure atomicity, and asset immutability/path rejection.

### Task 1 runtime cohort

The existing `post-create-17.png` in
`build/cok-recomp/staging/intro-compare/create-race-gui-run-20261015-od-b/`
provides the observed Pick Race prompt window (approximately work 16,770,816).
For the unchanged guest-admission union experiment, the finite scheduled input
cohort Enter@14,500,121, P@15,000,000, Enter@16,000,000,
Enter@18,000,000 is approved with the same 20-million-work cap and chunk 256.
Require all four actual BIOS consumptions and endpoint A4:0884 with fault zero
and correct owner. Scheduling four inputs alone is insufficient. This endpoint
precedes the race-field store; it proves returned selection, not persisted race
or complete creation. Record a changed timing/state outcome honestly if /O2
does not reproduce the expected route.

## Team, ownership and verification workflow

The coordinator maintains scope and integration; Astra plans each bounded task
against code and runtime evidence; Sol 6.1 implements and repairs; Luna 6 owns
hands-on builds, application tests and screenshots. The user has explicitly
authorized this continuing loop. Planning or one completed subsystem does not
end it. After acceptance, document, commit and push the bounded change, then
start the next unresolved gameplay task. Do not repeatedly rerun unrelated
historical gates after a clean applicable pass without new evidence.

Use one owner for the shared lifter/generation/manifests/build files (Sol).
Astra may perform read-only next-subsystem analysis concurrently. Luna owns
one runtime/build lease at a time. Future independent host audio/input work
can own separate host files, but shared ABI changes are serialized and reviewed
by the coordinator. Agent parallelism does not isolate generated C, Cargo
targets, DOSBox sessions or native devices. Give each run an isolated output
root and identify its exact source and binary. Never use another agent's
unfinished generated artifacts as accepted input.

For the original DOS oracle, **all DOSBox-X input, screenshots and memory reads
must use focusless GameLink**, following `CLAUDE.md`; never host SendKeys or
focus stealing. Use the pinned mode-change fix when applicable and record the
selected executable hash. Run against staged copies of the user's game; verify
source sizes/mtimes as well as hashes when writes are possible. Screenshots
corroborate state/file traces; model descriptions are not the oracle.

Each accepted task records the original identity, root/extents and closure,
compiler/tool identities, changed unique bytes, exact binary, observed route,
actual test results and remaining unresolved boundaries. Keep one concise
acceptance record per task and append reusable original checkpoints. Reuse
existing harnesses; add a discriminator when it catches a concrete failure or
validates new behavior, not a second framework describing the same result.

Follow applicable `CLAUDE.md` gates. Changes to `tools/` or JSON ledgers require
the corpus gate it names. This Rust-only plan does not require a website upload.
If a later task changes user-visible web content, its required build, atomic
deployment and live bundle/route verification become part of that task.

## Packaging and durable continuation

The release contains owned Rust/C support source, generator and launcher plus
necessary third-party notices. Original executables, assets, derived binaries,
generated original-code C, listings and REA pseudocode stay local/ignored under
the repository's existing policy. Provide a reproducible local build from the
user's assets and pinned dependencies; document supported asset hashes and
clear mismatch diagnostics. The installed game stores saves separately from
the original asset directory and supports normal restart without an agent.

The coordinator registers this full objective through the persistent goal tool
and keeps `rust/cok-recomp/GOAL.md` as this track's recovery pointer. Never
overwrite the root `GOAL.md`, which belongs to the concurrent native Greybox
track. On recovery: read this plan, local goal state, last accepted task and
current source status; reuse accepted evidence, then continue the next missing
gameplay closure. Mark complete only after M7 plus the subsystem and desktop
delivery contracts have actual evidence. If stopped or paused by the user,
record the exact pending task and stop; otherwise continue.
