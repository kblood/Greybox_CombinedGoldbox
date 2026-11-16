# Standalone durable DOS save host: acceptance, 2026-10-15

Astra reviewed the source and repairs; Luna compiled and ran the standalone
Windows tests. The module is not wired into the guest runtime.

Module SHA-256: `0ea40e33e55cb91ee394427607f953c6c9f02fc65f49a62f098a02c8b436ab6f`.
Test SHA-256: `423d749f6886bb82cde1467596173a983fc40e80d0adfeb45015d91d57975fb0`.
Executable SHA-256: `2067ed91a037b27f63196619cc9cee8af913cc5cdee1ebcad463fe083fcfb2bc`.

The ordinary suite passed 15 tests, no failures, two optional tests ignored.
Coverage includes raw bytes across a child-process restart, publication
failure preserving old bytes, overwrite/delete, crash recovery, writer
exclusion, collision registration and bound-directory rename denial.
Directories request list/read-attributes access without delete sharing.
Rename denial must cease after handles close. Publication denial accepts
Windows error 5 or 32 while preserving exact DOS error and state assertions.

The separate optional run executed the short-name alias discriminator
successfully. Case-sensitive filesystem discrimination was UNEXECUTED:
fsutil returned access denied. Its passing wrapper is not capability evidence.
Unconditional collision checks passed in the ordinary suite.

Rust 1.99.0 / MSVC 14.39.33519 compiled the tests. TEMP/TMP were confined to
an owned build subdirectory, empty before and afterward. Source pins matched.
Evidence: ignored `build/cok-recomp/dos-save-host-standalone-repair1-20261015-a/`.

Next is serialized runtime integration under the durable-host plan, publishing
before DOS success, then actual original save/load across a fresh application
process. Standalone tests do not establish the original save ABI or M1.
