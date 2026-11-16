# M79 audit — the next "computed but unwired" candidate

> Audit method: re-read `docs/engine/research/m78-audit.md` in full first (its own newest technique,
> scope (g): "multiple functions that all deliberately bypass the same shared helper for the same
> structural reason, where only some of them remember to manually replicate every side effect that
> helper would have provided"). Rather than re-hunting `applyHpLoss()`'s bypass sites (M78 already
> closed that — coup de grace and Turn Undead's `'destroy'` branch both now correctly re-add the
> `xpAwarded` line), this round looked for a **different** shared invariant with the same "only one
> sibling call site remembers it" shape. `combat/tactical.ts`'s own top-level doc comment
> (lines 99-111) states a general rule for its five temporary status conditions: the engine "ticks them
> down each round ... and clears them when they expire **(and wakes `asleep` figures that take
> damage)**" (line 109) — an unqualified claim, not scoped to any one damage source. Checking that claim
> against the actual code (discipline #3 — comments lie, code doesn't) found it is true for exactly
> **one** of the engine's three damage-application call sites (`resolveHit()`, melee/missile) and false
> for the other two (`applyCast()`, spell damage; `applyHazardTo()`, hazard-zone damage). The spell-side
> gap is reachable in ordinary, shipped play; the hazard-side gap is not (same production-reachability
> gate M78 already applied to a sibling hazard question — see "Rejected alternatives").
>
> **Headline pick: `applyCast()`'s spell-damage branch never calls `clearStatus(t, 'asleep')` before
> applying damage, unlike `resolveHit()`'s melee/missile branch, which always does — so an enemy (or
> ally) put to sleep by a real, player-castable Sleep spell and then hit by a real, player-castable
> damage spell (Magic Missile, Fireball, ...) that doesn't kill it stays incorrectly flagged `asleep`.
> That stale flag then feeds the engine's own already-tested CT.7j coup-de-grace instant-kill mechanic
> on the very next melee swing against it — an unconditional kill that fires purely because a spell
> "forgot" to wake its target, not because the target was actually still asleep by the engine's own
> stated design.**

## Headline finding

### The invariant, as the engine's own type doc-comment states it (broadly, unqualified by damage source)

```ts
// packages/engine/src/combat/tactical.ts:99-111 (current source)
/**
 * `asleep`/`held` skip the turn (the figure is **helpless** — attacks against it auto-hit; CT.5a);
 * `feared` figures can't attack and flee toward the nearest edge on their turn. `fled` removes the
 * figure (escaped off-edge). `hasted`/`slowed` modify the initiative value (×2 / ÷2).
 * `unconscious`/`dead` mark a downed figure: both are out of the fight, but `dead` is the permadeath case
 * (a blow of `damage ≥ hp + 10`) while `unconscious` (0 HP, or dying at negative HP under the lethal
 * threshold) can be revived after the battle.
 *
 * The temporary conditions (`asleep`/`held`/`feared`/`slowed`/`hasted`) carry a **duration** (rounds)
 * when inflicted by a spell — see {@link TacticalSpell.inflict}; the engine ticks them down each round
 * and clears them when they expire (and wakes `asleep` figures that take damage). AD&D-1e-standard
 * mechanism; the per-spell durations/HD-caps are ruleset data, not hardcoded here.
 */
export type TacticalStatusFlag =
  | 'asleep' | 'held' | 'feared' | 'fled' | 'surrendered' | 'hasted' | 'slowed' | 'unconscious' | 'dead'
  | 'guarding';
```

Line 109's parenthetical — "wakes `asleep` figures that take damage" — makes no distinction between a
melee blow, a missile shot, a spell, or a hazard; it reads as the engine's stated general design for
*any* damage a sleeping figure takes.

### Where the invariant IS honored — the one shared helper's TWO real call sites

`applyHpLoss()` (`tactical.ts:1186-1194`) is the shared "apply damage, set the downed/dead flag, award
XP" helper (the same one M78's audit centred its own finding on). It has exactly two ordinary callers
that deal damage to a possibly-sleeping figure, plus one instant-kill bypass:

```ts
// packages/engine/src/combat/tactical.ts:1157-1168 (resolveHit, ordinary-hit branch, current source)
    } else {
      let dmg = Math.max(1, rng.roll(weapon.damage.count, weapon.damage.sides, weapon.damage.bonus));
      // CT.5c — backstab multiplies the rolled weapon damage by the thief's level-banded factor (×2..×5).
      if (backstab) dmg *= backstabMultiplier(actor.backstabLevel ?? 1);
      // M24.S1 — COAB `half_damage` (Type_5 sweep): applied after backstab multiply, before HP loss —
      // the same order COAB's `sub_3E192` computes it (backstab multiply, then the defender-side sweep).
      if (target.halfDamage) dmg = Math.floor(dmg / 2);
      // A slept figure that survives a blow wakes (held is magical and does NOT break on damage).
      if (target.flags.has('asleep')) clearStatus(target, 'asleep');
      const dead = applyHpLoss(target, dmg);
      events.push({ round, type: 'attack', actor: actor.id, target: target.id, roll, needed, hit: true, missile, damage: dmg, targetHpAfter: Math.max(0, target.hp), helpless: helpless || undefined, backstab: backstab || undefined, rear: fromRear || undefined, rangeBracket: bracket });
      if (target.hp <= 0) events.push({ round, type: 'slain', actor: actor.id, target: target.id, dead });
    }
```

`resolveHit()` serves both `applyMelee()` and `applyMissile()` (the `missile` boolean parameter selects
the branch), so **every** melee or missile hit that damages a sleeping figure — party or monster,
whichever side is asleep — always calls `clearStatus(target, 'asleep')` immediately before
`applyHpLoss()`. This is independently proven by the existing, already-passing engine test:

```ts
// packages/engine/test/tactical.test.ts:443-457 (current source, already shipping, unmodified)
  it('an asleep (helpless) target is auto-hit by a MISSILE and wakes when it survives the shot', () => {
    ...
    expect(e.flags.has('asleep')).toBe(false); // a struck-but-surviving sleeper wakes
  });
```

(The coup-de-grace melee bypass at `tactical.ts:1150` — `if (target.flags.has('asleep'))
clearStatus(target, 'asleep');` — also calls it, though it's moot there since the target dies in the
same branch.)

### Where the invariant is NOT honored — `applyCast()`'s spell-damage branch

```ts
// packages/engine/src/combat/tactical.ts:1329-1338 (applyCast, current source, full damage block)
      let dead = false;
      if (spell.damage) {
        let dmg = rollAmount(spell.damage, level);
        if (saved) dmg = spell.save === 'negate' ? 0 : Math.floor(dmg / 2);
        ev.damage = dmg;
        if (dmg > 0) {
          dead = applyHpLoss(t, dmg);
          ev.targetHpAfter = Math.max(0, t.hp);
        }
      }
```

There is no `clearStatus(t, 'asleep')` anywhere in `applyCast()` (`tactical.ts:1291-1356`, read in full
— confirmed by `grep -n "clearStatus" packages/engine/src/combat/tactical.ts`, which returns only the
two `resolveHit()` hits at lines 1150 and 1165). A spell's damage calls the exact same shared
`applyHpLoss()` helper `resolveHit()` calls, but skips the sibling "wake the sleeper" step entirely.
(`applyHazardTo()`'s hazard-damage branch, `tactical.ts:856-861`, has the identical gap — see "Rejected
alternatives" for why that one is not part of this round's headline despite being the same shape.)

### This is reachable in real, ordinary, shipped play — not a hypothetical

Both halves of the exploit are wired to real, player-castable spells, not demo-only fixtures:

- **Sleep is a real, memorizable, combat-castable spell** —
  `combatSpells.ts:74`: `'m1-sleep': { status: 'asleep', rounds: 99, hdCap: 4 }`, reached through the
  real production bridge `apps/web/src/ui/party.ts`'s `combatSpellsForMember()`
  (`party.ts:662-681`) → `tacticalSpellFor()` (`combatSpells.ts:94-130`), which is how a real
  mage's memorized spell list becomes `TacticalCombatant.preparedSpells` for the live tactical-combat
  screen. Not the `?combat=1` standalone demo strip — the real party-import/dungeon-explore path.
- **A damage spell (Magic Missile, Fireball, ...) is equally real** — `combatSpells.ts:50-56`'s
  `GEOMETRY` table, reached the identical way.
- **The player-facing auto-target picker doesn't exclude an asleep foe** — `apps/web/src/ui/combat.ts`'s
  `partyCast()` (`combat.ts:893-925`) builds its enemy-target pool as
  `state.combatants.filter((t) => t.side === 'enemy' && t.hp > 0 && !t.flags.has('fled') && inRange(t))`
  (`combat.ts:911`) and picks the nearest — no `asleep` exclusion, so a Sleep-then-damage-spell
  sequence against the same, now-stationary (asleep figures don't move) enemy cluster is an entirely
  ordinary two-turn play pattern, not a contrived setup.
- **The engine itself never excludes an asleep figure from being a spell's target** —
  `spellAffected()` (`tactical.ts:1262-1282`) filters candidates only by `isActive(c)`
  (`tactical.ts:696`: `c.hp > 0 && !c.flags.has('fled') && !c.flags.has('surrendered')`) — `asleep`
  does not disqualify a figure from being caught in a burst or hit as a single target.

### The consequence is mechanically real, not cosmetic

A figure left incorrectly `asleep` after surviving spell damage remains **helpless** by the engine's own
gate (`tactical.ts:1136`: `const helpless = target.flags.has('asleep') || target.flags.has('held');`),
which has two live, already-shipped downstream effects:

1. **It skips its own next turn** — `beginTurn()`'s guard (`tactical.ts:1035`):
   `if (actor.flags.has('asleep') || actor.flags.has('held')) { oidx++; ...; continue; }` — a figure
   that (per the engine's own stated invariant) should have woken from the spell hit instead sits out
   its turn entirely.
2. **The next melee swing against it is an unconditional instant kill** — `resolveHit()`'s CT.7j
   coup-de-grace (`tactical.ts:1143`): `const coupDeGrace = hit && !missile && helpless && ruleset !==
   'gen2';` — under the default `gen1` ruleset (CoK/DoK), any melee attacker landing on a helpless
   target bypasses the to-hit roll AND the `hp ≥ hp+10` overkill gate and kills it outright
   (`tactical.ts:1146-1156`). A target this engine's own invariant says should be awake is instead
   guaranteed-killed by the next ordinary melee swing, exactly as if it were still genuinely asleep.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m79_verify.test.ts` (created, run — **3/3 passing** — then deleted;
`git status --porcelain` confirmed clean before and after, this doc the only untracked file):

1. **The bug, proven directly**: a party caster (`w`) with a real `TacticalSpell` shaped exactly like
   Magic Missile (`target:'enemy', area:'single', save:'none', damage:{count:1,sides:4,bonus:0}`) casts
   at an enemy (`e`) that starts `flags: new Set(['asleep'])`, `hp: 20`. `c.apply({type:'cast',
   spellId:'mm', targetId:'e'})` deals real damage (`cast.damage > 0`) and `e` survives
   (`e.hp > 0`) — but `e.flags.has('asleep')` is still **`true`** afterward, confirming the drop.
2. **Control, the sibling that already works**: the identical "survives, should wake" scenario via a
   **missile** hit instead (reproducing `tactical.test.ts:443-457`'s own established fixture shape) —
   `e.flags.has('asleep')` is correctly **`false`** after the shot, proving the only difference between
   the two outcomes is which resolver function handled the damage.
3. **Escalation (the real exploit chain, not just the flag)**: three combatants — caster `w`
   (initiative 30), melee fighter `f` (initiative 25), asleep enemy `e` (initiative 1, positioned off
   `w`→`e`'s line of fire so the spell isn't blocked). `w`'s turn casts the damage spell at `e` (survives,
   stays `asleep`); `f`'s turn (the very next actor) then takes an ordinary `melee` swing at `e` —
   `atk.helpless` is `true`, `atk.coupDeGrace` is `true`, and `e` ends the exchange `dead` at `hp: 0`.
   This proves the stale flag isn't just inert bookkeeping — it fires the engine's own real,
   already-tested instant-kill mechanic on a target that (per the engine's own invariant) should no
   longer have qualified as helpless.

Full `packages/engine` suite re-run clean at **134 files / 1355 tests** with the scratch file absent
(confirmed baseline, matching M78's own stated post-cleanup baseline exactly) and **135 files / 1358
tests** with the scratch file present (134+1 file, 1355+3 tests) — both green, via
`cd packages/engine && npx vitest run`. Scratch file then deleted; `git status`/`git status --porcelain`
confirmed the working tree clean except this doc.

## Why this wasn't already picked up (grep evidence against every prior round)

`grep -rn "clearStatus" docs/engine/research/m*-audit.md` (every prior file): **two** hits total —
`m50-audit.md:74` (quoting the coup-de-grace branch's own `clearStatus` call verbatim, as part of an
unrelated finding about `highlightTarget()` never previewing the coup-de-grace hint) and
`m78-audit.md:49` (quoting the same line for an unrelated `xpAwarded` finding). Neither prior round's
own analysis asked whether `clearStatus('asleep')` is called consistently across every damage-dealing
function — both merely quoted the line in passing while investigating a different question.

`grep -rniE "wake|asleep.{0,40}(damage|spell)" docs/engine/research/*.md` (every prior file, excluding
this doc): the only substantive hits are `disasm-spells-krynn.md:1029-1030` (documenting that a
*missile* survivor wakes — the already-correct sibling this round's fix mirrors, not the gap) and
`m74-audit.md:171-206` (a **completely different** bug: `statusEndVerb()`'s "wakes up"/"breaks free"
**narration text** never reaching the combat log because of `apply()`'s pre-M74 return-value plumbing
gap — a log-display issue, since fixed by M74's own return-value fix, `140832b`). M74's finding was
about *events not surfacing to the UI log*; this round's finding is about the underlying **state
mutation itself** — the `asleep` flag — never being cleared at all for one of three damage sources, a
different and more fundamental gap that exists independently of, and predates, M74's plumbing fix
(confirmed: `applyCast()`'s damage block, `tactical.ts:1329-1338`, has never contained a `clearStatus`
call at any point reachable via `git log -L 1329,1338:packages/engine/src/combat/tactical.ts` — see
below).

`grep -rn "applyCast\|m1-sleep\|Sleep spell" docs/engine/research/m*-audit.md`: hits in `m27`/`m28`
(conSaveBonus / save-roll wiring, unrelated to wake-on-damage), `m31` (DoK monster spellbook wiring,
unrelated), `m45` (Reference-DB spell-geometry display gap, UI-only, unrelated to any state mutation),
`m65`/`m68`/`m69`/`m70` (Companion-Panel/reference-DB display of `conSaveBonus`/status-inflict data,
all UI-side, none touching `clearStatus`), and `m77` (explicitly checked `applyCast()` for a
*hypothetical future movement spell*, unrelated to this round's damage/wake question). No prior round
asked "does every damage-dealing function honor the engine's own stated `asleep`-wakes-on-damage
invariant."

**Independently re-verified via `git log -L`** (discipline #4): `git log -L
1329,1338:packages/engine/src/combat/tactical.ts` shows the spell-damage block has been touched by
several commits as the engine evolved (M24's `half_damage`-adjacent work, M28's `conSaveBonus`, CT.5a's
own original status-infliction commit), but at no point did any of them add a `clearStatus('asleep')`
call — the block has never contained one. `git log -L
1157,1168:packages/engine/src/combat/tactical.ts` (resolveHit's ordinary-hit branch) shows the
`clearStatus` call has been present since the CT.5a commit that first introduced `asleep`/`held`
(alongside the very same-commit HD-cap/Sleep-spell work) — so this is not a case of one branch losing a
call a later refactor removed; `applyCast()` simply never had it from the day status effects were
introduced, while `resolveHit()` always did.

## Wiring plan

**This is an engine-side change** — the fix lives entirely inside
`packages/engine/src/combat/tactical.ts`'s `applyCast()` function, not in any `apps/web` file. Per
discipline #10: the lead session should re-run the full `packages/engine` test suite (not just `tsc`)
before and after applying this, exactly as for M77/M78's own tactical.ts changes.

**Recommended shape — smallest, additive, mirrors `resolveHit()`'s existing precedent exactly (same
"clear before applying the loss" order, only for `'asleep'`, matching that the engine's own comment at
`tactical.ts:1164` explicitly keeps `held` persistent through damage — magical hold does NOT break):**

```ts
// sketch, not applied this round — tactical.ts:1329-1338 area
      let dead = false;
      if (spell.damage) {
        let dmg = rollAmount(spell.damage, level);
        if (saved) dmg = spell.save === 'negate' ? 0 : Math.floor(dmg / 2);
        ev.damage = dmg;
        if (dmg > 0) {
          // M79.S1 — mirrors resolveHit()'s own wake-on-damage step (tactical.ts:1165): a slept figure
          // that takes real damage wakes, whatever the source; `held` stays persistent (magical).
          if (t.flags.has('asleep')) clearStatus(t, 'asleep');
          dead = applyHpLoss(t, dmg);
          ev.targetHpAfter = Math.max(0, t.hp);
        }
      }
```

Placed **before** `applyHpLoss(t, dmg)`, matching `resolveHit()`'s own ordering exactly (waking is
unconditional on "took damage," independent of whether the damage turns out lethal — if it is lethal,
the flag no longer matters since the figure is no longer active either way).

**Explicitly do NOT gate this behind `spell.inflict` or any spell-specific flag** — the fix is a
property of the *target* (was it asleep before this damage landed), not of the *spell* doing the
damage, exactly mirroring how `resolveHit()`'s check is unconditional on the attacker/weapon, only on
`target.flags.has('asleep')`.

**Test to add** (beyond this round's scratch, which should be deleted per the loop's own discipline and
replaced with a permanent version): a new case in the existing `describe('tactical status conditions
(CT.5a)')` block (`tactical.test.ts:392-...`), immediately after the existing missile-wake case
(`tactical.test.ts:443-457`), following its exact fixture shape but casting a damage spell instead of
firing a bow — asserting `e.flags.has('asleep')` is `false` after a survived spell hit, the direct
positive-control mirror of the existing missile test.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| Also fixing `applyHazardTo()`'s identical gap (`tactical.ts:856-861`, hazard-zone damage never calls `clearStatus('asleep')` either) | Same shape, but **not reachable in production today** — re-confirmed this round using M78's own established reachability test: `buildEncounterTerrain()` (`encounterMap.ts:126-131`), the only production terrain builder, never sets `TerrainGrid.hazard` with a `damage` field; the sole production caller that supplies any hazard at all (`apps/web/src/ui/combat.ts:443-455`, the standalone `?combat=1` demo strip) only lays a non-lethal `'held'` web with no `damage`. A hazard that both deals damage AND could coexist with an already-`asleep` target cannot currently occur via any shipped path — only in engine unit tests. Flagged as a standing candidate (see "Open questions"), not picked as this round's headline, consistent with M78's own treatment of the sibling `move`/`flee` morale-sweep hazard question. |
| Extending the fix to also wake a `held` target on damage | Explicitly rejected — `resolveHit()`'s own comment (`tactical.ts:1164`) states `held` is deliberately magical and does NOT break on damage; this is 1e-standard (Hold Person persists through injury, unlike a mundane/magical sleep that a jolt interrupts) and already correctly implemented (`tactical.test.ts:459-467`, "a held target is auto-hit by a MISSILE but does NOT break on damage (magical hold)"). Only `asleep` needed the fix; `held`'s current behavior is already correct and must not change. |
| Re-litigating M78's `xpAwarded`/Turn-Undead finding | Not re-examined — re-read `m78-audit.md` in full per discipline #4 and confirmed its fix (`tactical.ts` `'destroy'` branch now awards `xpAwarded`) is a closed, different question; not revisited this round. |
| A fourth "kill-bypass forgets a shared side effect" sweep (per M78's own technique, scope (g)) on `inflictStatus()`/`clearStatus()` themselves | Investigated directly: `inflictStatus()` (`tactical.ts:794-799`) and `clearStatus()` (`tactical.ts:802-805`) are each called from exactly the sites grepped (`inflictStatus`: `applyHazardTo` line 864, `applyMoraleOutcome` line 918, `applyCast` line 1346, `applyTurn`'s 'turn' branch line 1570 — all four consistent, no bypass found; `clearStatus`: only the two `resolveHit()` sites). The actual gap this round found is not a bypass of `clearStatus()` itself, but an *omission* of a call to it from a damage-dealing function that has no structural reason to skip it (unlike M78's coup-de-grace/Turn-Undead cases, which deliberately bypass `applyHpLoss()` for a real mechanical reason). This is closer to M73's "one branch of a discriminated dispatch forgets a field its sibling branch reads" shape than to M78's "deliberate bypass" shape — noted in Implications below. |
| Treating this as a UI-only gap (e.g., just surfacing a "wakes up" log line) | Rejected — this is a genuine state-mutation gap (the flag itself, not merely its narration), with real downstream mechanical consequences (turn-skip, coup de grace) independent of any log text. A pure UI fix would not address the actual defect. |

## Open questions / unknowns

- **Should `applyHazardTo()`'s hazard-damage branch get the identical `clearStatus('asleep')` call for
  consistency, even though it's currently unreachable in production?** Not fixed this round, per the
  same reasoning M78 used for its own sibling hazard/morale-sweep candidate — worth doing at the same
  time a real damaging persistent-zone spell (Stinking Cloud/Cloudkill/Ice Storm as an actual
  hazard-laying effect, not just a status-inflicting single cast) is ever wired to leave a hazard on the
  grid.
- **Is the `hasted`/`slowed` set of conditions subject to any analogous "should X clear on damage"
  1e rule this round didn't check?** Not investigated — `hasted`/`slowed`/`feared` have no "wakes on
  damage" analog in the type comment or in AD&D-1e convention (only `asleep`/`held` are ever described
  as "helpless," and only `asleep` — not `held` — is stated as damage-breakable); no further angle
  pursued here.
- **Should the fix also emit a `type:'status', expired:true` log event when a spell's damage wakes a
  sleeper** (mirroring what a natural-expiry tick does, `tactical.ts:822-839`) **so the player sees a
  "wakes up" narration line, not just a silent flag clear?** `resolveHit()`'s own existing precedent does
  **not** emit any such event for its own wake-on-hit clear (confirmed: `tactical.ts:1157-1168`'s
  ordinary-hit branch only pushes the `attack`/`slain` events, no `status` event for the wake) — so the
  minimal, precedent-matching fix above deliberately does the same (silent clear, no extra event),
  keeping parity with the sibling behavior exactly. A future round could consider adding narration to
  *both* siblings together, but that would be a new feature, not this round's parity fix.
- Standing candidates carried forward unchanged (not re-investigated this round, no new angle): the
  Turn-Undead `xpAwarded` gap RESOLVED (M78, do not re-flag) + the `applyFlee`/`applyMove` guard-reaction
  parity gap RESOLVED (M77, do not re-flag) + the `backstab`-on-miss gap RESOLVED (M76, do not re-flag)
  + the `addToParty()`/`addPlayer()` roster-gate gap RESOLVED (M75, do not re-flag) + the `apply()`
  return-value plumbing gap RESOLVED (M74, do not re-flag) + `logEvents()`'s miss-branch gap RESOLVED
  (M73, do not re-flag) + the `(Opportunity!)` combat-log tag CONFIRMED ALREADY SHIPPED (M72, do not
  re-flag) + `surrendered`'s distinct marker (M71, open team-preference question) + the guarding-bar 5th
  signal (M71) + `TacticalCombatant.int` (rules-fidelity gap, not pursued) + the feared/asleep colour
  tier (undecided) + `panelRows()`/`visibleCells()`'s duplicated `impaired` check (DRY cleanup) + the
  Abilities-panel precedent (none found) + DoK's Saves column (declined M62) + BASE_ITEMS' thin
  catalogue + DoK's xp/hitPoints byte-fields + DoK's runItemPluses e2e follow-up + the Class-label
  collision (38+ rounds unpicked) + dialogue/town day-wiring + `saveStore.ts`'s `listSlots()`/
  `SaveSummary` + `DetectionMatch` fields + flat-AC-10 CoK pregens + the wilderness moon-bar + the
  `DEMO_PARTY` edge case + `WILD_MENU`'s decorative bar + dual-class reactivation + the Con Save/Save
  Roll merge + `conSaveBonus` on DoK monsters + `DexterityMods.reaction` + the `DokEffect`/.EFF crosswalk
  + CoK's missing `.STF`/`.SFX` crosswalk + DRYDEN's Solamnic Plate Mail gap + `create.ts`'s
  preview-echo gaps + the Status row's duration/HD-cap + `itemCategory()`'s INFLICT preview +
  `MonsterWizSpell.learning` + the `hasted` buff indicator + `addToParty()`'s rejection-reason UX gap +
  case-folding for the name check + the bigger `addPlayer()`-reuse option + the missed-backstab
  wording/SFX/color follow-ups + `createCharacter()`'s permanently-unreachable import-path warnings +
  the hazard-kill/`checkMoraleSweep()` `move`/`flee` asymmetry (M78, unreachable in production, same
  status as this round's hazard/asleep sibling gap). Item-instance subsystem still 31-for-31 blocked.
  ECL-ally morale% remains RETIRED (M61).

## Implications for our engine

- **A general invariant stated once, broadly, in a shared type's doc comment is not self-enforcing
  across every function that could violate it — the same lesson M75 first drew, applied here to a
  *state-mutation* invariant rather than a validation gate.** `tactical.ts:109`'s "(and wakes `asleep`
  figures that take damage)" reads as an unconditional design rule; the engine actually only enforces it
  in one of three damage-application call sites. Any future audit of a broadly-worded doc-comment
  invariant in this file should check it against **every** structurally similar function, not assume
  the comment describes uniformly-enforced behavior.
- **This is a fresh sub-shape of the "sibling resolvers, shared low-level mechanism, inconsistent
  extra step" family (M77/M78's territory) — but one level more subtle: here the shared mechanism is
  the DATA the resolvers all read/write (`target.flags`), not a helper FUNCTION call they do or don't
  make.** `resolveHit()` and `applyCast()` both call the same `applyHpLoss()` for the HP side of the
  ledger, but only one of them treats "the target might currently be `asleep`" as something worth
  checking before doing so — an omission with no structural justification (unlike M78's cases, where the
  bypass itself was deliberate and only the side effect was missed).
- **A silent state-mutation gap (a stale flag) can be more consequential than a missing UI field or a
  missing log line, because it feeds a SEPARATE, already-shipped mechanical gate** (here: the
  `helpless`/coup-de-grace check) **that has no idea the flag is stale.** The bug isn't just "the target
  looks asleep when it shouldn't" — it's "a real instant-kill rule downstream treats the stale flag as
  ground truth." Worth treating any status flag with more than one downstream consumer (here: turn-skip
  AND coup-de-grace both read `asleep`) as higher-priority to audit for staleness than a flag with only
  one reader.
- **A prior round's finding about *event/narration plumbing* for a phenomenon (M74's `statusEndVerb()`
  gap) does not cover a finding about the underlying *state* for a related-but-distinct phenomenon** —
  M74 was about whether a real `expired`/`status` event reaches the UI; this round is about whether the
  underlying flag is even correctly cleared in the first place, for an entirely different code path
  (`applyCast()`'s damage branch has no `status`/`expired` event to plumb at all — it's a silent flag
  clear in the sibling that works correctly, `resolveHit()`, matching that sibling's own established,
  intentional no-event convention).
