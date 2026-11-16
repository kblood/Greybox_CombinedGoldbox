# M55 audit — the next "computed but unwired" candidate

> Audit method: per this round's brief, FIRST performed the systematic `33180d2`-sibling
> dead-container check (grepped every `document.querySelector`/`querySelectorAll` target across
> `apps/web/src` and confirmed each has a real creation site somewhere in the tree — see "Rejected
> alternatives" below; it turned up nothing new, M54's `.gb-party` fix was the only one and it is
> already live in the current tree). Fell back to the standing methods and, on re-reading
> `docs/engine/research/m54-audit.md`'s own "Rejected alternatives" table, found that its dismissal
> of **`MonsterRecord.conSaveBonus`/`.itemPluses`/`.carriedItems`/`.preparedSpellIds`** ("bigger
> future job... needs new UI surfaces per field") had never actually been checked against
> `referenceDb.ts`'s own `monsterCategory()` — the SAME function M37 (Class), M38 (Save) and M43
> (Regen/Half Dmg) already used, three separate times, to add exactly this shape of field to the
> Companion panel's bestiary detail sheet with **zero new UI surface**, just one more conditional
> row in an array that already exists. That characterization turns out to be wrong for at least one
> of the four fields.
>
> **Headline pick: `apps/web/src/ui/referenceDb.ts`'s `monsterCategory()` builds the detail-row
> array for BOTH the standalone `?refdb=1` bestiary browser and the in-play Companion → Databases
> tab (`companionPanel.ts`), and the in-play tab is fed `explore.ts`'s live, side-table-joined
> `MonsterRecord[]` — which has carried `preparedSpellIds` (a real DoK monster's actual memorized
> spell list, decoded from `MON{n}WIZ.DAX`, M31.S1) since before this M-series began. That field
> already has a real, mechanically load-bearing consumer (`combat.ts`'s
> `preparedSpellsFromDokIds`, which makes the monster actually cast in tactical combat) but
> `monsterCategory()` never reads it — a real DoK spellcaster's bestiary/Companion entry shows AC,
> HD, THAC0, HP, Damage, XP, Morale, Size and Class, and nothing at all about the fact that it casts
> spells, even though the exact number of real, named, castable spells is sitting in the very
> `MonsterRecord` the function is holding.**
>
> Every real-mechanic claim below was independently re-derived this round via a throwaway `vitest`
> script (`packages/engine/test/_scratch_m55_verify.test.ts`, created, run, **5/5 green** — plus two
> exploratory scratch files, `_scratch_m55_probe.test.ts` and `_scratch_m55_counts.test.ts`, used to
> characterize the real bestiary before writing the final assertions — all three deleted before this
> round ended). `git status --porcelain --untracked-files=all` is clean except this doc (confirmed
> below; `git status` reports "nothing to commit, working tree clean" aside from this file once it's
> added).

## Headline finding

### The gap: `monsterCategory()` never reads `preparedSpellIds`/`itemPluses`/`carriedItems`

`apps/web/src/ui/referenceDb.ts:90-125` (current state, unmodified):

```ts
export function monsterCategory(monsters: MonsterRecord[]): RefCategory {
  const entries: RefDbEntry[] = [];
  const details: RefDbDetailRow[][] = [];
  for (const m of monsters) {
    entries.push({ name: m.name || `#${m.blockId}`, tag: m.combatSize && m.combatSize > 1 ? 'LG' : undefined });
    const classValue = m.npcClass !== undefined ? (NPC_CLASS_LABEL[m.npcClass] ?? `class ${m.npcClass}`) : m.category;
    details.push([
      { label: 'AC', value: `${m.armorClass}` },
      { label: 'HD', value: `${m.hitDice}` },
      { label: 'THAC0', value: `${m.thac0}` },
      { label: 'HP', value: `${m.hitPoints}` },
      { label: 'Damage', value: dmgText(m.damage) },
      { label: 'XP', value: `${m.xp}` },
      { label: 'Morale', value: m.morale === undefined ? '—' : `${m.morale}` },
      { label: 'Size', value: m.combatSize && m.combatSize > 1 ? 'Large' : 'Small' },
      { label: 'Class', value: classValue },
      ...(m.npcLevel !== undefined ? [{ label: 'Level', value: `${m.npcLevel}` }] : []),
      ...(m.savingThrows ? [{ label: 'Save', value: `${m.savingThrows.spell}` }] : []),
      ...(m.regenPerRound !== undefined ? [{ label: 'Regen', value: `${m.regenPerRound}/rd` }] : []),
      ...(m.halfDamage ? [{ label: 'Half Dmg', value: 'Yes' }] : []),
    ]);
  }
  return { key: 'monsters', label: 'Monsters', entries, details };
}
```

`MonsterRecord.preparedSpellIds` — never referenced in this function's body at all (confirmed by
source-text scan this round; see verification §4 below). Neither are `itemPluses` or `carriedItems`
(the other two fields M54's rejected-alternatives table bundled with it); `preparedSpellIds` is the
one this round's fix targets, since it maps cleanly onto this function's existing "one terse
`{label, value}` row" convention the way a raw item array or plus-list doesn't as neatly.

### The data reaches this exact function, fully joined, during real play — proven end to end

`companionPanel.ts:367` calls `monsterCategory(opts.source.monsters)`, and `opts.source.monsters`
is typed `MonsterRecord[]` (`companionPanel.ts:68`). The doc comment at the top of the file
(`companionPanel.ts:8-13`) states this explicitly: *"Reference DB reuses `referenceDb.ts`'s own
category builders against the live decoded bestiary/item tables `explore.ts` already loaded for
THIS game."*

`explore.ts` builds exactly that live table by running the SAME side-table joins M26/M29/M31
shipped, then hands the joined array straight to the Companion panel:

```ts
// apps/web/src/ui/explore.ts:1576-1587 (current state, unmodified)
    monRecords = applyConSavingBonus(monRecords, spcAffects);
    // M26.S1/M29.S1 — join MON{n}ITM.DAX carried items onto the records: ...
    const itm = decodeMonsterItmArchive(itmBytes);
    monRecords = applyItemPluses(monRecords, itm);
    monRecords = applyCarriedItems(monRecords, itm);
    // M31.S1 — join MON{n}WIZ.DAX memorized spells onto the records so a real DoK caster monster
    // actually casts in combat (crosswalked into TacticalSpells at the makeTC() assembly point).
    monRecords = applyPreparedSpellIds(monRecords, decodeMonsterWizArchive(wizBytes));
    monsterLookup = monsterLookupFromArchive(monRecords);
```

```ts
// apps/web/src/ui/explore.ts:1129-1136 (current state, unmodified)
  openCompanionPanel({
    ...
    monsters: state.monRecords,
```

So a live DoK dungeon session's Companion → Databases → Monsters tab is, right now, handed
`MonsterRecord`s whose `preparedSpellIds` field is populated for every real caster in the loaded
`MON1CHA.DAX`/`MON1WIZ.DAX` pair — the exact same join `explore.ts` already runs before spawning
combat. `monsterCategory()` just never looks at it.

(The standalone `?refdb=1` route, by contrast, is hardcoded to CoK-only data — `referenceDb.ts:41`,
`const MON_PATH = 'Champions of Krynn/MON1CHA.DAX';` — so this fix is only ever visible through the
**live, in-play Companion panel** during a DoK session, not the standalone browser page. CoK has no
`MON{n}WIZ.DAX` at all — see below — so this is honestly a DoK-only addition, matching the same
"additive, honestly absent elsewhere" convention every sibling row in this function already uses.)

### The fact is real, mechanically load-bearing, and named in the game's own bestiary

`packages/engine/src/loaders/monster.ts:289`: `MonsterRecord.preparedSpellIds?: number[]` — "the
raw DoK spell numbers (1-126)... unfiltered." `packages/engine/src/loaders/monsterSideTables.ts:
386-391`'s `applyPreparedSpellIds` is the exact join `explore.ts` calls above. Its one real consumer
today is `apps/web/src/ui/combat.ts:327`:

```ts
    : preparedSpellsFromDokIds(c.preparedSpellIds, c.hd ?? MONSTER_NOMINAL_CASTER_LEVEL);
```

— `preparedSpellsFromDokIds` (`packages/engine/src/ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts:
58-74`) crosswalks the raw ids through `DOK_SPELL_CROSSWALK` (13 real, name-verified ids —
`dokSpellCrosswalk.ts:27-41`) into actual `TacticalSpell`s the monster casts mid-battle. So this is
not a cosmetic fact: it decides whether a real DoK monster opens a fight by hanging back and
casting Fireball instead of meleeing — and the Companion panel's own bestiary entry for that exact
monster says nothing about it.

**Real bytes (verified this round, `MON1CHA.DAX`/`MON1WIZ.DAX`, not fixtures):** monster block 97,
named **IGORF** in the real archive, carries raw ids `[47, 32, 33, 34, 10, 15, 21]`, of which 4
crosswalk to real, named, castable spells — Fireball, Stinking Cloud, Magic Missile, Sleep (the
other 3 ids — Mirror Image/Ray of Enfeeblement/Charm Person — have no crosswalk entry and are
correctly dropped, same as `preparedSpellsFromDokIds` already does for combat). This exact
`[47,32,33,34,10,15,21]` list and 4/7 crosswalk rate were independently re-derived this round from
the real archive files, not just copied from `dokSpellCrosswalk.test.ts`'s or `m31-audit.md`'s own
fixtures (though they match — cross-validating both).

Across the full real bestiary, **14 monsters** carry a real, non-empty `preparedSpellIds` (LICH,
VAMPIRE MAGE, VAMPIRE CLERIC, KUO TOA CLERIC, TANAR, FLAVIUS, BLACK MAGE, BLACK WIZARD, HIGH WIZARD,
ROGUE MAGE HIGH, PATRIARCH, HIGH PRIEST, DURFEY, IGORF), with distinct crosswalked-spell counts
ranging 1-6 (DURFEY: 1; FLAVIUS: 6, the real maximum).

## Why this fits the loop's established shape

1. **A real, already-decoded/derived fact with a real, mechanically load-bearing consumer
   elsewhere** — `preparedSpellIds` already decides monster AI behaviour in live tactical combat
   (`combat.ts:327`), the same "already deciding real combat outcomes" shape M38.S1 (spell save)
   and M43.S1 (Regen/Half Dmg) both used for their own picks in this exact same function.
2. **The exact display chokepoint already exists and already carries 4 sibling fields from the
   same side-table family** — Class (M37.S1), spell-Save (M38.S1), Regen and Half Dmg (M43.S1) are
   all already additive rows in this same `details.push([...])` array. This is not a new UI
   surface; it is the fifth use of an already-proven mechanism.
3. **A standing rejection corrected with a genuinely new angle**: M54's own rejected-alternatives
   table dismissed this exact field family as "needs new UI surfaces per field" without checking
   whether `referenceDb.ts`'s own extensible row array already served that role for 4 of its
   siblings — re-examining that specific claim (not just re-grepping the same surface) is the new
   angle this round developed, in the spirit of the loop's "stale/backwards claim" method (j)
   applied to a PRIOR ROUND'S characterization rather than to in-game text.
4. **Grounded against real bytes, not fixtures**: IGORF's raw ids, crosswalk survivors, and the
   full 14-monster caster census were re-derived from the actual `MON1CHA.DAX`/`MON1WIZ.DAX` files
   this round, independently of `dokSpellCrosswalk.test.ts`'s and `m31-audit.md`'s own numbers.
5. **A real layout/feasibility check, not just "there's room in the array"**: confirmed via real
   bytes that none of the 14 real casters ALSO populate `npcLevel`/`savingThrows`/`regenPerRound`/
   `halfDamage`, so a new row never risks exceeding `composeReferenceDb`'s hard
   `REFERENCE_DB_DETAIL_ROWS = 12` cap for any real monster in the shipped bestiary.
6. **Small and precisely isolated**: one new local + one new conditional row in
   `monsterCategory()`, one new import, one extension to an existing e2e case (`runExploreDok`) —
   no new UI panel, no new route, no engine-package change (every function used already ships).

## Real-bytes / real-mechanic verification (this round)

Reproduced independently via `packages/engine/test/_scratch_m55_verify.test.ts` (created, run,
**5/5 passed**, then deleted, alongside two exploratory scratch files also deleted):

1. **Real DoK `MON1WIZ.DAX` join populates IGORF (block 97) with real spell ids + a real name** —
   decoded the real `Death Knights of Krynn/MON1CHA.DAX` + `MON1WIZ.DAX`, ran `applyPreparedSpellIds`
   (the exact function `explore.ts` calls), and confirmed block 97's `name` is non-empty and
   `preparedSpellIds` equals `[47, 32, 33, 34, 10, 15, 21]` byte-for-byte.
2. **Layout: no real DoK caster also carries an optional row that would push past the 12-row
   display cap** — confirmed, over all 14 real casters, that `npcLevel`/`savingThrows`/
   `regenPerRound`/`halfDamage` are all `undefined`/falsy; the mandatory 9 rows plus one new Spells
   row (10 total) stays comfortably under `REFERENCE_DB_DETAIL_ROWS` (12) for every real monster.
3. **`DOK_SPELL_CROSSWALK` + `spellById` turn IGORF's raw ids into 4 real, named castable spells**
   — Fireball, Magic Missile, Sleep, Stinking Cloud (matching `dokSpellCrosswalk.test.ts`'s own
   independently-verified real-bytes comment, cross-validated rather than merely copied).
4. **Source-text: `monsterCategory()` never references `preparedSpellIds`/`itemPluses`/
   `carriedItems`** — sliced the function's exact source body (between its own `export function`
   line and the next function's) and confirmed none of the three strings appear in it, while
   confirming its sibling rows (`Morale`, `Regen`, `Half Dmg`) DO — proving both halves of the claim
   against the same slice, not two different searches that could talk past each other.
5. **Source-text: `companionPanel.ts` really does feed `monsterCategory()` from `explore.ts`'s live,
   joined `state.monRecords`, not a fresh unjoined re-decode** — confirmed the exact call site
   (`monsterCategory(opts.source.monsters)`) and the exact join chain in `explore.ts`
   (`applyPreparedSpellIds(monRecords…)`, `applyItemPluses(monRecords…)`,
   `applyCarriedItems(monRecords…)`, `monsters: state.monRecords`) all appear verbatim in the
   current source.

Exploratory-only (not part of the final 5, used to characterize the real bestiary before writing
the layout-feasibility assertion, then folded into it): printed all 14 real casters' full decoded
records to confirm none carry `npcClass`/`npcLevel`/`savingThrows`/`regenPerRound`/`halfDamage`, and
computed each caster's distinct crosswalked-spell count (1-6 across the real bestiary, max 6 for
FLAVIUS) to size the proposed "N spell(s)" display string.

Full engine suite re-run before and after: **1336 tests passed** both times (matching M54's stated
baseline exactly — the scratch files added 5-7 tests transiently, all removed), confirming no
regression. `git status --porcelain --untracked-files=all` confirmed clean (only this doc untracked)
after deleting all three scratch files.

## Wiring plan

**One engine-package-free UI file touched (`referenceDb.ts`) plus one extension to an existing e2e
case (`runExploreDok`) — no new UI panel, no new route, every function used already ships in
`@goldbox/engine`.**

1. **`apps/web/src/ui/referenceDb.ts`** — add `DOK_SPELL_CROSSWALK` to the existing `@goldbox/engine`
   import list (alongside `COK_SPELLS`/`spellEffect`/`tacticalSpellFor`, already imported at
   `referenceDb.ts:13-33`):

   ```ts
   import {
     ...
     COK_SPELLS,
     spellEffect,
     tacticalSpellFor,
     DOK_SPELL_CROSSWALK, // M55.S1 — count a real DoK caster's crosswalked spells for the new Spells row
     composeReferenceDb,
     ...
   } from '@goldbox/engine';
   ```

   Then, in `monsterCategory()` (`referenceDb.ts:90-125`), precompute the crosswalked count next to
   the existing `classValue` local (same "compute once, spread conditionally" idiom this function
   already uses), and add one new conditional row after the existing `Half Dmg` row:

   ```ts
   // before (referenceDb.ts:93-95):
     for (const m of monsters) {
       entries.push({ name: m.name || `#${m.blockId}`, tag: m.combatSize && m.combatSize > 1 ? 'LG' : undefined });
       const classValue = m.npcClass !== undefined ? (NPC_CLASS_LABEL[m.npcClass] ?? `class ${m.npcClass}`) : m.category;

   // after:
     for (const m of monsters) {
       entries.push({ name: m.name || `#${m.blockId}`, tag: m.combatSize && m.combatSize > 1 ? 'LG' : undefined });
       const classValue = m.npcClass !== undefined ? (NPC_CLASS_LABEL[m.npcClass] ?? `class ${m.npcClass}`) : m.category;
       // M55.S1 — a real DoK caster's memorized spells (MonsterRecord.preparedSpellIds, joined via
       // applyPreparedSpellIds since M31.S1) already decide whether it casts in combat
       // (combat.ts's preparedSpellsFromDokIds); count the real castable (crosswalked) spells so
       // the bestiary/Companion entry finally says so. `undefined` for every non-caster (most of
       // the bestiary, and the entire CoK side — MON{n}WIZ.DAX is DoK-only), so the row is
       // honestly omitted rather than shown as "0 spells".
       const castableSpellCount = m.preparedSpellIds
         ? new Set(m.preparedSpellIds.map((id) => DOK_SPELL_CROSSWALK[id]).filter(Boolean)).size
         : 0;
   ```

   ```ts
   // before (referenceDb.ts:120-122):
         ...(m.regenPerRound !== undefined ? [{ label: 'Regen', value: `${m.regenPerRound}/rd` }] : []),
         ...(m.halfDamage ? [{ label: 'Half Dmg', value: 'Yes' }] : []),
       ]);

   // after:
         ...(m.regenPerRound !== undefined ? [{ label: 'Regen', value: `${m.regenPerRound}/rd` }] : []),
         ...(m.halfDamage ? [{ label: 'Half Dmg', value: 'Yes' }] : []),
         ...(castableSpellCount > 0
           ? [{ label: 'Spells', value: `${castableSpellCount} spell${castableSpellCount === 1 ? '' : 's'}` }]
           : []),
       ]);
   ```

   No change to `companionPanel.ts` — it already calls `monsterCategory(opts.source.monsters)`
   unmodified; the new row appears automatically for both callers wherever the input data supports
   it (i.e. only via the live DoK Companion panel, since the standalone `?refdb=1` route is
   hardcoded to CoK's `MON1CHA.DAX`, which has no `MON{n}WIZ.DAX` counterpart to join).

2. **Tests** (extend the existing `runExploreDok` e2e case only — no new test file, no new
   top-level case). In `apps/web/test/e2e.mjs`, insert a companion-panel check right after the
   existing `graphicsOk` block and before `ok = ...` is computed (`e2e.mjs:1390-1392`) — the first
   DoK-side Companion-panel e2e assertion, mirroring `runExplore`'s own CoK companion refdb check
   (`e2e.mjs:709-742`) but scoped to just this one new row:

   ```js
   // before:
         );
       }

         ok = cells === 256 && /Death Knights/i.test(mapName) && hasView && inBounds && ranMoves && undeadOk && itemsOk && graphicsOk && introOk;

   // after:
         );
       }

       // M55.S1 — the in-play Companion -> Databases (Monsters) tab now also shows a real DoK
       // caster's memorized-spell count (MonsterRecord.preparedSpellIds, joined since M31.S1), not
       // just AC/HD/THAC0/HP/Damage/XP/Morale/Size/Class. IGORF (MON1CHA block 97) crosswalks to
       // exactly 4 real castable spells (Fireball/Stinking Cloud/Magic Missile/Sleep) per this
       // round's own real-bytes derivation, matching m31-audit.md's independent verification.
       const companionOpened = await page.evaluate('window.__explore.openCompanion()');
       await page.evaluate("window.__companion.switchTo('refdb')");
       const igorfDetail = await page.evaluate(() => {
         const n = window.__companion.refEntryCount();
         for (let i = 0; i < n; i++) {
           const sel = window.__companion.refSelected();
           if (sel?.name === 'IGORF') return sel.detail;
           window.__companion.refMove(1);
         }
         return null;
       });
       await page.evaluate('window.__companion.close()');
       const igorfSpellsOk = companionOpened === true && Array.isArray(igorfDetail) &&
         igorfDetail.some((r) => r.label === 'Spells' && r.value === '4 spells');
       if (!igorfSpellsOk) errors.push(`igorf-spells: opened=${companionOpened} igorfDetail=${JSON.stringify(igorfDetail)}`);

       ok = cells === 256 && /Death Knights/i.test(mapName) && hasView && inBounds && ranMoves && undeadOk && itemsOk && graphicsOk && introOk && igorfSpellsOk;
   ```

   (Also widen the existing `if (!ok) errors.push(...)` diagnostic line at `e2e.mjs:1393` with
   `igorfSpellsOk=${igorfSpellsOk}` for consistency with the file's own convention, though this is
   cosmetic.)

Rough size: 1 new import + 1 new local + 1 new conditional row in `referenceDb.ts` (~12 LOC incl.
comments), ~14 LOC added to the existing `runExploreDok` case in `e2e.mjs`, 1 conjunction edit. No
engine-package file touched (every function used — `DOK_SPELL_CROSSWALK`, `applyPreparedSpellIds`,
`preparedSpellsFromDokIds` — already ships from `@goldbox/engine`), no new UI panel, no new route,
no new test file.

## Layout / feasibility check

`composeReferenceDb` (`packages/engine/src/render/referenceDb.ts:70-72,118-124`) caps the visible
detail sheet at `REFERENCE_DB_DETAIL_ROWS = 12` (rows 5..16) and silently truncates any `v.detail`
past that count (`Math.min(REFERENCE_DB_DETAIL_ROWS, v.detail.length)`) — a real, hard constraint
this round explicitly checked against real bytes (verification §2 above): the mandatory 9 rows
(AC/HD/THAC0/HP/Damage/XP/Morale/Size/Class) plus the new Spells row make 10, and none of the 14
real casters also populate the three other optional rows (Level/Save/Regen/Half Dmg), so no real
monster in the shipped bestiary can overflow the cap because of this addition.

The compositor also draws each detail *value* truncated to 8 characters
(`d.value.toUpperCase().slice(0, 8)`, `referenceDb.ts` render file, line 123) — but this is a
**canvas-drawing** truncation only; the underlying `RefDbDetailRow.value` string the e2e seam reads
back via `window.__companion.refSelected()` (`companionPanel.ts:408-414`) is the full, untruncated
string (confirmed by the existing CoK companion check's own `r.value === '3/rd'`/`'19'` exact-match
assertions, `e2e.mjs:738,740`, which compare against the JS model, not rendered pixels). The chosen
value format, `` `${n} spell${n===1?'':'s'}` ``, was sized against the real bestiary's actual range
(1-6 distinct crosswalked spells) so the ON-SCREEN text also fits without truncation for every real
monster (`"6 spells"` = 8 characters exactly, the real maximum; `"1 spell"` = 7).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **Systematic `33180d2`-sibling dead-container check** (this round's mandated first step) | Grepped every `document.querySelector`/`querySelectorAll('.class'/'#id')` target across `apps/web/src` (~140 call sites) and confirmed each has a real, matching creation site (`el(...)`, a literal `<div id=...>`/`className=` assignment, or a static `index.html` host div) somewhere in the tree. `33180d2` itself only touched `explore.ts`/`screenSurface.ts`/`viewer.css`; the one dead container it introduced (`.gb-party`) is M54's own fix, already live in the current tree (`explore.ts:1689`). No second orphaned container exists. `screenSurface.ts` (now `packages/ui-kit/src/screenSurface.ts` post-M12.S1) creates and manages its own canvas with no orphaned selectors. |
| **`MonsterRecord.itemPluses`/`.carriedItems`** (same side-table family as this round's pick) | Real, and reach the exact same `monsterCategory()` function via the exact same live-joined `state.monRecords` — but neither maps as cleanly onto a single terse `{label, value}` row (`itemPluses` is a plain number array with no item identity; `carriedItems` is a list of `{baseTypeId, count, value}` objects that would need a base-item-name lookup this function doesn't currently have). Left as a smaller, still-real follow-up rather than folded into this round's fix, to keep the change small per this round's brief. |
| **`MonsterRecord.conSaveBonus`** (same family) | Real (`tactical.ts:1318` — the con-save bonus vs. energy-drain-style saves), but it's a rare, dry mechanic (only relevant on the specific save roll `tactical.ts:1315-1318` guards) with no natural terse row wording that wouldn't misrepresent it as more broadly meaningful than it is (mirrors M38.S1's own reasoning for showing only the Save row that had a real consumer, not its four inert siblings) — left unpicked. |
| **ECL-recruited allies' `morale`** (`explore.ts`'s `allies()` seam, standing since M54) | Re-confirmed still real, still weaker (flavour-text only, rare `ADD_NPC` path) — not re-picked, no new angle developed. |
| **Hardcoded "✦ Create party (CoK)" wording in DoK-shared paths** (`explore.ts:547,703,919`, standing since M54) | Still real, still cosmetic/independent of any dropped-field fix — not picked. |
| **`referenceDb.ts`'s Class-label collision** (unpicked M38-M54, 19 rounds now) | Not re-investigated — no new angle this round; still flagged per the standing note. |
| **`DetectionMatch.series`/`.ruleset`/`.engineGen`** (standing, re-check requested) | Re-checked: `main.ts:709`'s DQK routing is still the explicit `entry.match.profileId === 'dark-queen-of-krynn'` special-case, unchanged from M54's own note — not unblocked, not picked. |
| **`saveStore.ts`'s `listSlots()`/`SaveSummary`** (standing, re-check requested) | Re-checked: `explore.ts`/`mainMenu.ts` still only ever read/write the single `QUICK_SLOT` — no multi-slot UI exists anywhere in `apps/web/src` yet. Still gated, not picked. |
| **`TacticalSpell.inflict`** (standing, "only pick up if a UI surface already exists") | Re-checked: it already has one — `combat.ts:604-619` already narrates every `inflict`/status event via the message log (`statusVerb`/`statusEndVerb`). Confirmed wired, not a gap; not picked (nothing new to fix). |
| **`importDokParty.ts`'s `mem`** (standing fallback since M32/M52) | Re-confirmed still real and still dropped from the on-screen import summary table (`main.ts:834-836` only renders `name`/`cls`/`level`/`hp`/`ac`) — genuinely weaker than this round's pick (it already reaches a player-visible panel, Camp → Magic → Memorize, one screen further on) and was set aside again in favour of the stronger, more direct headline. |
| **`wilderness.ts` not showing the moon phase the `__wild` seam already computes** (`moonPhasesForDay`, new this round) | Investigated: `moonPhasesForDay` is exposed on the `__wild` e2e seam (`wilderness.ts:321`) but never drawn on the overland screen itself. Set aside — unlike the dungeon screen's `.gb-moonbar` (a genuine companion aid restored by M54), there is no evidence the original CoK overland/wilderness screen ever showed moon phases at all (moons are a dungeon-screen widget in the source material), so omitting them here plausibly reads as period-accurate rather than a drop; would need a stronger primary-source citation before treating as a fix, unlike this round's pick, which is unambiguously "the data reaches the render function and it silently discards it." |
| **`audio.ts` (`?audio=1`)** | Read in full — small, self-contained, no orphaned selectors, no dropped fields found. |
| **`gswitch.ts`** | Re-confirmed clean (already listed as swept M42-M52); `.gswitch-meta`/`.gswitch-plat`/`.gswitch-cat` all have real creation sites. |

## Open questions / unknowns

- **Should `itemPluses`/`carriedItems` get their own row(s) in a follow-up round?** Real, reach the
  same function, but need either a base-item-name lookup (`carriedItems`) or a different
  presentation than a single terse value (`itemPluses`, a plain number array) — deliberately not
  folded into this round's fix to keep the change small; flagged as the natural next pick from this
  same standing candidate family.
- **Should the CoK side of `monsterCategory()` ever get an equivalent "casts a spell" row?** UNKNOWN
  whether CoK's own engine (older Gen1 sub-generation) ever modelled monster spellcasting at all —
  `MON{n}WIZ.DAX` is confirmed DoK-only (`m31-audit.md`), so this is likely a genuine, permanent
  asymmetry between the two games rather than a gap to fix, but not independently re-verified this
  round against CoK's own binary.
- **Is "N spell(s)" (a bare count) the right level of detail, or should the row eventually name the
  spells** (e.g. "Fireball+3")? The 8-character canvas-drawn value budget makes a full name list
  impractical for any caster with more than one spell; a count was chosen as the smallest honest
  value that fits every real monster in the shipped bestiary without truncation. The lead may prefer
  a different wording (e.g. abbreviated first spell name) — not a blocking question, since the
  underlying `RefDbDetailRow.value` is a plain string either way.
- **`wilderness.ts`'s undrawn `moonPhasesForDay` seam value** (raised and set aside above) — worth a
  primary-source check (does the original CoK wilderness/overland screen show moon phases at all?)
  before any future round treats it as a fix rather than a non-issue.

## Implications for our engine

- **A standing "rejected, bigger job" characterization can itself go stale and deserves the same
  scrutiny this loop already applies to in-game doc comments and player-facing text.** M54's
  dismissal of the `conSaveBonus`/`itemPluses`/`carriedItems`/`preparedSpellIds` family as "needs new
  UI surfaces per field" was accurate for three of the four fields but not for `preparedSpellIds`,
  which slots into an already-proven, already-reused extensible row mechanism with zero new UI. Worth
  re-examining a standing rejection's ACTUAL reasoning (not just its headline verdict) before
  carrying it forward unchanged for another round.
- **`referenceDb.ts`'s `monsterCategory()` is now a proven, repeatedly-reused "cheap display slot"
  for any side-table-joined `MonsterRecord` fact with a real combat consumer** — five separate
  M-series rounds (M37 Class, M38 Save, M43 Regen/Half Dmg, M55 Spells) have now added a row to this
  exact function for a fact that was already decoded and already deciding real combat outcomes but
  never shown. Any future side-table addition to `MonsterRecord` should check THIS function first,
  before assuming a new panel is needed.
- **The systematic `33180d2`-sibling dead-container check is a good one-time sweep, but appears to
  be exhausted for this codebase** — every `querySelector` target across `apps/web/src` now resolves
  to a real creation site; M54's `.gb-party` fix was the only orphan this refactor pattern produced.
  Future rounds probably don't need to re-run this exact mechanical check unless a new large
  DOM-to-canvas migration commit lands.
- **The DoK side of the live Companion panel had zero e2e coverage before this round** — the
  standing candidate list's own item #4 ("Real DoK Companion-Panel e2e positive controls") flagged
  this gap in passing; this round's wiring plan is the first assertion to actually open
  `window.__companion` during a `?explore=dok` session, which should reduce future rounds' need to
  re-flag that same standing item from scratch.
