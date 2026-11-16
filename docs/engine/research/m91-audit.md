# M91 audit — a memorized Cure spell can never target or heal an unconscious (not dead) party member

> Audit method: read `docs/engine/research/m90-audit.md` and `m89-audit.md` in full first (mandatory
> first step), then re-checked the M90 brief's carried-forward backlog in priority order, per the
> brief's own instruction to prioritize the Cure-spell targeting gap if still live.
>
> 1. **The Cure ('heal'-kind) spell targeting gap** — brief's top candidate, explicitly flagged by
>    M90's own closing note as "the next already-flagged instance." **Confirmed still live**,
>    byte-for-byte identical to how M89 and M90 both described it (`apps/web/src/ui/party.ts`'s
>    `mostWoundedName()` and `healMember()`, both still gating on raw `hp <= 0` instead of
>    `deadStore.has(name)`). This round's finding and fix target exactly this gap — see below.
> 2. **`grep -n "hp <= 0\|hp > 0" apps/web/src/ui/party.ts` (and sibling UI files) re-run this round**
>    (M90's own instruction) — confirmed **M89's and M90's fixes have both already shipped**
>    (`49d4f73` "feat(M89.S1)…", `2677023` "feat(M90.S1)…", both dated 2026-07-05, i.e. since M90's
>    audit was written): `apps/web/src/ui/town.ts:129/131` now reads `!m.dead`/`m.dead` (not
>    `.down`), `apps/web/src/ui/explore.ts:727` now reads `!s.dead` (not `!s.dead && s.hp > 0`), and
>    `party.ts`'s `restPartyTicks`/`templeHealAll`/`templeRaiseFirstDead` all now thread
>    `deadStore.has(name)`. The **only** remaining untouched call sites in this family are the two
>    this round targets (`mostWoundedName`, `healMember`) — confirmed by exhaustive grep, see
>    "Reachability" below. `awardPartyXp`'s `inCombat: s.hp > 0` (party.ts:963) and `explore.ts`'s
>    HUD "DEAD" label (`m.down ? 'DEAD' : …`, lines 560/566/793) also match `hp <= 0`/`.down`, but
>    both are a **different mechanic** (XP-split eligibility; a display label), not a healing-
>    eligibility gate — see "Secondary observations."
> 3. **`restPartyNatural()`/`planRest()` deletion question** — unchanged from M89/M90 (still zero
>    callers). Not touched; still a cleanup-only question.
> 4. **Long tail** (multiclass HP averaging, `neacailRejected`, DQK/DoK destination-race,
>    `multiclassLevel`, `canReachWithHeight`, `DexterityMods.reaction`, `sky.ts`/`dqkExplore.ts`) —
>    not re-litigated; M89's investigation of each was thorough and nothing has changed in the two
>    days since (confirmed via the same file/grep checks M89 already ran, no new angle available).

## Headline finding

**`mostWoundedName()` and `healMember()` — the two functions `doCast()` calls for every `kind:
'heal'` spell (e.g. Cure Light Wounds) cast from the real, shipped Encamp → Magic → Cast screen —
still gate on raw `hp <= 0` instead of the `deadStore` permadeath set, so a party member merely
knocked unconscious (not dead) can never be selected as a Cure spell's target, nor healed even if
somehow named directly.** This is the *third* independently-discovered instance of the exact CT.7h
dead-vs-unconscious conflation this loop has now found in `party.ts` (M89: Rest; M90: Temple; this
round: Cure spells) — and, unlike M89/M90, it is not a fix that regressed or half-landed: **these two
functions have never been touched since the day they were created, one day *before* CT.7h even
introduced the `dead`/`deadStore` concept.**

## Existing sibling/precedent and the self-flagging evidence

M89 established the shape ("a correct policy exists but the live function never adopted it") for
Rest; M90 found the sharper sub-case ("a function received half of a same-commit fix") for the
Temple. This round's finding is the plainest version of the family: `mostWoundedName()`/
`healMember()` were **never in the same commit as CT.7h at all** — there is no "half fix" to point
to, just a function whose own doc comment, written the day *before* the concept it's missing even
existed, still describes the pre-CT.7h world.

`git log -p -L 552,565:apps/web/src/ui/party.ts` and `git log -p -L 530,540:apps/web/src/ui/party.ts`
→ **exactly one commit each**, `f92f821b` ("A2.2: Cast in camp + spell-effect model + cast SFX
(CoK)", **2026-06-22 01:32:00 +0200**) — never revisited since. `git log -1 --format=%cd 1421bd6`
(CT.7h) → **2026-06-23 19:20:22 +0200**, one full day *later*. `healMember`/`mostWoundedName`/
`firstDeadName`/`reviveMember` were all written before the `dead`/`deadStore` distinction existed in
this codebase at all, so — unlike the Rest and Temple cases — there is no "the fixing commit missed
this" moment to locate; the gap simply survived because nothing has revisited camp-cast healing
since its original commit, through five subsequent CT.7h-adjacent rounds (A5.2, CT.7h, M89, M90).

The self-flagging is in `healMember`'s own current doc comment, current source
(`apps/web/src/ui/party.ts:530-531`):

```ts
/** Heal a living member by `amount` (capped at maxHp); returns HP actually restored. Dead members
 * are not healed by cure spells — they need a revive. Persists when HP changes. */
```

"Dead members are not healed" is the *intended* policy and is exactly right — **but the code below it
tests `m.hp <= 0`, not `deadStore.has(name)`**, so it actually excludes every unconscious member too,
not just the dead ones the comment names. This is the identical "the wrong invariant is written down
in plain English right next to the code" shape M87/M89/M90 all already identified — one layer more
literal here even than M90's variable-naming case: the comment states the *correct* rule in words,
and the very next line implements a *different, stricter* rule.

## Where the severance happens — exact locations, current source

**`apps/web/src/ui/party.ts:530-540`** (`healMember`, current source, full):

```ts
/** Heal a living member by `amount` (capped at maxHp); returns HP actually restored. Dead members
 * are not healed by cure spells — they need a revive. Persists when HP changes. */
export function healMember(name: string, amount: number): number {
  const m = roster.find((s) => s.name === name);
  if (!m || m.hp <= 0) return 0;                          // <-- excludes unconscious too, not just dead
  const before = m.hp;
  m.hp = Math.min(m.maxHp, m.hp + Math.max(0, Math.round(amount)));
  const healed = m.hp - before;
  if (healed) persist();
  return healed;
}
```

**`apps/web/src/ui/party.ts:552-565`** (`mostWoundedName`, current source, full):

```ts
/** Name of the most-wounded living member (largest HP deficit), or null if all are full/dead. */
export function mostWoundedName(): string | null {
  let best: string | null = null;
  let bestMissing = 0;
  for (const s of roster) {
    if (s.hp <= 0) continue;                              // <-- skips unconscious too, not just dead
    const missing = s.maxHp - s.hp;
    if (missing > bestMissing) {
      bestMissing = missing;
      best = s.name;
    }
  }
  return best;
}
```

**`apps/web/src/ui/magic.ts:284-295`** (`doCast()`'s `'heal'` case, the only caller of both, current
source, full):

```ts
case 'heal': {
  const target = mostWoundedName();
  if (!target) {
    result = `${ref.spell.name}: all hale`;
  } else {
    const amount = eff.dice ? rollSpellAmount(eff, caster.info.level, seed) : 0;
    const healed = healMember(target, amount);
    result = healed > 0 ? `${ref.spell.name}: ${target} +${healed} HP` : `${ref.spell.name}: ${target} full`;
  }
  break;
}
```

If the party's *only* casualty is an unconscious (not dead) member, `mostWoundedName()` returns
`null` (or, worse, the name of some *other*, less-wounded conscious member — see "Reachability"
below) and the Cure spell reports **"all hale"** or heals the wrong, smaller-deficit target,
consuming the caster's memorized spell slot for nothing — while the unconscious member sits
untouched at 0 HP, contradicting this project's own decompile research: *"a figure merely brought to
0 HP is unconscious and revives on rest / **a cure**"* (`docs/engine/research/
disasm-spells-krynn.md:917`, byte-located `Raise Dead`/`is not dead` strings, §22).

`grep -rn "mostWoundedName(\|healMember(" apps/web/src` → each has **exactly one call site**, both in
`magic.ts`'s `doCast()` — there is no other, un-broken path to either function.

## Reachable in real, ordinary, shipped play — static + dynamic proof

**Static reachability, the full real chain:** `apps/web/src/ui/combat.ts:737` (`finalize()`) →
`applyCombatHp(state.combatants, conditionOf)` marks any real fight's knocked-out-but-not-slain party
member `down: true, dead: false` on the roster (`party.ts:492-495`) — the same, entirely ordinary
combat outcome M89/M90 both traced. From exploration, `apps/web/src/ui/explore.ts:1015-1018`
(`activateEncamp`'s `'Magic'` case) → `memorizeSpells()` is the real, shipped Encamp → Magic menu
entry (exercised end-to-end by `apps/web/test/e2e.mjs`'s `runMagic()`); inside that overlay, the
`Cast` command bar entry / the `c`/`C` keybind / `window.__magic.cast()` all call `doCast()`
(`magic.ts:257,382,425,465`) — the only caller of `mostWoundedName()`/`healMember()` in the whole app.
A caster with a memorized `kind: 'heal'` spell (e.g. `c1-cure-light-wounds`, `spellEffects.ts:49`,
1d8 base) casting it while any party member is unconscious is an entirely ordinary sequence: fight →
lose a member to 0 HP without overkill → make camp → cast Cure Light Wounds.

**Dynamic re-derivation this round** (scratch Node/tsx script, created, run, then deleted — see
below), against the real, current, unmodified `mostWoundedName`/`healMember`/`partyStatus`/`isDead`
production functions in `apps/web/src/ui/party.ts` (imported directly via `tsx`, with a tiny
in-memory `localStorage` polyfill so the module's own try/catch-guarded persistence layer runs
unmodified):

```
partyStatus() before:
  Sturm:    { hp: 30, maxHp: 40, down: false, dead: false }   -- ordinary wounded, conscious (missing 10)
  Goldmoon: { hp: 0,  maxHp: 30, down: true,  dead: false }   -- real "unconscious, not dead" shape

mostWoundedName() -> "Sturm"          -- WRONG: Goldmoon's 30-HP deficit is the larger one, but she
                                          is skipped entirely by the `hp <= 0` gate

healMember("Goldmoon", 8) -> 0        -- the simulated Cure Light Wounds roll heals her for 0, even
                                          though she is not in deadStore (isDead("Goldmoon") === false)

Goldmoon after healMember attempt: { hp: 0, maxHp: 30 }   -- UNCHANGED
```

Even naming Goldmoon *directly* to `healMember()` (bypassing `mostWoundedName()`'s target-selection
bug entirely) still yields `0` healed — the second, independent gate inside `healMember()` itself
blocks it. A real cast in the shipped UI would additionally suffer the *targeting* bug first: with
Sturm also wounded, the spell would be silently misapplied to Sturm instead (consuming the memorized
slot on the smaller-deficit, already-conscious target) rather than failing loudly.

## Verification evidence (this round's scratch script)

`apps/web/test/_scratch_m91_verify.mjs` (created, run via `npx tsx`, output matches the snippet above
exactly, then deleted). `git status --porcelain` confirmed clean except this doc afterward.

## Proposed minimal wiring plan (not applied this round)

Two small, additive edits, both in the same function bodies the bug lives in, following the identical
`deadStore.has(name)` pattern M89 (`restPartyTicks`) and M90 (`templeHealAll`/`templeRaiseFirstDead`)
both already used — no new export, no new persistence key, no plumbing beyond swapping which existing
flag each check reads:

```ts
// sketch, not applied this round -- apps/web/src/ui/party.ts

/** Heal a member (not permanently dead) by `amount` (capped at maxHp); returns HP actually restored.
 *  An unconscious-but-not-dead member (hp<=0, not in deadStore) IS healable here (CT.7h; the
 *  original engine's own decompile note: "revives on rest / a cure") -- only the truly dead are
 *  excluded; they need Raise Dead, not a cure spell. Persists when HP changes. */
export function healMember(name: string, amount: number): number {
  const m = roster.find((s) => s.name === name);
  if (!m || deadStore.has(name)) return 0;                 // was: if (!m || m.hp <= 0) return 0;
  const before = m.hp;
  m.hp = Math.min(m.maxHp, m.hp + Math.max(0, Math.round(amount)));
  const healed = m.hp - before;
  if (healed) persist();
  return healed;
}

/** Name of the most-wounded member eligible for a Cure spell (largest HP deficit); the truly dead
 *  are excluded (deadStore) -- an unconscious-but-not-dead member IS eligible (CT.7h). Null if
 *  nobody eligible is wounded. */
export function mostWoundedName(): string | null {
  let best: string | null = null;
  let bestMissing = 0;
  for (const s of roster) {
    if (deadStore.has(s.name)) continue;                   // was: if (s.hp <= 0) continue;
    const missing = s.maxHp - s.hp;
    if (missing > bestMissing) {
      bestMissing = missing;
      best = s.name;
    }
  }
  return best;
}
```

Notes on the sketch:
- `deadStore` is already a module-private variable in `party.ts`, already read the identical way by
  `restPartyTicks()`/`templeHealAll()`/`templeRaiseFirstDead()` in the same file (post-M89/M90) — no
  new export or plumbing; the fix is purely swapping which existing flag each of two call sites reads,
  exactly the M89/M90 precedent.
- `doCast()` (`magic.ts:284-295`) needs **no change** — it already handles `healMember` returning `0`
  ("full") vs. `>0` ("+N HP") correctly; after the fix, an unconscious member simply becomes a normal
  `>0`-healed target like any other wounded member, with no new branch needed.
- **The existing e2e coverage does not exercise this path today and needs a new case, not a rewrite**
  (unlike M90's Temple fix, which had to rewrite an existing fixture asserting the wrong behavior):
  `apps/web/test/e2e.mjs`'s `runMagic()` (~line 2720) casts Cure Light Wounds on a freshly-created,
  full-HP party (nobody wounded), so `mostWoundedName()` currently returns `null` and the test's
  `castOk` assertion only checks `/Cure Light Wounds/.test(lastCast)` — which matches both "all hale"
  (today) and a real "+N HP" heal (post-fix) equally, so the fix does not break this existing
  assertion either way. A new, additive e2e case is recommended (mirrors `runTown`'s M90 fixture,
  `e2e.mjs:3773-3777`): seed `greybox.party.cok` with Goldmoon at `hp: 0` (NOT added to
  `greybox.dead.cok`), reload into `?explore=1`, cast Cure Light Wounds, and assert
  `window.__magic.lastCast()` matches `/Goldmoon \+\d+ HP/` (proving both the targeting fix and the
  heal-gate fix at once) — plus a companion case with Goldmoon genuinely in `deadStore` asserting the
  cast instead reports "all hale" or heals a *different*, actually-wounded member (proving the dead
  are still correctly excluded).

## Secondary observations not part of this round's fix

- **`firstDeadName()`/`reviveMember()` (the `kind: 'revive'` spell path, `party.ts:543-550,568-570`)
  remain untouched, matching M89's own explicit reasoning, re-confirmed this round rather than just
  re-cited.** They still gate on raw `hp <= 0` (not `deadStore`), meaning a `kind: 'revive'` spell can
  currently target *either* a truly-dead *or* a merely-unconscious member. Once this round's fix
  ships, an unconscious-not-dead member becomes reachable by **both** a `heal`-kind spell (correctly,
  new) **and** a `revive`-kind spell (already true, pre-existing) — a minor overlap, not a regression,
  and not a "dropped mechanic" (the loop's mandate concerns functionality that never reaches the
  player, not functionality that is reachable via more than one route). Whether `reviveMember` should
  *also* be tightened to `deadStore.has(name)` (so Raise Dead-kind spells mirror the Temple's own
  `templeRaiseFirstDead()` fix and correctly refuse a merely-unconscious target, per the byte-proven
  `"is not dead"` refusal, `disasm-spells-krynn.md:929`) is a real, open design question but is
  **more capability, not less** — out of scope for this round's minimal, additive fix; flagged below
  as an open question for a future round to pick up directly (M88-established "pick up a deferred
  sibling directly" guidance), not re-litigated here.
- **`awardPartyXp`'s `inCombat: s.hp > 0` (`party.ts:963`) is a different mechanic, not part of this
  family.** It decides who earns a share of post-battle XP, not who is healable — excluding both dead
  and unconscious members from the XP split is a defensible, distinct design choice (they didn't
  finish the fight conscious), not the dead-vs-unconscious healing conflation this round (and M89/M90)
  targets. Confirmed by reading its full context; not a candidate.
- **`explore.ts`'s party HUD "DEAD" label (`m.down ? 'DEAD' : …`, lines 560/566/793) shows "DEAD" for
  any downed member, dead or merely unconscious.** This is a cosmetic display-label question (should
  an unconscious member show "DOWN"/"0 HP" instead of "DEAD"?), not a mechanical healing gate — it
  doesn't block any recovery mechanism, it just mislabels the HUD row. Worth a future round's
  attention as a low-priority cosmetic fix, not bundled in here (different file, different concern,
  no mechanical consequence).
- **`combat.ts`'s in-fight `down: c.hp <= 0` (`combat.ts:489`) is the tactical engine's own transient
  combat-state flag, scoped to a single fight, not the persistent roster's `dead`/`down` distinction**
  — unrelated to this family; `applyCombatHp`'s `conditionOf` seam is the correct boundary where the
  transient in-fight state is translated into the roster's `dead`/`down` split, and that translation
  is already correct (CT.7h).

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| Bundle `reviveMember`/`firstDeadName`'s tightening (deadStore-only eligibility) into this same fix | Different direction of change (restricting an already-working, more-permissive path, not fixing a dropped one) and a different design question (should Raise Dead-kind spells refuse a living target the way the Temple now does); not needed to close this round's gap, and mixing a restriction into an additive fix raises regression risk for no reachability benefit. Left as an explicit open question instead. |
| Fold `awardPartyXp`'s `inCombat: s.hp > 0` into the same sweep | Investigated and confirmed a different mechanic (XP-split eligibility, not healing eligibility) with its own defensible policy; not the same conflation. |
| Fold the HUD "DEAD" label cosmetic issue into this fix | Different file/concern (a display string, not a healing gate); no mechanical consequence, so it doesn't meet this loop's "real mechanical consumer" bar for a headline fix; noted as a secondary observation instead. |
| Re-sweep from scratch instead of picking up the explicitly-flagged Cure-spell candidate | Rejected per M88's own established precedent: M90's closing note explicitly named this as "the next, already-flagged instance," and it was confirmed still live, high-confidence, and cleanly fixable (identical pattern to two already-shipped fixes) — the highest-precision choice available this round. |

## Open questions / unknowns

- **Should `reviveMember`/`firstDeadName` be tightened to `deadStore.has(name)`,** so a `revive`-kind
  spell mirrors the Temple's Raise Dead refusal for a merely-unconscious target (the byte-proven
  `"is not dead"` string, `disasm-spells-krynn.md:929`)? This is *more* capability today, not a
  dropped mechanic, so it doesn't meet this round's fix bar, but it is a real design inconsistency
  once this round's fix ships (an unconscious member becomes reachable by two different spell kinds).
  Left for a future round to decide deliberately.
- **The exact original-game targeting rule for a party-wide Cure spell when multiple members are
  wounded (does the original CoK/DoK auto-target "most wounded," or does the player choose?) remains
  UNKNOWN** — this codebase's `mostWoundedName()` auto-target policy predates any decompile citation
  for it (`f92f821`, A2.2, no cited source in its commit message); this round's fix corrects *who is
  eligible* to be selected, not the auto-vs-manual targeting policy itself, which is a pre-existing,
  separately-UNKNOWN design choice this round does not touch or newly assert.
- **Should the new e2e regression case (see "Proposed minimal wiring plan") be a strict requirement
  before this fix ships**, mirroring M89/M90's own "the fix and its test travel together" discipline?
  Recommended but not applied this round (audit scope is research, not code changes).

## Implications for our engine / for the taxonomy

- **A third, independently-discovered instance of the same root conflation, in a third subsystem,
  confirms M89's own prediction** ("this loop should keep checking `grep -n "hp <= 0\|hp > 0"
  apps/web/src/ui/party.ts` for remaining untouched call sites... the Cure-spell pair is the next,
  already-flagged instance"). Unlike M89 (fix landed on an unused sibling) and M90 (fix half-landed on
  the live function in the same commit), this instance never had *any* fixing commit to half-land —
  it is the "no memo ever arrived" case: the functions predate the concept they're missing by a single
  day and were never revisited across five subsequent rounds that touched the same file. Worth adding
  to the taxonomy as a distinct sub-case: **"a function is written the day before a state invariant is
  introduced elsewhere in the same file, and never revisited even as sibling functions in the same
  file are repeatedly, correctly fixed around it."**
- **Confirms this loop's own audit backlog mechanism works as designed**: M90 named this exact
  candidate, at this exact file/function pair, as the highest-priority carry-forward item; this round
  independently re-verified it (via git blame + a fresh dynamic script) rather than trusting the
  citation, and found it unchanged — the backlog pointer was accurate two rounds running.
- **A byte-located refusal string continues to double as a spec for a *different* function than the
  one it was first used to fix** — `"is not dead"` (`disasm-spells-krynn.md:929`) grounded M90's Temple
  fix and now also grounds this round's open question about `reviveMember`'s eligibility gate,
  reinforcing M90's own observation that such strings are implicit eligibility specs worth re-checking
  against every sibling function that touches the same state, not just the one first fixed.
