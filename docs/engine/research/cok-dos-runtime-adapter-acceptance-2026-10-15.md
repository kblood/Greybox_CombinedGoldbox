# In-memory DOS runtime adapter acceptance

2026-10-15. Implements the guest-service integration step in the
[character-persistence plan](cok-character-persistence-adapter-plan-2026-10-15.md).
Zero original guest instruction bytes were added by this task.

Sol connected the tested DOS store to the existing runtime dispatch. Active
CFG/CWD values determine the save namespace; the held game configuration uses
`C:\SAVE\`. Immutable assets and mutable saves share guest handle allocation,
with private backend handle IDs. Existing DTA state and memory-admission guards
are reused for create/open/read/write/seek/close, directory lookup/creation,
delete and quota-backed free space. The initial save directory is explicitly
missing until created. Unknown paths do not become writable saves.

Astra reviewed the source and approved testing. Luna ran the focused groups
and full optimized Rust suite: the initial **134 tests passed**. Sol then added
four requested controls for unsigned high-word save seeks, failed-seek cursor/
incoming-DX preservation, closed/reused handles and mode-2 asset compatibility.
Luna's final pass recorded **11 save tests passed and 138 total tests passed,
0 failed, 0 ignored**. The normal application build also succeeded.

The fixed accepted generated manifest remained
`c07846ce53cc657429fe91b9a2b2f1e58d3d90c4ef4f7318271e10a362a33918`.
Cargo1.99.0 / MSVC14.39.33519 / compiler19.39.33523 / SDK10.0.22621 used normal
release optimization, with actual `-O2 -Brepro` native command evidence.
The final application SHA-256 is
`2267a1d699c078904c6f1e9dd6b131277fe27e4d0c0ae8578f65c9c69c38cce9`.
The previous134-test binary belongs to the earlier platform-source identity;
it is not the final artifact.

Evidence and before/after pins:
`build/cok-recomp/dos-save-adapter-target-20261015-a/`, including
`final-validation-receipt.md`, `full-tests-final.log` and
`validation-pins-before.json` / `validation-pins-after.json`.

This acceptance covers guest interrupt dispatch exercised by Rust tests using
the existing generated program. The newly recovered original AH36/39/41 helper
bodies still require the next helper-generation/runtime pass. No original
character-save completion, host disk publication, cold-process reopening or
world-save continuity is established. The store is still memory-only.
