# imggen web-UI package (manual ChatGPT restyle)

Tool: `tools/imggen_webpack.py` (`make`, `import`); tests: `tools/test_imggen_webpack.py`.
Output lives in git-ignored `renders/imggen/webpack/` (batch01/, out/). Art never goes to git.

- `make`: 12-image pilot (or `--manifest`). Each source is nearest-downsampled to its native size (`native_div`, verified
  block-uniform), upscaled by an integer factor onto a 1536x1024 grey canvas; pad box recorded in `manifest.json`.
  Per image: `_input.png`, `_prompt.txt` (STYLE / CONTENT / CONSTRAINTS), logo/text items also `_prompt_bgonly.txt`.
  `INSTRUCTIONS.md` is Danish.
- `import`: reads `done/NNN_<id>_out.png`, undoes pad/crop, Lanczos to exactly k x native (k>=3, long edge >=1600, max 16),
  re-applies the original alpha (nearest kron), writes `out/`, `fidelity.json`, `contact_sheet.png`.
- Fidelity (coarse 96px, blurred): Sobel edge correlation >= 0.30, 4x4x4 histogram TV distance <= 0.55, aspect deviation
  vs 3:2 <= 0.04. Thresholds are untuned against real ChatGPT output; adjust `FLAG` after the first batch.

## Batch02 candidate inventory and proposal (2026-10-14)

Tool: `tools/imggen_candidates.py` (tests `tools/test_imggen_candidates.py`, 16 tests). Reads the git-ignored `renders/`
tree, writes `renders/imggen/candidates/candidates.json` + `candidates.md`. Hand-written picks and per-item content
descriptions (written from looking at the images) live in `tools/imggen_batch02_descriptions.json`; that file is the
whitelist for `proposed_batch02` (an id that is no longer an eligible group is reported, not dropped silently).

- Native size: renders are exact k x nearest upscales; the largest k that reproduces the image is undone first.
- Exclusions: native area < 4096 or short side < 48 (faces: < 80x40); > 88% one colour or < 4 colours or edge density
  < 0.02 (blank/delta frame); already in batch01; decode junk (a render that resembles none of >= 3 decodes of the same
  stem while two others agree); wrap/clip warnings (interior column seam ratio > 1.5; banner edge-cut); credits sets.
- Dedupe: palette-independent luminance+edge signature, same aspect only, corr >= 0.75 or identical native pixels.
  One representative per group by the best-art rule (Amiga for CoK/DoK, DOS for DQK; a clean decode beats a flagged one).
- Viewer: `?restyle=proposal` (dev reads /@fs, static reads `./restyle/proposal/`; stage with
  `python tools/imggen_candidates.py --stage-site <dir>`). Checkbox state is in localStorage; "Export selection" downloads selection.json.

Lessons from the pilot, applied to the proposal:
1. Same portrait on two platforms (006/008, 007/009) is one candidate with listed alternates, never two generations.
2. Faint background figures get lost (item 004's Death Knights): descriptions and `prompt_notes` name dark/faint elements explicitly.
3. DoK TITLE_001 wrap is a decoder bug fixed elsewhere; it is not in this proposal.

Caveats: CoK portraits exist only as DOS `dax_complex/PIC1_xor` renders whose palette looks garish; DoK/CoK Amiga PIC renders,
Secret/Buck/Curse/Treasures renders do not exist yet; DQK Amiga glib/PIC and Pool Amiga heads/bodies are excluded (wrong palette).

## Overlay layers (tools/imggen_layers.py, 2026-10-14)

Some art is drawn by the engine on top of another picture. Restyling it as a flat rectangle would paint the parent
twice, so overlays are classified (`python tools/imggen_layers.py scan` -> `renders/imggen/candidates/layers.json` + `layers.md`)
and handled as layers by `imggen_webpack.py`.

Rules found (from bytes and engine code):
- CoK/DoK `TITLE.DAX`: blocks 1, 2 are full 320x200 frames; blocks 3, 4 are 240x88/320x80/320x88 BANDS. Band headers carry
  x=y=0 (placement is not stored; engine infers it by max palette-index agreement). EGA has no alpha: a band is an OPAQUE
  rectangle holding a copy of its parent (block 2, 63-72% of pixels equal) plus new lettering. `band != parent_crop` is an
  exact matte of the lettering (34-42% of the rectangle). Block 4 fully covers block 3 (it replaces it).
  Derived placements: CoK band3 (40,8), band4 (0,8); DoK band3 (0,88), band4 (0,88). Parent of all bands = block 2.
- DQK HLIB `TILE` draw method 23 / GLIB 0xE3: index 255 transparent, x/y in the HLIB header (GLIB has none: inherited
  from the DOS twin, medium confidence). Parent = nearest preceding full 320x200 image.
- Portraits (PIC/HEAD/BODY), BIGPIC, and Amiga/C64 families were NOT measured: tagged opaque_inset/opaque_picture/unknown with
  measured=false and low/medium confidence.

Counts (overlay-type): inventory 218 -> cok 2, dok 2, dqk 10; proposal 51 -> cok 1 (#12), dok 1 (#13), dqk 2 (#29, #39);
pilot 12 -> 1 (logo_dok_dragonlance = DoK TITLE_003 at (0,88)).

Composition check against the web `?intro` renderer (native 320x200 frames captured by `tools/imggen_capture_intro.mjs`):
CoK 3/3 frames pixel-exact (1.0). DoK frames 0,1 exact; frame 2 agrees only 0.7715 with the derived (0,88) placement, and is
reproduced exactly (1.0) by band 4 rolled 1 px left at y=87. The roll check (`best_roll`) on the real bytes says
dx=0 fits the parent best (71.7%, runner-up 9206 px, ratio 2.4), whereas the shipped roll+y=87 fits only 37.8%. So the
`derollFrameIndices` heuristic (packages/engine/src/loaders/dax.ts) very likely false-positives on the 320x88 DoK band and
the shipped DoK intro (and native, which hard-codes y=87) is probably off by (1 px, 1 row). NOT verified against retail
DOS output and not changed here.

Layer workflow: `layer-manifest <ids>` builds a manifest (parent first, then `layer: auto` items); `make` puts the layer's
lettering on a flat KEY colour (candidate farthest from every foreground colour) and writes `_context.png` (parent + layer,
reference only) and a [LAYER] prompt clause; `import` keys the background out (soft distance alpha, despill, gated by the
original matte dilated 2 native px; if < 25% of the area outside the gate is still key-coloured the model ignored the key,
so the dilated original matte alone is used and the item is FLAGged `key-not-kept`); `out/layers.json` records parent,
parent_stem, x, y, k, key, alpha_mode; `compose` places layers on the restyled (or native placeholder) parent.
A diff-matte against an AI re-render of the background was rejected: the model regenerates every pixel.
Unverified: no real model output has gone through the key import (tests use synthetic model output); retail DOS captures.

## Amiga CoK/DoK pictures, DOS twins and title sequences (2026-10-14)

Batch02 now prefers the Amiga render for every CoK/DoK picture (32 colours or more, the user's rule). The scan reads
`renders/daa/{CoK,DoK}_{BIGPIC1,BIGPIC2,PIC1,PIC2,BODY1,HEAD1}` and the IFF/ILBM screens in `renders/amiga_cokdok/lbm/`.

- Twins: `renders/amiga_cokdok/twins.json` (written by tools/amiga_cokdok_render.py) maps an Amiga block to its DOS
  block. confidence high/medium AND a held DOS render force a merge into one dedupe group (Amiga representative, DOS render
  listed as alternate and as `dos_twins` with a thumbnail in the viewer). low/none twins are reported, never used to merge.
  Twin lookup is case-insensitive on the Amiga path (the Windows directory is `cok_head1`, the json says `CoK_HEAD1`).
- Cross-game guard: the SSI "presents" screens of CoK and DoK share a layout (identical in 64-72% of pixels) and were merged
  once; grouping now never folds two different games.
- 51 -> 60 proposal: 30 unchanged (DQK, Gateway, Pool), 17 swapped DOS->Amiga or renamed (CoK/DoK scenes and portraits, the
  DoK/CoK title items), 4 dropped (CoK PIC1 015 and 058, DoK PIC 086 and 095; still in the inventory, not proposed this
  round), 13 added (DoK scenes/monsters, CoK teal dragon / skeleton knight / floating castle, CoK scrn1b + text1).
- Sequences (`SEQUENCES` in imggen_candidates.py; the candidate carries `sequence {id, order, role, parent, x, y, note}`):
  DoK `dok_title` = Title0 (SSI presents) -> Title1 (moon + riders, no text) -> Title1A (Dragonlance band, overlay at (0,88))
  -> Title1B (DEATH KNIGHTS OF KRYNN, overlay at (0,88), REPLACES 1A); CoK `cok_title` = scrn1b -> scrn2 -> text1 (overlay at
  (40,8)) -> text2 (Dragonlance band Vol. I, overlay at (0,8), REPLACES text1). Parent of every overlay is step 2. Steps whose
  group was already restyled in the pilot (DoK 1 and 3, CoK 2) stay in the sequence, tagged "done in pilot", not generated again.
  Sequence steps are exempt from the wrap/clip exclusion (CoK text1's last letter touches the right edge in both independent
  decoders, so the cut is in the data).
- Matte for the Amiga bands: DIFF-MATTE (band != parent crop, closing 1 px), not the IFF stencil. Measured: the `_rgba`
  stencil has IoU 0.18-0.41 with the lettering and misses most of it while keeping backdrop. The DOS bands use the same rule.
  The result is an RGBA PNG per layer (`layers/<id>.png`) plus its parent, staged for the viewer; the Dragonlance band is a
  proper transparent layer item.
- Packages: `python tools/imggen_webpack.py sequence-manifest dok_title --out m.json` then `make --manifest m.json --batch dok_title`
  builds `renders/imggen/webpack/dok_title/` (and `cok_title/`): one input per not-done step, overlays on a flat key colour with
  a `_context.png`, plus `sequence.json` and `SEQUENCE.md` (ordered steps, placements, which are generated). `--include-done`
  regenerates the pilot steps too. `compose` places the imported layers on the restyled (or native) parent as before.
- Viewer (`?restyle=proposal`): per game one group card per sequence (steps in order, composite as the game draws it,
  checkerboard layer, placement, "done in pilot" tag, DOS twin thumb), cards carry the DOS twin thumb, identical same-platform
  alternates collapse to "xN". `--stage-site` additionally stages sequence members (including done ones), layer PNGs and twin
  thumbs; verified with zero failed requests from a static build served by `python -m http.server`.

Unverified: no real model output has gone through the sequence packages (inputs only); the Amiga title bands have no
retail-capture composite check (only the DOS TITLE.DAX placement equality); descriptions of the Amiga pictures were written
from the renders by eye.

## Game text context and animation (2026-10-14)

`tools/imggen_candidates.py` now annotates every candidate with `animation` (frames, changed_fraction, bbox, kind, dos_twin; from
`renders/imggen/animation/candidates_animation.json`) and CoK/DoK candidates with `game_text` (ECL narration from
`tools/imggen_scene_text.py`, looked up by block id because Amiga PIC files bundle differently from the DOS ones). Records are ranked
narration > dialogue-mixed > prompt, then by confidence. `game_text.context` is the one text a prompt may use: scenes take the best
narration/dialogue record, portraits (an NPC talking) only narration, quoted speech is removed and labelled, player questions are
dropped, the text is cut at a sentence at 320 characters, and an id shared by several PIC families is flagged `ambiguous` and never used.
`tools/imggen_batch02_descriptions.json` can override per item with `game_context`: `false` (suppress) or an int (use that record).
Seven proposed items carry such an override (written after comparing text with picture); the rest follow the automatic rule.

`imggen_webpack.py proposal-manifest [ids | --selection selection.json | --all-proposed] --out M.json` builds a manifest from
candidates.json; `build_prompt` adds a `[GAME CONTEXT]` block (the text, then: background only, the picture is the authority, draw no
text). Animated items get an `animation` block in manifest.json: restyle frame 0 only; `plan` is `small-loop` (region-loop, or
large-region with <= 12% changed and bbox <= 50%; `extra_frames` names the original frames, nothing is generated) or `static-first`.
DQK overlay patches (PICA set04 img007, set13 img003) are never eligible for the proposal. The viewer (`?restyle=proposal`) shows a
collapsible "Spillets tekst" block, an "Animeret" badge and, for Amiga CoK/DoK, a looping preview of the original frames
(Pool f1+ are raw XOR deltas and DQK img00N>1 are patches, so those get the badge only). Not verified: that each narration
describes what the picture shows (ECL paths are static, not a play transcript).
