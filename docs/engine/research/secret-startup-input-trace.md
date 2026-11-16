# Secret Startup Input Trace

> Status: focusless runtime reaches ECL3#97 descriptor 3 and active 2D combat; strict consumed/exit
> replay pending, 2026-07-15.

## Purpose

Reach Secret of the Silver Blades' original `LOAD SAVED GAME` flow without host focus, then use the
same run to prove the staged save, ECL3/GEO3 member 97, descriptor 3, combat, and resume route. This
note separates mechanical evidence from local vision annotations.

## Screen Sequence

The calibrated startup path is not a single title followed directly by the party menu:

1. first `ESC`: Forgotten Realms illustrated title;
2. second `ESC`: front menu containing `PLAY GAME` (vision reads highlighted `G`);
3. third `ESC`: party menu containing Create, Add, Load, Initialize, and Exit;
4. an additional `ESC` must not be sent as generic startup advance.

An earlier unselected party-menu capture had SHA-256
`d5166ebe61484006d2dbdf45c77ab750b1192c1d6a86526427b61f7bd2fc7ae5`. The previous claim that
three `down` edges selected Load was false: a paced control proved that three Downs activate
`INITIALIZE MOUSE/JOYSTICK`. Starting with highlighted `CREATE NEW CHARACTER`, exactly two Downs
select `LOAD SAVED GAME`.

This corrects both earlier notes that treated `d5166ebe...` as an activated Load state and the later
`934bb461...` selection claim. A vision model also mislabeled identical frames as different prompts;
hashes and resulting menu transitions remain authoritative.

## Input Contract

The installed Quick Reference Card says that a command is activated either by its highlighted
letter or by moving the cursor to it and pressing Enter/Return. Keyboard input remains active
regardless of the configured input device.

GameLink uses Windows set-1 scan-code indices through DOSBox-X's `windows_scancode_table`. The live
BIOS keyboard buffer proves the path end to end: an injected `l` produced word `0x266c` at physical
`0x426`, and the BIOS head/tail advanced from `0x26` to `0x28`. The game then consumed the entry,
leaving head equal to tail. Thus the current failure is beyond host focus, GameLink transport, SDL
mapping, and BIOS delivery.

Direct `L` did not change the final party-menu framebuffer for either:

- the hash-locked synthetic route save;
- the untouched installed save hash `54296c23...49ed9`;
- root plus `SAVE/` copies of that untouched save;
- the same dual-location save with all installed `CHRDATA1..6.SAV` and available `.SFX` sidecars.

These are negative controls only. They do not prove that dispatch was absent or that the save is
invalid: the statically mapped Load procedure can return to the same menu after its path/slot scan.
The source-documented activation control has now passed against the complete untouched working-copy
stage: two Downs plus Enter reached the slot/roster screen, then `A` plus Enter loaded the party and
returned a menu containing `SAVE CURRENT GAME` and `BEGIN ADVENTURING`. Evidence hashes are:

- before activation: `e8a237c2e442ebd5dbe742e560e220f4f2cc44d744fc7b6b5eb19e43f3148910`;
- slot/roster: `fccd855e5fe2286d083b45961d15b90c6923b67190fd864051aa56a48b230448`;
- loaded party menu: `14271f65b7c04952b32d67279d87cf02c6755e5c3f89a969b7a1b9dbbd24e9e3`.

The fixed workflow is `tools/run_secret_load_regression.ps1`; it preserves hashes, probe metadata,
and an advisory Ollama verdict without using host focus.

## Begin Adventuring And Loaded Members

After Load returns, the visible prompt is `PICK CHARACTER / SELECT / EXIT`. Escape returns to
`CHOOSE A FUNCTION` with Modify highlighted. Lowercase `b` and `Shift+B` produced no subsequent
frame-sequence change in that context, so the bounded regression uses the Quick Reference Card's
alternate cursor method: five Downs select Begin Adventuring and Enter activates it.

The resulting post-Begin checkpoint has SHA-256
`5369a767b5f0c1cefe9221d62519b6dec377a82b07a8e6dfc9626b510ddb8a22`. Relative to pre-Begin RAM
`22d6ad485767bd0f7915fe2c47955ac85f3cd0ef424564fce5338cfc26c05563`:

- decompressed ECL3.DAX member 97, SHA-256 `c3c760a3...0920`, matches raw offsets
  `0x2..0x18E2` exactly once at physical base `0x4DD9E`;
- decompressed GEO3.DAX member 97, SHA-256 `1b5bca8a...91a9`, matches raw offsets
  `0x2..0x401` exactly once at physical base `0x50A4A`;
- neither member body appears in the pre-Begin checkpoint.

The original first two decompressed bytes are replaced with zero in runtime memory; all remaining
6,369 ECL bytes and 1,024 GEO bytes are identical. `tools/inspect_gen1_loaded_dax.py` regenerates a
machine-readable strict proof. `tools/run_secret_load_regression.ps1 -BeginAdventuring` invokes it
as the pass/fail oracle before asking Ollama to annotate frames.

This proves the hash-identified member bodies were loaded between checkpoints. Body identity alone
does not identify selector variables, the descriptor source, or an execution address; the later
debugger trace below supplies those independent execution gates.

### Differential Selector Candidates

The fixed direct-run layout places DGROUP at physical `0x1CC80` (`DS=1CC8`). Two bytes track the
loaded identity across independent saves:

| Candidate | Physical | Synthetic ECL3#97 | Untouched control |
| --- | ---: | ---: | ---: |
| game-area/archive | `DS:0800` / `0x1D480` | `3 -> 3` | `1 -> 2` |
| ECL member | `DS:38A2` / `0x20522` | `0 -> 97` | `0 -> 17` |

The untouched post-Begin RAM independently contains decompressed `ECL2.DAX#17` at the same ECL load
base, so `DS:38A2` follows the actual member rather than merely containing an incidental `0x61`.
The synthetic strict regression asserts both candidate bytes along with the ECL3/GEO3#97 bodies.

These are runtime-backed selector candidates, not promoted symbols. A DEBUGBOX watch must capture
the consuming instructions before descriptor dispatch and translate them through the LOADFIX
segment delta.

The first LOADFIX BPM attempt deliberately tested `1E48:38A2`, using DS observed inside the Load
procedure. Input still advanced frame sequence `31 -> 45`, but that address remained zero and the
debugger did not stop. Post-run correlation found the selector-shaped `97` byte at physical
`0x28942`, exactly direct `0x20522 + 0x8420`; the correct memory-breakpoint alias is therefore
`250A:38A2`. This rejects treating Load's transient `DS=1E48` as the later route DGROUP.

The corrected `tools/trace_secret_begin_selector.ps1` run proves the transition and consumer:

```text
BPM 250A:38A2: 00 -> 61
writer stop:     4674:3E51, DS=1E48
consumer stop:   4674:3E62, DS:7420=03, DS:A4C2=61
consumer bytes:  A0 C2 A4 50 9A 34 00 E3 10
                 mov al,[A4C2]; push ax; lcall 10E3:0034
```

The preceding writer is byte-validated at `4674:3E49..3E4E`: it reads byte `Area1+0x1E4` through
the active Area1 far pointer and stores it at `DS:A4C2`. The memory breakpoint stops immediately
after that write. This promotes the two runtime values to execution-reached selector evidence, but
at this checkpoint did not yet name the callee behind public loader stub `10E3:0034` or the later
descriptor parser. The continuation below resolves both.

## Live ECL Loader, Parser, And Descriptor 3

The public stub is now resolved dynamically: `10E3:0034` is a far jump to loader entry
`407F:032C`. The loader reads archive selector `DS:7420` at `407F:035C`, reads the member argument
at `407F:03A0`, and publishes the decompressed body through `DS:67D2`. Its first operand-parser call
stops at `407F:0000` with `DS=1E48` and body pointer `561C:0000` (physical `0x561C0`). The exact
20-byte header is:

```text
01 01 D2 80  01 01 42 81  01 01 75 80  01 01 CD 80  01 01 14 80
```

Those are the five ECL3#97 entries `0x80D2`, `0x8142`, `0x8075`, `0x80CD`, and `0x8014`.
The parser's resident 312 bytes exactly match `GAME.OVR:0x9073`; its `es:[di-0x8000]` access proves
the address rule `body[virtual_address - 0x8000]`. The first five parser stops advance the cursor
through header offsets `0x8000, 0x8004, 0x8008, 0x800C, 0x8010`. During world initialization the
same 312 bytes relocate from physical `0x407F0` to `0x411B0`, so the active parser breakpoint becomes
`411B:0000` while the ECL body remains at `561C:0000`.

An initial direction-only control was correctly rejected. Secret's installed Quick Reference Card
says to select Move before issuing keyboard movement. The bounded GameLink sequence `m`, then `up`
from the staged `(13,3) W` host reaches the adjacent descriptor-3 cell and records this parser cursor
sequence:

```text
world initialization: 8000 8004 8008 800C 8010 8014 801A 8020 8026 802D 8034
after m + up:          80D2 8142 8148 8151 8156 826E
```

`0x8142` is the header's `search_location` entry. `0x8151` is the selector dispatch, and the jump
to exact target `0x826E` proves that original DOS selected descriptor 3. The strict artifact is
`build/dosbox-x-secret-descriptor3-target-20260715/selector-trace.json`. This promotes the loader,
parser, conversion, search entry, and descriptor target to execution-reached evidence. It does not
yet prove `LOAD_MONSTER`, `COMBAT 0x82BB`, an outcome, or resume. A later continuation reached the
first two; see the next-gate notes below.

## Static Party-Menu Dispatch

VROOMM descriptor `ovr019` contains the party-menu dispatcher. The menu widget returns the selected
row's command byte through its item record; the dispatcher compares that byte with uppercase command
letters. Its Load branch is:

```text
GAME.OVR 0x1DB08  cmp al,0x4C                 ; L
GAME.OVR 0x1DB0C  cmp byte ptr ds:0839,0
GAME.OVR 0x1DB13  lcall 00F8:0052             ; public stub
                      -> ovr020+0x2813         ; GAME.OVR 0x26100
```

`ds:0839` is assigned from party presence immediately before the menu: it is `1` when the far party
pointer at `ds:7D38` is null and `0` when a party is already present. Thus Load is enabled only in the
no-active-party state. Nearby branches route Add to `ovr020+0x0DA0` and Save to
`ovr020+0x2FAB`, corroborating the module boundary.

The Load procedure first validates the configured save drive/path through `ovr020+0x04F3`, then
enumerates slots `A` through `J` as `savePath + "savgam" + slot + ".dat"`. Its Pascal string anchor
is `ovr020+0x279F`; the three filename-construction references are at `+0x284A`, `+0x293A`, and
`+0x2990`. This establishes the next runtime breakpoints without assigning semantic names beyond
the byte evidence. A cross-game generated inventory is produced by
`tools/map_gen1_save_dispatch.py`.

The generated cross-game report also preserves family exceptions: DoK's literal is resident in
`START.EXE`, not `GAME.OVR`, while the available NWN DOS/AOL executable pair has no `savgam`
literal. Those cases remain explicit resident-mapping and non-literal filename-construction work,
not failed or silently omitted scans.

## Live RAM

DOSBox-X allocates `MemBase` directly after the packed GameLink revision-4 core structure. The
client now reads this appended RAM under the shared mutex instead of waiting for the profile-oriented
16 KiB peek table to be serviced by a future video transfer. In the local build:

- packed core size / RAM data offset: `5,456,282`;
- reported RAM size: `16,777,216` bytes;
- first-MiB proof SHA-256: `80c15c288c67e0655487d7caffc52fdfcf8ae4ff3af5352ff5b9ae12166ff75a`.

In the no-LOADFIX run, the keyboard poll signature is unique at physical `0x13CCA`, corresponding
to `139D:02FA`. The blocking read begins at `139D:030C`; it invokes BIOS `INT 16h/AH=00` at offset
`031A`. Far-call searches found seven live read callers and eight poll callers in the first MiB.

The decompressed resident command vocabulary includes `Load Saved Game` at physical `0x16871`.
The current rendered/heap copy begins at `0x5EA0B`, in a five-row contiguous menu allocation. These
addresses are run-local and are not promoted as retail symbols.

## Debugger Route

`START.EXE` requires a separate `LOADFIX -32` command before `DEBUGBOX START.EXE`; wrapping the
debugger command itself with LOADFIX reports a corrupt packed file. The deterministic entry chain is:

```text
BPINT 16; RUN
BPDEL *
BP 1CC3:105C; RUN
BPDEL *
BPINT 16; RUN
```

It reaches the game-level poll at `1BDF:0303` in the LOADFIX run. Runtime dump evidence is under
`build/dosbox-x-secret-keyboard-wrapper2-dump-20260715`. `1BDF:0145` is a Ctrl-C pending handler,
not a key normalizer; the generic line-input function at `1BDF:0391` accepts carriage return but is
not yet proven to own the party menu.

## Next Gate

The first synthetic stages appeared to reject hash `3c62d251...b42f6`, but debugger evidence
overturned that interpretation: both retail and synthetic saves return `AL=1` from the existence
check, read the first byte, complete every fixed wrapper read, and reach Load's `RETF`. The actual
difference was party reconstruction. The failed stage had `SAVGAMA.DAT` under configured
`C:\SAVE\` but left referenced `CHRDATA*.SAV` files at the mounted root. Retail therefore produced
party pointer `66DC:000E`, while the incomplete synthetic stage produced null.

With all referenced sidecars beside `C:\SAVE\SAVGAMA.DAT`, the same synthetic hash loads the roster
and active party menu successfully. The fixed wrapper now rejects stages missing any referenced
`.SAV` sidecar. The earlier offset-0 diagnostic used the same incomplete staging and proves nothing
about wrapper-byte validity; it is retained only as rejected evidence, not a format conclusion.

The continuation reaches `0x8279`, `0x8280`, `0x82AF`, menu helper `0x953A/0x953F`, then waits on
the visible Serpentine Inhabitants prompt. One documented Enter continues through `0x955D` to
`LOAD_MONSTER 0x82B4`. `COMBAT 0x82BB` has no operands, so it does not produce the parser hit the
first harness version incorrectly required. Instead, the post-load RAM cursor is already `0x82BC`
while `post-load-monster.png` shows the full 2D tactical board and command bar
`FIGHT / VIEW / AIM / QUICK / DONE`. This proves combat entry, but not combat completion or ECL
resume execution; `0x82BC` is parked as the return cursor during tactical play.

These are three distinct gates. Reaching the Serpentine Inhabitants is only the encounter/reaction
gate. Enter acknowledges that gate and the original `LOAD_MONSTER`/`COMBAT` path actively enters the
full 2D tactical mode. Only leaving that board and executing the parked cursor proves post-combat
resume. Do not collapse any two of these states into one "combat reached" claim.

The combat runtime is now mapped far enough for a bounded outcome control. Secret's retail
`count_teams` is byte-located at `GAME.OVR:0x3AC6D`; it clears `DS:87CC` and `DS:87CD`, walks the
combatant list through links at `+0x19D`, tests `in_combat` at `+0x1A7`, and increments the team
selected by `+0x1A8`. The active checkpoint contains `friends=6, foes=5`; the natural AutoQuick
defeat control contains `friends=0, foes=5`. Five live `12 HEADED HYDRA` records have stride
`0x1C0`, status `+0x1A6`, in-combat `+0x1A7`, team `+0x1A8`, and current HP `+0x1B5`.

`tools/dosbox_gamelink.py poke` now provides a compare-and-swap test control. Two silent integrated
runs changed only physical `0x26C4D` (`DS:87CD`) from `05` to `00` after the active tactical
checkpoint. The original engine then returned to the operand parser with parked ECL PC `0x82BC`;
the first harness missed that stop because DEBUGBOX displayed parser entry as `411B:0001` and kept
a stale `(Running)` line in scrollback. This is valid outcome/return evidence, but not yet the strict
consumed/EXIT gate. The initial redesign tried to replace the parser breakpoint with direct watch
`BPM 1E48:4CCD`; that address model is now rejected.

The first strict watch replay correctly armed F5 pause -> `BPDEL *` -> `BPM 1E48:4CCD` -> `RUN`,
preserved `friends=6, foes=0`, and left the parked cursor/consumed bytes unchanged at `0x82BC/00`.
The framebuffer explained why: a single `D` opens the original `Done` submenu
`Guard / Delay / Quit / Speed / Exit`; it does not clear the turn. CoAB source `ovr009.delay_menu`
confirms that submenu `Q` calls `clear_actions` and ends the selected hero's turn. The next strict
path therefore compare-and-swaps all five deterministic hydra `in_combat` bytes `01 -> 00`, keeps
foes `05 -> 00`, sends six `D,Q` pairs, and permits the vision agent to answer `N` only at the
expected `Continue Battle` prompt.

That revised path has now run once in one silent persistent DOSBox. Ollama selected `N` at the
visible Continue Battle prompt and Enter at the explicit victory/treasure prompt; the 2D board
closed and the ECL cursor advanced from parked `0x82BC` to `0x82C6`. The run did not produce the
strict proof because its watch still used the rejected direct-DGROUP address.

CoAB's `vm_GetMemoryValue`/`vm_SetMemoryValue` supplies the missing resolver for logical addresses
`0x4B00..0x4EFF`: each value is a 16-bit Area1 word at
`ES:((0x6A00 + logical_address * 2) & 0xFFFF)`. The execution-reached Secret parser has `ES=54DC`,
so logical `0x4CCD` resolves to `54DC:039A`, physical `0x5515A`. The retained tactical and post-board
RAM checkpoints prove `0000 -> 0004` there. The former direct alias `1E48:4CCD` instead remains
`0x2D00`. `tools/analyze_gen1_area_word_transition.py --strict` reproduces this from raw local
artifacts and emits the clean checked proof `secret-runtime-area-word-transition.json`. The harness
and resume validator use the derived ES-relative word address for RAM assertions.

A follow-up replay armed `BPM 54DC:039A` and again reached the same visible victory, board exit,
physical word `0004`, and cursor `0x82C6`, but DOSBox-X did not stop. Its memory breakpoints match
the segment alias used by the CPU, not every alias of the same normalized physical address. Static
retail mapping closes the file half of that gap: overlay 9 starts at `GAME.OVR+0x9073`, the setter
starts at `+0x0EC7`, and `GAME.OVR+0x9F94` is byte-exact `26 89 95 00 6A`
(`mov word ptr es:[di+0x6A00],dx`). A silent replay then disproved direct runtime projection
`411B:0F21`: that live pointer did not contain the setter, although the run reached explicit combat
choice, tactical board, `Continue Battle -> N`, victory `Enter`, consumed word `0004`, and cursor
`0x82C6`.

`tools/map_secret_runtime_setter.py` searches exact prologue and `+0x5A` write bytes in retained
1 MiB snapshots. It maps parser `411B:0507/0561`, tactical `41B7:0507/0561`, and resume
`4465:0507/0561`; generated evidence is `secret-runtime-setter-relocation.json`. The corrected
harness stops first at resume parser `4465:0000`, validates both runtime byte ranges, arms
`4465:0561`, and only then accepts a stepped write at cursor `0x82C5`.

`tools/map_secret_runtime_symbols.py` now makes the static half reproducible. It uniquely finds the
84-byte body at `GAME.OVR:0x3AC6D`, maps it through the parsed VROOMM layout to descriptor 26
`+0x2B1C`, validates all six embedded field operands, and writes
`secret-runtime-symbols.generated.md`. The generated symbol remains
`candidate_pending_secret_cs_ip_hit`; source similarity and RAM behavior do not substitute for an
execution hit at that descriptor-relative offset. The same report resolves public stub 32 and five
inbound calls from descriptors 10, 12, 14, and 15, providing exact breakpoint entry routes.

1. Strict-replay parser breakpoint `4465:0000`, byte validation, and derived setter breakpoint
   `4465:0561` with five hydras removed from combat and six `D,Q` party-turn completions; validate
   the live setter alias, then capture stepped
   `0000 -> 0004` with cursor `0x82C5`.
2. Normalize the encounter, tactical-entry, injected-outcome, and resume evidence into checked JSON.
3. Capture descriptor-26 `CS:IP +0x2B1C`; only then promote the generated count-teams candidate.

Do not use host input, add an unbounded key matrix, or infer a transition from vision text alone.
