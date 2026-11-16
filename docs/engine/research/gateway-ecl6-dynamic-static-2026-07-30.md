# Gateway ECL6#21 dynamic wilderness — retail static contract

Date: 2026-07-30
Method: local retail ECL/GEO/OVR bytes and existing EclDump output; no DOSBox run
Deliverables: `tools/analyze_gateway_ecl6_dynamic.py`,
`tools/test_analyze_gateway_ecl6_dynamic.py`

## Result

Gateway's wilderness is one ECL member dynamically mounting six distinct GEO blocks, not one
16×16 map. ECL host word `[4C24]` owns the current submap/`GEO6.DAX` block id (`21..26`), while
`[C04B]`, `[C04C]`, and `[C04D]` own local X, local Y, and facing ordinal
(`0=N, 1=E, 2=S, 3=W`). Crossing a sector changes `[4C24]` and remaps edge-local coordinates, then
re-enters the same initial-entry loader.

The encounter cadence is also exact now: after a successful encounter, three eligible
`SearchLocation` calls only increment `[4C00]` from 0 to 3. Beginning with the fourth eligible
search, retail rolls on **every** eligible search until one succeeds; a failed roll does not reset
the counter. This corrects the loose phrase “random encounter every three steps.”

Gateway's own `GAME.OVR` resolves the formerly unknown `CALL 0x080C`. Gen1 CALL subtracts
`0x7FFF`, producing routine id `0x880D`. The handler embeds `~Yes ~No`, stores a zero-based
selection, and compares it with 1. Therefore YES/index 0 leaves IF_EQ false and accepts the city;
NO/index 1 sets IF_EQ true and takes the decline branch.

## Retail provenance

| artifact | size | SHA-256 |
| --- | ---: | --- |
| extracted `ECL6.DAX#21` | 5,278 | `a74bf5afe5ad897cc901766bb191cbebb8883be9a729ceee3ee88ce2001adf6a` |
| `ECL6.DAX` | 22,197 | `858d1add57dd1165a1b11d0160b7d6bf4c1f867aa35a7e13d719698173dfa8d6` |
| `GEO6.DAX` | 6,959 | `e85fc2e7c0416ef4fbc4bb5f7e961d43d86805cbcd3d2cff8c8bf0f373e5c44d` |
| `8X8D1.DAX` | 4,202 | `26af43037aafd3490dd6fbd35a8d800a6f23f825df266f776acdbb529ea02548` |
| `8X8D6.DAX` | 30,468 | `97b199545eedc235c6d7c2e18fdb98c1578ec0a3c2b2a9934a1bedce6886a198` |
| Gateway `GAME.OVR` | 347,622 | `c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd` |

The six exact decompressed GEO blocks are all 1,026 bytes:

| block | SHA-256 |
| ---: | --- |
| 21 | `4ee4c99a0dc596b19d0f5150597a0153a90ed1ca77182889b3af51771777d2f2` |
| 22 | `8130be9cd3c6f026754a66921daf8164791094833eac3e0cb848df222a761ea0` |
| 23 | `16494e587507fb056dc6373d859c6113a57d810e08a9959fe2e346abaa56ea98` |
| 24 | `2a21dd005aafbfbd4fbcb2ed74fb71803dedaaa20d42759da6d052b978fe6b2f` |
| 25 | `7a3f611c8198ed1b6b03463c13491e5c0398d3e607975c5080072198853495be` |
| 26 | `fca7742b833fc600dab3f8b68ba10963b0220da75af095df9c376a5bdba17cd1` |

## Dynamic GEO and wall-piece selection

Initial entry at `0x808E` is data-driven:

```text
8094  LOAD_FILES [4C24], 2, 255
809C  [7F79] = [4C24] + [4C24]
80A6  [7F79] += 8
80AF  [7F7A] = [7F79] + 1
80B8  LOAD_PIECES 18, [7F79], [7F7A]
80C1  CALL 2E10                         ; refresh/redraw class
80C5  [4BF0] = X
80CC  [4BF1] = Y
80D3  CALL 2E10
80D7  [7EC9] = FF
80DD  [7F80] = FF                       ; suppress one encounter check
```

Consequently the exact load matrix is:

| `[4C24]` | GEO block | LOAD_FILES | LOAD_PIECES |
| ---: | ---: | --- | --- |
| 21 | 21 | `[21,2,255]` | `[18,50,51]` |
| 22 | 22 | `[22,2,255]` | `[18,52,53]` |
| 23 | 23 | `[23,2,255]` | `[18,54,55]` |
| 24 | 24 | `[24,2,255]` | `[18,56,57]` |
| 25 | 25 | `[25,2,255]` | `[18,58,59]` |
| 26 | 26 | `[26,2,255]` | `[18,60,61]` |

`[7F79]`/`[7F7A]` are scratch words reused later; they are not persistent submap ownership.
Persist `[4C24]` plus pose, not the computed wall ids.

### `LOAD_PIECES` operands are direct 8X8D banks in wilderness mode

The earlier “wall-piece” label is too generic for this area. Gateway's native opcode `0x37`
handler starts at `GAME.OVR+0x1898` and calls the ordinary two-argument piece wrapper. The wrapper
starts at `+0x4846E`, but it has a title-relevant branch absent from the current generic browser
loader:

```text
484A9  cmp word ptr es:[area + 01CC], 0    ; area.inDungeon
484B0  jne  dungeon_wall_path
484B2  push block operand
484B6  push symbol set
484B9  call Load8x8D
...    remember block/set in setBlocks[] and return
```

The dungeon branch constructs `WALLDEF` + `game_area` + `.dax`, decodes 0x30C-byte WALLDEF
records, relocates them, and only then loads paired 8X8D art. The zero/overland branch above does
none of that: it sends the ECL operand directly to `Load8x8D(symbolSet, blockId)`. The callee at
`GAME.OVR+0x4C96A` constructs `8x8d` + `game_area`, hence ECL6 resolves against `8X8D6.DAX`.

This settles the alternatives:

- `[18,50,51]` through `[18,60,61]` are **direct area-6 8X8D bank ids**.
- They are not WALLDEF ids, and they do not refer to retained WALLDEF slots.
- Shared `WALLDEF.DAX` blocks 5, 15, and 30 are irrelevant to this renderer. No
  `WALLDEF6.DAX` exists because the native overland branch never opens it.

`8X8D6.DAX` contains exactly the thirteen required ids. Every decompressed block is 2,858 bytes,
declares 70 tiles, and satisfies Gateway's solved planar5 wall-bank framing exactly:
`17-byte header + 41-byte prefix + 70 * 40-byte tiles`.

| block | SHA-256 |
| ---: | --- |
| 18 | `abd41effe42a93428af03af0f755ac77b2decf0fbb38bd60d43a330b916024d2` |
| 50 | `a8553eea5d446ed00381fe03c7316d6b575a0f7c368fd84b6f4b7cb98ae112a4` |
| 51 | `d6d9e5f6f623b6b18671840313f0c260c75a2a7bbdd890b94ca4caab6cc01d8a` |
| 52 | `b40a1490bb760cfbf7f490395f973aaf78f1009a7ff1c552269f5fd276138e8c` |
| 53 | `efdaef215bd85b8be7687b9579a09300fa8a555e03278ea7287d906a10a642e0` |
| 54 | `2625759e1631c86eedfaf8c8a3b1af7f80637893f6d876225c0deaa1af0d2cc8` |
| 55 | `96707799f864088135bf81825f0ab09c0c14623eaeb7c4e62d88c926d4c6e631` |
| 56 | `161ac2333face9b1a434d809e153854680d63764cdd14964f33ef2c0d5cec517` |
| 57 | `df1ab38fa0291915c04acc2e54eadd110a2190193b8a9d6f85b0d4bab866f1c5` |
| 58 | `c556aff842a6dff5a171e10019bdae2e9405a20fe8b0f1a9476f6d98257511f2` |
| 59 | `122d383d945dacc2a0403511f2a2e2dcd33fd4e8bdae254a5550b9e42d5677a3` |
| 60 | `3b383911d9023648a94854f4ce17c53077eabf911e1c9f7f466b82607f55799b` |
| 61 | `f7d0b4866ca5417cd858efc4a735500cd0cf7ce072c439fd11606e8b8160d9e0` |

### Native overland composition: GEO tiles plus a boot-bank arrow, not BIGPIC

Gateway's `Draw3dWorld` repeats the `area.inDungeon` check at `GAME.OVR+0x47C3B`. Zero dispatches
to a dedicated wilderness renderer at `+0x47178` and returns before the first-person WALLDEF path.
The renderer's loop is direct enough to transcribe:

```text
originX = clamp(partyX - 5, 0, 5)
originY = clamp(partyY - 5, 0, 5)

for screenY in 0..10:
  for screenX in 0..10:
    terrain = geo.plane0[(originY + screenY) * 16 + originX + screenX]
    Put8x8Symbol(0, false, 0x2E + terrain, screenY + 2, screenX + 2)

Put8x8Symbol(1, true, 0x100 + (nativeDirection >> 1),
             partyY - originY + 2, partyX - originX + 2)
```

The ordinary symbol router partitions `0x2E..0xFF` into three consecutive 70-symbol ranges.
For submap `S` and GEO plane-0 byte `t`, the exact compositor lookup is:

| terrain `t` | global symbol `0x2E+t` | symbol set | `8X8D6.DAX` block | local tile |
| --- | --- | ---: | ---: | ---: |
| `0..69` | `0x2E..0x73` | 1 | 18 | `t` |
| `70..139` | `0x74..0xB9` | 2 | `2*S+8` | `t-70` |
| `140..209` | `0xBA..0xFF` | 3 | `2*S+9` | `t-140` |

Equivalently, `set = 1 + floor(t/70)` and `localTile = t % 70`. All 1,536 retail terrain bytes
across GEO6 blocks 21..26 are inside this domain (per-block maxima 176, 170, 181, 186, 159,
and 188 respectively), so there is no overflow/fallback case to invent.

The party marker is also exact. Gateway boot code at `GAME.OVR+0x116E4` executes
`Load8x8D(4,0xCA)`, so set 4 is retained from **`8X8D1.DAX` block 202**, a 40-tile Gateway
planar5 UI bank (1,650 decompressed bytes, SHA-256
`4d77df8c1c24a0b371cacf313906785ff2c4f5949c13036682c7d9448f9638d8`). The native renderer
receives cardinal direction values `0,2,4,6`, shifts right
once, and requests global symbol `0x100..0x103`; therefore the routed local tile is `0..3`.
In terms of ECL's already-proven facing ordinal `[C04D]` (`0=N,1=E,2=S,3=W`), the direct formula
is `globalSymbol = 0x100 + [C04D]`, `set = 4`, `block = 202`, `localTile = [C04D]`. It uses
overlay/cursor-backup behavior rather than replacing the terrain tile.

There is no `BIGPIC6.DAX`, and this code makes no BIGPIC call. Gateway ECL6's overland is an
11x11 window composed from the selected GEO6 plane and the three direct 8X8D6 banks, with a small
direction arrow overlaid at the party cell.

## Six-submap transition graph

When host byte `[7ED5]` (`tried_to_exit_map`) is nonzero, `vm_run_1` enters `0x892D`, runs
party-region guards, calls the Sundabar guard, calculates `[4C24]-21`, and dispatches six ways.
The following is a literal transcription of `0x895E..0x8B2F`. “Lower” and “upper” denote the
coordinate-remapping branches; some direction/edge conditions are already implicit in the native
host setting `tried_to_exit_map`, so the implementation must not invent extra ECL guards.

| from | source edge/guard | to and coordinate remap |
| ---: | --- | --- |
| 21 | east | 22, `x=0`, preserve y |
| 22 | `x=0` (host west exit) | 21, `x=15`, preserve y |
| 22 | `x=15`, east | 23, `x=0`, preserve y |
| 22 | `y=15`, `x>=4` | 25, `x-=4`, `y=0` |
| 23 | `x=0`, west | 22, `x=15`, preserve y |
| 23 | `x=15`, east | 24, `x=0`, preserve y |
| 23 | lower remap, `x<4` | 25, `x+=12`, `y=0` |
| 23 | lower remap, `x>=4` | 26, `x-=4`, `y=0` |
| 24 | `x=0`, west | 23, `x=15`, preserve y |
| 24 | lower remap | 26, `x+=12`, `y=0` |
| 25 | `x=15`, east | 26, `x=0`, preserve y |
| 25 | `y=0`, `x<12` | 22, `x+=4`, `y=15` |
| 25 | `y=0`, `x>=12` | 23, `x-=12`, `y=15` |
| 26 | `x=0`, west | 25, `x=15`, preserve y |
| 26 | `y=0`, `x<12` | 23, `x+=4`, `y=15` |
| 26 | `y=0`, `x>=12` | 24, `x-=12`, `y=15` |

Every successful remap goes through `0x8B33`: set `[7EC9]=FF`, set `[7F80]=FF`, jump to the
dynamic loader at `0x808E`. That reloads GEO/walls and makes the first ensuing encounter check a
suppressed one.

The ordinary campaign entry from `ECL2#1` seeds submap 22 and y=12. It seeds x=4 when the incoming
facing ordinal is west (3), otherwise x=6, then sets game area 6 and chains to ECL block 21. That
is useful arrival provenance, but this memo does not claim every synthetic transition seed below
is naturally reachable through wall collision.

## Terrain probing and blocking

When the host has not already set `[7ED5]`, `vm_run_1` first checks whether pose is at the boundary
for its facing. At a boundary it advances temporarily (`CALL C01E`), captures the prospective
descriptor as:

```text
[7F7B] = [C04F] & 0x7F
```

then reverses facing, walks back, restores facing, and refreshes the current descriptor into
`[4C02]`. It also executes `ECL_CLOCK 12,3`; this is a clock operation and is distinct from the
three-search encounter counter.

For prospective codes 0..17 the exact `ON_GOTO` target table is:

```text
0:8373  1:839C  2:8373  3:8373  4:8373  5:8373
6:83BC  7:8373  8:8373  9:8373 10:839C 11:8373
12:839B 13:8373 14:8373 15:839B 16:8373 17:839B
```

- Code 6 prints `THE MOUNTAINS ARE IMPASSIBLE.`
- Codes 1 and 10 use the `THE WATER IS TOO DEEP.` branch, conditional on travel/boat mode
  `[4CF5]`.
- The common `0x8373` branch exits silently when `[4CF5]=0`; otherwise it asks
  `ABANDON THE BOAT?`, with acceptance writing `[4CF5]=0`.
- Codes 12, 15, and 17 go directly to EXIT.
- Codes 18..64 fall through to the same common `0x8373` behavior.
- Codes 65..114 exit silently.
- Codes 115..127 are location codes. Subtract 115 and dispatch 13 ways; code 120 is index 5,
  Sundabar.

These are exact ECL branches. Calling every EXIT target simply “blocked terrain” would overstate
what ECL alone proves because the native movement host owns wall collision and the
`tried_to_exit_map` prelude. The implementation contract is to preserve the two-stage host/ECL
sequence and the messages, not to derive one universal walkability boolean from the table.

There is also a separate avalanche blocker at `0x821F`: on submap 24, x=3, it blocks y=5 facing
south or y=6 facing north with `THE PASS AHEAD HAS BEEN BLOCKED BY AN AVALANCHE.`

## Encounter cadence and exact thresholds

`SearchLocation` calls `0x8BD6` before descriptor-specific text:

1. Compare `[7F80]` with zero, unconditionally clear it, and return if the old value was nonzero.
2. Return when current descriptor `[4C02] >= 18`.
3. If `[4C00] < 3`, increment it and return.
4. Once `[4C00] >= 3`, load a threshold indexed by descriptor, execute `RANDOM 100`, and encounter
   when `roll < threshold`.
5. A successful encounter enters `0x8136`, which resets `[4C00]=0`. A failed roll leaves it at 3,
   so the next eligible search rolls again.

Gateway's own opcode-08 handler begins at retail `GAME.OVR+0x0CCA`; at `+0x0CEB` its exact bytes
compare the byte operand with `FF` and increment it when lower. It then passes the incremented byte
to the native random helper. Operand 100 therefore yields integers 0..100 inclusive, 101 equally
possible outcomes. Threshold N is N/101, not N/100.

The exact descriptor thresholds at ECL bytes `0x8BC4..0x8BD5` are:

```text
descriptor:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17
threshold:   7  0 15 30 20  0  0 25  5  6  6  0  6  0  0  6 35 35
```

## Sundabar's two gate paths

Both paths converge on `0x8803`:

1. Prospective terrain/location code 120 reaches location-table index 5.
2. The post-host-exit path calls `0x87E3`, which requires exactly `[4C24]=24`, x=0, y=4,
   facing west (3).

At `0x8803` retail prints `ENTER SUNDABAR?`, executes raw `CALL 0x080C`, then immediately executes
`IF_EQ`:

```text
8803 PRINTCLEAR "ENTER SUNDABAR?"
8812 CALL 080C
8816 IF_EQ
8817 GOTO 8921             ; decline
881B PRINTCLEAR ""
881E SAVE 5 -> [7F12]      ; game_area = 5
8824 NEWECL 19
```

## `CALL 0x080C` host semantics from Gateway's own OVR

The opcode-2D handler is at retail `GAME.OVR+0x3C08`. Exact anchors:

| file offset | byte meaning |
| --- | --- |
| `+0x3C31` | `sub ax,7FFF` — raw `080C` becomes routine id `880D` |
| `+0x3BFF` | length-prefixed `~Yes ~No` menu |
| `+0x3D43` | `cmp ax,880D` dispatch |
| `+0x3D8F` | zero-extend/store returned menu selection to area2 `+06F2` |
| `+0x3DC3` | push selection, push 1, call compare helper |

Thus its synchronous contract is:

| selection | compare result | ECL result |
| --- | --- | --- |
| YES, index 0 | `0 == 1` false; IF_EQ false | accept, `game_area=5`, chain block 19 |
| NO, index 1 | `1 == 1` true; IF_EQ true | branch `8921`, remain in wilderness |

This is no longer an unresolved generic CALL effect for Gateway. It is a title-local host prompt
whose result must update compare flags before the following ECL instruction executes.

## Exact implementation contract

An engine implementation can remain generic while honoring the retail division of ownership:

1. Persist ECL memory `[4C24]`, `[4C00]`, `[4CF5]`, and the normal pose registers
   `[C04B..C04D]`; do not flatten the six GEO blocks into a single invented coordinate plane.
2. On each successful sector remap, mount GEO block `[4C24]`, load direct 70-tile 8X8D6 banks
   `[18,2*submap+8,2*submap+9]` into symbol sets 1/2/3, and suppress exactly one subsequent
   encounter check. Do not pass these ids through WALLDEF decoding.
3. Expose the host's real `tried_to_exit_map` state to `[7ED5]`; apply the literal transition
   function only on that path.
4. Preserve the temporary terrain probe/redraw calls and messages as a host/ECL interaction.
5. Model encounters as three eligible no-roll calls after a hit, then repeated 0..100 rolls until
   `roll<threshold`; descriptor 18+ never advances this counter.
6. Treat raw CALL `080C` under Gateway's Gen1 dialect as a synchronous YES/NO prompt that compares
   the zero-based selection to 1. Do not globally assign that meaning to every title without its
   own handler evidence.

## Focused implementation test seeds

- Dynamic loads: assert submaps 21 and 26 mount GEO 21/26 and wall sets `[18,50,51]` /
  `[18,60,61]`; loop all six formula rows.
- Transition graph: use the 16 before/after seeds pinned in
  `test_analyze_gateway_ecl6_dynamic.py`, including `22:(4,15,S)->25:(0,0,S)`,
  `23:(3,15,S)->25:(15,0,S)`, `23:(4,15,S)->26:(0,0,S)`,
  `25:(12,0,N)->23:(0,15,N)`, and `26:(12,0,N)->24:(0,15,N)`.
- Guard negatives: `21:(15,7,W)`, `22:(3,15,S)`, and `25:(5,1,N)` produce no remap.
- Cadence: descriptor 3/threshold 30, counter 0: three calls yield counters 1,2,3 without rolls;
  fourth call roll 30 misses and leaves 3; fifth call roll 29 hits and resets 0.
- Suppression: `[7F80]=FF`, descriptor 3/counter 2 clears the flag and leaves counter 2.
- Descriptor gate: descriptor 18/counter 3 performs no roll and leaves the counter unchanged.
- Sundabar: submap24 `(0,4,W)`, YES/index0 yields IF_EQ false + area5/block19; NO/index1 yields
  IF_EQ true + no chain. Adjacent pose `(0,4,E)` must not pass the exact-pose gate.
- Terrain: code6 reaches the mountain text target, codes1/10 reach the deep-water target, code120
  reaches Sundabar, and codes12/15/17 reach direct EXIT.

## Fact/inference boundary

Hashes, decoded operands, memory addresses, transition arithmetic, threshold bytes, OVR menu text,
selection comparison, and city chain are proven directly from retail bytes. Direction names use
the already-proven Gen1 host-register mapping. The words “boat mode,” “upper,” and “lower” are
semantic labels inferred from nearby retail text and coordinate geometry; the analyzer reports raw
address/guard behavior independently of those labels. Static transitions prove rules, not natural
reachability of every arbitrary pose. Full legal cross-area browser travel plus save/reload remains
an integration/runtime task.

## Reproduction

```powershell
python tools/analyze_gateway_ecl6_dynamic.py `
  build/gateway-ecldump6-20260729/ECL6_021.bin `
  --geo6 build/runtime-gateway-campaign-cycle-20260729/GEO6.DAX `
  --game-ovr 'C:\Program Files (x86)\GOG Galaxy\Games\Gateway to the Savage Frontier\GAME.OVR' `
  --8x8d6 'C:\Program Files (x86)\GOG Galaxy\Games\Gateway to the Savage Frontier\8X8D6.DAX'

python -m unittest tools.test_analyze_gateway_ecl6_dynamic -v
```

The unit tests remain useful without installed retail artifacts; the byte/hash integration portion
skips only when its ignored local input is absent.
