# The Dark Queen of Krynn: Amiga wall-art feasibility (2026-08-09)

The third and last GLIB/DataLib-era title assessed for the in-dungeon DOS↔Amiga wall-art toggle,
after Pools of Darkness (accepted, `pools-amiga-wall-art.md`) and Gateway (accepted for 25 of 26
banks, `gateway-amiga-wall-art.md`).

**Nothing is wired for DQK, and this is not "not yet measured" — it is measured, with a different
answer.** DQK's `graphics_switch` gap is *not* gated on the parity measurement that gated the other
two, and recording that is the point of this document: `release-contract-gap-audit.md` had grouped
all three remaining titles under "each needs its own parity measurement before its art source may be
declared," which is accurate for none of them.

Evidence: `packages/engine/test/dqkAmigaWallArt.test.ts` (8 tests). Sources: DOS
`The Dark Queen of Krynn/DISK2`; Amiga WHDLoad unpacked `DarkQueenOfKrynn/data/Disk2`, read-only,
never vendored.

---

## 1. What actually blocks DQK

**(a) There is no first-person wall view to toggle.** `apps/web/src/ui/dqkExplore.ts` renders a
top-down automap. It contains **zero** uses of `loadDungeonWalls`, `composeWallView` or
`planWallView`. A second wall-art source has nothing to draw into. This is the real blocker, it is
engine work rather than asset work, and it is a considerably larger slice than either of the two
toggles shipped so far.

**(b) The proof Pools and Gateway used does not exist here.** Both were licensed by Amiga WALLDEF
records being byte-identical to the DOS ones — shared geometry provably indexing the swapped art.
DQK ships **no WALLDEF file on either platform** (asserted directly, against anchors that fail if
the paths are wrong). `GEO.GLB`'s per-area header bytes 2-7 name only the resource *sets* — wall
banks and backdrops — as `buildDqkGame.ts` records. A future DQK swap needs a different argument for
why the geometry indexes the art correctly.

> **Refinement (same day, §2a below): less of this lives in `DQK.EXE` than first written here.** An
> earlier draft of this section said flatly that "Gen2 keeps wall geometry inside `DQK.EXE`". That
> overstates it: DQK's wall frames carry their own screen placement in the HLIB frame header, so a
> renderer does not have to recover per-frame placement from the executable at all. What is genuinely
> missing is narrower — the *selection* (which frame answers which wall configuration at which
> viewport slot) and the horizontal column placement. **§2b then narrowed it again:** the piece
> identity and slice layout turned out to be Gen1's own vocabulary, so only the
> configuration→slice mapping and the column placement are still unrecovered.

**(c) 38% of the Amiga frames do not decode.** 305 of 799 members across `8X8DB.TLB` + `8X8DC.TLB`
come out of the GLIB decoder as degenerate 8×1 stubs. The art source is not currently complete
enough to offer even if (a) and (b) were solved.

## 2. The encouraging half, which is worth having recorded

Where the Amiga side *does* decode, the two platforms look like a straight art swap:

| | `8X8DB.TLB` | `8X8DC.TLB` |
|---|---|---|
| DOS members | 423 | 376 |
| Amiga members | 423 | 376 |
| Set grouping | 9 × 47 | 8 × 47 |

Identical member counts, and the Amiga master's own `setNN_imgNNN` labels confirm the 47-frame
grouping is real rather than an arithmetic coincidence of 423 = 9 × 47. Note that DQK's "8X8D"
containers hold **variable-size perspective frames** (8×8 up to 56×58), not 8×8 tiles, despite the
inherited name.

Per-frame dimension agreement at shift 0: **478 agree, 16 mismatch** — 96.8% of the decodable
frames. Shift 0 is genuinely the right alignment rather than merely the one tried: ±1 and +2 all
score below half of it. That is the same "ports change pixels, not geometry" signature Pools and
Gateway showed, so if the decoder gap closes, the swap is likely to be sound. (Dimensions agree;
the frame *offsets* do not — see the second decoder gap in §2a, which tempers this.)

## 2a. The frames place themselves, which narrows the missing piece

HLIB frame headers carry a signed `(x, y)` origin offset, and DQK's wall frames use it: **186 of
`8X8DB.TLB`'s 423 frames** place themselves. Within a set the pattern is a distance-rank vocabulary —
a near rank of full-height pieces at `(0,0)` (frames 0-19), then successively shorter pieces carrying
a positive `yOffset` that bottom-aligns them against the tall ones: `16x88 @(0,0)`, then
`16x63 @(0,25)`, `16x53 @(0,35)`, `16x60 @(0,28)`.

Two constraints on any future renderer fall out of this:

- **Per-frame vertical placement is already in the data.** Only the frame *selection* and the
  horizontal column placement need recovering (`xOffset` is 0 on all but a handful of frames).
  *(Selection has since been recovered too — see §2b.)*
- **The layout is per-set, not one shared template.** Every set's (dimensions + offsets) signature is
  distinct — 9 distinct across `8X8DB.TLB`'s 9 sets, 8 across `8X8DC.TLB`'s 8 — and `8X8DC.TLB`'s
  first set places *nothing* (all 47 frames at the origin) while `8X8DB.TLB`'s first set places 27 of
  47. A renderer cannot hard-code one rank table and reuse it for every wall set.

**A second Amiga decoder gap, distinct from the stubs.** Of the Amiga frames that do decode, 124
report `(0,0)` where DOS carries a real offset, 133 agree, and **none** carry an offset DOS lacks.
That one-directional loss is the signature of the offset fields simply not being read on the GLIB
path rather than of the Amiga art being authored differently — but that is not proven here, so it is
recorded as an open gap. It is a second reason the Amiga source is not usable yet, independent of
the missing wall view.

## 2b. A 47-frame set is Gen1's own wall-piece vocabulary

Selection was the piece §2a left open, and it is not a new vocabulary. **A DQK wall set decomposes
as `cap+9, cap+9, 9, 9, 9` = 47** — five view slices of nine pieces, plus two caps sitting at the
*front* of the first two runs (set-relative indices 0 and 10). Each nine-run is
`packages/engine/src/world/wallpieces.ts`'s `PIECES` order exactly, with the far-cap lifted out:

> far-front, far-left, far-right, mid-front, mid-left, mid-right, near-front, near-left, near-right

Measured over all 17 sets of `8X8DB.TLB` + `8X8DC.TLB` (85 slices; 8 skipped as they contain the §3
stub frames, leaving 77):

| Claim | Result |
|---|---|
| Caps at set-relative 0 and 10 | **17 / 17 sets** |
| Nine-run matches Gen1's nominal widths `8,8,8,24,16,16,*,16,16` | **72 / 77 slices** |
| Depth-ordered by height (`far < mid < near`), width not consulted | **74 / 77** |
| Left/right of a depth agree in height within 2px (mirror pairs) | **75 / 77** |

The width check alone would be weak — three 8s and two 16s could be satisfied by some other
permutation. The height checks break that tie without consulting width at all, and they agree. The
few exceptions in each column are near-ties (one rank a pixel under its neighbour), not rank swaps.

Near-front is the piece whose painted extent varies most, so it is a wildcard above; its observed
vocabulary is `{56: 53, 40: 17, 48: 4, 32: 2, 24: 1}`. The five slices that miss the nominal
signature shrink *individual* pieces (mid-front 24→8, near-left/right 16→8) rather than reordering
them — narrow wall variants cropped to their painted extent and positioned by the §2a header
offsets, which is the same mechanism, not a counter-example.

**What this leaves.** Comparing against §2a: vertical placement is in the data, and the piece
identity and slice layout are now recovered. A Gen2 first-person renderer still needs the mapping
from a wall configuration to *which of the five slices* to draw, and the horizontal column
placement — but it can reuse the engine's existing Gen1 piece model rather than inventing one.
This does not move DQK's `graphics_switch` gap, which is blocked by §1(a) and §1(c) independently;
it shrinks the §1(a) work.

Evidence: the last two tests in `packages/engine/test/dqkAmigaWallArt.test.ts`, measured on the DOS
side (where the decoder is complete), so it is a statement about DQK's format rather than about the
Amiga port.

## 3. The decoder gap is structured, which makes it a good future target

The failures are not scattered. Within most sets it is ~15 of 47 at a regular stride, but
**`8X8DB.TLB` set04 fails entirely (47/47)** while every neighbouring set mostly succeeds. A whole
set failing beside working ones points at a per-set codec or plane-depth variant rather than a
frame-level edge case, and is the obvious place for a decoder pass to start.

Worth stating plainly: this is not on the critical path for any project goal. `CLAUDE.md`'s standing
verdict is that **DOS VGA art is the best DQK art**, so unlike CoK/DoK there is no art-quality reason
to want the Amiga source — the only motivation would be release-contract coverage, and (a) blocks
that independently.

The assertions in the test are deliberately written to **fail when the decoder improves**. The stub
counts are a snapshot of a known gap, not a specification; a failure there means the gap closed and
the document should be re-derived.

## 4. Neverwinter Nights, for completeness

NWN's `graphics_switch` gap was grouped with the same "needs a parity measurement" framing. It
cannot be closed by this route **at all**: there is no Amiga release of the AOL-era *Neverwinter
Nights*, and no Amiga source for it exists in the project's collection (the WHDLoad pack carries 9
Gold Box titles; NWN is not among them, and `amiga-inventory.md` lists the same 9). Closing it would
need either a different second art source or a contract change — structurally the same kind of
blocker as NWN's `wilderness_travel` (audit §6), not buildable asset work.
