# DOS file-store foundation acceptance

2026-10-15. Part of the [full Rust reconstruction plan](cok-rea-full-game-plan-2026-10-15.md).

Sol implemented a deterministic memory-only DOS regular-file backend in
`rust/cok-recomp/src/dos_files.rs`. Assets and saves have explicit separate
namespaces. The backend provides access modes, create/truncate, independent
handle cursors, reads/writes, zero-byte length adjustment, seek, close, quotas,
and injected short writes/errors. Original assets cannot be changed through
this API. Save buffers can be exported and restored without assuming a game
save schema.

Astra reviewed the source and required absolute seek offsets to preserve all
32 unsigned bits. Sol repaired this; relative seek offsets remain signed.
Astra approved the repair and its high-bit/negative-relative discriminators.

Luna compiled the standalone Rust test harness and executed it: **9 passed,
0 failed**. Tested source SHA-256 identities:

- `dos_files.rs`: `190167125bbd8b7590c8b912c25f54fee97daa27fe1b809284d51deccf68de77`
- `dos_files_tests.rs`: `b9f7a01e5bf5d7ccb00d6b3f0be955250ab34f3a3eaaffa0e76b3365e19edc1a`

The controls cover access/path/asset restrictions, handle lifetime, independent
cursors, overwrite/extend/truncate, absolute and relative seeks, resource-error
atomicity, and injected failures/short writes.

This module is not yet wired into the application. Host disk persistence,
original character/world-save helper contracts, DOS register/error adaptation,
and cold-process save continuity remain unfinished. Quotas, rejected negative
relative positions, virtual directories and normalization are explicit host
policies requiring review when adapting the actual guest services. This closes
the isolated backend task, not creation or full-game save/load.

## Directory and metadata extension

The subsequent source review followed the
[original character-persistence adapter plan](cok-character-persistence-adapter-plan-2026-10-15.md).
Sol added explicit root/directory metadata, parent/collision checks, exact-path
lookup, file deletion with an open-handle denial policy, and quota-backed DOS
free-space geometry. Wildcard search, FindNext and guest-drive routing remain
outside this backend API.

Astra approved the source. Luna compiled and ran the isolated updated harness:
**15 passed, 0 failed, 0 ignored**. Tested source SHA-256 identities:

- `dos_files.rs`: `7c6081e21f85ba450430cdf177e7a2aa007a6ba242df8cf1133f7de773f53cf5`
- `dos_files_tests.rs`: `0c0ccf67129c11528692f0f3dc8ec8709671bf15b91d05f7c7daf92527efc4bf`

Local evidence: `build/cok-recomp/dos-files-directories-20261015-a/`.
No guest adapter, host-disk persistence or original save execution is implied.
