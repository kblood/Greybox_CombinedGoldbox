# Pools of Darkness — the TOWN leg

Status: **PROVEN** (static, byte-level; no DOSBox-X was used)
Scope: the `town` leg of the `pools-of-darkness` campaign evidence matrix.
Companion doc: `docs/engine/research/pools-ecl69-72-natural-route-2026-07-29.md` (the proven `early` leg).
Golden test: `packages/engine/test/poolsTownRoute.test.ts`.

Everything below is derived from the retail GOG install resolved programmatically through
`tools/goldbox_corpus.py` (`choose_install` / `file_index`), never from a hardcoded path and never
from Forgotten Realms setting knowledge. Where a claim is an inference rather than a byte reading
it is labelled **(inference)**.

---

## 0. Ground rules used throughout

| Fact | Value |
| --- | --- |
| Script archive | `ECL1.DAX`, 329,456 bytes, **56 blocks** (1–4, 16–27, 32–42, 48–55, 64–77, 80–86) |
| Map archive | `GEO1.DAX`, **32 blocks**, every one exactly 1026 bytes (16×16) |
| Dialect | `ECL_GEN1_SHORT_POOLS`, word sets `{0x0C:4, 0x1D:0, 0x1F:1, 0x21:2, 0x22:0, 0x23:0, 0x2C:1, 0x37:2}` |
| Cell descriptor | `[0x002d]` (`EclDialect.cellDescAddr`) — **not** `[0xc04f]` |
| Addressing | vbase `0x7FFE`; file offset = vaddr − 0x8000 + 2 |
| `SAVE` operand order | `(source, destination)` — destination last |
| GEO layout | walls `raw[2:258]` / `raw[258:514]`, descriptors `raw[514:770]` indexed `y*16+x`, doors `raw[770:1026]` |

The dialect was taken from `gen1_ecl_encounter_scan.word_sets_for_profile('pools-of-darkness')`.
Pools ships exactly one script archive and one map archive; there is no `ECL0`/`ECL2`.

> **Dialect sensitivity measured (2026-08-06).** Every VM assertion in this leg is invariant under
> `ECL_GEN1_SHORT_TREASURES` and under base `ECL_GEN1_SHORT` with `cellDescAddr` patched to `0x002d`.
> The Pools-specific word-set overrides (`0x1f`, `0x21`, `0x37`, `0x41`) are correct but **NOT
> load-bearing here**; the only load-bearing dialect field is `cellDescAddr = 0x002d`. (Base
> `ECL_GEN1_SHORT` *unpatched* yields nothing at all — because of `cellDescAddr`, not the word sets.)
> The first draft cited the Pools word sets as though they were load-bearing for this leg's results.

Two independent decoders were used and cross-checked throughout:

* a **control-flow-free raw-byte needle scan** (find the literal operand encoding `01|81 <lo> <hi>`
  preceded by `09 00 <imm>`), which cannot follow jumps and therefore cannot be desynced by a wrong
  dialect — a zero from it is a real zero; and
* a **no-narrowing reachability walk** seeded from all five header entry points of every block,
  expanding **both** outcomes of every conditional, which covers **267,821 / 319,072 = 83.9 %** of
  ECL1 block bytes.

**Operand-code note (load-bearing).** Pools writes host words with operand code `0x01` *and* code
`0x81`. `0x81` is the engine's `string` operand kind (`classify()` in
`packages/engine/src/ecl/disassemble.ts`): the establishment-name buffer `[0x02ef]` is always
addressed as `0x81 ef 02`. A scan that only matched `01 <lo> <hi>` finds **zero** name writes and
would have missed the entire discriminator of §2. Both codes are matched everywhere below.

---

## 1. The discriminator problem

### 1a. The usual signal is genuinely absent, and so is the whole address space it lives in

A control-flow-free scan of all 56 ECL1 blocks for the literal 3-byte operand encodings of the
CoAB-family town/dungeon registers returns **zero hits for every one of them**:

| address | role in CoAB / CoK family | raw hits in Pools ECL1 |
| --- | --- | ---: |
| `0x4BE6` | `inDungeon` | **0** |
| `0x7F6C` | `EnterShop` | **0** |
| `0x7EE2` | `EnterTemple` | **0** |
| `0x7EA8` | `training_class_mask` | **0** |
| `0x7F12` | `game_area` | **0** |
| `0x7F6D` | shop price scale | **0** |
| `0x7CC3` | party platinum | **0** |
| `0x7FF6` | Area2+0x7EC | **0** |
| `0xC04B` / `0xC04C` / `0xC04D` | X / Y / facing | **0** / **0** / **0** |
| `0xC04F` | cell descriptor | **0** |
| `0x4BF2` | LastEclBlockId | **0** |

This is not a scan failure and not a missing feature. **Pools' ECL host memory is an entirely LOW
address space.** Stated precisely (corrected 2026-08-06): the naive scan's `SAVE`-imm destinations
are `0x0001`–`0x02EF` at **4036 of 4041** sites; the 5 outliers (`0x054e`, `0x05ee` ×2, `0x05fd`,
`0x4301`) are unvalidated control-flow-free hits in probable data. **No CoAB-family address (all
≥ `0x4BE6`) appears at all.**

> **Correction (2026-08-06).** The first draft asserted a flat "observed write range is
> `0x0001`–`0x02EF`". That is not what the stated method returns: under the doc's own
> control-flow-free `09 00 <imm> 01|81 <lo> <hi>` scan, destinations run `0x0001`–`0x4301`. The five
> outliers are near-certainly artifacts of a scan that cannot tell code from data — but the draft
> asserted an exact upper bound from a method that does not produce it, while using the same method's
> zeros as positive evidence elsewhere. The conclusion is unaffected: every CoAB-family address is
> still 0, and `0x4301 < 0x4BE6`.

Every CoAB-family address is simply out of range. The same is already recorded for this title's cell descriptor (`cellDescAddr = 0x002d`,
sourced from Pools' own `GAME.OVR`) and its last-block register (`lastBlockIdAddr = 0x0016`), and
Treasures of the Savage Frontier shares the convention (`treasures-town-route.md` §1a).

Pools' own position registers are `[0x0034]` = X, `[0x0035]` = Y, `[0x0011]` = facing (0 = N,
1 = E, 2 = S, 3 = W). Both coordinate registers are only ever written 0–15 across the corpus, and
`[0x0011]` only ever 0–3 (122 immediate writes: 27 `#0`, 43 `#1`, 23 `#2`, 29 `#3`) — the shapes a
16×16 grid and a 4-way facing demand. The identification is corroborated in-title in §5b.

**So the brief's warning is confirmed rather than merely assumed:** the absence of an `inDungeon`
write in Pools carries no information at all, because the address does not exist in this title's
memory model.

### 1b. Pools labels its own service ABI — in a debug menu SSI shipped in the retail data

`ECL1.DAX#1` (2316 bytes) is **a developer test menu left in the retail game**. Its
`initial_entry` opens

```
8014  SAVE #1, [0x0016]
8039  PRINTCLEAR "DO YOU WANT TO START FROM SCRATCH OR USE THE JUMPER?"
8063  HORIZONTAL_MENU [0x00bf], #2, "JUMPER", "START"
80b9  PICTURE #128
80bc  PRINTCLEAR "WHERE DO YOU WISH TO GO?"
80e6  HORIZONTAL_MENU [0x00bf], #7, "JUMP","ARENA","CAMP","TREAS","DEMO","PRV","NXT"
8132  HORIZONTAL_MENU [0x00bf], #7, "TRAIN","VAULT","STORE","ANPC","DNPC","PRV","NXT"
817f  HORIZONTAL_MENU [0x00bf], #7, "EXP","SETUP","BPIC","CMD","TEMPLE","PRV","NXT"
```

and each arm is one service idiom, **named by the game itself**:

| menu label | arm vaddr | bytes | decoded |
| --- | --- | --- | --- |
| `TRAIN` | `0x839d` | `09 00 7f 01 30 00 09 00 01 01 e5 02 38 00 00` | `SAVE #127,[0x0030]` ; `SAVE #1,[0x02e5]` ; `PROGRAM #0` |
| `VAULT` | `0x83b0` | `09 00 01 01 31 00 24 09 00 00 01 31 00` | `SAVE #1,[0x0031]` ; `COMBAT` ; `SAVE #0,[0x0031]` |
| `STORE` | `0x83c1` | `09 00 10 01 28 00 09 00 01 01 04 00` | `SAVE #16,[0x0028]` ; `SAVE #1,[0x0004]` |
| `STORE` (cont.) | `0x83cd`…`0x841e` | `… 3c 01 c2 00` | `"WHICH STORE NUMBER?" / " (1-11, 0=EXIT)"` ; `INPUT_NUMBER →[0x00c2]` ; `PROTECTION [0x00c2]` |
| `TEMPLE` | `0x8724` | `09 00 01 01 14 00 0e 00 80 24` | `SAVE #1,[0x0014]` ; `PICTURE #128` ; `COMBAT` |
| `CAMP` | `0x82d2` | `09 00 01 01 e5 02 38 00 09` | `SAVE #1,[0x02e5]` ; `PROGRAM #9` |

This is a **materially stronger** basis than the sibling Treasures leg had. There, the host-side
meaning of `[0x0004]`/`[0x0014]`/`[0x0028]`/`[0x0030]` was an inference from the CoAB oracle's
identical idioms (`treasures-town-route.md` §7 item 1). Here the *same game's own script* attaches
the English words STORE, TEMPLE, TRAIN, VAULT and CAMP to those exact byte sequences. It also
resolves, for Pools, what Treasures left UNLOCATED: **`PROTECTION`'s operand is the store number,
and the valid range is 1–11**, stated in the debug prompt's own literal text.

Caveat, stated up front: block 1 is a **debug** block, so it proves what the *author* believed the
idioms mean, not what `GAME.OVR` executes. No Pools native disassembly was done (§7 item 1).

### 1c. Why the service idioms ALONE are not a sound town discriminator

The naive "any service idiom" rule — the union of the five marker registers of §2 — selects
**14 blocks**: `{1, 16, 17, 18, 19, 21, 24, 25, 26, 27, 39, 40, 50, 52}`. **Eight of them are
demonstrably not settlements**, and this is the strongest counter-argument to the whole leg, so it
is answered from bytes rather than waved away:

| blk | what the service actually is | citation |
| ---: | --- | --- |
| 1 | the developer debug menu of §1b | `0x80bc` `"WHERE DO YOU WISH TO GO?"` |
| 17 | **wilderness** random encounter | `0x90f7 RANDOM #9,[0x00bf]` → `0x90fd ON_GOTO` → `0x9121 "A HEAVILY ARMED MERCHANT CARAVAN APPROACHES. THEY OFFER TO SHOW YOU THEIR WARES."` (shop), `0x91e9 "YOU COME UPON AN AGED GROUP OF ADVENTURERS. THEY OFFER TO TRAIN YOU."` (train), `0x9254 "YOU MEET A BAND OF CLERICS ON A PILGRIMAGE. THEY OFFER YOU HEALING."` (temple) |
| 25 | **wilderness**, the same three rolls | `0x8876 RANDOM #9` → `0x88a0` / `0x8968` / `0x89d3`, byte-identical narration |
| 21 | hill-giant **steading** | `0x806e "HILL GIANTS GUARD THE STEADING'S GATE."`; its trainer at `0x9cae "ALL MANNER OF MERCENARIES ARE HONING THEIR SKILLS. DO YOU JOIN THEM?"` writes **`SAVE #255,[0x0030]`** @`0x9cea` — the only site in the whole corpus that is not `#127` |
| 39 | a wizard's arena "domain" | `0x8087 "'YOU HAVE ENTERED MY DOMAIN. ONLY THE BEST WILL LEAVE.'"`; its trainer is a one-off `0x9788 "DO YOU WISH TO TRAIN?"` |
| 40 | an undead combat area | `0x83d4 "SPECTRAL FORMS DROP THROUGH THE CEILING."`, `0x8444 "BLOCKS OF ICE SHATTER AS YOU ENTER. LICHES STEP FROM THE SHARDS."`, `0x8348 "SHIMMERING SHAPES EXPLODE OUTWARD. THEY SOLIDIFY AND ATTACK BEFORE YOU CAN REACT."` — its two `[0x0030]` sites (`0x85a9`, `0x8d64`) are also naive-only, unreached by the §0 walk |
| 50 | Temple-of-Tyr entrance hall, one NPC heal | `0x8055 "THIS IS THE ENTRANCE HALL TO THE TEMPLE OF TYR."` |
| 52 | Moander's body; a hermit trainer and an alchemist | `0x80e2 "AEGHWAET APPROACHES YOU WITH A SMILE."`, `0x83f5 "THE HERMIT GREETS YOU."` |

So a Pools "town" is **not** identifiable from the presence of a shop/temple/training opcode. Said
plainly: Pools sells you goods, heals you and trains you in the middle of the wilderness and inside
a giant's fortress, using exactly the same six bytes it uses in Phlan.

> **Counter-example, disclosed (added 2026-08-06) — the strongest one against the §1d
> discriminator.** `ECL1#21`, refuted above as the Steading, itself carries a **map-placed sign over
> a door naming an establishment**: `PRINTCLEAR` @`0x8fe1`, string @`0x8fe2`,
> `"A SIGN OVER THE DOOR READS, 'THE TWISTED HORN.'"`, reached as **arm 30** of block 21's OWN 47-arm
> `search_location` `ON_GOTO` (@`0x853c`), placed at `GEO1#21` cell **(8,8)** descriptor `0x1e` —
> alongside its `[0x0004]` / `[0x0028]` / `[0x0030]` writes. It also has `0x8823`
> `"A SIGN OVER BOTH DOORS READS, 'PRIVATE! KEEP OUT'"` (arm 35; cells (1,13), (3,13), (11,13),
> (13,13)), and `ECL1#67 0x8a7f` has `"A SIGN READS 'THE MANUFACTORY OF MOANDER.'"`.
>
> Under §1d's own plain-English criterion — "a place whose services are permanently sited and
> selected by name", "a shop sign nailed over a door, in the game's own words, placed on a specific
> map cell" — **block 21 qualifies.** It is excluded on narration **plus authoring MECHANISM** (the
> shared `[0x02ef]` buffer + one reusable printer subroutine), not on the absence of a named signed
> establishment. The first draft's §1c row for block 21 cited only the gate narration and the `#255`
> anomaly and never mentioned the sign. The four-block result is exact **for the mechanism**; the
> boundary of the SETTLEMENT SET is an authoring-mechanism boundary and is stated as such in §1d.

### 1d. The discriminator actually used, and why it is sound

A settlement is a place whose services are **permanently sited and selected by name**. Pools
implements that in exactly two byte-identifiable forms.

**(T1) The signed-door city map.** A block's `search_location` descriptor dispatch has arms of the
shape

```
SAVE "<ESTABLISHMENT NAME>", [0x02ef]      ; 09 80 <len> <packed6…> 81 ef 02
GOTO  <the block's own sign printer>
```

and the printer is

```
9d5a  PRINTCLEAR "A SIGN OVER THIS DOOR READS"
9d72  PRINT_RETURN / PRINT_RETURN / PRINT "       '"
9d7d  PRINT [0x02ef]
9d81  PRINT "'"
9d85  EXIT
```

This is not a proxy for a town — it *is* a shop sign nailed over a door, in the game's own words,
placed on a specific map cell.

**What actually selects the four blocks (corrected 2026-08-06).** Block selection is carried
**entirely** by the presence of the literal `"A SIGN OVER THIS DOOR READS"` printer, which occurs in
exactly four blocks `{16, 19, 24, 26}`; a one-string scan gives the identical set. The
`[0x02ef]` / `0x81` / `GOTO` chain is **NOT** an additional discriminator — it is what resolves each
block's establishment **ROSTER** (18 / 6 / 17 / 7 of the 84 corpus-wide name writes) and what
surfaces the block-24 exception (`SMITHY'S CHOICE` at `0x9a60` followed by opcode `0x12`, not
`GOTO`).

> **Correction (2026-08-06).** The first draft presented the three-part conjunction (inline name /
> operand code `0x81` → `[0x02ef]` / `GOTO` into the sign printer) as what narrows 12 name-writing
> blocks down to 4. It does not. The single simplest alternative — "does the block contain the
> literal string `A SIGN OVER THIS DOOR READS` anywhere?" — returns EXACTLY `{16, 19, 24, 26}`, the
> identical set. Per block: printers = 1 ⇒ every name chains (18/18, 6/6, 7/7, and 17/18 in block
> 24); printers = 0 ⇒ zero chain. The GOTO-chaining therefore carries **zero block-selection power**.

Corpus-wide the chain "inline name → `[0x02ef]` → sign printer" occurs in the same four blocks:

| blk | signed establishments | names |
| ---: | ---: | --- |
| 16 | **18** | PASSENGER DOCK, CLOISTER OF TYR, TOWN HALL, TRAINING HALL, TEMPLE OF SUNE, VALHEGEN PARK, TEMPLE OF TEMPUS, TEMPLE OF GOND, SUNRISE INN, OHLO'S MYSTIC DEVICES, OLD GUILD ARMORY, LAKESIDE INN, SPENDTHRIFT INN, TROLL TOSS TAVERN, FORTUNES TOLD, BOWYER'S SUPPLY, FINE CLOTHING, SMITHY'S CHOICE |
| 24 | **17** | the same list minus SMITHY'S CHOICE (see below) |
| 19 | **6** | TRAINING HALL, FINE WEAPONS, TEMPLE OF BANE, MYSTIC TALISMANS, PURPLE PLUME TAVERN, TRADING POST |
| 26 | **7** | THE SLEEPING DRAGON, TRAINING HALL, FIRST JUSTICAR, TEMPLE OF BANE, ANIMAL PITS, ARENA CHALLENGE, ACCURATE WEAPONS |

`[0x02ef]` on its own is **not** a discriminator and is deliberately not used as one: it is a
general string scratch buffer. Blocks 17 and 27 load overland destination names into it, block 52
loads `"YOUR RIGHT."` / `"BEHIND YOU."`, block 34 `"WEST WALL"` / `"EAST WALL"`, block 39/40
`"FIGHTER'S"` / `"MAGE'S"`. **84 inline-name writes across 12 blocks; only the 48 that chain into a
sign printer are counted**, and those 48 fall in exactly the four blocks above. Block 24 has 18 name
writes but only 17 chain to its printer — the `SMITHY'S CHOICE` write at `0x9a60` is followed by
opcode `0x12`, not `GOTO`, and that single exception is recorded rather than rounded away.

**(T2) The menu settlement.** A `HORIZONTAL_MENU` whose **labels are the service names** and whose
`ON_GOTO` arms are the service idioms one-for-one.

**T2 verified corpus-wide (2026-08-06)** by enumerating every CFG-reachable `HORIZONTAL_MENU`
(`0x2b`) and its inline labels across all 56 blocks: service-labelled menus occur in exactly
`ECL1#1` (debug, `0x8132`), `ECL1#18` (**TWO** — `0x84cb` HEAL/TRAIN/STORAGE/REST/MOVE ON and
`0x8506` HEAL/TRAIN/REST/MOVE ON) and `ECL1#27` (`0x806c`). Zero elsewhere.

> **Correction (2026-08-06).** The first draft asserted "corpus-wide this occurs in exactly two
> blocks" and its golden's case I only checked that blocks 18 and 27 contain the expected strings and
> then asserted a hardcoded constant equals itself — a vacuous tautology with no corpus-wide search.
> The claim HOLDS on the measurement above, but it was not the finder's measurement, and block 18
> carries TWO such menus where the draft cited only `0x84cb`.

The two campaign-side blocks (the debug block `ECL1#1` is excluded by §1c):

* `ECL1#27` (596 bytes, no GEO map of its own — it does not need one):
  ```
  8037  PRINTCLEAR "WELCOME TO THE TOWN OF "  / PRINT [0x02ef] / PRINT ". "
  8057  PRINT "WHERE DO YOU WISH TO GO?"
  806c  HORIZONTAL_MENU [0x00bf], #5, "INN", "TEMPLE", "HALL", "SHOP", "LEAVE"
  808e  ON_GOTO [0x00bf], #5, [0x80ad], [0x80db], [0x810d], [0x811a], [0x8155]
  80d4    INN    -> PROGRAM #9
  8102    TEMPLE -> SAVE #1,[0x0014] ; COMBAT
  810d    HALL   -> SAVE #127,[0x0030] ; PROGRAM #0
  8142    SHOP   -> SAVE #16,[0x0028] ; SAVE #1,[0x0004] ; PROTECTION #5
  8155    LEAVE  -> NEWECL #25
  ```
  Its town name comes from `0x8169 GETTABLE [0x8231],[0x0025],[0x00bf]` → `0x8173 ON_GOTO … #11`,
  whose arms load **NO NAME, VERDIGRIS, MELVAUNT, SULASSPRYN, THENTIA, HULBURG, HILLSFAR,
  ELVENTREE, ELMWOOD** (`0x819a`–`0x8212`). One shared script, eight named minor towns.
* `ECL1#18`, Elminster's demiplane camp:
  ```
  84cb  HORIZONTAL_MENU [0x00bf], #5, "HEAL", "TRAIN", "STORAGE", "REST", "MOVE ON"
  8536    HEAL    -> SAVE #1,[0x0014] ; COMBAT ; SAVE #0,[0x0014]
  8547    TRAIN   -> SAVE #127,[0x0030] ; PROGRAM #0
  8554    STORAGE -> SAVE #1,[0x0031] ; COMBAT ; SAVE #0,[0x0031]   (the VAULT idiom)
  8565    REST    -> PROGRAM #9
  ```
  Mechanically a full service hub; narratively `0x8086 "YOU ARRIVE AT ELMINSTER'S CAMP IN LIMBO."`
  It is listed as a settlement **on mechanism only**, and calling it a town would overstate (§7).

**Discriminator, stated plainly (reworded 2026-08-06):** the reusable sign-printer **MECHANISM**
(inline name → `[0x02ef]` → the block's own `"A SIGN OVER THIS DOOR READS"` subroutine) occurs in
exactly four blocks `{16, 19, 24, 26}`. **This is a mechanism census, not a semantic settlement
test:** `ECL1#21` (the Steading) carries an inline-literal sign over a door naming an establishment —
`0x8fe1` `"A SIGN OVER THE DOOR READS, 'THE TWISTED HORN.'"`, arm 30, `GEO1#21` (8,8) desc `0x1e` —
plus shop/price/train writes, and is excluded on narration and on mechanism, **not** on the absence
of a named signed establishment. Blocks 21 and 67 also carry inline-literal signs (`0x8823`
`'PRIVATE! KEEP OUT'`, arm 35; `0x8a7f` `'THE MANUFACTORY OF MOANDER'`). The boundary of the
settlement SET is therefore an **authoring-mechanism boundary** and is disclosed as such.

T1 (the mechanism) gives {16, 19, 24, 26}; T2 (the service menu) gives {18, 27}. The service opcodes
alone corroborate but **do not select** — they over-select by eight blocks, every one refuted above
from its own narration.

---

## 2. Corpus census

Raw-byte (control-flow-free, 100 % of bytes) immediate-write census of the five service registers:

| marker | role (per §1b) | sites | blocks | written values |
| --- | --- | ---: | --- | --- |
| `[0x0004]` | STORE flag | 13 | 1, 16, 19, 21, 24, 26, 27 | `#1` at all 13 |
| `[0x0014]` | TEMPLE flag | 12 | 1, 16, 17, 18, 24, 25, 27, 50, 52 | 9 × `#1`, 3 × `#0` |
| `[0x0028]` | store price scale | 17 | 1, 16, 17, 19, 21, 24, 25, 26, 27 | `#16` ×11, `#32` ×5, `#64` ×1 |
| `[0x0030]` | TRAIN class mask | 16 | 1, 16, 17, 18, 19, 21, 24, 25, 26, 27, 39, 40, 52 | `#127` ×15, `#255` ×1 (block 21 only) |
| `[0x0031]` | VAULT flag | 6 | 1, 18, 24 | 3 exact set/clear pairs |
| `[0x0016]` | current-area id | 58 | 47 blocks | 57 × own block id, 1 × `#32` (blk 21) |

The value domains are tightly constrained — what a host-ABI flag looks like and what an arbitrary
variable does not — and they are **identical to Treasures'** independently measured domains
(`#1` for the shop flag, `#127` for the training mask, `{16, 32, 64}` for the price scale). Two
separately authored SSI titles agreeing byte-for-byte on five register addresses and their value
domains is real corroboration for the ABI reading.

Unlike Treasures, the `[0x0014]` set/clear pairing is **not** universal here: 9 sets against 3
clears. **Blocks 1, 17, 24, 25, 27 and 50 set the flag with no paired clear; only 16, 18 and 52 pair
it.** Recorded, not smoothed.

> **Correction (2026-08-06).** The first draft listed five blocks (17, 24, 25, 27, 50), omitting the
> debug block `ECL1#1` (`0x8724`). Per-block `[0x0014]` values are
> `{1:[1], 16:[1,0], 17:[1], 18:[1,0], 24:[1], 25:[1], 27:[1], 50:[1], 52:[1,0]}` — **six** blocks
> set without a paired clear, not five.

**`[0x0016]` is the current-area register.** 58 immediate writes across 47 of the 56 blocks, and
**57 of the 58 write the writing block's own id**. The single exception is `ECL1#21 0x8214`, which
writes `#32` — block 21 also self-writes `#21` at `0x8050`, so the `#32` site is an area *transition*
(21 → 32), exactly what an area register should do at a hand-off. Note this is the same address the
engine's dialect record already calls `lastBlockIdAddr` (`ECL_GEN1_SHORT_POOLS.lastBlockIdAddr = 22
= 0x0016`); a 57/58 self-write census is equally consistent with "current area" and with "last ECL
block id", and this leg does **not** claim to distinguish them. The nine blocks that never write
it are 4, 20, 35, 40, 55, 72, 84, 85, 86. `ECL1#16`'s `initial_entry` opens with the matching read
(`0x8014`, bytes `03 01 16 00 00 10 16 00`):

```
8014  COMPARE [0x0016], #16
801a  IF_EQ
801b  EXIT                     ; "already in area 16 — do not re-run entry"
```

**Naive-vs-reachable agreement.** For `[0x0004]`, `[0x0014]`, `[0x0028]`, `[0x0031]` and `[0x0016]`
the control-flow-free scan and the 83.9 %-coverage no-narrowing walk agree **exactly**, site count
and block set (13/13, 12/12, 17/17, 6/6, 58/58). `[0x0030]` does **not**: 16 naive vs 12 reachable.
The four naive-only sites are `ECL1#39` `0x900b`, `0x9565` and `ECL1#40` `0x85a9`, `0x8d64`, both
non-settlements under §1d, so the discrepancy cannot move the settlement set. It is disclosed as a
real, unexplained coverage gap rather than presented as agreement.

### 2a. Settlement set and what each one is

| blk | form | identity | map(s) | evidence |
| ---: | --- | --- | --- | --- |
| 16 | T1 | **Phlan**, the opening city | `GEO1#16` + `GEO1#17` | `0x806a "…I AM ROLF, PORTMASTER OF THIS FINE CITY…"`; `0x82db "…PHLAN HAS BECOME QUIET…"`; `0x8033 LOAD_FILES #16,#1`, `0x85dd`/`0x8816 LOAD_FILES #17,#1` |
| 24 | T1 | **Phlan**, later chapter | reuses `GEO1#16`/`#17` | `0x809c "YOU STAND ONCE AGAIN ON A PEACEFUL STREET IN PHLAN."`; `0x82cf LOAD_FILES #16,#1`, `0x8061`/`0x82e5 LOAD_FILES #17,#1` |
| 19 | T1 | **Zhentil Keep** | `GEO1#19` | `0x8098 "THE ZHENTARIM HAVE SEALED THE CITY."`; cell (3,4) `"DROW GUARD THE GATE TO ZHENTIL KEEP…"`; `0x81b5 "YOU PASS THROUGH THE WALL AND INTO MANSHOON'S TOWER."` |
| 26 | T1 | **Zhentil Keep**, later chapter | reuses `GEO1#19` (`0x8022 LOAD_FILES #19,#1`) | `0x8303 "THE HIGH IMPERCEPTOR HAS DECLARED THAT OUTSIDERS MUST PROVE THEMSELVES IN THE ARENA TO GAIN ACCESS TO MORE OF THE CITY."` |
| 27 | T2 | the **eight minor Moonsea towns** | none (menu) | §1d(T2); name table `0x8231`, arms `0x819a`–`0x8212` |
| 18 | T2 | Elminster's camp in Limbo — a service hub, **not a town** (§7 item 6) | `GEO1#18` | `0x8086 "YOU ARRIVE AT ELMINSTER'S CAMP IN LIMBO."` |

The `early` leg's proven dungeon `ECL1#72` (the Drow slave pens under Kalistes) is **not** in the
settlement set under either form — it has no service register write of any kind.

---

## 3. Phlan is two maps joined at Kuto's Gate

`ECL1#16` drives **two** GEO blocks, and `[0x00cf]` is the half-selector. At `0x87e3`:

```
87e3  COMPARE [0x00cf], #1
87e9  IF_NE / 87ea GOTO [0x880c]
87ee  SAVE #0, [0x00cf]
87f4  LOAD_FILES #16, #1          ; back to the civic half
…
880c  SAVE #1, [0x00cf]
8812  PARLAY #10 / 8815 DELAY
8816  LOAD_FILES #17, #1          ; through to the market half
```

bytes at `0x87e3`: `03 01 cf 00 00 01 17 01 01 0c 88 09 00 00 01 cf 00 21 00 10 00 01 …`.

The scripted first crossing, after the gate battle, is at `0x85dd`
(`21 00 11 00 01 09 00 05 01 35 00 09 00 00 01 34 00 09 00 01 01 11 00`):

```
85dd  LOAD_FILES #17, #1
85e2  SAVE #5, [0x0035]      ; Y = 5
85e8  SAVE #0, [0x0034]      ; X = 0
85ee  SAVE #1, [0x0011]      ; facing east
85fe  PRINTCLEAR "YOU MAKE IT THROUGH KUTO'S GATE."
```

so the market-half arrival pose is **(0, 5) facing east**, byte-read.

All 18 of `ECL1#16`'s signed establishments are placed across the two maps — **18 / 18, none
orphaned**: nine sign arms on `GEO1#16` (PASSENGER DOCK, CLOISTER OF TYR, TOWN HALL, TRAINING HALL,
TEMPLE OF SUNE, VALHEGEN PARK, TEMPLE OF TEMPUS, TEMPLE OF GOND, SUNRISE INN) and ten on `GEO1#17`
(VALHEGEN PARK again, OHLO'S MYSTIC DEVICES, OLD GUILD ARMORY, LAKESIDE INN, SPENDTHRIFT INN,
TROLL TOSS TAVERN, FORTUNES TOLD, SMITHY'S CHOICE, BOWYER'S SUPPLY, FINE CLOTHING). A script table
and a map table in two different files agree with no exceptions.

---

## 4. `search_location` in `ECL1#16`

Header (`parseEclHeader`, `ECL_GEN1_SHORT_POOLS`): magic 5000, `vm_run_1` `0x8750`,
`search_location` `0x88b4`, `pre_camp_check` `0x86be`, `camp_interrupted` `0x8707`,
`initial_entry` `0x8014`.

```
88b4  SAVE #0,  [0x0039]
88ba  SAVE #50, [0x001b]
88c0  AND  [0x002d], #63, [0x00bf]     ; 2f 01 2d 00 00 3f 01 bf 00
88c9  ON_GOTO [0x00bf], #53, …         ; 53 arms
```

Two facts follow directly from those bytes:

1. **There is no engine "town mode" in Pools.** A town is an ordinary stepped 16×16 grid whose
   descriptor byte selects one of 53 script arms. Said plainly: Pools' towns are maps with shops on
   them — the *only* thing that makes them towns is that the arms print signs and call the service
   ABI.
2. Pools masks **six** bits (`#63`), where Treasures masked seven (`#127`) and additionally tested
   bit 7. **Pools' `search_location` never reads bits 6–7 of the descriptor at all.** The strong
   sign/door correlation with bit 7 recorded in §5a is therefore an *authoring convention* whose
   host-side meaning is **UNLOCATED**, not an engine rule (§7 item 4).

Entry pose — **CORRECTED (2026-08-06), the guard is NOT elided**
(`0x8049` bytes `09 00 00 01 35 00 09 00 0f 01 34 00 09 00 03 01 11 00`):

```
8033  LOAD_FILES #16, #1
8038  SAVE #16, [0x0016]      ; area = 16
803e  COMPARE [0x0250], #0    ; <- THE GUARD
8044  IF_NE
8045  GOTO 0x854c             ; <- the OTHER entry
8049  SAVE #0,  [0x0035]      ; Y = 0
804f  SAVE #15, [0x0034]      ; X = 15
8055  SAVE #3,  [0x0011]      ; facing west
806a  PRINTCLEAR "'WELCOME HEROES. WE HAVE PROSPERED SINCE TYRANTHRAXUS WAS DEFEATED BY YOUR
                  KIND TEN YEARS AGO. I AM ROLF, PORTMASTER OF THIS FINE CITY…'"
```

`initial_entry` reaches the **(15, 0) facing west** pose at `0x8049` **only when the guard at
`0x803e` passes**, i.e. when `[0x0250] == 0`. `ECL1#16` carries a second entry at `0x854c`
(`COMPARE [0x00d3],#255 / IF_EQ / GOTO 0x85d7`, then at `0x855e`
`SAVE #11,[0x0035]` / `SAVE #14,[0x0034]` / `SAVE #3,[0x0011]`) — pose **(14, 11) facing west**, plus
a `SETUP_MONSTER #27` — for the non-zero case. **The identification of `[0x0250] == 0` with
a cold boot is an INFERENCE**; the pose bytes themselves are byte-read.

> **Correction (2026-08-06).** The first draft printed `0x8033` → `0x8038` → `0x8049` as consecutive
> and concluded "the party's first pose in the whole game is (15, 0) facing west", presenting a
> conditional as a straight line and an inference as a byte reading — in a document that promises to
> label inferences. The three instructions `0x803e` / `0x8044` / `0x8045` were elided.

### 4a. The service arms of `ECL1#16`, byte-exact

| service | vaddr | bytes | decoded |
| --- | --- | --- | --- |
| store | `0x90f5` | `09 00 01 01 04 00 09 00 10 01 28 00 3c 01 c0 00` | `SAVE #1,[0x0004]` ; `SAVE #16,[0x0028]` ; `PROTECTION [0x00c0]` |
| temple | `0x8dd9` | `09 00 01 01 14 00 24 09 00 00 01 14 00` | `SAVE #1,[0x0014]` ; `COMBAT` ; `SAVE #0,[0x0014]` |
| training | `0x8bcd` | `09 00 7f 01 30 00 38 00 00` | `SAVE #127,[0x0030]` ; `PROGRAM #0` |

Note Pools writes the flag **before** the price scale; Treasures writes the scale first. Same two
instructions, opposite order — a small, real dialect-of-authorship difference worth recording.

All three of Phlan's temples share that one `[0x0014]` site: arm 21 (Tempus, `0x8db0`) falls through
to it and arm 23 (Gond, `0x8dff`) reaches it via `0x8e3b GOTO [0x8dd3]`. That is why block 16 shows
only one set/clear pair for three temples.

**PROTECTION — corrected 2026-08-06.** 13 reachable `PROTECTION` (`0x3C`) sites in blocks
`{1, 16, 19, 21, 24, 26, 27}`: immediate operands `{1, 2, 3, 4, 5, 6, 10}` and **three** register
forms (`ECL1#1 0x841e` → `[0x00c2]`, `ECL1#16 0x9101` → `[0x00c0]`, `ECL1#24 0x9765` → `[0x00c0]`).
All immediates lie inside the 1–11 range the debug prompt states; the operand → stock-list mapping is
**UNLOCATED**. `ITEM0.DAX` holds a single 4578-byte block (id 1), so the operand is **not** an
`ITEM0` block id (§7 item 2).

> **Correction (2026-08-06).** The first draft wrote "operands actually used corpus-wide are `#1`–
> `#10` plus **two** register forms". Both numbers are wrong: the immediates are seven distinct
> values `{1,2,3,4,5,6,10}`, not the range 1–10 (7, 8 and 9 never appear), and there are **three**
> register forms, not two.

---

## 5. The walked town: Phlan, `ECL1.DAX#16` / `GEO1.DAX#16` + `GEO1.DAX#17`

### 5a. Signs, doors and the bit-7 convention

Connected components under the "wall slot 0, or any door flag" traversal rule:
`GEO1#16` = **242 / 8 / 2 / 2 / 1 / 1**, `GEO1#17` = **244 / 6 / 2 / 2 / 1 / 1**. Every entry pose,
every sign cell and every service door named below lies in its map's largest component.

| service | sign cell | sign desc | door cell | door desc | sign text (real `EclVm` output) |
| --- | --- | --- | --- | --- | --- |
| training hall | (6,3)/(7,3) `GEO1#16` | `0x0b` | (6,2)/(7,2) | `0xa7` | "A SIGN OVER THIS DOOR READS ' TRAINING HALL '" |
| Temple of Sune | (2,2)/(3,2) `GEO1#16` | `0x0d` | (2,1)/(3,1) | `0x8e` | "…' TEMPLE OF SUNE '" |
| Temple of Tempus | (3,12)/(4,12) `GEO1#16` | `0x14` | (3,13)/(4,13) | `0x95` | "…' TEMPLE OF TEMPUS '" |
| Temple of Gond | (7,13) `GEO1#16` | `0x16` | (7,14) | `0x97` | "…' TEMPLE OF GOND '" |
| Sunrise Inn | (11,11) `GEO1#16` | `0x18` | (12,11) | `0xb1` | "…' SUNRISE INN '" |
| Smithy's Choice | (9,4) `GEO1#17` | `0x26` | (9,3) | `0xa9` | "…' SMITHY'S CHOICE '" |
| Fine Clothing | (10,6) `GEO1#17` | `0x30` | (10,7) | `0x99` | "…' FINE CLOTHING '" |
| Bowyer's Supply | (4,11) `GEO1#17` | `0x2e` | (4,10) | `0xaf` | "…' BOWYER'S SUPPLY '" |
| Spendthrift Inn | (3,13) `GEO1#17` | `0x20` | (2,13) | `0xb2` | "…' SPENDTHRIFT INN '" |
| Lakeside Inn | (7,14) `GEO1#17` | `0x1f` | (8,14) | `0xb3` | "…' LAKESIDE INN '" |

Across both maps there are **25 placed sign cells**; **22 of them have exactly one orthogonally
adjacent cell whose descriptor has bit 7 set and a non-zero low-6 index** — the establishment's
door. The three exceptions are all **VALHEGEN PARK** ((3,6) and (3,10) on `GEO1#16`, (14,6) on
`GEO1#17`), whose "interior" descriptor `0x10` has bit 7 clear because a park has no door. The
sign/door low-6 numbers are *not* consecutive as a rule (6 of 14 pairs are `n`/`n+1`); the earlier
Treasures pattern does not carry over and is not asserted.

### 5b. Cross-check: the facing gates match the map geometry, 6 / 6

Six of the 53 arms open with `COMPARE [0x0011], #k / IF_NE / EXIT`:

| arm | gate | bytes | placed at | agrees with |
| ---: | --- | --- | --- | --- |
| 39 training hall | `#0` north | `03 01 11 00 00 00 17 00` @`0x8b9c` | `GEO1#16` (6,2),(7,2) | its signs (6,3),(7,3) are due **south** → the step onto the door is **north** |
| 49 Sunrise Inn | `#1` east | `03 01 11 00 00 01 17 00` @`0x8e52` | `GEO1#16` (12,11) | sign (11,11) is due **west** → the step is **east** |
| 50 Spendthrift Inn | `#3` west | `03 01 11 00 00 03 17 00` @`0x9139` | `GEO1#17` (2,13) | sign (3,13) is due **east** → the step is **west** |
| 51 Lakeside Inn | `#1` east | `03 01 11 00 00 01 17 00` @`0x9216` | `GEO1#17` (8,14) | sign (7,14) is due **west** → the step is **east** |
| 28 Stojanow River | `#0` north | `03 01 11 00 00 00 17 00` @`0x8f49` | `GEO1#16` (10,0); `GEO1#17` (4,0),(5,0),(6,0) | every placement is on row **y = 0**; facing north looks off the north edge, where the river is |
| 35 small lake | `#2` south | `03 01 11 00 00 02 17 00` @`0x9048` | `GEO1#17` (4,15),(5,15),(6,15) | every placement is on row **y = 15**; facing south looks off the south edge, at the lake |

The facing guard lives in `ECL1.DAX`; the sign placement and the wall/door geometry live in
`GEO1.DAX`. These are separately authored files with no shared index, and the agreement is **6 / 6
with no exceptions** — including the two scenery arms, which had no reason to line up and do.

### 5c. Two legal walks

**Civic half — `GEO1#16`, 44 steps from the cold-boot pose (15, 0).**

```
(15,0) →12→ (6,3)TRAINING sign →N→ (6,2)TRAINING HALL →S,…→ (2,2)SUNE sign →N→ (2,1)TEMPLE OF SUNE
       →…→ (3,12)TEMPUS sign →S→ (3,13)TEMPLE OF TEMPUS →…→ (11,11)SUNRISE sign →E→ (12,11)SUNRISE INN
```

35 open edges, 9 automatic doors, **0 solid walls, 0 bash/pick/knock doors**. En route it also
steps on the PASSENGER DOCK sign (11,2) and both VALHEGEN PARK signs (3,6), (3,10).

**Market half — `GEO1#17`, 34 steps from the Kuto's Gate arrival pose (0, 5).**

```
(0,5) →10→ (9,4)SMITHY sign →N→ (9,3)SMITHY'S CHOICE →…→ (10,6)CLOTHING sign →S→ (10,7)FINE CLOTHING
      →…→ (4,11)BOWYER sign →N→ (4,10)BOWYER'S SUPPLY →…→ (3,13)SPENDTHRIFT sign →W→ (2,13)SPENDTHRIFT INN
```

27 open edges, 7 automatic doors, **0 solid walls, 0 bash/pick/knock doors**. En route it steps on
the Councilmember cell (0,4) and the FORTUNES TOLD sign (3,4).

Every step was checked against the block's own wall and door planes. No step requires an item, a
spell, a skill check or a prior flag. The full ordered step lists with per-step
`(dir, x, y, wall, door, descriptor)` are asserted in the golden test.

### 5d. Real-`EclVm` dispatch at every service cell

Run through `dialogueForCell(ECL1#16, <GEO descriptor>, { dialect: ECL_GEN1_SHORT_POOLS })`:

* (6,2) facing north → `say` "'WOULD YOU LIKE TO TRAIN?'" `["YES","NO"]`; **YES** writes
  `[0x0030] = 127` and emits a `program` effect with `programId 0`.
* (2,1) → `say` "'WELCOME. DO YOU DESIRE THE MINISTRATIONS OF SUNE?'"; **YES** yields a
  `kind: 'combat'` turn with **`monsters: []`** and `[0x0014] = 1` — the flagged empty-roster host
  call the debug block labels TEMPLE.
* (3,13) → "'DO YOU WISH HEALING?'"; (7,14) → "'DO YOU WISH TO INVOKE THE POWERS OF GOND
  WONDERMAKER?'" — both the same empty-roster COMBAT with `[0x0014] = 1`.
* (9,3) `GEO1#17` facing north → "'WILL YOU BUY?'"; **YES** writes `[0x0004] = 1` and
  `[0x0028] = 16`, then "'THANK YOU AND GOOD DAY.'"
* (10,7) → "'GOOD DAY. I HAVE JUST THE THING TO COMPLETE YOUR OUTFIT. CAN I SHOW YOU?'";
  (4,10) → "'WELCOME. CAN I INTEREST YOU FINE FOLK IN SOMETHING?'" — both write
  `[0x0004] = 1`, `[0x0028] = 16`.
* (12,11) facing east → "THIS IS A QUIET INN AND YOU ARE OFFERED FREE ACCOMMODATIONS."
  (2,13)/(8,14) `GEO1#17` → "'WELCOME. THE COMMON ROOM IS FREE.'" — **corrected 2026-08-06:**
  Phlan's three inns emit **no PROGRAM / COMBAT / PROTECTION effect and write no service marker**
  (they *do* emit `print` / `picture` / `partyStrength` effects). They present no menu, so the
  YES/NO negative control below is **vacuous for them**; the control is meaningful only at the seven
  gated services, where the choice list is literally `["YES","NO"]`.
* (0,4) `GEO1#17` → "A WOMAN, GUARDED BY A MILITARY ESCORT STEPS FORWARD AT YOUR APPROACH. 'I AM
  COUNCILMEMBER …'" — town NPC dialogue, not a dungeon event.
* A plain street cell (descriptor `0x00`) → empty `end` turn, no text. The dispatch is
  descriptor-driven, not blanket.

**Negative control.** Re-running each of the **seven gated services** and answering **NO** leaves
`[0x0004]`, `[0x0014]`, `[0x0028]`, `[0x0030]` and `[0x0031]` all *unwritten*, with zero
program/combat/protection effects. Independently instrumented and genuine: the choice list really is
`["YES","NO"]`, `NO` is really matched (not a silent index-0 fallback), and the prompt text is
identical either way. Without it the YES assertions could not distinguish a real acceptance gate from
an unconditional write. Verified and asserted in the golden test.

> **Correction (2026-08-06).** The first draft described the three inns as producing "NO effects".
> That was a test-harness property overread as a retail property: the golden's `runCell` callback
> records only effect types `program`, `combat` and `protection` and discards everything else.
> Instrumenting the same cells with an unfiltered recorder gives `[print, partyStrength]` at Sunrise
> Inn and `[picture, print, partyStrength]` at Spendthrift / Lakeside. The substantive point — no
> PROGRAM/COMBAT/PROTECTION effect and no service marker — is unchanged; the wording was false. The
> control is **vacuous** for the inns because they present no menu at all (YES and NO produce
> byte-identical output there).

**Honest negative result:** Phlan's three inns do **not** run `PROGRAM #9`. `ECL1#16`'s inn arms
are narration only (`0x8e5a`, `0x9141`) — resting in the home city is free. The metered `PROGRAM #9`
rest service exists in this title, but in `ECL1#1` (debug CAMP), `#17`, `#18`, `#24`, `#25` and
`#27`, not in the walked block. An earlier draft of this analysis assumed a paid inn on the
Treasures model; the VM refuted it and the corrected reading is what appears here.

---

## 6. Verdict

The `town` leg is **proven**. Pools of Darkness ships six settlement script blocks out of 56,
identified by two byte-identifiable town mechanisms of its own — the "A SIGN OVER THIS DOOR READS"
establishment idiom (blocks 16, 19, 24, 26) and the service-menu idiom (blocks 18, 27) — with the
underlying service ABI *labelled by the game's own shipped debug block* rather than inferred from a
sibling title. Phlan (`ECL1#16`) spans two 16×16 maps joined at Kuto's Gate; all 18 of its named
establishments are placed on them; two full walls-and-doors-legal walks (44 + 34 steps, zero solid
walls, zero locked doors) reach a training hall, three temples, three shops and three inns, and the
real `EclVm` produces the retail prompts and the retail host-flag writes at each of them. Six
independent ECL-side facing gates agree with six GEO-side geometries.

---

## 7. What this does NOT establish

Read this section before citing anything above.

1. **No Pools `GAME.EXE` / `GAME.OVR` disassembly was done for this leg.** The host-side meaning of
   `[0x0004]`, `[0x0014]`, `[0x0028]`, `[0x0030]`, `[0x0031]` rests on `ECL1#1`, a **debug script**.
   That is far stronger than the CoAB-analogy inference Treasures had to use, but it proves author
   intent, not native code. A `GAME.OVR` trace could still rename any of them. **(inference)**
2. **`PROTECTION` (0x3C) operands are not resolved to stock lists.** The debug block states the
   valid range is 1–11 and that the operand is a "STORE NUMBER"; the operand → merchant inventory
   mapping is **UNLOCATED**. `ITEM0.DAX` has a single block (id 1), so the operand is not an
   `ITEM0` block id.
3. **`packages/engine/src/ecl/vm.ts` treats opcode 0x3C as a no-op.** The engine therefore never
   surfaces shop stock as an effect. This is a real engine gap; it is disclosed here and
   deliberately **not** fixed by this leg, whose file ownership is limited to this doc and its
   golden test.
4. **Bits 6–7 of the GEO descriptor byte are never read by Pools' `search_location`** (it masks
   `#63`). The observed 22/25 sign→bit-7-door correlation is an **authoring convention**; whether
   the host engine consumes bit 7 (as Treasures' `search_location` did, for `[0x0053]`) is
   **UNLOCATED**.
5. **The `[0x0030]` marker does not agree naive-vs-reachable** — 16 raw sites, 12 reachable. The
   four naive-only sites (`ECL1#39` `0x900b`/`0x9565`, `ECL1#40` `0x85a9`/`0x8d64`) are real bytes
   the 83.9 %-coverage walk does not reach. They lie in blocks the discriminator rejects anyway, so
   they cannot move the settlement set, but the gap is unexplained.
6. **`ECL1#18` is a settlement on mechanism only.** Its own narration calls it "ELMINSTER'S CAMP IN
   LIMBO"; it is a demiplane service hub with heal/train/storage/rest, not a town in the colloquial
   sense. It is included because the discriminator is mechanical and excluding it would be a
   judgement call dressed as evidence. Likewise `ECL1#27` is one script serving eight named towns,
   so "six settlement blocks" is not "six settlements" — the *places* number at least thirteen.
7. **Block 24 has 18 establishment-name writes but only 17 chain to its sign printer.** The
   `SMITHY'S CHOICE` write at `0x9a60` does not. Unexplained; it does not affect block 24's
   classification, which 17 chained names already settle.
8. **The reachability walk covers 83.9 % of ECL1 bytes, not 100 %.** The remainder is data tables
   and unreached code. A sign-idiom instance hiding in the uncovered 16 % could only *add* blocks to
   the settlement set; it cannot remove one. The naive scan used for the §1d sign census and the §2
   marker census reads 100 % of the bytes.
9. **The `[0x0011]` = facing and `[0x0034]`/`[0x0035]` = X/Y identifications are corroborated, not
   independently re-derived here.** They rest on the written-value domains (0–3 and 0–15), the entry
   poses of §3/§4, the §5b facing-gate agreement, and the already-recorded low-address family map in
   `docs/engine/research/combat-trigger-c4.2b-2b-2b.md` and `dqk-duel-setup-dispatch.md`. Pools has
   no overland spawn table of the Treasures kind to score X-versus-Y against.
10. **Blocks 17 and 25 are asserted here only as *not settlements*.** Characterising what they
    positively are — Moonsea overland/wilderness maps — is left to the `wilderness` leg, which owns
    that question. This leg's claim is limited to the byte fact that their service idioms sit
    downstream of a `RANDOM` roll inside an encounter table.
11. **No live execution of any kind.** Static retail bytes plus this repo's own clean-room `EclVm`.
    No DOSBox-X session was involved, so nothing is claimed about what the retail DOS binary renders
    on screen.
12. **The SETTLEMENT SET is not established as a semantic fact** (added 2026-08-06). The four-block
    T1 result is a **mechanism census** whose boundary excludes `ECL1#21`'s map-placed
    `"A SIGN OVER THE DOOR READS, 'THE TWISTED HORN.'"` (arm 30, `GEO1#21` (8,8) desc `0x1e`) on
    narrative and authoring-mechanism grounds, not on the absence of a named signed establishment.
    `ECL1#67` carries `"A SIGN READS 'THE MANUFACTORY OF MOANDER.'"` likewise. What is proven is
    the mechanism boundary, not a semantic one.
13. **The T1 chain adds no block-selection power over a one-string scan** (added 2026-08-06). See
    the §1d correction: `{16, 19, 24, 26}` falls out of the printer string alone.
14. **The Pools word-set dialect overrides are not load-bearing for this leg** (added 2026-08-06).
    Only `cellDescAddr = 0x002d` is. See the §0 disclosure.

---

## 8. The live browser route (2026-09-02)

`GameData['pools-town']` (`apps/web/src/ui/gameData.ts`) mounts Phlan's civic half — `ECL1.DAX#16` /
`GEO1.DAX#16` — through the engine's ordinary generic dispatch. **No changes to `explore.ts` or
`gen1Profiles.ts` were needed**: `startExplore()`'s existing `loadDungeon` + `dialogueForCell`
machinery, with `eclDialect: 'gen1-short-pools'` (`facingAddr: 0x0011`, `cellDescAddr: 0x002d`)
already wired for the plain `pools`/`pools-natural` profiles, walks and dispatches this route
unmodified — the same "town needs no new explorer code" precedent `treasures-town`'s own GameData
comment records. `startPose` is asserted directly from case J's cold-boot guard rather than derived
by running the VM (see the comment on the `GameData` entry) — the same honest-gap convention the
plain `pools` profile already discloses.

### 8a. How this was driven (disclosure)

`main.ts`'s `?explore=` dispatcher is a hand-maintained ternary chain and does not yet recognise the
`pools-town` token — wiring it in is Phase B's one-line change (§8d), out of this leg's file
ownership. The route was therefore driven through a throwaway Playwright/puppeteer harness (deleted
after use, not part of the repo) that booted the plain app root (`__rendered === 0`) and called the
**real, unmodified** exported `startExplore('pools-town')` directly via Vite's dev-server ESM graph
(`await import('/src/ui/explore.ts')`), then used the existing generic e2e seams
(`window.__explore.getPose/move/areaMemory/lastEvent/blocked`, `window.__dialogue.open/kind/text/
choices/choose/close`) exactly as `apps/web/test/e2e.mjs` does. This exercises the same production
code path Phase B's dispatcher line will route to — it is **not** a stand-in or a host model of the
route; it is the real module. What it does not exercise is `main.ts`'s own dispatcher line itself
(that line does not exist yet) and the URL/query-string entry point.

### 8b. Both arms, actually observed

**YES arm** — fresh mount, cold-boot pose `(15,0) facing west`, walk all 44 civic steps answering
YES at the training-hall door and NO everywhere else gated:

* `graphicsAvailable() = ['DOS-EGA','Amiga']`; walk completed with **zero blocked steps**, landing
  exactly at `(12,11) facing east` (the Sunrise Inn door) — `blocked: null`.
* auto-door count over the 44-step table: **9** (matches case L's `civic.autoDoors===9` exactly).
* plain street `(9,3)`: `lastEvent()` is the empty string.
* training sign at `(6,3)` facing north: `"A SIGN OVER THIS DOOR READS ' TRAINING HALL '"`.
* training door `(6,2)`: dialogue text `"'WOULD YOU LIKE TO TRAIN?'"`, choices `["YES","NO"]`;
  choosing YES leaves `areaMemory(0x0030) === 127` (`TRAIN_MASK`).
* zero console errors throughout.

**NO arm (negative control)** — independent fresh reload/mount, walked only the 13 steps to the
training door and answered NO there:

* dialogue text at `(6,2)` is **byte-identical** to the YES arm's: `"'WOULD YOU LIKE TO TRAIN?'"`
  (same string, captured from `walk.spoke`, not assumed).
* `areaMemory(0x0030) === 0` after NO — the browser's own "unwritten reads back as 0" `Map`
  convention (the engine-level golden asserts `toBeUndefined()` for the same fact; the browser seam
  coerces through `Map.get(...) ?? 0`, so `0` here *is* "never written", not a written zero).
* zero console errors.

Both arms were driven and observed independently (two separate page loads), matching the project's
"both arms or it is not evidence" standard.

### 8c. Mutations (each watched failing under a named change, then restored)

All three ran against the **same real module and seams** as §8b, only the harness's own expectation
or setup was mutated — the production code was never touched:

1. **Force YES where the NO arm is expected.** Re-ran the NO-arm walk but answered YES at the
   training door. `areaMemory(0x0030)` came back `127`, not the `0`/undefined the NO-arm assertion
   requires → **red** (`assertionWouldPass: false`). Confirms the NO arm's `0` is not a tautology the
   harness would report regardless of the actual answer.
2. **Drop the last step of the 44-step walk.** Ran only 43 steps. Final pose was `(11,11) facing
   east`, not the required `(12,11) facing east` → **red**. Confirms the end-pose assertion actually
   discriminates a real position, not merely "the walk didn't crash."
3. **Pre-seed `[0x0030]` via a real YES, then revisit and answer NO.** First visit answers YES
   (`TRAIN_MASK` → 127 for real, via the engine, not injected), then the same page re-approaches the
   training door and answers NO. `TRAIN_MASK` stayed `127` (a written flag is never cleared by a
   declined revisit) → **red** against a same-run "NO leaves it unwritten" assertion. Confirms the
   NO-arm check is reading live state, not a value the harness fabricated once and reused.

All three mutations were reverted before the next run; the corresponding non-mutated harness runs in
§8b are the restored/green baseline behind these numbers.

### 8d. LOAD_PIECES status: genuinely never called — Phlan runs on the fallback bank

`dungeon.pieces.setBlockIds` after mounting `pools-town` reads `[1, 255, 255]` — identical to
`GameData['pools-town'].eclFallbackPieces`. That equality is ambiguous on its own (a real
`LOAD_PIECES(1, 0xff, 0xff)` call would look the same), so it was disambiguated directly: importing
`@goldbox/engine` in the browser and running `new EclVm(ECL1_block16, { dialect:
ECL_GEN1_SHORT_POOLS }).run()` in isolation returns effects
`['loadFiles', 'picture', 'print', 'menu']` — **no `loadPieces` effect at all**. `ECL1#16`'s
`initial_entry` genuinely never calls `LOAD_PIECES`; `loadDungeon`'s `?? opts.fallbackPieces` path
(`packages/engine/src/world/dungeon.ts`) is what supplies `[1,0xff,0xff]` here, exactly the same
"init block emits LOAD_FILES but never its own LOAD_PIECES" situation that function's own doc
comment already names for Treasures' wilderness-encounter scripts. This is a genuine, disclosed gap
in what this route's `LOAD_PIECES` provenance is — not a bug: block 16 relies entirely on whatever
wall-art bank the fallback triple selects, same as every other Pools GameData entry.

### 8e. Pixel-diff measurement (DOS-EGA vs Amiga wall art)

At the cold-boot pose, `window.__explore.graphicsChecksum()` differs between graphics modes:
DOS-EGA = `778480456`, Amiga = `3064018344` — **non-zero pixel difference**.
`graphicsProvenance()` reports exactly one category for this route, `"wall bricks (shared bank)"`
(Phlan's `DungeonWalls` is a `singleBank`, like DoK/other Pools areas), and that category resolves
**wholly** to whichever set is active (`source: 'DOS-EGA'` or `source: 'Amiga'`, never `'mixed'`) —
so the Amiga wall bank genuinely covers this route's tiles, not a partial fallback masquerading as a
full swap. Per the round plan: since this measurement is **greater than zero**, Phase B's
`explore-pools-graphics-switch` case should be repointed at `pools-town` (or a route reachable
through it) rather than skipped.

### 8f. What remains host-modelled / not independently driven here

* The temple's `combat` effect with `monsters: []` (case N, §5d above) and the training door's
  `program#0` effect are established at the engine/`DialogueRunner` layer (`poolsTownRoute.test.ts`
  cases M/N/O) but were **not** independently re-driven through the browser in this leg beyond the
  `TRAIN_MASK` write §8b already captures. The browser probe does not open a combat screen or a
  training UI at these cells — there is no such screen wired for Pools yet, and asserting one would
  be inventing UI behaviour this repo has not built. Stated here explicitly per the round's "modelling
  must never read as observation" instruction: the byte-level effect is proven; a rendered
  combat/training screen for it is not.
* `main.ts`'s dispatcher line and the `?explore=pools-town` URL entry point itself were not driven
  (§8a) — only the module `startExplore` reaches, which is what that line will call.
* `apps/web/test/e2e.mjs` was not edited this phase (out of scope); §8g below is the case ready to
  paste in once Phase B lands the dispatcher token.

### 8g. Ready to paste (NOT applied) — `apps/web/test/e2e.mjs`

Modelled directly on `runExploreTreasuresTownServices`/`runExplorePoolsGraphicsSwitch`'s own
conventions (route table shape, `settle`/`walkRoute` pattern, negative control via a fresh mount):

```javascript
// Phlan's civic block (`ECL1.DAX#16`/`GEO1.DAX#16`) — see docs/engine/research/pools-town-route.md
// §5, §8. 44-step civic walk from the cold-boot pose (15,0) facing west to the Sunrise Inn door
// (12,11) facing east; asserts the training-hall sign + service prompt, TRAIN_MASK on YES, and a
// same-prompt NO negative control leaving TRAIN_MASK unwritten.
const ROUTE_CIVIC = [
  ['west', 14, 0, 0], ['west', 13, 0, 1], ['south', 13, 1, 0], ['west', 12, 1, 0], ['west', 11, 1, 0],
  ['south', 11, 2, 1], ['south', 11, 3, 0], ['west', 10, 3, 0], ['west', 9, 3, 0], ['west', 8, 3, 0],
  ['west', 7, 3, 0], ['west', 6, 3, 0], ['north', 6, 2, 1], ['south', 6, 3, 1], ['west', 5, 3, 0],
  ['north', 5, 2, 0], ['west', 4, 2, 0], ['west', 3, 2, 0], ['west', 2, 2, 0], ['north', 2, 1, 1],
  ['east', 3, 1, 0], ['south', 3, 2, 1], ['south', 3, 3, 0], ['south', 3, 4, 0], ['south', 3, 5, 0],
  ['south', 3, 6, 0], ['south', 3, 7, 0], ['south', 3, 8, 0], ['south', 3, 9, 0], ['south', 3, 10, 0],
  ['south', 3, 11, 0], ['south', 3, 12, 0], ['south', 3, 13, 1], ['north', 3, 12, 1], ['east', 4, 12, 0],
  ['east', 5, 12, 0], ['east', 6, 12, 0], ['east', 7, 12, 0], ['east', 8, 12, 0], ['east', 9, 12, 0],
  ['east', 10, 12, 0], ['north', 10, 11, 0], ['east', 11, 11, 0], ['east', 12, 11, 1],
];
const TRAIN_DOOR = { x: 6, y: 2 };
const TRAIN_MASK = 0x0030;

async function runExplorePoolsTownServices(page) {
  await page.goto(`${BASE}/?explore=pools-town`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !!window.__explore, { timeout: 30000 });

  // YES arm: walk the full route, answering YES at the training door and NO at every other gate.
  const yes = await walkRoute(page, ROUTE_CIVIC, (x, y) => (x === TRAIN_DOOR.x && y === TRAIN_DOOR.y ? 'YES' : 'NO'));
  assertPose(yes.pose, { x: 12, y: 11, facing: 'east' }, 'pools-town civic walk end pose');
  assertEqual(yes.spoke.filter((s) => s.x === TRAIN_DOOR.x && s.y === TRAIN_DOOR.y)[0]?.text,
    "'WOULD YOU LIKE TO TRAIN?'", 'pools-town training prompt');
  assertEqual(await page.evaluate((a) => window.__explore.areaMemory(a), TRAIN_MASK), 127,
    'pools-town TRAIN_MASK after YES');

  // Negative control: fresh mount, walk only to the training door, answer NO.
  await page.goto(`${BASE}/?explore=pools-town`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !!window.__explore, { timeout: 30000 });
  const no = await walkRoute(page, ROUTE_CIVIC.slice(0, 13), () => 'NO');
  assertEqual(no.spoke.find((s) => s.x === TRAIN_DOOR.x && s.y === TRAIN_DOOR.y)?.text,
    "'WOULD YOU LIKE TO TRAIN?'", 'pools-town training prompt (NO arm, same text)');
  assertEqual(await page.evaluate((a) => window.__explore.areaMemory(a), TRAIN_MASK), 0,
    'pools-town TRAIN_MASK after NO (unwritten)');
}
```

Register it as `explore-pools-town` in `e2e.mjs`'s runner map **and** in the `GB_E2E_ONLY` registry
(both lists — see `CLAUDE.md`'s note on `e2e-case-coverage`), using this repo's own
`walkRoute`/`settle`/`assertPose`/`assertEqual` helpers rather than the ad hoc versions the
throwaway probe used.

### 8h. Ready to paste (NOT applied) — `apps/web/src/ui/main.ts`

One line in the existing `?explore=` ternary chain (next to the other `-town` suffix entries):

```javascript
ev === 'pools-town' ? 'pools-town' :
```

### 8i. Gate results (this leg, 2026-09-02)

* `pnpm -r exec tsc --noEmit` — clean, no output.
* `pnpm build:app` — succeeded; only the two pre-existing tolerated warnings (placeholder `C:/...`
  path, missing `Death Knights of Krynn/SAVE/CHRDATA1.EFF`).
* `pnpm --filter @goldbox/engine test` — 230/231 files, 2638/2639 tests passed. The one failure,
  `test/dungeonWallsAmigaDok.test.ts`, is unrelated: it is a concurrent in-flight edit from a sibling
  round agent (DoK Amiga wall-bank retraction), not touched or caused by this leg (`gameData.ts` was
  this leg's only functional diff).
* `pnpm --filter @goldbox/web e2e` and `pnpm test:corpus` were **not** run this phase, per this
  round's explicit scope.
