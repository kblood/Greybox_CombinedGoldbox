# M46 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M35–M45 in full, and
> `docs/engine/research/m45-audit.md` in full (its Rejected-alternatives / Open-questions /
> Implications sections in particular). Per this round's brief, `referenceDb.ts` has now been mined
> five times running (M37/M38/M43 `monsterCategory()`, M39/M44 `itemCategory()`, M45 `spellCategory()`)
> and the brief explicitly asked for a sweep biased toward files **outside** `referenceDb.ts`, with a
> **new angle (f)**: check `apps/web/src/ui/*.ts` files that are *not* a `compose*` engine-render host —
> a DOM-text debug view, a save/load screen, a settings/config screen — for the same "computed value
> never displayed" shape the series has so far only found in pure compositors.
>
> That new angle is where this round's finding sits: `apps/web/src/ui/saveStore.ts` (the Save/Load
> bridge) and its two real callers (`explore.ts`'s `quickSave()`/`quickLoad()`, `mainMenu.ts`'s "Load
> Saved Game"). Every real-mechanic claim below was independently re-derived this round via a throwaway
> `vitest` script (`packages/engine/test/_scratch_m46_savegame_name.test.ts`, created, run, 6/6 green,
> then deleted — listed at the end). `git status --porcelain` is clean except this doc (the stray
> `_scratch_m39_verify.test.ts` / `m39-audit.md` untracked entries visible in this session's *starting*
> git snapshot had already been resolved — `_scratch_m39_verify.test.ts` no longer exists on disk and
> `m39-audit.md` is now `git ls-files`-tracked — by the time this round began; neither was touched this
> round).
>
> **Headline pick: `SaveGame.name` — a field whose own doc comment says its entire purpose is
> "human-facing" display (`"Quick Save"` / `"Throtl, Day 3"`) — is computed with real, per-save-event
> varying content (the dungeon/area name plus the formatted in-game clock, e.g. `"Champions of Krynn
> ECL1#34 — Day 1 06:30"`), written to the save slot, and round-trips perfectly through the engine's own
> `serializeSave`/`deserializeSave`. But the web app's save/load bridge (`saveStore.ts`'s `applySave()`)
> silently drops it from the object it hands back to its callers, so neither of the two real, live UI
> call sites (`explore.ts`'s Encamp → Save/Load flow, `mainMenu.ts`'s "Load Saved Game" menu option) can
> ever show which save was written or restored — both are permanently stuck on the generic literals
> `"Game saved."` / `"Game loaded."` / `"Saved game loaded."`, even though the exact same message-log
> chokepoint already safely displays this same map-name string today for an unrelated line (M36's
> `"You enter {map.name}."`).**

## Headline finding

`SaveGame.name` (`packages/engine/src/world/saveGame.ts:48`) is documented, at the point it is
declared, as existing purely for a player-facing purpose:

```ts
// packages/engine/src/world/saveGame.ts:46-49
export interface SaveGame {
  version: number;
  /** Human-facing slot label, e.g. "Quick Save" or "Throtl, Day 3". */
  name: string;
```

The one real write site, `apps/web/src/ui/explore.ts`'s `quickSave()` (the Encamp → Save verb's whole
implementation), already builds a genuinely rich, varying value for it — not a placeholder or a
constant:

```ts
// apps/web/src/ui/explore.ts:947-956 (quickSave, current state)
function quickSave(): void {
  if (!state) return;
  saveToSlot(QUICK_SLOT, {
    name: `${state.map.name} — ${formatGameTime(state.clockMinutes)}`,
    position: currentPosition(),
    clockMinutes: state.clockMinutes,
    savedAt: state.clockMinutes,
  });
  pushMessage('Game saved.');
}
```

`state.map.name` is the real dungeon/area label (`GameMap.name`, set from the `loadDungeon()` call's own
`label` argument — `apps/web/src/ui/explore.ts:1558`, `\`${gd.title} ECL1#${gd.eclInitBlock}\`` — real
per-game/per-dungeon text, e.g. `"Champions of Krynn ECL1#34"` / `"Death Knights of Krynn ECL1#34"`),
and `formatGameTime` (`packages/engine/src/world/gameClock.ts:52-55`) is the same "Day N HH:MM" formatter
already used for the rest-and-camp status lines (`explore.ts:747,750,862`) — real, monotonically
advancing content, not degenerate. So the constructed `name` genuinely differs from one save to the
next as the party plays.

This value is serialized correctly (`serializeSave`/`deserializeSave` round-trip it byte-for-byte, since
neither function special-cases or drops any `SaveGame` field — confirmed by direct reading of
`packages/engine/src/world/saveGame.ts:140-170` and independently reproduced this round, Test 1 below).
The drop happens one layer up, in the UI-side bridge that restores a save into the live app:

```ts
// apps/web/src/ui/saveStore.ts:116-131 (applySave, current state — .name is read off `save` for
// nothing: every OTHER SaveGame field is threaded through, `name` is the only one silently dropped)
export function applySave(save: SaveGame): { position: SavePosition | null; clockMinutes: number; flags: Record<string, number> } {
  const set = (key: string, value: unknown) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  };
  set(KEYS.party, save.party);
  set(KEYS.memorize, save.stores.memorize ?? {});
  set(KEYS.spellbook, save.stores.spellbook ?? {});
  set(KEYS.inventory, save.stores.inventory ?? {});
  set(KEYS.xp, save.stores.xp ?? {});
  try { localStorage.setItem(KEYS.gold, String(save.stores.gold ?? 0)); } catch { /* ignore */ }
  set(KEYS.journal, save.journal);
  reloadStores();
  reloadJournal();
  return { position: save.position, clockMinutes: save.clockMinutes, flags: save.flags }; // no `name`
}
```

Both of `saveStore.ts`'s real UI callers inherit this gap and — independently, on their own side — never
even try to show the name they *did* pass in at save time:

```ts
// apps/web/src/ui/explore.ts:963-982 (quickLoad, current state)
function quickLoad(): boolean {
  if (!state) return false;
  const restored = loadSlot(QUICK_SLOT);       // restored has no .name — applySave() stripped it
  if (!restored) { pushMessage('No saved game to load.'); draw(); return false; }
  state.clockMinutes = restored.clockMinutes;
  ...
  pushMessage('Game loaded.');                 // generic — can't say WHICH save, even if it wanted to
  ...
}
```

```ts
// apps/web/src/ui/mainMenu.ts:146-153 (the "Load Saved Game" menu option, current state)
case 'Load Saved Game': {
  const loaded = loadSlot();                   // same applySave()-backed function, same gap
  if (!loaded) { setStatus('No saved game to load.'); return; }
  setStatus('Saved game loaded.');             // generic here too
  ...
}
```

Both call sites are real, live, and already wired end-to-end — not speculative UI:
- `explore.ts`'s Save/Load pair is reachable in-game via the Encamp sub-menu's "Save" verb
  (`activateEncamp()`'s `case 'Save': quickSave();`, `explore.ts:1001-1004`) and via the `?load=1` boot
  param (`explore.ts:1745-1747`), and both are already exercised by `apps/web/test/e2e.mjs`'s existing
  `explore` case's save/load round-trip block (`e2e.mjs:644-666`, verifying pose persistence live *and*
  across a fresh page load).
- `mainMenu.ts`'s "Load Saved Game" is one of the ten real byte-verified CoK main-menu options
  (`COK_MAIN_MENU`) and is the entry point a returning player actually uses from the title screen.

Crucially, this is **not a new width/format risk being introduced** — the identical `map.name` string is
*already* shown through this exact same message-log chokepoint today, for an unrelated line, proving the
codebase already tolerates it:

```ts
// apps/web/src/ui/explore.ts:1709 (already shipped, M2/M36-era) — the SAME map.name string already
// reaches the player through pushMessage() every time a dungeon loads
pushMessage(`You enter ${map.name}.`);
```

## Why this fits the loop's established shape, via the round's new angle (f)

1. This is the first round to look outside `compose*Screen` engine-render hosts, per the brief's angle
   (f) — `saveStore.ts` is a plain TS bridge module with no `compose*` call at all; its two "screens" are
   the pre-existing dungeon message log and the main-menu status line, both of which take arbitrary
   strings rather than fixed layout slots, exactly like the "DOM-text debug view" shape the brief named.
2. It is the same recurring defect shape this whole M-series keeps finding — "a field the code goes out
   of its way to compute richly is silently dropped one hop before a player ever sees it" — just outside
   `referenceDb.ts` for the first time since M42.
3. The field's *own doc comment* states its purpose is display, which is a stronger and more direct
   "should be shown" signal than any prior round's field (M43's `regenPerRound`, M44's `.range`, M45's
   geometry table all had to be inferred from a *consumer*, not from an explicit "this exists to be
   shown to a human" comment on the field itself).
4. It reaches **two independent, real, already-wired UI surfaces** through one shared function
   (`applySave()`/`loadSlot()`) — the same "fix one function, two surfaces benefit" shape M40's `robe`
   fix and M37's NPC class/level fix both used.
5. Zero engine-package change needed: `SaveGame.name` is already typed, already serialized/deserialized
   correctly, already computed with real content at the one real write site. The entire gap is in the
   `apps/web` bridge's return-type/return-object (one function) and the two callers' message strings
   (two one-line edits) — the same "all-`apps/web`, zero-`packages/engine`" shape M39/M43/M44/M45 all
   preferred.

## Real-bytes / real-mechanic verification (this round)

Reproduced independently via `packages/engine/test/_scratch_m46_savegame_name.test.ts` (created, run,
**6/6 passed**, then deleted):

### Test 1 — the engine's own round trip preserves a real, varying `.name` intact

```
name1 = 'Champions of Krynn ECL1#34 — Day 1 06:30'
name2 = 'Death Knights of Krynn ECL1#34 — Day 12 23:45'
makeSave({name: name1, ...}) -> serializeSave -> deserializeSave -> .name === name1  ✓
makeSave({name: name2, ...}) -> serializeSave -> deserializeSave -> .name === name2  ✓
name1 !== name2 (genuinely varies, not degenerate)                                  ✓
summarizeSave(save1).name === name1 (the summary helper carries it too, though it has
  no caller anywhere in apps/web — confirmed by grep, zero matches for SaveSummary/
  summarizeSave/listSlots outside saveStore.ts itself)                              ✓
```

Directly executed through the real, unmodified `makeSave`/`serializeSave`/`deserializeSave` — proves the
engine layer is not where the drop happens.

### Test 2 — `quickSave()`'s real source text builds the exact rich name claimed

```ts
expect(src).toMatch(/name:\s*`\$\{state\.map\.name\}\s*—\s*\$\{formatGameTime\(state\.clockMinutes\)\}`/);
```
Passes today — a direct source-text proof (not inference) that the real write site already assembles
`map.name + formatGameTime(clockMinutes)`, not a placeholder.

### Test 3 — `applySave()`'s real return object omits `name` today

```ts
const fnBody = <applySave's function body>;
expect(fnBody.includes('name')).toBe(false);       // true today — passes: the drop is real
expect(fnBody.includes('position')).toBe(true);    // sibling fields it DOES thread through
expect(fnBody.includes('clockMinutes')).toBe(true);
expect(fnBody.includes('flags')).toBe(true);
```

A direct proof that `applySave()` threads every other `SaveGame` field it's asked to restore except
`name`, which never appears in its body at all.

### Test 4 — neither real UI call site references `.name` in its message today

```ts
quickSaveFn.includes("pushMessage('Game saved.')")           === true   // still the generic literal
quickLoadFn.includes("pushMessage('Game loaded.')")          === true
quickLoadFn.includes('restored.name')                        === false  // never referenced
mainMenuLoadCase.includes("setStatus('Saved game loaded.')") === true
mainMenuLoadCase.includes('loaded.name')                     === false  // never referenced
```

### Test 5 — precedent: the message log already safely shows this exact string today

```ts
expect(explore).toMatch(/pushMessage\(`You enter \$\{map\.name\}\.`\)/);
```
Confirms (source-text, not inference) that `map.name` — the dominant half of the proposed save-name
string — already reaches the same message log via an existing, shipped line (M36-era), so extending it
to the save/load confirmations introduces no new class of risk.

### Test 6 — real character-count feasibility against the message row's usable width

```
'Champions of Krynn ECL1#34'        .length === 26
'Death Knights of Krynn ECL1#34'    .length === 30
'Champions of Krynn ECL1#34 — Day 1 06:30'     .length > 39  (usable message-row width)
'Death Knights of Krynn ECL1#34 — Day 1 06:30' .length > 39
```
Both real games' full `name` string modestly exceeds the message row's ~39-usable-column width
(`TEXT_COL0 = 1` through column 39 of the 40-column, 320px-wide screen — `packages/engine/src/render/
exploreScreen.ts:126,131,139-140`). Not a crash risk — `drawChar` (`packages/engine/src/render/
textmode.ts:80-102`) clips per-pixel (`if (px < 0 || px >= fb.width) continue;`), so an over-length line
just loses its last few characters off the right edge, exactly the same tolerance the pre-existing
`"You enter {map.name}."` line (Test 5) already lives with today for the longer of the two labels.

## Wiring plan

**Two files touched for the core fix (`saveStore.ts`, `explore.ts`), one optional third
(`mainMenu.ts`) for the sibling surface — no engine-package change, no new UI panel/route.**

1. **`apps/web/src/ui/saveStore.ts:116-131`** — widen `applySave()`'s return type and returned object
   by one field:
   ```ts
   export function applySave(save: SaveGame): {
     name: string; // M46.S1 — the human-facing save label, previously dropped here
     position: SavePosition | null;
     clockMinutes: number;
     flags: Record<string, number>;
   } {
     ...
     return { name: save.name, position: save.position, clockMinutes: save.clockMinutes, flags: save.flags };
   }
   ```
   `loadSlot()` (`saveStore.ts:134-137`) already returns `ReturnType<typeof applySave> | null`, so both
   real callers pick up `.name` with zero further type-plumbing.

2. **`apps/web/src/ui/explore.ts`** — `quickSave()` (currently 947-956): hoist the already-computed name
   into a local so the confirmation message can reuse it, and pass it to the message:
   ```ts
   function quickSave(): void {
     if (!state) return;
     const name = `${state.map.name} — ${formatGameTime(state.clockMinutes)}`;
     saveToSlot(QUICK_SLOT, { name, position: currentPosition(), clockMinutes: state.clockMinutes, savedAt: state.clockMinutes });
     pushMessage(`Game saved: ${name}.`); // M46.S1 — was the generic 'Game saved.'
   }
   ```
   `quickLoad()` (currently 963-982) — line 979 only:
   ```ts
   pushMessage(`Game loaded: ${restored.name}.`); // M46.S1 — was the generic 'Game loaded.'
   ```

3. **(Optional, same-shape sibling fix, ~1 line) `apps/web/src/ui/mainMenu.ts:149`** — the "Load Saved
   Game" case's status line:
   ```ts
   setStatus(`Saved game loaded: ${loaded.name}.`); // M46.S1 — was the generic 'Saved game loaded.'
   ```
   This is the same `applySave()`/`loadSlot()` return value, so it costs nothing beyond this one line —
   mirrors the M40 "one engine-adjacent fix, two independent UI surfaces" shape. Not covered by an
   existing e2e case today (no `e2e.mjs` case currently exercises `mainMenu.ts`'s "Load Saved Game" verb
   at all — confirmed by grep, zero matches for `"Load Saved Game"`/`"Saved game loaded"` in `e2e.mjs`),
   so ship it as a same-round bonus without a dedicated new assertion, or defer it — either is
   reasonable; flagged as an open question below rather than decided here.

4. **Tests** (extend the existing e2e case only — no new test file, no new case): `apps/web/test/
   e2e.mjs`'s existing `runExplore`/`'explore'` case already has a save/load round-trip block
   (`e2e.mjs:644-666`) using the live `window.__explore.save()`/`.load()`/`.hasSave()` seams and the
   `window.__explore.messages()` seam (already added for M36). Add two assertions inline, using the
   already-exposed `window.__explore.mapName` value (a plain property, `explore.ts:1753`):
   ```js
   const mapNameForMsg = await page.evaluate('window.__explore.mapName');
   await page.evaluate('window.__explore.save()');
   const hadSave = await page.evaluate('window.__explore.hasSave()');
   // M46.S1 — the save confirmation now names the save (map + game time), not a bare 'Game saved.'
   const msgsAfterSave = await page.evaluate('window.__explore.messages()');
   const saveMsgOk = msgsAfterSave.some((m) => m.startsWith('Game saved: ') && m.includes(mapNameForMsg));
   for (const a of ['right', 'forward', 'left', 'forward', 'right']) { /* unchanged */ }
   const movedPose = await page.evaluate('window.__explore.getPose()');
   const loaded = await page.evaluate('window.__explore.load()');
   // M46.S1 — likewise the load confirmation now names which save was restored.
   const msgsAfterLoad = await page.evaluate('window.__explore.messages()');
   const loadMsgOk = msgsAfterLoad.some((m) => m.startsWith('Game loaded: ') && m.includes(mapNameForMsg));
   ...
   saveLoadOk = movedAway && liveLoadOk && bootLoadOk && saveMsgOk && loadMsgOk; // fold into the existing flag
   if (!saveLoadOk) errors.push(`saveLoad: ... saveMsgOk=${saveMsgOk} loadMsgOk=${loadMsgOk}`);
   ```
   `pushMessage()`'s immediate-repeat dedupe (`explore.ts:677`, `if (text === last) return;`) does not
   interfere: the Save/Load messages are never adjacent to each other (movement messages intervene), and
   they differ from each other's own text (`"Game saved: ...`" vs `"Game loaded: ...`"`) regardless.

Rough size: ~6 LOC changed across `saveStore.ts`/`explore.ts` for the core fix (1 return-type widen, 1
local hoist, 2 message-string edits), +1 line in `mainMenu.ts` if the optional sibling fix ships too,
~8 LOC extending the existing `explore` e2e case. No engine-package file touched, no new test file, no
new e2e case, no new route, no new UI panel.

## Layout / feasibility check

No crash risk: `drawChar` (`packages/engine/src/render/textmode.ts:93-101`) bounds-checks every pixel
against the framebuffer (`if (px < 0 || px >= fb.width) continue;`) — an over-length message line is
silently clipped at the screen edge, never wraps garbage or throws. Test 6 confirmed both real games'
full `name` string (map label + " — Day N HH:MM") modestly exceeds the message row's ~39-usable-column
width, so the tail few characters (typically part of the `HH:MM`) would be clipped on real long map
labels — but Test 5 confirms this is not a new tolerance the codebase has to newly accept: the same
`map.name` half of the string already renders through this identical chokepoint today via the M36-era
`"You enter {map.name}."` line, with no reported issue. A future round could shorten the label (e.g. drop
the `ECL1#N` suffix, or show only `formatGameTime` without the map name) if the clipping is judged worth
tightening, but that is a wording call, not a blocking defect — flagged as an open question below.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`listSlots()`/`SaveSummary` (multi-slot save browser)** | `saveStore.ts` already exports a fully-built `listSlots()` returning `{slot, summary: SaveSummary}[]` (name/members/area/savedAt per slot) — confirmed by grep it has **zero callers anywhere in `apps/web/src`**, a stronger "never wired" signal than this round's pick. Rejected for THIS round only because there is no multi-slot UI at all today (the app has exactly one slot, `QUICK_SLOT`) — surfacing this would mean building a new save/load-list panel, which the brief explicitly rules out ("no new UI panels/routes"). Flagged below as a legitimate, bigger future-round candidate once a multi-slot UI exists. |
| **`gswitch.ts` (live EGA↔Amiga graphics switch, a candidate settings-style screen per angle (f))** | Read in full. Already fully wired: its `.gswitch-meta` readout already shows block id, dimensions, used-color count, and palette count (`gswitch.ts:183-193`), and its own e2e seam (`window.__gswitch`) already exposes checksum/platform/category getters. No unread field found. |
| **`charEditor.ts` (Character/Save editor, `?chared=1`)** | Skimmed its header and CoK/DoK mode doc comments; this is the same `.SAV`/`.GAM`/`.JNK`/`.EFF` territory the standing item-instance-subsystem blocker (`DokItemRecord.value`/`.magicBonus`/`.charges`/`.cursed`, blocked 17 consecutive rounds) already covers in depth — not re-investigated further this round per the standing instruction not to re-open that block without a genuinely new angle. |
| **`dqkParty.ts`** | Read in full (63 lines) — a static, project-authored pre-made DQK roster (`DQK_HEROES`), not decoded game data; no field to surface. |
| **`mainMenu.ts`'s "Load Saved Game" as its own standalone finding** | Real and unwired in exactly the same way as `explore.ts`'s pair, but chosen as an *optional* one-line rider on this round's core fix (same shared function) rather than a separate headline, since it has no existing e2e case to extend without adding new test surface — see Open Questions. |
| **`referenceDb.ts`'s `Class`-label collision** (flagged M37, unpicked M38-M45 — 9 rounds running) | Not re-investigated — still real, still cheap, but this round's brief explicitly asked for a sweep outside this file, and this round's save/load finding fits the newly-suggested angle (f) more directly. Deferred again, now 10 rounds running. |
| **`TacticalSpell.inflict`** (flagged M45, needs a new `combatSpells.ts` export) | Not attempted this round — a legitimate bigger future job per the standing note, out of this round's scope since a zero-engine-change candidate was available. |
| **Item-instance subsystem** (`DokItemRecord.value`/`.magicBonus`/`.charges`/`.cursed`) | **Not re-investigated**, per standing instructions — blocked 17 consecutive rounds. |
| **`PartyMemberStatus.age`** | **Not re-investigated** — already rejected twice (M40, M41) on value-degeneracy grounds. |
| **`MapCell.ceiling`/`.flags`** | **Not re-investigated** — confirmed dead in M42. |
| **`exploreScreen.ts`'s `ExploreParty.down`, `combatScreen.ts`'s `CombatCellState.hpFraction`** | **Not re-investigated** — both confirmed dead/intentional in M41/M42/M44. |
| **`MonsterRecord.conSaveBonus`/`.itemPluses`/`.carriedItems`/`.preparedSpellIds`** | **Not re-investigated** — M43 already gave each a specific, still-accurate scope reason. |
| **Wiring real `day` into `dialogue.ts`/`town.ts`'s `recordJournal()` calls** (flagged M41) | Not re-investigated — needs net-new clock plumbing, standing scope note unchanged. |
| **DoK Companion-Panel e2e positive controls for `halfDamage`/`Range`** (M43/M44) | Not re-investigated — still a legitimate small follow-up, out of this round's scope since a stronger new candidate (outside `referenceDb.ts`, per the brief's steer) turned up first. |
| **Whether DoK's `baseTypeId` aliases CoK's pinned ranged-weapon ids (6/7/9/13)** | Not re-investigated — still genuinely unverified per M44, out of this round's scope. |
| **`spellbook.ts`/`treasure.ts`/`townScreen.ts`/`wildernessScreen.ts`/`charSheet.ts`/`eclInspector.ts`/`inventory.ts`/`automapPanel.ts`/`hudPanel.ts`/`BaseItem.weightTenths`** | **Not re-swept** — all confirmed clean M42-M44, no new angle sought. |

## Open questions / unknowns

- **Should `mainMenu.ts`'s "Load Saved Game" fix ship in the same round as the core `explore.ts` fix, or
  be deferred to a follow-up** since it currently has zero e2e coverage of its own (no existing case
  exercises that menu verb at all)? The wiring plan above includes it as a one-line optional rider (same
  shared return value, no new plumbing) but does not mandate a new test for it this round — a scoping
  call for whoever implements this, not resolved here.
- **Is the message's exact wording ("Game saved: X." vs. some other phrasing, e.g. putting the name in
  parentheses or a separate line) the right presentation choice?** Not resolved either way — a minor,
  cheap wording call, in the same spirit as M45's open `"1 cell"` vs `"1 cells"` question.
- **Should the save-name string be shortened for the message-log context** (e.g. drop the `ECL1#N`
  internal-label suffix, or show only the game time without the map label) given Test 6's finding that
  both real games' full label modestly exceeds the message row's ~39-usable-column width? Flagged, not
  blocking (Test 5 shows the codebase already tolerates the map-name half of this string at this exact
  width today), but a legitimate follow-up polish item.
- **`listSlots()`/`SaveSummary` remain fully built and exported from `saveStore.ts` with zero callers
  anywhere in `apps/web`** (confirmed by grep this round) — a stronger "never wired" case than this
  round's pick, but gated on a multi-slot save/load UI that does not exist today. A legitimate, larger
  future-round candidate once (if) the project adds multiple save slots; out of this round's
  no-new-UI-panel scope.

## Implications for our engine

- **The "computed field with a real doc-commented display purpose, dropped one hop before the player"
  shape recurs outside pure `compose*Screen` compositors, not just inside them** — this round's field
  (`SaveGame.name`) is dropped by a plain bridge function (`applySave()`), not a render layer, confirming
  the brief's angle (f) hunch: the series' method generalizes past the compositor pattern to any
  chokepoint function that receives a richer object than it returns/displays.
- **A field's own doc comment stating "this exists to be shown to a human" is a stronger, more direct
  signal than inferring display-worthiness from a downstream consumer** (the method M37-M45 all used,
  since none of those fields' doc comments explicitly said "human-facing"). Worth treating an explicit
  "for display" doc comment as a first-class signal in future sweeps, ahead of hunting for a mechanical
  consumer.
- **`saveStore.ts` now has a second flagged-but-unfixed dead export (`listSlots()`/`SaveSummary`) worth
  tracking as a standing future candidate**, distinct from this round's pick, gated on a multi-slot
  save/load UI existing — a bigger, legitimately out-of-scope job for a single small round, per the
  brief's own guidance not to expand scope into a new UI panel.
- **A fix that needs zero engine-package changes remains the preferred shape when available** — as in
  M39/M43/M44/M45, this round's entire diff lives in `apps/web` UI-layer functions; the engine data model
  (`SaveGame.name`) and its serialization (`serializeSave`/`deserializeSave`) already fully supported the
  fix with no changes at all.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m46_savegame_name.test.ts` (6 tests: a real engine-level round-trip
  proving `serializeSave`/`deserializeSave` preserve a genuinely varying `.name`; a source-text proof
  that `quickSave()` really builds the claimed rich name; a source-text proof that `applySave()` really
  omits `name` from its return object while threading every sibling field; a source-text proof that
  neither real UI call site (`explore.ts`'s pair, `mainMenu.ts`'s Load case) references `.name` in its
  message today; a source-text proof that the identical `map.name` string already reaches the same
  message log safely via an existing M36-era line; and a real character-count feasibility census against
  the message row's usable width for both shipped games' actual labels) — run via `npx vitest run`
  (6/6 passed), then deleted. Confirmed via `git status --porcelain` (clean except this doc) after
  deletion.
