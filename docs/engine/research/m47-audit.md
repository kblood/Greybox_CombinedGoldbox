# M47 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M40–M46 in full, and
> `docs/engine/research/m46-audit.md` in full (its Rejected-alternatives / Open-questions /
> Implications sections in particular). Per this round's brief, `referenceDb.ts` (5 rounds) and
> `saveStore.ts` (M46) were both explicitly de-prioritized this round in favour of a fresh sweep,
> with a **new angle (g)**: grep `packages/engine/src/**/*.ts` interfaces/types for doc comments
> containing words like "human-facing", "display", "player-facing", "label", "shown to the player",
> and check whether each such field actually reaches a UI surface today — plus the standing angles
> (a)–(f) from prior rounds (compositor input-field sweeps, sibling-compositor analogs, non-compositor
> UI bridge files).
>
> This round's finding sits at the intersection of angles (d) and (f): two **non-compositor UI bridge
> files** (`apps/web/src/ui/library.ts`, the Library/"Add asset folder reference" host, and
> `apps/web/src/ui/gameview.ts`, the sibling manifest-based asset-dashboard viewer) both render a short
> "meta" line describing a loaded/detected game, and **one of them shows a field the other silently
> drops** even though both come from the exact same conceptual source (the container-format family a
> game's art lives in — the whole reverse-engineering project's own headline distinction, per
> `CLAUDE.md`'s "Three container generations are in play" section).
>
> Every real-mechanic claim below was independently re-derived this round via a throwaway `vitest`
> script (`packages/engine/test/_scratch_m47_container.test.ts`, created, run, **8/8 green**, then
> deleted — listed at the end). `git status --porcelain` is clean except this doc.
>
> **Headline pick: `DetectionMatch.container` — the exact "which container format is this game's art
> in" fact the whole project exists to reverse-engineer (DAX / DAA / HLIB) — is computed correctly and
> tested for every built-in game/platform variant, and its own doc comment states an explicit display
> purpose ("Container family the art lives in, e.g. `DAX` \| `DAA` \| `HLIB`"), but the Library list —
> `apps/web/src/ui/library.ts`'s `renderLibrary()`, the CURRENT primary "shipping load flow" per that
> file's own header comment — never shows it, even though its sibling asset-dashboard
> (`apps/web/src/ui/gameview.ts`) already safely renders the exact analogous field
> (`GameManifest.container`) in the identical "meta line under the title" slot, for the manifest-driven
> viewer. The Library's meta line shows platform, graphic set, "verified", and confidence % — every
> other `DetectionMatch` field except `container` — for every detected Krynn trilogy AND broader-roster
> game (Pool of Radiance/CoAB/Gateway/Buck Rogers), so a player who has just pointed the app at, say,
> their Amiga Champions of Krynn floppy-disk dump never sees "DAA" anywhere in the one screen whose
> entire job is to announce what was just detected.**

## Headline finding

`DetectionMatch.container` (`packages/engine/src/detect/fingerprint.ts:38`) carries the exact fact
this whole decompile project's `CLAUDE.md` calls out as central — "Three container generations are in
play" (DAX / DAA / HLIB) — for whichever platform variant of whichever game was just detected in a
user's folder:

```ts
// packages/engine/src/detect/fingerprint.ts:30-47
export interface DetectionMatch {
  profileId: string;
  title: string;
  series: string;
  ruleset: string;
  engineGen: GameProfile['engineGen'];
  platform: string;
  graphicSet: string;
  container: string;
  ...
}
```

Its source doc comment, on the field it is copied from (`PlatformVariant.container`), states the
purpose plainly:

```ts
// packages/engine/src/detect/profiles.ts:59-67
/** One platform build of a game (the unit a single chosen folder resolves to). */
export interface PlatformVariant {
  /** Platform label, e.g. "DOS" | "Amiga". */
  platform: string;
  /** Graphic-set id this variant provides, e.g. "dos-ega" | "amiga" | "dos-vga". */
  graphicSet: string;
  /** Container family the art lives in, e.g. "DAX" | "DAA" | "HLIB". */
  container: string;
  signature: Signature;
}
```

`scoreVariant()` copies it straight onto every real match, for every built-in profile (Krynn trilogy
+ broader roster):

```ts
// packages/engine/src/detect/fingerprint.ts:106-119 (scoreVariant, current state)
return {
  profileId: profile.id,
  title: profile.title,
  series: profile.series,
  ruleset: profile.ruleset,
  engineGen: profile.engineGen,
  platform: variant.platform,
  graphicSet: variant.graphicSet,
  container: variant.container,
  score,
  confidence: Math.min(1, score / maxScore(sig)),
  matched,
  magicConfirmed: false,
};
```

This is not a placeholder — it is genuinely varying, correctly-populated, **already engine-tested**
data across the exact three container generations `CLAUDE.md` names: CoK/DoK DOS → `"DAX"`, CoK/DoK
Amiga → `"DAA"`, DQK DOS → `"HLIB"` (`packages/engine/src/detect/profiles.ts:103,120,184`). The
engine's own existing test suite already pins one of these three (independent of this round):

```ts
// packages/engine/test/detect.test.ts:93-98 (pre-existing, unmodified by this round)
it('identifies Champions of Krynn (Amiga) via nested disk paths', () => {
  const r = fingerprintFolder(toEntries(COK_AMIGA));
  expect(r.best?.profileId).toBe('champions-of-krynn');
  expect(r.best?.platform).toBe('Amiga');
  expect(r.best?.container).toBe('DAA');
});
```

The one real, live, "shipping load flow" UI surface for this data — `library.ts`'s own header comment
calls it exactly that:

```ts
// apps/web/src/ui/library.ts:1-7
/**
 * Game Library + "Add asset folder reference" (M0.S5 UI).
 *
 * The shipping load flow: the user clicks "Add asset folder reference," points at one
 * of their own game installs, and the engine fingerprints the folder against the
 * built-in detection profiles to identify the game + platform + graphic set, then
 * registers it as a playable Library entry.
 */
```

— reads every other `DetectionMatch` field it needs for its one-line summary, but never `.container`:

```ts
// apps/web/src/ui/library.ts:374-378 (renderLibrary, current state)
} else {
  const m = entry.match;
  item.appendChild(el('span', 'cat-game', m.title));
  const meta = `${m.platform} · ${m.graphicSet}${m.magicConfirmed ? ' · verified' : ''} · ${Math.round(m.confidence * 100)}%`;
  item.appendChild(el('span', 'cat-meta', meta));
}
```

Meanwhile its sibling viewer — the OTHER "meta line under a game title" UI in this same codebase,
`gameview.ts`'s whole-game dashboard header (for the older manifest-driven `?game=` route) — already
renders the analogous field, in the identical position, using the identical `"platform · X"` phrasing:

```ts
// apps/web/src/ui/gameview.ts:101-107 (renderGame, current state — unmodified, cited as PRECEDENT)
const header = el('div', 'game-header');
header.appendChild(el('span', 'badge', 'GAME'));
header.appendChild(el('span', 'asset-name', game.title));
header.appendChild(el('span', 'muted', `${game.platform}${game.container ? ` · ${game.container}` : ''}`));
header.appendChild(
  el('span', 'muted', `${game.display.width}×${game.display.height} · ${game.totalFrames} frames · ${game.categories.length} categories`),
);
out.appendChild(header);
```

So the exact same "platform · container" fact is already safely displayed today in one place, and
silently dropped in the other — the same recurring defect shape this whole M-series keeps finding, now
demonstrated by direct sibling-file comparison (angle (d)) rather than inference from a downstream
mechanical consumer.

The `.container` value is already reachable at the JS layer even in the Library flow — it just isn't
painted — because the e2e seam spreads the whole match object:

```ts
// apps/web/src/ui/library.ts:408-412 (__greybox.getLibrary, current state)
getLibrary: () =>
  LIBRARY.map((e) => (e.kind === 'module'
    ? { kind: 'module', title: e.pkg.title, fileName: e.fileName }
    : { kind: 'game', ...e.match, folderName: e.folderName })),
```

confirming the gap is purely in `renderLibrary()`'s DOM-building code, not anywhere upstream.

## Why this fits the loop's established shape

1. **Angle (d) — sibling-compositor/sibling-bridge analog, this round applied to two non-compositor
   `apps/web/src/ui/*.ts` files instead of two `compose*Screen` compositors.** `gameview.ts` and
   `library.ts` are both "load a game and show a one-line identity summary" hosts; one shows
   container, the other doesn't, for the exact same underlying fact.
2. **The field's own doc comment states a display purpose** ("Container family the art lives in") —
   the same strong signal class M46 established for `SaveGame.name`, now found on a second,
   unrelated field.
3. **The field is central to the project's own stated identity**, not an obscure side-table byte:
   `CLAUDE.md`'s file-formats section is *organized around* the DAX/DAA/HLIB distinction ("Three
   container generations are in play"), and `docs/findings.md` is described as the "authoritative
   synthesis" of exactly this fact. Surfacing it in the one screen that identifies a freshly-detected
   game folder is thematically on-point for this specific product, not just "another info row."
4. **It reaches the CURRENT primary UI surface** — `library.ts` is explicitly the "shipping load
   flow" per its own header comment, not a legacy/secondary viewer (that role belongs to `gameview.ts`
   itself, which is the one that already got the fix long ago).
5. **Zero engine-package change needed**: `DetectionMatch.container` is already typed, already
   engine-tested (`detect.test.ts:97`), already computed correctly for every built-in profile. The
   entire gap is one string-template edit in `apps/web/src/ui/library.ts`.
6. **Lower rendering risk than most prior finds**: unlike the emulated 320×200 EGA text-mode
   compositors (`combatScreen.ts`, `journalScreen.ts`, `charSheet.ts`, `saveStore.ts`'s message log —
   all fixed-width framebuffers that can clip), `library.ts`'s Library list is plain HTML/CSS
   (`.cat-meta`, a `display:flex; flex-direction:column` block, `viewer.css:87,103-104`) — a longer
   meta string simply wraps or reflows; there is no fixed-column clipping class of risk at all.

## Real-bytes / real-mechanic verification (this round)

Reproduced independently via `packages/engine/test/_scratch_m47_container.test.ts` (created, run,
**8/8 passed**, then deleted):

### Tests 1–3 — the three real container families really differ and are already correctly computed

```
fingerprintFolder(COK_DOS-synthetic-filenames).best.container  === 'DAX'   ✓
fingerprintFolder(COK_AMIGA-synthetic-filenames).best.container === 'DAA'  ✓
fingerprintFolder(DQK_DOS-synthetic-filenames).best.container   === 'HLIB' ✓
```
(Fixtures copied verbatim from the engine's own pre-existing `packages/engine/test/detect.test.ts`
synthetic filename lists — not new data invented for this audit.)

### Test 4 — the three values are genuinely distinct (not a degenerate constant)

```ts
expect(new Set(['DAX', 'DAA', 'HLIB']).size).toBe(3); // real, independently varying per platform
```

### Test 5 — `library.ts` really never reads `.container` anywhere in the file

```ts
expect(libSrc.includes('.container')).toBe(false);
```
Passes today — a direct source-text proof (not inference) that the string `.container` never appears
in `library.ts` at all.

### Test 6 — `library.ts` DOES read every other `DetectionMatch` field its meta line uses

```ts
expect(libSrc).toMatch(/m\.platform/);
expect(libSrc).toMatch(/m\.graphicSet/);
expect(libSrc).toMatch(/m\.magicConfirmed/);
expect(libSrc).toMatch(/m\.confidence/);
```
All pass — proving the omission is selective (one field dropped from an otherwise-complete read),
exactly the recurring "every sibling field threaded through except this one" shape M46 also found in
`saveStore.ts`'s `applySave()`.

### Test 7 — the sibling file already safely renders the analogous field (precedent)

```ts
expect(viewSrc).toMatch(/game\.container/);
```
Confirms, by direct source-text inspection of `gameview.ts` (not inference), that the identical
"platform · container" fact already renders through an equivalent one-line DOM meta string today,
with no reported issue — so extending `library.ts` to do the same introduces no new class of risk.

### Test 8 — the value is already reachable at the JS/e2e layer, just not painted

```ts
expect(libSrc).toMatch(/\.\.\.e\.match/); // __greybox.getLibrary()'s spread already exposes .container
```

## Wiring plan

**One file touched (`apps/web/src/ui/library.ts`) for the fix; one existing e2e case extended
(`e2e.mjs`'s `detection` case) — no engine-package change, no new UI panel/route.**

1. **`apps/web/src/ui/library.ts:377`** — add `.container` into the existing meta-string template,
   mirroring `gameview.ts`'s own `"platform · container"` ordering (container is a required, always-
   populated `string` on `DetectionMatch`, unlike `GameManifest.container?`, so no `?:` guard is
   needed here):
   ```ts
   // before:
   const meta = `${m.platform} · ${m.graphicSet}${m.magicConfirmed ? ' · verified' : ''} · ${Math.round(m.confidence * 100)}%`;
   // after (M47.S1):
   const meta = `${m.platform} · ${m.container} · ${m.graphicSet}${m.magicConfirmed ? ' · verified' : ''} · ${Math.round(m.confidence * 100)}%`;
   ```
   Example real output changes: a detected CoK-DOS folder currently reads `"DOS · dos-ega · 76%"` and
   would read `"DOS · DAX · dos-ega · 76%"`; a detected CoK-Amiga folder currently reads
   `"Amiga · amiga · verified · 82%"` and would read `"Amiga · DAA · amiga · verified · 82%"`.

2. **Tests** (extend the existing `detection` e2e case only — no new test file, no new case). The
   case already registers a real CoK-DOS folder through the live `window.__greybox.addFromEntries()`
   seam, which internally calls the real `renderLibrary()` (`library.ts:206`), so the DOM already
   contains a `.cat-meta` node with the fixed meta string by the time the case's existing assertions
   run (`apps/web/test/e2e.mjs:96-117`, `runDetection`). Add one DOM-text read + assertion:
   ```js
   // apps/web/test/e2e.mjs — inside runDetection(), after the existing addFromEntries()/getLibrary() calls
   const metaText = await page.evaluate(() =>
     document.querySelector('.cat-meta')?.textContent ?? '',
   );
   // M47.S1 — the Library list's meta line now names the real container format (DAX for CoK-DOS),
   // not just platform/graphicSet/confidence.
   const containerShown = metaText.includes('DAX');
   ...
   const pass = !!cok && junkRejected && (Array.isArray(lib) && lib.length === 1) && containerShown && errors.length === 0;
   return { id: 'detection', label: 'Library: fingerprint CoK-DOS, reject junk', rendered: lib.length, min: 1, errors: pass ? [] : [...errors, `containerShown=${containerShown} metaText="${metaText}"`], bad: [], pass };
   ```
   This is a same-shape extension to M46's approach (adding an assertion to an existing case's existing
   DOM/seam reads, not adding a new case or a new party/session/page setup).

Rough size: 1 LOC changed in `library.ts`, ~6 LOC added to the existing `detection` e2e case. No
engine-package file touched, no new test file, no new e2e case, no new route, no new UI panel.

## Layout / feasibility check

No overflow/clipping risk of the kind prior rounds had to reason about for the emulated 320×200
EGA/VGA text-mode compositors: the Library list is genuine HTML/CSS, not a fixed-width framebuffer.
`.lib-entry` is `display: flex; flex-direction: column; gap: 2px` and `.cat-meta` is a plain `<span>`
at `font-size: 11px` with no `white-space: nowrap`/fixed width set (`apps/web/src/ui/viewer.css:87,104`)
— a longer string simply occupies more horizontal space in its flex row or wraps at the container's
edge; it cannot be clipped mid-character or overwrite an adjacent fixed column the way the exploration/
combat/journal/save-log framebuffers could. The added `" · DAX"`/`" · DAA"`/`" · HLIB"` segment is
short (5–7 characters including the separator), so in practice no visible reflow is expected at all at
typical viewport widths; this is a strictly lower-risk change than every prior round's framebuffer-text
finding.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`DetectionMatch.series`** (`profiles.ts:75`, "Series/grouping, e.g. \"Krynn\"") | Real and also unshown in `library.ts`, but purely a grouping/taxonomy label with no sibling-file precedent for how to present it (unlike `container`, which has an exact existing analog to mirror) — showing it well would mean grouping the Library list by series, which edges toward a layout change rather than a one-line string addition. Flagged as a good, but larger and less certain-to-be-in-scope, follow-up. |
| **`DetectionMatch.ruleset`** (`profiles.ts:77`, "Ruleset plugin id this game runs under (informational until M2)") | Real, also unshown in `library.ts`, but its own doc comment explicitly hedges "(informational until M2)" and, more importantly, it has **no real gameplay consumer today**: `main.ts`'s `onLibrarySelect()` (`apps/web/src/ui/main.ts:695-726`) routes CoK/DoK/DQK to their real explore views by `profileId`/`platform` alone and every broader-roster title (whose `ruleset` differs — `addnd1e`/`addnd2e`/`buckrogers`) explicitly shows "Playable rendering for this variant arrives in a later milestone" instead of loading a ruleset-specific play mode. Weaker than `container`, which the engine's OWN detection tests already assert per-platform. |
| **`DetectionMatch.engineGen`** | Real, unshown, but fully redundant with `graphicSet`/`container` for every currently-detectable title (a player who sees "HLIB" already knows it's the Gen2 engine); adding a 4th token to the meta line for no new information was judged not worth it once `container` was already the strongest, most game-format-relevant single addition. |
| **`saveStore.ts`'s `listSlots()`/`SaveSummary`** (flagged M46, standing) | Not re-investigated — still real, still a legitimate bigger future-round candidate once a multi-slot save/load UI exists; out of scope for the "no new UI panel" constraint, unchanged from M46's own reasoning. |
| **`referenceDb.ts`'s `Class`-label collision** (flagged M37, unpicked M38–M46 — 10 rounds running) | Not re-investigated — brief explicitly steered away from `referenceDb.ts` this round; deferred again, now 11 rounds running. |
| **`gameClock.ts`'s `Calendar`/`calendarFromClock`** | Read in full — already fully wired: `explore.ts`'s CAMP status line already shows `M${month+1}/Y${year}` (`explore.ts:862`) and a `window.__explore.calendar()` e2e getter already exists (`explore.ts:1785`). No unread field found. |
| **`world/wilderness.ts`'s `TerrainInfo.label`** ("Display label for the info panel") | Already fully wired — `apps/web/src/ui/wilderness.ts` already reads `TERRAIN[...].label` in three places (status line, blocked-terrain message, travel narration; `wilderness.ts:116,201,209`). |
| **`ruleset/addnd1e-dragonlance/moons.ts`'s `MoonReading`/`MoonPhaseMods`** | Already fully wired via the existing moon-phase demo/e2e (`explore.ts`'s `renderMoons()`/moon tooltip, `explore.ts:643`) — no new gap. |
| **`ruleset/addnd1e/experience.ts`'s `hasPrimeRequisiteBonus`/hidden +10% XP bonus** | Real and applied (`party.ts`'s `awardPartyXp()` → `combat.ts:722-727`'s real per-character XP messages already reflect the bonus in the number shown), but the bonus itself is never separately labelled ("+10% prime requisite") anywhere — judged decorative/polish, not a dropped fact, since the mechanically-correct final number IS shown per character. |
| **`combat/tactical.ts`'s `TerrainHazard.kind`** ("Display/log kind … so the ruleset/UI can label it") | Already fully wired — `apps/web/src/ui/combat.ts:617-619` already interpolates `e.hazard` (the kind string) into the "chokes in the/caught in the/struggles free of the {kind}" combat-log lines. |
| **`save/roster.ts`'s `AddPlayerReason`** (typed roster-gate rejection reasons) | Already fully wired via `importParty.ts`'s `REASON_MESSAGE` map (`importParty.ts:59-62`) for the CoK→DQK import flow. The M35.S1 ECL `ADD_NPC` companion-recruitment path does NOT go through `addPlayer`'s roster gates at all (by design — those are combat-only allies, not persistent roster members, per `explore.ts:254-258`'s own doc comment), so there is no second call site to check. |
| **`module/database.ts`'s `AuthoredRace`/authored-content types** | Read — explicitly "not wired into `createCharacter`; authored for reference/display + future rulesets" per its own doc comment; this is FRUA-authoring-layer scaffolding, not decoded game data with a real player-facing consumer today. Out of scope (matches the project's own "authoring is a separate, later layer" framing). |
| **`loaders/loadGame.ts`'s `ManifestFile.note`** ("Free-form note shown in the UI") | Partially subtle but NOT a clean drop: `loadGame()`'s own logic (`loadGame.ts:257-259`) already threads `mf.note` into `GameFileResult.skipped` whenever the computed decode-note is absent, and `gameview.ts` already renders `file.skipped`/`file.error` (`gameview.ts:72-76`). The only edge case is that an author-supplied `mf.note` is superseded (not appended) by a computed decode-failure note when BOTH exist — arguably correct behaviour (the computed note is more specific/current), not a defect; too ambiguous a case to call a clean "silently dropped" finding. |
| **DoK Companion-Panel e2e positive controls for `halfDamage`/`Range`** (M43/M44, standing) | Not re-investigated — still a legitimate small follow-up, out of scope since a stronger new candidate turned up first. |
| **Item-instance subsystem, `PartyMemberStatus.age`, `MapCell.ceiling`/`.flags`, `MonsterRecord.conSaveBonus`/`.itemPluses`/`.carriedItems`/`.preparedSpellIds`, dialogue.ts/town.ts `day`-wiring, DoK `baseTypeId` alias question, `TacticalSpell.inflict`** (all standing) | Not re-investigated, per standing instructions — no new angle developed on any of these this round. |
| **`spellbook.ts`/`treasure.ts`/`townScreen.ts`/`wildernessScreen.ts`/`charSheet.ts`/`eclInspector.ts`/`inventory.ts`/`automapPanel.ts`/`hudPanel.ts`/`gswitch.ts`/`dqkParty.ts`/`charEditor.ts`/`journal.ts`/`companionPanel.ts`/`exploreScreen.ts`/`combatScreen.ts`** | Re-swept this round (compositor input-field-by-field per angle (a), plus `companionPanel.ts`/`journal.ts` read in full) — all confirmed still clean; no new gap found in any of them. |

## Open questions / unknowns

- **Should `series` (Krynn / Forgotten Realms / Buck Rogers) also be surfaced, and if so, as a Library
  grouping header rather than a per-entry token?** Real and unshown, but a good UI treatment likely
  means visually grouping entries by series once the broader roster is genuinely playable, which is a
  bigger, layout-shaped follow-up rather than this round's one-line fix. Flagged for a future round.
- **Is `" · DAX"`/`" · DAA"`/`" · HLIB"` the clearest wording, or would a longer form ("DAX archives" /
  "Amiga DAA") read better to a non-technical user?** Not resolved either way — a minor wording call,
  in the same spirit as M45's `"1 cell"`/`"1 cells"` and M46's exact save-message-phrasing questions.
- **`DetectionMatch.ruleset`/`.engineGen` remain real, decoded, and currently unshown anywhere** — kept
  out of this round's fix because neither has a "should be shown here" precedent as direct as
  `container`'s (see the Rejected-alternatives table); worth a fresh look once the broader-roster
  titles gain real playable routes (their `ruleset` would then matter to more than just a status
  message).
- **`saveStore.ts`'s `listSlots()`/`SaveSummary` remain a fully-built, zero-caller export** (flagged
  M46, unchanged this round) — still gated on a multi-slot save/load UI that doesn't exist.

## Implications for our engine

- **The "sibling file already shows the analogous field" comparison (angle (d)) generalises cleanly
  from compositor-vs-compositor (prior rounds) to bridge-file-vs-bridge-file** — `library.ts` and
  `gameview.ts` are both plain DOM-building `apps/web/src/ui/*.ts` modules, not `compose*Screen`
  engine-render hosts, yet the exact same defect shape (one sibling shows a field, the other silently
  drops the analogous one) recurred. Worth treating "does a sibling UI file already solve this
  identical display problem" as a first-class check independent of whether either file is a
  compositor.
- **A field being central to the project's own stated technical identity (the DAX/DAA/HLIB container
  distinction, per `CLAUDE.md`) is a meaningful, additional "should be shown" signal**, beyond a doc
  comment saying "for display" or a downstream mechanical consumer — this project's whole raison
  d'être is understanding and now displaying exactly this fact, so a screen that identifies a detected
  game and omits it is a thematically sharper miss than an arbitrary unshown stat would be.
- **Not every "silently dropped, doc-commented display field" candidate is equally low-risk to ship**:
  this round's `container` addition to plain HTML/CSS text carries materially less layout risk than
  the emulated fixed-width EGA/VGA framebuffer text every prior M-round's finding had to reason about
  (see the Layout/feasibility section) — worth noting that not all "apps/web/src/ui" UI surfaces share
  the same clipping-risk profile, and the DOM-text ones (Library list, status lines, dialogue panels)
  are structurally safer to extend than the compositor framebuffers.
- **A fix that needs zero engine-package changes remains the preferred shape when available** — as in
  M39/M43/M44/M45/M46, this round's entire diff lives in one `apps/web` UI-layer string template; the
  engine data model (`DetectionMatch.container`) and its computation (`fingerprintFolder`) already
  fully supported the fix, and is already independently engine-tested.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m47_container.test.ts` (8 tests: three real per-platform container
  values reproduced via the engine's own `fingerprintFolder` against the engine's own pre-existing
  synthetic fixture lists; a set-based proof the three values are genuinely distinct; a source-text
  proof `library.ts` never reads `.container`; a source-text proof `library.ts` DOES read every
  sibling `DetectionMatch` field its meta line uses; a source-text proof `gameview.ts` already renders
  the analogous `game.container` field; a source-text proof the `__greybox.getLibrary()` e2e seam
  already exposes `.container` via object spread) — run via `npx vitest run` (8/8 passed), then
  deleted. Confirmed via `git status --porcelain` (clean except this doc) after deletion.
