# M76 audit — the next "computed but unwired" candidate

> Audit method per the brief: pursued the round's suggested priority order. **Priority 1** (M75's
> newest technique — a fresh typed accept/reject gate function with N call sites, only some
> routing through it) was tried first: grepped `packages/engine/src` for every discriminated
> `{ ok: true, ... } | { ok: false, reason: ... }`-shaped result (`ok: false`/`reason:`/`export
> type.*Result` across the whole tree). Found exactly two candidates besides the now-fixed
> `addPlayer()`: `character.ts`'s `createCharacter()`/`ValidationResult` (`errors`/`warnings`) and
> `shop.ts`'s `buyItem()`/`sellItem()`/`ShopTxn` (`reason`). Traced every real call site of both
> (`create.ts:298,408,409`, `dqkParty.ts:44`, `importDokParty.ts:222`; `party.ts:1041,1066`) and
> found **both are already fully wired** — `create.ts:319,326-327` renders every `warnings`/`errors`
> entry; `party.ts:1041-1042`/`1066` and `town.ts:252-281` thread every `reason` through to an
> on-screen status line (`checkTraining`'s `reason` is the same, already-mined M65 territory).
> No fresh gap in this scope this round (details in "Rejected alternatives" below).
>
> This sent the search to the brief's **priority 2**: the `backstab`-on-miss engine gap that
> M73 found, characterized precisely, and explicitly deferred as an *engine*-side change outside
> its own research-only remit; that M74 re-read, confirmed still accurate, and consciously chose
> NOT to build (picking a different finding instead, for scope reasons, not because the backstab
> gap wasn't real); and that M75 carried forward unchanged in its standing-candidate list. Re-read
> `tactical.ts` and `combat.ts` at current line numbers (below) and confirmed the gap is **still
> exactly as M73 described it, byte-for-byte unchanged since `d2391c1` (the original CT.5c commit)
> and untouched by every commit since**, including M73's own `92e89a6` (which fixed the miss
> branch's `rear`/`rangeBracket`/`opportunity` handling but explicitly left `backstab` alone). This
> round finishes what M73 started: a verified, ready-to-apply fix with exact line citations, a
> scratch test proving the gap and proving the sibling `rear` field does NOT have the same problem,
> and a full wiring plan for both the engine push and the UI log branch.
>
> **Headline pick:** `resolveHit()`'s miss-branch event push (`packages/engine/src/combat/tactical.ts:1145`)
> never writes a `backstab` key at all — unlike its two sibling **hit**-branch pushes
> (`tactical.ts:1155`, `:1167`), which both write `backstab: backstab || undefined` — even though the
> `backstab` boolean is already computed and used to adjust `needed` two lines earlier in the very
> same function (`tactical.ts:1121`, `if (backstab) needed -= 4;`). The consuming UI
> (`apps/web/src/ui/combat.ts`'s `logEvents()`) differentiates a **hit** attack event by
> `coupDeGrace`/`opportunity`/`backstab`/`rear`/`rangeBracket` (`combat.ts:608-613`) but its sibling
> miss `else` branch (`combat.ts:615-620`) has no `backstab` case at all — so a thief who lines up a
> textbook backstab (positioned in the target's rear arc, `canBackstab()` true) and simply rolls low
> gets the same flat `"X misses Y (from behind)."` as an ordinary rear-arc miss, even though the
> attack was materially different: it took the thief's own bonus AND penalty tradeoff (+4 to hit,
> traded for the frontal/rear-generic +2 the non-thief rear bonus would have given, per
> `tactical.ts:1120-1122`'s own `else if` — a thief backstab and a generic rear-arc hit are mutually
> exclusive to-hit paths, not the same roll narrated two ways), and — mechanically more importantly
> — the fact that this was specifically a backstab *attempt* (not just a rear-arc swing) is real,
> computed information the engine already has and simply discards before the event ever leaves
> `resolveHit()`.

## Headline finding

### `tactical.ts`'s miss-branch attack-event push never records `backstab`, even though the boolean is computed and used two lines above it, and `combat.ts`'s sibling miss-branch log formatter has no case for it either — while both **hit**-branch pushes/log-cases handle it correctly

**The `backstab` boolean is real, computed input to `resolveHit()`, not merely a leftover flag.**
`resolveHit()`'s signature takes it as a parameter and uses it to adjust the to-hit roll before
`hit` is even decided:

```ts
// tactical.ts:1107 (function signature, current source)
function resolveHit(actor: TacticalCombatant, target: TacticalCombatant, weapon: Weapon, missile: boolean, backstab = false): TacticalEvent[] {
  ...
// tactical.ts:1116-1122 (current source)
    const fromRear = !missile && isBehindTarget(target.facing, target.pos, actor.pos);
    const effAc = fromRear && target.rearAc !== undefined ? target.rearAc : target.ac;
    // CT.5c — a thief backstab adds its own +4 (the thief's from-behind bonus); a non-thief rear strike
    // gets the generic +2 only when no stored `rearAc` already encodes the rear penalty (no double-count).
    let needed = actor.thac0 - effAc;
    if (backstab) needed -= 4;
    else if (fromRear && target.rearAc === undefined) needed -= REAR_TO_HIT_BONUS;
```

So whether the swing was a backstab attempt is decided *before* the `roll >= needed` check that
determines hit/miss (`tactical.ts:1137`) — it is known, real information at the moment the outcome
is computed, for every call, hit or miss alike.

**Both hit-branch event pushes write it through correctly.** The coup-de-grace hit branch:

```ts
// tactical.ts:1155 (current source, unchanged since d2391c1/9845cd0)
      events.push({ round, type: 'attack', actor: actor.id, target: target.id, roll, needed, hit: true, missile, damage: dmg, targetHpAfter: 0, helpless: true, coupDeGrace: true, backstab: backstab || undefined, rear: fromRear || undefined, rangeBracket: bracket });
```

and the ordinary hit branch:

```ts
// tactical.ts:1167 (current source, unchanged since d2391c1)
      events.push({ round, type: 'attack', actor: actor.id, target: target.id, roll, needed, hit: true, missile, damage: dmg, targetHpAfter: Math.max(0, target.hp), helpless: helpless || undefined, backstab: backstab || undefined, rear: fromRear || undefined, rangeBracket: bracket });
```

**The miss-branch event push is missing the field entirely — not merely `undefined` by falling
through the `|| undefined` idiom, but genuinely never mentioned:**

```ts
// tactical.ts:1144-1146 (current source, re-read this round, byte-identical to M73's own citation)
    if (!hit) {
      events.push({ round, type: 'attack', actor: actor.id, target: target.id, roll, needed, hit: false, missile, targetHpAfter: target.hp, rear: fromRear || undefined, rangeBracket: bracket });
    } else if (coupDeGrace) {
```

Note this push *does* include `rear` and `rangeBracket` (M73's own fix, `92e89a6`) — proving the
miss branch is not blanket-omitting attack context; `backstab` specifically was never added, in any
commit, since the field was introduced (`d2391c1`, the original CT.5c commit — confirmed via
`git log -p -S "backstab: backstab" -- packages/engine/src/combat/tactical.ts`, which shows only the
two hit-branch pushes ever gained the key; the miss branch is untouched in that history).

**`TacticalEvent.backstab` itself is a real, already-optional field** (so adding it to the miss push
is a type-compatible, zero-breakage change):

```ts
// tactical.ts:377-378 (current source)
  /** Attack: true when the blow was a thief backstab (from behind: +4 to hit, multiplied damage — CT.5c). */
  backstab?: boolean;
```

**The UI's `logEvents()` fully differentiates a HIT by every one of these flags, in priority
order, but its sibling MISS branch has no `backstab` case at all:**

```ts
// apps/web/src/ui/combat.ts:606-621 (current source, re-read this round)
      case 'attack':
        if (e.hit) {
          if (e.coupDeGrace) pushLog(`${nameOf(e.actor)} slays the helpless ${nameOf(e.target)} with one cruel blow!`); // CT.7j
          else if (e.opportunity) pushLog(`${nameOf(e.actor)} strikes the advancing ${nameOf(e.target)} for ${e.damage}!`);
          else if (e.backstab) pushLog(`${nameOf(e.actor)} backstabs ${nameOf(e.target)} (from behind) for ${e.damage}!`);
          else if (e.rear) pushLog(`${nameOf(e.actor)} hits ${nameOf(e.target)} from behind for ${e.damage}.`);
          else if (e.missile) pushLog(`${nameOf(e.actor)} shoots ${nameOf(e.target)} for ${e.damage}${rangeTag(e.rangeBracket)}.`);
          else pushLog(`${nameOf(e.actor)} hits ${nameOf(e.target)} for ${e.damage}.`);
          soundDispatcher.playEvent(e.missile ? 'missile' : 'hit');
        } else {
          if (e.opportunity) pushLog(`${nameOf(e.actor)}'s readied strike misses the advancing ${nameOf(e.target)}.`);
          else if (e.rear) pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)} (from behind).`);
          else if (e.missile) pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)}${rangeTag(e.rangeBracket)}.`);
          else pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)}.`);
          soundDispatcher.playEvent('miss');
        }
        break;
```

So today: a thief lines up a genuine backstab (`canBackstab('foe') === true`, confirmed via the
engine's own predicate), swings, and rolls low — the log reads `"Tasslehoff misses Draconian (from
behind)."`, identical to what ANY non-thief attacker gets for an ordinary rear-arc miss. The one
piece of information that makes this swing mechanically different (it took the thief's own +4/×N
backstab math, not the generic rear bonus) is silently lost, even though the engine computed it a
few lines earlier in the exact same function call.

**Reachable in ordinary play, not a contrived edge case.** Any party thief (or DoK/CoK-imported
thief character; `backstabLevelForMember()`, `apps/web/src/ui/party.ts:724-728`, feeds
`backstabLevel` into every party-side combatant, `combat.ts:354`) attempting a rear-arc melee attack
that simply doesn't roll high enough hits this exact path — a routine, frequent occurrence in any
combat where a thief tries to flank, not a rare corner case.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m76_verify.test.ts` (created, run green — **2/2 passing** — then
deleted; `git status --porcelain`/`git status` confirmed clean before and after, this doc the only
untracked file):

1. **The gap is real on the current miss branch.** Reused the exact rig from the existing
   `describe('thief backstab (CT.5c)')` block (`tactical.test.ts:718-794`, `thief()`/`foe()`
   helpers, thac0 15 / AC 5 / backstab −4 ⇒ `needed = 6`, so any roll 1–5 misses). Swept RNG seeds
   1–199 for one that produces a miss on the thief's lone attack (with `canBackstab('foe')` first
   confirmed true, so the attempt genuinely qualifies as a backstab), then asserted on that event:
   `atk.backstab` is `undefined` — the boolean is dropped. **In the same assertion, `atk.rear` is
   `true`** — the sibling field M73's own fix already threads through a miss survives fine, proving
   this is specifically a `backstab` omission, not a general "everything is dropped on a miss" bug.
2. **Control case (the hit branch is fine).** Same rig, the known-hit seed already used by
   `tactical.test.ts:752` (`seed: 3`): confirms `atk.hit === true` and `atk.backstab === true` —
   the existing, correct behaviour on a landed backstab, unchanged.

Full `packages/engine` suite re-run clean at **135 files / 1355 tests** (1353 baseline + this
round's 2 scratch tests), no regressions, via `cd packages/engine && npx vitest run`. Scratch file
then deleted; `git status`/`git status --porcelain` confirmed the working tree clean except for this
doc.

(This finding's *engine* half — `tactical.ts:1145` — is inside `packages/engine`, so it is fully
covered by the scoped scratch test above. Its *UI* half — `combat.ts`'s `logEvents()` miss branch —
is verified by direct source reading with exact line citations, per this loop's established
precedent for UI-layer findings, e.g. M75's roster fix.)

## Why this wasn't already picked up (grep evidence against every prior round)

`grep -n "backstab" docs/engine/research/m*-audit.md` (run this round, full file) returns hits
across `m24`, `m25`, `m43`, `m48`, `m49`, `m50`, `m51`, `m64`, `m65`, `m71`, `m72`, `m73`, `m74`,
`m75` — the overwhelming majority are about a *different*, already-shipped mechanic (the
pre-attack `highlightTarget()` "(Backstab!)" targeting-banner tag, M48/M49/M50's own finding, fully
built) or unrelated incidental mentions (M24's damage-order test, M64/M65's rejection of a
redundant `backstabLevelForMember` HUD row). The three that are on-point for THIS finding:

- **`m73-audit.md:194`** is the exact origin of this finding: *"`backstab` on a missed attack — A
  different, deeper, engine-side gap, not pursued. Unlike `rear`/`rangeBracket`/`opportunity`, the
  miss-branch event push (`tactical.ts:1145`) does not include a `backstab:` key at all... Fixing
  this would require an *engine* change... which is out of this research-only round's remit
  (`CLAUDE.md`: "Do not modify engine/source code")... flagged as an open question below instead."*
  M73's own `m73-audit.md:208-215` goes further and sketches the exact fix this round formalizes:
  add `backstab: backstab || undefined` to the miss push, then a fourth `else if (e.backstab)`
  branch to `logEvents()`'s miss branch. M73 explicitly did not build it (research-only round,
  correctly self-scoped) — it is not a rejected finding, it is a **deferred, pre-specified** one.
- **`m74-audit.md:343`**: *"Pursuing the `backstab`-on-miss follow-up M73 flagged — Considered as the
  brief's first-priority suggestion. Read `tactical.ts:1144-1145` again and confirmed M73's
  characterization is accurate... Chose the regen/status-plumbing finding instead because it is a
  structurally different, previously-unexamined class of gap... affecting more real, named, shipped
  content... a judgment call, not a rejection of the backstab candidate's validity."* Confirms the
  gap was independently re-verified accurate a second time and consciously set aside for scope
  reasons, not because it turned out to be wrong or already fixed.
- **`m75-audit.md:390`** carries it forward unchanged in its standing-candidates list, untouched.

**Independently re-verified `git log -p -S "backstab: backstab"` against `tactical.ts` this round**
(discipline #4): the string `backstab: backstab || undefined` appears in exactly two places in the
file's entire history — the two hit-branch pushes, both introduced together in `d2391c1` (the
original CT.5c commit) and never touched again except by the unrelated `coupDeGrace` refactor
(`9845cd0`, which added the *third* hit-branch case without altering the miss branch). No commit
between `d2391c1` and `HEAD` (including M73's own `92e89a6`, which specifically touched the miss
branch to add `rear`/`rangeBracket` handling to `logEvents()` but left `tactical.ts`'s miss push
alone — confirmed by reading `92e89a6`'s diff, which touches only `apps/web/src/ui/combat.ts`, not
`packages/engine/src/combat/tactical.ts`) ever added `backstab` to the miss path. The gap is
confirmed still fully open, not stale information.

## Wiring plan

**This fix has two parts and genuinely touches engine dispatch code, not just a UI file — flagging
per discipline #8 that the lead session should re-run the full `packages/engine` suite (not just
`tsc`) before and after applying the engine-side half.**

**Part 1 — engine-side (`packages/engine/src/combat/tactical.ts:1145`), small and additive:**

```ts
// sketch, not applied this round
    if (!hit) {
      events.push({ round, type: 'attack', actor: actor.id, target: target.id, roll, needed, hit: false, missile, targetHpAfter: target.hp, backstab: backstab || undefined, rear: fromRear || undefined, rangeBracket: bracket });
    } else if (coupDeGrace) {
```

This is the exact one-line addition M73 itself specified (`m73-audit.md:211`). `backstab` is
already an optional field on `TacticalEvent` (`tactical.ts:378`), so this is fully backward
compatible — no existing consumer reads a `TacticalEvent` in a way that would break from the new
key appearing (every current reader either destructures by name or uses an `if (e.backstab)`
truthiness check, both unaffected by the field now sometimes being present on a miss instead of
never).

**Part 2 — UI-side (`apps/web/src/ui/combat.ts`'s `logEvents()`, miss branch), matching the hit
branch's own `backstab`-before-`rear` priority (`combat.ts:610` sits between `opportunity` and
`rear`):**

```ts
// sketch, not applied this round — mirrors combat.ts:610's position in the hit branch
        } else {
          if (e.opportunity) pushLog(`${nameOf(e.actor)}'s readied strike misses the advancing ${nameOf(e.target)}.`);
          else if (e.backstab) pushLog(`${nameOf(e.actor)}'s backstab attempt on ${nameOf(e.target)} misses.`);
          else if (e.rear) pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)} (from behind).`);
          else if (e.missile) pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)}${rangeTag(e.rangeBracket)}.`);
          else pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)}.`);
          soundDispatcher.playEvent('miss');
        }
```

Since (per the headline finding) a genuine backstab attempt always has `fromRear === true` as well
(the same position/facing check gates both `canBackstab` and `fromRear`), placing the new
`e.backstab` branch ahead of the existing `e.rear` branch — exactly mirroring the hit branch's own
`backstab`-before-`rear` ordering (`combat.ts:610` before `:611`) — is required for the new case to
ever actually fire; otherwise the pre-existing `e.rear` branch would always intercept it first.

**Both parts are additive-only:** no existing field, branch, or test assertion is removed or
altered; a new fact (already computed, previously silently discarded) becomes visible only when
`backstab` is genuinely true, exactly matching the "never fabricate, only show a real decoded
value when present" rule.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| `character.ts`'s `createCharacter()`/`ValidationResult` (M75's priority-1 technique, applied fresh) | Read the whole file (`character.ts:1-216`) and every real call site. `create.ts:298,319,326-327` renders every `warnings` and `errors` entry in full (not just `.ok`). `dqkParty.ts:44-46`'s `buildSheet()` only checks `.ok`, but its 6 requests are hardcoded literals with no robe/deity mismatch inputs, so no warning can ever be generated there — not a live gap. `importDokParty.ts:207-224`'s `sheetFromDokSaved()` also only checks `.ok` (drops `errors`/`warnings` on the floor), but its own inputs (no `robe` field set, `deity` only set when `cls === 'cleric'`) can likewise never trigger a warning under current construction — confirmed by re-reading `sheetFromDokSaved`'s request-building code (`importDokParty.ts:211-221`), not merely assumed. No live, reachable drop found. |
| `shop.ts`'s `buyItem()`/`sellItem()`/`ShopTxn.reason` (same technique) | Traced `buyItem()` → `party.ts`'s `buyForLeader()`/`ShopResult` (`party.ts:1038-1047`) → `town.ts:252-253` (`Cannot buy: ${r.reason}.`) — fully wired end to end. `checkTraining`'s `TrainingCheck.reason` is the same, already-mined M65 territory (`party.ts:1026`, `town.ts:147`). No gap. |
| A fresh discriminated-union sweep (priority 3) | Deferred once the backstab-on-miss candidate (priority 2, explicitly pre-approved by this round's own brief) turned out to still be open and well-specified — did not need to fall back further. |
| `aiAction()`'s own narration of a missed backstab (would an AI-controlled thief's miss also need distinct wording?) | Already answered by M49's own reasoning (`m49-audit.md:341-342`, re-confirmed unchanged this round): `logEvents()` is called uniformly for every `apply()`/`aiAction()` result (`combat.ts:702,846` both route through `logEvents`), so the fix above automatically covers AI-driven thieves too — no separate AI-specific wiring is needed, this was never actually a distinct code path to begin with. |
| Also fixing the pre-attack "(Backstab!)" targeting-banner tag (`highlightTarget()`) for some new nuance | Not touched — that tag is about a PRE-roll prediction of what a swing *could* be (already fully built, M48/M49/M50), a completely different code path from this round's POST-roll log narration of what a swing *was*. No overlap, no reason to touch it. |

## Open questions / unknowns

- **Exact wording of the new miss-branch backstab line.** This round's sketch
  (`"X's backstab attempt on Y misses."`) is a reasonable match to the existing sentence patterns
  (`"X's readied strike misses the advancing Y."` for `opportunity`) but is **not** transcribed from
  any original-binary string — CoK/DoK's own "-Backstabs- (from behind)" message (byte-located,
  cited in `tactical.ts:153`) only fires on a landed backstab in the original games too (per AD&D-1e
  rules, a backstab is inherently an attack roll like any other, so the original almost certainly
  had its own generic miss message for a failed backstab attempt, distinguishable in-game only by
  the attacker's position) — the ORIGINAL wording for a specifically-failed backstab attempt is
  **UNKNOWN**, not searched this round. Left to the lead session's judgment, consistent with this
  loop's established pattern for cosmetic log-line wording (e.g. M73's own regen-line question).
- **Whether `backstab` should also gain a distinct combat-log color/highlight** the way `coupDeGrace`
  might elsewhere — not investigated, out of scope for this text-only finding.
- **Whether the SFX on a missed backstab should differ from an ordinary miss** (`soundDispatcher.playEvent('miss')` fires unconditionally in the miss branch today, hit-or-miss-flavor-agnostic) — not investigated; the existing hit branch already varies SFX only by `missile` vs. melee (`combat.ts:614`), not by `backstab`/`coupDeGrace`/`opportunity`, so a matching miss-branch SFX split would be a bigger, separate design question, not required for this round's core text fix.
- Standing candidates carried forward unchanged (not re-investigated this round, no new angle):
  `applyFlee`'s own independent test coverage (M74), M72's un-walled dungeon-edge/`TryStepForward`
  rules-fidelity question, the `surrendered` marker, the guarding-bar 5th signal,
  `TacticalCombatant.int`, the feared/asleep colour tier, `panelRows()`/`visibleCells()`'s duplicated
  `impaired` check, the Abilities-panel precedent, DoK's Saves column, BASE_ITEMS' thin catalogue,
  DoK's xp/hitPoints byte-fields, DoK's runItemPluses e2e, the Class-label collision, dialogue/town
  day-wiring, `saveStore.ts`'s `listSlots()`/`SaveSummary`, `DetectionMatch` fields, flat-AC-10 CoK
  pregens, the wilderness moon-bar, the `DEMO_PARTY` edge case, `WILD_MENU`'s decorative bar, dual-class
  reactivation, the Con Save/Save Roll merge, `conSaveBonus` on DoK monsters, `DexterityMods.reaction`,
  the `DokEffect`/.EFF crosswalk, CoK's missing `.STF`/`.SFX` crosswalk, DRYDEN's Solamnic Plate Mail
  gap, `create.ts`'s preview-echo gaps, the Status row's duration/HD-cap, `itemCategory()`'s INFLICT
  preview, `MonsterWizSpell.learning`, and the `hasted` buff indicator. Item-instance subsystem still
  31-for-31 blocked. ECL-ally morale% remains RETIRED (M61). `addToParty()`'s name-uniqueness gate
  is RESOLVED (M75) and the `apply()` return-value plumbing gap is RESOLVED (M74) — neither
  re-flagged.
- **New candidate for a future round**, noticed but not pursued: `createCharacter()`'s `warnings`
  array (fully wired for `create.ts` today) is never exercised by either non-interactive call site
  (`dqkParty.ts`, `importDokParty.ts`) because neither ever sets a mismatched `robe`/`deity` — worth
  a quick sanity check in a future round on whether that's *provably* permanent (i.e., could a future
  edit to either file's request-building logic accidentally introduce a mismatch and silently drop
  the resulting warning), but not a live bug today, so not built.

## Implications for our engine

- **A prior round's own explicit, well-specified, self-aware deferral ("this needs an engine change,
  out of my research-only remit, here's the exact fix") is not the same as a rejection** — M73 did
  not merely notice this gap, it wrote the fix down almost verbatim and correctly identified WHY it
  couldn't build it itself in a research-only round. Two subsequent rounds (M74, M75) each
  independently re-confirmed the gap was still real and still open before moving on to other work.
  This round's contribution is not discovery (that happened at M73) but closing the loop: verifying
  the fix is still exactly correct against current line numbers, proving it with a scratch test, and
  handing the lead session a ready-to-apply, two-part (engine + UI) plan.
- **A "sibling field, one written, one dropped" gap can persist for MULTIPLE rounds even when
  explicitly, correctly flagged with the exact file/line and even the exact one-line fix**, simply
  because every subsequent round had a stronger or differently-scoped candidate to spend its one
  slot on. This is not a process failure — it demonstrates the backlog discipline (re-check standing
  candidates, don't silently drop them) working as intended over a 3-round span (M73 → M74 → M75 →
  M76).
- **`backstab` and the generic rear-arc bonus are mutually exclusive to-hit paths on the same
  event** (`tactical.ts:1121-1122`'s `if (backstab) ... else if (fromRear ...)`), but both boolean
  *fields* can be simultaneously true on one event object (since a backstab always implies the rear
  positional precondition) — worth remembering for any future consumer of `TacticalEvent`: check
  `backstab` before `rear` when both might be set, exactly as the existing hit branch already does,
  or a genuine backstab will silently narrate as a plain rear-arc hit/miss instead.
