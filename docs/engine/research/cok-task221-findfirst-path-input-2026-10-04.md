# Task 221: trace the path-splitter input

2026-10-04. This bounded trace continues Tasks 203/204/218–220 on the same
no-key START/VROOMM replay. Retail START and GAME.OVR were read-only; no DOS
search result or keyboard input was injected.

## Evidence

The 568,828-byte archive is
`C:\temp\goldbox_task221_findfirst_path_input.txt`, SHA-256
`173710D27433A18AC8D8CB682E8F81C6A91258AD7F312AE1893B5E92B8C99678`.
The as-run probe hash is
`985547D41761F4D676051DF47BAE57BE042AC62EADA961C25D5EE909CD5FBDBB`.
START SHA-256 is
`E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956`;
GAME.OVR SHA-256 is
`C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529`.

At `169C:02A7`, before the prologue, entry `SP=3876`; stack offsets
`+0E/+10` decode the incoming far path pointer as `2491:3989`. Its Pascal
object begins `0D 76 FC FF 76 FA B0 00 50 32 2E 64 61 78 ...`: length 13 and
payload `76 FC FF 76 FA B0 00 50 32 2E 64 61 78`. This exactly matches the
source pointer and declared object bytes at the subsequent `1A46:0ADE` helper
call (instruction 77,587,744; return `169C:02C1`; capacity `0050`). The helper
copies from `2491:3989` to local `2491:3822`; its first positive-CX body at
`1A46:0AFB` is instruction 77,587,756, reads `2491:398A`, writes
`2491:3823`, and copies 13 bytes.

The path splitter at `19C4:0256` receives extension destination `2491:372E`,
basename `2491:3733`, directory `2491:373C`, and input `2491:3822`; its far
return is `169C:02F1`. The Pascal input still has length `0D` and the same
payload. Its first six payload bytes are exactly the malformed basename.
Each has a guest last-writer event in the helper copy:

| Input byte | Instruction | Source | Destination | Value |
| --- | ---: | --- | --- | --- |
| `2491:3823` | 77,587,756 at `1A46:0AFB` | `2491:398A` | `2491:3823` | `76` |
| `2491:3824` | 77,587,757 at `1A46:0AFB` | `2491:398B` | `2491:3824` | `FC` |
| `2491:3825` | 77,587,758 at `1A46:0AFB` | `2491:398C` | `2491:3825` | `FF` |
| `2491:3826` | 77,587,759 at `1A46:0AFB` | `2491:398D` | `2491:3826` | `76` |
| `2491:3827` | 77,587,760 at `1A46:0AFB` | `2491:398E` | `2491:3827` | `FA` |
| `2491:3828` | 77,587,761 at `1A46:0AFB` | `2491:398F` | `2491:3828` | `B0` |

The replay stops at the established first malformed FindFirst service at
instruction 77,588,222 with `DS:DX=2491:3446` and basename
`76 FC FF 76 FA B0`. This proves the input copy and caller argument join in
the modeled replay. It does not trace how the caller's source object at
`2491:3989` was produced, nor establish intended retail state or a retail bug.

## Next bounded task

Task 222 should watch `2491:3989` from replay initialization, retain its
length-prefixed object and per-byte guest writers, and find the producer before
the `169C:02A7` caller consumes it. Capture an earlier copy/helper or report a
bounded unobserved origin. Preserve the same route and first malformed service
boundary; do not infer validity from the modelled replay alone.
