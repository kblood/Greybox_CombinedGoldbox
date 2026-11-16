# CoK map resource consumer trace — 2026-09-27

## Added source slice: effect-7 terrain query to combat-map write — 2026-09-27

This static slice follows the selector-0 result from `EA67` into one
query-dependent terrain builder and the combat-map writer. It does not join
the resource-buffer fixture to the combat-map allocation or establish a
natural retail invocation.

`EA67` calls `E522` with selector 6 at `GAME.OVR:0xEAAC`, stores returned AL
at `DS:45E7` (`0xEAB0`), then calls `E522` with selector 0 at `0xEABE` and
stores that return at `DS:45E6` (`0xEAC2`). Selectors 2 and 4 store to
`DS:45E8/45E9`. It then calls terrain helpers `E596`, `E63B`, `E6B8`, and
`E890` at `0xEAEB..0xEAFA`. In the joined Task 74 fixture, query results in
selector order `6,0,2,4` were `1,0,0,1`; thus `DS:45E6..45E9` held
`0,1,0,1`. The fixture's `E63B` call therefore takes the false branch and
writes `0x17` at its four bounded derived cells. These are conditional
fixture observations, not naturally produced retail values.

At `GAME.OVR:0xE641`, `E63B` tests `DS:45E6` (selector 0's result). When it equals 1, it calls
`E1E0` four times with `(value,x-offset,y-offset)` arguments `(5,0,3)`,
`(5,0,4)`, `(10,1,3)`, and `(10,1,4)`. The false branch supplies value
`0x16` at the same offsets. `E1E0` reads value from `[BP+6]`, x offset from
`[BP+0x0A]`, and y offset from `[BP+8]`; it computes:

```text
x = 5*DS:45E5 + 6*DS:45E4 + 0x15 + x_offset
y = 5*DS:45E5 + 0x0A + y_offset
```

It bounds x to `0..49` and y to `0..24`, then writes `(value+1)` to
`ES:[DI+7]`, where `ES:DI` is the far pointer at `DS:6A2E` and
`DI = y*50+x`. Thus the true branch writes terrain bytes 6, 6, 11, and 11 at
the four derived cells; the false branch writes `0x17` at each. Header bytes and map
allocation are not written by these four calls. The coordinate globals,
allocation pointer, and prior/later writes remain inputs outside this slice.

The effect-7 callback's call at `GAME.OVR:0x10E60` reaches `E6:C0`, resolved
to `0x38E2E`; the callback saves returned AL and branches on whether it is 2
at `0x10E7D`. In `0x38E2E`, `LES DI,[DS:6A2E]` at `0x38E49` accesses the
map allocation and the routine toggles header byte `+6` at `0x38E4D` and
`0x38E8A`. It passes the map far pointer to `0x111:0x3E` at `0x38E85`.
The routine's own final returned AL is loaded from the separate table at
`DS:6A31 + 3*index` (`0x38EE2..0x38F01`) and shifted right once; no direct
cell-byte (`map+7+50*y+x`) access appears in this function. Therefore the
local source does not show a generated terrain byte controlling the callback
branch directly. Descriptor 24's fixup at code-relative offset `0x28E2`
identifies the call's segment word `0x111` as an `lcall_segment` relocation.
The unpacked START image has an overlay descriptor at segment `0x111`; offset
`0x3E` is stub 6 (`(0x3E-0x20)/5`), whose procedure offset is `0x08D8`.
Descriptor base `GAME.OVR:0x3E759` plus that procedure offset resolves the
target to `GAME.OVR:0x3F031`. The runtime-geometry resolver does not model
this original descriptor-segment route; its unresolved classification was a
tool-scope limit, not evidence that the call target is absent.

`0x3F031` searches candidates using the combat-map pointer passed by
`0x38E2E`. It calls `0x3EB4A` at `0x3F21D` with that far pointer plus
candidate coordinates and result pointers. `0x3EB4A` reads map-cell bytes at
`ES:[DI+7]` at `0x3EBA2`, `0x3EBE3`, and `0x3EC1F`, indexes resident tables
`DS:1EE5/1EE6` by the cell value, and uses those derived values in its
candidate scoring/acceptance logic. On accepted candidates, `0x3F031` updates
`DS:6A30/6A31/6A32`; the selected path distance is stored at
`DS:6A31+3*index` (`0x3F285`). Back in `0x38E2E`, the loop reads that table
at `0x38EE2`, shifts the selected byte right once at `0x38EE8`, and returns
it at `0x38F01`; callback code compares the result with 2 at `0x10E7D`.
The callee's own AL is not the callback result; its terrain-dependent shared
table write carries the effect. This proves the terrain-aware callback path,
but not a natural retail position pair or invocation. Task 79 closes at this
bounded source chain; Task 80 below closes a specific source-derived cell
against an explicit synthetic position pair.

### Task 80 bounded join: one generated cell read by the range path

The EA67 loop visits relative coordinate globals `DS:45E4=-3` and
`DS:45E5=0` (its loops run from -6 through 6 and -2 through 2). For the
conditional `E63B` true arm (`DS:45E6=1`), `E1E0`'s source formula writes
byte 6 at cell `(6,10)` among its four writes. The corresponding false-arm
byte at that cell is `0x17`. These branch and coordinate values are explicit
fixture assumptions; this does not establish that the retail query returns 1
at that loop coordinate.

A fresh focusless Unicorn `ContextMachine` used explicit combat positions
`(6,10,1)` and `(9,10,1)`, with the map otherwise left at its fixture default
terrain byte `0x17`. A code hook at `0x3EBA2` and `0x3EBE3` observed the
range search read cell `(6,10)` twice at each site. Changing only that byte
from `0x17` to source-derived true-arm value `6` left the range return at 3.
At `0x38EE2`, both fixtures selected `DI=6` and read value 6 from
`DS:6A37`; `0x38EE8` shifts it to the same return value 3. The effect-7
caller compares that value with 2, so this fixture takes the same not-equal
outcome in both cases. This bounded test shows that this particular generated
cell is read but does not affect the selected result for this position pair.

The consumer fixture supplied the source-derived cell byte directly; original
`E63B` was not executed in the same memory image. An earlier memory-read-hook
attempt changed `(6,10)` while using positions `(6,10)->(12,10)` without
matching the EA67 coordinate globals, then stopped at the resident-write
guard `0x06AA1`. Since that setup did not align the source cell and the
memory-read hook was intrusive, the run was discarded; the guard alone does
not identify a cause. A separate isolated `E63B` execution used an invalid
return setup and was discarded. No DOSBox or GUI was launched. Task 80 closes
at this bounded source-to-consumer join; no natural retail invocation or
effect-7 producer chain is established, so Task 63 remains active.
Task 77 closes at the local-helper boundary, Task 78 resolves the descriptor
entry, and Task 79 closes at the bounded terrain-dependent table/result
chain. Task 80 tracks the remaining cell-to-position join.

## Scope

This bounded static trace follows the map-coordinate/candidate consumer at
`GAME.OVR:0xEA67 -> 0xE522` into the retail map buffer and its loader. It does
not establish that the conditional `ECL1.DAX#33` coordinate writes execute,
that the loaded buffer instance is the one queried by `EA67`, or any effect-7
callback result. The bounded Task 74 fixture below joins the original loader
copy and original query code in one memory image, but substitutes a separately
verified helper result at an asserted helper-entry boundary. Inputs remain
fixture values; this is not composed ECL/startup or natural retail execution.
No DOSBox or GUI was used.

## Candidate consumer

`GAME.OVR:0xE522` calls local helper `0xE4A0` with the input coordinate and a
selector, offsets a second candidate using signed-byte arrays at
`DS:0x1ED6/0x1EDF`, then calls `0xE4A0` again and ORs the results. Its caller
`0xEA67` generates candidates from `DS:6D85/6D86` and uses selector values
`0,2,4,6` on the observed path.

`0xE4A0` calls VROOMM selectors `0x10B:0x2F` and `0x10B:0x2A`. The repository's
runtime-geometry resolver maps both to descriptor 29 in the retail `GAME.OVR`
pool at base `0x3D296`:

| Call | Resident stub / procedure offset | Resolved `GAME.OVR` target |
| --- | --- | --- |
| `0x10B:0x2F` | `START.EXE:0x1154`, proc `0x573` | `0x3D809` |
| `0x10B:0x2A` | `START.EXE:0x114F`, proc `0x6A2` | `0x3D938` |

Both routines check the supplied local x/y pair through `0x3D7D8` (`0..15` in
each dimension). They read the far pointer stored at `DS:6D7C`, compute
`y*16+x`, and return fields from the map cell. `0x3D938` (`0x2A`) reads
`ES:[DI] & 0x0F`, the low nibble of a wall plane. `0x3D809` (`0x2F`)
reads `ES:[DI+0x300]` and selects one two-bit door-flag value using selector
`0,2,4,6`.
The resolver's prologue validation confirms the targets; it does not establish
the runtime segment instance at the `EA67` call.

## Map buffer and loader

The initializer at `GAME.OVR:0x101EB..0x10254` allocates a `0x400`-byte buffer
through `0xA46:0x23F` and stores the returned far pointer at `DS:6D7C/6D7E`.
The four planar byte ranges used by these consumers are:

| Plane | Buffer offset | Extent | Consumer evidence |
| --- | ---: | ---: | --- |
| 0 | `0x000` | `0x100` | `0x3D938`, selectors 0/2: packed north/east wall slots |
| 1 | `0x100` | `0x100` | `0x3D938`, selectors 4/6: packed south/west wall slots |
| 2 | `0x200` | `0x100` | copied by loader; not read by this candidate query |
| 3 | `0x300` | `0x100` | `0x3D809`, selector door-flag reads |

The plane layout is cross-checked against
[`geo.ts`](../../../packages/engine/src/loaders/geo.ts): source bytes `raw[2:258]`
and `[258:514]` are nibble-packed north/east and south/west wall slots;
`[514:770]` is backdrop/zone data; `[770:1026]` carries two-bit door flags.

The loader at `GAME.OVR:0x3E5A3` constructs `GEO%d.DAX` from `DS:0x5782`,
passes its byte argument (map ID), two far-string pointers, and far output
pointers to `0x69C:0x88E`, then copies four `0x100`-byte regions from the
returned block, starting at source offset `+2`, into `DS:6D7C` via
`0xA46:0x163E`. Task 71 mapped the helper and its ID-indexed record scan,
extent output, and allocated-data-pointer output. The exact filename/member
selected on a composed invocation and the relation to the later `EA67` buffer
instance remain open.

At `GAME.OVR:0x10627`, the observed new-game initializer writes
`DS:0x5782=1`, selecting the `GEO1.DAX` filename family on that path. The
retail archive contains blocks `#32` and `#34`, each with a decompressed extent
of 1,026 bytes. Their first 16 decompressed bytes are:

| Block | First 16 raw bytes |
| ---: | --- |
| `GEO1.DAX#32` | `00 04 37 41 30 41 47 34 37 34 30 25 40 35 35 40` |
| `GEO1.DAX#34` | `00 04 30 30 20 30 20 20 30 30 22 20 30 20 30 20` |

An existing bounded VM decode of retail `ECL1.DAX#34` emits `loadFiles(GEO 34)`
before its `loadPieces` effect (`research/m36-audit.md`, Probe 1). CoK's
`Files` opcode operand is the GEO block ID, while the area suffix comes from
`game_area` (`research/firstperson-wall-walk-cok.md`, §3.4). This makes
`GEO1.DAX#34` a concrete script-selected candidate when `game_area=1`, but the
VM observation is not a composed retail-runtime trace and still does not prove
that this same loaded block supplies the later `EA67` query.

The bytes/extent identify concrete retail candidate resources; the existing
VM decode identifies `GEO 34` as a script-selected candidate, but does not
prove which ID was passed in a composed retail run. The helper's ID comparison
and outputs are source-mapped; the exact file/path, matched archive record,
runtime argument values, and identity/segment of the buffer that `EA67` queries
remain open. Thus this task records a loader-to-consumer path and its exact
break, not a complete resource lineage.

## Task 65 closure and runtime gap

The ECL/resource relation is now source-backed at the semantic level:

1. Retail `ECL1.DAX#34` contains the decoded `LOAD FILES GEO 34` instruction
   at virtual `0x8028` and saves `LastEclBlockId=34` at `0x8042`.
2. Its `SearchLocation` code at `0x8094` conditionally issues `NEWECL #33` at
   `0x80B5` when the masked map selector equals 34. In `ECL1.DAX#33`, the
   entry at `0x804E` checks the preserved `LastEclBlockId==34`; that branch
   writes `(mapPosX,mapPosY,mapDirection)=(9,0,2)` at `0x8059..0x8065` before
   calling the map-wall/roof reload at `0x806B`. Exact raw bytes and condition
   caveats are recorded in the Task 63 continuation above in
   `cok-composed-startup-capture-2026-09-27.md`.
3. The independent bounded VM decode of retail `ECL1.DAX#34` emits
   `loadFiles(GEO 34)` before its `loadPieces` effect (`m36-audit.md`, Probe 1).
4. The `Files` operand supplies the GEO block ID; `game_area` supplies the
   `GEO%d.DAX` suffix (`firstperson-wall-walk-cok.md`, §3.4). Separately, an
   observed CoK initializer stores 1 at `DS:5782` (`GAME.OVR:0x10627`), so the
   loader constructs `GEO1.DAX` when that value holds. The retail `GEO1.DAX#34`
   member is 1,026 bytes with the source bytes shown above. The ECL VM effect
   is not joined to that initializer execution.
5. `Load3DMap` at `GAME.OVR:0x3E5A3` reads the requested GEO block through
   `0x69C:0x88E` and copies its four 256-byte planes, excluding the two-byte
   header, into `DS:6D7C`. The candidate selectors used by `EA67 -> E522`
   resolve to routines that also index `DS:6D7C`.

This closes the source-level conditional ECL transition and script/resource/
consumer contract for the GEO1#34 candidate and its 0x402-byte retail block
layout. It does not show
that the VM decode is a composed retail execution, that helper `0x69C:0x88E`
selected block 34 on that execution, or that the loader and candidate query
used the same runtime `DS` and allocation. Task 66 closed the opcode-to-buffer
source contract. Tasks 71 and 72 then mapped the helper ABI and opened the
remaining filename/member/instance join.
Do not infer that `ECL1#33` ran, seed `(9,0)`, or claim an effect-7 callback
result from this evidence.

## Task 70 correction and Task 71 result: `0x69C:0x88E` target and ABI

The CoK `START.EXE` on disk is EXEPACK-compressed. The first-pass direct MZ
formula that mapped `0x69C:0x88E` to file offset `0x744E` was invalid; that
location is compressed bytes. The local GOG Galaxy `START.EXE` is byte-
identical to the repository copy (SHA-256
`e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956`).

`tools/exepack_unpack.py:unpack_complete_load_image` produces a 65,568-byte
load image with 621 relocations and entry `0000:003F`. At load segment
`0x1000`, `0x69C:0x88E` addresses image offset `0x724E` and physical memory
`0x1724E`. In the saved 60M Unicorn memory (`build/cok-composed-cap-capture/
memory-60m.bin`), the full `0x1AE`-byte function extent matches the unpacked
image after applying its 13 in-range relocation words exactly. This capture
stopped before the overlay helper call, so it proves resident bytes at the
target address, not that a composed `Load3DMap` invocation reached it.

The apparent caller-frame mismatch is explained by two earlier
`A46:0x0AC4` calls in `Load3DMap`. Each pushes destination and source far
pointers, but the resident string-copy helper returns `RETF 4`, consuming only
the source pointer and leaving the destination pointer on the stack. The
intervening `A46:0x0B51` call cleans its four-byte argument. Thus the call to
`0x69C:0x88E` has 18 bytes of arguments: at `BP+0x14` and `BP+0x10` the two
preserved far string pointers; at `BP+0x0E` the requested one-byte block ID;
at `BP+0x0A` the output-size pointer; and at `BP+6` the output-data-pointer
destination. This matches the callee's reads/writes and `RETF 0x12` cleanup.

The callee passes the two strings and resource selectors to its local
`0x780` lookup, compares the requested ID at `[BP+0x0E]` against a candidate
record byte, zeros both outputs on the not-found path, and on a match allocates
the reported extent, writes the returned far pointer, and reads the selected
bytes. This establishes the ID-indexed file/block lookup and its size/data
outputs at source level. Task 71 closes at this bounded target/ABI contract;
actual file/member selection and the same runtime buffer later queried by
`EA67` remain unjoined. Task 72 continues that resource lineage. No DOSBox or
GUI was launched.

## Task 72 progress: path selector and candidate file resolver

In the `0x69C:0x88E -> 0x780` path, the helper indexes a far-pointer/table
record at `DS:(0x1E4A + 0x1E*DS:0x5782)` and passes `DS:0x5884` as a second
selector to its local `0x2A7` path builder. It invokes that builder for two
candidate paths, checks each through its local `0x4C1` file-existence wrapper,
and continues to the DAX member scan only after a path candidate succeeds.
The observed new-game initializer writes `DS:0x5782=1` at `GAME.OVR:0x10627`
and `DS:0x5884=0` at `0x1067A`; these writes share one straight-line setup
sequence. A second caller at `GAME.OVR:0x1086A` selects the same
`DS:(0x1E4A+0x1E*DS:0x5782)` record, calls `0x69C:0x2A7` with selector 0 to
write `DS:0x462A`, then passes that path to resident `A46:0x13C9`. That
wrapper executes DOS `INT 21h/AH=3Dh` to open the path; the caller then seeks
to offset 2 and reads `0x810` bytes. This corroborates `0x2A7` as an
area-indexed path builder, but it does not identify the table's bytes as a
particular filename. Combined with the documented `game_area` mapping, the
CoK map-loader path uses the `GEO1.DAX` family and selector 0 when those
globals hold. The table contents and runtime DS instance at the helper call
are not captured, so this does not prove which path candidate opened during
composed `Files(GEO 34)` execution. Task 72 later closed at the bounded
path-builder/open contract; Task 73 tracks table provenance and the later
`DS:6D7C`/`EA67` join. Static analysis only; no DOSBox or GUI.

## Task 72 bounded closure: path-builder contract

EXEPACK-aware disassembly of the unpacked START load image resolves
`0x69C:0x2A7` to image offset `0x6C67` and `0x69C:0x780` to `0x7140` at load
segment `0x1000`. The `0x7140` helper indexes a 30-byte area slot using
`DS:0x5782`, passes `DS:0x5884` to `0x6C67`, and attempts two output candidates
in sequence. The independent CoK caller at `GAME.OVR:0x1086A` uses the same
area-slot calculation with selector zero; it sends the first built path to
resident `A46:0x13C9` (`INT 21h/AH=3Dh`), seeks to byte 2, then reads `0x810`
bytes. This establishes that the path helper's result is used as a DOS archive
path, and that the caller has a fallback candidate. The straight-line new-game
initializer sets area 1 and selector 0.

The available composed-startup capture does not reach either caller. Its
60M snapshot has transient `DS=0x6733`; that unrelated segment's bytes at
`DS:0x1E4A` are not treated as the area table. Direct `GAME.OVR` references
to `0x1E4A` include the reads at `0x10878` and `0x1E905`; the `0x10096` byte
sequence is mid-data. Task 72 closes at the source-level builder/open
contract. Task 73 separately maps the statically loaded area-indexed prompt
records; the call-specific path, selected GEO member, and `EA67` buffer
identity remain open. No DOSBox or GUI was launched.

## Task 73 bounded closure: static prompt-record provenance

The retail `GAME.OVR` byte census finds only three raw occurrences of the
`0x1E4A` immediate: the two path-related reads at `0x10878` and `0x1E905`,
plus `0x10096`, which is inside a descriptor table rather than executable
code. The two code references calculate the indexed address and pass it to
START or the resident copy helper; neither stores to the table. A raw scan of
both `GAME.OVR` and the unpacked `START.EXE` load image found no direct absolute
stores using the `0x1E4A` operand. The image mapping below identifies the
relevant bytes as resident static prompt data, so no runtime writer is needed
for that table. The call-specific DS and which candidate path wins remain
unproven.

The MZ header reserves `0x105D` paragraphs of minimum extra allocation.
`DS:0x5782` under `DS=0x1BC6` maps to load-relative `0x113E2`, beyond the
`0x10020`-byte load image but within that reserved allocation. This establishes
the address as allocated under the observed mapping, not the initial contents
of that memory. The separate new-game initialization path writes area 1 to
`DS:5782`; neither that writer nor the early `DS=0x1BC6` observation establishes
the call-specific DS at `Files(GEO 34)`.

The indexed record at `DS:0x1E4A + 0x1E*area` is resident image data when
`DS=0x1BC6`. Area 0 contains the 15 little-endian words `1..15`; area 1's
30-byte record begins with control byte `0x17` followed by
`Insert disk 2 in drive ` and NUL padding. Area 2 and 3 have the corresponding
disk 3 and disk 4 prompts. At load segment `0x1000`, the area-1 record is
image offset `0xDAC8`, physical `0x1DAC8`; both saved memory snapshots contain
those exact bytes. The path resolver copies this indexed record into its
prompt/fallback handling, so it is disk-prompt data, not the actual GEO path.
The selected path still depends on the helper's other far-string inputs and
runtime branch. Task 73 closes at the static record provenance and literal
contents. Task 74 later closed at a bounded same-memory copy-to-query fixture
with the helper result substituted at its asserted entry; composed path/member
selection remains queued as Task 76. No DOSBox or GUI was used.

## Task 74 progress: archive-name construction

At `GAME.OVR:0x3E5A3`, `Load3DMap` reads `DS:0x5782`, passes that value through
resident `A46:0x131F` to format decimal text, then appends it to the
length-prefixed `GEO` string at overlay offset `0x12E3`. A second buffer holds
the `.dax` suffix from `0x12E7`. For the separately observed area value 1,
the source construction supplies the two components `GEO1` and `.dax`. The
caller retains those destination pointers across the short-string helper
calls. Reconciled with Task 71's 18-byte frame, `Load3DMap` passes the stem
buffer as `[BP+0x14]` and suffix buffer as `[BP+0x10]`; the block-ID byte is
`[BP+0x0E]`, extent output `[BP+0x0A]`, and data-pointer output `[BP+6]`.
Retail ECL1#34 supplies candidate ID 34, and the resident resolver scans the
selected DAX member index for that ID. This source chain establishes the
candidate basename and ID contract. A helper-level focusless Unicorn fixture
below observes the resolver selecting `GEO1.dax` under its DOS stub; the
composed runtime path and destination-buffer identity at `DS:6D7C`/`EA67`
remain open. No DOSBox or GUI.

Keep the three inputs separate until a single invocation joins them: area 1
comes from the new-game initializer, selector zero from a separately mapped
state, and GEO ID 34 from retail ECL1#34. On success, `0x69C:0x88E` returns a
resource-block allocation; `Load3DMap` copies four planes from that source into
the distinct destination buffer at `DS:6D7C`. The required later join is from
that destination buffer to `EA67`'s query, not pointer equality between the
helper output and `DS:6D7C`.

The first disposable attempt was invalid: `emu_start` began with `CS=0`, so
execution started at `0000:724E`, outside the loaded image. The corrected run
explicitly set `CS=0x169C` and used the unpacked retail START image at load
segment `0x1000` with its 621 relocations. Its synthetic inputs were
`DS=0x1BC6`, area `DS:5782=1`, selector `DS:5884=0`, fixture-built `GEO1` and
`.dax` far strings matching the source construction, requested ID 34, and the
reconciled 18-byte frame. These inputs were supplied separately; no composed caller connected the new-game
area/selector to the ECL1#34 operand.

The DOS fixture was backed by retail `GEO1.DAX` (SHA-256
`e3670f73462c68dc15a438229aba82daf62f55e8e029a87e9da47ec4769165ae`). Its
`FindFirst` and open hooks each observed `GEO1.dax` twice. The helper returned
extent `0x0402` and far pointer `8F00:0000` (linear `0x8F000`); the 1,026 bytes
at that address exactly matched the retail decompression of `GEO1.DAX#34`.
The helper used a synthetic allocator arena at `0x8F000..0x8FF00` and a
fixture-supplied callback pointer prescribed by START's initializer bytes at
image offset `0xA497` (`MOV [DS:439A],00A9; MOV [DS:439C],CS`). The initializer
itself was not executed as part of a composed startup. DOS search/open behavior
was stubbed to accept the GEO1 basename, so this proves the helper's result
under those explicit inputs, not a real DOS search result. The two observed
`FindFirst`/open calls are not evidence that two distinct fallback paths
succeeded.

### Task 74 milestone: execute original `Load3DMap` copy

A second bounded Unicorn run loaded the original descriptor-`0x10B` overlay
code containing `Load3DMap` (`GAME.OVR` file offset `0x3D296`, code size
`0x1451`, function entry offset `0x130D`) at a synthetic overlay segment and
applied its 57 segment relocations. The caller itself constructed the `GEO1`
and `.dax` strings and invoked resident `0x69C:0x88E` with its original 18-byte
frame. With fixture-supplied `DS=0x1BC6`, area 1, selector zero, and a direct
function argument of ID 34, the synthetic DOS fixture again observed
`GEO1.dax` for both find/open calls. The original helper returned source
pointer `8F00:0000` and extent `0x0402`; the original four copy calls filled
the fixture destination named by `DS:6D7C` (`9200:0000`). All `0x400` bytes
matched decompressed retail `GEO1.DAX#34[2:1026]` exactly. The function
returned to the probe sentinel.

This run joins the original name construction, helper output, and original
plane-copy code under a focusless fixture. The area, selector, and block ID
were still separate fixture inputs: it did not execute the ECL caller or a
composed game startup. The DOS search/open behavior and allocator state were
stubbed/configured, and overlay code ran at a synthetic segment. `EA67` was not
executed in this loader run; a later joined fixture is recorded below. No
DOSBox or GUI was launched.

### Task 74 bounded closure: conditional copy-to-query fixture

The joined bounded Unicorn fixture loaded the complete unpacked retail
`START.EXE` at `0x1000` and applied all 621 relocations. It loaded descriptor
`0x5E` (query code) at `Q=0x5200` and descriptor `0x10B` (loader/reader code)
at nonoverlapping `H=0x5600`; the earlier `Q=0x5200`, `H=0x5300` layout
overlapped by `0xE6A` and is invalid. The original `0x10B:0x2F/0x2A` query
calls were routed to procedure offsets `0x573/0x6A2`. Fixture state included
`DS=0x1BC6`, area 1, selector zero, ID 34, destination `DS:6D7C=9200:0000`,
and later synthetic pose `(7,3)`.

At the actual resident helper entry `169C:088E`, the fixture parsed and
asserted stem `GEO1`, suffix `.dax`, and ID 34. It then substituted the
separately verified helper result: extent `0x402`, source pointer
`8F00:0000`, and the exact decompressed retail `GEO1.DAX#34` member bytes.
The helper entry was patched to `RETF 0x12`; it did not execute in this joined
run. Original `Load3DMap` continued at `H:130D` and executed all four original
plane-copy calls. At `H:142A`, before later unrelated post-load calls, all
`0x400` bytes at `DS:6D7C` matched raw member bytes `[2:1026]`, with SHA-256
`41c4da84def6b42d18e8d91f21226204492c65a1bac7e7afcee7b183f32b4e5f`.

In that same memory image, original `EA67` ran through the boundary at `Q:094F`
before continuation `0xEAE9`. Its first four `E522` calls used selectors
`6,0,2,4`, each at `(1,1)`, and wrote `1,0,0,1` to `DS:45E7`, `45E6`,
`45E8`, and `45E9` respectively (`DS:45E6..45E9 = 00 01 00 01`). At original
reader instruction sites, effective reads resolved into the same destination:
`H:0792` read `9200:0111` (value `0x33`), `H:0602` read `9200:0311`
(value `0x00`), and `H:0741` read `9200:0010` (value `0x22`). These addresses
were resolved and sampled at the instruction sites; no Unicorn memory-read
hook is claimed. Other sampled bytes included `9200:0011=00`,
`9200:0101=00`, `9200:0112=30`, and `9200:0021=30`.

This closes Task 74 as a conditional original-code copy-to-query contract in
one Unicorn memory image. The helper result was substituted at an asserted
entry boundary, while area, selector, ID, allocator/DOS environment, and pose
remain fixture inputs. The fixture does not establish uninterrupted helper
execution in that joined image, composed ECL/startup execution, natural retail
runtime, natural pose, DOS results, or an effect-7 callback result. The first
overlapping descriptor attempt and the separate invalid-instruction attempt
are discarded as invalid probes, not retail outcomes. No DOSBox or GUI was
launched.
