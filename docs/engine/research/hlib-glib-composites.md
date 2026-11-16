# HLIB/GLIB composites, and two dispatch sites the audit could not see

Round 35 R3, 2026-09-05. Owner: R3. Sources: DQK DOS (repo `The Dark Queen of Krynn/` and the
GOG install, which agree), FRUA (`C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures`),
and the never-vendored WHDLoad Amiga tree. Nothing in this memo required DOSBox-X.

## Headline

Three findings, one of them a falsified plan prediction and one a falsified plan null.

1. **DOS census confirmed, manifest arithmetic falsified.** There are exactly **16** method-25
   composites in exactly **5** files — as predicted. But the split across `?game=` routes is
   **3 + 9 = 12**, not 3 + 13 = 16: DQK `DISK2/PICC.TLB`'s 4 composites are in **no manifest**, so
   no `?game=` route has ever been able to reach them. P8's "+13 for FRUA" is **FALSIFIED**; the
   correct number is +9.
2. **The Amiga GLIB composites are real and big-endian, and — CORRECTED 2026-09-05 — the height
   invariant discriminates too, once measured on the record's own fields.** The first pass of this
   memo reported the height invariant `max(destY) + height(source) === height(composite)` holding
   **3/3 under BOTH endiannesses** and called it structurally incapable of discriminating. That
   result was manufactured: the little-endian arm also byte-swapped `height(source)`, the source
   image's own height read from a separate header — not a field of the `0x19` record at all.
   Measured correctly (swap only the record's own destY and height fields; leave `height(source)`
   alone), the invariant is **BE 3/3, LE 0/3** — it agrees with, and independently corroborates,
   the DOS-twin comparison rather than sitting neutral. The DOS-twin comparison (the plan's own
   stated fallback, and unaffected by this correction) also decides it cleanly on its own: 3/3
   big-endian, 0/3 little-endian.
3. **The dispatch-site audit's own scope was the bug it exists to catch.** It declared 3 sites;
   the source has 5 (`intro.ts` and `combat.ts` were invisible), and a sixth form of dispatch —
   `decoded.format !== 'dax'`, used twice in `combat.ts` — is missed by the `===`-only grep that
   round 35's plan itself specifies. Both new sites hide **0 frames today** (measured, not
   assumed), so they are latent gaps, not losses.

## (a) DOS method-25 composite census

Method: a standalone HLIB region walk (scratch script mirroring `hlib.ts`'s `iterLeafImages`
region enumeration and `readComposite`'s two structural gates: payload length ≡ 0 mod 6, and byte
+1 of every record equal to the derived record count) over every `.TLB`/`.GLB`/`.DAT` file in the
DQK and FRUA installs. Cross-checked against `decodeHlib` itself in
`packages/engine/test/loadGameComposites.test.ts`.

| File | composites | parts each | in a manifest? |
| --- | --- | --- | --- |
| DQK `DISK2/PICC.TLB` | 4 | 1 (alias to ptr 2) | **no** |
| DQK `DISK3/FRAME.TLB` | 3 | 15 / 8 / 6 | yes — `dark-queen-dos` |
| FRUA `DISK2/PICA.TLB` | 1 | 1 | yes — FRUA |
| FRUA `DISK2/PICD.TLB` | 4 | 1 each | yes — FRUA |
| FRUA `DISK3/FRAME.TLB` | 4 | 15 / 8 / 6 / 4 | yes — FRUA |
| **total** | **16 in 5 files** | 71 parts | **12 reachable** |

Every other `.TLB`/`.GLB` in either install holds zero. The repo's DQK copy and the GOG DQK copy
produce identical results (7 composites in 2 files each).

**Measured route deltas after wiring `loadGame.ts`:**

| route | frames before | frames after | delta |
| --- | --- | --- | --- |
| `?game=dark-queen-dos` | 1430 | **1433** | +3 (all `DISK3/FRAME.TLB`) |
| `?game=forgotten-realms-unlimited-adventures` | 1890 | **1899** | +9 (PICA 1, PICD 4, FRAME 4) |
| `?game=dark-queen-amiga` | 1497 | **1500** | +3 (GLIB, `Disk3/FRAME.TLB`) |

Per-file: DQK `FRAME` 40 → 43, FRUA `PICA` 47 → 48, `PICD` 43 → 47, `FRAME` 24 → 28, Amiga DQK
`FRAME` 40 → 43.

**Scale disclosure, as the plan required.** This is 12 frames recovered, not 928. The value here
is the *class* of bug recurring, not the size of the loss: `renderHlibComposite` had been correct
since 2026-08-22 and was called by exactly one of the codebase's flattening sites for two weeks.

## (b) The Amiga GLIB side

`glib.ts`'s `decodeImage` ended with `return null; // 0x19 image-id list and placeholders: skip`,
and `GlibArchive` had no `composites` field at all — the records were filed under `rawMembers`
("bytes I could not read").

**Corpus.** 272 `.TLB`/`.GLB` files in the WHDLoad tree, 171 of them GLIB-magic. Exactly **one**
carries `0x19` records: `DarkQueenOfKrynn/data/Disk3/FRAME.TLB`, with exactly **3** — against its
DOS twin's 3.

**BE vs LE, record for record** (Amiga leaf is LZ77-compressed, so the bytes below come from the
decompressed leaf; the LE column is the byte swap of the BE column, which is the same operation as
re-reading the same two bytes little-endian):

| record | field | DOS `DISK3/FRAME.TLB` | Amiga BE | Amiga LE (null) |
| --- | --- | --- | --- | --- |
| ptr 20 | height | 120 | **120** | 30720 |
| ptr 20 | parts | 15 | **15** | 15 (byte field — cannot discriminate) |
| ptr 20 | source ptr ids | 47, 46×13, 45 | **47, 46×13, 45** | same (byte field) |
| ptr 20 | destY ladder | 112,104,…,8,0 | **112,104,…,8,0** | 28672, 26624, …, 2048, 0 |
| ptr 21 | height / parts | 63 / 8 | **63 / 8** | 16128 / 8 |
| ptr 21 | destX (the one non-zero in the whole corpus) | 3 | **3** | 768 |
| ptr 22 | height / parts | 43 / 6 | **43 / 6** | 11008 / 6 |

- Height invariant, measured correctly (record's own fields swapped, `height(source)` left alone):
  **BE 3/3, LE 0/3** — it discriminates (see "The null, measured" below for the correction).
- DOS-twin structural equality (part list compared field for field): **BE 3/3, LE 0/3**.

All three assemble: the three source members (leaf pointer indices 45/46/47) are 8×8 tiles under
drawing method `0xE0`, and the composed canvases come out at exactly the declared 120 / 63 / 43
rows, so nothing overhangs and nothing is missing from the bottom.

### The null, measured — CORRECTED 2026-09-05

The plan's null was "the un-swapped little-endian reading of the same bytes, judged by the height
invariant, expected to fail on ≥ 2 of 3". **This memo's first pass measured that null wrong** and
reported it failing on 0 of 3 (i.e. holding 3/3 both ways), with a structural-sounding explanation:
every stored value in these three records is < 256, so byte-swapping is a uniform ×256 on every
16-bit field, and `max(destY) + height(source) === height(composite)` is homogeneous of degree 1,
hence scale-invariant.

That explanation does not hold up, because the little-endian arm as first measured did not swap
only the record's fields. `height(source)` — the third term in the invariant — is the height of
the part's SOURCE IMAGE, read from that image's own header elsewhere in the leaf; it is not a
field of the `0x19` record. The first pass byte-swapped it anyway "for consistency", which is not
licensed: a value the record does not store cannot be part of "reading the record little-endian".
Swapping it made the relation homogeneous by fiat, not because the format is.

Measured correctly — swap only the two 16-bit fields the record actually stores (each part's
destY, and the composite's own declared height byte) and leave `height(source)` fixed — the
invariant **discriminates: BE 3/3, LE 0/3.** Concretely, record 1 (declared height 120, destY
ladder 112,104,…,0, source height 8): BE `112 + 8 = 120` (matches); little-endian-on-record-fields
`swap16(112) + 8 = 28680` vs `swap16(120) = 30720` (28680 ≠ 30720). The other two records fail the
same way (14088 vs 16128, 8968 vs 11008).

So the invariant was never neutral here — correctly computed, it is independent corroborating
evidence for big-endian, on top of (not instead of) the DOS-twin structural comparison, which
remains the load-bearing evidence and needed no correction.
`packages/engine/test/glibComposite.test.ts` now asserts the corrected figures
(`beHolds === 3 && leHolds === 0`), and its docblock and `glib.ts`'s own docblock both carry this
correction dated in place. The durable lesson: a null computed by byte-swapping a value the format
does not contain is not a null about the format — it doesn't matter that the swap is "consistent"
if the thing being swapped isn't part of what's under test.

### Where the rendering happens, and why it differs from HLIB

`renderGlibComposite(leafBytes, composite, palette)` is exported and takes the **decompressed
leaf**, not the file: an Amiga GLIB leaf may be LZW/LZ77-compressed, so the part sources do not
exist in the on-disk bytes at all and a caller holding the file could not resolve them the way an
HLIB caller can. `decodeGlib` therefore calls it during the walk and hands back a finished
`image` on each `GlibComposite`. Consumers of the assembled image: `loadGame.ts` (every `?game=`
route), `apps/web/src/ui/main.ts` (asset browser), `apps/web/src/ui/nwnPreview.ts`. Consumer of
the exported function: `glib.ts` itself — it is not a tenth "solved but unwired" export, but it is
**not in the barrel**: `packages/engine/src/index.ts` is Phase B's file, so Phase B should add
`renderGlibComposite` / `type GlibComposite` / `type GlibCompositePart` there. Nothing breaks
without that; app code reaches the images through `archive.composites`.

## (c) The dispatch sites

`tools/test_decoded_asset_dispatch_sites.py` declared three sites in a hand-written constant.
Enumerating `decoded.format` comparisons from source (comment-stripped, string-aware) over
`apps/web/src` and `packages/engine/src`:

| site | branches | shape | verdict |
| --- | --- | --- | --- |
| `packages/engine/src/game/loadGame.ts` | hlib, ilbm, glib, daa, pool-amiga + dax catch-all | flattening | total |
| `apps/web/src/ui/main.ts` | hlib, glib, ilbm, daa, pool-amiga + dax catch-all | flattening | total |
| `apps/web/src/ui/nwnPreview.ts` | dax, daa, hlib, glib, pool-amiga + ilbm catch-all | flattening | total |
| `apps/web/src/ui/intro.ts` | dax, hlib → `return []` | selector | **documented exclusion** |
| `apps/web/src/ui/combat.ts` | dax, daa → `return null`; plus 2 × `!== 'dax'` | selector | **documented exclusion** |

Enumerated **5**, declared **3** — reproduced RED by emptying `DOCUMENTED_EXCLUSIONS`, which names
`apps/web/src/ui/combat.ts` and `apps/web/src/ui/intro.ts` exactly.

**A defect in the plan's own method.** The plan (and P9) specifies `grep 'decoded.format ==='`.
`combat.ts`'s `spriteFrom` (`if (decoded.format !== 'dax') return null;`) and `iconLibraryFrom`
(same form) are dispatches that this predicate misses entirely; `combat.ts` is enumerated only
because its *other* function happens to use `===`. A file whose only dispatch were `!==` would
still be invisible. The audit now matches both forms.

### The hidden-frame null: measured 0 and 0

Enumerated from source rather than assumed:

- **intro.ts title sources**: 10 distinct path literals reach `startIntro`'s `titlePath` —
  `Champions of Krynn/TITLE.DAX` (the default) plus DoK, CoAB, Secret, Gateway, Pool, Treasures,
  Pools, NWN (all `.DAX`) and `DQK_TITLE_PATH = The Dark Queen of Krynn/DISK1/TITLE.TLB` (HLIB).
  **9 DAX + 1 HLIB — both branched. 0 frames hidden.**
- **combat.ts asset sources**: 115 path literals across `tilesPath` / `iconPath` /
  `frameTilesPath` / `dungcomPath` / `randcomPath` / `amigaDungcomPath` / `amigaRandcomPath` in
  `combat.ts`, `demo.ts`, `demoGen1.ts`, `explore.ts`, `gameData.ts`, `gen1Profiles.ts`: **112
  `.DAX` + 3 `.DAA`, zero `.TLB`. 0 frames hidden.** No route hands DQK's HLIB `DUNGCOM.TLB` to
  the combat screen.

So P9's second half **HOLDS**: 0 and 0. Both are recorded as *latent* gaps with a stated reason,
not fixed — and deliberately so. `combat.ts` filters for 24×24 cell-sized tiles and DQK's HLIB
`DUNGCOM.TLB` has no members of that size, so a branch for it could only produce a stretched or
invented backdrop. Returning null is the correct answer there; the audit now requires that answer
to be written down, to name the formats it drops, and to state the measured frame count it costs.

## What this does NOT claim

- Not that composites are a pool-amiga-scale loss. 12 frames became reachable, and PICC.TLB's 4
  remain unreachable because no manifest lists that file.
- Not that `intro.ts` or `combat.ts` hide any frames. Both measured 0; the exclusions are latent.
- Not a GLIB record-layout claim from the height invariant ALONE — the claim primarily rests on
  the DOS twin. (CORRECTED 2026-09-05: the invariant itself, measured correctly on the record's own
  fields, also discriminates — BE 3/3, LE 0/3 — rather than being neutral as first reported; see
  "The null, measured" above. It is additional corroborating evidence, not the sole basis.)
- Not that the Amiga records are a *different* layout from DOS. They are the same layout,
  byte-swapped; nothing here is evidence about any Amiga container that carries no `0x19` record,
  and 170 of the 171 GLIB files hold none.
- No semantics for the composite header's byte +6 beyond what `hlib.ts` already records (DQK.EXE
  never reads it on the method-25 path); the GLIB reader records it and ignores it identically.

## CORRECTED 2026-09-05: a probe that could not fail the way it claimed

The original `renderGlibComposite refuses a record whose sources are out of range` test called
`renderGlibComposite` with the **on-disk, still-LZ77-compressed** file bytes as the `leafBytes`
argument, alongside a real composite whose `sourcePtrIndex`es (45/46/47) are safely inside that raw
top-level buffer's own 49-entry pointer table. The range guard
(`if (i < 0 || i + 1 >= hdr.ptrs.length) return null`) never engaged: `null` came back because
`decodeImage` failed to parse the wrong (still-compressed) bytes it was pointed at — an unrelated
code path (`if (!img) return null`). Mutation-tested: deleting the range-guard line left the test
GREEN. This is the same failure mode `goldbox-probe-must-be-able-to-fail` names — a passing
assertion that is not evidence of the thing it claims to guard.

The test was rewritten to build a minimal, self-contained (no external fixture) two-pointer GLIB
leaf by hand, with a composite part naming `sourcePtrIndex: 1` — the trailing EOF-sentinel pointer
entry, which has a real value but no `ptrs[2]` after it to bound a region — and extra bytes past
the sentinel offset that decode as a second, "phantom" image. Mutation-tested for real this time:
with the range guard removed, the test goes RED, returning the phantom image
(`{width: 8, height: 1, ...}`) instead of the expected `null`; restoring the guard returns it to
GREEN. That is the exact "half-drawn picture" failure mode the guard's own comment describes.

## Files

- `packages/engine/src/loaders/glib.ts` — `GlibComposite`, `GlibCompositePart`,
  `readGlibComposite`, `renderGlibComposite`, `GlibArchive.composites`.
- `packages/engine/src/loaders/hlib.ts` — docblock reachability restated (the sentence
  "Deliberately NOT called by `decodeHlib`" now carries what that cost).
- `packages/engine/src/game/loadGame.ts` — composite pass in both the hlib and glib branches;
  `framesFromDecoded` takes the file bytes.
- `apps/web/src/ui/main.ts`, `apps/web/src/ui/nwnPreview.ts` — composite passes.
- `packages/engine/test/glibComposite.test.ts`, `packages/engine/test/loadGameComposites.test.ts`.
- `tools/test_decoded_asset_dispatch_sites.py` — enumerated site list, selector exclusions,
  `!==` support, a pinned comment stripper, and a `composites`-reachability check.

## Handoff (Phase B)

1. `apps/web/test/e2e.mjs` — `AMIGADQK_ROWS`: `["FRAME (UI frame chrome)", 40]` → `43`, and
   `runAmigaDqkView`'s total `1497` → `1500`. This case is an EXACT multiset pin and **goes RED on
   merge** until changed; that is the two-sided pin working, not a regression.
2. `apps/web/test/e2e.mjs` — optional new/strengthened assertions: `dark-queen-dos` total is now
   1433 (its current pin is a `min` of 1000, so it stays green either way), and FRUA has no game
   view case today.
3. `packages/engine/src/index.ts` — export `renderGlibComposite`, `type GlibComposite`,
   `type GlibCompositePart`.
4. `tools/goldbox_capabilities.json` — DQK and FRUA `graphics` rows: the method-25/0x19 composite
   gap is closed for the manifest-listed files; DQK `DISK2/PICC.TLB` (4 composites) remains
   unlisted in any manifest and should be stated as such rather than as a decoder gap.
5. `apps/web/src/ui/docs.ts` — checked 2026-09-05: it says nothing about method 25 today, so no
   edit is required. Recorded here so the next reader does not re-derive it.
