# Durable raw DOS save files: bounded host implementation

2026-10-15, Astra. Source review and Windows API documentation only; no
generation, build, tests or guest execution. The accepted memory store and
runtime adapter remain the foundation. This task admits zero guest bytes.

## Evidence and seam

`startup_session.rs` parses CFG/CWD overrides, then attaches the configured
directory. `SaveAdapter` resolves DOS names and owns `DosFiles`; it currently
always receives `directory_exists=false` from the session. The declared limits
are 16 MiB per file and 16 MiB total. `DosFiles::insert` restores raw files before
opening handles; `seed_directory` restores directory metadata. `bytes` and
`saves` expose raw content. There is no disk import, disk publication or exit
flush. No existing CLI option selects a host save directory.

Keep guest routing there. The host module receives validated relative names,
never DS:DX, DOS drives, Pascal structures or a guessed character schema. Map
the configured DOS directory itself to an explicit host directory: for example,
guest C:\SAVE\HERO.WHO maps to HOST_ROOT/HERO.WHO, not HOST_ROOT/SAVE/HERO.WHO.
The internal store's SAVE prefix is removed only at the adapter boundary.

## Immediate Sol ownership

Implement NEW `src/dos_save_host.rs` and NEW standalone
`tests/dos_save_host_standalone.rs`, plus a focused test driver if subprocess
tests need one. Include the existing `dos_files.rs` by path in the standalone
test crate; use rustc without building generated C or changing Cargo/build/main.
No edits to startup_platform, startup_session, startup_save_adapter, dos_files,
the lifter, manifests or generated artifacts during the creation build lease.
Luna owns execution after source review. Keep implementation to raw directory
import and four filesystem operations, not a transaction framework.

Suggested API, with equivalent compact naming acceptable:

- `HostSaveRoot::open(path, forbidden_asset_roots, limits)` validates and binds
  one explicitly supplied host root. Return a structured host error with its
  DOS code and diagnostic cause. Missing root is a supported state when its
  immediate parent exists; do not silently create the guest directory.
- `load()` returns root-exists, normalized directory names in parent-first
  order, and normalized filename/raw-byte pairs. Validate the entire import
  before the caller receives it. Never partially populate a live DosFiles.
- `mkdir(relative)` creates one directory; empty relative name means the
  configured root. Missing intermediate parents fail.
- `replace_file(relative, bytes)` publishes one complete raw file, including
  zero length. It supports both first creation and replacement.
- `delete_file(relative)` deletes one regular file; directories fail.
- `available_bytes()` reports host capacity for later conservative AH36 use.

Do not filter extensions: WHO, SAV, STF, SFX and other names already admitted by
the DOS namespace all use identical raw operations. No JSON save wrapper,
manifest-required file format, synthetic save records or filename remapping.

## Namespace and ownership

Require an absolute local host root outside every declared original asset root.
Reject equality and ancestor/descendant overlap using canonical components, not
string prefixes. For a missing root, validate its existing immediate parent
and final component. The caller supplies the actual asset roots used by this
runner; never infer permission from a filename suffix. Do not read originals
as a source of writable save files.

Use the existing DOS normalizer for every relative component/path. Reject
absolute names, drives, parent traversal, devices, streams/colon, wildcard,
trailing dot/space and non-ASCII aliases. Import case-insensitively; reject two
host entries mapping to one DOS name, including file/directory collisions.
Preserve an existing host entry's spelling when replacing it; new names may
use normalized uppercase spelling. Reuse original raw bytes unchanged.

Reject symbolic links, junctions and all Windows reparse entries at the root,
its traversed ancestors and imported descendants. Inspect entries without
following them; check directories before recursion and files before reading or
replacing. Never recurse outside the bound root. Hold directory handles without
delete sharing while operating so checked directories cannot be renamed out
from under path resolution. The Windows implementation must verify the actual
opened object's attributes; a lexical/canonical check alone is insufficient.
If a safe binding cannot be obtained, fail instead of following a fallback path.

Allow only one cooperating writer per host root using an OS-held exclusive
lock, released automatically on process termination. A small reserved sibling
control filename containing a space cannot collide with an admitted DOS name;
use the same approach for publication temporaries. No stale lock timestamp
protocol. External edits during a bound session are unsupported and must not
be silently merged. Test competing runner ownership and directory replacement
rejection. Do not claim resistance to arbitrary same-user hostile processes.

## Publication and failure semantics

For replacement, create a unique temporary in the destination directory with
exclusive create, write all bytes, and `sync_all` before publication. Never
truncate the destination in place or delete it first. Publish with a same-volume
replacement operation. On Windows use a small reviewed Kernel32 binding for
MoveFileExW with REPLACE_EXISTING and WRITE_THROUGH; never COPY_ALLOWED or
DELAY_UNTIL_REBOOT. Its documented replacement/error behavior is here:
[MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw).
Directory/reparse and sharing behavior must follow
[CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew).

The supported first target is this Windows machine's local filesystem. Verify
replacement and cold restart there. Do not claim universal power-loss or
multi-file transaction atomicity from this API. Each successful DOS mutation
will eventually publish independently; original multi-file ordering remains
original game behavior.

Any failure before successful publication preserves the old destination bytes
and absence/presence. Clean up only a temporary created by this operation. An
interrupted process can leave a reserved temporary; import must never expose
it as a DOS file, and must never delete unrelated files. After publication
succeeds, report success and avoid fallible operations that would misleadingly
report failure after committing the file. Parent directories must already exist.
Delete/mkdir return success only after the actual OS mutation succeeds.

Quota is shared with DosFiles: enforce max file size and 16 MiB total on import
and replacement, subtracting the old file's size for replacement. Reject an
over-quota import rather than loading a subset. Temporary disk space is extra:
the host may need the full replacement size while the old file still exists.
Check capacity conservatively and retain actual OS write/flush/publish errors;
a capacity precheck cannot guarantee a later write. AH36 will use the minimum
of remaining logical quota and host available capacity, rounded down to the
existing 512-byte clusters. No constant success/free-space result.

Map missing file/parent to DOS2/3, permission/reparse/collision/lock denial to5,
host out-of-space to112, and other write/flush/publication failures to29. Retain
the actual OS cause for diagnostics. Import failures abort session construction;
they must not produce an empty usable save namespace. Fault injection is a
test-only operation-stage hook, not a production CLI behavior.

## Later serialized integration

After helper sources/builds and this standalone module are accepted, add an
explicit `--save-dir HOST_PATH` startup option shared by diagnostic and GUI
session construction. No option retains current memory-only diagnostics.
Invalid host binding with an explicit option is a startup error, never silent
memory fallback. Bind only after final CFG/CWD overrides. Restore directories
and files into a fresh store and attach it only after complete import succeeds.

Use a candidate DosFiles state for guest create/write/truncate/delete/mkdir:
validate guest memory first, apply the existing backend operation to a candidate,
publish the affected raw file or directory, then swap the candidate into the
adapter. On host failure discard the candidate, retaining live bytes, cursors
and handles; return CF/AX error. A bounded Clone implementation for DosFiles and
a narrow handle-to-save-name accessor are sufficient later shared changes.
Do not duplicate handle allocation or rewrite DOS semantics in the host module.
Close/read/seek remain ordinary backend operations because mutations publish
when they succeed. No late exit-only flush, which would report guest success
before a disk failure and lose all saves on process termination.

Maintain guest/backend handle mapping atomicity for create: choose the guest
number, create in candidate, publish, then commit both mappings. Existing handles
observe replacements through the shared backend name. Failed writes preserve
cursor and original byte state, including CX=0 truncate and create-overwrite.
Successfully published partial writes keep their existing actual-count result.

## Luna acceptance

Standalone tests must cover first create, overwrite, zero length, shrink/grow,
delete/recreate, nested directory metadata, initially missing root, missing
parent, case/slash aliases, duplicate normalized imports, file/directory
collision, quota exhaustion/import overflow, root overlap with assets, links/
junctions/reparse refusal, competing writers and lock release after process exit.
Use isolated temporary host directories; original assets remain read-only.

Inject failure before writing, during writing, before/at flush and before
publication; compare old raw bytes and namespace afterward. Exercise an actual
OS publication failure as well. Demonstrate a subprocess ending after temp
creation and before publication leaves the prior file usable on a new process.

Cold-process acceptance is mandatory: process A publishes binary WHO content
with embedded zero/high bytes and sidecars, then exits; process B independently
opens the root and compares exact names/bytes. Repeat after overwrite, deletion
and an injected failure. This proves host storage, not that the bytes form a
valid game character. Later guest integration must generate the raw files by
executing the original helper, cold-launch the runner, and execute original
load behavior before claiming persistent character creation or world saving.

Record source hashes, focused standalone results and precise limitations.
No runtime-admission change and no full-game/cold-game claim in this first task.
