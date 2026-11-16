# M83 audit — the next "computed but unwired" candidate

> Audit method: per requirement #4, checked the carried-forward backlog first. Spent most of this
> round's effort on a promising-looking ECL lead (`DialogueRunner.afterCombat()` / `runEclChain`'s
> `autoCombat` handler both hardcode `resume()`'s `combatOutcome` to the conservative default, exactly
> like M82's `partyStrength` shape) — traced it all the way to two real, disassembly-confirmed DQK
> `COMBAT → IF_EQ("YOU WON!!!") / IF_NE("YOU LOST!!!")` sites (areas 2 and 3 of `ECL.GLB`) — but a
> rigorous **dynamic** re-check this round (not just the static "walk-reachable from all 5 header
> entries" BFS proof from a preliminary pass) showed neither site is actually reached under the real
> per-step (`vmRun1`/`searchLocation`, all real cells of area 2's GEO map) or real area-init
> (`runAreaEcl()`'s own seed memory) code paths a real player's session takes — area 2's own real
> branch (`byte 61` → `GOSUB 1349`, "SELECT THE COMBAT WALL TYPE:") is a *different*, legitimate,
> already-documented mechanic that never reaches the WON/LOST block, and area 3 has no GEO map at all
> (not a walkable level). This matches the original disassembly research's own "(debug arena)" label
> for area 2's `LOAD_MONSTER` site (`combat-trigger-c4.2b-2b-2b.md:142`) — i.e. this specific game-data
> lead is a dead end for real play, so it was **rejected as this round's headline** per requirement #2
> (full production reachability must be traced, not just claimed) even though the underlying code
> defect (`resume()`'s `combatOutcome` unsupplied by 2 of its 3 real callers) is genuinely real and is
> recorded below as a standing candidate. Pivoted to a fresh hunt of `referenceDb.ts`'s
> `monsterCategory()` — the exact function M37/M38/M55/M56/M65 have each independently extended to
> surface one more already-consumed `MonsterRecord` field — cross-referenced against M81's `Int` fix
> (shipped one round after M38 last touched this function) and found a genuine miss, quantified with a
> new, more exhaustive row-budget measurement than M38's own spot-check.
>
> ---
>
> **CHECKED AGAINST THE §29 CORRECTION - 2026-08-20 (fidelity-plan section 29, commit `df69707`).**
> That correction stripped a 2-byte big-endian length word from every `MONCHA.GLB` member and moved
> every DQK record's contents; it does **not** touch this memo's headline, whose whole evidence base
> is Gen1 `MON{n}CHA.DAX` (CoK `MON1/2/3CHA`, DoK `MON1CHA`). Re-verified on this pass against the
> real archives: GOBLIN int 10 / morale 0, SKELETON int 3 / morale 100 (CoK `MON1CHA`), LICH int 10
> and VAMPIRE MAGE int 10 / morale 100 (DoK `MON1CHA`) - all four rows below still read exactly as
> written, and the `[9, 10, 11, 12]` row-count distribution was measured over the same Gen1 corpus,
> so it stands. Two secondary references did need correcting; both are tagged **[§29 2026-08-20]**
> inline: the `MONCHA.GLB` half of the step-1 data-path claim, and the M38 row-budget sample record
> (`BAKAI SHAMAN`, which is really `BAKALI SHAMAN` and is a bestiary monster, not an NPC).

## Headline finding

### A real monster's decoded Intelligence score already decides a live tactical-combat outcome (surrender vs. rout, wired by M81) in every real fight where morale breaks — but the one player-facing panel that exists specifically to surface `MonsterRecord`'s other combat-relevant fields (`referenceDb.ts`'s `monsterCategory()`, extended five times already for exactly this purpose) still never shows it; a naive fix would also silently truncate an existing row for several real monsters already sitting at the panel's row cap

## The real, decoded fact: every monster's Intelligence score, genuinely variable, already wired to a real mechanic one round ago

`packages/engine/src/loaders/monster.ts:145-152` — `MonsterAbilities` (all six fields **required**, not
optional):

```ts
export interface MonsterAbilities {
  str: number;
  int: number;
  wis: number;
  dex: number;
  con: number;
  cha: number;
}
```

`packages/engine/src/loaders/monster.ts:187` — `MonsterRecord.abilities: MonsterAbilities` — also
required (non-optional), so every decoded monster, in every game, always carries a real `int` value.

Confirmed via this round's own scratch decode of the real, shipped archives (not synthetic data):

| Monster | Game | `abilities.int` | `morale` | Consequence under M81's split |
|---|---|---|---|---|
| GOBLIN | CoK `MON1CHA.DAX` | **10** | 0 (never checks) | n/a (never breaks) |
| SKELETON | CoK `MON1CHA.DAX` | **3** | 100 | dumb (`≤5`) → **routs** (`flee`) |
| LICH | DoK `MON1CHA.DAX` | **10** | 100 | smart (`>5`) → **surrenders** |
| VAMPIRE MAGE | DoK `MON1CHA.DAX` | **10** | 100 | smart (`>5`) → **surrenders** |

This is exactly the "genuinely variable across real monsters" shape the loop requires (SKELETON=3 vs.
LICH=10), not a constant that would make the fact uninteresting.

## The real, already-implemented, already-tested, already-shipped consumer (M81, `c479895`)

`packages/engine/src/combat/tactical.ts:899-911` (`moraleBreakOf`, current source, unchanged since M81):

```ts
/** Resolve a monster's morale outcome (CT.6). Party/undead/constructs (no `morale`) never break. */
function moraleBreakOf(c: TacticalCombatant): MoraleBreak {
  if (c.side !== 'enemy' || c.morale === undefined || !isActive(c)) return null;
  const score = Math.min(MORALE_CLAMP, c.morale);
  const personallyBroken = score < pctLost(c);
  const teamBroken = score < sidePctLost(c.side);
  if (!personallyBroken && !teamBroken) return null;
  // ovr010 `FleeCheck_001`: on a break a smart monster (`Int > 5`) **Surrenders**, a dumb one (`Int ≤ 5`)
  // just **routs** (panic flee). When no `int` is supplied we keep the legacy split ...
  if (c.int !== undefined) return c.int > 5 ? 'surrender' : 'flee';
  return personallyBroken ? 'flee' : 'surrender';
}
```

The full real production data path, confirmed by re-reading every hop this round:

1. `packages/engine/src/loaders/monster.ts:374` — `decodeMonsterRecord()` populates `abilities` (incl.
   `.int`) for every real `MON{n}CHA.DAX`/DQK `MONCHA.GLB` record, unconditionally. **[§29
   2026-08-20: precise for the Gen1 `.DAX` path. On the DQK side the decoder is `moncha.ts`, not
   `decodeMonsterRecord()`, and "every record" means every record that becomes a `MonsterRecord` at
   all: after the correction that is **86 of `MONCHA.GLB`'s 98 members** (76 monster-framed + 10
   NPC-framed; it was 46 under the shifted decode). The remaining 12 stay roster-only - name and
   category, no ability block - so they never reach `monsterCategory()` and never need an `Int` row.
   Every `MonsterRecord` that does reach it carries a real `.int`, which is what step 1 is
   load-bearing for.]**
2. `packages/engine/src/combat/combat.ts:353` — `monsterCombatant()`: `int: mon.abilities?.int` (M81's
   fix — the shared function every real encounter spawn path calls).
3. `packages/engine/src/combat/encounter.ts:59` — `spawnEnemies()` (the shared front half used by both
   the auto-resolve path and the interactive combat screen, per its own doc comment lines 43-45) calls
   `monsterCombatant(rec, ...)` where `rec: MonsterRecord` always has `.abilities.int` populated —
   confirmed this round, no gap at this call site.
4. `apps/web/src/ui/combat.ts:342-343` — `makeTC()`: `return { ...c, ... }` spreads the `Combatant`
   (including `.int`) straight into the live `TacticalCombatant`, so `.int` survives to the real fight
   with zero extra code (M81's own wiring choice).
5. `packages/engine/src/combat/tactical.ts:909` — `moraleBreakOf()` reads `c.int` and picks
   `'surrender'` vs `'flee'`.

Reachability of step 5 itself (morale breaking at all) is a core, constant CT.6 mechanic — confirmed
already-shipped and exercised in essentially every real fight where a side takes meaningful damage, not
a rare edge case.

## The panel this fact never reaches, despite being repeatedly extended for exactly this shape

`apps/web/src/ui/referenceDb.ts:92-156` (`monsterCategory()`, current source) — the row list built for
every monster, reproduced here with the round that added each conditional row:

```
AC · HD · THAC0 · HP · Damage · XP · Morale · Size · Class      (base 9, always shown)
[Level]        — M37 (DQK NPC class/level)
[Save]         — M38 (savingThrows.spell)
[Save Roll]    — M65 (conSaveBonus)
[Regen]        — M43 (regenPerRound)
[Half Dmg]     — M43 (halfDamage)
[Spells]       — M55 (castableSpellCount)
[Bonus XP]     — M56 (lootBonusXp)
```

Every one of these seven conditional rows exists **specifically** to surface a `MonsterRecord`/
`Combatant` field that already drives some real combat mechanic elsewhere, mirroring exactly what this
round's `Int` fact needs. `abilities`/`.int` is never read anywhere in this file — confirmed by grep
this round: `grep -n "abilities" apps/web/src/ui/referenceDb.ts apps/web/src/ui/companionPanel.ts` →
zero hits in both.

`apps/web/src/ui/companionPanel.ts:42,367` confirms this is not a standalone-view-only gap: the in-play
**Companion Panel** (reached from a live CoK/DoK or DQK session — `explore.ts`'s and `dqkExplore.ts`'s
own bestiary feed, per the doc comment at `referenceDb.ts:46-49`) calls the exact same
`monsterCategory()` function with live session data. One fix point covers both real surfaces.

## Why this wasn't already picked up (grep evidence against every prior round)

- **M38** (`docs/engine/research/m38-audit.md:215`) is the only prior round that ever considered
  `MonsterRecord.abilities` for this panel — and explicitly rejected it, but for **all six** ability
  scores as a block, and *before* any of them had a real combat consumer beyond `.con` (feeding
  `conSpellSaveBonus`, a different mechanism, already shown via the `Save Roll` row). At the time of
  M38, `.int` itself had **zero** consumers — M81 (one round later, `c479895`) is what gave it one.
- **M82** (`docs/engine/research/m82-audit.md:389`) re-checked "`TacticalCombatant`'s other five
  ability scores" and confirmed they still have zero consumers — correctly re-confirming the rejection
  for `str`/`wis`/`dex`/`con`/`cha`, but never re-evaluated `.int` **alone** against the row budget now
  that it (uniquely among the six) has a real mechanism. No round between M81 and M83 revisited this.
- `grep -rln "abilities.int\|MonsterRecord.abilities" docs/engine/research/m*-audit.md` → only
  `m24`, `m38`, `m39`, `m81`, `m82` mention it at all; none proposes or ships a Reference-DB/Companion
  Panel `Int` row.
- `git log --oneline -S "abilities" -- apps/web/src/ui/referenceDb.ts` → **zero commits** — this file
  has never touched `abilities` at all, confirming the omission was never a deliberate, applied
  decision, only a never-revisited audit-doc rejection whose premise (no consumer) changed one round
  later.

## A row-budget interaction this round found that a naive fix would get wrong

`packages/engine/src/render/referenceDb.ts:70-72`:

```ts
/** Visible rows in the name list (rows 4..16). */
export const REFERENCE_DB_LIST_ROWS = 13;
/** Visible rows in the detail sheet (rows 5..16). */
export const REFERENCE_DB_DETAIL_ROWS = 12;
```

and line 118: `const drows = Math.min(REFERENCE_DB_DETAIL_ROWS, v.detail.length);` — rows beyond the
12th are **silently dropped**, not scrolled or wrapped.

M38's own "Probe 5" (`m38-audit.md:131-146`) sampled two records (GOBLIN, BAKAI SHAMAN) and found
"1-2 rows of headroom" under the cap. **[§29 2026-08-20: that second sample record does not exist -
`BAKAI SHAMAN` is a mis-decode of `BAKALI SHAMAN`, is-monster flag 1 at offset `0x66`, a 9-hit-dice
bestiary monster rather than an NPC, so it never carried the `Level` row the probe counted. M38's
corrected DQK-NPC sample is `GNOME WARRIOR` (member 68). This does not weaken the argument below -
if anything it sharpens it, since the two-sample probe turns out to have mis-identified one of its
two samples on top of under-measuring the ceiling.]** This round replicated that probe **exhaustively** — every real
monster in CoK `MON1/2/3CHA.DAX` and DoK `MON1CHA.DAX`, joined with every real side table
(`MON{n}SPC/ITM/WIZ.DAX`, matching what a real dungeon load actually does) — and found the true
real-world ceiling is already **12** (the cap itself, zero headroom), for CoK's and DoK's real undead:

```
CoK/MON1/SKELETON: 12 rows (AC,HD,THAC0,HP,Damage,XP,Morale,Size,Class,Save,Save Roll,Regen)
CoK/MON1/ZOMBIE: 12 rows (same shape)
CoK/MON2/ZOMBIE, SKELETAL KNIGHT, SKELETAL DRAGON: 12 rows (same shape)
CoK/MON3/ZOMBIE, SKELETAL KNIGHT: 12 rows (same shape)
```
(full distribution across all 152 real records scanned: `[9, 10, 11, 12]`, no record currently exceeds
12 — but several already sit exactly at it).

Since `abilities.int` is **unconditional** (always defined, unlike every other conditional row above),
naively appending an `Int` row would push these SKELETON/ZOMBIE/SKELETAL KNIGHT/SKELETAL DRAGON records
to **13** rows — silently truncating whichever row ends up last in the array for those records. This
would be a second, self-inflicted silent-drop bug introduced by fixing the first one, for exactly the
monsters (mindless undead, `int ≤ 3`) where the new fact is most narratively pointed (SKELETON's
`int=3` is the concrete counter-example to GOBLIN's `int=10`, and is also the row-budget worst case).

Checked whether the cap has real headroom: `render/referenceDb.ts:126` draws `v.status` at
`rowY(22)`, and the menu bar at `rowY(24)` — rows 17-21 (5 rows) are genuinely unused screen space
between the current cap (row 16) and the status line (row 22). Bumping `REFERENCE_DB_DETAIL_ROWS` from
12 to 13 is a real, low-risk, unused-space fix, not a cosmetic overlap risk.

## Reachable in real, ordinary, shipped play — traced end to end

1. Any real fight where an enemy monster has `morale` defined (most non-undead, non-construct
   monsters) and takes enough damage/team losses to trigger CT.6's break check — an ordinary,
   frequent combat event, not an edge case.
2. `moraleBreakOf()` reads `c.int` (real, always-decoded data, per the table above) to choose
   surrender vs. flee — already shipped, already unit-tested (M81).
3. A player who opens the Companion Panel (in any real CoK/DoK/DQK session) or the standalone
   `?refdb=1` Reference DB to check a monster's stats before or after a fight sees AC/HD/THAC0/HP/
   Damage/XP/Morale/Size/Class/[Level]/[Save]/[Save Roll]/[Regen]/[Half Dmg]/[Spells]/[Bonus XP] — but
   never the one number (`Int`) that already, silently, decided whether that exact monster would flee
   or surrender when routed.

## Verification evidence (this round's scratch test)

Built and ran (then deleted, per this loop's standing discipline — confirmed via `git status
--porcelain` clean before and after) `packages/engine/test/_scratch_m83_verify.test.ts` across four
iterations:

1. Confirmed `MonsterAbilities`/`MonsterRecord.abilities` are non-optional (every decode always
   populates `.int`).
2. Decoded real GOBLIN/SKELETON (CoK `MON1CHA.DAX`) and LICH/VAMPIRE MAGE (DoK `MON1CHA.DAX`),
   printing real `int` values (3, 10, 10, 10 respectively) — see table above.
3. Reproduced `monsterCategory()`'s exact row-building logic against every real monster in CoK
   `MON1/2/3CHA.DAX` and DoK `MON1CHA.DAX`, joined with every real side table
   (`applyRegenAffect`/`applyHalfDamageAffect`/`applyConSavingBonus`/`applyItemPluses`/
   `applyPreparedSpellIds`) exactly as a real dungeon load performs the join — found the real
   distribution `[9, 10, 11, 12]` with several real records (undead) already at the 12-row cap.
4. Confirmed `grep -n "abilities"` finds zero hits in `referenceDb.ts`/`companionPanel.ts`, and
   `git log -S "abilities" -- apps/web/src/ui/referenceDb.ts` returns no commits.

(An earlier scratch line of investigation this round — a control-flow-aware BFS + full dynamic
re-execution of DQK's `ECL.GLB` areas 2/3, checking whether `resume()`'s never-supplied
`combatOutcome` parameter (`world/dialogue.ts:99`, `ecl/program.ts:104`) has a reachable real
consequence — was also run and discarded as a headline candidate per the note at the top of this
document; the scratch file covering both investigations was a single file, iteratively rewritten, and
is deleted as of this document's completion.)

## Wiring plan (proposed, not applied this round)

1. **`packages/engine/src/render/referenceDb.ts:72`** — bump `REFERENCE_DB_DETAIL_ROWS` from `12` to
   `13` (real spare screen rows 17-21 exist before the status line at row 22; confirmed above).
2. **`apps/web/src/ui/referenceDb.ts`**, `monsterCategory()` — insert one unconditional row right after
   the base 9 (before `Level`/`Save`/etc., since `.int` is always defined, unlike every row that
   follows it):
   ```ts
   { label: 'Int', value: `${m.abilities.int}` },
   ```
   placed early (not appended at the tail after every conditional row) so that, if a future record ever
   does exceed 13, a low-priority conditional bonus row (e.g. `Bonus XP`) truncates first rather than
   this new, always-meaningful stat.
3. Extend the existing e2e detail-row scans (`apps/web/test/e2e.mjs:743-766` `goblinDetail`/
   `skeletonDetail`, `:1930-1945` `bakaiDetail` — the exact precedent M38 used) with one more
   assertion each, e.g. `goblinDetail.some(r => r.label === 'Int' && r.value === '10')` and
   `skeletonDetail.some(r => r.label === 'Int' && r.value === '3')`, plus a new assertion confirming
   SKELETON's now-13-row detail array is no longer silently truncated (i.e., `Regen` still appears).
4. No engine-package change beyond the render constant — the underlying data (`MonsterRecord.abilities.
   int`) and consumer (`moraleBreakOf`) are both already shipped (M81); this round's gap is purely in
   the UI layer plus one rendering-budget constant.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **DQK `ECL.GLB` areas 2/3's `COMBAT → IF_EQ/IF_NE("YOU WON!!!"/"YOU LOST!!!")`, fed by `resume()`'s never-supplied `combatOutcome`** | Real code defect (`world/dialogue.ts:99`'s `afterCombat()` and `ecl/program.ts:104`'s `autoCombat` handler both hardcode `resume()` with no outcome, so the compare-flags register is always the conservative default) — but this round's own rigorous dynamic re-check (full per-cell `vmRun1`/`searchLocation` walk of area 2's real GEO map, plus a full straight-line disassembly from `eclInitialEntry`) showed neither real production path (`runAreaEcl()`'s cold-boot run nor `fireSearchLocation()`'s per-step run) ever reaches these specific two sites; area 2's real branch there is the (already-documented) "SELECT THE COMBAT WALL TYPE" menu, and area 3 has no GEO map (unwalkable). Matches the original research's own "(debug arena)" label. Rejected as unreachable per requirement #2 — recorded as a standing candidate below, not this round's headline. |
| **Wiring all six ability scores, not just Int** | Re-confirmed (again) via grep: only `.int` (`moraleBreakOf`) and `.con` (`conSpellSaveBonus`, already shown via `Save Roll`) have any real consumer anywhere. `str`/`wis`/`dex`/`cha` remain speculative — not proposed, matching M81/M82's own prior scoping. |
| **`SURPRISE`(0x23)/`PARTY_SURPRISE`(0x22) unimplemented ECL opcodes** | Confirmed still unhandled (fall to `vm.ts`'s `default:` case, pushing an `'unhandled'` effect) — but `grep -rn "unhandled" apps/web/src` shows **zero** production consumers of `EclEffect{type:'unhandled'}` at all, for ANY of the dozens of opcodes that hit this path (not specific to SURPRISE) — too broad/already-self-aware ("surfaced and skipped so the script still runs to completion deterministically", `vm.ts:621-622`) to be this round's granular pick. |
| **`applyHazardTo()`'s asleep-wake gap** | Re-confirmed still unreachable: the only real hazard in production (`apps/web/src/ui/combat.ts:450-453`, the `?combat=1` demo web patch) has `status` only, no `.damage` — unchanged since M79 first rejected this for the same reason. |
| **`AuthoredMonster`'s missing `abilities`/Int field** | Re-confirmed zero callers of `authoredMonsterCombatant()` anywhere in `apps/web/src` (module-authoring path not yet UI-wired) — same M81/M82 scoping, still out of reach of production. |

## Open questions / unknowns

- Whether `Int` should also gate anything else in tactical combat (e.g. a smarter AI targeting
  heuristic) beyond the surrender/rout split — **UNKNOWN**, out of scope for a display-only fix.
- Whether the row-budget bump (12→13) should instead be solved by a scrollable detail pane (a bigger
  UI feature) rather than a one-row cap increase — flagged, not pursued; the cap bump is the minimal
  additive fix consistent with this loop's scope.
- The rejected ECL `combatOutcome` finding (`resume()` never supplied by `DialogueRunner.afterCombat()`
  or `runEclChain`'s `autoCombat`) remains a **real, unfixed code-level gap** — it simply has no known
  *currently reachable* real game-data consequence. If a future round locates a DIFFERENT real ECL site
  (any game, any area) with an `IF_*` genuinely reached after a real `COMBAT` pause under real seed
  memory, this fix should be revisited. Not re-litigated further this round.
- Whether area 2's `GOSUB 1349` "SELECT THE COMBAT WALL TYPE:" menu (real, confirmed reachable, ends in
  `LOAD_FILES`+`EXIT`) itself has any further unwired consequence in `dqkExplore.ts` — not investigated
  this round; noted as a loose thread from the rejected candidate above.
- Standing backlog, re-confirmed untouched this round (carried forward verbatim from M82, still
  correctly parked): `TacticalCombatant`'s other five ability scores (no consumer) + `AuthoredMonster`'s
  Int gap (no caller) + `surrendered`'s distinct marker (open team-preference question) + the
  guarding-bar 5th signal + the feared/asleep colour tier + `panelRows()`/`visibleCells()`'s duplicated
  `impaired` check (DRY cleanup) + DoK's Saves column (declined M62) + BASE_ITEMS' thin catalogue +
  DoK's xp/hitPoints byte-fields + DoK's runItemPluses e2e follow-up + the Class-label collision
  (40+ rounds unpicked now) + dialogue/town day-wiring + `saveStore.ts`'s `listSlots()`/`SaveSummary` +
  `DetectionMatch.series`/`.ruleset`/`.engineGen` + flat AC-10 CoK pregens + the wilderness moon-bar +
  the `DEMO_PARTY` edge case + `WILD_MENU`'s decorative bar + dual-class reactivation + the Con
  Save/Save Roll merge + `conSaveBonus` on DoK monsters + `DexterityMods.reaction` + the `DokEffect`/
  `.EFF` crosswalk + CoK's missing `.STF`/`.SFX` crosswalk + DRYDEN's Solamnic Plate Mail gap +
  `create.ts`'s preview-echo gaps + the Status row's duration/HD-cap + `itemCategory()`'s INFLICT
  preview + `MonsterWizSpell.learning` + the `hasted` buff indicator + `addToParty()`'s rejection-reason
  UX gap + case-folding for the name check + the bigger `addPlayer()`-reuse option + the missed-backstab
  wording/SFX/colour follow-ups + `createCharacter()`'s permanently-unreachable import-path warnings +
  the hazard-kill/`checkMoraleSweep()` move/flee asymmetry (unreachable) + `applyHazardTo()`'s
  asleep-wake gap (unreachable, re-confirmed this round) + a "wakes up" log event for spell-caused wake
  (deliberately deferred) + `legalActions()`'s unconditional guard/wait/endTurn/delay push ignoring
  `feared` (defense-in-depth, deliberately deferred) + a "panics and flees!" narration distinct from an
  ordinary flee (cosmetic, still open) + the "can't escape ⇒ flee regardless of Int" morale gate (needs
  movement-range comparison, larger follow-on) + `AuthoredMonster`'s stale doc comment (flagged, not
  fixed) + `RunChainOptions`'s Gen1 type-consistency widening (flagged, not urgent) + `SURPRISE`(0x23)
  unimplemented (re-confirmed this round, too broad to pick alone) + the best party-strength proxy
  formula (still open). Item-instance subsystem still 31-for-31 blocked. ECL-ally morale% remains
  RETIRED (M61). `classFlags.ts`'s dual-class item-gating remains correctly dead. `combat.ts`/
  `combatStepper.ts`'s positionless engine remains dead code.

## Implications for our engine

- **A rejection's premise can expire silently.** M38 rejected showing any of `MonsterRecord.abilities`
  because none of the six fields (bar `.con`, already shown differently) had a real consumer, and
  showing all six wouldn't fit the row budget anyway. M81, one round later, gave exactly one of those
  six (`.int`) a real consumer — but no subsequent round re-checked the *narrower* question ("does
  `.int` alone, now that it matters, fit?") until this one. Any audit-doc rejection whose stated reason
  is "no consumer (yet)" should be treated as a standing candidate to re-check every time a later round
  adds a consumer for a field in that same rejected set — not just re-confirmed as "still no consumer
  for the other five," which is what M82 did and which let this specific angle sit for two rounds.
- **A UI row-budget cap is itself game data that should be measured against the real corpus, not a
  two-sample spot check.** M38's 2-sample probe found "1-2 rows headroom"; this round's full-corpus,
  side-table-joined probe found the true ceiling is already the cap itself for several real monsters.
  A fix that only adds a row without re-measuring the ceiling risks introducing a new silent-truncation
  bug in the exact same commit that fixes the original one — worth exhaustively measuring, not
  sampling, whenever a proposed row addition is unconditional (always shown) rather than conditional.
- **A promising, well-evidenced disassembly lead can still fail the reachability bar even after both a
  static BFS proof and a matching real game-data pattern appear to support it** — the static
  "reachable from all 5 header entries" BFS this round built is an over-approximation (it doesn't
  respect `IF_*`'s actual guard semantics), and only a full dynamic re-execution against the real
  per-step/per-area-init seed memory a production caller actually supplies exposed that the specific
  site in question is not, in fact, exercised. Future rounds investigating ECL-data reachability should
  budget time for BOTH a static BFS AND a dynamic re-run before finalizing a game-data-dependent
  headline — a static proof alone is not sufficient evidence of reachability in this VM's semantics.
