# Current catalog identity in the final frontend endpoint

2026-10-15. Astra source-only addendum to the BIOS journal runtime and bounded
checkpoint plans. No guest bytes, execution or production edits in this review.

The coordinator reports that the failed root run's last recorded checkpoint was
at about 3.976 million work while its live endpoint was at 20 million. A catalog
record in that checkpoint cannot establish overlay identity at the final endpoint.
Resident keyboard polling also cannot establish its active caller by CS alone.

## Approved narrow seam

In `startup_frontend_endpoint.rs::endpoint_capture`, obtain the existing
`Extended.observer` and capture its **current** catalog using the same machine,
under the same paused/owned session, as the endpoint RAM/register/device capture.
Bind this catalog object to the endpoint's exact work and RAM SHA256. No guest
advance or input enqueue may occur between these observations. Use an explicit
scope such as `current-final-endpoint-catalog`; include the catalog once in the
endpoint, not in each compact checkpoint.

`Observer::snapshot` already emits source/runtime descriptor, current loaded
segment, observed generation, code size, original file offset, relocation count,
current stub bytes, and current body hash/identity. Its `word` helper uses
`machine_read`, which reads the ordinary memory array without changing guest
faults; `lifted_manager_body_admitted` compares current bytes with expected
relocated source bytes and does not mutate guest state. Reuse that logic.

Add a narrow endpoint snapshot entry field `binding_active`, queried with the
existing read-only `machine_binding_admitted(m, descriptor, loaded_segment)`.
This distinguishes a current segment/body match from an active registered
binding. Do not call binding begin/complete or change observer generations.
Retain source descriptor A4 as a catalog row even when current CS is resident.
Its fields prove the current loaded A4 body/binding, not the current executing
instruction or an inferred call stack.

Current generated `startup_catalog` inspection found **35 entries, 506 total
procedure offsets, maximum105 per entry, maximum26,568 body bytes**. These are
source metadata measurements, not runtime proof. Before calling the bounded
endpoint formatter, require at most64 entries, at most1,024 total stubs and valid
body extents within the1MiB RAM shadow. Keep one temporary body buffer at a time
(u16 code size bounds it to65,535bytes); never embed body hex in this catalog.
Validate a64KiB catalog encoding bound. An unexpected metadata/extent failure
returns an endpoint error rather than publishing missing/partial catalog as
complete. Expose the metadata bounds through a narrow Observer endpoint method
because its entries are private; do not duplicate a guessed catalog in Rust.

If the required observer is absent for this frontend profile, fail endpoint
capture explicitly. Keep legacy diagnostic checkpoint and CLI schemas unchanged.

## Current CS ownership qualification

The existing generated `lifted_irq_admitted` returns typed owner/generation for
some admitted instruction addresses, but its catalog paths call `read_mem` and
can set a machine fault. It is **not approved as a generic read-only endpoint
query**. Do not call it on a stopped machine and then restore the fault afterward.

This bounded task need not invent an owner resolver. Expose current CS:IP from
the existing registers and, optionally, explicitly labeled catalog segment
matches using the captured entries. A match requires nonzero loaded segment,
active binding and current body identity; it establishes an active overlay
segment match, not admitted instruction provenance. For resident CS or no match,
use null/unavailable with reason `not-resolved-by-catalog`. Never substitute the
A4 row, last manager event, a historical checkpoint, or the music driver's owner
for current instruction/caller identity. Multiple matches remain explicit and
ambiguous. Exact current instruction ownership beyond this existing evidence is
a separate pure-query extension if later required.

## Publication and tests

Existing endpoint-before/after-finish equality checks must include the catalog;
finish may not silently change loaded segment, generation, active binding or
body identity. The independently hashed endpoint file binds this evidence to its
RAM/work. The small journal manifest should reference that verified endpoint's
path/bytes/hash rather than duplicate the entire catalog/state; preserve the
actual endpoint comparison before publishing the reference. Keep the32MiB total
journal/manifest accounting and metadata reserve honest.

Luna controls should verify:

1. Snapshot twice at the same paused endpoint: identical catalog, registers,
   flags, fault, work and RAM; no callback or observer event added.
2. The A4 row reflects its current descriptor/segment/generation/body hash and
   binding activity. Compare its body hash with the corresponding slice of the
   exact endpoint RAM file. Check relocation-aware body identity independently
   against the generated/original source contract.
3. A changed live body, binding state or descriptor segment is detected by a
   fresh endpoint even when an earlier checkpoint was valid. Use isolated test
   fixtures, never alter the real runtime for evidence generation.
4. A resident keyboard-poll endpoint retains current A4 catalog evidence while
   reporting no falsely inferred overlay current-owner/caller.
5. Missing observer/invalid extent/metadata limits fail explicitly. The final
   journal validates the same endpoint catalog and disk hash after finish.

This closes the current catalog observation gap. It does not establish original
creation RETF, valid character save, party load, or a complete campaign.
