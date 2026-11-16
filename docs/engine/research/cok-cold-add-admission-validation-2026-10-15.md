# Cold Add code admission: isolated validation

The isolated candidate extends original code coverage for Add Character to
Party. It does not yet implement the required WHO search service or prove that
the original Add workflow runs. The reviewed source is now integrated after
the fresh-source bootstrap validation below; application acceptance is pending.

## Reviewed source and generated result

Astra reviewed Sol's candidate at
`build/cok-recomp/cold-add-admission-sol-20261015-a/` against the measured
[cold Add inventory](cok-cold-character-add-plan-2026-10-15.md).
It retains the full 32,845-instruction / 84,012-byte baseline and adds exactly
1,327 instruction tuples / 3,527 original bytes, totaling 34,172 / 87,539.
All 31 service/computed boundaries remain classified and six existing computed
dispatch guards are unchanged. No WORLD admission or host service was added.

Luna's Python harness produced its final 25-case controls artifact, including
actual existing semantic emission for every new instruction, changed-source /
midpoint / relocation rejection, complete baseline/protection retention and
two-checkout C equality. The harness's outer numeric exit was not retained;
this is recorded rather than inferred. Its checked generation subprocesses
require their actual expected exits, and the final assertion artifact exists.
The subsequent native checks below retain actual numeric exits independently.

Generated output:
`build/cok-recomp/cold-add-admission-sol-20261015-a/build/cold-add-generation-luna-a/generated/`.

| Artifact | SHA256 |
| --- | --- |
| manifest.json | `65ef0cf3d54cf4c2b0eae613fc199933ab7299c397f42cc8b9971283fb2332a8` |
| lifted.c | `9931b1dc2527a24c65302f0d552c8fecc042a93beb00389b1c746a4fd9687b76` |

## Native results and repaired fixture

The first native build stopped because the isolated checkout lacked its pinned
YMFM dependency. Luna copied the existing exact provenance and ten upstream
files into the expected local layout and checked every hash. Build source and
the dependency version did not change.

The next run compiled and passed two of three cold Add tests, but the third
expected unsupported INT10 fault 9 while the machine correctly stopped at the
earlier startup video checkpoint 17. Sol repaired only the test fixture: enter
the real startup stage, assert checkpoint 17 with zero work/fault/callbacks and
unchanged IP, resume through the existing guarded API, then require the actual
unsupported service to fault 9 with exactly one callback. DOS cases require one
INT21 callback; INT23 remains rejected before a host callback. Astra reviewed
this repair before Luna reran. Failed logs and earlier freeze are preserved.

Final fixture SHA256:
`6686c38f13f5d467b5f9989894544c5d5c0dc55bed90cd44053f587e0c47bf19`.
Reviewed freeze SHA256:
`ae7487db2c3fdd648613135bf8866f57012b55ea7205e070c41914a7b55019fa`.

Luna's repair2 pass recorded actual exit 0 for every command:

| Filter | Passed |
| --- | ---: |
| cold_add_ | 3 |
| original_stream_indirect_call | 2 |
| indirect_far_call | 8 |
| continuation IRQ guards | 3 |
| BIOS stop/IRQ guards | 4 |
| frontend input wait guards | 1 |
| Full release suite | 198, with one existing ignored worker |

The optimized normal binary also built successfully. The retained batch
session completed with exit 0. Before/after checks cover 1,660 inputs with
no mismatches or changed entries. Logs and numeric exit files:
`build/cold-add-native-validation-a/*repair2*`.

Binary: `build/cold-add-native-target-a/release/cok-recomp.exe`, 19,312,128 bytes,
SHA256 `7d6c30433344ff33712fe0b481c3ca1f36d5cc3bd7ac19cd57406bbff86243fb`.
Toolchain: Rust/Cargo 1.99.0, MSVC cl/link 19.39.33523 and SDK 10.0.22621.

## Fresh-source bootstrap and source integration

Luna ran the clean bootstrap candidate in two fresh checkouts containing only
the declared own-source roster. Both workers passed 29 assertions, and the
retained outer process exited 0. Audit logs were empty: neither worker read
the former ignored reviewed snapshots or the separate WORLD candidate.
The generated C in both checkouts has SHA256
`9931b1dc2527a24c65302f0d552c8fecc042a93beb00389b1c746a4fd9687b76`,
identical to the native-tested candidate above. Canonical manifests match after
normalizing only the verified GEO output paths, SHA256
`5b45145c52703ade8bb986b9758ce280127717e368940fe069ee990675b56f86`.
The one-byte cap and missing-extent controls remain incomplete and deny runtime
admission. Every baseline, resource, source-tuple, relocation and protection
identity matched. Receipt:
`build/cok-recomp/cold-add-bootstrap-sol-20261015-a/source-bootstrap-controls/validation-receipt.json`.

Astra reviewed the actual receipt and approved five production source files:
the lifter hook, original-derived bootstrap preparer, instance-scoped scanner
interrupt contract, three native tests and their Rust module hook. Root copied
and hash-verified those exact files. The current GOAL was preserved. The reusable
bootstrap test driver is a separate gate because its original candidate form
read an external ignored source roster implicitly. No ignored source snapshots,
original-derived tuples, C or binaries are committed. This integrates tested
source; a newly built production-path package remains a separate check.

That driver seam has subsequently passed: the promoted driver requires an
explicit external `--declared-sources` JSON roster and fresh `--out`. Each
roster row has exactly a relative own-source `path` and lowercase `sha256`.
It rejects duplicate, traversal and non-source paths and checks file contents
before copying. Luna reran both fresh checkouts: 29 cases each, expected C hash,
empty audits/stderr and retained outer exit0. Both worker return codes are
asserted zero by the driver before its final receipt; separate numeric worker
exit files are not produced. Six negative controls rejected: omitted argument
exit2; missing file, malformed JSON, duplicate path, traversal and hash mismatch
exit1. The hash-mismatch control left a partial output directory, preserved as
failed evidence. No assertion of atomic test-output publication is made.
Evidence directories in the same candidate:
`source-bootstrap-explicit-roster-controls/` and
`source-bootstrap-invalid-roster-controls/`. Final driver SHA256:
`0458db951999a12bec8f351afdf54629915499c9f16963a05f0d6b68adea0129`.

## Remaining work

No guest application or original WHO search has run with this candidate.
The [search adapter plan](cok-character-search-adapter-plan-2026-10-15.md)
now records the successful owned hidden DOS oracle and its measured semantics.
Cold import, actual listing/read/insertion/View, rebuilt pointer ownership,
negative file/search cases and original DOS comparison remain unaccepted.

The [production bootstrap plan](cok-cold-add-production-bootstrap-plan-2026-10-15.md)
is satisfied by the two fresh-source reconstruction controls above. Original-
derived code, binaries and listings remain ignored. These checks do not prove
the Add application workflow or the separate WORLD persistence candidate.
