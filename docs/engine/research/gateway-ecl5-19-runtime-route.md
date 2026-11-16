# Gateway ECL5#19 runtime route

Continues the P3.3 leaf in `docs/engine/BUILD-QUEUE.md` ("Prove Gateway's natural combat/resume
and persistent route"). The interaction gate is already statically decoded: Gateway `ECL5.DAX`
block 19 byte-decodes a `FIGHT` / `LEAVE` menu, zero-based choice `0` (`FIGHT`) dispatches to a
`LOAD_MONSTER` roster `4,3,4`, then reaches `COMBAT 0x8C34`. `docs/engine/research/gateway-
operand-parser-execution-probe.md` had already shown, by arming a **code-execution** breakpoint,
that Gateway's ECL operand parser never runs during silent startup. This doc asks the
complementary **file-I/O** question (does the loader ever even *open* `ECL5.DAX`?) and separately
deepens the **static** decode of the FIGHT/LEAVE route down to raw opcode bytes. The 2026-07-16
negative result below is retained as historical startup evidence; the campaign route was finally
reached and promoted on 2026-07-29. Two 2026-08-02 sections were then added: a full static
descriptor map of block 19 (which corrects where this route's persistence checkpoint can legally
live), and the previously undocumented native artifact set that backs the 2026-07-29 arrival half.

## Block-19 descriptor map, and why the persistence checkpoint hangs off 122 (2026-08-02)

Everything in this section was re-derived this round directly from the retail GOG install at
`C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier`, with the repo's own
helpers (`goldbox_corpus.read_dax_blocks`; `gen1_ecl_encounter_scan.header_entries`/`decode_one`/
`successors` under `word_sets_for_profile('gateway-to-the-savage-frontier')` = `{29:0, 33:3, 34:0,
44:1}` and addend `0x8000`; `find_geo_path.decode_edges`/`decode_descriptors`/`find_path`),
independent of any cached JSON. `ECL5.DAX` block 19 is 6606 raw bytes; dialect
`ECL_GEN1_SHORT_GATEWAY`; virtual base `0x7FFE`, so `offset = vaddr - 0x8000 + 2`. Its header names
`initial_entry` at `0x8014`, `search_location` at `0x8127`, `pre_camp_check` at `0x8386`,
`camp_interrupted` at `0x83BA` and `vm_run_1` at `0x81C3`.

### The two dispatch tables

`search_location` at `0x8127` is short enough to quote whole — five instructions, then the two
dispatch tables:

```text
0x8127  SAVE      [0x4C02], [0x4C01]            ; size 7
0x812E  AND       #127, [0xC04F], [0x4C02]      ; size 9
0x8137  COMPARE   [0x4C02], #121                ; size 6
0x813D  IF_GE                                   ; size 1
0x813E  GOTO      [0x819F]                      ; size 4
0x8142  ON_GOTO   [0x4C02], #29, <29 targets>   ; size 93
0x819F  SUBTRACT  #121, [0x4C02], [0x7F79]      ; size 9
0x81A8  ON_GOTO   [0x7F79], #7, <7 targets>     ; size 27
```

Two semantics here are taken from the CoAB decompile rather than assumed. Gen1 `SAVE` is
(source, dest) with the destination as the **last** operand
(`coab_extracted/engine/ovr003.cs` `CMD_Save`/`CMD_AddSubDivMulti`, `location = gbl.cmd_opps[3]`),
so `0x8127` copies `[0x4C02]` **into** `[0x4C01]` — it stashes the *previous* cell's descriptor
before `0x812E` overwrites `[0x4C02]` with the current one. `ON_GOTO` is 0-based and falls through
when out of range (`ovr003.cs` `CMD_OnGotoGoSub`, `cmd_opps[var_1 + 1]`), and `SUBTRACT` computes
`val_b - val_a` into the third operand, so `[0x7F79] = descriptor - 121`. Table 1 index 18 is
`0x8BE9`; table 2 index `122-121 = 1` is `0x95D1`.

The `0xC04B`/`0xC04C`/`0xC04D`/`0xC04F` register identities are title-local, not borrowed from
CoAB. Gateway's own `GAME.OVR` read-side dispatcher at flat file offset `0xA552` decodes as
`3d 4b c0 / 75 09 / a0 00 85` (X ← `[0x8500]`), `3d 4c c0 -> a0 01 85` (Y), `3d 4d c0 -> a0 02 85 /
30 e4 / d1 e8` — that trailing `SHR AX,1` is what proves `0xC04D` is the half-direction ordinal
(0=N, 1=E, 2=S, 3=W) — `3d 4e c0` and `3d 4f c0` for wall type and cell descriptor. The word
`0xC04B` occurs exactly twice in Gateway's `GAME.OVR` (`0xA3C3` write-side triage, `0xA552`
read-side dispatcher), matching DoK's documented shape.

`GEO5.DAX` block 19 is exactly 1026 bytes, 16×16, `index = y*16 + x`, descriptor plane masked
`&127`. Its complete descriptor histogram (256 cells, nothing at all in 29..120, so table 1 never
accidentally falls through into the `0x819F` arm):

| Descriptor | Cells | Handler | What it does on cold memory |
| ---: | ---: | --- | --- |
| `0` | 161 | `0x83DA` | `COMPARE [0x4C27],#15 / IF_NE / GOTO 0x83F3` → `RANDOM #100 -> [0x7F7F]` / `COMPARE [0x7F7F],#6` / `IF_GE` / `EXIT`. Roll < 6 fights OGRES (`MON5CHA` 26) or ZHENTIL GUARDS (`MON5CHA` 4). **Not inert.** |
| `1` | 45 | `0x83D2` | `COMPARE [0x4C27],#15 / IF_EQ / EXIT`; on cold memory the guard fails, the `EXIT` is skipped and it falls straight into descriptor 0's body. **Not inert.** |
| `2`, `22`, `24`, `25` | 11, 1, 1, 1 | `0x848B`, `0x909A`, `0x91CF`, `0x92F7` | `COMPARE [0x4C27],#15 / IF_NE / EXIT` — genuinely inert until the endgame word is 15 |
| `5`, `7`, `11`, `17`, `27` | 1 each | `0x86AC`, `0x878A`, `0x8933`, `0x8B72`, `0x9452` | pure `PRINTCLEAR`/`PRINT`/`EXIT` flavour text |
| `6` @ (0,11) | 1 | `0x8741` | "DO YOU NEED WEAPONS?" + `CALL [0x080C]` yes/no gate, then `TREASURE` + `COMBAT 0x8785` (shop trapdoor, no `LOAD_MONSTER`) |
| `10` @ (1,11) | 1 | `0x88E2` | "ITEMS FOR SALE!" + `CALL [0x080C]` gate, then `TREASURE` + `COMBAT 0x892E` (same shape) |
| `14` @ (2,2) | 1 | `0x8AC0` | `COMBAT 0x8AEB`, **unconditional** |
| `16` @ (14,11) | 1 | `0x8B4E` | `COMBAT 0x8B6D`, **unconditional** |
| `18` @ (9,8) | 1 | `0x8BE9` | tavern `FIGHT`/`LEAVE` → `LOAD_MONSTER(4,3,4)` ZHENTIL FIGHTER ×3, `COMBAT 0x8C34`. **No consumed flag** |
| `21` | 4: (13,8),(12,9),(14,9),(13,10) | `0x8CC8` | contains `COMBAT`, gated behind `[0x4C27] == 15`; inert on cold memory |
| `121` @ (15,2) | 1 | `0x9506` | one-shot table-2 entry; its `COMBAT` is also behind the `[0x4C27] == 15` endgame gate |
| `122` @ (6,14) | 1 | `0x95D1` | one-shot; guard + self-mark `[0x4C6C]`, then `LOAD_MONSTER(42,3,42)` GRIFFON ×3, `COMBAT 0x9686` |
| `123`..`127` @ (15,7),(12,0),(7,3),(1,0),(13,3) | 1 each | `0x968B`, `0x96E8`, `0x9750`, `0x97E3`, `0x9852` | the remaining table-2 set pieces; each reaches `COMBAT`. Their individual guards were **not** re-derived this round and are not characterised here |
| `8`, `9`, `12`, `13`, `15`, `19`, `20`, `23`, `26`, `28` | 4, 1, 1, 2, 1, 1, 2, 1, 1, 1 | `0x882F`, `0x8889`, `0x898B`, `0x8A4D`, `0x8AF0`, `0x8C39`, `0x8C81`, `0x9122`, `0x93B4`, `0x9483` | remainder of table 1 that actually occurs on the map; none of them reaches `COMBAT` on cold memory |
| `3`, `4` | 0 | `0x86AA`, `0x86AB` | have table-1 entries but occur on **no** cell of `GEO5#19` |

Two corrections to earlier summaries of this map, both material:

- Descriptors `0` and `1` are **not** inert. They are the two most-crossed cells on both walk legs
  and each runs the wandering-monster roll above. Per CoAB `CMD_Random` (`rand_max=100`, then
  `if (rand_max < 0xff) rand_max++`) the range is 0..100 inclusive, so a uniform host fights on 6
  of 101 outcomes (~5.9%) per rolling cell; the two legs cross about ten of them. The web host
  seeds the roll per cell (`runStepEvent` seed = `0x1000 + cellIndex`, `apps/web/src/ui/
  explore.ts:2174`), so it is reproducible rather than flaky — but any assertion on this route has
  to tolerate a wandering fight explicitly, which is what `drainGatewayWanderingEncounter` in
  `apps/web/test/e2e.mjs` exists for.
- The `COMBAT`-reaching set is larger than `{14, 16, 18}`. It is `{0, 1, 6, 10, 14, 16, 18, 122}`
  live on cold memory, plus `{21, 121}` behind the endgame gate and `{123..127}` in table 2. `6` and
  `10` sit one cell south and south-east of the arrival cell `(0,10)`; the published legs never dip
  to `y=11`, so they are safe as written, but they belong on the blocked set for any re-plan.

Note also that `6`, `10`, `14` and `16` use `COMBAT` as the retail shop/temple trapdoor
(`CLEARMONSTERS` then `COMBAT` with the `[0x7F6C]=1` shop flag or `[0x7EE2]=1` temple flag and no
`LOAD_MONSTER` at all), not as a monster fight.

### The correction: descriptor 18 cannot carry a persistence checkpoint

Descriptor 18 is the encounter this doc has cited since 2026-07-16, and it is the right encounter
for the *choice* and *tactical-board* checkpoints. It is the wrong one for *persistence*, because
its post-combat path writes nothing that survives:

```text
0x8BE9  SAVE            #8 -> [0x7EE1]              ; 6   portrait scratch
0x8BEF  PICTURE         #6                          ; 3
0x8BF2  SAVE            #255 -> [0x7EE1]            ; 6
0x8BF8  PRINTCLEAR      len=12                      ; 15  'WHAT'LL IT BE?'
0x8C07  HORIZONTAL_MENU [0x7F79], #2, FIGHT, LEAVE  ; 18
0x8C19  ON_GOTO         [0x7F79], #2, 0x8C25, 0x8277; 12
0x8C25  CLEARMONSTERS                               ; 1
0x8C26  SETUP_MONSTER   #255, #0, #255              ; 7
0x8C2D  LOAD_MONSTER    #4, #3, #4                  ; 7   MON5CHA block 4 "ZHENTIL FIGHTER" x3
0x8C34  COMBAT                                      ; 1
0x8C35  GOTO            [0x8277]                    ; 4
```

The only words touched anywhere on that path are the `[0x7EE1]` portrait scratch and the `[0x7F79]`
menu result. `GOTO 0x8277`'s tail redraws and leaves (`0x826E CALL [0x2E10]`; `0x8272 EXIT`). The
event therefore **re-arms on every revisit** — which matches the retail behaviour already recorded
in the 2026-07-29 section above, and means descriptor 18 can never demonstrate a consumed-state
checkpoint no matter how it is driven.

Descriptor 122 can, byte-exactly. It is the only cell on this map re-derived this round that guards
itself on a word and marks that word before the fight:

```text
0x95D1  COMPARE       [0x4C6C], #1     ; 6
0x95D7  IF_EQ                          ; 1
0x95D8  EXIT                           ; 1   already consumed -> silent
0x95D9  SAVE          #1 -> [0x4C6C]   ; 6   marks consumed BEFORE the fight
0x95DF  PRINTCLEAR    len=145          ; 148 "THE CEILING OF THIS OLD BUILDING HAS COLLAPSED, ..."
0x9673  CALL          [0x0809]         ; 4
0x9677  CLEARMONSTERS                  ; 1
0x9678  SETUP_MONSTER #255, #1, #255   ; 7
0x967F  LOAD_MONSTER  #42, #3, #42     ; 7   MON5CHA block 42 "GRIFFON" x3
0x9686  COMBAT                         ; 1
0x9687  GOTO          [0x826E]         ; 4   -> CALL [0x2E10]; EXIT
```

The `0x95DF` string decodes to exactly 193 characters with no trailing junk: "THE CEILING OF THIS
OLD BUILDING HAS COLLAPSED, AND A HOLE IS NOW OPEN IN THE FAR CORNER. ALSO IN THE FAR CORNER ARE
THE CREATURES WHO'VE TAKEN ADVANTAGE OF THE OPENING TO MAKE THEIR HOME HERE." The `0x8BF8` string
is 16 characters and **includes** its leading and trailing apostrophes — `'WHAT'LL IT BE?'` is
retail data, not this doc's quoting. (The packing is 6-bit MSB-first with the classic ASCII fold:
code < `0x20` → ASCII = code + `0x40`, otherwise ASCII = code. The simpler "always + `0x40`" rule
mis-decodes every punctuation character and turns this string into `gWHATgLL IT BE\x7fg`.)
The native frame `build/gateway-campaign-coldload-20260729-c/gateway-ecl5-19-combat-00-trigger.png`
shows the original executable printing `'WHAT'LL IT BE?'` with both apostrophes, so the fold is
confirmed against the retail renderer and not only against the decoder.

`MON5CHA.DAX` holds 14 blocks, every one 422 bytes, name = Pascal-style length byte + ASCII; block
4 is `ZHENTIL FIGHTER` (len `0x0F`) and block 42 is `GRIFFON` (len `0x07`). Present ids in file
order: 4, 42, 35, 26, 37, 47, 80, 81, 82, 83, 84, 85, 87, 93.

`EVENT_INDEX_MASK` (`0x3f`) is not a hazard for the 121..127 band on this block. `primeSearchLocation`
(`packages/engine/src/world/dungeonEvents.ts:177-178`) seeds `[0xc04f]` with the full backdrop byte
(`0x7A` = 122) and `[0x7f79]` with `backdrop & 0x3f` (`0x3A` = 58, mangled). `search_location` reads
`[0xC04F]` and applies its own `AND #127` at `0x812E`, so `[0x4C02]` recovers 122; `[0x7F79]` is
never read as a dispatch input here — `0x819F` **writes** it before `0x81A8` reads it, so the
masked seed is dead. The raw plane-2 byte does reach `primeSearchLocation` because `decodeGeoBlock`
stores `floor: backdropPlane[i]` unmasked (`packages/engine/src/loaders/geo.ts:157`) and
`runStepEvent` is handed `map.cells[cellIndex].floor` (`apps/web/src/ui/explore.ts:2174` and
`:6414`).

### Arrival pose, byte-derived

`initial_entry` at `0x8014` does `LOAD_FILES (19,2,255)` at `0x8036` and `LOAD_PIECES (7,15,30)` at
`0x803D`, then branches on `LastEclBlockId`:

```text
0x8044  COMPARE [0x4BF2], #19 / IF_EQ / GOTO 0x8115   ; same-area resume
0x804F  COMPARE [0x4BF2], #21 / IF_EQ / GOTO 0x8071   ; arrival from ECL6#21
0x805A  SAVE #11 -> [0xC04C]; SAVE #7 -> [0xC04B]; SAVE #0 -> [0xC04D]  ; default (7,11) north
```

The arrival arm at `0x8071` itself guards twice — `COMPARE #1,[0x4CF5] / IF_EQ / GOTO 0x80C3` and
`0x807C COMPARE [0xC04D],#3 / IF_EQ / GOTO 0x809D`. On cold memory both fail and it falls through
to its own three position writes:

```text
0x8087  SAVE #1  -> [0xC04D]   ; facing = 1 = east
0x808D  SAVE #10 -> [0xC04C]   ; y = 10
0x8093  SAVE #0  -> [0xC04B]   ; x = 0
0x8099  GOTO [0x8115]
```

`(0,10)` facing east is the west city gate. `ECL6.DAX` block 21 is the state that leaves
`LastEclBlockId = 21` behind: `0x8803 PRINTCLEAR "ENTER SUNDABAR?@"`, `0x8812 CALL [0x080C]`
(the yes/no host call), `0x8816 IF_EQ / GOTO 0x8921`, `0x881E SAVE #5 -> [0x7F12]` (game_area = 5),
`0x8824 NEWECL #19`.

**Stated precisely, because the two live Greybox profiles differ here and both are byte-correct.**
`(0,10,east)` is what block 19 writes when the incoming facing is *not* west. A real retail arrival
is not that: `ECL6#21` gates its own "ENTER SUNDABAR?" prompt on facing west (`0x87FB COMPARE
[0xC04D],#3 / IF_NE / RETURN`, immediately before the prompt), so `[0xC04D]=3` is carried in,
block 19's `0x807C` guard **succeeds**, and `0x80B3` writes `SAVE #15 -> [0xC04B]` / `SAVE #2 ->
[0xC04C]` = `(15,2)` facing west. That is exactly what the plain `gateway` profile records from a
GameLink capture, and exactly what the native frame
`build/gateway-campaign-coldload-20260729-c/sundabar-canonical-03-arrival.png` shows the original
executable displaying (`15, 2 W 08:48`) one frame after the `ENTER SUNDABAR?` YES. The
`gateway-natural` profile seeds only `[0x4BF2]=21` and therefore legitimately lands on `(0,10,E)`.
Cell `(15,2)` is descriptor 121, whose `COMBAT` is behind the `[0x4C27]==15` endgame gate, so it is
inert on cold memory — the party can walk away from it.

### The route

`GEO5#19`'s wall graph (passable = `wall == 0` or `door != 0`, the exact rule in
`find_geo_path.find_path`) decomposes into four components of **211 / 32 / 12 / 1** cells.
`chooseStart`'s heuristic (`apps/web/src/ui/explore.ts:1766` — row-major, first cell with four open
edges, facing = first open edge in N/E/S/W order) reproduces to `(9,0)` facing north, which sits in
the 32-cell pocket. `(0,10)`, `(9,8)` and `(6,14)` are all in the 211-cell component, so there is
**no path** from the heuristic spawn to either encounter and a `startPose` override is required.
This is the same mechanism `treasures-natural` needed, for a different reason: there the override
substitutes for a spawn the script does not write, here the pose *is* the script's own, taken from
`initial_entry`'s bytes rather than chosen.

Blocking the non-target descriptor cells `{14, 16, 121, 123, 124, 125, 126, 127}` =
`{(2,2), (14,11), (15,2), (15,7), (12,0), (7,3), (1,0), (13,3)}`, `find_path` gives:

| Leg | Steps | Cardinal moves | Coordinates | Descriptors crossed |
| --- | ---: | --- | --- | --- |
| `(0,10)` → `(9,8)` | 11 | `E E E E E E E E N E N` | (0,10)(1,10)(2,10)(3,10)(4,10)(5,10)(6,10)(7,10)(8,10)(8,9)(9,9)(9,8) | 5 7 1 11 1 1 22 25 24 1 17 → **18** |
| `(9,8)` → `(6,14)` | 9 | `S S S S S W W W S` | (9,8)(9,9)(9,10)(9,11)(9,12)(9,13)(8,13)(7,13)(6,13)(6,14) | 17 1 1 1 1 27 1 0 → **122** |

Every crossed cell is print-only or endgame-inert **except** the descriptor-0/1 cells, which roll
for wandering monsters as described above. In the browser the tavern victory's own host-move resume
already consumes leg 2's first southward step (the party ends at `(9,9)` on descriptor 17), so the
live route walks the `(9,9) → (6,14)` form, one step shorter.

### What this closes, and what it does not

Closed, at the browser/engine layer, on real retail bytes: all six of this route's checkpoints —
**encounter**, **choice**, **tactical-board**, **outcome**, **ECL-resume** and **consumed-state
persistence**. They are pinned by two new engine
goldens in `packages/engine/test/dungeonEvents.test.ts` — `primeSearchLocation — golden Gateway
ECL5 block 19 descriptor 18 (campaign FIGHT/LEAVE)` and `... descriptor 122 (one-shot GRIFFON
ambush, consumed flag [0x4c6c])` — both of which read `ECL5.DAX`/`GEO5.DAX` from the install rather
than from a fixture, let `initial_entry` choose its own arm and write its own pose, locate the
target cells from the GEO bytes instead of hard-coding `0x92`/`0x7A`, and assert the consumed word
is `1` *before* `COMBAT` and silent on the second visit. The browser regression
`explore-gateway-natural-combat` in `apps/web/test/e2e.mjs` walks the two legs in the live app,
checks the pose at each end, the `FIGHT`/`LEAVE` prompt, enters the tactical screen for both
fights, checks both rosters by `MON5CHA` name, drives each fight to an outcome, checks the `(9,9)`
tavern-sign resume, and checks `[0x4c6c]` across save/reload. It also drains a wandering encounter
whenever a seeded descriptor-0/1 roll fires, rather than pretending those cells are inert.

**Not closed and not claimed by this section: any native DOS execution trace of `ECL5.DAX`.** The
two 113-event file-open traces recorded below (`build/dosbox-x-gateway-ecl5-19-20260716{,-r2}`)
still stand unrefuted for what they actually measured — Gateway's silent, zero-keypress startup
never opens any `ECL*.DAX` — and `gateway-operand-parser-execution-probe.md`'s execution-layer gap
is untouched. Nothing here is a native-route claim; the native half of this route is the separate
2026-07-29 capture and the artifact section that follows.

### The `LOAD_PIECES (7,15,30)` archive split, and the blank-wall claim that is stale

`0x803D`'s `LOAD_PIECES (7,15,30)` genuinely spans two archives: `WALLDEF5.DAX` holds ids
`[4,7,9,16]` and `8X8D5.DAX` holds `[4,5,7,9,16]`, while ids 15 and 30 live only in the shared
`WALLDEF.DAX` / `8X8D.DAX` (`[5,15,30]`). Every `WALLDEF` block in both files is exactly 780 bytes
= one record.

The consequence that was previously written down — that two wall sets therefore render blank — does
**not** hold on the path a `*-natural` profile takes, and this doc should not repeat it.
`startExplore` (`apps/web/src/ui/explore.ts:5874`) merges the shared archives into one lookup
namespace before handing them to `sources.walldefBlock`/`sources.tileBlock` (`:5964` and `:5968`),
and `gateway-natural` declares `sharedWalldefPath = WALLDEF.DAX` / `sharedTilesPath = 8X8D.DAX`, so
7 resolves locally and 15/30 resolve from the shared bank. Nor would a genuine miss degrade
silently: `loadDungeonWalls` (`packages/engine/src/world/dungeonWalls.ts:154-161`) **throws** on a
missing non-sentinel block — only `WALLDEF_RESET` (`0xFF`) is skipped and `WALLDEF_DEFAULT_SET1`
(`0x7F`) tolerated — so 15 or 30 going missing would be a hard load failure, not blank art. The e2e
case asserts `wallTileSets() === [true, true, true]`, which pins the real behaviour. The stale
paragraph survives in `apps/web/src/ui/gameData.ts`'s `gateway-natural` `(e)` comment and in
`apps/web/src/ui/docs.ts:137`; both belong to other files and were deliberately not edited from
here. No blank-wall gap is claimed by this route.

### Reproduction

```powershell
# Static decode, straight from the retail install (no cached JSON). read_dax_blocks takes a Path
# to the archive itself and returns dicts with block_id/raw; header_entries' addend is 0x8000 and
# decode_one needs word_sets_for_profile('gateway-to-the-savage-frontier') = {29:0,33:3,34:0,44:1}.
python -c "import sys; sys.path.insert(0,'tools'); from pathlib import Path; import goldbox_corpus as gc, gen1_ecl_encounter_scan as s; raw = {b['block_id']: b['raw'] for b in gc.read_dax_blocks(Path(r'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier')/'ECL5.DAX')}[19]; print(len(raw), s.header_entries(raw, 0x8000))"

# The two goldens and the browser regression:
pnpm --filter @goldbox/engine test dungeonEvents
$env:GB_E2E_ONLY='explore-gateway-natural-combat'; pnpm --filter @goldbox/web e2e; Remove-Item Env:GB_E2E_ONLY
```

The GEO walk reproduces with `find_geo_path.decode_edges`/`decode_descriptors`/`find_path` on
`GEO5.DAX` block 19 with the blocked set listed above. A scratch disassembler that walks
`decode_one`/`successors` must thread the `GOSUB` return address back through `successors`' `stack`
tuple, and must cut the `0x82BA GOTO 0x8127` back-edge from the shared tail into `search_location`;
without the first, every instruction after a `GOSUB` looks unreachable and descriptors 0/1 falsely
scan as combat-free, and without the second every descriptor "reaches" every other one.

## Native campaign artifacts at `build/gateway-campaign-coldload-20260729-c` (recorded 2026-08-02)

This directory backs the arrival half of the 2026-07-29 result below and had never been cited by
path anywhere in `docs/`. `docs/engine/research/gateway-sundabar-native-evidence.json` hashes the
`gateway-ecl5-19-qwen36-*` / `gateway-ecl5-122-qwen36-*` frames (the encounter, victory, resume and
consumed-reload milestones) but not this bundle, which is where the party that walked those routes
was actually assembled. It is ignored `build/` evidence and is not redistributed; what follows is
the inventory, verified against the artifacts today.

**Harness.** `probe.conf` is a GameLink master config (`output=gamelink`, `gamelink master=true`,
`files=normal`, `fileio=true`) whose autoexec mounts
`build/runtime-gateway-campaign-coldload-20260729` as `C:` and runs `GAME.EXE UseStart`.
`probe-process.json` records one owned DOSBox-X 2026.07.02 process, PID 45368, `gamelink: true`,
a single render window, stage `build/runtime-gateway-campaign-coldload-20260729`, guest command
`GAME.EXE UseStart`.

**Correction worth recording:** the directory holds **four** process records, not one —
`probe-process.json` (PID 45368, 14:16), `victory-process.json` (PID 2348, 17:26),
`victory-process-r2.json` (PID 16316, 17:43) and `reload-process.json` (PID 64420, 17:55). All four
were launched from the same `probe.conf`, whose `logfile=` path is fixed, so each successive
process truncated the previous one's log. Every process is individually owned and PID-recorded,
which is the rule that matters; but no single artifact in here covers the whole afternoon, and the
319 frames span several sessions.

### What the run reached

| Frame | On-screen state |
| --- | --- |
| `load-01-party-menu.png` | cold retail party menu (`CREATE NEW CHARACTER` … `BEGIN ADVENTURING`) with the native `ABC` sidecar already in the roster, AC 8 / HP 14 |
| `load-02-resumed.png` | in-world at `1,10 N 07:00` |
| `party-add-02-all-five.png` | six created characters assembled: `ABC DEF GHI JKL MNO PQR` (the filename says "five"; the screen shows six) |
| `party-quest-01-krevish.png` | `2,12 S 07:09`, retail prompt "SEVERAL THUGS HAVE CORNERED A SMALL, TERRIFIED MAN…" |
| `party-quest-16..26-krevish-*.png` | the recruitment beat itself. Not opened frame-by-frame this round; what *is* verified is that `KREVISH` (AC 5 / HP 15) is a seventh roster line in every later frame opened below, and that the run's `SAVE\KREVISH.guy`/`.swg`/`.fx` sidecar triple is loaded in `dos-files.log` |
| `gate-route-05-exited-yartar.png` | `8,15 S 07:34`, "THE GUARDS GLANCE AT YOU ONLY BRIEFLY AS YOU PASS THROUGH THE CITY GATES." |
| `world-01-at-9-12-e.png` | wilderness overland map, `6,12 E 07:34`, "YOU ARE CROSSING A RIVER." |
| `route2-sundabar-07-flee.png` / `savepoint-run-11-flee.png` | two visibly different wilderness submaps (green/forest at `2,11 E 07:46`; orange/mountain at `9,8 E 19:41`), both after a random encounter, "YOU'VE GOTTEN AWAY." |
| `checkpoint-run-08-flee.png` / `finalpath-23-flee.png` | the failure side of the same system: `8,8 N 07:40` and `12,7 E 20:25`, "YOU ARE UNABLE TO ESCAPE!" |
| `sundabar-canonical-01-prompt.png` | wilderness `0,4 W 08:48`, seven-member party, retail `ENTER SUNDABAR?` with `YES`/`NO` |
| `sundabar-canonical-02-entered.png` | same pose, `LOADING…PLEASE WAIT` (the `NEWECL 19` load) |
| `sundabar-canonical-03-arrival.png` | `15,2 W 08:48` inside Sundabar |
| `gateway-ecl5-19-combat-00-trigger.png` | `9,8 N 09:02`, tavern-keeper portrait, `'WHAT'LL IT BE?'`, `FIGHT LEAVE` |
| `gateway-ecl5-19-combat-02-board.png` | native tactical board, three dark-armoured enemies against the party |
| `gateway-ecl5-19-combat-r2-00-full-party-trigger.png` | the last frame in the directory (16:05): a second descriptor-18 trigger at `9,8 N 15:02` with all seven at healthy HP |

Filenames in this directory are human annotations and repeatedly disagree with the frame
(`world-01-at-9-12-e.png` shows `6,12`; `party-add-02-all-five.png` shows six characters). Read the
pose line in the frame, not the name.

**Workflow fact worth keeping.** This run did **not** use the `LOAD GAME` path that
`docs/engine/research/gateway-save-acquisition.md` documents as stopping at the retail
`Insert disk 3 in drive C:` prompt. It reached the party menu with a character sidecar already
present and went through `BEGIN ADVENTURING`, which sidesteps the disk-3 layout gate entirely. That
is the route by which the acquisition gate was actually closed; see `gateway-save-acquisition.md`
for the disk-3 diagnosis, the falsified `F → H` `GAME.CFG` repair, and the `START1.EXE` replay —
none of which is repeated here.

**Corroboration against retail bytes.** `load-02-resumed.png`'s `1,10 N 07:00` matches
`ECL2.DAX#1`'s own `initial_entry` position writes at `0x807A`-`0x8086`, re-read this round:
`09 00 01 01 4b c0` (`SAVE #1 -> [0xC04B]`, x = 1), `09 00 0a 01 4c c0` (`SAVE #10 -> [0xC04C]`,
y = 10), `09 00 00 01 4d c0` (`SAVE #0 -> [0xC04D]`, facing 0 = north). `sundabar-canonical-03-
arrival.png`'s `15,2 W` matches `ECL5#19`'s `0x80B3` arm exactly (see the arrival-pose subsection
above), which is the independent native check on that branch. `gateway-ecl5-19-combat-00-trigger.
png`'s `'WHAT'LL IT BE?'` reproduces the `0x8BF8` string including both apostrophes.

### Honest limits and two corrections to earlier advisory memos

`docs/engine/research/gateway-native-campaign-route-opus-advice-2026-07-29-v2.md` and
`…-sol-advice-2026-07-29-v2.md` both describe this directory. Both were written mid-afternoon on
2026-07-29 while the directory was still being written to, and two of their statements are no
longer true of the artifacts on disk. Recording the correction rather than the memo:

- **"`dos-files.log` is zero bytes" / "stops at 432 lines (boot only), so there is no file-I/O
  corroboration of the gameplay."** The file is now 48,113 bytes / 812 lines, a single continuous
  session (one `Logging: opened logfile` header, monotonic timestamps), and it covers far more than
  boot. It records 749 `FILES:` events: the familiar boot/attract prefix (`GAME.CFG`, `GAME.OVR`, a
  *search* for `C:\ecl2.dax` that is never opened, then `8X8D1`/`8X8D`/`COMSPR`/`sky`/`ITEMS.1`/
  `DungCom`/`RandCom`/`zounds` and a `title.dax`/`MUSIC.dax` attract alternation), then a `C:\SAVE`
  scan of `savgamA.dat` through `savgamJ.dat`, then `savgamA.dat` **opened**, `vault.A`/`vault.dat`,
  `CHRDATA1..7.sav/.swg/.fx`, the seven named sidecars `ABC`/`DEF`/`GHI`/`JKL`/`MNO`/`PQR`/
  `KREVISH` (`.guy`/`.swg`/`.fx`), six `CHEAD`/`CBODY` pairs, `CPIC`/`CPIC5`, then
  `GEO5.DAX` → `WALLDEF.DAX` + `WALLDEF5.DAX` → `8X8D.DAX` + `8X8D5.DAX`, and at internal timestamp
  `189318031` an open of **`C:\ECL5.dax`**. This is the first file-I/O-layer record in this repo of
  Gateway's loader opening `ECL5.DAX` at all. It corroborates area-5 entry from the DOS file layer,
  which the 2026-07-16 silent-startup probes explicitly could not reach.
  **What it is not:** it is not an execution trace. A file open proves the archive was read, not
  that block 19's `search_location` ran; `gateway-operand-parser-execution-probe.md`'s
  execution-layer gap is unchanged. And because all four processes shared one `logfile=` path, this
  log belongs to the last process only — it is a `savgamA.dat` cold-load run, so it does **not**
  corroborate the 14:16 sidecar/`BEGIN ADVENTURING` sequence, whose own log was overwritten.
- **"It does not reach Sundabar or ECL5#19" / "the party never reached Sundabar."** Refuted by
  frames in the same directory written after those memos: `sundabar-canonical-01/02/03` (15:54) and
  `gateway-ecl5-19-combat-00`…`-05` (16:00). The party entered Sundabar, arrived at `15,2 W`,
  reached descriptor 18 at `9,8 N`, saw `'WHAT'LL IT BE?'` with `FIGHT`/`LEAVE`, and entered the
  native tactical board.

Two further claims made about this directory could **not** be corroborated and are not asserted
here. A `YOU ARE ATTACKED BY GOBLINS.` frame with an `ATTACK`/`FLEE` prompt was not found in the
frames actually opened this round (`checkpoint-run-08-flee`, `finalpath-23-flee`,
`savepoint-run-11-flee`, `route2-sundabar-07-flee`, `world-01-at-9-12-e`); the encounter portraits
seen there are an ogre-like giant and a dragon-like beast, and the prompts are `YOU'VE GOTTEN
AWAY.` / `YOU ARE UNABLE TO ESCAPE!`. A "last captured pose `(4,10)` E after fleeing goblins" was
likewise not found: the last frame in the directory by mtime is the descriptor-18 trigger at
`9,8 N 15:02`. Neither absence is a claim that a goblin encounter never happened — of 319 frames,
sixteen were opened — only that this doc does not assert it.

## Authoritative campaign result (2026-07-29)

The P3.3 route is now closed in both the original DOS executable and Greybox. A genuine
GameLink-only campaign session entered Sundabar as `ECL5/GEO5#19` at `(15,2)` facing west. Legal
retail-GEO movement reached descriptor 18 at `(9,8)` facing north, where the original executable
showed `WHAT'LL IT BE?`, `FIGHT / LEAVE`, loaded `MON5CHA` id 4 ×3 (Zhentil Fighters), entered the
2D tactical board, produced a victory, and resumed through the script at the Auld Macdon tavern
sign at `(9,9)` facing north (descriptor 17).

The tavern event is deliberately repeatable; it has no consumed flag. Its unintuitive resume is
retail behavior:

1. Descriptor 18 temporarily rotates the ECL direction from north to south.
2. `DIV` writes quotient and remainder; the remainder is visible to ECL at `[0x7F3F]` through the
   native `Area2.field_67E` alias.
3. `CALL 0x401F` (`movePositionForward`) runs synchronously while direction is south, moving from
   `(9,8)` to `(9,9)`.
4. The script restores north and immediately redispatches the destination descriptor, producing
   descriptor 17's tavern-sign text.

Retail `GAME.OVR` is pinned at SHA-256
`c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd`. Its own DIV consumer and
host-call order prove this mechanism; the browser does not substitute a guessed backward step.

From the resumed tavern sign, the legal route `turn-around, S×4, W×3, S` reached descriptor 122 at
`(6,14)` facing south. The original executable showed the collapsed-ceiling scene, loaded Griffon
id 42 ×3, completed tactical combat, resumed exploration, and saved. The saved container is 13,149
bytes with SHA-256 `513f5ddd51d9792c60a5532450a93d6290d8d730804db4a1f31344abb9d7c8f5`;
file offset `0x02D9` (ECL `[0x4C6C]`) is `1`, and its pose bytes are `(6,14,S)`, descriptor 122. A
cold original-DOS load remained in ordinary exploration at that cell without reopening the
encounter. The committed hash/offset manifest is
`gateway-sundabar-native-evidence.json`; ignored `build/` frames and retail saves are not
redistributed.

The ordinary unmodified party independently reached the genuine tavern prompt and tactical board
but lost, which is the native-difficulty control. For deterministic victory capture only,
`tools/patch_gateway_test_party.py` backed up and hash-manifested all seven isolated slot sidecars,
then changed player combat fields. It never changes the save container, ECL, GEO, MON, executable,
or overlay. This boundary is important: route, roster, engine result, script resume, consumed byte,
and cold reload all remain original-engine behavior.

Greybox's canonical `?explore=gateway` route now mounts `ECL5/GEO5/WALLDEF5/MON5CHA` block 19,
merges the shared `WALLDEF.DAX`, uses Gateway's shared `8X8D1` UI frame bank, and starts at the
native-captured arrival pose. `EclVm` exposes a synchronous typed `onCall` bridge and models DIV's
retail remainder word. Explorer mirrors the live pose into `C04B..C04F`, executes the host move
before the next ECL instruction, then adopts the script's final pose. The former
`?gateway-fight=1` URL is only a redirect to this canonical route.

Regression coverage:

- `packages/engine/test/vm.test.ts`: synchronous CALL ordering, DIV quotient/remainder, and
  zero-divisor failure.
- `packages/engine/test/dungeonEvents.test.ts`: the real GEO walk, repeatable tavern FIGHT/LEAVE,
  live-direction host resume to descriptor 17, descriptor-122 Griffon roster, and reconstructed
  consumed-memory silence.
- `apps/web/test/e2e.mjs` (`gateway-ecl5-fight`): normal-control browser walk through both combats,
  final pose, save-v2 persistence, page restart, and silent restored cell.
- `tools/test_patch_gateway_test_party.py`: seven-sidecar backup/patch contract and incomplete-slot
  rejection.

Local Ollama/Qwen classified and navigated framebuffer states through
`tools/dosbox_ollama_agent.py`; it remained advisory. Exact retail bytes, legal paths, hashes,
saved bytes, cold reload, and automated tests are the authoritative evidence.

## Historical result (2026-07-16, superseded for campaign reachability)

**Runtime encounter/choice: still UNLOCATED, with new corroborating evidence.** `ECL5.DAX` (and
every other `ECL*.DAX` archive) is never opened by the DOS loader during ordinary silent
startup/attract sequencing. Two independent runs (`build/dosbox-x-gateway-ecl5-19-20260716`,
`build/dosbox-x-gateway-ecl5-19-20260716-r2`) each captured the **identical** 113-event sequence of
`INT 21h/AH=3Dh` ("open existing file") calls, in the identical order, with identical `DS:DX`
pointers, ending at the identical point where the loader settles into a `title.dax`/`MUSIC.dax`
attract-cycle idle state that produces no further file-open events within a 20-second window. Zero
of those 113 opens name any `ECL*.DAX` file. This is independent, file-I/O-layer corroboration of
the operand-parser-execution probe's code-execution-layer finding: Gateway's ECL subsystem for a
specific location — including `ECL5#19` — is not touched at all (neither executed nor even opened
as a file) until real gameplay selects and enters that location, which needs either a save file
(none available, `gateway-save-acquisition.md`) or a statically-mapped, non-guessed front-end/
character-creation input sequence (not yet built for Gateway, unlike Secret's `ovr019` dispatcher).

**Static ECL decode: deepened and reconfirmed, byte-exact, zero drift from the existing
report.** Read `ECL5.DAX` block 19 directly from the retail install and disassembled the FIGHT
branch with the repo's own decoder (`tools/gen1_ecl_encounter_scan.py` + `tools/
map_savage_frontier_targets.py`'s `annotate_route`), independent of any cached JSON:

| Vaddr | File offset | Raw bytes | Decode |
| --- | ---: | --- | --- |
| `0x8C07` | `0xC09` | (packed 6-bit text) | `HORIZONTAL_MENU` (opcode `0x2B`), destination selector `32633`, choices `["FIGHT", "LEAVE"]` |
| `0x8C19` | `0xC1B` | `25 01 79 7f 00 02 01 25 8c 01 77 82` | `ON_GOTO` (opcode `0x25`), selector `32633`, target count `2`, targets `[0x8C25, 0x8277]` (index 0 = FIGHT, index 1 = LEAVE) |
| `0x8C25` | `0xC27` | `1c` | `CLEARMONSTERS` (opcode `0x1C`, no operands) |
| `0x8C26` | `0xC28` | `0c 00 ff 00 00 00 ff` | `SETUP_MONSTER` (opcode `0x0C`), args `(0xFF, 0, 0xFF)` |
| `0x8C2D` | `0xC2F` | `0b 00 04 00 03 00 04` | `LOAD_MONSTER` (opcode `0x0B`), args `(4, 3, 4)` -- **the roster, byte-exact** |
| `0x8C34` | `0xC36` | `24` | `COMBAT` (opcode `0x24`), **zero operands, one byte** |
| `0x8C35` | `0xC37` | `01 01 77 82` | `GOTO 0x8277` |

`annotate_route()` run against this exact candidate reproduces the same `tactical_choice` object
already recorded in `docs/engine/research/savage-frontier-targets.generated.md` --
`menu_vaddr=35847 (0x8C07)`, `choices=["FIGHT","LEAVE"]`, `choice_index=0`, `choice_text="FIGHT"`,
`dispatch_vaddr=35865 (0x8C19)`, `target_vaddr=35877 (0x8C25)` -- with no discrepancy. `COMBAT`
(`0x24`) takes no operands in this Gen1 ECL dialect; the roster it fights is staged separately by
the preceding `SETUP_MONSTER`/`LOAD_MONSTER` pair, which is why `COMBAT` itself is a single byte at
`0x8C34`. No `NEWECL` opcode appears anywhere on this path -- `NEWECL` (cross-archive/location
transition) is a distinct opcode used elsewhere in Gateway's ECL corpus, not on the in-place
FIGHT/LEAVE-then-COMBAT branch of block 19.

**Tactical-board, outcome, ECL-resume, persistence: not attempted, UNLOCATED for the same
underlying reason, a fortiori.** All four require reaching a live combat/post-combat game state.
Since this session's new evidence shows the *encounter itself* is never even opened as a file
during silent startup, there is no reachable state from which to attempt any of these four without
either a save file or a save-free scripted input sequence into and through character creation,
overland travel, and this specific location -- none of which exist for Gateway yet. No workaround
(guessed keys, invented save state, etc.) was attempted, per this project's "UNLOCATED beats
invention" ethic (`docs/engine/HANDOFF.md` section 5).

**Historical engine-local FIGHT branch (2026-07-28).** The selected local ECL contract
is independently executable without pretending it proves native reachability. New engine golden
`EclVm — golden Gateway ECL5 block 19 FIGHT/LEAVE branch` starts at the real raw offset `0xC09`
(virtual `0x8C07`; Gen1's virtual base is `0x7FFE`, not `0x8000`), asserts the emitted horizontal
menu `{ items: [FIGHT, LEAVE], destAddr: 0x7F79 }`, chooses FIGHT index 0, observes MON5CHA id 4
×3 at `COMBAT 0x8C34`, supplies victory, and verifies the in-place EXIT with no false `NEWECL`
chain. This corrects no game behavior; it prevents static-parser or VM drift while the original
DOS route remains unlocated. It does **not** claim a tactical board, original-executable outcome,
or persistence checkpoint.

**Historical direct browser ECL route (2026-07-28).** `?gateway-fight=1` loaded the retail
`ECL5.DAX` and `MON5CHA.DAX` directly and starts a `DialogueRunner` at the same raw offset
`0xC09` / virtual `0x8C07`. It presents the bytes' own `FIGHT`/`LEAVE` menu, routes FIGHT through
the existing tactical-combat UI with the decoded MON5CHA id-4 ×3 roster, and resumes the real VM
after the combat outcome to its in-place EXIT. Browser regression `gateway-ecl5-fight` checks the
menu, both virtual addresses, all three decoded enemies, and the post-combat end turn; the engine
golden remains the independent byte-level control.

This is intentionally a **browser ECL route**, not a retroactive native-route claim. It neither
creates a Gateway save nor claims the original executable's attract/startup path opens ECL5.DAX;
the two file-open traces above still prove that it does not. A native encounter, native outcome,
and persistence remain separate evidence requirements.

## Method

### File-open reachability probe (new)

New tool: `tools/trace_gateway_ecl5_19_route.ps1`. One owned DOSBox-X 2026.07.02 DEBUGBOX process
against the hash-locked `build/runtime-gateway-base-clean-20260715` stage (same hash-lock as the
descriptor-9/operand-parser docs: `GAME.EXE 0222834b...5c00`, `GAME.OVR c2e64df2...f5cd`; this
script additionally locks `ECL5.DAX 47a30b57...f87cd`). Before launch it waits for an empty
machine-global DOSBox-X/GameLink slot, then asserts on every trace iteration that its own PID is
the only `dosbox-x.exe`; a foreign session aborts rather than contaminating the evidence. The probe
uses **no `BPINT 21 42`, no execution breakpoint, no keys, no save file**:

1. `BPINT 21 3D` (breaks on every `INT 21h` with `AH=3Dh`, DOS "open existing file"; `DS:DX` =
   ASCIZ pathname pointer, `AL` = requested access mode), then `RUN`.
2. At each stop: confirm `AH==0x3D` from `EAX` (reject otherwise -- never observed in either run);
   issue `D <DS>:<DX>` to dump the pathname bytes; decode the ASCIZ string; log index, `CS:EIP`,
   pointer, access mode, and filename; classify as the target archive (`ECL5.DAX`) or any
   `ECL*.DAX`.
3. `RUN` again (never a key) and repeat, capped at 200 hits / a per-hit timeout window (20 s in the
   second, primary run) that ends the probe once no new `AH=3Dh` event fires for that long --
   i.e. the loader has gone idle.
4. Both runs independently produced the exact same 113-event sequence, stopping on the same
   `timeout` condition after the same trailing `title.dax`/`MUSIC.dax` alternation (opens 99-112),
   confirming this is deterministic silent-startup behavior, not a flaky truncation.
5. Terminated the owned process (`Stop-Process`) in both runs; confirmed no leftover `dosbox-x.exe`
   processes afterward.

For a deliberately short diagnostic sample, `-MaxHits` is an observation cap rather than a negative
proof boundary. The JSON output now labels that case explicitly: absence in the sampled prefix does
not support a claim about the rest of the title sequence. Only an `idle_loop_detected` or `timeout`
result can support the silent-startup non-reachability conclusion above.

The observed sequence: `game.cfg` (twice) -> `GAME.OVR` -> `8X8D1.DAX`/`8X8D.DAX` (font tiles,
repeated) -> `COMSPR.DAX` (sprites, repeated ~26 times) -> `sky.dax` -> `ITEMS.1` -> `DungCom.dax`
-> `RandCom.dax` -> `zounds.dax` (sound, repeated) -> `title.dax` (title art, repeated) ->
`MUSIC.dax` (repeated) -> back to `title.dax`/`MUSIC.dax` alternation. This is legible as the
title-screen/attract-mode asset load followed by a steady attract loop; it never touches any
`ECL*.DAX`, `GEO*.DAX`, `MON*.DAX`, or `ITEM2..6.DAX` (the gameplay-data archives), consistent with
silent startup never reaching character creation or a playable location.

### Static ECL decode (deepened)

No DOSBox-X involved. Loaded `ECL5.DAX` directly from the retail install via
`goldbox_corpus.choose_install`/`read_dax_blocks` (the same corpus helpers
`gen1_ecl_encounter_scan.py` already uses for its checked-in `build/gen1-ecl-encounters.json`),
located block 19's `search_location` candidate with `combat_vaddr=0x8C34` and
`roster=[[4,3,4]]` (matches the existing generated report exactly), then re-disassembled the
FIGHT-branch bytes directly with `ecl_scan.decode_one` at each real instruction boundary (not a
naive per-byte scan -- an early per-byte attempt produced spurious `DECODE-FAIL` entries from
walking into operand bytes; the corrected walk advances by each instruction's own `size` field) to
produce the byte table above. Also ran `map_savage_frontier_targets.annotate_route()` directly
against this exact candidate and confirmed its `tactical_choice` output matches the checked-in
`docs/engine/research/savage-frontier-targets.generated.md` with no discrepancy.

## Historical open list (as of 2026-07-16; closed by the 2026-07-29 result above)

- **Runtime encounter checkpoint:** UNLOCATED. Confirmed (new, file-I/O-level evidence, two
  reproductions) that `ECL5.DAX` is not opened during silent startup. Reaching it requires a save
  file or a save-free scripted path through character creation into the specific location that
  loads `ECL5.DAX` -- neither exists yet for Gateway.
- **Runtime choice checkpoint:** UNLOCATED for the same reason; cannot observe a live dispatch on
  data that is never loaded.
- **Tactical-board, outcome, ECL-resume, persistence checkpoints:** UNLOCATED, not attempted --
  each strictly requires the encounter checkpoint first.
- **Static ECL decode of the FIGHT/LEAVE route, the roster encoding, and the COMBAT dispatch:**
  now confirmed at raw-opcode-byte granularity (this doc), not just at the vaddr/roster summary
  level (the existing generated report). Zero drift found.
- Nothing here required or used a Gateway save file, consistent with `gateway-save-acquisition.md`
  and `docs/engine/HANDOFF.md`'s "UNLOCATED beats invention" ethic.

## Reproduction

```powershell
pwsh tools/trace_gateway_ecl5_19_route.ps1 -OutDir build/dosbox-x-gateway-ecl5-19-<label> `
  -MaxHits 200 -FirstHitTimeoutSeconds 40 -NextHitTimeoutSeconds 20 -IdleRepeatThreshold 10
```

Requires the hash-locked stage at `build/runtime-gateway-base-clean-20260715` (regenerate with
`python tools/stage_gateway_runtime.py --strict --output build/runtime-gateway-base-clean-<label>`
if missing) and the local DOSBox-X 2026.07.02 DEBUGBOX build under
`build/tools/dosbox-x-2026.07.02`.

For the static decode table, run `tools/gen1_ecl_encounter_scan.py`'s underlying helpers directly
(`goldbox_corpus.choose_install` / `read_dax_blocks` on `ECL5.DAX`, then `ecl_scan.decode_one` at
offset `ecl_scan.vaddr_to_offset(0x8C25, 0x8000)`, advancing by each instruction's `size`) or call
`map_savage_frontier_targets.annotate_route()` against the `search_location`/`combat_vaddr=0x8C34`
candidate in `build/gen1-ecl-encounters.json`.
