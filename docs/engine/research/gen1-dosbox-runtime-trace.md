# Gen1 DOSBox-X runtime trace handoff

> Status: active evidence work, 2026-07-15. This file is the durable handoff for
> `BUILD-QUEUE.md` active item 4.

## Objective and claim boundary

Capture narrow original-runtime `CS:IP` evidence for the verified Pool and Secret natural
ECL-to-combat routes. Runtime addresses may promote title-local symbols only after loaded bytes and
overlay placement have been correlated to the matching retail `GAME.OVR` descriptor/file offsets.

The current result proves debugger entry, exact Pool overlay placement, a retail-created GEO18-shaped
host save, clean loading with original archives, source-backed Pool save-memory mapping, and a generic
random encounter-to-visible-tactical-combat handoff. Direct-entry selector bytes prove that the save
does **not** load ECL1#18: game area 2 plus requested member 18 retains stale ECL2#20. It therefore
does not prove selected combat/resume `CS:IP`, and it does not establish a general static-offset to
runtime-segment formula.

## Isolated debugger tool

The official portable DOSBox-X 2026.07.02 Visual Studio Win64 archive was staged under ignored
`build/` paths. No GOG game file and no shared DOSBox installation was modified.

```text
archive: build/tools/dosbox-x-vsbuild-win64-2026.07.02-portable.zip
SHA-256: DE378313B20246CA91D4643429B81BCA8F5ECC64839A9DC168DA22A1AC49D1F
executable: build/tools/dosbox-x-2026.07.02/bin/x64/Release SDL2/dosbox-x.exe
```

The binary/archive is intentionally not checked in. A future session must independently acquire
the named official release and verify the hash before reproducing this result.

## Reproduction

From the repository root:

```powershell
pwsh tools/dosbox_x_debugbox_probe.ps1 `
  -DbxExe "build/tools/dosbox-x-2026.07.02/bin/x64/Release SDL2/dosbox-x.exe" `
  -GameDir "C:\Program Files (x86)\GOG Galaxy\Games\Pool of Radiance\POOLRAD" `
  -Exe START.EXE `
  -OutDir build/dosbox-x-pool-entry
```

The script writes mount and `DEBUGBOX` commands into an isolated config `[autoexec]`; this avoids
PowerShell `Start-Process -ArgumentList` quote loss on the GOG path. It captures every visible
window owned by the launched process. Stop only the printed process id after inspection.

Observed debugger state:

```text
live CS:IP:       1796:0012
canonical entry:  0E88:0012
load delta:       090E
ES/DS:            0814
SS:               193E
```

The first instructions are packed startup code (`MOV AX,ES`, paragraph adjustment, `PUSH CS` /
`POP DS`). Pool's known static behavior offsets are in the dynamically loaded `GAME.OVR` pool, so
they cannot be added to `1796` or the load delta without observing VROOMM placement.

## Next executable substeps

1. Re-run the proven Pool route under `DEBUGBOX`, capture ordered evidence at ECL dispatch and the
   outer encounter menu, choose `COMBAT`, then capture tactical setup/resolution and ECL resume.
   Normalize `CS:IP` aliases by physical address.
2. Capture the first executed combat-side handlers and post-combat ECL resume with the complete
   DAT-plus-CHRDAT save set.
3. Normalize the bounded trace into a checked-in fixture and promote only execution-reached,
   title-local symbols.
4. Repeat for Secret `ECL3#97`, then add only trace-supported, title-local symbols to generated
   decompiler inputs and tests.

## Debugger input smoke proof

`tools/dosbox_debugger_input/` is a checked-in .NET helper around `AttachConsole` and
`WriteConsoleInputW`. It accepts only a running `dosbox-x` PID and either one printable ASCII
command with no newline or one allow-listed special key, then emits a JSON result. A command and
`<ENTER>` are deliberately separate debugger actions. The probe script
builds it on demand and has `try/finally` cleanup when `-StopAfterCapture` is selected.

```powershell
pwsh tools/dosbox_x_debugbox_probe.ps1 `
  -DbxExe "build/tools/dosbox-x-2026.07.02/bin/x64/Release SDL2/dosbox-x.exe" `
  -GameDir "C:\Program Files (x86)\GOG Galaxy\Games\Pool of Radiance\POOLRAD" `
  -Exe START.EXE `
  -OutDir build/dosbox-x-pool-help-smoke `
  -DebuggerAction @('HELP', '<ENTER>') `
  -StopAfterCapture
```

The 2026-07-15 run returned `Success: true`, PID 25544, command `HELP`, and ten input records.
`probe_after_command.png` (the original smoke naming, captured after the following Enter action)
visibly showed the debugger
command list beginning with `BP`, `BPINT`,
`BPM`, and `BPLIST`; this proves command consumption rather than buffer insertion alone. The
launched PID was stopped. Screenshots and status JSON remain ignored build evidence.

The probe accepts a PowerShell string array for `-DebuggerAction` (`-DebuggerCommand` remains an
alias) and captures each action's JSON plus before/after windows separately. Printable entries are
commands; `<ENTER>`, `<F5>`, `<F10>`, and `<F11>` are the only accepted special keys. This supports
reproducible breakpoint, run, step, and data-view sequences without granting the helper a multiline
or arbitrary-key channel. Each action also reads the visible debugger console through `CONOUT$` into
`debugger_console_N.txt`; register and data evidence no longer depends on manual PNG transcription.
`-NoActionScreenshots` keeps the initial visual proof but omits repetitive per-action PNG files for
long traces; every action still has JSON and a full visible-console text snapshot.

## Pool overlay placement proof

A full `BPINT 21 42` startup capture followed the initial header seek and all 35 descriptor seeks.
`tools/parse_dosbox_vroomm_trace.py --strict` requires descending descriptor index, exact split
`CX:DX` retail offset, exact loader code size, and a captured destination segment for every record.
The checked-in normalized evidence is `pool-runtime-overlay-trace.json`; the generated readable table
and candidate translations are in `pool-runtime-overlay-map.md`. Three focused corpus tests cover
snapshot parsing, reverse-order/size validation, and the complete fixture.

```powershell
$actions = @('BPINT 21 42') + (@('RUN') * 36)
pwsh tools/dosbox_x_debugbox_probe.ps1 `
  -DbxExe "build/tools/dosbox-x-2026.07.02/bin/x64/Release SDL2/dosbox-x.exe" `
  -GameDir "C:\Program Files (x86)\GOG Galaxy\Games\Pool of Radiance\POOLRAD" `
  -Exe START.EXE `
  -OutDir build/dosbox-x-pool-all-overlay-seeks `
  -DebuggerAction $actions `
  -NoActionScreenshots `
  -StopAfterCapture

python tools/parse_dosbox_vroomm_trace.py `
  --trace-dir build/dosbox-x-pool-all-overlay-seeks `
  --map-json build/gen1-all-games-map.json `
  --fixture docs/engine/research/pool-runtime-overlay-trace.json `
  --markdown docs/engine/research/pool-runtime-overlay-map.md `
  --strict
```

All 35 records pass. Descriptors 34 through 16 are paragraph-contiguous from segment `2116`;
descriptor 15 resets to `2116`; descriptors 14 through 0 are contiguous from that second bank.
Therefore a single cumulative segment formula across all descriptors is disproven. Captured loaded
addresses include dispatcher candidate `3581:2F2D`, combat candidate `3581:179B`, and operand parser
candidate `3089:0000`. They remain loaded-byte candidates until execution breakpoints are reached.

## Pool route staging and rejected first attempt

`tools/patch_pool_protection.py` creates an isolated copy of Pool and never writes to the GOG
installation. It accepts only retail `GAME.OVR` SHA-256
`872964a32cef0fc32bbf83bab68b15e04ad36d59076f37b00a179dfee7928614`, patches byte `0xAA9`
from `0x55` (`PUSH BP`) to `0xCB` (`RETF`), refuses in-place, nested, or pre-existing output, and
writes a manifest. The staged output hash is
`c551b612b6cdfa2e8f4f3c2a87b8f6f32c0de67081b0035a4b66bdaa246282c2`. A live run bypassed the
translator wheel and loaded save A at `(15,4)`, west, with all six party members.

The initial strict GEO path finder gave this geometrically legal route inside `GEO1#18`:

```text
west, west, south, south, west, south, east, south, east
(15,4) -> (14,4) -> (13,4) -> (13,5) -> (13,6) ->
(12,6) -> (12,7) -> (13,7) -> (13,8) -> (14,8)
```

That route must not be applied directly to save A: the save's loaded runtime walls correlate with
`GEO1#31`, not `GEO1#18`. The first automated attempt sent the corresponding keys too quickly. Its final screenshot
proved `(14,4) W 10:51`, not `(14,8)`. A breakpoint requested at candidate `3581:179B` fired with
actual `CS:IP 3582:178B`; these aliases identify the same physical address. Later route-correct
evidence proved that this address can be reused by a different overlay whose bytes do not match
static `GAME.OVR:0x24E1`. The old inference that this was one byte past that function's `PUSH BP`
is therefore rejected. The run proves neither loaded-byte identity nor route semantics and promotes
no symbol. PID 3448 was stopped after evidence capture.

The next run must checkpoint the displayed coordinate after every legal cell. Only after `(14,8)`
is visibly established may the trace continue through menu choice `ATTACK`, combat entry, and
resume. Raw screenshots/status files remain ignored under
`build/dosbox-x-pool-route-correct-root/`; the durable fact is this rejected-attempt record.

### Save-area correction and byte-proven pose

A paced replay exposed the area mismatch. The runtime allowed/blocked edges from save A strongly
correlate with Pool `GEO1#31`; they contradict route `GEO1#18`. The index-7 intermediate event again
reached physical candidate `3581:179B`, but that is not the selected index-6 route and promoted no
symbol. `find_geo_path.py` now reports masked event indices and can allow or avoid explicit indices;
two focused tests cover the descriptor plane and blocked-cell BFS.

Original-runtime saves made before and after a facing-only change prove these active Pool save bytes:

| Offset | Meaning | Evidence |
| ---: | --- | --- |
| `12801` | party x | retail A=`15`; retail J and self-save B=`14` |
| `12802` | party y | retail A=`4`; retail J and self-save B=`5` |
| `12803` | facing | A=`6` west; J/B=`4` south; facing-only self-save C=`6` west |

`tools/patch_pool_save_pose.py` accepts hash-locked source profiles, refuses in-place or existing
output, changes only these fields, and writes a claim-bounded manifest. Its first profile is retail
A SHA-256 `abca248371287c43c99e1b34e03394819fca3cf406bed184e7e4fbfe4f0c08f1`. A live pose-only
slot loaded at `(14,8) E`, proving the offsets, but retained save A's original area. A separate
experiment also changed CoAB-like candidate fields `395` and `485` from 20 to 18; Pool exited to DOS
while loading it. This rejects a five-byte cross-area patch and proves that Pool's full area host
state/checks must be mapped before a block-18 slot can be claimed.

### Retail-interpreter GEO18 bootstrap and clean-load proof

ECL24's dynamic `NEWECL` table selects member 14 for descriptor index 4. In the retail archive the
table byte at decompressed block-24 offset `0xB6` is a literal at physical file offset `6911`.
`tools/patch_pool_ecl_transition.py` accepts only original `ECL1.DAX` SHA-256
`b1d08075869ef58ae4f08b53d2059b4ea60f0259c35fb6fda44e1c0737c3a4b9` and creates an equal-size
copy with exactly that byte changed `14 -> 18`. Output SHA-256 is
`fdf10f7d870c9015f71e476d0903a58c38452b2aead5beee8301c2a3d4c8c0f8`. It is a setup artifact,
not runtime evidence.

The reproducible transition is:

1. In an isolated protection-bypass stage, install the one-byte bootstrap archive.
2. Load pose-only slot G at `(14,4) S` in ECL24/GEO31 and move once to `(14,5)`, descriptor index 4.
3. Enter camp and let the retail game write slot H. H SHA-256 is
   `0dba44a8a5fc50d04c3870dd5ace19b31a18593eb4247586c94f5559162651d6`.
4. Copy H to a separate clean stage whose `ECL1.DAX` has the original hash above. H loads at
   `(14,5) S` with GEO18 walls, proving coherent saved GEO/host state independent of the bootstrap.
5. The patcher's second hash-locked profile changes only H's pose bytes to produce slot I at
   `(13,8) E`; I SHA-256 is
   `8f944f055a6151b2a871a03ab41629959886879c2161804447eaa09852328619`. It clean-loads and one legal
   eastward step reaches `(14,8) E`.

DOSBox must mount the stage parent as `C:` and run `CD POOLRAD` before `START`. Mounting `POOLRAD`
as `C:` makes the unchanged retail `POOL.CFG` path `C:\POOLRAD\` invalid and causes load to return
to the menu. Pool's load flow is title screen -> `L` -> `LOAD WHICH GAME` -> slot letter + Enter;
the loaded slot enters the world directly, with no separate Begin Adventuring command.

This clean load did **not** prove an ECL18 resume. Static Pool `GAME.OVR` analysis subsequently
identified the area-memory classifier at `0x7BCE`, setter at `0x814A`, and getter at `0x82DF`.
Locations `0x4900..0x4CFF` use
`area_offset=(location*2+0x6E00)&0xFFFF`; Pool's Area1 wrapper starts at save-file offset 1.
Consequently `[0x49F2]` (the title's `LastEclBlockId`) is save offset 485, `[0x4A35]` is offset
619, and `[0x4A38]` is offset 625. H and I contain `20,0,0` at those locations. The GEO18 walls
therefore coexist with an inherited ECL id 20; all earlier wording that called H/I a clean ECL18
resume is rejected.

`tools/patch_pool_route_state.py` accepts only I's hash and writes the source-backed values
`[0x49F2]=18`, `[0x4A35]=0xFF`, `[0x4A38]=0`. Because the last value is already zero, only physical
save offsets 485 and 619 change. Fresh slot G SHA-256 is
`2bc5a41f17c3dcc69555866e459a6db8da839fd22bb559aecd2797dba595a1a4`; it loads with the original
ECL archive at `(13,8) E`. After entering `(14,8)` with SEARCH enabled, `LOOK` displays an orc and
`YOU HAVE SURPRISED A PARTY OF ORCS.`, followed by the retail outer encounter menu
`COMBAT / WAIT / FLEE / ADVANCE`. Selecting `COMBAT` reaches the terminal resolution text
`THE MONSTERS REJOICE FOR THE PARTY HAS BEEN DESTROYED!` and returns to DOS. That first result was
caused by an incomplete copied save: Pool embeds literal `CHRDATH1..6` references in H's DAT and
stores each character's record/items/spells in separate `CHRDATH*.SAV/.ITM/.SPC` files. Copying
only DAT, or renaming those sidecars according to the destination DAT filename, leaves the party
empty. `tools/clone_pool_save_sidecars.py` now reads the embedded references and copies all 16
existing sidecars byte-for-byte under the referenced names; focused tests reject missing,
pre-existing, or mismatched slots.

With the complete DAT-plus-CHRDATH set, the same G route shows all six party members at the orc
encounter. Continuing and selecting combat renders the original tactical board: six party sprites,
eight hostile sprites, terrain/walls, and active combatant panels were captured. This proves a generic
original-runtime encounter dispatch into visible tactical combat, not ECL1#18. It is not evidence for
the selected combat handler's `CS:IP`, a successful outcome, or resume at `0xB1A1`; no handler symbol
is promoted until the same sequence is captured under execution breakpoints.

### Route-correct breakpoint rejection

A `DEBUGBOX` replay set `BP 3581:179B`, loaded complete slot G, enabled SEARCH, entered `(14,8)`,
and issued LOOK. The breakpoint fired before the outer encounter menu rendered at alias
`3582:178B`, so route semantics and physical-address reach are both established. Loaded-byte
identity fails: memory at the hit is `89 EC 5D CB` (`MOV SP,BP; POP BP; RETF`), while retail
`GAME.OVR:0x24E1` begins `55 89 E5 83 EC 0A`. Continuing from the hit renders the surprised-orcs
menu and then the tactical board, but that does not repair the byte mismatch. VROOMM reused the
same physical bank for another overlay after the startup placement trace.

This run is a useful negative fixture, not a promoted symbol. A later successful route-time trace
armed `BPINT 21 42` at `(13,8)` before first entry, retained the complete 16-file CHRDAT sidecar
set, and continued through a forced surprise encounter to visible tactical setup. It captured 102
AH=42 seeks, including these 16 `GAME.OVR` descriptor loads:

```text
20, 28, 7, 24, 8, 10, 31, 13, 32, 9, 25, 22, 19, 30, 12, 34
```

Descriptor 8 loads from `GAME.OVR:0x9807`, size `0x127F`, into destination segment `3485` before
the tactical board appears. Startup descriptor 3 is never reloaded, so the trace rejects the
assumption that static `0x24E1` has a route-time resident instance. Descriptor 34 is loaded only
after an extra `C` reaches the tactical CAST menu; it is not combat entry evidence. The encounter
screen names goblins/orcs and the board contains eight foes, while the selected static ECL path
queues one monster record 5. This mismatch is now material: the trace is a generic random encounter,
not execution evidence for ECL `COMBAT 0xB1A0`.

The normalized checked-in evidence is
`pool-runtime-route-overlay-trace.json` and `pool-runtime-route-overlay-trace.md`. Regenerate it
from the retained local capture with:

```powershell
python tools/parse_pool_route_vroomm_trace.py `
  --trace-dir build/dosbox-x-pool-ecl18-route-time-20260715-m `
  --fixture docs/engine/research/pool-runtime-route-overlay-trace.json `
  --markdown docs/engine/research/pool-runtime-route-overlay-trace.md `
  --strict
```

The post-read checkpoint is complete. At `12C6:02A1`, before fixups, resident windows
`3485:0000` and `3485:0870` exactly match the retail descriptor beginning at `0x9807`. The encoded
public entry `0x087A` points six bytes into `Continue Battle:`; the prologue is at `0x0880`, and a
second entry is at `0x127A`. None of those three addresses was reached before subsequent seek/asset
activity. This proves the load identity and rejects a direct encoded-stub-to-CPU-entry assumption.

### ECL cursor correction

Pool's exact operand parser is route-time `30CF:0000` (`GAME.OVR:0x74D3`). Its own instructions
identify DGROUP `[0x49ED]` as the current ECL member offset. The checked-in
`pool-runtime-ecl-cursor-trace.{json,md}` applies Pool's address conversion
`virtual=(raw-2-0x6700)&0xFFFF` to 62 process-scoped parser hits. A verified leave from `(14,8) E`
to `(13,8) W` and forward re-entry produces virtual addresses only in `0x98FF..0x99F5`; it never
enters `search_location 0x9AB7` or reaches `COMBAT 0xB1A0`. `LOOK` can independently trigger the
generic surprise encounter without establishing that ECL cursor range.

Pool descriptor 7 routine `GAME.OVR:0x7689` parses the five ECL header words into DGROUP
`0x49E3..0x49EB`. The direct-entry trace in `pool-runtime-ecl-host-selector.{json,md}` captures those
words before and after stepping onto `(14,8)`: they uniquely match retail `ECL2.DAX#20`. At the same
stop, Area1 `+0x1E4` requests member 18 and DGROUP `0x5376` selects game area/archive set 2.
`ECL2.DAX` has no member 18, so the failed lookup retains the prior member-20 buffer; the first
byte-validated parser cursor is consequently `0x9973`, not ECL1#18 search code. This also rejects the
earlier phrase "coherent ECL18 save": the saved GEO-shaped host state is not a coherent ECL1#18 host.

Pool code restores DGROUP `0x5376` from `area2_ptr+0x624`. The corresponding serialized byte is 2.
An isolated experiment changed only that byte to 1, but Pool returned to DOS before establishing its
game DGROUP (`DS=0749` at idle). A second rejected probe changed both the wrapper byte and Area2
`game_area` byte; it failed at the same boundary. `tools/patch_pool_game_area.py` is retained only to
reproduce that negative result. The field is part of a broader host-state contract and cannot create
ECL1 state independently.

## Coherent ECL2#20 baseline and adjacent-save request

The same runtime capture provides a positive route that should precede further ECL1 synthesis:

- game area/archive set 2 plus member 20 loads a five-word header exactly matching retail
  `ECL2.DAX#20`: VM `0x9914`, search `0x9975`, pre-camp `0x9A0E`, interrupted camp `0x9A49`, and
  initial entry `0x9A5E`;
- `GEO2.DAX#20` has a legal event-free route from `(13,8) E` through `(14,8)`, `(14,9)`, and
  `(14,10)` to descriptor 3 at `(13,10)`;
- static search dispatch selects `0x9F13`; with the observed save guards clear, that branch sets up
  monster groups and can reach `COMBAT 0xA0B3`.

This path is not yet runtime-promoted. Removing an inherited pre-trace SEARCH command fixed one
harness defect. Per-key screenshots then showed that setup movement is RNG-sensitive and that the
injected left/right arrow is sometimes consumed as two turns. A pose-only save derived from the
retail-created H slot changes only offsets `12801..12803` and reaches `(14,10)`, but the executable
loads it facing north rather than the requested west. Its SHA-256 is
`87c7c372713f7130935a4d1dfa4d03a990300ebca1225e5a6e1235bc4524f617`; it is a rejected setup probe,
not encounter evidence.

The preferred next artifact is therefore an untouched, manually created Pool save at `(14,10)`
facing west, with all referenced `CHRDAT*.SAV/.ITM/.SPC` sidecars. One forward step can then be
traced from ECL operand parser `30CF:0000` into `0x9F13` without random setup movement or automated
turns. After ECL2 combat/resume is captured, ECL1#18 remains a separate requirement: begin from a
retail-created coherent game-area-1/member-18 transition, byte-match `ECL1.DAX#18`, enter `0x9AB7`,
and only then trace `COMBAT 0xB1A0` and `0xB1A1` resume. Placement or generic combat alone promotes
no semantic symbol.

Manual saves are ingested read-only with:

```powershell
python tools/inspect_pool_save.py --save "<POOLRAD>\SAVGAMG.DAT" `
  --output build/pool-manual-save-g.json --require-ecl2-adjacent
```

The report hashes the save, decodes the host selectors and pose, inventories embedded character
references and present sidecars, and preserves an explicit runtime claim boundary. A candidate
result is not proof that the executable retained the serialized facing.

Console F5 does not pause a running DOSBox-X instance; the reliable process-scoped harness uses the
native Debug menu action. All owned DOSBox-X processes are stopped in `finally`.

## Known static route anchors

Pool's verified route is `ECL1#18`, GEO `(14,8)`, descriptor `0x86`, attack choice, `COMBAT 0xB1A0`,
resume `0xB1A1`. Existing Pool `GAME.OVR` file-offset candidates include dispatcher `0x3C73`, operand
parser `0x74D3`, and combat handler `0x24E1`; none is runtime-promoted yet.

## 2026-07-17: GameLink-based attempt -- new script, new (narrower) blocker found

A focusless GameLink-based harness was built (`tools/trace_pool_ecl2_20_gamelink_route.ps1`),
reusing this doc's already-proven coherent `SAVGAMI.DAT` baseline (`8f944f05...`) and the same
6-key movement route (`up,right,up,up,right,up`) prior host-input runs used, but driving input
and screenshots through DOSBox-X's GameLink v4 shared memory instead of `SendKeys`/mouse focus
(per `docs/engine/research/dosbox-x-gamelink-automation.md`). The script also guards against that
doc's documented GameLink singleton-collision hazard (waits for an empty `dosbox-x.exe` process
list before launch, re-checks exclusive ownership before every GameLink call, aborts loudly rather
than trusting data if a foreign PID appears -- proven twice by two genuine contamination aborts
this round before two clean end-to-end runs).

The two clean runs still did not reach `search_location` (`ecl_cursor_hits=0` both times, vs. the
prior host-input runs which at least reached the `0x9924..0x99C4` menu-loop band on the same
breakpoint). A new host-state read added mid-round (`Get-EclHostState`, same DGROUP addresses as
`Capture-EclHostState`) shows why: post-load `area_ecl_member_id=0`/`archive_set=1` and
post-movement `area_ecl_member_id=1`/`archive_set=1` with a suspicious `area_segment=0001` -- not
the coherent baseline's `area_ecl_member_id=20`/`archive_set=2`. This means the GameLink-injected
`L` -> slot `i` -> `enter` load sequence did not actually load the intended save this round; the
blocker moved from "movement is RNG/timing-sensitive" to "the load-slot key sequence itself did
not take" -- narrower, but still open. Both clean runs produced byte-identical
`game_ovr_offsets` sequences (41 seeks, same order both times), which argues for a deterministic
miss rather than an RNG-interrupted attempt. GameLink screenshot/frame captures were all-zero-alpha
in every run this round (independent of the contamination issue), which blocked visual
confirmation and looks like the minimized probe window not populating the GameLink frame buffer --
worth a dedicated look before relying on GameLink screenshots for any Gold Box trace. Full
narrative and JSON evidence: `docs/engine/HANDOFF.md`, 2026-07-17 entry, and
`build/dosbox-x-pool-ecl2-20-gamelink-20260717-{d,e}/`. No BUILD-QUEUE checkbox changed.

Secret's verified route is `ECL3#97`, GEO `(12,3)`, descriptor `0x83`, `COMBAT 0x82BB`, resume
`0x82BC`, with the documented intermediate/consumed flag seeds. It remains untraced in the original
DOS runtime.

## 2026-07-21: title-screen-dismissal hypothesis tested and rejected (still open, narrower)

Under this round's exclusive DOSBox-X slot, the leading hypothesis for the 2026-07-17 "deterministic
miss" was that Pool's `L` -> slot `i` -> `enter` sequence fires before its 2 static title screens
(`docs/engine/research/gen1-demo-entry-generalized.md` sec.8: Pool's only boot string is `"Press any
key to continue"`, no Play/Demo menu) are dismissed, so the injected keys land on the wrong screens.
`tools/trace_pool_ecl2_20_gamelink_route.ps1` gained a `-TitleDismissKeys` (default 2) Phase 0 that
sends that many idle-gated `enter` presses, each followed by a screenshot, before the existing Phase
1 `L` press.

Run: `build/dosbox-x-pool-ecl2-20-20260721-titlefix/` (`-TitleDismissKeys 2`, otherwise identical
parameters/save to the 20260717-d/-e runs). Both `phase0-dismiss-00.png`/`-01.png` were captured
(each phase completed, via genuine idle detection or the 240s per-phase deadline). Result: **rejected
by byte-identical outcome.** `gamelink-route-trace.json`'s `game_ovr_offsets` array (41 seeks) is
byte-for-byte identical, in the same order, to the undismissed 20260717-e run
(`build/dosbox-x-pool-ecl2-20-gamelink-20260717-e/gamelink-route-trace.json`), and
`host_state_post_load` again reads `area_ecl_member_id=0`/`archive_set=1` (not the coherent
baseline's `20`/`2`), matching 20260717-d/-e exactly. `search_location_reached=false`,
`ecl_cursor_records=[]`, same as before. Two extra, idle-gated `enter` presses before the load
sequence therefore make **zero measurable difference** to either the disk-seek trace or the resulting
host state -- title-screen dismissal timing is not the cause of the miss. (GameLink screenshots
remain all-zero-alpha for this minimized probe window, the same pre-existing rendering-only issue
noted 2026-07-17, so this round also could not visually confirm what screen the injected keys actually
landed on -- host-state/seek-trace evidence is the only trustworthy signal here, as before.)

This narrows, but does not close, the blocker. Two live data points now bracket it: the *old*
host-input (`Send-DosKeys`/mouse-focus) technique reached a real menu-loop band
(`0x9924..0x99C4` on the operand-parser breakpoint, noted in the 2026-07-17 entry above) that the
*new* GameLink-based `L`/slot/`enter` sequence has never once reached across four independent clean
runs (`-d`, `-e`, and this round's dismissed and undismissed variants all land on the same
`member=0/archive=1` non-loaded state). That difference points at the GameLink key-injection
mechanism itself (press/hold/release timing or pacing relative to the game's input-polling loop)
rather than at title-screen sequencing, as the more likely remaining cause -- but this round did not
test that directly and does not claim it as proven.

A second, independent candidate worth testing before further GameLink pacing tuning: `SAVGAMA.DAT`,
the save the GOG install ships as slot A, itself decodes (`tools/inspect_pool_save.py`) to
`wrapper_game_area=2`, `ecl_member=20`, pose `(15,4)` west -- i.e. it is *already* at the same
ECL2#20/archive-2 host state as the `SAVGAMI.DAT` target, just a different pose. The 2026-07-15
`patch_pool_protection.py`-bypassed stage's earlier "loads retail save A with six party members at
(15,4)" result (`BUILD-QUEUE.md` item 4, line ~150) was never confirmed to have gone through an
interactive load menu at all; it is equally consistent with Pool auto-continuing directly from a
fixed default save with no menu in between. If that is what is actually happening, no amount of
`L`/slot-key tuning will ever reach `SAVGAMI.DAT`'s state, and the correct next step is a hash-locked,
copy-only swap of whichever save file the plain (un-keyed) boot path actually continues from, followed
by a re-run with the `L`/slot/`enter` phases removed entirely -- not attempted this round; flagged as
the concrete next step. No `BUILD-QUEUE.md` checkbox closes from this round's result.

## 2026-07-21 (continued): SAVGAMA.DAT file-swap tested -- also rejected, and a sharper root cause found

Under this round's exclusive DOSBox-X slot, the file-swap candidate above was executed exactly as
scoped. A fresh isolated stage was built read-only from the retail GOG install
(`tools/patch_pool_protection.py`, output hash `c551b612b6cdfa2e8f4f3c2a87b8f6f32c0de67081b0035a4b66bdaa246282c2`,
matching the already-proven protection bypass) at
`build/runtime-pool-ecl2-20-swap-20260721/`. Its `SAVGAMA.DAT` was hash-verified as pristine retail
(`abca248371287c43c99e1b34e03394819fca3cf406bed184e7e4fbfe4f0c08f1`, matching the live GOG install),
backed up to `build/pool-save-backup-20260721/SAVGAMA.DAT.orig` (hash-verified equal), then overwritten
byte-for-byte with the already-proven coherent baseline save (hash
`8f944f055a6151b2a871a03ab41629959886879c2161804447eaa09852328619` -- `wrapper_game_area=2`,
`area2_game_area=2`, `ecl_member=20`, pose `(13,8)` east, per `tools/inspect_pool_save.py`). The new
`SAVGAMA.DAT`'s SHA-256 was verified to exactly equal the source hash post-copy. All 16 referenced
`CHRDATH1..6.SAV/.ITM/.SPC` sidecars were copied alongside it and hash-verified byte-identical to their
source copies (`inspect_pool_save.py` confirms zero missing characters). The live GOG install's own
`SAVGAMA.DAT`/`SAVGAMJ.DAT` were never touched (verified hash-identical before and after this entire
round -- see the "Round housekeeping" note at the end of this section).

The new tool `tools/trace_pool_ecl2_20_gamelink_silentboot.ps1` boots this stage with **only** the
`TitleDismissKeys` (default 2) idle-gated `enter` presses -- no `L`, no slot letter, no further `enter`
of any kind -- then reads the same `Get-EclHostState` DGROUP fields (`area_ecl_member_id`,
`archive_set`) used by every prior round in this family, twice, with a full idle-wait margin between
the two reads. Run: `build/dosbox-x-pool-ecl2-20-silentboot-20260721/silentboot-trace.json`.

**Result: rejected.** Both post-title-idle reads show `area_ecl_member_id=0`/`archive_set=1` --
byte-identical to the launch-time uninitialized default and to every prior L/slot/enter attempt's
"non-loaded" signature (2026-07-17 `-d`/`-e`, 2026-07-21 titlefix). `auto_continue_target_reached:
false`. Pool does **not** auto-continue from `SAVGAMA.DAT` (or any fixed default save) with zero
interactive input; an explicit Load action is genuinely required, matching what the original
2026-07-15 host-input trace already established procedurally (title screens -> `L` -> `LOAD WHICH
GAME` -> slot letter + Enter). This closes candidate (b) from the prior entry.

**New, sharper diagnostic found while producing this result.** Every `Wait-Idle` call in the new
script hit its full 240-second deadline before proceeding -- confirmed by wall-clock timestamps on the
phase screenshots, which land almost exactly 240s apart (`phase0-dismiss-00.png` 20:32:40 ->
`phase0-dismiss-01.png` 20:36:43 -> `post-title-idle.png` 20:40:45 -> `post-title-idle-2.png`
20:44:51). The debugger console snapshots explain why: sampled polls throughout the entire ~16-minute
run (`poll-0050`, `-0200`, `-0400`, `-0600`) all show `EAX=0000420x` (`AH=42`, `INT 21h` LSEEK) at the
same tight code region `131C:15F2..1600`, same file handle `EBX=7`, with `ESI`/`EDI` cycling in a small
range (`0x30F2..0x3961`) -- i.e. Pool's title/idle code performs a **continuous LSEEK loop against one
open file handle even while just sitting at the title screen**, so the shared `Wait-Idle`/idle-streak
detector this entire script family relies on (`10` consecutive non-stopped polls = "safe to inject a
key") can never actually observe a true idle window for Pool; every keypress in every GameLink-based
Pool script to date has therefore been injected only after an uncontrolled 240s hard-timeout fallback,
not at a real menu-loop-relative moment. This is a plausible, previously-undiagnosed root cause for
this whole family's press/pacing failures (candidate (a) from the prior entry) -- it was not present in
Secret's own successful runtime trace, which used a different capture technique. Not fixed this round;
recorded as the concrete lead for the next one: replace idle-detection-gated pacing with either a fixed
`BPINT`-hit-count trigger, an address-specific breakpoint at the actual menu/input-poll routine (the
way Secret's own trace anchored on `10E3:0034`/`4674:3E51` instead of a generic idle detector), or a
short fixed delay proven empirically against this same LSEEK loop's period.

GameLink screenshots remain all-zero-alpha for this minimized probe window (all 4 captured PNGs this
round are byte-identical, SHA-256 `67e70fe272cf8921ab9864a11aba6fe6d91f64e60afe92486d5af939a5473526`)
-- the same pre-existing rendering-only issue noted 2026-07-17/2026-07-21, still unfixed, still not
diagnosed this round beyond reconfirming it.

**Round housekeeping.** All work this round was staged under git-ignored `build/`; the retail GOG
install directory was never written to. `SAVGAMA.DAT` (`abca2483...c08f1`) and `SAVGAMJ.DAT`
(`4b64213a...6ca9`) in `C:\Program Files (x86)\GOG Galaxy\Games\Pool of Radiance\POOLRAD` were
hash-verified unchanged at the end of the round. No DOSBox-X process remained running. No
`BUILD-QUEUE.md` checkbox closes from this round's result; the leaf gains a second, differently-shaped
negative and a new concrete diagnostic for the next attempt.

## 2026-07-21 (continued): breakpoint-anchored pacing implemented -- coherent baseline load
reached via GameLink for the first time; route completion still open

Follow-up round, same exclusive DOSBox-X slot, picking up the previous entry's concrete lead
(replace idle-detection-gated pacing with a real anchor). Mirrors the technique that already
worked for Secret (`docs/engine/research/secret-count-teams-cs-ip-confirmed-20260721.json`,
commits `ddb944b`/`052d9cf`): confirm a known-reached CS:IP via breakpoint, then inject.

**Step 1 -- find an anchor.** `tools/trace_pool_int16_keywait_probe.ps1` (new) arms an unfiltered
`BPINT 16` against the plain retail install (read-only, no stage needed -- this only observes the
title-idle window before any Play/Load input) and polls 40x at 300ms. Result
(`build/dosbox-x-pool-int16-diag-*`): 37/39 stops land at `CS:IP=1264:0306` with `AH=01` (the
classic "poll keyboard status" `INT 16h AH=1` spin), the other 2 at `F000:DA84`/`AH=17` (BIOS ROM,
early boot only). This is a real, repeatable anchor Pool's own title-idle loop revisits
continuously -- unlike the LSEEK loop, which never presented an idle streak.

**Step 2 -- press-while-halted fails.** First pacing attempt (`tools/trace_pool_ecl2_20_bpint16_paced.ps1`,
new) armed `BPINT 16 1`, confirmed the halt, and pressed the key *while still halted* at the
anchor, matching how a human would single-step in a debugger. Run
`build/dosbox-x-pool-bpint16-paced-20260721-a`: the anchor confirmation worked cleanly all 5
times, but the post-load host state read back `area_ecl_member_id=0`/`archive_set=3` -- not the
target. Root-caused with a new focused diagnostic, `tools/trace_pool_gamelink_keybuffer_probe.ps1`
(new): it reads the BIOS keyboard ring buffer (`0040:001A`/`001C`) via the debugger console before
and after pressing while confirmed-halted at `1264:0306`. Result
(`build/dosbox-x-pool-keybuffer-probe-20260721-a`): the buffer head/tail stayed constant at
`0x1E`/`0x1E` through press-while-halted, run, and a 500ms settle -- **the keypress was never
delivered while the CPU was held by an always-armed, tightly-refiring breakpoint.**

**Step 3 -- root cause and control test.** The working theory: an always-armed breakpoint that
refires almost every host frame (as `1264:0306` does -- it's a keyboard poll spin) halts DOSBox-X's
*entire host main loop*, not just the virtual CPU, starving GameLink's own shared-memory keypress
delivery (serviced by that same main loop). This also unifies with the pre-existing "GameLink
screenshots are all-zero-alpha in every minimized Pool probe window" bug under one root cause (both
are host-main-loop-serviced I/O paths). Control test:
`tools/trace_pool_gamelink_freerun_keybuffer_probe.ps1` (new, edited twice -- first version read
the debugger console and got back a stale pre-boot snapshot, `cc=1 CS:IP=1796:0014`, proving the
console is cached/frozen while the CPU is genuinely running; fixed to use GameLink's own `peek`
instead). With **zero** breakpoints armed the entire time (genuinely free-running), a tight
before/burst/settled bracket around one `enter` press
(`build/dosbox-x-pool-gamelink-freerun-keybuffer-probe-20260721-d`) showed
`kb_head_tail_before_press=1e001e00` -> `kb_head_tail_burst_after_press` (15x) `=20002000` ->
`kb_head_tail_settled_1s_after_press=20002000`: head and tail both advance together, i.e. the key
was pushed and immediately consumed cleanly. Confirms the theory: **delivery works only when
genuinely free-running; it is silently dropped whenever a tightly-refiring breakpoint is held
armed during the injection window.**

**Step 4 -- working pacing scheme.** New script `tools/trace_pool_ecl2_20_bpint16_paced_v2.ps1`
(iterated a-e). The scheme that ended up working: arm+confirm+delete the `1264:0306` anchor
**exactly once**, purely to prove the boot reached a healthy, known state, then switch to
fixed-delay pacing (`Start-Sleep` before/after each press, no breakpoint armed at all) for every
subsequent key -- i.e. matching the pacing style Secret's own proven script
(`tools/trace_secret_begin_selector.ps1`) already uses for its title/load-menu dismissal, rather
than a per-key breakpoint-confirm cycle. Two more findings surfaced getting here:
- **v2-a** (per-key arm/BPLIST-confirm/delete/re-arm) failed a 20s timeout on the *second* key even
  though `BPLIST` showed the breakpoint re-listed (with a stale duplicate entry) -- re-arming
  mid-sequence is unreliable.
- **v2-c** tried forcing a fresh halt post-load for reading by re-arming `BP 30CF:0000` +
  `BPINT 16 1` from a genuinely free-running state (zero breakpoints active): status.json reported
  success, `BPLIST` acknowledged the breakpoint, but it **never actually fired** (20s timeout, no
  halt). This is a sharper variant of the already-documented "typed while running can silently fail
  to register" caveat -- re-arming from a fully free state appears to never really be serviced by
  the debugger, not just occasionally flaky.
- Both were replaced by reading live memory through **GameLink's own `dump-memory`** (full 1MB RAM
  snapshot) instead of the debugger console at all, computing the DGROUP-relative host-state fields
  (`area_ecl_member_id` at `areaSegment:(areaOffset+0x01E4)`, `archive_set` at `DGROUP+0x5376`, ECL
  cursor at `DGROUP+0x49ED`) directly from the dumped bytes, using an empirically-stable assumed
  `DS=14A0` (consistent across every capture this whole session, including the diagnostic polls and
  the earlier stale reads). This sidesteps both the console-staleness bug and the re-arm-unreliability
  bug entirely.

**Result, run `build/dosbox-x-pool-bpint16-paced-v2-20260721-e`** (reproduced from `-d`, same
outcome both times): `load_target_reached=True`, `host_state_post_load` =
`{area_segment: "3996", area_offset: "0000", area_ecl_member_id: 20, archive_set: 2}` -- **the
exact coherent-baseline target (ECL2.DAX#20, archive_set=2), the first time this has been reached
by any GameLink-automated Pool script.** Stage/save unchanged from prior rounds:
`build\runtime-pool-ecl2-20-gamelink-20260717`, save SHA-256
`8f944f055a6151b2a871a03ab41629959886879c2161804447eaa09852328619`, slot `i`.

The subsequent movement loop (`up,right,up,up,right,up`, `SearchLocationTarget=0x9F13 ± 0x20`) also
used the GameLink-dump-memory technique per step (replacing the old broken breakpoint-based cursor
poll) and ran cleanly end-to-end -- 6 keys sent, a `.ram` dump and `.png` screenshot captured after
each -- but did **not** reach the target band:

| step | key   | ECL cursor virtual addr | area_ecl_member_id | archive_set |
|------|-------|--------------------------|---------------------|-------------|
| 0    | up    | `0x3466`                 | 20                  | 2           |
| 1    | right | `0x3466` (unchanged)     | 20                  | 2           |
| 2    | up    | `0x3466` (unchanged)     | 20                  | 2           |
| 3    | up    | `0x3466` (unchanged)     | 20                  | 2           |
| 4    | right | `0x3466` (unchanged)     | 20                  | 2           |
| 5    | up    | `0x3273`                 | 20                  | 2           |

`search_location_reached=False`. `area_ecl_member_id`/`archive_set` stayed rock-solid at `20`/`2`
through all 6 movement keys -- the party never left the target area/archive during this sequence,
which is itself useful evidence the load and pacing are stable, not just a one-shot fluke. The ECL
cursor only changed twice (steps 0 and 5) despite 6 keys being sent, and the two changes it did
show (`0x3466` -> a value it started at, then `0x3273`) are nowhere near the `0x9F13` target --
either most of these movement keys aren't actually reaching the game's input handler (plausible
given the free-running-only delivery constraint just discovered -- fixed 2s sleeps between presses
may still be racing the game's own per-frame input poll for some keys), or the ECL cursor field
being tracked doesn't move linearly with player steps the way the static analysis assumed. Not
disambiguated this round.

GameLink screenshots for this whole run remain all-zero-alpha (`phase3-loaded.png` and all
`movement-*.png` are blank white) -- same pre-existing rendering bug, now mechanistically tied to
the Step 3 root cause above (both are serviced by the same starved-when-breakpoint-holds-the-loop
host main loop), though the free-running screenshots captured here should *not* have been starved by
that specific mechanism (no breakpoint was armed during capture) -- so blank screenshots persisting
even under pure free-running pacing means the screenshot bug has at least one cause independent of
the breakpoint-starvation one. Left as an open, undiagnosed detail, not conflated with the
input-delivery fix above.

**Verdict for this round's success criteria.** A confirmed-execution, reproducible technique for
reaching the coherent ECL2#20 baseline via GameLink now exists and is proven twice
(`-d` and `-e`). Route completion toward `search_location`/COMBAT/resume was **not** achieved --
an honest partial result, not a full CS:IP-trace-and-symbol-promotion deliverable. No new symbol
promotion JSON was produced this round (nothing yet meets the "confirmed execution along the full
route" bar `secret-count-teams-cs-ip-confirmed-20260721.json` set). The concrete next step: either
(a) diagnose why 4 of 6 movement keys produced no ECL-cursor change (try longer per-key settle
windows, or confirm via screenshot-independent means that the party sprite actually moved), or
(b) re-derive `search_location_target` -- `0x9F13` may not be the correct virtual address for this
save's actual room layout now that the baseline load itself is finally reproducible and can be
iterated on quickly.

**Round housekeeping.** All new tooling under `tools/`: `trace_pool_int16_keywait_probe.ps1`,
`trace_pool_ecl2_20_bpint16_paced.ps1`, `trace_pool_gamelink_keybuffer_probe.ps1`,
`trace_pool_gamelink_freerun_keybuffer_probe.ps1`, `trace_pool_ecl2_20_bpint16_paced_v2.ps1`. All
run output under git-ignored `build/`. `tools/unicorn_dqk_trace.py` was not touched (owned by
another concurrent agent this round). No DOSBox-X process remained running at the end of this
entry's work. No `BUILD-QUEUE.md` checkbox closes yet -- the baseline-load breakthrough is real
progress but the leaf's success criteria (full route + promoted symbols) is not yet met.

## 2026-07-22: persistent-armed operand-parser breakpoint -- first native CS:IP promotion for
Pool, movement gap root-caused further (still open)

Follow-up round, same exclusive DOSBox-X slot, picking up the prior entry's two open problems in
order: (a) 4 of 6 movement keys produced no ECL-cursor change, (b) whether
`SearchLocationTarget=0x9F13` was even correct.

**GEO route re-verified independently.** `tools/find_geo_path.py --geo GEO2.DAX --block 20
--start 13,8 --target 13,10 --facing east` reproduces the prior round's route exactly: 4 steps, 0
blocked cells, `dos_keys={UP}{RIGHT}{UP}{UP}{RIGHT}{UP}` -- byte-identical to the movement keys
already in use. Route legality was never the problem.

**A previously-undiagnosed gap found by cross-referencing Pool's own proven ECL1#18 route
(`tools/trace_pool_ecl18_route.ps1`): SEARCH mode ('S') and LOOK ('L') were never sent.**
`trace_pool_ecl18_route.ps1` sends `S` once (`-PreTraceKeys`) before any movement and `L`
(repeated, with retries) after reaching the target cell -- `search_location` is a distinct,
explicit-input-gated VM entry, not an automatic per-step call. The prior round's
`trace_pool_ecl2_20_bpint16_paced_v2.ps1` movement loop sent only `up`/`right` and never `S` or
`L`, so `search_location` could structurally never have been reached regardless of movement
correctness. Both keys are present in `dosbox_gamelink.py`'s `SCAN_CODES` map (`s`, `l`) and were
added to this round's new script.

**Root-caused why v2 never registered ANY hit even in principle: a live units/formula bug.** v2's
`SearchLocationTarget=0x9F13` check applied the DAX-file-offset-to-virtual-address formula
`virtual=(raw-2-0x6700)&0xFFFF` (documented above for converting *static DAX file bytes*) to the
*live* `DGROUP+0x49ED` runtime cursor field. This round's live evidence proves that field is
**already** a virtual address directly comparable to the static ECL disassembly's own addresses
(`search_location=0x9975` etc.), with **no further conversion**: the very first hit of both new
runs reads `raw_member_cursor=0x9975` immediately after the first movement key -- exactly ECL2#20's
documented `search_location` entry (`build/pool-ecl-encounters.json`). v2's conversion turned that
into `0x3273`, matching v2's own dead-end table exactly (`0x3466`... `0x3273`) -- v2 was reading
correct data and silently mis-formatting it, guaranteeing its own target check could never pass.

**New technique: persistent dual-arm breakpoint, unblocking native CS:IP evidence after load for
the first time.** The prior round's v2-c sub-attempt proved that arming a *new* breakpoint from a
genuinely free-running state (zero breakpoints active) is never serviced by this DOSBox-X build,
even though the arm command's own `status.json` reports success -- this blocked ever capturing a
second native CS:IP hit after the proven single-BPINT16-anchor-then-freerun technique. This
round's fix, proven live: arm **both** the throwaway `BPINT 16 1` anchor and the real target
(Pool's byte-validated ECL operand parser, route-time `30CF:0000` / `GAME.OVR:0x74D3`) together, at
the *same* pristine first post-launch halt where arming is already known reliable, then
selectively delete *only* the `BPINT 16 1` entry. A new diagnostic,
`tools/trace_pool_bpdel_selective_probe.ps1` (run `build/dosbox-x-pool-bpdel-probe-20260722-a`),
live-proved `BPDEL <index>` performs true selective deletion, and -- critically -- that DOSBox-X's
`BPLIST` groups plain `BP` entries **before** `BPINT` entries regardless of arm order, so the
index to delete must be read live from `BPLIST`, never assumed fixed. The operand-parser
breakpoint then stays permanently armed for the rest of the run (never re-armed, never deleted
again); every subsequent halt is therefore a genuine execution-confirmed hit, not a re-arm.
`tools/trace_pool_ecl2_20_operand_anchor_v3.ps1` (new) implements this: launch -> confirm first
halt -> arm operand-parser BP -> selectively delete BPINT16 (index read live) -> free-run for
title/load exactly as v2 already proved -> toggle SEARCH -> 6-key movement -> up to 5 LOOK
attempts, draining (polling for a halt, recording CS:IP + resident bytes + DGROUP cursor, then
`RUN`, repeat) after every injected key.

**Result, reproduced twice** (`build/dosbox-x-pool-operand-anchor-v3-20260722-b` and `-c`,
identical technique, launched back-to-back): `load_target_reached=True` both times
(`area_ecl_member_id=20`, `archive_set=2`, matching the prior round's baseline). 22 hits (run b) /
23 hits (run c) at **exactly** `30CF:0000`, **all** byte-identical to the retail
`GAME.OVR:0x74D3` prologue (independently re-checked directly against the retail file, not just
the script's own boolean), **zero** spurious hits during title dismiss, load menu, or the
post-load settle (the breakpoint stayed armed but silent through all of that, addressing this
round's own risk that VROOMM might place unrelated code at that physical bank pre-load). The
`raw_member_cursor` sequence is identical between both runs for the first 22 hits (run c has one
extra trailing hit) -- deterministic, not a one-shot fluke. This is Pool's first native,
execution-confirmed, byte-matched CS:IP evidence since the project's Secret promotion
(`secret-count-teams-cs-ip-confirmed-20260721.json`), promoted in the same format:
**`docs/engine/research/pool-operand-parser-cs-ip-confirmed-20260722.json`**.

**Movement gap sharpened with direct evidence (still open).** ECL2.DAX#20's control flow was
decoded by hand (`gen1_ecl_encounter_scan.decode_one`/`successors`, not
`simulate_gen1_ecl_path.py` -- that tool only resolves `COMPARE`-driven branches and treats
`AND`/`ON_GOTO` as an unresolved terminal) starting at `0x9975`: a 21-way `ON_GOTO` at `0x99C9`,
selected by a linear-search loop matching the counter against `AND(#0x7F, [0xC04F])` -- the
party's current-cell masked descriptor, the same `[0xC04F]` location the documented ECL1#18 route
uses. Target index 3 of that table is **exactly `0x9F13`**, independently corroborating (via
control-flow decode, not just prior assertion) the earlier "static search dispatch selects
`0x9F13`" claim. But **both live runs' LOOK presses dispatch to target index 0 (`0x9AA5`)**, whose
decoded body (`PARTYSTRENGTH`, guard `COMPARE`/`EXIT`s, `PRINTCLEAR` inline text id 105, a
"nothing of interest" `SAVE`+`EXIT`) is the generic empty-cell branch -- proving, for the first
time with direct live evidence (not inference from an unchanged proxy field), that **the party was
not actually standing on GEO2#20's `(13,10)` cell (descriptor 3) when LOOK fired**, despite clean
GameLink key delivery (per v2's keybuffer checks) and independently-proven route legality. This
narrows problem (a): `search_location` itself is now proven reached on every LOOK
(`raw_member_cursor=0x9975` at the top of every `look-N` group), but the party's actual resulting
cell is not `(13,10)`. Next step: reuse this round's `Drain-Hits` technique to read `[0xC04F]`
directly after *each* movement key (not just at LOOK) to isolate exactly which of the 6 keys fails
to advance the party.

**Round housekeeping.** New tooling under `tools/`: `trace_pool_bpdel_selective_probe.ps1`,
`trace_pool_ecl2_20_operand_anchor_v3.ps1`. New promotion evidence:
`docs/engine/research/pool-operand-parser-cs-ip-confirmed-20260722.json`. All run output under
git-ignored `build/`. `tools/unicorn_dqk_trace.py` was not touched (foreign uncommitted
modification, per this round's brief). No DOSBox-X process remained running at the end of this
entry's work (verified via `tasklist` before and after every launch). No `BUILD-QUEUE.md`
checkbox closes yet -- the leaf's full success criteria (route reaches `COMBAT`/resume) is still
not met, but a real symbol is now promoted and the movement gap has a much sharper, directly
observed diagnosis than before.

## 2026-07-22 (follow-up round): per-step BIOS keybuffer isolation finds the *real* delivery
culprit, decisively rules out two hypotheses, movement gap narrows to the `[0xC04F]` formula
itself (still unpromoted, still open)

Same exclusive DOSBox-X slot, direct continuation of the prior entry's stated next step ("read
the party position state after EACH individual movement key to isolate which step(s) silently
fail," using `[0xC04F]` at DGROUP-derived physical `0x487FE` per the `MapCellAreaOffset=0xEE9E`
formula from `tools/trace_pool_ecl18_route.ps1`).

**Step 1 -- isolated the actual "only the first key ever lands" mechanism.** Built
`tools/trace_pool_ecl2_20_position_probe_v4.ps1` (per-step `Get-PositionState` via GameLink
`dump-memory`, no breakpoints) through `v6.ps1` (adds retry + a raw BIOS-keyboard-ring-buffer
peek at physical `0x41A`, bracketing every press). v5/v6 (3 runs total) reproduced the prior
rounds' symptom precisely, but now with byte-level proof: only move key 1 of 6 ever changed the
`0x41A` head/tail word (`2a002a00` -> `2c002c00`); moves 2-6 stayed frozen at `2c002c00` through
every retry, and a follow-up check showed **LOOK presses were equally undelivered (0/5)** despite
each still showing `hit_count=2` at the operand-parser breakpoint -- disproving the earlier
assumption that an operand-parser hit proves a specific key was consumed; it appears to be an
ambient/periodic ECL tick, not a per-key signal.

Both v5 and v6 inherit v3's **persistently-armed operand-parser breakpoint** (`30CF:0000`,
firing 22-23 times just during title/load) plus `Drain-Hits`, which halts the CPU and issues a
debugger-console `RUN` every time that hot address fires. `tools/trace_pool_ecl2_20_keydelivery_isolation_v7.ps1`
tested the minimal counter-case: delete the anchor breakpoint entirely after the first halt, arm
nothing else, issue zero further debugger-console commands for the rest of the run, and send bare
keys bracketed only by `0x41A` peeks. Result: **`delivered_moves=6/6 delivered_looks=5/5`** --
every key landed. This is the decisive finding: **our own persistently-armed, high-frequency
breakpoint-drain instrumentation was itself wedging GameLink's keyboard-injection pipeline after
the first key, not GameLink/DOSBox-X's `press()` mechanism and not the game.** This likely
explains more than this one leaf -- several earlier rounds' "movement is timing/RNG-sensitive" or
"keys sometimes register as two turns" observations (logged across 2026-07-15 through -21 entries
in this doc) may share this same root cause and are worth revisiting with the bare-key technique
if they resurface.

**Step 2 -- re-added per-step evidence capture without reintroducing the wedge.**
`tools/trace_pool_ecl2_20_route_complete_v8.ps1` extended v7 with a `Get-MapCellState` function
(GameLink `dump-memory` only, zero debugger-console calls) called after *every* movement/LOOK key.
Result: delivery **stayed 6/6 + 5/5** even with a full 1 MiB dump-memory call interleaved between
every single key -- cleanly separating the two candidate culprits from the prior entry's closing
question: **dump-memory itself was never the problem; it is specifically the debugger-console
breakpoint-drain cycling that wedges delivery.** (The `Drain-Hits`-based CS:IP techniques in v3-v6
remain valid for evidence capture during non-interactive phases like title/load, just not safe to
interleave with time-sensitive movement input -- a concrete constraint for future rounds.)

**Step 3 -- new finding: keys are delivered AND consumed, but `[0xC04F]` never moves.** v8's
per-step data showed something unexpected: the BIOS ring buffer proved every key reached DOS and
was read back out (head==tail after each settle, advancing monotonically:
`2c00 -> 2e00 -> 30003000 -> ... -> 3c003c00 -> 1e001e00 -> 20002000`), yet `ecl_cursor`
(DGROUP+0x49ED) advanced only ONCE (after the very first `up`, `39589 -> 40354`) then froze
verbatim through the remaining 10 delivered-and-consumed keys, and `map_cell_byte`
(`[0xC04F]` via the `MapCellAreaOffset` formula) read **0** at every single one of 16 samples in
that run. Two follow-up experiments probed why:

- **`tools/trace_pool_ecl2_20_route_complete_v9.ps1`** -- identical to v8 but with settle time
  raised from 700ms/500ms to 4000ms/3000ms per key (testing "SEARCH's per-cell check needs more
  real time than we gave it"). Delivery stayed 6/6 + 5/5. `ecl_cursor` now showed a different
  but still simple two-value pattern: `0x9b68` through moves 0-4, then `0x9975` at move-05 and
  every LOOK thereafter. `0x9975` independently matches this doc's own established
  `search_location` entry address (line ~727 above) -- corroborating, via a completely different
  sampling method (free-run dump-memory snapshot vs. breakpoint-hit capture), that
  `search_location` is genuinely being reached. **`map_cell_byte` was still 0 at all 12 samples.**
- **`tools/trace_pool_ecl2_20_route_complete_v10.ps1`** -- identical to v9 but reordered: full
  movement sequence first with SEARCH mode OFF, then `s` toggled only immediately before LOOK
  (testing "SEARCH-mode-before-movement itself is blocking cell-descriptor progression"). Result
  was **byte-for-byte identical in shape** to v9's (`0x9b68` through moves 0-4, `0x9975` from
  move-05 onward regardless of whether `s` had been pressed yet; `map_cell_byte=0` at all 13
  samples). This cleanly **rejects** the SEARCH-mode-ordering hypothesis -- toggling SEARCH before
  vs. after movement makes no observable difference to either the ECL cursor pattern or the
  map-cell reading.

**Verdict for this round.** Three independent full runs (v8, v9, v10; ~41 total `Get-MapCellState`
samples across two settle-time regimes and two SEARCH-toggle orderings) all show `map_cell_byte`
frozen at exactly 0, while `ecl_cursor` shows a small, reproducible, non-frozen pattern that
independently corroborates `search_location` (`0x9975`) being reached. Combined with the doc's
existing CS:IP-confirmed finding that LOOK dispatches to `ON_GOTO` branch index 0 (masked value 0,
the generic "nothing here" branch) rather than index 3: **the `map_cell_byte=0` reading is
consistent with, and now cross-validated against, that independently-established finding** -- a
real (if modest) upgrade from "wholly unverified" to "corroborated candidate," though it still
does not meet this project's promotion bar (no independent byte-match/CS:IP proof that
`MapCellAreaOffset=0xEE9E` addresses the *live, current* cell rather than some other fixed or
stale byte). Given the reading's total invariance across 3 runs / 2 orderings / a 6x settle-time
range, despite proven key delivery, the leading open hypothesis going into the next round has
shifted: **the movement keys are very likely being delivered to and applied by the game (the
`ecl_cursor` pattern changes in lock-step with the movement/LOOK phases, and `search_location` is
reached exactly where expected), but the `[0xC04F]`-via-`MapCellAreaOffset` formula itself is
probably reading the wrong byte** (e.g. a fixed/starting-cell slot rather than the party's live
current cell) rather than the party genuinely failing to move. This is a sharper, different
diagnosis than the prior entry's closing hypothesis (uncertain settle time / uncertain SEARCH
semantics) -- both alternatives were tested this round and both came back negative.

**Also tested and definitively REJECTED this round:** the DoK-disassembly-derived flat DGROUP
block (`0xc073`=X, `0xc074`=Y, `0xc075`=facing, `0xc076`=wallType, `0xc077`=descriptor, from
`docs/engine/research/dok-natural-route.md` "2026-07-17 Update 3") does **not** apply to Pool's
own compiled binary. Sampled throughout v4-v6 alongside the `[0xC04F]` reading: values were static
and implausible for a 16x16 grid (x=6, y=126, facing=85, wall=160, desc=20 -- the last
suspiciously equal to `area_ecl_member_id`) and never changed across any read in any run. Recorded
here as a clean negative result so a future round doesn't re-try it without cause.

**Next steps for whoever picks this up:**
1. Re-derive or independently verify the `MapCellAreaOffset=0xEE9E` formula against a *known*
   different cell state -- e.g. load a save already sitting on a non-zero-descriptor cell (if one
   exists in the corpus) and confirm the formula reads something other than 0 there, or
   instrument the ECL VM's own `[0xC04F]` read instruction directly (a single, rare-firing
   breakpoint at that specific bytecode dispatch site, NOT the hot operand-parser address) to
   capture its true live value at least once with CS:IP-level rigor.
2. Given breakpoint-drain cycling is now understood to be the enemy of live input timing, any
   future breakpoint-based evidence capture during an *interactive* (not title/load) phase should
   target a single rare-firing address, armed via the proven persistent dual-arm technique, and
   never interleaved with time-sensitive key delivery -- prefer bare `Send-KeyBare` +
   `Get-MapCellState`-style dump-memory reads (both proven safe to interleave with delivery this
   round) for anything happening during the movement/LOOK window itself.
3. No native CS:IP evidence was captured this round (all new scripts deliberately avoid
   breakpoints past the initial anchor, per Step 1's finding) -- no new promotion JSON was
   produced. The existing `pool-operand-parser-cs-ip-confirmed-20260722.json` promotion from the
   prior entry stands unchanged.

**Round housekeeping.** New tooling under `tools/`: `trace_pool_ecl2_20_position_probe_v4.ps1`,
`v5.ps1`, `v6.ps1`, `trace_pool_ecl2_20_keydelivery_isolation_v7.ps1`,
`trace_pool_ecl2_20_route_complete_v8.ps1`, `v9.ps1`, `v10.ps1`. All run output under git-ignored
`build/` (`dosbox-x-pool-position-probe-v4/v5/v6-...`,
`dosbox-x-pool-keydelivery-isolation-v7-20260722-a`,
`dosbox-x-pool-route-complete-v8/v9/v10-20260722-a`). `tools/unicorn_dqk_trace.py` was not touched
(foreign uncommitted modification, left exactly as found). No DOSBox-X process remained running
at the end of this entry's work (verified via `Get-CimInstance Win32_Process` after every run). No
`BUILD-QUEUE.md` checkbox closes yet -- route completion (party provably on `(13,10)`, LOOK
dispatching to branch index 3, CS:IP evidence through `search_location`/`COMBAT`) was **not**
achieved this round, but the historical "keys silently stop delivering" mystery that has dogged
several rounds of this leaf is now root-caused with strong, reproducible, byte-level evidence, two
competing hypotheses for the remaining movement-gap symptom were tested and cleanly rejected, and
the open surface has narrowed to a single concrete, actionable next step (independently verify or
replace the `MapCellAreaOffset` formula).

## 2026-07-22 continuation: Pool's real C04B-C04F host registers recovered; target is behind a locked door

The outstanding `MapCellAreaOffset=0xEE9E` hypothesis is now **disproved and replaced from Pool's
own retail code**. The previously generated VROOMM correlation already places CoAB's
`sub_30F16`/`vm_GetMemoryValue` relocation-normalized cluster at Pool `GAME.OVR:0x82DF`
(cluster `29514cc2808e2b0f...`, public-stub-owned, two Pool callers). Disassembling that Pool
function exposes the exact special-memory switch: it subtracts `0xC04B` and dispatches cases 0..4
to direct DGROUP byte reads:

| ECL address | Pool DGROUP | Role |
| ---: | ---: | --- |
| `0xC04B` | `0x6AAD` | map X |
| `0xC04C` | `0x6AAE` | map Y |
| `0xC04D` | `0x6AAF` | direction (`0/2/4/6`; ECL reads half-direction) |
| `0xC04E` | `0x6AB0` | wall type in front |
| `0xC04F` | `0x6AB1` | current GEO descriptor/roof byte |

`tools/map_pool_ecl_dispatch.py` now derives this table from the generated CoAB oracle + VROOMM
correlation and Pool's own instructions; `--strict` requires the exact five-byte sequence. Two
focused extraction tests cover the complete and incomplete switch. The generated
`pool-ecl-dispatch-map.md` carries the table. `trace_pool_ecl18_route.ps1` and the current
route-completion script now read `C04F` from DS:`6AB1`, not from the Area1 allocation.

The correction turns the retained v2 RAM snapshots into a complete position trace without a new
DOSBox run:

| Snapshot | X | Y | direction | wall | descriptor |
| --- | ---: | ---: | ---: | ---: | ---: |
| post-load | 13 | 8 | 2 (E) | 0 | 0 |
| UP | 14 | 8 | 2 (E) | 0 | 0 |
| RIGHT | 14 | 8 | 4 (S) | 0 | 0 |
| UP | 14 | 9 | 4 (S) | 0 | 0 |
| UP | 14 | 10 | 4 (S) | 7 | 0 |
| RIGHT | 14 | 10 | 6 (W) | 10 | 0 |
| final UP | 14 | 10 | 6 (W) | 10 | 0 |

Thus all navigation inputs through `(14,10) W` worked; only the last forward failed. The reason is
in the retail GEO bytes: `(14,10)` west is wall slot 10 with door flag **2**, while target
`(13,10)` has descriptor 3. The graph search had correctly treated the edge as potentially
traversable but incorrectly let its raw `{UP}` key list imply unconditional traversal. The
original Gen1 movement contract (`ovr015.locked_door`) interprets flag 2 as a locked-door prompt
requiring Bash, Pick, or Knock before it moves the party. `find_geo_path.py` now emits every edge's
wall/door flag and a `required_interactions` list (flag 2 = Bash/Pick/Knock; flag 3 = Bash/Knock),
with focused tests.

One corrected live attempt added `P` after the final `UP`, but it stalled in GameLink's first
free-running input call immediately after the initial BPINT16 setup and produced no gameplay
artifacts. The outer 180-second bound fired; only the owned DOSBox PID 82912 was stopped and no
process remained. This is an automation failure, not negative evidence about Pick or the route.

**Next exact boundary:** restore bounded GameLink `press` completion, replay the now-byte-proven
position sequence, answer the flag-2 lock prompt (prefer Pick if the loaded party exposes it;
otherwise bounded Bash/Knock), verify DS:`6AAD..6AB1` becomes `(13,10), descriptor 3`, then LOOK
through branch `0x9F13`, `COMBAT 0xA0B3`, outcome, and resume. Keep the rare breakpoint/symbol pass
separate from interactive input per the instrumentation-conflict finding.

## 2026-07-22 continuation 2: locked door crossed; descriptor 3 and native COMBAT reached

The GameLink stall was in the client, not the guest. `GameLink._lock()` used
`WaitForSingleObject(..., INFINITE)`, so a mutex retained across a debugger/output transition could
strand any `press`, `peek`, screenshot, or RAM dump despite the CLI's `--timeout`. The client now
uses that timeout for every mutex acquisition, reports `WAIT_TIMEOUT`, and accepts
`WAIT_ABANDONED_0` as ownership transferred by Win32. Two focused unit tests cover both cases.

The corrected breakpoint-free route then completed twice. Proof directory
`build/dosbox-x-pool-route-hostregs-20260722-c` contains paired GameLink frames and live-RAM
states. The exact transition was:

| Input | X | Y | direction | wall | raw descriptor | ECL cursor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| final `UP` | 14 | 10 | 6 (W) | 10 | `0x00` | `0x9975` (locked-door input) |
| `B` (Bash succeeds) | 13 | 10 | 6 (W) | 0 | `0x83` | `0x9FD5` |

The first frame visibly says `LOCKED. BASH PICK EXIT`; the second shows the descriptor-3 room and
`LEAVE TALK ATTACK`. `P` in an earlier clean run was consumed but failed its random pick check and
correctly left the party at `(14,10)`. Bash succeeded without memory mutation and the original
executable itself moved the party, persisted the open edge, and dispatched selector 3.

Reproduction (requires the same untouched I-slot save hash checked by the script):

```powershell
tools\trace_pool_ecl2_20_route_complete_v10.ps1 `
  -OutDir build\dosbox-x-pool-route-hostregs-YYYYMMDD-a `
  -MovementKeys up,right,up,up,right,up,b `
  -PostRouteKeys b,b,a `
  -CaptureStateScreenshots
```

Proof directory `build/dosbox-x-pool-route-hostregs-20260722-d` selects `ATTACK`. Its paired state
changes the ECL cursor to `0xA0B4`, the instruction immediately after retail `COMBAT 0xA0B3`, while
the frame is the active Pool tactical board. This is direct native execution evidence for the
previously static-only branch and COMBAT target. A longer adaptive run used the game's visible
`QUICK` command and naturally advanced the large fight, but the party lost and `START.EXE` returned
to DOS. That is terminal-outcome evidence, **not** a native victory/resume claim.

Greybox now closes the deterministic half of the resume gate with a real-data golden over the same
`ECL2.DAX#20`/`GEO2.DAX#20` bytes. It asserts `(13,10)` raw descriptor `0x83`, the exact
`LEAVE/TALK/ATTACK` menu, roster `HOBGOBLIN x25`, monster 5 x2, monster 94 x1, and monster 4 x8,
`COMBAT 0xA0B3`, victory resume, clean end, and consumed flag `[0x4A81]=0xFF`. The same slice fixes
Greybox's Gen1 direction seed from the old `0xC04E` assumption to retail-proven `0xC04D`;
`0xC04E` is wall type.

**Remaining native-only boundary:** win (or otherwise non-terminally resolve) this 36-creature
retail fight and capture the original executable after `0xA0B4` through `[0x4A81]=0xFF` and return
to exploration. This is no longer a blocker for branch/roster/resume behavior in Greybox, which is
covered by the real-byte VM golden, but it remains required before claiming native victory/resume.
