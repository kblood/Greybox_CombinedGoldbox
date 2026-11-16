# Scope audit (2026-07-03) — the next genuinely-new, in-vision gap after Phase M10

> **Purpose.** The full-auto loop closed Phase M10 (Companion panels folded into live play,
> CoK + DoK via M10.S1–S3, DQK via M10.S5) and then found `BUILD-QUEUE.md` exhausted of
> headless-actionable work: the only unchecked items are the PARKED **E6.2b-4** (DQK
> copy-protection — do NOT touch) and the flagged user-decision fork **M10.S4** (in-play ECL
> inspector + write-capable char/save editing — never auto-build). Both sibling worklists
> (`decompile-worklist.md`, `cc-format-coverage.md`) remain fully converged (0 unchecked
> items each, re-verified this audit — see §4). This doc repeats the exact audit that
> justified opening M8, M9, and M10: read `VISION.md` in full, diff its promises against what
> the code actually delivers, and propose the next high-value slice. **This doc does not edit
> `BUILD-QUEUE.md` or `ROADMAP.md`** — it is the proposal for the loop (or the user) to merge
> in explicitly.

---

## 1. Pillar-by-pillar delivery state (what VISION promises vs. what ships)

| VISION pillar | State | Evidence |
| --- | --- | --- |
| **1. Universal player + Game Library / auto-detect** | **Delivered** for the playable path. Krynn trilogy plays end-to-end (CoK Phase A, DoK Phase B, DQK Phase C); folder-reference detection + real picked-folder byte streaming for both engine generations (M7.S1 Gen1 DAX, M7.S2 Gen2 HLIB). Broader roster (PoR/CoAB/Savage Frontier/Buck Rogers) is *detected only* (M5.S6) — VISION explicitly makes that "architected-for," not a deliverable, and there is no committed asset data for those 4 titles. | Phases A/B/C, M0/M6/M7, M5.S6 |
| **2. Live graphics-mode switching** | **Delivered in play** (Phase M9): CoK + DoK flip EGA↔Amiga while walking, persisted, honest per-category provenance badge, reachable from the Library-boot flow. DQK is a non-goal (single VGA set). | Phase M9 |
| **3. Authoring (FRUA, broadened)** | **PARTIAL — the gap this doc proposes to close.** The *editing* half is delivered: `ModulePackage` + loader (M5.S1), FRUA import (M5.S2a/b), map editor (M5.S3), 35-type event editor compiling to real ECL (M5.S4), DB editors + ruleset picker (M5.S5), broader-roster rulesets (M5.S6). But the *distribution* half of the FRUA baseline — **save a module to a portable file, share it, and play it in the player / Library** — does not exist. See §2. | Phase M5 + the finding in §2 |
| **4. Gold Box Companion, built in** | **Delivered in play** (Phase M10): all five panels (Automap/HUD/Journal/Char sheet/Databases) fold into the live CoK/DoK explore host (M10.S1–S3) and DQK's `dqkExplore.ts` (M10.S5), read-only, over the running game. | Phase M10 |
| **5. Two shells, one core** | **Delivered**: Electron shell (M6.S1) + packaged portable `.exe` (M6.S2), renderer = the web build unmodified. | Phase M6 |

**"Done enough to share" bar (VISION §"What done enough to share looks like"):** play CoK
start-to-finish in browser **and** Electron via the folder-reference flow, ≥2 switchable
graphic sets, plus a read-only Companion panel — **all met** (M9.S5 + M10.S2/S3, marked MET
in VISION.md). The first public *player* milestone is complete. The next milestone VISION
names after it is verbatim: **"Authoring follows."** That is precisely the pillar with the
open clause.

---

## 2. The gap: authored modules can be edited and playtested, but never leave the author sandbox

This is the same shape as the M9 and M10 findings — the machinery is fully built and
unit-tested, but **the real product loop does not consume it end-to-end.** Phase M5 built a
complete *editing* suite; nothing distributes or plays its output outside the author app's
own throwaway playtest.

**What VISION pillar 3 asks for (verbatim):** "Authoring (FRUA, broadened). **Everything
Unlimited Adventures / FRUA allowed as the baseline**, then expanded." FRUA's baseline is not
just an editor — it is *author a design, save it as a shareable module, and have it played*
(the entire FRUA/UA community existed to trade `.DSN` designs). VISION's own first-milestone
line ends "**Authoring follows**" immediately after the play milestone, and the distribution
stance frames user content as ownable/portable data ("original game data is **user-supplied**
… point me at your install"). An authored module is the clearest case of user-owned,
portable data the suite produces.

**What the code actually does today (verified this audit):**

- **No whole-`ModulePackage` serializer exists.** The engine has `serializeModuleMap` /
  `serializeModuleDatabase` (per-piece), but grep for `serializeModulePackage` /
  `deserializeModulePackage` / `ModuleFile` / `.gbmod` across `packages/engine/src` and
  `apps/` returns **nothing**. `ModulePackage` (`packages/engine/src/module/types.ts` L163:
  `{schema:1, id, title, ruleset, maps, entrypoints, graphicSets?, databases?}`) is a clean,
  self-contained, serializable object — but no code turns a whole one into, or back from, a
  portable artifact.
- **The author app persists only to a single anonymous localStorage slot.**
  `apps/author/src/main.ts` writes `STORE_KEY` (map) + `STORE_KEY_DB` (database) to
  `localStorage` and reads them back on load — one module, no name, no second slot. There is
  **no file export** (grep for `Blob` / `createObjectURL` / `download` / `showSaveFilePicker`
  / file `input` in `apps/author/src` returns nothing) and **no file import**. An authored
  module cannot be saved to disk, shared, or even kept alongside a second design.
- **The player (`apps/web`) never imports `loadModule` / `ModulePackage` /
  `resolveEntryPoint`.** Grep across `apps/web/src` returns **zero** matches. Authored content
  is playable *only* inside `apps/author`'s own playtest mode (`state.playtest`), which builds
  a throwaway `loadModule(buildPackage(), …)` and never persists or exports it. The Library
  (`apps/web/src/ui/library.ts`) knows only detected original-game folders (`LibraryEntry`
  keyed on `profileId`/`platform`); there is no `kind:'module'` entry, so an authored module
  can never become a playable Library entry the way "Launch any Gold Box title" (pillar 1)
  and "playtest through the same engine" (pillar 3) jointly imply.

**Why this is the right next thing (and not busywork):**
1. It is the **one open clause of a named VISION pillar** (3) — the FRUA *baseline*
   (author→save→share→play), not an invented extra. VISION explicitly sequences it as the
   milestone *after* the now-met play milestone ("Authoring follows").
2. The precedent is exact: M9/M10 each took a fully-built, unit-tested mechanism that "the
   live loop never consumes" and wired it into the real product path. Phase M5 built the whole
   `ModulePackage` + `loadModule` + editor stack; this phase makes its output a portable,
   playable artifact — same discipline, same shape of finding.
3. It is **fully headless-verifiable**: engine round-trip tests for the serializer (G2); an
   `apps/author` e2e that exports a module to a file, clears, re-imports, and playtests it
   (G4); an `apps/web` e2e that imports a `.gbmod` into the Library and boots it into the real
   explore loop with the M10 Companion host (G4).
4. It **bolts almost nothing new onto the engine data model** — `ModulePackage` already exists
   and is the exact object to serialize; the play path (`loadModule`/`Explorer`/`EclVm`) and
   the in-play Companion host (M10) already ship. This is mostly serializer + host-side wiring,
   exactly like M9/M10.
5. It closes a genuine architectural asymmetry: original games are first-class Library entries
   that boot into the shared explore loop; authored games — the suite's *own* output — are
   not. Making them first-class is the natural generalization of pillar 1.

**Adjacent, lower-priority gaps found in the same audit (candidates, not the pick):**
- **`packages/ui-kit` / `ui-player` / `ui-companion` / `ui-author` packages never extracted
  (ROADMAP M0.S3, ARCHITECTURE §1).** `apps/author/src/screenSurface.ts` is still duplicated
  near-verbatim from `apps/web`. Real tech debt, but an internal refactor with no user-visible
  VISION promise — lower value than pillar 3. The player-side module host (M11.S3) becomes a
  *third* consumer of shared UI, strengthening the case for M0.S3 *after* this phase, not
  before it. (M10's audit made the same deferral for the same reason.)
- **`assets` / `strings` fields of `ModulePackage` (ARCHITECTURE §2.5's full shape) still
  deferred** — only `graphicSets`/`databases` landed (M5.S2b/S5). Relevant to how much a
  portable module can carry (see M11.S4), but not blocking the core round-trip.
- **Save-format completeness** (`.PTY` ~196–513 hot zone, `.WIZ` spell-id encoding) — sibling
  decompile/native track, and the remaining pieces need the dynamic trace §4 rules out.

---

## 3. Proposed Phase M11 — Author → distribute → play: portable module packages, playable in the Library (finish VISION pillar 3's FRUA baseline)

> **Why now (the next genuinely-new, in-vision gap after the 2026-07-03 M10 close).** The
> only unchecked items are the PARKED **E6.2b-4** (DQK copy-protection — do NOT touch) and the
> user-decision fork **M10.S4** (never auto-build). Phases A/B/C/M5–M10 delivered pillars 1, 2,
> 4, 5 and the *editing* half of pillar 3. Auditing what `VISION.md` still promises but the
> code does not yet deliver surfaces one clear, high-value, currently-open gap: **pillar 3's
> FRUA baseline — author a module, SAVE it as a portable design, SHARE it, and PLAY it** — the
> milestone VISION names immediately after the now-met play/share bar ("Authoring follows").
> Today authored modules live only in `apps/author`'s single anonymous localStorage slot: there
> is no whole-`ModulePackage` serializer, no file export/import in the author, and the player
> (`apps/web`) never imports `loadModule`/`ModulePackage` — so an authored game can be edited
> and playtested but never saved to a file, shared, or booted as a Library entry the way an
> original game is. This phase makes an authored `ModulePackage` a portable, playable artifact
> and a first-class Library entry — the exact M9/M10-shaped move (wire a built-and-tested
> mechanism into the real product loop). It bolts almost nothing new onto the engine data
> model; it consumes machinery Phase M5 + M10 already shipped. Numbered M11 per the loop's
> convention of opening a fresh milestone when parked E6.2b-4 / M10.S4 can't absorb more effort.
>
> **Deploy gotcha (memory `goldbox-build-loop`):** an `apps/web` redeploy clobbers
> `/greybox/author/` — always redeploy BOTH `apps/web` and `apps/author` and re-verify both
> live-200, even for an `apps/web`-only change.
>
> **Not in scope:** any NEW authoring *capability* (M5 built the editors); the
> `packages/ui-kit`/`ui-*` extraction (ROADMAP M0.S3 — a natural follow-on once the player-side
> module host is a third real consumer, but organizational, not this phase); a hosted public
> module gallery / bundling original-derived art into shared modules (M11.S5 — a
> legal/distribution user-decision fork, flagged, NOT auto-built).

### Slices (small, independently verifiable, each with G1–G4 gates)

- **M11.S1** *(cold-start item — a Sonnet engineer can pick this up today; engine-only, no
  web/deploy surface)* **Whole-`ModulePackage` serializer + round-trip.** Add
  `serializeModulePackage(pkg): string` / `deserializeModulePackage(text): ModulePackage` to
  `packages/engine/src/module/` (versioned by the existing `schema:1` field; JSON is the
  natural carrier — `maps`/`entrypoints`/`events`/`databases`/`ruleset` id are all plain
  data). **Scope decision to make explicit in the slice:** `graphicSets?` (decoded `FrameSet`
  pixel arrays) are heavy and are an art *import product*, not authored data — S1 should
  **omit `graphicSets` by default** (serialize a note that art must be re-imported, or a
  reference), leaving art-embedding to M11.S4; decide and document rather than silently
  dropping. **Acceptance (G2):** a hand-authored package with ≥2 maps, chained events, a
  populated `ModuleDatabase`, and a custom ruleset id serializes to a string,
  deserializes to a structurally-equal package, and the deserialized package
  loads+walks+fires an event **identically** through the real `loadModule`/`Explorer`/`EclVm`
  path (compare against the pre-serialization package's play result). *Recommended:
  Implementer / Sonnet (mechanical — serialize an existing, already-typed data object).*

- **M11.S2** **Author app: named modules + Export/Import to a portable file.** Replace the
  single anonymous localStorage slot with a named-module list (multiple designs coexist), and
  add **Export module** (download a `.gbmod`/JSON file via `Blob` + object URL, using S1's
  serializer over the full `buildPackage()`) and **Import module** (file `input` →
  `deserializeModulePackage` → load into the editor). **Acceptance (G4, `apps/author` e2e):**
  author a map + event + DB under a name, Export (captured via a download seam), **New** (clear
  editor), Import the exported file, playtest — the imported module plays identically; a second
  named module can be created and Exported without clobbering the first. *Recommended:
  Implementer / Sonnet (author-app UI + the S1 serializer; own e2e port 5190).*

- **M11.S3** *(the headline)* **Player app: authored modules are first-class, playable Library
  entries.** In `apps/web`, add "Add authored module" to the Library (import a `.gbmod` file;
  Electron uses its native file dialog, web uses a file `input`), register it as a
  `LibraryEntry` with a new `kind:'module'` (distinct from the detected-game `profileId` kind),
  and boot it via `loadModule`/`resolveEntryPoint`/`Explorer` into the **same** explore loop
  original games use — including the M10 in-play Companion host (read-only automap over the
  authored map). This is the first time `apps/web` imports `loadModule`. **Acceptance (G4,
  `apps/web` e2e):** import an authored `.gbmod` through the Library seam, click its entry, land
  in the authored first map, walk N/E/S/W, step onto an authored eventful cell and fire its real
  ECL text through the live `EclVm`, open the read-only Companion automap and confirm it reflects
  the authored map's walked cells; zero console errors. Closes the author→play loop end-to-end.
  *Recommended: Implementer / Opus (touches the Library + a new player boot path + the M10 host;
  the M9/M10-class integration slice).*

- **M11.S4** *(follow-on, in-scope but sequenced last)* **Carry imported art across the portable
  package.** So an authored module that imported FRUA/DQK `.TLB` art (M5.S2b `graphicSets`) keeps
  its scene art through Export→Import and renders it in playtest and the player. Decide the
  carrier (embed decoded `FrameSet` data, vs. a referenced-asset manifest the user re-points at —
  the same "point me at your install" tactic the distribution stance uses for original games).
  **Acceptance (G4):** an authored module with imported art round-trips through Export/Import and
  renders its scene art in both `apps/author` playtest and the `apps/web` player. *Recommended:
  Implementer / Opus (interacts with the distribution stance — see M11.S5's boundary).*

- **M11.S5** *(FLAG FOR USER — do NOT auto-build; legal/distribution boundary)* **Public module
  sharing / gallery, and whether shared modules may embed original-derived assets.** A hosted
  place to upload/download `.gbmod` files, and/or letting an exported module **embed decoded
  original-game art** (from a user's own DQK/CoK `.TLB`), crosses the project's distribution
  stance verbatim ("Ship the engine + tools only … nothing copyrighted is committed to the repo
  or hosted on the website"). A public gallery that accepts user uploads potentially containing
  copyrighted SSI art is a **legal + hosting + moderation decision**, and "may an exported module
  embed original-derived art vs. author-original art only" is a policy fork. This is surfaced,
  not decided. *Recommended: hold for user.*

---

## 4. Sanity-check: any new open items on the two sibling worklists, or a new headless angle on the blocked items?

- **`decompile-worklist.md`:** `- [ ]` count = **0**. Its own closing note: "every currently-
  identified decompile thread … is now either DONE or a rigorous documented negative with a
  named next step. No further decompile units are queued." The only remainders (seg051 RNG seed
  watchpoint, DQK ECL extended-opcode table base breakpoint) each need a DOSBox-X dynamic
  watchpoint/breakpoint set via the keyboard-only debugger console — which the dosbot SDL build
  drops (synthetic keyboard input ignored; only mouse lands). **Unchanged; stays blocked.**
- **`cc-format-coverage.md`:** `- [ ]` count = **0**. The 28-cell headless byte-identity harness
  is live and green across all three container generations; every format is SUPPORTED except
  DOS-native music playback, which needs the same infeasible dynamic trace.
- **No new automatable angle** on E6.2b-4 or the two decompile negatives was found this audit —
  same input wall as the M9/M10 audits documented. No loop effort should be spent re-attempting
  them headlessly. **E6.2b-4 remains strictly off-limits.**

Both sibling tracks are ruled out as this iteration's target: fully converged.

---

## 5. Recommendation

Open **Phase M11 — Author → distribute → play: portable module packages, playable in the
Library** (§3) as the next loop phase, and start with **M11.S1** (whole-`ModulePackage`
serializer; cold-start, Sonnet-friendly, engine-only). It closes the one open clause of VISION
pillar 3 (the FRUA baseline — author→save→share→play), the milestone VISION names right after
the now-met play/share bar, and mirrors the M9/M10 precedent exactly (wire a built-and-tested
mechanism into the real product loop). It is fully headless-verifiable under the standard G1–G4
gates. **M11.S5 is a flagged user-decision fork (public gallery / embedding original-derived
art) and must not be auto-built.** The `packages/ui-kit`/`ui-*` extraction (M0.S3) is the
natural next pickup *after* M11, once the player-side module host gives it a third real consumer.
