# M41 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M35–M40 in full, and
> `docs/engine/research/m40-audit.md` in full (its Rejected-alternatives / Open-questions /
> Implications sections in particular). M40 widened the sweep beyond `referenceDb.ts` for the first
> time (to `charSheet.ts`) and its own "Implications" said future rounds should keep treating
> ruleset-derived fields as fair game and keep widening past the two already-mined chokepoints. Per
> this round's brief, swept every other named UI-projection file this round
> (`inventory.ts`, `town.ts`, `combat.ts`, `journal.ts`, `hudPanel.ts`, `automapPanel.ts`,
> `wilderness.ts`, `dqkExplore.ts`, `dialogue.ts`) by cross-referencing each file's compositor
> **input type** in `packages/engine/src/render/*.ts` against the compositor's own render body — the
> same "does the function have the field but never read it" check M37–M40 used, just against the
> *engine's* pure render layer instead of the `apps/web` wrapper this time. Every real-bytes/real-
> mechanic claim below was independently re-derived this round via a throwaway `vitest` script
> (`packages/engine/test/_scratch_m41_journalday.test.ts`, run, confirmed 4/4 green, then deleted —
> listed at the end). `git status --porcelain` is clean except this doc.
>
> **Headline pick: `JournalReadingView.day` (`packages/engine/src/render/journalScreen.ts:51`) — the
> 1-based "game day this journal page was recorded" field — is threaded correctly, end-to-end, by
> BOTH of its real UI callers (the standalone `?journal=1` route, `apps/web/src/ui/journal.ts:137`,
> and the in-play Companion Panel's Journal tab, `apps/web/src/ui/companionPanel.ts:204`) into the one
> shared engine compositor, `composeJournalScreen` — which never once reads it.** Proven this round by
> a pixel-identity test: the compositor emits a byte-for-byte identical 320×200 framebuffer whether
> `day` is `1`, `99`, or `undefined`.

## Headline finding

`JournalReadingView` (`packages/engine/src/render/journalScreen.ts:46-52`) is the "expanded page
currently being read" view-model `composeJournalScreen` takes as part of its input:

```ts
// journalScreen.ts:46-52
export interface JournalReadingView {
  id: number;
  title: string;
  body: string;
  category: JournalCategory;
  day?: number;
}
```

`.day` mirrors the engine's own `JournalEntry.day` (`packages/engine/src/world/journal.ts:19-31`, doc
comment: *"1-based game day the entry was recorded (0 = unknown / pre-dated)"*), set by
`Journal.record()` (`journal.ts:94-108`, `day: rec.day ?? 0`) and round-tripped losslessly by
`list()`/`get()`/`toJSON()`/`fromJSON()`.

**Both real UI callers thread `.day` through correctly, in the exact same one-line object literal
shape:**

1. `apps/web/src/ui/journal.ts:137` (the standalone `?journal=1` page's `buildView()`):
   ```ts
   reading: reading ? { id: reading.id, title: reading.title, body: reading.body, category: reading.category, day: reading.day } : null,
   ```
2. `apps/web/src/ui/companionPanel.ts:204` (the in-play Companion Panel's Journal tab, which
   independently re-derives the same view rather than importing `journal.ts`'s `buildView`):
   ```ts
   reading: reading ? { id: reading.id, title: reading.title, body: reading.body, category: reading.category, day: reading.day } : null,
   ```

Both call the **same** `composeJournalScreen` (`journalScreen.ts:111-179`). Inside it, the reading-pane
block (lines 153-164) reads `v.reading.id`, `v.reading.title`, and `v.reading.body` (twice — once for
the header, once via `wrapText`) and `v.reading.category` is read earlier for the entry-list colours
— but **`v.reading.day` is never referenced anywhere in the file.** `grep -n "reading.day\|reading\.\(day\)" packages/engine/src/render/journalScreen.ts` returns zero hits; `.day` exists purely as an
unread sibling on the exact object the function is already destructuring three other fields off of —
the same M37/M38 shape (the projection function had full access to the field, on the very object it
was already reading, and simply never checked it), just discovered in the **engine's own render
layer** this round instead of an `apps/web` wrapper.

### Why this is (and isn't) like M40's `robe` pick

- **Like `robe` (M40):** the fix is additive-only, the shared compositor reaches both UI surfaces
  (standalone view + Companion Panel) with a single change, and no engine test needs new setup (the
  golden fixture already carries a real `day: 1`, see Probe 4).
- **Unlike `robe` (weaker signal, flagged honestly):** `robe` had **two independent live mechanical
  consumers** (spell slots, combat saves) besides the missing display. `.day` has **zero** other
  consumers anywhere in the engine or UI — it is pure display metadata, the same shape as M39's
  `ItemRecord.count` ("Qty" row), which this loop already accepted as a legitimate pick despite having
  no second mechanical consumer either. `.day` is also **not decoded from original game bytes** (the
  whole Journal subsystem is the project's own clean-room replacement for the original games' printed-
  booklet "record it in Journal Entry N" copy-protection mechanic — see `world/journal.ts:1-13`'s own
  doc comment) — flagged explicitly, per this round's grounding rules, the same way M40 flagged `robe`
  as ruleset-derived rather than byte-decoded.
- **Also flagged honestly:** of the two real (non-demo) call sites that invoke `recordJournal` today
  (`apps/web/src/ui/dialogue.ts:375`, `apps/web/src/ui/town.ts:290`), **neither passes a `day`**, so
  both default to `0` (= "unknown/pre-dated") and would show nothing under the proposed additive-only
  fix. Only the three shipped **demo entries** (`journal.ts:76-86`, seeded unconditionally on every
  player's first journal view via `seedJournalIfEmpty()`) carry real non-zero `day` values (`1, 1, 2`)
  today. This is still a materially different (and stronger) situation than the rejected `age` field
  (M40): the demo pages are guaranteed, real, shipped content every single player sees on their first
  journal open in every one of CoK/DoK/DQK (one shared journal store) — not a 256-year edge case that
  "is effectively never true in normal play" (`explore.ts:735-738`). It is real, it varies, and it is
  guaranteed to be hit; it just isn't (yet) wired from every content call site, which is an honestly-
  scoped, separate, smaller follow-on (see Open questions).

## Real-bytes / real-mechanic verification (reproduced fresh this round)

Not a `.DAX`/`.GLB` byte decode — the Journal subsystem is entirely the engine's own clean-room content
model (see above). What follows is a fresh reproduction of the actual mechanic against the project's
current engine code, via `packages/engine/test/_scratch_m41_journalday.test.ts` (created, run, deleted
this round; `npx vitest run` → 4/4 passed).

### Probe 1 — `Journal.record()` really stores a real, varying, non-zero `day` per entry (matching `journal.ts`'s own real `DEMO_ENTRIES` verbatim)

| Entry (id, title) | `day` passed | `.day` returned |
|---|---|---|
| 1, "Setting Out" | 1 | **1** |
| 2, "The Hermit's Omen" | 1 | **1** |
| 3, "A Knight's Charge" | 2 | **2** |

`new Set(list().map(e => e.day)).size > 1` → **true** (real variety, not a degenerate constant, unlike
the rejected `age`/item-instance findings).

### Probe 2 — an entry recorded with no `day` really defaults to `0` (the honest "unknown" case, matching the real `dialogue.ts`/`town.ts` call sites verbatim)

`j.record({ id: 9, title: 'The Keep Revealed', body: 'w', category: 'quest' })` (no `day` key, exactly
matching `dialogue.ts:375`'s real call shape) → `.day === 0`. Confirmed this round, not fabricated.

### Probe 3 — `list()`/`get()` really round-trip `.day` end to end (the exact read path both `journal.ts`'s and `companionPanel.ts`'s `buildView`-equivalents use)

`j.record({ id: 5, title: 'T', body: 'B', category: 'story', day: 7 })` → `j.get(5)?.day === 7` **and**
`j.list()[0]?.day === 7`. Confirmed this round.

### Probe 4 — `composeJournalScreen` renders BYTE-IDENTICAL framebuffers whether `.day` is `1`, `99`, or `undefined`

Using the exact `JournalView` fixture already checked into `packages/engine/test/journalScreen.test.ts:17-25`
(which itself already carries a real `day: 1` in its `reading` object — nobody before this round asked
whether that value did anything):

```ts
const fbDay1  = composeJournalScreen({ font: solidFont(), view: base });                                    // day: 1
const fbDay99 = composeJournalScreen({ font: solidFont(), view: { ...base, reading: { ...base.reading!, day: 99 } } });
const fbNoDay = composeJournalScreen({ font: solidFont(), view: { ...base, reading: { ...base.reading!, day: undefined } } });
expect(Array.from(fbDay1.indices)).toEqual(Array.from(fbDay99.indices));   // PASSED
expect(Array.from(fbDay1.indices)).toEqual(Array.from(fbNoDay.indices));   // PASSED
```

Both equality checks passed — proof (not inference) that `.day` is a genuine dead end at the render
layer: every single one of the 320×200 = 64,000 indices is identical regardless of the value.

### Probe 5 — repo-wide grep confirms `.day` is never displayed anywhere, and this is genuinely new territory

```
$ grep -rn "\.day\b" apps/web/src packages/engine/src/render
```
Every hit is one of: `combat.ts`'s unrelated `cfg.day`/`toTactical(...)` game-day-of-year plumbing (a
different mechanic — the tactical combat clock, already wired since earlier M-rounds), `explore.ts`'s
unrelated `cal.day` (calendar day-of-month display, "Day N of Month M, Year Y" — a different field on
a different model, `PartyMemberStatus`'s calendar, not `JournalEntry.day`), `magic.ts`'s unrelated
`opts.day` (the moon-phase day argument, M40's territory), and the two `reading.day` pass-throughs in
`journal.ts:137` / `companionPanel.ts:204` documented above. **Zero** hits inside
`journalScreen.ts`'s own render body. `grep -iln "journal" docs/engine/research/m*-audit.md` turns up
five prior mentions (M25, M26, M33, M37, M40); only M33 actually read `journal.ts` and
`companionPanel.ts` in full (Part 4, its own "not yet mined" sweep) and found nothing — but M33's
method was grepping for explicit `CANDIDATE`/`TODO`/`UNLOCATED` markers, which this field carries none
of, and M33 never opened `packages/engine/src/render/journalScreen.ts` at all (its search was scoped to
`apps/web/src` + a `packages/engine/src` marker-grep, not this field-by-field cross-reference method).
Confirmed genuinely fresh this round, not a re-tread.

## Wiring plan

1. **`packages/engine/src/render/journalScreen.ts`** — one new conditional `drawText` call in the
   already-existing `if (v.reading)` block (lines 154-160), using the one confirmed-blank text row in
   the whole layout: row 12 (between the entry list's last row, 11, and the reading-pane header, row
   13 — `grep -n "rowY(12)"` returns zero hits anywhere in the file today, so this is a genuinely
   unused row, not a shared one).
   ```ts
   if (v.reading) {
     if (v.reading.day) {
       drawText(fb, font, `RECORDED — DAY ${v.reading.day}`.toUpperCase(), cell(2), rowY(12), C_GREY);
     }
     const head = `${v.reading.id}. ${v.reading.title.toUpperCase()}`.slice(0, 36);
     ...
   ```
   Gated on truthy `day` (so `day === 0` / "unknown" correctly shows nothing — additive only, matching
   this loop's established never-fabricate convention, e.g. M39's `if (it.count)`). `.toUpperCase()`
   matches every other `drawText` call in this file. No change to `JOURNAL_LIST_ROWS`,
   `JOURNAL_BODY_ROWS`, or any other existing row budget.

2. **`apps/web/src/ui/journal.ts`** — add one getter to the existing `__journal` e2e seam
   (`journal.ts:278-297`), right after the existing `readingTitle` getter (line 285), mirroring its
   exact shape:
   ```ts
   readingDay: () => (state?.readingId != null ? getJournal().get(state.readingId)?.day ?? null : null),
   ```
   No other change needed in this file — `buildView()` (line 137) already threads `day` through
   correctly today.

3. **`apps/web/src/ui/companionPanel.ts`** — no change required for correctness (line 204 already
   passes `day` through to the same fixed compositor); optionally add a matching
   `journalReadingDay: () => …` getter next to the existing `journalReadingTitle` getter
   (`companionPanel.ts:420-421`) for symmetry/verification of the Companion-Panel path specifically —
   the same optional-symmetry pattern M40 used for its own `charFooter` getter.

4. **Tests** (extend existing cases — no new test file, per this loop's established discipline):
   - `packages/engine/test/journalScreen.test.ts` — extend the existing golden `VIEW` fixture
     (already `day: 1`, line 24): add one new pixel assertion at the new row-12 location (e.g.
     `expect(px(fb, 16, 12 * 8)).toBe(8)` for the grey `C_GREY` day line), plus a negative-control test
     with `reading: { ...VIEW.reading!, day: undefined }` asserting the row-12 pixel stays `0`
     (background) — proving the omission for `day === 0`/undefined is honest, not untested.
   - `apps/web/test/e2e.mjs`'s **existing** `runJournal` case (id `'journal'`, lines 3519-3572,
     `?journal=1`) **already** selects and reads entry id 2 ("The Hermit's Omen", real `day: 1`) via
     `select(1); read();` at lines 3538-3542, and separately narrows the list to the "quest" filter
     (line 3552-3556), whose one match is entry id 3 ("A Knight's Charge", real `day: 2`). Extend it:
     right after the existing `readingId` check (line 3540), add
     `const readingDay = await page.evaluate('window.__journal.readingDay()')` and assert
     `readingDay === 1`; then, after the quest-filter block narrows to id 3, `select(0); read();` again
     and assert a second `readingDay() === 2` — proving real, non-degenerate day variety through the
     actual UI seam (not just the engine layer), reusing the exact page/party/journal setup this case
     already has. No new e2e case id, no new page navigation.

Rough size: ~3 LOC in `journalScreen.ts`, 1 LOC new e2e seam getter in `journal.ts`, optionally 1 LOC in
`companionPanel.ts`, ~2 new pixel assertions extending the existing engine golden test, ~4-6 LOC
extending the existing `runJournal` e2e case. No new engine test file, no new e2e file, no new route.

## Row-budget / layout feasibility check

`composeJournalScreen` is a fixed-position layout (like M40's `charSheet.ts`), not a scrolling list, so
`REFERENCE_DB_DETAIL_ROWS` doesn't apply. The relevant constants are `JOURNAL_LIST_ROWS = 7` (rows
5..11) and `JOURNAL_BODY_ROWS = 8` (rows 14..21); row 12 sits between them and is **confirmed unused**
by direct reading of the whole compose function this round (no `rowY(12)` call exists anywhere in the
file today) — the safest possible insertion point found in this entire M35-M41 series, since it
requires touching **zero** existing row budgets (unlike M40's charSheet fix, which extended an
existing ternary on an already-used row). Column budget: row 12 has the **full** row free (nothing
else draws there), so even a verbose label like `"RECORDED — DAY 9999"` (20 characters) is far under
the ~35-36-usable-column convention M40 established for this screen family. No truncation risk, no
collision with the list (stops at row 11) or the header (starts at row 13).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`referenceDb.ts`'s `Class`-label collision** (flagged M37, unpicked M38/M39/M40) | Re-confirmed still live and unpicked this round (`referenceDb.ts:104` `monsterCategory()`'s `Class` row vs. `referenceDb.ts:152` `spellCategory()`'s differently-meaning `Class` row) — still real, still cheap, still available as a safe fallback if a future round needs a guaranteed slice, but the journal-day finding is a genuinely fresh, similarly cheap, zero-collision pick, so per the standing preference this round defers the rename again. |
| **`apps/web/src/ui/inventory.ts` / `InventoryEntry.value`** (`items/inventory.ts:24-28`, `CarriedLoot.value` provenance) | Investigated in depth and rejected: **already wired and displayed**, not a gap. `.value` feeds `sellStack()`'s real resale-price formula at **both** its call sites (`town.ts:120`, `party.ts:1058`), and that computed price is what the shop screen actually shows the player — so this is a live, displayed mechanic already, just indirectly (through a formula) rather than a raw field. Confirmed via direct grep of all `.value`/`sellStack`/`CarriedLoot` usages this round; no new angle. |
| **`combatScreen.ts`'s `CombatCellState.hpFraction`** (`render/combatScreen.ts:117` — "drives the down state (skeleton uses `down` directly)") | Investigated and rejected: this field is dead on **both** ends, not just the display end — `apps/web/src/ui/combat.ts`'s `visibleCells()` (the only real caller) never sets it (only `down`/`active`/`size` are populated), and the compositor's `drawCombatant()` never reads it either. This doesn't fit the loop's shape (a real, populated, tested value silently dropped by a projection function) — it's an unbuilt scaffold stub on both sides, explicitly self-documented as such ("skeleton"), not a display bug. |
| **`MapCell.event`** (`model/index.ts:179`, real live consumer: `world/explorer.ts:137`'s `currentEvent()`, feeds `StepResult.event`) never shown on the Automap | Investigated and rejected for **grounding**, not shape: confirmed by direct reading of `loaders/geo.ts`'s `buildGeoResult()` (`geo.ts:157`, `cells[i] = { walls, doors, floor: backdropPlane[i], flags: d }`) that `.event` is **never set** by either the Gen1 (CoK/DoK DAX) or Gen2 (DQK HLIB) real-game GEO decoders — it is populated **only** by the FRUA module-authoring layer (`module/editor.ts:100-101`, `module/frua/importer.ts:75`). So for the three real Krynn games this field is always `undefined`; showing it on the Automap would be a real feature for the **authoring/FRUA-superset** layer, not a "real game data, unwired display" gap for CoK/DoK/DQK. Different scope from this loop's established pattern. |
| **`hudPanel.ts` / `PartyMemberStatus`** (all fields) | Re-confirmed fully exhausted: every field on `PartyMemberStatus` (`party.ts:387-404`: `name`/`hp`/`maxHp`/`ac`/`cls`/`down`/`dead`/`age`) is read by `buildRows()` (`hudPanel.ts:45-56`) except `age`, which M40 already investigated and rejected on value grounds (degenerate — "effectively never" varies in normal play). No new field, no new angle. |
| **`automapPanel.ts` / `MapCell.doorsOpen`** | Not re-investigated beyond confirming M40's rejection still holds (still a whole missing-subsystem gap, not a single display fix) — no new angle found this round. |
| **`townScreen.ts`, `wildernessScreen.ts`, `treasure.ts`** (full field-by-field compositor sweep) | All three compositors read every field their own `*View`/`*Input` interfaces declare — confirmed by direct reading of each full file this round. No gap found in any of the three. |
| **Item-instance subsystem** (`DokItemRecord.value`/`.magicBonus`/`.charges`/`.cursed`) | **Not re-investigated**, per standing instructions — blocked 12 consecutive rounds. |
| **`MonsterRecord.acSource`** | **Not re-investigated** — already rejected by M40 as internal decoder-audit metadata, not a player fact; no new angle sought. |

## Open questions / unknowns

- **Should `dialogue.ts`'s and `town.ts`'s real `recordJournal()` call sites start passing a real
  `day` (from the live game clock) instead of omitting it (defaulting to `0`)?** **UNKNOWN / out of
  scope for this round** — that would be a second, separate wiring gap (a caller never populating a
  field, the M39 shape) rather than this round's finding (a projection function dropping a field it
  already has). Worth a future round's attention once/if a live game-day counter is readily available
  at those two call sites; not investigated further here. If done, the display fix in this doc would
  immediately start showing real per-quest-event days too, with zero further render-layer work.
- **Exact wording of the new row-12 label** (`"RECORDED — DAY N"` vs. some shorter/different phrasing)
  is a cosmetic choice left to the implementer — not re-litigated here, since any reasonable phrasing
  fits the confirmed-ample column budget.
- **`MapCell.event`** (see Rejected alternatives) is a real, live mechanic for **authored FRUA
  modules** specifically (not the three original Krynn games) with zero Automap surfacing — worth
  revisiting if/when the FRUA-superset authoring layer grows its own dedicated map-editor UI, at which
  point "show event-linked cells" becomes an authoring-tool feature request rather than a "real game
  data hidden from the player" gap.

## Implications for our engine

- **The field-by-field compositor-vs-input-type cross-reference method (M37-M40's core technique)
  works just as well one layer down, directly against `packages/engine/src/render/*.ts`**, not just
  against the `apps/web/src/ui/*.ts` wrappers around them. This round's fix is entirely inside the
  engine package's own pure render layer — the `apps/web` changes are limited to a new read-only e2e
  seam getter, not the fix itself. Future sweeps should treat every `compose*Screen`/`compose*Panel`
  function in `packages/engine/src/render/` as a first-class target, the same way `referenceDb.ts`'s
  and `charSheet.ts`'s row-builders were.
- **A pixel-identity test (byte-comparing two framebuffers that differ only in the field under
  investigation) is now a proven, cheap way to *prove* a display gap in a pure compositor function**,
  stronger than a code-reading argument alone — worth reusing as a standard probe for any future
  `compose*` candidate in this family (M35-M41 hadn't used this exact technique before; it took two
  `expect().toEqual()` calls and no new fixtures).
- **Not every legitimate pick needs a second mechanical consumer.** M39's `.count` and this round's
  `.day` are both "pure display, zero other consumer" fields, and both are still real, honest,
  additive fixes — the bar this loop actually enforces is "real, non-fabricated, correctly-derived,
  and silently dropped by a projection function that already had it," not "drives N≥2 other systems."
  Future rounds shouldn't discard a candidate just because nothing else reads it, as long as it clears
  the non-degeneracy bar `age`/the item-instance subsystem failed.
- **A field that is real for shipped default/demo content but not yet threaded from every live call
  site (this round's `.day`) is a fundamentally different, weaker-but-still-real situation than a field
  that is *never* real for any real player action (M40's rejected `age`).** Worth keeping these two
  failure modes distinct in future write-ups: "guaranteed to show real variety at least once, for every
  player, via shipped content" clears the bar; "mathematically almost never fires" does not.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m41_journalday.test.ts` (4 tests: `Journal.record()`'s real
  varying/non-zero day values across the actual demo-entry shape, the real zero-default for an
  omitted day matching `dialogue.ts`'s real call shape, a `list()`/`get()` round-trip, and the
  pixel-identity proof that `composeJournalScreen` ignores `.day` entirely) — run via `npx vitest run`
  (4/4 passed), then deleted.
- Confirmed via `git status --porcelain` (clean except this doc) after deletion.
