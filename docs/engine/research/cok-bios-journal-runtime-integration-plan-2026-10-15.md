# BIOS journal runtime integration and callback stop boundary

2026-10-15. Astra source-only plan. No application execution or production
source edits were performed for this plan. Depends on the accepted pure codec
in [codec acceptance](cok-bios-codec-acceptance-2026-10-15.md) and preserves the
requirements in [compaction plan](cok-bios-evidence-compaction-plan-2026-10-15.md).
The measured replay recovered all 59,617 events exactly: 2,171,016 encoded bytes
versus 21,866,664 canonical expanded bytes. Runtime stopping and publication
are still unaccepted.

Subsequent failed root GUI evidence identifies an independent large-report
failure: repeated cumulative RAM diffs dominate checkpoint storage. BIOS
compaction alone does not fix that allocation. Apply the
[bounded frontend checkpoint addendum](cok-frontend-checkpoint-memory-plan-2026-10-15.md)
before the next GUI acceptance run; keep both failure classes distinct.
The [current catalog endpoint addendum](cok-current-catalog-endpoint-plan-2026-10-15.md)
also requires current overlay identity at final capture rather than borrowing
it from an older checkpoint.

## Ownership, freeze and byte budget

Admit **zero new guest instructions and zero new original guest bytes**. Keep
all guest tuples, protected unions, fixups, source identities and checkpoint
ancestry unchanged. A narrow host control addition in generated C requires
regeneration and optimized compilation, but does not extend guest coverage.

Sol first prepares an isolated candidate from recorded actual source hashes.
Do not modify actual sources, shared generated output, build artifacts or the
root GUI lease. Reconcile the durable-save candidate's platform/session/frontend/
main changes explicitly before application; do not copy an old whole file over
newer work. Coordinator applies only after the runtime lease closes and Astra
reviews the candidate. Luna owns serialized generation/build/runtime tests.

Owned seams: `csrc/guest.h`, `csrc/guest.c`, `lift.py`, `src/main.rs`,
`src/startup.rs`, `src/startup_platform.rs`, `src/startup_session.rs`,
`src/frontend.rs`, `src/startup_frontend_endpoint.rs`,
`src/startup_bios_ledger.rs`, and focused tests. Reuse the accepted journal
codec; amend its API only narrowly where publication needs read-only metadata.
No new diagnostics framework, save schema, guest shortcut, clock change or
increased journal quota is part of this task.

## Actual callback paths and the stop seam

There are **five**, not three, actual BIOS append sites:

* `Extended::keyboard`, `video`, and the CRTC branch of `port` in
  `startup_platform.rs`.
* IRQ0 tick (`interrupt == 0x400`) and mouse reset (`0x33`) in
  `startup.rs::service`.

`GuestService` returns an integer. `guest_interrupt`, `guest_boundary` and
`guest_work` in `csrc/guest.c` translate a nonzero callback return into
`Machine.fault`. Therefore evidence exhaustion must **not** use that return
channel. Preserve every actual service return, register, flag and memory result.

The present `lifted_run` emitter begins each loop with fault handling,
`irq_runtime_boundary`, then `irq_runtime_bios`. Its existing `yield_at` check
comes later, after several checkpoint checks. Setting an immediate work yield
from the callback does not stop the next IRQ boundary or BIOS dispatch and is
insufficient for this contract.

Implement one monotonic, host-only `Machine` evidence-stop latch, initially
zero, with a narrow setter/getter ABI. It is independent of `fault`, budget,
work, IRQ state and `yield_at`. No resume/clear operation is needed during a
session. Reserve lifted status **44** for this host stop (source inspection
found no existing status 44); name it in the C/Rust interface and tests.

Change only the loop prologue to this ordering:

```c
if (m->fault) return m->fault;
if (m->host_evidence_stop) return HOST_EVIDENCE_STOP;
if (irq_runtime_boundary(m)) return m->fault;
int bios = irq_runtime_bios(m);
if (bios) { if (m->fault) return m->fault; continue; }
```

The latch check must precede **all** IRQ dispatch, ROM handling, checkpoints,
input-wait checks, source-work charging and guest instructions. Preserve fault
priority: a genuine fault is still returned unchanged, while Rust separately
records any evidence stop/error. Never rewrite a real fault into status 44.

The single recording method records the completed callback event first. On
`Recorded::EvidenceCap`, it sets the latch and an Extended host stop reason,
then returns control through the original service return path. On codec error,
it retains a bounded host error, sets the same stop latch, and forbids a complete
publication: that endpoint does not have a recoverable complete callback stream.
Do not panic or unwind across FFI, discard the error, or fabricate a DOS/BIOS fault.

The endpoint is the **existing enclosing service/instruction completion
boundary**, not a snapshot taken halfway through its C wrapper:

* Direct INT cases in `lift.py::emit` advance IP and call `guest_interrupt`.
  Their normal `irq_runtime_retire` completes before returning to loop entry.
  `irq_cpu_retire` commits an already validated retirement ticket and marks
  boundary pending; it executes no next instruction and dispatches no IRQ.
* CRTC OUT calls `guest_boundary(0x300)` from `guest.c::port_out`; normal OUT
  completion and retirement occur, then loop entry observes the latch.
* `guest_rom_bios` calls the service and then performs its existing frame/flags/
  SP restoration. Let that atomic wrapper finish unchanged; the emitted path
  continues to loop entry, where the latch blocks subsequent dispatch.
* `irq_runtime_bios` at F000:FEA5 invokes the tick callback, increments its
  existing BIOS tick count and commits its already prepared INT1C transition.
  It returns 1 to the loop, whose `continue` reaches the latch before the INT1C
  body executes. Preserve that transition rather than returning from its middle.

These paths contain no second BIOS callback after the recording call and before
the next loop entry. Sol must confirm this remains true in the candidate.
The final retained callback may therefore precede natural wrapper completion
changes in the final registers; equality tests compare with an uncompressed
reference stopped at the **same completed boundary**. No next guest instruction,
source-work increment, new IRQ dispatch or additional callback is allowed.

`StartupSession::advance_once` must inspect the host evidence state immediately
after `lifted_run` and before ordinary status-19/43 or checkpoint continuation.
For a clean cap, set `stopped=Some(false)` and return a terminal host-stop result
with actual last lift status 44. Preserve a simultaneous real fault's status.
Repeated `advance` must not call C again. Codec errors return a host error with
no complete manifest and no attempt to resume. No `reached=true` or gameplay
completion claim follows from a cap.

Frontend handles this result by halting, using explicit `evidence-cap` close
reason and `run_completed:false`, then orderly finalization. It must not enqueue
new input or call `advance` after the cap. Avoid deriving the reason solely from
`Debug` strings or rewriting it to `source-stop`. Keep the independent 4,096
input/observation limit and its omission/drop semantics visible; do not extend it.

## One event store, bounded reports and compatibility

Enable compact recording inside the existing `interactive()` setup, immediately
after construction and before any guest instruction. Reject switching after
events already exist. Keep noninteractive fixtures' existing `Vec<String>`
contracts; compact sessions retain the journal instead of also growing that Vec.

Route all five sites through one method accepting their unchanged event object
and machine pointer. All AH00 callbacks, including waiting/error results, AH02,
nonempty polls, mouse, video, IRQ ticks and CRTC events stay individual records.
Only the accepted codec's exact matching empty AH01 predicate groups events;
retain every exact timestamp and all otherwise unused ring words.

Provide logical-count, keyboard-tail and prefix-summary accessors. Replace
every interactive `bios.len()`, `is_empty()` and `join()` consumer in session
labels/checkpoints/report state. In particular the video event's existing
one-based `index` remains `logical_count + 1`; keyboard receipt indices remain
zero-based global callback indices. Compact-record indices never substitute.

Interactive checkpoint `bios_events` and resource keyboard `events` use a
versioned prefix reference/summary carrying logical count, expanded prefix
SHA256 and bounded tail. Mark these as summaries, with explicit earlier-callback
omission count. Do not serialize a second complete keyboard or BIOS array.
Preserve the resource snapshot's actual ring state separately from its summary.
Use the same online reducer for endpoint keyboard receipts and publication
validation. Existing noninteractive endpoint/ledger tests retain their contracts;
add versioned compact-mode branches rather than silently changing old meanings.

## Verified journal publication

Retain the existing endpoint RAM/device/state comparisons, report hash check,
source/overlay/CFG hashes and finish-lifecycle checks in
`startup_bios_ledger.rs`. A compact representation does not waive them. Maintain
the distinction between a host `finish` null-to-false transition and guest state.

Use one compact journal sidecar and one small final ledger manifest. The final
manifest references the journal's exact byte count/hash and online expanded
count/hash, endpoint/report/source identities and truthful close reason. Its
`complete:true` means complete evidence **through this endpoint**, never complete
gameplay. It carries `run_completed:false` on a cap. The codec's own footer is
only internal stream validation; its `complete:true` is not publication authority.

Publication order:

1. Refuse preexisting final journal/manifest paths without altering them. Create
   a unique operation-owned temporary journal with `create_new` in the destination
   directory. Stream `Journal::write` into it; never expand all events into a Vec.
2. Require successful write, flush and `sync_all`. Close the writer. Reopen the
   actual temporary file through a bounded reader, stream-decode it, compare the
   verified reducer summary with the live journal and endpoint tail, and require
   the decoder's complete footer/EOF checks. Independently stream-hash those disk
   bytes and compare both length and hash with the writer receipt.
3. Prepare the small final manifest only after those checks and all existing
   endpoint/RAM/report/source checks pass. Keep it within the metadata reserve;
   account for **both final files' bytes** under the 32 MiB evidence quota. The
   codec's existing 64 KiB metadata reserve is not a second unaccounted allowance:
   verify header/footer plus external manifest fit it, or fail publication.
4. Write the manifest to a second unique `create_new` temporary; flush, sync,
   close, reread and verify its exact bytes. Publish the journal first and the
   manifest last, each by a same-directory atomic **no-replace** rename. On Windows
   use the appropriate MoveFileExW form without REPLACE_EXISTING and with
   WRITE_THROUGH; do not use a potentially replacing rename after an `exists`
   check. Check every result. This is a narrow publication helper, not a new
   transaction framework.
5. Only the successfully published final manifest establishes completeness.
   On failure remove only this operation's temporary files and, if journal
   publication succeeded but manifest publication failed, its own newly published
   journal. Never remove or truncate a preexisting/concurrently created output.
   If cleanup fails, report the exact leftover orphan as non-authoritative.
   Never write a success manifest after an error. Once manifest publication
   succeeds, perform no fallible operation whose failure is misreported as a
   rollback of that published success.

The default encoded record cap stays 250,000, polls per record 256, and total
evidence cap 32 MiB. Preserve codec reservation for the triggering callback.
Small test caps are injected only through test seams. An oversized/malformed
internal event is a fail-closed evidence error, not permission to drop it.

## Luna's discriminating acceptance

First source-review the isolated candidate and compare all bases. Then under the
serialized lease regenerate and verify the same admitted guest tuples/bytes,
fixups and identities; compile with normal MSVC optimization and run the focused
controls plus full Rust regressions. Record generated host-source differences
honestly; do not claim the generated C file hash is unchanged.

1. Force a tiny record cap and separately a tiny byte cap on real callbacks.
   Cover direct INT16 AH00 consumption, AH01 empty polling, video, CRTC OUT,
   far-frame BIOS/mouse and IRQ0 tick. Check the triggering event is retained,
   status 44/fault 0 for successful callbacks, no further work/instruction/event,
   and no input injection after stopping. Repeat `advance` and frontend ticks;
   verify state stays unchanged. Exercise a real callback fault at the cap and
   prove its status/fault survive. Inject codec failure and forbid completeness.
2. Compare compact and ordinary recording of the identical finite input route
   stopped at the same boundary. Require every expanded event object, timestamp,
   order, all consuming AH00 words, registers/defined flags, RAM, stack/frame,
   IRQ/device state and source work to match. Test the IRQ tick boundary's
   committed INT1C transition explicitly; no subsequent handler instruction.
3. Demonstrate all five append sites use the recorder; verify logical video
   indices and checkpoint labels across a 256/257 poll group. Endpoint and
   report prefixes must agree with streamed decoding without complete arrays.
4. Inject write, flush, sync, verification and rename failures, including a race
   that creates a final output before rename. Preserve existing sentinels exactly,
   publish no authoritative success manifest, and prove only owned outputs are
   cleaned. Corrupt a disk byte after write and before verification; require failure.
5. Run the actual GUI beyond the old measured evidence capacity with observed
   one-key-at-a-time delivery and original consumption receipts. Verify compact
   stream and final disk hashes, endpoint/state equality and clean exit. This
   accepts evidence capacity only; legal original creation, RETF, WHO persistence,
   party loading and campaign milestones remain their separate gates.

Document measured results, remaining limitations and source hashes, then commit/
push the accepted bounded task and continue the full-game goal. Do not infer a
completed character or gameplay milestone from journal acceptance.
