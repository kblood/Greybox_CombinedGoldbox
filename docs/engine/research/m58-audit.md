# M58 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done-section entries for M53.S1–M57.S1 in full,
> and `docs/engine/research/m57-audit.md` in full (its Rejected-alternatives / Open-questions /
> Implications sections in particular), per the brief. The brief steered this round toward
> candidate #3 from its own standing list — `MonsterRecord.carriedItems`' item-identity gap
> (`baseItem()` only resolves a name for a thin slice of real carried items) — with an explicit
> instruction to check whether the post-combat treasure screen is already a better display
> chokepoint than a 7th `referenceDb.ts` row before assuming the bestiary needs one.
>
> **That investigation is real but does NOT pan out cleanly this round** (see "Candidate #3
> investigated and set aside" below) — real bytes show the post-combat treasure screen
> (`combat.ts`'s `state.phase === 'treasure'` view, fed by `rollTreasure`) **already** surfaces real
> item names for any foe whose carried items resolve via `baseItem()`, so a bestiary row would
> either duplicate that fact (post-hoc) or, when tested against the actual worst-case monster
> (FLAVIUS, M56's own row-count ceiling case), show **nothing at all** — 0 of FLAVIUS's 6 real
> carried items resolve a name via `baseItem()` (verified this round, not assumed). Per the brief's
> own fallback instruction, this round instead picked up a **different** standing candidate —
> `importDokParty.ts`'s `mem` (real memorized-spell carryover), flagged-but-set-aside by M52 and
> re-flagged as still-open by M57's own "Other standing candidates" list (#4).
>
> **This round's headline: the DoK→DQK import screen's on-screen summary table never shows how
> many real spells a caster's save carried over, even though that exact figure already drives a
> real DQK combat mechanic (`combatSpellsForMember()`) the moment the hero steps into a fight.**
> M52 set this aside because the fact "already reaches a player-visible panel" (Camp → Magic →
> Memorize) — true, but this round traces the SAME `memorizeStore` one hop further and finds it is
> not just a passive display fact sitting in a menu: `party.ts`'s `combatSpellsForMember()` reads
> it directly to build the real castable `TacticalSpell[]` for tactical combat. The import screen —
> the very first screen an imported hero's player sees — says nothing about it, and its own
> paragraph text ("combat stats are freshly derived...not read from the save") doesn't even
> mention spells exist as a carried-over fact, unlike the sibling CoK→DoK import table, which
> already has a dedicated XP column for its own byte-faithful figure.
>
> Confirmed via two throwaway `vitest` scripts (`packages/engine/test/_scratch_m58_verify.test.ts`
> and `packages/engine/test/_scratch_m58_mem.test.ts`, created, run — **5/5** and **3/3** green
> respectively — then both deleted; `git status --porcelain --untracked-files=all` confirmed clean
> before/after, modulo an unrelated concurrent commit from the shared multi-agent loop, see below).

## Candidate #3 investigated and set aside: `carriedItems`' item-identity gap

Per the brief, this was checked FIRST, with real bytes, against both proposed chokepoints.

1. **The post-combat treasure screen already shows real item identities today.**
   `apps/web/src/ui/combat.ts:511-527` (`draw()`, `state.phase === 'treasure'` branch) renders
   `haul.items.map((it) => ({ label: it.count > 1 ? \`${it.count} ${it.name}\` : it.name, ... }))`,
   and `haul` is `rollTreasure(...)` (`packages/engine/src/items/treasure.ts:55-84`), whose
   `items` array is built from **real** `carriedItems` filtered through `baseItem()`
   (`treasure.ts:66-73`: `.filter((it) => baseItem(it.baseTypeId)).map((it) => ({ ..., name:
   baseItem(it.baseTypeId)!.name, ... }))`). So "does the treasure screen already show item
   identity in some form" — **yes, unconditionally, for every foe whose carried items resolve.**
   Anything added to the bestiary for the same fact would be a **preview** of the same information
   the treasure screen already discloses post-hoc, not a first-time reveal.
2. **A cheaper alternative — enriching the EXISTING `Bonus XP` row (M56) with the resolvable item's
   name instead of adding a whole new row — was tried against real bytes and doesn't hold up.**
   `itemPluses[]` and `carriedItems[]` are index-aligned (both `.map()` over the identical
   `MonsterItem[]` in `applyItemPluses`/`applyCarriedItems`,
   `packages/engine/src/loaders/monsterSideTables.ts:346,367`) — confirmed this round via a
   throwaway test. So for each bonus-XP monster, the carried item with the *highest* `plus` can be
   looked up by matching array index and its name resolved via `baseItem()`. Real DoK area-1 result
   (all 16 real monsters with `lootBonusXp > 0`, decoded via `_scratch_m58_verify.test.ts`):

   | Monster | bonusXp | best-plus item id | resolves a name? |
   |---|---|---|---|
   | SKOMP | +1600 | 36 | no |
   | SIR DRYDEN | +4400 | 37 | no |
   | TANAR | +5600 | 36 | no |
   | **FLAVIUS** (M56's own row-cap worst case) | **+9600** | 50 | **no** |
   | SOLAMNIC KNIGHT ×2 | +400 | 18 | no |
   | BLACK MAGE / BLACK WIZARD | +2000 | 50 | no |
   | HIGH WIZARD | +3200 | 50 | no |
   | ROGUE MAGE HIGH | +3600 | 50 | no |
   | PATRIARCH / HIGH PRIEST | +400 | 8 | **yes — "Arrow"** |
   | EVIL WARRIOR / EVIL WARLORD | +400 | 18 | no |
   | DURFEY / UNDEAD DURFEY | +1600 | 37 | no |

   **Only 2 of 16 (PATRIARCH, HIGH PRIEST) resolve a name for their highest-plus item**, and the
   single worst-case monster the row-cap analysis already depends on (FLAVIUS, id 50, `itemPluses
   = [8,3,4,3,3,3]`, `carriedItems` base ids `[50,59,37,18,24,30]`) resolves **zero** of its 6
   items — `BASE_ITEMS` (`packages/engine/src/items/baseItems.ts:60-84`) only covers ids
   `{5,6,7,8,9,10,11,12,13,14,15,64,65,80,81,82,83,84}`, none of which match FLAVIUS's real ids.
   CoK area 1 fares similarly: 11 real monsters carry items, only 3 have ≥1 resolvable name
   (checked this round). Enriching the Bonus-XP row would show real text for 2 of 16 real DoK
   cases and be silently absent for the rest, including the exact monster the row-cap math is
   built around — a thin, inconsistent win, not a clean fix.
3. **Root cause is a data-catalogue coverage gap (an item-name catalogue with ~18 entries against
   real base-type ids well past 50), not a wiring gap** — the same character as the standing "gap
   B5" DoK byte-location issue: there is no hidden/dropped *code path*, the field already reaches
   every consumer that resolves it; the catalogue itself is thin. This matches M56's own
   characterization ("baseItem() ... only covers ~16 ids") and doesn't change with a fresh look.

**Verdict: real, but doesn't clear this round's bar.** Both proposed display chokepoints were
checked with real bytes as instructed; neither pans out as a clean, worthwhile wiring fix this
round (one duplicates an existing screen, the other is too thin against the real worst case). Per
the brief's explicit fallback instruction, the round moved to the next standing candidate instead
of forcing this one through.

## Headline finding

### The gap: a real DoK caster's carried-over memorized spells are computed, persisted, and already drive real DQK combat — but the import screen the player sees first never mentions them

`apps/web/src/ui/importDokParty.ts:218-227` (current state, unmodified):

```ts
export interface DokImportResult {
  /** Names of the characters that were imported, in slot order. */
  imported: string[];
  /** Per-character "name — Class L<level>" summary for display. */
  summary: { name: string; cls: CoreClassId; level: number; hp: number; ac: number }[];
  /** Names that couldn't be validated by `createCharacter` (e.g. an out-of-range ability score). */
  rejectedInvalid: string[];
  /** Names skipped because the 6-hero party was already full. */
  rejectedPartyFull: string[];
}
```

`importDokParty.ts:292-303` (current state, unmodified):

```ts
  clearParty();
  for (const { sheet, cls, level, hp, mem } of candidates) {
    if (!addToParty(sheet)) {
      result.rejectedPartyFull.push(sheet.name);
      continue;
    }
    result.imported.push(sheet.name);
    // M51.S1 — sheet.ac (M34.S1's real worn-gear-derived AC) was already computed and destructured
    // above, but never reached the on-screen summary; thread it through.
    result.summary.push({ name: sheet.name, cls, level, hp, ac: sheet.ac });
    if (mem) setMemorization(sheet.name, mem);
  }
```

`mem` (a real `Memorization`, `candidate.mem = memorizationFromDokIds(spellIds, candidate.cls)` at
`importDokParty.ts:281-283`) is destructured into scope at the exact same loop that builds
`result.summary` — one line below the AC fix M51.S1 already made for the identical shape of gap —
but is used ONLY to call `setMemorization`, never folded into the pushed summary row. `main.ts`'s
`startImportDok()` (the only consumer of `DokImportResult.summary`) renders exactly four columns:

`apps/web/src/ui/main.ts:834-842` (current state, unmodified):

```ts
  // M51.S1 — the real worn-gear-derived AC (M34.S1) was already computed per character but never
  // reached this table; add it as its own column.
  const rows = res.summary
    .map((s) => `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td><td>AC ${s.ac}</td></tr>`)
    .join('');
  panel.innerHTML =
    `<h2>Imported ${res.imported.length} hero${res.imported.length === 1 ? '' : 'es'} from Death Knights of Krynn</h2>` +
    '<p style="color:#9aa">Name and ability scores are taken byte-for-byte from your save. DoK\'s compact save ' +
    'record has no hit-point field and stores only unarmoured-baseline AC, so class, level, HP and effective ' +
    'combat stats are freshly derived for the level your save\'s THAC0 implies (not read from the save).</p>' +
    `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th></tr></thead><tbody>${rows}</tbody></table>`;
```

Confirmed this round, by direct source read: no occurrence of `mem`/`spell` (case-insensitive)
anywhere inside `startImportDok()`'s body (verified via a scratch test that isolates the exact
function text by line range and asserts the negative). The paragraph text talks about "combat
stats" being freshly derived and says nothing about spells at all — the player has no idea their
imported cleric/mage carried any spells over until they separately open Camp → Magic → Memorize.

### Why this is a stronger pick than M52's own reason for setting it aside

M52 (`docs/engine/research/m52-audit.md:275-285`) found this exact gap and explicitly declined to
headline it: *"unlike `CharacterSheet.ac` (M51) or `CharacterSheet.classes` (that round), the
carried-over spells DO reach a player-visible panel today — opening Camp → Magic → Memorize for
that hero shows the real 'used/slots' counts the carryover populated."* That is true but this
round traces the claim one hop further: `getMemorization`/`setMemorization` (`party.ts:633-641`)
back the SAME `memorizeStore` that `combatSpellsForMember()` (`party.ts:654-677`) reads to build
the real `TacticalSpell[]` a hero can cast in **live tactical combat**:

```ts
// party.ts:654-663 (current state, unmodified)
export function combatSpellsForMember(id: string): TacticalSpell[] {
  const idx = Number.parseInt(id.slice(1), 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= roster.length) return [];
  const sheet = roster[idx];
  const mem = getMemorization(sheet.name);
  const healBonus = deityHealDieBonus(sheet.deity);
  const out: TacticalSpell[] = [];
  for (let level = 1; level <= 5; level++) {
    const counts = new Map<string, number>();
    for (const spellId of memorizedAt(mem, level)) counts.set(spellId, (counts.get(spellId) ?? 0) + 1);
```

So the carried-over `mem` isn't just a passive figure waiting in a menu — it's the live input to
what an imported DoK hero can actually DO in DQK combat, the moment the player steps into a fight,
with zero further action required. The import screen's own text implies "everything not
byte-faithfully read is freshly derived / not carried" (talking only about "combat stats"), while
in fact one whole other faculty (spellcasting) WAS carried from the save and is already load-bearing
— and the screen the player sees at the exact moment of import says nothing about it. This is a
strictly stronger case than M52 had when it declined: it establishes the fact is not just
*eventually* visible in a settings-style panel, but *immediately* mechanically active, and the one
screen best positioned to disclose "here's what carried over" (it already does so for name,
abilities, HP, AC) omits it while the CoK→DoK sibling import table (`main.ts:761-774`) has an
analogous dedicated column (XP) for its own byte-faithful/derived figures.

## Real-bytes / real-mechanic verification (this round)

Reproduced via `packages/engine/test/_scratch_m58_mem.test.ts` (created, run, **3/3 passed**, then
deleted) and `_scratch_m58_verify.test.ts` (created, run, **5/5 passed**, then deleted);
`git status --porcelain --untracked-files=all` was empty immediately before this doc was written
(one unrelated file, `docs/engine/research/m39-audit.md`, was committed by a concurrent session
mid-round per this repo's async multi-agent workflow — confirmed via `git log` to be someone
else's completed M39.S1 work, not a leftover from this round):

1. **Real DoK `CHRDATA3.GAM`/`CHRDATA3.WIZ` (TANAR)**: decodes name "TANAR", 12 real `.WIZ` spell
   ids, class-voted `cleric` (matching `m33-audit.md`'s own finding), and
   `memorizationFromDokIds(spellIds, 'cleric')` yields a real, defined `Memorization` with
   **2** total memorized spells post-crosswalk-and-class-filter:
   `byLevel = [[], ["c2-hold-person"], [], ["c4-cure-serious-wounds"], []]` — matching the existing
   `runImportDok` e2e case's own `tanarMem` assertion (`e2e.mjs:2283,2287`) exactly.
2. **Real DoK `CHRDATA4.GAM`/`CHRDATA4.WIZ` (FLAVIUS)**: 22 real `.WIZ` spell ids, class-voted
   `cleric`, yields **1** total memorized spell: `byLevel = [[], ["c2-hold-person"], [], [], []]` —
   matching the existing e2e case's `flaviusMem` assertion exactly.
3. **`importDokParty.ts`'s exact current source text** (read directly): `DokImportResult.summary`'s
   inline type has no `mem`/`spell`-named field; `result.summary.push(...)` passes only
   `{name, cls, level, hp, ac: sheet.ac}` — confirmed via regex match against the live file.
4. **`main.ts`'s `startImportDok()` function body, isolated by exact line range** (`804` to the next
   top-level function declaration) **contains zero occurrences of `mem` or `spell`** — confirmed
   the gap is real and not already partially addressed anywhere in that function.
5. **`itemPluses[]`/`carriedItems[]` index-alignment** (used to evaluate Candidate #3, see above):
   confirmed by source read of `applyItemPluses`/`applyCarriedItems` — both are separate `.map()`
   calls over the SAME underlying `MonsterItem[]` array per monster
   (`monsterSideTables.ts:346,367`), so index `i` means the same physical item in both arrays.
6. **`baseItem()` name-resolution over real bonus-XP-carrying DoK monsters**: 2 of 16 resolve a
   name for their highest-plus item; FLAVIUS (the row-cap worst case) resolves 0 of 6. CoK area 1:
   3 of 11 item-carriers have ≥1 resolvable name.

Full engine suite re-run after adding both scratch files: **1344 tests passed** (1336 baseline + 5
+ 3 new scratch tests), then both scratch files were deleted and the suite re-confirmed back at
**1336 passed, 0 failed**. `git status --porcelain --untracked-files=all` is clean except this doc.

## Wiring plan

**Two UI files touched (`importDokParty.ts`, `main.ts`) plus an extension to the existing
`runImportDok` e2e case (reusing its already-existing `__importDok.memorization()` seam and
`.import-table` DOM-text check, the exact pattern M51.S1 used for the AC column) — no new UI
panel, no new route, no new seam function, no engine-package change (`memorizationFromDokIds`
already ships from `@goldbox/engine` and is already imported into `importDokParty.ts`).**

1. **`apps/web/src/ui/importDokParty.ts`** — extend `DokImportResult.summary`'s inline type
   (line 222) with an optional `mem` count:

   ```ts
   // before:
   summary: { name: string; cls: CoreClassId; level: number; hp: number; ac: number }[];

   // after:
   /** Per-character "name — Class L<level>" summary for display. M58.S1 — `mem` is the real
    * carried-over memorized-spell TOTAL (post-crosswalk, post-class-filter — the exact figure
    * `combatSpellsForMember()` already builds real combat spells from), `undefined` for a
    * non-caster or a caster whose `.WIZ` spells didn't survive the crosswalk/class filter (never
    * fabricated as "0 spells"). */
   summary: { name: string; cls: CoreClassId; level: number; hp: number; ac: number; mem?: number }[];
   ```

   Then at the push site (line 301), thread the already-destructured `mem` (no new fetch, no new
   join — `mem` is already in scope from the `for (const { sheet, cls, level, hp, mem } of
   candidates)` loop one line above):

   ```ts
   // before:
   result.summary.push({ name: sheet.name, cls, level, hp, ac: sheet.ac });

   // after:
   // M58.S1 — mem (the real carried-over Memorization, already computed above and already fed to
   // setMemorization one line below) was never folded into the on-screen summary; thread the total
   // memorized-spell count through so the import screen discloses it like every other derived stat.
   result.summary.push({ name: sheet.name, cls, level, hp, ac: sheet.ac, mem: mem ? mem.byLevel.flat().length : undefined });
   ```

   No change to `setMemorization`, `memorizationFromDokIds`, or any engine-package file.

2. **`apps/web/src/ui/main.ts`** — add a 5th column to `startImportDok()`'s table (lines 834-842):

   ```ts
   // before:
   const rows = res.summary
     .map((s) => `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td><td>AC ${s.ac}</td></tr>`)
     .join('');
   ...
   `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th></tr></thead><tbody>${rows}</tbody></table>`;

   // after:
   // M58.S1 — s.mem (the real carried-over memorized-spell total, importDokParty.ts) was already
   // computed and already driving real combat via combatSpellsForMember(), but this table never
   // said so; add a Spells column, honestly showing "—" for a non-caster/no-surviving-spells case
   // instead of a fabricated "0 spells" (matches this codebase's established zero-omission idiom).
   const rows = res.summary
     .map((s) => `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td><td>AC ${s.ac}</td><td>${s.mem ? `${s.mem} spell${s.mem === 1 ? '' : 's'}` : '—'}</td></tr>`)
     .join('');
   ...
   `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th><th>Spells</th></tr></thead><tbody>${rows}</tbody></table>`;
   ```

   No other function in this file needs touching.

3. **Tests** (extend the existing `runImportDok` e2e case only — no new test file, no new seam).
   In `apps/web/test/e2e.mjs`, the case already computes `flaviusMem`/`celesteMem`/`drydenMem`/
   `tanarMem` via the existing `__importDok.memorization()` seam (lines 2280-2287) and already has
   an `acShownOk` DOM-text check against `.import-table` (lines 2302-2307) — add a sibling
   `memShownOk` check right after it:

   ```js
   // after e2e.mjs:2307 (acShownOk), before the `ok = ...` line:
   // M58.S1 — the on-screen import table now shows each caster's real carried-over memorized-spell
   // total (importDokParty.ts's mem, already proven via the memorization() seam above); confirm the
   // rendered HTML text agrees, proving the fix is actually visible, not just computed. SIR DRYDEN
   // (non-caster) must show "—", never a fabricated "0 spells".
   const memShownOk = /SIR DRYDEN[\s\S]*?—/.test(tableText)
     && /FLAVIUS[\s\S]*?1 spell</.test(tableText)
     && /TANAR[\s\S]*?2 spells</.test(tableText)
     && /CELESTE[\s\S]*?4 spells</.test(tableText);

   // widen the existing conjunction (e2e.mjs:2308):
   ok = count === 5 && named && faithful && everyoneClassed && drydenIsFighter && flaviusIsCleric
     && tanarIsCleric && hpDerived && neacailRejected && memOk && acOk && acShownOk && memShownOk;

   // widen the existing error message (e2e.mjs:2309-2317) to also report memShownOk.
   ```

   `CELESTE`'s real total is **4** (`celesteMem` already asserted as
   `['m1-magic-missile','m1-magic-missile','m3-fireball','m3-fireball']`, `.length === 4`) —
   re-derived this round from the SAME already-passing seam values the case computes today, so no
   new real-bytes probe is needed beyond what `_scratch_m58_mem.test.ts` already confirmed for
   TANAR/FLAVIUS.

Rough size: 1 new optional interface field + 1 one-line push-site edit in `importDokParty.ts`; 1
new `<th>`/one-line `.map()` edit in `main.ts`; ~6 LOC added to the existing `runImportDok` e2e
case. No engine-package file touched — engine test count should remain 1336 (this round's scratch
tests are deleted, not shipped). No new UI panel, no new route, no new test file.

## Layout / feasibility check

Unlike `referenceDb.ts`'s bestiary panel (a fixed 12-row canvas compositor) or `combat.ts`'s fixed
320×200 message log, `.import-table` is a **plain, unstyled HTML `<table>`** — confirmed this round
by a repo-wide grep for `import-table` across every `.css`/`.ts` file: the only three hits are the
two `main.ts` template-literal class-name assignments and the two `e2e.mjs` DOM-text reads; **no
stylesheet rule of any kind targets it** (the same "unstyled, browser reflows naturally" situation
M52 found for `#dqk-roster`'s `.gb-note` div, and a strictly lower-risk category than any fixed-grid
canvas surface this project's audits have had to budget column-widths for). Adding a 5th `<th>`/
`<td>` pair is a trivial, well-supported HTML operation with no truncation or overflow risk —
browsers grow table columns to fit content and wrap freely. The real worst-case cell value
(`"4 spells"`, CELESTE) is short; even a hypothetical much larger memorized count would just widen
the column, not clip or corrupt adjacent cells.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **A 7th `monsterCategory()` row for `carriedItems`' item name(s)** | This round's own primary target per the brief — investigated first, with real bytes, and set aside: the post-combat treasure screen (`combat.ts`'s treasure phase, fed by `rollTreasure`) already discloses real item names for any foe whose items resolve, so a bestiary row would duplicate that fact rather than reveal a new one; and the row-cap's own worst-case monster (FLAVIUS) resolves **zero** of its 6 real carried items to a name, undermining the row's usefulness for exactly the case the row-cap math is built around. See "Candidate #3 investigated and set aside" above. |
| **Enriching the EXISTING M56 Bonus-XP row with the top-plus item's resolved name** (instead of a whole new row) | Considered as a cheaper alternative to a 7th row (reuses index-aligned `itemPluses`/`carriedItems`, confirmed this round) — but real-bytes coverage is too thin to be worthwhile: only 2 of 16 real DoK bonus-XP monsters resolve a name for their top item, and FLAVIUS (the flagship row-cap case) resolves none. Rejected as a weak, inconsistent enhancement rather than a clean fix. |
| **Fixing `BASE_ITEMS`' thin catalogue coverage directly** (adding more real item ids/names) | Real underlying cause of Candidate #3's weak resolution rate — but this is a data-entry/decode task (locating and naming more real base-type ids across `ITEM{n}.DAX`/`MON{n}ITM.DAX`), not a "wire an already-computed fact" fix; out of scope for this round's audit shape, flagged in Open Questions instead. |
| **Re-picking DoK's `xp`/`hitPoints` = 0 gap (gap B5)** | Explicitly out of scope per the brief — a byte-location reverse-engineering task, not a UI-wiring gap; left exactly where M57 left it. |
| **The DoK-side `runItemPluses` e2e `.auto()`-resolution follow-up flagged by M57** | Not picked up this round — the brief allowed it only as an optional path if pursuing a verification/hardening angle on M57's own fix; this round's headline is a fresh field instead, per the brief's stated preference. |
| **`referenceDb.ts`'s Class-label collision, `wilderness.ts`'s `moonPhasesForDay`, ECL-recruited-ally `morale`, `dialogue.ts`/`town.ts`'s `day`-wiring gap** | All standing candidates from M54-M57's own lists — not re-investigated this round; the brief's primary lead (Candidate #3) was checked first, found weak, and the round moved to the next-listed standing candidate (`importDokParty.ts`'s `mem`) per the brief's own fallback instruction, rather than these others. |
| **Re-running the systematic dead-container (`33180d2`-sibling) sweep** | Not re-run — M55 already confirmed it exhausted; no new large DOM-to-canvas migration commit has landed since. |

## Open questions / unknowns

- **Should `BASE_ITEMS`' catalogue coverage be expanded** (more real base-type ids/names from
  `ITEM{n}.DAX`/`MON{n}ITM.DAX`) as its own dedicated data-entry task? This would directly improve
  both Candidate #3's bestiary-row and Bonus-XP-row-enrichment ideas (raising the 2/16 and 3/11
  resolution rates found this round) and the post-combat treasure screen's own item-name coverage.
  **UNKNOWN** whether this is better scoped as a focused decode task (a future round tracing
  `ITEM{n}.DAX`'s own catalogue records for more names) or left as-is; flagged, not attempted this
  round (out of the "wire an existing computed fact" shape).
- **`CELESTE`'s real total (4 memorized spells) was re-derived from the existing e2e case's own
  already-passing `celesteMem` assertion, not independently re-decoded from raw `.WIZ` bytes this
  round** (unlike TANAR/FLAVIUS, which were re-verified from scratch via
  `_scratch_m58_mem.test.ts`) — low risk, since that assertion is already live and green in the
  current suite, but worth the lead double-checking if `CHRDATA6.WIZ`'s bytes ever change.
- **Should the Spells column read "N spell(s)" or something more DQK-flavoured** (e.g. "N
  memorized")? Not blocking — a wording choice; the honest-omission behavior (`—` for
  non-casters/no-survivors) is the load-bearing part, not the exact label.
- **`LILLITH`'s memorized-spell total was not checked this round** (the existing e2e case only
  probes FLAVIUS/CELESTE/DRYDEN/TANAR) — she's a real party member (`acShownOk` already asserts her
  AC) and per `m34-audit.md` also wears real armor implying she's one of the 6 real pregens with a
  populated `.WIZ`; not required for this round's fix (the four already-asserted names are enough
  to prove the column renders correctly across the caster/non-caster split), but a natural addition
  if the lead wants a 5th real-name check.

## Implications for our engine

- **A standing "set aside, not headlined" note can be worth revisiting with a deeper trace, not
  just a fresh look at the same evidence.** M52's own reason for declining this exact gap
  ("it already reaches a player-visible panel") was correct as far as it traced — but tracing one
  hop further (`getMemorization` → `combatSpellsForMember`) shows the fact is not just passively
  visible somewhere else, it is **actively driving a different, more consequential system** (real
  tactical combat) than the panel M52 checked. A "weaker candidate" verdict should be re-examined
  by asking "what ELSE reads this same store," not just "is it visible anywhere at all" — the two
  questions can have different answers.
- **Checking the brief's steered-toward candidate first, honestly, and moving on when it doesn't
  pan out, is itself useful signal** — Candidate #3's investigation (both the bestiary-row and the
  Bonus-XP-row-enrichment ideas) produced a clean, real, byte-grounded "this doesn't clear the bar"
  finding (FLAVIUS resolves 0/6 items) that closes off two specific follow-up ideas for future
  rounds without them needing to re-derive the same real-bytes table from scratch.
- **The CoK→DoK and DoK→DQK import screens are still not at feature parity with each other** — the
  CoK-side table already has an XP column (`main.ts:761-774`); this round's fix brings the DoK-side
  table to a comparable "disclose what's carried over vs. derived" standard for its own most
  distinctive carried-over fact (spells), narrowing, but not eliminating, the gap between the two
  screens' conventions. A future round could do a direct side-by-side parity sweep of both import
  tables' column sets against everything each importer actually computes.
- **The monster-carried-item family's name-identity gap (Candidate #3) is now root-caused as a
  catalogue-coverage problem, not a code gap, across BOTH of its two candidate consumers** (the
  bestiary row idea and the Bonus-XP-row enrichment idea) — a useful, reusable finding for any
  future round tempted to revisit either idea without first checking whether `BASE_ITEMS` has grown.
