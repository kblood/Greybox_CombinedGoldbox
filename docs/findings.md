# Consolidated Findings — Krynn Trilogy (verified)

This is the **authoritative synthesis** of the three investigation passes. Where it
disagrees with the individual docs, this file wins (it is backed by direct byte-level
verification). Source docs: `amiga-inventory.md`, `amiga-format-research.md` (note: its
"DQK still uses DAX" inference is **WRONG** — see Containers below), `dos-inventory.md`,
and the C64 set under `docs/engine/research/c64-*.md`.

## 1. "Best graphics" verdict — both project claims hold

| Game | Best platform | Why | Confidence |
| ---- | ------------- | --- | ---------- |
| Champions of Krynn (CoK, 1990) | **Amiga** | DOS is **EGA 16-color only**; Amiga is 32-of-4096 with reworked detail + extra combat sprites. | High |
| Death Knights of Krynn (DoK, 1991) | **Amiga** | "Last Gold Box without VGA" — DOS **EGA 16-color only**; Amiga 32-color. | High |
| The Dark Queen of Krynn (DQK, 1992) | **DOS VGA (256-color)** (Mac = equal peer) | DOS/Mac = 256-color VGA; Amiga DQK still 32-color (weakest). | High |

Evidence (DOS side, from binaries/configs): CoK & DoK `START.EXE` setup offers only
CGA/EGA/Tandy, no VGA strings; `KRYNN.CFG` stores `E`. DQK `INSTALL.EXE` offers
`"VGA (256 colors)" / "EGA (16 colors)" / "Tandy 16 Color"` and both EXEs carry
`"Installed for VGA only!"` enforcement strings. → **CoK/DoK never had a 256-color DOS
release**; the only way to show their art in 256 colors under DOS is a VGA-capable engine,
i.e. the **DQK engine**. This is the technical justification for the whole "rebuild on DQK"
plan. The lossy direction (DOS EGA-16 → richer) is correctly avoided by sourcing CoK/DoK
art from the **Amiga**.

## 2. The five container formats (VERIFIED by magic bytes)

| Platform / game | Ext | First bytes | Format |
| --------------- | --- | ----------- | ------ |
| DOS CoK / DoK | `.DAX` | `24 00 72 00 …` (LE word header) | **DAX** — headerless: one `uint16 toc_bytes` (`= entries * 9`), then that many bytes of 9-byte TOC entries `{u8 block_id, u32 data_offset, u16 raw_size, u16 comp_size}`, then signed-byte-RLE block data at `2 + toc_bytes`. No palette in file (fixed EGA-16). |
| Amiga CoK / DoK | `.DAA` | `00 77 c9 00 …` | **DAA** — structurally DAX-adjacent but distinct (Amiga = big-endian 68000). **SOLVED** — see `docs/daa-format.md` (container/header/endianness fully decoded, `tools/daa_decode.py`), including the 6-byte sub-frame inner pixel codec used by `SPRIT*`/`PIC*`/big `HEAD*` (`tools/subframe_decode.py`, **158/158** sub-blocks, see `docs/engine/research/subframe-format.md`). The former "~11 mis-routed files" residue is **CLOSED (2026-07-18)** — all were ordinary 9-byte-TOC standard frames (word0 divisible by both 9 and 6; the sub-frame tool's naive `%6` routing was the bug). **Every Amiga `.DAA` graphics file now decodes.** |
| DOS DQK | `.TLB` / `.GLB` | `48 4c 49 42` = **`HLIB`** | **HLIB "DataLib"** — a tagged container: `HLIB` header then typed sub-chunks: **`TILE`** (graphics frames, **embedded VGA palette, stored as full 8-bit RGB in the file — the engine shifts it `>> 2` for its 6-bit DAC, and layers leaves by plain overwrite order into one shadow palette; see `docs/hlib-format.md` §2 and §2d**), **`DIG4`** (digitized sound), **`DATA`** (ECL scripts / GEO maps / generic). `.GLB` is the master-library variant (e.g. `ECL.GLB`, `GEO.GLB`, `SOUNDS.GLB`). |
| Amiga DQK / Curse / Secret / Pools / Gateway / Treasures | `.TLB` / `.GLB` | `47 4c 49 42` = **`GLIB`** | **GLIB** — the big-endian Amiga sibling of HLIB, same member shape and same tagged sub-chunks. Added 2026-08-22; before that `decodeAsset` did not sniff it at all, so **every** Amiga container from these six titles threw. Its palette story was only completed in round 32: letting a >= 32-colour fallback reach 5-plane sets took Curse, Secret, Gateway and Treasures to 100% real `glib-ctab`. Decoder: `packages/engine/src/loaders/glib.ts`. |
| Amiga Pool of Radiance | `.DAX` (name only) | no magic — identified structurally | **Pool-Amiga** — the **fourth Amiga container**, and the one this project called "a 4th, distinct, unsolved format" for over a year. A big-endian backwards-bit-stream LZSS with an XOR checksum behind a BE 10-byte TOC; it shares the `.dax` extension with DOS DAX and is **not** related to it. **FORMAT SOLVED 2026-07-22** (`7f47df9`; palette dispatch and `sqrpaci` closed 2026-07-23, `85528f5`), **REACHED THE ENGINE 2026-09-03** (`24d0ff3`) — two dates, and conflating them is itself a mistake this table made on its first draft. For six weeks the format had a verified Python decoder and the browser could not open a single one of these files, which is the "solved but unwired" pattern in its purest form. See `docs/pool-amiga-format.md`, `tools/pool_amiga_decode.py`, `packages/engine/src/loaders/poolAmiga.ts`: 843/843 block hashes and 1672/1672 frame hashes identical to the Python oracle (bit-flip null 0/843), and a hintless sniff with 23/23 true positives and **0/57 false positives** against real DAX, TLB/GLB and DAA, which is why its `decodeAsset` branch can safely precede `sniffDaa`. |

**Correction recorded (2026-09-03):** this section was headed "the three container
formats" until today, and it is the doc `CLAUDE.md` names as the authoritative synthesis.
It had been wrong twice over: `GLIB` landed on 2026-08-22 and `pool-amiga` on 2026-09-03,
and neither reached this table. A synthesis doc that lags the format library by two whole
containers is the same failure class as a stale test pin — the number in the heading was
load-bearing for anyone reading this file first, exactly as instructed. Also note the two
extension collisions this table now has to carry: `.TLB`/`.GLB` means HLIB on DOS and GLIB
on Amiga, and `.dax` means DAX on DOS and Pool-Amiga on Amiga Pool of Radiance. **Sniff the
bytes; never route on the extension.**

**Correction recorded:** DQK does **not** use DAX. It uses the HLIB/DataLib container
generation (the same lineage later used by FRUA / Unlimited Adventures). This matters: the
rebuild target format is **HLIB**, and any repacker we build writes HLIB `TILE`/`DATA`
chunks, not DAX.

### 2b. Correction (2026-08-22) — "every Amiga `.DAA` graphics file now decodes" was not true of `*COM`

The row above has said since 2026-07-18 that every Amiga `.DAA` graphics file decodes. That
claim survived four rounds of review because the failure was **silent**: `DUNGCOM`, `WILDCOM`
and `RANDCOM` have a perfectly ordinary 8-byte frame header (`height = 24`, `width_div8 = 3`),
so `parseFrameHeader` *succeeded* on them and returned a 24×24 raster. It was simply the wrong
24×24 raster — the first item's pixels interleaved with every other item's.

These blocks are **one strip**, not N items: a single virtual image `N·24` px wide × 24 tall,
5 contiguous bitplanes whose row stride is word-aligned over the **whole strip**
(`rowBytes = ceil(N·24/16)·2`), with a 73-byte preamble and 2 trailing bytes. Item `t` is the
pixel-column band `[t·24, t·24+24)`. This is the already-solved `8X8D` tile convention
generalised from 8 px to 24 px; six earlier sweeps missed it because every one of them assumed
a per-item stride. Verified against the DOS `*COM.DAX` oracle at refinement
`1 − H(DOS|Amiga)/H(DOS)` = **1.0000** for both CoK and DoK `DUNGCOM`, against item-permuted
nulls of **0.19** and **0.18**. Full writeup and the four metrics that failed first:
`docs/daa-format.md` §3a. Decoders: `decodeDaaComStrip` / `isDaaComStrip` in
`packages/engine/src/loaders/daa.ts`, `com_strip_to_rgb` in `tools/daa_decode.py`.

**The general lesson, which cost more than the format did:** a decoder that returns *something*
is not a decoder that works, and "all files decode" is not a testable claim unless the output is
checked against an independent oracle. The same failure shape was found the same week in
`decodeGlib`, which `continue`d past members it could not parse and so reported twelve shipped
Amiga libraries as fully decoded while discarding **437,680 of 439,671 bytes**. Both are fixed;
both were invisible to "does it throw?" testing.

### 2a. Correction (2026-08-21) — HLIB `DATA` members carry a big-endian length word

The container walk in §2 was right; one layer *below* it was not. Every member of DQK's
`MONCHA.GLB` begins with a **2-byte BIG-endian uncompressed length**, and the RLE stream starts
at byte 2. DQK's own loader reads it (disassembled at file `0x3570C`, canonical `2177:257C`) and
passes it to the decompressor at `00d7:0a1c` as the bounded expected output size. Note the
endianness: everything else in HLIB is little-endian, which is why this went unseen.

This project decompressed each member **from byte 0**, consuming the length word as two RLE
control bytes, so **every DQK monster record was out of phase by a record-dependent amount**.
Header vs decoded length is now exact for **98 of 98** members. FRUA's `MONST.GLB` carries the
same word — its supposed constant "`01 C2` record marker" is `0x01C2` = 450 = the FRUA monster
record size — exact for **127 of 127** members.

**Scope, and it is now the whole DOS corpus (2026-08-24).** Verified for those two `DATA`
libraries and measured **absent from every other one we hold** — all **10** `DATA`/`DIG4` libraries
across the DQK and FRUA installs, on the decisive predicate (the big-endian word equals
`len(monchaRLE(member[2:]))`): `MONCHA` **98/98** and `MONST` **127/127** against **0** for the
other eight, including FRUA's `GAME.GLB`, `GEO.GLB`, `SCRIPT.GLB` and `STRG.GLB`, which had never
been examined. 225 records carry it, 160 do not, nothing in between. Individual rejections are
independently explained: `ECL.GLB` members all begin with the constant `01 01`, and `GEO.GLB`'s
first two bytes are the map's width/height (its members are stored uncompressed). This supersedes
the earlier "untested anywhere else, therefore not claimed" scoping.

**And the Amiga side, same day:** all six Amiga `GLIB` bestiaries measured (`docs/glib-format.md`
§7a). The word marks an **engine generation**, not the `MONCHA` filename — Amiga DQK **98/98** and
Pools of Darkness **122/122** carry it; Curse of the Azure Bonds **0/78**, Secret of the Silver
Blades **0/70**, Gateway **0/69** and Treasures **0/130** do not. Those four also share a different
record layout (`u8 nameLen` + name, against DQK's name at a fixed `0x68`), and Gateway/Treasures
store their records uncompressed while mis-tagging the container as a `GLIB` master. The natural
rule "the word appears iff the record size varies" is **refuted** by FRUA, all of whose records are
450 bytes and which carries the word anyway. Specs: `docs/hlib-format.md` §6a, `docs/glib-format.md`
§7a; pinned by `packages/engine/test/hlib.test.ts` and `tools/test_glib_data_conventions.py`.

**What moved on the DQK bestiary as a result** (byte-grounded, from the retail
`DISK2\MONCHA.GLB`): record lengths **416..598, median 436** (previously reported 88..533,
median 321 — a product of the shift); the name is at a **fixed** `0x68` and the ability block at
a **fixed** `0x78` in all 98 (previously "member-dependent, 21…300+", found by search); **86 of
98** members carry full validated stats (previously ~20); roster **74 monster / 8 humanoid /
5 sub / 11 npc**, read from an is-monster flag at `0x66` and a race byte at `0x58` rather than
from name heuristics. The garbled names the old decode produced (SAUAGIN, IRON OLEM, UMBERHULK,
TASLEHOFF, UVWW., …) are **artefacts** and read SAHUAGIN, IRON GOLEM, UMBER HULK, TASSLEHOFF,
LICH on the corrected decode. The one previously injected value — UMBER HULK's "canon" AC — is
**retired**: AC 2 is on disk, and **no** monster in the archive now carries an injected value.
Full account and the writer-side fix: `docs/engine/research/cok-m4-fidelity-plan.md` §29.

## 3. What was extracted (Amiga, into git-ignored `amiga_extracted/`)

- **CoK** — clean `ChampionsOfKrynn_Nof3.Adf` set, 3 disks, standard OFS, **109 files**.
  Art candidates: `PIC1/2.DAA`, `SPRIT1/2.DAA`, `BIGPIC1/2.DAA`, plus directly-viewable IFF
  `scrn*.lbm` title screens.
- **DoK** — `dkk01/02.adz` (Skid Row, decompressed), 2 disks, **137 files**.
  Art candidates: `PIC2.DAA` (282 KB), `CPIC1.DAA`, `BACK1.DAA`, `SPRIT1.DAA`, IFF `Title*.LBM`.
- **DQK (Amiga)** — our own ADF extraction is partial (Disk 3 segfaults `unadf`), but a
  **complete Disk 3 was recovered 2026-07-18** from the WHDLoad pre-unpacked `DarkQueenOfKrynn`
  pack (`CBODY.TLB`, `ECL.GLB`, `FINAL.TLB`, `FRAME.TLB`, `GEN.TLB`, `GEO.GLB`); its `GEO.GLB`
  is byte-length-identical to DOS `DISK3\GEO.GLB` and 99.6% identical in content. Still *low
  priority* — we want **DOS** DQK art — so this is a completeness win, not an art-source change.
  Note the Amiga DQK-and-later titles use a **`GLIB`** magic, the big-endian sibling of DOS
  `HLIB`. See `docs/amiga-inventory.md` §2026-07-18.

## 3b. C64 — a fourth platform, and an independent oracle (added 2026-08)

Seven complete C64 title sets (49 `.d64` sides, 4,426 PRG files, all reading clean) are
referenced read-only from `D:\Games\Emulator\C64\Goldbox\`: Pool of Radiance, Curse of the
Azure Bonds, Secret of the Silver Blades, Champions of Krynn, Death Knights of Krynn, Gateway
to the Savage Frontier, and Buck Rogers. Read them with **`tools/c64_disk.py`** (pure Python,
verified against VICE's `c1541`); full writeup in `docs/engine/research/c64-disk-format.md`.

**Why this matters beyond completeness:** the C64 release is effectively an **unpacked `.DAX`**
— assets are loose CBM files whose filename hex suffix is the DOS block id. That makes a C64
disk an **independent oracle for DAX block identity**, which no other platform gives us.

Two traps that have already produced wrong results here, both non-obvious:
- The 2-byte PRG prefix is a **load address rewritten by the DOS port**, not inherited —
  always compare payloads **from offset 2**.
- Glob `<Title>\*.d64` **non-recursively**; superseded damaged dumps are retained in each
  title's `superseded\` subfolder and a recursive glob reads them back.

Format status (`docs/engine/research/c64-*.md`, decoders + 1,378 pinned tests in `tools/` as of 2026-09-03):

| Family | Files | Status |
| --- | ---: | --- |
| `PIC` (fixed-size) | 37 | **SOLVED** — 570 screen + 570 colour + 1536 glyphs + 3 registers = 2679 body |
| `CHARSET` | 7 | **SOLVED** |
| `COMPIC` / `CHARPIC` | 379 | **SOLVED (2026-08-14)** — the 162-byte unit is two 3x3-cell multicolour animation frames of one sprite (24x24 px each) plus a 9-byte colour map per frame. Multi-unit composition solved the same day using the DOS release as an oracle: MON byte 153 is a **shape** code (24x48 tall / 48x24 wide / 48x48), and units fill columns **right to left**, top to bottom |
| `PIC` (variable-size) | 368 | **NOT solved** (zero pixels decoded), but no longer shapeless. **Header solved 2026-08-14:** a 32-byte NUL-terminated animation **sequence** of frame ids `A`-`I` (`ABCB` is a ping-pong loop, so it is a playback order, not a table), then a **24-byte sub-header at 32-55**, payload at 56. The sub-header **declares the geometry** — `11`, `11`, u16 `968` (=11·11·8), u16 `121` (=11·11) — plus a pointer into C64 **colour RAM** (`$D8xx`). So **88x88 is now a C64-side fact in all 352 conforming files**, not an oracle claim limited to the 288 that pair with a DOS block; the 37 solved fixed-size `PIC` bodies are the control and carry nothing at those offsets. **First section decoded 2026-08-14:** the file **ends in C64 colour RAM**, under a **literal-with-run-marker** codec (`c >= 0xF0` emits the next byte `256-c` times) — SSI's RLE stores a count first, this stores a value first, which is why six rounds of RLE attempts missed. 109/211 single-frame files; band sweep null gives **0/211** for `16..31`, `32..47`, `64..79`, `128..143` and for `0..7`, with no gain from widening past 15. ⚠️ The section *length* is not resolved (`N=100` fits more files than `N=121`); 121 comes from the sub-header and is only consistent with the tail. Strengthened the same day to a **parameter-free** form — decode the whole payload, look at the last 121 bytes: **155/211**, all 211 parsing as complete streams, and **0/211** raw tails already `<16`, so the codec earns every hit. Three layouts eliminated: deduplicated glyphs (twice — its `max(screen)+1` prediction, and a flat `(T-242) mod 8`), `[glyphs][screen][colour]` (the bytes where screen would sit are indistinguishable from a mid-picture control window), and a longer-run opcode. ⚠️ **Bounded the same day:** colour-RAM-*ranged* is not the same claim as *this picture's* colours, and the second is **null** — against the DOS sibling's per-cell dominant colour the adjusted Rand index is flat (median p 0.471 vs 0.5; 56/97 files below 0.5 vs 48.5±4.9), across six cell orderings and four colour proxies. The test detects an injected effect from 12% of cells upward, so this is a real negative, not a blind instrument. Most likely the C64 art is **redrawn** (multicolour halves horizontal resolution: 11 cells = 44 multicolour pixels across), which would mean the oracle can validate C64 *shapes and ids* for this family but never its *pixels*. **Resolved 2026-08-15 (§1.4f), from the C64 side alone:** the block really *is* a picture map — cells one row apart agree far above neighbouring lags (median local excess **+0.122**, **133/155** files at p≤0.05 vs 7.8 chance) against a **run-preserving** null (permute maximal equal-value runs, holding histogram *and* run lengths fixed) that scores −0.000; a plain shuffle would have passed for free since the codec's output is run-heavy. So the window is not misplaced and the flat cross-platform result is the artwork. ⚠️ **But the measured row stride is 12 while offset 45 declares 11** — calibrated against DOS 11×11 dominant-colour maps, which the identical statistic peaks on at 11 (+0.117) where the C64 tail peaks at 12 (+0.071, 11 at +0.013, harmonic at 24); neither a constant twelfth column (spread 0.043, matched by the null) nor a duplicated one (best pair 0.532) explains it, and the trailing `<16` region runs median 136, consistent with 12·11=132. `968+121+121` is the multicolour **bitmap** layout and is refuted on the bitmap-mode prediction (screen window: 15 of 16 distinct nybbles vs a control's 15; beats control in 34% of files) — §1.4e.1's earlier kill used the character-mode prediction, which could not test it. **§1.4g, same day:** the head is **not a cell-major bitmap** — a DOS picture repacked into that order shows the cell structure (+0.0097 at lag 8, +0.0083 at 88) and the head shows none (−0.0007, +0.0001), so no raster-layout search on it can work; but it is **not an opaque layer either** (zlib 0.720 vs the raw payload's 0.915), i.e. a structured variable-length representation. **First cross-platform content link:** raw payload length vs distinct 8-byte cell patterns in the repacked DOS bitmap is **r=+0.727** (permutation max 0.361) on the 97 stills — the decode does *not* improve it (+0.590), so it is evidence about the file, not a validation of the decode. ⚠️ **This corrects §1.4b's defence** (§1.4g.1): its complexity proxies predicted C64 length at r=0.008/0.087, and a control that cannot predict the outcome cannot adjust for it — re-run with the r=+0.73 proxy the animation gap survives in all four quartiles (within-bin mean **+584.3** vs +580.7 unstratified, permutation max +156.5), so the finding stands and only its stated defence was invalid. Glyph bitmaps and screen codes still unread, **zero pixels rendered** |
| `WALLDEF` / `WALLSET` / `SPRITE` / `MON` | — | partially characterised; see the per-format docs. Note the oracle cannot help `WALLDEF`: DOS `WALLDEF` blocks decompress cleanly but parse as **no picture at all**, so that side has no shape to publish |

COMPIC was the single highest-value C64 target and is now **solved**, taking the share of the
C64 art corpus that renders from **~3%** (44 of 1,365 files) to **~31%** (423). Multicolour
character mode is settled corpus-wide.

Port/version scope beyond this project's three Krynn games, and what we physically hold of
it, is split across two companion documents: `goldbox-ports-census.md` (what exists, web-sourced
and adversarially verified) and `goldbox-versions-holdings.md` (what we hold, byte-grounded —
DOS coverage of the line is complete, and FRUA is a second HLIB corpus alongside DQK).

## 3c. GLBR — DOS Gen1 music note-event format (added 2026-09-04)

Not a container format (it does not belong in the §2 table) — it is the **asset** format
carried inside `MUSIC.DAX`'s song blocks on the DOS side. Fully solved (event body plus both
instrument-bank shapes); see `docs/glbr-format.md`. It is a **five-title** DOS Gen1 music
format, **not six**: Death Knights of Krynn, Gateway to the Savage Frontier, Treasures of the
Savage Frontier, Pools of Darkness, and Buck Rogers: Countdown to Doomsday.
`docs/glbr-format.md` said "four" titles until round 33 found Buck: Countdown to Doomsday
also ships it (**2026-09-04**), and briefly counted **Buck Rogers: Matrix Cubed** as a sixth
on the strength of its `MUSIC.DAX` decoding to the same 8 `GLBR` songs, byte-identical to
Countdown's own file. **CORRECTED 2026-09-04 (round 34 R4,
`docs/engine/research/matrix-cubed-audio.md`):** that byte-identity was the problem, not a
second confirmation — Matrix Cubed's own unpacked `START.EXE`/`GAME.OVR` never open
`MUSIC.DAX` by name (0 file-open references in either binary, against Countdown's own 2), so
Matrix's copy is an **unopened leftover**, not evidence its own engine plays GLBR. Matrix's
real music is Miles AIL: three `.XMI` files (`BUCKA/B/C.XMI`, 7 songs each) plus a
152-instrument `FATV9.AD` timbre bank — the same Miles/AIL stack The Dark Queen of Krynn
uses, decoded by the existing `xmi.ts`/`instrAd.ts` decoders with zero code changes.
`apps/web/src/audio/gameAudio.ts`'s `GLBR_MUSIC_GAMES` no longer lists `'matrix'`.

One caveat does not generalize from the other four GLBR-playing titles, in the source doc's
own words: Countdown's "driver blob contains no `mov dx,0x388` (AdLib) or `mov dx,0x220`
(CMS) immediate anywhere" — i.e., unlike DoK/Gateway/Treasures/Pools, its own playback
driver was never observed routing to the OPL2 backend that `glbr-format.md` §5a documents,
even though the bank bytes still decode as structurally sane OPL2 patches.

Round 33 wired a `{songs, events, channels}` census into `loadGame` (`glbrMusicCensus()`)
and the game-view header for Buck Rogers: Countdown to Doomsday — 8 songs / 1959 events / 31
channel streams. Pinned by `packages/engine/test/loadGameGlbrMusic.test.ts` and the
`buck-rogers-view` e2e case — what makes the decode reachable, not merely correct. Matrix
Cubed's own `matrix-cubed-view` census is manifest-driven (`xmiMusicCensus()` fires once a
title's manifest lists `.XMI` files); whether that manifest update had landed by the time
this line was read is a Phase B question, not a re-measurement — see
`docs/engine/research/matrix-cubed-audio.md` and `docs/glbr-format.md` §6.

## 4. Prior art / tools (use as format reference, don't reinvent)

- **Gold Box Explorer** (bsimser) — batch DAX/TLB → PNG export (extract-only).
- **Simeon Pilgrim's COAB reimplementation / fork** — de-facto DAX + **ECL** spec; the best
  source for the ECL bytecode VM (port its logic for any interpreter we write).
- **Gold Box Companion** — the only tool that *writes* DAX (but EGA icons/fonts/items only).
- **forums.goldbox.games** topics 1073 / 3148 / 1241 — the real community format docs.
- Local: `hackdocs_extracted/` (FRM_DESC, OPCODES, SCRIPT, GEO*, etc.), `daxdump_extracted/`
  (DaxDump.exe, EclDump.exe), `tools/dax_inspect.py`.
- **Gap (in the public/community ecosystem):** no public tool targets **Amiga `.DAA`
  graphics**, and no public DAX/HLIB *repacker* for backdrops/sprites exists. This is a
  statement about what is available to import, not about this repo — we have since built
  both in-tree (`tools/daa_decode.py`, `packages/engine/src/loaders/daa.ts`, and the HLIB
  writer `packages/engine/src/loaders/hlibEncode.ts`; see risks 1 and 2 below).

## 5. Top technical risks (for the main rebuild goal)

1. ~~**Amiga `.DAA` format** is undocumented~~ **SOLVED and fully closed** — including the
   sub-frame inner-pixel codec (SPRIT*/PIC*/HEAD*) and the former "~11 mis-routed files"
   residue. See `docs/daa-format.md` §1b and `docs/engine/research/subframe-format.md`.
   No longer a risk.
2. ~~**No HLIB repacker exists**~~ **SOLVED** — we wrote one:
   `packages/engine/src/loaders/hlibEncode.ts` emits `DATA` libraries
   (`encodeHlibDataLibrary`, line 53), images (`encodeHlibImage`, line 157), `TILE` chunks
   (`encodeHlibTile`, line 236) and the `.GLB` master-library variant (`encodeHlibMaster`,
   line 280). Round-tripped against DQK's own files by
   `packages/engine/test/hlibEncode.test.ts`. No longer a risk.
   ⚠ **2026-08-21 caveat on the member level (§2a):** `encodeMonchaMember` emitted **no**
   length word, so every `MONCHA.GLB` member the CoK→DQK port has ever written round-tripped
   perfectly through our own reader and would have decoded to the wrong length on real
   hardware. Fixed in `monchaEncode.ts`. The lesson generalises to any future writer: a
   reader and a writer agreeing with each other is not evidence — the third party is the
   original engine.
3. **ECL opcode drift** between the CoK/DoK engine and the DQK engine — porting CoK/DoK
   scripts/encounters onto DQK may need opcode translation or engine patches.
4. **"Plays like the original"** is more than art: CoK/DoK maps (GEO), monsters (MON),
   items (ITEM), and ECL logic must be carried onto the DQK engine while preserving original
   mechanics/level ranges/story — the genuinely hard part of the main goal.
