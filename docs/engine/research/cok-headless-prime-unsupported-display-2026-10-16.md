# CoK headless no-input prime for an unsupported first frame

**Date:** 2026-10-16  
**Scope:** bounded headless-control evidence plumbing only; not a game run or M1 acceptance.

## Observed startup condition

The exploratory launch at `C:\cok-m1-explore-03\run-01` stopped before any guest input. Its `frame-0001.json` records a paused headless process, `display.result = "Err(UnsupportedDisplay)"`, no image artifact, and `current_capture_token = null`. The guest had no queued input and no fault. Because `key` and `settle` commands require the token of a captured frame, neither could safely advance this state. The existing `bootstrap` command is for a predetermined startup schedule and does not provide screenshot-gated, no-input observation; using that route here would not meet the required dynamic control policy. The runner-error log records its initial-frame assertion failure; the run produced two frame receipts and an orderly-close terminal, but no fixture inventory or `postflight.json`. This note does not treat that run as gameplay evidence.

## Bounded no-input prime

`frontend_headless.rs` now supports an explicit `prime` command for this one startup condition. It is admitted only when the latest tokenless capture is exactly `UnsupportedDisplay`, the controller is paused and has not bootstrapped, the fixed schedule and all input counters are empty, the guest key ring is drained, there is no fault or input-wait state, and work is below the prime cap. It advances no more than one full 250,000-work slice at a time; it rejects a slice that would exceed either the host limit or the 1,000,000-work cumulative ceiling. It emits no key. Slice completion requires an unchanged input count and occurs at a clean `InputWait` or the full slice target with a drained ring. A later visible capture can then establish a real frame token for ordinary screenshot-gated control. The prime cannot continue through `InputWait`.

The focused offline command was run from the isolated test crate with `COK_GENERATED_DIR=C:\cok\build\cok-recomp\generated` and a fresh temporary Cargo target:

```powershell
cargo test --offline --locked --bin cok-recomp 'frontend_headless::tests::prime_'
```

Result: **2 passed, 0 failed, 278 filtered out**, exit 0. Tests cover the allowed no-input slice and `InputWait` stop, parser schema, and rejection of visible/tokenized frames, scheduled input, a nonempty ring, unrelated display errors, insufficient host limit, and the 1M cap. The tests also assert the input count remains zero and `next_key()` remains empty. Cargo emitted six existing unrelated warnings.

## Source binding and limits

The tests ran in `{local-user-profile}\AppData\Local\Temp\cok-m1-prime-offline-20261016-01`, copied from the retained `C:\cok\rust\cok-recomp` snapshot (210 files). The isolated copy retained the snapshot hashes for the other 209 files and overlaid only the working `src\frontend_headless.rs`; that file matched the working-tree SHA-256 `F2B118DBC978148C945634D039BEEE65C08512CB7C06C55376345CA0CB9F76D0`. The snapshot contains 19 files absent from the primary crate tree, including local test fixtures; it was used only to make the offline test crate reproducible. The Cargo command compiled and ran a test harness in the isolated target; it did not rebuild or launch the normal candidate.

No DOSBox, candidate runtime replay, or guest input was used for this change. It does not show that the new prime path works against a live guest, does not establish that the live Add path reaches or invokes `9E:1989`, and does not prove a two-member party. Candidate provenance remains `candidate-unverified`; there is no M1 or campaign acceptance from this work.
