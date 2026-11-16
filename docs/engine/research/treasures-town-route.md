# Treasures of the Savage Frontier — the TOWN leg

Status: **PROVEN** (static, byte-level; no DOSBox-X was used)
Scope: the `town` leg of the `treasures-of-the-savage-frontier` campaign evidence matrix.
Companion doc: `docs/engine/research/treasures-natural-route.md` (the already-proven `early` leg).
Golden test: `packages/engine/test/treasuresTownRoute.test.ts`.

Everything below is derived from the retail GOG install resolved programmatically through
`tools/goldbox_corpus.py` (`choose_install` / `file_index`), never from a hardcoded path and never
from Forgotten Realms setting knowledge. Where a claim is an inference rather than a byte reading
it is labelled **(inference)**.

---

## 0. Ground rules used throughout

| Fact | Value |
| --- | --- |
| Script archive | `ECL1.DAX`, 251,712 bytes, **30 blocks**: 4, 16–33, 34–40, 47, 49, 50, 51 |
| Map archive | `GEO1.DAX`, Gen1 1026-byte 16x16 blocks |
| Dialect | `ECL_GEN1_SHORT_TREASURES`, word sets `{0x0C:4, 0x1D:0, 0x21:2, 0x22:0, 0x23:0, 0x2C:1}` |
| Extra opcode | `0x42` (`TREASURES_EXT_42`), wordSet 1 + 1 trailing byte |
| Cell descriptor | `[0x002d]` (per-title `EclDialect.cellDescAddr`) — **not** `[0xc04f]` |
| Addressing | vbase `0x7FFE`; file offset = vaddr − 0x8000 + 2 |
| `SAVE` operand order | `(source, destination)` — destination last |
| GEO layout | walls `raw[2:258]` / `raw[258:514]`, descriptors `raw[514:770]` indexed `y*16+x`, doors `raw[770:1026]` |

The dialect was taken from `gen1_ecl_encounter_scan.word_sets_for_profile('treasures-of-the-savage-frontier')`.
The plain long `ECL_GEN1` desyncs this title badly (74.5 % vs 95.9 % reachable coverage; zero
`[0x0030]` sites found). The Treasures-specific `0x21:2` split is **load-bearing for the VM runs
of §5e/§5f** — under the shared `ECL_GEN1_SHORT` every Llorkh service cell returns an empty `end`
turn instead of its prompt — but **NOT** for the static census of §1c/§2, which is bit-identical
under the shared short dialect (37/24/41/8, same 21-block union). (Reworded 2026-08-06: the
earlier flat "the default word set silently desyncs on this title" invited the reader to think
the Treasures split underpins the census too. It does not.)

Two independent decoders were used and cross-checked:

* a **control-flow-free raw-byte needle scan** (find the literal 3-byte operand encoding
  `01 <lo> <hi>` preceded by `09 00 <imm>`), which cannot follow jumps and therefore cannot be
  fooled by a wrong dialect; and
* a **reachability walk** seeded from all five header entry points of every block, expanding all
  outcomes of every conditional (the "no-narrowing" model of `nwn-town-route.md` §6a-ii),
  which covers **217,461 / 244,265 = 89.0 %** of ECL1 block bytes.

---

## 1. The discriminator problem, and how it was solved

### 1a. The usual signal is genuinely absent

The Gold Box town/dungeon discriminator used elsewhere in this repo is
`SAVE <n>, 0x4BE6` (`inDungeon`), plus the CoAB-family Area2 service addresses. A raw-byte scan of
all 30 ECL1 blocks for the literal operand encodings of those addresses returns **zero hits for
every one of them**:

| CoAB-family address | role in CoAB | raw hits in Treasures ECL1 |
| --- | --- | ---: |
| `0x4BE6` | `inDungeon` | **0** |
| `0x7F6C` | `EnterShop` | **0** |
| `0x7EE2` | `EnterTemple` | **0** |
| `0x7EA8` | `training_class_mask` | **0** |
| `0x7F12` | `game_area` | **0** |
| `0x7F6D` | shop price scale | **0** |
| `0x7CC3` | party platinum | **0** |
| `0x7FF6` | Area2+0x7EC | **0** |

This is a control-flow-free scan, so the zeros are not a scan failure. They are also not evidence
of a missing feature: **Treasures' ECL host memory is an entirely LOW address space** (observed
range `0x0000`–`0x02FF`), the same convention already proven for this title's cell descriptor at
`[0x002d]` and shared with DQK and Pools of Darkness. Every CoAB-family address is simply out of
range. This closes, as a *real zero with a known cause*, the disclosure left open in
`nwn-town-route.md` §6b (which recorded Treasures as 0/0/0 for shop/temple/training and flagged the
result as "narrowed but not closed").

### 1b. Treasures' own service idioms, read from its own bytes

Four service idioms were recovered by disassembling the low-address space directly. Each is quoted
below with the real bytes at a real vaddr in `ECL1.DAX#16`.

**Shop** — `0x8ebe`, bytes `09 00 10 01 28 00  09 00 01 01 04 00  3c 00 01`

```
8ebe  SAVE  #16, [0x0028]      ; price scale
8ec4  SAVE  #1,  [0x0004]      ; enter-shop flag
8eca  PROTECTION #1            ; opcode 0x3C selects the merchant / stock list
8ecd  GOTO  [0xa710]           ; block-common exit
```

**Temple** — `0x960a`, bytes `09 00 01 01 14 00  24  09 00 00 01 14 00`

```
95ed  PRINTCLEAR "%D'DO YOU WISH HEALING?'%A"
9604  PARTY_SURPRISE           ; the YES/NO prompt
9605  IF_NE / 9606 GOTO exit
960a  SAVE  #1,  [0x0014]      ; enter-temple flag
9610  COMBAT                   ; empty-roster COMBAT, routed by the flag
9611  SAVE  #0,  [0x0014]      ; clear on return
```

This is structurally identical to the CoAB `temple_shop()` mechanism — a flagged empty-roster
`COMBAT` used as a host-service call — and all 24 `[0x0014]` sites are exactly 12 set/clear pairs.

**Training hall** — `0x9572`, bytes `09 00 7f 01 30 00  38 00 00`

```
9552  PICTURE #96
9555  PRINTCLEAR "%E'WOULD YOU LIKE TO TRAIN?'%A"
956f  PARTY_SURPRISE / 9570 IF_NE / 9571 SURPRISE
9572  SAVE  #127, [0x0030]     ; class mask, always #127
9578  PROGRAM #0               ; host training menu
```

All 8 sites corpus-wide are byte-identical in this shape, including the
`PARTY_SURPRISE / IF_NE / SURPRISE` prefix, and `SAVE #127,[0x0030]` is immediately adjacent to
`PROGRAM #0` at every one of them.

**Inn** — `0x8cfa`, bytes `09 00 01 01 c8 00  02 01 29 a7 ...`

```
8cd0  PRINTCLEAR "%F'WOULD YOU LIKE TO REST FOR 1 PLATINUM?'%A"
8cf4  PARTY_SURPRISE / 8cf5 IF_NE / 8cf6 GOTO exit
8cfa  SAVE  #1,  [0x00c8]      ; price
8d00  GOSUB [0xa729]           ; shared "take the money" subroutine
8d04  IF_NE / 8d05 GOTO exit   ; ...fails if the party cannot pay
8d09  PROGRAM #9               ; host rest/camp service
```

**`[0x00c8]` is deliberately NOT one of the census markers** (added 2026-08-06). It is a generic
price/argument register: **75 reachable writes across 25 blocks**, including the non-settlements
22, 36, 38, 49, 50 (`SAVE #2` @`0x82b2`, `SAVE #1` @`0x83a0`) and 51 (`SAVE #1` @`0x90b5`/
`0x90d7`/`0x9110`/`0x913b`, `SAVE #255` @`0x9166`); block 47 writes `#10` @`0x9d91`. Using it as
a discriminator would classify the overland map and a camp-interrupt block as settlements.
`PROGRAM #9` is reported per block in §2 **for description only**.

### 1c. Why the marker set is sound

**What the markers actually select (corrected 2026-08-06).** The four census markers are
`[0x0004]`, `[0x0014]`, `[0x0028]`, `[0x0030]`, and they are **not four independent selectors**.
Measured on the retail bytes: **`[0x0004]` (shop flag) and `[0x0028]` (price scale) select the
IDENTICAL 20 blocks**, and `[0x0014]` (12 blocks) + `[0x0030]` (8 blocks) are subsets of that set
except for **`ECL1#37`**, the single block they add. So the union of all four equals the shop-idiom
set ∪ {37}: **the shop idiom alone selects 20 of the 21 settlement blocks**, and the discriminator
is "the shop idiom plus one temple/training-only block". Temple and training **corroborate without
narrowing**. An earlier draft's four-row agreement table invited the reader to see four converging
selectors — the same "conjunction doing no work" defect this project already had to correct in
`nwn-town-route.md` §6a-i.

The naive raw-byte scan and the reachability walk agree **exactly** on all five markers, so none
of them is a coincidental byte run inside a packed-string payload:

| address | role | naive raw-byte sites | reachable sites | agree |
| --- | --- | ---: | ---: | --- |
| `[0x0004]` | enter-shop | 37 | 37 | yes |
| `[0x0014]` | enter-temple | 24 | 24 | yes |
| `[0x0028]` | shop price scale | 41 | 41 | yes |
| `[0x0030]` | training class mask | 8 | 8 | yes |
| `[0x0016]` | current area id | 34 | 34 | yes |

(Corrected 2026-08-06: this table used to read 34 naive vs **33** reachable for `[0x0016]` and
called the missing site "an unreachable orphan". An independently written no-narrowing walk at
**95.9 %** reachable coverage reaches all 34 sites — the "orphan" was an artefact of the first
pass's 89.0 %-coverage walk, not a byte fact.)

Written values are tightly constrained, which is what a host-ABI flag looks like and what an
arbitrary variable does not: `[0x0004]` is written `#1` at all 37 sites; `[0x0030]` is written
`#127` at all 8; `[0x0028]` takes only `#16` (35), `#32` (2), `#64` (4); `[0x0014]` is 12 `#1`
paired with 12 `#0`.

`PROTECTION` (0x3C) occurs 41 times and `SAVE <scale>,[0x0028]` occurs 41 times — **the totals
match exactly**. The contiguous three-instruction shape `SAVE scale` / `SAVE #1,[0x0004]` /
`PROTECTION` is the **common but not universal** form: 36 of the 41 scale sites are immediately
followed by the shop flag and 34 by `PROTECTION`; block 31's two sites (`0x9d83`, `0xa4f9`) go
scale→`PROTECTION` with no flag, and three of block 23's (`0x87a5`, `0x880b`, `0x8e89`) do
neither. (Corrected 2026-08-06: the earlier "an exact 1:1 count match" wording implied a uniform
idiom.)

`[0x0016]` is the control that shows the low-address space is being read correctly rather than
pattern-matched: **29 of the 30 blocks write their own block id** to it (block 18 writes `#18`,
block 40 writes `#40`, …). The single exception is block 4, the map-less helper stub, which writes
`#16` at vaddr `0x8048` — it hands control to area 16. Block 16's `initial_entry` opens with

```
803e  COMPARE [0x0016], #16
8044  IF_EQ
8045  EXIT                     ; "already in area 16 — do not re-run entry"
```

That is a current-area register, independently corroborated by `ECL_GEN1_SHORT_POOLS.lastBlockIdAddr
= 0x0016` in `packages/engine/src/ecl/disassemble.ts`, which was sourced from Pools' own
`GAME.OVR`.

**Discriminator, stated plainly:** a Treasures block is a settlement iff it contains at least one of
the four service idioms. There is no `inDungeon` write and no engine "town mode" to lean on.

---

## 2. Corpus census: 21 settlement blocks, 9 non-settlement blocks

| blk | shop | temple | train | `PROGRAM #0` | inn `PROGRAM #9` | price scales | `PROTECTION` ops |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 4 | 0 | 0 | 0 | 0 | 0 | — | — |
| 16 | 1 | 1 | 1 | 1 | 1 | {16} | 1 |
| 17 | 0 | 0 | 0 | 0 | 0 | — | — |
| 18 | 2 | 1 | 1 | 1 | 1 | {16×2} | 1, 2 |
| 19 | 1 | 0 | 0 | 0 | 1 | {16} | 1 |
| 20 | 1 | 0 | 0 | 0 | 1 | {16} | 2 |
| 21 | 2 | 1 | 1 | 1 | 1 | {16, 64} | 1, 11 |
| 22 | 0 | 0 | 0 | 0 | 0 | — | — |
| 23 | 3 | 1 | 1 | 1 | 1 | {16×2, 32×2, 64} | 1, 6, 9 |
| 24 | 2 | 1 | 0 | 0 | 1 | {16×2} | 1, 6, 12 |
| 25 | 2 | 0 | 0 | 0 | 1 | {16×2} | 1, 6 |
| 26 | 2 | 1 | 1 | 1 | 1 | {16×2} | 1, 7 |
| 27 | 3 | 1 | 0 | 0 | 1 | {16×3} | 1, 7, 13 |
| 28 | 3 | 1 | 1 | 1 | 1 | {16×3} | 1, 7, 14 |
| 29 | 2 | 0 | 0 | 0 | 1 | {16×2} | 1, 7, 12 |
| 30 | 3 | 1 | 1 | 1 | 1 | {16×3} | 3, 7, 12, 15 |
| 31 | 2 | 0 | 0 | 0 | 1 | {16×2, 64×2} | 1, 7 |
| 32 | 2 | 0 | 0 | 0 | 1 | {16×2} | 1, 7 |
| 33 | 2 | 1 | 0 | 0 | 1 | {16×2} | 3, 8 |
| 34 | 0 | 0 | 0 | 0 | 0 | — | — |
| 35 | 1 | 0 | 0 | 0 | 1 | {16} | 3 |
| 36 | 0 | 0 | 0 | 0 | 0 | — | — |
| 37 | 0 | 1 | 1 | 1 | 0 | — | 12 |
| 38 | 0 | 0 | 0 | 0 | 0 | — | — |
| 39 | 1 | 1 | 0 | 0 | 1 | {16} | 1 |
| 40 | 1 | 0 | 0 | 0 | 0 | {16} | 16 |
| 47 | 1 | 0 | 0 | 0 | 0 | {16} | 10 |
| 49 | 0 | 0 | 0 | 0 | 0 | — | — |
| 50 | 0 | 0 | 0 | 0 | 0 | — | — |
| 51 | 0 | 0 | 0 | 0 | 0 | — | — |

**Settlement set (21):** 16, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 35, 37,
39, 40, 47.

**Complement (9),** each independently checked against its own narration and mechanics:

| blk | what it actually is | evidence |
| ---: | --- | --- |
| 4 | helper stub, 5 % walk coverage, no map content | — |
| 17 | keep interior | `0x81e2` "YOU CLIMB THE ANCIENT STONE STAIRCASE AND RETURN TO THE MAIN FLOOR OF THE KEEP." |
| 22 | dungeon | `0x8287` "THE DOOR BEFORE YOU IS EITHER STUCK OR LOCKED FAST." + `HORIZONTAL_MENU` BASH / PICK |
| 34 | **the proven `early`-leg yeti mine** | `0x809c` "A YETI AND HIS ICE HOUNDS…"; `0x816f` "A WIDE, WELL-BRACED MINE SHAFT HERE LEADS UP TO THE MAIN LEVEL OF FIRESHEAR." |
| 36 | wilderness encounter | `0x8151` Northmen warriors attack; FRIENDS/ENEMIES menu |
| 38 | wilderness encounter | `0x81a3` yeti patrol; `0x8214` cloud giants |
| 49 | camp interrupt | `0x80f7` "AS YOU SETTLE DOWN TO SLEEP, EYES APPEAR IN THE DISTANT DARKNESS…" |
| 50 | camp interrupt | `0x8092` "YOU FALL INTO A DIZZYING SWOON AS YOU SETTLE DOWN TO REST." |
| 51 | overland travel + weather | `0x82b3/0x82bd/0x82c7` SNOWING / RAINING / CLEAR SKIES; the destination machinery of §3 |

Zero false positives and zero false negatives against the narrative reading of all 30 blocks.

---

## 3. Independent corroborator #1 — the overland block's own destination table

`ECL1.DAX#51` is the overland map. At `0x8d8b` it runs
`ON_GOSUB [0x00bf], #17, …` over 17 targets that each load a destination *name string*, then prints
`"ENTER " <name> "?"` at `0x8dcb`–`0x8dd7` and takes a `PARTY_SURPRISE` yes/no.

The name subroutines at `0x9a5a`–`0x9b19` are literal packed strings:
`LLORKH, LOUDWATER, SECOMBER, LEILON, YARTAR, TRIBOAR, LONGSADDLE, NEVERWINTER, PORT LLAST,
MIRABAR, LUSKAN, FIRESHEAR, DAGGERFORD, THE WAY INN`.

Immediately after the prompt, `0x8dff`–`0x8e48` (bytes `07 00 16 01 c0 00 01 c0 00 | 04 01 bf 00 01
c0 00 01 c0 00 | 2a 01 7c 9b 01 c0 00 01 ec 02 | 2a 01 ea 9b 01 c0 00 01 ed 02 | 2a …`) computes:

```
8dff  MULTIPLY #22, [0x00c0], [0x00c0]        ; [0x00c0] = 22 * approach-row
8e08  ADD      [0x00bf], [0x00c0], [0x00c0]   ; + destination index
8e12  GETTABLE [0x9b7c], [0x00c0], [0x02ec]   ; spawn X
8e1c  GETTABLE [0x9bea], [0x00c0], [0x02ed]   ; spawn Y
8e26  GETTABLE [0x9c58], [0x00c0], [0x02eb]   ; spawn facing
8e30  COMPARE  [0x02eb], #99 / IF_EQ / SAVE [0x0011], [0x02eb]   ; 99 = "keep current facing"
8e3e  GETTABLE [0x9cc6], [0x00bf], [0x00bf]   ; destination AREA ID
```

The approach row is the party's facing `[0x0011]` (or forced to 4 when the boat flag `[0x0041]`
is set — the by-river arrival).

Raw area-id table at `0x9cc6` (17 bytes):
`10 12 13 28 27 27 15 17 18 14 1c 19 1e 1c 1d 1f 21`.

| idx | name string | area id | per-approach spawn (x, y, facing) for rows 0/1/2/3 and boat |
| ---: | --- | ---: | --- |
| 0 | LLORKH | **16** | (0,10,E)×4 · boat (2,15,N) |
| 1 | LOUDWATER | **18** | (0,4,E) (0,4,E) (15,4,W) (15,4,W) · boat (2,14,N) |
| 2 | SECOMBER | **19** | (0,10,E) (0,10,E) (15,11,W) (15,11,W) · boat (4,11,keep) |
| 3 | THE WAY INN | **40** | (0,0,N) (0,3,E) (7,0,S) (15,3,W) |
| 4, 5 | DAGGERFORD | **39** | (8,15,N) (0,7,E) (6,1,S) (15,8,W) · boat (14,5,N) |
| 6 | *(no name — prompt skipped)* | **21** | (15,9,W)×4 · boat (4,13,E) |
| 7 | YARTAR | **23** | (8,15,N) (0,8,E) (11,0,S) (15,5,W) · boat (9,4,W) |
| 8 | TRIBOAR | **24** | (7,15,N) (0,10,E) (8,0,S) (15,9,W) |
| 9 | LEILON | **20** | (10,15,N) (10,15,N) (5,0,S) (15,8,W) |
| 10, 13 | NEVERWINTER (idx 13 **prompt-skipped**) | **28** | (7,15,N) (0,0,N) (7,0,S) (15,7,W) |
| 11 | LONGSADDLE | **25** | (5,15,N) (0,7,E) (9,0,S) (15,9,W) |
| 12 | MIRABAR | **30** | (7,15,N) (0,11,E) (0,11,E) (7,15,N) |
| 14 | PORT LLAST | **29** | (10,15,N) (10,15,N) (10,0,S) (15,7,W) |
| 15 | LUSKAN | **31** | (15,15,W) (0,0,W) (15,15,W) (15,15,W) |
| 16 | FIRESHEAR | **33** | (6,15,N)×4 |

**Prompt-skipped indices (corrected 2026-08-06 — an earlier draft marked only idx 6).** `ECL1#51`
runs `0x8d6a COMPARE [0x00bf],#13 / IF_EQ / GOTO 0x8de1`, `0x8d75 COMPARE #6 / IF_EQ / GOTO
0x8de1`, `0x8d80 COMPARE #16 / IF_GT / GOTO 0x8de1` **before** the `ON_GOSUB` at `0x8d8b`, so
indices **13, 6 and >16** jump straight to the spawn machinery at `0x8de1`, past both the name
load and the `"ENTER <name>?"` prompt at `0x8dcb`. Those arrivals show no enter-prompt even though
idx 13's `ON_GOSUB` slot still points at NEVERWINTER's name subroutine.

Distinct destination areas: **{16, 18, 19, 20, 21, 23, 24, 25, 28, 29, 30, 31, 33, 39, 40}** — 15
blocks. **Every single one is in the §2 settlement set.** Two entirely separately authored
artefacts — a per-block opcode idiom census and a travel table in a different block — agree with
zero exceptions.

The six settlement blocks *not* on the overland roster (26, 27, 32, 35, 37, 47) are reached on foot
or by plot rather than from the map: 27 is `0x8429` "THE SHIP ARRIVES IN THE SHIPBUILDING PORT OF
ORLUMBOR", 32 is the Luskan-harbour boat sequence, 35/37 are Ice Peak settlements, 47 is the
shipboard/prison sequence, 26 is **Mintarn, an island port reached by ship** (`0x863b` "I SEE
THERE ARE SHIPS HERE UPON WHICH YOU CAN LEAVE MINTARN…", `0x86ee` "YOUR PARTY CAN BOOK PASSAGE TO
ORLUMBOR OR NEVERWINTER"). **(inference)** on their exact geography; the *service* content is
byte-read, not inferred. (Corrected 2026-08-06: an earlier draft called 26 "a walk-in city
district", which block 26's own bytes refute.)

### 3a. X and Y disambiguated from the bytes

`[0x02ec]` and `[0x02ed]` are copied into `[0x0034]` and `[0x0035]` on arrival (§4). Which one is X?
Score the two readings against the geometry the travel direction demands — approaching north you
must enter at the south edge, approaching east at the west edge, and so on — across all 17
destinations × 4 approach rows:

| reading | entries whose arrival cell lies on the demanded entry edge |
| --- | ---: |
| **A: table@`0x9b7c` = X, table@`0x9bea` = Y** | **49 / 68** |
| B: table@`0x9b7c` = Y, table@`0x9bea` = X | 10 / 68 |

Reading A wins 49–10. (The 19 non-matching entries under A are towns with a single fixed gate
regardless of approach: **Waterdeep** — area 21, unnamed in the travel table but named by its own
block, `ECL1#21` `0x8075` "AS YOU APPROACH THE GREAT CITY OF WATERDEEP" (citation added
2026-08-06; the earlier draft supplied the name with no source, in a document whose ground rules
forbid setting knowledge) — always (15,9), Luskan always (15,15), Fireshear always (6,15).)
This is an independent, in-title derivation of `[0x0034]` = X, `[0x0035]` = Y, and it agrees with the
already-recorded low-address family map in `docs/engine/research/combat-trigger-c4.2b-2b-2b.md:87,
351-352` and `docs/engine/research/dqk-duel-setup-dispatch.md:34` (`[0x0034]` X, `[0x0035]` Y,
`[0x0011]` facing 0=N/1=E/2=S/3=W). `[0x02eb]` is unambiguously facing because it is the operand
compared against the "keep current facing" sentinel `#99` and defaulted from `[0x0011]`.

---

## 4. Independent corroborator #2 — the camp-interrupt narration

Independently of any opcode, 15 blocks contain a camp interruption whose text tells the party to
stop sleeping in the street and use the inn — a thing only a settlement can say:

| blk | line |
| ---: | --- |
| 16 | `0x8656` "SEVERAL DWARVES APPROACH AND TELL YOU, 'RESTING IN THE STREET ISN'T A GOOD IDEA. YOU'D BEST GO TO THE INN.'" |
| 18 | `0x813c` "PLEASE DON'T CAMP IN THE STREET. USE THE WOODLANDS INN, NEAR THE WEST GATE." |
| 19 | `0x80c2` "BEST TO NOT SLEEP IN THE STREETS, FRIENDS. FINE INN TO THE WEST HERE." |
| 20 | `0x85c6` "WE SHOULD REST IN THE INN HERE…" |
| 21 | `0x8905` "…AS YOU PREPARE TO REST IN THE STREET." |
| 23 | `0x8151` "IF YOU WANT TO REST, GO TO THE INN." |
| 25 | `0x80ad` "WE HAVE A SMALL BUT COMFORTABLE INN HERE IN LONGSADDLE." |
| 26 | `0x80fe` "CITY GUARDS APPEAR AND SUGGEST THAT YOU REST AT THE INN." |
| 27 | `0x8126` "CAMPING IS NOT ALLOWED IN THE STREETS, AND … AN INN IS LOCATED IN THE SOUTHEAST SECTION OF TOWN." |
| 28 | `0x811f` "YOU MAY NOT CAMP IN THE STREETS. PLEASE REST AT ONE OF OUR INNS." |
| 29 | `0x80ae` "YOU CAN REST ON THE SEAS OR AT THE INN, BUT NOT IN THE STREETS!" |
| 30 | `0x8261` "TOWN GUARDS APPROACH… CAMPING IS NOT ALLOWED HERE. TRY ONE OF THE INNS." |
| 37 | `0x81da` "SLEEPING IN THE STREET IS NOT WISE HERE." |
| 40 | `0x808f` "SEVERAL BLACK-CLOAKED GUARDS COME DOWN THE STREET. 'YOU CAN'T REST HERE!'" |
| 47 | `0x84d3` "IF YOU TRY TO REST IN THE STREETS HERE…" |

All 15 are a strict **subset** of the 21-block settlement set — no contradiction in either
direction. (It is a proper subset: 24, 31, 32, 33, 35, 39 carry services but not this line, so the
narration corroborates the opcode discriminator rather than replacing it.)

---

## 5. The walked town: Llorkh, `ECL1.DAX#16` / `GEO1.DAX#16`

Area id 16 is `LLORKH` by the overland name table (§3, idx 0). Corroborated in-block by
`0x8ed1` "…A SIGN ON THE DOOR SAYS 'CLOSED BY ORDER OF LORD GEILDARR! DO NOT ENTER!'" and by the
cell at (7,10): "AN OLD STONE FORTRESS STANDS TO THE EAST: LORD GEILDARR'S KEEP."

Header (`parseEclHeader`, `ECL_GEN1_SHORT_TREASURES`): magic 5000, `vm_run_1` 0x86ac,
`search_location` 0x8a56, `pre_camp_check` 0x84dc, `camp_interrupted` 0x8565,
`initial_entry` 0x8014.

### 5a. Two entry poses, both byte-read

Cold boot (`0x80b7`, bytes at `0x80c0`: `09 00 10 01 16 00 09 00 07 01 35 00 09 00 0a 01 34 00`):

```
80b7  TREASURES_EXT_42 #16
80c0  SAVE #16, [0x0016]        ; area = 16
80c6  SAVE #7,  [0x0035]        ; Y = 7
80cc  SAVE #10, [0x0034]        ; X = 10
80d2  SAVE #0,  [0x0011]        ; facing north
80d8  PICTURE #2
80db  PRINTCLEAR "%ALATE SUMMER IN THE VALLEY OF DESSARIN…"
8123  PRINTCLEAR "ON A HILLTOP ABOVE YARTAR YOUR PARTY SPENDS A LAZY AFTERNOON…RECALLING YOUR GREAT TRIUMPH AT ASCORE."
8184  PRINTCLEAR "%7NO! IT MUST BE A DREAM! THE GREEN HILLSIDE HAS BECOME A COLD STONE FLOOR!…"
822f  PRINTCLEAR "…THE FAMILIAR FACE OF YOUR OLD FRIEND AMANITAS…"
```

so `ECL1#16` is the game's opening area and the party's first pose is **(10, 7) facing north**.

Arrival from the overland map (`0x8092`, bytes `09 01 eb 02 01 11 00 | 09 01 ec 02 01 34 00 |
09 01 ed 02 01 35 00`), taken when `[0x0016]` was 51:

```
8092  SAVE [0x02eb], [0x0011]   ; facing  <- overland table
8099  SAVE [0x02ec], [0x0034]   ; X
80a0  SAVE [0x02ed], [0x0035]   ; Y
80a7  CALL [0x0001]
```

which for Llorkh (§3 idx 0) is **(0, 10) facing east**, or **(2, 15) facing north** by boat.

**Framing disclosure (added 2026-08-06).** Both listings above jump over the two bytes that
follow this title's extra opcode `TREASURES_EXT_42`. Disassembled, `0x808d` (on the overland arm)
and `0x80bb` (on the cold-boot arm) each decode as the **nonsensical `SAVE #10, #11`** — an
immediate used as a destination. That opcode's frame is flagged `uncertain: true` in the engine,
so the framing at those two sites is **NOT proven**. The stream does re-land correctly on the
cited `SAVE`s at `0x8092` and `0x80c0`; earlier drafts presented an unbroken decode and should
not have.

### 5b. `search_location` dispatch (`0x8a56`)

```
8a56  SAVE    #2, [0x0053]
8a5c  AND     [0x002d], #128, [0x00bf]     ; test the descriptor's high bit
8a65  IF_EQ / 8a66 SAVE [0x02be],[0x0053]
8a6d  SAVE    #85, [0x001b]
8a73  AND     #127, [0x002d], [0x009a]     ; masked descriptor -> [0x009a]
8a7c  GOSUB   [0x961b]
8a80  COMPARE [0x009a], #34
8a86  IF_GE / 8a87 GOTO [0x8af7]
8a8b  ON_GOTO [0x009a], #34, …             ; arms for masked descriptor 0..33
8af7  SUBTRACT #112, [0x009a], [0x00bf]
8b00  ON_GOTO [0x00bf], #16, …             ; arms for masked descriptor 112..127
8b36  EXIT
```

Two `ON_GOTO` tables keyed on the low 7 bits of `[0x002d]`. This is the whole town interaction
model: **there is no engine "town mode" in Treasures — a town is an ordinary stepped 16x16 grid
whose descriptor bytes dispatch to shop / temple / inn / training / sign scripts.** Said plainly:
Treasures' towns are just maps with shops on them.

### 5c. GEO1#16 service cells and their advertising signs

Connected components of `GEO1#16` under the "wall == 0 or door flag != 0" traversal rule:
**239 / 11 / 4 / 2** cells. Every service, every sign, both entry poses and both overland arrival
cells are in the 239-cell component.

| service | door cell | descriptor | sign cell | descriptor | sign text (real `EclVm` output) |
| --- | --- | --- | --- | --- | --- |
| armory | (3,5) | 0x90 | (2,5) | 0x0f | "A SIGN ON THE DOOR TO THE EAST READS: THE GENTELMEN'S ARMORY" *(sic)* |
| training hall | (1,3) | 0x9f | (2,3) | 0x1e | "A BRASS SIGN ON THIS DOOR SAYS: HALL OF TRAINING" |
| temple | (15,3) | 0xa1 | (15,2) | 0x20 | "CARVED INTO THE STONE ABOVE THIS DOORWAY ARE THE WORDS: NEW TEMPLE OF DUMATHAIN…" |
| inn "Lucky Caravan" | (3,9) | 0x89 | (3,10) | 0x08 | "A SIGN CARVED IN THE SHAPE OF A CAMEL SWINGS IN THE BREEZE ABOVE THIS DOOR…" |
| inn "Valhala Here" | (12,1) | 0x93 | (12,2) | 0x12 | "THE PLACE TO THE NORTH APPEARS TO BE AN INN. ITS SIGN READS: VALHALA HERE A LITL HAVEN…" |
| boat rental | (3,15) | 0x94 | (2,15) | 0x1b | "A SIGN HANGING DOWN ABOVE THIS DOOR SAYS: DOWNSTREAM BOAT RENTALS…" |

Every service door descriptor has bit 7 set and every sign has it clear (6/6). Five of the six
pairs additionally number the sign immediately below its door — armoury 16/15, training 31/30,
temple 33/32, inn 9/8, inn 19/18 — but the **boat rental breaks it** (door 20, sign 27), so the
consecutive numbering is a strong authoring tendency, not a rule. The *meaning* of bit 7 is
**(inference)**: `search_location` only uses it to select `[0x0053]`.

Note the boat-rental door at (3,15) and the boat arrival cell (2,15) from §3 idx 0 are adjacent —
the by-river entry lands the party outside the boat rental. That is a third independent agreement
between the travel table and the map.

### 5d. A legal 56-step walk touching all four service types

Starting from the overland arrival cell **(0,10)** and visiting sign→door for the armory, the
training hall, the temple and the "Lucky Caravan" inn:

```
(0,10) →7→ (2,5)sign →1→ (3,5)ARMORY →3→ (2,3)sign →1→ (1,3)TRAINING
       →21→ (15,2)sign →1→ (15,3)TEMPLE →21→ (3,10)sign →1→ (3,9)INN
```

56 steps total. Every step was checked against `GEO1#16`'s own wall and door planes via
`tools/find_geo_path.py` `traversal_requirements`:

| edge class | steps |
| --- | ---: |
| open (wall slot 0, door flag 0) | 41 |
| automatic door (door flag 1) | 15 |
| **solid wall (wall != 0, door flag 0)** | **0** |
| **bash / pick / knock door (door flag 2 or 3)** | **0** |

No step requires an item, a spell, a skill check or a prior flag. The full ordered step list with
per-step `(dir, x, y, wall, door, descriptor)` is asserted in the golden test.

### 5e. Real-`EclVm` dispatch at every cell

Run through `dialogueForCell(ECL1#16, GEO1#16 descriptor, { dialect: ECL_GEN1_SHORT_TREASURES })`:

* (3,5) → `say` "%C'ARE YOU INTERESTED IN WEAPONRY?'%A" with choices `["YES","NO"]`.
  Choosing YES writes `[0x0028] = 16` and `[0x0004] = 1`.
* (15,3) → `say` "%D'DO YOU WISH HEALING?'%A" `["YES","NO"]`. YES yields a turn of
  `kind: 'combat'` with **`monsters: []`** and `[0x0014] = 1` — the flagged empty-roster host call.
* (1,3) → `say` "%E'WOULD YOU LIKE TO TRAIN?'%A" `["YES","NO"]`. YES writes `[0x0030] = 127`
  ahead of `PROGRAM #0`.
* (3,9) → `say` "%F'WOULD YOU LIKE TO REST FOR 1 PLATINUM?'%A" `["YES","NO"]`. YES writes
  `[0x00c8] = 1` and enters the shared payment `GOSUB`; with a zero-gold VM the branch reports
  "DOESN'T HAVE ENOUGH MONEY." — i.e. the price check really runs.
* (3,15) → `say` "%9'WE'RE CLOSED.'%A" with a five-way NPC-attitude menu
  `["HAUGHTY","SLY","NICE","MEEK","ABUSIVE"]` — town NPC dialogue, not a dungeon event.
* (10,7), the cold-boot pose → `"A DWARF STOPS YOU, HOLDING UP A MAP. 'YOU'LL NEED THIS TO FIND
  YOUR WAY BACK THROUGH THE S…'"`, setting one-shot `[0x00cd] = 1`.
* (5,7), a plain street cell → empty `end` turn, no text. The dispatch is descriptor-driven, not
  blanket. (Measured 2026-08-06: 80 of the 256 possible descriptors emit text and 176 are silent;
  of the 48 descriptors actually used on `GEO1#16`, 8 are silent — so "descriptor-driven, not
  blanket" is a real property, not a turn of phrase.)

**Negative control (added 2026-08-06).** Re-running each service cell and answering **NO**
(choice index 1) leaves `[0x0004]`, `[0x0014]`, `[0x0030]` **and** `[0x00c8]` all *unwritten*.
Verified, and now asserted in golden case **M** — without it the YES assertions could not
distinguish a real acceptance gate from an unconditional write.

### 5f. Cross-check: three service doors are facing-gated, and the gate matches the sign's geometry

Sweeping all four values of `[0x0011]` at each door:

| door | fires at facing | direction of travel from its own sign cell | agrees |
| --- | --- | --- | --- |
| training (1,3) | **3 = west** only | (2,3) → (1,3) is a **west** step | yes |
| inn (3,9) | **0 = north** only | (3,10) → (3,9) is a **north** step | yes |
| inn (12,1) | **0 = north** only | (12,2) → (12,1) is a **north** step | yes |
| armory (3,5) | all four | — | n/a |
| temple (15,3) | all four | — | n/a |

The facing guard lives in the ECL script; the sign placement and the wall/door geometry live in
`GEO1.DAX`. These are separately authored files with no shared index, so the agreement is genuine
corroboration that the descriptor→cell mapping, the `[0x0011]` facing identification and the
walked route are all being read correctly. (Contrast `nwn-town-route.md`, whose analogous check
shared a single index and was therefore weaker.)

---

## 6. Verdict

The `town` leg is **proven**. Treasures ships 21 settlement script blocks out of 30, identified by
its own low-address service ABI; 15 of them are first-class overland destinations named in the
game's own travel table; a full 56-step, wall-and-door-legal walk through Llorkh (`ECL1#16` /
`GEO1#16`) reaches an armoury, a training hall, a temple and an inn, and the real `EclVm` produces
the retail prompts and the retail host-flag writes at each of them.

---

## 7. What this does NOT establish

Read this section before citing anything above.

1. **No Treasures `GAME.EXE` / `GAME.OVR` disassembly was done.** The *host-side meaning* of
   `[0x0004]`, `[0x0014]`, `[0x0028]` and `[0x0030]` is an **(inference)** from three converging
   sources — the CoAB oracle's structurally identical idioms, the constrained written values, and
   the adjacent retail narration — not from reading Treasures' native code. A native trace could
   still rename any of them.
2. **`PROTECTION` (0x3C) operands 1–16 are not resolved to stock lists.** They are *not*
   `ITEM0.DAX` block ids: `ITEM0.DAX` contains a single block (id 1, 4318 bytes). The mapping from
   operand to merchant inventory is **UNLOCATED**.
3. **`packages/engine/src/ecl/vm.ts` treats opcode 0x3C as a no-op** (`case 0x3c: // PROTECTION —
   no-op in the clean-room Krynn VM`). The engine therefore never surfaces shop stock as an effect.
   This is a real engine gap for Treasures; it is disclosed here and deliberately **not** fixed by
   this leg, whose file ownership is limited to this doc and its golden test.
4. **Bit 7 of the GEO descriptor byte** is used by `search_location` only to pick `[0x0053]`; the
   claim that it marks "door cell" is **(inference)** from the consistent door/sign pairing.
5. **Blocks 26, 27, 32, 35, 37, 47 carry services but are not overland destinations.** Their
   service *content* is byte-read; the characterisation of *what kind of place* each is (Orlumbor,
   Luskan harbour, Ice Peak settlements, shipboard sequence) is **(inference)** from narration.
   Block 40, "THE WAY INN", is a roadside inn rather than a city but is a genuine, named entry in
   the game's own destination table, so it is included on evidence rather than on judgement.
6. **Block 37 has a temple and a training hall but no shop and no inn**, and its narration is an
   Ice Peak path with an embedded settlement. It is a member of the discriminator set on
   byte evidence; calling it a "town" in the colloquial sense would be overstating.
7. **All five markers agree naive-vs-reachable with zero exceptions** (37/37, 24/24, 41/41, 8/8,
   34/34). *Corrected 2026-08-06:* an earlier 89 %-coverage walk reported 33/34 for `[0x0016]` and
   this item called the 34th site "an unreachable orphan… real and unexplained". A 95.9 %-coverage
   no-narrowing walk reaches it, so the orphan was a **walk artefact, not a byte fact**.
8. **The reachability walk covers 89.0 % of ECL1 bytes, not 100 %.** The remainder is data tables
   and unreached code. A marker hiding in the uncovered 11 % would only *add* blocks to the
   settlement set; it cannot remove one, and the naive control-flow-free scan (which reads 100 % of
   the bytes) found no additional sites for the four service markers.
9. **No live execution.** Everything above §7 is static: retail bytes plus this repo's own
   clean-room `EclVm`. *Amended 2026-08-08:* the route is now also walked by the live browser host
   (§8), which is a second execution environment but still this project's engine — no DOSBox-X
   session was started, so no claim is made about what the retail DOS binary renders on screen.
10. An earlier draft of this analysis asserted that the (10,7) cold-boot cell awards journal
    entry #1. Running the real VM refuted that: it hands the party a **map** and sets `[0x00cd]`.
    The corrected reading is what appears in §5e.


---

## 8. The live browser route (2026-08-08)

Everything in §5 was proven by calling `dialogueForCell` per cell. This section records walking the
same 56 steps through the actual browser host at `./?explore=treasures-town`, which dispatches per
rendered step over a mounted dungeon. Two things had to change first, and one thing the static
analysis had missed came out of it.

### 8a. Block 16 could not be mounted at all until `0x42` was decoded

`ECL1#16` loads its own area with **`0x42 LOAD_AREA_PIECES area, set1, set2, set3`**, Treasures'
own combined loader — the instruction CoAB splits across `0x21 LOAD_FILES` and `0x37 LOAD_PIECES`.
This repo decoded `0x42` as an opaque 1-operand extension, so block 16 emitted no `loadFiles` and
`loadDungeon` refused it: the area the retail game *opens in* was unmountable, along with 18 other
blocks. The byte anchor at `ECL1#16` is

```
0x8083  09 00 10 01 16 00              SAVE   #16 -> [0x0016]      ; game_area
0x8089  42 00 10 00 09 00 0a 00 0b     LOAD_AREA_PIECES #16, #9, #10, #11
0x8092  09 01 eb 02 01 11 00           SAVE   [0x02eb] -> [0x0011] ; the arrival facing copy
```

Evidence, the old reading's failure mode, and what is *not* claimed (no handler trace; the mapping
of operands 1/2/3 onto wall sets 1/2/3 is assumed from `0x37`'s order) are in
`packages/engine/test/treasuresLoadArea42.test.ts`.

### 8b. The route is not peaceful — two of the 56 cells are hostile

§5d checked every step for walls and doors, and §5e asked every cell what it *says*, on a fresh
memory map. Neither notices a cell that *fights*. Walking it for real does:

| cell | route step | what happens |
| --- | ---: | --- |
| (1,9) | 1 | The tavern brawl. A real retail ASK — `HELP DWARVES` / `RETREAT` — so it can be declined. |
| (4,1) | 16 | Lord Geildarr's men. **No ask at all**: print, then `COMBAT`. It has to be fought. |

Both are pinned byte-side in the golden's case P. (4,1)'s roster is the handler's own two
`LOAD_MONSTER` groups: `MON1CHA.DAX` block 3 (`.LORDSMAN`) ×3 and block 41 (`.DRIDER`) ×3.

**A carry-over worth flagging.** In the browser the (4,1) fight has *ten* enemies, not six: the
extra four are 1× `ZHENTIL FIGHTER` (block 4) and 3× `DWARF FIGHTER` (block 2), queued by the
tavern at (1,9) and never consumed because the walk declined it. That follows this engine's Gen1
model — the pending encounter roster is global and survives until `CLEAR_MONSTERS` or the next
`COMBAT` (`EclVmOptions.encounterRoster`), and neither script clears it. **(unverified)** No
retail DOS trace confirms the original engine keeps a declined encounter's roster; the browser
case asserts the ten-monster roster explicitly so that a future trace showing otherwise fails a
test instead of passing silently.

### 8c. What the browser case asserts

`apps/web/test/e2e.mjs` → `explore-treasures-town-services`, over the same ROUTE table:

* the arrival pose `(0,10) east`, then **all 56 cells**, each asserted at its own step (the table is
  stored as absolute `[facing, x, y]` so a desync fails where it happens, not at the destination);
* the four service prompts at (3,5), (1,3), (15,3), (3,9), and the sign narration at (2,5), (15,2)
  and Geildarr's keep at (7,10) — the signs arrive through `lastEvent()` rather than as dialogues;
* the accepted-service host words read back out of live area memory: `[0x0004]=1`, `[0x0028]=16`,
  `[0x0030]=127`, `[0x00c8]=1`, with the declined temple's `[0x0014]=0` as the negative control;
* the plain street cell staying silent;
* exactly one combat, at (4,1), won by the party, with the roster above.

The NPC reaction menu (`HAUGHTY`/`SLY`/`NICE`/`MEEK`/`ABUSIVE`) that follows several of these
answers is a retail parley this leg does not model; the case closes it rather than driving it.
That is a **known gap**, not a claim of completeness.
