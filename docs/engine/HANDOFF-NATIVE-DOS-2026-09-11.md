# Native DOS Greybox handoff — 2026-09-11

## Pause point — 2026-09-14

The initial pause boundary was commit `f7018d04` (`native: repair VHD build
host`), pushed to `origin/greybox`. It repaired the VHD builder's PowerShell 7
selection, renewed its external-script hash pin, and passed the full
`-Build -StageOnly -KeepStage` route with 422 staged files. `C:\LLM\DOS\_vhd_stage`
is the retained, un-published stage; neither `DOS-TOOLS.img` nor `DOS-TOOLS.vhd`
was replaced by that run. The current continuation adds the direct-DAMAGE source
preflight described below; use the latest native handoff commit as the new pause
boundary.

The next implementation slice remains the audited `CCHOST /D` direct-DAMAGE
transaction. Its first safety phase is complete: before the first compact HP or
flag write, the DoK path now opens and size-checks every selected low-numbered
`SAVE\CHRDATA#.GAM` source. `cchost-test.ps1` deletes a later source slot and
proves GBPR and an earlier source stay byte-identical; a high-bit native-only
slot still applies without `SAVE`. Do not treat this as transactional completion:
`cchost.asm` still routes `/D` straight to `apply_effect_damage_roster`, bypassing
the GBHR/GBTX finalization used by combat results, and a later write failure can
still split GBPR, GBD1, and retail bytes. Add fault-after-each-sink controls and
a bounded preimage/recovery record covering those sinks. Retry must apply one
damage event exactly once.

The priority order and acceptance checks are in
`docs/engine/NATIVE-TASKS-2026-09-12.md`: direct-DAMAGE transaction, at least
128 bytes of CCCOMBAT headroom enforced by the capacity gate, a real saturated
GBBOOT-to-CCFLOW DAX contract, and recovery of interrupted player-session
copies. DQK `/A 7` remains an independently reproduced pre-existing red route;
HLIB continuation remains deliberately direct until its live source/host
interaction boundary is designed. Do not call the objective blocked: all of
these are actionable local work.

The first player-session recovery phase is also complete. `New-PlayerSession`
now writes a sibling `.complete` marker only after the initial staged copy
returns; reopening requires that marker to match the source in addition to the
existing `.source` ownership marker. The all-title launcher regression removes
the completion record and an asset from a CoK fixture, then proves the launcher
rejects it before mount or repair. This protects an interrupted first copy
without risking replacement of an existing player session. Runtime stability
when source-library membership changes and public VHD `GBSESS.OK` preparation
remain open.

The only remaining GoldBox worktree edits are the pre-existing browser/import
track and its research notes, plus its untracked session transcript and
`tools/codex-out/`; leave them untouched. No native source edits are uncommitted
at this pause point.

## 2026-09-14 continuation — VHD native-build host repair

`C:\LLM\DOS\BuildReleasesVHD.ps1 -Build` now invokes `native/build.ps1` with
`pwsh -NoProfile`, rather than Windows PowerShell 5.1. The older host could
assemble the `.COM` files but then failed when the source-bound capacity manifest
used PowerShell 7 hashing APIs, preventing a clean VHD rebuild. The external
script hash in `native/release-manifest.json` was renewed. The PowerShell 7
native `-Target all` build, manifest validation, focused release/capacity tests,
and the exact VHD `-Build -StageOnly -KeepStage` route all passed; the latter
staged 422 files without publishing a replacement image.

## 2026-09-14 continuation — fail-closed CCBIND identity writes

`CCBIND /W` now calls and checks its identity writer before returning a DOS exit
status. A missing source or an uncreatable `.IDN` sibling therefore exits nonzero,
which keeps GBBOOT from treating an absent source binding as a valid cold-resume
precondition. `ccbind-test.ps1` runs both guest failures and is enrolled in the
normal native smoke runner. The generated-capacity test now includes all sixteen
engine targets, including `CCBIND`, and `HANDOFF.md` is pinned to this current
native handoff rather than the superseded 2026-09-08 recovery record.

## 2026-09-14 continuation — centralized checked child launches

GBBOOT now uses one checked launcher for its 27 child paths that require a zero
DOS exit status. Paths that consume a special child status keep the raw launcher.
This removes duplicated `EXEC` and `AH=4Dh` handling without changing the
failure contract, reducing GBBOOT to 65,056 resident bytes with 224 bytes free.
The active task list pins that generated capacity alongside CCCOMBAT's still-
constrained 4-byte margin. Further state migration is still required before
adding feature code to either constrained client.

The exhaustive GBBOOT smoke remains red on DQK `/A 7`: it expects the initial
GEO-14 combat route to resume at GEO 62 and render a 28x28 WGRD, but gets a
22x22 wall. Reassembling the committed pre-capacity GBBOOT reproduces that
same result under the identical DOSBox configuration, so the DQK route is an
existing open item and not evidence against the checked-launcher change.

## 2026-09-14 continuation — strict terminal GBEF envelope

Before CCHOST accepts CCFLOW's `GBSL` sibling, it now requires the terminal
effect to be exactly GBEF v9 and 5,750 bytes. Future, truncated and trailing
terminal envelopes with a valid sibling reject before a roster can open;
`cchost-test.ps1` verifies each case.

The same smoke now also supplies an exact-length 1,214-row `GBSL` v1 sibling.
`CCHOST` rejects it before opening the roster: 1,213 is the final row count
whose `8 + index * 54` 16-bit offset cannot wrap. This makes the bound in
`cchost_damage.inc` executable evidence rather than an untested guard.

## 2026-09-14 continuation — DoK direct DAMAGE persistence

All fresh DoK DAX effects now pass through `CCHOST /D`, whether CCFLOW emitted
the fixed terminal GBSX prefix or a saturated GBSL sibling; sidecar-free v14
resume records use their compatible v9 prefix while GBSL remains v9-only. The helper applies
the supported deterministic policy to compact `GBD1` HP and mirrors a real
low-numbered source slot to both observed `CHRDATA#.GAM` HP bytes (40 and 214).
Malformed compact metadata rejects instead of silently reporting an applied
effect. `cchost-test.ps1` runs the direct helper under DOSBox and proves the
post-effect value in the compact record and in both source bytes.

## 2026-09-14 continuation — cold ECL source identity

`CCBIND.COM` now keeps a versioned exact-copy `GBID` sibling for each emitted
ECL effect. GBBOOT records that sibling before host consumption and rejects a
cold resume unless the mounted source has the identical length and bytes.
Unbound legacy effects fail closed. `ccbind-test.ps1` covers changed,
missing, truncated, trailing and future identities; the menu cold-resume smoke
checks the live sibling against `ECL1.DAX` after two resumes. GBBOOT is now
65,278 resident bytes, leaving 2 bytes; reclaim space before extending it.

## 2026-09-14 continuation — generated native capacity evidence

`4550a543` makes `native/build.ps1` emit the ignored
`native/build/native-capacity.json` after every build. It records each built
tool's emitted, resident, and headroom bytes together with an ordinal,
locale-independent SHA-256 over every path-and-content pair in `native/src`.
`tools/test_native_capacity_claims.py` rebuilds the engine, independently
recomputes that source hash, checks every resident/headroom invariant, and pins
the designated current CCECL claim in GOAL, the native README, and the active
task list. The validated engine manifest measures CCECL at 20,630 emitted /
65,199 resident / 81 headroom, GBBOOT at 64,800 / 65,056 / 224, and CCCOMBAT at
65,020 / 65,276 / 4. Treat the artifact, not an older prose measurement, as
the current capacity source before adding code to any constrained `.COM`.

## 2026-09-14 continuation — first source-owned DoK Cast

`CCCOMBAT` now accepts `C` for one bounded, title-owned spell: DoK raw WIZ id
15, Magic Missile. It maps the current imported GBPR member back to its retail
source slot, requires an id-15 instance in `SAVE\CHRDATA#.WIZ` bytes 34..73,
targets the deterministic weakest living foe, performs the shared-ruleset
1d4+1 baseline (retail DoK dice dispatch remains unlocated), and publishes the
actor ordinal plus raw spell id in GBCR v1 bytes
12..13. The result remains a normal combat handoff rather than directly
mutating source files. The v1 receipt stores one Cast; a later Cast explicitly
rejects before it changes combat until a bounded multi-receipt bridge exists.

`CCHOST` owns that mutation. Its preflight rejects a receipt unless the GBPR
record is a verified compact GBD1 source slot and the exact fixed 220-byte WIZ
sidecar still has a prepared id 15. After complete roster and `.GAM` writes it
re-reads the sidecar and removes one instance by shifting the sorted,
right-justified 34..73 list, preserving every other byte. It then sets the
existing v1 consumed marker at +14. `cchost-test.ps1` proves success and a
missing-WIZ rejection with no GBPR change; `cccombat-test.ps1` proves the raw
source read, automatic `cast` trace, receipt, and no premature source mutation.
`gbdok-playable-flow-test.ps1` carries `/C C` through the real Cekos/Sivak
encounter on a disposable copy of the retail saves, proves the receipt and
exact source-slot consumption, then cold reloads and rejects replay.

`CCCOMBAT.COM` is now 65,268 of 65,280 resident bytes (12 bytes headroom). Do
not add another primitive to it without first reclaiming space. Task 4 remains
open because its broader Cast selection/exhaustion/move-act-move proof and
other title primitives are not finished.

## Start here

The deliverable is one new, clean-room **DOS Greybox engine** supporting the
Gold Box titles from the user's assets, with per-platform art selection.
Browser work is secondary and untouched this session (see GOAL.md). Retargeting
CoK onto SSI's DQK executable is parked and is not the deliverable.

Read [CLAUDE.md](../../CLAUDE.md), [GOAL.md](../../GOAL.md), and
[native/README.md](../../native/README.md). This dated handoff summarizes the
release at **`a5adc19`**, pushed and verified on `origin/greybox`. Check current
Git state before resuming; this is a dated snapshot, not a claim that the branch
will remain at that revision.

This session's work was **not** engine-code changes — `native/src/**` is
byte-unmodified throughout (verified: content hash `43415215...` unchanged
across all three commits). It closed three separate instrument gaps that let
real defects and real fixes sit unreported for hours to weeks: one script
outside every gate, eight gates that could pass without running, and one
script that could never report a verdict at all.

## Continuation — player Flee retains its turn budget, 2026-09-14

`CCCOMBAT` now gives a direct command-bar `F` and an `F` selected inside Move
mode the same remaining movement ledger already used by Quick. Before this
change, both paths asked `try_flee_step` to reload the full `C_MOVE` allowance,
so Move→Flee could travel farther than the current round allowed. The focused
DOSBox regression starts from a four-square budget, spends two squares, and
requires each Flee entry path to stop after exactly the remaining two squares;
an untouched Flee control still reaches its normal full-budget edge.

Entered no-save Hold/Sleep hazards now stop the mover before its next route
step or post-route AI attack. The focused fixture places Hold on the first
entered cell and covers normal AI movement, scripted player Move, and routed
Flee. It leaves the mover held through the round cap, so an accidental resumed
route or attack is visible in the trace.

The next explicitly-owned combat feature remains a retail-grounded Cast path.
DoK's `.WIZ` offset `34..73` current-memorized list is sufficient source data,
`CCCOMBAT` now has 328 resident bytes free after its duplicated multi-line
invalid-invocation diagnostic was reduced to a bounded one-line message; the
complete CLI contract remains in `native/README.md`. Do not label a
synthetic damage shortcut as Cast: implementing safe source-slot consumption
and writeback first needs space recovered from the combat executable or a
bounded helper contract that preserves the same source ownership.

## Continuation — paged CCFP narration, 2026-09-13

CCFP no longer discards every narrative record after the first retained GBSX
`PRINT`/`PRINTCLEAR`. Its normal `/E` view assembles a bounded three-line,
117-character player page in source order: `PRINT` appends, `PRINTCLEAR` and
`CLEAR_BOX` reset the page, and `PRINT_RETURN` creates the `/W` Enter boundary.
The legacy `/Z n` diagnostic remains a single-record selector. The renderer
wraps at 39 characters across its three message-band rows, so a full page
cannot silently run off the mode-13h frame.

`ccfp-effects-test.ps1 -Headless` runs the real CoK/DoK/CoAB/DQK fixture
coverage and synthetic ordered GBSX controls. It compares rendered RAW frames
to prove PRINT accumulation, PRINTCLEAR reset, CLEAR_BOX reset, and the first
PRINT_RETURN page boundary. This is an isolated CCFP improvement: CCECL still
transports at most 32 characters for each individual inline operand, and the
test does not yet prove a long retail passage or a live GameLink Enter capture.
Do not describe full source narration as complete until that transport and
retail acceptance exist.

## Continuation — complete flow denominator, 2026-09-13

`native/test.ps1` now enrolls five real-data scripts that had been omitted from
its `$flowScripts` denominator: `gbdqk-amiga-glib-flow-test.ps1`,
`gbpool-flow-test.ps1`, `gbsecret-hlib-flow-test.ps1`,
`gbsecret-glib-flow-test.ps1`, and `gbgateway-glib-flow-test.ps1`. Their default
WHDLoad roots now point at the current `WHDLoad Collection\Games-WHDLoad\unpacked`
tree. `native/run-flow-suite.ps1` measured **35 PASS / 0 FAIL / 0 SKIP, 35 of
35 classified**, at `repo_head 574271ff`, with unchanged `native/src`, no retail
file writes, and only the known DQK DOSBOX directory-mtime observation.

Pool direct entry 15 is now correctly accepted as its exact terminal `SPRITE_OFF`/`CALL` branch with no fabricated combat artifacts. The standing flow-status gate remains correctly armed: a
missing required DOSBox is a hard runner failure, never a PASS or SKIP.

## Continuation — recoverable CoK post-combat publication, 2026-09-13

`CCHOST` now reads and validates the CoK `GBCR` header, publishes its combat
RNG to the paused continuation, and only then mutates the persistent `GBPR`
and source save records. A missing or unwritable effect sink therefore fails
before HP, conditions, or XP can change; retrying after it is repaired cannot
apply the same combat XP twice. Full GBCR row/count validation remains at the
roster-mutation boundary.

`cchost-test.ps1 -Headless` adds a valid CoK request whose effect path is
absent. It requires the ordinary invalid-result diagnostic and byte-identical
party data after rejection, alongside the existing valid, malformed, Gen1,
and generic-fallback cases. The focused DOSBox test and `build.ps1 -Target
engine` pass.

### Complete GBPR preflight, 2026-09-13

Before CCHOST publishes a CoK continuation or writes any party member, it now
validates the complete declared `GBPR` body: the file must be exactly
`16 + member_count * 410` bytes, and a compact roster must carry `GBD1` at
the declared position in every member. A header-only roster, an unclaimed
trailing byte, a partially truncated member, or malformed compact metadata
rejects the handoff with the normal invalid-request result and leaves the roster
and continuation unchanged. `cchost-test.ps1 -Headless` proves those cases with
byte comparisons.

This is structural preflight, not an all-or-nothing write transaction. A later
failure during a multi-file or multi-member publication still needs recoverable,
idempotent commit semantics.

### CCHOST v1 recovery extension, 2026-09-14

The cited preflight limitation is now narrowed for populated v1 combat
handoffs. CCHOST's `GBTX` sibling retains the exact fresh GBCR plus an appended
GBPR preimage, exact source-field preimages for each low slot that existed,
and, for an active DoK Cast, the original fixed WIZ sidecar. A
`FINALIZING` record completes only the result's consumed receipt. A `PREPARED`
record restores the roster, exact source-save field preimages, and WIZ sidecar,
then removes itself so the ordinary process can apply the original result once.
`cchost-test.ps1` has DOSBox fault builds at both boundaries and compares the
restored preimages before retry. This does not make CoK's v2 continuation RNG
publication, checkpoints, or inventory a shared crash transaction.

### Exact CCPARTY prior-roster preflight, 2026-09-13

CCPARTY now distinguishes a missing output, which starts a new roster, from an
opened malformed sidecar, which stops before it can create or truncate anything.
The existing GBPR must be exactly `16 + member_count * 410` bytes with the
matching version, profile flags, and record width and no trailing byte. A short
native record can therefore no longer be read from its zero-filled receive buffer
and written back as a damaged character. `ccparty-test.ps1 -Headless` proves
short and trailing CoK native files fail with byte-identical inputs, and that an
intact native DoK roster cold-reloads byte-for-byte.

## Continuation — C64 scene selection correction, 2026-09-13

C64 `/G 3` is not universally a DOS fallback. When the user converts a solved
fixed-size C64 `PIC*` plus its sibling `CHARSET` with
`tools/c64_native_scene.py`, the resulting `C64SCENE.GBI` is a self-contained
GBIM resource beside the mounted game assets. GBBOOT accepts it only when its
block id matches CCECL's selected `PICTURE` id, and CCFP renders its C64 palette
and pixels while retaining DOS fallback for other resources.

`gbscene-dos-flow-test.ps1` proves that path from DoK C64 Side 1 `PIC70` (block
112): it requests `/G 3`, requires the imported-C64 plan, ensures the GBIM is
not overwritten, and compares the decoded source pixels directly with the
composited DOSBox frame. C64 first-person walls, icons, portraits, and sprites
remain separate work; their file layouts are not yet sufficiently decoded.
## Continuation — packaged DOS client refresh, 2026-09-13

### Runtime-root and title-music package contract, 2026-09-13

`BuildReleasesVHD.ps1` now copies every available generated title stream
(`COKTITLE.GBM`, `DOKTITLE.GBM`, `DQKTITLE.GBM`) beside both the short root
runtime and `C:\GOLDBOX`. `MANIFEST.TXT` records those GBM files with the
same byte/hash contract as the COM helpers. The guest verifier now requires
the CoK stream at both locations, along with manifest-matching root
`GBBOOT.COM`, `CCECL.COM`, and `CCCOMBAT.COM`; it also compares complete
party, continuation/RNG, and checkpoint inventory state across a deliberately
C:-stateless cold reload.

Both pinned external scripts parse, the repository manifest validates all 23
COM helpers, and `BuildReleasesVHD.ps1 -StageOnly -KeepStage` produced 418
files. Each GBM root/package pair hashes identically and has its exact manifest
row. The current published `DOS-TOOLS.img` predates this contract and lacks
root `CCECL.COM`; an atomic image rebuild and guest verifier pass remain due
once C: has enough temporary publication space. Do not describe the published
image as refreshed until that final step completes.

`C:\LLM\DOS\DOS-TOOLS.img` and `.vhd` have been rebuilt from the current
native artifacts. The 268,369,920-byte FAT16 image is
`65862642D250A3F2B4E771C7E9475C316C2352EE1B32B310666EAE25E38C92DB`;
its 512-byte-footer VHD is
`06E9BBEE12D8720E59AF701C2507C3671D9319046342BD545DC6E086DEC99748`.

The guest-only release check mounts the image read/write and validates its
`C:\GOLDBOX` manifest. `VerifyGoldBoxPlayableVHD.ps1` then runs the packaged
`C:\GOLDBOX\START.BAT` against a disposable user-owned CoK mount through
combat and resume, and exercises DQK area 18. The VHD therefore contains the
current clean-room client rather than relying on a host build directory. It
still expects the player to mount a chosen game-assets drive; a title selector
and image-only nested-layout route remain separate front-door work.
## Continuation — VHD graphics selector, 2026-09-13

The packaged `C:\GOLDBOX\START.BAT` now has an explicit artwork selector before
normal GBBOOT options:

```dos
C:\GOLDBOX\START DOS /E
C:\GOLDBOX\START AMIGA /E
C:\GOLDBOX\START C64 /E
```

Those branches send `/G 1`, `/G 2`, and `/G 3` respectively. A first argument
other than those exact selectors retains the original forwarding behavior, so
`C:\GOLDBOX\START /E` remains valid. The generated `C:\GOLDBOX\README.TXT`
explains the selector and the existing Amiga/C64 resource fallback rules.

`VerifyGoldBoxPlayableVHD.ps1` first validates the original root and nested
runtime hashes and completes its CoK combat/resume and DQK area-18 routes. In
that disposable image copy it then replaces root `GBBOOT.COM` with the
packaged `GBMARK.COM` recorder and requires the exact launched tails
`/G 1 /E /X`, `/G 2 /E /X`, `/G 3 /E /X`, and the legacy `/E /X`. This tests
`START.BAT` itself; GBBOOT writes its banner through DOS fast-console output,
which intentionally bypasses redirected stdout. The image remains length-stable
through the probe.

The rebuilt 268,369,920-byte image SHA-256 is
`D1A9114933976F813441C593FB405CBEA6A77686182F2CEB2374790A5C925B13`; the
268,370,432-byte VHD SHA-256 is
`73D911998EE966AC95BC7DDBA8A5B9DA984B221CFC61CA61EFCE503130077278`.
`BuildReleasesVHD.ps1 -ValidateGoldBoxManifest`, `VerifyReleaseVHD.ps1`, and
`VerifyGoldBoxPlayableVHD.ps1` all pass. The native manifest pins both changed
external scripts. A title-selection UI and an image-only nested-layout route
remain the next VHD front-door work.
## Continuation — VHD nested title selector, 2026-09-13

The packaged `C:\GOLDBOX\START.BAT` now accepts `COK`, `DOK`, or `DQK` before
an optional `DOS`, `AMIGA`, or `C64` artwork selector. A mounted multi-title
library uses `GAME\COK`, `GAME\DOK`, and `GAME\DQK`; the matching root folders
are also accepted. For example, `START COK DOS /E` changes into `GAME\COK` and
forwards `/G 1 /E`. A requested title whose marker is missing ends before
GBBOOT runs. Existing option-only invocations remain valid.

The VHD guest verifier stages a disposable nested CoK library from held assets,
runs that real `START COK DOS /E /X` route, requires its GBPR output, and
compares every mounted input hash before and after. It then substitutes the
packaged `GBMARK.COM` only in the disposable image copy to prove the exact
selected tail and that missing `DOK` never reaches GBBOOT. Direct CoK combat
and resume plus direct DQK area-18 coverage remain in the same guest check.

The regenerated 268,369,920-byte image SHA-256 is
`FD42EAC8AEA44584DBDBB621828841070C09BAAC91BDD4E9DEE926EADD472FE5`; the
268,370,432-byte VHD SHA-256 is
`61B27FAA3298609A6FEB9AD2D44AB5BC8D3CC2BB874E05029E59890EA567A1FB`.
`VerifyReleaseVHD.ps1` and `VerifyGoldBoxPlayableVHD.ps1` pass. Library
selection remains intentionally bounded to these documented titles; add real
nested DoK/DQK guest routes before describing a broader library as covered.
## Continuation — profile-resolving private DOS sessions, 2026-09-13

`native\run-goldbox.ps1` generalizes the existing CoK player-session safety
contract. Before calling `New-PlayerSession`, it verifies one direct CoK, DoK,
or DQK layout, or a nested `GAME\COK` layout. The resolved session retains the
whole source tree as D:, puts fresh native `.COM`/`.GBM` artifacts in its own
`GREYBOX` C: runtime, and changes to `GAME\COK` when that nested route is used.
An unsupported or ambiguous source throws before a player snapshot exists.

`run-goldbox-session-test.ps1` makes synthetic fixtures for all four shapes. It
requires the resolved profile, private runtime, exact nested `CD`, resume and
party-menu routes, source SHA-256/timestamp preservation, and no session
creation for an unrecognized directory. It passed, followed by `-PrepareOnly`
against the held CoK, DoK, and DQK installs. This is a safe launch/session
improvement, not a claim of full campaign support; multi-title VHD selection
and broader nested-title coverage remain open.
## Continuation — DoK Gen1 `SHORT_MENU`, 2026-09-13

DoK's Gen1 `SHORT_MENU` (`0x31`) now takes the same player-selected `/!`
bridge as the already-supported Gen2 form. CCECL recognizes DoK from its
sibling `DKK.CFG`, decodes its compact inline frame through the shared bounded
menu handler, and preserves the opcode in the identity-bound pending record.
CCMENU validates it and cold resume writes only the selected zero-based choice
at the post-menu PC. Outside explicit `/!`, DoK `0x31` remains a recorded-only effect so unattended native traversal does not apply an inferred default choice.

`ccecl-dok-short-menu-test.ps1 -Headless` builds a DKK.CFG fixture with the
actual compact frame shape (`wordSet=2`, count at byte 1), renders `JUMP` and
`WAIT`, selects `WAIT`, and proves a following ECL write after a cold restart.
This is deliberately a DoK-only dispatch: Pools, PoD, Treasures, and Buck need
explicit title/profile identity and title-grounded smoke coverage before their
Gen1 `0x31` frames may enter the interactive path. CoAB and other long Gen1
forms remain recorded-only. CCECL is 65,276 resident bytes, with 4 bytes left
below the `.COM` ceiling.
## Continuation — player-selected INPUT_NUMBER, 2026-09-13

`INPUT_NUMBER` (`0x0F`) now yields through the existing `/!` menu bridge when
its evaluated source maximum is `0..254`. CCECL records the original
destination and maximum in GBSX, publishes `max+1` choices with an empty
GBMT payload, and does not write the destination before the answer. CCMENU
validates that two-operand shape, renders `NUMBER 0..max`, accepts decimal
`0..max` directly, and returns the zero-based number in the identity-bound
GBMO v2 record. Cold resume validates the same range before writing it at the
post-input PC. Oversized interactive ranges retain the deterministic `/L`
behavior; no unchecked value is emitted.

The grounded retail contract is Neverwinter Nights `ECL5.DAX#51 @0x9558`:
it writes `#25` to `[0x7F79]`, then invokes `INPUT_NUMBER [0x7F79],[0x7F79]`
and copies the clamped value to both password-index cells. The installed NWN
tree is not mounted in this workspace, so the DOS test uses that exact
two-operand shape and value 25 without claiming an unrun retail route.
`ccecl-menu-resume-test.ps1 -Headless` selects 17, proves the pending record
has count 26 and no text segments, and verifies both the input destination
and a following ECL operation after cold resume. `ccmenu-test.ps1 -Headless`
also rejects a payload whose maximum and declared count disagree. CCECL is
65,267 resident bytes, leaving **13 bytes** below the `.COM` ceiling.

`INPUT_STRING` remains a deterministic `/L` response. It needs a separate
bounded string-memory and keyboard-entry contract; do not represent its
string as a numeric menu choice. The next `SHORT_MENU` work is title/profile
identification and smoke coverage for Pools, PoD, Treasures, and Buck; then
take combat turns, narration, and VHD selection from the current task list.

## Continuation — player-selected WHO, 2026-09-13

`WHO` (`0x39`) is now a player selection under CCECL's explicit `/!` route.
The VM copies the existing validated GBPR roster's body-offset-zero
length-prefixed names into bounded ASCII `GBMT` segments, yields before writing
the destination, and records the instruction as its exact one-operand GBSX
event. CCMENU accepts that opcode only with the exact destination operand,
renders its ASCII labels, and writes the same identity-bound GBMO v2 answer as
the other bridge menus. Cold CCECL resume revalidates the shape and writes the
zero-based member choice once, at the post-WHO PC.

`ccecl-menu-resume-test.ps1 -Headless` uses a three-member GBPR fixture to
render TIKA, TANIS, and RAISTLIN, choose RAISTLIN, and prove the following ECL
operation sees member index 2 after the cold restart. `ccmenu-test.ps1 -Headless`
independently writes that selection and rejects a malformed WHO
event with two operands. The additional code and six 16-byte name slots leave
CCECL at 65,202 resident bytes — **78 bytes** below the `.COM` ceiling.

The next gameplay input remains numeric INPUT_NUMBER/INPUT_STRING: derive a
title-owned range/prompt contract, represent it without exhausting that 78-byte
budget, and prove accepted and rejected values through cold resume. Do not grow
the inline-menu payload: installed scans still bound it at 104/99 bytes, while
the fixed 128-byte tail already covers that measured corpus. The VHD front door
still needs its title selector and nested-layout image-only route.

The follow-up `native/run-flow-suite.ps1` measurement ran from 06:38:24Z to
06:47:58Z on 2026-09-13, at source commit `c14b3679`. Its checked-in artifact
records **30 PASS / 0 FAIL / 0 SKIP**, `native_src_dirty=false`, and an
unchanged source content hash during the sweep. The only retail observation was
the already-known `The Dark Queen of Krynn/DOSBOX` directory mtime movement;
there were no retail file writes. During the required core suite, the DQK-art
fixture exposed a detached synthetic text slot left behind by the narration
ordering change; it now writes its matching PRINT event and passes the source
ordered CCFP text assertion.

## Continuation — v14 compact menu bridge, 2026-09-13

The installed Gen1 and DQK inline-menu scans bound raw `GBMT` text at 104 and
99 bytes respectively. The prior fixed 512-byte tail therefore consumed 384
bytes in CCECL without covering a measured title input. The continuation now
publishes an exact 5,920-byte **v14** record with a 128-byte fixed `GBMT`
payload. CCECL, CCMENU, GBBOOT, and CCEFX all require v14 for a menu yield;
the former v13 layout and future versions reject before an answer or VM state
can be accepted.

At that revision this restored CCECL from 1 to **385 bytes** of `.COM` headroom. The focused
CCMENU and CCECL DOSBox tests cover strict length, old/future-version rejection,
synthetic and retail choices, and CCEFX's v14 reader. The next selected
gameplay implementation should use that capacity for player-selected `WHO`,
then numeric input, rather than enlarging the inline text tail. The VHD front
door still needs a title selector and an image-only nested-layout route; those
are separate packaged-client tasks. The clean-source flow sweep at `23c3bb69`
records **30 PASS / 0 FAIL / 0 SKIP**, with neither a dirty source tree nor a
source hash change during the run.

## Continuation - v13 complete-label player-menu bridge, 2026-09-13

`GBBOOT /!` drives CCECL's yielded vertical or horizontal menu through sibling
`CCMENU.COM`, consumes its exact `GBMO` v2 sidecar, and cold-resumes the VM.
The exact 6,304-byte v13 record retains the v11 `GBMN` identity and v12 `GBMS`
state, then appends `GBMT`: a fixed 512-byte store of the raw packed prompt and
every option label. CCMENU validates the whole record, decodes the strings, and
renders numbered choices before accepting either player input or the headless
`/S` selection.

The focused DOSBox smoke executes `COMPARE`, `LOAD_CHARACTER`, and
`LOAD_MONSTER` before yielding, verifies the v13 state/tail, asserts rendered
vertical (`PICK`, `LEFT`, `RIGHT`) and horizontal (`YES`, `NO`) labels, then
proves the queued monster remains after cold resume. Both CCECL and CCMENU
reject truncation, trailing bytes, bad segment count/bounds/padding, stale
versions, malformed sidecars, response swaps, and replay before VM mutation.
GBBOOT's engine matrix passed after the v13 change.

The bridge is intentionally fail-closed when an interactive menu contains a
non-inline label or needs more than 512 raw packed bytes. The next menu work is
therefore capacity evidence from retail menus or a larger/external text bridge,
not another unbounded tail.

## Continuation - CoK natural menu/combat route, 2026-09-13

`native/gbcok-playable-flow-test.ps1` now stages a separate writable retail
CoK mount for a player-visible menu route. It writes a GBSN pose for `(4,15)`
facing west (the even engine direction value `6`), then runs exactly
`GBBOOT /E /! /C 0 /T 1`: no `/@` direct-PC test probe and no `/B` event
injection. CCFP moves once to `(3,15)` and emits descriptor 156 in GBST;
GBBOOT dispatches the source-owned continuation, displays all three menu
prompts including `ATTACK / WAIT / LEAVE`, enters combat, cold-resumes, and
records the source consumption flag `4C55=0020`. The test passed under DOSBox
with the prior creation/persistence route unchanged. The next menu acceptance
work is a genuine revisit with distinct answers and retail long/many-option
capacity evidence.

## Continuation — stepped scene trace attribution, 2026-09-13

`gbscene-dos-flow-test.ps1` had reported that DoK's ordinary `/T 1` route
dropped its opening picture 112. The renderer did present the full
`112,96,113,77,112` source sequence; later in the same DOS process, a resumed
combat handoff replaced `_GBPICS.BIN` with the source-order suffix
`96,113,77,112`. The final sidecar alone therefore could not be compared to the
initial `_GBECL.TXT` record.

The flow now captures each distinct `GBPI` sidecar while DOSBox runs. Its
stepped acceptance requires a complete initial source sequence and requires
the final replacement trace to be a nonempty contiguous source subsequence.
GBBOOT also now treats both the DOS child return code and termination type as
failure conditions before counting a scene as replayed.

The clean-source 30-flow sweep at `5a52c01f` records **28 PASS / 2 FAIL / 0
SKIP**. The remaining failures are `gbdqk-create-test.ps1` (area-5 RANDOM/ADD
does not reach retail range `C1=5..9`) and the quarantined
`gbdqk-combat-flow-test.ps1` (missing expected combat effect dump). The
focused flow-status and documentation gates pass 78 assertions.

## Continuation — DQK area-5 vmRun/slot-3 transition, 2026-09-13

The two remaining DQK failures were one route defect. `GBBOOT /E /A 5 /3 0`
had started CCECL directly at slot 3 using placeholder `C1`/`C2` values. Retail
area 5 enters vmRun1 first: its selector inputs produce the `CA=14`, `CB=5`,
and `CC=E5` state, and slot 3 then resumes from that state. GBBOOT now follows
that order. It writes vmRun1 to `_GBEVT.BIN`, recognizes the natural transition,
and invokes slot 3 with the emitted state; the final combat effect is still
`_GBECL.BIN`.

`gbdqk-create-test.ps1` now observes retail-generated `C1=5..9` and `C2=3..5`.
`gbdqk-combat-flow-test.ps1` inspects both the first vmRun effect and final
combat effect, rather than treating the intentionally cleared final seed
sidecar as first-phase state. Its direct and ordinary stepped routes both pass.

The clean-source sweep at `23a9cd84` records **30 PASS / 0 FAIL / 0 SKIP**:
all 30 scripts produced a verdict, `native_src_dirty` is false, the source hash
did not change during the run, and `retail_folder_writes` is empty. The only
retail observation is the established `The Dark Queen of Krynn/DOSBOX`
directory-mtime touch from DOSBox itself. The 2026-10-07 combat quarantine is
closed.

## Continuation — Gen1 `0x41` AWARD_XP, 2026-09-12

CoK now dispatches `0x41` to `op_award_xp` and applies its retail split to the
transient GBPR supplied by GBBOOT: positive CCH `+0xF9` count, 16-bit integer
division, `+0x189` eligibility, and u32 `+0x116/+0x118` XP addition. The
headless fixture proves party-wide and selected modes, quotient truncation,
carry, and ineligible no-write. This closes the former Gen1 `0x41` rejection
and bad-opcode/skip-path concern for CoK.

DoK now also dispatches `0x41`. CCPARTY derives a per-class next-level cache in
the GBD1 tail from the recovered retail category map, caps, and threshold table;
CCECL applies the member-local split to raw `+0x62/+0x64` XP and refreshes
`+0xc6` from that cache. This keeps the exact matrix out of CCECL's constrained
COM image. The DOSBox smoke proves party and selected paths, u32 carry,
threshold readiness, zero-slot no-write, and no write without the cache. The
coverage report now records 22,072 applied / 5,749 recorded-only / 0 no-handler
/ 27,821 total.

### Continuation — DoK `0xADCC` redraw dispatch, 2026-09-12

CCECL now treats Gen1 CALL routine `0xADCC` as DoK's redraw-dungeon-view
sibling of CoK's `0xAE11`. This is based on DoK's own `GAME.OVR:0x2ab1`: its
first CALL-dispatch arm compares `0xADCC`, calls its view routine, and returns;
the next `0x3204`, `0x401F`, `0x4019`, and `0xE804` arms retain CoK
`GAME.OVR:0x3c07`'s order. The bounded native effect is a position/facing pose
snapshot in the existing CALL event. It does not claim to calculate a GEO
wall or roof id, which this small COM client does not load.

The raw DoK operand `0x2DCB` now widens its record from `ARGC=02` to `ARGC=05`
with routine id `0xADCC` and the pose, alongside the existing CoK `0x2E10` /
`0xAE11` control. An unknown CALL remains `ARGC=02`. The refreshed reachable
corpus census is 290 of 321 CALL sites grounded (90.3%); the focused coverage
suite and the DOSBox CCECL effects smoke pass.

### Continuation — GBBOOT allocation boundary fixture, 2026-09-12

The corpus allocation probe had a fixed synthetic `+32` image. GBBOOT now emits
65,010 bytes (65,266 resident), leaving only 14 bytes below the 65,280-byte COM
ceiling, so that fixture had become invalid despite the real client and its
resize arithmetic remaining valid. The probe now derives its middle fixture
from half of the live remaining COM space; its current-size, midpoint, and
exact-ceiling cases still execute the real `shrink_mem` routine, while the
existing old-byte-arithmetic control remains red if the paragraph calculation
wraps.

### Continuation — canonical CoK native race/class fields, 2026-09-12

`CCPARTY` native CoK creation now writes the same two byte roles as a retail
409-byte saved-character record: Human race `6` at `+90`, and the selected
zero-based `START.EXE` class enum at `+91` (Cleric/Fighter/Ranger/Knight/Mage/
Thief = `0/2/4/7/5/6`). It previously wrote an unrelated provisional class
number at `+90` and left the true class field empty. This was observable by
the existing native stats code, which correctly treats `+90` as race.

`ccparty-test.ps1` creates all six offered classes in DOSBox and pins each
race/class pair plus its class-specific starting and current HP. This only
closes the race/class subpart of the open creation item: retail level,
eligibility, and starting-grimoire derivations remain open.

### Continuation — native CoK level-one creation state, 2026-09-12

`CCPARTY` now writes the class-level slot used by the retail camp predicates for
each offered class: cleric 0, fighter 2, ranger 4, knight 7, mage 5, and thief
6, all at level one. It also sets CCH `+393=1`, which `GBBOOT`'s menu admission
checks directly. These are no longer blank fields on a native-created character.

The bounded caster initialization comes from the held CoK capacity producer
(`GAME.OVR` F7:25 at `0x39F1F`, with its F7:2A helper), independently executed
by `tools/test_cok_spell_capacity.py`: a level-one Wisdom-18 cleric gets capacity
three and known spell ids 1, 3, 5, 6, and 8; a level-one mage gets capacity one.
`ccparty-test.ps1 -Headless` creates all six classes under DOSBox and checks the
complete eight-slot level array, active byte, all 20 capacity bytes, and all 107
known-spell flags. It passed after this change.

An isolated held-retail `START.EXE` creation run on 2026-09-12 closes the mage
grimoire boundary: it presents no spellbook-selection dialogue and, after save,
its `SAVE\\MAGE.WHO` record has known spell ids 11, 12, 15, 18, and 21. The retail
record was level two with two mage slots; native creation intentionally keeps its
level-one capacity of one but now writes the same automatic five known-spell flags.

The three GBBOOT-created CoK flow fixtures (`gbintro-flow-test.ps1`,
`gbcok-playable-flow-test.ps1`, and `gbboot-create-test.ps1`) now pin that
same pair; their former single `+90` check encoded the provisional class
numbers and correctly became red when creation was repaired.

The separate `mem_regained` F7:48 predicate remains `+90 == 6`: the
retail-derived `tools/cok_memorization.py` model and the DUAL/HOLYOLD fixture
family show that this branch is keyed by Human race, not Mage class. It was
briefly reinterpreted during the creation-field repair and was restored before
the final flow sweep.

### Continuation — CoK GBPS v6 assertion refresh, 2026-09-12

`gbboot-test.ps1`'s five CoK sidecar checks now explicitly require the
3,160-byte GBPS v6 form. The native inventory bridge has appended its 32-byte
ownership-query bitmap and upgraded CoK seeds from the 3,128-byte v5 prefix
since the bridge landed; the tests still expected v1 or v5 and stopped at
`XSEED` before reaching their remaining assertions. The generic sidecar helper
now has a distinct v6 length case, and validates the inherited v4 ownership
flag against the fixture rather than assuming every v6 seed carries imported
effects. Its empty-CoK-roster distance fixture also retains the zero-member
count flag produced by the authoritative GBPR. Scalar-only CoK launches now
also positively require their inventory-backed sidecar, and the automatic/cloud
fixtures pin their actual zero-member GBPR count. The affected explicit-seed, distance,
automatic-party, owned-affect, and cloud-affect controls each name version 6.

### Current certification — `be8e192`, 2026-09-12

The cache capability is now set only after CCPARTY has recovered at least one
usable retail threshold. Retail DoK records therefore carry GBD1 flags `0005`;
native-created DoK and DQK compact records retain base flags `0001` and cannot
be mistaken for award-cache-bearing retail bodies. The selected-thief block-51
path now explicitly proves that `0x41` records the award and continues to the
door-trap combat handoff rather than treating its former pre-`0x41` stop as a
success. The foreground flow sweep at `be8e192` recorded **30 PASS / 0 FAIL /
0 SKIP**, clean and unchanged `native/src`, no retail-file writes, and only the
known `The Dark Queen of Krynn/DOSBOX` directory-mtime observation. Focused
award, coverage, effect, flow-status, and README-subject gates passed **147**
tests.

`C:\LLM\DOS\DOS-TOOLS.img` and `.vhd` were regenerated from this current
native build. `VerifyReleaseVHD.ps1 -BaseName DOS-TOOLS` passed structural and
DOSBox-Staging guest mount/read/write checks for both formats. A direct VHD
guest listing confirms `C:\GOLDBOX\CCECL.COM` is 23,412 bytes and
`GBBOOT.COM` is 65,010 bytes; `C:\GOLDBOX\START /E` remains the documented
entry point with user-supplied game assets mounted as another drive.

### Continuation — refreshed DOS client image, 2026-09-12

After the native CoK creation changes at `37fd167`, both public
`C:\LLM\DOS\DOS-TOOLS.img` and `.vhd` were regenerated from the verified
`native\build` directory. `VerifyReleaseVHD.ps1 -BaseName DOS-TOOLS` again
passed FAT16 structure plus DOSBox-Staging guest mount/read/write checks for
both formats. A separate guest mount of the VHD listed `C:\GOLDBOX` and copied
back `CCPARTY.COM` (17,512 bytes, SHA-256
`DAE0B9F0086606D0F401A2B1426DDD2C2D38A5E16D0B07AB80866729C5CCD8AE`),
`CCECL.COM` (23,422 bytes, SHA-256
`E90E4130044BA1552DC7F9DCCF952AC917D3E9EA13C6C298E9844D2A23D88910`), and
`GBBOOT.COM` (65,010 bytes, SHA-256
`F2AB077CDE57C126FE57B68BB6AE3479F6445C44C5A09CD424FA95B8C662AB59`). Each
hash exactly matched its current `native\build` source. `START.BAT` remains
present as the `C:\GOLDBOX\START /E` launcher for user-supplied game assets.

### Continuation — exact DQK QSV roster walk, 2026-09-12

`CCPARTY /Q` no longer searches `SAVGAMA.QSV` byte-by-byte for six
CCH-shaped candidates. It validates the duplicated party count, starts with the
physical record at `0x40F`, and advances through the verified variable layout:
`0x1A1` fixed bytes, 17 bytes per item, 9 bytes per affect node, and the
six-byte null-pointer terminator. The CCH projection begins at physical `+8`
(`0x417` for member one), which reconciles the formerly conflicting physical
record starts `1039,1547,2081,2640,3166,3708` and CCH starts
`1047,1555,2089,2648,3174,3716`. `ccparty-test.ps1 -Headless` imports the
retail variable-tail six-member QSV through a staged mount and validates its
GBPR slots, names, `GBD1` metadata, and output verdict. It passed with the
native client at 17,664 resident bytes. QSV writeback and DQK `0x41` XP
persistence remain open.

The authoritative follow-up sweep at `9868136` recorded **30 PASS / 0 FAIL /
0 SKIP**, with `native_src_dirty: false`, unchanged source bytes through the
run, `retail_folder_writes: []`, and only the established retail DOSBox
directory-mtime touch. `native/flow-status.json` is the corresponding
committed-source artifact.

### DQK `0x41` live-write control — 2026-09-12

The first retail-shaped area-65 replay did terminate after `L,T,A,Enter`, before
the queued `B` and fetch gate. That negative result remains useful: its `ca03=4`
resume state does not reproduce the old route. The archived successful route instead had
the old synthetic `ca03=0xfef0` state. Replaying that state in the disposable
`native/build/dqk-award41-trace-20260912` copy reached the retail `0x41 [1,100]`
handler and its following `SAVE`/narration sequence.

The initial watch followed `DGROUP:b20f`, which is save-transfer state, and therefore saw no
award writes. `tools/unicorn_dqk_trace.py` now accepts
`--watch-current-record-pointer`; pointing it at the handler's actual party-list root
`DGROUP:c6e5` observed `25a4:27f6/27fa` change a record's u32 XP from `0x000f4241` to
`0x000f6951` (+10,000), then `25a4:280c` write readiness `+0xcd = 0`. The handler and
write locations are retail code; the route control and `0xfef0` resume state are synthetic.
This proves an XP-like mutation and readiness recomputation for one admitted party record.
Follow-up disassembly of that exact retail handler closes the multiplier and split questions:
operand two is promoted to a u32 and multiplied by 100; a nonzero operand one walks the party
list, and each eligible record divides that multiplied amount by its own positive `+0xa5..+0xab`
class-slot count before adding it to `+0x44/+0x46`. It is a member-local multiclass split, not a
party-wide division. The shipped QSV independently places its persisted XP at embedded CCH
`+0x44` (200 for each of its six members); the first record's `0x000f4241` at `+0x3c` is a
distinct threshold-like field and must not be written as XP.

QSV persistence still remains open. GBPR's compact DQK projection has no validated provenance
mapping to its source's variable-length physical records, and the readiness helper's threshold
rule remains unlocated. Native DQK `0x41` therefore remains recorded-only. The handler is
`DQK.EXE:0x0429d9`; older `0x042ae9` prose was a transcription error.

## What changed this session (three commits, all pushed)

| Commit | Change |
| --- | --- |
| `1e45443` | Gates `native/ccecl-effects-test.ps1` under `pnpm test:corpus` via `tools/test_native_ccecl_effects.py`. That script sat in `native/test.ps1`'s `$scripts` array (not `$flowScripts`), so it was RED on HEAD from 03:15 that morning with nothing able to report it — not `flow-status.json`, not the coverage guard, not `native/test.ps1` itself (first-failure-abort, no `$LASTEXITCODE` check). |
| `28439f8` | Hardens all eight existing `tools/test_cok_native_*.py` gates: each now asserts the script it gates still **exists**, before the skip guards. Without it, deleting a gated script on a DOSBox-less machine (CI, a fresh clone) was a silent green. |
| `a5adc19` | Earns `native/ccecl-dok-b51-watch-test.ps1` a real verdict — 20 assertion `throw`s replacing its one 120-second timeout guard — and lands the coupled four-file edit (the script, `native/README.md`, `native/test.ps1`'s prediction comment, and `CLAUDE.md`) plus the measuring sweep in the same commit. |

### The two findings worth carrying forward

**A coverage guard that is blind to a gate written the natural way, and fails
in the direction that reads as safe.** `tools/test_native_gate_coverage.py`
derives the gated set by AST-scanning for a literal `'native/<name>.ps1'`
string constant *inside* a subprocess call, and deliberately does not follow
variables. The first draft of `tools/test_native_ccecl_effects.py` passed
`str(SCRIPT)`; the test ran and asserted correctly, and the coverage guard
reported the gated set as the unchanged known eight. A real gate looks like
no gate to this guard — the maintainer sees the count unchanged and either
concludes their file did not take effect, or does not look. Every gate
written this session keeps the `subprocess.run` call site's path as a
literal and asserts a module constant equals it, so the two cannot drift.
Documented in that guard's own docstring for whoever adds gate #10.

**An absence-shaped finding is satisfied by the instrument being absent.**
`ccecl-dok-b51-watch-test.ps1`'s headline claim since 2026-07-15 — "no
natural or probed trace writes `MEM[4CE9]`; only the seeded control does" —
survived a mutation that dropped `/T` from every CCECL invocation, i.e.
removed the trace instrument entirely. The run still printed
`gateWriteRows=0`, because "no trace recorded a write" and "there was no
trace" are the same output. The new assertion set's null (`Write7F79 > 0`)
closes exactly this: it fires only when the instrument produced no output at
all. Whenever a finding is stated as an absence, ask what a *missing
instrument* would print, and assert something non-zero only when the
instrument ran.

## Verified this session

| Check | Result |
| --- | --- |
| `tools/test_native_ccecl_effects.py` mutation test | one expected value changed (`$geo -ne 34` -> `-ne 35`); RED with the child's verbatim throw; restored, SHA-256 re-verified |
| Eight-gate hardening proof (no DOSBox launched) | fake repo roots: script absent + DOSBox absent -> BEFORE 3 skipped/exit 0 (silent green), AFTER 3 failed/exit 1; NULL (script present, DOSBox absent) -> 3 skipped/exit 0 both before and after |
| `ccecl-dok-b51-watch-test.ps1` — six mutations | all RED, each self-naming; all restored to SHA-256 `4b1a514a7a6872d6...`; mutation M1 (dropping `/T`) is the finding above |
| Gated-set derivation, independent re-check | `find_gated_native_scripts()` = 9, `parse_flow_scripts()` = 30, overlap = 0 |
| `native/run-flow-suite.ps1` (foreground) | **29 PASS / 1 FAIL / 0 SKIP of 30**, 30 of 30 classified, zero unclassified, at `repo_head a5adc19`. `native_src_dirty false`, `native_src_changed_during_sweep false`, start hash == end hash == `43415215...` (same engine bytes as the preceding 28/2 sweep). Roster byte-identical to the previous 30 (diffed against the committed artifact), so this IS comparable to the earlier 28/2 and 23/7 figures. Exactly one cell moved: `ccecl-dok-b51-watch-test.ps1` FAIL -> PASS. `retail_folder_writes` empty; `retail_dir_touches` populated with the one known `The Dark Queen of Krynn/DOSBOX` mtime move. |
| Armed disclosure gate + subject/coverage/docs checks | `GB_NATIVE_FLOW_GATE=1 pytest tools/test_native_flow_status.py tools/test_native_readme_subject.py tools/test_native_gate_coverage.py tools/test_docs_claims.py` — **112 passed**, exit 0, read unpiped |
| Full corpus collection | `python -m pytest tools/ --collect-only -q` — **5511 tests** (CLAUDE.md's stated count updated to match; was 5413 as of 2026-09-10) |

This table is the initial handoff snapshot. Its sole red,
`gbdqk-combat-flow-test.ps1`, was closed in the continuation below.

## Recommended next tasks, in order

1. **Standing native flow gate — ARMED 2026-09-12.** The fresh 30-flow sweep
   records 30 PASS / 0 FAIL / 0 SKIP, and `tools/test_native_flow_status.py`
   now runs its live artifact, freshness, README, and retail-write checks by
   default under `pnpm test:corpus` (52 focused assertions pass).
   - **5 — emulator and data prerequisites closed.** All 29 DOSBox-backed
     scripts in the 30-flow roster check the emulator before building or
     launching. Every flow except synthetic `gbbroader-flow-test.ps1` checks
     its named retail or Amiga files before staging or compiling.
     `tools/test_native_flow_preconditions.py` runs those 29 flows with a
     placeholder DOSBox and no data, requires an exit-0 `SKIP:` verdict before
     NASM output, locks the 29-to-1 roster classification, and mutation-tests
     both kinds of prerequisite guard.
   - **6 — probes shown able to fail.** Gateway and Secret raw GEO now
     mutation-test their selected GEO members, while Secret ECL/GEO and combat
     mutation-test their selected ECL and MONCHA members; all fail if their
     emitted bridges are unchanged. DQK-Amiga now mutation-tests its selected
     GEO member as well. A sweep is only as good as its weakest probe.
   This is the single highest-leverage remaining item: closing it turns
   `native/`'s entire flow suite into a gate that runs on every
   `pnpm test:corpus`, the same status the eight (now nine) `tools/test_cok_native_*`
   scripts already have.

2. **`native/dqkdrive.ps1` source-mount follow-up — CLOSED 2026-09-12.** The
   helper now stages `-GameDir` through `New-RetailStage`, writes its config
   and captures under `native\build\dqkdrive`, and has no direct `ForceFocus`
   call. The three lower-risk mount offenders named in this snapshot had
   already closed:
   `ccecl-buck-chained-step-scan.ps1` and
   `ccecl-nwn-chained-step-scan.ps1` stage their external sources as
   `buck-chained-step-scan` / `nwn-chained-step-scan`, and `cc-games.ps1`
   stages its selected retail title before mounting D:. A new static guard
   rejects a raw source mount in each case.

3. **Wider `ECL_GEN2` dialect propagation.** `tools/test_ecl_gen2_dialect_drift.py`
   (34 tests) now has no dated Gen2 frame divergence exemptions. `0x0c`, `0x1d`,
   `0x22`, `0x23`, and `0x2c` all use their verified DQK-wide frames: SETUP_MONSTER,
   PARTYSTRENGTH, PARTY_SURPRISE, SURPRISE, and PARLAY. PARLAY is a
   Gen2-wide one-operand instruction in both the generic frame resolver and
   its dedicated handler. Retail DQK areas 38 and 50 now prove that frame by
   preserving the following CALL/DELAY/PARLAY instructions instead of swallowing
   them as six legacy operands. `0x1f` now uses the
   verified one-operand Gen2 frame, `0x29` correctly bypasses the legacy
   14-operand reader as a zero-operand return, and `0x31` uses the verified
   short-menu `(2, countAt 1)` frame. `0x37` now preserves its verified
   two-operand Gen2 frame through a host-effect record rather than applying
   the legacy three-set wall loader; no title-specific state effect is claimed.
   `0x41` uses its live-proven two-operand frame. CoK applies the verified GBPR XP
   split; DoK applies its verified compact-record split when CCPARTY supplied
   the GBD1 threshold cache. The old Gen1 rejection is closed for both titles.
   The drift guard proves each becomes a reported divergence if either side moves.
   Quantified, not scheduled; the drift guard itself is green and will
   flag either side moving.

4. **`ccecl-dqk-vmrun-test.ps1` quantity provenance — CLOSED 2026-09-12.**
   Area 5's retail bytes use `RANDOM #5; ADD` for `C1` and `RANDOM #3; ADD`
   for `C2`, giving `C1=5..9` and `C2=3..5`. The smoke's observed `C1=6`,
   `C2=4`, and matching group counts are therefore retail-generatable, not
   synthetic host seeds. Its test locks the source sequence, both ranges, and
   the count-to-memory correspondence.

## What is NOT open, contrary to older planning docs

`docs/engine/PLAN-ROUND-37.md`'s round-38 list named eight items; cross-
checked against the current tree, five are already closed (not by this
session except where noted) and should not be re-picked up:

- Item 1 (the C11 subject-check guard) — shipped as
  `tools/test_native_readme_subject.py`, 2026-09-07.
- Item 2 (the shared DQK six-member GBPS seed, #1+#8) — both
  `gbdqk-flow-test.ps1` and its sibling now PASS in the sweep.
- Item 3 (`gbbroader-flow-test.ps1`'s `/O 3 0 8` pin) — confirmed PASS;
  the arguments were legitimate, per Q3's resolution.
- Item 4 (`ccecl-dqk-vmrun-test.ps1`'s stale pins, distinct from item 5
  above) — confirmed PASS.
- Item 6 (`ccecl-dok-b51-watch-test.ps1` and `cgb-gbim-test.ps1`, "run by
  nothing") — **closed this session.** `cgb-gbim-test.ps1` was already
  enrolled in `$flowScripts` and passes; `ccecl-dok-b51-watch-test.ps1`
  now has an earned verdict and is additionally gated under `tools/`.
- Item 7 (`retail_dir_touches` population) — populated; confirmed non-null
  in the current `native/flow-status.json`.

Only item 8 (arming the gate) survives from that list. Item 5's three mount
offenders closed in this continuation and `dqkdrive.ps1`, which was already
outside that three-item list, remains the sole source-mount follow-up.

## Continuation validation

`gbdqk-combat-flow-test.ps1`'s 2026-09-07 quarantine closed. Its direct slot-3
stage had left a damaged shared `_GBPARTY.GBP`, which its intended fresh-QSV
natural stage then reused. Clearing that transient file makes stage 2 load
`SAVGAMA.QSV`, retain DQK's real attack rate, and reach the asserted party-victory
and resume path. The authoritative foreground sweep then recorded **30 PASS / 0
FAIL / 0 SKIP of 30**, zero unclassified, from 2026-09-11T07:57:49Z through
08:06:53Z at `repo_head 1b25d42`, with matching `native/src` hashes
`43415215...`, no retail folder writes, and the known DQK/DOSBOX directory-mtime
touch only.

`native/test.ps1` now runs each smoke child in a separate `pwsh`, rejects any
nonzero exit, and classifies an exit-0 `SKIP:` before its PASS summary. Its
`-SelfTestRunnerSemantics` creates temporary skip and exit-7 scripts; both
branches are exercised by `tools/test_native_runner_semantics.py` without
DOSBox. This closes gate precondition 3. The runner still stops at its first
failure, and gate preconditions 4-6 remained open at that point.

`gbplayable-suite-test.ps1` now requires each child to emit PASS or SKIP,
rejects nonzero and clean no-verdict exits, and forwards `-Headless` to every
child that supports it. Its no-DOSBox self-test exercises PASS, SKIP, no-verdict,
and exit-7 cases; `tools/test_native_playable_suite_verdicts.py` runs that test
in the Python corpus. The real `-CoreOnly -Headless` suite passed with four
child PASS verdicts and 0 skips. This closes gate precondition 4; preconditions
5-6 remained open at that point.

The four playable core flows now emit `SKIP:` before build or launch when
DOSBox is absent; CoK also guards all eight copied retail files. The structural
guard `tools/test_native_playable_preconditions.py` proves those exits remain
early and that removing an exit-0 branch is detected. This advances, but does
not close, precondition 5 because the remaining flow roster has not been
audited.

### DOSBox preconditions across the full flow roster (continuation)

The full roster's DOSBox half of precondition 5 is now covered. The 20
scripts that previously either had no DOSBox branch or reached their build
before their first optional-data skip now exit 0 with a script-specific
`SKIP: ... DOSBox.exe absent` line before that build. Together with the nine
pre-existing guards, all **29** DOSBox-backed entries in the **30**-entry
`$flowScripts` roster have that contract; `ccecl-dok-static-combat-scan.ps1`
does not launch DOSBox.

`tools/test_native_flow_preconditions.py` proves this without local games or
an emulator: each script is copied into a miniature repository with no DOSBox,
must return 0 with the `SKIP:` line and no NASM output, and a control removing
`gbintro-flow-test.ps1`'s guard must turn red. The test passes 2/2. Real
headless control runs of `gbintro-flow-test.ps1` and
`ccecl-dqk-vmrun-test.ps1` still pass with DOSBox present. The retail/Amiga
continuation below completes precondition 5.

### Retail and Amiga data preconditions (continuation)

Precondition 5 is now complete. The source-file loops in the DQK, CoK, DoK,
Curse, Buck, Neverwinter, Secret, and CCECL flows had mixed placement: many
reached `build.ps1` first, and several created a retail staging mirror before
learning that required data was absent. Every one now returns its
script-specific `SKIP:` verdict before staging or compiling. The only
data-independent roster entry is the deliberately synthetic
`gbbroader-flow-test.ps1`.

`tools/test_native_flow_preconditions.py` now runs the remaining 29 roster
entries in a miniature repository with a placeholder DOSBox executable and no
game data. It requires a zero exit, visible `SKIP:`, and no NASM output for
every entry, asserts that the roster is exactly those 29 plus the one synthetic
exception, and includes a data-guard mutation alongside its DOSBox mutation.
The focused test passes 4/4. This closes the prerequisite side of the standing
flow gate; only proof that every passing probe can turn red remains.

### Gateway GLIB payload provenance (2026-09-12 continuation)

Gateway is the first of the five weak optional probes to close. Its GLIB GEO
header has 32 pointers; pointer zero names a big-endian id table and logical
area 1 resolves to member 1, the 1024-byte range `[266,1290)`. An isolated
baseline run and a run with that exact member zeroed both passed under the old
probe, but their `_GBWALL.BIN` files differed in **842 bytes**. The engine was
using the payload; the assertion simply failed to require it.

`gbgateway-glib-flow-test.ps1` now performs that staged mutation itself, reruns
the same `/A 1` route, requires a changed WGRD bridge, and restores
both staged GEO bytes and the baseline bridge. An inversion of its new
comparison was observed RED with `area-1 payload mutation left _GBWALL.BIN
unchanged`; the restored script passes.

### Secret raw-GEO payload provenance (2026-09-12 continuation)

Secret is the second former weak optional probe to close. Its raw `CCGEO` map
0 route skips GLIB member 0's id-table record and consumes member 1, the
1024-byte range `[162,1186)`. Zeroing just that staged member left the old
probe green, while its baseline and mutated `_GBWALL.BIN` bridges differed in
**563 bytes**. The engine consumed the map payload; the assertion had not
required it.

`gbsecret-hlib-flow-test.ps1` now performs that mutation itself, reruns the
same `/E /X` route, requires a changed bridge, and restores the staged input
and baseline bridge. An inverted comparison was observed RED with
`raw-GEO payload mutation left _GBWALL.BIN unchanged`; the restored script
passes.

### Secret ECL/GEO payload provenance (2026-09-12 continuation)

Secret's ECL/GEO preview is the third former weak optional probe to close.
The staged ECL id table resolves area 16 to member 2, the 7,014-byte range
`[950,7964)`. Zeroing exactly that ECL payload changes or removes the emitted
`_GBECL.BIN` bridge on the same route; the old probe only checked that its
baseline bridge had the expected bytes.

`gbsecret-glib-flow-test.ps1` now performs the staged ECL mutation, reruns
`/E /X /A 16`, requires the bridge to differ or be absent, and restores the
input plus every baseline output artifact. An inverted comparison was observed
RED with `area-16 ECL payload mutation left _GBECL.BIN unchanged`; the restored
script passes. At that point, Secret combat and DQK-Amiga remained for
precondition 6.

### Secret combat MONCHA payload provenance (2026-09-12 continuation)

Secret combat is the fourth former weak optional probe to close. Its direct
entry emits `LOAD_MONSTER(72,5,72)`; the staged MONCHA id table resolves
monster 72 to member 59, the 88-byte range `[5780,5868)`. Zeroing exactly that
record left the old flow green because its zero declared decompressed length was
accepted and the still-unpinned Secret stats fell back to deterministic values.

`CCCOMBAT` now rejects a zero declared length in a GLIB RLE MONCHA member.
`gbsecret-glib-combat-flow-test.ps1` zeroes the selected staged record, reruns
the same combat island, requires `_GBCOMB.TRC` to differ or be absent, and
restores every input and output artifact. An inverted comparison was observed
RED with `monster-72 MONCHA payload mutation left _GBCOMB.TRC unchanged`; the
restored script passes. Only DQK-Amiga remains for precondition 6.

### DQK-Amiga GEO payload provenance (2026-09-12 continuation)

DQK-Amiga closes the fifth and final former weak optional probe. Its staged
GEO id table resolves logical area 18 to member 5, the 712-byte range
`[8030,8742)`. The old flow asserted a valid area-18 ECL bridge and nonblank
preview, but not that its selected map payload affected either result.

`gbdqk-amiga-glib-flow-test.ps1` now zeros that staged member, reruns
`/E /X /A 18`, requires `_GBWALL.BIN` to differ or be absent, and restores all
baseline artifacts. An inverted comparison was observed RED with
`area-18 GEO payload mutation left _GBWALL.BIN unchanged`; the restored script
passes. Precondition 6 is met; the next action is to arm the standing gate.

The three changed PowerShell scripts parse cleanly. The focused staging guard
passes 4 assertions, including a mutation that restores `mount D "$BuckPath"`
and must fail. `python -m pytest tools/test_docs_claims.py::test_claude_md_states_the_real_corpus_suite_size -q`
passes with the re-measured **5522** collected tests.

`pnpm test:corpus` could not finish on this Windows/Python 3.13 environment:
after reaching 10%, the `unicorn` extension raised Windows access violations
in `mem_map` while `test_cok_effect7_context.py` and later
`test_cok_equipment_stats.py` created their emulators. The test launcher then
hung and was terminated. This is outside the staging change; the focused
checks above remain green. Re-run the full corpus once the local Unicorn crash
is resolved.

## CoK combat XP persistence correction (2026-09-12)

`GBBOOT` had been applying a party-win `GBCR` share to CoK body byte `304` as
a saturating u16. That location is the static defeated-monster flat-award term
(`CCH+0x130`) consumed by `calc_battle_exp`; it is not player experience. The
real player accumulator is u32 little-endian at `CCH+0x116`.

`native/src/gbboot.asm` now reads and writes all four bytes in both `_GBPARTY.GBP`
and the originating low-numbered `SAVE\\CHRDATA#.SAV`, adding the u16 GBCR share
with carry into the high word. `native/gbboot-test.ps1` starts synthetic player
records immediately below a 16-bit boundary and confirms both persisted values
cross it while `304..305` stays unchanged. This was compiled at **65,266 / 65,280**
resident bytes and validated by the 30-script flow sweep (**30 PASS / 0 FAIL /
0 SKIP**, native source clean and unchanged during the sweep), plus the armed
`tools/test_native_flow_status.py` gate (**52 passed**). `DOS-TOOLS.img` and
`DOS-TOOLS.vhd` were rebuilt and both mount/read/write-verified under DOSBox
Staging. Shipped in `0816d33` and `d2b2ca1`.

## CoK fallback-party combat resume (2026-09-12 continuation)

`CCECL` can intentionally synthesize a two-member CoK combat party when no
retail save or native roster exists. `CCCOMBAT` correctly returns a two-member
GBCR result in that case, while GBPR correctly remains empty. `GBBOOT` had
rejected that bridge at its CoK roster-count equality check and stopped the
post-combat native preview at gate 14. It now permits the zero-persisted-member
case only; populated CoK rosters retain exact GBPR-to-GBCR count matching before
any writeback.

The built `GBBOOT.COM` is 65,014 bytes (65,270 resident), leaving 10 bytes below
the DOS COM limit. `gbboot-test.ps1` now accepts GBCR v2 and pins the verified
CoK RNG transcripts for normal combat, command, flee, roster writeback, and the
combat-to-map/resume path. The latter fixture follows CoK's party-win comparison
state with `IF_GE`, so it exercises the intended map bridge.

`native/run-flow-suite.ps1` recorded **30 PASS / 0 FAIL / 0 SKIP**, with no
retail writes and only the known DQK DOSBOX directory-mtime observation. The
committed flow artifact is `bae1e8a`; the armed
`GB_NATIVE_FLOW_GATE=1 python -m pytest tools/test_native_flow_status.py -q`
check passes **52 tests**. The optional `gbboot-test.ps1 -EngineSmoke` pass is
not fully green: DQK area 4's deterministic headless menu cycle is now bounded
after its first completed branch, yielding `GBEF v0009 flags=0021 status=0000
geo=0004` without `GBHD`; the suite consequently reaches an independently
observed area-7 geometry divergence (`_GBWALL.BIN` is `28x28` where the captured
route expects `22x22`).

## VHD runtime manifest (2026-09-12 continuation)

`native/release-manifest.json` now declares the 22 `.COM` programs built by
`native/build.ps1 -Target all`, with each one required and guest-verified.
`C:\LLM\DOS\BuildReleasesVHD.ps1` reads that declaration, rejects a missing or
empty declared program before staging, and copies the same set to both the
image root and `C:\GOLDBOX`. `VerifyReleaseVHD.ps1` reads it too: its DOSBox
guest copies every declared program from `C:\GOLDBOX`, then checks byte count
and SHA-256 against the packaged manifest.

The checked-in declaration also pins SHA-256 values for both external VHD
scripts. Either script rejects the operation before work if either external
file drifts. `BuildReleasesVHD.ps1 -ValidateGoldBoxManifest` passed for all 22
current build outputs. A synthetic required `FUTURE.COM` failed that packaging
preflight and caused both the raw image and VHD guest checks to fail; the
temporary declaration was removed. Rebuilding `DOS-TOOLS.img` and
`DOS-TOOLS.vhd`, followed by `VerifyReleaseVHD.ps1 -BaseName DOS-TOOLS`, passed
both images with all 22 declared programs.

The task queue also records two audit-derived follow-ups: strict bridge-version
rejection for `GBEF`/`GBMN` and `GBMO`, plus a source-grounded live DQK DIG4
sound route and source-grounded retirement of recorded-only ECL CALLs. The
missing-DOSBox audit observation was rechecked and remains closed; required
native runners already fail closed.

## CCMENU v11 contract-fixture repair (2026-09-12 continuation)

The audit follow-up ran `native/ccmenu-test.ps1 -Headless` and found its valid
control could never write an outcome: the helper and bridge contract had moved
to v11/5,774-byte `GBEF` plus 18-byte v2 `GBMO`, while the fixture still wrote
v10/5,766-byte input and expected the retired v1 outcome. The fixture now
constructs the full v11 pending identity and validates every v2 outcome field.
It also proves both v10 and v12 input records are rejected without a sidecar.
`ccmenu-test.ps1`, `ccecl-menu-resume-test.ps1`, and the complete
`native/test.ps1 -CoreOnly -Headless` suite passed after the repair.

## Continuation — tactical command turn ledger, 2026-09-13

`CCCOMBAT` no longer treats Move as the whole player turn. It establishes attack
and movement ledgers once, returns from move mode to the command menu, and lets
a later `M` spend only the remaining movement. A spent attack budget clears the
remaining movement as in the sourced action-clear path. A headless move whose
script is exhausted ends the turn; it does not manufacture an AI action.

The command fixture splits a four-cell budget across `M44D` and `M4444E` and
requires exactly four first-round moves, with no attack against the enemy just
beyond that legal fourth square. It also proves an unsupported headless command
has the exact same trace as `E`, rather than falling through to auto-combat.
Blocked scripted movement leaves the remaining tape intact, so a rejected step
cannot consume a later direction or End command. `native/cccombat-test.ps1 -Headless`
passes the existing deterministic trace suite plus these controls.

## Continuation — fixed-size CCECL effect writes, 2026-09-13

`CCECL` now selects the serialized `GBEF` length at the DOS write boundary from
the completed VM status: ordinary v9 records use `FXLEN`, while pending menus
use `FX_V14_LEN`. DOS `create` is allowed to clobber `CX`, so the count is set
after that call and preserved across the subsequent write for the exact-byte
check. The old mutable output-length word could be corrupted into a short but
otherwise plausible sidecar. Removing it also reduces the resident image to
65,271 bytes, leaving 9 bytes below the DOS `.COM` ceiling.

`native/ccecl-effects-test.ps1 -Headless` passes the clock, Buck, DAX, HLIB,
and GLIB effect routes; `native/ccecl-menu-resume-test.ps1 -Headless` passes
the v14 pending-menu and cold-resume route. The required serial
`native/test.ps1 -Headless` suite also passed on this source, covering the
native effects, art, combat, party, session, launcher, and GBBOOT chains.

## Continuation — all-title private DOS sessions, 2026-09-13

`native/run-goldbox.ps1` now resolves a private native session for every named
Gold Box family profile: CoK, DoK, Pool, Curse, Secret, Gateway, Treasures,
PoD, NWN, Buck, Matrix, DQK, and FRUA. Each route requires a title marker and
the event/map archives used by `/E`; the held Countdown release instead uses
GBBOOT's already-proven `ECL1`/`GEO1`/`WALLDEF1`/`MON0CHA` data signature. The
resolver recognizes direct installs plus `POOLRAD`, the documented nested
release wrappers, and direct files below `GAME`, before it creates a player
snapshot.

The markers were checked read-only against all held GOG source trees for CoK,
DoK, Pool, Curse, Secret, Gateway, Treasures, PoD, DQK, and FRUA plus the held
Buck directory: every source resolved once. GOG Pool established the otherwise
easy-to-miss `POOLRAD` child; Gateway established its real `ECL2`/`GEO2` first
native route. `run-goldbox-session-test.ps1` now creates fixtures for every
accepted direct and wrapper candidate, verifies their exact DOS `CD` target,
source hash/timestamp preservation, private runtime ownership, resume, party
menu, and rejection before snapshot. It passed. This expands player-safe
session setup and asset selection; it does not claim full campaign coverage
for profiles whose native event semantics remain unfinished.

## Continuation — reclaim CCECL input-bridge headroom, 2026-09-13

`parse_opt_word` had a second copy of the decimal parser that
`parse_next_word` already implements exactly. It now advances past the option
name and jumps to the shared routine. This does not change command-line syntax
or numeric parsing, but reduces CCECL's resident image from 65,271 to 65,229
bytes and increases headroom from 9 to **51 bytes**. The current
`ccecl-effects-test.ps1 -Headless` suite passed its raw, DAX, chained,
HLIB/GLIB, combat-resume, timer, and deterministic opcode cases after the
change.

That makes a compact input bridge possible to investigate, but does not by
itself make `INPUT_STRING` interactive: GBMO currently carries only a numeric
choice, while source text input needs a separately bounded keyboard response
and cold-resume validation.

## Continuation — reclaim CCECL path-parser headroom, 2026-09-13

`/P`, `/G`, `/B`, `/E`, and the state half of `/R` each carried a copy of the
same DOS path-token parser. `parse_path_arg` now owns that logic, retaining the
established space delimiter and returning a slash to the option scanner. The
resume outcome parser remains separate because `/R` owns two ordered paths.
The current engine build measures CCECL at 65,085 resident bytes, leaving
**195 bytes** below the 65,280-byte limit. `ccecl-effects-test.ps1 -Headless`
passed after the refactor.

## Continuation — share CCECL area-id parsing, 2026-09-13

The optional Gen2 area-id path in `parse_args` also duplicated the decimal
reader. It now calls `parse_next_word`, leaving the same first non-digit for
the option scan and preserving the existing area-id contract. CCECL measures
65,054 resident bytes, or **226 bytes** of headroom. The focused effects suite
passed after this reduction.

## Continuation — Buck source HP in tactical combat, 2026-09-13

`CCCOMBAT` now uses the one Buck MON0CHA combat field established across the
entire retail corpus: byte 69 mirrors byte 227 and is nonzero in all 54
263-byte records. The loader requires that mirror relation before assigning
enemy HP and max HP. The synthetic Buck record carries the same mirrored value;
its deterministic combat trace now runs eight rounds, proving the source HP
changes tactical resolution. AC, THAC0, damage, XP, and movement retain their
previous placeholders because their offsets are not yet established.

## Continuation — Pools of Darkness retail `SHORT_MENU`, 2026-09-13

Pools of Darkness now joins DoK's verified Gen1 short operand-frame family.
CCECL looks for the title-owned `POOL4.CFG` sibling after the existing `DKK.CFG`
probe and before the long-family `POOL.CFG` probe. It enables the already-shared
`0x31` `SHORT_MENU` handler only for that marker. Pool of Radiance retains its
separate `POOL.CFG` loader-vbase profile and does not take this path.

`native/ccecl-pod-short-menu-test.ps1 -Headless` copies the held retail
`ECL1.DAX` and `POOL4.CFG` into a private mount. It starts `ECL1.DAX#51` at
decimal `33669` (`0x8385`), verifies the pending menu's `[0x0098]`, four-item,
and `0x31` contracts, displays `ATTACK / FLEE / TALK / WAIT`, then cold-resumes
the ATTACK answer and verifies its write to `[0x0098]`. The retail source tree
is never mounted or modified. CCECL measures 65,098 resident bytes, leaving
182 bytes below the DOS `.COM` ceiling.

## Continuation — Buck Countdown retail `SHORT_MENU`, 2026-09-13

Buck Rogers: Countdown to Doomsday has the same verified `0x31` menu framing,
but not the broader DoK/PoD operand-frame dialect. CCECL therefore carries a
separate `short_menu_opframes` flag: `BUCK.CFG` enables its `0x31` menu only,
while the unrelated DoK/PoD compact opcode deltas remain selected exclusively
by `DKK.CFG` and `POOL4.CFG`.

`native/ccecl-buck-short-menu-test.ps1 -Headless` copies the held Countdown
`ecl1.dax` and `buck.cfg` into a private DOS mount. It starts `ECL1.DAX#16` at
decimal `37630` (`0x92FE`), verifies `SHORT_MENU [0x7F79], #3`, renders
`SHOOT / CHARGE / TAKE COVER`, and cold-resumes two different answers. CHARGE
writes the source branch's `[0x2DCB]=1`; TAKE COVER retains its distinct
`[0x7F79]=2` state.

**Continuation — Matrix Cubed `SHORT_MENU` bridge (2026-09-13).** Matrix's own
`GAME.OVR` independently establishes that `0x2B` and `0x31` share one compiled
handler; `MATRIX.CFG` now selects only that measured menu frame. The new
`ccecl-matrix-short-menu-test.ps1` mounts only copies of extracted retail files,
starts `ECL1.DAX#18` at decimal `37295` (`0x91AF`), renders six source labels
from `LAUNCH` through `EXIT`, and cold-resumes both REPAIR and EXIT. REPAIR
records its source-owned eleven-word mutation set, including `[0x4D1C]=0096`,
while EXIT leaves only `[0x7F79]=5`; the complete resumed records differ. CCECL
is 65,203 resident bytes, leaving 77 bytes below the DOS `.COM` ceiling.

## Continuation — complete nested VHD title verification, 2026-09-13

`VerifyGoldBoxPlayableVHD.ps1` now stages one private `GAME\COK`,
`GAME\DOK`, and `GAME\DQK` library. It runs each through the packaged
`C:\GOLDBOX\START.BAT` front door: CoK restores a populated GBPR, DoK creates
the explicit `VHD` compact player and emits a 16x16 WGRD map, and DQK imports
the six-member QSV roster and renders area 18 as 16x11 WGRD. The verifier
fingerprints every staged asset before and after those real routes.

The recorder-only selector check separately requires exact `/G 1`, `/G 2`, and
`/G 3` tails for nested COK, DOK, and DQK. A separate CoK-only mount confirms
that a requested, supported DOK profile missing its `DKK.CFG` fails before
GBBOOT dispatch. DOSBox Staging creates an empty redirected failure-marker file
even after a successful `IF ERRORLEVEL` condition, so the verifier now treats
only the guarded `CALL FAILED` text as failure; it still rejects a real child
failure. Unused `CALL` stdout redirects were removed because they themselves
make DOSBox Staging return a nonzero status after the client completes.

The native `all` build and runtime-manifest validation pass. An atomic build at
`D:\GoldBoxVhdCandidate` passed the complete guest verifier; its raw image is
`045B7B76C17B18E1D97492752424F6C10A745E35DEB9B7B8BEC439C5C3E58F32` and its
fixed VHD is `995E0EB0EAC469354BFFC4979AA7A2FDE5377F78380E82D142D9E6584818697A`.
Once C: had space for the atomic candidate, the public
`C:\LLM\DOS\DOS-TOOLS.img` and `.vhd` were rebuilt. Their SHA-256 values are
`4C9E415DB1212E8C2FA955736FFCB39277E8DB2076FD59BF2C1D6F0F0C458D17` and
`32EB05D3CEC2409C0B21F31A6C2E36436DD10726B20B7084297414FB72FC15A5`.
`VerifyReleaseVHD.ps1` passed FAT16 structure and DOSBox guest read/write for
both files, followed by a passing complete guest verifier. The DOS client is
therefore present in the published VHD collection with nested COK/DOK/DQK
coverage.

## Continuation — player INPUT_STRING bridge, 2026-09-13

`INPUT_STRING` (`0x10`) is now player-selectable under the explicit `/!` path.
Its retail operand order is `maxLength,destination`. CCMENU renders the bound,
accepts keyboard text (and `/T text` only for DOS smoke automation), uppercases
it, substitutes one space for empty input, and preflights the complete character
and NUL write against the 512-entry sparse map. It updates the pending `GBRS`
checkpoint before publishing the normal identity-bound 18-byte GBMO v2 token.
Cold CCECL validates opcode `0x10`'s two-operand event, restores that map, and
does not overwrite the string with the token's zero selection.

`ccecl-menu-resume-test.ps1 -Headless` now enters lowercase `hands`; it proves
the pending state had no destination mutation, the resumed state holds
`HANDS\0`, a following ordinary ECL write executes once, and
`COMPARE memstr,inline-string` followed by `IF_EQ` takes the source-shaped
branch. `ccecl-effects-test.ps1 -Headless`, `ccmenu-test.ps1 -Headless`, and
the menu-resume smoke pass. CCECL is 65,279 resident bytes with one byte below
the DOS `.COM` ceiling. `profilepath` reuses the reset-before-execution GBSX
text workspace; a rejected attempt to overlap the timer ownership workspace was
caught by the timer regression before this version was retained.

## Continuation — Quick and Delay turn budgets, 2026-09-14

`CCCOMBAT` now retains per-combatant player movement and primary-attack
ledgers for one round. A delayed character reloads the state it had before its
order slot was rotated to the tail, and Quick passes the same remaining state
to the AI movement and primary-attack paths. The state is cleared at the next
round together with `delayed[]`.

`cccombat-test.ps1 -Headless` adds three DOSBox controls: split movement around
Delay spends exactly four first-round squares; a player who walks two squares
then Quicks ends at the two-square carried destination while an untouched
Q-only control retains its established full-budget destination; and a bump
kill followed by Quick produces one remaining primary swing rather than
refilling both attacks. The focused suite passes, with CCCOMBAT at 64,980
resident bytes and 300 bytes of `.COM` headroom. The next bounded combat item
is task 49: execute AI and flee routes one square at a time so departure
reactions, hazards, and Guard resolve at each step.

## Continuation — per-square AI and flee routes, 2026-09-14

`CCCOMBAT` now retains Dijkstra predecessor cells in the otherwise idle
renderer scanline scratch during route selection, then reuses the route-rank
array as a reverse path stack. `execute_route` processes each selected square
in the same order as player walking: leaving reactions, coordinate commit and
trace, hazards, then Guard reactions. A dead mover returns immediately, before
the following square is committed.

`cccombat-test.ps1 -Headless` proves a feared enemy’s first flee step is
preceded by the adjacent player’s reaction, while a stay-adjacent control has
no departure attack. A test-only copy of fixture 48 supplies the required
three-actor shape without consuming resident `.COM` bytes: an AI enemy leaves
a non-target player, is killed by that player’s reaction after its third step,
and never commits the fourth. The focused DOSBox suite passes. `CCCOMBAT` is
65,112 resident bytes, with 168 bytes of headroom.

## Continuation — selected VHD title-state isolation, 2026-09-14

`START.BAT` now assigns each packaged selector a validated `/8` state id and
launches its existing root runtime with a fixed-width three-letter namespace.
The design avoids the failed `D:\GBRUN\<title>` experiment: helpers remain at
`D:\`, while writable sidecars retain their original filename length. CoK uses
`COKPARTY.GBP`/`COKSESS.GBS`/`COKSAVE.GBS`; DoK uses the matching `DOK*` names.

The parser preserves its command-tail cursor while changing checkpoint bases.
CCEFX derives namespaced effect/resume transcript paths from its host-state
path, and CCFP derives paired Amiga art plus a root `COKFP.MOV`/`DOKFP.MOV`
movement trace from its namespaced wall path. Those fixes prevent a selected
title from consuming legacy `_GB*` output or writing `GAME\<title>\CCFP.MOV`.

`VerifyGoldBoxPlayableVHD.ps1` now proves a real held CoK save, real held DoK
save, and cold reload of each from one library after its state sidecars are
deleted. It requires matching per-title party, continuation and checkpoint
bytes across the reload, different CoK/DoK checkpoints, namespaced CCEFX and
CCFP outputs, and unchanged fingerprints for every title asset tree. The
disposable `STATE-TEST.img` reached every guest selector check with no failed
guest call before publishing. The rebuilt `DOS-TOOLS.img` is
`AB2E634E8CE390520DEA88CAA35AE0CEEE8027C2DD8895220B68215B34E71E72`; its
VHD is `C1E0CB5F350394B00672A72ADEEE7E6ADFFB255884193AFD3654A91B82A8B303`.
`VerifyReleaseVHD.ps1` passed FAT16 and DOSBox guest read/write checks for both,
then the complete packaged GoldBox guest flow passed on the published image.

## Continuation — packaged source-menu acceptance, 2026-09-14

The published VHD now has an end-to-end ordinary-menu acceptance, not only a
recorded `/!` child tail. `VerifyGoldBoxPlayableVHD.ps1` starts two separate
marked private CoK libraries from the same `(4,15)` west-facing session. Each
uses `COMMAND /C C:\GOLDBOX\START.BAT COK DOS /T 1` with inherited DOS standard
input, retaining the normal selected `START.BAT` front door while allowing
headless guest automation to answer the source menu. Both runs acknowledge the
lead-in and final one-choice prompts; their middle answers select the retail
`ATTACK` and `LEAVE` labels. The verifier requires all labels, all three valid
CCMENU outcomes, and the live `GBST` descriptor 156 at `(3,15)` before dispatch.

The two resulting `COKRES.BIN` continuations differ: ATTACK ends with
`GBEF v0009 flags=0020` and its advanced combat RNG state; LEAVE ends with
`flags=0060` and the non-combat source branch. Both package sessions begin in
fresh DOSBox processes and preserve every immutable file below `GAME\COK`.
`SAVE\CHRDATA*` is deliberately excluded from that immutable fingerprint: it is
the documented writable private-session save tree, and CCHOST mirrors a real
combat result into it as well as into GBPR. The separate unmarked original
asset mount remains rejected and fully fingerprinted.
