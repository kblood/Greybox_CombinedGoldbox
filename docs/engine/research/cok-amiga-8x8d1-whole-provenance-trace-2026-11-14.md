# CoK Amiga 8X8D1 whole-image provenance trace (2026-11-14)

Goal: [CoK full implementation goal](cok-full-implementation-goal-2026-11-09.md), entry 242, docs-only metadata trace recommended by Sol's Goal 242 review. It follows the [Goal 241 evidence-chain audit](cok-visual-description-evidence-chain-audit-2026-11-14.md), committed and pushed as `eb421a285c0ecb16ca53fb564d03bc2d88c63e8a` (verified on `origin/master`). Section 11 item 3 of that report left seven Amiga whole-image name mismatches for ledger tracing; this report performs that trace. Status: **DONE for the metadata provenance trace**. Committed and pushed as `6c912711d734b257a268675a8be330dd6a805055` (verified on local `origin/master`); docs only. No test, typecheck, build, Vite, browser or app launch was run. No image, restyle output, archive or game-data byte was read. The registry, the checked-in Restyle inventory, importer source and git history were read; the importers were not run.

This report traces recorded lineage and declared hash identity. It is **not** a visual review. It does not establish that any current PNG depicts its block accurately, that any description is correct, or that any block is used in the game. It gives no complete or quality score.

These seven records are **DAX candidate** identities: the Amiga disk-2 `8X8D1.DAX` archive copy, registered as whole-block images. They are distinct from the Amiga `.DAA` tile records, which this report does not read.

## 1. Inputs and identities

| Item | Value |
| --- | --- |
| Registry | `docs/engine/research/cok-graphics-identity-registry-v1.json`, SHA256 `c3559a37421d7cfed9285ada5f88c542edfac15049d6cff28bc81fd16fee46fb` (matches pinned value) |
| Restyle inventory | `docs/engine/data/cok-restyle-inventory-v1.json`, SHA256 `646ecab2e544e5002de41c04a23ac4bb4849ea5dfadce834455d1170e662c9a7` (no pin; 2,542 records; 24 carry `supersededSources`) |
| Checked-in ledgers | None. `dos_coverage.json` and the other ledgers named by the builder are not tracked. The inventory's alias records are the only checked-in copy of their entries |
| Inventory builder (source; not run) | `apps/web/scripts/bundle-cok-generated-inventory.mjs`. It reads ledgers from the external `{external-workspace}/cok_restyle_work` and has no `supersededSources` logic (0 matches) |
| Importers (source; not run) | `tools/import_cok_amiga_dax_tiles_registry.py` (Amiga twin rows); `tools/import_cok_dos_tile_block_previews_registry.py` (DOS whole-block rows, corrected preview, `--supersede-strip-decode`) |
| Git history (read) | `1d08d171` (2026-11-06) introduces the superseded hashes and the Amiga identities. `70b1eda6` (2026-11-11, goal 156) records the correction. `HEAD` on this line is `eb421a28` |
| Not read or printed | Image, restyle-output, archive and game-data bytes. The external `dos_render_all` source tree and the git-ignored `apps/web/dist-app-cok57/` package (`.gitignore` line 114; no tracked copy). Visual-review note text was compared by hash, not printed |

## 2. Method

The reader in Appendix A runs these steps for each of the seven registry rows, all from checked-in JSON or source text plus read-only `git`:

1. Pin the registry SHA256.
2. Take the row's single `visual-review` citation and extract its 64-hex filename hash.
3. Find the inventory `supersededSources` record with that `sourceSha256`. Require exactly one hit.
4. Compare the owning card's current `sourceSha256` with the registry `decoded.sha256`.
5. Compare the note's stated image and pixel hashes with the cited hash and the current `pixelSha256`.
6. Read the card's alias records and source provenance, and the DOS counterpart row.
7. Locate importer symbols by line number.
8. Read the registry and inventory at four revisions (`1d08d171`, `70b1eda6^`, `70b1eda6`, `HEAD`).

Appendix B is the captured output. Hashes are the only data in the tables below that come from the registry; visual-review note text is not reproduced.

## 3. Seven-row metadata provenance trace

### 3.1 Stable IDs and declared hashes

Each stable ID is `cok/amiga/disk2/8x8d1.dax/block/<N>/whole`. Dimensions are width x height in pixels. The "superseded" dimensions are the superseded inventory `sourceSize` divided by 4 (the recorded 4x render).

| Block | Cited SHA-256 (filename, superseded) | Current PNG SHA-256 (`decoded.sha256`) | Current pixel SHA-256 (`pixelSha256`) | Current dims | Superseded dims |
| ---: | --- | --- | --- | --- | --- |
| 11 | `edad9ea5bad39e307411aa5e77f8ce7f71e5776db8fcf1eb1a6df33270b538ba` | `edf4b5470c5c65a1b0708a19e698739a54969e7966472962a61abe61f7849de3` | `7d93eca33afb767d48e0851de36240a62c1ab1fa390c2c5d50bada5ad1e86317` | 16 x 280 | 16 x 281 |
| 12 | `0715496d586bc5ac5f00ffaa29c41a9b623c5e0646f290adfe46a02d2f55973a` | `1d695559c5ed12fc8ad3053a85c6bdbfcbc5bcd8d94ffa6764e2eaa9bf58f6bd` | `863851f16d94dbdfd562154df3a5f75b12a79a426445ab3485669ad436a81077` | 16 x 280 | 16 x 281 |
| 23 | `a974aee8f0a1e89e05eaafa8a1508cc43a081d12d6e30310805d76dfbd9a5e29` | `33523d50a571da261440aa0f6cd9a359964ce0823c4128f8759cd7902044cdba` | `65dbf5db7fd0bd415e0acb527b24a3e06df1c20368a3d470581305ed08366012` | 16 x 280 | 16 x 281 |
| 31 | `2d93fa8becb0e4776798df3d250e2e01e79c5c8e67af8fc940ef5b124289193c` | `ec1fec73bdd25f33308a12645047219f93804bfef219375f11a155c99139b338` | `ea832b59d2974c25429bce2d0d2ea3a38505a90be0e00ea6a4511779a38accec` | 16 x 280 | 16 x 281 |
| 32 | `c9a18b36c8664046e8d2c99cda53c772b83bcd1ce7fc04578743974a53a69bb3` | `a41abf174201ab28e2d54c2b562059c31723d8fdae73f3178577f506c6343a59` | `b538f371669817ddabdb81d8b1c43d81430f390742a332936a37dada85345f22` | 16 x 280 | 16 x 281 |
| 202 | `5b46081df65b426ff2cc248b3fadcd4578dd7bbc8bbc9cbe97d6a2b950d1a8f7` | `400eb00509e24539afd29b0a0f42145c829922ed4cc045b5457b4a4b86e5fda4` | `e8d6d1cfc15f83eddf7ae91dee434cd12e13b615e2fb9fdeffd5a78cafe34339` | 16 x 152 | 16 x 153 |
| 203 | `92f8e9328060c7951c4ba47b01bc764dadb6bdaefd6f318e5d4867fd46593920` | `591b0af6b3bca2cbe16e24c1dd1413e0a144386c909998a8617a2286542d5d82` | `09187d05053939d7420a3fee48c5e19d72d0c6faf4ecf06731fd7309a71c3088` | 16 x 184 | 16 x 181 |

All seven rows: the registry archive pin is `14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915`, `identityStatus` `source-pinned`, `description.status` `partial`, and the one `gameConsumers` record has status `unknown`.

### 3.2 Inventory record, superseded hit, alias and source provenance

| Block | Inventory record (0-based array index) | Superseded hit | Alias (ledger, entry, asset) | Source provenance | Card output SHA-256 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `asset-2005-cbc480fb499b` (2004) | `supersededSources[0]` of record 2004, dated 2026-11-11; `sourceSha256` equals the cited hash | `dos_coverage.json` #236, `8X8D1_011` | `dos_render_all/8X8D1/8X8D1_011.png` | `e5ef2fe4684193dc10b1ab0fe954cf52c220203b57db52aa068400a397bf1c0c` |
| 12 | `asset-1468-91b550c91aee` (1467) | `supersededSources[0]` of record 1467, 2026-11-11 | `dos_coverage.json` #237, `8X8D1_012` | `dos_render_all/8X8D1/8X8D1_012.png` | `b39496e74b7656e0c3aa04d9a26eaff462aef93cd209ac3f75e14e2d93432e54` |
| 23 | `asset-0311-1f50938320e5` (310) | `supersededSources[0]` of record 310, 2026-11-11 | `dos_coverage.json` #238, `8X8D1_023`; also #256, `8X8D3_023` (family 8X8D3, outside this trace) | `dos_render_all/8X8D1/8X8D1_023.png` | `489e5fe4923a911ad2629af8d312c9a3bdeac9c273e259b4416edff84734bfee` |
| 31 | `asset-0870-56124c127346` (869) | `supersededSources[0]` of record 869, 2026-11-11 | `dos_coverage.json` #239, `8X8D1_031` | `dos_render_all/8X8D1/8X8D1_031.png` | `db6400789ce9f2bc17fffbba9582c0e6f91f39acd2e6971d5e720745cc711367` |
| 32 | `asset-1366-877290b36843` (1365) | `supersededSources[0]` of record 1365, 2026-11-11 | `dos_coverage.json` #240, `8X8D1_032` | `dos_render_all/8X8D1/8X8D1_032.png` | `05ae6c676846619785dd04682f39680fd9de434e0097be9c3857944e8213bf12` |
| 202 | `asset-2075-d2053cbbdd43` (2074) | `supersededSources[0]` of record 2074, 2026-11-11 (old height 153, the minimum the importer accepts for supersession) | `dos_coverage.json` #241, `8X8D1_202` | `dos_render_all/8X8D1/8X8D1_202.png` | `da1fbfe9bebe9bbaba097b4aea65fd3c296e9724885a92b4e6d994c6910ccac9` |
| 203 | `asset-2274-e6b669edd788` (2273) | `supersededSources[0]` of record 2273, 2026-11-11 | `dos_coverage.json` #242, `8X8D1_203` | `dos_render_all/8X8D1/8X8D1_203.png` | `4a64cfd7d8ad344033b278908b701143e9c97b43e8e4def47610ed0561ed5d7c` |

Each superseded record has the same `reason` text: "DOS 8X8D whole-block was decoded as a 16-px strip; the block is a 2-per-row EGA tile array (docs/engine/research/cok-dos-whole-strip-decode-finding-2026-11-10.md). The outputSha256 below was made from the superseded render." Each cited hash occurs in no other inventory field (`sourceSha256`, `outputSha256`, or any other record), so each superseded hit is unique.

**Importer symbols (all seven rows).** `tools/import_cok_amiga_dax_tiles_registry.py`: `amiga_id_for` (line 50), `verify_identical_archives` (72), `make_amiga_asset` (167; deep-copies the DOS asset at 168, so the DOS `decoded-pixels` and `visual-review` evidence are carried over; appends the Amiga game-data evidence at 177; appends the Amiga-candidate sentence to each `visual-review` note at 186; sets `gameConsumers` `unknown` at 191). `tools/import_cok_dos_tile_block_previews_registry.py`: `decode_archives` (74), `inventory_pairs` (130; raises if a card's `sourceSha256` differs from the decoded hash, line 153), `_is_superseded_strip` (198), `_restate_description` (205; keeps `status` and `evidence`, changes only the strip wording), `merge_registry` supersede path (231) and Amiga-twin propagation (242), `--supersede-strip-decode` (304).

**Commits (all seven rows).** The cited hashes first appear in `1d08d171` (2026-11-06) and are superseded in `70b1eda6` (2026-11-11, "fix: re-decode DOS whole-block rows as EGA tile arrays (goal 156)"). That commit's message records: importer "supersede the strip decode, propagate to Amiga twins"; restyle inventory "relabel 24 cards to the corrected source render; old hashes kept as superseded". `make_amiga_asset` dates from `1d08d171`; the DOS previews importer's `_restate_description` and `_is_superseded_strip` date from `70b1eda6`.

## 4. Recorded lineage (what the repository records)

The registry and inventory at each revision (Appendix B, section E), prefix form:

| Revision | Registry `decoded.sha256` (prefix), block 11 | Registry dims, block 11 | Cards with `supersededSources` |
| --- | --- | --- | ---: |
| `1d08d171` | `edad9ea5bad3` | 16 x 281 | 0 |
| `70b1eda6^` | `edad9ea5bad3` | 16 x 281 | 0 |
| `70b1eda6` | `edf4b5470c5c` | 16 x 280 | 24 |
| `HEAD` | `edf4b5470c5c` | 16 x 280 | 24 |

The same pattern holds for blocks 12, 23, 31, 32, 202 and 203 (Appendix B, section E). At `1d08d171` and `70b1eda6^`, each inventory card's `sourceSha256` equals the superseded hash, and the registry `decoded.sha256` equals the same hash. At `70b1eda6` the card and registry move together to the corrected hash, and the old hash is kept in `supersededSources`. The DOS counterpart rows cite the same superseded hashes and carry the same decoded hashes as the Amiga rows at `HEAD` for all seven blocks (section 6.2); their own history was not traced.

## 5. Sol's leads: result

| Lead | Result | Evidence |
| --- | --- | --- |
| Each cited filename hash occurs in inventory `supersededSources` | Confirmed, 7 of 7 | Section 3.2; one hit each (Appendix B, table A) |
| Each current card `sourceSha256` equals registry row `decoded.sha256` | Confirmed, 7 of 7 | Section 3.1; Appendix B, table A |
| Aliases identify `dos_coverage.json` and `dos_render_all/8X8D1/...` | Confirmed, 7 of 7 | Section 3.2; Appendix B, table B. Block 23's card also has a `dos_coverage.json` #256 alias to `dos_render_all/8X8D3/8X8D3_023.png`, not traced here |
| `make_amiga_asset` copies DOS evidence and appends Amiga-candidate qualification | Confirmed by source, not run | Section 3.2 (lines 168, 177, 186). The DOS `visual-review` note is carried over with the superseded hash |
| Corrected-preview importer and `_restate_description` preserve prior evidence | Confirmed by source, not run | `_restate_description` (line 205) keeps `status` and `evidence`; the supersede path (231-236) takes the corrected `decoded` and keeps curated fields. The registry `visual-review` citations still name the superseded hashes at `HEAD` (Appendix B, table A) |
| Commit `70b1eda6` records the correction path | Confirmed by commit message and history | Section 3.2 and Section 4; the commit changed the registry, inventory, importer and nine files in total |

One constraint the source adds: `_is_superseded_strip` (line 198) allows supersession only when the old decode was 16 px wide with height at least 153. Block 202's old height was exactly 153, so it passes by the minimum.

## 6. Separation of claims

### 6.1 Recorded lineage

What the repository records, in order: the old decode at `1d08d171`; the importer symbols that copy and supersede it; the correction at `70b1eda6`; the superseded records and the alias records. These are checked-in strings and history. They show what was recorded and when. They do not show which external run produced the bytes.

### 6.2 Declared hash identity

- Seven cited-to-superseded equalities and seven current-to-registry equalities. All fourteen are string equalities between checked-in declarations, not comparisons of image bytes. The PNG bytes behind these hashes are external (`dos_render_all`) or git-ignored (`apps/web/dist-app-cok57/`), so they were not checked here.
- Amiga archive identity: every row declares the archive pin `14fd0bed...` and the note says the Amiga archive bytes equal the DOS archive. That is the importer's declared pin (`verify_identical_archives`, line 72, not run). The Amiga ADF extraction path (`{external-workspace}/batch03_work/...`) is external and was not read.
- The Amiga rows are twins of the DOS rows: the decoded object and the `visual-review` citation are identical for all seven (Appendix B, table B). They add identity, not independent evidence.

### 6.3 Unverified visual accuracy

- Each `visual-review` note says "Visible appearance only; reviewed against exact image SHA-256 ... and decoded pixel SHA-256 ...". The stated image hash equals the cited superseded hash in 7 of 7 notes (Appendix B, the note-hash table).
- The stated pixel hash equals the **current** `pixelSha256` in 0 of 7 notes. Each stated pixel hash is recorded alongside the superseded image hash, not the current one; this report cannot compute the pixels to say more.
- No checked-in record shows a review of the current PNGs. The review claim is recorded in the note text; this report does not verify that a review took place, what it examined or what it concluded.
- The current PNGs are whole-block 16 px wide, composed as 2-column EGA 8x8 tile arrays (`cok/amiga/disk2/8x8d1.dax/block/N/whole`). Whether that composition is the right reading for any tile, selector or game use is not tested. All seven `gameConsumers` records are `unknown`; no runtime consumer is recorded.

## 7. Producer and invocation

- **Superseded PNG bytes** (`images/<old>.png` and the `apps/web/dist-app-cok57/restyle/cok-generated/images/<old>.png` citations): producer and invocation unavailable. The source renders live outside the repository, and no checked-in tool writes a `dos_render_all` file; the references under `tools/` read or name it. The package directory is git-ignored and has no tracked copy.
- **Corrected PNGs and their registry rows** (`70b1eda6`): the DOS previews importer reads the external render and the package, validates hashes and writes records only when run with `--write` (`main`). The command line, the external roots and the environment used for `70b1eda6` are not recorded in the commit or the tree: producer invocation unavailable.
- **Amiga rows** (`1d08d171`): `make_amiga_asset` is the only creator; the run that wrote these rows is not recorded (the commit message is generic). Invocation unavailable.
- **Inventory** (`docs/engine/data/cok-restyle-inventory-v1.json`): the builder regenerates the inventory from external ledgers and cannot have written `supersededSources` (no such logic). The 24 `supersededSources` fields are checked-in data written in `70b1eda6`; the only record of how they were written is that commit's diff.
- **Ledger entries** `dos_coverage.json` #236 to #242 and #256: the ledger is not checked in, so the entry numbers are as recorded in the inventory and cannot be re-read from the repository.

## 8. Relation to Goal 241

- Goal 241 section 11 item 3 asked for the generator of seven Amiga whole-image names, from ledgers, with metadata only. The trace finds: the names are the superseded DOS whole-block render hashes; the Amiga rows took them by twin copy at `1d08d171`; and the aliases point to the DOS render ledger. The producer and invocation of the renders remain unavailable (section 7).
- The DOS counterpart rows (`cok/dos-ega/disk1/8x8d1.dax/block/{11,12,23,31,32,202,203}/whole`) cite the same superseded hashes and carry the same current decoded hashes (Appendix B, table B). This report does not re-tally Goal 241's 25 DOS-EGA rows, and does not re-check the "no sidecar row" statement for these seven, which is outside this trace.

## 9. Repair and review queue (none made)

1. **Current-PNG review or citation retirement.** The visual-review citations name superseded renders. A visual review of the current PNGs, or retirement of these citations, needs image authorization first. Gate: image authorization, then a registry task.
2. **Re-pointing citations.** Changing the registry `visual-review` citations from superseded to current hashes is a registry change in its own task. The registry was not changed here.
3. **Producer record.** If the external ledger and render generator can be identified, record their invocation in a checked-in note. Gate: an owner statement or a read of the external ledger's metadata, not image bytes.
4. **Ledger copy.** Decide whether the `dos_coverage.json` entries referenced by the inventory should be checked in, in a separate task.

## 10. Limits

- Equal strings show recorded consistency. They do not show byte or pixel identity. No comparison of pixels was made.
- The visual-review notes are claims in text. This trace checks their hash fields only and does not verify the review.
- The Amiga archive pin, and the claim that Amiga and DOS archive bytes are equal, are declared in the registry and importer. They were not checked.
- The importers were read, not run. The checks at `inventory_pairs` (line 153) and `verify_identical_archives` were not re-executed.
- Statements about history are about the repository at the named commits. External sources (`{external-workspace}/...`, the git-ignored package) are not part of the repository.
- `git log -S` finds commits where the number of occurrences of a string changes. It locates history; it does not prove which run wrote a value.
- The trace covers seven rows. It does not cover the 25 DOS-EGA rows of Goal 241, the other 8X8D1 blocks, the 8X8D3 alias on block 23, or any Amiga `.DAA` record.
- No complete or quality score is given. Counts here are not coverage.

## 11. Holds

No test, typecheck, build, Vite, browser or app launch. No image, restyle-output, archive or game-data read. Browser acceptance of Goals 216–242, the Vite `spawn EPERM` no-retry hold, phase 3–4 acceptance, the F2 ECL data read, F3 scope and build and deploy remain held. The registry, sidecars, inventory, tools, app source, statuses and relationships were not changed.

## 12. Reproduction (read-only, metadata only)

Run from any directory with the repository path as the argument:

```
python -I provenance_trace.py <repo_root> > out.md
```

The script is stdlib-only Python. It reads the registry and inventory JSON, the two importer sources, and `git log`/`git show` of the two JSON files at fixed revisions. It opens no image, restyle output, archive or game-data file, prints no visual description or evidence note text, and writes no file. Its git searches take about ten seconds in total. Appendix B is its captured output at `HEAD` `eb421a28` (this task changes none of its inputs).

## Appendix A. Reader script (verbatim)

```python
#!/usr/bin/env python3
"""CoK Amiga disk-2 8X8D1 whole-image provenance trace (goal 242): read-only, metadata-only.

Usage: python -I provenance_trace.py <repo_root>

Reads: the CoK graphics identity registry JSON (pinned SHA256 checked); the checked-in
Restyle inventory JSON; the two importer source files (symbol line numbers only); and
read-only git history (git log, git show of the two JSON files at fixed revisions).
It never opens an image, sidecar PNG, restyle output, archive or game-data file, and
it prints no visual description or evidence note text. Printed: identifiers, hashes,
dimensions, counts, commit IDs and line numbers.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

PINNED_REGISTRY_SHA256 = "c3559a37421d7cfed9285ada5f88c542edfac15049d6cff28bc81fd16fee46fb"
REGISTRY = "docs/engine/research/cok-graphics-identity-registry-v1.json"
INVENTORY = "docs/engine/data/cok-restyle-inventory-v1.json"
AMIGA_IMP = "tools/import_cok_amiga_dax_tiles_registry.py"
DOS_IMP = "tools/import_cok_dos_tile_block_previews_registry.py"
BLOCKS = [11, 12, 23, 31, 32, 202, 203]
REVISIONS = ["1d08d171", "70b1eda6^", "70b1eda6", "HEAD"]
CITED_RE = re.compile(r"([0-9a-f]{64})\.png$")
NOTE_IMAGE_RE = re.compile(r"exact image SHA-256 ([0-9a-f]{64})")
NOTE_PIXEL_RE = re.compile(r"decoded pixel SHA-256 ([0-9a-f]{64})")
# (file, label, regex): first matching line number is printed.
MARKERS = [
    (AMIGA_IMP, "amiga_id_for", r"^def amiga_id_for\("),
    (AMIGA_IMP, "verify_identical_archives", r"^def verify_identical_archives\("),
    (AMIGA_IMP, "make_amiga_asset: copy of DOS asset (keeps DOS evidence)", r"asset = copy\.deepcopy\(dos_asset\)"),
    (AMIGA_IMP, "make_amiga_asset: appends Amiga-candidate game-data evidence", r'"kind": "game-data"'),
    (AMIGA_IMP, "make_amiga_asset: appends visual-review qualification", r"Exact same visual pixels also belong"),
    (AMIGA_IMP, "make_amiga_asset: gameConsumers status unknown", r'"status": "unknown",'),
    (DOS_IMP, "decode_archives", r"^def decode_archives\("),
    (DOS_IMP, "inventory_pairs", r"^def inventory_pairs\("),
    (DOS_IMP, "_is_superseded_strip", r"^def _is_superseded_strip\("),
    (DOS_IMP, "_restate_description (keeps status and evidence)", r"^def _restate_description\("),
    (DOS_IMP, "merge_registry: supersede path", r"Superseding the misread strip"),
    (DOS_IMP, "merge_registry: Amiga twin propagation", r"Amiga twins:"),
    (DOS_IMP, "main: --supersede-strip-decode flag", r'"--supersede-strip-decode"'),
]


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, check=True).stdout.decode("utf-8", "replace")


def main():
    repo = Path(sys.argv[1]).resolve()
    reg_bytes = (repo / REGISTRY).read_bytes()
    reg_sha = sha256_bytes(reg_bytes)
    print(f"Registry SHA256 `{reg_sha}` ({'matches' if reg_sha == PINNED_REGISTRY_SHA256 else 'DIFFERS FROM'} pinned value).")
    inv_bytes = (repo / INVENTORY).read_bytes()
    print(f"Inventory SHA256 `{sha256_bytes(inv_bytes)}` (no pin; recorded for identity).")
    reg = json.loads(reg_bytes.decode("utf-8"))
    inv = json.loads(inv_bytes.decode("utf-8"))
    by_id = {a["id"]: a for a in reg["assets"]}
    inv_assets = inv["assets"]

    # ---- Table A: identity and declared hashes -------------------------------
    print("\n## A. Identity, superseded hit and declared hashes\n")
    print("| Block | Stable ID | Cited SHA-256 (filename) | Inventory record | Superseded hit (index, date) | Inventory current sourceSha256 | Registry decoded.sha256 | Equal | Registry wxh | Superseded wxh (sourceSize/4) | Note image hash = cited | Note pixel hash = registry pixelSha256 |")
    print("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    trace = {}
    for b in BLOCKS:
        rid = f"cok/amiga/disk2/8x8d1.dax/block/{b}/whole"
        row = by_id[rid]
        vr = [e for e in row["description"]["evidence"] if e.get("kind") == "visual-review"]
        ref = vr[0]["reference"]
        cited = CITED_RE.search(ref).group(1)
        note = vr[0].get("note", "")
        note_img = NOTE_IMAGE_RE.search(note)
        note_pix = NOTE_PIXEL_RE.search(note)
        hits = [(a, i, k, s) for i, a in enumerate(inv_assets)
                for k, s in enumerate(a.get("supersededSources", [])) if s.get("sourceSha256") == cited]
        anywhere = [a["id"] for a in inv_assets if cited in json.dumps(a)]
        if len(hits) != 1:
            raise SystemExit(f"block {b}: expected one superseded hit, found {len(hits)}")
        card, idx, k, sup = hits[0]
        decoded = row["decoded"]
        equal = card["sourceSha256"] == decoded["sha256"]
        sup_w, sup_h = sup["sourceSize"][0] // 4, sup["sourceSize"][1] // 4
        trace[b] = {"rid": rid, "cited": cited, "card": card, "decoded": decoded, "sup": sup,
                    "note_pix": note_pix.group(1) if note_pix else None,
                    "note_img": note_img.group(1) if note_img else None, "anywhere": anywhere, "row": row,
                    "equal": equal, "note_img_ok": bool(note_img) and note_img.group(1) == cited}
        print(f"| {b} | `{rid}` | `{cited}` | `{card['id']}` (0-based inventory array index {inv_assets.index(card)}) | "
              f"supersededSources[{k}] of 0-based index {idx}, {sup.get('date')} | `{card['sourceSha256']}` | "
              f"`{decoded['sha256']}` | {'yes' if equal else 'NO'} | {decoded['width']}x{decoded['height']} | "
              f"{sup_w}x{sup_h} | {'yes' if bool(note_img) and note_img.group(1) == cited else 'NO'} | "
              f"{'yes' if note_pix and note_pix.group(1) == decoded.get('pixelSha256') else 'no'} |")
    print("\nCurrent registry `decoded.pixelSha256` per block (declared, not pixel-compared):\n")
    print("| Block | decoded.path | decoded.pixelSha256 | Inventory records containing the cited hash anywhere |")
    print("| --- | --- | --- | --- |")
    for b in BLOCKS:
        t = trace[b]
        print(f"| {b} | `{t['decoded']['path']}` | `{t['decoded']['pixelSha256']}` | {', '.join(t['anywhere'])} |")
    print("\nVisual-review note hashes (stated in the note text; compared, the note text itself is not printed):\n")
    print("| Block | Note's stated image SHA-256 | Cited SHA-256 | Note's stated decoded pixel SHA-256 | Current pixelSha256 | Stated pixel = current |")
    print("| --- | --- | --- | --- | --- | --- |")
    for b in BLOCKS:
        t = trace[b]
        print(f"| {b} | `{t['note_img']}` | `{t['cited']}` | `{t['note_pix']}` | `{t['decoded']['pixelSha256']}` | "
              f"{'yes' if t['note_pix'] == t['decoded']['pixelSha256'] else 'no'} |")

    # ---- Table B: aliases, provenance, DOS counterpart ---------------------
    print("\n## B. Aliases, source provenance, archive pin and DOS counterpart\n")
    print("| Block | Alias ledger, entry, asset (inventory record) | Source provenance | Card output SHA-256 | Archive SHA-256 (registry) | DOS counterpart decoded equal | DOS counterpart cites same hash |")
    print("| --- | --- | --- | --- | --- | --- | --- |")
    for b in BLOCKS:
        t = trace[b]
        card = t["card"]
        aliases = "; ".join(f"{x['ledger']} #{x['entry']} ({x['asset']}, family {x['family']}, status {x['status']}, `{x['sourceName']}`)"
                            for x in card.get("aliases", []))
        dos = by_id.get(f"cok/dos-ega/disk1/8x8d1.dax/block/{b}/whole")
        dos_eq = dos is not None and dos["decoded"] == t["decoded"]
        dos_cite = False
        if dos is not None:
            dvr = [e for e in dos["description"]["evidence"] if e.get("kind") == "visual-review"]
            dos_cite = bool(dvr) and CITED_RE.search(dvr[0]["reference"]).group(1) == t["cited"]
        print(f"| {b} | {aliases} | `{card['sourceProvenance']}` | `{card['outputSha256']}` | "
              f"`{t['row']['archive']['sha256']}` ({'pinned' if t['row']['archive']['sha256'] == '14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915' else 'DIFFERS'}) | "
              f"{'yes' if dos_eq else 'no'} | {'yes' if dos_cite else 'no'} |")

    # ---- Table C: importer symbols -----------------------------------------
    print("\n## C. Importer symbols (line numbers)\n")
    print("| File | Symbol or marker | Line |")
    print("| --- | --- | ---: |")
    for rel, label, pat in MARKERS:
        lines = (repo / rel).read_text(encoding="utf-8").splitlines()
        hit = next((i + 1 for i, line in enumerate(lines) if re.search(pat, line)), None)
        print(f"| `{rel}` | {label} | {hit if hit else 'NOT FOUND'} |")

    # ---- Table D: git history of the cited and superseded hashes ----------
    print("\n## D. Git history (read-only `git log`)\n")
    print("| Subject | Commits (newest first, up to 3) |")
    print("| --- | --- |")
    for label, path_args in [("amiga importer", [AMIGA_IMP]), ("DOS previews importer", [DOS_IMP])]:
        out = git(repo, "log", "--format=%h %ad %s", "--date=short", "-3", "--", *path_args).strip().splitlines()
        print(f"| {label} | {'; '.join(out)} |")
    for b in BLOCKS:
        cited = trace[b]["cited"]
        out = git(repo, "log", "--format=%h %ad", "--date=short", "-S", cited, "--",
                  INVENTORY, REGISTRY).strip().splitlines()
        print(f"| cited hash, block {b} (`{cited[:12]}`) in inventory or registry | {'; '.join(out[:3]) or 'none'} |")

    # ---- Table E: lineage at fixed revisions -------------------------------
    print("\n## E. Lineage at fixed revisions (registry decoded and inventory card, from git show)\n")
    print("| Revision | Block | Registry decoded.sha256 (prefix) | Registry wxh | Inventory card sourceSha256 (prefix) | Cards with supersededSources |")
    print("| --- | ---: | --- | --- | --- | ---: |")
    for rev in REVISIONS:
        rev_reg = json.loads(git(repo, "show", f"{rev}:{REGISTRY}"))
        rev_inv = json.loads(git(repo, "show", f"{rev}:{INVENTORY}"))
        rby = {a["id"]: a for a in rev_reg["assets"]}
        rinv = {a["id"]: a for a in rev_inv["assets"]}
        n_sup = sum(1 for a in rev_inv["assets"] if "supersededSources" in a)
        for b in BLOCKS:
            t = trace[b]
            r = rby.get(t["rid"])
            card = rinv.get(t["card"]["id"])
            d = r["decoded"] if r and r.get("decoded") else {}
            print(f"| `{rev}` | {b} | `{str(d.get('sha256'))[:12]}` | {d.get('width')}x{d.get('height')} | "
                  f"`{str(card.get('sourceSha256') if card else None)[:12]}` | {n_sup} |")


if __name__ == "__main__":
    main()
```

## Appendix B. Captured output

```text
Registry SHA256 `c3559a37421d7cfed9285ada5f88c542edfac15049d6cff28bc81fd16fee46fb` (matches pinned value).
Inventory SHA256 `646ecab2e544e5002de41c04a23ac4bb4849ea5dfadce834455d1170e662c9a7` (no pin; recorded for identity).

## A. Identity, superseded hit and declared hashes

| Block | Stable ID | Cited SHA-256 (filename) | Inventory record | Superseded hit (index, date) | Inventory current sourceSha256 | Registry decoded.sha256 | Equal | Registry wxh | Superseded wxh (sourceSize/4) | Note image hash = cited | Note pixel hash = registry pixelSha256 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | `cok/amiga/disk2/8x8d1.dax/block/11/whole` | `edad9ea5bad39e307411aa5e77f8ce7f71e5776db8fcf1eb1a6df33270b538ba` | `asset-2005-cbc480fb499b` (0-based inventory array index 2004) | supersededSources[0] of 0-based index 2004, 2026-11-11 | `edf4b5470c5c65a1b0708a19e698739a54969e7966472962a61abe61f7849de3` | `edf4b5470c5c65a1b0708a19e698739a54969e7966472962a61abe61f7849de3` | yes | 16x280 | 16x281 | yes | no |
| 12 | `cok/amiga/disk2/8x8d1.dax/block/12/whole` | `0715496d586bc5ac5f00ffaa29c41a9b623c5e0646f290adfe46a02d2f55973a` | `asset-1468-91b550c91aee` (0-based inventory array index 1467) | supersededSources[0] of 0-based index 1467, 2026-11-11 | `1d695559c5ed12fc8ad3053a85c6bdbfcbc5bcd8d94ffa6764e2eaa9bf58f6bd` | `1d695559c5ed12fc8ad3053a85c6bdbfcbc5bcd8d94ffa6764e2eaa9bf58f6bd` | yes | 16x280 | 16x281 | yes | no |
| 23 | `cok/amiga/disk2/8x8d1.dax/block/23/whole` | `a974aee8f0a1e89e05eaafa8a1508cc43a081d12d6e30310805d76dfbd9a5e29` | `asset-0311-1f50938320e5` (0-based inventory array index 310) | supersededSources[0] of 0-based index 310, 2026-11-11 | `33523d50a571da261440aa0f6cd9a359964ce0823c4128f8759cd7902044cdba` | `33523d50a571da261440aa0f6cd9a359964ce0823c4128f8759cd7902044cdba` | yes | 16x280 | 16x281 | yes | no |
| 31 | `cok/amiga/disk2/8x8d1.dax/block/31/whole` | `2d93fa8becb0e4776798df3d250e2e01e79c5c8e67af8fc940ef5b124289193c` | `asset-0870-56124c127346` (0-based inventory array index 869) | supersededSources[0] of 0-based index 869, 2026-11-11 | `ec1fec73bdd25f33308a12645047219f93804bfef219375f11a155c99139b338` | `ec1fec73bdd25f33308a12645047219f93804bfef219375f11a155c99139b338` | yes | 16x280 | 16x281 | yes | no |
| 32 | `cok/amiga/disk2/8x8d1.dax/block/32/whole` | `c9a18b36c8664046e8d2c99cda53c772b83bcd1ce7fc04578743974a53a69bb3` | `asset-1366-877290b36843` (0-based inventory array index 1365) | supersededSources[0] of 0-based index 1365, 2026-11-11 | `a41abf174201ab28e2d54c2b562059c31723d8fdae73f3178577f506c6343a59` | `a41abf174201ab28e2d54c2b562059c31723d8fdae73f3178577f506c6343a59` | yes | 16x280 | 16x281 | yes | no |
| 202 | `cok/amiga/disk2/8x8d1.dax/block/202/whole` | `5b46081df65b426ff2cc248b3fadcd4578dd7bbc8bbc9cbe97d6a2b950d1a8f7` | `asset-2075-d2053cbbdd43` (0-based inventory array index 2074) | supersededSources[0] of 0-based index 2074, 2026-11-11 | `400eb00509e24539afd29b0a0f42145c829922ed4cc045b5457b4a4b86e5fda4` | `400eb00509e24539afd29b0a0f42145c829922ed4cc045b5457b4a4b86e5fda4` | yes | 16x152 | 16x153 | yes | no |
| 203 | `cok/amiga/disk2/8x8d1.dax/block/203/whole` | `92f8e9328060c7951c4ba47b01bc764dadb6bdaefd6f318e5d4867fd46593920` | `asset-2274-e6b669edd788` (0-based inventory array index 2273) | supersededSources[0] of 0-based index 2273, 2026-11-11 | `591b0af6b3bca2cbe16e24c1dd1413e0a144386c909998a8617a2286542d5d82` | `591b0af6b3bca2cbe16e24c1dd1413e0a144386c909998a8617a2286542d5d82` | yes | 16x184 | 16x181 | yes | no |

Current registry `decoded.pixelSha256` per block (declared, not pixel-compared):

| Block | decoded.path | decoded.pixelSha256 | Inventory records containing the cited hash anywhere |
| --- | --- | --- | --- |
| 11 | `images/edf4b5470c5c65a1b0708a19e698739a54969e7966472962a61abe61f7849de3.png` | `7d93eca33afb767d48e0851de36240a62c1ab1fa390c2c5d50bada5ad1e86317` | asset-2005-cbc480fb499b |
| 12 | `images/1d695559c5ed12fc8ad3053a85c6bdbfcbc5bcd8d94ffa6764e2eaa9bf58f6bd.png` | `863851f16d94dbdfd562154df3a5f75b12a79a426445ab3485669ad436a81077` | asset-1468-91b550c91aee |
| 23 | `images/33523d50a571da261440aa0f6cd9a359964ce0823c4128f8759cd7902044cdba.png` | `65dbf5db7fd0bd415e0acb527b24a3e06df1c20368a3d470581305ed08366012` | asset-0311-1f50938320e5 |
| 31 | `images/ec1fec73bdd25f33308a12645047219f93804bfef219375f11a155c99139b338.png` | `ea832b59d2974c25429bce2d0d2ea3a38505a90be0e00ea6a4511779a38accec` | asset-0870-56124c127346 |
| 32 | `images/a41abf174201ab28e2d54c2b562059c31723d8fdae73f3178577f506c6343a59.png` | `b538f371669817ddabdb81d8b1c43d81430f390742a332936a37dada85345f22` | asset-1366-877290b36843 |
| 202 | `images/400eb00509e24539afd29b0a0f42145c829922ed4cc045b5457b4a4b86e5fda4.png` | `e8d6d1cfc15f83eddf7ae91dee434cd12e13b615e2fb9fdeffd5a78cafe34339` | asset-2075-d2053cbbdd43 |
| 203 | `images/591b0af6b3bca2cbe16e24c1dd1413e0a144386c909998a8617a2286542d5d82.png` | `09187d05053939d7420a3fee48c5e19d72d0c6faf4ecf06731fd7309a71c3088` | asset-2274-e6b669edd788 |

Visual-review note hashes (stated in the note text; compared, the note text itself is not printed):

| Block | Note's stated image SHA-256 | Cited SHA-256 | Note's stated decoded pixel SHA-256 | Current pixelSha256 | Stated pixel = current |
| --- | --- | --- | --- | --- | --- |
| 11 | `edad9ea5bad39e307411aa5e77f8ce7f71e5776db8fcf1eb1a6df33270b538ba` | `edad9ea5bad39e307411aa5e77f8ce7f71e5776db8fcf1eb1a6df33270b538ba` | `06bf4730a4911f1fa07ab28a3fc72888346523d7eaf31c29dc99799bf5d9940e` | `7d93eca33afb767d48e0851de36240a62c1ab1fa390c2c5d50bada5ad1e86317` | no |
| 12 | `0715496d586bc5ac5f00ffaa29c41a9b623c5e0646f290adfe46a02d2f55973a` | `0715496d586bc5ac5f00ffaa29c41a9b623c5e0646f290adfe46a02d2f55973a` | `cab4a7d9cc41197f8b83865ba0cce26ad5a94e81675125d7262cb3fa985d4a58` | `863851f16d94dbdfd562154df3a5f75b12a79a426445ab3485669ad436a81077` | no |
| 23 | `a974aee8f0a1e89e05eaafa8a1508cc43a081d12d6e30310805d76dfbd9a5e29` | `a974aee8f0a1e89e05eaafa8a1508cc43a081d12d6e30310805d76dfbd9a5e29` | `8606ed8456254600d6b2af6fb496b0cbddeb8fe8769daad75c56baf656f7f345` | `65dbf5db7fd0bd415e0acb527b24a3e06df1c20368a3d470581305ed08366012` | no |
| 31 | `2d93fa8becb0e4776798df3d250e2e01e79c5c8e67af8fc940ef5b124289193c` | `2d93fa8becb0e4776798df3d250e2e01e79c5c8e67af8fc940ef5b124289193c` | `26ae935aa17a450ecc9888a81db2036abac25abf7c4028d50bb7282fdf0ce424` | `ea832b59d2974c25429bce2d0d2ea3a38505a90be0e00ea6a4511779a38accec` | no |
| 32 | `c9a18b36c8664046e8d2c99cda53c772b83bcd1ce7fc04578743974a53a69bb3` | `c9a18b36c8664046e8d2c99cda53c772b83bcd1ce7fc04578743974a53a69bb3` | `8573b647de2ee162a5847e2a8d8565b46c61eb55a366b0db0cac30c8887e0129` | `b538f371669817ddabdb81d8b1c43d81430f390742a332936a37dada85345f22` | no |
| 202 | `5b46081df65b426ff2cc248b3fadcd4578dd7bbc8bbc9cbe97d6a2b950d1a8f7` | `5b46081df65b426ff2cc248b3fadcd4578dd7bbc8bbc9cbe97d6a2b950d1a8f7` | `6a2755906db8f298b18f32fedf2955a9a3fb05489be0eff5fcc73ff3b1eae19e` | `e8d6d1cfc15f83eddf7ae91dee434cd12e13b615e2fb9fdeffd5a78cafe34339` | no |
| 203 | `92f8e9328060c7951c4ba47b01bc764dadb6bdaefd6f318e5d4867fd46593920` | `92f8e9328060c7951c4ba47b01bc764dadb6bdaefd6f318e5d4867fd46593920` | `615621225767e26154a2cf1cc216f146dcbe7577041382ea44ba85a6bee395aa` | `09187d05053939d7420a3fee48c5e19d72d0c6faf4ecf06731fd7309a71c3088` | no |

## B. Aliases, source provenance, archive pin and DOS counterpart

| Block | Alias ledger, entry, asset (inventory record) | Source provenance | Card output SHA-256 | Archive SHA-256 (registry) | DOS counterpart decoded equal | DOS counterpart cites same hash |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | dos_coverage.json #236 (8X8D1_011, family 8X8D1, status restyled, `8X8D1_011.png`) | `dos_render_all/8X8D1/8X8D1_011.png` | `e5ef2fe4684193dc10b1ab0fe954cf52c220203b57db52aa068400a397bf1c0c` | `14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915` (pinned) | yes | yes |
| 12 | dos_coverage.json #237 (8X8D1_012, family 8X8D1, status restyled, `8X8D1_012.png`) | `dos_render_all/8X8D1/8X8D1_012.png` | `b39496e74b7656e0c3aa04d9a26eaff462aef93cd209ac3f75e14e2d93432e54` | `14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915` (pinned) | yes | yes |
| 23 | dos_coverage.json #238 (8X8D1_023, family 8X8D1, status restyled, `8X8D1_023.png`); dos_coverage.json #256 (8X8D3_023, family 8X8D3, status restyled, `8X8D3_023.png`) | `dos_render_all/8X8D1/8X8D1_023.png` | `489e5fe4923a911ad2629af8d312c9a3bdeac9c273e259b4416edff84734bfee` | `14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915` (pinned) | yes | yes |
| 31 | dos_coverage.json #239 (8X8D1_031, family 8X8D1, status restyled, `8X8D1_031.png`) | `dos_render_all/8X8D1/8X8D1_031.png` | `db6400789ce9f2bc17fffbba9582c0e6f91f39acd2e6971d5e720745cc711367` | `14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915` (pinned) | yes | yes |
| 32 | dos_coverage.json #240 (8X8D1_032, family 8X8D1, status restyled, `8X8D1_032.png`) | `dos_render_all/8X8D1/8X8D1_032.png` | `05ae6c676846619785dd04682f39680fd9de434e0097be9c3857944e8213bf12` | `14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915` (pinned) | yes | yes |
| 202 | dos_coverage.json #241 (8X8D1_202, family 8X8D1, status restyled, `8X8D1_202.png`) | `dos_render_all/8X8D1/8X8D1_202.png` | `da1fbfe9bebe9bbaba097b4aea65fd3c296e9724885a92b4e6d994c6910ccac9` | `14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915` (pinned) | yes | yes |
| 203 | dos_coverage.json #242 (8X8D1_203, family 8X8D1, status restyled, `8X8D1_203.png`) | `dos_render_all/8X8D1/8X8D1_203.png` | `4a64cfd7d8ad344033b278908b701143e9c97b43e8e4def47610ed0561ed5d7c` | `14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915` (pinned) | yes | yes |

## C. Importer symbols (line numbers)

| File | Symbol or marker | Line |
| --- | --- | ---: |
| `tools/import_cok_amiga_dax_tiles_registry.py` | amiga_id_for | 50 |
| `tools/import_cok_amiga_dax_tiles_registry.py` | verify_identical_archives | 72 |
| `tools/import_cok_amiga_dax_tiles_registry.py` | make_amiga_asset: copy of DOS asset (keeps DOS evidence) | 168 |
| `tools/import_cok_amiga_dax_tiles_registry.py` | make_amiga_asset: appends Amiga-candidate game-data evidence | 177 |
| `tools/import_cok_amiga_dax_tiles_registry.py` | make_amiga_asset: appends visual-review qualification | 186 |
| `tools/import_cok_amiga_dax_tiles_registry.py` | make_amiga_asset: gameConsumers status unknown | 191 |
| `tools/import_cok_dos_tile_block_previews_registry.py` | decode_archives | 74 |
| `tools/import_cok_dos_tile_block_previews_registry.py` | inventory_pairs | 130 |
| `tools/import_cok_dos_tile_block_previews_registry.py` | _is_superseded_strip | 198 |
| `tools/import_cok_dos_tile_block_previews_registry.py` | _restate_description (keeps status and evidence) | 205 |
| `tools/import_cok_dos_tile_block_previews_registry.py` | merge_registry: supersede path | 231 |
| `tools/import_cok_dos_tile_block_previews_registry.py` | merge_registry: Amiga twin propagation | 242 |
| `tools/import_cok_dos_tile_block_previews_registry.py` | main: --supersede-strip-decode flag | 304 |

## D. Git history (read-only `git log`)

| Subject | Commits (newest first, up to 3) |
| --- | --- |
| amiga importer | 1d08d171 2026-11-06 research: preserve graphics identities, descriptions and consumer tooling |
| DOS previews importer | 70b1eda6 2026-11-11 fix: re-decode DOS whole-block rows as EGA tile arrays (goal 156); 1d08d171 2026-11-06 research: preserve graphics identities, descriptions and consumer tooling |
| cited hash, block 11 (`edad9ea5bad3`) in inventory or registry | 70b1eda6 2026-11-11; 1d08d171 2026-11-06 |
| cited hash, block 12 (`0715496d586b`) in inventory or registry | 70b1eda6 2026-11-11; 1d08d171 2026-11-06 |
| cited hash, block 23 (`a974aee8f0a1`) in inventory or registry | 70b1eda6 2026-11-11; 1d08d171 2026-11-06 |
| cited hash, block 31 (`2d93fa8becb0`) in inventory or registry | 70b1eda6 2026-11-11; 1d08d171 2026-11-06 |
| cited hash, block 32 (`c9a18b36c866`) in inventory or registry | 70b1eda6 2026-11-11; 1d08d171 2026-11-06 |
| cited hash, block 202 (`5b46081df65b`) in inventory or registry | 70b1eda6 2026-11-11; 1d08d171 2026-11-06 |
| cited hash, block 203 (`92f8e9328060`) in inventory or registry | 70b1eda6 2026-11-11; 1d08d171 2026-11-06 |

## E. Lineage at fixed revisions (registry decoded and inventory card, from git show)

| Revision | Block | Registry decoded.sha256 (prefix) | Registry wxh | Inventory card sourceSha256 (prefix) | Cards with supersededSources |
| --- | ---: | --- | --- | --- | ---: |
| `1d08d171` | 11 | `edad9ea5bad3` | 16x281 | `edad9ea5bad3` | 0 |
| `1d08d171` | 12 | `0715496d586b` | 16x281 | `0715496d586b` | 0 |
| `1d08d171` | 23 | `a974aee8f0a1` | 16x281 | `a974aee8f0a1` | 0 |
| `1d08d171` | 31 | `2d93fa8becb0` | 16x281 | `2d93fa8becb0` | 0 |
| `1d08d171` | 32 | `c9a18b36c866` | 16x281 | `c9a18b36c866` | 0 |
| `1d08d171` | 202 | `5b46081df65b` | 16x153 | `5b46081df65b` | 0 |
| `1d08d171` | 203 | `92f8e9328060` | 16x181 | `92f8e9328060` | 0 |
| `70b1eda6^` | 11 | `edad9ea5bad3` | 16x281 | `edad9ea5bad3` | 0 |
| `70b1eda6^` | 12 | `0715496d586b` | 16x281 | `0715496d586b` | 0 |
| `70b1eda6^` | 23 | `a974aee8f0a1` | 16x281 | `a974aee8f0a1` | 0 |
| `70b1eda6^` | 31 | `2d93fa8becb0` | 16x281 | `2d93fa8becb0` | 0 |
| `70b1eda6^` | 32 | `c9a18b36c866` | 16x281 | `c9a18b36c866` | 0 |
| `70b1eda6^` | 202 | `5b46081df65b` | 16x153 | `5b46081df65b` | 0 |
| `70b1eda6^` | 203 | `92f8e9328060` | 16x181 | `92f8e9328060` | 0 |
| `70b1eda6` | 11 | `edf4b5470c5c` | 16x280 | `edf4b5470c5c` | 24 |
| `70b1eda6` | 12 | `1d695559c5ed` | 16x280 | `1d695559c5ed` | 24 |
| `70b1eda6` | 23 | `33523d50a571` | 16x280 | `33523d50a571` | 24 |
| `70b1eda6` | 31 | `ec1fec73bdd2` | 16x280 | `ec1fec73bdd2` | 24 |
| `70b1eda6` | 32 | `a41abf174201` | 16x280 | `a41abf174201` | 24 |
| `70b1eda6` | 202 | `400eb00509e2` | 16x152 | `400eb00509e2` | 24 |
| `70b1eda6` | 203 | `591b0af6b3bc` | 16x184 | `591b0af6b3bc` | 24 |
| `HEAD` | 11 | `edf4b5470c5c` | 16x280 | `edf4b5470c5c` | 24 |
| `HEAD` | 12 | `1d695559c5ed` | 16x280 | `1d695559c5ed` | 24 |
| `HEAD` | 23 | `33523d50a571` | 16x280 | `33523d50a571` | 24 |
| `HEAD` | 31 | `ec1fec73bdd2` | 16x280 | `ec1fec73bdd2` | 24 |
| `HEAD` | 32 | `a41abf174201` | 16x280 | `a41abf174201` | 24 |
| `HEAD` | 202 | `400eb00509e2` | 16x152 | `400eb00509e2` | 24 |
| `HEAD` | 203 | `591b0af6b3bc` | 16x184 | `591b0af6b3bc` | 24 |
```
