# CoK audit production integration: actual staged validation

2026-10-15. This records execution against the proposed production-relative
sources. Production promotion, native build and application acceptance remain
pending; the earlier isolated audit-v3 binary has its separate
[native validation](cok-dos-audit-native-validation-2026-10-15.md).

## Ancestry repair and fresh stage-B

Reviewed candidate:
`build/cok-recomp/dos-audit-production-integration-sol-20261015-v3`, freeze
`ad6f7ffb71b36c2d36e282fd84b6cd56157fea36157fb934262139e3256031f0`.
Both Astra and Root independently checked all48 candidate pins. The32 owned
production files are byte-identical to v2; only staging ancestry machinery
changed. See [the narrow EOL repair and review](cok-audit-staging-eol-repair-plan-2026-10-15.md).

Luna's initial predicate process wrote PASS, but its outer receipt code then
assigned PowerShell's reserved case-insensitive PID variable. No actual child
exit receipt was captured. Its raw stdout/stderr remain preserved and are
classified as incomplete process evidence, not an accepted exit0.

The same pure predicate was rerun with the existing retained-Process capture
wrapper. Actual PID68440,19:29:34.692–19:29:37.315UTC, exit0, streams drained,
stderr empty. The actual predicates accepted21 LF/CRLF/mixed variants over
seven rows and rejected the authored content/identity/roster/raw-pin mutations.
The test reports no builds, applications, clones or adoption receipts.

Fresh staging PID21164 exited0 with drained output. Checkout:
`build/cok-recomp/staging/dos-audit-production-integration-luna-20261015-b`.
Its receipt binds revision216e84c9fbf0f9e0de307b962246fcfcf758d911 and the
reviewed freeze. The separate diagnostic reaches
`ALL_RAW_POST_OVERLAY_PINS_VERIFIED_NO_BUILD`: seven current raw source pins,
exact Git-blob ancestry, all48 candidate raw pins and all32 destination raw
pins verified. Canonical comparison applies only to ancestry before overlay.
Compiled-source identity remains raw. The failed stage-A remains preserved.

## Actual pure controls

Each command ran separately after the preceding actual exit was inspected.

| Control | Actual PID | Exit | Observed result |
| --- | ---: | ---: | --- |
| test_verify_dos_audit.py |5752|0|Independent offline fixture mutations PASS|
| python -m unittest test_dos_audit_provenance |61180|0|Ran1 test, OK;0.378s|
| headless-cold-add/source_controls.py |50896|0|Gate, actual path and portable relocation controls PASS|

All streams drained. The provenance suite's unittest summary is on stderr;
nonempty stderr alone is not a failure. The path controls report zero Popen
calls for rejected paths and exercise the actual launcher predicates. The
relocation controls require neither accepted save files nor historical pixels.
No guest application ran in this phase.

Receipt root:
`build/cok-recomp/staging/dos-audit-production-integration-luna-20261015-b-audit-v3-receipts`.
Predicate retry receipts are in the sibling `-retry1` directory. The final
working-directory capture variant has SHA256
`6d76f4b3f0e974916e384bba442bde7900f239a3f1c00cfccaa35cc077fded0c`;
Root inspected its two logical changes: a working-directory parameter and
assignment to the child ProcessStartInfo. Start/terminal receipts retain actual
PID, argv, cwd, UTC, exit and raw-stream hashes. Per-child environment snapshots
were not serialized for these pure runs; their inherited environment is not
claimed as fully captured.

The post-controls pin record has SHA256
`7c55e19cc62e1cdd88c5a6f8ec4ef8d7a4a41cccd594de19b6b227cc6fa9211c`.
Luna rechecked48 candidate files,32 staged owned files and seven production
inputs with no mismatch. Root inspected the actual receipts and outputs.

## Next gate

Root authorized explicit YMFM provisioning and fresh build.ps1 -PrepareOnly
inside stage-B, retaining actual process/tool/selected-environment evidence.
This must regenerate original WORLD inputs, match all24 frozen generated pins
(lifted C d806268d… and manifest d8440aee…) and explicitly replace the unrefreshed
roster with current independent identities. It does not authorize Cargo,
native application execution or production promotion. View diagnostic acquisition
follows its separate [v3 review](cok-view-host-guard-v3-review-2026-10-15.md).

## Actual fresh preparation failure

Explicit YMFM provisioning PID61768 exited0; pinned revision
81aec25ccbb98f4873a255f7551ac4dadac59b4a and provenance0a3da589… verified.
PrepareOnly PID51960 ran19:32:51.510–19:33:54.336UTC, exited1 with drained
streams (stdout2265B, stderr1636B). Original fixture reconstruction and lifting
produced35,740 instructions/91,590 bytes. Refresh stopped before writing the
roster at `fixed input identity geo-provenance.json`.

Luna and Root independently compared all24 generated files:22 raw pins match,
including lifted.c d806268d…. Two mismatches remain:

| File | Frozen bytes / SHA256 | Actual bytes / SHA256 |
| --- | --- | --- |
| geo-provenance.json |1593 /4649a2700df595d62283d637c5d5290cece5a4c2421762ce0424859b69ef4200|1533 /60b91284a4033f876879ed19b3edad9dfadafeea3b019835e65dcd3d12876504|
| manifest.json |7786144 /d8440aeecdd81c87f242f96f35a763330271781ce62f0ab175469e674a0a9114|7786084 /405a3312f041b9251f0607bcdca7ae744bab8fb1fcee2cb756cfb0ce52bcaba2|

Both documents contain GEO output paths. Root read the changed paths from the
accepted checkout-one/build/generated directory to stage-B/build/audit-world-generated.
Astra is checking the complete structural difference before planning a narrow
portable provenance repair. No pin refresh or metadata equivalence is accepted
from that observation alone. All32 staged owned files,48 candidate files and
seven production raw inputs remain unchanged. The placeholder roster remains;
the expected-identities output and native target directory are absent.

An auxiliary preflight attempted to hash nonexistent world_layout.json as a
tool, so its initial tool-context list is incomplete. The actual process receipt
and streams are retained. A separately timed post-terminal context records
selected environment/tool observations without backdating them. This limitation
does not convert the failed preparation into a pass. No retry, Cargo or
application execution occurred. The failed stage-B generation stays preserved;
Luna moves to the independently approved View v3 diagnostics while the source
repair is planned.

## V5 stage-C continuation — 2026-10-15

Following the source/security review and an explicit stage-only Root release,
Luna ran the existing file entrypoint once. Child64396 ran from
20:10:05.2247613Z to20:10:13.0102187Z, exit0, outputs drained. No Python,
generation, compiler or application was launched by this stage. Receipts:
`build/cok-recomp/staging/dos-audit-production-integration-luna-20261015-c-stage-receipts`.
The earlier preflight Boolean syntax error occurred before child launch or
receipt creation; its correction was not a retry of a security rejection.

Freeze `9fd39b8b9d82852e657ab68c3af005f0b1d07c160b580980315cbec4bfdd9c5c`
and pinned revision216e84c9 are recorded in the actual adoption receipt.
All59 frozen sources,40 owned destinations and seven raw production/ancestry
rows passed the staging checks. The stdout sentence still says32; this is stale
prose. The source requires40 and the structured adoption receipt records40.
The ancestry diagnostic reports no failure and no build/application start.
Its `adoption_receipt_pending=true` field is historical from the diagnostic;
the separate `audit-integration-staging-receipt.json` now exists.

Stdout228B SHA256 `8e0cec2f1060b62318a7692036fcfcf9bcf0d09effda63633aede0dacf661059`;
stderr204B `98251ae3c7e78b248938d67d131e23233e4c51907e3a062b8deb451fe25efdc4`.
Root read terminal, ancestry, adoption and selected prelaunch environment
receipts. Defender detection/action records remained at19801 after the run;
protection was unchanged. This is neither a clean-machine verdict nor native
runtime acceptance. Root subsequently released only ancestry controls and the
fail-fast Python relocation/provenance suite; their outcomes remain pending.
All other execution retains its separate gates.

### Actual synthetic controls after stage-C

All four runs used the existing reviewed capture helper and retained selected
prelaunch environment, exact executable/argv/cwd, actual terminal receipts and
raw streams. No Capstone import, compiler or guest launch was authorized.

| Control | Child PID | UTC interval | Observed result |
| --- | --- | --- | --- |
| Staging ancestry predicates |65680|20:11:28.4873405–20:11:31.2002730|exit0/drained;21 positive variants,7 rows |
| Python relocation/provenance unittest, fail-fast |68492|20:11:37.2408356–20:11:39.7174933|exit0/drained;3 passed,1 skipped |
| Independent DOS verifier fixtures |14068|20:12:28.3563220–20:12:28.8505303|exit0/drained; offline mutations PASS |
| Headless gate source controls |64692|20:12:33.5992323–20:12:38.0204528|exit0/drained; source/path/launcher/portable relocation PASS |

Receipts are under stage-C in `stage-c-ancestry-receipt`,
`stage-c-python-unittest-receipt`, `stage-c-verify-control-receipt` and
`stage-c-headless-source-control-receipt`. The unittest's skipped
`test_path_pin_omission_and_policy_guards` reached its final symlink fixture and
received WinError1314 (privilege unavailable). Earlier assertions appear before
that fixture in source, but this is not a completed fourth test or reparse
acceptance. Astra approved a subsequent test-only split: ordinary guards get
their own completed test; only explicit1314 may skip the separate reparse test.
All other OSError failures must propagate. No privilege change or retry occurred.

Unittest stderr938B SHA256
`38624f987b1aee5f48b9d73fdeaa098c2e4c1526111b7691fa939f356dc450b2`.
Verifier stdout45B `a7360e78ffb32be05732e1d8a2cab4b326fd3455e68d49416749232ae37348ab`;
gate stdout390B `7b34247fe2d3fcf7b61b50e15dbe4ff92e7d60a9edc8e6ae5df7ee3e01c85a21`.
The gate includes synthetic owned-temp junction creation and launcher
`-ValidatePathsOnly` subprocesses; it is not an application route. Root read
actual terminal/output receipts and rechecked Defender logs afterward: latest
detection/action record remains19801. Generation, Rust helper compilation,
native negatives and original View still need their separate gates.
