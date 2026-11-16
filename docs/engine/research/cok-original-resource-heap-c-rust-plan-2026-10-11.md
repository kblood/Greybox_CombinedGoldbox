# Original CoK resource lookup and heap through C and Rust

Astra original-source/execution proof, 2026-10-11. This is the planned removal
of the temporary Load3DMap resource/release callbacks, not a compiled result.

## Original-only proof

Both GEO1 members returned the exact pinned 1,026-byte output through original
069C:088Eh, including original lookup, directory scan, allocation and decoder.
Original 0A46:0254h release then restored the observed heap globals.

| Operation | Original instruction hooks |
| --- | --- |
| 0A46:0000 initialization | 442 |
| GEO1 member 32 resource lookup | 29,439 |
| GEO1 member 34 resource lookup | 29,574 |
| 0A46:0254 release | 85 |

All reached real far returns. No host allocator callback was supplied. DOS
allocation functions 48h/49h/4Ah were explicitly forbidden and never occurred;
the existing shim's memory-block registry remained empty. Both handles closed,
DS:43ACh remained zero and no unsupported service/interrupt occurred.
The earlier historical harness was unavailable locally; these were fresh
ephemeral probes using its documented initialization approach and DOS shim.

## Initialized guest contract

Use the complete load image with 621 relocations at L=1000h. The initialization
fixture has ES=PSP segment 0FF0h, PSP:[2]=C000h, SS=2491h, SP=4000h and sentinel
far return F000:0000. Original 0A46:0000 establishes DS=1BC6h and these values:

| DS field | Observed value |
| --- | --- |
| 437Ah / 437Ch | 2892h overlay-arena base/next |
| 437Eh | 2F49h overlay-arena end |
| 4388h / 438Ch / 4394h | 2F49h heap pointers |
| 4390h | C000h heap limit |
| 439Ah | Allocator fallback far pointer 1A46:00A9h |

These are fixture results, not production heap/stack addresses. A real CALL
enters with a different initial SP, and PSP allocation bounds must come from
the actual supported process-memory contract rather than this test constant.
Initialization used 19 DOS vector gets (35h), four vector sets (25h: vectors
00h/23h/24h/3Fh), and one IOCTL 4400h, without DOS allocation.

Set DS:5782h=1 and path selector DS:5884h=0. Place Pascal stem GEO1 at DS:1000h,
suffix .dax at DS:1100h, output far-pointer cell at DS:1200h and size word at
DS:1300h. Relocated resource entry 169C:088Eh receives words:
`1200,1BC6,1300,1BC6,mapID,1100,1BC6,1000,1BC6`.
Its RETF 12h advances the fixture SP to 4016h. The allocation is 2F49:0000,
extent 0402h; observed byte-granular heap pointers advance to 2F89:0008.
Original allocator 0A46:023Fh accepts size word, returns AX offset/DX segment,
and uses RETF 2. Original release receives `0402,0000,2F49`, returns via RETF 6
with SP=400Ah, and restores observed heap globals to pre-allocation values.

## Host services and reached source

Lookup used two independent file handles/cursors: directory and compressed
payload. It used SetDTA 1Ah twice, exact-archive FindFirst 4Eh twice, open
3Dh/AL=02h twice, read 3Fh 429 times and close 3Eh twice. Member 32 used two
absolute seeks to archive offset 20 decimal. Member 34 used directory absolute
20, payload relative-zero tell/end-zero length/absolute-11 restore, then
directory absolute 1010. Preserve observed seek origin semantics.

The source requests read/write open mode 02h; this bounded host service supplies
immutable backing and rejects actual writes. No BIOS, video or port service was
needed. Implement path/search/DTA behavior explicitly rather than mapping the
two source handles to one preselected compressed stream.

Reached resident helper entries include existing strings 0A46:0ADEh/0AC4h/0B51h,
07E8:0020h status, 0A46:0D79h, path/search 09C4:0256h/0112h, file record 0A46:139Bh,
open 13C9h, read 14B4h, seek 151Ch, length/tell 154Ch, close 144Ah, allocation
023Fh and fill 1661h. Resource segment 069Ch includes 0780h open-pair, 02A7h
path/open, 04C1h existence, 06C4h decoder and 0873h close-pair. Root 088Eh ends
with RETF 12h at 0A3Bh..0A3Dh. Allocation calls near 0308h; release calls near
03D3h; include their reachable shared routines rather than host replacements.

Dynamic coverage was 2,145/2,253 distinct instruction bytes for members 32/34,
including already lifted code. This is exercised coverage, not complete CFG
extents. Carry original relocated resident data, path records at DS:1E4Ah plus
area times 1Eh, file-mode/defaults at 43B2h and status data. Enumerate indexed
data reads and validate source identity; do not synthesize empty globals.

## Next compiled acceptance

Mechanically lift this path, initialize through original code and provide only
the listed DOS services. Verify both archive results, two cursors, real far
returns, original allocation and heap restoration. Then call returned
Load3DMap with these original resource and release procedures, preserving guest
heap ownership. This removes a documented high-level host boundary while
keeping platform services explicit. Original VROOMM, boot, display, exploration,
combat and save/load remain separate requirements of the full game goal.
