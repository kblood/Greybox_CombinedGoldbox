# DOS volume query over a directory-only root

2026-10-15. Luna executed the owned hidden SDL-dummy/GameLink oracle; Root and
Astra inspected the terminal receipt and actual decoded records. This measures
the DOS service needed by cold Add. It does not establish successful character
loading or approve a Rust host implementation.

## Runtime and provenance

Run: `build/cok-recomp/volume-query-oracle-tools-root-run-20261015-a/`.
Source candidate: `build/cok-recomp/volume-query-oracle-tools-root-sol-20261015-a/`.
Reviewed source freeze: `58798d00dfe720fd215ad59933b974ca3530362f27073255bd7845fa10151ab7`.
Approved runtime configuration: `6a5da00d8409f087f25a5376e0a9312c7472daf48218f7d39209cb2b0e4d928c`.

Luna's PS7 child63208 exited0 in3.451s. The runner retained DOSBox process67532
and recorded process_exit0, process_has_exited=true, forced_termination=false,
ACK sent, COM status0, accepted=true and elapsed2.548s. The probe's earlier
"leaving process running" message precedes the runner's receipt/ACK/wait and is
not its terminal outcome. Observed launch mode is
`headless-gamelink-sdl-dummy`; no global input or original game mount was used.
Root viewed the original-resolution captured frame, showing the owned mount.

Actual probe.conf mounts the run's `data` directory as C:, changes to `TOOLS`,
and runs RUN.BAT. Root inventory before and after contains exactly one real
TOOLS directory, attribute16, and no regular root files. The runner validates
the observed working directory and root inventory. All fixtures, executable,
batch and handshake files are inside TOOLS. Source ASM, decoder and BAT are
unchanged from the first volume oracle; its measured1831-byte COM and assembly
receipt were reused with explicit runtime pins.

Luna's runtime-validation receipts record unchanged9 source artifacts,
8 input pins and13 runtime role pins. The prior plan input hash refresh was
explicit metadata maintenance after Astra added the first oracle result and
TOOLS fixture policy; original metadata is preserved in
`metadata-history/plan-pin-refresh-20261015-a/`. Later policy edits do not
retroactively change the runtime's pinned configuration.

Raw `data/TOOLS/SEARCH.BIN`:21,280 bytes,
SHA256 `66837cb6611601cd6518337a3f242fb6ce0f095c97d6bcb12f9b3617bc54471a`.
Decoded `search-decoded.json`:83 records/54 search calls,
SHA256 `a78a9bfbbc35b5bdb6fceba8db64f0deb55b50ad58fc227447625aaf361d62d4`.

## Actual discriminating results

| Case / sequence | Request | Observed result |
| --- | --- | --- |
| 15 /72 | FindFirst, CX0008, `C:\*.*` | AX0/CF0; `C_DRIVE`, attribute8, zero size/date/time; filename tail preserved |
| 15 /73,74 | FindNext, twice | AX18/CF1; both43-byte DTAs unchanged |
| 16 /75,76 | WHO FindFirst; copy its DTA; volume FindFirst on original DTA | A.WHO remains in copied DTA1; original DTA0 receives C_DRIVE |
| 16 /77 | Volume FindNext on DTA0 | AX18/CF1; both DTAs unchanged |
| 16 /79,80 | FindNext on copied prior WHO DTA1 | B.WHO succeeds, then AX18/CF1 with both DTAs unchanged |
| 17 /82,83 | Volume FindFirst; fixture Pascal conversion; FindNext | C_DRIVE succeeds; converted DTA is preserved on AX18/CF1 |

Sentinels remain unchanged throughout. Captured non-result registers and
non-CF flags are preserved by the volume calls. Case17's filename changes
between records82 and83 because the fixture performs its success-only Pascal
conversion. **FindNext itself changes neither DTA at record83.** This is a
standalone wrapper-shape fixture; the native original-helper control remains
required after host implementation.

The earlier oracle with RUN.BAT and SEARCH.COM directly in C: returned those
regular files on volume FindNext. Thus EOF here depends on the measured
directory-only root. It is not a universal volume-search rule. The current
Rust virtual namespace exposes assets and saves below nonempty directories;
the proposed host service must enforce that root profile, preserve copied WHO
continuations, and retain explicit rejection for unsupported variants.

## Next acceptance

Astra specifies the exact label/token/transaction contract before Sol edits
the isolated host adapter. Luna must verify host controls, original wrappers
at bases0/1000, full suite and normal build, then retry cold Add headlessly
with fresh writable clones and observed Down/Enter menu selection. Volume
completion alone is not WHO reading, party insertion, View, WORLD save/load
or completion of M1–M7.
