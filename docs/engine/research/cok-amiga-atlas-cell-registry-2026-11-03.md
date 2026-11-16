# CoK Amiga source-only atlas cells — 2026-11-03

`tools/import_cok_amiga_atlas_cells_registry.py` adds exactly 18 archive-qualified
`atlas-cell` locators: cells 1, 32 and 67 from `charS.LBM` and `charT.LBM` on disks 1–3.
It reads the private source root
`{external-workspace}/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn/` and is read-only
unless `--write` is explicitly supplied. Its report contains geometry, hashes and opaque
counts only. No original bytes, cell arrays, extracted PNGs or new Restyle outputs are saved.
The registry uses the existing schema with `decoded: null` for every new locator.

The existing six whole-atlas IDs, all other assets, Restyles, appearance sets and frame groups
are preserved. Every disk retains a distinct archive path/ID even though the three copies of
each atlas are byte-identical. Eighteen new verified `pixel-identical` edges connect the three
disk copies of each of the six cells (three pairwise edges per cell/atlas). These comparisons
include raw five-bit indices, four-bit colors and the independent opaque mask, and are restricted
to identical archive hashes. They assert no DOS correspondence or logical appearance identity.

## Exact inputs and independent extraction

| Atlas (same pin on disks 1–3) | File bytes | Archive SHA-256 | Complete row-major five-bit index SHA-256 |
| --- | ---: | --- | --- |
| charS.LBM | 16504 | `51cfc7de6f3c8004de820ee9758eb3f785bedff6a808c21d58d0d2964b7963c3` | `b61f17f3a7e0c908dee28db5c71162e1dbcb58b1b5dda30cb8862b35cb99cebe` |
| charT.LBM | 25652 | `e17783a48aec7d7708bc3d3af4c7cc3adc496376d11aa4cf2abbea4ac9d1ce72` | `566ff7ad72db7d9173c1ca00c7b02ef1300b077d8d29de22fe631590849126b8` |

These pins identify local extracted copies, without independent retail-media provenance.
Both inputs are 320×200, five image planes, BMHD masking=0. The independent importer decodes
ByteRun1 and planar bits using the standard library; the focused tests compare all six full
index arrays and all 18 extracted cells to the existing NumPy ILBM decoder. The historical
whole-index pins and charT cell goldens come from the
[player source contract](cok-player-icon-source-contract-2026-10-26.md),
not from newly captured expected outputs.

The charS source has a bounded format anomaly: FORM length 15252 means a declared end at
file offset 15260, leaving 1244 trailing bytes. Its BODY begins at offset 378 and declares
14881 compressed bytes plus one pad byte. Decoding exactly that declared BODY produces all
40000 bytes of 200 rows × 5 planes × 40 bytes, matching the historical complete index hash.
The importer accepts trailing bytes only when file length=16504, FORM end=15260 **and** the
entire file SHA-256 equals the charS pin. Mutating even the final tail byte fails. Other
FORM-size disagreements, truncated packets, overflow, missing planes and wrong masking fail.
Repeated ancillary CRNG chunks are accepted; repeated BMHD/BODY chunks fail.

One-based cell N uses `x=((N-1)%12)*24`, `y=((N-1)//12)*24` and a 24×24 rectangle.
Cells 1/32/67 therefore begin at (0,0)/(168,48)/(144,120). The raw index is five bits;
the color is `raw & 15`; the one-byte-per-pixel opaque mask is `1-((raw>>4)&1)`.
Index-zero black can be opaque. BMHD transparent-color values and RGB/index equality are
not substitutes for the fifth image plane.

| Atlas | Cell | Raw five-bit cell SHA-256 | Opaque-mask SHA-256 | Opaque pixels / 576 |
| --- | ---: | --- | --- | ---: |
| charS | 1 | `ca28389181e0869e1b2a247107b5fb85063b2de531c768a4371cd3047ca36320` | `0e8b98ff9674d363a2c940b7039d772a19527c3fe3ccc84966a8df1cd0c46d49` | 153 |
| charS | 32 | `78b53a7bcb06c27ae45311c3c1bbfd2463b5efc9d8c0b9791d61377dd765d698` | `3720533c6683f209917fef365f9ef36efe4746718a4e4cd296db5893d4a084e0` | 141 |
| charS | 67 | `95b982138ab880161c857fad255d2ab5b282f7c836661efb3fed6cf1375aefa4` | `1185f28000759dfa15e14898969182c37bb3dcadd23b8c5aeee4cc7ab72b83a0` | 25 |
| charT | 1 | `d9cee48c65c0ef7579ad93979a73ba6dbd746218fae3836b0e3f7df3a8efb585` | `f9d1ca2fd376cee2597b988d443824c110986e22248831e844ff546d78743aab` | 172 |
| charT | 32 | `4ee6edc24d17b246e40bee987544f1000f498cd165b6c04733b9d182a0b36fe2` | `afcd9411d9bcfe0a4d4c183397bb4f493887f7afd947835cc84f32a6580594a5` | 160 |
| charT | 67 | `c16ae6024f26497cb3d5e0db63cdd8d6a8cb77f7042866717f4056dd3f4f5d41` | `10b95930d6221318f2cc87831513e563305493f60927460fa6d0e894b43bc5ca` | 27 |

The charS rows are new measurements cross-checked by the independent decoder. The charT rows
reproduce the pre-existing disk-2 source-contract pins on all three disks. Four-bit color hashes
also appear in each registry evidence note and the importer report.

## Selector provenance and remaining uncertainty

Consumer status is partial and description status unknown. Research provenance cites the retained
static trace for pinned `disk1/game` SHA-256
`99a252109cb5e5c01de71edf6e8a22b3d9db96a9e6249c1f3f03ad71f9990102`:
hunk66:`0D2A` extraction and `0EC6..0F20` body<=31 selection. Body1 selects 1/32, head5 selects
67; atlas selector1 chooses charS and the other branch charT. The documented creation-derived
candidate selects charT only. The importer does not reread/disassemble the executable or claim a
charS creation candidate. Static evidence is not a live observation.

This slice establishes neither named subject nor DOS equivalence, player composition/palette
admission, Restyle-cell fidelity, animation/timing, or complete atlas-selector coverage. The existing
whole-atlas Restyle links do not extend to cells. No new appearance set, Restyle link or animation
group is added. The body>31 path and all selectors outside 1/32/67 remain outside this importer.
Resolve a deliberate logical appearance mapping and the remaining source/runtime gates in the
player contract before runtime use. Preserve explicit DOS fallback.

## Reproduction and verification

Run from the repository root:

```powershell
python -m unittest tools.test_import_cok_amiga_atlas_cells_registry -v
python tools/import_cok_amiga_atlas_cells_registry.py
# Explicit metadata-only registry update, when intended:
python tools/import_cok_amiga_atlas_cells_registry.py --write
```

The seven focused tests pass, including independent archive extraction, historical pins,
synthetic opaque black/fifth-plane discrimination, wrong selector/mask/plane controls,
malformed BODY/tail controls, merge conflict/idempotence controls and unchanged source/registry
hashes, sizes and modification timestamps under the default CLI. Missing private archive fixtures
produce explicit skips for the four archive tests; synthetic tests still run.

The explicit write adds 18 IDs / 18 duplicate links. Repeat dry-run adds zero IDs/links.
Registry totals are 5357 source locators / 2510 Restyles / 104 frame groups / 9970 links;
`graphics_asset_registry.validate` reports zero errors / 6511 warnings. The separate
`jsonschema` Python package is absent, so no independent Draft 2020-12 validation is claimed.
No browser, build, package, full corpus, commit, push or deployment was run. The Vite
`spawn EPERM` hold remains active; these source-only results do not clear it.
