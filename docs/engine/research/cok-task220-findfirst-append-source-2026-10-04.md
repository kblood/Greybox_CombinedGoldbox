# Task 220: source of the malformed append object

2026-10-04. This bounded trace extends Tasks 203/204/218/219 on the original
no-key START/VROOMM replay. Retail START and GAME.OVR were read-only. The
modeled DOS services, initial state, and first malformed FindFirst boundary
match the preceding captures.

## Evidence

The 501,150-byte trace is
`C:\temp\goldbox_task220_findfirst_append_source.txt`, SHA-256
`7162729CF87C1F6973E9EC31E595BCFB689C2A83CF0829B18AFF761217088F6D`.
The as-run probe hash is
`7E53A8E42E57AFA7CB2BD54DF50687D7A5F7E76A782645801834F75556EC959D`.
START SHA-256 is
`E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956`;
GAME.OVR SHA-256 is
`C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529`.

At helper entry `1A46:0B51`, the relevant call is instruction 77,588,081,
return `169C:0328`, with far source `2491:3733` and destination `2491:362E`.
The source Pascal object is `08 76 FC FF 76 FA B0 00 50`; its eight-byte
payload is `76 FC FF 76 FA B0 00 50`. The first positive-CX body at
`1A46:0B76` is instruction 77,588,094, with `DS:SI=2491:3734`,
`ES:DI=2491:3632`, and `CX=8`. Its source bytes match the object payload.
The exact frame and first-copy state are logged in the trace.

The object's six malformed basename bytes and trailing `00 50` were last
written at instructions 77,587,994..77,588,001 by `REP MOVSB` at
`CS:IP=19C4:02B5`, from `2491:3823..382A` to `2491:3734..373B`. Each byte
matches. Runtime `19C4:02B5` maps to unpacked START image offset `0x9EF5`,
where `f3a48bf3c3000000` matches. Static disassembly places this copy in the
path-splitting routine entered at `19C4:0256`; that routine splits directory,
basename (up to eight bytes), and extension (up to four bytes).

The first malformed FindFirst boundary remains instruction 77,588,222, with
the normalized pattern `VÜŸVÚ°` and raw basename `76 FC FF 76 FA B0`. The
source watcher at `2491:3733` began as zero. This closes the append boundary
and identifies the immediate path-split copy; it does not establish the
origin or correctness of the input path or prove a retail defect.

## Probe correction

The first run exposed two adjacent append calls: the malformed basename call
from `3733` at instruction 77,588,081, followed by a `.dax` suffix call from
`372E` at instruction 77,588,109. The second call had overwritten the saved
frame. The final probe filters the helper frame by source/destination and
return address, then binds the first positive-CX body to the exact `DI=3632`,
`CX=8` iteration. Its successful replay stops at the established boundary.

## Next bounded task

Task 221 should watch the input Pascal path at `2491:3822` (length byte;
payload begins at `3823`) before the path-splitting routine at `19C4:0256`.
Capture its far-pointer arguments from the entry stack and trace preceding
guest writers or an earlier `0ADE` producer. Audit the six consumed bytes
against the captured input object, report model-write/unobserved gaps, and
retain the same no-key replay and first malformed service boundary. This is
source research, not authorization for an engine repair.
