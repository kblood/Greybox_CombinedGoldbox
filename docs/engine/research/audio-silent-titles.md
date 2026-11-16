# Silent-titles audio gap — inventory, decode, and honest verdicts (2026-07-21)

**Status: WIN (updated 2026-07-27).** Six titles fell silent in the web app's
`gameAudio.ts` (`SILENT_GAMES`): Curse of the Azure Bonds (`coab`), Secret of the Silver
Blades (`secret`), Gateway to the Savage Frontier (`gateway`), Pool of Radiance (`pool`),
Treasures of the Savage Frontier (`treasures`), Pools of Darkness (`pools`). This
investigation:

- **Solved and wired real digitized SFX** for 5 of the 6 (all but Pool of Radiance) —
  their Amiga `SOUNDS.GLB` files decode via a new `DIG8` codec. `SILENT_GAMES` now contains
  only `pool`. (The "byte-identical to the already-verified DOS `DIG4` codec" half of this
  claim was **withdrawn 2026-08-21** — same 6-byte framing, different codec; see §2.1a.)
- **Confirmed Pool of Radiance and Neverwinter Nights (DOS/AOL) have no local audio source at
  all** — real, well-evidenced negatives, not research gaps. They stay honestly silent. NWN is
  listed separately below because it was added to Greybox after this investigation's original
  six-title scope.
- **Audio profile changes are generation-safe.** Changing games invalidates any older asynchronous
  asset load, so a late CoK fetch cannot repopulate the shared manager after a route has selected
  silent NWN/Pool audio. The focused `explore-nwn` browser regression covers that CoK → NWN race.
- **§3 originally reported "substantially advanced, but did not close" on the DOS
  `MUSIC.DAX`/`GLBR` music format.** A later same-day follow-up investigation **closed the
  event body** (`docs/glbr-format.md`, `docs/midi-dax-format.md` §2.5) by disassembling the
  driver's own per-tick stream reader and cross-validating against every real song block in
  all 4 titles that share the format. **Death Knights of Krynn, Gateway, Treasures, and
  Pools of Darkness now play real, decoded, audibly-verified DOS-EGA music**, additive to
  the Amiga SFX below — see §6 for the update. §3's original text is left intact below as
  an accurate record of that investigation's own honest stopping point; it does not
  describe the current end state.

Per the project's audio-claim rule, every "solved" line below was verified by **decoding
real bytes and inspecting waveform shape** (DC-centred mean, RMS-envelope variation across
the clip) — not just by a container/header parse — and by a **headless browser probe**
that drives the actual `window.__gameAudio` seam and confirms it arms with zero console
errors. See `packages/engine/test/dig8.test.ts` for the automated form of the former.

---

## 1. Inventory — what audio-bearing files each title actually ships

| title | DOS `MUSIC.DAX`/`SOUND.DAX`? | Amiga `SOUNDS.GLB`? | verdict |
|---|---|---|---|
| Champions of Krynn (`cok`) | `MIDI.DAX` (own bespoke format, §3 below) | n/a (uses Amiga SMUS+8SVX, already wired) | already solved pre-existing |
| Death Knights of Krynn (`dok`) | `MUSIC.DAX` (`GLBR`, partially solved) | n/a (uses Amiga SMUS+8SVX, already wired) | already solved pre-existing |
| Dark Queen of Krynn (`dqk`) | `SOUNDS.GLB`/`SFXDQ.VOC` (DIG4) + `ADDQ1.XMI` (solved) | — | already solved pre-existing |
| **Curse of the Azure Bonds** | **none** (no `MUSIC.DAX`/`SOUND.DAX` anywhere in the GOG install) | `DISKA/SOUNDS.GLB` — **DIG8, solved this session** | **SFX now real; no music source exists** |
| **Secret of the Silver Blades** | `SOUND.DAX` only (SFX bank, same family as CoK/DoK's own `SOUND.DAX` — PC-speaker tone table, still unlocated per `docs/midi-dax-format.md` §3); **no `MUSIC.DAX`** | `DISK1/sounds.glb` — **DIG8, solved this session** | **SFX now real; no music source exists** |
| **Gateway to the Savage Frontier** | `MUSIC.DAX` (`GLBR`, same driver+container as DoK — §2 below) | `DiskA/Sounds.glb` — **DIG8, solved this session** | **SFX now real; music format shared-but-still-open** |
| **Pool of Radiance** | **none** (full recursive listing of the nested `POOLRAD/` install has zero `music`/`sound`/`midi`-named file) | **none** (WHDLoad unpacked install's `data/` tree has no sound-named file either) | **genuinely silent on both platforms — confirmed, not a gap** |
| **Treasures of the Savage Frontier** | `MUSIC.DAX` (`GLBR`, byte-identical driver to DoK) | `diska/Sounds.glb` — **DIG8, solved this session** | **SFX now real; music format shared-but-still-open** |
| **Pools of Darkness** | `MUSIC.DAX` (`GLBR`, byte-identical driver to DoK, 8 songs) | `DISK1/SOUNDS.GLB` — **DIG8, solved this session** | **SFX now real; music format shared-but-still-open** |
| **Neverwinter Nights (DOS/AOL)** | **none** (recursive inventory of the extracted 35-file client has no MIDI/XMI, AdLib/Roland, VOC, WAV, or audio archive) | n/a | **genuinely silent local client — confirmed, not a gap** |

DOS paths are the real GOG Galaxy installs (`C:/Program Files (x86)/GOG Galaxy/Games/<title>/`);
Amiga paths are the user's external WHDLoad unpacked installs
(`{external-game-holdings}/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/<Title>/data/...`,
read-only, never vendored — see `CLAUDE.md`'s Amiga-sources section).

---

## 2. The `DIG8` win — Amiga digitized SFX, 5 titles

### 2.1 What `DIG8` is

Every one of the five titles' `SOUNDS.GLB` is a `GLIB` container (`docs/glib-format.md`,
already fully solved) whose members are tagged `DIG8` (non-image, raw payload — the GLIB
container format itself needed zero new work). The open question was purely "what is a
`DIG8` member's byte layout".

> **CORRECTED 2026-08-21.** This section originally answered "**identical to DOS `DIG4`**" and
> shared `decodeDigMember` on that basis. That was wrong in two independent ways, and both
> errors were live in shipped audio until now. The header is **6 bytes, not 4** — in *both*
> banks — so the two bytes of the length word were being rendered as the first two samples of
> every effect in every title. And the two tags are **not the same codec**: the tag name is
> literal. See §2.1a. The corrected layout is:

```
u16  big-endian sample rate (Hz)   -- every member across all 5 titles reads 0x1CFA = 7418 Hz,
                                       except one Pools of Darkness member at 0x2B77 = 11127 Hz
                                       (matching DQK's own documented "high-rate" DIG4 variant
                                       used for its own die/lightning-type effects)
u16  = 0                            -- always-zero high word, same as DIG4
u16  big-endian payload length      -- at offset 4; audio starts at byte 6
...   payload: DIG8 = one 8-bit UNSIGNED sample per byte (centre 0x80)
                DIG4 = TWO 4-bit UNSIGNED samples per byte, LOW nibble first (centre 8)
```

### 2.1a The length word, and why the tag name is literal

**The length word (offset 4).** Across DQK's 13 `DIG4` members and 46 Amiga `DIG8` members
from four titles, the `u16be` at offset 4 equals `member.length - 6` — or `- 7` where an odd
payload is padded up to an even member length — in **59 of 59** members. Null: **0 of 2483**
arbitrary `u16be` windows elsewhere in the same members land in `{L-6, L-7}`. That is an
identity, not a coincidence.

**The codec.** Envelope correlation against the already-verified `SFXDQ.VOC` bank — the
discriminator §2.2 below leans on — **cannot decide this question**. It is scale- and
length-normalised, and scores 0.684 for the 8-bit reading against 0.680 for the 4-bit one,
i.e. nothing. The measurement that does discriminate is **lag-1 autocorrelation**: real audio
is smooth sample to sample, whereas reading nibble-packed data as whole bytes interleaves two
independent streams and destroys that continuity.

| reading | mean lag-1 autocorrelation |
| --- | --- |
| `SFXDQ.VOC` (positive control, independently verified) | **0.742** |
| DOS `DIG4` read as 4-bit, low nibble first | **0.754** |
| DOS `DIG4` read as 8-bit (what we shipped until now) | 0.434 |
| DOS `DIG4` read as 4-bit, high nibble first | 0.501 |
| Amiga `DIG8` read as 8-bit | **0.515** |
| Amiga `DIG8` read as 4-bit | 0.122 |

The 4-bit reading tracks the control effect by effect, *including where the control is low*
(`sorcery` 0.206 control / 0.283 4-bit / **-0.703** 8-bit; `sling` 0.304 / 0.471 / -0.132) — a
negative lag-1 autocorrelation being the signature of alternating nibbles read as bytes. The
Amiga bank comes out the other way, which is what makes this a **per-tag codec difference**
rather than one global mistake, and means this document's `DIG8` verdict was right all along;
it was DQK's own DOS `DIG4` bank that was being mis-decoded, by the file it lent its decoder to.

Sample counts corroborate independently: at 4 bits per sample, DQK's `hit` is 2080 samples
against its VOC twin's 2079, `lightning` 5744 against 5743, `crackle` 964 against 963. At 8
bits every effect would come out about half the length of its VOC counterpart.

Implementation: `packages/engine/src/audio/dig8.ts` (`sniffDig8`, `decodeGlibDig8`) —
reuses `decodeDigMember` from `dig.ts` and `decodeGlib`/`sniffGlib` from `loaders/glib.ts`,
so this file is genuinely small: the hard work (GLIB container parsing) was already done.
`decodeDigMember` now takes a `bits: 4 | 8` parameter — `dig8.ts` passes `8`, `dig.ts` passes
`4` — and honours the header's declared payload length, which drops the alignment pad byte
odd-length members carry (that pad used to be rendered as a final sample).

### 2.2 Verification (not just "it parses")

`packages/engine/test/dig8.test.ts` decodes the real `SOUNDS.GLB` for all 5 titles
(skipped, not failed, if the external Amiga drive isn't attached — same convention as
`test/glib.test.ts`) and asserts, per member:

- `sniffDig8()` recognizes the container.
- Sample rate is one of the 3 values DQK's own already-verified DIG4/VOC bank uses
  (5564 / 7418 / 11127 Hz).
- PCM is **DC-centred** (mean within 0.3 of zero once mapped from unsigned-0x80-centred to
  `[-1, 1)`) — consistent with real 8-bit-unsigned digitized audio, not garbage.
- PCM shows a **real envelope shape**: RMS computed over 8 equal chunks has a non-trivial
  peak (`> 0.05`, i.e. not silence) and — for clips long enough to make the check
  meaningful (≥64 samples) — **varies** across the clip (`max − min > 0`), ruling out a
  flat/constant/single-repeated-byte signal. This is the same discriminator already used to
  verify DQK's own `DIG4` bank against its `SFXDQ.VOC` counterpart.

**These checks all still pass — and all of them passed on the wrong codec too.** DC-centring,
envelope shape and rate-plausibility are satisfied by both the 4-bit and the 8-bit reading of
the same bytes, which is exactly why the mis-decode survived here from 2026-07-21 to
2026-08-21. §2.1a's lag-1 measurement is the discriminating one; `packages/engine/test/dig.test.ts`
now pins it, with the control's score and the losing reading's score both asserted so the test
fails if either the codec or the discriminator regresses.

Result: **all 5 titles pass, all members decode to real-shaped audio.** Ran via
`cd packages/engine && npx vitest run test/dig8.test.ts` — 5/5 green (each title is one
`it()` covering every member in its bank).

A standalone headless-browser probe (Edge via `puppeteer-core`, mirroring
`apps/web/test/e2e.mjs`'s `runGameAudio` pattern; not checked in — a one-off verification
script) drove `window.__gameAudio` for each title end-to-end and confirmed the real wiring
arms with **zero console/page errors**:

```
coab:      platform=Amiga sfxCount=11 musicArmed=false musicReason="No located MUSIC.DAX/GLBR score decode yet ..." map.melee=sfx0 actionCount 0->1
secret:    platform=Amiga sfxCount=11 musicArmed=false musicReason="No located MUSIC.DAX/GLBR score decode yet ..." map.melee=sfx0 actionCount 0->1
gateway:   platform=Amiga sfxCount=11 musicArmed=false musicReason="No located MUSIC.DAX/GLBR score decode yet ..." map.melee=sfx0 actionCount 0->1
treasures: platform=Amiga sfxCount=11 musicArmed=false musicReason="No located MUSIC.DAX/GLBR score decode yet ..." map.melee=sfx0 actionCount 0->1
pools:     platform=Amiga sfxCount=11 musicArmed=false musicReason="No located MUSIC.DAX/GLBR score decode yet ..." map.melee=sfx0 actionCount 0->1
pool:      platform=DOS-EGA sfxCount=0 musicArmed=false musicReason="DOS music (MIDI.DAX): format decoded, note timeline location not yet found" map.melee=hit actionCount 0->1
```

(All 5 GLIB titles carry 11 members each — plausible for a shared-engine-era SFX bank
sized similarly to DQK's own 13-effect `DIG4` set; `pool` correctly falls through to the
honest `SILENT_GAMES` path with `sfxCount=0`.)

### 2.3 What is honestly NOT claimed

- **No per-title SFX naming.** Unlike DQK (`UASOUND.TXT` hackdoc names all 13 effects),
  none of these five titles has a documented `DIG8` index→name mapping. Members are
  exposed as generic `sfx0`, `sfx1`, ... and `gameAudio.ts`'s `glibActionMap()` assigns
  game actions (melee/arrow/cast/fireball/death/door/miss) to them by a **round-robin
  index**, not a verified semantic label. The audio itself is real and verified; which
  specific sample voices which specific action is a best-effort guess, exactly like the
  existing (pre-this-session) stance where DoK reuses CoK's own named 8SVX one-shots.
- **No music for any of the five.** See §3.

---

## 3. The `MUSIC.DAX`/`GLBR` music format — advanced, still open

DoK's `MUSIC.DAX` architecture was already fully mapped in an earlier session
(`docs/midi-dax-format.md` §2: DAX container → block 0 is a shared x86 driver, blocks 1+
are `GLBR`-magic song data with a fully-decoded 32-byte header, a verified ~72.8 Hz timer
tick, and a verified 6-way hardware-backend dispatch table with 1/6 backends identified as
PC speaker). The one open piece was always **the GLBR event body** — what a note/duration
actually looks like inside a song (§2.5 "What is NOT resolved").

This session's new finding (`docs/midi-dax-format.md` §2.6, added 2026-07-21): **Gateway,
Treasures, and Pools of Darkness all ship the identical driver + GLBR container as DoK**,
confirmed by running `tools/mididax_decode.py` against all three real GOG installs — every
`GLBR` header field (the byte-swapped `444` constant, `0xFFFF` loop sentinel, `32`-byte
stride, `12×8,18×8` duration table) is byte-for-byte identical across all 4 titles' every
song block. This means the still-open event-body question is **one format, one blocker,
four titles** — solving it once solves music for DoK, Gateway, Treasures, and Pools of
Darkness simultaneously.

**Why this investigation did not close it:** the task's verification bar requires decoding
to PCM/WAV and confirming an audibly-plausible render before wiring anything into
`gameAudio.ts`. The GLBR loader disassembly reaches through header validation and the
16-entry duration-table load (§2.2 of the format doc) but does not yet reach the actual
per-note event stream — there is nothing safe to render yet without risking a misleading
result (garbage bytes interpreted as notes would still "play something", which is exactly
the kind of invented-sounding output the project ethic forbids). Per `docs/midi-dax-format.md`
§2.5's own recommended next step, closing this needs either continued static disassembly of
the event-reader loop or a DOSBox-X dynamic trace (unavailable this session — the task
explicitly reserved DOSBox-X for another concurrent agent).

**Curse of the Azure Bonds and Secret of the Silver Blades are outside this format's
reach entirely** — confirmed (§1 above) that neither ships a `MUSIC.DAX` at all. Their
music will need a different source investigation if one exists (their box manuals'
platform-support claims were not re-examined here); for now the honest state is "digitized
SFX real and wired, no music source located."

---

## 4. What changed in code

- **`packages/engine/src/audio/dig8.ts`** (new) — the `DIG8` decoder, `sniffDig8`/
  `decodeGlibDig8`, reusing `dig.ts`'s DIG4 codec and `loaders/glib.ts`'s GLIB container.
- **`packages/engine/src/index.ts`** — exports `decodeGlibDig8`/`sniffDig8`/`Dig8File`/
  `Dig8Sound`, and (needed by the same import surface) `decodeGlib`/`sniffGlib`/
  `firstGlibPalette`/`compositeGlibPalette`/`GlibArchive`/`GlibImageMember` from
  `loaders/glib.ts` (previously internal-only to the engine package).
- **`packages/engine/test/dig8.test.ts`** (new) — the 5-title verification suite (§2.2).
- **`apps/web/src/audio/gameAudio.ts`**:
  - `SILENT_GAMES` reduced from 6 titles to 1 (`pool` only).
  - New `GLIB_SFX_GAMES` map (absolute WHDLoad `SOUNDS.GLB` paths for the 5 titles) and
    `glibActionMap()` (the round-robin action mapping, §2.3).
  - `ensureLoaded()` gained a branch: when `GLIB_SFX_GAMES[this.game]` is set, fetch +
    decode the bank, `registerDigitizedSfx('Amiga', clips, <honest reason>)`, and
    `setPlatform('Amiga')` — same shape as DQK's own pre-existing SFX-only wiring.
  - `actionMap()` returns `glibActionMap(this.glibSfxCount)` for these titles.
- **`docs/midi-dax-format.md`** — new §2.6 (the 4-title GLBR-family confirmation) and a
  refreshed status header.
- **`docs/glib-format.md`** — §8 "Open unknowns" updated: `DIG8` moved from unsolved to
  solved, cross-referenced to this doc.

---

## 6. Update (2026-07-21, later same day) — the GLBR event body is now solved

A follow-up investigation, dispatched specifically to close §3's remaining gap, extracted
`MUSIC.DAX` block 0 (the resident driver) from DoK's install and statically disassembled it
to find the per-tick stream-read loop (file offset `0x9bd`) — "the driver IS the spec." The
derived format was cross-validated against **every** real song block in **all 4** titles
(~90 channel streams, ~12,000 event pairs): 100% clean `0xFF` termination, plausible note
range (34-92, peaking at middle C), and low unknown-control-code rate. One DoK channel (422
notes, ~74s) was rendered through the engine's existing OPL2 synth and verified
audibly-plausible (continuous RMS 0.18-0.29, no silent gaps).

Full spec: **`docs/glbr-format.md`** (new). `docs/midi-dax-format.md` §2.5 updated from
"OPEN" to "SOLVED". Implementation: `packages/engine/src/audio/glbr.ts` (decoder +
OPL2-backed renderer), exported via `packages/engine/src/index.ts`, tested by
`packages/engine/test/glbr.test.ts` (9/9 passing, 0 skipped, against all 4 titles' real
files — baseline engine suite stayed at zero regressions: 159 files/1829 tests total, up
from 158/1820). Wired into `apps/web/src/audio/gameAudio.ts`: a new `GLBR_MUSIC_GAMES` map
+ `loadGlbrMusicClip()` helper renders each title's busiest channel to a looping PCM clip
and arms it via `AudioManager.setPcmMusic('DOS-EGA', clip)` — additive to
Gateway/Treasures/Pools of Darkness's already-armed Amiga SFX (§2), and overriding DoK's
own `registerDosUndecoded()` placeholder specifically. A standalone headless-Edge probe
(same pattern as §2.2's) confirmed `window.__gameAudio.musicArmed()` flips `true` on
`DOS-EGA` for all 4 titles with zero console errors; a companion regression probe confirmed
CoK's own (unrelated, still-unsolved `MIDI.DAX`) DOS-EGA placeholder is untouched
(`musicArmed() === false`, same honest reason string as before).

**Still open** (honestly disclosed, not invented): the GLBR **instrument/timbre bank**
format — every sampled song's patch id is a constant `127`, no bank table located, so
playback uses an explicitly-labeled generic placeholder OPL2 voice rather than the games'
real timbre (`docs/glbr-format.md` §5). Curse of the Azure Bonds and Secret of the Silver
Blades still have no music source of any kind (confirmed absence, unchanged from §1/§3).

---

## 7. Verdict table (for the caller-facing summary — current end state)

| title | now plays | stays silent | why |
|---|---|---|---|
| Curse of the Azure Bonds | real Amiga digitized SFX (11 clips) | music | no `MUSIC.DAX`/`SOUND.DAX` exists for this title on DOS at all |
| Secret of the Silver Blades | real Amiga digitized SFX (11 clips) | music | ships `SOUND.DAX` (tone-table, already-documented separate gap) but no `MUSIC.DAX` |
| Gateway to the Savage Frontier | real Amiga digitized SFX (11 clips) **+ real DOS-EGA GLBR music** | — | GLBR event body solved 2026-07-21, §6 |
| Pool of Radiance | — | everything | confirmed zero audio-bearing files on DOS or Amiga — genuine absence |
| Treasures of the Savage Frontier | real Amiga digitized SFX (11 clips) **+ real DOS-EGA GLBR music** | — | GLBR event body solved 2026-07-21, §6 |
| Pools of Darkness | real Amiga digitized SFX (11 clips) **+ real DOS-EGA GLBR music** | — | GLBR event body solved 2026-07-21, §6 |
| Death Knights of Krynn | real Amiga SMUS score + SFX (pre-existing) **+ real DOS-EGA GLBR music (new)** | — | GLBR event body solved 2026-07-21, §6 — DoK's DOS-EGA placeholder is now overridden with real music |
