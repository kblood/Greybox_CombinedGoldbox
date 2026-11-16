# Audit integration staging: narrow line-ending ancestry repair

Date: 2026-10-15. Astra source-only repair plan. No candidate/test/build/game
execution was performed for this review. Read-only Git blob extraction, file
hashes and byte-preserving CRLF-to-LF comparisons support the findings below.

## Observed failure and bound

Luna stage PID35896 exited1 after cloning/checking out revision
216e84c9fbf0f9e0de307b962246fcfcf758d911, before any overlay copy, pure controls,
generation or native build. Preserve the partial directory
`build/cok-recomp/staging/dos-audit-production-integration-luna-20261015-a`
and its sibling `-a-stage-runner` receipts. The stderr hash is
56833eb6cdf9e0e6d7b3dc27e6f9a1a013907765a73926be6c38773817d7e3b9.
The raw production pin for startup_platform.rs is81415 bytes/d19c6176…;
checkout with core.autocrlf=true produced81432 bytes. Root measured17 extra CR
bytes. This means17 line endings changed in that file, not17 changed Rust files.

Independent read-only comparison here establishes that all seven declared
production input files, both in the current source and the preserved checkout,
equal their exact pinned-commit blobs after replacing CRLF pairs with LF only.
This does not authorize treating source text as interchangeable for compilation.
Every one of these seven files is explicitly overwritten with exact accepted
candidate bytes before any compilation; normalization is ancestry evidence only.

## Required small repair

Create a new v3 candidate; preserve v2. Keep its existing production_inputs raw
SHA256 and byte lengths. Before clone/copy, verify those seven current repository
files against the existing raw pins. The v2 stage script currently checks the
cloned paths only; add the current-source checks explicitly rather than claiming
they already run. Reject content changes even if a new commit exists.

Add a frozen seven-entry ancestry table, each bound to production_head, exact
repository-relative path, raw Git-blob SHA256/length, and canonical SHA256/length.
Extract Git blobs through byte streams (git cat-file blob REV:path), never a
text pipeline that changes encoding, newline or trailing bytes. Check the exact
commit and blob raw identity before canonical comparison. Do not reselect HEAD,
refresh old raw pins, skip the failed file or normalize all checkout inputs.

Normalization policy is solely byte-pair0D0A→0A. Preserve every other byte,
including BOM, spaces, tabs and final-newline presence. Reject lone CR. Do not
use Trim, split/join lines, Unicode normalization, replacement decoding, case
folding or Git whitespace-ignoring comparison. Record raw size/SHA, CRLF count,
LF count, lone-CR count and canonical size/SHA for current source, Git blob and
fresh checkout. Retain raw Git blob identity separately from normalized identity:
main.rs in the pinned Git object itself contains CRLF and its raw hash differs
from its canonical hash.

Permit the fresh checkout ancestry check to succeed only when its canonical
bytes equal the pinned blob's canonical bytes and every table entry names
exactly one frozen overlay replacement. Assert the ancestry roster equals the
seven production_inputs paths with no omissions/duplicates/extras. Require all
seven replacement files exist in freeze.files and have raw frozen sizes/hashes.
Then copy the exact frozen overlay and verify every destination's raw bytes/hash
as before, including these seven. If an overlay entry is missing, fails copying
or fails its raw hash, reject staging. No build is run by staging. Success receipt
must distinguish raw current-source pins, canonical checkout ancestry and raw
post-overlay pins; never label canonical equality a raw-byte match.

Keep this logic confined to staging and its small focused controls. Do not
change build.rs, compiled roster checking, allowlist, guest sources, runtime
limits, generated pins, original assets or gate semantics for this repair.
Candidate/compiled source identity remains byte-exact. Other unmodified checkout
files retain ordinary pinned-commit ancestry and later explicit current-roster
hashing; there is no global line-ending waiver.

## Independently measured canonical ancestry

All rows refer to rust/cok-recomp/src/ at the exact216e84c9 commit. Current source
and failed stage canonical comparisons both matched for every row.

| File | Canonical bytes | CRLF-pairs-only normalized SHA256 |
|---|---:|---|
|main.rs|151839|71776fe648efc43a04e42cce5ad4b946729a1f9b4d3b141a8649b3832476cd33|
|startup_platform.rs|79747|34c27271c88d4e5be241f1ced1f0e74fed23956ae7d71ed98bd8be80ddfff4b2|
|startup_session.rs|39753|077a3fd61e649773a57cc8c57663e1d18512bc5090ea461f61b0154fcddd9ec3|
|startup_bios_ledger.rs|7121|372744c851442fe718a61d631cf66be2fb8138aa511c4f8931ba5538aa089a98|
|startup_bios_publication.rs|5874|ce1e6cfa294ddf9985a4d1e01cdd9b3043136f715569c1cd27b31d51d3cf67cb|
|frontend.rs|20052|c2e593f0ac2243b68ef9169361b3f99aefa855dc012c207b1b35dab29eaf4f26|
|frontend_headless.rs|41246|e7d502e1af3faf712ca7cbc0cf42c4d586a488832d9fafaebf26dcab1e277204|

Raw Git blobs match those canonical sizes/hashes except main.rs, whose raw
Git blob is155293 bytes with SHA256
00ff48bc12b8e8914e5076c4a5288d9a274561bc4b533f538f8513908ce18c02.
The unchanged BIOS-publication raw identity is deliberately included, even
though its overlay replacement is byte-identical to its prior source.

## Discriminating controls and next gate

Author controls of the actual staging ancestry predicate, not independent
copies of the intended policy. Require mixed LF/CRLF, all-LF and all-CRLF ancestry
variants to pass only for the exact listed files and commit. Require nonnewline
byte mutation, whitespace change, BOM insertion/removal, final-newline change,
lone-CR input, wrong commit/blob hash/length, missing or duplicate ancestry row,
wrong-path substitution and absent overlay replacement to fail. A current raw
source pin mutation must fail even if it is only an EOL change; the allowance
applies to materialized Git ancestry, not to approved current source pins.
A post-overlay EOL-only mutation must also fail its raw compiled-source pin.
All rejected cases must stop before any build or adoption success receipt.

After Sol freezes v3, Astra reviews exact delta and frozen ancestry metadata.
Luna may then run the focused pure staging controls and create a new absent
stage-B path; never overwrite or reuse stage-A. If actual staging passes, rerun
the previously approved three pure controls, then obtain the coordinator's
separate fresh-generation gate. Keep process/argv/UTC/raw-stream/exit receipts
and before/after pins. No native compilation, runtime acceptance or production
promotion follows merely from this source review or ancestry comparison.
# V3 source review addendum — 2026-10-15

Reviewed candidate `build/cok-recomp/dos-audit-production-integration-sol-20261015-v3`:
freeze `ad6f7ffb71b36c2d36e282fd84b6cd56157fea36157fb934262139e3256031f0`;
ancestry table `4eca740d21502cab30c4c437102a4262675d16b968ab24c923cc364644a78439`.
Astra independently read/hashed all 48 frozen files, all seven current RAW
production inputs, and all seven exact Git blobs extracted as byte streams
from `216e84c9fbf0f9e0de307b962246fcfcf758d911`: zero mismatches. All 32
production-relative overlay files remain raw-byte identical to v2. Stage-B
was absent at review. This review executed no candidate code or tests.

`staging-ancestry.ps1` confines canonical equivalence to the exact seven
hardcoded paths. It requires the fixed commit, exact roster, one matching
frozen replacement per row, frozen raw Git identity and pair-only canonical
identity. It rejects lone CR and preserves every non-CRLF byte. The
materialized canonical bytes are compared with the independently read Git
bytes as well as the frozen canonical hash/size. `stage-for-luna.ps1` checks
all current RAW inputs before clone; after overlay it rechecks all 48 candidate
inputs and all 32 destination RAW identities. No canonical hash is substituted
for compiled-source identity. The create-new diagnostic distinguishes current,
Git, materialized and overlay identities; failure cannot reach the success
receipt. Stage-A and its actual failed process receipt remain preserved.

The authored controls call those actual predicates. They discriminate 21
LF/CRLF/mixed positive variants from content/whitespace/BOM/final-newline/lone-CR
changes, wrong raw Git identity, wrong canonical identity/commit/path/roster,
missing/duplicate overlay and raw-current/raw-overlay EOL changes. These are
source-reviewed obligations, not passing test results.

Approved next sequence for Luna, separately receipted and stopping at every
nonzero exit:

```powershell
$task='C:\Modding\GoldBox\build\cok-recomp\dos-audit-production-integration-sol-20261015-v3'
$workspace='C:\Modding\GoldBox\build\cok-recomp\staging\dos-audit-production-integration-luna-20261015-b'
$python='C:\Modding\GoldBox\build\cok-recomp-tools\venv\Scripts\python.exe'
pwsh -NoProfile -File "$task\test-staging-ancestry.ps1"
& "$task\stage-for-luna.ps1" -Checkout $workspace -ReviewedFreezeSha256 'ad6f7ffb71b36c2d36e282fd84b6cd56157fea36157fb934262139e3256031f0'
$crate=Join-Path $workspace 'rust/cok-recomp'
& $python "$crate\test_verify_dos_audit.py"
Push-Location $crate
try { & $python -m unittest test_dos_audit_provenance }
finally { Pop-Location }
& $python "$crate\headless-cold-add\source_controls.py"
```

Run these as distinct owned processes/gates, preserving argv, UTC, PID,
raw stdout/stderr, actual exit and pre/post source hashes. Authenticate the
freeze and its files before executing the predicate test (that test does not
itself take a reviewed-freeze argument). Require fresh absent stage-B and
diagnostic paths and inspect their parent path ownership/reparse status before
staging. Never reuse/overwrite stage-A. No `PrepareOnly`, generation, Cargo,
native application, source promotion or acceptance claim is authorized by
this addendum. Root reviews actual staging and pure-control receipts first.
