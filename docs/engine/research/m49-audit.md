# M49 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M43–M48 in full, and
> `docs/engine/research/m48-audit.md` in full (its Rejected-alternatives / Revisiting-M47's-candidates /
> Open-questions sections in particular, per the brief). Per this round's brief, the fresh "pre-hoc hints
> vs. post-hoc narration" angle M48 introduced was hunted first — and paid off immediately: it is the
> **direct missile-attack sibling of the exact gap M48 closed for melee**, on a field M48 itself named as
> a candidate to check ("does the player get ANY pre-shot indication of point-blank/long range before
> confirming a ranged attack, the same gap M48 found for melee backstab?"). `referenceDb.ts`, `saveStore.ts`,
> `library.ts`/`gameview.ts`, and `combat.ts`'s already-mined `highlightTarget()` predicates
> (`canBackstab`/`isBehind`/`rangeTag`) were not re-litigated — this round adds a **third, previously
> unread** predicate to the same function.
>
> Every real-mechanic claim below was independently re-derived this round via a throwaway `vitest` script
> (`packages/engine/test/_scratch_m49_range_hint.test.ts`, created, run, **7/7 green**, then deleted —
> listed at the end). `git status --porcelain` is clean except this doc.
>
> **Headline pick: `TacticalCombat.missileBracket()` — the engine predicate that already computes a
> missile shot's range band (short/medium/long) and is doc-commented as existing to "drive the
> '(long range)' UI hint" — is already exposed on `combat.ts`'s e2e seam (shipped with CT.7c on
> 2026-06-23, a full 11 days before M48), already gates the real +1/0/−2 to-hit modifier the instant a
> ranged attack resolves, and is even faithful to a byte-located fact from CoK's OWN binary (its
> targeting UI printed a live `Range = N` readout, `GAME.OVR` @0x17d5a/@0x1810e) — yet the one live
> banner a player watches while cycling targets, `highlightTarget()` (the exact function M48 just
> extended for backstab/flank), still shows a missile target only as a bare `shot`, with no hint of its
> range band, even though `rangeTag()` — the ready-made formatter for this exact string — already exists
> two names above it in the same file and is already used for the post-hoc version of the identical
> fact.**

## Headline finding

`combat/tactical.ts`'s `TacticalCombat` interface doc-comments `missileBracket()` in the same
UI-hint-driving language M48 keyed on for `canBackstab`/`isBehind`:

```ts
// packages/engine/src/combat/tactical.ts:656-660
/**
 * The range band (short/medium/long) the current actor's missile weapon would hit `targetId` in, or
 * null if it has no missile weapon (CT.7c). Drives the "(long range)" UI hint.
 */
missileBracket(targetId: string): RangeBracket | null;
```

Implementation (unmodified, same closure as `canBackstab`/`isBehind`):

```ts
// packages/engine/src/combat/tactical.ts:1885-1892
missileBracket: (targetId: string) => {
  const a = current();
  const t = combatants.find((c) => c.id === targetId);
  if (!a || !t) return null;
  const w = missileWeapon(a);
  if (!w) return null;
  return missileRangeBracket(chebyshev(a.pos, t.pos), w.range ?? 0);
},
```

It is real and independently varying — not a stub — and the engine's own attack resolver applies the
exact same banding to the actual to-hit roll the instant a shot fires:

```ts
// packages/engine/src/combat/tactical.ts:1123-1132 (resolveHit, current state)
// CT.7c — MISSILE RANGE BRACKET. A shot's to-hit shifts by distance band: short +1 / medium 0 /
// long −2 (a bonus lowers `needed`, a penalty raises it). CoK's targeting IS range-aware (the
// "Range = N" readout is byte-located), but the bracket magnitudes are cross-overlay/COAB-item-data
// (UNLOCATED) → 1e-inferred + labelled. Thrown weapons use the same banding off their `range`.
let bracket: RangeBracket | undefined;
if (missile) {
  // CT.7f — measure the band from the nearest cells of each figure (a Large target is "closer").
  bracket = missileRangeBracket(figureDistance(actor, target), weapon.range ?? 0);
  needed -= rangeBracketToHit(bracket);
  needed -= actor.missileHitBonus ?? 0; // M25.S1 — COAB DexReactionAdj, ranged weapons only
}
```

`rangeBracketToHit` is `short +1 / medium 0 / long −2` (`tactical.ts:603-617`), and this exact CT.7c
milestone is the one M48's own rejected-alternatives note never mentions because M48's fix only touched
the melee (`canBackstab`/`isBehind`) branch of the same banner — the missile branch was left completely
alone. CT.7c shipped **2026-06-23**, 11 days *before* M48 (2026-07-04), specifically with "the seam +
'(point blank)'/'(long range)' log tags" per its own changelog entry
(`docs/engine/BUILD-QUEUE.md:266-276`) — so this predicate has been sitting fully built, tested, and
seam-exposed for the entire life of the M42–M48 audit-loop run without ever reaching a pre-attack
preview.

`apps/web/src/ui/combat.ts` already exposes it on the exact same e2e seam object M48 used for
`canBackstab`/`isBehind`:

```ts
// apps/web/src/ui/combat.ts:1161 (installSeam, current state)
missileBracket: (id: string) => state?.combat.missileBracket(id) ?? null,
```

But `highlightTarget()` — the same function M48 just extended with the melee backstab/flank tag — still
only distinguishes `melee` vs. `shot` and never reads it for the shot case:

```ts
// apps/web/src/ui/combat.ts:926-941 (highlightTarget, current state, POST-M48)
function highlightTarget(): void {
  if (!state) return;
  const id = state.targets[state.targetIdx];
  if (!id) return;
  const foe = state.combatants.find((c) => c.id === id);
  setActive(id); // cursor sits on the chosen target
  if (foe) recenterOn(foe.pos);
  const melee = state.combat.meleeTargets().some((t) => t.id === id);
  // M48.S1 — canBackstab()/isBehind() already gate the real +4/×N (thief) and +2 (any attacker)
  // rear-hit bonuses in tactical.ts's resolveHit(); melee-only, matching resolveHit's own !missile gate.
  const backstab = melee && state.combat.canBackstab(id);
  const flank = melee && !backstab && state.combat.isBehind(id);
  const tag = backstab ? ' (Backstab!)' : flank ? ' (flank)' : ''; // mirrors rangeTag()'s own shape
  state.banner = `Target ${nameOf(id)} (HP ${Math.max(0, foe?.hp ?? 0)}, ${melee ? 'melee' : 'shot'})${tag}`;
  draw();
}
```

`tag` is empty for every `shot` (missile) target today, no matter how close or far it is. The player
cycling to a bowman across the map sees `Target Draconian (HP 8, shot)` whether the shot is
point-blank (+1 to hit) or long range (−2) — identical text for mechanically opposite situations — even
though the moment they confirm, `resolveHit()` silently applies the real modifier anyway.

## An even stronger grounding than M48's own headline had

M48's `canBackstab`/`isBehind` are grounded in a doc-comment claim plus AD&D-1e convention. This round's
fact is grounded one level deeper: **CoK's own original binary's targeting UI printed a live range
readout to the player** — not inferred, byte-located:

```ts
// packages/engine/src/combat/tactical.ts:607-613 (rangeBracketToHit doc comment, unmodified)
/**
 * ...
 * **RE-gate (honest):** CoK's combat *is* range-aware — the targeting UI prints **`Range = N`** to the
 * player (string byte-located in `GAME.OVR` @0x17d5a/0x1810e) and has a **`Cannot target `** restriction
 * (@0x1708b), so the engine computes shot distance. But the code that turns the range into a to-hit
 * modifier is cross-overlay (the string xref resolves to none in-segment, the recurring VROOMM wall), and
 * the bracket magnitudes themselves live in COAB's item data (seg600 ~0x5D10, UNLOCATED even there). So the
 * **+1/0/−2 values are the AD&D-1e / Gold-Box-community standard, labelled inferred** — the same policy as
 * the spell/turn/backstab/rear-AC numbers. See `combat-mechanics-coab.md` §6, `disasm-spells-krynn.md` §17.
 * ...
 */
```

Confirmed in `docs/engine/BUILD-QUEUE.md:270-272` (CT.7c's own changelog entry): *"CoK's combat **is
range-aware in its own binary** — the targeting UI prints **`Range = N`**"*. The **+1/0/−2 magnitudes**
are 1e-inferred (honestly labelled, same as always), but the *existence of a pre-shot range readout in
the player's targeting UI* is not an inference at all — it is the one fact this round's fix restores
that the original game already had and our reimplementation currently lacks.

## Precedent already shipped in the SAME file (angle d) — reused by M48, reused again here

```ts
// apps/web/src/ui/combat.ts:562-565 (rangeTag, current state — unmodified, cited as PRECEDENT)
/** Combat-log suffix for a missile shot's range band (CT.7c): short = point blank (+1), long (−2). */
function rangeTag(b?: string): string {
  return b === 'short' ? ' (point blank)' : b === 'long' ? ' (long range)' : '';
}
```

used today only post-hoc, at `combat.ts:592`:
`` `${nameOf(e.actor)} shoots ${nameOf(e.target)} for ${e.damage}${rangeTag(e.rangeBracket)}.` ``. This
is the exact formatter the pre-hoc fix needs — no new string logic, just one earlier call site, passing
`state.combat.missileBracket(id)` instead of a resolved event's `.rangeBracket`. This is the same
function M48 flagged as its own "shipped precedent" and is now reused a second time, by the same
mechanism, for the sibling fact.

## Why this fits the loop's established shape

1. **Same doc-comment signal M48 used** ("Drives the ... UI hint", `tactical.ts:658`), on a *third*
   `TacticalCombat` predicate that turned out to have the identical gap.
2. **A real, already-shipped mechanical consumer independent of any UI** — the +1/0/−2 modifier is
   applied in `resolveHit()` (`tactical.ts:1123-1132`) regardless of whether a player is ever shown a
   hint.
3. **Angle (d), doubly localized** — `rangeTag()` is not just a sibling-file precedent but the *literal
   formatter this fix needs*, already imported/defined in the very function being extended.
4. **Already reachable at the JS/e2e layer** (`combat.ts:1161`, shipped since CT.7c) — mirrors M47's/M48's
   "already reachable, just not painted" framing exactly, and has been sitting unused at the seam for
   longer than any prior round's finding (11 days before M48's own fix, in the same file).
5. **Zero engine-package change needed** for the core fix — `missileBracket` is already typed, exported,
   and engine-tested (`tactical.test.ts:1028-1032` — "missileBracket seam reports the band for the
   current archer").
6. **Directly continues M48's own "pre-hoc vs. post-hoc" framing** — M48's Implications section named
   "spell saves, morale breaks" as future candidates to check for the same shape; this round instead
   found the shape sitting in the exact same function M48 had just edited, for the exact sibling case
   (missile vs. melee) M48's own gating logic (`!missile` in `resolveHit`, `melee` bool in
   `highlightTarget`) was already built to distinguish.

## Real-bytes / real-mechanic verification (this round)

Reproduced independently via `packages/engine/test/_scratch_m49_range_hint.test.ts` (created, run,
**7/7 passed**, then deleted):

1. **`missileBracket()` is real and varies independently with distance** — the same archer/dummy pair at
   distances 3/5/8 against a 9-cell-range bow returns `'short'`/`'medium'`/`'long'` respectively (mirrors
   the existing engine test at `tactical.test.ts:1028-1032`, re-derived independently this round).
2. **`missileBracket()` is `null`, not a degenerate default, for a figure with no missile weapon** —
   confirmed `noBow.missileBracket('t') === null` for an archer with no bow equipped.
3. **`tactical.ts` really doc-comments `missileBracket` as UI-hint-driving** — source-text match for the
   literal phrase `Drives the "(long range)" UI hint` immediately preceding the
   `missileBracket(targetId: string): RangeBracket | null;` interface member (not some other predicate).
4. **`combat.ts` already exposes it on the e2e seam** — source-text match for
   `missileBracket: (id: string) => state?.combat.missileBracket(id) ?? null,`.
5. **`highlightTarget()`'s body never calls it** — sliced the function's exact source text
   (`function highlightTarget()` through the next `function confirmTarget()`), confirmed the slice is the
   right (post-M48) function by asserting it already contains `(Backstab!)`/`(flank)`, then asserted
   `body.includes('missileBracket') === false`.
6. **`rangeTag()` is the shipped post-hoc precedent, used only in `logEvents`, never in
   `highlightTarget()`** — source-text match for both the function definition and its one call site
   (`combat.ts:592`).
7. **A genuinely new caveat surfaced by this round's own verification, not previously documented**:
   `missileBracket()`'s implementation measures distance with plain `chebyshev(a.pos, t.pos)`
   (`tactical.ts:1891`), but `resolveHit()` measures with the **footprint-aware** `figureDistance(actor,
   target)` (`tactical.ts:1130`, explicitly commented "measure the band from the nearest cells of each
   figure (a Large target is "closer")", CT.7f). For a Large (2×2) target at an asymmetric angle these
   disagree: an archer at (12,12) vs. a Large target anchored at (8,8) — `missileBracket('t')` (plain
   chebyshev to the anchor cell, distance 4) reports **`'medium'`**, while the actual shot event's
   resolved `rangeBracket` (footprint-aware, nearest cell (9,9), distance 3) is **`'short'`**. Confirmed
   by test 7 (both values asserted, and asserted unequal). This is a **pre-existing engine implementation
   detail**, not something introduced by this round's finding or its proposed fix — but wiring
   `missileBracket()` into a player-visible preview for the first time makes this discrepancy player-
   visible too, for Large monsters near a bracket boundary. See "Open questions" below.

## Wiring plan

**One file touched for the fix (`apps/web/src/ui/combat.ts`) — no required engine-package change — plus a
small extension of the existing `combat` e2e case's M48 coherence check. Mirrors M48's wiring plan
exactly, adding one more conditional branch to the same `tag` expression it already introduced.**

1. **`apps/web/src/ui/combat.ts:926-941`** (`highlightTarget`) — extend the `tag` ternary M48 added with
   one more `else` branch, reusing `rangeTag()` (already defined at `combat.ts:562-565`) verbatim on the
   shot case, exactly mirroring the post-hoc call at `combat.ts:592`:

   ```ts
   // before (current, post-M48):
   const backstab = melee && state.combat.canBackstab(id);
   const flank = melee && !backstab && state.combat.isBehind(id);
   const tag = backstab ? ' (Backstab!)' : flank ? ' (flank)' : ''; // mirrors rangeTag()'s own shape
   state.banner = `Target ${nameOf(id)} (HP ${Math.max(0, foe?.hp ?? 0)}, ${melee ? 'melee' : 'shot'})${tag}`;

   // after (M49.S1):
   const backstab = melee && state.combat.canBackstab(id);
   const flank = melee && !backstab && state.combat.isBehind(id);
   // M49.S1 — missileBracket() already gates the real +1/0/-2 to-hit modifier in resolveHit()
   // (tactical.ts:1123-1132) for a "shot" target; rangeTag() already narrates it post-hoc once a shot
   // resolves (combat.ts:592) — this reuses rangeTag() verbatim for the pre-hoc banner. `!melee` mirrors
   // resolveHit's own `missile` gate exactly, so a melee target never gets a range tag it can't receive.
   const tag = backstab ? ' (Backstab!)' : flank ? ' (flank)'
     : !melee ? rangeTag(state.combat.missileBracket(id) ?? undefined) : '';
   state.banner = `Target ${nameOf(id)} (HP ${Math.max(0, foe?.hp ?? 0)}, ${melee ? 'melee' : 'shot'})${tag}`;
   ```

   Note the `?? undefined` coercion: `missileBracket()` returns `RangeBracket | null`, while `rangeTag(b?:
   string)` expects `string | undefined` — `null` is not directly assignable under this repo's
   `strictNullChecks`, so the nullish-coalesce is required (confirmed by inspecting `rangeTag`'s existing
   call site at `combat.ts:592`, where `e.rangeBracket` is already typed `RangeBracket | undefined` on the
   event and needs no coercion — the seam method's `| null` return is the one place this conversion is
   newly needed).

   Example real output changes: cycling to a bowman at short range currently reads
   `Target Draconian (HP 8, shot)` and would read `Target Draconian (HP 8, shot) (point blank)`; the same
   target at long range would read `... (long range)`; medium range is unaffected (empty tag, matching
   `rangeTag()`'s own medium-is-silent convention); a melee target is unaffected either way (the new branch
   is gated behind `!melee`, so it can never fire alongside — or instead of — the M48 backstab/flank tag).

2. **No new seam getters needed** — unlike M48 (which had to add `enterTarget()`/`currentTargetId()`),
   this round's fact is already on the seam at `combat.ts:1161` (`missileBracket`), and M48 already added
   the two target-cycling getters this fix also needs. Nothing new to expose.

3. **Tests** (extend the existing `combat` e2e case's M48 `targetHintOk` block only — no new test file,
   no new case). In `apps/web/test/e2e.mjs`, at the `targetHintOk` block M48 added (`e2e.mjs:1049-1061`),
   add one more coherence check for the shot case, following the identical "whichever target is first
   cycled to" pattern M48 used (real encounters are pseudo-random, so this can't pin one exact scenario):

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
       const meleeOk = hasBackstabTag === bs && (bs || hasFlankTag === behind);
       // M49.S1 — a "shot" target's banner now carries the same rangeTag() the post-hoc log line
       // already uses; check agreement with the real missileBracket() for whichever target this is.
       const isShot = banner0.includes(', shot)');
       let shotOk = true;
       if (isShot) {
         const band = await page.evaluate(`window.__combat.missileBracket(${JSON.stringify(tgtId)})`);
         const hasPointBlank = banner0.includes('(point blank)');
         const hasLongRange = banner0.includes('(long range)');
         shotOk = (hasPointBlank === (band === 'short')) && (hasLongRange === (band === 'long'));
       }
       targetHintOk = hasBase && meleeOk && shotOk;
     }
   }
   // ... fold into the existing `ok = cells >= 4 && ... && targetHintOk && ...` / debug line (unchanged
   // variable name — no new flag needed in the `ok`/debug-line assembly).
   ```

Rough size: ~2 LOC changed in `combat.ts` (one ternary branch extended) + a one-line import-adjacent note
(none needed — `rangeTag` is already in scope), ~10 LOC added to the existing `combat` e2e case's existing
`targetHintOk` block. No engine-package file touched for the required fix, no new test file, no new e2e
case, no new seam getters, no new route, no new UI panel.

**Optional accompanying one-line engine fix (not required, flagged separately):** `missileBracket`'s
implementation (`tactical.ts:1891`) could swap `chebyshev(a.pos, t.pos)` for the already-in-scope
`figureDistance(a, t)` (same closure, same helper `resolveHit()` itself uses at `tactical.ts:1130`) to
close the Large-monster footprint discrepancy found in verification step 7 above. This is a genuine,
tightly-scoped, one-line engine correction, but it is **independent of the UI wiring fix** (the pre-hoc
banner is correct either way, just occasionally imprecise for Large monsters at boundary distances,
exactly as precise/imprecise as the fact already is at the seam today) — left as an explicit open
question for the lead rather than folded into "the fix," per this round's brief to keep the wiring plan
small.

## Layout / feasibility check

Same fixed-width EGA framebuffer message region M48 already reasoned about — rows 17–22,
`TEXT_MAX_ROWS = 6`, `packages/engine/src/render/combatScreen.ts:65-67,316-321` — no new risk class.
Worked examples, character-counted:

| String | Length |
|---|---|
| `Target Draconian (HP 8, shot) (long range)` | 42 |
| `Target Draconian (HP 8, shot) (point blank)` | 43 |
| `Target Draconian (HP 8, melee) (Backstab!)` (M48, already shipped) | 42 |
| `Sturm backstabs Draconian (from behind) for 5!` (pre-existing post-hoc log line) | 46 |

This round's longest new string (43 chars) is **shorter than or equal to** M48's own already-shipped
banner tag (42) and well inside the 46-character tolerance the message region already accepts today from
the pre-existing post-hoc backstab log line. Not a new risk class — the same "within existing tolerance
band" conclusion M48 reached, with an even smaller worst case.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **Spell-save preview** — does a caster get any pre-hoc hint that a target will likely resist/succumb before confirming a cast? | Investigated in full. `combat.ts`'s `Phase` type (`combat.ts:118`) has no manual spell-targeting phase at all (`'party-menu' \| 'party-move' \| 'party-target' \| 'treasure' \| 'over'`) — `partyCast()` (`combat.ts:846-878`) **auto-targets** ("Cast the current actor's next available prepared spell... Auto-targets: an offensive spell at the nearest in-range foe, a heal at the most-wounded ally, a self spell at the caster"). There is no player target-cycling step to attach a pre-hoc hint to; adding one would mean a new UI phase/mode, which is a layout/new-interaction change, explicitly out of scope for this round's "no new UI panels/routes" bar. |
| **Morale-break preview** — could a player see in advance that their next hit will break a foe's morale? | Investigated in full (`tactical.ts`'s morale machinery, `moraleBreakOf`/`applyMoraleOutcome`, lines 899-932). Morale is checked *after* a blow lands or a foe falls (`teamHealthLossPercent`/`personallyBroken` depend on post-hit HP), not from any pre-attack state a player could inspect before rolling. Unlike range/backstab/flank (pure position/geometry, fully known before the roll), a morale-break preview would require the UI to simulate a hypothetical hit's damage before the player commits — a materially different (and speculative) kind of preview, not a simple "read an existing predicate" fix. No natural single-field wiring exists. |
| **`aiAction()`'s own rear/backstab narration** (flagged by M48 as an explicit open item) | Re-confirmed still out of scope — `aiAction()` drives the AI's own auto-resolve turns, which have no player decision point to preview *for*; M48's own reasoning (`highlightTarget()` is the one PLAYER-facing pre-attack decision point) applies identically here and was not re-litigated further. |
| **`canBackstab`/`isBehind`/`rangeTag`'s existing melee wiring** (M48) | Not re-investigated — already shipped and confirmed working via M48's own e2e assertion; this round only adds a new, previously-unread third predicate (`missileBracket`) to the same function. |
| **`referenceDb.ts`, `saveStore.ts`, `library.ts`/`gameview.ts`** | Not investigated this round, per standing brief guidance (5th/1st/1st rounds resp. on those files already). |
| **`DetectionMatch.series`/`.ruleset`/`.engineGen`, `saveStore.ts`'s `listSlots()`** | Not re-investigated — no new angle developed; both confirmed unchanged as of M48's own re-check and nothing in this round touched their gating conditions (roster playability, multi-slot UI). |
| **Item-instance subsystem, `PartyMemberStatus.age`, `MapCell.ceiling`/`.flags`, `MonsterRecord.conSaveBonus`/`.itemPluses`/`.carriedItems`/`.preparedSpellIds`, dialogue.ts/town.ts `day`-wiring, DoK `baseTypeId` alias question, `TacticalSpell.inflict`, DoK Companion-Panel e2e positive controls, `referenceDb.ts`'s Class-label collision** (all standing) | Not re-investigated, per standing instructions — no new angle developed on any of these this round. |

## Open questions / unknowns

- **`missileBracket()`'s plain-chebyshev vs. `resolveHit()`'s footprint-aware distance measurement is a
  pre-existing, genuine engine inconsistency**, newly surfaced by this round's own verification (test 7).
  It affects Large (2×2) monsters near a bracket boundary and is independent of whether the UI wiring fix
  above lands — but wiring `missileBracket()` into a player-visible preview for the first time makes an
  occasional wrong preview player-visible for the first time too (previously it only affected an
  internal/seam-only value nobody looked at during play). A one-line fix
  (`chebyshev(a.pos, t.pos)` → `figureDistance(a, t)`, same closure) would close it; flagged for the lead
  to decide whether to fold into the same patch or track separately.
- **Should the missile pre-hoc tag also appear for a thrown weapon**, which this codebase's own comments
  say uses "the same banding off their `range`" (`tactical.ts:1126`)? `missileWeapon(a)` (used internally
  by `missileBracket`'s implementation) presumably already covers `kind: 'missile'` weapons generically —
  UNCONFIRMED whether thrown daggers/axes are modeled with `kind: 'missile'` or a separate kind in this
  engine; not verified this round (out of scope for the minimal fix, which reuses `missileBracket()`
  exactly as computed regardless of weapon sub-kind).
- **Wording**: this round reuses `rangeTag()`'s exact existing strings (`(point blank)`/`(long range)`),
  the same "reuse the shipped precedent verbatim" choice M48 made for its own tag — no new wording
  question raised.
- **M48's own standing open questions remain unchanged and not re-investigated**: `DetectionMatch.series`/
  `.ruleset`/`.engineGen` (still gated on broader-roster playability), `saveStore.ts`'s `listSlots()`
  (still gated on a multi-slot UI), and the backstab/flank tag's own clipping-tolerance question (still
  open, unaffected by this round).

## Implications for our engine

- **The "pre-hoc vs. post-hoc" angle M48 introduced generalises further than one predicate** — this round
  found it applies a second time, in the *same function*, for the *sibling* attack-type branch
  (`melee` vs. `!melee`) that M48's own gating logic had already split the code path on. Worth explicitly
  checking, in any future round that touches a function with an `if (missile) ... else ...`-shaped split,
  whether BOTH branches got their pre-hoc treatment or just one.
- **A CT-numbered milestone can sit fully shipped, tested, and seam-exposed for many rounds (11 days /
  5 milestones, CT.7c → M48) before an audit round notices its own doc comment describes a UI behaviour
  that was never wired** — this is now the second time (after M48's own `canBackstab`/`isBehind`) this
  exact shape has been found in `combat/tactical.ts` specifically; the file is worth one more scan for a
  fourth "drives a UI hint"-labelled predicate before assuming it's exhausted (a light grep this round
  found no fourth remaining hit, but a future round with fresh eyes may want to re-check as the file
  continues to grow).
- **Verifying a finding independently (rather than trusting the shipped implementation) can surface a
  genuinely new, separate bug-shaped fact** — this round's test 7 (the `missileBracket()` footprint
  discrepancy) was not something either the brief or prior audits mentioned; it emerged purely from
  writing an independent throwaway test per this loop's own verification discipline. Continuing to
  actually *run* verification code (not just read source) rather than taking a doc comment's correctness
  for granted remains valuable even for already-shipped, already-tested engine code.
- **The strongest possible grounding for a "should this reach the player" claim is a byte-located string
  in the original game's own binary**, not just a doc-comment claiming a UI purpose. This round's fact
  clears that bar (CoK's own `GAME.OVR` printed `Range = N` to the player, byte-located `@0x17d5a`/
  `@0x1810e`) — a strictly stronger form of evidence than M48's doc-comment-only justification, worth
  treating as the gold-standard tier when future rounds have to choose between several candidates.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m49_range_hint.test.ts` (7 tests: `missileBracket()` varies correctly
  with distance via the engine's own `createTacticalCombat`; returns `null` for a figure with no missile
  weapon; a source-text proof `tactical.ts` doc-comments it as UI-hint-driving; a source-text proof
  `combat.ts` already exposes it on the e2e seam; a source-text proof `highlightTarget()`'s function body
  never calls it (while confirming the slice is the correct, post-M48 function); a source-text proof
  `rangeTag()` is the shipped post-hoc precedent used only in `logEvents`; and an independently-derived
  proof that `missileBracket()`'s plain-chebyshev distance can disagree with `resolveHit()`'s
  footprint-aware distance for a Large target, confirming a genuine pre-existing engine caveat) — run via
  `npx vitest run` (7/7 passed), then deleted. Confirmed via `git status --porcelain` (clean except this
  doc) after deletion.
