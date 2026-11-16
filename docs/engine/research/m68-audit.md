# M68 audit — the next "computed but unwired" candidate

> Audit method per the brief: read `docs/engine/BUILD-QUEUE.md`'s Done-section entries for
> M64.S1-M67.S1 in full, and `docs/engine/research/m67-audit.md` in full (its "Verification evidence",
> "Rejected alternatives investigated this round", "Open questions / unknowns", and "Implications"
> sections in particular). Every candidate below was grepped against **every**
> `docs/engine/research/m*-audit.md` file for its exact field/function name before being accepted or
> dropped (the M65/M66/M67 standing discipline).
>
> **Method tried first, per this round's specific instruction: check `charEditor.ts`'s own CoK-mode
> `toView()` against `SavedCharacter`'s full field list.** Read `savedCharacter.ts`'s `SavedCharacter`
> interface (`name`, `abilities`, `hitPoints`, `armorClass`, `thac0`, `classCode`, `savingThrows`, `xp`,
> `raw`) against `charEditor.ts`'s `toView()` (lines 140-162) field-by-field: every one of the eight
> meaningful fields is read (`name`, all six `abilities`, `armorClass`→`ac`, `thac0`, `hitPoints`→both
> `hp`/`maxHp`, `classCode` via `classLine()`, all five `savingThrows` via `SAVE_ROWS`, `xp`→`footer`);
> only `raw` (the byte buffer, not a display fact) is unread. **Fully exhausted — no fresh gap in
> `toView()`.** This confirms M67's own suggested next step was worth checking directly rather than
> assuming, but the CoK side of this exact file has no further slack.
>
> **Applied the same struct-vs-view-mapping method to a dozen other loader/view pairs** (full list in
> Rejected Alternatives): `dqkItem.ts`'s `DqkBaseItem`/`DqkItemRecord` (zero `apps/web` consumers — out
> of scope), `moncha.ts`'s `decodeNpcRecord`/`decodeDqkMonsterRecord` (both fully read via
> `MonsterRecord`, already-exhausted family), `monsterSideTables.ts`'s `MonsterAffect`/`MonsterItem`
> (already-wired/already-blocked), `MonsterRecord` itself (read every field against
> `referenceDb.ts`'s `monsterCategory()` — genuinely fully exhausted now, 16 conditional rows),
> `CharacterSheet` (`charSheet.ts`'s `toView()` — every field read including `spellSlots`, which turns
> out to have its own independent, correctly-redundant recomputation path in `magic.ts`, not a dropped
> value), `Encumbrance` (`.allowanceTenths`/`.maxLoadTenths` — already rejected M48, "no natural
> single-line display slot"), and `BaseItem`/`SpellEffect` (both already exhaustively read, M44/M45).
> One near-miss: `MonsterWizSpell.learning` (the WIZ spell-list's "still learning" high bit) is a real,
> decoded-from-bytes sibling of `.spellId` that gets silently dropped in **both** of its consumers
> (`applyPreparedSpellIds` and `importDokParty.ts`'s own spell-id extraction) — but the file's own doc
> comment states it is "never observed set in real data" across all 14 monster blocks *and* all 4 real
> player `.WIZ` saves this project has, so wiring it in would produce **zero visible change** for every
> real asset in the repo — it fails this loop's "verified: produces a real screen change" bar (weaker
> than M67's `baseDamage`, which had a real, non-trivial value just flat across samples). Investigated
> and rejected; see the table below.
>
> **Headline pick, found by re-applying the exact same method one level deeper: `referenceDb.ts`'s
> `spellCategory()` already reads its `TacticalSpell` object's `.range`/`.area`/`.radius`/`.save`
> fields (shipped M45.S1) but never its sibling field on the SAME object, `.inflict`** — the status
> condition (asleep/held/feared/slowed/hasted) a spell inflicts, which M45 itself flagged as a
> follow-up but explicitly declined because, at the time, `.inflict` "was not exported at all" from
> the ruleset's spell-geometry table and would need "a small new export." That objection is now
> **moot**: `combatSpells.ts`'s `tacticalSpellFor()` has since grown to set `inflict` directly on the
> very same `TacticalSpell` return object `spellCategory()` already destructures for Range/Area/Save
> (`combatSpells.ts:126`) — no new export needed, just one more field read off an object already in
> scope. No round between M45 and M67 picked this back up (confirmed by grep — see Verification
> evidence).

## Headline finding

### `spellCategory()` already reads 4 of its `TacticalSpell` object's fields (`range`/`area`/`radius`/`save`) but drops the 5th, `.inflict` — the exact status a spell mechanically inflicts in live combat and already narrates in the combat log, but never previews before you memorize/cast it

`packages/engine/src/ruleset/addnd1e-dragonlance/combatSpells.ts`'s `tacticalSpellFor()` builds one
`TacticalSpell` per geometried spell (`combatSpells.ts:116-129`):

```ts
return {
  id: spellId,
  name,
  target,
  range: geo.range,
  area: geo.area,
  radius: geo.radius,
  save: geo.save,
  damage: isDamage ? diceToAmount(dice!) : undefined,
  heal: isHeal ? { ...diceToAmount(dice!), count: ... } : undefined,
  inflict: inflict ? { ...inflict } : undefined,   // <- real data, set right here
  casterLevel: Math.max(1, Math.floor(casterLevel)),
  usesLeft: Math.max(0, Math.floor(usesLeft)),
};
```

`inflict` comes from the `INFLICT` table (`combatSpells.ts:73-81`) — real, primary-sourced-as-far-as-
possible AD&D-1e ruleset data (labelled inferred where the games' own binary constants are
cross-overlay/UNLOCATED, same honesty standard as the `GEOMETRY` table beside it):

```ts
const INFLICT: Record<string, { status: InflictableStatus; rounds: number; hdCap?: number }> = {
  'm1-sleep': { status: 'asleep', rounds: 99, hdCap: 4 },
  'm2-stinking-cloud': { status: 'held', rounds: 3 },
  'c2-hold-person': { status: 'held', rounds: 6 },
  'm3-hold-person': { status: 'held', rounds: 6 },
  'm4-fear': { status: 'feared', rounds: 4 },
  'm3-slow': { status: 'slowed', rounds: 3 },
  'm3-haste': { status: 'hasted', rounds: 3 },
};
```

This is **live, mechanically consumed** data: `packages/engine/src/combat/tactical.ts`'s
`inflictStatus()`/`tickStatuses()` machinery applies exactly this `{status, rounds, hdCap}` triple to
every real cast of these 7 spells (Sleep/Stinking Cloud/both Hold Persons/Fear/Slow/Haste) — the same
turn-loop CT.5a built and M55's own audit confirmed is "already narrated" post-hoc, via
`apps/web/src/ui/combat.ts`'s `statusVerb()` (`combat.ts:553-560`, e.g. `"falls asleep"`/`"is held"`).

But `apps/web/src/ui/referenceDb.ts`'s `spellCategory()` — the pre-hoc Reference DB / Companion Panel
spell browser, i.e. the ONE screen built to let a player look up a spell's real mechanics *before*
memorizing or casting it — reads every other field of the exact same `TacticalSpell` object except
this one (`referenceDb.ts:213-218`):

```ts
const geo = tacticalSpellFor(sp.id, sp.name, 1, 1);
if (geo) {
  rows.push({ label: 'Range', value: geo.range === 1 ? '1 cell' : `${geo.range} cells` });
  rows.push({ label: 'Area', value: geo.radius ? `${geo.area} r${geo.radius}` : geo.area });
  rows.push({ label: 'Save', value: geo.save });
}
```

`geo.inflict` never appears anywhere in the function. So today, opening the Reference DB and selecting
**Sleep** shows `Range: 12 cells`, `Area: burst r2`, `Save: none` — but nothing at all tells the player
Sleep puts a target (≤4 HD) to sleep for up to 99 rounds. The same is true for Stinking Cloud (holds),
Hold Person ×2 (holds), Fear (fears), Slow (slows), and Haste (hastes the party) — 7 of the 20
geometried spells silently omit their single most important mechanical fact from the one screen
designed to preview it.

## Why this wasn't already picked up (M45's own flag, now stale)

M45.S1 (`docs/engine/research/m45-audit.md:396-402`) is the round that added the Range/Area/Save rows
in the first place, and it explicitly considered `inflict` as a follow-up and declined it **for a
specific, now-obsolete reason**:

> Would a future round want to also surface `TacticalSpell.inflict` ... ? Genuinely a sibling fact one
> level deeper than this round's pick (`INFLICT` in `combatSpells.ts`, not exported at all today —
> would need a small new export, unlike this round's fix which needed zero new exports) — flagged but
> out of this round's minimal-diff scope.

At the time, M45 was correct: `INFLICT` was presumably a private lookup not yet threaded onto the
`TacticalSpell` object `spellCategory()` already had in hand. Reading the CURRENT `combatSpells.ts`
(reproduced above) shows `inflict` is now set directly on the very same object at
`tacticalSpellFor()`'s return statement (`combatSpells.ts:126`) — the CT.5a status-spell work that
must have landed sometime after M45 already plumbed it that far. **No round between M45 and M67 ever
revisited this specific follow-up** (confirmed by grep below), so the "would need a new export"
objection quietly became false and nobody re-checked.

## Verification evidence — which prior audit docs were checked, and what they did/didn't cover

Grepped every `docs/engine/research/m*-audit.md` for `inflict`, `TacticalSpell`, `spellCategory`,
`combatSpells`, `INFLICT`, `toViewDok`, `SavedCharacter` (the M67-suggested starting point) before
accepting this candidate:

- **`inflict`** — hits in `m24-audit.md` (a *different* affect, `feeblemind`/gaze attacks — rejected as
  a bigger new-mechanic job, unrelated), `m27-audit.md` (background context for the turn-loop
  mechanism itself), `m29-audit.md` (a different affect, `clear_movement` — rejected, unrelated),
  `m45-audit.md` (the flag quoted above — the only one about *this* exact gap), `m46-audit.md`
  (`"Not attempted this round... a legitimate bigger future job per the standing note"`),
  `m47`-`m54`-audit.md (all list `TacticalSpell.inflict` in a rolling "standing, not re-investigated"
  bundle, unchanged wording each round), and `m55-audit.md` (which re-checked it — but for a
  *different* claim: whether it is wired into the **combat log**, confirming `combat.ts:604-619`
  already narrates every `inflict`/status event post-hoc. **M55 did NOT check the Reference DB
  pre-hoc-preview angle** — its own text is scoped to "does a UI surface exist for this", found the
  combat log, and stopped there, never re-opening `spellCategory()` itself to check whether `.inflict`
  specifically reached that function too).
- **`TacticalSpell`/`spellCategory`/`combatSpells`** — the M39/M44/M45 sequence (full `spellCategory()`
  field-sweep history) is exactly the history summarized above; no round after M45 re-read
  `spellCategory()`'s source against `TacticalSpell`'s full field list a second time.
- **`toViewDok`/`SavedCharacter`** (M67's suggested starting point) — checked directly this round (see
  the header note above); confirmed exhausted, not just asserted.

**No prior round shipped, or currently blocks, surfacing `TacticalSpell.inflict` on
`spellCategory()`.** M45 flagged it and declined for a reason (a missing export) that a later,
unrelated round's own work silently resolved; nothing since has closed the loop by re-checking.

### Real-data verification (this round)

Scratch script `packages/engine/test/_scratch_m68_verify.test.ts` (created, run, all 4 tests green,
then deleted — engine-level only, real ruleset functions, no fabricated data):

```
tacticalSpellFor('m1-sleep', ...).inflict        = { status: 'asleep', rounds: 99, hdCap: 4 }
tacticalSpellFor('m2-stinking-cloud', ...).inflict = { status: 'held', rounds: 3 }
tacticalSpellFor('c2-hold-person', ...).inflict  = { status: 'held', rounds: 6 }
tacticalSpellFor('m3-hold-person', ...).inflict  = { status: 'held', rounds: 6 }
tacticalSpellFor('m4-fear', ...).inflict         = { status: 'feared', rounds: 4 }
tacticalSpellFor('m3-slow', ...).inflict         = { status: 'slowed', rounds: 3 }
tacticalSpellFor('m3-haste', ...).inflict        = { status: 'hasted', rounds: 3 }
tacticalSpellFor('m3-fireball', ...).inflict     = undefined   (pure-damage control, no fabrication)
```

- Test 1 walks the real `COK_SPELLS` list and confirms `tacticalSpellFor()` resolves the expected
  `{status, rounds, hdCap}` triple for exactly the 7 real named spells (Sleep, Stinking Cloud, cleric
  Hold Person, mage Hold Person, Fear, Slow, Haste) — all genuinely present in `COK_SPELLS`
  (`spellList.ts`'s own `mk()`-generated ids, cross-checked by name).
- Test 2 confirms Fireball (a pure-damage geometried spell) resolves `geo` but `geo.inflict ===
  undefined` — proving the fix would honestly omit the row for the other 13 geometried spells, not
  fabricate a status for them.
- Test 3 confirms every real status string (`asleep`/`held`/`feared`/`slowed`/`hasted`) is ≤ 8
  characters — the Reference DB detail column's value truncation width
  (`referenceDb.ts:123`, `d.value.toUpperCase().slice(0, 8)`) — so no status name would be cut off,
  matching the existing `Save` row's untruncated values (`half`/`negate`/`none`).
- Test 4 is a source-text proof (reads `apps/web/src/ui/referenceDb.ts` from disk, same style as
  M45's own Test 3): the current `spellCategory()` function body contains `geo.range`, `geo.area`,
  `geo.radius`, `geo.save`, and does **not** contain `geo.inflict` — a direct, static confirmation of
  the gap, not an inference.

`git status --porcelain` after deleting the scratch file: clean (only this doc is untracked).
Full engine suite: 1348 passed with the 4 scratch tests present (1344 baseline post-M67 + 4); 1344
again after deletion — no regression, no source file touched.

## Wiring plan

One-line addition (plus a doc comment) inside `spellCategory()`'s existing `if (geo)` block — no new
engine export, no new function, no new UI panel. `companionPanel.ts` picks up the fix for free (it
already imports and calls this exact `spellCategory()`, `companionPanel.ts:42,369`).

**1. `apps/web/src/ui/referenceDb.ts`** — extend the existing `if (geo)` block (currently lines
213-218):

```ts
const geo = tacticalSpellFor(sp.id, sp.name, 1, 1);
if (geo) {
  rows.push({ label: 'Range', value: geo.range === 1 ? '1 cell' : `${geo.range} cells` });
  rows.push({ label: 'Area', value: geo.radius ? `${geo.area} r${geo.radius}` : geo.area });
  rows.push({ label: 'Save', value: geo.save });
  // M68.S1 — geo.inflict (combatSpells.ts's INFLICT table): the status condition this spell
  // mechanically inflicts (asleep/held/feared/slowed/hasted), already driving tactical.ts's real
  // turn loop (inflictStatus()/tickStatuses()) and already narrated post-hoc in the combat log
  // (combat.ts's statusVerb(), since M55) — but never previewed here, the one screen built to show
  // a spell's mechanics BEFORE it's cast. Undefined for the 13 other geometried spells (Fireball,
  // Magic Missile, ...), so honestly omitted rather than fabricated.
  if (geo.inflict) rows.push({ label: 'Status', value: geo.inflict.status });
}
```

No change to `packages/engine` at all: `TacticalSpell.inflict` and `tacticalSpellFor()` already exist
and already return real data; this is purely an `apps/web`-layer read of a field already in scope.

**2. `apps/web/test/e2e.mjs`** — extend the existing M45 spell-geometry check block
(`e2e.mjs:4218-4238`, the one that already probes Fireball/Bless) with a third real-data probe, Sleep,
mirroring the existing style exactly:

```js
const { fireballGeoOk, blessNoGeoOk, sleepStatusOk } = await page.evaluate(() => {
  let fireballSeen = false, fireballRight = false, blessSeen = false, blessHasNoGeo = false;
  let sleepSeen = false, sleepStatusRight = false, fireballNoStatus = true;
  const n = window.__refdb.entryCount();
  for (let i = 0; i < n; i++) {
    window.__refdb.select(i);
    const cur = window.__refdb.current();
    if (cur?.name === 'Fireball') {
      fireballSeen = true;
      fireballRight = cur.detail.some((d) => d.label === 'Range' && d.value === '10 cells')
        && cur.detail.some((d) => d.label === 'Area' && d.value === 'burst r2')
        && cur.detail.some((d) => d.label === 'Save' && d.value === 'half');
      fireballNoStatus = !cur.detail.some((d) => d.label === 'Status');
    }
    if (cur?.name === 'Bless') {
      blessSeen = true;
      blessHasNoGeo = !cur.detail.some((d) => d.label === 'Range')
        && !cur.detail.some((d) => d.label === 'Area') && !cur.detail.some((d) => d.label === 'Save');
    }
    if (cur?.name === 'Sleep') {
      sleepSeen = true;
      sleepStatusRight = cur.detail.some((d) => d.label === 'Status' && d.value === 'asleep');
    }
  }
  return {
    fireballGeoOk: fireballSeen && fireballRight && fireballNoStatus,
    blessNoGeoOk: blessSeen && blessHasNoGeo,
    sleepStatusOk: sleepSeen && sleepStatusRight,
  };
});
if (!fireballGeoOk || !blessNoGeoOk || !sleepStatusOk) errors.push(`spell-geo: fireballGeoOk=${fireballGeoOk} blessNoGeoOk=${blessNoGeoOk} sleepStatusOk=${sleepStatusOk}`);
...
ok = ... && spellOk && fireballGeoOk && blessNoGeoOk && sleepStatusOk;
```

Same file, same block, same case id (`refdb`) — no new e2e case, matching the loop's established
"extend an existing seam" preference (M64/M66/M67).

## Layout / feasibility check

`REFERENCE_DB_DETAIL_ROWS = 12` (`packages/engine/src/render/referenceDb.ts:72`) is the hard cap;
extra rows are silently dropped past index 12 (`Math.min(REFERENCE_DB_DETAIL_ROWS, v.detail.length)`,
`referenceDb.ts:118`) — the same ceiling M65 had to check for the bestiary. Computed the worst-case
row count for each of the 7 affected spells by hand against the current row builder
(`Class`/`Level`/`Effect`/`Target` always present = 4; `Dice` only if `fx.dice` truthy; `Range`/`Area`/
`Save` present whenever `geo` resolves = 3; `Camp` always present = 1; `Note` only if `fx.note`
truthy):

| Spell | Existing rows (current code) | + Status | Total | Margin to cap (12) |
|---|---|---|---|---|
| Sleep, cleric Hold Person, mage Hold Person, Fear, Slow (no `EFFECTS` entry → generic `utility`/no dice/no note) | 8 (Class/Level/Effect/Target/Range/Area/Save/Camp) | +1 | 9 | 3 |
| Stinking Cloud (`dmg('enemyGroup',0,0,0)` — has a truthy `{count:0,sides:0,bonus:0}` dice object, so a `Dice` row already renders `"0d0"`) | 8 (as above + Dice, no Note) | +1 | 9 | 3 |
| Haste (`buff('hastens the party', 'allyGroup')` — has a `note`) | 9 (as above + Note, no Dice) | +1 | 10 | 2 |

Every case lands comfortably under the 12-row cap (widest margin case still has 2 free rows). The 13
other geometried-but-non-status spells (Fireball, Magic Missile, Lightning Bolt, ...) are entirely
unaffected — `geo.inflict` is `undefined` for all of them, so the new `if` simply never fires there,
confirmed by Test 2's Fireball control. Value-column truncation (8 chars, `referenceDb.ts:123`) is
also safe — confirmed by Test 3 (`asleep`/`held`/`feared`/`slowed`/`hasted` are all ≤ 8 chars, no
truncation, matching the existing untruncated `Save` row convention).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| `charEditor.ts`'s CoK-mode `toView()` vs. `SavedCharacter` (this round's specifically-suggested first check) | Read fresh, field-by-field: every meaningful field (`name`, all 6 `abilities`, `armorClass`, `thac0`, `hitPoints`, `classCode`, all 5 `savingThrows`, `xp`) is already read; only `raw` (the byte buffer, not a display fact) is unread. Fully exhausted — no fresh gap. |
| `dqkItem.ts`'s `DqkBaseItem`/`DqkItemRecord` | Zero `apps/web` consumers anywhere (grepped) — same "reaches no UI panel" rejection class as `dqkSave.ts`/`buildDqkGame.ts` (M67/standing). |
| `moncha.ts`'s `decodeNpcRecord`/`decodeDqkMonsterRecord` | Both decode into the shared `MonsterRecord` type, whose own field list was separately swept (see next row) — no gap unique to the DQK decode path itself. |
| `MonsterRecord` (all 21 fields) vs. `referenceDb.ts`'s `monsterCategory()` | Read every field: `blockId`/`category`/`raw` are internal plumbing (not display facts); every other field (`name`, `hitPoints`, `abilities`(indirectly via saves/con-bonus), `savingThrows.spell`, `armorClass`, `thac0`, `hitDice`, `damage`, `xp`, `combatSize`, `morale`, `npcClass`, `npcLevel`, `acSource`, `regenPerRound`, `halfDamage`, `itemPluses`, `carriedItems`, `conSaveBonus`, `preparedSpellIds`) already has a conditional row. Genuinely, fully exhausted now — confirms the standing "11+ of a 12-row cap" note. |
| `CharacterSheet.spellSlots` vs. `charSheet.ts`'s `toView()` | Not dropped — it has its own INDEPENDENT, correctly-redundant recomputation path: `magic.ts`'s `casterInfo()` recomputes slot counts live via `spellSlots()`/`clericSpellSlots()` rather than reading `sheet.spellSlots` (so a moon-phase-adjusted effective level stays fresh); the static field is shown once, at creation time, in `create.ts`'s preview. No incorrect or missing player-visible outcome — a deliberate two-path design, not a bug. |
| `Encumbrance.allowanceTenths`/`.maxLoadTenths` | Already investigated and rejected M48: "no natural single-line display slot" beyond `.label`/`.moveRate` (already shown, M63). Not re-litigated. |
| `MonsterWizSpell.learning` (the WIZ spell-list's "still learning" high bit) | Real, decoded-from-bytes sibling of `.spellId`, dropped in both consumers (`applyPreparedSpellIds` in `monsterSideTables.ts`, and `importDokParty.ts`'s own `.spells.map((s) => s.spellId)`) — a genuine "sibling field dropped" shape. But the file's own doc comment states it is never observed set across all 14 real monster WIZ blocks *and* all 4 real player `.WIZ` saves — wiring it in would render identically to today for every real asset in this repo, failing the "verified: produces a real screen change" bar (unlike `baseArmorClass`/`baseDamage`, M67, which have real non-trivial values, just flat across the *sampled set*, not structurally incapable of varying). |
| `Encumbrance`/`InventoryView` cross-screen duplication (`inventory.ts` shows `.label`, `charSheet.ts` shows `.moveRate`) | Already a deliberate M63 decision, not a fresh gap — M63 explicitly investigated whether to also add `.moveRate` to `inventory.ts` and chose the character sheet instead as "the one screen built to display a character's derived facts," to avoid redundant duplication. |
| `BaseItem`/`SpellEffect` full-field sweeps | Both already exhaustively read (M44/M45's own field-sweep tests); re-confirmed by direct reading this round, no new gap. |
| `create.ts`'s preview panel omitting `sex`/other already-visible draft selections | Same weak/cosmetic class as the standing `deity`/`robe` preview omissions (M67) — the preview doesn't re-echo the user's OWN just-made form selections generally, only computed derived stats; not a fresh, stronger angle. |

## Open questions / unknowns

- Whether the row label should read "Status" (chosen here, matches the existing single-word
  `Save`/`Range`/`Area` convention) or something more explicit like "Inflicts" — **UNKNOWN/style
  call**, left to the lead session; "Status" was chosen for column-width parity with the other rows.
- Whether the row should also show duration (`rounds`) or the HD cap (`hdCap`, Sleep-only) — the
  8-character value-column truncation makes appending e.g. `" 99rd"` unsafe for some combinations;
  this plan deliberately shows only the status name (matching the terse, single-fact style every other
  row in this function already uses) and leaves duration/HD-cap as a possible follow-up, not blocking.
- Whether a future round should also add an `INFLICT`-style preview to the **item** category for
  cursed/special-effect items (`itemCategory()`) — not investigated, a genuinely different data model
  (`DqkItemRecord.effectCode`/`.specialCode`, out of scope per the `dqkItem.ts` rejection above; CoK's
  own `ItemRecord` was not re-checked for an analogous field this round).

## Implications for our engine

- **A prior round's own explicitly-logged follow-up can go stale silently.** M45 declined `.inflict`
  for a concrete, correct-at-the-time technical reason (no export existed); unrelated later work
  (presumably the CT.5a status-spell mechanics landing fully) silently satisfied that reason, and
  nothing re-checked the flag afterward — it just kept getting copy-pasted into the "standing, not
  re-investigated" bundle list for 22 rounds (M47 through M67) without anyone re-reading the actual
  current source to see whether the blocker was still real. Worth treating any "flagged but needs
  small infrastructure work first" follow-up as a candidate for periodic re-verification, not a
  permanent bundle entry — the infrastructure may have arrived for an unrelated reason since.
- **The "sibling field on the same object, partially read" method (M63/M64/M67) generalizes past
  loader-decoded byte structs to ruleset-authored mechanical-data structs too.** `TacticalSpell` isn't
  decoded from game files — it's authored 1e/Gold-Box-standard data — but the exact same failure
  shape applies: a display function that already has the whole object in hand, already reads 4 of its
  fields, and drops a 5th for no principled reason once the technical excuse (a missing export) quietly
  stopped applying.
- **M55's "is there a UI surface for this" check is not the same claim as "does the pre-hoc REFERENCE
  screen show this."** M55 confirmed `inflict` is wired into the post-hoc combat log and treated that
  as closing the question; this round shows a *different*, still-open screen (the spell browser you'd
  consult BEFORE a fight) never got the same fact. "Already narrated after the fact" and "discoverable
  before you commit to memorizing/casting it" are different player-facing claims, echoing M63's own
  finding that "mechanically wired" and "displayed" are not the same thing either.
