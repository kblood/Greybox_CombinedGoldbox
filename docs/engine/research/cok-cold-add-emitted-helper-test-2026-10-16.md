# Cold Add: emitted helper regression (non-acceptance)

**2026-10-16 — source-bound offline experiment.** This note records one
focused test of the original lifted guest helper at `9E:1989`; it is not M1,
campaign, or runtime acceptance evidence.

## Test and observed result

Added `cold_add_emitted_9e1989_installs_head_then_appends_second_node` to
`rust/cok-recomp/src/cold_add_tests.rs`. The test constructs minimal guest
memory and executes the emitted helper twice at resident load bases `0x0000`
and `0x1000`. It checks that the first call installs KRA as head and current,
assigns slot 0, and increments the pointed-to count to 1; the second call
preserves KRA as head, links DWF2 after it, makes DWF2 current in slot 1, and
increments the count to 2. It also checks the resulting null tail link and the
helper's `RETF 4` stack cleanup. Character payloads are intentionally not
fabricated.

The single focused run passed: 1 test passed and 277 were filtered; the
standalone integration test binary selected 0 and filtered 18. Command:

```powershell
$env:COK_GENERATED_DIR='C:\cok\build\cok-recomp\generated'
$env:CARGO_TARGET_DIR='C:\Users\Caldor\AppData\Local\Temp\cok-m1-offline-test-01\target-shortroot'
$env:RUSTUP_AUTO_INSTALL='0'
$env:CARGO_NET_OFFLINE='true'
& 'C:\Users\Caldor\.cargo\bin\cargo.exe' test --offline --manifest-path 'C:\cok\rust\cok-recomp\Cargo.toml' cold_add_emitted_9e1989_installs_head_then_appends_second_node -- --nocapture
```

The primary crate-root attempt stopped at compile time because its relative
`cold_add-tuples.json` and `world-tuples.json` includes were absent. To avoid
adding or copying fixture files into the primary checkout, the exact edited
test source was copied into the retained isolated `C:\cok` snapshot and its
SHA-256 was checked equal before running. The Cargo target was new and confined
to TEMP. The test source SHA-256 was
`1aa51d8c40f83bae70ca9aeebd5c14ad2ecd2565e2636745c858ee61de95b5d2`.

## Source and generated-input binding

All 187 files under the primary `rust/cok-recomp` tree (excluding build,
target, and Python cache output) had an exact path and SHA-256 match in
`C:\cok`; there were zero content mismatches. The snapshot had 19 additional
files: 18 preparation fixture JSON files listed below and a local
`cok-unpacked.exe`. All 25 `csrc` files, all 22 YMFM source files, and the
following directly consumed source files matched byte-for-byte:

| Input | SHA-256 |
| --- | --- |
| `rust/cok-recomp/lift.py` | `6d13cb10f0582f18d7080c86c1d8623763d9361b848907129a7127a5066c6b40` |
| `rust/cok-recomp/build.rs` | `01a6e6683f61e2b552d31a9ac11b09f0f7db3f535f81d8502d8844084712a891` |
| `rust/cok-recomp/build.ps1` | `c39588b50d496fde082967e345662ca70d739236b018b8e601cd994a7fc6971b` |
| `rust/cok-recomp/Cargo.toml` | `eb837e4bdf95899f35bbad1a36ce299c7ecc5f85c04cfa60fdd6532f7e2145cc` |
| `rust/cok-recomp/Cargo.lock` | `11d5ebfcc82dfd2128893483c99e45c3888ad2e4c4194fea89a3381d489bd5d1` |
| `rust/cok-recomp/src/main.rs` | `40ad0006e52254997c9a8bc3de70a6f4b1d2fd62f56b133130fd0cfa2c34d491` |
| `tools/exepack_unpack.py` | `5089cda4cc65a0918e8f55c06e8b839e727186a01db78e28a8b0b27b385e9431` |
| `tools/borland_overlay.py` | `c9c5a3f4a979ed31b9cbd3fd3a30929d4f417cbf3978c68b644762addbb5f039` |
| `tools/dax_decode.py` | `f8fc13ab058f6454fa7bd9ec2992b78fe3a313e5efd25d3e96af1da19124fb82` |
| `build/cok-recomp/cok-unpacked.exe` | `b51f3fd69bc50e171a6e3429c7bc75df7cbc5c0a6e9bc993dacf4fdfd619f433` |
| `build/cok-recomp/third-party/ymfm-source-provenance.json` | `0a3da5891b8617bcd2bbd2bb23e6e6a12be7e480a71b49dc08b9caba29f4d5eb` |
| `build/cok-recomp/third-party/ymfm/LICENSE` | `2e2f78d3c4f92339463f1c7e54c93fb929dfd8c21b07ae0cc51397a582fe6cd5` |

`Champions of Krynn/START.EXE` matched the retained build input at 61,607
bytes, SHA-256 `e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956`;
`GAME.OVR` matched at 269,031 bytes, SHA-256
`c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529`.
The retained fixture bytes were:

| Fixture | Bytes | SHA-256 |
| --- | ---: | --- |
| `baseline-manifest.json` | 908684 | `7fc5ae27a61b0a188a4385f9edf7804909e295846a52e08d1a1f6637e94a6573` |
| `continuation-tuples.json` | 154627 | `d6960023bf8d43cc61b4832c423f8070a053b16a2a6bf607b6029d3f327ddf75` |
| `module46-baseline.json` | 1048253 | `4bd4aeb60d2bb82c401a39dcb8131261a7d16cfc87fae9b48af532a92a9129ab` |
| `module46-tuples.json` | 165935 | `a0197bdc4a02ea08e4e2a9c71a0a14ee8574b02330df4a5bfeb3ca635d6b1c63` |
| `module46-reference.json` | 537 | `c15c1c9ea8babb736cdfca4eb7818dc13581c01522176647f02c80d7e1e5b258` |
| `create-race-baseline.json` | 1198293 | `9e4a9d2bb854dd7bdcde32d7d7d99cddde7103a5e3c4f60f7413196279cb9a08` |
| `create-race-tuples.json` | 11999 | `17a32bf543b84f4a50bb7700f62084e37a62921946a8929a9bbc48d9367b2600` |
| `create-race-reference.json` | 710 | `3fdb6af25b780f45fac0f905f6769ff89d7aea0f87318d5846f64872755ebbeb` |
| `creation-baseline.json` | 1209143 | `4f77589ba07e32d47302cbb0564e27da2bcb6ac73c801d579c0da2abcb76c873` |
| `creation-tuples.json` | 1103636 | `6ae3c318e6d67dd4c69b59c280273ba7f698ff59b64f21e207d7f0da9997accf` |
| `creation-reference.json` | 378 | `579e026b2d9cce1b6a4bc2d7fea4ee66b11519629ea9ed2b831ea2a6551358e9` |
| `creation-root-baseline.json` | 1958293 | `d067edd2e2386674c4e87b77d60d5964781d3059653701c60679a40fff01bd89` |
| `creation-root-tuples.json` | 270437 | `a19cc6fb998e65343715cbc5df6750eb50a285696b5d5dd6428c73adfbae146f` |
| `creation-root-reference.json` | 554 | `aee8ecba142071a07b44155a8c06a0420f90134907ce95bf866aea4cff3289ab` |
| `cold_add-baseline.json` | 2142339 | `41517fd8136c00653c2e0d65c7532d09aed916dc9d09900062faacf9ad2d1733` |
| `cold_add-tuples.json` | 129454 | `f604010c388ad65cd9118735b001db55bf4d2bfd3d3762f47ce5408f150a1682` |
| `cold_add-reference.json` | 397 | `27df6c58bde189d8bae0fb279d76fb3b8dc9977a7911a4aebc03a4ead1fc4905` |
| `world-baseline.json` | 2230127 | `5292865a4c82fa2ce68a6feaf4ce62af87810f288db783566f7e2db4de77267c` |
| `world-tuples.json` | 152794 | `fc962a8bd97a29d2a7fc287f76329107f9d5efa1fc85de03d0bea537ac5caa99` |
| `world-reference.json` | 405 | `cded34d986de2e4616c432e4ad783daae3f3f1ef6ffb2c2fa258db0538f12ca9` |

The retained generated artifact used by Cargo was `C:\cok\build\cok-recomp\generated`:
`manifest.json` was 7,401,650 bytes, SHA-256
`ecaa674f66d9c52e33d5bd478e2cc57b6f528017beb911525deffb1d2e8688c4`; `lifted.c`
was 16,028,848 bytes, SHA-256
`110722512ecee46d2b9cb8d51352e9a36781ccf21adaf8fd9ed73b1c9a786b48`. The
manifest's source image SHA-256 is
`abb145a3a2f725e72f1392c3a41cb0779cb82c72bf2c7b07973a95386464ee28`, its
START.EXE source SHA-256 is the value above, and its generated-helper witness
identifies `9E:1989` (module 47), source offset 127076, byte `55`, recovered as
a function and not independently seeded. `build.rs` verified the embedded
manifest identity and helper witness during the passing compile.

The primary checkout's `build/cok-recomp/generated` is stale relative to that
retained build: its `manifest.json` is 2,724,591 bytes with SHA-256
`a706d2ea31523116abf5fb6c14982270722c25ee4fdc411e393120556e802f1d`, and its
`lifted.c` is 8,260,300 bytes with SHA-256
`54afe8b6c494cd59e98323fa3f54b0d70640fee75a0c42fa1f8a83b7e5667dbe`. That
primary manifest predates the cold-add/world proof entries. The 18 retained
fixture files absent from the primary crate are therefore a real reproduction
limitation: this test was run against the retained source-matched `C:\cok`
build, not against the stale primary generated directory, and the primary
checkout cannot reproduce it without its local fixture set.

## Evidence boundary

The provenance receipt for the retained build still reports
`candidate-unverified`; no claim is made that its build race gate is closed.
This synthetic guest test proves only the behavior of the admitted/emitted
`9E:1989` helper under the constructed memory preconditions. It does not prove
that the A4 Add caller or `9E:11E5` WHO reader reaches the helper in a live
session, nor that the original menu accepts two characters, nor M1, save, or
campaign acceptance. No game executable or DOSBox was launched for this test.
