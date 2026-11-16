# Bind the accepted host save store to DOS runtime services

2026-10-15, Astra source-only plan following checkpoint01928aa1. Host storage
passed15 ordinary tests and its actual short-name alias discriminator. The real
case-sensitive filesystem discriminator was unexecuted for unavailable privilege;
production collision registration passed its unconditional controls. This plan
adds no guest instruction bytes and no save-file schema.

## Ownership and bounded deliverable

Start shared edits only after creation-root integration is frozen and its build
lease released. Sol owns `dos_files.rs`, `startup_save_adapter.rs`, the save
branches of `startup_platform.rs`, session option/attachment code in
`startup_session.rs`, GUI option forwarding in `frontend.rs`, the module
declaration in `main.rs`, and focused integration tests. Coordinator serializes
those writes with the root lane. The accepted `dos_save_host.rs` stays the raw
filesystem implementation; repair it only for an observed integration defect.

Deliver explicit `--save-dir HOST_PATH` in both startup and frontend commands,
complete raw import, synchronous durable mutation, truthful failure return and
cold-process DOS readback. This is one runtime-storage task. Guest instruction
tuples, source/fixup identities and creation ancestry remain exactly unchanged.
Original character creation/load acceptance uses this capability afterward and
must not be inferred from backend byte tests.

## Actual source seams and startup rules

`StartupSession::new` currently calls `attach_save_directory(false)` after the
CFG/CWD option loop. `Extended` owns the shared guest-handle map; `SaveAdapter`
owns DosFiles and translates names into `SAVE\\...` backend names. The GUI
constructs its own startup argument vector and only explicitly forwards
`--audio-wav` today: adding session parsing alone will not expose GUI persistence.

Parse one optional save-dir PathBuf, reject duplicates/missing values, and
forward it unchanged from frontend. Require an existing supported Extended
profile; fail an explicit save-dir with no usable CFG/save binding. Keep the
current no-option memory-only behavior for diagnostic fixtures. Resolve the
active guest directory only after all CFG/CWD overrides. With an explicit host
path, malformed CFG, invalid root, asset overlap, locked root, invalid import or
quota overflow must return a startup error, never `.ok()`/empty-store fallback.
The machine must not execute before binding and complete import succeed.

Give SaveAdapter an optional owned HostSaveRoot and a fallible host attachment
constructor. Keep its OS lock alive for the entire session, including GUI
yield/input waits. Dropping the session releases it; there is no pending flush.
Centralize the existing limits (16MiB/file,16MiB total,1024 handles) so import,
DosFiles and publication cannot disagree.

Protect the actual generated asset directory and actual original GameDir by
passing both as forbidden roots to HostSaveRoot::open. Runtime currently only
knows `COK_GENERATED_DIR`; do not guess GameDir from that directory's shape.
The narrow build seam is to pass resolved GameDir from build.ps1 as build
environment metadata and expose it through build.rs to Rust, independently of
portable guest manifests. Also include the repository's declared original game
directories when present. Explicit persistence must reject missing/unresolvable
required source-root metadata, not omit that exclusion. Do not alter reproducible
guest tuple/proof content to encode machine-specific host paths.

## Complete import and name mapping

Call host.open/load before exposing the adapter. Build a fresh candidate
DosFiles. If host root exists, seed the configured directory_name first; then
prefix and seed imported directories in the supplied parent-first order, then
insert every raw file. Attach only after the complete import succeeds. For a
missing host root, do not seed the configured directory: original FindFirst
must observe absence until original mkdir succeeds.

One checked translation converts a backend save name to host relative name:
directory_name alone maps to empty root; directory_name plus separator maps to
its tail. Reject anything outside this component boundary. `SAVE2`, assets and
unknown DOS paths never reach HostSaveRoot. C:\\SAVE\\HERO.WHO must become
HOST_PATH/HERO.WHO, not HOST_PATH/SAVE/HERO.WHO. No extension whitelist and no
reinterpretation of WHO/SAV/STF/SFX/DAT bytes. Exact-case import spelling remains
the host module's responsibility.

## Candidate mutation, then publication, then guest success

Add Clone to DosFiles (its Handle and Limits already support Clone/Copy) and a
narrow checked accessor returning a save handle's normalized filename. Keep
backend IDs private to SaveAdapter and preserve the platform's one guest map.
Implement small named adapter methods for create/write/mkdir/delete rather
than a generic transaction abstraction. For memory-only adapters these methods
delegate directly to the existing store.

For host-backed mutations, copy the bounded DosFiles state, apply the existing
operation to that candidate, publish exactly the affected file/directory using
the accepted host module, then replace the live store. On host failure discard
candidate and return its DOS code, retaining all live bytes, cursors, directory
metadata and handles. Keep operation/path/OS cause in the diagnostic event.
Do not report CF-clear before publication or silently downgrade to memory mode.

| DOS operation | Candidate action and publication |
| --- | --- |
| AH3C create/truncate | Reserve a free guest number first; candidate.create obtains backend handle; publish candidate raw empty file; commit store and guest mapping only on success. Existing-file truncation is a real mutation. |
| AH40 write | Preserve whole source-span validation and copy all requested guest input before invoking candidate.write. Publish the candidate's complete affected file, then commit its actual-count/cursor result. |
| AH40 CX=0 | Do not inspect DS:DX. Candidate adjusts length at its cursor; publish resulting bytes before returning AX0. |
| AH39 mkdir | Candidate.mkdir validates parent/collision; host.mkdir translates configured directory to empty relative root; commit only after OS success. |
| AH41 delete | Candidate.delete enforces missing/open-file denial; host.delete_file must succeed before removing live metadata. |

Keep failed backend operations entirely before host access. Preserve backend
short-write counts; a short-zero write with a nonempty request is not CX=0
truncation. It need not republish unchanged bytes. Preserve existing one-shot
write-fault injection semantics in test builds rather than accidentally keeping
an injected failure armed forever because a failed candidate was discarded.

AH3D/3E/3F/42 and exact4E keep existing handle/read/seek/DTA semantics. Close has
no delayed publication: all successful mutations were already committed. Close
failure must not remove a live guest mapping. Read and DTA whole-destination
admission precedes cursor or guest-memory mutation; no disk import occurs midway
through a read. Existing open handles observe later committed replacements by
their shared backend name. Test both read/write handles and interleaved immutable
asset handles.

The host module checks external directory changes before each mutation. Its
session is an imported snapshot, not a live external-file editor: external edits
are unsupported and cannot be merged silently into the store. Preserve its
directory handles with FILE_LIST_DIRECTORY|READ_ATTRIBUTES and no DELETE sharing.

AH36 on a supported save drive uses min(logical quota remaining, host available
bytes), rounded down to512-byte clusters and capped to existing16-bit geometry.
Retain total_clusters as declared capacity and invalid-drive AXFFFF behavior.
If host capacity lookup fails, return AXFFFF and log the cause; do not invent
free space or apply the ordinary CF/AX error helper to this special service.
Normal file errors use CF set and DOS AX; successful mutations clear CF and
return the actual documented value. No host writes to Pascal error globals.

## Luna integration gates

Source review first, then serialized focused tests and the full Rust suite on
the root-frozen generated C. Check the generated guest manifest hash/tuples are
unchanged. Rerun the15 ordinary host controls if the host module changes; keep
optional filesystem status distinct from ordinary passed counts.

Focused integration tests must discriminate:

1. Both command paths accept/forward save-dir; duplicate/missing/invalid option,
   malformed final CFG, unavailable binding, forbidden root and bad import fail
   before guest execution. No-option diagnostics remain memory-only.
2. Existing and absent root, nested directory/raw import, active alternate
   CFG/CWD binding and exact component prefix translation. Imported bytes and
   names survive without an extra SAVE directory; malformed imports install no
   partial adapter.
3. Through platform.dos, real create/write/seek/truncate/read/close/delete/mkdir
   produce matching host bytes and DOS registers. Test shared guest handles,
   an existing reader observing overwrite, mode2 asset reads and all asset
   mutation denials. Confirm original asset sentinels/hashes unchanged.
4. Host publication denial for create-overwrite, ordinary write and CX0 leaves
   disk and live bytes/cursors/handles unchanged, sets CF/AX, and permits a
   later successful retry. A real Windows held-file denial must reach publish;
   retain the host's accepted OS5-or32/DOS5 distinction. Test disk quota failure,
   injected write/flush failure, failed mkdir/delete and no leaked guest handle.
5. Guarded/overflow write input produces no temp/publication; guarded read/DTA
   destinations preserve cursor and memory. Zero-length truncate works with
   invalid DS:DX. Disk-free declines after writes and recovers after deletion;
   host capacity failure and invalid drive stay honest.
6. Independent subprocess A uses platform.dos to write binary HERO.WHO and
   sidecars, exits without a special flush, and subprocess B constructs a fresh
   adapter/session, imports, opens and reads them through DOS services. Repeat
   overwrite/delete and failed-publication cases. This adds adapter cold-process
   evidence to the already accepted raw-host cold-process tests.

Then run the whole-root creation route with save-dir: original naming/persistence
produces a real WHO; record original write sizes/error state and host hashes.
Terminate, reopen and use the original character-load entry when that closure
is admitted. If original party selection requests wildcard FindFirst/FindNext,
record exact DS:DX pattern, CX, DTA use and call sequence. Current backend only
implements exact4E and no4F; wildcard search is a separately planned measured
service extension, not permission to return an invented match or bypass the
original party manager. Label cold DOS byte continuity separately from cold
original-character/party loading until that path actually passes.

After verified/documented commit/push, continue that remaining original load
dependency or paired M2 world persistence task. Do not claim durable gameplay
from successful integration tests alone.
