# Paired WORLD closure: source admission review

Source review only, 2026-10-15. No applications, builds, generation or tests run by Astra. M2 remains open.

## Evidence and decision

Luna's isolated inventory `build/cok-recomp/world-persistence-sol-candidate-20261015-a/world-inventory.json`, SHA-256 `8725a6f14dc46cf59a9e137eaa869b08441c483ffe7a6b01b072b7fbdd9b0ba4`, records 2,079 new tuples / 5,472 new unique instruction bytes. Both root-local rosters match (load 26, save 22); there are no pending extents or exhausted analysis limits. Luna reports 23 controls passed. Its 31 unresolved sites are **all already admitted baseline tuples**. `complete=false` correctly records unresolved service/dispatch semantics.

Approve preparation of one isolated, whole-helper admission candidate within the existing 32,768-byte limit. This is permission to prepare and review original-code admission, not acceptance of complete runtime service coverage or world persistence. No actual source application during the GUI lease. No guessed table, service success, filename or save schema.

## Every interrupt site (25)

| Original site | Source-proven request | Current contract |
| --- | --- | --- |
| 0661:0333, 07E8:130F | INT21 AX2508, restore timer vector | Existing startup service AH25; admitted IVT writes |
| 0A46:0164 | INT21 AH25, vector from original loop | Same AH25; preserve original vector/value and memory guards |
| 0962:0306, 0962:0152 | INT16 AH01 | Existing keyboard status, ring validation and journal |
| 0962:031D, 0962:0158 | INT16 AH00 (031B clears AH) | Existing consuming keyboard service; preserve all consumed events |
| 0962:0169 | INT23 | Unsupported exceptional CtrlBreak path; no proven return |
| 0962:060F | Generic INT10 wrapper | Request-dependent; see text-console limitation below |
| 09C4:00A7 | INT21 AH2C | Existing deterministic device-clock time |
| 09C4:00E6 | INT21 AH36 | Existing durable free-space service; invalid/error AXFFFF |
| 09C4:0135 | INT21 AH1A | Existing DTA pointer ownership |
| 09C4:0141 | INT21 AH4E | Existing asset/durable find-first; actual attributes/path must satisfy existing restrictions |
| 0A46:01A3 | INT21 AH4C | Unsupported nonreturning termination; no fallthrough |
| 0A46:01EB | INT21 AH06, DL from AL | Unsupported diagnostic output; existing separate diagnostic plan applies |
| 0A46:140F | INT21 AH3D or AH3C from original entry13C9/13D2 | Existing asset open/durable open/create; CX zero, file-record path+30 |
| 0A46:145F | INT21 AH3E | Existing routed close |
| 0A46:14E2 | INT21 AH3F/AH40 selected by original block entry | Existing routed read/write; original record-count multiply and short-count/error processing remain guest code |
| 0A46:1541 | INT21 AX4200 | Existing absolute seek |
| 0A46:15AB | INT21 AX4201 | Existing current-relative seek |
| 0A46:15B9 | INT21 AX4202 | Existing end-relative seek |
| 0A46:15C7 | INT21 AX4200 | Existing restore-position seek |
| 0A46:15E4 | INT21 AH41 | Existing durable delete/error result |
| 0A46:1686 | INT21 AH30 | **Unsupported** DOS-version query; original zero-argument branch at167D/1684. Do not fabricate a version |
| 0A46:17DA | INT21 generic path wrapper; inventoried caller1799 sets AH39 | Existing durable mkdir for that caller; do not generalize to arbitrary AH |

`startup.rs` implements AH25 and routes keyboard/video/DOS. `startup_platform.rs::dos` supplies durable routing and free capacity, while `dos_legacy` supplies time, DTA, known-asset find/open/read/seek/close. It does not implement AH06, AH30 or AH4C. Other interrupt vectors return source fault9.

The original 0962 text helper calls060B/060F with AH09 (04A3), AH0E (04B7), AX0601 (04F2), AH03 (04FC), and AH02 (0503). Current `video()` does not implement the first four and accepts cursor AH02 only as exact AX0200/BH0. Thus this inherited generic wrapper must not be labeled universally covered. Normal world success-path reachability of these diagnostic/text branches has not been measured. Preserve fault9 if encountered; obtain an original caller/register trace before any bounded service extension.

## Every computed site (6)

| Site / bytes | Existing exact guard |
| --- | --- |
| 0661:0355 / FF1E764A | `driver_call_context` requires original caller, DS=load+0BC6, pointer4A76 and AH2; `irq_runtime_driver_target` additionally validates live driver allocation/generation and offset0 |
| 0A46:03B7 / FF1E9A43 | `lifted_indirect_target_admitted`: target load+0038:0025, original stub or validated live manager binding/body/stubs |
| 0A46:03C3 / FF1E9A43 | Same guard, distinct admitted caller |
| 0A46:0601 / 26FF19 | Original file-record indirect dispatch, BX slot10/14/18/1C, DI bounds, magicD7B0..D7B3, whitelisted target and exact original body bytes |
| 0A46:07FB / 26FF5D14 | Same file-record contract, fixed slot14 |
| 0A46:088C / 26FF5D18 | Same file-record contract, fixed slot18 |

These contracts are in `lift.py`, `csrc/driver_admission.c`, `csrc/irq_runtime.c`, and enforced by `csrc/guest.c`. Keep them unchanged. No new table contract or widened computed transfer is needed from this inventory. A valid code site does not waive live pointer, generation, record or target validation.

## Bounded Sol candidate and Luna gates

1. In a fresh ignored isolated source copy, pin the current actual lift/source baseline and reviewed inventory. Derive admission solely from the 2,079 new original tuples, retaining whole roots/helpers and old tuples byte-for-byte. Expected new unique instruction budget is exactly5,472; reject unexpected additions rather than expanding scope. Preserve the separate MIDI resource namespace.
2. Follow existing creation admission machinery: verify original descriptor/body hashes, each source offset/instruction, relocation intersections and generated dispatch identity. Keep all665 traversed relocation intersections attributable; these are not665 new fixups. The two literal spans116/263 bytes are evidence/data, not automatically additional executable bytes. Do not guess descriptor/module IDs or promote a whole overlay.
3. Keep all six dispatch guards and unsupported service stops unchanged. Include explicit candidate metadata listing the inherited unsupported branches above. Do not turn graph `complete=false` into runtime closure by relabeling unresolved sites.
4. Luna runs existing generator identity/mutation controls and discriminating paired-root admission controls in the isolated copy, after source review. Require exact baseline retention, exact new tuple/byte delta, relocated and nondefault-load source identity, midpoint/changed-byte rejection, unchanged dispatch rejection and truthful unsupported-service fault behavior. Generation/build execution remains Luna-owned and serialized with shared native artifacts.
5. Runtime acceptance requires original helper calls and cold save/load across separate processes using real original file-record initialization and reachable world state. Capture actual paths, sizes, block counts, DS:43AC results, post-load world state and a subsequent world action. Exercise short/missing/corrupt input, denied publication, full capacity and invalid guarded dispatch without false success. No invented save fixtures establish paired compatibility. Original DOS cross-read/comparison remains necessary.

The inherited AH30/text/diagnostic/termination gaps do not require speculative services before preparing code admission. They do prevent declaring the entire reachable graph supported. Any observed normal-path use becomes a separate evidence-backed service task before claiming successful paired gameplay persistence.
