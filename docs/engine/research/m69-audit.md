# M69 audit — the next "computed but unwired" candidate

> Audit method per the brief: read `docs/engine/research/m68-audit.md` in full (its "Verification
> evidence", "Rejected alternatives investigated this round", "Open questions / unknowns", and
> "Implications" sections in particular), plus skimmed M63-M67 for the established "sibling field on
> the same object" method and the "stale declined-because-X" check M68 introduced. Every candidate
> below was grepped against **every** `docs/engine/research/m*-audit.md` file for its exact
> field/function name before being accepted or dropped.
>
> **Stale-blocker sweep (the brief's second pattern), done explicitly this round:** grepped all audit
> docs for "would need a new export" / "not yet exported" / "no UI panel" / "doesn't exist yet" style
> phrasing (see "Stale-blocker sweep" section below). Found one already-resolved case (M45's own
> `.inflict` flag — resolved and shipped at M68, so nothing left to do) and one already-independently-
> resolved case (M40's note that `halfDamage` "needs a DoK Companion-Panel e2e scaffold that doesn't
> exist yet" — resolved by M43.S1, which is already live in current `referenceDb.ts`). No newly-stale
> blocker was found this round beyond what M68 already closed.
>
> **Headline pick, found via the `itemCategory()`/`DqkItemRecord` dead end this round's brief
> specifically flagged as fair game:** chasing that thread led first to re-confirming `DokItemRecord
> .value`/`.magicBonus` is still correctly dead (M31/M39/M66 already killed it — an offset-map red flag
> and a still-blocked item-instance subsystem). That dead end redirected the search to the **live
> tactical-combat party panel** (`apps/web/src/ui/combat.ts`'s `panelRows()`), which M42.S1 already
> extended once (adding a `down` field, read from the SAME `state.combatants` array). Re-checking that
> exact function against its own source object's full field list (the "sibling field" method, one more
> level deep than M42 went) found that `TacticalCombatant.flags` — the `Set<TacticalStatusFlag>` that
> `panelRows()` already iterates `c` over every draw — carries `asleep`/`held`/`feared`/`slowed` (real,
> mechanically decisive, already-tested-against-real-DoK-monster-data statuses) that the panel never
> reads at all, even though `.hp` and (since M42) `conditionOf(c.id)` on the exact same object already
> reach the screen.

## Headline finding

### `panelRows()` already loops over `TacticalCombatant.flags`-bearing objects every frame, but never reads `.flags` — so a party member who is asleep, held, feared, or slowed shows identically to an unaffected ally on the one screen that's on-screen for the whole fight

`apps/web/src/ui/combat.ts`'s `panelRows()` (`combat.ts:493-506`) builds the right-hand party panel
`composeCombatScreen` draws every frame of a live battle:

```ts
function panelRows(): ExploreParty[] {
  if (!state) return [];
  return state.combatants
    .filter((c) => c.side === 'party')
    .map((c) => ({
      name: state!.names.get(c.id) ?? c.id,
      ac: c.ac,
      hp: Math.max(0, c.hp),
      active: c.id === state!.activeId,
      // M42.S1 — ...routed through the engine's own tested conditionOf()...
      down: state!.combat.conditionOf(c.id) !== 'ok',
    }));
}
```

`c` here is a live `TacticalCombatant` (`state.combatants: TacticalCombatant[]`, `combat.ts:132`) — the
exact same mutable object the tactical engine mutates in place every round (confirmed by this round's
scratch test, see below). `TacticalCombatant` carries (`packages/engine/src/combat/tactical.ts:172-173`):

```ts
/** Status flags that gate acting (asleep/held skip the turn; fled/surrendered remove the figure). */
flags: Set<TacticalStatusFlag>;
```

where `TacticalStatusFlag` (`tactical.ts:112-113`) is:

```ts
export type TacticalStatusFlag =
  | 'asleep' | 'held' | 'feared' | 'fled' | 'surrendered' | 'hasted' | 'slowed' | 'unconscious' | 'dead';
```

`panelRows()` reads `c.hp` and calls `conditionOf(c.id)` (which only ever returns `'ok' | 'unconscious' |
'dead'`, `tactical.ts:678` — purely HP-derived) but never reads `c.flags` at all. `ExploreParty`
(`packages/engine/src/render/exploreScreen.ts:144-157`, the shared row type M42.S1 already extended
once) has no field for it either:

```ts
export interface ExploreParty {
  name: string;
  ac: string | number;
  hp: string | number;
  active?: boolean;
  down?: boolean;   // M42.S1 — fallen this fight
}
```

So today: a party member who has been put to sleep, held, feared, or slowed by a real enemy spell (or a
real battlefield hazard) shows in **exactly the same green/white text** as an untouched ally, for every
round of the fight except the one round the status was inflicted (when a log line briefly narrates it,
per `combat.ts`'s `statusVerb()`, CT.5a/M55). The party panel is the one screen that stays on-screen for
the whole battle; the log is 5-6 lines and scrolls (`combat.ts:510`, `.slice(-5)`), so the "X is held"
line is easy to lose in a longer, multi-actor fight.

### This is not a cosmetic gap — three genuinely distinct mechanical consequences hinge on it, none currently visible

1. **Asleep/held party members never get a turn at all**, silently. `positionCursor()`
   (`tactical.ts:1019-1038`) skips them outright:
   ```ts
   if (actor.flags.has('asleep') || actor.flags.has('held')) { oidx++; if (oidx < order.length) beginTurn(order[oidx]!); continue; }
   ```
   A player could go several rounds wondering why one character "never gets a turn" with zero
   persistent on-screen indication of why — `active` (white) never lights up for them (confirmed: they
   can never become `current()`), so there's no positive signal either, only an absence.

2. **A helpless (asleep/held) party member is one landed melee hit from instant death**, per the exact
   mechanic M50.S1 already surfaced for the *attacker's* side (targeting an enemy): `resolveHit()`
   auto-hits a helpless target (CT.5a) and, when `slaysHelpless()` is true (gen1 — CoK/DoK), the coup de
   grace (CT.7j) kills it outright, bypassing the normal HP/overkill check (`tactical.ts:1134-1156`).
   M50 fixed the *pre-attack targeting banner* so a player attacking a helpless **enemy** gets a warning.
   Nothing plays the mirror role for a player's **own** helpless party member: if an enemy manages to
   land any melee swing on your held cleric, they die outright, and the party panel gives no warning
   this state exists going into that round.

3. **Feared party members lose Attack/Cast this turn** (`legalActions()`, `tactical.ts:1751-1752`:
   `if (!acted && !actor.flags.has('feared')) { ...push melee/missile/cast... }`) — they still become
   `active` (get a turn), but the command menu silently offers fewer options, with no on-screen
   explanation of why (only the original "X is feared" log line, likely scrolled off by now).

### Real, verified mechanical source: enemy monster spellcasting already inflicts these on the party, not just a synthetic engine capability

This is not merely a theoretical shape of the type system — real, bundled DoK monster data already
drives it. `packages/engine/src/ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts`'s
`DOK_SPELL_CROSSWALK` (lines 27-41) maps real DoK monster memorized-spell ids (from `MON{n}WIZ.DAX`,
decoded by `decodeMonsterWizArchive`) to this engine's own spell ids, including three of the five
`InflictableStatus`-bearing spells:

```ts
export const DOK_SPELL_CROSSWALK: Readonly<Record<number, string>> = {
  ...
  21: 'm1-sleep',
  23: 'c2-hold-person',
  34: 'm2-stinking-cloud',
  ...
  49: 'm3-hold-person',
  ...
  84: 'm4-fear',
  ...
};
```

`packages/engine/test/dokSpellCrosswalk.test.ts` (lines 31-40, 42-50) golden-tests this crosswalk
against **real monster memorized-spell lists** (comments cite the specific monsters by name):

```
'real monster id 97 (IGORF, DoK): [47,32,33,34,10,15,21] crosswalks to exactly 4 castable spells'
  → Fireball, Stinking Cloud (34 → 'm2-stinking-cloud', inflict.status = 'held'),
    Magic Missile, Sleep (21 → 'm1-sleep', inflict.status = 'asleep')
'real monster id 49 (TANAR, DoK): raw memorized ids 23×3 (C:Hold Person), 74×3 (C:Flame Strike)'
  → Hold Person (23 → 'c2-hold-person', inflict.status = 'held'), usesLeft = 3
```

Whether this actually reaches a **party** member (not just an enemy) turns on `tacticalSpellFor()`'s
target resolution (`combatSpells.ts:112-115`):

```ts
const target: 'enemy' | 'ally' | 'self' =
  isHeal ? 'ally'
    : inflict ? (inflict.status === 'hasted' ? 'ally' : 'enemy')
      : effect.target === 'self' ? 'self' : 'enemy';
```

`'enemy'` here is **relative to the caster's side**, not a hardcoded "the player's enemies." Both the
AI's own action-builder and the legal-action list resolve it that way:

```ts
// tactical.ts:1758 (legalActions)
const want: CombatSide = s.target === 'enemy' ? foeSideOf(actor) : actor.side;
// tactical.ts:695
const foeSideOf = (c: TacticalCombatant): CombatSide => (c.side === 'party' ? 'enemy' : 'party');
```

So when IGORF or TANAR (side `'enemy'`) casts a `target:'enemy'` spell, `foeSideOf(actor)` resolves to
`'party'` — the spell is aimed at the **player's own characters**. `chooseOffensiveCast()`
(`tactical.ts:1681-1696`, called from `aiAction()` at `tactical.ts:1599`) is exactly the AI logic that
picks this in a real, unscripted encounter. This round's scratch test (below) drives this real path
end-to-end and confirms a party member really does end up `flags.has('held') === true`.

A second, side-agnostic real mechanism reaches the same place: battlefield hazards. `applyHazardTo()`
(`tactical.ts:851-869`) applies `haz.status` to **whichever combatant's turn ends the round standing in
the cell** — party or enemy, no side check at all (`tactical.test.ts:903-921` already covers a `held`-
inflicting web hazard in the existing suite). A Stinking Cloud's gas cloud left on the battlefield can
catch a party member who walks or ends a turn in it, independent of who cast it.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m69_verify.test.ts` (created, run, 4/4 green, then deleted):

1. **Real-id crosswalk check**: `preparedSpellsFromDokIds([23, 23, 23, 74, 74, 74], 6)` (TANAR's real
   memorized-id list, the exact array `dokSpellCrosswalk.test.ts` golden-tests) resolves a
   `'c2-hold-person'` `TacticalSpell` with `target: 'enemy'` and `inflict: { status: 'held', rounds: 6
   }` — confirmed via `.toEqual`.
2. **End-to-end engine path, not a hand-set flag**: built a 2-combatant `createTacticalCombat` scenario
   — one `'enemy'`-side caster carrying TANAR's real prepared spells, one adjacent `'party'`-side hero —
   and called the engine's own `aiAction()` (not a scripted action). It returned
   `{ type: 'cast', spellId: 'c2-hold-person', targetId: 'p1' }` (the party member), proving the AI
   itself, unprompted, chooses to cast Hold Person at the party. Applying that action via `combat.apply()`
   set `hero.flags.has('held') === true` on the real object. `combat.conditionOf('p1')` was still
   `'ok'` afterward — the one existing status-agnostic getter does not surface this real, active
   affliction.
3. **Static source proof** (apps/web has no vitest harness of its own — same standing constraint noted
   in M67/M68's own Test 3/4): read `apps/web/src/ui/combat.ts` from disk and confirmed `panelRows()`'s
   function body contains `.hp`, `.ac`, and `conditionOf` but not `.flags`; read
   `packages/engine/src/render/exploreScreen.ts` and confirmed `ExploreParty`'s interface body contains
   no field matching `/status|impaired|afflict/i`.
4. **Distinguishing the two failure shapes this finding covers**: confirmed a `feared` party member
   (unlike `asleep`/`held`) is NOT skipped by `positionCursor()` — it still becomes `current()`/`active`
   — but `legalActions()` excludes `melee`/`cast` for it, matching the "restricted menu, not skipped
   turn" mechanism described above.

`git status --porcelain` after deleting the scratch file: clean (only this doc is untracked).
Full engine suite: 1347 passed with the 4 scratch tests present (1343 baseline + 4); 1343 again after
deletion — no regression, no source file touched.

## Why this wasn't already picked up (grep evidence against every prior round)

- **`panelRows`** — the only prior hits are all `m42-audit.md` (the round that added `down`, reading it
  from the exact same `state.combatants` loop this round extends further). No round after M42 re-opened
  `panelRows()`'s field list against its own source object (`TacticalCombatant`)'s full field list.
- **`flags`/`flagsOf`/`TacticalStatusFlag`** — `m50-audit.md` is the only other hit with real content: it
  found and shipped `slaysHelpless()` reaching the pre-attack **targeting banner** (`highlightTarget()`,
  an *enemy*-facing hint for the player's own attack decision) — a different UI surface entirely from
  the persistent party-status panel this round targets, and a different direction (attacker choosing a
  target vs. defender's own status being visible). M50 does not mention `panelRows()`, `ExploreParty`, or
  the party panel at all.
- **`asleep`/`held`/`feared`/`slowed`** (combined with "panel") — no hits anywhere describing this
  specific gap; the only related hits are M55 (confirms `.inflict` reaches the combat **log**, a
  different, already-resolved question — see M68's own writeup) and M68 itself (the Reference-DB
  spell-browser preview, a pre-hoc / different-screen gap, now shipped).
- **`DokItemRecord.value`/`itemCategory()`/`DqkItemRecord`** (the thread this round's brief specifically
  suggested chasing) — confirmed still correctly dead: `m31-audit.md` (exact-multiple-of-256 red flag),
  `m39-audit.md` (still-blocked item-instance subsystem), `m66-audit.md` (re-confirms both, plus
  `TreasureItem.value` separately already wired by `m30-audit.md`). `dqkItem.ts`'s `DqkBaseItem`/
  `DqkItemRecord` reconfirmed zero `apps/web` consumers (`m67-audit.md`, `m68-audit.md`) — still out of
  scope, not picked.

**No prior round proposed or rejected "show a live status flag (asleep/held/feared/slowed) on the
tactical combat party panel" under any framing.** This is a fresh candidate.

## Stale-blocker sweep (this round's specific check, per the brief's second pattern)

Grepped all `docs/engine/research/m*-audit.md` for "would need... export/infra", "not yet exported",
"no UI panel", "doesn't exist yet" style phrasing (see the two hits below) and checked whether the
stated blocking condition still holds today:

- **M45's `.inflict` flag** ("not exported at all today ... would need a small new export") — already
  found stale and closed by **M68** (this round independently re-confirmed M68's fix is live in current
  `referenceDb.ts:218-222`, reading `geo.inflict`). Nothing left to do here.
- **M40's `halfDamage` note** ("needs a DoK Companion-Panel e2e scaffold that doesn't exist yet") —
  checked against current `referenceDb.ts:148`: `...(m.halfDamage ? [{ label: 'Half Dmg', value: 'Yes' }] : [])`
  is already present, credited to **M43.S1** in the surrounding comment block (line 142-148). Already
  resolved independently of M40's own note; nothing left to do.

No other "declined because X doesn't exist yet" note was found to have quietly gone stale this round
beyond these two already-closed cases (both closed by other rounds, not silently still open).

## Wiring plan

Small, additive, three-part change, following the exact shape M42.S1 already established for `down`
(one new optional field on the shared `ExploreParty` row type, one apps/web mapping line, one render
color branch) — no new engine API needed (`c.flags` is already in scope inside `panelRows()`, on the
exact object it already iterates).

**1. `packages/engine/src/render/exploreScreen.ts`** — add one optional field to `ExploreParty`
(additive; `composeExploreScreen`'s own party panel, like `down`, intentionally never sets or reads it —
there is no live tactical-combat state outside a battle):

```ts
export interface ExploreParty {
  name: string;
  ac: string | number;
  hp: string | number;
  active?: boolean;
  down?: boolean;
  /**
   * M69.S1 — currently under a disabling status (asleep/held/feared/slowed) this fight. Colour-only
   * signal (no text-column budget in this fixed-width panel, see the Layout section below); does not
   * distinguish which status, only that one applies. Intentionally excludes `hasted` (a buff, not a
   * warning) and `fled`/`surrendered`/`unconscious`/`dead` (already covered by `down`).
   */
  impaired?: boolean;
}
```

**2. `apps/web/src/ui/combat.ts`**'s `panelRows()` — one new line, reusing `c.flags` already in scope:

```ts
function panelRows(): ExploreParty[] {
  if (!state) return [];
  return state.combatants
    .filter((c) => c.side === 'party')
    .map((c) => ({
      name: state!.names.get(c.id) ?? c.id,
      ac: c.ac,
      hp: Math.max(0, c.hp),
      active: c.id === state!.activeId,
      down: state!.combat.conditionOf(c.id) !== 'ok',
      // M69.S1 — c.flags is the same live TacticalCombatant Set inflictStatus()/tickStatuses() mutate
      // every round (CT.5a); asleep/held silently skip the actor's turn (positionCursor), feared
      // strips Attack/Cast from legalActions() while still letting the turn happen — neither was ever
      // visible on this persistent panel before now (only a one-time, scroll-prone log line).
      impaired: c.flags.has('asleep') || c.flags.has('held') || c.flags.has('feared') || c.flags.has('slowed'),
    }));
}
```

**3. `packages/engine/src/render/combatScreen.ts`** — one new color constant + one ternary branch,
inserted at the same priority position the file's own shipped test already locks in for `active`/`down`
(`combatScreen.test.ts:165-188`, "active still wins over down"): append `impaired` as the next tier
below `down`, above the default green, so it fires whenever a member is neither the active actor nor
down:

```ts
const C_GRAY = 8; // downed member
const C_YELLOW = 14; // M69.S1 — impaired (asleep/held/feared/slowed); same EGA index mainMenu.ts uses
                      // for its own unrelated "unconscious roster member" tier — different specific
                      // meaning in this file, no shared runtime state, just a reused "caution" color.
```
```ts
const color = p.active ? C_WHITE : p.down ? C_GRAY : p.impaired ? C_YELLOW : C_GREEN;
```

No other caller of `ExploreParty`/`composeCombatScreen` sets `impaired` (grepped: `mainMenu.ts` and
`explore.ts`'s own out-of-combat party rows never touch tactical `flags`), so every other screen is
pixel-identical to today — purely additive, matching M42's own "no behaviour change to any existing
caller" note.

**4. `packages/engine/test/combatScreen.test.ts`** — extend the existing M42 "greys a downed
party-panel row" test (lines 165-188) with the same `rowHasColor` helper:

```ts
const impairedFb = composeCombatScreen({ font, party: [{ name: 'Fizban', ac: 5, hp: 9, impaired: true }] });
expect(rowHasColor(impairedFb, 14)).toBe(true); // C_YELLOW
expect(rowHasColor(impairedFb, 10)).toBe(false); // never green

const downBeatsImpairedFb = composeCombatScreen({ font, party: [{ name: 'Fizban', ac: 5, hp: 0, down: true, impaired: true }] });
expect(rowHasColor(downBeatsImpairedFb, 8)).toBe(true); // C_GRAY — down still wins over impaired
expect(rowHasColor(downBeatsImpairedFb, 14)).toBe(false);

const activeBeatsImpairedFb = composeCombatScreen({ font, party: [{ name: 'Fizban', ac: 5, hp: 9, active: true, impaired: true }] });
expect(rowHasColor(activeBeatsImpairedFb, 15)).toBe(true); // C_WHITE — active still wins (matches down's own precedent)
expect(rowHasColor(activeBeatsImpairedFb, 14)).toBe(false);
```

**Optional e2e verification** (not required to ship, matching M67's own "optional, small e2e extension"
precedent): the existing `?combat=1` demo party has no enemy spellbook (`DEMO_SPELLBOOKS` is keyed only
to player-side ids p3/p4, `combat.ts:273-282`), so it cannot exercise the party-gets-afflicted path
today. A real DoK dungeon encounter against a caster monster (IGORF/TANAR-equivalent, if one is
reachable from a bundled save/area already exercised by an existing `runExploreDok`-style e2e case)
would be the natural real-data route; this round did not locate or build such a route — flagged as an
open question below rather than asserted.

## Layout / feasibility check

The tactical party panel is a **fixed-width, column-based** layout, unlike the flexible-row Reference
DB / character sheet panels prior rounds (M63-M68) extended: `PANEL_COL = 17` (name), `PANEL_AC_COL =
31`, `PANEL_HP_COL = 36` (`combatScreen.ts:59-64`), on a 320px/40-column screen. This leaves **no spare
column** for a text label — appending even a short suffix to the name column risks collision with real
character names up to 15 characters (`savedCharacter.ts:11`, "name (length byte + ASCII, ≤ 15)"), which
would overrun the 14-column gap before `PANEL_AC_COL`. This is why the wiring plan above is **colour-only**
(reusing the exact mechanism M42.S1 already shipped for `down`), not a new text row/column — a genuine,
checked layout constraint, not an assumption. No new row, no new column, no change to `PANEL_MAX_PLAYERS`
(6) or any existing width budget; the exact same three `drawText` calls run unconditionally today, only
the `color` expression changes, identical in shape to M42's own fix.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| `itemCategory()` / `DqkItemRecord.effectCode`/`.specialCode` (this round's brief-suggested starting thread, flagged fair game by M68) | Re-confirmed `DqkItemRecord`/`DqkBaseItem` still have zero `apps/web` consumers (grepped fresh) — same "reaches no UI panel" rejection as M67/M68. `DokItemRecord.value`/`.magicBonus` (the CoK-side `itemDb`/`itemCategory()` path) is still correctly dead per M31 (offset-map red flag)/M39/M66 (still-blocked item-instance subsystem) — re-confirmed, not re-litigated. |
| Showing `hasted` (the 5th `TacticalStatusFlag`, a buff not a warning) on the same panel | Deliberately excluded from this round's `impaired` boolean — a positive-buff indicator is a different, additive UI signal (would want its own colour/tag, not lumped with "in trouble"), and `m3-haste`/`m3-slow` aren't in `DOK_SPELL_CROSSWALK` (only reachable via a real party-cast Haste on itself, or a future crosswalk entry), so the real-data grounding for it is weaker than `held`/`asleep`/`feared`. Left as an explicit non-goal, not silently dropped — see Open Questions. |
| Showing the *specific* status name (not just a generic "impaired" boolean) | Ruled out by the Layout section — the panel has no text-column budget for it, unlike the Reference DB/character-sheet screens M63-M68 extended. A colour-only signal is the honest, checked-feasible version of this fact for this specific screen. |
| Extending `visibleCells()`/`CombatCellState` (the enemy-side grid icons) with the same signal | A real, symmetric candidate (an enemy grid icon could show the same colour when held/asleep/feared) but a second, separate compositor path (`drawCombatant()`, not `panelRows()`) with its own layout/z-order questions (icon recolouring vs. a new overlay glyph) — kept out of this round's minimal-diff scope; flagged as a natural follow-up, not investigated in depth. |
| A possible related HD-cap bug: `TacticalCombatant.hd` is `undefined` for every party member (only monsters carry it), so Sleep's `hdCap: 4` never actually gates a party member (`capOk` is `cap === undefined \|\| t.hd === undefined \|\| t.hd <= cap` — the `t.hd === undefined` branch always makes it `true` for a PC) | Real, but a different class of finding (a possible rules-fidelity gap in the Sleep HD-cap check, not a "decoded-but-dropped display fact"). Noted here for visibility but not investigated further or folded into this round's fix — a genuinely separate mechanics question, out of scope for this loop's display-gap shape. |

## Open questions / unknowns

- Whether a future round should also extend the **enemy** grid icons (`visibleCells()`/
  `CombatCellState`) with the same impaired signal — not investigated this round (see Rejected
  Alternatives); a real, plausible, but separate follow-up.
- Whether `hasted` deserves its own positive-buff indicator on the panel — deliberately out of this
  round's scope (see Rejected Alternatives); **UNKNOWN** whether the lead session wants it bundled in
  or left for later.
- No concrete e2e route was found or built this round to drive a real party member into `held`/
  `asleep`/`feared` through the actual `?explore=dok` → combat UI (the demo `?combat=1` route's enemies
  carry no spellbook). The engine-level scratch test (this round) and the render-level unit test (the
  wiring plan's item 4) ground the claim without it, matching the bar M67/M68 also used, but a real
  end-to-end browser verification of the colour change remains **UNKNOWN/not done**.
- The Sleep HD-cap fidelity question noted in Rejected Alternatives (`t.hd === undefined` always passing
  the cap check for PCs) is flagged but **not investigated further** — a candidate for a future round if
  no stronger display-gap candidate turns up, but it's a different shape of finding than this loop's
  usual "computed but unwired" pattern.

## Implications for our engine

- **The "sibling field on the same object, partially read" method keeps generalizing to new screens.**
  M63/M64/M67/M68 all found this shape inside flexible-row panels (character sheet, Reference DB); this
  round shows it applies equally to a **fixed-width, colour-only** panel (the tactical combat screen),
  where the "unread sibling field" manifests as a missing colour tier rather than a missing text row —
  the same underlying failure (a compositor iterates an object, reads some fields, silently drops
  others), just a different rendering medium.
- **A previous round's own fix can be a breadcrumb to a bigger one nearby, not just a closed case.**
  M42.S1 added `down` to this exact function/interface pair; this round found that M42's own precedent
  (reading a derived fact off `state.combatants` into `ExploreParty`) was never re-applied to the richer
  `flags` set sitting on the very same object M42 already had in hand. Worth treating a shipped minimal
  fix as an invitation to re-check the same object for further unread fields, not just a closed ticket.
- **A UI-hint-shaped predicate can ship for one "side" of an interaction (M50's `slaysHelpless()` on the
  attacker's targeting banner) while the mirror-image "victim's own status is visible" case stays
  unwired indefinitely**, because the two live in different files/compositors and neither round's grep
  net naturally reaches the other. Worth checking, for any "X drives a UI hint" predicate, whether both
  the acting side's hint AND the affected side's persistent status display exist, not just one.
- **Real DoK monster spellcasting data (`DOK_SPELL_CROSSWALK`, M31.S1) already drives genuine
  offensive-status casts against the party in unscripted AI play** — this was fully wired for *combat
  resolution* purposes since M31, but nobody had previously traced it through to "and therefore the
  party's own status panel needs to reflect this," because M31/M55/M56's own follow-ups were scoped to
  the monster's own Reference-DB entry (the "Spells" row), not the party's live in-battle display.
