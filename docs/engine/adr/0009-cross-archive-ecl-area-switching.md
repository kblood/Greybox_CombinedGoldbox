# ADR-0009 — Cross-archive ECL area switching (Gen1 `game_area`)

**Status:** Accepted (design only — not yet implemented)
**Date:** 2026-07-16

## Context

BUILD-QUEUE.md item 6's Campaign-grade Gen1 sub-tree needs a **wilderness/overland transition +
cross-area quest-state persistence** leaf for Curse of the Azure Bonds (CoAB). The prerequisite
research (`docs/engine/research/coab-town-classification.md`, commit `88784bc`) proved that every
CoAB area is reachable **only** through a wilderness-hub ECL archive (`ECL1.DAX`, blocks 80/81/82),
and that the hub's `NEWECL` dispatch is the sole path between all of CoAB's proven routes (the early
anchor `ECL4.DAX#37` and the middle route `ECL2.DAX#4` both link back to it). That agent flagged the
blocking limitation: **`runEclChain` only follows `NEWECL` within one already-loaded archive** — the
engine cannot execute a `NEWECL` that crosses into a *different* numbered ECL/GEO/WALLDEF/tile/mon
archive set than the one a `GameData` profile hard-codes.

This ADR pins the exact current limitation, the retail convention it must match, the minimal
engine-level change, and how to scope the wilderness-transition leaf. It does **not** implement the
change — that is the implementer's leaf (see §7).

### The retail convention (byte-grounded, from the COAB decompile oracle)

CoAB resolves "which `.DAX` file" for a `NEWECL` through a single global variable, `gbl.game_area`,
**not** through the `NEWECL` operand and **not** through any area-id→archive lookup table:

- **`NEWECL block_id`** → `CMD_NewECL()` (`coab_extracted/engine/ovr003.cs:480-491`) →
  `load_ecl_dax(block_id)` (`ovr008.cs:136-154`), whose body is literally
  `load_decode_dax(..., block_id, string.Format("ECL{0}.dax", gbl.game_area))` (`ovr008.cs:148`).
  So the `NEWECL` operand is a **bare intra-archive block id**; the archive *number* is whatever
  `gbl.game_area` currently is.
- **`gbl.game_area`** is set by the ECL `SAVE value, 0x7F12` instruction. `0x7F12` decodes to
  `alter_character` `switch_var == 0x312` (address math: `0x7F12 - 0x7C00 = 0x312`, matching the VM's
  own "0x7C00..0x7FFF are selected-player fields" note at `packages/engine/src/ecl/vm.ts:380`), whose
  handler is `seg042.set_game_area((byte)set_value)` (`ovr008.cs:654-656`, `seg042.cs:124-128`).
- **Every sibling archive** formats its filename with the same `game_area`:
  `GEO{game_area}.dax` (`ovr031.cs:695` `Load3DMap`), `WALLDEF{game_area}` (`ovr034.cs:80`),
  `8x8d{game_area}` (`ovr038.cs:12`), `MON{game_area}CHA`/`ITEM{game_area}` (`ovr003.cs:1085`,
  `ovr030.cs`), `bigpic{game_area}` (`ovr030.cs:237`). One `game_area` selects the **entire** set.

So the wilderness-hub dispatch the town-classification doc decoded —
`SAVE(1,0x4BE6); SAVE(4,0x7F12); NEWECL(37)` — is precisely: set `inDungeon=1`
(`0x4BE6`→`Area1.inDungeon`), set `game_area=4`, then chain to member 37 of `ECL4.DAX` (and, from
then on, `GEO4/WALLDEF4/8X8D4/MON4/ITEM4`). There is **no** area→archive mapping to reverse-engineer:
the archive number *is* the `game_area` value carried in the `SAVE …,0x7F12` operand, and the
`NEWECL` operand is an ordinary block id within it.

### What "one already-loaded archive" means in the current code (precise)

1. **VM (`packages/engine/src/ecl/vm.ts`).** `SAVE` (opcode `0x09`) is a plain memory write:
   `this.memory.set(this.addrOf(a[1]), this.rvalue(a[0]) & 0xffff)` (`vm.ts:896-899`). A write to
   `0x7F12` (set_game_area) or `0x4BE6` (inDungeon) is stored as an anonymous memory cell that
   **nothing reads and no effect surfaces**. `NEWECL` (opcode `0x20`, `vm.ts:920-924`) returns
   `{ status: 'chain', chainBlockId: blockId }` — just the operand, with no archive context. The VM
   has **no concept of `game_area`**.
2. **Chain runner (`packages/engine/src/ecl/program.ts`).** `BlockSource = (blockId) => Uint8Array |
   undefined` (`program.ts:19`) is a **flat closure over one archive**, built by
   `blockSourceFrom(readDaxDataBlocks(oneArchive))` (`program.ts:186-190`). On a `chain` step,
   `runEclChain` resolves the next block with `source(nextId)` against that single archive
   (`program.ts:129-135`); if the id is absent it halts (`chained block N not found`). There is **no**
   archive re-selection.
3. **Web host (`apps/web/src/ui/gameData.ts` + `explore.ts`).** Each `GameData` profile hard-codes one
   `eclPath/geoPath/walldefPath/tilesPath/monPath/itemPath` = **one `game_area`'s worth of files**
   (`gameData.ts:16-85`; the `coab` profile pins `ECL2/GEO2/WALLDEF2/8X8D2/MON2/ITEM2`, i.e.
   `game_area 2`). `startExplore` fetches exactly those single files and builds a `DungeonSources`
   from them (`explore.ts:1689-1712`), passed once to `loadDungeon`. Nothing rebinds the sources
   mid-session.

So "one already-loaded archive" = **one flat `BlockSource` closure + one `DungeonSources` triple, both
built from a single profile-pinned `game_area`.** Cross-archive `NEWECL` is impossible because neither
the VM, the chain runner, nor the host tracks `game_area` or can re-resolve the archive filename.

### Precedent: how DQK (Gen2) already does multi-area

DQK gets multi-area "for free" because **all** of its areas live in one master library
(`ECL.GLB`, `GEO.GLB`); `EclGlbArchive.blockSourceById` resolves any area id from that single
container (`apps/web/src/ui/dqkExplore.ts:750`, `runEclChain(areaId, ecl.blockSourceById, …)`). Gen1
splits areas across numbered files (`ECL1.DAX`…`ECL6.DAX`), so it must reproduce that "resolve any
area's blocks" shape **explicitly**, indexed by `game_area`, rather than inheriting it from a single
container. The reusable *shape* to mirror is "a block source that can resolve any reachable area"; the
Gen1 *realization* is a `game_area`→archive-set index, not one flat blob.

## Options

**For the archive-loading strategy:**

- **(A) Eager, `game_area`-indexed set.** Load every numbered archive for the profile up front into a
  `game_area → { ecl, geo, walldef, tiles, mon, item }` map; `NEWECL` after a `set_game_area` just
  indexes into it. **Cost:** load all N areas' archives even if unvisited. *Measured:* CoAB's **entire**
  six-area archive set (all ECL/GEO/WALLDEF/8X8D/MON/ITEM) is **~248 KB compressed** — trivial. Note
  there is no `GEO1.DAX`/`WALLDEF1.DAX` at all (the hub has no walkable grid — see §Scope), which the
  eager loader handles by simply having those sources return `null`, exactly as retail's wilderness
  branch expects.
- **(B) Lazy overlay paging.** Fetch the target archive set on the first `NEWECL` that crosses into it,
  mirroring how the DOS engine pages VROOMM overlays. **Cost:** `runEclChain` is a **synchronous, pure**
  stepper (`program.ts` docstring: "Pure and DOM-free"); injecting an async archive fetch mid-chain
  breaks that contract — the host would have to pause the chain, `await` a fetch, and resume, a much
  larger and more invasive change touching every `runEclChain` caller.

**For where `game_area` state lives:**

- **(C) VM-internal.** Teach the VM about `game_area`/filenames. **Rejected:** violates the ADR-0003 /
  ARCHITECTURE principle that the VM stays ignorant of file formats and archives.
- **(D) Surface a `setGameArea` effect; resolve archives in the host.** The VM keeps `SAVE`'s memory
  write but *also* emits a structured `setGameArea` effect for a write to `0x7F12`, exactly as it
  already surfaces `loadFiles`/`loadPieces` for `LOAD_FILES`/`LOAD_PIECES` (`vm.ts:955-968`). The
  chain runner / host reads that effect to switch the active archive set. Keeps the VM file-ignorant.

## Decision

**Adopt (A) eager, `game_area`-indexed archive set + (D) a `setGameArea` VM effect, with the resolver
kept behind an indirection so (B) lazy can be added later without changing callers.**

Rationale: the data is tiny (~248 KB for all of CoAB) and the VM's pure-synchronous contract makes
lazy paging expensive to retrofit, so eager wins decisively for Gen1 today; routing `game_area` through
an effect + a host-side resolver keeps loaders ignorant of the engine and the engine ignorant of file
formats (the standing architecture principle). The single-archive `BlockSource` path stays untouched for
callers that don't cross archives (dialogue, DQK, authored modules) — this is purely additive.

### Interface / data-model changes (implementation-ready)

1. **VM (`vm.ts`), `SAVE` handler (`0x09`, line 896).** After the existing memory write, when the
   destination address is the set-game-area register, also push an effect:
   ```ts
   // 0x7F12 → alter_character switch_var 0x312 → set_game_area (COAB ovr008.cs:654-656)
   if (this.addrOf(a[1]) === 0x7F12) {
     this.effects.push({ type: 'setGameArea', gameArea: this.rvalue(a[0]) & 0xff });
   }
   ```
   Add `{ type: 'setGameArea'; gameArea: number }` to the `EclEffect` union. The VM still does **not**
   know about filenames — it only reports "the script asked to switch to game_area N", the same
   file-ignorant contract as `loadFiles`. (Do not also special-case `0x4BE6`/`inDungeon` here; the VM
   already exposes `inDungeon` via `EclVmOptions.inDungeon` and the wilderness/dungeon tileset choice is
   a rendering concern, not a chain-routing one.)

2. **Chain runner (`program.ts`).** Add an optional area-aware source alongside the existing flat one:
   ```ts
   export interface RunChainOptions extends RunChainVmOptions {
     // …existing…
     /** Cross-archive resolver: game_area → that area's ECL BlockSource. When present,
      *  runEclChain switches the active source whenever a `setGameArea` effect fires. */
     areaSource?: (gameArea: number) => BlockSource | undefined;
     /** Initial game_area (the profile's start area). Ignored unless areaSource is set. */
     startGameArea?: number;
   }
   ```
   In the `drive` loop, when a `setGameArea` effect appears in `result.effects`, update a
   `currentGameArea` local and, if `areaSource` is set, rebind the `source` used for the *next* `chain`
   step to `areaSource(currentGameArea) ?? source`. Because the hub always emits
   `SAVE(game_area,0x7F12)` **before** the `NEWECL` (town-classification §2), the new source is active by
   the time the chain step resolves `nextId`. Callers that pass only the flat `source` are unaffected
   (no behavior change). The shared `memory` Map already persists across chained blocks
   (`program.ts:85`, reused verbatim), so a quest flag written in the early area survives the archive
   crossing automatically — that is the persistence half of the leaf, already latent.

3. **`GameData` (`gameData.ts`).** Add an optional whole-set declaration; keep the flat single-archive
   fields for backward compatibility (cok/dok/pool/secret/… are unchanged):
   ```ts
   /** Cross-archive games (CoAB) declare their full numbered archive set + start area.
    *  `dir` is the game folder; the host probes ECL{n}/GEO{n}/WALLDEF{n}/8X8D{n}/MON{n}CHA/ITEM{n}
    *  for each n in `areas` (missing files — e.g. no GEO1/WALLDEF1 for the wilderness hub — are
    *  simply absent, exactly as retail). game_area is set at runtime by SAVE …,0x7F12. */
   archiveSet?: { dir: string; areas: readonly number[]; startGameArea: number };
   ```
   A `coab-campaign` profile would set `{ dir: '…/Curse of the Azure Bonds', areas: [1,2,4,5,6],
   startGameArea: 4 }` (start in the early anchor's game_area). The existing `coab`/`coab-natural`/
   `coab-natural-2` single-area profiles stay as-is for their existing goldens.

4. **Web host (`explore.ts`).** When `gd.archiveSet` is present, pre-fetch every declared area's six
   archives into a `game_area → { ecl:BlockSource, sources:DungeonSources, mon, item }` map, pass
   `areaSource: (n) => map.get(n)?.ecl` + `startGameArea` to the chain runner, and — on a `setGameArea`
   effect — rebuild the live `DungeonSources` (GEO/WALLDEF/tiles) and monster/item DBs from the new
   `game_area`'s entry (they are keyed off `game_area` too — `ovr031.cs:695` etc.). No new renderer is
   introduced (see §Scope). Single-archive profiles keep the current `explore.ts:1689-1712` path.

## Scope of the wilderness-transition leaf — does it need a new UI renderer? **No.**

Verified directly (not assumed): the CoAB retail folder has **no `GEO1.DAX` and no `WALLDEF1.DAX`** (file
listing, this session; matches `gameData.ts:136`'s existing comment and town-classification §2). So the
`ECL1.DAX` wilderness hub is **not a walkable tile grid** — it is a menu/dispatch script:

- Block 80's first instruction is `SAVE 0 → 0x4BE6` (enter `WildernessMap`), and destination selection
  is `HORIZONTAL_MENU`/`ON_GOTO`, not free 2D movement (town-classification §2).
- `CMD_LoadFiles` **skips** `Load3DMap` when `inDungeon == 0` (`ovr003.cs:519-524`), so the hub never
  loads a GEO grid; the wilderness backdrop is a `bigpic{n}` picture + the procedural `WildernessMap`
  floor builder, which is a *separate, larger* piece of work (the city/overland-floor renderer) belonging
  to the town/city leaf — **not** required to prove a transition.

Therefore the **minimum-viable** wilderness-transition proof is an **engine-level `NEWECL` crossing**,
using the menu-driven hub via normal ECL dispatch — no synthetic map seam, and no new wilderness-floor
UI renderer:

> early anchor `ECL4.DAX#37` (game_area 4) →
> `SAVE(0,0x4BE6); SAVE(1,0x7F12); NEWECL(80)` → hub `ECL1.DAX#80` (game_area 1) →
> hub menu dispatch `SAVE(1,0x4BE6); SAVE(5,0x7F12); NEWECL(49)` → `ECL5.DAX#49` (game_area 5, the
> town-narrated village with real `GEO5.DAX#50` backing)

with a quest flag written in `ECL4#37`'s shared VM `memory` still readable in `ECL5#49` after the two
archive crossings, then surviving a save v2 `areaMemory` round-trip keyed per **(game_area, block)**
(today it keys by map name only — the persistence half of the leaf is proving multi-area keys don't
collide and a *global* campaign flag outlives an area change).

## Consequences

- Cross-archive `NEWECL` becomes a first-class, byte-grounded capability, unblocking not just the
  wilderness leaf but the later town-access (`ECL5#49`/`GEO5#50`) and ending/late-area leaves, all of
  which route through the same hub.
- The VM stays file-ignorant (reports `setGameArea`, never touches filenames); loaders stay
  engine-ignorant. The single-archive path is untouched — zero risk to existing CoK/DoK/Pool/Secret/DQK
  goldens.
- **Deferred (explicitly):** (a) lazy overlay paging — not needed at CoAB's data size; the `areaSource`
  indirection leaves the door open. (b) The procedural `WildernessMap`/city floor renderer (real walkable
  overland + `current_city` parameterization) — belongs to the town/city leaf, not this one. (c)
  Whether a *global* campaign flag needs a distinct memory scope from per-area encounter flags is a
  persistence-model detail to settle inside the route-proof leaf (retail's persistent range is Area1
  `0x4B00..0x4EFF`; a campaign flag lives there, an area-local encounter bit is wiped on area re-entry).
- **Needs a user decision? No** — this is an internal engine change with a measured, cheap eager-load
  cost and a byte-grounded retail convention; nothing here requires a product/licensing call.

## The leaf task this enables (for BUILD-QUEUE.md)

Split the single "wilderness transition" leaf into an **engine-infra** leaf and a **route-proof** leaf
(they share this ADR). See the updated wording in `docs/engine/BUILD-QUEUE.md` (item 6, the
wilderness-transition sub-tree).
