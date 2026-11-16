# CoK provenance build and headless startup smoke — 2026-10-16

## Result

The refreshed provenance build completed successfully, and one fresh bounded
headless run reached the loading draw and closed orderly. This verifies the
exact built executable's bounded startup, headless control, framebuffer capture,
close path, and evidence publication. It does not verify the menu, character
creation, party state, gameplay, saves, campaign completion, or live audio.

The candidate remains labelled `candidate-unverified` in its build provenance
receipt. The guest endpoint reports `run_completed=false`; that is expected for
this bounded smoke and was not rewritten. The application terminal also keeps
`publication_verified=false`; a separate offline validator passed as recorded
below.

## Build

The focused offline Cargo-policy controls passed all 74 guard cases. The fresh
short-root provenance build exited 0 and emitted:

- Receipt: `C:\cok\build\cok-recomp\build-provenance\cok-build-20261016T1640270005302Z-1aed7e88cd0742bf91ff09549881d079`
- Executable: `cargo-target\x86_64-pc-windows-msvc\release\cok-recomp.exe`
- Size: 20,213,760 bytes
- SHA-256: `ebdcf3b827bbb3c08b9debd4bd62307989eafda2344281ccb0f0e5f05441848e`
- Receipt status: `build_status=success`, `provenance_status=candidate-unverified`

Post-build checks matched all 20 fixture pins, 35 generation sources, 14 game
inputs, one intermediate, 1,387 Cargo inventory entries, and generated
`lifted.c`/`manifest.json` identities. No source or game-input drift was
observed. The offline config test and build used the isolated short root
`C:\cok`; they did not launch the game.

## Preserved first attempt

`C:\cok-smoke-01` is retained as an incomplete smoke. It reached work 317,135
with zero inputs and zero guest fault and produced the loading frame, but its
owner budget was also 317,135. The frontend therefore hit the host work cap and
exited before a close command could be sent. A controller error also occurred
after launch because PowerShell variable `$PID` is read-only. Luna continued
the same paused process without sending input, then preserved the incomplete
receipt. This run is not counted as orderly-close acceptance.

## Fresh bounded run

The corrected run used `C:\cok-smoke-02\run-01`, a fresh isolated save
directory, the same receipt-bound executable and generated package, no key
schedule, no audio options, a 1,000,000-work total budget, 4,096-work quantum,
and bootstrap target 317,135. The check enforced
`0 < 317135 < 1000000`. The external runner used no console window and recorded
the retained process identity and output drain. Its separate malformed-regex
preflight attempt failed before process launch and is preserved; the corrected
runner is `C:\cok-smoke-02\smoke-fixed.ps1`.

Observed results:

- Bootstrap receipt: work `0 -> 317135`, exact target, zero overshoot, zero
  inputs, zero guest fault, keyboard ring drained.
- Frame: 320 x 200 uncompressed top-down BGRA BMP; pixel SHA-256
  `3e593ec1d963c3bb7a2375acb31b7ea501463e10f81e52d78d1fbb38aa94865a`.
  It matched the preserved smoke-01 loading frame pixel-for-pixel; the image
  shows `LOADING... Please wait`.
- Close command: sequence 2 was accepted after bootstrap. Its receipt records
  zero additional work and zero inputs. The post-exit receipt read succeeded.
- Terminal: `close_reason=orderly-close`, work 317,135, inputs 0, fault 0;
  process exit code 0, output drained, no remaining relevant process.
- All 25 runtime package files retained their before/after hashes, sizes, and
  file identities. The isolated save directory remained empty. Its separate
  expected sibling writer-lock file was zero bytes.
- `session.report.json`, endpoint, 1 MiB RAM, BIOS journal and ledger were
  present and bound by the manifest. There were no temporary publication
  files.

## Offline publication validation

The existing reviewed `cok-journal-publication-validator` 0.1.0 was run against
`C:\cok-smoke-02\run-01`; it exited 0 with empty stderr and no build/Cargo
process. Executable SHA-256:
`28bbb915a54cc40493fe7fe5531e5278358e159ebe95d9141deb106da6063a36`;
source `main.rs` SHA-256:
`254ee8f1fba0ac14adb83b11fd227c15ab23ba74e3a23ac6f941c88db8159e55`.
It decoded 150 logical BIOS journal records (16,715 bytes), verified the
expanded journal digest and manifest-bound report, endpoint, and 1 MiB RAM
hashes, and found no temporary publication files. Host enqueues and AH=00
keyboard callbacks were both zero. `run_completed=false` remains truthful.

The validator expects a run-local `terminal.json`. The runner added a
schema-labelled **host observation** from the retained post-exit assessment and
redirected logs (PID 51424, exit 0, outputs drained); it did not edit the
application's `headless-terminal.json`. That application file still says
`publication_verified=false`. The validator's output is separate external
evidence, not a retroactive application verdict.

## Evidence and remaining scope

Primary evidence is preserved outside the repository under `C:\cok-smoke-02\`:

- `assessment.json`
- `post-exit-audit.json`
- `publication-validation-summary.json`
- `publication-validator\validator-output.json`
- `run-files-final.json`
- `run-01\headless-terminal.json`, command receipts, report, endpoint, RAM,
  BIOS journal/ledger, and `frame-0003.bmp`

The build also emitted per-run OPL, speaker, startup-RAM, and IRQ side evidence
under `C:\cok\build\cok-recomp`; their exact identities are inventoried in
`C:\cok-smoke-02\post-exit-audit.json`.

This acceptance is limited to deterministic startup through the loading draw
and orderly cleanup. It does not establish a complete startup/menu route or any
M1–M7 milestone. The next gameplay test must use a separately planned finite
headless run with an evidence-backed input schedule and fresh output/save roots.
