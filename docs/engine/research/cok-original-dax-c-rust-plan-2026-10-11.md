# Original CoK DAX decoder through C and Rust

Astra planning pass, 2026-10-11. This is a planned execution slice, not a shipped
resource loader. It follows the original wall/door query milestone.

## Source and machine boundary

| Routine | Original address / resident image offset | Far arguments after return IP/CS | Cleanup |
| --- | --- | --- | --- |
| DAX decoder | 069C:06C4 / 7084h | File-record far pointer; expected-size-word far pointer; output-pointer-cell far pointer | RETF 0Ch |
| Block read | 0A46:14B4 / B914h | Actual-count far pointer; record count; destination far pointer; file-record far pointer | RETF 0Eh |
| Record check | 0A46:146F / B8CFh | ES:DI points to the file record | Near RET |
| Fill | 0A46:1661 / BAC1h | Value word; count word; destination far pointer | RETF 8 |

The decoder occupies offsets 06C4h..077Fh and allocates 206h stack bytes. Its
output argument points to a cell containing a destination far pointer. It calls
only the original block-read and fill routines.

Use a fixture file record containing handle, magic D7B3h and record size 1.
The original read wrapper reaches DOS INT 21h/AH=3Fh: BX is the handle,
CX the requested byte count, DS:DX the destination. A host service can read
one immutable compressed-member stream, advance its cursor, return AX bytes
read and clear CF. Admit only that service for this milestone.

At block-read entry, SP+04 is the actual-count far pointer, SP+08 the record
count, SP+0A the destination far pointer and SP+0E the file-record far pointer.
The decoder passes a null count-output pointer. In that case short reads set
DS:43ACh. The decoder does not establish robust malformed-stream recovery;
admit source-pinned valid extents, bound destination writes and stack access,
and reject short reads or instruction-budget exhaustion.

## Original control semantics

- 00h..7Eh: copy control+1 literal bytes.
- 81h..FFh: repeat the following byte 256-control times.
- 7Fh and 80h: consume the control without producing output.

Astra executed literal, repeat, both skipped controls, maximum 127-byte literal
and maximum 127-byte repeat cases through the original routines with only the
DOS read service supplied. DS was restored; the decoder's real far return
advanced SP by 16 bytes. Literal-only input preserved initial DF=1; a repeat
cleared DF through the fill routine.

The shared `tools/dax_decode.py` treats 7Fh and 80h differently. Use a separate
CoK comparison model for these boundaries. Changing the shared decoder requires
separate evidence for its other supported games.

## Relocation and acceptance

Astra also executed both original compressed GEO members through the original
decoder and helpers, supplying only DOS reads:

| Member | Compressed bytes / consumed | DOS reads | Original instruction-hook steps | Decoded SHA-256 |
| --- | --- | --- | --- | --- |
| 32 | 990 / 990 | 424 | 26,648 | `58af709835bb45703cb89e47cc7369e4d863023933fd8b91155410cdc35ea052` |
| 34 | 825 / 825 | 420 | 26,545 | `68dd1f4d8dc18e558b3e8d839cbe16362522f08c4a05648ed75c7aab444400ba` |

Both produced 1,026 bytes and returned to F000:0000, restoring DS=5000h and
advancing SP from F000h to F010h. Initial DF=1 ended cleared, DS:43ACh remained
zero and the trailing 32 guard bytes were unchanged. These are original-only
feasibility measurements, not results from the future compiled decoder.
Its budget must exceed the query fixture's current 10,000 instructions;
100,000 is a suitable bounded starting allowance.

Original block-read probes returned normally but recorded errors: a short read
with a null count pointer sets DS:43ACh to 100; a supplied count pointer receives
the actual count and leaves error state zero. DOS CF=1/AX=5 records error 5 and
leaves the destination unchanged. Invalid record magic makes no DOS call and
records 103. All probes returned with SP=F012h. The decoder does not check this
error state: the host runner must stop on a recorded read failure before
resuming unsafe decoding or accepting output.

Four resident relocation words at image offsets 70AAh, 70D6h, 7108h and 7123h
are far-call segment words targeting A46h. They are unchanged at load base zero.
At load segment L, add L and dispatch through CS=L+069Ch and L+0A46h. Keep
original source identity separate from relocated execution bytes. This slice
does not require an indexed CS data table.

SOL 6.1 should implement the slice, then Luna 6 independently verify:

1. Original compressed GEO1.DAX members 32 and 34 produce all 1,026 bytes,
   with the correct consumed-stream position, guest state and real return.
2. Bytes 2..1025 feed the original wall/door queries and the Rust map view.
3. Synthetic skipped controls, signed run limits, DF effects and short-read
   rejection are covered.
4. A deliberately wrong read or segment implementation fails comparison.

The next milestone is a returned original `Load3DMap` invocation, described in
[the reconstruction goal](cok-c-rust-reconstruction-goal.md). Its formatter
needs explicit protection for indexed CS table 125Fh..1286h. Original resource
lookup/allocation and VROOMM boot remain further execution dependencies.

## Graphics-resource feasibility

Astra subsequently ran the same unchanged original decoder/read/fill path on
three graphics resources, supplying only DOS reads. These are original-only
measurements for later compiled coverage, not rendering evidence.

| Member | Compressed / consumed bytes | Decoded bytes | DOS reads | Original instruction hooks | Decoded SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 8X8D1.DAX 201 | 1,341 / 1,341 | 1,416 | 672 | 42,258 | `fca3a918bd20e24456f579d20341278a21d3b5f5b4e205384fadeb551ce091c1` |
| 8X8D1.DAX 202 | 1,080 / 1,080 | 1,233 | 842 | 53,080 | `348d454b20f8504385b6e115f8463e61d727cb734da15a7f41a87d13212a2b4a` |
| WALLDEF1.DAX 1 | 1,550 / 1,550 | 1,560 | 478 | 30,069 | `bec81526a3567d3aac5fa797e40f2ead68aeee935de332be9e5962e0e9dfb2c3` |

All reached the real return F000:0000, SP=F010h, restored DS=5000h, changed
FLAGS from 0602h to 0246h, left I/O state zero and preserved the trailing
32-byte A5h guard. The generic Python reader agreed byte-for-byte for these
held streams. A 100,000-instruction budget covered each.
Archive SHA-256 values are
`14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915`
for 8X8D1.DAX and
`70cf9f18fe0dc87bf5cec047c52a33ad48dc543d48812d627c3b05579c29be85`
for WALLDEF1.DAX. This does not prove their graphics layout or display execution.
