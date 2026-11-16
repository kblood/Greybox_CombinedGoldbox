# CoK DOS TILES.DAX review-provenance remediation contract (2026-11-14)

Goal: [CoK full implementation goal](cok-full-implementation-goal-2026-11-09.md), entry 245. A **documentation-only contract** that separates what the [Goal 244 provenance trace](cok-dos-tiles-001-provenance-trace-2026-11-14.md) established from what remains unknown, and that specifies the evidence and decisions needed before the 48 DOS `TILES.DAX` visual-description citations can be supported, qualified or corrected.

Status: **contract written; no citation, description, registry, sidecar, status, relationship, importer, validator or pin changed.** Committed and pushed as `4665f7d3166445608542699573aa995744f5a292` (verified on local `origin/master`). Source identity: `master` at `80e9a302` at the start of the slice; the worktree was clean.

Not performed at the original contract-writing stage: no test, typecheck, build, Vite, browser or app launch; no importer, validator or reader run; no image, restyle output, archive or external ledger opened; no game-data file read. The later D1 ledger read is recorded in section 10. Only checked-in text (the Goal 244 report, the tracker files, importer and bundler source, the registry and sidecar JSON, and `git` metadata) was read. Two SHA-256 values were computed over checked-in JSON files (section 1, E3 and E2). Goal 243 remains **unaccepted**.

**Update 2026-11-14 (D1):** the user authorized the read-only D1 ledger check, and its metadata result is recorded in section 10. This documentation update is committed and pushed as `6b13572aa6e8b6b67de7aa5a715db9824058afb8` (verified on local `origin/master`). No PNG, image, archive or game-data file was read, and D2–D5 remain open.

This is **not** a visual review. It does not show that any description matches its art, that a review occurred, or that any tile has game use.

## 0. Roster

The 48 IDs are exactly those of Goal 244 (`EXPECTED_IDS` in its reader, Appendix A):

- `cok/dos-ega/tiles.dax/block/1/tile/0` through `block/1/tile/25` (26 IDs)
- `cok/dos-ega/tiles.dax/block/2/tile/0` through `block/2/tile/21` (22 IDs)

Every per-ID check in section 1 (E1–E8, E10, E11) was reported by Goal 244 as holding for **48 of 48** IDs, with no exception. E9 and E12–E19 are properties of the importers, bundler, history or narrative, which apply to the 48 as a set. Section 2 applies to the 48 as a set. No per-ID exception is recorded.

## 1. Established facts

"Established" here means traced to a checked-in file or to the Goal 244 reader output. It means **recorded consistency**, not truth about the images or about how the records were produced.

| ID | Fact | Evidence |
| --- | --- | --- |
| E1 | 48 sidecar rows, one per ID, none outside the roster; 48 registry assets, one per ID; locator block and tile match the ID. | Goal 244 §3, App. B |
| E2 | Sidecar `docs/engine/research/cok-dos-tiles-001-visual-descriptions-v1.json`: 46,572 bytes, SHA-256 `e1eb125f38006fed35c89aca092c1133f469203bb7c887ddc726d5b390bbce2d` (recomputed in this slice; matches). One commit in history. | Goal 244 §1; this slice |
| E3 | Registry `docs/engine/research/cok-graphics-identity-registry-v1.json`: SHA-256 `c3559a37421d7cfed9285ada5f88c542edfac15049d6cff28bc81fd16fee46fb` at `80e9a302` (recomputed in this slice; matches the value Goal 240 recorded). | this slice |
| E4 | Archive pin `ARCHIVE_SHA256 = 9e383adc1638e6202726df41a8c42640e446a17c8a9c1e9df45b8ba0d478b205` in `tools/import_cok_dos_tiles_001_registry.py:32`; the registry archive SHA-256 equals it in all 48 records. | Goal 244 §3; importer source |
| E5 | Ledger pin `LEDGER_SHA256 = d1e307beb41b80725727e9371e17d1aa701be0e1f55e85b51dc6239c4f66d359` (`:33`) and default path `{external-workspace}/cok_restyle_work/dos_tiles_001_48_provenance.json` (`:31`). The path exists on this machine (existence only). **The file was not opened, and its hash was not checked.** *Superseded 2026-11-14 by section 10: the file was read once under D1; its SHA-256 matches this pin.* | importer source; Goal 244 App. B |
| E6 | Each ID has exactly one registry `visual-review` citation, with reference `docs/engine/research/cok-dos-tiles-001-visual-descriptions-v1.json#<id>`. | Goal 244 §3 |
| E7 | Hash chain: sidecar `sourceSha256` and `pixelSha256` equal the registry `decoded.sha256` and `decoded.pixelSha256`; each note's source PNG, decoded pixel and `dataset SHA-256` values equal those sidecar fields, and the digest equals the current sidecar bytes. One dataset digest value appears in all 48 notes. | Goal 244 §3 |
| E8 | Registry `visualDescription` equals the sidecar row wording (string equality, 48/48). 48 distinct wording strings; 48 distinct `pixelSha256` values; no pixel hash shared with a registry source outside the roster. | Goal 244 §3, App. B |
| E9 | The note is one fixed template: "Visible appearance reviewed against exact source PNG SHA-256 … and decoded pixel SHA-256 …; dataset SHA-256 …. Subject identity, game use, selector, and playback semantics are unproven." The generic importer writes this text (`tools/import_cok_visual_description_dataset.py:143`). **The word "reviewed" is importer template text.** | importer source; Goal 244 §3–4.2 |
| E10 | Registry `description.status` and all 48 `gameConsumers` statuses are `unknown`. | Goal 244 §3 |
| E11 | Restyle lineage: 48 records `restyle/cok-dos-tiles-001-<block>-<tile>` link their source, carry a ledger reference ending `#outputs/<global index>`, have one `raw-generation` output, and have prompt status `unknown`. | Goal 244 §3 |
| E12 | Identity importer `tools/import_cok_dos_tiles_001_registry.py` writes source records, placeholder descriptions (status `unknown`), consumers and restyle records. It names no sidecar and writes no `visualDescription` or `visual-review` evidence. It is dry-run by default (`--write` gate). | importer source; Goal 244 §4.1, App. B |
| E13 | Generic importer `tools/import_cok_visual_description_dataset.py` is the checked-in writer of the citation note and `visualDescription` text. Its default dataset is `cok-small-picture-visual-descriptions-v1.json` (`:17`), so the tiles dataset must be passed with `--dataset`. Its CLI takes `--registry`, `--dataset`, `--package-root`, and writes only with `--write` (`:157–160`). For a `{external-workspace}/` reference it reads the external PNG and checks its file and decoded pixel hashes (Goal 244 §4.2, step 4). | importer source (`:17`, `:143`, `:150–170`) |
| E14 | Bundler `apps/web/scripts/bundle-cok-dos-tiles-001-previews.mjs` (`e3b75fae`) reads restyle output PNGs and validates pins. It reads neither the sidecar nor `visualDescription` text. | Goal 244 §4.3, App. B |
| E15 | `cok-dos-tiles-decode-receipt-v1.json` covers the 1,693 8×8 tiles of `8X8D1/2/3`. It has no TILES.DAX entry and is **not** provenance for the 48. | Goal 244 §4.4 |
| E16 | Git: the sidecar was untracked on 2026-11-04 (`??` in `docs/engine/research/greybox-release-worktree-ledger-2026-11-04.md`), then first committed in `1d08d171` (2026-11-06) with both importers and the registry changes. The digest prefix `e1eb125f38006fed` and the citation string enter the registry only in `1d08d171`. The bundler and its test are from `e3b75fae` (2026-11-06). No later commit changed these paths. | Goal 244 §5 |
| E17 | HANDOFF (`docs/engine/HANDOFF.md:2853–2860`, dated 2026-11-04) narrates: "two independent read-only reviews examined all 48 exact source PNGs"; they "agree" the marks are "visually ambiguous forms"; the importer reported "48 rows, 48 unique pixel groups and 48 verified previews"; the dataset suite passed 5/5. These are **narrative claims**. No tracked reviewer output, procedure or per-row verdict exists (Goal 244 §4.5, `git grep`). | HANDOFF text; Goal 244 §4.5 |
| E18 | The output key names in E17 match the generic importer's JSON output (`rows`, `uniquePixelGroups`, `verifiedPreviewFiles`). The key names alone do not identify a command, a dataset path, a registry state or a date. | importer source; Goal 244 §4.2 |
| E19 | `git ls-files` lists `Champions of Krynn/TILES.DAX` as tracked (blob `f068eb89…`), within 107 tracked files under `Champions of Krynn/` (Goal 244 §9; re-checked in this slice). | `git ls-files` |

## 2. Historical facts that remain unknown

These cannot be established from checked-in evidence. They must not be filled in by inference, by copying the HANDOFF output keys into a command, or by re-running an importer and presenting the result as the 2026-11-04 run.

| ID | Unknown | Why it matters |
| --- | --- | --- |
| U1 | **The importer invocation.** Whether the generic importer was run for this dataset; the date; the `--registry`, `--dataset` (path and bytes) and `--package-root` values; whether `--write` was used; whether it was a dry run first. | The registry contains the citations and wording, and the generic importer is the only checked-in code that writes them, so some run wrote them. No record shows which run. |
| U2 | Whether the registry state written by that run matches the current registry (E3). | The citations could have been written into a different registry state; the current state is only one checkpoint. |
| U3 | Whether, in that run, the external PNG bytes passed the file and pixel hash checks. | The recorded hashes equal the registry, and the importer requires equality. That is evidence the importer's check would have passed if it ran. It does not record that it ran against these files. |
| U4 | The identity and count of the **two 2026-11-04 reviewers**; whether they were independent; their inputs and dates; the procedure they followed (display, magnification, decoded-versus-source comparison, whether they saw wording); their per-row verdicts; and whether any review preceded the wording. | This is the review claim in E17. Nothing checked in supports it. |
| U5 | Whether the external ledger matches its pin `d1e307be…`, has 48 output rows, and carries the `saved-reviewed` status the trace relies on. | Unopened. Its content is the only record of the restyle outputs' provenance outside the registry. |
| U6 | Whether the identity importer's run (which reads the ledger, E5) used a ledger matching the pin. | The restyle lineage (E11) depends on it. The importer would refuse a mismatched ledger, but no run is recorded. |
| U7 | Whether the external PNG bytes today still match the recorded hashes. | The chain ends at files this trace did not open (Goal 244 §7). |
| U8 | Whether the HANDOFF finding "visually ambiguous forms … repeated motifs do not establish identity" applies per row. | The note wording is per row and has no per-row verdict record. |
| U9 | Whether the 2026-11-04 "dataset suite passes 5/5" and "validator exits 0" claims were run against the current tree. | Narrative only. They are not evidence for this contract (see the test-status limits in section 7). |

## 3. Proposed future procedure

> **PROPOSED — NEVER EXECUTED — NOT HISTORICAL EVIDENCE.** The steps below are a design for a future, separately authorized task. Nothing here was run, and none of it describes the 2026-11-04 run. Its expected counts are predictions to be tested, not records. Do not cite this section as proof of any past invocation.

Preconditions (all must hold before the corresponding step):

- P0a. Decision D2 in section 5 is recorded as authorized before P2 or P5, because those steps read external PNG bytes under `{external-workspace}/`. D1 is not required for this importer dry-run; D3 is a separate visual-review authorization and is not used by this procedure.
- P0b. The owned-file worktree is clean. Record `git rev-parse HEAD`, the registry SHA-256 (`c3559a37…` at `80e9a302`, to be re-checked), and the sidecar SHA-256 (`e1eb125f…`).
- P0c. The procedure is run from a fresh directory outside the repository for any scratch file. No `--write` flag is ever used.

Steps:

- P1. Copy the registry to a scratch path outside the repository. Hash the copy and the original; they must match.
- P2. Dry-run the generic importer against the copy, with every argument explicit and recorded: `python -I tools/import_cok_visual_description_dataset.py --registry <scratch copy> --dataset docs/engine/research/cok-dos-tiles-001-visual-descriptions-v1.json --package-root <recorded path>`. Record the exit code and the full JSON output verbatim, and the start and end times.
- P3. Verify that the checked-in registry, the copy and the sidecar are unchanged after the run (SHA-256 before and after).
- P4. Compare the output with the 48-ID roster. Expected, as a prediction only: `rows` 48, `uniquePixelGroups` 48, `verifiedPreviewFiles` 48, `unresolvedRows` 0. Any other value is a finding, recorded as is.
- P5. Negative control: copy the sidecar to scratch, change one `sourceSha256` to a different valid hash, and dry-run against the same registry copy. The importer must reject the row. This control reads the same external PNGs, so it is covered by D2.
- P6. Record the commands, dates, exit codes, hashes and outputs in a new checked-in note. The note must say that it documents a **new** run and does not establish what happened on 2026-11-04.

Not part of this procedure: the external ledger (read separately under D1; see section 10), visual review of the images (D3), any registry or sidecar write, any change to the 48 notes, and any importer edit.

## 4. Evidence needed to support or qualify the 2026-11-04 review claim

The HANDOFF claim (E17) is supported only if the following are recorded in a checked-in location. Each item is a precondition for the claim to be called **reviewed by record**.

| Item | Required content |
| --- | --- |
| R1 Reviewers | Stable reviewer labels, the role of each, whether the two were independent, and the date of each review. Names are recorded only if the user approves. |
| R2 Inputs | The sidecar SHA-256 as it was at review time; the registry SHA-256 at review time; each of the 48 source PNG SHA-256 values and decoded 24×24 pixel SHA-256 values. Hashes are sufficient; no image is stored. |
| R3 Procedure | How each image was displayed (native or magnified, background handling), what was compared (source, decoded pixels, or both), and whether reviewers saw the `visualDescription` wording (blinded or not). |
| R4 Per-row verdicts | One row per ID (48), each with reviewer A verdict, reviewer B verdict, agreement, and the vocabulary used. |
| R5 Reconciliation | How disagreements, if any, were resolved, and by whom. |
| R6 Ordering | Whether the review preceded the description text, and when the wording was written. |
| R7 Importer run | The command and output for the run HANDOFF reports (this overlaps U1; the claim cannot be closed without it, but it does not need to be reconstructed from HANDOFF text). |
| R8 Storage | The review record in a checked-in path, with its own SHA-256. No external-only evidence. |
| R9 Limits | The scope stated plainly: 24×24 decoded size, ambiguity of marks, no identity or game-use claim, and what the reviewers were not asked to judge. |

Outcomes:

- **All of R1–R9 recorded and every per-row verdict agrees with its wording:** the claim may be recorded as reviewed by record, for the scope in R9. The notes stay unchanged.
- **Some items recorded:** the claim is qualified in HANDOFF to name the missing items. It is not called reviewed.
- **Any row contradicted by a verdict:** that row's citation or wording needs a correction in its own task. This contract does not make that change.
- **Nothing recorded (the current state):** the "reviewed" template wording stays as importer text, and the claim is recorded as unsupported. Correcting the template is a separate importer and registry change, with its own task.

## 5. Decisions required before reading the external ledger or doing visual review

These are the user's decisions. None is made here. The defaults are recommendations only and do not authorize anything.

| ID | Decision | Recommendation |
| --- | --- | --- |
| D1 | **Ledger read.** Authorize opening `{external-workspace}/cok_restyle_work/dos_tiles_001_48_provenance.json` read-only. Also decide what may be recorded: hash and roster count only, or contents. | **Resolved 2026-11-14 (section 10).** Authorized as a read-only hash check and roster count against `d1e307be…` and the 48 IDs, recording only the hash, counts and mismatches. Ledger contents were not copied into the repository. Original recommendation: Authorize a read-only hash check and roster count against `d1e307be…` and the 48 IDs. Record only the hash, counts and mismatches. Do not copy ledger contents into the repository. |
| D2 | **External image bytes.** Authorize reading the `{external-workspace}/` PNG bytes for hash checks (the importer dry-run in §3 and the negative control P5). This is separate from visual review. | Authorize byte-hash reads only, with no display. Record hashes and results. |
| D3 | **Visual review of the 48 images.** Authorize separately, after D1 and D2. Decide the reviewers (new, independent, recorded), the verdict vocabulary, and the storage rule. | Use new independent reviewers. Store verdicts and hashes only, not images, derivatives or copied description text, because the source art is copyrighted game material (see D5). |
| D4 | **Disposition of the 2026-11-04 claim.** Choose: record it (needs §4 items), qualify it, or retract it. Correcting the "reviewed" template is a separate importer and registry task. | Keep the claim marked unsupported until §4 is met. Do not edit the 48 notes in any slice that only documents. |
| D5 | **Tracked `Champions of Krynn/TILES.DAX` and the other 106 tracked files.** `docs/engine/ORCHESTRATION.md` forbids committing copyrighted assets, yet `git ls-files` lists them (E19). Options include untracking them going forward while keeping the local copies, a recorded owner exception, or another policy. Any history rewrite is a separate, explicit decision. | User decision. **Not changed in this slice; not altered by this contract.** Recorded here as an unresolved decision, and it blocks no metadata work. It also does not authorize D3's image storage. |
| D6 | **Order and scope.** Whether D1, D2 and D3 are granted together or separately, and whether §3 runs before or after the review. | Grant D2 first (it covers the §3 dry-run). Run §3 before D3 so the review inputs are fixed by hash. |

P2 and P5 may run only after D2 is authorized. The external ledger may be opened only after D1 is authorized; visual review may begin only after D3 and its stated preconditions are authorized. These permissions are independent.

## 6. Correction to the Goal 244 next-step wording

Goal 244 said, in its §8 and in the tracker entries: "Record the importer invocation … in a checked-in note", "record the invocation", and "visual review … only after steps 1 to 3". That wording makes the 2026-11-04 invocation a prerequisite. It is not one, and it cannot be honestly reconstructed from checked-in evidence (U1). Reconstructing it, from the HANDOFF output keys or by re-running the importer, would present inference or a new run as the historical record.

Corrected order, replacing Goal 244's list:

1. **Do not reconstruct the 2026-11-04 invocation.** Record its status as unknown (U1–U2), as this note does.
2. **Record decisions D1–D6** (section 5), with the user's answers.
3. **Only if D2 is granted,** run the §3 procedure as a new, recorded task. It documents a new run and does not establish the old one.
4. **Settle the claim** under section 4 (D4), or leave it unsupported.
5. **Visual review (D3)** needs its own image authorization and a recorded procedure. It does **not** wait on the historical invocation. It waits on D1–D3 and the §4 record for the review itself.

Goal 244's report §8 has been annotated in place with this correction, and so have the tracker entries (section 8 below).

## 7. Limits

- Recorded consistency only. The 48 citations, hashes and wording agree with each other. That shows the records are consistent, not that a description depicts its art, that a review occurred, or that a tile has a game use.
- No image, archive or game-data file was opened. The external ledger was read once under D1 (section 10). The external PNG hashes (U7) remain unverified.
- Test status: the 2026-11-04 test and validator claims (E17) were not re-run. This contract runs no tests, and it claims no test result.
- Goal 243 remains unaccepted (validator on the checked-in registry, its tests, negative fixtures and the release-source gate are all deferred).
- No claim of complete, quality or game-use coverage is made.

## 8. Holds preserved

No test, typecheck, build, Vite, browser or app launch. No importer, validator or reader run. No image, restyle output, archive or game-data read. The external ledger was read once under D1 (section 10). Registry, sidecar, statuses, relationships, importer and validator source, app source and pins unchanged. Committed and pushed as `4665f7d3166445608542699573aa995744f5a292` (verified on local `origin/master`). Preserved: browser acceptance of Goals 216–245; the Vite `spawn EPERM` no-retry hold; phase 3–4 acceptance; the F2 ECL data read; F3 scope; build and deploy. The D5 observation on tracked copyrighted files is recorded as an open decision and not altered.

## 9. Next recommended task

*Update 2026-11-14: D1 is resolved (section 10). The remaining decisions are D2 (external PNG byte reads), D3 (visual review), D4 (claim disposition) and D5 (tracked copyrighted files); D6 follows from the answers to D2 and D3.*

Original text (before the D1 update): obtain the user's decisions **D1–D3** (section 5). D1 authorizes only the ledger metadata check. D2 alone authorizes the §3 importer dry-run and its external PNG byte-hash reads; that is a new run and not historical evidence. D3 separately authorizes visual review, subject to the recorded procedure. The recommendation is ledger metadata first, then the D2 dry-run, then decide whether to proceed with D3. D5 remains a separate tracking decision.

## 10. D1 ledger metadata record (2026-11-14)

**Authority and scope.** The user authorized the read-only D1 ledger check of `{external-workspace}/cok_restyle_work/dos_tiles_001_48_provenance.json`, on the recommended terms in section 5: a hash check and roster count, with only the hash, counts and mismatches recorded. The coordinator opened and parsed the file once under that authority. This slice did not reopen or read it. Ledger contents are not copied into the repository and are not reproduced here.

**Results (as reported by the coordinator; not re-derived in this slice):**

| Check | Result |
| --- | --- |
| File size | 20,120 bytes |
| SHA-256 | `d1e307beb41b80725727e9371e17d1aa701be0e1f55e85b51dc6239c4f66d359`; equals the importer pin `LEDGER_SHA256` (`tools/import_cok_dos_tiles_001_registry.py:33`) |
| JSON | Parses as valid JSON |
| Output rows | 48 |
| Global indexes | 48 unique |
| Block/tile roster | 26 block-1 and 22 block-2 IDs; exactly the 48 Goal 244 IDs; 0 missing, 0 extra |
| Source/output naming and global-index mapping | 48 of 48 consistent |
| Declared block counts | 26 (block 1) and 22 (block 2) |
| Status | All 48 rows have status `saved-reviewed` |
| Per-row fields | No per-row `review`, `reviewer`, `verdict`, `evidence` or `reviewed_at` field in any row |
| Top-level | One top-level review narrative exists. Its text is not reproduced here and is not relied on as evidence |
| Output size | Each output is 96×96 |

**What these results establish.** The ledger matches its pin, parses, and is internally consistent with the 48-ID roster, its declared block counts and its global-index mapping. For U5, the pin match, the 48 output rows and the `saved-reviewed` status are now answered. The status is a string in the ledger. It is not a per-row review record.

**What they do not establish.** They do not show that any review occurred, that reviewers were independent, or that any description matches its image. They do not verify the source archive or source PNG bytes. They do not establish the 2026-11-04 importer invocation (U1), or that the identity importer used this ledger (U6). Ledger provenance beyond these checks was not assessed.

**Effect on this report.** The E5 "not opened" entry and the §7 limit on the ledger are superseded as noted above. U1–U4, U6–U9 and the review claim (E17, §4) are unchanged. No image, PNG, archive or game-data file was opened, and no PNG byte read was authorized or performed. Decisions D2–D5 remain open; D6 is unresolved. Goal 243 remains **unaccepted**.

**Holds.** No test, typecheck, build, Vite, browser or app launch; no importer, validator or reader run; no registry, sidecar, status, relationship, importer, validator or pin change; no commit or push.
