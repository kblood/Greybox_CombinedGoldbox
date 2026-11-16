# Buck Rogers: Matrix Cubed — the thirteenth profile (R6, round 30, staged)

Matrix Cubed was, before this pass, the capability ledger's one genuine gap:
`tools/goldbox_corpus.py`'s `PROFILES` list has carried a `buck-rogers-matrix-cubed` entry with
`"manifest": None` since it was added, because the game's only known-held copy sits inside a
read-only `.7z` bundle and nothing in `tools/` had ever extracted it. This document is the Phase A
staging area the round 30 plan's R6 item calls for: the extraction record, the measured inventory,
the **staged** browser manifest and ledger profile (landed by Phase B, atomically, alongside the
`PROFILES` key, the picker/detection registries, the docs entry and an e2e case — landing the
manifest alone in Phase A would turn `tools/test_capability_ledger_coverage.py` test 2 and the
`manifest-picker-coverage` e2e red on the shared working tree for every other agent), and the
scratch validator run proving the staged profile resolves once that landing happens.

## 1. Extraction record

Source (read-only, never written to, never vendored):
`D:\Games\Emulator\DOS\Goldbox\buckrogers2_dos_win.7z`, 2,115,754 bytes.
SHA-256: `cc98d0bb20672684301ff27af85d106536721a27dcbbafc3ae786a7eb88f8a1b`
(confirmed unchanged after extraction — re-hashed post-extract, same digest).

Extractor: `tools/matrix_cubed_extract.py` (new, this pass). Idempotent (sentinel:
`matrixcubed_extracted/BuckRogers2/c/Matrix/MATRIX.CFG`); extracts into the git-ignored
`matrixcubed_extracted/` (`.gitignore:5`'s `*_extracted/` rule — confirmed with
`git check-ignore -v matrixcubed_extracted/BuckRogers2/c/Matrix/MATRIX.CFG`, which reports the
rule and the path). **py7zr 1.1.0 cannot extract this archive**: it uses a BCJ2 filter py7zr does
not implement (`'BCJ2 filter is not supported by py7zr'`). The script's documented fallback —
`C:\Program Files\7-Zip\7z.exe x` — ran instead and succeeded. This is a genuine tooling finding,
not a hypothetical fallback path: report it as "py7zr insufficient for this archive; the 7z.exe CLI
path is load-bearing" rather than "py7zr with a defensive fallback."

Result: **58 files under 7 folders** (`BuckRogers2`, `BuckRogers2/DOSBOX`, `BuckRogers2/c`,
`BuckRogers2/c/Matrix`, `BuckRogers2/c/Matrix/Journal` [empty], `BuckRogers2/c/Matrix/SAVE`,
`BuckRogers2/d`), matching the round 30 plan's prediction exactly. **27 `.DAX` files**, also
matching the plan. Every extracted file's size and SHA-256 was recorded by the extractor's own
manifest printout (58 lines); not reproduced here in full — re-run
`python tools/matrix_cubed_extract.py` to regenerate it (idempotent, prints the manifest on every
run once extracted).

Non-DAX game files of note under `BuckRogers2/c/Matrix/`: `START.EXE` (70,277 B), `GAME.OVR`
(212,529 B), `MATRIX.CFG` (86 B), three `.XMI` tracks (`BUCKA/B/C.XMI`), `TANDY.ADV`, `ITEMS`,
`FATV9.AD`/`.BNK`/`.CAT`, `SEG00036.001`/`.002`, and `SAVE/ME.STF` (124 B) / `SAVE/ME.WHO`
(259 B) — two raw save files, unexamined (see §4's `retail_save` area).

## 2. Inventory numbers (measured — `tools/test_matrix_cubed_inventory.py`, 8 tests, all green)

- **27 `.DAX` containers, 611 total members** (`dax_inspect.parse_toc`, summed per file — table
  below). **All 27 offset chains close exactly on EOF** (`dax_inspect.verify`, zero issues on any
  file).

  | file | members | file | members |
  |---|---|---|---|
  | 8X8D0.DAX | 1 | MARSCOM.DAX | 1 |
  | 8X8D1.DAX | 13 | MON0CHA.DAX | 63 |
  | BACK1.DAX | 20 | MON0ITM.DAX | 42 |
  | BIGPIC1.DAX | 6 | MON0SPC.DAX | 35 |
  | BORDERS.DAX | 1 | MUSIC.DAX | 9 |
  | CHARS.DAX | 72 | PIC1.DAX | 46 |
  | COMSPR.DAX | 50 | PIC7.DAX | 1 |
  | CPIC1.DAX | 108 | PIC8.DAX | 1 |
  | CURSOR.DAX | 1 | SHIPS.DAX | 41 |
  | ECL1.DAX | 33 | SPRIT1.DAX | 23 |
  | GEO1.DAX | 25 | TITLE.DAX | 4 |
  | HITEK.DAX | 1 | VENUSCOM.DAX | 1 |
  | ITEM0.DAX | 1 | WALLDEF1.DAX | 11 |
  | LOTEK.DAX | 1 | | |

- **`GAME.OVR` magic is `FBOV`, not `TPOV`.** Read directly at offset 0. This **corrects the round
  30 plan's own prediction** ("`GAME.OVR` magic (`TPOV` predicted — measure); Countdown's is
  TPOV"). Countdown to Doomsday's own `GAME.OVR` magic was separately measured as `TPOV` in commit
  `9b0dfeb` ("Map Buck Rogers' GAME.OVR too, and find it is TPOV not FBOV"), so the plan's author
  reasoned "Buck's other title is TPOV, so Matrix Cubed probably is too" — but Matrix Cubed's own
  bytes say `FBOV`. **The two Buck Rogers titles use different overlay-manager magic words.** This
  matters beyond trivia: it is direct evidence that Matrix Cubed's `GAME.OVR` is NOT simply a
  re-linked copy of Countdown's, so nothing about Countdown's own ECL dispatch map
  (`ECL_GEN1_BUCK`, derived from Countdown's TPOV binary) should be assumed to transfer.

  > **Followed up, 2026-09-03 (round 31).** The "do not assume it transfers" instruction was
  > obeyed and then tested: `tools/map_matrix_ecl_dispatch.py` built a dispatch map from
  > Matrix's own `FBOV` binary and shipped `ECL_GEN1_MATRIX`. The measured table came back
  > **field-for-field identical to `ECL_GEN1_BUCK`** across all 75 dispatched opcodes, 0
  > disagreements. That does not retire the warning above — it answers it. The right reading is
  > that a different overlay magic did NOT imply a different script dialect, which is exactly why
  > it had to be measured rather than assumed in either direction. Because the two tables are
  > equal, any corpus census that "agrees" between them agrees BY CONSTRUCTION and is evidence
  > about the two dispatchers, not about the blocks. The ledger entries reproduced further down
  > this file (`ecl`, and the `quests`/`map_container` gap lines that cite it) were written
  > before that work and are kept as the round-30 record; the live ledger in
  > `tools/goldbox_capabilities.json` is the current one. See
  > `docs/engine/research/matrix-ecl-dialect.md` and `matrix-ecl-dispatch-map.md`.

- **Frame totals — measured with `tools/dax_decode.py`'s own block classifier** (the same
  `parse_vga_chunky_items` → `parse_vga_compressed_picture` → `parse_standard_frame` →
  `parse_tile_strip` → "complex/unsupported" preference order its `main()` uses), run over all 19
  graphics-bearing `.DAX` files:

  | file | standard frames | complex/unsupported | file | standard frames | complex/unsupported |
  |---|---|---|---|---|---|
  | TITLE | 4 | 0 | HITEK | 53 | 0 |
  | BIGPIC1 | 6 | 0 | LOTEK | 52 | 0 |
  | PIC1 | 102 | 0 | MARSCOM | 42 | 0 |
  | PIC7 | 1 | 0 | VENUSCOM | 44 | 0 |
  | PIC8 | 1 | 0 | 8X8D0 | 95 | 0 |
  | SPRIT1 | 69 | 0 | 8X8D1 | 2836 | 1 |
  | BACK1 | 20 | 0 | SHIPS | 35 | 6 |
  | BORDERS | 12 | 0 | | | |
  | CHARS | 72 | 0 | | | |
  | COMSPR | 50 | 0 | | | |
  | CPIC1 | 108 | 0 | | | |
  | CURSOR | 1 | 0 | | | |

  **Total: 3603 standard frames, 7 complex/unsupported.** The 7: `8X8D1` block id 201 (2048 raw
  bytes — the same size as Countdown's own font block, `COK_FONT_BLOCK`'s sibling, not
  independently decoded here) and `SHIPS` ids 40/41/42/43/44/50 (108-byte non-picture records —
  the SAME six ids Countdown's own `SHIPS.DAX` manifest note names for its own 108-byte ship-stat
  records). This number is **not comparable** to Countdown's own e2e-pinned total of 489 — that
  figure comes from the browser TS decoder's per-manifest-row rendering (a curated subset of
  files, one row per named file, excluding the font block by design) via a completely different
  code path, not from `tools/dax_decode.py` applied to Countdown's whole corpus. 3603 is what
  `tools/dax_decode.py`'s classifier reports for Matrix Cubed's own 19 files, full stop — the
  number is not fitted to match anything, and the plan explicitly asked that no number be predicted
  for it.

  **The null for the `dos-vga` correction below**: zero of the 411 individual picture blocks
  across all 19 files classify as a plain EGA 4bpp `frame`/`tile-strip` (asserted directly by
  `test_no_picture_block_decodes_as_plain_ega_frame`). Had Matrix Cubed genuinely shipped an EGA
  art set, some non-trivial fraction of its ~400 picture blocks would be expected to fall through
  to that classifier; none do.

- **Discriminator subset check.** `tools/test_goldbox_corpus.py`'s `shared_buck` set (the ten
  basenames both Buck titles carry: `START.EXE`, `GAME.OVR`, `MARSCOM.DAX`, `VENUSCOM.DAX`,
  `SHIPS.DAX`, `HITEK.DAX`, `LOTEK.DAX`, `8X8D1.DAX`, `ECL1.DAX`, `GEO1.DAX`) is a subset of what
  was extracted (all ten present). The Matrix-only half (`MATRIX.CFG`, `BUCKA.XMI`, `BUCKB.XMI`,
  `BUCKC.XMI`, `TANDY.ADV`) is also present, matching `profiles.ts`'s own `buck-rogers-matrix-cubed`
  markers exactly.

## 3. The detection claim — `dos-ega` corrected to `dos-vga`

**Claim in the tree before this pass**: `packages/engine/src/detect/profiles.ts:567` declared
`buck-rogers-matrix-cubed`'s DOS variant `graphicSet: 'dos-ega'`, while the sibling Countdown to
Doomsday variant (`:481`) declares `'dos-vga'`. The round 30 plan flagged this explicitly as "one
of the two is a guess" and predicted (two-sided, "more likely wrong than right") that it would
turn out wrong.

**The mechanism this repo uses to tell EGA from VGA, independently derived from how the engine
actually treats the two** (per the brief's own instruction to read `packages/engine/src/loaders/
dax.ts` and cite the mechanism, not flip the label because a sibling title says so): a Gen1 DAX
title's install `.CFG` file (`KRYNN.CFG`/`DKK.CFG`/`BUCK.CFG`/`GAME.CFG`/`MATRIX.CFG`, whichever
applies) carries a display-mode byte in its first CRLF-terminated field. Measured across the
titles already in the tree: Champions of Krynn and Death Knights of Krynn (both plain EGA,
`graphicSet: 'dos-ega'`) hold `E` there; Gateway to the Savage Frontier and Buck Rogers: Countdown
to Doomsday (both `'dos-vga'`, the latter corrected on 2026-08-26 against its own bytes per that
variant's own comment in `profiles.ts`) hold `V`. Structurally, `dax.ts`'s loader treats a block as
VGA-shaped (`vga-chunky-items` / `vga-compressed-picture`) only when it carries its OWN embedded
6-bit-DAC palette bytes in range and chunky 8bpp pixel data — EGA blocks carry no in-file palette
at all (fixed EGA-16) and are chunky 4bpp. These are two independent, purely structural properties
of the bytes themselves, not a label copied from a sibling title.

**Both measurements were taken directly on Matrix Cubed's own extracted bytes, and both agree**:

1. `MATRIX.CFG`'s first CRLF field is **`V`** (`V\r\nS\r\nN\r\nC:\MATRIX\SAVE\\\r\nC:\BUCK\SAVE\\
   \r\nF\r\n0\r\n...`), the same field position and the same value Countdown's/Gateway's own VGA
   `.CFG`s hold there — read byte-for-byte, not inferred.
2. Every one of the 411 individual picture blocks across all 19 graphics-bearing `.DAX` files
   classifies as `vga-chunky-items` or `vga-compressed-picture` — both embedded-6-bit-DAC-palette,
   chunky-8bpp formats — and **zero** classify as a plain EGA 4bpp `frame` (§2's null, above).

**Verdict: `dos-ega` was wrong. Corrected to `dos-vga`.** Changed in this pass:
`packages/engine/src/detect/profiles.ts:567` (the `buck-rogers-matrix-cubed` DOS variant's
`graphicSet`, plus an explanatory comment), and `packages/engine/test/detect.test.ts` (added
`expect(r.best?.graphicSet).toBe('dos-vga')` to the existing "identifies Buck Rogers: Matrix
Cubed (DOS) via MATRIX.CFG" test — previously that test asserted nothing about `graphicSet` at
all, so the wrong label had no test coverage either way). **Mutation observed**: reverting
`profiles.ts`'s `graphicSet` back to `'dos-ega'` turns that one `detect.test.ts` assertion red
(`AssertionError: expected 'dos-ega' to be 'dos-vga'`, `test/detect.test.ts:301`); restored, full
`pnpm --filter @goldbox/engine test` green again at 231 files / 2657 tests (matches the round's
own measured `806aaac` baseline) and `pnpm --filter @goldbox/engine exec tsc --noEmit` clean.

## 4. Staged browser manifest (Phase B lands verbatim at
`apps/web/games/buck-rogers-matrix-cubed.json`)

Repo-relative paths under `matrixcubed_extracted/…` (per the brief). `decode: false` rows match
Countdown's own manifest's treatment of the equivalent data files exactly. Every `note` states only
what was directly measured this pass; nothing is copied from Countdown's own notes without saying
so explicitly where the shapes coincide.

```json
{
  "id": "buck-rogers-matrix-cubed",
  "title": "Buck Rogers: Matrix Cubed",
  "platform": "DOS (VGA)",
  "container": "DAX (little-endian, signed-byte RLE) + FBOV overlay pool",
  "endianness": "little",
  "display": { "width": 320, "height": 200, "pixelAspect": 1.2, "defaultZoom": 2 },
  "files": [
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/TITLE.DAX", "category": "title", "label": "TITLE (title screen)", "note": "4 chunky-item frames (320x72, 288x144, 272x32, 320x184), same vga-chunky-items shape as Countdown's own TITLE.DAX. MATRIX.CFG's first CRLF field reads V in the same position Champions'/Death Knights' EGA .CFGs read E and Countdown's/Gateway's own VGA .CFGs read V; the install ships one art set, not an EGA/VGA pair." },

    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/BIGPIC1.DAX", "category": "scenes", "label": "BIGPIC1 (scenes)", "note": "6 blocks (ids 112-117), each a single 304x120 vga-chunky-items frame." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/PIC1.DAX", "category": "scenes", "label": "PIC1 (animated scenes)", "note": "VGA compressed picture, 46 blocks / 102 frames of 88x88 (tools/dax_decode.py's own vga-compressed-picture classifier, the DRAW18/PackBits path). Matrix Cubed has only 3 PIC files (PIC1/PIC7/PIC8) where Countdown ships 9 (pic1..pic9) -- a smaller title, not a decode gap." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/PIC7.DAX", "category": "scenes", "label": "PIC7 (animated scenes)", "note": "1 block (id 105), 1 frame of 88x88." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/PIC8.DAX", "category": "scenes", "label": "PIC8 (animated scenes)", "note": "1 block (id 92), 1 frame of 88x88." },

    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/BACK1.DAX", "category": "backdrops", "label": "BACK1 (combat backdrops)", "note": "20 blocks, each a single 88x88 vga-chunky-items frame." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/BORDERS.DAX", "category": "backdrops", "label": "BORDERS (frame backdrops)", "note": "One block holding 12 8x8 chunky items." },

    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/CPIC1.DAX", "category": "portraits", "label": "CPIC1 (combat portraits)", "note": "108 blocks, one 24x24 or 48x24 chunky-item frame each." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/CHARS.DAX", "category": "portraits", "label": "CHARS (character portraits)", "note": "72 blocks, one 24x24 chunky-item frame each -- same block count as Countdown's own CHARS.DAX." },

    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/8X8D0.DAX", "category": "tiles", "label": "8X8D0 (8x8 tile sheet)", "note": "One block, 95 8x8 chunky items." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/8X8D1.DAX", "category": "tiles", "label": "8X8D1 (8x8 tile sheet)", "note": "13 blocks: two 256-item 8x8 tile sheets (ids 19, 22), a 20-item sheet (id 202), and block id 201 -- 2048 raw bytes, the SAME size as Countdown's own 8X8D1#201 font block, structurally consistent with the Gen1 1bpp text-glyph shape but NOT independently decoded/verified here (this row inherits Countdown's decode:false-equivalent caution for that one block; the other 12 blocks decode cleanly as chunky VGA tiles)." },

    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/COMSPR.DAX", "category": "sprites", "label": "COMSPR (combat sprites)", "note": "50 blocks, one 24x24 chunky-item frame each -- same block count as Countdown's own COMSPR.DAX." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/SPRIT1.DAX", "category": "sprites", "label": "SPRIT1 (monster sprites)", "note": "23 blocks, vga-compressed-picture, 69 frames of 88x88 (a 3-frame near/mid/far set per block, same shape as Countdown's own SPRIT family). Matrix Cubed ships only sprit1.dax where Countdown ships sprit1..sprit6; not independently checked for the same 32..175 DAC-range gap Countdown's own SPRIT note discloses." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/MARSCOM.DAX", "category": "sprites", "label": "MARSCOM (Mars combat set)", "note": "One block holding 42 24x24 chunky items -- same count as Countdown's own MARSCOM.DAX." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/VENUSCOM.DAX", "category": "sprites", "label": "VENUSCOM (Venus combat set)", "note": "One block holding 44 24x24 chunky items -- same count as Countdown's own VENUSCOM.DAX." },

    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/HITEK.DAX", "category": "ui", "label": "HITEK (high-tech item icons)", "note": "One block holding 53 24x24 chunky items -- same count as Countdown's own HITEK.DAX." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/LOTEK.DAX", "category": "ui", "label": "LOTEK (low-tech item icons)", "note": "One block holding 52 24x24 chunky items -- same count as Countdown's own LOTEK.DAX." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/SHIPS.DAX", "category": "ui", "label": "SHIPS (spacecraft art + stats)", "note": "41 blocks, matching Countdown's own SHIPS.DAX exactly in shape: 35 decode as vga-chunky-items art and 6 (ids 40, 41, 42, 43, 44, 50) are 108-byte non-picture records that dax_decode.py's classifier reports complex/unsupported -- the same six ids Countdown's own manifest note names as its 108-byte ship-stat records. Record contents not independently parsed here." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/CURSOR.DAX", "category": "ui", "label": "CURSOR (UI cursor)", "note": "One block, one 8x8 chunky-item frame." },

    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/GEO1.DAX", "category": "data", "label": "GEO1 (map data)", "decode": false, "note": "25 members; dax_inspect --verify closes the offset chain." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/ECL1.DAX", "category": "data", "label": "ECL1 (event scripts)", "decode": false, "note": "33 members; dax_inspect --verify closes the offset chain. Matrix Cubed's ECL dialect has NOT been verified against its own binary -- ECL_GEN1_BUCK was derived from Countdown's GAME.OVR (magic TPOV) and must not be assumed to apply, since Matrix Cubed's own GAME.OVR carries a DIFFERENT overlay magic (FBOV, measured directly; see docs/engine/research/matrix-cubed-profile.md). No Matrix Cubed route is claimed in the campaign matrix; this row is an asset listing, not a playability claim." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/WALLDEF1.DAX", "category": "data", "label": "WALLDEF1 (wall definitions)", "decode": false, "note": "11 members; dax_inspect --verify closes the offset chain." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/MON0CHA.DAX", "category": "data", "label": "MON0CHA (monster tables)", "decode": false, "note": "63 members; dax_inspect --verify closes the offset chain." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/MON0ITM.DAX", "category": "data", "label": "MON0ITM (monster items)", "decode": false, "note": "42 members; dax_inspect --verify closes the offset chain." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/MON0SPC.DAX", "category": "data", "label": "MON0SPC (monster specials)", "decode": false, "note": "35 members; dax_inspect --verify closes the offset chain." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/ITEM0.DAX", "category": "data", "label": "ITEM0 (item table)", "decode": false, "note": "1 member; dax_inspect --verify closes the offset chain." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/MUSIC.DAX", "category": "data", "label": "MUSIC (music banks)", "decode": false, "note": "9 members; no Gen1 DOS music player is wired up." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/GAME.OVR", "category": "data", "label": "GAME.OVR (overlay pool)", "decode": false, "note": "212,529 bytes, magic FBOV (measured directly at offset 0) -- NOT TPOV. Countdown's own GAME.OVR was separately measured (commit 9b0dfeb) as TPOV, so the two Buck Rogers titles use different overlay-manager magic words; this is a genuine cross-title difference, not a typo in either measurement." },
    { "path": "matrixcubed_extracted/BuckRogers2/c/Matrix/MATRIX.CFG", "category": "data", "label": "MATRIX.CFG (install config)", "decode": false, "note": "Five CRLF fields then a run of zeros: display mode (V), sound (S), input (N), then TWO save-path fields (C:\\MATRIX\\SAVE\\, C:\\BUCK\\SAVE\\) before F -- one more field than Countdown's own BUCK.CFG (V/A/M/one save path/F), otherwise the same field order and the same V in the first (display-mode) slot." }
  ]
}
```

## 5. Staged ledger profile (Phase B lands verbatim into `tools/goldbox_capabilities.json`,
sliced-and-inserted the same way the file's own hand-formatting rule requires — never a
`json.dumps` round-trip of the whole file)

Formatted to match `buck-rogers-countdown-to-doomsday`'s existing profile exactly (single-element
arrays inline, multi-element arrays one item per line). Every status is `unsupported` except
`graphics: partial` and `ruleset: partial` (the generic ruleset module applies unconditionally;
see its own `detail`) — `ecl` is explicitly `unsupported`, per the brief's instruction not to
assume `ECL_GEN1_BUCK` applies (reinforced by §3's `FBOV`-vs-`TPOV` finding above).

```json
{
  "profile_id": "buck-rogers-matrix-cubed",
  "capabilities": {
    "ruleset": {
      "status": "partial",
      "detail": "packages/engine/src/detect/profiles.ts assigns ruleset: 'buckrogers' to buck-rogers-matrix-cubed, the SAME generic buckrogers ruleset module Countdown to Doomsday uses (packages/engine/src/ruleset/buckrogers/index.ts): BUCK_ROGERS_CAREERS maps 5 real player careers onto existing AD&D 1e classes, with ability modifiers/XP/THAC0 the unmodified addnd1e originals. The module contains zero game-specific data or logic for either Buck title, so this claim transfers unchanged -- it was not re-measured against Matrix Cubed's own bytes because there is nothing in Matrix Cubed's own files for a purely generic engine module to be measured against.",
      "evidence": [
        "packages/engine/src/ruleset/buckrogers/index.ts",
        "packages/engine/test/buckrogers.test.ts",
        "packages/engine/src/detect/profiles.ts"
      ],
      "gaps": [
        "No Buck Rogers XXVc-specific combat, weapon, vehicle, or XP math exists; every mechanical number used is the AD&D 1e original, not a science-fiction rule.",
        "No gameplay route ever instantiates a character on this ruleset for Matrix Cubed specifically; it is exercised only by the ruleset's own unit tests, which are Countdown-flavoured and never load a Matrix Cubed file."
      ]
    },
    "ecl": {
      "status": "unsupported",
      "detail": "Matrix Cubed's ECL1.DAX (33 members, offset chain verified) has NOT been disassembled or mapped against Matrix Cubed's own binary. ECL_GEN1_BUCK (packages/engine/src/ecl/disassemble.ts) was derived from Countdown to Doomsday's own GAME.OVR dispatcher, and Countdown's GAME.OVR carries magic TPOV (measured separately, commit 9b0dfeb). Matrix Cubed's own GAME.OVR was measured directly for this profile at FBOV -- a DIFFERENT overlay-manager magic word from its sibling title -- so ECL_GEN1_BUCK's dialect must NOT be assumed to carry over; no dispatch map has been built from Matrix Cubed's own GAME.OVR at all.",
      "evidence": [
        "docs/engine/research/matrix-cubed-profile.md"
      ],
      "gaps": [
        "No opcode dispatch table, operand-width table, or word-set override has been derived from Matrix Cubed's own GAME.OVR; tools/map_buck_ecl_dispatch.py has never been run against it.",
        "Whether Matrix Cubed's ECL dialect matches, extends, or diverges from ECL_GEN1_BUCK is completely unmeasured -- it is an open question, not a small delta.",
        "No gameplay route ever executes any Matrix Cubed ECL block."
      ]
    },
    "map_container": {
      "status": "unsupported",
      "detail": "Matrix Cubed's own GEO1, ECL1, WALLDEF1, MON0CHA/MON0ITM/MON0SPC, and ITEM0 DAX archives are all extracted and offset-chain-verified (tools/test_matrix_cubed_inventory.py) but none has been parsed for content, and no route mounts a legal Matrix Cubed dungeon, station, or overland walk.",
      "evidence": [
        "docs/engine/research/matrix-cubed-profile.md"
      ],
      "gaps": [
        "GEO/WALLDEF/monster/item container layouts for Matrix Cubed have not been reverse-engineered or wired to any exploration or combat surface.",
        "ECL1.DAX's 33 blocks have not even been disassembled (see ecl above), let alone executed against a GEO map or live game state."
      ]
    },
    "graphics": {
      "status": "partial",
      "detail": "Extracted from the read-only D:/Games/Emulator/DOS/Goldbox/buckrogers2_dos_win.7z bundle into matrixcubed_extracted/ (git-ignored, never vendored). All 19 graphics-bearing .DAX files (TITLE/BIGPIC1/PIC1/PIC7/PIC8/SPRIT1/BACK1/BORDERS/CPIC1/CHARS/8X8D0/8X8D1/COMSPR/MARSCOM/VENUSCOM/HITEK/LOTEK/SHIPS/CURSOR) decode with the SAME unmodified DAX decoder path (tools/dax_decode.py's own vga-chunky-items / vga-compressed-picture classifiers, the same classification order its main() uses) already shipped for Countdown to Doomsday; no new decoder was written. Measured total: 3603 standard frames, pinned per-file by tools/test_matrix_cubed_inventory.py, plus 7 blocks the classifier leaves complex/unsupported (the 8X8D1 font block at id 201, and SHIPS' 6 non-picture 108-byte records at ids 40/41/42/43/44/50 -- both structurally identical in shape and even block id to Countdown's own equivalents). Every single block across the whole picture corpus classifies as one of the two embedded-6-bit-DAC-palette VGA formats and ZERO as a plain EGA 4bpp frame, which is the byte evidence for correcting packages/engine/src/detect/profiles.ts's buck-rogers-matrix-cubed graphicSet from 'dos-ega' to 'dos-vga' (packages/engine/test/detect.test.ts asserts the correction).",
      "evidence": [
        "apps/web/games/buck-rogers-matrix-cubed.json",
        "tools/dax_decode.py",
        "tools/test_matrix_cubed_inventory.py",
        "packages/engine/src/detect/profiles.ts",
        "packages/engine/test/detect.test.ts",
        "docs/engine/research/matrix-cubed-profile.md"
      ],
      "gaps": [
        "This is asset-browser-level graphics only: no exploration, town, wilderness, or combat screen composites this art in a live route, and no e2e case exercises it until Phase B lands one.",
        "8X8D1 block 201 (the likely text font, by byte-size analogy with Countdown's own font block) is carried in the manifest but not independently decoded or verified as a font here.",
        "SHIPS' 6 non-picture 108-byte records are catalogued by id only; their field contents were not parsed (Countdown's own SHIPS note describes its equivalent fields, but that was not re-derived against Matrix Cubed's own bytes).",
        "Whether SPRIT1's DAC 32..175 range is padded the same way Countdown's own SPRIT family is (documented 8.81% white-placeholder gap) was not checked for Matrix Cubed."
      ]
    },
    "audio": {
      "status": "unsupported",
      "detail": "The install ships a 9-member MUSIC.DAX archive (offset chain verified) and no Gen1 DOS music player is wired up anywhere in this repo.",
      "evidence": [
        "docs/engine/research/matrix-cubed-profile.md"
      ],
      "gaps": ["MUSIC.DAX is uncatalogued beyond its member count; no decoder, mapping, or playback path exists."]
    },
    "retail_save": {
      "status": "unsupported",
      "detail": "Matrix Cubed's own save-game format has not been identified, located, or decoded. Two raw save files ARE present in the extracted archive (SAVE/ME.STF, 124 bytes; SAVE/ME.WHO, 259 bytes) but neither has been examined at all -- their presence is noted as a lead for a future importer, not evidence of understanding.",
      "gaps": ["There is no bidirectional or one-way bridge to any Matrix Cubed save/campaign file, and the file format itself is unrecovered."],
      "import": {
        "status": "unsupported",
        "scope": "No selected-folder or bundled Matrix Cubed retail character, party, or campaign-save importer exists.",
        "evidence": ["docs/engine/research/matrix-cubed-profile.md"],
        "gaps": ["Matrix Cubed's save file format has not even been identified, let alone mapped into an importer. SAVE/ME.STF and SAVE/ME.WHO exist in the extracted archive and have not been opened."]
      },
      "export": {
        "status": "unsupported",
        "scope": "No Greybox session-to-Matrix-Cubed retail save exporter exists.",
        "evidence": ["docs/engine/research/matrix-cubed-profile.md"],
        "gaps": ["No retail-compatible Matrix Cubed save encoder or format understanding exists."]
      }
    },
    "towns": {
      "status": "unsupported",
      "detail": "No Matrix Cubed GEO block has been identified as a town/station, and no route mounts one.",
      "gaps": ["Town-equivalent structures have not been located in Matrix Cubed's own GEO/ECL corpus."]
    },
    "wilderness": {
      "status": "unsupported",
      "detail": "No overland/travel layer is implemented for Matrix Cubed; its SHIPS/MARSCOM/VENUSCOM assets exist only as raw catalogued pictures, not as a live travel controller.",
      "gaps": ["No travel-time progression, encounter cadence, or transition handling exists for Matrix Cubed's space/planet travel model."]
    },
    "quests": {
      "status": "unsupported",
      "detail": "No cross-block quest-flag relationship has been identified in Matrix Cubed's ECL corpus; it has not even been disassembled (see ecl above).",
      "gaps": ["No quest graph or flag census exists for Matrix Cubed at any level, engine or browser."]
    },
    "companion": {
      "status": "unsupported",
      "detail": "No Matrix Cubed-specific Gold Box Companion route exists.",
      "gaps": [
        "No Matrix Cubed Electron selected-folder route is shipped or tested.",
        "Companion databases and journal semantics are not populated for Matrix Cubed campaign state."
      ]
    }
  }
}
```

## 6. Scratch validator run

`tools.goldbox_corpus.validate_capability_contract(profile)` was run against the JSON in §5,
imported directly (not via a file the harness would treat as landed). Two runs:

**Run A — Phase A tree as it stands** (this doc saved, but no
`apps/web/games/buck-rogers-matrix-cubed.json`): `status: "failed-checks"`,
`failed_checks: ['area_graphics_evidence']` — the `graphics` area's evidence list is the only one
naming the not-yet-landed manifest path, so it is the only check that cannot yet resolve. Every
other area's evidence already resolves in the Phase A tree, because it cites only files this pass
actually created (`docs/engine/research/matrix-cubed-profile.md` itself, `tools/dax_decode.py`,
`tools/test_matrix_cubed_inventory.py`, `packages/engine/src/detect/profiles.ts`,
`packages/engine/test/detect.test.ts`).

**Run B — after this doc was written, with a TRANSIENT copy of §4's manifest placed at
`apps/web/games/buck-rogers-matrix-cubed.json` for the duration of the check only (removed
immediately afterward — Phase A does not land that file; this was solely to prove Phase B's
landing will validate cleanly):**

```
status: verified-contract
failed_checks: []
```

All 13 checks (`all_areas_declared`, 10 x `area_<name>`, plus the areas that also cite
`evidence`, plus `retail_save_import`/`retail_save_export`) pass. The manifest file was deleted
again immediately after this run; `git status` shows nothing added under `apps/web/games/`.

**Evidence-string count this profile adds** (Phase B needs this for
`tools/test_goldbox_corpus.py:1806`'s pinned total of 77): counted programmatically (every string
in every area's `evidence` array plus the nested `retail_save.import`/`retail_save.export`
evidence arrays) at **14** evidence strings. Phase B's own diff will be the authority on the new
grand total (77 + however many net-new strings land, since some — like this very document — are
reused across multiple areas rather than one-per-area) — 14 is this profile's own contribution,
not a claim about the post-landing ledger total.

## 7. Holdings note

See `docs/goldbox-versions-holdings.md`'s dated append under §3c for the extraction record in that
document's own voice; this file is the technical detail it points to.

## 8. Things this pass found wrong or worth flagging, outside R6's own scope

- **The round 30 plan's `GAME.OVR` magic prediction was wrong** (§2): `TPOV` predicted, `FBOV`
  measured. Flagged per the "measure before you predict... report the plan as wrong" rule.
- **Countdown to Doomsday's own shipped manifest** (`apps/web/games/
  buck-rogers-countdown-to-doomsday.json`, NOT touched by this pass) states its `container` field
  as `"DAX (little-endian, signed-byte RLE) + FBOV overlay pool"` — but Countdown's own `GAME.OVR`
  was separately measured as `TPOV` (commit `9b0dfeb`, 2026-08-26), predating this pass. That
  manifest text appears to have gone stale at the same time the plan's own carried-forward table
  (this round's header, "Matrix Cubed is the ledger's one genuine gap" row) restated the correct
  `TPOV` finding for Countdown. This is out of R6's owned-files list (`apps/web/games/*` and the
  Countdown manifest are both off-limits here) — noted for whichever item next touches that file.
- **py7zr's BCJ2 gap** (§1) is worth recording somewhere more durable than this one document if
  another archive in this project's source tree turns out to use the same filter; the 7z.exe CLI
  fallback existing in `tools/matrix_cubed_extract.py` already covers it for this title.
