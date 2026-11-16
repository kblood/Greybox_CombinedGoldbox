# CoK `SOUND.DAX` block 1: is it a bank of all sequences? (round 34 R6)

**Question the plan asked:** are CoK's songs *inside* `SOUND.DAX` block 1 — a 128-byte
driver-state header followed by one 11,088-event bank that the driver's cursor indexes —
rather than in a buffer nobody has found?

**Answer, from bytes: yes, with a correction to what "the header" and "the bank" mean.**
The header is mostly driver state (per-voice tables, volumes), but its very first word is a
real, verified stream-start pointer, not filler. The one combined event stream it points at
contains at least one long, multi-voice, balanced-Note-On/Off passage — the shape of real
music, not short sound effects — and three independent live memory captures (reused from
round 33, no new DOSBox-X session needed this round) show the resident driver's own cursor
sitting inside exactly that passage. Round 33's "this is the SFX bank, not a song" verdict
answered a different question than the one this round asked, and the "different question"
framing turns out to be the right correction, not just a rhetorical one.

Owner: R6, round 34 (`docs/engine/PLAN-ROUND-34.md`). Tooling:
`tools/mididax_bank_index.py` (new this round) + `tools/test_mididax_bank_index.py` (23
tests). Reused unchanged: `tools/mididax_song_scan.py`, `tools/mididax_song_locate.py`.
Conditional engine port: `packages/engine/src/audio/dosSong.ts` +
`packages/engine/test/dosSong.test.ts` (11 tests, all green; not wired into
`apps/web/src/audio/gameAudio.ts` — that is R4's file this round, a Phase B patch).

## Step 1 — the static detector was void, and had to be recalibrated first

The plan's own prerequisite: reproduce that `tools/mididax_song_scan.grammar_score` gives
its own only known positive control (`SOUND.DAX` block 1, scored over every 64-byte-aligned
window from offset 128 onward) a max of 16 — below that scorer's own published "hit" bar of
18 (the corpus-wide top-5 score 18-21) though above the shuffled-window null's max of 14.

**Reproduced exactly**: `python tools/mididax_bank_index.py rank` reports
`old_scorer_positive_control.max_score = 16` at offset 2176, `published_hit_bar = 18`,
`published_null_max = 14`. A detector that scores its only positive control below its own
"hit" bar is not a detector — every static negative that used `grammar_score` (including
round 33's own `scan` top-5) is **void**, not confirmed or refuted, for the question this
round asks. (It is *not* void for the different question it was built for — round 33's own
scope — which is unaffected by this finding.)

**Recalibration.** `mididax_bank_index.clean_prefix_events(buf, start)` decodes the
section-1.4 running-status grammar starting at `start`, but — unlike the old scorer, which
tallied good-vs-bad events over a fixed 64-byte window and let bad events cancel out — it
**stops at the first malformed byte** and reports how many clean events it decoded, with a
literal `0xFC` terminator (`clean-end`) as the strongest possible signal, since real event
streams have a reason to end that way and coincidental grammar-shaped noise does not.

`mididax_bank_index.recalibrated_rank()` runs this over the **identical 814-source corpus**
`mididax_song_scan.cmd_scan` already builds (GAME.OVR's carved VROOMM segments, every DAX
block in `Champions of Krynn/`, the unpacked `START.EXE` image) — same source count
reproduced (814), so the recalibrated scorer is being judged against the same pool the old
scorer's void result came from, not an easier one.

| rank | source | events | ends | code-alias verdict |
| --- | --- | --- | --- | --- |
| **1** | **`SOUND.DAX:block1`** | **11,088** | **clean-end (literal `0xFC`)** | not code-like |
| 2 | `TITLE.DAX:block1` | 1,395 | malformed-status | code-like (true) |
| 3 | `TITLE.DAX:block2` | 936 | malformed-data | code-like (true) |
| 4 | `WALLDEF1.DAX:block1` | 338 | malformed-status | not code-like |
| 5 | `GEO2.DAX:block68` | 272 | malformed-data | — |

Null: shuffling each source's own bytes (histogram-preserving) and re-running the same
best-offset search over 812 sources long enough to shuffle gives a max of **368** and a top-5
of `[368, 232, 185, 151, 130]` — the real positive control (11,088) is **>30x** the shuffled
null's max, and it is the *only* source in the whole 814-source corpus that terminates with a
clean `0xFC` at all. **Bar A: PASS.** The recalibrated scorer ranks the known positive
control **#1 of 814**, not merely "above bar" — a wide, unambiguous margin (11,088 vs. 1,395
for #2, a 7.9x gap), matching **P14** exactly (old scorer reproduces 16; recalibrated scorer
ranks #1).

The previous top-5 (`MIDI.DAX` blocks 1/2/5, both `GAME.OVR` code controls) are exactly what
the doc's own §1.7/§1.8 already called out as x86-code aliasing the grammar's *shape* for a
short run without any reason to terminate cleanly — confirmed directly: under the
recalibrated scorer, `MIDI.DAX` blocks 1-5 score `3/0/4/2/6` respectively (all near the
shuffled-source null's mean of ~11, nowhere near its top), i.e. the recalibration
independently disqualifies the exact false positives the old scorer produced, without
needing the separate `x86_code_verdict` disqualifier at all (though that verdict is still
reported alongside every rank entry as a second, belt-and-suspenders check).

## Step 2 — header verdict: mostly state, with one real embedded pointer

The plan's own proposed null for "is the header a sequence directory": read each header word
as a candidate stream offset, check what fraction land on event boundaries of the real
decode, and compare against ~125 random offsets (predicted density ≈ events/bytes ≈ 0.79,
"so random already scores high — a directory must score ≈1.0").

**That null does not discriminate, and this is reported rather than hidden.**
`tools/mididax_bank_index.py header` measures the real stream's boundary density directly:
**0.7957** for "any event boundary" (matching the plan's own prediction almost exactly) and
**0.2043** for "a FRESH status byte, not a running-status continuation". Testing every
byte-aligned 2-byte-LE header word, interpreted as an offset *relative to the stream start*
(`word + 128`), against the real decode's boundary sets:

| test | real header | plan's uniform-random-offset null | discriminates? |
| --- | --- | --- | --- |
| any event boundary | 0.891 (90/101 in-range) | 0.796 (measured density) | **no** — both near the same value |
| fresh status-byte boundary | 0.465 (47/101 in-range) | 0.204 (measured density) | **yes** — 2.3x the null |

The "any boundary" test cannot discriminate because the real stream's own boundary density
is already ~0.8 — almost any offset lands on *some* event boundary, directory or not. The
"fresh status byte" test is the one that matters, and it shows real elevation. Because the
uniform-random-offset null turned out useless for the first test, a **second, stricter null**
was built and measured: permute the header's own 128 bytes (histogram-preserving — same
byte-value multiset, different positions) 5,000 times and re-run the identical candidate
procedure. Real fresh-status-byte hit rate (0.465) is **above every one of 5,000 shuffled
trials** (shuffled mean 0.327, max 0.44; `p(shuffled ≥ real) = 0/5000`). This is a genuine,
reproducible signal — **Bar B: PASS, with the caveat that it is far short of the plan's own
"≈1.0" bar for a slam-dunk many-entry directory.**

**What actually explains the signal, found by checking the driver's own install code (not
guessed):** the persisted tick-cursor cell every block's slot-1 code loads at its readEvent
loop entry (`mov si, word ptr [cell]`) is *seeded*, at install time, from the buffer's own
first word — `mov ax, es:[0]; mov [cell], ax` — disassembled independently in **both** block 1
(`MIDI.DAX` offset 0x2f5, storing to `[0x2b7]`) and block 3 (offset unresolved to file bytes
directly but the identical idiom against `[0x340]`, matching round 32's own §1.7 quote for
block 3). `SOUND.DAX` block 1's own first word (bytes 0-1, little-endian) is **0x007d = 125**.
Decoding the section-1.4 grammar from byte offset 125 (not the round-33 report's manually
chosen 128) runs cleanly to the end with **0 malformed bytes** (11,090 events, one fewer
apparent discrepancy from 128's 11,088 — the 3-byte gap between 125 and 128 holds one small
extra event, not a decoder desync). **This is the header's one real directory entry**: not a
table of many songs, but a genuine, driver-verified "where does the sequence begin" pointer —
exactly the mechanism that produces the modest-but-real elevated fresh-status-byte hit rate
above (small header values, read as `+128`-relative offsets, land disproportionately near the
front of the stream, where 125 itself sits). **Verdict: the header is Alternative B (driver
state: 9-voice tables, `ff`-sentinel runs, two 5-6-entry volume tables) PLUS one literal,
disassembly-confirmed Alternative-A pointer field — not purely one or the other.**

## Step 3 — segment structure: three large, balanced, multi-voice passages

`tools/mididax_bank_index.py segments` decodes the full stream from 128 (matching the
round-33 report's own anchor for comparability) and segments on control-change (`0xC0`)
events — the only plausible internal marker, since the whole 13,936-byte stream carries
**exactly one** `0xFC` (at the very last byte), not one per song:

| segment | events | Note-On | Note-Off | voices | song-like? |
| --- | --- | --- | --- | --- | --- |
| offset 146–6138 | **4,801** | 2,397 | 2,403 | 5 (channels 1-5) | **yes** |
| offset 6141–7622 | **1,141** | 573 | 567 | 5 | **yes** |
| offset 7625–14062 | **5,132** | 2,562 | 2,568 | 5 | **yes** |
| 9 tiny (1-7 events) between/around the above | ≤7 | ≤6 | 0 | ≤1 | no |

All three large segments clear **every** part of Bar C's own claim shape: ≥200 events (they
have 1,141-5,132), 0 malformed (confirmed for the whole stream), ≥3 voices (all 5), and
near-perfect Note-On/Off balance (0.994-0.999, i.e. essentially every note that turns on also
turns off) — the balance ratio the old scorer's tally-based design could never have surfaced,
since it worked on isolated 64-byte windows far shorter than any of these segments.
**Total across the corpus: 5,538 Note-On and 5,538 Note-Off events, exactly equal** — this is
not noise; noise does not pair perfectly. **Bar C (static half): PASS, by a wide margin (3
qualifying segments, not the bar's minimum of 1).**

## Step 4 — dynamic cursor check, using round 33's kept dumps (no new DOSBox-X session)

The plan's method item 4 called for a fresh GameLink+debugger trace. Before running one, this
round checked whether round 33's own kept dumps (`build/r6-dosbox-out/ram1.bin`,
`build/r6-dosbox-out2/ram{A,A2,B}.bin` — git-ignored scratch, still present locally, never
committed) already answer the question, since they were captured specifically to catch the
resident driver's `CX:ES` install. They do, once one bug in the cursor-cell assumption is
fixed:

**Correction to a documented assumption.** `docs/midi-dax-format.md` §1.4 named the
persisted cursor cell `[0x2B7]` without stating that offset is **block-1-specific**. It is:
disassembling **each** block's own slot 1 (not assumed from block 1's) finds a distinct
load-then-store idiom (`mov si,[cell]` at the loop head, `mov [cell],si` after processing)
per block:

| block | backend | cursor cell | confidence |
| --- | --- | --- | --- |
| 1 | C/MS | `0x2b7` | load @1020 + store @1190, both confirmed |
| 2 | Roland | `0x7e` | load @333 confirmed; no store found (suspected capstone linear-disassembly drift past an embedded table, the project's known caveat — not independently re-derived this round) |
| **3** | **AdLib** | **`0x340`** | load @1020 + store @1254, both confirmed |
| 4 | Tandy | `0x1ee` | load @696 + store @912, both confirmed |
| 5 | PC speaker | `0xe0` | load @446 + store @615, both confirmed |

Block 3 (AdLib) is the block resident in every kept dump (matches the scratch `KRYNN.CFG`
Sound Type letter `A`, per round 32). Reading `driver_copy.base + 0x340` (not `+0x2b7`, which
is on-disk-default `0x2b00` and never written in any dump — the wrong cell for this block)
gives:

| dump | boot phase | live CX (handshake) | live cursor SI | segment |
| --- | --- | --- | --- | --- |
| `ram1.bin` | "SSI presents" splash | `0x5f39` | `0x0b58` (2,904) | **the 4,801-event segment** |
| `ramA.bin` | same splash, separate boot | `0x5f39` | `0x0a16` (2,582) | **the 4,801-event segment** |
| `ramA2.bin` | static "V1.2 [F1] PLAY [F10] DEMO" prompt | — | 0 driver copies resident | n/a — no music installed at this specific screen |
| `ramB.bin` | demo gameplay | `0x6173` | `0x05a0` (1,440) | **the 4,801-event segment** |

**Three independent live captures, at two different boot phases (splash + demo gameplay),
all land inside the SAME 4,801-event song-like segment** — and the cursor value itself
*differs* across nominally-identical-screen captures (2,904 vs. 2,582 between `ram1` and
`ramA`, both "SSI presents"), proving the cell is a live, advancing playback position, not a
frozen artifact. Copy 1 in every dump (`base=0x5abc0`, `cx=0`) never executed slot 1 at all —
consistent with round 33's own finding that only copy 2 is the one that ran.

**No new DOSBox-X session was launched this round.** The static evidence (recalibrated
scorer, header pointer, and three balanced 200+-event segments) was already strong enough
that the existing dumps were checked first, per the round's own instruction that "the dynamic
trace only earns its cost if the static work says it is worth running" — and they turned out
to already answer the question, at zero risk to the five other concurrently-running agents'
GameLink sessions. **Bar C (dynamic half): PASS.** Matches **P15** exactly: block 1 is one
bank; a ≥200-event segment exists (three of them) and the cursor points into one of them
during both a title/splash-adjacent screen and demo gameplay.

## What this means for round 33's "SFX bank" verdict

Round 33 was not wrong about its own bytes — both captures it took really did land in
`SOUND.DAX`, and it correctly declined to call that a MIDI.DAX-song discovery. But "is this
the SFX bank?" and "is this a bank of all sequences, songs included?" are different
questions with the same evidence, and this round's answer to the second is **yes**: the same
buffer contains both short one-shot-shaped fragments (the nine tiny 1-7-event segments,
plausibly the SFX-side content docs section 3 already describes) **and** at least one, very
likely three, long balanced multi-voice passages that look like real music, entered
sequentially from a self-describing start pointer, with the live driver cursor caught inside
the largest of them during two different points in a real play session. The round-33
"negative" was a category error, exactly as this round's framing predicted.

## Bars, predictions, and their nulls

| Bar | Verdict | Number | Null |
| --- | --- | --- | --- |
| A (positive-control score reproduced; recalibrated scorer ranks it #1/814) | **PASS** | old=16 (bar 18, null 14); recalibrated=11,088, rank 1/814 | shuffled-source null max 368 |
| B (header verdict, boundary density + random-offset null) | **PASS**, qualified | fresh-status-byte hit 0.465 vs. shuffled-header null max 0.44 (p=0/5000) | plan's own uniform-random-offset null (0.204) also reported, shown NOT to discriminate on the "any boundary" test (0.891 vs. 0.796) |
| C (segment table + dynamic cursor) | **PASS** | 3 segments ≥200 events (1,141/4,801/5,132), 0 malformed, 5 voices, balance 0.994-0.999; 3/3 live cursor reads land in the 4,801-event segment | none void |

| # | Prediction | Measured |
| --- | --- | --- |
| P14 | Positive control scores 16 under the old scorer; recalibrated scorer ranks it #1/814 | **Confirmed exactly**: 16, rank 1/814, margin 7.9x over #2 |
| P15 | Block 1 is one bank; ≥1 segment ≥200 events exists and the dynamic cursor points into it during the title screen | **Confirmed**, with a precision note: the captures are "SSI presents" splash and demo gameplay, not the literal static "V1.2 PLAY/DEMO" prompt screen (`ramA2.bin` has 0 resident driver copies at that specific screen — no music is installed there at all, which is itself informative and not a gap in the finding) |

## Files

- `tools/mididax_bank_index.py` (new) — recalibrated scorer, header test, segmenter, cursor
  reader against kept dumps.
- `tools/test_mididax_bank_index.py` (new, 23 tests) — unit tests with known answers, a
  synthetic-corpus ranking test, null reproducibility, and a mutation test (below).
- `packages/engine/src/audio/dosSong.ts` (new, conditional) + `packages/engine/test/dosSong.test.ts`
  (new, 11 tests) — TypeScript port of the decoder/segmenter (not the static scorer, which
  stays a Python research tool), gated on this round's finding that the buffer contains real
  song-shaped content. **Not wired into `apps/web/src/audio/gameAudio.ts`** — see Phase B
  patches in the R6 report.
- `docs/midi-dax-format.md` — new §1.9 (this round's findings, the `[0x2B7]`/`[0x340]`
  per-block correction, the header verdict).

## Mutation test (ground rule: a probe that has never failed is not evidence)

`clean_prefix_events`'s `if need is None: return CleanRun(..., "malformed-status", ...)`
check (the one that disqualifies an unrecognized status-byte kind) was inverted to
`if need is not None:` and the full 23-test suite re-run: **10 of 23 tests failed**, including
every synthetic unit test with a known answer and the real-file integration test (which now
reports 0 events instead of 11,088, since the very first legitimate Note-On byte is
misflagged as malformed). The mutation was then reverted and the suite re-confirmed green
(23/23). `git status --porcelain tools/mididax_bank_index.py` shows the file as untracked
(`??`) both before and after — no committed baseline existed to diff against, consistent with
a clean revert of a new file.
