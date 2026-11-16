# Matrix Cubed's real music format: Miles AIL XMI, not GLBR (round 34 R4)

**Status: SOLVED.** Buck Rogers: Matrix Cubed does not play music through its `MUSIC.DAX`
(`GLBR`, `docs/glbr-format.md`) the way Countdown to Doomsday does. Its own unpacked
`START.EXE`/`GAME.OVR` never open `MUSIC.DAX` by name; they name three Miles AIL `.XMI` files
(`BUCKA/B/C.XMI`), five hardware drivers (`ADLIB/MT32MPU/SBFM/TANDY/PCSPKR.ADV`) and one
instrument bank (`FATV9.AD`) — the same Miles/AIL stack The Dark Queen of Krynn ships
(`ADDQ*.XMI` + `INSTR.AD`), not the GLBR stack the other five titles in this family share.

## 0. Why this needed re-checking

Round 33 R5 (`docs/glbr-format.md` §4a) measured that Matrix's `MUSIC.DAX` decodes to 8 `GLBR`
songs, byte-identical to Countdown's own `MUSIC.DAX` (8/8 sha256), and treated the byte-identity
as a *confirmation* that Matrix plays GLBR music too — publishing "GLBR is a six-title format."
That reasoning has the sign backwards: two files being byte-identical is one fact about the
files, not two independent facts about two engines. `md5sum` on both trees:

```
matrixcubed_extracted/BuckRogers2/c/Matrix/MUSIC.DAX   d18b0c71edc72775dc05e9941f5640c9
D:/.../BuckRogers1-CountdownToDoomsday/music.dax        d18b0c71edc72775dc05e9941f5640c9
```

Identical. The question this round asks is not "does this file decode as GLBR" (it does — that
was never in doubt) but "does Matrix's own game engine ever *open* this file." The plan's own
risk section flagged the specific way an unpack-blind string census could get this wrong: round
33's search was against an unpacked image, and if the unpack were partial, Matrix could still
open `MUSIC.DAX` from a segment nobody looked at. That is why Bar A below covers **both**
`START.EXE` (EXEPACK-unpacked) **and** `GAME.OVR` (a `TPOV` overlay container, not
EXEPACK-compressed at all — see §2).

## 1. Method

`tools/matrix_music_strings.py` (this round's re-checkable tool, `tools/test_matrix_music_strings.py`
its tests) censuses both titles' own binaries for filename-shaped strings:

1. `START.EXE` is genuine Microsoft EXEPACK v1 for both titles (same finding as round 32 R5's
   `tools/exepack_unpack.py` census of all eight Gen1 loaders) — unpacked via
   `exepack_unpack.unpack()` before scanning.
2. `GAME.OVR` for this title pair is a `TPOV` overlay container (round 26/32's own finding,
   `9b0dfeb` "Map Buck Rogers' GAME.OVR too, and find it is TPOV not FBOV") — **not**
   EXEPACK-compressed. `exepack_unpack.unpack()` correctly rejects it on the `'MZ'` magic check
   (`data[:2] != b'MZ'`), so `matrix_music_strings.py`'s `load_bytes()` reads it raw; its
   strings are already uncompressed bytes.
3. Regex census for `.ADV`/`.XMI`-shaped filename tokens, `BUCK[A-C]`, `FATV`, and — the
   discriminating construction — a Pascal (length-prefixed) `"MUSIC"` string immediately
   followed by a length-prefixed `".dax"` string (`\x05MUSIC\x04.dax`), distinct from any bare
   `"MUSIC"` substring.

## 2. Why "bare MUSIC" would have been the wrong test

Both games' binaries contain the substring `MUSIC` outside of any file-open context:

| binary | offset | bytes | meaning |
|---|---|---|---|
| Matrix `GAME.OVR` | `0x2cb` | `...Susan Manley\x06MUSIC:\x1aRalph Thomas & The Fat Man...` | a credits-screen field label ("MUSIC:") |
| Countdown `GAME.OVR` | `0x223` | `...NCOUNTER CODE:      MUSICAL SCORE:\x1bDAVID SHELLEY...` | a credits-screen field label ("MUSICAL SCORE:") |

Both are ordinary end-credits text, present in **both** titles' `GAME.OVR` — a naive "does the
string MUSIC appear" test would have found a hit in Matrix and concluded nothing (a false
positive that happens to have the right polarity by accident, which is worse than an honest
miss). The actual file-open construction is the Pascal-string pair, found in Countdown's
unpacked `START.EXE` and nowhere in Matrix's:

```
Countdown START.EXE @ 0x7e3b:  ...\x05MUSIC\x04.dax\x17unable to load com file...
Countdown START.EXE @ 0x7f9e:  ...\x05MUSIC\x04.dax...           (a second, separate call site)
```

## 3. Bar A — reproduced from bytes, two-sided

| | `.ADV` names (>=3) | `BUCK[A-C]` hits | `MUSIC.DAX` opens |
|---|---|---|---|
| **Matrix** `START.EXE` (unpacked, 75,344 B) | 5: `adlib.adv, mt32mpu.adv, pcspkr.adv, sbfm.adv, tandy.adv` | 5 | **0** |
| **Matrix** `GAME.OVR` (raw, 212,529 B) | 0 | 0 | 0 (1 bare "MUSIC:" credits label) |
| **Countdown** `START.EXE` (unpacked, 69,760 B) | 0 | 0 | **2** (both the Pascal `MUSIC`+`.dax` construction) |
| **Countdown** `GAME.OVR` (raw, 210,071 B) | 0 | 0 | 0 (1 bare "MUSICAL SCORE:" credits label) |

Matrix's loader carries >= 3 `.ADV` names and `BUCK[A-C]`, and 0 `MUSIC.DAX` opens; Countdown's
carries a `MUSIC.DAX` open and 0 `.ADV`/`.XMI` names — Bar A passes, and each side is the
inverse of the other, which is what makes it a discriminator rather than a coincidence.

**Honest limitation of the tool's `XMI_RE`**: it requires a fused `NAME.xmi` token, but Matrix's
loader builds an XMI path the SAME two-Pascal-string way it builds `MUSIC`+`.dax` — a
length-prefixed base name immediately followed by a separate length-prefixed `.xmi` extension
string, verified at `START.EXE` file offset `0x8d34`:

```
...\x8aF\xff\x89\xec]\xca\x04\x00\x04.xmi\x06fatv9.U\x89\xec...
```

So `xmi_names` reports empty for Matrix even though the `.xmi` extension string and the
`BUCKA`/`BUCKB`/`BUCKC` base-name strings are both genuinely present (caught separately by
`BUCK_ABC_RE`/`FATV_RE`). Bar A does not require `xmi_names` non-empty for Matrix for exactly
this reason; it does require it EMPTY for Countdown, which builds no XMI-shaped string of any
form.

## 4. Bar B / P11 — all three XMI files decode, FATV9.AD parses, no format branch

Measured directly against the existing `packages/engine/src/audio/xmi.ts` /
`instrAd.ts` decoders (`packages/engine/test/matrixXmi.test.ts`), with **zero code changes** to
either module:

| file | size | `sniffXmi`/`sniffInstrAd` | songs | per-song event counts | per-song timbre counts |
|---|---|---|---|---|---|
| `BUCKA.XMI` | 12,178 B | true | 7 | 897,134,244,82,213,146,968 | 8,7,8,4,7,10,9 |
| `BUCKB.XMI` | 11,578 B | true | 7 | 844,109,209,62,221,139,1039 | 8,7,8,4,7,8,10 |
| `BUCKC.XMI` | 2,242 B | true | 7 | 153,27,68,30,24,11,82 | 0,1,1,1,1,1,1 |
| `FATV9.AD` | 3,042 B | true | — (152 instruments) | — | — |

`FATV9.AD` decodes to 152 `(patch,bank)` instrument records under the exact same
`decodeInstrAd`/`sniffInstrAd` DQK's own `INSTR.AD` (3,982 B, 199 instruments) uses — a smaller
bank, same container shape, confirming the plan's "expect the same Miles timbre format,
different bank size" prediction. `sniffInstrAd`'s own doc comment (written 2026-08-25, before
this round) already records that its four structural clauses accepted only one genuine bank
across 40 candidate files at the time; `FATV9.AD` is a second, independent genuine hit for that
same predicate, not a new false positive.

**Bar B's alternative** ("the XMI files are Countdown leftovers too," predicting they are
byte-identical to something in Countdown's own tree): Countdown's install directory ships
**zero** `.xmi`/`.adv`/`fatv9*` files of any kind (`readdirSync` over
`{external-game-holdings}/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/`, 91 entries, none matching —
`matrixXmi.test.ts`'s null test). There is nothing in Countdown's tree for the XMI files to be a
copy of; the alternative is not just unconfirmed, it has no candidate to point at.

**P10/P11 verdict**: both predictions hold exactly as stated — see the report for the exact
acceptance-bar bookkeeping.

## 5. What is NOT resolved (report items, not bars, per the plan's method step 4)

- **Which `.ADV` driver Matrix selects at runtime** is not determined. `MATRIX.CFG` (55 bytes,
  mostly single-digit option fields) carries no obviously readable driver-name field; DQK's own
  driver-selection mechanism was not cross-checked either. This would need a GameLink/DOSBox-X
  trace (out of this item's scope — R6 is the round's sole DOSBox-X owner).
- **Which of `BUCKA`/`BUCKB`/`BUCKC.XMI` plays at which scene** (title/explore/combat) is
  likewise undetermined. `gameAudio.ts`'s `MATRIX_MUSIC_XMI` picks `BUCKA.XMI`'s first song, the
  same honest-arbitrary-but-real-audio choice DQK's own `DQK_MUSIC_XMI` makes for `ADDQ1.XMI`'s
  first song — not a verified "this is the title theme" claim.
- **Whether Matrix's own driver actually dispatches to one of the five `.ADV` hardware backends
  at runtime** (vs. merely shipping the files) is a claim about behavior, not about file
  presence; this doc only establishes what the loader NAMES, the same evidentiary level round
  32/33's own driver census used for the GLBR titles.

## 6. Cross-references

- `docs/glbr-format.md` — top-of-file correction notice, §4a correction note, §6 rewired
  consumer description.
- `apps/web/src/audio/gameAudio.ts` — `GLBR_MUSIC_GAMES` doc comment (removal rationale),
  `MATRIX_MUSIC_XMI`/`MATRIX_INSTR_AD` constants, the `game === 'matrix'` branch in
  `ensureLoaded()`.
- `packages/engine/src/game/loadGame.ts` — `xmiMusicCensus()`, `hasXmiSiblings` manifest-driven
  suppression of `glbrMusicCensus()`.
- `packages/engine/test/matrixXmi.test.ts` — direct XMI/InstrAd decode pins.
- `packages/engine/test/loadGameGlbrMusic.test.ts` — the two-sided census pin (Countdown
  unchanged; Matrix's real manifest still pre-Phase-B; a test-local manifest clone showing the
  corrected census).
- `packages/engine/test/glbrBuckMatrix.test.ts` — updated doc comment; its own tests are
  unchanged (they are true statements about `MUSIC.DAX`'s bytes, not about playback relevance).
- `tools/matrix_music_strings.py` / `tools/test_matrix_music_strings.py` — the string census
  this doc reports.
