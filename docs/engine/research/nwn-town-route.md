# Neverwinter Nights (DOS/AOL) — TOWN leg: the city of Neverwinter, `ECL0.DAX#1` / `GEO0.DAX#1` (2026-08-05)

Companion golden: `packages/engine/test/nwnTownRoute.test.ts` (**14 tests**, all reading the retail
files, all guarded with `describe.skipIf` on the retail root only). 14/14 pass.

**Result: the `town` leg is `proven`.** Neverwinter city is a real, walkable, GEO-backed settlement
whose ECL block dispatches the retail engine's own shop, temple and training-hall host routines
through three named Area2 host flags, sells goods against a byte-verified price table, and labels
every door with a matching street sign on an adjacent cell.

> **Revision note (2026-08-05).** The first version of this document and its golden were **wrong in
> two places**, and the golden failed against the retail bytes on both. Both errors were
> *under-counts*, both are corrected here at their true values, and neither changes the verdict:
> 1. It claimed `ECL0.DAX#1` was the only block in the game carrying shop+temple+training. In fact
>    `ECL2.DAX#25` — **Nightsedge**, a second town — carries the same cluster (§6a-i).
> 2. It described one shopping district in Neverwinter. There are **two** (§6c).
>
> Both corrections make the underlying argument stronger, not weaker; §6a-i explains why. They are
> recorded rather than silently overwritten because the failure mode they illustrate — a scan that
> under-reports and a doc that then over-claims uniqueness — is one this corpus invites (§6a-ii).

**The honest headline, stated up front:** NWN's city is *mechanically* an ordinary stepped-grid
map. It is not a distinct engine mode. NWN's ECL corpus never writes `Area1.inDungeon` (`[0x4BE6]`)
even once (§6), so the dungeon/wilderness mode split this project uses everywhere else is simply
not available as a town discriminator here. What makes `ECL0.DAX#1` a town is not a mode flag —
it is that the block drives the three retail *town-service* host routines (`CityShop()`,
`temple_shop()`, `startGameMenu()`-with-training) that no dungeon map in the corpus drives as a
cluster, on a map whose geometry is a street grid with signposted shopfronts. §7 states exactly how
far that argument goes and where it stops.

If the question is "is Neverwinter mechanically just another dungeon-mode map with shops on it?",
the answer is **yes** — and this document says so plainly rather than dressing it up. The town
argument is not that the engine has a Town mode (it does not, for NWN); it is that the *content*
of this map is a settlement, evidenced by which host routines its cells dispatch and by a corpus
census in which that dispatch pattern lands on four named towns and zero dungeons.

Everything below is either raw retail bytes, output of `tools/find_geo_path.py`, or behaviour
observed by executing the real block through the engine's own `EclVm`. Where something is an
inference it says so. No emulator, DOSBox-X, or native trace was used at any point in this round.

---

## 0. Files, dialect, addressing

| | |
|---|---|
| Script | `ECL0.DAX` block **1**, 4808 bytes |
| Map | `GEO0.DAX` block **1**, 1026 bytes (16x16) |
| Shop stock | `ITEM.DAX` blocks **1**, **5**, **6** |
| Portraits | `PIC.DAX` blocks **4**, **5**, **7**, **8**, **9**, **10** |
| Retail root | `{external-game-holdings}/Neverwinter Nights DOS/neverwinter-nights/neverwint` (resolve with `goldbox_corpus.NWN_ROOT`) |
| Dialect | `ECL_GEN1` — the plain **long**-frame Gen1 table, no `wordSetOverrides`. NWN is not one of the four short-frame titles (Gateway/Treasures/Pools of Darkness/DoK). |
| Addressing | vbase `0x7FFE`; `file_offset = vaddr - 0x8000 + 2` |

Header of `ECL0.DAX#1`, in the Gen1 order (magic, `vm_run_1`, `search_location`, `pre_camp_check`,
`camp_interrupted`, `initial_entry`):

```
magic           0x1388
vm_run_1        0x82FC
search_location 0x81E1
pre_camp_check  0x839A
camp_interrupted 0x83C5
initial_entry   0x8014
```

NWN ships `ECL0..ECL3`, `ECL5`, `ECL7` (33 blocks) and `GEO0..GEO3` (29 blocks). There is no
`WILDCOM.DAX` — that is why the `wilderness` leg is already closed as `structurally-absent`.

---

## 1. The discriminator, and why it is sound

The prompt for this leg is explicit that the usual binary-provable signal is unavailable: NWN's
whole-corpus count of `SAVE <n>, 0x4BE6` sites is zero. So a different discriminator was needed.
The one chosen is **the retail engine's own town-service dispatch**, and it is byte-grounded on
both sides — the ECL side (NWN's real bytes) and the host side (the CoAB source oracle).

### 1a. The host-address model (Area2, memType 1)

From the CoAB decompile, `coab_extracted/engine/ovr008.cs`:

```csharp
internal static int vm_GetMemoryValueType(ushort arg_0)   // sub_30723
{ ... if (arg_0 >= 0x7C00 && arg_0 <= 0x7FFF) var_1 = 1; ... }

internal static void vm_SetMemoryValue(ushort value, ushort location)  // cmd_table01, the ECL
{                                                                      // SAVE (0x09) handler
    ...
    else if (memType == 1)
    {
        gbl.area2_ptr.field_800_Set((location * 2) + 0x800, value);
        alter_character(value, location);
    }
}
```

So for an ECL `SAVE` whose destination is in `0x7C00..0x7FFF`:

> **Area2 struct offset = `(location * 2 + 0x800) & 0xFFFF`**
> equivalently **`location = ((offset - 0x800) & 0xFFFF) / 2`**

Applying that to the named fields in `coab_extracted/Classes/Area2.cs`:

| Area2 field | struct offset | ECL host location | retail consumer |
|---|---|---|---|
| `training_class_mask` | `0x550` (`Area2.cs:39,165,204`) | **`0x7EA8`** | `ovr018.cs:86` gates the TRAIN menu item on `training_class_mask > 0` |
| `EnterTemple` | `0x5C4` (`Area2.cs:65,235`) | **`0x7EE2`** | `ovr003.cs:984-987` `CMD_Combat` → `ovr005.temple_shop()` |
| `game_area` | `0x624` (`Area2.cs:389-391`) | **`0x7F12`** | `seg042.set_game_area()` |
| `field_6DA` (shop price scale) | `0x6DA` (`Area2.cs:81,253`) | **`0x7F6D`** | `ovr007.cs:43-81` `ItemsValue()` shifts the item's list price by this |
| `EnterShop` | `0x6D8` (`Area2.cs:79,250`) | **`0x7F6C`** | `ovr003.cs:980-983` `CMD_Combat` → `ovr007.CityShop()` |

**The address model is not taken on faith — `game_area` is the control.** `0x7F12 = game_area` is
already established independently in this repo (it is in the standing key-engine-facts list, and
`ovr008.cs`'s `alter_character` `switch_var == 0x312` arm resolves through the same arithmetic:
`0x7F12*2 + 0x800 = 0x10624`, `& 0xFFFF = 0x624`). The formula that produces the known-good
`0x7F12` is the same formula that produces `0x7F6C`/`0x7EE2`/`0x7EA8`, and a raw byte census finds
9 `SAVE #1, [0x7F12]` sites in NWN's own archives (§6), i.e. **the address is a live `SAVE`
destination in NWN**.

> **Downgraded 2026-08-05.** This sentence used to end *"— so the model demonstrably resolves on NWN
> bytes, not just CoAB bytes,"* and was presented as a control that validates the CoAB→NWN address
> model. It is weaker than that. **Every one of the 9 sites writes the constant `1`** (re-measured;
> golden test **F** asserts `sites.gameArea.every(s => s.value === 1)`), which is the *opposite* of
> what a per-area `game_area` field would predict — a real area-number field would take different
> values in different areas. So the census shows only that `0x7F12` **is used** as a `SAVE`
> destination in NWN; it does **not** corroborate that the field carries an area number in NWN, and
> nothing here should be read as confirming the *meaning* of the address, only its use. The address
> model itself remains inherited from the CoAB oracle (§7).

### 1b. The dispatch itself

`coab_extracted/engine/ovr003.cs` `CMD_Combat()` (`sub_277E4`), the retail handler for ECL opcode
`0x24`:

```csharp
internal static void CMD_Combat() // sub_277E4
{
    gbl.ecl_offset++;
    if (gbl.monstersLoaded == false && gbl.combat_type == CombatType.normal)
    {
        if (gbl.area2_ptr.EnterShop == 1)   { gbl.area2_ptr.EnterShop  = 0; ovr007.CityShop();     }
        else if (gbl.area2_ptr.EnterTemple == 1) { gbl.area2_ptr.EnterTemple = 0; ovr005.temple_shop(); }
        else                                { ovr006.AfterCombatExpAndTreasure(); }
    }
    else { ... ovr009.MainCombatLoop(); ... }
}
```

That is the whole mechanism. **`CLEARMONSTERS` + `SAVE #1 -> [0x7F6C]` + `COMBAT` is not a fight —
it is the retail engine's "open the shop" call**, and `CLEARMONSTERS` + `SAVE #1 -> [0x7EE2]` +
`COMBAT` is "open the temple". `CityShop()` (`ovr007.cs:154`) is the familiar
`Buy View Pool Appraise Exit` storefront; `temple_shop()` is the healing/donation counter.

The training hall is the third idiom: `SAVE #127 -> [0x7EA8]` (enable every class), `PROGRAM #0`
(`ovr003.cs CMD_Program` `var_1 == 0` → `ovr018.startGameMenu()`, whose TRAIN item is gated on
`training_class_mask > 0`), then `SAVE #0 -> [0x7EA8]` to shut training off again on the way out.

**Why this discriminator is sound:** it is the engine's own, named, single-purpose entry point to
the three services that define a Gold Box town. It cannot be produced accidentally by a dungeon
script, it is not a heuristic over narration text, and it is not a wall-openness or tile-bank
guess. It is also the project's *existing* discriminator, applied consistently — see the control
in §6b: Gateway's `ECL5.DAX#19` (Sundabar), whose `town` leg is already `proven` in the matrix,
writes all three of the same flags.

**Where it is weaker than `inDungeon`:** a lone `EnterShop` write does *not* make a map a town.
**Nine** other NWN blocks carry a merchant on an otherwise dungeon-flavoured map — six with a
single `EnterShop` site, three (`ECL0#5`, `ECL1#10`, `ECL1#16`) with two (§6a). The
claim for `ECL0.DAX#1` rests on the whole cluster — 3 shops + a temple + a training hall + inn
signs + the city's own name, on one 16x16 street grid — not on any single write.

> **Correction (2026-08-05).** This paragraph read *"Six other NWN blocks contain exactly one
> merchant…"*, which was internally inconsistent with §7's "Nine NWN blocks … carry a merchant with
> no temple and no training hall" and was not what §6a says either. Re-measured on the retail bytes:
> **9** blocks carry `EnterShop` with neither `EnterTemple` nor a non-zero training mask —
> `ECL0#3` (1), `ECL0#4` (1), `ECL0#5` (**2**), `ECL0#6` (1), `ECL0#8` (1), `ECL0#9` (1),
> `ECL1#10` (**2**), `ECL1#16` (**2**), `ECL3#30` (1). Six have a single merchant site, three have
> two. §7's count was the right one; this one was not.

---

## 2. `ECL0.DAX#1` is the city of Neverwinter (cold-boot entry)

`initial_entry` at `0x8014` fans out on `[0x4BF2]` (`LastEclBlockId`) to pick a re-entry spawn per
originating block. With `[0x4BF2]` unset (a cold boot) every compare falls through to the default
arm at `0x8138`:

```
0x8138  SAVE #8, [0xC04B]        ; x = 8
0x813E  SAVE #8, [0x4BF0]
0x8144  SAVE #7, [0xC04C]        ; y = 7
0x814A  SAVE #7, [0x4BF1]
0x8150  SAVE #3, [0xC04D]        ; facing = 3 (west)
0x8156  PROGRAM #4
0x8159  CALL [0x2E10]
0x815D  PRINTCLEAR "WELCOME TO NEVERWINTER! YOU STAND BEFORE THE PALACE OF LORD NASHER, WHO
                    GOVERNS THE CITY AND OFTEN HAS IMPORTANT MISSIONS FOR ADVENTURERS."
0x81C8  GOSUB [0x885A]           ; "PRESS ENTER TO CONTINUE."
```

Earlier in the same entry, `0x805B LOAD_FILES #1,#2,#255` (self-referencing → `GEO0.DAX#1`) and
`0x8062 LOAD_PIECES #25,#15,#14`. Running the real `EclVm` from byte 22 with an empty memory map
reproduces exactly this: `loadFiles {geoBlockId:1, operands:[1,2,255]}`,
`loadPieces {setBlockIds:[25,15,14]}`, that narration, and `[0xC04B]=8 [0xC04C]=7 [0xC04D]=3`.

This matches `docs/engine/research/neverwinter-nights-dos-eclinit.md` §4, which reached the same
block by an independent bootability sweep, and the native `GBBOOT` cross-check in
`neverwinter-nights-dos-combat-flow.md`.

## 3. The two dispatch tables — "enter a door" vs "read a sign"

`search_location` is at `0x81E1`. Its fork is the load-bearing structural fact of this map:

```
0x81E1  SAVE [0x4C02], [0x4C01]          ; remember the previous masked descriptor
0x81E8  AND #127, [0xC04F], [0x4C02]     ; mask this cell's descriptor
0x81F1  COMPARE [0xC04F], #129           ; RAW byte, not the masked value
0x81F7  IF_LT
0x81F8  GOTO [0x827C]                    ; -> SIGN table
0x81FC  COMPARE [0x4C02], #37
0x8202  IF_GT
0x8203  EXIT
0x8204  ON_GOTO [0x4C02], #38, <38 targets>   ; ENTER table
```

Bytes: `0x81F1` = `03 01 4f c0 00 81`, `0x81F7` = `18`, `0x81F8` = `01 01 7c 82`, and both
`ON_GOTO`s open with `25 01 02 4c 00 26` (opcode `0x25`, selector `[0x4C02]`, count `38`).

So **the high bit of the GEO descriptor byte selects the table**: `0x80|n` (≥ 129) is a *doorway*
and runs the interactive ENTER arm; a plain `n` is a *street tile* and runs the flavour/SIGN arm.
This is why the same descriptor id can mean two different things on this map — a cell only ever
uses one of the two tables.

ENTER-table arm targets (raw bytes at file offset `524 + 3*i`):

| arm(s) | target | what it is |
|---|---|---|
| 0, 14 | `0x8DD9` | guard/no-op |
| 1 | `0x8798` | `NEWECL #51` — chain out to `ECL5.DAX` |
| 2 | `0x8701` | repeat-cell suppressor |
| **3** | `0x869E` | **weapon shop** — `EnterShop`, `ITEM.DAX#5` |
| **4, 5, 6** | `0x8832` | **temple** — `EnterTemple` |
| **7** | `0x8404` | **general shop** — `EnterShop`, `ITEM.DAX#1` |
| **8** | `0x8462` | **silver-weapon shop** — `EnterShop`, `ITEM.DAX#6` |
| **9** | `0x84BA` | **gem/jewel merchant** — priced transaction, no `EnterShop` |
| **10–13** | `0x87A3` | **training hall** — `training_class_mask`, `PROGRAM #0` |
| 15–36 | `0x831F` | `EXIT` |
| 37 | `0x92C2` | `NEWECL #51` |

SIGN-table arm targets (file offset `652 + 3*i`) are 38 pure `PRINTCLEAR`/guard arms. The ones the
proven route crosses:

| arm | target | decoded string |
|---|---|---|
| 6, 7 | `0x8996` | `"ADVANCE LEVELS HERE"` |
| 11 | `0x89F8` | `"A SIGN ABOVE THE DOOR READS 'GENERAL ITEMS SHOP'"` |
| 12 | `0x8A20` | `"A GLEAMING SIGN ON THE WALL HERE SAYS 'SILVER SHOP'"` |
| 13 | `0x8A4B` | `"A SIGN ABOVE YOU SAYS 'JEWELRY SHOP'"` |
| 17 | `0x8AE1` | `"CARVED INTO THE STONE ARE THE WORDS: 'TEMPLE OF TYR'"` |
| 19 | `0x8B39` | `"YOU STAND BEFORE THE ENTRANCE TO LORD NASHER'S PALACE"` |
| 22 | `0x8C13` | `"A SIGN SAYS 'CRAGDYK'S ARMS & ARMOR'"` |

Other SIGN arms in the same table, quoted verbatim because they establish the settlement's
character on their own: `"A SIGN SAYS 'BRORSMAN'S ARMS & ARMOR'"`, `"A SIGN SAYS 'BAYLESS ARMS &
ARMOR'"`, `"HANGING ABOVE YOU IS A SIGN: 'KROEGEL'S ARMS & ARMOR'"`, `"THE SIGN OVERHEAD READS
'THE RED MAGE INN'"`, `"A SIGN ABOVE YOU SAYS 'MANCUSO'S INN'"`, `"A SIGN ABOVE THE DOOR SAYS
'DAGLOW'S INN'"`, `"A SIGN ABOVE YOU SAYS 'MATAGA'S INN'"`, `"ETCHED INTO THE DELICATE MARBLE, A
SIGN ABOVE THE DOOR READS: 'TEMPLE OF OGHMA'"`, `"THE WORDS CARVED ABOVE THE DOOR READ: 'TEMPLE OF
HELM'"`, `"THIS DOOR LEADS TO A PRIVATE RESIDENCE."`, `"TO THE WEST LIES THE GREAT PLAZA OF
NEVERWINTER. TEMPLES LINE EITHER SIDE, AND AT ITS CENTER IS AN ANCIENT ARBOR."`, `"A SIGN GUARDS A
DARK OPENING IN THE GROUND. 'NEVERWINTER SEWER WORKS. DO NOT ENTER.'"`, `"THE NEVERWINTER RIVER
FLOWS MAJESTICALLY PAST LORD NASHER'S PALACE TOWARDS THE SEA…"`, `"THE ANCIENT TREES THAT GROW
HERE ARE OLDER THAN NEVERWINTER ITSELF."`.

## 4. The three service arms, byte for byte

### 4a. Shops → `CityShop()`

Three arms, identical shape. General shop, arm 7:

```
0x8404  PICTURE #9
0x8407  PRINTCLEAR "'GOOD DAY. WOULD YOU LIKE "
0x841E  PRINT      "TO MAKE A PURCHASE?'"
0x8430  GOSUB [0x8878]                 ; HORIZONTAL_MENU -> "YES" / "NO"
0x8434  IF_EQ
0x8435  GOTO [0x88C7]                  ; NO -> leave
0x8439  SAVE #1,  [0x7F6C]             ; Area2.EnterShop  = 1
0x843F  SAVE #1,  [0x7FF6]             ; Area2 +0x7EC (see §8, UNLOCATED)
0x8445  SAVE #16, [0x7F6D]             ; Area2.field_6DA  = 0x10 -> ItemsValue() default: list price
0x844B  CLEARMONSTERS
0x844C  TREASURE #0,#0,#0,#0,#0,#0,#0,#1   ; stock list = ITEM.DAX block 1
0x845D  COMBAT                         ; -> CMD_Combat, monstersLoaded == false -> CityShop()
0x845E  GOTO [0x88C7]
```

Bytes: `0x8439` = `09 00 01 01 6c 7f 09 00 01 01 f6 7f`, `0x8445` = `09 00 10 01 6d 7f`,
`0x844B` = `1c 27 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01`.

The other two are byte-identical apart from picture, narration and stock block:

| arm | vaddr | picture | narration | stock |
|---|---|---|---|---|
| 3 | `0x86D8` | `PIC #8` | `"'WE HAVE AN EXCELLENT SELECTION OF WEAPONRY. INTERESTED?'"` | `ITEM.DAX#5` |
| 7 | `0x8439` | `PIC #9` | `"'GOOD DAY. WOULD YOU LIKE TO MAKE A PURCHASE?'"` | `ITEM.DAX#1` |
| 8 | `0x8491` | `PIC #10` | `"'DO YOU WISH TO PURCHASE A SILVER WEAPON?'"` | `ITEM.DAX#6` |

`ITEM.DAX#5` is 3654 bytes = **58 × 63-byte plain-ASCII records**, and its names are exactly an
AD&D arms-and-armour catalogue: `Plate Mail`, `Banded Mail`, `Splint Mail`, `Chain Mail`,
`Two-Handed Sword`, `Long Sword`, `Bastard Sword`, `Halberd`, `Morning Star`, `Battle Axe`,
`10 Arrow`, `20 Quarrel`, … — i.e. the weapon shop's own stock, matching its own narration.

### 4b. Temple → `temple_shop()`

```
0x8832  PRINTCLEAR "AN ACOLYTE GREETS YOU."
0x8846  PICTURE #5
0x8849  SAVE #1, [0x7EE2]              ; Area2.EnterTemple = 1
0x884F  CLEARMONSTERS
0x8850  COMBAT                         ; -> CMD_Combat -> temple_shop()
0x8851  GOTO [0x88C7]
```

Bytes at `0x8849`: `09 00 01 01 e2 7e 1c 24` — `SAVE #1 -> [0x7EE2]`, `CLEARMONSTERS` (`1c`),
`COMBAT` (`24`), with nothing in between. No `LOAD_MONSTER` / `SETUP_MONSTER` anywhere on the arm,
which is precisely the `monstersLoaded == false` precondition `CMD_Combat` tests.

### 4c. Training hall → `startGameMenu()` with training enabled

```
0x87A3  COMPARE [0x4C07], #1           ; once-per-visit guard
0x87A9  IF_EQ
0x87AA  GOTO [0x87E2]
0x87AE  PICTURE #7
0x87B1  PRINTCLEAR "WOULD YOU LIKE TO TRAIN?'"
0x87C7  GOSUB [0x8878]                 ; YES / NO
0x87CB  IF_EQ
0x87CC  GOTO [0x87E2]
0x87D0  SAVE #1,   [0x4C07]            ; consumed bit
0x87D6  SAVE #127, [0x7EA8]            ; training_class_mask = 0x7F -> all seven classes
0x87DC  PROGRAM #0                     ; -> ovr018.startGameMenu(): the TRAIN item is now live
0x87DF  PICTURE #7
0x87E2  SAVE #0,   [0x7EA8]            ; training off again on the way out
0x87E8  PRINTCLEAR "'YOU'RE SHOWING GREAT PROGRESS. RETURN AGAIN WHEN YOU ARE READY.' YOU EXIT THE HALL."
```

Bytes at `0x87D0`: `09 00 01 01 07 4c 09 00 7f 01 a8 7e 38 00 00 0e 00 07` — the
`SAVE #127 -> [0x7EA8]` and `PROGRAM #0` are literally adjacent, with no instruction between them.
That adjacency is the proof that the mask write exists *for* the game menu.

Every other `training_class_mask` write in NWN's entire corpus writes **0** (§6a), i.e. "no
training here". Exactly two sites in the whole game write a non-zero mask: this one, and
`ECL2.DAX#25 @0x96E7`.

### 4d. The gem/jewel merchant — a real price table and a real money debit

Arm 9 is not an `EnterShop` storefront; it is an in-script priced transaction, which is why it is
independently interesting:

```
0x84BA  PICTURE #4
0x84BD  PRINTCLEAR "'DO YOU WISH TO BUY A GEM FOR 250 GOLD OR A JEWEL FOR 2200 GOLD?'"
0x84F1  HORIZONTAL_MENU [0x7F79], #3, "GEM", "JEWEL", "EXIT"
0x8507  COMPARE [0x7F79], #2 ; IF_EQ ; GOTO 0x88C7        ; EXIT
0x8512  COMPARE [0x7F79], #0 ; IF_EQ ; GOTO 0x85A6        ; GEM
0x851D  SAVE #440, [0x7F7A]                               ; JEWEL unit price
0x8524  GOSUB [0x862D]                                    ; affordability probe
0x852D  PRINTCLEAR "'HOW MANY JEWELS WOULD YOU LIKE TO PURCHASE. YOU HAVE MONEY FOR "
0x8569  INPUT_NUMBER [0x7F79], [0x7F79]
0x857B  MULTIPLY [0x7F7A], [0x7F79], [0x7F7A]             ; total = unit * quantity
0x8585  GOSUB [0x864B]                                    ; pay
0x858F  TREASURE #0,#0,#0,#0,#0,#0,[0x7F79],#255          ; award N jewels
...
0x85A6  SAVE #50, [0x7F7A]                                ; GEM unit price
```

and the two money subroutines:

```
0x862D  PROGRAM #6
0x8630  DIVIDE   [0x7CC3], [0x7F7A], [0x7F79]   ; affordable count = money / unit price
0x864B  LOAD_CHARACTER #0
0x864E  COMPARE  [0x7CC3], [0x7F7A] ; IF_LT ; PROGRAM #6 ; ...
0x8665  SUBTRACT [0x7F7A], [0x7CC3], [0x7CC3]   ; money -= total
0x8675  PRINTCLEAR "'SORRY, YOU DON'T HAVE ENOUGH MONEY.'"
```

`[0x7CC3]` is the party currency register. Under the CoAB oracle, memType-1 reads route through
`get_player_values` and writes through `alter_character`, which subtracts `0x7C00`:
`0x7CC3 - 0x7C00 = 0xC3`, and `ovr008.cs:606` maps `switch_var == 0xC3` to
`SelectedPlayer.Money.SetCoins(Money.Platinum, …)`.

The arithmetic closes on itself, which is the point:

| choice | unit price written | × 5 gp/pp | narration says |
|---|---|---|---|
| GEM | 50 (`09 00 32 01 7a 7f`, 8-bit immediate) | 250 | `"A GEM FOR 250 GOLD"` |
| JEWEL | 440 (`09 02 b8 01 01 7a 7f`, 16-bit immediate) | 2200 | `"A JEWEL FOR 2200 GOLD"` |

*(Inference, labelled: the 5 gp = 1 pp conversion is the AD&D standard, not something read out of
NWN's own bytes. What IS read out of NWN's bytes is that the two constants are 50 and 440, that the
register they are compared and subtracted against is the platinum slot per the CoAB oracle, and
that the narration in the very same instruction stream says 250 and 2200. The ratio being exactly
5 in both cases, from two independently-authored constants, is the corroboration.)*

## 5. The proven route: a 42-step service circuit through the city

`tools/find_geo_path.py` over `GEO0.DAX#1`, chained leg by leg from the cold-boot spawn. Stated as
measured (corrected 2026-08-05): **29 of the 42 edges are wall slot 0 with door flag 0; the
remaining 13 all carry door flag 1** — the shop/temple/training doorways themselves plus two on the
temple approach. Verified explicitly, because the bucketing alone would not have shown it: **no edge
on the circuit has a non-zero wall slot with door flag 0** (a solid wall), **none has flag 2
(bash/pick/knock) or flag 3 (bash/knock)**, and every one of the 13 flag-1 edges does sit on a
non-zero wall slot. So `find_geo_path.py` reports `required_interactions: []` and every step of the
circuit is unconditional under this project's own Gen1 movement contract
(`decompile-ovr015-movement.md`: flag 1 passes automatically, flags 2/3 do not):

> **Why the wording changed.** The previous revision said "29 are plain open street and 13 are
> `door_flag 1`" and the golden bucketed with `if (wall === 0 && door === 0) openStreet++; else
> automaticDoors++;` while only asserting `door === 0 || door === 1`. That bucketing is not a
> legality check: an edge with a non-zero wall slot **and** door flag 0 — a solid wall — would have
> passed the assertion and been silently counted as an "automatic door". The conclusion happens to
> be correct on these bytes (re-measured: 0 such edges), but the assertion could not distinguish the
> two cases, so golden test **H** now asserts `door === 0 → wall === 0` directly.

```
(8,7) spawn, facing west
  -> (10,4)  TEMPLE          5 steps  N E N E N
  -> (6,4)   JEWELLER        8 steps  S S W W W N N W
  -> (6,3)   SILVER SHOP     3 steps  E N W
  -> (6,2)   GENERAL SHOP    3 steps  E N W
  -> (6,11)  TRAINING HALL  11 steps  E S S S S S S S S S W
  -> (13,6)  WEAPON SHOP    12 steps  E N N N N N E E E E E E
```

Reproduce leg 1 with:

```powershell
python tools\find_geo_path.py `
  --geo "D:\Games\Neverwinter Nights DOS\neverwinter-nights\neverwint\GEO0.DAX" `
  --block 1 --start 8,7 --target 10,4 --facing west
```

The most striking structural fact falls straight out of the walk: **every service door has its own
street sign on the cell immediately in front of it.** Running each cell of the circuit through the
real `EclVm` (`dialogueForCell`, `ECL_GEN1`, seed `0x1234`):

| cell | raw byte | desc | table | result |
|---|---|---|---|---|
| (10,5) | `0x11` | 17 | SIGN | `"CARVED INTO THE STONE ARE THE WORDS: 'TEMPLE OF TYR'"` |
| **(10,4)** | `0x85` | 5 | ENTER | `combat`, `monsters: []`, `"AN ACOLYTE GREETS YOU."`, `[0x7EE2] = 1` |
| (7,4) | `0x0D` | 13 | SIGN | `"A SIGN ABOVE YOU SAYS 'JEWELRY SHOP'"` |
| **(6,4)** | `0x89` | 9 | ENTER | `say`, choices `["GEM","JEWEL","EXIT"]`, the 250/2200 narration |
| (7,3) | `0x0C` | 12 | SIGN | `"A GLEAMING SIGN ON THE WALL HERE SAYS 'SILVER SHOP'"` |
| **(6,3)** | `0x88` | 8 | ENTER | `say`, `["YES","NO"]`, `"'DO YOU WISH TO PURCHASE A SILVER WEAPON?'"` |
| (7,2) | `0x0B` | 11 | SIGN | `"A SIGN ABOVE THE DOOR READS 'GENERAL ITEMS SHOP'"` |
| **(6,2)** | `0x87` | 7 | ENTER | `say`, `["YES","NO"]`, `"'GOOD DAY. WOULD YOU LIKE TO MAKE A PURCHASE?'"` |
| (7,7) | `0x13` | 19 | SIGN | `"YOU STAND BEFORE THE ENTRANCE TO LORD NASHER'S PALACE"` |
| (7,11) | `0x06` | 6 | SIGN | `"ADVANCE LEVELS HERE"` |
| **(6,11)** | `0x8B` | 11 | ENTER | `say`, `["YES","NO"]`, `"WOULD YOU LIKE TO TRAIN?'"` |
| (12,6) | `0x16` | 22 | SIGN | `"A SIGN SAYS 'CRAGDYK'S ARMS & ARMOR'"` |
| **(13,6)** | `0x83` | 3 | ENTER | `say`, `["YES","NO"]`, `"'WE HAVE AN EXCELLENT SELECTION OF WEAPONRY. INTERESTED?'"` |

Every other cell on the circuit is descriptor 0 and produces `{kind:'end', text:''}`.

That sign/door pairing is a cross-check, but **not a statistically independent one, and the previous
revision overstated it (corrected 2026-08-05).** The two tables share the same selector `[0x4C02]`
and the same bit-7 fork — both `ON_GOTO`s literally open with the identical bytes
`25 01 02 4c 00 26`, and `[0x4C02]` is written once, by the single `AND #127,[0xC04F],[0x4C02]` at
`0x81E8`, before the fork. So their agreement is **a consistency check on one shared index rendered
twice, not two independent indices**: a wrong mask or a wrong fork would mis-index *both* tables
together and the agreement would survive. It is still meaningful — the two tables are separate
38-entry authoring passes at different addresses whose *contents* were written independently, and a
content-level authoring slip would show up here — but it is not the independent corroboration the
previous wording claimed.

Answering `YES` at (6,2) through the real VM then produces:

```
kind: 'combat', monsters: [], treasure: { itemBlockId: 1, itemSource: 'itemBlock' }
memory: [0x7F6C] = 1   [0x7F6D] = 16   [0x7FF6] = 1
```

— a `COMBAT` with an empty roster and `EnterShop = 1`, i.e. the exact state `CMD_Combat` routes to
`CityShop()`. Answering `YES` at (6,11) reaches `PROGRAM #0` and leaves `[0x4C07] = 1`,
`[0x7EA8] = 0`, then prints the exit-the-hall line.

## 6. Whole-corpus census, and the `GEO0#1` ground truth

Both scans below cover all six ECL archives and all 33 blocks — the same 33-block inventory
`neverwinter-nights-dos-format-coverage.md` independently reports.

### 6a. NWN itself

Method: scan every decompressed block for the three literal operand bytes of each host location
(`01 <lo> <hi>`) and classify by what precedes it (`09 00 vv` = `SAVE #imm`, `09 <1|2|3> ..` =
`SAVE <word>`). This needs no BFS, no dialect and no reachability model at all, so it cannot
silently desync.

| host location | field | distinct `SAVE` sites | blocks |
|---|---|---:|---|
| `0x7F6C` | `EnterShop` | **20** | `ECL0#1,3,4,5,6,8,9`, `ECL1#10,12,16`, `ECL2#24,25`, `ECL3#30` |
| `0x7EE2` | `EnterTemple` | **4** | `ECL0#1`, `ECL1#12`, `ECL2#24`, `ECL2#25` |
| `0x7EA8` | `training_class_mask` | **33** (31 write 0, **2 write 127**) | 127 only at `ECL0#1@0x87D6` and `ECL2#25@0x96E7` |
| `0x7F12` | `game_area` (control) | **9** | proves the address model resolves on NWN bytes |
| `0x4BE6` | `Area1.inDungeon` | **0** | — |

**Sites are not blocks (disclosed 2026-08-05).** The `EnterShop` row above reads "20" and lists 13
blocks, and an earlier revision never said where the other 7 sites went, which invites reading the
column as a per-block count. The distribution is: `ECL0#1` **3**, `ECL1#12` **3**, `ECL0#5` **2**,
`ECL1#10` **2**, `ECL1#16` **2**, and one each in `ECL0#3,4,6,8,9`, `ECL2#24`, `ECL2#25`,
`ECL3#30` — 20 sites across 13 blocks. Likewise `training_class_mask` is **33 sites across 29
blocks** (`ECL0#1` and `ECL2#25` carry 3 each; every other block exactly 1). Nothing in the argument
turns on the totals — the argument is over the *block sets* — but the numbers should not be
ambiguous.

### 6a-i. Correction (2026-08-05): the cluster selects TWO blocks, and the pair selects FOUR

> An earlier revision of this document asserted here that "`ECL0.DAX#1` is the only block in the
> game that carries all three service classes at once", and its companion golden asserted
> `expect(full).toEqual(['ECL0.DAX#1'])`. **That claim was false**, and it contradicted this
> document's own table two rows above, which already listed `ECL2#25` under both `EnterTemple` and
> the second `127` training mask. The golden failed against the retail bytes on exactly this
> assertion. It has been corrected rather than quietly dropped, and the corrected result is
> *stronger* than the false one.

Re-derived this round by two independent methods that agree exactly (see §6a-ii): a naive
raw-byte needle scan, and an instruction-framed reachability walk that follows
`GOTO`/`GOSUB`/`ON_GOTO`/`ON_GOSUB` and treats Gen1 `IF_*` as a conditional **skip** of the next
instruction (`packages/engine/src/ecl/vm.ts:2014`).

| selector | blocks selected | what they are |
|---|---|---|
| `EnterShop` alone | 13 blocks | **not** a town signal — mostly lone merchants on dungeon maps |
| `EnterShop` **and** `EnterTemple` | **exactly 4**: `ECL0#1`, `ECL1#12`, `ECL2#24`, `ECL2#25` | the game's four named settlements |
| …**and** `training_class_mask = 127` | **exactly 2**: `ECL0#1`, `ECL2#25` | the two settlements with a training hall |

> **Correction (2026-08-05) — the conjunction is doing no work, and saying "cluster" overstates it.**
> Measured on the same bytes: **`EnterTemple` alone already selects exactly those four blocks**
> (there are only 4 `EnterTemple` sites in the whole corpus, one per block), and **`training_class_
> mask = 127` alone already selects exactly those two** (only 2 such writes corpus-wide, at
> `ECL0#1@0x87D6` and `ECL2#25@0x96E7`). Intersecting with `EnterShop` removes nothing. So the honest
> statement is not "only the *cluster* discriminates" but "**`EnterTemple` is the discriminator, and
> `EnterShop` and the training mask corroborate it without narrowing it.**" The rows above are
> factually correct as written; the framing around them was not, and §7's *"Only the cluster is the
> argument"* is corrected below. This weakens nothing about *which* blocks are selected — it changes
> which single write is load-bearing, and a reader should know that the leg would stand or fall with
> `0x7EE2` alone.

All four blocks name themselves, in their own retail narration, as inhabited settlements, and all
four run an innkeeper offering a priced rest (golden test **M**; vaddrs are instruction starts in
the named block):

| block | names itself | vaddr | the priced rest (corrected 2026-08-05) |
|---|---|---|---|
| `ECL0.DAX#1` | `"WELCOME TO NEVERWINTER! YOU STAND BEFORE THE PALACE OF LORD NASHER…"` | `0x815D` | `0x870D` `"…SAYS THE INNKEEPER. 'WOULD YOU LIKE TO REST FOR 1 PLATINUM?'"` |
| `ECL1.DAX#12` | `"'WELCOME TO TRIBOAR,' SAYS THE INNKEEPER…"` | `0x89AA` | **`0x89AA`** `"'WELCOME TO TRIBOAR,' SAYS THE INNKEEPER. 'WOULD YOU LIKE TO REST FOR 1 PLATINUM?'"` |
| `ECL2.DAX#24` | `"…IT IS MUCH MORE DANGEROUS THAN HERE IN FLOODBLEST…"` | `0x9135` | **`0x95EB`** `"'HELLO,' SAYS THE INNKEEPER. 'WOULD YOU LIKE TO REST FOR 1 PLATINUM?'"` |
| `ECL2.DAX#25` | `"      'WELCOME TO NIGHTSEDGE'"` | `0x936D` | `0x8AAB` `"…YOU DISCOVER THE INNKEEPER COWERING IN HIS WINE CELLAR. HE AGREES TO LET YOU STAY FOR **5** PLATINUM PIECES."` |

> **Correction (2026-08-05).** The two bolded vaddrs are new. The previous revision cited `0x8981`
> for Triboar and `0x8E03` for Floodblest under the heading "inn", and the golden asserted the same
> two. Both are real retail strings in the right blocks — `"'TRIBOAR INN AND PUBLIC HOUSE'"` and
> `"'THE RANKLED BOAR INN.'"` — but they are **street-sign flavour text, not the priced rest**, so
> they did not support the sentence they were cited for ("all four run an innkeeper offering a priced
> rest"). The claim itself survives: all four blocks *do* carry a priced innkeeper transaction, at
> the corrected vaddrs. Also corrected: Nightsedge's price is **5** platinum (`0x8B45`
> `"YOU STAY FOR THE PRICE OF 5 "` / `0x8B5D` `"PLATINUM PIECES."`), not 1 — the earlier row quoted
> only the cowering-innkeeper sentence and left the price unstated, which read as if all four were
> the same 1-platinum transaction.

`ECL2#25` (Nightsedge) additionally carries `"HANGING ABOVE YOU IS A SIGN: 'NIGHTSEDGE TRAINING'"`
(`0x969B`) and `"'TEMPLE OF HELM -- NIGHTSEDGE BRANCH'"` (`0x9658`) — i.e. it is a second town of
the same shape as Neverwinter, which is exactly why it joins `ECL0#1` in the strict cluster.

**Why this strengthens rather than weakens the leg.** The discriminator's value is that it has
**no false positives to explain away**: it selects four blocks and all four are settlements; it
selects zero dungeon blocks. The earlier "only one block" framing was both wrong and weaker,
because a discriminator that fires exactly once is indistinguishable from a coincidence. One that
fires four times and lands on four named towns is a *rule*.

**What this leg still claims** is one fully proven town: `ECL0.DAX#1` / `GEO0.DAX#1`, Neverwinter.
Triboar, Floodblest and Nightsedge are now **identified** (above) but their maps, routes and
dispatch tables were **not** walked this round, and no route through them is claimed.

### 6a-ii. The two methods, and where they disagree

The counts above were produced twice, independently, and reconciled cell by cell:

1. **Naive raw-byte needle scan** — look for the literal operand bytes `01 <lo> <hi>` and classify
   by what precedes them. No dialect, no reachability, no control-flow model, so it cannot silently
   desync. It is a *superset*: it will happily match bytes that are string payload or operand data.
2. **Instruction-framed reachability walk** — decode real instructions from the five header entry
   points, following `GOTO`/`GOSUB`/`ON_GOTO`/`ON_GOSUB`, and treating `IF_*` as a conditional skip
   so that both the taken and skipped successors stay reachable. Coverage on `ECL0#1` is 4785 of
   4808 bytes (99.5%).

   **The exact model, named (added 2026-08-05 — the "reachable" column below does not reproduce
   without it).** `reachable` = BFS from the five ECL header entries following
   `GOTO`/`GOSUB`/`RETURN`/`ON_GOTO`/`ON_GOSUB`, with `IF_*` enqueueing **both** the guarded
   instruction and the instruction after it, and **no compare-outcome narrowing at all**. Concretely,
   `tools/gen1_ecl_encounter_scan.successors()` is called with `compare_outcomes` pinned to
   `ALL_COMPARE_OUTCOMES` on every edge, and the BFS visited-state key does not include the outcome
   set.

   > **Reproducibility warning.** `tools/gen1_ecl_encounter_scan.successors()` used *as shipped* —
   > i.e. threading each `IF_*`'s narrowed `compare_outcomes` into the next call, which is what the
   > function's own signature invites — narrows the outcome set and **never re-widens it at a fresh
   > `COMPARE`**. Driven that way over the same corpus it returns **3 / 3 / 32 / 5 / 0** for the five
   > rows below instead of 20 / 4 / 33 / 8 / 0, and `ECL0#1` coverage collapses to 3002 / 4808
   > (62.5%). Anyone repeating this section with the bare `successors()` primitive will get different
   > numbers and conclude the doc is wrong. The re-widening lives in `scan_block()`
   > (`gen1_ecl_encounter_scan.py:298-308`) and in `map_gen1_area_mode_writes.scan_block_for_save`,
   > not in `successors()`. Adding that reset back reproduces the column exactly
   > (20 / 4 / 33 / 8 / 0, `ECL0#1` 4785 / 4808), so **either** the no-narrowing model **or** the
   > `scan_block` reset model gives this table; only the un-reset narrowing model does not.
   >
   > *(Measured 2026-08-05, all three models, from the retail bytes. **Not** transcribed: an earlier
   > review attributed §6b's non-credible all-zero rows to this same narrowing limitation. That does
   > **not** reproduce — §6b's scanner, `map_gen1_area_mode_writes.scan_block_for_save`, already
   > carries the `COMPARE` reset, and re-running Pool of Radiance's 8 ECL archives under the
   > **no-narrowing** model still yields 0 / 0 / 0 / 0 / 0 including the `game_area` control. See the
   > disclosure in §6b for what is actually known about those rows.)*

| target | naive | reachable | agree? |
|---|---:|---:|---|
| `0x7F6C` `EnterShop` | 20 | 20 | yes |
| `0x7EE2` `EnterTemple` | 4 | 4 | yes |
| `0x7EA8` `training_class_mask` | 33 | 33 | yes |
| `0x4BE6` `Area1.inDungeon` | **0** | **0** | yes |
| `0x7F12` `game_area` (control) | 9 | 8 | **no — see below** |

The single disagreement is instructive and is reported rather than smoothed over: the naive scan's
9th `game_area` hit, `ECL5.DAX#51 @0x90FE`, is **not reachable** from any of the five header entries.
Every one of the other 65 hits is confirmed by both methods at the same vaddr.

> **Correction (2026-08-05).** The previous revision called `0x90FE` *"a byte coincidence inside
> data/string payload that happens to spell a plausible `SAVE`."* **That is wrong.** The bytes there
> are:
>
> ```
> 09 00 01  01 12 7f      SAVE  #1 -> [0x7F12]        ; game_area = 1
> 03 01 12 7f  00 01      COMPARE [0x7F12], #1
> 17                      IF_NE
> 20 00 01                NEWECL #1
> ```
>
> That is a coherent, well-formed four-instruction sequence — set the area id, verify it, jump to
> block 1 — not a coincidence and not payload. It is **real code that no reachable path enters**:
> dead code, not garbage. It is also not covered by any *other* reachable instruction's operand
> bytes, so it is not a mid-instruction alias either.
>
> The methodological conclusion is unchanged and if anything sharper: the naive scan over-counts
> relative to the reachability walk, so the walk is what the positive claims rest on. But the *reason*
> matters. "The naive scan matches junk" would mean the naive zero for `Area1.inDungeon` is weak
> evidence; "the naive scan also matches unreachable real code" means that zero is **stronger** than
> the reachable zero, because it would have fired on dead code too and did not.

*(Methodological note, because it cost this round real time: a first version of the reachability
walk terminated on every `EXIT` and produced only 420 of 4808 bytes of coverage and **zero** shop
or temple hits — an apparently dramatic "structurally-absent" result that was purely a bug in the
walker. Gen1 `IF_*` conditionally **skips** the following instruction, so `COMPARE / IF_GT / EXIT`
falls through into the dispatch table at `0x8204`. Any scan of this corpus that treats `EXIT` as
unconditionally terminal will silently under-report by ~90%.)*

The zero for `0x4BE6` reproduces, by a completely different method, the whole-corpus zero the
`wilderness` leg was closed on — that leg used the BFS scanner
`tools/map_gen1_area_mode_writes.py`, this one uses a needle scan. Two independent methods, same
zero.

A BFS run over the same corpus (reusing `map_gen1_area_mode_writes.scan_block_for_save` with the
target overridden) reports 57 / 11 / 39 / 15 / 0 for the same five locations. The inflation is
expected and benign: that scanner keys hits by `(offset, entry, value_kind, value)` and NWN blocks
have three reachable header entries (`initial_entry`, `search_location`, `camp_interrupted`), so
most instructions are counted once per entry. The raw-instruction counts in the table above are the
authoritative ones.

### 6b. Cross-title control — the discriminator is the project's own, not invented here

The same BFS scan across every Gen1 profile (`gen1_ecl_encounter_scan.word_sets_for_profile` per
title, so each is decoded in its own dialect):

| title | `0x7F6C` shop | `0x7EE2` temple | `0x7EA8` training |
|---|---:|---:|---:|
| curse-of-the-azure-bonds | 11 | 6 | 7 |
| champions-of-krynn | 8 | 4 | 7 |
| secret-of-the-silver-blades | 3 | 1 | 1 |
| death-knights-of-krynn | 0 | 3 | 2 |
| gateway-to-the-savage-frontier | 43 | 21 | 46 |
| **neverwinter-nights-dos** | **57** | **11** | **39** |
| pool-of-radiance | 0 | 0 | 0 |
| treasures-of-the-savage-frontier | 0 | 0 | 0 |
| pools-of-darkness | 0 | 0 | 0 |

The control that matters: **Gateway's `ECL5.DAX#19` — the block behind Gateway's already-`proven`
`town` leg (Sundabar) — is itself among the hits**, writing all three flags. Secret's `ECL1.DAX#16`
(its proven town, New Verdigris) likewise carries all three. So this leg is being closed on the same
mechanism the matrix already accepted for two other titles, not on a bespoke argument.

> **Corrected and weakened 2026-08-05, on two counts.**
>
> 1. **The Gateway numbers were BFS-inflated and not comparable to NWN's raw-byte census.** The
>    previous revision cited "4 `EnterShop`, 4 `EnterTemple` and 5 `training_class_mask` sites",
>    which are counts out of the BFS table above (keyed per entry point), not raw instruction sites.
>    Re-measured with the same control-flow-free needle scan §6a uses, `ECL5.DAX#19` is
>    **`EnterShop` 2** (`0x8761`, `0x890A`, both `#1`), **`EnterTemple` 2** (`0x8AE4`, `0x8B66`,
>    both `#1`), **`training_class_mask` 3** (`0x8386` = 0, `0x8CB5` = **127**, `0x8CBE` = 0).
>    (It also writes `game_area` once, `#6` at `0x820A`.)
> 2. **The precedent is partial, not full.** `ECL5.DAX#19` **also writes `inDungeon = 1` at
>    `0x8030`** — i.e. Gateway's town leg had the engine-mode signal available and NWN's does not
>    (§1, §7). The shared mechanism is therefore a *partial* precedent: Gateway shows the three
>    service flags are the engine's town-service dispatch, but Gateway's leg did not have to carry
>    the whole argument on them alone, and NWN's does.

*(Disclosure, because it undercuts the table above if left unsaid: `pool-of-radiance`,
`treasures-of-the-savage-frontier` and `pools-of-darkness` report zero for **every** target
including the `game_area` control, which is not credible for real games. Those three rows are
almost certainly scanner-side (dialect or entry-point) failures, not real negatives, and they are
**not** used as evidence anywhere in this document. They are shown rather than filtered out. This
does not affect NWN: NWN's own `game_area` control is non-zero by both methods, so NWN's scan
demonstrably ran.)*

> **Narrowed 2026-08-05, without being closed.** Two of the three rows have a mundane cause and one
> does not. `treasures-of-the-savage-frontier` and `pools-of-darkness` expose exactly **one** ECL
> archive each (`ECL1.DAX`) through `goldbox_corpus.file_index` on this machine, so those two rows
> are an inventory/route gap, not a decode failure. `pool-of-radiance` is different: all **8** of its
> ECL archives are indexed and scanned, and it still returns 0 for every target **including the
> `game_area` control**, under *both* the no-narrowing and the `scan_block`-reset walk models. So the
> Pool row is not explained by compare-outcome narrowing and is not explained by a missing file
> either. The most likely remaining reading is that Pool of Radiance — the earliest Gen1 title —
> simply does not use this Area2 address block, i.e. that the row may be a **real** zero for a
> different reason rather than a scan failure. That is **unresolved**, and nothing in this document
> rests on it.

### 6c. `GEO0.DAX#1` ground truth — both shopping districts (corrected 2026-08-05)

> An earlier revision of this document and its golden described the west shopping district only.
> The retail descriptor grid carries a **second, structurally identical district** in the
> south-east. The golden's `cellsWith(13,false)` and `cellsWith(12,false)` assertions failed
> against the real bytes for exactly this reason and now assert both districts.

Descriptors are `raw[514 + y*16 + x]` (verified: the engine's `decodeGeoBlock(...).map.cells[i].floor`
equals that byte for all 256 cells, 0 mismatches). Bit 7 set = doorway, bit 7 clear = street sign.

| building | door descriptor | door cells | sign descriptor | sign cells |
|---|---:|---|---:|---|
| general items shop | `135` (`0x80\|7`) | `(6,2)`, `(14,11)` | `11` | `(7,2)`, `(14,10)` |
| silver shop | `136` (`0x80\|8`) | `(6,3)`, `(13,11)` | `12` | `(7,3)`, `(13,10)` |
| jewelry shop | `137` (`0x80\|9`) | `(6,4)`, `(15,11)` | `13` | `(7,4)`, `(15,10)` |
| temple of Tyr | `133` (`0x80\|5`) | `(10,4)` | `17` | `(10,5)` |
| temple of Oghma | `133` | `(10,10)` | `16` | `(10,9)` |
| temple of Helm | `133` | `(10,13)` | `18` | `(10,12)` |
| training hall | `138`,`139`,`140`,`141` (`0x80\|10..13`) | **8 cells** — `(14,3)`,`(6,10)`; `(14,2)`,`(6,11)`; `(14,1)`,`(6,12)`; `(14,0)`,`(6,13)` | `6`, `7` | `(7,11)`, `(13,1)` — **only 2 of the 8 doors have one** |
| arms & armor | `131` (`0x80\|3`) | **4 cells** — `(8,0)`, `(13,6)`, `(15,8)`, `(6,15)` | `9`, `22`, `3`, `1` | `(8,1)` KROEGEL'S, `(12,6)` CRAGDYK'S, `(14,8)` BAYLESS, `(6,14)` BRORSMAN'S |

> **Corrections (2026-08-05), both to this table.**
>
> 1. **The training hall is four descriptors, not one.** `138`, `139`, `140` and `141` all route to
>    the same door-table arm (`0x87A3`, `"WOULD YOU LIKE TO TRAIN?"`) and together occupy **8** cells.
>    The previous revision listed only `139` and its two cells, which made the training hall look like
>    a two-door building.
> 2. **There are four arms & armor shops, not one.** Descriptor `131` occupies 4 cells and each has
>    its own named sign on an adjacent cell: `(8,0)`→sign `9` *KROEGEL'S ARMS & ARMOR*,
>    `(13,6)`→sign `22` *CRAGDYK'S ARMS & ARMOR*, `(15,8)`→sign `3` *BAYLESS ARMS & ARMOR*,
>    `(6,15)`→sign `1` *BRORSMAN'S ARMS & ARMOR*. The previous revision listed only Cragdyk's.

In the west district the sign sits **east** of its door; in the south-east district it sits
**north** of its door; at the temples it sits **south**, **north** and **north** respectively.

**The proven invariant runs sign → door, and only that way (corrected 2026-08-05).** For each of the
named service signs, the sign cell touches exactly one door whose dispatch arm is the service that
sign advertises — that is what golden test **N** asserts and it holds. The *converse* does not hold
and the previous revision wrongly implied it. Measured over the whole grid: there are **71** doorway
cells (bit 7 set) and **42** sign cells; **45 of the 71 doors have no adjacent sign at all** and
**9 have more than one**, while **15 of the 42 signs touch no door** and **10 touch more than one**.
Concrete counter-examples to a door→sign rule: training doors `(14,0)`, `(14,2)`, `(14,3)`, `(6,10)`
and `(6,12)` have no adjacent sign; training door `(6,13)` is adjacent to sign `1`, which reads
*BRORSMAN'S ARMS & ARMOR*, i.e. it advertises the neighbouring shop and not the training hall.

The sign arm vaddrs (from the `0x8284` table, index → target) that carry those names:
`11→0x89F8` *GENERAL ITEMS SHOP*, `12→0x8A20` *SILVER SHOP*, `13→0x8A4B` *JEWELRY SHOP*,
`16→0x8AA1` *TEMPLE OF OGHMA*, `17→0x8AE1` *TEMPLE OF TYR*, `18→0x8B0C` *TEMPLE OF HELM*,
`6→0x8996` *ADVANCE LEVELS HERE*, `22→0x8C13` *CRAGDYK'S ARMS & ARMOR*, and (added 2026-08-05)
`1→0x8914` *BRORSMAN'S ARMS & ARMOR*, `3→0x8958` *BAYLESS ARMS & ARMOR*,
`9→0x89A9` *KROEGEL'S ARMS & ARMOR*, `7→0x8996` *ADVANCE LEVELS HERE* (arms `5`–`8` all target the
same `0x8996`).

## 7. Scope — exactly what is and is not claimed

**Claimed, and proven from retail bytes:**

- `ECL0.DAX#1` / `GEO0.DAX#1` is the city of Neverwinter, entered at `(8,7)` facing west on a cold
  boot, with the game's own naming narration.
- Its `search_location` splits the GEO descriptor byte on bit 7 into a doorway table and a street
  sign table, each with 38 arms, and the two tables agree building-by-building. Neverwinter has
  **two** shopping districts, not one (§6c): a west row (doors at x=6, signs at x=7, y=2..4) and a
  south-east row (doors on y=11, signs on y=10, x=13..15). **Every named service *sign* cell is
  orthogonally adjacent to exactly one door whose dispatch arm is the service that sign advertises**
  (golden test **N**). *(Corrected 2026-08-05: this bullet previously read "Every service door …
  has its matching sign on an orthogonally adjacent cell — exactly one such sign each, never zero
  and never two." The direction was backwards and the quantifier was false: 45 of the 71 doorway
  cells have no adjacent sign and 9 have two or more. What test N actually asserted, then and now,
  is the sign→door direction. See §6c.)*
- Three of its doorways invoke the retail `CityShop()` host routine via
  `EnterShop`/`CLEARMONSTERS`/`COMBAT`; three more invoke `temple_shop()` via `EnterTemple`; four
  more invoke `startGameMenu()` with `training_class_mask = 0x7F`.
- One further doorway is a self-contained priced transaction with a byte-verified two-tier price
  table (50 / 440) against the party's platinum register, self-consistent with its own narration.
- A 42-step circuit visits all six service doors with zero locked/bashable doors on the path (29
  edges with wall slot 0 and door flag 0, 13 door-flag-1 edges, **no flag-2/flag-3 edge and no
  solid-wall edge anywhere** — each asserted separately in golden test **H**, see §5), and every
  step's turn was produced by executing the real block through the real `EclVm`.

**Explicitly NOT claimed:**

- **Not a distinct engine mode.** NWN never writes `Area1.inDungeon` anywhere. Under the CoAB
  oracle, `ovr008.cs vm_init_ecl()` sets `gbl.area_ptr.inDungeon = 1` unconditionally on every ECL
  load, so — *(inference, from the CoAB host, not from NWN's own executable)* — every NWN map,
  including this city, is presumably in `DungeonMap` mode with the `DUNGCOM` floor bank. If the
  question is "does NWN have a Town engine mode", the answer is no. Neverwinter is a
  dungeon-mode stepped grid with shops on it, and this document says so rather than dressing it up.
- **The host-side semantics are the CoAB oracle's, not NWN's own.** Everything in §1a/§1b about
  what `CityShop()` and `temple_shop()` *do* comes from the CoAB decompile. NWN's `GAME.EXE` /
  `GAME.OVR` (Stormfront/FBOV lineage, like Gateway) was **not** disassembled in this round. The
  ECL-side facts — the writes, their values, their adjacency to `COMBAT`/`PROGRAM`, the price
  constants — are all read from NWN's own bytes. The mapping from those writes to those host
  routines is inherited. It is corroborated by the address model's `game_area` control landing on
  NWN bytes and by Gateway (same engine lineage, proven town leg) using the identical flags, but it
  is **not** independently re-derived from NWN's binary. That is the single largest inference in
  this document.
- **No live browser wiring.** This is an engine-level proof, matching the documented precedent that
  `proven` does not require in-browser wiring (Secret's and CoK's quest legs).
- **`ECL1#12`, `ECL2#24` and `ECL2#25` are identified but not walked.** They are Triboar,
  Floodblest and Nightsedge (§6a-i, named from their own retail narration, golden test **M**).
  What is claimed is only their *identity* and their service-flag writes. Their GEO maps, their
  dispatch tables, and any route through them were **not** examined this round. Nightsedge in
  particular carries the same shop+temple+training cluster as Neverwinter and would be the
  cheapest second town to prove if the matrix ever wants one.
- **No claim that a lone `EnterShop` write means "town".** Nine NWN blocks (`ECL0#3,4,5,6,8,9`,
  `ECL1#10,16`, `ECL3#30`) carry a merchant with no temple and no training hall, on otherwise
  dungeon-flavoured maps — e.g. `ECL0#9`'s `"'VILNASK ARMORY / FINE WEAPONS AND MAIL'"`.
  *(Corrected 2026-08-05: this bullet used to end "Only the cluster is the argument." That
  overstates. Per §6a-i, `EnterTemple` **alone** already selects the same four blocks and the
  training mask **alone** already selects the same two — the conjunction removes nothing. The
  argument is `EnterTemple`, corroborated by `EnterShop` and the training mask. The nine
  shop-only blocks are still the reason a lone `EnterShop` is not the discriminator.)*

## 8. Honest gaps and open questions

- **`[0x7FF6]` (Area2 offset `0x7EC`, `field_7EC`) is UNLOCATED.** All three shop arms write `#1`
  to it immediately after `EnterShop`. The CoAB oracle declares the field (`Area2.cs:149,310`) but
  **no engine code anywhere in `coab_extracted/engine/*.cs` reads it**. Its purpose is genuinely
  unknown and is not guessed at here.
- **A shared operand-decoding defect found here and fixed in the VM/native interpreter.**
  Retail semantics in `coab_extracted/Classes/Opperation.cs` `GetCmdValue()` are:

  ```csharp
  case 0x01: case 0x03: case 0x80:  return getMemoryValue(word);   // memory read
  case 0x02: case 0x81:             return word;                   // 16-bit IMMEDIATE literal
  ```

  i.e. **code `0x00` is an 8-bit immediate, code `0x02` is a 16-bit immediate, codes `0x01`/`0x03`
  are memory reads.** The jeweller's `SAVE #440 -> [0x7F7A]` (`09 02 b8 01 01 7a 7f`) exemplifies
  the rule. The TS disassembler now classifies code `0x02` as an immediate, and both TypeScript and
  native interpreters return its 16-bit word directly. The area-2 threshold golden and a VM unit
  test cover execution; raw encoding assertions remain valid.
- **`ITEM.DAX` blocks 1 and 6 do not decode as named stock.** Block 5 (the weapon shop) is a clean
  58-record plain-ASCII list. Blocks 1 (3 records) and 6 (5 records) are the same 63-byte record
  size, but their name fields contain uninitialised host memory — block 6 record 0 literally
  contains the ASCII `CBODY.DAX` and `C:\ADD`. Their numeric tails look structured. The general and
  silver shops' stock therefore cannot be named from the archive, and this round did not work out
  how the retail engine names them. Not load-bearing for the leg.
- **The `CALL [0xC01E]` "turn around and step back out" host routine is not modelled** by this
  engine, so a service arm's tail re-enters the same cell dispatch instead of returning control to
  the walker. This is the same known VM gap that `gatewayQuestFlag.test.ts` already discloses for
  Gateway. *(Sentence repaired 2026-08-05 — the previous wording, "the same known VM gap
  `gatewayQuestFlag.test.ts` test I already discloses for Gateway", was garbled.)* It means
  the post-service turns in a runner are repeats, not retail behaviour; the golden therefore
  asserts the *first* turn of each arm and the memory writes, not the tail.
- **`camp_interrupted` and `pre_camp_check` entries were not exercised.**
- **Nothing here was verified against a running DOS build.** No DOSBox-X was used, by standing
  project rule for this round.

## 9. Reproduction

```powershell
# route legs
python tools\find_geo_path.py --geo "D:\Games\Neverwinter Nights DOS\neverwinter-nights\neverwint\GEO0.DAX" `
  --block 1 --start 8,7 --target 10,4 --facing west

# the golden (all 14 tests read the retail bytes; none are skipped when the install is present)
pnpm --filter @goldbox/engine test -- nwnTownRoute
```

Note that `pnpm --filter @goldbox/engine test -- nwnTownRoute` runs the **whole** engine suite (the
`--` is consumed by pnpm, so the name is not applied as a vitest filter). To run this file alone:

```powershell
cd packages/engine; npx vitest run test/nwnTownRoute.test.ts
```

The whole-corpus census in §6a is re-derived inside the golden itself (test **F**), so it needs no
external tool and cannot drift from the doc.

> **What the golden does NOT re-derive (disclosed 2026-08-05).** Test **F** reproduces the *naive*
> column of §6a-ii only — the control-flow-free needle scan. The **`reachable` column is not computed
> anywhere in the repo**, and it is the column §6a-ii says the positive claims rest on. To reproduce
> it, use the model named verbatim in §6a-ii: BFS from the five ECL header entries following
> `GOTO`/`GOSUB`/`RETURN`/`ON_GOTO`/`ON_GOSUB`, with `IF_*` enqueueing **both** the guarded
> instruction and the one after it, and **no compare-outcome narrowing** — i.e. call
> `tools/gen1_ecl_encounter_scan.successors()` with `compare_outcomes=ALL_COMPARE_OUTCOMES` on every
> edge and keep it out of the visited-state key. Threading `successors()`'s own narrowed outcome set
> instead (the obvious reading of its signature) returns **3 / 3 / 32 / 5 / 0**, not
> **20 / 4 / 33 / 8 / 0**; adding `scan_block()`'s `COMPARE` reset restores the published numbers.
> Both caveats are spelled out in §6a-ii. Run any such script from a scratch directory — do **not**
> invoke either scanner's CLI, whose `--markdown` / `--json` defaults point at checked-in files.

> Tool-safety note for whoever repeats §6b: `tools/map_gen1_area_mode_writes.py` and
> `tools/gen1_ecl_encounter_scan.py` **default their `--markdown` / `--json` output paths to
> checked-in files under `docs/engine/research/` and `build/`**. This round imported
> `scan_block_for_save` from a scratch script instead of running either CLI, precisely so that no
> default argument could overwrite a checked-in report. Do the same, or pass explicit scratch
> paths.
