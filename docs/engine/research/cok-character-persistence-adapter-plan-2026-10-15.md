# Character persistence: original ABI and bounded host adapter plan

2026-10-15, Astra. Read-only decoding of held START.EXE/GAME.OVR with the existing
Capstone installation; no new REA execution, build, tests or DOSBox. Original
inputs are pinned by the existing preparers. This plan supplements the whole
creation plan and the already tested, unwired memory-only `dos_files.rs` store.

## Original character persistence contract

A4:255D calls descriptor9E stub0034, resolving to9E:0BED. The caller pushes the
candidate character pointer and an empty Pascal string (A4:065B is length zero).
At0BED after PUSH BP/MOV BP,SP, **BP+6 is the filename-string far pointer and
BP+0A is the character far pointer**; locals consume2EEh bytes. It returns with
RETF8 at11AE. A host adapter must not bypass this original function.

9E:0BED copies at most8 filename characters locally. Empty supplied name takes
the original naming/prompt path and suffix **`.who`** (constant9E:0B66). Nonempty
supplied name uses **`.sav`** (0B6D). Both append to the configured Pascal path at
DS:5784. Sidecar names use the same base plus **`.stf`** (0BE3) and **`.sfx`**
(0BE8). Therefore creation's initial output is not automatically CHRDAT*.SAV;
the world-save caller supplies its own slot/index base through the other branch.

The helper computes needed bytes as199h plus3Fh for each node in the character
list rooted at+143h/+145h (next at node+2Ah/+2Ch), plus9 for each node rooted
at+E3h/+E5h (next at node+5/+7). The main write at0FF3 calls0A46:14BB with a
199h record count and record size1. Subsequent loops at10B1/1185 write3Fh/9
bytes per node, respectively. It deletes prior sidecars before conditionally
recreating them. This is original-byte evidence of these write operations,
not a complete validated file format or proof that raw pointers need no load
fixup. Never construct a new format from these observations.

## Resident file-record ABI

0A46:139B takes a far Pascal filename pointer nearest the return frame and a
far file-record pointer next; RETF8. It initializes record+0 handle, record+2
state D7B0h, clears the record header and copies up to4Fh filename bytes into
record+30h, then writes an ASCIIZ terminator. The host sees the resulting
ASCIIZ **DS:DX**, not the Pascal string.

0A46:13C9 opens with AH3Dh and AL from DS:43B2. 13D2 creates with AX3C00h.
At their shared prologue, BP+6 is record size and BP+8 the file-record far
pointer; RETF6. They set DS:DX to record+30h, set CX=0, and invoke INT21h at140F.
On carry, AX is stored into runtime I/O error DS:43AC. On success the record
gets state D7B3h, handleAX and record size at+4. An already-open record is first
closed through144A. Preserve this path; do not set record fields in Rust.

0A46:144A validates D7B3h, calls AH3Eh for handles above4 and marks the record
closed D7B0h; RETF4. 146F sets error67h for invalid state. 142E invokes AH40h
with CX=0 for truncation; ordinary backend short-write-zero must remain distinct.

### Block read/write: 14B4 and14BB

14B4 selects BL=3Fh and mismatch code64h; 14BB selects BL=40h and mismatch
code65h. Shared body14C0..1519 has this stack contract after saving BP:

| Frame location | Value |
| --- | --- |
| BP+6/+8 | Optional actual-record-count output far pointer;0000:0000 means absent |
| BP+0A | Requested record count |
| BP+0C/+0E | Buffer far pointer |
| BP+10/+12 | File-record far pointer |

It validates state, multiplies requested count by file-record+4 into CX, loads
DS:DX from the buffer pointer, loads BX from record+0, sets AH3Fh/40h, and calls
INT21h at14E2. Carry means AX is a DOS error and is copied to DS:43AC. Otherwise
AX (actual transferred bytes) is divided by record size to produce actual
records. With a nonnull result pointer it stores that record count. Without one
it compares actual/requested records and stores64h/65h for short read/write.
An error with an output pointer stores zero there. RETF0Eh removes all14 argument
bytes. A zero requested record count skips INT21h; it is not the truncate API.
The original16-bit MUL behavior is part of the guest, not permission for Rust
to silently reinterpret buffer lengths as records.

Thus the earlier5,469-byte world-save inference becomes supported as a byte
sum only where each caller's file record is proven initialized with size1;
it still needs its own complete save/load runtime round trip.

## Additional services required by actual creation

| Original path | Actual service and contract | Minimum host behavior |
| --- | --- | --- |
| 0BED→0555→9C4:0112 | AH1Ah sets DTA, AH4Eh FindFirst; CX10h for save-directory lookup | Existing directory succeeds with directory metadata; absent directory returns a real not-found error |
| 0555→0A46:178F | AH39h at17DA, ASCIIZ DS:DX from original Pascal conversion | Create the requested save directory or return honest error; no asset namespace mutation |
| 0BED:0CC9→9C4:00DE | AH36h at00E6, DL drive number | Return quota-backed geometry/free clusters, or AXFFFFh for invalid drive |
| 069C:04C1→9C4:0112 | AH4Eh with CX0 for existence tests | Exact filename lookup in the mutable store, not constant success |
| 069C:0154→0A46:15D8 | AH41h at15E4, record filename DS:DX | Delete an existing save-sidecar only; denied/missing cases remain errors |
| 0A46:13C9/13D2/144A/14BB | AH3Dh/3Ch/3Eh/40h | Open/create/close/write through shared DOS handles |

9C4:016A converts successful DTA ASCIIZ filename at+1Eh into Pascal format and
sets **DS:8A58** to zero; on error it stores DOS AX there. This is distinct from
the resident Pascal I/O error **DS:43AC**. Preserve both original paths; never
mirror them automatically in the host. Whether other original runtime machinery
copies/clears errors between those slots remains a closure-analysis question.
The caller reads8A58 after an open in one branch; do not silently repair that
observed original sequence based on assumed Pascal semantics.

9C4:00DE multiplies returned sectors-per-cluster AX by bytes-per-sector CX,
then free clusters BX, returning free bytes DX:AX. Its intermediate arithmetic
is16-bit. Choose a truthful supported geometry whose cluster size fits16bits;
derive free clusters from the store's remaining byte quota rather than returning
an arbitrarily huge constant. A disk-backed store later must also respect actual
available disk space. DOS register conventions reference:
[MS-DOS Encyclopedia system calls](https://www.pcjs.org/documents/books/mspl13/msdos/encyclopedia/section5/).

## Approved next Sol task: extend the isolated store

Own `src/dos_files.rs` and its isolated test file only, plus focused documentation.
Do not edit startup_platform, main, lifter, generated C or existing runtime
artifacts while Luna owns the foundation/creation runtime lease. **Zero guest
bytes** are admitted by this task.

Add explicit directory metadata, exact-path find metadata, mkdir, delete, and
quota-derived free-space reporting to the store. Preserve asset immutability and
the tested handle/read/write semantics. Directories are required because the
original distinguishes an existing save directory from a missing one. Reject
file/directory collisions; creation under a nonexistent parent must fail, and
deleting a directory through the file-delete operation must fail. Make root
existence explicit, seed declared asset/save directories deliberately, and
update existing nested-path test setup to create their parent metadata.

Implement exact-path FindFirst behavior required above with metadata for later
DTA serialization: attributes, size and DOS basename. If a currently reached
guest path contains wildcards, extend to the measured pattern/FindNext contract
as a follow-on; do not claim general search support or return invented matches.
Declare unsupported search flags explicitly. No raw host filesystem traversal.
For open-file deletion use an explicit deny policy until original runtime use
requires another behavior; test it, and keep paths immutable on rejection.

Free-space accounting shares the actual max_save_bytes quota used by writes.
Return a declared geometry with remaining clusters rounded down; this may
conservatively report less than the byte quota but must never report more.
No hardcoded always-enough disk result. Ensure values fit DOS16-bit fields and
document any cap. Namespace decisions remain explicit API inputs.

Luna's isolated test pass must discriminate: existing/missing directories;
directory/file collision; nonexistent parent; exact case/slash aliases; delete
existing/missing/open files; asset delete/mkdir denial; a sidecar create-delete-
recreate sequence; correct file vs directory attributes/size/name; remaining
space before/after write/truncate/delete; exhausted quota; invalid drive at the
adapter boundary; and failure atomicity. Keep backend tests distinct from
claims about original helper execution.

## Subsequent serialized runtime adapter task

Concrete source review after backend acceptance: the held `KRYNN.CFG` fourth
line selects `C:\SAVE\`, while `Extended.cwd` defaults to `C:\KRYNN`.
Routing must bind the active configuration after overrides and resolve absolute,
current-drive-rooted and relative names against declared drive/CWD state.
Require component boundaries so `C:\SAVE2` never matches `C:\SAVE`.
Represent initial save-directory existence explicitly rather than returning
synthetic successful directory lookups.

Approved source ownership: runtime adapter Sol owns `startup_platform.rs`, a
new focused `startup_save_adapter.rs`, module declarations in `main.rs`, and
only the active-configuration attachment in `startup_session.rs`. Creation Sol
owns the separate traversal/lifter/preparer lane. Shared builds are serialized.

After backend acceptance and source-closure review, wire the store through a
dedicated adapter and controlled startup_platform changes. One handle allocator
must cover both old asset and new save handles, or a demonstrably disjoint
mapping must route every close/read/write/seek correctly. Preserve the existing
readable mode2 asset compatibility; it grants no asset writes. Map only the
declared configured save directory (including its DOS drive/CWD spelling) to the
save namespace, and map known assets to Assets; do not classify every unknown
filename as a writable save.

Reuse `startup_platform.rs`'s existing DTA segment/offset fields and AH1Ah/4Eh
serialization path (currently paired with3Dh near635), plus its existing
seek/read service guards near730/763. Extend the selected backing store and
metadata source; do not introduce a second competing DTA or duplicate guest
register service loop. The isolated backend emits typed metadata only. Shared
startup/main integration is serialized until the current GUI lease closes.

Decode DS:DX and CX at the interrupt boundary, validate complete guest ranges
before mutating files/cursors, copy write input before committing, and validate
read/DTA destination before consuming a read/search result. DOS error sets CF
and AX; success clears CF and returns the operation's actual documented values.
AH36h's invalid-drive AXFFFFh result has its own contract. FindFirst serializes
the ordinary43-byte DOS DTA, including ASCIIZ filename at30; original9C4 code
performs the Pascal conversion afterward. Do not pre-convert it in the host.

Integrate3Ch/40h/39h/41h/36h and mutable3Dh/3Fh/3Eh/42h/4Eh/1Ah behavior with
the existing service-admission/protection rules. Unsupported operations still
fault honestly. Tests must run original9E:0BED through fresh filename creation,
existing filename overwrite decision, empty/nonempty attachment lists and a
real write failure, corroborating199h/3Fh/9-byte writes, original error state,
stack cleanup and root return. Actual disk persistence/export and cold restart
must be implemented before claiming persistent character saving; an in-memory
helper return proves only in-process correctness.
