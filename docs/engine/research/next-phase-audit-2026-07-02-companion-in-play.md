# Scope audit (2026-07-02) — the next genuinely-new, in-vision gap after Phase M9

> **Purpose.** The full-auto loop closed Phase M9 (live graphics-mode switching in actual
> play, CoK + DoK) and then found `BUILD-QUEUE.md` exhausted of headless-actionable work:
> the only unchecked item is the PARKED **E6.2b-4** (DQK copy-protection — do NOT touch),
> and both sibling worklists (`decompile-worklist.md`, `cc-format-coverage.md`) have
> converged to "done except items needing interactive/dynamic-trace tooling proven
> infeasible headlessly." This doc repeats the exact audit that justified opening M8 and
> M9: read `VISION.md` in full, diff its promises against what the code actually delivers,
> and propose the next high-value slice. **This doc does not edit `BUILD-QUEUE.md` or
> `ROADMAP.md`** — it is the proposal for the loop (or the user) to merge in explicitly.

---

## 1. Pillar-by-pillar delivery state (what VISION promises vs. what ships)

| VISION pillar | State | Evidence |
| --- | --- | --- |
| **1. Universal player + Game Library / auto-detect** | **Delivered** for the playable path. Folder-reference detection (M0.S5), Electron native fs (M6.S1), and real picked-folder byte streaming for **both** engine generations (Gen1 DAX = M7.S1, Gen2 HLIB = M7.S2). Broader roster is *detected* only (M5.S6) — VISION explicitly makes that "architected-for," not a deliverable. | Phases M0/M6/M7 |
| **2. Live graphics-mode switching** | **Delivered in play** (Phase M9): CoK + DoK flip EGA↔Amiga while walking, persisted choice, honest per-category provenance badge. DQK is a non-goal (single VGA set). | Phase M9 |
| **3. Authoring (FRUA, broadened)** | **Delivered** as a working suite: `ModulePackage` + loader (M5.S1), FRUA `GEO`/`.DSN`/`.TLB` import (M5.S2a/b), map editor (M5.S3), 35-type event editor compiling to real ECL (M5.S4), DB editors + ruleset picker + custom ruleset (M5.S5), broader-roster rulesets (M5.S6). | Phase M5 |
| **4. Gold Box Companion, built in** | **PARTIAL — the gap this doc proposes to close.** All five panels are *built and tested as standalone demo routes* (`?automap=1`, `?hud=1`, `?journal=…`, `?chared=1`, `?ecl=1`, `?refdb=1`) but **none is folded into the actual play session as a first-class panel.** | Phase D + the finding in §2 |
| **5. Two shells, one core** | **Delivered**: Electron shell (M6.S1) + packaged portable `.exe` (M6.S2), renderer = the web build unmodified. | Phase M6 |

**"Done enough to share" bar (VISION §"What done enough to share looks like"):** play CoK
start-to-finish in browser **and** Electron, via the folder-reference flow, with ≥2
switchable graphic sets, **plus a read-only Companion panel (auto-map + databases)**. Four
of the five clauses are structurally met. The **only** clause not honestly met is the last:
*a read-only Companion panel available while playing.* Today the Companion panels are
separate pages you reach by URL, not something visible or live during an actual CoK play
session.

---

## 2. The gap: Companion features are standalone demos, not first-class in-play panels

This is the same shape as the M9 finding — the machinery is fully built and unit-tested,
but **nothing in the live play loop consumes it.**

**What VISION pillar 4 asks for (verbatim):** "Fold the GBC tool's features (party/character
tooling, auto-map, journal, monster/item/spell databases, helpers) into the engine **as
first-class panels**." ARCHITECTURE §1 even reserves a `packages/ui-companion` for exactly
this ("Automap, journal, monster/item/spell DB, char/save editor, ECL VM inspector … Gold
Box Companion features **as panels**").

**What the code actually does today (verified this audit):**

- **Automap.** Phase D1 built a *real* engine model (`world/automap.ts`: fog-of-war,
  visited tracking, notes, JSON round-trip) and a pure compositor
  (`render/automapPanel.ts`), exposed at the standalone `?automap=1` route
  (`apps/web/src/ui/automapPanel.ts`). Its own D1 note flags the gap: *"auto-feed the model
  from live walking in explore.ts (today the panel is its own persisted store +
  click-reveal)."* Worse, the actual play view (`apps/web/src/ui/explore.ts`) draws its **own
  separate, inferior bespoke automap canvas** (explore.ts ~L1593–1596) that does **not** use
  the D1 `Automap` model at all — so there is both a vision gap *and* a live duplication of a
  solved feature (the exact anti-duplication smell M8.S1 caught for the frame viewer).
- **HUD** (D2, `?hud=1`), **Journal** (D3-era), **Char/Save editor** (D3, `?chared=1`),
  **ECL inspector** (D4, `?ecl=1`), **Reference DBs** (D5, `?refdb=1`) — each is a
  self-contained route with its own `window.__*` seam. None is reachable *from within* a
  live CoK/DoK explore session; a player walking a dungeon cannot open the automap, glance at
  party HP, or look up a monster without leaving the game.

**Why this is the right next thing (and not busywork):**
1. It is a **named VISION pillar** (4) and the **one unmet clause** of the "done enough to
   share" bar — the highest-leverage gap left, not an invented one.
2. The precedent is exact: M9 took a fully-built, unit-tested mechanism (`GraphicSetManager`)
   that "nothing in the exploration path consumes" and wired it into live play. This does the
   same for the Companion panels — same discipline, same kind of finding.
3. It is **fully headless-verifiable**: e2e can boot the Library/`?explore` path, walk the
   party, and assert the in-play automap reveals visited cells / the HUD reflects live party
   state / the DB panel opens over the running session — the standard G4 gate.
4. It **retires a real duplication** (explore.ts's bespoke automap → the D1 `Automap` model),
   improving fidelity (fog-of-war + notes) while removing code.
5. It bolts **nothing new** onto the engine data model — every compositor + model already
   ships and is tested; this is pure host-side wiring, exactly like M9.

**Adjacent, lower-priority gaps found in the same audit (candidates, not the pick):**
- **`packages/ui-kit` never extracted (ROADMAP M0.S3).** `apps/author` duplicates
  `screenSurface.ts` "near-verbatim"; `apps/web/src/ui` holds all UI. ARCHITECTURE's
  migration step 3. Real tech debt, but an internal refactor with no user-visible VISION
  promise attached — lower value than pillar 4. A natural M0.S3 pickup *after* the panels are
  wired (the in-play panel host is the first real second consumer that would justify the
  shared kit).
- **`ui-player` / `ui-companion` / `ui-author` packages (ARCHITECTURE §1) don't exist.** Same
  class as above — organizational, not a capability gap.
- **Save-format completeness** (`.PTY` ~196–513 hot zone, `.WIZ` spell-id encoding) — sibling
  decompile/native track, and the remaining pieces need the same dynamic trace §4 rules out.

---

## 3. Proposed Phase M10 — Companion panels folded into live play (finish VISION pillar 4)

> **Why now (the next genuinely-new, in-vision gap after the 2026-07-02 M9 close).** The
> only unchecked primary-goal item is still **E6.2b-4** (DQK copy-protection, PARKED after 5
> RE passes — do NOT touch it), and Phases M5/M6/M7/M8/M9 delivered pillars 1, 2, 3, and 5.
> Auditing what `VISION.md` still promises but the code does not yet deliver surfaces one
> clear, high-value, currently-open gap: **pillar 4 — "Fold the GBC tool's features … into
> the engine as first-class panels"** — and the **one unmet clause** of the "done enough to
> share" bar ("plus a read-only Companion panel (auto-map + databases)" *while playing*).
> Today all five Companion panels exist only as **standalone demo routes** (`?automap=1`,
> `?hud=1`, `?refdb=1`, `?chared=1`, `?ecl=1`); the live play view (`explore.ts`,
> `dqkExplore.ts`) never opens any of them, and it even draws its **own** inferior bespoke
> automap that ignores Phase D1's real `Automap` model (fog-of-war + notes). This phase wires
> the already-built, already-tested D-phase compositors/models into the live play loop as
> toggleable overlays — the headline "Companion, built in," in play, not a demo. It bolts
> nothing new onto the engine's data model; it consumes machinery Phase D already shipped —
> the exact M9-shaped move. Numbered M10 per the loop's convention of opening a fresh
> milestone when parked E6.2b-4 can't absorb more effort.
>
> **Deploy gotcha (memory `goldbox-build-loop`):** an `apps/web` redeploy clobbers
> `/greybox/author/` — always redeploy BOTH `apps/web` and `apps/author` and re-verify both
> live-200, even for an `apps/web`-only change.
>
> **Not in scope:** any NEW Companion capability (all five panels already exist); the
> `packages/ui-kit`/`ui-companion` extraction (ROADMAP M0.S3 — a natural follow-on once the
> in-play panel host is the second real consumer, but organizational, not this phase); the
> broader-roster panels (those games aren't playable). Write panels are read-only in play
> first, matching the "done enough to share" bar and Phase D's own read-only-first stance.

### Slices (small, independently verifiable, each with G1–G4 gates)

- **M10.S1** *(cold-start item — a Sonnet engineer can pick this up today)* **Live automap:
  feed Phase D1's `Automap` model from actual walking, and replace explore.ts's bespoke
  automap canvas with `composeAutomapPanel`.** In `explore.ts`, call `automap.visit(cell)` on
  every successful move/spawn; render the fog-of-war + party-facing panel from the D1
  compositor instead of the ad-hoc edge-drawing canvas; persist to the same
  `greybox.automap.<game>` key D1's standalone route uses (so the standalone `?automap=1`
  panel and the in-play automap share one store). **Acceptance (G4):** e2e boots
  `?explore=1` (or the Library path), walks N/E/S/W, and asserts the in-play automap's
  visited-cell count grows with movement (not click-reveal) and matches the walked path;
  zero console errors; the bespoke-canvas code is gone (no duplicate automap). G1/G2:
  `Automap` model already unit-tested; add a wiring test. *Recommended: Implementer / Sonnet
  (mechanical — consuming an existing model + compositor).*

- **M10.S2** **In-play panel host: a toggle bar over the live session that opens the
  read-only Companion panels as overlays** (HUD, Automap, Reference DBs) without leaving
  exploration. A single overlay host in `explore.ts`/`dqkExplore.ts` (hotkeys, e.g. `M`ap /
  `C`ompanion / `I`nfo, plus on-screen buttons) mounts the existing `composeHudPanel`,
  `composeAutomapPanel`, and `composeReferenceDb` compositors against the **live** engine
  state (real `partyStatus()`/`getXp()` for HUD; the live `Automap` from M10.S1; the game's
  own decoded tables for the DBs). Panels are read-only and dismissible; play state is
  untouched while a panel is open. **Acceptance (G4):** e2e in a live session opens each
  panel, asserts the HUD reflects the real current party HP, the automap matches walked
  cells, and the monster DB lists the game's real bestiary — then closes them and confirms
  movement resumes with pose/HP intact. *Recommended: Implementer / Opus (touches two play
  loops + live state; the M9-class integration slice).*

- **M10.S3** **Journal panel in play + the "done enough to share" Companion clause closed.**
  Wire the journal/string-table panel (removes the manual copy-protection lookup, a marquee
  GBC feature) into the same host, and add the read-only Char sheet view (reuse
  `composeCharSheet`, already in the explore View verb) to the Companion toggle set so the
  full "party/character tooling, auto-map, journal, databases" pillar-4 list is reachable
  in-session. Explicitly assert the "done enough to share" bar: a CoK Library-boot session
  exposes **auto-map + databases** live. **Acceptance (G4):** e2e boots CoK from the Library,
  walks, opens journal → databases → automap → char sheet, all read-only over the running
  game; a short doc note in `VISION.md`'s milestone terms marks the share-bar Companion clause
  met. *Recommended: Implementer / Sonnet, Verifier / Opus (the share-bar sign-off is a
  verification act).*

- **M10.S4** *(optional follow-on, flag for user)* **In-play ECL inspector + write-capable
  char/save editing.** The ECL inspector (D4) stepping a *live* running script, and letting
  the char/save editor mutate the **live** party (not just a decoded file), are genuinely
  useful but cross the read-only boundary and touch save-state — a **user-decision fork** on
  whether an in-play cheat/debug surface is wanted in the shipped product, and on what it may
  write. Left unstarted; surfaced here rather than decided. *Recommended: hold for user.*

---

## 4. Sanity-check: any NEW headless angle on the two dynamic-trace-blocked items?

The two remaining sibling-worklist items — **seg051 RNG seed watchpoint** and the **DQK ECL
extended-opcode table base breakpoint** — both need a DOSBox-X dynamic memory watchpoint/
breakpoint. A prior pass found this "infeasible headlessly," and this audit finds **no new
concrete automatable angle**:

- The one proven interactive-emulator capability we have is the **dosbot** harness
  (`tools/dosbot/`): SDL-window capture + a local vision model (qwen3-vl) reading the screen,
  with **mouse** input landing but **synthetic keyboard input ignored** by this SDL build
  (documented in `tools/dosbot/README.md`, memory `goldbox-dosbot-harness`).
- A memory watchpoint requires driving DOSBox-X's **keyboard-only** debugger console
  (`BPM`/`BPINT`, register/memory panes). Even a vision-OCR read of the debugger overlay
  (a superficially "new" idea) still needs those keystrokes to *set* the breakpoint — which
  the SDL build drops. So the same input wall that blocks E6.2b-4's interactive help blocks
  these two.
- Static recovery is already exhausted for both (that's why they were escalated to a dynamic
  trace in the first place; see `dgroup-dynamic-trace.md` / `decompile-worklist.md`).

**Verdict: they stay blocked** on genuinely-interactive tooling, unchanged from the prior
finding. No loop effort should be spent re-attempting them headlessly. (And **E6.2b-4 remains
strictly off-limits** regardless.)

---

## 5. Recommendation

Open **Phase M10 — Companion panels folded into live play** (§3) as the next loop phase, and
start with **M10.S1** (live automap; cold-start, Sonnet-friendly, retires a real
duplication). It closes VISION pillar 4 and the last unmet clause of the "done enough to
share" bar, mirrors the M9 precedent exactly (wire a built-and-tested mechanism into the
live loop), and is fully headless-verifiable under the standard G1–G4 gates. The
`packages/ui-kit` extraction (M0.S3) is the natural *next* pickup after M10, once the in-play
panel host gives it a second real consumer.
