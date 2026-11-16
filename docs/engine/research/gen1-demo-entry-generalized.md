# Generalizing CoK's demo-entry method to the rest of the Gen1 corpus — DoK, CoAB, Secret, Gateway LOCATED

> **2026-07-23 correction:** the original control-flow rendering in this document decoded every
> game with CoK's long operand table. DoK's short-form `PARLAY` therefore swallowed its real
> continuation. The corrected per-profile decode plus a native GameLink capture proves DoK block 2
> contains two scripted first-person walking montages and reaches `COMBAT` at `0x8363`. Secret and
> Gateway also contain and natively display walking montages. See
> `gen1-demo-sequence-patterns.md`. Statements below that DoK only stages an encounter, that its
> full walk ends in `exited`, or that the browser reproduces the native sequence exactly are
> superseded by that correction.

> The original pass was pure static research (structural byte-level disassembly of each title's
> own `GAME.OVR`) plus an `EclVm` run. The 2026-07-23 correction added native DOSBox-X/GameLink
> framebuffer and RAM captures for DoK, Secret, and Gateway. Tooling:
> `tools/map_gen1_demo_entry.py` wraps `tools/map_cok_demo_entry.py`'s
> `resolve_boot_dispatch`/`struct_field_confirmed_target`/`follow_chain`; `follow_chain` and
> `linearize_entry` now also accept the profile's proven operand table. Run per profile:
> `python tools/map_gen1_demo_entry.py --profile <id>` → `build/<id>-demo-entry.json`.

## TL;DR

1. **The CoK locator method generalizes without changing its core matching primitives.** The same
   function-shape match + struct-field-confirmed-target disambiguator that located CoK's
   own `(demo=57, newgame=36)` pair locates any Gen1 title's pair, given only that title's
   own `GAME.OVR` and a `GAME.OVR`/`GEO`/`ECL*.DAX`-bearing install.
2. **Death Knights of Krynn's own literal `EclBlockId` constants: demo = `2`, new-game =
   `16`, both in `ECL1.DAX`.** Structural match ratio `0.7467` (lower than CoK's `0.8869`
   or Gateway's `0.8918`), but independently corroborated two ways before being trusted (see
   §2): the struct-field disambiguator's own self-check against the CoAB oracle still
   passes, and the located block, run through the real engine `EclVm`, decodes into
   content with the unmistakable *shape* of a demo script (LOAD_FILES/LOAD_PIECES,
   PICTURE, three ADD_NPCs of real named characters) — not a coincidental match to some
   unrelated block.
3. **DoK's demo script is structurally different from CoK's in every way CoK's demo never
   needed to handle** — see §3. It is a branching conversation with two first-person walking
   montages and a real auto-combat sequence.
4. **Curse of the Azure Bonds and Secret of the Silver Blades both located cleanly, and
   both reach live combat** — see §5 and §6. Secret also has a native first-person walking
   montage; CoAB has no matching walking signature.
5. **Gateway to the Savage Frontier located cleanly too (ratio `0.8918`, `ECL2.DAX` block
   `82`), and also matches CoK's linear-cutscene-plus-live-combat shape** — see §4. Its
   title art is the only title so far that isn't plain EGA-16 (the VGA-extended codec
   solved separately, `daxVgaPicture.ts`), and all four of its picture ids fall in the
   still-unsolved "complex" portrait codec. Native capture nevertheless proves its separate
   first-person walking montage before combat; the browser now renders it from the real area banks.
6. **Pool of Radiance has no Play/Demo prompt at all — a genuine negative result, not a
   locator failure.** `map_gen1_demo_entry.py` returns `resolved=False`, and independently
   string-scanning `GAME.OVR`/`START.EXE` finds neither `"Play"` nor `"Demo"` anywhere —
   see §8. Its title screens play, then the game goes straight into the dungeon; the live
   wiring reflects this by skipping `titleMenu.ts` entirely rather than fabricating a
   prompt the original never had.

---

## 1. What generalized vs. what's new

`tools/map_gen1_demo_entry.py` reuses `map_cok_demo_entry.py`'s
`resolve_boot_dispatch` (function-shape match + `struct_field_confirmed_target`
disambiguator) and `follow_chain` (cross-file `NEWECL` walker). The profile plumbing uses
`goldbox_corpus.choose_install`/`file_index` to find *this* title's own `GAME.OVR` and
`ECL*.DAX` files instead of CoK's hardcoded paths. The 2026-07-23 correction additionally
threads `word_sets_for_profile(profile_id)` into the walker so short and long command frames
cannot desynchronize. Verified by an exact
regression run against CoK itself before trusting the tool on a new title:

```
python tools/map_gen1_demo_entry.py --profile champions-of-krynn
→ resolved=True ratio=0.8869 demo_block=57 file=ECL2.DAX (known=True)
  newgame_block=36 file=ECL1.DAX (known=True)
```

Identical to `cok-demo-entry-located.md`'s own published result — confirms the
generalization introduced no regression.

---

## 2. Death Knights of Krynn — located, with corroboration

```
python tools/map_gen1_demo_entry.py --profile death-knights-of-krynn
→ resolved=True ratio=0.7467 demo_block=2 file=ECL1.DAX (known=True)
  newgame_block=16 file=ECL1.DAX (known=True)
```

| | CoAB oracle (`sub_29758`) | DoK candidate |
| --- | --- | --- |
| Struct pointer `P` | `ptr [0x4fb2]` | `ptr [0x8c2d]` |
| Field offset | `word ptr es:[di + 0x1e4]` | `byte ptr es:[di + 0xf2]` |
| Confirmed `ADDR` | `byte ptr [0x8b78]` | `byte ptr [0xdb6c]` |
| Confirming instruction index | 29 | 32 |
| Self-check reproduces CoAB's own `(0x52, 1)` pair | **true** | n/a |
| Value pair at `ADDR` | `(0x52, 1)` | `(2, 16)` |

The field *offset* differs from CoK's own candidate (`0xf2` vs. CoK's `0x1e4`) — DoK's
compiled `area_ptr`-equivalent struct evidently lays this field out differently than
CoK's does. That's not a red flag by itself (each title's own compile can place fields
differently); what matters is that the idiom match is still exact and gated behind the
same self-checking-against-CoAB machinery, at a similar (not identical) position in the
matched function (instruction 32 vs. CoK's 29, Gateway's 29) — consistent with "same
method, different but plausible compiled offsets," not a coincidental hit.

**Why the extra corroboration, beyond CoK's own precedent:** DoK's structural match ratio
(`0.7467`) is noticeably lower than CoK's (`0.8869`) or Gateway's (documented ~`0.98` in
prior work), which by itself would be reason for caution. Two independent checks were run
before trusting the result:

1. **Cross-check against the already-known-good `eclInitBlock`.** `gameData.ts`'s DoK
   profile independently records `eclInitBlock: 34` (the real walkable dungeon entry,
   RE'd via unrelated tooling long before this session). The demo-entry tool's own
   `newgame_block=16` does *not* match that — but neither does CoK's own `newgame_block=36`
   match *its* `eclInitBlock: 34`. This is the same, already-understood "boot-chain
   `NEWECL` entry vs. the actual in-dungeon block" distinction documented in
   `cok-demo-entry-located.md` (block 36 is the opening narration, which then chains via
   `NEWECL` toward the real dungeon) — not a new discrepancy, and not evidence against the
   result.
2. **Run the located block through the real engine `EclVm`.** `ECL1.DAX` block 2, run with
   the `ECL_GEN1_SHORT` dialect (DoK's own known operand-frame convention), decodes into:
   `LOAD_FILES`/`LOAD_PIECES` (loading a specific scene's GEO+wall data), `CLEAR_BOX`,
   `PICTURE #78`, three `ADD_NPC`s, then a `PARLAY` menu pause. This is unmistakably
   demo/cutscene-shaped content (scene setup → picture → named companions joining), not a
   plausible false-positive shape (e.g. an ordinary dungeon room's per-cell script would
   have `GOTO`/movement-gated branches, not this exact linear preamble). This independent
   corroboration is what ultimately justified trusting the lower raw ratio.

---

## 3. DoK's demo script is a different shape than CoK's — decoded via the real `EclVm`

Unlike CoK's demo (§3 of `cok-demo-entry-located.md`: purely linear, zero branches, one
scripted `COMBAT`), DoK's `ECL1.DAX` block 2 is a genuine **branching conversation**:

- **Three real named NPCs join**, decoded from DoK's own `MON1CHA.DAX`: **Sir Dryden**,
  **Tanar**, **Flavius** (ids 48/49/50) — a distinct roster from CoK's Ringwald/
  Swiftfoot/Varianna, following the same "purpose-built temporary demo party" pattern.
- **The script pauses at a real in-engine `PARLAY` "choose an attitude" menu**
  (HAUGHTY / SLY / NICE / MEEK / ABUSIVE) — a genuine DoK gameplay mechanic, not demo-only
  scaffolding — **multiple times** as the scene plays out (11 separate `PARLAY` pauses
  across the full walk, each gated on the party's chosen attitude). This is the first
  Gen1 demo this project has found that isn't a single straight-line script.
- **It reaches a live `COMBAT` pause at vaddr `0x8363`.** After `SETUP_MONSTER`
  (spriteId 255 = none visible, picId 24), the corrected short-dialect walk loads Dread Wolf
  and Evil Warlord groups, enters auto-combat, and continues into post-combat narration. The
  former `SETUP_MONSTER`→`EXIT` reading was decoder desynchronization at the first `PARLAY`.
- **It contains two native first-person walking montages.** The script loads GEO/wall pieces,
  updates the live pose cells, and repeatedly calls a helper that redraws the dungeon viewport
  and advances position. Native framebuffer capture shows a daytime city walk followed by a
  nighttime dungeon/city walk before the encounter art and combat.
- **Most of its `PICTURE` ids resolve into the still-unsolved "complex" `PIC*.DAX` codec.**
  Ids `78`, `60`, `5` all land in `PIC4.DAX`/`PIC5.DAX`, classified `complex/unsupported`
  by `tools/dax_decode.py` (real, pre-existing, project-wide gap — not new to this demo).
  Only id `113` (a `BIGPIC1.DAX` standard frame) actually renders. The live player
  (`apps/web/src/ui/demoGen1.ts`) reflects this honestly: an unresolved picture id simply
  leaves the last real frame on screen rather than fabricating a placeholder image.

### 3.1 How the live player resolves the `PARLAY` pauses

There is no player at an attract-mode demo. `PARLAY`/menu pauses are answered with the
`EclVm`'s own already-documented auto-continue default (`resume(0)` — the same value
`EclVm.step()` uses so a debugger can single-step through a script without hanging). This
is real, in-engine behavior, not an invented shortcut: the VM writes the chosen item's own
value to the destination cell (in DoK's `ECL_GEN1_SHORT` dialect, `PARLAY` has no explicit
remap table, so the raw choice index 0–4 is written directly — see the `PARLAY` case in
`packages/engine/src/ecl/vm.ts`, opcode `0x2c`, and the fix landed for this exact bug,
commit `59503b1`), so the follow-on script reads a genuine (if arbitrary — always "HAUGHTY",
index 0) choice, exactly as it would for a live player who always picked the first option.

### 3.2 Full effect trace (live `EclVm`, `ECL_GEN1_SHORT` dialect)

12 `resume()` hops from the initial `run()`, ending in `exited` (not a `combat` pause):
LOAD_FILES → LOAD_PIECES → CLEAR_BOX → PICTURE #78 → 3×ADD_NPC (48/49/50) → PARLAY
(destAddr 133) → resume → … 10 more PARLAY pauses interleaved with PRINT/DELAY narration
and PICTURE #60/#113/#5 → final CALLs (`advanceAnimatedPicture`, routine id 59396) →
SETUP_MONSTER(sprite=255, picId=24) → `exited`. Zero VM errors, zero unhandled opcodes.

---

## 4. Gateway to the Savage Frontier — located, with corroboration

```
python tools/map_gen1_demo_entry.py --profile gateway-to-the-savage-frontier
→ resolved=True ratio=0.8918 demo_block=82 file=ECL2.DAX (known=True)
  newgame_block=1 file=ECL2.DAX (known=True)
```

A cross-title ratio close to CoK's own (`0.8869`) and well above DoK's caution threshold —
corroborated the same way as CoAB/Secret, on principle: `ECL2.DAX` block 82, run through
the real `EclVm` under the `ECL_GEN1_SHORT` dialect (Gateway's own known operand-frame
convention, per `gameData.ts`'s `eclDialect: 'gen1-short'`), decodes into another
CoK-shaped script:

- **Four named temporary NPCs join**, decoded from Gateway's own `MON2CHA.DAX`/
  `MON2SPC.DAX`: **Whitman**, **Prolous the 3rd**, **Hal**, **Krevish** (ids 74/75/76/60) —
  one more than CoK/CoAB/Secret's three-NPC roster, but the same "purpose-built temporary
  demo party" pattern.
- **One scripted, live `COMBAT` pause** — 2× monster id `68` (**Giant Squid**) — CoK's own
  shape, not DoK's staged-but-untriggered encounter.
- **Linear script, zero branches**, narration setting up a caravan/Yartar story opening
  before the fight.
- **Picture ids**: `5`/`6`/`7`/`101` all resolve into `PIC2.DAX`, which is *entirely*
  classified `complex/unsupported` by `tools/dax_decode.py` — unlike CoK/CoAB/Secret, none
  of Gateway's demo pictures render; the live player leaves the prior real frame on screen
  throughout, exactly as it already does for DoK's/CoAB's/Secret's own unresolved ids.
- **Title art is a different codec from every other title shipped so far.** Gateway's
  `TITLE.DAX` decodes through the Gateway/Treasures-family VGA-extended picture format
  (5-bit/32-colour, interleaved 4bpp+1bit-extension-plane rows — `daxVgaPicture.ts`,
  `docs/engine/research/gateway-vga-picture-format.md`), not CoK/DoK/CoAB/Secret's plain
  EGA-16. `decodeDax` now wires this in by default (`'vga-ext-frame'` kind) and `intro.ts`
  prefers a frame's own embedded palette when present, so no per-title intro code was
  needed — the same generic pipeline renders it correctly.

---

## 5. Curse of the Azure Bonds — located, self-consistency check

```
python tools/map_gen1_demo_entry.py --profile curse-of-the-azure-bonds
→ resolved=True ratio=1.0 demo_block=82 file=ECL1.DAX (known=True)
  newgame_block=1 file=ECL1.DAX (known=True)
```

Ratio `1.0` is expected and not a stronger result by itself: CoAB's own `GAME.OVR` **is**
`sub_29758`, the literal disassembly oracle every other profile's function-shape match is
scored against (`build/coab-oracle-map.json`). Running the tool against CoAB is a pure
self-consistency check (does the method reproduce the oracle's own known-good idiom against
itself?), not a "found in the wild" discovery — CoK's `0.8869`/DoK's `0.7467` are the
meaningful cross-title results.

Corroborated the same way as DoK (§2): running `ECL1.DAX` block 82 through the real
`EclVm` (`ECL_GEN1` dialect — CoAB uses the standard, not the short, operand frames)
produces content with the unmistakable shape of a demo — and in this case, a shape
extremely close to CoK's own:

- **Three named temporary NPCs join**, decoded from CoAB's own `MON1CHA.DAX`: **Rustle**,
  **Cynthia**, **Grendel** — the same "purpose-built temporary demo party" pattern as CoK's
  Ringwald/Swiftfoot/Varianna and DoK's Sir Dryden/Tanar/Flavius.
- **One scripted, live `COMBAT` pause is reached** — 2× monster id `53` — unlike DoK's
  demo, which only ever stages an encounter without triggering it. This is CoK's own
  shape, not DoK's.
- **Linear script, zero branches** — no `PARLAY`/menu pauses anywhere in the walk, again
  matching CoK's structure rather than DoK's.
- **Picture ids**: `29`/`80` (`PIC1.DAX`) fall in the still-unsolved "complex" portrait
  codec; `1`/`121`/`123` (`PIC1.DAX`/`BIGPIC1.DAX`) are standard frames and render for
  real.

## 6. Secret of the Silver Blades — located, with corroboration

```
python tools/map_gen1_demo_entry.py --profile secret-of-the-silver-blades
→ resolved=True ratio=0.8182 demo_block=3 file=ECL1.DAX (known=True)
  newgame_block=17 file=ECL1.DAX (known=True)
```

A cross-title ratio in the same range as CoK's own (`0.8869`), well above the caution
threshold that triggered the extra corroboration work for DoK — nonetheless corroborated
the same way, on principle: `ECL1.DAX` block 3, run through the real `EclVm` under the
`ECL_GEN1` dialect, decodes into another CoK-shaped script:

- **Three named temporary NPCs**, decoded from Secret's own `MON1CHA.DAX`: **Sieglinda**,
  **Capet**, **Averoes**.
- **One scripted, live `COMBAT`** — 2× monster id `6`.
- **Linear script, zero branches**, then five closing narration beats with pictures before
  `EXIT`.
- **Picture ids**: `112`/`113` (`BIGPIC1.DAX`) are standard frames and render for real;
  `60`/`87`/`89` (`PIC1.DAX`/`PIC4.DAX`) fall in the still-unsolved "complex" portrait
  codec.

---

## 7. What's confirmed vs. still open

**Confirmed:**
- DoK's own literal `EclBlockId` constants: demo = `2`, new-game = `16`, both `ECL1.DAX`,
  located via the CoK method without changing its core matching logic; only the downstream
  instruction walk needs the title-specific operand table.
- The corrected demo structure, proven by per-profile static decode and native GameLink capture:
  real NPCs, branching `PARLAY` menus, two first-person walking montages, live combat, and
  post-combat narration.
- The browser player now reproduces the decoded narration/picture/combat effects and the native
  first-person walking montages. It consumes `LOAD_FILES`, `LOAD_PIECES`, temporal pose snapshots,
  and redraw/move host calls through the real GEO/WALLDEF/8X8D renderer. The remaining difference
  is the surrounding native 320x200 party/status chrome; the walking viewport itself is real.
- CoAB's own literal `EclBlockId` constants: demo = `82`, new-game = `1`, both `ECL1.DAX`
  (ratio `1.0`, a self-consistency check against CoAB's own oracle disassembly — see §5).
- Secret of the Silver Blades' own literal `EclBlockId` constants: demo = `3`, new-game =
  `17`, both `ECL1.DAX` (ratio `0.8182` — see §6).
- Both CoAB's and Secret's demo scripts run through the real `EclVm` and live-verified
  end-to-end (headless browser probe): correct title frames, correct `AudioGameId`
  (`'coab'`/`'secret'`, both intentionally silent — no Amiga/DOS score has been located for
  either title yet, so `gameAudio.ts`'s `SILENT_GAMES` set makes this honest rather than
  defaulting to CoK's theme), real narration, real named NPCs joining, live combat
  resolved via the same `launchCombat` path CoK's own demo uses, clean exit back to the
  title menu, zero console errors. `demoGen1.ts` — written generically for DoK — required
  no code changes to handle either title.
- Gateway to the Savage Frontier's own literal `EclBlockId` constants: demo = `82`,
  new-game = `1`, both `ECL2.DAX` (ratio `0.8918` — see §4). Its demo runs through the real
  `EclVm`, live-verified end-to-end: correct title frames (rendered through the
  VGA-extended codec, its own richer embedded palette, not EGA-16), `AudioGameId: 'gateway'`
  (intentionally silent — no score located, same honest-silence pattern as CoAB/Secret),
  real narration, four real named NPCs joining, live combat resolved via the same
  `launchCombat` path, clean exit back to the title menu. `demoGen1.ts`/`intro.ts` required
  no new per-title logic beyond `intro.ts`'s general per-frame-palette preference (which
  also benefits any future title with a non-EGA title screen, not just Gateway).

**Genuinely open:**
1. **`PICTURE #78`/`#60`/`#5`'s actual art** — the `PIC4.DAX`/`PIC5.DAX` "complex" portrait
   codec is still genuinely unsolved project-wide (multiple prior RE rounds, see
   `BUILD-QUEUE.md`'s P3.1 triage). Not a DoK-specific gap.
2. **Why the structural match ratio is lower for DoK (`0.7467`) than CoK/Gateway** — not
   investigated beyond the two corroboration checks in §2; plausibly just more compiled
   divergence between DoK's `GAME.OVR` and the CoAB oracle at the instruction level, not a
   sign of a wrong match (corroborated result stands either way).
3. **The 11-way `PARLAY` branch space** — only the "always pick HAUGHTY (index 0)" path
   has been walked/verified. Whether other attitude choices diverge into meaningfully
   different narration (as opposed to converging quickly) was not explored; not required
   for an honest, single deterministic attract-mode playthrough.

---

## 8. Pool of Radiance — no Play/Demo prompt (negative result)

```
python tools/map_gen1_demo_entry.py --profile pool-of-radiance
→ resolved=False ratio=0.8162 demo_block=None file=None (known=False)
  newgame_block=None file=None (known=False)
```

Unlike every prior title, this comes back **unresolved** — the struct-field-confirmed-target
disambiguator finds no idiom it can confirm against a known value. Before treating that as "the
locator failed," it was independently checked the same way DoK's low ratio was checked (§2):

- **String-scanned every printable ASCII run (≥4 chars) in both `GAME.OVR` (206105 bytes) and
  `START.EXE` (65231 bytes).** Neither contains `"Play"` or `"Demo"` in any string, in sharp
  contrast to CoK/DoK/CoAB/Secret/Gateway's own `START.EXE`, which all carry the literal
  two-hotkey prompt text. `START.EXE`'s only boot-adjacent string is `"Press any key to
  continue"` — the same "advance past the title art" hint `intro.ts` already shows, with nothing
  resembling a menu after it.
- **Pool is a structurally different corpus family** — `tools/goldbox_corpus.py` tags it
  `gen1-fbov`, not the plain Gen1 family CoK/DoK/CoAB/Secret/Gateway share. The tool's
  `resolved=False` is consistent with "there is no such script to find here," not a bug in the
  locator.
- **`TITLE.DAX` itself is a different shape from CoK's own** — 2 plain 320×200 EGA frames (block
  ids 1/2, `decodeDax` confirms both `kind: 'frame'`), no top-band overlay blocks. `intro.ts`'s
  existing `titleScreens()` grouping already handles this correctly with zero changes: each full
  frame with no following band shows standalone, producing exactly 2 click-through screens.

**Conclusion:** Pool of Radiance's original boot shows its 2 title screens, then goes straight
into the game — no attract demo, no Play/Demo choice. The live wiring (`main.ts`'s
`bootPoolAfterTitle`) reflects this honestly by skipping `titleMenu.ts` entirely and calling
`startExplore('pool')` directly from the title sequence's `onDone`, rather than inventing a menu
the original never had. Live-verified end-to-end (headless Edge probe): 2 real title frames,
then the real Pool of Radiance dungeon (`ECL1#18 — (9,2) facing north`), zero console errors,
`AudioGameId: 'pool'` added to `gameAudio.ts`'s `SILENT_GAMES` (no score located for this title
either).
