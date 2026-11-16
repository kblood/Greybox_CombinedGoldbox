# Greybox release and CoK runtime graphics plan — 2026-11-05

This is a read-only plan from the local Astra subagent. It is not the result of the remote AICC Pi
session: that session remains alive, its model is unconfirmed, and it has produced no terminal text
or report file.

## Current evidence

- CoK already stores a per-game `DOS-EGA` / `Amiga` / `Restyle` preference. Admitted Restyle art is
  source/hash checked in title, player, dialogue, combat, terrain, wall and travel consumers.
- Town and main-menu chrome remain DOS-EGA. Per-tile Restyle candidates are not admitted as complete
  screen compositions. Amiga candidate provenance, four secondary player frames and ten CPIC1
  outputs remain held; do not promote them during release integration.
- The CoK source catalog has 6,067 IDs and visual descriptions. Game-use meaning and animation
  semantics remain incomplete. The latest documented V2 coverage catalog has 473 source IDs.
- The worktree contains 11,535 status paths: 85 modified tracked, 11,450 untracked, zero staged.
  Keep the 11,119 stale dist-snapshot files, eight unreviewed public PNGs, changed `selection.json`,
  `source-before.json`, two superseded font drafts and the machine-specific release ledger out of the
  candidate and staging.
- The shared rules prohibit generated review files in commits. Several current alias-binding checks
  consume generated `*review*.json` receipts; the alias generator also defaults to two manifest files
  inside the excluded `dist-app-cok57` snapshot. Excluding those artifacts without repairing these
  dependencies would make a fresh checkout unreproducible.
- Two CoK demo acceptance harnesses currently expect Restyle PNGs inside the production candidate.
  That conflicts with the metadata-only build and complete-output audit. Migrate them to a real
  Library install plus the local Restyle-pack picker; keep generated game assets out of the candidate.
- The full tools corpus previously failed with NASM missing and repeated Windows Unicorn access
  violations. The documented Chocolatey access denial prohibits retrying or routing around that
  restriction until the system access condition changes through the normal authorized path. The
  Vite `spawn EPERM` hold is a separate no-retry/no-alternate-build hold.
- Read-only SSH reached the configured server: `/var/www/html` exists and is writable, and
  `/var/www/html/greybox` exists. `DEPLOY_REMOTE_BASE` is still incorrectly `/var/www/html/webxr`.
  The approved deploy script exists at `C:\Devstuff\git\ai-control-center\skills\deploy-static\deploy-static.ps1`
  with the previously verified canonical SHA-256. There is no fresh accepted build artifact.

## Dependency order

1. Build an explicit path allowlist from current NUL-safe status. Preserve user inputs, stale build
   snapshots, unreviewed images, generated reviews, private game data and machine-specific ledgers
   outside the release.
2. Replace mandatory generated-review-file dependencies with a compact, source-owned alias-evidence
   contract. Derive current bindings from canonical source facts; keep historical report generation
   as an optional local audit. Remove the historical receipt from public metadata transforms if the
   import graph confirms it is not used by the app.
3. Move the non-image inventory and curated manifests needed by alias generation out of stale dist
   snapshots into an approved, portable source-data location. Preserve alias order, IDs, hashes and
   provenance, and compare the new inputs exactly against the retained local snapshot before
   changing pins. Resolve local external paths through explicit configuration and hashes; never
   package original game archives or generated PNGs.
4. Rebuild derived data in dependency order: source registries/censuses, alias bindings, player and
   consumer contracts, V1 coverage, V2 coverage, then browser metadata. Review each changed subject
   before refreshing dependent hashes. Keep the latest V2 source count at 473 unless generated
   outputs prove otherwise.
5. Migrate demo scene/combat browser harnesses to the real selected Library folder and local
   Restyle-pack flow. Audit affected E2E routes for packaged-image assumptions, preserve both full
   runner registries, and finish the required ten-title intro fixtures.
6. Do not rerun the held build or corpus commands. Record the exact failures and proceed with source
   work until the documented Vite and NASM/Chocolatey access conditions clear through their normal
   authorized paths.
7. Once the holds clear, run focused metadata/schema/mutation checks, web units, engine tests,
   workspace typecheck and full tools corpus. Build one fresh unique candidate through the approved
   build script; require the complete-output audit, full web E2E and all ten intro routes against
   that candidate.
8. On that same candidate, verify CoK mode transitions `DOS-EGA → Amiga → Restyle → DOS-EGA`,
   preference persistence, replacement/clear of local sources, exact hashes, source resolution,
   cache invalidation and unchanged gameplay state across title, character creation/sheet,
   exploration, travel, dialogue, combat and demo. Exercise Town and main menu as explicit DOS-EGA
   fallbacks and preserve the shared DQK Town caller.
9. Inspect and stage only the approved allowlist; commit owned source/docs and push without
   force-push. Set process-scoped `DEPLOY_SCRIPT` to the verified script and
   `DEPLOY_REMOTE_BASE=/var/www/html`; atomically deploy the accepted candidate with the prescribed
   script. Verify the deployed revision/artifact, live hashed JS bundle, affected production routes,
   root HTTP 200, asset responses and browser console.

No code, tests, builds, browser runs, staging, commits, pushes or deployments were performed for this
plan.

## Source progress update — 2026-11-05

The former release dependencies in steps 2, 3 and 5 now have source-side changes in the current
worktree: alias manifests are source-owned, and both demo harnesses select a real Library install
plus a local Restyle pack rather than expecting generated PNGs in the production candidate. This
was confirmed by reading their imports and call paths; the harnesses remain unrun under the Vite
hold. The ten-title fixture set is present per `GOAL.md`. Steps 1, 4 and the full release gates still
need coordinator review; steps 7–9 remain held by Vite `spawn EPERM`, the unavailable NASM/denied
Chocolatey path, and the lack of a fresh accepted candidate. Do not treat this source progress as
publish readiness.

A separate source-only player milestone adds a disk-qualified, held Amiga charT candidate for cells
67/1/32 and a shared still-art/status resolver. The candidate has no DOS bridge, runtime or Restyle
admission, authenticated palette or verified composition; two stored variants do not authorize
animation. Fifteen focused Node tests and the web typecheck pass. The release-source planner now
reports 414 intended paths, 11,152 excluded, zero unresolved, 440 dependency files, zero JS blockers,
59 changed Python files without action declarations, and 63 files without complete declarations.
Python dependency analysis remains incomplete. No build/browser/full-corpus/deployment or Git
integration occurred.

## Current inventory and next source family — 2026-11-05

The bounded Astra reconciliation reran only the read-only source planner at local HEAD
`a09ced1e1670c852f2f36a9671dcc122f174870d` on `greybox`. Its external report is
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-astra-reconcile-9a2eb2064d874e6eb77c6726622f3337.json`.
The report contains 11,566 status paths: 87 modified tracked and 11,479 untracked, with none staged.
It classifies 414 intended-source paths and 11,152 exclusions, with zero unresolved paths;
the JavaScript walk has 440 files and zero blockers. These are source-disposition results, not
permission to stage or evidence that a production artifact exists. The report explicitly keeps
`dependencyAnalysisComplete: false`.

Current Python coverage is 46 complete declarations, four partial declarations and 59 changed files
without declarations (63 without complete inventories). The four partial files are
`test_import_cok_dos_{com,font,pic,sprit}_registry.py`. The older next-task text at `GOAL.md:191`
and `HANDOFF.md:107` still says eleven partial/60 undeclared/71 incomplete; use this measured
inventory when choosing the next family. The planner's policy also retains its separate
`pythonIoAudit.dependencyClosureComplete: false` condition; completing declarations alone must not
be presented as full Python dependency closure.

**Next bounded source task: DOS font importer and its partial test declaration.**
`tools/import_cok_dos_font_registry.py:99` reads the retail archive, external font ledger/source/output
PNGs, and retained snapshot manifest/package images. Its default report path at line 183 also reads
the registry and invokes validation. `--write` at line 187 replaces the receipt and registry
independently through `cok_ecl_picture_consumers.atomic_json` (line 222), which creates and cleans
temporary sibling files. The validator can read referenced visual-description sidecars
(`tools/graphics_asset_registry.py:198`–215); those delegated reads belong in the action audit.
The importer currently has no action declaration. Its test declaration at policy line 9387 is
explicitly partial and omits the actual external `done/CoK_DOS_8X8D1_block201_font_atlas_restyle.png`
read visible in the test's lines 174–176; its listed `dos_render_all/**/*.png` pattern does not
describe that path. Review all test functions and imported branches before completing it.

Keep report and write actions separate, enumerate the fixed external font files and excluded
snapshot dependency, and audit registry-validation sidecars and temporary writes. Preserve exact
source/output hashes and non-admission status. Inspect containment before declaring those reads
bounded: `verify_pair` at lines 88–95 validates exact hash-named metadata but follows package image
paths without a resolved-root check, so the image directory/leaf symlink case still needs a decision
and a discriminating synthetic control. The entire existing test class is corpus-backed through
`setUpClass` at lines 18–22; do not describe or run it as a synthetic-only check. No importer or
test was executed in this reconciliation. Inspected importer/test SHA-256 values are
`6ba04b6cc45c0899b251c965809c8b24c578b3a51de3c90825f611d6bd0ff651` and
`5ee459987d07c769ccc8cb3c2f8c176c5f5360492bc20869f9e267729955cc81` respectively.

The release order remains: reconcile intended work and dependency evidence; clear the recorded
execution prerequisites through the authorized path; freeze source and earn the full required
gates on one fresh candidate; then reviewed integration and atomic publication. CoK graphics
acceptance on that candidate must exercise the existing selectable modes and local-pack flow,
while held candidates stay held. Publishing metadata alone does not supply visitors with image
bytes. The Vite no-retry hold, full-corpus/native-tooling hold and deployment boundary in the
worktree ledger (lines 666–669) remain unchanged. This update changes only this plan document;
no policy, runtime source, images, generated registry, tests, build, browser, staging, commit,
push or deployment was changed or run.

## Font completion and next family addendum — 2026-11-05

The font containment slice supersedes the pending font task above. `package_file` at
`tools/import_cok_dos_font_registry.py:88` now checks relative paths and resolved-root containment,
and `verify_pair` applies it before reading source/output bytes. The importer and both
`test_import_cok_dos_font_registry.py` and `test_import_cok_dos_font_registry_package.py` have
complete action declarations. The latter models symlink resolution with temporary synthetic inputs;
the former retains its corpus-backed setup. No test was run for this documentation follow-up.

Inspected report:
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-font-containment-20261105j.json`.
Its 11,567 status paths exactly match the current NUL-separated worktree status (87 modified tracked,
11,480 untracked, none staged). It records 415 intended paths, 11,152 exclusions, zero unresolved
paths, 440 JS dependency files and zero JS blockers. There are 58 Python files without declarations,
61 without complete inventories and three partial tests: DOS COM, PIC and SPRIT. Overall dependency
closure remains false; the previous counts and pending font recommendation are historical.

Next safe source family, selected but not executed: `import_cok_dos_com_registry.py` and
`test_import_cok_dos_com_registry.py`. The importer remains undeclared and its test declaration
partial. Audit report/write inputs, validator sidecars and temporary registry writes (importer
lines 399–443), distinguish synthetic tests from the fixture-gated class (`setUpClass`, test line
168), and review `decode_archives` lines 149–150: its hash-named package read bypasses `safe_file`,
unlike inventory joins and visual-description image reads at lines 199 and 365. A bounded containment
repair and action declarations can advance integration without executing corpus-backed importers
or admitting new graphics. Build/browser, full-corpus/native-tooling and deployment holds remain;
this follow-up only adds documentation and does not execute that next task.

## COM completion and next family addendum — 2026-11-05

The completed COM slice supersedes the pending COM task above. `decode_archives` now uses
`safe_file` for its hash-named package image (`tools/import_cok_dos_com_registry.py:150`). The
coordinator reports 3/3 isolated `SyntheticDecodePackageContainmentTests` passing; the corpus-gated
COM suite was not run. This follow-up ran no tests. Font importer/both test declarations and COM
importer/test declarations are complete, and all five declared SHA-256 pins match current source.

Fresh read-only planner report:
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-astra-com-cf593ac6d0f14d38b3666ce2aa111762.json`.
Planner exit 2 correctly retains incomplete analysis: 57 Python files lack declarations, 59 lack
complete inventories and only DOS PIC/SPRIT tests remain partially declared. Its 11,567 status
paths match the current worktree (87 modified tracked, 11,480 untracked, none staged); source
dispositions are 415 intended, 11,152 excluded and zero unresolved. The JavaScript walk remains
440 files with zero blockers. Overall closure is false, independently of the completed families.

Next safe source family, selected but not executed: finish the action-level I/O review of
`tools/test_import_cok_dos_pic_registry.py`. Its importer already declares report/write and
reconcile-report/reconcile-write actions. The test's three fixture-gated methods at lines 93, 131
and 143 call archive decoding and inventory matching; its visual-description class at line 160
creates and mutates temporary PNG/JSON fixtures. Enumerate these branches and imported helpers,
including validator/sidecar reads, before marking the partial test declaration complete. Keep the
external corpus and excluded snapshot dependencies explicit. Source review can proceed without
running the corpus-backed methods or regenerating registry/receipt data. All existing execution
and deployment holds remain; the release still requires its full accepted candidate gates.

## PIC completion and SPRIT declaration addendum — 2026-11-05

The authoritative existing report is
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-pic-test-20261105b.json`;
its computed SHA-256 is `056e89b74815f887ac348df06d2c5bede1c1ba6bbf096761f5c93d07dc12ea5e`.
PIC's test declaration is complete and its source hash matches. Current NUL-separated status
matches the report: 11,567 paths, 87 modified tracked, 11,480 untracked and none staged; 415 intended,
11,152 excluded, zero unresolved; 440 JS dependencies and zero blockers. Python has 57 undeclared
files and 58 incomplete inventories. Only `tools/test_import_cok_dos_sprit_registry.py` remains
partially declared, and its source hash also matches. Overall closure remains false. The previous
pending PIC task and counts are historical; no planner rerun or tests were needed for this follow-up.

Next safe task, selected but not executed: complete the SPRIT test action inventory through source
review. Its exact six-test split is two in-memory canonical-ID checks (lines 32 and 40), two
corpus-backed checks (52 and 84), and two temporary-fixture visual-description checks (131 and 141).
Record import-time fixture existence probes and delegated reads from archive decoding, inventory
matching and registry merging. The second corpus test's guard at lines 79–83 checks source/package
availability but does not check the archives read at line 85; this is still a corpus dependency.
The visual class at line 96 creates/renames a temporary PNG, writes JSON, corrupts/restores preview
bytes and cleans its temporary directory; enumerate those writes and imported description-helper
reads. Keep local corpus and excluded snapshot inputs explicit. Do not execute these tests, run
an importer or regenerate a registry/receipt to complete this source review. All existing
build/browser, full-corpus/native-tooling and deployment holds remain unchanged.

## SPRIT completion and undeclared-family addendum — 2026-11-05

Authoritative report:
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-sprit-test-20261105b.json`.
Computed SHA-256: `5adb4d95a4466a76e6bf97455685d2d0438953318056685a62c6dde10655fb0c`.
SPRIT's test declaration is complete and all 53 declared source SHA-256 values match current files.
Current status matches the report: 11,567 paths (87 modified tracked, 11,480 untracked, none staged),
415 intended / 11,152 excluded / zero unresolved, 440 JS files / zero blockers. Python has zero
unanalysed files, 57 undeclared files, 57 incomplete inventories and zero partial declarations.
Overall analysis remains false; the prior pending SPRIT recommendation and counts are historical.
No tests ran and no planner rerun was needed for this documentation reconciliation.

Next small related family, selected but not executed: `tools/import_cok_visual_description_dataset.py`
and `tools/test_import_cok_visual_description_dataset.py`, both undeclared. The importer reads
registry/dataset JSON and either retained snapshot images or evidence images under fixed
`{external-workspace}` (lines 101–113), and rereads dataset bytes for evidence hashing (line 141). Its
default report has no file writes; `--write` directly overwrites the selected registry (line 164),
without a temporary replacement. Declare those separate actions accurately, plus the test's
temporary PNG/JSON creation and cleanup (lines 19–52). The five tests use temporary image fixtures,
but the root-escape case at line 89 reaches `Path('{external-workspace}').resolve(strict=True)`; it still
probes a physical fixed-root prerequisite and must not be described as fully isolated.

Containment also needs source review: the package branch checks equality between two resolved
paths (line 104), not containment beneath the resolved package root; both can resolve through
the same escaped image-directory/leaf symlink. Do not mark this bounded merely because hashes
match. For the next declaration slice, the safe verification boundary is source inspection,
JSON/action/hash validation and a read-only planner report outside the repository. Do not import
or execute either module, read the image corpus, write registry data or run tests; document any
required containment repair separately before claiming complete review. All existing execution
and deployment holds remain unchanged.

## Visual-description inventory and containment repair addendum — 2026-11-05

Authoritative report:
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-visual-description-dataset-20261105b.json`.
Computed SHA-256: `df84b543bf526bcf19c7a043659778010f813ebd90569839789d9706d5d67359`.
The visual-description importer/test declarations are complete and all 55 declared source hashes
match current files. Status matches the report: 11,567 paths (87 modified tracked, 11,480 untracked,
none staged), 415 intended / 11,152 excluded / zero unresolved; 440 JS files / zero blockers.
Python has zero unanalysed files, 55 undeclared / 55 incomplete inventories and zero partial
declarations. Overall analysis stays false. The package-containment issue is explicitly unresolved;
inventory completeness does not establish safe path handling. No module/tests were executed or
image bytes accessed in this reconciliation. Prior pending declaration/count statements are historical.

Next bounded repair, selected but not executed: in `import_cok_visual_description_dataset.py`
lines 101–105, strictly resolve the supplied package root, evidence image and packaged image;
require the image to be under that resolved root as well as preserving the existing resolved-path
equality. Read the resolved contained file and retain all byte/pixel/evidence checks. Keep the
fixed `{external-workspace}` branch unchanged. This closes the case where both compared paths follow
the same image-directory or image-leaf symlink outside the package; equality alone admits it.

Verification option for that repair: add call-site controls using only synthetic PNG/JSON files
under a temporary root, covering normal acceptance, matching-hash image-leaf and image-directory
resolution escapes, and evidence/package mismatch. Model resolved targets if OS symlinks are
unavailable; require the escape controls to fail when the new containment check is bypassed.
Explicitly select those methods and the four existing temporary-only methods (test lines 58,
66, 77 and 83), with an instrumentation guard that fails before any attempted fixed-root path
operation reaches the filesystem. Exclude `test_source_evidence_cannot_escape_approved_root`
(line 89) and do not run the whole module, importer CLI, corpus, retained snapshot or real image
root. Refresh only reviewed source hashes/action evidence and inspect a new read-only planner
report after the repair. Native resident-byte budget is unaffected. All existing held operations
remain held; this addendum authorizes no execution in the current documentation follow-up.

## Containment completion and font-description test addendum — 2026-11-05

Verified report:
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-visual-desc-containment-20261105c.json`.
Its SHA-256 matches the expected `683a78fd863d1b466bbd271dbcb53d8f7f839adf6a4a88856bfeb1c3980b0ef7`;
all 55 declared source hashes match. Current status exactly matches 11,567 paths (87 modified
tracked, 11,480 untracked, none staged); 415 intended / 11,152 excluded / zero unresolved;
440 JS files / zero blockers. Python has zero unanalysed files, 55 undeclared / 55 incomplete
inventories and zero partial declarations. Overall closure remains false.

`import_cok_visual_description_dataset.py:101` now strictly resolves the root/evidence/package
paths and checks package containment plus exact equality before reading the resolved image. The
fixed external branch is unchanged. The completed slice reports seven selected temporary-only
tests passing; `test_source_evidence_cannot_escape_approved_root` (now test line 132, formerly 89)
and the full module were excluded. This reconciliation did not rerun tests or access image data.
The earlier unresolved containment recommendation is historical, not the current source state.

Next safe source task, selected but not executed: declare
`tools/test_import_cok_dos_font_visual_descriptions.py`. Its fixture at line 14 builds in-memory
registry/dataset objects; the three tests at lines 40, 53 and 64 call `apply_dataset` and
`validate_rows` from `tools/import_cok_dos_font_visual_descriptions.py` (already declared).
That `apply_dataset` at line 101 only formats the supplied path as evidence text; it does not read
the named JSON. Audit imported repository modules, including the glyph registry and common helper,
and distinguish import-time source reads from CLI-only archive/atlas/registry inputs. The reviewed
test bodies create no temporary files and call neither `verify_atlas` nor `main`; do not inherit
the importer's CLI I/O into this test action without a reachable call. Verify the declaration by
source/hash/JSON inspection and an external read-only planner report; do not execute tests, import
the module, access the corpus or regenerate data. All existing held operations remain held.

## Font-description test completion and glyph-importer addendum — 2026-11-05

The authoritative fresh root-run report is
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-font-visual-descriptions-rootverify-baebf9e706ae4f24bca3507d2a67a14e.json`.
Its computed SHA-256 matches `79033daef4d6c3abe6aa93a21e22fe58441d7d9fc2c99c42dff3b84074e10be2`.
The coordinator recorded exit 2 for remaining global gaps; this fresh unique-output run supersedes
the earlier ambiguous exit-1 report. The font-description test declaration is complete and all 56
declared source hashes match current files. No tests were run for the declaration or reconciliation.

Current status matches 11,567 paths (87 modified tracked, 11,480 untracked, none staged);
415 intended / 11,152 excluded / zero unresolved; 440 JS dependencies / zero blockers. Python has
zero unanalysed files, 54 undeclared / 54 incomplete inventories and zero partials. Analysis stays
false; prior pending test/count entries are historical, not release evidence.

Next related undeclared source task, selected but not executed:
`tools/import_cok_dos_font_glyph_registry.py`. `read_raw_archive` (line 107) reads pinned
`Champions of Krynn/8X8D1.DAX` and imports the census decoder locally. `main` (line 124) reads the
registry and invokes the shared validator. Separate report (no writes) and write actions; audit
validator sidecar reads and imported helper sources, plus `common.atomic_json` (common helper
line 222), which revalidates then creates/replaces/cleans a temporary sibling of the registry.
This importer writes no image or separate receipt; its source-code/evidence strings are not
themselves file reads. Its existing test declaration need not be reclassified without new evidence.
Verify only source, action inventory, hashes and a unique external read-only planner report;
do not run the importer/tests, load the game archive or image corpus, or regenerate registry data.
All existing build/browser/corpus/native/deployment holds remain active.

## Font-glyph inventory completion and HEAD family addendum — 2026-11-05

Verified authoritative report:
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-font-glyph-importer-8d993c63dbdd4fd7a139ddb6b7d0a785.json`.
SHA-256 matches `de165f79ab3950df7b9700924c312f4396cc2726f3590f821c4ccfae56bb84df`; all 57
declared source hashes match. The font-glyph report/write inventory covers its archive, registry,
helper/validator/sidecar reads, registry replacement and temporary sibling writes. Report writes
nothing. No importer or tests were run and no archive/image data was accessed in this slice.
The pending glyph-importer recommendation above is historical.

Current status matches 11,567 paths (87 modified tracked, 11,480 untracked, none staged),
415 intended / 11,152 excluded / zero unresolved, 440 JS files / zero blockers. Python has zero
unanalysed files, 53 undeclared / 53 incomplete inventories and zero partial declarations;
overall closure remains false.

Next small related family, selected but not executed: `tools/import_cok_heads_registry.py` and
`tools/test_import_cok_heads_registry.py`. Inventory the report/write actions for registry,
inventory and visual-description JSON; four DOS/Amiga HEAD archives under their explicit roots;
external source renders; and excluded snapshot source/output PNGs. `--write` directly replaces
the registry text (importer line 328), without atomic temporary replacement or validator call.
The test's import-time fixture checks (lines 15–35) and all four tests are corpus-backed through
`build` (line 39); its first test also invokes `graphics_asset_registry.validate` (line 64), whose
reachable sidecar reads require review. Importer and test therefore need distinct I/O inventories.

Containment remains an explicit follow-up: the decode gallery image (importer line 125), visual
review image (169) and inventory-controlled source/output paths (222) bypass `safe_file`, although
archive and external source paths use it. Record these gaps separately; a declaration is not proof
that reads remain inside the package. Source/hash/action inspection and an external read-only
planner report are the safe next verification boundary. Do not execute either module or its
corpus-backed tests, access archives/images or regenerate registry data. All holds remain active.

## HEAD inventory completion and containment task — 2026-11-05

Verified report:
`{local-user-profile}\AppData\Local\Temp\goldbox-head-importer-source-plan-c13333dcc2b8474a81a068b0c04647ce.json`.
SHA-256 matches `c85cd0b51234dd47a5deae6cda58a8e26540cfbec6e3891107c01b5f6f1e8321`; all 59
declared source hashes match. HEAD report/write and corpus-gated test inventories separately cover
four archives, six external renders, JSON and snapshot inputs. The importer report writes no files;
write mode directly replaces registry text with no atomic temporary or validator call. The first
corpus test's reachable validator reads the HEAD visual-description sidecar; no DoK branch is reached.
No importer/tests/media were executed or read. The previous pending declaration task is historical.

Current status matches 11,567 paths (87 modified tracked, 11,480 untracked, none staged),
415 intended / 11,152 excluded / zero unresolved; 440 JS / zero blockers. Python has zero
unanalysed files, 51 undeclared / 51 incomplete inventories and zero partials. Overall closure stays
false. Inventory completion leaves the three package containment gaps explicitly unresolved.

Next bounded task, selected but not executed: repair `tools/import_cok_heads_registry.py` package
reads at `decode_archives` line 125, `apply_visual_descriptions` line 169 and `inventory_pairs`
line 222. Use a package-file guard that rejects rooted/traversing paths, strictly resolves root and
leaf, checks containment and requires a file before existing hash/pixel checks. Preserve archive,
source-render and runtime-admission semantics; leave registry direct-write behavior outside this slice.

Design a separate synthetic test module, without importing `test_import_cok_heads_registry.py`,
whose module-level probes touch the local corpus. Exercise all three actual call sites with
temporary archive/render/package fixtures and bounded decoder mocks where needed. Cover valid
hash-matched input, inventory traversal/rooted paths, missing/directory inputs, hash mismatch and
image-directory/leaf resolution escapes. Prove escape checks discriminate even with matching bytes;
model resolved targets if OS symlinks are unavailable. Audit import-time dependencies and guard
against fixed external roots/default snapshots before selecting any focused tests in that repair
slice. The existing four corpus-backed tests and CLI remain excluded. Refresh declaration hashes
and the synthetic test inventory, then inspect a unique external read-only planner report. No such
repair or verification was executed here; all build/browser/corpus/native/deployment holds remain.

## HEAD containment completion and Area32 test inventory — 2026-11-05

Verified report:
`{local-user-profile}\AppData\Local\Temp\goldbox-head-package-containment-20261105-38373b69bd704b5fa508f7d334a4fd53.json`.
SHA-256 matches `83b0a0d29f8254f5eeb91cd49a3a1762bbf2cbab0e649740e49194a499280441`; all 60
declared source hashes match. HEAD `package_file` (line 74) rejects unclean relative paths and
requires strict resolved-root/file containment at all three consumers (lines 148, 196 and 252).
Registry direct-write behavior remains unchanged. The completed slice reports 6/6 separate
synthetic package tests passing with fixed-root/snapshot guards; corpus tests and CLI were excluded.
This follow-up reran no tests and accessed no media. Earlier unresolved HEAD-gap notes are historical.

Current worktree matches 11,568 paths (87 modified tracked, 11,481 untracked, none staged),
416 intended / 11,152 excluded / zero unresolved; 440 JS / zero blockers. Python has zero
unanalysed files, 51 undeclared / 51 incomplete inventories and zero partials. Analysis remains false.

Next bounded declaration task, selected but not executed: `tools/test_cok_area32_picture_joins.py`.
Its ten tests share unconditional `setUpClass` (line 16), which calls `cok_area32_picture_joins.build_receipt`
and reads the registry. Review the already-declared join tool's reachable inputs: ECL1/PIC1 archives,
three pinned external PIC1 renders, `HOST` source files (including inherited Throtl entries), historical
route Markdown and `cokDialogue15RestyleManifest.json`. Runtime-native PNG metadata is not a runtime
PNG read. Additional test reads include host-source mutations (line 84), archive/decode controls
(97), registry validation/sidecars (128), and source rehashing (151). The final test creates a temporary
registry, patches generator/validator calls for rejection, and exercises temporary atomic-write cleanup;
declare those temporary writes without treating the test as synthetic-only because class setup runs first.
Do not run any method, import the test module, generate a receipt, access archives/images or modify
registry data for this review. Verify only source/action/hash inventory and a unique external read-only
planner report. All existing build/browser/corpus/native/deployment holds remain active.

## Area32 declaration completion and travel-test inventory — 2026-11-05

Verified report:
`{local-user-profile}\AppData\Local\Temp\gb-area32-release-plan-fc3221d4c7e04261b58a3130c3651e91.json`.
SHA-256 matches `290521eb6e3a9997f38ac15584b829363ccfb33994fb074bc3b0cf1b2df5bafb`. The
policy-only Area32 declaration covers `setUpClass` and all ten tests; its source pin and all 61
declaration hashes match. No tests/imports, corpus, receipt generation or media operations ran.
The previous pending Area32 declaration/count notes are historical.

Current status matches 11,568 paths (87 modified tracked, 11,481 untracked, none staged),
416 intended / 11,152 excluded / zero unresolved; 440 JS / zero blockers. Python has zero
unanalysed files, 50 undeclared / 50 incomplete inventories and zero partials; closure stays false.

Next source-only declaration task, selected but not executed: `tools/test_cok_travel_picture_joins.py`.
All ten tests share unconditional `setUpClass` (line 16), which builds a receipt through the
already-declared travel tool and reads the registry. Review three archives (ECL1, PIC1, BIGPIC1),
three fixed-root source renders (BIGPIC1_121, PIC1_018_f0, PIC1_058_f0), imported decoder/helper
sources and the complete inherited/local `HOST` roster. Host-fragment tests read source again
(line 84); archive mutations call the decoder with external renders (102); validation reads
reachable registry sidecars (134). The final test (156) additionally hashes the existing
`m.source.RECEIPT` (the ECL1#16 picture-sites receipt), then uses a temporary registry and patched
generator/validator calls for rejection plus atomic replacement-failure cleanup. Declare temporary
writes accurately without counting the real receipt as a generated output of this test or treating
the class as synthetic-only. Do not import or execute it, generate receipts, access archive/image
data or modify the registry. Verify source/action/hash inventory and a unique external read-only
planner report only. All existing build/browser/corpus/native/deployment holds remain active.

## Travel declaration completion and demo-test inventory — 2026-11-05

Verified report:
`{local-user-profile}\AppData\Local\Temp\greybox-release-source-plan-travel-test-20261105a.json`.
SHA-256 matches `05c5aceae7350894f5f765b9cbd36b1bbae25564b6283ddcbbabdf90f22f1d97`; the target
pin and all 62 declaration hashes match. The policy-only travel inventory covers `setUpClass` and
all ten tests, repository/external inputs, host roster, validator sidecars, the existing receipt
as a read-only input and temporary writes. No tests/imports, corpus/media or domain receipt access
ran. Earlier pending travel/count entries are historical.

Current status matches 11,568 paths (87 modified tracked, 11,481 untracked, none staged),
416 intended / 11,152 excluded / zero unresolved; 440 JS / zero blockers. Python has zero
unanalysed files, 49 undeclared / 49 incomplete inventories and zero partials; closure remains false.

Next source-only task, selected but not executed: `tools/test_cok_demo_picture_joins.py`.
Its eleven tests share unconditional `setUpClass` (line 16), which builds the receipt, reads the
registry and decodes source frames again. Review five archives (ECL2, PIC2, BIGPIC2, HEAD2, BODY2),
six fixed-root PNGs and the complete `HOST` source roster through the already-declared demo tool.
Archive/source mutation methods rerun those reads; host mutation tests read source (line 85), and
registry preservation validates the full enriched registry (134), requiring reachable sidecar review.
The final test (155) rehashes real archives/registry, writes a temporary registry and invokes
`main --write` with the receipt builder and validator mocked to force rejection. That rejection
occurs before the two atomic writes: do not declare the real receipt as read or written merely
because its name appears in the importer. Temporary fixture writes are real; composite images are
in-memory calculations, not file outputs. Verify imported-source and action/hash inventory plus a
unique external read-only planner report, without executing/importing this class, the CLI, corpus,
archives/images or receipt generation. All existing held operations remain held.

## Demo declaration completion and Throtl-test inventory — 2026-11-05

Verified report:
`{local-user-profile}\AppData\Local\Temp\greybox-source-plan-demo-joins-f9a0969f1667421c989aa9d275f231c5.json`.
SHA-256 matches `a4a5faa9ce0dab3d9048f75595da19e911884f2b2ce736149379ad2d879a2f91`; the
target pin and all 63 declaration hashes match. The policy-only demo inventory covers setup and
eleven tests. Its real receipt is neither read nor written; the mocked CLI validation rejection
precedes receipt/registry atomic writes. No module/corpus/media operations ran. Prior pending
demo/count notes are historical.

Current status matches 11,568 paths (87 modified tracked, 11,481 untracked, none staged),
416 intended / 11,152 excluded / zero unresolved; 440 JS / zero blockers. Python has zero
unanalysed files, 48 undeclared / 48 incomplete inventories and zero partials; closure stays false.

Next source-only declaration task, selected but not executed: `tools/test_cok_throtl_picture_joins.py`.
Its eleven tests share unconditional setup (line 16), which builds a receipt and reads the registry.
Review ECL1/PIC1/BIGPIC1 archive reads, three fixed-root PIC1 renders (23/57/58), imported helpers,
the complete `HOST` roster, and reachable validator sidecars through the already-declared join tool.
Archive mutation tests reread data (line 50), host checks reread source (71), and enrichment validates
the full registry (124). The final test (143) rehashes archives/registry, creates a temporary
`registry.json`, then forces `atomic_json` validation rejection before its temporary-file block
(`cok_ecl_picture_consumers.py:222`). Declare the fixture write/read/cleanup, but no atomic sibling
or real receipt I/O for that rejected call. The test never calls the generator CLI. All methods
remain corpus-backed because setup is unconditional. Verify source/action/hash inventory and a
unique external read-only planner report; do not import/run tests, access game/media/receipt data
or regenerate anything. All build/browser/corpus/native/deployment holds remain active.

## Throtl inventory completion and encounter-variant family — 2026-11-05

Report:
`{local-user-profile}\AppData\Local\Temp\gb-throtl-source-plan-1af12e5d1779464397c8a57eaffab058.json`.
Its SHA-256, independently computed twice, is
`9f8ce370a9402b0a607fd8fdeb4e418b644989386b02584e0f751c6ccb79e029`.
This differs from the task-supplied digest
`9f8ce370a9402b0a607fd8fdebe4e18b644989386b02584e0f751c6ccb79e029`; do not claim an exact
expected-digest match. Report contents, current status and all 64 declared source hashes agree.
Throtl setup plus eleven tests now have a complete policy-only inventory: 21 reads, one temporary
registry write, and the direct import edge to `cok_throtl_picture_joins.py`. No module/media/receipt
operations ran. The previous pending declaration/count notes are historical.

Current status is 11,568 paths (87 modified tracked, 11,481 untracked, none staged),
416 intended / 11,152 excluded / zero unresolved; 440 JS / zero blockers. Python has zero
unanalysed files, 47 undeclared / 47 incomplete inventories and zero partials; closure remains false.

Next bounded undeclared family, selected but not executed: `tools/gen1_ecl_encounter_variants.py`
and `tools/test_gen1_ecl_encounter_variants.py`. The library defines `roster_id`, `compare_after`
and `scan_block_variants` (lines 20, 25 and 36); it accepts bytes/in-memory state and has no CLI
or explicit filesystem I/O. Preserve its 50,000-state, 24-call-depth and 16-roster-group bounds.
The test constructs synthetic scripts in memory and has eight methods (lines 55–170), importing
the legacy scanner and `effective_picture_ids`/`picture_slots` from `cok_runtime_art_coverage.py`.
Review those reachable functions and the transitive import graph before declaring read/write
arrays; distinguish source-module loading from uncalled corpus scans, contract/report reads and
writers in the imported modules. No fixture writes are visible in the reviewed test bodies.
Verify only source/action/hash inventory and a unique external read-only planner report; do not
import or run the modules, execute any scan/test, access corpus/media or generate reports/receipts.
All existing build/browser/corpus/native/deployment holds remain active.

## Encounter inventory implementation boundary — 2026-11-05

Local Astra source review permits the assigned encounter audit agent to implement only the two
action declarations in `docs/engine/data/greybox-release-source-policy-v1.json`. That agent owns
the JSON; Astra owns this plan. No target Python behavior, bounds, fixtures or outputs need change.
The native byte budget is unaffected. Current target SHA-256 pins are
`98489c27a4257828a38b531c925ec7aa35273023fe5d3e63f6760615aae54e45` for
`tools/gen1_ecl_encounter_variants.py` and
`0d9ad40c7fe3c32bb67bb5af3e47d44e76ae407e78390e489b161fa22a71fb8b` for its test.

Declare the library's three callables (lines 20, 25, 36) separately from the test action covering
all eight methods (lines 55–170) and its in-memory Script fixture. Domain-data reads: none;
domain-data/fixture/report writes: none. Values, bytes and synthetic bytearrays are supplied in
memory. There are no file handles to acquire/close in these target bodies. Preserve limits of
50,000 states, 24 call depth, 16 roster groups and 12 witness offsets. The test also calls legacy
`scan_block` and offset/profile helpers, plus coverage's `effective_picture_ids` and `picture_slots`
(coverage lines 126 and 175); those reachable bodies do not open domain files.

Record source-module dependencies explicitly. Library -> `gen1_ecl_encounter_scan` ->
`goldbox_corpus`, `report_guard`, `dqk_ca03_stream_decode`; corpus imports `dax_decode`,
`dqk_ecl_combat_scan`, `format_manifest`, `gen1_map`, `inventory_goldbox_binaries`, `rtlink_map`.
Test additionally -> `cok_runtime_art_coverage` -> `cok_ecl_picture_census` ->
`cok_ecl_picture_consumers` -> `graphics_asset_registry` and external `PIL.Image`; coverage also
imports `cok_player_runtime_coverage` -> `import_cok_player_appearance_registry`. Shared scanner,
decoder and variant edges remain part of that graph. The audit must finish its module-load review
before marking the inventory complete; direct-edge lists must match current source line numbers.

Risk boundary: module-level `Path.resolve` and `sys.path.insert` exist (for example player coverage
lines 17/22 and format_manifest lines 27/28); Pillow is an external import, not an image-open call.
Actual Python importing can load source/extension code and create bytecode caches. Therefore zero
domain I/O in these callables does not mean an import is side-effect free. Do not import to prove
the inventory. Uncalled scanner report/CLI functions (lines 566/677), coverage receipt/report
writers and registry/image helpers stay outside the target actions; do not run them or inherit
their output paths as target writes. No security or release hold is lifted by this declaration.

Verification now is source/action coverage, exact source hashes, JSON validity, whitespace/status
and the assigned audit's fresh read-only release planner using a unique external report path.
No tests, imports, scanners, corpus/media reads, receipts, builds, browser or native execution.
The eight existing tests describe future behavioral controls, not results of this inventory task.
Repository status at planning remains 11,568 paths (87 modified tracked, 11,481 untracked, none
staged); global closure stays false until a fresh planner proves otherwise. Vite `spawn EPERM`,
NASM/Chocolatey restrictions and the absent accepted release candidate still hold publication.

## Demo local-pack invalidation: bounded implementation plan — 2026-11-05

This source-only task advances the existing selectable CoK runtime and prepares the intended web
changes for integration. It does not complete or authorize publication. Read-only planning finds
11,568 worktree paths (87 modified tracked, 11,481 untracked, none staged), HEAD a09ced1e.
The ambient deploy base is still /var/www/html/webxr rather than /var/www/html; DEPLOY_SCRIPT is
unset, although the approved local deploy-static.ps1 exists with SHA-256
76ef3a08b9e52d019bfa782c45fed757a84beef116fbc3d38951e7049ab0f53f.
NASM is not resolved on PATH. Vite spawn EPERM, NASM/Chocolatey and fresh-candidate acceptance
holds remain. Do not retry builds or substitute another builder, server or deployment method.

### Defect and exact scope

In apps/web/src/ui/demoGen1.ts the private picker callback (1225–1232) closes/clears its bitmap,
resets loading/error and increments graphicsRevision. The demo subscribes only to graphics-mode
(1272–1284), removes only that graphics listener at stop (559), and accepts decoded bitmaps using
state identity plus graphicsRevision (773–787). Its state survives combat (907–981). Combat has
another picker (combat.ts:4118–4120) and a global pack listener (2031); using that picker never
calls the demo's private callback. An already-decoded demo bitmap can therefore survive clear or
replacement elsewhere, and a post-read asynchronous decode can finish against the wrong pack.
This is source-derived risk, not an observed browser reproduction.

Implement only demoGen1.ts runtime changes, plus focused acceptance changes in
apps/web/test/cok-demo-runtime-graphics.mjs, cok-demo-combat-graphics.mjs and
local-restyle-pack-e2e.mjs. Optional detached read-only diagnostic fields in existing __demo.stats
may expose current graphics revision, bitmap pack revision and pending/error state when needed
for discriminating assertions; expose no state setters or VM mutation. Do not change manifests,
image pins, archives, artwork, policy JSON, gameplay, release scripts or admissions. Target budget:
about 80 added/changed runtime lines and 150 acceptance/helper lines; exceeding it requires a
scope recheck. Native binary growth is zero; no generated bundle byte size can be claimed unbuilt.

### Event contract, lifecycle and asynchronous ownership

The existing producer is localAssetPack.ts:setLocalAssetPack (30–35). It synchronously replaces
the global pack, increments packEpoch, revokes cached object URLs, then dispatches
window CustomEvent('goldbox:local-asset-pack', {detail:{label: string|null, revision:number}}).
Every successful folder selection, same-folder retry and Clear produces a new revision; cancellation
leaves the pack unchanged. This event is global and has no gameId. Do not filter it as a graphics
preference event or rebroadcast it. Read localAssetPackRevision() as authoritative current state;
label/detail are presentation data, not trusted bitmap identity.

Add one nullable local-pack listener owned by the exact DemoState instance, initialized with the
state and registered only for profiles with runtimeArt. Capture that instance, not merely the
profile or game ID. The handler returns unless state === captured instance; invalidate the demo
bitmap in both narration and combat: increment graphicsRevision, close its owned bitmap once,
clear its reference, reset pending/error and repaint native fallback before starting any current
Restyle request. Keep the stored mode/fallback and VM/timer/beat/combat state unchanged. Route
its own picker through the same event by making that picker callback a no-op, avoiding double
invalidation. Existing combat listeners continue to handle combat art independently.

Remove the exact listener in stopGen1Demo before exit/restart; also remove the graphics listener
and close/null owned bitmap. startGen1Demo already calls stopGen1Demo (1011). A stopped/replaced
demo must never mutate a newer one or register duplicate listeners. No new listener is needed
for profiles lacking runtimeArt.

At ensureDemoRestyle launch, capture instance, graphicsRevision and localAssetPackRevision.
Use all three in a shared freshness predicate for then/catch/finally. A stale successful decode
must close its newly returned bitmap without drawing or storing it; a stale rejection/finalizer
must not set an error, clear a newer request's loading flag or repaint. Current success owns the
bitmap until invalidation/stop. Current errors preserve native fallback and become retryable on
the next pack event. The existing pinned-byte reader guards the read/hash phase, but
cokDemoArt.ts:createImageBitmap occurs afterward; the consumer guard covers that decode gap.
This is logical cancellation, not an abort guarantee for createImageBitmap. Preserve hash, PNG,
size and geometry validation and production's no-fetch fallback policy.

### Discriminating acceptance to author now and execute only after holds clear

The current local-restyle-pack-e2e.mjs:selectLocalRestyleFiles (89) selects the first picker in
the document. Add an optional explicit picker-container selector, preserving the current default.
Combat cases must target .sheet-overlay .combat-local-pack-control and assert containment; Clear
must click that container's real button. Otherwise a purported combat test can accidentally hit
the underlying demo picker and miss this defect. Keep actual File/DataTransfer selection; do not
call setLocalAssetPack or dispatch a synthetic pack event as the end-to-end acceptance action.

1. In the fresh-candidate narration harness, reach the pinned BIGPIC2#116 through the actual demo,
   pause, select the exact local pack and Restyle, and snapshot pixel hash plus detached VM/stats.
   Clear removes the overlay and restores the selected original fallback without advancing state.
   Replace with a nonempty pack missing that scene, then the valid pack: fallback, then exact
   admitted pixels return. Same-folder retry advances revision once. Never fabricate image bytes.
2. Extend the real ECL combat harness to include the existing pinned scene PNG in its local file
   roster, prime demo scene art on a naturally reachable narration beat, then enter combat.
   Clear/replace through the explicitly scoped combat picker must invalidate the underlying demo
   cache as well as combat art. Assert unchanged existing invariant() values (VM memory, PC, RNG,
   clock, roster, position, turns/HP), unchanged selected mode and current-pack-only pixels.
   On natural return to narration, old cached art must not reappear. If the reviewed script route
   cannot supply that sequence, report the limitation; do not inject a fight/scene or claim the
   cache case passed from listener inspection alone.
3. Add a deterministic delayed-decode control around the browser's bitmap decode (or an isolated
   adapter-level harness) so A finishes after pack B/clear. Prove A closes and cannot paint, set an
   error or clear B's pending flag; B alone may install. Repeat for stop/restart of the same profile
   and a late rejected A. Keep controls separate from real-pixel acceptance and restore wrappers.
4. Repeat pack changes during combat and narration, exit/reopen, and verify one invalidation per
   event and no surviving old listener. Preserve DOS -> Amiga -> Restyle -> DOS exact restoration,
   keyboard/picker input containment, zero candidate image fetches and absence of console errors.
   The negative control is disabling the demo global listener or pack-revision guard: the relevant
   cache/race assertion must fail, not merely a source-string check.

For this bounded source task, code and acceptance harnesses may be authored after coordinator
assignment. Verify by source/diff review and pins only under the current no-test assignment;
no test execution, browser, module import, media/corpus access or build is authorized here.
Once restrictions clear, run the discriminating controls and real candidate cases, then the full
required release gates on that same fresh candidate. Preserve existing full-run registries; new
registered cases must appear in both lists where applicable. Do not call authored controls passed.
Before publication, integrate only the reviewed source allowlist, retain all excluded user work,
clear the documented build/corpus blockers, accept the full candidate, set the approved process
configuration and use the canonical atomic deploy. This plan changes no environment or source.

## Demo cache slice scope review against dirty baseline — 2026-11-05

The HEAD-relative numstat (demoGen1.ts +114/-85; runtime harness +58/-11) is not the owned cache
slice. Before this plan, Astra had already source-reviewed demoCombatGraphics.ts imports,
AssetSource hooks, demoCombatRoster/demoCombatAssetPaths, the full enterCombat loader integration,
vmState diagnostics, combat picker and the existing untracked combat/helper harnesses. The retained
four-file pre-edit snapshot at {local-user-profile}/AppData/Local/Temp/goldbox-demo-before.json has SHA-256
573705d329310baca0d9613a68148ce62db9141137eed195e1f074a11e00f2f8 and independently confirms those
features existed. Its enterCombat body differs from current text only in two Unicode/mojibake
comment/string lines; executable statements are unchanged. The snapshot's text encoding is not
an authoritative original-byte snapshot, and fresh current hashes did not reproduce every digest
reported by the implementer, so do not claim byte-identical provenance from that comparison.

Decision: no broader combat refactor or new helper ownership is approved by this cache task.
Preserve demoCombatGraphics.ts and the older combat/AssetSource integration as pre-existing dirty
work; do not trim/revert them. They are functional prerequisites of the already-existing real
combat/local-pack harness and require their own release integration review. Only changes within
the original four paths are owned here. Existing untracked status does not mean newly created
in this slice. Do not enlarge the runtime file list to combat.ts or demoCombatGraphics.ts.

Implementer-reported snapshot-relative deltas are demoGen1 +34/-15, narration harness +43/-2,
combat harness +28/-3 and shared helper +42/-2: 49 runtime and 120 acceptance/helper touched lines
(the earlier 115 summary undercounted the three reported test/helper sums). Both fit the original
80/150-line target. This clarifies the baseline; it does not approve extra code or certify tests.
The fresh source review confirms exact-instance event ownership, cleanup, pack+graphics revision
checks and close-on-stale-success are in the planned runtime paths.

Remaining acceptance work is not closed: delayed decode across stop/restart of the same profile
and natural post-combat narration return remain unauthored. Cached-scene priming is conditional;
its GAP log cannot support a complete cache verdict even if other combat checks later print PASS.
Keep that distinction explicit in the candidate result and finish the planned controls before
claiming acceptance. Authored harness changes are unrun; mutation controls, browser acceptance,
full release gates and all Vite/corpus/deployment holds remain unchanged. No source edits or test
execution occurred during this scope review.

## CBODY216 bounded composition evidence — 2026-11-05

Reviewed source: {external-workspace}/cok_restyle_work/dos/CBODY/CBODY_216.png,
SHA-256 adc42c056a6075ae2727562014ba5dc2228246d3b055f9b19a7f7fa96b81d41c.
Reviewed output: {external-workspace}/cok_restyle_work/done/CBODY_216_restyle.png,
SHA-256 64c94f5ca054050b95611c2c6524eb3d6cfa4b83f45bd70dd200f915aa2681dc.
These are the exact source/output pins already recorded in the current appearance metadata.
The coordinator reports that filenames-only/text searching found no prompt file for CBODY_216;
this is a bounded search result, not proof that no original prompt exists elsewhere.
Independent view_image inspection of these two files shows the same overall pose, placement,
framing and black background. The output adds finer contours, shading and highlights while
retaining the main silhouette; some local edges become narrower or softer. It appears to be the
same frame with a style change. This records observable composition evidence only, not exact
pixel/palette equivalence, recovered prompt lineage, character identity, game-use semantics or
runtime admission. No other images were reviewed for this comparison; registry/admission state
and existing runtime/release holds are unchanged.

## Deferred demo restart and natural-combat acceptance recipe — 2026-11-05

Scope revision for the remaining authored controls: change only
apps/web/test/cok-demo-runtime-graphics.mjs, apps/web/test/cok-demo-combat-graphics.mjs and
apps/web/test/local-restyle-pack-e2e.mjs. No further runtime seam is required. Allow at most
120 additional touched test/helper lines and 8 KiB additional UTF-8 test source; combined with
the reported 120-line first slice, the test/helper budget becomes 240 touched lines. The existing
runtime budget remains unchanged; this follow-up adds zero runtime/native bytes. Production
bundle size is unmeasured and cannot be claimed without the held build. Recheck scope before
exceeding these bounds. This is a plan, not permission to execute held acceptance.

Use the retained actual Library entry to reopen. The initial helper selects real File objects;
main.ts:startCokDemoRoute resolves that entry and calls startDemo with its AssetSource, then
startGen1Demo receives the same COK profile and source hooks. In contrast, __demo.open(h) does
not default to the original hooks, and __greybox.getLibrary exposes metadata without AssetSource.
Do not manufacture replacement hooks or fetch bundled game files. After __demo.exit(), tear down
the default hookless title menu via its real Demo button (or existing __titleMenu.hotkey('d')),
then click the retained CoK Library row. This removes the title timer/listener; the existing Library
route reuses the actual selected source. Do not reload the page and thereby erase the pending race.

1. Before the initial demo mount, install test-only observation of window.addEventListener and
   removeEventListener for goldbox:local-asset-pack, retaining callback identities and restoring
   the originals in finally. Record registrations attributable to each mount. Reach BIGPIC116 by
   actual demo steps, pause and select the admitted pack. Hold decode A after actual bitmap decode;
   filter held jobs to the scene dimensions so unrelated decodes are not stalled. Retain stable
   job identities across restart; do not overwrite or lose A's pending handle.
2. Exit the old demo, verify inactive, close the default menu and reopen using the same Library
   entry. Wait for the new demo and pause; reach the actual scene again and hold decode B. Allow
   MutationObserver cleanup. Prove old mount callback registrations were removed and the new
   mount has one demo invalidation listener. A stale callback that merely returns early is not
   proof of unsubscribe.
3. Release A successfully: its bitmap must close without installation; B stays pending and the
   new demo's VM snapshot, revision, loading and error state remain unchanged. Release B: only B
   installs, with current pack revision and the admitted pixel hash. Repeat for late A rejection.
   Prefer equal old/new graphics revision values when arranging the sequence, so the instance
   ownership check cannot be accidentally masked by different numeric revisions. Change the
   pack through the new real picker and require exactly one invalidation. In finally, settle and
   close all held bitmaps as appropriate, restore wrappers and release every retained handle.
4. In the combat harness, first finish the scoped Clear/replace assertions with gameplay state
   invariant. Then permit real gameplay progression: keep the interval paused and call __demo.step
   at most 600 times, stopping immediately when combats increases. This follows driveCombat's
   actual autoStep, victory/treasure handling and dismiss, then onEnd -> vm.resume -> narration.
   Never use finish, injected outcomes, synthetic fights or direct VM writes. Require the real
   lastOutcome, narration phase and removed overlay, then observe natural following beats and
   current-pack-only presentation. Gameplay changes during this completion phase are expected;
   do not compare them to the earlier no-progression pack-change invariant.

The existing runDemoCombat in apps/web/test/e2e.mjs:18755–18769 supplies a bounded 600-step source
precedent for real completion. This review proves a code path, not fresh candidate reachability,
post-combat scene availability or runtime success. If the combat does not complete, the pinned
scene was not naturally primed, no required post-combat presentation can be observed, cleanup
cannot be proved, or any restart/race assertion is unearned, emit INCOMPLETE with a nonzero exit
and exact missing case. Do not print aggregate PASS for partial cache acceptance; retain measured
subcase evidence separately. All controls remain unrun until the applicable holds are cleared.
No test, browser, media read, build, runtime source edit or deployment accompanies this addendum.

## Independent player selector-to-block validation plan — 2026-11-05

Current GOAL/HANDOFF were read before planning: focused demo Node/typecheck/syntax checks are
recorded, browser acceptance is unrun, secondary player Restyles and Amiga mappings remain held,
and no fresh accepted release exists. This task strengthens source identity; it admits no art.
Only runtime implementation path: apps/web/src/ui/cok-player-canonical-bindings.mjs (current
SHA-256 37f4ca61b6d74bf86e6513853e84206cc8a6922bf4569c40bc7e62d3bf53e0b8).
Only test path: apps/web/test/cok-player-canonical-bindings.test.mjs (current SHA-256
95842a1ed66268e459894a53972781a2b2d64d8eebd9ac4c7a4a580fd6fdd6d0).
Keep all unrelated dirty work; no generator, registry, manifest, projection, policy, .d.mts,
image, engine or consumer edits. No public API change is needed.

The independent contract is grounded in cok-player-icon-source-contract-2026-10-26.md:110–143,
second-appearance note:10–20, third-appearance note:9–21 and fourth-appearance note:11–18.
Tuple columns are hexadecimal bytes (head request, body request, storage slot, suffix); block
numbers below are decimal. Identity suffixes follow cok-player-.

| Exact tuple | Appearance identity | Role | CHEAD variants 0/1 | CBODY variants 0/1 |
| --- | --- | --- | --- | --- |
| 05 18 00 02 | 05-18-00-02 | primary | 69 / 197 | 88 / 216 |
| 05 18 02 02 | 05-18-00-02 | slot-2 alias of primary slot 0 | 69 / 197 | 88 / 216 |
| 05 01 01 02 | 05-01-01-02 | primary; no alias | 69 / 197 | 65 / 193 |
| 05 17 04 02 | 05-17-04-02 | primary | 69 / 197 | 87 / 215 |
| 05 17 05 02 | 05-17-04-02 | slot-5 alias of primary slot 4 | 69 / 197 | 87 / 215 |
| 03 0B 03 01 | 03-0b-03-01 | primary; no alias | 3 / 131 | 11 / 139 |

Suffix T/code2 adds 0x40 to both head/body request; suffix S/code1 adds zero. Variant1 adds
0x80 to variant0 for each family. Head storage slot is fixed 11 in this loader; cBodySlot is
pointer-table storage, never a block-number operand. These equations validate only the six
listed tuples: they do not admit arbitrary requests, slots, suffixes, 217–223, or animation.

**Implementation follow-up:** `cok-player-canonical-bindings.mjs` and its focused test now implement
the reviewed selector contract. The independent selector guard also protects DOS fallback planning;
an unreviewed tuple or altered selector/block mapping returns no fetch plan. Coherent manifest and
projection mutations are rejected. The focused Node suite passes 9/9, including complete roster
order and coherently relabeled block cases, and `git diff --check` passes.
Admissions and held playback are unchanged; no build, browser, corpus, artwork, native or deployment
gate is cleared by this bounded validation slice.

Implementation: define a small private immutable reviewed contract keyed by the four fixed
appearance IDs, with primary selector and explicit alias slots. Never populate it from manifest,
projection or registry. A private helper verifies exact integer tuple roster/order and identity,
then independently derives expected head/body pairs from the reviewed constants and suffix rule.
Check manifest.head.blockIds and both bodyFrames.blockId values against those pairs. Run this
check at the beginning of each appearance validation, before component/policy joins, using a
specific 'source selector mapping' diagnostic. Existing projection comparisons then require its
accepted tuples and archive-qualified component IDs to agree. Keep counts 4 identities, 6 tuples,
8 variants, 12 sources, 10 Restyles and 4 admitted primary frames unchanged.

Reuse the same check in cokPlayerAppearanceFetchPlan: request must belong to that reviewed
identity/tuple and the selected manifest entry must satisfy the independent block/tuple check.
Otherwise return null, including when canonical bindings are null. This closes the current path
where failed canonical validation can still fetch wrong DOS components from a consistently altered
manifest. Preserve the established DOS-only fallback when the manifest selector/block contract
is valid and only projection/source evidence fails; its Restyle and canonical fields remain null.
Do not change source-mask/palette behavior, optional failure statuses or playback:'held'.

Required mutations are in-memory clones only, with both manifest.sourceTuples and corresponding
projection.acceptedTuples changed together. Preserve unaffected fields/counts and synchronize
cloned policy/projection.admission and declared hashes when their fields change, so an incidental
header/policy mismatch cannot masquerade as the new guard's proof:

- Change a primary body request 0x18 to 0x19 in both documents (and its alias), retaining the old
  frames; change head request5 to6 similarly. Both must throw the selector-mapping diagnostic.
- Change T/code2 to S/code1 consistently while retaining T-derived frames; likewise reject an
  unsupported suffix. Do not interpret merely plausible block arithmetic as admission.
- Change alias slot2 to1 or alias slot5 to6 in both rosters; swap primary/alias ordering or roles;
  try exchanging the tuple roster between two identities. All must fail independently.
- For the known 05-18 identity, change body pair88/216 to89/217 in manifest and projection,
  consistently renaming projected source IDs/locators and Restyle memberships, and updating
  cloned policy bodyBlockId/admission. Still reject: internally coherent art is not that selector.
- Change only second body216 to217; swap head69/197 order in manifest and projected components
  and policy headBlockIds (their pixel hashes are identical); swap the two body variants with
  corresponding cloned metadata. All must fail the independent ordered-pair check.
- For every invalid selector/block case, tryCokPlayerCanonicalBindings returns null and the
  fetch plan with null bindings returns null. For projection-only corruption against the valid
  original manifest, retain exact DOS requests and no Restyle/canonical requests. Retain the
  positive six-tuple matrix, 20 package paths and held-secondary checks already in the test.

Budget: at most 60 touched production lines / 3 KiB additional UTF-8 runtime source and 130 touched
test lines / 7 KiB additional test source. Native growth is zero; bundled byte growth is unmeasured.
Recheck scope if this cannot fit without changing data/admission or adding another runtime module.
After the coordinator authorizes focused verification, the bounded command from repository root is:
`node --test apps/web/test/cok-player-canonical-bindings.test.mjs`.
Its existing generator import is protected by a direct-CLI guard; the test calls read-only metadata
checks, not --write. It uses repository source/JSON and synthetic clones, no Vite/browser, game
archive, external image or corpus execution. It can prove selector rejection and unchanged fetch
plans, not visual rendering, animation, browser acceptance or release readiness. No test or runtime
edit was performed during this planning step; all execution/release holds remain intact.
