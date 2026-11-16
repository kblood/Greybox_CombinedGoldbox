# Original CoK map loader through C and Rust

Astra source and original-execution planning pass, 2026-10-11. The returned
original loader is proven in Unicorn; its mechanically lifted C implementation
is a subsequent milestone after [original DAX decoding](cok-original-dax-c-rust-plan-2026-10-11.md).

## Entry and original helpers

GAME.OVR descriptor 010Bh has file base 3D296h and code extent 1451h.
`Load3DMap` occupies offsets [130Dh,144Ch), with its real RETF 2 at 1449h.
Entry words are return IP, return CS, map ID; the ID's low byte is used.
The original pre-relocation loader code SHA-256 is
`e89d079a1ebb4ab66a533f434933e74ebefd2acbbaf6b8240c30f6b147828f76`.

| Helper in resident CS 0A46h | Extent, end excluded | Argument words after far return | Cleanup |
| --- | --- | --- | --- |
| Pascal assignment | 0AC4h..0ADEh | Source far pointer, destination far pointer | RETF 4; destination remains on caller stack |
| Pascal concatenation | 0B51h..0B7Dh | Source far pointer, destination far pointer | RETF 4; destination remains on caller stack |
| Decimal formatter | 131Fh..136Ah | Maximum characters; destination far pointer; minimum width; signed 32-bit value | RETF 0Ch |
| Memory copy | 163Eh..1661h | Count; destination far pointer; source far pointer | RETF 0Ah |

Root's byte audit corrected previously truncated exclusive endpoints. Assignment
RETF 4 begins at 0ADBh, concatenation RETF 4 at 0B7Ah, copy RETF 0Ah at 165Eh
and formatter RETF 0Ch at 1367h; each occupies three bytes. Original execution
used the complete resident image, so the baseline runs were unaffected.

The formatter calls near helper [120Dh,125Fh) and reads the indexed 40-byte
CS table [125Fh,1287h). Protect this complete data extent explicitly; the
current absolute-address operand scan does not discover indexed reads.
Table SHA-256: `5341f5b7f6f0db9322cdad9510ada58631e3f776561d46010ee03e41212665c7`.
The loader's Pascal strings occupy overlay [12E3h,130Dh), SHA-256
`3230fa1e46f6e4be10e085a788c5dda0de25eeec69b553e795c1ab255cff326d`.

The original copy chooses direction by SI/DI offsets alone, including when
segments differ. Preserve its original overlap and DF behavior.

## Two explicit temporary host services

Resource lookup/allocation at original 069C:088Eh consumes 18 argument bytes:

| Offset from entry SP | Argument |
| --- | --- |
| +04h | Output-pointer-cell offset |
| +06h | Output-pointer-cell segment |
| +08h | Output-size-word offset |
| +0Ah | Output-size-word segment |
| +0Ch | Map ID word |
| +0Eh / +10h | Pascal suffix offset / segment |
| +12h / +14h | Pascal stem offset / segment |

Validate stem `GEO1`, suffix `.dax`, and admitted IDs 32 or 34. Supply one owned
1,026-byte decoded member, write its far pointer and extent 0402h into the
specified output cells, and perform a real far-return equivalent with SP+=22.
The compiled implementation should obtain that member through original lifted
DAX decoding. Full original resource lookup and allocation remain separate work.

Release at original 0A46:0254h consumes extent, allocation offset and allocation
segment at SP+04h/+06h/+08h. Its RETF 6 advances entry SP by 10 bytes. Require
the matching live allocation and extent, exactly one release and no subsequent
read from the released resource. Logical ownership is host-tracked; the source
probe retained bytes after release to inspect memory effects.

Both source probes' synthetic services preserved all registers and FLAGS
except return CS/IP/SP and the specified output memory. The final register
baseline below is conditional on that documented service contract.

## Original execution baseline

Four complete original runs passed: IDs 32/34 at resident load bases 0000h and
1000h, with independently placed overlay CS=3000h. Each executed 1,342 original
instruction hooks, including REP iterations, excluding two intercepted service
entries and the return sentinel. Original naming, decimal/string helpers,
four copies and final map-ID effects ran unchanged.

Initialize DS=5000h, SS=6000h, SP=F000h, BP=1234h, FLAGS=0602h and other general
registers zero. DS:5782h=1, DS:6D7Ch points to 7400:0000, DS:4B28h points to
7600:0000. The map allocation has 1,024 bytes followed by 32 A5h guard bytes;
the 512-byte context is filled with 5Ah. The resource resides at 7800:0000.
The observed stack fits [EE00h,F006h); derive the exact write allowlist from
the execution trace when implementing admission.

Resource entry SP=EED8h receives words:
`EFF8,6000,EFFC,6000,mapID,EEEE,6000,EEF3,6000`.
The output cells are **SS:EFF8h and SS:EFFCh**. Release entry SP=EEE4h receives
`0402,0000,7800`.

Four original copies each move 0100h bytes from source offsets
0002h/0102h/0202h/0302h to destination offsets 0000h/0100h/0200h/0300h.
The complete output matches the pinned map hashes:

- 32: `02d17c09ef4250bedca5320251cce6d5e558fbda5a7b9008783cef5ffc6bfc4f`
- 34: `41c4da84def6b42d18e8d91f21226204492c65a1bac7e7afcee7b183f32b4e5f`

Only context bytes +018Ah/+018Bh change from 5Ah to the map-ID word. The trailing
map guard remains unchanged. Final state: AX=mapID, BX=EEE0h, CX=0, DX=5000h,
SI=0402h, DI=0, BP=1234h, SP=F006h, ES=7600h, DS=5000h, FLAGS=0246h,
CS:IP=F000:0000. Thus the original loader returns, releases its resource and
updates the map ID; a copy checkpoint alone is insufficient evidence.

## Relocation and compiled acceptance

Add the resident load segment L to all 621 START relocation targets and all
57 overlay fixup words, modulo 16 bits. Overlay placement is independent:
at L=1000h, resident targets 0A46h/069Ch become 1A46h/169Ch while overlay CS
remains 3000h. The loader contains 16 fixup words at offsets
132Ch,133Ch,1346h,1356h,1369h,137Bh,138Dh,1392h,1397h,139Fh,13A4h,13C2h,
13E4h,1406h,1428h,1436h. Preserve source identity separately from relocated bytes.

SOL should mechanically lift these routines and data dependencies, then Luna
should verify the real return, original state/memory effects, allocation
ownership, all four copies and final map ID. Query and display the newly loaded
buffer through the existing original WALL/DOOR path. Admit extent 0402h first;
error branches require their actual services rather than successful placeholder
returns. This milestone still does not establish original VROOMM startup,
resource lookup/allocator execution or playable exploration.

## Original-execution oracle limitation

During the compiled loader comparison, SOL isolated an observer issue in the
installed Unicorn 2.1.4 Windows build. Luna independently reproduced it on
Windows 10 build 19045, Python 3.13.7, using a fresh 16-bit guest per variant:
caller 3000:0000 contains synthetic bytes `9A00000040F4` (CALL FAR 4000:0000,
HLT), callee 4000:0000 contains `CB` (RETF), SS:SP=5000:F000 and FLAGS=0202h.
A code hook stops at 3000:0005; execution is bounded to 20 instructions.

With no memory observer, execution is 30000h → 40000h → 30005h and restores SP.
A global no-op UC_HOOK_MEM_READ instead loops between the first two addresses
and returns to 3000:0000. A no-op UC_HOOK_MEM_WRITE control returns correctly.
These are synthetic test instructions, not original game bytes. The finding
is scoped to this tested installation/configuration, not every Unicorn host.

The loader oracle therefore inspects decoded memory operands from code hooks
for resource-lifetime policy and uses memory-write hooks for changed bytes.
The production C runtime still checks actual guest reads. A future library
update may fix the observer issue; diagnostics should report its presence,
not require the defect to remain. Avoid the affected observer when claiming
original far-return or loader/query comparisons on this installed version.
