# CoK journal runtime: build validation, GUI pending

Date: 2026-10-15. Astra reviewed the bounded design, Sol implemented it,
and Luna performed generation, native tests, Rust tests and the application
build. This records component validation; complete creation remains open.

## Actual evidence

- Fresh generation passed18 portable controls and retained32,845 instructions /
  84,012 bytes. Generated manifest SHA256:
  `eddcbf87a8134803917bbdda8ab90a47c9d1819c9715755e507848f562a154e0`.
- Final repair3 release suite:184 passed,0 failed,1 ignored. Focused runs
  separately exercised13 journal cases and4 actual native stop-boundary cases,
  plus title status, truthful endpoint and genuine-fault-priority regressions.
- Normal optimized binary:18,609,664 bytes, SHA256
  `bbc659cd21759aa4c42f95aff2d02cdc31d2de8454231bf697a9b219cf46d014`.
- All125 compiled input pins remained unchanged during final validation.
- Receipt:
  `build/cok-recomp/journal-runtime-target-20261015-a/reporting-repair3-validation-receipt.json`,
  SHA256 `566f703bccaa0138ea96d48c43897f1124c62f9b15e044e678270d4a11752449`.

The ignored worker is not counted as a passed test in this suite. Cold DOS
transport controls belong to the separate durable-runtime acceptance report.

## Changes and failures retained

The frontend compresses repeated empty keyboard polls losslessly, streams the
journal to disk, bounds cumulative RAM checkpoint history, and publishes a
current endpoint with catalog and raw RAM identity. Host stop status44 occurs
before the next guest work debit/interrupt; genuine guest faults retain priority.
Old generated C is incompatible with that host boundary and must be regenerated.
Legacy CLI diagnostics retain their prior raw evidence behavior.

The initial native/journal suite passed, but source review found a reporting
error: a cap latch could mask a real guest fault. Sol repaired the title and
endpoint classifiers while retaining a separate evidence-cap field. The first
two Rust rebuild attempts failed on missing local C getter declarations. The
third repair compiled and passed the tests above. Failed logs and the initial
green lineage remain preserved under the target directory; they are not current
application acceptance evidence.

## Remaining actual GUI acceptance

The prepared route uses30M work /4096 quantum, four existing scheduled inputs,
and an observed pause after work18.1M with the input ring drained. Further keys
require a currently paused screenshot hash and one bounded slice each. An
isolated absolute save directory belongs to the new run.

Before launch, repair and review the runner's nested wait/helper deadlines and
owned close/drain handling. After closure Luna must stream-decode the actual
compact journal, verify its file and expanded hashes/counts against the final
manifest, verify report and endpoint/RAM identities and bounded sizes, and map
successful enqueues to actual AH00 consumption. The files use prefix
`<run-dir>/session`; the separate save directory contains guest saves only.

No new GUI launch has yet established these publication gates. The previous
Pick Gender screenshot and its incomplete raw ledger cannot substitute for
this run. M1 requires complete legal characters, cancellation/backtracking,
party operations and original-state evidence. M2 original save compatibility
and all later gameplay milestones remain open.

## Subsequent actual GUI publication validation

Luna executed the approved config
`82369684465e0a20ee3db77d6dd7f8527bb68db2620198b27f1704ba5d27321a`
in `build/cok-recomp/staging/intro-compare/creation-journal-route-gui-runs-20261015-a/journal-route-repair3-luna-20261015-a/`.
Owned PID58176 exited0 with drained output and no compiled-input pin errors.
The first pause was work18,634,880, after the four scheduled inputs were
consumed and the ring drained; the fresh frame showed Pick Gender/MALE.

Actual publication now passed streaming validation:83,532 logical BIOS events,
12,067 encoded records,2,741,832 journal bytes, journal SHA256
`c0c455a4891570abf38e3cd89757b8c6cf321bd9fb1fdb2fe8d30d1fe49c49e1`
and expanded SHA256
`1dcde84eaccccdf25bff8aa7a76110aaba66570f5d110811950339546d95dea3`.
The bounded report is129,373 bytes, endpoint30,436 bytes, raw RAM1MiB;
manifest/hash/summary/endpoint/report references matched and no publication
temporary files remained. Current A4 body and binding identity were true,
generation5, independently of unresolved current instruction ownership.
Receipt `publication-verification.json` SHA256:
`3e221c20a97d4ce0e0a1052516b787dd30f29e0db4037e0eae85d0f2b7b833f6`.

This accepts the bounded journal/report publication component, **not the
planned creation route**. The screenshot-bound S (`1F53h`) was enqueued and
consumed. Five additional host enqueues (`5000h,5000h,4800h,5000h,4800h`)
had no schedule/mailbox commands; all five were also consumed. The runner
correctly closed on unexpected input. `kind=input` rows are host enqueue
receipts, not BIOS callbacks; the decoder correlated all10 AH00 consumptions
separately. The Win32 queue does not retain whether these five came from
physical keyboard messages or directed application messages. The S control
receipt shows the game HWND was foreground then; it does not identify who
activated it or sent the arrows. Do not change the runner to ignore extras.

The terminal close capture shows Pick Class/CLERIC; it is not a paused class
milestone or an uncontaminated single-S transition proof. No class selection,
completed character, original WHO, party or world save is accepted. Future
controlled creation runs must account for every new host input row exactly
once and preserve their origin uncertainty where no provenance exists.

Subsequent user clarification: the user confirmed they tried the window and
pressed the arrows. Record the five unexpected inputs as human-reported manual
testing; their raw queue records still lack a native message-origin field. This
explains the interrupted controlled route without establishing a production
input-generation defect. The temporary disabled-window fixture is for repeatable
automated acceptance.
