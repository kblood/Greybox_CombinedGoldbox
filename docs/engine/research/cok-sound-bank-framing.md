# CoK `SOUND.DAX` event framing — the record is three bytes, and the driver says so

Round 35 R2 · 2026-09-05 · owner: R2 · **no DOSBox-X used** (pure static disassembly of retail
bytes plus a re-decode of a file already in the repo)

**Headline.** The `MIDI.DAX` slot-1 interpreter consumes **two data bytes plus one trailing wait
byte** for `0x90` and `0x80`, and **one data byte plus one wait byte** for `0xC0` — measured from
the driver's own control-flow graph in **four** independent backend blocks, with a fifth (MPU-401)
arriving at the same record shape by a different mechanism. The trailing byte is the per-tick wait
counter `docs/midi-dax-format.md` §1.4 predicted at `[0x2BD]` in 2026-07 and never located. Under
the correct framing `Champions of Krynn/SOUND.DAX` block 1 holds **3,699 events (3,700 including
the end marker), 1,846 Note-On / 1,846 Note-Off, 7 program changes, 7 segments (3 song-like),
7,860 ticks, 0 malformed** — against the published **11,090 / 5,538 / 5,538 / 14 / 14 / 3**. The
plan predicted 3/3/2 and 3,699 / 1,846 / 1,846 / 7,860 and every one of those is reproduced to the
digit.

Round 34's *conclusion* — that this bank contains song-shaped content and not only one-shot SFX —
is **strengthened**. Only the counts and the segment structure were mis-framed.

---

## 1. How the widths were measured

`tools/mididax_event_frame.py` (new, this round). Nothing about the answer is written down from a
hex dump:

1. **Entry derived, not asserted.** Slot 0's 27-byte trampoline carries a
   `call word ptr [bx+disp16]` whose operand is that block's own `sub_table` offset (§1.5a); entry
   `AH=0` of that table is the tick interpreter. Block 1 → 712 → 1006; block 3 → 853 → 1006.
2. **Recursive-descent disassembly (capstone, 16-bit), NOT following `call`s.** This matters: block
   1 has a `cmp al, 0x80` immediately followed by `jne` at `0x7cf`, inside a *called* subroutine.
   Following calls let it masquerade as the Note-Off dispatch test and produced a wrong (empty)
   count on the first run. Excluding call targets from the interpreter's own CFG fixed it.
3. **Tail located by shape, not offset:** `mov al, es:[si]; inc si; cmp al, 0; jne T;`
   `T: dec al; mov byte ptr [cell], al`. The `cell` it finds is then cross-checked against the
   interpreter head, which must both `cmp byte [cell], 0` and `dec byte [cell]` — i.e. the tool
   proves for itself that the byte it found feeds a per-tick countdown.
4. **Width = SI advancement.** For each dispatch branch, walk *every* path to the tail tracking
   `inc si` / `dec si`, and require all paths to agree; a branch whose paths disagree is reported
   `ambiguous`, never averaged. Also verify that no subroutine called between the branch entry and
   the tail touches `SI` or `es:[si]` (`counts_sound: true` for all five blocks).

Counting SI advancement rather than fetch instructions is load-bearing: **Note-Off's second data
byte is never read**. Block 1 does `mov bl, es:[si]` at `0x5da` then `inc si; inc si` at
`0x5dd`/`0x5de`. A fetch-counting tool would have called Note-Off a 1-data-byte event and
reproduced the very bug being fixed.

## 2. What it found

Block-relative offsets, as everywhere in §1 of the format doc.

| status | data | wait | record after status | block 1 | block 3 |
|---|---|---|---|---|---|
| `0x90` Note-On | 2 | 1 | **3** | dispatch `cmp ah,0x90` @`0x474`, body `0x506`; fetches `0x506`, `0x516`, `0x51a` | `cmp` @`0x4b4`, body `0x527`; fetches `0x527`, `0x537`, `0x53b` |
| `0x80` Note-Off | 2 (1 read, 1 skipped) | 1 | **3** | `cmp` @`0x47c`, body `0x5d6`; fetch `0x5da`, `inc si` `0x5dd`/`0x5de` | `cmp` @`0x4bc`, body `0x5f0`; fetch `0x5f4`, `inc si` `0x5f7`/`0x5f8` |
| `0xC0` program | 1 | 1 | **2** | `cmp` @`0x467`, body `0x4cc`; fetch `0x4d0` | `cmp` @`0x4a7`, body `0x4eb`; fetch `0x4ef` |
| `0xE0` | 2 | 1 | **3** | `cmp` @`0x449`; `inc si` ×2 @`0x458`/`0x459`, **neither byte read** | `cmp` @`0x45e`; fetches `0x468`, `0x46c` (read into `DX`) |
| unrecognised | 2 | 1 | **3** | body `0x484` | body `0x4c4` |
| `0xFC` end | 1 flag | **0** | **1** | `cmp al,0xfc` @`0x430`; fetch `0x4f0`; loop test `cmp al,0x80` @`0x4f4` | `cmp` @`0x445`; fetch `0x511`; loop test @`0x515` |

**The wait byte, by instruction.** Block 1: fetched at `0x493`; `0x00` → `jmp 0x410` (next event,
same tick); otherwise `dec al` then **`mov byte ptr [0x2BD], al` at `0x4a0`**, and the head tests
`[0x2bd]` at `0x402` / decrements at `0x409`. Block 3: fetch `0x4d3`, store **`[0x346]`** at
`0x4e0`, head test `0x417` / decrement `0x41e`. Its position in the record is **last**, on every
branch. A wait byte `w` delays the next event by `w` ticks.

**`0xFC` carries a loop flag.** The handler reads one more byte and compares it to `0x80`: match →
reload `SI` from the second copy of the header start pointer (`[0x2B9]` block 1 / `[0x342]` block
3) and continue; otherwise clear the driver-enabled cell and stop. In this buffer the flag is
`0x81` **at offset 14,063, the buffer's last byte** — the frame closes the buffer exactly, and the
bank stops rather than looping.

**Blocks 4 and 5 agree** (Tandy, PC speaker: identical 3/3/2 + wait). **Block 2 (MPU-401) is a
structural exception that corroborates rather than conflicts:** it has *no* `0x90`/`0x80` branch —
those bytes go straight out to the MIDI port — and instead tests `0xB0` (2 data + wait), `0xD0`
(1 + wait) and `0xC0` (1 + wait), with a width flag `[0x86]` set to 2 for every kind except
`0xC0`/`0xD0`. That is Standard MIDI's own data-byte table, plus the same trailing wait byte. One
stream, five backends, one framing.

## 3. The corrected census, beside the old one

`Champions of Krynn/SOUND.DAX`, one block (id 1), 14,064 bytes, header start pointer 125.
`Death Knights of Krynn/SOUND.DAX` is the same 14,206-byte file byte-for-byte
(sha256 `7df3bde460feacf8372e01a282b99691d61dfa0a832f2cfd06ce5f39cd4246a5`), so **its dashboard row
moves for reasons of file identity, not because anything was measured twice.**

| quantity | rounds 33/34 | round 35 | one-line reason |
|---|---|---|---|
| events incl. end marker | 11,091 | **3,700** | data + wait bytes were decoded as events |
| events excl. end marker | 11,090 | **3,699** | ditto |
| Note-On / Note-Off | 5,538 / 5,538 | **1,846 / 1,846** | exactly 3× — each note produced three phantom events |
| `0xC0` events | 14 | **7** | each real record is 1 data + 1 wait byte; the 1-byte decoder read the data byte as one event, then re-read the (always `0x00`) wait byte as a running-status continuation of the same kind — 2 published per real record, 7×2=14 (see §8 correction — the earlier "bit 7 set" reason was wrong) |
| segments (split on `0xC0`) | 14 | **7** | segmenter inherited the 2× |
| segment sizes | 4801 / 1141 / 5132 (+11 tiny) | **1601 / 381 / 1712 (+4 tiny: 1,1,1,3)** | same passages, correctly framed |
| song-like segments | 3 | **3** | unchanged; each clears the 200-event bar by ≥1.9× |
| malformed bytes | 0 | **0** | both framings run cleanly to the same `0xFC` at 14,062 — see §8 for what this column can and cannot detect |
| total ticks | — | **7,860** | the field did not exist under 1-byte framing |
| channels | 5 (1–5) | **5 (1–5)** | unchanged |

The dashboard row therefore changes from
`SOUND.DAX: 14 segments (3 song-like) · 11091 events (decode only)` to
`SOUND.DAX: 7 segments (3 song-like) · 3700 events (decode only)`, on both titles.

## 4. The statistical controls, and their nulls

All four planner-supplied controls reproduced exactly.

| control | plan | measured | null |
|---|---|---|---|
| 1-byte framing: same-status run lengths ≡ 0 mod 3 | 2840 of 2847 | **2840 of 2847** | this pattern *is* the artifact: three phantom events per real note |
| 3-byte framing event count | 3,699 | **3,699** (3,700 with end) | — |
| On/Off | 1,846 / 1,846 | **1,846 / 1,846** | — |
| Note-Off byte 2 constant | 64 in 1846/1846 | **64 in 1846/1846** | the driver never reads this byte, so it cannot be a decoder artifact |
| Note-On pitches / velocities | 36..96, {75,85,90,100,120,127} | **36..96**, **{75,85,90,100,120,127}** | — |
| wait-byte sum | 7,860 | **7,860** | — |
| Note-Off pairs an OPEN same-channel same-pitch Note-On | — | **1846/1846 = 1.000** | seeded column shuffle of Note-Off pitches: **mean 0.524, max 0.540** over 20 trials (scout said 0.527/0.543 — re-measured, same conclusion) |

**The plan's own null, evaluated.** The null was "the shipped 1-byte framing is right, and the
constant-64 column / 100% pairing / run-length ≡ 0 mod 3 are coincidences of a 13,939-byte
buffer." It is **falsified by the handler read, not by the statistics** — but it is worth writing
out why the statistics alone would not have settled it, because the plan asked:

- The run-length ≡ 0 mod 3 pattern (2840/2847) is *predicted* by the 3-byte reading and is
  otherwise unexplained, but a determined defender of 1-byte framing could posit a composer tool
  that emits note triplets. Not decisive alone.
- The constant 64 is the strongest statistical item, because under 1-byte framing that column is
  a *Note-Off pitch*, i.e. one would have to believe 1,846 consecutive note-offs all released MIDI
  note 64 while the note-ons ranged over 36..96. That is not a coincidence available to a
  13,939-byte buffer; it is a contradiction. Still, it is an argument about plausibility.
- The handler read settles it outright: `0x80`'s second byte is skipped by `inc si` at `0x5dd`, so
  the driver *frames* a byte it does not consume. No statistical story is needed.

**A control the plan explicitly warned about, confirmed non-discriminating:** "clean `0xFC` end,
0 malformed bytes" passes under **both** framings — both land on the same `0xFC` at offset 14,062
with zero malformed bytes. §1.8/§1.9 cite that as evidence; it cannot adjudicate framing and must
not be quoted as if it could. (A *new*, weak, one-sided item does favour the 3-byte reading: the
3-byte frame consumes the `0xFC`'s flag byte at 14,063, the buffer's final byte, so the framing
closes the file exactly; the 1-byte framing leaves that byte over. n = 1, reported as a
corroboration, not a proof.)

**A second plan-supplied null that measured out only partly useful.** The plan's bar asked that
`tools/test_mididax_event_frame.py` "fail when pointed at a shifted offset". Measured over the 16
shifts −8..−1, +1..+8 of block 1's entry: **10 fail, 6 return the correct framing anyway**, because
x86 re-synchronises within a couple of bytes and the walk still reaches the real interpreter. The
shift sweep is therefore a *weak* mutation and is pinned as such
(`test_shifted_entry_offset_is_only_partly_discriminating`, asserting 10/6 exactly) so nobody
later cites a passing sweep as proof the entry is right. The mutations that do carry the
"this probe can fail" claim are byte-level: NOP the `inc si` at `0x5de` → Note-Off measures 2 and
Note-On becomes *ambiguous* (its velocity-0 path jumps into the Note-Off handler, so the two paths
disagree — the tool refuses rather than guesses); break the tail's `cmp al, 0` → the tool raises.
Both watched RED. On the TypeScript side, reverting `DATA_BYTES_BY_KIND` to the round-34 values
takes `dosSong.test.ts` from 18 passed to **12 failed / 6 passed** (re-measured 2026-09-05 against
the post-verifier-pass 21-test file, §8: **16 failed / 5 passed** — the ratio moved because §8 added
tests that also depend on the corrected widths, not because this mutation weakened).

## 5. What this does and does not change

**Round 34 was not wrong about the thing it claimed.** Its finding was "this bank holds
song-shaped content, not only one-shot SFX," and the 3-byte reading makes that case *stronger*:
notes now pair perfectly, pitches are melodic rather than an artifact of misread velocity bytes,
and a timeline field exists. The head of the stream reads as a plain five-voice program-change
prologue followed by a struck chord held six ticks:

```
c2 00 00   ch2 program 0, wait 0        92 48 55 00   ch2 NoteOn  72 vel 85, wait 0
c3 03 00   ch3 program 3                   4f 55 00   (running status) NoteOn 79 vel 85
c4 04 00   ch4 program 4                c1 01 00      ch1 program 1
c5 05 00   ch5 program 5                91 48 5a 00   ch1 NoteOn  72 vel 90
                                        93 24 64 00   ch3 NoteOn  36 vel 100
                                        94 30 5a 00   ch4 NoteOn  48 vel 90
                                        95 2b 64 06   ch5 NoteOn  43 vel 100, wait 6
                                        82 48 40 00   ch2 NoteOff 72 rel 64
                                           4f 40 01   (running status) NoteOff 79 rel 64, wait 1
```

**The `0xC0` segmenter is weaker than §1.9 implied.** There are 7 program changes. **Four** of them
are truly consecutive at the head (status offsets 125/128/131/134, one per channel 2–5, three bytes
apart each, before a single note sounds). The fifth head-area one (offset 144, channel 1) is not
part of that run: the two Note-On events at offsets 137/141 (`92 48 55 00`, then running-status
`4f 55 00`, channel 2) fire in between, so a note has already sounded by the time it executes — see
§8 for the correction (an earlier draft of this paragraph said "5 ... consecutive ... before a
single note sounds," which the byte listing directly above already contradicted). Only the two
later ones (status offsets 6139 and 7623, both channel 1) plausibly mark a passage boundary. The
segment count is kept as a comparable census figure; it is not a claim that the bank contains 7
pieces of music. Read as what the handler does with them — a walk over a 12-voice instrument slot
table — they are instrument selects.

**Declined.**

- **No playback claim.** Nothing renders these events to audio; the dashboard row still says
  "(decode only)". Whether the CMS/AdLib `OUT` ever fires from this path in a live session was not
  re-tested this round (no DOSBox-X).
- **No tick rate for CoK, so no seconds.** 7,860 ticks is a count. 72.8 Hz is *DoK's* measured PIT
  divisor (§2.3); CoK's own timer reprogramming lives in the resident driver, still unlocated
  (§1.6). "108.0 s" would require borrowing another title's clock, so it is not stated as a
  finding.
- **No delta-time semantics beyond the `[0x2BD]` store.** What is proven is a per-tick countdown
  loaded from the record's last byte. Whether the composer's tool thought of it as an SMF-style
  delta-time, and what happens on the `w = 0` chain (many events in one tick) at the hardware, are
  not addressed.
- **`0xC0`'s width is settled from its own handler**, not from the terminator: block 1 `0x4d0`,
  block 3 `0x4ef`, one fetch each before the loop head, then the shared wait byte.
- **`0x90` velocity-0** routes into the Note-Off handler (block 1 `0x50a`, block 3 `0x52b`) — MIDI's
  own idiom, implemented in the decoder, but measured **0 of 1,846** Note-Offs in this buffer take
  that form, so nothing rests on it.

## 6. Superseded, and what is left for someone else

- `tools/mididax_bank_index.py`'s `clean_prefix_events` still uses the 1-byte grammar, so §1.8's
  "11,088 events, rank **#1 of 814**, 7.9× over #2, shuffled null max 368" is a **1-byte-framed**
  measurement. The *direction* of that ranking is very unlikely to change (the corrected decode is
  still a clean full-buffer run and the distractors get shorter too), but **it was not
  re-measured**, and this memo does not claim it survives. Re-running that ranking under the
  measured widths is a clean follow-up; it needs the scorer to take a width table.
- `docs/engine/research/cok-sound-bank.md` (round 34's memo) is left as written, as the record of
  what was believed then; `docs/midi-dax-format.md` §1.10 carries the correction, and §1.4's
  sentence "A per-tick wait counter at `[0x2BD]` (loaded from a stream byte…)" should gain a
  pointer to §1.10 now that the byte is located (not edited here — §1.4 is outside this task's
  ownership).
- The `cok-sound-bank` e2e ROW regex, the two manifest notes, and the `audio` ledger rows all still
  print the 1-byte numbers; the exact replacements are in this round's Phase B handoff.

## 7. Reproduce

```powershell
python tools/mididax_event_frame.py "Champions of Krynn/MIDI.DAX" --blocks 1 2 3 4 5
python -m pytest tools/test_mididax_event_frame.py -q            # 11 passed
pnpm --filter @goldbox/engine exec vitest run test/dosSong.test.ts  # 21 passed (18 before the §8 verifier pass)
```

## 8. Correction (2026-09-05, verifier pass) — three defects in §§2–5, fixed

An adversarial verifier of this round found three defects in the write-up above (and in the
`docs/midi-dax-format.md` mirror and `dosSong.ts`'s own header comment). The **3-byte framing
conclusion itself is not disputed** — these are defects in the reasons and checks shipped beside
it.

1. **§3's `0xC0` row gave a false mechanical reason.** It said "half were data bytes that happened
   to have bit 7 set." Scanning every data byte the 3-byte decode produces for this file: **0 of
   7,391 data bytes have bit 7 set.** The true mechanism, found
   by re-running the actual 1-byte decoder against the retail bytes: each real `0xC0` record is 1
   data byte + 1 wait byte (2 bytes after status). The 1-byte decoder reads the data byte as one
   event, then — because it has no wait-byte concept — re-reads the trailing wait byte (`0x00` in
   all 7 real records here) as a running-status continuation of the same `0xC0` kind, producing
   exactly 2 published events per real record: 7 × 2 = 14, matching the old published count. This
   is the identical 3×-inflation mechanism already documented for notes, just shorter (2 bytes
   after status, not 3), so it yields 2 phantom-inclusive events per record rather than 3.
2. **§5 misstated the byte listing fifteen lines above it.** "Five of the seven program changes are
   consecutive at the head... before a single note sounds" is wrong on both counts. Only **four**
   (status offsets 125/128/131/134, channels 2–5, 3 bytes apart each) are truly back-to-back. The
   fifth (offset 144, channel 1) is preceded by a Note-On pair on channel 2 at offsets 137/141
   (`92 48 55 00`, then running-status `4f 55 00`) — visible in §5's own byte listing, which already
   shows those two note bytes between the `c5 05 00` and `c1 01 00` columns. Both `midi-dax-format.md`
   and `dosSong.ts`'s header comment are corrected alongside this file.
3. **§4's "malformed bytes: 0" was a tautology, not a check.** `decodeCokSoundBank`'s `malformed`
   counter could only increment on its `last === null` branch (a running-status data byte before
   any status byte), and `last` is set on the first status byte and never cleared — so once a
   stream's own start offset is a status byte (every real file here), that branch cannot fire again
   for the rest of the decode. `malformed: 0` was therefore incapable of being anything else, while
   being presented as a passing, measured column. Fixed by also counting the dangling bytes of a
   truncated final record (the `ran-off-end` case) toward `malformed` — a real corruption mode a
   cut-short or damaged file can produce. **Mutation evidence:** a synthetic truncated buffer now
   reports `malformed: 3` (was un-testably 0); truncating the real `SOUND.DAX` block by 5 bytes now
   reports `malformed > 0` and `endReason: 'ran-off-end'` where the untruncated file reports
   `malformed: 0` and `endReason: 'clean-end'`. Both are pinned in `dosSong.test.ts`
   (21 tests total, up from 18).

**What did not change:** the 3-byte record framing, the 3,699/3,700-event census, the
1,846/1,846 Note-On/Off pairing, the tick total, and round 34's underlying conclusion that this
bank is song-shaped. Only the *reasons* attached to the `0xC0` count, the *consecutive-run* claim,
and the *meaning* of a 0 in the `malformed` column change.
