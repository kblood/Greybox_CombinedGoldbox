# CoK DOS TILES.DAX visual-description provenance trace (2026-11-14)

Goal: [CoK full implementation goal](cok-full-implementation-goal-2026-11-09.md), entry 244, a docs-only metadata provenance trace. It follows Sol's Goal 241 recommendation, item 7 of the repair queue in section 11 of the [Goal 241 audit](cok-visual-description-evidence-chain-audit-2026-11-14.md) (`cok-dos-tiles-001` provenance, 48 citations). Status: **DONE for the metadata provenance trace**. Not committed or pushed (the assignment forbids it). No test, typecheck, build, Vite, browser, app launch, importer run or validator run. No image, restyle output, archive or external ledger was read. An initial recursive search traversed untracked game-data folders before being stopped; its extent of file-content reads is uncertain, and its output was not used. No registry, sidecar, status, relationship, app source or pin was changed.

This is **not** a visual review. It does not show that any description matches the art, that the cited render is the depicted object, that any review took place, or that the tile has game use. It gives no complete or quality score.

## 1. Identities and inputs

| Item | Value |
| --- | --- |
| Roster | 48 IDs: `cok/dos-ega/tiles.dax/block/1/tile/0`..`25` (26) and `block/2/tile/0`..`21` (22) |
| Registry | `docs/engine/research/cok-graphics-identity-registry-v1.json`, read as JSON (not rewritten) |
| Sidecar | `docs/engine/research/cok-dos-tiles-001-visual-descriptions-v1.json`, 46,572 bytes, SHA-256 `e1eb125f38006fed35c89aca092c1133f469203bb7c887ddc726d5b390bbce2d`, 48 rows, read as data |
| Archive pin | `TILES.DAX` SHA-256 `9e383adc1638e6202726df41a8c42640e446a17c8a9c1e9df45b8ba0d478b205` (importer constant; equal in all 48 registry records) |
| Ledger pin | `dos_tiles_001_48_provenance.json`, SHA-256 `d1e307beb41b80725727e9371e17d1aa701be0e1f55e85b51dc6239c4f66d359` (importer constant). The file is outside the repository at `{external-workspace}/cok_restyle_work/`. **Not opened.** The reader tests only that the path exists (it does on this machine). Its hash was not checked. |
| Importers | `tools/import_cok_dos_tiles_001_registry.py`, `tools/import_cok_visual_description_dataset.py`, `tools/test_import_cok_dos_tiles_001_registry.py` (read as text; not run) |
| Bundler | `apps/web/scripts/bundle-cok-dos-tiles-001-previews.mjs` and `apps/web/test/bundle-cok-dos-tiles-001-previews.test.mjs` (read as text; not run) |
| Git history | `git log --follow` per path, and a path-limited `-S` search of the registry for the sidecar digest prefix |

## 2. Method

The reader in Appendix A is stdlib-only Python and is run as `python -I <reader> <repo_root>`. It needs `git` on the path. It reads the registry, the sidecar bytes and the importer and bundler sources, and calls `git log`. It prints identifiers, counts, hash values, boolean checks and note templates with hash values masked. It prints no `visualDescription` text and no note body. It opens no image, archive, restyle output or game-data file. The captured output is Appendix B.

For each of the 48 IDs the reader checks the chain: one registry asset; one sidecar row; one sidecar-form `visual-review` citation (`docs/engine/research/cok-dos-tiles-001-visual-descriptions-v1.json#<id>`); the source and pixel hashes in the sidecar row, the registry `decoded` record and the citation note; the wording in the row and in the registry; the dataset digest in the note; the sidecar evidence reference; and the restyle record that links to the same source.

## 3. Results: reference chain and recorded hashes

Each check was run on all 48 IDs. All 48 pass every check, with no mismatch.

| Check | Result |
| --- | --- |
| Sidecar rows: one per ID, no rows outside the roster | 48 / 48 |
| Registry asset: one per ID, locator block and tile match the ID | 48 / 48 |
| Registry citation: exactly one sidecar-form `visual-review` item per ID | 48 / 48 |
| Sidecar `sourceSha256` = registry `decoded.sha256` | 48 / 48 |
| Sidecar `pixelSha256` = registry `decoded.pixelSha256` | 48 / 48 |
| Note `source PNG SHA-256` = sidecar `sourceSha256` | 48 / 48 |
| Note `decoded pixel SHA-256` = sidecar `pixelSha256` | 48 / 48 |
| Note `dataset SHA-256` = current sidecar bytes (`e1eb125f…`) | 48 / 48 |
| Registry `visualDescription` = sidecar row wording (string equality, not printed) | 48 / 48 |
| Registry `decoded.path` = `external-source/<sha>.png`; 24×24 | 48 / 48 |
| Registry archive SHA-256 = pinned `TILES.DAX` SHA-256 | 48 / 48 |
| Sidecar evidence: one `visual-review` item, reference = `{external-workspace}/cok_restyle_work/dos_tile_render/TILES/TILES_<b>/TILES_<b>_tile_<t>.png` (3-digit padding) | 48 / 48 |
| Sidecar note contains "visible appearance only" and "does not infer" (the importer's required limit words) | 48 / 48 |
| Restyle record `restyle/cok-dos-tiles-001-<b>-<t>`: links source; ledger reference `#outputs/<global index>`; one `raw-generation` output; prompt status `unknown` | 48 / 48 each |

Other recorded facts:

- **Dataset digest.** All 48 notes carry the same `dataset SHA-256` value, and it equals the sidecar's current bytes. Git shows one commit for the sidecar (section 5), so the bytes have not changed since that commit. This shows the bytes were not changed after the digest was recorded. It does not show how the import was run.
- **Note template.** One template for all 48, with the hashes masked: "Visible appearance reviewed against exact source PNG SHA-256 `<sha256>` and decoded pixel SHA-256 `<sha256>`; dataset SHA-256 `<sha256>`. Subject identity, game use, selector, and playback semantics are unproven." The word "reviewed" is fixed text from the generic importer (section 4.2), not a record of a review.
- **Wording.** 48 distinct `visualDescription` strings for 48 rows. Each row has its own pixel hash: 48 distinct `pixelSha256` values, none shared with a registry source outside the 48. There is no cross-group wording conflict to check here.
- **Recorded status.** Registry `description.status` is `unknown` for all 48. All 48 `gameConsumers` statuses are `unknown`.
- **Scope.** The sidecar's `scope` says "Source-reviewed visible-appearance descriptions" and "Tile subject and selector semantics remain unknown." The scope is a dataset-level claim with no procedure attached.
- **Source-PNG identity.** The `decoded.path` is a repository-relative placeholder (`external-source/<sha>.png`). No such file is tracked. The PNG bytes sit at the external `{external-workspace}/` path, which this trace did not open. The importer checked those bytes at import time (section 4.2). That check is not repeated here.

## 4. Producers and procedures in checked-in source

### 4.1 Identity import: `import_cok_dos_tiles_001_registry.py` (commit `1d08d171`)

Dry-run by default. It pins the archive and ledger hashes and checks the ledger roster, and it decodes the TILES.DAX blocks #1 and #2. For each ledger row it checks the 96×96 source render against the decoded native 24×24 EGA pixels. It writes the 48 source records (`decoded` hashes and dimensions, `identityStatus: source-pinned`), each with a placeholder description ("depicted content and game role are not established", status `unknown`), placeholder consumers and a `_restyle` record. Its merge keeps an existing `description` and `gameConsumers` on re-run. It does **not** write `visualDescription`, `visual-review` evidence or the sidecar path. The reader confirms that the file does not name the sidecar.

### 4.2 Description and citation: `import_cok_visual_description_dataset.py` (commit `1d08d171`)

This is the generic dataset applier. Its default dataset is `cok-small-picture-visual-descriptions-v1.json`, so the tiles dataset must have been passed with `--dataset`. For each row it:

1. requires `sourceSha256` and `pixelSha256` to equal the registry `decoded` fields, and a non-empty `visualDescription`;
2. rejects conflicting wording for identical pixels, and wording that conflicts with a pixel-identical registry source;
3. requires exactly one `visual-review` evidence item whose note contains "visible appearance only" and "does not infer";
4. for a `{external-workspace}/` reference, reads the PNG, checks its file SHA-256, resizes it nearest-neighbour to the decoded size and checks the pixel SHA-256;
5. writes `visualDescription` and an evidence item with the fixed note template in section 3.

Step 4 is the only check of image bytes in this chain. It ran (or would run) on the external PNGs, not on anything in the repository. The 2026-11-04 HANDOFF entry says the importer reported "48 rows, 48 unique pixel groups and 48 verified previews". Those three keys are the importer's output keys, which corroborates that a run happened. It does not record the command. The invocation (dataset path, date, registry state) is not in checked-in source, the test suite or any tracked note.

### 4.3 Bundler: `bundle-cok-dos-tiles-001-previews.mjs` (commit `e3b75fae`)

It validates the archive and ledger pins and the restyle metadata, and copies the 96×96 **restyle output** PNGs to `restyle/cok-generated/images/<sha256>.png`. It does not read the sidecar, the `visualDescription` text or the source PNGs' review evidence. The reader found no reference to `visualDescription` or to the sidecar. Its test follows the same scope.

### 4.4 Not provenance for the 48: `cok-dos-tiles-decode-receipt-v1.json` (commit `1d08d171`)

Despite its name, this receipt covers the 1,693 8×8 tiles of the `8X8D1/2/3` archives (`tileCount` 1693). It has no TILES.DAX entry, and `tools/import_cok_dos_tiles_registry.py` (a different importer) is its writer. It is not provenance for the 48 TILES.DAX citations.

### 4.5 Review claims with no checked-in record

HANDOFF (2026-11-04) says "two independent read-only reviews examined all 48 exact source PNGs" and reports that they "agree". No tracked file records those reviews: no reviewer output, procedure or verdict file exists. A `git grep` for `dos_tile_render`, `TILES_001_tile` and `dos_tiles_001` in tracked files finds only the sidecar, the importers, the bundler and tests, the registry, the GOAL and HANDOFF prose, the Goal 240 and 241 audits, and the 2026-11-04 worktree ledger. The "reviewed" wording in the notes therefore reflects the importer template and the HANDOFF narrative. It is not corroborated by a checked-in review.

## 5. Git history (path-limited)

| Path | Commits | Date | Subject |
| --- | --- | --- | --- |
| `docs/engine/research/cok-dos-tiles-001-visual-descriptions-v1.json` | `1d08d171` | 2026-11-06 | research: preserve graphics identities, descriptions and consumer tooling |
| `tools/import_cok_dos_tiles_001_registry.py` | `1d08d171` | 2026-11-06 | same |
| `tools/test_import_cok_dos_tiles_001_registry.py` | `1d08d171` | 2026-11-06 | same |
| `tools/import_cok_visual_description_dataset.py` | `1d08d171` | 2026-11-06 | same |
| `apps/web/scripts/bundle-cok-dos-tiles-001-previews.mjs` | `e3b75fae` | 2026-11-06 | build: preserve local and hosted Restyle packaging work |
| `apps/web/test/bundle-cok-dos-tiles-001-previews.test.mjs` | `e3b75fae` | 2026-11-06 | same |

- The sidecar was **untracked** on 2026-11-04 (`??` in `docs/engine/research/greybox-release-worktree-ledger-2026-11-04.md`), the date HANDOFF gives for the import. It was first committed in `1d08d171` on 2026-11-06. That commit is a broad recovery checkpoint whose message says it does not assert runtime or release acceptance. It has no provenance text for the TILES procedure.
- The digest prefix `e1eb125f38006fed` occurs in the registry in one commit, `1d08d171`. The citation string `cok-dos-tiles-001-visual-descriptions-v1.json` also entered only in `1d08d171`. No later commit changed the registry's count of either string.
- The importers and the bundler have no later commits on these paths.
- An unrestricted `-S` search across all refs also matches a docs-only commit (`cd11b2ee`) and some `t3` checkpoint refs for the ledger file name. Neither changes the importer, bundler, sidecar or registry paths, so they are not in the chain.

## 6. Goal 241 item 7: status

**Dated correction — 2026-11-14 (Goal 245 D1).** The statement below that the ledger read
was not done describes the state when this Goal 244 trace was written. The user later
authorized a bounded read-only hash, parse and roster check. The coordinator performed that
check once; results and limits are recorded in the [review-provenance contract](cok-dos-tiles-001-review-provenance-contract-2026-11-14.md). The
ledger SHA-256 matches its importer pin and the 48-row roster matches. This does not validate
the historical review claim or any image bytes. No PNG was read. The reader and captured
output in this report remain the original Goal 244 run and were not rerun for D1.

The Goal 241 gate was "history and ledger read". Its state now:

- **History read: done.** The 48 citations and the sidecar rows came from `1d08d171`, with the identities from the same commit. The generic importer is the checked-in writer of the `visual-review` citations and the `visualDescription` wording, with its invocation for this dataset unrecorded. The identity importer is the writer of the source records and restyle lineage. Neither importer names the sidecar as a default or a constant.
- **Ledger read: done later under D1, not by this trace's reader.** The external ledger is outside the repository. The bounded D1 check verified its pin and roster; it did not establish that a review occurred or validate image bytes.
- **Review procedure: still unrecorded.** The 2026-11-04 reviews are narrated in HANDOFF but not recorded in checked-in source. The "reviewed" wording is a fixed importer template. Item 7's stated outcome, "identify the producing tool and record it", is partly met: the tool is identified, and the record is this report. The part still open is the procedure that the note's review claim describes.

So the visual review of the 48 (VR-6 in the Goal 241 sample plan) still waits on a recorded procedure and its own authorization, as Goal 241 stated.

## 7. Limits

- Metadata only. Agreement of identifiers, hashes and wording shows recorded consistency, not that a description depicts its art or that a review occurred.
- The chain to the source PNG bytes passes through a hash the importer checked at import time, against files at the external `{external-workspace}/` path. This trace did not open them, so it cannot re-verify that the current files match the recorded hashes.
- The ledger is outside the repository. It was read once later under D1; its pinned hash and roster were verified. That check does not validate the review claim or source PNG bytes.
- The importer invocation for this dataset is not recorded in checked-in source. The 2026-11-04 HANDOFF output keys corroborate a run; they do not show which command was run or on what registry state.
- The sidecar has one commit, so "unchanged since import" rests on the digest in the notes matching the current bytes. Git shows that the bytes were committed once and not edited afterwards. It does not show how they were produced.
- The importers were read, not run. The validator was not run.
- No claim about game use, selector, playback, consumer or runtime behaviour. The registry records all 48 consumer statuses as `unknown`.

## 8. Next steps (not performed here)

**Correction (Goal 245, 2026-11-14):** the list below originally made the historical importer invocation a prerequisite. It is not one, and it cannot be reconstructed from checked-in evidence. The corrected order is in [cok-dos-tiles-001-review-provenance-contract-2026-11-14.md](cok-dos-tiles-001-review-provenance-contract-2026-11-14.md) §6: record decisions D1–D6 first; any importer dry-run is a new, separately authorized, recorded procedure (proposed there, never executed); visual review does not wait on the historical invocation.

1. ~~**Record the importer invocation**~~ (superseded). The 2026-11-04 invocation stays **unknown** (Goal 245 U1). Do not reconstruct it from the HANDOFF output keys or by re-running the importer.
2. ~~**Decide whether to open the external ledger**~~ (resolved under Goal 245 D1; see the dated correction in §6 and the detailed result in that report's §10).
3. **Record or retract the 2026-11-04 review claim.** Either add the procedure and the review outputs to a checked-in record (Goal 245 §4), or correct the template wording in a separate importer and registry change, which needs its own task. Do not change the 48 notes in this trace.
4. **Visual review of the 48 rows (VR-6)** only after the decisions are recorded (Goal 245 D3), with separate image authorization and a recorded review procedure. It does not depend on item 1.

## 9. Observation outside this task

`git ls-files` lists 107 tracked files under `Champions of Krynn/`, including `Champions of Krynn/TILES.DAX` (blob `f068eb89…`). `docs/engine/ORCHESTRATION.md` says not to commit or distribute copyrighted assets and to keep game-data directories as read-only local source. The tracking conflicts with that rule. This trace did not change it. It needs a user decision, and it is recorded here so it is not lost.

## 10. Holds preserved

No test, typecheck, build, Vite, browser or app launch. No image, restyle output, archive or external ledger was opened. An initial recursive search traversed untracked game-data folders before it was stopped; its extent of file-content reads is uncertain. No importer or validator run. Registry, sidecar, statuses, relationships, app source and pins unchanged. Goal 243 acceptance remains deferred. Browser acceptance of Goals 216–244, the Vite `spawn EPERM` no-retry hold, phase 3–4 acceptance, the F2 ECL data read, F3 scope, build and deploy remain held. Nothing is committed or pushed.

## Appendix A. Reader script (verbatim)

Save as `tiles001_provenance_reader.py` and run `python -I tiles001_provenance_reader.py <repo_root>` from any directory.

```python
#!/usr/bin/env python3
"""Goal 244 metadata-only provenance reader for the 48 DOS TILES.DAX visual-description citations.

Stdlib only. Usage: python -I tiles001_provenance_reader.py <repo_root>

Reads, as text or JSON: the checked-in registry, the tiles-001 sidecar bytes, the importer and
bundler sources, and git history via `git log`. It opens no image, archive, restyle output or
game-data file, and it does not open the external provenance ledger; it only tests whether the
ledger path exists. It prints identifiers, counts, hash values, boolean checks and note templates
with hash values masked. It prints no visualDescription text and no note body.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

SIDECAR = "docs/engine/research/cok-dos-tiles-001-visual-descriptions-v1.json"
REGISTRY = "docs/engine/research/cok-graphics-identity-registry-v1.json"
IMPORTER_TILES = "tools/import_cok_dos_tiles_001_registry.py"
IMPORTER_GENERIC = "tools/import_cok_visual_description_dataset.py"
IMPORTER_TEST = "tools/test_import_cok_dos_tiles_001_registry.py"
BUNDLER = "apps/web/scripts/bundle-cok-dos-tiles-001-previews.mjs"
BUNDLER_TEST = "apps/web/test/bundle-cok-dos-tiles-001-previews.test.mjs"
LEDGER_EXTERNAL = "C:/GoldBoxImg/cok_restyle_work/dos_tiles_001_48_provenance.json"
HEX64 = re.compile(r"[0-9a-f]{64}")
EXPECTED_IDS = [f"cok/dos-ega/tiles.dax/block/1/tile/{i}" for i in range(26)] + \
               [f"cok/dos-ega/tiles.dax/block/2/tile/{i}" for i in range(22)]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(root: Path, *args: str) -> str:
    out = subprocess.run(["git", "-C", str(root), *args], capture_output=True, check=True)
    return out.stdout.decode("utf-8", "replace")


def source_path(block: int, tile: int) -> str:
    return f"C:/GoldBoxImg/cok_restyle_work/dos_tile_render/TILES/TILES_{block:03}/TILES_{block:03}_tile_{tile:03}.png"


def main() -> int:
    root = Path(sys.argv[1]).resolve()
    sidecar_bytes = (root / SIDECAR).read_bytes()
    sidecar_sha = sha256(sidecar_bytes)
    sidecar = json.loads(sidecar_bytes.decode("utf-8"))
    registry = json.loads((root / REGISTRY).read_text(encoding="utf-8"))
    tiles_src = (root / IMPORTER_TILES).read_text(encoding="utf-8")
    generic_src = (root / IMPORTER_GENERIC).read_text(encoding="utf-8")
    bundler_src = (root / BUNDLER).read_text(encoding="utf-8")

    archive_pin = re.search(r'ARCHIVE_SHA256 = "([0-9a-f]{64})"', tiles_src).group(1)
    ledger_pin = re.search(r'LEDGER_SHA256 = "([0-9a-f]{64})"', tiles_src).group(1)
    ledger_path_default = re.search(r'LEDGER_DEFAULT = Path\("([^"]+)"\)', tiles_src).group(1)

    print("## Inputs")
    print(f"- sidecar `{SIDECAR}`: {len(sidecar_bytes)} bytes, SHA-256 `{sidecar_sha}`")
    print(f"- sidecar version {sidecar.get('version')}, rows {len(sidecar['assets'])}")
    print(f"- importer pins: archive `{archive_pin}`, ledger `{ledger_pin}`")
    print(f"- importer ledger default: `{ledger_path_default}`")
    print(f"- external ledger path exists on this machine (existence only; not opened): "
          f"{os.path.exists(LEDGER_EXTERNAL)}")
    print()

    reg_assets = {}
    for asset in registry["assets"]:
        reg_assets.setdefault(asset["id"], []).append(asset)
    rows = {}
    row_counts = Counter(row["assetId"] for row in sidecar["assets"])
    for row in sidecar["assets"]:
        rows.setdefault(row["assetId"], row)
    restyles = {}
    for restyle in registry["restyles"]:
        restyles.setdefault(restyle["id"], restyle)

    checks = Counter()
    templates = Counter()
    digest_values = Counter()
    wording_groups: dict[str, list[str]] = {}
    pixel_groups: dict[str, list[str]] = {}
    status_counts = Counter()
    consumer_counts = Counter()
    per_block = Counter()
    mismatches: list[str] = []

    for asset_id in EXPECTED_IDS:
        block = int(asset_id.split("/block/")[1].split("/")[0])
        tile = int(asset_id.rsplit("/", 1)[1])
        per_block[block] += 1
        ids_ok = True

        def check(name: str, ok: bool) -> None:
            nonlocal ids_ok
            checks[(name, bool(ok))] += 1
            if not ok:
                ids_ok = False
                mismatches.append(f"{asset_id}: {name}")

        check("sidecar row unique", row_counts[asset_id] == 1)
        check("registry asset unique", len(reg_assets.get(asset_id, [])) == 1)
        row = rows.get(asset_id)
        asset = reg_assets[asset_id][0] if asset_id in reg_assets else None
        if row is None or asset is None:
            mismatches.append(f"{asset_id}: missing row or asset")
            continue

        # Registry locator and archive pin.
        loc = asset["locator"]
        check("locator block/tile", loc.get("blockId") == block and loc.get("tileIndex") == tile)
        check("archive sha pinned", asset["archive"]["sha256"] == archive_pin)

        # Sidecar row: hashes against registry decoded fields.
        dec = asset["decoded"]
        check("sidecar sourceSha256 == decoded.sha256", row["sourceSha256"] == dec["sha256"])
        check("sidecar pixelSha256 == decoded.pixelSha256", row["pixelSha256"] == dec["pixelSha256"])
        check("decoded.path is external-source/<sha>.png",
              dec["path"] == f"external-source/{dec['sha256']}.png")
        check("decoded 24x24", dec.get("width") == 24 and dec.get("height") == 24)

        # Sidecar evidence: exactly one visual-review item, absolute source path, importer note rule.
        ev = row.get("evidence", [])
        rv = [e for e in ev if e.get("kind") == "visual-review"]
        check("sidecar one visual-review item", len(rv) == 1)
        if rv:
            check("sidecar reference = expected render path", rv[0]["reference"] == source_path(block, tile))
            note = rv[0].get("note", "")
            check("sidecar note limits claim (importer rule)",
                  "visible appearance only" in note.lower() and "does not infer" in note.lower())
            check("sidecar note contains no sha", not HEX64.search(note))

        # Registry description citation: exactly one sidecar-form visual-review item for this ID.
        target = f"docs/engine/research/cok-dos-tiles-001-visual-descriptions-v1.json#{asset_id}"
        cites = [e for e in asset["description"]["evidence"]
                 if e.get("kind") == "visual-review" and e.get("reference") == target]
        check("registry one sidecar-form citation", len(cites) == 1)
        if cites:
            note = cites[0]["note"]
            masked = HEX64.sub("<sha256>", note)
            masked = re.sub(r"(source PNG SHA-256 |decoded pixel SHA-256 |dataset SHA-256 )<sha256>",
                            r"\1<sha256>", masked)
            templates[re.sub(r"\s+", " ", masked.split(". Subject")[0])] += 1
            m_src = re.search(r"source PNG SHA-256 ([0-9a-f]{64})", note)
            m_pix = re.search(r"decoded pixel SHA-256 ([0-9a-f]{64})", note)
            m_ds = re.search(r"dataset SHA-256 ([0-9a-f]{64})", note)
            check("note source SHA == sidecar sourceSha256", bool(m_src) and m_src.group(1) == row["sourceSha256"])
            check("note pixel SHA == sidecar pixelSha256", bool(m_pix) and m_pix.group(1) == row["pixelSha256"])
            check("note dataset SHA == current sidecar bytes", bool(m_ds) and m_ds.group(1) == sidecar_sha)
            if m_ds:
                digest_values[m_ds.group(1)] += 1
        check("registry visualDescription == sidecar row wording",
              asset["description"].get("visualDescription") == row["visualDescription"])
        wording_groups.setdefault(row["visualDescription"], []).append(asset_id)
        pixel_groups.setdefault(row["pixelSha256"], []).append(asset_id)

        status_counts[asset["description"].get("status")] += 1
        for consumer in asset.get("gameConsumers", []):
            consumer_counts[consumer.get("status")] += 1

        # Restyle lineage (metadata only).
        rid = f"restyle/cok-dos-tiles-001-{block:03}-{tile:03}"
        rs = restyles.get(rid)
        check("restyle record exists", rs is not None)
        if rs is not None:
            check("restyle links source", asset_id in rs.get("sourceAssetIds", []))
            global_index = tile if block == 1 else 26 + tile
            refs = rs.get("externalReferences", [])
            check("restyle ledger ref index", any(r.get("reference", "").endswith(f"#outputs/{global_index}") for r in refs))
            check("restyle raw-generation output", any(o.get("role") == "raw-generation" for o in rs.get("outputs", [])))
            check("restyle prompt status unknown", (rs.get("prompt") or {}).get("status") == "unknown")

        if ids_ok:
            checks[("ALL_ID_CHECKS_PASS", True)] += 1

    print("## Roster")
    print(f"- expected IDs: {len(EXPECTED_IDS)} (block 1: {per_block[1]}, block 2: {per_block[2]})")
    print(f"- sidecar rows: {len(sidecar['assets'])}; distinct assetIds: {len(row_counts)}")
    print(f"- sidecar rows outside the 48 roster: {len(set(row_counts) - set(EXPECTED_IDS))}")
    print()

    print("## Per-ID check results (counts of True / False)")
    names = sorted({name for (name, _) in checks})
    print("| Check | True | False |")
    print("| --- | ---: | ---: |")
    for name in names:
        print(f"| {name} | {checks[(name, True)]} | {checks[(name, False)]} |")
    print()

    print("## Dataset digest and note templates")
    print(f"- sidecar SHA-256 `{sidecar_sha}`")
    print(f"- distinct `dataset SHA-256` values in citation notes: {len(digest_values)} "
          f"(occurrences {sum(digest_values.values())})")
    print("- note template (hashes masked):")
    for tpl, count in templates.items():
        print(f"  - {count} x `{tpl}`")
    print()

    print("## Wording and pixel groups (sidecar rows of the 48)")
    print(f"- distinct visualDescription strings: {len(wording_groups)} (48 rows)")
    print(f"- distinct pixelSha256 values: {len(pixel_groups)}")
    cross = []
    registry_pixel_index: dict[str, list[str]] = {}
    for asset in registry["assets"]:
        d = asset.get("decoded")
        if isinstance(d, dict) and d.get("pixelSha256"):
            registry_pixel_index.setdefault(d["pixelSha256"], []).append(asset["id"])
    for pix in pixel_groups:
        others = [i for i in registry_pixel_index.get(pix, []) if i not in EXPECTED_IDS]
        if others:
            cross.append((pix, others))
    print(f"- pixelSha256 values shared with a registry source outside the 48: {len(cross)}")
    print()

    print("## Registry status of the 48 (recorded, not reviewed)")
    print(f"- description.status: {dict(status_counts)}")
    print(f"- gameConsumers status: {dict(consumer_counts)}")
    print()

    print("## Writers and sources (checked-in text, read only)")
    gen_fn = [name for name in ("sidecar_chain", "apply_dataset") if name in generic_src]
    print(f"- generic importer `{IMPORTER_GENERIC}` default dataset is "
          f"`{re.search(r'DATASET_DEFAULT = ROOT / \"([^\"]+)\"', generic_src).group(1)}`")
    print(f"- generic importer writes the sidecar-form note: "
          f"{'dataset SHA-256' in generic_src and 'Visible appearance reviewed against' in generic_src}")
    print(f"- generic importer requires exactly one visual-review item per row: "
          f"{'expected exactly one visual-review evidence item' in generic_src}")
    print(f"- generic importer checks visualDescription wording against the registry: "
          f"{'dataset file/pixel hash or visualDescription mismatch' in generic_src}")
    print(f"- tiles-001 importer names the sidecar file: {'tiles-001-visual' in tiles_src}")
    print(f"- tiles-001 importer writes visualDescription or visual-review evidence: "
          f"{'visualDescription' in tiles_src or 'visual-review' in tiles_src}")
    print(f"- tiles-001 importer keeps existing description on re-run: "
          f"{'Keep already verified metadata' in tiles_src}")
    print(f"- tiles-001 importer names the ledger default `{ledger_path_default}`: "
          f"{'dos_tiles_001_48_provenance' in tiles_src}")
    print(f"- bundler reads the sidecar or visualDescription: "
          f"{'visual-descriptions' in bundler_src or 'visualDescription' in bundler_src}")
    print(f"- any tracked importer/bundler/test names the sidecar: "
          f"{any('tiles-001-visual' in (root / p).read_text(encoding='utf-8') for p in (IMPORTER_TILES, IMPORTER_TEST, BUNDLER, BUNDLER_TEST))}")
    print()

    print("## Git history (metadata)")
    for path in (SIDECAR, IMPORTER_TILES, IMPORTER_TEST, BUNDLER, BUNDLER_TEST, IMPORTER_GENERIC):
        log = git(root, "log", "--follow", "--format=%h %ad %s", "--date=short", "--", path).strip().splitlines()
        print(f"- `{path}`: {len(log)} commit(s)")
        for line in log[:6]:
            print(f"  - {line[:140]}")
    digest_hits = git(root, "log", "--format=%h %ad", "--date=short",
                      f"-S{sidecar_sha[:16]}", "--", REGISTRY).strip().splitlines()
    print(f"- registry commits containing the sidecar digest prefix `{sidecar_sha[:16]}`: {len(digest_hits)}")
    for line in digest_hits[:4]:
        print(f"  - {line}")
    print()

    print("## Mismatches")
    print(f"- count: {len(mismatches)}")
    for item in mismatches[:50]:
        print(f"  - {item}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

## Appendix B. Captured output

Captured from `python -I tiles001_provenance_reader.py {repo-root}` on the checked-in tree at `f99cf9d2` (no input changed by this task; the report and tracker files were the only edits).

```text
## Inputs
- sidecar `docs/engine/research/cok-dos-tiles-001-visual-descriptions-v1.json`: 46572 bytes, SHA-256 `e1eb125f38006fed35c89aca092c1133f469203bb7c887ddc726d5b390bbce2d`
- sidecar version 1, rows 48
- importer pins: archive `9e383adc1638e6202726df41a8c42640e446a17c8a9c1e9df45b8ba0d478b205`, ledger `d1e307beb41b80725727e9371e17d1aa701be0e1f55e85b51dc6239c4f66d359`
- importer ledger default: `C:/GoldBoxImg/cok_restyle_work/dos_tiles_001_48_provenance.json`
- external ledger path exists on this machine (existence only; not opened): True

## Roster
- expected IDs: 48 (block 1: 26, block 2: 22)
- sidecar rows: 48; distinct assetIds: 48
- sidecar rows outside the 48 roster: 0

## Per-ID check results (counts of True / False)
| Check | True | False |
| --- | ---: | ---: |
| ALL_ID_CHECKS_PASS | 48 | 0 |
| archive sha pinned | 48 | 0 |
| decoded 24x24 | 48 | 0 |
| decoded.path is external-source/<sha>.png | 48 | 0 |
| locator block/tile | 48 | 0 |
| note dataset SHA == current sidecar bytes | 48 | 0 |
| note pixel SHA == sidecar pixelSha256 | 48 | 0 |
| note source SHA == sidecar sourceSha256 | 48 | 0 |
| registry asset unique | 48 | 0 |
| registry one sidecar-form citation | 48 | 0 |
| registry visualDescription == sidecar row wording | 48 | 0 |
| restyle ledger ref index | 48 | 0 |
| restyle links source | 48 | 0 |
| restyle prompt status unknown | 48 | 0 |
| restyle raw-generation output | 48 | 0 |
| restyle record exists | 48 | 0 |
| sidecar note contains no sha | 48 | 0 |
| sidecar note limits claim (importer rule) | 48 | 0 |
| sidecar one visual-review item | 48 | 0 |
| sidecar pixelSha256 == decoded.pixelSha256 | 48 | 0 |
| sidecar reference = expected render path | 48 | 0 |
| sidecar row unique | 48 | 0 |
| sidecar sourceSha256 == decoded.sha256 | 48 | 0 |

## Dataset digest and note templates
- sidecar SHA-256 `e1eb125f38006fed35c89aca092c1133f469203bb7c887ddc726d5b390bbce2d`
- distinct `dataset SHA-256` values in citation notes: 1 (occurrences 48)
- note template (hashes masked):
  - 48 x `Visible appearance reviewed against exact source PNG SHA-256 <sha256> and decoded pixel SHA-256 <sha256>; dataset SHA-256 <sha256>`

## Wording and pixel groups (sidecar rows of the 48)
- distinct visualDescription strings: 48 (48 rows)
- distinct pixelSha256 values: 48
- pixelSha256 values shared with a registry source outside the 48: 0

## Registry status of the 48 (recorded, not reviewed)
- description.status: {'unknown': 48}
- gameConsumers status: {'unknown': 48}

## Writers and sources (checked-in text, read only)
- generic importer `tools/import_cok_visual_description_dataset.py` default dataset is `docs/engine/research/cok-small-picture-visual-descriptions-v1.json`
- generic importer writes the sidecar-form note: True
- generic importer requires exactly one visual-review item per row: True
- generic importer checks visualDescription wording against the registry: True
- tiles-001 importer names the sidecar file: False
- tiles-001 importer writes visualDescription or visual-review evidence: False
- tiles-001 importer keeps existing description on re-run: True
- tiles-001 importer names the ledger default `C:/GoldBoxImg/cok_restyle_work/dos_tiles_001_48_provenance.json`: True
- bundler reads the sidecar or visualDescription: False
- any tracked importer/bundler/test names the sidecar: False

## Git history (metadata)
- `docs/engine/research/cok-dos-tiles-001-visual-descriptions-v1.json`: 1 commit(s)
  - 1d08d171 2026-11-06 research: preserve graphics identities, descriptions and consumer tooling
- `tools/import_cok_dos_tiles_001_registry.py`: 1 commit(s)
  - 1d08d171 2026-11-06 research: preserve graphics identities, descriptions and consumer tooling
- `tools/test_import_cok_dos_tiles_001_registry.py`: 1 commit(s)
  - 1d08d171 2026-11-06 research: preserve graphics identities, descriptions and consumer tooling
- `apps/web/scripts/bundle-cok-dos-tiles-001-previews.mjs`: 1 commit(s)
  - e3b75fae 2026-11-06 build: preserve local and hosted Restyle packaging work
- `apps/web/test/bundle-cok-dos-tiles-001-previews.test.mjs`: 1 commit(s)
  - e3b75fae 2026-11-06 build: preserve local and hosted Restyle packaging work
- `tools/import_cok_visual_description_dataset.py`: 1 commit(s)
  - 1d08d171 2026-11-06 research: preserve graphics identities, descriptions and consumer tooling
- registry commits containing the sidecar digest prefix `e1eb125f38006fed`: 1
  - 1d08d171 2026-11-06

## Mismatches
- count: 0
```
