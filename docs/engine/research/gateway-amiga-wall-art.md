# Gateway to the Savage Frontier: Amiga wall art over DOS wall geometry (2026-08-09)

The second GLIB/DataLib-era title to earn the in-dungeon DOS-EGA↔Amiga wall-art toggle, after
Pools of Darkness (`pools-amiga-wall-art.md`). Where Pools passed cleanly and its whole master was
declared usable, Gateway is the title that produced a *boundary* — and, along the way, a measurement
bug that had to be caught and corrected before anything shipped.

Route: `?explore=gateway-amiga` (ECL2/GEO2 block 2). Acceptance:
`explore-gateway-amiga-graphics-switch` (`apps/web/test/e2e.mjs`). Engine goldens:
`packages/engine/test/gatewayAmigaWallArt.test.ts`.

Sources: DOS `C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier`; Amiga WHDLoad
unpacked `GatewayToSavageFrontier/data/DiskC` (`Walls.tlb`, `WallDef.glb`) and `.../DiskA`
(`Always.tlb`). Both read-only, never vendored.

---

## 1. What holds

**A. The wall definitions are byte-identical.** `WallDef.glb` is a `DATA` library whose id table
names DOS 8X8D/WALLDEF block ids. 13 of its records are byte-identical to the DOS `WALLDEF*.DAX`
block of the same id, 780 bytes each. 6 more Amiga wall sets have no DOS counterpart in any WALLDEF
archive — recorded rather than asserted away, since nothing on the DOS side indexes them. So both
platforms' geometry names the same tile *numbers*.

**B. The id table is the right mapping.** Proven by idiosyncratic per-bank padding counts agreeing
exactly on both sides: block 51 pads 33 of its 70 slots, 53 pads 39, 55 pads 28, 57 pads 23, 59 pads
50, 61 pads 21. A wrong pairing would have to coincidentally reproduce all six. Reinforced by tiles
that survived the port byte-identically landing at the same index, and by checking that no *other*
DOS block scores better against a given Amiga bank than the declared one.

**C. Alignment is shift 0.** The surviving identical tiles match at offset 0 and *nothing* matches at
±1. That rules out an off-by-one, which byte-identical WALLDEF alone would not. Independently
confirmed on the 210-slot banks by flat-slot signature: shift 0 agrees 210/210 on banks 30/31/36
while ±1 agrees only 203–209.

**D. The swap is a complete redraw with no structural change.** Over all of `GEO2#2` with the route's
real piece set (`LOAD_PIECES #3,#3,#3`), across every cell and all four facings: DOS and Amiga agree
on every padding/painted decision (0 disagreements), 79,742 painted tiles differ, and 0 are
identical. The Amiga port redrew this area's walls entirely without moving a single wall.

**Palette.** Unlike Pools' `8X8D.TLB`, Gateway's `Walls.tlb` is 5-plane art carrying no colour table
at all. `decodeGlib`'s own `fallbackPalette` deliberately only covers 4-plane sets, so the palette is
sourced separately from `DiskA/Always.tlb` — the same container CoAB and Secret use — and threaded in
via a new `glibTileBanks(…, fallbackPalette)` parameter and a new `GameData.amigaGlibPalettePath`
field. Without it the tiles decode correctly but reach the renderer with no colours.

## 2. What does not hold — block 15

Block 15's Amiga bank carries real art in slots **186–189**, which the DOS bank pads flat. Swapping
it would paint wall where the DOS build paints none: art that looks plausible rather than failing, so
nothing downstream would have caught it. It is the **only** one of the 26 paired banks that fails;
the other 25 are faithful slot-for-slot stand-ins.

That single bank decides where the toggle lives. `?explore=gateway` and `?explore=gateway-natural`
both run `ECL5#19`, whose `LOAD_PIECES (7,15,30)` mounts block 15, so neither can host it.
`ECL2.DAX#2` is the largest area whose `LOAD_PIECES` uses only clean banks, and it is where the route
was placed.

This is enforced in code, not prose: `bankSwapParity` (`packages/engine/src/loaders/glibTileBank.ts`)
is checked per mounted set inside `buildGlibWallGraphics`, and a single failing set refuses the
**whole** toggle rather than the offending set — a dungeon rendering half Amiga and half DOS would be
worse than one rendering all DOS. The check is deliberately conservative: it does not ask whether the
geometry actually names slots 186–189, only whether the bank is a proven stand-in.

`bankSwapParity` makes one allowance, straight from the bytes: Gateway's four 210-slot Amiga banks
hold 211 tiles, and tile 210 is flat padding in all four. A 210-tile geometry never names index 210,
so the excess cannot reach the screen. Excess tiles that are *not* flat are rejected.

## 3. The measurement bug, and why it is recorded here

The first pass of this work reported that **four** banks (15/30/31/36) were unswappable, carrying art
in 45–72 slots DOS padded blank, amounting to 58.9% of blits on `GEO5#19`. **That was wrong**, and the
error is worth recording because it is the kind that recurs.

Emptiness was being judged as "every pixel is index 0 or the tile's `transparentIndex`". The two
platforms do not share a transparency convention: DOS Gateway banks report `transparentIndex` null,
DOS Pools banks report 13, and every Amiga GLIB bank reports 255. So the predicate was measuring a
different thing on each side. Gateway's DOS banks pad with index 0 and its Amiga banks pad with index
19 — and `Always.tlb` resolves 19 to `#000000`, i.e. exactly the pixel the DOS pad produces — but
index 19 is neither 0 nor 255, so every Amiga pad tile counted as "painted".

It surfaced the way these things should: the guard, once wired, **broke the already-shipped Pools
toggle**, whose full-suite e2e case went red with `graphicsAvailable()` returning `[]`. Pools' banks
1 and 2 had been marked mismatched on a single slot. Re-measuring with a transparency-agnostic
predicate — flatness, "every pixel the same index", a property of the pixels alone — put Pools back at
6/6 agreement and reduced Gateway's real disagreement to four slots in one bank.

Both `bankSwapParity` and the engine goldens now use flatness. The lesson generalises to any
cross-platform asset comparison in this project: **compare properties of the bytes, not properties
that depend on a per-platform convention** — and a check that cannot be seen passing on a case
already known good is not yet evidence.

## 4. Treasures of the Savage Frontier — a measured rejection

Treasures was evaluated in the same pass and **rejected**. Its Amiga `WallDef.glb` is byte-identical
to *Gateway's* across all 12 shared ids — the Savage Frontier duology shipping the same (stale) file —
while Treasures' own DOS walldefs are a different **2340-byte** format indexing VGA-extended tile ids.
The thirds hypothesis (2340 = 3 × 780) was tested and refuted. Mounting that Amiga art over Treasures
geometry would render plausible-looking wrong walls, so no toggle is offered. Recorded in
`tools/goldbox_capabilities.json` as a measured rejection rather than an untried gap.

## 5. Status

`graphics_switch` is now closed for Gateway, making 2 of the 10 acceptances in
`release-contract-gap-audit.md` complete. DQK remains unmeasured. The one open Gateway thread this
leaves is narrow and optional: whether `GEO5#19`'s geometry ever names block 15's slots 186–189 — if
it provably does not, the campaign areas could host the toggle too.
