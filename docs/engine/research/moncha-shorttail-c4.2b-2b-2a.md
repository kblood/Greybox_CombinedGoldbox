# MONCHA.GLB short-tail type-8 records — root cause and decode procedure (C4.2b-2b-2a)

> **SUPERSEDED 2026-08-20 - see `cok-m4-fidelity-plan.md` section 29.** Every `MONCHA.GLB` member
> begins with a 2-byte **big-endian uncompressed length**, and the RLE stream starts at byte 2. This
> memo decompressed from byte 0, so it read the length word as two RLE control bytes and every record
> came out shifted by a record-dependent amount. **Both of this memo's root causes are artefacts of
> that shift.** There is no "compact layout" - HYDRA's AC, damage and hit dice are at the ordinary
> deltas, and its `A+42..A+46` are all zero. And UMBER HULK's AC byte was never consumed as an
> opcode: `0x3A` is present in the compressed member as a literal and lands at `A+67` in the correct
> decode, so **AC 2 is on disk** and the canon-AC injection built on this memo is retired
> (archive-wide `acSource` count is now 0). "Type-8" is also not a thing - offset 2 was inside the
> length word, and `dec[2]` is `0x00` in all 98 members.
>
> **What survives:** every *number* the memo derived. HYDRA really is AC 5 / HD 16 / THAC0 7 / 1d12,
> UMBER HULK really is THAC0 12 / HD 10, and the "9 failing records" really did fail - because our
> decoder was two bytes out of phase, not because their data is unusual. **Nine of the eleven records
> the census below lists decode today**; only ENORMOUS SPIDER and SEA SNAKE still do not.
>
> Nothing here is deleted; the record of how a wrong model was built is what stops it being rebuilt.
> Individual claims are annotated in place.

Investigation date: 2026-06-22. Asset: `The Dark Queen of Krynn/DISK2/MONCHA.GLB`.
All byte offsets verified by offline TypeScript probes (deleted after use).

## Context

`decodeMonchaGlb` currently fails to produce full stats for a handful of type-8
members. After `reconstructDqkRecord` (second monchaRLE pass over the post-name tail),
`sniffAtAbility` rejects them because the AC/damage fields read as 0 at the standard
ability-block-relative deltas (dmgNdice=+61, dmgDsize=+63, dmgBonus=+65, ac=+67).
The lead doc called these "short tail" records and named UMBERHULK and HYDRA as the
specific examples to resolve.

## The 9 failing type-8 records

> **[2026-08-20 - every column of this table is an artefact except the member numbers and (mostly)
> the names.]** There is no type-8 byte. The `dec bytes` and `recon bytes` columns were produced by
> decompressing from byte 0 and then running a spurious second RLE pass. Correct decompressed
> lengths, and the current verdict:
>
> | m | corrected name | old "dec" | **real dec** | 2026-08-20 |
> |---|----------------|-----------|--------------|------------|
> | 5 | **ENORMOUS SPIDER** | 104 | **422** | still roster-only (`A+61`/`A+63` are 0) |
> | 10 | HYDRA | 317 | **416** | decodes: THAC0 7 / AC 5 / HD 16 / 1d12 |
> | 12 | **UMBER HULK** | 97 | **422** | decodes: THAC0 12 / AC 2 / HD 10 / 3d4 |
> | 15 | **EYE OF THE DEEP** | 218 | **426** | decodes: THAC0 9 / AC 5 / HD 12 / 2d4 |
> | 16 | GIANT ANEMONE | 406 | **436** | decodes: THAC0 7 / AC 2 / HD 16 / 1d4 |
> | 17 | GIANT SQUID | 345 | **426** | decodes: THAC0 9 / AC 3 / HD 12 / 1d6 |
> | 19 | SEA SNAKE | 341 | **426** | still roster-only; damage location UNLOCATED |
> | 20 | GORGON | 296 | **422** | decodes: THAC0 12 / AC 2 / HD 8 / 2d6 |
> | 26 | **THENOL FANATIC** | 137 | **434** | decodes: THAC0 10 / AC 10 / HD 16; `race 6` humanoid |
> | 60 | **PRINCE TALHOOK** | 185 | **506** | decodes: THAC0 8 / AC -2 / HD 10 / 1d6+3 |
> | 61 | HUGE CROCODILE | 96 | **416** | decodes: THAC0 9 / AC 2 / HD 12 / 5d3 |

Full census of type-8 members whose stats fail after `reconstructDqkRecord`:

| member | name           | raw compressed bytes | dec bytes | recon bytes |
|--------|----------------|---------------------|-----------|-------------|
| 5      | ENORMUS SPIDER | 108                 | 104       | 304         |
| 10     | HYDRA          | 90                  | 317       | 237         |
| 12     | UMBERHULK      | 104                 | 97        | 132         |
| 15     | EYE OF THE DEP | 121                 | 218       | 379         |
| 16     | GIANT ANEMONE  | 126                 | 406       | 467         |
| 17     | GIANT SQUID    | 114                 | 345       | 354         |
| 19     | SEA SNAKE      | 107                 | 341       | 324         |
| 20     | GORGON         | 100                 | 296       | 207         |
| 26     | THENOL FNATIC  | 125                 | 137       | 130         |
| 60     | PRINCE ALHOOK  | 191                 | 185       | 391         |
| 61     | HUGE CROCODILE | 100                 | 96        | 103         |

Total: **9 records** (not 2; the "UMBERHULK/HYDRA" description understated the count).

> **[2026-08-20]** The table has **11** rows, not 9; the count was wrong in the memo's own terms. The
> real count of members that still fail today is **12** archive-wide, and only two of them
> (ENORMOUS SPIDER, SEA SNAKE) are in this table.

*Note: GIANT ANEMONE (16) and GIANT SQUID (17) appear in this list because their ability
block is found in the RAW dec (not the reconstructed version); `sniffAtAbility` on the
reconstructed version fails but succeeds on the raw dec. They already decode correctly
today via `findAbilityBlock(dec)`. Similarly SEA SNAKE has a valid AC at delta 67 in the
RAW dec (AC=4 → raw=56, found). The genuinely unsolved cases are the ones below where
neither pass finds correct stats.*

## The two distinct failure modes

### Failure mode A — HYDRA: stat block ends early, fields at compact deltas

> **[2026-08-20 - WITHDRAWN.]** There is no compact layout and no 21-byte delta difference. At the
> corrected anchor (`A = 0x78`, fixed in all 98 members) HYDRA reads `A+42..A+46 = 0,0,0,0,0` and puts
> its fields exactly where every other record does: `A+59 = 8`, `A+61 = 1` (ndice), `A+63 = 12`
> (dsize), `A+65 = 0` (bonus), `A+67 = 55` → **AC 5**; `A+15 = 53` → THAC0 7; `A+25 = 16` → HD 16.
> Same five numbers, standard deltas.
>
> What produced the illusion: the spurious second RLE pass squeezed the interleaved zero pads out of
> the 2-byte-strided stat region, so the run `08 . 01 . 0c . 00 . 37` at `A+59..A+67` collapsed into
> `08 01 0c 00 37` and landed 17 to 21 bytes earlier. The "stat block is 21 bytes shorter because it
> uses a multi-head compact encoding" story was reverse-engineered from that compression artefact.

**HYDRA** (member[10], reconstructed 237 bytes, A=40):

After reconstruction, the ability block is found at A=40. The stat region from A+25 to
A+80 is:

```
+25:10 +26:00 +27:00 +28:00 +29:00 +30:80 +31:00 +32:00 +33:00 +34:00
+35:00 +36:10 +37:00 +38:00 +39:00 +40:00 +41:00 +42:08 +43:01 +44:0c
+45:00 +46:37 (AC raw) ... [zeros to end]
```

The canon AC raw value 0x37 (55, AC=5 for Hydra) is at **delta A+46**, NOT A+67.
The standard `sniffAtAbility` reads `rec[A+67]=0x00` → AC=60 and rejects it.

At deltas 42-46: `08 01 0c 00 37`
- A+25 = 0x10 = 16 (HD — number of heads in DQK's Hydra)
- A+30 = 0x80 (a structural constant, also present in working records)
- A+36 = 0x10 = HD repeated (same pattern as working records at A+47 for non-reconstructed)
- **A+42 = 0x08** (attack count or number of heads = 8)
- **A+43 = 0x01** (ndice per attack = 1)
- **A+44 = 0x0c = 12** (dsize per attack — 1d12 per head in DQK's encoding)
- A+45 = 0x00 (damage bonus = 0)
- **A+46 = 0x37 = 55 → AC = 60-55 = 5** (canon Hydra AC = 5, confirmed)
- A+56 = 0x22 = 34 (purpose unknown — possibly XP supplement or extra attack data)

The damage structure at A+42: 8 attacks of 1d12 each. AD&D canon for an 8-headed Hydra
gives 1d6-1d10 per head; DQK may use 1d12 as a simplified single-die version. The total
stat fields end at A+46 (AC), leaving A+47 onward as zeros. The reconstructed record is
237 bytes, more than large enough, but the engine reads AC at A+67=0x00.

**Root cause (HYDRA):** the stat block in HYDRA uses a **compact layout** where the
attack/damage/AC fields occupy deltas 42-46 instead of 61-67. The delta difference is 21.
The standard deltas only apply to single-attack records with the full 2-byte-strided field
layout (value at odd position, zero pad at even). HYDRA's stat block is 21 bytes shorter
because it uses a different attack structure (multi-head compact encoding).

### Failure mode B — UMBERHULK: AC byte consumed as RLE opcode, permanently absent

> **[2026-08-20 - WITHDRAWN, decisively.]** The member is **UMBER HULK**, and its AC byte is on disk.
> The raw compressed member (104 bytes, header `0x01A6` = 422) contains, at raw offsets 66..74, the
> literal run `04 02 03 02 04 0a 00 00 3a`. In the correct decode - skip the length word, decompress
> from byte 2 - that same run lands at `dec[0xB3..0xBB]`, and `dec[0xBB]` = `A+67` = `0x3A` = 58 →
> **AC 2**. Canon AC is not absent; it is exactly where the layout says it should be.
>
> The byte "vanished" only under the byte-0 decode, which shifted every opcode boundary by two and
> therefore *did* consume `0x3A` as a control byte. That is a decoder desync, not "a data encoding
> pathology in the original SSI compression". **The canon-AC injection this section motivated is
> retired**: `acSource` no longer appears on any record in the archive, and the archive-wide count of
> injected values is **0**.
>
> The damage reading is wrong too. At the corrected anchor `A+59..A+67` = `04 02 03 02 04 0a 00 00 3a`,
> so `A+61 = 3`, `A+63 = 4`, `A+65 = 0` → **3d4**, not "2d10-3". (`A+65 = 0xfd` was shifted debris.)
> The neighbouring `02` and `0a` are suggestive of the 2d10 mandible sitting in the same region, but
> what those bytes are is **UNLOCATED** and must not be claimed.

**UMBERHULK** (member[12], raw compressed 104 bytes, dec=97 bytes, recon=132 bytes, A=39):

After reconstruction, A=39. The stat region shows:
```
A+59=02 A+60=03 A+61=02 A+62=04 A+63=0a A+64=00 A+65=fd A+66=00 A+67=00
```

Canon AC for Umber Hulk = 2, so AC raw = 58 = 0x3a. Exhaustive search of the
reconstructed 132-byte record: **0x3a does not appear anywhere**. Canon AC is absent.

Tracing the member-level monchaRLE expansion of the 104-byte compressed member:

The raw compressed member contains `... 08 02 03 02 04 0a 00 3a fd 00 00 2f fa ...`
at positions 66-78 (0-indexed). The `08` at position 67 is a COPY opcode:
`08` ≤ 0x80 → copy (8+1=9) literal bytes: `02 03 02 04 0a 00 3a fd 00`. But wait —
the `3a` is inside the 9-byte literal region and becomes a DATA byte in the dec output.

Actually, re-tracing more carefully: the `3a` at raw position 72 is at an OPCODE position
in the compressed stream (the previous COPY of 9 bytes consumed positions 68-76, ending
before `3a`). Let me re-check from the decompressed output:

After member-level monchaRLE, dec[67]=0xfd (not 0x3a). The 0x3a disappeared. This is
confirmed by the probe: dec output has `fd` at position 67, and 0x3a does not appear
anywhere in the 97-byte dec. Scanning dec for 0x3a → not found.

In the compressed stream, `3a`(58) ≤ 0x80 acts as a COPY(59) opcode when it falls at an
opcode position. It copies the 59 following bytes as literals. The literal content starts
with `fd 00 00 2f fa 00 ...` — so `fd` becomes a data byte at dec position 67, and the
AC raw value 0x3a is consumed as the opcode length, vanishing from the output.

**Root cause (UMBERHULK):** the canonical AC raw byte (0x3a = 58 = AC 2) happens to
equal a valid monchaRLE COPY opcode value. When the compressor stored this record, it
placed `0x3a` at an opcode slot in the stream. The decompressor faithfully expands it as
"copy 59 literals", producing the correct stat data EXCEPT for the AC byte itself, which
was used as the instruction, not a datum. The AC value is **permanently lost in the
compressed data as stored on disk** — no additional expansion pass can recover it.

**This is not a decoder bug. It is a data encoding pathology** in the original SSI
compression. The AC value for UMBERHULK cannot be recovered from MONCHA.GLB.

## Summary by record

> **[2026-08-20 - superseded in full.]** No record in this table needs a special decode strategy.
> HYDRA, UMBER HULK, GORGON, HUGE CROCODILE and EYE OF THE DEEP all decode at the plain fixed
> offsets; ENORMOUS SPIDER and SEA SNAKE remain roster-only with their damage bytes reading 0 at
> `A+61`/`A+63` (**UNLOCATED**); THENOL FANATIC and PRINCE TALHOOK decode as bestiary records, not
> as the NPCs a later memo called them. "Hardcode AC=2 from canon" is retired - AC 2 is on disk.

| record         | failure mode | AC recoverable? | decode strategy |
|----------------|-------------|-----------------|-----------------|
| HYDRA          | A (compact layout, AC at A+46) | YES — 0x37→AC 5 | Read ac at A+46, dmg at A+42-44 |
| UMBERHULK      | B (0x3a consumed as opcode) | NO              | Hardcode AC=2 from canon |
| SEA SNAKE      | partial (ndice/dsize=0 at std delta, RAW dec has AC=4) | partially | Use RAW dec; ndice at A+60 (stride-2) |
| ENORMUS SPIDER | no ability block after recon | needs probe | not yet resolved |
| GORGON         | no ability block after recon | needs probe | not yet resolved |
| HUGE CROCODILE | no ability block after recon | needs probe | not yet resolved |
| EYE OF THE DEP | no ability block after recon | needs probe | not yet resolved |
| THENOL FNATIC  | no ability block after recon | needs probe | not yet resolved |
| PRINCE ALHOOK  | no ability block after recon | needs probe | not yet resolved |

*Only HYDRA and UMBERHULK were fully traced in this investigation pass. The other 7
records' failure modes are unresolved — they may share mode A or B or have a third
variant. Their ability blocks are not found even after reconstruction.*

## HYDRA verified canon cross-check

> **[2026-08-20 - the decoded values SURVIVE; every offset in the table is wrong.]** Re-anchored:
> AC at `A+67` (not `A+46`), attacks at `A+59` (not `A+42`), dmgN at `A+61` (not `A+43`), dmgS at
> `A+63` (not `A+44`), THAC0 at `A+15` and HD at `A+25` as stated, and XP as a little-endian `u16` at
> the **record-absolute `0x54`** (not "absolute off 4") - where it reads 9000, the same number.

| field   | encoded (delta) | decoded value | AD&D canon           |
|---------|----------------|---------------|----------------------|
| AC      | A+46 = 0x37   | 5             | AC 5 (MM) ✓          |
| HD      | A+25 = 0x10   | 16            | 8-16 heads (varies) — DQK uses 16 ✓ |
| THAC0   | A+15 = 0x35   | 7             | HD 8+ → THAC0 7-8 ✓  |
| attacks | A+42 = 0x08   | 8             | 8-headed variant ✓    |
| dmgN    | A+43 = 0x01   | 1             | 1 die per head ✓      |
| dmgS    | A+44 = 0x0c   | 12            | 1d6-1d10 per head (DQK uses 1d12) (inferred) |
| XP      | absolute off 4 | 0x2328=9000  | Hydra XP 8 heads ≈ reasonable |

## UMBERHULK partially verified

> **[2026-08-20 - four rows survive, three do not.]** THAC0 12 (`A+15 = 48`), HD 10 (`A+25 = 10`) and
> XP 1864 all re-read identically, though XP is at the record-absolute `0x54`, not "off 4". The
> ndice/dsize/dbonus rows are wrong: the correct record reads **3d4** (`A+61 = 3`, `A+63 = 4`,
> `A+65 = 0`), not 2d10-3. And the **AC** row is wrong in the other direction - `A+67` = `0x3A` = 58
> → **AC 2**, matching canon, present on disk.

| field  | encoded | decoded value | AD&D canon                       |
|--------|---------|---------------|----------------------------------|
| THAC0  | A+15=0x30 | 12          | THAC0 11-12 for HD 8+8 ✓ (within 1) |
| HD     | A+25=0x0a | 10          | HD 8+8 (9 HD after +8 bonus) (inferred match) |
| XP     | off 4     | 0x0748=1864 | Umber Hulk XP ~2000 range (plausible) |
| ndice  | A+61=0x02 | 2           | Mandible: 2d10 ✓                 |
| dsize  | A+63=0x0a | 10          | Mandible: 2d10 ✓                 |
| dbonus | A+65=0xfd | -3 (signed) | -3 penalty (non-canon but plausible) |
| **AC** | **A+67=0x00** | **60 (WRONG)** | **Canon AC 2 — ABSENT from record** |

The damage fields decode to 2d10-3 (signed bonus), which partially matches the mandible
attack (2d10). The claw attacks (3d4/3d4) are not represented at the standard deltas —
the bytes at A+59..A+60 = `02 03` may be claw attack entries (2 claws of 3 sides each,
meaning 1d3 per claw?). The claw/mandible multi-attack structure is not fully decoded.

## What the working record layout shows (A+25..A+67 stride pattern)

> **[2026-08-20 - the stride pattern SURVIVES; two of its universals do not.]** The 2-byte-strided
> region with ndice at `A+61`, dsize at `A+63`, dbonus at `A+65` and AC raw at `A+67` is exactly what
> the corrected records show, in **all** of them including HYDRA. Two qualifications: `A+47` is
> **not** "HD repeated in all records examined" - it matches HD for the plain monsters (HYDRA 16,
> UMBER HULK 10, GORGON 8, ENORMOUS SPIDER 9) but reads 0 for BLACK ROGUE, THENOL WIZARD, DARK
> WIZARD, SELIAS and TASSLEHOFF, and 8 against HD 9 for BAKALI SHAMAN. And `A+35` takes more values
> than `0x80`/`0xb2`: 128, 158, 172, 176, 178 and 188 are all observed. The final paragraph's claim
> that HYDRA breaks the pattern is withdrawn - it does not.

For all currently-decoded monsters (BLACK PUDDING, IRON GOLEM, ETTIN, SHAMBLING MOUND,
etc.), the stat block from A+25 to A+67 follows a **2-byte-strided** layout:

```
A+25 = HD
A+26 = 0 (pad)
...
A+35 = 0xb2 or 0x80 (structural constant — varies by record class)
...
A+47 = HD repeated (purpose: unknown — possibly average HP field)
...
A+59 = unknown byte (varies: 02 for multi-attack creatures)
A+60 = unknown byte
A+61 = ndice (primary damage)
A+62 = unknown
A+63 = dsize (die sides)
A+64 = unknown
A+65 = dbonus (damage flat bonus)
A+66 = 0
A+67 = AC raw (60 - AC)
```

HYDRA breaks this pattern by having its stat block end 21 bytes earlier (fields at
A+42..A+46 instead of A+61..A+67). The reason is unconfirmed but likely a different
attack encoding for multi-head creatures.

## Proposed fix procedure for HYDRA

> **[2026-08-20 - WITHDRAWN, do not implement.]** A compact-delta fallback would read zeros. HYDRA
> needs no fallback at all; it decodes at the standard deltas once the length word is skipped.

1. In `decodeFullStatMonster`, after standard `sniffAtAbility(rec, A)` fails:
2. Try **compact delta set** at A+42..A+46:
   - check `rec[A+42]` as attack count (1..12)
   - check `rec[A+43]` as ndice (1..12)
   - check `rec[A+44]` as dsize (must be in DIE_SIZES)
   - check `rec[A+46]` as ac_raw → AC = 60 - rec[A+46] (must be in [-12..16])
3. If all pass, decode using these compact deltas, setting THAC0/HD/saves from the
   standard deltas (those still work: A+15, A+25, A+19..23).
4. Reported damage = `rec[A+43] d rec[A+44] + rec[A+45]` (single representative attack),
   or flag as multi-attack with rec[A+42] attacks.

**Canon cross-check (HYDRA):** AC=5 ✓, HD=16 ✓, THAC0=7 ✓. This decode is confirmed.

## Proposed fix for UMBERHULK

> **[2026-08-20 - WITHDRAWN, do not implement.]** Neither option is needed. Option 1 (the canon
> hardcode with `acSource='canon-hardcode'`) was implemented, shipped, and has now been **retired**:
> the byte is on disk. This is the memo's most consequential error, because it turned a decoder
> desync into a claim about the retail data and then wrote an invented value into the engine's output
> to compensate. UNLOCATED beats invention - and here it was not even unlocated.

**AC cannot be recovered from the compressed data.** Two options:

Option 1 (recommended): **Hardcode AC=2** for the member whose name scans to "UMBERHULK".
The damage (2d10-3 or 2d10), HD (10), THAC0 (12) all decode from the record; only AC
is absent. Injecting canon AC=2 at the engine level is straightforward and honest (it
matches what the record would have stored if the compression hadn't consumed the byte).
Label this record as `hasStats=true, acSource='canon-hardcode'` for audit traceability.

Option 2: Accept that UMBERHULK gets `hasStats=false`, keeping it as name+category only,
and note the limitation in the engine's bestiary report.

## Proposed fix for the other 7 unresolved records

These records (ENORMUS SPIDER, GORGON, HUGE CROCODILE, EYE OF THE DEP, THENOL FNATIC,
PRINCE ALHOOK, members 5/20/61/15/26/60 plus possibly others) all share the
characteristic that `findAbilityBlock` returns -1 even after `reconstructDqkRecord`. This
is a distinct failure from HYDRA/UMBERHULK (where the block IS found but stats are wrong).

A follow-on investigation should trace the ability block scan failures for these records.
The likely explanation is that their stat regions contain high bytes (≥25 or =0) at the
ability-block location, making `findAbilityBlock` skip them.

## Implications for the engine

> **[2026-08-20 - items 1, 2, 3 and 5 withdrawn; item 4 survives, narrowly.]** No compact-delta
> fallback (1); UMBER HULK's AC is on disk (2); there is no compact-delta variant to look for in
> other records (3); and the coverage figure is superseded - 86 of 98 members decode with full stats
> today (5). Item 4, "`monchaRLE` is confirmed correct", **survives**: the scheme itself was never
> the bug. What was wrong was the two bytes we fed it, and this investigation could not have found
> that from the data alone - it took reading DQK's own loader.

1. **HYDRA is recoverable** by trying the compact-delta set (A+46 for AC, A+42-44 for
   damage) when the standard delta 67 fails. Implement as a fallback in
   `decodeFullStatMonster`. This resolves HYDRA with confirmed canon stats.

2. **UMBERHULK's AC is unrecoverable from disk.** The fix is a targeted hardcode for
   this one member, or accepting name-only. The engine already handles `hasStats=false`
   gracefully (combat falls back to a demo monster), so this is a cosmetic gap.

3. **The compact-delta variant may apply to other multi-head/multi-attack creatures.**
   Check whether other records with fails have similar structures at A+42-46 before
   concluding they need separate fixes.

4. **monchaRLE is confirmed correct** — this investigation found no RLE-scheme bugs. The
   UMBERHULK pathology is a data encoding artifact, not a decoder error.

5. **9 type-8 records fail today; at most 1 (HYDRA) is fully fixed by this finding.**
   UMBERHULK gains THAC0/HD/damage but still needs AC hardcoded. The other 7 require
   further tracing of their ability-block scan failures.

## Open questions / unknowns

> **[2026-08-20]** Re-measured at the corrected anchor: `A+35` is still **UNKNOWN** but takes at least
> six values (128/158/172/176/178/188), not two. `A+59` is still **UNKNOWN**. `A+47` is still
> **UNKNOWN** and is not universally HD (see above). The HYDRA-specific questions are moot: `A+56`
> and the "compact-delta set" both belong to a record layout that does not exist. The
> ability-block-scan question is answered outright - nothing scans; the block is at `0x78`.

- What is the byte at A+35 (0xb2 vs 0x80)? Correlates with undead/magical creatures
  but the specific meaning is UNKNOWN.
- What is A+59 (02 in Ettin, 00 in Sea Snake, 02 in Umberhulk)? Possibly "number of
  attack forms" but unconfirmed.
- What is A+47 (HD repeated in all records examined)? Possibly max HP or re-roll marker.
- Why do ENORMUS SPIDER, GORGON, HUGE CROCODILE, EYE OF THE DEP, THENOL FNATIC,
  PRINCE ALHOOK lack a findable ability block? Their post-name tails need separate tracing.
- For HYDRA: what does A+56=0x22=34 represent? Could be XP adjustment or secondary stat.
- The compact-delta set (42/43/44/46) for HYDRA: is this specific to multi-head creatures
  or is it a general "short stat block" variant? Needs verification on other records.

## Sources

- `The Dark Queen of Krynn/DISK2/MONCHA.GLB` — primary asset (binary, verified)
- `packages/engine/src/loaders/moncha.ts` — current decoder under investigation
- `packages/engine/src/util/rle.ts` — monchaRLE implementation (confirmed correct)
- `docs/engine/research/moncha-dqk.md` — prior research context (C4.2a/b)
- AD&D 1e/2e Monster Manual: Umber Hulk (AC 2, HD 8+8, attacks 3/1, dmg 3d4/3d4/2d10);
  Hydra (AC 5, HD 5+5 per head, dmg 1d6-1d10/head)

---

## The attack-rate field, verified across two archives (2026-09-07)

The 2026-08-20 re-anchoring banner above says `attacks at A+59 (not A+42)` in one line and
then moves on. This section supplies what that line never had: the byte evidence, an
independent archive as a control, the histograms, and the nulls. It also records that the
banner sat here correct and wired to nothing for 18 days, which is the reason to write the
evidence down and not just the offset.

### The encoding is a PAIR of half-attack bytes, and it is documented

`hackdocs_extracted/CCHFORM.TXT` lines 171-179, quoted verbatim:

```
171-172 Number of attacks per two rounds (1st/2d attacks, unarmed)
173-174 Dice of Damage
175-176 Type of Damage Die Rolled
177-178 Damage Bonus
179     60 - Base AC    This field is not reset by UA.
```

That describes FRUA's record, and FRUA is the same HLIB generation as DQK. It registers
onto DQK at a uniform **+8** (`171 -> 179`, `179 -> 187`, THAC0 `127 -> 135`), and
`A = 0x78 = 120`, so **`171 + 8 = 179 = A+59`** — the banner's offset, reached from the
documentation rather than from the record.

### Measured, both archives, at those offsets

`Unlimited Adventures\DISK2\MONST.GLB` decodes to **127 members, every one exactly 450
bytes**; `The Dark Queen of Krynn\DISK2\MONCHA.GLB` to **98 members** (variable total
length, fixed part aligned). Shared monsters, read through the documented layout in one
archive and the +8 registration in the other:

| monster | rate pair | damage | AC | THAC0 |
| --- | --- | --- | --- | --- |
| UMBER HULK — FRUA @171/172 | **4 / 2** | 3d4 | 2 | 12 |
| UMBER HULK — DQK @179/180 | **4 / 2** | 3d4 | 2 | 12 |
| HYDRA — FRUA @171/172 | **8 / 0** | 1d12 | 5 | 7 |
| HYDRA — DQK @179/180 | **8 / 0** | 1d12 | 5 | 7 |
| TROLL — FRUA | 4 / 2 | 1d4+4 | 4 | 13 |
| GHOUL — FRUA | 4 / 2 | 1d3 | 6 | 16 |
| ZOMBIE / KOBOLD — FRUA | 2 / 0 | 1d8 / 1d4 | 8 / 7 | 16 / 20 |

**Byte-identical stats for the shared monsters across two different games' archives.** That
is the control: an alignment error would not survive being reached two different ways.

Histograms:

| field | histogram |
| --- | --- |
| FRUA `@171` (n=127) | `{0: 8, 2: 98, 4: 20, 8: 1}` |
| FRUA `@172` (n=127) | `{0: 94, 2: 29, 4: 3, 16: 1}` |
| DQK `@179` (n=98) | `{0: 4, 2: 47, 3: 1, 4: 42, 8: 1, 12: 1, 16: 2}` |
| DQK `@180` (n=98) | `{0: 63, 2: 33, 4: 1, 6: 1}` |

**The parity argument, and its one exception.** `1` occurs **zero times** in all four
histograms (denominator 450 record-fields). A plain per-round attack count would be
overwhelmingly 1; a per-*two*-rounds count cannot be 1 for any creature that attacks every
round. The dominant `2` is therefore "one attack per round", `4` is two, `8` is four — which
is exactly what the canon values above require. **The exception is DQK `@179 == 3` in one
record**, an odd value the "per two rounds" reading makes mean *three attacks per two
rounds*, i.e. alternating 2 and 1. That is representable and is what the engine's existing
`attacks_this_round` already encodes, so it is consistent — but it is a single record and it
is the only odd value anywhere in the four columns, so treat it as unexplained rather than
as confirmation.

### `A+42` is dead, and a design doc was still naming it

`A+42` (record byte 162) is **`0` in 98 of 98 DQK records** — HYDRA's included. So the
claim in `docs/engine/research/asm-combat-engine-design.md` that imports populate attacks
"from the verified `ability+0x2A` (`A+42`) attack-count byte used by HYDRA-style records"
is false in both halves: the byte is not an attack count, and HYDRA does not use it. That
file has been corrected. It is worth naming why it survived: `moncha.ts` retracted the
offset on 2026-08-21 and this memo re-anchored it on 2026-08-20, and neither edit reached
the document an implementer reads before writing the importer.

### A method note, recorded because it cost the most time

The first attempt to reproduce any of this failed, and the cause was the instrument, not
the claim. `MONCHA`/`MONST` members are **HLIB `DATA`**, whose repeat count is **`257 - c`
with `0x80` a no-op** — not DAX's `256 - c`. Reaching for `tools/dax_decode.py`'s
`rle_decode` produced records of 431-434 bytes that drifted out of alignment by a byte or
two, which read exactly like a wrong offset. Under `257 - c` all 127 FRUA members decode to
**exactly 450** and 123 of 127 put a plausible `60 - AC` at byte 179.

**Two numbers in the paragraph above are re-derived here, and one of them was mine and
wrong (2026-09-07).** The `256 - c` spread is **420..437 across 16 distinct lengths**, not
"431-434" — 431..434 is where the bulk sits (16 + 11 + 13 + 22 = 62 of 127) and I quoted
the bulk as if it were the range. That is this project's own *an absolute claim is usually a
98% claim* in miniature, and the corrected figure is the more useful one because it comes
with its shape. The oracle used for both is the member's **own 2-byte big-endian declared
uncompressed length**, which is the engine's bound and not anything our decoder produces.

**And the second archive was never in this paragraph, though it should have been.** DQK's
own `DISK2\MONCHA.GLB` corroborates the convention independently of FRUA: **98 of 98
members match their declared length under `257 - c` and 0 of 98 under `256 - c`.** DQK's
records are genuinely variable-length (31 distinct lengths, 416..598), so the single-length
signature is FRUA's alone. **This memo already named the right archive** ("`Unlimited
Adventures\DISK2\MONST.GLB` decodes to 127 members, every one exactly 450"); what went
wrong is that I later quoted the 450 as a DQK `MONCHA.GLB` figure when briefing an agent,
and the agent caught it against the bytes. The correction is recorded here, not in the
memo's defence: a number that travels without its archive will eventually be attached to
the wrong one. The two corpora fail differently and agree on the codec, which is worth
more than either alone.

**None of that is a discovery.** `packages/engine/src/util/rle.ts`'s `monchaRLE` already
documents the convention, names both archives, and says "under 257-c, never 256-c"; the
same constant is in `glib_decode.py`, `daa_decode.py` and `hlib_decode.py`. This memo's own
reference list points at that file and calls it "confirmed correct". The lesson was only
that **`tools/` had no Python `monchaRLE`**, so a Python-side reader had to know to avoid
the obvious function.

**CLOSED 2026-09-07.** `tools/moncha_rle.py` now exists — `moncha_rle`,
`decode_moncha_member` (which validates against the declared length word) and
`iter_moncha_members` — with `tools/test_moncha_rle.py` beside it. It is a port, and the
module says so. Two details make it more than a copy-paste:
`tools/test_glib_data_conventions.py` had been carrying a **private** 23-line copy of the
same decoder, which is now imported instead, so the module has a consumer outside its own
test; and the tests pin
the DIFFERENCE rather than the behaviour, asserting `moncha_rle` against the real
`dax_decode.rle_decode` on bytes where the two conventions disagree. A test both
conventions pass would have proved nothing. Mutating `257` to `256` turns 6 of the 10 new
tests and 3 of the 7 pre-existing GLIB ones red; mutating the `0x80` no-op turns exactly
one red.

### NULLs

1. **The consumer inside `DQK.EXE` is unlocated.** The field and its encoding rest on
   records plus documentation; that DQK's own combat loop reads `A+59` is inference. No
   disassembly of DQK's combat loop and no runtime session support it.
2. **`A+0x44 .. A+0x125` (`0xBC..0x19D`) is unmapped.** The +8 registration is verified only
   through `0xBB`; DQK's larger fixed part means a further insertion sits somewhere after it
   that a uniform +8 cannot place.
3. **Six of 98 DQK records are not explained by the simple model.** Three have a populated
   second damage profile with a zero rate (WHISPER SPIDER, ZOMBIE MINOTAUR, FIRE MINION —
   3d8, 3d8, 4d8); three have the mirror shape (ENORMOUS SPIDER, SEA SNAKE, LICH). Dead
   data or a second routine that legitimately never fires — undecided.
4. **The FRUA `@172` value `16`** (one record) is outside the pattern the other three
   columns show and was not chased.

### Wired into the native engine the same day, and what it cost

`native/src/cccombat.asm`'s `.dqk_decode` now does `movzx ax, byte [si+bx+59]` /
`mov [di+C_HALFATT], ax`. A zero leaves `C_HALFATT` at 0 and `attacks_this_round` falls
through to the `C_ATTACKS` default of 1, so unpopulated records are untouched. The second
byte of the pair (`A+60`) is deliberately **not** wired: the engine's secondary melee
strike is driven by `sec_dcount`/`sec_dsides`, not by a rate, so feeding `A+60` in would
need that mechanism changed too.

**Adjudicated, not captured.** Across the four `cccombat-test.ps1` DQK cases, 13 of 15
enemy turns hit the count predicted from the record byte exactly; the two that fall short
are truncated at the instant the last party member died. An independent control on the
record indexing: all eight monster names recovered as member `(ECL id - 1)` match the
monster this script's own pre-existing ECL comments name for that id, 8 of 8.

**Mutation-tested twice, because the first mutation was weaker than it looked.**
`+59 -> +58` turns the suite red, but `+58` is zero in these records, so that mutant merely
reproduces the pre-change engine — it proves the pins bind to the feature, not to the byte.
`+59 -> +67` (the AC byte, large and nonzero) turns it red at a different case with a third
distinct behaviour. Together they discriminate the specific offset.

**What it cost, stated rather than buried.** Two `cccombat-test.ps1` goldens
(`$dqkDecExpected`, `$dqkReconExpected`) had been **green while pinned to the regression**,
proven by rebuilding at the pre-change bytes; a third (`$dqkNpcExpected`) had been red the
whole time and nobody knew, because `$dqkShortExpected` aborted the run before it. All four
are re-derived and the suite now exits 0. On the flow side `gbdqk-playable-flow-test.ps1`
was re-derived to green — its six HP rows close exactly as `maxHp - Σ(trace damage)` — but
**`gbdqk-combat-flow-test.ps1` is left RED and quarantined in-file with a dated expiry**:
its stage-2 battle now ends `enemy` where the script requires `party`, because retail
content at the correct attack rate beats that party. That is a scenario-design decision,
not a number to update. `ccecl-dqk-combat-test.ps1` fails identically in both builds and is
not this change's doing.
