# Task 148 — CoK ECL1 block-36 loader runtime boundary

## Source-shaped descriptor-4E fixture

A bounded headless Unicorn fixture maps the retail `GAME.OVR` descriptors,
patches each public procedure stub to its original overlay body, and enters
descriptor `0x4E` procedure `0x34` with block ID 36 and a far-return sentinel.
The fixture uses source-derived selectors `DS:0x5782=1` and
`DS:0x5884=0`, a declared `0x1E00`-byte destination at `7000:0000`, and a
synthetic stack segment. The overlay body builds its own length-prefixed
`ECL` and `.dax` strings and calls the resident helper through its original
18-byte ABI; the helper frame and strings are not manually assembled.

The first run executes the source-shaped caller and helper through two
`FindFirst` attempts for `ECL1.DAX`, opens the retail archive, and scans all
seven TOC entries (63 bytes total, data base 65). Block 36 is the last entry
(index 6), with raw length 415 and compressed length 425. The resolver has not
read that entry's payload, returned an extent
or pointer, or copied bytes into the destination. At the post-TOC allocator
call, the fixture's `DS:0x439A` callback was zero, so execution entered
`0000:0000`; this is a fixture failure, not a retail failure.

## Startup and relocation controls

The diagnosis showed two separate harness controls that must remain explicit.
The unpacked image at physical zero is not equivalent to the normal load at
segment `0x1000`: the resident callback installed at `DS:0x439A` is
`00A9:1A46`, and writing an IVT over physical zero also overwrites the image
prefix. A full relocated image at load segment `0x1000` plus the original
resident initializer correctly returns with `DS=0x1BC6` and installs
`A9 00 46 1A` at `DS:0x439A`. This is a default refusal stub, not a working
allocator: its body at image offset `0xA509` is `XOR AX,AX; RETF 2`, so it
returns allocation failure. Original startup then reaches a callback
installer: START image offset `0x12F` calls VROOMM public entry `0x38:0x20`;
the retail descriptor map resolves it to descriptor 0 procedure `0x00B2`, at
`GAME.OVR` file offset `0x00BA`. That procedure writes offset `0x0025` and
segment `0x0038` to the current DS words `0x439A/0x439C`, replacing the
initializer's default with far pointer `0038:0025`. Under the validated
selector geometry, this points to descriptor 0 public stub 1. **The earlier
raw-file read of that stub as procedure `0x0842` was incorrect; the complete
load image stores `0x0042`, which targets code inside descriptor 0.** The
pointer installation is source-mapped, but its live relocated segment and
callback behavior remain unresolved.
Saved return `10FD:0031` in the first INT-3F route maps to descriptor `0x10B`
procedure `0x0573`, as in the existing Task 76 fixture.

The full-load retries still do not reproduce a successful 4E helper read. An
over-broad segment adjustment corrupted the path inputs; a conservative map
terminated before a helper open; and a two-pass map that redirects relocated
descriptor targets to their synthetic code segments exited at resident
`1A46:01A3` through INT 21h/4Ch with `AL=0xC8`, before any helper open. The
default allocator refusal explains one missing runtime dependency but does not
yet explain every early exit. These retries do not falsify the ECL1.DAX
candidate. The remaining work is to reproduce the retail overlay manager's
procedure and allocator state while retaining descriptor-4E's actual stack
frame, then capture the allocator result, selected payload, destination
bytes, cursor, and dispatcher state. Do not call the candidate payload
verified until those bytes match retail `ECL1.DAX#36`.

## Resident allocator callback source audit

Task 166 begins from the complete unpacked CoK `START.EXE` image, including its
preserved load prefix. Direct references to `DS:0x439A` occur at initializer
`0xA497` and two far indirect calls at `0xA817` and `0xA823`. The initializer
writes `00A9:1A46`; its body at image `0xA509` returns `AX=0`. The callers are
in the resident linked-block allocator path around `0xA768`–`0xA82B`: one call
follows a block-list update and passes zero, while the other passes the stored
size `[0x8CAA]` saved at `0xA76C`. Both push one word before the far call,
matching the default target's `RETF 2`. The latter call follows the check that
the candidate end exceeds the upper bound `DS:0x4390/0x438E`. Its `AL` result
selects branches for `<1`, `=1`, and `>1`; the source establishes those control
flow branches, not their semantic status meanings or runtime values.

### Correction: packed offsets versus complete load-image stub words

The earlier Task 166–170 notes treated procedure words found at raw offsets in
packed `START.EXE` as runtime stub data. That coordinate assumption was wrong.
`tools/vroomm_layout.py` discovered descriptor candidates in the packed file,
but read their procedure words at the same offsets without first mapping the
descriptors into the complete EXEPACK load image.

The complete CoK load image is produced by
`exepack_unpack.unpack_complete_load_image()`. Descriptor 0's header is at
image offset `0x0380`; its public-stub array begins at `0x03A0`. Runtime stub 0
contains `CD 3F B2 00 00`, and stub 1 contains `CD 3F 42 00 00`. Therefore the
procedure words are `0x00B2` and `0x0042`, not `0x0842`. The startup writer at
START image `0x012F` calls `0x38:0x20`, which maps to descriptor 0 procedure
`0x00B2` at absolute OVR file offset `0x00BA`. That procedure writes raw words
`0038:0025` to `DS:0x439A/0x439C`. Its segment immediate at descriptor-0 code
offset `0xB9` is a VROOMM relocation fixup, so the live callback segment still
is not established from static bytes alone.

The corrected public-stub target is descriptor-0 procedure `0x0042`, absolute
OVR file offset `0x004A`. It lies inside descriptor 0's `0x00C4` code bytes
and begins with `55 89 E5`. Its body reads the size argument at `[BP+6]` from
`0x0050`; the remaining function/callee analysis is Task 172. The descriptor
fixup bytes are read after code size is rounded from `0x00C4` to paragraph
boundary `0x00D0`; the `0x000E` fixup bytes end at `0x00DE`. Earlier notes
incorrectly said the fixups ended at `0x00D2` and the callback target was out
of bounds or belonged to descriptor 1. Those conclusions are retracted.

`tools/vroomm_layout.py` now preserves packed discovery coordinates and
matches each record into the complete load image by OVR offset plus descriptor
geometry before reading procedure words. All 35 CoK runtime descriptors match.
The runtime/raw stub audit found changed procedure data in 14 of 35 records;
the corrected report records exact source coordinates. Other descriptor
metadata and the existing selector-geometry routing remain in the same
coordinate systems as before. Task 171 closes at this parser correction and
CoK audit; other supported installs are covered by the generated report and
corpus gate.

## Task 167 — stub dispatch mechanism, corrected

The mapped INT 3Fh handler reads the procedure word immediately after the saved
INT instruction and enters manager routine `0xA238`. After allocation and/or
overlay loading, `0xA2B6` calls `0xA335`. That routine checks the first stub
byte at `ES:0x20`; if it is not `0xEA`, it reads the stub count from `ES:0x0C`,
then rewrites each five-byte stub as `EA <procedure-offset> <segment>`, taking
the segment from `ES:0x10`. For CoK descriptor 0 stub 1, the corrected
procedure offset is `0x0042`, so the rewrite target form is
`ES:0x10:0x0042`. The selected segment contents and callback's runtime
behavior are not established by the rewrite mechanism alone.

## Task 168 — INT 3Fh handler mapping, closed bounded

Retained focusless Unicorn logs record INT 21h/AH=25h installing vector
`3F -> 19F0:02E6` at instruction 98,536 and later dispatching INT 3Fh there.
The retained runner loads the complete unpacked START image at physical
`0x10000`; the vector maps to image offset `0xA1E6`. Its bytes begin with the
handler's register-save prologue. Installer `0x9FD2` sets `DX=0x02E6`, loads
`DS=CS`, and calls DOS with `AX=0x253F`, matching the trace.

At `0xA1F7`, the handler loads the saved interrupt caller pointer from
`SS:[BP+2]`; at `0xA1FA` it pushes the word following the caller's INT 3Fh
instruction. It adjusts the saved IP and enters manager routine `0xA238`. The
manager's loader call at `0xA2AA` uses `DS:0x8A5A`, initialized at `0x9FB5` to
`CS:0x0268`; this entry maps to image `0xA168` and seeks/reads `GAME.OVR`.
This mapping remains valid after correcting descriptor 0's procedure word.
The callback's live relocated segment and runtime inputs remain unobserved.

## Task 169 — descriptor-0 payload boundary, corrected

The handler sets descriptor `ES:0x10` to the allocated segment and loader
entry `0xA168` reads `ES:[8]` code bytes followed by `ES:[0x0A]` fixup bytes.
Descriptor 0 sources OVR file offset `0x0008`, has code size `0x00C4`, and
fixup size `0x000E`. The load routine rounds the code size to paragraph
boundary `0x00D0` before the fixup read; the payload therefore occupies the
code interval `[0x0000,0x00C4)` and fixup interval `[0x00D0,0x00DE)` in the
allocated segment. The corrected procedure target `0x0042` is within code,
corresponding to absolute OVR file offset `0x004A`. No descriptor-1 cross-load
assumption is needed. The actual allocated segment and callback result remain
unresolved.

## Task 170 — allocator argument/list source pass, closed bounded

START image `0xA817` calls the callback with argument zero after updating the
current range boundary at `DS:0x438A/0x438C` and writing the new range node;
the returned `AL` is discarded on this path. At `0xA81F`, the allocator passes
`[0x8CAA]`, the requested size saved at `0xA76C`. This path follows the check
that the candidate end exceeds upper bound `DS:0x4390/0x438E`. The result at
`0xA827` selects observed branches: `<1` returns through `0xA7E2`, `=1`
returns zero `AX` through `0xA7E3`, and `>1` reloads `[0x8CAA]` and retries the
free-list search at `0xA76F`. The statuses' meanings and values remain
unknown. This source pass maps the arguments to nearby list operations but
does not establish their live state; Task 173 continues that join.

## Task 171 — complete-load-image procedure audit, closed bounded

The correction above is implemented in `tools/vroomm_layout.py`. The parser
keeps raw-file candidate offsets, locates corresponding descriptors in the
complete EXEPACK image by OVR file offset and matching code/fixup/stub counts,
and reads runtime procedure words and tags from the matched load-image stub
array. `tools/test_vroomm_complete_image.py` pins CoK descriptor 0's image
coordinates and words and requires runtime stub mapping for all 35 descriptors.
The separate `runtime_*_image_offset` fields retain the source coordinate.

## Task 172 — callback procedure at OVR:004A, closed bounded

`GAME.OVR:0x004A` disassembles within descriptor 0's `0x00C4`-byte code
extent. It establishes `BP`, reserves `0x28` bytes, and compares the far-call
word argument at `[BP+6]` against zero. The zero branch goes to the epilogue;
the byte evidence supports zero/nonzero, not signed nonpositive semantics.
The epilogue loads `[BP-2]` into `AX` and returns with `RETF 2`; where that
word is initialized remains unresolved.

For nonzero input, the procedure copies two length-prefixed messages from
`CS:0` and `CS:0x1D` into stack-local buffers. OVR bytes at absolute file
offset `0x08` contain `\x1CWARNING: Insufficient Memory$`; the second begins
at file offset `0x25` and contains `Insufficient Memory. Exiting Program$`.
The first call, `0xA46:0x0AC4`, maps to complete START image offset `0xAF24`.
Its bytes load source and destination far pointers from the stack, copy the
length-prefixed payload with `LODSB`/`STOSB`/`REP MOVSB`, and return `RETF 4`.
That cleanup leaves the destination pointer and two pushed words for the next
call, `0x521:0x096C`; its code reads those stack fields and returns `RETF 8`.

The callback checks `DS:0x4B27`. If nonzero, it calls `0x9E:0x004D`, copies
returned `AL` into local byte `[BP-3]`, and jumps to the loop check. If zero,
it stores `1` in `[BP-3]`, builds/copies the second message, then calls the
same formatter. The loop repeats while `[BP-3]` is zero. Once nonzero, it calls
`0x614:0`, then returns `[BP-2]` with `RETF 2`. `0x9E:0x004D` maps to
descriptor 17 stub 9, procedure `0x22DE`, OVR file offset `0x1F9B9`; its bytes
start `55 89 E5`. The status meanings and returned word remain unresolved.

## Task 173 — resident callback callees, closed bounded

The complete START image gives image-linear candidates for the three resident
segment:offset pairs under `segment*16+offset`:

- `0xA46:0x0AC4 -> 0x0AF24`: length-prefixed copy helper, ending `RETF 4`.
- `0x521:0x096C -> 0x05B7C`: frame prologue, stack-field reads, nested calls,
  and `RETF 8`.
- `0x614:0 -> 0x06140`: frame prologue, resident state updates and calls;
  its epilogue reaches `RETF` at image `0x061AC`.
- Nested formatter call `0x614:0x025B -> 0x0639B` begins with another frame
  prologue.

The addresses and surrounding instruction streams are coherent under one
image-relative basis. The OVR selector fixups do not prove that basis is the
live relocated segment value, so these remain static candidates. The allocated
callback segment at `DS:0x439C`, current list/range values, and return word
`[BP-2]` were not captured in this static pass. Task 175 later captures fixture
pointer `1038:0025` and a zero-argument callback return of `AX=0x0064`; it does
not establish nonzero-argument behavior, the return word's semantic meaning,
or retail heap/list state. Task 174 audits the earlier retained log. No DOSBox
or GUI was used.

## Task 174 — retained trace audit, closed bounded

The retained `C:\temp\goldbox-task148-4e34-original.log` contains only the
initializer's first ten instructions, INT 3Fh vector setup, unhandled DOS
function 06h byte output, and termination with `AL=0xC8` at instruction 8,816.
It contains no `ALLOC_CB` snapshot, callback argument, `DS:0x439C`, or callback
return `[BP-2]`. Its paired disposable fixture derives VROOMM records from
`unpack()`'s decompressed-only bytes and finds 34 records, omitting descriptor
0. It therefore cannot provide evidence for corrected procedure `0x0042` or
the live callback segment. This audit does not explain the earlier fixture
exit. No DOSBox or GUI was used.

## Task 175 — corrected ECL helper fixture, closed bounded

The disposable fixture now builds its 35-descriptor map from the complete
EXEPACK load image, writes runtime stubs at their physical loaded addresses,
and applies overlay segment fixups as load-segment relocations before mapping
code into synthetic overlay segments. Descriptor 0 runtime stubs are
`0x00B2` and `0x0042`; descriptor `0x4E` stub `0x34` selects code-relative
`0x0361` (OVR file offset `0x08DA2`).

### Callback installation and first call

After the resident initializer establishes `DS=0x1BC6`, the fixture executes
START image `0x012F`, which calls VROOMM entry `0x38:0x20`. Descriptor-0
procedure `0x00B2` writes pointer words `0025:1038` (`DS:0x439A/0x439C` bytes
`25 00 38 10`). This reaches the callback through loaded stub `1038:0025`,
rewritten to far-jump to synthetic segment `8000:0042`.

At the first allocator call (`START:0xA817`), callback entry is
`CS:IP=8000:0042`, `DS=1BC6`, `SS:SP=6000:ED04`, with argument zero at
`SS:[SP+4]`. The callback returns `AX=0x0064` to resident continuation
`1A46:03BB`; that caller immediately discards the value with `POP AX`.

### Payload match

The fixture opens ECL1.DAX, reads its seven-entry TOC (63 table bytes; data
base 65), and selects block 36 (raw length 415, compressed length 425). The
complete decompressed body is 413 bytes after the archive's leading
two-byte field. It matches byte-for-byte at `7000:0000`; the remaining bytes in the
`0x1E00` destination are all zero. The far-return sentinel is reached. This
closes the helper payload boundary and callback's first-call ABI. The
`0x4E:0x2F` dispatcher, `DS:0x4B41/0x4B43`, and `0x4449` return chain remain
unobserved. The disposable runner and log are
`C:\temp\goldbox_task175_corrected.py` and
`C:\temp\goldbox-task175-corrected.log`. No DOSBox or GUI was used.

## Task 176 — startup callback installer, closed bounded

With the complete relocated START image and corrected runtime descriptor stubs,
the source-shaped fixture executes the original START call at image `0x012F`
to VROOMM entry `0x38:0x20`. Descriptor-0 procedure `0x00B2` writes offset
`0x0025` and relocated segment `0x1038` into `DS:0x439A/0x439C`. The helper
fixture then dispatches through that pointer to procedure `0x0042`. This
establishes the fixture's callback-install precondition; it does not establish
a natural retail allocation event or the runtime segment under every startup
path.

## Task 177 — exact payload to first ECL event (active)

Continue from the matched ECL1#36 body and fixture callback pointer. The retail
caller sequence after descriptor-4E procedure `0x34` is `0x4629 -> 0x462E ->
0x4633 -> 0x4638`: helper call, `0x4E:0x2F` / `0x8C29` header initialization,
then `0x4449` event processing. Before executing the parser, source the
workspace inputs it reads at `DS:0x4B2C` and `DS:0x4B28`; stop if their
provenance is absent. If supported, capture the derived cursor
`DS:0x4B41=0x8014`, cursor transitions, and first fetched event byte `0x21`
(opening GEO 127 command). Do not seed the cursor or opcode, inject event data,
or call `0xAEC9` directly. Noninteractive Unicorn only; no DOSBox or GUI.
Stop at the first unsupported workspace, caller frame, resource, or input.

### Configured full-entry continuation boundary

The disposable helper probe `C:\temp\goldbox_task177_probe.py` confirms the
known 413-byte ECL1#36 body match, but it is not a Task 177 continuation: after
the initializer it writes `DS:0x4B34=7000:0000`, clears `DS:0x4B41/0x4B43`,
zero-fills the destination, and directly enters descriptor-4E procedure
`0x34`. Its payload comparison is valid helper evidence; its cursor and caller
state are synthetic.

A separate disposable replay started at the configured complete START entry
using the Task 186 fixture, with only the prior stop at `GAME.OVR:0x10227`
disabled. No key was injected. The run recorded ordinary resource reads
including `SKY.DAX`, `CURSOR.DAX`, and `ITEMS`, then the observer stopped when
execution reached START image `0x0140` at instruction 3,849,182. It did not
reach the descriptor-4E `0x34` caller at `0x4629`, so no parser cursor or first
event byte was captured in this earlier continuation. This is a
configured-fixture route boundary, not evidence that production requires a
particular key or that `0x0140` is an error. Task 189 later continued the
configured no-key route through the original caller and observed demo ECL2#57;
it did not establish the fresh-campaign ECL1#36 route. The extended disposable runner is
`C:\temp\goldbox_task177_continue.py`; its trace log is
`C:\temp\goldbox-task181-preinit.log`. Task 177 remains active at the
campaign-route boundary. No DOSBox or GUI was used.

### Workspace prerequisite result

The corrected disposable fixture's resident initializer finishes with
`DS=0x1BC6`, but `DS:0x4B28..0x4B2F` and `DS:0x4B34..0x4B37` are all zero.
It therefore cannot enter the original header/event path without inventing
workspace pointers. A new source-shaped Unicorn pass replays START image
`0x0110..0x0134` after the resident initializer, then executes the original
entry at `0x0134`; its call at `0x013B` reaches descriptor-`0x61` stub `0x25`
and `GAME.OVR:0x100F3`. The trace stops before the first branch at OVR
`0x1011D`, which reads `DS:0x8986`. At that boundary, `DS=0x1BC6`, synthetic
`SS:SP=0x6000:EDE2`, and `DS:0x8986/0x89CE` both read zero. This replay began
after the resident initializer and therefore does not cover the earlier
complete-entry preinit path. Its write watch saw no writes only within that
limited replay; the zero came from fixture memory, so it is not accepted as
retail state.

Static bytes at OVR `0x101E7..0x10203` show two calls to resident allocator
`0xA46:0x023F`, each requesting `0x0800` bytes; the code would store returned
far pointers at `DS:0x4B28/0x4B2A` and `DS:0x4B2C/0x4B2E`. An exploratory
continuation past the unproven zero guard produced candidate pointers
`75B7:0000` and `7637:0000`, plus event-buffer pointer `76F7:0000`; these are
discarded fixture outputs, not accepted route evidence. Task 178 closes at
the unsupported guard. No header parsing or event dispatch is claimed. No
DOSBox or GUI was used.

### Task 181 — guard writer ordering (active)

The current static direct-writer inventory finds START image branches at
`0x271F..0x2744`: J sets `DS:0x89CE=1` and clears `DS:0x8986`; M sets
`DS:0x8986=1` and clears `DS:0x89CE`; N clears both. OVR has direct stores
at `0x260A1`, `0x26150`, `0x2638E`, `0x26426`, `0x26430`, and `0x269C3`.
Disassembly narrows their conditions: the routine at `0x26097` reaches its
`DS:0x8986` toggle at `0x260A1` only after `FD:0x34` returns `'S'` and the
word at `[BP-0x0D]` is zero. The path at `0x26150` clears `DS:0x89CE` after
calling `0x743:0x72`. The store at `0x2638E` clears `DS:0x8986` after
`0x743:0x51`; the paired stores at `0x26426/0x26430` are reached only when
AX equals 2, then clear `DS:0x89CE`, call `0x743:0x51`, and clear
`DS:0x8986`. The `0x269C3` store sets `DS:0x89CE=1` immediately before a
far return. These are conditional menu/choice paths, not startup
initialization evidence by themselves.

The earlier inventory missed preinit writers in the complete START image.
The EXEPACK entry call at image `0x0076` reaches the long routine beginning at
`0x1F8A`, before the later `START:0x013B` call to `GAME.OVR:0x100F3`. That
routine contains stores at `0x228C` and `0x22D6` to `DS:0x89CE`, as well as the
J/M/N pair at `0x271F..0x2744`. They depend on preceding setup and status
results, so their presence does not establish that a guard write executes on
the traced startup path. The `0x7452/0x7459` writers are called from OVR
`0x10131` after its first guard branch. The `0x7DBF` writer's caller order is
still open. None of these observations establishes retail guard values; do
not infer them from a zero-filled fixture or manually choose a START option.

All six cited OVR writer instructions fall inside the code body beginning at
`GAME.OVR:0x25ED0` and ending at its far return at `0x269CB`. The body starts
by calling `FD:0x3E`; the toggle path later calls `FD:0x34` for its `'S'`
input. Static caller mapping resolves the ordering for the OVR group. START
image `0x013B` calls descriptor `0x61` stub `0x25`, which resolves to
`GAME.OVR:0x100F3`. Later START image `0x01F8` calls descriptor `0xA4` stub
`0x25`, resolving to descriptor 18 procedure `GAME.OVR:0x203BD`; this call is
on the `DS:0x4B4B==0` branch. Inside `0x203BD`, the `I` branch at `0x20766`
checks `DS:0x0A6F`, and only when nonzero calls `0x25ED0` at `0x20772`.
Thus this UI routine and its OVR guard writes are downstream of the first
`0x100F3` guard read in the original START order.

This orders the OVR writer body downstream of the initial guard read, but it
does not order the START preinit writers. A full-entry bounded Unicorn pass
from `1000:003F` stopped after 2,000,000 instructions at runtime
`1962:05F3`, mapped to START image `0x9C13`. START code sets `DS=0040` at
`0x9BD8`, reads the video-controller base from `0040:0063` at `0x9BED`, then
adds six at `0x9BF1` and polls bit 0 through `IN DX` at `0x9C0C/0x9C12`.
The disposable fixture left the BDA word zero, so the loop polls port `0006`.
This is consistent with a missing fixture video-base value, not a key request.
The committed `tools/unicorn_cok_midi.py` initializes `0040:0063=03D4` and
models `03DA/03BA` status reads. Replaying the full entry with that BDA word
and mode 3 reached `GAME.OVR:0x1011D` after 84,668 instructions. Before the
guard read, START's M branch wrote `DS:0x8986=1` and `DS:0x89CE=0` at image
`0x272F/0x2734`; the run injected no key. This closes Task 183 bounded: it
explains the fixture divergence and captures pre-read writes on the modeled
path. It does not prove retail BIOS state or identify the producer of the M
result. Task 184 later traces the fixture's M result to the configuration
buffer; Task 181 remains active on other writer/caller ordering.

### Task 182 — initial DS contents (closed bounded)

START image entry `0x0134` begins with the frame setup and calls
`0x61:0x25 -> GAME.OVR:0x100F3` at `0x013B`; the guard read at OVR `0x1011D`
follows the complete-entry M-branch stores to both guard bytes. The configured
fixture path therefore does not depend on either byte's initial contents.
Initial segment memory for other options/device paths remains unknown; the
zero-filled fixture map is not accepted as provenance.

### Task 183 — preinit video-poll dependency (closed bounded)

At runtime `1962:05F3` (START image `0x9C13`), code sets `DS=0040`, reads
video base `0040:0063`, adds six, and polls input bit 0. The zero BDA word in
the disposable fixture caused polling at `0006`; committed
`tools/unicorn_cok_midi.py` sets `0040:0063=03D4` and models status ports
`03DA/03BA`. With that modeled setup, a bounded replay reached OVR
`0x1011D` after 84,668 instructions and captured pre-read M-branch writes
`DS:0x8986=1/DS:0x89CE=0`. No key was injected. This records fixture behavior,
not retail BIOS state.

### Task 184 — preinit M-result provenance (closed bounded)

The corrected full-entry log records a 64-byte read from `KRYNN.CFG` before
the START M branch writes both guard bytes. The checked-in configuration
begins with option records `E`, `A`, and `M`. A bounded headless observer
captured buffer `DS:0x48C4` as `45 0D 0A 41 0D 0A 4D ...`; at START image
`0x270B`, `BX=6` before relocated resident call `1A46:0x898`. It enters the
START buffered reader at image `0xACF8`, which uses `ES:DI=1BC6:48C4` and
`BX=6`, returns `AL=0x4D`, and advances `BX` to 7. Image `0x2710` stores AL at
`DS:0x4842`, and `0x272B` compares it with M. No key or M value was injected.
This closes bounded for the configured fixture path, not retail startup device
state or other configuration paths.

### Task 185 — configured guard through device setup (closed bounded)

With the sourced M option, the bounded fixture continued through the original
OVR call to START image `0x7430`. It constructs a register block at
`DS:0x4B5A`, requests interrupt `33h` through resident wrapper `0x9C4:0x0B`,
and sets `DS:0x8986` from the returned block. The existing headless fixture
returns `AX=BX=0` for this interrupt; that modeled response is not retail
device evidence. The replay left the post-call register block at
`DS:0x4B5A` as zero, and the START routine cleared `DS:0x8986` at `0x7459`.
The original allocations at OVR `0x101EB/0x101FB/0x1021B` stored fixture
returns `486D:0000`, `48ED:0000`, and `49AD:0000` at
`DS:0x4B28/0x4B2C/0x4B34`. The run stopped at `0x10227` before later
allocations. These values remain modeled device/heap outputs, not retail
evidence; source-backed allocator returns are Task 186.

### Task 186 — workspace allocator under the declared fixture, closed bounded

Resident `A46:0x023F` relocates to START image `0xA69F`; its wrapper passes
byte requests to allocator `0xA768`. That routine rounds to paragraphs, walks
the heap list rooted at `DS:0x4392`, and can call the callback at
`DS:[0x439A]` (`0xA817/0xA823`). Task 176 source-mapped the installer. In the
complete-entry fixture, four callback entries follow it: `DS:0x439A` contains
bytes `25 00 38 10` (`1038:0025`), the rewritten stub reaches synthetic OVR
body `8000:0042`, and each zero argument returns `AX=0` to START image
`0xA81B`, where `POP AX` discards it. No entry to initializer default stub
`1A46:0x00A9` appears in this route log. The nonzero-argument `0xA823` path
was not reached.

The original OVR allocation sites store fixture pointers `486D:0000`,
`48ED:0000`, `496D:0000`, and `49AD:0000` for requests
`0x800/0x800/0x400/0x1E00` at
`DS:0x4B28/0x4B2C/0x4B30/0x4B34`. The cursor advances
`486D -> 48ED -> 496D -> 49AD -> 4B8D`, matching paragraph increments. START
image `0xA48B` seeds `DS:0x4394` after stack/paragraph setup at
`0xA46B..0xA47E`; `0xA48E` copies `ES:[2]` to `DS:0x4390`. The configured
160 KiB reservation and selected fit branch are detailed in Task 187; the
reservation path itself has no direct DOS allocation call.

These are fixture outputs, not retail pointers or proof of MCB/paragraph
ownership. Callback execution uses a synthetic overlay segment; modeled
memory bounds and allocator backing state remain conditional. The fit routine's
`A46:0x029C` result is `DX:AX=000C:8DC0`, but its meaning and producer inputs
remain unresolved; Task 188 owns that query contract. The tracer's
`INT 21h/AH=48h` `alloc_next_seg` behavior is synthetic wherever used. Stop
this bounded trace at the unsupported memory-list state. No DOSBox or GUI.

### Task 187 — overlay-reservation fit decision, closed bounded

Complete-image disassembly and a headless trace from the declared START entry
cover the caller at `0x25FC..0x2631`. The return from `A46:0x029C` is
`DX:AX=000C:8DC0` at `0x2601`; its semantic contract is not inferred. The
`09F0:0x01F2` call returns `AX=6B70` at `0x2608`. Its source at image `0xA0F2`
subtracts `DS:0x437A` from `DS:0x437E` and `0xA15B..0xA167` converts that
paragraph span to bytes, matching `0x6B70` in this fixture. START computes
`0002:8000 - 0000:6B70 = 0002:1490`; the signed high-word comparison at
`0x2618` takes `JL` to `0x2622`, so the 160 KiB reservation is attempted.

At `0xA0A3`, the fixture has `DS:0x437A=206D`, `0x4374=06B7`,
`0x437E=2724`, `0x4390=F000`, `0x4380=0000`, and `0x4382=0005`. It passes
the guards and endpoint bounds, writes `DS:0x4394=486D`, leaves
`DS:0x4362=0000`, and returns `AX=0`. This closes only the declared fixture's
fit decision. The first memory-query result, startup memory geometry, and
retail branch selection remain unresolved; allocator returns are conditional
fixture outputs. No DOSBox or GUI.

### Task 188 — available-memory query contract (closed bounded)

The direct target `A46:0x029C` maps to START image `0xA6FC`. It loads
`BX=0x02B1` and enters the shared range/list calculation at `0xA738`. That
code computes the gap from `DS:0x438A/0x438C` to upper bound
`DS:0x438E/0x4390`, masks the low offset, and calls the near helper at
`0xA711` over the list rooted at `DS:0x4392`. The helper sums each node's
length words at `[SI+4]/[SI+6]` while following far links until the node
segment equals the boundary segment in `DI`. `0xA756..0xA767` normalizes the
resulting value before the far return.

Task 187 captured `DX:AX=000C:8DC0` for the declared fixture but did not
establish its units or input provenance. Source the normalized expression,
ledger those five inputs and the visited list nodes, and explain the captured
result without labeling it conventional-memory availability. The memory/list
state may terminate the task at the first synthetic or unsupported node.

The complete-entry Task 186 fixture was replayed with a code hook at relocated
`A46:029C` (linear `1A75C`) and at its START caller return (`12601`). At query
entry, `DS=1BC6` and the five words at `DS:438A/438C/438E/4390/4392` were
`0000/2724/0000/F000/0000`; the far list head at `DS:4392` was
`2724:0000`, with segment `DS:4394=2724`. The query sets `BX=02B1`, computes
the 32-bit difference `F000:0000 - 2724:0000`, masks the low offset nibble,
and calls `A711` with `DI=2724`. The list helper compares the head segment in
`DS` with `DI`; they are equal, so it returns without reading a node. The
subsequent `ROL DX,4` / masks / add reconstruct the scalar byte span
`0x000C8DC0`, returned as `DX:AX=000C:8DC0`.

This explains the observed fixture result as the configured boundary
subtraction; it does not name the value as available conventional memory.
`DS:4390=F000` comes from the START setup copy of `ES:[2]` at image `0xA48E`.
The lower bound and empty list sentinel are the declared fixture's VROOMM
state; the trace does not prove retail PSP/MCB ownership or a populated free
list. Task 188 closes bounded at that memory-manager provenance boundary.
The focused disposable runner and output are
`C:\temp\goldbox_task188_probe.py` and
`C:\temp\goldbox_task188_output.txt`. No DOSBox or GUI was used.

### Task 189 — configured no-key caller route (closed bounded)

The headless Unicorn event capture records START's `FD:2A` helper returning
`AL=0x44` (`D`) at START image `0x0199`, then the configured demo route. The
original caller at `GAME.OVR:0x4629` passes `0x39` (ECL2 block 57) to the ECL
helper. The header parser returns `DS:4B34=49AD:0000`; the interpreter fetches
first event byte `0x09` (`AX=0x8009`). The event trace is
`C:\temp\goldbox_task177_event_output.txt` (SHA256
`311CA9891F86FB3848C50B5A7F543BCEBD30E5B6CCBD8904BD43DD4399C86BAC`). The
first event byte agrees with byte zero of retail ECL2.DAX block 57. This
capture does not demonstrate full-buffer equality.

The runner manually preloads overlays at synthetic segments, applies its
fixture relocation, and patches public stubs. Thus this is original
START/caller/parser/interpreter execution under a declared Unicorn fixture,
not capture of the original VROOMM loader. The event log's
`NATURAL_ECL36_ENTRY` label is wrong for this invocation: its stack argument
is `0x39` (decimal 57), not block 36. `C:\temp\goldbox_task189_output.txt`
is only an earlier startup-boundary log, not the event trace. The runner and
event output have no immutable paired provenance. This does not prove the
fresh-campaign ECL1#36 route or retail allocator ownership. The Task 177
helper-only probe remains excluded as route evidence because it seeds
`DS:4B34`, `DS:4B41/4B43`, and destination memory. No key was injected; no
DOSBox or GUI was used.

## Task 179 — preserve the corrected helper fixture (queued)

The successful Task 175 runner and log currently live under `C:\temp`. Add a
maintained headless diagnostic under `tools/` that records complete-image
descriptor provenance and all 35 mappings, every synthetic pointer/stack/
overlay bridge, startup callback installation, the first-call frame, and the
exact 413-byte payload comparison plus zeroed destination tail. Label fixture
state explicitly and stop at the existing far-return sentinel on unsupported
dispatch or input. Reproduce Task 175's bounded evidence; Task 177 remains
responsible for interpreting later dispatch. No DOSBox or GUI.
