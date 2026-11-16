# Prior art: animation frames from image-edit models, and a plan for our XOR-delta portraits (2026-10-14)

Web research only; no image model was called. Companion to `imggen-animated-pictures.md` and `imggen-webpack.md`.
Labels: **documented** = vendor/official page; **user report** = forum/blog/vendor-marketing (marketing counts as weak);
**inference/speculation** = mine. Search tool results were summaries; pages marked "403" could not be read in full.

## 1. The model and its limits (as of 2026-10)

| fact | label | source |
|---|---|---|
| Product name "ChatGPT Images 2.5", released 2026-09-08; Wikipedia/community call the series "GPT Image 2.5". Predecessor Images 2 (April 2026, 2K output). Rolling out to all ChatGPT tiers, Codex, "desktop, mobile and web". | documented (OpenAI dev-community announcement; 9to5Mac 2026-09-08) | https://community.openai.com/t/introducing-gpt-images-2-5-in-the-api-and-chatgpt/1395897 , https://9to5mac.com/2026/09/08/openai-releases-chatgpt-images-2-5-with-sharper-details-and-more-precise-editing/ |
| Two API models: `gpt-image-2.5-flare` (default, faster) and `gpt-image-2.5-sunburst` ("tighter control across edits", slower). So "GPT Image 2.5" is right as a series name; API ids carry the codename. | documented | https://developers.openai.com/api/docs/guides/image-generation ; unite.ai summary https://www.unite.ai/openai-releases-chatgpt-images-2-5-with-sketch-and-two-new-api-models/ |
| Which model ChatGPT itself uses (flare vs sunburst) is not stated. One community poster claims the two can only be targeted in the API ("AFAIK"). | user report / unknown | same community thread |
| OpenAI's claims: "Consistent details across multiple edits", "comment-based edits to change only what you want", better subject preservation, 50% lower latency. | documented (marketing) | https://x.com/OpenAI/status/2097394956457623964 |
| Sizes: any WxH, multiples of 16, ratio 1:3..3:1, edges <= 3840, total pixels 655,360..8,294,400; > 2560x1440 "experimental". Our 1536x1024 canvas is fine. | documented | API guide above |
| Edit: multiple reference images allowed (doc example uses four; no stated cap in the page I read; one third-party says 16). **With several inputs the mask applies to the first image only.** Mask must have an alpha channel, same size/format; masking is "entirely prompt-based ... may not follow its exact shape with complete precision". Transparent mask pixels = region to edit. | documented (+ third-party for 16) | API guide; https://developers.openai.com/api/reference/resources/images/methods/edit ; https://www.adpicto.com/en/blog/gpt-image-2-image-editing-workflow |
| Transparent background: `background:"transparent"` with png/webp. Sources disagree for gpt-image-2 (preview vs unsupported); the 2.5 guide lists it. | documented, conflicting | API guide; https://replicate.com/openai/gpt-image-2 |
| `input_fidelity`: omit for gpt-image-2 (always high). Not mentioned for 2.5. | documented | API guide |
| Weakness: "may occasionally struggle to maintain visual consistency for recurring characters" across generations; imprecise placement in layout-sensitive compositions. | documented | API guide |
| ChatGPT desktop vs API: ChatGPT has no mask parameter that I could verify; its "comment on image" edit is the nearest UI equivalent. Attaching several images and writing a prompt is the standard ChatGPT flow (the user already does this per `imggen-webpack.md`). Max images per message and whether the UI honours exact output size are **not documented** in what I read. | inference | - |

Practical consequence: the API is the only route with a real mask, explicit size and `n`; ChatGPT is a prompt-only edit with
whatever resolution it picks. Our webpack flow is ChatGPT-first, so the mask option (c) below is **API-only** unless the
comment-edit UI is accepted as "approximate mask".

## 2. What others report for frame sequences

* **Sprite sheet in one image vs separate edits.** Single-image grid prompts exist (4x4 / 16 frames, transparent, identity
  reference; Indie Hackers post "GPT Image 2.5: a full sprite sheet from one reference" -- fetch 403, claims seen only via
  summary; promotional). The OpenAI community thread (April 2026) reports the opposite experience: full sheets "often come out
  incomplete, with repeated poses", left/right limb confusion, retries needed; recommends **frame-by-frame generation**, pose
  transfer with the pose as Image 1 and the character as Image 2, numbered mannequin references, and a **second "normalize
  style, character consistency and size, keeping all poses intact" pass**. https://community.openai.com/t/developing-sprite-sheets-with-gpt-image-2/1379831 -- user reports.
* **Identity pinning**: "use the uploaded image as the strict first-frame identity, palette, scale and style reference",
  in-place motion, fixed camera, explicit bans (Spriterrific prompt, vendor page) -- user report/marketing.
  https://spriterrific.com/pixel-art-walk-cycle-generator/
* **Drift** after a few frames in hair/outfit/proportions is the commonly reported failure; fix offered is "describe the
  whole sequence in one prompt, lock camera and background" -- user report, single creator.
* **Blink/closed-eye edits**: only still-photo "open closed eyes" prompts surfaced; the transferable idea is an explicit
  preserve list (eye shape, lid crease, iris colour, lighting, head tilt, camera) -- user report. No documented blink-sequence
  workflow with GPT Image was found. **Absence of evidence: I found none, so the blink case is untested territory.**
* **Other models** (older comparisons, mid-2025 to 2026, medium-quality blogs): Flux Kontext slightly better identity hold;
  Qwen-Image-Edit documented as having an "appearance editing" mode where everything outside the target stays untouched
  (best fit for a minimal region edit; faces drift more); Nano Banana (Gemini 2.5 Flash Image) rated highest on consistency in
  a 2026 review but one anime test reported it changed the eyes more than asked. Qwen/Kontext are open weights and could be
  run locally with a real mask workflow -- **inference**, not tested.
  https://medium.com/diffusion-doodles/qwen-image-edit-vs-flux-1-kontext-vs-nano-banana-93fba1348a77 ,
  https://www.nenobanana.com/blogs/qwen-image-edit-review-2026
* **Video route**: Veo 3.1, Kling 2.6+/3.0, Seedance 2.0, Wan 2.6, LTX accept first+last frame (documented by vendors/
  aggregators); good for a few-second shot, invents content when the two frames differ; set last frame = first frame for a
  loop. Frame interpolation: RIFE (its own repo says "not very suitable for 2D animation") and Google FILM. Nothing found on
  pixel-art loops specifically. https://help.intangible.ai/visualize/first-and-last-frame -- **speculation** that it helps us: a
  video model would redraw the whole portrait at video resolution and add camera/lighting motion, i.e. worse than an edit
  for a 1-2% blink.

## 3. Pixel-art pitfalls (user reports, convergent)

Image models paint a high-res "pixel look" on an implied grid; the grid drifts inside one image; naive downscale gives mixed
pixels; palettes explode (one test asked 12 colours, got 44,725); prompts such as "exactly 32x32, no anti-aliasing" are
ignored literally. Fixes: detect grid, one sample per cell by majority colour, quantise palette, nearest-neighbour upscale
only (Pixel Snapper, proper-pixel-art, perfect-pixel). https://dev.to/jenissimo/how-to-tame-your-ai-pixel-art-3pk5 ,
https://help.scenario.com/articles/1753861053-pixel-snapper-the-essentials . **Not directly relevant to us**: we do not want
pixel-art output at all; we ask for a *painted* restyle at k x native (k >= 3, `imggen-webpack.md`). It is relevant for one
thing: the 88x88 *input* has to be upscaled by an integer factor with nearest neighbour so the model sees clean blocks.

## 4. What this means for our deltas (evidence vs inference)

Evidence from our own repo: 9 of 60 proposed items are animated, 27 extra frames; only a third of animated portraits are
small loops (`imggen-animated-pictures.md` section 2); the restyle numbers there are simulations.
Inference (untested with GPT Image 2.5): a pair-conditioned edit will keep the rest of the picture *close* to restyled frame 0
but not bit-identical; the model redraws every pixel (the same reason the layer diff-matte was rejected in
`imggen-webpack.md`). So whatever the model returns for frame k must be **composited through the original delta mask onto the
restyled frame 0**, never used whole. Nothing found contradicts that; nothing found proves the edit quality.

Decision rule (unchanged from the animation doc, plus the one new fallback):
* region-loop / small large-region (changed <= ~12%, bbox <= ~50%): attempt option B (pair edit) then composite; if the
  result is rejected, fall back to the `aligned` mask-delta patch (no model call), which always works but looks pixel-art
  inside a painting.
* full-picture / scattered: ship frame 0 static first. Optional second wave: edit each frame from restyled f0 with the pair
  prompt but accept the whole frame (no mask composite) only if a drift check passes.

## 5. Package contents per animated item

Per item `<id>` (frame 0 = f0, original frame k = fk, all nearest-upscaled by the same k onto the same 1536x1024 canvas,
same pad box as f0 so the images register pixel-for-pixel):

1. `<id>_f0.png` original frame 0 (this is today's `_input.png`).
2. `<id>_fk.png` original frame k (frame 0 XOR delta applied, so it is a complete picture).
3. `<id>_diff_k.png` diff highlight: f0 with the changed pixels (union over `f0 != fk`) tinted a flat magenta at 50% plus a
   1-native-px outline; purely a *locator* for the human/model ("the change happens inside the magenta area"). Never used in
   composites.
4. `<id>_r0.png` the accepted restyled frame 0 (produced by step A; imported to the same canvas coordinates).
5. `<id>_mask_k.png` (API option C only): RGBA, alpha 0 on the changed region dilated ~3 native px (x k), alpha 255 elsewhere,
   same size as r0.
6. Prompt files `_prompt_f0.txt`, `_prompt_fk.txt`, `_prompt_fk_mask.txt` and a `RUN.md` row (order of attachments is part of
   the instruction -- keep it fixed; the model reads "Image 1/2/3" by attachment order, **inference** from the pose-transfer
   user report).

Calls: 1 (frame 0) + (frames - 1) per animated item; 9 proposal items = 9 + 27 = 36 chat calls, plus retries (budget 2x).
Use a **new chat per frame k**, attaching r0 each time: it avoids the context accumulating other frames (drift source is a
hypothesis, user reports suggest retry beats repair). Keep frame 0 in its own chat so it can be re-rolled without
invalidating frames.

## 6. Prompt templates

(a) Restyle frame 0 -- the existing STYLE / CONTENT / CONSTRAINTS prompt from `_prompt.txt`, plus for animated items:

```
[ANIMATION NOTE] This picture is frame 1 of a short loop. Draw it neutrally: <for blink items: eyes open, relaxed>.
Keep every feature that will later change (eyelids, mouth, <region from the diff>) clearly drawn and unobstructed, with
simple readable shapes, so that a later edit can change only that part.
```

(b) Frame k as a paired edit (attach in this order: Image 1 = r0 restyled frame 0; Image 2 = original frame 0; Image 3 = original
frame k; optional Image 4 = diff highlight):

```
You are making one animation frame. Image 1 is the finished, restyled picture (frame 1). Images 2 and 3 are the ORIGINAL
low-resolution pixel-art pair: Image 2 is the original frame 1, Image 3 is the original frame <k>. Image 4 (if present) marks
in magenta where Image 3 differs from Image 2.

Task: output Image 1 again, changed ONLY by the same difference that exists between Image 2 and Image 3
(<one-line human description, e.g. "both eyes closed, eyelids lowered, lashes visible">). Copy the painting style, brushwork,
palette, lighting, outline and pixel positions of Image 1 exactly. Everything outside the changed area must stay
identical to Image 1: same background, same face shape, same hair, same clothing, same framing, same canvas size and padding,
no re-centering, no zoom, no new objects, no text. Do not use Images 2 or 3 as a style reference; only as a description of
what moves. Output one picture only, not a sheet.
```
Variants: for several changed regions list them; for items where the change is large (head turn) say "the pose of Image 3
should be matched in Image 1's style" and drop the identical-everywhere sentence.

(c) Mask-region alternative (API: `images/edits`, `image[]` = [r0, f0, fk], `mask` = `_mask_k.png` for r0, model
`gpt-image-2.5-sunburst` for "tighter control across edits"; or flare for cost; same size as r0; `quality` high):

```
Edit only the transparent (masked) region of Image 1. In that region, redraw it so it shows what Image 3 shows where it differs
from Image 2 (<description>), in exactly the painted style of Image 1. Leave all other pixels as in Image 1.
```
Even with a mask, documented behaviour is "prompt-based" and may not follow the shape exactly, so composite anyway.

(d) Normalise pass (only if a set of frames visibly differs in colour/scale): attach r0 and the candidate; "make Image 2 match
Image 1's colour, tone and size exactly, keeping Image 2's pose" (adapted from the community normalize prompt).

## 7. Post-processing and acceptance (all on our side; plumbing already prototyped)

1. Undo pad/crop and Lanczos to k x native as `import` does; register candidate fk to r0 with dense optical flow on the
   *unchanged* ring only; estimate Lab colour transfer from that ring (prototype `aligned` method).
2. Composite: `out = r0` outside; inside the original-delta mask (dilated 2-3 native px, feathered ~1 native px) take the
   aligned model output. Unchanged pixels are then bit-identical to r0.
3. Reject the model frame (fall back to the aligned original patch) if: mean abs difference vs r0 *outside* the mask exceeds a
   threshold tuned on the first real batch (unknown today); or the model output's change area, thresholded, has IoU < ~0.5
   with the original delta mask (wrong region changed -- this checks the model actually did the blink); or frame
   count/size mismatch.
4. Re-encode as deltas against r0 (`store restyled frames + original mask`) so the engine plays them like the original loop.
5. No RIFE/FILM interpolation: our frames are 2-8 stored key poses with original timing; interpolation would invent in-betweens
   the game never had (and RIFE advises against 2D animation). No video-model route for blinks (see section 2).

## 8. Fallback ladder

1. Pair edit (b), one retry (user reports: retry beats "fix it" follow-ups).
2. API masked edit (c) if an API key is acceptable.
3. Open-weights local edit (Qwen-Image-Edit / Flux Kontext) with a real mask -- documented to hold outside regions best;
   not evaluated for painted 88x88 restyles. Offered, not recommended before 1-2 are measured.
4. Aligned mask-delta patch from the original frames (no model, always available).
5. Static frame 0 only (the engine already shows it).

## 9. First experiment before scaling (what to measure)

Take CoK PIC1:23 (blink, 1.2% changed) and DQK PICA set06 (visor, 8%). Run (b) five times each in fresh chats, then record:
fraction of runs whose outside-mask drift is below threshold; fraction where the changed region matches the original delta
(IoU); whether Image 4 (diff highlight) helps -- run with and without it, one variable at a time. Also run (b) with only
Images 1 and 3 (no original f0) as the control for whether the pair adds anything. Until that is done, every quality statement
about section 6 is a hypothesis.

## 10. Not verified

* The exact model behind ChatGPT's image tool, per-message image cap, and whether ChatGPT keeps requested canvas size.
* Whether Images 2.5 handles "change only the eyelids" at painted 88x88-derived scale; no blink-specific report found.
* Indie Hackers sprite-sheet post (403) and LinkedIn "insanely good for animated videos" posts: not read.
* Flux/Qwen/Nano Banana comparisons are 2025-26 blog comparisons on photo/anime content, not pixel-art portraits.


## 11. Chain mode (2026-10-14): previous restyled frame + a one-line change description

Tool `tools/imggen_frame_chain.py`, tests `tools/test_imggen_frame_chain.py` (22; four mutations seen red: step mask vs frame 0,
empty diff calling the model, composite returning the whole model output, manual override not winning). Packs:
`renders/imggen/animation/chain/<id>/` (git-ignored). No image model was called; the only model used is a local Ollama vision model
that writes the change text.

**Scheme.** r0 = restyled frame 0. Step k: attach Image 1 = r(k-1) (restyled), Image 2 = ORIGINAL k-1, Image 3 = ORIGINAL k
(optional Image 4 = diff highlight); prompt "Edit the first image so that <description>; everything else must stay identical ...".
Frames compared are TRUE consecutive frames (the loaders already apply the XOR deltas; a stored delta says "k vs 0", not "k vs k-1").
After ChatGPT answers, `composite` clamps the result to the original k-1 -> k change mask (grown 2 native px, 1 px feather), so pixels
outside the mask stay bit-identical to r(k-1). Two anti-drift rules the pack applies without any model call: a frame pixel-identical to
an earlier original frame j reuses r(j) (CoK PIC1:23: frames 3,4,5 are exactly frames 0,1,0, so only 2 of 5 steps need ChatGPT); and
`composite_step(revert=...)` can restore r0 on pixels where the original goes back to frame 0.

**Chain vs reference-to-frame-0 (drift).** Reference mode (section 6b: always attach r0 + original f0 + original fk) never stacks edits:
every frame is one edit away from r0, errors do not compound, but the edit can be large (head turn) and must be re-described against
f0. Chain mode makes every edit small (good for a model that tends to redraw), but frame k inherits everything the model did to frames
1..k-1: colour/brush drift in the changed region compounds, and a loop that returns to its start need not close. Mitigations built in:
the composite clamp each step (the unchanged area cannot drift at all, so drift can only live in the repeatedly-edited region),
exact-frame reuse for returning loops, a new chat per step, and a fallback to reference mode (`Image 1 = r0`) when two consecutive
restyled frames visibly diverge. Which is better with GPT Images 2.5 is **untested**; run both on PIC1:23 before scaling (the
five-run experiment of section 9).

**Local description-model bake-off** (9 consecutive-frame pairs from 4 animations: CoK PIC1:23 x3, DQK PICA set06 x2, CoK dragon
PIC2:10 x2, CoK head turn/sword PIC2:14 x2; ground truth = my own reading of the frames; input = labelled before|after panel, no diff
panel; temperature 0, think off). correct / vague / wrong:

| model | correct | vague | wrong | s per call | notes |
|---|---|---|---|---|---|
| granite3.2-vision | 0 | 0 | 9 | 2-4 | echoes the hint ("1.2% of the pixels change") or invents "pixel changes from green to purple" |
| qwen3.5:9b | 3 | 1 | 5 | 2.3 | right on blink close/open and "remove the puff"; invents colour changes on subtle ones |
| qwen3.5:27b | 2 | 6 | 1 | 2.7 | vaguer, fewer outright errors |
| qwen3.6:27b | 2 | 4 | 3 | 2.7 | |
| gemma4:26b | 2 | 4 | 3 | 2.3 | |
| gemma4:31b | 3 | 5 | 1 | 9-20 | best: "Close the eyes; nothing else changes", "Shift the pupils of both eyes slightly to the right" |
| gemma4:e4b-it-qat | not in this table | | | | failed the identical-pair control, see below |

Findings: (1) **a diff-highlight panel does not help and leaks into the text**: outputs that mention magenta (with the panel) were 4/9
for qwen3.5:9b, 8/9 for qwen3.5:27b, 3/9 qwen3.6:27b, 1/9 gemma4:26b, 0/9 gemma4:31b ("add magenta highlights", "change head colour
to magenta"); without the panel nothing leaks and correctness was equal or better for every model. (2) Every model fails the large
change (PIC2:14, 35% of pixels) and the subtle glow flicker (DQK visor): they invent colour edits. (3) The region hint ("7.4% of
pixels change, in the top centre") did not rescue those. So the text is a **draft for clearly visible, blink-type changes only;
anything else needs the `manual` field** (`descriptions.json` `manual` always wins and is never overwritten by a re-describe;
`description_source` in `steps.json` says which was used). Limits: 9 pairs, one run each, one human scorer.

**Input-mode controls for the chosen default `qwen3.5:9b`** (7 cases x 3 modes, keyword-scored then read by me; cases: real blink
close, real blink open, the close pair REVERSED, synthetic red square added, IDENTICAL pair, real dragon puff appears, puff REVERSED):

| mode | known-change cases | reversed-order controls | identical pair | extras / hallucination |
|---|---|---|---|---|
| two separate images, "Image 1 = BEFORE, Image 2 = AFTER" (**default**) | 6/6 | open<->close and appear<->remove flip correctly | "No change." | cleanest, shortest |
| one side-by-side composite (left before, right after, labelled) | 6/6 | flips correctly | "No change." | adds invented details ("add blue irises", "pink blush") |
| before + after + diff image | 6/6 | flips correctly | "No change." | leaks the magenta ("add pink eyeshadow") |

So 9b does track two images in order and says "No change." on identical input; it fails on fine detail (bake-off), not on ordering.
(The pipeline also never sends an empty diff to the model: a test pins empty mask -> "No change." with the model mocked to raise.)
**gemma4:e4b-it-qat**, same prompts: 4/7 known-change cases in two-image mode, **identical-pair control failed in all three modes**
(invents "change hair colour ..."), composite mostly wrong; not recommended, so it does not beat 9b in any input mode.
Ordered image *sequence* (all 6 PIC1:23 frames in one request, labelled FRAME 0..5): both 9b and e4b gave the correct list (close,
open, no change, close, open; true consecutive diffs 1.2/1.1/0.5/1.2/1.2%). As one contact strip 9b lists states ("eyes open / eyes
closed ...") and e4b hallucinates a moving mouth. My reversed-sequence control was uninformative (the blink pattern is palindromic), so
sequence ordering is **not proven**; the pairwise reversed controls above are.

**Video input -- verified, not assumed.** Gemma 4's model description says it processes video natively, but Ollama's library page lists
text/image only (E2B/E4B audio in the info table); `ollama show gemma4:e4b-it-qat` lists completion, vision, audio, tools, thinking --
**no video** -- and Ollama here is 0.40.0. Tested: an 8x-upscaled 6-frame GIF (1 s per frame) in the `images` field: e4b said it got no
frames; qwen3.5:9b treated it as one still; a `videos` field is silently ignored (9b then wrote an invented story, i.e. it never saw
the file). `llama-mtmd-cli` (WinGet llama.cpp) has only --image/--audio, no video option; ffmpeg is not installed; transformers 4.53.3
is probably too old for Gemma 4. **I did not try HF transformers or any other video path**, so "video works somewhere on this machine"
is neither shown nor excluded. Image sequences are the usable route.

**Packages built** (`cok_amiga_daa_cok_pic1_pic1_023_f0`, 6 frames; `dqk_dos_hlib_pica_pica_set06_img001`, 3 frames):
`00_f0_input.png`, `00_prompt_f0.txt`, per step `stepNN_img2_orig_prev / img3_orig_k / img4_diff .png`, `stepNN_panels.png`,
`stepNN_prompt.txt`, `descriptions.json`, `steps.json`, Danish `INSTRUCTIONS.md`, empty `done/`. PIC1:23 needs only steps 1-2
(3-5 reuse r0/r1/r0). The DQK descriptions are my manual overrides (9b's "change the eyes from orange to red" was wrong).
Unverified: any ChatGPT result; the composite on real model output (only synthetic tests); chain vs reference quality.
