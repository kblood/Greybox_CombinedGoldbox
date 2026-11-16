# Private fresh ENTRY worker: bootstrap audit

The full staging worker remains a proposal. A descriptor-only read-only
bootstrap diagnostic now exists; it grants no publication authority.
Production CCNEXT and all game files remain unchanged.

## Verified baseline

Original compile-only capacity command:

```text
python tools/native-probes/entry_full_capacity.py C:/temp/GoldBox-task250-fresh-entry-capacity-audit
```

Baseline is raw63787/resident64043, SHA256
`73c77198988215c00c99f625f1cfb9a492d892208c446282519a52db6dee2c14`.
Existing source-provider/comparator composition is raw64777/resident65033,
SHA256 `925dea6362250ab43b0f76552cc5396871a5a84e3de82fbcb6b5d0c8cebd7262`.
Both include the sole final512-byte stack; builder ceiling remains65280.
The latter leaves247 bytes but does not include a fresh native ENTRY bootstrap.
That lower-bound composition was compile-only; the separate read-only bootstrap
below was subsequently assembled and executed.

## Missing native seam

`rj_derive` explicitly requires SETTLED and excludes internal ENTRY.
`rv_prerequisites` begins by reading GSK4 paths/context and opens section0 as
a nested origin; ITEM/member proof uses sections4/5. `rv_replay_image` then
reads existing state160/ledger1056/member756 from sections8/12/5.
These routines cannot admit a bare GSK3 as a fresh ENTRY source.
The current serializer tests populate RW header/path/context/specs and GBRI
from Python's `entry_record()`. Reusing that initialization would violate the
worker contract, even if its final bytes compare exactly.

## Isolated implementation contract

Use a new private COM startup, not the public CCNEXT startup or dispatcher.
Parse exactly one pathname; check the descriptor's exact448-byte EOF and all
four canonical112-byte anchors, then snapshot them in dedicated worker storage.
Allocate FS64KiB and GS32KiB with real DOS allocation calls after resizing the
resident block to its measured final stack extent. Preserve every owned handle
on failed close and refuse warm re-entry before resetting ownership slots.

A new standalone bootstrap must independently use KR/KV to admit origin and
its complete source/party/workspace relation, derive the answer path from that
origin, and admit exactGBMO18. Read and validate the whole ITEM resource using
the real resource reader: `ru_validate` produces GBRI32 after actual archive
and member validation; `ru_build_row` produces one expected63-byte comparison
row only. KR/KV validate the embedded snapshot and do not open or bind live
ECL/P1/OWNER; those require separate whole-file and marker proofs. Then load
the admitted P1 into GS, then call `rz_begin`, pure `rz_eligible_share`, and
`rt_init` phase0. Eligibility failure must precede output creation. This seam
must preserve origin metadata across ITEM/KV and bank-clobbering calls; no
`rv_prerequisites_valid` flag may substitute for a missing proof.

Only after this bootstrap, construct all RW framing/specs natively. Sections0,
1 and4 use the separate-handle provider; absent sections2/3/15 stay absent.
Memory sections come from the derived P1/member/state/items/ledger/action.
Use exclusiveGRT creation, checked write/close, native exact comparator, and
whole semantic candidate readmission. Success means closed unpublishedGRT.
No rename/delete/token consumption/P1 write/child/READY is allowed.

The minimal worker's include closure and complete resident size are not yet
measured. Do not infer a fit from the public composition or remove validators
as dead code without proving all direct/transitive references and data lifetimes.
The initial discriminating gate was a read-only standalone bootstrap on the
genuine fixture, with no output creation. That bootstrap is now compiled and
tested below. Descriptor448+EOF, aliases, zero eligibility, source/ITEM
corruption and tested retained-close paths fail without mutation.

## Read-only bootstrap checkpoint

`entry_bootstrap.py` assembles an isolated COM using the legacy coordinator and
eleven real reward helper includes plus `secretreward_entry_bootstrap.inc`.
It invokes actual DOS resize/allocation and accepts only a descriptor pathname.
No writer, recovery, publication, child execution or output-file call is made.
It independently binds live ECL/P1/OWNER and GBMO, validates actual ITEM/member,
reopens origin after resource work, reloads GS P1, and derives RZ/RT phase0.
The ACTIVE origin precedes TREASURE execution: its exact source instruction
sequence is required; the completed/rejoin `rv_check_gift_dispatch` is not an
ACTIVE-origin validator.

Final diagnostic raw59769/resident60025, PSP256, finalstack512, builder65280,
headroom5255. SHA256
`83188f19acf36a5f0a923a79e31494165361b6928f515e484bd81aef304c36f0`.
This is not a full staging-worker size or a production integration claim.

Final focused gate:

```text
SECRET_ENTRY_BOOTSTRAP_OUT=C:/temp/GoldBox-task250-entry-bootstrap-runtime-20261014
python -m pytest tools/test_secret_reward_entry_bootstrap.py tools/test_secret_reward_entry_bootstrap_export.py -q --tb=short
```

The frozen gate was repeated with the export enabled: 49passed/84.56s/exit0,
no skips. Earlier frozen run: 49passed/45.00s/exit0. Logs:
`C:/temp/GoldBox-task250-entry-bootstrap-final-49.log` and the local repeat log.
48 diagnostic controls plus one explicit runtime-pack export prove native
phase0 outputs, descriptor/canonical/alias checks, live origin/P1/ECL/OWNER/menu
and actual member corruption, exact GBMO ordinal/count/identity, file EOF
boundaries, source-bound all-ineligible rejection, dead-scratch poison, eight
read endpoints (error+short), three failed-close ownership/warm-quarantine
endpoints and zero filesystem mutations/children. These are representative
fault endpoints, not every source chunk or every close. Allocation failure,
open/seek failures and every stream-chunk boundary are not covered. The runtime
negative P1 fixture adds one trailing byte; it is not a structurally valid,
same-length foreign-party control.

Runtime pack has genuine(exit0) and external-only live-P1 mismatch(exit1)
cases. Mount each case's C/D directories separately and execute
`C:\EBBOOT C:\BOOT.DSC`; native results remain resident RAM only.
The pack manifest gives every file hash/provenance and CS-relative result
locations. Luna's focusless GameLink v4 run observed DOS `ERRORLEVEL=0` for the
genuine fixture and `ERRORLEVEL=1` for the external live-P1 trailing-byte
mismatch; DOSBox exited0 in both runs. The frozen manifest and COM hashes
matched. All8 files on each fixture C/D drive retained their manifest hashes,
and no fixture-drive writes or child execution were observed. Full screenshots,
logs and per-file hashes are recorded in
`C:/temp/GoldBox-task250-entry-bootstrap-luna-evidence-20261014/verification.json`.
An earlier genuine checkpoint had a GameLink space-release timeout and no
captured host exit; it is retained as diagnostic only. Initial failed logs are
retained (misplaced completed-gift validator and a test
that incorrectly treated opaque unrelated ITEM payload as pinned member data).

Production `native/src`, CCNEXT, build targets, status artifacts, launch and
session staging remain unchanged. This bootstrap does not validate the complete
competing GKB/GKT/GRJ/GRT or legacy-transaction namespace and is not fresh-install
admission. Its5255-byte headroom applies only to the diagnostic COM, not the
full staging worker. The complete repository corpus passes13,802/8 skipped/84
warnings in4188.95s (1:09:48), exit0. The extra default skip is the explicitly
opt-in disposable runtime-pack export; the export and GameLink pack were run
separately above. At that bootstrap-only checkpoint, the next worker still
needed to natively frame ENTRY, exclusively write/close GRT, compare and fully
re-admit it; the following staging checkpoint records that bounded result.

## Private unpublished ENTRY staging checkpoint

`entry_stage.py` composes the accepted bootstrap with
`secretreward_entry_stage.inc` and the separate section provider/comparator.
Python supplies the protected source files and exact448-byte descriptor only;
the worker constructs the complete ENTRY framing and sections natively, checks
all ten competing sibling names plus `CAPTURE.GSK` before and immediately
before exclusive GRT creation, writes and closes GRT, exact-compares while the
expected framing is intact, then reopens and semantically re-admits the
candidate against current whole origin/P1/ECL/ITEM/OWNER/GBMO data. GRT remains
private and unpublished. This code is outside production `native/src`, CCNEXT,
build/staging lists, public dispatch, and release enrollment.

Frozen COM: raw62333/resident62589, PSP256, final512-byte stack, ceiling65280,
headroom2691, SHA-256
`fbd319e1af56e41331a5c8fb64a16de9bbc28057395619bba39dc7922b0a3052`.
The independent native-vs-oracle record is343736 bytes, SHA-256
`334ec10a23c4abc4bde8b334ece4e1e8b905925587b4f346be938e25802b6a31`.
Focused stage/bootstrap/export gates:120 passed,1 skipped, exit0; a fresh
stage-only repeat is71 passed,1 explicit export skip, exit0. Coverage includes
all eleven namespace artifacts at both scans, same-length structurally valid
foreign P1,17 record corruptions, six changed-live-input controls, pre-INITIAL
protected-path alias, exclusive-create collision, three DOS allocation
failures, representative streamed error/short/bad-seek/false-position and
checked-close quarantine endpoints, two actual partial-GRT DiskCuts, exact
full-record equality, no child/READY/publication, and cold preservation.
The skip is the opt-in runtime-pack exporter when its destination environment
variable is absent; the exporter was separately run to build Luna's pack.
The focused run prints the repository's known Windows/Unicorn `mem_map`
access-violation diagnostic while tests continue; pytest completed with the
counts and exit status above. `CLAUDE.md` records this pre-existing behavior.

Luna's focusless GameLink v4 evidence is at
`C:/temp/GoldBox-task250-entry-stage-luna-evidence-20261014/verification.json`.
The genuine case returned DOS ERRORLEVEL0 and created only
`C:\\PARTY.GRT`, exactly matching the external oracle and hash above. Cold
repeat and same-length valid foreign-party cases returned ERRORLEVEL1 and
preserved every file. Inventory/hash manifests matched; DOSBox exited0 for all
three. GameLink's space-release request timed out waiting for its consumed
marker after DOS status capture; the fixture status, logs, screenshots and
owned DOSBox exits are recorded. No retail directory was mounted.

Remaining boundary: this proves private unpublished staging only. It does not
authorize GRT promotion/recovery, public dispatch, worker enrollment, READY,
answer retirement or P1 writes. Fault coverage is representative rather than
the complete Cartesian set of every stream chunk and owned-close combination.
The full repository corpus remains required after this tools/ change and is
recorded in the build queue when completed.
