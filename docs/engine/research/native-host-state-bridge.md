# Native host-state bridge — 2026-09-12

## First extraction: effect transcripts

GBBOOT has 156 resident bytes free, while CCEFX has ample capacity. The
first extraction moves the host-owned decision that turns `_GBECL.BIN` or
`_GBRES.BIN` into the corresponding transcript out of GBBOOT and into CCEFX.

GBBOOT publishes `_GBHOST.BIN` beside its other tool-owned sidecars before
invoking `CCEFX /H <absolute-state-path>`. The record is
exactly 12 bytes, little-endian:

| Offset | Field | Requirement |
| --- | --- | --- |
| 0 | `char[4] magic` | `GBHS` |
| 4 | `u16 version` | `1` |
| 6 | `u16 mode` | `1` = ECL, `2` = resume |
| 8 | `u16 flags` | zero |
| 10 | `u16 reserved` | zero |

CCEFX `/H` reads exactly 12 bytes, rejects every other length, magic,
version, mode, flag, or reserved value before opening either input or output.
It derives its input and transcript paths from the state file's directory:
mode 1 resolves `_GBECL.BIN` -> `_GBECL.TXT` and mode 2 resolves
`_GBRES.BIN` -> `_GBRES.TXT`. `/H` without a path retains `_GBHOST.BIN` in
the current directory for standalone diagnostics; its ordinary two-path
interface remains unchanged.

Validation must retain byte-identical transcript output for representative CoK
and DoK effect/resume flows, prove malformed and truncated GBHS files create no
transcript, and show GBBOOT's measured resident headroom increases.
