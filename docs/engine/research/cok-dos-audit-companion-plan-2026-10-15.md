# CoK optional DOS audit companion

Date: 2026-10-15. Status: implementation plan only; no runtime or guest changes made.

## Existing evidence and bounded acceptance

The accepted cold Add run is `build/cok-recomp/staging/intro-compare/cold-add-world-volume-headless-run-luna-20261015-a`. Its endpoint records work 17750000, DS=1BC6 and SS=2491. These segment roles must not be interchanged. Endpoint RAM SHA256 is `3957c4c1e3bb768911052dc86b62f14a0eac906ff5ed666f3ee6b81d63aae8d7`.

The coordinator's byte comparison establishes a 409-byte WHO-derived node at 6109:0000 with 406 bytes identical to the accepted WHO input. Differences are D6:00→01, E5:51→4C and 137:0A→00. Party/current-node globals and singleton linkage corroborate incorporation into the party. Node E3/E5 points to 5B4C:0000, whose first nine bytes equal accepted KRA.SFX `5f0000ff0000000000`. This is byte correspondence to SFX, not a proved original assignment/loader path. Preserve unresolved interpretation of D6 until the original reader and F7:049C..04AC path establish its role. Raw first-32-byte stats agree; STR byte 11 hexadecimal is decimal17.

The UI, singleton linkage, node bytes, controlled fault-free close and successful publication validation support bounded cold Add state acceptance. They do not establish per-call DOS paths, requested/returned lengths, read order, EOF or sidecar assignment semantics. Do not retroactively label endpoint evidence a read ledger or claim actual 409/63/9 DOS read returns.

## Available hooks

`startup.rs` already receives `Extended::dos()` events at the INT21 service boundary and appends successful service events to `Platform.events`. `startup_platform.rs` legacy read events contain identity, requested/actual counts, guest destination, cursors and data SHA256. Its save-adapter `save_result()` emits only function/handle/AX/error, so saved WHO/SFX/STF reads lack the richer fields. Noncompact `startup_session.rs` checkpoints publish file_events/dos_events; the compact frontend checkpoint branch bypasses that publication. The current headless output therefore cannot recover the missing callbacks. Reuse these boundaries rather than altering the BIOS journal schema or enabling expensive full checkpoints.

## Proposed bounded implementation

Create an optional DOS audit companion controlled by one explicit frontend/startup option and bound to the existing evidence output stem. Disabled mode must retain existing behavior. Keep collection separate from DOS routing and from BIOS events. Audit normal file/search operations needed for cold Add and WORLD: open/create/close/read/write/seek, FindFirst/FindNext, DTA selection, directory/path changes relevant to resolution, and their normal errors or native rejection statuses.

Each event should include monotonic audit sequence, guest work, original interrupt CS:IP, entry registers needed for the operation, native service status, resulting AX/DX/CF, and existing guest fault. Attach owner/generation only when the existing resolver actually establishes them; record unresolved otherwise. Do not infer caller ownership from the currently loaded overlay alone.

Record the guest path already parsed by the real service, its actual normalized namespace/name and result. Maintain an audit-only handle incarnation map from successful opens to closes so handle reuse cannot misattribute later reads. Include requested count, actual successful count, file cursor before/after, destination segment:offset, and digest of exactly the bytes actually transferred. Compute digest from the service's existing data buffer; do not repeat a file read, cursor operation, pathname decode or faulting guest-memory access. Record writes similarly from the already validated input buffer. On failures, transferred count/digest must distinguish zero, unavailable and partially completed data rather than inventing a success.

For searches record requested pattern/attributes, DTA address, actual result/error and exact 43-byte before/after records or hashes where already safely available. Reuse service-owned DTA snapshots; do not cause a previously unaccessed protected DTA to be read merely for audit. An unobserved before-image must be explicitly unavailable. Preserve legacy exact-search behavior, active/retired VOL1 token semantics, and WHO continuation behavior.

Bound event count and total retained bytes with explicit configuration constants and checked counters. Reaching a limit or encountering an audit publication error marks evidence incomplete and uses the existing host evidence-stop mechanism at its established boundary. Preserve original guest-fault priority and the completed DOS service result; never convert an ordinary DOS error into a guest fault. Disabled audit must allocate no audit buffer. No silent event dropping, success-shaped truncation or unbounded copies of existing vectors.

Publish a separate versioned companion and manifest using the existing no-replace evidence publication conventions. Bind binary/source identity, run/evidence identity, initial/final work, event counts, companion size/hash and terminal endpoint/report hashes. Include explicit completeness and failure reasons. Integrate its accounting into the headless output budget. Do not change BIOS schema, guest code, source admission, dispatch guards or the original files. Verify the companion offline against endpoint/report identity and event continuity.

## Luna-owned discrimination

1. Audit off/on executions of the same deterministic fixture must match RAM, registers, flags, guest work, device state, BIOS journal and save bytes. Include normal errors and native faults, not only successful reads.
2. Exercise short read, EOF, zero-length read, invalid handle, handle reuse, failed open, seek and close, and successful/failed writes. Verify returned counts and transferred-byte digests from actual service buffers.
3. Cover WHO FindFirst/FindNext and EOF, VOL1, retired tokens, exact legacy search failure, protected DTA and invalid destinations. Audit must not introduce memory access or alter any DTA byte/result.
4. Inject event/byte caps and publication failures. Require incomplete evidence, preserved original fault priority and no replacement of existing files. Mutate a path, handle incarnation, actual count, data digest or sequence and require the offline checker to fail for the corresponding cause.
5. After source review and native validation, repeat the authorized bounded cold Add route using an isolated copied save directory. Obtain actual WHO/STF/SFX callbacks and original-reader assignment evidence before explaining sidecar roles or the three changed WHO bytes. This is M1/M2 verification, not authorization for additional gameplay or native View admission.

Keep the composed-initializer proof work independent. A DOS audit proves service observations; it does not close original table-domain, DS-lifetime or replacement-alias obligations.

## Source-review staging correction

The first source-only audit candidate incorrectly pinned the obsolete repository
`build/cok-recomp/generated` tree. It has not been approved for staging or native
tests. The audit experiment must reuse the accepted WORLD/WHO/volume lineage:
WORLD v3's first fresh checkout `build/generated`, C SHA256
`d806268d574996cb0f534d40865a4af7dfcc4bcaee9f2d2b375a80fe3e4eab01`,
manifest SHA256
`d8440aeecdd81c87f242f96f35a763330271781ce62f0ab175469e674a0a9114`.
Bind all generated inputs and historical fixture destinations required by the
current production tests using the accepted combined candidate's explicit
roster. Replacing only the primary C path is insufficient. Preserve the first
candidate and freeze the repaired staging sources for review before Luna.

## Actual ON cap failure and bounded window repair (2026-10-15)

The audited binary `1a6e096ba8880ced1e91f65c87777540f0038d9ae801b0d8cced971460531139`
passed the exact route with audit off. Audit on stopped at work 2,778,881,
before any scheduled input, with 6,751 events and 8,348,346 serialized bytes.
The manifest correctly says incomplete: `DOS audit event/byte reserve reached`.
The separate verifier rejected it. Clean process exit does not make this audit complete.
Preserve these runs; do not retry this binary or raise the cap to conceal the failure.

Read-only inspection of its actual JSONL found 5,662 reads: 3,229 COMSPR.DAX,
2,355 8X8D1.DAX, 77 GAME.OVR and one KRYNN.CFG. Of these, 4,110 requested
one byte and 875 requested two bytes. There were also 866 seeks. Startup asset
traffic exhausted the verbose bounded trace before the character-read experiment.

### Next source candidate

Add an explicit optional audit start-work parameter, configured at zero guest work.
For the next cold Add experiment select work 16,000,000, the already accepted
bootstrap checkpoint. Preserve default audit-on-from-zero behavior for existing
controls and explicit off behavior. Reject ambiguous, duplicate, off-with-window,
negative or out-of-budget configuration. Do not add guest input or an arming key.

Before that work, retain only configured coverage state; no event collection or
path reconstruction. At the first relevant DOS callback whose entry work is at
least the selected start, initialize the bounded audit from existing in-memory
handle state, before executing that callback. Every relevant callback thereafter
is recorded, without pathname/function filtering or silent dropping. The existing
8192-event/8-MiB/8-KiB limits, state reserves, host evidence stop, guest fault
priority and publication caps remain. If this window still exhausts them, stop
incomplete again and review actual evidence before choosing another design.

The manifest must distinguish configured coverage start, first callback work,
last callback work and final endpoint work. State explicitly that pre-window
callbacks were not observed. A window with no callbacks must still publish its
coverage and empty trace truthfully; an endpoint before the configured start
cannot claim the requested window was reached. Completeness applies only to the
declared callback interval, never to the entire cold startup.

Seed a bounded initial-handle roster from existing handle/backend state only.
Assign audit-local incarnation IDs deterministically and label them
`preexisting-at-window`; they are not observed opens. Keep original-open work/path
unknown unless already present in authoritative service-owned state. Immutable
asset identity may be reported as current identity, without inventing a prior
pathname callback. Capture current backend cursor through its pure accessor;
do not reopen files or read guest paths/DTA. Subsequent opens receive fresh IDs,
successful closes retire them, and reuse cannot inherit a seeded identity.
Charge the roster against the existing retained-byte budget. Offline validation
must seed continuity from this roster and reject duplicated IDs/handles, forged
observed-open claims, events before coverage start and reuse inconsistencies.

This window is intended to observe Add enumeration and WHO/STF/SFX operations.
It does not prove WORLD operations that happened before 16,000,000. Retain that
M1/M2 obligation explicitly; if an earlier WORLD callback needs measurement,
select and review a separate bounded original-work interval from original source
and runtime evidence. Do not claim that missing pre-window events never happened.

### Replay gate repair

The failed bootstrap receipt legitimately had `completion_reason=incomplete-close`
and no `capture_sequence`; the v2 gate indexed that absent field and obscured the
real failure with a KeyError. Check receipt shape, completion reason and expected
end-work before accessing capture fields. On incomplete receipt stop before any
next command, retain the raw receipt/path/hash and available actual terminal
host-cap/failure details, then follow the existing PID monitor/cleanup obligation.
Do not weaken exact successful receipt/frame comparisons or rewrite old evidence.

### Required controls and next execution gate

Luna must cover callbacks immediately below/at/above the threshold, no callbacks,
termination before start, initial open handles and later reuse/close, new opens,
unknown initial pathname, roster budget failure, native faults, and unchanged
off/on architectural state across the threshold. All old service/codec/publication
controls remain. Mutate manifest interval/initial roster/incarnation and require
cause-specific rejection. Exercise incomplete bootstrap and key receipts without
capture fields through the actual gate precheck, proving no additional command.

After fresh source review, focused controls, full native regressions and a bound
release binary, prepare new frozen off/window-on configs and fresh isolated saves.
Repeat only the accepted exact nine-action route, off first and on only after off
passes; retain every frame/token/work/input gate. Validate BIOS and the windowed
DOS companion separately, compare endpoint/RAM/register/work/save parity, and
compare observed WHO/SFX transfer counts/digests with original pinned inputs.
No View, Save or Begin action is included. This is not universal write-failure
or publication-race acceptance.
