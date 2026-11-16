# Bounded frontend checkpoint memory summaries

2026-10-15. Astra source-only addendum to the
[BIOS runtime integration plan](cok-bios-journal-runtime-integration-plan-2026-10-15.md).
Zero guest bytes admitted; no application execution performed for this plan.

## Evidence and correction

Luna's offline measurement, reported by the coordinator, attributes 272,820,094
bytes of the failed 272,864,797-byte root report to its 70 checkpoints. Repeated
cumulative memory-change arrays dominate; the final checkpoint has 181,769
changed-byte entries. Separately, the raw BIOS ledger failed its 32 MiB cap
after 89,021 keyboard callbacks. These are distinct failures. The earlier claim
that removing repeated BIOS joins alone addresses the huge report is withdrawn.

Source inspection confirms `StartupSession::advance_once` compares the fixed
initial `self.before` with a fresh 1 MiB `after` RAM copy at every recorded
checkpoint. Its `changes` expression formats each changed byte into a String,
collects all strings into a Vec and joins them. The complete checkpoint String
is then pushed into `self.checkpoints`, and `report()` joins all checkpoints
again. This retains successive **initial-to-current** diffs, not incremental
changes since the previous checkpoint. A small serialized summary built only
after these allocations would leave the runtime memory problem intact.

## Bounded scope and ownership

Sol coordinates this with the journal candidate and the now-applied durable
changes in `startup_session.rs`. Own a small new pure checkpoint-summary helper,
its tests, module registration, and session/frontend report integration. Record
fresh base hashes; do not replace actual files with old isolated copies. Root
serializes application; Luna owns execution. Leave guest execution, scheduling,
clocks, DOS services and source admissions unchanged.

This task bounds checkpoint capture and retention in frontend sessions. It does
not establish a global process-memory bound for unrelated DOS/device/observer
logs. Do not report that wider property without separately measuring and bounding
those producers. The complete BIOS journal remains its independent lossless
callback evidence stream and has its own capacity/stop contract.

## Capture before allocation

Enable the frontend checkpoint policy in `interactive()` before execution,
alongside compact BIOS mode. Legacy noninteractive startup/CLI diagnostics keep
their existing complete `memory_changes` arrays and report schema semantics.

Branch immediately after the existing fixed-size RAM/register capture and label
selection, **before** constructing `changes`, heap/stack/event strings or calling
heavy checkpoint snapshot formatters. The frontend branch builds only the
bounded summary below. Put the old full checkpoint builder in the noninteractive
branch. Both branches then flow into the existing status/continuation code;
capture changes must not add early guest continuation, skip continuation, or
alter which instructions run. Do not call the old builder and truncate afterward.

For each frontend checkpoint scan the fixed initial/current RAM slices once:

* Require both lengths to be exactly 1,048,576. Compare addresses in ascending
  order. Count every differing byte with checked arithmetic.
* Stream SHA256 over a versioned encoding: domain bytes
  `cok-ram-diff-v1\0`, followed for each differing byte by its address as four
  little-endian bytes, its initial byte, and its current byte. Feed these six
  bytes directly to the hasher; never collect the entire tuple stream. The
  zero-change hash is the domain-only hash. Define this precisely in tests.
* Retain at most the first 16 changed-byte objects `{address,before,after}` as a
  preview. Report total, retained and omitted counts. Do not call the preview a
  complete memory-change array. The hash covers all changes, including omitted
  entries, but is a commitment, **not a reconstructable history**.
* Include the initial RAM SHA256 already established by construction and a
  SHA256 of the fixed current RAM slice. Scope this as ordinary RAM shadow;
  EGA planes/device state remain separate endpoint evidence.

Use a new explicit field such as `memory_changes_summary` with schema/version,
encoding name, `scope: initial-to-checkpoint-ram-summary`, `complete:false`,
counts, digest and preview. Do not leave `memory_changes:[]` without an omission
label, since consumers can interpret that as no changes. Do not create a fake
path/reference to unpublished intermediate RAM snapshots. Only the final
endpoint's actual RAM file is a complete recoverable snapshot. A checkpoint
hash can agree with that file only when it represents exactly the same state.

The compact checkpoint contains its logical sequence number, label, actual
status, work, registers/defined flags, the memory summary and the journal prefix
summary. Include a fixed allowlist of small scalar state if needed, but never
cumulative `file_events`, `dos_events`, allocator arrays, EGA plane hex/events,
IRQ/OPL arrays, observer traces or full live-stack dumps. Label their omission
explicitly at compact checkpoint schema level and point only to actual final
endpoint/report artifacts where those exist. Their intermediate history is not
recoverable from this summary. Preserve the full final endpoint RAM/device
capture and journal publication state checks.

## Bound retained checkpoints and preserve reachability facts

Use a small frontend-only reducer with a monotonic logical checkpoint count,
streamed hash of every canonical compact checkpoint, and a FIFO tail capped at
**128 records and 2 MiB of encoded checkpoint bytes**. Maximum single compact
checkpoint is **16 KiB**. Establish that bound from its fixed fields and the
journal's 16-receipt/2 KiB-keyboard-event bound; if the full BIOS tail would
exceed it, store only the prefix count/hash at checkpoints and retain the tail
once in the endpoint. Never silently truncate receipts or enlarge the limit.

Prefer prefix count/hash only in each compact checkpoint. Hash each canonical
compact record before retention with a defined version/domain and LF delimiter.
Evict oldest records **before** inserting a new record that would exceed either
budget; update retained-byte accounting with checked arithmetic. A bounded
writer or fixed schema sizing must reject an oversized record before an
unbounded String/Value is built. Do not temporarily retain all records and
truncate at finalization. A single record violating the declared bound is a host
capture error; stop at the session boundary and do not claim a valid report.

Final report exposes an explicitly named checkpoint summary/tail with total,
retained, omitted, encoded retained bytes, sequence bounds and full compact-stream
digest. Set `history_complete:false` whenever records were omitted. Even with
zero record omissions, memory previews remain summaries. Keep old `checkpoints`
array semantics only in diagnostic mode; use a distinct frontend schema so
readers cannot mistake the retained tail for complete raw checkpoint evidence.
Report construction may join only this bounded tail, never a hidden full list.

Current `report()` derives `reached_crt`, `reached_install` and `reached_all`
by searching retained checkpoint strings. Tail eviction would make those facts
false. Update three online booleans from the same actual checkpoint conditions
before eviction (current labels correspond to statuses 18, 20 and 25), and use
them in frontend reports. Preserve the diagnostic implementation or verify
equivalence. Do not derive reached flags from memory summaries, hashes or an
inferred gameplay state. Actual final `reached`/stopped semantics stay unchanged.

Finish-audio/speaker consumers parse final report trace/configuration fields:
retain those required fields and report-hash binding. Audit actual consumers for
any expectation that the frontend report contains full checkpoint memory arrays.
Update only explicit frontend consumers; legacy fixture tests keep their contract.

## Discriminating acceptance

Luna first runs pure controls and then the integrated application gates under
the serialized lease:

1. All-equal RAM; one change; 16/17 boundaries; sparse addresses including zero
   and 1,048,575; all 1 MiB bytes changed. Compare count, first16 preview and
   streamed hash with an independent reference encoding. Mutate an omitted
   byte: count may remain equal, but digest must change. Prove no full per-byte
   change Vec or giant formatted String is constructed in the frontend path.
2. Capture repeated identical cumulative states: digest/count agree, retained
   storage remains bounded. Capture over128 checkpoints; inject a smaller byte
   budget in a pure test to exercise that limit independently. Validate eviction-before-
   insertion, monotonic sequence, omitted count, full compact-stream hash and
   maximum retained bytes. An early reached status must survive eviction.
3. Full legacy diagnostic memory-change tests still pass. Compact/ordinary runs
   with the same input and stop boundary have identical guest work, registers,
   RAM and devices. The final RAM file's independently computed hash equals the
   endpoint hash. Omitted intermediate memory is never labeled recoverable.
4. Reuse Luna's failed report only as read-only reference input if useful; do not
   claim an offline transformation tests runtime allocations. Instrument the
   new capture path's retained record/byte maxima and run the actual bounded
   original route with the journal candidate. Verify observed compact report
   size and successful endpoint/journal publication. No giant raw checkpoint
   object should be built and discarded on that path.
5. Complete focused/full Rust gates, normal optimized compilation and source
   provenance checks. A passing compact report is evidence handling acceptance,
   not completed creation, durable character loading or a campaign milestone.

Preserve the failed GUI artifacts and their honest incomplete verdict. The
following actual run supersedes the pending implementation/verification status
above: the journal and bounded checkpoint capture were integrated, and the
bounded report plus journal/endpoint/RAM publication passed streaming
validation. This accepts evidence handling only. The run stopped on unexpected
host inputs at Pick Class; it did not complete character creation or establish
the original creation route. See the actual receipt and input-origin limitations
in [journal runtime validation](cok-bios-journal-runtime-validation-2026-10-15.md).
