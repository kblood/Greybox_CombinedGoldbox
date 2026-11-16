# Native worktree integration, 2026-10-02

## Final historical validation cleanup

The finalization request also prompted a no-loss review of the 15 remaining
detached validation worktrees on D: and E:. Their original HEADs were already
ancestors of `greybox`; that alone was insufficient because validation-14 and
validation-16 contained uncommitted source. Explicit source-only snapshots
preserve those changes in pushed branches:

| Workspace | Snapshot branch and commit | Reconciliation |
| --- | --- | --- |
| `E:\GoldBox-validation-14` | `archive/validation-14-20261002`, `e9c35546` | Both changed source blobs already occur in `greybox` history; merge `b95e5d6e` retains the current implementation. |
| `E:\GoldBox-validation-16` | `archive/validation-16-20261002`, `205ad6e1` | Early journal-reader proposal superseded by current validated, preflighted, idempotent recovery; merge `16d3a50c` preserves the proposal's history without restoring it. |

The validation-16 prototype validates a journal then falls through to failure;
it cannot perform recovery. Current recovery handles PREPARED/COMMITTED state,
validates bound identities and exact extents, preflights destinations, restores
checked units, and retires a PREPARED journal only after successful restoration.
Its historical CLAUDE capacity and launch notes are superseded too. Generated
flow results, runtime data, and nested retail mirrors were excluded from commits.

Sol 6.1 rehashed 103,808 archived records and recovery blobs with zero
discrepancies. A nonfollowing filesystem inventory found 290 nested
`coab_extracted/.git` files missing from the older archives; those 27,347,460
bytes were copied and verified separately, leaving zero coverage gaps. Preserve
all three recovery locations:

- `C:\temp\GoldBox-no-loss-20261001`
- `C:\temp\GoldBox-no-loss-20261002`
- `C:\temp\GoldBox-final-cleanup-20261002`

After final content, remote-ancestry and process checks, all 15 audited roots
were removed and their registrations pruned. Only `{repo-root}` remains
in `git worktree list`. The D: workspace's `amiga_extracted` junction was detached
without traversing its target; the target remains intact. The external audit
directory contains `validation-retirement-audit.json`,
`retirement-final-certificate.json`, and exact paths/times in
`retirement-receipt.json` (SHA-256
`829611f69673d0541b16165db8182ff6f2238822006d780524f2260f39b361bc`).

## Interrupted task worktrees

Four task worktrees based on `b0305a83` survived a stopped session with
uncommitted source changes. Their exact source changes were committed before
reconciliation; the snapshot commits are ancestors of `greybox`.

| Worktree suffix | Preserved commit | Integration decision |
| --- | --- | --- |
| `a05299919b0c4d196` | `2400d7be` | Integrate shared combat fallback stats and register-restore tails; retain newer DQK decoding and direct-VGA output. |
| `a4e59f0acebd3c443` | `e4ffe92e` | Preserve proposal in history; current durable GBDJ protocol supersedes process-local rollback. Access-denied retry has no established requirement. |
| `aa47582ba8b4d5ca3` | `0a263db5` | Preserve proposal and tests in history; retain current journal recovery. Repeating AH=40 without restoring the file position is unsafe after a partial write. |
| `aef92a577b5532a10` | `89e0ecc3` | Keep current CCFLOW private stack and complete BSS allocation accounting instead of speculative fixed padding. Integrate GBBOOT's shared successful-exit path. |

The two rollback proposals were reconciled with explicit `ours` merge commits
after source review. This retains their provenance without replacing the newer
durable prepare/restore/recovery protocol. The original branches remain available.

## Capacity and behavioral evidence

The engine build succeeds. CCCOMBAT falls from 64,892 emitted / 65,148 resident
bytes to 64,748 / 65,004, raising its reserve from 132 to 276 bytes. GBBOOT's
shared exit reduces its assembled resident image by six bytes (including branch
encoding effects), raising its reserve from 130 to 136 bytes. Operating reserve
checks remain enabled.

Luna compared 349 combat run files before and after the capacity optimization.
Every trace, outcome and RAW image was byte-identical. Differences were confined
to two optimized binaries, four effect files and stdout. The baseline and
optimized runs both stop at the same DQKST trace assertion (15 expected lines,
17 actual), so this failure predates the optimization. The untagged raw-BIN
fixtures and the separately tagged DQK rate controls require distinct expectations.
The corrected combat gate now passes in full. Its TypeScript oracle independently
derives the untagged short-tail and NPC attack/outcome sequences from the decoded
monster stats and seed 4660; PowerShell retains exact native movement assertions
and checks that these effects really lack the D0xx tag. All three oracle tests pass.

The CCHOST baseline rejects the DMD fixture before changing HP: it supplies an
ambiguous v1 compact roster. The direct-DAMAGE fixture now supplies v2 DoK
identity, matching the existing mutation admission contract. The same migration
applies to positive combat and journal-production fixtures. Explicit controls
retain legacy-journal recovery and reject fresh mutations of v1 compact rosters.
This does not relax the runtime validator. The initial command list now lives in
a disk batch to avoid DOSBox 0.74's bounded synthesized AUTOEXEC buffer.
Those corrected fixtures exposed a runtime recovery defect: GBTX's v2 header
probe stored a zero-based title ID after range checking. DoK ID 2 became 1,
so a valid Cast's 220-byte WIZ preimage was omitted from the extent calculation
and its 1,142-byte journal was rejected. The probe now restores the declared
one-based ID before storing it and classifies CoK explicitly; the downstream
DoK WIZ check and DQK source-restore exclusion retain their canonical IDs.
The production-journal harness also needed explicit case arguments: its
`GetNewClosure()` callbacks ran in dynamic modules that could not resolve the
script's assertion helpers. Case-specific callback data now lives on each case,
while assertions read the completed snapshots in the original script scope.
The full host harness now passes, including the GBDR restore matrix, GBDP
direct-DAMAGE producer matrix, second-session checks, and GBHR contract smoke.

CCFLOW's lossless replay, greater-than-64-KiB extent, cold-start and stale-sidecar
rejection gate passes. Capacity, identity and DQK static contracts pass 49/49.
The DoK long-text replay/paging gate also passes. The refreshed complete flow
sweep at `41c205d8` remains 11 PASS / 22 FAIL / 3 SKIP of 36; it observed no retail file
changes and one DOSBox executable-directory mtime change. README status claims
now agree with that measured state, with 94 flow/prose checks passing. The broader
GBBOOT engine smoke still fails 16 child-command expectations after the identity
arguments changed; these are reported failures, not evidence of full playability.
The final full corpus run after the journal fix and refreshed flow evidence
records 5,692 passed, 14 skipped and one failed:
`test_checked_inventory_yield_under_dosbox` times out after its checked-yield,
request-construction and mutation-candidate controls pass. The retained C0000
fixture has successful CHECK and activation statuses, and all active files
match the candidate; CCECL MUTATE stalls before producing NEXT.EFX. This
was subsequently repaired by `c5740034`: bounded roster reads replace the
shared-buffer overflow. After adding the v3 regression gate, the full corpus
at `cec996b8` passes 5,707 tests with 14 skips. The engine TypeScript check also passes.
Runtime verification uses hidden/headless DOSBox; the observed foreground window
remained unchanged throughout the baseline and combat comparison passes.

## Recovery and retirement

The independent Sol audit covers 32,685 regular files, including 20,709 ignored
or untracked files, with 14,195 verified content-addressed recovery blobs and
zero discrepancies. It also records empty directories and 813 internal junctions.
The exact nine original WIP files match the initial checkpoint.

Recovery archives live outside Git in `C:\temp\GoldBox-no-loss-20261001` and
`C:\temp\GoldBox-no-loss-20261002\before-integration-063411`. Both directories
must be retained: the newer manifests reuse older verified blobs. The latter's
`retirement-certificate.json` records each file manifest and restore procedure;
its SHA-256 is
`5563d879a2ddd8e53ffa0442d45e9a7927d72a711066e2037bf761ff04f25325`.

After the focused tests and push, the final byte-and-ancestry audit at
07:20:19 UTC checked every remaining file again with zero discrepancies.
All four worktree snapshots are ancestors of both `greybox` and its pushed
remote. Ordinary `git worktree remove` retired their Git registrations.
Three directories were removed successfully. Windows left a partial directory
for `a05299919b0c4d196`; its remaining 9,387 regular files were independently
rehashed against both the original manifest and recovery blobs, with zero
discrepancies. Its 756 remaining junctions matched the recorded internal
mappings. The intact partial directory was moved on the same volume to
`C:\temp\GoldBox-no-loss-20261002\retired-a052-partial-20261002`.
This is recovery storage: absolute junctions still reference their original
paths, and restoration must use the recorded mappings. A second byte-for-byte
check after that move confirmed all 9,387 regular files unchanged, with no
missing or extra files and all junction metadata retained. All four task directories
are now outside the active worktree area; their branch refs are retained.
The detached D: and E: validation worktrees are outside this cleanup. Runtime data, generated reviews and session captures
remain excluded from commits.
The two visible root session/review text files were moved, with verified hashes,
to `C:\temp\GoldBox-worktree-integration-20261002\excluded-root-artifacts`;
its manifest records their original paths.
