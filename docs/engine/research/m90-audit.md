# M90 audit — the Temple's Heal/Raise Dead economy never adopted CT.7h's dead-vs-unconscious split (M89's #1 backlog item, confirmed still live)

> Audit method: read `docs/engine/research/m89-audit.md` in full first (mandatory first step), then
> worked the M90 brief's carried-forward backlog in priority order:
>
> 1. **The Temple's cheap-heal filter** (`apps/web/src/ui/town.ts:127`, `!m.down`) — brief's top
>    candidate. **Confirmed still live, byte-for-byte identical to M89's description.** Investigated one
>    layer deeper than M89 did (M89 flagged only the UI display filter as a "secondary observation," not
>    part of its fix) and found the *real* mechanism-level bug one file over: `apps/web/src/ui/party.ts`'s
>    `templeHealAll()`/`templeRaiseFirstDead()` — the actual functions the UI calls when a player selects
>    a Temple row — carry the identical, uncorrected `hp <= 0` conflation. Fixing only `town.ts`'s display
>    filter without these would be cosmetic (the display would show a price, but clicking it would still
>    silently fail to heal the unconscious member — see "Reachability" below for the exact proof). This
>    round's fix targets both layers together, mirroring M89's own 3-file (`gameClock.ts` + `party.ts` +
>    `explore.ts`) single-feature slice.
> 2. **Cure ('heal'-kind) spells** (`party.ts`'s `mostWoundedName`/`healMember`) — re-confirmed exactly as
>    M89 left it (`mostWoundedName` line 557 `if (s.hp <= 0) continue;`; `healMember` line 534 `if (!m ||
>    m.hp <= 0) return 0;`), still live, still a real gap. **Not folded into this round's fix** — different
>    subsystem (spellcasting, `magic.ts`), same reasoning M89 gave for not bundling it with the Rest fix.
>    Left as a standing candidate, now confirmed unchanged by a second round.
> 3. **`restPartyNatural()`/`planRest()` deletion question** — re-confirmed still unused (zero callers),
>    still the same code. Not touched; still a cleanup-only question, not behavioural.
> 4. **Long tail** (multiclass HP averaging, `neacailRejected`, DQK/DoK destination-race, `multiclassLevel`,
>    `canReachWithHeight`, `DexterityMods.reaction`, `sky.ts`/`dqkExplore.ts`) — all re-confirmed unchanged/
>    correctly-out-of-scope by M89 this same day; not re-litigated (M89's investigation of each was itself
>    a fresh, thorough pass, not a stale re-grep — no new angle emerged in the one day since).
>
> Housekeeping note: at session start, `docs/engine/research/m39-audit.md` (already committed elsewhere by
> a concurrent agent, per this project's async multi-agent mode) and a stray, never-cleaned-up
> `packages/engine/test/_scratch_m39_verify.test.ts` were both present untracked/orphaned in the working
> tree from an earlier incomplete round. The scratch file was deleted as routine hygiene (it was dead
> clutter, not part of this round's work); `git status --porcelain` was clean before this audit doc was
> added.

## Headline finding

**`templeHealAll()` and `templeRaiseFirstDead()` — the two functions the Temple screen actually calls —
never adopted CT.7h's own dead-vs-unconscious distinction, even though CT.7h (`1421bd6`, 2026-06-23)
edited `templeRaiseFirstDead()` in the very same commit that introduced the distinction, right next to
the line it should have fixed but didn't.** The result contradicts the original game's own byte-located
behaviour on both sides of the same screen: an unconscious (not dead) party member can never receive the
cheap, `HEAL_COST_PER_HP`-priced Temple heal (a real, working, correctly-priced recovery mechanism, but
gated to living-and-already-conscious members only), and instead gets happily "Raised from the Dead" for
the expensive, level-scaled fee — the *exact* case the original `START.EXE` itself is proven to print
`"is not dead"` and refuse (`docs/engine/research/disasm-spells-krynn.md:929`,
`Raise Dead refused on a living/standing target`).

## Existing sibling/precedent and the self-flagging evidence

M89 established the shape ("a correct fix landed on the wrong function") for Encamp → Rest. This round's
finding is the sibling M89 explicitly deferred: **CT.7h itself is the commit that half-fixed this screen and
half didn't**, which is a slightly sharper version of the M89 shape — not "the fix landed on an unused
sibling," but "the fix landed on *part of* the live function and skipped the other part, in the very same
diff hunk region."

`git show 1421bd6cf -- apps/web/src/ui/party.ts` (full diff, relevant hunk, current source unchanged since):

```diff
 export function templeRaiseFirstDead(): TempleRaiseResult {
   ...
   addGold(-cost);
   dead.hp = 1;
+  clearDead(dead.name); // Raise Dead lifts the permadeath flag (CT.7h)
   persist();
   return { ok: true, cost, name: dead.name };
 }

-/** Full rest: restore every member to maximum HP (simplified — no per-spell/turn memorisation yet). */
+/**
+ * Full rest: restore every member to maximum HP (simplified — no per-spell/turn memorisation yet).
+ * The **permadead** are left untouched (CT.7h) — only a Raise Dead brings them back, never bed rest.
+ */
 export function restParty(): void {
   let changed = false;
   for (const s of roster) {
+    if (deadStore.has(s.name)) continue;
```

CT.7h touched `templeRaiseFirstDead()` (added the `clearDead` call, so a genuine Raise Dead correctly
*clears* the flag on success) but left its **selection criterion** — a few lines above the diff, unchanged
— at `roster.find((s) => s.hp <= 0)`: *any* down member, dead or merely unconscious, still qualifies as
"the fallen member to raise." `templeHealAll()` (a different function in the same file, ~90 lines away)
was not touched by CT.7h **at all**: `git log -p -S "s.hp > 0).reduce" -- apps/web/src/ui/party.ts` → one
hit, the *original* A5.2 commit `b2cd1f0` (2026-06-22, one day *before* CT.7h even introduced the concept
of permadeath), never revisited since.

The self-flagging is the commit message itself, describing exactly the fix it should have made but
scoped narrowly to the two lines it touched: CT.7h's own message says *"a figure merely brought to 0 HP is
UNCONSCIOUS and revives on rest / a cure"* — one sentence before describing changes to `templeRaiseFirstDead`
that leave it still treating that exact figure as raise-eligible.

## Where the severance happens — exact locations, current source

**`apps/web/src/ui/party.ts:1090-1105`** (`templeHealAll`, current source, full):

```ts
/** Fully heal every wounded living member, paying per missing hit point (all-or-nothing). */
export function templeHealAll(): TempleHealResult {
  const missing = roster.filter((s) => s.hp > 0).reduce((sum, s) => sum + (s.maxHp - s.hp), 0);
  if (missing <= 0) return { ok: false, reason: 'nobody is wounded', healed: 0, cost: 0 };
  const cost = healCost(missing);
  if (getGold() < cost) return { ok: false, reason: 'not enough steel', healed: 0, cost };
  addGold(-cost);
  let healed = 0;
  for (const s of roster) {
    if (s.hp > 0 && s.hp < s.maxHp) {          // <-- excludes hp<=0: unconscious AND dead alike
      healed += s.maxHp - s.hp;
      s.hp = s.maxHp;
    }
  }
  persist();
  return { ok: true, healed, cost };
}
```

**`apps/web/src/ui/party.ts:1115-1126`** (`templeRaiseFirstDead`, current source, full):

```ts
/** Raise the first fallen member to 1 HP, paying the level-scaled fee. */
export function templeRaiseFirstDead(): TempleRaiseResult {
  const dead = roster.find((s) => s.hp <= 0);     // <-- matches unconscious too, not just deadStore
  if (!dead) return { ok: false, reason: 'nobody to raise', cost: 0 };
  const level = dead.classes[primaryClass(dead.classes)] ?? 1;
  const cost = raiseCost(level);
  if (getGold() < cost) return { ok: false, reason: 'not enough steel', cost, name: dead.name };
  addGold(-cost);
  dead.hp = 1;
  clearDead(dead.name); // Raise Dead lifts the permadeath flag (CT.7h)
  persist();
  return { ok: true, cost, name: dead.name };
}
```

**`apps/web/src/ui/town.ts:125-138`** (the Temple screen's row-building, current source, full — the layer
M89 already flagged, confirmed byte-identical this round):

```ts
case 'temple': {
  title = 'Temple of Mishakal';
  const wounded = partyStatus().filter((m) => !m.down && m.hp < m.maxHp);   // <-- !m.down, not !m.dead
  const missing = wounded.reduce((sum, m) => sum + (m.maxHp - m.hp), 0);
  const dead = partyStatus().find((m) => m.down);                           // <-- m.down, not m.dead
  const hCost = healCost(missing);
  lines = [
    { text: missing > 0 ? 'Heal the party' : 'Party is unwounded', price: missing > 0 ? hCost : undefined, color: missing > 0 && hCost <= gold ? undefined : TOWN_LINE_DISABLED },
    dead
      ? { text: `Raise ${dead.name}`, price: raiseCost(deadLevel(dead.name)), color: raiseCost(deadLevel(dead.name)) <= gold ? undefined : TOWN_LINE_DISABLED }
      : { text: 'No-one to raise', color: TOWN_LINE_DISABLED },
  ];
  menu = ['Select', 'Exit'];
  break;
}
```

The local variable is even *named* `dead` while being sourced from `.down` — the naming itself betrays the
intended semantics next to the code that gets it wrong, the same "the wrong invariant is written down in
plain English right next to the code" shape M87/M89 both already identified, one layer more literal here
(a variable name, not a comment or a test assertion).

## Reachable in real, ordinary, shipped play — static + dynamic proof

**Static reachability, the full real chain (identical trigger to M89's, same combat outcome, different
destination screen):** `apps/web/src/ui/combat.ts:737` (`finalize()`) → `applyCombatHp(state.combatants,
conditionOf)` marks any real fight's knocked-out-but-not-slain party member `down: true, dead: false` on
the roster (`party.ts:492-495`) — an entirely ordinary combat outcome. From exploration, `apps/web/src/ui/
play.ts:96` (`toTown: () => enterTown()`) is the real, shipped Encamp/travel → Town transition (the *other*
structurally-parallel destination from the same post-combat state M89 traced into Rest); `play.ts:48` calls
`startTown()` (`town.ts:352`), the only production entry point into the Temple screen. `grep -rn
"templeHealAll(\|templeRaiseFirstDead(" apps/web/src` → both have **exactly one call site each**, both in
`town.ts`'s `activate()` (temple mode) — there is no other, un-broken path to either function.

**Dynamic re-derivation this round** (scratch Node/tsx script, created, run, then deleted — see below),
against the real, current, unmodified `templeHealAll`/`templeRaiseFirstDead`/`partyStatus` production
functions in `apps/web/src/ui/party.ts` (imported directly via `tsx`, with a tiny in-memory `localStorage`
polyfill so the module's own try/catch-guarded persistence layer runs unmodified):

```
Sturm:    hp 30/40 (ordinary wounded, conscious)
Goldmoon: hp 0/30  (real "unconscious, not dead" shape — NOT added to deadStore)

partyStatus() before: Goldmoon = { down: true, dead: false }   // exactly the CT.7h-modelled shape

templeHealAll()  -> { ok: true, healed: 10, cost: 30 }          // Sturm only
partyStatus() right after templeHealAll(): Goldmoon.hp === 0    // UNCHANGED — the cheap heal never touched her

templeRaiseFirstDead() -> { ok: true, cost: 1500, name: 'Goldmoon' }   // wrongly "raises" a non-dead member
```

Paying the Temple's cheapest, correctly-priced healing option (30 steel for Sturm's 10 missing HP) leaves
Goldmoon — party member who is not dead, per the game's own `dead` flag — sitting at 0 HP; the *only* way
to bring her back is paying the level-scaled Raise Dead fee (1500 steel here) for a service the original
game's own `"is not dead"` string proves would have refused her.

## Verification evidence (this round's scratch script)

`apps/web/test/_scratch_m90_verify.mjs` (created, run via `npx tsx`, output matches the snippet above
exactly, then deleted). `git status --porcelain` confirmed clean except this doc afterward.

## Proposed minimal wiring plan (not applied this round)

Four small, additive edits, all in the same two files the bug lives in, none removing existing behaviour:

```ts
// sketch, not applied this round -- apps/web/src/ui/party.ts

/** Fully heal every wounded living member, paying per missing hit point (all-or-nothing). Members
 *  merely unconscious (hp <= 0 but not in deadStore) ARE wounded-and-healable here (CT.7h) — only the
 *  permanently dead are excluded; they need Raise Dead, not this. */
export function templeHealAll(): TempleHealResult {
  const missing = roster
    .filter((s) => !deadStore.has(s.name))                      // was: s.hp > 0
    .reduce((sum, s) => sum + (s.maxHp - s.hp), 0);
  if (missing <= 0) return { ok: false, reason: 'nobody is wounded', healed: 0, cost: 0 };
  const cost = healCost(missing);
  if (getGold() < cost) return { ok: false, reason: 'not enough steel', healed: 0, cost };
  addGold(-cost);
  let healed = 0;
  for (const s of roster) {
    if (!deadStore.has(s.name) && s.hp < s.maxHp) {              // was: s.hp > 0 && s.hp < s.maxHp
      healed += s.maxHp - s.hp;
      s.hp = s.maxHp;
    }
  }
  persist();
  return { ok: true, healed, cost };
}

/** Raise the first PERMANENTLY DEAD member to 1 HP, paying the level-scaled fee. A merely-unconscious
 *  member is never eligible here (CT.7h; the original engine's own "is not dead" refusal,
 *  disasm-spells-krynn.md:929) — they heal via templeHealAll/rest/a cure instead. */
export function templeRaiseFirstDead(): TempleRaiseResult {
  const dead = roster.find((s) => deadStore.has(s.name));        // was: s.hp <= 0
  if (!dead) return { ok: false, reason: 'nobody to raise', cost: 0 };
  ...
}
```

```ts
// sketch, not applied this round -- apps/web/src/ui/town.ts, inside buildView()'s 'temple' case
const wounded = partyStatus().filter((m) => !m.dead && m.hp < m.maxHp);   // was: !m.down
const missing = wounded.reduce((sum, m) => sum + (m.maxHp - m.hp), 0);
const dead = partyStatus().find((m) => m.dead);                          // was: m.down
```

Notes on the sketch:
- `deadStore` is already a module-private variable in `party.ts`, already read the identical way by
  `restParty()`/`restPartyTicks()`/`healMember` in the same file (post-M89) — no new export or plumbing.
- `partyStatus()`'s `s.dead` field already exists and is already imported/read by `town.ts` (it's the
  adjacent, unused sibling of the very field the current code reads) — the fix swaps one identifier for
  another already in scope, it doesn't add a new dependency.
- **The existing e2e fixture bakes in the wrong invariant and must be rewritten, not just left passing**
  (mirrors the exact M86/M89-established "the test itself certifies the wrong behaviour" pattern):
  `apps/web/test/e2e.mjs:3770-3787` sets `Goldmoon.hp = 0` directly via `localStorage` (never adding her
  to `greybox.dead.cok`, i.e. she is the real "unconscious, not dead" shape) and its own comment calls
  this **"fell Goldmoon"** — then asserts `heal.healed === 10` (Sturm only, Goldmoon excluded) and
  `raise.ok === true && raise.name === 'Goldmoon'` (the wrong-target "success"). Post-fix, the correct
  fixture needs two distinct cases: (a) Goldmoon unconscious (hp=0, not in deadStore) → included in
  `templeHealAll`'s `healed`/`cost`, and `templeRaiseFirstDead()` returns `{ok:false, reason:'nobody to
  raise'}` since nobody is truly dead; (b) a *separate* genuinely-dead member (seed `greybox.dead.cok`
  directly, or drive a real overkill combat per CT.7h's own `dmg>=hp+10` rule) to exercise the Raise Dead
  path correctly. This is a deliberate, visible test rewrite (the fixture's own inline comment needs to
  stop calling a merely-unconscious `hp:0` object "fell"/dead), not a silent patch.
- No new persistence key or type change needed — this is purely which existing flag (`hp<=0` vs.
  `deadStore.has`/`.dead`) each of four call sites reads.

## Secondary observations not part of this round's fix

- **Cure ('heal'-kind) spells — re-confirmed unchanged, still a standing candidate.**
  `apps/web/src/ui/party.ts:553-561` (`mostWoundedName`, `if (s.hp <= 0) continue;`) and `party.ts:532-540`
  (`healMember`, `if (!m || m.hp <= 0) return 0;`) still mean a memorized Cure spell can never target or
  heal an unconscious member, exactly as M89 described. `reviveMember`/`firstDeadName` (the `revive`-kind
  path) remain correct as-is (no `deadStore` check on eligibility, matching the original engine's actual
  need — any hp≤0 target). Left for a future round; different subsystem (`magic.ts` spellcasting), same
  reasoning M89 and this round both give for not bundling it in.
- **`deadLevel()` (`town.ts:183-188`)** — used only for the raise-dead fee display; unaffected by this
  fix's field swap (still reads `getParty()`/`sheet.classes`, not `down`/`dead`), no change needed.
- **The original game's exact Temple pricing for an unconscious member remains partly UNKNOWN.** CT.7h's
  own commit message says plainly: *"the temple economy beyond 'dead needs Raise Dead' stays cross-overlay
  UNLOCATED + labelled"* (disasm-spells-krynn.md:947-950) — i.e. whether the *real* CoK temple actually
  charges `HEAL_COST_PER_HP` per missing point for an unconscious member specifically (vs., say, a flat or
  different fee), or whether "revives on rest / a cure" (line 917) implies the Temple's *paid* heal option
  was never the original's intended unconsciousness-recovery path at all, is genuinely **UNKNOWN** — only
  the *Raise Dead refusal* side (`"is not dead"` @ `0x57a6`) is byte-proven. This round's proposed fix
  routes an unconscious member through the *existing*, already-modelled `templeHealAll` pricing (the same
  candidate-tuning-value economy `town/services.ts`'s own file doc already labels "CANDIDATE tuning values,
  isolated here for a later oracle pin") rather than inventing a new price tier — the lowest-risk, most
  internally-consistent choice given the UNKNOWN, not a claim that the exact steel figure is byte-verified.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| Fix only `town.ts`'s display filter, leave `party.ts` untouched | Would be cosmetic: the Temple row would show a price and go green, but clicking it calls the unfixed `templeHealAll()`, which still silently drops the unconscious member from its own internal `missing`/heal-loop filter. Confirmed by tracing both layers, not assumed. |
| Fold the Cure-spell gap into this same fix | Different file/subsystem (`magic.ts` spellcasting, not the Temple/town screen); mirrors M89's own precedent of not bundling `sky.ts` into the Rest fix for the identical reason. Left as a standing candidate. |
| Leave `templeRaiseFirstDead()`'s selection as `hp<=0` and only fix `templeHealAll()` | Rejected: doing so would still let an unconscious member appear (and succeed) under "Raise X" even after the cheap heal option correctly includes them too — a player could still overpay via Raise Dead by mistake, and the screen would offer both a cheap and an expensive option for the exact same target, which the original engine's own `"is not dead"` refusal proves shouldn't be possible for a non-dead target. Both functions need the fix together for internal consistency. |
| Re-derive the "correct" Temple price for unconscious members from a fresh disassembly pass | Out of scope for an audit round (would require new offline-executable RE work, not a wiring fix); CT.7h's own commit already labels this UNLOCATED. Using the existing, already-shipped `templeHealAll` pricing for all non-dead members is the lowest-risk choice available today. |

## Open questions / unknowns

- **Exact original-game steel cost for reviving an unconscious member via the Temple is UNKNOWN** (see
  "Secondary observations") — only the Raise Dead *refusal* string is byte-proven; the *positive* cost
  for the unconscious-heal case has no located string/routine yet. This round's fix reuses the existing,
  already-shipped `HEAL_COST_PER_HP` pricing rather than inventing a new figure, which is a design choice,
  not a verified fact.
- **Should the Cure-spell gap (`mostWoundedName`/`healMember`) be fixed in the same slice as this one, or
  kept separate?** Left open per M89's own precedent (separate subsystem); a future round could pick it up
  directly per the M88-established "pick up a deferred sibling directly" guidance.
- **The e2e fixture rewrite is a prerequisite, not an afterthought** — an implementation round must not
  ship this fix with the existing `apps/web/test/e2e.mjs:3770-3787` assertions untouched, since they encode
  the exact wrong behaviour as a passing green test (see "self-flagging" and the sketch's notes).

## Implications for our engine / for the taxonomy

- **A refinement of M89's "fix landed on the wrong sibling" shape: here the fix landed on *part of* the
  actual live function, in the same diff hunk region, and skipped the rest.** CT.7h touched
  `templeRaiseFirstDead()` — the correct, live function — in the same commit that introduced the concept
  it needed, added the *consequence* of the fix (`clearDead` on success) but never touched the *eligibility
  gate* just above it. This is subtly different from M89 (where the fix landed on an already-dead,
  zero-caller sibling): here the fix partially landed on the *right* function and still missed half of it.
  Worth adding to the taxonomy as its own sub-case: **"a function received half of a same-commit fix — its
  side-effect was corrected but its gate/selection criterion, right next to it, was not."**
- **A byte-proven *refusal* string can double as a specification for what a reimplementation should NOT
  allow, not just what it should print.** `"is not dead"` (@0x57a6) is normally read as "the flavour text
  when Raise Dead is refused," but it is equally strong evidence for *which inputs the original mechanism
  gates on* — i.e. it's a spec fact hiding in what looks like pure UI string data. Worth flagging for future
  audits: byte-located error/refusal strings are worth checking as implicit eligibility specs, not just
  flavour text to reproduce cosmetically.
- **The same root conflation can spawn multiple, file-adjacent-but-distinct instances that a narrow first
  fix won't catch.** M89 fixed the Rest path; this round found the *identical* conflation, independently,
  in the Temple path, in a function CT.7h itself edited (partially) the same day it fixed Rest's sibling
  (`restParty()`). A single root cause ("some functions never got the CT.7h memo") can spawn a small family
  of near-identical, independently-discoverable findings across several rounds — this loop should keep
  checking `grep -n "hp <= 0\|hp > 0" apps/web/src/ui/party.ts` for remaining untouched call sites even
  after this round's and M89's fixes both ship (the Cure-spell pair is the next, already-flagged instance).
