# ASM Tactical Combat Grid Engine — Architecture & Task Breakdown

**Task #11 — design baseline plus native implementation notes.** Clean-room NASM x86 tactical
(grid) combat engine for the Gold Box rebuild, matching the `native/src/cc*.asm` house style
and verified byte-for-byte against the existing TypeScript combat oracle.

**Status:** native baseline in progress. The #10 ECL VM path now emits compact `GBEF` combat
records and resumes v9 post-combat branches for native smokes; `cccombat-test.ps1` also runs the
Tier-1 `FIXTURE.TRC` through `packages/engine/test/nativeCombatTrace.test.ts` for a byte-identical
TS oracle check. Milestone M4's remaining work is broader ECL-chain oracle parity and architecture
hardening. M1-M3 (grid render, initiative, attack resolution) have **no** dependency on #10 and can
proceed in parallel.

**Date:** 2026-06-25

---

## Sources (all primary, read for this design)

| Source | Path | Role |
|--------|------|------|
| Tactical combat oracle | `packages/engine/src/combat/tactical.ts` | **Authoritative rules** — initiative, movement, attack resolution, death, AI, flee |
| Positionless combat core | `packages/engine/src/combat/combat.ts` | To-hit/damage math (`runCombat`), `Combatant` model, `monsterCombatant()` |
| Encounter terrain | `packages/engine/src/combat/encounterMap.ts` | Dungeon-cell → tactical `TerrainGrid` (sub-cell expansion, wall bands, anchors) |
| Encounter glue | `packages/engine/src/combat/encounter.ts` | Roster → enemy spawn (`spawnEnemies`, ids `e0..`) |
| Deterministic RNG | `packages/engine/src/util/rng.ts` | The exact LCG combat + ECL share |
| Monster loader | `packages/engine/src/loaders/monster.ts` | Combat fields decoded from `MON{n}CHA` records |
| ECL opcode spec | `docs/engine/research/ecl-opcode-spec-for-asm.md` | §4.5 encounter/combat opcodes, §7.8 host pause/resume |
| FP renderer (house style) | `native/src/ccfp.asm` | mode-13h framebuffer, magenta-key 8x8 blit, INT 16h input loop, `/P` `/M` headless dump oracles, DAX decode |
| GEO map render | `native/src/ccgeo.asm` | GEO grid render, wall-nibble layout, VFS roles |
| Game-data parser | `native/src/ccdat.asm` | `MON{n}CHA` 409/422/216-byte record parse (combat stats source) |

---

## 1. Scope & Slices

Combat is the largest single subsystem in the engine. As with CCFP (whose first slice was
"render ONE corridor view from a fixed pose, dump a placement plan"), the Tier-1 slice here is kept
**small and verifiable** and deliberately excludes everything that is not needed to run one melee
to a victory check.

### Tier 1 — minimal melee (the CCFP-sized first slice)

Run **one real CoK encounter** end-to-end, headless-first:

1. Load the encounter roster (one monster group) and one party member.
2. Build the tactical grid from the local GEO cell (reuse `encounterMap.ts` model).
3. Place party-west / enemies-east on the grid anchors.
4. Roll/seed initiative (stored value, no per-round re-roll) and build the turn order.
5. Each combatant's turn: the AI **closes to melee range** (movement) then **melees the adjacent foe**.
6. Resolve the swing: `d20 ≥ THAC0 − AC`, nat-20 hits / nat-1 misses; roll damage; apply the
   active death rule (Gen1 `damage > hp+10` = dead; Gen2 downed = unconscious).
7. Victory check: one side wiped ⇒ the other wins; emit the `end` event with the outcome.

**Tier-1 explicitly EXCLUDES:** spells, turn-undead, explicit delay/player commands, decoded
movement rates, real encounter-map terrain import, and full multi-group tactics beyond the current
effect-handoff expansion. The native loop now includes finite-ammo missile fire with range bands and
footprint-aware line-of-fire, plus decoded monster morale for routed flee and surrender. It uses
decoded Small/Large footprints for static melee reach and per-combatant
movement allowance, routing over the 10x10 grid while rejecting each step whose full footprint
would overlap another living figure or a synthetic blocked cell, and scaling step cost by synthetic
terrain movement-cost cells. Feared actors spend that same reachability map to flee toward the
nearest edge and only leave combat after reaching the border. `/F` also exposes the party-wide flee
command: if every active party member can reach an edge it emits `party-flee escaped`, marks the party
withdrawn, and ends as `draw`; otherwise it emits `party-flee blocked` and resumes combat. Synthetic
damage and status hazards apply when a figure begins its turn on a hazard cell or ends movement/flee
there; status exposure can force fear/hold or be negated by a deterministic save target. Held/asleep
disabled flags keep a figure active for side counts while skipping its turn, and a disabled guard cannot
react. Those helpless targets are auto-hit when attacked; Gen1 melee hits coup-de-grace them, while
Gen2 and missile attacks keep ordinary damage and wake a sleeper that survives.
Timed synthetic statuses tick at round start and emit an expiry trace before the affected actor can act
again. Basic guard readiness/reaction is pinned for a no-action actor moving through the native tactical
loop; broader delay/player-command integration remains later work. Current records carry per-combatant
movement, integer attacks-per-round, and `halfAttacks` fields; fixture traces pin integer multi-attacks
and the 3/2 cadence. CoAB `MONnCHA` imports now populate `halfAttacks` from the verified full
Player-layout byte `0x11C` and choose a coherent attack1/attack2 CoAB damage profile from
`0x19E..0x1A3`; attack1+attack2 CoAB records now keep attack1 as the primary melee routine and
spend one secondary melee strike from attack2 when populated. DQK compact short-tail `MONCHA.GLB`
imports populate integer attacks from the verified `ability+0x2A` (`A+42`) attack-count byte used by
HYDRA-style records.
<!-- RETRACTED 2026-09-07: see the correction note below. `A+42` is 0 in 98 of 98 records. -->

> **RETRACTION 2026-09-07 — `A+42` IS NOT THE ATTACK-COUNT BYTE, and the word "verified"
> above is the part that did the damage.** Measured directly from
> `The Dark Queen of Krynn\DISK2\MONCHA.GLB`: **`A+42` (record byte 162) is `0` in 98 of
> 98 records** — HYDRA's included, so it is not "used by HYDRA-style records" either. The
> sentence survived here because it reads as sourced; `moncha.ts` retracted the offset on
> 2026-08-21 and `moncha-shorttail-c4.2b-2b-2a.md` re-anchored it on 2026-08-20, and this
> file — the one an implementer actually reads before writing the importer — was not
> edited either time.
>
> **The real field is a PAIR at `A+59`/`A+60` (record bytes 179/180), in half-attacks
> ("attacks per two rounds").** Verified in
> `docs/engine/research/moncha-shorttail-c4.2b-2b-2a.md` §"The attack-rate field, verified
> across two archives", which carries the byte evidence, the cross-archive control and the
> nulls. Populate `halfAttacks` from `A+59`; `A+60` is the second attack routine's rate. Full original `attack*_AttacksLeft` counter semantics remain later work, but
attack2-only CoAB records no longer decode as a mixed `1d<attack2-size>` fallback. CoK, DoK compact
`MON1CHA`, and non-compact DQK imports still use
labelled fallback attack counts until their import-side sources are located. The renderer draws decoded Large monster blocks for tactical previews.
Gen2/DQK uses the provisional 3-half-step diagonal movement cost in the ASM loop, pinned by a dedicated
synthetic trace.
The native `/E` handoff expands up to eight queued `LOAD_MONSTER` groups, capped by the
32-combatant array, and assigns deterministic right-side grid slots so multiple groups can enter
the Tier-1 melee loop. Richer group tactics remain a later tier.
GEO-derived terrain import remains a later tier.

**Tier-1 acceptance:** a seeded headless trace (CCCOMBAT `/T`, §7) is **byte-identical** to the TS
oracle's trace for the same encounter + seed; and a `/V` viewer renders the grid + figures in mode 13h.

### Later tiers (each its own milestone, §8)

| Tier | Adds | Oracle rules to port |
|------|------|----------------------|
| T2 | **Decoded movement + real terrain** | decoded move rates, GEO-derived cost/block cells feeding the existing half-step Dijkstra |
| T3 | **Missiles / thrown** | range (Chebyshev), Bresenham `lineCells` line-of-fire, ammo, range bracket ±1/0/−2 |
| T4 | **Multiple combatants & groups** | full initiative sort, multi-group roster, focus-fire AI (`weakest`) |
| T5 | **Spells / abilities** | `applyCast` area gather, saving throws, status timers, turn-undead |
| T6 | **Morale, fear, flee** | `morale_check` %-threshold, `feared` rout, party-flee escape, guard reaction |
| T7 | **Terrain obstacles & Large figures** | hazards (web/cloud), 2×2 movement blocking/occupancy, footprint-aware LoF |

The tier order matches the oracle's own CT.1→CT.7 layering, so each tier ports a self-contained
block of `tactical.ts` against an already-verified TS reference.

---

## 2. The Combat Grid Model

### 2.1 Logical grid

The oracle's `TerrainGrid` (`tactical.ts` lines 277–289) is `{width, height, blocked?, blocksSight?,
cost?, hazard?}`. The asm model carries the same: a grid of up to `GW × GH` cells (cap 32×32 for the
buffer budget; real Gold Box battlefields are ~ 16×11 to 30×20). Per-cell state:

```
cell.blocked   : 1 bit  (wall/obstacle — not enterable)
cell.blocksLoS : 1 bit  (stops missile/spell line-of-fire; defaults to blocked)
cell.cost      : 2 bits (0/1 open, 2 difficult, 4 very-difficult — TERRAIN_COST, T2+)
cell.occupant  : 1 byte (combatant index 0..N, or 0xFF = empty)
```

Tier-1 stores `blocked` + `occupant` only (one byte/cell, `0xFF` empty / else combatant index).
A `GW×GH` byte map ≤ 1024 bytes fits trivially in the `.COM` segment.

### 2.2 Source of the grid (reuse `encounterMap.ts`)

`buildEncounterTerrain` (encounterMap.ts) samples a window of dungeon cells around the party and
expands each into a `sub × sub` (default 3) block, blocking the edge band where the GEO cell stores a
wall. The asm engine reproduces this from a **GEO map member already decoded by `ccgeo.asm`** (the
GEO wall-nibble layout is documented in `ccgeo.asm` lines 12–20: plane0 `(N<<4)|E`, plane1
`(S<<4)|W`). The party always faces +col (east) in the facing-relative frame (encounterMap header),
so the asm builder uses the same `toDungeon` / `frameEdgeToDir` transform. **Tier-1 may hardcode a
flat open grid** (no walls) to keep the first slice minimal — terrain sampling is T2/T7.

### 2.3 Cell size & rendering in mode 13h

Mode 13h is 320×200, framebuffer at `A000:0000` (same as `ccfp.asm` / `ccgeo.asm`). The Gold Box
combat viewport is the upper-left battlefield box; the right/bottom carry the command bar + party
roster (later). For Tier-1, lay the grid as **`CELL=16` px** square cells from screen origin `(0,0)`:
a 16-cell-wide grid = 256 px, leaving the right 64 px for a status strip. (`CELL` is a single equ,
tunable per real screen geometry once the combat backdrop assets are known.)

**Figure sprites** reuse the verified `ccfp.asm` keyed 8x8 blit (`blit_tile`, lines 816–866): magenta
key = palette index 13 is transparent. A combat icon is a 2×2 arrangement of 8x8 sub-tiles (16×16 px,
matching `CELL`), so one figure = four `blit_tile` calls, or a single 16×16 `blit16` derived from it.
Icons come from the same `MON{n}CHA`/HLIB tile pools `cchlib.asm`/`ccgb.asm` already read. **Tier-1
may draw flat colored 16×16 blocks** (one color/side) — the CCFP-equivalent of its outline-first
`fill_piece` mode — and add real icon blits in a follow-up, so the first slice proves placement
before art.

### 2.4 Backdrop

Real Gold Box combat draws the encounter terrain (a tiled backdrop) under the figures. Tier-1 clears
the viewport (mode-13h clear, as `ccfp.asm` does) and draws only the grid lines + figure blocks. The
GEO-derived backdrop tiles are a T7 concern.

---

## 3. Data Inputs (exact formats, all already decoded)

| Input | Container / record | Decoder already in repo | Combat fields used |
|-------|--------------------|--------------------------|--------------------|
| **Monster stats** | `MON{n}CHA.DAX` (Gen1, 409-byte CoK / 422-byte CoAB / 216-byte DoK) | `native/src/ccdat.asm` and `native/src/cccombat.asm` (verified vs loaders plus CoAB Player layout) | hp, AC (`60−byte`), THAC0 (`60−byte`), damage `(Ndice d Dsize + bonus)`, xp, combatSize, morale; DoK compact records use verified AC/THAC0/damage/combatSize, with deterministic HP and zero XP until those offsets are located |
| **Encounter roster** | ECL `LOAD_MONSTER` (0x0B) groups → `{monsterId, count, picBlockId}` | `ccecl.asm` (#10) per `ecl-opcode-spec-for-asm.md §4.5` | which monster block + how many + which sprite |
| **Grid / walls** | GEO map member (`GEO.GLB` Gen2 / `GEOn.DAX` Gen1) | `native/src/ccgeo.asm` | wall nibbles → blocked cells via encounterMap model |
| **Figure sprites** | HLIB `TILE` / DAX 8x8D + `picBlockId` | `cchlib.asm` / `ccgb.asm` / `ccfp.asm` blit | combat icon pixels |

**Honest data gap (flag for the user / lead):** `loaders/monster.ts` (lines 296–315) decodes
hp/AC/THAC0/damage/xp/size/morale but **NOT** `move` (movement allowance in cells) or
`attacksPerRound` / `halfAttacks`. The oracle's `TacticalCombatant.move` and `.attacksPerRound` are
supplied by the *caller*, not the monster record — so most import paths still lack a byte-located
source for monster movement rate or attacks/round. **Resolution:** the ASM record now has
per-combatant `move`, integer `attacks`, and `halfAttacks` fields. Synthetic fixtures populate and
verify those fields, and CoAB full Player-layout `MONnCHA` imports populate `halfAttacks` from byte
`0x11C`, select attack1/attack2 damage bytes coherently from `0x19E..0x1A3`, and preserve populated
attack2 damage as a secondary melee strike when attack1 is also present; DQK compact short-tail
`MONCHA.GLB` imports populate integer `attacks` from `A+42` **— RETRACTED 2026-09-07, `A+42`
is 0 in 98 of 98 records; the field is the half-attacks pair at `A+59`/`A+60`. See the
retraction note above.**
CoK, DoK compact `MON1CHA`, and non-compact DQK imports keep labelled fallback values (`move=4`,
`attacks=1`, `halfAttacks=0`) until probes locate their real movement and attack-count sources and
extend `ccdat.asm` + `monster.ts` together. Until then those remaining paths are **labelled fallback values, not
invented data.**

---

## 4. Combat Rules — Ported from the Oracle (cite, do not invent)

Every rule below is lifted from a named function/line in the TS oracle. The asm engine reproduces the
**identical** arithmetic and ordering so the seeded trace matches.

### 4.1 RNG (must match exactly — gates the whole trace)

`packages/engine/src/util/rng.ts`:
- `next()`: `state = (state*1664525 + 1013904223) >>> 0` — the Numerical-Recipes LCG, **identical to
  the ECL VM's RANDOM** (so `ccecl.asm` and CCCOMBAT share one `next_rand`; the spec gives the asm form
  in `ecl-opcode-spec-for-asm.md §7.6`).
- `die(sides)`: `sides≤0 → 0`; `sides==1 → 1`; else `(next() % sides) + 1`.
- `roll(count, sides, bonus)`: `bonus + Σ die(sides)`, **in order** (the dice-draw order is part of the
  trace — damage rolls must draw in the same sequence as the oracle's `for` loop).

**Determinism note:** the LCG is a clean-room substitute; the original game's PRNG is UNKNOWN
(`ecl-opcode-spec-for-asm.md §8 #6`). Both engines use the LCG so the diff is exact — this is the
intended oracle, not a fidelity claim about the 1992 binary.

### 4.2 Initiative — `tactical.ts` `effectiveInitiative` (676–682), `beginRound` (917–928)

Stored per-combatant `initiative` (NOT a fresh per-round d10). Seeding: any combatant with
`initiative===undefined` gets one battle-start `rng.die(10)` (line 831) — **drawn in `combatants`
array order, before the first round.** Per round, sort active combatants by `effectiveInitiative`
**descending**, tie-broken by `bySideThenId` (party before enemy, then ascending id). Haste ×2 /
slow ÷2 (`Math.floor(v/2)`) — T6.

### 4.3 To-hit & damage — `tactical.ts` `resolveHit` (1059–1120), `combat.ts` (156–187)

```
roll   = rng.die(20)
needed = thac0 − effAc            ; Tier-1 effAc = target.ac (rear/backstab are T4/T5)
hit    = (roll==20) ? true : (roll==1) ? false : (roll >= needed)
dmg    = max(1, rng.roll(weapon.damage.count, weapon.damage.sides, weapon.damage.bonus))   ; on hit
```

The `die(20)` is drawn **before** the damage `roll` — order matters for the trace.

### 4.4 Death rule — `tactical.ts` `applyHpLoss` (1134–1142) — VERIFIED Gen1 + Gen2 fork

```
hpBefore = target.hp ; target.hp -= dmg
if target.hp > 0: return (down=false, dead=false)
lethal = (ruleset==gen2) ? false : (dmg > hpBefore + 10)     ; gen1 CoK/DoK `sub_32200`
flag target 'dead' if lethal else 'unconscious'
if target.side==enemy: xpAwarded += target.xp
```

Gen1 (`+10` overkill) is byte-verified in CoK/DoK `GAME.OVR`; Gen2 (DQK) omits it (verified absent).
The native loop defaults to `ruleset=gen1`, switches to `ruleset=gen2` for DQK `MONCHA.GLB` handoffs,
and has a `/T 5` synthetic boundary trace for the same overkill blow under Gen2.

### 4.5 Movement — `reachableCells` (447–496) — T2

Budget in **half-steps** = `move × 2`. Entering a cell costs `2 × terrainCost` orthogonally,
`diagCost × terrainCost` diagonally. **`diagCost = 4` for gen1 (CoK/DoK)** — VERIFIED vs CoK's own
movement handler at `GAME.OVR` file offset `0x118D8` (RE.6); `diagCost = 3` (1.5×) for gen2. Dijkstra
over the 8 `DIR8` neighbors (`tactical.ts` 80–82, clockwise from east). `movementLeft()` exposes
whole cells = `moveLeft/2`.

### 4.6 Targeting / AI — `aiAction` (1532–1577), `weakest` (1584–1589)

Tier-1 AI: missile fire is preferred when finite ammo and line-of-fire allow it; otherwise close on the **weakest** reachable foe (lowest hp, tie-break
nearest by Chebyshev) and melee it. `meleeTargets` (1011–1015): foes within `weapon.reach` (default 1)
by `figureDistance` (Chebyshev). A `feared` actor instead spends its movement toward the nearest
reachable edge and leaves combat only once its footprint touches that border. A fixture-gated guard
branch lets an actor with no immediate action ready a reaction strike, which fires before a moving foe
can make the attack it just enabled. Full tier AI (focus-fire, kiting ranged, explicit delay/player
commands) remains T4/T6.

### 4.7 Outcome — `finalizeEnd` (960–968)

`enemy==0 && party>0 → party` ; `party==0 && enemy>0 → enemy` ; else `draw`. Emit `end` event.
`roundCap` default 60 (stalemate guard).

---

## 5. VM ↔ Combat Interface (entry from `ccecl.asm`, return state)

Grounded in `ecl-opcode-spec-for-asm.md §4.5` and §7.8 (the pause/resume handshake the sibling #10
agent is implementing), and the TS path `vm.ts` → `encounter.ts`.

### 5.1 Entry (VM → combat)

The ECL VM builds an **encounter roster** in its state block as it executes:

```
CLEARMONSTERS (0x1C)  → enc_count = 0
LOAD_MONSTER  (0x0B)  → enc_slots[enc_count++] = {monsterId, count, picBlockId}   (3 bytes/group)
COMBAT        (0x24)  → emit combat; return status code 3 (combat) to the host
```

`ecl-opcode-spec-for-asm.md §7.1` already specs the VM state with `enc_count resb 1` /
`enc_slots resb 48` (16 groups × 3 bytes). When `EclVm_Run` returns **AX=3 (combat)**, the host:

1. For each `enc_slots` group: look up `monsterId` in the loaded `MON{n}CHA` (via the `ccdat.asm`
   record parser) to get hp/AC/THAC0/damage/xp; spawn `count` enemy combatants (ids `e0..`, matching
   `encounter.ts spawnEnemies`).
2. Append the party combatants.
3. Build the bridge grid (§2.2) from the current GEO cell. This is the Greybox WGRD/CCGEO preview
   surface; it is not a claim that DQK's original `DungCom1` / `WildCom1` 50x25 combat-map population
   has run.
4. Call `Combat_Run(seed)` (CCCOMBAT's core).
5. On return, read the **outcome** and write the result state the VM needs, then `EclVm_Resume(vm,0)`.

### 5.2 Return (combat → VM)

`Combat_Run` returns the outcome in a register + a result block. In the current
standalone DOS tool chain this is materialized as an optional `CCCOMBAT /R
result.gbr` sidecar so the text outcome file can stay compatible with `CCECL
/R`:

```
GBCR v1:
  u32 magic "GBCR"
  u16 version = 1
  u16 outcome: 0 = party win, 1 = party loss/dead, 2 = draw, 3 = party fled
  u16 xpAwarded
  u16 partyRecordCount
  u16 reserved[2]
  repeat partyRecordCount:
    u8 ordinal
    u8 condition: 0 = ok, 1 = unconscious, 2 = dead, 3 = fled
    s16 finalHp
    s16 maxHp
```

The host then applies roster state and resumes the VM. The current DOS bridge
uses the text outcome for `CCECL /R`, and `GBBOOT` reads `GBCR` to write current
HP back into `_GBPARTY.GBP` for CoK and DoK party records before resume. CoK
victories add an even split of `xpAwarded` to each imported CoK member's
verified **u32** XP accumulator at body bytes `0x116..0x119`, carrying into the
high word. The current bridge preserves body bytes `304..305`: `calc_battle_exp`
uses that u16 as a defeated monster's flat award term, so it is not a player
persistence field. When the GBPR member came from an original low-numbered CoK
save slot, GBBOOT mirrors the same HP/XP writes into `SAVE\CHRDATA#.SAV`;
subsequent native boots therefore reload the combat result instead of recreating
GBPR from stale source saves. CCCOMBAT treats zero-HP imported GBPR members as unconscious/inactive.
The remaining roster-result layer is condition/death propagation (parallels
`conditionOf` in the oracle, `tactical.ts` 1790-1796), pending verified
save-condition offsets.

### 5.3 Shared primitives

`ccecl.asm` and CCCOMBAT **share the same `next_rand` LCG** (one source of truth). They are separate
`.COM` tools during development (each its own headless oracle), but the design assumes they link/share
the RNG routine and the `MON{n}CHA` record parser (`ccdat.asm`) when integrated — see §6.

---

## 6. Memory / Segment Budget (the standing 64KB ceiling concern)

A flat `.COM` is one 64KB segment (`org 100h`). The combat engine's own footprint:

| Region | Size (Tier-1) | Notes |
|--------|---------------|-------|
| Grid cell map | ≤ 1 KB | 32×32 bytes |
| Combatant array | < 1 KB | ≤ 32 combatants × 26-byte Tier-1 struct (side/id, hp, thac0, ac, dmg, xp, flags, init, pos) |
| Event/trace buffer | ~4–8 KB | per-event line text for `/T` dump (can stream to file instead) |
| Code | ~4–8 KB | Tier-1 melee+move+render; grows per tier |
| Tile/sprite pool | shared | reuse `ccfp.asm` scratch-segment pattern (`cs+0x1000`/`+0x2000`) for DAX/HLIB decode, NOT the `.COM` segment |

**Tier-1 verdict: comfortably within one 64KB segment.** The `cc*.asm` family already keeps the large
DAX/HLIB file images in **scratch segments above `cs`** (`ccfp.asm` lines 42–47: `dax_seg = cs+0x1000`,
`dax_dseg = cs+0x2000`), so monster/sprite container data never competes with combat state. The trace
buffer streams to a file (like `ccfp.asm`'s `/M` → `CCFP.MOV`), so it costs a `linebuf`, not a 64KB
log.

**Where the ceiling becomes real (flag):** the **integrated engine** = ECL VM (#10) **+** combat (#11)
**+** renderer **+** GEO/monster/sprite loaders **+** sound (#?) in one image. Each subsystem alone fits;
combined code + the shared game-data residency (party roster, current GEO map, MON archive, ECL block,
combat state all live at once) will **push past 64KB**. This is the project's standing overlay/linker
concern (CLAUDE.md). **Recommendation:** keep CCCOMBAT a standalone `.COM` for clean-room development
and verification (it fits); treat the *integration* of #10+#11+render as the trigger point for the
overlay/linker decision — a **user/lead decision** (NASM `-f bin` flat `.COM` + manual overlays vs.
moving to a linker + multiple segments). Do not pre-commit the architecture to either here; Tier-1 does
not need it.

---

## 7. Deterministic Verification Plan (the seeded-RNG trace oracle)

Mirrors every prior milestone (CCFP `/P` placement, `/M` move trace; CCGEO render; CCECL trace): a
fixed seed → an identical event sequence dumped by **both** the asm engine and the TS oracle, byte-diffed.

### 7.1 The RNG is the linchpin

Both engines use the **same LCG with the same seed** (`rng.ts`; default `0x1234`). The asm `next_rand`
(`ecl-opcode-spec-for-asm.md §7.6`) is bit-identical. The **draw order must match**: initiative seeding
(array order, pre-round-1), then per turn `die(20)` to-hit **then** `roll(...)` damage. Any divergence in
draw order desyncs the stream and the trace diff catches it immediately — the same property that made the
ECL/move-trace diffs decisive.

### 7.2 Trace format (`CCCOMBAT /T <enc> <seed>` or `/F ...` → `CCCOMB.TRC`)

One ASCII line per event, fields space-separated, `\r\n`-terminated (the `ccfp.asm` `emit_trace`
convention). The fields mirror `TacticalEvent` (`tactical.ts` 323–378), restricted to Tier-1 event types:

```
round type actor target roll needed hit damage hpAfter dead [moveCol moveRow]
```

Examples (Tier-1):
```
1 init p0 - - - - - - -          ; initiative seeded/order line (one per combatant, in order)
1 init e0 - - - - - - -
1 move e0 - - - - - - - 3 4      ; movement appends destination col,row
1 party-flee - escaped - - - - - - ; party-wide flee command succeeded
1 attack p0 e0 14 10 1 6 9 0     ; roll=14 needed=10 hit=1 dmg=6 hpAfter=9 dead=0
1 slain p0 e0 - - - - - 0 0      ; dead=0 → unconscious; dead=1 → permadeath
2 end - - - - - - - - party      ; outcome in the 'target'/last field
```

(The exact column set is finalized against a TS `traceTactical()` helper so the two emit identical
text; numeric formatting uses the signed-decimal `put_sdec` already in `ccfp.asm`.)

### 7.3 TS harness (the oracle side)

Add a small `traceTactical(combatants, terrain, {seed})` to the TS test layer that runs
`createTacticalCombat(...).finish()` and serializes the same fields in the same order to a string. The
harness:

1. Builds the **same fixture** both engines consume: a JSON encounter `{seed, party[], enemies[], grid}`
   committed under `packages/engine/test/fixtures/` (so the asm tool reads the identical numbers).
2. Runs the TS oracle → `expected.trc`.
3. Runs `CCCOMBAT /T fixture seed` (via DOSBox, as the `tools/dosbot/` harness already drives the boot
   tests) → `CCCOMBAT.TRC`.
4. **Byte-diffs** the two. Pass = identical.

This reuses the established pattern: `tools/dosbot/` already runs `.COM` tools headless under DOSBox and
captures output; the diff gate is the same one used for CCFP/CCGEO/CCECL.

### 7.4 Why a `/T` headless mode first (CCFP lesson)

CCFP shipped `/P` (placement dump) and `/M` (move trace) *before* the textured view, so geometry was
proven without graphics. CCCOMBAT does the same: `/T` (combat trace) is the verification gate; `/V`
(mode-13h viewer) is built after the trace matches, and the viewer is judged separately (optionally by
the `tools/dosbot/` vision-judge, qwen3-vl, as the boot tests are).

---

## 8. Milestone / Task Breakdown

Ordered; each milestone has a verification **gate** that must pass before the next starts. Parallelism
and the #10 dependency are flagged.

### M0 — Fixtures & TS trace harness (LEAD / Sonnet; no #10 dep) — **do first**
- Build `traceTactical()` in the TS test layer; pick one real CoK encounter; commit the JSON fixture.
- Produce `expected.trc` for Tier-1 (constants for `move`/`attacks`, §3 gap).
- **Gate:** `expected.trc` is stable and reviewed; field/column order frozen.
- *Parallelizable with M1.*

### M1 — Grid model + mode-13h viewer skeleton (Sonnet; no #10 dep)
- Cell map, combatant array, party-west/enemies-east placement on a flat open grid.
- `/V`: clear viewport, draw grid lines + flat 16×16 colored figure blocks (CCFP outline-first analogue).
- **Gate:** viewer shows correct placement (eyeball / dosbot vision-judge). No rules yet.
- *Parallelizable with M0.*

### M2 — Tier-1 melee resolution + `/T` trace (Sonnet/Opus; no #10 dep) — **the core slice**
- Port: `next_rand` (shared LCG), initiative seed+sort, melee target pick, `resolveHit` to-hit/damage,
  `applyHpLoss` death rule, outcome check.
- Tier-1 AI: close-and-melee (native M2 currently has Dijkstra over per-combatant movement allowance
  with fallback defaults, Small/Large footprint collision, plus synthetic blocked/cost cells; M3 owns
  decoded movement rates and GEO-derived encounter-map terrain). `/E` effect-handoff enemies use
  deterministic right-side slots when multiple queued `LOAD_MONSTER` groups enter this loop.
- Emit `/T` trace.
- **Gate (the big one):** `CCCOMBAT /T` byte-identical to `expected.trc`. This is the Tier-1 done bar.

### M3 — Movement budget + terrain (T2) (Sonnet; no #10 dep)
- Half-step budget, ortho=2 / gen1 diag=4, `reachableCells` Dijkstra, blocked cells; GEO→grid via
  `encounterMap` model + `ccgeo.asm` wall nibbles.
- **Gate:** move-inclusive trace matches the oracle on a walled fixture; reachability spot-checks match
  `tactical.test.ts` line 53–63 expectations.

### M4 — VM↔combat wiring (Opus; native bridge baseline exists)
- Wire `EclVm_Run` AX=3 → spawn from `enc_slots` via `ccdat.asm` MON parse → `Combat_Run` → outcome →
  `EclVm_Resume`. Share `next_rand` + record parser.
- **Gate:** a real ECL block that fires `CLEARMONSTERS/LOAD_MONSTER/COMBAT` drives a fight and resumes;
  end-to-end trace (ECL trace + combat trace concatenated) matches a TS `runEclChain`→`resolveEncounter`
  reference. The native `CCECL /E` -> `CCCOMBAT /E` -> `CCECL /R` path now covers v9 combat-yield
  smokes, and the Tier-1 combat trace now has a TS oracle parity test; this gate still needs the broader
  ECL-chain TS reference comparison.

### M5–M8 — Later tiers (Sonnet per tier, Opus for spell/morale edge cases; no #10 dep after M4)
- **M5 (T3):** missiles — `lineCells` LoF, range bracket, ammo. Gate: missile trace matches.
- **M6 (T4):** multi-group + focus-fire AI. Gate: multi-monster trace matches.
- **M7 (T5):** spells/turn-undead — `applyCast`, saves, status timers. Gate: spell trace matches
  `combatSpells.test.ts` scenarios.
- **M8 (T6+T7):** morale/flee/guard reaction, hazards, Large footprints. Gate: each rule's trace matches.

**Parallelizable:** M0‖M1; M3, M5, M6, M7, M8 each port an independent oracle block and can be assigned
to separate Sonnet subagents once M2's trace harness + emit format exist. **Lead-driven / serialized:**
M0 (freezes the format), M2 (sets the diff gate), M4 (integration + the #10 dependency).

---

## 9. Open Questions (flag for the lead / user — do NOT decide here)

1. **Monster movement rate & attacks/round are not byte-located** (§3 gap). Tier-1 uses fallback
   movement allowances and a constant attack count; sourcing real values needs a probe extending
   `monster.ts` + `ccdat.asm` together. **Needs a go-ahead** to spend a reversing pass, or a decision
   to ship fallback values.
2. **Overlay vs. linker for the integrated engine** (§6). CCCOMBAT alone fits 64KB; #10+#11+render+loaders
   combined will not. **This is a user/lead architecture decision**, triggered at M4 integration, not now.
3. **Combat backdrop / real icon art** (§2.3/§2.4): Tier-1 uses flat blocks. Wiring the bridge
   GEO-derived tiled backdrop and the `MON{n}CHA` combat icons is deferred (T7). For DQK, the original
   50x25 `DungCom1`/`WildCom1` terrain pipeline is separate overlay-12 recovery work, not this WGRD
   bridge baseline.
4. **Gen2 (DQK) combat divergences are intentionally narrow.** The verified death `+10` absence is now
   pulled into the ASM loop via a one-byte ruleset switch. Initiative/morale remain on the Gen1-like
   path until DQK-specific evidence is located.
```
