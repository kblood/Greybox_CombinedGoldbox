# Title-intro partial-image placement

Several `TITLE.DAX`/`TITLE.TLB` members are partial redraws, not standalone pictures. Placing every
partial image at `(0,0)` produced visibly broken intros: some belong near the middle and others near
the bottom. The archive families provide two different ways to recover the intended placement.

## Standard DAX: maximize matching background pixels

Standard DAX title-band headers usually report zero offsets, but the bands contain background art
copied from the full picture underneath their new lettering. `findBestIndexedOverlayPlacement()`
(`packages/engine/src/render/overlayPlacement.ts`) slides a band through every position where it fits
and counts equal, non-transparent palette indexes. The highest score is the placement used by
`apps/web/src/ui/intro.ts`; successive bands are applied to the current screen so title/subtitle
reveals accumulate.

The real archives produce these maxima:

| Game | Band | Recovered `(x,y)` | Matching pixels |
|---|---:|---:|---:|
| Champions of Krynn | 240×88 | `(40,8)` | 15,209 / 21,120 (72.0%) |
| Champions of Krynn | 320×88 | `(0,8)` | 20,003 / 28,160 (71.0%) |
| Death Knights of Krynn | 320×80 | `(0,88)` | 16,284 / 25,600 (63.6%) |
| Death Knights of Krynn | 320×88 | `(0,87)` | 10,643 / 28,160 (37.8%) |
| Curse of the Azure Bonds | 240×112 | `(48,88)` | 15,492 / 26,880 (57.6%) |
| Curse of the Azure Bonds | 320×112 | `(0,88)` | 19,567 / 35,840 (54.6%) |
| Secret of the Silver Blades | 288×88 | `(16,40)` | 15,995 / 25,344 (63.1%) |
| Secret of the Silver Blades | 248×88 | `(40,40)` | 14,882 / 21,824 (68.2%) |

This is deterministic extraction from the game pixels, not a per-game position table. A real CoK
archive regression test pins `(40,8)` and `(0,8)` in `overlayPlacement.test.ts`; the same test covers
both bands from DoK, CoAB, and Secret against their real archives. Synthetic tests cover changed
lettering, transparency, malformed inputs, and tie-breaking.

### Native DOS implementation status

The native `CGB` viewer has a same-archive `/O block x y` compositor operation.
`GBBOOT` uses it for the two Gen1 Krynn title archives: it displays block 0,
then block 1 with block 2 and block 3 respectively, at the coordinates in the
table above. `gbcok-playable-flow-test.ps1`, `gbdok-intro-flow-test.ps1`, and
`gbdok-playable-flow-test.ps1` use disposable game-data copies and require all
three bounded CGB frames, so a return to the former two-frame/native-uncomposed
route fails the DOSBox gate. This is intentionally scoped to CoK and DoK; the
other archive structures retain their own renderer paths.

Verified correction, 2026-09-08: GBBOOT's implementation had actually applied
the three-frame Krynn sequence to every Gen1 profile. The optional
`gbboot-test.ps1 -EngineSmoke` Pool title/combat case exposed a final
`/O 3 0 8` band argument where its unchanged fixture required the plain second
frame. The previous executable reproduced that argument on the same fixture.
The native loop now explicitly gates band composition and the third frame on
CoK/DoK. Other Gen1 profiles retain the existing two-frame preview; this is
not full native title parity with the per-game browser sequences below.

The remaining supported fantasy Gold Box title archives do not use this partial-redraw shape: Pool of
Radiance has two complete EGA frames; Gateway has five complete VGA-extended frames; Treasures of
the Savage Frontier and Pools of Darkness have complete VGA256 frames; DQK and NWN use the distinct
structures documented below. The production intro smoke runs all ten routes so changes to the
generic compositor cannot silently regress one of those unaffected forms.

| Game | Archive structure | Rendered screens |
|---|---|---:|
| Champions of Krynn | 2 complete EGA frames + 2 correlated bands | 3 |
| Death Knights of Krynn | 2 complete EGA frames + 2 correlated bands | 3 |
| Curse of the Azure Bonds | 2 complete EGA frames + 2 correlated bands | 3 |
| Secret of the Silver Blades | 2 complete EGA frames + 2 correlated bands | 3 |
| Gateway to the Savage Frontier | 5 complete VGA-extended frames | 5 |
| Pool of Radiance | 2 complete EGA frames | 2 |
| The Dark Queen of Krynn | 3 HLIB backgrounds + 7 coordinate-bearing overlay sets | 7 |
| Treasures of the Savage Frontier | 6 complete VGA256 frames | 6 |
| Pools of Darkness | 3 complete VGA256 frames | 3 |
| Neverwinter Nights (DOS/AOL) | 1 complete EGA frame + 2 complementary half-frame pairs | 3 |

## Neverwinter Nights: complementary halves

NWN's five standard-EGA blocks have a different structure:

- block 1: one complete 320×200 publisher screen;
- blocks 2 and 3: two alternative 320×96 upper halves;
- blocks 4 and 5: their corresponding 320×104 lower halves.

Because `96 + 104 = 200`, these are paired ordinally (`2+4`, `3+5`), producing three screens total.
They must not be correlated as overlays on block 1.

## HLIB: use the coordinates stored by the game

HLIB image headers store signed vertical/horizontal placement hints. A positive stored value moves
the source up/left, so normal screen coordinates are `x = -hoff`, `y = -voff`. The decoder now
preserves those coordinates on `IndexedImage`, the encoder writes them back with the inverse sign,
and `tools/hlib_decode.py --list` reports them.

DQK's `DISK1/TITLE.TLB` also makes screen grouping explicit: all images in one `setNN` are drawn
together over the most recent full-screen background. Its 15 image members therefore form seven
composite screens, not twelve independently placed overlays:

| Background | Output set | Images and stored placement |
|---|---|---|
| set01 | set02 | 272×85 at `(24,69)` |
| set01 | set03 | 320×95 at `(0,59)` |
| set01 | set04 | 312×75 at `(8,47)` + 248×21 at `(24,169)` |
| set05 | set06 | 320×46 at `(0,37)` + 320×65 at `(0,83)` |
| set05 | set07 | 320×80 at `(0,21)` + 176×82 at `(64,100)` |
| set08 | set09 | 288×73 at `(24,16)` + 272×90 at `(24,90)` |
| set08 | set10 | 280×81 at `(24,23)` + 256×80 at `(24,104)` |

Each set's partial VGA palette is merged over its background palette with `mergePalettes`; all pieces
in the set are then blitted at their extracted coordinates into one 320×200 frame.
