# CoK DOS CPIC1 unmapped Restyle candidate triage — 2026-11-05

## Scope and result

This is a limited side-by-side visual triage of the ten DOS CPIC1 candidates still absent from the
runtime map: blocks 1, 4, 6, 13, 21, 25, 30, 31, 38 and 41. It compares the read-only rendered
sources in `{external-workspace}/cok_restyle_work/dos_render_all/CPIC1/` with the existing files in
`{external-workspace}/cok_restyle_work/done/CoK_CPIC1_*_restyle.png`. It does not change or approve any
image, prompt, manifest, Restyle admission or runtime mapping.

All ten source/output pairs have matching canvas dimensions. Their output-file SHA-256 values are
all distinct (10 unique hashes), so these ten candidates contain no byte-identical output duplicate.
This check does not rule out visually similar images, duplicates elsewhere in the Restyle inventory,
or duplicate semantic identities.

Visual inspection is only a screening signal. The extant done PNGs do not have reconciled full-prompt
and input lineage for these exact outputs. The separate `{external-workspace}/cpic1_completion_v1` material
contains prompt attempts for #1 and #21, but those attempts were rejected and do not select the
existing `CoK_CPIC1_*_restyle.png` files. A filename, source/output pair, or broad visual resemblance
cannot substitute for the missing lineage. Keep all ten on original-art fallback.

## Visual screening observations

| Source block | Source → candidate dimensions | Screening observation (not an acceptance) |
|---:|---:|---|
| 1 | 96×96 → 96×96 | Both depict an armored, weapon-bearing humanoid; the candidate adds substantial color and surface detail. Exact design correspondence is unreviewed. |
| 4 | 96×96 → 96×96 | The source's compact gray/red figure becomes a brighter, more detailed blue/copper figure. Pose and subject correspondence need the missing prompt and closer review. |
| 6 | 96×96 → 96×96 | The small green source silhouette becomes a brown, human-like ranged fighter. This is a strong identity/composition concern. |
| 13 | 96×96 → 96×96 | The cyan/red source figure becomes a red/purple armored figure. Coarse humanoid pose is similar; identity and equipment details are unresolved. |
| 21 | 192×96 → 192×96 | Both show a long, winged dragon. The candidate is a new, highly detailed drawing; left/right and shape fidelity need the rejected attempt history resolved. |
| 25 | 96×96 → 96×96 | Both are compact humanoid forms with prominent cyan details; the candidate adds a more specific horned/armored silhouette. Exact subject correspondence is unresolved. |
| 30 | 192×96 → 192×96 | Both show a white, blue-accented dragon in a similar broad pose. The candidate adds detail; no prompt-linked composition approval exists. |
| 31 | 96×96 → 96×96 | The green/red source creature becomes a brown/red human-like fighter with blue trousers. This is a strong subject-shape concern. |
| 38 | 96×96 → 96×96 | Both show a purple/magenta robed figure. The candidate adds face, fabric and prop detail; intended details are unverified. |
| 41 | 96×96 → 96×96 | Both show a purple/magenta humanoid with a right-side shield-like shape. Fine pose/equipment correspondence is unresolved. |

The strongest concerns (#6 and #31) are not candidates for runtime admission on this evidence. Even
the closer-looking #21, #30 and #38 remain unapproved because the prompt/input lineage and composition
review are incomplete. No output was regenerated: doing so could create another competing Restyle
without resolving the existing lineage problem.

## Exact file pins

SHA-256 values below were computed from the external files during this read-only inspection.

| Block | Source file SHA-256 | Existing output file SHA-256 |
|---:|---|---|
| 1 | `fc604d4757fa4209bc31349c34405993ef78b5e373a8ed3516567a4f2820836a` | `81351a740dd2c9f28280d248c828b142dbee446ed0e41b12001a3323e996858b` |
| 4 | `32f58dd550ad198477e4b8808706533ffb94cd708e8c2bbcfbccefe87c888369` | `d8745e68d48fd7c46d45a4887daf5cddfcce0f8aa1c2dc06dcc69c015ae87b75` |
| 6 | `fc41d3e8c0eeddbff8b25582d608afd7da203dd99a5485d4b97ed0cdf139f418` | `8a19ce967983661fb96054a6a1ab4f49ed59c8f5776fe6496af3eca0c434460a` |
| 13 | `a8875c450337f99c5001d29bab74a7063dd8bb31b0e8d6408880d1cb8bc152db` | `7c6ad022e450cd589019e3e29b68e3171bae51d96edfb600b59fa960430bc02e` |
| 21 | `64a80d7e906540cfc6bddd8214eb770a2d67fbe354d32c1709be4a9eb980aea8` | `ab5f51ddb3010b9e02b792a0c6213d22f659a8887f311e121d3e3eafad208780` |
| 25 | `ea567a2605f50c198d5e478e75377ac8a042eba24da72e876cb37b09d592cdb7` | `c68f212ce67d89566928d5c36b98f22c893cdadcc64b31b823b9b61466d53f9a` |
| 30 | `96d6f48ae2c6cd56f56967f2c9d4bcd80d29aa57fc09b5cb67655e1512f59db7` | `ada4c9dcd96a1de3d8aa67f0c6601ea354f5f7acd743c0e7fee8f56c4198b1af` |
| 31 | `7ffe2f07b59fdbb1cc265809d72bfcae067577b3562baefc656beb6f6c4bd8c5` | `bdea465b6d5d3a5fa32885d76895d31052ddf666f4f704cb8030c021dff4e874` |
| 38 | `910eade6e726dbc33b0ee03dca917b6e9d47de6132ef9b1dafefce8c479e2cf8` | `3e776bc293d495a16b1fb5b93b918feffd3e83257ac8a85b206c34f0a1102cb6` |
| 41 | `b7884eff1aa58ee8d2460b7f28b0c5f4103557eb5d3420f07b0bd3213ee0bd5f` | `8cd252b5893f448e90f14569248987a4ba419bd9db1f8b7ee04e5c22369a657c` |

## Reproduction

From PowerShell, hash the rendered source and existing output for each block listed above with
`Get-FileHash -Algorithm SHA256`. Read the PNG width and height from the four big-endian IHDR bytes
at offsets 16–23. The candidate files are under the paths stated in the scope section. No source or
output file was written during this review.
