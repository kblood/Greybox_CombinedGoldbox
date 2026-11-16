# Audit v5 source review and bounded continuation proposal

2026-10-15. Source/metadata/hash work only; no candidate execution. The Defender
execution hold remains active until Root separately decides to release a named
gate. This document is not a Microsoft false-positive verdict.

## V5 review

Candidate `build/cok-recomp/dos-audit-production-integration-sol-20261015-v5`:
freeze `9fd39b8b9d82852e657ab68c3af005f0b1d07c160b580980315cbec4bfdd9c5c`;
gate freeze `dbf96c63ee3cf6e5c2e9fa893830bb5314d9b6bbac681306fa992384d81b8588`.
All59 frozen file sizes/hashes independently match. There are40 owned files
and269 roster inputs. Ten production-predicate/policy/ancestry files were
independently compared raw with v4: no change. All22 fixed generated raw pins
remain identical. No new guest bytes or changed relocation policy.

The four v4 control repairs are present:

- Python/Rust second-root positives reuse identical policy bytes, game/source
  and22 payloads. Only output tokens change; actual hashes differ and historical
  projections remain identical. Crossed root and owner cases are rejected.
- Generated omission selects and asserts root=generated instead of pop(6).
- Windows Rust reparse coverage is explicitly ignored with a reason. Default
  expected result is3 substantive tests +1 ignored, not four proven controls.
  Separate fixture setup/--ignored permission remains necessary. Python OS5/
  permission failures propagate instead of being relabeled privilege skips.
- The new standard-library-only native negative changes precisely one metadata
  token, verifies its semantic delta, and writes a canonical forged RAW roster.
  It does not import/refresh candidate provenance. It snapshots originals,
  binds prebuild identities/policy and demands an actual Rust relocation
  diagnostic with no native archive/link output. This fixes the unrelated
  noncanonical-roster rejection identified in v4.

Source approval covers the repaired staging/pure-control design. No test PASS
is claimed. **Keep native-relocation-negative.py execution withheld:** on a
900-second timeout it kills only its Popen/rustup process and may restore files
after that root exits while Cargo/build-script descendants remain alive.
Before its separate native gate, use an owned process-tree mechanism or retain
the mutated state until descendant termination is established; never restore
inputs under a possibly live descendant. Record timeout/forced/cleanup state
and child ownership. This narrow future repair does not affect stage-C or pure
controls. Capture exact executable/toolchain identities and relevant inherited
environment for that later native gate as well.

## Why a bounded continuation can be considered

The complete Defender Resources strings were source-reviewed. Their operations
match source/package verification and expected local import/evidence work;
no download, persistence or security-setting change was identified. Luna's
transcript correlation says the three flagged combined submissions failed
unified-exec creation with OS error5 and no child PID; surviving receipts are
different later commands. This explains the receipt discrepancy without proving
Defender caused OS5 or establishing that the machine/dependencies are clean.

The proposal resumes an ordinary independently reviewed workflow through its
existing file entrypoints. It does not replay the rejected verification scripts,
move their content into a new file to get them through, or alter protection.
No splitting, re-encoding, obfuscation, exclusions, restores or external uploads.
Leave Defender enabled and unchanged.

## First release proposal: stage-C only, then stop

Before Root may release this gate, preserve the full command/error correlation
and current security-state/log baseline, confirm no unresolved active detection
requiring action, and record current executable/helper/freeze hashes and exact
environment/paths. Do not silently treat unavailable security state as clean.
Use ordinary read-only hash/log tools; do not reconstruct the rejected combined
package-verification commands. Require absent stage-C and fresh receipt paths,
with owned non-reparse ancestors. No Capstone or package import is needed here.

Existing reviewed capture helper:
`build/cok-recomp/staging/dos-audit-production-integration-luna-20261015-b-audit-v3-receipts/pure-2-unittest/capture-validator-working-directory.ps1`,
SHA-256 `6d76f4b3f0e974916e384bba442bde7900f239a3f1c00cfccaa35cc077fded0c`.
It must remain this exact file. Record the resolved pwsh executable and hash;
do not rely on an unrecorded PATH substitution. Invoke it as an ordinary file
with the following child argument vector, only after explicit Root release:

```text
pwsh -NoProfile -File
C:\Modding\GoldBox\build\cok-recomp\dos-audit-production-integration-sol-20261015-v5\stage-for-luna.ps1
-Checkout C:\Modding\GoldBox\build\cok-recomp\staging\dos-audit-production-integration-luna-20261015-c
-ReviewedFreezeSha256 9fd39b8b9d82852e657ab68c3af005f0b1d07c160b580980315cbec4bfdd9c5c
```

This existing stage entrypoint authenticates all candidate files before loading
its ancestry helper, checks seven current RAW production inputs and pinned Git
ancestry, clones the pinned tracked commit and checks all destination RAW bytes.
It launches no Python test, decoder, compiler or guest. Capture actual PID,
argv, UTC, raw streams, exit and selected environment with explicit scope.
Root must inspect its actual adoption/ancestry receipts and security-log delta
before authorizing another process. A missing PID means no child-launch claim.

Any generic access denial/OS5, new security alert, unexplained disappearance or
changed pin stops the workflow immediately. Preserve exact command/error/raw
records and consult Root. Do not retry with a shorter command, different
encoding/path, another interpreter or altered protection. Do not infer an
antivirus cause solely from OS5.

## Later separate releases, not included above

After a clean stage-only review, Root may consider ancestry/pure controls through
the same capture helper and frozen file entrypoints. Record Python executable
SHA `200d001707ed494066ef00e31e38330e32490c2a74a450ca5d66d2179396fd0e`,
working directory and Python startup environment. Use unittest fail-fast (`-f`)
so an access error does not continue to later cases. Source scripts/imports must
remain those authenticated by staging. No Capstone dependency is required for
the synthetic relocation/roster/verifier/gate tests; do not add an import probe.

Package provenance and complete selected native-library environment remain
separate prerequisites for a later generation/Capstone gate: wheel RECORD
consistency alone is not publisher authenticity, and prior receipts did not
capture LIBCAPSTONE_PATH. Reuse the reviewed package identities and acquisition
record; do not download or silently select a fallback package. Rust lockfile,
compiler controls, reparse test, PrepareOnly, native negatives and application
routes each retain their own source/evidence review gates. No new runner or
generic security-bypass framework is needed or authorized.

## Native negative cleanup repair plan (source only)

Reviewed helper SHA256
`13dcadfc687c5918f12b604210b2def6d745aeceac6e6c9ee733e66d3822a92f`.
Its timeout kills only the rustup Popen root. Root exit does not establish Cargo,
rustc or build-script termination. An exception after Popen can also bypass its
wait. Its finally block currently restores whenever cleanup_incomplete is absent,
so both paths can rewrite inputs while descendants still use them. Restoration
failure can additionally raise before the final ownership receipt is attempted.

### Smallest conservative repair

Use a dedicated fresh, disposable staged checkout/generated root for each native
negative case. Keep the standard-library helper and its existing forged canonical
raw-roster mutation and rejection checks. Do not introduce a general runner or
attempt to prove tree termination by enumerating PIDs after the root exits.

Once launch is attempted, permanently latch `restoration_allowed=false` for this
invocation. Record `launch_attempted` before Popen; distinguish no returned child
handle from a captured PID without assuming that a launch exception proves no
process ran. After any launch attempt, leave the mutated metadata and forged
roster in the dedicated stage, on ordinary rejection, timeout, access denial or
exception. No automatic restore, delete, stage reuse or next case in that stage.
An explicit `descendants_termination_proven=false` must remain in its receipt;
do not infer true from Popen exit, a failed PID lookup or missing output activity.
Root can later review independent process-tree evidence and authorize cleanup;
that is outside this helper's execution gate. If automated restoration becomes
necessary later, separately review a race-free owned process-job design that
assigns a suspended child before resume and proves the job empty; do not bolt on
taskkill plus an assumed-success sleep in this repair.

Before launch, retain the original and forged raw bytes and pins as today. Publish
an exclusive launch-intent receipt before mutation/launch, stating the exact
owned stage and non-restoration policy, so a later evidence-write failure does
not hide which inputs may be mutated. Restoration before any launch attempt is
allowed only for ordinary prelaunch errors, without OS5/security interference,
using the existing exact original/policy/identity comparisons. Partial restoration
is a failure with each file's observed state recorded; never claim atomic rollback.

Initialize process/state before the outer try. A nested finally must always
attempt bounded monitoring of the directly owned child, even if post-Popen
receipt creation, wait, output read or result validation raises. Preserve900s
total wall budget, bounded15s direct-child cleanup and actual root exit/timeout/
forced-kill results; no restarted deadline. Killing the direct child is only
best-effort root cleanup and must never authorize restoration. No automatic
command retries or additional process launches on access denial. Retain known
PID ownership and report any unresolved live process to Root immediately.

Separate result fields: `negative_assertion_observed`, `root_terminal`,
`root_exit_code`, `forced_termination`, `cleanup_incomplete`,
`descendants_termination_proven`, `stage_retained_mutated`, `restored`, and
`security_interference`. Expected relocation rejection may be recorded only after
the real nonzero root exit and existing specific diagnostic/no-native-output
checks pass; it is not a clean-stage or process-tree-completion claim. A timeout,
forced kill or unexpected exception always fails the control. Raw stream hashes
after root exit are snapshots unless writer/tree termination is proven; identify
that limitation rather than reporting them as fully drained final streams.

Place terminal-receipt emission in a separate outermost finally so restoration or
cleanup failure cannot skip its attempt. Preserve primary error plus cleanup and
receipt errors separately. If evidence publication is denied, stop without a
fallback path/encoding/retry and report the existing launch-intent location.
Do not suppress errors merely to print a success summary. Record exact resolved
toolchain executable identities and the reviewed inherited native build
environment before the eventual gate, as already required above.

### Future discriminating controls and scope

Sol implements this in a fresh source candidate; v5 remains frozen. Add injectable
process/file/clock boundaries only inside this helper's small orchestration so
tests call the production state machine without launching a compiler. Luna, only
after source approval and separate Root release, exercises: normal expected
rejection with a modeled surviving descendant; root timeout/kill with descendant
still alive; wait exception; poststart evidence failure; launch exception with
uncertain spawn; root already exited but descendant unknown; prelaunch ordinary
write failure; partial mutation/restoration failure; OS5 at each relevant boundary;
and final receipt-write failure. Assert zero restore/delete/reuse writes after
launch-attempt latch, retained originals/intent, bounded cleanup and truthful
status. An ordinary prelaunch failure is the positive restoration control.

Retain actual mutation controls: one exact output token or one source hash,
canonical forged raw roster, independently pinned original identities/policy,
real relocation-specific build.rs failure, and no native archive/link directive.
Pure mocks cannot replace these later native negatives. Each actual case requires
its own fresh isolated stage, actual PID/time/raw evidence and explicit Root gate;
no native execution is authorized by this plan. Byte scope is zero guest bytes,
zero generated C/policy/runtime changes: helper orchestration, its controls and
handoff/freeze metadata only. Stage-C's separate authorization is unaffected.
