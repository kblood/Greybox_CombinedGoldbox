# M105 audit — `party.ts`'s `setInventory()` never recomputes `CharacterSheet.ac`, so real Ready/Unready/Sell/Give gear changes never reach combat or the Character Sheet screen (a twice-flagged, twice-deferred, still fully open "structurally-parallel-resolver gap" for a THIRD mutation surface)

> Audit method: read `docs/engine/research/m104-audit.md` and `m103-audit.md` in full first per the
> brief's mandatory first step, then skimmed `m102`/`m101`/`m100`/`m99-audit.md` for the established
> taxonomy. `git log` confirms M92-M104's fixes are all **already shipped**
> (`7509ccb`,`e871482`,`93437bf`,`7af9357`,`07e7406`,`5d75b1f`,`515a005`,`2d6c93a`,`9d161ef`,`5ea4aa1`,
> `ae7f23b`,`a9a5f5f`,`8b929a5`), so this round reads the current, already-more-advanced source, not a
> stale snapshot. `git status --porcelain` was clean at session start (no stray `m39-audit.md`/
> `_scratch_m39_verify.test.ts` in the actual working tree — those exist only inside already-committed
> history, consistent with M96-M104's own repeated note about this same stale-preamble illusion in the
> environment's static context block).

## Mandatory first check (per instruction #6): is M104's OWN shipped commit (`8b929a5`) complete and correct against its own sketch?

**Yes — checked thoroughly, comes up clean.** `git show 8b929a5 -- apps/web/src/ui/party.ts` shows both
pieces M104's own sketch specified landed exactly where the sketch placed them:

```diff
+  savingThrows as classSaves,
 ...
+const SAVE_KEYS = ['paralyzePoisonDeath', 'petrifyPolymorph', 'rodStaffWand', 'breath', 'spell'] as const;
 ...
+  const savesBefore = classSaves(core, level);
+  const savesAfter = classSaves(core, chk.targetLevel);
+  for (const k of SAVE_KEYS) s.savingThrows[k] -= savesBefore[k] - savesAfter[k];
```

`git show 8b929a5 -- apps/web/test/e2e.mjs` also confirms the regression test M104's own sketch called
for was added: `runTown()` now tops up Sturm's XP/gold, trains him a **second** time (2→3, a real,
non-degenerate save-table row transition, deliberately not 1→2), and asserts all five stored
`savingThrows` improve by exactly 1 (`savesOk`), folded into the case's existing `ok` predicate.

Re-ran the quality gates myself rather than trusting the commit message alone:
- `cd packages/engine && npx tsc --noEmit` → clean, zero errors.
- `cd packages/engine && npx vitest run` → **134 files / 1366 tests, all green** — matches the commit
  message's own claimed count (`1366/1366`) exactly.
- `cd apps/web && npx tsc --noEmit` → clean, zero errors.

(Per this round's own time budget, the full 84-case Puppeteer e2e suite was not independently
re-run — the diff-vs-sketch match plus the tsc/vitest gates above are the discipline #6 checks
explicitly required; M104's own commit message additionally claims `84/84 e2e`, not independently
re-verified this round.) **M104's fix is fully and correctly shipped, per the checks performed — no
further action needed there.** Moving to a fresh thread per instruction #6.

## Triage of the carried-forward threads (per the brief's "pick one OR find something fresh, grep-check first")

1. DoK-import `CoreClassId` excludes ranger/knight (M32/M86/M94-M104) — re-confirmed still true
   (`importDokParty.ts:123`). Not picked.
2. `createCharacter()`'s missing per-class ability-score minimums (M94-M104) — still open, still a
   two-part fix. Not picked.
3. DQK's distinct manual "Paladin" row vs. "Knight" (M93-M104) — still **UNKNOWN**. Not picked.
4. Whether "Extra spells" (deities.ts) should ever become a real mechanical grant — not picked.
5. Whether `select()` (e2e-seam-only cursor setters) should be patched for consistency — not picked.
6. Whether `mainMenu.ts`'s dead `teardown(clearStatus)` parameter should be implemented/removed — not
   picked.
7. Whether `races.ts`'s `StrengthRange.exceptionalPct` should be split by sex (M103) — not picked;
   still gated on `create.ts` never gaining a percentile input.
8. Whether `trainMember()`'s saves fix (M104) should be extended to a full multi-class recompute —
   deliberately out of scope, not picked.
9. Whether `importDokParty.ts`/`importParty.ts` have an analogous "recompute on a later mutation" gap
   (M104) — **investigated this round as part of the steer's priority lead, see below.**

None of 1-8 was picked. Per this round's explicit steer ("prioritize checking this lead FIRST"), the
bulk of this round's effort went to the steer's own named priority: sweeping other post-creation
mutation functions for the same "structurally-parallel-resolver gap" shape M87/M104 already found
(twice) in `trainMember()`. That sweep is what produced this round's headline.

## Steer-directed sweep: other mutation functions that touch a character's derived stats

Read every exported function in `apps/web/src/ui/party.ts` (`grep -n "^export function\|^function"`,
71 functions) and classified each one that mutates a `CharacterSheet` field post-creation:

| Function | Field(s) mutated | Re-derives correctly? |
|---|---|---|
| `trainMember()` | `hp`/`maxHp`, `thac0`, `savingThrows` | Yes — all three now correct (M87, day-one, M104). |
| `agePartyYears()` | a separate `ageStore` (not on `CharacterSheet` at all) | N/A — `applyAging()` (`packages/engine/src/world/gameClock.ts:244`) is a pure `age += years` counter with **no** ability-score/stat effect modelled at all, and `memberAge()`'s only consumer is `partyStatus()`'s display row (`party.ts:428`) — no stat derivation exists here to go stale. Ruled out: there is no resolver to be parallel to. |
| `reviveMember()` | `hp` (to 1), clears `deadStore` | Only touches `hp`; no CON-loss-on-Raise-Dead mechanic exists in this engine to check for staleness (and none is claimed anywhere in this codebase's own doc comments) — not a resolver-gap candidate; **UNKNOWN** whether the original games modelled Raise-Dead CON loss at all (not investigated this round, no primary-source table found for it in `hackdocs_extracted/` on a quick check). |
| `healMember()`/`restPartyTicks()` | `hp` only | Simple clamp-to-`maxHp` arithmetic, no derived-stat table involved. Ruled out. |
| `combatSpellsForMember()`/`turnLevelForMember()`/`backstabLevelForMember()`/`multiAttackHalfSteps()`/`weaponsForMember()`/`moveRateForMember()` | none (read-only) | All six recompute **fresh, on every call**, straight from `sheet.classes`/`sheet.abilities`/current inventory — none of them cache a value that could go stale, and `sheet.classes` itself **is** correctly updated by `trainMember()` (confirmed: `s.classes = { ...s.classes, [cls]: chk.targetLevel }`, `party.ts:1040` current source). Ruled out — this is the "recompute on read" strategy, immune to this shape by construction. |
| **`setInventory()`** | **`Inventory` store only — `CharacterSheet.ac` is never touched** | **No — this round's headline.** |

`setInventory()` stood out as the one mutation function whose own module (`packages/engine/src/items/
inventory.ts`) **explicitly provides** a matching resolver function (`computeArmorClass`) that is
**not called** — the sharpest possible instance of the shape the steer asked about, since unlike
`agePartyYears`/`reviveMember` (where no resolver exists to check against at all), here the resolver
already exists, is already exported, and is already used correctly one file away for a different
purpose (display) — it just never reaches the persisted fact.

## Headline finding

**`apps/web/src/ui/party.ts`'s `setInventory(name, inv)` — the single, real choke point every
gear-equipping action in this codebase goes through (Ready/Unready in the Items screen, Give/trade
between party members, selling gear at the Shop, and the DoK→DQK import's real `.JNK`-derived starting
gear) — persists the new `Inventory` but never recomputes `CharacterSheet.ac`. `ac` is set exactly
once, at character creation (`req.baseAc + dex.defensiveAc`) or DoK import (from real `.JNK` bytes via
`wornArmorAc`, M34.S1), and then frozen forever — even though the engine already exports the exact
matching resolver (`computeArmorClass`, whose own doc comment says "Mirrors `createCharacter`'s
`baseAc + defensiveAc`") and the Inventory screen itself already calls it correctly for its own,
separate, live on-screen display.** The real, only tactical-combat builder for a player's own party
(`sheetToCombatant()`) and the real, player-visible Character Sheet ("View") screen both read the
stale, stored `sheet.ac` directly — so a player who re-equips better armor, drops a shield, sells their
mail, or gives a piece of worn gear to a companion sees the **correct, improved (or worsened)** AC on
the Inventory screen itself, but that number never reaches combat or their own Character Sheet, which
keep showing (and keep *fighting with*) the AC the character happened to have at creation/import time.

This is the exact "structurally-parallel-resolver gap" shape M87 and M104 already found twice in
`trainMember()` (HP's Con bonus, savingThrows) — but for a **third mutation surface entirely**
(`setInventory()`, not `trainMember()`) and a stat (`ac`) that was **already explicitly named and
deferred twice before** (M34, M66) without ever being fixed.

## The real, gear-dependent fact and its existing, shipped creation-time + display-time consumers

**`packages/engine/src/items/inventory.ts:142-157`** (`wornArmorAc`/`computeArmorClass`, current
source, in full):

```ts
/** Worn-armour AC before Dexterity (10 unarmoured), improved by an equipped shield. */
export function wornArmorAc(inv: Inventory): number {
  const armor = equippedArmor(inv);
  let ac = armor ? (BASE_ITEMS[armor.baseTypeId]?.armorAc ?? UNARMORED_AC) : UNARMORED_AC;
  const shield = equippedShield(inv);
  if (shield) ac -= BASE_ITEMS[shield.baseTypeId]?.shieldBonus ?? 0;
  return ac;
}

/**
 * Final armour class from the readied gear, including the Dexterity defensive adjustment (signed,
 * as the ruleset's `dexterity(score).defensiveAc`). Mirrors `createCharacter`'s `baseAc + defensiveAc`.
 */
export function computeArmorClass(inv: Inventory, dexDefensiveAc = 0): number {
  return wornArmorAc(inv) + dexDefensiveAc;
}
```

**Real, shipped consumer #1 — character creation** (`packages/engine/src/ruleset/addnd1e-dragonlance/
character.ts:215`, current source): `ac: req.baseAc + dex.defensiveAc,` — the exact formula
`computeArmorClass`'s own doc comment says it mirrors.

**Real, shipped consumer #2 — the Inventory screen's own live display** (`apps/web/src/ui/
inventory.ts:58-69`, current source, `toView()`):

```ts
function toView(sheet: CharacterSheet, inv: Inventory, cursor: number, index: string, status: string): InventoryView {
  const dex = ADND1E_ABILITIES.dexterity(sheet.abilities.dex).defensiveAc;
  ...
  return { name: sheet.name, ac: computeArmorClass(inv, dex), /* ... */ };
}
```

This is called from `paint()` on every render, so the Items screen's own AC readout **is** always
live and correct — but this value is computed fresh for display only; it is never written back
anywhere.

**Real, shipped consumer #3 (of the STORED, never-updated field) — real tactical combat.**
`apps/web/src/ui/party.ts:358-374` (`sheetToCombatant`, current source, in full):

```ts
export function sheetToCombatant(sheet: CharacterSheet, id: string): Combatant {
  ...
  return { id, name: sheet.name, side: 'party', hp: sheet.hp, maxHp: sheet.maxHp,
    thac0: sheet.thac0, ac: sheet.ac,   // <-- the STORED, creation/import-frozen field
    damage: { ...weapon, bonus: weapon.bonus + str.damage },
    missileHitBonus: dex.missile || undefined };
}
```

...fed by `partyCombatants()` (`party.ts:377-379`), the **only** builder every real (non-demo) player
party uses in tactical combat (confirmed this round: `combat/party.ts`'s alternate `partyCombatant()`,
which correctly derives `ac` fresh from a `PartyMemberSpec.baseAc`, is used **only** for the static
`DEMO_PARTY` fallback in `explore.ts`/`wilderness.ts` — `grep -n "partyCombatant\b" apps/web/src/ui/
explore.ts apps/web/src/ui/wilderness.ts` shows both real-party branches call `partyCombatants()`
instead, never `partyCombatant()`). This is the actual number an attacker's to-hit roll is checked
against for every party member's own figure, every combat, for the entire life of the character.

**Real, shipped consumer #4 (player-visible, front door) — the Character Sheet screen.**
`apps/web/src/ui/charSheet.ts:59-64,93` (`toView`, current source):

```ts
export function toView(s: CharacterSheet, index: string): CharSheetView {
  const ab = s.abilities;
  ...
  // M63.S1 — the same live encumbrance computation party.ts's moveRateForMember() does for real
  // combat (CT.7k-1), recomputed here (not read from a stored field — CharacterSheet doesn't carry
  // one) so a re-equip is reflected the next time the sheet is opened, same as AC already is.
  const enc = encumbrance(inventoryWeightTenths(getInventory(s)), ab.str, ab.strPct);
  ...
  return { ..., ac: s.ac, thac0: s.thac0, hp: s.hp, maxHp: s.maxHp, move: enc.moveRate, ... };
}
```

`ac: s.ac` at line 93 is a bare, stored-field read — **not** recomputed the way `move` (two lines
above it) genuinely is. The comment's own closing clause, *"same as AC already is,"* is **false** as
written (see the dedicated section below) — but regardless of that comment's accuracy, the practical
effect is real: **a player who opens their own Character Sheet after re-equipping gear sees the wrong
AC**, the single most ordinary way to check a character's own stats in this game.

## Where the severance happens — exact locations, current source

**`apps/web/src/ui/party.ts:844-857`** (`getInventory`/`setInventory`, current source, in full — the
one function every equip-affecting action calls, and the one line it's missing):

```ts
export function getInventory(sheet: CharacterSheet): Inventory {
  const stored = inventoryStore[sheet.name];
  if (stored) return { entries: stored.map((e) => ({ ...e })) };
  const seeded = starterKit(sheet.classes);
  inventoryStore[sheet.name] = seeded.entries.map((e) => ({ ...e }));
  persistInventories();
  return seeded;
}

/** Replace a character's pack (after ready/drop/use) and persist. */
export function setInventory(name: string, inv: Inventory): void {
  inventoryStore[name] = inv.entries.map((e) => ({ ...e }));
  persistInventories();
  // <-- sheet.ac is never touched here; roster[i].ac stays whatever createCharacter() set at creation
}
```

**Confirmed by grep this round — every real call site funnels through this one function:**

```
$ grep -n "setInventory(" apps/web/src/ui/*.ts
apps/web/src/ui/importDokParty.ts:374   -- DoK->DQK import's real .JNK-derived starting gear
apps/web/src/ui/inventory.ts:125        -- commit() -- the shared tail of doReady()/doUse()/doDrop()
apps/web/src/ui/inventory.ts:192-193    -- doGive() -- BOTH giver and recipient packs
apps/web/src/ui/party.ts:1100           -- sellFromLeader() -- the Shop's "Sell" action
```

`doReady()`/`doUse()`/`doDrop()` (`inventory.ts:145-169`) all end in `commit()`, which calls
`setInventory()`. `doGive()` (`inventory.ts:176-197`) calls the engine's `transferItem()`, whose own
source (`packages/engine/src/items/inventory.ts:186-199`) **unconditionally un-equips** the item as it
changes hands (`moved.equipped = false; // un-ready on hand-off`) — so giving away a *currently worn*
piece of armour, shield, or weapon is a second, independent real trigger for the giver's AC to change,
not just the Ready/Unready keys. `sellFromLeader()` (`party.ts:1090-1102`) can sell an equipped item
too (nothing in `leaderInventory()`/`sellFromLeader()` restricts the sale to unequipped stacks).
`giveItemsToMember()` (`party.ts:864-875`, used by `buyForLeader()` for Shop purchases and by combat
loot collection) does **not** go through `setInventory()` at all — but this is correctly out of scope,
since every item it adds is pushed with `equipped: false` (new gear is never auto-worn), so buying or
looting alone cannot change AC; only Ready/Unready, Give, and Sell can, and all three of those
correctly funnel through `setInventory()`.

## The `charSheet.ts` doc comment's own false claim, and a genuine internal self-contradiction in M63's own round

`charSheet.ts:64`'s exact phrase — *"...so a re-equip is reflected the next time the sheet is opened,
**same as AC already is**"* — asserts that `s.ac` is *already* a live, re-equip-sensitive value at the
time it was written (M63.S1). This is traceable to the **exact sketch text M63 itself wrote** (`git
show` confirms `charSheet.ts:62-64`'s comment is byte-identical to `m63-audit.md:268-270`'s proposed
sketch, landed verbatim) — and it directly **contradicts M63's own audit analysis 92 lines earlier in
the very same document**:

```
docs/engine/research/m63-audit.md:178-180 (M63's own analysis, this round re-read in full):
"This is not a frozen, one-time-computed fact the way `sheet.ac`/`.thac0` are (baked once at
 creation/import) — `moveRateForMember()` recomputes live from *current* inventory every time it's
 called, same as `weaponsForMember()`."
```

M63 correctly diagnosed, in its own words, that `sheet.ac` **is** "a frozen, one-time-computed fact...
baked once at creation/import" — the identical conclusion this round independently re-derives — but
then, when writing the *sketch* for its own (unrelated) `move` fix 90 lines later, asserted the
opposite about the same field in passing, and that false claim shipped verbatim into production code
where it has stood, unnoticed and uncorrected, for 41 rounds (M64-M104) — including by this loop's own
M66 audit, which re-examined `sheet.ac`'s staleness directly (see below) without ever reading
`charSheet.ts`'s own comment closely enough to notice the contradiction it repeats.

## Existing sibling/precedent and the self-flagging evidence (discipline #1) — this is a pickup of a twice-deferred item, not a fresh re-proposal

**This exact gap has been named twice before and fixed neither time — confirmed via full-corpus grep:**

```
$ grep -n "dedicated phase\|AC recompute\|recompute.*ac\b\|ac never recompute\|never recomputed" docs/engine/research/m*-audit.md
docs/engine/research/m34-audit.md, docs/engine/research/m66-audit.md   (plus two unrelated hits in
  m27/m28-audit.md about a different subsystem, the treasure DROP_TABLE — confirmed unrelated on read)
```

**M34 (`m34-audit.md:323-330`), verbatim:**
> "**The general 'Inventory screen changes don't reach combat AC' gap.** While auditing `sheet.ac`'s
> consumers I confirmed (`apps/web/src/ui/party.ts`'s `sheetToCombatant`... and `inventory.ts`'s own
> live AC display...) that `sheet.ac` is a **static field**, set once at character creation/import and
> never recomputed when a player changes gear via the Items screen post-creation. This is a real,
> pre-existing, much bigger gap — but it's orthogonal to the import bug... and far riskier to fix in
> one slice (`setInventory`/`trainMember` call graphs...). Explicitly out of scope for M34; noted for
> a future, dedicated phase."

**M66 (`m66-audit.md:145-154`), verbatim, re-confirming M34's flag was still unaddressed 32 rounds
later, while explaining why M66's own (different) finding didn't overlap it:**
> "`m34-audit.md`... flags *'the general "Inventory screen changes don't reach combat AC" gap'*...
> That is a **different bug in the opposite direction**: M34 flagged that changing the *pack* doesn't
> update the *sheet*; this round's finding is that the *pack itself* is never given the real,
> already-decoded starting contents in the first place."

**Confirmed via `git log` this round: no commit, ever, has written to `CharacterSheet.ac` outside its
original creation-time assignment:**

```
$ git log --oneline -S "session.party[session.cur].ac" -- apps/web/src/ui/inventory.ts
(no hits)
$ git log --oneline -S "s.ac =" -- apps/web/src/ui/party.ts
(no hits)
```

**Grepping every `m67`-`m104` audit doc for `computeArmorClass`/`wornArmorAc` confirms the item was
never picked up in the 38 rounds since M66** (the full-corpus grep above found hits only in
M34/M51/M52/M58/M59/M60/M61/M66 — every one of the M51/M58-M61 hits is about a *different* question,
whether the DoK→DQK **import table** shows `sheet.ac` at all, not whether `sheet.ac` itself stays
correct after later gear changes; M52 explicitly examined `inventory.ts` for the pre-hoc/post-hoc
display axis and found it "already a correctly shown pre-hoc screen" — a different axis entirely from
whether the shown pre-hoc number reaches the *stored* fact). **The `charSheet.ts:64` self-contradiction
is a wholly new observation this round — no prior audit doc quotes or discusses that comment's specific
wording.**

Per instruction #1's framing ("if it's already been proposed, flagged as blocked, or explicitly
deferred, do not re-propose it; either note it's still open or pick something else") — this round
treats the underlying gap as **"still open"** (exactly as M34/M66 left it, not represented as a fresh
discovery) while contributing three things no prior round did: (a) an actual **dynamic reproduction**
against the real, unmodified production code (M34/M66 both reasoned statically only), (b) the
**`charSheet.ts:64` self-contradiction**, a genuinely new angle, and (c) a **concrete, minimal fix
sketch** at the exact choke point, which M34 explicitly declined to attempt ("far riskier to fix in one
slice") — this round's own reachability tracing found the risk is in fact low (see "Proposed fix"
below), which is itself new information M34 didn't have.

## Reachable in real, ordinary, shipped play — dynamic proof

**Static reachability, the full real chain:** any created or imported party (CoK, DoK-imported, or
DQK-imported — all three share the same `party.ts`/`inventory.ts` roster+inventory model; confirmed
`dqkExplore.ts:80,619` imports the identical `openInventory` CoK's `explore.ts` uses) → open **Items**
on any party member → Ready a different piece of armor, Un-ready a shield, sell worn gear at the Shop,
or Give a worn item to a companion (all real, front-door, ordinarily-reachable actions) → the Items
screen's own AC readout updates correctly → return to the dungeon and fight, or open **View** (the
Character Sheet) → both show the character's **original, creation/import-time** AC, unchanged.

**Dynamic re-derivation this round** (a throwaway Puppeteer script, driving a real headless Edge
session through the real `?create=1` → `?inv=1` flow and the real `window.__create`/`window.__inv`
seams — no fixtures, no mocks — created, run, then deleted):

```
1. ?create=1: build "TestKnight", human fighter L1, DEX 15, baseAc=10 (unarmoured), no shield -> add().
   Read localStorage['greybox.party.cok'] -> acAtCreation.
2. ?inv=1 (fresh page load): opening Items for the first time auto-seeds the real fighter starter kit
   (Long Sword + Shield + Chain Mail, all readied, party.ts's starterKit()) -- a REAL, ordinary,
   ZERO-extra-action trigger (no Ready press needed at all).
   window.__inv.ac() -> invAcAfterStarterSeed (the correct, live, gear-derived number).
   Read localStorage again -> acAfterStarterSeedStored (still the creation-time number).
3. A real, deliberate, front-door action: select the Shield row, press Ready (un-equips it).
   window.__inv.ac() -> invAcAfterUnready (correctly worsens by the shield's bonus).
   Read localStorage again -> acAfterUnreadyStored.
   Read localStorage['greybox.inventory.cok'] -> confirms the REAL persisted inventory correctly
   shows the shield unequipped (proving setInventory() itself works fine for the pack; only the
   sheet's `ac` field is the gap).

RESULT (captured verbatim from the real, unmodified, current production code):
{
  "added": true,
  "acAtCreation": 9,
  "invAcAfterStarterSeed": 3,
  "acAfterStarterSeedStored": 9,
  "starterSeedChangedLiveAcButNotStored": true,
  "shieldEquippedBefore": true,
  "shieldEquippedAfter": false,
  "invAcAfterUnready": 4,
  "acAfterUnreadyStored": 9,
  "invPersistedShieldEquipped": false,
  "unreadyChangedLiveAcButNotStoredSheetAc": true
}
```

Every number checks out against the primary formulas read this round: `acAtCreation = 9` =
`baseAc(10) + dex.defensiveAc(-1 @ DEX 15)`; `invAcAfterStarterSeed = 3` = `wornArmorAc` (Chain Mail
`armorAc=5` − Shield `shieldBonus=1` = `4`) `+ (-1)` = `3`; `invAcAfterUnready = 4` = `(5 − 0) + (-1)` =
`4` once the shield is off. **`acAfterStarterSeedStored` and `acAfterUnreadyStored` are both `9` — the
untouched creation-time value — across two independent real gear changes, one of them a zero-action
side-effect of merely opening the Items screen for the first time, the other a deliberate Ready
keypress.** This ran against the real, unmodified, currently-shipped `create.ts`/`inventory.ts`/
`party.ts` production code; the script (`apps/web/test/_scratch_m105_verify.mjs`) was created, run
(output captured above), then deleted before writing this document; `git status --porcelain` confirmed
clean before and after, this doc the only new file.

**Why the existing e2e test never caught this:** `e2e.mjs`'s own Items-screen probe (`~line 660-672`)
toggles Ready **and immediately toggles back** on every row specifically to restore state before
moving on (`// toggle back to original`), and only ever reads `window.__inv.ac()` (the live,
per-render value) — never `localStorage['greybox.party.cok']`'s `.ac`, and never a state left changed
across a page reload or a combat/Character-Sheet check. A genuine, wholly unexercised coverage gap, not
a test baking in a wrong value.

## Proposed minimal fix (not applied this round — audit scope is research only)

**One function, one file, reusing an engine function that already exists and is already imported one
file away** — the lowest-risk shape this loop has used yet, since (unlike THAC0/saves, which needed a
*delta* to preserve a baked-in creation-time offset) `computeArmorClass` is a **full, exact** substitute
for what `createCharacter()` itself would produce given the same gear — there is no offset to preserve:

```ts
// sketch, not applied this round -- apps/web/src/ui/party.ts
// New import alongside the existing @goldbox/engine import block (party.ts:12-67):
import { /* ...existing... */, computeArmorClass } from '@goldbox/engine';

/**
 * Replace a character's pack (after ready/drop/use/sell/give/import) and persist. (M105.S1) Also
 * recomputes and persists `ac` from the new gear via `computeArmorClass` (which mirrors
 * `createCharacter`'s own `baseAc + defensiveAc` formula exactly) -- previously `ac` was frozen at
 * creation/import time forever, even though `sheetToCombatant()` (real combat) and `charSheet.ts`'s
 * View screen both read it directly.
 */
export function setInventory(name: string, inv: Inventory): void {
  inventoryStore[name] = inv.entries.map((e) => ({ ...e }));
  persistInventories();
  const s = roster.find((m) => m.name === name);
  if (s) {
    s.ac = computeArmorClass(inv, ADND1E_ABILITIES.dexterity(s.abilities.dex).defensiveAc);
    persist();
  }
}
```

Notes on the sketch:
- **`ADND1E_ABILITIES` is already imported** into `party.ts` (used three other places already); only
  `computeArmorClass` needs adding to the existing import list.
- **Fixes every real call site for free** — `inventory.ts`'s `commit()` (Ready/Use/Drop) and `doGive()`
  (both giver and recipient), `party.ts`'s own `sellFromLeader()`, and `importDokParty.ts`'s DoK-import
  gear-set call — confirmed all four funnel through this one function (see grep above). No other file
  needs to change.
- **Idempotent/no-regression for the DoK-import path specifically**: `importDokParty.ts` already calls
  `createCharacter()` with `baseAc = wornArmorAc(decoded)` (M34.S1) using the *same* real `.JNK`-decoded
  `inv` it then passes to `setInventory()` one line later (`importDokParty.ts:374`) — so for that path,
  this fix recomputes the *exact same* value already stored, changing nothing observable for imports
  today; it only starts mattering the moment that DoK-imported hero later re-equips something in DQK's
  (shared) Items screen, which was not previously covered at all.
- **`giveItemsToMember()`/`buyForLeader()` correctly need no change** — new items are always added
  `equipped: false`, so buying or looting alone cannot change AC (confirmed by reading both this round).
- **The e2e regression this fix should add**: extend the existing Items-screen probe
  (`e2e.mjs:~654-694`) with one case that does **not** toggle back — Ready a different/worse item,
  reload (or read `localStorage` directly, mirroring this round's own scratch script), and assert the
  persisted `CharacterSheet.ac` now equals `window.__inv.ac()` rather than the pre-change value. Per
  this project's "the fix and its test travel together" discipline (M92-M104).
- **`charSheet.ts:62-64`'s doc comment should also be corrected** in the same change — not just because
  it's currently false, but because *after* this fix it becomes true for a **different reason** than the
  comment implies: `ac: s.ac` (line 93) remains a stored-field read (a "write-through on mutation"
  strategy), it does not become a "recompute fresh on every render" strategy the way `move` genuinely is
  two lines above it. Suggested correction: replace *"same as AC already is"* with something like *"AC
  (below) uses the opposite strategy — a stored field kept in sync by `setInventory()`'s own recompute
  (M105.S1) rather than recomputed here — both converge on the same up-to-date number."*

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| DoK-import `CoreClassId` excluding ranger/knight (M32/M86/M94-M104) | Re-confirmed still true, still correctly scoped; no new angle found this round. |
| `createCharacter()`'s missing per-class ability-score minimums (M94-M104) | Re-confirmed still open, still a two-part fix; not picked. |
| DQK's distinct "Paladin" row (M93-M104) | Still **UNKNOWN**; no new primary source consulted this round. |
| `agePartyYears()`/`memberAge()` as a resolver-gap candidate (steer's own named example) | Investigated and ruled out: `applyAging()` is a pure `age += years` counter with zero ability-score/stat effect modelled anywhere in this codebase, and its only consumer is a display row — there is no resolver for it to be structurally parallel to (unlike AC, where `computeArmorClass` already exists and is already used one file away). |
| `reviveMember()` (Raise Dead) as a resolver-gap candidate (steer's own named example) | Checked: only touches `hp`; no CON-loss-on-Raise-Dead mechanic is modelled or claimed anywhere in this codebase. **UNKNOWN** whether the original games modelled this at all — not investigated further this round (no primary-source table located on a quick `hackdocs_extracted/` check); flagged as a genuinely open question below, not ruled out on the same firm footing as `agePartyYears`. |
| `combatSpellsForMember`/`turnLevelForMember`/`backstabLevelForMember`/`multiAttackHalfSteps`/`weaponsForMember`/`moveRateForMember` | All six recompute fresh from live `sheet.classes`/inventory on every call — immune to this shape by construction (confirmed `sheet.classes` itself is correctly kept current by `trainMember()`). |
| `importDokParty.ts`/`importParty.ts` for an analogous gap (M104's own named follow-up) | Confirmed (per M104's own prediction) both build a sheet once, at import time, via `createCharacter()` — they don't share `trainMember()`'s "recompute on a later mutation" shape themselves. However, `importDokParty.ts` **does** call `setInventory()` once (line 374) — which this round's fix now also correctly covers, a small bonus consistency win, not a separate finding. |

## Open questions / unknowns

- **Whether the lead session wants the sketch above applied now** — a small, additive, one-file,
  low-risk fix reusing an already-exported, already-correct engine function — this round proposes but
  does not apply it, per the audit-is-research-only scope.
- **Whether AD&D-1e Raise Dead's canonical Constitution-loss-on-failure mechanic was ever modelled (or
  intended to be modelled) in the original Gold Box Krynn games at all** — not resolved this round; if a
  future round finds primary-source evidence it was, `reviveMember()` would become a second, genuine
  instance of this round's taxonomy (a resolver that doesn't exist yet, not just one that exists and
  isn't called).
- **Whether the fix should also handle `thac0`'s theoretical magic-weapon bonus** — checked and
  confirmed **not** currently needed: `computeThac0(baseThac0, magicBonus=0)` is called by
  `inventory.ts` with the default `magicBonus`, and no live caller anywhere in the codebase ever passes
  a nonzero value (the "confirmed-blocked item-instance subsystem," per M31-M34's own repeated note) —
  so unlike `ac`, there is currently no gear-dependent THAC0 fact to recompute at all; this fix is
  correctly scoped to `ac` alone.
- **Whether `charSheet.ts:62-64`'s corrected doc comment (proposed above) should ship in the same commit
  as the `setInventory()` fix, or be treated as a separate, comment-only follow-up** — a small
  sequencing question for whoever implements this, not a substantive disagreement.

## Implications for our engine / for the taxonomy

- **A third confirmed instance of the "structurally-parallel-resolver gap" shape, and the first found
  outside `trainMember()`** — M87/M104 found HP's Con-bonus and `savingThrows` frozen inside the
  Training Hall's level-up function; this round finds `ac` frozen across the *Items screen's* own
  equip/unequip actions, a structurally different mutation surface entirely, confirming M104's own
  closing question ("does any OTHER mutation function... have this same shape for a different stat")
  generalizes beyond the one function it was first found in three times.
- **The sharpest sub-case of this shape yet**: unlike HP/THAC0/saves (where the "creation-time
  resolver" and the "training-time non-caller" are two different functions in two different files that
  never obviously invite comparison), here the matching resolver (`computeArmorClass`) is **exported
  from the very same module** whose other exported function (`wornArmorAc`) `setInventory()`'s sibling
  screen (`inventory.ts`) already calls correctly, one file away, for a different purpose — the missing
  call was never a "does this resolver even exist" gap, purely a "the display path found it; the
  persistence path never did" gap.
- **A doc comment can assert something false about *current* behaviour, not just something
  unverified** — distinct from M93/M96/M103's "confident transcription turned out inaccurate" lessons
  (those were about *transcribed source data*), `charSheet.ts:64`'s comment makes a live, checkable
  claim about what the code *does*, and that claim is simply wrong, traceable to a self-contradiction
  within its own originating round's audit document (M63 correctly diagnosed the frozen-field fact in
  its analysis, then asserted the opposite in its own shipped sketch 90 lines later). Worth watching for
  as its own taxonomy sub-case: **a doc comment's claim about a *sibling* field's behaviour is exactly
  as unverified as a claim about the field it's actually annotating**, and should be checked the same
  way M93/M96/M103 taught this loop to check primary-source transcriptions.
- **A two-round-old, explicitly-deferred item ("far riskier to fix... explicitly out of scope... noted
  for a future, dedicated phase," M34) turned out to have a low-risk, single-function, single-choke-point
  fix once actually traced end-to-end** — M34's own caution ("call graphs, moveRate/weapon interactions")
  was reasonable to raise without doing the legwork, but this round's full call-site trace (four sites,
  all funnelling through one function, one of them provably idempotent for its existing use) found the
  actual risk is much lower than the deferring round assumed — a useful, generalizable lesson: **a
  "too risky, needs its own phase" deferral is itself worth periodically re-checking with fresh legwork,
  not just re-citing as still-true.**

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `apps/web/test/_scratch_m105_verify.mjs` (a throwaway Puppeteer script driving a real headless Edge
  session against the real dev-built app on a scratch port distinct from `e2e.mjs`'s own 5180 — built
  "TestKnight" via the real `?create=1`/`window.__create` seam, opened `?inv=1`/`window.__inv` for the
  first time to trigger the real starter-kit auto-seed, then un-readied the Shield via the real
  `window.__inv.ready()` seam, reading `localStorage['greybox.party.cok']`/`['greybox.inventory.cok']`
  directly before/after each step) — run once (output captured verbatim above, reproducing the
  frozen-`ac`-after-two-independent-real-gear-changes bug), then deleted. `git status --porcelain`
  confirmed clean before and after, this doc the only new file.
