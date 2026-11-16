# CoK player-icon source contract — bounded trace (2026-10-26)

## Held candidate and explicit-still presentation milestone — 2026-11-05

`apps/web/src/ui/cokAmigaPlayerCandidate.json` now describes a separate charT head5/body1
candidate, retaining the local disk2 archive/cell pins below, unverified retail provenance,
no DOS identity bridge, explicitly unverified palette/composition review, and held runtime,
Restyle and playback admission. Each cell points to its disk-qualified canonical source ID. It is
not an addition to the canonical DOS projection, registry, aliases, fetch plan or asset package.

`cok-amiga-player-candidate.mjs` validates those exact candidate selectors/pins and provides a
hypothesis-only composition model for caller-supplied 24×24 five-bit arrays: OR the four color
planes, OR the independently inverted fifth-plane draw masks, then optionally apply six explicit
palette bytes. No palette bytes are pinned as runtime values. It reads no atlas and authenticates
no supplied pixel-array content. Hand-authored synthetic buffers establish model behavior only,
not that this is the retail compositor or that its pixels match a runtime draw.

`cok-player-presentation.mjs` resolves one explicit still together with its label. Creation
requires an explicit variant0/1 preview selection. Sheet/combat retain DOS source variant0
and the existing admitted primary Restyle still when canonical identity and ready pixels
are present. Unknown identities/modes/consumers and playback requests fail closed; all
Amiga requests retain DOS fallback. Secondary Restyle previews remain held. Consumers
now use the same resolver for selected art/status; no timer or attack hook is introduced.

Focused verification: 15 Node synthetic/unit tests pass across the two new helper tests
and the existing player Restyle-admission tests; web `tsc --noEmit` passes. New candidate
metadata is 2,233 bytes and the four new production helper/declaration files total 10,119
bytes. Consumer-contract source pins describe this static wiring. The 30,908-byte canonical
projection remains SHA-256 `9f3cec9aa54c3b2bc87499f30ab34e137a2b4b7546615572d864318d7ea5be0d`.
Native source/binaries, registries, aliases and images are unchanged by this milestone.

Remaining gates: independent retail-media provenance, deliberate logical appearance mapping
or explicit separate runtime selection, source-traced palette and compositor behavior, authenticated
source/palette/composition pixel parity,
bounded Restyle component review, runtime mode/stale-load/state-restoration checks and any
later build/deployment acceptance. Animation semantics/timing and variant1 callers remain open.
No external corpus/image reads, Vite/build/browser/native/full-corpus execution, asset generation,
stage, commit, push or deployment was performed. Existing execution/distribution holds remain.

## Dual-variant caller and Amiga actor writer addendum — 2026-10-27

Source proof supplied for this bounded implementation; no new retail execution or runtime
observation is asserted. DOS creator preview `A4:3D41`, calls `A4:3DF7/3E12`, explicitly
draws body variants0/1. Neutral creator labels “Variant 1” and “Variant 2” express only this
selection; attack, idle, direction and animation meanings are not established.

Descriptor index 31 entry `GAME.OVR+0x3FDE8` forwards `[BP+8]` to `11F:0039`, which selects
`DS:6172 + slot*8 + variant*4`. In these far-call sites, the variant word is the
second-to-last pushed word (the `[BP+8]` parameter); the final pushed word is a separate
renderer flag. Descriptor numbers in the table are the zero-based ordinals from `DESCS` in
`tools/disasm_cok.py` / `gen1_map.scan_descriptors`, not one-based human numbering. The verified
complete-image stub route is selector `0x116:0x57` → image offset `0x11B7` → descriptor index 31
procedure `GAME.OVR+0x3FDE8`; the descriptor's owner fixup is at each call's segment word. The
generic `disasm_cok.py resolve` heuristic returns unresolved for this selector; the exact
complete-image stub and fixup joins are recorded in
`cok-player-variant-callers-v1.json`. The 13 direct callers are:

| Caller descriptor | Variant 0 calls in `GAME.OVR` | Variant 1 calls in `GAME.OVR` |
| --- | --- | --- |
| 8 | `0xBC60` | — |
| 9 | `0xD1C6` | — |
| 13 | `0x16874`, `0x16B3B` | `0x168A8`, `0x16B1D` |
| 22 | `0x2F2E6` | `0x2F24F`, `0x2F2C8`, `0x32BDD`, `0x32D9F`, `0x32F72`, `0x33240` |

All 13 locations call descriptor index 31's public wrapper. The caller's preceding push sequence
supplies the variant word described above; any earlier source/table selector remains a separate
argument. In particular, descriptor index22 call `0x2F24F` places a loop-selected table/source
selector before the variant constant. Do not conflate them. The wrapper at `GAME.OVR+0x3FDE8`
skips drawing when its final `[BP+6]` renderer flag is nonzero; a zero flag still requires
`0x3F9FF(record, mode=0)` to return nonzero and `DS:0x71AD != 0`. Of the 13 direct calls, two
variant-1 calls (`0x16B1D`, `0x2F2C8`) have a nonzero renderer flag and are suppressed by that
wrapper gate; the other 11 are only conditional draw candidates. These bytes do not establish that
either variant means attack/idle/movement or that any conditional draw occurred at runtime.

Eleven FF/3 indirect call sites do not directly
encode the descriptor31 stub; dynamic paths remain unresolved. This is not exhaustive caller
coverage, nor proof of when either variant is observed in retail runtime.

Amiga hunk95's writer traverses the party list rooted at hunk5:`0x3364`, stores current record
pointers in hunk5:`0x2B32` by ordinary actor index, and follows record `+0x18E`. A conditional
special branch can clear/exclude a slot. This advances the previously open actor-table writer
bridge, but actor-index meaning and special-case behavior remain open. Combat reads actor index
and passes Amiga variant0. Amiga variant1 callers and logical Amiga↔DOS identity remain unresolved;
retain explicit Amiga DOS fallback. This source evidence does not admit new Amiga art or identities.

The approved browser change presents both already pinned frames only in creation, side by side
with shared DOS/Restyle mode and independent fallback/status. Character sheet and combat retain
variant0; IDs, palette, masks, head height, loader, Amiga mapping and artwork are unchanged.

Source-only static work. No game execution, build, test, asset generation, or source-data
write was performed. The retained lift was used as an instruction index, with its instruction
bytes checked against the pinned decompressed START image or GAME.OVR source ranges. No lifted
code or game-data bytes are copied into this note.

## Source identity and check

- Retail `START.EXE` SHA-256: `e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956`.
- The decompressed-only image returned by `tools/exepack_unpack.py::unpack()` is 65,568 bytes, SHA-256 `abb145a3a2f725e72f1392c3a41cb0779cb82c72bf2c7b07973a95386464ee28`; it omits the untouched EXEPACK load prefix before the first decompressed byte.
- Retail `GAME.OVR` and retained `game-ovr.bin` SHA-256: `c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529`.
- Instruction-byte comparisons passed for 603 retained rows in `027F:15FD..1C2B`, 128 rows in descriptor-32 `01D0..02FF`, and 275 rows in descriptor-17 `0784..0A6F`.
- Follow-up byte comparisons also passed for the resident helpers `69C:0A56` (6 rows), `614:045C` (12 rows), `521:030A` (30 rows), and the `FD:002F` target at `GAME.OVR+0x3BABA` (13 rows).

The initial check used `tools/exepack_unpack.py` in memory and the checked-in descriptor/layout
readers. The default `python` executable lacked `capstone`, so `tools/disasm_cok.py` could not be
used through that interpreter. A later read-only follow-up used the workspace interpreter recorded
below for fresh static decoding; the retained instruction manifest remains evidence only for its
pinned source, and unsupported selector targets remain unresolved.

## Corrected loader contract for tuple `05 18 00 02`

The direct caller is descriptor 17 at `GAME.OVR+0x1DFDC` onward; its local procedure at
`9E:0817` builds the CHEAD and CBODY requests. Descriptor 32's public stub `11F:0034` resolves to
`GAME.OVR+0x4086A`.

Descriptor 32 consumes its stack arguments as **table slot at `+6`** and **DAX block at `+8`**.
It adds `0x40` to the block when the selected filename suffix is `T`, loads that block and its
`+0x80` variant, then stores their far pointers at `DS:6172 + slot*8` and
`DS:6176 + slot*8` respectively. Therefore:

| Request | Slot | Block after `T` adjustment | `+0x80` variant |
| --- | ---: | ---: | ---: |
| CHEAD (`+0x135 = 5`, fixed slot 11) | 11 | 69 | 197 |
| CBODY (`+0x136 = 24`, slot `+0x137 = 0`) | 0 | 88 | 216 |

This corrects the earlier claim that `+0x137` selects CBODY blocks 64/192. It is the CBODY
pointer-table slot; `+0x136` selects the CBODY block. The `+0x138` byte selects suffix `T`, but
the six palette bytes are read from character offsets `+0x139..+0x13E`.

## Composition and remapping are separate

The local routine `9E:0784`, called with the CHEAD slot-11 pointer and CBODY slot-0 pointer,
combines packed pixel bytes into the CBODY buffer. It ORs the CHEAD pixel bytes into the CBODY
pixels and ANDs the corresponding mask bytes. The loop length comes from the CHEAD frame header;
there is no separate coordinate argument at this call. This establishes the frame-relative byte
placement and mask operation, but not the final screen placement or whether row-major display
puts the head where expected.

`027F:15FD` is the subsequent color-map transform, not this head/body compositor. Its caller
passes the selected frame pointer, two 16-byte maps, and zero-valued control words; it is called
for the slot-0 frame and its `+0x80` variant. The palette loop initializes each map to identity,
then fills six low/high pairs using `DS:390A` and the character bytes at `+0x139..+0x13E`. For
the inspected tuple, the six selected table indices and stored nibbles preserve identity mapping.
Other saved-character tuples still need independent derivation; Amiga counterparts are unknown.

### Palette-map construction follow-up (static, 2026-10-26)

The descriptor-17 caller at `GAME.OVR+0x1E04E..0x1E134` constructs the maps before calling
`027F:15FD`. It initializes two 16-byte maps to identity, then loops over the six character bytes
at `record+0x139..0x13E`. For byte number `i=1..6`, the low nibble is stored at the first map's
index `DS:[0x390A+i]`; the high nibble is stored at the second map's index `DS:[0x390A+i]+8`.
Those maps are passed to `027F:15FD` for the composed slot-0 frame and its `+0x80` variant.

The table is now resolved against the pinned `START.EXE` (`e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956`). Its startup call to `A46:0000` sets `DS=0x0BC6`; therefore `DS:390A` is complete-image offset `0xF56A`. The bytes at `DS:390B..3910` are `01 02 03 04 06 07`. The browser compositor can construct the exact two maps from each runtime record: initialize identity, then set `low[index[i]] = paletteBytes[i] & 0x0F` and `high[index[i]+8] = paletteBytes[i] >> 4` for `i=0..5`.

The callee's contract is now confirmed by 16-bit disassembly of the same pinned image. `027F:15FD` copies its first map argument (stack `+0x12`) as the source-color lookup and its second map argument (`+0x0E`) as the replacement colors. The caller passes the identity table first and the character-adjusted table second. The routine remaps each source color index to its replacement. In EGA mode (`DS:4B76 = 1`, selected by the `E` branch), it applies that mapping to the four plane bits; in Tandy mode (`DS:4B76 = 2`, selected by `T`), it remaps both packed pixel nibbles. Thus the direct 16-entry browser lookup is equivalent to the retail map for these EGA/Tandy paths. The caller invokes it after frame composition on both slot-0 variants.

This follow-up read only the pinned executable/overlay code and its static table; it did not read
character or save files. The inspected record's transform is identity, while other records can be
handled by the same per-record map rather than assuming identity.

### Source-derived browser comparison (2026-10-26)

A temporary headless Edge check loaded the in-progress TypeScript compositor from Vite after the
six manifest-pinned files were staged into a temporary package directory. An independent
Python/Pillow calculation decoded the source PNG colors, combined head/body indices with the
source-mapped OR operation, applied the key-1 transparency mask and character color map, then
expanded each native pixel to its 4x4 display cell. For palette bytes `10 21 32 43 64 75`, both
browser output buffers matched the independent RGBA byte streams exactly:

| CBODY variant | RGBA SHA-256 | Result |
| --- | --- | --- |
| #88 | `D98FEDCFF27745C52B3735340C8DBAD18F9A39931C7504C8F94BA783F17C7C0A` | Exact match |
| #216 | `772F10B4A0C888B2E4DC0EFCE4C59EC832D340F4CBC511509568A654695048EB` | Exact match |

The same check verified 96x96 output geometry for original and Restyle images, uniform 4x4
nearest-neighbor source cells, palette sensitivity, non-empty Restyle pixels, and rejection of a
short palette and an unmapped head tuple. The independently derived output is not a retail-runtime
capture, and the loader still has no runtime consumer; this closes only the source-derived
composition/color-map comparison.

## EGA draw path is proven; screen origin is resolved by the 2026-10-27 addendum

The following call, `11F:002F`, is cleanup: its mapped target checks the selected pointer slot and
frees/clears the two frame-bank allocations through `027F:1CF6`. The later calls also resolve, but
are not the draw: `69C:0A56` restores `DS:5782` from `DS:5783`, and `614:045C` polls/consumes BIOS
keyboard input through `962:02FD/030F`. These are resident START-image routines, so their
coordinates were validated against the complete EXEPACK load image rather than the local VROOMM
geometry.

A separate character-preview branch in module 46 calls the pixel-map transform, then
`FD:002F`; descriptor parsing maps that entry to `GAME.OVR+0x3BABA`, whose routine passes a
bounded 40-by-24 screen rectangle to `521:030A`. That target validates the rectangle bounds and
delegates through `743:0030`; this remains a separate operation, not the player-frame draw.

The player-frame draw is instead proven through `A4:3D41` → `11F:0039` → `027F:09C3`. The shared
`11F:0039` routine resolves the requested pointer-table slot and variant, allocates a scratch frame,
copies the selected frame data into it, and passes the scratch frame plus the EGA destination
surface into `09C3`. For slot 12 variants 0 and 1, its two source arguments `(2,1)` and `(2,4)` are
multiplied by three and reach the EGA backend as `(6,3)` and `(6,12)`. In `027F:09C3`, EGA mode
dispatches to `027F:226C`. The addendum below maps the first coordinate to vertical displacement
in 8-scanline units and the second to horizontal byte columns (8 pixels each), then clips against
the surface object. `027F:12E8` updates the EGA page using row offsets of 40 bytes. This proves the
two preview variants land at the surface origin plus `(x=24,y=48)` and `(x=96,y=48)` respectively.
The EGA preview positions are now mapped below. The character-record slot-0 runtime consumer is
also mapped by the later 2026-10-27 addendum; the Amiga counterpart remains unresolved.

## Next bounded action

Trace the Amiga renderer independently when its source inputs are accessible. Carry the verified
DOS appearance identity into the runtime model with explicit fallback for unmapped Amiga art.

## Supplemental static trace — preview slot 12 and the screen primitive

Read-only follow-up against the same pinned retail inputs and complete load image. Instruction
decoding used `{repo-root}\build\cok-recomp-tools\venv\Scripts\python.exe` with Capstone
5.0.7; no game, emulator, build, test, or generator was run, and no source/game-data file was
changed by the trace.

- `tools/exepack_unpack.py::unpack_complete_load_image()` returns the 65,568-byte complete load
  image, SHA-256 `1bd9c6700b6ce55445649cf25a1991010896d1cfb044f2fb57c9cc90faf6a7e5`, restoring the
  untouched 0x38D-byte EXEPACK load prefix omitted by `unpack()`; `GAME.OVR` remains
  `c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529`.
- Descriptor `00A4` maps to `GAME.OVR` file offset `0x20209`, code size `0x67C8`. In the
  character-preview path, `A4:40D4..40F3` saves the character record's `+0x137` slot byte, changes
  it to 12, calls `9E:002A`, then restores the saved byte. Descriptor `009E` maps stub `002A` to
  `GAME.OVR+0x1DEF2` (`009E:0817`). That helper loads the selected CHEAD/CBODY requests, composes
  their packed pixels and masks into the requested pointer-table slot, and applies the separate
  palette transform. Thus this preview pass produces a slot-12 composed frame, not a slot-0
  frame.
- After restoring the character's original `+0x137` slot, `A4:40F3..4127` calls local
  `A4:3E20` with source slot 12 and destination slot equal to the saved record byte. The helper
  copies frame-bank allocations and data pointers from the source slot into the destination slot.
  For tuple `05 18 00 02`, the saved byte is 0, so this call copies the composed slot-12 frame into
  slot 0. The subsequent `A4:3D41` preview calls still render slot 12 variants 0/1; the source
  trace has not yet found a consumer that draws the copied slot-0 frame.
- The later A4 path at `A4:4725..474A` invokes local routine `A4:3E20` with the character slot
  and slot 12, then calls `FD:002F`; it subsequently releases slot 12 through
  `11F:002F`. `FD:002F` resolves to `GAME.OVR+0x3BABA` (`FD:0C7B`). It calls `521:030A` with
  constants describing a 40-by-24 rectangle and no slot-12 pointer. This establishes a bounded
  screen operation, but does not establish that this call displays the composed player pixels.
- `521:030A` checks the rectangle coordinates against a 40-by-24 bound, delegates to `521:01DF`,
  and returns through `743:0030`. The paired `743:0051` and `743:0030` helpers dispatch mouse
  interrupt 33h functions 2 (hide) and 1 (show), respectively; they are cursor management around
  the drawing service, not the image consumer.
- The shared `11F:0039` renderer reads the selected pointer-table slot and variant and creates a
  graphics object through `027F:1C2F`. For control values above 3, it also combines frame-object
  data through `027F:0B94` and reaches `027F:09C3`, which dispatches to mode-specific routines
  `027F:226C`, `027F:24FD` or `027F:27AF`. The subsequent `027F:12E8` screen update contains
  EGA port writes. At this checkpoint the preview surface metadata and screen coordinates were
  still open; the 2026-10-27 addendum below resolves the EGA surface and pixel anchors.
- The source bytes around `A4:40E3` call `9E:0817`, then call `A4:3E20` and `A4:3D41`. In
  `A4:3D41`, the calls at `3DF7` and `3E12` pass pointer-table slot 12 to `11F:0039` with variants
  0 and 1, then the routine calls the port-writing `027F:12E8` screen update at `3E17`. This
  connects the composed slot to graphics-object construction and the screen-update path.
- `11F:0039` takes a different object-preparation branch for mode values 0/1 than for values above
  3, but both paths join at a common renderer call. That common tail consumes the coordinate
  arguments at `+0x0C/+0x0E`, multiplies each by 3, and passes them to `027F:09C3`. In the
  `A4:3D41` preview call, the slot-12 calls at `3DF7` and `3E12` use variants 0 and 1 with
  argument pairs `(2,1)` and `(2,4)`; the raster dispatcher therefore receives `(6,3)` and
  `(6,12)`. `027F:09C3` dispatches those objects to the active graphics-mode raster routine, and
  `A4:3D41` subsequently invokes the EGA screen update `027F:12E8`.
- This ties the slot-12 composed frame and its two variants to the DOS graphics-render path with
  concrete renderer-input values. At that trace checkpoint, their coordinate interpretation,
  pixel-space anchor and runtime destination origin remained open; the 2026-10-27 addendum below
  resolves the DOS preview surface and positions. At that checkpoint the copied slot-0 frame's
  consumer remained open; the later 2026-10-27 addendum maps a runtime draw path. The equivalent
  Amiga mapping remains unknown. Keep that boundary open rather than claiming cross-mode coverage.

Next bounded action: follow the copied slot-0 frame from `A4:3E20` to its consuming draw call and
investigate the corresponding Amiga composition and renderer. Use only source mappings and retained
bytes. Stop on an unmapped target, missing source, or any need to execute the held Rust/native
paths.

## Supplemental static trace — EGA surface-buffer clipping (2026-10-27)

Read-only disassembly of the pinned retail `START.EXE` complete load image, using the existing
EXEPACK unpacker and the workspace Capstone interpreter. `START.EXE` SHA-256 remains
`e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956`; complete-image SHA-256
remains `1bd9c6700b6ce55445649cf25a1991010896d1cfb044f2fb57c9cc90faf6a7e5`. No game, emulator,
build, test, generator, or source-data write was performed.

- Resident `027F:226C` maps to complete-load-image byte offset `0x4A5C` (`0x027F*16 + 0x226C`).
  The EGA routine reads source-frame width/height at `DS:SI+0/+2` and destination-surface
  width/height at `ES:DI+0/+2`; source `+0x13/+0x15` is an optional saved-under far pointer, not
  dimensions. It reads source/destination positions from its stack arguments and clips the source
  rectangle against the object dimensions before dispatching its row operations.
- Its internal near-call targets at complete-image offsets `0x5117` and `0x5176` map to resident
  offsets `027F:2927` and `027F:2986`. The first copies the clipped packed rows from source
  payload offset `+0x17` to destination payload offset `+0x17`. The second applies each source
  mask byte to the destination pixel byte, then ORs the source pixel byte, also within the
  `+0x17` payload; it updates clipping extents and supports an optional saved-under buffer.
- Descriptor 32's EGA surface pointer `DS:4B78/4B7A` is initialized by a `027F:1C2F` call at
  `GAME.OVR+0x102B5` with dimensions 168 by 21 and one pixel/mask buffer. The constructor stores
  these as object fields `+0/+2` and allocates `168*21*2 + 0x17` bytes. In this raster layout the
  first dimension is scanlines and the second is byte columns per scanline.
- The EGA update `027F:12E8` loops rows 0 through 167. The row-offset table at `DS:5458` is
  initialized as `row*0x28` (40 bytes) for rows 0 through 199; the planar destination segment is
  selected by the matching row entry in `DS:55E8`. Dirty horizontal extents are byte-column
  offsets into the 21-byte surface. The object's local `(0,0)` therefore maps to the upper-left
  of the EGA page: byte column 0, scanline 0.
- Careful axis tracing corrects the earlier coordinate interpretation: backend `[BP+0x10]` is the
  vertical axis and is multiplied by 8 before multiplying by the row stride; `[BP+0x12]` is the
  horizontal byte-column axis. The preview calls `(6,3)` and `(6,12)` therefore place their frame
  origins at `(x=24,y=48)` and `(x=96,y=48)` pixels in the EGA page. This resolves the DOS preview
  surface origin and pixel anchor. The saved slot-0 consumer is mapped in the following addendum;
  the Amiga equivalent remains unresolved, so B2a stays open.

The direct `disasm_cok.py resolve 0x11f 0x39` command reports this entry outside its validated
runtime stub geometry, so that resolver alone is insufficient. The complete START load image
contains a valid `CD 3F B0 04 00` stub at image offset `0x1229` (`0x11F*16 + 0x39`): procedure
offset `0x04B0` in descriptor 32 (`GAME.OVR` base `0x4069A`, code size `0x5CD`) resolves to
`GAME.OVR+0x40B4A`, whose bytes are a procedure prologue. Its body confirms the renderer contract:
it reads the selected frame from `DS:6172 + slot*8 + variant*4`, creates a same-sized scratch
graphics object through `027F:1C2F`, and calls `027F:09C3` with that scratch object, the surface
pointer at `DS:4B78/4B7A`, flags and scaled coordinates. Thus the call target is now source-mapped
through the exact resident stub and owning descriptor even though the generic resolver misses it.
The global surface allocation, EGA page row table and preview pixel anchors are described above.

## Supplemental static trace — runtime draw consumes the character slot (2026-10-27)

Read-only disassembly of the same retail inputs, with `GAME.OVR` SHA-256
`c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529` and `START.EXE` SHA-256
`e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956`. No character/save file was
read, and no game, emulator, build, test, or source-data write was performed.

- Descriptor 31 is based at `GAME.OVR+0x3F310` with code size `0x135E`. Its procedure at
  `GAME.OVR+0x3FDE8` (`+0x0AD8`, `55 89 E5`) receives a character-record far pointer at `[BP+0x0C]`.
  On its draw branch it reads byte `[record+0x137]`, passes that slot to `11F:0039`, and then calls
  `027F:12E8` to update the screen.
- The exact complete START image stub for `11F:0039` remains `CD 3F B0 04 00` at image offset
  `0x1229`, mapping to descriptor 32 procedure `GAME.OVR+0x40B4A`. That routine indexes the
  pointer table at `DS:6172 + slot*8 + variant*4`, constructs a scratch object and calls the
  graphics renderer with the selected slot's frame.
- The source contract maps the saved character's `+0x137` value for the inspected appearance to
  slot 0. `A4:3E20` copies the composed slot-12 frame into that slot; descriptor 31 then passes the
  same record slot to the renderer. This closes the DOS slot-0 consumer chain for this appearance,
  without inferring the slot from class, party order or a generated image.
- The documented WHDLoad source root `D:\Games\Emulator\Amiga\WHDLoad\...` and the inventory's
  `{repo-root}\amiga_extracted\` root are absent on this checkout. The accessible
  `cok-amiga-art-mappings.json` is a separate Amiga-to-DQK override map and explicitly has no
  per-identity CBODY mapping; it does not supply the CoK player's Amiga counterpart. Keep that
  mapping open until the Amiga files are accessible and their identity/composition can be checked.

## Retained Amiga player atlas trace — 2026-10-26

This source-only follow-up supersedes the preceding source-availability limitation. No game,
retail save, runtime test or native build was executed. Static HUNK parsing consumed the complete
479,844-byte `disk1/game` file into 101 hunks; relocation targets were resolved before interpreting
absolute references. Disassembly used Capstone 5.0.7/M68K-000 in the existing
`build/cok-recomp-tools/venv/Scripts/python.exe`. The default Python 3.13 interpreter, with NumPy,
decoded only the two ILBM inputs in memory through `tools/amiga_cokdok_render.py`; source files
and generated artwork were not changed.

### Source pins and coordinates

Root: `{external-workspace}/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn/`.
SHA-256 pins:

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| `disk1/game` | 479844 | `99a252109cb5e5c01de71edf6e8a22b3d9db96a9e6249c1f3f03ad71f9990102` |
| `disk2/charS.LBM` | 16504 | `51cfc7de6f3c8004de820ee9758eb3f785bedff6a808c21d58d0d2964b7963c3` |
| `disk2/charT.LBM` | 25652 | `e17783a48aec7d7708bc3d3af4c7cc3adc496376d11aa4cf2abbea4ac9d1ce72` |

Hunk numbers below are zero-based, and offsets are hexadecimal relative to the hunk payload.
File bases are hunk16=`0x20544`, hunk28=`0x27A14`, hunk29=`0x28D8C`, hunk35=`0x30820`,
hunk47=`0x35DE0`, hunk66=`0x534F4`. The key hunk66 payload is 0x3610 bytes, SHA-256
`8466c6e0a458a40791f2ca34a3f36ba378dff16a780349e184e568385fdc05d5`.

### Proven bounded loader/compositor/editor chain

- Hunk28:`0D36` loads `charS.LBM` and `charT.LBM` through `0C68`, storing their bitmap pointers
  in hunk28:`0054` and `0050`. The references derive from its relocated A4 base `00FE`, not
  filename inference. `0CFC..0D1E` copies 64 palette bytes to hunk5:`522E`, copies its first
  color word to `523E`, and clears the first word. The second load is charT. Hunk47:`0944..095A`
  passes that 32-color table into the display-palette wrapper.
- Hunk66:`0C34` is the player composition entry, branching to `0E5A`. The character pointer
  is hunk5:`3368`. It reads head selector `+0x141`, body selector `+0x142`, pointer-bank slot
  `+0x143` and atlas selector `+0x144`. Selectors below 1 are clamped to 1. For body <=31,
  atlas selector 1 chooses charS; the other branch chooses charT. Body >31 takes a distinct
  path beginning `10BC`; it is outside this proposed first admission.
- For that body<=31 path, `0EC6..0ED4` extracts head cell `head+62`; `0EDE..0F20` extracts
  body cells `body` and `body+31`. Their destinations are hunk5:`3244 + slot*8` and `+4`.
  The temporary head pointer is hunk5:`329C`. These are atlas cell numbers, not DAA block IDs.
- Helper `66:0D2A` uses one-based cell N and a 12-column grid: x=`((N-1)%12)*24`,
  y=`floor((N-1)/12)*24`. Each extraction is 24x24. The image call uses minterm `0xC0`,
  plane mask `0x0F`; the separate mask call uses minterm `0x30`, plane mask `0x10`.
  The latter is the inverted fifth source plane, so a zero in that plane produces a set
  mask bit. It is not an equality comparison against one palette index.
  Thus the fifth ILBM image plane must be retained independently of the four color planes;
  BMHD transparency or RGB black is not a substitute. Hunk29:`0408` allocates the objects;
  `0554..0630` gives all five mask-bitmap plane pointers the same allocated mask storage.
- `66:0BAC` combines the head with each body at origin (0,0), width 24, using minterm `0xE0`
  for both image and mask bitmaps (OR combination). This is a separate contract from the DOS packed-image/mask
  operations; do not transfer the DOS index-1 transparency rule.
- Palette remapping at `66:0FA2..10B6` reads six bytes at character `+0x146..0x14B`, mapping
  their low/high nibbles to selected indices and indices+8. Hunk4:`254A..2578` initializes
  the selector table hunk5:`5228` to `[1,2,3,4,6,7]`. The map is applied to both variants by
  `29:0EFE`; the caller's boolean can skip remapping. This is source evidence, not a claim
  about a particular retail character's palette/default values.
- The icon editor is independently identified by its Head/Weapon/Body/Size/color and
  `Is this icon ok?` strings. `47:093E` loads the atlases; `0962/0996` call the compositor,
  temporarily selecting slot12 at `098C` and restoring the character slot at `099E`.
  `47:00F4` calls draw entry `35:0460` for slot12 variants0/1. That draw entry indexes the
  same `3244 + slot*8 + variant*4` table, scales placement coordinates by24, and passes
  image and independent mask to its draw wrappers at `0662/06AC`. The complete combat
  caller chain, draw-wrapper boolean meaning and animation timing are still open.

### Available external atlas artwork, not runtime admission

Both ILBMs decode completely as 320x200, five image planes, BMHD masking=0. Their nominal
transparent-color words are 17 (S) and 0 (T); neither is an ILBM mask mode. Decoded row-major
index SHA-256 values are S=`b61f17f3a7e0c908dee28db5c71162e1dbcb58b1b5dda30cb8862b35cb99cebe`
and T=`566ff7ad72db7d9173c1ca00c7b02ef1300b077d8d29de22fe631590849126b8`.
The existing 1280x800 source PNGs under
`{external-workspace}/cok_restyle_work/amiga_render_all/amiga_cokdok/lbm/CoK_charS.png` and
`CoK_charT.png` match decoded CMAP pixels at exact 4x scale with zero differing pixels.

The external `amiga_coverage.json` marks both atlas outputs restyled. Both exist as 1280x800
RGB PNGs under `{external-workspace}/cok_restyle_work/done/`:

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| `CoK_charS_restyle.png` | 345242 | `d29dd6842c7cd6b3f7a1f4bf17f574343dbb58db2b5f915d8ca6af3b00a1afc4` |
| `CoK_charT_restyle.png` | 1444748 | `919b5493bb28b27897b4edc5335f38ec10d6549c6e4aba984b47e9e0de0d5d2e` |

These full-atlas counts and ledger labels do not prove each selected cell's compositional
fidelity or runtime coverage. S was visually inspected as an atlas only; neither atlas has
earned a bounded composed-player Restyle acceptance here. RGB outputs carry no alpha mask.
Full original prompts remain unestablished; no generation or prompt reconstruction occurred.

### Next source-only gate before implementation

Checkpoint note: the follow-up below closes the final mask paths and combat draw-to-slot link;
the remaining identity and actor-table-population limitations are stated there.

Do not bind a DOS tuple to an Amiga atlas merely because head/body numbers look alike. The
Amiga record offsets differ, and direct sample source-index/mask comparisons do not establish
exact DOS equivalence. Close an explicit logical-appearance mapping through editor initialization,
selection limits and source-cell comparison; finish the mask/draw-wrapper contract and a real
combat slot/variant caller. Preserve explicit DOS fallback until that admission exists.

Then admit one body<=31 Amiga identity only: pin both atlas cells/variants and head, source
color/mask arrays, effective palette and output cell geometry. Require independent synthetic
composition/palette/mask goldens, wrong-selector/source-hash/geometry negatives, opaque-black
and fifth-plane discrimination, visible player-only mode changes, unchanged party/combat state,
exact DOS restoration and stale-load/fallback controls through creation/sheet/combat. Candidate,
private atomic deployment and live hashes/routes are subsequent gates. No Amiga runtime or
Restyle identity is admitted by this source trace; all execution/distribution holds remain.

## Amiga party, combat draw and creation-derived identity follow-up

This bounded continuation inspected the same pinned executable/atlases at checkout `316aa771`.
It read no retail saves and executed no game, build or tests. Coordinates use the zero-based
hunk convention above. It establishes the following additional source facts, not runtime admission.

### Preparation and combat consumer

- Hunk13:`5580..558E` passes a character pointer to `66:27EE`, then calls `66:0C34` with
  remapping enabled. The earlier empty-party branch at `13:5404..5412` does the same. This is
  party preparation, not a direct compositor invocation during each combat draw.
- `66:27EE` marks the incoming icon slot `+0x143` as 255, links the record through `+0x18E`
  into the party rooted at hunk5:`3364`, and stores the current character at hunk5:`3368`.
  `285E..28EC` marks occupied slots0..7 and assigns the first free slot. Thus storage slot is
  allocated separately from head/body/atlas selection; the first member gets slot0.
- Hunk48:`0514..0572` obtains an actor through `hunk5:2B32 + (actor-1)*4`, reads its
  character `+0x143`, pushes variant0, and calls `35:0460`. Coordinates come from the
  parallel hunk5:`3104`/`30B4` arrays. `48:08E8..0940` contains another variant0 call through
  the same actor table. The draw-mode argument comes from `[character+0x192]+0x0B`.
  `35:0460` then resolves the exact same slot/variant table populated by the compositor.
- The combat draw-to-character-slot link is therefore established. At this checkpoint the writer
  from the party list, the draw-mode byte's gameplay labels and variant1 timing were not closed.
  The 2026-10-27 addendum above identifies the hunk95 writer, with actor-index/special-case
  meaning and variant1 callers still open. Do not infer semantics from preview labels.

### Final mask consumption and branch meaning

`35:061A` tests hunk29:`0064`. Nonzero selects the custom blitter path `49:04AE` with minterm
`0xCA`; zero selects `16:00A0` with minterm `0xE0`. Hunk29's relocated A4 base is `006A`, so
its `-6(a4)` accesses refer to that exact flag. `29:1576`, `15C8`, `160E`, `16A2` and `16DE`
update it alongside display/buffering nesting counters; it is a rendering-path flag, not a
character opacity or pose field. The separate `29:0065` flag selects the destination surface.

The mask pointer passed by `35:0614/065E/06A8` is the shared mask storage at object+0x0C,
bitmap+0x08. `49:04D4` retains it in the custom job; `49:073A..076A` sends mask to blitter A,
image plane to B, and existing destination to C/D. Minterm `0xCA` gives
`D=(mask AND image) OR ((NOT mask) AND destination)`: a set mask bit draws, a clear bit keeps
the destination. This closes the polarity of the inverted fifth atlas plane. The direct wrapper
loads the same mask into A2 and calls graphics.library vector `-0x27C`, with the source bitmap,
destination RastPort and coordinate registers matching `BltMaskBitMapRastPort`.
The [original Commodore ROM Kernel manual](https://erikarn.github.io/amiga/docs/Amiga_ROM_Kernel_Reference_Manual_v1.3.pdf)
documents that register ABI; [AmigaOS graphics documentation](https://wiki.amigaos.net/wiki/Graphics_Primitives)
confirms its mask is a separate single plane and drawing occurs at nonzero mask bits. No
particular live buffering state was observed here.

### One creation-derived candidate; no asserted DOS equivalence

Hunk13 contains the Pick Race/Gender/Class creation menus. Race-choice index0 takes the
dispatch table at `0CEA` to `0C9C`, setting atlas selector2. Given gender field `+0x10E !=1`
and race field `+0x5B !=5`, `13:08C2` selects head5. Its class-field branch selects body1
when `+0xFE=0` and `+0x102>0`; `13:0FFA` is a creation branch that writes `+0x102=2`.
These byte predicates identify a real code-defined creation candidate; no race/class name,
retail saved character or observed UI selection is asserted. `13:2A8C..2A96` loads the atlases,
calls this appearance initializer and enters the icon editor. The creation record's temporary
slot is10; party preparation independently reallocates it, including slot0 for an empty party.

For this candidate, charT head5 selects cell67 at (144,120); body1 selects cell1 at (0,0)
and cell32 at (168,48). All are 24x24. The code's initial six palette bytes are
`91 A2 B3 C4 E6 F7`, derived at `13:0A5C..0AA8`, before editor changes. Raw five-bit cell
and one-byte-per-pixel opaque-mask SHA-256 pins are:

| Cell | Raw indices SHA-256 | Opaque-mask SHA-256 | Opaque cells |
| --- | --- | --- | ---: |
| 67 | `c16ae6024f26497cb3d5e0db63cdd8d6a8cb77f7042866717f4056dd3f4f5d41` | `10b95930d6221318f2cc87831513e563305493f60927460fa6d0e894b43bc5ca` | 27 |
| 1 | `d9cee48c65c0ef7579ad93979a73ba6dbd746218fae3836b0e3f7df3a8efb585` | `f9d1ca2fd376cee2597b988d443824c110986e22248831e844ff546d78743aab` | 172 |
| 32 | `4ee6edc24d17b246e40bee987544f1000f498cd165b6c04733b9d182a0b36fe2` | `afcd9411d9bcfe0a4d4c183397bb4f493887f7afd947835cc84f32a6580594a5` | 160 |

Composing head67 with body1/body32 by the source operations yields 199/187 opaque pixels.
Composite masks hash to `0e7376309a40984fd72e78a6d0ad73a1c289f1f6c867ac97615da5c91f86f4cc`
and `04682d4efc07c2dee13ffe922620d69a70357a93c27eda7d2d36459781c92b80`.

An explicit comparison with the numerically corresponding DOS CHEAD69/CBODY65/CBODY193 is
not an equivalence proof: the low-four-bit arrays differ at 17/161/144 positions respectively
(the head comparison uses its DOS 24x8 extent). The Amiga fifth-plane masks remain independent
of DOS's documented mask construction. No exact DOS-to-Amiga identity bridge is established
in these authorized sources. Stop before runtime admission; preserve DOS fallback. A further
source task must establish a deliberate logical appearance mapping or an explicitly separate
Amiga appearance identity, rather than silently equating the numeric selectors.

## Actor-order table population trace — 2026-11-03

A fresh static trace of the retained `disk1/game` executable (479,844 bytes; SHA-256
`99a252109cb5e5c01de71edf6e8a22b3d9db96a9e6249c1f3f03ad71f9990102`) resolves the hunk95
writer topology. All coordinates below are zero-based hunk-relative offsets. The work parsed the
101 HUNKs and relocations and disassembled the relevant routines; it did not run the game, tests,
or a build.

- Hunk95 function `+0x1FC8` initializes its local actor-order index (`-0x0E`) to 1 at `+0x1FDA`,
  clears 40 helper status rows at `hunk5:+0x3154 + (index-1)*6 + 5`, then resets the index to 1
  and loads both previous/current pointers from the party-list root `hunk5:+0x3364` at `+0x21FE`.
- At `+0x221C`, a non-null current record is provisionally stored in the actor table
  `hunk5:+0x2B32 + (index-1)*4`. Its `+0x199` byte is copied into work state, and the current
  actor-order index is stored in the separate helper row at `hunk5:+0x3154 + (index-1)*6 + 4`.
  Thus the actor index is traversal order in a filtered/compacted party chain; it is not the
  character record's Amiga icon-storage slot at `+0x143`, nor the atlas head/body cell selector.
- The local gate at hunk95 `+0x1A7A` determines whether traversal enters the ordinary or D0==0
  branch, but the gate's semantic label and the object fields at `+0x192` remain unknown. In the
  D0==0 branch, current record object byte `+0x15` is tested at `+0x241A..+0x2428`. When it equals
  1, the code increments a special counter, clears the provisional actor-table entry, updates the
  current-character global, and calls hunk53 `+0x00CA` with byte arguments `(1,0)`. It then moves
  current back to previous and does not increment the actor-order index, so the next retained
  record reuses that index. The reason that this selector/object state causes removal is not
  established and must not be named as a gameplay status.
- Hunk53 `+0x00CA` walks the linked list through character `+0x18E`, unlinks the selected record
  by updating the predecessor link or party root, and, for the caller's `(1,0)` arguments, releases
  its `+0x143` storage slot and decrements the party count. Hunk35 `+0x01DC` uses that byte as the
  slot index and frees either non-null variant object in `hunk5:+0x3244 + slot*8 + variant*4`.
  No label is assigned to the surrounding field semantics.
- Hunk48 `+0x0514..+0x0572` reads the actor-order index, retrieves the character pointer from
  `hunk5:+0x2B32`, then reads that record's separate `+0x143` slot and calls hunk35 `+0x0460`
  with variant 0. Hunk48 `+0x08E8..+0x0940` repeats the same lookup. This closes the bridge from
  combat actor order to the selected character record and then to its icon-storage slot. It does
  not close natural-gameplay meaning/range, logical DOS appearance equivalence, runtime
  admission, or animation/variant-1 use.

This supersedes the earlier open question about whether the writer's index was a storage slot. The
remaining Amiga gate is selector/object semantics and an admitted logical appearance mapping; the
safe runtime behavior remains explicit DOS fallback.

## Amiga atlas editor selector-domain trace — 2026-11-03

A further static read of the same pinned executable separates editor selector bounds from
normal-gameplay reachability. The on-screen editor accepts 11 charS head values and 36 body values,
and 13 charT head values and 40 body values: 47 and 53 selector values respectively. These are
UI-bounded selector candidates, not proof that every value or combination occurs in an ordinary
party or combat route.

- Hunk66 `+0x0D2A` extracts standard one-based selectors using a 12-column grid:
  `x=((N-1)%12)*24`, `y=floor((N-1)/12)*24`. Record fields `+0x141/+0x142` are head/body,
  `+0x144` chooses atlas 1 (`charS`) or the other branch (`charT`). The ordinary body `1..31`
  path at hunk66 `+0x0EC6..+0x0F20` draws head `H+62` plus body `B` and `B+31`. Together the
  bounded selector domains reach standard cells 1..73 on charS and cells 1..83 on charT.
- The body `>31` path at hunk66 `+0x10BC..+0x1206`, through helper `+0x0DEA`, interprets the
  value as a direct x/y selector in 24-pixel units. For charS, bodies 32..35 select two vertical
  cells at physical x=288 and rows 0/1, 2/3, 4/5, 6/7; body36 selects x=264 at rows 6 and 7
  (standard 12-column cells 84 and 96). For charT, bodies32..35 select adjacent pairs at
  x=72/120/168/216, row6 (cells76..83), and bodies36..40 select pairs at x=0/48/96/144/192,
  row7 (cells85..94). Hence the charS domain includes an actual thirteenth physical column at
  x=288 that the present `cellIndex` 12-column spelling cannot represent without changing its
  coordinates. Do not extend that schema's numeric IDs by guesswork.
- Hunk47 `+0x0162` applies editor maxima of head11/body36 for charS and head13/body40 for charT;
  mouse-grid selectors beyond the maxima are rejected. T→S atlas switching clamps head/body
  values to the charS maxima; S→T selects charT. These are editor constraints, not independent
  evidence that values are naturally selected by gameplay. Hunk13 creation dispatch
  `+0x08C2..+0x097C` supplies a limited set of candidates: the existing charT head5/body1 trace
  remains the only documented complete candidate composition. Do not create appearance sets from
  the Cartesian product of the editor limits.
- Party preparation hunk13 `+0x5404..+0x5412` / `+0x5580..+0x558E` calls hunk66 `+0x27EE` and
  `+0x0C34` with remapping enabled. The compositor uses the record's head/body/atlas fields and
  allocates the separate `+0x143` storage slot. This proves a player-party preparation consumer,
  not the reachability of all editor choices or a full runtime drawing route.

The bounded atlas-cell import covers only selector samples 1, 32 and 67 on each disk. A future
registry expansion needs a coordinate-preserving locator for the charS 13th column and a clear
distinction between editor-available selector candidates, cells referenced by creation, and values
observed in ordinary gameplay. Subject identity, DOS equivalence, full palette variation and
animation/variant timing remain separate gates.

## Amiga HEAD/BODY portrait display path — 2026-11-04

Read-only HUNK/relocation parsing of the complete 479,844-byte Amiga `disk1/game` executable
(SHA-256 `99a252109cb5e5c01de71edf6e8a22b3d9db96a9e6249c1f3f03ad71f9990102`; 101 hunks) found a
separate archive-backed portrait compositor. This path uses HEAD/BODY archives and is not the
24×24 charS/charT player-icon atlas or the DOS CHEAD/CBODY player-appearance path.

Coordinator verification independently parsed all 101 hunks through byte 479,844, disassembled the
listed Hunk42/Hunk61/Hunk64/Hunk29 instructions with the workspace M68K decoder, and checked the
relocation entries: Hunk42 `+0x0D86` and Hunk64 `+0x0B4E` target hunk5; Hunk42 `+0x0E08` targets
hunk29; Hunk61 `+0x1D4E/+0x1D60` target hunk42; Hunk64 `+0x0BFA` targets hunk61. Fresh hashes for
the five source files above match the recorded pins. The existing DOS demo profile independently
declares picture68 as HEAD2#69 at `(0,0)` plus BODY2#68 at `(0,40)` in `apps/web/src/ui/demo.ts`.
No source files or artwork were changed by these checks.

- Hunk42 `+0x0D70` accepts independent head/body selectors; `255` skips that component. At
  `+0x0D7A..+0x0D9A`, the global at hunk5:`+0x246E` is formatted as a one-character decimal
  archive suffix. Hunk42 `+0x0DCA..+0x0E06` forms `HEAD<n>` and loads the requested head block;
  `+0x0E5E..+0x0E9A` forms `BODY<n>` and loads the requested body block. Hunk29 `+0x0AA4..+0x0AC0`
  forwards the filename, `.daa` extension and selector to the archive reader at hunk28:`+0x0DD8`.
  The reader's inner TOC/decompression loop was not traced here.
- With composition enabled, Hunk42 `+0x0ED2..+0x0F40` draws the head and body through separate
  helpers. Hunk42 `+0x02D6` adds five 8-pixel units to the body y-coordinate; Hunk29
  `+0x0E92..+0x0EE8` scales both coordinates by eight and calls the graphics wrapper. Hunk61
  `+0x1D20..+0x1D6C` stores the selectors and requests the composite at `(3,3)` units: head
  `(24,24)`, body `(24,64)` pixels.
- Hunk64 `+0x0B10..+0x0BF8` obtains a picture value through Hunk61:`+0x1670/+0x184E`. If the
  state object at hunk5:`+0x3E00`, field `+0x5C2`, is not `255`, that value is passed as the head
  selector and the obtained picture value as body selector to Hunk61:`+0x1D20`; otherwise normal
  PIC/BIGPIC paths are used. Hunk63 `+0x327E..+0x32A4` can redraw retained selectors from globals
  hunk5:`+0x2488/+0x2487`.

Thus selectors `(head=69, body=68, suffix=1)`, if established together by a scene, would load
`HEAD1.DAA#69` and `BODY1.DAA#68` and produce the same relative 88×88 `(0,0)/(0,40)` composition
as the DOS demo profile's `HEAD2.DAX#69` plus `BODY2.DAX#68`. The pinned local Amiga HEAD1 and
BODY1 archives match SHA-256 `9e221c31d7addde215a6c007650f81b09ccc5f7d8253b8143562ec7a61a319af` and
`dd567b695a1849bc70c9a1e9eb22f603bb70b823b78b2b0ecce645cfa290db4c`; their registered frames are
88×40 and 88×48. This is a conditional selector/composition equivalence, not proof that an original
Amiga demo or other scene writes those values, or that either component has a particular semantic
subject or animation role.

## Amiga ECL2#57 shop portrait selectors — 2026-11-04

The scene producer and display dispatch are now joined from pinned ECL and executable bytes.
This establishes the Amiga shop scene's selector pair and native HEAD/BODY portrait consumer; it
does not settle which archive suffix survives to the portrait call.

- Pinned Amiga `disk3/ECL2.DAX` SHA-256 is
  `801325b455911adf6bea2853067bfe151c19961921018e4c6fd28a0875588812`. DAX block 57 decompresses
  to 1,096 bytes, SHA-256 `96230e908f62a14a289c3cda086c8dc0e43e93e1e8d755a83cde6730300bff8e`.
  Its bytes are identical to DOS `ECL2.DAX#57`. At raw offsets 395–400, `SAVE #69` writes to
  ECL address `0x7EE1`; offset 401 is `PICTURE #68`; offset 404 resets that same address to 255.
  The following instruction at 410 is `PRINTCLEAR` for the shop narration.
- In the Amiga interpreter, Hunk12:`+0x2E38` dispatches SAVE opcode `0x09` to Hunk64:`+0x0468`,
  whose handler calls Hunk61:`+0x2BAA`. The address translator at Hunk61:`+0x1F3C` subtracts
  `0x4B00`, mapping `0x7EE1` to `0x33E1`; Hunk61:`+0x2C4A..+0x2C5A` then computes
  `(0x33E1−0x3100)*2 = 0x5C2` and writes through the state pointer at Hunk5:`+0x3E00`.
- PICTURE opcode `0x0E` dispatches through Hunk12:`+0x2E60` to Hunk64:`+0x0B10`. That handler
  reads the `+0x5C2` head field, passes the head selector and PICTURE body selector to
  Hunk61:`+0x1D20`, and reaches the previously traced Hunk42 HEAD/BODY loader and compositor.
  Therefore this ECL execution requests head 69 and body 68 from the separate portrait archives.
- Demo startup selects ECL block 57 at Hunk12:`+0x31BE`. The startup branch in Hunk1 writes
  suffix 2 at `+0x1D8` for the demo and suffix 1 at `+0x1C6` for the non-demo branch. However,
  the ECL loader and earlier `LOAD_FILES`, `ADD_NPC`, and native CALL instructions run before raw
  offset 401. A bounded static expansion covered 12,264 reachable instruction locations and
  resolved both native CALL dispatch cases. The nine reached references to Hunk5:`+0x246E` are
  reads; no known suffix writer or generic ECL SAVE setter is reached in that slice.
- The reachable `LOAD_FILES` path allocates `0x400` bytes through the Amiga Exec allocator and
  copies four `0x100`-byte chunks to offsets `0x000..0x3FF`. The copy destinations are derived from
  that allocation pointer; NPC allocations use their own returned character pointer. Therefore
  suffix 2 persists under successful, non-overlapping `AllocMem` and correctly bounded `CopyMem`
  semantics. The executable stores the allocation result without an immediate null check, and the
  Exec library implementations are external vectors, so this is a normal-memory-operation
  conditional rather than an unconditional proof against allocation failure or a broken library.

The proven consumer is **portrait art**, not the charS/charT player atlas and not DOS CHEAD/CBODY.
Keep HEAD1/HEAD2 and BODY1/BODY2 as edition-qualified source identities even where local archive
blocks have equal bytes. The HEAD importer now registers disk3 `HEAD2.DAA` blocks 68/69 separately
from disk2 `HEAD1.DAA`; the local 4,669-byte archives share SHA-256
`9e221c31d7addde215a6c007650f81b09ccc5f7d8253b8143562ec7a61a319af`. Exact decoding and source-render
checks establish matching PNG and native-pixel hashes, so two verified pixel-identical links connect
the separate IDs. The matching generated Restyle records link to both source IDs because the full
source PNG hash is identical. This repairs the missing bank-qualified identity; it does not merge
the IDs, establish which archive suffix is live at the call, or approve the composed portrait.

Do not use selector-number similarity to infer semantic subject identity, player appearance
equivalence, animation, or runtime Restyle approval. Until suffix persistence and the relevant
Restyle/component review are established, retain the original-art runtime fallback and leave the
exact Amiga asset mapping unadmitted. These checks were static; no executable, game, browser, build
or image bytes were modified.
