# M54 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M49–M53 in full, and
> `docs/engine/research/m53-audit.md` in full (its Rejected-alternatives / Open-questions /
> Implications sections in particular). Per M53's own note that `apps/web/src/ui/dqkExplore.ts`
> is now fully swept and should not be re-opened, this round applied the brief's "full end-to-end
> read of a previously-unswept file" method (i) to `apps/web/src/ui/explore.ts` — the CoK/DoK
> gen1 exploration screen, 1871 lines, never given a dedicated full sweep before (unlike its DQK
> sibling) — plus the brief's new angle (j), "a stale/backwards factual claim about what actually
> happens," which this round found in the same file, in an even more literal form than M53's.
>
> **Headline pick: `explore.ts`'s `refreshPartyHud()` — the CoK/DoK exploration screen's
> always-visible party-roster panel (name, class/level label, AC, current/max HP, and
> wound-severity colour grading: green/amber/red/struck-through-when-down) — has been silently
> dead code since commit `33180d2` (2026-06-21, the same day as the project's pivot to the
> current all-in-one "Greybox" engine direction), which deleted the ONE line that created its
> `.gb-party` container div while leaving the function that fills it completely untouched. Every
> single call to `refreshPartyHud()` (6 call sites) has, ever since, executed exactly one useful
> line (`drawScreen()`) and then hit `if (!panel) return;` and quit. The function's own doc
> comment still asserts, in the present tense, "`.gb-party` is the panel filled here" — a factual
> claim about current behaviour that has been false for the entire life of the current engine
> direction.**
>
> Every real-mechanic claim below was independently re-derived this round via a throwaway
> `vitest` script (`packages/engine/test/_scratch_m54_verify.test.ts`, created, run, **8/8
> green**, then deleted). `git status --porcelain --untracked-files=all` is clean except this doc
> (confirmed below).

## Headline finding

### The function: `refreshPartyHud()` (`apps/web/src/ui/explore.ts:532-562`)

```ts
// apps/web/src/ui/explore.ts:532-562 (current state, unmodified)
/**
 * Rebuild the right-hand party roster, Gold-Box style: a numbered list where each row carries the
 * character's name, class/level, AC and current/max HP — coloured by wound severity, struck out
 * when down. With no created party the explore view fights the built-in demo four, so the panel
 * says so. (`.gb-party` is the panel filled here.)
 */
function refreshPartyHud(): void {
  if (state) drawScreen(); // the party panel is part of the emulated screen now
  const panel = document.querySelector('.gb-party') as HTMLElement | null;
  if (!panel) return;
  panel.innerHTML = '';
  panel.appendChild(el('div', 'gb-panel-h', 'Party'));
  const members = partyStatus();
  if (members.length === 0) {
    panel.appendChild(
      el('div', 'gb-party-empty', 'No party yet — encounters use the demo four. Create one with “✦ Create party (CoK)”.'),
    );
    return;
  }
  members.forEach((m, i) => {
    const frac = m.maxHp > 0 ? Math.max(0, Math.min(1, m.hp / m.maxHp)) : 0;
    const sev = m.down ? 'down' : frac > 0.5 ? 'ok' : frac > 0.25 ? 'warn' : 'crit';
    const row = el('div', `gb-party-row ${sev}`);
    row.appendChild(el('span', 'gb-party-idx', String(i + 1)));
    row.appendChild(el('span', 'gb-party-name', m.name));
    row.appendChild(el('span', 'gb-party-cls', m.cls));
    row.appendChild(el('span', 'gb-party-ac', `AC ${m.ac}`));
    row.appendChild(el('span', 'gb-party-hp', m.down ? 'DEAD' : `${m.hp}/${m.maxHp}`));
    panel.appendChild(row);
  });
}
```

`panel` is `document.querySelector('.gb-party')`. Grepping the entire `apps/web/src` tree for any
element creation whose class is exactly `gb-party` (as opposed to its still-created-but-orphaned
children `gb-party-row`/`gb-party-idx`/`gb-party-name`/`gb-party-cls`/`gb-party-ac`/`gb-party-hp`,
which only ever get built and appended to a `panel` that itself never existed) turns up **zero**
matches anywhere in the shipped UI code. The only place `.gb-party` is referenced at all, besides
this function and `viewer.css`'s (otherwise unused) styling for it, is the doc comment quoted
above.

### The regression is byte-located to a specific commit, the same day as the engine pivot

```
$ git log --oneline -S "gb-party" -- apps/web/src/ui/explore.ts
33180d2 web: render the exact CoK DOS exploration screen via the engine compositor
16b42be Explore: rebuild the original Gold Box dungeon screen + three moons of Krynn

$ git show 33180d24d41bd1267ac2c04ffd7c0a61e5035d6e -- apps/web/src/ui/explore.ts | grep -n "gb-party\|const side"
301: -  const side = el('div', 'gb-side');
302: -  side.appendChild(el('div', 'gb-party'));
```

`33180d2` ("render the exact CoK DOS exploration screen via the engine compositor", **2026-06-21
19:57:43 +0200** — the same calendar day `CLAUDE.md` records as "Direction update (2026-06-21):
the primary deliverable is now 'Greybox'…") replaced the old DOM/CSS layout (a separate
first-person canvas + an HTML party roster `<div>` + message `<div>`s) with the single-canvas
exact-screen compositor. That refactor correctly deleted the OLD first-person canvas markup and
correctly kept `refreshPartyHud()`'s per-row logic (still useful for the DOM panel), but it
deleted the container div (`side.appendChild(el('div', 'gb-party'))`) without either (a) deleting
`refreshPartyHud()`'s now-orphaned body, or (b) re-creating `.gb-party` somewhere in the new
layout. The function has been silently calling `document.querySelector('.gb-party')` and hitting
`if (!panel) return;` on every one of its ~6 call sites (`explore.ts:358, 472, 505, 742, 978,
1741` — dialogue-combat resolution, script-triggered combat resolution, the guaranteed-win test
fight, `restAndRefresh()`, `quickLoad()`, and the initial `startExplore()` mount) ever since —
i.e. across the entire life of every phase from the pre-M1 boot-sequence work through M53.

### The sibling in the exact same function IS wired — a direct, same-file comparison

`refreshPartyHud()` sits ~90 lines above `renderMoons()`, a structurally identical
query-and-fill function in the same file:

```ts
// apps/web/src/ui/explore.ts:629-631 (current state, unmodified) — WORKS
function renderMoons(): void {
  const wrap = document.querySelector('.gb-moonbar') as HTMLElement | null;
  if (!wrap || !state) return;
  ...
```

and, unlike `.gb-party`, `.gb-moonbar`'s container IS created and appended in `startExplore()`:

```ts
// apps/web/src/ui/explore.ts:1682-1686 (current state, unmodified)
  const companion = el('div', 'gb-companion');
  companion.appendChild(el('div', 'gb-moonbar'));
  out.appendChild(companion);
```

Two doc-comment-adjacent, `querySelector`-and-early-return functions, ~90 lines apart, built in
the same refactor commit, sharing the exact same idiom — one has a live target, the other's was
deleted and never replaced. This is the same "sibling-compositor / method (d)" shape M49, M52 and
M53 already found productive, applied here for a fourth time, on a fresh file.

### The doc comment is a stale, present-tense claim about behaviour that hasn't been true in 34 days of rounds — angle (j)

`refreshPartyHud()`'s own doc comment says, unconditionally and in the present tense: *"(`.gb-party`
is the panel filled here.)"* This is exactly the shape flagged by M53's own Implications section as
worth hunting for a fourth time: a displayed/documented claim about "what actually happens" that
nothing has ever checked against the real runtime behaviour of the code it describes. Here it is
even more literal than M51 (AC column) or M53 (wrong bank named) — the comment names a specific,
concrete DOM selector as the panel "filled here," and that selector has resolved to `null` on every
single invocation since 2026-06-21.

### The fact is real, decoded, and consumed elsewhere — just not here, and not at zero clicks

`PartyMemberStatus` (`apps/web/src/ui/party.ts:387-404`) is doc-commented, verbatim: *"A member's
current condition for **the explore HUD / party panel**."* — the type's own contract names this
exact display site. Its `cls` field (`classLabel()`-derived, e.g. `"FTR 5"`) and severity-relevant
`down`/`hp`/`maxHp` fields are real and already power a sibling panel: `hudPanel.ts`'s
`buildRows()` (`apps/web/src/ui/hudPanel.ts:45-56`) surfaces the identical `cls: s.cls` value in
the Companion → Party tab. So the class-label fact is not completely inaccessible — exactly the
shape M52 (DQK roster line) and the standing `importDokParty.ts` `mem` candidate both established:
reachable via an extra click (open Companion → Party), but this fix's whole point (like M52's) is
that the dungeon screen's own always-visible companion aid is supposed to carry it at **zero**
extra clicks — and, per the doc comment and the still-live CSS, it visibly used to.

`composeExploreScreen` (the canvas compositor that DOES paint at zero clicks) is faithful to the
original DOS layout — it only ever draws `NAME`/`AC`/`HP` (`packages/engine/src/render/
exploreScreen.ts:340-347`, byte-verified against a real CoK screenshot per that file's own header
comment), which never showed class or wound-severity colour either. So the dead `.gb-party` panel
was never a duplicate of the canvas — it was the ONE place (before 2026-06-21) a player got class
labels and colour-graded wound state without opening a panel, exactly the kind of companion aid
`.gb-moonbar`/`.gb-aid` (automap) still are today.

## Why this fits the loop's established shape

1. **A real, already-decoded/derived fact with a real consumer elsewhere** — `PartyMemberStatus.cls`
   (and the HP-fraction-derived severity grading) is real, computed by `classLabel()`/`partyStatus()`,
   and already consumed by `hudPanel.ts`'s Companion tab.
2. **Sibling-in-the-same-file comparison (method d)**, now on a fourth file: `renderMoons()`'s
   `.gb-moonbar` container exists; `refreshPartyHud()`'s `.gb-party` container does not, in the
   exact same file, built in the exact same refactor commit.
3. **Doc-comment mining (method c) meets the new stale-claim angle (j)**: the function's own doc
   comment asserts, in the present tense, that a specific DOM node "is the panel filled here" — a
   claim that has been false since 2026-06-21.
4. **A file given a genuinely fresh, full end-to-end read (method i)**: `explore.ts` (1871 lines)
   had never been swept as a unit before this round (unlike `dqkExplore.ts`, `town.ts`,
   `inventory.ts`).
5. **Grounded one level deeper than "the function looks unused"**: pinned to an exact commit hash,
   date, and diff line (`git show 33180d2`), not just a present-day grep — a genuine, dateable
   regression, not dead-from-birth scaffolding.
6. **Small and precisely isolated**: one new line in `explore.ts` (re-adding the deleted container),
   zero changes to `refreshPartyHud()` itself (its body was already correct), one extended e2e
   assertion.

## Real-bytes / real-mechanic verification (this round)

Reproduced independently via `packages/engine/test/_scratch_m54_verify.test.ts` (created, run,
**8/8 passed**, then deleted):

1. **`refreshPartyHud()` still queries `.gb-party` today** — source-text proof: the exact
   `document.querySelector('.gb-party')` call and its `if (!panel) return;` early-out are present
   verbatim in the current file.
2. **No file under `apps/web/src` creates an element whose class is exactly `gb-party`** —
   recursively scanned every `.ts`/`.tsx` file for the creation pattern `el('...', 'gb-party'`;
   zero hits.
3. **Commit `33180d2`'s diff on `explore.ts` really did delete the container-creation line** —
   ran `git show 33180d24d41bd1267ac2c04ffd7c0a61e5035d6e -- apps/web/src/ui/explore.ts` and
   matched the deleted line `-  side.appendChild(el('div', 'gb-party'));` verbatim.
4. **`refreshPartyHud()` has ≥4 live call sites** (found 6: `358, 472, 505, 742, 978, 1741`) —
   confirming the no-op fires constantly, not that the function itself is unreachable/dead code
   nobody calls.
5. **`composeExploreScreen`'s real party-row draw code paints only name/AC/HP, one binary colour
   choice, and no wound-severity grading** — source-text proof against
   `packages/engine/src/render/exploreScreen.ts`: exactly one `p.active ? C_WHITE : C_GREEN`
   ternary in the whole row-drawing block, and no `down`/`severity`/`warn`/`crit` token anywhere
   in it — the canvas genuinely cannot show what the dead panel would have.
6. **`PartyMemberStatus`'s doc comment really does name "the explore HUD / party panel" as its
   purpose**, and really does carry a `cls: string` field — source-text proof against `party.ts`.
7. **`hudPanel.ts`'s `buildRows()` really does already carry the class label** (`cls: s.cls,`) —
   source-text proof, confirming the fact is real and has a real sibling consumer today.
8. **No e2e assertion anywhere reads `.gb-party`** — grepped `apps/web/test/e2e.mjs` for the
   string; zero hits (the standard "never-read" confirmation this loop has used since M52).

Engine suite re-run afterward: 1344 tests passed (1336 baseline + 8 scratch), matching M53's
stated baseline exactly, confirming no regression. `git status --porcelain --untracked-files=all`
confirmed clean after deleting the scratch file (working tree clean, only this doc untracked).

## Wiring plan

**Two files touched (`explore.ts`, `e2e.mjs`), no engine-package change, no new UI panel/route —
this restores a container the CSS and the fill logic already fully support.**

1. **`apps/web/src/ui/explore.ts:1682-1686`** — re-add the one deleted line, alongside the sibling
   `.gb-moonbar` container it was removed next to in the same 2026-06-21 refactor:

   ```ts
   // before:
     const companion = el('div', 'gb-companion');
     companion.appendChild(el('div', 'gb-moonbar'));
     out.appendChild(companion);

   // after:
     const companion = el('div', 'gb-companion');
     companion.appendChild(el('div', 'gb-moonbar'));
     // M54.S1 — restore the party-roster companion aid refreshPartyHud() has always filled
     // (33180d2, 2026-06-21, deleted this container while migrating to the canvas compositor,
     // without touching the function that fills it — see docs/engine/research/m54-audit.md).
     companion.appendChild(el('div', 'gb-party'));
     out.appendChild(companion);
   ```

   No change to `refreshPartyHud()` itself — its body was already correct and will populate the
   panel on the very next call (the initial mount already calls it at `explore.ts:1741`, right
   after this DOM is built).

2. **Tests** (extend the existing `runExplore` e2e case only — no new test file, no new case). In
   `apps/web/test/e2e.mjs`, declare one new flag alongside the other `let ... = false;` state
   flags (~line 345, next to `multiAttackOk`):

   ```js
   let partyPanelOk = false;
   ```

   Then, right after `hpHealed` is read inside the existing "Rest wired to real effects" block
   (`e2e.mjs:493`), add a DOM-text coherence check — the standard "read the real rendered text,
   not just the seam" pattern this loop has used since M52:

   ```js
   const hpHealed = await page.evaluate('window.__explore.partyHp()');
   // M54.S1 — the exploration screen's own always-visible party-roster panel now actually
   // renders (was: dead since 33180d2 deleted its .gb-party container while refreshPartyHud()
   // kept querying for it). Confirm the REAL rendered text, not just the partyHp() seam, lists
   // every healed member's name and current/max HP.
   const partyPanelText = await page.evaluate(() => document.querySelector('.gb-party')?.textContent ?? '');
   partyPanelOk = Array.isArray(hpHealed) && hpHealed.length > 0 &&
     hpHealed.every((m) => partyPanelText.includes(m.name) && partyPanelText.includes(`${m.hp}/${m.maxHp}`));
   if (!partyPanelOk) errors.push(`party-panel: text=${JSON.stringify(partyPanelText)} hp=${JSON.stringify(hpHealed)}`);
   ```

   Finally fold `partyPanelOk` into the case's existing `pass` conjunction (`e2e.mjs:807`),
   the same "one more `&& xOk`" pattern every prior round has used:

   ```js
   // before:
   const pass = cells === 256 && moved && collided && hasView && fought && bestiaryFidelityOk &&
     singleTurn && moonsOk && scalerOk && graphicsOk && menuOk && restWiredOk && sheetOk &&
     saveLoadOk && automapOk && companionOk && multiAttackOk && errors.length === 0;

   // after:
   const pass = cells === 256 && moved && collided && hasView && fought && bestiaryFidelityOk &&
     singleTurn && moonsOk && scalerOk && graphicsOk && menuOk && restWiredOk && partyPanelOk &&
     sheetOk && saveLoadOk && automapOk && companionOk && multiAttackOk && errors.length === 0;
   ```

Rough size: 1 new line + 1 comment in `explore.ts` (~4 LOC incl. comment), 1 new flag + ~6 LOC
check + 1 conjunction edit in `e2e.mjs` (~8 LOC). No engine-package file touched, no new test
file, no new e2e case, no new route, no new UI panel (the panel, its CSS, and its fill logic all
already existed).

## Layout / feasibility check

`.gb-party` already has complete, dedicated CSS (`viewer.css:422-438`): a bordered card
(`border:1px solid #2a4a7a; background:#07080e; padding:7px 9px;`), a CSS grid per row
(`grid-template-columns: 14px 1fr auto auto auto`), and severity colour rules already keyed to the
exact class names `refreshPartyHud()` already emits (`.ok`/`.warn`/`.crit`/`.down`). Its one
questionable rule, `flex: 1`, is inert here: the new parent (`.gb-companion`, `viewer.css:364`) is
a plain block container (`margin: 12px 0; max-width: 640px;`), not `display: flex`, and CSS `flex`
has no effect on a child of a non-flex parent — so appending `.gb-party` there simply stacks it
under `.gb-moonbar` as an ordinary block, the same "wraps naturally, no clipping risk" situation
M52/M53 already established for plain-prose Greybox companion aids. No JS state, seam, or route
changes are needed — `refreshPartyHud()`'s existing body, unmodified, already does everything the
new container needs.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`explore.ts`'s `MonsterRecord.conSaveBonus`/`.itemPluses`/`.carriedItems`/`.preparedSpellIds`** (applied via `applyConSavingBonus`/`applyItemPluses`/`applyCarriedItems`/`applyPreparedSpellIds`, `explore.ts:1575-1586`) | Confirmed these ARE real and consumed by combat/treasure/spellcasting (`combat.ts`, `tactical.ts`, `treasure.ts`, `dokSpellCrosswalk.ts`), but this is the exact standing candidate #3 the brief already flags as a bigger future job (needs new UI surfaces per field) — not re-picked, no new angle developed. |
| **`compositorParty()` dropping the class label from the canvas panel** (`explore.ts:777-788`) | Read in full, initially looked like a drop — but `composeExploreScreen`'s real, byte-verified layout (`exploreScreen.ts`, matched against a real CoK screenshot) never showed class in this exact panel either; dropping it here is period-accurate, not a gap. |
| **`MonchaEntry`/bestiary `combatSize`/`morale`** (`explore.ts`'s `bestiary` seam) | Checked: already surfaced via `referenceDb.ts:94,103-104` ("Morale"/"Size" detail rows), already exercised by the shipping `runExplore` e2e case's `goblinSaveOk`/`skeletonRegenOk`-style checks. Not a gap. |
| **ECL-recruited allies' `morale`** (`allies()` seam, `explore.ts:1850-1851`) | The join-message (`"${ally.name} joins the party!"`) never states the resolved morale%, which IS a real, ECL-operand-derived fact (M35.S1). Real but weaker than the headline: it's a single flavour-text omission on a rare path (few dungeons script `ADD_NPC`), not a panel that used to exist and silently died; left as a standing, unpicked fallback. |
| **`explore.ts`'s hardcoded "✦ Create party (CoK)" wording in `DoK`-shared code paths** (`explore.ts:547, 703, 919`) | Real, and DoK shares this exact file/function, but it's a pre-existing cosmetic wording issue independent of this round's fix (it was already wrong before `.gb-party` died, and stays wrong after the fix restores the container) — flagged in Open Questions, not picked as the headline. |
| **`referenceDb.ts`'s Class-label collision** (18 rounds unpicked) | Not re-investigated — no new angle this round; still flagged per the standing note. |
| **Item-instance subsystem, `PartyMemberStatus.age`, `MapCell.ceiling`/`.flags`, `TacticalSpell.inflict`, `dialogue.ts`/`town.ts`'s `day`-wiring, DoK Companion-Panel e2e positive controls, `saveStore.ts` `listSlots()`, `DetectionMatch.series`/`.ruleset`/`.engineGen`, `importDokParty.ts`'s `mem`** (all standing) | Not re-investigated, per standing instructions — no new angle developed this round. |
| **The rest of `explore.ts`** (dialogue/combat spawn, save/load, scaler bar, graphics-mode toggle + provenance badge, automap, companion panel host, e2e seam) | Read in full this round (all 1871 lines). Every other display chokepoint — `describeProvenance()`'s honest per-category badge, `renderMoons()`, `restAndRefresh()`'s status/message text, the Encamp/dungeon command bars, the graphics-mode toggle's provenance readout — was traced field-by-field against its source data and found fully wired. `refreshPartyHud()` is the one gap in the file. |

## Open questions / unknowns

- **Should the party panel move, given the dungeon layout is now single-canvas rather than the old
  two-column `side` layout?** This doc's wiring plan appends `.gb-party` inside `.gb-companion`
  (next to the moon bar, above the automap `aid` panel) — a reasonable, low-risk slot consistent
  with "Greybox companion aids below the emulated screen," but the lead may prefer a different
  placement (e.g. its own `.gb-aid`-styled block, matching the automap panel's header treatment
  more closely). Not a blocking question — the CSS renders correctly wherever it's appended as a
  plain block.
- **Should the hardcoded "(CoK)" wording in the empty-state message (`explore.ts:547`) and the two
  other "✦ Create party (CoK)" hints (`:703, :919`) be made game-aware (`activeGame.title`) while
  this file is touched anyway?** Real but independent of this fix — flagged as an easy, small,
  optional follow-up, not required to restore the dead panel.
- **Should `runExploreDok` (`e2e.mjs:1294`) get the identical `.gb-party` coherence check, since DoK
  shares this exact `startExplore()`/`refreshPartyHud()` code path?** Not required for this fix to
  be proven correct (one coherence check in one case, matching M53's own precedent of extending
  only `runDqkExplore` and not a second case) — but cheap insurance the lead may want, since DoK's
  undead-heavy roster would exercise the same panel with different names/classes.

## Implications for our engine

- **A whole, previously-shipped, fully-styled UI panel can go silently dead for over a month —
  spanning M1 through M53 of this very audit loop — when a refactor deletes a container div and
  leaves its fill function's `if (!panel) return;` early-out to swallow the loss quietly.** No
  console error, no failing test, no red build: the exact same "graceful degrade" idiom this
  codebase deliberately uses everywhere else (optional assets, missing archives) also perfectly
  hides accidental container-deletion regressions. Worth a standing suspicion: any
  `document.querySelector(...) ?? return` pattern deserves an occasional check that its target
  selector is still created somewhere.
- **The doc-comment "stale claim" angle (M53's new lens) generalizes past "misnames which asset
  plays" to "misnames whether a documented DOM target still exists."** `refreshPartyHud()`'s doc
  comment asserting `.gb-party` "is the panel filled here" is the same shape as M53's `sfxPart`
  sentence, just caught one layer earlier (in a doc comment instead of a player-visible sentence) —
  worth treating doc comments that name a specific selector/consumer as a checkable claim, not just
  prose.
- **Sibling-in-the-same-file comparison keeps paying off on a fourth distinct file/subsystem** —
  tactical targeting (M48/M49/M50), the DQK roster line (M52), DQK's audio-decode readouts (M53),
  and now the CoK/DoK explore screen's own party panel (this round). Any pair of near-identical
  `querySelector`-and-fill functions in one file is worth diffing against each other, not just
  against their own doc comments.
- **`explore.ts` has now had its first full, dedicated end-to-end read** (1871 lines, this round) —
  every other display chokepoint in it was traced and found wired; future rounds should treat it
  the same as `town.ts`/`inventory.ts`/`dqkExplore.ts`: clean unless a genuinely new angle
  surfaces, not a standing "large unswept file" candidate anymore.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m54_verify.test.ts` (8 tests: source-text proof `refreshPartyHud()`
  still queries `.gb-party`; a repo-wide scan proving no file creates an element whose class is
  exactly `gb-party`; a `git show` proof that commit `33180d2` deleted the container-creation line;
  a proof `refreshPartyHud()` has ≥4 live call sites; a source-text proof `composeExploreScreen`'s
  party row paints only name/AC/HP with one binary colour choice and no severity grading; a proof
  `PartyMemberStatus`'s doc comment names "the explore HUD / party panel" and carries `cls`; a proof
  `hudPanel.ts`'s `buildRows()` already carries `cls`; a proof no e2e assertion anywhere reads
  `.gb-party`) — run via `npx vitest run` (8/8 passed), then deleted. Full engine suite re-run
  afterward: 1344 tests passed including the 8 scratch tests (1336 baseline, matching M53's stated
  count, +8 scratch, confirming no regression). Confirmed via
  `git status --porcelain --untracked-files=all` (clean, working tree clean) after deletion.
