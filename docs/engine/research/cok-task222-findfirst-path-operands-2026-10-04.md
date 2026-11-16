# Task 222: operands that assemble the malformed path

2026-10-04. This bounded trace continues the no-key START/VROOMM replay from
Tasks 218–221. It adds no input or DOS result and leaves retail START and
GAME.OVR read-only.

## Evidence

The 595,960-byte archive is
`C:\temp\goldbox_task222_findfirst_path_operands.txt`, SHA-256
`570C4C5BB52A8AEAF92CF6CEC5443871988E1EF9518D0BFAA19E5FC73881FA20`.
The as-run probe hash is
`A4BFF949A0C9B5CDAB748BAE23C1F29E94E213AA8CD57B1D1DE5FBD181CBDB51`.
START SHA-256 is
`E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956`;
GAME.OVR SHA-256 is
`C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529`.

At `169C:0780` entry (instruction 77,587,601; `SS:SP=2491:3ABA`), the left
far argument is `2491:3C37` and the right is `2491:3BE6`. Their actual Pascal
objects are:

| Operand | Pascal length | Payload |
| --- | ---: | --- |
| Left `2491:3C37` | 9 | `76 FC FF 76 FA B0 00 50 32` |
| Right `2491:3BE6` | 4 | `2E 64 61 78` (`.dax`) |

Capacity-`14h` helper `0ADE` copies the left argument to local `2491:3AA2`
(return `169C:079A`, instruction 77,587,613; first positive-CX body
77,587,625) and the right to `2491:3A8D` (return `169C:07AD`, instruction
77,587,646; body 77,587,658). Both destination objects started as zero.
The copy hook records the exact source pointer, length byte, payload, and
first body registers for each.

START assigns the left object into `2491:3989` through `0AC4` (return
`169C:07BD`, entry 77,587,672; first positive-CX body 77,587,681), then
appends the right object through `0B51` (return `169C:07C7`, entry 77,587,697;
first positive-CX body 77,587,710). The observed right destination begins at
`2491:3993`, exactly after the left length of nine. The assembled Pascal
object is length `0D`, payload
`76 FC FF 76 FA B0 00 50 32 2E 64 61 78`, byte-for-byte equal to Task221's
input at `2491:3822`.

The memory-write watch confirms the local left and right objects began as
zero and received their length and payload from their respective arguments.
The writer registers show the left source payload at `2491:3CA6..3CAE` and the
right at `2491:3CA1..3CA4`; these are payload starts, so the corresponding
Pascal headers are `2491:3CA5` and `2491:3CA0`. The first malformed FindFirst
service remains instruction 77,588,222 with basename `76 FC FF 76 FA B0`.

## Limit and next boundary

This closes the exact two-operand assembly and joins it to Task221's splitter
input. The source Pascal objects at `2491:3CA0` and `2491:3CA5` have not yet
been traced to their producer. Task 223 should capture both objects from
initialization, preserve their true lengths, writers, and caller argument
frame, then trace their producer or report a bounded unobserved origin.
