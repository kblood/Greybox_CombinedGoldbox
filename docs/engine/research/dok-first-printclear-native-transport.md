# DoK opening PRINTCLEAR: bounded native transport

The retail `Death Knights of Krynn/ECL1.DAX` has SHA-256
`d2fe2c3937dfc71d692aa60e3e54d251a9a52dd708a457b04859090e2664dd44`.
Decoded block 16 is 1,809 bytes, SHA-256
`35c39ef71e02771e2ff37475b93bc4c74019004488826a151cc53c88311945ea`.
At decoded offset 60, opcode `12h` (`PRINTCLEAR`) has a packed text operand
at `[63,222)`: 159 source bytes decode to 212 characters. Byte 222 is
opcode `1Dh`. Its presentation semantics are unproven, so the disposable test
copy changes only that byte to `EXIT`. This evidence covers the first literal,
not the rest of the opening sequence. The retail archive is read only.

## Native transport

When CCFLOW invokes CCECL to inspect an effect, it marks the child through
the DOS EXEC FCB1 field. For supported Gen1 DAX `PRINT` and `PRINTCLEAR`
operands whose decoded text exceeds 32 characters, the marked CCECL child
places a 34-byte `DREF` in the existing event text slot: `FFFFh`, `DREF`,
area id, packed block offset, packed byte length,
raw block length, then zero padding. Short strings retain the v1 inline text
slot. Direct CCECL calls have no source resolver and retain the historical
32-character inline prefix. CCECL occupies 65,211 resident bytes, below its
65,213-byte task ceiling; the 2026-09-24 engine build reports 69 bytes of
COM headroom.

CCFLOW resolves each source reference against its original DAX area and raw
block bounds. Its 2,304-byte TOC buffer covers all 256 possible nine-byte
entries; the 2026-09-24 engine build reports 54,957 resident bytes and
10,323 bytes of headroom including its 16 KiB DAX scratch. It spools records
to a private `.GBT` and packed bytes to a
private `.GBP`, then publishes the same-stem `.GBS` only after validation and
close. A v2 GBSL file has its unchanged eight-byte header and 54-byte rows,
followed by `GBPX`, extension version 1, tag count, 32-bit packed payload
length, eight-byte directory entries `(row, payload offset, packed length,
decoded length)`, and the packed source bytes. A tagged row contains
`FFFFh`, `GBPX`, a directory index, and zero padding in its 34-byte text
slot. The v2 extent is bounded to 65,535 bytes and at most 1,213 rows;
ordinary v1 sequential streams retain their prior arbitrary-length path.

CCFP validates the entire v2 sidecar and pages by `(event ordinal, decoded
character offset)`. A 117-character page can end within a single packed
literal; Enter continues at the next character without applying PRINTCLEAR
again. A preceding 116-character page returns before adding a separator for
a following long `PRINT`, so the next Enter starts that event at character
zero. Its `/Z` selected-event diagnostic skips long tagged rows. CCEFX
streams full decoded text for diagnostics. CCHOST validates v2 before damage
preflight or journal use, including a 32-bit seek for an embedded journal
sidecar. Every consumer rejects malformed tag order, row opcode, zero padding,
directory bounds, packed decode length, or file extent.

A long print followed by a v14 interactive yield keeps the historical
unflagged 32-character inline prefix; it does not publish a v2 sidecar.
Saturated tagged v14 yields fail closed. This avoids implying that v14
sidecar damage and journal semantics have been established.

## Reproduction boundary

`pwsh -NoProfile -File native/ccflow-long-text-test.ps1 -Headless
-GameLinkPaging` constructs disposable DAX copies from the two verified source
blocks. Block 16 still ends with fixture-only `EXIT` at byte 222. One copy
changes only decoded character 126 of its first literal from `T` to `X` by
replacing its six-bit packed symbol, keeping the 159-byte operand and all
instruction boundaries. Two-entry copies include real block 17 (7,430 decoded
bytes, SHA-256 `706970e83b631939b99f46fd073d5f2b0a853283da6241982ff5fec57b9cf3bf`);
one changes its first PRINTCLEAR character from `A` to `X`, but CCFLOW still
selects block 16. The fixture checks exact GBSL payloads and full CCEFX text,
then runs CCFP `/W` in fresh focusless DOSBox-X processes. GameLink captures
the first 117-character page, presses Enter, captures the final 95-character
page, and checks effect/RNG/sidecar plus party and damage-journal file state
across each advance. It also tests direct CCECL inline32 compatibility, the
v14 fallback, and four malformed v2 sidecars.

The 2026-09-24 source-ownership pass found byte-identical 5,750-byte GBEF
effects across all four copies, including picture, pose, VM and RNG fields.
The 295-byte GBSL and both pages remain byte/pixel identical when only
unselected block 17 changes. The selected block-16 mutation changes only its
packed payload and character 126 on page 2; all first-page RAW buffers and
640×400 GameLink PNG pixels match. On page 2, exactly 116 screenshot pixels
change within x=160..173, y=338..351, the BIOS text cell for page-relative
character 9 (row 22, column 10). All other screenshot pixels match. RAM
captures verify the exact 117+95 decoded text and the mutated character;
DOSBox-X's GameLink physical A0000 RAM dump does not expose VGA pixels, so the
pixel comparison decodes PNG captures. The visible glyph lies away from the
right-edge clipping seen in earlier screenshots. Luna preserved the four DAX
copies, both page captures and RAM dumps, diagnostics, and run log under
`native/build/ccflow-long-text-source-ownership-evidence-20260924-195954/`;
the focused command exited zero. No retail archive is written.
`native/ccflow-test.ps1 -Headless` contains the v1 absent-sidecar and
greater-than-64-KiB stream controls. The engine build passes with the resident
sizes above. Luna's first focusless pass found an ES=A000h error in CCFP's
second-page text copy; bracketing the v2 builder with ES=DS fixed it. Her
subsequent 2026-09-24 pass observed both distinct frames and exact 117+95
character RAM pages, while the v1 control produced a 65,564-byte GBSL with
1,214 records. A subsequent focusless run also passed the 116-column
separator-boundary regression: first 116 short-text characters, then Enter to
the first 117 long-text characters, then Enter to its final 95. The full
`cchost-test.ps1 -Headless` runner passed with direct v2 DAMAGE and malformed
v2 rejects; its 65,502-byte v2 sidecar was accepted inside a journal beyond
64 KiB, and unmodified production CCHOST recovered the roster and source
preimages from that prepared journal. These are native fixtures, not evidence
for unproven DoK opcode `1Dh` behavior or the full retail intro.
