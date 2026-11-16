# Repository recovery — 2026-11-06

The user authorized meaningful preservation commits, consolidation of all project tracks on master, and retirement of extra worktrees. This operation preserves unfinished source; it is not release acceptance or a resumption of the paused build/deployment task.

## Inventory and accounting

The October 27 baseline was a09ced1e. The initial expanded inventory contained 11,586 paths: 458 source/documentation paths, 11,119 files in two local website-build snapshots, eight image inputs, and one empty scratch JSON. Git's condensed status had 459 entries; that was not 459 untracked files. The earlier 12,811 additions / 1,330 deletions counted only 88 tracked files and omitted all new-file contents. The recovered research checkpoint alone adds about 1.56 million lines, predominantly structured JSON metadata.

A full path/size/SHA-256 inventory and pre-recovery tracked binary diff are retained at `{external-workspace}/repository-recovery-20261106/initial-path-inventory.json` and `tracked-before.patch`. Per-commit path lists are retained beside them. These are local recovery aids, not the sole record of source: source is now in the commits below.

## Source preservation checkpoints

- 7b93b38f — Amiga DAA decoding, source annotations and admission checks (11 paths).
- 1d08d171 — graphics research, source registries, descriptions and consumer tooling (235 paths).
- aacb1931 — graphics browser and local-asset runtime work (157 paths).
- e3b75fae — local/hosted packaging, metadata policies and source planning (50 paths).
- The following documentation commit records the accumulated goal/handoff/decision changes and this recovery.

These commits group recovered material by subsystem. They do not reconstruct an unrecorded editing chronology, establish independent correctness of every research claim, or assert that each intermediate commit is a tested release. Two whitespace defects were repaired during staging: a trailing space in test_import_cok_amiga_cpic_registry.py and an extra trailing blank line in cok-opening-to-travel.mjs.

## Local files deliberately outside Git

The `.gitignore` entries explicitly identify these preserved local inputs/outputs:

- `apps/web/dist-app-cok18/` and `apps/web/dist-app-cok57/`: retained website snapshots containing original game data and copied build output; 11,119 files total.
- `apps/web/public/restyle/cok/`: eight local PNG inputs, retained in place.
- `source-before.json`: empty-object scratch snapshot, retained in place.

No image/archive/executable bytes were added to the recovery commits. The external Restyle candidate remains at `{external-workspace}/greybox-hosted-restyle-candidate-05c2ed8b`. Candidate descriptor and receipts remain at their documented Temp paths; this ledger does not claim those Temp artifacts are permanent.

## Worktrees and branch history

Both detached worktree heads (1f40531c and 5c2feb5d) were ancestors of greybox and had no dirty or untracked files. Their build/renders directories were moved into the recovery folder before removal. `git worktree remove` deregistered each checkout but reported `Directory not empty`. Remaining contents were preserved as ordinary folders named `greybox-deploy-worktree-leftovers` and `greybox-public-release-clean-20261025-leftovers`; they have no `.git` checkout pointer. The preserved directories are recovery data, not registered or active worktrees. The build/renders archives have the same checkout-name prefixes.

Only `{repo-root}` remains registered. origin/master was an ancestor of greybox with no unique commits (2,787 commits behind the original greybox head). Both archive/validation remote branch tips were also ancestors of greybox. Preserve the archival branch labels as tags before retiring redundant remote branch refs. Consolidation uses ordinary fast-forward updates, not force-pushes.

## Checks and remaining acceptance work

All 103 JSON files parsed, 114 Python files passed AST parsing, 131 JavaScript modules passed node --check, and the combined web tsc --noEmit passed. Staged whitespace checks passed after the two repairs. No full corpus, game execution, browser acceptance, application build or deployment was performed. Existing runtime/security holds and unresolved hosting scope remain. Source preservation must not be reported as a verified release.

The initial image documentation audit and its reproducible metadata-only tool are recorded in [image-documentation-coverage-2026-11-06.md](image-documentation-coverage-2026-11-06.md). Continue from the gaps there before considering deployment.

## Completed consolidation

The six source/research/documentation checkpoints through `75edb0ac` were pushed
to `origin/master` by an ordinary fast-forward. Local `master` tracks
`origin/master`. Both local and remote now have only the active `master` branch.
The retired remote branch labels remain as tags:
`archive/validation-14-20261002`, `archive/validation-16-20261002`, and
`archive/greybox-before-master-20261106` (the original a09ced1e head). No commit
history was rewritten. The current checkout is the only registered worktree.

A final comparison against the initial 11,586-path SHA-256 inventory found **no
missing files**. All initial files retained their exact bytes except the two
documented whitespace repairs and the explicitly updated GOAL/HANDOFF documents.
Generated snapshots, PNG inputs and the scratch JSON still exist in place.
The remaining old checkout contents are ordinary local recovery archives at the
documented paths, not additional Git checkouts. The working tree was clean after
the consolidation; this final documentation commit records that result.
