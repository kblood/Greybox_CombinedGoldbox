# M52 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M47–M51 in full, and
> `docs/engine/research/m51-audit.md` in full (its Rejected-alternatives / Open-questions / Implications
> sections in particular). Per the brief, `importParty.ts`/`importDokParty.ts` were re-opened ONLY to
> check for a second, genuinely different dropped field (methods (a)/(b)) — none was found strong enough
> to headline (see the dedicated sub-section below) — and the round then swept a wide set of previously
> untouched files (`gameData.ts`, `catalog.ts`, `assetSource.ts`, `docs.ts`, `inventory.ts`'s pre-hoc
> angle, `magic.ts`'s cast/scribe flow, `wilderness.ts`, `saveStore.ts`'s `listSlots()` re-check,
> `library.ts`'s `DetectionMatch.series`/`.ruleset`/`.engineGen` re-check, `buildDqkGame.ts`) before
> landing on this round's headline in `apps/web/src/ui/dqkExplore.ts` — a file never mentioned in any
> prior round's swept-clean list.
>
> **Headline pick: `dqkExplore.ts`'s `renderRosterLine()` — the plain-text "Party" line shown directly
> under the DQK explore view's command bar — drops `CharacterSheet.classes` (class + level), even though
> its own doc comment explicitly promises "names + class/level summary," a ready-made formatter
> (`classLabel()`) already exists one import away, and the identical fact is already shown this same way
> for the CoK/DoK sibling's own HUD panel via the exact same formatter.**
>
> Every real-mechanic claim below was independently re-derived this round via a throwaway `vitest`
> script (`packages/engine/test/_scratch_m52_verify.test.ts`, created, run, **5/5 green**, then deleted).
> `git status --porcelain --untracked-files=all` is clean except this doc.

## Headline finding

### The field: `CharacterSheet.classes` (rendered via `classLabel()`)

`apps/web/src/ui/dqkExplore.ts` boots the DQK Heroes of the Lance (`installDqkParty()`,
`dqkParty.ts:53-63`) — six pre-made, per-hero-distinct `CharacterRequest`s
(`dqkParty.ts:16-41`: `STURM` a level-6 Knight, `CARAMON` a level-7 Fighter, `TANIS` a level-6 Fighter,
`GOLDMOON` a level-6 Cleric, `RAISTLIN` a level-6 Magic-User, `TASSLEHOFF` a level-7 Thief) — through the
real ruleset `createCharacter()`, then calls `renderRosterLine()` to surface the loaded party right under
the command bar:

```ts
// apps/web/src/ui/dqkExplore.ts:936-948 (current state, unmodified)
/** C4.3 — surface the loaded DQK party under the command bar (names + class/level summary). */
function renderRosterLine(): void {
  const line = document.querySelector('#dqk-roster') as HTMLElement | null;
  if (!line) return;
  const party = getParty();
  if (party.length === 0) {
    line.textContent = 'No party loaded.';
    line.className = 'gb-note';
    return;
  }
  line.textContent = `Party (${party.length}): ` + party.map((p) => p.name).join(', ');
  line.className = 'gb-note dqk-roster-loaded';
}
```

The doc comment's own words — **"names + class/level summary"** — describe a feature the body never
builds: it maps to `p.name` only, discarding `p.classes` entirely, even though `CharacterSheet.classes`
is real, already computed by `createCharacter()`, and already the exact record the rest of the engine
reads for every combat/spellcasting/AC/THAC0 calculation that hero will ever make. Today, walking into
`?dqk=1` shows:

```
Party (6): STURM, CARAMON, TANIS, GOLDMOON, RAISTLIN, TASSLEHOFF
```

with zero indication of who is the Knight, who is the Mage, or what level anyone is — despite the
heroes being deliberately built with six *different* classes at meaningfully different levels
specifically to exercise the ruleset's class variety (`dqkParty.ts`'s own header comment: "a
ready-to-play roster so the shared Phase-A systems run *driven by a DQK party*").

### The ready-made formatter already exists, one import away

`apps/web/src/ui/party.ts` already exports exactly the formatter this line's own doc comment wants:

```ts
// apps/web/src/ui/party.ts:368-384 (current state, unmodified)
/** Short class/level label, e.g. "FTR 3" or "F/M 3/3" (most-martial class first). */
const CLASS_ABBR: Record<DragonlanceClassId, string> = {
  fighter: 'FTR', knight: 'KNT', ranger: 'RGR', thief: 'THF', cleric: 'CLR', magicUser: 'MU',
};

export function classLabel(classes: Partial<Record<DragonlanceClassId, number>>): string {
  const present = WEAPON_PRIORITY.filter((c) => (classes[c] ?? 0) > 0);
  if (present.length === 0) return '';
  if (present.length === 1) return `${CLASS_ABBR[present[0]]} ${classes[present[0]]}`;
  return `${present.map((c) => CLASS_ABBR[c]).join('/')} ${present.map((c) => classes[c]).join('/')}`;
}
```

`dqkExplore.ts` already imports three other functions from this exact file
(`partyCombatants, partySize, getParty` — `dqkExplore.ts:73`) — `classLabel` is a fourth name in the
same import statement, not a new module boundary to cross. This mirrors M49's own "shipped same-file/
sibling-file precedent" reuse shape (`rangeTag()`) almost exactly: a formatter built for one screen,
never carried one import further to a sibling screen that documents wanting it.

### The sibling CoK/DoK view already shows the identical fact via the identical formatter

`party.ts`'s own `partyStatus()` — the live projection the CoK/DoK "HUD companion panel" reads —
already calls `classLabel()` for exactly this purpose:

```ts
// apps/web/src/ui/party.ts:406-417 (current state, unmodified, abridged)
export function partyStatus(): PartyMemberStatus[] {
  return roster.map((s) => ({
    name: s.name,
    hp: s.hp,
    maxHp: s.maxHp,
    ac: s.ac,
    cls: classLabel(s.classes),
    down: s.hp <= 0,
    dead: deadStore.has(s.name),
    age: memberAge(s.name),
  }));
}
```

and the pure-engine `composeHudPanel` compositor really draws that column
(`packages/engine/src/render/hudPanel.ts:136`: `drawText(fb, font, m.cls.toUpperCase().slice(0, 8), ...)`).
DQK's own Companion panel (`companionPanel.ts`) already reuses this exact same `buildHudRows()`
(`hudPanel.ts:45-56`, itself `partyStatus()` plus XP) for its own "hud" tab
(`companionPanel.ts:154-159`), reachable via the "(C)ompanion" button `dqkExplore.ts:1123` already wires.
So the fact is **not** completely inaccessible to a DQK player today — but it is gated behind an explicit
extra click into a different, modal overlay, whereas `renderRosterLine()`'s whole documented purpose was
to put it in the single always-visible line directly under the command bar, at zero extra clicks — the
exact convenience its own doc comment promises and today does not deliver.

### CoK/DoK's own always-visible dungeon-crawl screen does NOT show class either — confirming this gap is DQK-specific, not a redundant duplicate

To rule out "this is just a duplicate of something the main dungeon screen already shows," the CoK/DoK
sibling's own always-on right-hand party panel was checked:

```ts
// packages/engine/src/render/exploreScreen.ts:143-157 (current state, unmodified)
/** One party row as shown in the right panel. */
export interface ExploreParty {
  name: string;
  ac: string | number;
  hp: string | number;
  active?: boolean;
  down?: boolean;
}
```

No `cls` field — CoK/DoK's own faithful in-dungeon HUD (name/AC/HP only, matching the original game's
own layout) doesn't show class/level either; only the separate Companion/HUD panel does, for **both**
games. `dqkExplore.ts`'s `renderRosterLine()` is not a duplicate of `ExploreScreenInput`'s party panel —
DQK's explore view has no equivalent graphical always-on HUD row at all, and `renderRosterLine()` (C4.3)
is the one piece of always-visible party information the DQK view was specifically built to carry in
its place. That is precisely why its own doc comment sets the (currently unmet) bar at "class/level," a
bar CoK/DoK's own dungeon screen was never asked to clear.

## Why this fits the loop's established shape

1. **A real, already-decoded/derived engine field** (`CharacterSheet.classes`, via `createCharacter()`)
   **with a real consumer** — it is the exact record every combat/spell/AC/THAC0 calculation for that
   hero reads for the rest of the game.
2. **A doc-comment-vs-code mismatch** (method (c)) — `renderRosterLine()`'s own comment says "class/level
   summary"; the body doesn't build one. Same shape as M51's CoK-import paragraph claiming AC was shown
   when it wasn't.
3. **Sibling-formatter reuse already precedented** (methods (d)/(f)) — `classLabel()` is already
   exported, already used by the CoK/DoK HUD panel and by `magic.ts`'s title bar
   (`caster.sheet.name — classLabel(caster.sheet.classes)`, `magic.ts:190`), and already one import away
   in the very file with the gap.
4. **A fresh file** — `dqkExplore.ts` is not in any prior round's swept-clean list (M42–M51); this is the
   first round to touch it.
5. **Small and precisely isolated** — one function, one import line, no engine-package change, no new
   overlay/route.
6. **Zero engine-package change** — `apps/web/src/ui/dqkExplore.ts` only (plus a one-line e2e extension).

## Real-bytes / real-mechanic verification (this round)

Reproduced independently via `packages/engine/test/_scratch_m52_verify.test.ts` (created, run, **5/5
passed**, then deleted):

1. **The 6 real DQK Heroes of the Lance build to 6 distinct, correct, non-degenerate class/level
   labels** — the exact `DQK_HEROES` `CharacterRequest`s (transcribed verbatim from `dqkParty.ts:16-41`)
   fed through the real, exported `createCharacter()`, then through `classLabel()`'s own algorithm
   (transcribed verbatim from `party.ts:368-384`, since this package cannot import the browser-only
   `apps/web` UI layer): `STURM → 'KNT 6'`, `CARAMON → 'FTR 7'`, `TANIS → 'FTR 6'`,
   `GOLDMOON → 'CLR 6'`, `RAISTLIN → 'MU 6'`, `TASSLEHOFF → 'THF 7'` — 5 distinct labels across 6 heroes
   (Caramon/Tanis share the Fighter class at different levels, the one deliberate overlap).
2. **`renderRosterLine()`'s own doc comment promises a class/level summary its body never builds** —
   source-text proof: the doc-comment block matches `/names \+ class\/level summary/`, the body matches
   the literal `party.map((p) => p.name).join(', ')` expression, and the same block does **not** match
   `/classLabel/` or `/\.classes/` anywhere.
3. **`classLabel()` already exists, exported, in `party.ts`** — source-text proof:
   `export function classLabel(` is present verbatim.
4. **`dqkExplore.ts` does not currently import `classLabel` from `party.js`** — source-text proof: the
   `import { ... } from './party.js';` statement's captured group does not match `/classLabel/`.
5. **The sibling CoK/DoK explore HUD already shows the identical fact via the identical formatter** —
   source-text proof: `party.ts` contains the literal `cls: classLabel(s.classes)`.

## Wiring plan

**One file touched, no engine-package change — the smallest diff shape this loop has used yet (smaller
than M47's single string-template edit, since here the formatter itself needs no changes at all, only a
new import + one changed line).**

1. **`apps/web/src/ui/dqkExplore.ts:73`** (the `party.js` import) — add `classLabel`:

   ```ts
   // before:
   import { partyCombatants, partySize, getParty } from './party.js';
   // after:
   import { partyCombatants, partySize, getParty, classLabel } from './party.js';
   ```

2. **`apps/web/src/ui/dqkExplore.ts:946`** (the line inside `renderRosterLine()`) — thread it through:

   ```ts
   // before:
   line.textContent = `Party (${party.length}): ` + party.map((p) => p.name).join(', ');
   // after:
   line.textContent =
     `Party (${party.length}): ` + party.map((p) => `${p.name} (${classLabel(p.classes)})`).join(', ');
   ```

   Example real output change: `?dqk=1` currently shows
   `Party (6): STURM, CARAMON, TANIS, GOLDMOON, RAISTLIN, TASSLEHOFF`; after the fix, the same line reads
   `Party (6): STURM (KNT 6), CARAMON (FTR 7), TANIS (FTR 6), GOLDMOON (CLR 6), RAISTLIN (MU 6),
   TASSLEHOFF (THF 7)` — the exact per-hero facts `_scratch_m52_verify.test.ts` independently confirmed
   this round.

3. **Small e2e seam addition** (mirrors M48's own precedent of adding one small getter to exercise a
   fix, not a new test file) — **`apps/web/src/ui/dqkExplore.ts`**, next to the existing `partyNames`
   getter (`dqkExplore.ts:1323`):

   ```ts
   // before:
   partyNames: () => getParty().map((p) => p.name),
   // after:
   partyNames: () => getParty().map((p) => p.name),
   partyClasses: () => getParty().map((p) => classLabel(p.classes)), // M52.S1 coherence check
   ```

4. **Tests** (extend the existing `runDqkExplore` e2e case only — no new test file, no new case). In
   `apps/web/test/e2e.mjs`, near the existing `partyNamesLive` read (`e2e.mjs:1826`), add one DOM-text
   coherence check reading the real rendered `#dqk-roster` line (nothing in the e2e suite reads this
   element's text today — confirmed by grep):

   ```js
   // M52.S1 — the always-visible DQK roster line now shows each hero's real class/level (was: names
   // only, despite its own doc comment promising a "class/level summary"); confirm the rendered text
   // agrees with the real classLabel()-derived values, not just the seam.
   const partyClassesLive = await page.evaluate('window.__dqk.partyClasses()');
   const rosterLineText = await page.evaluate(() => document.querySelector('#dqk-roster')?.textContent ?? '');
   const rosterLineOk = partyClassesLive.every((c) => rosterLineText.includes(c));
   ```

   and fold `rosterLineOk` into the case's existing `ok = ...` conjunction (`e2e.mjs:2087`) and its
   failure-diagnostic string (`e2e.mjs:2088`), the same "one more `&& xOk`" pattern every prior round has
   used. (Named `rosterLineOk`, not `rosterOk` — that identifier is already taken in this function by the
   unrelated MONCHA-bestiary-coverage check at `e2e.mjs:1937-1951`.)

Rough size: 2 LOC changed + 1 LOC added in `dqkExplore.ts`, ~3 LOC added to the existing `runDqkExplore`
e2e case's assertion block. No engine-package file touched, no new test file, no new e2e case, no new
route, no new UI panel.

## Layout / feasibility check

`#dqk-roster` is a plain `<div class="gb-note">` (`dqkExplore.ts:1126-1128`), not a fixed-width EGA/VGA
framebuffer row — the same "plain HTML text, browser reflows it" risk category as M47's `library.ts`
meta line and M51's import tables, and a strictly lower-risk category than M48–M50's fixed-width
320×200 combat banner. Six names growing from `"STURM, CARAMON, TANIS, GOLDMOON, RAISTLIN,
TASSLEHOFF"` (56 chars) to `"STURM (KNT 6), CARAMON (FTR 7), TANIS (FTR 6), GOLDMOON (CLR 6), RAISTLIN
(MU 6), TASSLEHOFF (THF 7)"` (109 chars) is a plain text-wrap concern, not a clipping one — `.gb-note`
is a block-level div with no fixed width or `white-space: nowrap` — confirmed by a repo-wide grep for
`.gb-note`, which turns up **no CSS rule defining it at all** (it is styled only by `el()`'s generic
class-name assignment, `render.ts`'s DOM helper, with no matching selector in any stylesheet), so the
element is a plain unstyled block-level `div` and wraps naturally like the rest of the page's prose —
if anything a lower clipping risk than a class with explicit-but-generous CSS would be.

## The two dropped-field candidates re-checked in `importParty.ts`/`importDokParty.ts`

Per the brief, both files were re-opened for a **different, non-AC** dropped field before this round's
headline was picked, given M51's own "worth treating as a family" note. Two were found and both set
aside as weaker than the DQK roster-line gap:

- **`importDokParty.ts`'s `DokImportCandidate.mem`** (the real, crosswalked `.WIZ` memorized-spell
  carryover, M32.S1/M33.S1) is destructured in scope at the per-candidate loop (`importDokParty.ts:293`)
  and used only to call `setMemorization` — never folded into `DokImportResult.summary` or the on-screen
  import table, and the table's own displayed paragraph (`main.ts:839-841`) discusses combat stats being
  "freshly derived" but says nothing about spells at all. **Set aside**, not headlined: unlike
  `CharacterSheet.ac` (M51) or `CharacterSheet.classes` (this round), the carried-over spells DO reach a
  player-visible panel today — opening Camp → Magic → Memorize for that hero shows the real "used/slots"
  counts the carryover populated (`magic.ts`'s `paint()`, `memorizedAt(mem, level).length` at
  `magic.ts:147,181`). The gap here is "not previewed at the import screen," a strictly weaker miss than
  a fact with **zero** player-visible surface, which is what both this round's headline and M51's had
  before their fixes.
- **`DOK_SPELL_CROSSWALK`'s silent id-drop** (`dokSpellCrosswalk.ts:96-109`: a real saved `.WIZ` id with
  no crosswalk entry, or that mismatches the inferred class, is dropped with no count kept) is a genuine,
  named, honest design choice per its own doc comment ("an honest, if partial, result rather than a
  bigger, riskier change"), not a value that's computed and then dropped — there is no
  "N of M carried" figure sitting in scope anywhere to thread through; keeping such a count would be a
  new derivation, not a wiring fix, and out of this round's "wire an existing field" scope.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`importDokParty.ts`'s `mem` (spell carryover) never reaching the import summary** | Investigated in depth (see dedicated section above) — real gap, but weaker than the headline because the fact already reaches a player-visible panel (the Memorize overlay) once opened, unlike the DQK roster-line class/level fact, which reaches nowhere at zero-extra-clicks and only reaches the Companion→HUD tab behind an explicit modal open the roster line's own doc comment says it shouldn't need. |
| **`gameData.ts`, `catalog.ts`, `assetSource.ts`, `docs.ts`** | Read in full (none swept by any prior round). All four are static config/plumbing with no computed-but-dropped per-instance field: `gameData.ts` is a per-game path registry (no display logic at all), `catalog.ts` is a static asset list + URL builder, `assetSource.ts` is a tiny basename-keyed file reader interface, `docs.ts` is hand-authored project documentation HTML with no engine data flowing through it. No candidate found. |
| **`inventory.ts` (pre-hoc angle)** | Read in full applying the pre-hoc/post-hoc lens the brief called out. `doUse()`'s `useItem()` returns only `{ inventory, consumed }` — no narrated amount/effect to preview or post-hoc-only-narrate; `doReady()`'s AC/THAC0 recompute is already shown pre-hoc via `toView()`'s `computeArmorClass`/`computeThac0`. No gap found — already a correctly "shown pre-hoc" screen, joining `town.ts` (M51) as a second clean example of the pattern done right. |
| **`magic.ts`'s `doCast()`/`doContext()` (pre-hoc angle)** | Read in full. `doCast()`'s heal amount is an honest post-cast dice roll (no pre-hoc number to show without inventing a random-roll preview UI the original game never had either — not a drop, a real-time roll). `chanceToLearnSpell()`'s post-hoc-only Scribe %  was already investigated and set aside by M51 for being INT-only/constant-per-caster; not re-litigated. No new angle found. |
| **`wilderness.ts`'s `TERRAIN[...].encounterPct`** | Read in full. Never shown to the player pre-hoc, but this matches the original Gold Box games' own convention (wandering-monster odds were never displayed) — showing it would not be "wiring a dropped fact," it would be inventing new information the source games didn't expose. Correctly not pursued. |
| **`saveStore.ts`'s `listSlots()`/`SaveSummary`** | Re-checked. Still genuinely zero callers anywhere in `apps/web/src/ui` outside `saveStore.ts` itself (confirmed by grep) — both `explore.ts`'s quicksave and `mainMenu.ts`'s load path still only ever touch the single `QUICK_SLOT`. No multi-slot UI exists yet to hang a fix on without adding a new panel, which this round's brief rules out. Still correctly gated. |
| **`DetectionMatch.series`/`.ruleset`/`.engineGen`** | Re-checked against `library.ts`'s `onLibrarySelect` routing (`main.ts:697-725`). DQK is still routed by an explicit `profileId === 'dark-queen-of-krynn'` special-case (`main.ts:709`), not by `engineGen` — the broader-roster-playability gate M47/M48 identified is unchanged; these three fields still have no real routing/display consumer that would make surfacing them more than cosmetic. Still correctly deferred. |
| **`loaders/buildDqkGame.ts`'s `DqkMergeAudit`/`DqkGameManifest`** (method (f), a third "bridge file" candidate) | Read in full — a genuinely fresh bridge-file shape (E4.1's CoK/DoK→DQK content-port assembly), but confirmed via repo-wide grep to have **zero** callers anywhere in `apps/web/src` — it is a build-time-only pipeline for the PRIMARY (DOS executable) track, with no player-facing web UI screen to wire into at all. Does not fit this loop's "reaches a player-visible UI panel" mandate; out of scope, not a display gap. |
| **`referenceDb.ts`'s Class-label collision** (15 rounds unpicked) | Not re-investigated as a headline candidate — on inspection this round, it is a mislabelling issue (two already-shown facts sharing a confusing column header), not a dropped field; it doesn't fit this loop's specific "computed but never reaches the player" mandate as cleanly as this round's headline, which is likely why 5 prior audits (each of which read it) left it unpicked rather than a sign it needs "a new angle" — flagged again, unpicked, no new information to add. |
| **Item-instance subsystem, `PartyMemberStatus.age`, `MapCell.ceiling`/`.flags`, `MonsterRecord.conSaveBonus`/`.itemPluses`/`.carriedItems`/`.preparedSpellIds`, `TacticalSpell.inflict`, `dialogue.ts`/`town.ts`'s `day`-wiring, DoK Companion-Panel e2e positive controls** (all standing) | Not re-investigated, per standing instructions — no new angle developed. `TacticalSpell.inflict` specifically re-checked once more: tactical combat's `partyCast()` (`combat.ts:850-878`) still auto-picks the first castable spell with no player spell-selection UI at all (auto-targets nearest foe / most-wounded ally), so there is still no existing "confirm this cast" screen to attach a pre-hoc `inflict` hint to — confirmed still a "new UI surface" job, not a wiring job, matching the standing note. |

## Open questions / unknowns

- **Should the roster line read `NAME (CLS L)` or `NAME — CLS L`?** This doc's wiring plan uses
  parenthesization to match `magic.ts`'s own title-bar convention
  (`${caster.sheet.name} — ${classLabel(...)}` actually uses an em-dash there, not parens — `magic.ts:190`)
  — the lead may prefer the em-dash form for visual consistency with that screen instead. Left as a
  cosmetic choice, not a blocking question.
- **Should this round's fix also add the class/level column to `#dqk-roster` when the party changes
  later** (e.g. after a hypothetical future DQK level-up)? `installDqkParty()`/`renderRosterLine()` are
  currently only called once at boot (`dqkExplore.ts:1170-1171`); no code path currently re-levels a DQK
  party mid-session, so this is speculative and out of scope for this fix.
- **Is showing class/level in this line "too much" information redundant with the Companion panel?**
  Per this round's investigation, no — CoK/DoK's own equivalent always-on party display (`ExploreParty`)
  deliberately omits class too, so DQK showing it here is not "more than the original games showed," it
  is filling the one gap between "instantly visible" and "one click into a modal" that this specific line
  (C4.3) was documented to close and didn't.

## Implications for our engine

- **A doc comment can describe a feature a function's body never built, and that gap can survive many
  rounds simply because the function has no test coverage on its rendered text.** `renderRosterLine()`'s
  output was never read by any e2e assertion (confirmed by grep — `#dqk-roster` appears nowhere in
  `e2e.mjs` before this round), so nothing caught the mismatch between the comment's promise and the
  code's behavior. Worth treating "does an e2e case ever read this element's actual rendered text" as its
  own audit lens going forward, independent of whether the underlying engine field is wired anywhere
  else.
- **A fact can be "shown to the player" in one screen and still be a real gap in a different, more
  convenient screen that explicitly documents wanting it.** This round's headline and the `mem`/spellbook
  candidate set aside above are two shades of the same lesson: "reaches a player-visible panel" is not
  binary — a fact gated behind an extra modal open is a weaker miss than a fact with zero surface at all,
  but is still a real, fixable convenience gap when the exact line meant to carry it (per its own doc
  comment) doesn't.
- **The "sibling-file formatter reuse" method (classLabel/rangeTag-style) keeps paying off across
  completely different subsystems** — first `rangeTag()` for missile combat (M49), now `classLabel()` for
  the DQK roster line (this round). Worth continuing to check, for any UI text-building function, whether
  a sibling screen already has an exported formatter for the exact fact the function's own doc comment
  wants.
- **`dqkExplore.ts` is a large (1373-line), until-now-unswept file** — this round only checked
  `renderRosterLine()` and the `EclRun`/`runAreaEcl()` display path (confirmed fully wired, see the
  dropped-consideration notes above); it was not read end-to-end. Worth flagging as a candidate for a
  focused future round the way `combat.ts` got three (M48–M50) and the import files got two (M51–M52).

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m52_verify.test.ts` (5 tests: the 6 real DQK Heroes' `classLabel()`
  outputs re-derived from real `createCharacter()` calls against the transcribed `DQK_HEROES` requests;
  a source-text proof `renderRosterLine()`'s doc comment promises a class/level summary its body never
  builds; a source-text proof `classLabel()` exists and is exported; a source-text proof `dqkExplore.ts`
  does not currently import it; a source-text proof the CoK/DoK sibling HUD already uses
  `classLabel(s.classes)`) — run via `npx vitest run` (5/5 passed), then deleted. Confirmed via
  `git status --porcelain --untracked-files=all` (clean except this doc) after deletion.
