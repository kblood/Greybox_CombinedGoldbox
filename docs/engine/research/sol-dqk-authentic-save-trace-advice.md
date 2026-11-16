# Memo: next original-DOS DQK runtime experiment

## Recommendation

Start with authentic **slot B**, `SAVGAMB.QSV`, then replay the same instrumentation with slot A.

Slot B is the cleanest first control because its saved module and ECL selector both equal `66`. Area 66 already has a byte-pinned Gen2 sequence—five `LOAD_MONSTER`s, four-operand `PARLAY`, then `COMBAT`—against which the native parser can be checked. Slot A’s `module=58` / `ECL member=60` split is more valuable as the second run, specifically to determine how the retail host separates map context from ECL-member selection.

Neither save is an Area-5 save. Therefore this experiment can validate the generic Gen2 interpreter, original host/walker, combat handoff, and whether Area 66’s browser seam is naturally reachable. It cannot by itself prove Area 5’s one-operand `PARLAY` or settle the current four-versus-two-dragon discrepancy unless ordinary gameplay reaches member 5.

## Repository facts

- The existing browser Area-5 path starts from an authored logical pose `(29,2)`, executes southeast to terrain `0xE5`, then explicitly bridges into `CampInterrupted`; it does not claim those coordinates are an original save pose. See [dqkExplore.ts](../../../apps/web/src/ui/dqkExplore.ts#L294) and [dqkArea5Overland.ts](../../../packages/engine/src/world/dqkArea5Overland.ts#L106).
- Its current deterministic result is four monster `0x2E` dragons, driven by clean-room state/RNG. The pinned instruction trace is in [dqkArea5Overland.test.ts](../../../packages/engine/test/dqkArea5Overland.test.ts#L84).
- Area 5 has a member-specific one-operand `PARLAY` dialect; Area 66 uses the ordinary four-operand Gen2 frame. See [disassemble.ts](../../../packages/engine/src/ecl/disassemble.ts#L237) and [combat-source-matrix.md](combat-source-matrix.md#L110).
- Area 66’s browser proof jumps directly to ECL virtual address `0x8398`; the code itself says its normal gate is still research work. See [dqkExplore.ts](../../../apps/web/src/ui/dqkExplore.ts#L1024) and [dqkEvents.test.ts](../../../packages/engine/test/dqkEvents.test.ts#L204).
- Static CFG work does **not** currently find `0x8398` reachable from Area 66’s `vmRun1` or `SearchLocation`. Thus reaching the sequence natively would need either an indirect host path or a previously missed script edge; merely decoding it proves framing, not natural gameplay.
- Earlier synthetic Area-5 saves correctly transferred QSV bytes but stalled in a form loop or produced `DISK READ ERROR`; they never proved the real exploration walker. See [unicorn-dqk-trace.md](unicorn-dqk-trace.md#L1926).
- GameLink is a global singleton. The existing harness waits for an empty DOSBox-X process list, checks for foreign PIDs throughout, and kills only its owned PID. See [dqk-native-control-route.ps1](../../../tools/dqk-native-control-route.ps1#L103) and [dosbox-x-gamelink-automation.md](dosbox-x-gamelink-automation.md#L104).

### Raw authentic-save evidence

| Save | SHA-256 | Header state | Flat active-pose mirror | Resume bytes |
|---|---|---|---|---|
| `The Dark Queen of Krynn/cloud_saves/SAVE/More/3 - The Dark Queen of Krynn/SAVE/SAVGAMA.QSV` (local game/save data is not bundled). | `62E331A4…02086` | party 7, module `0x3A`/58, member `0x3C`/60, header pos `(30,0)` | `@1024..1026=(18,7,4)` | `@1029=4,@1031=2,@1033..1036=1,0,0,0` |
| `The Dark Queen of Krynn/cloud_saves/SAVE/More/3 - The Dark Queen of Krynn/SAVE/SAVGAMB.QSV` (local game/save data is not bundled). | `66523618…790B9` | party 7, module/member `0x42`/66, header pos `(30,0)` | `@1024..1026=(26,4,2)` | `@1029=4,@1031=2,@1033..1036=5,0,0,0` |

These bytes create two important cautions:

1. The header position and flat active-pose mirror disagree in both authentic saves. Which one the walker actually consumes remains unknown.
2. `decodeDqkSaveResume()` currently calls a save “initiated” only if `@1033=4`; these authentic saves contain `1` and `5`. See [dqkSave.ts](../../../packages/engine/src/loaders/dqkSave.ts#L159). Do not reject, patch, or normalize these saves through that predicate.

## Safe scratch mechanics

Use a new, never-reused `build/` mount. Copy the retail directory, then overlay both authentic slots verbatim in both the root and `SAVE/`. Preserve the B names; do not rename B to A.

```powershell
$repo = 'C:\Modding\GoldBox'
$retail = Join-Path $repo 'The Dark Queen of Krynn'
$auth = Join-Path $retail 'cloud_saves\SAVE\More\3 - The Dark Queen of Krynn\SAVE'
$mount = Join-Path $repo ('build\dqk-auth-oracle-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))

New-Item -ItemType Directory -LiteralPath $mount
Get-ChildItem -Force -LiteralPath $retail |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $mount -Recurse }

foreach ($name in 'SAVGAMA.QSV','SAVGAMB.QSV','VAULTA.DAT','VAULTB.DAT') {
  Copy-Item -LiteralPath (Join-Path $auth $name) -Destination (Join-Path $mount $name) -Force
  Copy-Item -LiteralPath (Join-Path $auth $name) -Destination (Join-Path $mount "SAVE\$name") -Force
}
```

Before launching:

- Record SHA-256 for `DQK.EXE`, `DISK3/ECL.GLB`, `DISK3/GEO.GLB`, and all eight staged root/`SAVE` copies.
- Expected authorities are `DQK.EXE = 6B0A9AC5…1F837`, `ECL.GLB = 40542071…3664D`, `GEO.GLB = FD843561…A2D1`.
- Record hashes again after the run. Any guest save write is then confined to scratch and attributable.
- Run only one DOSBox-X process machine-wide. Abort if any foreign PID appears.
- Use `output=gamelink`, `gamelink master=true`, and `mouse_emulation=always`; never use host `SendKeys`.
- Cleanup only the PID recorded in `probe-process.json`.

The harness needs a slot parameter because it currently hardcodes A at [dqk-native-control-route.ps1](../../../tools/dqk-native-control-route.ps1#L349). For B the route becomes `L → T → B → Enter → B`—the first B selects slot B; the second chooses Begin Adventuring.

## Runtime procedure

### 1. Calibrate live segments

Keep the existing pre-boot `BPINT 21 42`. At its first stop:

```text
delta = (CS - 0x1D99) & 0xffff
live(S) = (S + delta) & 0xffff
live DGROUP = live(0x322E)
```

This formula is live-DOSBox proven in [cok-m4-fidelity-plan.md](cok-m4-fidelity-plan.md#L1638). Record `CS`, `DS`, `ES`, `SS:SP`, the delta, and the computed DGROUP. Delete the startup interrupt breakpoint before the time-sensitive Play input.

### 2. Capture fixed checkpoints

At every checkpoint, first stop the guest at a confirmed debugger boundary; then take the screenshot, register snapshot, targeted memory, and a coherent GameLink dump of conventional RAM `0x00000..0x9FFFF`.

| Checkpoint | Required evidence |
|---|---|
| C0 | Title and slot-selection screens; mounted EXE/save hashes. |
| C1 | Slot B roster loaded, before Begin Adventuring. Confirm seven party entries and `SAVE\SavGamB.qsv` access if file I/O is logged. |
| C2 | Journal prompt, solved answer, and accepted post-answer frame. |
| C3 | First stable post-journal screen, before any movement/menu action. Stop immediately if it is narrative, town, or another non-explorer form. |
| C4 | First visible exploration command state; screenshot before input and full runtime-state record below. |
| C5 | Exactly one GameLink movement/turn input; record the first pose/current-record write and the first ECL invocation causally following it. |
| C6 | Encamp/pre-camp/camp-interrupted screen if available; use only a displayed first-letter command. Do not guess through an unknown story choice. |
| C7 | Reaction or `PARLAY` screen; capture parser arrays before choosing the first displayed attitude. |
| C8 | Top-level `COMBAT` and first tactical command frame, before issuing a combat command. Dump the combat surface here. |

For breakpoint-safe input, use `queue-key down`, wait about 100 ms, then `queue-key up`. Unlike normal `press`, `queue-key` is explicitly designed to release an edge even if a debugger breakpoint pauses the guest; see [dosbox_gamelink.py](../../../tools/dosbox_gamelink.py#L343).

### 3. Exact memory capture

Let `G` be live DGROUP.

| Range | Contents/reason |
|---|---|
| `G:AE50–AE70` | Modes; current stream pointer `AE5C:AE5E`; selected member `AE63`; related stream state. |
| `G:B180–B220` | Operand low bytes `B185+index`, opcode `B1C7`, current-record pointer `B20F:B211`, operand types `B215+index`. |
| `G:B7F0–B800` | Current ECL cursor `B7F9`. |
| `G:BED0–BEF0` | Combat-map pointer `BEDB:BEDD`. |
| `G:C9E0–CA30` | Active pose `C9F0..C9F2`, combat context `CA03`, form callback `CA23`. |
| `[B20F:B211]+0x00..0xFF` | Current record; retain at least `+0x13` module, `+0x16` ECL member, and `+0x24..+0x26` pose/state. |

At every `B1C7` opcode write, calculate the wrapped stream address as:

```text
streamSeg : ((streamOff + B7F9) & 0xffff)
```

Dump 32 bytes before and 64 after, with 16-bit offset wrapping. Do not treat `B7F9` as a direct `ECL.GLB` file offset; prior traces proved the stream is staged runtime data.

Also capture the operand parser at live canonical `2033:0013` and typed accessor at `2033:0112`. Save:

```text
SS:SP+4 / SS:BP+6   requested operand count
G:B215..B21A        operand types
G:B185..B18A        low/immediate bytes
G:AE6A..AE70        high/aux bytes
G:AE5C..AE5F        stream far pointer
G:B7F9              cursor
```

Those arrays and their roles are established in [dqk-2033-accessor-patterns.md](dqk-2033-accessor-patterns.md#L36).

### 4. Expected Area-66 control

For ECL ID 66 the header entrypoints are:

```text
vmRun1          0x8592
SearchLocation  0x8629
PreCampCheck    0x8151
CampInterrupted 0x8193
InitialEntry    0x8014
```

The known direct subroutine is:

```text
8398  LOAD_MONSTER 24,4,3
839F  LOAD_MONSTER 36,1,3
83A6  LOAD_MONSTER 24,3,3
83AD  LOAD_MONSTER 61,2,2
83B4  LOAD_MONSTER 63,4,10
83C1  PARLAY       four operands
83CB  COMBAT
```

A valid native framing proof requires `0x2033:0013` to report four operands at `0x83C1`, with the next staged opcode byte equal to `0x24`.

A valid **host-reachability** proof additionally requires the sequence to follow an authentic explorer/camp action, without memory pokes or a direct cursor jump. Preserve the preceding ECL branch, return stack, and current-record state so a hidden host call can be distinguished from a decoder-only invocation.

### 5. Combat handoff

On top-level `0x24`, arm the load-adjusted, byte-validated anchors:

```text
25A4:1D03  parsed combat operands available
25A4:1D47  CA03 write
28D0:0E70  combat setup dispatcher
28D0:0F25  DungCom1 consumer
28D0:0F3E  WildCom1 consumer
2740:0846  combat viewport renderer
2740:172C  combat cell renderer
```

Because overlay segments are reused, accept a hit only if the live instruction bytes match the documented `DQK.EXE` file bytes. Then read `BEDB:BEDD` and dump `0x04E2` bytes at `ptr:(off+9)`: the original 50×25 background-ID surface documented in [unicorn-dqk-trace.md](unicorn-dqk-trace.md#L575). Record its SHA-256, histogram, unique IDs, `CA03`, roster opcode sequence, initial facing, visible placement, and screenshot.

## Stopping and classification

Stop successfully at the first tactical command frame after all three are present:

1. authentic host action causally entered an ECL handler;
2. a real top-level `0x24` was dispatched;
3. a byte-validated combat anchor yielded a non-stale `[BEDB]+9` surface.

Stop early and classify—not “work around”—on `DISK READ ERROR`, foreign DOSBox PID, save/hash mismatch, an irreversible narrative choice, or an unknown non-explorer form.

Bound a negative run to 32 accepted explorer actions or eight fully observed camp/rest cycles. A bounded miss means “not reached from this saved state and action set,” not “unreachable globally.”

Use these result labels:

- **Parser-only:** native four-operand framing/roster sequence observed, but no authentic walker provenance.
- **Walker-only:** pose/current-record changed and header entrypoints ran, but no combat.
- **Natural combat:** walker provenance, top-level `COMBAT`, accepted map surface, and tactical frame all observed.
- **Route blocked:** no real explorer was reached.

## Slot-A discriminator

After the B run, repeat unchanged with A. The crucial native question is whether the stable state retains:

```text
current record +0x13 = 58
current record +0x16 / AE63 = 60
active pose = (18,7,facing 4) or header pose = (30,0,...)
```

Member 60’s header entrypoints are `vmRun1=0x8BB6`, `SearchLocation=0x8C01`, `PreCampCheck=0x89E6`, and `CampInterrupted=0x8A29`. If the retail host walks map/module 58 while executing member 60, Greybox needs an explicit map-context/ECL-member pairing rather than assuming one area ID selects both.

## Minimal browser test driven by the trace

Do not change the Area-5 four-dragon golden from the B trace alone.

The minimal justified test is one engine-level “native host replay”:

- initialize the exact authentic saved module, selected ECL member, active pose, and captured host state;
- execute the one native-observed movement or camp action through the normal host API;
- assert the selected header entrypoint and ECL cursor sequence;
- if native reaches `0x8398`, assert the five groups, four-operand `PARLAY`, `COMBAT`, combat-surface checksum/histogram, and initial facing without directly setting entry `0x8398`;
- if native does not reach it, add the corresponding negative host-route assertion and retain the existing Area-66 direct test as explicitly parser-only.

A true Area-5 parity test must later replay native member-5 evidence through `vmRun1=0x8429` and `CampInterrupted=0x83FD`, including the original host/RNG inputs and the native dragon count. Until that trace exists, the current Area-5 browser route remains a source-model experiment, not original-runtime parity.