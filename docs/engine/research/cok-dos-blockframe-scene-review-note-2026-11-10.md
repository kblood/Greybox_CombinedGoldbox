# CoK DOS-EGA block-frame scene review (queue family unit) — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).
Method gap: [cok-scene-review-native-size-gap-2026-11-10.md](cok-scene-review-native-size-gap-2026-11-10.md).
Previous unit: [cok-pic2-scene-review-note-2026-11-10.md](cok-pic2-scene-review-note-2026-11-10.md).
Review data: `cok-dos-blockframe-scene-review-2026-11-10.json` (112 unique pairs, one outcome each).

## Scope

The queue's DOS-EGA `block-frame` rows still in `review-location-peer` with no reviewed pair from any earlier unit: 19 rows (`COMSPR.DAX` 153 and 25; `PIC2.DAX` 14 frames 0 to 4 and block 5; `CPIC3.DAX` 44 and 172; `SPRIT2.DAX` 5, 28 and 56). Their location peers are Amiga block-frame rows in other archives (`PIC1.DAA`, `PIC2.DAA`, `CPIC1.DAA`, `CPIC2.DAA`, `SPRIT1.DAA`, `SPRIT2.DAA`, `COMSPR.DAA`), so their pairs were never on a contact sheet.

The 19 rows give 112 unique (DOS row, Amiga peer) pairs. 36 pairs match on frame index and were judged visually. The other 76 are cross-frame and are `not-same` by the frame-index rule. The review script asserts both facts.

## Method

The frame-index rule from the SPRIT1, SPRIT2 and PIC2 units, applied unchanged:

- `same-scene` only when the DOS frame and the Amiga peer frame have the same animation index, the same figure and the same pose, and only the palette, transparency key or dithering differs.
- A pair whose frame indices differ is `not-same`.

This is an application of the existing rule, not a new threshold. No metric decided an outcome.

Visual judgment was made on 1× contact sheets (`dosbf-sheet-1..5`, 8 pairs per sheet, DOS on the left). Sheet indices are the frame-matched order.

Native sizes differ in 32 of the 36 frame-matched pairs. Only pairs 2, 3, 12 and 13 (`PIC2.DAX` 14 and 5 against `PIC1.DAA`/`PIC2.DAA`) are equal size (88×88 on both sides), so only those four have a channel comparison. The channel values are recorded as evidence only. For the 22 `same-scene` pairs, 18 are unequal-size pairs, so their edges rest on visual review at different native resolutions. That is option (a) of the open method gap note, which is still the default and still awaits the user's decision.

## Outcome

Same scene (22 frame-matched pairs):

| Index | DOS row | Amiga peer | Subject |
| --- | --- | --- | --- |
| 2, 3 | `pic2.dax/14/frame 0` | `pic1.daa` and `pic2.daa` `14/frame 0` | dragon head with sword and cyan ring, same pose (equal size) |
| 12, 13 | `pic2.dax/5/frame 0` | `pic1.daa` and `pic2.daa` `5/frame 0` | segmented creature on grey (equal size) |
| 14, 15 | `cpic3.dax/172/frame 0` | `cpic1.daa` and `cpic2.daa` `172/frame 0` | warrior with shield, same stance |
| 16, 17 | `cpic3.dax/44/frame 0` | `cpic1.daa` and `cpic2.daa` `44/frame 0` | warrior with shield and sword |
| 18, 19 | `sprit2.dax/28/frame 0` | `sprit1.daa` and `sprit2.daa` `28/frame 0` | armoured figure with shield |
| 24, 25 | `sprit2.dax/5/frame 0` | `sprit1.daa` and `sprit2.daa` `5/frame 0` | horned creature with tendrils |
| 26, 27 | `sprit2.dax/5/frame 1` | `sprit1.daa` and `sprit2.daa` `5/frame 1` | same creature, smaller frame |
| 28, 29 | `sprit2.dax/5/frame 2` | `sprit1.daa` and `sprit2.daa` `5/frame 2` | tiny blob creature (low confidence) |
| 30, 31 | `sprit2.dax/56/frame 0` | `sprit1.daa` and `sprit2.daa` `56/frame 0` | winged creature, wings up |
| 32, 33 | `sprit2.dax/56/frame 1` | `sprit1.daa` and `sprit2.daa` `56/frame 1` | same creature, smaller frame |
| 34, 35 | `sprit2.dax/56/frame 2` | `sprit1.daa` and `sprit2.daa` `56/frame 2` | tiny winged creature (low confidence) |

Not the same (14 frame-matched pairs):

- 0, 1: `comspr.dax/153` and `comspr.dax/25` (frame 0) are blank bevelled 24×24 tiles against blank tiles. No subject appears on either side. Not the same. This is the same family of blank cells as task 49.
- 4 to 11: `pic2.dax/14` frames 1 to 4 are fragments (a sword or a breath wisp). The Amiga peers show the whole dragon. Pairs 6 to 9 are also garbled in the DOS decode; the low confidence applies.
- 20, 21: `sprit2.dax/28/frame 1` shows a figure in a lunge against an upright figure with a spear. The pose differs.
- 22, 23: `sprit2.dax/28/frame 2` is a tiny frame and the pose could not be confirmed (low confidence).

## Effect

- Overview gap count: 635 → 624. The drop is 11 DOS gap rows. The 22 Amiga peers are not gap rows in the queue (checked: none is a `review-location-peer` or `no-existing-field-peer` row), so the drop is 11, not 33.
- 22 new `same-scene` / `verified` edges were added (dedup against existing links: none skipped).
- The queue was regenerated: 624 gaps, 268 with a location peer, 356 without.
- DOS-EGA block-frame rows left in the queue: 205 → 194. All remaining DOS block-frame rows now have a reviewed outcome, but 8 of them keep only not-same judgments, so they stay in the queue. Those 8 are `comspr.dax/153`, `comspr.dax/25`, `pic2.dax/14` frames 1 to 4, and `sprit2.dax/28` frames 1 and 2.
- The 151 DOS tile and whole-image rows and the 54 Amiga tile rows remain unreviewed; they are not in any review yet.

## Limits

- The judgments are visual and not confirmed by a second reviewer.
- 18 of the 22 `same-scene` edges are between images of different native sizes. Their evidence is visual only. Option (a) is still the default; (b) or (c) is still open for the user.
- Weakest same-scene calls: pairs 28 and 29, 34 and 35 (tiny frames). Weakest not-same calls: pairs 6 to 9 (garbled DOS decode), 20 and 21 (close pose), 22 and 23 (tiny frame).
- Frame-matched pairs judged not the same can still be the same character in another pose. Under the frame-index rule that is not a same-scene edge.

## Not changed

- No pixel-identical link was added (no exact hash matches exist for these pairs).
- The blank-glyph decision (task 49) and the atlas-cell method exception (task 48) are unchanged.
