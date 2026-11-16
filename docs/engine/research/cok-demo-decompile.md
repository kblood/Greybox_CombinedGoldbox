# CoK title "Play Demo" — decompile of the real attract-mode mechanism

> **Superseded findings, reviewed 2026-10-11:** the open demo-entry question in §§6–7
> was closed by [cok-demo-entry-located.md](cok-demo-entry-located.md). CoK's demo is
> **ECL2 block 57**, while **ECL1 block 36** is the normal opening. Block 57 recruits
> Sir Ringwald, Lyn Swiftfoot and Varianna, loads the scripted enemies, and reaches COMBAT.
> The later [original-loader Task 198 trace](cok-task198-original-demo-combat-boundary-2026-09-28.md)
> reaches that command boundary without seeded party or injected keys; it stops before
> executing COMBAT. The older `game_area=1` demo assumption below is CoAB-derived and
> cannot describe CoK's ECL2 demo. §§1–7 retain the original static investigation and
> rejected xrefs; their UNLOCATED conclusions and wall-follower descriptions are historical.

> Pure static research (COAB source study + `tools/disasm_cok.py` binary xref + direct
> Gen1 ECL bytecode decode of `Champions of Krynn/ECL1.DAX`). **No DOSBox-X, no GameLink,
> no live trace of any kind** — a sibling agent owned the sole DOSBox-X session this round
> (CoK RNG). Triggered by the user pointing out that the live `?demo=1` reimplementation
> (`apps/web/src/ui/demo.ts`) doesn't match their memory of the original: an explicit
> title-screen "play vs demo" choice, then a *scripted* walkthrough ending in automatic
> combat. This doc answers, as far as static analysis reaches, whether that memory is
> right and what the real mechanism is.

## TL;DR

1. **Yes — the title screen has a real, explicit two-word "Play"/"Demo" choice.** It is
   **byte-located** in CoK's `START.EXE` (not `GAME.OVR`) at file offset `0x21e`, and its
   text/structure is **provably a two-hotkey prompt** (`P`=Play, `D`=Demo), not a bare
   unlabeled key. This is stronger than what was previously documented (prior docs cited
   the string but not its two-hotkey structure).
2. **The demo is neither a raw keypress-log table nor a fixed-seed replay of an unmodified
   normal game loop.** It is a **third thing**: `inDemo` is an engine-global boolean that
   makes the *exact same* boot/ECL-VM code path (used for ordinary new-game start) enter at
   a **different ECL block ID** and, after that ECL script naturally returns, **discard the
   whole party**. In other words: **the demo is a scripted ECL sequence**, authored in the
   same data-driven bytecode language used for every other event/dialogue/encounter in the
   game — not a separate "demo mode" code path, and not an input-recording format.
3. **Combat inside the demo is driven by the same `control_morale`/`quick_fight`-gated AI
   routine already RE'd as CoK's monster AI** (`decompile-ovr010-monster-ai.md`,
   `PlayerQuickFight`/`sub_3504B`) — that routine is generic over *any* combatant flagged
   AI-controlled, monster or temporary PC, so "the demo's auto-battle" and "monster combat
   AI" are the same code, not two systems. A separate, directly-confirmed detail: `inDemo`
   skips the "Continue Battle?" prompt after a won fight (`ovr009.BattleRoundChecks`) and
   `sub_29758` explicitly frees every temporary party member once the script returns.
4. A genuinely new, decoded finding along the way: `ECL1.DAX` block **36** is CoK's
   opening story-crawl ("AT THE INN OF THE LAST HOME IN SOLACE...", introducing the NPC
   **Sir Karl Gaardsen**), and it `NEWECL`s straight into block **16**, whose own bytecode
   contains an explicit, byte-verified branch that behaves differently depending on
   whether the VM arrived from block 36. See §4.

---

## 1. Is there a real title-level Play/Demo choice? — CONFIRMED, stronger than prior docs

Prior project docs (`docs/engine/ROADMAP.md`, `apps/web/src/ui/intro.ts`'s doc comment,
`docs/engine/research/decompile-seg001-043-049-boot-input.md`) already established that
CoK's `START.EXE` contains the literal string `"Champions of Krynn v1.2\tPlay Demo"` and
that it feeds a `displayInput`-style prompt (per the COAB `seg001.PROGRAM()` oracle). This
task went one step further and decoded **what that prompt actually renders as a choice**.

### 1.1 Byte location (verified myself, this session)

```
$ python3 -c "... data.find(b'Play Demo') ..."
Play Demo at 0x21e   (Champions of Krynn/START.EXE, 61607 bytes total)

file offset 0x1fd..0x24c:
  \x17Champions of Krynn v1.2\tPlay Demo\x17Champions Of Krynn v1.2\x9a...
```
`\x17` = 0x17 = 23 = a Pascal-style length prefix that exactly matches
`len("Champions of Krynn v1.2")` (23 chars) — confirming this is a real length-prefixed
string table entry, not a coincidental substring. `Play Demo` is appended directly after a
tab with no length prefix of its own (consistent with two adjacent string literals placed
back-to-back by the linker, one being the `displayInput` "extra"/title string, the other
its "menu" string — see below). A second, differently-cased copy of the title
(`"Champions Of Krynn v1.2"`, capital `Of`) immediately follows, then binary (non-text)
table data — `disasm_cok.py` cannot reach this region (it disassembles `GAME.OVR`'s FBOV
overlay pool only; this string lives in the **resident** `START.EXE` image, a plain MZ
executable with no FBOV wrapper), so this was hand-decoded with a small Python byte scan
rather than the project's disassembler.

### 1.2 What `"Play Demo"` actually IS — a two-hotkey prompt, not a hint string

The COAB oracle (`coab_extracted/engine/seg001.cs:109-131`) shows the exact call:

```csharp
ovr002.title_screen();
gbl.displayInputSecondsToWait = 30;
gbl.displayInputTimeoutValue = 'D';
char inputKey = ovr027.displayInput(false, 0, gbl.defaultMenuColors,
                                     "Play Demo", "Curse of the Azure Bonds v1.3 ");
if (inputKey == 'D') gbl.inDemo = true;
```
(CoK's own two strings, byte-verified above, are `"Play Demo"` / `"Champions of Krynn
v1.2"` — the *same* two-argument shape, byte-identical wording for the menu string.)

`ovr027.displayInput`'s highlight-building pass (`BuildInputKeys`, `ovr027.cs:59-86`) scans
the menu string for **uppercase letters** (its `highlightable_text` set is `0-9,A-Z` only)
and starts a new highlighted "word" at each one. Running that algorithm on the literal text
`"Play Demo"` (P-l-a-y-space-D-e-m-o):

- uppercase `P` at index 0 → word 0 = `"Play"` (indices 0-3)
- uppercase `D` at index 5 → word 1 = `"Demo"` (indices 5-8)

**So `"Play Demo"` is not a hint next to a generic "any key" prompt — it is a real
two-option menu baked into one string, with `P` and `D` as the two selectable words**,
exactly matching the user's memory of "an explicit on-screen choice between play the game
and watch a demo." Selection works three ways (all in `displayInput`, `ovr027.cs:174-327`):
pressing the hotkey letter (`P` or `D`) directly selects that word; `,`/`.` cycle the
highlighted word and **Enter** confirms whichever is currently highlighted; or a **30-second
idle timeout** (`displayInputSecondsToWait=30`, `displayInputTimeoutValue='D'`) auto-fires
`'D'` — i.e., **if left alone at the title screen, the original eventually launches the
demo by itself**, the classic arcade attract-mode idle behaviour. (The two implementations
`displayInput`'s `input_key==0x20` branch and its `alpha_number_input` fallback mean *most*
other keys still fall through to "continue" too, which is why the current engine's
"any key advances, `D` demos" simplification is roughly input-compatible — see §5.)

**Caveat:** the *specific* 30s/10s timeout durations and the `'D'` default-timeout value are
COAB literals (`coab_extracted/engine/seg001.cs`), not independently re-verified against
CoK's own compiled constants (that code lives in `START.EXE`'s resident segment, which
`disasm_cok.py` cannot reach — see §6). The **structure** (two-hotkey prompt, idle timeout
defaults to demo) is COAB-authoritative + CoK-string-corroborated; the **exact numbers**
are not.

---

## 2. What does the demo path actually do? — a dedicated ECL entry point, not a script table or a bare seed

### 2.1 The boot loop (`seg001.PROGRAM`, COAB-verified structure)

```csharp
while (true) {
    if (gbl.inDemo) { gbl.game_area = 1; gbl.game_speed_var = 9; }
    else            { gbl.game_area = 2; }
    if (!gbl.inDemo) ovr018.startGameMenu();     // the real party menu — SKIPPED in demo
    ovr003.sub_29758();                          // <-- the ECL VM entry (see 2.2)
    InitAgain();
    if (gbl.inDemo) {
        ovr002.title_screen();
        char k = ovr027.displayInput(..., "Play Demo", "...");  // 10s wait this time
        gbl.inDemo = (k == 'D');                 // loop: stay in demo or drop to menu next pass
    }
}
```
`game_area` is not a demo/normal flag by itself — it's literally the numeric suffix on
every per-area data filename the resident code loads (`ovr008.cs:148`
`string.Format("ECL{0}.dax", gbl.game_area)`; same pattern for `GEO{n}.dax`,
`ITEM{n}.dax`, `8x8d{n}`, `bigpic{n}` — confirmed across `ovr003/008/017/030/031/034/038.cs`).
Demo forces `game_area=1`, so **the demo can only ever load `ECL1.DAX`/`GEO1.DAX`/etc.**
CoK's own DOS files confirm area 1 is a real, much smaller dataset than areas 2/3
(likely CoK's "Act 1" continent, not a demo-only stub — see §2.4):

| file | size | DAX entries |
|---|---|---|
| GEO1.DAX | 1.8 KB | 18 |
| GEO2.DAX | 6.2 KB | 63 |
| GEO3.DAX | 5.4 KB | 54 |
| ECL1.DAX | 31.0 KB | 63 (7 script blocks: 16,17,18,32,33,34,36) |
| ECL2.DAX | 48.8 KB | 72 |
| ECL3.DAX | 48.8 KB | 63 |

### 2.2 `sub_29758` — the real entry-point switch (COAB `ovr003.cs:2230-2299`)

This is the decisive function. Every loop pass calls it, demo or not:

```csharp
internal static void sub_29758() {
    ...
    if (gbl.area_ptr.LastEclBlockId == 0) {      // fresh game (no continuing position)
        if (gbl.inDemo) gbl.EclBlockId = 0x52;   // <-- demo entry block (CoAB's own numbering)
        else            gbl.EclBlockId = 1;      // <-- normal entry block
    } else {
        gbl.EclBlockId = (byte)gbl.area_ptr.LastEclBlockId;
    }
    ...
    ovr008.load_ecl_dax(gbl.EclBlockId);
    ovr008.vm_init_ecl();
    RunEclVm(gbl.ecl_initial_entryPoint);        // <-- runs the ECL bytecode. THIS is "the demo".

    if (gbl.inDemo) {
        while (gbl.TeamList.Count > 0)           // discard whatever party the script built
            ovr018.FreeCurrentPlayer(gbl.TeamList[0], true, true);
        gbl.SelectedPlayer = null;
    } else {
        gbl.area_ptr.LastEclBlockId = gbl.EclBlockId;   // remember position for next pass
    }
}
```

This directly answers the task's three hypotheses:

- **Not a canned keypress/input-log table.** No such data structure exists on disk (CoK's
  `GEO*.DAX`/`ECL*.DAX` are the same container format used for the real game world — see
  `docs/dax-format.md` — not an input-log format), and `RunEclVm` is the *exact same* ECL
  interpreter that runs every other in-game script.
- **Not a fixed-RNG-seed replay of the untouched normal loop either** — the demo does not
  run the same entry as normal play. `gbl.EclBlockId` is a **different literal constant**
  for `inDemo==true` vs `false` (`0x52` vs `1` in COAB's own numbering — CoK's literal
  constants are unconfirmed, see §6). So even with an identical RNG seed, demo and normal
  play would execute **different ECL bytecode from the first instruction**.
- **The real answer is a third shape, "scripted via the existing ECL language":** the demo
  boots into a **dedicated ECL script** (same VM, same opcode set already fully RE'd in
  `ecl-krynn-gen1-opcodes.md`), which is free to `PRINT`/`PRINTCLEAR` text, `PICTURE`,
  `ADD NPC` (opcode `0x36` — already implemented end-to-end in this engine, see §5) to
  build a temporary party, `LOAD MONSTER`/`COMBAT` to force a fight, and `NEWECL` to chain
  through several blocks in sequence — all authored data, not code. After the script
  returns, `sub_29758` explicitly tears down whatever temporary party it built. This is
  fully consistent with the user's memory (walk a specific path, show specific creature
  encounters "as if genuinely walked into", run automatic combat) **if** the specific ECL
  block(s) used for the demo are written that way — which §2.3-2.4 confirms is at least
  possible in exactly this shape for one block CoK actually ships.

### 2.3 Combat-side confirmations of the same `inDemo` global (two more COAB hits)

- `ovr009.cs:404-410` (`BattleRoundChecks`, already RE'd generally in
  `decompile-ovr009/014/024/025` for the combat loop): the ordinary "Continue Battle?"
  Y/N prompt shown when the party wins but the fight could continue is **skipped whenever
  `gbl.inDemo==true`** — the battle just ends. A demo doesn't stop to ask the (absent)
  player anything.
- `ovr006.cs:212/768/777/792` (after-combat XP/treasure/cleanup, already RE'd in
  `decompile-ovr006-xp-treasure.md`): `gbl.inDemo==true` skips `CleanupPlayersStateAfterCombat`,
  `reclac_player_values`, `distributeNpcTreasure`, `displayCombatResults`, and
  `distributeCombatTreasure` — i.e., **demo combat resolves but doesn't bother computing or
  displaying XP/loot**, consistent with a throwaway temporary party that's about to be
  freed by `sub_29758` anyway.

### 2.4 New finding: decoded ECL1.DAX content that matches the shape of a scripted intro

Using this project's own Gen1 ECL decoder (`tools/gen1_ecl_encounter_scan.py`'s
`decode_one`/`header_entries`, already used for the P1-P3 natural-route work) plus a small
6-bit string-inflate script built from the already-verified codec
(`decompile-ovr008-ecl-strings.md`), I disassembled and text-decoded every one of ECL1.DAX's
7 blocks' `initial_entry` slot (file offset 22, right after the 22-byte header — this is
exactly the address `RunEclVm(gbl.ecl_initial_entryPoint)` executes).

**Block 36 (415 bytes) is a small, purely linear script** — no branches at all in its main
body, just print/picture/gosub/newecl:

```
LOAD_FILES  127,127,127
PICTURE     112
PRINTCLEAR  "AT THE INN OF THE LAST HOME IN SOLACE, A BRAVE "
PRINT       "BAND GATHERS IN PREPARATION FOR A GRIM JOURNEY. "
PRINT       "THE LANDS RECONQUERED FROM THE DRAGONARMIES ARE TO "
PRINT       "BE SCOURED OF THE LAST VESTIGES OF EVIL..."
GOSUB       1:33116                 -- (a shared subroutine, likely "wait for key")
PRINTCLEAR  "JOINING YOU ON THE TRIP IS AN OLDER KNIGHT OF "
PRINT       "THE ROSE. HE IS INTRODUCED AS SIR KARL GAARDSEN. "
PRINT       "HIS MISSION IS TO EVALUATE THE OUTPOSTS FOR THE "
PRINT       "COUNCIL OF KNIGHTS."
GOSUB       1:33116
SAVE        36 -> [1:19442]         -- "last block id" bookkeeping var (every block sets it)
SAVE        1  -> [1:32530]
CLEAR_BOX
NEWECL      16                      -- chains straight into block 16
EXIT
```
This is CoK's real opening narration — "AT THE INN OF THE LAST HOME IN SOLACE..." is the
game's canonical prologue, and it names the NPC **Sir Karl Gaardsen** joining the party.
It ends by `NEWECL`-chaining into **block 16**.

**Block 16 (3813 bytes) contains an explicit, byte-verified branch keyed on "did I arrive
from block 36"**, decoded at file offset 53-76:

```
53  COMPARE   [1:19442], 36     -- "was the previous block 36?"
59  IF_NE
60  GOTO      -> offset 76      -- if NOT arriving from 36, skip the next two SAVEs
64  SAVE      1 -> [1:19395]
70  SAVE      3 -> [1:19396]
76  PICTURE   121               -- (both paths rejoin here)
```
`1:19395`/`1:19396` are used elsewhere in the same block as what read like map
coordinates (compared against small integers like 6/12/8/17 a few dozen bytes later), so
this reads as "if the party is here straight from the prologue, force a specific starting
position/state instead of whatever a resumed game would carry" — real, decoded,
demo-relevant(-or-at-least-intro-relevant) branching, not a guess.

**Important honesty note — which of these blocks is the actual `inDemo` entry constant is
NOT nailed down.** Two readings are both consistent with the evidence and I could not
distinguish them statically this session:

- *(a)* Block 36 is CoK's own literal `inDemo==true` entry constant (`sub_29758`'s CoK
  analogue of COAB's `0x52`), i.e. **every player who sees the demo sees exactly this
  prologue+block-16 sequence** — matching the user's memory closely (a short scripted
  intro leading into a real, specially-flagged playthrough of the real starting area).
- *(b)* Block 36 is simply CoK's **normal** new-game opening (shown to every real player
  who creates a party and hits "Begin Adventuring" for the first time — this is standard
  Gold Box practice and Sir Karl Gaardsen is CoK's canonical opening companion), and the
  *actual* demo-only constant is a still-unidentified block — possibly one of the other 6
  in ECL1.DAX (17, 18, 32, 33, 34 were also decoded; 18 is a small area-transition
  dispatcher unrelated to demo, 17/32/33/34 are large per-cell GEO scripts whose
  `initial_entry` slot is a near-empty guard, with their real content living at other
  header slots not yet examined), or an ECL2/ECL3 block not considered here (unlikely,
  since demo forces `game_area=1`).

Reading (b) is slightly more likely on reflection (every real player should see their
opening narration, and COAB's own normal/demo constants are two genuinely different
numbers, not "normal reaches demo's block first"), but this is **not proven either way**
without locating CoK's own literal constant in the compiled binary (§6 gives the exact
next static step). Either way, **the mechanism-level conclusion in §2.2 is unaffected**:
whichever block is demo-only, it is real ECL bytecode data, not a keypress log or a bare
RNG-seed replay.

---

## 3. Does demo combat reuse the real AI? — yes, structurally confirmed

`decompile-ovr010-monster-ai.md` (already DONE in this project's decompile worklist) named
its subject function `PlayerQuickFight` (`sub_3504B`) — note the name: **this is not
"monster AI" in a separate sense, it's the shared auto-battle decision routine any
combatant runs once flagged AI-controlled.** Confirmed this session by reading its actual
gating conditions (`ovr010.cs`):

```csharp
// ovr010.cs:253            spell-cast gate
if (spells_count > 0 && (player.control_morale >= Control.NPC_Base || gbl.AutoPCsCastMagic))
// ovr010.cs:386-388        flee/morale gate
if (player.control_morale < Control.NPC_Base || (player.control_morale >= Control.NPC_Base && ...))
// ovr010.cs:772            morale-break gate
else if (player.control_morale >= Control.NPC_Base) { gbl.monster_morale = ...; }
```
The dispatch is keyed purely on `player.control_morale >= Control.NPC_Base` (an
NPC/monster-level control value) **or** the player's own `quick_fight` flag — both apply
equally to a real monster record and to a `Player` struct built from an ECL `ADD NPC`
(opcode `0x36`) call. There is no separate "demo AI" function anywhere in the COAB source
tree (`coab_extracted/engine/` has no `ovr0XX` file or method named anything demo-specific
besides the `inDemo` boolean checks already listed in §2.3). So: **if the demo's ECL script
adds temporary party members via `ADD NPC` (which sets `control_morale` directly from the
operand — see `decompile-ovr010-monster-ai.md`/M35 below), those members fight through the
exact same turn-ladder as monster AI: re-roll movement style → `FleeCheck` → wand
(anti-magic only) → queued spell → turn-undead → save-aware spell pick → weapon+move+attack
→ guard, with random (not focus-fire) targeting.** I could not confirm, within this
session's static budget, the specific byte offset where CoK's block-16 (or true demo-block)
bytecode issues its `ADD NPC` calls for Sir Karl Gaardsen et al. — block 16 is 3813 bytes
and only ~340 of them were disassembled this session (see §6 for the precise next step).

**Pacing:** `game_speed_var=9` is forced for demo (§2.1). Per `ovr009.cs:678-701`'s own
debug label (`"GameSpeed ({0}) : 0=fastest 9=slowest"`), 9 is the **slowest** configurable
speed, not a speed-up — i.e. the demo is deliberately *paced slower* than default (`4`,
`InitAgain`'s reset value), not sped through. This is a real, COAB-sourced detail worth
carrying into any faithful reimplementation: **the attract demo should visibly pause
between turns/prints, not run at combat-normal or accelerated speed.**

---

## 4. Cross-check against the live reimplementation

`apps/web/src/ui/intro.ts` and `apps/web/src/ui/demo.ts` (both explicitly **out of scope
to edit** this round — a sibling agent owns intro/title UI changes) currently:

- Show a generic `"D = Play Demo"` **hint string** next to a "press any key to continue"
  message, plus a separate `▷ Play Demo` button — functionally close (any key advances,
  `D` demos) but **not** a rendered two-word "Play"/"Demo" highlighted prompt, and **no
  idle-timeout auto-launch of the demo** (the original does this after 30s per §1.2).
- `demo.ts`'s attract loop is a generic wall-follower over the **real GEO map** (a good
  instinct — the real demo also walks the real Act-1 dataset, not a fake demo-only map)
  but **explicitly dismisses any combat encounter** it hits
  (`if (ex.combatOpen?.()) { ex.closeCombat?.(); return; }`) — this is the exact opposite
  of the real mechanism (§2-3), where combat is the point of the demo and resolves via
  real AI, not skipped.
- Has no ECL-block-entry concept at all — it drives the generic exploration seam
  (`getPose`/`move`), not `RunEclVm` at a specific block ID.

None of this is a criticism of the existing code — its own doc comment already says the
exact recorded sequence is UNLOCATED and settles for "a representative auto-play of the
genuine map, not a byte-replay". This session's finding is that the *shape* of a byte-true
implementation is now much better understood (§2.2's `sub_29758` mechanism + §2.4's decoded
block 36/16 content) even though the exact demo-block constant for CoK isn't pinned yet.

**Engine capability already exists for the missing piece:** `docs/engine/BUILD-QUEUE.md`
Phase **M35** ("ECL `ADD_NPC` (0x36): recruit a named companion into the party") is marked
**DONE** (2026-07-04) — the TS `EclVm` already implements opcode `0x36` exactly per COAB's
`CMD_AddNPC` (operand → `control_morale`), and folds the resulting monster record into
combat as a party-side AI combatant via `monsterCombatant(rec, ..., 'party')`. So a future
implementation pass that runs the real demo ECL block through the real `EclVm` would not
need new engine plumbing for "temporary AI-controlled party member" — that's already
wired and tested (`docs/engine/research/m35-audit.md`).

---

## 5. What's confirmed vs. genuinely open

**Confirmed this session (byte + COAB, or byte alone):**
- Title `"Play Demo"` is byte-located at `START.EXE:0x21e`; its `BuildInputKeys` structure
  (`ovr027.cs`) proves it is a two-hotkey (`P`/`D`) menu word pair, not a hint string.
- `sub_29758`'s `inDemo`-keyed `EclBlockId` branch (COAB source, `ovr003.cs:2230-2299`) is
  the real entry-point mechanism — same VM, different entry block, party freed afterward.
- `game_area`(=1 for demo) is literally the per-area DAX filename suffix (COAB source,
  cross-referenced across 6 different `ovr0XX.cs` files) — CoK's own area-1 files
  (`GEO1.DAX` 18 blocks, `ECL1.DAX` 63 blocks/7 scripts) are real and substantially
  smaller than areas 2/3, independently confirmed from the DOS archive itself.
- `ECL1.DAX` block 36's full text content (decoded, human-readable, quoted above) and its
  `NEWECL 16` chain target; block 16's byte-verified "arrived from 36" branch.
- The shared `control_morale`/`quick_fight` AI-dispatch gating (`ovr010.cs`, three call
  sites quoted) applies identically to monsters and any AI-flagged `Player` — no separate
  demo-AI code exists in the COAB source tree.
- `inDemo` skips the "Continue Battle?" prompt (`ovr009.cs:404-410`) and post-combat
  reward/cleanup bookkeeping (`ovr006.cs`, 4 sites).
- `game_speed_var=9` for demo is COAB's **slowest** setting, not a speed-up.

**Genuinely open (would need more static work, specified precisely so a follow-up can
pick this up directly — none of these require a live trace):**

1. **CoK's own literal `EclBlockId` constants for `inDemo==true`/`false`** (COAB's are
   `0x52`/`1`; CoK's own numbers are unconfirmed — §2.4 shows the evidence is consistent
   with either "36 is the demo's own constant" or "36 is the normal new-game entry and the
   demo's constant is still unlocated"). **Next step, fully specified:** the CoK analogue
   of `ovr008.load_ecl_dax` was located this session at `GAME.OVR` file offset **`0x8da3`**
   (ends `retf 2` at `0x8e75`; the very next prologue at `0x8e78` is a strong candidate for
   `vm_init_ecl`). `python tools/disasm_cok.py xrefoff 0x8da3` finds **4 immediate
   references** to that address inside `GAME.OVR` at file offsets `0x101cc`, `0x1e0d9`,
   `0x241cb`, `0x261e6` — one or more of these should be (or lead to, via the FBOV
   int-3Fh/VROOMM thunk table) the `sub_29758` analogue; disassembling backward/forward
   from each should surface the two literal `EclBlockId` immediates the same way
   `decompile-ovr006/026/...` located their constants elsewhere in this project. This is a
   pure `disasm_cok.py dis`/manual-read task, no new tooling needed.
2. **Where in block 16 (or the true demo block) the `ADD NPC` call for Sir Karl Gaardsen
   sits.** Only ~340 of block 16's 3813 bytes were disassembled this session (the
   `initial_entry` slot's fall-through path); its other four header slots
   (`vm_run_1`@343, `search_location`@704, `pre_camp_check`@629, `camp_interrupted`@672)
   and the remainder of the `initial_entry` chain (past the `NEWECL 64`/`NEWECL 17`
   branches found at offsets 201/340) are undissected. `tools/gen1_ecl_encounter_scan.py`'s
   `decode_one` (reused this session) is the right tool; a systematic walk of all 5 header
   entries across all 7 ECL1.DAX blocks, watching for opcode `0x36` (`ADD_NPC`) and `0x24`
   (`COMBAT`), would settle this without any live trace.
3. **The exact 30s/10s timeout durations and default-timeout-char in CoK's own compiled
   `START.EXE`** are COAB literals, not independently verified (§1.2's caveat) — this
   would need disassembling the resident (non-FBOV) portion of `START.EXE` around file
   offset `0x21e`, which `disasm_cok.py` does not currently reach (it only disassembles
   `GAME.OVR`'s FBOV pool). A generic 16-bit real-mode disassembler pointed at the raw
   `START.EXE` bytes near `0x21e`-`0x2a0`-ish would be the natural tool; out of scope to
   build this session.

None of the three items above need a dynamic/DOSBox-X trace — they're all further static
disassembly, deliberately left as precisely-scoped follow-ups rather than rushed in one
session that was already deep in COAB-source-plus-ECL-content archaeology.

---

## 6. Follow-up (static only): item 1's 4 xrefs are false positives — the block-id constant stays UNLOCATED

A later phase-2 integration session (building the title-menu UI + wiring real combat resolution
into `demo.ts`, per the user's follow-up request) spent bounded effort on item 1's exact next
step: disassembling around the 4 candidate xref sites `disasm_cok.py xrefoff 0x8da3` reported
(`0x101cc`, `0x1e0d9`, `0x241cb`, `0x261e6`).

**Result: all 4 are confirmed false positives, not real code references to `0x8da3`.** Reading
the raw bytes at each site (not just the disassembler's re-aligned instruction stream) shows why:

```
0x101cc:  ... 31 c0 [a3 8d] 89 31 ...   -- xor ax,ax ; mov word ptr [0x898d], ax
0x261e6:  ... 31 c0 [a3 8d] 89 31 ...   -- xor ax,ax ; mov word ptr [0x898d], ax   (same pattern)
0x1e0d9:  ... 06 75 [a3 8d] 7e ed ...   -- cmp ...,6 ; jne $-93 ; lea di,[bp-0x13]
0x241cb:  ... 06 75 [a3 8d] 7e ee ...   -- cmp ...,6 ; jne $-93 ; lea di,[bp-0x12]   (same pattern)
```

`xrefoff` finds every place the raw byte pair `A3 8D` (0x8da3's little-endian encoding) occurs
*anywhere* in the file — it does not check instruction alignment. In all 4 hits, `A3`/`8D` are
not an operand of some `push`/`lcall` referencing 0x8da3; they're the **opcode byte of an
unrelated `mov moffs16,ax` instruction** (sites 1/4) or **a `jne` branch's signed rel8 operand
followed by the next instruction's `lea` opcode** (sites 2/3) — coincidental collisions, not
code. (Confirmed by reading the raw bytes directly with a small Python script, independent of
the disassembler's own instruction-boundary assumptions, so this isn't a disassembler-alignment
artifact either — the byte-level coincidence is real and verifiable from the hex alone.)

**Consequence:** item 1's "next step, fully specified" lead is a dead end as written — none of
the 4 sites lead anywhere useful, and no further xref candidates were located this session
(finding the real call site would need a proper control-flow-aware disassembly pass from a known
function entry, not a raw byte-pattern scan — out of scope for this session's bounded budget).
**CoK's own literal demo-entry `EclBlockId` constant remains genuinely UNLOCATED.** This is a
negative result, recorded so a future pass doesn't re-spend effort on the same 4 offsets.

This does not affect any of §1-§5's other conclusions (the title-menu structure, the `inDemo`
entry-point mechanism, or the AI-combat-reuse argument) — all independent of the exact constant.
The live engine (`apps/web/src/ui/demo.ts`) accordingly keeps its wall-follower as the honest
placeholder for "which path the demo walks," while now wiring the real title Play/Demo menu
(`apps/web/src/ui/titleMenu.ts`) and resolving demo combat through the real seeded-RNG combat
engine instead of dismissing it — see those modules' own doc comments for what's proven vs.
still-approximate.

---

## 7. 2026-07-18 follow-up (static only): exhaustive disassembly of block 16 (and all 7
## ECL1.DAX script blocks) -- zero ADD_NPC/COMBAT on the block-36->16 path; (b) strengthened

Picks up §5 item 2 exactly as specified (only ~340/3813 bytes of block 16 had been
disassembled; the other 4 header slots were unexamined). **No DOSBox-X, no GameLink, no
live trace** -- pure static decode, same method as §2.4, extended to systematically walk
all 5 header entries (`initial_entry`, `vm_run_1`, `search_location`, `pre_camp_check`,
`camp_interrupted`) with real control-flow following (GOTO/GOSUB/conditional/ON_GOTO/
ON_GOSUB) across all 7 of ECL1.DAX's script blocks (16, 17, 18, 32, 33, 34, 36).

### 7.1 Method

A small research-only script (not committed -- scratchpad only, per this session's scope)
reused this project's own verified decode primitives directly rather than reinventing
them: the opcode table and 6-bit string-inflate codec from `tools/dqk_ca03_stream_decode.py`
(`OPCODES`, `decode_ecl_string`), and the header-entry/operand/control-flow logic from
`tools/gen1_ecl_encounter_scan.py` (`header_entries`, `vaddr_to_offset`/`offset_to_vaddr`,
`target_offset`, `condition_holds`, the same `GEN1_WORD_SETS` exception table). The only
addition was (a) rendering actual string text for `str[N]`/opcode-0x80 operands (the
existing `read_operand` in `gen1_ecl_encounter_scan.py` only skips string bytes; this
session's helper decodes them via `decode_ecl_string`, matching `dqk_ca03_stream_decode
.read_opp`'s already-verified approach byte-for-byte) and (b) exploring *both* sides of
every conditional (not just the COMBAT-seeking one-sided walk `scan_block` does) so no
reachable instruction is missed. Every block's raw bytes were loaded the same way the
project's own tools do (`goldbox_corpus.read_dax_blocks` -> `dax_decode.parse_container`),
so this is the identical byte source as the rest of the project's Gen1 ECL work.

**Self-check:** the tool's block 36 output is **byte-identical in content and offsets** to
§2.4's manually-transcribed listing, and its block 16 `initial_entry` output through offset
108 reproduces §2.4's `COMPARE [1:19442],36 / IF_NE / GOTO / SAVE / SAVE / PICTURE 121`
sequence exactly (with `1:19442` = this session's `0x4bf2`, the same absolute var address --
confirms the addressing/rendering is consistent across sessions, not a re-derivation from
scratch).

### 7.2 Correction to a scope assumption: block 16's `initial_entry` was already fully
### disassemblable in ~340 bytes -- "3813 bytes" is the *whole block*, not that slot's code

§5 item 2 read block 16's 3813-byte raw size as the outstanding scope for `initial_entry`.
That's not what the bytes show: **`initial_entry`'s own reachable code is only 48
instructions, and it terminates (its last `NEWECL`/fallthrough) at exactly file offset 343
-- which is header slot `vm_run_1`'s own start address.** The header's 5 slots are 5
different *entry addresses* into one shared 3813-byte bytecode blob (a normal Gold Box ECL
convention -- e.g. `vm_run_1` picks up mid-blob where `initial_entry` naturally ends), not 5
separately-sized independent scripts. So `initial_entry` was already complete; the
"remaining ~3473 bytes" belonged to the *other 4 slots'* own code, not to unexplored
`initial_entry` content. This session decoded all of it (all 5 slots, all 7 blocks): 552
BFS states for block 16 alone (up from the single linear walk in §2.4), 2344 for block 17,
1056 for block 32, and so on -- full listings retained in this session's scratchpad output,
not reproduced in full here (they run to ~5,000 lines); representative excerpts follow.

### 7.3 Block 16 `initial_entry`, complete (48 instructions, file offsets 22-343)

The full, previously-undissected remainder (offsets 76-343) is:

```
76  PICTURE #121
79  COMPARE  0x4bf2, #16
85  IF_NE
86  SAVE     0x4bc3 -> 0x4bf0        -- guarded: only if last-block != 16
93  IF_NE                            -- (reuses the same COMPARE's flags)
94  SAVE     0x4bc4 -> 0x4bf1        -- guarded: only if last-block != 16
101 COMPARE  0x4bf2, #36             -- "did we arrive from block 36" -- SAME var/const as section 2.4's offset-53 check
107 IF_EQ
108 GOTO     -> 204                  -- if from 36: skip straight to the "AN OUTPOST" text (below)
112 COMPARE_AND 0x4bf2,#17, 0x4c8b,#1  -- else: "last-block==17 AND flag 0x4c8b==1"?
123 IF_EQ
124 GOTO     -> 129                  -- only if that AND holds
128 EXIT                             -- otherwise: bail out, nothing else in this slot runs
129 PRINTCLEAR "MAYA LEADS YOU TO THE TOWN OF NERAKA."
160 GOSUB    0x8dae                  -- "press button/return to continue" subroutine
164-200  SAVE #17->0x4bc3, #8->0x4bc4, #16->0x4bf2, #4->0x7f12, #0->0x4cf7, #1->0x4be6
200 CLEAR_BOX
201 NEWECL   #64                     -- see 7.4: this is a DIFFERENT DAX file's block
204 SAVE     "AN OUTPOST" -> memstr[0x7b2c]     -- <-- the block-36-origin path lands HERE
218 PRINTCLEAR "ONCE THE COMPANY IS ORGANIZED YOU BEGIN THE "
254 PRINT    "JOURNEY TO THE OUTPOST. THE PARTY TRAVELS THROUGH "
295 PRINT    "SOLAMNIA AND ARRIVES NEAR THROTL."
323 GOSUB    0x8dae                  -- continue-prompt again
327-339  SAVE #1->0x4be6, #0->0x4cf7
339 CLEAR_BOX
340 NEWECL   #17
```

**This resolves a real structural fact, not just fills in bytes: the "arrived from block
36" branch (offset 108's `GOTO 204`) does *not* go anywhere near the MAYA/`NEWECL 64`
content.** That content is reached only by the *other* path -- last-block==17 (i.e. a
*returning* player who was already at block 17, the outpost) **and** a quest-progress flag
(`0x4c8b==1`). The block-36-origin path instead lands directly on the "AN OUTPOST... THE
PARTY TRAVELS THROUGH SOLAMNIA AND ARRIVES NEAR THROTL" journey narration, then
`NEWECL 17` -- i.e., **fresh-from-the-opening-narration players are routed straight into
block 17 (the outpost/Throtl town script), never through the MAYA/area-2-transition
branch.** `initial_entry` contains **zero `ADD_NPC` (0x36) and zero `COMBAT` (0x24)**
anywhere on either path.

### 7.4 A genuinely new side-finding: `NEWECL 64` is a cross-file (cross-area) jump

Block 16's `NEWECL #64` doesn't target anything in `ECL1.DAX` -- its own file only contains
blocks `16, 17, 18, 32, 33, 34, 36` (verified: `ECL1.DAX`'s TOC has exactly 7 entries, not
63 -- see the honesty note in 7.6). Checking the sibling files:

| file | block IDs present |
|---|---|
| `ECL1.DAX` | 16, 17, 18, 32, 33, 34, 36 |
| `ECL2.DAX` | 48, 49, 50, 57, **64**, 66, 67, 68 |
| `ECL3.DAX` | 80, 81, 82, 96, 97, 98, 99 |

Block 64 is real -- it lives in `ECL2.DAX`. The three files' block-ID ranges are cleanly
non-overlapping (area 1 roughly 16-36, area 2 roughly 48-68, area 3 roughly 80-99), so
`NEWECL`'s target ID alone is enough for the resident loader to know which
`ECL{n}.DAX`/`GEO{n}.DAX`/etc. set to (re)load -- **(inferred)** from the clean numeric
partitioning, not independently confirmed against `GAME.OVR`'s loader code this session
(out of scope; a natural follow-up for whoever eventually chases `game_area`-switch code
directly). This means **block 18's** own content (7.5-adjacent context) -- a small
144-byte dispatcher whose *entire* body is three `COMPARE->NEWECL {80|97|68}` triples
with `SAVE #{5|6|4}->0x7f12` beforehand -- is CoK's "where do you want to travel"
area-gateway script, and block 16's `NEWECL 64` (MAYA path) is the same kind of
area-boundary transition, just triggered narratively instead of via a menu. None of this
is demo-specific; it's the ordinary three-continent structure already known from §2.1's
per-area file table.

### 7.5 Census: every `ADD_NPC` and `COMBAT` in all of `ECL1.DAX`, with context

**`ADD_NPC` (0x36): 3 total, all in block 32's `search_location` entry, all player-choice-gated:**

```
[block 32 search_location, offset 3152] PRINTCLEAR "DO YOU ALLOW HIM TO JOIN YOUR PARTY?"
  ... GOSUB (menu prompt) ...
  COMPARE 0x7f79,#0 ; IF_NE ; GOTO -> (skip if declined)
  PRINTCLEAR "THE KENDER SHRUGS AND LEAVES."          -- decline branch
  ADD_NPC #15, #100                                    -- accept branch: recruit creature-id 15, control_morale=100
```
The other two (`#59,#100` at offset 3625; `#34,#100` at offset 4258) are the same
"you meet a wandering NPC while searching, choose to recruit or not" pattern at other
locations in block 32. **None reference Sir Karl Gaardsen or anything from block 36's
text**, and none are reachable from block 16's `initial_entry` at all (block 32 isn't a
`NEWECL` target anywhere on the block-36->16->17 chain traced in 7.3 -- it's reached via
other, unexamined paths, most likely direct GEO-map cell scripting rather than the
narrative chain).

**`COMBAT` (0x24): 48 total across blocks 16/17/32/33/34 (none in 18 or 36), and every
single one sits inside a `search_location` or `camp_interrupted` header entry** (the
generic "check for a random/ambush encounter when searching a room or when camp is
disturbed" hook that every one of these per-area scripts has) **-- except one shared
subroutine in block 17** (reachable from `initial_entry`, `vm_run_1`, *and*
`search_location` alike, because it's a menu handler those three slots all fall into) that
turned out, on reading its surrounding text, to be an **optional "rob the outpost
depository" event**:

```
[block 17, offset ~1977] PRINTCLEAR "'WE WILL STORE MONEY FOR YOU. WE ONLY ACCEPT
                          MONEY IN LOTS OF 100 STEEL PIECES. THERE IS A PROCESSING
                          FEE OF 20 STEEL PIECES.'"
  ... GOSUB (menu: deposit/withdraw/attack) ...
  CLEARMONSTERS ; TREASURE ... ; COMBAT              -- one path: rob the tellers -> fight
```
This is bank-teller dialogue at the outpost, gated behind a player menu choice -- it cannot
fire on its own without a menu selection, so it is not a candidate for an *unattended*
attract-mode battle unless the demo's automation also drives ordinary in-game menus (a
mechanism this session found no evidence for one way or the other).

**Every one of block 16's own 6 `COMBAT` calls (§5-era list, now fully contextualized)
lives in `search_location`, which turned out to be a location-name string-comparison
dispatcher** (`COMPARE memstr[0x7b2c], str[...]"WILD"`, `"KERNEN"`, etc. -- `0x7b2c` is the
same variable block 16's `initial_entry` set to `"AN OUTPOST"` at offset 204) -- i.e., "if
the party's current wilderness-map location name matches X, run this encounter" -- the
standard Gold Box wilderness random-encounter table, not narrative content tied to block 36
or Sir Karl.

### 7.6 Answering (a) vs (b): new evidence meaningfully favors (b), still not fully dispositive

**What this session adds, stated precisely:**
- Sir Karl Gaardsen is named **only in `PRINT` text** in block 36 (already known from
  §2.4) -- this session confirms block 36's *entire* bytecode (all 5 header slots, not just
  `initial_entry`) contains **zero `ADD_NPC` calls**, so there is still no decoded evidence
  he is ever mechanically added to `gbl.TeamList`/an equivalent by this script.
- The specific branch inside block 16 keyed on "did we arrive from block 36" (§2.4's
  original find, now traced to its actual destination in 7.3) leads to **plain narrative
  text ("AN OUTPOST... ARRIVES NEAR THROTL") and a `NEWECL 17` area transition -- zero
  `ADD_NPC`, zero `COMBAT`, on that specific path.**
- The *only* `ADD_NPC`/`COMBAT` content anywhere in `ECL1.DAX` is either (i) player-menu-
  gated (recruit-or-decline in block 32; deposit/withdraw/rob in block 17) or (ii) the
  generic per-location wilderness/camp random-encounter check (blocks 16/17/32/33/34's
  `search_location`/`camp_interrupted`) that exists identically in every one of these
  scripts regardless of how the party got there. None of it reads as bespoke "scripted for
  an idle attract-mode audience" content -- it's the same machinery normal players use.

**Reading (b) -- "block 36 is CoK's ordinary new-game opening, not a demo-specific
constant" -- is now the better-supported reading of the two.** If block 36->16 *were* the
literal `inDemo` entry, its actual content (as now fully decoded) would show an unattended
audience nothing but story text, a picture, and a location transition -- no combat, no
temporary party member added by script. That's a weak match for "a scripted walkthrough
ending in automatic combat" (the user's memory this whole investigation set out to
verify) -- whereas it's a *very* good match for "the same opening every new player sees."

**This is still not fully dispositive**, and should not be overclaimed:
1. CoK's own literal `inDemo`-entry `EclBlockId` constant remains genuinely **UNLOCATED**
   (§6's dead end stands; this session did not attempt to relocate it, per this round's
   explicit instruction not to re-spend effort on the 4 already-rejected xref offsets).
2. It remains possible the demo *is* block 36->16's normal-opening content, deliberately
   reused as-is (no bespoke demo script needed) with the "automatic combat" part of the
   user's memory instead coming from `game_speed_var=9`-paced *generic* exploration once
   `NEWECL 17`'s outpost is reached and the party starts naturally triggering
   `search_location`'s standard wandering-encounter table while an AI walks the map -- i.e.
   "the demo IS the normal opening, watched happen slowly and unattended, and any combat in
   it is genuinely the same wandering-monster system every player deals with, not a special
   scripted fight." This reading is consistent with *all* of §1-§7's evidence and would mean
   (a)/(b) are less "either/or" than originally framed -- block 36 could be **both** the
   normal opening **and** (trivially, by reuse) the demo entry, with no dedicated
   demo-authored content anywhere. Static analysis alone cannot distinguish "36 is the demo
   entry re-showing the normal opening" from "36 is just the normal opening and the demo
   uses a different, still-unlocated block" -- both remain live possibilities.
3. **New lead for a future session, not chased here (out of scope for this round's static
   budget):** CoK ships a pregenerated party in `Champions of Krynn/SAVE/`
   (`CHRDATA1.SAV`...`CHRDATA6.SAV`, `SAVGAMA.DAT`) -- the same kind of shipped pregen-party
   file already used as a chargen-skip shortcut in the DoK research track (see
   `docs/engine/research/dok-natural-route.md`, out of this session's scope to touch). Since
   `sub_29758` (§2.2) never calls `startGameMenu()` when `inDemo==true`, and no `ADD_NPC` in
   `ECL1.DAX` is reachable from the block-36->16 chain, **a demo party can only be TeamList
   entries that already existed before `RunEclVm` runs** (i.e., loaded some other way,
   `ADD_NPC` from a not-yet-found block, or simply an empty party). If the demo does show a
   populated party, this shipped pregen-save file -- not ECL bytecode -- is the most likely
   source; worth checking whether `sub_29758`/its CoK analogue loads it when `inDemo` is set,
   the next time a static session has budget for this thread.
4. Minor correction recorded in passing: §2.1's file-size table lists `ECL1.DAX` as having
   "63" DAX entries; the container's actual entry count is **7** (`entry_count*9=63` is the
   TOC *byte* length, not the entry count -- `tools/dax_inspect.py`'s printed
   `entry_count=63` field name is itself a mislabel of that byte length). All 7 of ECL1's
   entries are the 7 script blocks already named; there are no other (picture/tile/etc.)
   entries in this particular file. Doesn't affect any conclusion above; noted so a future
   reader isn't confused by the discrepancy between `dax_inspect.py`'s field name and the
   real TOC.

**Bottom line:** no `ADD_NPC`/`COMBAT` evidence was found on the block-36->16 path
whatsoever, in either direction from that branch. This is a genuine, quotable negative
result that shifts confidence toward (b) (or the "(a) and (b) aren't mutually exclusive"
reading in point 2 above), but the literal `inDemo` constant is still unlocated, so neither
reading is proven. Per the same standard used throughout this doc: **UNLOCATED beats
invention** -- this session does not force a conclusion past what the decoded bytes show.
