# M50 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M44–M49 in full, and
> `docs/engine/research/m49-audit.md` in full (its Rejected-alternatives / Open-questions sections in
> particular, per the brief). Per this round's brief, a **fresh, thorough grep of `combat/tactical.ts`'s
> full `TacticalCombat` interface** was done first (not trusting M49's own "light grep found no fourth
> remaining hit" note) — and it turned up a **third** "drives a UI hint"-labelled predicate M48/M49 did not
> find: `slaysHelpless()`. It gates a genuine, deterministic **instant-kill** mechanic (the CT.7j coup de
> grace) that is considerably higher-stakes than the two prior finds (a to-hit/damage modifier vs. an
> outright kill), sits fully shipped/tested/seam-exposed since 2026-06-23 (the same day as `canBackstab`/
> `isBehind`), and has the exact same "wired to the seam and to the post-hoc combat log, never wired to the
> pre-hoc targeting banner" shape as M48 and M49's finds.
>
> The flagged bug-fix (#9, `missileBracket()`'s `chebyshev` vs. `figureDistance` mismatch) was re-confirmed
> still real and unfixed (`tactical.ts:1891`, unchanged since M49) but **not picked up this round** — see
> "Rejected alternatives" for the reasoning. The thrown-weapon question (#10) was resolved this round: **yes**,
> a thrown weapon already gets the same range-band treatment as a `'missile'`-kind weapon.
>
> Every real-mechanic claim below was independently re-derived this round via a throwaway `vitest` script
> (`packages/engine/test/_scratch_m50_verify.test.ts`, created, run, **8/8 green**, then deleted — listed at
> the end). `git status --porcelain` is clean except this doc.
>
> **Headline pick: `TacticalCombat.slaysHelpless()` — doc-commented as existing to drive a UI hint, exposed
> on the same e2e seam as `canBackstab`/`isBehind`/`missileBracket` since the same day (2026-06-23, CT.7j),
> and already gating a real, unconditional instant-kill (the "coup de grace") the moment a melee swing lands
> on a helpless (asleep/held) foe — is never read by `highlightTarget()`, the exact pre-attack targeting
> banner M48 and M49 both already extended twice for the sibling melee/missile facts. A player who cycles
> onto a sleeping or held monster gets zero warning that confirming a melee attack will kill it outright,
> even though the moment they do, `resolveHit()` bypasses the entire to-hit roll and even the `hp+10`
> overkill check to finish it — the highest-stakes fact in this whole family of pre-hoc/post-hoc gaps, and
> the one CT-milestone predicate of the three that is PROVEN (not 1e-inferred) straight from byte-located
> strings in the original games' own binaries.**

## Headline finding

`combat/tactical.ts`'s `TacticalCombat` interface doc-comments `slaysHelpless()` in the same UI-hint
language as `canBackstab`/`isBehind`/`missileBracket`, but M49's own "light grep" evidently didn't match it
— it doesn't begin with "Drives the ... UI hint" the way `missileBracket`'s comment does; it says "drives
the UI hint" in the middle of a longer sentence:

```ts
// packages/engine/src/combat/tactical.ts:665-670
/**
 * True when this ruleset's **coup de grace** is active — a melee blow on a helpless (asleep/held) foe
 * slays it outright ("slays helpless … with one cruel blow", byte-located gen1; CT.7j). Gen1 → true,
 * gen2 (DQK, unverified) → false. A pure ruleset predicate (drives the UI hint / e2e seam).
 */
slaysHelpless(): boolean;
```

Implementation (unmodified, same closure as the other three predicates):

```ts
// packages/engine/src/combat/tactical.ts:1896
slaysHelpless: () => ruleset !== 'gen2',
```

It is real, ruleset-gated, and already the deciding factor in the engine's own attack resolver — not a
display-only flag. `resolveHit()`'s coup-de-grace gate is unconditional once its three preconditions hold:

```ts
// packages/engine/src/combat/tactical.ts:1134-1156 (resolveHit, current state, abridged)
// CT.5a — a helpless target (asleep/held) is hit automatically (AD&D-1e: a sleeping/held opponent
// can be struck without a roll); nat-1 still whiffs only against a defending foe, not a helpless one.
const helpless = target.flags.has('asleep') || target.flags.has('held');
const hit = helpless ? true : roll === 20 ? true : roll === 1 ? false : roll >= needed;
// CT.7j — COUP DE GRACE. A *melee* strike on a helpless foe doesn't just auto-hit (CT.5a) — it
// finishes the target outright ("slays helpless … with one cruel blow", byte-located CoK GAME.OVR
// @0x14fee/0x15019, DoK START.EXE @0x1eeff). ...
const coupDeGrace = hit && !missile && helpless && ruleset !== 'gen2';
if (!hit) { /* ... */ }
else if (coupDeGrace) {
  // Slay outright, bypassing the hp+10 overkill check — a helpless foe gets no reprieve. ...
  if (target.flags.has('asleep')) clearStatus(target, 'asleep');
  const dmg = Math.max(1, target.hp);
  target.hp = 0;
  target.flags.add('dead');
  ...
}
```

In other words: **any** melee attacker (party or monster), **any** weapon, **any** to-hit roll, against
**any** target flagged `asleep` or `held`, under any ruleset except `gen2` (DQK, unverified) — the target
dies, full stop. There is no dice roll to get unlucky on; the "hit" is auto-granted (CT.5a) and the "slay"
is unconditional (CT.7j). This is the single most decisive fact a player's targeting decision can hinge on
in this engine, and it is completely invisible before the player commits.

## An even stronger grounding than M48's or M49's own headline had

M48's `canBackstab`/`isBehind` numbers (the +4/+2 magnitudes) are 1e-inferred; M49's missile-bracket
magnitudes (+1/0/−2) are also 1e-inferred, grounded only by a *readout* (`Range = N`) existing in the
original binary. This round's fact goes one step further: **the feature itself — not just its magnitude —
is byte-proven in TWO of the three original games' own binaries**, per the CT.7j changelog entry
(`docs/engine/BUILD-QUEUE.md:346-355`):

> RE: §24 — `slays helpless` `@0x14fee` + `with one cruel blow` `@0x15019` byte-LOCATED in CoK `GAME.OVR`
> (DoK shares `one cruel blow` `@0x1eeff`), verified myself; feature + helpless-precondition PROVEN,
> instant-kill 1e-inferred + labelled.

So: the *existence* of a coup-de-grace mechanic, and its *precondition* (helpless target, melee attack), are
proven facts, not inference — only the exact bookkeeping (bypass `hp+10`, zero HP, permadeath flag) is the
1e-standard/labelled part. This is a strictly stronger evidentiary tier than either M48's or M49's own
headline, and the highest-consequence one of the three (a to-hit modifier vs. an outright kill).

## Confirmed: `melee` in `highlightTarget()` always predicts the real attack type correctly

A possible objection: could a player's confirmed attack turn out to be a `missile` shot even though
`highlightTarget()`'s `melee` flag said `true`, making a coup-de-grace tag wrong? No — `partyAttack()`
(the only path `confirmTarget()` reaches) resolves the same way `highlightTarget()` classifies the target,
and **prefers melee whenever available**:

```ts
// apps/web/src/ui/combat.ts:775-786 (partyAttack, current state, unmodified)
function partyAttack(id: string): void {
  ...
  const inMelee = c.meleeTargets().some((t) => t.id === id);
  const inMissile = c.missileTargets().some((t) => t.id === id);
  if (!inMelee && !inMissile) return;
  const action: TacticalAction = { type: inMelee ? 'melee' : 'missile', targetId: id };
  ...
}
```

`highlightTarget()`'s own `melee` boolean is computed the identical way (`meleeTargets().some(...)`), so
whenever the banner would say "melee", confirming the attack is *guaranteed* to fire a `'melee'` action —
never a `'missile'` one. A pre-hoc coup-de-grace tag gated on `melee` therefore can never be wrong about
which resolver branch will run.

## `highlightTarget()` — the exact same function M48 and M49 already extended twice

```ts
// apps/web/src/ui/combat.ts:926-945 (highlightTarget, current state, POST-M49)
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
  // M49.S1 — missileBracket() already gates the real +1/0/-2 to-hit modifier in resolveHit() for a
  // "shot" target; rangeTag() already narrates it post-hoc once a shot resolves (combat.ts:592) — this
  // reuses rangeTag() verbatim for the pre-hoc banner. `!melee` mirrors resolveHit's own `missile` gate.
  const tag = backstab ? ' (Backstab!)' : flank ? ' (flank)'
    : !melee ? rangeTag(state.combat.missileBracket(id) ?? undefined) : '';
  state.banner = `Target ${nameOf(id)} (HP ${Math.max(0, foe?.hp ?? 0)}, ${melee ? 'melee' : 'shot'})${tag}`;
  draw();
}
```

`foe` (a `TacticalCombatant`, already dereferenced two lines above) already carries `.flags: Set<TacticalStatusFlag>`
— the same field `resolveHit()` itself reads (`target.flags.has('asleep') || target.flags.has('held')`,
`tactical.ts:1136`) and the same field `combat.ts` already reads elsewhere in this very file
(`c.flags.has('fled')` at `combat.ts:477`, and the `flagsOf()` e2e seam at `combat.ts:1239`). Nothing new
needs to be exposed: `state.combat.slaysHelpless()` is already on the seam
(`combat.ts:1191: slaysHelpless: () => state?.combat.slaysHelpless() ?? false, // CT.7j — coup-de-grace active (gen1)`),
and `foe.flags` is already in scope inside `highlightTarget()` itself. Yet the function never reads either
one — a helpless target is shown with exactly the same banner as any other melee target
(`Target Draconian (HP 8, melee)`), no matter how certain its death is.

## Why this fits the loop's established shape

1. **Same doc-comment signal M48/M49 used** ("drives the UI hint"), on a *third* `TacticalCombat` predicate
   that has the identical unwired-pre-hoc-hint shape — confirming the brief's own suspicion that M49's
   "light grep" wasn't exhaustive.
2. **A real, already-shipped mechanical consumer independent of any UI** — `resolveHit()`'s `coupDeGrace`
   branch (`tactical.ts:1143-1156`) fires regardless of whether a player is ever shown a hint; 8 engine
   tests already cover it in isolation (`tactical.test.ts:1350-1420`).
3. **Zero engine-package change needed** — `slaysHelpless()` is already typed, exported, engine-tested, and
   seam-exposed; `foe.flags` is already the type `highlightTarget()` already dereferences.
4. **Already reachable at the JS/e2e layer** (`combat.ts:1191`, shipped since CT.7j, 2026-06-23 — the same
   day as `canBackstab`/`isBehind`) — mirrors M48's/M49's "already at the seam, just not painted" framing
   exactly, and the existing `coupWiredOk` e2e check (`e2e.mjs:1182-1187`) already proves the seam value
   itself is correct — it just never reaches `highlightTarget()`.
5. **Stronger grounding than either prior round** — see above; the feature's existence is byte-proven in
   two binaries, not inferred from a UI readout or 1e convention alone.
6. **Higher stakes than either prior round** — an outright kill vs. a to-hit/damage modifier — which if
   anything makes the case for wiring it *stronger*, not weaker, than M48's/M49's own justifications.

## Real-bytes / real-mechanic verification (this round)

Reproduced independently via `packages/engine/test/_scratch_m50_verify.test.ts` (created, run, **8/8
passed**, then deleted):

1. **`tactical.ts` doc-comments `slaysHelpless()` as UI-hint-driving** — source-text match: the text
   immediately preceding `slaysHelpless(): boolean;` contains both `coup de grace` and `drives the UI hint`.
2. **`slaysHelpless()` is real and ruleset-gated** — `true` for the default (`gen1`) ruleset, `false` for
   `{ ruleset: 'gen2' }`, using the engine's own `createTacticalCombat`.
3. **A helpless (asleep) foe in reach IS a legal, selectable melee target** — `meleeTargets()` includes it;
   `e.flags.has('asleep')` is readable on the exact same object type the UI already holds.
4. **A melee swing on a helpless foe is a guaranteed instant kill regardless of the die roll** — an attacker
   with `thac0: 99` (an to-hit "needed" value that would ordinarily be unhittable) still lands a `hit: true`,
   `coupDeGrace: true` attack that leaves the 99-HP target `dead`, across 7 different RNG seeds (ruling out
   a lucky-roll coincidence — the roll is never consulted at all for a helpless target).
5. **`highlightTarget()`'s body never reads `slaysHelpless()` or checks `asleep`/`held`** — sliced the
   function's exact current (post-M49) source text, confirmed the slice is right by asserting it already
   contains `Backstab!`/`flank`/`missileBracket`, then asserted it contains neither `slaysHelpless` nor
   `asleep` nor `held`.
6. **`combat.ts` already exposes `slaysHelpless()` on the e2e seam** — source-text match for
   `slaysHelpless: () => state?.combat.slaysHelpless() ?? false`.
7. **The only existing player-visible mention of the coup-de-grace fact anywhere is POST-hoc** — the combat
   log's `slays the helpless ... with one cruel blow!` line (`combat.ts:588`) exists, but is not present
   anywhere inside `highlightTarget()`'s body.
8. **`.flags` is an already-established, precedented read on `state.combatants` in `combat.ts`** — confirmed
   both `c.flags.has('fled')` (line 477) and the `flagsOf()` seam getter (line 1239) already dereference the
   identical field this fix needs; nothing novel about the access pattern.

## Wiring plan

**One file touched for the fix (`apps/web/src/ui/combat.ts`) — no engine-package change — plus a small
extension of the existing `combat` e2e case's `targetHintOk` coherence block. Mirrors M48's/M49's wiring
plan exactly: one more conditional branch in the same `tag` expression, given top priority since a
guaranteed kill dominates a mere to-hit/damage modifier.**

1. **`apps/web/src/ui/combat.ts:926-945`** (`highlightTarget`) — insert a `helpless`/`coupDeGrace` check
   ahead of the existing `backstab`/`flank` branches, and give it priority in the `tag` ternary (a target
   about to die outright shouldn't also be labelled merely "(Backstab!)", which implies just a damage
   multiplier):

   ```ts
   // before (current, post-M49):
   const melee = state.combat.meleeTargets().some((t) => t.id === id);
   const backstab = melee && state.combat.canBackstab(id);
   const flank = melee && !backstab && state.combat.isBehind(id);
   const tag = backstab ? ' (Backstab!)' : flank ? ' (flank)'
     : !melee ? rangeTag(state.combat.missileBracket(id) ?? undefined) : '';
   state.banner = `Target ${nameOf(id)} (HP ${Math.max(0, foe?.hp ?? 0)}, ${melee ? 'melee' : 'shot'})${tag}`;

   // after (M50.S1):
   const melee = state.combat.meleeTargets().some((t) => t.id === id);
   // M50.S1 — a helpless (asleep/held) foe is an unconditional instant-kill "coup de grace" in melee under
   // this ruleset (slaysHelpless(), CT.7j) — resolveHit() applies it regardless of to-hit roll, so this
   // takes priority over backstab/flank (those are only to-hit/damage modifiers, not a guaranteed kill).
   const helpless = !!foe && (foe.flags.has('asleep') || foe.flags.has('held'));
   const coupDeGrace = melee && helpless && state.combat.slaysHelpless();
   const backstab = melee && !coupDeGrace && state.combat.canBackstab(id);
   const flank = melee && !coupDeGrace && !backstab && state.combat.isBehind(id);
   const tag = coupDeGrace ? ' (Coup de Grace!)' : backstab ? ' (Backstab!)' : flank ? ' (flank)'
     : !melee ? rangeTag(state.combat.missileBracket(id) ?? undefined) : '';
   state.banner = `Target ${nameOf(id)} (HP ${Math.max(0, foe?.hp ?? 0)}, ${melee ? 'melee' : 'shot'})${tag}`;
   ```

   Example real output change: cycling to a sleeping monster in melee reach currently reads
   `Target Skeleton (HP 12, melee)` (or, if a thief happens to be behind it, the misleading
   `... (Backstab!)`, implying only a damage multiplier); after the fix it reads
   `Target Skeleton (HP 12, melee) (Coup de Grace!)` regardless of facing/class, correctly signalling the
   attack is a guaranteed kill. A held/asleep target that is NOT gen1 (`slaysHelpless()` false, i.e. DQK)
   is unaffected — the new branch is gated behind the real ruleset predicate, matching `resolveHit()`'s own
   gate exactly. A non-helpless target is completely unaffected either way.

2. **No new seam getters needed** — `slaysHelpless()` is already on the seam (`combat.ts:1191`, shipped
   since CT.7j); `foe.flags` is already dereferenced two lines earlier in the same function.

3. **Tests** (extend the existing `combat` e2e case's `targetHintOk` block only — no new test file, no new
   case). In `apps/web/test/e2e.mjs`, at the block M48/M49 already built (`e2e.mjs:1049-1072`), add one more
   coherence check using the already-shipped `flagsOf()` and `slaysHelpless()` seam getters:

   ```js
   // M50.S1 — a helpless (asleep/held) melee target's banner now flags the real slaysHelpless()
   // instant-kill (coup de grace) with top priority over backstab/flank, matching resolveHit()'s own
   // unconditional coupDeGrace gate. Real encounters rarely start with a helpless combatant, so this is
   // usually a vacuous (both-false) check — the same caveat M48/M49 already accepted for their own checks.
   const tgtFlags = await page.evaluate(`window.__combat.flagsOf(${JSON.stringify(tgtId)})`);
   const isHelpless = Array.isArray(tgtFlags) && (tgtFlags.includes('asleep') || tgtFlags.includes('held'));
   const slays = await page.evaluate('window.__combat.slaysHelpless()');
   const isMeleeTgt = banner0.includes(', melee)');
   const hasCoupTag = banner0.includes('(Coup de Grace!)');
   const coupOk = hasCoupTag === (isMeleeTgt && isHelpless && slays);
   targetHintOk = hasBase && meleeOk && shotOk && coupOk;
   ```

Rough size: ~4 LOC changed/added in `combat.ts` (one new local + widened ternary) + ~6 LOC added to the
existing `combat` e2e case's existing `targetHintOk` block. No engine-package file touched, no new test
file, no new e2e case, no new seam getter, no new route, no new UI panel.

## Layout / feasibility check

Same fixed-width EGA framebuffer message region M48/M49 already reasoned about — rows 17–22,
`TEXT_MAX_ROWS = 6`, `packages/engine/src/render/combatScreen.ts:65-67,317-321` — no new risk class.
Worked examples, character-counted:

| String | Length |
|---|---|
| `Target Draconian (HP 8, melee) (Coup de Grace!)` | 47 |
| `Target Draconian (HP 8, melee) (Backstab!)` (M48, already shipped) | 42 |
| `Sturm backstabs Draconian (from behind) for 5!` (pre-existing post-hoc log line, M48's own cited tolerance ceiling) | 46 |
| `Tanis slays the helpless Draconian with one cruel blow!` (the SAME coup-de-grace fact's own pre-existing post-hoc log line, already shipping since CT.7j) | 57 |

This round's new string (47 chars) is 1 char longer than M49's own accepted ceiling (46), but the
**identical fact, in the identical message-log region, already ships today at 57 characters** via the
CT.7j post-hoc log line — a strictly stronger precedent than M49 had (M49 cited a *different* fact's log
line as its tolerance ceiling; this round's log line is literally the same fact this fix previews). Not a
new risk class.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **#9 — `missileBracket()`'s `chebyshev` vs. `figureDistance` engine bug** (flagged by M49, re-examined per this round's brief) | Re-confirmed still real and unfixed: `tactical.ts:1891` still reads `missileRangeBracket(chebyshev(a.pos, t.pos), w.range ?? 0)` while `resolveHit()` (`tactical.ts:1130`) still measures with `figureDistance(actor, target)`. Given a fair, skeptical look: this is a genuine one-line **correctness fix to an already-wired value**, not a "computed but unwired" UI gap — a different shape than every prior round's finding (M35–M49), and the loop's own mission (per its established pattern, restated in this round's brief) is to find unwired-but-implemented fields, not to patch pre-existing engine bugs. It is also outside this agent's read-only research remit (`CLAUDE.md`/task instructions: "Do not modify engine/source code"). Left flagged, unpicked, exactly as M49 left it — a lead-session engine-package change, not a wiring-doc fix. |
| **#10 — does a thrown weapon get the M49 range tag?** (flagged UNCONFIRMED by M49, re-examined per this round's brief) | **Resolved this round: YES.** `WeaponKind = 'melee' \| 'missile' \| 'thrown'` (`tactical.ts:85`), and `missileWeapon()` — the helper `missileBracket()`'s implementation calls internally — matches `w.kind === 'missile' \|\| w.kind === 'thrown'` (`tactical.ts:1055-1056`). A thrown dagger/axe is therefore already covered by the exact same `missileBracket()`/`rangeTag()` pre-hoc and post-hoc treatment M49 wired for `'missile'`-kind weapons — no further fix needed; this closes M49's own open question. |
| **A fourth candidate beyond `slaysHelpless()`** — re-grepped the full `TacticalCombat` interface (`tactical.ts:621-693`) doc-comment by doc-comment | `isGuarding`, `canDelay`, `sizeOf`, `conditionOf`, `partyCanEscape`, `attemptPartyFlee`, `aiAction`, `hazardAt` were all read in full. None carry "drives a UI hint"-shaped language pointing at an unwired pre-attack preview: `isGuarding`/`canDelay` already have live UI affordances (guard/delay actions in the menu, not a hint format); `sizeOf` already drives multi-cell sprite rendering (CT.7f, wired); `conditionOf` already drives roster carry-over (CT.7h, wired); `partyCanEscape`/`attemptPartyFlee` already drive the flee menu option directly (not a hint); `hazardAt` already renders hazard zones on the grid (CT.7b, wired); `aiAction` re-confirmed out of scope per M48's own reasoning (no player decision point). `slaysHelpless()` is the only remaining hit. |
| **Broader "pre-hoc vs. post-hoc" sweep for other `if (missile) ... else ...`-shaped branches** (per this round's brief) | Checked `resolveHit()` itself (the only function with that exact shape) and `partyAttack()`/`seamAttack()` (`inMelee ? 'melee' : 'missile'`). No second unwired branch found beyond the coup-de-grace case above — `partyAttack()`'s branch is a pure action-type selector with no UI-hint doc-comment attached, and both its outcomes are already covered by `highlightTarget()`'s `melee ? 'melee' : 'shot'` label. |
| **`referenceDb.ts`, `saveStore.ts`, `library.ts`/`gameview.ts`** | Not investigated this round, per standing brief guidance (5th/1st/1st rounds resp. on those files already; no new angle developed). |
| **Spell-save preview, morale-break preview** (M49 rejected in full) | Not re-investigated — no new angle developed; M49's reasoning (no manual spell-targeting phase exists; morale is checked only post-hit) is unchanged. |
| **Item-instance subsystem, `PartyMemberStatus.age`, `MapCell.ceiling`/`.flags`, `MonsterRecord.conSaveBonus`/`.itemPluses`/`.carriedItems`/`.preparedSpellIds`, dialogue.ts/town.ts `day`-wiring, `TacticalSpell.inflict`, DoK Companion-Panel e2e positive controls, `referenceDb.ts`'s Class-label collision, `DetectionMatch.series`/`.ruleset`/`.engineGen`, `saveStore.ts`'s `listSlots()`** (all standing) | Not re-investigated, per standing instructions — no new angle developed on any of these this round. |

## Open questions / unknowns

- **Should the coup-de-grace tag also fire for the AI's own turns (`aiAction()`)?** Re-confirmed out of
  scope for the same reason M48 gave: `aiAction()` drives auto-resolve turns with no player decision point
  to preview *for* — the player only ever confirms their own party's attacks through `highlightTarget()`.
- **Wording**: `(Coup de Grace!)` was chosen to match the existing exclamation-mark convention
  (`(Backstab!)`) and the engine's own internal naming (`coupDeGrace`, `CT.7j` comments all say "coup de
  grace"). An alternative could echo the post-hoc log's own phrasing more closely (e.g. `(Cruel Blow!)`) —
  left as a naming choice for the lead, not a blocking question; either string is well within the
  established length tolerance (see Layout section).
- **Interaction with `flank`**: a helpless target could, in principle, also satisfy `isBehind()` (facing is
  tracked independently of the `asleep`/`held` flags) — the wiring plan above gates `flank`/`backstab`
  behind `!coupDeGrace` specifically so a doomed target is never mislabelled with a weaker-sounding tag
  instead of (or alongside) the correct one. This mirrors M48's own `flank`-behind-`!backstab` gating
  exactly, one level deeper.
- **M48's/M49's own standing open questions remain unchanged and not re-investigated**: the
  `missileBracket()`/`figureDistance` engine bug (re-confirmed above, still flagged, still unpicked),
  `DetectionMatch.series`/`.ruleset`/`.engineGen` (still gated on broader-roster playability), and
  `saveStore.ts`'s `listSlots()` (still gated on a multi-slot UI).

## Implications for our engine

- **The "pre-hoc vs. post-hoc" angle now generalises a THIRD time in the exact same function** — after
  M48's `canBackstab`/`isBehind` and M49's `missileBracket`, this round found `slaysHelpless()` sitting in
  the identical spot, discoverable only by re-reading the full interface rather than trusting a prior
  round's grep. Doc-comment phrasing varies enough ("Drives the ... UI hint" vs. "drives the UI hint /
  e2e seam" vs. no exact phrase at all) that a keyword-only grep can legitimately miss a hit — a
  **semantic** re-read of the whole interface, not just a string grep, was what surfaced this round's find.
  Future rounds touching this file should keep doing a full doc-comment read, not a keyword search alone.
- **Stakes, not just presence, matter when ranking candidates**: this round's fact (an unconditional
  instant kill) is mechanically far more consequential to a player's decision than either prior round's
  to-hit/damage modifiers, even though it follows the identical wiring shape — worth treating "how much
  does this change the player's decision" as a tiebreaker/priority signal in future rounds when multiple
  unwired-hint candidates exist simultaneously in the same function.
- **The strongest possible grounding tier is a byte-proven *feature*, not just a byte-proven *readout* or a
  1e-convention magnitude** — CT.7j's `slays helpless`/`with one cruel blow` strings prove the mechanic
  itself exists in the original binaries (CoK and DoK both), one tier above M49's `Range = N` readout
  (which proves only that distance was computed, not how it maps to a modifier) and two tiers above a bare
  1e-standard inference. Worth keeping this three-tier distinction (proven feature > proven readout >
  1e-inferred magnitude) explicit when future rounds document how "real" a candidate's grounding is.
- **A function can absorb several rounds' worth of independent hint-wiring fixes without becoming a new
  "heavily-mined" file in the disqualifying sense** — `highlightTarget()` has now been extended three times
  (M48, M49, this round) for three genuinely different underlying facts, each with its own doc-comment
  provenance and its own engine-side consumer. The loop's "avoid re-litigating the same finding" guidance
  should be read as per-fact, not per-function.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m50_verify.test.ts` (8 tests: `tactical.ts` doc-comments `slaysHelpless()`
  as UI-hint-driving; `slaysHelpless()` is real and ruleset-gated (gen1 true / gen2 false); a helpless foe
  in reach is a legal `meleeTargets()` selection; a melee swing on a helpless foe is a guaranteed instant
  kill across 7 RNG seeds regardless of an unhittable `thac0`; a source-text proof `highlightTarget()`'s
  current (post-M49) body never reads `slaysHelpless`/`asleep`/`held`; a source-text proof `combat.ts`
  already exposes `slaysHelpless()` on the e2e seam; a source-text proof the only existing player-visible
  mention of the fact is the post-hoc log line, never inside `highlightTarget()`; a source-text proof
  `.flags` reads on `TacticalCombatant` are an already-established pattern in `combat.ts`) — run via
  `npx vitest run` (8/8 passed), then deleted. Confirmed via `git status --porcelain` (clean except this
  doc) after deletion.
