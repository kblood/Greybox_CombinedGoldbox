# Treasures of the Savage Frontier — the QUEST leg: `[0x025C]`, "FREEZEFIRE slain"

**Profile:** `treasures-of-the-savage-frontier`
**Retail root:** `C:\Program Files (x86)\GOG Galaxy\Games\Treasures of the Savage Frontier`
(resolved through `goldbox_corpus.choose_install` / `file_index`, not hardcoded)
**Date:** 2026-08-06
**Verdict:** `proven`, with the scope limits in §8 stated up front rather than buried:
this title has exactly **one** script archive, so the *cross-archive* discrimination that
Gateway's and NWN's quest legs rest on is **structurally unavailable here** (§1.1). What is
proven is the next-best available shape — one corpus-wide writer, three `COMPARE` readers in
three **different blocks** (four different areas in total), a named headline consumer whose
menu visibly changes, and both end-to-end directions driven only by whether the party won the
fight.
**Engine golden:** `packages/engine/test/treasuresQuestFlag.test.ts`
**Dialect:** `ECL_GEN1_SHORT_TREASURES` / `GEN1_SHORT_TREASURES_WORD_SETS`
(`{0x0C:4, 0x1D:0, 0x21:2, 0x22:0, 0x23:0, 0x2C:1}`), `cellDescAddr = 0x002D`,
vbase `0x7FFE`, address addend `0x8000` (file offset = vaddr − 0x8000 + 2).

---

## 0. One-paragraph summary

`ECL1.DAX#38` is **the Ice Peak / FREEZEFIRE's lair** (its own narration: *"THEY CARRY YOU OUT
THROUGH THE TUNNEL AND DOWN THE ICE PEAK TO THE VILLAGE OF ICEWOLF"*). On the **victory** arm of
the FREEZEFIRE fight — and only on that arm — it executes `SAVE #1 -> [0x025C]` at vaddr
`0x9F3B`. That is the **only** instruction in the entire game that writes `[0x025C]`. Three
other blocks read it, each gating different content ("each in a different area" is approximate —
`ECL1#33` is a shared coastal block serving `[0x0016]` in {28,33,34,35} and `ECL1#51` is the
overland driver rather than an area in the same sense; corrected 2026-08-06):

| block | area | fork vaddr | flag CLEAR | flag SET |
|---|---|---|---|---|
| `ECL1#19` | Secomber, Amanitas' house | `0x890C` | Amanitas offers the **Crown of Amanitas** (`YES/NO`) | offer skipped, straight to the parley menu |
| `ECL1#33` | the coastal dock, shear-master's ship | `0x975D` | menu `NEVERWINTER / ICE PEAK / STAY` | menu `NEVERWINTER / STAY` — **ICE PEAK removed** |
| `ECL1#51` | the overland/wilderness driver | `0x8063` | seeds `[0x0042]`/`[0x0057]` from the chapter tables | leaves both at `0` |

The headline consumer is `ECL1#33`: killing FREEZEFIRE **closes the sea route to the Ice Peak**,
i.e. to the very area the setter lives in (`ICE PEAK` → `NEWECL #35` → `ECL1#38`). The quest
flag is what wires the boss fight to the travel broker.

---

## 1. Method and scope

Two independent passes over the retail bytes:

1. **A control-flow-free raw byte census** (§2). Counting occurrences needs no CFG model at all.
   Every load-bearing number in this document comes from this pass. *(Recall corrected
   2026-08-06.)* The Gen1 **word-referencing operand codes** are `0x01`, `0x02` and `0x03` —
   three-byte forms carrying a 16-bit word (`tools/gen1_ecl_encounter_scan.read_operand`;
   `packages/engine/src/ecl/vm.ts` `rvalue()` dereferences memory for all of them, and
   `disassemble.ts` `classify()` maps all three to kind `'word'`) — plus the `0x81` string-cell
   and `0x7f` short forms. Searching only `01 5C 02` therefore **cannot** establish
   exhaustiveness, which is the property §1.1 says replaces cross-archive discrimination. The
   census was re-run for **all** of `01 5C 02`, `02 5C 02`, `03 5C 02`, `81 5C 02` and
   `7f 5C 02` over every decompressed block of all 29 archives: codes `0x02`/`0x03`/`0x81`/`0x7f`
   return **zero** hits, code `0x01` returns exactly **four**. The four-reference conclusion
   survives intact — but as originally written the argument was lucky, not demonstrated.
2. **A control-flow-aware CFG walk** using the repo's own primitives
   (`gen1_ecl_encounter_scan.decode_one` / `header_entries` / `successors`, driven with
   `scan_block`'s COMPARE-outcome reset) to classify each hit and to produce the disassembly in
   §3–§5. This pass is used for *explanation*, never for *counting* — see §8.5 for a real
   false negative it produced.

Both passes used `word_sets_for_profile('treasures-of-the-savage-frontier')`. Passing the
shared `GEN1_SHORT_WORD_SETS` instead desyncs Treasures silently at every `LOAD_FILES` (0x21),
so it was never used.

The scanner scripts lived in the session scratchpad and are not checked in; everything is
reproducible from the primitives above plus the byte patterns printed below. **Neither
`gen1_ecl_encounter_scan.py` nor `map_gen1_cross_area_flag_reads.py` was run with its default
`--markdown`/`--json` path** (both default to checked-in corpus-wide docs and are guarded).

### 1.1 Why cross-archive discrimination is unavailable here — say it plainly

Gateway's `[0x4C21]` and NWN's `[0x32CA]` are strong because the writer lives in one `.DAX` and
the readers in another; an unrelated script reusing the same scratch word in a different archive
is then implausible. **Treasures cannot produce that shape.** It ships exactly one script
archive — `ECL1.DAX`, 251,712 bytes, 30 blocks (`4, 16–40, 47, 49, 50, 51`) — plus `GEO1.DAX`.
This was measured and confirmed on 2026-08-06 (commit `18e291a`); there is no `ECL0`/`ECL2`/…
to find.

So the claim in this document is **weaker than Gateway's and must not be read as equivalent**.
What replaces cross-archive separation is:

* an **exhaustive, control-flow-free census** showing the word is referenced exactly four times
  in the whole install and never reused for anything else (§2) — which is the property
  cross-archive separation was a *proxy* for, obtained directly;
* **three** reader blocks, none of them the writer (`ECL1#19` Secomber, `ECL1#33` the shared
  coastal block, `ECL1#51` the overland driver), which together with the writer's own `ECL1#38`
  span **four distinct script contexts**. *(Corrected 2026-08-06: an earlier draft credited the
  readers with "four distinct game areas" — three reader blocks cover three reader areas; the
  fourth is the writer's. Note also that `ECL1#33` serves `[0x0016]` in {28,33,34,35} and
  `ECL1#51` is the overland driver, so "one block = one area" is approximate for those two.)*
* three **structurally different** consumer effects (a skipped item hand-off, a removed travel
  destination, a suppressed encounter-table seed), not three copies of the same check.

---

## 2. Corpus-wide census — control-flow-free

Scan: for every `.DAX` archive in the install (29 of them), decode the DAX block table and search
every block's raw bytes for **every operand encoding the engine can dereference** — `01 5C 02`,
`02 5C 02`, `03 5C 02`, `81 5C 02`, `7f 5C 02` (see §1's recall note). Codes `0x02`/`0x03`/`0x81`/
`0x7f` return zero hits; the four below are all code `0x01`.

| pattern | meaning | hits | where |
| --- | --- | ---: | --- |
| `09 00 01 01 5c 02` | `SAVE #1 -> [0x025C]` | **1** | `ECL1.DAX#38 @0x9F3B` (file offset 7997) |
| `03 01 5c 02 00 00` | `COMPARE [0x025C], #0` | **3** | `ECL1#19 @0x890C` (2318), `ECL1#33 @0x975D` (5983), `ECL1#51 @0x8063` (101) |
| `01 5c 02` anywhere else | any other reference | **0** | — |

**Totals: 4 occurrences in the entire retail data set, 1 write and 3 reads, in 4 different
blocks.** All 29 `.DAX` archives were scanned, not just `ECL1.DAX`; the trigram does not occur
in `PIC1`, `CPIC1`, `BIGPIC1`, `MON1CHA`, `WALLDEF1`, `ITEM0`, `GEO1` or any other file, so
there is not even a graphics-data byte coincidence to explain away. (For contrast, the same
scan for `[0x003F]` returns 30+ coincidental hits inside `PIC1.DAX` picture data — the
technique does produce noise in general; `[0x025C]` simply has none.)

Cross-check: all four hits fall on a **CFG-reachable instruction start** under the profile's own
dialect. None is a byte coincidence inside another instruction's operands.

**There is therefore no collision hazard for this word.** That is a stronger uniqueness result
than either Gateway's `[0x4C21]` (which shares its block with the unrelated shared scratch word
`[0x4C03]`) or NWN's `[0x32C8]`/`[0x32CA]` (35 non-password writers).

### 2.1 The early leg's `[0x022D]` / `[0x0232]`, checked as the brief asked

The already-proven `early` leg records that retail writes `[0x022D] = 1` and `[0x0232] = 1`
after the ECL1#34 yeti chamber. Both were censused the same way before `[0x025C]` was chosen:

* **`[0x0232]` — not cross-block at all.** **2** occurrences, *both inside ECL1#34*:
  `COMPARE [0x0232],#0 @0x8C4A` and sole writer `SAVE #1 -> [0x0232] @0x8DFF`.
  It is a room-local consumed bit; no foreign reader block. Rejected. *(Corrected 2026-08-06: an
  earlier draft said 3, counting "the write's own operand" as an extra occurrence — but the write's
  operand IS the trigram occurrence. §2 counts the headline word's SAVE once, so the document
  contradicted itself on method between §2 and §2.1.)*
* **`[0x022D]` — genuinely cross-block, but weaker.** **4** occurrences (corrected 2026-08-06 from
  5, same double-counting error): sole writer
  `ECL1#34 @0x8DF9 SAVE #1`, self-read `ECL1#34 @0x8E7F`, and **two reads in `ECL1#33`**
  (`@0x81FC`, a `pre_camp_check` gate, and `@0xA188`, a `RETURN`-predicate subroutine the block's
  arms `GOSUB` at `0xA18F`). So it is a real one-writer/one-other-reader-block flag — but it has
  **one** foreign reader block against `[0x025C]`'s three, both of its consumers are the same
  "is the yeti chamber cleared" predicate rather than distinct content, and neither has a named
  headline effect. It is a *consumed bit that happens to be visible next door*, not a quest flag.

Neither word is reused as unrelated scratch anywhere — that part of the brief's worry does not
materialise for this title. They were rejected on **strength**, not on contamination.

---

## 3. The setter — `ECL1.DAX#38` (10,935 bytes), the Ice Peak

Header (`parseEclHeader`, `ECL_GEN1_SHORT_TREASURES`): `vm_run_1 0x8548`,
`search_location 0x85F9`, `pre_camp_check 0x8059`, `camp_interrupted 0x80C0`,
`initial_entry 0x8014`. `initial_entry` claims the area with `SAVE #38 -> [0x0016] @0x8034`.

### 3a. Dispatch to descriptor 121

```
0x85f9: SAVE   #2, [0x0053]
0x85ff: AND    [0x002d], #128, [0x00bf]     ; high bit of the cell descriptor
0x8608: IF_EQ
0x8609: SAVE   [0x02be], [0x0053]
0x8610: AND    #127, [0x002d], [0x009a]     ; 2f 00 7f 01 2d 00 01 9a 00   <-- [0x002d], not [0xc04f]
0x8619: GOSUB  [0x90ed]                     ; wandering-encounter roll, only for descriptors 96..100
0x861d: COMPARE [0x009a], #21
0x8623: IF_GE
0x8624: GOTO   [0x866d]
0x866d: SUBTRACT #121, [0x009a], [0x00bf]   ; 05 00 79 01 9a 00 01 bf 00  -> index = desc − 121
0x8676: ON_GOTO [0x00bf], #7, [0x9227], [0xa41a], [0xa5b6], [0xa6c1], [0xa789], [0xa7a9], [0xa849]
```

`SUBTRACT` in this VM is `op2 − op1`, so arm **0** is masked descriptor **121** → `0x9227`.
`GOSUB 0x90ED` returns immediately for 121 (`COMPARE [0x009A],#100; IF_GT; RETURN`).

### 3b. The arm, down to the write

```
0x9227: PRINTCLEAR "ENTERING THE CHAMBER, YOU ARE STUNNED INTO SILENCE. "
0x925b: PRINT      " SAYS, 'THIS MUST BE IT--FREEZEFIRE'S LAIR!'"
0x9283: PICTURE #243
        ... the treasure-hoard narration ...
0x93a3: PRINTCLEAR "YOUR ENEMIES HAVE BEATEN YOU TO THE TREASURE! YOU DRAW YOUR WEAPONS; THEY ATTACK!"
0x944a: SETUP_MONSTER #112, #0, #255, [0x00c6]
0x945a..0x94c8: LOAD_MONSTER ... (the black-robe party, a count-driven loop)
0x94d0: COMBAT                              ; fight 1
        ... victory narration, AMANITAS' projected image, "HURRY!" ...
0x9d21: PRINTCLEAR "BUT THE 'POP' CAME NOT FROM AMANITAS-- IT CAME FROM THE CARCASS OF THE ANCIENT DRAGON!"
0x9e2d: PRINTCLEAR "THERE IS NO THE TIME TO ARGUE, FOR YOUR ATTENTION IS DRAWN BACK TO FREEZEFIRE. ..."
0x9ea7: PRINT      " SHOUTS, 'FREEZEFIRE, YOU SHALL NOT LAY WASTE TO OUR FAIR REALMS ONCE MORE! ATTACK!!'
                     THE DRAGON SWOOPS DOWN UPON THE PARTY."
0x9f07: SETUP_MONSTER #255, #0, #255, #0     ; 0c 00 ff 00 00 00 ff 00 00
0x9f11: SAVE   #2, [0x0044]                  ; 09 00 02 01 44 00
0x9f17: LOAD_MONSTER #28, #5, #28            ; 0b 00 1c 00 05 00 1c
0x9f1e: SAVE   #0, [0x0044]
0x9f24: LOAD_MONSTER #28, #3, #28            ; 0b 00 1c 00 03 00 1c
0x9f2b: LOAD_MONSTER #88, #1, #88            ; 0b 00 58 00 01 00 58   <-- FREEZEFIRE itself
0x9f32: COMBAT                               ; 24                     ; fight 2
0x9f33: IF_NE                                ; 17
0x9f34: GOTO   [0xa91f]                      ; 01 01 1f a9   -- defeat/flee: bounce, NO write
0x9f38: PICTURE #241                         ; 0e 00 f1
0x9f3b: SAVE   #1, [0x025c]                  ; 09 00 01 01 5c 02      <-- THE SETTER
0x9f41: PRINTCLEAR "FREEZEFIRE'S DEAD BODY LIES AT YOUR FEET! YOU HAVE DESTROYED YOUR BLACKROBED
                    ENEMIES! ..."
0x9fb3: PRINTCLEAR "EXCITED VOICES BREAK THE SILENCE AS MANY DWARVES SWARM AROUND YOU. ..."
0xa021: PRINTCLEAR "THEY CARRY YOU OUT THROUGH THE TUNNEL AND DOWN THE ICE PEAK TO THE VILLAGE OF
                    ICEWOLF. ..."
0xa19d: SAVE   #1, [0x0056]
0xa1a4: TREASURE ...
```

`0x9F34` is the leg's **negative control inside the retail bytes themselves**: the identical
instruction stream either bounces the party (`0xA91F` restores `[0x0017]/[0x0018]` into
`[0x0034]/[0x0035]` and re-enters `search_location`) or writes the flag, purely on the combat
outcome. Gen1 `SAVE` order is (source, destination) — destination last — so `0x9F3B` writes
**1** into `[0x025C]`.

### 3c. GEO ground truth and walk reachability of the setter cell

`GEO1.DAX#38` is 1026 bytes / 16×16; descriptors at `raw[514:770]` indexed `y*16+x`.

* Masked descriptor **121** occurs at exactly **(2,6)** and **(3,6)**, both raw byte `0xF9`
  (high bit set — consistent with `0x85FF`'s `AND #128` taking its non-zero arm).
* Connected components under the engine's own step rule
  (`Explorer.canMove`: `cell.walls[dir] !== 0 && (cell.doors?.[dir] ?? 0) === 0` blocks) — the
  **permissive** rule, so any "reachable" verdict here is the weaker/safer one and any
  "unreachable" verdict would be the stronger one: **19 components**, sizes
  `[174, 28, 16, 9, 9, 3, 3, 2, 2, 1, …]`.
* (2,6)/(3,6) live in the **28-cell** component, together with `(7,8)` masked 12,
  `(2,7)` and `(4,6)` masked 20.
* **How the party gets into that pocket.** The 28-cell room complex is *not* walk-connected to
  the map edge. `ECL1#38`'s own script teleports into it: masked descriptor **11** at `(9,10)`
  (a 9-cell component that *does* touch the bottom map edge at `(10,15)`) reaches, via
  `COMPARE [0x0253],#0 / IF_NE / GOTO 0x8A0E`, the prompt

  > "THE PATHWAY ENDS HERE AT THE OPENING TO A SMALL TUNNEL. DO YOU GO IN?"
  > `HORIZONTAL_MENU [0x00BF], #2, "ENTER TUNNEL", "LEAVE"`

  whose `ENTER TUNNEL` arm runs `0x8AF6: SAVE #7 -> [0x0034]` and `0x8AFC: SAVE #8 -> [0x0035]`,
  i.e. places the party on **(7,8)** — inside the 28-cell pocket.
* From `(7,8)` a **7-step** legal walk reaches the setter cell:
  `west, west, north, west, north, west, west` → `(2,6)`; `(3,6)` is 6 steps.

`[0x0034] = X` and `[0x0035] = Y` is corroborated independently, from a different block:
`ECL1#19 @0x8B36` writes `SAVE #7 -> [0x0034]; SAVE #11 -> [0x0035]` at the end of the Amanitas
scene, and `(7,11)` is exactly the cell immediately south of Amanitas' own cell `(7,10)` and in
the same walkable component. `ECL1#51`'s `SAVE [0x02ED] -> [0x0035]` / `SAVE [0x02EC] -> [0x0034]`
idiom uses the same pair.

*Inference, labelled:* `ECL1#35` (the Ice Peak approach, reached from the ship) sets
`SAVE #15 -> [0x02ED]` before `SAVE #38 -> [0x00C8]; … NEWECL [0x00C8]`, which under that idiom
means the party enters area 38 at **Y = 15**, the bottom edge — the same edge the tunnel-mouth
component touches at `(10,15)`. The `[0x02EB..0x02EE]` hand-off words are *applied* by
`ECL1#51`'s `initial_entry`, not by `ECL1#38`'s, so the exact host path that applies them on a
dungeon-to-dungeon `NEWECL` was **not** traced; treat "enters at Y=15" as an inference, not a
measurement.

**Entry into area 38 from `ECL1#35` is coordinate-GATED, not free (corrected 2026-08-06 — an
earlier draft ended the paragraph above with "Nothing in §4–§6 depends on it", which is wrong).**
`0x8580`–`0x8595` stages the (facing, X, Y) tuple and takes the north-edge arm on
`COMPARE_AND [0x0011]==0 AND [0x0035]==0`; `0x85A5` sets the hand-off Y to 15 and `0x85AB` targets
area 38 — but `0x85B7` then runs `GETTABLE [0x9B37],[0x00BF],[0x00C0]; COMPARE [0x00C0],[0x0034]`
over a **five-entry inline table read from the block as `[0, 3, 7, 10, 13]`**, and only reaches
`0x85E2 NEWECL [0x00C8]` on a match. Since `[0x02EC]` is left holding the CURRENT `[0x0034]` (set
at `0x8587`), the party arrives at `(X, 15)` for X ∈ {0, 3, 7, 10, 13}. Of those five, **only
X = 10 lands on `(10,15)`**, the sole map-edge cell of the 9-cell component containing the tunnel
mouth at `(9,10)`; X = 0/3/7 land in the 174-cell component and X = 13 in a different 9-cell
component, neither walk-connected to the tunnel mouth. **The tunnel route therefore DOES depend on
the entry coordinate — and it holds, because 10 is in the table.**

*Also disclosed, and stronger than the earlier wording:* the tunnel prompt is itself gated on
`[0x0253] != 0`. That word is **not a bare discovery flag** — its sole writer, `ECL1#38 @0x89BE`
`SAVE #1 -> [0x0253]`, lies on a **combat-victory arm** (`0x89B4 COMBAT; 0x89B5 IF_NE;
0x89B6 GOTO 0xA91F`), so an earlier fight must be won first. Not part of this leg.

---

## 4. Consumer A — `ECL1#19`, Secomber: the Crown of Amanitas hand-off

`ECL1#19` (4,681 bytes) claims area 19 (`SAVE #19 -> [0x0016] @0x8066`). Its `search_location`
masks the descriptor at `0x8182` and dispatches `ON_GOTO [0x009A], #16, …` at `0x819A`
(table bytes at file offset 412). **Arm 14 → `0x8739`.** `GEO1.DAX#19` has masked descriptor
**14** at exactly one cell, **(7,10)**, raw `0x8E`. It sits in a 93-cell walkable component
alongside the town's other event cells and its map-edge markers (125/126/127).

The arm opens with EREK's greeting and Amanitas' welcome, then:

```
0x8909: PROGRAM #3
0x890c: COMPARE [0x025c], #0      ; 03 01 5c 02 00 00
0x8912: IF_NE                     ; 17
0x8913: GOTO    [0x8b36]          ; 01 01 36 8b        <-- flag SET: skip the whole hand-off
0x8917: COMPARE [0x003f], #1      ; 03 01 3f 00 00 01
0x891d: IF_EQ                     ; 16
0x891e: GOTO    [0x8b36]          ; 01 01 36 8b        <-- already have the crown: also skip
0x8922: PRINTCLEAR "AMANITAS THEN ASKS, 'ARE YOU READY TO TAKE ON THE BURDEN OF CARRYING A
                    MAGICAL ITEM OF GREAT POWER?'"
0x8973: PARTY_SURPRISE            ; short-dialect YES/NO prompt
0x8974: IF_NE
0x8975: GOTO    [0x8b36]          ; answered NO
0x8979: PRINTCLEAR "HE REACHES INTO HIS ROBES AND PULLS OUT A SIMPLE CROWN, MADE FROM WHAT LOOKS
                    LIKE UNPOLISHED SILVER. ..."
0x8a04: PRINTCLEAR "'THIS,' AMANITAS SAYS, 'IS THE CROWN OF AMANITAS. ... IF YOU WEAR IT WHILE YOU
                    ARE ENCAMPED ITS POWERS WILL BE ACTIVATED."
0x8a8d: PRINTCLEAR "'WHEN THE CROWN IS WORN, YOU AND I WILL BE ABLE TO SPEAK WITH EACH OTHER ...'"
0x8af7: SAVE    #1, [0x003f]      ; 09 00 01 01 3f 00  <-- "the party has the crown"
0x8afd: PRINTCLEAR "'GO NOW, AND GOOD LUCK. THE FATE OF THE NORTHERN REALMS GOES WITH YOU.'"
0x8b36: SAVE    #7, [0x0034] ; SAVE #11, [0x0035] ; GOTO [0x8ebb]
```

**Disclosure — this consumer is not a sole-cause discriminator.** `[0x003F] = 1` alone
suppresses the offer too, and `[0x003F]`'s sole writer is the crown body itself at `0x8AF7`
(a site the CFG scan cannot reach — §8.5 — but the raw scan finds). The golden therefore
asserts the full 2×2 matrix rather than a single flip:

| `[0x025C]` | `[0x003F]` | menu presented |
|---:|---:|---|
| 0 | 0 | `["YES","NO"]` — the offer |
| 0 | 1 | `["HAUGHTY","SLY","NICE","MEEK","ABUSIVE"]` |
| 1 | 0 | `["HAUGHTY","SLY","NICE","MEEK","ABUSIVE"]` |
| 1 | 1 | `["HAUGHTY","SLY","NICE","MEEK","ABUSIVE"]` |

Row 3 is the one that matters: with the crown **not** taken, the quest flag alone removes the
offer.

---

## 5. Consumer B (the headline) — `ECL1#33`, the dock: ICE PEAK closed

`ECL1#33` (8,988 bytes) is a shared coastal-town block (its `initial_entry` recognises
`[0x0016]` values 33/34/35/28 and `LOAD_FILES #33, #12`). Its `search_location` masks the
descriptor at `0x83DE` and dispatches `ON_GOTO [0x009A], #34, …` at `0x83F2`; **arm 32 →
`0x96C5`**. `GEO1.DAX#33` has masked descriptor **32** at `(0,1) (0,2) (0,3) (0,4)`, all raw
`0xA0`, in a 29-cell component that also holds two map-edge markers (`125` at `(1,1)` and
`(1,4)`).

```
0x96c5: COMPARE [0x0011], #3       ; FACING gate -- see the correction note below
0x96cb: IF_NE
0x96cc: EXIT
0x96cd: PICTURE #65
0x96d0: PRINTCLEAR "A BLAST OF COLD SALT AIR STRIKES YOUR FACE--BEFORE YOU IS THE TRACKLESS SEA.
                    A PARTY MADE UP OF A HUMAN, A DWARF AND A GNOME APPROACHES AND ASKS,
                    'TO WHERE DO YOU WISH TO TRAVEL?'"
0x975d: COMPARE [0x025c], #0       ; 03 01 5c 02 00 00
0x9763: IF_EQ                      ; 16
0x9764: GOTO    [0x978a]           ; 01 01 8a 97      <-- flag CLEAR -> the THREE-item menu
0x9768: HORIZONTAL_MENU [0x00bf], #2, "NEVERWINTER", "STAY"          ; flag SET
0x977e: ON_GOTO [0x00bf], #2, [0x97b7], [0x9ad2]
0x978a: HORIZONTAL_MENU [0x00bf], #3, "NEVERWINTER", "ICE PEAK", "STAY"
0x97a8: ON_GOTO [0x00bf], #3, [0x97b7], [0x9917], [0x9ad2]
0x97b7: "'VERY GOOD,' THE HUMAN SAYS. 'THAT WILL BE 250 PP FOR YOUR PARTY.'"  -> PAY/STAY
0x9917: "'AH,' SAYS THE DWARF. 'MANY OF OUR BROTHERS ARE BOUND THERE ALSO. THEY SHALL BE GLAD TO
         SEE YOU COME--PLEASE ACCEPT FREE PASSAGE ABOARD OUR SHIP.'"
        ... "BE SURE OF YOUR GOALS AT THE ICE PEAK ... JOURNAL ENTRY #77" ...
0x9ace: NEWECL #35                 <-- the Ice Peak approach, which map-edges into ECL1#38
0x9ad2: "'VERY WELL,' SAYS THE GNOME."  -> the parley menu
```

This is the leg's headline: **the destination the flag removes is the area the flag is set in.**
It also shifts the *meaning of a menu index*: index 1 is `ICE PEAK` (a free voyage, chaining to
block 35) when the flag is clear and `STAY` when it is set — a behaviour change the golden
asserts directly by driving the same index through both branches.

`ECL1#35 → ECL1#38` is a map-edge pair: `ECL1#35 @0x85AB` writes `SAVE #38 -> [0x00C8]` and
`NEWECL [0x00C8]` at `0x85E2`; `ECL1#38 @0x8573` writes `SAVE #35 -> [0x00C8]` for the reverse.

---

## 6. Consumer C — `ECL1#51`, the overland driver: chapter encounter seeding

`ECL1#51` (7,882 bytes) is the wilderness/overland block that many town blocks chain into with
`NEWECL #51` — a raw `20 00 33` scan finds **20 sites across 18 distinct blocks** (16, 18, 19, 20,
21, 23, 24, 25, 28, 29, 30, **31**, 33, **38**, 39, 40, 49, 50; raw-scan derived, not CFG-pruned).
*(Corrected 2026-08-06: an earlier draft said "14 different town blocks" and then listed 16 —
internally inconsistent, and neither figure matches the bytes. Not load-bearing: the claim only
needs "many blocks chain into #51".)*
Its `initial_entry` runs before anything else:

```
0x8028: SAVE     #0, [0x00c0]
0x802e: GETTABLE [0x0127], [0x00c0], [0x00c1]    ; scan a 9-entry progress table
0x8038: COMPARE  [0x00c1], #0
0x803e: IF_EQ
0x803f: GOTO     [0x8057]
0x8043: ADD      #1, [0x00c0], [0x00c0]
0x804c: COMPARE  [0x00c0], #9
0x8052: IF_NE
0x8053: GOTO     [0x802e]
0x8057: SAVE     #0, [0x0042]                    ; 09 00 00 01 42 00
0x805d: SAVE     #0, [0x0057]                    ; 09 00 00 01 57 00
0x8063: COMPARE  [0x025c], #0                    ; 03 01 5c 02 00 00
0x8069: IF_NE                                    ; 17
0x806a: GOTO     [0x8082]                        ; 01 01 82 80   <-- flag SET: skip both seeds
0x806e: GETTABLE [0x9cdc], [0x00c0], [0x0042]    ; 2a 01 dc 9c 01 c0 00 01 42 00
0x8078: GETTABLE [0x9ce6], [0x00c0], [0x0057]    ; 2a 01 e6 9c 01 c0 00 01 57 00
0x8082: ...
```

Inline tables (read straight out of the block):
`@0x9CDC = [0,0,1,1,1,2,2,2,2,3,0,0,3,3]`, `@0x9CE6 = [0,0,3,3,3,2,2,2,2,1,17,23,27,8]`.

`[0x0042]` is consumed by the same block's wandering-monster picker:

```
0x99d5: COMPARE [0x0042], #0
0x99db: IF_EQ
0x99dc: RETURN                      ; no bias
0x99dd: RANDOM  #2, [0x00c0]
0x99e3: ADD     [0x0042], [0x00c0], [0x00c0]
0x99ed: SUBTRACT #1, [0x00c0], [0x00c0]
0x99f6: ADD     [0x00c0], [0x00bf], [0x00bf]     ; monster id += [0x0042] + rand(2) − 1
```

and, **cross-block**, by `ECL1#25 @0x8B64` (`COMPARE [0x0042], #2; IF_GE; EXIT`, gating a street
description). `[0x0057]` has **zero** `COMPARE` readers anywhere in the corpus and only these two
writers — consistent with a word the host reads rather than the scripts (**UNLOCATED**: no host
disassembly was done; the label is an inference from the absence of ECL readers).

Measured through the real VM: flag clear → `[0x0042] = 1`, `[0x0057] = 3`; flag set → both `0`.
(The `[0x0127]` scan settles on `[0x00C0] = 2` in both directions, so the difference is caused by
the flag and nothing else.)

---

## 7. End-to-end, both directions, in the real VM

Everything below runs the **real `EclVm`** over the **real retail bytes**; nothing is
hand-traced. The only seed besides the GEO descriptor is `[0x0020] = 6` (party size — see
§8.3) and, for the dock, `[0x0011] = 3` (its FACING gate -- see §8.7).

**Direction 1 — win the fight.** `primeSearchLocation(ECL1#38, floor = 0xF9)` →
`combat` (the black robes) → `victory` → `combat` with roster
`[{28,×5},{28,×3},{88,×1}]` (the FREEZEFIRE wave; `[0x025C]` still unwritten at this boundary)
→ `victory` → `[0x025C] === 1` and the *"FREEZEFIRE'S DEAD BODY LIES AT YOUR FEET"* /
*"…DOWN THE ICE PEAK TO THE VILLAGE OF ICEWOLF"* narration. Carrying **that same memory map**
into each consumer:

* `ECL1#19` (7,10) → parley menu `["HAUGHTY","SLY","NICE","MEEK","ABUSIVE"]`, no crown offer;
* `ECL1#33` (0,1) → `["NEVERWINTER","STAY"]`;
* `ECL1#51` `initial_entry` → `[0x0042] = 0`, `[0x0057] = 0`.

**Direction 2 — the NEGATIVE CONTROL: flee the fight.** Identical run, identical seeds, except
the *second* combat resolves `fled` (or `defeat`): `0x9F33 IF_NE` takes `GOTO 0xA91F`, the write
never executes, `[0x025C]` is **never present in memory at all**. Carrying that memory map into
the same three consumers:

* `ECL1#19` (7,10) → `["YES","NO"]` and *"ARE YOU READY TO TAKE ON THE BURDEN OF CARRYING A
  MAGICAL ITEM OF GREAT POWER?"*;
* `ECL1#33` (0,1) → `["NEVERWINTER","ICE PEAK","STAY"]`, and index 1 chains to block **35**;
* `ECL1#51` → `[0x0042] = 1`, `[0x0057] = 3`.

The *only* difference between the two runs is the combat outcome. That is the leg: one
retail decision propagates to three different areas.

A second, seeded negative control (flag forced to 0 / 1 with no setter run at all) reproduces
the same three splits, so the effect is not an artefact of some other word the setter also wrote.

---

## 8. Caveats — everything not proven

### 8.1 No cross-archive discrimination (restating §1.1 because it is the main limit)
One archive exists; the strongest classical shape is unavailable. The substitute is the
exhaustive four-reference census. A reader who wants "writer and reader in different files"
will not get it from this title, ever.

### 8.2 Persistence across area changes is INFERRED, not proven
`[0x025C]` is written in area 38 and read in areas 19, 33 and 51. For the wiring to function the
word must survive `NEWECL` / area transitions. Positive evidence: every block guards its own
`initial_entry` with `COMPARE #<id>, [0x0016]` and re-claims `[0x0016]`, i.e. the engine keeps a
single ECL memory image across area changes rather than reloading it; and `ECL1#51`'s read is in
`initial_entry`, the very first thing that runs after a chain. But **no save-format or
`GAME.OVR` work was done for this leg**, so "survives a save/reload" is not established. The
golden asserts the *wiring* (setter value → each consumer's branch), never the save round-trip.

### 8.3 Host-owned state the runs depend on
* `[0x0020]` (party size) must be non-zero or the party-name loop at `0x9D73…0x9D93`
  (`ADD #1,[0x00BF]; COMPARE [0x00BF],[0x0020]; IF_NE GOTO 0x9D73`) never terminates and the VM
  reports `step-budget exceeded`. This is a **host-state dependency, not an engine bug**; the
  golden seeds `6`.
* `[0x0011]` (**party facing ordinal**, 0=N/1=E/2=S/3=W -- corrected 2026-08-06, see §8.7) must
  be 3 (WEST) for the dock arm; `[0x0253]` must be non-zero for the tunnel prompt. Both are named
  above and neither is claimed to be part of the quest flag.
* Whether `GAME.EXE`/`GAME.OVR` ever writes `[0x025C]` itself is **UNLOCATED** — no host
  disassembly was done. If it does, this document's uniqueness claim is a claim about the
  *script* corpus only. That is exactly how it is stated in §2.

### 8.4 Two real engine/dialect gaps found on the way, neither fixed here
This investigation owns only two files, so both are recorded rather than patched:

1. **`ECL_GEN1_SHORT_TREASURES` is missing a `0x37` override.** `ECL1#38 @0x96BA` is plainly the
   **two-operand** party-name lookup that Pools of Darkness's own dialect already models
   (`GEN1_SHORT_POOLS_WORD_SETS[0x37] = 2`): `LOAD_PIECES "GAUHOK", [0x00C0]`, with a sibling
   `"KRIIADOR" → [0x00C7]` immediately after (both results are then compared against `#7` at
   `0x96D1` and `0x96DC`). Under the shipped three-operand `LOAD_PIECES` frame the stream
   desyncs by 3 bytes; it re-lands at `0x96D1` only by luck, via a `GOTO(nonlocal)` fallthrough
   on a garbage operand (the VM emits an `unhandled` effect at `0x96CE`). The second name lookup
   is skipped entirely. **This does not affect any assertion in this document** — the desync is
   downstream of nothing the flag depends on, and the golden's setter run reaches `0x9F3B`
   through it — but it is a real dialect defect and a separate task should add
   `0x37: 2` to `ECL_GEN1_SHORT_TREASURES` and re-audit.
2. **`TREASURE` (0x27) framing at `ECL1#38 @0xA1A4` decodes with implausible operand codes**,
   and the natural run halts with `bad opcode` at file offset 8632 (vaddr `0xA1B6`) immediately
   after it. Everything this document asserts happens strictly *before* that instruction.

### 8.5 A CFG-scanner false negative, reported rather than hidden
`gen1_ecl_encounter_scan.successors()` re-widens the narrowed `compare_outcomes` set for
`0x14/0x1D/0x2F/0x30/0x3F` but **not** for `0x22 PARTY_SURPRISE`, which in the short dialect is
exactly a comparison-setting prompt. At `ECL1#19 0x8973` the inherited outcome set therefore has
an empty failing branch, and the entire Crown of Amanitas body (`0x8979…0x8B35`, including
`SAVE #1 -> [0x003F]` at `0x8AF7`) is invisible to the CFG walk. A CFG-only census consequently
reports `[0x003F]` as *"read once, written nowhere"* — which is wrong. Every count in §2 comes
from the raw scan, which has no such blind spot; the CFG pass is used only for narrative.

Also worth recording for whoever maintains the tools: `FLAG_REGISTRY` in
`tools/map_gen1_cross_area_flag_reads.py` has **no `treasures-of-the-savage-frontier` key**, so
`build_report()` skips the profile silently and exits 0 — the same shape of scope bug that has
bitten this program before. Adding `{"location": 0x025C, "label": "quest flag FREEZEFIRE SLAIN
(ECL1#38 @0x9f3b); read by ECL1#19 Secomber, ECL1#33 dock, ECL1#51 overland", "source_file":
"ECL1.DAX", "source_block": 38}` is a tool change another task should own.

### 8.6 `[0x025C]` is a completion flag, not a consumed bit
The descriptor-121 arm has **no** guard on `[0x025C]` at its head. Re-entering `(2,6)` with the
flag already set re-runs the black-robe fight (measured). So the flag does not make the room
one-shot; it is written idempotently to `1`. This is disclosed because a reader might otherwise
assume "quest flag" implies "consumed". The wiring in §4–§6 is unaffected — the consumers only
ever test `!= 0`.

### 8.7 Static + VM only
No DOSBox-X run was made (project rule). "Reachable" means static CFG reachability from the five
ECL header entries plus the GEO wall/door graph, or actual execution in the clean-room `EclVm`.
**CORRECTION 2026-08-06 -- `[0x0011]` is the party FACING ordinal (0=N, 1=E, 2=S, 3=W), NOT a
region or chapter word.** Earlier drafts of §5/§7/§8.3/§8.7/§9 and the golden's `const REGION`
labelled it "region" and §8.7 claimed the label was "derived from the idioms cited above" -- but no
idiom for `[0x0011]` was cited anywhere in this document, and the real retail idiom contradicts it.
Proven three ways from retail bytes:

1. A corpus-wide scan for `COMPARE_AND [0x0011],#k, [0x0034|0x0035],#v` returns a complete and
   *exclusive* 4-way map-edge table -- `[0x0011]==0 AND [0x0035]==0` (×2), `==1 AND [0x0034]==15`
   (×2), `==2 AND [0x0035]==15` (×2), `==3 AND [0x0034]==0` (×2) -- i.e. exactly N/E/S/W paired
   with Y==0 / X==15 / Y==15 / X==0, matching the engine's own `gen1MapDirectionValue` ordinal in
   `packages/engine/src/world/dungeonEvents.ts:73`.
2. The area-entry hand-off is a **(facing, X, Y, area)** tuple copied identically by 22 blocks:
   `SAVE [0x02EB] -> [0x0011]` ×22 alongside `SAVE [0x02EC] -> [0x0034]` ×22 and
   `SAVE [0x02ED] -> [0x0035]` ×22, with `[0x02EE]` carrying area ids 51..57.
3. All **183** `COMPARE [0x0011],#imm` sites in `ECL1.DAX` use an immediate in {0,1,2,3}, and all
   **57** immediate writes write only 0/1/2/3. A region word gating 30 blocks would not have a
   2-bit domain.

The corrected reading also explains geometry this document already measured but did not connect:
descriptor 32 sits on `(0,1)`-`(0,4)`, i.e. the **X==0 west shoreline column**, and `[0x0011]==3`
is precisely the WEST ordinal the map-edge table pairs with X==0. Verified behaviourally: only
`[0x0011]=3` opens the dock arm (0/1/2 all end with no menu). This does not break the leg -- the
gate is upstream of the `[0x025C]` compare and is held at 3 in both directions.

The `[0x0016] = current area id`, `[0x0020] = party size`, `[0x0034]/[0x0035] = X/Y` labels are
derived from the idioms cited above, not from a retail disassembly; `[0x0034]`/`[0x0035]` are
additionally corroborated by the same hand-off tuple and by the X==0/X==15/Y==0/Y==15 edge
pairings.

### 8.8 File-ownership collision during this session
`packages/engine/test/treasuresQuestFlag.test.ts` already existed when this leg started, holding
a *"PROBE 3 — temporary"* scratch test written by a concurrently-running sibling agent
investigating `[0x0186]` in `ECL1#23`/`#24`. It was overwritten by this leg's golden, per this
task's explicit file ownership. Recorded so the other leg's author knows their probe was
displaced.

---

## 9. What was checked and rejected

| candidate | why rejected |
| --- | --- |
| `[0x0232]` (early leg) | 3 references, **all inside `ECL1#34`**. Room-local consumed bit; no cross-block reader at all. |
| `[0x022D]` (early leg) | Real one-writer cross-block flag (`ECL1#34` → `ECL1#33` ×2), but only **one** foreign reader block, both reads are the same "chamber cleared" predicate, and there is no named headline consumer. Strictly weaker than `[0x025C]`. §2.1. |
| `[0x01F8]` | 2 writers in `ECL1#30` (`ADD #1` and `SAVE #255`), 10 reads across `#28/#30/#31`. A **counter**, not a flag, and its writer block is also a reader. |
| `[0x0132]`, `[0x0138]` | Single-writer, 3-reader-block words (`#19`→`#19/#20/#21`; `#20`→`#20/#21/#51`), but `[0x0132]` is an `ADD #1` visit counter and `[0x0138]`'s consumers are same-chapter bookkeeping with no distinct content. Genuine second-tier candidates; not pursued once `[0x025C]` proved out. |
| `[0x0042]` / `[0x0057]` | Downstream *of* `[0x025C]`, written only by `ECL1#51`. They are the flag's effect, not the flag. |
| `[0x003F]` | Written only inside the crown body it gates; a "you already have the item" bit, same-block. Disclosed in §4 as the alternative gate rather than promoted. |
| `[0x0011]`, `[0x0016]`, `[0x0020]`, `[0x0034]`, `[0x0035]`, `[0x002D]` | Host-owned engine words (**party facing ordinal** — corrected 2026-08-06, see §8.7 — area id, party size, X, Y, cell descriptor). Not quest state. |
| `[0x009A]`, `[0x00BF]`, `[0x00C0]`… | Per-block scratch, written by 28–30 of the 30 blocks. Textbook collision; never candidates. |

---

## 10. Reproduce

```powershell
cd packages/engine; npx vitest run test/treasuresQuestFlag.test.ts
```

8 tests, 8 passing (2026-08-06):

1. byte anchors for the writer and all three readers (plus block lengths 4681/8988/10935/7882);
2. the corpus-wide `01 5C 02` census over every `.DAX` — exactly four hits, zero decode failures;
3. `GEO1#38` descriptor 121 at (2,6)/(3,6) and the 7-step `Explorer` walk from (7,8);
4. the setter: FREEZEFIRE roster `28×5 / 28×3 / 88×1`, victory → `[0x025C] = 1`, flee → never written;
5. consumer A + the `[0x003F]` 2×2 disclosure matrix;
6. consumer B, both menus, plus `choose(1)` → `chain` to block 35 vs `say` "VERY WELL";
7. consumer C, end-to-end and seeded, `[0x0042]/[0x0057]` = `1/3` vs `0/0` with `[0x00C0] = 2` in both;
8. the "not a consumed bit" revisit check.

`npx tsc --noEmit` in `packages/engine` is clean.

*(`pnpm --filter @goldbox/engine test -- treasuresQuestFlag` runs the **whole** engine suite —
pnpm consumes the `--`, so the name is never applied as a vitest filter.)*

Raw-byte census (writes nothing into the repo; run from any scratch directory):

```python
import sys; sys.path.insert(0, r'C:\Modding\GoldBox\tools')
import goldbox_corpus as gc
inv = gc.binary_inventory.inventory(gc.inventory_roots([]), recursive=False, max_depth=3,
                                    include_unprofiled=False)
routes = gc.load_routes()
files = gc.file_index(gc.choose_install(inv, 'treasures-of-the-savage-frontier',
                                        routes.get('treasures-of-the-savage-frontier')))
needle = bytes([0x01, 0x5c, 0x02])          # the Gen1 address operand for [0x025C]
for name, path in sorted(files.items()):
    if path.suffix.upper() != '.DAX':
        continue
    for b in gc.read_dax_blocks(path):
        i = b['raw'].find(needle)
        while i >= 0:
            # vaddr of the OPERAND itself; the containing instruction starts earlier
            # (1 byte before for COMPARE, 4 bytes before for SAVE #imm).
            print(name, b['block_id'], 'file_off', i, 'operand vaddr 0x%04x' % ((i + 0x8000 - 2) & 0xffff))
            i = b['raw'].find(needle, i + 1)
```

Expected output: exactly four lines, all `ECL1.DAX` — block 19 operand `0x890D`, block 33
operand `0x975E`, block 38 operand `0x9F3E`, block 51 operand `0x8064`, i.e. the four
instructions at `0x890C`, `0x975D`, `0x9F3B` and `0x8063` listed in §2.

The CFG pass needs `word_sets_for_profile('treasures-of-the-savage-frontier')` — the default
`GEN1_WORD_SETS` and the shared `GEN1_SHORT_WORD_SETS` both desync this title silently. Do
**not** run either scanner's CLI with default paths; their `--markdown`/`--json` defaults point
at checked-in corpus-wide documents and are guarded by `tools/report_guard.py`.
