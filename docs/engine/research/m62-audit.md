# M62 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done-section entries for M57.S1–M61.S1 in full,
> and `docs/engine/research/m61-audit.md` in full (its "Rejected alternatives investigated this
> round", "Open questions / unknowns" and "Implications" sections in particular), per the brief.
> Per the brief's own steer, this round FIRST investigated M61's own flagged follow-up — whether
> DoK's import table should grow a Saves column, matching CoK's (M60.S1) — and, after tracing it
> properly rather than assuming the THAC0 precedent automatically carries over, **honestly rejected
> it**: DoK's own doc comment and on-screen paragraph never name "saves" as one of *this importer's*
> derived outputs (unlike AC/THAC0, which are named together in the identical phrase), and unlike
> AC (grounded in real `.JNK` gear) and THAC0 (grounded in the real `.GAM` THAC0 byte via level
> inference), DoK-imported saving throws would have **zero grounding in any real saved byte at
> all** — a pure class/level table lookup with no independent per-character signal — which also
> shows up as materially more degenerate real data (2 of the 5 real importable pregens tie exactly,
> vs. CoK's 1-of-6 tie). See "Rejected alternatives" for the full trace.
>
> Falling back to the standing-candidates list, this round picked up **candidate 5**
> (`wilderness.ts`'s undrawn `moonPhasesForDay` seam value, flagged since M55, gated on a
> primary-source check that had never been done) and did that check: the manual's own text
> (`docs/engine/research/cok-dragonlance-rules.md:276`, *"The current moon phase is shown at the
> top of the screen..."*) is not scoped to a specific screen, the wilderness screen's border reuses
> the EXACT SAME `8X8D1.DAX` block-202 asset and `COK_FRAME_LAYOUT` frame array the dungeon
> exploration screen uses for its own real, already-shipped top-row moon overlay (down to the same
> bracket-flanked column slots sitting empty and unused in the wilderness screen's own border art),
> and — the clincher — the current game day the wilderness screen already tracks is **already being
> fed into live wilderness combat's own spell-save math** (`fightWanderers()` → `launchCombat({day
> ...})` → `spellSaveForMember(id, day)`'s real moon-phase saving-throw shift), so the fact is not
> merely decorative, it is already mechanically live and simply invisible on this one screen.
>
> Confirmed via one throwaway `vitest` script (`packages/engine/test/_scratch_m62_verify.test.ts`,
> created, run — **4/4 green** — then deleted; `git status --porcelain --untracked-files=all` /
> `git status` both clean before and after, only this doc left untracked).

## Headline finding

### The gap: `wilderness.ts`'s overland-travel screen already loads the real moon-phase tile art and already computes the current moon phases every frame, but never draws them — unlike its own sibling, the dungeon exploration screen, which does

`apps/web/src/ui/wilderness.ts:48-49` — the wilderness screen fetches the identical asset the
dungeon screen's own moon overlay uses:

```ts
const TILES_PATH = 'Champions of Krynn/8X8D1.DAX';
const FRAME_BLOCK = 202;
```

`apps/web/src/ui/explore.ts:291` (dungeon screen) fetches the **same block**, explicitly documented
as holding both the frame chrome and the moon discs together:

```ts
const raw = tileBlocks.get(MOON_TILE_BLOCK); // block 202 = the boot UI symbol set (frame + moons)
```

`wilderness.ts`'s `loadChrome()` (`apps/web/src/ui/wilderness.ts:230-243`) decodes ALL of block
202's tiles into `state.frameTiles` (unsliced — no `.slice(26, 38)` the way `explore.ts`'s own
`extractMoonTiles()` does), so **the 12 real moon-phase tiles (indices 26..37) are already present,
decoded, and sitting in memory** every time the wilderness screen loads — just never indexed out or
drawn.

The controller already computes the real moon phases for the current in-game day, but only
exposes them to the **headless e2e seam**, never to the actual rendered screen —
`apps/web/src/ui/wilderness.ts:318-321`:

```ts
day: () => (state ? gameDayFromMinutes(state.clockMinutes) : 0),
moons: () => (state ? moonPhasesForDay(gameDayFromMinutes(state.clockMinutes)) : []),
```

Compare the render-layer compositor. `packages/engine/src/render/exploreScreen.ts` (dungeon
screen)'s `ExploreScreenInput` has a dedicated `moons` field and draws it
(`packages/engine/src/render/exploreScreen.ts:168-174`, `:324-335`):

```ts
  /**
   * The three moons, drawn over the top frame row at {@link MOON_COLUMNS} (cols 8/19/30).
   * Each is an 8×8 indexed tile for that moon's current phase (block-202 tiles 26–37);
   * entries may be null to skip. Order: [Lunitari(red), Solinari(white), Nuitari(blue)]
   * matches MOON_COLUMNS left→right as they appear on screen.
   */
  moons?: (IndexedImage | null)[];
  ...
  // 5b. The three moons overlay the top frame row at fixed columns. The moon disc sits on a
  // black cell (not the cyan bar), so clear the cell first — the moon tile's transparent
  // (magenta) pixels then show black, matching the original.
  if (input.moons) {
    input.moons.forEach((m, i) => {
      if (m && i < MOON_COLUMNS.length) {
        const col = MOON_COLUMNS[i]!;
        fillRectIndexed(fb, col * 8, MOON_ROW * 8, 8, 8, C_BLACK);
        blitTile(fb, m, col, MOON_ROW);
      }
    });
  }
```

`packages/engine/src/render/wildernessScreen.ts` (the overland screen's compositor) has **no such
field at all** — its `WildernessInput` interface (`packages/engine/src/render/wildernessScreen.ts:66-72`)
stops at `frameLayout`/`font`/`view`/`menu`, and `composeWildernessScreen`'s body
(`packages/engine/src/render/wildernessScreen.ts:96-102`) only ever calls `drawOuterBorder` — the
identical `COK_FRAME_LAYOUT` array the dungeon screen also draws its border with — and then moves
straight on to the terrain map:

```ts
export function composeWildernessScreen(input: WildernessInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);
  fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  const tiles = input.frameTiles ?? null;
  if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);
  ...
```

Because `COK_FRAME_LAYOUT.outerTop` (`packages/engine/src/render/exploreScreen.ts:108`) places
bracket tiles (21/22) at columns 7/9, 18/20, 29/31 — flanking columns 8/19/30, exactly
`MOON_COLUMNS` (`packages/engine/src/render/exploreScreen.ts:122`) — the wilderness screen's own
border ships with the bracket cutouts for a moon disc already in place at all three positions; today
they just sit empty, filled with the plain horizontal-bar tile (index 20), because nothing ever
calls `blitTile` there.

**Why this isn't just a cosmetic parity gap: the current day it never shows is already deciding a
real combat modifier in wilderness encounters.** `apps/web/src/ui/wilderness.ts:171-194`
(`fightWanderers()`) feeds the exact game day into `launchCombat`:

```ts
function fightWanderers(encounterPct: number): void {
  ...
  void launchCombat({
    party, enemies, seed: state.foeSeed, names,
    intro: ...,
    day: gameDayFromMinutes(state.clockMinutes),
    onEnd: (res) => { ... },
  });
}
```

`apps/web/src/ui/combat.ts:322-323, :352` (`makeTC()`, doc comment + body) feeds that `day`
straight into a real party spellcaster's saving-throw math:

```ts
 * (demo party, enemies), who keep the plain 1/round default. `day` (M22.S2) feeds a robed party mage's
 * own moon-phase saving-throw shift inside {@link spellSaveForMember}.
 */
function makeTC(c: Combatant, pos: GridPos, side: 'party' | 'enemy', i: number, demo: boolean, day: number): TacticalCombatant {
  ...
    save: side === 'party' && !demo ? spellSaveForMember(c.id, day) : c.monsterSpellSave,
```

`spellSaveForMember` (`packages/engine/.../party.ts:685-694`, re-exported via `apps/web/src/ui/party.ts`)
shifts the save by `moonPhaseMods(moonPhaseForDay(robe, day)).saveMod` for a robed mage. For any real
party built via `partyCombatants()` (`apps/web/src/ui/party.ts:364-366`, ids `p1..pN` matching
`spellSaveForMember`'s own id parsing), this is not hypothetical — a wandering-monster fight
triggered mid-overland-travel already rolls this modifier in today, using the exact day
`wilderness.ts` tracks. The player fighting that battle currently has **no way to see which moon
phase is in effect** on the one screen where the trip that led to the fight is actually shown —
unlike the dungeon screen, which already displays it (both in-frame and via the Companion moon-bar
widget, `apps/web/src/ui/explore.ts:1682-1684`: *"a Gold Box Companion aid alongside the emulated
screen, **which also shows them on its top row**"*).

**Primary-source check (the gate M55 left open).** `docs/engine/research/cok-dragonlance-rules.md:276`,
transcribed from the CoK manual (printed pp. 15-16): *"The current moon phase is shown at the top of
the screen and modifies the relevant mage's power."* The claim is not scoped to "the dungeon screen"
specifically, and the mechanic it documents (moon phase → mage saving throws / spells / effective
level) is a party-wide, always-in-effect state, not something that only matters underground — a
travelling mage is exactly as affected by the current phase as a dungeoneering one, and (per the
combat trace above) this project's own engine already agrees, applying the modifier identically in
both contexts. **Verdict: this clears M55's gate** — the missing display is a real fidelity gap, not
a screen-scoped non-issue the way (say) DoK's compact save format genuinely lacks a byte CoK's does.

## Real-bytes / real-mechanic verification (this round)

Reproduced via `packages/engine/test/_scratch_m62_verify.test.ts` (created, run, **4/4 passed**,
then deleted):

1. **Block 202 of the real `Champions of Krynn/8X8D1.DAX`** (the exact asset `wilderness.ts` already
   fetches as `FRAME_BLOCK`) decodes to exactly 38 tiles, confirming indices 26..37 are the same 12
   real moon-phase tiles `explore.ts`'s own `extractMoonTiles()` slices out — non-degenerate (more
   than one distinct tile among the 12, none identical to the plain bar tile 20).
2. **`moonPhasesForDay()`, fed through the exact `gameDayFromMinutes()` call `wilderness.ts`'s own
   `__wild.day()`/`__wild.moons()` seam already makes**, produces varying phase sets across a
   plausible multi-day overland trip (days 0/3/8/15/22/30) and always names all three robes
   (red/white/black) — real, live, reachable data, not a frozen placeholder.
3. **`composeWildernessScreen` really draws nothing at the moon slots today**: composed a real
   screen from the real block-202 `frameTiles` (unsliced, exactly as `wilderness.ts`'s own
   `loadChrome()` produces them) and confirmed the 8×8 cell at `MOON_COLUMNS[0]`/row 0 is
   pixel-identical to what `drawOuterBorder`'s plain bar tile (index 20) alone renders there — i.e.
   the bracket-flanked slot is inert.
4. **The fix needs zero new decode work**: blitting one of the same already-loaded real moon tiles
   (index 29, a red/Lunitari phase) onto that exact cell via the engine's own already-exported
   `blitTile`/`fillRectIndexed` primitives works exactly as `exploreScreen.ts`'s own overlay code
   does, byte-for-byte matching a scratch buffer built the same way.

Full engine suite re-run after adding the scratch file: **1340 tests passed** (1336 baseline + 4
new scratch tests); after deleting it, re-confirmed back at **1336 passed, 0 failed**.
`git status` / `git status --porcelain --untracked-files=all` are clean except this doc.

## Wiring plan

**Two engine/UI files touched (`wildernessScreen.ts` in the engine package, `wilderness.ts` in
apps/web) plus a small e2e extension** — no new UI panel, no new route, no new asset fetch (the
moon tiles are already inside the `frameTiles` array `wilderness.ts` already loads), and the
rendering approach is a direct, proven port of `exploreScreen.ts`'s own already-shipped code, not a
new design.

1. **`packages/engine/src/render/wildernessScreen.ts:13-24`** (imports) — pull in `blitTile` and
   `MOON_COLUMNS` alongside the existing `drawOuterBorder`/`COK_FRAME_LAYOUT` import:

   ```ts
   // before:
   import {
     createFramebuffer,
     fillRectIndexed,
     SCREEN_WIDTH,
     SCREEN_HEIGHT,
     type IndexedFramebuffer,
   } from './screen.js';
   ...
   import { COK_FRAME_LAYOUT, drawOuterBorder, type ExploreFrameLayout } from './exploreScreen.js';

   // after:
   import {
     createFramebuffer,
     fillRectIndexed,
     blitTile,
     SCREEN_WIDTH,
     SCREEN_HEIGHT,
     type IndexedFramebuffer,
   } from './screen.js';
   ...
   import { COK_FRAME_LAYOUT, drawOuterBorder, MOON_COLUMNS, type ExploreFrameLayout } from './exploreScreen.js';
   ```

2. **`packages/engine/src/render/wildernessScreen.ts:66-72`** (`WildernessInput`) — add a `moons`
   field, same shape/doc as `ExploreScreenInput.moons`:

   ```ts
   export interface WildernessInput {
     frameTiles?: IndexedImage[] | null;
     frameLayout?: ExploreFrameLayout;
     /** M62.S1 — the three moons, drawn over the top frame row at the same MOON_COLUMNS
      * `composeExploreScreen` uses. This screen's border already reuses the identical
      * COK_FRAME_LAYOUT/block-202 asset (bracket-flanked slots at these exact columns already
      * exist in the art, currently unused). Entries may be null to skip. */
     moons?: (IndexedImage | null)[];
     font?: BitmapFont | null;
     view: WildernessView;
     menu?: { items: readonly string[]; selected: number } | null;
   }
   ```

3. **`packages/engine/src/render/wildernessScreen.ts:100-101`** (`composeWildernessScreen` body) —
   overlay the moons right after the border, verbatim-porting `exploreScreen.ts`'s own logic:

   ```ts
   // before:
   const tiles = input.frameTiles ?? null;
   if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);

   // after:
   const tiles = input.frameTiles ?? null;
   if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);
   // M62.S1 — same overlay composeExploreScreen already does (packages/engine/src/render/
   // exploreScreen.ts:324-335): the moon disc sits on a black cell, not the plain bar, so clear
   // the cell first.
   if (input.moons) {
     input.moons.forEach((m, i) => {
       if (m && i < MOON_COLUMNS.length) {
         const col = MOON_COLUMNS[i]!;
         fillRectIndexed(fb, col * 8, 0, 8, 8, C_BLACK);
         blitTile(fb, m, col, 0);
       }
     });
   }
   ```

4. **`apps/web/src/ui/wilderness.ts`** — compute the three moon tiles from the already-loaded
   `state.frameTiles` (unsliced, so add the 26-tile offset the sibling screen's own
   `MOON_TILE_BASE` skips because it slices first) and pass them into `drawScreen()`'s existing
   `composeWildernessScreen` call. Mirrors `explore.ts`'s own `compositorMoons()`
   (`apps/web/src/ui/explore.ts:790-805`), just unsliced:

   ```ts
   // new, near the top-level consts (mirrors explore.ts's MOON_TILE_BASE/MOON_PHASE_TILE):
   const MOON_TILE_SLICE_START = 26; // block 202: moon tiles start here (frameTiles is NOT pre-sliced)
   const MOON_TILE_BASE: Record<string, number> = { red: 0, white: 4, black: 8 };
   const MOON_PHASE_TILE: Record<string, number> = { lowSanction: 0, waxing: 1, highSanction: 2, waning: 3 };

   /** The three moons (block-202 phase discs) for the current wilderness day, in MOON_COLUMNS
    * order [Lunitari(red), Solinari(white), Nuitari(black)] — mirrors explore.ts's own
    * compositorMoons(), unsliced since wilderness.ts's frameTiles keeps the full block. */
   function wildernessMoons(): (IndexedImage | null)[] {
     const tiles = state?.frameTiles;
     if (!tiles || tiles.length < 38) return [];
     const byRobe = new Map(moonPhasesForDay(gameDayFromMinutes(state!.clockMinutes)).map((m) => [m.robe, m]));
     return (['red', 'white', 'black'] as const).map((robe) => {
       const m = byRobe.get(robe);
       if (!m) return null;
       return tiles[MOON_TILE_SLICE_START + MOON_TILE_BASE[robe]! + (MOON_PHASE_TILE[m.phase] ?? 0)] ?? null;
     });
   }
   ```

   Then thread it into `drawScreen()` (`apps/web/src/ui/wilderness.ts:129-138`):

   ```ts
   // before:
   const fb = composeWildernessScreen({
     frameTiles: state.frameTiles,
     font: state.font,
     view: buildView(),
     menu: { items: WILD_MENU, selected: state.menuSel },
   });

   // after:
   const fb = composeWildernessScreen({
     frameTiles: state.frameTiles,
     font: state.font,
     view: buildView(),
     menu: { items: WILD_MENU, selected: state.menuSel },
     moons: wildernessMoons(), // M62.S1
   });
   ```

5. **`apps/web/src/ui/wilderness.ts`'s `__wild` seam** (`apps/web/src/ui/wilderness.ts:290-326`) —
   add a `moonArt` flag mirroring `explore.ts`'s own precedent (`apps/web/src/ui/explore.ts:1792`,
   `moonArt: () => (state?.moonTiles?.length ?? 0) >= 12`), adjusted for wilderness's unsliced
   array:

   ```ts
   moonArt: () => (state?.frameTiles?.length ?? 0) >= 38,
   ```

6. **Tests** (extend the existing `runWilderness` e2e case only — no new test file, no new seam
   beyond the one flag above). In `apps/web/test/e2e.mjs`, near `runWilderness()`
   (`apps/web/test/e2e.mjs:3467-3513`), mirror `runExplore`'s own moons check
   (`apps/web/test/e2e.mjs:465-478`):

   ```js
   // after reading area/tiles/startPos/startLoc, before the edge-of-map check:
   const moonArt = await page.evaluate('window.__wild.moonArt()');
   const moons0 = await page.evaluate('window.__wild.moons()');
   const moonsOk = moonArt === true && Array.isArray(moons0) && moons0.length === 3;

   // widen the existing conjunction:
   ok = area === 'Vale of Solace' && tiles === 91 && ... && moonsOk;
   // widen the error-diagnostic string to also report moonsOk.
   ```

Rough size: 1 new interface field + ~8 lines of draw logic in the engine's `wildernessScreen.ts`; 1
new helper function (~10 lines, no new imports beyond types already available) + a 1-line call-site
edit + a 1-line seam addition in `wilderness.ts`; ~4 LOC added to the existing `runWilderness` e2e
case. No new asset fetch, no new decode path — every byte and function this plan touches is already
loaded/exported today. Engine test count should remain 1336 (this round's scratch test is deleted,
not shipped).

## Layout / feasibility check

The overlay slots already exist in the border art at exactly the right place: `COK_FRAME_LAYOUT`'s
`outerTop` (`packages/engine/src/render/exploreScreen.ts:108`) places bracket tiles (21/22) at
columns 7/9, 18/20, 29/31 — flanking `MOON_COLUMNS` (8/19/30) — and `wilderness.ts` already draws
this exact layout for its own border (`composeWildernessScreen` defaults to `COK_FRAME_LAYOUT` when
no `frameLayout` is passed, same as the dungeon screen). The wilderness screen's own content
(`v.areaName` at text row 1, per `packages/engine/src/render/wildernessScreen.ts:132`) starts one
tile-row below the frame's top border row (row 0) — the same separation the dungeon screen relies
on for its own moon row — so there is no collision risk with the region-name text. The overlay draws
directly onto the border (row 0, the outermost frame row), entirely within space the border tiles
already reserve and currently fill with an inert plain bar; nothing else on the wilderness screen
occupies that row. This is the identical placement, tile source, and drawing primitives already
proven safe and correct by the dungeon screen's own shipped implementation — no new layout risk.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **DoK's import table growing a Saves column, matching CoK's (M60.S1)** — this round's brief steer, investigated first | Traced the textual-hook question properly rather than assuming the THAC0 precedent carries over: `importDokParty.ts`'s own file doc comment (`apps/web/src/ui/importDokParty.ts:9-13`) explicitly enumerates what THIS importer derives — "class, level, HP and effective AC/THAC0" — and pointedly does NOT include "saves," even though "saves" appears two sentences earlier describing the OTHER importer (B3/CoK: "unlike B3 — which carries HP/AC/THAC0/saves byte-for-byte"). Unlike THAC0 (explicitly named in the same breath as AC, `apps/web/src/ui/importDokParty.ts:225-228`), there is no equivalent "effective saves" phrase anywhere in this file or in `main.ts`'s on-screen paragraph — only the generic "effective combat stats," the same phrase already spent justifying THAC0 last round, which does not obviously stretch to cover a third, unnamed fact. More decisively: DoK-imported saving throws would have **zero grounding in any real saved byte** — `savingThrows(class, level)` (`packages/engine/src/ruleset/addnd1e/combatTables.ts:83-87`) is a pure table lookup off the ALREADY-INFERRED class/level pair, unlike AC (real `.JNK` gear) and THAC0 (real `.GAM` THAC0 byte informs the level inference) — a categorically weaker "derived" than either already-shipped column. Confirmed via the real pregens' expected values (`SAVES.fighter[7]`/`SAVES.fighter[8]` and `SAVES.cleric[7]`, `packages/engine/src/ruleset/addnd1e/combatTables.ts:61,59`): DRYDEN (fighter L7) and LILLITH (fighter L8) would show byte-identical five-save strings, and TANAR/FLAVIUS (both cleric L7) would too — 2 of the 5 real importable heroes tie exactly, a materially more degenerate result than CoK's already-shipped column (1 tie of 6, `KAL`/`SIRRION`). Declined; not force-fit just because the THAC0 pattern rhymed. |
| **Abilities getting a compact-cell precedent** (standing since M59/M60/M61) | Not re-checked this round — no new information surfaced to revisit it; M61 already re-confirmed no precedent exists. |
| **`BASE_ITEMS` catalogue coverage, DoK gap B5, `runItemPluses` e2e hardening, `moonPhasesForDay`'s OWN mechanical wiring in dungeon-vs-wilderness combat (are the two paths actually consistent?)** | The last of these was checked in passing while tracing the mechanical-consequence chain (see Headline finding) — `apps/web/src/ui/combat.ts:352`'s `spellSaveForMember(c.id, day)` gate (`side === 'party' && !demo`) is shared code, not duplicated per-screen, so there is no drift between the dungeon and wilderness paths to fix; both already call the identical function. The other three are unchanged standing candidates, not investigated this round (a strong, small, real candidate was found via the flagged primary-source check, so the round did not need to fall further down the list). |
| **`referenceDb.ts`'s Class-label collision, `dialogue.ts`/`town.ts`'s day-wiring gap, real CoK area-1's zero-item-plus curiosity, `LILLITH`'s memorized-spell total, flat-AC-10 pregen curiosity** | All standing candidates from M54-M61's lists — not re-investigated; a genuinely fresh, real, small candidate (the wilderness moon overlay) was found via this round's assigned first-check (DoK Saves) falling through cleanly to the standing list's own flagged next item, so the round did not need to widen further. |

## Open questions / unknowns

- **Should the wilderness screen also gain the modern Companion "moon bar" DOM widget**
  (`.gb-moonbar`/`renderMoons()`, `apps/web/src/ui/explore.ts:1682-1685`), the way the dungeon screen
  has both the in-frame overlay AND the companion aid? This audit's wiring plan only proposes the
  period-accurate in-frame overlay (the fix the manual's own claim and the mechanical-consequence
  trace directly support); the companion widget would be a reasonable, small follow-up but is a
  separate, additive UI decision left to the lead, not folded in here to keep the change minimal.
- **Should `wilderness.ts`'s demo-party fallback path (`DEMO_PARTY`, used only when
  `partySize() === 0`) be excluded from the moon-based spell-save shift the same way `combat.ts`'s
  `demo` flag excludes the standalone `?combat=1` demo?** Traced during verification: `fightWanderers()`
  never sets `launchCombat`'s `demo` flag explicitly, so a `DEMO_PARTY` fight (no real roster yet)
  still runs `spellSaveForMember('p1', day)` against an EMPTY roster — confirmed safe by reading
  the function itself (`idx >= roster.length` is bounds-checked and returns `undefined`, not a
  throw). This is a pre-existing, narrow edge case orthogonal to this round's finding
  (it doesn't affect any REAL, roster-backed party, which is the case this audit's mechanical-
  consequence argument rests on) — flagged for a future round to check, not fixed here.
- **Exact on-screen moon-cycle day lengths** (`MOON_CYCLE_DAYS`, `packages/engine/src/ruleset/
  addnd1e-dragonlance/moons.ts:45-49`) are explicitly documented as a presentation choice, not a
  primary-sourced constant ("the Journal does not print exact day counts... a presentation choice and
  can be retuned if a primary source surfaces") — unchanged by this round, inherited as-is by the new
  wilderness overlay exactly as the dungeon screen already accepts it.

## Implications for our engine

- **A standing candidate explicitly gated on "needs a primary-source check before treating as a real
  gap" (M55's own framing) is worth actually doing that check, rather than leaving it parked
  indefinitely.** Five rounds (M55-M61) left `wilderness.ts`'s moon gap alone because nobody had
  confirmed the manual's claim applied to this screen; one grep into the already-transcribed manual
  text plus one read of the sibling screen's own implementation resolved it cleanly in under an hour
  of investigation. Not every parked candidate needs new information to surface — some just need the
  gate condition itself checked.
- **"Does the sibling screen already have a shipped, provably-safe implementation of this exact
  feature" is a stronger and cheaper verification path than starting from scratch.** This round's
  fix is a near-verbatim port of `exploreScreen.ts`'s own `moons` field/draw logic — same tile
  source, same layout constant, same bracket-shaped slot in the border art — which is what let the
  layout/feasibility check conclude "no new risk" with high confidence rather than needing a fresh
  pixel-budget analysis.
- **Steered candidates should still be independently re-derived, not rubber-stamped, even when the
  lead's own framing suggests they're likely to pan out.** This round's brief specifically invited
  reconsidering DoK's Saves column given "the pattern rhymes" with THAC0's fix — but tracing the
  actual textual hooks and the underlying data's provenance (real-byte-grounded vs. pure table
  lookup) turned up a genuine, principled difference from THAC0's case, not just a weaker version of
  the same argument. Confirms M58's precedent that "investigate honestly and decline if it doesn't
  hold up" is a real, exercised option in this loop, not just a formality.
- **A fact can be "mechanically live" (decides a real combat roll) while still being completely
  invisible to the player on the one screen where the decision that leads to that roll is made** —
  distinct from the more common "decoded but never read by any consumer" shape this loop usually
  finds. Here the consumer (`spellSaveForMember`) is real and already firing; the gap is purely in
  what the screen chooses to render, not in whether the data reaches gameplay at all. Worth keeping
  as a distinct pattern to check for: "is this fact already deciding something the player can't see
  the input to" is a different (and often stronger) motivator than "is this fact decorative."
