# Neverwinter Nights (DOS/AOL) — `eclInitBlock` bootability sweep + WALLDEF finding

Follow-up to the `?nwn=1` asset preview (`apps/web/src/ui/nwnPreview.ts`) and
`docs/engine/research/neverwinter-nights-dos-combat-flow.md`/`neverwinter-nights-dos-archive-analysis.md`,
promoting NWN to a real walkable `GameData` entry (`apps/web/src/ui/gameData.ts`) the same way
`docs/engine/research/pools-of-darkness-eclinit.md` promoted Pools of Darkness: a mechanical
`loadDungeon` bootability sweep over every paired GEO+ECL id, corroborated with real narration and
GEO geometry rather than picked by rote "lowest id".

**Result: `eclInitBlock: 1` (`ECL0.DAX` block 1), plain `ECL_GEN1` dialect (no override), GEO map
`GEO0.DAX` block 1 (self-referencing), `WALLDEF.DAX`/`8X8D.DAX`/`MONCHA.DAX`/`ITEM.DAX` all single
shared (non-numbered) archives.** A real `loadPieces` effect is emitted (`[25, 15, 14]`), so no
`eclFallbackPieces` default is needed (unlike Treasures/Pools). Monster records use the **Gateway**
422-byte combat tail (`GATEWAY_LAYOUT`, not `COAB_LAYOUT` despite the identical record size). Items
use the **`cok-63`** plain-ASCII format. All work below is pure research: one-off `.mts` scripts run
via `npx tsx` from the repo root, deleted before commit (`_scratch_nwn_*.mts` — none committed). No
file under `apps/web/src/**` was touched by this file's own investigation; the `packages/engine`
changes it led to (documented in §3) are covered separately in the commit that lands them.

Source install: `D:\Games\Neverwinter Nights DOS\neverwinter-nights\neverwint\` (external, read-only,
same convention as every non-CoK/DoK/DQK title this project already uses — not vendored into the
repo).

---

## 1. Method

Same method as `pools-of-darkness-eclinit.md` §1: enumerate every id with both a real GEO map and a
real ECL script (`listPairedGen1Areas`, the same criterion `buildDqkGame.ts`'s content-port pipeline
uses), run each through `loadDungeon(initEcl, sources, { dialect: ECL_GEN1 })` (the exact production
entry point `explore.ts` calls on every other title), and corroborate a winner with narration + GEO
geometry rather than trust "lowest id" blind.

Unlike Pools/Treasures, NWN ships **four separate numbered GEO/ECL pairs** (`GEO0`/`ECL0` through
`GEO3`/`ECL3`, plus non-paired `ECL5`/`ECL7`) rather than one disk's worth — each numbered pair was
swept independently.

## 2. Sweep results (dialect: plain `ECL_GEN1`, no override)

| Archive pair | Paired ids | `loadDungeon`-clean | No `LOAD_FILES` in one pass |
| --- | --- | --- | --- |
| `GEO0`/`ECL0` | 1, 2, 3, 4, 5, 6, 7, 8, 9 | **1, 2, 3, 7** | 4, 5, 6, 8, 9 |
| `GEO1`/`ECL1` | 10, 11, 12, 14, 15, 16, 17, 18, 19 | **11, 19** | 10, 12, 14, 15, 16, 17, 18 |
| `GEO2`/`ECL2` | 20–29 | **20, 21, 22, 23, 24, 25, 26, 27, 28, 29** (all 10) | none |
| `GEO3`/`ECL3` | 30 | none | 30 |

Zero halts and zero never-terminating (stuck-forever) blocks anywhere in the swept corpus under the
plain `ECL_GEN1` dialect — every reachable `LOAD_FILES`/`LOAD_PIECES` decodes as a clean 3-operand
immediate frame with no bad-opcode desync (see the `disassembleEclBlock` dump of `ECL2#20` used to
confirm this). This is independent evidence NWN does **not** need the 1991+ short-dialect override
(`ECL_GEN1_SHORT`) DoK/Gateway/Pools use, nor Treasures' own further split — confirming the "Verified
context" assumption going in. The ids with no `LOAD_FILES` in a single un-resumed pass are ordinary
dialogue/menu/transition scripts (the same "not every paired id is a dungeon entry" shape every prior
Gen1 sweep in this project has found), not a dialect problem.

## 3. A real format finding: NWN's `WALLDEF.DAX` pads every block to a fixed 3-record size

The first sweep pass (before any engine fix) failed almost every otherwise-clean id with
`loadDungeonWalls: WALLDEF block N has 3 records; set S + 3 overflows past set 3` — COAB's own FATAL
`k + s > 4` guard. Every single block in `WALLDEF.DAX` (all 37) is **exactly 2340 bytes = 3 × 780**,
so `decodeWalldefBlock` always reported `k = 3` records regardless of position — the guard fires for
any operand at set position 2 or 3 (`3 + 2 = 5 > 4`, `3 + 3 = 6 > 4`), passing only at position 1
(`3 + 1 = 4`, the boundary case the guard allows).

**Cross-checks, in order:**

1. **Content inspection**: for the large majority of blocks (27/37), only `record[0]` carries real
   (non-zero) tile-id data; `record[1]`/`record[2]` are entirely zero (`walldefEntryKind` = `'none'`
   at all 780 entries) — pure file-format padding, not real per-position data.
2. **Direct art-id proof**: `8X8D.DAX` ships block ids `1..37` (plus `201`/`202`/`203` for
   font/frame/moon) — an **exact 1:1 id match with `WALLDEF.DAX`'s own 37 block ids**, never CoK's
   `blockId*10+i+1` multi-record split addressing. This is the decisive evidence: the file format
   itself only ever expects **one** real record per WALLDEF block, addressed directly by block id.
3. **The 10 blocks with real non-zero data beyond `record[0]`** (14, 17, 18, 19, 20–24, 35) don't
   change the verdict — cross-referencing `block 14`'s two real usage positions across the corpus
   (`ECL2#26` at set position 2, `ECL0#1` at set position 3) shows its real content is **always in
   `record[0]` regardless of which position it's invoked from**, which only makes sense if the engine
   always reads record 0 and the extra populated records are leftover/unused authoring data (not a
   per-position selector — a "use `record[s-1]`" hypothesis was tested and explicitly falsified: block
   4, used only at position 2, has real data in `record[0]` and an all-zero `record[1]`, which that
   hypothesis would render as blank).

**Fix shipped (`packages/engine/src/loaders/walldef.ts`, `decodeWalldefBlock`):** trim trailing
all-zero records — general, harmless for every existing title (a fully-zero record encodes no tile
information anywhere, so dropping it changes nothing observable), verified against the full engine
suite (153→154 files, 1795→1801 tests, zero regressions after updating one existing test that used a
synthetic *all-zero* 2-record block to exercise the overflow guard — it now needs non-zero content to
still trip the now-corrected guard, see `packages/engine/test/dungeonWalls.test.ts`).

This alone was not sufficient for **2 of 37 blocks** (14, 24) — see §3a. The full fix additionally
truncates every WALLDEF raw block to exactly its first 780-byte record **for this profile only**
(`GameData.walldefSingleRecord: true`, applied at the host `walldefBlock` source callback in
`apps/web/src/ui/explore.ts`, not inside the shared engine decoder — CoK/DoK legitimately rely on
real multi-record WALLDEF blocks elsewhere, so this stays profile-scoped, not a blanket engine
change). With single-record truncation applied, **every** WALLDEF-referencing `loadDungeon` call in
the swept corpus succeeds — see §3a.

### 3b. Browser wall-render correction (2026-07-26)

NWN also differs from CoK/DoK in **tile-bank addressing**, not merely record padding. Its single
WALLDEF record already names tiles in the `8X8D.DAX` bank paired with that exact WALLDEF block.
For the opening `LOAD_PIECES [25,15,14]`, for example, WALLDEF 15 (symbol set 2) contains id 61;
that is local tile `61 - 46 = 15` in 8X8D block 15. CoK's generic symbol-position relocation adds
70 at set 2 and routes the same id into set 3 / block 14 instead, visibly scrambling the first-
person viewport.

`DungeonWallSources.directWallsetTileIds` now models this narrow variation. It preserves raw NWN
ids and resolves ids at/above 46 through the originating wallset bank; low boot ids retain the
shared block-203 route. CoK, DoK, and Gateway retain their existing relocation/single-bank/combined-
bank paths. Real-asset regression coverage asserts the ECL0#1 WALLDEF-15 → 8X8D-15 mapping.

The web "Walk any area" registry now includes NWN's numbered ECL/GEO pairs 0–3 and applies both
NWN source rules while probing and mounting them. ECL5/ECL7 remain excluded because they have no
paired GEO map; only candidates that actually execute `LOAD_FILES`/`LOAD_PIECES` appear in the
picker.

### 3c. Follow-up: low-id bank routing and complete map index (2026-07-26)

The first direct-bank fix still left a Gateway-only heuristic active: any one-record bank with at
least 210 tiles was treated as a three-range Gateway combined bank. NWN legitimately has 210- and
255-tile direct banks, so low ids `1..45` were sent through `id - 46` and disappeared instead of
resolving through shared boot block 203. An exhaustive real-asset render sweep found 324,590 missing
blits in 2,472,001 across the 16 independently walkable entries (13,464 in ECL0#1 alone). NWN now
opts out of that Gateway heuristic; its low ids use block 203 and its high ids use their originating
WALLDEF bank.

All **29** NWN GEO members are genuinely fixed 16×16 maps: every decompressed member is exactly
1026 bytes (`uint16 1024` + four 256-cell planes). The web picker previously showed only the 16 that
emit both `LOAD_FILES` and `LOAD_PIECES` at their cold ECL entry. It now lists all 29: the 16 walkable
entries can be selected, while the 13 real but event/dialogue-only maps are visible and disabled with
an explicit label. This distinguishes absent content from a map whose retail script must be entered
through another flow.

### 3d. Frame-moon correction (2026-07-26)

`NWN_FRAME_LAYOUT` intentionally leaves its candidate bracket/moon/status cells unassigned: no
native reference establishes that NWN uses the Krynn three-moon placement. The generic explorer
loader nevertheless defaulted an omitted `moonTileGroups` to CoK's `[26,30,34]`, then overlaid
those unrelated NWN block-202 tiles at the three CoK moon columns. That was a compositor bug, not a
missing NWN asset.

The NWN and NWN-natural profiles now set `moonTileGroups: null`, an explicit no-overlay contract.
Their verified border tile roles remain rendered through `NWN_FRAME_LAYOUT`; the uncalibrated
status/moon decoration remains honestly absent until a native screenshot can establish it. The
focused browser regression asserts that NWN exposes no moon art.

### 3a. Verification: single-record truncation resolves 100% of WALLDEF-related failures

Re-running the full sweep with `walldefBlock` truncated to `raw.subarray(0, 780)`:

| Archive pair | `loadDungeon`-clean (single-record truncation) |
| --- | --- |
| `GEO0`/`ECL0` | **1, 2, 3, 7** (id 1 now boots — see §4) |
| `GEO1`/`ECL1` | **11, 19** (unchanged) |
| `GEO2`/`ECL2` | **all 10: 20–29** (ids 26, 27 now boot) |
| `GEO3`/`ECL3` | none (id 30 has no `LOAD_FILES` in one pass — unrelated to WALLDEF) |

Zero WALLDEF-caused failures remain anywhere in the corpus; every remaining failure is the
pre-existing "this id has no `LOAD_FILES` in a single pass" (non-dungeon-entry script) case, unrelated
to this fix.

## 4. Choosing `eclInitBlock`: id 1 (`ECL0.DAX`), corroborated by narration + geometry

With the WALLDEF fix in place, `ECL0#1`'s real `EclVm` trace (single `run()` call, no resume needed
to reach `LOAD_FILES`/`LOAD_PIECES` — a menu pause comes only *after* both effects):

```
loadFiles  → geoBlockId 1 (self-referencing, operands [1, 2, 255])
loadPieces → setBlockIds [25, 15, 14] (real WALLDEF sets, NOT a fallback)
program #4 / call redrawDungeonView
print: "WELCOME TO NEVERWINTER! YOU STAND BEFORE THE PALACE OF LORD NASHER, WHO GOVERNS THE CITY
        AND OFTEN HAS IMPORTANT MISSIONS FOR ADVENTURERS."
menu: ["PRESS ENTER TO CONTINUE."]  ← pause; auto-answered 0 reaches a terminal `exited`
```

This is unambiguous opening narration — a party arriving at the game's own title location
(Neverwinter, Lord Nasher's palace) via the lowest-numbered archive pair, the lowest id in that pair's
own clean set, and the ONLY id among the whole 4-pair sweep whose narration names the game's own
setting. It also matches the pre-existing "Verified context" note from
`neverwinter-nights-dos-combat-flow.md`/native `GBBOOT` work: *"ECL0.DAX block 1 is a clean code-0
LOAD_FILES + LOAD_PIECES boot leg"* — this session's independent web-engine sweep reaches the exact
same block by a completely different method (mechanical bootability + narration corroboration vs.
native DOS `GBBOOT` tracing), which is strong cross-validation.

No other id in the sweep has narration at all in its first-pass trace (spot-checked ids 2, 3, 7, 11,
19, 20–25, 28, 29: `loadDungeon`'s `introText` is empty for all of them, matching the "ordinary
sub-area, not the opening" shape Pools' own sweep found for its non-picked clean candidates).

## 5. GEO genuineness — HARD GATE, passed

Per the task's hard gate: decode `GEO1.DAX` block 10 and `GEO0.DAX`'s sign block, cross-checked
against the native `GBBOOT`-traced anchors in `neverwinter-nights-dos-combat-flow.md` (`(14,4)` facing
east → descriptor 229; sign descriptor 33 at `(8,14)`). "Descriptor" in the native trace is the same
concept as `MapCell.floor` (the GEO backdrop-plane byte) — see `packages/engine/src/world/dungeonEvents.ts`'s
own doc comment on `MAP_CELL_BYTE_ADDR`/`SearchLocation`, which the ECL masks down to dispatch
per-cell events, i.e. exactly the field the native trace calls "descriptor".

- `GEO1.DAX` block 10, cell `(14,4)`: `walls.east = 5` with `doors.east = 1` — a **door**, i.e. a
  walled-but-steppable edge, matching "passable step". Stepping east lands on `(15,4)`, whose
  `floor = 229` — an **exact match** to the native trace's destination descriptor.
- `GEO0.DAX` block 1, cell `(8,14)`: `floor = 33` — an **exact match** to the native trace's sign
  descriptor.
- All 29 GEO blocks across `GEO0`–`GEO3` decode as 16×16 with non-degenerate wall/door counts (64–650
  wall edges, 7–203 doors per block — no blank/degenerate maps).

Both cross-checks match exactly, independently proving the GEO plane-layout assumption
(`docs/engine/research/geo-map-format-cok.md`'s nibble model) holds for NWN's own GEO files, not just
CoK/DoK's. **Gate passed — the route is safe to ship.**

## 6. MONCHA monster layout — Gateway tail, not CoAB

`MONCHA.DAX` is 100 records × exactly 422 bytes (matches the "Verified context" note). 422 collides
between `COAB_LAYOUT` and `GATEWAY_LAYOUT` (`layoutFor` in `packages/engine/src/loaders/monster.ts`
currently only special-cases `GATEWAY_LAYOUT` for `profileId === 'gateway-to-the-savage-frontier'`).
Decoded both ways across the full 100-record corpus:

- **`COAB_LAYOUT`**: every single record reads `armorClass = 60`, `thac0 = 60` — a constant,
  degenerate, clearly-wrong combat tail (AC 60 is nonsensical; the real field is at a different
  offset in this title).
- **`GATEWAY_LAYOUT`**: **0/100 records fail** the sanity gate (`AC` in `[-10, 10]`, `HP > 0`, `thac0`
  in `[0, 20]`) — real, diverse, D&D-plausible values throughout (AC 2–10, THAC0 12–20, HP scaled
  sensibly per monster). The names include the exact two the "Verified context" note names as
  expected: **`DRACOLICH`** and **`HOODED MEDUSA`**, both present, alongside 98 other coherent
  Forgotten-Realms-bestiary names (`KRAKEN SPY`, `BANDIT`, `BLACK DRAGON`, `BEHOLDER`, `IRON GOLEM`,
  `RED DRAGON`, …).

**Verdict: `GATEWAY_LAYOUT` is the correct combat-tail format for NWN**, sharing Gateway's Stormfront
lineage as the "Verified context" note anticipated. `packages/engine/src/loaders/monster.ts`'s
`layoutFor` needed one new guarded line (mirroring the existing Gateway-only check) — see the engine
commit for the exact diff; comment cites this doc.

## 7. ITEM.DAX — `cok-63` format

`ITEM.DAX` (4603 bytes) decodes cleanly under `decodeItemArchive` (`cok-63`, plain-ASCII 63-byte
records): 60 real items with sane English names (`Small Raft Sling`, `Shield`, `Plate Mail`, `Banded
Mail`, `Chain Mail`, `10 Arrow`, `Light Crossbow`, `Short Bow`, …) and non-degenerate `baseTypeId`/
`count` fields. `decodeDokItemArchive` (`dok-17`) returns **0 records** — the coded 17-byte format's
own sniff rejects every record in this file outright. **Verdict: `itemFormat: 'cok-63'`.**

## 8. 8X8D.DAX font/frame check

`8X8D.DAX` (single shared archive, unlike Treasures/Pools' split `8X8D0`/`8X8D1`) carries blocks
`201` (1416 bytes, font), `202` (1297 bytes, frame/moons — also `BOOT_8X8D_SET4`), and `203` (1457
bytes, `BOOT_8X8D_SET0`) alongside the 37 wall-tile blocks. No `framePath` split is needed for this
profile — one archive covers walls + font + frame/boot tiles, the simplest case among the 1991+-era
titles this project has wired so far.

## 9. Open questions / honest gaps

- **`WALLDEF.DAX` blocks 14 and 24 still carry genuine (non-zero, not obviously-garbage) data beyond
  `record[0]`** (`nz-per-record` `[780,780,7]` and `[780,776,35]` respectively). The single-record
  truncation this session ships discards that extra data outright rather than inventing a theory for
  what it's for — per this project's "UNLOCATED beats invention" ethic, this is left as a genuine,
  narrow, honestly-flagged open question (does NOT block shipping: the route works correctly either
  way, since only `record[0]` is ever read).
- **No `GameMap.entries` (explicit start x/y/facing) decodes for `ECL0#1`/`GEO0#1`**, the same gap
  every prior 1991+-era title in this project has (Treasures, Pools) — `explore.ts`'s existing
  `chooseStart()` fallback covers it generically.
- **`spcPath`/`itmPath` (MONSPC.DAX/MONITM.DAX side tables) are intentionally left unwired** for this
  profile — this session did not verify their record layout against the Gateway-lineage M23.S2/M26.S1
  offsets other titles' side tables use, and wiring them unverified risks silently-wrong combat
  bonuses rather than the honest "no bonus" degrade. A future pass can verify and wire them the way
  Treasures/Pools' entries do.
- **Combat handoff (the ECL0#1 → tactical-combat leg) stays out of scope for this session**, per the
  task's explicit instruction — `neverwinter-nights-dos-combat-flow.md` already has strong native
  `GBBOOT`-side proof (ECL7 seeded combat, natural area-1 `(14,4)`→`(15,4)` combat trigger); the
  browser engine's own combat wiring for NWN specifically is future work, same status as Gateway's own
  held-back tail.
- **AOL host keys `0x4bf2`/`0xc04f`, host-chain `ECL5`/`ECL7` areas, and saves** remain unexplored by
  this session, also explicitly out of scope.
- Whether `ECL0#1` is the retail game's literal first-ever scene (vs. a later checkpoint) is
  **(inferred)** from narration content and the native `GBBOOT` cross-reference, not from a full
  decompiled boot-sequence trace of `GAME.EXE` itself.

## Implications for our engine

- A `GameData` entry for Neverwinter Nights (`'nwn'`) is unblocked: `eclPath: 'ECL0.DAX'`,
  `geoPath: 'GEO0.DAX'`, `walldefPath: 'WALLDEF.DAX'`, `tilesPath: '8X8D.DAX'`, `monPath: 'MONCHA.DAX'`,
  `itemPath: 'ITEM.DAX'`, `itemFormat: 'cok-63'`, `eclInitBlock: 1`, no `eclDialect` override, no
  `eclFallbackPieces`, `walldefSingleRecord: true`, `profileId: 'neverwinter-nights-dos'`.
- `decodeWalldefBlock`'s trailing-all-zero-record trim (packages/engine) is a general, safe
  improvement applicable to any future title with the same fixed-size-padded-block quirk, not NWN-only
  — but the more aggressive "always exactly 1 record" truncation stays profile-scoped
  (`walldefSingleRecord`) since it is NOT safe to apply blanket (CoK/DoK genuinely need multi-record
  WALLDEF blocks elsewhere).
- `monster.ts`'s `layoutFor` gains one more `GATEWAY_LAYOUT` profile match — worth checking against any
  future 422-byte-record title before assuming `COAB_LAYOUT` by default.
