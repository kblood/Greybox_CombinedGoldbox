# Pools of Darkness — the QUEST leg: `[0x0208]`, "Kalistes slain"

> **Naming disclosure, added 2026-08-06.** *"Kalistes slain"* is a **label coined here**, not a
> retail string: **no such literal exists anywhere in the install**. The retail artefact is the
> word `[0x0208]` and the instructions that touch it; the name is this document's shorthand for
> what those instructions are observed to do, and must not be quoted as if the game named it.
> Everywhere this file previously wrote the name in shouting capitals as though it were a retail
> identifier, it now reads as an ordinary coined label.

**Profile:** `pools-of-darkness`
**Retail root:** `C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness`
(resolved through `goldbox_corpus.choose_install` / `goldbox_corpus.file_index`, never hardcoded)
**Date:** 2026-08-06
**Verdict:** `proven`, with the scope limits of §8 stated up front rather than buried. This title
ships exactly **one** script archive, so the *cross-archive* discrimination that the Gateway and
NWN quest legs rest on is **structurally unavailable here** (§1.1). What is proven is the
next-best available shape, and it is a strong instance of it: **one** writer instruction in the
entire retail data set *(under the scope limit of §2.2 — the census matches operands that name the
address **literally**)*, **60** `COMPARE` reads spread over **16** blocks (15 of them foreign to
the writer), a named headline consumer that re-points a `NEWECL` **to a different resident script
over the same GEO map** depending on the flag, and both end-to-end directions driven by nothing but
the outcome of one retail fight.
**Engine golden:** `packages/engine/test/poolsQuestFlag.test.ts`
**Dialect:** `ECL_GEN1_SHORT_POOLS` / `GEN1_SHORT_POOLS_WORD_SETS`
(`{0x0C:4, 0x1D:0, 0x1F:1, 0x21:2, 0x22:0, 0x23:0, 0x2C:1, 0x37:2}`), `cellDescAddr = 0x002D`,
vbase `0x7FFE`, address addend `0x8000` (file offset = vaddr − 0x8000 + 2).

---

## 0. One-paragraph summary

`ECL1.DAX#82` is **Kalistes' parlor and its basement** — the drow demigoddess's lair. On the
**victory** arm of the Kalistes fight, and only on that arm, it executes `SAVE #1 -> [0x0208]` at
vaddr `0x9ACE`. That is the **only** instruction anywhere in the retail data set that writes
`[0x0208]`. Fifteen other blocks read it, gating structurally different content:

| block | what changes when `[0x0208]` flips 0 → 1 |
|---|---|
| `ECL1#64` @`0x8289` | **the Iron Wall** chains to `NEWECL #65` instead of `NEWECL #74` — a **different resident script over the same GEO map** (§4; *not* a different area) |
| `ECL1#19` @`0x8886` | the Zhentil Keep gate is guarded by **ZHENTARIM** (`SETUP_MONSTER #79` = ZHENTIL WARRIOR) instead of **DROW** |
| `ECL1#48` @`0x8339` | TRANED stops saying *" THEY NEED HELP! "* about the slaves below |
| `ECL1#23` @`0x85DA` | the Phlan seer takes a different prophecy branch (`GOTO 0x8754` only while Kalistes lives) |
| `ECL1#82` @`0x993E` | the setter's own cell becomes a silent no-op — the flag is a **consumed** gate here, unlike Treasures' `[0x025C]` |
| + `#17 #18 #35 #38 #49 #68 #69 #71 #80 #83 #85` | 39 further `COMPARE` sites, §2 |

The headline is `ECL1#64`: the same wall, the same YES answer, two different **resident scripts**.

> **CORRECTED 2026-08-06.** This document previously called that split *"two different destination
> areas"*. It is not one. This is the same wall and the same YES re-pointing a `NEWECL` to a
> **DIFFERENT RESIDENT SCRIPT OVER THE SAME MAP** — it is **NOT** "a different area". There is no
> `GEO1#74` (`GEO1.DAX` block ids are `1, 16–22, 32–37, 39, 48–50, 52, 53, 64–71, 81–84`);
> `ECL1#74 @0x805D` and `ECL1#65 @0x803F` **both** execute `LOAD_FILES #65,#4`
> (`21 00 41 00 04`) and both then set `[0x0034]=0`, `[0x0035]=0`, `[0x0011]=1`, i.e. **identical
> map and identical entry cell/facing**. The observable difference is which block's
> events/monsters are resident, plus `[0x009C]` = **48** (`#74`, written at `0x8057`) vs **45**
> (`#65`, written at `0x8039`). Real and structural, but **do not describe it as a map/area
> change** — here or in the golden.

---

## 1. Method and scope

Two independent passes over the retail bytes, exactly as the Treasures leg did:

1. **A control-flow-free raw byte census** (§2). Counting references needs no CFG model at all.
   Every load-bearing number in this document comes from this pass. The Gen1 operand codes the
   three-byte word-bearing codes are `0x01`, `0x02`, `0x03`, and `0x81`, plus short form `0x7F`.
   (`tools/gen1_ecl_encounter_scan.read_operand`; `packages/engine/src/ecl/vm.ts` `rvalue()`
   dereferences memory for `0x01/0x03/0x7F`; `0x02` is a 16-bit immediate and `0x81` is a runtime
   string pointer. All remain raw-byte candidates, so the scan looks for **all five**
   code bytes followed by `08 02`, over every decompressed block of
   **all 25** `.DAX` archives in the install — not just `01 08 02`.
2. **A control-flow-aware CFG walk** using the repo's own primitives
   (`gen1_ecl_encounter_scan.decode_one` / `header_entries` / `successors`), run in a
   **deliberately permissive** mode that never prunes a conditional branch on an inherited
   `COMPARE` outcome. This pass is used only to *classify* each raw hit (write destination vs
   read operand) and to produce the disassembly quoted in §3–§6 — never to count. §8.5 records
   the four real instructions this pass still could not reach.

Both passes used `word_sets_for_profile('pools-of-darkness')`. The shared `GEN1_SHORT_WORD_SETS`
was never used: Pools' own split carries two extra overrides (`0x1F`, `0x21`) and a repurposed
`0x37`, and a wrong dialect desyncs **silently**.

Neither `gen1_ecl_encounter_scan.py` nor `map_gen1_cross_area_flag_reads.py` was run with its
default `--markdown`/`--json` path (both default to checked-in corpus-wide documents and are
guarded by `tools/report_guard.py`). All scanner scripts lived in the session scratchpad and are
not checked in; everything below is reproducible from the primitives plus the byte patterns
printed here (§10).

### 1.1 Why cross-archive discrimination is unavailable here — say it plainly

Gateway's `[0x4C21]` and NWN's `[0x32CA]` are strong claims because the writer lives in one
`.DAX` and the readers in another; an unrelated script reusing the same scratch word in a
*different archive* is then implausible on its face. **Pools of Darkness cannot produce that
shape.** It ships exactly one script archive — `ECL1.DAX`, 329,456 bytes, 56 blocks
(`1–4, 16–27, 32–42, 48–55, 64–77, 80–86`) — plus `GEO1.DAX`. This was measured and confirmed on
2026-08-06 (commit `18e291a`); there is no `ECL0`/`ECL2`/… to find. At 56 blocks it is the
largest single-archive script corpus in this project, which makes the *census* substitute
correspondingly more informative — but it is still a different, weaker argument.

**So this document's claim must not be read as equivalent to Gateway's or NWN's.** What replaces
cross-archive separation is:

* an **exhaustive, control-flow-free census over all five dereferenceable operand encodings and
  all 25 archives**, showing exactly one **literal-address** writer and no reuse of the word for
  anything else (§2, scoped in §2.2) — which is the property cross-archive separation was only a
  *proxy* for, obtained directly;
* **fifteen** foreign reader blocks (`#17 #18 #19 #23 #35 #38 #48 #49 #64 #68 #69 #71 #80 #83 #85`)
  against the writer's own `#82`, i.e. sixteen distinct script contexts;
* consumer effects that are **structurally different in kind**, not sixteen copies of one check:
  a resident-script re-route (`NEWECL` target — *not* an area re-route, see §4), a monster-roster
  and narration swap, a suppressed sentence, a prophecy-branch switch, and the setter's own
  re-entry guard.

This is the same substitute Treasures' `[0x025C]` leg used, and it is being used deliberately and
for the same structural reason. Follow that precedent when citing it.

---

## 2. Corpus-wide census — control-flow-free

Scan: for every `.DAX` archive in the install (25 of them), decode the DAX block table and search
every block's raw bytes for `<code> 08 02` with `code ∈ {0x01, 0x02, 0x03, 0x81, 0x7F}`.

| archive | code `0x01` | `0x02` | `0x03` | `0x81` | `0x7F` | verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| **`ECL1.DAX`** | **61** | 0 | 1 | 0 | 0 | 61 real instruction operands + 1 data coincidence (below) |
| `CBODY.DAX` | 1 | 1 | 1 | 0 | 0 | picture data — not a script archive |
| `MON1CHA.DAX` | 3 | 0 | 0 | 0 | 0 | monster records — not a script archive |
| `MUSIC.DAX` | 0 | 0 | 1 | 0 | 0 | music data |
| `PIC1.DAX` | 3 | 3 | 0 | 0 | 0 | picture data |
| `SPRIT1.DAX` | 0 | 1 | 0 | 0 | 0 | sprite data |
| **total** | 68 | 5 | 3 | 0 | 0 | **76** |

Zero decode failures: every archive's block table parsed, so the census is not silently partial.
The 14 hits outside `ECL1.DAX` are byte coincidences inside compressed graphics/sound payloads —
the same noise Treasures' own document recorded for `[0x003F]`. They are not ECL programs and
carry no operand semantics.

Inside `ECL1.DAX`, cross-referencing every hit against the permissive CFG decode classifies them:

| kind | count | where |
| --- | ---: | --- |
| `SAVE #1 -> [0x0208]` — **the sole writer** | **1** | `ECL1#82 @0x9ACE`, bytes `09 00 01 01 08 02`, block offset **6864** |
| `COMPARE` / `COMPARE_AND` reads | **60** | 16 blocks, table below |
| not an instruction operand (data) | 1 | `ECL1#83`, operand-position file offset 7578, inside a byte table (`06 04 0a 08 06 | 03 03 08 02 | 03 04 08 04`); the surrounding bytes do not decode as a reachable instruction stream |

**`SAVE #1 -> [0x0208]` (`09 00 01 01 08 02`) occurs exactly once in the entire install** —
verified independently by a direct 6-byte-pattern count over every block of every archive.
**Read that claim inside the scope limit of §2.2**: it is a statement about writes that name the
address **literally**.

Reads per block:

| block | reads | block | reads | block | reads | block | reads |
|---|---:|---|---:|---|---:|---|---:|
| `#17` | 1 | `#35` | 2 | `#64` | 1 | `#80` | 1 |
| `#18` | 4 | `#38` | 1 | `#68` | 3 | `#82` | 21 *(+ the write)* |
| `#19` | 5 | `#48` | 3 | `#69` | 5 | `#83` | 7 |
| `#23` | 1 | `#49` | 2 | `#71` | 2 | `#85` | 1 |

Sum = 60. Every one of the 60 is a `COMPARE [0x0208], #k` or `COMPARE #k, [0x0208]` (or the
`COMPARE_AND` four-operand form) with `k ∈ {0, 1}` — a **2-value domain**. `[0x0208]` is a
boolean, not a chapter counter or a scratch accumulator, and nothing anywhere increments,
masks, or arithmetically combines it.

**There is therefore no collision hazard for this word inside the script corpus** — again within
the §2.2 scope limit.

### 2.1 The early leg's `[0x0276]` / `[0x0278]`, checked as the brief asked

The proven `early` leg records retail writing `[0x0276] |= 2` and `[0x0278] = 1` after the
ECL1#69/#72 Oracle scene. The brief warned that a sibling title's "persistent state" claim was
demoted to "per-area persistent slot" by exactly this check. Both words were censused the same
way before `[0x0208]` was chosen. The result is a clean negative — **not** contamination, but
**not** cross-area either:

* **`[0x0278]` — entirely block-local.** **6** raw hits corpus-wide: 5 in `ECL1#69`
  (sole writer `SAVE #1 -> [0x0278] @0x9BEC`; readers `COMPARE #1,[0x0278]` at `0x9969`, `0x9C56`,
  `0x9C6B`, `0x9C80`) and 1 byte coincidence in `PIC1.DAX#142`. **No other block touches it.**
  It is a room-local completion bit for the statue, not a quest flag.
* **`[0x0276]` — a per-area BITFIELD, spanning two blocks only.** **19** raw hits, all in
  `ECL1#69` (16) and `ECL1#72` (3), zero elsewhere in the install. Every site is an
  `AND #b,[0x0276],…` test or an `OR #b,[0x0276],[0x0276]` set with `b ∈ {1,2,4,8,16,32}` — six
  independent bits in one word, i.e. "which of the statue's arms have you dealt with". `#72` sets
  bit 2 and `#69` reads it; that is the only cross-block traffic, and `#69`/`#72` are the *same*
  scene. It is a per-area persistent slot, exactly the shape the brief warned about.

So the answer to "do other blocks reuse these words for unrelated purposes?" is **no — but only
because no other block uses them at all**. Neither is a candidate for a quest leg. This is
recorded so nobody later reads the early leg's two words as game-wide quest state; they are not.

### 2.2 SCOPE OF "SOLE" — added 2026-08-06, and it narrows the claim

The census matches operands naming the address **LITERALLY**
(`<code in 0x01/0x02/0x03/0x7F/0x81> 08 02`). The VM's `SAVE_TABLE` (`0x35`) writes a **COMPUTED**
`base + offset`, so a computed-address write would be **invisible** to this census. A bounded scan
found only **one** candidate base (`0x0116`) within an 8-bit offset of `0x0208`, so the residual
risk is **low but non-zero** — it is not zero and this document does not claim it is.

Separately and more seriously: **whether `GAME.EXE`/`GAME.OVR` itself writes the word is
UNLOCATED** — **no host disassembly was done in any pass**, and this **remains the strongest
counter-argument to the leg** (restated at §8.3). Every "sole writer" phrase in this file therefore
means *sole literal-address writer in the script corpus*, and nothing wider.

---

## 3. The setter — `ECL1.DAX#82` (7,424 bytes), Kalistes' lair

Header (`parseEclHeader`, `ECL_GEN1_SHORT_POOLS`): `vm_run_1 0x8683`, `search_location 0x8760`,
`pre_camp_check 0x863E`, `camp_interrupted 0x8679`, `initial_entry 0x8014`.

### 3a. `ECL1#82` serves **two** GEO maps — `GEO1#82` (the parlor) and `GEO1#84` (the basement)

This is load-bearing (the setter cell lives in `GEO1#84`), so it is proven three independent ways.
**Argument 1 was WITHDRAWN and replaced on 2026-08-06** — see the correction under it; the
remaining two are independent of it and carry the claim.

1. ~~**`initial_entry` recognises both area ids.**~~ **WITHDRAWN, CORRECTED 2026-08-06.**
   The bytes are real — `0x8014 COMPARE #82,[0x0016] / IF_EQ / EXIT` (`03 00 52 01 16 00 16 00`)
   and `0x801C COMPARE #84,[0x0016] / IF_EQ / GOTO 0x8587` (`03 00 54 01 16 00 16 01 01 87 85`) —
   but they **test the DEPARTED block id, not a "current area id"**. `[0x0016]` is this dialect's
   `lastBlockIdAddr`, **host-written by Pools' own `CMD_NewECL`** (`GAME.OVR+0x0e4a`, `EclBlockId`
   at `Area+0x15`). **Do not cite it as an area-id recognition proof.** What the pair does show is
   that `#82` has distinct *arrival-from* handling for both 82 and 84, which is suggestive only.
2. **It loads area 84's files itself.** `0x804A COMPARE #0,[0x01F7] ; IF_EQ ; GOTO 0x81C2`
   (`03 00 00 01 f7 01` / `16 01 01 c2 81`) reaches the capture cinematic — *"THE SPIDERS HAVE
   BEEN AT YOU, NIPPING AND GRABBING ITEMS."* / *"YOU AWAKEN TO FIND YOURSELF SECURELY LASHED TO
   STOUT POSTS."* — which begins `0x81C2 LOAD_FILES #84, #5` (`21 00 54 00 05`) and then places
   the party at `[0x0034]=1`, `[0x0035]=1`, facing `[0x0011]=2` (south), with `[0x0017]/[0x0018]`
   set to the same cell as the bounce-back anchor.
3. **The descriptor space partitions exactly.** `search_location` masks the descriptor with
   `AND #63` (`0x877B`: `2f 00 3f 01 2d 00 01 c0 00`) and dispatches a **31-arm** `ON_GOTO`
   (`0x8784`: `25 01 c0 00 00 1f …`). The two GEO blocks' masked descriptor sets are
   **`GEO1#82 = {0…15}`** and **`GEO1#84 = {0, 16…29}`** — disjoint on every non-zero value, and
   together covering arms 0–29 of the 31. One map owns the low arms, the other the high arms.
   Corroborating the direction: `GEO1#84`'s descriptor **28** (one cell, `(2,1)`, raw 156) is
   arm 28 → `0x8543` *"A LADDER LEADS TO AN UPPER LEVEL. DO YOU CLIMB IT?"*, whose YES arm runs
   `0x856F LOAD_FILES #82, #5` (`21 00 52 00 05`) — the basement's ladder back up to the parlor.

### 3b. Dispatch to the setter cell

`GEO1.DAX#84` is 1026 bytes / 16×16; descriptors at `raw[514:770]`, indexed `y*16+x`.
**Masked descriptor 27 occurs at exactly `(2,6)` and `(2,10)`, both raw byte `155` (0x9B).**
`155 & 63 = 27`, and arm 27 of the `0x8784` table is `0x993E`:

```
0x993E: COMPARE #1, [0x0208]        ; 03 00 01 01 08 02
0x9944: IF_EQ                       ; 16
0x9945: EXIT                        ; 00    <-- Kalistes already dead: the cell is a NO-OP
0x9946: AND     #128, [0x020B], [0x00C0]   ; 2f 00 80 01 0b 02 01 c0 00
0x994F: IF_NE                       ; 17
0x9950: GOTO    [0x9A08]            ; 01 01 08 9a   <-- she has already noticed you
0x9954: SAVE    #35, [0x0212]       ; 09 00 23 01 12 02  -> scene 35, no fight
0x995A: GOTO    [0x9CB1]
```

`[0x020B]` is a **block-local bitfield of `ECL1#82` alone** (bits 1/2/4/128; 14 references, every
one inside `#82`). Bit 128's **sole writer** is `0x9A40 OR #128, [0x020B], [0x020B]`
(`30 00 80 01 0b 02 01 0b 02`) on the "THE COMMOTION BRINGS SOMEONE." scene — i.e. the party has
already been noticed. This is a genuine precondition of the descriptor-27 route and is disclosed,
not hidden; the golden seeds it and also asserts what happens **without** it (§7).

### 3c. The fight and the write

```
0x9A08: SETUP_MONSTER #255, #1, #13, #0     ; 0c 00 ff 00 01 00 0d 00 00
0x9A11: PRINTCLEAR "KALISTES SPOTS YOU AND ATTACKS."
0x9A2C: GOTO      [0x9AA5]                  ; 01 01 a5 9a
0x9AA5: PARTYSTRENGTH                       ; 1d
0x9AA6: SAVE      #100, [0x001B]            ; 09 00 64 01 1b 00
0x9AAC: LOAD_MONSTER #13, #1, #13           ; 0b 00 0d 00 01 00 0d   KALISTES        x1
0x9AB3: LOAD_MONSTER #37, #7, #37           ; 0b 00 25 00 07 00 25   DROW CHAMPION   x7
0x9ABA: LOAD_MONSTER #40, #8, #40           ; 0b 00 28 00 08 00 28   DROW WIZARD     x8
0x9AC1: LOAD_MONSTER #7,  #5, #7            ; 0b 00 07 00 05 00 07   PET OF KALISTES x5
0x9AC8: COMBAT                              ; 24
0x9AC9: IF_NE                               ; 17
0x9ACA: GOTO      [0x9CEE]                  ; 01 01 ee 9c   <-- defeat/flee: bounce, NO write
0x9ACE: SAVE      #1, [0x0208]              ; 09 00 01 01 08 02   <-- THE SETTER
0x9AD4: PICTURE   #138                      ; 0e 00 8a
0x9AD7: SAVE      #0, [0x003B]
0x9ADD: SAVE      #37, [0x0212]             ; the post-kill scene
0x9AE3: GOTO      [0x9CB1]                  ; -> 0x9CD2 NEWECL #84
```

Monster names are read from the retail `MON1CHA.DAX` record names (`goldbox_corpus.decode_record_name`):
id 13 = `KALISTES`, 37 = `DROW CHAMPION`, 40 = `DROW WIZARD`, 7 = `PET OF KALISTES`.
The early leg's own ECL1#72 roster already contained `PET OF KALISTES` — the same monster family,
a different block; this is her.

`0x9ACA` is the leg's **negative control inside the retail bytes themselves**: the identical
instruction stream either bounces the party or writes the flag, purely on the combat outcome.
`0x9CEE` restores `[0x0017]/[0x0018]` into `[0x0034]/[0x0035]` (`09 01 17 00 01 34 00` /
`09 01 18 00 01 35 00`) and falls into `0x9CFC SURPRISE` (`23`), which in this dialect is
script-terminal. Gen1 `SAVE` order is (source, **destination**) — destination last — so `0x9ACE`
writes **1** into `[0x0208]`.

### 3d. Walk reachability of the setter cell

Under the engine's own step rule (`Explorer.canMove`: `cell.walls[dir] !== 0 &&
(cell.doors?.[dir] ?? 0) === 0` blocks), `GEO1#84` has **one 239-cell component** plus 17
isolated single cells. Both descriptor-27 cells and the capture-scene drop point `(1,1)` from
§3a-2 are in that 239-cell component; a legal 34-step path exists from `(1,1)` to `(2,6)`
(`(2,10)` is the same length). The golden walks it with the real `Explorer`.

*Stated honestly:* this proves **geometric** reachability, not that the walk is uninterrupted —
the shortest path crosses other event descriptors (18/19/20/24 …) which would fire their own
arms in a live game. The golden therefore proves reachability with `Explorer` and drives the
setter arm with `primeSearchLocation` on the descriptor byte, exactly as the accepted Treasures
golden does.

---

## 4. Consumer A (the headline) — `ECL1#64` (7,644 bytes), the Iron Wall

`ECL1#64`'s `search_location` (`0x8675`) masks the descriptor with `AND #63` and dispatches a
24-arm `ON_GOTO` at `0x86B2` (`25 01 bf 00 00 18 01 0b 87`), gated on `[0x01BD] == 0`
(`0x86A4`: `2f 00 ff 01 bd 01 01 c0 00`). **Arm 1 → `0x81EF`.** In `GEO1#64` masked descriptor 1
is the **entire column `x = 14`, all sixteen cells `(14,0)…(14,15)`, raw byte 1** — the wall
itself, as a wall.

```
0x81EF: COMPARE  [0x0011], #3          ; 03 01 11 00 00 03   facing WEST (see §8.3)
0x81F5: IF_NE                          ; 17
0x81F6: EXIT
0x81F7: AND      #255, [0x01BB], [0x00C0]   ; 2f 00 ff 01 bb 01 01 c0 00
0x8200: IF_NE ; GOTO [0x8234]          ; 17 01 01 34 82      wall already destroyed
        ... (else PICTURE #151, "THE IRON WALL APPEARS IMPASSABLE." / the [0x0152] branch) ...
0x8234: PRINTCLEAR "THE IRON WALL IS NOW IN RUINS. DO YOU WANT TO GO THROUGH?"   ; 12 80 2b
0x8262: PARTY_SURPRISE                 ; 22    (short-dialect YES/NO prompt)
0x8263: IF_NE ; SURPRISE               ; 17 23  answered NO -> terminal
0x8265: SAVE <str0> -> @[0x02EF] ; ... x4      (clear the four runtime name cells)
0x827D: SAVE #5, [0x000E]
0x8283: SAVE #0, [0x000F]
0x8289: COMPARE  [0x0208], #0          ; 03 01 08 02 00 00
0x828F: IF_NE                          ; 17
0x8290: NEWECL   #65                   ; 20 00 41   <-- Kalistes DEAD  -> script block 65
0x8293: NEWECL   #74                   ; 20 00 4a   <-- Kalistes ALIVE -> script block 74
```

**Same wall, same YES, two different resident scripts.** This is the leg's headline: the flag
does not merely add or remove a line of text, it re-points a `NEWECL`.

> **CORRECTED 2026-08-06.** An earlier revision of this section said *"two different destination
> areas"* and *"-> area 65 / -> area 74"*. That was wrong and is retracted. This is the same wall
> and the same YES re-pointing a `NEWECL` to a **DIFFERENT RESIDENT SCRIPT OVER THE SAME MAP** — it
> is **NOT "a different area"**. Measured from the retail bytes:
>
> * **There is no `GEO1#74`.** `GEO1.DAX` contains block ids
>   `1, 16, 17, 18, 19, 20, 21, 22, 32, 33, 34, 35, 36, 37, 39, 48, 49, 50, 52, 53, 64, 65, 66, 67,
>   68, 69, 70, 71, 81, 82, 83, 84` — `65` is present, `74` is absent.
> * **Both targets load the same map.** `ECL1#65 @0x803F` and `ECL1#74 @0x805D` **both** begin
>   `21 00 41 00 04` = `LOAD_FILES #65, #4`, and both then run
>   `09 00 00 01 34 00` / `09 00 00 01 35 00` / `09 00 01 01 11 00`, i.e.
>   `[0x0034]=0`, `[0x0035]=0`, `[0x0011]=1` — **identical map, identical entry cell, identical
>   facing**.
> * **What actually differs** is which block's events/monsters are resident, plus `[0x009C]` —
>   `SAVE #48 -> [0x009C]` at `ECL1#74 @0x8057` versus `SAVE #45 -> [0x009C]` at
>   `ECL1#65 @0x8039`.
>
> The split is **real and structural** and it remains the leg's headline — but it must be described
> as a resident-script change, never as a map/area change. The golden's assertion is the `NEWECL`
> operand (65 vs 74), which is unaffected; only the prose was wrong.

`[0x01BB]` ("the wall is
in ruins") is a **block-local** word with exactly one writer and one reader, both inside `#64`
(`SAVE #255 -> [0x01BB] @0x85E9`; the read at `0x81F7`), so seeding it does not smuggle in any
other cross-area state.

---

## 5. Consumer B — `ECL1#19` (6,295 bytes), the gate to Zhentil Keep

`ECL1#19`'s `search_location` **entry** is `0x81EF`; the descriptor **mask is at `0x81FB`**,
`AND [0x002D], #63, [0x00BF]` (`2f 01 2d 00 00 3f 01 bf 00`), and it dispatches 22 arms at
`0x8204`. **Arm 1 → `0x8873`**; `GEO1#19` has masked descriptor 1 at `(3,4)`, `(7,15)` and
`(8,15)`.

> **CORRECTED 2026-08-06.** This section previously wrote *"`search_location` (`0x81EF`) masks
> with `AND [0x002D], #63`"*, conflating the entry address with the mask address. They are twelve
> bytes apart: `0x81EF` holds `09 00 00 01 39 00` = `SAVE #0 -> [0x0039]`, then `0x81F5`
> `09 00 50 01 1b 00` = `SAVE #80 -> [0x001B]`, and **only then** `0x81FB` the `AND`. The mask
> address is **`0x81FB`, not `0x81EF`**. Re-read from the retail bytes; the entry, the arm count
> and arm 1 are unchanged.

```
0x8873: COMPARE [0x0011], #0 ; IF_NE ; EXIT     ; 03 01 11 00 00 00   facing NORTH
0x887B: AND     [0x00A7], #1, [0x00BF] ; IF_NE ; EXIT
0x8886: COMPARE [0x0208], #0            ; 03 01 08 02 00 00
0x888C: IF_NE ; 0x888D SETUP_MONSTER #79, #0, #255, #0   ; 0c 00 4f 00 00 00 ff 00 00   ZHENTIL WARRIOR
0x8896: IF_NE ; 0x8897 PRINTCLEAR "ZHENTARIM"           ; 17 12
0x88A1: IF_EQ ; 0x88A2 SETUP_MONSTER #255, #0, #35, #0  ; 16 0c
0x88AB: IF_EQ ; 0x88AC PRINTCLEAR "DROW"                ; 16 12
0x88B2: PRINT " GUARD THE GATE TO ZHENTIL KEEP. THEY LOOK YOU OVER CAREFULLY."
```

Four `IF` guards in a row consume the **same** comparison: in this VM only `COMPARE`,
`COMPARE_AND`, `PARTYSTRENGTH`, `AND`, `OR` and `FIND_SPECIAL` replace the condition flags
(`gen1_ecl_encounter_scan.scan_block`'s outcome model; `packages/engine/src/ecl/vm.ts` mirrors
it), and `SETUP_MONSTER`/`PRINTCLEAR` do not. So a single `[0x0208]` test swaps **both** the
narration *and* the encounter sprite. Measured through the real VM (§7): flag clear emits
`DROW` + `encounterSetup {picId: 35}`; flag set emits `ZHENTARIM` + `encounterSetup {spriteId: 79}`.

---

## 6. Consumer C — `ECL1#48` (5,179 bytes), TRANED's refusal

`ECL1#48 @0x82F2` is the NPC TRANED refusing to leave. Entry predicate:
`GOSUB 0x938C` = `POOLS_FIND_CHARACTER "TRANED" -> [0x0197]` then `AND #128,[0x0197],[0x00C8]`
(bit 7 = "not currently active"), so the speech runs only while TRANED is an active party member.

```
0x8320: PRINTCLEAR "'THERE ARE SLAVES DOWN BELOW."       ; 12 80 16
0x8339: COMPARE [0x0208], #1                             ; 03 01 08 02 00 01
0x833F: IF_NE                                            ; 17
0x8340: PRINT " THEY NEED HELP! "                        ; 11 80 0d
0x8350: COMPARE [0x0162], #255 ; IF_NE ; PRINT " AND THAT CAD MANSHOON FESTERS UP IN THIS TOWER."
0x837F: PRINTCLEAR "'GO ON WITHOUT ME, IF YOU MUST!'"
```

A one-sentence, purely textual difference in a third block, with no monsters and no chaining —
deliberately chosen because it is a *different kind* of effect from A and B. Note the immediately
following `[0x0162]` gate (the Manshoon flag, §9) uses the identical idiom against a **different**
word, which is a small extra guard against the reading "this is really some other state".

A fourth reader, `ECL1#23 @0x85DA` (`03 01 08 02 00 00 / 16 / 01 01 54 87` — the Phlan seer's
prophecy branch), is documented but not driven end to end; its arm sits behind a `[0x027C]`
selector and a `[0x00D5]` "already heard this one" bitfield that would need their own seeding, and
three consumers already carry the leg.

---

## 7. End-to-end, both directions, in the real VM

Everything below runs the **real `EclVm`** over the **real retail bytes**; nothing is hand-traced.

**Direction 1 — win the fight.** `primeSearchLocation(ECL1#82, backdrop = 155)` with
`[0x020B] = 128` → `combat`, roster
`[{13,×1},{37,×7},{40,×8},{7,×5}]` after *"KALISTES SPOTS YOU AND ATTACKS."* → `victory` →
`[0x0208] === 1`, `[0x0212] = 37`, `PICTURE #138`, and the run ends `chain` at
`0x9CD2 NEWECL #84`. Carrying **that same memory map** into each consumer:

* `ECL1#64` arm 1 → *"THE IRON WALL IS NOW IN RUINS…"* → `YES` → **chain to script block 65**;
* `ECL1#19` arm 1 → `ZHENTARIM` + `encounterSetup {spriteId: 79}`;
* `ECL1#48` @0x82F2 → the *" THEY NEED HELP! "* sentence is **absent**.

**Direction 2 — the NEGATIVE CONTROL: lose or flee.** Identical run, identical seeds, only the
combat outcome differs. `0x9AC9 IF_NE` takes `GOTO 0x9CEE`, the write never executes, `[0x0208]`
is **never present in the memory map at all**, `[0x0212]` is never written, and the VM ends
`exited` at vaddr `0x9CFC` with `[0x0034]` restored from `[0x0017]`. Both `fled` and `defeat`
were measured; they are identical. Carrying that memory into the same three consumers:

* `ECL1#64` → `YES` → **chain to script block 74** (a different resident script over the *same*
  `GEO1#65` map — corrected 2026-08-06, this was previously mis-described as "a different area");
* `ECL1#19` → `DROW` + `encounterSetup {picId: 35}`;
* `ECL1#48` → *" THEY NEED HELP! "* is **present**.

**Two further retail-behaviour controls at the setter cell**, both measured:

* `[0x0208]` already 1 → the arm `EXIT`s immediately at `0x9945` with **zero effects**: no
  narration, no combat. `[0x0208]` is a **consumed** gate on its own room, unlike Treasures'
  `[0x025C]`, which re-runs its fight forever. Recorded because it is the opposite of the
  precedent and a reader should not assume either behaviour.
* `[0x020B]` bit 7 clear → the same cell reaches `0x9954`, sets `[0x0212] = 35` and chains with
  **no combat and no write**. So the descriptor alone is not sufficient; being noticed is a real
  precondition, and it is stated rather than quietly seeded.

A **seeded** negative control (a bare memory with only `[0x0208]` = 0 vs 1, no setter run at all)
reproduces all three consumer splits, so the effects are the flag and not some other word the
setter also wrote.

---

## 8. Caveats — everything not proven

### 8.1 No cross-archive discrimination (restating §1.1 because it is the main limit)
One script archive exists; the strongest classical shape is unavailable, permanently, for this
title. The substitute is the exhaustive 76-hit census over five operand encodings and 25
archives. A reader who wants "writer and reader in different files" will not get it here.

### 8.2 PERSISTENCE ACROSS AREA CHANGE IS ASSUMED, WITH NO POSITIVE EVIDENCE
`[0x0208]` is written in `ECL1#82` (maps 82/84) and read in fifteen other blocks. For the wiring
to function the word must survive `NEWECL` / area transitions. **This document has no positive
evidence that it does.**

> **The earlier "every block re-claims `[0x0016]`" argument is WITHDRAWN (2026-08-06).**
> `[0x0016]` is **host-written by `CMD_NewECL`**, so its correctness after a chain is **supplied by
> the engine** and **says nothing** about whether the ECL word array (and hence `[0x0208]`)
> survives a `NEWECL`. Citing it as positive evidence was a mistake and the sentence has been
> removed rather than softened.

**No save/reload round-trip is established.** No save-format, `GAME.EXE` or `GAME.OVR` work was
done for this leg in any pass. **The golden asserts the wiring only** (setter value → each
consumer's branch); it does not assert, and must not be read as asserting, that the word persists
across an area change or a save.

### 8.3 Host-owned state the runs depend on, named rather than buried
* `[0x020B]` bit 7 — "Kalistes has noticed you". Block-local to `#82`, sole writer `0x9A40`. §3b.
* `[0x0011]` — the party **facing ordinal**, `0 = N, 1 = E, 2 = S, 3 = W`. *Inference*, corroborated
  from two Pools idioms in `ECL1#82` itself: `0x805A/0x8060/0x8072` enters at `(7,15)` — the bottom
  edge — with `[0x0011] = 0`, and `0x80D3/0x80D9/0x80EB` enters at `(4,0)` — the top edge — with
  `[0x0011] = 2`. Consistent with `packages/engine/src/world/dungeonEvents.ts`'s
  `gen1MapDirectionValue`. Consumer A needs 3, consumer B needs 0; **both are upstream of the
  `[0x0208]` compare and are held constant in both directions**, so neither can manufacture the
  split.
  **Measured 2026-08-06 while building the golden:** `primeSearchLocation`'s `facing:` option does
  **not** seed `[0x0011]`. It seeds the *host register* `0xC04D` (`MAP_DIRECTION_ADDR`), which is a
  different cell of the engine's memory map from the ECL word `0x0011` that `ECL1#64 @0x81EF` and
  `ECL1#19 @0x8873` actually compare. A caller that passes only `facing: 'west'` leaves `[0x0011]`
  unset; `COMPARE [0x0011],#3` then fails and the arm `EXIT`s with **no output at all** — which is
  silent, not an error. Consumer B's `COMPARE [0x0011],#0` passes *by accident* in that situation,
  because an unset word reads 0. The golden therefore seeds `[0x0011]` explicitly for both
  consumers rather than relying on `facing:`. Anyone re-driving these blocks must do the same.
* `[0x01BB]` (consumer A) and `[0x00A7]` bit 0 (consumer B) — block-local gates, §4/§5.
* `[0x0034] = X`, `[0x0035] = Y`, `[0x002D] = raw cell descriptor` — *inferences*, derived from the
  idioms cited above plus the engine's own `cellDescAddr` for this dialect, not from a retail
  disassembly.
* `[0x0016]` — **NOT a "current area id"** (corrected 2026-08-06). It is this dialect's
  `lastBlockIdAddr`: the **DEPARTED block id**, host-written by Pools' own `CMD_NewECL`
  (`GAME.OVR+0x0e4a`, `EclBlockId` at `Area+0x15`). It must not be cited as an area-id recognition
  proof (§3a-1) nor as evidence of ECL-memory persistence (§8.2).
* **Whether `GAME.EXE`/`GAME.OVR` ever writes `[0x0208]` itself is UNLOCATED.** **No host
  disassembly was done in any pass.** The uniqueness claim in §2 is a claim about
  **literal-address writes in the script corpus** only (§2.2), and is stated that way everywhere it
  appears. A **computed** `SAVE_TABLE` (`0x35`) write would also be invisible to the census; one
  candidate base (`0x0116`) sits within an 8-bit offset of `0x0208`, so that residual risk is low
  but non-zero. This is the single strongest
  counter-argument to the leg and it is not dismissed: if the host wrote the word, the "sole
  writer" claim would narrow to "sole *script* writer". Two things bound the risk — the word's
  strictly boolean use (§2) and the fact that a host-set completion flag would still be a real
  quest flag, just not one this document located the setter for — but neither closes it.

### 8.4 A real dialect/engine gap found on the way, not fixed here
`ECL1#19`'s arm-1 tail ends with the retail `SPRITE_OFF ; GOTO <dynamic>` idiom (`0x892A`
onwards); the VM emits an `unhandled` `GOTO(nonlocal)` effect there because the operand is a
mapped/dynamic address rather than a local code address. The identical idiom appears at
`ECL1#82 @0x8296` and `ECL1#64 @0x82ED`. It is **strictly downstream** of every assertion in §5 —
the `DROW`/`ZHENTARIM` prints have already been emitted when it occurs — but it is a real gap and
a separate task should model the dynamic-GOTO target. This file owns only two files, so it is
recorded rather than patched.

### 8.5 CFG-scanner blind spots, reported rather than hidden
Even in permissive mode (no branch pruning), the CFG walk from the five header entries fails to
reach **four** real instructions that reference `[0x0208]`: `ECL1#19 @0x8298` and `@0x8AB9`, and
`ECL1#49 @0x8363` and `@0x83F3`. All four were resolved by hand from the raw bytes and are
ordinary `COMPARE [0x0208], #k` / `COMPARE_AND … [0x0208], #0` sites followed by `IF_NE`/`IF_EQ`;
they are counted in §2's 60. A CFG-only census would have reported 56 reads and been wrong by
four. **Every count in §2 comes from the raw scan, which has no such blind spot.**

Also worth recording for whoever maintains the tools: `FLAG_REGISTRY` in
`tools/map_gen1_cross_area_flag_reads.py` has **no `pools-of-darkness` key**, so `build_report()`
skips the profile silently and exits 0 — the same shape of scope bug that has bitten this program
before (it was recorded for Treasures on 2026-08-06 and is still open for Pools). Adding
`{"location": 0x0208, "label": "quest flag KALISTES SLAIN (ECL1#82 @0x9ace); 60 reads in 16
blocks", "source_file": "ECL1.DAX", "source_block": 82}` is a tool change another task should own.

### 8.6 Static + VM only
No DOSBox-X run was made (project rule). "Reachable" means static reachability from the five ECL
header entries plus the GEO wall/door graph, or actual execution in the clean-room `EclVm`. The
walk in §3d is geometric, not a live playthrough (§3d states the interruption caveat).

---

## 9. What was checked and rejected

| candidate | why rejected |
| --- | --- |
| `[0x0278]` (early leg) | 5 script references, **all inside `ECL1#69`**. Room-local completion bit; no foreign reader at all. §2.1 |
| `[0x0276]` (early leg) | 19 references in `#69`/`#72` only, and it is a six-bit **bitfield**, not a flag. A per-area persistent slot. §2.1 |
| `[0x0162]` | Genuine runner-up: sole writer `ECL1#49 @0x8CBD SAVE #255 -> [0x0162]` (Manshoon), 11 reads across `#35`(2)/`#42`(1)/`#48`(8). Real cross-block quest state — but **three** foreign reader blocks against `[0x0208]`'s fifteen, no `NEWECL`-level consumer, and its readers cluster in one block. Strictly weaker; a good second leg if one is ever wanted. |
| `[0x0214]`, `[0x0215]` | Sole writers in `ECL1#85`, readers in `#81`/`#83`. Only two foreign reader blocks each, 3–4 reads total, all `IF_EQ ; EXIT` suppressions of the same kind. |
| `[0x0123]`, `[0x019E]` | Written by `ECL1#22`; `[0x019E]` is an `OR`-bitfield (`#36`/`#42` mask it), `[0x0123]`'s reads are 12/15 inside its own writer block. |
| `[0x01CD]`, `[0x01CF]` | Two writer blocks each (`#65`/`#73`), and `[0x01CD]` is arithmetically consumed (`SUBTRACT` at `#73 @0x918D`). Counters, not flags. |
| `[0x020B]` | Block-local bitfield of `ECL1#82`; the setter's own precondition. Disclosed in §3b as a seed, never promoted. |
| `[0x01BB]`, `[0x01BD]`, `[0x00A7]`, `[0x0197]` | Block-local gates inside a single consumer each. Seeded and named in §8.3. |
| `[0x0212]` | The `ECL1#82`/`#84` **scene selector** (40-arm `ON_GOTO`), written by the setter as an *effect* (`= 37`). Downstream of the flag, not the flag. |
| `[0x0011]`, `[0x0016]`, `[0x0034]`, `[0x0035]`, `[0x002D]`, `[0x0097]` | Host-owned engine words (facing, **departed block id** — *not* "area id", corrected 2026-08-06, §8.3 — X, Y, cell descriptor, encounter cooldown). Not quest state. |
| `[0x009A]`, `[0x00BF]`, `[0x00C0]`… | Per-block scratch, written by nearly every block. Textbook collision; never candidates. |

---

## 10. Reproduce

```powershell
cd packages/engine; npx vitest run test/poolsQuestFlag.test.ts
```

*(`pnpm --filter @goldbox/engine test -- poolsQuestFlag` runs the **whole** engine suite — pnpm
consumes the `--`, so the name is never applied as a vitest filter.)*

Raw-byte census (writes nothing into the repo; run from any scratch directory):

```python
import sys; sys.path.insert(0, r'C:\Modding\GoldBox\tools')
import goldbox_corpus as gc
inv = gc.binary_inventory.inventory(gc.inventory_roots([]), recursive=False, max_depth=3,
                                    include_unprofiled=False)
routes = gc.load_routes()
files = gc.file_index(gc.choose_install(inv, 'pools-of-darkness',
                                        routes.get('pools-of-darkness')))
lo, hi = 0x08, 0x02                       # the word [0x0208]
for name, path in sorted(files.items()):
    if path.suffix.upper() != '.DAX':
        continue
    for b in gc.read_dax_blocks(path):
        raw = b['raw']
        for i in range(len(raw) - 2):
            if raw[i + 1] == lo and raw[i + 2] == hi and raw[i] in (0x01, 0x02, 0x03, 0x81, 0x7f):
                print(name, b['block_id'], 'code 0x%02x' % raw[i],
                      'operand vaddr 0x%04x' % ((i + 1 + 0x8000 - 2) & 0xffff))
```

Expected: **76** lines — 62 in `ECL1.DAX` (61 code-`0x01` + 1 code-`0x03` data coincidence) and 14
in `CBODY`/`MON1CHA`/`MUSIC`/`PIC1`/`SPRIT1`. The single writer is the 6-byte pattern
`09 00 01 01 08 02`, which occurs exactly once in the whole install, in `ECL1.DAX#82` at
**decompressed-block offset 6864** (vaddr `0x9ACE`; `6864 = 0x9ACE − 0x8000 + 2`).

> **Correction, 2026-08-06 (independent re-verification pass).** An earlier revision of this
> document gave this offset as `6712` in both places. That was an arithmetic slip, not a different
> measurement: `0x9ACE − 0x8000 + 2 = 6864`, and `6712` back-converts to `0x9A76`, which is not the
> writer. The vaddr `0x9ACE`, the byte pattern, and the uniqueness claim were all unaffected and all
> re-confirmed. Every other number in §2, §3, §4, §5, §9 and §3d was re-measured from the retail
> bytes in the same pass and reproduced exactly — see §11.

The CFG pass needs `word_sets_for_profile('pools-of-darkness')` —
`{0x0C:4, 0x1D:0, 0x1F:1, 0x21:2, 0x22:0, 0x23:0, 0x2C:1, 0x37:2}`. The default `GEN1_WORD_SETS`
and the shared `GEN1_SHORT_WORD_SETS` both desync this title **silently**. Do **not** run either
scanner's CLI with default paths; their `--markdown`/`--json` defaults point at checked-in
corpus-wide documents and are guarded by `tools/report_guard.py`.

---

## 11. Independent re-verification, 2026-08-06

The whole document was re-measured from the retail bytes by a second pass that did **not** reuse
the first pass's scripts, and every load-bearing number reproduced. Recorded so a later reader can
see which claims are twice-measured and which are still single-sourced.

**Reproduced exactly (measured again from `C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness`):**

| claim | §  | re-measured result |
|---|---|---|
| 25 `.DAX` archives, 0 decode failures | 2 | 25 archives, 0 failures |
| corpus census of `[0x0208]` over 5 operand codes | 2 | **76** hits; `CBODY` 3, `ECL1` 62, `MON1CHA` 3, `MUSIC` 1, `PIC1` 6, `SPRIT1` 1 — identical to the §2 table |
| `ECL1` per-block distribution | 2 | `{17:1, 18:4, 19:5, 23:1, 35:2, 38:1, 48:3, 49:2, 64:1, 68:3, 69:5, 71:2, 80:1, 82:22, 83:8, 85:1}` = 62 (60 reads + 1 write + 1 data) |
| `09 00 01 01 08 02` occurs **once** in the install | 2 | once — `ECL1.DAX#82`, vaddr `0x9ACE` (offset corrected, §10) |
| the `#83` data coincidence | 2 | code-`0x03` hit at block offset 7578, context `06 04 0a 08 06 | 03 03 08 02 | 03 04 08 04` — as described |
| `[0x0278]` block-local | 2.1 | 6 hits: 5 in `ECL1#69`, 1 in `PIC1.DAX#142`. No foreign script reader |
| `[0x0276]` two-block bitfield | 2.1 | 19 hits: `ECL1#69` ×16, `ECL1#72` ×3, zero elsewhere |
| every instruction anchor in §3–§6 | 3–6 | all byte-identical (writer, both `NEWECL`s, both `SETUP_MONSTER`s, all four `COMPARE [0x0208]` sites, the `LOAD_MONSTER` roster) |
| block sizes `#82/#64/#19/#48` | 3–6 | 7424 / 7644 / 6295 / 5179 |
| `#82` `ON_GOTO` @`0x8784` | 3a | **31** arms; arm 27 = `0x993E`, arm 28 = `0x8543` |
| `#64` `ON_GOTO` @`0x86B2` | 4 | **24** arms; arm 1 = `0x81EF` |
| `#19` `ON_GOTO` @`0x8204` | 5 | **22** arms; arm 1 = `0x8873` |
| GEO descriptor partition | 3a | `GEO1#82` masked set `{0…15}`, `GEO1#84` masked set `{0, 16…29}` — disjoint on every non-zero value |
| `GEO1#84` masked 27 | 3b | exactly `(2,6)` and `(2,10)`, both raw `155` |
| `GEO1#84` masked 28 (the ladder) | 3a | exactly `(2,1)`, raw `156` |
| `GEO1#64` masked 1 | 4 | 16 cells, all `x = 14`, raw `1` |
| `GEO1#19` masked 1 | 5 | `(3,4)`, `(7,15)`, `(8,15)` |
| walk connectivity of `GEO1#84` | 3d | **one 239-cell component + 17 isolated single cells**; `(1,1)` and both descriptor-27 cells share the 239-component; shortest path `(1,1) → (2,6)` is **34 steps** |
| the capture drop point | 3a | `0x81C2 LOAD_FILES #84,#5` is followed by `SAVE #1 → [0x0034]`, `SAVE #1 → [0x0035]`, `SAVE #1 → [0x0017]`, `SAVE #1 → [0x0018]`, `SAVE #2 → [0x0011]` — i.e. `(1,1)` facing south |
| monster names from `MON1CHA.DAX` | 3c | 13 `KALISTES`, 37 `DROW CHAMPION`, 40 `DROW WIZARD`, 7 `PET OF KALISTES`, 79 `ZHENTIL WARRIOR`, 35 `DROW PRIEST` |
| the `[0x0162]` runner-up | 9 | 12 hits — sole writer `#49 @0x8CBD`, 11 reads in `#35`(2) / `#42`(1) / `#48`(8) |
| the four CFG blind spots | 8.5 | all four decode as claimed; `#19 @0x8298` and `@0x8AB9` are `COMPARE [0x0208],#0`, `#49 @0x83F3` is `COMPARE [0x0208],#1`, `#49 @0x8363` is the `COMPARE_AND` (opcode `0x14`) form |

**Corrected by this pass:**

1. The writer's block offset, `6712` → **6864** (§10). Arithmetic slip only; the vaddr, the byte
   pattern and the uniqueness claim were unaffected.
2. A new engine-seeding gotcha found while turning the probe into a real golden: `facing:` seeds
   `0xC04D`, not `[0x0011]` (§8.3). This did not affect any conclusion in §7 — the earlier probe
   seeded `[0x0011]` explicitly — but it silently produces an *empty* run for anyone who omits it,
   so it is now written down.

**Mutation-checked.** The golden is not vacuous: inverting the consumer-A expectation
(`[0x0208] = 1` → block 74 instead of 65) fails with `expected 65 to be 74`, and two genuine
assertion errors were hit and fixed while writing it. Full engine suite after the change:
**211 files / 2374 tests, all passing**; `tsc --noEmit` clean.

**Behaviour re-run in the real `EclVm`** — all of §7 reproduced: victory → `[0x0208] = 1`,
`[0x0212] = 37`, `PICTURE #138`, `chain` at `0x9CD2`; `fled` **and** `defeat` → status `exited` at
`0x9CFC` with `[0x0208]` absent from the map entirely; flag pre-set → immediate `EXIT` at `0x9945`
with zero effects; `[0x020B]` bit 7 clear → `chain` with `[0x0212] = 35`, no combat, no write;
`#64` → script block **74** vs script block **65** (same `GEO1#65` map — §4);
`#19` → `DROW`/`picId 35` vs `ZHENTARIM`/`spriteId 79`;
`#48` → `" THEY NEED HELP! "` present vs absent.

---

## 12. Adversarial-review corrections applied 2026-08-06

A refuter pass rated this leg **stands-with-caveats** and raised **six** defects. All six are
applied above, to this document **and** to `packages/engine/test/poolsQuestFlag.test.ts`. Nothing
was deleted to make a problem go away; every defect became a disclosure or a retraction in place.

| # | defect | where fixed |
|---|---|---|
| 1 | The headline is **not** "a different area" — it re-points a `NEWECL` to a **different resident script over the SAME GEO map** (no `GEO1#74`; `ECL1#65`/`#74` both `LOAD_FILES #65,#4` and both set `[0x0034]=0,[0x0035]=0,[0x0011]=1`; the difference is residency plus `[0x009C]`=48 vs 45) | title table, §0, §1.1, **§4 correction block**, §7, §11 |
| 2 | The **persistence** argument from "every block re-claims `[0x0016]`" is **withdrawn**; persistence across area change is **assumed with no positive evidence** | **§8.2** |
| 3 | `[0x0016]` is the **departed block id** (`lastBlockIdAddr`, host-written by `CMD_NewECL`, `GAME.OVR+0x0e4a`, `EclBlockId` at `Area+0x15`), **not** a "current area id"; not an area-id recognition proof | **§3a-1 (withdrawn)**, §8.3, §9 |
| 4 | "Sole writer" must be **scoped to the literal-address census**; a computed `SAVE_TABLE` (`0x35`) write is invisible (one candidate base `0x0116` within 8-bit offset), and the host-writer question is **UNLOCATED** and is the strongest counter-argument | **§2.2 (new)**, §0 verdict, §1.1, §2, §8.3 |
| 5 | `[0x0208]`'s name *"Kalistes slain"* is a **label coined here**, **not a retail string** — no such literal exists in the install | **title disclosure block** |
| 6 | `ECL1#19`'s descriptor mask is at **`0x81FB`**, not `0x81EF` (which is the `search_location` **entry**) | **§5 correction block** |

Six defects given, six applied.

**Still single-sourced / still open** — this pass did **not** improve on them, and they remain
exactly as §8 states: the host-writer question (§8.3, no `GAME.EXE`/`GAME.OVR` disassembly was
done in either pass — the strongest counter-argument to the leg), persistence across save/reload
(§8.2), the `GOTO(nonlocal)` dialect gap (§8.4), the `FLAG_REGISTRY` tool gap (§8.5), and the fact
that the §3d walk is geometric rather than a live uninterrupted playthrough.

**Engine golden.** `packages/engine/test/poolsQuestFlag.test.ts` was, up to this pass, a
non-asserting **probe** scaffold (`expect(1).toBe(1)` in every case, plus a hardcoded skip guard).
It has been rewritten as a real assertion-bearing golden covering the byte anchors, the corpus
census, the `[0x0276]`/`[0x0278]` disclosure, the GEO ground truth and `Explorer` walk, both setter
directions, both extra setter controls, and all three consumers in both directions plus seeded
bare controls. Anyone citing this document should re-run it rather than trusting the prose.
