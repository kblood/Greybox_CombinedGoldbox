# SAVGAM world-state save format (CoK / DoK, Gen1 DAX era)

Status: **partial decode, one pass.** This is a genuine multi-session reverse-engineering
target, not something one pass closes. What follows is honest about the size of the solved
piece versus the size of the whole file.

Before this work, `SAVGAMA.PTY` / `SAVGAMA.DAT` (and its `B`/`C`/... slot siblings) was never
parsed anywhere in this repository: `grep -ri savgam native/src` returns zero hits. The ROSTER
half of save compatibility (opening and parsing real, unmodified `CHRDATA*.SAV/.GAM/.JNK/.STF/
.WIZ/.EFF` sidecars) already works in `gbboot.asm`/`ccparty.asm`. This document is about the
other half: the WORLD-STATE file that says where the party is, what it's carrying, and which
sidecar files back its six active slots — the piece that, until now, meant a real save could
only be resumed by re-deriving its state as `/A`/`/entry` command-line arguments, not by
actually reading the save.

## Material used (denominator: 7 real files, 2 titles)

All read-only; none written to. Copies for experimentation were made under this session's
scratch directory, never back into the repo. Final byte-for-byte re-verification against the
original baseline (SHA-256 + size/mtime, captured before any copying) confirms none of the
seven moved:

| # | Path (repo-relative) | Size | Title | Notes |
|---|---|---:|---|---|
| 1 | `Champions of Krynn/SAVE/SAVGAMA.DAT` | 5469 | CoK | live retail save |
| 2 | `Death Knights of Krynn/SAVE/SAVGAMA.PTY` | 2913 | DoK | live retail save, sparse/fresh (see below) |
| 3 | `Death Knights of Krynn/cloud_saves/SAVE/SAVGAMA.PTY` | 2913 | DoK | GOG cloud sync, 2012 |
| 4 | `Death Knights of Krynn/cloud_saves/SAVE/SAVGAMB.PTY` | 2913 | DoK | GOG cloud sync, 2012 |
| 5 | `Death Knights of Krynn/cloud_saves/SAVE/SAVGAMC.PTY` | 2913 | DoK | GOG cloud sync, 2021 |
| 6 | `The Dark Queen of Krynn/cloud_saves/SAVE/More/2 - Death Knights of Krynn/SAVE/SAVGAMA.PTY` | 2913 | DoK | byte-identical to #3 |
| 7 | `The Dark Queen of Krynn/cloud_saves/SAVE/More/2 - Death Knights of Krynn/SAVE/SAVGAMB.PTY` | 2913 | DoK | byte-identical to #4 |

Files #6/#7 are a second, independently-synced copy of #3/#4 that ended up nested inside a
*different* game's (DQK's) GOG cloud-save folder — GOG Galaxy's cloud sync evidently shares one
account-level save bucket across titles. Their byte-identity to #3/#4 is not a new data point
about the format, but it is corroborating evidence that #3/#4 are genuine, unedited cloud-synced
saves rather than something crafted for this task.

**CORRECTED 2026-09-10 — this claim was FALSE, and is quoted (not deleted) so a reader can see
what changed.** It read: "No CoK differential pair exists in this checkout — only one real CoK
`SAVGAMA.DAT` was found — so every CoK claim below rests on a single file, cross-checked
structurally against the DoK samples rather than against a second CoK save. That is a real
limitation of this pass, not glossed over: a second CoK save (a different slot letter, or the
same slot at a later point) would materially strengthen the CoK side of every cross-title claim."

**What was actually true, honestly stated:** this pass's original search covered exactly two
places — the two games' own `SAVE/` directories and their `cloud_saves/` folders (the "Material
used" table above). *Within those two places*, "only one real CoK `SAVGAMA.DAT`" was correct.
The false step was generalizing that to "this checkout" — a much bigger claim that was never
checked.

**CORRECTED AGAIN 2026-09-10 (same day, second pass) — the sentence that used to stand here
described the search method wrong, even though the count it produced (147) turned out to be
exactly right.** It read: "`build/` alone... holds **147** files named `SAVGAMA.DAT` under a
CoK-labeled path (`cok-*/runtime-game/SAVE/`, `Champions of Krynn/`, or `r6-cok-scratch/`) at the
CoK-sized 5469 bytes." Two independent verifiers tried to reproduce that literally — a path-name
match — and could not land on 147 under any reading of it, which is what triggered this second
pass. Re-derived here, today, three ways, each with its exact method stated:

- **Narrowest** — walk `build/` only, keep a hit if some path component starts with `cok-`, or
  equals `r6-cok-scratch`, or equals `Champions of Krynn`, size exactly 5469 bytes, plus the one
  top-level retail file (which also matches the `Champions of Krynn` component but sits outside
  `build/`): **137** files, hash split **104 (A) / 32 (B) / 1 (C)**.
- **Whole-checkout, same path pattern** — same component match, but walking the entire checkout
  instead of `build/` alone: **139** files, hash split **106 (A) / 32 (B) / 1 (C)**.
- **Whole-checkout, no path filter at all** — every file literally named `SAVGAMA.DAT`
  (case-insensitive), anywhere in the checkout excluding `.git/` and `node_modules/`, at exactly
  5469 bytes, no directory-name condition whatsoever: **161** files.

Only the third method reproduces the original headline, and it does so exactly. The 161 hits
resolve (SHA-1) to **8** distinct states, not 3: the same three CoK states already in the table
below (`ed482a12...` = 107, `6f549641...` = 39, `0abf2869...` = 1 — summing to **147**), plus
**5** distinct states under Secret of the Silver Blades harness paths summing to **14** files
(`d459186d...` = 5, `58aa9131...` = 5, `3a0d0631...` = 2, `bfadfcff...` = 1, `00fafd1c...` = 1).
`161 − 14 = 147`, and the CoK split is exactly `107 / 39 / 1` — the original number, reproduced to
the digit, once the excluded non-CoK states are subtracted rather than never having been found by
the search in the first place. This also explains why the original prose was internally
inconsistent: its very next paragraph excludes `runtime-secret-*` paths, which are not
"CoK-labeled" by any of the three patterns quoted above — the actual original sweep was never
restricted to CoK-labeled paths at all; it found everything named `SAVGAMA.DAT` at 5469 bytes,
CoK-labeled or not, then excluded the non-CoK hits by hash. The two hashes already cited below as
"checked and hash to neither A, B nor C" (`bfadfcff...`, `d459186d...`) are both present among
these five excluded states, confirming that spot-check sampled two real members of the same
excluded set — there are five distinct such states across 14 files, not two, a finer count this
document had not established before.

**Caveat this needs and did not have:** `build/` is a git-ignored scratch tree churned
continuously by many concurrent autonomous-round agents in this repo (see this file's own
project-level `CLAUDE.md`). This is a **live snapshot**, not a stable repo fact — re-running the
unrestricted sweep and SHA-1 partition above on a later date is expected to produce different
totals as `build/` changes, and any future re-run should restate its own count with its own date
rather than assume 147/107/39/1 still holds.

**A CoK differential pair — in fact a three-way set — exists, and has now been decoded.** Hashing
all 147 candidates (SHA-1) collapses them to exactly **3 distinct states** (the rest are
byte-for-byte duplicates left behind by repeated harness runs against the same starting save):

| Letter | Path (repo-relative) | SHA-1 | Duplicate count |
|---|---|---|---:|
| A | `Champions of Krynn/SAVE/SAVGAMA.DAT` (the original retail file, already in the table above) | `ed482a12b75da04b8295dee38b060ae743809105` | 107 of 147 |
| B | `build/cok-area1-load-watch-20260727/runtime-game/SAVE/SAVGAMA.DAT` | `6f54964132dce2e8c4e1350bf486255a1d2a6000` | 39 of 147 |
| C | `build/cok-caravan-worker-route-r2-20260727/runtime-game/SAVE/SAVGAMA.DAT` | `0abf28695ee5747cf43473300d827d51f8ec0684` | 1 of 147 |

Denominator stated: **147 candidate files → 3 distinct states.** Excluded from this count, and
worth naming rather than silently dropping: `build/` also holds files literally named
`SAVGAMA.DAT` at exactly 5469 bytes under **Secret of the Silver Blades** harness paths
(`runtime-secret-*`) — a different Gen1 title that happens to produce a same-sized save. Two were
checked and hash to neither A, B nor C (`bfadfcff...`, `d459186d...`), confirming they are a
different game's data, not a fourth CoK state; a size collision alone is not evidence of being the
same title, and they are correctly excluded here. Also excluded (different game, different SAVGAM
format entirely, sizes 13149/13137): Gateway to the Savage Frontier and Pool of Radiance harness
saves that also happen to be named `SAVGAMA.DAT`.

Two Amiga siblings also exist at 5481 bytes (12 bytes larger than the DOS files) —
`amiga_extracted/ChampionsOfKrynn/disk3/save/savgamA.dat` (`d1cba42854...`) and
`The Dark Queen of Krynn/cloud_saves/SAVE/Amiga/savgamA.dat` (`93131ad334...`). **Not analyzed
here** — a separate pass is already looking at these; this document only cites the size delta as
context (68000 big-endian, structurally distinct per this project's established convention — see
`docs/daa-format.md` — so nothing about the DOS findings below should be assumed to transfer).

See "CoK A/B/C world-state differential" below for the full decode. Treat that section, not this
paragraph, as authoritative for the CoK side of every cross-title claim in this document.

(Amiga `savgamA.dat`/`savgamA.pty` sidecars also exist under `amiga_extracted/` for the DoK title,
same reasoning: not analyzed here, left for a future pass — this is the same caveat as the two
CoK-side Amiga files cited just above, restated for DoK's own Amiga sidecars.)

## Method

1. Read `hackdocs_extracted/SAVGAM.TXT` (the only candidate existing documentation) and
   `hackdocs_extracted/UAFILES.TXT`/`GAMEDAT.TXT` (the other two files a grep for "savgam"
   turns up) first, per this project's convention of checking a hackdoc before reaching for a
   disassembler.
2. **Checked which title each hackdoc claims, per the project's own established failure mode**
   (a prior CoK thief-skills defect traced to a hackdoc whose own opening lines say it documents
   FRUA, applied anyway). Findings:
   - `UAFILES.TXT` is unambiguously FRUA/Unlimited-Adventures-specific, and it states FRUA's own
     save format is `SAVGAMx.CSV` — a **different container** from our `.DAT`/`.PTY` files. This
     rules UAFILES out as the source for our format, and rules out the hypothesis that our files
     are secretly FRUA-shaped.
   - `GAMEDAT.TXT` documents `game001.dat`, FRUA's *module/adventure-definition* file — not a
     save file at all. Also ruled out.
   - `SAVGAM.TXT` names no title anywhere in its text (checked with a case-insensitive grep for
     "FRUA", "Unlimited Adventures", "Pool of Radiance", "Krynn", "Curse of", "Secret of",
     "Hillsfar", "Gateway", "Savage Frontier" — zero matches). It is plausibly a
     classic-engine (`SAVGAM.{DAT,PTY,CSV}`-naming) doc rather than an FRUA one, on the strength
     of that naming match alone — but "plausible enough to not be instantly ruled out" is not
     "verified", so its byte offsets were tested against real bytes rather than trusted (below).
3. Located every real `SAVGAM*` file in this checkout (denominator table above) and inspected
   them: whole-file hex dumps, then byte-by-byte diffs across the DoK samples (differential
   analysis, the strongest available oracle per the task's own ranking, since no ECL/save-load
   disassembly was completed this pass — see "Unsolved" below).
4. Tested every `SAVGAM.TXT` header offset that lands inside our real files' front region
   against all 5 originally-copied real samples. Result: **every single one of them reads 0 in
   every one of the 5 files** (see "Rejected" below) — a project-standard falsification, not
   silence.
5. Located a structural pattern (the roster table, below) independently of any hackdoc, purely
   from the real bytes, then cross-verified it against a source outside itself: the files' own
   filenames.

## Verified

Each claim states which oracle confirmed it, per this project's convention.

### 1. A fixed 328-byte trailer, anchored to end-of-file, in both titles

**Oracle: cross-file, cross-title structural comparison (7 real files, 2 titles).**

Regardless of total file size, byte `size - 328` through EOF has the same internal shape in
every one of the 7 real files. This was found by searching for the ASCII substring `CHRDAT` in
every sample and noticing its first occurrence sits exactly 327 bytes before EOF in **both**
the 5469-byte CoK file and every 2913-byte DoK file (`CHRDAT` itself starts 1 byte after the
trailer's own start, at the length-prefix byte — see next finding). Two files that differ in
size by 2556 bytes landing on the identical distance-from-end is not the kind of thing an
unrelated/coincidental format would produce.

```
tools/savgam_decode.py TRAILER_SIZE = 328
roster_offset = file_size - 328   # verified equal to the first "CHRDAT" tag's offset - 1, all 7 files
```

### 2. A 6-entry, 41-byte-per-entry roster table opens the trailer

**Oracle: cross-file structural comparison + self-consistency against the file's own name.**

Starting at `roster_offset`, six consecutive 41-byte records appear, at a constant stride
(verified: `41, 41, 41, 41, 41` between successive `CHRDAT` tag offsets, in all 7 files). Each
record is:

```
offset +0        : u8    tag_len   -- observed value 8 in all 7 files, all 6 slots (42 samples)
offset +1..+8    : ascii tag_body  -- "CHRDAT" + <slot letter> + <member 1-6>, e.g. "CHRDATB3"
offset +9..+40   : 32 bytes, UNDECODED (see "Unsolved")
```

**The single strongest, most independently-checkable claim in this document:** the `<slot
letter>` embedded in every one of the 6 tags always equals the save file's own filename letter.
Tested against the files' *real* on-disk basenames (not a renamed scratch copy), via
`SavgamFile.filename_letter_matches()`:

| File | Embedded slot letters | Matches own filename |
|---|---|---|
| `Champions of Krynn/SAVE/SAVGAMA.DAT` | `{A}` | **True** |
| `Death Knights of Krynn/SAVE/SAVGAMA.PTY` | `{A}` | **True** |
| `.../cloud_saves/SAVE/SAVGAMB.PTY` | `{B}` | **True** |
| `.../cloud_saves/SAVE/SAVGAMC.PTY` | `{C}` | **True** |

This is not something a doc told us to expect; it falls out of the bytes and is independently
checkable against the filesystem, which is what makes it strong. The base filename (e.g.
`"CHRDATA1"`) is exactly the DOS 8.3 base name (no extension) of that slot's sidecar
`CHRDATA1.SAV`/`.GAM`. The most defensible reading: **this is the resident engine's cached
table of which sidecar file backs each of the party's up-to-6 active slots** — i.e., exactly
the missing piece that a save-resume path needs in order to know which `CHRDATA*` files to
open without being told via `/A`/`/entry`.

Corroborating (not independently conclusive, but consistent) evidence: the "More" folder sample
(`The Dark Queen of Krynn/cloud_saves/SAVE/More/2 - Death Knights of Krynn/SAVE/`) has real
`CHRDATA1..8.*` and `CHRDATB1..8.*` sidecars on disk (up to 8 characters ever created per slot
letter — presumably reserve/hall-of-fame characters beyond the 6 active), yet its `SAVGAMA.PTY`/
`SAVGAMB.PTY` roster tables still list only 6 entries each. Six is the series' well-known
maximum active-party size, so a table capped at 6 while up to 8 sidecar sets exist on disk is
consistent with "table of the 6 *active* slots," not "table of every character record ever
saved."

The `tag_len`/`tag_body` check is exactly what `decode_savgam()` validates before it will accept
a file as a Gen1 SAVGAM at all (`SavgamFormatError` otherwise) — this is also what `sniff()`
tests.

### 3. The header region (everything before the trailer) is overwhelmingly zero in real saves

**Oracle: direct byte inspection, all 5 originally-copied real samples.**

| File | header bytes | nonzero bytes | byte[0] |
|---|---:|---:|---:|
| CoK `SAVGAMA.DAT` | 5141 | 22 | 1 |
| DoK `SAVE/SAVGAMA.PTY` (fresh/live) | 2585 | 27 | 1 |
| DoK cloud `SAVGAMA.PTY` | 2585 | 180 | 3 |
| DoK cloud `SAVGAMB.PTY` | 2585 | 177 | 1 |
| DoK cloud `SAVGAMC.PTY` | 2585 | 177 | 1 |

The live `Death Knights of Krynn/SAVE/SAVGAMA.PTY` (mtime 2025, presumably a freshly-initialized
or lightly-played save) has visibly fewer nonzero header bytes (27) than the three cloud saves
from actual played sessions (177-180), and its nonzero bytes cluster differently (see below).
This is consistent with the header containing progress-dependent state (quest/event flags, party
position, etc.) that accumulates as a campaign advances — but that is as far as this pass could
independently confirm; no individual bit or byte in this region is named (see "Rejected" and
"Unsolved").

`byte[0]` itself is always nonzero across all 5 samples but takes two different values (1 or 3)
with no established meaning — exposed as `SavgamFile.byte0`, explicitly documented as unknown.

## Rejected: `SAVGAM.TXT`'s header offsets do not hold for CoK/DoK

**Oracle: direct byte inspection, all 5 originally-copied real samples, falsifying the claim.**

`SAVGAM.TXT`'s early-offset fields (`No Magic flag`@1, `Rounds`@5, `Turns`@6, `Hours`@7,
`Days`@8, `Months`@9, `Years`@10, `Facing`@16, `Game Speed`@17, `Current Module`@18,
`Initiated`@21, `Previous column/row`@22-23, `Search Mode`@24, `Overland`@25, `Party Never
Dies`@28, `No Treasure`@29, `No XP`@30, `Party Size`@31, `Dungeon flag`@33, `Overland`@35,
`Party Column/Row (Overland)`@36-37, `Combat level`@38, `No Rest Zone`@43, `Allowed Train`@47,
`Opponents Distance`@54, `Opponents Friendly`@57, `Underwater`@59, `Party Column/Row
(Dungeon)`@66-67, `Key 1`@68, `Item 1`@76, `Quest 1`@88, `Initiation flag`@133) were read at
their stated offsets in **all 5** real files. **Every single one of them is byte value 0 in
every one of the 5 files, including three cloud saves known to be from actual played sessions.**

Some individual zeros are unsurprising in isolation (cheat flags like "Party Never Dies" being
off in a legitimate retail save, "Rounds/Hours" being 0 outside active combat). But a `Party
Column`/`Row (Dungeon)` of exactly `(0, 0)` in three different played saves, together with every
other checked field also reading zero, is a pattern that reads as "this doc's offsets are not
this format's offsets" rather than "every one of 23 unrelated fields independently happens to be
at its own zero/default in every save we have."

**Conclusion: do NOT trust `SAVGAM.TXT`'s byte offsets for CoK/DoK.** `savgam_decode.py`
deliberately does not implement any field from it. This does not necessarily mean the doc is
wrong about *some* other Gold Box title (Pool of Radiance is a plausible original subject, given
the doc never says); it means it is wrong, or at minimum unconfirmed and not to be trusted,
*for these two titles' real bytes*, which is the only claim that matters here.

## Unsolved

**Partially advanced 2026-09-10 — see "CoK A/B/C world-state differential" below.** The bullet
immediately below ("header/body region... no individual field in it was confirmed this pass") is
no longer fully true for CoK: a differential against two more real CoK saves decoded a genuine
sub-structure (a word-per-character text buffer matching a real ECL script's own string
operands) inside that region, and found strong circumstantial evidence for one specific numeric
value. It remains true that no *general*, save-independent field map of the region exists — the
new section is explicit about that boundary.

- **The header/body region** (everything before `roster_offset` — 5141 bytes for CoK, 2585 for
  the DoK samples) is exposed by `savgam_decode.py` as a raw byte string plus the list of
  nonzero offsets, and nothing more. This is almost certainly where party position, gold, quest
  flags and campaign progress actually live (per the task's own framing of what's needed), but
  no individual field in it was confirmed this pass. The nonzero-offset clustering differs
  between the "fresh" and "played" DoK samples (see Verified §3) — a real lead, not chased
  further this pass.
- **The 32 opaque bytes of each roster entry** (offset +9..+40) are undecoded. They differ
  between saves (e.g. CoK slot 1's opaque bytes are `1e0276921e923c51...`; DoK samples differ
  per slot and per save) and do not look like simple counters. A plausible but UNVERIFIED guess:
  DOS far-pointer or file-handle state cached from the resident process's own open-file table
  (this would explain why they vary freely between otherwise-similar saves and don't need to
  mean anything at the story level) — flagged as a guess, not shipped as a field name.
- **The ~82 bytes of trailer after the roster table** (`trailer_tail`) are undecoded raw bytes.
  Ad hoc inspection (not a decoded field — see the CLI's `--dump-trailer`, which surfaces
  printable-ASCII runs purely as a diagnostic) turned up what reads like an in-game status-line
  snapshot in the DoK cloud saves — e.g. `"0,15 W 05:07 camping"` appearing in `SAVGAMB.PTY` at
  a slightly different byte offset than the equivalent string in `SAVGAMC.PTY` (consistent with
  a variable-length preceding field shifting it) — plus embedded UI/menu strings such as
  `"Save View Magic Rest A"` (byte-identical across both B and C at the same relative position),
  `"Exit the ... party makes camp"`. These read as literal fragments of the resident program's
  own string tables or a captured status readout, not as a hand-authored serialization format.
  This supports treating large parts of `SAVGAMx` as closer to "an opportunistic dump of
  whatever the resident data segment held at save time" than "a deliberately designed struct" —
  a real, useful negative result, but not a decode.
- **CoK's header body is much larger than DoK's** (5141 vs 2585 bytes) despite the roster
  trailer being byte-for-byte identical in shape. This is consistent with a variable-length
  per-module event-flag region (matching `SAVGAM.TXT`'s own description of a "3900 bits ...
  continue" event-flag design, even though that doc's *offsets* were rejected above — the
  general shape of "an event-flag region sized by module/world count" is a separate,
  unfalsified claim from "the flags sit at these specific byte offsets") sized differently for
  CoK's larger world versus DoK's. **Not verified**; recorded as the most plausible standing
  hypothesis for why the sizes differ, not as a finding.
- **No disassembly of the actual save/load routine was attempted this pass.** The ASCII string
  `"savgam"` (Pascal-length-prefixed, lowercase, matching the DOS filename-building convention
  seen throughout this codebase) was located at two sites in `Champions of Krynn/GAME.OVR`
  (file offsets 127388 and 129273 — a "Load Which Game" prompt and a "Can't save... No room on
  this disk" error, respectively) and one site in `Death Knights of Krynn/START.EXE` (offset
  68821, a "Put save disk in..." prompt). All three are filename-construction/UI string tables,
  not the record-layout code itself, and none was disassembled to find the read/write routine.
  **This is the next concrete oracle** for solving the header/body region: locating the routine
  that actually reads/writes offsets against these strings (via the existing Unicorn tooling in
  `tools/`, following this project's Borland-prologue/segment-base convention) would very likely
  confirm or refute the event-flag-region hypothesis above and could name real header fields.
  That is a substantial task in its own right and was correctly out of scope for this pass
  (pure-Python-and-docs lane, one pass, explicit permission to stop at an honest partial).

## CoK A/B/C world-state differential (added 2026-09-10)

Denominator for this section: **3 distinct real CoK `SAVGAMA.DAT` states** (A, B, C — see the
correction above for how they were found and deduped from 147 candidates), all still at the
retail 5469-byte size, all decoding cleanly under the existing `savgam_decode.py` with **zero
code changes** and zero warnings — worth stating explicitly, since "no code change was needed" is
itself a result: the module's format model (328-byte trailer, 6×41-byte roster, `CHRDAT<letter><n>`
tags matching the file's own name) generalizes across independently-generated CoK saves, not just
the one retail file it was built against. `tools/test_savgam_decode.py` now carries both B and C
as fixtures (`cok_diff_b`, `cok_diff_c`), raising the module's real-file denominator from 7 to 9.

### 1. Byte-level differential counts — verified

**Oracle: direct byte-for-byte comparison, all three files, full 5469-byte length.**

| Pair | Differing bytes |
|---|---:|
| A vs B | 536 |
| A vs C | 280 |
| B vs C | 414 |

**CORRECTED 2026-09-10 — this paragraph named the wrong boundary.** It read: "A-vs-C differs only
in scattered single bytes plus the roster/trailer region (offset 5126 onward — 257 of the 280)."
5126 matches nothing else in this document — the module's own math (`TRAILER_SIZE = 328`,
`roster_offset = size − TRAILER_SIZE = 5469 − 328 = 5141`, same value already stated above at
line 235/289/314) puts the true roster/trailer boundary at **5141**, and measuring A-vs-C diffs
from **5126** onward actually gives **259**, not 257 (re-derived by direct byte comparison of the
real `cok_savgama`/`cok_diff_c` files today). The 257 figure is correct, but only at **5141**.

A-vs-C differs only in scattered single bytes plus the roster/trailer region proper
(`roster_offset` = **5141** onward — **257** of the 280). Accounting for the full 280: **9**
scattered singles fall inside region 1's span, **10** inside region 2's span, **257** from
`roster_offset` (5141) onward, and the remaining **4** stray diffs sit outside all three regions
— at file offsets **3469, 3523, 5126, and 5127**. Those four do NOT share one span, and an
earlier draft of this sentence wrongly placed all four "between the end of region 2 (5083) and the
start of the roster/trailer proper (5141)": **3469 and 3523 sit between region 1's end (1021) and
region 2's start (4609)**, while only **5126 and 5127** fall in the [5084, 5140] gap.
`9 + 10 + 257 + 4 = 280`, closing the count exactly.
(Offsets 5126/5127 are the same two bytes the retracted 5126 boundary happened to sweep into its
259, which is why 259 looked plausible without being the right number for this document's own
`roster_offset`.) A-vs-B additionally differs across two contiguous regions the doc calls
**region 1** (byte offsets 385–1021 inclusive, 153 differing bytes) and **region 2** (byte offsets
4609–5083 inclusive, 88 differing bytes) that A-vs-C does *not* touch in the same way (A-vs-C has
only 9 scattered singles inside region 1's span and 10 inside region 2's span — a subset of B's
positions with different values, not the same span). Pinned in
`test_cok_three_way_differential_byte_counts`.

### 2. The structural attack on "big-endian u16 array" — partly resolved, partly still open

**Oracle: parity classification of every A-vs-B differing offset inside regions 1 and 2, cross-
checked against the region's own byte content and, for region 2, an independent ECL bytecode
dump.**

Every one of the 153 + 88 = **241** differing bytes inside regions 1 and 2 lands at an **ODD**
file offset; **zero** land at an even offset.

**CORRECTED 2026-09-10 — the contrast figure just below used to name no boundary at all.** It
read: "the roster/trailer region's own A-vs-B diffs are 140 odd / 136 even" — a claim that
does not reproduce at either boundary this document uses elsewhere (5126, retracted above, or the
true `roster_offset` 5141): it only reproduces measured from **5084**, immediately after region 2
ends, which is a *third*, previously-unstated boundary. Both figures are real, re-derived today
against the real A/B files, but they answer different questions and both need their boundary
named:

- **From offset 5084** (immediately after region 2 ends — i.e. "everything past the two
  world-state regions already discussed, trailer included"): A-vs-B gives **140 odd / 136 even**
  (276 total). This is the figure worth quoting for contrast against regions 1/2's 241/0, since it
  covers the same "rest of the file" the 241/0 figure implicitly excludes.
- **From `roster_offset` = 5141** (the trailer proper, matching this document's own struct
  boundary): A-vs-B gives **136 odd / 133 even** (269 total) — a different, smaller total, because
  it excludes the 7 bytes between 5084 and 5141 that the first figure includes.

Neither total matches the other, and neither is "the" roster/trailer figure without saying which
boundary produced it. Both remain distinct from regions 1/2's 241/0 either way, which is the
actual point of the contrast: regions 1/2 are structurally different from whatever lies past
region 2, at both readings of where "past region 2" starts. Pinned in
`test_cok_world_state_regions_differ_only_at_odd_offsets`, with a mutation-proof twin
(`test_cok_world_state_region_parity_pin_can_fail`) confirming the check is not vacuously true.

The task that produced this document asked this pattern to be attacked against four hypotheses:

- **(a) a big-endian u16 array** whose values all happen to be < 256 (so the high/even byte is
  always 0x00).
- **(b) a little-endian u16 array** whose values are all exact multiples of 256. Ruled out as
  implausible on its face: it requires every one of 241 independently-varying save-state values
  to land on a multiple of 256 by construction, which has no plausible mechanism (game counters,
  timers and text characters are not naturally quantized to 256s) — offered for completeness, not
  because any evidence favors it over (a). (a) and (b) are two labels for the *same bytes*; nothing
  in this pass's evidence distinguishes them, so this doc does not pick one as "the" interpretation.
- **(c) two interleaved byte arrays**, one of which is all-zero in every sample examined.
- **(d) a struct-of-arrays or pair-per-entry layout** that only *looks* like a word array.

**Verdict: (a)/(b) and (c)/(d) are observationally identical from the byte pattern alone — the
task's own framing was correct that this cannot be settled by parity evidence by itself — but
this pass found a decisive tie-breaker for region 2 specifically, and a genuine open question for
region 1.**

#### Region 2 (4609–5083): PROVEN to be a word-per-character text buffer, not a numeric array

Reading only the odd bytes of region 2 in file B as ASCII yields directly legible English,
including five complete, coherent strings near the end of the region: `WHAT DO YOU DO?`,
`ATTACK`, `MOVE AWAY`, `REPORT HUMANS`, `GIVE THEM THE CROWN` — plus earlier, more fragmentary
runs (`MYSELLIA`, `NERS`, `A GOOD`, isolated `N`/`T`/`E`/`MB`, `HER`) consistent with this being a
reused buffer that still held pieces of an earlier occupant's text.

**Independent cross-oracle confirmation, outside the SAVGAM file entirely:** this project already
holds a decoded dump of CoK's own ECL bytecode at `daxdump_extracted/ECL3_097.txt` (Area 3, Block
97 — produced by `EclDump.exe`, part of this project's standard toolchain, not newly generated
for this task). That file contains, at consecutive instructions:

```
0x8BF4 0x09 SAVE <string starting at stru_1B2CA.word_0320> = 'WHAT DO YOU DO?'
0x8C06 0x09 SAVE <string starting at stru_1B2CA.word_0348> = 'ATTACK'
0x8C11 0x09 SAVE <string starting at stru_1B2CA.word_0370> = 'MOVE AWAY'
0x8C1E 0x09 SAVE <string starting at stru_1B2CA.word_038E> = 'REPORT HUMANS'
0x8C2E 0x09 SAVE <string starting at stru_1B2CA.word_03B6> = 'GIVE THEM THE CROWN'
```

The five strings are byte-for-byte identical, in the same order, to what region 2 decodes to.
More decisively, the **field-to-field spacing matches exactly**: the ECL dump's own operand word
offsets are `0x320, 0x348, 0x370, 0x38E, 0x3B6` — deltas of `0x28, 0x28, 0x1E, 0x28` bytes (40,
40, 30, 40). Independently locating each string's first character inside file B's raw bytes gives
file offsets `4897, 4937, 4977, 5007, 5047` — deltas of **40, 40, 30, 40**, an exact match. This
is pinned in `test_cok_b_world_state_text_matches_ecl3_097_dump` (skips, rather than fails, if
`daxdump_extracted/` — git-ignored, locally re-derived from `daxdump.zip` — is absent).

**Conclusion for region 2: this is a live snapshot of the ECL-scripted structure `stru_1B2CA`, a
one-ASCII-byte-per-16-bit-word text/menu buffer that CoK's own `SAVE <string...>` opcode (0x09)
populates one character per word slot (character in the low/odd byte, 0x00 in the high/even byte)
— matching hypothesis (c)/(d), not (a)/(b), for this specific field.** File B was saved while (or
shortly after) ECL area 3 block 97 had written this exact menu prompt and its four options into
that buffer — a diplomatic/combat encounter offering the player a choice among ATTACK, MOVE AWAY,
REPORT HUMANS, or GIVE THEM THE CROWN. This is a genuine semantic decode, not a guess: it rests on
an oracle (independently-dumped ECL bytecode) stronger than a hackdoc, per this module's own
stated bar for adding claims.

A small, separately-interesting piece of corroboration: at file offset 394–395 (inside region 1,
not region 2) file B holds the big-endian word value `0x0061` = **97** — matching the literal
value `97` that `ECL3_097.txt`'s own dispatcher compares against `area1.LastEclBlockId` a few
instructions before reaching the SAVE-string sequence above (`0x804A: COMPARE '97' ==
'area1.LastEclBlockId'`). Both A and C hold `0x0000` at the same offset. **This is flagged as
corroborated-but-not-proven**, not shipped as a named field: 97 could coincidentally be some other
save-time counter, and no disassembly of the actual save-write routine was performed to confirm
this specific word is where `LastEclBlockId` (or its equivalent) is cached at save time. It is
consistent with, and strengthens, the region-2 finding rather than standing alone.

#### Region 1 (385-1021): SOLVED 2026-09-10 - it is the tail of the Gen1 **Area1** host record

**This heading read "genuinely unresolved -- do not extend the region-2 finding to it" until
2026-09-10.** The section under the next heading is kept verbatim as the reasoning of record,
because its refusal to guess was correct and its two candidate readings ((a) a numeric array,
(c) a leftover buffer) were BOTH partly right. What it was missing was not more bytes -- it was
that **this repo already decodes the structure**, in `packages/engine/src/loaders/area1.ts`,
under a name this document never searched for.

**The layout, and it closes exactly.** `SAVGAMA.DAT` is
`byte[0] + Area1(0x800) + Area2(0x800) + stru_1B2CA(0x400) = 5121`, then a **20-byte**
uncharacterized gap, then the 328-byte roster trailer at 5141 -> **5469**, the file's real size.
So "region 1" is not a region: it is Area1 record offsets `0x180..0x3FC`, i.e. the ECL-visible
tail of a 2 KB host record that starts at file offset 1. The bases are `area1.ts:10-13`
(`COAB_AREA1_SIZE = 0x800`, `COAB_SAVGAMA_AREA1_OFFSET = 1`), and `stru_1B2CA`'s base measures
**4097** = `1 + 0x800 + 0x800`, six of six resolvable `SAVE`-string operands agreeing (out of the
ten `SAVE`-string ops in `ECL3_097`, four being unstored alternates).

**Four of the nine A-vs-C region-1 diffs land on NAMED fields, and I re-derived all four in my
own script rather than relaying them:**

| file offset | Area1 offset | field (`area1.ts:27-38`) | A | B | C |
|---|---|---|---|---|---|
| 461 | `0x1CC` | `inDungeon` | 1 | 1 | 0 |
| 481 | `0x1E0` | `lastXPos` | 0 | 4 | 1 |
| 483 | `0x1E2` | `lastYPos` | 0 | 5 | 3 |
| 485 | `0x1E4` | `lastEclBlockId` | 0 | 98 | 17 |

Of the other five (391, 393, 591, 625, 633 = `0x186`, `0x188`, `0x24E`, `0x270`, `0x278`),
**four of five** are referenced by CoK's own ECL bytecode across the 22 block dumps (occurrence
counts 14 / 14 / 5 / 8); `0x278` is referenced **nowhere**, and saying "5 of 5" would have been
the easy overstatement here.

**`byte[0]` is SOLVED and it is not a mode flag.** It is CoAB `gbl.game_area`, "stored as the
first byte before the Area1 record" (`area1.ts:59-60`). Measured: `byte[0] == area2.game_area`
(Area2 `0x624`, file 3621) in **3 of 3** CoK files -- 1 / 3 / 1. The old "plausible correlate,
unverified (only 3 samples, 2 values)" row in the summary table is superseded: three samples of a
*correlation between two independently-located fields* is a different and much stronger claim
than three samples of a bare value.

**The ECL-block cross-oracle.** Parsing the retail `Champions of Krynn/ECL{1,2,3}.DAX` TOCs
directly gives ECL1 = {16,17,18,32,33,34,36} (7 ids), ECL2 = {48,49,50,57,64,66,67,68} (8),
ECL3 = {80,81,82,96,97,98,99} (7). File B reads `game_area=3`, `current3DMapBlockId=97`,
`lastEclBlockId=98` -- **both real ECL3 ids**. File C reads `game_area=1`, `lastEclBlockId=17` --
a real ECL1 id. File A is a fresh save and reads 0 everywhere, correctly. **Null:** a random byte
lands on a valid id 2.7% / 3.1% / 2.7% of the time per library.

**This PROVES the "corroborated, not proven" note below, and RENAMES it.** That note reads the
`97` at file 394-395 as caching "the ECL `LastEclBlockId`-equivalent state". It is
`current3DMapBlockId` at Area1 `0x18A`; `lastEclBlockId` is a *different* field two words later
at `0x1E4`, and in file B it holds **98**, not 97. True observation, wrong field name -- this
repo's signature failure mode, caught here by an adversarial subject-lens pass rather than by
re-reading.

**The `0xFF`-heavy back half is ECL event BIT-FLAG words.** Classifying Area1 slots by whether
CoK's own ECL text uses them with a power-of-two `0x2F AND` / `0x30 OR` gives 49 bit-op slots, of
which **32 (65%)** have popcount >= 5 in file B, against **30 of 141 (21%)** for the
ECL-referenced non-bit-op slots and 63 of 512 (12.3%) for the whole half-pool. **Label-shuffle
null, 2000 trials at n=49: mean 12.3%, max 29-31%, P(null >= 65%) = 0/2000.** Three denominator
caveats, all of which make the contrast *stronger* rather than weaker, stated because getting
them wrong is how this document's earlier figures went wrong:

- 49 + **141** = 190 distinct ECL-referenced Area1 slots. An in-flight draft said "130 non-bit-op
  (23%)", which does not close against its own 190; three independent re-derivations agree on 141
  and 21%.
- Reaching 190 requires resolving EclDump's *named* fields (`area1.inDungeon`, not
  `area1.word_1CC`) as well as `word_XXXX` operands. Counting only the latter gives 179, and one
  verifier nearly scored the finding refuted on that before spotting it.
- "512 slots" is Area1's **first 0x400 bytes**, not all of Area1: `0x800` bytes is **1024** u16
  slots, and over the true pool the baseline is 63/1024 = 6.2%. Every one of the 190 references
  falls in `0x180..0x3F0`, which is why the half-pool figure is the meaningful one -- but it has
  to be labelled as a half.

**The bit-flag evidence lives in `daxdump_extracted/ECL1_032.txt`, NOT `ECL3_097.txt`.** The
8-bit `AND`/`OR` sweeps for `area1.word_294` (file 661; A=0, B=254, C=0) and `area1.word_296`
(file 663; B=255) are at `ECL1_032.txt:230-397` and `:410-612`. An in-flight draft filed them
under `ECL3_097.txt` -- the file that legitimately carries region 2's *string* operands -- which
would have paired an area-1 block's evidence with an area-3 narrative. Recorded rather than
silently fixed: it is the second instance of that failure mode inside this one investigation.

**The all-odd parity signature is TAUTOLOGICAL for region 1, and the summary table's
"241 of 241" row has to be read with that.** Region 1 spans 318 even file offsets and 319 odd
ones (319 is the u16 *slot* count, not the even-offset count). **All 318 even bytes are `0x00` in
all three files**, re-derived here -- so an even-offset diff was not possible, and "every diff is
odd" restates "every stored value is < 256". Whole-file: exactly **1 of 2560** even offsets in
`[0,5119]` is nonzero, and it is `byte[0]`; in the trailer `[5120,5468]` it is **170 of 175**. The
parity signature is a property of the three word-structs, not of the file.

**The A-vs-C diff partition closes**, which the earlier "four stray singles outside region 1"
phrasing did not: 9 (region 1) + 2 (Area2: 3469 `word_58C`, 3523 `HeadBlockId`) + 10 (stru_1B2CA
text, 4697-4715) + 2 (gap: 5126, 5127) + 257 (trailer) = **280**. The "four" was four only after
silently dropping the ten text-buffer diffs.

**How the bases were forced, with the null.** Sweeping every candidate base under
value-plausibility constraints derived entirely OUTSIDE the save file (EclDump's own symbol
tables, the roster trailer's six entries, the retail DAX TOCs): **Area2 is UNIQUE at 1 of 3677
candidates** (= 2048, i.e. `COAB_SAVGAMA_AREA2_OFFSET = 2049`), which fixes Area1 at 1 by
contiguity. Area1's own sweep leaves 2 of 4445 (bases 0 and 3204), and the ECL-id tie-break
offered for it is **weaker than it looked**: at the rival base both candidate ids read 0 in all
three files, so it scores 0 of 0, not 0 of 2. Area2's uniqueness is the load-bearing half.

**Mutation-tested, including the null that actually matters.** Flipping `party_size` 6 -> 5 in an
in-memory copy collapses the Area2 sweep from `[2048]` to `[]`; setting `time_hour` to 99 drops
base 0 from the Area1 sweep. A full byte shuffle gives `[]` on 5 of 5 seeds. And the hard one: a
**parity-preserving** shuffle (odd bytes among odd offsets, even among even, so "every high byte
is 0x00" survives intact and only field identity is destroyed) also gives `[]` on 5 of 5 -- which
is the null that had to be run, because otherwise the parity signature alone could have been
doing all the work.

**Scope, stated as a fraction: this is CoK's 5469-byte file, 3 of the 9 `REAL_FILES`.** The six
DoK 2913-byte saves **do not** fit this layout, and that is measured rather than assumed: 2913
cannot hold 5121, and read at base 1 they give `inDungeon` in {0, 519} and `game_speed` in
{1, 512, 513}, i.e. nonzero high bytes where the model requires 0. (An in-flight draft quoted
`inDungeon = 1031` / `game_speed = 257` for this; those two digits occur at no base in any of the
six files and are withdrawn. The conclusion is unaffected -- it never rested on them.)
**DoK's Gen1 world-state layout remains open.**

**Still open after this, and not guessed at:** per-bit semantics of the 49 flag slots (mechanical
but not done); quest flags as distinct from event flags (nothing in EclDump's symbol table
separates them, and the FRUA hackdoc's separate quest array does not transfer); **gold**, which
corresponds to no named Area1/Area2 slot and is more likely in the `CHRDATA*.SAV` sidecars --
unverified, so not a finding; whether `lastXPos`/`lastYPos` are resume coordinates or a stale
"back up one step" pair (the field names say *last*, and distinguishing them needs a save taken
at a known map cell, i.e. a DOS run, not attempted); the 20-byte gap at `[5121,5140]`, whose
contents are `070d000000000000000100ffffffffffffffff06` and which holds two of the A-vs-C diffs;
and `stru_1B2CA`'s identity as a separate engine allocation versus a window onto something else.

**Provenance, and what I checked myself.** The structural derivation is an independent read-only
pass with three adversarial verifiers (1 of 3 scored it refuted, on arithmetic rather than on
structure; every correction that pass produced is folded in above rather than reported as an
open disagreement). I re-derived in my own script, from the retail bytes: the three file sizes,
the four named field values across A/B/C, `current3DMapBlockId`, `game_speed`, `game_area`,
`party_size`, `HeadBlockId`, `byte[0]` in 3 of 3, the 318 even offsets and their all-zero
content, the 280 A-vs-C diffs and their five-band partition, and the gap bytes. **I did not
re-run** the base sweeps, the label-shuffle nulls, the bit-op classification, or the mutation
tests; those are reported as measured by that pass, with its own denominators.

#### The reasoning of record, kept verbatim: "genuinely unresolved - do not extend the region-2 finding to it"

Region 1's odd bytes do **not** decode to coherent text. The first ~150 bytes (offsets 385–537ish)
contain small values in the same style as plausible event/quest counters — e.g. the run at
384–407 reads `7, 7, 0, 10, 13, 97, 0, 5, 0, 1, 26, 7` — while offsets roughly 640–1021 are
dominated by very different-looking bytes: long runs of `0xFF`, `0xFE`, `0x7F`, `0xDF` mixed with
occasional printable ASCII (`a`, `b`, `d`, `P`, `w`, `?`). That second sub-range does not read as
either "small numeric counters" or "coherent text" — it could be another leftover-buffer fragment,
a bitmask, or something else entirely. **This document does not claim region 1 is the same kind of
structure as region 2, and does not claim it is a genuine 16-bit numeric array either — both
remain open.** The one thing the evidence supports is the parity signature itself (odd-only), which
is necessary but not sufficient for either interpretation, exactly as the task's own framing
anticipated. Distinguishing (a) from (c) for region 1 specifically would need either the Amiga
sibling (not analyzed here — see the correction above) or a disassembly of the save/load routine
(same gap already named in "Unsolved" above, and still not attempted this pass).

Cross-checking against C: the nine scattered A-vs-C singles that fall inside region 1's span
(offsets 391, 393, 461, 481, 483, 485, 591, 625, 633) sit at the *same* odd offsets B differs at,
but with *different* small values (e.g. offset 391: A=0, B=10, C=1; offset 485: A=0, B=98, C=17).
This is consistent with region 1 (or at least its first sub-range) holding genuine per-playthrough
progress counters that both B and C advanced independently to different degrees, rather than
either file corrupting the other's positions arbitrarily — a point in favor of *some* of region 1
being real numeric state, without resolving the (a)-vs-(c) question for the bytes it cannot
explain (the 0xFF-heavy back half).

### 3. Roster table: "party swap" reading is REFUTED as literally stated

The task's supplied reading — "C is a PARTY SWAP of A" — does not hold at the `SAVGAMA.DAT` roster
level. Decoding all three files' roster tables shows **identical slot tags** in A, B and C:
`CHRDATA1, CHRDATA2, CHRDATA3, CHRDATA4, CHRDATA5, CHRDATA6`, in that order, in every file. Nothing
inside `SAVGAMA.DAT` itself reassigns which sidecar file backs which of the six active slots
between these three states (pinned in `test_cok_roster_tags_unchanged_despite_differential`).

What genuinely differs, and was confirmed by direct comparison rather than inferred: each state's
own `CHRDATA1.SAV` sidecar is a **distinct file** — three different SHA-1 hashes for the three
`CHRDATA1.SAV` files sitting alongside A's, B's and C's respective `SAVGAMA.DAT`
(`test_cok_states_have_genuinely_different_sidecar_character_data`). So the corrected reading is:
**A, B and C are three snapshots with the same roster-slot structure but different underlying
character data and different world-state progress** (different HP/XP/inventory in the sidecars,
different region-1/region-2 content in the world-state file) — not a reassignment of which
character occupies which slot. "Party swap" overstated what changed; "different save points with
independently-evolved character records" is the supported description.

### 4. `byte[0]` — still unnamed, now with a plausible (unverified) correlate

`byte[0]` (the very first byte of the file, an EVEN offset — unlike every confirmed region-1/2
difference, which is worth noting on its own: whatever layout convention applies to those regions
does not obviously extend back to byte 0) reads A=`0x01`, B=`0x03`, C=`0x01`. B is the file whose
region 2 captured a live NPC-encounter menu prompt; A and C, which do not show that combat/dialogue
text, share the value 1. This is consistent with `byte[0]` encoding a coarse game-mode flag (e.g.
"in an ECL menu/encounter" vs "normal exploration"), but with only three samples and two distinct
values, this is **noted as a plausible correlate, not a decoded field** — a fourth sample with a
third `byte[0]` value, or one without a live encounter but a nonzero byte[0], would be needed to
either strengthen or break this reading.

### 5. What this section does and does not establish

**Established, with a named oracle for each:**
- 3 distinct real CoK world-states exist in this checkout (byte-hash sweep of 147 candidates).
- Their exact pairwise byte-diff counts (536 / 280 / 414).
- Region 1 and region 2's diffs (241 of 241) land exclusively at odd file offsets — read with the
  tautology caveat in the summary table: region 1's 318 even offsets are all `0x00`, so no even
  diff could have occurred there.
- Region 2 is a one-byte-per-word text buffer holding a live snapshot of ECL area 3 block 97's
  menu-prompt structure `stru_1B2CA` — proven via an independent ECL bytecode dump, both in exact
  string content and exact field spacing.
- The roster table's slot tags do not change across A/B/C; the sidecar `CHRDATA*.SAV` files do.

**Explicitly left unsolved, not guessed at:**
- ~~Region 1's general structure (numeric array vs. some other leftover buffer)~~ **SOLVED
  2026-09-10** — it is the Gen1 Area1 host record's tail, and BOTH readings were partly right: the
  first sub-range is named numeric progress state, the `0xFF`-heavy back half is ECL event
  bit-flag words. See the region-1 section above.
- ~~Whether `byte[0]` is a real mode flag~~ **SOLVED 2026-09-10** — it is `gbl.game_area`, equal to
  `area2.game_area` in 3 of 3 CoK files.
- **DoK's Gen1 world-state layout**, which is NOT this one: the six 2913-byte DoK saves cannot
  hold `1 + 0x800 + 0x800 + 0x400 = 5121` and fail the model's high-byte constraints at base 1.
  Everything the region-1 section establishes is scoped to CoK's 5469-byte file, 3 of the 9
  `REAL_FILES`.
- Whether `stru_1B2CA` (or an equivalent word-per-character text buffer) is used generally across
  CoK's other ECL areas/blocks at a *fixed* file offset, or whether its position/width varies by
  which script last wrote to it. Nothing in this pass tested a second area's SAVE-string sequence
  against a differently-positioned save, so no general offset is claimed.
- Party position, gold, and most quest/event flags remain undecoded — region 2's contents are
  ECL *presentation* state (an on-screen menu), not the underlying game-progress variables the
  original task framing was most interested in.

## Verified vs assumed vs unsolved (summary)

| Claim | Status | Oracle |
|---|---|---|
| Trailer is 328 bytes, anchored to EOF, same in CoK and DoK | **Verified** | cross-file/cross-title byte comparison, 7 files |
| Trailer opens with a 6×41-byte roster table | **Verified** | cross-file byte comparison, 7 files |
| Roster tag = `CHRDAT<slot letter><1-6>`, letter matches own filename | **Verified** | self-consistency vs. real on-disk filenames, 4 distinct real filenames |
| Roster table caps at 6 even when more sidecar files exist | **Verified (1 sample)** | `More/.../SAVGAMA.PTY` (8 sidecar sets, 6 table entries) |
| Roster's 32 opaque bytes = cached file-handle/pointer state | **Assumed, unverified** | plausibility only |
| Header is a raw memory-segment snapshot, not a hand-authored struct | **Assumed, unverified** | ASCII-string inspection of the trailer tail (diagnostic, not proof) |
| CoK's larger header = larger per-module event-flag region | **Assumed, unverified** | size comparison only; no bit was decoded |
| `SAVGAM.TXT`'s early-offset fields apply to CoK/DoK | **Rejected** | direct byte read, 5 real files, all zero at all offsets |
| `SAVGAM.TXT` documents FRUA | **Rejected** | `UAFILES.TXT` states FRUA uses `.CSV`, a different container |
| Party position / gold / quest flags / campaign progress | **Split 2026-09-10: position and event flags LOCATED, gold and quest-vs-event still open** | position = `area1.lastXPos`/`lastYPos` (files 481/483, named by EclDump), though whether they are resume or stale-previous coordinates is unsettled; event flags = the 49 bit-op Area1 slots; **gold matches no named Area1/Area2 slot and is not located** — the `CHRDATA*.SAV` sidecars are the untested hypothesis |
| "No CoK differential pair exists in this checkout" | **RETRACTED — was FALSE** | 147-file hash sweep of the whole checkout (not `build/` alone — see correction in "Material used") |
| A CoK differential pair (in fact a 3-way set: A/B/C) exists | **Verified, live-snapshot count** | SHA-1 dedupe of 147 candidate files → 3 distinct states (whole-checkout, unrestricted-by-path sweep; `build/` alone gives a different total — see "Material used") |
| A-vs-B / A-vs-C / B-vs-C byte-diff counts are 536 / 280 / 414 | **Verified** | direct byte comparison, all 3 files |
| Regions 385–1021 and 4609–5083's A-vs-B diffs land only at ODD offsets (241/241) | **Verified, but TAUTOLOGICAL for region 1** | parity classification, mutation-proof included — however all **318** even file offsets in region 1 are `0x00` in all three files, so an even-offset diff was never possible there; the result restates "every stored value is < 256". Whole-file control: 1 of 2560 even offsets in `[0,5119]` nonzero (it is `byte[0]`) vs 170 of 175 in the trailer |
| Region 2 (4609–5083) is a word-per-character text buffer, not a numeric array | **Verified** | independent oracle: matches `daxdump_extracted/ECL3_097.txt`'s own SAVE-string operands, exact content AND exact field spacing |
| Region 1 (385–1021) is the tail of the Gen1 **Area1** host record at file offset 1 (record offsets `0x180..0x3FC`) | **Verified 2026-09-10** | `packages/engine/src/loaders/area1.ts:10-13,27-42`; `daxdump_extracted/EclDump.il`'s own `Area1Name`/`Area2Name` switch tables and address-space dispatcher; layout closes as `1 + 0x800 + 0x800 + 0x400 = 5121` + 20-byte gap + 328-byte trailer = 5469; Area2's base is UNIQUE at 1 of 3677 candidate bases under out-of-file constraints |
| The `0xFF`-heavy back half of region 1 holds ECL event **bit-flag** words | **Verified 2026-09-10, with its null** | 49 slots CoK's ECL uses with a power-of-two `0x2F AND`/`0x30 OR` are 65% high-popcount in file B vs 21% (30/141) for other ECL-referenced slots; label-shuffle null 2000 trials, mean 12.3%, P(null >= 65%) = **0/2000** |
| Region 1's first sub-range holds per-playthrough progress values | **Verified 2026-09-10** | four of its nine A-vs-C diffs are EclDump-named fields: `inDungeon` (461), `lastXPos` (481), `lastYPos` (483), `lastEclBlockId` (485) |
| File offset 394–395 (=97) is `area1.current3DMapBlockId` (Area1 `0x18A`) | **Verified 2026-09-10 — and RENAMED** | the observation was right and the field name was wrong: `lastEclBlockId` is a different field at `0x1E4` and reads **98** in the same file. Cross-oracle: file B's `game_area=3` with 97 and 98 both real `ECL3.DAX` TOC ids (null: 2.7% per random byte) |
| "C is a party SWAP of A" | **Refuted as stated** | roster slot tags identical (CHRDATA1-6) in A/B/C; corrected reading: sidecar `CHRDATA*.SAV` bytes differ per state, slot mapping does not |
| `byte[0]` is CoAB `gbl.game_area`, the byte stored immediately before the Area1 record | **Verified 2026-09-10** | `area1.ts:59-60`; `byte[0] == area2.game_area` (Area2 `0x624`, file 3621) in **3 of 3** CoK files (1/3/1). Supersedes the earlier "plausible ECL-menu/encounter mode correlate, unverified" reading |

## Files

- `tools/savgam_decode.py` — the reader. Exposes only what's listed "Verified" above as named
  fields; everything else is raw bytes plus diagnostic helpers, deliberately not field-named.
  **Added 2026-09-10:** `find_word_per_char_string()`, a search helper (not a fixed-offset field)
  for the word-per-character text encoding proven in the "CoK A/B/C world-state differential"
  section — deliberately not wired up as a named field, since the correspondence was only
  established for one save/region.
- `tools/test_savgam_decode.py` — pins against all **9** real files (denominator stated and
  checked; was 7 until 2026-09-10, when the CoK differential pair/set described above added
  `cok_diff_b` and `cok_diff_c`), with two dedicated mutation-proof tests
  (`test_roster_entry_pin_can_fail`, `test_trailer_offset_pin_can_fail`) that corrupt an
  in-memory copy, confirm red, then confirm green again on the restored bytes — plus a full
  end-to-end mutation run against the production module itself (flipping `TRAILER_SIZE` by 1
  turned 31 of 35 tests red; reverting restored all 35 green), run once during development and
  not committed as a permanent test (permanently mutating shipped source would defeat the tests
  it's supposed to protect). Non-mutation of the real source files is itself pinned
  (`test_sources_are_unmodified`, `test_sources_unmodified_since_collection`), comparing live
  `os.stat()` against a baseline captured at import time.
  **2026-09-10 additions**, all with their own mutation-proof twin or a documented one-off
  mutation run (see each test's docstring): `test_cok_three_way_differential_byte_counts` /
  `test_cok_three_way_differential_pin_can_fail`; `test_cok_world_state_regions_differ_only_at_odd_offsets`
  / `test_cok_world_state_region_parity_pin_can_fail`; `test_cok_b_world_state_text_matches_ecl3_097_dump`
  (skips if the git-ignored `daxdump_extracted/` is absent); `test_cok_roster_tags_unchanged_despite_differential`;
  `test_cok_states_have_genuinely_different_sidecar_character_data`. All three new numeric pins
  (536/280/414, 241, the `[40, 40, 30, 40]` spacing) were mutation-tested by hand during this
  edit — replaced with wrong values, confirmed 3 tests went red, restored byte-identically (SHA-256
  verified against the pre-mutation file) and confirmed all 50 tests green again.
