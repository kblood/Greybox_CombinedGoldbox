# Task 219: source of the malformed append bytes

2026-10-04. This is a bounded continuation of Tasks 203/204/218 on the
original no-key START/VROOMM route. Retail START and GAME.OVR were read-only;
the DOS service model and first malformed FindFirst boundary were unchanged.

## Evidence

The 417,142-byte archive is
`C:\temp\goldbox_task219_upstream_findfirst_source.txt`, SHA-256
`E0F994E0B9BA203AD3E52C5896E00FB91004AA62AB9D9908ABB6B912103B87CE`.
Its as-run probe hash is
`FA75716F3314458FADF390EA431F00D92460D4EB0F2DE49A67274715E1A34A4C`.
The inputs match Task 218: START
`E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956`,
GAME.OVR
`C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529`.

The upstream window `2491:362E+24` started as zero after model construction.
At the first path-source call, its bytes were
`0f 43 3a 5c 76 fc ff 76 fa b0 00 50 2e 64 61 78 ...`: a length byte `0f`
followed by 15 payload bytes. At the actual positive-CX copy iteration,
START's helper copied the Pascal string from `2491:362E` to `2491:34D2`.
The source pointer for the REP body was `2491:362F`, the destination was
`2491:34D3`, and `CX=000F`; the bytes consumed matched the upstream window.
The malformed DOS search later remained at instruction 77,588,222 with
`DS:DX=2491:3446` and bytes `C:\` plus `76 FC FF 76 FA B0`.

Each of those six bytes had a guest latest-writer event before the copy:

| Source byte | Last writer instruction | Source register | Destination | Value |
| --- | ---: | --- | --- | --- |
| `2491:3632` | 77,588,094 at `1A46:0B76` | `2491:3734` | `2491:3632` | `76` |
| `2491:3633` | 77,588,095 at `1A46:0B76` | `2491:3735` | `2491:3633` | `FC` |
| `2491:3634` | 77,588,096 at `1A46:0B76` | `2491:3736` | `2491:3634` | `FF` |
| `2491:3635` | 77,588,097 at `1A46:0B76` | `2491:3737` | `2491:3635` | `76` |
| `2491:3636` | 77,588,098 at `1A46:0B76` | `2491:3738` | `2491:3636` | `FA` |
| `2491:3637` | 77,588,099 at `1A46:0B76` | `2491:3739` | `2491:3637` | `B0` |

The eight-byte append also carries `00 50` after those six bytes. The writer
instruction bytes are `f3 a4 8e da ca 04 00 fc`; the runtime segment/IP maps
to unpacked START image offset
`(0x1A46 - 0x1000) * 16 + 0x0B76 = 0xAFD6`, where those bytes match exactly.
Static decoding identifies `0B51..0B7A` as a Pascal string append helper.
Task 220 must capture its invocation frame separately: the helper begins at
`0B51`, and its stack layout is not the `0ADE` copy helper's layout.

## Limits and audit correction

This identifies the immediate guest writer in the modeled replay, not the
origin of its source bytes at `2491:3734..373B`, the exact retail caller's
intended inputs, or whether modeled memory service writes influenced earlier
state. Unicorn guest-write hooks do not observe direct Python/model
`uc.mem_write` calls. The saved event map has guest writers for all six bytes;
Task 220 must trace the Pascal object and caller before attributing the chain.

The as-run trace contains all required per-byte events and the positive-CX
copy data. Its initial automatic summary selected the last REP callback at
`CX=0`, which performs no copy and therefore is not used as evidence. The
probe was corrected to snapshot only the first positive-CX iteration matching
source `2491:362F` and destination `2491:34D3` before the repetition advances.
This correction is committed with the task notes so future reruns report the
same manual audit directly.
