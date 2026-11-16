# M57 audit — the next "computed but unwired" candidate

> Audit method: per this round's brief, picked up standing candidate #2 from `m56-audit.md`'s own
> "Open questions / unknowns" section — **the post-combat victory log never breaking out the
> loot-XP component of `xpResult.total` separately** (`apps/web/src/ui/combat.ts:721-724`,
> `apps/web/src/ui/party.ts`'s `awardPartyXp`) — instead of squeezing a 7th row into
> `referenceDb.ts`'s `monsterCategory()`, which M56 itself flagged as "getting close to its
> row-cap ceiling" and warned a 7th addition needs re-verification, not assumption. Confirmed via a
> throwaway `vitest` script (`packages/engine/test/_scratch_m57_verify.test.ts`, created, run,
> **6/6 green**, then deleted) against the **real** `Champions of Krynn/MON1CHA.DAX` and
> `Death Knights of Krynn/MON1CHA.DAX`/`MON1ITM.DAX` that:
> 1. `calcBattleExp` (`packages/engine/src/ruleset/addnd1e/experience.ts:50-61`) is a **pure linear
>    sum** of three independent terms (Σ enemy flat/HD XP, gold's XP worth, Σ positive item
>    `plus·400`) — so each term can be isolated by calling the *same, already-exported* function
>    three times with partial inputs (`calcBattleExp(enemies, {})`, `calcBattleExp([], {
>    goldXpWorth })`, `calcBattleExp([], { itemPluses })`), the identical "call the real function
>    with zero enemies" trick `m56-audit.md` used for the bestiary's Bonus-XP row. No new math, no
>    engine-package change.
> 2. Real CoK `MON1CHA.DAX`: GOBLIN (id 9, the exact fixed 3-goblin roster `explore.ts:1767`'s
>    `testFight` seam spawns, and the same roster the existing `runExplore` e2e case already
>    auto-resolves) has a real, **located, nonzero** flat XP (`goblin.xp = 10`, `COK_LAYOUT.xp =
>    304`, `monster.ts:105`) — the monster-kill component of the breakdown is real data on the CoK
>    side.
> 3. Real DoK `MON1CHA.DAX`/`MON1ITM.DAX`: **every one of the 64 real DoK area-1 monsters**,
>    including SOLAMNIC KNIGHT (id 64, M26's own item-plus fixture), decodes `xp = 0` —
>    `DOK_LAYOUT.xp` is `null` (`monster.ts:125`, the standing, already-documented "gap B5": DoK's
>    compact 216-byte record has no located XP field at all). This is a **pre-existing, orthogonal,
>    already-known data gap**, not a defect introduced or being fixed by this round's candidate —
>    but it does mean the new breakdown's "monster" term will always honestly read 0 on the DoK
>    side today (see Open questions for a further, incidental consequence this uncovered).
> 4. `combat.ts`'s actual source text (read directly, not just described) still only ever pushes
>    the one lump line (`pushLog(\`Victory! The party gains ${xpResult.total} experience.\`)`) —
>    no "from foes"/"from gold"/"from magic items" wording exists anywhere in the file today.
> 5. `party.ts`'s `PartyXpAward` interface (`party.ts:931-937`) is confirmed, by direct source
>    read, to declare only `{ total: number; perMember: {...}[] }` — no breakdown field exists to
>    read instead of recomputing the three terms at the call site.
>
> This round's headline is therefore the **genuinely different-shaped candidate M56 flagged but
> deliberately did not pick** — a post-combat message-log gap, not a 7th bestiary row — confirmed
> real, confirmed still absent, and confirmed cheaply fixable with the exact same "recompute a
> sub-term via the real ruleset function" pattern the last three rounds have already proven safe.

## Headline finding

### The gap: the victory log shows one lump XP number; the player can never tell how much came from killing monsters vs. collecting gold vs. looting a magic item

`apps/web/src/ui/combat.ts:700-727` (`finalize()`, current state, unmodified):

```ts
function finalize(): void {
  if (!state || state.over) return;
  const res = state.combat.result();
  state.over = true;
  state.outcome = res.outcome;
  ...
  if (res.outcome === 'party') {
    const foes = state.combatants.filter((c) => c.side === 'enemy');
    // M29.S1 — a defeated foe's real MON{n}ITM.DAX carried items (joined at dungeon load) drop as-is
    // instead of the synthetic DROP_TABLE roll, when at least one resolves to a known catalogue entry.
    const haul = rollTreasure(foes.map((c) => ({ xp: c.xp, carriedItems: c.carriedItems })), state.seed);
    // M15.S1 — real `calc_battle_exp`/`addExp` award (ovr006): battle XP folds in gold's XP worth ...
    const enemies: DefeatedEnemy[] = foes.map((c) => ({ flatXp: c.xp ?? 0 }));
    // M26.S1 — every defeated foe's carried-item `plus` values (MON{n}ITM.DAX, joined at dungeon load)
    // feed calcBattleExp's Σ item.plus·400 term, matching COAB's unconditional battle-end collection.
    const itemPluses = foes.flatMap((c) => c.itemPluses ?? []);
    const xpResult = awardPartyXp(enemies, { goldXpWorth: haul.gold, itemPluses });
    state.xp = xpResult.total;
    pushLog(`Victory! The party gains ${xpResult.total} experience.`);
    // Faithful per-character split message (CoK `Each character receives ` @0x6dd3 + ...) ...
    for (const m of xpResult.perMember) pushLog(`${m.name} receives ${m.awarded} experience points.`);
    ...
```

`xpResult.total` is exactly `calcBattleExp(enemies, { goldXpWorth: haul.gold, itemPluses })` — a
real sum of three independently-meaningful components (monster kills, gold, magic-item loot) — but
the log only ever prints the merged number. `awardPartyXp` (`apps/web/src/ui/party.ts:947-961`)
confirms this is a structural limitation, not just a missed `pushLog` call — its own return type
carries no breakdown to read instead:

```ts
// party.ts:931-937 (current state, unmodified)
export interface PartyXpAward {
  /** Battle XP total (`calcBattleExp`): per-enemy XP + gold's XP worth + magic-item pluses. */
  total: number;
  /** Per-member awards actually applied ... */
  perMember: { name: string; awarded: number }[];
}
```

The doc comment on `total` even *names* all three components ("per-enemy XP + gold's XP worth +
magic-item pluses") while the type only ever exposes their sum. This is the same shape M56 flagged
in its own headline finding for `itemPluses` (a fact whose real, mechanically load-bearing
consumer computes it perfectly, but nothing downstream ever prints the isolated figure) — applied
here to the log line instead of the bestiary.

### Why the fix is cheap: `calcBattleExp` is a pure linear sum, so each term is a free recomputation

`packages/engine/src/ruleset/addnd1e/experience.ts:50-61` (unmodified):

```ts
export function calcBattleExp(enemies: readonly DefeatedEnemy[], loot: BattleLoot = {}): number {
  let total = 0;
  for (const e of enemies) {
    if (e.perHpXp && e.rolledHp) total += e.perHpXp * e.rolledHp;
    total += e.flatXp;
  }
  total += loot.goldXpWorth ?? 0;
  for (const plus of loot.itemPluses ?? []) {
    if (plus > 0) total += plus * XP_PER_ITEM_PLUS; // XP_PER_ITEM_PLUS = 400
  }
  return total;
}
```

Because every term is additive with **no cross-term interaction**, `calcBattleExp(enemies, {}) +
calcBattleExp([], { goldXpWorth }) + calcBattleExp([], { itemPluses }) ===
calcBattleExp(enemies, { goldXpWorth, itemPluses })` **exactly**, for any real input — verified
below over both synthetic and real-byte cases. `finalize()` already computes `enemies`,
`haul.gold`, and `itemPluses` as local variables one statement above the lump `pushLog` — no new
data has to be threaded in, only three cheap extra calls to a function that's already imported
transitively via `awardPartyXp` and already exported from `@goldbox/engine`.

## Real-bytes / real-mechanic verification (this round)

Reproduced via `packages/engine/test/_scratch_m57_verify.test.ts` (created, run, **6/6 passed**,
then deleted; `git status --porcelain --untracked-files=all` confirmed clean before/after):

1. **`calcBattleExp` additive-separability** (synthetic, exact arithmetic): `enemies = [{flatXp:65},
   {flatXp:65},{flatXp:20}]`, `goldXpWorth=47`, `itemPluses=[0,0,1]` →
   `monsterOnly=150, goldOnly=47, itemOnly=400`, and `150+47+400 === calcBattleExp(enemies, {
   goldXpWorth, itemPluses })` exactly. Confirms the isolation trick is mathematically sound, not
   an approximation.
2. **Real CoK `MON1CHA.DAX`**: GOBLIN (id 9 — `explore.ts:1767`'s fixed 3-goblin `testFight` roster,
   the exact fixture the existing `runExplore` e2e case already auto-resolves every run) has
   `xp = 10` (`COK_LAYOUT.xp = 304`, located). Three goblins → real `monsterOnly = 30`, `> 0` —
   the monster-kill component is real, nonzero, decoded data on the CoK side.
3. **Real DoK `MON1CHA.DAX`/`MON1ITM.DAX`**: SOLAMNIC KNIGHT (id 64, M26's own fixture,
   `itemPluses = [0,0,1]`, matching `m26-audit.md`/`m56-audit.md`'s own figure) decodes `xp = 0`.
   Checked **every one of the 64 real DoK area-1 monster records** — `joined.every((r) => r.xp ===
   0)` is `true`. Root cause, read directly from source: `DOK_LAYOUT.xp: null`
   (`packages/engine/src/loaders/monster.ts:125`) plus `decodeMonsterRecord`'s
   `xp: layout.xp === null ? 0 : ...` (`monster.ts:384`) — DoK's compact 216-byte record has no
   located XP field at all (the standing "gap B5" bundle, `monster.ts:110-112`'s own comment: "HP /
   hit dice / saves / XP remain unlocated in the compact record"). Also incidentally observed (not
   this round's fix target, but load-bearing for the Open-questions/feasibility sections below):
   SOLAMNIC KNIGHT's decoded `hitPoints` is likewise `0` (`DOK_LAYOUT.hp: null` too).
4. **COLLATERAL finding**: real DoK `rollTreasure` gold is **also always 0** for the same root
   cause. `combat.ts:714`'s real shape is `rollTreasure(foes.map((c) => ({ xp: c.xp, carriedItems:
   ... })), seed)` — since every real DoK monster's `xp` decodes to `0`, `rollTreasure`'s own
   `totalXp` basis (`packages/engine/src/items/treasure.ts:57`) is always `0`, so its `if (totalXp
   > 0)` gold-rolling branch (`treasure.ts:59-63`) never executes and `haul.gold` stays exactly
   `0` for every real DoK combat today. Verified directly: `rollTreasure(realDokFoes.map((r) => ({
   xp: r.xp })), 0x55).gold === 0`. This is a genuine, previously-unflagged (searched
   `docs/engine/research/m26-audit.md` through `m56-audit.md` for prior mentions of this exact
   consequence — none found) downstream effect of the same already-documented gap B5, not a new
   bug this round introduces or is responsible for fixing — see Open questions.
5. **`combat.ts`'s exact current source text**: contains the lump `pushLog` line verbatim and
   **no** "from foes"/"from monsters"/"from gold"/"from loot"/"from magic items" wording anywhere
   in the file — confirms the gap is real and not already partially addressed.
6. **`party.ts`'s `PartyXpAward` interface, read directly**: only `total: number` and
   `perMember: ...` fields declared; no `monsterXp`/`goldXp`/`itemXp`/`breakdown` field exists.

Full engine suite re-run after adding the scratch file: **1342 tests passed** (1336 baseline +
6 new scratch tests), then the scratch file was deleted and `git status --porcelain
--untracked-files=all` confirmed clean (only this doc untracked).

## Wiring plan

**One UI file touched (`combat.ts`) plus a small extension to the existing `runExplore` e2e case's
already-existing `xpAwardOk` check — no new UI panel, no new route, no new e2e seam function, no
engine-package change (`calcBattleExp` already ships from `@goldbox/engine`).**

1. **`apps/web/src/ui/combat.ts`** — add `calcBattleExp` to the existing `@goldbox/engine` import
   list (`combat.ts:20-61`), alongside the other already-imported combat/XP helpers:

   ```ts
   // combat.ts:20-61, before:
   import {
     decodeAsset,
     ...
     rollTreasure,
     hasTreasure,
     ...
     type DefeatedEnemy,
     type ExploreParty,
   } from '@goldbox/engine';

   // after:
   import {
     decodeAsset,
     ...
     rollTreasure,
     hasTreasure,
     calcBattleExp, // M57.S1 — isolate the monster/gold/item-loot XP components for the victory log
     ...
     type DefeatedEnemy,
     type ExploreParty,
   } from '@goldbox/engine';
   ```

   Then, in `finalize()` (`combat.ts:710-724`), insert a breakdown line right after the existing
   lump line and before the per-member award lines:

   ```ts
   // combat.ts:722-724, before:
     const xpResult = awardPartyXp(enemies, { goldXpWorth: haul.gold, itemPluses });
     state.xp = xpResult.total;
     pushLog(`Victory! The party gains ${xpResult.total} experience.`);

   // after:
     const xpResult = awardPartyXp(enemies, { goldXpWorth: haul.gold, itemPluses });
     state.xp = xpResult.total;
     pushLog(`Victory! The party gains ${xpResult.total} experience.`);
     // M57.S1 — xpResult.total is calcBattleExp(enemies, { goldXpWorth, itemPluses }) collapsed to
     // one number; recompute each additive term via the SAME real ruleset function (zero-enemy /
     // zero-loot calls, the same trick M56 used for the bestiary's Bonus XP row) so the player can
     // tell how much of the award came from monster kills vs. gold vs. looted magic items, instead
     // of a lump sum that hides it completely. Only shown when there IS a loot component to reveal
     // (a pure monster-kill fight's total already fully explains itself); each part is honestly
     // omitted when zero (matches the "don't fabricate a zero-value fact" convention used
     // throughout — e.g. M55/M56's own conditional Spells/Bonus-XP rows).
     const monsterXp = calcBattleExp(enemies, {});
     const goldXp = haul.gold;
     const itemXp = calcBattleExp([], { itemPluses });
     if (goldXp > 0 || itemXp > 0) {
       const parts: string[] = [];
       if (monsterXp > 0) parts.push(`${monsterXp} from foes`);
       if (goldXp > 0) parts.push(`${goldXp} from gold`);
       if (itemXp > 0) parts.push(`${itemXp} from magic items`);
       pushLog(`(${parts.join(', ')})`);
     }
   ```

   No change to `party.ts`'s `awardPartyXp`/`PartyXpAward` — the breakdown is derived locally from
   values `finalize()` already has in scope, not threaded back through the award API.

2. **Tests** (extend the existing `runExplore` e2e case's `xpAwardOk` check only — no new test
   file, no new seam). In `apps/web/test/e2e.mjs`, widen the existing block at **e2e.mjs:380-386**
   (the exact block M15.S1 added for the per-member award lines):

   ```js
   // before (e2e.mjs:380-386):
       let xpAwardOk = true;
       if (fight1.outcome === 'party') {
         const oldFlatLine = fight1.log.some((l) => /^Each character receives \d+ experience points\.$/.test(l));
         const perCharLines = fight1.log.filter((l) => / receives \d+ experience points\.$/.test(l));
         const gold = fight1.treasure?.gold ?? 0;
         xpAwardOk = !oldFlatLine && perCharLines.length >= 1 && fight1.xp > 0 && fight1.xp >= gold;
         if (!xpAwardOk) errors.push(`xp award: log=${JSON.stringify(fight1.log)} xp=${fight1.xp} gold=${gold}`);
       }

   // after:
       let xpAwardOk = true;
       if (fight1.outcome === 'party') {
         const oldFlatLine = fight1.log.some((l) => /^Each character receives \d+ experience points\.$/.test(l));
         const perCharLines = fight1.log.filter((l) => / receives \d+ experience points\.$/.test(l));
         const gold = fight1.treasure?.gold ?? 0;
         // M57.S1 — the fixed 3-goblin CoK roster (explore.ts:1767) has real nonzero per-goblin XP
         // AND (whenever the haul rolls > 0 gold) a real gold component, so a won fight's log should
         // carry a "(N from foes, N from gold)"-shaped breakdown line distinct from the lump total.
         const breakdownLine = fight1.log.find((l) => /^\(\d+ from foes(, \d+ from gold)?(, \d+ from magic items)?\)$/.test(l));
         const breakdownOk = gold > 0 ? !!breakdownLine && breakdownLine.includes(`${gold} from gold`) : true;
         xpAwardOk = !oldFlatLine && perCharLines.length >= 1 && fight1.xp > 0 && fight1.xp >= gold && breakdownOk;
         if (!xpAwardOk) errors.push(`xp award: log=${JSON.stringify(fight1.log)} xp=${fight1.xp} gold=${gold} breakdownOk=${breakdownOk}`);
       }
   ```

   This reuses `fight1.log`/`fight1.xp`/`fight1.treasure.gold`, all of which the existing
   `fightOnce()` helper (`e2e.mjs:291-319`) already captures via the pre-existing `window.__combat`
   seam — no new page navigation, no new seam getter, no new test id.

Rough size: 1 new import + ~10 LOC (incl. comments) in `combat.ts`'s `finalize()`; ~4 LOC
changed/added in the existing `runExplore` e2e case. No engine-package file touched — engine test
count should remain 1336 (this round's scratch tests are deleted, not shipped). No new UI panel,
no new route, no new test file.

### Optional secondary check (not required, flagged as a caveat)

A DoK-side extension of the existing `runItemPluses` e2e case (`e2e.mjs:2985-3015`, M26.S1's own
SOLAMNIC KNIGHT fixture) to also `.auto()`-resolve the fight and assert a `(400 from magic items)`
-only breakdown (no "from foes"/"from gold" parts, per the real DoK `xp=0` finding above) is
possible but was **not** drafted in detail this round: `runItemPluses` today never calls
`.auto()`, and this round incidentally discovered that DoK monster combatants also decode
`hitPoints = 0` (`DOK_LAYOUT.hp: null`, same gap-B5 bundle) — meaning a DoK monster likely starts
combat already at/below the engine's "down" threshold. This makes the fight trivially,
deterministically winnable (good for a stable e2e assertion) but is worth the lead session
double-checking `isOver()`/`conditionOf()` behavior for a 0-HP spawn before relying on it, since
that specific mechanic was not exercised or asserted by this round's scratch verification (out of
this round's scope — the CoK-side extension above is sufficient to prove the candidate; this is a
nice-to-have, not a blocker).

## Layout / feasibility check

Unlike `referenceDb.ts`'s bestiary panel (a fixed 12-row compositor cap with an 8-character
per-value truncation, `packages/engine/src/render/referenceDb.ts:72,118`), the combat message log
has no row cap in the same sense — `pushLog` appends to an unbounded array (`state.log`, capped at
40 entries for memory, `combat.ts:546`) and the on-screen view always shows the **last 5 log lines
+ the banner** (`combat.ts:509`: `state.log.slice(-5)`), each rendered as its own row in the 6-row
message region (`TEXT_MAX_ROWS = 6`, `packages/engine/src/render/combatScreen.ts:67`). Adding one
**new, separate** log line (not lengthening the existing lump line) is therefore the layout-safe
choice, matching the file's own established convention: the per-member `"<name> receives N
experience points."` lines (`combat.ts:727`) are already one-line-per-fact, not appended onto the
lump line.

The practical constraint is horizontal, not vertical: the combat screen is a 320×200 canvas with
8px glyphs (`SCREEN_WIDTH = 320`, `packages/engine/src/render/screen.ts:26`), giving **~39-40
usable text columns**, and `drawText` (`packages/engine/src/render/textmode.ts:112-131`) has no
explicit line-length clamp — a too-long line silently runs past the right edge. (Aside, not
introduced by this change: the *existing* lump line, e.g. `"Victory! The party gains 9600
experience."`, is already ~41-42 characters — at or slightly past this budget for a 4-digit total;
a pre-existing condition, not something this round's fix worsens, since the new content goes on
its **own** line rather than extending that one.)

Computed the real worst-case breakdown-line length **over every value reachable by today's live,
already-wired data**, not assumed:
- **CoK** (area 1, the only area the live Companion/combat path loads,
  `gameData.ts`'s `itmPath`): item-plus is always 0 (M56's own finding — 0 of 26 real CoK area-1
  monsters carry a positive-plus item), so the CoK-side breakdown can only ever show **at most 2
  parts** — `"(N from foes, N from gold)"`. Worst plausible real string:
  `"(9999 from foes, 9999 from gold)"` (a generous upper bound) is 33 characters — comfortably
  under the ~39-40 column budget.
- **DoK** (area 1): `monsterXp` is always `0` (this round's finding) and, per the COLLATERAL
  finding, `goldXp` is *also* always `0` today — so the DoK-side breakdown can only ever show
  **at most 1 part**, `"(N from magic items)"`. The real observed maximum bonus (FLAVIUS, per
  `m56-audit.md`) is `+9600`, giving `"(9600 from magic items)"` — 23 characters, well under
  budget.
- **No currently-reachable real monster in either game can produce all 3 parts simultaneously**,
  because each game is missing a different one of the three terms in its live area-1 data (CoK
  lacks a positive item-plus; DoK lacks both a nonzero flat XP and nonzero gold). This mirrors
  M56's own "compute the real worst case over actual bytes, not an assumption" layout-check
  methodology, applied to a line-length budget instead of a row-count budget.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **A 7th row in `referenceDb.ts`'s `monsterCategory()`** | Explicitly steered away from by this round's brief and by M56's own warning that the function is "very close to its display-row ceiling" (11 of 12 worst-case, `m56-audit.md`). No new field was identified there this round that would need re-litigating that budget. |
| **Threading the breakdown back through `awardPartyXp`/`PartyXpAward`** (adding `monsterXp`/`goldXp`/`itemXp` fields to the return type) | Considered — would centralize the computation, but `PartyXpAward` is also consumed elsewhere (any other `awardPartyXp` caller would need to either populate or ignore new fields), and `finalize()` already has every value (`enemies`, `haul.gold`, `itemPluses`) in local scope to recompute the breakdown for free via the already-exported `calcBattleExp`. Rejected in favour of the smaller, purely-local recomputation to avoid touching `party.ts`'s public API for a UI-only concern. |
| **Appending the breakdown onto the SAME lump line** (`"Victory! The party gains N experience (X from foes, ...)."`) | Rejected after the line-length check above found the *existing* lump line alone is already near the ~39-40 column budget for 4-digit totals; appending more text would make an already-marginal line worse. A **separate** log line (matching the file's own per-member-line convention) is the layout-safe choice. |
| **Showing the breakdown unconditionally, every fight, even when it's 100% monster-kill XP** | Rejected — when neither gold nor a magic item contributed anything, the lump total already fully and honestly describes the award (100% "from foes" is implied); printing a redundant one-part restatement clutters the log for no new information. The `goldXp > 0 || itemXp > 0` gate keeps the line meaningful: it only appears when there's something to disambiguate. |
| **Fixing DoK's `xp`/`hitPoints` = 0 gap directly (locating the real offsets in the 216-byte record)** | Real, and the root cause of both this round's DoK-side "monster term always 0" observation and the COLLATERAL rollTreasure-gold-always-0 finding — but this is a byte-location reverse-engineering task (gap B5), not a "computed-but-unwired" UI gap, and squarely out of scope for this round's audit shape. Flagged prominently in Open questions instead. |
| **Re-picking `MonsterRecord.carriedItems`' name-identity gap** (M55/M56's own standing candidate #1) | Not re-investigated — no new angle this round; left exactly where M56 left it. |
| **`importDokParty.ts`'s `mem`, ECL-recruited allies' `morale`, `wilderness.ts`'s `moonPhasesForDay`, `referenceDb.ts`'s Class-label collision, `saveStore.ts`/`DetectionMatch` fields** | All standing candidates from M54-M56's own lists — not re-investigated, no new angle surfaced this round, per the brief's explicit instruction to try candidate #2 first. |

## Open questions / unknowns

- **Should the DoK-side `runItemPluses` e2e case also be extended with a live `.auto()`-resolved
  assertion**, proving the `"(400 from magic items)"`-only breakdown in a real browser run, not
  just the vitest-level arithmetic this round verified? Flagged as a reasonable follow-up, but this
  round intentionally did not draft it in full because of the incidentally-discovered DoK
  0-HP-monster wrinkle (below) — the lead should sanity-check `isOver()`/`conditionOf()` behavior
  for a zero-`maxHp` spawn before relying on `.auto()` there.
- **DoK monster combatants currently spawn with `hitPoints = 0` and `maxHp = 0`** (`DOK_LAYOUT.hp:
  null`, `monster.ts:118`, same gap-B5 bundle as the XP finding) — `monsterCombatant()`
  (`packages/engine/src/combat/combat.ts:329-330`) passes `mon.hitPoints` straight through with no
  fallback roll (`hitDice` is *also* `null` for DoK, so there's no hit-dice-based derivation to fall
  back to either). This is **not** a new finding this round is responsible for fixing — it is the
  documented "gap B5" — but it was not, as far as this round's research found, previously connected
  explicitly to "DoK monsters spawn already at/below 0 HP." Whether this actually manifests as
  "the fight ends instantly" or is masked by some other tactical-combat invariant this round did
  not trace (e.g. a minimum-HP floor elsewhere) is **UNKNOWN** — worth a future round's dedicated
  look, separate from this round's log-breakdown candidate.
- **Should real DoK combat ever produce nonzero gold** (fixing the COLLATERAL finding), and is that
  the same underlying byte-location task as locating DoK's real HP/XP fields, or a separate,
  smaller fix (e.g., a different treasure-XP-worth formula for DoK that doesn't depend on
  `monster.xp`)? **UNKNOWN** — flagged as a real, previously-unflagged (searched M26 through M56's
  audits for this exact consequence; none found) but out-of-scope-for-this-round observation.
- **Wording**: is `"(N from foes, N from gold, N from magic items)"` the clearest phrasing, or
  should it match the bestiary's M56 "Bonus XP" terminology more closely (e.g. `"magic-item bonus"`
  instead of `"magic items"`)? Not blocking — `state.log` entries are plain strings either way, and
  the lead may prefer different wording so long as each component is honestly omitted when zero.

## Implications for our engine

- **A standing rejection's OWN "not picked this round, flagged for later" note is a legitimate,
  well-scoped audit target on its own** — this round picked up exactly the alternative M56 itself
  named-but-declined (to keep M56 single-file/single-row), rather than re-litigating M56's actual
  pick or hunting for an unrelated 7th field. Treating a prior round's *own* flagged-but-deferred
  candidate as this round's default first stop (when the brief says so) kept the investigation
  efficient and avoided the row-cap risk the brief warned about.
- **`calcBattleExp`'s purity (a linear sum with no cross-term interaction) is what makes this whole
  family of fixes cheap**, in the bestiary (M56) and now the post-combat log (M57) alike: any
  individual term can be isolated by calling the *same, already-tested, already-shipped* function
  with the other inputs zeroed out, rather than duplicating or re-deriving the arithmetic
  bespoke in the UI layer. Future similar breakdowns (of any other additively-composed ruleset
  total) should look for this same "zero out the other inputs" shape before writing new math.
- **Re-verifying a candidate's real-byte inputs can surface an orthogonal, deeper, previously
  unflagged consequence of an existing known gap** — this round's byte check for DoK's `xp` field
  (needed only to confirm the breakdown's monster-kill term) incidentally surfaced that
  `rollTreasure`'s gold is *also* always 0 for real DoK combat (the same root cause, one level
  removed) and that DoK monster combatants spawn at 0 HP (same gap, different symptom). Neither is
  this round's fix target, but both are now on record for a future round instead of being
  re-discovered from scratch.
- **Not every "computed but unwired" fix belongs in the same display surface.** M55/M56 both
  extended `referenceDb.ts`'s `monsterCategory()`; this round deliberately went to a different
  file/subsystem (`combat.ts`'s post-combat flow) for a fact that lives there instead — matching
  the brief's own framing of this as a "genuinely different-shaped candidate." Future rounds
  should keep scanning across *all* of a fact's potential display chokepoints, not just the one
  that has already proven convenient to extend.
