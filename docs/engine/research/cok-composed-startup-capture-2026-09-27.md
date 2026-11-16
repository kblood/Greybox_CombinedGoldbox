# CoK composed startup capture — 2026-09-27

This note closes the queued title/startup capture subtask with the current
headless Unicorn artifacts. It does not connect startup to
`GAME.OVR:0xAEC9`, establish production `SS`, prove pixel parity, or validate
the effect-7 producer.

## 60M cap state

The composed run uses the complete EXEPACK image plus all 621 relocations at
load segment `0x1000`. It stops at `CS:IP=127F:29B8`, corresponding to START
image offset `0x51A8`, in the resident byte-merge loop. The saved state is:

| Register/state | Captured value |
| --- | --- |
| `SS:SP` | `2491:3C92` |
| `BP` / `CX` | `3CD4` / `0004` |
| `DS` | `6733` |
| `ES:DI` | `54E6:1B1C` |
| `[BP-0x10]` | `000C` (initial loop amount) |
| `[BP+0x0C]` | `0001` (optional-copy argument; bit `0x04` clear) |
| `[BP+0x14]` | `0000` (optional-copy destination pointer) |

The optional-copy branch is skipped at this capture. The `CX` loop is still
processing four remaining bytes. This does not establish the source or final
pixel output.

## Overlay code provenance

The START image at `0xEA3` contains `CD 3F 20 0D 00`, and the dispatcher returns
at `10E6:0045`. Procedure offset `0x0D20` maps into descriptor 24's
`GAME.OVR` source extent at file offset `0x365A6`; the procedure entry is
`0x365A6 + 0x0D20 = 0x372C6`. The runtime loader reads `0x37B4` code bytes to
segment `0x37F7` and separately reads its `0x1B6`-byte relocation table.

Comparing retail bytes `GAME.OVR[0x365A6:0x39D5A]` with runtime memory at
physical `0x37F70`, after applying all 219 relocation entries as
`stored_segment + 0x1000`, yields zero mismatches across all `0x37B4` bytes.
This verifies the loaded code extent and relocations. Descriptor 24's
stub-array scan still has two candidate starts, so selector geometry remains
ambiguous.

## Unsupported DOS boundary

The corrected replay consumed one synthetic key via `INT 16h/AH=00`; the
earlier `INT 16h/AH=01` was only a status poll. Its trace log records earlier
successful `INT 21h/AH=4Eh` searches for `GAME.OVR`, `KRYNN.CFG`, `8X8D1.DAX`,
`CPIC2.DAX`, `DUNGCOM.DAX`, and `RANDCOM.DAX`. The guarded continuation later
stops before returning a response to a malformed FindFirst request at
instruction 77,494,249, `CS:IP=19C4:0143`, with `DS:DX=2491:3446`. The request
bytes begin `43 3A 5C 76 FC FF 76 FA B0` (`C:\v...`). This is neither the
first nor an unsupported AH=4Eh request. Do not use the later unguarded
continuation, which fabricated a zero-match result for malformed bytes, as
evidence.

The 43-key run's stop boundary and register snapshot are under ignored
`build/cok-composed-dos-boundary/`; the 60M full memory and register captures
are under ignored `build/cok-composed-cap-capture/`. An optional VGA
instrumentation pass under `build/cok-composed-vga-cap-capture/` tracks
sequencer map masks and plane writes only. Its partial images are diagnostic;
they do not prove retail pixel parity. No DOSBox or GUI was launched.

## Task A result: bounded `DS:6DA2` graphics-resource-table reference audit

Trace aliases and computed stores to the `DS:6DA0..6DE3` graphics-resource table,
prioritizing paths before FDF2. Existing immediate references classify as
count/record consumers, cursor updates, resets, or far-pointer consumers. At
the end of that direct-reference pass, no producer had been established.
Follow each candidate pointer to stores at `base+0` (count), `base+8*n-6`
(four metadata bytes), and `base+8*n-2` (allocation far pointer), and keep any
remaining indirect paths explicit. This is separate from tracing the valid
return path of the unsupported DOS search toward `0xAEC9` and tracking `SS`.

### Initial call-site triage

The first reference pass classified direct consumers, resetters, and wrapper
calls but did not follow the wrapper's output pointer into its indirect stores;
Task 128 below supplies that producer trace.

- `GAME.OVR:0x3CA69` is descriptor 28 procedure `0x00E4`, reached through
  `0x0105:0x002A`. Its `[BP+0x0E]` far pointer is passed as the source, with
  an eight-byte stack local as destination, to `A46:0x0ADE`. The existing live
  selector trace maps `A46` to Borland runtime segment `126A`, and
  `126A:0x0ADE` is the bounded far-string-copy helper described in
  [`decompile-worklist.md`](decompile-worklist.md). **Semantics recovered 2026-10-11:**
  it copies a Pascal length byte plus `min(source_length, bound & 255)` payload bytes;
  it does not implement NUL-terminated `strncpy`. The image-relative entry is
  0A46:0ADE, and the returned stack consumes ten argument bytes. See
  [the verified Rust/C reconstruction](cok-c-rust-reconstruction-goal.md).
  It reads the input pointer
  and writes the local buffer; this is not a write through `[BP+0x0E]`. Its
  distinct far pointer at `[BP+6]` is freed/reset through `0x3CEBC` before the
  routine later reuses that same pointer as its graphics-resource-table output.
- `GAME.OVR:0x3CEBC` reads a count byte through the supplied far pointer, walks
  records at eight-byte intervals, calls `0x027F:0x1CF6` on each record, then
  clears `0x42` bytes through the same pointer. It is a consumer/resetter.
- `GAME.OVR:0x3D0B3`, reached through `0x0105:0x003E`, copies `0x42` bytes from
  its far-pointer argument to a stack local and reads a selected far-pointer
  entry for display. It is a copy/consumer.
- The other direct `0x0105:0x002F` references (`0x071C`, `0x44B6`,
  `0x1A440`, and `0xFDFD`) pass `DS:6DA2` to the same list consumer/resetter;
  none of these call instructions constructs a record. The `0x3D17A` local
  call reaches `0x3CEBC` directly with the same list address.
- Direct `0x0105:0x002A` references at `0x1301`, `0x9011`, `0x90BC`,
  `0x1D485`, `0x3925C`, and `0x392E6` resolve to the same descriptor-28
  procedure `0x3CA69`; their far pointers reach the helper-mediated path above.
  `0x903E` resolves through `0x0105:0x003E` to the copy/display routine above.
- `0x3B2F9..0x3B3A8` and `0x3D37..0x3D66` read indexed fields and update only
  cursor byte `DS:6DA3`. `0x1054E` clears the list; `0x106E6..0x106F6` zeros
  adjacent word `DS:6DA0`. These are cursor/reset paths, not count/entry writes.

The audit covers all 19 immediate `0x6DA2` references reported by
`xrefoff 0x6DA2`, including the direct pointer consumers, cursor reads, reset,
and helper wrapper. The separate candidate scan of absolute writes found no
direct absolute store to the count or entries. The original audit missed the
indirect stores through `3CA69`'s output pointer; Task 128 below maps that
writer. The composed startup trace loads overlay code but does not establish
the table contents or `SS` at a particular FDF2 invocation. Task A remains a
bounded direct-reference audit, not runtime-state proof.

### Task 128 result — graphics-resource-table producer

Static caller `GAME.OVR:0x1D479..0x1D48A` reaches `0x3CA69` through
`0x0105:0x002A` when the preceding `A46:0x0BC9` comparison accepts its key. It
passes source stem `DS:0x6DF7`, resource ID `DS:0x6E01`, mode 0, and destination
far pointer `DS:0x6DA2`. In `0x3CA69`, `[BP+0x0E]` supplies an eight-byte stem
copied to a local; `[BP+6]` is the distinct destination pointer. The routine
first releases the previous table through `0x3CEBC`, constructs
`<stem><DS:0x5782>.dax`, and calls resource loader `0x69C:0x088E` at
`0x3CB7D`. With a resource present, it copies the resource's declared count
byte to table base at `0x3CBC5`, sets base+1 cursor to 1 at `0x3CBCE`, and
iterates its records. For one-based entry index `n`, `0x3CC28` copies four
metadata bytes to base+`8*n-6`, and `0x3CCA4` passes base+`8*n-2` to resident
allocator `0x027F:0x1C2F`. The subsequent writes fill the returned resource
buffer and descriptor fields; `0x3CE6C` publishes the number of successfully
loaded entries at base+0. This yields a two-byte header followed by eight-byte
records: metadata at base+2 and the allocation far pointer at base+6 for the
first entry. It is a graphics-resource table, not an effect-callback list.

The caller's prior free and FDF2's later `0x3CEBC` cleanup use resident
`0x027F:0x1CF6`; unpacked retail START bytes map that free routine to `0x44E6`.
The allocator maps to START `0x441F`, whose bytes size the buffer from the
resource dimensions, store its far pointer, initialize its dimensions/stride,
and clear the allocation. These are static source findings. They do not
identify which successful `3CA69` call last populated the exact DS/allocation
later passed by a valid FDF2 invocation. Task 63 still owns that runtime join;
the synthetic mode-4 oracle is not evidence for its production contents.

### CoK SETUP_MONSTER source-selector/display trace — 2026-11-05

Read-only follow-up against the pinned CoK `GAME.OVR` (269,031 bytes,
SHA-256 `c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529`)
joins the ECL `SETUP_MONSTER` state to this resource-table path. At `0x125a..0x1276`,
the `APPROACH` handler loads `DS:0x72e9`, `DS:0x72ea`, the decremented/clamped
extent from area2 `+0x582`, and `DS:0x8830`, then calls descriptor routine
`0x4e:0x48` (`GAME.OVR:0x8fb6`). This agrees with the earlier Task 95 byte
trace, which established two approaches for its fixture but did not follow the
graphics path.

Within `0x8fb6`, byte windows `0x8ffa..0x901a` and `0x90a6..0x90c6` call
`0x0105:0x002a`, mapped above to the `0x3ca69` table producer. The call at
`0x9039..0x9047` passes `[BP-9]` and `DS:0x6da2` to `0x0105:0x003e`, mapped
above to `0x3d0b3`. That consumer uses its supplied index to select an
eight-byte table record, reads its resource-buffer pointer and dimensions, and
calls `0x027f:0x09c3` to render it. Therefore this retail static path is more
than stored encounter state: it reaches table-backed graphics loading and a
selected-resource display call.

The source-stem formal is now joined through the stack. The validated descriptor
map gives descriptor 7 base `0x8a41`; therefore `CS:0x056b` is GAME.OVR
`0x8fac`, the Pascal string `SPRIT`, and `CS:0x0571` is `0x8fb2`, the Pascal
string `PIC`. Both local stack destinations prepared at `0x8ffa..0x9004` and
`0x90a6..0x90b0` remain on the caller stack because resident `A46:0x0ac4`
assignment ends in `RETF 4` after consuming only its source pointer. The later
ID, mode and table-pointer pushes then place the retained far pointer exactly
at `3ca69 [BP+0x0e]`.

Accordingly, the first branch conditionally requests
`SPRIT<DS:0x5782>.DAX`, with ID from `SETUP_MONSTER` operand 0 and mode 1; the
second branch conditionally requests `PIC<DS:0x5782>.DAX`, with ID from operand
2 and mode 0. The loader at resident `069c:088e` scans nine-byte DAX index rows
by the one-byte ID and uses the first matching row. This proves the CoK source
families and operand-to-ID fields, but not the value/provenance of the bank
suffix `DS:0x5782` for each ECL site. Source bytes show new-game initializers
at `0x10627` and `0x10a5f` set it to 1; code at `0x1f746..0x1f752` restores
it from the current-area record at `+0x624`, and `0x1fc25..0x1fc33` stores it
back there. This is a stateful bank selector, so do not infer it from the ECL
archive filename. Duplicate DAX IDs therefore remain first-match-sensitive.

The approach display index is `extent+1`; the table consumer uses indices
1–3 to select a sequential eight-byte resource record and renders its buffer.
The selected table may have come from the SPRIT or PIC branch depending on
state, so the selected record is not yet joined to a particular canonical
source frame. Its temporal meaning (animation versus distance/pose), successful
table contents for a natural approach, and runtime observation also remain
open. Exact source identities and spans: GAME.OVR SHA-256
`c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529`, START.EXE
SHA-256 `e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956`,
complete unpacked resident image SHA-256
`1bd9c6700b6ce55445649cf25a1991010896d1cfb044f2fb57c9cc90faf6a7e5`; resident
loader `0x724e..0x73fe` SHA-256
`04f9225c5a45a50fc014b87a437503572fd7d6c07a308a520e17a0041329a16a`; and
assignment helper `0xaf24..0xaf3e` SHA-256
`4681f1935f55d71f05afab0b13fff0505aa17e9a04fb372ff559ef28ed88058f`. The
reconstruction procedure is in `tools/exepack_unpack.py` and overlay mapping
in `tools/disasm_cok.py`; this is static evidence, not runtime observation.

## Task B: workspace pointer and field producers

The main START initialization calls the resident allocator `A46:0x023F` with
size `0x800` twice. At `GAME.OVR:0x101EB..0x101F3`, the first returned far
pointer (`DX:AX`) is stored at `DS:4B28/4B2A`; the second call at
`0x101FB..0x10203` stores its pointer at `DS:4B2C/4B2E`. This gives the two
workspace bases and their allocated extent. The initialization path clears
each `0x800`-byte workspace through `A46:0x1661`; the duplicate reset path at
`0x108DB..0x10971` clears both again.

Initial field writers are now located. `GAME.OVR:0x10495` and
`0x10952` write `1` to `ES:[DI+0x1CC]` after loading the `DS:4B28` far pointer;
`GAME.OVR:0xF1C3` reads that word to select `0xEA67` when nonzero or `0xF162`
when zero. `GAME.OVR:0x19B9A` updates `DS:4B28` fields `+0x186/+0x188`: it
copies their old values to `+0x1E0/+0x1E2`, adds table entries selected by
`DS:6D87`, clamps the results to `0..0x25` and `0..0x0E`, then stores the
bounded values back. `0xF1C3` reads these fields for map setup.

For the second workspace, `GAME.OVR:0x17C7E..0x17CE5` prompts through
`FD:0x39`; when the returned character is `Y` (`AL=0x59`), it writes `1` to
`ES:[DI+0x666]` from the `DS:4B2C` base. `GAME.OVR:0xFDF2` clears that word at
`0xFEBD..0xFEC3` before invoking map and context setup. The other fields read
by the `0xAEC9` route, their source tables, and placement selectors remain to
be traced. This begins Task B; it does not supply missing values to the
synthetic callback fixture.

### Guarded startup workspace snapshot

The guarded Unicorn replay now saves both blocks at the unsupported search
boundary, before returning a DOS `AH=4Eh` result. At instruction 77,494,249,
`DS=0x2491`; the far pointers load as `ES:DI=89E4:30FC` from `DS:4B28` and
`C749:FE46` from `DS:4B2C`. Their physical blocks (`0x8CF3C` and `0xD72D6`)
are each `0x800` bytes and all zero. These are bytes sampled through pointers
whose relationship to the initialized globals under `DS=0x1BC6` is unvalidated;
this does not prove that the FDF2 workspaces are empty.

An instruction-address probe matched descriptor 11's GAME.OVR bytes and found
the initializer at `0x10474` executing at instruction 244,986, followed by its
`+0x1CC=1` store at `0x10495` at instruction 247,052. At that store,
`DS=0x1BC6` and `ES:DI=5091:0000`, so the workspace base is physical
`0x50910` and the `+0x1CC` field write targets `0x50ADC`.
Neither reset entry `0x108DB` nor its field store `0x10952` was observed in
this replay. At the unsupported search boundary, however, `DS=0x2491` and
`DS:4B28` points to physical `0x8CF3C` (with `DS:4B2C` at `0xD72D6`). The
different `DS` and destination mean this replay does not prove that the early
initialized block is the later captured block, nor explain the final zeroed
workspaces. It still stops before `0xAEC9`. The extra captures are disposable
files `build/cok-composed-dos-boundary/unsupported-dos-search-workspace-*.bin`
and `workspace-init-visits.jsonl`.

### Map offset selector tables — 2026-09-27

`GAME.OVR:0x19B9A..0x19C6E` saves the incoming map offsets from
`DS:4B28+0x186/+0x188` to `+0x1E0/+0x1E2`, indexes two signed-byte tables at
`DS:0x1ED6` and `DS:0x1EDF` with `DS:0x6D87`, adds those deltas to the incoming
offsets, clamps the first result to `0..0x25` and the second to `0..0x0E`, then
writes the results back. The bytes are in the START load image at offsets
`0xDB36` and `0xDB3F`: in the composed trace's descriptor-11 initializer,
`DS=0x1BC6` with load segment `0x1000`, so `DS:0x1ED6` and `DS:0x1EDF` map to
those image offsets. The arrays (indices `0..8`) are:

| Index | `+0x186` delta | `+0x188` delta |
| ---: | ---: | ---: |
| 0 | 0 | -1 |
| 1 | 1 | -1 |
| 2 | 1 | 0 |
| 3 | 1 | 1 |
| 4 | 0 | 1 |
| 5 | -1 | 1 |
| 6 | -1 | 0 |
| 7 | -1 | -1 |
| 8 | 0 | 0 |

The observed initializers set `DS:0x6D87` to 0 at `GAME.OVR:0x1058A` or 2
at `0x109B5`. The `0xE5` handler branch at `0x998B..0x99CF` maps its operand
modulo four to even values `0,2,4,6`. The map-choice branches at
`0x19EC0..0x19F64` update it for `P`, `K`, and `M` by `+4`, `+6`, and `+2`
modulo eight, preserving an even selector. For the resulting selectors, the
delta pairs are `0 -> (0,-1)`, `2 -> (1,0)`, `4 -> (0,1)`, and `6 -> (-1,0)`.

The direct `LES DI,[0x4B28]` store census found the writes to `+0x186/+0x188`
at `0x19C44/0x19C51` in this adjustment routine; it did not locate an
independent producer for their pre-adjustment values. The static table mapping
is tied to the observed load/DS relationship, but neither these selector values
nor the resulting offsets are captured on a path to `0xAEC9`; that caller's
runtime `DS`, incoming workspace contents, and placement selectors remain open.

The `DS:4B2C+0x582` placement extent also has a bounded producer path.
`GAME.OVR:0x0D35..0x0DCB` obtains a cap in `+0x580` through helper
`0x4E:0x25`, asks `0x4E:0x3E` to test candidate cells using `DS:0x6D85/0x6D86`
and `DS:0x6D87`, stores its result to `+0x582`, and limits that result to the
`+0x580` cap before passing the values to `0x4E:0x48`. The same
`+0x580/+0x582` sequence appears at `0x2D80..0x2E84`. Selector resolution maps
`0x4E:0x25`, `0x4E:0x3E`, and `0x4E:0x48` to descriptor 7 procedures at
`GAME.OVR:0x8BA9`, `0x8EEA`, and `0x8FB6`. In `0x8EEA`, a zero `+0x1CC`
configuration returns fixed extent 2 and writes 2 to `+0x582`; the other
branch tests at most two candidates through `0x10B:0x2A`, shifts the candidate
coordinates according to selector values `0,2,4,6`, and returns the tested
count. `GAME.OVR:0xF991` consumes `+0x582` in its map-placement setup.

This bounds the `+0x582` producer and its selector input, but not the source
invocation and operands before `0xAEC9`, dereferenced values selected by those
operands, the identity/geometry meaning of the candidate cells, or which setup
path and values reach FDF2. No placement outputs have been runtime captured at
`0xAEC9`.

### Task B bounded completion — 2026-09-27

This consumer audit closes Task B at its bounded-gap acceptance. It separates
source-addressed transformations from data producers that remain unknown; it
does not claim a complete retail setup trace or use the synthetic callback
fixture as retail provenance.

| FDF2 input/state | Retail consumer or writer chain established | Remaining producer/source gap |
| --- | --- | --- |
| `DS:4B28/4B2A`, `DS:4B2C/4B2E` | GAME.OVR allocation path requests two `0x800`-byte blocks and stores returned far pointers at `0x101EB..0x10203`; startup/reset clear both. | The early `DS=0x1BC6` allocation/initializer view and later `DS=0x2491` search-time pointer samples are different addresses. Their relationship and actual FDF2 pointer values are unknown; the search-time zero blocks are not proven to be the FDF2 workspaces. |
| `4B28+0x1CC` | `GAME.OVR:0x10495` and reset path `0x10952` set it to 1; `0xF1C3` branches to initializer `0xEA67` when nonzero and `0xF162` when zero. | The observed `0x10495` write uses workspace base `0x50910` and targets `0x50ADC`; evidence does not join that instance to the later FDF2 pointer. |
| `4B28+0x186/+0x188`, selector `DS:0x6D87` | `GAME.OVR:0x19B9A` copies the incoming pair, applies signed-byte deltas from `DS:0x1ED6/0x1EDF`, clamps to `0..0x25` / `0..0x0E`, and writes the result. Even selector values `0,2,4,6` map to `(0,-1),(1,0),(0,1),(-1,0)` in the traced path. | The pre-adjustment pair and its producer are not located. The table mapping is known, but its runtime segment/data identity at FDF2 is not captured; even selectors are not proven for every possible writer/invocation. |
| `4B2C+0x666` | `GAME.OVR:0x17C7E..0x17CE5` writes 1 only on returned `Y`; `0xFDF2:0xFEBD..0xFEC3` clears it. | The branch is established, but prompt/session state for this setup invocation is not captured. |
| `4B2C+0x580/+0x582` | `GAME.OVR:0x0D35..0x0DCB` and `0x2D80..0x2E84` obtain cap `+0x580` from `0x4E:0x25` operand 2, derive candidate count `+0x582` through `0x4E:0x3E`, then clamp it to the cap. `0x4E:0x3E` resolves to `0x8EEA`: zero `+1CC` returns fixed extent 2; otherwise it checks at most two selector-shifted cells using `0x10B:0x2A`. `0xF991` consumes `+0x582`. | `0x0D35` calls operand decoder `0x4E:0x2A`, then `0x8BA9` for operands 1, 2, and 3. `0x8A73` fills operand caches `DS:0x736D/0x73ED/0x73AD` from the script buffer selected by `DS:0x4B34` and cursor `DS:0x4B43`. The invocation and operands immediately preceding `0xAEC9` are unknown. For dereferenced operands, the selected state is not traced. |
| `0x8BA9` operand interpretation | It dispatches on cached type: immediate-byte forms return the cached byte; immediate-word forms combine cached low/high bytes through `0x910D`; address forms call `0x9A0B`. That helper classifies addresses through `0x9159` and reads through pointer roots `DS:0x4B28/4B2C/4B30/4B34`, with selected-member special cases via `0x921A`. | The exact call-site type/value, pointer target, and selected data source on the route to `0xAEC9` remain unproven. Unsupported operand kinds can leave the result local unassigned. |
| `4B2C+0x67C`, `4B2C+0x58C` | `GAME.OVR:0xF273` compares its one-based party traversal count to `+0x67C` and marks an allocated per-member context when over capacity. At `0xF367..0xF376`, it conditionally adds `+0x80` and `+0x58C` to member `+0xE7` after checking member `+0x18A`, context `+0x13`, and masked member `+0xE7`. | Neither field's producer/value at FDF2 is established. The effect of the conditional `+0x58C` path is absent from the synthetic input provenance. |
| `F273` direction and linked-party inputs | `0xF273` walks the chain at `DS:0x609A/0x609C`, calls `0xE6:0x43` before allocation, reads selector-indexed bytes from `DS:0x3DA`, and reads member `+0x18A/+0xE7`. | Party-chain producer, helper `0xE6:0x43` inputs, `DS:0x3DA` table identity, and final list/order are not captured at FDF2. |
| `F991` membership and placement inputs | It calls `0xE6:0xB6`, rebuilds per-index values from body `+0x18A/+0xCF`, invokes the `DS:0x63F3` occupancy pass at `0x3F685`, then calls `0xF513`. Placement reads `DS:0x883E`, context `+0x13`, and other body fields; failed placement can clear an indexed member and call removal at `0xFD90`. | The side-count producer `0xE6:0xB6`, formation/footprint tables `DS:0x03CA/03DA/03DE/03E6/03BA/03EE/03EF/1EE4`, `DS:0x883E` setup, and membership decisions are not fully source-traced. The selector delta arrays at `DS:0x1ED6/0x1EDF` are only part of placement state. |
| Map allocation `DS:0x6A2E/0x6A30` and position grid `DS:0x623F..0x6242` | `0xF1C3` allocates `0x4E9` bytes, writes header bytes `0/1/0`, then dispatches `0xF162/0xEA67`. The default `0xF162` path fills `0x4E2` cells with `0x17` and calls `0xEB9A/0xECA5/0xEFE4`; `0xF991` and `0xF513/0xF3C6` generate member coordinates while checking footprints. | Resource/config inputs to `0xEA67` and `0xF162 -> 0xEB9A/0xECA5/0xEFE4`, including RNG, are not completely traced. The actual selected map, candidate source tables, and final positions at FDF2 are unobserved; the oracle installs a flat map and hand-authored positions. |
| `DS:0x6DA2` graphics-resource table and production `SS` | FDF2 passes `DS:0x6DA2` to `0x3CEBC` for cleanup. Task 128 maps `0x3CA69`'s indirect writer, one caller at `0x1D479`, and the resident allocator/free helpers. | The successful load that last populated the same DS/allocation before a valid FDF2 invocation, runtime table contents, and production `SS` remain open for Task 63's runtime join. |

Task B is complete as a bounded consumer/producer audit. Known workspace and
placement dependencies are mapped; invocation-specific operands, resource
state, party provenance, and production segment identity remain explicit gaps.
No values are authorized for fixture seeding, and no runtime setup or
effect-7 producer is established. No DOSBox or GUI was launched.

### Task C bounded completion — startup search input — 2026-09-27

The guarded malformed FindFirst request is reached at composed-startup
instruction 77,494,249, `CS:IP=19C4:0143`, with `AH=4E`,
`DS:DX=2491:3446`, and `SS=2491`. Earlier requests in this replay had valid
search names and successful matches, so this is not the first or an
unsupported `AH=4E` call.
The FindFirst wrapper is START image `0x9D52` (runtime `19C4:0112`): it copies
the caller's Pascal string into a 0x50-byte local, appends NUL, sets the DTA,
then issues `INT 21h/AH=4Eh` with `DS=SS` and `DX=BP-0x50`. The caller chain
through START image `0x6E81` and `0x6C67` clears its DTA local and constructs
the search name from the parsed directory, base name, and extension.

At the final `0x6C67` frame (`SS:BP=2491:3874`), the directory local at
`BP-0x138` is Pascal `C:\\`, the base-name local at `BP-0x141` is eight bytes
`76 FC FF 76 FA B0 00 50`, and the extension local at `BP-0x146` is `.dax`.
The combined Pascal pattern has length 15 and contains an embedded NUL in its
base name; the wrapper consequently presents DOS with the C-string prefix
`C:\\v` followed by invalid instruction-like bytes. The base-name copy at
resident `1A46:0AD7` reads from `DS:SI=2491:3AA3`; the bounded capture records
the source bytes beginning `76 FC FF 76 FA B0 00 50 32` and the embedded NUL.
Thus the wrapper is not the source of the malformed name; no successful
FindFirst result for this malformed request is supported by the trace.

This is a bounded result for the current synthetic replay, not valid retail
filename provenance: the source is another stack-resident buffer, and the
replay does not establish its intended input. The generic MIDI setup-key
capture separately established that helper `1A46:0B76` overwrites a live
return frame with prompt bytes (`cok-item-removal-native-plan.md`, “Startup-
trace boundary correction”). Until a source-faithful input and its DOS search
result are established, do not resume this path with a guessed `AH=4Eh`
response or claim it reaches `GAME.OVR:0xAEC9`. Task C is closed only at this
bounded search-buffer/loader-dependency level; production `SS`, overlay setup,
and the effect-7 producer remain open. No DOSBox or GUI was launched.

### Task 63 progress — retail CoK map-position source — 2026-09-27

The retail `Champions of Krynn/ECL1.DAX` contains block 33 (TOC id `0x21`,
compressed extent `0x1276`, raw extent `0x1212`, data-section-relative offset
`0x4D93`). Decoding that entry reproduces `daxdump_extracted/ECL1_033.bin`
byte-for-byte. The accompanying ECL extraction identifies the block's
conditional branch at virtual `0x804E..0x8058`: when `LastEclBlockId == 34`,
execution falls through to `SAVE mapPosX=9` at `0x8059`,
`SAVE mapPosY=0` at `0x805F`, and `SAVE mapDirection=2` at `0x8065`; otherwise
it jumps to `0x8070`. The corresponding raw bytes at extracted-block offsets
`0x5B..0x6C` are `09 00 09 01 4B C0 09 00 00 01 4C C0 09 00 02 01 4D C0`.
The raw offset is reported separately from the ECL virtual address because the
block header/table means they are not interchangeable offsets.

In GAME.OVR, the host-variable setter's virtual address range starts at
`0xBF68`. At `0x995A..0x9966` it subtracts that base; normalized offsets
`0xE3` and `0xE4` therefore identify ECL host addresses `0xC04B` and `0xC04C`.
The `0xE3` case at `0x9970..0x9973` writes its value argument (`[BP+6]`) to
`DS:0x6D85`; the `0xE4` case at `0x9979..0x9981` writes the same argument
position to `DS:0x6D86`. This gives a retail-source-to-global mapping for the
conditional `(9,0)` script input, subject to the ECL branch being taken.

The downstream code is statically connected by address, but not yet joined to
that same retail invocation. `GAME.OVR:0xFDF2` calls the map/context setup
chain, including `0xF1C3`; `0xF1C3` selects `0xEA67` when workspace
`+0x1CC` is nonzero. In `0xEA67:0xEA89..0xEAAC`, candidate X is formed from
`DS:0x6D85` plus an enumerated offset, candidate Y from `DS:0x6D86` plus
another offset, and both are passed to `0xE522`. The placement path through
`0xF991` also obtains candidate extent from `0x8EEA`, where the nonzero
workspace-configuration branch tests at most two positions using
`DS:0x6D85/0x6D86` and selector `DS:0x6D87`; `0xF991` consumes the resulting
`DS:4B2C+0x582` extent. These are source-level consumer relationships, not
proof that block 33's `(9,0)` reached `FDF2`, a particular `EA67` call, the
placement candidate set, or the effect-7 callback argument/resulting write.

Task 63 remains active at this boundary. The conditional ECL source and setter
are retail-byte-backed; whether this branch executes in the composed startup,
the DAX-to-VM call/dispatch instance, runtime `DS` identity at the setter and
FDF2, the map/config producer values, and the final callback input are not
established. The guarded composed startup stops before responding to a later
malformed FindFirst request; earlier file searches succeeded, but this does
not prove the `LastEclBlockId==34` branch or reach the target FDF2 path. Do not
seed a fixture from `(9,0)` or treat the map-position global as a callback
result. No DOSBox, GUI, or runtime trace was used for this source mapping.

### Task 63 continuation — predecessor ECL transition — 2026-09-27

The retail ECL source now supplies a conditional predecessor edge into the
block-33 coordinate branch; this is static bytecode control flow, not proof of
a composed execution:

| Source | Raw source bytes / interpretation |
| --- | --- |
| `ECL1.DAX#34`, virtual `0x8042` (raw offset `0x44`) | `09 00 22 01 F2 4B` — `SAVE #34, [0x4BF2]` (`LastEclBlockId=34`) |
| `ECL1.DAX#34`, virtual `0x8094..0x80B5` (raw `0x96..0xB7`) | `SearchLocation` derives `mapWallRoof & 0x3F`; at `0x80AE` it compares that value with 34, and the `IF_EQ` at `0x80B4` guards `NEWECL #33` at `0x80B5` |
| `ECL1.DAX#33`, virtual `0x804E..0x806E` (raw `0x50..0x70`) | `03 01 F2 4B 00 22 17 01 01 70 80 09 00 09 01 4B C0 09 00 00 01 4C C0 09 00 02 01 4D C0 2D 01` — compare `LastEclBlockId==34`; `IF_NE` skips the fallback `GOTO 0x8070`, else execute `SAVE mapPosX=9`, `mapPosY=0`, `mapDirection=2`, then `CALL reload mapWallRoof` |

The extracted block listings (`daxdump_extracted/ECL1_034.txt` and
`ECL1_033.txt`) identify the corresponding operands: block 34 tests
`tried_to_exit_map`, masks the map-wall/roof selector, then conditionally
chains to block 33 on selector 34; block 33 checks the preserved
`LastEclBlockId=34` before writing the three inputs. The retail host setter
mapping already recorded above connects the first two saves to `DS:6D85/6D86`;
the direction value is likewise an ECL host save, but its production `DS`
identity on this route is not captured.

**Entrypoint/handler caveat (Astra review, 2026-09-27):** `ECL1#33`'s own
initial entrypoint at `0x8014` first compares `LastEclBlockId` with 33 and
exits when equal. The `(9,0,2)` branch is later, at `0x804E`, and requires
`LastEclBlockId==34`. Task 67 mapped CoK's handler preserving departing ID 34;
Task 68 then established that the restart call passes ECL1#33's `0x8014` entry
pointer. Thus the early equality-to-33 guard does not exit for the preserved
value 34. This static control-flow relationship still does not prove the
branch conditions or actual execution reaches `0x804E`; Task 69 targets the
condition inputs. Keep the `(9,0)` producer conditional.

This upgrades the earlier gap: the source-backed ECL invocation edge is
conditional and mapped (`ECL1#34 -> ECL1#33`), rather than wholly unknown.
Still open are the actual condition values and execution in the full game,
the precise runtime `game_area`/`DS` at both blocks, any composed chain from
block 33 through `FDF2/F1C3`, and the final effect-7 callback inputs/results.
Keep `(9,0)` as conditional source data, not a fixture or callback output.

### Task 81 result — ECL1#33 map-refresh CALL operand — 2026-09-27

The specific `CALL <reload mapWallRoof>` at ECL1#33 virtual `0x806B` has raw
bytes `2D 01 10 2E` in the decompressed member at offsets `0x6D..0x70`;
the next instruction is `EXIT`. In the retail interpreter, `0x4449` fetches
the opcode and calls dispatcher `0x41D9`; opcode `0x2D` dispatches to handler
`0x3C07`. That handler asks `0x4E:0x2A` (resolved to `0x8A73`) to decode one
operand. For the byte sequence above, the parser records type `1`, low byte
`0x10` at `DS:73EE`, and high byte `0x2E` at `DS:73AE`. `0x3C07` passes those
cached bytes to `0x4E:0x4D` (resolved to `0x910D`), which composes `AX=0x2E10`;
subtracting `0x7FFF` yields routine ID `0xAE11`, matching the handler's first
dispatch arm at `0x3C31`.

That `0xAE11` arm reads `DS:6D85/6D86`, calls `0x10B:0x34`, and stores its
returned map descriptor at `DS:6D89`. If any of five pending-state bytes is
nonzero, it clears two bytes, calls `0x102:0x25`, then calls `0xE6:0xDE`; that
stub resolves to `0x3931B`, whose bounded procedure extent ends at `0x395B5`.
The ECL block exits at `0x806F` after the map-refresh CALL. The `0xAE11` arm
does not call the separate `GAME.OVR:0xAEC9` function (which calls FDF2 at
`0xAEE1`) directly. The `0x3931B..0x395B4` procedure also contains no direct
far call through `0x5E:0x25`. This closes the exact ECL CALL operand and its
map-descriptor refresh, not a route from that ECL return to `0xAEC9/FDF2`,
`0xF1C3`, a map allocation, or an effect-7 callback. Task 81 closes at that
bounded source boundary; Task 82 tracks the post-return caller edge.

### Task 82 result — ECL exit caller and secondary entries — 2026-09-27

After `0x806F` EXIT, opcode handler `0x09BC` sets stop flag `DS:43B8`; the
interpreter at `0x4449` returns to its caller. In the `NEWECL` restart path,
`0x4594` calls `0x44B3` when `DS:43B9` is set. `0x44B3` clears that chain flag,
re-enters the fifth ECL header pointer `[4B41]`, then—if no further chain was
requested—runs secondary pointers `[4B39]` and `[4B3B]` before its map-render
call `0xE6:0x2A` and return. For ECL1#33, the decoded header names these first
two secondary entries `vm_run_1=0x8147` and `SearchLocation=0x81DC`; the fifth
pointer is `ecl_initial_entry=0x8014`. The direct caller/helper bodies audited
here (`0x44B3`, `0x4594`, `0x3C87B..0x3C971`, and `0x36D60..0x36F25`) contain
no direct far call to `0x58:0x25` (`0xAEC9`) or `0x5E:0x25` (`0xFDF2`). This
direct-call result does not rule out a script-dispatched or nested route.

The script entries expose that remaining route. At `0x8147`, `vm_run_1`
branches on `area2.tried_to_exit_map` and may request ECL34 or ECL32 via
`NEWECL`; values and branch execution are not captured. At `0x81DC`,
`SearchLocation` stores `area2.word_58C=80`, tests `area1.word_274`, then
dispatches on `mapWallRoof & 0x3F`. Conditional cases in that entry reach
encounter setup followed by `GOTO 0x8223` at `0x8CE1` or `0x8EE7`; `0x8223`
is ECL opcode `0x24 COMBAT`. This makes the COMBAT opcode dispatcher the next exact edge
needed to determine whether this conditional script path reaches AEC9/FDF2.
Task 82 closes at that dispatcher boundary: it establishes the post-return
caller and a conditional ECL route to COMBAT, but not the descriptor values,
selected branch, COMBAT handler, AEC9/FDF2 call, map allocation, or callback
input/result. No DOSBox or GUI was used. Astra reviewed the boundary and
recommended the COMBAT handler as the next bounded trace.

### Task 83 result — COMBAT dispatcher to conditional FDF2 setup — 2026-09-27

The CoK interpreter dispatcher at `0x41D9` compares opcode AL with `0x24` at
`0x4325` and calls handler `0x2288` at `0x432A`. The ECL1#33 SearchLocation
entry has a conditional route through encounter setup to `0x8223` COMBAT
(including `GOTO 0x8223` at `0x8CE1`/`0x8EE7`). The handler checks
`DS:8851` at `0x22A6`; if zero, it checks `DS:883E` at `0x22B0`. Either
nonzero value branches to `0x2460`, which reaches `0x24CA` and far-calls
`0x58:0x25` (`GAME.OVR:0xAEC9`). AEC9 sets up its call frame and calls
`0x5E:0x25` (`GAME.OVR:0xFDF2`) at `0xAEE1`. Thus there is a source-backed,
conditional route from SearchLocation's COMBAT opcode through FDF2; it is not
proof that ECL1#33 selects that script branch, that either gate byte is
nonzero on a retail invocation, or that any specific `DS`/workspace/map
allocation or callback result is present. When both gate bytes are zero,
`0x2288` follows separate context branches; those do not establish a call to
AEC9 in this slice. Task 83 closes at the two-byte gate before the FDF2 route.
Task 84 follows the writers and invocation-specific provenance of `DS:8851`
and `DS:883E` on the ECL1#33/COMBAT path. Static analysis only; no DOSBox or
GUI.

### Task 84 result — COMBAT gate-byte writers — 2026-09-27

Dispatcher `0x41D9` maps ECL opcode `0x0B LOAD MONSTER` to handler `0x0DD1`.
That handler writes `DS:8851=1` at `0x122C` on its completed load path; its
capacity/loop guards can return before that write, so the store is conditional
on reaching the handler path. ECL1#33's `SearchLocation` contains monster
setup followed by `GOTO 0x8223 COMBAT` at `0x8CE1` (and another setup-to-COMBAT
case at `0x8EE7`). Therefore a selected case that completes `LOAD MONSTER`
sets one of COMBAT handler `0x2288`'s two gates before the COMBAT opcode. This
is a conditional script/handler chain, not evidence that a particular
`mapWallRoof` branch was selected in a retail invocation.

The bounded absolute-address reference audit finds direct zero stores to
`DS:883E` at COMBAT cleanup `0x2554` and initializers `0x1064F`/`0x10A85`, but
no direct nonzero store. `0x883E` is also read by `0x2288` and other routines;
this audit does not exclude alias/computed writes. Because `DS:8851=1` alone
takes the AEC9/FDF2 branch, the `0x883E` producer is not needed to establish
the conditional route. Task 84 closes at the source-level `LOAD MONSTER`
gate. Task 85 now targets the remaining branch-selection input:
`mapWallRoof & 0x3F` consumed by ECL1#33 `SearchLocation` at `0x81ED..0x81F6`.
Keep selected encounter and map descriptor values unassigned absent a proved
producer/invocation. Static only; no DOSBox or GUI.

### Task 85 result — ECL1#33 SearchLocation descriptor selector — 2026-09-27

The conditional initial-entry path in ECL1#33 loads GEO block 32 at `0x802E`,
saves map position `(9,0)` at `0x8059..0x805F`, calls the map-descriptor
refresh at `0x806B`, and exits at `0x806F`. The source-mapped `0x10B:0x34`
resolver reads the plane-2 byte from `DS:[6D7C + 0x200 + 16*y + x]` after
clamping coordinates to `0..15`. On the conditional assumption that the
original `Load3DMap` path populated `DS:6D7C` from retail `GEO1.DAX#32`, its
cell `(9,0)` byte is `0x88`; `SearchLocation`'s `AND #63` therefore yields
selector 8. This is a source-composed byte calculation, not a capture of the
runtime `DS` or map allocation.

At `0x81E2`, `SearchLocation` compares `area1.word_274` with zero, then executes
`IF_NE` at `0x81E8` before `GOTO 0x8242`. The retail IF handler at `0x1590`
executes the following GOTO when the compare is not equal and skips it when
equal. Therefore nonzero `word_274` jumps to `0x8242`; zero continues to the
descriptor `ON GOTO`, where selector 8 chooses `0x8E52` (stairs text, then
refresh, no COMBAT on that selected arm). This corrects the earlier inverted
branch reading. A focusless Unicorn check of the original COMPARE/IF/GOTO
handlers confirms zero leaves the cursor at `0x81ED`, while nonzero executes
the GOTO and leaves it at `0x8242`. This still does not resolve the live
`word_274` value. Task 86 follows the nonzero arm and its encounter gates.
No DOSBox or GUI.

### Task 86 result — SearchLocation word_274 and random encounter gates — 2026-09-27

The ECL1#33 operand at `0x81E2` encodes field address `0x4C3A`, which the
retail ECL reader maps to `area1_ptr + 0x274`: class-0 ECL addresses are read
from `[area1_ptr + 0x6A00 + 2*address]`, and `0x6A00 + 2*0x4C3A` wraps to
`0x0274`. A corpus scan of decoded CoK ECL1/ECL2/ECL3 blocks finds 18 aligned
uses of `area1.word_274`; every one is a `COMPARE` in ECL1#16/#17/#32/#33/#34,
ECL2#48/#49/#50, or ECL3#80/#81/#82/#99. No ECL `SAVE` or arithmetic writer
was found. The producer/value is therefore still unresolved outside the
decoded script-use census; this does not rule out native writes, aliases, or
area-state load/copy initialization. Task 87 follows that native lifecycle.

**Branch correction:** the `0x8242` path is the nonzero `word_274` arm, not the
zero arm. `IF_NE` executes `GOTO 0x8242` when the operand differs from zero;
when zero it skips that GOTO and enters the selector table. The original
handlers were run in a two-case focusless Unicorn fixture: `word_274=0` left
the cursor at `0x81ED`; `word_274=1` followed the GOTO to `0x8242`. This
corrects Task 85's earlier branch direction.

On the nonzero arm, the pre-roll source gates are:

1. `area1.word_21C` must be zero; otherwise the script decrements it and exits.
2. `area1.word_212` must not be `255`; `255` exits.
3. `area1.word_2C2` must be zero; nonzero exits.
4. ECL opcode `RANDOM` at `0x8267` has immediate bound byte 99. CoK's native
   opcode-08 handler at `GAME.OVR:0x0BA9` increments any bound below `0xFF`
   before forwarding it to the random helper, so this call forwards 100. This
   establishes the adjusted bound, but not the helper's output distribution,
   RNG state, or cadence.
5. The raw operands at `0x826D` are `[0x7F79]` first and `[0x4C04]`
   second. The class-1 address `[0x7F79]` maps to `area2_ptr+0x6F2` (the
   RANDOM destination); `[0x4C04]` maps to `area1_ptr+0x208`. The compare
   handler passes operand 1 as unsigned left and operand 2 as right, so the
   condition is `random_result > area1.word_208`. `IF >` true executes the
   following GOTO to screen refresh at `0x8236`; false skips it and continues
   to encounter setup at `0x828A`. This corrects the previous operand-order
   interpretation. No probability distribution is asserted.

If the nonzero arm passes these gates and the roll threshold, the script reads monster-table entries indexed by
`area1.word_214`, sets up monsters, and executes `LOAD MONSTER` at `0x8325`
(plus conditional additional loads) before `COMBAT` at `0x8359`. The mapped
LOAD MONSTER handler writes `DS:8851=1` on its completed load path; the COMBAT
handler then has the already-traced conditional route through AEC9 to FDF2.
Capacity/loop guards, branch inputs, live `DS`, roster index, allocation, RNG
result, and callback values remain invocation-dependent and uncaptured. This
closes the source-level zero-arm and encounter conditions, not an executed
retail encounter. Static analysis only; no DOSBox or GUI.

### Task 87 progress — area1 allocation boundary — 2026-09-27

The direct stores to global far-pointer slot `DS:0x4B28` are narrowed to one
site in the current `GAME.OVR` image: `0x101EB` requests `0x0800` bytes from
`0xA46:0x23F`, then `0x101F0..0x101F3` stores returned `DX:AX` into
`DS:0x4B28/0x4B2A`. The adjacent area2 allocation requests another `0x0800`
bytes at `0x101F7..0x10203`; subsequent fixed-size allocations are separate
globals. This establishes an allocated area1 region and its size request, but
not allocator zeroing, save-file population, area identity, or the value of
member `+0x274`. The next trace follows the allocation helper and its caller's
initialization/copy calls. Static analysis only; no DOSBox or GUI.

### Task 87 result — bounded area1+0x274 lifecycle — 2026-09-27

The `area1_ptr` allocation at `GAME.OVR:0x101EB..0x101F3` requests `0x800`
bytes and stores the far pointer at `DS:4B28/4B2A`. The startup initializer
clears that full workspace through `A46:0x1661`; the duplicate reset path at
`0x108DB..0x10971` clears both `0x800`-byte workspaces again. Therefore, after
either clear, `area1_ptr+0x274` is zero unless a later operation writes or
restores that member. This is a source-backed default for a cleared workspace,
not a value claim for ECL1#33's eventual invocation.

The direct ECL corpus census remains 18 aligned COMPARE uses and no SAVE or
arithmetic writes. The raw native immediate-reference scan for `0x0274` has
five byte matches, which decode as branch/immediate constants rather than
direct accesses to an `area1_ptr+0x274` member. This bounded evidence identifies
the workspace clear as a producer of zero and finds no later direct script or
native member writer. Computed aliases, bulk copies/restores, and runtime
pointer identity are not ruled out; the restored or live value at the SearchLocation
callsite remains unknown. Task 87 closes at this bounded lifecycle census.

### Task 88 result — CoK opcode-08 random result and RNG source — 2026-09-27

The bounded focusless Unicorn fixture executes the held CoK `GAME.OVR` opcode
handler at file offset `0x0BA9` with bytecode `RANDOM #99 -> [0x9000]`,
synthetic `DS=0x5000`, `SS=0x6000`, and seeded state `DS:0x43AE=0x00001234`.
The unchanged original path reaches resident `B5D9` and `B628`, then returns
through the ECL handler; it produces byte 7 and state `0x3B032B05`. These are
fixture values, not a campaign capture. This closes the earlier call-boundary
gap without using DOSBox or a GUI.

Resident bytes disassembled from the held unpacked START image explain the
edge: `B5D9` calls `B628`, receives the updated 32-bit state in `DX:AX`, loads
the byte/word bound from the caller stack, divides the high word by that bound,
and returns the remainder in `AX` (zero bound returns zero after advancing).
`B628` reads/writes the 32-bit state at `DS:0x43AE` and `DS:0x43B0` and applies
`state = state*0x08088405 + 1 (mod 2^32)`. For this ECL opcode, handler `0x0BA9`
increments maximum 99 to bound 100 before calling the resident helper;
therefore the result interval is **0..99**, from `(updated_state >> 16) % 100`.
No probability distribution quality or production cadence is claimed.

Task 89 follows `area1.word_208`, the threshold compared against this random
byte at ECL1#33 `0x826D`, to identify its source and any reset/update semantics.
Keep the source of the threshold separate from RNG state and from observed
encounter outcomes. Static/focusless only; no DOSBox or GUI.

### Task 89 result — ECL1#33 encounter-threshold writers — 2026-09-27

The ECL operand address for `area1.word_208` is `0x4C04`, resolving through
the same class-0 reader/writer mapping to `area1_ptr+0x208`. In ECL1#33's
ordinary initial entry, the guard at `0x8014..0x801B` exits only when
`LastEclBlockId==33`; otherwise `SAVE #10 -> word_208` at `0x801C` sets the
threshold before `SearchLocation`. The previously traced `NEWECL #33` handoff
from ECL1#34 saves departing ID 34, so that specific source route passes this
guard and executes the threshold-10 write. A later ECL1#33 route at descriptor
7 (`0x87C5`) offers `THREATEN HIM` / `LET HIM GO`; choosing the latter reaches
`SAVE #20 -> word_208` at `0x88DF`, then refreshes and exits. Thus the local
threshold is 10 after the fresh #34-to-#33 entry and can become 20 on that
choice; later saved/indirect updates or runtime invocation are not claimed.

These thresholds apply only after the nonzero `word_274` gate has routed into
the `0x8242` encounter path. With Task 88's source-backed 0..99 result
interval and the unsigned comparison at `0x826D`, the local cut points are
explicit: threshold 10 refreshes on rolls 11..99; threshold 20 refreshes on
rolls 21..99. Rolls 0..10 (threshold 10) and 0..20 (threshold 20) continue
to encounter setup, subject to the earlier counter/sentinel gates. No
distribution probability is inferred.

The decoded CoK ECL corpus also writes this numerical address from unrelated
script contexts: ECL1#17 increments/resets it; #18 writes 1; #32 writes 255;
ECL2#48 writes 0/255; #64 writes 0/7/14; #66 increments; #67 writes 1; #68
uses it as OR-ed bit flags; and ECL3#96/#98 write 1. This confirms the numeric
slot does not have one corpus-wide meaning independent of area/script
context. Task 89 closes at the ECL1#33 local writer/consumer chain, not a live
value proof. Task 90 traces the neighboring `word_21C`, `word_212`, and
`word_2C2` pre-roll gates across the ECL1#32..#34 continuation. Static only;
no DOSBox or GUI.

### Task 90 result — ECL1#33 pre-roll state gates — 2026-09-27

The three pre-roll gates at `0x8242..0x8266` resolve as follows:

- `word_21C` is a countdown: when nonzero, SearchLocation subtracts one and
  exits before drawing. ECL1#32/#33/#34 each have a post-combat path that
  writes 7 to this field alongside an encounter-state update. Starting from
  seven, seven later SearchLocation calls can consume the counter, but the
  separate sentinel gate is still checked afterward.
- `word_212==255` exits before the random draw. ECL1#32/#33/#34 each write
  `word_212=255` on their mapped post-combat branches, which blocks further
  random draws after that branch. Other area scripts also use this numeric
  slot as an encounter roster index/counter, so its meaning remains local to
  the script path.
- `word_2C2` must be zero. The ECL1 corpus has one decoded writer,
  ECL1#33 `0x9168 SAVE #128`; local ECL1#33 consumers compare it with 0, 128,
  or 255. No ECL reset-to-zero writer was found in this corpus. Native
  indirect writes and restored state are outside this census.

The initial clear of the `0x800`-byte area1 workspace supplies zero for all
three fields before later script operations, if the SearchLocation route uses
that same cleared allocation and no intervening restore/write occurs. ECL
source shows the post-combat sentinel can later close the encounter path; it
does not establish which branch ran on any real invocation. Task 90 closes at
the cross-script writer/consumer census. Task 91 follows the remaining
bulk-copy/save-restore routes that could replace area1+`0x274` between its
workspace clear and ECL1#33's gate. Static/focusless only; no DOSBox or GUI.

### Task 91 result — bounded area1 bulk-copy and restore audit — 2026-09-27

The tracked area1 root is the fresh `0x800`-byte allocation stored at
`DS:4B28/4B2A` and cleared on startup/reset through `A46:0x1661`. The bounded
native pointer/member census reports direct field updates at `+0x1CC`,
`+0x186/+0x188`, and other identified workspace members, but no direct
`+0x274` member access. The raw `0x0274` immediate scan's five matches are
unrelated instruction operands, and the aligned ECL scan finds no writer.
No later bulk copy or save restore into this allocation was identified in the
traced allocator/reset/accessor call family.

This is a bounded negative over the known area1-root and accessor families;
it does not prove the game never restores an area record through a separately
computed far pointer or untraced file path. The only source-backed producer
located remains the full-workspace clear. Therefore the value at ECL1#33's
`word_274` compare stays conditional on allocation identity and any intervening
indirect/restore write. Task 91 closes at this evidence boundary. Task 92
composes both `word_274` branch values, then the nonzero arm's first
SearchLocation roll in focusless Unicorn with every synthetic state byte
declared; it must not be presented as a production campaign capture. No
DOSBox or GUI.

### Task 92 result — SearchLocation compare and first-roll branch — 2026-09-27

The earlier Task 86 write-up reversed the operands at `0x826D`. The bytes are
`03 01 79 7F 01 04 4C`: class-1 address `0x7F79` is the left operand and
class-0 address `0x4C04` is the right. Original ECL writer `0x9847` maps the
first to `area2_ptr+0x6F2`; the second maps to `area1_ptr+0x208`. The original
compare and IF handlers therefore test unsigned `random_result > threshold`.
When true, IF_GT executes GOTO `0x8236` (refresh); when false it skips that
GOTO and continues at `0x8279` toward encounter setup. The threshold-10
refresh range is 11..99 and its encounter-continuation range is 0..10;
threshold 20 refreshes on 21..99 and continues on 0..20.

A bounded focusless Unicorn fixture ran the original opcode-08 RANDOM handler,
COMPARE handler, IF dispatcher, and GOTO handler with a synthetic threshold
10 and the source bytes at their real ECL virtual addresses. Seed `1` produced
roll 56 and reached cursor `0x8236`; seed `0x1234` produced roll 7 and skipped
the refresh GOTO to cursor `0x8279`. Separately, original COMPARE/IF/GOTO
handlers confirmed `word_274=0` skips the `0x8242` GOTO while `word_274=1`
takes it. These are source-composed fixture cases, not campaign captures.

### Task 93 result — retail SearchLocation pre-roll composition — 2026-09-27

The first direct-handler attempt positioned each opcode cursor one byte past
its opcode. Correcting the cursor to the opcode address let the original
handlers consume the retail ECL operands and resolved the apparent class-0
reader mismatch; the prior `2,0` compare inputs were an artifact of the shifted
cursor, not a retail read result.

Using retail ECL1#33 bytes and original handlers, a focusless Unicorn fixture
composed `word_274=1` through the `word_21C`, `word_212`, and `word_2C2` gates,
RANDOM, threshold COMPARE/IF, and the following GOTO. Synthetic fields were
`word_21C=0`, `word_212=0`, `word_2C2=0`, and `word_208=10`; area1/area2 pointers
were explicitly set to `6100:0000` and `6180:0000`. Seed 1 produced roll 56 and
reached refresh `0x8236`; seed `0x1234` produced roll 7 and reached encounter
setup at `0x828A`. The branch checks also stopped at the expected EXIT opcodes
for `word_274=0` (`0x81ED`), `word_212=255` (`0x825E`), and nonzero `word_2C2`
(`0x8266`). These are synthetic source-composed cases, not campaign captures.
Task 93 closes at the encounter-setup entry, before table/roster values are
resolved; no monster setup or COMBAT execution is claimed. Focusless Unicorn
only; no DOSBox or GUI.

### Task 94 result — ECL1#33 encounter-table consumer — 2026-09-27

The path from `0x828A` begins with `PRINTCLEAR`, then ten GETTABLE operations
at `0x8299..0x82F3`. EclDump identifies destinations in area2 words
`0x6F4..0x704` and `0x6F2`, all indexed by `area1.word_214`; table lengths are
12, 26, 255, 8, 3, 0, 12, 26, 0, and 12, respectively, with bases at script
virtual addresses `0x91BF..0x9207`. The next compare at `0x82FD` tests whether
the final scratch value is 41 and chooses one of two SETUP MONSTER branches.
The ten candidate table bases are shown below as raw ECL payload offsets
(the EclDump offsets), with the six bytes currently measured at each base. This
is a byte inventory only; which address/index convention the original CoK
GETTABLE handler uses is still to be verified.

| ECL payload offset | bytes at offsets 0..5 |
|---:|---|
| 4543 | `01 13 0C 23 0C 1A` |
| 4551 | `07 01 1A 29 1A 29` |
| 4559 | `23 23 FF FF FF 1F` |
| 4567 | `1F FF 08 04 04 07` |
| 4575 | `02 03 03 03 05 02` |
| 4583 | `05 04 00 00 00 03` |
| 4591 | `03 00 0C 23 0C 1A` |
| 4599 | `06 01 1A 29 1A 29` |
| 4607 | `23 23 00 00 00 1F` |
| 4615 | `1F 00 0C 29 0C 29` |

CoK's own ECL dispatcher at `0x41D9` routes opcode `0x2A` to handler
`0x185F`. That handler prefetches three operands, resolves the table index
through `4E:25`, adds it to the inline ECL table base, reads one byte through
`4E:57` (`0x9A0B`), then writes the result through `4E:52` (`0x9847`). A
focusless Unicorn fixture ran the original handler for all ten GETTABLEs and
indices 0..5; every output equals the held ECL payload byte at
`payload_offset = EclDump_table_offset + 2 + index`. The two-byte adjustment
is thus confirmed for these ten accesses, not inferred from the listing alone.

| `word_214` index | `6F4 6F6 6F8 6FA 6FC 6FE 700 702 704 6F2` |
|---:|---|
| 0 | `0C 1A FF 08 03 00 0C 1A 00 0C` |
| 1 | `23 29 FF 04 03 00 23 29 00 29` |
| 2 | `0C 1A FF 04 05 00 0C 1A 00 0C` |
| 3 | `1A 29 1F 07 02 03 1A 29 1F 29` |
| 4 | `01 1F FF 03 04 00 01 1F 00 01` |
| 5 | `1F 23 1A 04 02 07 1F 23 1A 23` |

The same ECL1#33 listing has `SAVE #0 -> area1.word_214` at `0x803C`,
`RANDOM -> word_214` at `0x8284`, and `ADD #1 -> word_214` at `0x835A`.
The fresh #34-to-#33 entry passes the guard at `0x8014` (prior ID 34), then
executes the zero write at `0x803C`. The ordinary SearchLocation route's GOTO
at `0x8279` lands at `0x828A`, bypassing the separate `0x827D..0x8289`
RANDOM block; the increment at `0x835A` is after COMBAT. Thus ECL source sets
index 0 on fresh entry before its first encounter setup, conditional on no
native alias write between those points.

One composed focusless Unicorn fixture crossed the nonzero word_274 gate,
passed zero `word_21C/word_212/word_2C2` gates, and used seed `0x1234` to
produce roll 7 under threshold 10. It reached `0x828A`; with index 0, the ten
original GETTABLE handlers produced `0C 1A FF 08 03 00 0C 1A 00 0C`. The
`0x82FD` compare of final scratch `0x0C` against 41 selected GOTO `0x8313`.
This closes the GETTABLE consumer and first branch selection with declared
fixture state, not a natural campaign roster.

The dispatcher resolves the apparent arity conflict: at `0x424E` it compares
opcode `0x0C`, then calls `0x0D35` at `0x425E`. Handler `0x0C55` is the target
for opcode `0x0A`, not `0x0C`. `0x0D35` prefetches three operands, matching
EclDump's SETUP MONSTER decode.

The joined fixture continued through this handler. With seed `0x1234`,
`word_214=0`, and the other declared pre-roll inputs, it reached `0x828A`, read
the ten index-0 table values, compared final scratch `0x0C` against 41, took
GOTO `0x8313`, then executed original handler `0x0D35` through cursor `0x831C`.
It stored `0x0002` at area2 `+0x580` and `+0x582` on this fixture path. This
closes Task 94 through SETUP MONSTER's operand consumption, not through the
following DELAY/APPROACH/GOSUB/CLEARMONSTERS/LOAD MONSTER chain or a campaign
roster. Task 95 follows that continuation to the first LOAD MONSTER, stopping
at any unresolved party/resource inputs. No DOSBox or GUI.

### Task 95 result — setup continuation through first LOAD MONSTER — 2026-09-27

Retail ECL1#33 confirms the continuation after SETUP MONSTER at `0x831C`:
DELAY `0x831C`, APPROACH `0x831D`, DELAY `0x831E`, APPROACH `0x831F`,
GOSUB `0x9174` at `0x8320`, CLEARMONSTERS at `0x8324`, then the first LOAD
MONSTER at `0x8325`. The following compare at `0x832F` checks the second
monster ID against `0xFF`; for the index-0 table fixture it is `0xFF`, so the
script skips the second and third LOAD MONSTER sites.

Dispatcher `0x41D9` maps DELAY (`0x3A`) to `0x359F`, APPROACH (`0x0D`) to
`0x1242`, GOSUB (`0x02`) to `0x0A74`, CLEARMONSTERS (`0x1C`) to `0x1C6A`, and
LOAD MONSTER (`0x0B`) to `0x0DD1`. DELAY advances the ECL cursor and calls
external selector `0x521:0x0B4B`; its runtime behavior was not executed here.
APPROACH decrements the pending extent at `area2+0x582` when nonzero, then
passes that count, `DS:0x72E9/0x72EA`, and `DS:0x8830` to `0x4E:0x48`
(descriptor-7 procedure `0x8FB6`) before advancing the cursor. The fixture's
extent 2 therefore supplies counts 1 and 0 across the two APPROACH handlers.

GOSUB reads its target operand and transfers through `0x4E:0x75`. Target
`0x9174` is a one-choice HORIZONTAL MENU labeled `PRESS BUTTON OR RETURN TO
CONTINUE.` Its menu/input handler is the first unresolved interaction boundary:
this focusless trace did not invent a user selection or run the display/input
path. Once that menu returns, the source path reaches CLEARMONSTERS, whose
handler clears pending-load state (`DS:0x8851`, `DS:0x8859`, `DS:0x43BE`) and
the associated temporary list before advancing to `0x8325`.

On the declared index-0 table fixture, the first LOAD MONSTER operands at
`0x8325` resolve to ID `0x0C`, copies `0x08`, CPIC ID `0x0C`; the `0xFF` second
ID then skips the later two loads. This is bytecode/table-derived, not a claim
that handler `0x0DD1` completed a resource-backed load. That handler's resource,
map/workspace, and held-party inputs remain outside this composed fixture.
Task 95 closes at the first LOAD MONSTER invocation boundary, with the menu
selection and subsequent resource-backed handler execution explicitly open.
No DOSBox or GUI.

### Task 96 result — encounter menu input and first loader boundary — 2026-09-27

The corrected dispatcher mapping is `0x41D9:0x436B..0x4370`: HORIZONTAL MENU
opcode `0x2B` calls handler `0x1AD9`; handler `0x344B` belongs to opcode `0x2C`
PARLAY. `0x1AD9` reads the output operand and one menu item, builds the row,
and calls `0x4E:0x61` at `0x1C3F`. Descriptor resolution maps `0x4E:0x61` to
`GAME.OVR:0xA2C6`, which delegates the event loop through `0xFD:0x2A` to
`GAME.OVR:0x3B221`. On the Return-key branch, `0xA37A` sets result index 0;
the helper returns that zero-based index in AL. Handler `0x1AD9` passes it to
`0x4E:0x52` (`GAME.OVR:0x9847`) with the output operand; ECL1#33 `0x9174`
declares that destination `area2.word_6F2`. Thus a Return-key selection writes
0 there, conditionally; no physical key event was supplied.

The event loop uses START's input service. Before its first event read,
`GAME.OVR:0x3B221` runs timer/display setup; then it calls `0x614:0x3C2` at
`0x3B3EB`, resolved in START to `0x6502`, which polls through
`0x962:0x2FD` at START `0x991D` (`INT 16h`, `AH=1`). Key retrieval proceeds
through `0x614:0x25B` at `0x3B3F7` to START `0x639B` and `0x962:0x30F`
(`0x992F`), whose empty-buffer path reads `INT 16h`, `AH=0`. These are the
first unsupplied display/timer and keyboard boundaries; the retail code path is
statically traced, not executed.

After a conditional Return result, ECL reaches CLEARMONSTERS and the first
LOAD MONSTER at `0x8325`. Its handler `0x0DD1` first captures the encounter/
area context pointer `DS:0x6096/0x6098` at `0x0DD8`; that invocation-specific
pointer value is absent from the composed fixture. It later calls
`0x4E:0x39` (`GAME.OVR:0x8E78`) to obtain the requested monster record. This
closes Task 96 at the first input and context/resource boundaries. It does not
claim a completed monster load, natural roster, or COMBAT outcome. No DOSBox or
GUI.

### Task 97 result — first monster record producer — 2026-09-27

Descriptor resolution maps `0x9E:0x3E` to `GAME.OVR:0x1ECF6`. Handler
`0x0DD1` reaches it through `0x4E:0x39` -> `0x8E78`, where a `0x199`-byte
destination is allocated and the requested ID `0x0C` is passed with it. The
service constructs the `MON<DS:0x5782>CHA.DAX` family (its data strings at
`0x1ECCB` are `MON`, `CHA`, `.dax`) and passes the requested block ID and
output pointers to `0x69C:0x88E`. The source-proven new-game initializer sets
`DS:0x5782=1` at `GAME.OVR:0x10627`; conditional on that family selector,
retail `MON1CHA.DAX` has block ID 12 at ordinal 14, decompressed size 409,
name `HOBGOBLIN`, SHA-256
`a4d053997d1dccfa73aedf9a392993a0ed6e5c46c144884ced030706f1229c57`.

The service copies the 409-byte record to the allocated destination, resets
record-internal links, and consults the matching `MON1ITM`/`MON1SPC` side
tables. `MON1ITM.DAX` contains ID 12 (126 raw bytes, two 63-byte records);
`MON1SPC.DAX` has no ID 12. In the SPC path, a zero returned member size
branches from `0x1EE39` to shared cleanup at `0x1EED8`, skipping that table's
copy/link setup. Raw HOBGOBLIN fields relevant to the caller are byte
`+0x18A=1`, HP `+0x62=4`, and effective movement `+0x197=4`.

The caller's conditional adjustment is now numerically pinned. If the flag is
1 and `[DS:4B28]+0x3E8` is 1..5, it computes each selected byte as
`floor(old*(setting+1)/4)`; if either result is zero, both are raised to 1.
The retail settings handler at `GAME.OVR:0x1C982` labels the field “Game
Speed” in its adjacent string data and maps its accepted keys to settings
1..5; two initializer paths store setting 3 at `0x1048A` and `0x10947`.
Setting 3 leaves this record's HP and effective movement at 4. The trace
closes at the source-derived record and caller transform: invocation state,
actual selected suffix, heap pointers, and a dynamically executed resource
read remain unobserved, so no runtime allocation or linked-record pointer is
claimed. No DOSBox or GUI.

#### Task 97 correction — CoK raw `+0x197` is not movement

A read-only census of every 409-byte block in the three held CoK monster
character archives found 26 records in `MON1CHA.DAX`, 32 in `MON2CHA.DAX`,
and 30 in `MON3CHA.DAX` (88 total). In every record, raw byte `+0x197`
equals byte `+0x62`, the HP field used by the native CoK decoder; adjacent
raw byte `+0x198` is zero in all 88 records. The Task 97 wording that called
raw `+0x197` "effective movement" is withdrawn. HOBGOBLIN's matching value
of 4 was coincidental with the default movement allowance. This raw-byte
census does not identify the source field that retail code converts into
combatant movement `+0x198`. A static scan found retail stores at
`GAME.OVR:0x3681B` and `0x3755D` copying the same record's `+0xD5` byte into
`+0x198`. In the 88 raw MON records, `+0xD5` takes values 6, 9, 12, 15, 24,
and 30, making it a plausible producer candidate; the record identity and
load/transform path are still unproved. Task 113 now traces that candidate and
the effect-12 boundary. The native fixed-4 fallback is unchanged. This
correction is static inventory/disassembly evidence, not a live combat capture.

### Task 98 result — E63B terrain-byte classification — 2026-09-27

Task 80 showed that the generated terrain cell `(6,10)` is read by the
range-search consumer, but changing its byte from `0x17` to `6` left the
explicit `(6,10)->(9,10)` fixture result at 3. Task 98 will use the original
consumer to find a position pair and source-generated cell for which plausible
terrain-byte values alter candidate acceptance, selected distance, or the
callback's returned classification. The E63B branch values and callback-mode
lookup are now bounded; the result below shows this producer cannot supply the
discriminator. No natural retail invocation is inferred. No DOSBox or GUI.

The callback wrapper `0x38E2E` toggles combat-map header byte `+6` before its
candidate search and restores it afterward (`0x38E4D`, `0x38E8A`). A hook at
the two original `0x3EB4A` entries observed header `+6=1`; with this flag set,
the helper skips its third-cell/`DS:1EE6` path at `0x3EC0D` and indexes
`DS:1EE5 + 4*cell_byte` for the two endpoint cells. For each E63B output,
the resident `DS:1EE5` value is identical:

| E63B arm | E1E0 input | Written map byte | `DS:1EE5 + 4*byte` |
| --- | ---: | ---: | ---: |
| true, first pair | 5 | 6 | 1 |
| true, second pair | 10 | 11 | 1 |
| false, all four cells | `0x16` | 23 (`0x17`) | 1 |

Thus changing an E63B-written cell among these branch outputs cannot change
the table value consumed at either endpoint in this callback mode, regardless
of the candidate coordinates. `DS:1EE6` differs for byte 6 (2) versus 23 (0),
but the callback wrapper's header flag bypasses that read. As a dynamic
corroboration, a fresh original `ContextMachine.range()` fixture held member
one at `(6,10)` and swept member two over every other map coordinate in
`0..49 x 0..24`; changing only `(6,10)` between 6 and 23 changed no returned
value. The existing `(6,10)->(9,10)` case remains one example (3 in both
fixtures). These are synthetic results. Task 98 closes at the negative
producer/consumer join; the sibling terrain builders called by EA67 remain
unexamined.

### Task 99 result — EA67 terrain-writer family — 2026-09-27

Task 98 rules out E63B's 6/11/23 outputs as a callback-mode discriminator:
all index to 1 through `DS:1EE5`, and the wrapper bypasses `DS:1EE6`. Task 99
checks EA67's sibling terrain builders `E596`, `E6B8`, and `E890` and closes
the E1E0 writer family at the same table boundary. No natural invocation is
inferred. Static/focusless only; no DOSBox or GUI.

The first sibling, `E596`, always calls `E1E0` with input value `0x16` (written
map byte 23). Under its `DS:45E7==1` branch it also supplies values 4, 3, and
13, which `E1E0` writes as bytes 5, 4, and 14; under `DS:45E7==3` it supplies
8 and 0, written as bytes 9 and 1. In the same resident table image,
`DS:1EE5 + 4*byte` is 1 for all resulting byte values `{1,4,5,9,14,23}`.
These `E596` outputs therefore also fail to provide a callback-mode lookup
discriminator. `E6B8` and `E890` likewise pass their branch-selected byte
values to `E1E0`. Across the four EA67 builders, each E1E0 input is a constant
in `0..24`, so its write of `input+1` lands in `1..25`; the resident
`DS:1EE5 + 4*byte` entry is 1 for every byte in that interval. A direct-call
scan finds 22 relative calls to E1E0, all inside these four builder routines.
Thus this writer family supplies no alternate `DS:1EE5` class. The callback
map could still contain bytes from other producers or direct writers; that is
Task 100.

### Task 100 result — callback-map writer E26D — 2026-09-27

Task 99 bounds every direct E1E0 terrain write in the EA67 builder family to
bytes 1..25, all equivalent under callback-mode `DS:1EE5`. Task 100 searches
for callback-visible map-cell stores to offset `+7` outside E1E0, traces each
candidate writer to its source inputs, and checks whether any can supply a
byte whose `DS:1EE5 + 4*byte` value differs from 1. If one exists, join that
writer to a sampled candidate cell and compare explicit range returns; if the
writer census finds none, close this terrain-byte path with the bounded null.
Record scan boundaries and unresolved indirect stores. No natural invocation
is inferred. Static/focusless only; no DOSBox or GUI.

A byte-pattern census for direct `ES:[DI+7]` stores found non-E1E0 candidates
at `0xE3D8` and `0xE47C`. Both use the combat-map pointer at `DS:6A2E`; the
first stores literal `0x1A` (26), the second `0x1B` (27). The callback-mode
lookup differs: `DS:1EE5+4*26=2`, while `DS:1EE5+4*27=1`. The containing
routine derives candidate cells from map origin `DS:6D85/6D86` plus scan
offsets `DS:45E4/45E5`, and gates writes on resident terrain/flag checks plus
random rolls. A bounded direct execution of original `E26D` used synthetic
selectors `DS:45E6..45E9=(1,1,1,1)`, `DS:45ED=1`, zero origin/scan offsets,
default map byte 23, and RNG seed 2. It computed `DS:45EE=1` and wrote byte
26 at `(25,12)` and `(27,14)`, with byte 27 at seven neighboring cells
`(25,11)`, `(24,12)`, `(25,13)`, `(27,13)`, `(26,14)`, `(28,14)`, and
`(27,15)`. This is a synthetic original-routine execution, not a natural
EA67 call. The `DS:45ED` producer and actual query/resource inputs remain
unresolved.

As a bounded consumer check, fresh `ContextMachine.range()` fixtures held
`(6,10)` in the first slot and swept the second over the other 1,249 map
coordinates, then repeated with `(6,10)` in the second slot. Replacing only
that endpoint's byte 23 with 26 changed no returned range in either sweep.
Fourteen nearby cases with both endpoint cells changed 23->26 also returned
the same value. These flat-map synthetic runs do not exercise E26D's writer
gates, its adjacent 27 cells, or any natural combat-map generation. This
closes Task 100 at the source-writer and explicit range-result boundaries;
the actual `45ED` source remains Task 101.

### Task 101 result — join E26D's GEO flag input — 2026-09-27

EA67 at `0xEB05` calls `0x10B:0x34` with the current search coordinates;
after return, `0xEB0A` masks AL with `0x40` and stores it in `DS:45ED`, then
`0xEB10` calls E26D. The mapped target `GAME.OVR:0x3DA3B` validates and
clamps x/y to `0..15`, then reads
`ES:[DI+0x200]` at `DS:6D7C + 16*y + x`. Thus `45ED` is set exactly when that
selected plane-2 byte has bit `0x40`.

The held `GEO1.DAX` contains only blocks 32 and 34; their 256-byte plane-2
regions contain no `0x40` bit. Across the complete held `GEO1..3.DAX` block
inventory, only `GEO2.DAX#64` has any such bytes: ten cells, each `0xC0`, at
`(11,8)`, `(12,8)`, `(14,8)`, `(15,8)`, `(12,9)`, `(14,9)`, `(9,12)`,
`(10,12)`, `(8,13)`, and `(9,13)`. Every other block in GEO1/2/3 has zero
plane-2 bytes with bit `0x40`.

Conditional consequence: if the map family is GEO1 and the selected candidate
is #32 or #34, `45ED` is zero at every clamped coordinate, so E26D's special
writer gate is closed. GEO2#64 is the only held map member that can open it,
and only at those ten coordinates. The active ECL-to-GEO member selection and
runtime `DS:6D7C` instance remain unjoined. Task 101 closes at this bounded
source inventory; it does not claim a natural E26D write.

### Task 102 result — retail GEO2#64 script request — 2026-09-27

Task 101 found `GEO2.DAX#64` as the sole held CoK GEO block with the `0x40`
plane-2 bit consumed by E26D's `45ED` gate. Task 102 resolves the retail
script request and its route boundary; it does not join a loaded buffer to the
effect-7 consumer. No natural invocation is inferred. Static/focusless only;
no DOSBox or GUI.

The local ECL dump for `ECL2.DAX#57` has initial entry `0x8014` and
`LOAD FILES GEO 64` at `0x8020`, before its later position saves, movement
helpers, and map refresh calls. The native task ledger independently pins
that block as the non-campaign-mutating CoK demo boundary `GEO2#64`. This
establishes a script-selected family-2 resource on that bounded ECL2 route.
Task 101's ten plane-2 flag cells are
`(11,8),(12,8),(14,8),(15,8),(12,9),(14,9),(9,12),(10,12),(8,13),(9,13)`.
No composed evidence ties a query at one of those coordinates to the active
ECL1#33 SearchLocation route, or proves that this demo route's loaded
`DS:6D7C` buffer persists into or is sampled by effect 7. Task 102 closes at
the script-request boundary; it does not claim a natural callback.

### Task 103 result — ECL1#34 to #33 map replacement — 2026-09-27

Task 67's `NEWECL` handler stores departing `EclBlockId=34` in
`area_ptr+0x1E4` before installing block 33. ECL1#33's initial entry compares
that `LastEclBlockId` with 33 and exits only on equality, so the conditional
34-to-33 transition continues. Its initial path requests `LOAD FILES GEO 32`
at `0x802E`, before the `LastEclBlockId==34` branch at `0x804E`. The shared
`LOAD FILES` handler passes GEO ID 32 to `Load3DMap`; the loader copies all
four planes into its `DS:6D7C` destination. Therefore, conditional on the
script guards, one runtime DS, and successful loading, GEO1#32 replaces an
earlier map payload before later ECL1#33 processing. This is a source-level
reload edge, not proof of the runtime segment, destination allocation, DOS
result, or later EA67/FDF2 consumer identity.

The complete ECL2#57 listing has no `NEWECL` token and exits through its
separate demo flow (`PROGRAM PartyKilled`, then EXIT). Together with Task 41's
demo-boundary evidence, its `GEO2#64` request does not source a transition to
the active ECL1#33 route. Task 103 closes at these static transition and
reload boundaries. Task 104 queues the remaining joined runtime identity from
ECL1#33's GEO32 load through EA67 into the effect-7 consumer. No DOSBox or GUI.

### Task 104 result — GEO32 request to map-consumer source contract

ECL1#33's `LOAD FILES GEO 32` at `0x802E` uses opcode `0x21`. CoK's dispatcher
routes that opcode through handler `0x1660`, which passes the GEO ID to
`0x10B:0x43` / `Load3DMap`. The same loader contract mapped for ECL1#34 copies
four planes into `DS:6D7C`; `EA67 -> E522` and `0x10B:0x34` read through that
symbolic pointer. Task 74's same-memory fixture executed original loader
copies and original `EA67` queries against one `DS:6D7C` allocation, but it
used GEO1#34 and substituted the helper result at its asserted entry.

Together with Task 103, this bounds the source chain from the conditional
ECL1#33 GEO32 request to the map-consumer contract. It does not establish that
the ECL opcode executed, GEO32's runtime helper result, physical segment or
allocation identity, or a composed effect-7 callback. Task 104 closes at the
source/synthetic-fixture boundary; no natural invocation or result is
claimed. No DOSBox or GUI.

### Task 105 progress — ECL1#33 resource census and capture boundary

The complete local ECL1#33 listing has one GEO request, `LOAD FILES GEO 32`
at `0x802E`; a full listing search finds no later `LOAD FILES` opcode. Thus,
conditional on the #34 -> #33 guards and successful loading, GEO1#32 remains
the only script-selected GEO input for the rest of that ECL block. Task 101's
held-resource inventory found no plane-2 `0x40` byte in GEO1#32. A later map
buffer overwrite from native or indirect code is not ruled out by this ECL
census.

The guarded full-start Unicorn replay records earlier successful FindFirst
searches and retail DAX/overlay loads, then stops before responding to a later
malformed request: its synthetic base-name buffer contains an embedded NUL and
instruction-like bytes, so no guessed zero-match response is valid evidence.
The 60M VGA capture has a different transient DS and does not reach the map
loader or callback. These artifacts do not provide a runtime identity join.

Saved-image disassembly narrows the bad-name boundary. START image `0x7140`
calls its path builder at `0x6C67` from two sites (`0x71A3`, `0x71E0`). That
routine copies caller strings into stack locals, calls the resident parser at
`0x19C4:0x0256`, then checks path candidates through `0x6E81`; that helper
copies a far pointer from its call frame and calls resident parser
`0x19C4:0x0112`. The initial disassembly pass did not recover the
call-specific far-pointer arguments at `0x7140`; the saved SS frame recovery
below does. Do not answer the FindFirst request with a guessed match/no-match
result.

#### Saved SS frame recovery

The saved `unsupported-dos-search-ss-2491.bin` does preserve the missing
arguments. The final `0x6C67` frame has `BP=0x3874`; its saved caller frame is
START image `0x7140` at `BP=0x3AB8`, returning to image `0x72A6`. In that
`0x7140` frame, `[BP+0x16]` is far pointer `2491:3C37`, `[BP+0x12]` is
`2491:3BE6`, and `[BP+0x0A]` is `2491:3B5D`. The first is a Pascal basename
with length 9 and data `76 FC FF 76 FA B0 00 50 32`; the embedded NUL is
already present in this caller-supplied source buffer. The second is the
separate, valid Pascal suffix `.dax`. The caller concatenates these into its
local pattern before calling `0x6C67`, so the malformed byte sequence is not
created by the resident FindFirst wrapper or by suffix handling.

The `0x7140` frame's saved BP is `0x3C88`. Its return address is
`4705:01FD`, the instruction after the far call into START image `0x724E`.
That caller copies its basename input into `SS:3C37` before passing the local
far pointer to `0x7140`. At this earlier evidence point, the separate 60M RAM
snapshot supplied only a candidate match at `GAME.OVR+0x4023D`. Task 107's
same-invocation capture independently maps the copy-writer frame's return
address to descriptor 2's relocated code at `GAME.OVR+0x130B`, directly after
the far call at `0x1306`; it does not resolve the distinct `4705:01FD` return
address. The saved images still do not establish
whether the malformed input came from legitimate input, corrupted storage,
or the guarded synthetic setup. No DOS response was injected.

Task 105 remains active: seek focusless evidence for the conditional ECL1#34
-> #33 load and later `EA67`/effect-7 consumers in one invocation; record DS,
`DS:6D7C`, loader result, and consumer read addresses. Task 109 now identifies
the earlier malformed-search replay as ECL2#57's demo PICTURE path, so that
capture cannot serve as the ECL1 runtime join. No DOSBox or GUI.

### Task 106 bounded completion — guarded search argument strings

Disassembly of START image `0x724E` shows it copies the far pointer at
`[BP+0x14]` into local `SS:3C37`, then the pointer at `[BP+0x10]` into local
`SS:3BE6`, each with the resident bounded-copy helper and a 0x50-byte limit.
At its saved frame `BP=0x3C88`, those arguments resolve to `2491:3CA5` and
`2491:3CA0`. The final saved SS bytes at `3CA0` are Pascal `.dax` followed
immediately by the nine-byte basename at `3CA5`; its bytes exactly match the
local copy at `3C37`, including the embedded NUL. The suffix copy at `3BE6`
is `.dax`. Thus the malformed basename is already present in the incoming
argument area before START image `0x724E` or resolver `0x7140` processes it.

This closes Task 106 at the caller-to-local transfer boundary. At that stage,
the writer of `SS:3CA0..3CAE` and the bytes' provenance were unresolved; Task
107's later write watch records the immediate copies and append below, but not
the origin of their source bytes. The saved far
return is `4705:01FD`. A separate 60M RAM snapshot has a unique byte match at
that address to `GAME.OVR+0x4023D`, but it predates the final stack and the
bytes before the candidate continuation do not show a far call; treat this
only as a candidate mapping. Task 107 traces the argument-buffer writer and
validates the caller in same-invocation evidence. Keep the guarded search
unresolved; do not synthesize a DOS match or error. Static capture analysis
only; no DOSBox or GUI.

### Task 107 bounded completion — guarded argument-buffer source mapping

A fresh EXEPACK-start Unicorn replay used three `0x0002` keys and 40 Enter
keys, then stopped at instruction `77,588,249` before replying to the malformed
`AH=4Eh` request. A CPU write watch on the relevant stack bytes captured how
the basename was assembled. At instructions `77,574,369` through `77,574,376`,
resident copy helper `1A46:0AFB` copied eight bytes from `DS:SI=4950:03D8`
into caller local `SS:3DC0..3DC7`: `76 FC FF 76 FA B0 00 50`. At
`77,586,692` through `77,586,702`, caller code copied those bytes to
`SS:3CA5..3CAD`; helper `1A46:0B76` then appended byte `0x32` (`'2'`) at
`SS:3CAE`, and the Pascal length was set to 9. This reproduces the malformed
base as an eight-byte prefix read from `4950:03D8` plus the separate suffix
byte `2`.

The `.dax` suffix was copied separately to `SS:3CA0..3CA4` at instructions
`77,586,740` through `77,586,746`, with source `DS:SI=4705:00D2`; the bytes
written were `04 2E 64 61 78`. The guard then stopped before any DOS search
result was supplied. This establishes the immediate string-copy sources and
reproduces the Task 106 stack strings.

At the source-write instruction, a same-invocation segment snapshot maps
return CS `3DE4` to CoK `GAME.OVR` descriptor 2 (`OVR+0x96C`, code size
`0x3F35`): all 492 relocations match with zero mismatches. Return
`3DE4:099F` is `GAME.OVR+0x130B`, immediately after the far call at `0x1306`.
The call's `0x0105:0x002A` fixup resolves through VROOMM descriptor 28, stub 2,
to proc offset `0x00E4`; that dispatcher route invokes START image `0x724E`
during path resolution rather than directly calling it. This validates the
copy-writer caller in the same invocation.

The source DS `4950` maps to a suffix of descriptor 23's code (`OVR+0x33FAB`,
size `0x2515`): its bytes match from `OVR+0x34ADB` through the end after all 91
relocations, with zero mismatches. Therefore `4950:03D8` maps to
`GAME.OVR+0x34EB3`, where the copied bytes begin one byte into `FF 76 FC` and
continue into following instruction bytes. The evidence identifies the
immediate pointer and both overlay identities, but not why descriptor 2's
caller has DS pointing into descriptor 23's instruction stream, who set that
far pointer, or whether this malformed path is retail or specific to the
guarded synthetic route. Task 107 is closed at this bounded mapping; Task 108
tracks those unresolved provenance questions. Task 105's runtime map identity
join remains open. Artifacts are ignored outputs under
`build/cok-composed-dos-boundary/`. No DOSBox or GUI.

### Task 108 bounded completion — source pointer assembled from caller stack

The Task 107 guarded source-write capture records the VROOMM target reading
from `4950:03D8`. A separate instruction-trace slice from the stock Unicorn
replay corroborates the call and copy sequence: at instruction `77,574,347`,
the VROOMM target executes `LES DI,[BP+0x0E]`. Its frame places this far
pointer at `SS:3DD6`: offset
`0x03D7`, segment `0x4950`. At the descriptor-2 caller frame (`BP=0x3DDC`),
these same four bytes are its local area `BP-6..BP-3`. The call at
`GAME.OVR+0x1306` pushes two words and the separate `DS:6DA2` far pointer, but
does not push this fourth far pointer; the callee's `[BP+0x0E]` therefore reads
through to those caller-local bytes.

Immediately before that call, descriptor-2 code copies the Pascal literal at
`GAME.OVR+0x127C` (`03 50 49 43`, length 3 plus `PIC`) into `SS:BP-5`. This
writes `03 50 49` over the high byte of the adjacent offset and the low two
bytes of the adjacent segment. The remaining low offset byte at `BP-6` is
`D7` in the captured stack. The resulting pointer is `4950:03D7`: its segment
word `0x4950` is the ASCII bytes `PI`, and its offset is the stale `D7` byte
followed by the literal's Pascal length byte `03`.

Descriptor 23 mapping places `4950:03D7` at `GAME.OVR+0x34EB2`, byte `0x57`,
the `push di` opcode immediately before the copied instruction bytes. The
bounded-copy helper reads this as a Pascal length, clamps `0x57` to its
requested maximum of 8, then copies the next eight bytes from `4950:03D8`:
`76 FC FF 76 FA B0 00 50`. This accounts for both the code pointer and the
malformed basename in this guarded invocation. It is a stack-derived pointer,
not an intentional pointer to descriptor-23 text or data.

This closes Task 108 at the pointer-assembly mechanism. The instruction slice
is from `task108-route-trace.log`, produced by the stock
`tools/unicorn_cok_midi.py` runner without the malformed-search guard. It ends
at instruction `77,574,550`, before the malformed FindFirst at `77,588,249`.
That unguarded run supplied a synthetic zero-match response to the malformed
name and continued to the 80-million-instruction cap; all trace and outcomes
after the malformed request are excluded from this result. Task 107's guarded
capture remains the evidence for the stop-before-response boundary. This does not establish
why this caller/callee argument mismatch is reached, the origin of the stale
`D7` byte, or whether a retail navigation path reaches the same `AL==0x0E`
branch. Task 109 tracks that route and calling-convention boundary. Task 105's
runtime map identity join remains active independently. This trace slice ends
before that boundary; no DOS match or error is claimed. No DOSBox or GUI.

### Task 109 bounded completion — identify the script route behind the bad search

The wider early stack snapshot identifies the active selector caller: return
`3DE4:3B1D` maps to `GAME.OVR+0x4489`, immediately after `0x4486` calls
selector procedure `0x4449`. That caller is `GAME.OVR+0x4638`; it pushes
`[0x4B41]` and CS, and the active interpreter has `[0x4B41]=0x8014`,
`[0x4B43]=0x8357`. At the guarded source-write boundary, the ECL data pointer
at `[0x4B34]` is `51D1:0000`. Its full 1,094-byte runtime buffer matches
decompressed retail `ECL2.DAX#57` after removing the DAX member's two-byte
size prefix, with zero mismatches; it is the only exact ECL-block match across
held CoK ECL libraries.

The buffer places ECL virtual address `0x8355` at memory offset `0x355`;
there the bytes are `0E 00 17`: `PICTURE 0`, followed by `IF_NE`. Thus the
`AL==0x0E` branch is executing a retail script opcode from the demo block
ECL2#57 in this replay. This identifies why the prior startup trace hit the
bad PICTURE path: it was in the ECL2 demo flow, not the conditional
ECL1#34->#33 route required by Task 105. It does not prove ordinary player
navigation reaches the same malformed argument layout, and ECL2#57 has no
NEWECL transition to ECL1#33. The early snapshot stopped at instruction
`77,574,550`, before malformed FindFirst; later unguarded search responses
remain excluded. No DOSBox or GUI.

An independently guarded rerun reused the MZ/DOS/overlay model in
`tools/unicorn_gateway_pic.py` against a private CoK copy, with `START.EXE`
staged as the tracer's `GAME.EXE` entry image. It reached the same malformed
FindFirst at instruction `77,588,188` and stopped before supplying any DOS
search result. The queued `up,enter*40` sequence delivered `0/41` keys: the
guest did not poll BIOS keyboard input before reaching the malformed request.
The saved runtime ECL buffer again matches `ECL2.DAX#57` byte-for-byte (1,094
bytes after the two-byte prefix; zero mismatches), with `[1BC6:4B41]=0x8014`,
`[1BC6:4B43]=0x8357`, and bytes `0E 00 17` at offset `0x355`. This reproduces
the demo-route identity but does not constitute a retail navigation attempt or
evidence that any queued key selected it. The malformed `C:\v` pattern was
guarded; no result was injected.

The ignored corroboration artifacts are under
`build/cok-task110-runtime/` (`probe.log`, `probe-output/snapshot.json`, and
`probe-output/ecl.bin`). This harness adaptation does not validate native DOS
or a player navigation route.

Task 109 closes at the current script identity and caller boundary. Task 110
now targets the missing ECL1#34->#33 runtime transition: verify ECL1#34's
runtime bytes and branch conditions, then identify the resulting ECL1#33 buffer
by exact runtime bytes. Task 111 takes the dependent follow-through from
ECL1#33's GEO1#32 request through the real loader result and same `DS:6D7C`
allocation to a later `EA67`/effect-7 consumer read. Keep the demo trace and
any source-composed fixtures separate from both runtime joins.

### Task 110 progress — recover ECL1 transition entry conditions

Task 109's early stack capture fixes the active route in that replay at ECL2#57
(`PICTURE 0` at `0x8355`), ruling it out as evidence for Task 105. The next
capture must enter ECL1#34 through its own script conditions rather than
reusing that key sequence. A fresh private-copy replay using
`up,enter*40` again reached malformed FindFirst in demo block ECL2#57 with zero
keyboard keys delivered; no BIOS key poll occurred before the stop. This does
not constitute a campaign/menu selection. Task 69 already resolves the source
predicates:
the movement boundary writer must set `[0x7ED5]=1`, and SearchLocation must
produce `([0xC04F] & 0x3F)==34`; the `IF_EQ` at `0x80B4` then permits
`NEWECL #33` at `0x80B5`. The runtime values and a retail navigation sequence
that produces them are not present in the saved captures. Task 110 is to
recover a focusless route that reaches ECL1#34 under those conditions and
identify ECL1#33 in RAM by exact bytes and entry/PC. Task 111 is dependent on
that capture: watch opcode `0x21` at `0x802E`, the real external GEO loader
result, writes to `DS:6D7C`, and later `EA67`/effect-7 reads from the same
allocation. Do not synthesize a handler result or answer malformed DOS
searches. No DOSBox or GUI.

The input result above used the Gateway-adapted runner, whose keyboard model
did not reach a BIOS poll. A follow-up switched to the CoK-specific
`tools/unicorn_cok_midi.py` `CokMidiTracer` path, using a temporary subclass
that snapshots registers and resident/ECL buffers immediately before answering
the malformed FindFirst. In three separate private-copy runs, the first queued
key was raw `0x0002`, BIOS Up `0x4800`, or Enter `0x1C0D`, followed by 40 Enters.
Each run delivered exactly one key before reaching the guarded stop: raw key
`0x0002` at instruction `77,588,249`, Up at `77,588,271`, and Enter at
`77,588,249`. All three snapshots report ECL pointer `51D1:0000`, entry
`0x8014`, PC `0x8357`; the 1,094-byte live buffer matches decompressed retail
ECL2.DAX#57 exactly, with zero mismatches, and `0x8355` is `PICTURE 0` then
`IF_NE`. The stop occurred before any malformed FindFirst response was
supplied. Enter's capture is in
`build/cok-task110-startup-runtime/enter-route.log` and
`probe-output/snapshot.json`; equivalent raw-key and Up captures are in the
same ignored runtime directory. The temporary probe scripts were removed
afterward. These are focusless Unicorn runs with synthetic inputs, not
physical keyboard input, campaign selection, or evidence for ECL1#34. They
show only that these key starts reach a poll and then converge on the ECL2 demo
boundary. Task 110 remains open for ECL1#34's predicates and the resulting
ECL1#33 runtime buffer; Task 111 remains dependent on that identity.

#### Task 110 follow-up — input rearm and title-key boundary

Three additional guarded runs used key_rearm_after=1 with 40 queued keys:
enter*40, up+enter*39, and esc+enter*39. Each delivered all 40 keys, with
216 BIOS status polls, yet stopped at the same malformed FindFirst with live
ECL still matching ECL2.DAX#57 exactly (1,094 bytes; zero mismatches), entry
0x8014, PC 0x8357. A fourth run supplied only uppercase P (BIOS word 0x1950)
at the default rearm setting; it delivered one key and stopped at the same
ECL2#57 boundary, with 177 status polls. No malformed search result was
injected in any run.

The key-read interrupt returns to CS:IP=1962:031F. Given load segment 0x1000,
that is decompressed START image offset 0x993F; the preceding bytes at 0x993D
are INT 16h. Static code at 0x992F reads the key and calls 0x9763 to drain
pending keyboard input; the only direct near call to 0x992F in the unpacked
image is at 0x99D0, in a line editor that classifies backspace/control/Enter
and printable characters. The captured P arrives at instruction 770,012,
while TITLE.DAX is not opened until instruction 4,173,597. Thus the observed
P was delivered in an earlier startup input phase; it does not test the
title's Play/Demo chooser. The bundled keys in the rearm-1 runs are likewise
drained in one short burst (key reads at CS:IP=1962:031F from instruction
770,282 through 771,087), not spaced as independent user choices. Artifacts
and exact key counts are under build/cok-task110-rearm1/,
build/cok-task110-rearm1-up/, build/cok-task110-rearm1-esc/, and
build/cok-task110-play-key/.

The first key-read's saved frame and caller were then mapped from a live
snapshot. The helper returns to START image `0x2A8F`; its caller returns into
GAME.OVR descriptor 34 at file offset `0x418B6`. The resident bytes at runtime
`4235:0000..02FF` match descriptor 34's `0x300` code bytes after applying its
28 segment relocations. At the caller return, the OVR immediately loads a new
value into AL from `[BP+6]`, so the key returned by this early helper is
replaced before the caller's subsequent logic. This establishes that the
observed P is not the Play/Demo selection result; the UI purpose of this early
input remains unidentified.

Static START disassembly has another candidate: image offset `0x0313` calls a
key helper, and nearby code compares the returned character against `D`.
However, a guarded replay using Enter at the early read did not execute physical
address `0x10313` (load segment `0x1000` plus image offset `0x0313`). It ran
77,588,249 instructions to the same malformed FindFirst boundary and ECL2#57.
Thus the earlier guarded replay did not exercise the D comparison. Task 112's
later timed-P replay did: it armed immediately before START image `0x0194`,
delivered BIOS word `0x1950`, observed `AL=0x50` at `0x0199`, then followed the
non-demo branch to `0x01B5` with `DS:4B4B=0`. It reached the 80,000,000-
instruction cap while polling keyboard status before the OVR ECL-assignment
hook, without supplying a malformed FindFirst result. Task 112 is closed at
this Play/Demo input boundary. It does not prove ECL36 assignment or campaign
navigation. Task 114 now follows the verified non-demo branch through ordinary
play's party-preparation boundary. Task 110 remains open: the ECL1#34 predicate
values and exact ECL1#33 runtime buffer have not been captured. Task 111 remains
dependent on them. All runs used Unicorn with synthetic input and a pre-response
DOS-search guard; no DOSBox or GUI.

### Task 112 result — runtime Play/Demo input boundary

A guarded timed-input replay armed uppercase P at START image `0x0194`,
immediately before its `displayInput` far call. The helper then made BIOS
`INT 16h/00` return `0x1950` at instruction 24,747,774. START returned with
`AX=0x0050` at `0x0199`; its D comparison fell through to `0x01B5`, where
the captured input byte was `0x50` and `DS:4B4B` remained zero. This confirms
the runtime Play/Demo input boundary and that P follows the non-demo branch.

The replay did not reach the guarded `GAME.OVR` ECL assignment hook before
the 80,000,000-instruction cap; it was still polling keyboard status at
`1962:0304`. No malformed FindFirst response was supplied. This closes only
Task 112's boundary-location question. It does not establish new-game ECL36,
the ECL1#34->#33 transition, or ordinary campaign navigation. Capture log:
`build/cok-task112-timed-p/trace.log`; the output JSON in that directory is
from the earlier demo-path attempt and is not evidence for this P run.
No DOSBox or GUI.

### Task 114 result — bounded post-P menu dependency

A repeated guarded timed-P run stopped at the first later BIOS status check,
instruction 25,107,471, at `CS:IP=1962:0308`; DS was `1BC6`, SS:SP was
`2491:3B40`, BP was `3B48`, and the synthetic key queue was empty. This is the
return point of the START status helper at image `0x9928`, whose code checks
`DS:8A55`, invokes `INT 16h/AH=1` when the cached byte is zero, returns a
Boolean in AL, then far-returns. It is a nonblocking availability check, not
by itself proof of a UI wait.

The stack begins with `03CD:1614`, a far-call return frame. Resident bytes
disassemble a caller at `1614:03C2`; its call at `1614:03C8` targets
`1962:02FD`, returning to `1614:03CD`. In the same stopped image,
`DS:89CE=0`, `DS:8986=0`, and `DS:8A55=0`. With a false status result, the
decoded caller's `JE 0455` arm returns AL=0; the wrapper at `0x0479`
conditionally invokes its key handler only when that result is nonzero. The
following no-key continuation exercised later runtime code, but did not log
the `JE 0455` instruction itself. These runtime bytes and field values are
saved in `build/cok-task114-next-input/next-input-wait.json`.

A no-key continuation let the original code handle the status poll and reached
live address `0x41D95` at instruction 25,107,486, with `CS:IP=417E:05B5`,
`DS=1BC6`, `SS:SP=2491:3B4E`, `BP=3BEC`, `AX=0`, and an empty synthetic key
queue. The branch at `417E:05B3` therefore falls through to the original jump
at `05B5`; no `K` or `M` choice is taken. A follow-up bounded replay captured
the BP-relative stack frame at the same instruction.

The 128 bytes at runtime `417E:05A5` match GAME.OVR descriptor `0xFD`, code
offset `0x05A5` (file offset `0x3B3E4`), with zero mismatches after applying
that descriptor's relocations using the START load base `0x1000`. The three
relocation sites in this window are `0x05AF`, `0x05BB`, and `0x05C9`; each
resolves its far-call segment to `0x1614`. The routine's statically decoded
input loop calls the START status helper at `1614:03C2`, then `1614:025B` for
input, changes the selected row through `'K'` and `'M'`, and routes Enter to a
later branch. This source identity supersedes the prior failed comparison.

The caller frame is descriptor `0xFD` procedure `0x1368`; its local caller at
`0x15CE` calls the function-list helper at `0x03E2` and resumes at `0x15D2`.
The active stack contains `Choose a FUNCTION` at `SS:3D6F`. Its outer caller
returns to `4A14:0369`; a source-addressed caller at descriptor `0xA4` code
offset `0x0364` (file offset `0x2056D`) calls the descriptor `0xFD` public
stub `0x0034`. This establishes the post-P function-selection UI dependency.
Task 114 closes bounded at the exact no-key input boundary. Task 115 below
resolves the list, follows its source-backed default choice, and stops before
the original character-creation call. The list snapshot and no-key caller
capture are retained in `build/cok-task115-list-all/runtime-caller.json` and
`build/cok-task114-framewide/runtime-caller.json`. No party, helper result, or
malformed FindFirst response was synthesized; no DOSBox or GUI was used.

### Task 115 result — linked function list and Create New Character selection

The captured frame chain links descriptor `0xFD` code `0x03E2` to its caller at
`0x15D2`, inside public procedure `0x1368`. That routine traverses linked
records through member offsets `+0x29` (eligibility/skip flag) and
`+0x2A/+0x2C` (next far pointer), and reads its candidate-list head from its
arguments. At the no-key capture, the head is `5B3F:0000`. A later capture
dumped 0x2000 bytes from that runtime pointer and followed the original links
until null:

| Node | Live address | Pascal label | `+0x29` |
|---|---:|---|---:|
| 1 | `5B3F:0000` | `Create New Character` | `00` |
| 2 | `5B48:0000` | `Add Character to Party` | `00` |
| 3 | `5B4B:0000` | `Load Saved Game` | `00` |
| 4 | `5B4E:0000` | `Initialize Mouse/Joystick` | `00` |
| 5 | `5C71:0000` | `Exit to DOS` | `00` |

After the exact timed P branch, a third queued key was withheld until the first
post-P input-status poll; it returned BIOS Enter `0x1C0D` to the function-list
selector. The current row was `DS:6E0F=1`, and the first node's initial `C`
reached the original caller comparison. Descriptor `0xA4` code `0x0364`
(file offset `0x2056D`) calls descriptor `0xFD:0x0034` and returns at
`4A14:0369`. The `Create New Character` choice returns `AL='C'`; at
`4A14:03A9`, the live state has `DS=1BC6`, `SS=2491`, and `DS:08A1=1`, taking
the caller's original call path to `GAME.OVR` descriptor `0xA4:0x06DD`. The
replay stops before that call, so no character allocation or data entry
occurred.
Task 115 closes bounded at the player-specific character-creation branch. No
character or party was fabricated. The selected-result and pre-call state are
in `build/cok-task115-create-branch/runtime-caller.json`.

### Task 116 progress — post-selection keyboard dependency

The source at `GAME.OVR` descriptor `0xA4:0x06DD` begins with a frame setup,
requests `0x199` bytes through `1A46:0x23F`, and clears the returned region
through `1A46:0x1661`. A bounded Unicorn replay delivered only the timed-P and
function-list Enter keys used in Task 115. It reached runtime `4A14:06DD` at
instruction 25,127,903, then stopped at the first post-callback BIOS keyboard
availability poll, `INT 16h/AH=1` at `1962:0308`, instruction 25,226,108. The
poll is 98,205 instructions after the callback; the synthetic key queue is
empty. This is a nonblocking availability check, not a character-data read.

Runtime hooks at the source-mapped helper return points confirm that the
original allocator returned far pointer `6109:0000` at instruction 25,128,015
for 409 bytes; the initial region had 309 nonzero bytes. The original clear
helper returned at instruction 25,128,441 with all 409 bytes zero. The
allocator and clear calls therefore ran on the selected original branch, with
no substituted helper result. The later keyboard poll's saved caller returns
to `1614:03CD`; its stopped image contains `DS:8A1` bytes beginning
`01 0E "Drop C"` plus stack text `" disk 2 in "`. Those strings do not
identify the current prompt or prove that the creator has reached its first
character-data field.

The first constructed character-creation menu label is the literal `Pick Race`
at descriptor-relative `0x064E`; the handler initializes the selector index to
1, builds its menu records, then calls the original `FD:0x34` selector at
descriptor-relative `0x0A88`. The runtime stops at the first post-callback
keyboard-status poll with no character-data key supplied. Task 116 closes
bounded at this first race-selection dependency; no race, name, identity,
attributes, or party was supplied or created. Runtime captures are
`build/cok-task116-create-input/first-character-input.json`; the guarded replay
and instruction trace plus `allocation-return.json` and
`allocation-cleared.json` are in `build/cok-task116-create-input/`.

No DOSBox or GUI was used.

### Task 117 result — bounded original held-save reads

The same runtime function list captured under Task 115 has `Load Saved Game` at
node 3. Static caller bytes at `GAME.OVR:0x20697` issue `lcall 0x9E:0x48`;
`python tools/disasm_cok.py resolve 0x9e 0x48` resolves the validated public
stub to descriptor 17, procedure `0x1B34`, `GAME.OVR:0x1F20F`, with a valid
Borland prologue. The held source files are
`Champions of Krynn/SAVE/SAVGAMA.DAT` (5,469 bytes) and
`CHRDATA1.SAV`–`CHRDATA6.SAV` (409 bytes each). The existing
`tools/cok_gamelink_saved_outpost_route.ps1` documents a retail route, but is
not evidence for this task and was not run.

The loader at `GAME.OVR:0x1F20F` starts with the A-J slot range (`0x41` through
`0x4A`) and builds a game-save filename from the `savgam` stem, selected slot
letter, and `.dat` suffix. Its Pascal string table includes `Load Which Game:`
and `Put save disk in `; it also contains `.sav` and `CPIC` signature strings
for the character-file path. The `0x69C:0x04C1` file-existence entry remains
unresolved statically. The DOS operation it invokes is now observed dynamically.

From the verified Task 115 menu, the bounded replay sent Down, Down, Enter to
choose `Load Saved Game`, then uppercase A for the held slot. The directory
lookup returned the real `SAVE` directory. `FindFirst` found `SAVGAMA.DAT` and
each `CHRDATA1.SAV` through `CHRDATA6.SAV`; the harness read all 5,469 bytes of
`SAVGAMA.DAT` and all 409 bytes from each character record. The save file's
SHA-256 is
`8e65839875fd0e15251a585777f5e2572a176d222eda6104f3a0fce7ad3f6a33`; the six
character-file hashes and per-read destinations are in
`build/cok-task117-load-save/loaded-state.json` and the per-event trace is in
`build/cok-task117-load-save/trace.log`. Runtime destinations for character
records were `6109:0000`, `6123:0000`, `6141:0000`, `616F:0000`, `62A8:0000`,
and `62D2:0000` respectively.

The replay stopped at the first subsequent no-key BIOS availability poll,
`1962:0308`, instruction 25,380,783. This lies inside START's keyboard-event
drain: START image `0x659C` (runtime `1614:045C`) checks status at `0x65A2`,
returns on an empty queue at `0x65A9`, and consumes a key only when one exists.
The valid outer frame points to `GAME.OVR:0x1ECAE`, immediately after its call
to that helper at `0x1ECA9`; the stack string `SAVE\\CHRDATA6.sfx` is a loader
local, not prompt evidence. At that point `DS=1BC6`, `DS:4B28/4B2C/4B30` held
`5091:0000`, `5111:0000`, and `5191:0000`, and `DS:8846` was zero. Of the
SAVGAMA data regions captured at their destinations, the first 2048 bytes and
the final 1024 bytes still matched their source; the middle 2048-byte region
did not. The character buffers differed from their source records after the
loader cleared embedded links/context fields. This poll is not a user-input
dependency and does not itself identify the party list or campaign ECL.

Task 117 closes bounded at the successful held-file reads and this empty-queue
poll. No save content was changed or substituted, and no DOSBox or GUI was
used. The DOS FindFirst shim now returns real directory entries with the DOS
directory attribute when requested; `tools/test_unicorn_cok_midi.py` covers
that behavior.

### Task 118 result — held records published into the original party chain

The same focusless replay continued with the scripted keys exhausted. At
instruction 27,540,945 it stopped at runtime `1614:03C3`, with no next key
supplied. This is the higher-level menu/input loop; the saved BP-frame contains
the current `Choose a FUNCTION` prompt. `DS:609A/609C` (party-list head) and
`DS:6096/6098` (current-party pointer) both resolve to `6109:0000`; following
each record's far next pointer at `+0x17F/+0x181` yields six nodes and a null
tail:

| Node | Held source | Runtime far pointer | Name bytes (decoded) | Runtime record SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | `CHRDATA1.SAV` | `6109:0000` | Sir StrongSword | `c354d359d3bb9f3ff511654aba869b964bfe28c9d1a2f34d0b39aaeae6fb584e` |
| 2 | `CHRDATA2.SAV` | `6123:0000` | Istan Horbin | `4655920aad5030e55cf1236b2302bb13be2928e468dabf891ac2703289b33773` |
| 3 | `CHRDATA3.SAV` | `6141:0000` | Garin | `0b866833f3101d8f656df6b4f4db1da8c2d8717032523e5cb4b97549dcf96255` |
| 4 | `CHRDATA4.SAV` | `616F:0000` | Molly | `eb20eec9d0abba2f339f8792e73a44ed0420e3ffa4b062ac32166ce5c823cf1a` |
| 5 | `CHRDATA5.SAV` | `62A8:0000` | Kal | `4d97ea6325b0b0d48ede3f9d40a47502c85bfa5ae0ec4b4fe64acc2cc8bcfe06` |
| 6 | `CHRDATA6.SAV` | `62D2:0000` | Sirrion | `f89142a433174ba66536aeeb781a187829770b6ee412a6612aadc8d3b039ee83` |

The runtime entry points equal the six original file-read destinations. This
closes the held-file-to-party-list provenance for all six records. At the
boundary `DS:8846` (current ECL block) remains zero; no campaign destination or
Task 110 transition is established. The capture is in the ignored local
artifact `build/cok-task117-load-save/first-post-save-active-loop.json`.
No GUI/DOSBox or keys beyond selecting held save slot A were used.

### Task 119 result — restored party reaches Pick Character

The post-load `Choose a FUNCTION` caller maps by live code bytes to
`GAME.OVR:0x3C411`. It tests H, P, I, and Q; H/P call local viewport helper
`0x3C0D2` with argument 0/1. These branches do not establish row movement.
The focusless replay sent P, H, and Enter, then
stopped at the next input boundary. The live memory window contains the
literal `Begin Adventuring`, but does not capture which row was selected. The
saved caller return address is `GAME.OVR:0x2A47F`, immediately after the call
at `0x2A47A` to `0xFD:0x2A`; the live BP frame contains `Pick Character` and
`Select`, with all six held names present. A later extended frame-chain capture
after one selector Enter proves the enclosing dispatcher took AL=`M` at
`GAME.OVR:0x205CB` and called the `Modify Character` procedure at `0x22B03`.
Therefore retract the earlier inference that P/H/Enter selected `Begin
Adventuring`; that literal alone is not selected-row evidence. In validated
`DS=1BC6`, the held party pointers still resolve to `6109:0000`, and
`DS:8846=0`. This establishes the Pick Character boundary, not a campaign ECL
assignment or Task 110's ECL1#34->#33 transition. The no-key capture is
`build/cok-task117-load-save/menu-after-key-9.json`. No DOSBox or GUI.

### Task 120 result — static Pick Character selector contract

The caller bytes at `GAME.OVR:0x2A440..0x2A4D8` build the prompt and invoke
`0xFD:0x2A` at `0x2A47A`. `python tools/disasm_cok.py resolve 0xfd 0x2a`
resolves this public overlay entry to descriptor 26, procedure `0x3E2`,
`GAME.OVR` file offset `0x3B221`. The target is the shared linked-list
selector. Its caller passes `SS:BP-3` as the helper's far output byte (argument
at helper `[BP+6]`); the helper clears it on entry and sets it on accepted
selection paths. Escape follows its own exit path. On return the caller
redisplays while `[BP-3]` is nonzero; otherwise it validates the returned AL
against the accepted command table at `CS:0x36AC`, passes `DS:6096/6098` to
the character consumer at `0xE6:0x2A`, and returns a Boolean that is true only
for command `S`.

At the captured status boundary, the no-key queue remains empty; `DS=1BC6`,
`DS:6096/6098` points to first held node `6109:0000`, the six-node chain
remains intact, and `DS:8846` is zero. The retained JSON does not include
`DS:6E0F`, so the numeric selector row is not evidenced there. Static mapping
does not tie selector rows to all six names or identify the first ECL
assignment. No key was consumed for this audit and no save changed. Task 120
closes bounded here; no DOSBox or GUI.

### Task 121 result — default held-character selector action

The next bounded replay appended exactly one Enter to Task 119's already
consumed P/H/Enter sequence. That Enter was read at instruction 27,612,439.
The first subsequent higher-level no-key input boundary is instruction
28,113,021, runtime `1614:03C3`; its live frame contains `Modify Character`
and `Add Subtract Keep Exit`. The caller return is `4A14:2B00`, which resolves
through descriptor A4 to file offset `0x22D09`, immediately after the caller's
`0xFD:0x2A` selector call at file offset `0x22D04`. At the validated game
segment `DS=1BC6`, `DS:6096/6098` remains `6109:0000` (Sir StrongSword, the
head of the held chain) and `DS:8846=0`. This proves the Enter-to-next-menu
transition with the first held character still current; it does not prove an
ECL assignment or campaign entry. The capture is
`build/cok-task117-load-save/menu-after-key-10.json`. The older
`first-ecl-assignment.json` is not evidence for this pass: it is the earlier
PSP-segment false positive and was not rewritten. The extended BP chain adds
the caller return `4A14:03D1` -> file offset `0x205DA`; preceding dispatcher
bytes at `0x205CB` compare AL with `M` and call `0x22B03` (the Modify Character
procedure). This proves the branch is character modification, not Begin
Adventuring; the selected row claim from Task 119 is withdrawn. No save
changed; no DOSBox or GUI was used.

### Task 122 result — Modify Character exit returns to function selection

The next live prompt is `Modify Character` with options `Add`, `Subtract`,
`Keep`, and `Exit`; the stack also contains `Modify: AC HP`. Static bytes at
`GAME.OVR:0x22AED` contain `Add Subtract Keep Exit`; the selector call at
`0x22D04` returns at `0x22D09`. Its caller dispatches `S`, `P`, `H`, and `G`
branches, and the `S` path consults the current party record through
`DS:6096/6098`. The loop initializes `[BP-0x37]` to 1 before calling the
selector at `0x22D04`; it checks that local against 6 for its separate
direct-input branch. When `[BP-0x37]==6`, returned AL=`E` restores the saved
six ability bytes, AC and HP, refreshes runtime HP byte `+0x197`, calls
`0xE6:0x43`, clears `DS:7141`, and returns at `0x23937`. The bounded replay
sent five P keys, E, then A, with no later keys. It reached another no-key
`Choose a FUNCTION` boundary at instruction 28,540,743, runtime
`1614:03C3`; the caller chain includes `417E:15D2`. At validated `DS=1BC6`,
`DS:6E0F=1`, current party is still `6109:0000`, and `DS:8846=0`. Thus the
editor's Exit returns to function selection; the following A did not reach
adventuring or assign an ECL. No save changed. Capture:
`build/cok-task117-load-save/menu-after-key-17.json`.

### Task 123 result — held-party function menu inventory, navigation unresolved

Static `GAME.OVR:0x203E2` counts enabled entries in the 13-slot table at
`DS:0x878`, allocates a linked selector, then calls the shared selector at
`0x2056D`. A focusless capture at the held-party function menu records the
table strings and enable bytes: Create New Character (enabled), Drop
Character (enabled), Modify Character (enabled), Train Character (disabled),
Knight Change Classes (disabled), View Character (enabled), Add Character to
Party (enabled), Remove Character from Party (enabled), Load Saved Game
(disabled), Save Current Game (enabled), Begin Adventuring (enabled),
Initialize Mouse/Joystick (disabled), and Exit to DOS (enabled). The live
enabled row order is therefore table slots 0, 1, 2, 5, 6, 7, 9, 10, and 12.

The shared helper initializes one-based `DS:6E0F` to 1, and the live selector
capture also has `DS:6E0F=1`; this identifies the first enabled row as current
at that boundary. The earlier H/P-as-row-navigation claim is withdrawn: the
`0x3C411` H/P branches call viewport helper `0x3C0D2` with argument 0/1.
Seven P keys then Enter reached the character picker rather than the
adventure route. A separate one-M replay returned to the same no-key
`Choose a FUNCTION` boundary with `DS:6E0F=1`, so it does not prove that M
navigates this particular list. A seven-M batch followed by Enter also reached
a character picker and is not evidence for the Begin Adventuring row. No ECL
was assigned and the held saves remain unchanged.

The one-M replay reached instruction 28,554,986 at key index 18, with no key
pending. Its frames were `1614:03C3 -> 417E:15D2 -> 4A14:0369 -> 1000:01FD`;
the validated game group had current party `6109:0000`, `DS:6E0F=1`, and
`DS:8846=0`. Its local capture was overwritten by the later K replay. The
enabled table and raw bytes are retained in
`build/cok-task117-load-save/menu-after-key-18-one-k.json`; the seven-P result
is in `menu-after-key-25.json`. Task 123 closes at this bounded inventory.
Task 124 is active to capture candidate navigation keys and join their state
to the selected linked-list entry and dispatcher byte. A later single-K
replay reaches the same no-key boundary at instruction 28,554,986, with
`DS:6E0F=1`, `DS:8846=0`, and the same frames. Its capture is
`build/cok-task117-load-save/menu-after-key-18-one-k.json`. Thus neither the
one-M nor one-K probe demonstrates row movement in this caller. No DOSBox or
GUI.

### Task 124 follow-up — Down-arrow candidate

A focusless replay added one BIOS extended-key value `0x5000` (Down arrow)
after the single-K probe. The selector consumed it at instruction 28,568,995
and returned to the same no-key function-menu boundary at instruction
28,587,953. `DS:6E0F` remained 1, `DS:8846` remained zero, the enabled-entry
table was unchanged, and the `DS:8A1` text buffer still held `Drop Character`;
this candidate did not establish row movement. No Enter
followed the arrow. The capture is
`build/cok-task117-load-save/menu-after-key-19.json`. This remains a bounded
negative for one key and does not close Task 124. No DOSBox or GUI.

Static caller resolution gives the exact generic selector entry: the function
menu call at `GAME.OVR:0x2056D` is `FD:0x34`, resolved by
`python tools/disasm_cok.py resolve 0xfd 0x34` to descriptor 26,
`GAME.OVR:0x3C1A7`. That procedure initializes `DS:6E0F=1` at `0x3C20D`,
then calls its keyboard/event helper at `0x3B221`. Its visible H/P and
conditional I/Q/P/N branches dispatch to viewport/list helpers
`0x3C0D2`/`0x3C040`; this does not identify the key or event that selects a
different function entry. Task 124 therefore remains open at the per-key
selection contract; do not infer a safe adventure command from the generic
selector alone.

A further focusless replay added the source-identified `N` list command
(`AX=0x314E`) after the Down-arrow probe. It was consumed at instruction
28,601,927 and returned to the no-key boundary at instruction 28,602,161.
`DS:6E0F` remained 1 and `DS:8846` remained zero; no dispatcher action or ECL
assignment occurred. Capture: `build/cok-task117-load-save/menu-after-key-20.json`.
This does not close Task 124.

### Task 124 active — isolate function selector row movement

Start from Task 122's reproducible `Choose a FUNCTION` boundary. Capture the
one-based row state immediately before and after one candidate key, then
identify the selected list entry and returned dispatcher byte. A single M
probe and a single K probe each returned to the same no-key boundary at row 1;
the seven-M batch reached a character picker. The common selector's K/M
branches modify `DS:6E0F` in their own caller, but these runtime observations
do not prove those keys move this function menu. Distinguish viewport movement
from selection and direct dispatch before sending a route key. Task 110 still
needs the runtime ECL1#34 predicates and exact ECL1#33 buffer. No DOSBox or
GUI.

The selector disassembly at `GAME.OVR:0x3C425..0x3C469` identifies `I`/`Q`
branches: `I` calls page-offset helper `0x3C040` with direction 0 only when
previous-page flag `[BP-0x86]` is set; `Q` calls it with direction 1 only when
next-page flag `[BP-0x85]` is set. A focusless Unicorn replay consumed one
source-mapped `I` (`AX=0x1749`). Immediately before the BIOS key read,
`DS:0x6E0D` was 0, `DS:0x6E0F` was 1, and `DS:0x8846` was 0. At the returned
no-key boundary, `DS:0x6E0D`'s word remained 0, `DS:0x6E0F` remained 1, and
`DS:0x8846` remained 0. This does not establish a selected-row transition or
dispatcher result; Task 124 remains open. No save bytes changed, DOSBox, or
GUI.

Caller/callee argument mapping closes the I/Q option question. At
`GAME.OVR:0x20555..0x2056C`, the selector caller pushes zero as the byte at
callee `[BP+0x12]`; the two following words at `[BP+0x14/+0x16]` are the
nonzero string far pointer. The callee's I/Q page-scroll path at
`0x3C425..0x3C469` is reachable only when `[BP+0x12] != 0`, so I/Q are disabled
for this function-menu call. The earlier I and Q no-op captures are therefore
expected and do not test row movement. A source-mapped Q (`AX=0x1051`) replay
also returned to the same boundary: pre-key `DS:0x6E0D` word 0,
`DS:0x6E0F=1`, `DS:0x8846=0`; post-key all three values were unchanged.
Task 124 remains open only for the enabled keys' row/selection/dispatcher
contract; no route action was sent. No DOSBox or GUI.

### Task 124 follow-up — capture the K input stack and filtered-candidate count

A shortened focusless replay reused the existing held-save route through one
BIOS K word (`AX=0x254B`) and stopped at the next no-key function-menu input
boundary. BIOS consumed K at `1962:031F`, instruction 28,554,752. The captured
stack has an inner selector frame at `SS:BP=2491:3BEC`, returning to
`417E:15D2` (the selector continuation after its call at `417E:15CE`); its
`[BP-0x92]` byte is `1` and `DS:6E0F` is still `1`. Static caller bytes at
`GAME.OVR:0x3C1A7..0x3C40E` copy two 40-byte arguments and pass them to the
shared helper at `0x3B221`. That helper passes its second copy through
`0x3AF19`, which filters candidate positions from the supplied control string
and writes the accepted count to the helper frame's `[BP-0x92]`. It is not the
visible menu row count from Task 123. The helper's K/M update path at
`0x3B414..0x3B45F` is skipped when this count is at most one. The outer caller
at `0x20578` later loads the selected linked-list node's command byte from
`ES:[DI+1]`; this is separate from the helper count. The child frame at
`SS:BP=2491:3B48` returns to `417E:05BD`. Capture:
`build/cok-task117-load-save/selector-k-input-boundary.json`.

The instrumented K/M row-update site, source `GAME.OVR:0x3B41B` and runtime
`417E:05DC` under the Task 114 code-window mapping, did not execute in this
K replay. The captured filtered-candidate count of 1 means this helper
invocation cannot take its K/M row-update branch; it does not explain the nine
enabled function rows listed by Task 123. The first `0x614:0x25B` return value
was not captured. A separate focusless replay consumed BIOS words Down
(`0x5000`) then M (`0x324D`) at instruction 28,554,752 and 28,587,684; the
next no-key boundary at instruction 28,587,918 still has `DS:6E0F=1`.
Captures: `build/cok-task117-load-save/selector-input-key-17.json`,
`build/cok-task117-load-save/selector-input-key-18.json`, and
`build/cok-task117-load-save/menu-after-key-19.json`. This still does not
establish the selected linked-list record, returned dispatcher byte, or
dispatcher action. Keep the route key gated. The ignored runner
`build/cok-task117-load-save.py` contains trace-only hooks; no retail file or
save was changed. No DOSBox or GUI.

Static input-service map: `GAME.OVR:0x3B3F7` calls VROOMM `614:25B`, mapped to
unpacked START image `0x639B`; that path polls through `962:2FD` / image
`0x991D` and retrieves a byte through `962:30F` / image `0x992F`, then calls
`0x9763`. START `0x992F` returns a pending scan byte from `DS:8A55`, or reads
BIOS input; for an extended key it buffers AH when AL is zero, so the following
service call may return the scan byte. When BIOS returns AX=0 it substitutes
AL=3. START `0x9763` preserves AL on its ordinary path when `DS:8A56` is zero;
its nonzero path drains pending input and enters the `^C` / INT 23h break
recovery path. This maps possible return behavior but does not establish the
first runtime AL returned to the selector on either replay key.

### Task 111 progress — dependent GEO loader and consumer join

No Task 111 runtime capture exists yet. The source contract is bounded by
Tasks 103–104: ECL1#33 requests GEO 32 at `0x802E`; the native loader copies
four planes to `DS:6D7C`; and the mapped `EA67` consumers read through that
symbolic field. Task 74's source-composed fixture uses GEO1#34 and a substituted
helper result, so it cannot close this task. Begin only after Task 110 proves
ECL1#33's runtime identity, then capture the loader's real resource/member and
same-allocation consumer reads. No DOSBox or GUI.

### Task 67 result — CoK `NEWECL` handler — 2026-09-27

The CoAB `commandTable` shape was matched against CoK's own `GAME.OVR`; the
best dispatcher candidate is file offset `0x41D9`, size `0x270`, 293 decoded
instructions, token similarity `0.9914` and trigram Jaccard `1.0000`. Its
opcode `0x20` row points to handler file offset `0x1606`. This is an
advisory structural match corroborated by the handler's operand-fetch and
state-update sequence, not a runtime trace.

At `GAME.OVR:0x1606..0x165F`, the handler bytes decode as:

```text
160C  mov al,1 ; lcall 4E:2A         ; fetch one NEWECL operand
1614  mov al,[8846]                 ; current EclBlockId
1619  les di,[4B28]
161D  mov es:[di+1E4],ax            ; LastEclBlockId := departing EclBlockId
1622  mov al,1 ; lcall 4E:25         ; fetch destination block ID
162A  mov [bp-1],al
1630  mov [8846],al                 ; current EclBlockId := destination
1636  push ax ; lcall 4E:34
163C  lcall 4E:2F                   ; load/update ECL state
...
1657  lcall A46:1661                ; copy helper; unrelated to entry address
165F  retf
```

The `0x8846` global and struct member are independently identified for CoK in
`cok-demo-entry-located.md`: new-game and demo constants write that global,
the continuing-game path copies `area_ptr+0x1E4` back to it, and CoK/CoAB
share that numeric field offset. Thus for an invocation whose departing
`EclBlockId` is 34, this handler writes 34 to the `LastEclBlockId` field
before it sets the current block to requested target 33. The block-33 entry
guard compares 34 with 33, so it does not take its early EXIT; the later
comparison with 34 can pass if execution begins at that block's ordinary
initial entry.

The handler bytes show the target ID is installed and call the ECL load/update
helpers, but this source trace alone does not identify the interpreter resume
address or prove the script conditions leading to `NEWECL #33`. Task 67 closes
at this bounded handler/state-update result. Task 68 below closes the static
interpreter resume address; condition inputs and runtime execution remain
open. No DOSBox, GUI, or runtime trace was used.

### Task 68 result — static `NEWECL` interpreter resume — 2026-09-27

The handler's chain flags and the caller establish the static resume path.
`GAME.OVR:0x1606` loads the target with `4E:34`, resets/parses it through
`4E:2F`, then sets `[0x43B8]=1` and `[0x43B9]=1`. The interpreter loop at
`0x4449` tests `[0x43B8]` and returns when set. Its caller at `0x4594` tests
`[0x43B9]`; when nonzero, it calls restart routine `0x44B3` at `0x469E`.
That routine clears `[0x43B9]` at `0x44CA` and calls `0x4449` at
`0x44F8` with `[0x4B41]` as the entry argument.

The reset/parser routine `GAME.OVR:0x8C29` initializes the ECL cursor to
`0x8000`, reads five entry values through `0x8A73`, and stores them in order
at `[0x4B39]`, `[0x4B3B]`, `[0x4B3D]`, `[0x4B3F]`, and `[0x4B41]`. The ECL
header schema identifies the fifth pointer as `ecl_initial_entry`. Retail
`daxdump_extracted/ECL1_033.bin` begins with header values ending in
`14 80`, so the fifth pointer is `0x8014`. This establishes the entry pointer
passed into the interpreter after a target switch.

Task 68 closes at this static resume-address boundary. It does not establish
the conditions that reach `NEWECL #33`, whether `0x8014` execution follows a
particular bytecode route to `0x804E`, production segment identity, a composed
FDF2 call, or any effect-7 callback input/result. Task 69 below maps the
condition operands to their native backing fields and source-level producers;
their values on a composed invocation remain unknown. Static/focusless only;
no DOSBox or GUI.

### Task 69 result — bounded ECL transition predicate sources — 2026-09-27

Retail `ECL1#34` header bytes identify `vm_run_1=0x8094`,
`SearchLocation=0x81DE`, and `ecl_initial_entry=0x8014`. The SearchLocation
listing at `0x8094..0x80B5` decodes to these source operations:

```text
raw member offset 0x96:  2F 00 3F 01 4F C0 01 79 7F
  AND #63, [0xC04F] -> [0x7F79]       ; mapWallRoof selector
raw member offset 0x9F:  03 01 D5 7E 00 01
  COMPARE [0x7ED5], #1                ; tried_to_exit_map
raw member offset 0xB0:  03 01 79 7F 00 22
  COMPARE [0x7F79], #34
raw member offset 0xB6:  20 21
  NEWECL #33
```

The `IF_NE` at virtual `0x80A3` skips to `0x80C1` unless
`[0x7ED5] == 1`. If the flag is 1, bytecode compares the masked selector
`[0x7F79]` with 34; `IF_EQ` at `0x80B4` guards `NEWECL #33` at `0x80B5`.

CoK `GAME.OVR` routes ECL memory addresses `0x7C00..0x7FFF` through class 1
in `0x9159`. Its ECL read helper at `0x9A0B` and word-write helper at
`0x9B79` use `0x921A` to special-case named fields; the fallback reads/writes
through the area-state pointer `[0x4B2C]` at displacement
`0x0800 + 2*address` (modulo 16 bits). For `0x7ED5`, that displacement is
`0x05AA`. Thus this ECL operand aliases the word at `area2_ptr+0x5AA`.

The direct producer is CoK routine `GAME.OVR:0x19A2A`, called at `0x19EA9`.
It clears `ES:[DI+0x5AA]` through `[0x4B2C]`, checks the attempted direction
with `0x10B:0x2F`, then on that call's nonzero branch sets the word to 1 at
`0x19A8B`, `0x19AA1`, `0x19AB7`, or `0x19ACD` when candidate X/Y is outside
`0..15` and clamps
the corresponding `DS:6D85/6D86` coordinate to the boundary. The caller then
calls `0xE6:0xDE`. This establishes the native source-level edge flag update;
the accepted input/direction and whether this invocation reaches that caller
remain unknown.

For selector input, CoK's ECL memory reader at `0x9A0B` treats address
`0xC04F` as special and returns `DS:0x6D89` (`0x9B5C..0x9B64`). The map
refresh routine at `0x19AD8` calls `0x10B:0x34` at `0x19B68` with current
`DS:6D85/6D86` and stores its result at `DS:6D89`. That selector resolves to
`GAME.OVR:0x3DA3B`, which reads the backdrop byte from
`ES:[DI+0x200]` through map-buffer pointer `[0x6D7C]`. `Load3DMap` at
`0x3E5A3` fills that buffer from four GEO planes, including the plane at
`+0x200`. The `0x7ED5` and selector producer chains are therefore source-mapped
to CoK state and its map buffer. The runtime GEO block, pointer/segment
identity for a composed call, actual flag/selector values, and ECL execution
remain unproven. Task 69 closes at this bounded source boundary; Task 66
continues the resource-instance join. No DOSBox or GUI was used.

### Task 125 active — Begin Adventuring source route — 2026-09-27

The held-party menu dispatcher at `GAME.OVR:0x203E2` consumes the selector
result from `ES:[DI+1]` (`0x20578`). Its `B` branch is at
`0x206BB..0x20760`: it checks the enabled flag at `DS:0x0A45`, sets
`DS:0x8985=1`, requires a party head or the alternate `DS:0x4B4B` state,
stores the selected command byte from `[BP-0x10]` at `DS:0x4B49`, checks
`DS:0x4B52`/`DS:0x6E00` and workspace fields, calls `0x128:0x242` (or
`0x128:0x344` on its alternate branch), calls `0xE6:0x2A` with the current
party pointer, then calls `0xFD:0x2F` and returns from the menu routine.
`FD:0x2F` resolves to the small wrapper at `GAME.OVR:0x3BABA`, which calls
`0x521:0x30A`; it does not contain an ECL block assignment.

The caller frame captured at the selector boundary returns to `START.EXE`
runtime `1000:01FD` (image offset `0x01FD`). The caller code after that point checks `DS:0x4B49==3`; on that
branch it checks workspace `DS:4B28` member `+0x270`, calls `0x128:0x344` or
`0x128:0x242`, and passes the current-party far pointer to `0xE6:0x2A`. The
START image continues through `0x3E:0x2A`, `0x61:0x2A` (resolved by validated
selector geometry to `GAME.OVR:0x108DB`, a startup-state initializer), and
`0x61:0x2F`. After the intervening setup calls, `START.EXE` image offset
`0x02CE` calls
`0x3E:0x25`; the validated resolver maps that public stub to descriptor 2,
procedure offset `0x3C28`, `GAME.OVR:0x4594` (the CoK ECL entry switch). The
captured far-return address at `1000:01FD` plus this static caller chain
establish the route edge from the held-party selector back into that switch.

That switch is independently source-mapped at `GAME.OVR:0x45D5..0x4611`:
when `DS:0x4B28` member `+0x1E4` is zero, `DS:0x4B4B==0` selects ordinary
new-game block 36 and writes it to `DS:0x8846`; a nonzero demo flag selects
block 57. Block 36 is present in `ECL1.DAX`; its header's fifth entry pointer
is `0x8014`. The held-party selector boundary snapshot has `DS:0x4B4B=0`,
matching the ordinary new-game branch. Task 126's no-key capture at instruction
28,630,647 resolves `DS:4B28` to `5091:0000` and reads `area_ptr+0x1E4` as
`0000`, so both switch predicates are satisfied at this held-party boundary.
Actual installation of block 36 and entry at `0x8014` remain unobserved. Task
124 still gates any B input and any Unicorn route replay. No DOSBox or GUI.

### Task 126 result — held-party `LastEclBlockId` switch condition

The existing Task 117 JSON captured the global `DS:4B28` slot but did not
include the pointee. One bounded focusless Unicorn replay followed the original
held-save load and stopped after Q at the no-key function-menu boundary, with
no route action. At instruction `28,630,647`, the captured far pointer was
`5091:0000`; its `+0x1E4` word was `0000`. Together with the Task 125 boundary's
`DS:4B4B=0`, this satisfies the `GAME.OVR:0x45D5..0x4611` block-36 switch
condition for this state. This does not observe block 36 being installed at
`DS:8846`, prove the runtime ECL buffer/member identity, or reach entry
`0x8014`. Field writer provenance remains outside this bounded task. Capture:
`build/cok-task117-load-save/menu-after-key-22.json`. Task 126 is closed
bounded. No DOSBox or GUI.

### Task 66 result — `Files(GEO 34)` source path to map-buffer contract — 2026-09-27

The retail ECL1#34 bytes at raw member offset `0x2A` encode `LOAD FILES` with
GEO block ID 34. CoK's ECL dispatcher candidate at `GAME.OVR:0x41D9` compares
opcode `0x21` at `0x4300` and calls shared handler `0x1660` at `0x4309`.
Handler `0x1660` fetches its three operands through `4E:2A` / `4E:25`; operand
1 is held at `[BP-3]`. On the `0x21` branch, if the GEO ID is neither `0xFF`
nor `0x7F` and workspace `+0x1CC` is nonzero, it stores that ID to
`area_ptr+0x18A` and passes it to `0x10B:0x43` at `0x16CD`.

The repository's VROOMM resolver maps `0x10B:0x43` to
`GAME.OVR:0x3E5A3` (`Load3DMap`). That routine constructs the `GEO%d.DAX`
family from `DS:0x5782`, calls external `0x69C:0x88E`, and copies four
0x100-byte planes from the returned block into `DS:6D7C`. Separately,
`EA67 -> E522`'s resolved map selectors read `DS:6D7C`; `0x10B:0x34` reads
the backdrop plane at `DS:6D7C+0x200`. This ties the script opcode to the
loader and the symbolic consumer-buffer field in CoK code.

The same runtime allocation is not proven: the observed VM decode does not
establish that opcode `0x21` ran, the external block helper's ID-to-member
mapping is unresolved, and the runtime DS value/segment identity at the loader
and `EA67` have not been captured. The VROOMM inventory lists the 0x69C
segment fixups as `unresolved_relocated_segment`; resolving that external
segment and helper entry is Task 70. Task 66 closes only at this explicit
source boundary. Static/focusless only; no DOSBox or GUI.

### Task 129 result — bounded map-direction selector into placement — 2026-09-27

The `ECL1#33` save at virtual `0x8065` carries raw value `2` to host address
`0xC04D` (`mapDirection`). The retail host setter at `GAME.OVR:0x995A..0x99DA`
normalizes the address against `0xBF68`; offset `0xE5` selects the direction
case. Its value cases map 0, 1, 2, 3 to `DS:0x6D87` values 0, 2, 4, 6,
respectively. Therefore this script operand supplies selector 4 if that setter
invocation is reached with the relevant game DS.

At `GAME.OVR:0xF991`, `0xF9D2..0xF9D9` copies `DS:0x6D87 / 2` (2 for this
selector) to scratch `DS:0x45E2`. `0xF9EB..0xFA0A` and
`0xFA1C..0xFA3B` index `DS:0x1ED6/0x1EDF` using the full selector and pass the
signed deltas through helper `0xA46:0xA14`, combining them with
`DS:0x4B2C+0x582` extent values into local candidate offsets. At selector 4,
the table contributes `(0,+1)`. F991 then builds its `DS:0x43CC` candidate
grid using formation dimensions, and its per-member pass calls `0xF513`,
which delegates candidate bounds/footprint handling to `0xF3C6`; selected
coordinates are written to `DS:0x623F/0x6240` by that later helper.

The same selector table is also read by `GAME.OVR:0x19B9A..0x19C51` to update
`DS:4B28+0x186/+0x188`, clamping the pair to `0..0x25` / `0..0x0E`. If that
routine receives `(9,0)` and selector 4 in the same memory instance, its
result is `(9,1)`. This conditional arithmetic is not evidence that F991 uses
that pair as a final member coordinate: F991 consumes its own extent and
formation/occupancy inputs, and F3C6 chooses the final grid coordinate. The
two code paths' common runtime DS and invocation have not been captured.

Task 129 closes at the bounded source mapping from ECL literal 2 to selector
4 and F991's direction-dependent candidate offset. Task 63 remains active:
the ECL branch, setter invocation, DS identity, FDF2 call, extent/formation
inputs, and resulting F991 coordinate are not joined in a production run.
No fixture coordinate is justified by this mapping. No DOSBox or GUI was used.

### Task 130 result — absolute selector-writer census — 2026-09-27

`python tools/disasm_cok.py xrefoff 0x6d87` reports 69 absolute-immediate
references in held `GAME.OVR`. Classifying the store encodings yields 17
absolute `DS:0x6D87` write instructions in four groups: four ECL host-setter
cases at `0x999C/0x99A8/0x99B4/0x99C0` write selectors `0/2/4/6` from host
values `0/1/2/3`; two initialization sites at `0x1058A` and `0x109B5` write
`0` and `2`; eight key-to-selector cases at `0x1A091..0x1A0DE` map
`H/I/M/Q/P/O/K/G` to `0..7`; and three map-choice updates at
`0x19ECF/0x19F16/0x19F64` add `4/6/2` modulo 8 for `P/K/M`. The last three
paths then pass the selector with `DS:0x6D85/0x6D86` to the direction-aware
map helpers. The `0x3D675` reference is a comparison, not a store; remaining
absolute references are reads or passed inputs.

Task 130 closes only this direct absolute-reference writer census. The xref
does not rule out an indirect alias write through a computed pointer, and it
does not establish which writer populated a production FDF2/F991 invocation.
Task 63 retains that runtime join. Static/focusless only; no DOSBox or GUI.

### Task 131 result — saved selector buffer read/write — 2026-09-27

The alias audit found a file-buffer path that is invisible to the direct
absolute-store census. `GAME.OVR:0x1F20F` is the `Load Saved Game` routine
already identified by Task 117. At `0x1F47D..0x1F48C`, it passes `DS:0x6D85`
and length 5 to resident `A46:0x14B4`. The resident entry resolves to unpacked
`START.EXE` image offset `0xA460+0x14B4=0xB914`; it selects DOS `INT 21h/AH=3Fh`
and uses the passed buffer as the read destination. The same load routine's
held runtime capture is already recorded in `build/cok-task117-load-save`:
the `SAVGAMA.DAT` read at file position 5121, length 5, wrote to
`1BC6:6D85`; the held bytes at that file position are `07 0D 00 00 00`, so
the loaded selector byte `DS:6D87` was 0 for that save. This is saved-file
state, not the conditional ECL1#33 setter's later selector 4.

The corresponding save path at `GAME.OVR:0x1FC9C..0x1FCA9` passes the same
five-byte `DS:0x6D85` span and calls resident `A46:0x14BB`, which resolves to
`START` image `0xB91B` and selects DOS `INT 21h/AH=40h`. Thus both file-load
and file-save code use a far pointer to the selector-containing block; neither
adds another direct absolute store instruction to the Task 130 census.

Task 131 closes at this bounded serialized-state producer/consumer pair and
the held-load byte capture. It does not establish the source file or runtime
DS for the later ECL1#33 branch/FDF2 invocation, nor exclude every possible
indirect alias elsewhere in the overlay. Task 63 retains that join. No new
DOSBox or GUI session was used.

### Task 124 progress — source of the selector key return — 2026-09-27

The selector's `lcall 0x614:0x25B` at `GAME.OVR:0x3B3F7` resolves by its
load-image paragraph/offset to unpacked `START.EXE` image `0x639B`. That
routine calls `0x962:0x2FD` (image `0x991D`) to check key availability, then
`0x962:0x30F` (image `0x992F`) to obtain a key. For an ordinary non-Enter
key, its return path copies the local key byte back to AL at image
`0x64F5..0x6501`; therefore a BIOS `K` reaches the selector as AL=`0x4B` if
this path is taken. Enter (`0x0D`) and Escape (`0x1B`) have separate branches.

The existing K capture records BIOS consuming `0x254B` at runtime
`1962:031F`, corresponding to START image `0x993F` inside the second helper.
At the saved no-key boundary that same keyboard helper is polling again, and
`DS:6E0F` is still 1. This confirms K did not yield a function-menu command or
move the captured row in that replay; it does not identify a selected list
node or dispatcher byte. The filtered-candidate count 1 still bypasses the
selector's special K/M row-update block at `0x3B414..0x3B46A`. Task 124 remains
active for an enabled selection key, exact selected list entry, and returned
dispatcher result. Do not send a route key before that contract is resolved.
Static START/OVR bytes and existing focusless artifacts only; no new DOSBox or
GUI session.

Further Task 124 source detail: GAME.OVR 0x3B993..0x3BA4F first checks the
key against the CS:0x3A2 bitset using resident A46:0x0D79 (START image
0xB1D9), then searches the selector's second 40-byte text argument for that
key. In the saved K frame the copied prompt strings are "Choose a FUNCTION"
and "Select 1!"; the filter count is 1. K passes the printable-key bitset,
but it is absent from "Select 1!", so the accepted-key flag remains clear
and the helper loops to request another key. The same source test excludes M
from that string. This explains the K no-op without treating the filtered
count as the visible nine-row list length. The K/M row-update block is still
gated by count greater than one and was not reached. No selected list node or
dispatcher byte results from this input.

Task 124 static join: `GAME.OVR:0x203E2` copies 40 bytes from each enabled
`DS:0x878 + slot*0x2A` record into its allocated list node, leaving the next
link at node+0x2A. `0x3AE4E` indexes that list zero-based from
`DS:0x6E0F - 1`, and caller `0x20578` reads node+1 as the dispatcher byte.
The held capture has row 1, selecting table slot 0. Its raw captured record
starts `14 43`, so the dispatcher byte is `C` (Create), matching the caller's
Create branch. The enabled row order maps table slots 0,1,2,5,6,7,9,10,12 to
rows 1–9. Thus Begin Adventuring at slot 10 is row 8 and its record starts
`01 42`, dispatcher `B`. The raw bytes are in
`menu-after-key-18-one-k.json` (`option_table_hex`); the enabled order is in
`option_flags`. This is a static row/list/dispatcher join, not a runtime
selection or authorization to dispatch a command.

The candidate-key trace remains bounded: K/M navigation at `0x3B41B` requires
the parsed candidate count `[BP-0x92] > 1`, but this held-menu invocation has
count 1. Its copied prompt is `Select 1!`, despite the nine enabled function
rows. Task 132 traced the two caller arguments separately and Task 124 closes
bounded at the source-backed row/list/dispatcher mapping plus the captured
no-op candidates. No route key, save mutation, DOSBox, or GUI.

Task 132 bounded caller join: `GAME.OVR:0x20522..0x2053B` loads two distinct
40-byte strings from the selector caller's CS-relative data: `CS:0x12A` into
`[BP-0x32]`, and `CS:0x13D` into `[BP-0x3A]`. The held stack capture shows
these as `Choose a FUNCTION` and `Select 1!`, respectively. The call at
`0x2056D` passes them separately to `0x3C1A7`; that wrapper copies them into
`[BP-0x2A]` and `[BP-0x53]`, then calls `0x3B221`. The latter passes
`[BP-0x53]` to parser `0x3AF19` and keeps `[BP-0x2A]` for the display path.
Thus `Select 1!` is the parser's key-specification string, while
`Choose a FUNCTION` is the display heading; neither is derived from the
nine-row linked-list count. The observed parsed count is 1. K and M are not
present in the key-specification string, and the K/M row-update code is gated
on a count greater than one. No source-backed non-dispatching key that moves
the selected row is available in this invocation. Task 124 closes bounded at
the current row/list/dispatcher source join and the observed no-op candidates;
the runtime selected-node pointer and returned dispatcher remain uncaptured.
Task 125 remains gated because this does not provide a safe transition to
Begin Adventuring. No key was sent and no DOSBox or GUI was used.
