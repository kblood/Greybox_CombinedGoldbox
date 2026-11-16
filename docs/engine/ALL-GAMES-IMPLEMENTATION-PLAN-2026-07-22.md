# Greybox All-Games Implementation Plan

> Status: active execution plan, 2026-07-22.
>
> This plan turns `HANDOFF-ROUNDS-2026-07-22.md`, `LONG-TERM-GOALS.md`, the generated
> support evidence, and the current research handoffs into a dependency-ordered path from
> today's mixed Preview/Route/Persistent/Campaign support to verified playability across the
> Gold Box roster. `BUILD-QUEUE.md` remains the executable task ledger; this document defines
> the compatibility target, ordering, and promotion gates.

## 1. Scope and meaning of "all games work"

The first-class target is the 13 DOS profiles already represented by Greybox detection and support
evidence:

1. Pool of Radiance
2. Curse of the Azure Bonds
3. Secret of the Silver Blades
4. Champions of Krynn
5. Death Knights of Krynn
6. Gateway to the Savage Frontier
7. Treasures of the Savage Frontier
8. Pools of Darkness
9. Neverwinter Nights (DOS/AOL)
10. The Dark Queen of Krynn
11. Forgotten Realms: Unlimited Adventures
12. Buck Rogers: Countdown to Doomsday
13. Buck Rogers: Matrix Cubed

The release target is the DOS campaign/runtime loaded from user-owned data. Amiga art is a
first-class alternate graphic set where equivalent assets are available, especially for CoK/DoK.
Other historical ports are later graphic-set/import targets, not blockers for DOS campaign
compatibility.

Spelljammer is tracked after these 13 as a separate extension. It is a related SSI title but uses a
custom C engine and unique ship-combat systems rather than the DAX/HLIB runtime families. Calling it
supported will require a separate profile and architecture slice; silently forcing it through a
Gold Box fallback would be incorrect.

For a first-class profile, **work** means all of the following are evidence-backed:

- **Discover:** a user-selected folder is identified without machine-local paths, with files,
  platform, graphic sets, ruleset, and capability gaps reported.
- **Decode:** required containers, maps, scripts, monsters, items, UI art, combat art, music,
  effects, saves, and title-specific side tables have named profile contracts. Unknown values stay
  unknown; no sibling layout is silently borrowed.
- **Play:** new game or imported save reaches ordinary exploration, dialogue/events, towns or
  equivalent services, wilderness/overland where present, inventory, magic/abilities, natural
  combat, outcome, and script resume.
- **Persist:** original saves import; Greybox save/reload preserves party, pose, time, area, quest
  state, ECL memory, and encounter consumption. Original-format export is required where the
  format is recoverable and is otherwise shown as an explicit capability gap until recovered.
- **Complete:** representative early, middle, ending, town/service, wilderness, and quest legs pass,
  with structural absences recorded rather than fabricated.
- **Verify:** a clean-input corpus plus browser and Electron regression routes reproduce the claims.
  A dashboard, synthetic encounter, direct ECL entry, or hand-selected preview alone is not enough.

The public target tier is therefore **Verified**, not merely Campaign. The existing tier ladder
remains useful as incremental gates:

```text
Mapped -> Preview -> Route -> Combat -> Persistent -> Campaign -> Verified
```

## 2. Baseline and next honest promotion

Baseline is the generated `apps/web/src/generated/support-evidence.json` at handoff commit
`aadc332`. Some hand-authored support prose is newer or differently worded; generated evidence is
authoritative until the two are regenerated and reconciled.

| Profile | Computed tier | Next promotion work |
| --- | --- | --- |
| Pool of Radiance | Persistent | Prove quest campaign leg; automate campaign traversal; finish the original-DOS ECL2#20 route/symbol trace as reusable evidence. |
| Curse of the Azure Bonds | Persistent | Resolve the genuine no-discrete-town criterion; prove quest leg; automate campaign traversal. |
| Secret of the Silver Blades | Campaign | Turn six-leg evidence into clean-input automated routes; original-save parity and remaining native symbol proof. |
| Champions of Krynn | Campaign | Turn six-leg evidence into clean-input automated routes; finish original-save parity and native CoK-on-DQK fidelity. |
| Death Knights of Krynn | Persistent | Prove middle, ending, and quest legs; reconcile the matrix/prose discrepancy; finish native DoK-on-DQK fidelity. |
| Gateway to the Savage Frontier | Route | Recover PIC pixel packing/VGA fidelity; reach natural combat, outcome, resume, and persistence. |
| Treasures of the Savage Frontier | Preview | Declare and ship a retail route using the Gateway profile; then natural combat/persistence and remaining palette semantics. |
| Pools of Darkness | Preview | Declare a retail route; validate later-Gen1/VGA rules and campaign systems; then combat/persistence. |
| Neverwinter Nights DOS/AOL | Persistent | Recover MONITM extended vocabulary and remaining data gaps; define an online-title campaign criterion; automate breadth. |
| The Dark Queen of Krynn | Route | Reach a natural Gen2 combat in the browser, outcome/resume, persistence, then campaign breadth. |
| FRUA | Preview | Run a representative retail module through CKIT-compatible import/runtime; prove author-to-package-to-play parity. |
| Buck Rogers: Countdown | Missing | Obtain a legal local install, regenerate the corpus, recover XXVc-specific contracts, then build the first route. |
| Buck Rogers: Matrix Cubed | Missing | Obtain a legal local install, validate/reuse the XXVc profile, then build route/combat/persistence proof. |

## 3. Dependency order

### Phase 0 — Make compatibility claims executable

Before broadening support, make the evidence ledger the only way a game is promoted.

1. Regenerate corpus/support evidence with a real generation timestamp and fail when
   `supportClaims.json` exceeds it or contradicts its gaps.
2. Extend route manifests so every tier checkpoint is individually represented: detection,
   exploration, encounter, explicit choice where present, tactical entry, outcome, ECL resume,
   Greybox save/reload, original-save import/export, and campaign legs.
3. Add a per-profile capability manifest for ruleset, ECL dialect, map/container family, graphics,
   audio, save reader/writer, towns, wilderness, and online/module-only differences.
4. Make skipped local-retail tests report an explicit reason and required fixture rather than
   disappearing from the result.

M0.S5 progress (2026-10-17): `packages/engine/test/detect.test.ts` includes the missing fixture
path and skip reason in its CoK, DoK, and CoAB real-install test titles. The CoK SAVGAMA tests in
`packages/engine/test/area1.test.ts` report the required fresh-save or played-save fixture path and
absence reason. The shared `optionalFixtureSkipTitle` helper now reports only missing prerequisites
for CoK item/new-game/thief-skill tests, DoK new-game routes, and CoAB quest/regional-travel tests;
pure tests cover one missing path, multiple missing paths, and the no-skip case. Item 4 remains
partial. Further confirmed local-install gaps remain in `cokThrotlPaths.test.ts` and
`cokWallPort.test.ts`; DoK saved-character, import, gear/spell crosswalk, and ECL dispatch tests;
`coabSavedCharacter.test.ts`; DQK build, item, art, event, quest, combat, and save tests; and the
Gateway, Pools, Treasures, and Neverwinter Nights retail route/fixture suites. This pass did not
finish classifying every conditional gate: a static scan found 257 `skipIf` declarations overall,
including Amiga, C64, and other non-local-retail corpora, so that number is not item 4's denominator.
Complete the local-retail classification and remaining-title audit before marking item 4 complete.

Exit gate: the support page can be regenerated from test/corpus results, and a claim cannot outrun
its evidence without failing `python tools/goldbox_corpus.py --strict`.

### Phase 1 — Close the active handoff frontiers

These investigations remove known format/runtime blockers shared by later phases. Keep GameLink
exclusive: only one DOSBox-X process may run, and symbol capture must be separate from interactive
input when a hot breakpoint is involved.

1. **Pool original-runtime route:** replace the unverified `[0xC04F]` memory formula with Pool's
   own retail host-register mapping; isolate the `(14,10) W -> (13,10)` transition; reach branch 3
   (`0x9F13`), combat (`0xA0B3`), and resume. Capture remaining symbols in a separate run.
2. **Gateway PIC:** the producer is now proven: decompressed `MUSIC.DAX` block 0 installs an INT 1Ch
   hook whose `CS:2BB0` handler increments the dword returned by `CS:2BE5`. Modeling the normal BIOS
   IRQ0 -> INT 1Ch chain clears the 16.18M stall; directory-aware `FindFirst` closes the following
   `C:\\SAVE` loop. Strict loader signatures also retract every prior 7,744-byte dump as an unrelated
   descriptor reusing the same physical overlay window. A deterministic native route now loads a
   game-created A and reaches a stable illustrated story scene, but its archive family is not yet
   proven; four bounded Unicorn input alignments still open no `PIC*.DAX`. Trace native file opens
   for that scene or add state-aware Unicorn key gates. Only after a real PIC-family open, capture
   the exact `rel+0x4A1` return, derive the input-to-88x88-output packing, and ship the
   loader/golden/test. If the algorithm remains unlocated after that bounded attempt, make an
   explicit park/continue decision.
3. **CoK MIDI.DAX:** fix overlay population in Unicorn by tracing the `0x2891` staging copy and
   matching Gateway's DOS/BIOS file-service coverage; capture CX/ES and decode one complete song.
   Use a live DOSBox-X trace only if the static harness stalls after the documented bounded pass.
4. **NWN residuals:** recover the variable-length GAME.EXE item-name table, attempt evidence-backed
   block-202 tile assignment, structurally audit `ITEMS.1`, and define campaign applicability for
   the single-shard online title.
5. **Small shared residuals:** close GLBR pitch-table provenance and Treasures palette 0-15 if
   evidence is available; otherwise retain explicit gaps.

Exit gate: every solved item is a loader/runtime contract with a guarded test and visual/audio
verification where applicable; negative results update the research handoff.

### Phase 2 — Finish first-wave Gen1 campaigns

Build campaign legs from retail saves or reproducibly staged states, then automate them:

1. Pool quest.
2. CoAB town-equivalence decision and quest.
3. DoK middle, ending, and quest (and reconcile any stale town/wilderness claims).
4. Convert CoK and Secret's six legs from one-off engine proof into clean-input regression routes.
5. Add original-save round-trip tests per title, including byte-preservation checks for unknown
   fields and backups before writes.

Exit gate: Pool, CoAB, Secret, CoK, and DoK are Campaign by generated evidence and their route
corpus is repeatable without maintainer-only state.

### Phase 3 — Complete the Savage Frontier family

1. Promote Gateway's PIC/VGA, monster-tail, item, AD&D 2e, ECL, audio, and save differences into a
   named `savaged-frontier` capability profile.
2. Drive a normal Gateway game to natural encounter, player choice, tactical combat, outcome,
   ECL resume, save, and reload.
3. Apply the proven profile to Treasures, retaining its 510-byte monster records, compact items,
   third 8X8D subformat, palette, weather, and NPC-emotion deltas as title-scoped contracts.
4. Prove representative campaign legs in both games and add browser/Electron routes.

Exit gate: Gateway and Treasures are Campaign with faithful VGA rendering and persistent natural
combat; no CoAB/Krynn fallback supplies title-specific facts.

### Phase 4 — Complete later Gen1: Pools of Darkness and NWN

1. Declare a natural Pools of Darkness route and validate its VGA assets, later-Gen1 ECL/rules,
   planar transitions, clone mechanic, saves, combat, and campaign state.
2. Finish NWN's offline-reconstructable data/rules contracts, explicitly separating original AOL
   server behavior that is unavailable or out of product scope.
3. Define and automate a campaign-equivalent NWN breadth matrix appropriate to the surviving
   single-shard client data.

Exit gate: Pools of Darkness is Campaign; NWN is Campaign-equivalent with server-era omissions
clearly reported by the capability system.

### Phase 5 — Complete Gen2 and FRUA

1. Drive DQK from ordinary play into a natural combat, outcome, ECL resume, save/reload, towns,
   wilderness/transitions, quest state, and ending.
2. Finish Gen2 save and content contracts shared with CKIT while preserving DQK-specific rules.
3. Import a representative FRUA module with a feature report, run it in browser and Electron, and
   round-trip it through Greybox Author without semantic drift.
4. Create the small reference campaign required by the authoring acceptance gate.

Exit gate: DQK is Verified; FRUA/module play is Verified for the declared compatibility subset;
authoring produces deterministic packages that both shells run identically.

### Phase 6 — Add the Buck Rogers XXVc family

This phase cannot make retail claims until user-owned installs are locally available.

1. Acquire/provide both legal installs; add their roots without committing assets.
2. Run the corpus and generate executable, DAX, ECL, GEO, graphics, monster, item, audio, and save
   inventories.
3. Implement an XXVc ruleset plugin: careers, skills/psionics, equipment, ranged combat, zero-G,
   vehicles/robots where present, advancement, and title-specific character transfer.
4. Promote Countdown through Route -> Combat -> Persistent -> Campaign.
5. Reuse only byte-proven family contracts for Matrix Cubed, then repeat the promotion ladder.

Exit gate: both Buck Rogers games are Campaign and automated; neither inherits AD&D behavior by
accident.

### Phase 7 — Cross-game fidelity closure

After every profile has a campaign route, close shared systemic gaps revealed by those routes:

- original DOS save writers and cross-title character transfer;
- exhaustive ECL opcode/dialect coverage with unknown-opcode corpus checks;
- profile-selected AD&D 1e, Dragonlance, AD&D 2e, and XXVc rules;
- tactical combat parity for spells, monster specials, AI, morale, surrender/flee, XP, loot, and
  post-combat state;
- graphics across EGA/VGA/Amiga, palettes, animation/deltas, walls, portraits, sprites, and combat;
- title music and effects through decoded timelines/banks rather than synthetic substitutes;
- towns, services, overland travel, time/moons/weather, journals, inventory, magic, and quest flags;
- native CoK/DoK-on-DQK validation and clean distributable native artifacts.

Exit gate: no known campaign-path behavior depends on a synthetic encounter, invented format,
hard-coded roster, or undocumented sibling fallback.

### Phase 8 — Verified compatibility release

1. Run every profile from clean user-selected inputs in browser and Electron.
2. Run detection, decoder goldens, route corpus, campaign matrix, save migration/backup, typecheck,
   engine tests, full e2e, production build, and live probes in one release pipeline.
3. Generate the support matrix and capability gaps from that run.
4. Verify no copyrighted assets or maintainer-local paths enter packages.
5. Publish versioned browser/Electron builds and reproducible native artifacts.

Exit gate: all locally available profiles are Verified; the two Buck titles cannot be marked
Verified until their legal retail fixtures exist and pass. Release notes list any structurally
unavailable NWN/AOL behavior and any deliberately deferred alternate-platform feature.

## 4. Immediate execution order (rounds 6–8 equivalent)

The next bounded sequence is:

1. Pool host-register correction and route completion.
2. Gateway native picture-route file-open proof / Unicorn input parity, then PIC loader capture.
3. CoK MIDI overlay population.
4. NWN item vocabulary/tiles/`ITEMS.1` and campaign-criteria decision.
5. GLBR/Treasures small residuals.
6. Promote whichever of Gateway, Treasures, Pools of Darkness, and DQK is closest to the next
   generated tier; do not keep spending on an investigation after its documented parking threshold.

Pool is first even though Greybox already reports it Persistent: the task fixes a false runtime
address assumption in reusable tracing infrastructure and completes the original-executable proof
needed by the evidence factory and native convergence work.

Execution status (2026-07-22): item 1's host-register, locked-door, descriptor-3, native combat-entry,
and Greybox victory/resume work is complete. A retail Quick-combat attempt ended in full-party
defeat, so native victory-to-exploration remains explicitly open. The next independent bounded
implementation frontier is item 2, Gateway INT 8/PIC.

## 5. Slice definition of done

Every implementation slice must include:

1. Retail-byte/runtime provenance or a clearly labelled clean-room synthetic contract.
2. Profile/dialect selection instead of an implicit game-title conditional where a capability
   contract fits.
3. Unit/golden tests for new decoding or engine behavior.
4. Browser e2e for a new user-visible route or capability.
5. Corpus/support updates in the same commit as a tier change.
6. Research notes for both successful and rejected hypotheses.
7. Visual inspection of graphics renders and bounded audio-timeline sanity checks.
8. No edits to retail data; all staging occurs under ignored build directories.

The standard close gate is:

```powershell
Push-Location packages/engine; npx tsc --noEmit; npx vitest run; Pop-Location
Push-Location apps/web; npx tsc --noEmit; node test/e2e.mjs; Pop-Location
python tools/goldbox_corpus.py --strict
pnpm build:app
```

Deploy and live-probe only when the slice changes the shipped app. Research-only tooling must run
its focused tests and leave a reproducible command/evidence record even when no application code
changes.
