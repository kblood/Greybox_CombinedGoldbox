# Animated Gold Box pictures and the ChatGPT restyle (2026-10-14)

Tool: `tools/imggen_animation.py` (`measure`, `prototype`); tests: `tools/test_imggen_animation.py` (27, each rule has a
control that fails when the rule is broken; three mutations were seen red: dropped Pool XOR, dropped transparent skip,
and a bbox-only classifier). Output is git-ignored: `renders/imggen/animation/` (`summary.json`, `sheets/`,
`candidates_animation.json`, `proto/`). Companion to `imggen-webpack.md`. No image model was called anywhere.

## 1. What is animated, and how it is stored (measured from the bytes)

Frames are compared in palette-index space after the real delta rule is applied (`changed` = pixels of any frame
that differ from frame 0).

| storage | games | rule | evidence |
|---|---|---|---|
| XOR delta vs frame 0 | CoK/DoK Amiga `PIC*.DAA` and DOS `PIC*.DAX`, Gateway DOS `PIC*.DAX`, **Pool Amiga `pic`/`final`** | frame k = f0 XOR stored | the blink/dragon-breath/zombie-hand sheets show coherent animation only after applying it |
| overlay patch | DQK DOS `PICA/B/C.TLB` (image 1 opaque, images 2..n transparent-255 patches with x,y) | composite onto f0 | patch sizes e.g. 88x36 at the top of set06 (visor) |
| one image per set | DQK Amiga `PICA/B/C.TLB` (65 sets, 0 skipped), Gateway Amiga `Pic.tlb` (73 sets) | none | the Amiga ports of those portraits are static as stored |

**Correction found on the way:** `docs/pool-amiga-format.md` section 3 says pic/final frames are "full frames, no XOR delta".
That is wrong. Raw frames 1..n have 60-93% zero indices and an edge density far from frame 0's; `f0 ^ fk` matches frame 0's
edge density in 47 of 52 multi-frame PIC blocks (raw 2, overlay-with-zero-transparent 3). Applied, Pool PIC 11 is a hand
rising out of a grave, PIC 2 an orc walking, FINAL 7 a demon materialising. `test_pool_frames_are_xor_deltas_not_independent_pictures`
pins it. (The doc was not edited; it is outside my write list.)

## 2. Counts (`summary.json`; picture = one block/set)

| game / platform / family | pictures | multi-frame | frame counts (multi-frame) | changed px, median (min-max) | bbox of change, median |
|---|---|---|---|---|---|
| CoK Amiga PIC | 62 | 18 | 2-6 | 19% (1.2-57%) | 72% |
| CoK DOS PIC | 68 | 16 | 2-8 | 15% (1.1-56%) | 63% |
| DoK Amiga PIC | 47 | 17 | 2-6 | 23% (1.2-73%) | 80% |
| DoK DOS PIC | 43 | 15 | 2-8 | 20% (1.1-64%) | 80% |
| DQK DOS PICA | 21 | 6 | 3-7 | 52% (8-79%) | 97% |
| DQK DOS PICB | 21 | 4 | 3-6 | 13% (1.5-73%) | 82% |
| DQK DOS PICC | 25 | 4 | 4-8 | 12% (5-91%) | 54% |
| DQK Amiga PICA/B/C | 65 | 0 | 1 | - | - |
| Gateway DOS PIC..PIC6 | 74 | **1** (PIC:29, 6 frames, 1.6%) | 6 | 1.6% | 55% |
| Gateway Amiga | 73 | 0 | 1 | - | - |
| Pool Amiga PIC | 59 | 52 | 2-7 | 9% (0.9-83%) | 55% |
| Pool Amiga FINAL | 3 | 3 | 4-6 | 33% | 86% |
| CoK/DoK Amiga SPRIT | 49 | 49 (3 frames) | 3 | 9-58% | zoom series, not animation (excluded from tallies) |
| CoK/DoK/DQK BIGPIC, HEAD, BODY, CPIC, BACK | 400+ | 0 | 1 | - | single frame in our loaders |

Kinds (thresholds in `summary.json`): `region-loop` bbox <= 25% (blinks, a visor, a flame), `large-region` bbox 25-60%,
`scattered` bbox > 60% but < 25% of pixels change (flicker spread over the picture), `full-picture` > 25% of pixels
(head turn, body motion, morphs). Bbox alone is misleading: a union bbox of two distant blinks spans the picture; a test pins that
`scattered` is decided by changed fraction.

**Reading the sheets** (`renders/imggen/animation/sheets/*.png`, frame 0 | red union mask | frames): CoK PIC1:23 blinks
(1.2%, two eye boxes); skeleton PIC2:26 and DQK set06 move only the head/visor (8-11%); CoK dragon PIC2:10 breathes a cloud;
PIC2:14/16/17 turn the head or the whole body (40-57%); DQK PICB set09 is a mermaid-to-dolphin morph (73%); Pool pictures
are mostly whole-subject motion. **So "a small loop of a region" is only about a third of the animated portraits; the rest
move a large part of the picture.** Honest limit: delays and play order are not measured (frame order is stored order).

## 3. Candidates (`candidates_animation.json`, 290 ids)

89 of 290 candidates are animated (317 frames in total, 228 beyond the base): region-loop 13, large-region 25, scattered 22,
full-picture 29. Per game: CoK 14, DoK 14, DQK 6, Gateway 1 (DOS only), Pool 54. Of the 60 `proposed_batch02` items, **9 are
animated** (36 frames, 27 extra): Pool final 2, Pool pic 0/1/4/34/49, CoK PIC2:24, CoK PIC1:23, DQK PICA set03.
Kind `single` 179, `unmeasured` 22 (IFF screens/titles/logos, plus DQK TITLE/BIGPIC sets the loaders do not enumerate).

Two findings for the proposal page:
* **DQK `PICA_set04_img007` and `PICA_set13_img003` are overlay patches, not portraits** (their set's base is `img001`). They are
  tagged `source_frame_role: overlay-patch`; they should be dropped or replaced by the set's img001 (candidate-generator bug,
  not fixed: `tools/imggen_candidates.py` is off limits).
* **Gateway Amiga set 29 is static on Amiga but its DOS twin has 6 frames**; tagged `single` with a `dos_twin` block.

## 4. Strategy

Options: (A) restyle every frame; (B) restyle frame 0 only, derive other frames from the original deltas; (C) restyle
frame 0, then regenerate only the changed region of each frame with an image-edit/inpaint call guided by the restyled base.

Prototype (`python tools/imggen_animation.py prototype`, outputs `renders/imggen/animation/proto/*.gif|_strip.png|proto.json`).
**The restyle is SIMULATED** (4x Lanczos, bilateral smoothing, a smooth position-only warp of 0.6 native px, hue/sat/gamma
shift; each output is labelled). Variants per picture, against an "ideal" repeatable restyle of every frame as oracle:
`paste` = upscale+recolour the original frame and paste the feathered changed region; `aligned` = same but a dense optical flow
(original f0 upscale -> restyled f0) warps the patch into the restyle's geometry and a Lab transfer estimated on a ring of
unchanged pixels recolours it; `independent` = every frame restyled separately with an ASSUMED per-frame warp/colour drift
(+-1.6 px, 6 levels; the drift size is invented, only the direction is the point).

| picture | changed | paste MAE | aligned MAE | independent: flicker outside the change |
|---|---|---|---|---|
| CoK PIC1:23 blink | 1.2% | 27.6 | 4.8 | 28.6 (colour jump on one frame) |
| DQK PICA set06 visor | 8% | 17.3 | 3.5 | 8.3 |
| CoK PIC2:10 dragon breath | 11.7% | 26.4 | 10.4 | 23.4 |
| CoK PIC2:14 head turn | 40% | 17.4 | 3.3 | 25.2 |

MAE = mean absolute 8-bit error inside the changed region against the oracle; the mask methods have ~0 flicker elsewhere by
construction (unchanged pixels are bit-identical to the restyled base).

What the strips show (looked at, CoK PIC1:23 and PIC2:10):
* `independent` visibly shimmers: the background shifts colour on some frames and the face tone jumps on frame 3. That is the
  consistency risk of (A), but its magnitude here is my assumption, not a measurement of ChatGPT.
* `paste` is geometrically misregistered with the restyle (eye lids and the breath cloud sit about half a pixel off and are
  crisp pixel art inside a smooth painting). Visible seams.
* `aligned` hides misregistration and reads as one picture, **but this is the easy case**: the simulated restyle is a smooth
  warp, which optical flow recovers almost perfectly. A real generative restyle redraws the eye, so flow between the original
  and the restyled frame 0 will not describe how a closed lid should look; for those pixels the patch content is still
  the original pixel art, just warped and recoloured. The prototype therefore proves the *plumbing* (mask, feathering,
  outside-pixels-identical, colour transfer), not that the result will look like painted art.
* The 40% head turn "works" only because the simulation is geometry-preserving; with a mask that large (a third to half the
  picture) restyling frame 0 and patching is no cheaper than (A) and has no coherence advantage, since most of the picture is new.

## 5. Recommendation

1. **Tag, then triage by kind** (`candidates_animation.json`): 179 of 290 candidates are static; only act on the 89 animated.
2. **Restyle frame 0 only** for every animated candidate; it is the identity of the portrait and the only frame needed for the
   static proposal page. That costs the same as a static picture.
3. **region-loop and the small end of large-region (changed <= ~12%, bbox <= ~50%)**: use (C). Feed the restyled frame 0 and a mask
   (union bbox dilated, or per-frame mask) to the image-edit step with the original frame k's patch as the pose reference;
   composite the result with a feathered mask onto the untouched restyled base, so unchanged pixels stay bit-identical.
   Fall back to the `aligned` mask-delta patch for frames the model gets wrong. Cost: 1 edit call per extra frame
   (27 for the 9 animated proposal items; 228 for all 89), against 36 / 317 full generations for (A).
4. **full-picture and scattered (>25% changed or spread-out flicker, 51 of 89 candidates)**: either keep frame 0 as a static
   portrait (the engine already shows frame 0 until an animation plays) or restyle every frame as an edit of the restyled base
   with strong low-denoise guidance; do not rely on a mask. Pool is mostly in this class (52 of 59 animated), so Pool
   restyle should ship static first.
5. **Do not restyle DQK overlay patches as pictures** and do not feed `img00N>1` as a candidate source.
6. Always keep the frame-0 / delta structure in the import (store restyled frames + the original mask, or write them as new
   frames in the same container shape) so the engine can still play the loop.

The pipeline step to build next, once images exist: `imggen_webpack.py import` should take a restyled base plus per-frame
patches and call the same mask-composite used here; that file is out of scope for this task.

## 6. Not verified

* No real restyle was used. Every MAE/seam/flicker figure is a simulation result; the drift model for (A) is invented.
* `seam_gradient_ratio` (in `proto.json`) is near 1.0 for all methods and does not separate them; the strips do. Treated as inconclusive.
* Whether the engine actually plays these frames and at what delays/order (delay fields ignored; frame order = stored order).
  The user's observation "many portraits animate" is consistent with 52/59 Pool, ~30% CoK/DoK, 6/21 DQK-A, but not checked in the running game.
* HEAD/BODY/BIGPIC/CPIC are single-frame in our loaders; the Amiga standard-frame reader has no frame count, so animation
  there is not excluded. DOS Gen1 HEAD/BODY animation arrays yielded no multi-frame block with a constant size.
* IFF `CRNG` colour cycling on titles/screens was not measured (22 candidates `unmeasured`).
* Amiga DQK BIGPIC: the loaders enumerate 3 sets, the existing renders have 7; sets 4-7 not analysed. DQK Amiga overlay
  absence could mean the port dropped animation or that it lives in another file.
* `SPRIT` frames are excluded from the animated tally (CoK XOR zoom series, DoK independent zooms).
* DQK GLIB overlay offsets are unknown (assumed 0,0); the Amiga DQK PIC sets have no overlays so it did not matter.
* Pool XOR was decided by an edge-density vote (47/52), then confirmed visually on 5 blocks, not on every block.
