# Durable DOS runtime integration: transport acceptance

2026-10-15. Astra reviewed the isolated candidate and missing-test repairs.
Sol applied only the approved files after all9 source-base hashes matched.
Luna then validated the actual source. No additional original instructions
were admitted; the root-generated manifest remains
`feca212223cd06c4bdc5e11882d41081e70fc0da743b1d5937869110a9e66390`.

Both startup and frontend accept explicit --save-dir. Binding imports raw
files before execution, retains the writer lock, rejects invalid roots and
protects original/generated assets. Mutable DOS services publish to the host
before replacing the memory store or reporting success. Failure preserves live
bytes, cursors and handles. Accepted raw host source remains unchanged.

## Actual validation

- Focused durable controls:13 passed,1 ignored cold worker.
- Full release suite:162 passed,0 failed,1 ignored worker.
- The cold-process parent invoked that worker8 times, covering write/read,
  failed publication/read, overwrite/read and delete/read-after-delete. Each
  child status was checked. These are raw DOS-byte continuity tests.
- Normal optimized application build succeeded. All121 source/generated/
  original input hashes matched before and after.
- Cargo/Rust1.99.0, MSVC14.39.33519/cl19.39.33523, SDK10.0.22621.0;
  optimized native flags include /O2 and /Brepro.

Normal executable SHA-256:
`6ab8c38eaa15cc0c8b88e6edd09542691efb0b82d82d43d6838e72e4f0191fcd`.
Receipt SHA-256:
`3367efdb05617aac676ff7e1ad6c843446033a4df725b142b010bde80a58654e`.
Evidence: ignored `build/cok-recomp/durable-runtime-target-20261015-a/`.

TEMP/TMP were confined to owned build scratch;31 fixture directories remain
as local test evidence. The normal-build invocation accidentally selected a
workspace-root output directory. After compilation and process/output closure,
Luna verified both paths and moved only that owned cache to ignored
`build/cok-recomp/durable-runtime-normal-target-20261015-a/`. Binary bytes/hash
were unchanged. Original invocation and relocation receipt remain preserved.

## Still required

This accepts durable DOS transport, not a valid original WHO format or a
completed character. The actual original create/save/load/party route and cold
original-character reload remain open. The GUI must first use the reviewed
bounded BIOS/checkpoint journal; do not repeat the known unbounded report run.
World-state save/load and campaign continuity remain later M2 acceptance.
