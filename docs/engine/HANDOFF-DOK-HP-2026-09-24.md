# DoK HP mapping and DAX GBSL contract — 2026-09-24

## DQK NPC enemy-route audit — 2026-09-25

The MONCHA HLIB ID table maps ECL logical ID 68 to member 68 GNOME WARRIOR
(`isMonster=0`). Area 64 has an ECL combat path loading 15 at `0x91F4` before
`COMBAT 0x91FF`, plus a nine-member wave at `0x9386`/`0x9391`. Area 66's
descriptor-3 wall event can call `NEWECL #64`; its source gates and matching GEO
cells are recorded in the audit. The area62→64→66→67→65 campaign state route is
now source-grounded for `[0x019F]`; GNOME WARRIOR's own-turn behavior remains
open. The apparent area-66
`LOAD_MONSTER #93` instead maps to DISIR (member 89); SELIAS is logical ID 114.
Static combat tracing now shows an explicit ally-confirmation route to an
attack resolver. See
[`research/dqk-npc-combat-route.md`](research/dqk-npc-combat-route.md).

No code or DOSBox runtime was changed in this source-only increment. The
`[0x019F]` gate is now source-resolved for the area62→64→66→67→65 route: a
reachable-operand census across all 47 ECL areas found only area64's compare,
area62's set, and area64's reset. Next,
trace the ID-68 records through turn scheduling. The scheduler at `0x5ED25`
uses the `1D99:0xE69` type gate and fields `+0x28`, `+0x37`, `+0x38`, and
`+0xA5`, not side flag `+0x66`. The gate recognizes `+0x28` types `0x27`,
`0x28`, and `0x49`; type `0x49` uses the PC action path, while `0x27`/`0x28`
take a separate path. Gate-rejected records require `+0x37 > 0` and
`+0x38 < 0x80` before the priority queue call. The combat audit identifies
`+0x37/+0x38` as a timed-effect duration/type slot, not generic AI/speed fields.
The ID-68 post-load values and outgoing target behavior are unresolved, so
side flag alone proves neither whether gnomes get turns nor who they can attack. The player's
confirmed-friendly-fire route reaches attack resolution, but it does not
establish NPC outgoing damage or kill-award semantics. Task 28 remains open.
MONCHA member 68's raw `+0x28/+0x37/+0x38` bytes are zero and the LOAD_MONSTER
builder copies the record before clearing only links. Area 64 runs
`SETUP_MONSTER #255,#1,#44,#0` at `0x918E`; its handler at `0x43071` writes
the current combatant's `+0x38/+0x37` effect slot through `[0xB20F]`. The
pointer identity, slot lifetime, and any later per-node writes remain to be
traced before drawing a turn-eligibility conclusion. The same NPC member carries
five item instances; its first ready base-9 item resolves through `DISK1/ITEMS.DAT`
to a melee weapon with 2d4 damage vs Large / 1d6 vs Small-Medium. This grounds a
weapon profile, but not that the gnome acts or that the original attack resolver
uses this item in the area-64 encounter. Keep the native 1d2 placeholder until
those links are traced.

Validation: `python -m pytest tools/test_docs_claims.py tools/test_prose_wiring_claims.py -q`
passes (37 tests), and `git diff --check` passes for the updated tracked docs.
No executable build or DOSBox test was required or run; runtime focus remains
protected.

## Task 28 area-64 route and side correction — static — 2026-09-25

**`[0x019F]` route state resolved statically.** A CFG-aware census of every
reachable instruction operand across all 47 ECL areas found exactly three
references: area 64 `COMPARE` at `0x8030`, area 62 `SAVE #1` at `0xA81F`, and
area 64 `SAVE #0` at `0x804A`. The source-backed area62→64 route enters that alternate opening,
which clears the flag; area64 victory reaches area66, and the area66/67 story
chain has a reachable transition into area65 before the windship's
`SAVE #99,[0x019B]` / `NEWECL #64` return. No ECL writer changes `[0x019F]`
after the area64 reset. This establishes the ordinary area64 gate state for
that static route, not a runtime traversal. Task28 remains open on whether
ID-68 records are scheduled and their outgoing target/damage/award behavior.

The area65 windship path gives a direct source chain: the **LEAP ABOARD**
continuation reaches `SAVE #99,[0x019B]` at `ECL.GLB` member 45 `0x9527`, then
`NEWECL #64` at `0x952D`. A second `SAVE #99` / `NEWECL #64` pair is at
`0x9EC2` / `0x9EC8`. In area64, the ordinary entry restores its scratch bank,
checks `[0x019F]` at `0x8030`, then checks `[0x019B]==99` at `0x803B`.
`[0x019F]!=0` diverts to the alternate opening at `0x804A`; area62 has a
reachable `SAVE #1,[0x019F]` at `0xA81F`, and area64 clears it at `0x804A`.
The reachable-writer census and area62→64→66→67→65 source chain establish
`[0x019F]==0` at the windship return, statically.

The earlier `[0x00C4]==1` combat-gate claim was incorrect. At area64 `0x8F9A`,
that comparison selects either the short `"YOU AND "` line or the arriving
gnomes' narration; both arms converge at `0x9007`, then the same ATTACK / WAIT /
LEAVE menu at `0x912B`. ATTACK loads 15 logical-ID-68 GNOME WARRIOR records at
`0x91F4` before `COMBAT` at `0x91FF`. Area66's descriptor-3 return follows a
different route: its `[0x01A2]=1` value sends area64 through `0x84FC` to the
spiders scene, bypassing the gnome-state check.

Retail combat bytes support the gnomes being same-side under ordinary target
selection. MONCHA logical ID 68 has `+0x66=0`; the other queued DQK monsters
have `+0x66=1`. The HLIB builder copies `0x19E` bytes into each combatant node
at `DQK.EXE 0x42E52` and clears only link words. Combat setup at `0x2D729`
rotates facing by four directions only when `+0x66==1`. The target predicate
at `0x25D90` rejects equal `+0x66` values when its override is zero. One call
site at `0x284AB` passes zero; another at `0x27EBF` passes one. The latter's
role remains unidentified. The explicit ally-attack path at `0x2784F` calls
the opposite-side helper, prompts `"attack ally?"` when the actor and selected
candidate share a side, and returns success only after a nonzero answer.
`0x23A1B` checks that result, stores the selected record as the attack target,
then calls the attack resolver at `0x26636` from `0x23A63`. Thus party members
can deliberately target the loaded gnomes after confirmation. They remain
same-side allies under ordinary selection; their own actor turns and any
outgoing damage or award behavior are unproven. Turn dispatch at `0x5ED25`
does not inspect `+0x66`: `1D99:0xE69` recognizes types `0x27`, `0x28`, and
`0x49`; type `0x49` takes the PC action path, while `0x27`/`0x28` use a
separate path. If the gate rejects the record, dispatch requires `+0x37 > 0`
and `+0x38 < 0x80` before queue insertion. Those bytes are timed-effect
duration/type fields according to the broader combat audit, so this condition
is not a generic AI/speed check. Trace ID-68's post-load values, effect-slot
lifetime, and outgoing target selection. See
`research/dqk-npc-combat-route.md` for the source offsets and remaining limits.

No code or DOSBox runtime was changed for this trace.

## Result

DoK's original 216-byte `.GAM` character record stores maximum HP at byte 40
(`0x28`) and current HP at byte 214 (`0xD6`). `CCPARTY /G` now initializes GBD1
current/max HP from those respective bytes. Direct `CCHOST /D` damage updates
only byte 214, preserving the maximum. The original title's save and load paths
pass the entire 216-byte caller buffer directly to DOS `AH=40h` and `AH=3Fh`;
the combat routines independently use `+40` as the maximum and `+214` as current.
The six shipped undamaged saves have equal values at both offsets and cannot
distinguish the meanings on their own.

Evidence and citations are recorded in
[`research/dok-chrdata-save-format.md`](research/dok-chrdata-save-format.md)
and [`research/disasm-combat-dok.md`](research/disasm-combat-dok.md). Astra
independently decoded the raw load/save path and combat reads. Its trace did not
establish the complete caller edge from a named loaded `.GAM` character to
combat. Luna's bounded UI attempt used disposable copies with byte 40 = 93 and
byte 214 = 17, but did not reach a view of that character's HP; it is
inconclusive and must not be reported as visual confirmation. The retail source
remained unchanged.

## Changes and verification

- `native/src/ccparty.asm`: import current HP from byte 214 and maximum HP from
  byte 40.
- `native/src/cchost.asm`: persist direct damage to byte 214 only.
- `native/ccparty-test.ps1` and `native/cchost-test.ps1`: distinct source values
  catch byte swaps or accidental maximum-HP mutation. Also tolerate the observed
  valid CoK combat roll variation while retaining actor, target, damage, and
  result checks.
- `native/gbdok-journal-flow-test.ps1`: assert current-only damage and recovery
  while retaining byte 40.

Passed: `native/cchost-test.ps1 -Headless`, `native/ccparty-test.ps1 -Headless`,
`native/build.ps1 -Target all`, focused `native/gbdok-journal-flow-test.ps1
-Headless`, and the full `native/run-flow-suite.ps1` (**36 PASS / 0 FAIL / 0
SKIP**). The full sweep's sole retail-directory mtime movement was in
`The Dark Queen of Krynn/DOSBOX`; it reported no matching file change. Native
capacity output was refreshed by the all-target build. After committing the
source, the 36-flow sweep was repeated and its clean-source freshness assertion
passed. `pnpm test:corpus` then reported **5,569 passed / 2 failed / 1 skipped**
in 512.36 seconds. A second full corpus run after the DAX fixture and handoff
updates finished with **5,569 passed / 2 failed / 1 skipped** in 526.22 seconds.
Its same two failures are the existing browser export audits:
`test_unconsumed_exports_pinned_exactly` finds three additional unconsumed names
(`COK_CLASS_NAMES`, `COK_RACE_NAMES`, and `raceCodeForDragonlanceRace`), and
`test_barrel_surfaces_reconcile_exactly` finds 1,662 exports versus the pinned
1,655. These overlap the pre-existing dirty browser character-import work and
were not changed here. The corpus also printed the known Unicorn native access
violation diagnostics while pytest continued to its summary.

The full native sweep took approximately 17 minutes. It regenerated
`native/flow-status.json` from native source hash
`c32f94776a2b87f4ca3e43b58008aef28c9bd2f9ee43911117bfb4ce1a78edab`.

## Task 25 DAX production-contract refinement — closed 2026-09-24

`native/gbboot-create-test.ps1 -GbslContractOnly` creates a synthetic ECL1
block 34 under the actual DAX production route, with no child recorder
replacements. The compact control contains `BEFORE`, supported automatic-party
`DAMAGE`, and `AFTER`; the saturated case adds 63 `CLEAR_BOX` events before
those records. The effect transport contains 66 source-ordered records, with
the post-cap `DAMAGE` and `AFTER` preserved. CCFP's saturated output exactly
matches the compact frame. Six copied 409-byte source saves have current and
maximum HP set to 60; CCHOST changes only current HP to 57 in each source save
and GBPR record. All other source bytes remain identical. A subsequent cold
ordinary run removes the GBSL sibling and produces a different frame containing
only its own `AFTER` narration.

Luna ran the focused DOSBox contract and the full `native/gbboot-create-test.ps1`
suite; both passed. The full `native/run-flow-suite.ps1` then passed **36/36**,
with no skips or failures. Its only retail-directory change was a DOSBox
directory mtime, with no matching file change. Evidence from the focused run is
under ignored `native/build/gbsl-contract-evidence-clearbox-20260924-171401`;
the full GBBOOT log is `native/build/gbboot-create-test-full-20260924-171703.log`.
The synthetic fixture proves DAX route orchestration and supported DAMAGE
writeback. It does not close HLIB/DQK saturation, source dice parity, or a retail
event-count measurement; those remain open in task 25.

## Completed bounded task: lossless first narration literal

The bounded plan above has been completed: DoK `ECL1.DAX` block 16's opening
PRINTCLEAR spans source bytes `[60,222)`, with its inline string packed at
`[63,222)`. Its 159 packed bytes decode to 212 characters through CCECL, CCFLOW,
GBSL v2, and CCFP. The isolated fixture still ends at byte 222; the following
retail opcode was not previously modeled. Static analysis now proves `0x1D` is
a zero-operand prompt/input call followed by screen cleanup. The revised next
task and its remaining evidence gaps are recorded below.

The unrelated dirty browser-import work, modified `CLAUDE.md`, and other
pre-existing research edits were present before this work. Stage only
task-owned files when committing.

## Task 32: GBPR identity contract — source/build complete 2026-09-25

GBPR v2 keeps the 16-byte header and 410-byte rows. Header words +12/+14 are
stable title ID (CoK=1, DoK=2, DQK=3) and schema revision 1; the existing flag
continues to describe row layout. CCPARTY only merges a v2 prior roster for an
exact ID/layout match. It refuses ambiguous v1 native high-bit rows and any
nonempty v1 DQK QSV roster before creating/truncating output. CCECL requires an
explicit matching `/ID` for v2 before import; v1 flag 0 retains its legacy CoK
semantics, while v1 compact exposes names and validated shared GBD1 movement
without attributing HP, condition, or XP to a title. DoK XP mutation requires
v2 ID 2. Fresh and cold GBBOOT CCECL tails both carry `/ID`.

CCCOMBAT validates title/layout and exact EOF after the declared rows. It
imports the producer-verified shared GBD1 combat fields for both DoK and DQK;
DoK-only raw-record fallback and attack progression remain gated to ID 2.
CCINV recognizes CoK v2 checkpoints.
CCHOST and direct damage validate v2 identity before writes; DQK can update its
compact GBD1 state without opening DoK `.GAM` sources. Existing DoK damage
journals remain recoverable from their exact embedded preimage, without
rewriting its header. Python CoK checkpoint/learning/party-removal consumers
accept canonical v1 CoK and v2 ID 1.

`tools/test_native_gbpr_identity.py` is the offline source-contract oracle. It
also pins the CCPARTY version word, the compact CCCOMBAT branch, CoK-only
CCINV learning/mutation modes, GBTX identity/layout recovery, and the ID 2 DoK
XP gate. DQK recovery skips GAM/WIZ restoration.
The focused command
`python -m pytest tools/test_native_gbpr_identity.py tools/test_cok_inventory.py tools/test_cok_learning.py -q`
passes 67 tests. `pwsh -NoProfile -File native/build.ps1 -Target engine`
passes; GBBOOT headroom is 130 bytes and CCCOMBAT headroom is 136 bytes, above
their 128-byte minima. The Windows PowerShell 5 entrypoint assembles targets
but cannot generate the capacity manifest because it lacks `SHA256.HashData`;
PowerShell 7 is used for the successful full build. No DOSBox/UI runtime or
`pnpm test:corpus` was run under the current focus constraint.

## Long opening literal: bounded native result — 2026-09-24

The first DoK block-16 `PRINTCLEAR` at decoded `[60,222)` is now carried as
159 packed source bytes and decoded to 212 characters through CCECL, CCFLOW,
GBSL v2, and CCFP. CCFLOW marks its CCECL child through EXEC FCB1; direct
CCECL calls keep their historical inline32 text. Before the loader-table
overlay recorded below, CCECL occupied 65,211 resident bytes, below the
65,213-byte task ceiling, with 69 bytes of headroom; CCFLOW is 54,957 resident
bytes after its DAX TOC buffer was widened
to all 256 possible entries. GBSL v2 has an exact packed-payload extension,
while untagged v1 streams retain their sequential >64 KiB path. CCFP `/W`
pages the first literal as 117+95 characters. A separate 116-column short
`PRINT` prefix followed by a long `PRINT` resumes at that long string's
character zero and reaches its final 95 characters after two Enter presses.

Luna's focusless GameLink pass captured both first-literal frames and RAM
pages, then the three-page separator boundary, with effect/RNG/sidecar and
party/journal state unchanged. The PNG frames are nonblank and distinct, but
some glyph runs appear clipped at horizontal edges; exact 117+95 character
coverage is established by the RAM assertions, not by the screenshots alone.
The v1 control produced a 65,564-byte GBSL
with 1,214 records. The full CCHOST standing suite passed with v2 direct
DAMAGE success and malformed rejections; a near-boundary 65,502-byte v2
sidecar embedded beyond 64 KiB was accepted by its journal reader, and
unmodified production CCHOST restored full roster/source preimages from the
prepared journal. Detailed layout and evidence boundaries are in
[`research/dok-first-printclear-native-transport.md`](research/dok-first-printclear-native-transport.md).

The claim stops at the isolated first literal. `/Z` skips tagged long text,
v14 menu yields use the old 32-character inline prefix, and a saturated tagged
v14 yield rejects. A source-ownership follow-up now changes only packed
character 126 (`T` to `X`) in a private block-16 copy: the first 117-character
page and every pixel match, while the second page changes that RAM character
and exactly 116 pixels within its mapped glyph cell at x160..173/y338..351.
A separate two-entry DAX changes an unexecuted text character in source block
17; both selected-block pages, GBSL and GBEF match the block-16 control.
Across the four variants, the whole 5,750-byte GBEF, including pose, picture,
VM and RNG, is identical, and party/journal state is unchanged. The fixture
still replaces only byte 222 with `EXIT`; retail archives remain read only.
This closes the first-literal source-mutation and unrelated-block isolation
oracles. Static retail-source analysis now proves DoK opcode `1Dh` at offset
222 is zero-operand and calls the prompt "Press button or enter to continue"
through a key-input retry loop, followed by screen cleanup. It is not the
party-strength comparison currently implemented by shared CCECL. The exact
cleanup pixels, cancel-key behavior and indirect state effects remain to be
audited; the native fixture still substitutes `EXIT` there. No full retail
opening or later narration is claimed. GameLink RAM proves exact text, and PNG
pixels prove the chosen glyph; some unrelated horizontal text still appears
clipped in the screenshots.

## `1Dh` source contract audit (pre-implementation) — superseded

The audit below was the source/design work preceding the native patch. Its
remaining implementation list is superseded by the v15 milestone at the end.

Astra's evidence-ranked recommendation is to finish the input/cleanup helper
audit and write a DoK-specific yield/continuation contract. The original handler
advances one byte, passes an empty caption plus the EXEPACK-expanded continue
prompt to `41:005C`, ignores the returned key except for saving it in a local,
then calls `E9:0039` for cleanup. The keyboard path is now source-traced: the
single choice highlights `P`; `P`/`p` and Enter select item 0. Escape is
permitted by the wrapper flag and normalized to item 0 if it reaches the
acceptance block. Static route analysis shows block 16's first `SAVE` at byte
22 sets or preserves `DS:8C4E=3`; decoded intervening handlers do not directly
change it, and state 3 bypasses the context callback that could force retry.
Remaining indirect backend/runtime callees are unclassified, so Escape is
strongly expected to work on the natural block-16 path but is not an absolute
source proof. Other ordinary keys retry. Mouse/controller input, timeouts, and
other callback contexts remain open. The cleanup call is byte-traced to a
40-cell fill of row 24, columns 0..39, with space glyph and color index 0. The
`DS:8C7A` selector dispatches to one of three drawing routines; exact retail
mode mapping and RGB appearance remain open; color index 0 must not be called
black without a palette/backend proof. `DS:43E9` participates in glyph
remapping, not graphics-mode selection. The wrapper calls `882:0058` before
the fill and `882:0034` after it; the first helper and indirect UI state writes
are not fully attributed. No exact-pixel or full input-equivalence claim is
ready. The current yield design target is to hold the ECL PC at byte 223
without changing comparison flags, apply that space-fill/refresh after
acknowledgement, then resume the next `PRINTCLEAR`; this remains unimplemented
and unverified at runtime. `tools/test_dok_1d_prompt_cleanup.py` now pins the
retail START/OVR hashes, unpack metadata, argument bytes, coordinate checks,
pre-draw/post-draw calls, backend dispatch, and per-cell column increment;
its focused offline pass is 4/4.

The existing v14 menu continuation is not reusable as-is: CCECL `resume_kind=2`
restores the menu's `MS` comparison operands, calls `set_cmp_flags`, and writes
the selected value to `MN_DEST_OFF`. The DoK acknowledgement must preserve both
comparison state and ECL memory, so the next native design slice needs a
distinct validated acknowledgement continuation. Preserve the existing
v14/GBMO machinery only as a transport candidate; `DKK.CFG` admission must
remain distinct from the shared `short_opframes` setting.

The native frame selector is not itself a sufficient title selector:
`short_opframes` is enabled by both `DKK.CFG` and `POOL4.CFG`. CCECL's current
short-frame `op_partystrength` path advances correctly without an operand but
compares the supplied party metric against zero and changes comparison flags.
Static routing audit confirms both GBBOOT DoK detection branches require
`DKK.CFG`, fresh and cold tails pass the ECL archive basename, CCFLOW preserves
that token across continuations, and CCECL probes the sibling marker before
loading resume state. CCECL now resets `is_dok` during profile selection and
sets it only after opening `DKK.CFG`; `POOL4.CFG` retains shared short frames
without setting the DoK bit. This can gate DoK's prompt on production routes;
broad native task 32 title identity is not a prerequisite. Cover direct
`D:ECL1.DAX` as a marker-path edge case (the
GBBOOT route does not emit it). Then build a private block-16 fixture that
retains retail byte 222 and continues through the second `PRINTCLEAR`; runtime
acceptance remains pending until it can be run without taking foreground
focus.

For that fixture, require both retail literals to decode in source order, one
prompt between them, and no replay of earlier text or mutation of comparison
state, RNG, or party data across acknowledgement. The source-backed acceptance
set is `P`/`p` and Enter; Escape is strongly expected on the natural block-16
path, with indirect-callee proof and fixture confirmation still pending.
Ordinary unmatched letters must retry. The helper's
observed `C0F7`/`C0F8`/`C095` writes are UI state with
unresolved meanings and are not part of the ECL resume record. Cover
mouse/controller and timeout inputs before claiming full input equivalence.

## DOSBox-X focus-safety continuation — 2026-09-24

Astra traced the recent GameLink path to a shown SDL window: DOSBox-X's GameLink output still calls
`GFX_SetSDLWindowMode`, while the old probe only requested a minimized launch. The GameLink input
path itself does not require foreground focus, but this did not prove startup left the user's active
window alone. Task 60 records the launch issue.

`tools/dosbox_x_debugbox_probe.ps1 -GameLink` now defaults to hidden launch with child-scoped SDL
dummy video/audio drivers, a machine-wide DOSBox-X singleton check, v4 frame readiness, and
GameLink framebuffer capture. Any visible window is rejected; `-ShowGameLinkWindow` explicitly
opts into the former visible mode. The PowerShell parser, 11 related non-runtime tests, and
`git diff --check` pass. No DOSBox-X runtime was launched. Luna checked Windows sessions and found
no separate interactive desktop; the dummy-driver path still needs an isolated runtime pass proving
frame, key, RAM, debugger-console
as applicable, and cleanup behavior. The new launch mode is structurally safer but unverified.

## DoK `1Dh` cleanup and continuation design — 2026-09-24

The exact retail cleanup arguments now resolve to a fill of 40 cells at row 24,
columns 0..39, using space and color index 0. `DS:8C7A` selects among three
source-visible backends; `DS:43E9` participates in glyph remapping. The generic
fill checks only the starting coordinates. It calls `882:0058` before drawing
and `882:0034` after; the first helper's role, full graphics-mode mapping, and
RGB pixel result remain open. `tools/test_dok_1d_prompt_cleanup.py` pins the
retail inputs and relevant call/dispatch bytes (4/4); `tools/test_docs_claims.py`
passes 26/26. At the time of this initial design note, the native engine build
had CCECL at 65,211 resident bytes and only 69 bytes free; the later overlay
update below supersedes that capacity. No DOSBox process was launched. The full corpus
gate remains unrun because its standing native flows invoke DOSBox.

The loader-only DAX/HLIB directory arrays now overlay CCECL's 16,000-byte `blk`
buffer. Local liveness audit found the DAX TOC is consumed into scalar/register
state before compressed input is read, while Gen2 pointer/ID arrays are no longer
referenced after the selected member's offsets and size are resolved. DAX's
maximum 128-entry TOC uses 1,152 bytes; Gen2 pointers use 1,024 bytes and its ID
table starts at `blk+1024`, so their 512-byte range ends at `blk+1536`. This
removes 1,536 bytes of separate table reservation. At this intermediate source
checkpoint the tree retained the separate `is_dok` admission byte and cleared
inherited `FX_HAVE_SIDECAR` after restoring an invocation-local prefix; its
full engine build reported 20,660 emitted and 63,691 resident bytes, with
1,589 bytes of headroom. The later v15 source milestone below supersedes those
build figures. The
table capacities are unchanged. The generated
capacity manifest and documentation claims agree after rebuild.
Current verification: `native/build.ps1 -Target engine` passed;
`tools/test_native_capacity_claims.py` passed 9/9;
`tools/test_docs_claims.py` passed 26/26; and the retail-source contract
verifier passed 4/4. `git diff --check` passed. The standing full corpus gate
was not run because its native flows launch DOSBox and no isolated desktop is
available; the interactive acceptance for the prompt path remains outstanding.

The existing v14 menu continuation cannot carry this acknowledgement unchanged:
it restores menu comparison operands/flags and writes a selected value to VM
memory. CCFLOW also restores unsaturated tagged long-text records to their
32-character prefix before a v14 terminal, rejects sidecar-bearing v14
terminals, and CCHOST rejects v14 with `FX_HAVE_SIDECAR`; CCFP expects GBSL to
be authoritative when that flag is set. The next native task is therefore a
long-text-compatible, identity-checked acknowledgement transport (or separate
ordered narration/ack channels), with a distinct resume path preserving
comparison flags and ECL memory, retaining a DoK-only `DKK.CFG` bit, applying
the row-24 fill, and resuming at PC 223. Prove unsaturated and >64-record
continuations before touching the opening fixture. Mouse/controller and timeout
semantics remain outside the proven keyboard contract. Task 60's GameLink
runtime gate remains open and must not be attempted on the active desktop.

## Cross-component acknowledgement design audit (pre-implementation) — 2026-09-24

This records the design state before the following v15 source milestone; its
implementation checklist is superseded below.

Astra's source review expanded the bounded contract. Reuse the 5,920-byte
v14-shaped prefix and define **v15 as exactly 5,932 bytes**: append `GBRF`, six
raw boolean flag bytes in EQ/NE/LT/GT/LE/GE order, and a zero reserved word.
Validate each flag as 0 or 1. Use explicit subtypes for (a) status-2 DoK
acknowledgement (`1Dh`, one zero-operand event, sentinel destination `FFFFh`,
identity at post-instruction PC 223) and (b) status-4 `HALT_SCRIPT_FULL`
capacity replay. Both preserve menu-state comparison operands and raw flags. A
capacity replay must also be v15; otherwise flags set before event 65 are
already lost before the later acknowledgement can snapshot them. Existing v9
and v14 lengths and behavior stay fixed.

The complete route needs these changes together:

- **CCECL:** emit and validate both v15 subtypes; restore raw flags directly,
  without `set_cmp_flags`; validate and consume exactly one identity-bound
  answer for the acknowledgement, with no ECL memory write. After
  `restore_fx_prefix`, clear only the prior `FX_HAVE_SIDECAR` bit because the
  next GBSX stream belongs to the new invocation. That provenance fix is now in
  source and assembles; interactive acceptance is still open.
- **CCFLOW:** accept exact 5,932-byte v15 terminals and capacity checkpoints,
  preserve that full extent in private replay (currently `write_replay` writes
  5,750 bytes), carry accumulated long-text GBSL v2 through the final
  acknowledgement, and validate its local event against the final sidecar
  record. Keep v14 truncation and rejection behavior unchanged.
- **GBBOOT:** fresh Gen1 already routes through CCFLOW, but status 2 currently
  launches CCMENU directly and a resumed paragraph launches CCECL directly.
  Add a v15-specific presentation path through CCFP, then route its verified
  cold resume through CCFLOW too. Retain the exact source-binding check. GBBOOT
  has only 172 bytes of headroom (44 above its 128-byte floor), so keep its
  dispatch small and place schema/UI work in the other executables.
- **CCFP:** add a distinct acknowledgement mode that pages authoritative GBSL
  v2, accepts P/p and Enter, and tests the strongly expected Escape path, then writes the exact
  18-byte GBMO token and applies the row-24 cleanup before exit. Its existing
  `/A` option selects texture area; do not reuse it. The piece-effect reader
  currently rejects versions above 9 and needs strict v15 acknowledgement
  admission. Preserve ordinary `/W` movement and paging.
- **CCHOST and CCEFX/GBBOOT readers:** explicitly admit v15 acknowledgement
  records plus flagged GBSL through live effect validation and the prepared/
  committed journal route; reject the internal capacity subtype as a host
  terminal. Also update CCEFX's version gate and GBBOOT's effect/GEO readers,
  which currently stop at v9 or v14.

Do not implement the next patch as CCECL-only. Acceptance must cover unsaturated
full narration; >64 records with compare and direct-set boolean flags set before
the boundary; malformed v15 and missing/stale GBSL rejection before mutation;
exactly-once acknowledgement; unchanged RNG, party, memory, and six flags;
cleanup; then the second retail `PRINTCLEAR` through CCFLOW. Source-level work
may continue now, but DOSBox acceptance still waits for an isolated desktop or
session.

## v15 acknowledgement bridge source milestone — 2026-09-24

The cross-component design above is now implemented in the native sources and
assembles. The new source path spans CCECL, CCFLOW, GBBOOT, CCFP, CCHOST's live
and journal readers, and CCEFX's version gate:

- CCECL validates the exact 5,932-byte v15 format and raw boolean flag suffix,
  emits the DoK `1Dh` acknowledgement identity at PC 223, validates a one-shot
  GBMO response without writing ECL memory, and restores raw flags instead of
  deriving them from comparison operands. Capacity replay also uses v15 so flags
  survive a saturated script window.
- CCFLOW carries the full v15 extent through replay, accumulates GBSL v2, and
  validates the terminal event against the final published sidecar record.
- GBBOOT dispatches status-2 v15 through CCFP and returns an acknowledged
  continuation through CCFLOW, retaining the existing source binding check.
- CCFP accepts only the v15 acknowledgement plus matching GBSL, displays the
  accumulated text, writes the exact 18-byte GBMO v2 answer, and attempts the
  row-24 cleanup. After validating the handoff it probes INT 33h, then hides
  the mouse cursor around the BIOS fill and restores it when a driver is
  present. `P`/`p`, Enter, and Escape are implemented; input behavior is not
  runtime-confirmed.
- CCHOST admits the v15 acknowledgement for live damage and journal recovery,
  checks the suffix and sidecar relationship, and rejects the internal
  capacity-checkpoint subtype as a host terminal. CCEFX recognizes version 15.
- Offline disassembly resolves the cleanup helpers as a mouse-cursor guard:
  the table at `DS:838C` selects INT 33h, functions 0/1/2 probe, show, and hide.
  CCFP now probes after validating the acknowledgement/sidecar, hides the cursor
  around its row-24 BIOS fill, and shows it afterward only when a driver reports
  present. The retail-byte test pins the DS setup, function table, probe, and
  helper calls; runtime driver behavior remains unverified.

Verification so far: `native/build.ps1 -Target engine` passed on the current
source tree. It reports GBBOOT 64,894 emitted / 65,150 resident / 130 headroom;
CCECL 21,548 / 64,581 / 699; CCFLOW 4,679 / 55,442 / 9,838; CCFP 20,655 /
57,309 / 7,971; and CCHOST 22,985 / 23,241 / 42,039. The source-bound capacity
gate, `tools/test_dok_1d_prompt_cleanup.py` (5/5), the new
`tools/test_native_fx_v15_source_contract.py` (5/5), `tools/test_docs_claims.py`,
`tools/test_ecl_gen2_dialect_drift.py` (66/66), and `git diff --check` passed.
At that stage the CCECL capacity pins were 21,548 emitted / 64,581 resident /
699 headroom. The subsequent numeric-input implementation rebuild below is the
current measurement.

These are source/build results only. No DOSBox session was launched, at the
user's request to avoid taking desktop focus. The opening fixture that continues
from the real byte-222 `1Dh` through the next `PRINTCLEAR` is still required, as
are the saturation, malformed/stale sidecar, exactly-once, state-preservation,
key retry/acceptance, and cleanup runtime assertions. The source-wiring test
pins required assembly branches but does not execute the new native bridge.
The bridge is not closed and no runtime parity claim is made.

## HLIB saturation continuation boundary — offline source trace — 2026-09-24

The first source pass confirms that the HLIB limitation is at the host boundary,
not the HLIB byte reader. GBBOOT selects CCFLOW only for `eng_dax_gen1`; other
engines select direct CCECL (`native/src/gbboot.asm`, `.run_ecl`). CCFLOW's
saturation loop repeatedly runs CCECL, appends each fixed GBSX chunk to GBSL,
and privately resumes at the first unconsumed opcode. It does not return control
to GBBOOT, run CCHOST, or present CCFP between chunks
(`native/src/ccflow.asm`, `.run`/`write_replay`).

GBBOOT's host work occurs after its selected child returns: it binds and reads
the effect, applies DAMAGE, and enters `mutation_bridge` before dispatching the
VM yield (`native/src/gbboot.asm`, `.ecl_return`). `mutation_bridge` is a CoK-
only DESTROY_ITEMS/GBHD-reason-6 path, so it does not provide generic HLIB host
mediation (`native/src/cokhost.inc`). Thus routing DQK through CCFLOW would defer
all host work until a terminal CCECL result. The recorded DQK area-2 run stayed
live beyond 384 accumulated records and 180 seconds; current evidence does not
identify which intervening effect requires host feedback or whether a finite
segment boundary can be proven from the retail script.

The real retail ECL.GLB id table maps area 2 to member 2. Running the existing
Gen2 boundary walker (`tools/dqk_ecl_combat_scan.py`) over that 1,434-byte block
finds 205 distinct reachable instruction offsets: 13 `INPUT_NUMBER`, 29
`PRINT`, 29 `PRINTCLEAR`, 25 `PRINT_RETURN`, 11 `SAVE_TABLE`, one `LOAD_FILES`,
and one `COMBAT`, among the remaining instructions. These are unique static
boundaries across the five header entries, not dynamic execution counts and not
an explanation of the 384-record runtime window. They do establish that area 2
contains substantial interactive input and source-state work around its map
and combat handoffs.

This census exposed a source-level numeric-input mismatch on the actual DQK
area-2 route: at vaddr `0x84D0`, `INPUT_NUMBER #3,[0x00C1]` is followed by
`COMPARE #750,[0x00C1]`, `IF_LE`, and `RETURN`; the under-threshold arm reads a
table and loops back to vaddr `0x8485`. CCECL had been writing the response
through operand 1, so that route could not observe a response written to the
declared cell. The variable-editor loop at `0x8485` includes two
`INPUT_NUMBER`s and returns only when the offset is at least 750. However, the
native event mask also records its PRINT/PRINTCLEAR/PRINT_RETURN instructions;
the full editing arm has 13 recordable instructions per pass, not three.
Furthermore, native DQK `PARTY_SURPRISE` previously continued with the fixed
`/C` choice. The current source now yields the prompt and Yes/No choices through
CCMENU under `/!`, then restores the answer across a cold CCECL resume; headless
`/C` remains deterministic. A synthetic continuation fixture covers the two
answers and preservation of `LE`/`GE`, but its DOSBox run is deferred. Therefore
six full 64-record chunks do not imply 128 editing passes, and the old input transcript
or retained effects would be needed to connect that run to this loop. The old
operand-order bug still meant numeric replies were written through `#3` instead
of `[0x00C1]` / `[0x00C3]`, so it could prevent the documented `>=750` exit.
The native numeric-input fix addresses that separate source mismatch. The
`GETTABLE` / `SAVE_TABLE` source audit found an additional width mismatch and
confirmed the address asymmetry. DQK's `GETTABLE` handler at ECL code `0x03245A`
narrows its offset to one byte before adding it to the base. `SAVE_TABLE` at
`0x0324C9` retains the full word offset and passes the base operand's type to
writer `25a4:06d2` (file `0x040992`), which stores one byte for types 0/1 and a
word for types 2/3. The editor uses a code-1 base, so the 16-bit input is
truncated to a byte when saved. Native Gen2 now applies that width rule while
DAX keeps its existing word behavior.

For the editor base `1`, the table accesses therefore resolve as follows:
`GETTABLE` offsets 0, 255, 256, and 749 address 1, 256, 1, and 238 because its
offset wraps to a byte; its offset 750 is not reached because the preceding
branch exits. `SAVE_TABLE` uses full offsets and addresses 1, 256, 257, and 750
for offsets 0, 255, 256, and 749. The final 750 address is not reached for the
same reason. A focused native fixture now covers byte-base truncation and
word-base preservation; it still needs its DOSBox-backed run. The source audit
also leaves the reported 384-record window unexplained.

The HLIB source trace has not identified the exact historical source of the
384-record run. The area-2 `PARTY_SURPRISE` source path is now mapped to its
operandless Yes/No prompt and `IF_EQ`/`IF_NE` branches; the native `/!` bridge
implements that path with a cold-resume fixture whose DOSBox run remains
deferred. Continue mapping the host effects between CCECL chunks. Retain the
direct diagnostic route; static checks do not prove native runtime continuation
correctness.

## DQK `INPUT_NUMBER` contract correction — source and build — 2026-09-24

The next actionable defect was in the already-shipped numeric menu path.
Retail DQK `ECL.GLB` member 2 contains `0F 00 03 03 C1 00` at vaddr `0x84D0`:
operand 1 is `#3`, operand 2 is the word cell `[0x00C1]`. The retail parser
stores operand 2 in slot 2 (`[AE6C]/[B187]` plus type `[B217]`); handler
`0x04313c` passes that address to `0x040992`, which stores a two-byte result
because operand 2 has code 3. It does not read operand 1. The immediately
following source compares `[0x00C1]` with 750. This proves operand 2 is the
destination and that 750 fits the source cell.

CCECL now records/uses operand 2 for `INPUT_NUMBER`. In `/!`, it yields a v14
numeric response with `GBMN.option_count=0`, a strict free-number marker; CCMENU
accepts a decimal word through 65535 without generating an enumerated list, and
CCECL validates and writes that answer on cold resume. The CCECL effects fixture
seeds 750, while the CCMENU and CCECL continuation fixtures request 750 and
check it survives the outcome path. The DQK contract, source dispatch note,
task registry, and native README now describe the corrected operand order and
bridge shape.

The existing browser VM was exercised against the real retail ECL.GLB member
by a new `dqkEvents.test.ts` case: it decodes operand 2 as code-3 cell `00C1`,
resumes with 750, follows the threshold branch, exits, and retains 750 in the
cell. `pnpm --filter @goldbox/engine test -- dqkEvents.test.ts` passed 11/11.
This verifies the source route in the TypeScript oracle; it does not execute
CCECL or CCMENU.

`native/build.ps1 -Target engine` passes after the assembly edits: GBBOOT is
65,150 resident / 130 headroom, CCECL 64,640 / 640, and CCMENU 9,188 resident.
The changed DOSBox-backed tests were not launched to avoid taking foreground
focus; therefore the updated native runtime assertions remain unverified. This
is a source/build and TypeScript-oracle result, not a native runtime close.
Continue the open Task 25 HLIB continuation trace offline; the native numeric
continuation still needs an isolated focus-safe runtime pass before Task 18 can
be closed.

## DQK prompt and table-write offline review — 2026-09-25

An Astra source review found and corrected four issues before accepting the
offline implementation: the opcode-22 reserved word was being zeroed after its
`LE`/`GE` snapshot; the cold-resume GBMT count path rejected ordinary horizontal
menus; the synthetic party prompt was a raw Gen1 block rather than a Gen2
container; and `SAVE_TABLE` truncated the computed address instead of the stored
value. The menu path now preserves the flag bits, validates existing menu text
counts, and builds a minimal HLIB fixture with a 20-byte Gen2 block header.
`SAVE_TABLE` keeps the full base-plus-offset address and truncates the value for
Gen2 byte-width bases. The new offline source-contract test pins these rules and
the fixture's dialect selection and the current HLIB route gate; 45
source-contract/dialect tests pass, the
PowerShell fixture parses, `git diff --check` passes, and the full engine build
passes. CCECL now measures 22,173 emitted / 65,212 resident / 68 bytes free;
the capacity-claim gate passes 9 tests.

The cold-resume fixture itself has not been executed. Its DOSBox run remains
deferred to avoid taking desktop focus, so native prompt rendering, Y/N input,
flag restoration and table-write behavior are not yet runtime-verified. The
HLIB saturation continuation question remains open and is the next source-led
task.

## Task 25 HLIB capacity-to-input boundary — source contract — 2026-09-25

A second source pass narrows the continuation design. `GBBOOT` intentionally
uses CCFLOW only for Gen1 DAX (`gbboot.asm`, `.run_ecl`); HLIB stays on direct
CCECL. CCFLOW privately consumes status-4 capacity checkpoints, appends each
64-record `GBSX` chunk to a GBSL v1 stream, and cold-resumes the first unconsumed
opcode. Its terminal v15 status-2 path is still hard-coded to DoK `0x1d`:
CCFLOW requires that acknowledgement to be the final GBSL record, CCHOST accepts
only that v15 acknowledgement envelope with a sidecar, and CCFP renders the
sidecar then emits the acknowledgement token. The current GBSL writer emits
version 1 with fixed 54-byte rows.

At the time of this source pass, two incompatible edges remained. First, CCECL
emitted raw-flag v15 capacity records only when `is_dok` was set, so DQK
status-4 replay remained v9 and lost all six comparison flags after
`vm_start_block`. Second, a DQK menu
after a privately accumulated chunk is terminal v14; CCFLOW can mark the v14
record as sidecar-backed, but CCHOST rejects any sidecar flag on an exact 5,920-
byte v14 effect. The CCFP v15 UI also requires `GBMN.flags=2` and opcode `0x1d`,
so it cannot yet present accumulated narration plus a DQK choice. GBBOOT's
existing status-2 path chooses CCFP for v15 and CCMENU for v14.

The evidence-backed implementation direction is to carry DQK capacity and
interactive terminal state through the existing v15 envelope: retain raw
`GBRF` flags across each private replay; validate the terminal pending event
against the last GBSL row; apply supported host effects once before presentation;
present accumulated narration before the pending prompt; then consume one
identity-bound GBMO answer and cold-resume through CCFLOW. This avoids publishing
a sidecar-backed v14 record. CCFP and CCECL still need a defined division of
work for showing the GBSL prefix and accepting Yes/No or numeric input. CCECL
then had 68 bytes of resident headroom, so adding generalized terminal v15
menu/outcome handling required reclaiming or moving code first.

The current source suggests a narrower division than the open question first
implied. CCFP already opens and pages the authoritative GBSL stream in order;
its acknowledgement entry point then blocks for keys and publishes GBMO. The
limitation is that this entry point and its validator are DoK-1Dh-specific,
including the requirement that the final sidecar row is exactly that event.
The least-cross-cutting next design to prototype is therefore: CCECL publishes
a validated pending GBMN with its v15 raw flags; CCFLOW owns capacity replay
and binds the terminal event to the final accumulated GBSL row; GBBOOT keeps
host-effect application before input dispatch; and CCFP owns the combined
ordered-text plus pending-choice UI and emits the existing identity-bound GBMO
format. For `PARTY_SURPRISE`, CCFP must suppress the duplicate leading
PRINTCLEAR from the GBSL prefix when that same text is carried in GBMT, then
show it once immediately before the choices. For `INPUT_NUMBER`, CCFP shows
the GBSL prompt and collects the numeric value; GBMT has no prompt segment.
This is a source-backed ownership proposal, not an implementation or runtime
proof. It still depends on reclaiming CCECL space before adding generalized
terminal v15 menu/outcome handling.

The new source-contract test pins the present route and rejects accidental
enabling of HLIB CCFLOW before these edges are implemented. The required
acceptance set remains capacity immediately before and after `PARTY_SURPRISE`
and `INPUT_NUMBER`, source-ordered text, exactly-once host state, all six flags,
validated pending identity, and one-shot answer consumption. This source
contract is not evidence for the unexplained historical 384-record measurement
or for runtime continuation behavior.

CCECL now allocates the compressed DAX input separately from the 16,000-byte
decoded/member buffer. A read-only census of the installed corpus found 30
unique DOS DAX ECL archives / 235 blocks (maximum 13,353 raw, 13,713
compressed), one unique DQK HLIB ECL archive / 48 members (maximum 12,000),
and Matrix Cubed ECL1 (9,216 raw, 9,644 compressed). `DAXCOMP_CAP=14,500`
retains 787 bytes above that compressed peak while recovering 1,500 resident
bytes. The current raw/member buffer remains 16,000. This is measured against
available assets, including the read-only Matrix Cubed 7z member; it does not
claim coverage for unheld Gold Box distributions.

## Gen2 raw-flag capacity checkpoint — source/build — 2026-09-25

CCECL's v15 capacity writer and v15 status-4 reader now admit Gen2 profiles by
`is_gen2` instead of restricting the checkpoint to `is_dok`. This preserves
the existing six-byte `GBRF` flag snapshot across a DQK HLIB capacity halt and
resume. With the measured DAX input-buffer reduction, CCECL emits 22,249 bytes
and measures 63,788 / 65,280 resident bytes, leaving 1,492 bytes free. CCHOST
measures 23,681 emitted / 23,937 resident with 41,343 bytes free. The
engine-only native build passed and the source-bound capacity manifest was
regenerated at native source hash
`83d8a2f21b698443c558f2eb50a7ac7a42db712d065ea16c9cebc40d8b4c305b`.
Targeted DQK source/dialect/v15/capacity checks pass (47 tests).

CCHOST now admits a v15 status-4 effect only after checking the exact 5,932-byte
extent, absence of `FX_HAVE_SIDECAR`, empty menu and text extensions, canonical
GBMS flags, and six canonical GBRF bytes. It then applies the same fixed GBSX
event path as the previous Gen2 v9 capacity effect. This preserves the direct
host path while keeping private CCFLOW replay chunks from becoming published
sidecars; it does not itself resume the VM.

This does not route HLIB through CCFLOW or solve terminal-menu sidecar
ownership: GBBOOT still keeps HLIB on direct CCECL, and v15 terminal input
remains DoK-ack-specific. The updated contract test keeps those boundaries
separate. Runtime behavior remains unverified because this change was built
and checked statically only.

## Gen2 direct menu v15 round trip — source/build — 2026-09-25

Gen2 interactive menus now publish the same v15 raw-flag suffix as capacity
checkpoints. CCECL distinguishes the DoK `0x1d` acknowledgement from ordinary
v15 `GBMN` input on resume: the acknowledgement keeps its strict path, while
other v15 menus reuse `read_resume_menu` and validate `GBRF` before restoring
all six flags. `PARTY_SURPRISE` applies its Yes/No result after restoring the
raw flags. CCMENU accepts either exact v14 or exact non-sidecar v15 input and
writes the corresponding fixed length; GBBOOT selects CCFP only when the
published sidecar bit is present. CCHOST validates the v15 menu envelope and
pending event index before applying direct fixed-event effects.

This closes the direct Gen2 menu path only. CCFLOW now validates ordinary v15
Gen2 pending menus as well as the DoK acknowledgement. For an ordinary menu,
it returns the direct effect unchanged when there is no accumulated sidecar or
referenced text; otherwise it appends the terminal chunk and checks all 20
bytes of the pending event against the final GBSL event before publishing the
sidecar bit. The acknowledgement keeps its strict `0x1d`/zero-operand shape
check and also matches the full 20-byte event. The v15 capacity recognizer
rejects incoming `FX_HAVE_SIDECAR`, malformed `GBMS`, noncanonical flags, and
nonempty menu/text tails before replay or terminal handling; the source-contract
test pins these rules.
CCFP now accepts sidecar-backed v15 `PARTY_SURPRISE` and `INPUT_NUMBER`
terminals, pages their ordered GBSL narration, displays the party prompt once,
and writes an identity-bound GBMO answer. Numeric answers are bounded by the
pending event; unsupported accumulated-menu opcodes still reject. GBBOOT
continues to keep HLIB off CCFLOW, so these pieces are not yet connected on the
production HLIB route. The engine build passes with CCECL at 22,249 emitted /
63,788 resident / 1,492 bytes free, CCFLOW at 5,052 emitted / 55,815 resident,
and CCFP at 21,719 emitted / 58,373 resident / 6,907 bytes free. The latest
native source hash is
`3a1e0d9323f3cb0f92fab0a34fd39df82619511db940676cadd6ba954a98ba98`. Targeted
DQK source/dialect/v15/capacity/readme checks pass (88 tests). No DOSBox runtime
run was made.

## CCFP pending-menu source contract — 2026-09-25

Astra's static review confirmed that the current CCFP implementation corrects
the two earlier defects: `INPUT_NUMBER` compares the pending destination with
GBSX operand 2 at `[si+6]` (operand 1 is prompt metadata), and the pending
prompt is copied before paging/mode changes and printed in text mode before
numeric input or party choices. `tools/test_native_fx_v15_source_contract.py`
now pins both operand ordering and prompt preservation/redraw order, including
the fallback GBMT party caption. This test change does not provide visual or
input evidence.

The engine-only build passes. CCECL measures 22,267 emitted / 63,806 resident
with 1,474 bytes free; CCFLOW 5,052 emitted / 55,815 resident; CCFP 21,933
emitted / 58,587 resident with 6,693 bytes free. The native source hash is
`57139894f2ea16de781572accb156e0e3188449a0a41d0adc55ede52629f87b6`.
Focused CCFP v15, DQK source-contract and docs-claim checks pass (42 tests).
`git diff --check` passes. No DOSBox or fixture was launched; prompt visibility,
interactive input, HLIB production routing, cold resume and exactly-once host
effects remain unverified at runtime. The next source-led item remains Task 25's
HLIB capacity-to-input ownership boundary, followed by connecting the route
only when that boundary is established.

## Task 25 DQK area-2 input-loop trace — static only — 2026-09-25

The retail DQK `ECL.GLB` static walker was used to inspect area 2 at `0x8485`.
The reachable route is `GOSUB 0x8485` from `0x8041`; the editor arm asks
`PARTY_SURPRISE` at `0x84A6`, then starts the offset/value loop. Each pass asks
for an offset with `INPUT_NUMBER #3,[0x00C1]`, returns when that value is at
least 750, reads the selected table byte, asks for the replacement with
`INPUT_NUMBER #3,[0x00C3]`, executes `SAVE_TABLE`, then jumps back to `0x8485`.
The loop's only script-side data mutation is that table write into the ECL
state; its other work is prompt/input and narration. The separate wall setup
subroutine at `0x8545` contains a `HORIZONTAL_MENU`, followed by `ADD`,
`LOAD_FILES`, and `RETURN` after the selection resumes.

This narrows the source ownership question: the editor loop itself has no
combat, party-damage, item, or `LOAD_FILES` host operation between numeric
prompts, so it supplies no source evidence that CCFLOW must return to GBBOOT
between those loop passes. It does not establish how the historical six-chunk
384-record run was driven, whether other DQK HLIB areas have host effects before
a terminal prompt, or whether the native `/!` bridge reproduces the retail
interaction. The scanner's 205 count is reachable instruction offsets across
all five member header entries, not a dynamic loop count. Continue with a
source inventory of host-effect opcodes reachable before terminal yields in
the relevant HLIB paths; keep runtime checks deferred until an isolated desktop
is available. The static archive-read command was:

```powershell
python tools/dqk_ecl_combat_scan.py --inspect-area 2 --inspect-vaddr 0x8485 --inspect-context 28
```

## Task 25 one-chunk post-capacity read scan — static — 2026-09-25

Extended the invocation walker with `--follow-capacity`. It follows one full
64-event CCFLOW private replay from each capacity boundary, preserving the
unconsumed instruction, selected entry, VM call stack, and pending-DAMAGE
marker, then stops at the next capacity boundary or modeled terminal yield.
Across all 47 DQK area roots the scan visited 8,538,659 abstract states with no
state-cap truncation, reported 10,087 distinct area-root capacity sites, eight
unresolved/dynamic NEWECL sites, and 891 area-root/member/instruction
combinations where a party-seed reader was reachable after capacity on an
abstract route that had already encountered DAMAGE. Candidate inventory is
now across the pre-capacity and one-replay chunks: LOAD_FILES 47/33 roots;
TREASURE 173/32; CALL 338/42; DAMAGE 58/23; SAVE_TABLE 253/42; ADD_NPC 13/6;
LOAD_PIECES 108/25; PROGRAM 17/9; SPELL 0/0. In each pair, the first number
is area-root/member/instruction combinations and the second is roots.

The marker is a reachability union, not a concrete path correlation: branch
conditions and ON selectors remain overapproximated, all five header entries
are unioned, and a reported reader is not proof its inputs depend on the
deferred DAMAGE. Only party-seed readers are currently classified; this pass
does not cover map/resource reads or establish that any of these DQK routes
actually resumes through CCFLOW. The native production route remains direct
CCECL. No DOSBox or fixture was launched. The next review should source-trace a
reported root to determine whether DAMAGE and the reader coexist on a realizable
route before making any host-ordering change.

The updated synthetic controls verify both that DAMAGE can remain pending to a
reader in the single replay and that the walker stops before a reader at the
second full-chunk boundary. Focused Python gates pass (11 tests across the
invocation and ECL capacity scanners), as do `tools/test_docs_claims.py`,
`tools/test_native_capacity_claims.py`, and `native/build.ps1 -Target engine`.
The build reports GBBOOT 65,150 / 130 bytes headroom, CCECL 63,806 / 1,474,
CCFLOW 55,815, CCHOST 23,937, and CCFP 58,587 / 6,693. `git diff --check`
passes with the repository's existing LF-to-CRLF warnings. No interactive
runtime was opened.

The next source trace narrowed area root 23. In the unseeded union, only header
slot 1 reports post-capacity party-reader pairs (913,638 states, 142 sites);
slots 0, 2, 3, and 4 report none. Slot 1 enters member 13 at `0x8323`. The
branch to the pit narration at `0x950c` derives selector 7 from the low seven
bits of cell descriptor `0x002d` being 8; that path reaches DAMAGE at `0x9682`
and then `NEWECL #22`. No instruction on that segment writes `0x002d`, and
CCECL's chain transition retains sparse memory. Area 22 slot 1 enters member 12
at `0x829e`; its same descriptor value 8 selects ON_GOTO entry 7, target
`0x9894 EXIT`. The other tempting reader at `0x8b6e` is entry 1, and `0x9911`
is behind the selected EXIT. Thus the `0x9682` chain does not reach those
readers, and this selected route has no capacity boundary.

Added `--entry-slot` and `--seed-cell-descriptor` diagnostics to the walker.
The optional tracker carries the descriptor and the `0x009b`/`0x00bf` selector
temporaries through AND, COMPARE, SUBTRACT, SAVE, and valid ON_GOTO/ON_GOSUB
dispatch; tests pin IF polarity and selector dispatch against CCECL. For root
23 slot 1, sampled descriptors 4, 7, 8, 12, 17, 113, 114, 116, and 117 all
finish without a capacity boundary or post-capacity reader. Values 8 and 12
reach the `0x9682` DAMAGE site and then no seeded reader before terminal return.
Descriptor 41 instead takes the invalid-selector fallthrough at `0x83a4`; its
walk widens back to the original 1,211 capacity sites and 142 reader pairs.
That route increments the `0x013d` step counter and depends on other VM memory
the tracker does not currently model. This is a bounded diagnostic, not a
whole-memory symbolic execution, so it retires the descriptor-8/12 path only.

Area 5 also illustrates why the original pairs need tracing: its `DAMAGE` at
`0x8704` proceeds through narration to an `EXIT` at `0x874d`, while later
`PARTYSTRENGTH` sites lie elsewhere in the area. The next source target is to
trace area 23's descriptor-41 fallthrough around the `0x013d` loop, establish
the host-supplied starting value and loop exit conditions, then continue through
the remaining DAMAGE sites before selecting another root.

## Task 25 DQK HLIB pre-yield candidate inventory — static — 2026-09-25

Added `tools/dqk_ecl_invocation_scan.py` to extend the earlier per-block walk
across literal `NEWECL` IDs. It preserves the selected header entry across a
chain, resets the GOSUB stack on each new block as `CCECL.vm_start_block`
does, models `GOSUB`/`RETURN` and `ON_GOTO`/`ON_GOSUB`, and stops at the
Gen2 interactive, combat, exit, and empty-return boundaries. A synthetic
contract covers local return followed by a chain and confirms that the chain
starts at the corresponding header entry.

The walker also models CCECL's exact 64-record `script_event_mask`: it yields
before executing the next recordable opcode after the 64th event, while
non-recorded state operations can still execute before that boundary. A source
contract compares the walker's mask against the bytes in `ccecl.asm`. Across
all 47 area roots and the union of their five header entries, the walk visited
3,147,916 abstract states with no state-cap truncation, found 9,977 distinct
area-root capacity-boundary sites, and reported eight dynamic or unresolved
chain sites. Candidate counts before the first capacity or terminal boundary
are area-root/member/instruction combinations, not unique retail opcodes or
execution counts: LOAD_FILES 47 across 33 roots; TREASURE 173/32; CALL 337/44;
DAMAGE 58/23; SAVE_TABLE 253/41; ADD_NPC 13/6; LOAD_PIECES 108/25; PROGRAM
17/9; SPELL 0/0. `SAVE_TABLE` is included as a VM-state control, not a host
mutation. Root area 4 has no abstract path to a capacity boundary before a
modeled terminal yield; area 2's editor input loop likewise reaches its first
interactive boundary without saturation. The area-16 SPELL at `0xA90A` remains
beyond a prior `HORIZONTAL_MENU`, so it is excluded from this pre-first-yield
inventory. Roots with at least one capacity boundary are 5, 7, 14, 15, 16,
22, 23, 26, 28, 30, 31, 32, 34, 35, 36, 41, 42, 43, 46, 47, 48, 49, 50, 58,
59, 60, 61, 62, 63, 65, and 66. Eighteen of these roots also have a reachable
DAMAGE candidate before their first modeled boundary; that is an abstract
path-site overlap, not proof that CCECL applies DAMAGE before each halt.

This is a conservative per-chunk reachability inventory, not proof of a
concrete route. It overapproximates memory-dependent branches and selector
values, unions all five header entries rather than reproducing one specific
GBBOOT invocation mode, and does not simulate CCFLOW resuming after a capacity
chunk or after an interactive answer. Dynamic `NEWECL` operands cannot be
followed. It therefore does not establish which candidate's deferred host
effect is consumed, whether later script logic depends on it, or how the
historical six-chunk 384-record run was produced. No DOSBox or fixture was
launched.

## Task 25 candidate consumer map — static source follow-up — 2026-09-25

| Opcode | CCECL effect/state | Consumer found in the current native route |
| --- | --- | --- |
| `DAMAGE` | One GBSX event with five operands and selected-member context. | GBBOOT scans/applies supported damage after the CCECL child returns; for a published sidecar it applies the accumulated GBSL records at the terminal return. CCHOST owns the DoK /D path, while GBBOOT applies DQK damage in-process. CCFLOW's private capacity replay does not return to GBBOOT between chunks. This is the clearest deferred host mutation. |
| `LOAD_FILES` | Writes the fixed GBEF files/geo prefix; it is not a GBSX record. | GBBOOT reads the prefix after the child returns to select `mapid` and HLIB wall set before map/presentation dispatch. |
| `ADD_NPC` | Appends id/morale rows to the fixed GBEF NPC prefix and carries its count across resume. | GBBOOT, CCHOST, and CCFP have no gameplay reader for this prefix. CCEFX prints it diagnostically; that is not NPC application. |
| Gen2 `LOAD_PIECES` | Routes to `op_script_effect` and is recorded in GBSX; it does not set the Gen1 `FX_HAVE_PIECES` prefix fields. | GBBOOT and CCFP loaders consume only the fixed prefix flag/resolved wall-set fields. No GBSX consumer for this event was found, so Gen2 wall switching remains unestablished. |
| `TREASURE`, most `CALL`, `PROGRAM` | Record one GBSX event. `CALL` also has a few CCECL-local modeled actions for known routine ids. | CCFP builds text pages and GBBOOT schedules picture events; neither applies these gameplay effects. CCEFX prints records diagnostically. No gameplay consumer in GBBOOT/CCHOST/CCFP was found; `CALL` is only partially modeled inside CCECL. |
| `SAVE_TABLE`, `SPELL` | Write their value/result destinations into CCECL sparse memory; neither is a GBSX event. | The sparse state is preserved through chains and continuation. No external host mutation is implied. `SPELL` does not appear before a first modeled yield in the corpus scan. |

This map confirms that `DAMAGE` is the only candidate currently proven to
change party state after CCECL returns. `LOAD_FILES` changes the pending map
selection consumed after return, while `ADD_NPC`, Gen2 `LOAD_PIECES`, and the
record-only gameplay effects lack a complete native consumer. CCEFX's printer
is diagnostic, and CCFP's event walker handles text and picture presentation;
GBBOOT owns pre-combat picture scheduling. A private CCFLOW replay preserves
CCECL continuation state but cannot apply GBBOOT's supported DAMAGE policy
between chunks. Static source has not yet shown whether a DQK route reads
host-owned party/map state after such a deferred event and before its eventual
terminal return. The next concrete slice is a chain-aware scan from a capacity
halt through the next terminal yield, marking host-state readers
(`LOAD_CHARACTER`, party checks/strength, and map-dependent operations) after
each deferred candidate. This is still static work; keep interactive DOSBox
acceptance deferred until it will not take focus.

The first reader-source pass narrows that query but does not close it:
`LOAD_CHARACTER` checks the seeded party count and sets the selected-member
index; `CHECKPARTY` reads supplied affect/movement/thief seeds; `PARTYSTRENGTH`
returns the supplied strength value; `FIND_ITEM` and `SPELL` read their
provided inventory/spell seeds. The current CCECL source has no current-HP
field or opcode read of that field, so no implemented ECL operation is shown
reading HP that a deferred DAMAGE could have changed. This does not establish
retail parity for unsupported CALL ids, condition semantics, map/resource
dependencies, or a capacity-resumed DQK route. The next scanner pass should
carry a `DAMAGE pending` marker across CCFLOW private replay and report these
seeded reads plus map-dependent operations before the first terminal return.

Focused verification: `python -m pytest tools/test_dqk_ecl_invocation_scan.py
tools/test_ecl_menu_capacity_scans.py -q` (6 passed),
`python tools/test_docs_claims.py` (exit 0), and `git diff --check` (exit 0,
with existing LF-to-CRLF working-copy warnings). `python
tools/dqk_ecl_invocation_scan.py` completed over the installed DQK ECL.GLB
without hitting its state cap.

## Task 25 constrained route follow-up — static only — 2026-09-25

The seeded tracker now initializes fresh sparse counters `0x013d` and `0x013e`
to zero, matching `vm_reset_all` plus `mem_get`'s absent-cell result, and
preserves them across CCECL direct `CALL #1/#2` (these handlers record an
event and do not write VM memory). Its synthetic control checks that the
counter makes a following DAMAGE branch unreachable while the CALL event
remains a candidate. Exhausting all 128 low-seven-bit cell descriptors across
all five entry slots for area root 23 removes the former capacity/reader union:
all slots total 18,476 states, with zero capacity boundaries, zero
post-capacity DAMAGE-reader sites, and no capped walk. This supersedes the
earlier descriptor-41 follow-up recommendation for root 23 under the modeled
fresh-counter and known-operator rules; arbitrary VM state is still not fully
symbolic.

The next constrained candidate is area root 22, slot 1, cell descriptor 6.
The source path is `0x829e` through `ON_GOTO 0x82e3` selector 5 to `0x9059`,
then `PARTYSTRENGTH` and literal `NEWECL #5`. The selected descriptor is
preserved into area 5 slot 1. There, the entry at `0x8847` immediately reads
`0x009d`, then later derives route selectors from host-supplied position
words `0x0111/0x0112`, cooldown `0x0097`, and scratch/table state. Tracking
only the descriptor, selector temporaries, and fresh counters still leaves
296,013 abstract states in root 22 (576 capacity sites and eight
post-capacity DAMAGE-reader sites); area root 5 reports 303,951 states (616
capacity sites and the same eight reader sites). The candidate DAMAGE sites
are member 39 `0xa195` and member 40 `0x9ecc`; the readers are member 40
`0x9f38`, `0x9fb5`, `0xa047`, `0xa0b3`, `0xa11c`, `0xa1c6`, `0xa200`, and
`0xa239`. These remain an overapproximated union: no single feasible path has
been demonstrated, and the area-5 header entry alone does not establish the
host position/cooldown values. The related `0x9ecc` route enters the ending
narration before its readers; that source order is not enough to prove it is
the route reached from area 22.

No DOSBox or runtime fixture was launched. The next static step is to recover
the position/cooldown and relevant table-value constraints for the area-22
to-area-5 chain, then test whether any capacity, DAMAGE, and reader coexist on
one realizable route. Until then this scan does not justify changing host
effect ordering or connecting DQK HLIB to CCFLOW. Focused scanner tests now
pass 12/12; broader source/docs/build gates are recorded with this update.

### Selector arithmetic refinement — static only — 2026-09-25

The seeded walker now also carries the fresh cooldown cell `0x0097`, optional
host positions `0x0111/0x0112`, and selector temporaries `0x00ca/0x00cb/0x00cc`.
It evaluates the retail-matched ADD, SUBTRACT, DIVIDE, MULTIPLY, AND, OR, and
SAVE operators for tracked destinations; CCECL's native DIVIDE and MULTIPLY
handlers were checked directly. `--start-vaddr` allows a source-pinned path
entry to be scanned without re-unioning earlier header instructions.

For descriptor 6 and diagnostic position `(5,4)`, area 22 slot 1 from its
header entry visits 259,567 states, 570 capacity sites, and eight abstract
post-capacity DAMAGE-reader sites. Starting directly at the selected
`0x9059` branch yields 259,574 states with the same 570/8 totals. Area 5 slot
1 starting at its actual entry `0x8847` visits 266,964 states, 609 capacity
sites, and the same eight readers. All runs are uncapped. The `(5,4)` position
is a diagnostic seed, not a proven retail position for this chain; these sets
still include unknown memory predicates and table outcomes. The added
precision therefore does not yet establish a concrete DAMAGE-reader route.
The exact position passed from the preceding area and the route's table state
remain open. Focused Python checks pass 16/16, including zero-default `0x009d`,
seeded-coordinate branches, arithmetic semantics, and explicit start-address
controls. The default unseeded corpus scan keeps all sparse-cell assumptions
unknown; the 47-root replay reproduces 8,538,659 states, 10,087 capacity sites,
891 post-capacity reader sites, eight unresolved chains, and zero capped roots.
This matches the earlier inventory and prevents optional fresh-memory seeds
from silently narrowing the corpus-wide result. No runtime app was opened.

## Legacy DOSBox desktop-focus guard — 2026-09-25

The static caller audit found that `tools/dosbot`'s unattended boot/drive
helpers ultimately call host `ForceFocus`, mouse, keyboard, or foreground
capture APIs. Minimized launch did not make those later operations focus-safe.
`tools/dosbot/lib.ps1` now blocks DOSBox launch and each focus-taking helper
unless the current PowerShell process explicitly sets
`GOLDBOX_ALLOW_DOSBOX_DESKTOP_FOCUS=1`. The non-activating `PrintWindow`
capture path remains available for an already-running window; if it falls back
to a foreground screen copy, that fallback checks the same opt-in.

The opt-in is documented in `tools/dosbot/README.md`. The source-contract test
`tools/test_dosbot_focus_guard.py` verifies launch checks precede `Start-Process`
and every host-input helper checks before its activation call. It passes 3/3;
`lib.ps1` also parses without PowerShell syntax errors. No DOSBox runtime was
launched, so this proves the default guard is present in the source path, not
that an opted-in GUI launch preserves focus. The separate Task 60 isolated
desktop requirement remains open for DOSBox-X GameLink launch verification.

### Next bounded static trace — area-5 table reads

The area-5 slot-1 route to `NEWECL #22` selects the inline terrain byte at
`(4,1)`, where the raw table value is uniquely `0xF1`. This establishes the
outgoing area-5 leg; it does not by itself prove the position on the returning
area-22 slot-1 chain. `GETTABLE` source semantics are now pinned in
`native/src/ccecl.asm`: operand 1 is a literal base address, operand 2 is
truncated to a byte, and sparse-memory overrides take precedence over the
inline ECL member byte. The next scanner slice is to track `0x00C0/0x00C1`,
evaluate only source-grounded inline reads, and widen when a `SAVE_TABLE` or
unknown alias could have changed the selected cell.

### Table-aware seeded route result — static only — 2026-09-25

`tools/dqk_ecl_invocation_scan.py` now tracks `0x00C0/0x00C1`, evaluates
Gen2 `GETTABLE` using the literal base plus the low byte of its offset, and
checks modeled sparse-memory overrides before reading the inline ECL byte.
Known `SAVE_TABLE`, direct saves/arithmetic, random/input/menu results,
PARLAY, and SPELL writes update or invalidate those overrides; unknown keys,
unmodeled CHECKPARTY outputs, and unknown CALLs widen table reads. Synthetic
controls cover inline values, byte-offset truncation, SAVE_TABLE's full-word
address, known override precedence, unknown writes, and PARLAY's destination.

The area-5 terrain range at virtual `0xA97D` contains 1,140 bytes, with raw
`0xF1` at `(4,1)` as its only occurrence. For area 22, slot 1, descriptor 6,
seeded with position `(4,1)`, the chain-aware capacity replay visits 1,677
states and reports one boundary before member 12 `PRINTCLEAR` at `0x9059`, zero
post-capacity DAMAGE-reader sites, no unresolved chains, and no state cap.
This retires the prior eight-reader abstract union for this seeded route in the
modeled state. The position is grounded on the outgoing area-5 lookup; the
result does not prove every return route or resolve the historical 384-record
run, and it does not authorize connecting HLIB to CCFLOW. Focused scanner tests
pass 20/20. The unseeded 47-root replay remains unchanged at 8,538,659 states,
10,087 capacity sites, 891 post-capacity reader sites, eight unresolved chains,
and zero capped roots. No runtime process was launched.

## Scanner semantics correction — static only — 2026-09-25

An Astra review identified two transfer/control-flow mismatches, which were
verified against `native/src/ccecl.asm` and fixed in
`tools/dqk_ecl_invocation_scan.py`. Native `logic_store` sets comparison flags
from the AND/OR result versus zero; the seeded tracker now replaces its prior
comparison with that result. Native Gen2 `SURPRISE` (`0x1f`) stops the current
CCECL run, so the walker now treats it as a terminal yield. The seeded model
also tracks fresh-zero sparse cells `0x0020`, `0x00be`, and `0x00fb`, which
bound area 28's earlier party-enumeration branch; known writes update them and
unmodeled writes still widen the state.

The corrections have synthetic regressions, including native-source
contracts. Focused scanner/menu tests pass 25/25. The area 28 slot-1 descriptor-8
header trace now completes in 360 states with no capacity boundary or
post-capacity DAMAGE reader, rather than hitting the 2,000,000-state cap. It
stops at the source-backed interactive yield before the later Mother-of-Trees
DAMAGE route. A separate interior diagnostic starting at `0x9878` reaches
1,243 states and reports five abstract capacity boundaries, including one
post-capacity `LOAD_CHARACTER` after DAMAGE. That slice resets event count and
omits the incoming RNG and interaction continuation, so it is not a complete
retail route proof.

The area 22 slot-1 descriptor-6 trace at position `(4,1)` still reports one
capacity boundary before member 12 `PRINTCLEAR`, no post-capacity readers, no
unresolved chains, and no cap. Area 23 slot 1 descriptors 8, 12, and 41 report
no capacity boundary or post-capacity reader; their candidate DAMAGE/CALL sites
remain route candidates, not effects proven to cross a chunk. These results
supersede earlier seeded exclusions because AND/OR flags now match native
semantics.

The corrected unseeded 47-root replay visits 8,500,497 states and reports 9,935
capacity boundary area-sites, 863 post-capacity DAMAGE-reader sites, eight
unresolved chains, and zero capped roots. Candidate totals are LOAD_FILES 47,
TREASURE 160, CALL 334, DAMAGE 58, SAVE_TABLE 253, ADD_NPC 13, LOAD_PIECES 108,
PROGRAM 17, and SPELL 0. This supersedes the prior 8,538,659 / 10,087 / 891
replay. No DOSBox or runtime fixture was launched. The full corpus and isolated
desktop runtime gates remain outstanding; these abstract site
combinations do not justify broadening fresh HLIB execution through CCFLOW.

### GBBOOT cold-resume route correction — source audit — 2026-09-25

The current tree is more specific than the task list's “HLIB stays on direct
CCECL” wording. Fresh execution in `GBBOOT .run_ecl` selects CCFLOW only for
DAX/Gen1 and invokes CCECL directly for HLIB. However, after any GBMO menu
answer, `.resume_combat_effect` selects CCFLOW for a v15 GBEF without a title
check. This is an existing production cold-resume route, not a newly introduced
change. CCECL emits v15 for Gen2 menu yields; CCFLOW's terminal path explicitly
accepts v15 status 2 and handles an accumulated final menu/sidecar. Its loop
also replays v15 capacity checkpoints. The source contract now pins both the
fresh-start distinction and the Gen2 v15 terminal path.

This narrows the remaining gap: HLIB does not enter CCFLOW on fresh execution,
and no DOSBox evidence proves the cold-resume path's visible prompts, exact
chunk contents, host-effect timing, or exactly-once answer handling on a retail
route. Private CCFLOW capacity replay still does not return to GBBOOT between
chunks for host-effect application. Keep the historical 384-record finding
open and do not claim complete HLIB ownership. The engine build passed at
65,150-byte GBBOOT resident size / 130 bytes headroom and 63,806-byte CCECL
resident size / 1,474 bytes headroom. No runtime process was opened.

Capacity claim gates pass 17/17 after updating GOAL.md, native/README.md, and
this registry to the generated CCECL values; the DQK/v15 source contracts pass
16/16. Scanner, menu-capacity, and focus-guard tests pass 28/28, and
`tools/test_docs_claims.py` plus `git diff --check` pass. The mandatory full
`pnpm test:corpus` remains unrun because it launches native DOSBox tests on the
active desktop; the repository's dummy-SDL route has not been verified in an
isolated Windows session as focus-safe. No attempt was made to run those
processes while desktop focus is in use.

## Task 25 area-2 prompt and caption boundary — static/source build — 2026-09-25

The yield walker now reports the selected header slot with each prompt. The
retail `DISK3/ECL.GLB#2` block is 1,434 bytes; `python
tools/dqk_ecl_invocation_scan.py --area 2 --follow-capacity` explores 49 states
with no capacity boundary, unresolved chain, or state cap. In `/!` mode slots
0/2/3/4 first reach `0x855E HORIZONTAL_MENU` as event 3; slot 1 reaches
`0x808A INPUT_NUMBER` as event 7. The static inspector confirms the wall menu
follows `0x8545 PRINTCLEAR "SELECT THE COMBAT WALL TYPE:"` and `0x855D
PRINT_RETURN`.

Following the wall answer gives `0x8588 ADD`, `0x8591 LOAD_FILES`, `0x8597
RETURN`, then `0x8041 GOSUB 0x8485`; that editor reaches its question at
`0x84A6 PARTY_SURPRISE` after two new recorded events. The editor loop then
contains numeric prompts and a VM-local `SAVE_TABLE`, but no second
`LOAD_FILES`, DAMAGE, or party effect. This exact path does not cross capacity
before either prompt. `GBBOOT` handles the yielded menu before its ordinary
`read_effect_geo` path; CCECL's menu resume restores the prior fixed GBEF prefix,
including `FX_HAVE_FILES`. Thus this route carries its map selection through
the prompt and applies it after the script leaves the menu loop; no map reader
is present in the traced script segment. This is route-specific source evidence,
not proof for other HLIB paths or the historical 384-event run.

The trace exposed a direct-menu presentation loss. The wall caption and newline
are fixed GBSX events preceding the HORIZONTAL_MENU event. CCECL starts a new
GBMT buffer for the choices, and GBBOOT selects CCMENU because no GBSL sidecar
exists. CCMENU previously rendered only GBMT, so the caption was omitted. It
now builds a bounded text prefix from fixed GBSX PRINTCLEAR, PRINT,
PRINT_RETURN, and CLEAR_BOX records strictly before the pending horizontal or
short-menu event, then renders that prefix before the choices. PARTY_SURPRISE
keeps its existing GBMT prompt path and is not rendered twice. The fixture now
covers the area-2 caption shape under v14 and v15, plus an overlong-record
rejection before GBMO output.

`native/build.ps1 -Target ccmenu` passes: 11,676 emitted / 11,932 resident /
53,348 bytes free. The scanner and DQK source-contract tests pass 34/34, the
PowerShell fixture parses, and `git diff --check` passes. The CCMENU DOSBox
fixture and full `pnpm test:corpus` remain unrun to avoid desktop focus changes;
therefore the new visible caption is source/build-verified but not runtime-
verified. Next add/retain an isolated runtime path for the exact retail area-2
v15 menu, then extend post-capacity scans to map/resource readers only where a
source route can reach them before the next yield.

## DQK Gen2 scanner descriptor correction — static — 2026-09-25

Astra's audit found that `tools/dqk_ecl_combat_scan.py` overrode only Gen2
operand counts while retaining the shared Gen1 opcode name and count-tail
metadata. Opcode `0x31` was therefore decoded as `SPRITE_OFF` and stopped
before its counted labels; opcode `0x27` likewise omitted the tail selected by
its fourth operand. Gen2 decode now resolves complete descriptors for both:
`0x31 = SHORT_MENU (wordSet 2, countAt 1)` and `0x27 = TREASURE (wordSet 4,
countAt 3)`. Regression fixtures assert both the frame sizes and the next
instruction boundaries.

Retail DQK `DISK3/ECL.GLB`, area 61/member 41, has bytes at `0x9FF5` for the
short menu: destination `0x00BF`, count 2, then the packed labels “SLAM THE LID
DOWN” and “LOOK INSIDE COFFER”. The decoded instruction is 37 bytes and the
following `ON_GOTO` begins at `0xA01A`. Its first arm reaches `0xA026` and the
later `COMBAT` at `0xA230`; its second arm reaches the captive-release text at
`0xA0A4`. The retail inspector reports the
menu as header-CFG reachable. This is source reachability, not evidence that a
native session has presented the menu or entered combat.

After the fix, the full 47-area invocation replay reports 8,530,039 states,
9,953 capacity sites, 863 post-capacity DAMAGE-reader sites, eight unresolved
chains and no capped roots. The corrected combat walk finds 272
header-reachable COMBAT instructions across 47 areas. The prior invocation
totals are superseded because the old decoder could stop inside a counted
menu label. The optional post-capacity menu list has 612 candidates but still
assigns event-count ranges of 1–64; it is an overapproximation and does not
prove 612 prompts will be reached after saturation. DOSBox was not launched.

The next static improvement is to constrain a concrete area-61 route around
the newly recovered `SHORT_MENU` and its selected `ON_GOTO` branch, then check
whether any of its 83 abstract capacity boundaries can occur before the menu
or later combat handoff. Keep runtime display and combat acceptance open until
there is an isolated, focus-safe DOSBox session.

## Task 25 area-61 coffer route — initial static trace — 2026-09-25

The corrected retail decode gives a concrete route to constrain. In member 41,
`0x9DBE PARTYSTRENGTH` and `0x9DBF VERTICAL_MENU "WHAT DO YOU DO?"` lead by
the `0x9E10 ON_GOTO` arm to `0x9FB5 WHO`, then the coffer narration and the
`0x9FF5 SHORT_MENU`. Its `0xA01A ON_GOTO` branches to `0xA026` (smoke-man
encounter setup) or `0xA0A4` (captive-release text). The encounter arm reaches
`0xA206`, loads three monsters, executes `0xA21F TREASURE #0,#10,#3,#1,#216`
and `0xA230 COMBAT`. The nonzero fourth TREASURE operand makes this a retail
confirmation that its counted tail is included in the decoded frame.

This establishes source CFG links and instruction boundaries, but not the
interactive answers or the source state after the combat handoff. The area-root
census's 83 abstract capacity boundaries and eight DAMAGE-pending party reads
are not attributable to this route.

The invocation walker now accepts repeatable `--menu-answer VADDR=CHOICE`
seeds. They are zero-based CCMENU answers at specific prompt PCs, and each
answered prompt resets the invocation-local GBSX event count before its cold
continuation. Starting at `0x9DBE`, answers `0x9DBF=3` (lift lid),
`0x9FB5=0` (first WHO roster member), and `0x9FF5=0` (slam lid down) reach the
`0xA230 COMBAT` handoff in 24 states. The yields occur at event counts 2, 1, 4,
and 6 for the vertical menu, WHO, short menu, and combat respectively. The walk
finds no capacity boundary, post-capacity reader, unresolved chain, or state
cap, and identifies `0xA21F TREASURE` on the selected branch.

Choosing `0x9FF5=1` instead reaches another prompt at `0xA110 SHORT_MENU
"HELP THE MAN" / "PUSH HIM OFF YOU"` after 8 events, also with no capacity or
unresolved chain. Selecting its first choice reaches the bite/combat arm; the
area-61 rescue branch contains no `ADD_NPC`. The broad HLIB census finished at
8,530,039 states with 9,953 abstract capacity boundaries, 863 post-capacity
DAMAGE-reader sites, eight unresolved chains, and no state caps. It finds 13
reachable `ADD_NPC` area-root combinations in roots 4, 10, 27, 28, 50, and 51.
Area 27/member 15 has concrete Tas/Grunschka candidates at `0x86F0 ADD_NPC
#115,#100` and `0x8737 ADD_NPC #113,#100`; this is the next source route to
trace for Task 35. The constrained area-61 tests and the actual route were
verified statically; no DOSBox was launched.

## Gen2 WHO prompt and selected-party contract — source/build complete, runtime pending — 2026-09-25

The area-61 `WHO` at member 41, `0x9FB5`, is encoded as
`39 80 14 [20 packed bytes]`; the retail prompt decodes to
`WHO TRIES TO LIFT THE LID?`, and the next instruction begins at `0x9FCC`.
The retail DQK dispatch chain is `2033:0F0C -> 1D99:128D -> 25A4:2FE0`, file
offset `0x0432A0`. That handler decodes the inline prompt for its selection UI
and stores the selected party pointer in engine state. It does not write to an
operand-derived ECL destination. The earlier generic CCECL path treated `0x14`
as a destination, dropping the prompt and mutating `MEM[0014]`.

CCECL now branches by ECL dialect for WHO. Gen1 retains its one-destination
result. Gen2 records the prompt, appends it as the first packed GBMT segment,
then appends bounded GBPR names as ASCII segments. Its v15 `GBMN` destination
is `0xffff`; `CCFLOW`, `CCMENU`, and CCECL cold-resume validation require that
sentinel, one event argument matching the prompt byte length, 1–6 roster
choices, and a prompt-plus-names segment count. CCMENU prints the prompt with
the packed renderer and the names with the ASCII renderer. After a valid GBMO
answer, CCECL restores GBMS first, then maps the zero-based answer to the
one-based selected-party context. The Gen2 path skips `mem_set` and its sparse
memory-capacity preflight.

`native/ccecl-menu-resume-test.ps1` now includes an HLIB cold-resume fixture. It
seeds `MEM[0014]=0x0777`, preserves a less-than comparison across WHO, selects
the third member, then yields a second menu to expose GBMS and GBRF state. Its
assertions pin the 20-byte prompt, selected member 3, unchanged memory, flags,
and exact menu rendering. The existing Gen1 WHO fixture still pins the legacy
destination write. `python -m unittest tools.test_native_dqk_source_contract`
passes (11 tests), and `native/build.ps1 -Target engine` passes; CCECL is 22,536
emitted / 64,075 resident bytes with 1,205 bytes headroom. The DOSBox fixture
was not launched to avoid taking desktop focus, so runtime behavior remains an
open gate.

## Task 35 area-27 recruitment source — candidate route narrowed — 2026-09-25

The full static invocation census finds 13 reachable `ADD_NPC` area-root
combinations in roots 4, 10, 27, 28, 50, and 51. Area 27/member 15 provides a
bounded next candidate: `0x86F0 ADD_NPC #115,#100` names TASSLEHOFF, and
`0x8737 ADD_NPC #113,#100` names GRUNSCHKA. The installed DQK id table maps
those ids to members 94 and 92 respectively; the decoded names agree with the
browser engine's id lookup.

The source route begins at `0x866A` with `AND #127` into `0x002D` and an
`ON_GOTO` through meeting state `0x009B`. Its `0x869D` arm checks `0x009F` and
`0x00BB`, then enters the king/queen narration. **[Retracted 2026-10-07, flagged here 2026-10-13: the `CHECKPARTY`-at-`0x86D4` reading in this paragraph is wrong; the guard is `LOAD_PIECES` at `0x86DE`. See the CORRECTION near line 1730.]** At `0x86D4`, `CHECKPARTY`
writes its fourth result to `0x00C0`; the route falls through to `ADD_NPC` at
`0x86F0` only when that result is `255`. Otherwise it skips that join. The later Grunschka
arm loads `memstr[0x01B9]` into `0x00C1`, checks its high flag and
`0x0141`, then reaches `0x8737`. A third Tas join at `0x8A2D` follows the Elea
route. This narrows the route state, but does not establish how the NPC's
character record is chosen, whether duplicate or full parties reject, or
whether the fixed-prefix `fx_npc_joins` has a consuming host.

Next, constrain a single area-27 route by the meeting-entry and loaded-piece
state, then inspect the exact party record and persistence fields around its
`ADD_NPC`. Keep implementation and runtime acceptance open until those source
semantics are established. Static analysis only; no DOSBox process was started.

## ECL operand `0x02` immediate correction — source/build/test complete, DOS fixture not run — 2026-09-25

Astra's audit identified that both the native CCECL interpreter and TypeScript VM treated
operand code `0x02` as a memory read. I checked this against retail `DQK.EXE`: its accessor at
file offset `0x031E32` dispatches `0x02` to the routine at `0x031E96`, which combines the two
bytes into a 16-bit value and returns it without dereferencing memory. The independent retail
`Opperation.GetCmdValue()` implementation agrees: codes `0x02` and `0x81` return `word`; codes
`0x01`, `0x03`, and `0x80` use the memory getter.

CCECL and `EclVm` now return the 16-bit word for `0x02`; the TypeScript disassembler labels it an
immediate, and the static DQK operand reader prints it as `#N`. Tests pin `COMPARE #750,[0x00C1]`
with inputs 749 and 750, plus a synthetic `SAVE` proving `memory[0x01B8]` is untouched. This
also corrects the Pools area-38 victory effect from 0 XP to 500 hundreds (50,000 XP). Stale
operand descriptions in the opcode, NWN, Pools, and encounter notes were updated.

Verification: all 2,975 engine tests pass; invocation-scanner tests pass (34); native DQK
source-contract tests pass (11); `pwsh -NoProfile -File native/build.ps1 -Target engine` passes.
CCECL remains 22,536 emitted / 64,075 resident bytes with 1,205 bytes headroom. A direct
Windows PowerShell 5.1 build attempt failed only at the PowerShell-7 SHA256 manifest API, after
NASM had assembled the tools; rerunning under `pwsh` succeeded. No DOSBox test was launched
because it would take desktop focus. Next source task remains the constrained area-27 `ADD_NPC`
route under Task 35; party-record selection and persistence effects remain unproven.

## Task 25 / Task 9 DQK area-2 combat-context selector — static source follow-up — 2026-09-25

Astra's source review found a more specific meaning for the area-2 second
`LOAD_FILES` operand. Retail member 2's route is `0x855E HORIZONTAL_MENU`
(six choices), `0x8588 ADD #1,[0x00BF],[0x00BF]`, `0x8591 LOAD_FILES #2,[0x00BF]`,
then `0x8597 RETURN` and `0x8041 GOSUB 0x8485`. The editor yields at
`0x84A6 PARTY_SURPRISE` after six opcodes and two recorded events from the wall
answer. The TypeScript retail-byte test now runs all six choices through that
prompt and confirms GEO 2 remains selected while the second operand is
1 through 6.

Retail `DQK.EXE` dispatches Gen2 `LOAD_FILES` to the handler at file offset
`0x0420AC`. It parses two operands: operand 1 is saved in the active combatant's
`+0x13` field and sent through the combat-art/orientation loader; operand 2 is
zero-extended into `DS:0xCA03`, except `0xFF`, which means leave the prior
context unchanged. The `0xCA03` context is forwarded when DQK loads
`DungCom1`/`WildCom1`. In the installed masters, DUNGCOM keys 1–6 resolve
respectively to leaves `{1,2,3,4,1,5}` (key 5 aliases key 1); WILDCOM has
keys `{1,2,4,5}`. This gives a concrete original combat-resource path, but the
runtime values and exact area-2 choices' visible asset results have not been
observed in play.

Native CCECL still preserves the raw second operand at GBEF `+14`. It now
keeps CA03 separately at `+16`, tagging the Gen2-only third prefix word as
`0xD0xx`: ordinary values store the zero-extended low byte; `0xFF` retains the
previous context; reset starts at zero. The existing 116-byte prefix copy
therefore carries CA03 across cold menu resumes without changing GEO or the
raw operands. CCCOMBAT recognizes the DQK tag on the combat handoff and resolves
independent DUNGCOM/WILDCOM table ordinals. Contexts 1–6 map to DUNGCOM
`{1,2,3,4,1,5}`; WILDCOM resolves `{1,2,0,3,4,0}`. Zero means no group
override, including WILDCOM keys 3 and 6, which have no matching shipped
master-table key. The resolved values remain separate from exploration
`hlibsetcur`.

This is the bounded source/build stage of Task 9, not terrain rendering. The
resolved group pair is prepared inside CCCOMBAT but no combat terrain renderer
consumes it yet. The HLIB `prepare_combat_wall` route still crops the exploration
wall only on a step event. Runtime selection and visible asset results remain
unverified; the historical 384-record run also remains unexplained.

The invocation scanner also had a reporting error: seeded headless prompt
answers continued correctly, but were still listed as terminal yields. It now
omits only those answered prompt yields; a constrained area-2 headless loop
still reaches capacity boundaries, with zero post-capacity DAMAGE readers and
no unresolved chains. That is a deterministic configured-answer trace, not a
model of the interactive `/!` cold-resume loop and not an explanation of the
historical six chunks. Checks: `dqkEvents.test.ts` 12/12 and the invocation
scanner suite 34/34. No DOSBox process was launched.

Next: connect the resolved group pair to a DQK combat tilebank consumer; prove
loaded member ranges against both shipped TLBs before adding terrain rendering.
Static source/build checks cover the field and mapping. Runtime selection and
visual acceptance remain a later focus-safe gate and must not take over the
user's active desktop.

### Task 9 native state and group-resolution pass — source/build — 2026-09-25

CCECL now keeps the raw Gen2 `LOAD_FILES` operands at GBEF `+12/+14` and stores
the persistent DQK CA03 value at `+16` as `0xD0xx`. It starts at zero, copies
the low byte of ordinary operand 2, and leaves the previous tag/value intact
when the low byte is `0xFF`. That prefix is already copied by the v15 cold
resume path. CCCOMBAT recognizes the DQK tag and packs the independently
resolved group ordinals into `combat_hlib_groups`: DUNGCOM in the low nibble,
WILDCOM in the high nibble. Unsupported WILDCOM keys 3/6 produce zero (no
override). The exploration `hlibsetcur` remains separate. This output is not
yet consumed by a combat renderer.

Verification: `tools/test_native_dqk_source_contract.py` **12 passed**;
`tools/test_native_capacity_claims.py` **9 passed**; `tools/test_docs_claims.py`
passed; `git diff --check` passed with only the repository's existing LF/CRLF
warnings. `native/build.ps1 -Target engine` passed: CCECL has **1,165 bytes**
of headroom, GBBOOT **130 bytes**, and CCCOMBAT **220 bytes**. The full
`pnpm test:corpus` gate was not run because it launches nine native DOSBox
behavior tests on this desktop; no DOSBox process was running at verification.
Keep desktop runtime tests deferred until there is a focus-isolated session.

The next group-boundary step is now pinned too: the focused
`dqkCombatCluster.test.ts` suite passes **14/14**, including end-exclusive leaf
ranges for all shipped DUNGCOM/WILDCOM master entries. DUNGCOM keys 1/5 alias
`[0x0046,0x3f2e)`; keys 2, 3, 4, and 6 select their own ranges through
`0x1489e`. WILDCOM keys 1, 2, 4, and 5 each select one 24,336-byte leaf through
`0x17c7a`. Next concrete work is to connect the packed CCCOMBAT group pair to
the combat TLB decoder and prove its member list before terrain rendering.

The next implementation boundary is now constrained by current CCCOMBAT
source and shipped files: `/E` currently receives the effect path, optional
monster archive path, and seed; `load_mon_archive` uses a 32,768-byte buffer.
The full DUNGCOM/WILDCOM TLBs are larger (84,126 / 97,402 bytes), while every
selected leaf is 16,104–24,336 bytes and fits that buffer. Therefore the native
consumer must read and validate the master header/set-id table, seek to the
selected leaf, then load only that nested HLIB range. No sibling TLB path
derivation or selected-leaf loader currently exists. This is the next bounded
native step; drawing the 50×25 battlefield remains downstream work.

### CCHLIB logical master-set export — source/build complete, runtime pending — 2026-09-25

Added `CCHLIB S <master.hlib> <logical-set-id> <dir>`, which reads member 0's
`{id, pointer-index}` table, checks the selected 1-based pointer and end-exclusive
range, then copies the exact leaf bytes to `dir\Snnnn.HLB`. DOS create-new
semantics prevent overwriting an existing file. Failed seeks, short reads or
writes, and failed copies reject; a partial output created by this invocation
is closed and deleted. This creates a bounded leaf asset for future CCCOMBAT
consumption, but no combat renderer uses it yet.

The source contract covers verb registration, table/range checks, no-overwrite
creation, exact I/O lengths, and partial-file cleanup. Focused CCHLIB and DQK
contracts pass 15/15; the capacity gate passes 9/9; docs claims and
`git diff --check` pass. The engine build passes with CCHLIB at 9,167 resident
bytes / 56,113 bytes headroom. DOS execution was deferred to avoid taking
desktop focus, so logical-ID selection and byte identity still need runtime
verification.

**Astra's area-2 review:** the existing route trace is source-consistent. Fresh
Gen2 HLIB execution starts in CCECL, while every v15 cold resume routes through
CCFLOW and restores the fixed GBEF prefix. On the traced six-choice wall path,
CCECL records `LOAD_FILES`, then yields the editor prompt before any map/resource
reader. GBBOOT handles that status-2 prompt before its ordinary map dispatch;
it applies the pending map after the prompt loop returns. The path has no
capacity boundary, later `LOAD_FILES`, DAMAGE, or party effect. No area-2 ordering
bug was established, so another implementation change here is not warranted.

**Next source task:** continue Task 25's fresh-HLIB capacity ownership audit.
The current `--follow-capacity --list-post-capacity-yields` census replays one
private chunk across 47 roots (8,530,039 abstract states; 9,953 capacity
boundary sites; 612 candidate prompt sites after a replay; eight unresolved
chains; no capped root). These are overapproximated site combinations, not
612 proven executions. The constrained area-22/slot-1 descriptor-6 route at
position `(4,1)` replays across five chunks at the `0x9059 PRINTCLEAR` boundary
and has zero post-capacity DAMAGE/party-reader sites; it does not reach a prompt
in the modeled slice. The next useful work is to select a different source-
grounded capacity route and extend the scanner's post-capacity tracking to
LOAD_FILES/LOAD_PIECES and resource-dependent prompt paths. Keep broad HLIB
CCFLOW ownership open until a realizable route establishes the host dependency.
Static analysis only; do not launch DOSBox on the active desktop.

### Post-capacity host/data consumer census — static — 2026-09-25

`tools/dqk_ecl_invocation_scan.py` now reports title-data and host-state
consumers reached after at least one abstract private capacity replay. The
list includes `PICTURE`, `LOAD_FILES`, `LOAD_PIECES`, party-state readers, and
existing effect candidates. The source contract for this behavior passes
35/35. The 47-root replay still visits 8,530,039 states, with 9,953 abstract
capacity sites and eight unresolved chains. It reports 371 post-replay PICTURE
sites, 16 LOAD_FILES sites, 57 LOAD_PIECES sites, and 1,824 PARTYSTRENGTH
sites. These are unioned control-flow candidates, not realizable path proofs.

The clearest apparent resource pair, area 58/member 38 `LOAD_PIECES` at
`0x8B50` followed by `PICTURE #113` at `0x8B5F`, is not a capacity-route
witness. Astra traced two mutually exclusive selector cases: that pair
requires `(CA,CB)=(1,2)`, hence sparse cell `0x002D=0x12`; the event-heavy
area-58/area-61 cycle uses a different selector case. Neither chained member
writes `0x002D`, and CCECL preserves sparse memory across `NEWECL`, so that
cycle cannot later enter the picture branch. Starting the scanner with
descriptor `0x12` reaches the pair in 125 states with no capacity boundary;
descriptor `0x02` follows the other branch and has no capacity boundary in
the unprompted trace. The selector-derived findings are from Astra's source
audit, reconciled against the scanner and retail ECL decode.

This retires the area-58 pair as the immediate lead while preserving the
scanner extension as a useful consumer census. The active gap is narrower:
find a concrete v15 cold-resume path whose post-answer CCFLOW replay both
crosses capacity and reaches a host-dependent terminal menu before GBBOOT can
apply its pending map/piece effect. The area-58/61 cycle contributes 28
recordable events per celebration pass and can approach a capacity boundary,
but its exact repeat-triggering interaction sequence is not yet established.
Do not infer a cold-resume bug from the unioned post-capacity counts alone.

### Task 35 area-27 Tasselhoff gate and retail handler — static — 2026-09-25

The member-15 source trace now pins a prerequisite that the fresh-memory route
probe does not supply. On the Hulderfolk branch, `0x85C2 COMPARE [0x00BB],#0`
and `IF_NE` skip the recovery path when that state is nonzero. When it is zero,
`0x85CD GOSUB 0xA32E` reaches `0xA32E SAVE #255,[0x00A2]`. A later pass at
`0x83F7` enters the meeting dispatcher when `[0x00A2]==255`; its other branch
decrements a nonzero counter and dispatches only if the result remains nonzero.
Thus the observed recovery call can establish the direct `0xFF` meeting state,
but the eligible player/save state and exact cell revisit sequence are not yet
proven.

At `0x866A`, the script masks cell descriptor `[0x002D]` with `127`; ON_GOTO
case 1 reaches the meeting text at `0x869D`. That path requires `[0x009F]==0`
and `[0x00BB]==0`. **[Retracted: see the CORRECTION near line 1730; `0x86D4` is inside a PRINTCLEAR string.]** At `0x86D4`, `CHECKPARTY` has six operands and writes its
fourth result to `[0x00C0]`; `[0x00C0]==255` allows the Tasselhoff join at
`0x86F0`, otherwise control skips to the Grunschka check. The sixth
`CHECKPARTY` operand is `memstr[0x01CA]`, but its value and role in the query
are not established. The Grunschka join has its own
piece/high-bit and `[0x0141]` conditions. A third Tas join at `0x8A2D` follows
the Elea route. These are static instruction and branch facts. The current
seeded invocation scan starts with zero sparse memory, does not model the
`0x00A2` recovery state, and caps the area-27/slot-1 union; it is not proof that
the Tasselhoff route is realizable from a retail save.

Retail framing corrects the earlier apparent `LOAD_PIECES` decode at `0x86DE`:
opcode `0x1E` (`CHECKPARTY`) prefetches six operands, so byte `0x37` there is
operand data. The instruction ends at `0x86E2`, where `GOTO [0x00C0]` begins.
The retail `CHECKPARTY` handler at file `0x032532` passes six operands to its
query routine. The engine's modeled semantics write four query results to
operands 3–6, which makes operand 5 (`[0x00C0]`) the guard result and operand 6
(`memstr[0x01CA]`) the final result destination. The precise retail query
semantics for this call are still unresolved. Consequently the branch value
`255` does not establish a duplicate check, and no duplicate guard has yet been
identified on this route. The separate `LOAD_PIECES` handler behavior does not
resolve this CHECKPARTY path.

The retail DQK dispatch table identifies opcode `0x36` as `ADD_NPC`; its
two-operand handler is at `DQK.EXE` file `0x04333B`. The handler passes operand
1 to one far call (`0x2177:0x2886`), writes
`(operand2 / 2) | 0x80` to the current record's byte `+0x9B`, then calls
`0x077E:0x0BE2` and the overlay-3 helper `0x1F4E:0x023B` with current-record
pointers. The latter helper's body at file `0x03116B` walks linked records and
performs per-record derived-field work; the MZ helper at file `0x00A7C2`
initializes twelve two-word slots and aggregates linked-record fields. No NPC
ID comparison is visible in these two helper paths; they do not settle the
separate `2177:0x2886` callee's insertion behavior.

The name/ID table maps NPC 115 to MONCHA member 94, whose decoded record names
Tasselhoff. Do not equate the handler's literal `0x2177:0x2886` target with the
separate `1F4E:0x4AB6` / file `0x0359E6` add-combatant routine: prior overlay
work documents segment drift, and no exact alias proof has been found. The
callee's effects, the eight-member/full-party case, duplicate behavior,
save-persistence fields, and native `fx_npc_joins` application are still open.
Static analysis only; no DOSBox process was launched.

### Next task selection — Astra review — 2026-09-25

Astra's next choices are Task 22 (a read-only registry/validator for native test
ownership, the smallest fully offline task) and Task 29 (trace a DQK creature's
two attack-rate counters across two rounds). Task 32 has since been implemented
and validated; it no longer leads task selection. No runtime was launched.

### DQK PARTYSTRENGTH acknowledgement boundary — static scanner — 2026-09-25

The invocation scanner now treats DQK opcode `0x1D PARTYSTRENGTH` as a terminal
yield. CCECL's DQK handler records the script event, publishes the v15
acknowledgement token, and stops without requesting a player-selected value.
`read_resume_ack` admits that token as `resume_kind=5`; cold startup calls
`vm_reset_all` / `init_fx_state`, which zeroes the invocation-local GBSX event
count. CCFLOW validates that the acknowledgement is the final recorded `0x1D`
event. The scanner therefore exposes a separate `--acknowledge VADDR` option:
the default walk stops at the event, and an explicit acknowledgement continues
after it with count zero, without inventing an answer. Party-reader reporting
remains independent, so an acknowledged terminal opcode can still be reported
in DAMAGE-pending ordering.

Retail area 22 member 12 decodes `0x9091 PARTYSTRENGTH` followed by literal
`0x9092 NEWECL #5`; the regression proves the default stop and explicit
cold-resume into the area-5 member. With the corrected terminal semantics, the
seeded area-22 slot-1 trace stops at `0x9091` with event count 3 and no capacity
boundary. An explicit acknowledgement cold-resumes at count zero and can reach
another `0x9091` at counts 3 and 4; the 102-state trace has no capacity boundary
or post-capacity reader. This supersedes earlier claims that the `0x9059`
boundary produced a capacity replay with zero readers: those claims walked
through the unmodeled `0x1D` terminal. Its `(4,1)` host-position seed is not
proven as the incoming area-22 position or cooldown state, so this is not a
realizable encounter-path claim. Synthetic reset/order checks, retail-byte
checks, and CCECL/CCFLOW source contracts pass with the focused scanner suite
(39 tests). No DOSBox, UI, runtime, or corpus gate was run.

**Next offline task candidate at that review:** Task 22, the read-only registry
and validator for native test ownership. It has since been implemented below.
Keep runtime testing disabled while the desktop-focus constraint applies.

### Task 22 native test ownership registry — source-only — 2026-09-25

Added `native/test-ownership.json` and the source-only validator
`tools/native_test_ownership.py`. Candidate discovery covers 99 source files
ending in `test.ps1`, `-scan.ps1`, or `-probe.ps1`; generated files under
`native/build` and the central `native/test.ps1` dispatcher are excluded.
The registry has 64 required and 35 advisory entries, no retired entries, and
preserves overlapping owners. Membership is derived from `native/test.ps1`'s
`$scripts` and `$flowScripts`, its direct GBBOOT and one-off invocations, and
`gbplayable-suite-test.ps1`'s `$coreFlows` and `$optionalFlows`. Advisory and
retired rows require a reason; required rows must have owners.

The 36 `$flowScripts` entries declare `native/flow-status.json` as their
durable artifact. The ownership file records no flow status or verdict, keeping
this inventory separate from measured results. Mutation tests cover removed
source membership, omitted registry rows, newly discovered candidates, missing
artifact references, ownerless required rows, reasonless advisory/retired rows,
and valid overlapping ownership. Focused verification:
`python -m pytest tools/test_native_test_ownership.py -q` — 10 passed. No native
runner, build, DOSBox, UI, or corpus flow was launched.

**Next offline task candidate:** Task 29, tracing a DQK creature's attack-rate
counters across two rounds. Runtime gates remain disabled under the desktop
focus constraint.

### Task 29 LOAD_MONSTER record-transfer trace — static — 2026-09-25

The DQK `LOAD_MONSTER` handler at file `0x042C63` stages its three operands;
the builder at `0x043042` iterates the pending groups and calls `0x042CBC`.
That routine passes the member id to `0x040415`, which allocates a `0x19E`-byte
record buffer and calls `0x2177:0x257C` to resolve the record. It then copies a
`0x19E` span into the linked combat roster node through `0xD7:0x2B69`, clearing
only the node's link words at `+0..+0x0A`. MONCHA rate bytes `+0xB3/+0xB4` are
within that copied span and therefore enter the node at their original offsets.
The `+0x66` monster flag is checked before insertion, matching the decoded
MONCHA layout. The HLIB group selection and any subsequent rewrite of the rate
bytes remain unproven.

This closes the data-transfer half of Task 29, not its behavior: the remaining
trace must prove how normalized `+0x190/+0x191` values become attack actions,
allowance decrements, or requeues across rounds. The existing `0x5F136` routine dispatches
attack approach by type, and the `0x5B73C` queue path plus its inspected
overlay-0 helpers did not expose that consumer. No runtime or DOSBox session
was opened. The focused disassembly and rationale are in
[`research/disasm-combat-dqk.md`](research/disasm-combat-dqk.md) §10.3.

**Follow-up static byte-flow scan — 2026-09-25.** A routine at `0x25C54`
copies combatant `+0xB3` to `+0x190` before helper calls and later updates
`+0x190`. Another at `0x24E53` passes `+0xB4` through `0x21E4:0x0FFC` and
writes the return byte to `+0x191`. Overlay 9 candidate `0x537B9` adds
`+0x190/+0x191` and subtracts the sum from a second argument's `+3` byte when
that byte is greater. A literal-call scan found no direct call, and the
argument structures and indirect entry remain unidentified. These links do
not yet establish an attack scheduler or two-round cadence; Task 29 remains
open. No runtime was started.

**Rate normalization trace — static — 2026-09-25.** Overlay 0 copies `+0xB3`
into `+0x190` and normalizes it through shared `21E4:0FFC`; it reads `+0xB4`,
passes it through the same helper, and stores the result at `+0x191`. That
helper returns `(input + (AE4C & 1)) / 2`: `DF9:0428` returns its argument's
low bit, round advance increments `AE4C`, and encounter initialization clears
it. This proves phase-dependent half-rate normalization into the runtime pair.
Overlay 9 `0x537B9` sums those fields and conditionally subtracts from a second
record's `+3`, but no literal caller was found and that record is unidentified.
Decoded retail UMBER HULK member 12 (`4/2`) produces `2/1` on both phases;
PRINCE TALHOOK member 60 (`3/6`) produces `1/3` then `2/3`. This pins the
two-round normalization examples but not their execution. DQK ECL area 23
queues UMBER HULK ID 12 immediately before COMBAT; area 15 queues PRINCE
TALHOOK ID 60 before COMBAT. The downstream attack consumer remains open. No
runtime was started.

### Task 29 source/build correction — static — 2026-09-25

The preceding dated Task 29 notes were accurate when written, but their final
claim that the downstream consumer remained open has since been superseded by
`docs/engine/research/disasm-combat-dqk.md` §10.3: overlay-0 function `0x26177`
consumes kind 2 then kind 1 and decrements `+0x191/+0x190`. The native source
now enables that cadence only for validated DQK HLIB monsters under the CCECL
`D0xx` context marker; malformed positive secondary profiles reject that
trusted encounter. The ordinary two-round retail rates are pinned in source:
UMBER HULK `4/2` and PRINCE TALHOOK `3/6`. Static build headroom is 132 bytes
above the 128-byte floor, and five source contracts pass. The expanded
`cccombat-test.ps1` fixtures parse, but no DOSBox/runtime trace has been
observed because interactive runtime testing is paused under the desktop-focus
constraint. Task 29 remains open for that evidence.

**CORRECTION 2026-10-07 (retracts every `CHECKPARTY` at `0x86D4` reading above, lines ~1345 and ~1563).** `0x86D4` falls inside the 36-byte PRINTCLEAR string at `0x86B9`; the instruction at `0x86DE` is `LOAD_PIECES memstr[0x1CA],[0xC0]` (opcode `0x37`, two operands), followed by `COMPARE [0xC0],#255` at `0x86E5`. A CHECKPARTY reading predicted an instruction start at `0x86D4`, a reachable `0x1E` somewhere in DQK and valid operand type codes; a control-flow walk of member 15 hit none of them, and reachable CHECKPARTY sites across all 47 ECL members number 0 against 89 LOAD_PIECES sites. Evidence and null: `docs/engine/research/dqk-area27-86de-decode.md`. The area-27 natural route remains unproven.
