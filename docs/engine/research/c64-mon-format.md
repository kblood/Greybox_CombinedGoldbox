# C64 `MON<hex>` monster records: what the code actually reads (C1.6)

Status: **partially solved, with a load-bearing correction as of 2026-08-12.** Record length and
one graphics-pointer field are proven by disassembly and cross-checked against the retail disks.
The name field's location in the raw file (offset 0, ASCII, NUL-padded) is still true as a direct
observation of the bytes on disk. **But the "proof by consumer" claim in the original (2026-08-11)
version of this document is retracted**: `$2E9A`/`$2E49` — unreachable in the original pass because
they land inside `LIBRARY`, which nothing in this project could place — are now readable thanks to
the C1.9 kernel-origin breakthrough (`docs/engine/research/c64-resident-kernel.md`,
`docs/engine/research/c64-boot-chain.md`: `LIBRARY` is resident at `$2DC8` in both titles). Reading
them settles the task's central question and the answer is **no**: the traced consumer does **not**
read the raw `$4000` MON staging buffer at all. See §11 for the full disassembly. The DoK hp-offset
ambiguity (byte 40 vs byte 214 in the DOS 216-byte record — see
`packages/engine/src/loaders/monster.ts`) remains **NOT settled** — if anything, §11 makes it
*less* likely a mapping will ever be found this way, since the one consumer this project had
reached turned out to be unrelated to monster stats entirely.

**Second correction/extension, same day (§12):** the "29 CoK / 20 DoK naive-scan hits inside
`$4000`-`$41E0`" lead §11's own open-questions section left dangling turned out to rest on an
unexamined premise — that address window sits **entirely inside `LIBRARY`'s own proven-resident
body** ($2DC8-$4AD2 CoK / $2DC8-$4AF2 DoK), so it was never actually "outside `LIBRARY`" in the first
place. Re-derived with real control-flow tracing: CoK has 4 survivors (all ordinary intra-`LIBRARY`
subroutine calls), DoK has 0 — **but see the coverage correction in §12: DoK's 0 is an artifact of
a 0.8%-coverage trace, not a finding, and must not be cited as one.** The separate DoK `CODE00`
offset-122 lead is confirmed a byte-alias
false positive (it isn't even a `JSR`). A bounded search for the actual text-populating write (the
open question this task most wanted answered) found one new, unrelated screen-pointer consumer (a
`DUNGEON` cursor-blink write) but not a MON-text writer — **still open**, and now with a reason to
suspect the whole "$4000 residency" premise, not just the specific window. See §12.

**Third round, same day (§13), "mon-verify":** fixed the coverage gap §12 left open by widening
the trace seed set to a REAL inbound-call census (every genuine `JSR` from an established-code
file, across ALL disk sides, not just LIBRARY's own jump table) — both titles now reach ~38%
coverage (up from CoK 13.2% / DoK 0.8%), finding 22 CoK / 11 DoK survivors, ALL disassembled and
confirmed ordinary LIBRARY-internal references (subroutines or small fixed lookup tables, the
same table shapes at analogous addresses in both titles). An unrestricted (no code/data filter)
version of the same census produces a 12th DoK hit that is a confirmed false positive (reached via
a `JSR`-shaped byte pair inside a DATA file, `SPELLE66`, landing on the ASCII string "COMBAT2"
embedded in `LIBRARY`'s own dispatch-name table) — the reason the census is restricted to an
established-code allowlist. The `$2E84`/`$2E2D` caller census (previously side-1-only) was re-run
across all sides: CoK unchanged at 9 sites, DoK gains one new candidate (`PIC07` offset 1624)
that is confirmed a SECOND byte-alias false positive (an `ORA`, not a `JSR`); the real population
is unchanged for both titles. The `DUNGEON` cursor-blink write's cross-title gap is closed (DoK's
analog found and disassembled), but its reachability stays **genuinely unsettled** — a static
trace from DUNGEON's own entry point only covers ~6% of the file in either title, too little for
"not reached" to mean anything; the likely cause is an indirect/computed dispatch mechanism this
project's BFS tracer cannot follow by construction. A wider TARGET search (every established-code
file, all sides, for direct `$CC00`-`$CFFF` writes) finds one genuine new fact — `INIT` contains a
byte-identical-in-shape-across-titles border-draw + full-screen-clear routine — but still **no**
text-populating MON consumer. See §13.

**Fourth round, 2026-08-13 (§14):** closed a real rule-4 gap — every prior round's `$CC00`-range
search only recognized absolute-mode stores, never indirect-indexed (`STA (zp),Y`) ones, even
though the row-pointer helper's own output is read exactly that way. Fixing this finds `$4C`/`$4D`
is a general-purpose pointer (not screen-exclusive) and turns up a genuine new primitive — a
NUL-terminated string-copy routine, byte-identical in both titles, reached by real code including
**two direct calls from DoK's own `COMPREP`** (combat-encounter setup). Its destination and (for
DoK) its source pointer could not be resolved statically this round — reported as a specific,
named open lead, not a guess. The DoK hp @40-vs-@214 question is **still open**. See §14.

Date: 2026-08-11, corrected/extended 2026-08-12 (three times, §11, §12, then §13), extended again
2026-08-13 (§14). Files owned by this investigation:
`tools/c64_mon.py`, `tools/test_c64_mon.py`, this document. Tooling used: `tools/c64_disk.py` (disk
reader), `tools/c64_disasm.py` (6502 disassembler), `tools/c64_kernel.py` (LIBRARY body/origin
helpers, read-only reuse — not edited by this investigation), `tools/dax_decode.py` (DOS DAX block
decompressor, used only for cross-checking sizes/names, not for guessing C64 offsets). All
addresses below are re-derivable with:

```
python tools/c64_disasm.py <overlay-file> --org 0x0800 --start 0x0A00 --count 30
```

against the retail disk sides at `D:\Games\Emulator\C64\Goldbox\Champions of Krynn\Champions of
Krynn - Side 1.D64` and `...\Death Knights of Krynn\Death Knights of Krynn - Side 1.D64`
(overlays extracted with `tools/c64_disk.py --extract`).

## 1. The question this was asked to settle

`monster.ts`'s DoK layout pins hp at record offset 40, but notes bytes 40 and 214 are
byte-identical across all 64 DoK `MON1CHA.DAX` records (a documented "redundant-store" mirror
convention, matching CoK's own HD field mirror at 214/251). That makes the choice between 40 and
214 undetermined by statistics alone. The brief: find the 6502 routine that actually reads a
`MON<hex>` record and see which offset it touches.

**Result: the C64 record cannot answer this question directly**, because — as section 3 shows —
the C64 record is not the DOS record at a fixed shift; it is 480 bytes long regardless of title
(CoK DOS = 409, DoK DOS = 216), so "byte 40" and "byte 214" of the DOS record do not correspond
to fixed, known byte positions in the C64 record. Any consumer routine that touches C64-record
byte 40 would not, by itself, prove anything about DOS DoK byte 40 unless the mapping between the
two formats were independently established — which this pass did not manage to do (see §5).

## 2. Where I looked, and why those files

Per the scout handoff, `MON<hex>` records are consumed by the game engine somewhere during combat
encounter setup or the combat round loop. The candidate overlays available in this slice's extract
(`$0800`-origin, confirmed by the scout's structural self-jump test, treated as settled fact):

| File | Role (scout's guess) | Checked here |
| --- | --- | --- |
| CoK `COM.PREP` / DoK `COMPREP` | combat encounter setup, draws the combat screen | yes — this is where the name-field and sprite-pointer evidence in §3/§4 comes from |
| CoK `COMBAT` / DoK `COMBAT` | tactical combat engine | yes — searched for direct `$4000`-`$41FF` references (none found — see §5) and for HP-subtraction idioms (one candidate found and **refuted** — see §6) |
| `COMBAT2` | spell/message string table | ruled out early: it is >95% printable ASCII text with only a handful of <50-byte binary runs, i.e. data, not an independently-executed overlay (confirmed by the scout, re-confirmed by inspection here) |
| `GEN` | character generation | searched for direct `$4000`-range references (none found as real code — the two apparent hits are misdecoded ASCII text, same pitfall as §5) |

No literal ASCII `"MON"` filename-prefix string was found in any of the 28 named overlays (CoK's
13 + DoK's 15) — searched with a plain byte-substring grep, all hits are false positives
(`MONSTERS`, `MONEY`, directory-listing dumps). The `MON<hex>` filename must therefore be built
elsewhere (numeric-to-ASCII, or a table not in this slice's file set — candidates per the scout's
own leftover-leads list: `SOUNDFX`, `SPR.TP`, `TITLEPG`, none of which are in my slice).

## 3. FACT: record length is 480 bytes, not 409 or 216 — for BOTH titles

Measured directly from the retail Side-1 disks with `tools/c64_disk.py`:

```
python -c "
import sys; sys.path.insert(0,'tools')
import c64_disk as C
d = C.read_image(r'D:\Games\Emulator\C64\Goldbox\Champions of Krynn\Champions of Krynn - Side 1.D64')
e = {x.name: x for x in C.directory(d)}
data,_ = C.read_file_checked(d, e['MON01'])
print(len(data), len(data)-2)   # -> 482 480
"
```

All 14 CoK Side-1 `MON<hex>` files and all 22 DoK Side-1 `MON<hex>` files are **482 bytes on
disk = 2-byte C64 load address ($4000) + 480-byte payload**, with zero exceptions (pinned by
`test_mon_payload_length_is_480_for_every_{cok,dok}_side1_mon_file` in `test_c64_mon.py`).

Cross-checked against the DOS side's own `MON1CHA.DAX` (and, for the three CoK-only-recruitable
NPCs, `MON2CHA.DAX`) via `tools/dax_decode.py`, matching by the **decoded monster name**, not by
block-id (block ids are reused across different `MONnCHA.DAX` files for different rosters, so
name-matching is the only sound cross-reference):

| Title | DOS record length | C64 payload length | Delta |
| --- | ---: | ---: | ---: |
| CoK | 409 | 480 | **+71** |
| DoK | 216 | 480 | **+264** |

This is proven for the full available roster: 14/14 CoK names (`test_cok_delta_is_71_bytes_...`)
and 22/22 DoK names (`test_dok_delta_is_264_bytes_...`), every single one landing on exactly the
delta shown above — not a fitted average.

**Correction this raises for `tools/c64_disk.py`'s own docstring** (out of this investigation's
file-ownership slice, reported rather than edited): that module's `load_address()` docstring
states "A DOS `.DAX` block and its C64 counterpart are byte-identical from offset 2 onward." That
claim does **not** hold for the `MON` family — the two are different lengths entirely (see the
table above), let alone byte-identical. The claim is verified true for other block types
elsewhere in the project (e.g. `GEO`); it simply doesn't generalize to `MON`. Whoever owns
`c64_disk.py` should scope that docstring claim, or note the `MON` exception.

## 4. FACT: name lives at payload offset 0, no length-prefix byte

> **Correction, 2026-08-12 (see §11 for the full trace):** this section's original framing claimed
> the loop quoted below "confirms as more than an inspection coincidence" that offset 0 is the name
> field. **That claim is withdrawn.** `$2E9A`/`$2E49` are now readable (they land inside `LIBRARY`,
> resident at `$2DC8` in both titles — see `docs/engine/research/c64-resident-kernel.md`), and
> tracing them shows the loop below operates on **VIC-II screen memory** (`$CC00 + row*40`, paired
> with color RAM at `$D800 + row*40`), not on the raw `$4000` MON buffer. The loop is a general
> "blank any non-text screen code" pass reused, byte-for-byte, by three unrelated overlays
> (`COM.PREP`/`COMPREP`, `DUNGEON`, `INIT`) — it has nothing MON-specific about it. **The name at
> offset 0 is still real** (directly observed on disk, independent of this loop), but this loop is
> no longer evidence for it. Do not re-cite this section's loop as consumer proof of the name field.

The DOS record's own name field is `u8 name_length` at offset 0, then up to 15 ASCII bytes at
offset 1 (`monster.ts` `NAME_OFFSET = 1`). The C64 record's leading bytes for the same monster (by
direct inspection, e.g. CoK `MON01` = BAAZ) read `42 41 41 5A 00 00 ...` — i.e. `"BAAZ"` starting
at **offset 0**, no length byte.

**(2026-08-11 reasoning, now retracted — kept for the historical record, see the box above):**
This was originally read as more than an inspection coincidence, because of a real consumer: **CoK
`COM.PREP` ($0800+$0A0F–$0A26) and DoK `COMPREP` ($0800+$0A15–$0A2A) both run a byte-for-byte
identical loop** (differing only in the `JSR` target — CoK calls `$2E9A`, DoK calls `$2E49`, both
addresses outside every $0800-resident overlay available to the 2026-08-11 pass, so their own
bodies were unresolved at the time):

```
CoK COM.PREP, $0800+$0A0A .. $0A26 (from tools/c64_disasm.py --org 0x0800 --start 0x0A00):
  0A0A  A9 18      LDA #$18
  0A0C  8D CD 03   STA $03CD          ; outer loop counter = 24 (0x18)
  0A0F  20 9A 2E   JSR $2E9A          ; sets zp $4E/$4F -- body NOT in this overlay set
  0A12  A0 27      LDY #$27           ; Y = 39
  0A14  B1 4E      LDA ($4E),Y
  0A16  C9 40      CMP #$40
  0A18  90 04      BCC $0A1E
  0A1A  A9 20      LDA #$20           ; replace with space
  0A1C  91 4E      STA ($4E),Y
  0A1E  88         DEY
  0A1F  10 F3      BPL $0A14          ; loop Y = 39 downto 0  (40 bytes: offsets 0..39)
  0A21  CE CD 03   DEC $03CD
  0A24  10 E9      BPL $0A0F          ; repeat for all 24 (0x18) combatant slots
  0A26  60         RTS

DoK COMPREP, $0800+$0A10 .. $0A2A -- identical shape, JSR $2E49 instead of $2E9A:
  0A10  A9 18      LDA #$18
  0A12  8D CD 03   STA $03CD
  0A15  20 49 2E   JSR $2E49
  0A18  A0 27      LDY #$27
  0A1A  B1 4E      LDA ($4E),Y
  0A1C  C9 40      CMP #$40
  0A1E  90 04      BCC $0A24
  0A20  A9 20      LDA #$20
  0A22  91 4E      STA ($4E),Y
  0A24  88         DEY
  0A25  10 F3      BPL $0A1A
  0A27  CE CD 03   DEC $03CD
  0A2A  10 E9      BPL $0A15
  0A2C  60         RTS
```

Reading this as "sanitize a 40-byte text field" is the natural interpretation (any byte $40 or
above — not a valid uppercase-PETSCII/space character — is blanked to a space), and it is called
24 times per invocation, matching a plausible max combat roster (party + monsters). **What this
does NOT prove**: that the buffer `($4E)` points at is the raw `$4000` `MON<hex>` load buffer
itself, as opposed to a per-combatant working copy elsewhere. `$2E9A`/`$2E49` — the routine that
sets `$4E`/`$4F` — is not covered by any $0800-resident overlay file in this slice (every one of
the eight overlays' own `[org, org+filelen)` range falls short of `$2E9A`), so the pointer's
ultimate target is **open**. See §7.

## 5. FACT: neither COM.PREP/COMPREP nor COMBAT touches `$4000`-`$41FF` by direct address

A proper (instruction-stream-following, not linear-byte-scan — see the appendix on a scanning
pitfall below) disassembly of CoK `COM.PREP`, DoK `COMPREP`, CoK `COMBAT`, and DoK `COMBAT`,
filtered for absolute/absolute-indexed operands in `$4000`-`$41FF` (the exact span the 480-byte
buffer would occupy if loaded at its stored `$4000` load address), found:

* CoK `COM.PREP`: one apparent hit, `$0800+$1614: EOR $4142`. **This is a false positive**: the
  bytes at that address are the ASCII string `"COMBAT2"` (an overlay filename embedded as data in
  COM.PREP, used by its own overlay-loader string table — see the sibling `LIBRARY` filename table
  documented by the scout), not a real instruction. Confirmed by reading the surrounding bytes as
  text: `...COMBAT2\x00SPELLE66\x00...`.
* DoK `COMPREP`, CoK `COMBAT`, DoK `COMBAT`: **zero** hits.

**Pitfall recorded for whoever extends this**: a naive linear byte-scan (checking every byte
offset as a candidate opcode, ignoring real instruction boundaries) produces many more "hits" —
9 in CoK `COM.PREP` alone — but every one is spurious, an artifact of decoding mid-instruction or
mid-string bytes as if they were opcodes. The scout's own handoff already flagged this exact
failure mode for `hwscan.py`/`COMBAT2`; it recurs here for the same reason. Only trust hits from a
scan that starts at a known entry point (`pc=0` for these `$0800`-origin overlays, since the
scout's structural self-jump test pins that origin) and walks the *real* instruction stream.

**Interpretation**: if the record really is loaded to `$4000` and its stat fields feed the combat
engine, that engine reads them exclusively through zero-page-indirect addressing (as seen for the
name field in §4) rather than hardcoded absolute addresses — and the routines that do so are not
included in this slice's overlay extraction.

## 6. A plausible HP-subtraction idiom, found and then REFUTED — recorded so it isn't re-found

DoK `COMBAT` contains a clean read-modify-write idiom:

```
$0800+$227A .. $2281:
  227A  AD 74 7C   LDA $7C74
  227D  38         SEC
  227E  ED 60 A8   SBC $A860
  2281  8D 74 7C   STA $7C74
  2284  B0 03      BCS $2289
  2286  CE 75 7C   DEC $7C75
```

This *looks like* `hp -= damage; hp = max(0, hp)` (subtract, store back to the same address,
borrow-clamp). It was the strongest HP candidate found in this pass. **It does not hold up**: CoK
`COMBAT` references the *same* address pair `$7C74`/`$7C75` at `$0800+$2865`/`$286A`, but there
they are `INC`remented as a **counter**, immediately after `ORA #$10` sets a bit on a per-combatant
record at `$4D80,X` — reading in context, this is a "number of active paralysis effects" counter
being bumped alongside setting a paralyzed flag, not anything related to hit points:

```
$0800+$285F .. $286D (CoK COMBAT):
  285F  98         TYA
  2860  09 10      ORA #$10
  2862  9D 80 4D   STA $4D80,X        ; set bit 0x10 on combatant X's record
  2865  EE 74 7C   INC $7C74          ; bump a 16-bit counter ($7C74/$7C75)
  2868  D0 03      BNE $286D
  286A  EE 75 7C   INC $7C75
```

Since `$7C74` is provably a non-HP counter in CoK, and CoK/DoK are the same engine sharing a
global-flags convention (per the scout's own `$7Exx`-`$7Fxx` shared-globals note), the DoK
`$227A` instance is almost certainly the same counter, not HP, despite superficially matching the
subtract-and-store shape. **Withdrawn as an HP candidate.** Recorded here specifically so a future
pass does not waste time re-discovering and re-believing it — this project's own standing rule is
that a plausible-looking fit is not evidence without cross-checking, and this is exactly that
cross-check catching a near-miss.

## 7. FACT: record offset 0xCB (203) feeds a graphics-pointer parameter, in both titles

While tracing where a `$4000`-based pointer might be built (looking for the provenance of `($4E)`
from §4), a different, fully self-contained finding turned up: **both** CoK `COM.PREP` and DoK
`COMPREP` write a literal pointer value `$40CB` (= `$4000 + 0xCB`) into a fixed `$0600`-based
parameter block, immediately before other writes to that same block that match the shape of the
"caller-supplied parameter block" the scout's own handoff already proved GDRIVE01 (the sprite
compositor) reads from `$C083`/`$C087`/`$C08B`:

```
CoK COM.PREP, $0800+$149C .. $14A3:
  149C  A9 CB      LDA #$CB
  149E  8D 05 06   STA $0605
  14A1  A9 40      LDA #$40
  14A3  8D 06 06   STA $0606

DoK COMPREP, $0800+$14C0 .. $14C7 -- identical shape, same literal bytes:
  14C0  A9 CB      LDA #$CB
  14C2  8D 05 06   STA $0605
  14C5  A9 40      LDA #$40
  14C7  8D 06 06   STA $0606
```

The 16-bit little-endian value stored at `$0605`/`$0606` is literally `$40CB`. Since `$4000` is
the C64's fixed staging-buffer load address for essentially every asset in this corpus (per
`c64_disk.py`'s own documented `load_address()` finding), this is a pointer into "whatever was
last loaded at `$4000`, offset 0xCB (203) onward" being handed off toward the sprite compositor.
**Fact proven**: record offset 203 is treated as (part of) graphics-pointer data during combat
setup, in both titles, at matching code addresses. **Not proven**: what exactly lives at offset
203 (a sprite bitmap? an index into a shared sprite table? a second-level pointer?) — that would
need tracing into the `$0600`-block's eventual consumer (likely `GDRIVE01`, whose own `$C08x`
parameter-read side is already documented by the scout, but the intermediate `$0600`→`$C08x` copy
step is not in this slice's file set either).

This is consistent with, and offers a plausible explanation for, the size delta in §3: the C64
record folds in graphics/sprite-pointer material that the DOS release keeps in separate `SPRIT`
files. It is NOT a full explanation (71 vs. 264 extra bytes for CoK vs. DoK is a big spread for a
single pointer field), so treat it as one located fact, not a complete accounting of the extra
bytes.

## 8. What `tools/c64_mon.py` exposes, and why it stops there

Per this slice's brief ("fields the code does not prove must be absent or explicitly marked
unproven"), `tools/c64_mon.py`'s `MonRecord` exposes only:

* `raw` — the full 480-byte payload, always.
* `name` — decoded from offset 0 (raw-byte observation, §4; **no longer claimed to be
  consumer-proven**, see §11).

It exposes `MON_PAYLOAD_LENGTH = 480`, `NAME_OFFSET = 0`, `NAME_SCRUB_LENGTH = 40` (now documented
as a *scan bound*, not a proven record-field length — see §11), and
`SPRITE_POINTER_FIELD_OFFSET = 0xCB` as named, cited constants, but does **not** add `hp`, `ac`,
`thac0`, `saves`, `hitDice`, `category`, `damage`, `xp`, or `morale` fields — none of those are
proven by any instruction found in this pass, and guessing them in would repeat the exact mistake
this task was dispatched to avoid.

## 9. Verdict against `packages/engine/src/loaders/monster.ts` (report only — not edited here)

* **CONFIRMS**: nothing in `monster.ts`'s DOS-side offset tables directly, since the C64 record is
  a structurally different, longer format (see §3) and no C64 code path was found that reads the
  DOS-analog offsets.
* **CONTRADICTS**: nothing directly asserted in `monster.ts` is shown wrong by this pass — but see
  the `c64_disk.py` docstring correction in §3 (a related, adjacent file's claim, not
  `monster.ts`'s).
* **LEAVES UNTOUCHED**: the DoK hp @40-vs-@214 question is exactly as open as it was before this
  pass. The C64 corpus cannot settle it with the files available here, and — importantly — even a
  proven C64-record hp offset would need an independently-proven DOS↔C64 field-mapping (which this
  pass could not establish beyond the name field) before it could be used to disambiguate the DOS
  offset. Do not use "byte 40 of the C64 record" as a proxy for "byte 40 of the DOS record" without
  that mapping — they are different formats (§3).

## 10. Open questions / concrete next steps

1. ~~**Resolve `$2E9A`/`$2E49`**~~ **DONE, 2026-08-12 — see §11.** Answer: `($4E)` does **not**
   point at the raw `MON<hex>` buffer; it points at VIC-II screen memory. This closes the
   load-bearing question this document was originally built around, but the answer is negative —
   it does not unlock further MON field tracing, it retires this particular lead. See §11 for the
   concrete new open items this trace produced instead (the still-unidentified routine that
   populates the `$CC00` screen rows with actual text, and the still-unexplained `$4000`-`$41E0`
   byte-scan hits inside `LIBRARY` that were not verified against real instruction boundaries).
2. **Trace the `$0600`→`$C08x` copy** to confirm what record offset 203 actually feeds (§7)
   — likely inside `GDRIVE01` itself (already partly documented by the scout) or a short glue
   routine between `COM.PREP`/`COMPREP` and `GDRIVE01`.
3. **Account for the size delta.** 71 extra bytes (CoK) vs. 264 extra bytes (DoK) for what is
   supposedly "the same 480-byte record shape" is a real oddity worth its own pass: either the
   *stat* portion of the layout also differs in length between the two titles (unlike the DOS
   side, where CoK's 409-byte record is genuinely bigger than DoK's 216-byte one for unrelated
   reasons — full character scratch fields vs. a compact monster-only record), or a meaningful
   fraction of the "extra" bytes are unused padding. Worth a byte-level unused/zero-run census
   across the full 480-byte record for many monsters of each title (a real measurement, not a
   layout-fitting exercise).

## 11. 2026-08-12: `$2E9A`/`$2E49` resolved — they point at screen memory, not the MON buffer

**Unblocked by the C1.9 kernel-origin breakthrough.** `docs/engine/research/c64-resident-kernel.md`
and `docs/engine/research/c64-boot-chain.md` (both dated 2026-08-12) proved `LIBRARY` — an ordinary
directory file on both titles' side-1 disks — is relocated at load time to `$2DC8` (both titles
identically), rather than to the `$4000` its own PRG header claims. `$2E9A` (CoK) and `$2E49` (DoK)
both fall inside that range, so they are now readable. This section is the load-bearing trace this
whole document exists to run.

### 11.1 `$2E9A` (CoK) / `$2E49` (DoK): a two-line wrapper, not a mystery

Disassembling `LIBRARY` at `org=$2DC8` (`python tools/c64_disasm.py <LIBRARY.prg> --org 0x2DC8
--start 0x2E9A --count 5`, and the DoK equivalent at `--start 0x2E49`):

```
CoK $2E9A:                          DoK $2E49:
  2E9A  AD CD 03   LDA $03CD          2E49  AD CD 03   LDA $03CD
  2E9D  20 84 2E   JSR $2E84          2E4C  20 2D 2E   JSR $2E2D
  2EA0  85 4E      STA $4E            2E4F  85 4E      STA $4E
  2EA2  86 4F      STX $4F            2E51  86 4F      STX $4F
  2EA4  60         RTS                2E53  60         RTS
```

`$03CD` is the caller's own loop-index variable (see §4's quoted loop: `LDA #$18; STA $03CD`, then
decremented once per iteration). Both titles pass that index into a helper — `$2E84` (CoK) /
`$2E2D` (DoK) — and store its returned `(A, X)` into `$4E`/`$4F`. The interesting work is in the
helper, not this wrapper.

### 11.2 `$2E84` (CoK) / `$2E2D` (DoK): a row-address calculator, not a record indexer

```
CoK $2E84 (org $2DC8, body offset 188):        DoK $2E2D (org $2DC8, body offset 101):
  2E84  A2 28      LDX #$28                      2E2D  A2 28      LDX #$28
  2E86  20 07 30   JSR $3007                      2E2F  C9 18      CMP #$18
  2E89  85 A3      STA $A3                         2E31  90 02      BCC $2E35
  2E8B  8A         TXA                             2E33  A9 18      LDA #$18
  2E8C  69 D8      ADC #$D8                        2E35  20 B0 2F   JSR $2FB0
  2E8E  85 A4      STA $A4                         2E38  85 A3      STA $A3
  2E90  8A         TXA                             2E3A  8A         TXA
  2E91  6D 88 02   ADC $0288                        2E3B  69 D8      ADC #$D8
  2E94  85 4D      STA $4D                          2E3D  85 A4      STA $A4
  2E96  AA         TAX                              2E3F  8A         TXA
  2E97  A5 4C      LDA $4C                          2E40  6D 88 02   ADC $0288
  2E99  60         RTS                              2E43  85 4D      STA $4D
                                                     2E45  AA         TAX
                                                     2E46  A5 4C      LDA $4C
                                                     2E48  60         RTS
```

(DoK adds a clamp — `CMP #$18; BCC ...; LDA #$18` — capping the index at 24 before the multiply;
CoK has no such clamp. A real, minor cross-title difference, noted but not chased further.)

`$3007` (CoK) / `$2FB0` (DoK) is a standard NMOS 6502 shift-and-add unsigned 8x8→16 multiply
(`LDX #$07`/8 iterations of `LSR`/conditional-`ADC`/`ROR A`/`ROR $4C`), returning the 16-bit product
as `A`=low, `X`=high, and *also* leaving it at zero page `$4C`/`$4D`. So `$2E84`/`$2E2D` compute
`index * $28` (**40**, decimal) once, then build **two** pointers from that one product by adding
two different bases:

* `($A3, $A4) = $D800 + index*40` — the low byte is the raw product's low byte (`STA $A3`
  unconditionally); the high byte is `product_hi + $D8` (`ADC #$D8` with carry clear, since the
  multiply routine's own `RTS` always executes `CLC` first).
* `($4C, $4D)` → returned as `(A, X)` → stored by the caller into `($4E, $4F)` = `(value-of-$0288)
  *0x100 + index*40`. `$0288` is not a fixed literal — see §11.3, it is set at runtime to `$CC`.

`$28` = 40 decimal — not a plausible per-monster record size (the record is 480 bytes, §3), and not
the 216/409-byte DOS record size either. It **is** the C64's standard screen width: 40 columns.
That is the first hint this is not record indexing at all.

### 11.3 `$0288` is set to `$CC` by a VIC-II bank/screen-address routine, byte-identical in both titles

Only one write site to `$0288` exists in either title's `LIBRARY` (checked with a full
`STA $0288` byte scan over the whole file, both titles — zero other write sites found anywhere in
either title's `LIBRARY`):

```
CoK LIBRARY $3B2C-$3B4E (34 bytes):             DoK LIBRARY $3A98-$3ABA (34 bytes, byte-identical):
  3B2C  A9 03      LDA #$03                        3A98  A9 03      LDA #$03
  3B2E  0D 02 DD   ORA $DD02                        3A9A  0D 02 DD   ORA $DD02
  3B31  8D 02 DD   STA $DD02                        3A9D  8D 02 DD   STA $DD02
  3B34  AD 00 DD   LDA CIA2_PORTA                   3AA0  AD 00 DD   LDA CIA2_PORTA
  3B37  29 FC      AND #$FC                         3AA3  29 FC      AND #$FC
  3B39  8D 00 DD   STA CIA2_PORTA                   3AA5  8D 00 DD   STA CIA2_PORTA
  3B3C  A9 34      LDA #$34                         3AA8  A9 34      LDA #$34
  3B3E  8D 18 D0   STA VIC_MEMPTR                   3AAA  8D 18 D0   STA VIC_MEMPTR
  3B41  A9 10      LDA #$10                         3AAD  A9 10      LDA #$10
  3B43  0D 16 D0   ORA VIC_CTRL2                    3AAF  0D 16 D0   ORA VIC_CTRL2
  3B46  8D 16 D0   STA VIC_CTRL2                    3AB2  8D 16 D0   STA VIC_CTRL2
  3B49  A9 CC      LDA #$CC                         3AB5  A9 CC      LDA #$CC
  3B4B  8D 88 02   STA $0288                        3AB7  8D 88 02   STA $0288
  3B4E  60         RTS                              3ABA  60         RTS
```

This is a textbook C64 VIC-II bank/screen-address select, and its own bytes prove the resulting
screen base arithmetically, no execution needed:

* `CIA2_PORTA` (`$DD00`) bits 1:0 select which 16K bank of the address space the VIC-II chip reads
  video data from (inverted 2-bit field). `AND #$FC` clears both bits to `00`, which selects **bank
  3** ($C000-$FFFF).
* `VIC_MEMPTR` (`$D018`) bits 7:4 select the screen-memory offset *within* that bank, in units of
  `$400`. The stored value is `$34` = `0011 0100` — bits 7:4 = `0011` = 3, so the screen offset is
  `3 * $400 = $0C00`.
* Combined: screen base = bank base + offset = `$C000 + $0C00 = $CC00`.

The routine's own next instruction, `LDA #$CC; STA $0288`, caches exactly that computed high byte
for later use — an internal, self-consistent, code-cited proof of `$CC00` that does not depend on
running anything, only on the CIA2/VIC-II register semantics being read correctly.

**Caller check (both titles, methodology rule 2):** `find_callers` shows this routine is called
from inside `LIBRARY` itself and from `INIT`, at the *same* body offset (**143**) in both titles'
`INIT` files:

```
CoK: {15148: [('LIBRARY', 87), ('INIT', 143)]}     # 15148 = 0x3B2C
DoK: {15000: [('LIBRARY', 6),  ('INIT', 143)]}      # 15000 = 0x3A98
```

### 11.4 Conclusion: `($4E)` points at VIC-II screen memory (with a color-RAM sibling), not `$4000`

Putting §11.1-11.3 together: `$4E`/`$4F` = `$CC00 + row*40` (VIC-II screen memory, row = the
caller's loop index), and `$A3`/`$A4` = `$D800 + row*40` (Color RAM, the fixed, always-mapped 1KB
region that pairs 1:1 with any C64 screen memory location regardless of VIC bank) for that exact
same row. `1024 / 40 ≈ 25.6`, so the up-to-25-row range this addressing supports fits neatly inside
Color RAM's fixed 1KB span — another small, independent consistency check.

**This directly answers the task's central question: MON fields are not read from the raw `$4000`
staging buffer by this code path — full stop.** The buffer the traced consumer touches is unrelated
screen/color memory for a secondary VIC-II display, addressed by *screen row*, not by *MON record
index*. Three additional facts rule out even a loose "row = combatant slot" record-adjacent
reading:

1. **The scrub loop's own byte-value test only makes sense for C64 screen codes, not ASCII.** The
   loop keeps bytes `< $40` and blanks bytes `>= $40`. C64 screen-code space places `A`-`Z` at
   `$01`-`$1A` and digits/space/punctuation below `$40`; the `$40`-`$7F` range is graphics/block
   characters. ASCII, by contrast, places `A`-`Z` at `$41`-`$5A` — **entirely inside the "blank it"
   range**. If this buffer held the raw ASCII name bytes actually observed on disk (`"BAAZ"` =
   `42 41 41 5A`), this loop would blank every letter of every name, leaving nothing but spaces.
   The loop only makes sense as "remove stray graphics-mode screen codes from already-rendered
   text," which is a screen-memory operation by construction, not a text-buffer operation.
2. **The same loop, byte-for-byte identical (differing only in the `JSR` operand), is called from
   three unrelated overlays**: CoK `COM.PREP`/DoK `COMPREP` (combat setup), `DUNGEON` (exploration),
   and `INIT` (character/game init) — confirmed via `find_callers`, same three names in both titles:
   `{('DUNGEON', ...), ('COM.PREP'/'COMPREP', ...), ('INIT', ...)}`. All three call sites use the
   identical constant loop count `LDA #$18` (24), regardless of context — not "however many
   combatants are actually present." A generic "scrub whatever's on this alternate screen" utility
   reused across game modes is a far better fit than anything MON-specific.
3. **`$2E84`/`$2E2D` has other callers with no relation to monster records at all.** `GDRIVE02`
   (the picture-blit graphics driver) calls it once (`$0800`-relative offset in `GDRIVE02`'s own
   body) to draw a single cursor/marker glyph (`LDA #$2B` — screen code `$2B`, a cursor-like glyph —
   via the store-via-pointer utility `$30E2`, which also writes `$0286`, the KERNAL's *current text
   color* zero-page variable, into the paired Color RAM pointer — yet more confirmation this is a
   screen+color pair, not record data). And inside `LIBRARY` itself, another `$2E84` call site
   (body offset 110/127, `$2E36`-`$2E5B`) copies a byte range between two rows of *both* buffers in
   lockstep (used for shifting/reordering rows — a scrolling or roster-reflow operation), again with
   nothing tying it to the `$4000` MON staging buffer.

   > **Corrected 2026-08-12 — this listed 2 call sites and read as if that were all of them.**
   > It is not. `find_callers` over the full side-1 body set returns, for `$2E84` (CoK): **eight**
   > LIBRARY-internal sites, at body offsets 110, 127, 170, 213, 444, 506, 684 and 3400 (offset
   > 213 is the `$2E9A` wrapper documented in §11.2), plus `GDRIVE02`. DoK's `$2E2D` mirrors it
   > exactly — offsets 23, 40, 83, 132, 368, 419, 613, 3252, plus `GDRIVE02`, **plus a `CODE00`
   > hit at offset 122 that this document never mentioned**. So the real population is ~9-10
   > sites per title, and the text above generalised from roughly 2 of them.
   >
   > **The negative conclusion survives**, and that is why this is a scoping correction rather
   > than a retraction: the five previously-unexamined CoK sites (170, 444, 506, 684, 3400) were
   > disassembled during the correction and none references `$4000` either — all reuse the same
   > `$CC00`/`$D800` row-pointer machinery. The DoK `CODE00` hit is **unverified**: it falls in
   > what looks like a sequential data/lookup table rather than an instruction stream, i.e. a
   > likely byte-alias false positive, and it has not been alignment-checked. Do not cite it as
   > a caller until someone does.
   >
   > What was actually wrong here was the word "swept". A two-site sample presented with
   > exhaustive-sounding phrasing ("neither is a plausible…") is the same failure mode this
   > project hit in `c64-resident-kernel.md`'s origin sweep: too few samples, stated too
   > confidently. The remaining honest gap is unchanged — nothing yet found writes text *into*
   > those screen rows from the MON buffer.

**What remains open**, honestly, after this trace: something must still write actual name/text
*into* these screen rows before the scrub cleans them up — that populating step (which, if it reads
`MON<hex>` data at all, is the one candidate that could still connect this trace back to the raw
record) was **not located** in this pass. A first-pass, unverified byte scan (not instruction-
stream-following, so per this project's own standing pitfall it is **not trustworthy as-is**) found
29 (CoK) / 20 (DoK) raw absolute-operand byte matches inside `$4000`-`$41E0` across `LIBRARY`'s
whole body; none were checked against real instruction boundaries or entry points, so none are
reported as findings — flagged here only as an unverified lead for whoever next reads `LIBRARY`'s
interior with a proper control-flow trace.

### 11.5 Net effect on `tools/c64_mon.py` and the DoK hp question

* `NAME_OFFSET = 0` stands, but now rests **only** on direct inspection of the raw file bytes (§4),
  not on any consumer proof — the consumer this document originally cited does not touch the raw
  buffer at all (§11.1-11.4).
* `NAME_SCRUB_LENGTH = 40` is retained in the module purely as the practical stop-scanning bound it
  always functioned as (real names terminate at NUL well before 40 bytes in every observed record,
  so the bound rarely binds) — but it is now documented as **not** a proven MON-record field length;
  the `$28`=40 constant it was copied from is the C64's screen width, an unrelated coincidence.
* The DoK hp @40-vs-@214 question is **still open**. This trace does not narrow it — if anything it
  removes the one lead (a supposed record-reading consumer) that might eventually have connected a
  C64 code path to a DOS-record byte offset. No new candidate consumer was found in this pass.

Reproduce every claim in this section:

```
python tools/c64_disasm.py <LIBRARY CoK, org $2DC8> --org 0x2DC8 --start 0x2E84 --count 20
python tools/c64_disasm.py <LIBRARY DoK, org $2DC8> --org 0x2DC8 --start 0x2E2D --count 20
python tools/c64_disasm.py <LIBRARY CoK> --org 0x2DC8 --start 0x3B2C --count 12   # VIC setup
python tools/c64_disasm.py <LIBRARY DoK> --org 0x2DC8 --start 0x3A98 --count 12   # VIC setup
python -c "import sys; sys.path.insert(0,'tools'); import c64_kernel as k
print(k.find_callers(k.read_bodies(k.load_side1('cok')), [0x2E9A, 0x3B2C]))
print(k.find_callers(k.read_bodies(k.load_side1('dok')), [0x2E49, 0x3A98]))"
```

or run `python -m pytest tools/test_c64_mon.py -v` (the `ScreenMemoryNotMonBufferTests` class pins
the byte sequences and caller sets quoted above against the real disks).

## 12. 2026-08-12 "mon-populate" round: re-deriving the two leftover leads, and the TARGET question

Scoped brief for this round: re-derive lead (a) — the naive linear byte scan that found "29 (CoK) /
20 (DoK) absolute-operand matches inside `$4000`-`$41E0` across `LIBRARY`'s whole body" — with real
control-flow-following disassembly, and settle lead (b) — the unverified `CODE00` hit at DoK body
offset 122. Also make a bounded attempt at the round's actual TARGET: find what writes text INTO the
`$CC00` screen rows before the scrub loop (§11) cleans them.

### 12.1 Root-cause finding: the scanned window is not external to `LIBRARY` at all

Before re-deriving anything, a sanity check the prior round skipped: is `$4000`-`$41E0` even a
window *outside* `LIBRARY`'s own body? **No.** `LIBRARY`'s proven-resident span (per
`c64-resident-kernel.md`: `KERNEL_ORIGIN = $2DC8`, length from the file's own size) is:

```
CoK LIBRARY: $2DC8-$4AD2  (7435 bytes, org=$2DC8=11720, end=$2DC8+7435-1=$4AD2=19154)
DoK LIBRARY: $2DC8-$4AF2  (7467 bytes, org=$2DC8=11720, end=$2DC8+7467-1=$4AF2=19186)
```

Both ranges **entirely contain** `$4000`-`$41E0`. And the window's own width is a tell:
`$41E0 - $4000 = 0x1E0 = 480` decimal — **exactly `MON_PAYLOAD_LENGTH`**. The window was clearly
picked by reasoning "if a MON payload sits at $4000, its 480 bytes span $4000-$41E0" — a reasonable
hypothesis on its own — but its placement was never cross-checked against `LIBRARY`'s own address
range, proven in a *sibling* investigation the same day. Once cross-checked, the hypothesis behind
the window collapses: **any absolute operand a `LIBRARY` routine has that lands in `$4000`-`$41E0` is
indistinguishable, by address alone, between "this references the external MON staging buffer" and
"this references another part of `LIBRARY`'s own resident body"** — the two occupy the identical
address range. This is a new confound, adjacent to but distinct from the project's standing
byte-alias rule (rule 5): it is not a wrong *decode*, it is a correct decode of an address that is
structurally ambiguous given what else is already proven about this address space. See
`tools/c64_mon.py`'s `library_span()` / `library_contains_mon_window()`, pinned by
`test_library_body_fully_contains_the_scanned_window_both_titles` in `test_c64_mon.py`.

This also casts doubt on the premise, standing since §7, that "$4000 is the C64's fixed staging-
buffer load address for essentially every asset in this corpus" as a claim about *where MON payloads
actually reside at the moment they'd be consumed*. `LIBRARY` is resident (occupying $2DC8-$4AD2/
$4AF2) throughout the window when `COM.PREP`/`COMPREP` runs combat encounter setup (it is `LIBRARY`
that `COM.PREP` calls via the `$2E9A`/`$2E49` wrapper in that very code) — so a literal 480-byte MON
payload sitting at `$4000` during combat setup would overlap and corrupt `LIBRARY`'s own resident
code. Per `c64-resident-kernel.md`'s own headline finding ("Files do NOT run at the $4000 in their
PRG header — SETLFS with secondary address 0 selects a relocated load, so the caller's address
wins"), there is no established reason to believe MON`<hex>` files are the exception that really does
end up sitting at literal `$4000` at combat time. This does not prove a specific alternate location;
it is a **negative** result recorded so the next round does not keep re-deriving conclusions that
implicitly assume `$4000` residency as settled fact when it is not.

### 12.2 Lead (a) re-derived: control-flow-following trace of `LIBRARY`, both titles

Seeded a BFS control-flow trace (JSR/JMP-abs/branch targets only — no naive linear scanning) from the
strictest, least-disputable entry-point set available: `LIBRARY`'s own leading `JMP`-table targets
(31/32 in-body slots for CoK, 2/3 for DoK — `library_jump_table()`, already proven by construction)
plus the ONE already-disassembly-documented (not naively found) wrapper entry, `$2E9A` (CoK) /
`$2E49` (DoK), quoted verbatim in §11.1. Every instruction reached decoded cleanly — **zero dead ends
in either title** — meaning the trace's own alignment is internally self-consistent throughout, the
strongest evidence this project's tooling can offer without a second independent oracle.

> **Coverage correction, 2026-08-12 (lead session).** The paragraph above is right that the trace
> is internally self-consistent, and then draws a conclusion the trace cannot carry. **Measure the
> coverage and the two titles are not comparable results at all:**
>
> | Title | JT slots | seeds | bytes visited | coverage | window hits |
> | --- | ---: | ---: | ---: | ---: | ---: |
> | CoK | 32 | 33 | 984 / 7435 | **13.2%** | 4 |
> | DoK | 3 | 4 | 59 / 7467 | **0.8%** | 0 |
>
> The asymmetry is structural and is noted two lines above without its consequence being drawn:
> **DoK's LIBRARY jump table has 3 slots against CoK's 32**, so the identical seeding rule gives
> DoK 4 seeds. Its trace never leaves the first 59 bytes. **DoK's "0 survivors" is therefore not
> a negative result — it is the absence of a search**, and it must not be cited as evidence.
> CoK's 4 survivors are a real result, since they were individually disassembled.
>
> The round's own wider tier (§12.2, seeded from every naive JSR target landing in LIBRARY's
> range across all files) already finds **22 CoK / 12 DoK** window hits — which contradicts the
> flat "DoK has 0" reading directly. Those 12 are unverified and may well all be byte aliases,
> but until someone disassembles them the honest statement is "unknown", not "zero".
>
> Reproduce: `library_window_hits(t)` and `_trace_control_flow(kernel_body(t), KERNEL_ORIGIN,
> seeds)` — the visited-set size is the second return value.

**Result: CoK has exactly 4 survivors (of 29 naive hits); DoK has 0 (of 20) — but see the coverage
box above: only CoK's figure is a result.** All 4 CoK survivors
are `JSR` instructions, at body offsets 2479/2598/2908 (all `JSR $4078`) and 3071 (`JSR $4058`) — both
callees land inside `LIBRARY`'s own body (offsets 4784 and 4752 of 7435). Disassembling the callees:

```
$4078 (CoK LIBRARY): JSR $36E4; JMP $371D          -- (this is the first entry point's own
                                                        continuation, not a distinct routine)
$407E:  LDA $F7; CLC; ADC #$28; STA $F7; BCC +2; INC $F8;
        LDA $F9; CLC; ADC #$28; STA $F9; ...        -- advances zero-page pointers $F7/$F8 and
                                                        $F9(/+1) by $28 (40, the screen width --
                                                        the same row-stride constant as §11, not a
                                                        record-size constant)

$4058 (CoK LIBRARY): LDA $7E84; LDX $7E85; LDY $7E86; BEQ +6; LDX $7E86; JSR $3007 (the same
        8x8->16 multiply used by $2E84/$2E2D); CLC; ADC $7EF6; STA $7EF6; TXA; ADC $7EF7;
        STA $7EF7                                   -- an ordinary multiply-accumulate into the
                                                        shared-globals region ($7Exx), unrelated to
                                                        any $4000-resident buffer
```

Neither callee reads, writes, or references anything that looks like MON name/text data — both are
ordinary intra-`LIBRARY` arithmetic (pointer-stride advance; multiply-accumulate into `$7Exx`
globals), consistent with the row/pointer-math theme already documented in §11. **The survivors
confirm, rather than undermine, the §12.1 conclusion**: the only naive hits that hold up under a real
trace are self-references within `LIBRARY`'s own body, not any external buffer.

A wider, deliberately lower-confidence trace (seeded additionally from every JSR-shaped byte match in
every *other* file's body plus a full linear scan of `LIBRARY`'s own internal JSR operands — i.e.
reintroducing exactly the naive-scan risk rule 5 warns about, but only as a way to see what the
broader neighborhood looks like) reaches 22 CoK / 12 DoK hits in the same window. Inspected, these
are indexed table lookups against fixed `LIBRARY`-internal bases (CoK: `$40C7`/`$40DB`/`$40F4`/
`$4126`; DoK: `$4002`/`$4017`/`$4031`/`$4066`) — structurally the same "ordinary intra-`LIBRARY` data,
not MON buffer" story as the strict-trace survivors, but **not** independently re-verified
instruction-by-instruction the way §12.2's strict-trace hits were, so they are reported here as
corroborating color, not as a separate proven finding. Reproduce both trace tiers with
`tools/c64_mon.py`'s `library_window_hits()` (strict tier, the one actually pinned by tests) or the
scratch trace described above (wide tier, not checked in anywhere).

### 12.3 Lead (b) settled: the DoK `CODE00` offset-122 hit is a confirmed byte-alias false positive

`body[122:125]` of DoK `CODE00` (read from the real Side-1 disk, `read_bodies(load_side1("dok"))`)
is `2C 2D 2E`. Opcode `$2C` decodes as `BIT` (absolute mode) — **not even `JSR`/`$20`**, so under any
reading this was never a real "caller" in the sense `find_callers`/the census intended; it only
matched because `find_callers` accepts any ABS/ABX/ABY-mode instruction naming the target address,
not specifically calls. The surrounding bytes (offsets ~110-139:
`27 28 28 28 29 29 2A 2A 2A 2B 2B 2C 2C 2D 2E 2E 2F 2F 30 31 31 32 32 33 01 02 03 04 05 06`) are an
unambiguous small-value, almost-monotonically-ascending data ramp — a scaled lookup/index table, the
opposite of what a real instruction stream looks like at this density. **Confirmed: not code.** The
real caller population for `$2E2D` (DoK) is exactly the 8 `LIBRARY`-internal sites (offsets 23, 40,
83, 132, 368, 419, 613, 3252) plus `GDRIVE02` — matching what §11.4's correction already believed,
now with the `CODE00` outlier explicitly excluded rather than merely flagged unverified. Pinned by
`test_code00_offset_122_is_a_bit_instruction_not_a_jsr_byte_alias` in `test_c64_mon.py`.

### 12.4 Bounded attempt at the TARGET question: still open

The round's actual target — "what writes text INTO the `$CC00` screen rows before the scrub
(§11) cleans them" — was given a bounded search, not a full sweep. Searched `COM.PREP`, `DUNGEON`,
and `INIT` (CoK; the three files §11.4 proved call the scrub wrapper) for every `LDA ($4C),Y` /
`STA ($4C),Y` / `LDA ($4E),Y` / `STA ($4E),Y` site (the same zero-page indirect-Y idiom the scrub
loop and the `$2E84`/`$2E2D` row-pointer machinery use) — 4 sites in `COM.PREP`, 19 in `DUNGEON`, 2 in
`INIT`. Of these:

* `DUNGEON` offset 2965 (`$1395`) and `INIT` offset 706 (`$0AC2`) are the **same scrub loop**, called
  directly via `$2E9A` a second/third time — already accounted for by §11.4, not new.
* `COM.PREP` offsets 2993/3499 are plain reads (`LDA ($4C),Y`), no paired write — not inspected
  further (out of the bounded budget for this round).
* One genuinely new site: **`DUNGEON` offset 2623 (`$123F`)**, a **standalone** `STA ($4E),Y` (no
  paired scrub-shaped read/compare immediately before it). Full context:

  ```
  $1235 .. $124D (CoK DUNGEON, org $0800; $1235 = body offset 2613):
    1235  A5 FC      LDA $FC            ; row index (from $FC, NOT the fixed $03CD loop counter)
    1237  20 9D 2E   JSR $2E9D          ; the $2E9A wrapper's SECOND half only (skips reloading
                                         ; $03CD, uses A directly) -- computes ($4E,$4F)=$CC00+row*40
                                         ; and ($A3,$A4)=$D800+row*40 for row=$FC
    123A  A4 FB      LDY $FB            ; column index (from $FB)
    123C  AD BF 2C   LDA $2CBF          ; a toggling value computed just above (space $20, or a
                                         ; glyph via ADC #$1C) -- a blink/toggle pattern
    123F  91 4E      STA ($4E),Y        ; write that ONE byte to screen memory at (row=$FC, col=$FB)
    1241  A9 01      LDA #$01
    1243  91 A3      STA ($A3),Y        ; write color 1 (white) to the paired Color RAM cell
  ```

  This is a **single-cell UI element** (a blinking cursor/marker glyph toggling between space and a
  fixed glyph, with its own color-RAM write) at a *computed* row/column — not a multi-byte name/text
  write, and not driven by any `$4000`-range data. It is a third, independent user of the
  `$2E84`/`$2E2D` row-pointer machinery (after the scrub loop and the VIC-bank setup), further
  supporting "this is a general screen-pointer utility, reused broadly" — but it is **not** the
  text-population routine this round was looking for.

**No text-populating consumer of MON data was found in this bounded pass.** The central question —
what writes real name/text into these rows before the scrub runs — remains **open**. Combined with
§12.1's finding that the premise "MON payloads sit at literal `$4000` at consumption time" is itself
now doubtful, the most honest framing for the next round is: **don't assume the populating write
touches `$4000` at all** — it may write from a per-combatant working copy already relocated
elsewhere (as §4's original, now-superseded framing half-guessed), and locating that relocation step
(if one exists) is a more promising next lead than further scanning of the `$4000`-`$41E0` address
range specifically.

### 12.5 Net effect on `tools/c64_mon.py` and the DoK hp question

* Added (diagnostic only, no new `MonRecord` fields — consistent with the module's "deliberately
  narrow" charter): `library_span()`, `library_contains_mon_window()`, `library_window_hits()`, and
  the private `_trace_control_flow()` helper backing them. All are read-only analysis over the real
  disks; `describe()`'s CLI output now reports the self-overlap fact per-title.
* The DoK hp @40-vs-@214 question is **still open**, and this round did not narrow it — the bounded
  populate-consumer search (§12.4) found no new stat-field consumer, and if anything §12.1's doubt
  about `$4000` residency further weakens any future plan to use "byte 40/214 of a buffer at `$4000`"
  as a lead, since that buffer's true runtime location during combat setup is now itself unproven.

Reproduce every claim in this section:

```
python -m pytest tools/test_c64_mon.py -v -k MonPopulateWindowTests
python -c "import sys; sys.path.insert(0,'tools'); import c64_mon as mon
print(mon.library_span('cok'), mon.library_span('dok'))
print(mon.library_contains_mon_window('cok'), mon.library_contains_mon_window('dok'))
print(mon.library_window_hits('cok')); print(mon.library_window_hits('dok'))"
```

## 13. 2026-08-12 "mon-verify" round: finishing the trace, and settling two dangling leads

Scoped brief for this round: (1) finish the DoK side of section 12's trace honestly -- its
"0 survivors" was a 0.8%-coverage artifact, not a result, because DoK's LIBRARY jump table has
only 3 slots against CoK's 32 -- by widening the seed set to a real inbound-call census across
ALL disk sides; (2) re-run the section-11.4 `$2E84`/`$2E2D` caller census across all sides (it
was side-1-only); (3) settle, either way, whether the DUNGEON cursor-blink write (section 12.4)
is reachable via real control flow; (4) make another bounded attempt at the round's actual
TARGET question -- what writes text into the `$CC00` screen rows.

### 13.1 The widened seed set, and why an unrestricted census is NOT enough on its own

The obvious fix -- seed the trace from every `JSR` landing in LIBRARY's range, found across
every file on every disk side (`c64_kernel.all_bodies`, not just side 1) -- was tried first and
immediately produced a real, instructive false positive. Restricted to no filter at all, the
wider census reproduces almost exactly the naive-scan numbers section 12 already flagged as
unverified ("22 CoK / 12 DoK"), and one of DoK's 12 is provably wrong:

* `SPELLE66` (a spell-message **data** file, not an executable overlay) contains the byte
  sequence `20 56 4A` at body offset 2461 -- a `JSR $4A56` **by coincidence**, not by intent
  (SPELLE66 is never independently executed; nothing loads it as code).
* `$4A56` lands inside DoK's LIBRARY body. Seeding the trace there and decoding forward
  produces `4A56  4D 42 41   EOR $4142` -- and `$4142` falls inside the `$4000`-`$41E0`
  window, so this looks like a 12th "window hit" if the census isn't restricted to real code.
* But the bytes at `$4A54`-`$4A5A` in DoK's LIBRARY spell out the ASCII string `"COMBAT2"`
  (`43 4F 4D 42 41 54 32`) -- the exact same false-positive shape already documented in this
  file's section 5 for CoK's COM.PREP (`EOR $4142` landing on `"COMBAT2"` embedded as data in
  a filename table), just reached this time via a bad **entry point** rather than a bad
  **window hit**. LIBRARY carries its own copy of the 8-name dispatch-table string list (see
  `c64_kernel.dispatch_padding_slot_names`), and `SPELLE66`'s coincidental `JSR`-shaped bytes
  happen to point straight into the middle of it.

**Conclusion**: an inbound-call census must be restricted to files this project has
independently established ARE executed code, not scanned indiscriminately. `tools/c64_mon.py`'s
new `_CODE_FILES` allowlist encodes exactly that: the 8-name LINKER/LIBRARY dispatch table
(`GEN`, `DUNGEON`, `COMBAT`, `INIT`, `COM.PREP`/`COMPREP`, `POST.COM`/`POSTCOM`, `FINAL`,
`CAMP`) minus nothing, plus the graphics-driver slot (`GDRIVE00`-`GDRIVE05`), plus
`LINKER`/`STOP`/`SOUNDFX`/`FASTL.O`/`BOOT`/`CODE00`-`CODE03`. `COMBAT2` is **deliberately
excluded** despite living in the same `$0800` overlay-slot family: section 2 of this document
already proved it is >95% printable ASCII text, a data table `COMBAT` reads directly, never an
independently-executed overlay. The families the census actually encounters as byte-match sources
(`MON*`, `GEO*`, `SPELL*`, `PIC*`/`COMPIC*`, `ITEMFILE*`/`ITEMNAMES`, `WALLSET*`/`WALLDEF*`,
`SPRITE*`, `ECL*`, `TITLEPG`, `CHARSET`/`CHARPIC00`, `ANIMATE00`, `MUSIC`, `HEAD*`/`BODY*`,
`SECSET*`, portrait files, disk-banner strings) are each a documented asset/data format elsewhere
in this project's docs.

> **Scope correction (2026-08-12).** This previously read "**Every other** family in the corpus …
> is a documented asset/data format …, **never independently-executed code**." That universal is
> false, and its own population refutes it. Removing the code-file allowlist and every family
> prefix listed above from the 342 CoK / 273 DoK body names leaves **12 CoK** (`.ATHENA`,
> `.BLACK KNIGHT`, `.FRANK`, `.HELLFLAME`, `.RASTAN`, `.SALINA`, `.XERON`, `COMBAT2`, `ITEMS`,
> `LIBRARY`, `SAVEDRAGN`, `SPR.TP`) and **8 DoK** (`----------------`, `COMBAT2`,
> `DEATH KNIGHTS`, `ITEMS`, `LIBRARY`, `OF KRYNN (LADER)`, `SAVEDEATH`, `SPR.TP`). `LIBRARY` is
> the resident kernel — executed code, and this census's own *target*. `SPR.TP` is a bare-dialect
> sprite file this project has separately flagged as invisible to most corpus scans. The
> enumerated statement above is what the evidence supports; the universal was never checked
> against the leftover set.

### 13.2 Real coverage numbers with the restricted, all-sides census

Seeding `_trace_control_flow` from LIBRARY's own jump table + the documented wrapper entry +
`library_entry_census()` (every real `JSR`, opcode `$20` exactly, from a `_CODE_FILES` member,
across all sides):

| Title | jump-table slots | census entries (distinct addrs) | total seeds | bytes visited | coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| CoK | 32 | 219 | 230 | 2836 / 7435 | **38.1%** |
| DoK | 3 | 221 | 223 | 2878 / 7467 | **38.5%** |

(Corrected 2026-08-12: the CoK cell previously read "~228", which no reading of the census
yields. `library_entry_census('cok')` returns **219** distinct addresses over 1327 total hits;
DoK's returns **221** over 1438. The three left-hand columns do not sum, because `total seeds`
is a set union with the jump-table + wrapper base seed set (33 addresses on CoK, 4 on DoK): 197
of CoK's 219 census addresses and 219 of DoK's 221 are new to that base, giving 33+197=230 and
4+219=223. Both counts are exact; the tildes are dropped.)

This closes the asymmetry section 12's coverage-correction box flagged: both titles now clear
38%, a like-for-like comparison instead of "a real 13.2%-coverage result" vs. "an absent
0.8%-coverage non-result." Reproduce: `mon.library_trace_coverage('cok' | 'dok')`.

### 13.3 Window-hit survivors: 22 CoK / 11 DoK, all ordinary LIBRARY-internal references

`library_window_hits()` under the widened, restricted seed set returns:

* **CoK: 22 hits**, 11 distinct targets: `$4003, $4046, $4058, $4078, $407E, $4098, $40C7,
  $40DB, $40F4, $410D, $4126` -- all inside LIBRARY's own body (which ends at `$4AD2`).
* **DoK: 11 hits**, 7 distinct targets: `$4002, $4017, $4031, $404B, $4066, $4134, $41C4` --
  all inside LIBRARY's own body (ends at `$4AF2`).

Every target was individually disassembled. Two shapes account for all of them, in both
titles, at closely analogous addresses:

**(a) JSR/JMP to an ordinary intra-LIBRARY subroutine.** E.g. CoK `$4078`/`$407E` (advances
zero-page pointers `$F7`/`$F9` by `$28` = 40, the screen-width constant -- already documented
in section 12.2, now also reached from the wider seed set), `$4058` (an 8x8->16
multiply-accumulate into shared globals `$7EF6`/`$7EF7`, likewise already documented), and
three NEW-to-this-round callees: `$4003` (stores into `$7F93`/`$7F94`/`$7FAA`/`$4AB3`, a
subtraction against `$03F3` -- ordinary shared-globals bookkeeping), `$4046` (a small
increment-with-carry helper feeding straight into `$4058`), `$4098` (reads `$7E60`, calls
`$47F3`, then indexes the two data tables below by `X`/`Y` to build sprite-frame pointers into
`$9EE6`/`$9FE6`-based tables and `$3214`/`$3216`). DoK's `$4134`/`$41C4` are the structural
analogs (both reference `$7Exx`/`$7Fxx` shared globals and `$0286`, the KERNAL current-text-
color zero-page variable -- see the paired write at `$41C7: STA $0286` immediately after
`$41C4`'s `LDA $7E55`).

**(b) Indexed load/compare against a small LIBRARY-internal lookup table.** CoK bases `$40C7`,
`$40DB`, `$40F4`, `$410D`, `$4126`; DoK bases `$4002`, `$4017`, `$4031`, `$404B`, `$4066`. Every
one of these five table pairs is **byte-for-byte near-identical between titles** (dumped
directly, first 20 bytes):

```
CoK $40C7: 08 09 05 08 09 05 08 08 05 07 08 09 09 09 05 06 06 09 08 0a
DoK $4002: 08 09 05 08 09 05 08 08 05 09 08 09 09 09 05 06 06 09 08 0a   (1 byte differs)

CoK $410D: 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 00 00
DoK $404B: 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 00 00   (identical)

CoK $4126: 00 01 02 03 04 05 06 07 08 09 0a 0d 0e 0f 10 0b 0b 0b 0c 0c
DoK $4066: 00 01 02 03 04 05 06 07 08 09 0a 0d 0e 0f 10 0b 0b 0b 0c 0c   (identical)
```

Small integer values (0-16 range, mostly), consistent with a fixed-size lookup/remap table
(the `$4126`/`$4066` table in particular is a monotonic index sequence with a repeated tail --
looks like a wall-type or animation-frame remap table). **Not MON-shaped in any respect**:
these tables are ~20 bytes long, not the 480-byte MON payload, and are read via `X`/`Y`
absolute-indexed addressing (`LDA $40C7,Y`), never via the `($4C)`/`($4E)` zero-page-indirect
idiom the scrub loop, row-pointer helper, and cursor-blink write all use for genuinely
per-row/per-monster data.

**Net verdict, unchanged from section 12 but now on solid, comparable-coverage footing for
both titles**: every hit that survives a real, wide, code-file-restricted trace is an ordinary
reference to LIBRARY's own interior (subroutines or small fixed tables), never to the raw
`$4000` MON staging buffer. Reproduce: `mon.library_window_hits('cok' | 'dok')`.

### 13.4 The `$2E84`/`$2E2D` caller census, re-run across all disk sides

Re-running section 11.4's census with `c64_kernel.all_bodies` (all sides) instead of
`read_bodies(load_side1(...))` (side 1 only):

* **CoK is unchanged**: 9 sites (8 LIBRARY-internal + `GDRIVE02`), identical to the side-1-only
  result. Side 1 already had CoK's complete population.
* **DoK grows from 10 candidates (8 LIBRARY + GDRIVE02 + the already-confirmed-false CODE00
  offset-122 hit) to 11**, adding one genuinely new candidate: **`PIC07` offset 1624**. This is
  **confirmed a second byte-alias false positive**, settling it the same way CODE00 was
  settled: `PIC07` (a picture/graphics **data** file) contains `0D 2D 2E` at that offset --
  opcode `$0D` decodes as `ORA` (absolute), **not** `$20`/`JSR`, so it was never a real "caller"
  under any reading. The surrounding bytes (`00 80 fe 00 01 c0 fe 60 01 a0 bf 00 05 1e 74 f8 e0
  80 00 00 a4 00 04 02 0d 2d 2e e6 00 01 08 fe 28 cd ...`) are an unstructured jumble of large
  and small values with no ascending/table-like pattern -- consistent with pixel/RLE picture
  data, not code.

**Real caller population, both titles, confirmed exhaustive across every disk side**: exactly 8
LIBRARY-internal sites + `GDRIVE02`. Reproduce: `mon.row_pointer_helper_callers('cok' | 'dok')`.

### 13.5 The DUNGEON cursor-blink write: settled as "genuinely unsettled", with a diagnosis

Section 12.4 found a plausible non-MON candidate (a single blinking cursor/marker glyph write)
but could not prove a control-flow path to it, and had it only for CoK. This round:

**Cross-title parity closed first.** DoK's DUNGEON has the structurally identical sequence, at
its own address (`$1037` = `$0800`+body offset 2103, not `$1039` -- the `JSR $2E4C` two bytes in
from the block's real start):

```
CoK DUNGEON $1235 .. $1243:                  DoK DUNGEON $1037 .. $1045:
  1235  A5 FC      LDA $FC                     1037  A5 FC      LDA $FC
  1237  20 9D 2E   JSR $2E9D                    1039  20 4C 2E   JSR $2E4C
  123A  A4 FB      LDY $FB                      103C  A4 FB      LDY $FB
  123C  AD BF 2C   LDA $2CBF                     103E  AD 0D A8   LDA $A80D
  123F  91 4E      STA ($4E),Y                   1041  91 4E      STA ($4E),Y
  1241  A9 01      LDA #$01                      1043  A9 01      LDA #$01
  1243  91 A3      STA ($A3),Y                   1045  91 A3      STA ($A3),Y
```

Same shape: row from `$FC`, delegate to the row-pointer helper's second half (`$2E9D` CoK /
`$2E4C` DoK -- the `JSR $2E84`/`$2E2D` instruction inside the `$2E9A`/`$2E49` wrapper, entered
directly to skip the `LDA $03CD` reload), column from `$FB`, one glyph byte written to screen
memory, literal color `1` written to the paired Color RAM cell. Only the glyph source differs
(`$2CBF` CoK -- an absolute zero-page-ish location computed as a toggle just above, per
section 12.4 -- vs. `$A80D` DoK, the analogous shared-state byte for that title).

**Reachability, attempted via static control-flow trace from DUNGEON's own proven-real entry
point.** DUNGEON is invoked exactly like every other LINKER-dispatched overlay: entered at the
fixed slot address `$0800`, by `LINKER`'s `JSR $0800` (`20 00 08` at LINKER body offset 60 on
CoK, 69 on DoK). Tracing from that one entry point:

> **CORRECTION (same day, re-derived — then corrected a second time, same day).** The first
> version of this paragraph said `$0800` was "the sole non-data-file caller into DUNGEON's own
> leading 2-3-slot table, in both titles", with everything else dismissed as a data-file
> byte-match. The first correction replaced that with "**two** non-data-file references per
> title" — right for CoK, wrong for DoK. Re-run of
> `c64_kernel.find_callers(all_bodies(t), [0x0800, 0x0803, 0x0806])`, per title (that helper is
> **not** a `JSR` search and does **not** respect instruction boundaries — it reports any
> ABS/ABX/ABY-mode opcode naming the address, mid-operand aliases included, so every entry below
> is a byte match whose bytes are quoted so they can be checked by hand):
>
> **CoK — 2 non-data-file references.**
>
> | Reference | Offset | Bytes | What it is |
> | --- | --- | --- | --- |
> | `LINKER` `JSR $0800` | body offset 60 | `20 00 08` | the real overlay-dispatch call, and the only reference to `$0800` itself |
> | `LIBRARY` `JMP $0803` | body offset 72 = jump-table slot **24**, address `$2E10` | `4C 03 08` | the slot `c64_kernel._print_jumptable` already labels "overlay-call trampoline (JMP into the `$0800` slot)" — a **generic** redispatch into the second slot of whichever overlay is resident at `$0800`, not a DUNGEON-specific caller |
>
> CoK's third slot address `$0806` has no non-data-file reference at all (its one byte-match is
> `PIC11` offset 525, bytes `FD 06 08` = `SBC $0806,X`).
>
> **DoK — 4 references across 3 files.** The same two as CoK (`LINKER` `JSR $0800` at body
> offset 69, bytes `20 00 08`; `LIBRARY` `JMP $0803` at body offset 3 = jump-table slot **1**,
> address `$2DCB`, bytes `4C 03 08`), **plus two inside `DUNGEON` itself** — a code file, and on
> `_CODE_FILES`:
>
> * `DUNGEON` body offset 0, bytes `4C 06 08` = `JMP $0806`: DoK DUNGEON's own leading slot 0.
>   Its leading table is 2 slots (`4C 06 08 | 4C 2E 0A`), and `$0806` is where its own body
>   begins — body offsets 6-9 are `BA` (`TSX`), `8E BF 03` (`STX $03BF`).
> * `DUNGEON` body offset 5894 (address `$1F06`), bytes `4C 06 08` again, immediately preceded by
>   `AE BF 03` (`LDX $03BF`) at offset 5890 and `9A` (`TXS`) at offset 5893 — the bytes read as a
>   stack-restore-then-re-enter-`$0806` path. Instruction alignment into that sequence was not
>   independently established here; only the byte values were checked.
>
> The remaining byte-matches are inside data files: on CoK `ECL*`, `PIC*`, `GEO44`/`GEO52`,
> `SPRITE00`, `BODY44`, `COMPIC38`, `SAVEDRAGN`, `.SALINA`; on DoK `ECL*`, `PIC*`, `GEO41`,
> `SPRITE*`, `COMPIC04`, `SAVEDEATH`, **plus `MON25` (offset 158) and `WALLDEF04` (offset 2496)**
> — two families the earlier list omitted. Of CoK's 51 `ECL*` byte-matches at `$0800`, 41 are
> `4C 00 08`; the other 10 are other absolute-mode opcodes (`ADC`/`ORA`) aliasing the same two
> operand bytes. Reproduce with `python tools/c64_kernel.py jumptable --title cok | dok` (slot
> 24 / slot 1 are the `JMP $0803` rows) plus the `find_callers` line above. This does not change
> the trace below — it is still seeded only from `$0800` — but it does mean `$0803` has its own
> real, non-data-file entry path in both titles, which the trace never followed. (DoK's two
> `$0806` references are not a missed path: the trace enters DoK DUNGEON's body precisely by
> following slot 0's `JMP $0806`.)

| Title | DUNGEON size | bytes visited | coverage | cursor-write offset reached? |
| --- | ---: | ---: | ---: | :---: |
| CoK | 9452 | 575 | 6.1% | **No** |
| DoK | 8248 | 543 | 6.6% | **No** |

**Verdict: genuinely unsettled, not a negative result.** A 6%-coverage trace cannot support
"unreachable" as a conclusion -- there simply isn't enough of DUNGEON's control flow captured
for the absence to mean anything. The low coverage itself is diagnostic: DUNGEON is a large,
heavily-branching overlay (dungeon movement, commands, message display) and only a single
straight-line entry point was seeded for it — `$0800`; the correction box above shows `$0803`
also has a real non-data-file entry path (LIBRARY's trampoline slot) that this trace did not
follow (unlike LIBRARY, whose 32/3-slot jump table plus a wide inbound-JSR census gave real,
comparable coverage in section 13.2). The likely explanation
is that DUNGEON dispatches most of its command handling via a runtime-computed/indirect jump
(the classic 6502 "push target-1 onto the stack, then `RTS`" trick, since the 6502's only
indirect `JMP` mode takes a fixed absolute pointer, not an indexed one) -- something a static
JSR/JMP-abs/branch-following BFS trace cannot follow **by construction**, regardless of seed
set. Settling this for real would need either manually reading DUNGEON's own dispatch-table
data (out of this round's budget) or a dynamic trace (out of scope -- no emulator). Reproduce:
`mon.dungeon_cursor_write_reachability('cok' | 'dok')`.

### 13.6 The TARGET question, widened again: still no text-populating write found

Section 12.4's search was bounded to 3 files (`COM.PREP`, `DUNGEON`, `INIT`) for the `($4C)`/
`($4E)` zero-page-indirect idiom specifically. This round widens the search differently: every
absolute `STA`/`STX`/`STY` targeting `$CC00`-`$CFFF` (the alternate screen, rounded to a full
page) in **any** `_CODE_FILES` member, across **all** disk sides, both titles
(`mon.screen_memory_writes`).

**Result: still no text-populating consumer.** The full return value, enumerated per title and
per file (the first version of this section merged the two titles into one unlabelled list and
called several multi-hit files "single fixed-address writes", which undercounted them, and
omitted CoK `GEN` entirely):

**CoK — 5 files, 28 hits total** (`mon.screen_memory_writes('cok')`):

| File | Hits | Sites (body offset : mnemonic address) |
| --- | ---: | --- |
| `INIT` | 20 | see the two-group breakdown below |
| `COMBAT` | 3 | 519:`STA $CD57`, 3408:`STY $CE20`, 9432:`STA $CC00` |
| `DUNGEON` | 3 | 5592:`STA $CD7F`, 5600:`STX $CD7F`, 8870:`STA $CFF8` |
| `COM.PREP` | 1 | 3643:`STA $CFFF` |
| `GEN` | 1 | 9241:`STA $CEA6` |

**DoK — 8 files, 34 hits total** (`mon.screen_memory_writes('dok')`):

| File | Hits | Sites (body offset : mnemonic address) |
| --- | ---: | --- |
| `INIT` | 20 | see the two-group breakdown below |
| `CODE00` | 3 | 3058:`STY $CF8D`, 3070:`STY $CF8D`, 3217:`STY $CF8D` |
| `CODE03` | 3 | 3199:`STA $CFFE`, 3363:`STX $CFFA`, 3367:`STX $CFFB` |
| `DUNGEON` | 3 | 5285:`STA $CD7F`, 5293:`STX $CD7F`, 7717:`STA $CFF8` |
| `COMBAT` | 2 | 499:`STA $CD57`, 1658:`STX $CEA8` |
| `CAMP` | 1 | 8522:`STY $CFCD` |
| `CODE01` | 1 | 3070:`STY $CE10` |
| `COMPREP` | 1 | 3784:`STA $CFFF` |

Note the two titles' RESULT sets are not the same (corrected 2026-08-12 -- the earlier wording
here said the two titles' *file* sets differ, which is wrong): `GEN` produced a hit only on CoK
and `CAMP` only on DoK, although both files exist in both titles' corpora (`c64_kernel.all_bodies`
returns 342 CoK / 273 DoK bodies, and `GEN` and `CAMP` are in both, and on both titles'
`_CODE_FILES` allowlists). `CODE00`/`CODE01`/`CODE03` do exist only on DoK -- there is no
`CODE02` in either corpus. The files that produced hits in both titles -- `INIT`, `DUNGEON`,
`COMBAT`, `COM.PREP`/`COMPREP` -- hit at closely analogous shapes in both.

`INIT` is by far the largest cluster -- 20 hits of CoK's 28 and of DoK's 34 -- and it is a real,
new-to-this-project finding, though not the one the round was looking for. It is **not** the only
multi-site one: the tables above also show `DUNGEON` with 3 in both titles, CoK `COMBAT` with 3,
and DoK `CODE00` and `CODE03` with 3 each (`CODE00`'s three all naming the same address `$CF8D`).
An earlier version of this sentence said "the only multi-site cluster", which its own enumerated
tables refute:

* **CoK `INIT`, 20 hits**, in two groups. The first is the 16 hits at offsets 2047-2133
  (addresses `$0FFF`-`$1055`; the group's own first instruction is the `LDA #$00` at offset
  2045 = `$0FFD`) and draws a **box border**. Corrected 2026-08-12 -- the earlier breakdown
  accounted for only 10 of these 16 and folded in Color-RAM writes that are not among them.
  Re-derived from the disassembly at offsets 2043-2136, the 16 are:
  * **4 indexed span-fills of literal `$00`** (`LDY #$27; LDA #$00`, then `STA $CC00,Y`,
    `STA $CCA0,Y`, `STA $CF98,Y`, `STA $CF20,Y` at offsets 2047/2050/2053/2056) -- rows 0, 4,
    23 and 20 exactly (`$CF98`-`$CC00` = 920 = 40*23; `$CF20`-`$CC00` = 800 = 40*20).
  * **6 absolute pokes of literal `$24`** at offsets 2078-2093: `$CC28`, `$CC4F`, `$CCC8`,
    `$CCEF`, `$CF48`, `$CF6F`.
  * **6 absolute pokes of literal `$26`** at offsets 2118-2133: `$CC78`, `$CC9F`, `$CEF8`,
    `$CF1F`, `$CF70`, `$CF97`.

  Interleaved with those are Color-RAM writes -- 4 span-fills of literal `$0B` to
  `$D800`/`$D8A0`/`$DB20`/`$DB98` and 6 pokes of literal `$0C` to `$D828`...`$DB6F` -- which
  fall outside the `$CC00`-`$CFFF` search window and are therefore **not** part of the 16. The
  verdict is unchanged: literal immediates throughout, never an indexed read from a source
  buffer. The second group is the 4 hits at offsets 2340-2349
  (`$1124`-`$112D`), a **full 256-byte-per-quadrant space-fill**: `LDY #$00; LDA #$20; STA
  $CC00,Y; STA $CD00,Y; STA $CE00,Y; STA $CF00,Y; DEY; BNE ...` -- clears all four
  screen-memory pages to literal space.
* **DoK `INIT`, 20 hits**, the SAME two-group split (16 border hits at offsets 2012-2098, then
  the same 4-hit `$CC00`/`$CD00`/`$CE00`/`$CF00` space-fill at offsets 2310-2319) at its own
  (nearby but not identical) offsets -- confirmed byte-identical in structure by spot-checking
  both clusters' first write:
  CoK bytes `2045..2047 = A9 00 99` (`LDA #$00; STA $CC00,Y`) and `2338..2340 = A9 20 99`
  (`LDA #$20; STA $CC00,Y`); DoK bytes `2010..2012` and `2308..2310` are the identical two
  3-byte sequences.
* The remaining 8 CoK hits and 14 DoK hits, per file (the earlier version of this bullet
  merged both titles and called all of them "lone fixed-address writes", which is wrong for
  the five indexed ones -- three on CoK, two on DoK):
  * `DUNGEON`, 3 in each title: `STA $CD7F` + `STX $CD7F` (two **absolute** writes to the
    same byte, 8 bytes apart, at offsets 5592/5600 CoK and 5285/5293 DoK) and one indexed
    `STA $CFF8,Y` (offset 8870 CoK / 7717 DoK) whose two preceding instructions are
    `LDY #$00; TXA` -- it stores a register, not a byte fetched from a buffer.
  * `COMBAT`, 3 CoK / 2 DoK: an indexed `STA $CD57,Y` in both titles (offset 519 CoK / 499
    DoK) immediately preceded by the literal `LDA #$20` -- a space, not source text; plus one
    absolute `STY $CE20` (CoK offset 3408) / `STX $CEA8` (DoK offset 1658); plus CoK's
    offset-9432 `STA $CC00`, discussed in the next bullet.
  * `COM.PREP` / `COMPREP`, 1 each: absolute `STA $CFFF`, preceded by the literal `LDA #$78`
    in both titles.
  * CoK `GEN`, 1: indexed `STA $CEA6,X` at offset 9241 -- but the surrounding bytes are a
    monotonically ascending run (`... 12 3a 55 62 80 9d a6 ce e0 69 78 8a 98 ab ...`) that
    reads as a lookup table, not an instruction stream (the run continues into `28 28 28 28
    28 28 29 29 ...` a few bytes later). Not claimed as real. (This one stands; the CoK
    `COMBAT` hit was described the same way and that description did **not** stand -- see
    the CoK `COMBAT` offset-9432 bullet below.)
  * DoK-only: `CAMP` 1 (`STY $CFCD`, offset 8522); `CODE00` 3 (`STY $CF8D` three times, the
    *same* address, offsets 3058/3070/3217); `CODE01` 1 (`STY $CE10`, offset 3070); `CODE03`
    3 (`STA $CFFE`, `STX $CFFA`, `STX $CFFB`, offsets 3199/3363/3367).
  None of these is a loop copying an indexed source buffer into the screen: the indexed stores
  (five in total -- three on CoK, two on DoK) write a literal immediate or a register value,
  and the rest are single absolute pokes.
* CoK `COMBAT` offset 9432 (`STA $CC00`, address `$2CD8`) was investigated specifically since
  it is the only **non-indexed** hit naming `$CC00`, i.e. row 0 column 0. (CoK `INIT` also names
  `$CC00`, at offsets 2047 and 2340, but both are indexed span-fills that touch it only when
  Y=0; an earlier version of this sentence said "the only hit landing exactly at row-0-col-0",
  which those two refute.) **Corrected 2026-08-12**: the earlier text
  here claimed its surroundings "produce incoherent output (`.byte $3C`, `.byte $0F`, a
  nonsensical `STA $A905`)". That is wrong -- those tokens only appear when the decode starts
  mid-instruction. Started at a natural boundary (body offset 9420 = `$2CCC`, org `$0800`) the
  stream decodes cleanly: `$2CCC STA $A905`; `$2CCF STX $A904`; `$2CD2 JSR $122C`;
  `$2CD5 JMP $2CC1`; `$2CD8 STA $CC00`; `$2CDB JSR $3046`; `$2CDE CMP #$53`; `$2CE0 BNE $2CE9`.
  The `STA $A905 / STX $A904 / JSR $122C` triple is not nonsensical either -- the identical
  9-byte sequence also occurs at body offset 9397 (`$2CB5`). What does justify caution is
  narrower: a byte-level scan of the whole CoK `COMBAT` body for any `JSR`/`JMP abs` naming
  `$2CD8`, and for any relative branch (at any byte offset) computing `$2CD8` as its target,
  found **no** reference; and the instruction immediately before it is an unconditional
  `JMP $2CC1`. So the hit's **reachability is unverified** -- not "it isn't a real instruction".

**Interpretation**: `INIT`'s border/clear routine is a genuine, previously-undocumented finding
about what writes to `$CC00`-`$CFFF` -- almost certainly a one-time boot-time decoration/clear
step for the alternate screen, using only literal immediate constants throughout, never an
indexed read from a source buffer. It is definitively **not** the text-populating write this
round was looking for. Combined with section 13.4's exhaustive (now all-sides-confirmed) `8
LIBRARY + GDRIVE02` caller population for the row-pointer helper, and this section's
established-code-file-wide (still not literally exhaustive -- data files are excluded by
design, see 13.1) sweep for direct `$CC00`-range writes, **the central open question stands
exactly where section 12 left it**: nothing this project's static tooling can reach
demonstrably reads `MON<hex>` data and writes it as text into screen memory. The most credible
remaining explanation, given 13.5's diagnosis, is that the write lives behind the same kind of
indirect/computed dispatch that makes DUNGEON's own coverage so low -- i.e. it is very plausibly
IN the corpus already, just not reachable by a static branch-following trace.

### 13.7 Net effect on `tools/c64_mon.py` and the DoK hp question

* Added (diagnostic only, no new `MonRecord` fields -- consistent with the module's
  "deliberately narrow" charter): `_CODE_FILES` (the established-code allowlist),
  `library_entry_census()`, `library_trace_seeds()`, `library_trace_coverage()`, plus the
  updated (not narrowly-seeded) `library_window_hits()`; `row_pointer_helper_callers()`;
  `dungeon_cursor_write_reachability()`; `screen_memory_writes()`.
* **Test-count bookkeeping (corrected).** The round originally self-reported "added: 6" tests.
  The real numbers, counted from the diff and confirmed by running the suite: **7 test methods
  added** (all of them in the new `MonVerifyRoundTests` class), **2 removed** — the two
  narrow-seed tests this round superseded, `test_cok_survivors_are_two_specific_intra_library_subroutines`
  and `test_dok_has_zero_survivors`, whose pinned values (4 CoK survivors / 0 DoK survivors)
  are exactly what the widened seed set replaced — for a **net +5**. `tools/test_c64_mon.py`
  went from **22 to 27** test methods, and `python -m pytest tools/test_c64_mon.py -q` reports
  **27 passed** (of which `-k MonVerifyRoundTests` is 7).
* The DoK hp @40-vs-@214 question is **still open**. This round did not narrow it -- no new
  stat-field consumer was found; if anything, section 13.5's diagnosis (DUNGEON likely uses
  indirect dispatch this project's static tooling cannot follow) suggests the same may be true
  of whatever populates combat-screen text, meaning static tracing alone may never settle
  either question without either manual jump-table data reading or a dynamic trace (out of
  this investigation's scope).

Reproduce every claim in this section:

```
python -m pytest tools/test_c64_mon.py -v -k MonVerifyRoundTests
python -c "import sys; sys.path.insert(0,'tools'); import c64_mon as mon
print(mon.library_trace_coverage('cok'), mon.library_trace_coverage('dok'))
print(mon.library_window_hits('cok')); print(mon.library_window_hits('dok'))
print(mon.row_pointer_helper_callers('cok')); print(mon.row_pointer_helper_callers('dok'))
print(mon.dungeon_cursor_write_reachability('cok')); print(mon.dungeon_cursor_write_reachability('dok'))
print(mon.screen_memory_writes('cok')); print(mon.screen_memory_writes('dok'))"
```

## 14. 2026-08-13 round: the indirect-indexed gap (rule 4), a new string-copy primitive, and a still-open lead in DoK COMPREP

Scoped brief for this round: `screen_memory_writes()` (section 13.6) searched for direct
stores to `$CC00`-`$CFFF`, but it only scanned **absolute-mode** `STA`/`STX`/`STY`
(addressing modes ABS/ABX/ABY). It never scanned **indirect-indexed** stores (`STA
(zp),Y`, 6502 mode IZY) — despite the fact that the row-pointer helper's own output
(section 11) is *read* exactly that way. This is precisely the standing-rule-4 mistake
this task was dispatched to fix: a census that only recognizes one operand shape cannot
find writes that use a different one. This round closes that gap. Tooling added:
`tools/c64_mon.py`'s `zp_indirect_store_census()` and `print_string_routine_callers()`
(diagnostic only, no new `MonRecord` fields), pinned by `tools/test_c64_mon_hp.py`.

### 14.1 The census: `STA (zp),Y` across established code, both titles, all sides

Scanning every `_OPERATION_CENSUS_FILES[title]` member for opcode `$91` (`STA (zp),Y`,
mode IZY) exactly:

| Title | total `STA (zp),Y` hits | distinct (file, zp) pairs |
| --- | ---: | ---: |
| CoK | **174** | 62 |
| DoK | **242** | 78 |

> **CORRECTION (2026-08-13, same day, before commit).** This table shipped its first draft
> as CoK 148/46 and DoK 215/47, and **both columns were wrong**.
>
> *The pair counts reproduced from nothing.* `len(mon.zp_indirect_store_census('cok'))` was
> 51, not 46; DoK was 66, not 47 — even against the narrower file set the numbers were
> computed over. The doc printed a figure its own stated reproduction command did not
> produce, which is the one defect a "reproducible with …" line exists to make impossible.
>
> *The totals were scoped wrong.* The census reused `_CODE_FILES`, which **deliberately
> omits `LIBRARY`** — correctly so for the three functions it was written for
> (`library_entry_census`, `library_window_hits`, `library_trace_seeds`), each of which
> censuses calls *inbound to* LIBRARY and would otherwise count the kernel's own internal
> `JSR`s as external callers. Reusing that allowlist unchanged for an **operation** census
> silently excluded the largest established-code file in the corpus (7,435 B CoK / 7,467 B
> DoK) and the one whose interior C1.9 already solved.
>
> That is **standing rule 4 — "search for the OPERATION, then classify what it does" —
> failing at FILE scope instead of opcode-idiom scope**, inside a docstring that invoked
> rule 4 by name. The rule's earlier casualty was a 9-byte masked-store idiom that could
> only ever find masked stores; this is the same mistake one level up, and it is a reminder
> that inheriting a population from a function written for a different question is itself a
> filter you have to justify.
>
> It was not harmless. `LIBRARY` holds **26 (CoK) / 27 (DoK)** `STA (zp),Y` sites, including
> **seven through `$4C`** and **one through `$4E`** — the exact pointer pair §14.2's entire
> argument is about — and one of them is a genuine screen-text writer (§14.5).

Full per-(file, zp) breakdown reproducible with `mon.zp_indirect_store_census('cok'\|'dok')`
(figures above re-derived independently from the raw disk images, not from the function).
The zero-page pairs used span dozens of distinct addresses across `CAMP`, `COM.PREP`/
`COMPREP`, `COMBAT`, `DUNGEON`, `FASTL.O`, `GDRIVE00`-`GDRIVE02`/`04`/`05`, `GEN`, `INIT`,
`LINKER`, `POST.COM`/`POSTCOM`, `SOUNDFX` -- i.e. indirect-indexed addressing through a
zero-page pointer is the single most common way this codebase writes anything indexed at
all, and no prior round had censused it as an operation.

### 14.2 FACT: `$4C`/`$4D` is NOT exclusive to the row-pointer helper

Section 11.2 established that the row-pointer helper (`$2E84` CoK / `$2E2D` DoK) leaves
its `$CC00+row*40` product at `$4C`/`$4D` as a side effect (the multiply subroutine
`$3007`/`$2FB0` writes the low byte to `$4C` directly; `$2E84`/`$2E2D` then overwrites
`$4D` in place with `hi+$CC`), so `($4C),Y` is a second, equally valid way to reach the
same screen-memory pointer the wrapper copies into `$4E`/`$4F`. That fact stands. But
`zp_indirect_store_census()` shows `$4C` is written through `STA ($4C),Y` **8 times in
CoK `DUNGEON`, 7 in DoK `DUNGEON`, and once in `GEN` in each title** -- more sites than a
single-purpose "screen row pointer" would need, and `GEN` is not even a caller of the
row-pointer helper at all (`mon.row_pointer_helper_callers()` returns only
`LIBRARY`-internal sites + `GDRIVE02`, in both titles -- confirmed exhaustively in section
13.4 -- `DUNGEON` and `GEN` are absent from that list).

Disassembling all 8 CoK `DUNGEON` `$4C` sites (`$17F1`, `$17FF`, `$1810`, `$1893`,
`$18A0`, `$19E5`, `$240D`, `$24FB`) and the 7 DoK analogs (structurally identical shapes
at `$15F0`, `$15FE`, `$160F`, `$1692`, `$169F`, `$17F0`, `$212E`) shows `$4C`/`$4D` is set,
site by site, from **several different sources**, not just the row-pointer helper:

* `$19DC`/`$19E1` (CoK): `LDX $7F41; STX $4C; LDX $7F42; STX $4D` -- loaded directly from
  the shared-globals pair `$7F41`/`$7F42`. DoK's structural analog: `$17E4`/`$17E9`
  (`LDX $7F41; STX $4C; LDX $7F42; STX $4D`, byte-identical operands).
* `$24EB`-`$24F4` (CoK): `ADC $7F43; STA $4C; TXA; ADC $7F44; STA $4D` -- computed from
  `$7F43`/`$7F44` plus an incoming carry. DoK analog `$211E`-`$2127`, same shape.
* CoK `GEN` `$287D`-`$288D`: an INDEPENDENT 8x8->16 multiply (`JSR $3007` with `X=$24`=36,
  not the row-pointer helper's `X=$28`=40) producing `$4C`/`$4D = $4DE0 + slot*36` -- a
  **third, distinct base region** (`$4DE0`, a 36-byte-per-record table, plausibly
  per-character scratch data given `GEN` is the character-generation overlay), unrelated
  to both `$CC00` and the `$7Fxx`-sourced cases above. DoK `GEN`'s own `$4C` site is the
  direct structural analog (not separately walked byte-for-byte here, but same file role
  and same `_CODE_FILES` membership).

**Conclusion**: `$4C`/`$4D` is a general-purpose "current pointer" zero-page pair reused
throughout `DUNGEON` and `GEN` for at least three unrelated purposes (row-pointer-helper
screen output, `$7Fxx`-sourced shared-state pointers, and a `$4DE0`-based per-character
table). A bare `STA ($4C),Y` hit is therefore **not, by itself, evidence of a `$CC00`
write** -- each site's own immediate history has to be checked, which is exactly what
`screen_memory_writes()`'s absolute-only census could never do and what this section's
manual disassembly now has done for all 8 CoK / 7 DoK `DUNGEON` sites plus both titles'
`GEN` site. None of those **17** sites' sources are MON-shaped (a raw `$4000`-based
address, or an offset pattern matching `MON_PAYLOAD_LENGTH`).

> **CORRECTION (2026-08-13):** this sentence originally said "these 16 sites". Its own
> enumerated population is 8 (CoK `DUNGEON`) + 7 (DoK `DUNGEON`) + 1 (CoK `GEN`) + 1 (DoK
> `GEN`) = **17**. Undercounting a population *in the same sentence that enumerates it* is
> the cheap end of the rule-3 failure mode, but it is the same failure: a count asserted
> rather than taken.
>
> Separately, this section's population is now known to be **incomplete, not merely
> miscounted**: `LIBRARY` contains a further **seven** `STA ($4C),Y` sites per title
> (CoK `$2E4F`, `$2F89`, `$2FC9`, `$30E2`, `$337B`, `$4177`, `$4182`; DoK `$2DF8`, `$2F3D`,
> `$2F72`, `$309B`, `$3343`, `$40B8`, `$40C3`), none of them walked. So the conclusion
> "`$4C`/`$4D` is a general-purpose current-pointer pair" **survives and is strengthened**
> — it is reused in a third file too — but the follow-on "none of these sites' sources are
> MON-shaped" is scoped to `DUNGEON` + `GEN` only and must not be read as covering the
> corpus. The seven-per-title LIBRARY sites are an open, un-walked population.

### 14.3 A genuine new finding: a generic NUL-terminated string-copy primitive

While walking the `$4C` sites above, one (CoK `DUNGEON` `$1802`-`$1817`, DoK `DUNGEON`
`$1601`-`$1616`, byte-for-byte identical shape in both titles) turned out to be a
previously undocumented, self-contained routine:

```
CoK DUNGEON $1802-$1817:                    DoK DUNGEON $1601-$1616 (identical shape):
  1802  85 51      STA $51                    1601  85 51      STA $51
  1804  86 52      STX $52                     1603  86 52      STX $52
  1806  20 5E 1C   JSR $1C5E                    1605  20 76 1A   JSR $1A76
  1809  20 88 17   JSR $1788                    1608  20 7B 15   JSR $157B
  180C  A0 00      LDY #$00                     160B  A0 00      LDY #$00
  180E  B1 51      LDA ($51),Y                  160D  B1 51      LDA ($51),Y
  1810  91 4C      STA ($4C),Y                  160F  91 4C      STA ($4C),Y
  1812  F0 03      BEQ $1817                     1611  F0 03      BEQ $1616
  1814  C8         INY                           1613  C8         INY
  1815  D0 F7      BNE $180E                     1614  D0 F7      BNE $160D
  1817  60         RTS                           1616  60         RTS
```

Reading it: the caller passes a **source pointer in A/X**, stored to `$51`/`$52`. `JSR
$1C5E`/`$1A76` (in both titles, a `JMP` into a larger routine, `$171C` CoK / `$150F` DoK --
disassembled and confirmed structurally identical: an operand-fetch dispatcher that reads
a mode byte and, depending on its value, resolves a **destination** address by one of
several means) eventually calls `$1788`/`$157B` (a trivial 3-byte helper, `STA $4C; STX
$4D; RTS`) to land the resolved destination in `$4C`/`$4D`. The loop then copies bytes
from `($51),Y` to `($4C),Y` until it copies a `$00` (the `BEQ` fires **after** the store,
so the terminating NUL itself is written, then the loop exits). This is a plain
"copy/print a NUL-terminated PETSCII string to wherever `$4C`/`$4D` currently points" --
the first primitive this whole investigation has found that is unambiguously a *text*
operation, not a scrub/blank or a numeric-field copy.

**Reached by real code, not a byte alias, in both titles.** Restricting the search to
`_CODE_FILES` members and opcode-exact `JSR`($20)/`JMP`($4C) references to the routine's
entry address (`print_string_routine_callers()`):

* **CoK**: one caller, `DUNGEON` body offset 4427 (`$1913`) -- a `JMP $1802` (a tail call,
  not a subroutine call: whatever called the code at `$1913` gets its return address
  satisfied by the copy routine's own `RTS`). Immediately before it:
  `$1947 A9 00 LDA #$00 ; $1949 A2 7A LDX #$7A ; $194B 4C 02 18 JMP $1802` -- a **literal**
  source pointer, `A=$00, X=$7A` = **`$7A00`**.
* **DoK**: three callers. `DUNGEON` body offset 3914 (`$1037`+... ), the structural analog
  of CoK's own intra-`DUNGEON` `JMP` (same tail-call shape). **Plus two direct `JSR
  $1601`s from `COMPREP`** (combat-encounter setup -- the file section 4/11 already
  centers this whole investigation on), body offsets **719** (`$0ACF`) and **3914**
  (`$174A`). Both are immediately preceded by `JSR $0ED7` (`body[716:722]` /
  `body[3911:3917]` are both `20 D7 0E 20 01 16` = `JSR $0ED7 ; JSR $1601`, byte-identical
  at both sites).

An unrestricted, opcode-unfiltered byte-match search additionally finds `PIC64`/
`SPRITE0C` (CoK) and `ECL21`/`PIC18`/`PIC72` (DoK) naming the same target address --
inspected and confirmed the same false-positive shape this document has already
documented three times (`SPELLE66`, `CODE00` offset 122, `PIC07` offset 1624): either the
wrong opcode entirely (`STA`/`ASL` absolute, not `JSR`/`JMP`) or a real `JSR`/`JMP` byte
pair sitting inside a DATA file (picture/sprite/ECL data) never independently executed.
None of these five are on `_CODE_FILES`, so `print_string_routine_callers()` excludes them
by construction; they are recorded here only so the next reader does not re-discover and
re-doubt them.

### 14.4 Tracing the two resolvable-so-far leads: neither is MON-shaped, and one dead-ends honestly

**CoK's literal source, `$7A00`, traced further.** A census of every `STA`/`STX`/`STY`
absolute write into `$7A00`-`$7AFF` across `_CODE_FILES`, all sides, both titles, finds it
written by **at least 6 different files per title** (CoK: `CAMP`, `COMBAT`, `GDRIVE00`,
`GEN`, `POST.COM`, plus more; DoK: `CAMP`, `CODE00`, `CODE01`, `CODE03`, `COMBAT`,
`GDRIVE00`, `GEN`, `POSTCOM`) for what read as unrelated purposes at every site actually
inspected -- e.g. CoK `COMBAT` offset 342 (`$0956`) copies up to 3 bytes from
`$7E89`-`$7E8B` while **skipping** zero bytes (a small flag/digit compaction, not a name
copy), and CoK `COMBAT` offset 850 (`$0B52`) copies up to 57 bytes from `$7C20`-`$7C58`
**read backward** (`X` descending) while skipping zeros and writing forward (`Y`
ascending) -- a leading-zero-suppression shape typical of formatting a fixed-width
numeric/BCD field for display, not a straightforward name copy. `$7A00` reads as a
shared, multi-owner "current string to print" scratch buffer used by several unrelated
subsystems (menus, combat status text, character generation), not a name-specific
staging area, and **not** the raw `$4000` MON buffer by any measure taken here.

**DoK COMPREP's two calls -- the most promising lead this document has found, and still
genuinely unresolved.** Unlike CoK's literal case, both DoK `COMPREP` call sites are
preceded by `JSR $0ED7`, not an immediate load -- so the source pointer handed to the
copy routine is whatever `$0ED7`'s own execution leaves in A/X at its `RTS`. Disassembling
`$0ED7`: it is a ~64-iteration (`INC $7EB4; ... ; CMP #$40; BCC loop`) per-combatant-slot
loop with multiple internal branches (calling `$3349`, testing `$7D00`/`$7D0C`, an
alternate exit through `$0F11`/`$0F6A`) whose **every exit path shares the identical tail**
`INC $7EB4 ; LDA $7EB4 ; CMP #$40 ; BCC <loop> ; RTS` -- meaning **on normal loop
completion, A is always `$40`** (the loop's own terminal counter value) at the `RTS`,
regardless of which branch was taken inside. What `X` holds at that point was **not**
resolved in this round -- it depends on which of several internal code paths (including a
nested call to `$3349` and a table-indexed lookup at `$10FF`/`$11B7`/`$11E6`) executed
last, and pinning it exactly requires full dataflow tracing through that subroutine, which
this round's budget did not extend to.

**This is reported as an open, specific, static-only next step, not a guess.** Two things
would close it without any dynamic trace: (1) fully dataflow-trace `$0ED7` (all of its
internal branches) to determine what value ends up in `X` at every one of its RTS
instructions -- if it is a table-derived per-combatant slot index rather than a fixed
literal, the resulting pointer is very likely `$40`+`X*$100`-shaped and would need `X`'s
provenance chased one level further; (2) fully decode the operand-fetch dispatcher
(`$1C5E`/`$171C` CoK, `$1A76`/`$150F` DoK) that resolves the **destination** `$4C`/`$4D`
for this call, since even a resolved source is only half the picture -- if the destination
resolves to `$CC00`-range for this specific call site (plausible, since it's called from
combat-encounter setup, the exact context section 4/11 already ties to on-screen
combatant display), this would be the first confirmed text-populating write this whole
investigation has looked for. Neither task was completed this round; both are named
precisely so the next static pass does not have to re-derive them from scratch.

### 14.5 What the `LIBRARY` exclusion was hiding: a real screen-text writer in the resident kernel

Widening the census to include `LIBRARY` (§14.1's correction) surfaces **one** `STA ($4E),Y`
per title, and it is not incidental — it is the store at the centre of a compact
NUL-terminated **string-print loop**, in the always-resident kernel, writing through the
very pointer pair `$2E9A`/`$2E49` loads. `LIBRARY` body offset 0 is `KERNEL_ORIGIN` =
`$2DC8`, so:

```
CoK $2ECC..$2F0F:                        DoK $2E7B..$2EBE:
  2ECC  20 28 2E   JSR $2E28              2E7B  20 D1 2D   JSR $2DD1
  2ECF  AD CD 03   LDA $03CD              2E7E  AD CD 03   LDA $03CD
  2ED2  20 9D 2E   JSR $2E9D   <-- (a)    2E81  20 4C 2E   JSR $2E4C   <-- (a)
  2ED5  A0 00      LDY #$00               2E84  A0 00      LDY #$00
  2ED7  B1 07      LDA ($07),Y <-- (b)    2E86  B1 07      LDA ($07),Y <-- (b)
  2ED9  F0 34      BEQ $2F0F   <-- (c)    2E88  F0 34      BEQ $2EBE   <-- (c)
  2EDB  29 BF      AND #$BF    <-- (d)    2E8A  29 BF      AND #$BF    <-- (d)
  2EDD  AC CC 03   LDY $03CC   <-- (e)    2E8C  AC CC 03   LDY $03CC   <-- (e)
  2EE0  91 4E      STA ($4E),Y <-- (f)    2E8F  91 4E      STA ($4E),Y <-- (f)
  2EE2  AD 86 02   LDA $0286   <-- (g)    2E91  AD 86 02   LDA $0286   <-- (g)
  2EE5  91 A3      STA ($A3),Y            2E94  91 A3      STA ($A3),Y
  2EE7  AD FC 03   LDA $03FC              2E96  AD FC 03   LDA $03FC
  2EEA  F0 0E      BEQ $2EFA              2E99  F0 0E      BEQ $2EA9
  2EEC  8C E0 03   STY $03E0              2E9B  8C E0 03   STY $03E0
  2EEF  AA         TAX                    2E9E  AA         TAX
  2EF0  A9 00      LDA #$00               2E9F  A9 00      LDA #$00
  2EF2  85 B1      STA $B1                2EA1  85 B1      STA $B1
  2EF4  20 FA 2F   JSR $2FFA              2EA3  20 A3 2F   JSR $2FA3
  2EF7  AC E0 03   LDY $03E0              2EA6  AC E0 03   LDY $03E0
  2EFA  E6 07      INC $07                2EA9  E6 07      INC $07
  2EFC  D0 02      BNE $2F00              2EAB  D0 02      BNE $2EAF
  2EFE  E6 08      INC $08                2EAD  E6 08      INC $08
  2F00  C8         INY                    2EAF  C8         INY
```

**(a) is the decisive line.** `$2E9D` / `$2E4C` is not a separate routine — it is
`$2E9A` / `$2E49` (§11.1's two-line wrapper) **entered at +3**, skipping its leading
`LDA $03CD` because the caller already loaded `A` at `$2ECF` / `$2E7E`. So control falls
straight into `JSR $2E84` / `JSR $2E2D` (§11.2's row-address calculator) followed by
`STA $4E; STX $4F`. **`$4E`/`$4F` therefore holds `$CC00 + row*40` at the moment of the
store at (f)** — §11 already proved that pointer points at screen memory, not the MON
buffer.

The rest reads exactly as a text writer: **(b)** fetches the next byte from a
caller-supplied source pointer in `$07`/`$08`, **(c)** terminates on NUL, **(d)** masks
`#$BF` (the PETSCII→screen-code fold), **(e)** takes the column from `$03CC`, **(f)**
stores the character, **(g)** writes the current foreground colour (`$0286`) to the
parallel colour-RAM pointer `($A3),Y`, and the tail advances the source pointer and column
and loops. `$03CD` (the row/field index) and `$03CC` (the column) are the same globals
`c64-resident-kernel.md` already ties to the field-editor cluster around `$2EA5`.

**Why this matters for the open question.** It is a masked, counted, coloured,
multi-character copy from an arbitrary caller-supplied pointer straight into
`$CC00`-mapped screen memory — a structurally *better* MON-text-writer candidate than the
`DUNGEON` `$1802`/`$1601` primitive §14.3 found, whose destination still has to be chased
through an operand dispatcher before it can be shown to reach `$CC00` at all. Here the
destination is settled by construction; what is unresolved is the **source**: who sets
`$07`/`$08`, and whether any caller points it at a MON payload.

**Explicitly not claimed.** This routine's callers were **not** traced this round, so
nothing here says a MON record ever reaches it. Its own colour/field-index globals suggest
a general-purpose kernel print used by menus and the character-name editor alike, which
would make MON text one possible client among many rather than its purpose. The honest
statement is: **the strongest-shaped candidate found so far, with its caller set entirely
un-enumerated.** Tracing `$07`/`$08`'s writers across `_OPERATION_CENSUS_FILES` is the
concrete next step, and it needs no dynamic trace.

### 14.6 Net effect on `tools/c64_mon.py` and the DoK hp question

* Added (diagnostic only, no new `MonRecord` fields, consistent with the module's
  "deliberately narrow" charter): `_PRINT_STRING_ROUTINE`, `zp_indirect_store_census()`,
  `print_string_routine_callers()`. New test file `tools/test_c64_mon_hp.py` (7 tests, all
  passing against the real disks) pins the exact counts and byte windows cited above.
  Mutation-tested per this project's standing rule 6: flipping the opcode filter in
  `zp_indirect_store_census` from `("STA", c64d.IZY)` to `("STA", c64d.IZX)` drops CoK's
  total from 174 to 104 and fails 2 of 3 `ZpIndirectStoreCensusTests` (RED, confirmed);
  restricting `print_string_routine_callers`'s opcode filter from `(0x20, 0x4C)` to just
  `(0x20,)` (dropping the `JMP` case) empties both titles' intra-`DUNGEON` tail-call hits
  and fails 2 of 3 `PrintStringRoutineCallerTests` (RED, confirmed); replacing
  `_OPERATION_CENSUS_FILES[title]` with the full unrestricted `bodies` dict in
  `zp_indirect_store_census` lets a data-file name leak into the result and fails
  `test_census_only_counts_established_code_files` (RED, confirmed). All three mutations
  were reverted after confirming red; the full test suite passes clean at HEAD (also
  reverified: `tools/test_c64_mon.py`'s pre-existing 27 tests still pass unchanged).
* **Scope correction, same day (§14.1):** both new functions now census
  `_OPERATION_CENSUS_FILES` (= `_CODE_FILES` **plus `LIBRARY`**) rather than `_CODE_FILES`.
  Widening `print_string_routine_callers` changed nothing — `LIBRARY` holds zero
  opcode-exact `JSR`/`JMP` references to either title's `$1802`/`$1601` entry, verified by
  direct byte scan — and that null is recorded deliberately: *"the widened scan found no new
  hits"* and *"the scan was never widened"* are different facts, and only one of them is
  evidence. Widening `zp_indirect_store_census` changed the totals (§14.1) and surfaced
  §14.5.
* **The DoK hp @40-vs-@214 question is still open.** This round did not settle it. What
  changed: the false idiom-narrowness in `screen_memory_writes()` (absolute-mode-only) is
  now closed by `zp_indirect_store_census()`, and a real, specific, not-yet-fully-traced
  lead exists for the first time (DoK `COMPREP`'s two direct calls into the newly-found
  string-copy primitive) -- but its source pointer is not yet resolved, so it cannot yet
  be used to argue anything about MON records one way or the other. The honest state is:
  closer to a real candidate consumer than any prior round, not yet at one.

Reproduce every claim in this section:

```
python -m pytest tools/test_c64_mon_hp.py -v
python -c "import sys; sys.path.insert(0,'tools'); import c64_mon as mon
print(mon.zp_indirect_store_census('cok')); print(mon.zp_indirect_store_census('dok'))
print(mon.print_string_routine_callers('cok')); print(mon.print_string_routine_callers('dok'))"
python tools/c64_disasm.py <DUNGEON, cok> --org 0x0800 --start 0x1802 --count 8
python tools/c64_disasm.py <DUNGEON, dok> --org 0x0800 --start 0x1601 --count 8
python tools/c64_disasm.py <COMPREP, dok> --org 0x0800 --start 0x0ED7 --count 30
```

## 14.7 C1.6: the print loop's own `$07`/`$08` source pointer, traced

Section 14.5 settled the print loop's *destination* ($4E/$4F = $CC00 + row*40) but left the
*source* — who sets `$07`/`$08` — "entirely un-enumerated," naming that as the concrete next
step. This section closes it: every OPERATION that can write `$07` or `$08`, the loop's own
entry points and real callers, and (the round-7 "ALSO") all fourteen `STA ($4C),Y` sites
section 14.2 had flagged open. **Bottom line up front, refutation-graded**: the lead is **not
refuted** (the loop is now a proven general-purpose print, called from ~30+ established-code
sites), but it is **further downgraded**, not strengthened. Of every writer this round could
resolve, **zero** point at the external `$4000` MON staging buffer. Exactly **one** resolved
source lands inside the raw `$4000`-`$41E0` numeric window — and it is a proven **self-
reference** to LIBRARY's own embedded UI string ("TRADE TO ?"), the identical
address-coincidence ambiguity section 12 already diagnosed for a different window, now
confirmed for this specific pointer pair too.

### 14.7.1 The census (task a): every OPERATION touching `$07`/`$08`

Per standing rule 5, the search is for every opcode that can WRITE a zero-page byte outright:
`STA`/`STX`/`STY` zero-page (`$85`/`$86`/`$84`), plus `INC`/`DEC` zero-page (`$E6`/`$C6` —
the loop's own tail uses `INC $07`/`INC $08` to advance the pointer, so a write-operation
census that omitted them would be incomplete by the loop's own construction). File set is
`_OPERATION_CENSUS_FILES` (rule 2 justification: this is the SAME file set section 14.1
already established is correct for an *operation* census — `_CODE_FILES` plus `LIBRARY`,
since `_CODE_FILES` alone deliberately excludes the resident kernel for a different, narrower
purpose). New function `tools/c64_mon.py::source_pointer_writer_census()`.

| Title | total hits | distinct files |
| --- | ---: | ---: |
| CoK | **72** (35 at `$07`, 37 at `$08`) | 8 |
| DoK | **82** (40 at `$07`, 42 at `$08`) | 11 |

Per-file breakdown (both titles, reproducible with `mon.source_pointer_writer_census(title)`):

CoK: `CAMP` 5, `COM.PREP` 4, `DUNGEON` 11, `GDRIVE00` 4, `GEN` 12, `INIT` 6, `LIBRARY` 22,
`POST.COM` 8.
DoK: `CAMP` 5, `CODE00` 9, `CODE03` 2, `COMPREP` 4, `DUNGEON` 7, `GDRIVE00` 4, `GDRIVE04` 2,
`GEN` 11, `INIT` 7, `LIBRARY` 22, `POSTCOM` 9.

`LIBRARY`'s 22-per-title figure INCLUDES the loop's own bookkeeping — `INC $07`/`INC $08` at
CoK offset 306/310 (address `$2EFA`/`$2EFE`) and DoK offset 225/229 (`$2EA9`/`$2EAD`),
byte-identical to section 14.5's quoted block — which is the loop advancing its OWN pointer
per character, not an external writer setting an initial value. `_LOOP_SELF_ADVANCE_INC07`
names it explicitly so it is never silently double-counted as a 23rd distinct writer.

### 14.7.2 The loop's own entry points and their real callers (task d)

Disassembling outward from section 14.5's quoted block (`$2ECC`/`$2E7B`) shows it is not one
entry point — it is the tail of a larger LIBRARY cluster with **five** real entries, each
confirmed by direct instruction-boundary disassembly (CoK shown; DoK is structurally
identical at its own addresses):

```
$2EA5  STA $03CD          field_setter: caller passes row=A, col=Y, falls through
       STY $03CC
$2EAB  LDY $08             param_entry: reads $08 (see note below), bank-switch-guards
       JSR $4843            a call, then falls into the row-wrap-then-print sequence
       ...
$2ECF  LDA $03CD          row_post_entry: LIBRARY's own jump-table slot 5 (CoK only)
       JSR $2E9D
$2ECC  JSR $2E28          loop_start: the exact address section 14.5 quotes
$41E3  STA $7FFE          global_ptr_entry: STA/STX a caller-supplied A/X to $7FFE/$7FFF,
       STX $7FFF            then copies THAT into $07/$08 and falls into param_entry
       ...
       LDA $7FFE
       STA $07
       LDA $7FFF
       STA $08
       JSR $2EAB
```

New constants/functions: `PRINT_LOOP_ENTRIES`, `print_loop_entry_callers()`. Real,
opcode-exact (`JSR`/`$20` or `JMP`/`$4C`, absolute mode), `_OPERATION_CENSUS_FILES`-
restricted caller counts:

| Entry | CoK callers | DoK callers |
| --- | ---: | ---: |
| `loop_start` ($2ECC/$2E7B) | **0** | **0** |
| `field_setter` ($2EA5/$2E54) | 1 (LIBRARY jump-table slot 6, `JMP`) | **0** |
| `row_post_entry` ($2ECF/$2E7E) | 1 (LIBRARY jump-table slot 5, `JMP`) | **0** |
| `param_entry` ($2EAB/$2E5A) | **22** across CAMP/DUNGEON/GEN/INIT/POST.COM/LIBRARY | **26** across CAMP/CODE00/CODE03/DUNGEON/GDRIVE04/GEN/INIT/POSTCOM/LIBRARY |
| `global_ptr_entry` ($41E3/$4141) | **10** across CAMP/DUNGEON/GEN/LIBRARY | **9** across CAMP/CODE01/DUNGEON/GEN |

`loop_start` — the exact address section 14.5's quoted block begins at — has **zero**
opcode-exact `JSR`/`JMP` references anywhere in either title's entire corpus (all bodies, all
sides, unrestricted, not just established code). It is reached ONLY by fall-through from the
row-wrap comparison immediately before it (`CMP $03F5; BCC $2ED2` — if not taken, execution
falls straight into `$2ECC`). This settles the letter of task (d): the "loop's own entry
point" that section 14.5 quotes is not itself a callable target at all.

`param_entry` is the cluster's real front door: **48 combined established-code call sites**
(22 CoK + 26 DoK) spanning CAMP, DUNGEON, GEN, INIT, POST.COM/POSTCOM, CODE00/CODE03,
GDRIVE04, and LIBRARY-internal — i.e. nearly every overlay family in the corpus. This is the
first ENUMERATED population behind section 14.5's "suspected general-purpose kernel print
used by menus and the name editor alike" hedge; the hedge is now a measured fact, not a
suspicion. An unrestricted byte-match sweep (data files included) found 5 additional
data-file hits for `param_entry` (`ECL64`, `SPELLN64`, `SPELLE20` families) — inspected and
confirmed the same byte-alias shape this document has already documented four times
(`SPELLE66`, `CODE00` offset 122, `PIC07` offset 1624, `PIC64`/`SPRITE0C`/`ECL21`/`PIC18`/
`PIC72`); excluded by the established-code allowlist, not individually re-vetted per-call.

`global_ptr_entry` is a genuinely SECOND front door, independent of `param_entry`'s own
population (its callers set A/X and JSR here; THIS routine reroutes through `$7FFE`/`$7FFF`
before falling into `param_entry` itself) — 19 combined established-code call sites (10 CoK +
9 DoK). Notably `CODE01` (dok) calls `global_ptr_entry` but has **zero** direct `$07`/`$08`
writes of its own in the section 14.7.1 census — its source pointer is entirely resolved by
tracing `global_ptr_entry`'s caller (below), not by a local zero-page write, which is exactly
why the OPERATION census (14.7.1) alone is not sufficient to enumerate every effective writer
of `$07`/`$08` and the entry-point census here is a necessary second pass.

### 14.7.3 Resolving writers (task b): literal, table, copy, or unresolved

**LIBRARY's own 22-per-title population — fully walked**, using `library_trace_seeds()` (the
same real, coverage-measured control-flow trace section 13 built) to find a verified
instruction boundary before each site, then disassembling forward from it:

| CoK offset | Source | Resolved address / mechanism |
| --- | --- | --- |
| 306/310 | `INC $07`/`INC $08` | the loop's own advance (§14.7.1) |
| 996/1000 | `LDA #$D0; LDA #$03` | literal `$03D0` |
| 1631/1635 | `LDA #$30; LDA #$34` | literal `$3430` |
| 1660/1665 | `LDA $9E8C,X` / `LDA $9F8C,X` | X-indexed lo/hi message table, base `$9E8C`/`$9F8C` (outside every file body this project can read — see honest gaps) |
| 1727/1731 | `LDA #$00; LDA #$7C` | literal `$7C00` |
| 3257/3262 | `LDA $9E00,X` / `LDA $9F00,X` | a SECOND X-indexed lo/hi table, base `$9E00`/`$9F00` |
| 3846/3848 | `STX $07; STY $08` | caller-supplied X/Y register pair (source not traced further) |
| 3963/3967 | `INC $07`/`INC $08` | a DIFFERENT, self-contained "skip to string end" utility (`$3D43`) — reused idiom, not this task's loop |
| 3987/3989 | `STX $07; STY $08` | caller-supplied X/Y register pair (not traced further) |
| 5176/5181 | `STA $07`; `LDA $7FFE; LDA $7FFF; STA $08` | copy of `$7FFE`/`$7FFF` — this IS `global_ptr_entry`'s own body |
| 5442/5444 | `STA $07; STX $08` | tail-call (`JMP $3DE8`); A/X provenance not traced (48 combined callers of `$3DE8`, out of budget) |

DoK's **eleven pairs (22 sites)** are structurally identical at their own addresses, same
mechanisms, same literals (`$03D0`, `$7C00`) except one: DoK's analog of CoK's `$3430`
literal is `$33CD` (LIBRARY offsets 1532/1536, `LDA #$CD; LDA #$33`) — not byte-identical to
CoK there, unlike most of this corpus's cross-title pairs. In CoK's row order:

| CoK offset | DoK offset | Resolved address / mechanism |
| --- | --- | --- |
| 306/310 | 225/229 | `INC $07; BNE +2; INC $08; INY` — the loop's own advance |
| 996/1000 | 925/929 | `LDA #$D0; STA $07; LDA #$03; STA $08` → literal `$03D0` |
| 1631/1635 | 1532/1536 | literal — `$3430` (CoK) vs `$33CD` (DoK), the one non-identical pair |
| 1660/1665 | 1561/1566 | X-indexed lo/hi message table |
| 1727/1731 | 1628/1632 | `LDA #$00; STA $07; LDA #$7C; STA $08` → literal `$7C00` |
| 3257/3262 | 3114/3119 | second X-indexed lo/hi table |
| 3846/3848 | 3697/3699 | `STX $07; STY $08` — caller-supplied register pair |
| 3963/3967 | 3814/3818 | the separate "skip to string end" utility's own advance |
| 3987/3989 | 3838/3840 | `STX $07; STY $08` — caller-supplied register pair |
| 5176/5181 | 5008/5013 | copy of `$7FFE`/`$7FFF` — `global_ptr_entry`'s own body |
| 5442/5444 | 5267/5269 | `STA $07; STX $08` before a tail-call |

**CORRECTED 2026-08-13.** This paragraph said "DoK's twelve sites" and then enumerated only
seven offset pairs inline (plus 1532/1536 named separately in the next clause) — so the count
disagreed with this section's own "22-per-title" heading two paragraphs above, AND the
enumeration was three pairs short. `source_pointer_writer_census('dok')['LIBRARY']` returns
22 hits = 11 pairs for DoK exactly as it does for CoK; the omitted pairs were 225/229,
925/929 and 1628/1632, each disassembled above and each the direct analog of a CoK row that
was already listed. The count is a pair count vs. a site count confusion in one direction and
an incomplete enumeration in the other; neither number, 12 nor the implied 8, was right.

**`global_ptr_entry`'s 19 real callers — fully resolved, both titles.** Each stores a
caller-loaded A/X into `$7FFE`/`$7FFF`, which the routine immediately copies to `$07`/`$08`:

CoK (10): CAMP offset 569 (`LDA #$E1; LDX #$25` → `$25E1`), CAMP 4030 (`$D3`/`$27` →
`$27D3`), DUNGEON 7474 (`$32`/`$0C` → `$0C32`), DUNGEON 8439 (`LDA $7F41; LDX $7F42` —
copy of shared globals, not a literal), GEN 3669 (`$93`/`$16` → `$1693`), GEN 5560
(`LDA $2BF6,Y; LDX $2C27,Y` — Y-indexed table internal to GEN's own body), GEN 5712
(`$67`/`$1E` → `$1E67`), GEN 6395 (`$08`/`$22` → `$2208`), GEN 6774 (`$8A`/`$22` →
`$228A`), LIBRARY offset 5903 (`JMP`, LIBRARY-internal, not traced further).

DoK (9): CAMP 550 (`$BC`/`$24` → `$24BC`), CAMP 3928 (`$AE`/`$26` → `$26AE`), DUNGEON 7312
(`LDA $7F41; LDX $7F42` — same shared-global copy as CoK's DUNGEON site), CODE01 78
(`$9C`/`$23` → `$239C`), GEN 4101 (`$56`/`$18` → `$1856`), GEN 6498 (`LDA $2C8D,Y;
LDX $2CBC,Y` — Y-indexed, GEN-internal), GEN 6647 (`$0E`/`$22` → `$220E`), GEN 7338
(`$B1`/`$25` → `$25B1`), GEN 7702 (`$2A`/`$26` → `$262A`).

**Every one of these 19 resolved literal addresses is outside `$4000`-`$41E0`.** The two
"copy of `$7F41`/`$7F42`" sites (CoK DUNGEON 8439, DoK DUNGEON 7312 — byte-identical
`LDA $7F41; LDX $7F42` in both titles) and the two GEN Y-indexed-table sites are not
literal-resolved, but their mechanisms (a fixed shared-global pair already known from
section 14.2's DUNGEON `$4C` analysis, and a table based well inside GEN's own body) give no
reason to suspect `$40xx`, and a direct check bears that out — see 14.7.4.

**A private, un-JSR'd literal — the one hit inside the MON window.** Tracing `global_ptr_
entry`'s own body one more instruction back (past `$7FFE`/`$7FFF`, reached by real
control-flow trace per `library_trace_seeds()` but not from a directly-JSR'd boundary this
round — see honest gaps) finds, in DoK LIBRARY only:

```
DoK $413D-$4144:
  413D  A9 29      LDA #$29
  413F  A2 41      LDX #$41
  4141  8D FE 7F   STA $7FFE
  4144  8E FF 7F   STX $7FFF
```

`A=$29, X=$41` → address **`$4129`** — inside the `$4000`-`$41E0` MON payload window. LIBRARY
body offset `$4129 - $2DC8 = 865`; reading those bytes directly from the real DoK LIBRARY
body: `body[865:875] = b'TRADE TO ?\x00'` — a NUL-terminated PETSCII prompt string embedded
in LIBRARY's OWN resident body (a trading-screen UI prompt, consistent with the "menus"
half of section 14.5's hedge), landing at `$4129` by pure numeric coincidence with the
external `$4000` MON buffer's address range. **This is exactly the ambiguity section 12
already proved for a different window** ("LIBRARY's own proven-resident body ENTIRELY
CONTAINS the `$4000`-`$41E0` window... any hit is indistinguishable, by address alone,
between the external buffer and LIBRARY's own body — and it is always the latter") — now
independently reproduced for the `$07`/`$08` pointer specifically, not just the earlier
absolute-operand window. CoK has no confirmed byte-identical analog of this specific private
preamble (its `global_ptr_entry` is reached cleanly by `JSR`/`JMP` from its 10 established
callers with no un-called private literal preceding it in the disassembled window) — a
genuine cross-title structural difference, not re-derived further this round.

**Three literal-load `$07`/`$08` writers outside LIBRARY, fully disassembled (not just
`immediate_before`-flagged) — all resolved, all non-MON:**

* CoK `COM.PREP` (4 sites) / DoK `COMPREP` (4 sites): `LDA #$E0; STA $07; LDA #$4D; STA $08`
  → literal **`$4DE0`**, then `LDY #$00; LDA ($07),Y` reads 17 bytes through it (processing
  each with `JSR $1295`/copying to a second buffer at `$9668`), advancing via the file's own
  local `INC $07;BNE;INC $08` micro-routine (the `INC`/`DEC` pair the section 14.7.1 census
  already counted at offset 2688/2692 CoK, 2714/2718 DoK). `$4DE0` is the SAME base section
  14.2 already found GEN computing via an independent 8×36 multiply (`GEN`'s own `$4C`/`$4D`
  site) — this is a NEW confirmed READER of that per-character scratch table, not a new
  buffer.
* CoK `INIT` (first 4 of 6 sites) / DoK `INIT` (first 4 of 7): `LDA #$E0; STA $07; LDA #$4D;
  STA $08` → literal `$4DE0` again, but here INIT WRITES it: an 8-outer × 36-inner
  (`CPX #$24`=36) fill loop, `LDA $0B3F,X; STA ($07),Y` (Y fixed at 0, X 0..35), advancing
  via the file's own `INC $07;BNE;INC $08` (the census's INC/DEC pair at offset 824/828 CoK,
  829/833 DoK). This closes the loop on `$4DE0`: INIT initializes an 8-slot × 36-byte
  per-character scratch table at boot, GEN indexes into it per character, COM.PREP/COMPREP
  reads a slice of it during combat prep — a coherent, fully-resolved, entirely non-MON
  subsystem. INIT's remaining 2 sites (offset 1414/1419 CoK, 1417/1422 DoK) were NOT walked
  this round.
* CoK `POST.COM` (4 of 8 sites) / DoK `POSTCOM` (4 of 9): `LDA #$1F; STA $07; LDA #$26;
  STA $08` (CoK) → literal **`$261F`**, immediately followed by `JSR $2EAB` (`param_entry`)
  — printing a literal string. Reading POST.COM's own body at that offset: `b'SELECT COIN
  TYPE TO \x00TAKE\x00DROP\x00TRADE\x00...'` — a real, human-readable UI prompt (the
  post-combat coin-division screen), embedded in POST.COM's own body, printed through this
  exact loop. DoK's analog (`$209E`) reads the identical string. The immediately-following
  4 sites (offset 7603/7608 CoK, 6199/6204 DoK) are a Y-indexed table lookup
  (`LDY $7E62; LDA $2644,Y; STA $07; LDA $2647,Y; STA $08`) into a SECOND message
  (presumably `TAKE`/`DROP`/`TRADE`, selected by the player's menu choice), base address
  `$2644`/`$2647` well inside POST.COM's own ~9KB body — not walked further, but far outside
  `$4000`-`$41E0`. POST.COM's remaining 4 sites (offset 1677/1682, 7126/7131) were NOT
  walked this round.
* DoK `CODE00` (2 of 9 sites): `LDA #$F6; STA $07; LDA #$83; STA $08` → literal `$83F6`, not
  walked further (outside `$4000`-`$41E0` regardless).

**A final, cheap, corpus-wide check** (task c's most direct form): for every `STA`/`STX`/`STY
$08` site in the full 154-site census (29 CoK + 33 DoK of the 154 are `$08` stores; the rest
write the low byte `$07`, which cannot select a page), scan the 8 bytes immediately before it
for an immediate load of `$40` (`LDA #$40`/`LDX #$40`/`LDY #$40` — i.e. anyone literally
reaching for the MON page's own high byte). **Zero hits, both titles.** This does not prove
every *unresolved* site is innocent (a computed/copied source could still resolve to `$40xx`
through a chain this round didn't fully trace), but it rules out the cheapest and most
common 6502 idiom for doing so — a fixed immediate literal — across the ENTIRE writer
population, not just the ~47% (68/154) individually disassembled above.

> **CORRECTED 2026-08-13 — the sweep is now code, and the 8-byte window was hiding two hits.**
>
> This check existed only as prose: there was no function in `tools/c64_mon.py` and no test
> anywhere, while §14.7.4 below leaned on it as "the strongest and most direct evidence this
> investigation has produced". Re-running it from scratch reproduces the zero-hit result at
> the documented 8-byte window exactly — but the window width was an unexplained magic number,
> and widening it is **not** clean:
>
> | window | CoK | DoK |
> | ---: | --- | --- |
> | 8 | — | — |
> | 16 | — | — |
> | 32 | — | LIBRARY `(store 5269, LDX, load 5239)` |
> | 64 | LIBRARY `(store 5444, LDX, load 5406)` | LIBRARY `(store 5269, LDX, load 5239)` |
>
> Both are the same cross-title pair, and both are excluded — but on an argument the 8-byte
> window was concealing rather than making. From the raw bytes: each is `LDX #$40; LDY #$0D;
> JSR $343E` (DoK `$33DB`), so the `#$40` is consumed as that subroutine's own X/Y parameter
> pair; and the `STA $07; STX $08` further along is preceded by `JMP $3DE8` (DoK `JMP $3D3A`),
> so it is the jump *target's* body, not a fall-through continuation of the `LDX` site. The
> negative survives; the reasoning behind it is now explicit.
>
> Both the empty widths and the two non-empty ones are pinned by
> `mon_page_immediate_sweep()` + `MON_PAGE_SWEEP_EXPECTED` and four tests in
> `tools/test_c64_mon_hp.py` (`MonPageImmediateSweepTests`), mutation-tested four ways
> (matching any `0x40` byte rather than one after an immediate-load opcode; admitting `$07`
> low-byte stores; changing `MON_PAGE_HIGH_BYTE` to `0x41`; multiplying the window by 8 — all
> RED, all reverted). Pinning the *non-empty* widths is deliberate: it keeps the excluded hits
> on the record instead of tuning them away, and it makes a future accidental widening of the
> window fail loudly rather than turn into a false negative.

### 14.7.4 Does any resolved source land in the MON window? (task c, direct answer)

**Yes, exactly one** — the DoK `$4129` "TRADE TO ?" hit in section 14.7.3 — and it is a
proven self-reference to LIBRARY's own resident body, not the external `$4000` MON staging
buffer. Every OTHER resolved source (18 more literals, 4 table bases, 2 shared-global
copies, the loop's own self-advance) lands outside `$4000`-`$41E0`, and the blanket
"literal `$40xx` load near a `$08` write" sweep found nothing further (at the documented
8-byte window; see the correction box in §14.7.3 for the two wider-window hits and why they
are excluded). This is the strongest and most direct evidence this investigation has produced
against the print loop as a MON-text consumer: not merely "no consumer found" (the honest-negative shape every prior round
reported) but "the one place a resolved source DOES land in the window turns out to be
self-referential," independently reproducing section 12's diagnosed ambiguity for this
specific pointer pair.

### 14.7.5 The seven `STA ($4C),Y` LIBRARY sites per title, walked (round-7 "ALSO")

All **14** (7 CoK + 7 DoK) are walked this round — the population section 14.2's correction
flagged as open. New constant `LIBRARY_STA_4C_SITES` (labels below) + `check_library_4c_
sites()` (byte-exact verification every listed address really decodes as `STA ($4C),Y`,
opcode `$91` operand `$4C` — all 14 confirmed `True`).

| Role | CoK addr | DoK addr | `$4C`/`$4D` source |
| --- | --- | --- | --- |
| row copy from `($A7),Y` | `$2E4F` | `$2DF8` | `JSR $2E84`/`$2E2D` (the row-pointer helper, section 11) sets `$4C`/`$4D`; the BYTE READ comes from a caller-supplied `$A7`/`$A8` pointer, not `$07`/`$08` |
| blank-fill (literal space) | `$2F89`, `$2FC9` | `$2F3D`, `$2F72` | row-pointer helper sets `$4C`/`$4D`; source is the literal `LDA #$20` (ASCII space) — a "clear this screen row" utility, two independent call sites per title |
| putchar + colour | `$30E2` | `$309B` | caller pre-sets `$4C`/`$4D` (and `$A3`/`$A4`) before calling; this tiny 8-byte routine (`STA ($4C),Y; PHA; LDA $0286; STA ($A3),Y; PLA; RTS`) is a standalone callable version of section 14.5's own instructions (f)+(g) |
| font/bitmap two-plane copy | `$337B` | `$3343` | `LDY #$00; LDA $7C00,Y; STA ($3F),Y; LDA $7D20,Y; STA ($4C),Y; INY; BNE loop` — copies TWO parallel 256-byte source planes (`$7C00`, `$7D20`) into TWO destination pointers; identical source addresses in both titles |
| hex-nibble format | `$4177`, `$4182` | `$40B8`, `$40C3` | `$4C`/`$4D` freshly set from an X/Y-indexed lookup table (`$9EE6,Y`/`$9FE6,Y` CoK) local to this routine; formats one byte as two hex/decimal digit characters via a table (`$40C7,Y` CoK — inside LIBRARY's own body, another `$40xx` self-reference, this time a READ not a `$07`/`$08` write) |

**None of the fourteen reads through `$07`/`$08`** — cross-checked against
`source_pointer_writer_census()`: none of the 14 addresses (as LIBRARY body offsets) appear
in that census (pinned by `test_none_of_the_seven_sites_reads_through_07_08`). This further
widens section 14.2's "general-purpose current-pointer pair" finding for `$4C`/`$4D`: SEVEN
distinct purposes are now attested in LIBRARY alone (row-pointer-helper screen output,
`$7Fxx`-sourced pointers, the `$4DE0`-based table, `($A7),Y` row-copy, space-fill, putchar+
colour, font-bitplane-copy, hex-nibble-format — several already counted in section 14.2's
DUNGEON/GEN pass), none of them this task's `$07`/`$08` idiom.

### 14.7.6 What was NOT walked this round (honest gaps)

Per the task's own instruction, exactly which sites were and were not individually
disassembled:

* **Fully walked with real, trace-verified disassembly**: all 44 LIBRARY sites (22 CoK + 22
  DoK, including the loop's own self-advance), all 8 `COM.PREP`/`COMPREP` sites, the first 8
  of 13 `INIT` sites (4 CoK + 4 DoK — the `$4DE0` init-fill loop), the first 8 of 17
  `POST.COM`/`POSTCOM` sites (4 CoK "SELECT COIN TYPE" literal + 4 CoK table-indexed — DoK
  analogous), all 19 `global_ptr_entry` established-code callers, and all 14
  `STA ($4C),Y` sites. **68 of 154** `$07`/`$08` writer sites (44%) carry a real disassembled
  classification; the remaining 86 are counted (section 14.7.1) but not individually
  disassembled: all of `CAMP` (10), all of `DUNGEON`'s non-LIBRARY sites (18), all of
  `GDRIVE00` (8) and `GDRIVE04` (2), all of `GEN`'s OWN direct `$07`/`$08` writes (23 — NOT
  the same population as `GEN`'s `global_ptr_entry`-caller sites, which ARE resolved), all of
  `CODE03` (2), 7 of 9 `CODE00` sites, 2 of 6 `INIT` sites, and 9 of 17 `POST.COM`/`POSTCOM`
  sites.
* **Table CONTENTS not resolved**: the two X-indexed message-lookup tables LIBRARY itself
  uses (`$9E8C`/`$9F8C` and `$9E00`/`$9F00`) sit outside every file body this project's
  `all_bodies()`/`c64_kernel` machinery can read under any established origin convention (no
  overlay file's `org=$0800` assumption can span 38KB to reach `$9Exx`, and LIBRARY's own
  proven span ends around `$4AD3`/`$4A93`). This is a genuinely unresolved third resident
  memory region — what is loaded there, and by what, is out of this round's scope.
  Similarly, the two GEN-internal Y-indexed tables (`$2BF6`/`$2C27` CoK, `$2C8D`/`$2CBC`
  DoK) and POST.COM/POSTCOM's own `$2644`/`$2647`/`$20C3`/`$20C6` tables were located (base
  address, confirmed inside the owning file's own body) but their CONTENTS were not read.
* **`$3DE8`/`$3D3A`'s 48/43 callers not walked**: this common LIBRARY-internal utility (used
  by CoK LIBRARY offset 5442's tail-call among many other sites) has 48 (CoK) / 43 (DoK)
  established-code callers corpus-wide — resolving all of them was out of this round's
  budget. It is a print-adjacent preparation utility (called immediately before entries into
  this cluster at several sites already walked), not itself a `$07`/`$08` writer.
* **DoK's private `$413D` preamble's own caller not individually re-derived**: the literal
  `$4129` hit (14.7.3) is proven reachable by REAL control-flow trace (`library_trace_seeds()`
  → `_trace_control_flow`), but the exact originating `JSR`/fall-through chain that reaches
  `$413D` itself was not walked back far enough to name a specific external caller — reported
  as "reached by real trace, caller not individually attributed" rather than guessed.
* **CoK has no located analog of the DoK `$4129` private preamble.** Whether one exists
  elsewhere in CoK LIBRARY (reached via a different address, not yet found) is unresolved,
  not ruled out.

### 14.7.7 Verdict against the refutation criterion

The task's stated refutation shape — "every resolved `$07`/`$08` source is a menu/UI string
table or a character-name-editor buffer and none can reach a MON payload" — is **exactly
what this round found**, with one real, human-readable string ("SELECT COIN TYPE TO ",
POST.COM's own post-combat prompt) and one more ("TRADE TO ?", LIBRARY's own trading
prompt — the one address that happens to numerically overlap the MON window, and is proven
NOT the MON buffer) recovered as direct evidence, plus a `$4DE0` per-character scratch table
(unrelated to MON, unrelated to text) as the other major resolved consumer family. Combined
with the entry-point census (14.7.2) proving the loop is called from ~30 distinct
established-code sites across nearly the whole corpus, this downgrades section 14.5's
"strongest-shaped candidate found so far" to: **a real, general-purpose kernel print
routine, used pervasively for menu/UI text, with no resolved source this round pointing at
MON data, and the one coincidental numeric overlap with the MON window independently
re-confirming the exact false-positive shape section 12 already diagnosed.** 86 of 154
writer sites remain genuinely unwalked (14.7.6), so this is not an exhaustive closure — but
every population that WAS resolved points the same direction, and the cheapest possible
"MON-shaped" signature (a literal `$40xx` load) was swept across the FULL population with
zero hits.

### 14.7.8 Net effect on `tools/c64_mon.py`

Added (diagnostic only, no new `MonRecord` fields): `source_pointer_writer_census()`,
`PRINT_LOOP_ENTRIES`, `print_loop_entry_callers()`, `LIBRARY_STA_4C_SITES`,
`check_library_4c_sites()`. **14** new tests in `tools/test_c64_mon_hp.py` (22 total in the
file, all passing against the real disks, none skipped) -- the file held 8 at the previous
commit (`git show HEAD:tools/test_c64_mon_hp.py | grep -c "    def test_"`), so the delta is
14. (This paragraph said 12; the 22 total was right, the delta was not.) Mutation-tested per standing rule
7, all run for real this round and reverted: narrowing `_ZP_STORE_OPCODES` to `{0x85}`
(dropping STX/STY) drops CoK's total from 72 to 64 (RED, confirmed); emptying
`_ZP_INCDEC_OPCODES` drops CoK's total from 72 to 59 and LIBRARY's own count from 22 to 18
(RED, confirmed); restricting `print_loop_entry_callers`'s opcode filter from `(0x20, 0x4C)`
to `(0x20,)` drops CoK `param_entry` from 22 to 13 and empties `field_setter`/
`row_post_entry` entirely (RED, confirmed); corrupting one `LIBRARY_STA_4C_SITES` address by
one byte makes `check_library_4c_sites` report `False` for it (RED, confirmed); corrupting
`global_ptr_entry`'s address empties its caller list (RED, confirmed). All five mutations
were reverted after confirming red; the full test suite (this file plus the pre-existing
`test_c64_mon.py`, 49 tests combined) passes clean at HEAD.

Reproduce every claim in this section:

```
python -m pytest tools/test_c64_mon_hp.py -v
python -c "import sys; sys.path.insert(0,'tools'); import c64_mon as mon
print(mon.source_pointer_writer_census('cok')); print(mon.source_pointer_writer_census('dok'))
for t in ('cok','dok'):
    for e in ('field_setter','param_entry','row_post_entry','loop_start','global_ptr_entry'):
        print(t, e, mon.print_loop_entry_callers(t, e))
print(mon.check_library_4c_sites('cok')); print(mon.check_library_4c_sites('dok'))"
python tools/c64_disasm.py <LIBRARY, dok> --org 0x2DC8 --start 0x413D --count 6
python tools/c64_disasm.py <POST.COM, cok> --org 0x0800 --start 0x25A2 --count 10
```

## 14.8 C1.6, 2026-08-13 (round #3): the `$07`/`$08` source census, MECHANISED

Section 14.7 hand-walked **68 of 154** writer sites and named the remaining 86 as its own next
step. Hand-walking does not scale; the machinery to mechanise it already existed in this repo
for a *different* pointer — `c64_sprite.scan_generic_loader_call_sites` / `_find_setter` /
`_resolve_x` (`c64-sprite-format.md` §12.3: decode-aligned scan + bounded backward instruction
walk resolving X and A). This round ports that method to the `$07`/`$08` question. **All 154
sites now carry a mechanical, re-runnable classification**, and the resolver independently
reproduces every one of §14.7's hand classifications before any new one is reported.

**Headline, refutation-graded: the claim STANDS, and it is now complete rather than 44%
walked.** Every `$07`/`$08` source this project can resolve statically lands outside
`$4000`-`$41E0` — with the single exception §14.7.4 already knew about, DoK's `$4129`, which
the resolver re-derives from scratch and re-confirms is LIBRARY's own `"TRADE TO ?"` prompt.
No previously-unwalked site reaches the MON window through a table base, a global copy or a
register pair. Three real corrections came out of the pass (§14.8.6).

### 14.8.1 The resolver

`tools/c64_mon.py::resolve_source_pointer(title, depth=12)`. For each census site:

1. **Recover a real instruction boundary by forward re-sync** (`instructions_before`): try
   every start position in a bounded byte window before the site and keep the earliest whose
   linear decode lands *exactly* on the site with no undefined opcodes. This is local — it does
   not need a global linear decode from offset 0 to stay in sync (it does not, in DUNGEON/GEN/
   POST.COM, all of which carry embedded data), and it does not need a control-flow trace to
   have reached the site. Its failure mode is visible: no syncing start means `unaligned`.
2. **Walk backward for the register the store writes from** (`STA`→A, `STX`→X, `STY`→Y) using
   `_REG_SETTERS`, a table *derived from `c64_disasm.OPCODES` itself* so standing rule 4 holds
   by construction: every documented opcode that can change A/X/Y is present, split into
   `load` / `transfer` / `clobber`. A `clobber` (`ADC`/`SBC`/`AND`/`ORA`/`EOR`, `INX`/`DEX`/
   `INY`/`DEY`, accumulator-mode shifts) **stops** the walk — the register's value is computed,
   so an earlier `LDA #imm` is *not* the source. One register-transfer hop is followed
   (`LDA #imm ; TAX`), the same single hop `c64_sprite._resolve_x` documents.
3. **Classify** into `SOURCE_KINDS`: `literal` / `table` (report the base) / `global` /
   `zeropage` / `indirect` / `computed` / `stack` / `caller_register` (the walk crossed an
   unconditional flow terminator, so the value must come from a caller or branch predecessor —
   strictly more informative than "ran out of depth") / `unresolved` / `self_advance` /
   `increment` / `unaligned`.

Classification of all 154, at depth 12:

| kind | CoK | DoK |
| --- | ---: | ---: |
| `table` | 28 | 34 |
| `literal` | 12 | 14 |
| `increment` | 10 | 10 |
| `caller_register` | 8 | 8 |
| `computed` | 5 | 5 |
| `global` | 4 | 4 |
| `self_advance` | 2 | 2 |
| `unaligned` | 2 | 3 |
| `zeropage` | 1 | 1 |
| `unresolved` | 0 | 1 |
| **total** | **72** | **82** |

### 14.8.2 Cross-check against the 68 hand-walked sites (done BEFORE trusting anything new)

Three independent hand-walked populations, reproduced mechanically, exactly:

* **All 44 LIBRARY sites** (22 per title, §14.7.3's two tables): every mechanical kind matches
  the prose label — `self_advance`, `literal`, `table`, `caller_register`, `increment`,
  `global` — at every offset, both titles. `test_reproduces_all_44_handwalked_library_classifications`
  asserts `checked == 22` per title, so the loop cannot silently not run.
* **Every hand-resolved literal pointer**: CoK `$4DE0` (COM.PREP), `$4DE0` (INIT), `$03D0`,
  `$3430`, `$7C00`, `$261F`; DoK `$83F6`, `$4DE0`, `$4DE0`, `$03D0`, `$33CD`, `$7C00`, `$209E`.
  `resolved_pointer_addresses()` returns exactly this set and nothing else.
* **All 19 `global_ptr_entry` callers** (§14.7.3's hand list): 10 CoK / 9 DoK call sites found,
  and every literal A/X pair reproduces the doc's address — `$25E1`, `$27D3`, `$0C32`, `$1693`,
  `$1E67`, `$2208`, `$228A` (CoK); `$24BC`, `$26AE`, `$239C`, `$1856`, `$220E`, `$25B1`,
  `$262A` (DoK) — with the two `LDA $7F41; LDX $7F42` sites and the two GEN Y-indexed sites
  correctly coming back as `global`/`table` rather than literals. **One NEW resolution**: CoK
  `LIBRARY`+5903, which §14.7.3 left at "LIBRARY-internal, not traced further", resolves to
  `$44DA` — inside LIBRARY's own body, outside `$4000`-`$41E0`.

### 14.8.3 The refutation test, in four shapes — and the one non-empty answer

`mon_window_hits(title)` grades the claim four independent ways:

| shape | CoK | DoK |
| --- | --- | --- |
| `literal_pointers` (a resolved literal `$07`/`$08` pair in `$4000`-`$41E0`) | — | — |
| `page_immediate` (any `$08` site whose resolved literal is `$40`) | — | — |
| `chased_globals` (a `global` pair whose RAM cells' own writers all resolve) | — | **`$4129`** |
| `table_or_global` (a readable table/global source containing byte `$40`) | — | — |

`page_immediate` **supersedes** §14.7.3's `mon_page_immediate_sweep`: that one matched raw bytes
within N bytes and could not tell which register a `#$40` was loaded into, which is why widening
its window produced two spurious `LDX #$40` hits that had to be disassembled away. This one
matches the instruction that actually sets the stored register, at a real instruction boundary,
at any distance up to the walk depth — and it is empty at every depth from 1 to 20.

**The one hit is DoK's `$4129`, and the resolver re-derives it from scratch.** DoK `LIBRARY`
offsets 5008/5013 are a `global` pair copying `$7FFE`/`$7FFF` into `$07`/`$08`.
`chased_global_pointers()` censuses every established-code absolute write to those two cells:
DoK has exactly one writer pair, `LIBRARY`+4985 `LDA #$29` and `LIBRARY`+4988 `LDX #$41`, giving
`$4129`. **CoK has none** — both its `$7FFE`/`$7FFF` writers classify `caller_register`, i.e.
the A/X come from `global_ptr_entry`'s ten external callers (all resolved above, all outside the
window). That cross-title asymmetry is exactly what §14.7.3 reported by hand, now produced by a
function instead of a reading.

And `$4129` is LIBRARY's own body: `$4129 - $2DC8 = 4961`, and DoK's LIBRARY body at 4961 reads
`b"TRADE TO ?\x00"`. CoK's body at the same offset is `b"\x03\x04\x05\x06\x07\x08\t\n\r..."` —
no analog, confirming the asymmetry from the other side. **§14.7.3's own arithmetic was wrong**
(it printed `= 865`); the string is right, the offset was not — see §14.8.6.

### 14.8.4 Standing rules, discharged in the same pass

**Rule 1 — the walk depth is a window edge.** `source_pointer_depth_sensitivity()` reports the
full histogram at any depth. Depths **11, 12 and 13 are byte-identical in both titles**; the
plateau starts at **depth 7** (CoK `unresolved` falls 12→8→5→3→2→1→0 across depths 1-7 and stays
0 through 20; DoK 13→8→6→4→3→2→1 and stays 1 through 20 — that residual 1 is the DoK `CAMP`+184
data-table site, §14.8.5). The headline is therefore not an artefact of the edge, and
`test_the_backward_walk_depth_is_not_a_binding_window_edge` pins both the equality at 11/12/13
*and* the inequality at 6-vs-7, so a future change that made the result depth-sensitive fails
loudly instead of quietly reporting one edge's number.

**Rule 2 — `_OPERATION_CENSUS_FILES` is an inherited allowlist.** It was assembled as
`_CODE_FILES | {LIBRARY}`, and `_CODE_FILES` was assembled for the LIBRARY *inbound-call*
question. Rather than argue it, this round measures it: `unrestricted_census_delta()` runs the
identical census over **every file on every side** (342 CoK / 273 DoK; the allowlist covers 16
and 19 of them).

* CoK: **+38** sites in 20 excluded files. DoK: **+41** in 28.
* Every excluded file carrying a hit is a documented data family: `ECL*`, `GEO*`, `MON*`,
  `PIC*`, `SPELL*`, `SPRITE*`, `TITLEPG`, `WALLDEF*`. Not one is code.
* 24 (CoK) / 25 (DoK) of those extra hits are nonetheless *decode-aligned* — the byte-alias
  hazard this document has now documented six separate ways. Several look entirely plausible
  in isolation (`SPELLE20`+834: `LDA #$BB ; STA $07 ; LDA #$91 ; STA $08`, i.e. `$91BB`).
* **Zero of them land in `$4000`-`$41E0`**, by either the page-immediate or the literal-pair
  test. Widening the allowlist to the entire corpus changes the answer not at all.
* The two names that are even arguably code — `COMBAT2` and `SECSET02`/`10`/`64` — have **zero**
  `$07`/`$08` write sites in either title. "Checked and found empty" is not "not checked"
  (`test_the_two_arguably_code_exclusions_are_empty_not_merely_excluded`).

**Rule 4 — every idiom, not one.** The setter tables are generated from the opcode table, and
`test_the_setter_tables_cover_every_register_writing_opcode` asserts every documented A/X/Y
modifier is present *and* that memory-mode `ASL`/`LSR`/`ROL`/`ROR` are correctly absent.

**Rule 5 — all seven C64 titles.** Everything above is CoK/DoK-only because
`c64_kernel.TITLE_DIRS` knows only those two. The print loop itself, though, is answerable
corpus-wide with a byte search: its per-character advance `INC $07 ; BNE +2 ; INC $08 ; INY`
(`E6 07 D0 02 E6 08 C8`) has no operands to vary. `print_loop_advance_sweep()` searches every
file of all seven titles (49 sides, 4426 files). **It occurs exactly once, in the file named
`LIBRARY`, in every one of the seven** — Pool of Radiance 298, Curse of the Azure Bonds 306,
Secret of the Silver Blades 3611, Champions of Krynn 306, Death Knights of Krynn 225, Gateway
to the Savage Frontier 306, Buck Rogers 275 — plus one extra copy in Pool of Radiance's `POOLRB`
boot file and nowhere else in 4426 files. This print loop is a **shared resident-kernel
primitive of the whole C64 Gold Box engine family**, not a Krynn routine, which independently
corroborates §14.7.7's "general-purpose kernel print" verdict from outside the two-title corpus.

### 14.8.5 NEW: six of the 154 census sites are byte aliases, not instructions

`source_pointer_writer_census()` is a raw opcode-byte scan by construction, so it cannot tell an
instruction from another instruction's *operand byte*. `census_alignment_report()` measures how
often it did not, by comparing the best-supported boundary alignment against the best-supported
covering alignment (`covered_chain > sync` implies alias). **Six of the 154 are aliases:**

| title | file | offset | addr | census read | actually |
| --- | --- | ---: | --- | --- | --- |
| CoK | `CAMP` | 125 | `$087D` | `STX $08` | operand of `STA $0886` at `$087C` (self-modifying patch of the `JSR` target 3 instructions later) |
| CoK | `DUNGEON` | 337 | `$0951` | `DEC $08` | operand of `JSR $08C6` at `$0950` |
| CoK | `DUNGEON` | 399 | `$098F` | `DEC $08` | operand of `JSR $08C6` at `$098E` |
| DoK | `POSTCOM` | 224 | `$08E0` | `STX $08` | operand of `JMP $0886` at `$08DF` |
| DoK | `CODE00` | 3121 | `$8C31` | `DEC $08` | operand of `STA $08C6` at `$8C30` |
| DoK | `GEN` | 457 | `$09C9` | `DEC $08` | operand of `STY $08C6` at `$09C8` |

The mechanism is systematic and worth naming: **any absolute operand naming `$0884`/`$0885`/
`$0886`/`$08C6`/`$08E6` produces a spurious `STY/STA/STX/DEC/INC $07|$08` hit**, because the
operand's own two bytes are exactly those opcodes' encodings — and `$08xx` addresses are
referenced constantly in a corpus whose every overlay is based at `$0800`. So the real writer
population is **at most 148** (CoK 69 + DoK 79), not 154.

Two more are recorded as **low confidence, not proven** (`CENSUS_LOW_CONFIDENCE_SITES`), because
no covering alignment beats their boundary alignment even though the surroundings are plainly
data:

* DoK `CAMP`+184 (`$08B8`) — inside CAMP's own menu dispatch table, which the file's own code
  names 20 bytes earlier (`LDA $08AD,X ; STA $08A3`), immediately followed by
  `b"\x00SAVE\x00VIEW\x00MAGIC\x00REST\x00ALTER\x00FIX\x00EXIT\x00"`. Boundary chain 1
  instruction, local illegal-opcode fraction 0.29. CoK's structurally identical table at
  `$0890` holds different bytes and has no `86 07` pair — which is why CoK has no hit there.
* DoK `INIT`+2208 (`$10A0`) — inside a dense structured byte table
  (`FE C3 8A 02 D4 03 87 | FE C2 04 D6 05 | FE C2 06 D6 07 | FE FE 8A C6 08 ...`), local
  illegal-opcode fraction 0.35. CoK's INIT has no analog.

If those two also fall the population is 146. None of the eight is a `literal` or a `global`, so
**none of this changes the MON-window answer** — it changes the denominator, and the denominator
was quoted as a fact in §14.7.

### 14.8.6 Corrections to §14.7 forced by this round

1. **`$4129 - $2DC8 = 4961`, not 865.** §14.7.3 printed `body[865:875]` for the "TRADE TO ?"
   read. The string is real and at the right *address*; the body-offset arithmetic was wrong by
   `0x1000`. Pinned by `test_the_dok_4129_hit_is_librarys_own_trade_to_prompt`, which asserts
   the offset *and* reads the bytes.
2. **The `$07`/`$08` census total of 154 includes 6 byte aliases** (§14.8.5), so every derived
   count ("154 sites", "86 unwalked", "68 of 154 = 44%") is over by up to 6. The honest figures
   are: 154 raw hits, at most 148 real writer sites, **all 154 now classified**.
3. **`source_pointer_writer_census`'s own docstring said "DoK 82 hits across 9 files".** It is
   **11** — the same 11 §14.7.1's per-file list already enumerated (CAMP, CODE00, CODE03,
   COMPREP, DUNGEON, GDRIVE00, GDRIVE04, GEN, INIT, LIBRARY, POSTCOM). Fixed in the module.

### 14.8.7 Honest gaps (what this round still cannot resolve)

* **Six `$08` (page-selecting) sites per title read from memory no file body can supply**
  (`unresolved_high_byte_sources()`): the third resident region `$9E00`/`$9F00` and
  `$9E8C`/`$9F8C` (LIBRARY's two message tables), `$9F9E` (GEN's global), one title-specific
  table (`$9718` CoK GEN, `$89DE` DoK GEN, `$EB2C` DoK CODE03), CoK DUNGEON's `$7F8B`, and
  `$7FFF` — the last of which `chased_global_pointers()` *does* close one hop further in both
  titles. Bounded partial closures obtained for two of them: (a) an established-code absolute-
  store census over `$9E00`-`$9FFF` finds **three byte-alias hits per title and no real
  writer**, consistent with a disk-loaded region rather than a code-initialised one; (b) the
  only established-code writers of `$7F8B`/`$7F8C`/`$7F8D` are `ADC $7F8B`/`ADC $7F8C`
  accumulations plus `LDA #$FF` and a `PLA` — never a page literal, and never `$40`. The
  remaining four are genuinely open.
* **The complement is closed by reading**: the other **10 CoK / 13 DoK** high-byte table/global
  sources DO lie inside their owning file's body, and **none of the 256 bytes from any of those
  bases is `$40`** — they hold this corpus's own page numbers (`$0B`, `$0D`, `$1A`, `$1E`,
  `$20`, `$22`, `$23`, `$24`, `$26`, `$28`, `$2A`, `$2B`, `$84`, `$C6`).
* **`caller_register` sites (8 per title) are answered structurally, not numerically**: the walk
  proves the value cannot come from anything before the store, but not what the caller passed.
  For LIBRARY's `STX $07 ; STY $08` pairs that is the routine's documented calling convention.
* **`computed` (5 per title) and `zeropage` (1 per title, `LDA $4C` in DUNGEON) are unresolved
  by design** — the first is a runtime arithmetic result, the second inherits §14.2's
  "`$4C`/`$4D` is a general-purpose current-pointer pair" ambiguity. Both write the LOW byte in
  every instance except GDRIVE00's `ADC $4D` pair, so they cannot select a page on their own.
* **Table CONTENTS for the readable tables were checked only for the byte `$40`**, not decoded
  into a pointer list; and the index range each table is actually addressed over was not bounded
  (the check reads a fixed 256 bytes, deliberately over-inclusive for a negative).

### 14.8.8 Verdict

> **The claim stands, and is now complete rather than 44% sampled.** All 154 census sites are
> mechanically classified — but "classified" and "resolved to an address" are different
> quantities, and only the second is comparable to §14.7's "68 of 154 = 44% hand-walked".
> Verified independently against §14.8.1's own table (2026-08-13): **122 of 154 (79.2%)** land in
> a kind that names an address or a concrete mechanism (`table` 62, `literal` 26, `increment` 20,
> `global` 8, `self_advance` 4, `zeropage` 2). The other **32** are honest non-answers, not
> resolutions: `caller_register` 16, `computed` 10, `unaligned` 5, `unresolved` 1. So the real
> improvement is 44% → 79%, plus a *classification* for the remaining 21% that says specifically
> why it cannot be resolved statically — which is genuinely more than §14.7 had, but is not the
> same as having resolved it. Read the kind table, not the word "all".
>
> The resolver reproduces 100% of §14.7's 68 hand-walked
> classifications plus one the doc had left open; and across four independent refutation tests —
> literal pointer pairs, page-selecting immediates, one-hop global chases, and readable table
> contents — **exactly one resolved source lands in `$4000`-`$41E0`, and it is DoK LIBRARY's own
> `"TRADE TO ?"` prompt string**, the section-12 self-reference ambiguity, reproduced from
> scratch by a function this time. **No previously-unwalked site reaches the MON window through
> any non-immediate idiom.** Widening the file allowlist to the entire 342/273-file corpus finds
> nothing further, and the loop's own advance sequence occurs exactly once per title in all
> seven C64 Gold Box games' `LIBRARY`, confirming it is a family-wide general-purpose print
> primitive. The print loop is **not** a MON-record consumer; the DoK hp@40-vs-@214 question is
> **not** reopened by this path.

### 14.8.9 Tooling and mutation testing

Added to `tools/c64_mon.py` (diagnostic only, no new `MonRecord` fields): `_FILE_ORIGINS` /
`file_origin()`, `_build_setter_tables()` / `_REG_SETTERS`, `_decode_run()` /
`instructions_before()`, `SourceSite` / `SOURCE_KINDS` / `resolve_source_pointer()`,
`resolved_pointer_addresses()`, `mon_window_hits()`, `unresolved_high_byte_sources()`,
`source_pointer_depth_sensitivity()`, `unrestricted_census_delta()`, `covering_instruction()` /
`census_alignment_report()` / `census_alias_sites()`, `CENSUS_BYTE_ALIAS_SITES` /
`CENSUS_LOW_CONFIDENCE_SITES` / `check_census_byte_aliases()`, `_resolve_writers()` /
`chased_global_pointers()`, `entry_caller_sources()` / `entry_caller_pointers()`,
`PRINT_LOOP_ADVANCE_BYTES` / `print_loop_advance_sweep()`, and the three cross-check constants
`HANDWALKED_LIBRARY_SITES` / `HANDWALKED_LITERAL_POINTERS` /
`HANDWALKED_ENTRY_CALLER_POINTERS`. **17 new tests** in `tools/test_c64_mon_hp.py` (44 total in
the file, all passing against the real disks, none skipped).

Mutation-tested per standing rule 6 — every mutation applied to the real module, the suite run,
then reverted (harness: `scratchpad/mutate.py`; final state re-verified green at 44 passed):

| mutation | result |
| --- | --- |
| `_ZP_STORE_OPCODES` narrowed to `{0x85: STA}` (drops STX/STY) | **RED**, 13 tests |
| backward walk depth 12 to 1 instruction | **RED**, 3 tests |
| `MON_PAGE_HIGH_BYTE` `0x40` to `0x41` | **RED**, 4 tests |
| `role == "clobber"` no longer stops the walk (arithmetic ignored) | **RED**, 2 tests |
| alias predicate drops the chain-length comparison (`bool(cov)`) | **RED**, 1 test |
| `file_origin()` forced to `$0800` for every file | **RED**, 3 tests |
| `_FLOW_TERMINATORS` emptied (`caller_register` unreachable) | **RED**, 5 tests |
| `unresolved_high_byte_sources` readability test inverted | **RED**, 1 test |
| print-loop advance signature last byte `INY` to `INX` | **RED**, 1 test |
| `covering_instruction` returns the FIRST covering alignment, not the best | **GREEN** |
| `mon_window_hits` table span 256 bytes to 1 byte | **GREEN** |

The two GREEN mutations are reported rather than tuned away, because each is a real (small)
fact about the corpus. "First covering alignment" and "best-supported covering alignment" give
identical verdicts here, because for every one of the six aliases the *earliest* syncing start
already carries the longest chain — the `best` refinement is correct but, on this corpus,
behaviour-neutral. And shrinking the readable-table scan from 256 bytes to 1 changes nothing
because **no** readable table contains `$40` at *any* offset, not merely at offset 0 — a robust
zero, not a threshold effect. (`test_every_readable_high_byte_table_is_free_of_the_mon_page_byte`
does its own 256-byte read and asserts the population size, 10 CoK / 13 DoK, so an empty result
can never come from an empty loop.)

Reproduce every number in this section:

```
PYTHONIOENCODING=utf-8 python -m pytest tools/test_c64_mon_hp.py -q
PYTHONIOENCODING=utf-8 python -c "import sys; sys.path.insert(0,'tools'); import c64_mon as mon
for t in ('cok','dok'):
    s = mon.resolve_source_pointer(t)
    k = {}
    for x in s: k[x.kind] = k.get(x.kind,0)+1
    print(t, len(s), dict(sorted(k.items())))
    print(' aliases      ', mon.census_alias_sites(t))
    print(' literals     ', mon.resolved_pointer_addresses(t))
    print(' mon window   ', mon.mon_window_hits(t))
    print(' chased       ', [(c['file'], c['closed'], [hex(a) for a in c['addresses']]) for c in mon.chased_global_pointers(t)])
    print(' entry callers', mon.entry_caller_pointers(t))
    print(' gaps         ', mon.unresolved_high_byte_sources(t))
    print(' depth 11/12/13', mon.source_pointer_depth_sensitivity(t))
    print(' unrestricted ', {kk: mon.unrestricted_census_delta(t)[kk] for kk in ('extra_sites','mon_window')})
print(mon.print_loop_advance_sweep())"
```
