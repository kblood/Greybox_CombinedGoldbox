# Next-round plan — 2026-09-03 (branch `greybox`, base `221c434`)

Planning only. Six parallel work items for separate Sonnet implementers on **one shared working
tree**, plus a serialized tail for the files they would otherwise fight over. Every item is
provable from bytes already on disk (repo + the five documented source locations) and the
existing gates; none needs DOSBox-X, GameLink, an emulator, hardware or the user.

Ground rules carried from `CLAUDE.md`, `PLAN-NEXT-ROUND-2026-09-02.md` and the twenty-seventh
`HANDOFF.md` entry:

- A probe that cannot fail is not evidence: every new test/e2e case must be **seen red** under a
  named mutation, and the null must test the **alternatives**, not just the predecessor.
- A decoder nothing calls is not shipped: each item names the consumer it reaches and the e2e case
  that proves the consumer, and states what it measured **in the browser**, not what the decoder
  test predicted (24th/27th-entry lesson: the font decoder was correct and displayable nowhere).
- Agents **do not commit**. Each reports the exact file list, the mutation it watched fail, and the
  numbers. The lead commits one coherent commit per item with **`git commit -- <paths>`** (27th
  entry: a bare `git commit` swallowed four other agents' work once).
- Serialized files (Phase B only; no Phase A agent edits them unless named as owner):
  `apps/web/test/e2e.mjs`, `apps/web/src/ui/main.ts`, `apps/web/src/ui/explore.ts` (except R3,
  its sole Phase A owner), `tools/goldbox_capabilities.json`, `apps/web/src/ui/supportClaims.json`,
  `apps/web/src/ui/catalog.ts`. Also treat `packages/engine/src/index.ts` as single-owner (R2).
- Hand-over e2e snippets are written against the real helpers (`watchHttp(page, bad, { errors })`),
  registered in BOTH the `const runners = new Map([` registry and the awaited list in `main()`,
  and given the registry key as their `id` so `e2e-case-coverage` catches a miss.

Standing gates (run from repo root):

```powershell
pnpm --filter @goldbox/engine test
pnpm test:corpus
pnpm -r exec tsc --noEmit
pnpm build:app
$env:GB_E2E_ONLY='<case-id>'; pnpm --filter @goldbox/web e2e     # scoped iteration
pnpm --filter @goldbox/web e2e                                   # full 168-case pass before landing
pnpm e2e:intros
```

---

## The DoK Amiga wall-bank thread: evaluated, and it is not a palette question

The brief asked whether "where do the wall chunks get their colour table at runtime?" is answerable
from bytes on disk. It is, but the question dissolves on the way: **R5's negative was a DOS-side
decode bug in the sweep tool, and the reassembly is solved by exact pixel identity.** Measured
today from `Death Knights of Krynn/8X8D*.DAX` and `amiga_extracted/DeathKnightsOfKrynn/disk1/8x8d1.daa`
(sha `a099d870…`, byte-identical on disk2 and in the WHDLoad pack):

1. **The sweep read the DOS bank wrong.** `tools/dok_amiga_wallbank.py:dos_wall_bank_tiles` goes
   through `dax_decode.parse_tile_strip`, which treats DoK's `8X8D1.DAX#1` (8209 bytes) as an
   8-byte-header, 16-px-wide strip. The block is the **17-byte-header fixed-size tile array** that
   `packages/engine/src/loaders/dax.ts:430-445` documents (`item_count` at byte 8 = `0xff` → 256
   tiles of 32 chunky bytes; `8209 = 17 + 256·32`), the same reading that renders DoK's walls
   correctly in `?explore=dok`. The strip reading interleaves rows of neighbouring tiles, so every
   one of the 96 hypotheses was scored against scrambled tiles. Under that reading the best
   exact-match count is **1/256**.
2. **The pixel multiset is identical across platforms.** Per-index pixel counts over bank 1: DOS
   `13→2596, 8→2321, 14→1600, 6→3068, 4→2114, 0→4667, 1→2`; Amiga `16→2596, 17→2321, 30→1600,
   22→3076, 20→2118, 0→4671, 24→2`. Three counts match exactly and the rest within 8 px.
3. **Block 202's embedded palette IS the wall banks' colour table.** Its slots 17..31 hold the
   sixteen EGA colours relocated: derived map DOS→Amiga
   `{0:0, 13:16, 1:24, 2:23, 3:31, 4:20, 5:21, 6:22, 7:18, 8:17, 9:25, 10:26, 11:27, 12:28, 14:30, 15:19}`
   (13 = DOS magenta key ↔ 16 = Amiga key). Every populated palette in every DoK `.daa` frame
   (`BACK1`, `BIGPIC1/2`, `COMSPR`, `CPIC1`, `DUNGCOM`, `WILDCOM`, `8x8d1#202/203`) carries the
   **same** 17..31 relocation; only slot 16 varies per picture (`BACK1` (255,170,0), `BIGPIC`
   (255,85,255), `COMSPR` (85,85,85), `202` (0,0,0)). The 28 wall chunks' own 64-byte palette field
   is all-zero because the banks never set a palette: the screen's 17..31 are the EGA colours under
   any DoK screen. The coordinator's "bright yellow is not plausible wall art" objection is answered
   by the DOS bank itself, which draws 1600 EGA-14 (yellow) pixels per bank.
4. **Natural chunk order, exact.** With the correct DOS reading and the map above, concatenating
   chunks `(id, id+20, id+40, id+60)` gives, per series 1..7 (DOS banks `8X8D1#1`, `8X8D4#2`,
   `8X8D2#3`, `8X8D2#4`, `8X8D3#5`, `8X8D3#6`, `8X8D5#7`): **255, 255, 256, 255, 255, 255, 255
   of 256 tiles byte-identical** (1786/1792). The only differing tile is index 255 of each bank,
   by 1–2 pixels. Null (Amiga tiles shuffled, same predicate): 4, 2, 26, 2, 2, 17, 2.

So there is no palette-permutation item and no re-run of the 96 hypotheses. There is a correction
item (R1) that fixes the tool, rewrites the research doc and ledger text that currently state a
false negative, and wires the reassembly. The 68000 disassembly of the unpacked WHDLoad `game`
(461,944 bytes; strings `' from 8x8D'`, `WALLDEF` — the `amiga_extracted` copy is crunched and
string-free) is **not needed** for this and is not scheduled.

---

## R1 — DoK Amiga wall banks: correct the sweep's DOS reading, prove the natural order is byte-identical, wire the reassembly

**Why now.** `docs/engine/research/dok-8x8d-amiga-format.md` §3 and the ledger's DoK `graphics`
gap both assert "96 hypotheses rejected" and "own embedded palette all zero, no colour source".
Both statements rest on `tools/dok_amiga_wallbank.py:dos_wall_bank_tiles` reading the DOS bank
through `dax_decode.parse_tile_strip` (8-byte header, 16-px rows). The block is the 17-byte-header
tile array (`dax.ts:430-445`), and under that reading the natural order is 1786/1792 identical
(numbers above). `apps/web/src/ui/explore.ts:3584-3590` says the reassembly is "unverified … left
unattempted", `packages/engine/test/dungeonWallsAmigaDok.test.ts:197` pins the single-bank
category at `'DOS-EGA'`. This is VISION pillar 2 for DoK dungeons, and it also corrects a
published finding.

**Scope — files this agent owns.**
- `tools/dok_amiga_wallbank.py` — replace the DOS reading with the 17-byte tile-array reading
  (reuse `dax_decode`'s existing multi-item parser if one covers EGA chunky 8x8 items; otherwise
  add `parse_ega_tile_array(raw)` to `tools/dax_decode.py` with the exact-consume gate
  `len == 17 + (raw[8]+1)·32`). Add the DOS→Amiga index map **derived from block 202's palette**
  (match each EGA colour to its 17..31 slot; assert uniqueness; hard-code nothing), an exact
  per-tile identity predicate, and keep the shuffled-order null. Report all 24 chunk orders under
  the exact predicate (cheap) so uniqueness is shown, not assumed.
- `tools/test_dok_amiga_wallbank.py` — rewrite: the 15 tests pin a decode bug. New pins: (a) the
  strip reading is kept as a live function and asserted to give **≤ 2/256** exact matches on bank
  1 (the predecessor null); (b) the tile-array reading gives ≥ 255/256 on all 7 series in natural
  order; (c) every other of the 23 orders scores ≤ 192/256 (state the measured max); (d) shuffled
  null ≤ 30/256; (e) the derived map is a bijection onto `{0,16..31}`; (f) all 28 chunks' own
  palette fields are all-zero and 202/203/204's are not (coordinator's measurement, pinned).
- `packages/engine/src/loaders/daa.ts` — `combineDokWallChunkRaws(chunks: Uint8Array[], paletteSource: Uint8Array): Uint8Array`
  (or equivalent) that synthesises ONE standard 5-plane wide frame: 73-byte header with
  `w = 2048`, the 202 palette copied into bytes 9..72, planes concatenated row-wise in natural
  chunk order — so `decodeDaaWideTileBlock` slices 256 tiles unchanged. Tag the result's
  transparent index as 16 (the DOS-13 key). Do NOT resolve to RGB inside the combiner.
- `packages/engine/test/dungeonWallsAmigaDok.test.ts` — flip the line-197 pin to a two-sided pin:
  the single-bank category reports `'Amiga'`, and the resolved tiles equal the DOS tiles for
  ≥ 255/256 per bank under the derived map (so a silent regression to DOS fallback AND a wrong
  order both go red).
- `docs/engine/research/dok-8x8d-amiga-format.md` — rewrite §3 (keep §3's old text under a
  "superseded" heading with the reason), re-measure §4's block 202 "moon range ~45% different"
  and the 46-vs-45 tile count under the derived map (two-sided: report identical or not, with
  the count), update §5.

**Must NOT touch:** `explore.ts` (Phase B: the `tileBlock` lambda at ~3614 becomes
`(id) => id <= 7 ? combine(...) : amigaRaw.get(id)`, after R3 is committed), `gameData.ts` (R3),
`index.ts` (R2; export in Phase B), `dax.ts` (R5), `goldbox_capabilities.json` (Phase B —
prepare the replacement DoK `graphics` text in the report).

**Acceptance.**
- `pnpm test:corpus`, `pnpm --filter @goldbox/engine test`, `pnpm -r exec tsc --noEmit`.
- Numbers in the report: per-series identical counts (expect 255/255/256/255/255/255/255), the
  three differing tiles' coordinates and pixel deltas, the 24-order table, the shuffled null, the
  strip-reading predecessor count, the §4 re-measurement.
- Phase B e2e: extend `gswitch-dok` (`runGraphicSwitch(browser,'dok')`) or `explore-dok` to read
  `wallArtProvenance` and pin the single-bank category as `'Amiga'` with ≥ 1 wall pixel rendered
  from the Amiga source on the DoK opening map; watch it red by stubbing the combiner's order to
  `(61,41,21,1)` — the wall must visibly change AND the engine identity pin must fail.
- **Mutations.** (i) swap two chunk ids in the combiner → engine pin red; (ii) replace the derived
  map with the identity map → red; (iii) restore the `parse_tile_strip` reading → the pytest
  identity test red at ≈1/256.

**Risk / collisions.** The Amiga wall art is the SAME art as DOS (as CoK's 8x8 chrome was,
`amiga-8x8d-planeorder.md` correction). Say so in the ledger text: the toggle now reads Amiga
bytes for DoK walls, it does not show richer art. Do not touch DoK's boot sets 0/4 wiring.

---

## R2 — Curse of the Azure Bonds party import `?import=coab`, byte-faithful class and level through the COAB decompile

**Why now.** The ledger's Curse `retail_save.import` is `unsupported`: "CoAB character, party,
quest, and sidecar save structures have not been mapped into a shipping importer." Yet the GOG
install ships six characters at `C:\Program Files (x86)\GOG Galaxy\Games\Curse of the Azure Bonds\SAVE\CHRDATA1..6.SAV`,
**422 bytes each = `Player.StructSize = 0x1A6`** in `coab_extracted/Classes/Player.cs:708`, the
project's Rosetta stone. Probed today at the COAB offsets: name PString@0x00, thac0@0x73,
race@0x74, class@0x75, hp_max@0x78, per-class levels@0x109..0x110, sex@0x119, alignment@0x11B,
base_ac@0x124, exp i32@0x127 — MATHEW human paladin 5 (class 3, levels `[0,0,0,5,…]`, 25000 xp),
MARK the same, TRAVIS race 1 fighter 4/thief 5 (class 14), LEDERA race 2 fighter 4/MU 4 (class
13), SHARA human cleric 5 (class 0), PHILIPPE human MU 5 (class 5). Class and level are
**byte-faithful**, which no other shipped importer achieves (CoK infers class; DQK derives 5 of 6).
Third importer on the `?import=cok`/`dok`/`dqk` pattern; the consumer route `?explore=coab`
(`explore-coab-natural-combat`) already exists.

**Scope — files this agent owns.**
- NEW `packages/engine/src/loaders/coabSavedCharacter.ts` — `COAB_SAVED_CHARACTER_SIZE = 422`,
  `sniffCoabSavedCharacter`, `decodeCoabSavedCharacter(raw)`: name, the ability block at 0x10
  (transcribe `PlayerStats.Write` order from `Player.cs:96-130`, including Str00), thac0, race,
  class, age, hp_max, class-level array, sex, alignment, base_ac, exp, hit_point_rolled@0x12C.
  Cite the `Player.cs` line for every offset. Keep unmodelled bytes untouched (no encoder needed
  this round).
- NEW `packages/engine/test/coabSavedCharacter.test.ts` — pin all six records (every value
  above), plus the **consistency oracle**: the class code's expected nonzero level slots (from
  COAB's `ClassId` enum) must be exactly the nonzero slots at 0x109..0x110 for 6/6.
- `packages/engine/src/index.ts` — **R2 is the sole Phase A owner**; add the exports.
- NEW `apps/web/src/ui/importCoabParty.ts` — modelled on `importDqkParty.ts`: read from the
  selected folder (`AssetSource`) or the GOG path; build `CharacterSheet`s with byte-faithful
  class/level/hp/abilities; label derived fields (spells known, equipment) in the summary;
  `installImportCoabSeam()` exposing `window.__importCoab.party()`.
- `docs/engine/research/original-save-import-export-status.md` — add the Curse row.
- Report-only sub-measurement (two-sided, no code): apply the same offsets to Secret's 439-byte
  `CHRDATA*.SAV` (`…\Secret of the Silver Blades\SAVE`) and Pools'/Treasures' 510-byte ones;
  report whether name@0, class@0x75 and the level array remain consistent (the oracle above). Do
  not implement those importers.

**Must NOT touch:** `main.ts` (Phase B: sidebar entry + `?import=coab` route next to the
`?import=dqk` block at ~1902), `e2e.mjs`, `explore.ts`, `savedCharacter.ts` (CoK), any DQK file,
`goldbox_capabilities.json` (prepare the Curse `retail_save.import` JSON in the report).

**Acceptance.**
- `pnpm --filter @goldbox/engine test`, `pnpm -r exec tsc --noEmit`, `pnpm build:app`.
- Phase B e2e `import-coab` (model on `runImportDqk`): `window.__importCoab.party()` returns six
  sheets whose names, class, level and six abilities equal the engine-test values; then
  `?explore=coab` shows the imported roster (MATHEW … PHILIPPE), not the fresh route party.
- **Nulls / mutations.** Shifted-offset null: decode at record start ±1 byte — the consistency
  oracle must reject ≥ 5/6 at each shift while accepting 6/6 at 0 (report all three counts).
  Mutation: change `0x75` to `0x74` in the loader → race is read as class → oracle red.
  e2e: leave the route's fresh-party install in place after import → the roster assertion must
  fail once, then fix.

**Risk / collisions.** COAB's `Race`/`ClassId` enums must be transcribed, not assumed from the
Krynn importers (DoK's enum differs). thac0 is stored as COAB's raw field (44/43/42/40 here) —
carry it raw and derive the displayed THAC0 through COAB's own formula, cited, or label it derived.

---

## R3 — Pools of Darkness town route `?explore=pools-town` (Phlan civic block, sign + service arms) — and measure whether the Amiga toggle finally has walls to show

**Why now.** Three Pools ledger gaps say the same thing: towns "engine-level only: no browser
route mounts a Pools town"; graphics "the toggle is only visible on maps that HAVE walls —
`?explore=pools` mounts block 18, the zero-wall island"; quests/wilderness "no browser route".
`packages/engine/test/poolsTownRoute.test.ts` (cases K–P) already byte-grounds everything a route
needs: `GEO1#16`/`ECL1#16` Phlan civic block, `PHLAN.civic.coldBoot` pose, `ROUTE_CIVIC` (44
steps, 35 open + 9 auto-doors, ending at `sunriseDoor`), five sign cells producing
`A SIGN OVER THIS DOOR READS ' TRAINING HALL '` etc., service doors whose YES arm writes host
markers (`trainDoor` → `[TRAIN_MASK]=127` + `program#0`; `suneDoor` → `[TEMPLE_FLAG]=1`) and
whose NO arm leaves every marker unwritten (case O). `docs/engine/research/pools-town-route.md`
is the companion. This was last round's bench substitute; it is the one Pools item whose route is
fully specified.

**Scope — files this agent owns.**
- `apps/web/src/ui/explore.ts` — **sole Phase A owner.** Add the `pools-town` explore id: mount
  `ECL1#16`/`GEO1#16` at `PHLAN.civic.coldBoot`, reuse the existing Pools natural-route plumbing
  (`pools-natural` at ~964), expose through `window.__explore` the memory reads for
  `TRAIN_MASK`/`TEMPLE_FLAG`/`SHOP_FLAG` and the current turn kind/texts.
- `apps/web/src/ui/gameData.ts`, `apps/web/src/ui/gen1Profiles.ts` — the id union at
  `gameData.ts:31` and archive registration only.
- `docs/engine/research/pools-town-route.md` — append "Browser route" with the seams and
  what remains host-modelled (`program#0` training, temple `combat` effect with empty roster).
- Report-only measurement: with the route mounted, render one wall-facing pose under DOS and
  under Amiga (`explore-pools-graphics-switch` machinery) and report the differing-pixel count
  and whether `ECL1#16` emits `LOAD_PIECES` or falls to the `[1,255,255]` fallback set. Two-sided:
  0 differing pixels is a landable number if the reason is stated.

**Must NOT touch:** `main.ts` (Phase B: `pools-town` token in the `?explore=` chain at ~1913),
`e2e.mjs`, `dqkExplore.ts`, `combat.ts`, `goldbox_capabilities.json`.

**Acceptance.**
- `pnpm -r exec tsc --noEmit`, `pnpm build:app`, engine tests unchanged.
- Phase B e2e `explore-pools-town` (model on `runExplorePoolsNaturalCombat` +
  `runExploreTreasuresTownServices`): (1) start pose equals `coldBoot`; (2) walk `ROUTE_CIVIC`
  and land on `sunriseDoor` with 9 auto-door crossings; (3) at `trainSign` facing north the text
  contains `' TRAINING HALL '`; (4) at `trainDoor` answer YES → `[TRAIN_MASK]===127`;
  (5) **negative arm, fresh reload**: same door, answer NO → the prompt text is identical and
  `[TRAIN_MASK]` is undefined; (6) `plainStreet` produces no text (the "every cell says
  something" alternative).
- **Mutations.** Force YES in the NO arm → (5) red. Drop one step from the walk → (2) red at the
  pose. Seed `[TRAIN_MASK]=127` before the NO arm → (5) red.

**Risk / collisions.** `explore.ts` is ~6700 lines and the largest collision surface; R1's
one-line `tileBlock` change waits for Phase B. If Amiga walls differ by 0 px here, do not chase
it — record the number and the LOAD_PIECES finding for the ledger.

---

## R4 — DQK quest leg in the browser: `?dqk=quest` (area 54 house cell → area 55 Hamhand scene → flag → empty house), both arms

**Why now.** The ledger's DQK `quests` gap: "Engine-level and static only: no browser route wires
a quest setter to its consumers." `docs/engine/research/dqk-campaign-legs.md` §"Leg: QUEST"
(refuter verdict `proven`) fully specifies it: the sole setter in the 47-area corpus is area 55
@0x80DD `OR [0x0187],#32` under the BE FRIENDLY menu item; the reader is area 54 @0x977F
(`AND [0x0187],#32 → "THE HOUSE IS EMPTY AND DARK."`, else `SAVE #1,[0x018D]; NEWECL #55`);
`GEO.GLB` member 16 (23x21) carries descriptor `0x86` at exactly six cells `(12,6) (13,6) (10,7)
(11,7) (8,8) (9,8)`; four measured negative controls (bit 0x10, bit 0x30, descriptor 0x07, same-cell
latch). `apps/web/src/ui/dqkExplore.ts` already has `runEclChain` with `ECL_GEN2`, `autoInput`
(answer 0 = BE FRIENDLY), `searchAt`, `vmRun1At` and the `window.__dqk` seam — and it is a
**different file from `explore.ts`**, so this runs in parallel with R3.

**Scope — files this agent owns.**
- `apps/web/src/ui/dqkExplore.ts` — a `quest` entry mode (param value read in Phase B; expose it
  as `window.__dqk.startQuest()` for now): mount area 54 at a street cell adjacent to `(12,6)`;
  arm A: step onto the cell → chain to 55 (no GEO — the chain must not try to mount a map) →
  auto-answer 0 → `[0x0187] |= 0x20` → chain back to 54 → area 54's own `vmRun1` latch → re-enter
  the cell → `'THE HOUSE IS EMPTY AND DARK.'` and no chain. Arm B (fresh memory): the cell chains
  to 55 with `[0x018D]=1` and zero print effects. Expose `memory(addr)`, `lastChain`, `lastTexts`.
- NEW `packages/engine/test/dqkQuest.test.ts` — the six cases the research doc proposes (raw-byte
  pins at a55 `0x00DD` and a54 `0x177F`, GEO six-cell pin, read/clear, read/set, four controls,
  write side + end-to-end over one memory map). `dqkCampaignLegs.test.ts` case C covers only the
  census; do not duplicate it.
- `docs/engine/research/dqk-campaign-legs.md` — append the browser-route note under the QUEST
  leg (what is host-modelled: the auto-answer, the entry-state seeds `[0x16]=4,[0x9c]=2`).

**Must NOT touch:** `explore.ts`, `main.ts` (Phase B: `?dqk=quest` param), `e2e.mjs`,
`dqkParty.ts`, `importDqkParty.ts`, `combat.ts`, `goldbox_capabilities.json`.

**Acceptance.**
- `pnpm --filter @goldbox/engine test`, `pnpm -r exec tsc --noEmit`, `pnpm build:app`.
- Phase B e2e `explore-dqk-quest` (model on `runExploreDqk` + `runExploreGatewayQuest`): both
  arms asserted in one case; the set arm must read `[0x0187] === 0x20` from the seam and the exact
  text; the clear arm must read `lastChain === 55` and `[0x018D] === 1`.
- **Nulls / mutations.** Seed `[0x0187]=0x10` (a different bit the same area sets) → the "empty
  house" assertion must fail (still chains). Use descriptor-0x07 cell instead of 0x86 → the text is
  `'A DARK AND EMPTY ROOM.'`, not the house — assert as the third leg. Mutation: change `#32` to
  `#16` in the route's expectation → red.

**Risk / collisions.** If the browser's DQK UI cannot present the HORIZONTAL_MENU live, the
seam-driven `resume(0)` is acceptable but must be disclosed in the docblock and the ledger text.
Area 55 has no GEO entry; any code path that assumes `NEWECL` targets have maps must be guarded.

---

## R5 — Treasures' twelve "798-byte records" are palette-only pictures (and four more in `OVER.DAX`): decode them, and settle the Pools/Buck padded-window sprite question with a measurement

**Why now.** The 25th handoff entry discloses twelve Treasures blocks that "still do not decode"
(`PIC1#38/47/48/57/68/70`, `PIC1A#78/81/89/90/100/119`), "one unknown record type … the shared
prefix is where a future reading should start". Read today: each is `00 00 00 00 | 00 00 | 01 00 |
20 | df |` then 223 DAC triples then a 119-byte tail — i.e. the late-Gen1 VGA picture record with
**width = height = 0, one frame, palette base 0x20, 223 colours**, rejected by the existing parser
only because 223 is odd (`tools/dax_decode.py:220`, `color_count & 1`; the TS twin has the same
gate). A corpus sweep finds **exactly 16** such records in Treasures — the twelve above plus
`OVER.DAX#1..4` — and **0** in Pools, Buck, or any other title. They are palette-set records.
Separately, the bench item "late-Gen1 sprite palette gap" measured today: Pools' 26 non-padded
`SPRIT1` blocks share ONE 32..175 window and only 3 blocks are padded; Buck's 35 padded sprite
blocks have no shared window anywhere in its own pictures (40 non-padded pictures, 40 distinct
windows). Both are landable numbers.

**Scope — files this agent owns.**
- `packages/engine/src/loaders/dax.ts` (and its VGA-picture helper module) — a
  `'vga-palette-record'` arm gated on `w === 0 && h === 0`, `raw[8] === 0`, `paletteBase === 0x20`,
  `len === 10 + colorCount·3 + tail` with the tail characterised (223//2 = 111 lookup-seed bytes
  + the remaining 8, carried uninterpreted as bytes, not guessed). Emit `image` = a 16x14 swatch
  `IndexedImage` over the decoded palette so the generic branch can show it, `palette`, and
  `frames: []`. Do not widen the odd-count gate for real pictures.
- NEW `packages/engine/test/vgaPaletteRecord.test.ts` — corpus sweep across every `.DAX` in the
  five locations: the arm claims exactly the 16 Treasures blocks and nothing else (list them);
  the 16 decoded palettes are distinct or not (report); the twelve PIC ones share the 64-byte
  prefix the 25th entry measured.
- `apps/web/games/treasures-of-the-savage-frontier.json` — PIC1/PIC1A/OVER notes rewritten
  with the measured facts. `apps/web/games/pools-of-darkness.json` and
  `apps/web/games/buck-rogers-countdown-to-doomsday.json` — SPRIT notes gain the window
  measurement (Pools: 3 padded blocks vs a 26-block shared window; Buck: no static source).
- Report-only sub-measurement (two-sided): resolve Pools' 3 padded `SPRIT1` blocks through the
  26-block shared window and compare their colour set to the 26 siblings' — coherent or not, with
  the count. No compositing change this round.

**Must NOT touch:** `main.ts`, `e2e.mjs`, `catalog.ts` (Phase B), `daa.ts` (R1),
`tools/dax_decode.py` (R1 may touch it; put Python parity on the bench), `supportClaims.json`.

**Acceptance.**
- `pnpm --filter @goldbox/engine test`, `pnpm test:corpus` (manifest claims are guarded),
  `pnpm -r exec tsc --noEmit`, `pnpm build:app`.
- **Reachability, measured in the browser, not predicted**: state which UI path shows the swatch.
  If `loadGame.ts`'s category filter admits the new kind, `late-gen1-sprit-view` (Phase B edit)
  pins Treasures `PIC1` 66→72 and `PIC1A` 64→70 frame cards. If it filters it out (the 27th-entry
  font shape), the consumer is the single-file asset browser: Phase B adds a `catalog.ts` entry
  and a `treasures-pic1` case modelled on `cok-8x8d1`, pinning the card count with the arm on and
  one fewer with it off. Either way the agent reports the number it saw.
- **Nulls / mutations.** Loosen the `w===0&&h===0` gate → the corpus sweep must go red by
  claiming real pictures. Flip the odd-count gate for real pictures → the existing VGA picture
  tests red. XOR one byte of a pinned palette digest → red.

**Risk / collisions.** None on files. Do not call the records "overland palettes" beyond what
`OVER.DAX` membership shows; the consumer scene for each PIC palette is not established.

---

## R6 — Buck Rogers ECL dialect from its own `GAME.OVR`: static dispatch map, operand word sets, dialect pin, and `?ecl=buck` in the inspector

**Why now.** Buck is the only detected DOS title with **no ECL dialect at all**:
`tools/gen1_ecl_encounter_scan.py:77-82` `PROFILE_WORD_SETS` lists DoK/Gateway/Treasures/Pools;
`packages/engine/src/ecl/disassemble.ts` has `ECL_GEN1_SHORT{,_GATEWAY,_TREASURES,_POOLS}`; the
Buck manifest's `ecl1.dax` row says "Buck's ECL dialect has not been verified against its own
binary". The static method exists and is tested: `tools/map_pool_ecl_dispatch.py` locates the
opcode dispatcher and operand parser against the CoAB oracle (`docs/engine/research/pool-ecl-dispatch-map.md`:
similarity 0.97 / trigram 1.0) and `tools/map_dok_ecl_dispatch.py` does the same for DoK; memory
`goldbox-verify-gaps-against-binary` records that operand tables come from handler prefetches.
Buck's `GAME.OVR` is already mapped by `tools/gen1_map.py` (`TPOV`, 34 descriptors, 23 anchors, 8
resolved selector rows — 26th entry). The only other `TPOV` title is Secret, which has no dispatch
map either, so this is also the first `TPOV` exercise of the method — two-sided by design.

**Scope — files this agent owns.**
- NEW `tools/map_buck_ecl_dispatch.py` + NEW `tools/test_map_buck_ecl_dispatch.py` — port of the
  Pool tool: locate Buck's dispatcher and operand parser, emit handler offsets, the opcode set,
  the per-opcode operand word sets, and the special host-register table if the getter is found.
  Generated doc: `docs/engine/research/buck-ecl-dispatch-map.md` (header "generated, do not edit").
- `tools/gen1_ecl_encounter_scan.py` — `PROFILE_WORD_SETS["buck-rogers-countdown-to-doomsday"]`
  from the map (only if the map lands).
- `packages/engine/src/ecl/disassemble.ts` — `ECL_GEN1_SHORT_BUCK` only if its word sets differ
  from every existing dialect; otherwise alias the matching one and say which.
- NEW `packages/engine/test/buckEclDialect.test.ts` — every block of Buck's `ecl*.dax`
  disassembles to exact consumption (or a documented terminal) under the pinned dialect, with the
  desync counts under each of the four other dialects reported next to it.
- `apps/web/src/ui/eclInspector.ts` — take a game key (`cok` default, `buck` new) selecting the
  archive path and dialect; Buck's path from the manifest/`AssetSource`.

**Must NOT touch:** `main.ts` (Phase B: `?ecl=buck` param), `e2e.mjs`, `gen1Profiles.ts` (R3),
`explore.ts`, `goldbox_capabilities.json`, `supportClaims.json`, the Buck manifest (R5 owns it
this round — hand the `ecl1.dax` note rewrite to Phase B).

**Acceptance.**
- `pnpm test:corpus`, `pnpm --filter @goldbox/engine test`, `pnpm -r exec tsc --noEmit`,
  `pnpm build:app`.
- Numbers: dispatcher/operand-parser similarity vs the CoAB oracle; opcode count and missing
  range; word-set diff against each existing dialect; per-dialect desync counts over all Buck
  blocks. **If all five dialects give zero desyncs on every block, the corpus cannot discriminate
  and the pin rests on the binary alone — say so, do not claim corpus confirmation.**
- Phase B e2e `ecl-buck` (model on `runEclInspector`): load Buck `ecl1.dax` block N under the
  pinned dialect and assert the first 12 mnemonics equal a pinned list; mutation: run under
  `ECL_GEN1_SHORT` base → the list must differ (if it does not, pick a block where it does, or
  report that no block discriminates).
- **Negative outcome is landable**: if the Pool tool's dispatcher signature is not found in the
  `TPOV` overlay, land the tool with the similarity scores and the reason, no engine change, and
  the manifest note stays.

**Risk / collisions.** `eclInspector.ts` is touched by nobody else. Do not invent a handler
table from corpus agreement alone (the Pools ledger admits that as a gap); the binary is the
evidence here.

---

## Dispatch order

**Phase A — fully parallel (six agents, disjoint files):**

| item | owns (Phase A) |
|---|---|
| R1 | `tools/dok_amiga_wallbank.py`, `tools/test_dok_amiga_wallbank.py`, `tools/dax_decode.py` (only if a tile-array parser is added), `loaders/daa.ts`, `test/dungeonWallsAmigaDok.test.ts`, `research/dok-8x8d-amiga-format.md` |
| R2 | `loaders/coabSavedCharacter.ts` (new), `test/coabSavedCharacter.test.ts` (new), **`index.ts`**, `ui/importCoabParty.ts` (new), `research/original-save-import-export-status.md` |
| R3 | **`ui/explore.ts`**, `ui/gameData.ts`, `ui/gen1Profiles.ts`, `research/pools-town-route.md` |
| R4 | `ui/dqkExplore.ts`, `test/dqkQuest.test.ts` (new), `research/dqk-campaign-legs.md` |
| R5 | `loaders/dax.ts` (+ its VGA-picture helper), `test/vgaPaletteRecord.test.ts` (new), `games/treasures-of-the-savage-frontier.json`, `games/pools-of-darkness.json`, `games/buck-rogers-countdown-to-doomsday.json` |
| R6 | `tools/map_buck_ecl_dispatch.py` (new), `tools/test_map_buck_ecl_dispatch.py` (new), `tools/gen1_ecl_encounter_scan.py`, `ecl/disassemble.ts`, `test/buckEclDialect.test.ts` (new), `ui/eclInspector.ts`, `research/buck-ecl-dispatch-map.md` (new) |

Cross-check of the collision surface: `explore.ts` → R3 only; `dqkExplore.ts` → R4 only;
`daa.ts` → R1 only; `dax.ts` → R5 only; `index.ts` → R2 only (R1's export lands in Phase B);
`gameData.ts` → R3 only; `disassemble.ts` → R6 only; `eclInspector.ts` → R6 only; the three
manifests → R5 only; `tools/dax_decode.py` → R1 only. If any agent finds it must edit a file
outside its column, it stops and reports instead of editing.

**Phase B — serialized tail (one agent at a time, in this order), after the lead has reviewed
and committed each Phase A item with `git commit -- <paths>`:**

1. `packages/engine/src/index.ts`: R1's `combineDokWallChunkRaws` export (one line).
2. `apps/web/src/ui/explore.ts` (after R3 is committed): R1's `tileBlock` wrapper at ~3614 for
   `amigaTileFormat === 'wide-frame'` ids 1..7.
3. `apps/web/src/ui/main.ts` one-liners: R2 `?import=coab` + sidebar entry; R3 `pools-town` token
   in the `?explore=` chain (~1913); R4 `?dqk=quest`; R6 `?ecl=buck`.
4. `apps/web/src/ui/catalog.ts`: R5's Treasures single-file entry, only if the manifest view
   filters the new kind (R5's report says which).
5. `apps/web/test/e2e.mjs`, one item per pass, each case added to BOTH lists, run scoped, watched
   red under its named mutation, then `e2e-case-coverage`: R1 (edit `gswitch-dok`), R2
   `import-coab`, R3 `explore-pools-town` (+ repoint `explore-pools-graphics-switch` only if R3's
   pixel-diff measurement is > 0), R4 `explore-dqk-quest`, R5 (edit `late-gen1-sprit-view` or new
   `treasures-pic1`), R6 `ecl-buck`.
6. `tools/goldbox_capabilities.json` + `apps/web/src/ui/supportClaims.json`: R1 DoK `graphics`
   (identical art, Amiga bytes now read; the 96-hypothesis text removed), R2 Curse
   `retail_save.import` → `partial`, R3 Pools `towns` + `graphics`, R4 DQK `quests`, R6 Buck
   manifest `ecl1.dax` note (and the Buck ledger profile from the bench if R6 is positive); then
   `pnpm test:corpus`.
7. Full gates, `pnpm build:app`, `pnpm --filter @goldbox/web e2e` (full, not scoped),
   `pnpm e2e:intros`, atomic deploy per `CLAUDE.md`, live-bundle hash check, `HANDOFF.md` entry —
   which must state plainly that the twenty-seventh entry's "96 hypotheses rejected" paragraph was a
   tool bug, with the numbers.

**Bench (substitutes if an item is dropped; same rules):**
- Secret of the Silver Blades importer (439-byte `CHRDATA*.SAV`, six shipped) — only after R2's
  offset measurement says the COAB layout holds there; same file pattern as R2.
- Python parity for R5 (`tools/dax_decode.py` palette-record arm + `test_dax_decode` case).
- Buck capability-ledger profile (13 games, 11 profiles) — Phase B-only file; do it with R6's
  ledger edit if R6 lands positive.
- DoK Amiga boot block 203 46-vs-45 tile off-by-one — folded into R1's §4 re-measurement; only a
  separate item if R1 reports it unresolved.

**Deliberately not picked (blocked or speculative):** every `[ ]` leaf in `BUILD-QUEUE.md` that
needs a DOSBox-X/GameLink trace (Pool/Secret CS:IP promotion, Gateway live selector, DQK WHO
confirm, E6.2b-4 protection bypass); the Amiga 68000 `game` disassembly for DoK's palette source
(answered from the DAA palettes themselves, see above); C1.4b `?graphics=c64` (WAIT decision
stands); C1.7 EasyFlash; Matrix Cubed (inside a `.7z`, not auto-extracted by policy); Buck's
padded-window sprite compositing (R5's measurement says Buck's own files carry no static source);
M10.S4/M11.S5 (user-decision forks).

---

## Corrections to this plan, measured after it was written (2026-09-03)

This file is kept as the brief that was actually issued. Two of its numbers were predictions and
both were wrong; the downstream research docs and tests already carry the measured values, and this
note exists so the stale figures are not read back out of here as evidence.

- **R1's predecessor null.** This plan states the strip-reading's best exact-match count as
  "**1/256**". The measured and pinned value is **18/256**
  (`tools/test_dok_amiga_wallbank.py`, `docs/engine/research/dok-8x8d-amiga-format.md`). The
  distinction matters and is the more interesting number: 18 sits *above* the 1000-shuffle null's
  maximum of 11, which is exactly why the buggy reader's negative read as a credible weak signal
  rather than as noise.
- **R1's 127-tile margin.** The margin over the best of the other 23 chunk orders is measured on
  **series 1** (255 vs 128). It is not an aggregate over all seven series. The ledger text was
  rewritten to say so.
- **R4's GEO shape.** This plan specifies area 54 as 23x21 with house cells
  (12,6)(13,6)(10,7)(11,7)(8,8)(9,8). The real, test-verified values are **21x23** with cells
  **(3,7)(4,7)(3,8)(4,8)(3,9)(4,9)** (`packages/engine/test/dqkQuest.test.ts`). Gen2 GEO headers are
  (height, width), per `GetFacingWallType` at `2f0d:0628` in `DQK.EXE`.
