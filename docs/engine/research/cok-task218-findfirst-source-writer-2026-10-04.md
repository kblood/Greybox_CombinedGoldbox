# Task 218: first malformed FindFirst source writer

2026-10-04. This read-only replay continues Task 203/204 on the original
no-key START/VROOMM route. It leaves the DOS service model and retail files
unchanged, injects no input, and stops at the first malformed FindFirst
service. The tracer watches only 16 bytes at the previously captured runtime
source pointer `2491:34D2`, recording guest writes before COMBAT and preserving
the source argument bytes at helper entry.

## Inputs and archive

The replay reproduced the same bytes with no overlays preloaded, no public
stubs patched, and no fake keys. `START.EXE` SHA-256 is
`E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956`;
`GAME.OVR` SHA-256 is
`C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529`.
The as-run probe SHA-256 is
`14E8CE1A1ACFED477E330234A5DE5C21962AC0A6EFB642E1F17178817C5DFADC`.
The 417,142-byte trace archive is
`C:\temp\goldbox_task218_findfirst_path_provenance.txt`, SHA-256
`D4C2443530FD02F83D59ABE8DF7ACDA094F25B304FD594DEBA638FA05424F38B`.
Its first line records those inputs, probe hash, watch address and baseline.

## Last writer for the malformed basename

At helper argument capture, the source pointer again matched `2491:34D2`.
The full length-prefixed string was
`0f 43 3a 5c 76 fc ff 76 fa b0`; the six basename bytes were
`76 fc ff 76 fa b0`. The initial 16-byte watch window after model construction
was all zeroes.

All six basename bytes' last guest writes occurred consecutively at
instructions 77,588,158 through 77,588,163. Each came from the same
`REP MOVSB` at runtime `CS:IP=1A46:0AFB`, bytes
`f3 a4 8e da ca 0a 00 8b`, with `DS:SI=2491:3632` advancing one byte per
write, and `ES:DI=2491:34D6..34DB`. Each captured source byte equals the
corresponding destination value: `76 fc ff 76 fa b0`. The per-byte provenance
audit reports six of six actual bytes matched by their latest guest writer.

The runtime instruction address maps to unpacked START load-image offset
`(0x1A46 - 0x1000) * 16 + 0x0AFB = 0x0AF5B`. The unpacked retail START bytes
at `0x0AF5B` equal the captured instruction prefix `f3a48edaca0a008b`.
This establishes a retail-code copy as the last writer to the malformed
argument buffer; the trace does not establish where the source bytes at
`2491:3632` originated. Unicorn hooks report guest memory writes, not direct
Python/model `uc.mem_write` calls, so the next task must account for model
writes or report them as unobserved if present.

## First malformed DOS search

At instruction 77,588,222, resident START issued `INT 21h AH=4Eh` with
`DS:DX=2491:3446`, `CX=0000`, and DTA `2491:34A7`. The helper had copied the
far source string into its local stack buffer at `[BP-0x50]`. The DOS model
uppercased the six malformed bytes as `VÜŸVÚ°`. The only open handle at the
stop was `GAME.OVR` (handle 5, position and length 269,031). No combat turn or
effect-7 producer was reached.

Task 204 is therefore narrowed: the exact final copy and retail instruction
are known, but the producer/origin of the source temporary at `2491:3632` is
still open. Do not infer that the malformed content itself originated in
retail merely because retail code performed the final copy. Task 219 then
measured the last guest writers of `2491:3632..3637`: another retail START
`REP MOVSB` at `1A46:0B76` copies them from `2491:3734..3739`. The two
instruction addresses are unpacked image offsets `0xAF5B` and `0xAFD6`,
respectively. The immediate source is therefore narrowed again to the
length-prefixed append object beginning at candidate byte `2491:3733`; see
`cok-task219-findfirst-append-source-2026-10-04.md`. Task 219's audit is based
on the first positive-CX copy iteration and the as-run write history, not the
post-REP `CX=0` callback selected by its initial summary code.
