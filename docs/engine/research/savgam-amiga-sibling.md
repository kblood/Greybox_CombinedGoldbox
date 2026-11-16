# SAVGAMx.DAT: the Amiga sibling as an independent oracle

**Status: read-only cross-check.** This document does not modify
`docs/engine/research/savgam-world-state-format.md`, `tools/savgam_decode.py`, or
`tools/test_savgam_decode.py` — those are owned by a concurrently-running agent. Everything
here was derived by direct byte inspection of the four samples named below, re-run and
re-verified while writing this document (not copied from memory).

## The four samples

| id | path | size | sha1 |
| --- | --- | --- | --- |
| Amiga-1 | `amiga_extracted/ChampionsOfKrynn/disk3/save/savgamA.dat` | 5481 | `d1cba4285424339b604da19ec20749dae96acc8e` |
| Amiga-2 | `The Dark Queen of Krynn/cloud_saves/SAVE/Amiga/savgamA.dat` | 5481 | `93131ad334d854799ed588fd5fcc427b78c202c6` |
| DOS-A | `Champions of Krynn/SAVE/SAVGAMA.DAT` | 5469 | `ed482a12b75da04b8295dee38b060ae743809105` |
| DOS-B | `build/cok-area1-load-watch-20260727/runtime-game/SAVE/SAVGAMA.DAT` | 5469 | `6f54964132dce2e8c4e1350bf486255a1d2a6000` |

All four hashes were re-computed with `sha1sum` against the working tree for this document
and match the task's own figures exactly.

**Repo-tracked vs never-vendored, checked with `git ls-files --error-unmatch`:** DOS-A and
Amiga-2 are tracked (`git ls-files` succeeds); Amiga-1 (under `amiga_extracted/`, gitignored)
and DOS-B (under `build/`, gitignored) are **not** tracked and will not exist in a fresh
clone. `tools/test_savgam_amiga.py` is built around this split: the pins that use only DOS-A
and Amiga-2 run unconditionally; anything touching Amiga-1 or DOS-B is behind an
existence-checked `skip`.

## 1. Which title is each Amiga file?

**Amiga-1 is Champions of Krynn** by construction — its path (`.../ChampionsOfKrynn/disk3/save/...`)
names the title directly, and this was not questioned.

**Amiga-2 sits under a "The Dark Queen of Krynn" path, in a subfolder literally named
"Amiga" (with a sibling "AmigaDKK" next to it) — the task is explicit that this is exactly
the kind of path that must not be trusted.** Grounding the title in the file's own bytes and
its sidecars, not the directory name:

- **Size match, byte-exact:** Amiga-2's `savgamA.dat` is 5481 bytes — identical to Amiga-1's
  confirmed-CoK `savgamA.dat` down to the byte. If this were a Death Knights of Krynn save,
  the DOS evidence in this same repo says it should look nothing like a CoK save at all:
  DoK's own retail world-state sidecar isn't even a `.DAT` file — `Death Knights of Krynn/SAVE/SAVGAMA.PTY`
  (both the retail copy and the `cloud_saves` copy) is 2913 bytes, a completely different
  size and a different extension from CoK's 5469/5481-byte `.DAT`. A DoK save parked here
  would not coincidentally reproduce CoK's format and size to the byte.
- **Sidecar-format match, byte-exact:** Amiga-2's `CHRDATA1.sav` .. `CHRDATA6.sav` (in the
  same "Amiga" folder) are each 426 bytes — identical to Amiga-1's confirmed-CoK
  `CHRDATA{1..6}.sav` (also all 426 bytes). This is an independent dimension (character
  records, not the world-state file) agreeing with the same conclusion.
- **Roster tags read `CHRDAT<letter><1-6>`, matching the described convention:** both
  `savgamA.dat` files carry six `CHRDATA1`..`CHRDATA6` ASCII tags in their trailer/roster
  region (see §2), i.e. slot letter `A`, matching the filename `savgamA.dat` on both.
- **Character names in `CHRDATA{n}.sav` match the `.qch` filenames living in the exact same
  "Amiga" folder, not the "AmigaDKK" folder next to it:**

  | slot | Amiga-2 `CHRDATA{n}.sav` name (read from bytes) | matching `.qch` in the same folder |
  | --- | --- | --- |
  | 1 | `CALDOR` | `CALDOR.QCH`, `CALDOR2.qch` |
  | 2 | `CAIN BLOODBANE` | `CAINBLOO.qch`, `CAIN2/3/4.qch` |
  | 3 | `gorm` | `GORM.qch` |
  | 4 | `SWIFT` | `SWIFT.qch` |
  | 5 | `sunflower` | `SUNFLOWE.qch`, `SUN_NOSP.qch` |
  | 6 | `RAISTLIN` | `RAISTLIN.qch`, `RAIST_1/2.qch` |

  The sibling `AmigaDKK` folder's own `.qch`-equivalent files (`CALDOR.who`, `CALDOR.pch`,
  etc.) belong to a *different* single character (`CALDOR` solo, no `CAIN BLOODBANE` /
  `GORM` / `SWIFT` / `SUNFLOWER` / `RAISTLIN` roster) and hold no `savgamA.dat` at all — this
  cloud-saves tree keeps CoK and DoK saves in visibly separate sibling folders, and Amiga-2
  is in the CoK one.

**Conclusion: Amiga-2 is a Champions of Krynn save (the "Caldor" party), parked under the DQK
cloud-saves tree, not a Dark Queen of Krynn or Death Knights of Krynn save.** This is grounded
in file size, sidecar size, roster-tag content and character-name cross-reference against
sidecar filenames in the same directory — four independent signals, none of them the parent
directory's name.

## 2. Locating the 12 extra bytes

5481 − 5469 = 12. Using the `CHRDAT` ASCII tag as a fixed landmark (searched for literally,
byte by byte, not assumed), the distance between consecutive roster-tag starts is:

- **DOS-A / DOS-B:** 41, 41, 41, 41, 41 (six tags, five gaps) — matches
  `tools/savgam_decode.py`'s `ROSTER_ENTRY_SIZE = 41` exactly.
- **Amiga-1 / Amiga-2:** 42, 42, 42, 42, 42 — **every roster entry is 1 byte wider on
  Amiga.**

That accounts for 6 of the 12 bytes (one extra byte × six roster entries), confirmed
structurally (consistent gap width across all five gaps in both Amiga samples), not inferred
from a single entry.

The remaining 6 bytes split between the region before the roster ("header") and the region
after the last roster entry through EOF ("trailer tail"):

| region | DOS-A | Amiga-1/2 | delta |
| --- | --- | --- | --- |
| header (offset 0 to first entry's length-byte) | 5141 bytes | 5144 bytes | **+3** |
| six roster entries (41→42 bytes each) | 246 bytes | 252 bytes | **+6** |
| trailer tail (after last entry, through EOF) | 82 bytes | 85 bytes | **+3** |
| **total** | 5469 | 5481 | **+12** |

3 + 6 + 3 = 12. This is a complete, exact decomposition — not a guess about "prefix vs
suffix": **the growth is distributed across all three zones**, with the roster-entry growth
(6 of 12 bytes) the largest single contributor.

### Where inside the header do the +3 bytes live?

Aligning DOS-A against Amiga-1 by matching individual nonzero header bytes (not assuming a
uniform shift — checking it):

- **`header[0]` is unshifted:** `DOS-A[0] == Amiga-1[0] == Amiga-2[0] == 0x01`. No insertion
  before offset 0 (trivially), and none strictly *at* offset 0 either, since the value
  carries straight across.
- **By offset 461, the shift is a uniform +1** and stays +1 through at least offset 3710.
  Verified with **nine** independent nonzero markers, each checked for an *exact value
  match* (not just "both nonzero"), each with its zero "partner" byte confirmed zero on
  both sides:

  | DOS-A offset | value | Amiga-1 offset (+1) | value | exact match |
  | --- | --- | --- | --- | --- |
  | 461 | 0x01 | 462 | 0x01 | yes |
  | 505 | 0x04 | 506 | 0x04 | yes |
  | 511 | 0x03 | 512 | 0x03 | yes |
  | 1001 | 0x03 | 1002 | 0x03 | yes |
  | 1011 | 0x02 | 1012 | 0x02 | yes |
  | 1013 | 0x02 | 1014 | 0x02 | yes |
  | 1015 | 0x02 | 1016 | 0x02 | yes |
  | 3621 | 0x01 | 3622 | 0x01 | yes |
  | 3709 | 0x06 | 3710 | 0x06 | yes |

  So the first byte of the +3 header growth is inserted somewhere in the 460-byte window
  `[1, 461)`. **Not localized further than that window** — there is no nonzero landmark
  inside `[1, 461)` in either file to pin it tighter, and this document does not guess.
- **A second insertion is pinned exactly, at offset 5121/5122.** DOS-A has two directly
  adjacent nonzero bytes there with no gap: `DOS-A[5121] = 0x07`, `DOS-A[5122] = 0x0d`.
  Amiga-1's bytes at the +1-shifted position are **not** adjacent: `Amiga-1[5122] = 0x07`
  (matches `DOS-A[5121]`, still on the +1 baseline), then `Amiga-1[5123] = 0x00` (a byte
  with no DOS counterpart), then `Amiga-1[5124] = 0x0d` (matches `DOS-A[5122]`, but at
  cumulative shift +2, not +1). **A single zero byte is inserted between DOS's offsets 5121
  and 5122.** This is the one interior insertion point in this file pinned to an exact byte,
  not a window.
- **The immediate pre-roster zone (roughly DOS offset 5123–5141) does not admit a clean
  byte-for-byte shift at all**, and this document says so rather than forcing one. The lone
  nonzero byte DOS-A carries right before its 8-byte 0xFF run (`DOS-A[5130] = 0x01`, with
  `DOS-A[5131] = 0x00` as a zero gap before the run) does **not** appear at the shift
  implied by the previous bullet (Amiga offset 5132): Amiga-1's own lone pre-run byte is at
  **5134**, immediately adjacent to its own 0xFF run with no zero gap at all. The two
  platforms' 0xFF runs are both exactly 8 bytes long (5132–5139 DOS vs 5135–5142 Amiga-1),
  which is consistent with the file arithmetic above (total header +3 by the time the
  roster starts), but the exact placement of the remaining interior byte(s) between offset
  ~5122 and the roster boundary is **not pinned down** by this analysis — call it unsolved.
  This is also the same zone where the byte immediately preceding each roster tag (the
  position `tools/savgam_decode.py` calls `tag_len`, always observed as `0x08` on DOS) is
  **not constant on Amiga** — see the note below.

### A note for the format-doc owner (reported, not edited here)

`tools/savgam_decode.py`'s docstring describes the byte immediately before each `CHRDAT...`
tag as "a 1-byte Pascal-style length (always observed as 8)". On Amiga-1, the byte in the
exact analogous position (immediately before each `CHRDATA{n}` tag) reads **6, 11, 5, 226, 0,
0** across the six roster slots — never 8, and not constant. The full 8-character ASCII tag
(`CHRDATA1`..`CHRDATA6`) is present regardless, unaffected by whatever that byte says. This
is evidence *against* reading that byte as a true length-of-following-string prefix (a real
Pascal length byte would need to say 8, not 6 or 226) — on this evidence it looks more like
either a distinct per-slot data field that DOS's specific samples happen to hold at a
constant 8, or an uninitialized/leftover byte, rather than a generic string-length
convention. Flagging for the doc's owner; not changing `savgam_decode.py` or its docstring
here, per this task's file boundaries.

## 3. The parity question: does the Amiga file refute or support a genuine endian-swapped word?

The task reproduces cleanly against the two DOS samples: comparing `DOS-A` and `DOS-B`
byte-for-byte over the two claimed ranges,

```
range 385..1021: 153 differing bytes, 153 odd / 0 even
range 4609..5083: 88 differing bytes, 88 odd / 0 even
total: 241 differing bytes, 241 odd / 0 even
```

— an exact match to "241 of 241 differing bytes odd, 0 even" and to the given hex dump at
offset 384 (`DOS-B[384:408]` is byte-identical to the twelve words quoted in the task; `DOS-A`
is all-zero over the same span, i.e. DOS-A is the "base" state and DOS-B is the "advanced"
one). **DOS-A and DOS-B are themselves the two competing save states the task describes** —
this was not given, it was found by literally diffing the two available DOS samples and
getting the quoted numbers back.

### What the Amiga file actually shows, measured directly

**Range 385..1021.** DOS-A itself carries seven nonzero bytes in this range (independent of
the DOS-A/DOS-B diff — four of the seven are *unchanged* between DOS-A and DOS-B, i.e. they
are not part of the 153-byte diff at all, and three of the seven *are* part of it): offsets
461, 505, 511, 1001, 1011, 1013, 1015. Every one of the seven is at an **odd** DOS offset, as
the claimed table shape predicts. Their Amiga-1 counterparts, at the independently-established
+1 shift:

```
DOS-A[461]=0x01(odd)  -> Amiga-1[462]=0x01(even)  match
DOS-A[505]=0x04(odd)  -> Amiga-1[506]=0x04(even)  match
DOS-A[511]=0x03(odd)  -> Amiga-1[512]=0x03(even)  match
DOS-A[1001]=0x03(odd) -> Amiga-1[1002]=0x03(even) match
DOS-A[1011]=0x02(odd) -> Amiga-1[1012]=0x02(even) match
DOS-A[1013]=0x02(odd) -> Amiga-1[1014]=0x02(even) match
DOS-A[1015]=0x02(odd) -> Amiga-1[1016]=0x02(even) match
```

7 of 7 match exactly, and in every case the paired byte immediately before the value on DOS
(`DOS-A[offset-1]`) and immediately after the value on Amiga (`Amiga-1[shifted+1]`) are both
`0x00`. This is not a cherry-picked subset: **it is the complete list** of Amiga-1's nonzero
bytes anywhere in the window `[386, 1023)` (the +1-shifted image of the DOS range) — Amiga-1
has exactly seven nonzero bytes there, at exactly these seven offsets, with exactly these
seven values.

Amiga-2 (a different, further-progressed game state — the "Caldor" party) gives a much
larger, independent sample in the same window: **all 100+ of Amiga-2's nonzero bytes in the
corresponding window land at even offsets; zero land at odd offsets.** Where Amiga-2's own
game state agrees with DOS-A's (the "static/config" cells, not the play-progress-dependent
ones), the values match exactly too: `Amiga-2[506]=0x04`, `[512]=0x03`, `[1002]=0x03`,
`[1012]=0x02` all reproduce `DOS-A`'s values at the shifted-even offset. Where Amiga-2's own
state has since diverged (its own campaign has moved further than DOS-A's), the values differ
— which is expected of a genuine, mutable world-state field, and does not contradict the
parity/position finding.

**Range 4609..5083.** DOS-A is entirely zero in this range (no anchors at all to test against
Amiga from DOS-A). Reading `DOS-B`'s own content here (the state that *does* carry the 88
diffing bytes) shows something worth flagging honestly rather than treating as more of the
same table: decoded as `(zero, ASCII)` pairs, `DOS-B[4609:4635]` reads `MYSELLIA`, a zero, then
`NERS`, then more zero padding. That does not match this save's own roster (`ARAMNOR`,
`JHESILIA`, `DANAHIR`, `MIRACIA`, `NEDEIL`, `THYRION`, read from the same build's
`CHRDATA{1..6}.SAV` files) — it reads as leftover/unrelated text sitting in an otherwise
opaque region. **This document does not know what this text is or where it came from; no
citation grounds it, and none is claimed.** (A prior draft of this paragraph cited
`tools/savgam_decode.py`'s docstring as already documenting similar "Please Wait" / "Choose
a function" / "COMSPR" fragments inside the roster's opaque bytes. That citation was
checked directly against the file for this revision and is **false**: a grep of
`tools/savgam_decode.py` for all three strings returns zero matches, and the docstring
there says the opposite of what was claimed — it states the roster's remaining 32
opaque bytes per entry "are NOT decoded here; do not treat `opaque` as free of meaning,
treat it as 'not yet solved.'" A repo-wide grep additionally shows "Choose a function"
appearing nowhere in the repository except inside Curse of the Azure Bonds's own
disassembly (`coab_extracted/coab_new.lst`, `ovr018.cs`'s `startGameMenu`) — an unrelated
title's menu-prompt string, not anything documented about SAVGAM. The citation is deleted;
the underlying `MYSELLIA...NERS` observation stands on its own as unexplained.) (This is
consistent with,
not contradicted by, the sibling investigation's independent finding — via a different
oracle, a real `daxdump_extracted/ECL3_097.txt` script dump, not consulted for this document
— that this same broad 4609..5083 region carries genuine ECL `SAVE`-string text elsewhere in
its span; a 475-byte region has room for more than one fragment, and this document only reads
the first 26 bytes of it.) **No DOS-A anchor exists in this range to check against Amiga, and
this document does not manufacture one.** Amiga-1
and Amiga-2 do carry nonzero bytes in the corresponding shifted window, and every one of them
is again at an even offset (extending the parity observation to range 2 by pattern, not by
matched value) — but with no DOS-A value to compare against, this is weaker than range 1's
finding and is reported as such.

### So: (a) or (c)?

**The raw, literal answer to the question as posed: the value byte lands at the OTHER parity
in Amiga (even) than in DOS (odd).** Taken at face value that is the outcome the task frames
as refuting the pure-byte-array reading (c) and supporting a genuine endian-swapped word (a).

**But this measurement is confounded by a fact this document already established
independently in §2, and reporting the flip without that caveat would overstate it.** The
whole header — table included — is already known to carry a uniform **+1 byte shift** that
starts somewhere before offset 461, for reasons unrelated to this table (there is nothing
table-specific about it; the same +1 shift is what let every other header landmark in §2
line up). A single generic byte inserted anywhere *before* a fixed-layout block moves that
whole block's *absolute* file offset by one, which mechanically flips the absolute-offset
parity of every byte inside it — **regardless of whether the block's own internal byte order
changed at all.** Checking the *relative* structure, not just the absolute offset: in every
one of the 7 exact-match cells above, the value byte is still the **second** byte of its pair
and the zero byte is still the **first**, in both files — i.e., relative to each platform's
own copy of the table, **the internal (zero, value) order is unchanged.** Under a genuine
endian-swap of a real word value, the internal pair order itself would invert
(value-then-zero replacing zero-then-value at the same relative table position); that is not
what these seven cells show. What they show is consistent with the entire 637-byte table
having been copied byte-for-byte, unmodified, and merely relocated by the same generic +1
shift that also moves everything else in the header.

**Conclusion, stated as the measurement actually supports it:** the naive absolute-offset
parity check says "flipped," and that is the literal, correctly-measured answer to the
question as posed. But once corrected for the independently-confirmed +1 shift that precedes
the table for unrelated reasons, the table's own internal byte order is **unchanged** between
platforms in all 7 available anchors. That rules out a native-endianness reinterpretation
(DOS little-endian vs. Amiga big-endian machine words would need the pair order itself to
invert, and it does not) but it does **not**, on this evidence, cleanly decide between (a) "a
fixed, always-big-endian on-disk word convention used identically on both platforms" and (c)
"two interleaved byte arrays, copied verbatim" — both predict byte-identical content, which
is what is observed. **This document treats the question as narrowed, not settled**: ruled
out is an endian-swap explanation; not ruled out is either surviving reading. Reporting the
raw number without this correction would have been the more dramatic-sounding answer and the
less honest one.

## 4. Amiga-1 vs Amiga-2

Both files are 5481 bytes (same format, same title — see §1). Direct byte diff:

```
total: 276 of 5481 bytes differ (5.0%)
header region  (offset 0..5143):     168 of 5144 bytes differ (3.3%)
roster+tail region (offset 5144..5480): 108 of 337 bytes differ (32.0%)
```

The two are **different save states of the same title** (Amiga-1 = the "Sir Strongsword"
party, on `ChampionsOfKrynn` disk 3; Amiga-2 = the "Caldor" party, parked under the DQK
cloud-saves tree — see §1), not different titles and not the same save duplicated. The
header diffs cluster in exactly the same offsets identified as the "table" in §3 (e.g. 386,
388, 392, 394, 396, 400...), consistent with that region holding world-state/progress data
that differs between two independent playthroughs. The much higher diff rate in the
roster+tail region (32%) is expected — that region embeds the six character-name-derived
`CHRDATA{n}` tags and roster bytes, which necessarily differ character-by-character between
two different six-person parties.

## Summary of what is proven vs. what is not

**Proven (re-derived in this document from the bytes, not asserted):**
- Amiga-2 is a Champions of Krynn save, not Death Knights of Krynn or Dark Queen of Krynn
  (four independent byte/filename signals in §1).
- The 12-byte growth splits 3 (header) + 6 (roster entries, 1 per entry × 6) + 3 (trailer
  tail); the roster-entry-width growth (41→42) is exact and structural across all five
  observed gaps.
- A +1 byte shift covers the header from somewhere in `[1, 461)` through at least offset
  3710 (nine independent exact-value matches).
- One further insertion is pinned to an exact byte: between DOS offsets 5121 and 5122.
- Within range 385..1021, the table's internal (zero, value) byte order is unchanged between
  DOS and Amiga in all 7 available anchor cells; the observed absolute-offset parity flip is
  fully explained by the independently-confirmed +1 shift.
- Amiga-1 vs Amiga-2 are different save states of the same title (CoK), 5.0% of bytes differ
  overall, concentrated in the "table" region and the roster/character-name region.

**Not proven / explicitly left unsolved:**
- The exact byte position of the first header insertion (only bounded to a 460-byte window).
- The exact byte position(s) accounting for the header's growth between the pinned
  5121/5122 insertion and the roster boundary (the pre-roster zone does not admit a clean
  byte-for-byte shift in these two samples).
- Whether the table is best modeled as (a) fixed-big-endian 16-bit words or (c) two
  interleaved byte arrays — the endian-swap explanation is ruled out, but (a)-without-a-swap
  and (c) remain observationally identical on this evidence.
- Range 4609..5083's cross-platform correspondence — no DOS-A anchor exists there; only a
  weaker, value-unverified parity pattern is reported.
- What the non-constant, Amiga-only byte immediately before each roster tag actually encodes
  (reported to the format-doc owner above, not resolved here).
