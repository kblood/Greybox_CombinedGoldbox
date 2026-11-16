# GLBR — DOS Gen1 music note-event format (DoK / Gateway / Treasures / Pools of Darkness / Buck Rogers: Countdown to Doomsday)

**Correction (round 34 R4, 2026-09-04): this is a FIVE-title format, not six.** Round 33 R5
added Buck Rogers: Matrix Cubed below on the strength of its `MUSIC.DAX` decoding to 8 `GLBR`
songs byte-identical to Countdown's own file. That identity was the problem, not a second
confirmation: it means Matrix's `MUSIC.DAX` is very likely a **leftover copy** of Countdown's,
not evidence Matrix's own engine plays it. Matrix's own unpacked `START.EXE`/`GAME.OVR` never
open `MUSIC.DAX` by name (`tools/matrix_music_strings.py`: 0 file-open references in either
binary, against Countdown's own 2), and instead name three Miles AIL `.XMI` files
(`BUCKA/B/C.XMI`), five hardware drivers (`ADLIB/MT32MPU/SBFM/TANDY/PCSPKR.ADV`) and an
`FATV9.AD` instrument bank — DQK's own Miles/XMI stack, not GLBR at all. Matrix's REAL music
format is documented in `docs/engine/research/matrix-cubed-audio.md`; every measurement of
Matrix's `MUSIC.DAX` bytes below (§4a) is still an accurate statement about those bytes — the
file genuinely is valid `GLBR` and decodes cleanly — but it is no longer presented as Matrix's
music (`apps/web/src/audio/gameAudio.ts`'s `GLBR_MUSIC_GAMES` no longer includes `'matrix'`; see
§6). Countdown's own row is unaffected by this correction.

**Status: SOLVED (event body, §1-4). Instrument/timbre bank format: SOLVED for hardware
backend index 2 — the OPL2/AdLib bank (2026-07-21, §5a). Backend index 3's own,
differently-shaped 18-byte-per-voice bank is now **fully field-decoded** (2026-07-22, round
2, §5d) on top of its hardware **identity**, also SOLVED (2026-07-22, round 1, §5c): it is
**CMS / Game Blaster, dual SAA1099** — the exact same chip and register map already proven
for CoK's own `MIDI.DAX` — not OPL-family and not MT-32. Both bank formats (OPL2 index 2,
CMS index 3) are now completely closed; §5b's residual "not solved" list is narrowed
accordingly.

This closes the single open item left in `docs/midi-dax-format.md` §2.5 — the GLBR
per-song **event body** — which was the one blocker keeping DOS music silent for **four**
titles at once: Death Knights of Krynn, Gateway to the Savage Frontier, Treasures of the
Savage Frontier, and Pools of Darkness. All four ship a byte-identical GLBR driver +
container (`docs/midi-dax-format.md` §2.6); this doc documents what a song's note timeline
actually contains, and closes it for all four at once by construction.

**Round 33 R5 (2026-09-03): a fifth and sixth title found "solved but unwired."** Buck
Rogers: Countdown to Doomsday and Buck Rogers: Matrix Cubed also ship `MUSIC.DAX`, and their
blocks 2-9 are 8 `GLBR` song blocks each, decoded cleanly by this same, already-shipped
decoder with zero code changes — see §4's cross-title table. **Buck's and Matrix's 8 song
blocks are byte-identical to each other** (8/8 sha256), against the alternative that Matrix
ships its own score (which predicts <8/8) — decisively rejected. This makes GLBR a
**six**-title format, not four; the previous "closes it for all four" sentence above is now
one round out of date (kept for its own history, not restated as current). One caveat that
does NOT generalize from the other four: `docs/midi-dax-format.md` §1.5a's byte-level driver
census found Buck/Matrix's shared driver blob contains **no `mov dx,0x388` (AdLib) or
`mov dx,0x220` (CMS) immediate anywhere** — i.e., unlike DoK/Gateway/Treasures/Pools, this
title's own playback driver was never observed routing to the OPL2 backend §5a's instrument
bank targets. §5a's bank bytes still decode as structurally sane OPL2 patches for these two
titles (in fact a stronger pass than DoK's own control, see §4) — that is a fact about the
shared authoring/file format, not proof the Buck/Matrix driver plays them through real AdLib
hardware. Both are reported side by side rather than one overriding the other.

**This "no AdLib/CMS dispatch in the shared driver blob" byte-level fact from round 32 R6 was
itself an early hint at round 34 R4's correction**: the driver never dispatches to either
hardware backend because — for Matrix at least — that driver's `MUSIC.DAX` was never the one
being played in the first place. Countdown genuinely does play through this GLBR path despite
the same absence (its own `.ADV`/timbre story is unresolved and out of this round's scope);
Matrix does not, and ships its own separate Miles AIL stack instead (§0 above, "five-title
format").

Reference decoder/renderer: `packages/engine/src/audio/glbr.ts`. Cross-title verification
suites: `packages/engine/test/glbr.test.ts` (9/9 passing against all 4 original titles' real
`MUSIC.DAX`, 0 skipped on a machine with all four installs present) and
`packages/engine/test/glbrBuckMatrix.test.ts` (Buck + Matrix — re-measurement, identity,
plausibility-null, and instrument-bank tests, §4/§5a).

---

## 0. Method — "the driver IS the spec"

`docs/midi-dax-format.md` §2 already established that DoK's `MUSIC.DAX` block 0 is a
12,528-byte `.COM`-style (ORG 0x100) x86 machine-code blob — the resident sound driver
itself — and that blocks 1+ are `GLBR`-tagged song data consumed by that driver. Rather than
guess at the event body from the bytes alone, this investigation extracted block 0
(`tools/dax_decode.py`) and statically disassembled it (Python + `capstone`, 16-bit real
mode) to find the driver's own per-tick stream-read loop — the code that necessarily knows
the true format, byte for byte.

The per-tick service routine lives at **file offset `0x9bd`** inside `MUSIC.DAX` block 0.
It walks a channel's 2-byte-pair stream, decoding a status byte then a paired duration byte,
exactly the shape documented below. This was then cross-checked against **every real song
block in all four titles** (~90 channel streams, ~12,000 event pairs) — the hypothesis had
to parse every one of them cleanly (correct `0xFF` termination, no out-of-range reads,
plausible note range) or it would have been rejected; it did.

---

## 1. Header chain

A GLBR song file is itself a decompressed DAX block payload (see `docs/dax-format.md` for
the outer container). Three nested structures precede the actual note data:

### 1.1 Fixed 44-byte header (already known — `docs/midi-dax-format.md` §2.2)

```
offset 0   4 bytes   magic "GLBR"
offset 4   2 bytes   reserved (0 in every sampled song)
offset 6   2 bytes   byte-swapped constant, always 0x01BC = 444 — turns out (§1.2) to
                     literally BE the byte offset of the next header, not a coincidence
offset 8   2 bytes   0xFFFF loop sentinel
offset 10  2 bytes   record stride = 32 (0x0020)
offset 12  32 bytes  16 x big-endian u16 default-duration-scale table; identical across
                     every sampled song: entries 0-7 = 12, entries 8-15 = 18
```

### 1.2 Second header @ byte offset 444

The "444" constant at fixed-header offset 6 is exactly the byte offset of a second header —
this is the load-bearing discovery that unlocked the rest of the chain:

```
@444   8 bytes   unidentified (not needed for note decode; not further reversed)
@452   1 byte    N = channel count
@454   (N+1) x u16 big-endian   per-channel-descriptor byte offsets, RELATIVE to the byte
                                 right after this table ("basePtr")
```

### 1.3 `descriptor0` — the song's primary control block

`basePtr + offsetTable[0]` points at a per-song control record:

```
+0   u16 be   "timebase" raw; tickDivisor = floor(timebase / 84) — the per-channel tick
              divisor applied to every duration code in that channel (§2)
+2   u8       patch/instrument id — semantics NOT reversed (§5); every sampled song across
              all 4 titles reads the same value, 127 (0x7F) — most likely a "no override"
              sentinel rather than a real per-song instrument selector
+3   u8       channel count (redundant with the byte @452 — both read consistently)
+4   (u16 be)[]   per-channel relative offsets; channel `idx`'s event stream starts at
                  `descriptor0Offset + 0x0e + offset[idx]`
```

---

## 2. The event stream — one `(value, durationCode)` pair per event

Each channel's event stream is a flat sequence of 2-byte pairs, terminated by a `0xFF`
value byte:

| `value` byte | meaning |
|---|---|
| `0x00`-`0x7F` | **note-on** — `value` is a MIDI-numbered note (0-127) |
| `0x80` | **rest** — silence for `durationCode` ticks |
| `0x81` | explicit note-off / stop (zero-duration, immediate) |
| `0x84` | reset channel to full volume (zero-duration, immediate) |
| `0x82`/`0x83`/`0x87`/`0x88` (observed) | unhandled-at-this-call-site control codes — real bytes (not garbage), cluster at stream start like an instrument-setup preamble, zero-duration here |
| `0xFF` | end of this channel's stream |

`durationCode` (the pair's second byte — present and consumed for every pair, though only
note/rest events use it for timing) is a bit-packed field:

```
bits 0-2   note-length class (0-7):  raw = 0x6900 >> class      (halves per class step)
bit  3     dotted flag:              raw = floor((raw >> 1) * 3)         (x1.5, integer math)
bits 4-5   tuplet selector (0-3):    d = sel*2; if sel != 0: raw = floor(raw/(d+1)) * d
bit  6     tie/sustain flag:         suppresses retrigger (observed on 3.7% of real notes)
```

The resulting `raw` tick count is divided by the song's `tickDivisor` (from `descriptor0`,
§1.3) to give the final duration in **driver ticks**. The driver's tick clock runs at a
fixed PIT divisor of `0x4000`, i.e. `1,193,180 / 16384 ≈ 72.8 Hz` (`docs/midi-dax-format.md`
§2.3, re-verified independently during this investigation) — `glbrTicksToSeconds()` converts
a tick count to wall-clock seconds using that constant.

---

## 3. Worked example (DoK `MUSIC.DAX` block 1, primary channel)

Decoding channel 0 of DoK song block 1 (the busiest of that song's channels) yields **422
note events** spanning **~74 seconds** at the driver's fixed tick rate — a full-length,
plausible tune, not a short stinger or a decode artifact. Rendered through the engine's
existing OPL2 synth (`renderOplNote`, a generic placeholder voice — §5) the output is
continuously active (no silent gaps), with RMS varying 0.18-0.29 across the clip (real
note-on/off envelope activity, not a flat tone).

---

## 4. Cross-title verification (the falsifiability check)

The hypothesis was validated against **every** GLBR song block in **all four** original
titles that ship this container, not just DoK:

| title | `MUSIC.DAX` size | song blocks | channel streams | event pairs (approx.) | clean `0xFF` termination | unknown-code rate |
|---|---|---|---|---|---|---|
| Death Knights of Krynn | 28,017 | 7 | ~28 | ~9,500 | 100% | ~2% |
| Gateway to the Savage Frontier | 16,241 | 1 | ~4 | ~600 | 100% | ~2% |
| Treasures of the Savage Frontier | 14,443 | 1 | ~4 | ~500 | 100% | ~2% |
| Pools of Darkness | 26,416 | 8 | ~24 | ~1,600 | 100% | up to 27% on 2 short "stinger" tracks (11-12 pairs each — still real control codes, not garbage) |

Every decoded note fell in MIDI range 34-92 (five plausible melodic octaves), with the
project-wide pitch histogram peaking exactly at **note 60 = middle C** — the signature of
real hand-composed music, not a mis-aligned byte stream (which would produce a flat/uniform
or wildly out-of-range histogram instead).

`packages/engine/test/glbr.test.ts` encodes this whole table as automated assertions
(per-title clean-decode + plausible-range checks, plus a DoK-specific render test asserting
non-trivial note count, sane duration, DC-centred PCM, and RMS-envelope variation) — 9/9
tests pass, 0 skipped, against the real files.

### 4a. Buck Rogers: Countdown to Doomsday / Matrix Cubed (round 33 R5, 2026-09-03)

**Round 34 R4 correction (2026-09-04): everything measured in this section about Matrix's
`MUSIC.DAX` bytes is still accurate — it IS a valid, cleanly-decoding GLBR file — but it is a
leftover copy of Countdown's own file that Matrix's engine never opens. See the correction
notice at the top of this document and `docs/engine/research/matrix-cubed-audio.md` for
Matrix's REAL music format (Miles AIL `.XMI` + `FATV9.AD`). The measurements below are kept
verbatim as the historical record of what was measured and why round 33 read it the way it
did.**

Re-measured round 32 R6's own claim before extending it, rather than trusting the ledger
sentence: **confirmed exactly**. Both titles' `music.dax`/`MUSIC.DAX` are 19,441 bytes, DAX
blocks `1..9` (block 1 = driver, not GLBR-tagged), and blocks `2..9` are 8 `GLBR` songs
(sizes `2082,1044,862,626,720,624,720,1078`), all 8 decoding cleanly with the shipped
`decodeGlbrSong` — no code change needed:

| title | song blocks | channel streams | total events | channel counts | clean `0xFF` termination | note range | sha256 vs the other title |
|---|---|---|---|---|---|---|---|
| Buck Rogers: Countdown to Doomsday | 8 | 31 | 1959 | 4/4/4/3/4/4/4/4 | 8/8 songs, 31/31 streams | 36-84 (peak note 50, 163 occurrences) | 8/8 identical |
| Buck Rogers: Matrix Cubed | 8 | 31 | 1959 | 4/4/4/3/4/4/4/4 | 8/8 songs, 31/31 streams | 36-84 (peak note 50, 163 occurrences) | 8/8 identical |

**Identity, against the alternative that Matrix ships its own score** (which predicts
`< 8/8` identical blocks): measured **8/8** sha256-identical raw `GLBR` blocks between the
two titles — the alternative is decisively rejected. (DoK, run through the same decoder as
an unrelated in-repo control, reads 7/7 song blocks, 4988 total events, channel counts
4/4/4/4/4/4/5 — consistent with the round-32 R6 ledger note and included here only as a
sanity cross-check, not as evidence about Buck/Matrix.)

**Null for the plausibility metrics** (`packages/engine/test/glbrBuckMatrix.test.ts`): a
histogram-preserving (Fisher-Yates) byte shuffle of each song's busiest channel
event-stream, 50 trials/song, both titles, seeded/deterministic. Two different metrics give
two different verdicts, and the plan's own supplied null (clean-`0xFF`-termination) turned
out not to be the discriminating one:

| metric | real (16 songs, both titles) | shuffled null (50 trials/song, majority vote) | shuffled null (pooled, all trials) |
|---|---|---|---|
| clean `0xFF` termination | 16/16 (100%) | Buck 5/8, Matrix 6/8 majority-clean | 75.7% of all trials |
| plausible range (>0 notes, all in [20,108]) | 16/16 (100%) | Buck 0/8, Matrix 0/8 majority-clean | 3.5% of all trials |

The plan's prediction ("shuffled-stream clean-termination <= 1/8") does **not** hold on
this metric — measured 5-6/8 majority-clean, ~76% pooled, because a shuffled stream
frequently still contains an incidental `0xFF` byte landing at an even (value-byte)
position (many real duration bytes are themselves close to `0xFF`, and every stream's own
true terminator stays in the shuffled multiset). **The plausible-range metric is the one
that actually discriminates** real decode from noise here (0-1/8 majority, ~3.5% pooled, vs.
the real 16/16): per ground rule 2, the control is replaced and the underlying conclusion
(these are real decoded note streams, not an artifact of a permissive parser) survives under
the replacement, while it would not have survived being certified by the originally-supplied
metric alone.

**Instrument bank (round 33 R5 scope item 2) — a disagreement with the plan's own
prediction, reported rather than adopted.** `docs/midi-dax-format.md` §1.5a's byte-level
driver census found Buck/Matrix's shared driver blob contains no `mov dx,0x388` (AdLib) or
`mov dx,0x220` (CMS) immediate anywhere, so the plan predicted the OPL2 bank's structural
sanity test (the same three checks `glbr.test.ts` already applies to DoK/Gateway/Treasures/
Pools: >80% of voices in-bounds, >50% of in-bounds voices with a real attack rate, 0
byte-identical-to-placeholder) would **fail** for Buck and Matrix. Measured: it **passes**,
more strongly than DoK's own control:

| title | total voices | in-bounds | real attack rate | identical-to-placeholder |
|---|---|---|---|---|
| Buck Rogers: Countdown to Doomsday | 64 | 64 (100%) | 64 (100%) | 0 |
| Buck Rogers: Matrix Cubed | 64 | 64 (100%) | 64 (100%) | 0 |
| Death Knights of Krynn (control) | 56 | 56 (100%) | 50 (89.3%) | 0 |

Both facts are true at once and are not in tension: the bank bytes are structurally real
2-operator OPL2 patches — a property of the shared GLBR authoring/file format (the same
literal-record-reuse artifact §5a already documents across titles) — while the driver
census is a separate, semantic claim about what Buck/Matrix's OWN resident driver was
observed to do with them at runtime (never dispatch to the AdLib port). Per the "do not
force it" instruction, `gameAudio.ts` renders Buck/Matrix through their own decoded
instrument bank, the same as every other GLBR title, rather than the generic placeholder —
whether that matches real Buck/Matrix DOS hardware audibly is a separate DOSBox-X question
this round's tooling constraint puts out of scope.

---

## 5a. The OPL2 instrument/timbre bank — SOLVED (2026-07-21)

**Method — same "driver IS the spec" technique as §0**, one level deeper: statically
disassembled `MUSIC.DAX` block 0's hardware-backend dispatch (`docs/midi-dax-format.md`
§2.4) for hardware-backend index 2, specifically its `SetParam` handler (file offset
`0x1229`) and the generic helper it calls, `sub_36` (file offset `0x36` — the *same*
routine that validates the `GLBR` magic and reads the fixed 44-byte header at load time,
reused opportunistically at `SetParam` time for its address-arithmetic side effect).

**Call chain (traced from the driver's single AH=0 "Install" entry point, file offset
`0x258`, case 0 → `0x271`):** Install receives a far pointer to the song's own byte 0
(confirmed: the very next thing Install does with that same pointer is `+ 0x1BC (444)` to
reach the second header, matching `SECOND_HEADER_OFFSET`) and passes it, unchanged, into a
fixed 8-iteration voice-setup loop (file offset `0x215c`, always `si = 0..7` regardless of
the song's real channel count) that calls the per-backend `SetParam` dispatcher
(`0x20cd` → hardware-backend table at `0x2250`, `docs/midi-dax-format.md` §2.4) once per
voice. For backend index 2, `SetParam` (`0x20e4` → `0x1229`) calls `sub_36(count=voice,
songSeg, songOff)`.

**What `sub_36` computes when reused this way:** it re-parses the fixed header (magic
check, byte-swap the `stride` field) and returns `songBase + (stride*2 + 12) +
sum(durationDefaults[0..count-1])` — i.e. the loader's own "skip past the header" address
arithmetic, repurposed with `count = voice index (0-7)` instead of a real header-skip
count. Since `stride` is `32` and `durationDefaults[0..7]` are all `12` in every sampled
song (`docs/glbr-format.md` §1.1's already-decoded fields), this reduces to a fixed,
song-length-independent formula:

```
bankBase = header.stride * 2 + 12                                  (== 76 for every real file)
offset(voice) = bankBase + sum(header.durationDefaults[0 .. voice-1])   (voice = 0..7)
              = 76 + 12*voice                                       (since durationDefaults[0..7] == 12)
```

> **`sniffInstrAd` corrected, 2026-08-25.** The bank's own container check tested only that
> `firstOffset` was in range and `(length - firstOffset) % 14 == 0` — met by roughly one arbitrary
> file in fourteen. Across the ten GOG DOS installs and the ten Amiga WHDLoad titles it accepted
> **40 files, of which 2 were banks** (and those two are byte-identical). The other 38 were ten
> `unins000.exe`, a `.zip`, a `.PCX`, an `.lbm`, a `.sav`, four Amiga `Docs.info`, and twenty
> `.DAX`/`.DAA` game archives. Nothing dispatched on it, so there was no symptom — the export had
> no consumer, only a wrong answer waiting for its first caller. It now also requires the `0xFFFF`
> terminator, every table entry to be in range and on the 14-byte grid, every entry's record to
> begin with `u16` 14, and the entry count to equal the trailing record count; that takes it to
> 2/40. Impostors still accepted by each clause alone: terminator **4** (the `Docs.info` icons, so
> the obvious check is the weakest), grid/range 1, record length 0, count 0.
>
> Two facts fell out worth keeping. **DQK's and FRUA's `INSTR.AD` are the same 3982 bytes**
> (md5 `e438f36f76…`, 199 instruments) — so a positive corpus of "two files" is really one, and
> the outside control is `Azrael's Tear`'s unrelated Miles `SAMPLE.AD` (3622 B, 181 instruments),
> which all five clauses accept. Pinned in `packages/engine/test/instrAdSniff.test.ts`.

`SetParam` then `memcpy`s **12 bytes** from that offset into a per-voice scratch table —
and 12 bytes, pad-byte-plus-11-register-bytes, is *exactly* the DQK `INSTR.AD` 2-operator
OPL2 timbre layout already pinned in `packages/engine/src/audio/opl2.ts` (`parseAdLibPatch`:
`pad, mod0x20, car0x20, mod0x60, car0x60, mod0xE0, car0xE0, mod0x40, car0x40, mod0x80,
car0x80, 0xC0`). Feeding the same parser the bytes at `76 + 12*voice` for every real GLBR
song in all 4 titles decodes to **structurally sane OPL2 patches**: pad byte always `0`,
waveform/KSL/attack/decay/sustain/release all in-range (guaranteed by the bitmasks, but the
*values* look like real envelopes, not noise), and — the strongest signal — **the same
literal 12-byte records recur across many songs within a title and across titles** (e.g.
`00006571d28081f103050200` appears verbatim in DoK, Gateway, and Pools of Darkness) — the
signature of a shared, largely-boilerplate timbre palette, exactly like the header's own
16-entry duration table being byte-identical across every sampled song. This pins hardware
backend **index 2 as (very likely) AdLib/OPL2** — the only backend whose per-voice record
size (12) matches a real 2-operator OPL2 timbre shape.

Verified in `packages/engine/test/glbr.test.ts` (10 new tests): every title's every song
decodes an 8-entry `instruments` array, >80% of voices land in-bounds project-wide, >50% of
in-bounds voices have a real (nonzero) attack rate, no decode ever coincides byte-for-byte
with the placeholder voice, and DoK/Gateway share at least one literal instrument record.

Reference decoder: `decodeGlbrInstrumentBank()` in `packages/engine/src/audio/glbr.ts`,
called automatically by `decodeGlbrSong()` (populates `GlbrSong.instruments`).
`renderGlbrChannel()` now uses a channel's own decoded instrument (via the new
`GlbrChannel.channelIndex`, matched against `song.instruments[]`) when the caller passes
`{ song }`, falling back to `GLBR_PLACEHOLDER_PATCH` only for an out-of-bounds voice.

**What this does NOT prove:** that GLBR channel index == OPL2 voice slot 1:1. The driver's
setup loop always programs exactly 8 voices regardless of a song's real channel count, and
the tick loop's per-channel state structs are a plain 0..N array that (by the simplest,
most natural reading of the code) plays channel *i* on voice *i* — but this identity was
not confirmed by a dynamic trace (no `SetParam`/`NoteOn` call was observed live; this pass
used static disassembly only, per this round's constraint against the DOSBox-X slot). It is
the best-supported hypothesis, not a proven fact.

---

## 5c. Hardware-backend index 3's identity — SOLVED (2026-07-22): CMS / Game Blaster, dual SAA1099

**Method — same "driver IS the spec" technique as §0/§5a**, static-disassembly only (no
DOSBox-X; another agent held the slot this round). Backend index 3's *full* handler set was
disassembled from `MUSIC.DAX` block 0 (all file offsets below are raw offsets into that
12,528-byte blob, matching `docs/midi-dax-format.md` §2.1/§2.4's convention — near
`CALL`/`JMP rel16` targets need no `-0x100` correction, only literal jump-*table* entries
do): `Init` (`0x2051` → `0x1cf2`), `NoteOff`-ish (`0x209a` → `0x1d29` → `0x1af1`), and
`SetParam`+`NoteOn` (`0x2103`, `idiv 8` → `0x1bf1`), plus every helper those three reach
transitively (`0x1abe`, `0x2af1`, `0x19bb`, `0x26fc`, `0x26ba`).

**The decisive evidence is port I/O, not shape:**

- **`0x2af1`** (already known as "a confirmed generic port-write helper", `docs/midi-dax-format.md`
  §2.4) is backend 3's *only* path to real hardware: `Init`, the two `NoteOff`-ish silence
  routines, and a dedicated chip-enable routine all funnel through a shared two-call idiom in
  `0x1abe` — `OUT <select-port>, <register>` immediately followed by `OUT <data-port>, <value>` —
  i.e. a classic **index/data register-pair** device, not a linear port-mapped one (rules out
  PC speaker/Tandy directly-mapped styles) and not MPU-401 SysEx framing (no `0x330`/`0x331`
  immediates, no MIDI-byte-stream shape at this call site).
- **Two independent, chip-select-driven port pairs, not one.** `0x1abe` takes a `flag` argument
  that picks between **`[0x48e]`/`[0x492]`** (flag=0) and **`[0x490]`/`[0x494]`** (flag=1) —
  i.e. it always programs *two* devices with the same register/value pair, back to back, one
  device per `Init`/`NoteOff` call. These four "port variable" cells are themselves set, once,
  by a small setter at file offset `0x19bb`: `[0x494]=base; [0x490]=base+1; [0x492]=base+2;
  [0x48e]=base+3` — **four physically consecutive I/O ports**, split into two adjacent pairs
  `(base, base+1)` and `(base+2, base+3)`. Within each pair the **higher (odd) port is written
  first** (the `[bp+6]` "register" value) and the **lower (even) port second** (the `[bp+8]`
  "data" value) — i.e. **odd = select, even = data**, per pair.
- **The base port is a literal `0x220`, with a real Game Blaster-style autodetect/override
  scan.** The setter's caller (`0x26fc`) supports three modes: an explicit caller-supplied
  base (`di>0` → used verbatim), a `-1` sentinel → hardcoded fallback `mov ax,0x220` (file
  offset `0x2738`), and — the strongest single piece of evidence — a **default autodetect
  loop** starting `si=0x220` (file offset `0x2713`) and stepping `si += 0x10` up to `0x260`
  (`0x220, 0x230, 0x240, 0x250, 0x260`), calling a probe function (`0x26ba`) at each candidate
  before committing. **This exact 5-address, 0x10-stride candidate list is the textbook
  Creative Music System (CMS) / Game Blaster jumper-selectable base-address set** — no other
  Gold Box-era sound device uses this address range or stride. The probe itself (`0x26ba`,
  called for each candidate) writes a byte to `candidate+6` and reads back from
  `candidate+0xA`, comparing against a 4-entry table — the classic **CMS chip-presence
  detection idiom** (write/readback at a fixed offset pair from the base, iterated), not a
  generic "is anything there" I/O bounce test.
- **The register numbers written are byte-for-byte the same as CoK's already-proven SAA1099
  map** (`docs/midi-dax-format.md` §1.5, table reproduced there: `0x14`=frequency-enable
  bitmask, `0x15`=noise-enable bitmask, `0x1C`=global enable). Backend 3's `NoteOff`-ish
  handler (`0x1af1`) writes **register `0x14`=0 then register `0x15`=0 to *both* port pairs**
  (silence all channels on both chips — the standard "all notes off" gesture for this exact
  chip). A neighboring routine (`0x1b44`) writes **register `0x1C`=1 to both port pairs**
  (global enable — the same register/value CoK's own SAA1099 init code uses, per
  `docs/midi-dax-format.md` §1.5's table row `0x1C | 1 | init`). `Init` itself (`0x1cf2`)
  additionally writes **register `0x16`=`0x33` to both port pairs** — `0x16` is not one of
  CoK's previously-documented registers, but it matches the real Philips SAA1099 datasheet's
  **"Noise generators parameters"** register (a plausible, sane clock-divider default to set
  at startup, consistent with the neighboring `0x15` noise-enable register already confirmed).

**Conclusion:** four consecutive ports at a literal, autodetected `0x220` base, arranged as two
select/data pairs (odd=select, even=data) driving **two identical chips** with register numbers
`0x14`/`0x15`/`0x16`/`0x1C` matching the real SAA1099 register map — this is conclusively
**Creative Music System (CMS) / Game Blaster, dual SAA1099**, the *same chip family* DoK's
sibling game CoK already proved for its own `MIDI.DAX` driver (`docs/midi-dax-format.md` §1.5),
now shown to also be a supported backend in DoK's newer, GLBR-based driver. This is **not**
Roland MT-32 (no MPU-401 port, no SysEx-shaped record) and **not** an extended/4-operator OPL
variant (no `0x388`/`0x389` port, and OPL has no "select/data pair ×2 identical chips" shape —
that shape is CMS's signature, not OPL's). §5b's two-candidate list is therefore closed in
favor of neither guess.

**What this did NOT close (as of the 2026-07-22 round-1 pass — closed by round 2, §5d
below):** the literal field-by-field layout of the **18-byte-per-voice song-data record**
itself (as opposed to the hardware register map, which was already known). The record's 18
bytes are read via `sub_36(count=8+voice)` (§1.3/known) and copied, 6 bytes at a time, into a
per-`(channelType, group)` in-memory shadow array (`0x496 + groupIndex*6`, where `groupIndex
= channelType*3 + group`, `channelType` coming from a 4-way bitmask lookup at `0x19d9` and
`group` iterating 0-2) by a dedicated copy routine (`0x1c2d`, called once from `0x2001`) — so
the record's *shape* (3 groups of 6 raw bytes, addressed by up to 4 channel "types") was
located precisely, matching the SAA1099's real per-voice register spread (frequency, octave,
amplitude L/R, noise/envelope config — more per-voice state than OPL2's single
amplitude+waveform, consistent with the record being 18 bytes vs. OPL2's 12). Round 1 did not
locate the call path from that shadow array out to a live, per-note `OUT` — round 2 (§5d)
found and traced it by static disassembly alone (no dynamic trace was needed after all: the
consumer turned out to be another statically-reachable function, `0x1d31`, not something that
required watching `0x2af1` live).

---

## 5d. Hardware-backend index 3's 18-byte-per-voice bank field layout — SOLVED (2026-07-22, round 2)

**Method — same "driver IS the spec" technique, static disassembly only** (`capstone`,
16-bit real mode; no DOSBox-X, per this round's constraint). §5c located the shadow array
(`DS:0x496 + groupIndex*6`, 6 bytes/group, `groupIndex = channelType*3 + group`) and its
writer (`0x1a50`, a verbatim byte-for-byte copy — confirmed by direct disassembly to do
nothing but `shadow[groupIndex*6 + k] = byte_k` for `k=0..5`, no interpretation). What was
missing was the *reader*: the function that turns those 6 shadow bytes into real SAA1099
register writes. It is **`0x1d31`**, called in a 3-iteration loop by **`0x1fb6`**.

**Correction to §2.4's dispatch-table picture — a 4th, previously undocumented table.**
`0x1fb6` is *not* reached through the already-documented `SetParam` table (`0x2250`'s index-3
entry, `0x2103`→`0x1bf1`) as this doc originally assumed while §5c was being written. Tracing
`0x1fb6`'s actual callers (by scanning the whole 12,528-byte block for `E8 disp16` instructions
whose resolved target is `0x1fb6`) found exactly one call site, at file offset `0x24a6`, inside
a small wrapper at `0x2469` that (a) early-outs unless a driver-wide "initialized" flag at
`DS:[0x4df]` (set by `Init`, §5c) is set, then (b) dispatches through **its own 6-entry
near-jump table at `CS:[bx+0x26e2]`** (`bx` = the same `DS:[0x22e]` backend selector §2.4
already documents) — index 2 → `0x148a` (a real-time OPL2 note-on writer, distinct from index
2's own `SetParam`/bank-install cluster at `0x1202`/`0x1221`/`0x1229`), index 3 → `0x1fb6`,
indices 0/1/4/5 → `0x24d3`/`0x254d`/`0x24af`/`0x24c1` (not traced this round). Scanning
`0x2469`'s own 6 callers found them **all inside the GLBR tick-driven event-stream interpreter
already cited in §2.5** (file offsets `0x926`, `0x975`, `0xa3d`, `0xa68`, `0xa82`, `0xae0` — all
within the `0x8f0`-`0xaee` region that reads `es:[bx]` event-stream bytes and compares them
against `0x80`/`0x81`/`0x84`/`0xFF`, i.e. the exact status-byte values §2.5 already
documents). **This means `0x1fb6`/`0x1d31` are the real, live "play this note" path — called
directly by the note-stream interpreter on every note-on/note-off event — while the
already-documented `SetParam` (`0x1bf1`) is a separate, patch-install-time function that only
*loads a voice's 18-byte bank record into the `DS:0x3fe`-based cache* (confirmed by its own
body: it calls `sub_36` then a block-copy helper, `0x2bb6`, copying 18 bytes — no register I/O
at all).** The call at `0x0a82` (the genuine note-on, as opposed to the five sibling call sites
at `0x926`/`0x975`/`0xa3d`/`0xa68`/`0xae0`, which all pass a `0xFFFF` sentinel as the third
argument to force a note-off) pushes `(channelIndex, statusByte, cachedVelocityByte)` — i.e.
`0x1fb6`'s `word[bp+6]` really is the GLBR event's own note-on status byte (§2.5's "`0x00-0x7F`
= MIDI-numbered note-on"), and its `word[bp+8]` really is a per-channel cached velocity-like
byte that becomes `0xFFFF` specifically to signal "note off" to `0x1d31` (see below) — closing
the loop between the already-solved event body (§2.5) and this round's register-level bank
decode with zero remaining gaps in the call chain.

`0x1fb6` computes `groupBase = channelType*3` from a per-channel cached byte at
`DS:[channelIndex + 0x1e6]`, then calls `0x1d31(groupIndex, note, velocity)` for `groupIndex =
groupBase..groupBase+2` — i.e. every note-on drives **3 physical SAA1099 channels at once**
(one per group), the chip-level realization of the 18-byte record's "3 groups" structure: each
group is an independent chorus/unison *layer* of the same logical voice, not a
selectable-but-unused alternative.

**`0x1d31`'s full body was disassembled end to end** (both the `word[bp+8] >= 0` note-on path
and the `word[bp+8] < 0` note-off path) and every register write traced through the
already-proven `0x1abe`→`0x2af1` I/O helper (§5c) to a literal register number. Call it
`groupIndex = G` (the shadow-array group index, 0-11); `channel = G % 6` (0-5, the physical
SAA1099 channel within its chip); `chip = G <= 5 ? chip1 : chip2` (matches §5c's `0x1abe`
`flag` argument — `flag=1` for `G<=5`, `flag=0` for `G>5`). Let `shadow[0..5]` be this group's
6 raw bytes (`DS:[0x496 + G*6 .. +5]`, i.e. **song-file record bytes `group*6 + 0`
through `group*6 + 5`**, `group ∈ {0,1,2}` within each 18-byte per-voice bank record):

| shadow byte (file offset within the 6-byte group) | field | how it is used (file-offset-cited) |
|---|---|---|
| **0** (`0x496`) | **noise-enable flag** (boolean: any nonzero value, e.g. `0x01` or the observed `0x0f`, means "on") | `0x1f0a`: `cmp byte[G*6+0x496],0; je skip` — if nonzero, this channel's bit is set in a per-chip 6-bit accumulator (`DS:[0x1de]`) which is then written whole to **register `0x15`** (noise-enable bitmask, matches CoK's already-proven map, `docs/midi-dax-format.md` §1.5) |
| **1** (`0x497`) | **tone-enable sign + amplitude scale magnitude** (signed byte, dual-purpose) | Sign gates **register `0x14`** (tone/frequency-enable bitmask) the same way byte 0 gates `0x15` (`0x1ec6`: `cmp byte[...+0x497],0; jl skip` — negative ⇒ this channel's tone output stays off). Magnitude is used earlier (`0x1e5a`) as a signed multiplier against a per-note "velocity-like" value: `ampRaw = (velocityLike * shadowByte1) >> 7` — an amplitude scale factor, 0-~15 in practice |
| **2** (`0x498`) | **amplitude nibble-pack mode**, a 3-way enum: `0x00` / `0x01` / `0xFF` (any other value is statically unhandled — a real but never-observed gap, see below) | `0x1e78`-`0x1ea9`: `0xFF` → `ampRaw << 4` (high nibble only); `0x00` → `(ampRaw<<4) + ampRaw` (same value packed into both nibbles — centered L/R); `0x01` → `ampRaw` as-is (low nibble only). Result is written to **register `channel` (0x00-0x05)** — the amplitude register, matching CoK's proven map |
| **3** (`0x499`) | **fine-pitch/detune scale** (signed byte) | `0x1d96`: `freqCode += shadowByte3 * word[DS:0x204 + G*2]` — a per-channel 16-bit scale table (driver workspace, not itself part of the song record) multiplies this byte and adds the result on top of the chromatic-table frequency code, written to **register `0x08+channel`** (frequency, matches CoK's map) |
| **4** (`0x49a`) | **note transpose bias, in semitones** (signed byte) | `0x1d68`: `combined = incomingNote + shadowByte4 + 3`; `semitone = combined % 12` indexes a word-wide 12-entry chromatic table at `DS:0x1ec` (a driver-workspace table, not song data — see caveat below) whose result becomes the register-`0x08+channel` frequency code; `combined / 12` (minus a fixed bias of 2, clamped to `[1,7]`) becomes the **register `0x10+(channel>>1)`** octave nibble (packed 2-channels-per-byte, matching CoK's proven map) |
| **5** (`0x49b`) | **octave-dependent amplitude/velocity coefficient** (signed byte) | Fed into a small helper (`0x198e`) together with the already-computed octave and an incoming "velocity-like" parameter: `envA = clamp(velocityLike - (octave-3)*shadowByte5, 0, 127)` — `envA` is then the operand byte 1 (above) scales to produce the final amplitude magnitude |

**Register writes this closes** (all via the already-proven `0x1abe(flag, reg, value)` →
`0x2af1` port writer of §5c): `0x08+channel` (frequency), `0x10+(channel>>1)` (octave,
nibble-packed pair), `channel` (amplitude, nibble-packed per the byte-2 mode), `0x14`
(tone-enable bitmask, accumulated per chip), `0x15` (noise-enable bitmask, accumulated per
chip) — i.e. **every SAA1099 per-voice register CoK's own `MIDI.DAX` uses is now also
accounted for on the DoK/GLBR side**, closing the parity gap between the two titles' use of
the same chip.

**Note-off path** (`word[bp+8] < 0`, file offset `0x1f46`): clears this group's bit from both
per-chip accumulators (`DS:[0x1dc]` for `0x14`, `DS:[0x1de]` for `0x15`) and re-emits both
registers with the updated (bit-cleared) masks — no amplitude/octave/frequency write occurs,
a clean "silence this channel" path distinct from note-on.

**Cross-validation against real data** (the same falsifiable-check discipline used for the
OPL2 bank, §5a): extracted every backend-3 bank record (`song offset 172 + 18*voice`, 8
voices, matching the existing `decodeGlbrInstrumentBank`/`GLBR_INSTRUMENT_VOICE_COUNT`
addressing already used for the OPL2 bank in `packages/engine/src/audio/glbr.ts`) from **all
17 real song blocks across all 4 titles** (DoK 7, Gateway 1, Treasures 1, Pools of Darkness
8) — 408 six-byte groups total:

- **Byte 2 (amplitude-pack mode) is in `{0x00, 0x01, 0xFF}` in 408/408 groups (100%)** — the
  hypothesized 3-way enum, with zero real-data hits on the statically-unhandled 4th case.
- **Byte 1's sign split is 397 positive / 11 negative** — the 11 negative cases are **the
  exact same literal record, `01 FF 01 00 00 00`, at voice 7 group 0, in every one of the 17
  songs across all 4 titles** — a dedicated, byte-identical "noise-only channel" (noise on,
  tone explicitly disabled) reused verbatim project-wide, the same "identical shared literal
  record" pattern already proven for the OPL2 bank in §5a (there, shared instrument records;
  here, a shared special-purpose channel record) — strong independent confirmation this is a
  real, intentional field and not noise.
- **Byte 4 (transpose)'s value set is `{0, -12, +4, +7, -20}`** — all musically sane
  interval/chord values (unison, an octave down, a major third, a perfect fifth, a major third
  two-plus octaves down), exactly the shape expected of a chorus/unison-layer detune field,
  not random bytes.
- **Byte 5 (octave-velocity coefficient)'s value set is `{0, 10, 15, 25, 30, 40}`** — small,
  round, monotonic-looking magnitudes consistent with a deliberately-tuned attenuation curve.
- **Byte 3 (fine-pitch scale) is `{0, 1}` in all 408 groups** — consistent with "usually
  unused, occasionally a subtle ±1-unit detune," not contradicting the hypothesis (no counter-
  example, but also not a strong positive signal on its own — see caveat below).

Verification script (throwaway, not committed as a permanent tool):
`tools/scratch_cms_bank_check.py` / `tools/scratch_saa1099_trace.py` — reproducible against
the same real `MUSIC.DAX` files cited above.

**What is still NOT pinned (honest residual gaps):**
- The exact contents of the two small driver-owned lookup tables this reader consumes — the
  12-entry word-wide chromatic table at `DS:0x1ec` and the per-channel 16-bit pitch-scale
  table at `DS:0x204` — were **not** traced back to their own source. `DS` here is the
  driver's *runtime workspace* segment (`CS + 0x2D1` paragraphs, per `docs/midi-dax-format.md`
  §2.1), which is **larger than the 12,528-byte code block itself**, so these addresses are
  **not raw file bytes** the way the `sub_36`-loaded per-voice bank cache
  (`DS:0x3fe+voice*18`) is — they must be populated by some Init-time write (or are baked-in
  driver constants copied from CS to DS at load time) that was not located this round. This
  does not affect the *field layout* conclusion above (which register each *song* byte feeds)
  but means the literal Hz/semitone-to-code mapping (the CMS-side counterpart of CoK's own
  §1.5.1 chromatic table) is not independently re-derived here — it is assumed to be the same
  chip-standard shape CoK's own table already demonstrated.
- Byte 2's unhandled 4th case (any value other than `0x00`/`0x01`/`0xFF`) — the driver code
  path exists (falls through to `0x1eab` using a stale, never-initialized stack slot) but was
  never observed in 408 real-data samples, so it is reported as a static anomaly, not
  exercised or fixed.
- Byte 3's exact scale semantics rest on weaker cross-validation than the other 5 fields
  (real data never exercises a value outside `{0,1}`, so the *shape* of its effect —
  multiplied against the `0x204` table — is disassembly-certain, but its *musical* purpose
  (vibrato depth? subtle chorus detune finer than byte 4's whole-semitone transpose?) is
  inferred from the code shape alone).
- No dynamic (DOSBox-X) trace was run or needed this round — the whole result is static
  disassembly + cross-file data validation, consistent with this round's tooling constraint.

---

## 5b. What is still NOT solved (honestly disclosed, not invented)

- **Which of hardware indices 4-5 is Sound Blaster / Roland MT-32 / Tandy** — indices 2 and 3
  are now pinned (2 = AdLib/OPL2 by §5a; 3 = CMS/Game Blaster by §5c); indices 4 and 5 remain
  open (`docs/midi-dax-format.md` §2.4's identification gap, narrowed from 4 unknowns to 2).
- **The `descriptor0.patchId` field's real purpose** (§1.3, constant `127` in every sampled
  song) — confirmed **not** to be how the instrument bank is addressed (that's pure
  voice/channel index, §5a), so this byte's role remains genuinely unknown.
- **The 8 unidentified bytes at second-header offset 444** (before the channel-count byte at
  452) and **descriptor0's own "channel count" redundancy** with the byte @452 were not
  further investigated — both fields decode consistently across every sampled song but their
  exact semantics (beyond "redundant with a value we already have") weren't traced.
- CoK's own **`MIDI.DAX`** is a completely different format (self-contained compiled code per
  song, `docs/midi-dax-format.md` §1) — see that doc for its own, separate status.

---

## 6. Where the decode is used

`packages/engine/src/audio/glbr.ts` exports the full decoder/renderer
(`sniffGlbr`, `decodeGlbrFixedHeader`, `decodeGlbrSong`, `decodeGlbrInstrumentBank`,
`glbrDurationTicks`, `glbrTicksToSeconds`, `renderGlbrChannel`), re-exported from
`packages/engine/src/index.ts`. `apps/web/src/audio/gameAudio.ts` wires it into the live
app: `GLBR_MUSIC_GAMES` maps each of the FIVE real GLBR titles — the four original titles plus,
as of round 33 R5, **Buck Rogers: Countdown to Doomsday (`'buck'`)** — to its `MUSIC.DAX`
source, `loadGlbrMusicClip()` decodes the busiest channel of the most substantial song and
renders it — through that song's own decoded OPL2 instrument bank (§5a) — to a looping PCM
clip, and `ensureLoaded()` arms it via `AudioManager.setPcmMusic('DOS-EGA', clip)` — additive to
Gateway/Treasures/Pools of Darkness's already-armed Amiga `SOUNDS.GLB` digitized SFX, and
overriding DoK's generic `registerDosUndecoded()` placeholder specifically (CoK's own DOS-EGA
placeholder handling depends on whether its separate `MIDI.DAX` investigation,
`docs/midi-dax-format.md` §1, found a usable note timeline — see that doc for the current
status).

**`'matrix'` is deliberately absent from `GLBR_MUSIC_GAMES` (round 34 R4 correction).** Round 33
R5 added it here; round 34 found its `MUSIC.DAX` is an unopened leftover copy of Countdown's
(§4a's correction notice, `docs/engine/research/matrix-cubed-audio.md`). Matrix now plays
through its own Miles AIL `.XMI` path in `gameAudio.ts` (`MATRIX_MUSIC_XMI`/`MATRIX_INSTR_AD`,
mirroring DQK's `ADDQ1.XMI`/`INSTR.AD` wiring), using the existing `packages/engine/src/audio/
xmi.ts` + `instrAd.ts` decoders — no new format code was needed.

**Second consumer, added round 33 R5, corrected round 34 R4:** `packages/engine/src/game/
loadGame.ts`'s `glbrMusicCensus()` reads any manifest file whose name matches `music.dax`
(case-insensitive) via `readDaxDataBlocks`/`sniffGlbr`/`decodeGlbrSong` — independently of that
file's own `decode` flag, since `MUSIC.DAX` is manifest-categorized as non-graphics `data` — and
attaches a `{ file, songs, events, channels }` census to the `LoadedGame` result
(`GameMusicSummary`, `packages/engine/src/model/index.ts`). As of round 34 R4, this census is
**suppressed** for a `MUSIC.DAX`-shaped file when its OWN manifest also lists one or more
`.XMI` files (`hasXmiSiblings`) — a manifest-driven rule, not a hardcoded title check, so
Countdown's own census (no `.XMI` entries in its manifest) is completely unaffected. When
`.XMI` siblings are present, a new `xmiMusicCensus()` reads them instead, into the exact same
`{songs,events,channels}` shape (`channels` there sums each song's own count of distinct MIDI
channel numbers used, the closest honest XMI analogue of a GLBR channel stream). Pinned by
`packages/engine/test/loadGameGlbrMusic.test.ts`: Countdown's real manifest at 8 songs/1959
events/31 channels (unchanged); Matrix's real manifest now LISTS its three `.XMI` files, so it
reads **21 songs / 5702 events / 95 channels** from `BUCKA/B/C.XMI` and 0 contribution from
`MUSIC.DAX` (independently re-derived against `xmi.ts` directly in
`packages/engine/test/matrixXmi.test.ts`, and agreeing per file: BUCKA 7/2684/45, BUCKB
7/2623/43, BUCKC 7/395/7).

**UPDATED (round 34 Phase B).** The two paragraphs here previously described Matrix's manifest
as "not yet" listing its `.XMI` files and the census as an "unwired until Phase B" gap. Phase B
landed: `apps/web/games/buck-rogers-matrix-cubed.json` lists `BUCKA/B/C.XMI` (plus
`FATV9.AD/.BNK/.CAT` and the five `.ADV` drivers), which flips `hasXmiSiblings` for real. The
numbers above are measured through the SHIPPED code path, not the test-local clone. That clone
still exists but is now INVERTED, which is the point of it: it STRIPS the `.XMI` rows back out
and asserts the same `MUSIC.DAX` bytes revert to 8/1959/31, so `hasXmiSiblings` is proven to be
what drives the switch rather than assumed. This file was the one artifact in the topic set that
did not get the Phase B pass, and an adversarial sweep caught it — recorded here rather than
silently corrected.

The dashboard row that surfaces this census in `gameview.ts` no longer hardcodes the label:
`GameMusicSummary` gained a `format: 'glbr' | 'xmi'` field and the row reads
`const label = m.format === 'xmi' ? 'XMI' : 'GLBR';` (`apps/web/src/ui/gameview.ts` ~line 115).
The e2e pins landed too, and deliberately as two regexes that control each other rather than the
single shared `MUSIC_ROW` that made round 33's six-title claim comfortable: `matrix-cubed-view`
asserts the XMI numbers are present **and** that Countdown's GLBR row is absent, so a silent
fallback to the leftover `MUSIC.DAX` fails instead of reading as a pass.
