# M48 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M42–M47 in full, and
> `docs/engine/research/m47-audit.md` in full (its Rejected-alternatives / Open-questions /
> Implications sections in particular). Per this round's brief, a fresh, skeptical pass was taken
> over M47's own three flagged-but-unpicked candidates (`DetectionMatch.series`/`.ruleset`/
> `.engineGen` in `library.ts`) before sweeping elsewhere — see "Revisiting M47's flagged candidates"
> below for why none of the three now clears the "tightly-scoped, non-layout-changing, single-line
> fix" bar any better than they did last round. `referenceDb.ts`, `saveStore.ts`, and
> `library.ts`/`gameview.ts` were otherwise avoided per the standing brief.
>
> This round's finding uses angle (c) — "grep compositor doc comments for describing behaviour that
> isn't actually implemented below them" — extended for the first time from a `packages/engine/src/
> render/*` **compositor** to a `packages/engine/src/combat/tactical.ts` **engine-API doc comment**,
> cross-checked against its one real UI consumer (`apps/web/src/ui/combat.ts`). It also uses angle
> (d) — a sibling pattern *already shipped in the exact same file* (`combat.ts`'s own `rangeTag()`
> helper) that the new fix directly mirrors.
>
> Every real-mechanic claim below was independently re-derived this round via a throwaway `vitest`
> script (`packages/engine/test/_scratch_m48_backstab_hint.test.ts`, created, run, **5/5 green**, then
> deleted — listed at the end). `git status --porcelain` is clean except this doc.
>
> **Headline pick: `TacticalCombat.canBackstab()` / `.isBehind()` — two engine predicates explicitly
> doc-commented as existing to "drive" a player-facing targeting hint ("Backstab!" / a rear-arc
> "flank" tag) and already gating the REAL to-hit/damage math the moment an attack resolves — are
> silently absent from the one live line of text the tactical combat screen already shows while a
> player is choosing a target (`Target <name> (HP <n>, melee/shot)`), even though the engine already
> exposes both facts, the UI file already imports and reads them (via the e2e seam), and the exact
> same file already has a shipped precedent for appending a conditional bracketed tag to a combat
> string (`rangeTag()` → `" (point blank)"` / `" (long range)"`).**

## Headline finding

`combat/tactical.ts`'s `TacticalCombat` interface doc-comments two predicates in language stronger
than a generic "for display" tag — it says outright that each one **drives a UI hint**:

```ts
// packages/engine/src/combat/tactical.ts:643-653
/**
 * True when the current actor is a thief positioned to backstab `targetId` right now — a melee foe
 * in reach that the actor stands behind ({@link isBehindTarget}). With no `targetId`, true if **any**
 * in-reach foe could be backstabbed. Drives the UI "Backstab!" hint (CT.5c).
 */
canBackstab(targetId?: string): boolean;
/**
 * True when the current actor stands in `targetId`'s **rear arc** — a melee strike would get the rear/
 * flank AC advantage (CT.7a). Unlike {@link canBackstab} this is for ANY attacker, driving a UI hint.
 */
isBehind(targetId: string): boolean;
```

Both are real, independently-varying, already-consumed facts, not placeholders. The engine's own
attack resolver reads them (or the same `isBehindTarget` primitive) to apply the actual to-hit/damage
bonus the instant a melee swing resolves:

```ts
// packages/engine/src/combat/tactical.ts:1116-1122 (resolveHit, current state)
const fromRear = !missile && isBehindTarget(target.facing, target.pos, actor.pos);
const effAc = fromRear && target.rearAc !== undefined ? target.rearAc : target.ac;
let needed = actor.thac0 - effAc;
if (backstab) needed -= 4;                                            // thief backstab bonus
else if (fromRear && target.rearAc === undefined) needed -= REAR_TO_HIT_BONUS; // +2, ANY attacker
```

`REAR_TO_HIT_BONUS = 2` (`tactical.ts:573`) is the "for ANY attacker" bonus `isBehind` describes; the
thief-only `-4`/×2-×5 damage multiplier is `canBackstab`'s. Both are engine-tested per-position/per-
facing (`packages/engine/test/tactical.test.ts:700-761`, e.g. "a thief behind a foe backstabs: +4 to
hit and ×multiplier damage" / "a frontal thief strike is an ordinary hit").

`apps/web/src/ui/combat.ts` already imports both onto its one live e2e seam — proving the values are
already reachable at the JS layer, not a missing wire:

```ts
// apps/web/src/ui/combat.ts:1149,1151 (installSeam, current state)
canBackstab: (id?: string) => state?.combat.canBackstab(id) ?? false,
...
isBehind: (id: string) => state?.combat.isBehind(id) ?? false,
```

But the ONE place a player actually sees text while choosing a target — `highlightTarget()`, called
every time the target cursor moves in Attack mode — never reads either:

```ts
// apps/web/src/ui/combat.ts:926-936 (highlightTarget, current state)
function highlightTarget(): void {
  if (!state) return;
  const id = state.targets[state.targetIdx];
  if (!id) return;
  const foe = state.combatants.find((c) => c.id === id);
  setActive(id); // cursor sits on the chosen target
  if (foe) recenterOn(foe.pos);
  const melee = state.combat.meleeTargets().some((t) => t.id === id);
  state.banner = `Target ${nameOf(id)} (HP ${Math.max(0, foe?.hp ?? 0)}, ${melee ? 'melee' : 'shot'})`;
  draw();
}
```

`state.banner` is not cosmetic scratch state — it is spliced directly into the real, painted combat
message log every `draw()`:

```ts
// apps/web/src/ui/combat.ts:507-539 (draw, current state)
const lines = [...state.log.slice(-5), state.banner].filter(Boolean).join('\n').split('\n').slice(-6).join('\n');
...
const fb = composeCombatScreen({ ..., message: lines, ... });
state.surface.paint(fb, EGA_PALETTE);
```

So a player cycling targets today sees only HP and melee-vs-shot — never a warning that the target
they're about to confirm is a backstab (thief) or flank (any attacker) opportunity, even though the
instant they confirm, the engine silently applies the bonus anyway. The information exists, is
correct, and is one field-read away from the exact line already on screen.

## Precedent already shipped in the SAME file (angle d, localized)

`combat.ts` already has a working pattern for exactly this: append a short, **conditionally empty**
bracketed tag onto a combat string, driven by a real per-attack fact:

```ts
// apps/web/src/ui/combat.ts:562-564 (rangeTag, current state — unmodified, cited as PRECEDENT)
/** Combat-log suffix for a missile shot's range band (CT.7c): short = point blank (+1), long (−2). */
function rangeTag(b?: string): string {
  return b === 'short' ? ' (point blank)' : b === 'long' ? ' (long range)' : '';
}
```

used at `combat.ts:592`: `` `${nameOf(e.actor)} shoots ${nameOf(e.target)} for ${e.damage}${rangeTag(e.rangeBracket)}.` ``.
This is the *post-hoc* narration of a consequence that already happened (the shot already resolved).
`canBackstab`/`isBehind`'s own doc comments ask for the *pre-hoc* version of the same idea — a hint
shown **before** the player commits to the attack, while cycling targets — which is exactly what
`highlightTarget()`'s banner is for. The fix below reuses the identical "conditionally-empty bracketed
suffix" shape, just one caller earlier in the flow.

## Why this fits the loop's established shape

1. **The doc comment states a *display* purpose in the strongest form seen yet**: not "for display" or
   "shown to the player" but "**Drives the UI 'Backstab!' hint**" and "**driving a UI hint**" — the
   literal on-screen string is even quoted. Stronger signal than M46/M47's generic "display" tags.
2. **A real, already-shipped mechanical consumer exists independent of any UI** — the +4/×N backstab
   bonus and the +2 "any attacker" rear bonus are applied in `resolveHit()` regardless of whether a
   player was ever shown the hint; this is not a value invented for display.
3. **Angle (c), applied to an engine API doc comment instead of a compositor's** — `combat/tactical.ts`
   describes UI behaviour ("drives the hint") that does not exist below it in the one real caller.
4. **Angle (d), localized to a single file** — `combat.ts`'s own `rangeTag()` is a working, shipped
   precedent for "conditionally append a short bracketed tag to a combat-log line," making the fix a
   same-file pattern-reuse rather than a novel addition.
5. **The value is already reachable at the JS/e2e layer** (`combat.ts:1149,1151`), mirroring M47's
   "already reachable, just not painted" framing exactly.
6. **Zero engine-package change needed** — `TacticalCombat.canBackstab`/`.isBehind` are already typed,
   exported, and engine-tested (`tactical.test.ts:700-761`, 894-895).

## Real-bytes / real-mechanic verification (this round)

Reproduced independently via `packages/engine/test/_scratch_m48_backstab_hint.test.ts` (created, run,
**5/5 passed**, then deleted):

1. **`canBackstab` is real and varies with facing/position** — a level-6 thief west of a foe facing
   east (away) → `canBackstab('foe') === true`; the same thief vs. the foe facing west (toward it,
   frontal) → `false`.
2. **`isBehind` is real, independent of thief-ness, and independent of `canBackstab`** — a non-thief
   (`backstabLevel: undefined`) standing in the same rear-arc position → `isBehind('foe') === true`
   while `canBackstab('foe') === false` for the SAME position — proving the two facts are genuinely
   distinct (not one implying the other), confirming the doc comment's "Unlike `canBackstab` this is
   for ANY attacker" claim is not just prose.
3. **Both are already reachable at the e2e seam** — source-text match confirms
   `canBackstab: (id?: string) => state?.combat.canBackstab(id) ...` and
   `isBehind: (id: string) => state?.combat.isBehind(id) ...` already exist in `combat.ts`.
4. **`highlightTarget()`'s body never calls either** — sliced the function's exact source text
   (`function highlightTarget()` through the next `function confirmTarget`) and asserted
   `body.includes('canBackstab') === false` and `body.includes('isBehind') === false`, while also
   confirming the exact current banner template string is present (proving the slice is the right
   function, not a false negative).
5. **`tactical.ts` really does doc-comment both as UI-hint-driving** — source-text match for the
   literal phrases `Drives the UI "Backstab!" hint` and `Unlike {@link canBackstab} this is for ANY
   attacker, driving a UI hint`.

## Wiring plan

**One file touched for the fix (`apps/web/src/ui/combat.ts`) — no engine-package change — plus a small
extension of the existing `combat` e2e case (two new seam getters + one new assertion block).**

1. **`apps/web/src/ui/combat.ts:926-936`** (`highlightTarget`) — read the two already-imported-via-
   `state.combat` predicates, mirroring `rangeTag()`'s own "conditionally-empty bracketed suffix"
   shape. Melee-only, matching `resolveHit()`'s own `!missile` gate (§ above) so a missile "shot"
   never gets a misleading flank/backstab tag it can't mechanically receive:

   ```ts
   // before:
   function highlightTarget(): void {
     if (!state) return;
     const id = state.targets[state.targetIdx];
     if (!id) return;
     const foe = state.combatants.find((c) => c.id === id);
     setActive(id);
     if (foe) recenterOn(foe.pos);
     const melee = state.combat.meleeTargets().some((t) => t.id === id);
     state.banner = `Target ${nameOf(id)} (HP ${Math.max(0, foe?.hp ?? 0)}, ${melee ? 'melee' : 'shot'})`;
     draw();
   }

   // after (M48.S1):
   function highlightTarget(): void {
     if (!state) return;
     const id = state.targets[state.targetIdx];
     if (!id) return;
     const foe = state.combatants.find((c) => c.id === id);
     setActive(id);
     if (foe) recenterOn(foe.pos);
     const melee = state.combat.meleeTargets().some((t) => t.id === id);
     // M48.S1 — canBackstab()/isBehind() already gate the real +4/×N (thief) and +2 (any attacker)
     // rear-hit bonuses in tactical.ts's resolveHit(); both are doc-commented there as existing to
     // "drive a UI hint" but neither reached this banner. Melee-only: resolveHit's own `!missile`
     // gate means neither bonus applies to a ranged "shot" target.
     const backstab = melee && state.combat.canBackstab(id);
     const flank = melee && !backstab && state.combat.isBehind(id);
     const tag = backstab ? ' (Backstab!)' : flank ? ' (flank)' : ''; // mirrors rangeTag()'s own shape
     state.banner = `Target ${nameOf(id)} (HP ${Math.max(0, foe?.hp ?? 0)}, ${melee ? 'melee' : 'shot'})${tag}`;
     draw();
   }
   ```

   Example real output changes: cycling to an adjacent foe facing away, with a thief active, currently
   reads `Target Draconian (HP 8, melee)` and would read `Target Draconian (HP 8, melee) (Backstab!)`;
   the same position with a non-thief active would read `Target Draconian (HP 8, melee) (flank)`; a
   frontal target or a missile "shot" target is unaffected (empty tag, byte-identical to today).

2. **Seam additions** (`apps/web/src/ui/combat.ts`'s `installSeam()`, next to the existing
   `canBackstab`/`isBehind` entries at `combat.ts:1149,1151`) — two small getters so the e2e case can
   exercise the REAL `highlightTarget()` code path (today's `attack(id)` seam call goes through
   `seamAttack()`, which bypasses target-cycling and `highlightTarget()` entirely):

   ```ts
   // M48.S1 — exercise the real target-cycling banner (highlightTarget()), not just the attack seam.
   enterTarget: () => { enterTargetMode(); return state?.banner ?? ''; },
   currentTargetId: () => state?.targets[state!.targetIdx] ?? null,
   ```

   `enterTargetMode()` only requires `state.phase === 'party-menu'` (a no-op otherwise) and does not
   disturb the subsequent existing `attack(id)` call — `seamAttack()` never reads `state.phase`.

3. **Tests** (extend the existing `combat` e2e case only — no new test file, no new case). In
   `apps/web/test/e2e.mjs`, alongside the existing `manualOk` block (`e2e.mjs:1048-1055`, same
   `if (!startedOver && phase0 === 'party-menu')` guard) add a coherence check — real encounters are
   pseudo-random, so rather than pin one exact scenario the check confirms the banner's tag agrees
   with the real predicate for whichever target is first cycled to:

   ```js
   // M48.S1 — the live targeting banner now tags (Backstab!)/(flank) exactly when the real
   // canBackstab()/isBehind() predicates say so, for the target highlightTarget() actually selects.
   let targetHintOk = true;
   if (!startedOver && phase0 === 'party-menu') {
     const banner0 = await page.evaluate('window.__combat.enterTarget()');
     const tgtId = await page.evaluate('window.__combat.currentTargetId()');
     if (tgtId) {
       const bs = await page.evaluate(`window.__combat.canBackstab(${JSON.stringify(tgtId)})`);
       const behind = await page.evaluate(`window.__combat.isBehind(${JSON.stringify(tgtId)})`);
       const hasBase = banner0.includes('Target ') && banner0.includes('HP');
       const hasBackstabTag = banner0.includes('(Backstab!)');
       const hasFlankTag = banner0.includes('(flank)');
       targetHintOk = hasBase && (hasBackstabTag === bs) && (bs || hasFlankTag === behind);
     }
   }
   // ... fold into the existing `ok = cells >= 4 && ... && targetHintOk && ...` / debug line.
   ```

Rough size: ~6 LOC changed/added in `combat.ts` (1 function body + 2 seam getters), ~12 LOC added to
the existing `combat` e2e case. No engine-package file touched, no new test file, no new e2e case, no
new route, no new UI panel.

## Layout / feasibility check

Unlike M47's plain-HTML Library list, `composeCombatScreen`'s message region (rows 17–22,
`TEXT_MAX_ROWS = 6`, `packages/engine/src/render/combatScreen.ts:65-67,316-321`) IS the fixed-width
320×200 EGA framebuffer class this loop has had to reason about before (`drawText`/`drawChar` clip
per-pixel at the framebuffer edge — no crash, but a too-long line silently loses its rightmost
characters, `packages/engine/src/render/textmode.ts:80-104`). A worked example: `Target Draconian (HP
8, melee) (Backstab!)` is ~42 characters; the usable message width is ~38-39 columns (`TEXT_COL0 = 1`
through the 40-column screen edge), so on paper this specific example would lose 3-4 trailing
characters (e.g. `!)` clipped).

**This is not a new risk class introduced by this fix, though** — the SAME message region already
carries longer real content today: the post-hoc backstab narration line
(`combat.ts:590`, `` `${nameOf(e.actor)} backstabs ${nameOf(e.target)} (from behind) for ${e.damage}!` ``)
is already routinely 45+ characters with realistic names (e.g. "Sturm backstabs Draconian (from
behind) for 5!" = 46 chars), and ships today with no reported clipping complaint. The targeting-banner
addition sits within the same tolerance band the codebase already accepts for its longest existing
combat-log line, not a new departure from it. Flagged as an explicit open question below (shorter
wording is possible if a tighter bound is wanted) rather than a blocker.

## Revisiting M47's flagged candidates (fresh look, per this round's brief)

- **`DetectionMatch.series`** (`profiles.ts:75`, "Series/grouping, e.g. \"Krynn\"") — re-checked
  `onLibrarySelect()` (`apps/web/src/ui/main.ts:688-726`) and the current `BUILTIN_PROFILES` roster
  (`profiles.ts`): still 3 series (Krynn / Forgotten Realms / Buck Rogers) across 8 profiles, and
  still no grouping precedent in `library.ts` (a flat list, one row per entry). M47's reasoning is
  unchanged: showing `series` well means visually grouping the Library list, which is a layout change,
  not a one-line string edit. Still correctly out of scope this round.
- **`DetectionMatch.ruleset`** (`profiles.ts:77`) — re-checked `onLibrarySelect()` end-to-end: routing
  is still purely `profileId`/`platform`-based (`gameIdForProfile()` in `apps/web/src/ui/gameData.ts:129`
  only maps `'cok' | 'dok'`; DQK routes on a hard-coded `profileId === 'dark-queen-of-krynn'` check;
  every broader-roster title — Pool of Radiance / Curse of the Azure Bonds / Gateway to the Savage
  Frontier / Buck Rogers — still falls through to the generic "Playable rendering for this variant
  arrives in a later milestone" status line (`main.ts:721-724`), which does not reference `.ruleset` at
  all. **The roster has NOT become more playable since M47** — same 3 playable titles (CoK/DoK/DQK),
  same 4 detect-only titles. `.ruleset` still has no real gameplay consumer. Confirmed unchanged.
- **`DetectionMatch.engineGen`** (`'gen1-dax' | 'gen2-hlib'`) — re-checked: still fully redundant with
  `graphicSet`/`container` for every currently-detectable profile (Amiga variants are `engineGen:
  'gen1-dax'` alongside DOS DAX variants of the same two games — so `engineGen` doesn't even track
  `container` 1:1 — but a player who already sees `HLIB` in the now-fixed (M47) meta line has already
  learned "Gen2," making a 4th token add no new information). Confirmed unchanged from M47.

None of the three clears this round's "tightly-scoped, non-layout-changing, single-line fix" bar any
better than M47 found; all three remain legitimate, correctly-deferred, standing candidates.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`MainMenuMember.level`** (`render/mainMenu.ts:55,64,189`) | Read in full. `composeMainMenu` does read it (`m.level ? \`${m.cls} ${m.level}\` : m.cls`), but the one real caller (`apps/web/src/ui/mainMenu.ts`'s `roster()`) never sets it — HOWEVER this is not a drop: `PartyMemberStatus.cls` (`party.ts:387-417`) is built by `classLabel()`, which already bakes the level into the class string itself (e.g. `"FTR 3"`, `party.ts:378-384`). The unread `.level` field is genuinely redundant, not a silently-dropped fact — same shape as the already-rejected degenerate fields (`age`, `hpFraction`). |
| **`ManifestFile.label`** (`game/loadGame.ts:36`, "Optional display label") | Read — already fully wired (`loadGame.ts:220`, `const name = mf.label ?? stem(mf.path)`, threaded into every `GameFrame.label` downstream). No gap. |
| **`Encumbrance.label`/`.allowanceTenths`/`.maxLoadTenths`** (`items/encumbrance.ts:17-24`) | `inventory.ts` (already swept M42-M47) reads `.label` twice (`inventory.ts:66,313`); the other two numeric fields have no natural single-line display slot beyond what `.label`/`.moveRate` already surface via `moveRateForMember()`. Not pursued further — `inventory.ts` is on the standing swept-clean list. |
| **`CharacterSheet.deity` in `create.ts`'s creation-time preview panel** (`create.ts:297-330`) | Real and not shown in the LIVE creation preview (only race/classes/THAC0/AC/HP/knightOrder/saves/spellSlots are), but NOT a clean "never shown" drop — `charSheet.ts`'s footer already renders `Worships ${deity}` once the character exists (`charSheet.ts:60-61`), so the fact does reach the player, just one screen later than the preview. Too weak/ambiguous a gap to call a finding (matches the standing bar set by the rejected `ManifestFile.note` case in M47). |
| **`artmap.ts`, `demo.ts`, `menus.ts`, `play.ts`, `moduleExplore.ts`** (read in full) | All confirmed clean — each already threads its own computed state (mapping validity, attract-walk stats, demo party positions, phase, module art/event state) into its own real DOM/e2e surface with no unread sibling field found. |
| **`dqkProtection.ts`'s `DqkProtectionQuestion.page`** ("informational") | Read — this module feeds the headless DOSBox-vision copy-protection solver bot, not any player-facing `apps/web` UI surface at all; out of scope for this loop's "player-visible UI panel" mission. |
| **`DetectionMatch.series`/`.ruleset`/`.engineGen`** (M47, re-examined) | See "Revisiting M47's flagged candidates" above — all three confirmed unchanged/still correctly deferred. |
| **`referenceDb.ts`'s `Class`-label collision, `saveStore.ts`'s `listSlots()`, `library.ts`/`gameview.ts`** | Not re-investigated — brief explicitly steered away from these this round (5th/1st/1st rounds resp. on those files). |
| **Item-instance subsystem, `PartyMemberStatus.age`, `MapCell.ceiling`/`.flags`, `MonsterRecord.conSaveBonus`/`.itemPluses`/`.carriedItems`/`.preparedSpellIds`, dialogue.ts/town.ts `day`-wiring, DoK `baseTypeId` alias question, `TacticalSpell.inflict`, DoK Companion-Panel e2e positive controls** (all standing) | Not re-investigated, per standing instructions — no new angle developed on any of these this round. |

## Open questions / unknowns

- **Is `" (Backstab!)"`/`" (flank)"` the right wording, or should it be shorter to reduce the
  already-existing framebuffer-edge clipping risk** (see Layout/feasibility)? A tighter option like
  `" BS!"`/`" flk"` would fit more reliably but reads less clearly; the current codebase's own
  precedent (`rangeTag()`) favours clarity over brevity, and the SAME risk already exists unaddressed
  for the longer post-hoc backstab log line — not resolved either way, flagged like M45's/M47's
  wording open questions.
- **Should the flank/backstab tag also appear in `attemptPartyFlee()`'s or `aiAction()`'s reasoning**,
  i.e., should the AI-driven auto-resolve path narrate when IT lands a rear/backstab hit before the
  fact (not just the post-hoc `combat.ts:590` log line)? Out of scope for this round's single-caller
  fix — `highlightTarget()` is the one PLAYER-facing pre-attack decision point; the AI path already has
  its own post-hoc narration.
- **`DetectionMatch.series`/`.ruleset`/`.engineGen` remain real, decoded, and unshown** — reconfirmed
  this round (see above); still correctly gated on a broader-roster playability milestone that has not
  yet landed.
- **`saveStore.ts`'s `listSlots()`/`SaveSummary`** (flagged M46, standing, not re-investigated) — still
  gated on a multi-slot save/load UI that doesn't exist.

## Implications for our engine

- **Angle (c) — "doc comment describes UI behaviour not implemented below" — generalises from
  `render/*` compositors to plain engine-API interfaces** (`combat/tactical.ts`'s `TacticalCombat`).
  The signal is not limited to the render layer; any exported engine interface whose doc comment
  claims a UI consequence ("drives the hint", "for the UI to label") is worth the same doc-comment
  grep this and prior rounds have run against `render/*` files specifically.
- **A same-file shipped precedent (`rangeTag()`) is as strong a "safe to extend" signal as a sibling-
  file precedent (M47's `gameview.ts` vs `library.ts`)** — arguably stronger, since it proves the exact
  author of `combat.ts` already solved "how do I append a conditional short tag to this templated
  string" once, in the same file, for a mechanically-adjacent fact (missile range bands vs. melee rear
  position).
- **Not every "silently dropped, doc-commented display field" is equally low-risk** — this round's
  fix DOES touch the fixed-width EGA framebuffer message region (unlike M47's plain-HTML fix), but the
  same region already tolerates longer real strings today, so the specific risk is bounded by existing
  precedent rather than novel. Worth continuing to distinguish "framebuffer text, but within the
  existing tolerance band" from "framebuffer text, genuinely new risk" as a finer-grained middle
  category between M47's two extremes.
- **Pre-hoc hints (shown before a player commits to an action) and post-hoc narration (shown after)
  are a useful new distinction for future sweeps** — this round's gap was specifically that the
  post-hoc case (`combat.ts:590`, `:592`'s `rangeTag`) was already done, while the pre-hoc case
  (`highlightTarget()`) for the SAME underlying fact was not; worth checking other "narrates the
  consequence but never previews it" pairs in future rounds (e.g. spell saves, morale breaks).

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m48_backstab_hint.test.ts` (5 tests: `canBackstab` varies with
  facing/position via the engine's own `createTacticalCombat`; `isBehind` is real, varies, and is
  independent of `canBackstab` — proving the "for ANY attacker" doc claim is substantive, not prose;
  a source-text proof both are already exposed on `combat.ts`'s e2e seam; a source-text proof
  `highlightTarget()`'s function body never calls either; a source-text proof `tactical.ts` really
  doc-comments both as UI-hint-driving) — run via `npx vitest run` (5/5 passed), then deleted.
  Confirmed via `git status --porcelain` (clean except this doc) after deletion.
