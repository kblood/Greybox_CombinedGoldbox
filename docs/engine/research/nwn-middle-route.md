# Neverwinter Nights (DOS/AOL) — MIDDLE natural-combat route: the Zhentarim temple of Bane beneath Longsaddle, `ECL1.DAX#17` (2026-08-05)

**Status: PROVEN, engine-level, from static retail bytes only.** No DOSBox-X session, no emulator,
no native capture was used or is claimed. Engine golden:
`packages/engine/test/nwnMiddleRoute.test.ts` (13 tests, all passing, each reading the real retail
files behind a `describe.skipIf` guard).

This closes the `middle` leg of `tools/goldbox_campaign_matrix.json`'s six-leg matrix for
`neverwinter-nights-dos`. It is block-distinct from the already-proven `early` leg
(`ECL1.DAX#10` / `GEO1.DAX#10`, Crossergate) and from the opening block (`ECL0.DAX#1`,
"WELCOME TO NEVERWINTER").

The route ends in **two** natural encounters that cannot both be avoided: `(2,11)` and `(1,11)` are
both articulation points of this map's strict wall graph (§5), and the retail script arms **exactly
one of them at every hour of the 24-hour clock** (§6). So a forced fight on this route is structural,
not an artefact of the seed, the hour, or the facing.

> **Correction (2026-08-05), applied after an independent reviewer re-measured this claim.** The
> sentence above is *conditional*, and an earlier phrasing in §6 ("a party crossing this map
> cannot avoid a fight, at any time of day, by any route") overstated it. What the articulation-point
> proof establishes is narrower and is what is claimed here: **any route that reaches the
> descriptor-108 chamber at (0,9) must step on both (2,11) and (1,11)**, and one of those two is
> armed at every hour — so *that* route always fights. A party that never goes to (0,9) is not
> forced into any of the three encounters. §6 now states the claim in that conditional form.

---

## 0. Files, dialect, addressing

Install (read-only): `{external-game-holdings}/Neverwinter Nights DOS/neverwinter-nights/neverwint/`

| File | What was read | Verified |
| --- | --- | --- |
| `ECL1.DAX` block 17 | decompressed **6681** bytes | container TOC via `tools/goldbox_corpus.read_dax_blocks`; `ECL1` holds blocks 10, 11, 12, 14, 15, 16, 17, 18, 19 |
| `ECL1.DAX` block 16 | decompressed **5858** bytes | Longsaddle — the *only* block in the corpus that chains into 17 (§2) |
| `GEO1.DAX` block 17 | **1026** bytes, 16×16 | header word `raw[0..1]` = 1024 (0x400), the CoK-shaped Gen1 GEO |
| `MONCHA.DAX` | records decoded with the engine's own `decodeMonsterArchive(..., 'neverwinter-nights-dos')` | ids 34/98/92/35/95 resolve to `DISPLACER BEAST` / `UMBER HULK` / `PYRO SNAKE` / `HELL HOUND` / `SALAMANDER` |

Corpus shape (from the container TOCs, not from documentation):

```
ECL0 [1 2 3 4 5 6 7 8 9]         GEO0 [1 2 3 4 5 6 7 8 9]
ECL1 [10 11 12 14 15 16 17 18 19] GEO1 [10 11 12 14 15 16 17 18 19]
ECL2 [20 21 22 23 24 25 26 27 28 29] GEO2 [20 ... 29]
ECL3 [30]                         GEO3 [30]
ECL5 [51 59]                      (no GEO)
ECL7 [78 79]                      (no GEO)
```
33 ECL blocks total. There is no `WILDCOM.DAX` in this release.

**Dialect: `ECL_GEN1`** (long frames), `headerLen 22`, `vbase 0x7FFE`, `hasMagic`, no
`cellDescAddr` override so the per-cell descriptor is read from `[0xC04F]`. NWN is not one of the
four short-frame titles (DoK / Gateway / Treasures / PoD).

**Honest note on the dialect (test J).** The dialect choice here is *not* discriminating on this
block. Re-running the entire 20-step route under `ECL_GEN1_SHORT` produces byte-identical outcomes,
because no instruction on any path this leg walks is one of the frames the dialects disagree about
(0x1D / 0x21 / 0x22 / 0x2C). Test J records that fact rather than dressing it up as a verified
counterfactual. What it *does* buy: a wrong dialect desyncs the operand stream and yields garbage,
and no garbage appears under either reading.

**Addressing.** `file offset = vaddr - 0x8000 + 2`. Header far pointers live at
`2 + slot*4 + 2`. Block 17's header:

| slot | vaddr | offset | role |
| --- | --- | --- | --- |
| `eclInitialEntry` | `0x8095` | 151 | real code, **not** the canonical `0x8014` trampoline |
| `searchLocation` | `0x811C` | 286 | per-cell dispatcher |
| `vmRun1` | `0x840A` | 1036 | |
| `preCampCheck` | `0x841B` | 1053 | |
| `campInterrupted` | `0x8444` | 1094 | |

Magic `0x1388` present.

---

## 1. The area, and why it is this block

Block 17 is the Zhentarim temple of Bane reached by falling down a chute out of Longsaddle. Its own
strings identify it (6-bit packed, decoded with the same rule as
`packages/engine/src/ecl/disassemble.ts::decodeEclString`):

| vaddr | string |
| --- | --- |
| `0x86CB` | `A VAST TEMPLE STRETCHES AWAY TO THE WEST. THE IMAGE OF A BLACK HAND ON A FIELD OF RED IS DISPLAYED ABOVE THE RICHLY DECORATED ALTAR.` |
| `0x8821` | `THE BRONZE DRAGON SHAKES ITSELF... 'I WILL NOT AID THE ZHENTARIM...'` |
| `0x8F2F` | `YOU ENTER A ROOM WHERE TWO BEHOLDERS ARE EXAMINING A SET OF MAPS, GUARDED BY WELL-ARMED FIGHTERS.` |
| `0x9210` | `'ALL HAIL THE WISE AND ALL-KNOWING LORD MANSHOON OF ZHENTIL KEEP!'` |
| `0x9538` | `YOU ASCEND THE STAIRWAY AT THE END OF THE ROOM, PASS THROUGH A SECRET DOOR AND FIND YOURSELF BACK IN LONGSADDLE.` |
| `0x989B` | `THE MAP BURSTS INTO FLAME AND IS GONE. YOU CLIMB THE STAIRCASE... AND ARE AGAIN ON THE STREETS OF LONGSADDLE.` |

The black hand on a field of red is Bane's symbol. Block 16 is Longsaddle itself
(`'WELCOME TO LONGSADDLE,' SAYS THE ...` @`0x8BFE`, `LONGSADDLE PUBLIC MARKET` @`0x8AC7`,
`'THAT'S WHERE THE HARPELLS LIVE.'` @`0x8FA5`, `I AM ARDANAC HARPELL, LORD OF LONGSADDLE` @`0x9035`).

---

## 2. Why "middle" — and exactly how much of that is inference

**Proven mechanically:**

- It is not the opening block. The opening block is 1 (`ECL0.DAX`); block 17 is in `ECL1.DAX`.
- It is not the `early` leg's block. That leg is proven on `ECL1.DAX#10` / `GEO1.DAX#10`.
- **Block 16 is the only block in the entire 33-block corpus that names block 17 as a `NEWECL`
  target** (test K). A raw byte scan of all six ECL archives for the immediate encoding
  `20 00 11` returns exactly three sites, all in `ECL1#16`: offsets 4790, 5291, 5835.
- **Block 17's only exits go back to block 16** (test K): its four `20 00 10` sites are at offsets
  945, 5536, 5978, 6461. Block 17 is a cul-de-sac in the chain graph.

**The immediate-`NEWECL` graph** over the 33 blocks (same raw scan, edges to non-existent block ids
dropped) gives these hop distances from block 1:

```
1:0  2:1 3:1 4:1 8:1 12:1 20:1 27:1 28:1 51:1
5:2 6:2 9:2 11:2 14:2 15:2 18:2 21:2 22:2 24:2 25:2 29:2 30:2 78:2
7:3 10:3 16:3 19:3 23:3 26:3 59:3 79:3
17:4        <-- the unique deepest block
```
Block 17 is the single most distant block from the start hub, reached only as
`1 -> 12 -> 15 -> 16 -> 17`.

**INFERENCE (labelled as such).** "Mid-campaign" is a *reading* of that structure plus the strings,
not a proven story position. The supporting argument: it is four chain hops deep behind a single
gatekeeper town; its own exits return the party to that town rather than advancing anywhere; and the
two blocks that read as endgame (78 / 79, in `ECL7.DAX`, which have **no GEO blocks at all** and so
are not walkable areas) sit in a different subgraph reached via block 28. Hop distance is not story
order — 78 is at distance 2 — so this is corroboration, not proof. Nothing in this leg depends on
the placement judgement being right; what the leg proves is a walked mid-dungeon route with forced
combat, and that stands whatever the narrative position turns out to be.

**Limitations of the byte scan (stated up front).** The scan catches only the *immediate* operand
form of `NEWECL`. (a) A computed/word-operand target would be missed: there are eight sites in the
corpus where byte `0x20` is followed by an operand code in {1,2,3} — `ECL1#14`@4263, `ECL1#19`@2101,
`ECL2#25`@311 and @6079, `ECL2#28`@449 and @4006, `ECL2#29`@2568 and @2595 — none of them in block
16 or 17, and none verified to be real instructions. (b) The scan can also produce false positives:
block 28's hits include a target byte 34, and there is no block 34 in the corpus. So the
*exclusion* direction ("a block whose bytes never contain the pattern cannot execute it") is sound;
the *inclusion* direction is a candidate list. For blocks 16 and 17 the hits were confirmed as real
instructions by disassembly (§3, §4).

---

## 3. The entry gate: block 17 bounces you out unless you came from Longsaddle

`initial_entry` @`0x8095` (offset 151), disassembled:

```
0x8095  AND        #127 [0xC04F] [0x4C02]
0x809E  SAVE       [0x4C02] [0x4C01]
0x80A5  SAVE       #0 [0x4C00]          ; the plain-floor step counter
0x80AB  SAVE       #1 [0x4BFB]
0x80B1  SAVE       #2 [0x4CFE]
0x80B7  SAVE       #0 [0x4D00]
0x80BD  LOAD_FILES #17 #2 #255
0x80C4  LOAD_PIECES #3 #17 #255
0x80CB  SAVE       #2 [0x4BFE]
0x80D1  GOSUB      [0x8621]
0x80D5  SAVE       #99 [0x7EC6]
0x80DB  COMPARE    [0x4BF2] #126 ; IF_EQ GOTO 0x80FC
0x80E6  COMPARE    [0x4BF2] #17  ; IF_EQ GOTO 0x8115
0x80F1  COMPARE    [0x4BF2] #16  ; IF_NE GOTO 0x83A3     <-- the bounce
...
0x83A3  SAVE       #9  [0xC04C]
0x83A9  SAVE       #0  [0xC04B]
0x83AF  NEWECL     #16
```

Raw bytes at offset 151..204 (test A):
`2f007f014fc001024c0901024c01014c09000001004c09000101fb4b09000201fe4c09000001004d2100110002` `00ff370003001100ff`
and at offset 933..947: `090009014cc0090000014bc0200010`.

`[0x4BF2]` is `LastEclBlockId`. So:

- **Cold boot** (`[0x4BF2]` unset ⇒ 0): the area's own `LOAD_FILES #17,#2,#255` and
  `LOAD_PIECES #3,#17,#255` run unconditionally *before* the predecessor test, then the party is
  teleported to (0,9) and chained straight back to block 16. Test A drives this through the real
  `EclVm` and asserts `status: 'chain'`, `chainBlockId: 16`, `[0xC04B]=0`, `[0xC04C]=9`.
- **Legal predecessors 16, 17, 126**: no bounce, and — importantly — **no coordinate write at all**
  (test B). Block 17 never poses the party itself on the legal path.
- Predecessors 1, 10, 12, 15, 21, 30 all bounce (test B, negative controls).

> **Correction (2026-08-05):** of those three accepted values only **16** is a real predecessor in
> the shipped data. **126 is not a block id in this corpus at all** — the 33 shipped ids are
> 1–12, 14–30, 51, 59, 78, 79 (§0) — so the `0x80DB COMPARE [0x4BF2],#126` arm can never be taken
> by a shipped `NEWECL`, and 17 is the block's own id (a self-re-entry value, with no corpus
> `NEWECL #17` outside `ECL1#16`; see §2). The doc and the golden previously listed all three as
> "legal predecessors" without saying that two of them are unreachable in practice. The behaviour
> asserted (no bounce, no coordinate write) is unchanged and still measured; only the framing is
> corrected.

### The entry pose comes from the predecessor — and there are THREE such predecessors

**This is a documented deviation from the ideal leg shape** ("spawn pose derived from the block's
own `initial_entry`"). Block 17's `initial_entry` writes a pose only on the *bounce* path. The pose
that matters is written by Longsaddle immediately before the chain, in `ECL1#16`:

```
0x92A8  SAVE   #15 [0xC04B]      ; X = 15
0x92AE  SAVE   #10 [0xC04C]      ; Y = 10
0x92B4  NEWECL #17
```
Raw bytes at `ECL1#16` offset 4778..4792: `09000f014bc009000a014cc0200011` (test C).

> **Disclosure added 2026-08-05 (this was missing, and it is load-bearing).** `ECL1#16` contains
> **three** CFG-reachable `NEWECL #17` sites, not one — the same three offsets §2 already lists
> (4790, 5291, 5835) — and **each writes a different entry pose**:
>
> | `NEWECL #17` at | pose written immediately before | strict-passability component containing it |
> |---|---|---:|
> | offset 4790, vaddr `0x92B4` | `0x92A8 SAVE #15,[0xC04B]`; `0x92AE SAVE #10,[0xC04C]` → **(15,10)** | **72** cells |
> | offset 5291, vaddr `0x94A9` | `0x949D SAVE #2,[0xC04B]`; `0x94A3 SAVE #7,[0xC04C]` → **(2,7)** | **60** cells |
> | offset 5835, vaddr `0x96C9` | `0x96BD SAVE #15,[0xC04B]`; `0x96C3 SAVE #0,[0xC04C]` → **(15,0)** | **57** cells |
>
> The three components are **pairwise disjoint** (measured: no cell is shared by any two, and
> neither (2,7) nor (15,0) can reach (2,11), (1,11) or (0,9)). So "the entry pose is (15,10)" is a
> **selection among three retail arms**, not the block's only entry, and everything this leg proves
> — the 20-step route, the articulation points, the forced encounters — holds **for the (15,10) arm
> only**. The other two arms drop the party into two other, unwalked, unreachable-from-here parts of
> the same map. Test C now asserts all three arms and their disjointness so the selection cannot be
> read as uniqueness.

The `0x92B4` arm's three instructions are the tail of Longsaddle's descriptor-125 arm, i.e. the
aftermath of a real cell event, not a debug hook. The narration immediately preceding them, at
`0x91A9` and `0x9236`:

> `YOU TURN TO LEAVE THE TINY ROOM, BUT THE DOOR REFUSES TO YIELD. THE FLOOR DROPS AWAY, AND YOU ARE
> PROPELLED DOWN A DARK AND MUSTY CHUTE. YOU FALL A VERY LONG WAY, AND ARE FINALLY`
> `DEPOSITED IN A CACOPHANY OF CLANKING METAL ON THE FLOOR OF A BEAUTIFULLY DECORATED ROOM. THE
> OPENING FROM WHENCE YOU CAME IS NOWHERE TO BE SEEN.`

Corroboration that this is a unique, located map event: `GEO1#16` contains **exactly one**
descriptor-125 cell, at (9,12) (test C). The Longsaddle fight in that same arm is `DRIDER`×4 +
`REMORHAZ`×1 (`MONCHA.DAX` ids 43 and 93, test E2).

**Entry facing is never written by either block.** It is inherited from whatever the party faced in
Longsaddle. Rather than assume a value, test F proves facing is a non-dependency: the forced
encounter fires identically for all four cardinal facings.

---

## 4. The per-cell dispatcher, and the GEO map

`searchLocation` @`0x811C`:

```
0x811C  SAVE      [0x4C02] [0x4C01]
0x8123  AND       #127 [0xC04F] [0x4C02]     ; descriptor, masked
0x812C  COMPARE   [0x0064] #0 ; IF_EQ GOTO 0x8172
...
0x8172  GOSUB     [0x8018]
0x8176  COMPARE   [0x4C02] #0 ; IF_GT GOTO 0x8190
0x8181  ON_GOTO   [0x4C02] #3 [0x8475] [0x86AC] [0x86CA]   ; only index 0 is reachable here
0x8190  COMPARE   [0x4C02] #93 ; IF_GT GOTO 0x81A1
0x819B  SAVE      #93 [0x4C02]                ; clamp: every 1..93 collapses to 93
0x81A1  SUBTRACT  #93 [0x4C02] [0x7F79]       ; index = descriptor - 93
0x81AA  COMPARE   [0x0064] #0 ; IF_NE GOTO 0x8227
0x81B6  ON_GOSUB  [0x7F79] #35 <35 gate addresses>
0x8225  IF_EQ ; 0x8226 EXIT                   ; gate returned "equal" -> suppressed
0x8227  SAVE #0 [0x4C03] ; SAVE #1 [0x7EE6] ; CLEARMONSTERS ; SAVE #99 [0x7EC6]
0x823A  ON_GOTO   [0x7F79] #35 <35 arm addresses>
```

So the model is:

- descriptor `0` → the plain-floor arm `0x8475` (§7);
- descriptors `1..93` → clamped to 93 → index **0** → gate `0x839D` (`COMPARE #0,#0` ⇒ equal) →
  `EXIT` at `0x8226`. Silent. (The route's one descriptor-2 cell at (13,11) takes this path.)
- descriptors `94..127` → index **1..34** → gate table entry, then arm table entry.

`SUBTRACT #93 [0x4C02] [0x7F79]` computes `[0x4C02] - 93` (the VM's `SUBTRACT` is `op2 - op1`,
`packages/engine/src/ecl/vm.ts` case 0x05).

**The mask is load-bearing (test I).** Reading the descriptor with `&0x3F` instead of `&0x7F` maps
102→38 and 103→39, both of which clamp to 93, resolve to index 0, take gate-table entry 0
(`0x839D COMPARE #0,#0` ⇒ equal) and hit the **`0x8226` `EXIT`** — the entire encounter half of the
block vanishes. Test I asserts the correct-mask control fights and the counterfactual does not.

> **Corrected 2026-08-05:** this paragraph and test I's inline comment both previously named
> `0x84D5` as the `EXIT` reached by the counterfactual. `0x84D5` is the `EXIT` inside the
> *descriptor-0 plain-floor* arm (§8) and is not on this path at all; the clamp path exits at
> `0x8226`, three lines above in the listing at the top of this section. Doc and golden are now
> consistent at the measured value.

**`GEO1#17` ground truth (test D).** 1026 bytes; header word 1024. Every one of the 256 descriptor
bytes at `raw[514..769]` carries the `0x80` bit, which is exactly why the script's own `AND #127`
exists. Masked, descriptors 94..127 occur **exactly once each — 34 special cells, in 1:1
correspondence with the 34 non-generic table indices**:

| desc | cell | desc | cell | desc | cell | desc | cell |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 94 | (12,14) | 103 | (1,11) | 112 | (9,5) | 121 | (4,5) |
| 95 | (9,14) | 104 | (12,9) | 113 | (12,4) | 122 | (3,3) |
| 96 | (6,14) | 105 | (11,9) | 114 | (11,4) | 123 | (2,3) |
| 97 | (3,14) | 106 | (6,9) | 115 | (13,2) | 124 | (5,1) |
| 98 | (0,14) | 107 | (3,9) | 116 | (11,1) | 125 | (4,1) |
| 99 | (5,11) | 108 | (0,9) | 117 | (7,0) | 126 | (4,0) |
| 100 | (4,13) | 109 | (15,6) | 118 | (8,5) | 127 | (3,0) |
| 101 | (1,12) | 110 | (13,7) | 119 | (7,5) | | |
| 102 | (2,11) | 111 | (9,7) | 120 | (4,6) | | |

The raw descriptor plane is also cross-checked cell-by-cell against the engine's own
`decodeGeoBlock`.

---

## 5. The walked route, and the articulation-point proof

**Passability is strict.** An edge is walkable only when its wall slot is 0 (open) *or* its door
flag is 1 (automatic). Door flags 2 (bash/pick) and 3 (knock) are excluded — they are not
unconditional steps, so a route needing one is not a walked route. Wall planes are `raw[2:258]`
(north hi-nibble / east lo-nibble) and `raw[258:514]` (south / west); door flags are `raw[770:1026]`
(N bits 0-1, E 2-3, S 4-5, W 6-7). This is the decode `tools/find_geo_path.py` uses.

**The 20 directed steps** from the byte-grounded entry pose (15,10), with the descriptor of each
cell entered:

```
 (15,10) --S-> (15,11) 0   --W-> (14,11) 0   --W(door1)-> (13,11) 2   --W-> (12,11) 0
        --W->  (11,11) 0   --W-> (10,11) 0   --W->        ( 9,11) 0   --W-> ( 8,11) 0
        --W->  ( 7,11) 0   --W-> ( 6,11) 0   --N->        ( 6,10) 0   --W(door1)-> ( 5,10) 0
        --W->  ( 4,10) 0   --W-> ( 3,10) 0   --S->        ( 3,11) 0   --W(door1)-> ( 2,11) 102
        --W->  ( 1,11) 103 --N-> ( 1,10) 0   --W->        ( 0,10) 0   --N(door1)-> ( 0,9)  108
```

Test E asserts every step's direction matches the recorded facing, every edge is passable, no edge
uses flag 2 or 3, and that the only four door edges on the route are exactly
`(14,11)->west`, `(5,10)->west`, `(2,11)->west`, `(0,10)->north`, all `[wall 1, flag 1]`.

**Component and cut vertices.**

| BFS from (15,10) | reachable cells | (1,11) reachable? | (0,9) reachable? |
| --- | --- | --- | --- |
| whole map | **72** | yes | yes |
| minus (2,11) [desc 102] | **61** | **no** | **no** |
| minus (1,11) [desc 103] | **62** | — | **no** |
| minus (9,11) — negative control | 70 | yes | **yes** (only its alcove (9,10) is stranded) |
| minus (15,13) — negative control | 71 | yes | **yes** |

So (2,11) and (1,11) are genuine articulation points guarding the descriptor-108 chamber at (0,9),
and the negative controls show the test discriminates: deleting an arbitrary corridor cell does not
strand (0,9).

> **Scope disclosure added 2026-08-05 (the "72" needs its denominator).** 72 is **72 of the map's
> 256 cells — 28 %**. `GEO1#17` is a fragmented map: the two *other* `NEWECL #17` entry poses (§3)
> sit in separate components of **60** and **57** cells, and all three components are pairwise
> disjoint. Of the 34 special cells enumerated in §4, only **6 lie inside the entry component**
> (descriptors 98, 100, 101, 102, 103, 108); the other 28 are in parts of the map this route cannot
> reach at all. Nothing in §5/§6 is affected — the articulation-point argument is a statement about
> the (15,10) component — but "72 reachable cells" read as "most of the map" would be wrong, so the
> denominators are now stated and asserted in golden test C.

---

## 6. The hour gate: exactly one forced fight, at every hour

The gate table at `0x81B6` sends index 9 (desc 102) to `0x8345` and indices 10 and 15 (desc 103,
desc 108) to `0x835F`. `[0x4BC9]` is the ECL-owned hour (`AREA_HOUR_ADDR` in
`apps/web/src/ui/demoGen1.ts`).

```
0x8345  COMPARE [0x4BC9] #18 ; IF_GE GOTO 0x8379      ; night -> consider firing
0x8350  COMPARE [0x4BC9] #6  ; IF_LT GOTO 0x8379      ; night -> consider firing
0x835B  GOTO 0x8394                                    ; day  -> clear slot, suppress

0x835F  COMPARE [0x4BC9] #18 ; IF_GE GOTO 0x8394      ; night -> clear slot, suppress
0x836A  COMPARE [0x4BC9] #6  ; IF_LT GOTO 0x8394      ; night -> clear slot, suppress
0x8375  GOTO 0x8379                                    ; day  -> consider firing

0x8379  GETTABLE   [0x2AF8] [0x7F79] [0x7F7A]
0x8383  COMPARE    [0x7F7A] #1 ; IF_EQ GOTO 0x839D    ; already consumed -> suppress
0x838E  COMPARE    #0 #1 ; RETURN                     ; "not equal" -> the arm fires
0x8394  SAVE_TABLE #0 [0x2AF8] [0x7F79]               ; clear the slot
0x839D  COMPARE    #0 #0 ; RETURN                     ; "equal" -> EXIT at 0x8226
```

`0x8345` and `0x835F` are **exact complements**: `0x8345` arms on hours 18..23 and 0..5,
`0x835F` arms on hours 6..17. Test G drives all 24 hours through the real VM and asserts
`armed(102) == !day`, `armed(103) == day`, `armed(108) == day`, and that on the articulation-point
pair `{(2,11), (1,11)}` **exactly one is armed at every single hour**.

**The conclusion, stated conditionally (corrected 2026-08-05).** Any route from the (15,10) entry
pose that reaches the descriptor-108 chamber at (0,9) must pass through *both* (2,11) and (1,11)
(§5), and one of those two is armed at every hour — so **that** route cannot avoid a fight, at any
time of day. The earlier phrasing here ("a party crossing this map therefore cannot avoid a fight,
at any time of day, by any route") claimed more than the articulation-point proof supports: a party
that stays in the rest of the 72-cell component and never goes to (0,9) is not forced into any of
the three encounters, because (2,11)/(1,11) are cut vertices *for (0,9)*, not for the component.

**Persistence** uses the same mechanism as the already-proven `early` leg (whose consumed word is
`0x2AFA` = base + index 2): base `0x2AF8`, index `[0x7F79]` = descriptor − 93. The
`SAVE_TABLE #1,[0x2AF8],[0x7F79]` that consumes a slot is at `0x83EF` — *after* `COMBAT` at
`0x83C9`, not before. Tests F and G assert the slot is still 0 at the moment combat is offered and
becomes 1 only after `afterCombat('victory')`; that revisiting a consumed cell on the same memory is
silent; and that a fresh memory re-fires it (negative control).

Two further behaviours, both asserted:

- A gate that suppresses via `0x8394` **clears** the slot rather than setting it. Consequence: after
  a full day walk that consumes 103 and 108, moving the clock to night leaves 102 still armed
  (test G's final assertions).
- Across the whole night walk exactly one of the 35 table slots ends set (index 9); across the day
  walk exactly two (indices 10 and 15). Nothing else in the table is touched.

---

## 7. Rosters, and the shared combat epilogue

| desc | index | arm | contents |
| --- | --- | --- | --- |
| 102 | 9 | `0x8F04` | `PICTURE #84`; `LOAD_MONSTER #34 #5 #34` (DISPLACER BEAST ×5); `LOAD_MONSTER #98 #2 #98` (UMBER HULK ×2) |
| 103 | 10 | `0x8F19` | `PICTURE #84`; DISPLACER BEAST ×5; `LOAD_MONSTER #92 #4 #92` (PYRO SNAKE ×4) |
| 108 | 15 | `0x95E0` | `PICTURE #85`; `LOAD_MONSTER #35 #5 #35` (HELL HOUND ×5); `LOAD_MONSTER #95 #2 #95` (SALAMANDER ×2) |

All three `GOTO [0x83B2]`, the shared epilogue:

```
0x83B2  TREASURE #0 ×7 #227
0x83C3  SAVE #2 [0x7ECB]
0x83C9  COMBAT
0x83CA  SAVE #0 [0x4C00]
0x83D0  COMPARE [0x7EC7] #128 ; IF_EQ GOTO 0x83A3   ; bounce back to Longsaddle
0x83DB  COMPARE [0x7EC7] #129 ; IF_EQ GOTO 0x8402   ; early return
0x83E6  SUBTRACT #93 [0x4C02] [0x7F79]
0x83EF  SAVE_TABLE #1 [0x2AF8] [0x7F79]
0x83F8  SAVE [0x4C03] [0x7F79]
0x83FF  PROGRAM #16
```

Descriptor 104 at (12,9) is arm index 11, `0x8F2E` — the beholder map room, and the long Manshoon
scrying sequence that runs from `0x8F2E` up to the next arm at `0x95A1` (the strings quoted in §1 at
`0x8F2F`, `0x903B`, `0x90B1`, `0x9210`, `0x9434` all live inside it). It is not on this route; it is
noted only to place the walked corridor inside the wider area.

---

## 8. Disclosure: the descriptor-0 arm rolls live RNG

The plain-floor arm is not inert. `0x8475`:

```
0x8475  COMPARE [0x4C00] #6 ; IF_GT GOTO 0x849A     ; only after 7 plain steps
0x8480  ADD [0x4C00] #1 [0x4C00] ; (twice if [0x7ECA]==1) ; EXIT
0x849A  SAVE #20 [0x7F7C]  (50 if [0x7ECA]==1)
0x84AD  RANDOM #100 [0x7F7B]
0x84B3  COMPARE [0x7F7B] [0x7F7C] ; IF_GT GOTO 0x84D6      ; print
0x84BF  COMPARE [0xC04B] #0  ; IF_EQ GOTO 0x84D6           ; or at the map's west edge
0x84CA  COMPARE [0xC04B] #15 ; IF_EQ GOTO 0x84D6           ; or the east edge
0x84D5  EXIT
0x84D6  COMPARE [0x7B00] #5 ; IF_GT EXIT                   ; hard cap: six lines, ever
0x84DE  ADD #1 [0x7B00] [0x7B00]
0x84E7  ON_GOTO [0x7B00] #7 [0x8502] [0x8502] [0x8532] [0x8563] [0x8582] [0x85A2] [0x85C1]
```

The six lines, in retail order:

1. `THE DARK CHILL OF OLD EVIL MAGIC PASSES THROUGH YOUR BODY.`
2. `THIS PLACE LOOKS NORMAL BUT FEELS COLD. WHAT HAPPENED HERE?`
3. `YOU SMELL FIRE FAR IN THE DISTANCE.`
4. `THIS IS NOT A GOOD PLACE TO BE ALONE.`
5. `YOU FEEL LIKE YOU'RE BEING WATCHED.`
6. `SO MANY MONSTERS! WHERE DO THEY COME FROM?`

Test H drains this arm at five different seeds (`0x1234`, 1, 7, 2003, `0xbeef`) and asserts that a
plain cell **never** produces a combat, that the counter `[0x7B00]` never exceeds 6, and that the
roll actually lands in 0..99 at `[0x7F7B]`. So the RNG here is real and disclosed, but it is bounded
to flavour text and cannot manufacture or hide an encounter. The flavour lines the route emits at
the documented seed are an RNG outcome, not a structural guarantee; the forced fights are not.

> **Harness-property disclosure added 2026-08-05.** Test H's `drain(seed)` builds a **fresh runner
> per iteration with the same seed**, so its twelve iterations all draw the *same* first PRNG value
> — they are one roll repeated twelve times, not twelve independent rolls, and the same is true
> across the five seeds (five distinct first values, not sixty). "Never produces a combat" was
> therefore, as originally written, a property of five sampled PRNG streams and not of the script.
> It is now established **structurally instead**: disassembling the whole descriptor-0 arm from
> `0x8475` to the next arm at `0x85E4` finds **zero `COMBAT` (0x24) instructions and zero
> `LOAD_MONSTER`/`SETUP_MONSTER` (0x0B/0x0C)**, so no seed *can* produce a fight from a plain cell.
> Golden test H now asserts that, and labels the drain loop for what it is.

---

## 9. What this leg does **not** establish

1. **The spawn pose is not derived from block 17's own `initial_entry`.** Block 17 writes a pose
   only on the bounce path. The (15,10) pose is byte-grounded in the *predecessor*, `ECL1#16`
   @`0x92A8`/`0x92AE`/`0x92B4`. This is a real deviation from the ideal leg shape, recorded rather
   than papered over. What is proven is that block 17 boots from predecessor 16 without touching
   X/Y (test B), so the pose the predecessor writes is the pose the party has.
2. **Entry facing is unknown** (inherited from Longsaddle). Turned into a proven non-dependency by
   test F rather than assumed.
3. **`[0x7EC7]`, the retail combat-result word, is not modelled by this engine.** It stays 0, which
   takes the "party won and stayed" fall-through at `0x83D0`/`0x83DB`. The 128 (bounce to
   Longsaddle) and 129 (early return) branches are never exercised here. **INFERENCE:** those are
   the flee/defeat outcomes; nothing in this leg tests that reading.
4. **"Mid-campaign" is an inference** (§2), not a proven story position.
5. **No native execution.** Every claim is static bytes plus this repo's own `EclVm`. Nothing here
   was checked against DOSBox-X or real hardware, and no such check is claimed.
6. **The `NEWECL` exclusivity claim is a byte-occurrence claim** with the two limitations spelled
   out at the end of §2 (computed operands missed; false positives possible).
7. **Dead code found, and left as a finding rather than smoothed over.** `ON_GOTO` indices 1 and 2
   at `0x8181` (`0x86AC`, `0x86CA`) are unreachable. Only descriptor 0 reaches that instruction —
   `COMPARE [0x4C02] #0 ; IF_GT GOTO 0x8190` diverts every descriptor ≥ 1 to the clamp — and a raw
   xref of block 17 for the little-endian words `AC 86` and `CA 86` finds exactly one occurrence of
   each, both inside that same `ON_GOTO`'s target list (offsets 397 and 400). So nothing else jumps
   there. Consequence: the descriptor-2 cells are silent in retail, and the
   `A VAST TEMPLE STRETCHES AWAY TO THE WEST...` string at `0x86CB` never prints from cell dispatch.
   **Corrected 2026-08-05:** `GEO1#17` has **two** descriptor-2 cells, `(13,11)` *and* `(13,12)` —
   the doc and the golden both said "the descriptor-2 cell at (13,11)", singular. It also has a
   descriptor-**1** cell at `(12,1)`, so arm index 1 (`0x86AC`) is dead code with a real cell behind
   it too, not merely an unused table slot. All three cells are now asserted silent in test L.
   The engine reproduces the silence (tests D and F). **INFERENCE:** this looks like a shipped
   authoring bug in the retail script; this leg does not prove intent, only unreachability.
   The `IF_GT` direction it turns on is not assumed — it is corroborated by test G, where the
   same flag semantics at `0x8345`/`0x835F` predict the correct arming hour for all 24 hours.

---

## 10. Reproduce

```powershell
pnpm --filter @goldbox/engine test -- nwnMiddleRoute
```

**Note (corrected 2026-08-05):** `pnpm --filter @goldbox/engine test -- nwnMiddleRoute` runs the
**whole** engine suite — pnpm consumes the `--`, so the name is never applied as a vitest filter.
To run this file, and only this file:

```powershell
cd packages/engine; npx vitest run test/nwnMiddleRoute.test.ts
```

Result at the time of writing: **13 tests, 13 passed**, against the real retail files at
`{external-game-holdings}/Neverwinter Nights DOS/neverwinter-nights/neverwint/`. The suite is guarded by
`describe.skipIf(!haveRetail)`; if it reports 0 tests, the retail data was not found and nothing was
verified.
