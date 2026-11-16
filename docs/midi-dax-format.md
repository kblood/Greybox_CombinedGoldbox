# MIDI.DAX / MUSIC.DAX Format — DOS-native music (CoK / DoK / Gateway / Treasures / Pools of Darkness)

**Status: PARTIAL overall — CoK `MIDI.DAX` architecture, hardware target and note-encoding
algorithm SOLVED by static disassembly; the exact on-disk location of the per-song note
timeline is the one open sub-question for CoK. DoK `MUSIC.DAX` container + backend-dispatch
architecture SOLVED, and confirmed (2026-07-21, §2.6) to be the IDENTICAL format shipped by
Gateway to the Savage Frontier, Treasures of the Savage Frontier, and Pools of Darkness. The
GLBR per-song event body — the last blocker for all four of those titles — is now SOLVED
too (2026-07-21, §2.5, full write-up `docs/glbr-format.md`); those four titles now have real
decoded, rendered, audibly-verified music. The GLBR instrument/timbre bank is now also
SOLVED for hardware-backend index 2 (the OPL2/AdLib bank, `docs/glbr-format.md` §5a,
2026-07-21) — real per-voice instruments now play instead of the placeholder voice.
**2026-07-22: hardware-backend index 3's identity is also now SOLVED — CMS/Game Blaster,
dual SAA1099, the same chip as CoK's own `MIDI.DAX` (`docs/glbr-format.md` §5c)** — and, in a
same-day follow-up pass, **its 18-byte-per-voice bank's exact per-byte field layout is now
SOLVED too** (`docs/glbr-format.md` §5d): all 6 bytes of each of the record's 3 six-byte
groups are traced by static disassembly to specific SAA1099 registers (`0x08+channel`
frequency, `0x10+channel/2` octave, `channel` amplitude, `0x14`/`0x15` tone/noise-enable
bitmasks) and cross-validated against 408 real record groups across all 4 titles (100% of
byte-2 "amplitude mode" values land in the hypothesized 3-way enum; a byte-identical
"noise-only channel" record recurs verbatim at voice 7 across every one of 17 sampled songs).
This closes the last open item from the CMS-bank side of §5b/§2.5b. **2026-07-22 (2nd CoK
round, unrelated to the backend-3 work above): CoK's `GAME.OVR` is now carved to segment level
(§1.6), but the live `CX`/`ES` handshake value at MIDI.DAX slot 1's entry is still
UNLOCATED** — an 11-round Unicorn real-mode trace reached a genuine, disassembly-confirmed
keyboard input loop in `START.EXE`'s boot-resident code (not the known journal-word
copy-protection, which lives elsewhere) that never advances regardless of scripted keys
fed, blocking the trace before it ever reaches slot 1. No CoK DOS-mode music was wired in
this round.**
**2026-09-03 (round 32 R6): a real DOSBox-X/GameLink dynamic trace was run for the first time
(previous rounds used only static disassembly and headless Unicorn). It identifies WHICH
MIDI.DAX block loads at the real title screen (block 3, AdLib) and disassembles that block's
own slot-1 entry (previously only block 1's was known), but the live `CX`/`ES` segment value
is still UNLOCATED — GameLink's protocol exposes memory and framebuffer/input only, not CPU
registers, so the register write cannot be read from a memory snapshot alone. See §1.7. No CoK
DOS-mode music was wired this round either.**

Covers the DOS-native period-music containers referenced by `docs/dos-inventory.md` and
flagged as a gap in `docs/engine/research/cc-format-coverage.md` (audio row) and
`docs/engine/research/decompile-seg044-sound.md` (SFX command layer — a different file,
already done). This doc is the music-format counterpart. It supersedes the speculative
"0xE9-prefix / PIT-divisor" reading in `docs/engine/research/audio-formats-krynn.md` §1.1
(that guess is wrong — see below for what the bytes actually are).

Reference decoder: `tools/mididax_decode.py`. Verified against real files: `Champions of
Krynn/MIDI.DAX`, `Death Knights of Krynn/MUSIC.DAX` (both GOG DOS releases in this repo).

---

## 0. Method

Both files are standard **DAX containers** (see `docs/dax-format.md` for the container +
RLE, reused verbatim — `tools/dax_decode.py`'s `parse_container`/`rle_decode` decode these
files with zero changes). The interesting part is what's *inside* the decompressed blocks,
which turned out **not to be a passive byte-oriented note format at all**: it is real,
position-independent 8086 machine code, meant to be loaded into a data/code segment and
executed directly by the resident sound driver in `START.EXE`/`GAME.OVR`. This was
recovered by:

1. Decompressing each block (`tools/dax_decode.py` container logic).
2. Noticing every CoK song block starts with six `0xE9 <disp16>` triplets — `0xE9` is the
   x86 opcode for `JMP rel16` — and proving this by computing each jump's absolute target
   (`target = instr_addr + 3 + disp16`, mod 0x10000) and finding the targets form **file-size-
   invariant relationships across every one of the 5 songs** (§1.2). Coincidence is
   statistically excluded — the invariants hold 5/5.
3. Disassembling from those computed targets with `capstone` (16-bit real mode) — this
   *is* callable code (register save/restore, `retf`, hardware port I/O), not data.
4. For DoK, disassembling the driver blob shipped as block 0 of `MUSIC.DAX` (12,528 bytes
   of real x86, prologue `55 8B EC` = `push bp; mov bp,sp`) to recover the GLBR loader and
   the 6-way hardware-backend dispatch table.

Capstone's **linear** disassembly drifts out of alignment whenever it walks over an
embedded data table (it happily decodes garbage bytes as bogus-but-valid instructions).
This bit twice during this investigation (see `tools/mididax_decode.py`'s
`resolve_jmp_table` helper and the walkthrough below) — anywhere this doc cites a jump
target, it was cross-checked by reading the raw bytes at that literal file offset, not by
trusting a linear sweep's address column.

---

## 1. CoK `MIDI.DAX` — SOLVED architecture, hardware target, note encoding

`Champions of Krynn/MIDI.DAX` (7,369 bytes) is the **only** music container CoK ships (no
companion song-data file exists — see the directory listing in `docs/dos-inventory.md`).
DAX container, 5 blocks (ids 1–5, one per song), RLE-decompressed sizes 2045 / 889 / 2151 /
1617 / 1066 bytes.

### 1.1 Each block is a self-contained, position-independent code+data module

Every block starts at offset 0 with **six 3-byte `JMP rel16` instructions** (`0xE9 lo hi`),
i.e. an 18-byte entry-vector table — the same idiom the DoK driver blob later uses for its
own hardware-backend dispatch (§2.4), just applied one level lower (per-song instead of
per-game). `DS=CS` is asserted by every routine that touches this table (`push cs; pop ds`
or equivalent), so the block is entered with `CS` = wherever the resident driver loaded it;
there is no absolute-address relocation to perform for the `JMP rel16` entries themselves
(relative jumps are self-relocating by construction).

### 1.2 Verified cross-song invariants (5/5 blocks, `tools/mididax_decode.py "Champions of Krynn/MIDI.DAX"`)

| block (song) | raw size | slot0 target | slot1 target | slot1−slot0 | slots 2–5 target |
|---|---|---|---|---|---|
| 1 | 2045 | 718 | 745 | **27** | 995 (×4, identical) |
| 2 | 889  | 180 | 207 | **27** | 308 (×4, identical) |
| 3 | 2151 | 859 | 886 | **27** | 995 (×4, identical) |
| 4 | 1617 | 515 | 542 | **27** | 658 (×4, identical) |
| 5 | 1066 | 288 | 315 | **27** | 413 (×4, identical) |

Two facts fall out of this table and are the load-bearing evidence for everything below:

- **Slot 1's entry point is always exactly 27 bytes after slot 0's**, regardless of song
  length — because slot 0 is a fixed-length, boilerplate 27-byte stub (disassembled in
  full below) that is copied byte-for-byte into every song file.
- **Slots 2, 3, 4 and 5 always converge on one shared absolute address** (which differs
  per song, because it sits after that song's own variable-length code/data) — i.e. those
  four vector-table slots are "no melody here" placeholders that all alias the same
  silence/stop routine.

### 1.3 Slot 0 — the AH-dispatch trampoline (byte-identical boilerplate)

Disassembly of slot 0 (block 1, file offset 718, 27 bytes exactly):

```
53          push bx
51          push cx
52          push dx
57          push di
56          push si
1e          push ds
0e          push cs
1f          pop ds        ; DS = CS (self-referencing data segment)
8b f3       mov si, bx
32 ff       xor bh, bh
8a dc       mov bl, ah    ; bx = zero-extended AH  (AH = caller's opcode)
d0 e3       shl bl, 1     ; bx *= 2  (word-table index)
ff 97 c8 02 call word ptr [bx+0x2C8]   ; call sub_table[AH]
1f          pop ds
5e 5f 5a 59 5b   pop si/di/dx/cx/bx
cb          retf
```

`sub_table` at file offset **0x2C8 (712)** — i.e. immediately *before* slot 0's own code —
is a 3-entry word table. For block 1 it reads `3EE 2E9 3E3`: entry `AH=1` (`0x2E9`=745) is
**slot 1's own entry point**, and entry `AH=2` (`0x3E3`=995) is the **same shared
silence stub** that raw slots 2–5 jump to directly. So slot 0 is a generic
`"call driver_function(AH)"` façade over the same three underlying routines that the raw
vector table also exposes directly — a defensive/compatible API shape, not separate
content.

### 1.4 Slot 1 — install + the note-event interpreter

Slot 1 (file offset 745 in block 1) starts by disabling interrupts, saving/hooking an
interrupt vector via a caller-supplied segment (`CX`, saved to `[0x12]`; the exact
handshake convention the resident driver uses to pass this is not recovered — see §1.6),
then programs the sound hardware and copies a couple of the block's own header tables into
scratch state, before falling into a **tick-driven event interpreter** that is entered
every driver timer tick with the stream cursor persisted in `[0x2B7]`:

```
mov al, es:[si]           ; read one stream byte
inc si
test al, al
js 0x430                  ; high bit set -> new status byte
  ; else: running status - reuse stored event type, un-consume the byte
0x430:
cmp al, 0xFC               ; 0xFC = end/stop sentinel
...
mov ah, al
and ah, 0x0F               ; -> channel number, cached in [0x2BC]
mov ah, al
and ah, 0xF0               ; -> event type (high nibble), cached in [0x2BB]
cmp ah, 0xE0  -> pitch-bend-style 2-data-byte event (sets flags [0x2BE]/[0x2BF])
cmp ah, 0xC0  -> control event (12-voice slot lookup)
cmp ah, 0x90  -> Note On
cmp ah, 0x80  -> Note Off
```

This is **Standard-MIDI-style status-byte framing with running status**: high bit of the
first byte distinguishes a status byte from a data byte; a status byte's high nibble is
the event type and low nibble is the channel; if a byte lacks the high bit, the driver
reuses the last stored event type instead of requiring a fresh status byte each event —
exactly MIDI's running-status optimization. Recognized event types: `0x80` Note-Off,
`0x90` Note-On, `0xC0` a control/instrument-select event, `0xE0` a 2-data-byte event
(pitch-bend-shaped), `0xFC` end-of-stream. A per-tick wait counter at `[0x2BD]` (loaded from
a stream byte, decremented once per tick before the next event is read) is the delta-time
mechanism — i.e. this is a **tick-quantized delta-time model**, not a free-running clock;
the tick rate is set by the resident driver's timer-interrupt reprogramming (not located
inside this file — see §1.6).

### 1.5 Hardware target: dual Philips SAA1099 — "Creative Music System" / Game Blaster

The Note-On handler (traced from the `0x90` branch) programs I/O ports **0x220/0x221**
(chip 1) and **0x222/0x223** (chip 2) — the canonical **CMS/Game Blaster** dual-SAA1099
address/data port pairs (voices 0–5 → chip 1, voices 6–11 → chip 2, giving **12
simultaneous tone channels**, matching every `cmp di,0x0C` / `cmp di,6` loop bound seen
throughout the routine). The register writes are a byte-exact match for the published
SAA1099 register map:

| reg (written via the 0x221/0x223 "select" port) | value (written via the paired 0x220/0x222 "data" port) | disassembly evidence |
|---|---|---|
| `0x1C` (global enable) | `1` | init: `mov al,0x1C→out; dec dx; mov al,1→out` |
| `0x08+channel` (frequency) | the 12-entry chromatic table value (§1.5.1), `bl` | offset 0x666, confirmed |
| `0x10+(channel>>1)` (octave, 2 channels/register) | packed nibble pair, one nibble per channel, low/high selected by `channel&1` | offset 0x666 tail |
| `0x14` (frequency enable, per-channel bitmask) | accumulated `AH` bitmask over 6 channels | offset 0x36d |
| `0x15` (noise enable, per-channel bitmask) | accumulated `CL` bitmask over 6 channels | offset 0x36d |

This was not previously documented anywhere in the repo or in `hackdocs_extracted/`
(hackdocs only covers the later, DQK-era PC-speaker/XMI/`SOUNDS.GLB` formats). CoK (1990)
supporting the Game Blaster/CMS card is also not mentioned by the VGMPF entry the earlier
research doc cited (which only lists Roland/AdLib/PC-speaker) — this is a genuinely new
finding, arrived at purely by disassembling the shipped `MIDI.DAX` bytes.

#### 1.5.1 Note → register value: semitone/octave decomposition

The Note-On handler converts an incoming (MIDI-numbered) note into chip registers as:

```
bl -= 9                    ; align reference note
al, ah = divmod(bl, 12)    ; al = octave, ah = semitone (0-11)
al += per_voice_octave_offset[voice]     ; [di+0x16F], a real per-song table (not zeroed at init)
bl = chromatic_table[ah]   ; 12-entry table at fixed block offset 0x14
bh = al                    ; octave
call set_register(channel=cx, note_code=bl, octave=bh)
```

The **12-entry chromatic table** lives at a fixed block-relative offset, **0x14 (20)**, right
after the vector-table header — this exact offset was read directly out of the disassembled
`mov bl, byte ptr [bx+0x14]` instruction for **block 1**, whose bytes there read (hex):
`03 1F 3A 53 6B 82 97 AC BF D1 E2 F2` — twelve **monotonically increasing** values (deltas
28,27,25,24,23,21,21,19,18,17,16 — a decelerating/log-shaped curve). This is exactly the
shape expected for a per-semitone frequency code on a chip whose frequency register is a
nonlinear ("Fn") code combined with a binary octave divider (which is how the real SAA1099
works) — i.e. block 1's table is a **credible, verified chromatic-scale lookup**, not filler
bytes.

**Caveat — this offset was only independently disassembly-verified for block 1.**
`tools/mididax_decode.py` dumps the same fixed offset for every block, and the other 4
blocks do not uniformly show the same clean shape:

| block | bytes @0x14 (hex) | reading |
|---|---|---|
| 1 | `03 1f 3a 53 6b 82 97 ac bf d1 e2 f2` | 12 bytes, cleanly monotonic — matches the theory |
| 2 | `30 5a 6b 5d 56 70 0c 27 4b 56 57 5a` | 12 bytes, **not** monotonic |
| 3 | `58 01 6c 01 82 01 99 01 b1 01 cb 01` | not monotonic as 12 bytes, but **is** cleanly monotonic (0x0158→0x01cb) read as six 16-bit LE words |
| 4 | `00 00 00 00 fa 03 c0 03 8a 03 58 03` | starts with 4 zero bytes, then a monotonic run if read as 16-bit LE words from offset 0x18 (0x03fa→0x0328→…) |
| 5 | `00 00 00 00 00 53 f0 3f 00 2e 10 1d` | mostly zero, unclear |

Block 3's and block 4's data are each independently consistent with the *same* algorithm if
the table is 16-bit-word-wide there instead of byte-wide (or simply starts a few bytes
later) — i.e. the table's exact width/offset may not be perfectly fixed across every
compiled song, contrary to the simplifying single-offset assumption above. Block 2's data
does not obviously fit either reading. **This is reported, not resolved**: treat the
byte-wide, offset-0x14, block-1 case as the verified exemplar of the algorithm, and the
per-block table layout as something to re-derive by disassembling each block's own slot 1
individually (they are not guaranteed to be byte-identical beyond slot 0) before trusting
its bytes at face value.

### 1.5a 2026-09-03 round-32 R6: the driver census, measured as bytes, corpus-wide

Round 31's row 5 established that CoK's 5 `MIDI.DAX` blocks are 5 disjoint hardware drivers
(the "SOUND TYPE" menu), not 5 songs sharing one architecture — the reading this whole doc
otherwise assumes. `tools/mididax_song_scan.py census` re-measures that claim directly from
bytes (method: linear scan for `mov dx, imm16` [`0xBA lo hi`] followed within 12 bytes by
`out dx,al`/`out dx,ax` [`0xEE`/`0xEF`], and independently every literal `out imm8,al`
[`0xE6 imm8`]) and extends it to every other title shipping a `MIDI.DAX`/`MUSIC.DAX`:

| title | block/backend | ports found (measured) | identity |
|---|---|---|---|
| CoK | block 1 | `mov dx,out`: 0x221, 0x223 | C/MS, dual SAA1099 |
| CoK | block 2 | `mov dx,out`: 0x330, 0x331 | Roland LAPC / MPU-401 |
| CoK | block 3 | `mov dx,out`: 0x388 | AdLib / OPL2 |
| CoK | block 4 | `out imm8`: 0xC0 (+0x01/0x80/0xE6 noise) | Tandy |
| CoK | block 5 | `out imm8`: 0x42, 0x43, 0x61 | PIT + PC speaker |
| DoK/Gateway/Treasures/Pools | driver block 0 | `mov dx,out`: 0x40, 0x42, 0x43, 0x61, 0xC0 (whole-blob scan; byte-identical set across all 4 titles) | PIT (0x40/0x42/0x43), PC speaker (0x61), Tandy (0xC0) all present in ONE shared driver blob — consistent with §2.4's 6-way internal dispatch, not per-file drivers |
| DoK/Gateway/Treasures/Pools | song blocks 1+ | none (0 hits every block, every title) | confirms these are GLBR **data**, not per-hardware code — the architecture split §2 already describes, now measured rather than assumed |
| Buck/Matrix | driver block 1 (byte-identical between the two titles) | `out imm8`: 0x00, 0x01, 0x40, 0x42, 0x43, 0x61, 0x8B, 0xB1, 0xC0, 0xE9 (no `mov dx,out` hits anywhere in the block) | PIT/speaker/Tandy ports present exactly as in DoK; **0x388 (AdLib) and 0x220 (CMS) do not appear anywhere in the block as any `mov dx, imm16` immediate** — confirmed by an exhaustive scan of every `0xBA` occurrence in the block (87 total), none of which decodes to 0x220 or 0x388. This is consistent with, not contradicting, §2.4's finding that those two backends load their base port through an abstraction/variable rather than an immediate next to the call site — the same reason the doc needed multi-hop tracing to identify them there. |

**Alternative hypothesis, measured, not asserted:** "one block per song" (the reading §1's
narrative implicitly used until round 31) predicts the **same** port set recurring across a
title's blocks. The measured cross-block port-set Jaccard overlap is 0.014 for CoK (5 blocks)
and 0.000 for every other title's song blocks vs. their own driver block — i.e. observed
overlap is at the disjoint end, not the ~1.0 the alternative predicts, for every title checked.
Full numbers: `python tools/mididax_song_scan.py census` (stderr).

This closes the "extend the scan to Buck/Matrix/Gateway/Treasures/Pools" half of the ledger's
"MUSIC.DAX uncatalogued" wording for Buck and Matrix at the driver-identity level: both ship the
byte-identical DoK-family driver blob (11,358 bytes; not 12,528/12,540 like DoK/Gateway/
Treasures/Pools — a real, small, previously-uncatalogued size difference this scan surfaces for
free) with the same PIT/speaker/Tandy ports present and the same AdLib/CMS-immediate absence.
Whether Buck/Matrix's driver supports AdLib/CMS backends at all (vs. shipping a reduced backend
set) was not determined — the port-scan alone cannot distinguish "supports it via indirection"
from "doesn't support it," and that is reported as an open question, not resolved either way.

### 1.6 What is NOT resolved

- **Exact on-disk location of the full note timeline.** The region between the vector-table
  header and slot 0 (block-relative offsets 0x14–0x2C7, ~670 bytes) contains a mix of: the
  12-entry chromatic table (real), a 26-byte identity table `00..19` (offsets 18–43,
  purpose unclear — plausibly a default/pass-through note-index map), several short
  `0xFF`-terminated integer runs at offsets ~172–363 that look like arpeggio/instrument
  step-sequences (consistent with the code at file offset 0x785, which walks a per-voice
  `0xFF`-terminated list once per tick while a note sustains), a large mostly-zero span
  (~364–651) that the init code explicitly zero-fills at startup (so it is *not* meaningful
  file content), and a final small structured table (652–711). None of this is obviously
  "hundreds of notes for a multi-minute tune." The code region itself (718 through the very
  last byte of the block, 2044 for block 1) disassembles cleanly start-to-end as more driver
  logic (helper subroutines for frequency-setting, voice-off, instrument-step advance),
  leaving no obvious spare room either. The likely resolution is that the interpreter's
  `ES:SI` stream cursor is **bootstrapped by the resident driver from a location outside this
  DAX block** (the `CX`/`ES` handshake at slot 1's entry, §1.4) rather than being self-
  contained — i.e. `MIDI.DAX` may ship the *player* (code, chromatic table, per-voice
  instrument/arpeggio config) while the *note timeline itself* lives in the resident driver's
  own data segment in `GAME.OVR`/`START.EXE`. This needs one more artifact to close (see
  Next steps).

  **2026-07-21 refinement (static disassembly only, audio round 3 — sharpens but does not
  close this gap):** a fresh full disassembly of block 1's slot 1 entry (file offset 0x2E9)
  pins the handshake more concretely than the summary above:
  - `ES` is set from the caller-supplied `CX` at entry (`push cx; pop es`) — i.e. the resident
    driver passes the external segment as a *register argument*, not a fixed/hardcoded
    segment constant baked into `MIDI.DAX` itself. This confirms the buffer's segment is
    genuinely runtime-assigned by whatever loaded the driver, not discoverable from the DAX
    file's bytes alone.
  - The very first word at `ES:0` is read back and reused as a **self-referential start
    offset** for the stream cursor (i.e. the external buffer begins with a header word
    pointing at its own note-stream start, not the notes themselves at offset 0) — this
    explains why naively scanning from `ES:0` wouldn't find a stream immediately.
  - 24 bytes at `ES:[0x2B..0x42]` are copied into a local per-song table (local offset
    0x163) during slot-1 init — a second, smaller, structured region inside the same
    external buffer beyond the stream-start word, contents not yet decoded.
  - **This still does not locate the buffer in a file.** The natural candidate is
    `Champions of Krynn/GAME.OVR` (269,031 bytes), confirmed by header inspection to start
    with the **`FBOV`** magic (Borland VROOMM standalone overlay pool — see
    `docs/engine/research/krynn-toolchain-forensics.md` §"FBOV Header" and
    `docs/engine/research/dqk-overlay-map.md` for the sibling DQK far-call variant). Checked
    the project's existing FBOV research for a byte-offset segment map that could be used to
    translate "the resident driver's data segment" into a `GAME.OVR` file offset without a
    live trace: **`docs/engine/research/overlay-carve-manifest.md`'s own row for this exact
    file** states plainly that `Champions of Krynn/GAME.OVR` is carved only to the
    whole-pool level (`fbov-pool`/`fbov-pool`, 269023 bytes, one row) with the explicit note
    "**Segment-level split remains pattern-matcher work**" — i.e. the FBOV *header/thunk*
    format is solved (§"FBOV Header (VERIFIED)" in krynn-toolchain-forensics.md), but the
    internal segment-by-segment carve of `GAME.OVR`'s 269 KB body that would be needed to
    say "the note timeline for song block N is at file offset X" has **not** been done
    anywhere in the project yet. Closing this is therefore a two-step problem, not one:
    (a) carve `GAME.OVR` into its Borland link-time sub-segments (nontrivial, unstarted,
    "pattern-matcher work" per the manifest), then (b) within that carve, locate the specific
    data segment the `CX`/`ES` handshake points at for each song — step (b) most likely still
    needs a live value for `CX` at the slot-1 call site, i.e. a dynamic trace, since nothing
    in the static disassembly ties a *specific* segment number to *specific* GAME.OVR bytes.
    Both steps were out of scope for this round (no DOSBox-X access; segment-level FBOV
    carving is its own multi-file undertaking, not a same-round audio task). **Left
    honestly unresolved — no CoK DOS/MIDI.DAX music was wired into `gameAudio.ts`; CoK's
    web music stays on the Amiga SMUS path only, consistent with "UNLOCATED beats
    invention."**
- The precise semantics of the `0xE0`/`0xC0` event handlers' flag bits (`[0x2BE]`/`[0x2BF]`)
  beyond "2-data-byte event, sets a running-status skip mode" were not fully traced.
- The exact SAA1099 "Fn" → Hz formula (needed only for a literal audio render, not for the
  format spec) was not derived from a datasheet; the table above is presented as a *relative*
  monotonic pitch curve, verified structurally, not as absolute Hz values.

**Recommended next step to fully close this:** a DOSBox-X dynamic trace (per the project's
established methodology in `docs/engine/research/decompile-methodology-krynn.md` §"Mitigation"
patterns used for the RNG/DGROUP gaps) — set a breakpoint at the `readEvent` loop (pattern
`26 8A 04 46 84 C0 78` — `mov al,es:[si]; inc si; test al,al; js ...` — searchable in a live
memory dump) and watch `ES:SI` for a few ticks after the resident driver calls slot 1; that
single snapshot would confirm or refute the "external note buffer" hypothesis immediately and,
if confirmed, point at the exact `GAME.OVR` offset holding the real per-song timelines.

**2026-07-22 round — step (a) done (FBOV segment carve), step (b) genuinely blocked (live
`CX` value at the slot-1 call site still not observed):**

Step (a) from the paragraph above — carving `GAME.OVR`'s FBOV pool into individual
Borland overlay segments instead of leaving it as one opaque 269,023-byte blob — is now
**done**. `tools/carve_goldbox_overlays.py` gained `carve_vroomm_segments()`, which reuses
the already RE.5-validated per-title `DESCS` tables in `tools/disasm_cok.py` /
`tools/disasm_dok.py` (35 segments each, `(start_exe_off, fileofs, codesz, jmpcnt)`,
cross-checked against real Borland function prologues) rather than re-deriving the FBOV
descriptor byte layout from scratch (that exact header/fixup/stub geometry is irregular —
verified directly against the known-good descriptor at file offset `0x580` — and is a
separately-flagged unsolved problem, not something this round needed to re-solve).
`docs/engine/research/overlay-carve-manifest.md` now has 35 `fbov-segment` rows for CoK
(covering 257,951 of 269,023 pool bytes, 95.9%) and 35 for DoK, each with its own
file-offset/size/sha256/prologue-count. This turns "the note buffer is somewhere in
GAME.OVR" into "the note buffer is in one of these 35 file-offset spans" — real progress,
independent of step (b).

Step (b) — attempted with a new Unicorn real-mode harness, **`tools/unicorn_cok_midi.py`**
(MZ-loads the real `START.EXE`, backs DOS file I/O with the real retail `GAME.OVR`/
`KRYNN.CFG`, populates a full real-mode IVT so the game's own Borland overlay manager can
run, watches every executed instruction for slot 1's own `FA 51 07` / `cli; push cx; pop
es` signature). Across 11+ runs (up to 1350 distinct scripted keystrokes, several hundred
thousand to tens of millions of emulated instructions), **the signature was never observed
— 0 captures, `CX`/`ES` remain UNLOCATED.** What was found instead, and why this is a real,
reported blocker rather than a "just needs more instructions" issue:

- The boot proceeds correctly through opening `GAME.OVR` and `KRYNN.CFG`, then reaches a
  live interactive loop driven by `INT 16h AH=0` (blocking keyboard read) that consumes
  one scripted key roughly every 117 instructions, forever, regardless of which keys are
  fed (plain Enters, ESC/Enter/Y mixes, typed multi-letter strings) — confirmed via
  `--trace-from`/`--trace-to` full-instruction disassembly, not just log inspection, that
  this is a **real, working** per-character routine (each keystroke is stored to a fixed
  memory cell, then tested for membership in a 256-bit bitmap table via a generic bit-test
  helper subroutine, and the loop only continues past that test if the bit is unset) — not
  dead code or an unhandled-interrupt stall.
- This loop is **not** CoK's known journal-word copy-protection screen
  (`docs/engine/research/cok-copy-protection.md`): that protection is proven to live
  entirely inside `GAME.OVR`, gated on ECL opcode `PROGRAM 0` (`StartGameMenu`) checking
  DS variable `[0x4B57]`, and fires only deep in ECL execution after character
  creation/menu — not from `START.EXE`'s own boot-resident input loop, which is where this
  stall happens. Whatever this screen is (most likely a name-entry field or a
  "type any key to continue" gate with a specific accepted-character filter), it is a
  distinct, earlier gate.
- An attempt to read the bitmap table's contents live (to find exactly which keys the
  filter accepts) hit a second, harder problem: this generic bit-test helper lives inside a
  **dynamically-placed Borland VROOMM overlay segment** — the runtime segment address
  recovered from one run's log (`1a46:0d79`) produced **zero hits** when the identical
  breakpoint was re-armed on a re-run with a different (but still plausible) key script,
  meaning overlay segment placement is execution-order-dependent, not fixed across runs.
  This forecloses "just read the table once and hardcode the accepted keys" as a
  quick fix without re-locating the helper fresh inside *each* run.
- A mouse-driven-UI hypothesis (motivated by `docs/engine/research/goldbox-dosbot-harness`-
  style project notes about mouse-only boots) was considered and rejected for *this specific*
  loop: the blocking read is a genuine `INT 16h AH=0`, which on real hardware can only be
  satisfied by an actual keystroke (or a mouse driver TSR that synthesizes one, which CoK's
  own `GAME.OVR`/`START.EXE` has no evidence of doing) — so implementing `INT 33h` mouse
  presence in the harness would not have unblocked this particular stall, and was not
  pursued further once the blocking-read semantics were confirmed by disassembly.

**Net effect:** the slot-1 call site (and therefore the live `CX`/`ES` value) has still
never been reached by this project's tooling. Static analysis + headless Unicorn emulation
without a visual-feedback loop (no DOSBox-X access this round, per the dispatching task's
own constraint) cannot distinguish "wrong scripted key" from "right key, something else is
wrong" for an opaque per-character bitmap filter living in a per-run-relocated overlay
segment. **Concrete next steps, in order of expected leverage:**
1. A live DOSBox-X GameLink trace with OCR/screenshot capture (once the exclusive-slot
   constraint lifts) to visually identify what this screen actually is and what input it
   wants — this is the one capability this headless harness fundamentally lacks, and it
   would very likely resolve in minutes what static tracing could not in 11 rounds.
2. Failing that, statically disassemble `START.EXE`'s own resident segment (not the
   `GAME.OVR` FBOV pool) around the `KRYNN.CFG`-open / post-file-create code path to find
   this loop's real exit condition without depending on a live, per-run-relocated overlay
   address for the bitmap-table helper.

No CoK DOS-mode music was wired into `packages/engine`/`apps/web` this round — consistent
with "UNLOCATED beats invention," nothing downstream of the unresolved `CX`/`ES` handshake
was touched. `tools/unicorn_cok_midi.py` is committed as reusable infrastructure for
whichever of the two next steps above is attempted next (its IVT-population, blocking-
INT16, and DOS-file-I/O fixes are all real, general-purpose harness improvements, not
CoK-MIDI-specific hacks).

**2026-07-22 round 3 — the input loop is fully cracked (it's CoK's hardware-setup wizard,
not a mystery gate); a real, reproducible unlock input was found; a *new*, more precise
blocker was hit one stage further in, still short of slot 1.** This used only static
disassembly plus `tools/unicorn_cok_midi.py` (no DOSBox-X — that slot stayed reserved for
the parallel track per this round's own constraint).

*Precisely locating the loop.* Re-running the harness with `--trace-from`/`--trace-to`
bracketing the exact instruction count where prior rounds logged the stall (CS:IP =
`1962:031f`, i.e. the byte right after the blocking `int 16h`) gives a full disassembly of
the loop, not just log lines. It resolves to a single, complete, self-contained function:

- `1962:030f` — `ReadKey`: if a buffered char is pending (`[0x8a55]`), returns it;
  otherwise `int 16h AH=0` (the genuine blocking read).
- `11c3:0060`..`11c3:00a3` — the generic **numbered-prompt validator**, called as
  `far_call(lo, hi)` with the valid answer range pushed by the caller (e.g. the Sound Type
  prompt calls it with literal `AL=1; AL=6` pushed — matching "SOUND TYPE: [1]..[6]"
  exactly). Body: call `ReadKey`; bit-test the raw key against a table at *the caller's own
  home segment, offset 0* (`push cs; mov di,0; push di` — a **compile-time-fixed "my own
  unit, offset 0" pointer**, not a runtime-computed one); if that fails, loop back for
  another key; if it passes, subtract `'0'`, build a fresh 32-byte `[lo..hi]` membership
  bitmap on the local stack via a second RTL helper, and bit-test the digit against *that*;
  only if both tests pass does the function return (accept) rather than loop back.
- `1a46:0d79` — the shared Borland RTL "SET OF CHAR / `in [...]`" bit-test primitive
  (`TestBit(farPtr, index)`, generic, called from many places).
- `1a46:0d25` — the shared "set bits `[lo..hi]`" primitive that builds the local
  range-membership bitmap.

*The screen itself, recovered verbatim from `START.EXE`'s own bytes* (file offset
`~0x1e30`, immediately preceding this validator's home segment — this is the classic Gold
Box first-run **hardware setup wizard**, not a name-entry field, and not the journal-word
copy-protection screen, which remains confirmed distinct per the paragraph above):

```
GRAPHICS ADAPTER TYPE:  [1] CGA  [2] EGA  [3] Tandy
SOUND TYPE:  [1] C/MS  [2] Roland LAPC  [3] AdLib  [4] Tandy 1000  [5] PC  [6] Silent
ALTERNATE INPUT TYPE:  [1] JOYSTICK  [2] MOUSE  [3] NEITHER
SAVE PATH TO SAVE DATA (DEFAULT - ...):
```

This closes an open naming question for free: **CoK's own label for the hardware `MIDI.DAX`
targets is literally "SOUND TYPE: [1] C/MS"** (Creative Music System = the dual-SAA1099
Game Blaster card, already proven as `MIDI.DAX`'s hardware target in §1.5) — the in-game UI
and the disassembled driver agree.

*Correction to the previous round's "dynamically-placed overlay segment" theory.* The
generic bit-test helper (`1a46:0d79`) is **not** in a VROOMM overlay at all — `1a46`, like
`1962` and `11c3`, sits *inside the base loaded EXE image* (well below
`loaded_image_end_seg`); no overlay allocation (`INT21 AH=48/4A`) or `GAME.OVR` read ever
targets these segments. The earlier round's "zero hits on a re-run at the same absolute
segment" observation is fully explained instead by **the harness's `--load-seg` (or real
DOS's actual free-memory placement) simply shifting every base-image segment number by a
constant** — the *offset* of the table/helper within the module is what's stable, not the
absolute segment number. This also means the "table" is genuinely reachable without any
per-run VROOMM re-location step, which is why the sweep below was possible at all.

*The gate's real behavior — and why it looked like a "never-satisfiable" filter before.*
The 32-byte table at `[caller's home segment]:0000` is **not** static: pre-boot it holds
inert program text (a byte-for-byte coincidence, since this scratch region is reused); by
the time the loop runs, it has been overwritten with a small runtime-populated bitmap
(observed content this round: only bit 2 of byte 6 set, i.e. exactly the bit `'2'` maps to)
— almost certainly an auto-hardware-detect result computed by boot code that runs before
this wizard. An exhaustive Unicorn sweep of every digit 0-9 plus Enter/ESC/Space as the
*first* keystroke (`tools/unicorn_cok_midi.py` driven programmatically, measuring the
instruction-count gap between successive `INT16/00` reads — a large gap means "accepted,
went off to redraw/advance"; a ~35-instruction gap means "instant reject") found that
**under this harness's specific canned BIOS/DOS hardware-probe answers, digit `'2'` is the
only key that ever satisfies this gate, for every prompt** (Graphics, Sound, Input) — not a
free choice among the printed `[1]..[N]` options. This is a real, reproducible, falsifiable
fact about *this emulated environment's* auto-detected "hardware," not a claim about what a
real DOS box with a real C/MS card would report.

*Feeding the discovered input genuinely unblocks the original stall.* Answering all three
prompts with `'2'` —
```
python tools/unicorn_cok_midi.py --fake-keys "0x0332,0x0332,0x0332,enter*20" --max-instr 3000000
```
— clears the loop that stopped every prior round and runs **~300,000 further instructions**
into new territory, including a legitimate-looking far call into a validly-allocated
segment (`0x4f4a`, well inside the harness's overlay-memory range) — real forward progress
past the previous hard stop.

*A new, different, precisely-characterized blocker was hit one stage further in — still
short of `MIDI.DAX` slot 1.* Segment `0x4f4a`'s memory is never actually populated with real
`GAME.OVR` bytes: instrumenting every `INT21 AH=3F` (read) call for the whole run shows
**zero further reads of `GAME.OVR` (or any file) after instruction 178,511** — the harness
never again touches disk I/O, yet execution jumps into `0x4f4a` around instruction 209,531
and runs for ~300K instructions through unpopulated (zero-filled) memory. This eventually
executes an unhandled `INT 1` (single-step interrupt, never hooked or vectored by the
harness), which — because the harness's default response is a silent no-op rather than a
real IRET-shaped dispatch — falls straight through into the next byte, an `IRET`, which pops
three garbage stack words and vaults execution into a *second* unpopulated segment
(`0x2020`), where Unicorn hits a genuinely invalid opcode and aborts
(`UC_ERR_INSN_INVALID`) at instruction 541,948. Also checked and ruled out: no `INT 25h`/
`INT 26h` (absolute disk read) or any other un-modeled interrupt fires anywhere in the run
either — so this isn't a case of the overlay loader using a BIOS-level disk path the harness
forgot to hook. **This is a harness/overlay-content-loading gap** (whatever real mechanism
populates this later overlay segment — quite possibly a plain memory-to-memory copy from an
earlier small staging read, e.g. the `0x300`-byte read into segment `0x2891` observed at
instruction 178,498, rather than a fresh file read — isn't reproduced by this harness), not
new evidence about the keyboard loop, the hardware wizard, or `MIDI.DAX` itself.

**Net effect:** the original "keyboard loop never advances" blocker from the previous round
is **resolved** (real cause found: CoK's hardware setup wizard; real unlock input found:
`'2'` at every prompt, under this harness's auto-detect results). Slot 1's `CX`/`ES` handshake
is still UNLOCATED — a new, later, and much more specific blocker (overlay segment `0x4f4a`
never populated) sits between here and there. **Concrete next steps, in order of expected
leverage:**
1. Trace exactly which code path is supposed to fill segment `0x4f4a` (and whatever segment
   holds the actual `MIDI.DAX`-loading logic) — start from the `0x300`-byte read into
   `0x2891:0000` at instruction 178,498 and follow what the game does with that buffer next
   (a `rep movsb`/manual copy loop into `0x4f4a` would confirm the "staging buffer then
   in-memory copy" hypothesis and pinpoint exactly what the harness needs to reproduce).
2. Alternatively, a live DOSBox-X GameLink trace (once the exclusive-slot constraint lifts)
   would sidestep this entirely — it would show the real overlay contents at `0x4f4a`
   without needing to reverse-engineer the loader.
3. Once real bytes reach `0x4f4a` (or wherever execution actually needs to go), re-run with
   `--fake-keys "0x0332,0x0332,0x0332,enter*N"` and resume watching for the `FA 51 07` slot-1
   signature — the hardware-wizard blocker that stopped this from ever being tried is now
   provably out of the way.

No CoK DOS-mode music was wired into `packages/engine`/`apps/web` this round either — the
`CX`/`ES` handshake is still not observed, so there is still nothing to safely decode.
The reusable harness now has `--log-file-reads`, `--log-new-segments`, and
`--watch-write-segment SEG`. The latter logs CPU writes that overlap a watched
real-mode 64 KiB segment window. A clean reproduction with

```text
python tools/unicorn_cok_midi.py --fake-keys "0x0332,0x0332,0x0332,enter*20" \
  --max-instr 800000 --log build/cok-midi-4f4a-write-watch.log \
  --log-file-reads --log-new-segments --watch-write-segment 0x4f4a
```

records the two `GAME.OVR` tail reads to `2891:0000` and `28c1:0000`, then
first execution at zero-filled `4f4a:205d`; it records **no CPU write** into
the `4f4a` window beforehand. This narrows the next investigation: identify
the loader behavior omitted by the harness, rather than looking for an
unobserved ordinary memory copy into that segment.

**Correction — 2026-09-26: `4f4a:205d` is a corrupted return target in this
headless harness, not evidence of a missing overlay copy.** A short trace with
the calibrated setup keys (`2,2,2`) shows `1a46:0b7a` executing `RETF 4` at
instruction 209,531, immediately followed by `4f4a:205d`. At the return,
`SS:SP=2491:FFEF` and the two words consumed by `RETF` are `205D:4F4A`.
An exact-address memory-write watch shows the preceding `REP MOVSB` at
`1a46:0b76` writing bytes `5D 20 4A 4F` into physical `0x348FF..0x34902`,
which is the live return frame at `2491:FFEF..FFF2`. Its source is
`1BC6:4A44..4A47`; those bytes spell `"] JO"`, the middle of the setup prompt
`[1] JOYSTICK`. Thus the copy itself overwrites the return address with prompt
text. The zero-filled instructions at `4f4a:205d` are a consequence of that
stack/data corruption. The writer's intended buffer/segment contract and why
this harness reaches the overlapping destination are still unresolved; do
not infer the retail DOS startup path, production `SS`, or an overlay-loader
defect from this run. The earlier “missing overlay content-loading gap” and
the proposed search for a copy into `4f4a` are retracted. Continue the native
effect-7 provenance task through the separate EXEPACK/startup trace documented
in `docs/engine/research/cok-item-removal-native-plan.md`.

### 1.7 2026-09-03 round-32 R6: first real DOSBox-X/GameLink dynamic trace — driver identified, live buffer still UNLOCATED

**Static pass, before the dynamic trace (`tools/mididax_song_scan.py scan`).** Every
64-byte-aligned window of: the 35 `GAME.OVR` VROOMM segments carved by
`carve_goldbox_overlays.carve_vroomm_segments` (1,592 windowed sources total across all sources
below), every DAX block of every `.DAX` in `Champions of Krynn/`, and `START.EXE` (packed —
EXEPACK, per round 31 row 4; R5's unpacker had not landed under `build/` at the time this ran,
so the packed bytes were scanned and are flagged as such in the tool's source labels) was scored
against the readEvent grammar recognizer (`grammar_score`: +20 for a literal
`READEVENT_PATTERN` match, plus a running tally of well-formed vs. malformed MIDI-style
status/data pairs). 45,442 windows scanned. Including `MIDI.DAX` itself, the top-5 land inside
`MIDI.DAX`'s own blocks 2 and 5 (scores 21/21/20/20/19) — expected, since that file contains the
driver's own readEvent **code**, which the recognizer is explicitly built to also catch (see its
docstring). **Excluding `MIDI.DAX`** (the actually-interesting ranking, since that file's role is
already known) the top-5 are: `GAME.OVR:seg[0x26d6b+0x3773]@0x2280` (19), two ties at 18
(`GAME.OVR:seg[0xe19a+0x1e6a]@0x100`, `GAME.OVR:seg[0x3ae3f+0x18f8]@0x9c0`/`@0x1800`), a third 18
(`GAME.OVR:seg[0x3e759+0xbad]@0x1c0`), and `ECL2.DAX:block68@0x300` — **4 of the top 5
non-driver candidates are `GAME.OVR` segments**, matching the round's own prediction. Null: 1,106
shuffled 64-byte windows (byte-value-histogram-preserving shuffle, drawn from the same
MIDI.DAX-excluded source pool) scored mean -1.30, max **14** — the top real candidate (19) and
three others (18, 18, 18) stand clear of that max; the corpus-wide mean (all real windows,
including `MIDI.DAX`) was -6.26, i.e. most real bytes score *below* the shuffled-window mean
(-1.61 including `MIDI.DAX` in the null pool) because most of any binary is not an event stream
at all — the top-of-distribution comparison, not the mean, is what discriminates here.

**Method (dynamic pass).** A scratch copy of `Champions of Krynn/` (`build/r6-cok-scratch/`, git-ignored,
never the repo's own read-only copy) was booted under DOSBox-X 2026.07.02 in GameLink master
mode via `tools/dosbox_x_debugbox_probe.ps1 -RunDirect -GameLink` (focusless; no host-level
SendKeys/SetForegroundWindow/SendInput used anywhere in this pass — every screenshot and memory
read went through `tools/dosbox_gamelink.py`). No other DOSBox-X process was running before or
during this session (`Get-CimInstance Win32_Process` checked immediately before launch, and the
launched PID was stopped by exact PID afterward, never by name). The scratch `KRYNN.CFG` (line 2
= ASCII `A`) was left untouched, i.e. whatever Sound Type the repo's own config already encodes
was used, not chosen by this pass. A `status`/`screenshot` round-trip confirmed the session
(`program: "START"`, 640x400 frame) before every subsequent step, and the reached screen — the
illustrated `Champions of Krynn` splash (`build/r6-dosbox-out/shot1.png`) — is the same title
screen the existing M4 GameLink route reaches at this point in boot. `dump-memory --length
0x100000` captured the full first megabyte to `build/r6-dosbox-out/ram1.bin` (kept, git-ignored,
not committed).

**Driver identified: block 3 (AdLib), not asserted from the config letter — measured from the
dump's own bytes.** Section 1.3's "byte-identical 27-byte boilerplate" claim is corrected here:
23 of the 27 bytes are identical across all five blocks, but the `call word ptr [bx+disp16]`
operand (bytes 19-20 of the stub) encodes each block's own `sub_table` file offset, which
differs per block — measured directly from `Champions of Krynn/MIDI.DAX`: blocks 1-5 read
712 / 174 / 853 / 509 / 282 respectively (`0x2C8 / 0xAE / 0x355 / 0x1FD / 0x11A`). This makes
the 2-byte "variable" region a free, built-in block-identity fingerprint. Searching the RAM
dump for the fixed 18-byte common prefix `53 51 52 57 56 1e 0e 1f 8b f3 32 ff 8a dc d0 e3 ff 97`
found it **twice**, at physical offsets `0x5af1b` and `0x5b78b` (2,160 bytes apart, otherwise
byte-identical) — both carry the `55 03` displacement (0x0355 = 853), which matches **only**
block 3 among the five. **Block 3 (AdLib, port 0x388) is therefore the loaded driver**, agreeing
with the scratch config's stored Sound Type letter `A`. The two identical copies are consistent
with a DOS disk-read staging buffer plus a separately relocated resident copy (not confirmed
further this round — a second, lower-priority open item).

The block's containing memory region starts at physical `0x5abc0` (`stub_offset - 853`), which
divides evenly by 16 (paragraph `0x5ABC`, offset 0) — consistent with a fresh
`INT 21h AH=48h`-style paragraph-aligned allocation, though this was not independently confirmed
this round.

**New disassembly: block 3's own slot-1 entry (previously only block 1's was known).** Reading
forward from the stub (27 bytes) into slot 1 (physical `0x5af36`):

```
fa                cli
89 0e 12 00       mov [0x0012], cx        ; the CX/ES handshake write, section 1.6's hypothesis
06                push es
8e c1             mov es, cx
26 a1 00 00       mov ax, es:[0000]       ; self-referential start word, per section 1.6's
                                          ;   2026-07-21 refinement (there derived from block 1)
a3 40 03          mov [0x0340], ax
a3 42 03          mov [0x0342], ax        ; same word stored twice, 2 bytes apart
33 ff             xor di, di
26 8a 45 22       mov al, es:[di+0x22]    ; loop start (9 iterations, di=0..8)
88 85 d4 02       mov [di+0x02D4], al
47                inc di
83 ff 09          cmp di, 9
75 f2             jnz <loop start>
07                pop es
e8 9a 04          call <hardware-init routine>
...               (9-iteration zero-fill loops at [di+0x02DD]/[di+0x02E6]/[bx+0x032E];
                   AdLib's 9 FM voices are the natural reading of every "9" bound here)
c6 06 46 03 00    mov byte ptr [0x0346], 0
c6 06 50 03 00    mov byte ptr [0x0350], 0
c6 06 49 03 01    mov byte ptr [0x0349], 1
fb c3             sti; ret
```

This is a **second, independent block's** slot-1 code (block 1's was the only one previously
disassembled), and it structurally confirms the CX-to-ES handshake and the ES:[0] self-reference
word using different bytes from a different backend — real corroboration, not a repeat of the
same evidence. It also shows an AdLib-specific detail block 1 (C/MS) does not have: a 9-byte
copy from `ES:[0x22..0x2A]` into local scratch `[0x2D4..0x2DC]`, one byte per loop iteration
(matching OPL2's 9 FM channels), which is the AdLib-backend analogue of the doc's existing
"24 bytes at ES:[0x2B..0x42]" description for block 1.

**Why the live segment value is still UNLOCATED.** `mov [0x0012], cx` writes to a **DS-relative**
address with no segment override, and slot 1's own code (unlike slot 0's) has **no**
`push cs; pop ds` at its head — so `DS = CS` (self-referential addressing) only holds here if the
game always enters slot 1 *through* slot 0's AH-dispatch trampoline (which does set `DS = CS`
before its `call word ptr [bx+0x2C8]`) rather than through the raw vector table's direct jump.
Both call paths exist in the file; which one the resident driver actually uses was not
determined this round. Reading physical `0x5abc0 + 0x12` (the "if DS=CS" hypothesis) returns
`0x0000` — unchanged from the byte's original on-disk value — so this snapshot cannot
distinguish "slot 1 hasn't executed yet" from "DS is not CS here after all." **GameLink's own
protocol record layout is the deeper reason a definitive answer needs more than one memory
snapshot**: `tools/dosbox_gamelink.py`'s offsets cover the header, frame, input and peek/memory
regions only — there is no CPU register record, so CX's live value at the exact
`mov es, cx` instruction cannot be read directly from any GameLink call. Locating the true
`DS` requires either a breakpoint-capable trace (a DOSBox-X debugger session, out of this
round's GameLink-only scope) or finding, in the resident driver's own on-disk code, the far-call
site that invokes this block and reading its `mov cx, <segment>` setup — attempted by searching
for the far-call encoding `9A 00 00 <seg>` using the block's inferred load segment `0x5ABC`, with
no hits, consistent with the segment being loaded from a runtime-populated variable (from a DOS
memory allocation) rather than a static immediate, so it cannot be found by a byte search of the
on-disk executable at all.

**The static grammar recognizer, run directly against the live 1 MB dump (not just on-disk
files), surfaces real but disqualifying false positives.** Scoring every 64-byte-aligned window
of `ram1.bin` with the same `grammar_score` used for the on-disk static pass (§ below) found two
top candidates (score 19, physical `0x29280` and `0x296c0`) that verbatim-matched
`Champions of Krynn/GAME.OVR` at file offsets 67144 and 58010. Hand disassembly of both showed
they are ordinary driver/menu **code**, not a note stream: `c6 06 <addr> 00` is
`mov byte ptr [addr], 0` (a long run of "zero this global" initialization writes), and
`80 3e <addr> <imm8>` is `cmp byte ptr [addr], imm8` (a comparison chain) — both opcodes happen
to alias the MIDI Control-Change status-byte shape (`0xC0`-`0xC6` range) the recognizer accepts,
so a bare grammar-conformance score cannot by itself separate ordinary immediate-operand x86
code from a genuine note stream. This is reported as a real, disqualifying limitation of the
static recognizer, found only by manual disassembly of its own top hits — not a defect that was
fixed this round (fixing it would need either an instruction-boundary check or requiring the
literal `READEVENT_PATTERN` code match rather than the shape-only heuristic, which would then
only ever find the driver's own code, not a data buffer — the same tension the recognizer's
docstring already names).

**The random-window null the prediction assumed (~0/100) does not hold, and the corrected null
is itself the finding.** 100 random 32-byte windows of the RAM dump were checked against every
on-disk CoK file (`GAME.OVR`, every `.DAX`, `START.EXE`): **55/100 matched some on-disk file
span**, not the predicted ~0. Restricting to non-degenerate windows (>= 8 distinct byte values,
excluding runs of a single repeated byte) still gives **17/36 (47%)**. The reason is structural,
not a bug in the check: `GAME.OVR`'s Borland VROOMM overlays and `START.EXE`'s own resident code
are loaded into DOS conventional memory **verbatim** to execute, so a large fraction of any
CoK memory snapshot legitimately **is** a byte-for-byte copy of on-disk file content by
construction — "matches some on-disk file" is therefore a weak, largely uninformative signal on
its own. What makes the block-3 stub identification above meaningful is not "it matched a file"
but that it matched at a **specific, block-discriminating byte pattern** (the 18-byte common
prefix plus a displacement value unique to one of only five candidates) — a much narrower claim
than the raw match-rate null suggests, and the gap between the assumed and measured null is
reported here rather than left standing.

**Net effect.** The driver is identified (block 3, AdLib) and a second block's slot-1 entry is
freshly disassembled, corroborating the CX/ES handshake hypothesis independently of block 1 —
real, new, verified-from-a-live-session ground. The live segment value itself remains UNLOCATED;
GameLink's memory-and-framebuffer-only protocol is the specific reason a single dump cannot
resolve it. **Concrete next step, in order of expected leverage:** (1) a DOSBox-X debugger-console
session set to break on the `mov es,cx` instruction address (physical `0x5af3e`, i.e.
`0x5ABC:0x000B` if the paragraph-aligned load-segment hypothesis holds) to read the live `CX`
register directly — this needs a channel outside GameLink's shared-memory protocol (the
project's `DosboxDebuggerInput` helper), which this round's GameLink-only constraint puts out of
scope; (2) failing that, a second GameLink dump taken deliberately *before* any title-screen
music starts (e.g., immediately after boot, before the splash renders) to check whether `[DS:0x12]`
reads `0x0000` because the install hasn't run yet (this round's snapshot cannot distinguish that
from "DS is not self-referential here").

**Tooling.** `tools/mididax_song_scan.py` (new this round) implements the port-idiom census
(`census` subcommand — see §1.5/§2.4 corrections below) and the readEvent-grammar static scan
(`scan` subcommand, used both for the on-disk pass and, ad hoc, for the RAM-dump pass described
above). `tools/test_mididax_song_scan.py` covers both with a positive control pinned to block 1's
already-known readEvent loop offset (`0x410`) and the CoK 5-block port-set census.

### 1.8 2026-09-03 round-33 R6: corrected static tooling, a live buffer identified (SOUND.DAX, not a song), handshake mechanism resolved

**Two pre-existing bugs fixed before any new measurement.** (1) `cmd_scan`'s null-window sampler
under-sampled to 938/1000 draws when a `continue` on short sources burned an iteration; replaced
with a `while len(null_scores) < shuffle_n` loop, confirmed exactly 1000 draws thereafter. (2) Both
`mididax_song_scan.py`'s source enumeration and the new `mididax_song_locate.py`'s
`unique_across_decoded_sources` built their CoK-`.DAX` file list as
`glob("*.DAX") + glob("*.dax")` — on Windows' case-insensitive filesystem this globs every file
**twice**, silently doubling every DAX source and corrupting round-32's own top-5 with literal
duplicate entries (`MIDI.DAX:block5@0x1c0` listed twice, `block2@0x140` listed twice, crowding out
two genuine distinct candidates). Fixed by deduping on `Path.resolve()` in both files;
`sources_scanned` corrected from 1,592 to **814**, `windows_scanned` from 45,504 to **25,271**.
All 20 tests across `tools/test_mididax_song_scan.py` + `tools/test_mididax_song_locate.py` pass
post-fix.

**Step 1 — unpacked image and its transform.** `build/exepack/cok.bin` regenerated: 65,568 bytes
= `dest_len_paragraphs`(4098) × 16, confirmed. Transform: bytes searched = this unpacked load
image; bytes executed = the same image with 621 relocation words patched at load (loader adds the
program's own load segment into each recorded word). **0 of the 621 relocation targets fall inside
any candidate this round names** (Step 2's corrected top-5, the two `GAME.OVR` controls, Step 3's
self-reference survivors) — every one of them lives in `MIDI.DAX`, `GAME.OVR`, or a live RAM dump,
none of which pass through this table, so the relocation transform is inert for every claim below.
It is **not** inert for one exploratory check (reported honestly as a correction to my own
mid-round assumption): searching `cok.bin` for `mov ax,0x7E8 / mov ds,ax` (the interrupt-handler
DS-reload idiom used to infer a candidate "DGROUP = 0x7E8" earlier this round) finds it at 4 file
offsets (`0x9147/0x917b/0x91b9/0x95e8`), and **all 4 immediate operands are themselves relocation
targets** (`0x9148/0x917c/0x91ba/0x95e9`, all present in `cok.json`'s 621-entry table). `0x7E8` is
therefore a load-module-relative paragraph count, not a live absolute segment — reading `[0x12]`
at physical `0x7E80+0x12` in `ram1.bin` for completeness returns `0x0000`, which is not evidence
of anything (indistinguishable from the on-disk default). **Step 3(b)'s third value (DGROUP) is
therefore NOT obtained**: resolving CoK's true resident load segment needs an independent runtime
landmark (e.g. its PSP) that this round did not pin down; this is reported as a partial miss on
that sub-item rather than silently dropped.

**Step 2 — x86-alias disqualifier, corrected top-5, controls.** Calibrated
`x86_code_verdict(window)` = disassemble linearly (Capstone, 16-bit real mode) and require
coverage ≥ 0.90 **and** instruction count ≥ 6 **and** dominant-mnemonic fraction ≥ 0.50. Coverage
alone (≥0.90) false-flags 43.6% of 2,000 pure-random 64-byte windows; the full three-part test
false-flags **0/2000** random windows and false-disqualifies **0/2000** synthetic true-grammar
streams, while still correctly flagging both known `GAME.OVR` code controls. Corrected top-5
(814 sources, 25,271 windows):

| source | offset | score | code_like | verdict |
|---|---|---|---|---|
| `MIDI.DAX:block5` | 0x1c0 | 21 | False | driver's own readEvent code/tables (§1.2-1.4), not a hidden song |
| `MIDI.DAX:block2` | 0x140 | 20 | False | same |
| `GAME.OVR:seg[0x26d6b+0x3773]` | 0x2280 | 19 | **True** | disqualified — ordinary code |
| `GAME.OVR:seg[0xe19a+0x1e6a]` | 0x100 | 18 | **True** | disqualified — ordinary code |
| `GAME.OVR:seg[0x3ae3f+0x18f8]` | 0x9c0 | 18 | False | passes the disqualifier but is an isolated, non-corroborated window — unresolved low-confidence residual, not claimed as a song |

Null: 1,000 shuffled 64-byte windows (fixed sampler), mean **-1.59**, max **14** — all five real
scores (21/20/19/18/18) clear it. Controls: `GAME.OVR`@67144 score 19 code_like=True; @58010
score 18 code_like=True — both correctly flagged, corroborating the disqualifier.

**Step 3(a) — paragraph self-reference locator (new `tools/mididax_song_locate.py`).**
`self_reference_candidates()`: every 16-byte-aligned `p` where `word[p] == p>>4`. Null: the same
predicate on a byte-shuffled copy of the *same* dump — **0 hits** in all 4 dumps at seed
20260903. Real hits: `ram1.bin`=1 (`0x26040`), `ramA.bin`=1 (same offset, same boot state),
`ramA2.bin`=1 (`0x3a060`), `ramB.bin`=0. Scored past `offset+0x43`: the `ram1`/`ramA` survivor
scores grammar **-24**, `code_like=True` (coverage 0.9688, 25 instructions, dominant-mnemonic
0.56) — disqualified as code. The `ramA2` survivor scores grammar **-2** (below even the null's
own max of 14, let alone the real top-5's 18-21) and `code_like=False` — too low to be a candidate
regardless. **Verdict: no self-reference survivor in any of the 4 captured states clears both the
code-alias disqualifier and the score bar. Genuine negative for this predicate.**

**Step 3(b)/4 — driver-copy base formula, corrected and byte-proven; two live dumps.** The
round-33 plan states the second copy's base as `0x5b78b - 0x1b` = **0x5b770**. Direct byte
comparison against `MIDI.DAX` block 3's own 2,151 on-disk bytes falsifies this: at `0x5b770` only
**52/2151 (2.4%)** bytes match `ram1.bin` — chance-level. The corrected formula
(`stub_offset - (displacement + TABLE_TO_SLOT0_GAP)` = `0x5b78b - (853+6)` = **0x5b430**) matches
**2096/2151 (97.4%)**, and the 55 mismatches are not noise: they land exactly at `[0x12..0x13]`
(the CX/ES handshake cell itself, §1.7) and at `[0x2d4..0x34a]` — the *same* scratch-table range
disassembled in §1.7 as block 3's AdLib 9-voice zero-fill/copy loops. This is independent,
byte-level confirmation both that the corrected formula is right and that slot 1 has actually
executed in this copy. (Copy 1, `0x5abc0`, cross-checked the same way: 2143/2151 = 99.6% match,
8 mismatches all at `[0x0..0x7]`.) `driver_copy_base()` and a dedicated test encode this
discrepancy explicitly (`test_driver_copy_base_second_copy_disagrees_with_the_plans_own_formula`).

Two fresh GameLink dumps (`build/r6-dosbox-out2/`, focusless GameLink only, one DOSBox-X process
at a time, stopped by exact PID): `ramA.bin` (SSI-presents screen) reproduces `ram1.bin` exactly —
same self-reference offset, same two driver copies, same `[0x12]` = **0x5f39** in copy 2.
`ramA2.bin` (static "V1.2 [F1] PLAY [F10] DEMO" prompt) has **no** driver copies resident at all
(0 `SLOT0_PREFIX` matches). `ramB.bin` (demo gameplay) shows the driver **relocated**: copy 1
unchanged at `0x5abc0`/`[0x12]=0x0000`, but copy 2 is now at stub `0x5db2b` → base `0x5d7d0`,
`[0x12]` = **0x6173**. The alternative hypothesis ("ES lives only in registers, no segment word
stored, predicting no such word") is falsified: two independent nonzero values were captured at
the exact cell, differing between snapshots, consistent only with a stored, re-used segment.

**Step 5 verdict: negative for a MIDI.DAX song; positive for the handshake mechanism.** Both live
`[0x12]` segments (`0x5f39`, `0x6173`) decode cleanly under §1.4's grammar (11,090 events, **0**
malformed, clean `0xFC` termination each) — but `unique_across_decoded_sources()` (the plan's own
Step-5 uniqueness bar) finds **both** buffers verbatim inside `Champions of Krynn/SOUND.DAX`
block 1 (the SFX bank), not unique to any undecoded region. Both dynamic captures happened to
catch an SFX-bank install through the same generic slot-1 mechanism, not a music-timeline install.
No candidate from Steps 2 or 3 clears its own disqualifier and score bar either. **The MIDI.DAX
music-timeline buffer location remains genuinely unfound.** What IS newly resolved: the CX/ES
handshake mechanism itself — previously "UNLOCATED" (§1.7) — is now directly observed
(two distinct live values, both differing from the universal on-disk `0x0000` default) and its
target buffer's content is explained (SOUND.DAX), closing that specific open question even though
the song-location question stays open. Per the conditional scope, `tools/mididax_song_extract.py`
and `packages/engine/src/audio/dosSong.ts` are **not** created this round — no qualifying buffer
was found.

**Mutation test.** Flipped `self_reference_candidates`'s `w == (p >> 4)` to `!=`; ran
`test_self_reference_predicate_mutation_target` alone → RED:
`AssertionError: expected 0 self-reference hits in an all-filler image, got 256 -- if this fires,
the '==' predicate was flipped to '!='` (`assert 256 == 0`). Restored `==`; all 20 tests green
again. `git status --porcelain tools/mididax_song_locate.py` shows `?? tools/mididax_song_locate.py`
(new untracked file — no committed baseline to diff, consistent with a clean restore).

**Suggested Phase-B patches (drafted here; files below are not owned by this item):**
- **CLOSED (round 33 Phase B, 2026-09-04).** `docs/midi-dax-format.md` §1.7 had stated the two
  driver-copy stub offsets are "3,184 bytes apart" — nobody had actually subtracted the two
  offsets the same paragraph already prints. `0x5b78b - 0x5af1b` = **2,160 bytes**, not 3,184.
  §1.7's sentence is now corrected to 2,160.
- A one-line status update wherever the project tracks open MIDI.DAX questions (e.g.
  `docs/findings.md` or `docs/engine/HANDOFF.md`): "CoK's CX/ES install handshake mechanism is now
  directly observed (two live values, both = SOUND.DAX SFX-bank buffers); the MIDI.DAX
  music-timeline buffer location is still unfound — negative, not merely unattempted."

**Tooling.** `tools/mididax_song_locate.py` (new) + `tools/test_mididax_song_locate.py` (new, 13
tests) implement Step 3's self-reference scan, corrected driver-copy-base formula, `[0x12]`
handshake reader, §1.4 event decoder, and the Step-5 uniqueness check.

### 1.9 2026-09-04 round-34 R6: `SOUND.DAX` block 1 re-examined as a bank question, not a song-location question — one real directory pointer found; per-block cursor-cell correction

Round 33 (§1.8) asked "is the live buffer a MIDI-timeline song?", got a genuine negative, and
called the buffer "the SFX bank." Round 34's plan re-asked a different question about the exact
same bytes: **is `SOUND.DAX` block 1 a bank holding all sequences (SFX and music alike), addressed
from a directory in its own header?** Full method, bars, nulls and predictions:
`docs/engine/research/cok-sound-bank.md`. Headline findings that revise this file specifically:

**The `grammar_score` static detector (§1.7/§1.8) is void for this question.** Scored against its
own only known positive control — `SOUND.DAX` block 1 decoded from offset 128 — over every
64-byte-aligned window, `grammar_score`'s max is **16**, below its own published "hit" bar of 18
(the corpus top-5 score 18-21) and only just above the shuffled-window null's max of 14. A
detector that scores its positive control below its own hit bar cannot certify a negative; every
static ranking in §1.7/§1.8 stands **for the question it was asked** (disqualifying `GAME.OVR`
code and locating `MIDI.DAX`'s own driver code) but is **void**, not confirmatory, for "is there a
song-shaped stream here."

**Recalibrated scorer (`tools/mididax_bank_index.clean_prefix_events`): stop at the first
malformed byte, credit a literal `0xFC` end as the strongest signal, rather than tallying good vs.
bad events over a fixed window.** Run over the identical 814-source corpus §1.8 fixed the dedup
for: `SOUND.DAX:block1` ranks **#1 of 814** (11,088 events, ends on a literal `0xFC`), a 7.9x
margin over #2 (`TITLE.DAX:block1`, 1,395 events, ends malformed) and >30x the shuffled-source
null's max of 368. It is the *only* one of 814 sources that terminates cleanly at all.

**Header verdict: mostly driver state, with one real, disassembly-confirmed pointer field — not
the many-song directory the plan first floated, and not pure filler either.** The plan's own
proposed null (boundary density vs. ~125 uniform-random offsets) does **not** discriminate on the
coarse "any event boundary" test (real 0.891 vs. null-predicted 0.796 — both near the stream's own
~0.8 baseline density). A stricter test does: "lands on a FRESH status byte, not a running-status
continuation" scores 0.465 for the real header's words vs. a **histogram-preserving shuffle of the
header's own 128 bytes**, run 5,000 times, topping out at 0.44 (p = 0/5000). The mechanism, found
by disassembly rather than inferred from the statistic alone: both block 1 (`MIDI.DAX` offset
0x2f5, `mov ax, es:[0]` then `mov [0x2b7], ax`) and block 3 (identical idiom against `[0x340]`, per
§1.7) seed their persisted tick-cursor **from the buffer's own first word at install time**.
`SOUND.DAX` block 1's own bytes[0:2] LE = **125**, and decoding the §1.4 grammar from offset 125
(not this doc's own previously-used 128) runs the *entire* remainder cleanly with 0 malformed
bytes to the single terminal `0xFC` (11,090 events — 2 more than "128" gave, not a desync: the
3-byte gap between 125 and 128 holds one small extra event). **This is a real, one-entry directory
field, verified from driver code, not merely inferred from statistics.**

**§1.4's `[0x2B7]` cursor cell is block-1-specific, not universal — correcting an implicit
assumption in this doc.** Disassembling each block's own slot 1 finds a distinct
load-then-store cursor idiom per block:

| block | backend | cursor cell | confidence |
| --- | --- | --- | --- |
| 1 | C/MS | `0x2b7` | load + store both confirmed |
| 2 | Roland | `0x7e` | load confirmed; store not found (suspected linear-disassembly drift past an embedded table — not re-derived this round) |
| 3 | AdLib | `0x340` | load + store both confirmed |
| 4 | Tandy | `0x1ee` | load + store both confirmed |
| 5 | PC speaker | `0xe0` | load + store both confirmed |

Block 3 is the one resident in every kept dump (matches the scratch config's Sound Type `A`).
Reading `driver_copy.base + 0x340` (not `+0x2b7`, the wrong cell for this block — `+0x2b7` reads
the on-disk default `0x2b00`, never written in any dump) against the four dumps kept from round 33
(`build/r6-dosbox-out/ram1.bin`, `build/r6-dosbox-out2/ram{A,A2,B}.bin`; no new DOSBox-X session
was launched this round — the static evidence already justified checking these first) gives live
cursor values `0x0b58`/`0x0a16`/`0x05a0` (three captures, two boot phases: "SSI presents" splash
and demo gameplay; the fourth, `ramA2.bin`'s static PLAY/DEMO prompt, has 0 resident driver copies
— no music installed at that specific screen). **All three land inside the same segment.**

**Segment structure: 3 song-like passages, not one undifferentiated blob.** Splitting the full
decode on control-change (`0xC0`) events (the only plausible internal marker, since the stream
carries exactly one `0xFC` total, not one per song) yields three large segments — 4,801 / 1,141 /
5,132 events — each spanning all 5 note channels with near-perfectly balanced Note-On/Off counts
(5,538 of each across the whole stream, exactly equal) and clearing every part of the plan's
song-like bar (≥200 events, ≥3 voices, ≥0.9 balance). The three live cursor reads above all land
inside the **largest** of these (the 4,801-event segment).

**Revised characterization.** `SOUND.DAX` block 1 is best read as **one combined bank** — nine
tiny (≤7-event) fragments consistent with the "SFX bank" framing this doc's §3 already uses,
*plus* at least one, very likely three, long song-shaped passages — entered sequentially from the
header's own verified start pointer, not addressed via a many-entry random-access table. Round
33's negative answered "is this a MIDI-timeline song file distinct from the SFX buffer," which
this round's evidence does not contradict; it answers the different, broader "is there song-shaped
content in this bank at all" question, and that answer is yes.

**Tooling.** `tools/mididax_bank_index.py` (new) + `tools/test_mididax_bank_index.py` (new, 23
tests, one production mutation watched RED — see the research doc) implement the recalibrated
scorer, the header directory test (both nulls), the segmenter, and the cursor reader against kept
dumps. `packages/engine/src/audio/dosSong.ts` + `packages/engine/test/dosSong.test.ts` (new, 11
tests) port the decoder/segmenter to TypeScript, gated on this round's positive finding; **not**
wired into `apps/web/src/audio/gameAudio.ts` (R4's file this round) — see the research doc's
Phase B patch text.

### 1.10 2026-09-05 round-35 R2: the event record is THREE bytes, the third is §1.4's wait counter — every published count restated

**§1.4 predicted a per-tick wait counter at `[0x2BD]` "loaded from a stream byte" but never
located that byte. It is the last byte of every event record.** Rounds 33 and 34 decoded this
stream with one data byte per note event and no timing field
(`NEED_BY_KIND = {0x80:1, 0x90:1, 0xC0:1, 0xE0:2}`), which is where 11,090 events / 14 segments /
5,538 = 5,538 came from. All three numbers are framing artifacts.

**Method — measured, not assumed.** `tools/mididax_event_frame.py` (new) derives each block's
interpreter entry from the block's own bytes (slot-0 stub's `call word ptr [bx+disp16]` operand →
`sub_table` → entry `AH=0`; §1.5a), disassembles it by recursive descent (capstone, 16-bit,
**not** following `call`s — block 1 has a decoy `cmp al, 0x80` + `jne` inside a called subroutine
at `0x7cf`), locates the interpreter's common tail by its own shape
(`mov al, es:[si]; inc si; cmp al, 0; jne …; dec al; mov [cell], al`), and then walks **every**
path from each dispatch branch to that tail counting how far `SI` advances. It also proves no
routine called between a branch entry and the tail moves the cursor behind the walker's back.

**Result — block 1 (C/MS) and block 3 (AdLib), two backends with different address maps, agree
exactly; blocks 4 (Tandy) and 5 (PC speaker) agree too.** Offsets are block-relative, as
everywhere else in §1.

| status | data bytes | wait byte | record after status | block 1 fetches | block 3 fetches |
|---|---|---|---|---|---|
| `0x90` Note-On  | 2 (note, velocity) | 1 | **3** | `0x506` (peek vel), `0x516`, `0x51a` | `0x527` (peek vel), `0x537`, `0x53b` |
| `0x80` Note-Off | 2 (note read, second byte skipped by a bare `inc si`) | 1 | **3** | `0x5da` + `inc si` at `0x5dd`/`0x5de` | `0x5f4` + `inc si` at `0x5f7`/`0x5f8` |
| `0xC0` program  | 1 | 1 | **2** | `0x4d0` | `0x4ef` |
| `0xE0`          | 2 (block 1 skips both unread; block 3 reads them) | 1 | **3** | none (`inc si` ×2 at `0x458`/`0x459`) | `0x468`, `0x46c` |
| unrecognised    | 2 | 1 | **3** | `inc si` ×2 at `0x484`/`0x485` | `inc si` ×2 at `0x4c4`/`0x4c5` |
| `0xFC` end      | 1 flag byte | **0** | **1** | `0x4f0` | `0x511` |

**The third byte, by instruction.** Block 1's tail fetches it at **`0x493`**
(`mov al, es:[si]; inc si`); `0x00` means "read the next event on this same tick"
(`jmp 0x410`), otherwise `dec al` and **`mov byte ptr [0x2BD], al` at `0x4a0`** — the exact cell
the interpreter head tests (`cmp byte ptr [0x2bd], 0` at `0x402`) and decrements (`0x409`) once
per tick. Block 3: fetch `0x4d3`, store **`[0x346]`** at `0x4e0`, head test/decrement at
`0x417`/`0x41e`. So a wait byte `w` delays the next event by `w` ticks. **Its position in the
record is last, after all data bytes, on every branch.** No tick RATE is claimed for CoK here:
72.8 Hz is DoK's measured PIT divisor (§2.3); CoK's own timer reprogramming remains unlocated
(§1.6), so "7,860 ticks" is a tick count, not 108 seconds.

**`0xFC` is a two-byte record, and it has a loop flag.** The handler reads one more byte and
compares it to `0x80`: on a match it reloads `SI` from the second copy of the header start pointer
(`[0x2B9]` / `[0x342]`) and keeps playing; anything else clears the driver-enabled cell and stops.
In `SOUND.DAX` block 1 that flag is **`0x81` at offset 14,063 — the buffer's very last byte**, so
the frame closes the buffer exactly and this bank stops rather than loops.

**Block 2 (Roland MPU-401) is the structural exception, and it corroborates.** It has no
`0x90`/`0x80` branch at all — those bytes are forwarded to the MIDI port — and instead tests
`0xB0` (2 data + wait), `0xD0` (1 + wait) and `0xC0` (1 + wait), i.e. **Standard MIDI's own
data-byte counts plus the same trailing wait byte**, with a width flag (`[0x86]`) set to 2 bytes
for every kind except `0xC0`/`0xD0`. A fifth backend arriving at the same record shape through a
completely different mechanism.

**The restated census of `Champions of Krynn/SOUND.DAX` block 1** (14,064 bytes, header start
pointer 125; `Death Knights of Krynn/SOUND.DAX` is byte-identical, sha256 `7df3bde4…`, so its
dashboard row moves by **file identity, not a second measurement**):

| quantity | rounds 33/34 (1-byte) | round 35 (measured) | why it moved |
|---|---|---|---|
| events (incl. end marker) | 11,091 | **3,700** | data and wait bytes were being decoded as events |
| Note-On / Note-Off | 5,538 / 5,538 | **1,846 / 1,846** | exactly 3× — each real note produced three phantom events |
| `0xC0` events | 14 | **7** | each real record is 1 data byte + 1 wait byte; the 1-byte decoder read the data byte as one event, then re-read the trailing wait byte (always `0x00` here) as a running-status continuation of the same kind — 2 published per real record, 7×2=14 (see §1.10a — the earlier "bit 7 set" reason was wrong) |
| segments (split on `0xC0`) | 14 | **7** | the segmenter inherited that 2× |
| song-like segments | 3 | **3** | unchanged (1,601 / 381 / 1,712 events, 5 voices each) |
| malformed bytes | 0 | **0** | both framings run cleanly to the same `0xFC`; see §1.10a for what this column can and cannot detect |
| total ticks | not measurable | **7,860** | the field did not exist under 1-byte framing |

**§1.9's conclusion is strengthened, not overturned.** Under the real framing the content reads as
music more clearly, not less: 1,846 Note-Ons and 1,846 Note-Offs, every Off closing an **open
same-channel same-pitch** On (1846/1846; a seeded shuffle of the Note-Off pitch column scores
0.524 mean / 0.540 max over 20 trials), pitches 36–96, velocities from a six-value set
{75, 85, 90, 100, 120, 127}, a constant **64** in the Note-Off byte the driver never reads (a MIDI
sequencer's release velocity), and the first records decode as a five-voice program-change
prologue followed by a struck chord held 6 ticks:
`c2 00 00 | c3 03 00 | c4 04 00 | c5 05 00 | 92 48 55 00 | (4f 55 00) | c1 01 00 | 91 48 5a 00 |
93 24 64 00 | 94 30 5a 00 | 95 2b 64 06 | 82 48 40 00 | (4f 40 01)`.

**What is NOT evidence.** "Clean `0xFC` end, 0 malformed bytes" holds under **both** framings —
both land on the same `0xFC` at 14,062 — so §1.8/§1.9's clean-termination result cannot
adjudicate between them and must not be cited as if it could. Likewise the `0xC0` segmenter is
weaker than §1.9 implied: **four** of the seven program changes are consecutive at the head
(status offsets 125/128/131/134, channels 2–5, three bytes apart each, before a single note
sounds). The fifth head-area one (offset 144, channel 1) is not part of that run — see §1.10a.

**Still not claimed.** No playback: the engine renders none of this to audio, and the dashboard
row still says "(decode only)". No CoK tick rate. No semantics for the wait byte beyond what the
`[0x2BD]` store shows (a per-tick countdown), and in particular no claim that it is a
general-purpose delta-time in the SMF sense.

**Tooling.** `tools/mididax_event_frame.py` + `tools/test_mididax_event_frame.py` (11 tests, two
byte-level mutations watched RED). `packages/engine/src/audio/dosSong.ts` and its test (21 tests,
up from 18 after the §1.10a verifier pass) carry the corrected framing. **Superseded numbers:**
`tools/mididax_bank_index.py`'s `clean_prefix_events` (and therefore §1.8/§1.9's "11,088 events,
rank #1 of 814") still uses the 1-byte grammar; its *ranking* claim was not re-measured this round
and its absolute event counts should be read as 1-byte-framed. `docs/engine/research/cok-sound-bank.md`
is round 34's memo and is left as written; `docs/engine/research/cok-sound-bank-framing.md` is this
round's.

### 1.10a 2026-09-05 verifier pass on §1.10 — one wrong reason, one wrong count, one tautological check

An adversarial verifier of §1.10 found three defects. **The 3-byte framing conclusion itself is
not in dispute** — these are defects in the reasons and checks §1.10 shipped alongside it.
Full account: `docs/engine/research/cok-sound-bank-framing.md` §8. Summary:

1. **The `0xC0` row's reason was false.** "Half were data bytes that happened to have bit 7 set"
   does not hold — **0 of 7,391** data bytes in this file's decode have bit 7 set. The real
   mechanism: a real `0xC0` record is 1 data byte + 1 wait byte (2 bytes after status, not 3), so
   the 1-byte decoder's per-record inflation is 2 published events, not 3 — 7 real records × 2 = 14,
   the exact old published count.
2. **"Five... consecutive... before a single note sounds" was contradicted by this section's own
   byte listing.** Only **four** program changes (offsets 125/128/131/134, channels 2–5) are
   truly back-to-back. The fifth (offset 144, channel 1) is preceded by a Note-On pair on channel 2
   at offsets 137/141 (`92 48 55 00` then running-status `4f 55 00`) — those two note bytes appear
   between the `c5 05 00` and `c1 01 00` columns in §1.10's own byte listing above.
3. **`malformed: 0` could not have been anything else.** `decodeCokSoundBank`'s `malformed` counter
   only incremented on a running-status data byte seen before any status byte, and that condition
   can only be true before the very first status byte of the whole decode (the flag that gates it
   is set once and never cleared) — so for any file whose start offset is a status byte, as every
   real file here is, the column was structurally 0, not measured-and-passing 0. Fixed by also
   counting the dangling bytes of a record truncated by the buffer's end (`ran-off-end`) toward
   `malformed`. Mutation evidence: a synthetic truncated buffer now reports `malformed: 3` (was
   untestably 0); truncating the real `SOUND.DAX` block by 5 bytes reports `malformed > 0` where
   the untruncated file reports 0. Pinned in `dosSong.test.ts` (21 tests, up from 18).

---

## 2. DoK `MUSIC.DAX` — SOLVED container + backend dispatch + event body

`Death Knights of Krynn/MUSIC.DAX` (28,017 bytes) is a DAX container with **8 blocks**. DoK
evolved away from CoK's "compile a driver into every song" design: the driver is now
factored into a single shared block, and the songs are plain(er) data files.

| block | raw size | content |
|---|---|---|
| 0 | 12,528 | **x86 machine code** — the shared sound driver (`55 8B EC` prologue) |
| 1–7 | 5098/1268/1086/712/982/858/5116 | `GLBR` magic + song data (7 songs) |

### 2.1 The driver is a `.COM`-style (ORG 100h) code blob

Block 0 begins `55 8B EC 1E 06 8C C8 05 D1 02 8E D8 8E C0 ...` = `push bp; mov bp,sp; push
ds; push es; mov ax,cs; add ax,0x2D1; mov ds,ax; mov es,ax` — i.e. it derives its own data
segment as `CS + 0x2D1` paragraphs, a purely CS-relative computation (no fixed absolute
segment assumption, consistent with being relocated by the DAX loader to any free memory).

One internal jump table (used by the function at file offset 0x2031) encodes its entries as
**absolute offsets biased by +0x100** relative to the file's byte offsets — i.e. this module
was assembled assuming code starts at offset 0x100 within its segment (the classic DOS
`.COM` convention, reserving the first 256 bytes for a PSP-shaped header) even though it is
shipped as a raw DAX block starting at file offset 0. **Near `CALL`/`JMP rel16` targets are
unaffected** (self-relative math cancels the bias), but any literal jump-*table* entry must
have `0x100` subtracted to land on the correct file offset. `tools/mididax_decode.py`
applies and documents this correction.

### 2.2 GLBR song header (validated by disassembling the loader, file offset 0x36)

```
offset 0   4 bytes  magic "GLBR"
offset 4   2 bytes  (always 0 in all 7 DoK songs)
offset 6   2 bytes  big-endian(?) field — byte-swapped by the loader (`call 0x2AE8`,
                     applied right after the magic check) before being compared against
                     a caller-supplied buffer-size argument. Real value 0x01BC = 444 in
                     **every one of the 7 DoK songs**, despite the songs' raw sizes
                     ranging 712–5116 bytes with no correlation to this constant — so
                     this is more likely a fixed format/version constant than a
                     per-song length or duration, despite being fed into a "declared
                     size vs. buffer size" bounds check.
offset 8   2 bytes  0xFFFF sentinel (loop point? "no loop" marker) in all 7 songs
offset 10  2 bytes  record/chunk stride = 0x0020 (32) — matches the loader's 32-byte
                     copy-loop for the section that follows
offset 12  16 x 2 bytes  a duration/scale table, byte-swapped like offset 6; identical
                     across all 7 DoK songs: entries 0–7 = 12, entries 8–15 = 18
                     (defaults, presumably overridden per-channel later in the body)
```

The loader (`sub_36`) validates the 4-byte magic with two word compares (`cmp
word[bp-0x12],0x5242` = "BR", then `cmp word[bp-0x14],0x4C47` = "GL"), rejects with an
internal error code (3 = bad magic, 0x16=22 = buffer too small) via a shared `sub_12E`
error path, then loops reading 16 header words through a byte-swap helper (`call 0x2AE8`)
and 32-byte-stride body chunks through a block-copy helper (`call 0x2BB6`) into a scratch
table at `DS:0x270`.

### 2.3 Timer/tick model — verified

The driver reprograms PIT channel 0 to a **fixed divisor 0x4000 (16384)**, i.e. `1,193,180 /
16384 ≈ 72.8 Hz`:

```
mov dx, 0x43; mov al, 0x36; out dx,al     ; PIT control word: ch0, mode 3, LSB/MSB
mov dx, 0x40; mov al, 0x00; out dx,al     ; divisor low byte
mov dx, 0x40; mov al, 0x40; out dx,al     ; divisor high byte  -> 0x4000
```
and a paired routine restores the default `0x0000` (≈18.2 Hz) divisor on stop — the classic
"install a faster custom tick, restore the BIOS tick on exit" TSR/driver pattern. **DoK's
music/event tick rate is ~72.8 Hz**, a hard, verified number useful for any timing model.

### 2.4 The 6-way hardware-backend dispatch table — verified structure, 1/6 identities confirmed

A device-type selector byte/word at `DS:[0x22E]` (range 0–5, `cmp bx,5; ja error`) indexes
**three parallel 6-entry near-jump tables** (each entry corrected by −0x100 per §2.1,
resolvable with `tools/mididax_decode.py`) that implement `Init`, `NoteOff`-shaped, and
`SetParam`(+`NoteOn`, via an `idiv 8` channel-group split) operations per backend. Indices
2–5's table entries are thin wrappers (`call <real routine>; jmp <shared epilogue>`); the
table below shows both the literal wrapper address and what it calls into:

| index | Init (wrapper → calls) | NoteOff-ish (wrapper → calls) | SetParam (wrapper → calls) | identity |
|---|---|---|---|---|
| 0 | `0x2060` (no-op, `jmp` epilogue) | `0x20a9` (`call 0x2360` only) | `0x214b` (shared w/ 1) | **None / off** |
| 1 | `0x2062` (inline: `in`/`or 0x60`/`out` on port **0x61**) | `0x20ae` (inline: `out` cached byte back to port **0x61**) | `0x214b` (shared w/ 0) | **very likely PC speaker** (only slot besides "None" that is a few inline instructions rather than a whole subroutine cluster, and it pairs a "modify port 0x61" note-on with a "restore port 0x61" note-off — the standard PC-speaker gate on/off shape. The exact bitmask, `OR 0x60`, doesn't match the textbook bit0/1 timer-gate+data pair, so treat as strong-but-not-triple-confirmed) |
| 2 | `0x204c` → `call 0x1202` | `0x2095` → `call 0x1221` | `0x20e4` (does `idiv 8` first) → `call 0x1229` | **AdLib/OPL2** (2026-07-21, `docs/glbr-format.md` §5a — 12-byte-per-voice bank matches the known `INSTR.AD` OPL2 timbre layout byte-for-byte, shared literal instrument records across titles) |
| 3 | `0x2051` → `call 0x1cf2` | `0x209a` → `call 0x1d29` | `0x2103` (`idiv 8`) → `call 0x1bf1` | **CMS / Game Blaster, dual SAA1099** (2026-07-22, `docs/glbr-format.md` §5c — full evidence chain: real port I/O via a generic `0x2AF1` writer reached through `0x1abe`'s select-then-data idiom; 4 consecutive ports at a literal, autodetected base `0x220` with the canonical `0x220/0x230/0x240/0x250/0x260` CMS jumper-scan stride; register numbers `0x14`/`0x15`/`0x1C` byte-identical to CoK's own already-proven SAA1099 map, plus a newly-seen `0x16` matching the real SAA1099 datasheet's "noise generators parameters" register — the *same chip* as CoK's `MIDI.DAX`, not MT-32 and not an OPL variant) |
| 4 | `0x2056` → `call 0x1623` | `0x209f` → `call 0x16d3` | `0x211b` (`idiv 8`) → `call 0x16db` | not identified (0x1623 computes a per-channel stride ×7 register block and zeroes 3 consecutive "registers" via an abstraction call at 0x15c6, which itself bottoms out at the same generic `0x2AF1` port writer backend 3 uses — confirmed real port I/O exists here too, base port/device not yet determined) |
| 5 | `0x205b` → `call 0xbff` | `0x20a4` → `call 0xc3d` | `0x2133` (`idiv 8`) → `call 0xc45` | not identified (0xbff writes fixed "registers" 7/0xD/0xE/0xF = 0xFF/0xAE/0x44/0xF0 at init via an abstraction call at 0xba5) |

A **confirmed generic port-write helper** does exist elsewhere in the driver, at file offset
`0x2AF1` (`mov dx,[arg1]; mov ax,[arg2]; out dx,al`), alongside a generic byte-swap helper at
`0x2AE8` (`xchg al,ah`) — the byte-swap one is what makes the GLBR big-endian-field reading
in §2.2 certain rather than inferred from a coincidence. **2026-07-22: index 3's own
`0x1abe` abstraction call was traced all the way through `0x2AF1` to real, literal port
numbers** (`docs/glbr-format.md` §5c) — it is a two-write "select register at the odd port,
then write data at the even port" idiom, not a hidden/opaque one; `0x33`/`0x16` etc. observed
at these call sites are genuine SAA1099 **register indices**, confirming the earlier
speculation in this paragraph. Index 4's `0x15c6` helper was confirmed (same pass) to also
bottom out at `0x2AF1`, i.e. it performs real port I/O too, though its base port/device
identity was not traced this round. Index 5's `0xba5` abstraction was not re-examined.

**2026-07-22 addendum: a 4th dispatch table exists, separate from Init/NoteOff/SetParam.**
While closing backend 3's 18-byte bank field layout (`docs/glbr-format.md` §5d), tracing
`SetParam`'s own callee `0x1bf1` turned up a surprise: it never performs any port I/O at all —
it only loads a voice's 18-byte record from the song's bank into a `DS:0x3fe`-based cache
(`call sub_36` then a block-copy helper, `0x2bb6`). The actual live, per-note register writes
happen through a **previously uncatalogued 4th near-jump table at `CS:[bx+0x26e2]`**, reached
by a small wrapper at file offset `0x2469` (gated by an `Init`-set flag at `DS:[0x4df]`) that
is itself called **directly from the GLBR tick-driven event-stream interpreter** (§2.5, the
same `0x8f0`-`0xaee` region that reads and dispatches each channel's `(statusByte,
durationCode)` pairs) — i.e. this is the real "NoteOn/NoteOff" table, distinct from the
"SetParam" table's actual role of "load/cache an instrument's raw bank bytes." Index 3's entry
is `0x249d`→`call 0x1fb6`; index 2's is `0x248b`→`call 0x148a` (a real-time OPL2 writer,
likewise distinct from index 2's own `SetParam` bank-install cluster); indices 0/1/4/5
(`0x24d3`/`0x254d`/`0x24af`/`0x24c1`) were not traced. Full write-up and evidence:
`docs/glbr-format.md` §5d.

DoK's box/manual documents AdLib/Sound Blaster (OPL2) and Roland MT-32/MPU-401 support
(per `docs/engine/research/audio-formats-krynn.md` §1.2) plus PC speaker, which is
consistent with 4 non-trivial backends existing. **Indices 2 and 3 are now identified**
(AdLib/OPL2 and CMS/Game Blaster respectively, both by real port-I/O evidence, not shape
alone — see the table above and `docs/glbr-format.md` §5a/§5c). **Indices 4 and 5 remain
open** — no port I/O to the well-known MPU-401 (0x330/0x331) or Tandy PSG (0xC0–0xC3)
immediates were found for either by static byte search; both call through
register-abstraction helpers whose *ultimate* port numbers were not fully traced (index 4's
helper is now confirmed to reach `0x2AF1`, narrowing the remaining gap to "which base port",
not "does it do real I/O at all"). This is the concrete open item for DoK (see Next steps).

### 2.5 The GLBR event body — SOLVED (2026-07-21)

The event body (what a note/duration event looks like inside a song, analogous to CoK's
MIDI-style byte stream in §1.4) is now fully reverse-engineered by disassembling the
driver's own per-tick stream-read routine (file offset `0x9bd` inside block 0) and
cross-validating the result against every real song block in all four titles that share
this container. **Full write-up: `docs/glbr-format.md`.** Summary: a second header at song
byte offset 444 (the byte-swapped `444` constant at fixed-header offset 6 turned out to
literally BE that offset) gives a channel count and a per-channel offset table into a
`descriptor0` control block (timebase/tick-divisor, patch id, per-channel stream offsets);
each channel is then a flat sequence of `(statusByte, durationCode)` pairs — status byte
`0x00-0x7F` = MIDI-numbered note-on, `0x80` = rest, `0x81` = off, `0x84` = full-volume reset,
`0xFF` = end of stream; `durationCode` bit-packs a length class, dotted flag, tuplet
selector, and tie flag. Verified against ~90 channel streams / ~12,000 event pairs across
all 4 titles (100% clean termination, plausible note range, pitch histogram peaking at
middle C) and rendered to audible PCM through the engine's existing OPL2 synth
(`packages/engine/src/audio/glbr.ts`, `packages/engine/test/glbr.test.ts`). The GLBR
**instrument/timbre bank** format is still UNLOCATED (every sampled song's patch id is a
constant 127 — no bank table located), so playback uses an explicitly-labeled generic
placeholder OPL2 voice rather than the games' real timbre; see `docs/glbr-format.md` §5a — as
of 2026-07-21 this is SOLVED for hardware-backend index 2 (the OPL2/AdLib bank), real
per-voice instruments now play.

### 2.5b What is still NOT resolved

- **2026-07-22, closed same day:** hardware-backend index 3's own 18-byte-per-voice
  instrument bank's exact **field layout** is now SOLVED (`docs/glbr-format.md` §5d) —
  all 6 bytes of each of its 3 six-byte groups are traced to specific SAA1099 register
  writes and cross-validated against 408 real record groups across all 4 titles. This item
  is retained here only as a historical marker; see §5d for the full result.
- Which of hardware indices 4–5 is Sound Blaster (if distinct from 2/3) vs. Roland MT-32 vs.
  Tandy — narrowed from "3–5 unknown" to "4–5 unknown" by the 2026-07-22 index-3 closure.

**Recommended next step:** the 2026-07-22 pass confirmed index 4's `0x1623`/`0x15c6` cluster
also bottoms out at the same generic `0x2AF1` port writer index 2 and 3 use (i.e. it performs
real I/O, port TBD) — grep-and-disassemble its own port-variable setter (by analogy with
index 3's `0x19bb`, search for a small function writing a caller-supplied base into a small
set of fixed memory cells that `0x15c6`'s `dx = word[0x3fc] + arg` then reads) to find its
literal base port the same way index 3's `0x220` was found. Index 5's `0xba5` cluster was not
re-examined this round. **Backend index 3's own bank field layout no longer needs this** — it
closed by static disassembly alone, without the dynamic trace this section previously
recommended for it (see `docs/glbr-format.md` §5d).

### 2.6 The same DoK architecture is shared verbatim by 3 more titles (2026-07-21)

The "silent-titles audio gap" investigation (`docs/engine/research/audio-silent-titles.md`)
ran `tools/mididax_decode.py` against every other DataLib-era GOG DOS install that ships a
`MUSIC.DAX`. Three do, and all three are the **identical driver + GLBR container**
described above, not a new format:

| title | `MUSIC.DAX` size | blocks | block 0 (driver) size | GLBR header fields (all songs) |
|---|---|---|---|---|
| Death Knights of Krynn (reference) | 28,017 | 8 (1 driver + 7 songs) | 12,528 | `reserved=0 len=444 loop=0xFFFF stride=32`, duration table `12×8,18×8` |
| Gateway to the Savage Frontier | 16,241 | 2 (1 driver + 1 song) | **12,540** (+12 vs. DoK) | identical |
| Treasures of the Savage Frontier | 14,443 | 2 (1 driver + 1 song) | 12,528 (byte-identical to DoK) | identical |
| Pools of Darkness | 26,416 | 9 (1 driver + 8 songs) | 12,528 (byte-identical to DoK) | identical |

Every `GLBR` header decoded — magic, the byte-swapped `0x01BC`=444 constant, the `0xFFFF`
loop sentinel, the 32-byte stride, and the 16-entry `12×8,18×8` duration table — is
**byte-for-byte identical** across all 4 titles' every song block, confirming this is one
shared engine-wide music format, not a per-title variant. The GLBR event-body gap (§2.5,
now solved) was therefore the single remaining blocker for **all four** titles at once —
solving it for DoK solved it for the rest by construction (`docs/glbr-format.md` §4 shows
the cross-title validation table).

Gateway's driver block is 12 bytes larger (12,540 vs. 12,528) than the other three, which
throws off `tools/mididax_decode.py`'s hardcoded dispatch-table file-offset reads for
Gateway specifically (the printed table entries for Gateway are garbage) even though its
`GLBR` magic/header decode is unaffected (that parser walks the container structurally, not
via a fixed offset). Re-deriving Gateway's own dispatch-table offset (likely a small
constant shift from the 12,528-byte layout) is a cheap follow-up, not attempted here since
it doesn't change the event-body conclusion.

**Curse of the Azure Bonds and Secret of the Silver Blades do NOT ship a `MUSIC.DAX` at
all** (confirmed by a full directory listing of both GOG installs) — Secret ships a
`SOUND.DAX` (the SFX-only bank described in §3), CoAB ships neither. **Pool of Radiance
ships no audio-bearing file whatsoever on DOS** (its install is a nested `POOLRAD/`
directory; a recursive search for any `music`/`sound`/`midi`-named file found none) — this
mirrors the Amiga-side finding in the audio-silent-titles research doc and is a second,
independent confirmation that Pool of Radiance's silence is a genuine data gap, not a
missed file.

---

## 3. `SOUND.DAX` (SFX) — out of scope here, cross-reference

`SOUND.DAX` (CoK and DoK ship byte-identical 14,206-byte files) is the PC-speaker sound-
*effects* bank (9 logical SFX), not music. Its header (`7D 00 00 01 01 01 01 01 ...`) does
**not** start with the `0xE9` vector-table signature described above, so it is very likely a
plain parameter/offset table rather than the executable-code shape used by `MIDI.DAX` — but
this was not investigated further, because the **command interface** side of SFX playback
(`PlaySound`/`SetSound`, the 13-slot effect bank, stop-all semantics) is already fully
decompiled in `docs/engine/research/decompile-seg044-sound.md`, which explicitly documents
the low-level PC-speaker tone-table gap as a **dynamic-trace TODO** (no anchor strings,
resident port I/O). That existing negative still stands for `SOUND.DAX`'s literal tone
tables; nothing in this investigation changes it.

---

## 4. Cross-reference to hackdocs (a nice corroborating parallel, not a source)

`hackdocs_extracted/PCSPKR.TXT` documents DQK-era (Gen2, XMI-based) PC-speaker music: *"The
handler for PC Speaker music... only reads the melody sequences mapped to channel 2 of the
normal MIDI sequence."* CoK's Gen1 driver (§1.4) treats its **second** vector-table slot as
the one real melody/interpreter routine (slot 1, with slots 2–5 wired to silence) — i.e. the
convention "one logical channel carries the melody, the rest are placeholders on
constrained hardware" appears to persist from this 1990 Gen1 driver through to DQK's 1992
PC-speaker path, even though the container formats are unrelated (CoK: bespoke compiled
code; DQK: real XMI/Standard-MIDI data). This is presented as a corroborating pattern, not
as evidence for either format individually.

---

## 5. Tooling

`tools/mididax_decode.py` (mirrors `tools/dax_decode.py`'s structure and reuses its DAX
container/RLE code via `import dax_decode`):

```
python tools/mididax_decode.py "Champions of Krynn/MIDI.DAX"        # CoK report
python tools/mididax_decode.py "Death Knights of Krynn/MUSIC.DAX"   # DoK report
```

For each CoK block it: validates the 6×`JMP rel16` header, resolves and prints all 6
absolute targets, checks (and reports pass/fail on) the slot1−slot0==27 and
slots-2-5-converge invariants, extracts and prints the 12-entry chromatic table, and dumps
the raw bytes of the still-unresolved "header" region for manual inspection. For DoK it
validates the `GLBR` magic on blocks 1–7, decodes the byte-swapped header fields (§2.2), and
(for block 0) resolves the three −0x100-corrected hardware-dispatch tables and prints the
backend-index table from §2.4. No audio is rendered (per §1.6/§2.5, the note timeline
location isn't pinned down yet, so there is nothing to safely sonify without risking a
misleading render) — this is a structural/verification decoder, matching the "text dump of
note events" fallback the task allowed for a format that isn't fully closed.
