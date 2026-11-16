# Bounded lossless BIOS evidence for longer creation runs

## Evidence and scope

The accepted finite GUI run produced 59,617 BIOS events and about 21.9 MB over 150 seconds / 18 million source work. `startup_bios_ledger.rs` currently rejects more than 250,000 events or 32 MiB, but checks only at final publication. `Extended.bios: Vec<String>` grows during execution; `startup_session.rs` checkpoint reports join the entire vector, and `startup_platform.rs` also copies keyboard events into resource-state reports. Consequently changing only the final ledger cap would neither bound memory nor solve report duplication.

This task changes host evidence representation only, admits zero guest bytes, and retains the 32 MiB encoded journal limit. It does not alter keyboard calls, source work, clocks, IRQs, key scheduling, input retries, BIOS state or WM_APP+3 delivery. Complete evidence means every callback through the actual recorded endpoint is recoverable; it never means the game completed.

Implementation is serialized after the current root source/build/GUI lease and coordinated with the durable-runtime candidate: both touch platform/session/frontend. Sol must apply against then-current hashes. No frozen source changes are authorized by this document.

## One bounded implementation

Add `src/startup_bios_journal.rs` with a compact journal and pure encoder/decoder tests. Use it for interactive frontend sessions; preserve existing diagnostic output contracts for noninteractive callers. Enable compact mode immediately after construction, before the first guest instruction. Replace the three platform BIOS pushes with a single recording method; preserve their original event objects and global logical event ordering. Video `index` and checkpoint labels must use logical event count, never compact record count.

Only consecutive successful keyboard AH=01 callbacks with an empty ring before and after are eligible for grouping. All fields other than `clock_work` must match exactly, including AX before/after, status, flags, defined masks, head/tail/start/end and every ring word. Use one immutable template plus an array of exact u64 work values, maximum 256 values per record. Split on any difference, intervening BIOS event, capacity, or malformed event. Do not infer a constant polling interval. AH=00, including unsuccessful/waiting calls, AH=02, nonempty polls, all video/device events and unknown functions remain individual full records. No event sampling or deletion.

Define a versioned canonical expanded-event encoding (stable JSON object key order, UTF-8, one LF per event). Hash each expanded event as recorded, increment logical counters, and retain a 16-callback keyboard tail with original global indices. Decoder must reconstruct every event object and exact work value in order; decoding and rehashing must reproduce the online hash. Record both logical and encoded counts, encoded bytes, per-function counts, and expanded hash. Bound encoded records to 250,000 and serialized journal bytes to 32 MiB; logical count is explicitly distinct and bounded by the finite source-work run. Use checked arithmetic and a fixed maximum single record size justified from existing BIOS event schemas.

Do not expand the journal into a second whole-session vector at finalization. Serialize compact records incrementally to the new ledger schema. Hash the actual published file as well as the canonical expanded stream. The ledger retains endpoint/report/source hashes and existing RAM/state/device/finish-lifecycle checks. `complete: true` is allowed only after all records and their manifest are successfully written and verified; partial publication or disk failure has no successful complete manifest.

### Reports and endpoint consumers

Update `startup_frontend_endpoint.rs` to obtain the existing keyboard tail and total from the journal's online reducer. Preserve exact zero-based global indices and the explicit tail-only omission count. Update interactive checkpoint `bios_events` and resource keyboard lists to a versioned journal prefix reference: logical count, expanded prefix hash, and bounded tail. Label these summaries as summaries; do not label their arrays complete. Keep a single final journal containing all callback evidence. Existing noninteractive reports retain their original arrays. Final report/endpoint/ledger comparisons must use the same reducer, not reconstruct a different tail from compact-record indices.

### Reaching the finite cap

Check capacity while recording, not at exit. Reserve bounded space for one maximum-size final callback and final metadata. On reaching the ordinary record/byte limit, retain the triggering callback in that reserve and latch a host evidence-stop request. Stop at the next existing host callback boundary before resuming guest execution; preserve the service's actual guest registers, flags, memory, fault and return status. Do not report a fabricated guest fault or silently continue collecting without storage. The frontend records `evidence-cap` as the close reason and can publish complete evidence *through that endpoint*, with `run_completed: false`. No guest instruction may execute after a callback cannot be retained. If the callback architecture cannot stop before resume without guest alteration, resolve that implementation seam in source review before testing.

The existing frontend 4,096 input/observation limit remains independent and explicit. This task does not silently extend that limit or count dropped GUI input as consumed input.

## Luna's discriminating acceptance

1. Pure round trips: long identical empty AH=01 runs with irregular and equal work timestamps; 256/257 boundaries; interleaved video, AH=00, AH=02 and nonempty polls. Exact expanded objects, ordering, logical indices, counts and hash must match an uncompressed reference.
2. Change each template field separately, including unused ring words and defined flags: each change splits the run. Invalid objects/overflow/invalid function must fail or remain verbatim, never merge loosely.
3. Mutation controls: omit/duplicate/reorder a poll, alter one timestamp, template flag, AH=00 word or count; decoder validation/hash comparison rejects each. Every consuming AH=00 remains a standalone record.
4. Replay the accepted 59,617-event ledger through the pure encoder, without invoking the application. Demonstrate byte reduction and exact expanded hash equality, and list observed poll eligibility/counts. This is the measured go/no-go for using this representation: do not assume most events compress.
5. Inject tiny caps and write/finalization failures. Verify bounded retained memory, the last callback included, no subsequent guest work, unchanged endpoint guest state, truthful cap close reason, no success manifest on I/O failure, and preservation of preexisting output paths.
6. Run existing endpoint/ledger tests and full Rust regressions under Luna's serialized lease. Compare a finite original input sequence in compact versus ordinary diagnostic capture: all callback objects and consuming AH=00 receipts, source work, RAM/register/device endpoints must agree.
7. Actual GUI longer than the old ledger's measured capacity, with observed one-key-at-a-time delivery. Reconstruct and hash the complete callback stream, preserve every consumed word/work receipt, verify final RAM/report/endpoint hashes and clean exit. This accepts evidence capacity only; whole creation still requires normal original RETF, legal creation flows and cancel/party/file evidence in its own gate.

No new transaction framework, guest behavior shortcut, or blanket higher cap is required. If measured pure replay does not reduce the retained trace enough, stop at the representation review and choose bounded streamed records with an explicit disk quota; do not silently weaken completeness.
